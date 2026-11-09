import express from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireOwnerAuth } from '../middleware/auth.ts';
import { adminDb, logFirestoreFallback } from '../services/firebaseAdmin.ts';
import { MODEL_REGISTRY } from '../registry/models.ts';
import {
  calculateJobCost,
  evaluateCostGuard,
} from '../services/costGuard.ts';
import * as falService from '../services/fal.ts';
import * as mediaProcessing from '../services/mediaProcessing.ts';
import { inMemoryVoices } from './voices.ts';

export const jobsRouter = express.Router();

// Zod schema for job creation request
const createJobSchema = z.object({
  tool: z.enum([
    'image.create',
    'image.edit',
    'image.replaceBackground',
    'image.removeBackground',
    'image.upscale',
    'image.resize',
    'image.clean',
    'video.create',
    'video.edit',
    'video.clean',
    'video.upscale',
    'video.trim',
    'video.reformat',
    'audio.tts',
    'audio.dialogue',
    'audio.sfx',
    'audio.music',
    'audio.voice_change',
    'audio.dub',
    'audio.stt',
    'audio.lipsync',
    'audio.mix',
    'audio.burn_captions',
    'audio.voiceClone',
    'audio.voiceDesign',
  ]),
  modelKey: z.string().min(1),
  input: z.record(z.string(), z.any()),
  projectId: z.string().optional(),
  confirmedRights: z.boolean().optional(),
});

// In-memory fallback if Firestore credentials are not configured in local environment
const inMemoryJobs = new Map<string, any>();
const inMemoryUsage: any[] = [];
const inMemoryAssets = new Map<string, any>();
const reconcileLocks = new Map<string, Promise<any>>();

// Rate limiter: Read RATE_LIMIT_PER_HOUR from environment. Default 300. Value 0 or empty means no limit.
const userJobTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const envRateLimit = process.env.RATE_LIMIT_PER_HOUR;
const RATE_LIMIT_PER_HOUR =
  envRateLimit === '0' || envRateLimit === ''
    ? 0
    : envRateLimit
      ? parseInt(envRateLimit, 10)
      : 300;

function checkRateLimit(uid: string): { allowed: boolean; retryAfterSec?: number } {
  if (RATE_LIMIT_PER_HOUR === 0 || isNaN(RATE_LIMIT_PER_HOUR)) {
    return { allowed: true };
  }
  const now = Date.now();
  const timestamps = (userJobTimestamps.get(uid) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_PER_HOUR) {
    const oldestInWindow = timestamps[0];
    const retryAfterSec = Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  timestamps.push(now);
  userJobTimestamps.set(uid, timestamps);
  return { allowed: true };
}

/**
 * Validates that input media URLs only point to fal CDN or verified studio storage (SSRF prevention).
 */
export function isAllowedMediaUrl(urlString: string): boolean {
  if (typeof urlString !== 'string' || !urlString.trim()) return false;
  const str = urlString.trim();

  // Allow relative URLs served by our studio (e.g. /uploads/...)
  if (str.startsWith('/')) return true;
  // Allow data:image/... for canvas masks or temporary uploads
  if (str.startsWith('data:image/')) return true;

  try {
    const parsed = new URL(str);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();

    // Explicitly reject cloud metadata IP and local network ranges
    if (
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host === '10.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.')
    ) {
      return false;
    }

    // Whitelist fal CDN and Google Cloud / Firebase Storage
    const isFalCdn =
      host === 'fal.media' ||
      host.endsWith('.fal.media') ||
      host === 'fal.ai' ||
      host.endsWith('.fal.ai');
    const isGoogleStorage =
      host === 'storage.googleapis.com' ||
      host === 'firebasestorage.googleapis.com';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';

    return isFalCdn || isGoogleStorage || isLocalhost;
  } catch {
    return false;
  }
}

/**
 * Formats model provider error messages into user-friendly studio messages
 * without leaking raw stack traces, API keys, or internal network details.
 */
function formatFriendlyErrorMessage(err: any): string {
  const msg = (err?.message || (typeof err === 'string' ? err : 'Job processing failed')).toLowerCase();
  if (
    msg.includes('balance') ||
    msg.includes('locked') ||
    msg.includes('exhausted') ||
    msg.includes('credit') ||
    msg.includes('payment') ||
    msg.includes('insufficient funds') ||
    msg.includes('out of credits')
  ) {
    return 'fal.ai balance is empty. Add credit at fal.ai > Billing, then try again.';
  }
  if (
    msg.includes('safety') ||
    msg.includes('policy') ||
    msg.includes('nsfw') ||
    (msg.includes('content') && msg.includes('violation'))
  ) {
    return 'The generation was flagged by the model content safety filter. Please adjust your prompt or input media.';
  }
  if (msg.includes('fal_key') || msg.includes('unauthorized') || msg.includes('401')) {
    return 'FAL_KEY secret is not configured or unauthorized. Please check the AI Studio Secrets panel.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'The generation request timed out. Please retry.';
  }
  return err?.message ? String(err.message).slice(0, 200) : 'Generation failed on fal.ai';
}

/**
 * Normalizes input for a model based on registry constraints, aspect ratios, image sizes, and resolutions.
 * Runs before price calculation and before mapInputToFal.
 */
export function normalizeInputForModel(
  model: any,
  input: Record<string, any>
): Record<string, any> {
  const norm = { ...input };
  const modelResolutions: string[] = model.resolutions || [];
  const modelFormats: string[] = model.formats || [];

  // 1. Output format: never use input.format as output_format. Allow only png, jpeg, webp
  if (norm.output_format) {
    const fmt = String(norm.output_format).toLowerCase().trim();
    if (fmt === 'png' || fmt === 'jpeg' || fmt === 'jpg' || fmt === 'webp') {
      norm.output_format = fmt === 'jpg' ? 'jpeg' : fmt;
    } else {
      delete norm.output_format;
    }
  }

  // 2. Aspect ratio = input.aspect_ratio or, if missing, input.format.
  // "Auto", "auto" or an invalid value means: do not send it (use the model default).
  const rawAspect = norm.aspect_ratio || norm.format;
  const isAutoAspect =
    !rawAspect ||
    rawAspect.toLowerCase() === 'auto' ||
    rawAspect.toLowerCase() === 'auto_2k' ||
    rawAspect.toLowerCase() === 'auto_4k';

  // 3. Image models
  if (model.tool && model.tool.startsWith('image.')) {
    const isSeedream = model.endpoint?.includes('seedream');
    const isNanoBanana = model.endpoint?.includes('nano-banana');

    if (isNanoBanana) {
      // Nano Banana family: accepts aspect_ratio directly if in allowed values
      if (!isAutoAspect && (modelResolutions.includes(rawAspect) || ['1:1', '4:3', '3:4', '16:9', '9:16'].includes(rawAspect))) {
        norm.aspect_ratio = rawAspect;
      } else {
        delete norm.aspect_ratio;
      }

      // Map tier: 720p and 1080p -> 1K, 2K -> 2K, 4K -> 4K, anything else (for example auto_2K) -> 1K
      const resRaw = String(norm.resolution || '').toLowerCase();
      let tier = '1K';
      if (resRaw.includes('4k')) {
        tier = '4K';
      } else if (resRaw.includes('2k')) {
        tier = '2K';
      } else if (resRaw.includes('720') || resRaw.includes('1080') || resRaw.includes('1k')) {
        tier = '1K';
      } else {
        tier = '1K';
      }

      if (modelResolutions.includes(tier)) {
        norm.resolution = tier;
      } else if (modelResolutions.length > 0) {
        norm.resolution = modelResolutions[0];
      }
    } else {
      // Models using image_size presets
      const aspectMap: Record<string, string> = {
        '1:1': 'square_hd',
        '4:3': 'landscape_4_3',
        '3:4': 'portrait_4_3',
        '4:5': 'portrait_4_3',
        '16:9': 'landscape_16_9',
        '9:16': 'portrait_16_9',
      };

      if (isSeedream) {
        const tier = String(norm.resolution || '').toUpperCase().includes('4K') ? '4K' : '2K';
        if (isAutoAspect) {
          norm.image_size = tier === '4K' ? 'auto_4K' : 'auto_2K';
        } else {
          const mapped = aspectMap[rawAspect];
          if (mapped && modelResolutions.includes(mapped)) {
            norm.image_size = mapped;
          } else {
            norm.image_size = tier === '4K' ? 'auto_4K' : 'auto_2K';
          }
        }
      } else if (modelResolutions.length > 0) {
        if (!isAutoAspect && aspectMap[rawAspect] && modelResolutions.includes(aspectMap[rawAspect])) {
          norm.image_size = aspectMap[rawAspect];
        } else {
          norm.image_size = modelResolutions[0];
        }
      }
    }
  }

  // 4. Video models
  if (model.tool && model.tool.startsWith('video.')) {
    // Video aspect_ratio: send lowercase "auto" only if the model supports auto, otherwise send 16:9
    if (isAutoAspect) {
      const supportsAuto =
        modelResolutions.some((r) => r.toLowerCase() === 'auto') ||
        modelFormats.some((f) => f.toLowerCase() === 'auto');
      if (supportsAuto) {
        norm.aspect_ratio = 'auto';
      } else {
        norm.aspect_ratio = '16:9';
      }
    } else {
      norm.aspect_ratio = rawAspect;
    }

    // Video resolution: pick closest allowed value from model.resolutions, case-insensitive match,
    // and send it with the model's own casing (MiniMax capitals like 768P).
    if (modelResolutions.length > 0) {
      const userRes = String(norm.resolution || '720p').toLowerCase().trim();
      const exactMatch = modelResolutions.find((r) => r.toLowerCase() === userRes);
      if (exactMatch) {
        norm.resolution = exactMatch;
      } else {
        const partialMatch = modelResolutions.find((r) => {
          const rLow = r.toLowerCase();
          if (userRes.includes('480') && rLow.includes('480')) return true;
          if (userRes.includes('720') && (rLow.includes('720') || rLow.includes('768'))) return true;
          if (userRes.includes('1080') && rLow.includes('1080')) return true;
          if (userRes.includes('4k') && (rLow.includes('4k') || rLow.includes('2160'))) return true;
          return false;
        });
        norm.resolution = partialMatch || modelResolutions[0];
      }
    } else {
      // Model has no resolution parameter, do not send one
      delete norm.resolution;
    }

    // Duration: clamp to model.maxDuration if provided
    if (norm.duration !== undefined) {
      const dur = typeof norm.duration === 'string' && norm.duration !== 'auto'
        ? parseInt(norm.duration, 10)
        : Number(norm.duration);
      if (!isNaN(dur) && dur > 0) {
        if (model.maxDuration) {
          norm.duration = Math.min(model.maxDuration, Math.max(1, dur));
        } else {
          norm.duration = Math.max(1, dur);
        }
      }
    }
  }

  return norm;
}

/**
 * Maps standard studio inputs to fal.ai endpoint schema
 */
