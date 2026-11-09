/**
 * Price rules for the models connected in batches C01 to C15.
 * getExtraPricing(model, input) returns { rate, units } (rate in USD per unit) or null
 * when the model is not handled here, in which case the default rules in jobs.ts apply.
 * These are estimates shown to the user before a job runs and used by the cost guard.
 */

type In = Record<string, any>;

const secs = (v: any, fb: number) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fb;
};

function videoSeconds(input: In, fb = 5) {
  return secs(input.duration, fb);
}

function res(input: In, fb: string) {
  return String(input.resolution || fb).toLowerCase();
}

export function getExtraPricing(
  model: { endpoint: string; price: number },
  input: In
): { rate: number; units: number } | null {
  const ep = model.endpoint;
  const audioOn = (fallback: boolean) => Boolean(input.generate_audio ?? input.audio ?? fallback);

  switch (ep) {
    // ---- MiniMax H3 ----
    case 'minimax/h3/text-to-video':
    case 'minimax/h3/image-to-video': {
      const r = res(input, '480p');
      const rate = r === '4k' ? 0.16 : r === '2k' ? 0.13 : r.includes('768') ? 0.08 : 0.05;
      return { rate, units: videoSeconds(input) };
    }
    case 'minimax/h3-max/image-to-video': {
      const r = res(input, '480p');
      const rate = r.includes('1080') ? 0.08 : r.includes('768') ? 0.04 : 0.025;
      return { rate, units: videoSeconds(input) };
    }

    // ---- Kling ----
    case 'fal-ai/kling-video/v3/pro/image-to-video':
      return { rate: audioOn(false) ? 0.168 : 0.112, units: videoSeconds(input, 3) };
    case 'fal-ai/kling-video/o3/4k/text-to-video':
    case 'fal-ai/kling-video/v3/4k/image-to-video':
      return { rate: 0.42, units: videoSeconds(input, 3) };
    case 'fal-ai/kling-video/o3/pro/image-to-video':
      return { rate: audioOn(false) ? 0.14 : 0.112, units: videoSeconds(input, 3) };
    case 'fal-ai/kling-video/v2.6/pro/image-to-video': {
      const s = videoSeconds(input, 5) >= 8 ? 10 : 5;
      return { rate: audioOn(false) ? 0.14 : 0.07, units: s };
    }
    case 'fal-ai/kling-video/v3/pro/motion-control':
      return { rate: 0.168, units: Math.max(1, Number(input.duration) || 5) };

    // ---- Wan ----
    case 'alibaba/wan-3.0-prime/image-to-video':
      return { rate: 0.15, units: videoSeconds(input) };
    case 'fal-ai/wan/v2.7/text-to-video':
      return { rate: res(input, '720p').includes('1080') ? 0.15 : 0.10, units: videoSeconds(input) };

    // ---- Grok Imagine Video ----
    case 'xai/grok-imagine-video/text-to-video': {
      const rate = res(input, '480p').includes('720') ? 0.07 : 0.05;
      return { rate, units: videoSeconds(input, 6) };
    }
    case 'xai/grok-imagine-video/image-to-video': {
      const rate = res(input, '480p').includes('720') ? 0.07 : 0.05;
      const s = videoSeconds(input, 6);
      return { rate: rate + 0.002 / s, units: s };
    }
    case 'xai/grok-imagine-video/v1.5/image-to-video':
      return { rate: 0.07, units: videoSeconds(input, 6) };

    // ---- Gemini Omni ----
    case 'google/gemini-omni-flash':
      return { rate: 0.10, units: videoSeconds(input, 3) };

    // ---- Sora 2 Pro ----
    case 'fal-ai/sora-2/text-to-video/pro':
    case 'fal-ai/sora-2/image-to-video/pro': {
      const r = res(input, '720p');
      const rate = r === 'true_1080p' ? 0.70 : r === '1080p' ? 0.50 : 0.30;
      const allowed = [4, 8, 12, 16, 20];
      const n = videoSeconds(input, 4);
      const s = allowed.reduce((b, a) => (Math.abs(a - n) < Math.abs(b - n) ? a : b), allowed[0]);
      return { rate, units: s };
    }

    // ---- LTX ----
    case 'fal-ai/ltx-2.3/text-to-video': {
      const r = res(input, '1080p');
      const rate = r.includes('2160') || r === '4k' ? 0.32 : r.includes('1440') ? 0.16 : 0.08;
      const allowed = [6, 8, 10];
      const n = videoSeconds(input, 6);
      const s = allowed.reduce((b, a) => (Math.abs(a - n) < Math.abs(b - n) ? a : b), allowed[0]);
      return { rate, units: s };
    }
    case 'fal-ai/ltx-2.3-22b/audio-to-video':
      return { rate: 0.10, units: Math.max(1, Number(input.duration) || 5) };
    case 'fal-ai/flashtalk':
      return { rate: 0.05, units: Math.max(1, Number(input.duration) || 5) };

    // ---- HeyGen: 15 characters of text per second when no audio is given ----
    case 'fal-ai/heygen/avatar5/digital-twin': {
      const fromText = Math.ceil(String(input.prompt || '').length / 15);
      const s = Number(input.duration) || fromText || 5;
      return { rate: 0.15, units: Math.max(1, s) };
    }

    // ---- Veo 3.1 (ends 2026-11-17) ----
    case 'fal-ai/veo3.1':
    case 'fal-ai/veo3.1/image-to-video':
    case 'fal-ai/veo3.1/fast': {
      const fast = ep.endsWith('/fast');
      const four = res(input, '720p') === '4k';
      const audio = audioOn(false);
      let rate: number;
      if (fast) rate = four ? (audio ? 0.35 : 0.30) : audio ? 0.15 : 0.10;
      else rate = four ? (audio ? 0.60 : 0.40) : audio ? 0.40 : 0.20;
      const allowed = [4, 6, 8];
      const n = videoSeconds(input, 4);
      const s = allowed.reduce((b, a) => (Math.abs(a - n) < Math.abs(b - n) ? a : b), allowed[0]);
      return { rate, units: s };
    }

    // ---- Images ----
    case 'google/nano-banana-2.1':
    case 'google/nano-banana-2.1/edit': {
      const r = res(input, '1k');
      const mult = r.includes('4k') ? 2 : r.includes('2k') ? 1.5 : 1;
      return { rate: (ep.endsWith('/edit') ? 0.10 : 0.08) * mult, units: Number(input.variants || input.num_images || 1) };
    }
    case 'fal-ai/nano-banana-pro': {
      const r = res(input, '1k');
      return { rate: r.includes('4k') ? 0.30 : 0.15, units: Number(input.variants || input.num_images || 1) };
    }
    case 'xai/grok-imagine-image': {
      const r = res(input, '1k');
      return { rate: r.includes('2k') || r.includes('4k') ? 0.07 : 0.05, units: Number(input.variants || input.num_images || 1) };
    }
    case 'fal-ai/luma-photon':
      return { rate: 0.02, units: 1 };
    case 'fal-ai/qwen-image-2/pro/text-to-image':
      return { rate: 0.075, units: Number(input.variants || input.num_images || 1) };
    case 'fal-ai/qwen-image-2/text-to-image':
      return { rate: 0.035, units: Number(input.variants || input.num_images || 1) };

    // ---- Audio ----
    case 'sonilo/v1.1/text-to-music': {
      const sec = Number(input.duration || (input.music_length_ms ? input.music_length_ms / 1000 : 30));
      const n = Math.min(3, Math.max(1, Number(input.num_samples || 1)));
      return { rate: 0.005, units: Math.max(10, Math.round(sec)) * n };
    }
    case 'fal-ai/minimax-music/v2.6':
      return { rate: 0.15, units: 1 };
    case 'CassetteAI/music-generator':
      return { rate: 0.03, units: 1 };
    case 'sonilo/v1.1/video-to-sound-effects':
      return { rate: 0.005, units: Math.max(1, Number(input.duration) || 10) };
    case 'mirelo-ai/sfx-v1.5/video-to-audio':
      return { rate: 0.02, units: Math.min(4, Math.max(1, Number(input.num_samples || 1))) };
    case 'resemble-ai/chatterboxhd/speech-to-speech':
      return { rate: 0.03, units: 1 };
    case 'fal-ai/demucs':
      return { rate: 0.03, units: 1 };
    case 'fal-ai/wizper':
      return { rate: 0.006, units: Math.max(0.1, (Number(input.duration) || 60) / 60) };

    default:
      return null;
  }
}
