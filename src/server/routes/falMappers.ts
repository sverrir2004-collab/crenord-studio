/**
 * Payload builders for the models connected in batches C01 to C15.
 * mapExtraModelInput(endpoint, input, units) returns the exact JSON that fal.ai expects
 * for that endpoint, or null when the endpoint is not handled here.
 * It is called first thing in mapInputToFal (src/server/routes/jobs.ts).
 * Only parameters that were verified on the fal.ai API pages are ever sent.
 */

type In = Record<string, any>;

const first = (...vals: any[]) => vals.find((v) => v !== undefined && v !== null && v !== '');

function startImage(i: In) {
  return first(i.start_image_url, i.startImageUrl, i.image_url, i.imageUrl);
}
function endImage(i: In) {
  return first(i.end_image_url, i.endImageUrl, i.tail_image_url);
}
function imageList(i: In): string[] {
  if (Array.isArray(i.image_urls) && i.image_urls.length) return i.image_urls;
  const one = first(i.image_url, i.imageUrl);
  return one ? [one] : [];
}

/** Whole seconds from number, "8", "8s". */
function secs(v: any, fallback: number): number {
  if (v === undefined || v === null || v === '' || v === 'auto') return fallback;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Snap a duration to the closest allowed value. */
function snap(v: any, allowed: number[], fallback: number): number {
  const n = secs(v, fallback);
  return allowed.reduce((best, a) => (Math.abs(a - n) < Math.abs(best - n) ? a : best), allowed[0]);
}

function ratioValue(r: string): number | null {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(r);
  return m ? parseFloat(m[1]) / parseFloat(m[2]) : null;
}

/** Choose a supported aspect ratio. "Auto" or an unsupported value becomes the closest allowed one. */
function aspect(input: In, allowed: string[], fallback: string, autoOk = false): string {
  const raw = String(first(input.aspect_ratio, input.format, input.aspectRatio) || 'auto').trim();
  const low = raw.toLowerCase();
  if (low === 'auto' || low === 'adaptive') {
    if (autoOk && allowed.includes('auto')) return 'auto';
    if (autoOk && allowed.includes('adaptive')) return 'adaptive';
    return fallback;
  }
  if (allowed.includes(raw)) return raw;
  const want = ratioValue(raw);
  if (want === null) return fallback;
  let best = fallback;
  let bestDist = Infinity;
  for (const a of allowed) {
    const v = ratioValue(a);
    if (v === null) continue;
    const d = Math.abs(Math.log(v / want));
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

/** Choose a supported resolution, case-insensitive, returned with the model's own casing. */
function resolution(input: In, allowed: string[], fallback: string): string {
  const raw = String(input.resolution || '').toLowerCase().trim();
  const exact = allowed.find((a) => a.toLowerCase() === raw);
  if (exact) return exact;
  const loose = allowed.find((a) => {
    const l = a.toLowerCase();
    if (raw.includes('480') && l.includes('480')) return true;
    if ((raw.includes('720') || raw.includes('768')) && (l.includes('720') || l.includes('768'))) return true;
    if (raw.includes('1080') && l.includes('1080')) return true;
    if ((raw.includes('4k') || raw.includes('2160')) && (l.includes('4k') || l.includes('2160'))) return true;
    if ((raw.includes('2k') || raw.includes('1440')) && (l.includes('2k') || l.includes('1440'))) return true;
    return false;
  });
  return loose || fallback;
}

/** Image resolution tiers: "auto_2K", "2K", "1k" and so on become 1K, 2K or 4K. */
function imageTier(input: In, fallback = '1K'): '1K' | '2K' | '4K' | string {
  const r = String(input.resolution || '').toLowerCase();
  if (r.includes('4k')) return '4K';
  if (r.includes('2k')) return '2K';
  if (r.includes('1k') || r.includes('720') || r.includes('1080') || r.includes('square_hd')) return '1K';
  return fallback;
}

const KLING_SHOT_TYPES = ['customize', 'intelligent'];

/** Kling style prompt: prompt OR multi_prompt, never both. */
function klingPrompt(input: In, payload: Record<string, any>) {
  if (Array.isArray(input.multi_prompt) && input.multi_prompt.length > 0) {
    payload.multi_prompt = input.multi_prompt.map((p: any) => ({
      prompt: p.prompt,
      duration: String(p.duration ?? 5),
    }));
    payload.shot_type = KLING_SHOT_TYPES.includes(input.shot_type) ? input.shot_type : 'customize';
  } else if (input.prompt) {
    payload.prompt = input.prompt;
  }
}

const ASPECTS_ALL = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];

export function mapExtraModelInput(endpoint: string, input: In, units: number): Record<string, any> | null {
  switch (endpoint) {
    // ---------- MiniMax H3 ----------
    case 'minimax/h3/text-to-video': {
      const p: In = {
        prompt: input.prompt,
        duration: clamp(secs(input.duration, 5), 5, 15),
        resolution: resolution(input, ['480P', '768P', '2K', '4K'], '480P'),
        aspect_ratio: aspect(input, ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], '16:9'),
        enable_safety_checker: input.enable_safety_checker ?? true,
        prompt_expansion_mode: input.prompt_expansion_mode || 'balanced',
      };
      if (input.seed !== undefined) p.seed = input.seed;
      if (input.target_audio_url) p.target_audio_url = input.target_audio_url;
      return p;
    }
    case 'minimax/h3/image-to-video': {
      const p: In = {
        prompt: input.prompt,
        image_url: startImage(input),
        duration: clamp(secs(input.duration, 5), 5, 15),
        resolution: resolution(input, ['480P', '768P', '2K', '4K'], '480P'),
        enable_safety_checker: input.enable_safety_checker ?? true,
        prompt_expansion_mode: input.prompt_expansion_mode || 'balanced',
      };
      if (endImage(input)) p.end_image_url = endImage(input);
      if (input.seed !== undefined) p.seed = input.seed;
      if (input.target_audio_url) p.target_audio_url = input.target_audio_url;
      return p;
    }
    case 'minimax/h3-max/image-to-video': {
      const p: In = {
        prompt: input.prompt,
        image_url: startImage(input),
        duration: clamp(secs(input.duration, 5), 3, 15),
        resolution: resolution(input, ['480P', '768P', '1080P'], '480P'),
        enable_safety_checker: input.enable_safety_checker ?? true,
        prompt_expansion_mode: input.prompt_expansion_mode || 'balanced',
      };
      if (endImage(input)) p.end_image_url = endImage(input);
      if (input.seed !== undefined) p.seed = input.seed;
      if (input.target_audio_url) p.target_audio_url = input.target_audio_url;
      return p;
    }

    // ---------- HappyHorse 1.1 ----------
    case 'alibaba/happy-horse/v1.1/text-to-video': {
      const p: In = {
        prompt: String(input.prompt || '').slice(0, 2500),
        aspect_ratio: aspect(input, ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21', '5:4', '4:5'], '16:9'),
        resolution: resolution(input, ['720p', '1080p'], '720p'),
        duration: clamp(secs(input.duration, 3), 3, 15),
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
      if (input.seed !== undefined) p.seed = input.seed;
      return p;
    }

    // ---------- Seedance 2.5 text to video ----------
    case 'bytedance/seedance-2.5/text-to-video': {
      const p: In = {
        prompt: input.prompt,
        resolution: resolution(input, ['480p', '720p', '1080p'], '480p'),
        duration: String(clamp(secs(input.duration, 4), 4, 30)),
        aspect_ratio: aspect(input, ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], 'auto', true),
        generate_audio: input.generate_audio ?? input.audio ?? false,
      };
      if (input.draft === true) p.draft = true;
      return p;
    }

    // ---------- Kling ----------
    case 'fal-ai/kling-video/v3/pro/image-to-video': {
      const p: In = {
        start_image_url: startImage(input),
        duration: String(clamp(secs(input.duration, 3), 3, 15)),
        generate_audio: input.generate_audio ?? false,
        negative_prompt: input.negative_prompt || 'blur, distort, and low quality',
        cfg_scale: Number(input.cfg_scale ?? 0.5),
      };
      klingPrompt(input, p);
      if (endImage(input)) p.end_image_url = endImage(input);
      if (input.shot_type && !p.shot_type && KLING_SHOT_TYPES.includes(input.shot_type)) p.shot_type = input.shot_type;
      if (input.enable_safety_checker !== undefined) p.enable_safety_checker = input.enable_safety_checker;
      return p;
    }
    case 'fal-ai/kling-video/o3/4k/text-to-video': {
      const p: In = {
        duration: String(clamp(secs(input.duration, 3), 3, 15)),
        aspect_ratio: aspect(input, ['16:9', '9:16', '1:1'], '16:9'),
        generate_audio: input.generate_audio ?? false,
      };
      klingPrompt(input, p);
      return p;
    }
    case 'fal-ai/kling-video/v3/4k/image-to-video': {
      const p: In = {
        start_image_url: startImage(input),
        duration: String(clamp(secs(input.duration, 3), 3, 15)),
        generate_audio: input.generate_audio ?? false,
        negative_prompt: input.negative_prompt || 'blur, distort, and low quality',
        cfg_scale: Number(input.cfg_scale ?? 0.5),
      };
      klingPrompt(input, p);
      if (endImage(input)) p.end_image_url = endImage(input);
      return p;
    }
    case 'fal-ai/kling-video/o3/pro/image-to-video': {
      const p: In = {
        image_url: startImage(input),
        duration: String(clamp(secs(input.duration, 3), 3, 15)),
        generate_audio: input.generate_audio ?? false,
      };
      klingPrompt(input, p);
      if (endImage(input)) p.end_image_url = endImage(input);
      return p;
    }
    case 'fal-ai/kling-video/v2.6/pro/image-to-video': {
      const p: In = {
        prompt: input.prompt || '',
        start_image_url: startImage(input),
        duration: secs(input.duration, 5) >= 8 ? '10' : '5',
        negative_prompt: input.negative_prompt || 'blur, distort, and low quality',
        generate_audio: input.generate_audio ?? false,
      };
      if (endImage(input)) p.end_image_url = endImage(input);
      if (Array.isArray(input.voice_ids) && input.voice_ids.length) p.voice_ids = input.voice_ids.slice(0, 2);
      return p;
    }
    case 'fal-ai/kling-video/v3/pro/motion-control': {
      const orientation = input.character_orientation === 'video' ? 'video' : 'image';
      const p: In = {
        image_url: first(input.image_url, input.imageUrl),
        video_url: first(input.video_url, input.videoUrl),
        character_orientation: orientation,
        keep_original_sound: input.keep_original_sound ?? true,
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
      if (input.prompt) p.prompt = input.prompt;
      if (orientation === 'video' && Array.isArray(input.elements) && input.elements.length) {
        p.elements = input.elements.slice(0, 1);
      }
      return p;
    }

    // ---------- Wan ----------
    case 'alibaba/wan-3.0-prime/image-to-video': {
      const p: In = {
        start_image_url: startImage(input),
        resolution: resolution(input, ['480p', '720p', '1080p'], '480p'),
        aspect_ratio: aspect(input, ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'], 'adaptive', true),
        duration: clamp(secs(input.duration, 5), 2, 15),
        audio: input.audio ?? input.generate_audio ?? true,
        enable_prompt_expansion: input.enable_prompt_expansion ?? true,
      };
      if (input.prompt) p.prompt = input.prompt;
      if (endImage(input)) p.end_image_url = endImage(input);
      if (input.seed !== undefined) p.seed = input.seed;
      if (input.enable_safety_checker !== undefined) p.enable_safety_checker = input.enable_safety_checker;
      return p;
    }
    case 'fal-ai/wan/v2.7/text-to-video': {
      const p: In = {
        prompt: String(input.prompt || '').slice(0, 5000),
        aspect_ratio: aspect(input, ['16:9', '9:16', '1:1', '4:3', '3:4'], '16:9'),
        resolution: resolution(input, ['720p', '1080p'], '720p'),
        duration: clamp(secs(input.duration, 5), 2, 15),
        enable_prompt_expansion: input.enable_prompt_expansion ?? true,
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
      if (input.audio_url) p.audio_url = input.audio_url;
      if (input.negative_prompt) p.negative_prompt = String(input.negative_prompt).slice(0, 500);
      if (input.seed !== undefined) p.seed = input.seed;
      return p;
    }

    // ---------- Grok Imagine Video ----------
    case 'xai/grok-imagine-video/text-to-video': {
      return {
        prompt: input.prompt,
        duration: clamp(secs(input.duration, 6), 1, 15),
        resolution: resolution(input, ['480p', '720p'], '480p'),
        aspect_ratio: aspect(input, ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'], '16:9'),
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
    }
    case 'xai/grok-imagine-video/image-to-video': {
      return {
        prompt: input.prompt || '',
        image_url: startImage(input),
        duration: clamp(secs(input.duration, 6), 1, 15),
        resolution: resolution(input, ['480p', '720p'], '480p'),
        aspect_ratio: aspect(input, ['auto', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'], 'auto', true),
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
    }
    case 'xai/grok-imagine-video/v1.5/image-to-video': {
      return {
        prompt: input.prompt || '',
        image_url: startImage(input),
        duration: clamp(secs(input.duration, 6), 1, 15),
        resolution: resolution(input, ['480p', '720p', '1080p'], '480p'),
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
    }

    // ---------- Gemini Omni ----------
    case 'google/gemini-omni-flash': {
      return {
        prompt: input.prompt,
        aspect_ratio: aspect(input, ['16:9', '9:16'], '16:9'),
        duration: clamp(secs(input.duration, 3), 3, 10),
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
    }

    // ---------- Sora 2 Pro ----------
    case 'fal-ai/sora-2/text-to-video/pro': {
      return {
        prompt: input.prompt,
        resolution: resolution(input, ['720p', '1080p', 'true_1080p'], '720p'),
        aspect_ratio: aspect(input, ['9:16', '16:9'], '16:9'),
        duration: String(snap(input.duration, [4, 8, 12, 16, 20], 4)),
        delete_video: true,
        detect_and_block_ip: false,
      };
    }
    case 'fal-ai/sora-2/image-to-video/pro': {
      return {
        prompt: input.prompt || '',
        image_url: startImage(input),
        resolution: resolution(input, ['auto', '720p', '1080p', 'true_1080p'], '720p'),
        aspect_ratio: aspect(input, ['auto', '9:16', '16:9'], 'auto', true),
        duration: String(snap(input.duration, [4, 8, 12, 16, 20], 4)),
        delete_video: true,
        detect_and_block_ip: false,
      };
    }

    // ---------- LTX 2.3 ----------
    case 'fal-ai/ltx-2.3/text-to-video': {
      return {
        prompt: input.prompt,
        duration: String(snap(input.duration, [6, 8, 10], 6)),
        resolution: resolution(input, ['1080p', '1440p', '2160p'], '1080p'),
        aspect_ratio: aspect(input, ['16:9', '9:16'], '16:9'),
        fps: String(['24', '25', '48', '50'].includes(String(input.fps)) ? input.fps : '25'),
        generate_audio: input.generate_audio ?? false,
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
    }
    case 'fal-ai/ltx-2.3-22b/audio-to-video': {
      const sizes = ['auto', 'square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'];
      const p: In = {
        prompt: input.prompt || 'A person speaking, natural motion',
        audio_url: first(input.audio_url, input.audioUrl),
        match_audio_length: input.match_audio_length ?? true,
        video_size: sizes.includes(input.video_size) ? input.video_size : 'landscape_16_9',
        fps: Number(input.fps || 24),
        video_output_type: 'X264 (.mp4)',
        video_quality: ['low', 'medium', 'high', 'maximum'].includes(input.video_quality) ? input.video_quality : 'medium',
        enable_prompt_expansion: true,
        enable_safety_checker: true,
      };
      if (first(input.image_url, input.imageUrl)) p.image_url = first(input.image_url, input.imageUrl);
      if (endImage(input)) p.end_image_url = endImage(input);
      if (input.seed !== undefined) p.seed = input.seed;
      return p;
    }
    case 'fal-ai/flashtalk': {
      const p: In = {
        image_url: first(input.image_url, input.imageUrl),
        audio_url: first(input.audio_url, input.audioUrl),
      };
      if (input.seed !== undefined) p.seed = input.seed;
      return p;
    }

    // ---------- HeyGen Avatar V ----------
    case 'fal-ai/heygen/avatar5/digital-twin': {
      const p: In = {
        avatar: input.avatar || 'Abigail Sofa Front',
        fit: input.fit === 'contain' ? 'contain' : 'cover',
        resolution: resolution(input, ['720p', '1080p', '4k'], '720p'),
        aspect_ratio: aspect(input, ['16:9', '9:16', '4:5', '5:4', '1:1', 'auto'], '16:9', true),
        output_format: input.output_format === 'webm' ? 'webm' : 'mp4',
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
      if (input.audio_url) {
        p.audio_url = input.audio_url;
      } else {
        p.prompt = input.prompt;
        p.voice = input.voice || 'Warm Pro Narrator';
      }
      if (input.remove_background !== undefined) p.remove_background = input.remove_background;
      if (input.background && typeof input.background === 'object') p.background = input.background;
      if (input.caption !== undefined) p.caption = input.caption;
      return p;
    }

    // ---------- Veo 3.1 (ends 2026-11-17) ----------
    case 'fal-ai/veo3.1':
    case 'fal-ai/veo3.1/fast': {
      const p: In = {
        prompt: input.prompt,
        aspect_ratio: aspect(input, ['16:9', '9:16'], '16:9'),
        duration: `${snap(input.duration, [4, 6, 8], 4)}s`,
        resolution: resolution(input, ['720p', '1080p', '4k'], '720p'),
        generate_audio: input.generate_audio ?? false,
        auto_fix: input.auto_fix ?? true,
      };
      if (input.negative_prompt) p.negative_prompt = input.negative_prompt;
      if (input.seed !== undefined) p.seed = input.seed;
      return p;
    }
    case 'fal-ai/veo3.1/image-to-video': {
      const p: In = {
        prompt: input.prompt || '',
        image_url: startImage(input),
        aspect_ratio: aspect(input, ['auto', '16:9', '9:16'], 'auto', true),
        duration: `${snap(input.duration, [4, 6, 8], 4)}s`,
        resolution: resolution(input, ['720p', '1080p', '4k'], '720p'),
        generate_audio: input.generate_audio ?? false,
        auto_fix: input.auto_fix ?? true,
      };
      if (input.negative_prompt) p.negative_prompt = input.negative_prompt;
      if (input.seed !== undefined) p.seed = input.seed;
      return p;
    }

    // ---------- Images ----------
    case 'google/nano-banana-2.1': {
      const p: In = {
        prompt: input.prompt,
        num_images: units,
        aspect_ratio: aspect(
          input,
          ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8'],
          'auto',
          true
        ),
        resolution: imageTier(input),
        output_format: String(input.output_format || 'jpeg').toLowerCase(),
        thinking_level: ['minimal', 'medium', 'high'].includes(input.thinking_level) ? input.thinking_level : 'minimal',
        safety_tolerance: String(input.safety_tolerance || '4'),
      };
      if (input.seed !== undefined) p.seed = input.seed;
      if (input.system_prompt) p.system_prompt = input.system_prompt;
      if (input.enable_web_search !== undefined) p.enable_web_search = input.enable_web_search;
      return p;
    }
    case 'google/nano-banana-2.1/edit': {
      const p: In = {
        prompt: input.prompt,
        image_urls: imageList(input),
        num_images: units,
        aspect_ratio: aspect(
          input,
          ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8'],
          'auto',
          true
        ),
        resolution: imageTier(input),
        output_format: String(input.output_format || 'jpeg').toLowerCase(),
        thinking_level: ['minimal', 'medium', 'high'].includes(input.thinking_level) ? input.thinking_level : 'minimal',
        safety_tolerance: String(input.safety_tolerance || '4'),
      };
      if (input.seed !== undefined) p.seed = input.seed;
      if (input.system_prompt) p.system_prompt = input.system_prompt;
      if (input.enable_web_search !== undefined) p.enable_web_search = input.enable_web_search;
      return p;
    }
    case 'fal-ai/nano-banana-pro': {
      const p: In = {
        prompt: input.prompt,
        num_images: units,
        aspect_ratio: aspect(
          input,
          ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8'],
          '1:1',
          true
        ),
        resolution: imageTier(input),
        output_format: String(input.output_format || 'jpeg').toLowerCase(),
        safety_tolerance: String(input.safety_tolerance || '4'),
      };
      if (input.seed !== undefined) p.seed = input.seed;
      if (input.system_prompt) p.system_prompt = input.system_prompt;
      if (input.enable_web_search !== undefined) p.enable_web_search = input.enable_web_search;
      return p;
    }
    case 'blackforestlabs/flux-3/text-to-image': {
      const tiers: Record<string, string> = { '1K': '1k', '2K': '2k', '4K': '4k' };
      const fmt = String(input.output_format || 'jpeg').toLowerCase();
      return {
        prompt: input.prompt,
        aspect_ratio: aspect(
          input,
          ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2'],
          'auto',
          true
        ),
        resolution: tiers[imageTier(input)] || '1k',
        output_format: fmt === 'png' ? 'png' : 'jpeg',
      };
    }
    case 'xai/grok-imagine-image': {
      const fmt = String(input.output_format || 'jpeg').toLowerCase();
      return {
        prompt: input.prompt,
        num_images: units,
        aspect_ratio: aspect(
          input,
          ['2:1', '20:9', '19.5:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:19.5', '9:20', '1:2'],
          '1:1'
        ),
        resolution: imageTier(input) === '1K' ? '1k' : '2k',
        output_format: ['jpeg', 'png', 'webp'].includes(fmt) ? fmt : 'jpeg',
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
    }
    case 'fal-ai/luma-photon': {
      return {
        prompt: input.prompt,
        aspect_ratio: aspect(input, ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'], '1:1'),
        enable_safety_checker: input.enable_safety_checker ?? true,
      };
    }
    case 'fal-ai/qwen-image-2/pro/text-to-image':
    case 'fal-ai/qwen-image-2/text-to-image': {
      const sizes = ['square_hd', 'landscape_4_3', 'portrait_4_3', 'landscape_16_9', 'portrait_16_9'];
      const map: Record<string, string> = {
        '1:1': 'square_hd',
        '4:3': 'landscape_4_3',
        '3:4': 'portrait_4_3',
        '4:5': 'portrait_4_3',
        '16:9': 'landscape_16_9',
        '9:16': 'portrait_16_9',
      };
      const raw = String(first(input.format, input.aspect_ratio) || '');
      const size = sizes.includes(input.image_size) ? input.image_size : map[raw] || 'square_hd';
      return { prompt: input.prompt, image_size: size, num_images: units };
    }


    // ---------- Last batch: previously disabled models ----------
    case 'alibaba/qwen-image-3/text-to-image':
    case 'fal-ai/flux-2/klein/9b': {
      const sizes = ['square_hd', 'square', 'landscape_4_3', 'portrait_4_3', 'landscape_16_9', 'portrait_16_9'];
      const map: Record<string, string> = {
        '1:1': 'square_hd', '4:3': 'landscape_4_3', '3:4': 'portrait_4_3', '4:5': 'portrait_4_3',
        '16:9': 'landscape_16_9', '9:16': 'portrait_16_9',
      };
      const raw = String(first(input.format, input.aspect_ratio) || '');
      const size = sizes.includes(input.image_size) ? input.image_size : map[raw] || 'square_hd';
      return { prompt: input.prompt, image_size: size, num_images: units, output_format: 'png', enable_safety_checker: true };
    }
    case 'fal-ai/fashn/tryon/v1.6': {
      return {
        model_image: first(input.model_image, input.image_url, input.imageUrl),
        garment_image: first(input.garment_image, input.garment_url, input.reference_image_url, input.image_url_2),
        category: input.category || 'auto',
        mode: input.mode || 'balanced',
        garment_photo_type: input.garment_photo_type || 'auto',
        num_samples: 1,
        output_format: 'png',
      };
    }
    case 'fal-ai/bria/background/remove':
      return { image_url: first(input.image_url, input.imageUrl) };
    case 'fal-ai/birefnet/v2':
      return {
        image_url: first(input.image_url, input.imageUrl),
        model: 'General Use (Light)',
        operating_resolution: '1024x1024',
        output_format: 'png',
        refine_foreground: true,
      };
    case 'alibaba/wan-3.0-prime/text-to-video': {
      const p: In = {
        prompt: String(input.prompt || '').slice(0, 5000),
        resolution: resolution(input, ['480p', '720p', '1080p'], '480p'),
        aspect_ratio: aspect(input, ['16:9', '4:3', '1:1', '3:4', '9:16'], '16:9'),
        duration: clamp(secs(input.duration, 5), 2, 15),
        audio: input.audio ?? input.generate_audio ?? true,
        enable_prompt_expansion: input.enable_prompt_expansion ?? true,
      };
      if (input.seed !== undefined) p.seed = input.seed;
      return p;
    }
    case 'bria/video/background-removal/v3':
      return {
        video_url: first(input.video_url, input.videoUrl),
        background_color: input.background_color || 'Transparent',
        output_container_and_codec: input.output_container_and_codec || 'webm_vp9',
      };
    case 'elevenlabs/tts/eleven-v4-turbo': {
      const p: In = {
        text: input.text || input.prompt || '',
        voice: input.voice || 'Rachel',
        stability: Number(input.stability ?? 0.5),
        similarity_boost: Number(input.similarity_boost ?? 0.75),
      };
      if (input.speed !== undefined) p.speed = Number(input.speed);
      if (input.language_code && input.language_code !== 'auto') p.language_code = input.language_code;
      if (input.seed !== undefined) p.seed = Number(input.seed);
      return p;
    }

    case 'fal-ai/minimax/speech-2.8-turbo': {
      const p: In = {
        prompt: input.prompt || input.text || '',
        voice_id: input.voice_id || input.voice || 'Wise_Woman',
        speed: Number(input.speed ?? 1.0),
        emotion: input.emotion || 'neutral',
      };
      if (input.vol !== undefined) p.vol = Number(input.vol);
      if (input.pitch !== undefined) p.pitch = Number(input.pitch);
      return p;
    }
    case 'fal-ai/kokoro/american-english':
      return {
        prompt: input.prompt || input.text || '',
        voice: input.voice || 'af_heart',
        speed: Number(input.speed ?? 1.0),
      };
    case 'fal-ai/orpheus-tts': {
      const p: In = {
        text: input.text || input.prompt || '',
        voice: input.voice || 'tara',
      };
      if (input.temperature !== undefined) p.temperature = Number(input.temperature);
      return p;
    }

    // ---------- Audio: music ----------
    case 'sonilo/v1.1/text-to-music': {
      const sec = Number(input.duration || (input.music_length_ms ? input.music_length_ms / 1000 : 30));
      return {
        prompt: input.prompt,
        duration: clamp(Math.round(sec), 10, 600),
        num_samples: clamp(Number(input.num_samples || 1), 1, 3),
      };
    }
    case 'fal-ai/minimax-music/v2.6': {
      const instrumental = input.is_instrumental ?? input.force_instrumental ?? false;
      let prompt = String(input.prompt || '').trim();
      if (prompt.length < 10) prompt = `${prompt} instrumental music, cinematic, modern`.trim();
      const p: In = {
        prompt: prompt.slice(0, 2000),
        is_instrumental: Boolean(instrumental),
        audio_setting: { sample_rate: '44100', bitrate: '256000', format: 'mp3' },
        enable_safety_checker: true,
      };
      if (!instrumental) {
        if (input.lyrics) p.lyrics = String(input.lyrics).slice(0, 3500);
        if (!input.lyrics || input.lyrics_optimizer) p.lyrics_optimizer = true;
      }
      return p;
    }
    case 'CassetteAI/music-generator': {
      const sec = Number(input.duration || (input.music_length_ms ? input.music_length_ms / 1000 : 30));
      return { prompt: input.prompt, duration: clamp(Math.round(sec), 10, 180) };
    }

    // ---------- Audio: sound effects from video ----------
    case 'sonilo/v1.1/video-to-sound-effects': {
      const fmt = String(input.audio_format || 'mp3');
      const p: In = {
        video_url: first(input.video_url, input.videoUrl),
        audio_format: ['wav', 'mp3', 'aac', 'flac'].includes(fmt) ? fmt : 'mp3',
        keep_speech_vocal: input.keep_speech_vocal ?? false,
      };
      if (input.prompt) p.prompt = input.prompt;
      if (Array.isArray(input.segments) && input.segments.length) p.segments = input.segments;
      return p;
    }
    case 'mirelo-ai/sfx-v1.5/video-to-audio': {
      const p: In = {
        video_url: first(input.video_url, input.videoUrl),
        num_samples: clamp(Number(input.num_samples || 1), 1, 4),
      };
      const text = first(input.text_prompt, input.prompt, input.text);
      if (text) p.text_prompt = text;
      if (input.seed !== undefined) p.seed = input.seed;
      if (input.duration) p.duration = Number(input.duration);
      if (input.start_offset !== undefined) p.start_offset = Number(input.start_offset);
      return p;
    }

    // ---------- Audio: tools ----------
    case 'resemble-ai/chatterboxhd/speech-to-speech': {
      const voices = ['Aurora', 'Blade', 'Britney', 'Carl', 'Cliff', 'Richard', 'Rico', 'Siobhan', 'Vicky'];
      const p: In = {
        source_audio_url: first(input.source_audio_url, input.audio_url, input.audioUrl),
        high_quality_audio: Boolean(input.high_quality_audio),
      };
      if (input.target_voice_audio_url) {
        p.target_voice_audio_url = input.target_voice_audio_url;
      } else {
        p.target_voice = voices.includes(input.target_voice) ? input.target_voice : 'Aurora';
      }
      return p;
    }
    case 'fal-ai/demucs': {
      const models = ['htdemucs', 'htdemucs_ft', 'htdemucs_6s', 'hdemucs_mmi', 'mdx', 'mdx_extra', 'mdx_q', 'mdx_extra_q'];
      const stems = ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'];
      const model = models.includes(input.model) ? input.model : 'htdemucs_6s';
      const p: In = {
        audio_url: first(input.audio_url, input.audioUrl),
        model,
        output_format: input.output_format === 'wav' ? 'wav' : 'mp3',
      };
      if (Array.isArray(input.stems) && input.stems.length) {
        const wanted = input.stems.filter((s: string) => stems.includes(s));
        if (wanted.length) p.stems = wanted;
      }
      return p;
    }
    case 'fal-ai/wizper': {
      const lang = String(first(input.language, input.language_code) || 'auto').toLowerCase();
      return {
        audio_url: first(input.audio_url, input.audioUrl, input.video_url, input.videoUrl),
        task: input.task === 'translate' ? 'translate' : 'transcribe',
        language: lang === 'auto' ? null : lang.slice(0, 2),
        chunk_level: 'segment',
        max_segment_len: 29,
        merge_chunks: true,
      };
    }

    default:
      return null;
  }
}

export const __testing = { aspect, resolution, snap, imageTier };