function mapInputToFal(modelKey: string, endpoint: string, input: Record<string, any>, units: number) {
  // [1] MiniMax H3 Max - text to video
  if (endpoint === 'minimax/h3-max/text-to-video') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      duration: Number(input.duration || 5),
      resolution: input.resolution || '480P', // Draft default
      aspect_ratio: input.aspect_ratio || '16:9',
      prompt_expansion_mode: input.prompt_expansion_mode || 'balanced',
      enable_safety_checker: input.enable_safety_checker ?? true,
    };
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.target_audio_url) payload.target_audio_url = input.target_audio_url;
    if (input.sync_mode !== undefined) payload.sync_mode = input.sync_mode;
    return payload;
  }

  // [2] MiniMax H3 Max Turbo - text to video
  if (endpoint === 'minimax/h3-max-turbo/text-to-video') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      duration: Number(input.duration || 5),
      resolution: input.resolution || '480P', // Draft default
      aspect_ratio: input.aspect_ratio || '16:9',
      prompt_expansion_mode: input.prompt_expansion_mode || 'balanced',
    };
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.target_audio_url) payload.target_audio_url = input.target_audio_url;
    return payload;
  }

  // [3] MiniMax H3 Max Turbo - image to video (PARTIAL: do not send duration)
  if (endpoint === 'minimax/h3-max-turbo/image-to-video') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_url: input.image_url || input.imageUrl || input.start_image_url || input.startImageUrl,
      resolution: input.resolution || '480P',
      prompt_expansion_mode: input.prompt_expansion_mode || 'balanced',
    };
    if (input.end_image_url || input.endImageUrl) {
      payload.end_image_url = input.end_image_url || input.endImageUrl;
    }
    return payload;
  }

  // [4] MiniMax H3 Max - extend video
  if (endpoint === 'minimax/h3-max/extend-video') {
    const payload: Record<string, any> = {
      video_url: input.video_url || input.videoUrl,
      prompt: input.prompt,
      duration: Number(input.duration || 5),
      resolution: input.resolution || '768P',
      aspect_ratio: input.aspect_ratio || 'auto',
      output: input.output || 'extended',
      enable_prompt_expansion: input.enable_prompt_expansion ?? true,
    };
    if (input.reference_audio_urls) payload.reference_audio_urls = input.reference_audio_urls;
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [5] Kling 3.0 Pro - text to video (Draft default: duration 3, generate_audio false)
  if (endpoint === 'fal-ai/kling-video/v3/pro/text-to-video') {
    const payload: Record<string, any> = {
      duration: Number(input.duration || 3),
      aspect_ratio: input.aspect_ratio || '16:9',
      generate_audio: input.generate_audio ?? false,
      negative_prompt: input.negative_prompt || 'blur, distort, and low quality',
      cfg_scale: Number(input.cfg_scale ?? 0.5),
    };
    if (input.multi_prompt) {
      payload.multi_prompt = input.multi_prompt;
    } else {
      payload.prompt = input.prompt;
    }
    if (input.shot_type) payload.shot_type = input.shot_type;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [6] Kling 3.0 Standard - image to video
  if (endpoint === 'fal-ai/kling-video/v3/standard/image-to-video') {
    const payload: Record<string, any> = {
      start_image_url: input.start_image_url || input.startImageUrl || input.image_url || input.imageUrl,
      duration: Number(input.duration || 5),
      generate_audio: input.generate_audio ?? true,
      negative_prompt: input.negative_prompt || 'blur, distort, and low quality',
      cfg_scale: Number(input.cfg_scale ?? 0.5),
    };
    if (input.multi_prompt) {
      payload.multi_prompt = input.multi_prompt;
    } else {
      payload.prompt = input.prompt;
    }
    if (input.end_image_url || input.endImageUrl) {
      payload.end_image_url = input.end_image_url || input.endImageUrl;
    }
    if (input.shot_type) payload.shot_type = input.shot_type;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [7] Kling V3 Turbo Pro - image to video (PARTIAL: send only prompt, image_url, duration 5)
  if (endpoint === 'fal-ai/kling-video/v3/turbo/pro/image-to-video') {
    return {
      prompt: input.prompt,
      image_url: input.image_url || input.imageUrl || input.start_image_url || input.startImageUrl,
      duration: 5,
    };
  }

  // [8] Kling 2.5 Turbo Pro - image to video
  if (endpoint === 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_url: input.image_url || input.imageUrl || input.start_image_url || input.startImageUrl,
      duration: String(input.duration === 10 || input.duration === '10' ? '10' : '5'),
      negative_prompt: input.negative_prompt || 'blur, distort, and low quality',
      cfg_scale: Number(input.cfg_scale ?? 0.5),
    };
    if (input.tail_image_url || input.end_image_url || input.endImageUrl) {
      payload.tail_image_url = input.tail_image_url || input.end_image_url || input.endImageUrl;
    }
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [9] Wan 3.0 - text to video (Draft default: 480p)
  if (endpoint === 'alibaba/wan-3.0/text-to-video') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      resolution: input.resolution || '480p',
      aspect_ratio: input.aspect_ratio || 'adaptive',
      duration: Number(input.duration || 5),
      audio: input.audio ?? true,
      enable_prompt_expansion: input.enable_prompt_expansion ?? true,
    };
    if (input.enable_thinking !== undefined) payload.enable_thinking = input.enable_thinking;
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [10] FLUX 3 - image to video (Draft default: 720p, duration 5)
  if (endpoint === 'blackforestlabs/flux-3/image-to-video') {
    return {
      prompt: input.prompt,
      image_url: input.image_url || input.imageUrl || input.start_image_url || input.startImageUrl,
      aspect_ratio: input.aspect_ratio || 'auto',
      resolution: input.resolution || '720p',
      duration: input.duration ? (typeof input.duration === 'string' && input.duration !== 'auto' ? Number(input.duration) : input.duration) : 5,
      generate_audio: input.generate_audio ?? true,
      safety_tolerance: Number(input.safety_tolerance ?? 2),
    };
  }

  // [11] LTX 2.5 Fast - image to video (PARTIAL: prompt, start_image_url, end_image_url)
  if (endpoint === 'lightricks/ltx-2.5/image-to-video/fast') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      start_image_url: input.start_image_url || input.startImageUrl || input.image_url || input.imageUrl,
    };
    if (input.end_image_url || input.endImageUrl) {
      payload.end_image_url = input.end_image_url || input.endImageUrl;
    }
    return payload;
  }

  // [12] PixVerse V6 - image to video (Draft default: 360p, duration 3)
  if (endpoint === 'fal-ai/pixverse/v6/image-to-video') {
    const payload: Record<string, any> = {
      prompt: (input.prompt || '').slice(0, 2048),
      image_url: input.image_url || input.imageUrl || input.start_image_url || input.startImageUrl,
      resolution: input.resolution || '360p',
      duration: Number(input.duration || 3),
    };
    if (input.negative_prompt) payload.negative_prompt = input.negative_prompt;
    if (input.style) payload.style = input.style;
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.generate_audio_switch !== undefined) payload.generate_audio_switch = input.generate_audio_switch;
    if (input.generate_multi_clip_switch !== undefined) payload.generate_multi_clip_switch = input.generate_multi_clip_switch;
    if (input.thinking_type) payload.thinking_type = input.thinking_type;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [13] Seedance 2.0 Fast - text to video (PARTIAL)
  if (endpoint === 'bytedance/seedance-2.0/fast/text-to-video') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      resolution: input.resolution || '720p',
      duration: String(input.duration || '5'),
      aspect_ratio: input.aspect_ratio || '16:9',
      generate_audio: input.generate_audio ?? true,
    };
    if (input.end_user_id) payload.end_user_id = input.end_user_id;
    return payload;
  }

  // [14] Kling O3 Edit Video Pro (PARTIAL)
  if (endpoint === 'fal-ai/kling-video/o3/pro/video-to-video/edit') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      video_url: input.video_url || input.videoUrl,
    };
    if (Array.isArray(input.image_urls) && input.image_urls.length > 0) {
      payload.image_urls = input.image_urls;
    }
    if (Array.isArray(input.elements) && input.elements.length > 0) {
      payload.elements = input.elements;
    }
    return payload;
  }

  // [15] Grok Imagine Edit Video
  if (endpoint === 'xai/grok-imagine-video/edit-video') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      video_url: input.video_url || input.videoUrl,
      resolution: input.resolution || 'auto',
    };
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [16] Video Upscaler
  if (endpoint === 'fal-ai/video-upscaler') {
    return {
      video_url: input.video_url || input.videoUrl,
      scale: Number(input.scale || 2),
    };
  }

  // [17] Seedream 4.5
  if (endpoint === 'fal-ai/bytedance/seedream/v4.5/text-to-image') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_size: input.image_size || input.resolution || 'auto_2K',
      num_images: units,
      max_images: units,
    };
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [18] Seedream 4.0 Edit
  if (endpoint === 'fal-ai/bytedance/seedream/v4/edit') {
    const urls = input.image_urls || (input.image_url ? [input.image_url] : input.imageUrl ? [input.imageUrl] : []);
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_urls: urls,
      image_size: input.image_size || 'auto_2K',
    };
    if (input.num_images !== undefined) payload.num_images = input.num_images;
    if (input.max_images !== undefined) payload.max_images = input.max_images;
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enhance_prompt_mode) payload.enhance_prompt_mode = input.enhance_prompt_mode;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [19] Nano Banana 2 (create: prompt, num_images, aspect_ratio, resolution, output_format, seed)
  if (endpoint === 'fal-ai/nano-banana-2') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      num_images: units,
      aspect_ratio: input.aspect_ratio || 'auto',
      resolution: input.resolution || '1K',
      output_format: (input.output_format || 'jpeg').toLowerCase(),
    };
    if (input.seed !== undefined) payload.seed = input.seed;
    return payload;
  }

  // [20] Nano Banana 2 Edit
  if (endpoint === 'fal-ai/nano-banana-2/edit') {
    const urls = input.image_urls || (input.image_url ? [input.image_url] : input.imageUrl ? [input.imageUrl] : []);
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_urls: urls,
      num_images: units,
      aspect_ratio: input.aspect_ratio || 'auto',
      resolution: input.resolution || '1K',
      output_format: (input.output_format || 'jpeg').toLowerCase(),
      thinking_level: input.thinking_level || 'minimal',
      safety_tolerance: String(input.safety_tolerance || '2'),
    };
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.system_prompt) payload.system_prompt = input.system_prompt;
    if (input.enable_web_search !== undefined) payload.enable_web_search = input.enable_web_search;
    if (input.enable_image_search !== undefined) payload.enable_image_search = input.enable_image_search;
    if (input.limit_generations !== undefined) payload.limit_generations = input.limit_generations;
    return payload;
  }

  // [21] Nano Banana Pro Edit
  if (endpoint === 'fal-ai/nano-banana-pro/edit') {
    const urls = input.image_urls || (input.image_url ? [input.image_url] : input.imageUrl ? [input.imageUrl] : []);
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_urls: urls,
      num_images: units,
      aspect_ratio: input.aspect_ratio || 'auto',
      resolution: input.resolution || '1K',
      output_format: (input.output_format || 'jpeg').toLowerCase(),
      safety_tolerance: String(input.safety_tolerance || '2'),
    };
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.system_prompt) payload.system_prompt = input.system_prompt;
    if (input.enable_web_search !== undefined) payload.enable_web_search = input.enable_web_search;
    if (input.limit_generations !== undefined) payload.limit_generations = input.limit_generations;
    return payload;
  }

  // ==================== VOICE MODELS 2 (MiniMax, Gemini, Inworld, xAI, Chatterbox, Index TTS) ====================
  // [Voice A] MiniMax Speech 2.8 HD
  if (endpoint === 'fal-ai/minimax/speech-2.8-hd') {
    const payload: Record<string, any> = {
      prompt: input.prompt || input.text || '',
      voice_id: input.voice_id || input.voice || 'Wise_Counselor',
      speed: Number(input.speed ?? 1.0),
      emotion: input.emotion || 'neutral',
    };
    if (input.vol !== undefined) payload.vol = Number(input.vol);
    if (input.pitch !== undefined) payload.pitch = Number(input.pitch);
    return payload;
  }

  // [Voice B] Gemini 3.1 Flash TTS
  if (endpoint === 'fal-ai/gemini-3.1-flash-tts') {
    const payload: Record<string, any> = {
      prompt: input.prompt || input.text || '',
      voice: input.voice || 'Kore',
    };
    if (input.style_instructions) payload.style_instructions = input.style_instructions;
    if (input.temperature !== undefined) payload.temperature = Number(input.temperature);
    if (input.speakers) payload.speakers = input.speakers;
    return payload;
  }

  // [Voice C] Inworld TTS-1.5 Max (Max 2,000 characters)
  if (endpoint === 'fal-ai/inworld-tts') {
    const rawText = input.text || input.prompt || '';
    const textChunk = rawText.length > 2000 ? rawText.slice(0, 2000) : rawText;
    const payload: Record<string, any> = {
      text: textChunk,
      voice: input.voice || 'Craig (en)',
      sample_rate_hertz: Number(input.sample_rate_hertz || 48000),
      enable_safety_checker: input.enable_safety_checker ?? true,
    };
    return payload;
  }

  // [Voice D] xAI TTS v1 (Max 15,000 characters)
  if (endpoint === 'xai/tts/v1') {
    const rawText = input.text || input.prompt || '';
    const textChunk = rawText.length > 15000 ? rawText.slice(0, 15000) : rawText;
    const payload: Record<string, any> = {
      text: textChunk,
      voice: input.voice || 'eve',
    };
    if (input.language && input.language !== 'auto') payload.language = input.language;
    return payload;
  }

  // [Voice E] Chatterbox TTS (Clone from clip)
  if (endpoint === 'fal-ai/chatterbox/text-to-speech') {
    const payload: Record<string, any> = {
      text: input.text || input.prompt || '',
      voice: input.voice || 'english',
      exaggeration: Number(input.exaggeration ?? 0.5),
    };
    if (input.audio_url || input.voice_url || input.audioUrl) {
      payload.audio_url = input.audio_url || input.voice_url || input.audioUrl;
    }
    if (input.custom_audio_language) {
      payload.custom_audio_language = input.custom_audio_language;
    }
    return payload;
  }

  // [Voice F] Index TTS 2.0 (Emotion control)
  if (endpoint === 'fal-ai/index-tts-2/text-to-speech') {
    const payload: Record<string, any> = {
      prompt: input.prompt || input.text || '',
      audio_url: input.audio_url || input.voice_url || input.audioUrl || '',
    };
    if (input.emotions) {
      payload.emotions = input.emotions;
    }
    return payload;
  }

  // [Voice G] MiniMax Voice Clone
  if (endpoint === 'fal-ai/minimax/voice-clone') {
    const payload: Record<string, any> = {
      audio_url: input.audio_url || input.voice_url || input.audioUrl,
    };
    if (input.voice_id || input.voiceId) {
      payload.voice_id = input.voice_id || input.voiceId;
    }
    return payload;
  }

  // [Voice H] MiniMax Voice Design
  if (endpoint === 'fal-ai/minimax/voice-design') {
    const payload: Record<string, any> = {
      prompt: input.prompt || input.description || '',
      preview_text: input.preview_text || input.text || 'Welcome to this custom designed voice.',
    };
    if (input.voice_id || input.voiceId) {
      payload.voice_id = input.voice_id || input.voiceId;
    }
    return payload;
  }

  // [22] GPT Image 2.5 Flare & [23] GPT Image 2.5 Sunburst (Draft quality = low)
  if (endpoint.includes('gpt-image-2.5') && endpoint.includes('text-to-image')) {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_size: input.image_size || input.resolution || 'landscape_4_3',
      quality: input.quality || 'low',
      background: input.background || 'auto',
      num_images: units,
      output_format: (input.output_format || 'png').toLowerCase(),
    };
    if (input.output_compression !== undefined) payload.output_compression = input.output_compression;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [24] GPT Image 2.5 Sunburst Edit (Default quality = medium)
  if (endpoint === 'openai/gpt-image-2.5/sunburst/edit') {
    const urls = input.image_urls || (input.image_url ? [input.image_url] : input.imageUrl ? [input.imageUrl] : []);
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_urls: urls,
      image_size: input.image_size || 'auto',
      quality: input.quality || 'medium',
      background: input.background || 'auto',
      num_images: units,
      output_format: (input.output_format || 'png').toLowerCase(),
    };
    if (input.mask_url || input.maskUrl) payload.mask_url = input.mask_url || input.maskUrl;
    if (input.output_compression !== undefined) payload.output_compression = input.output_compression;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [25] FLUX.2 Pro & [26] FLUX.2 Max
  if (endpoint === 'fal-ai/flux-2-pro' || endpoint === 'fal-ai/flux-2-max') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_size: input.image_size || input.resolution || 'landscape_4_3',
      safety_tolerance: String(input.safety_tolerance || '2'),
      output_format: (input.output_format || 'jpeg').toLowerCase(),
    };
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    if (input.sync_mode !== undefined) payload.sync_mode = input.sync_mode;
    return payload;
  }

  // [27] FLUX.1 schnell
  if (endpoint === 'fal-ai/flux/schnell') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_size: input.image_size || input.resolution || 'landscape_4_3',
      num_inference_steps: Number(input.num_inference_steps || 4),
      guidance_scale: Number(input.guidance_scale || 3.5),
      num_images: units,
      output_format: (input.output_format || 'jpeg').toLowerCase(),
      acceleration: input.acceleration || 'regular',
    };
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [28] Z-Image Turbo
  if (endpoint === 'fal-ai/z-image/turbo') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_size: input.image_size || input.resolution || 'landscape_4_3',
      num_inference_steps: Number(input.num_inference_steps || 8),
      num_images: units,
      output_format: (input.output_format || 'jpeg').toLowerCase(),
      acceleration: input.acceleration || 'regular',
      enable_prompt_expansion: Boolean(input.enable_prompt_expansion),
    };
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [29] Krea 3
  if (endpoint === 'krea/v3/text-to-image') {
    const payload: Record<string, any> = {
      prompt: input.prompt,
      model: input.model || 'berry',
      image_size: input.image_size || input.resolution || 'auto',
      reasoning_level: input.reasoning_level || 'medium',
      output_format: (input.output_format || 'jpeg').toLowerCase(),
    };
    if (input.negative_prompt && payload.model === 'berry') payload.negative_prompt = input.negative_prompt;
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [30] Qwen Image 3 Edit
  if (endpoint === 'alibaba/qwen-image-3/edit') {
    const urls = input.image_urls || (input.image_url ? [input.image_url] : input.imageUrl ? [input.imageUrl] : []);
    const payload: Record<string, any> = {
      prompt: (input.prompt || '').slice(0, 5000),
      image_urls: urls.slice(0, 3),
      image_size: input.image_size || 'landscape_4_3',
      num_images: units,
      output_format: (input.output_format || 'jpeg').toLowerCase(),
    };
    if (input.negative_prompt) payload.negative_prompt = input.negative_prompt;
    if (input.enable_prompt_expansion !== undefined) payload.enable_prompt_expansion = input.enable_prompt_expansion;
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [31] FLUX 3 Image Edit (PARTIAL: prompt, image_urls)
  if (endpoint === 'blackforestlabs/flux-3/edit-image') {
    const urls = input.image_urls || (input.image_url ? [input.image_url] : input.imageUrl ? [input.imageUrl] : []);
    return {
      prompt: input.prompt,
      image_urls: urls,
    };
  }

  // [32] Grok Imagine Edit
  if (endpoint === 'xai/grok-imagine-image/edit') {
    const urls = input.image_urls || (input.image_url ? [input.image_url] : input.imageUrl ? [input.imageUrl] : []);
    const payload: Record<string, any> = {
      prompt: input.prompt,
      image_urls: urls.slice(0, 3),
      num_images: units,
      aspect_ratio: input.aspect_ratio || 'auto',
      resolution: input.resolution || '1k',
      output_format: (input.output_format || 'jpeg').toLowerCase(),
    };
    if (input.enable_safety_checker !== undefined) payload.enable_safety_checker = input.enable_safety_checker;
    return payload;
  }

  // [33] Bria Fibo 2 Edit
  if (endpoint === 'bria/fibo-2/edit') {
    const urls = input.image_urls || (input.image_url ? [input.image_url] : input.imageUrl ? [input.imageUrl] : []);
    const payload: Record<string, any> = {
      image_urls: urls.slice(0, 4),
      instruction: input.instruction || input.prompt,
    };
    if (input.mask_url || input.maskUrl) payload.mask_url = input.mask_url || input.maskUrl;
    if (input.aspect_ratio) payload.aspect_ratio = input.aspect_ratio;
    if (input.seed !== undefined) payload.seed = input.seed;
    return payload;
  }

  // [35] Bria guided remove background
  if (endpoint === 'bria/guided-remove-background') {
    const payload: Record<string, any> = {
      image_url: input.image_url || input.imageUrl,
    };
    if (input.prompt) payload.prompt = input.prompt;
    if (input.autocrop !== undefined) payload.autocrop = Boolean(input.autocrop);
    if (input.sync_mode !== undefined) payload.sync_mode = input.sync_mode;
    return payload;
  }

  // [36] Topaz Upscale Image (generative)
  if (endpoint === 'topaz/upscale/image/generative') {
    const payload: Record<string, any> = {
      image_url: input.image_url || input.imageUrl,
      model: input.model || 'Wonder 3',
      upscale_factor: Number(input.upscale_factor || input.scale || 2),
      output_format: (input.output_format || 'jpeg').toLowerCase(),
      face_enhancement: input.face_enhancement ?? true,
      face_enhancement_strength: Number(input.face_enhancement_strength ?? 0.8),
      subject_detection: input.subject_detection || 'All',
      crop_to_fill: Boolean(input.crop_to_fill),
      enable_safety_checker: input.enable_safety_checker ?? true,
    };
    if (input.face_enhancement_creativity !== undefined) {
      payload.face_enhancement_creativity = Number(input.face_enhancement_creativity);
    }
    return payload;
  }

  // [37] Recraft V4 Pro (PARTIAL: prompt only)
  if (endpoint === 'fal-ai/recraft/v4/pro/text-to-image') {
    return {
      prompt: input.prompt,
    };
  }

  // FLUX.1 Kontext Pro
  if (endpoint === 'fal-ai/flux-pro/kontext') {
    return {
      prompt: input.prompt,
      image_url: input.image_url || input.imageUrl,
    };
  }

  // bytedance/seedream/v5/lite/text-to-image or pro
  if (endpoint.includes('seedream')) {
    const falInput: Record<string, any> = {
      prompt: input.prompt,
      image_size: input.image_size || input.resolution || 'auto_2K',
      num_images: units,
    };
    if (input.output_format) {
      const fmt = input.output_format.toLowerCase();
      if (fmt === 'png' || fmt === 'jpeg' || fmt === 'webp') {
        falInput.output_format = fmt;
      }
    }
    return falInput;
  }

  // openai/gpt-image-2/edit
  if (endpoint.includes('gpt-image-2/edit')) {
    const urls = input.image_urls || (input.image_url ? [input.image_url] : input.imageUrl ? [input.imageUrl] : []);
    return {
      prompt: input.prompt,
      image_urls: urls,
      quality: input.quality || 'medium',
      image_size: input.image_size || 'auto',
    };
  }

  // openai/gpt-image-2 (text to image)
  if (endpoint.includes('gpt-image-2')) {
    return {
      prompt: input.prompt,
      image_size: input.image_size || input.resolution || 'landscape_4_3',
      num_images: units,
      output_format: (input.output_format || 'png').toLowerCase(),
    };
  }

  // fal-ai/flux-kontext
  if (endpoint.includes('flux-kontext')) {
    return {
      prompt: input.prompt,
      image_url: input.image_url || input.imageUrl,
    };
  }

  // fal-ai/clarity-upscaler
  if (endpoint.includes('clarity-upscaler')) {
    return {
      image_url: input.image_url || input.imageUrl,
      prompt: input.prompt || 'masterpiece, best quality, highres',
      upscale_factor: Number(input.upscale_factor || input.scale || (input.upscaleFactor === '4x' ? 4 : 2)),
    };
  }

  // fal-ai/bria/eraser (image clean with mask)
  if (endpoint.includes('bria/eraser')) {
    return {
      image_url: input.image_url || input.imageUrl,
      mask_url: input.mask_url || input.maskUrl,
    };
  }

  // bria/bria_video_eraser/erase/prompt
  if (endpoint.includes('bria_video_eraser/erase/prompt')) {
    return {
      prompt: input.prompt,
      video_url: input.video_url || input.videoUrl,
      preserve_audio: input.preserve_audio ?? true,
      auto_trim: input.auto_trim ?? true,
      output_container_and_codec: input.output_container_and_codec || 'mp4_h264',
    };
  }

  // fal-ai/void-video-inpainting
  if (endpoint === 'fal-ai/void-video-inpainting') {
    const payload: Record<string, any> = {
      video_url: input.video_url || input.videoUrl,
      prompt: input.prompt || 'clean plain background, no text',
      num_inference_steps: Number(input.num_inference_steps || 30),
      guidance_scale: Number(input.guidance_scale ?? 1),
      strength: Number(input.strength ?? 1),
      num_frames: Number(input.num_frames || 85),
      enable_safety_checker: input.enable_safety_checker ?? true,
    };
    if (input.mask_prompt) payload.mask_prompt = input.mask_prompt;
    if (input.quad_mask_video_url || input.mask_video_url || input.maskVideoUrl) {
      payload.quad_mask_video_url = input.quad_mask_video_url || input.mask_video_url || input.maskVideoUrl;
    }
    if (input.negative_prompt) payload.negative_prompt = input.negative_prompt;
    if (input.seed !== undefined) payload.seed = input.seed;
    if (input.enable_pass2_refinement !== undefined) {
      payload.enable_pass2_refinement = Boolean(input.enable_pass2_refinement);
    }
    return payload;
  }

  // bria/bria_video_eraser/erase/mask
  if (endpoint.includes('bria_video_eraser/erase/mask')) {
    return {
      video_url: input.video_url || input.videoUrl,
      mask_video_url: input.mask_video_url || input.maskVideoUrl,
    };
  }

  // fal-ai/ideogram/v3
  if (endpoint.includes('ideogram')) {
    return {
      prompt: input.prompt,
      image_size: input.image_size || input.resolution || 'square_hd',
      num_images: units,
      rendering_speed: 'BALANCED',
    };
  }

  // Video: alibaba/happy-horse/image-to-video
  if (endpoint.includes('happy-horse/image-to-video')) {
    return {
      image_url: input.image_url || input.imageUrl || input.start_image_url || input.startImageUrl,
      prompt: input.prompt || undefined,
      resolution: input.resolution || '720p',
      duration: Number(input.duration || 4),
    };
  }

  // Video: alibaba/happy-horse/text-to-video
  if (endpoint.includes('happy-horse/text-to-video')) {
    return {
      prompt: input.prompt,
      aspect_ratio: input.aspect_ratio || input.aspectRatio || input.format || '16:9',
      resolution: input.resolution || '720p',
      duration: Number(input.duration || 4),
    };
  }

  // Video: bytedance/seedance-2.0/fast/image-to-video
  if (endpoint.includes('seedance-2.0/fast/image-to-video')) {
    const payload: Record<string, any> = {
      image_url: input.image_url || input.imageUrl || input.start_image_url || input.startImageUrl,
      prompt: input.prompt || '',
      resolution: input.resolution || '720p',
      duration: String(input.duration || '4'),
      generate_audio: input.generate_audio ?? input.audio ?? true,
    };
    if (input.end_image_url || input.endImageUrl) {
      payload.end_image_url = input.end_image_url || input.endImageUrl;
    }
    return payload;
  }

  // Video: bytedance/seedance-2.5/image-to-video
  if (endpoint.includes('seedance-2.5/image-to-video')) {
    const payload: Record<string, any> = {
      image_url: input.image_url || input.imageUrl || input.start_image_url || input.startImageUrl,
      resolution: input.resolution || '720p',
      duration: String(input.duration || '4'),
      generate_audio: input.generate_audio ?? input.audio ?? true,
    };
    if (input.prompt) payload.prompt = input.prompt;
    if (input.end_image_url || input.endImageUrl) {
      payload.end_image_url = input.end_image_url || input.endImageUrl;
    }
    return payload;
  }

  // ==================== AUDIO MODELS ====================
  // [Audio 1] ElevenLabs v4 (Pro)
  if (endpoint === 'elevenlabs/tts/eleven-v4') {
    const payload: Record<string, any> = {
      text: input.text || input.prompt || '',
      voice: input.voice || 'Rachel',
      stability: Number(input.stability ?? 0.5),
      similarity_boost: Number(input.similarity_boost ?? 0.75),
      output_format: input.output_format || 'mp3_44100_128',
      apply_text_normalization: input.apply_text_normalization || 'auto',
    };
    if (input.seed !== undefined) payload.seed = Number(input.seed);
    if (input.language_code && input.language_code !== 'auto') payload.language_code = input.language_code;
    if (input.timestamps !== undefined) payload.timestamps = Boolean(input.timestamps);
    return payload;
  }

  // [Audio 2] ElevenLabs v3 (Standard) - NO output_format/speed/similarity
  if (endpoint === 'fal-ai/elevenlabs/tts/eleven-v3') {
    const payload: Record<string, any> = {
      text: input.text || input.prompt || '',
      voice: input.voice || 'Rachel',
      stability: Number(input.stability ?? 0.5),
      apply_text_normalization: input.apply_text_normalization || 'auto',
    };
    if (input.language_code && input.language_code !== 'auto') payload.language_code = input.language_code;
    if (input.timestamps !== undefined) payload.timestamps = Boolean(input.timestamps);
    return payload;
  }

  // [Audio 3 & 4] Multilingual v2 & Turbo v2.5
  if (endpoint === 'fal-ai/elevenlabs/tts/multilingual-v2' || endpoint === 'fal-ai/elevenlabs/tts/turbo-v2.5') {
    const payload: Record<string, any> = {
      text: input.text || input.prompt || '',
      voice: input.voice || 'Rachel',
      stability: Number(input.stability ?? 0.5),
      similarity_boost: Number(input.similarity_boost ?? 0.75),
      speed: Number(input.speed ?? 1.0),
      apply_text_normalization: input.apply_text_normalization || 'auto',
    };
    if (input.style !== undefined) payload.style = Number(input.style);
    if (input.previous_text) payload.previous_text = input.previous_text;
    if (input.next_text) payload.next_text = input.next_text;
    if (input.language_code && input.language_code !== 'auto') payload.language_code = input.language_code;
    if (input.timestamps !== undefined) payload.timestamps = Boolean(input.timestamps);
    return payload;
  }

  // [Audio 5] ElevenLabs Dialogue v3
  if (endpoint === 'fal-ai/elevenlabs/text-to-dialogue/eleven-v3') {
    const inputsList = Array.isArray(input.inputs) && input.inputs.length > 0
      ? input.inputs.map((l: any) => ({ text: String(l.text || ''), voice: String(l.voice || 'Rachel') }))
      : [{ text: input.text || input.prompt || '', voice: input.voice || 'Rachel' }];

    const rawStability = Number(input.stability ?? 0.5);
    const validStability = rawStability <= 0.25 ? 0.0 : rawStability >= 0.75 ? 1.0 : 0.5;

    const payload: Record<string, any> = {
      inputs: inputsList,
      stability: validStability,
      use_speaker_boost: Boolean(input.use_speaker_boost ?? true),
      enable_safety_checker: Boolean(input.enable_safety_checker ?? true),
    };
    if (input.seed !== undefined) payload.seed = Number(input.seed);
    if (input.language_code && input.language_code !== 'auto') payload.language_code = input.language_code;
    return payload;
  }

  // [Audio 6] ElevenLabs Sound Effects v2
  if (endpoint === 'fal-ai/elevenlabs/sound-effects/v2') {
    const payload: Record<string, any> = {
      text: input.text || input.prompt || '',
      duration_seconds: Math.max(0.5, Math.min(22, Number(input.duration_seconds || input.duration || 5))),
      prompt_influence: Math.max(0, Math.min(1, Number(input.prompt_influence ?? 0.3))),
      output_format: input.output_format || 'mp3_44100_128',
      loop: Boolean(input.loop ?? false),
    };
    return payload;
  }

  // [Audio 7] ElevenLabs Music
  if (endpoint === 'fal-ai/elevenlabs/music') {
    const lenMs = input.music_length_ms
      ? Number(input.music_length_ms)
      : input.duration
      ? Math.max(3000, Math.min(600000, Number(input.duration) * 1000))
      : 30000;

    const payload: Record<string, any> = {
      prompt: input.prompt || input.text || '',
      music_length_ms: Math.max(3000, Math.min(600000, lenMs)),
      force_instrumental: input.force_instrumental !== undefined ? Boolean(input.force_instrumental) : true,
      output_format: input.output_format || 'mp3_44100_128',
    };
    return payload;
  }

  // [Audio 8] ElevenLabs Dubbing
  if (endpoint === 'fal-ai/elevenlabs/dubbing') {
    const payload: Record<string, any> = {
      target_lang: input.target_lang || input.language || 'es',
      highest_resolution: Boolean(input.highest_resolution ?? true),
      enable_safety_checker: Boolean(input.enable_safety_checker ?? true),
    };
    if (input.video_url || input.videoUrl) payload.video_url = input.video_url || input.videoUrl;
    if (input.audio_url || input.audioUrl) payload.audio_url = input.audio_url || input.audioUrl;
    if (input.source_lang && input.source_lang !== 'auto') payload.source_lang = input.source_lang;
    if (input.num_speakers !== undefined) payload.num_speakers = Number(input.num_speakers);
    return payload;
  }

  // [Audio 9] ElevenLabs Scribe v2
  if (endpoint === 'fal-ai/elevenlabs/speech-to-text/scribe-v2') {
    const payload: Record<string, any> = {
      audio_url: input.audio_url || input.audioUrl,
      tag_audio_events: Boolean(input.tag_audio_events ?? true),
      diarize: Boolean(input.diarize ?? true),
    };
    if (input.language_code && input.language_code !== 'auto') payload.language_code = input.language_code;
    if (Array.isArray(input.keyterms) && input.keyterms.length > 0) payload.keyterms = input.keyterms;
    return payload;
  }

  // [Audio 10] Kling Lip Sync
  if (endpoint === 'fal-ai/kling-video/lipsync/audio-to-video') {
    return {
      video_url: input.video_url || input.videoUrl,
      audio_url: input.audio_url || input.audioUrl,
    };
  }

  // [Audio 11] Sync.so Lip Sync
  if (endpoint === 'fal-ai/sync-lipsync') {
    return {
      video_url: input.video_url || input.videoUrl,
      audio_url: input.audio_url || input.audioUrl,
      sync_mode: input.sync_mode || 'loop',
    };
  }

  // Generic fallback: send prompt and num_images
  return {
    prompt: input.prompt,
    num_images: units,
    image_size: input.image_size || input.resolution || 'auto_2K',
  };
}

/**
 * POST /api/jobs
 * Validates with zod, looks up model in registry, computes cost, runs cost guard,
 * submits to fal.ai, stores falRequestId, and returns job doc with status queued.
 */
jobsRouter.post('/', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const parseResult = createJobSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.format(),
    });
  }

  const { tool, modelKey, input, projectId, confirmedRights } = parseResult.data;
  const uid = req.user!.uid;

  // Enforce rate limiting per hour if configured
  const rateCheck = checkRateLimit(uid);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: `Rate limit reached: Maximum ${RATE_LIMIT_PER_HOUR} jobs per hour. Please wait ${rateCheck.retryAfterSec}s before submitting another job.`,
    });
  }

  // Validate all input media URLs against allowed domains (fal CDN and studio storage) to avoid SSRF
  const mediaUrlKeys = [
    'image_url',
    'imageUrl',
    'start_image_url',
    'startImageUrl',
    'end_image_url',
    'endImageUrl',
    'video_url',
    'videoUrl',
    'mask_url',
    'maskUrl',
    'mask_video_url',
    'maskVideoUrl',
    'sourceUrl',
    'audio_url',
    'audioUrl',
    'voice_url',
    'voiceUrl',
    'music_url',
    'musicUrl',
    'sfx_url',
    'sfxUrl',
  ];
  for (const k of mediaUrlKeys) {
    const val = input[k];
    if (typeof val === 'string' && val.trim() && !isAllowedMediaUrl(val)) {
      return res.status(400).json({
        error: `Input media URL for '${k}' must be hosted on fal CDN or verified studio storage.`,
      });
    }
  }
  if (Array.isArray(input.image_urls)) {
    for (const url of input.image_urls) {
      if (typeof url === 'string' && url.trim() && !isAllowedMediaUrl(url)) {
        return res.status(400).json({
          error: `Input media URL in 'image_urls' must be hosted on fal CDN or verified studio storage.`,
        });
      }
    }
  }

  // CRITICAL: The rights checkbox is mandatory: the server must reject a Clean job when confirmedRights is not true
  if ((tool === 'image.clean' || tool === 'video.clean') && !confirmedRights) {
    return res.status(400).json({
      error: 'You must certify ownership or permission to edit this media before cleaning.',
    });
  }

  // 1. Verify model exists in registry and is enabled
  const model = MODEL_REGISTRY.find((m) => m.key === modelKey && m.tool === tool);
  if (!model) {
    return res.status(400).json({
      error: `Model '${modelKey}' is not registered or not valid for tool '${tool}'`,
    });
  }

  if (!model.enabled) {
    return res.status(400).json({
      error: `Model '${model.label}' is not connected yet. Real schema verification required before use.`,
    });
  }

  // Normalise input for model (aspect ratio, resolution, image_size, duration, output_format)
  const normalizedInput = normalizeInputForModel(model, input);
  Object.assign(input, normalizedInput);

  // Validate start image for image-to-video models
  const isImageToVideo =
    model.endpoint.includes('image-to-video') ||
    model.label.toLowerCase().includes('image to video') ||
    modelKey.endsWith('_i2v');

  if (isImageToVideo) {
    const hasStartImg =
      input.start_image_url || input.startImageUrl || input.image_url || input.imageUrl;
    if (!hasStartImg) {
      return res.status(400).json({
        error: `A starting image is required for image-to-video model '${model.label}'. Please upload or select a starting image.`,
      });
    }
  }

  // Probe real video duration for clean jobs to avoid hardcoded 5s estimation & unnecessary splitting
  if (tool === 'video.clean' && (input.video_url || input.videoUrl)) {
    try {
      const meta = await mediaProcessing.getVideoMetadata(input.video_url || input.videoUrl);
      if (meta?.duration && meta.duration > 0) {
        input.duration = Math.round(meta.duration);
      }
    } catch {
      // Keep input.duration if probe is unavailable
    }
  }

  // 2. Calculate units and estimated cost
  let units = 1;
  let priceRate = model.price;

  if (tool === 'video.create' || tool === 'video.clean' || tool === 'video.edit') {
    units = typeof input.duration === 'number'
      ? input.duration
      : parseInt(input.duration, 10) || 5;

    if (model.endpoint.includes('minimax/h3-max-turbo') || model.endpoint.includes('minimax/h3-max')) {
      const res = (input.resolution || '480P').toUpperCase();
      priceRate = res === '1080P' ? 0.08 : res === '768P' ? 0.04 : 0.025;
    } else if (model.endpoint === 'lightricks/ltx-2.5/image-to-video/fast') {
      const res = (input.resolution || '720p').toLowerCase();
      priceRate = res === '4k' || res === '2160p' ? 0.30 : res === '1440p' || res === '2k' ? 0.19 : res === '1080p' ? 0.13 : 0.09;
    } else if (model.endpoint.includes('happy-horse')) {
      const res = (input.resolution || '720p').toLowerCase();
      priceRate = res === '1080p' ? 0.28 : 0.14;
    } else if (model.endpoint.includes('seedance-2.5')) {
      if (input.resolution === '480p') {
        priceRate = 0.2205;
      } else if (input.resolution === '1080p') {
        priceRate = 1.164;
      } else {
        priceRate = 0.4730;
      }
    } else if (model.endpoint.includes('seedance-2.0')) {
      priceRate = 0.2419;
    }
  } else if (tool === 'audio.tts') {
    const chars = ((input.text || input.prompt || '') as string).length || 1;
    if (model.endpoint === 'fal-ai/minimax/speech-2.8-hd') {
      units = Math.max(0.001, chars / 1000);
      priceRate = 0.10;
    } else if (model.endpoint === 'fal-ai/gemini-3.1-flash-tts') {
      units = Math.max(0.001, chars / 1000);
      priceRate = 0.15;
    } else if (model.endpoint === 'fal-ai/inworld-tts') {
      units = Math.max(0.001, chars / 1000);
      priceRate = 0.01;
    } else if (model.endpoint === 'xai/tts/v1') {
      units = Math.max(0.001, chars / 1000);
      priceRate = 0.015;
    } else if (model.endpoint === 'fal-ai/chatterbox/text-to-speech') {
      units = Math.max(0.001, chars / 1000);
      priceRate = 0.025;
    } else if (model.endpoint === 'fal-ai/index-tts-2/text-to-speech') {
      units = Math.max(1, Math.round(chars / 15));
      priceRate = 0.002;
    } else {
      units = Math.max(0.001, chars / 1000);
      priceRate = model.price * 1000;
    }
  } else if (tool === 'audio.voiceClone') {
    units = 1;
    priceRate = 0.05;
  } else if (tool === 'audio.voiceDesign') {
    const chars = ((input.preview_text || input.prompt || input.text || '') as string).length || 1;
    units = Math.max(0.001, chars / 1000);
    priceRate = 0.03;
  } else if (tool === 'audio.dialogue') {
    const totalChars = Array.isArray(input.inputs)
      ? input.inputs.reduce((sum: number, line: any) => sum + (line.text?.length || 0), 0)
      : (input.text?.length || 1);
    units = totalChars || 1;
  } else if (tool === 'audio.music') {
    const ms = Number(input.music_length_ms || (input.duration ? Number(input.duration) * 1000 : 30000));
    units = ms / 60000;
  } else if (tool === 'audio.dub' || tool === 'audio.stt') {
    const sec = Number(input.duration || 60);
    units = sec / 60;
  } else if (tool === 'audio.lipsync') {
    units = Number(input.duration || 5);
  } else if (tool === 'audio.sfx') {
    units = 1;
  } else if (tool === 'audio.mix' || tool === 'audio.burn_captions') {
    units = 1;
    priceRate = 0;
  } else {
    units = typeof input.variants === 'number'
      ? input.variants
      : typeof input.num_images === 'number'
      ? input.num_images
      : 1;
  }

  const estCostUsd = calculateJobCost(priceRate, units);

  // 3. Retrieve today's spend for cost guard evaluation
  const todayStr = new Date().toISOString().slice(0, 10);
  let todaySpend = 0;

  try {
    const usageSnap = await adminDb
      .collection('usage')
      .where('uid', '==', uid)
      .where('date', '==', todayStr)
      .get();

    todaySpend = usageSnap.docs.reduce((sum, doc) => sum + (doc.data().estCostUsd || 0), 0);
  } catch (err: any) {
    logFirestoreFallback('jobs', err);
    todaySpend = inMemoryUsage
      .filter((u) => u.uid === uid && u.date === todayStr)
      .reduce((sum, u) => sum + u.estCostUsd, 0);
  }

  // 4. Cost guard verification
  const costCheck = evaluateCostGuard(todaySpend, estCostUsd);
  if (!costCheck.allowed) {
    return res.status(400).json({
      error: costCheck.reason,
      blockedByCostGuard: true,
      reason: costCheck.reason,
    });
  }

  const now = new Date().toISOString();
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const parentAssetId = input.assetId || input.parentAssetId || null;

  // 4b. Non-AI media work: Sharp for images and FFmpeg for video (Cost: 0)
  if (tool === 'image.resize') {
    const imageUrl = input.image_url || input.imageUrl;
    if (!imageUrl) {
      return res.status(400).json({ error: 'image_url is required for image.resize' });
    }

    try {
      const resizeOutputs = await mediaProcessing.resizeForAds(imageUrl, input.formats);
      const outputs: any[] = [];

      for (const item of resizeOutputs) {
        const assetId = `asset_${Date.now()}_sz_${Math.random().toString(36).substring(2, 6)}`;
        const assetDoc = {
          id: assetId,
          uid,
          url: item.url,
          type: 'image',
          title: `${input.title || 'Resized Ad'} (${item.format})`,
          tool,
          modelKey,
          parentAssetId,
          projectId: projectId || null,
          metadata: {
            format: item.format,
            width: item.width,
            height: item.height,
            sourceUrl: imageUrl,
          },
          createdAt: now,
        };

        try {
          await adminDb.collection('assets').doc(assetId).set(assetDoc);
        } catch {
          inMemoryAssets.set(assetId, assetDoc);
        }

        outputs.push({
          assetId,
          url: item.url,
          type: 'image',
          format: item.format,
          width: item.width,
          height: item.height,
        });
      }

      const succeededJob = {
        id: jobId,
        uid,
        tool,
        modelKey,
        falEndpoint: 'local/sharp/resize',
        falRequestId: null,
        input,
        parentAssetId,
        projectId: projectId || null,
        confirmedRights: Boolean(confirmedRights),
        estCostUsd: 0,
        status: 'succeeded',
        progress: 100,
        error: null,
        outputs,
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      };

      try {
        await adminDb.collection('jobs').doc(jobId).set(succeededJob);
      } catch {
        inMemoryJobs.set(jobId, succeededJob);
      }

      return res.status(201).json({ job: succeededJob });
    } catch (err: any) {
      return res.status(500).json({ error: `Image resize failed: ${err.message}` });
    }
  }

  if (tool === 'video.trim') {
    const videoUrl = input.video_url || input.videoUrl;
    if (!videoUrl) {
      return res.status(400).json({ error: 'video_url is required for video.trim' });
    }

    try {
      const trimRes = await mediaProcessing.trimVideo(
        videoUrl,
        Number(input.startSec || 0),
        Number(input.durationSec || 5)
      );
      const assetId = `asset_${Date.now()}_trim_${Math.random().toString(36).substring(2, 6)}`;

      const assetDoc = {
        id: assetId,
        uid,
        url: trimRes.url,
        type: 'video',
        title: `${input.title || 'Trimmed Video'} (${trimRes.duration})`,
        tool,
        modelKey,
        parentAssetId,
        projectId: projectId || null,
        metadata: {
          duration: trimRes.duration,
          sourceUrl: videoUrl,
        },
        createdAt: now,
      };

      try {
        await adminDb.collection('assets').doc(assetId).set(assetDoc);
      } catch {
        inMemoryAssets.set(assetId, assetDoc);
      }

      const succeededJob = {
        id: jobId,
        uid,
        tool,
        modelKey,
        falEndpoint: 'local/ffmpeg/trim',
        falRequestId: null,
        input,
        parentAssetId,
        projectId: projectId || null,
        confirmedRights: Boolean(confirmedRights),
        estCostUsd: 0,
        status: 'succeeded',
        progress: 100,
        error: null,
        outputs: [{ assetId, url: trimRes.url, type: 'video', duration: trimRes.duration }],
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      };

      try {
        await adminDb.collection('jobs').doc(jobId).set(succeededJob);
      } catch {
        inMemoryJobs.set(jobId, succeededJob);
      }

      return res.status(201).json({ job: succeededJob });
    } catch (err: any) {
      return res.status(500).json({ error: `Video trim failed: ${err.message}` });
    }
  }

  if (tool === 'video.reformat') {
    const videoUrl = input.video_url || input.videoUrl;
    if (!videoUrl) {
      return res.status(400).json({ error: 'video_url is required for video.reformat' });
    }

    try {
      const fmtRes = await mediaProcessing.reformatVideo(videoUrl, input.format || '16:9');
      const assetId = `asset_${Date.now()}_fmt_${Math.random().toString(36).substring(2, 6)}`;

      const assetDoc = {
        id: assetId,
        uid,
        url: fmtRes.url,
        type: 'video',
        title: `${input.title || 'Reformatted Video'} (${fmtRes.format})`,
        tool,
        modelKey,
        parentAssetId,
        projectId: projectId || null,
        metadata: {
          format: fmtRes.format,
          sourceUrl: videoUrl,
        },
        createdAt: now,
      };

      try {
        await adminDb.collection('assets').doc(assetId).set(assetDoc);
      } catch {
        inMemoryAssets.set(assetId, assetDoc);
      }

      const succeededJob = {
        id: jobId,
        uid,
        tool,
        modelKey,
        falEndpoint: 'local/ffmpeg/reformat',
        falRequestId: null,
        input,
        parentAssetId,
        projectId: projectId || null,
        confirmedRights: Boolean(confirmedRights),
        estCostUsd: 0,
        status: 'succeeded',
        progress: 100,
        error: null,
        outputs: [{ assetId, url: fmtRes.url, type: 'video', format: fmtRes.format }],
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      };

      try {
        await adminDb.collection('jobs').doc(jobId).set(succeededJob);
      } catch {
        inMemoryJobs.set(jobId, succeededJob);
      }

      return res.status(201).json({ job: succeededJob });
    } catch (err: any) {
      return res.status(500).json({ error: `Video reformat failed: ${err.message}` });
    }
  }

  // Free option: FFmpeg delogo filter
  if (modelKey === 'vclean_ffmpeg_delogo' || model.endpoint === 'ffmpeg/delogo') {
    try {
      const srcVideo = input.video_url || input.videoUrl;
      const rect = input.delogoRect || input.delogo_rect || { x: 10, y: 10, w: 100, h: 50 };
      const cleanedUrl = await mediaProcessing.applyFfmpegDelogo(srcVideo, rect);

      const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const parentAssetId = input.assetId || null;

      const newAsset = {
        id: assetId,
        uid,
        url: cleanedUrl,
        type: 'video',
        title: `delogo_cleaned_${Date.now()}`,
        sourceTool: 'video.clean',
        modelKey: 'vclean_ffmpeg_delogo',
        parentAssetId,
        tags: ['cleaned', 'delogo', 'free'],
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await adminDb.collection('assets').doc(assetId).set(newAsset);
      } catch {
        inMemoryAssets.set(assetId, newAsset);
      }

      const succeededJob = {
        id: jobId,
        uid,
        tool,
        modelKey,
        falEndpoint: 'ffmpeg/delogo',
        falRequestId: null,
        input,
        parentAssetId,
        projectId: projectId || null,
        confirmedRights: Boolean(confirmedRights),
        estCostUsd: 0,
        status: 'succeeded',
        progress: 100,
        error: null,
        outputs: [{ assetId, url: cleanedUrl, type: 'video' }],
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      };

      try {
        await adminDb.collection('jobs').doc(jobId).set(succeededJob);
      } catch {
        inMemoryJobs.set(jobId, succeededJob);
      }

      return res.status(201).json({ job: succeededJob });
    } catch (err: any) {
      return res.status(500).json({ error: `FFmpeg delogo failed: ${err.message}` });
    }
  }

  // Audio mix with video: local server FFmpeg (Cost: 0)
  if (tool === 'audio.mix' || modelKey === 'audio_mix_local') {
    const videoUrl = input.video_url || input.videoUrl;
    if (!videoUrl) {
      return res.status(400).json({ error: 'video_url is required for audio.mix' });
    }

    try {
      const mixedUrl = await mediaProcessing.mixAudioWithVideo({
        videoUrl,
        voiceUrl: input.voice_url || input.voiceUrl,
        musicUrl: input.music_url || input.musicUrl,
        sfxUrl: input.sfx_url || input.sfxUrl,
        replaceOriginal: Boolean(input.replace_original ?? input.replaceOriginal),
        voiceVolume: input.voice_volume !== undefined ? Number(input.voice_volume) : 1.0,
        musicVolume: input.music_volume !== undefined ? Number(input.music_volume) : 0.25,
        sfxVolume: input.sfx_volume !== undefined ? Number(input.sfx_volume) : 0.8,
      });

      const assetId = `asset_${Date.now()}_mix_${Math.random().toString(36).substring(2, 6)}`;
      const assetDoc = {
        id: assetId,
        uid,
        url: mixedUrl,
        type: 'video',
        title: input.title || 'Video with Audio Mix',
        tool,
        modelKey,
        parentAssetId,
        projectId: projectId || null,
        metadata: {
          sourceUrl: videoUrl,
          replaceOriginal: Boolean(input.replace_original ?? input.replaceOriginal),
        },
        createdAt: now,
      };

      try {
        await adminDb.collection('assets').doc(assetId).set(assetDoc);
      } catch {
        inMemoryAssets.set(assetId, assetDoc);
      }

      const succeededJob = {
        id: jobId,
        uid,
        tool,
        modelKey,
        falEndpoint: 'local/ffmpeg/audio-mix',
        falRequestId: null,
        input,
        parentAssetId,
        projectId: projectId || null,
        confirmedRights: Boolean(confirmedRights),
        estCostUsd: 0,
        status: 'succeeded',
        progress: 100,
        error: null,
        outputs: [{ assetId, url: mixedUrl, type: 'video' }],
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      };

      try {
        await adminDb.collection('jobs').doc(jobId).set(succeededJob);
      } catch {
        inMemoryJobs.set(jobId, succeededJob);
      }

      return res.status(201).json({ job: succeededJob });
    } catch (err: any) {
      return res.status(500).json({ error: `Audio mixing failed: ${err.message}` });
    }
  }

  // Audio burn captions: local server FFmpeg (Cost: 0)
  if (tool === 'audio.burn_captions' || modelKey === 'audio_burn_captions') {
    const videoUrl = input.video_url || input.videoUrl;
    const srtContent = input.srt_content || input.srtContent;
    if (!videoUrl || !srtContent) {
      return res.status(400).json({ error: 'video_url and srt_content are required for caption burning' });
    }

    try {
      const captionedUrl = await mediaProcessing.burnCaptionsToVideo(videoUrl, srtContent);
      const assetId = `asset_${Date.now()}_cap_${Math.random().toString(36).substring(2, 6)}`;
      const assetDoc = {
        id: assetId,
        uid,
        url: captionedUrl,
        type: 'video',
        title: input.title || 'Video with Burned Captions',
        tool,
        modelKey,
        parentAssetId,
        projectId: projectId || null,
        metadata: { sourceUrl: videoUrl },
        createdAt: now,
      };

      try {
        await adminDb.collection('assets').doc(assetId).set(assetDoc);
      } catch {
        inMemoryAssets.set(assetId, assetDoc);
      }

      const succeededJob = {
        id: jobId,
        uid,
        tool,
        modelKey,
        falEndpoint: 'local/ffmpeg/burn-captions',
        falRequestId: null,
        input,
        parentAssetId,
        projectId: projectId || null,
        confirmedRights: Boolean(confirmedRights),
        estCostUsd: 0,
        status: 'succeeded',
        progress: 100,
        error: null,
        outputs: [{ assetId, url: captionedUrl, type: 'video' }],
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      };

      try {
        await adminDb.collection('jobs').doc(jobId).set(succeededJob);
      } catch {
        inMemoryJobs.set(jobId, succeededJob);
      }

      return res.status(201).json({ job: succeededJob });
    } catch (err: any) {
      return res.status(500).json({ error: `Caption burning failed: ${err.message}` });
    }
  }

  // Compare mode: 'Test on first 4 seconds'
  if (input.test4s && (input.video_url || input.videoUrl)) {
    try {
      const srcVideo = input.video_url || input.videoUrl;
      const clip4sUrl = await mediaProcessing.extractFirst4Seconds(srcVideo);
      input.video_url = clip4sUrl;
      input.videoUrl = clip4sUrl;
      input.duration = 4;
    } catch (err: any) {
      return res.status(500).json({ error: `Failed to extract 4s test clip: ${err.message}` });
    }
  }

  // Bria Video Eraser prompt mode: clips > 4.5s are split, processed, and joined with audio restored
  if (modelKey === 'vclean_prompt' && Number(input.duration || 0) > 4.5 && !input.test4s) {
    const runningJob = {
      id: jobId,
      uid,
      tool,
      modelKey,
      falEndpoint: model.endpoint,
      falRequestId: `bria_pipeline_${jobId}`,
      input,
      projectId: projectId || null,
      confirmedRights: Boolean(confirmedRights),
      estCostUsd,
      status: 'running',
      progress: 10,
      error: null,
      outputs: [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      await adminDb.collection('jobs').doc(jobId).set(runningJob);
    } catch {
      inMemoryJobs.set(jobId, runningJob);
    }

    // Run async background processing
    (async () => {
      try {
        const cleanedUrl = await mediaProcessing.processBriaVideoEraserPipeline(
          input.video_url || input.videoUrl,
          input.prompt || 'text and subtitles'
        );
        const finishTime = new Date().toISOString();
        const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newAsset = {
          id: assetId,
          uid,
          url: cleanedUrl,
          type: 'video',
          title: `bria_cleaned_${Date.now()}`,
          sourceTool: 'video.clean',
          modelKey,
          parentAssetId: input.assetId || null,
          tags: ['cleaned', 'bria'],
          isFavorite: false,
          createdAt: finishTime,
          updatedAt: finishTime,
        };
        try {
          await adminDb.collection('assets').doc(assetId).set(newAsset);
        } catch {
          inMemoryAssets.set(assetId, newAsset);
        }

        const usageRecord = {
          id: `usage_${jobId}`,
          uid,
          jobId,
          date: finishTime.slice(0, 10),
          timestamp: finishTime,
          tool,
          model: model.label,
          modelKey,
          estCostUsd,
          status: 'succeeded',
        };
        try {
          await adminDb.collection('usage').doc(`usage_${jobId}`).set(usageRecord);
        } catch {
          inMemoryUsage.push(usageRecord);
        }

        const completedJob = {
          ...runningJob,
          status: 'succeeded',
          progress: 100,
          outputs: [{ assetId, url: cleanedUrl, type: 'video' }],
          updatedAt: finishTime,
          finishedAt: finishTime,
        };
        try {
          await adminDb.collection('jobs').doc(jobId).set(completedJob);
        } catch {
          inMemoryJobs.set(jobId, completedJob);
        }
      } catch (err: any) {
        const failTime = new Date().toISOString();
        const failedJob = {
          ...runningJob,
          status: 'failed',
          error: err.message || 'Bria pipeline processing failed',
          updatedAt: failTime,
        };
        try {
          await adminDb.collection('jobs').doc(jobId).set(failedJob);
        } catch {
          inMemoryJobs.set(jobId, failedJob);
        }
      }
    })();

    return res.status(201).json({ job: runningJob });
  }

  // For video clean mask mode with a static PNG mask drawn on a frame, compile matching mask video
  if (model.endpoint.includes('bria_video_eraser/erase/mask')) {
    if (!input.mask_video_url && !input.maskVideoUrl && (input.mask_url || input.maskUrl)) {
      try {
        const maskPng = input.mask_url || input.maskUrl;
        const srcVideo = input.video_url || input.videoUrl;
        const maskVidUrl = await mediaProcessing.generateMaskVideo(maskPng, srcVideo);
        input.mask_video_url = maskVidUrl;
        input.maskVideoUrl = maskVidUrl;
      } catch (err: any) {
        return res.status(500).json({
          error: `Failed to compile mask video for video clean: ${err.message}`,
        });
      }
    }
  }

  // Scribe v2: If video provided without audio_url, extract audio track via FFmpeg
  if (model.endpoint.includes('speech-to-text/scribe-v2')) {
    if (!input.audio_url && !input.audioUrl && (input.video_url || input.videoUrl)) {
      try {
        const srcVideo = input.video_url || input.videoUrl;
        const extractedAudio = await mediaProcessing.extractAudioTrack(srcVideo);
        input.audio_url = extractedAudio;
        input.audioUrl = extractedAudio;
      } catch (err: any) {
        return res.status(500).json({ error: `Failed to extract audio track from video: ${err.message}` });
      }
    }
  }

  // 5. Submit to fal.ai queue
  const falInput = mapInputToFal(modelKey, model.endpoint, input, units);

  let falRequestId: string | null = null;
  try {
    const submitResult = await falService.submit(model.endpoint, falInput);
    falRequestId = submitResult.requestId;
  } catch (err: any) {
    const friendlyError = formatFriendlyErrorMessage(err);
    return res.status(500).json({
      error: friendlyError,
    });
  }

  // 6. Persist job doc to Firestore
  const newJob = {
    id: jobId,
    uid,
    tool,
    modelKey,
    falEndpoint: model.endpoint,
    falRequestId,
    input,
    projectId: projectId || null,
    confirmedRights: Boolean(confirmedRights),
    estCostUsd,
    status: 'queued',
    progress: 0,
    error: null,
    outputs: [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await adminDb.collection('jobs').doc(jobId).set(newJob);
  } catch (err: any) {
    logFirestoreFallback('jobs', err);
    inMemoryJobs.set(jobId, newJob);
  }

  return res.status(201).json({
    job: newJob,
  });
});

