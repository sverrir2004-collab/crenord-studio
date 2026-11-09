/**
 * CRENORD extra models (connect batches C01 to C15).
 * Every model here has THREE parts that must stay in sync:
 *  1) this registry entry,
 *  2) a payload branch in src/server/routes/falMappers.ts (mapExtraModelInput),
 *  3) a price rule in src/server/routes/extraPricing.ts (getExtraPricing).
 * All schemas were read from the fal.ai API pages (see docs/MODELS.md for dates).
 */
import type { ModelRegistryEntry } from './models.ts';

type Spec = Omit<ModelRegistryEntry, 'provider' | 'priceVerifiedOn' | 'commercialOk' | 'inputMap' | 'enabled'> & {
  enabled?: boolean;
};

function make(s: Spec): ModelRegistryEntry {
  return {
    provider: 'fal',
    priceVerifiedOn: '',
    commercialOk: false,
    inputMap: {},
    enabled: true,
    ...s,
  } as ModelRegistryEntry;
}

const R_H3 = ['480P', '768P', '2K', '4K'];
const R_H3MAX = ['480P', '768P', '1080P'];
const R_SD = ['480p', '720p', '1080p'];

export const EXTRA_MODELS: ModelRegistryEntry[] = [
  // ==================== VIDEO: MiniMax H3 ====================
  make({
    key: 'vid_minimax_h3_i2v', tool: 'video.create', label: 'MiniMax H3 (image to video)', group: 'Video', badge: 'Budget',
    endpoint: 'minimax/h3/image-to-video', unit: 'second', price: 0.05,
    priceNote: '480P $0.05/s, 768P $0.08/s, 2K $0.13/s, 4K $0.16/s', mode: 'draft', outputType: 'video',
    resolutions: R_H3, formats: ['16:9', '9:16', '1:1', '4:3', '3:4'], maxDuration: 15,
  }),
  make({
    key: 'vid_minimax_h3_max_i2v', tool: 'video.create', label: 'MiniMax H3 Max (image to video)', group: 'Video', badge: 'Max',
    endpoint: 'minimax/h3-max/image-to-video', unit: 'second', price: 0.08,
    priceNote: 'Estimate $0.025 to $0.08/s, check price on fal', mode: 'final', outputType: 'video',
    resolutions: R_H3MAX, formats: ['16:9'], maxDuration: 15,
  }),

  // ==================== VIDEO: HappyHorse, Seedance, Kling, Wan, Grok, Gemini ====================
  make({
    key: 'vid_happy_horse_11_t2v', tool: 'video.create', label: 'HappyHorse 1.1 (text to video)', group: 'Video', badge: 'New',
    endpoint: 'alibaba/happy-horse/v1.1/text-to-video', unit: 'second', price: 0.14,
    priceNote: '720p $0.14/s, 1080p $0.28/s', mode: 'draft', outputType: 'video',
    resolutions: ['720p', '1080p'], formats: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], maxDuration: 15,
  }),
  make({
    key: 'vid_seedance_25_t2v', tool: 'video.create', label: 'Seedance 2.5 (text to video)', group: 'Video', badge: 'Audio',
    endpoint: 'bytedance/seedance-2.5/text-to-video', unit: 'second', price: 0.473,
    priceNote: '480p $0.2205/s, 720p $0.473/s, 1080p $1.164/s', mode: 'final', outputType: 'video',
    resolutions: R_SD, formats: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], maxDuration: 30,
  }),
  make({
    key: 'vid_kling_3_pro_i2v', tool: 'video.create', label: 'Kling 3.0 Pro (image to video)', group: 'Video', badge: 'Pro',
    endpoint: 'fal-ai/kling-video/v3/pro/image-to-video', unit: 'second', price: 0.112,
    priceNote: '$0.112/s without audio (with audio about $0.168/s, estimate)', mode: 'final', outputType: 'video',
    resolutions: ['1080p'], formats: ['16:9'], maxDuration: 15,
  }),
  make({
    key: 'vid_wan_3_prime_i2v', tool: 'video.create', label: 'Wan 3.0 Prime (image to video)', group: 'Video', badge: 'Prime',
    endpoint: 'alibaba/wan-3.0-prime/image-to-video', unit: 'second', price: 0.15,
    priceNote: 'Estimate $0.15/s, check price on fal', mode: 'final', outputType: 'video',
    resolutions: R_SD, formats: ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'], maxDuration: 15,
  }),
  make({
    key: 'vid_grok_15_i2v', tool: 'video.create', label: 'Grok Imagine Video 1.5 (image to video)', group: 'Video', badge: 'Quality',
    endpoint: 'xai/grok-imagine-video/v1.5/image-to-video', unit: 'second', price: 0.07,
    priceNote: 'About $0.07/s, check price on fal', mode: 'draft', outputType: 'video',
    resolutions: R_SD, formats: ['16:9'], maxDuration: 15,
  }),
  make({
    key: 'vid_grok_video_i2v', tool: 'video.create', label: 'Grok Imagine Video (image to video)', group: 'Video', badge: 'Fast',
    endpoint: 'xai/grok-imagine-video/image-to-video', unit: 'second', price: 0.07,
    priceNote: '480p $0.05/s, 720p $0.07/s, plus a small input image fee', mode: 'draft', outputType: 'video',
    resolutions: ['480p', '720p'], formats: ['auto', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'], maxDuration: 15,
  }),
  make({
    key: 'vid_wan_27', tool: 'video.create', label: 'Wan 2.7', group: 'Video', badge: 'Audio',
    endpoint: 'fal-ai/wan/v2.7/text-to-video', unit: 'second', price: 0.10,
    priceNote: '720p $0.10/s, 1080p $0.15/s (unverified)', mode: 'draft', outputType: 'video',
    resolutions: ['720p', '1080p'], formats: ['16:9', '9:16', '1:1', '4:3', '3:4'], maxDuration: 15,
  }),

  // ==================== VIDEO: Sora 2 Pro ====================
  make({
    key: 'vid_sora2_pro_t2v', tool: 'video.create', label: 'Sora 2 Pro', group: 'Video', badge: 'Long clips',
    endpoint: 'fal-ai/sora-2/text-to-video/pro', unit: 'second', price: 0.30,
    priceNote: '720p $0.30/s, 1080p $0.50/s, true 1080p $0.70/s. Lengths 4, 8, 12, 16 or 20 s', mode: 'final', outputType: 'video',
    resolutions: ['720p', '1080p', 'true_1080p'], formats: ['16:9', '9:16'], maxDuration: 20,
  }),
  make({
    key: 'vid_sora2_pro_i2v', tool: 'video.create', label: 'Sora 2 Pro (image to video)', group: 'Video', badge: 'Long clips',
    endpoint: 'fal-ai/sora-2/image-to-video/pro', unit: 'second', price: 0.30,
    priceNote: '720p $0.30/s, 1080p $0.50/s, true 1080p $0.70/s. Lengths 4, 8, 12, 16 or 20 s', mode: 'final', outputType: 'video',
    resolutions: ['auto', '720p', '1080p', 'true_1080p'], formats: ['auto', '16:9', '9:16'], maxDuration: 20,
  }),

  // ==================== VIDEO: Kling 4K, O3 Pro, 2.6 Pro, Motion control ====================
  make({
    key: 'vid_kling_o3_4k_t2v', tool: 'video.create', label: 'Kling O3 4K', group: 'Video', badge: '4K',
    endpoint: 'fal-ai/kling-video/o3/4k/text-to-video', unit: 'second', price: 0.42,
    priceNote: '$0.42/s (audio on or off)', mode: 'final', outputType: 'video',
    resolutions: ['4k'], formats: ['16:9', '9:16', '1:1'], maxDuration: 15,
  }),
  make({
    key: 'vid_kling_v3_4k_i2v', tool: 'video.create', label: 'Kling V3 4K (image to video)', group: 'Video', badge: '4K',
    endpoint: 'fal-ai/kling-video/v3/4k/image-to-video', unit: 'second', price: 0.42,
    priceNote: '$0.42/s', mode: 'final', outputType: 'video',
    resolutions: ['4k'], formats: ['16:9'], maxDuration: 15,
  }),
  make({
    key: 'vid_kling_o3_pro_i2v', tool: 'video.create', label: 'Kling O3 Pro (image to video)', group: 'Video', badge: 'Pro',
    endpoint: 'fal-ai/kling-video/o3/pro/image-to-video', unit: 'second', price: 0.112,
    priceNote: '$0.112/s without audio, $0.14/s with audio', mode: 'final', outputType: 'video',
    resolutions: ['1080p'], formats: ['16:9'], maxDuration: 15,
  }),
  make({
    key: 'vid_kling_26_pro_i2v', tool: 'video.create', label: 'Kling 2.6 Pro (image to video)', group: 'Video', badge: 'Speech in prompt',
    endpoint: 'fal-ai/kling-video/v2.6/pro/image-to-video', unit: 'second', price: 0.07,
    priceNote: '$0.07/s audio off, $0.14/s audio on. Lengths 5 or 10 s', mode: 'draft', outputType: 'video',
    resolutions: ['1080p'], formats: ['16:9'], maxDuration: 10,
  }),
  make({
    key: 'vedit_kling_v3_motion', tool: 'video.edit', label: 'Kling 3 Motion Control', group: 'Video', badge: 'Motion transfer',
    endpoint: 'fal-ai/kling-video/v3/pro/motion-control', unit: 'second', price: 0.168,
    priceNote: 'Price on fal (estimate $0.168/s of output). Move my character like this video', mode: 'final', outputType: 'video',
    resolutions: ['1080p'], formats: ['16:9'], maxDuration: 30,
  }),

  // ==================== VIDEO: LTX, avatar, lip sync ====================
  make({
    key: 'vid_ltx_23_pro', tool: 'video.create', label: 'LTX 2.3 Pro', group: 'Video', badge: 'Up to 4K',
    endpoint: 'fal-ai/ltx-2.3/text-to-video', unit: 'second', price: 0.08,
    priceNote: '1080p $0.08/s, 1440p $0.16/s, 2160p $0.32/s. Lengths 6, 8 or 10 s', mode: 'draft', outputType: 'video',
    resolutions: ['1080p', '1440p', '2160p'], formats: ['16:9', '9:16'], maxDuration: 10,
  }),
  make({
    key: 'vid_heygen_avatar5', tool: 'video.create', label: 'HeyGen Avatar V', group: 'Video', badge: 'Presenter',
    endpoint: 'fal-ai/heygen/avatar5/digital-twin', unit: 'second', price: 0.15,
    priceNote: '$0.15/s of video. Type what the avatar should say in the prompt', mode: 'final', outputType: 'video',
    resolutions: ['720p', '1080p', '4k'], formats: ['16:9', '9:16', '4:5', '5:4', '1:1', 'auto'], maxDuration: 60,
  }),
  make({
    key: 'vid_ltx_23_audio2video', tool: 'audio.lipsync', label: 'LTX 2.3 Audio to Video', group: 'Voice', badge: 'Audio to video',
    endpoint: 'fal-ai/ltx-2.3-22b/audio-to-video', unit: 'second', price: 0.10,
    priceNote: 'Price on fal (estimate $0.10/s of audio). Make a video from audio', mode: 'final', outputType: 'video',
  }),
  make({
    key: 'lipsync_flashtalk', tool: 'audio.lipsync', label: 'Flashtalk (talking photo)', group: 'Voice', badge: 'Talking photo',
    endpoint: 'fal-ai/flashtalk', unit: 'second', price: 0.05,
    priceNote: 'Price on fal (estimate $0.05/s of audio)', mode: 'draft', outputType: 'video',
  }),

  // ==================== VIDEO: Veo 3.1 (ends 17 Nov 2026) ====================
  make({
    key: 'vid_veo31_t2v', tool: 'video.create', label: 'Veo 3.1', group: 'Video', badge: 'Ends 17 Nov',
    endpoint: 'fal-ai/veo3.1', unit: 'second', price: 0.20,
    priceNote: 'Ends 17 Nov 2026. $0.20/s without audio, $0.40/s with audio (4K $0.40 / $0.60)', mode: 'final', outputType: 'video',
    resolutions: ['720p', '1080p', '4k'], formats: ['16:9', '9:16'], maxDuration: 8,
  }),
  make({
    key: 'vid_veo31_i2v', tool: 'video.create', label: 'Veo 3.1 (image to video)', group: 'Video', badge: 'Ends 17 Nov',
    endpoint: 'fal-ai/veo3.1/image-to-video', unit: 'second', price: 0.20,
    priceNote: 'Ends 17 Nov 2026. $0.20/s without audio, $0.40/s with audio (4K $0.40 / $0.60)', mode: 'final', outputType: 'video',
    resolutions: ['720p', '1080p', '4k'], formats: ['auto', '16:9', '9:16'], maxDuration: 8,
  }),
  make({
    key: 'vid_veo31_fast_t2v', tool: 'video.create', label: 'Veo 3.1 Fast', group: 'Video', badge: 'Ends 17 Nov',
    endpoint: 'fal-ai/veo3.1/fast', unit: 'second', price: 0.10,
    priceNote: 'Ends 17 Nov 2026. $0.10/s without audio, $0.15/s with audio (4K $0.30 / $0.35)', mode: 'draft', outputType: 'video',
    resolutions: ['720p', '1080p', '4k'], formats: ['16:9', '9:16'], maxDuration: 8,
  }),

  // ==================== IMAGE ====================
  make({
    key: 'img_luma_photon', tool: 'image.create', label: 'Luma Photon', group: 'Image', badge: 'Photo',
    endpoint: 'fal-ai/luma-photon', unit: 'image', price: 0.02,
    priceNote: 'Estimate $0.02 per image. One image at a time', mode: 'draft', outputType: 'image',
    formats: ['jpeg', 'png'],
  }),
  make({
    key: 'img_qwen_image_2_pro', tool: 'image.create', label: 'Qwen Image 2 Pro', group: 'Image', badge: 'Text in images',
    endpoint: 'fal-ai/qwen-image-2/pro/text-to-image', unit: 'image', price: 0.075,
    priceNote: '$0.075 per image', mode: 'final', outputType: 'image',
    resolutions: ['square_hd', 'landscape_4_3', 'portrait_4_3', 'landscape_16_9', 'portrait_16_9'], formats: ['jpeg', 'png'],
  }),
  make({
    key: 'img_qwen_image_2', tool: 'image.create', label: 'Qwen Image 2', group: 'Image', badge: 'Text in images',
    endpoint: 'fal-ai/qwen-image-2/text-to-image', unit: 'image', price: 0.035,
    priceNote: '$0.035 per image', mode: 'draft', outputType: 'image',
    resolutions: ['square_hd', 'landscape_4_3', 'portrait_4_3', 'landscape_16_9', 'portrait_16_9'], formats: ['jpeg', 'png'],
  }),

  // ==================== AUDIO: music and sound effects ====================
  make({
    key: 'music_sonilo', tool: 'audio.music', label: 'Sonilo Music', group: 'Voice', badge: 'Music',
    endpoint: 'sonilo/v1.1/text-to-music', unit: 'second', price: 0.005,
    priceNote: 'Estimate $0.005 per second per track (tracks under 10 s bill as 10 s)', mode: 'draft', outputType: 'audio',
  }),
  make({
    key: 'music_minimax_26', tool: 'audio.music', label: 'MiniMax Music 2.6', group: 'Voice', badge: 'Songs with vocals',
    endpoint: 'fal-ai/minimax-music/v2.6', unit: 'generation', price: 0.15,
    priceNote: 'Estimate $0.15 per song. If fal reports an error for this endpoint, MiniMax has closed it', mode: 'final', outputType: 'audio',
  }),
  make({
    key: 'music_cassette', tool: 'audio.music', label: 'CassetteAI Music', group: 'Voice', badge: 'Fast',
    endpoint: 'CassetteAI/music-generator', unit: 'generation', price: 0.03,
    priceNote: 'Estimate $0.03 per track', mode: 'draft', outputType: 'audio',
  }),
  make({
    key: 'sfx_sonilo_video', tool: 'audio.sfx', label: 'Sonilo Video to Sound Effects', group: 'Voice', badge: 'From video',
    endpoint: 'sonilo/v1.1/video-to-sound-effects', unit: 'second', price: 0.005,
    priceNote: 'Estimate $0.005 per second of video', mode: 'draft', outputType: 'audio',
  }),
  make({
    key: 'sfx_mirelo_15', tool: 'audio.sfx', label: 'Mirelo SFX 1.5', group: 'Voice', badge: 'From video',
    endpoint: 'mirelo-ai/sfx-v1.5/video-to-audio', unit: 'generation', price: 0.02,
    priceNote: 'Estimate $0.02 per generated sample', mode: 'draft', outputType: 'audio',
  }),

  // ==================== AUDIO: tools ====================
  make({
    key: 'tool_demucs', tool: 'audio.separate', label: 'Split vocals and music (Demucs)', group: 'Voice', badge: 'Stems',
    endpoint: 'fal-ai/demucs', unit: 'generation', price: 0.03,
    priceNote: 'Estimate $0.03 per call', mode: 'draft', outputType: 'audio',
  }),
  make({
    key: 'stt_wizper', tool: 'audio.stt', label: 'Whisper (Wizper)', group: 'Voice', badge: 'Cheaper transcript',
    endpoint: 'fal-ai/wizper', unit: 'minute', price: 0.006,
    priceNote: 'Estimate $0.006 per minute', mode: 'draft', outputType: 'audio',
  }),
];