/**
 * Reconciles an in-flight job with fal.ai queue and persists completed assets and usage rows.
 * Designed to survive server restarts.
 */
async function reconcileJobWithFal(job: any, isFirestore: boolean): Promise<any> {
  if (!job || job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
    return job;
  }
  if (!job.falRequestId || !job.falEndpoint || job.falRequestId.startsWith('bria_pipeline_')) {
    return job;
  }

  // 1) If a lock exists for job.id, return existing promise
  if (reconcileLocks.has(job.id)) {
    return reconcileLocks.get(job.id);
  }

  const reconcilePromise = (async () => {
    // 2) Timeout guard: 40 minutes for video and audio.dub, 15 minutes for everything else
    const isLongRunning = job.tool?.startsWith('video') || job.tool === 'audio.dub';
    const maxMinutes = isLongRunning ? 40 : 15;
    const createdAtMs = new Date(job.createdAt || Date.now()).getTime();

    if (Date.now() - createdAtMs > maxMinutes * 60 * 1000) {
      const now = new Date().toISOString();
      job.status = 'failed';
      job.error = 'Timed out - check fal dashboard';
      job.finishedAt = now;
      job.updatedAt = now;
      if (isFirestore) {
        await adminDb.collection('jobs').doc(job.id).set(job).catch(() => inMemoryJobs.set(job.id, job));
      } else {
        inMemoryJobs.set(job.id, job);
      }
      return job;
    }

    const uid = job.uid;
    try {
      const falStatus = await falService.status(job.falEndpoint, job.falRequestId);
      const now = new Date().toISOString();

      if ((falStatus as any).status === 'FAILED' || (falStatus as any).status === 'CANCELLED') {
        job.status = 'failed';
        const rawErr = (falStatus as any).error || `Fal job execution ${(falStatus as any).status.toLowerCase()}.`;
        job.error = formatFriendlyErrorMessage(rawErr);
        job.finishedAt = now;
        job.updatedAt = now;
      } else if (falStatus.status === 'IN_QUEUE') {
        job.status = 'queued';
        job.updatedAt = now;
      } else if (falStatus.status === 'IN_PROGRESS') {
        job.status = 'running';
        job.progress = (falStatus as any).progress ?? 50;
        job.updatedAt = now;
      } else if (falStatus.status === 'COMPLETED') {
        // Fetch result from fal
        const falResult = await falService.result(job.falEndpoint, job.falRequestId);
        const data = (falResult.data as any) || {};

        const outputs: any[] = [];

        // Check for video outputs
        const videoObj = data.video || (data.videos && data.videos[0]);
        const videoUrl = typeof videoObj === 'string' ? videoObj : videoObj?.url || data.video_url;

        const isVideoJob = job.tool?.startsWith('video') || ((job.tool === 'audio.dub' || job.tool === 'audio.lipsync') && videoUrl);

        if (isVideoJob && (videoUrl || data.outputs?.[0]?.url)) {
          const finalVideoUrl = videoUrl || data.outputs?.[0]?.url;
          if (finalVideoUrl) {
            // Deterministic asset id: asset_${job.id}_0
            const assetId = `asset_${job.id}_0`;
            const durationSec = job.input?.duration || 4;
            const resolution = job.input?.resolution || '720p';
            const format = job.input?.aspect_ratio || job.input?.format || '16:9';

            const assetDoc = {
              id: assetId,
              uid,
              url: finalVideoUrl,
              type: 'video',
              title: (job.input?.prompt || job.input?.title || 'Generated Video').slice(0, 60),
              tool: job.tool,
              modelKey: job.modelKey,
              parentAssetId: job.input?.assetId || job.input?.parentAssetId || null,
              projectId: job.projectId || null,
              metadata: {
                prompt: job.input?.prompt,
                duration: `${durationSec}s`,
                resolution,
                format,
                contentType: videoObj?.content_type || 'video/mp4',
              },
              createdAt: now,
            };

            if (isFirestore) {
              try {
                await adminDb.collection('assets').doc(assetId).set(assetDoc);
              } catch {
                inMemoryAssets.set(assetId, assetDoc);
              }
            } else {
              inMemoryAssets.set(assetId, assetDoc);
            }

            outputs.push({
              assetId,
              url: finalVideoUrl,
              type: 'video',
              duration: `${durationSec}s`,
              resolution,
              format,
            });
          }
        } else if (job.tool?.startsWith('audio')) {
          // Audio outputs (Voice Clone/Design, TTS, Dialogue, SFX, Music, STT, Voice change)
          if (job.tool === 'audio.voiceClone' || job.tool === 'audio.voiceDesign') {
            const customVoiceId = data.voice_id || data.custom_voice_id || data.customVoiceId || data.voiceId || data.id || `voice_${job.id}`;
            const audioSampleUrl = data.trial_audio || data.audio?.url || data.audio_url || (typeof data.audio === 'string' ? data.audio : '');
            const voiceId = `voice_${job.id}`;
            const voiceDoc = {
              id: voiceId,
              uid,
              name: job.input?.name || job.input?.voice_name || 'My Custom Voice',
              provider: 'minimax',
              voiceId: customVoiceId,
              createdAt: now,
              lastUsedAt: now,
              source: job.tool === 'audio.voiceClone' ? 'clone' : 'design',
              audioUrl: audioSampleUrl,
            };

            if (isFirestore) {
              try {
                await adminDb.collection('voices').doc(voiceId).set(voiceDoc);
              } catch {
                inMemoryVoices.set(voiceId, voiceDoc);
              }
            } else {
              inMemoryVoices.set(voiceId, voiceDoc);
            }

            outputs.push({
              id: voiceId,
              voiceId: customVoiceId,
              name: voiceDoc.name,
              source: voiceDoc.source,
              provider: 'minimax',
              url: audioSampleUrl,
            });
          } else if (job.tool === 'audio.stt') {
            const transcriptText = data.text || (typeof data === 'string' ? data : '');
            const words = data.words || [];
            const detectedLanguage = data.language_code || data.language || data.detected_language || job.input?.language_code || 'auto';
            if (transcriptText || words.length > 0) {
              const assetId = `asset_${job.id}_0`;
              const sourceMediaUrl = job.input?.video_url || job.input?.audio_url || job.input?.audioUrl || '';
              const assetDoc = {
                id: assetId,
                uid,
                url: sourceMediaUrl,
                type: 'audio',
                title: `Transcript (${words.length || transcriptText.split(/\s+/).filter(Boolean).length} words)`,
                tool: job.tool,
                modelKey: job.modelKey,
                parentAssetId: job.input?.assetId || job.input?.parentAssetId || null,
                projectId: job.projectId || null,
                metadata: {
                  transcript: transcriptText,
                  words,
                  language: detectedLanguage,
                },
                createdAt: now,
              };

              if (isFirestore) {
                try {
                  await adminDb.collection('assets').doc(assetId).set(assetDoc);
                } catch {
                  inMemoryAssets.set(assetId, assetDoc);
                }
              } else {
                inMemoryAssets.set(assetId, assetDoc);
              }

              outputs.push({
                assetId,
                url: sourceMediaUrl,
                type: 'audio',
                text: transcriptText,
                words,
                language: detectedLanguage,
              });
            }
          } else {
            const audioObj = data.audio || data.audio_file || data.output || data.audio_url || data.file;
            let rawAudioUrl = typeof audioObj === 'string' ? audioObj : audioObj?.url || data.url;

            if (rawAudioUrl) {
              const requestedFmt = job.input?.output_format;
              if (
                requestedFmt &&
                (requestedFmt.includes('wav') ||
                  requestedFmt.includes('opus') ||
                  requestedFmt.includes('high') ||
                  requestedFmt.includes('320'))
              ) {
                try {
                  const converted = await mediaProcessing.convertAudioFormat(rawAudioUrl, requestedFmt);
                  rawAudioUrl = converted.url;
                } catch {}
              }

              const assetId = `asset_${job.id}_0`;
              const assetDoc = {
                id: assetId,
                uid,
                url: rawAudioUrl,
                type: 'audio',
                title: (job.input?.text || job.input?.prompt || job.input?.title || 'Generated Audio').slice(0, 60),
                tool: job.tool,
                modelKey: job.modelKey,
                parentAssetId: job.input?.assetId || job.input?.parentAssetId || null,
                projectId: job.projectId || null,
                metadata: {
                  prompt: job.input?.prompt || job.input?.text,
                  voice: job.input?.voice,
                  format: job.input?.output_format || 'mp3',
                  duration:
                    job.input?.duration_seconds ||
                    job.input?.duration ||
                    (job.input?.music_length_ms ? `${Math.round(job.input.music_length_ms / 1000)}s` : undefined),
                },
                createdAt: now,
              };

              if (isFirestore) {
                try {
                  await adminDb.collection('assets').doc(assetId).set(assetDoc);
                } catch {
                  inMemoryAssets.set(assetId, assetDoc);
                }
              } else {
                inMemoryAssets.set(assetId, assetDoc);
              }

              outputs.push({
                assetId,
                url: rawAudioUrl,
                type: 'audio',
                format: job.input?.output_format || 'mp3',
              });
            }
          }
        } else {
          // Image outputs
          const rawImages = (Array.isArray(data.images) && data.images.length > 0)
            ? data.images
            : (data.image?.url ? [data.image] : (Array.isArray(data.outputs) ? data.outputs : []));
          const images: Array<{ url: string; width?: number; height?: number; content_type?: string }> = rawImages;

          for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const assetId = `asset_${job.id}_${i}`;
            const assetDoc = {
              id: assetId,
              uid,
              url: img.url,
              type: 'image',
              title: (job.input?.prompt || 'Generated Image').slice(0, 60),
              tool: job.tool,
              modelKey: job.modelKey,
              parentAssetId: job.input?.assetId || job.input?.parentAssetId || null,
              projectId: job.projectId || null,
              metadata: {
                prompt: job.input?.prompt,
                width: img.width || 1024,
                height: img.height || 1024,
                contentType: img.content_type || 'image/png',
              },
              createdAt: now,
            };

            if (isFirestore) {
              try {
                await adminDb.collection('assets').doc(assetId).set(assetDoc);
              } catch {
                inMemoryAssets.set(assetId, assetDoc);
              }
            } else {
              inMemoryAssets.set(assetId, assetDoc);
            }

            outputs.push({
              assetId,
              url: img.url,
              type: 'image',
              width: img.width,
              height: img.height,
            });
          }
        }

        // If completed but no output files found: mark failed with "fal returned no output file" and cost 0
        if (outputs.length === 0) {
          job.status = 'failed';
          job.error = 'fal returned no output file';
          job.finishedAt = now;
          job.updatedAt = now;

          const usageRecord = {
            id: `usage_${job.id}`,
            uid,
            jobId: job.id,
            tool: job.tool,
            model: job.modelKey,
            estCostUsd: 0,
            status: 'failed',
            date: now.slice(0, 10),
            createdAt: now,
          };

          if (isFirestore) {
            try {
              await adminDb.collection('usage').doc(`usage_${job.id}`).set(usageRecord);
            } catch {
              inMemoryUsage.push(usageRecord);
            }
          } else {
            inMemoryUsage.push(usageRecord);
          }
        } else {
          job.status = 'succeeded';
          job.outputs = outputs;
          job.progress = 100;
          job.finishedAt = now;
          job.updatedAt = now;

          // Write usage row
          const usageRecord = {
            id: `usage_${job.id}`,
            uid,
            jobId: job.id,
            tool: job.tool,
            model: job.modelKey,
            estCostUsd: job.estCostUsd,
            status: 'succeeded',
            date: now.slice(0, 10),
            createdAt: now,
          };

          if (isFirestore) {
            try {
              await adminDb.collection('usage').doc(`usage_${job.id}`).set(usageRecord);
            } catch {
              inMemoryUsage.push(usageRecord);
            }
          } else {
            inMemoryUsage.push(usageRecord);
          }
        }
      }

      // Persist updated job status
      if (isFirestore) {
        await adminDb.collection('jobs').doc(job.id).set(job);
      } else {
        inMemoryJobs.set(job.id, job);
      }
    } catch (err: any) {
      if (err.status && err.status >= 400) {
        const now = new Date().toISOString();
        job.status = 'failed';
        job.error = formatFriendlyErrorMessage(err);
        job.finishedAt = now;
        job.updatedAt = now;

        if (isFirestore) {
          await adminDb.collection('jobs').doc(job.id).set(job);
        } else {
          inMemoryJobs.set(job.id, job);
        }
      }
      // If error has no err.status (network/transient), keep job as is to retry on next poll
    }

    return job;
  })();

  reconcileLocks.set(job.id, reconcilePromise);
  try {
    return await reconcilePromise;
  } finally {
    reconcileLocks.delete(job.id);
  }
}

/**
 * GET /api/jobs/:id
 * Reconciles status with fal.ai on read.
 * While queued or running, queries fal for status.
 * On completion, fetches results, creates asset docs, records usage, and returns finished job.
 */
jobsRouter.get('/:id', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const uid = req.user!.uid;

  let job: any = null;
  let isFirestore = true;

  try {
    const doc = await adminDb.collection('jobs').doc(id).get();
    if (doc.exists && doc.data()?.uid === uid) {
      job = { id: doc.id, ...doc.data() };
    }
  } catch (err: any) {
    logFirestoreFallback('jobs', err);
    isFirestore = false;
    job = inMemoryJobs.get(id);
    if (job && job.uid !== uid) {
      job = null;
    }
  }

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  job = await reconcileJobWithFal(job, isFirestore);
  return res.json({ job });
});

/**
 * PATCH /api/jobs/:id/feedback
 * Saves thumbs up/down ('good' | 'not_good') on the job and its usage ledger row.
 */
jobsRouter.patch('/:id/feedback', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const { rating } = req.body;

  if (rating !== 'good' && rating !== 'not_good') {
    return res.status(400).json({ error: 'Rating must be "good" or "not_good"' });
  }

  const updatedAt = new Date().toISOString();

  // Update in Firestore
  try {
    await adminDb.collection('jobs').doc(id).update({
      rating,
      ratingUpdatedAt: updatedAt,
    });
  } catch (err: any) {
    logFirestoreFallback('jobs', err);
    const job = inMemoryJobs.get(id);
    if (job) {
      job.rating = rating;
      job.ratingUpdatedAt = updatedAt;
    }
  }

  // Update corresponding usage row
  try {
    await adminDb.collection('usage').doc(`usage_${id}`).update({
      rating,
    });
  } catch {
    const uRow = inMemoryUsage.find((r) => r.jobId === id || r.id === `usage_${id}`);
    if (uRow) {
      uRow.rating = rating;
    }
  }

  return res.json({ success: true, rating });
});

/**
 * GET /api/jobs?limit=50
 * Returns recent jobs for the authenticated owner, reconciled with Firestore and fal.ai.
 */
jobsRouter.get('/', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const uid = req.user!.uid;
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

  try {
    const snap = await adminDb
      .collection('jobs')
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    let jobs = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    // Reconcile any in-flight jobs on listing so restarts / fresh page loads update active status
    const inFlight = jobs.filter((j: any) => j.status === 'queued' || j.status === 'running');
    if (inFlight.length > 0) {
      const reconciled = await Promise.all(
        inFlight.map((j: any) => reconcileJobWithFal(j, true).catch(() => j))
      );
      const recMap = new Map(reconciled.map((r: any) => [r.id, r]));
      jobs = jobs.map((j: any) => recMap.get(j.id) || j);
    }

    return res.json({ jobs });
  } catch (err: any) {
    logFirestoreFallback('jobs', err);
    let jobs = Array.from(inMemoryJobs.values())
      .filter((j) => j.uid === uid)
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      .slice(0, limit);

    const inFlight = jobs.filter((j: any) => j.status === 'queued' || j.status === 'running');
    if (inFlight.length > 0) {
      const reconciled = await Promise.all(
        inFlight.map((j: any) => reconcileJobWithFal(j, false).catch(() => j))
      );
      const recMap = new Map(reconciled.map((r: any) => [r.id, r]));
      jobs = jobs.map((j: any) => recMap.get(j.id) || j);
    }

    return res.json({ jobs });
  }
});
