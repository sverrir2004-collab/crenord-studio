# CRENORD model catalog (fal.ai)
 
How to use this file:
- It is the catalog and wish list of models for the registry in `src/server/registry/models.ts`.
- CONNECTED (Batch 2): The endpoint ID and exact parameters were verified against fal.ai API pages on 2026-11-08 and are enabled (`enabled: true`, `commercialOk: false`, `priceVerifiedOn: ''`).
- Prices reflect verified fal.ai rates as of 2026-11-08 / 2026-11-16.
- DISABLED: Kept registered with `enabled: false` (e.g. license unclear, API playground only, or parameters pending user paste).
 
## IMAGE - create
| Label | Endpoint id | Price (verified/corrected) | Status |
|---|---|---|---|
| Seedream 5.0 Lite (DEFAULT DRAFT) | fal-ai/bytedance/seedream/v5/lite/text-to-image | $0.035 per image | CONNECTED |
| Seedream 5.0 Pro | bytedance/seedream/v5/pro/text-to-image | $0.0675 per image | CONNECTED |
| Seedream 4.5 | fal-ai/bytedance/seedream/v4.5/text-to-image | $0.040 per image | CONNECTED |
| Nano Banana 2.1 | google/nano-banana-2.1 | $0.040 per image | CONNECTED |
| Nano Banana 2 | fal-ai/nano-banana-2 | $0.080 per image at 1K | CONNECTED |
| Nano Banana Pro | fal-ai/nano-banana-pro | $0.150 per image at 1K | CONNECTED |
| GPT Image 2 | openai/gpt-image-2 | from $0.005 (low) to $0.40 (4K high) | CONNECTED |
| GPT Image 2.5 Flare | openai/gpt-image-2.5/flare/text-to-image | $0.030 per image | CONNECTED |
| GPT Image 2.5 Sunburst | openai/gpt-image-2.5/sunburst/text-to-image | $0.040 per image | CONNECTED |
| FLUX 3 Image | blackforestlabs/flux-3/text-to-image | $0.050 per image | CONNECTED |
| FLUX.2 Pro | fal-ai/flux-2-pro | $0.050 per image | CONNECTED |
| FLUX.2 Max | fal-ai/flux-2-max | $0.07 first MP, $0.03 each extra | CONNECTED |
| Recraft V4 Pro | fal-ai/recraft/v4/pro/text-to-image | $0.250 per image | CONNECTED (Price corrected) |
| Recraft V4.1 Pro | fal-ai/recraft/v4.1/pro/text-to-image | $0.210 per image | CONNECTED (Price corrected) |
| Ideogram V3 | fal-ai/ideogram/v3 | $0.030 (turbo), $0.060 (balanced), $0.090 (quality) | CONNECTED |
| Grok Imagine (quality) | xai/grok-imagine-image/quality/text-to-image | $0.050 at 1K, $0.070 at 2K | CONNECTED |
| Z-Image Turbo | fal-ai/z-image/turbo | $0.020 per image | CONNECTED |
| Krea 3 | krea/v3/text-to-image | $0.025 per output MP | CONNECTED (Price corrected) |
| FLUX.1 schnell (cheap fallback) | fal-ai/flux/schnell | $0.003 per image | CONNECTED |
| FLUX.2 klein 9B | fal-ai/flux-2/klein/9b | $0.006 per MP | DISABLED (License unclear) |
| Qwen Image 3 | alibaba/qwen-image-3/text-to-image | check | DISABLED (Not yet connected) |
 
## IMAGE - edit & utilities
| Label | Endpoint id | Price | Status |
|---|---|---|---|
| Nano Banana 2.1 Edit | google/nano-banana-2.1/edit | $0.040 per image | CONNECTED |
| Nano Banana 2 Edit | fal-ai/nano-banana-2/edit | $0.080 per image | CONNECTED (ID corrected) |
| Nano Banana Pro Edit | fal-ai/nano-banana-pro/edit | $0.150 per image | CONNECTED |
| GPT Image 2 Edit | openai/gpt-image-2/edit | $0.020 per image | CONNECTED |
| GPT Image 2.5 Sunburst Edit | openai/gpt-image-2.5/sunburst/edit | $0.040 per image | CONNECTED |
| FLUX 3 Image Edit | blackforestlabs/flux-3/edit-image | $0.048 per 1K image | CONNECTED (Price corrected) |
| FLUX.1 Kontext Pro | fal-ai/flux-pro/kontext | $0.040 per image | CONNECTED (Price corrected) |
| Seedream 4.0 Edit | fal-ai/bytedance/seedream/v4/edit | $0.035 per image | CONNECTED |
| Grok Imagine Edit | xai/grok-imagine-image/edit | $0.050 per image | CONNECTED (ID corrected) |
| Bria Fibo 2 Edit | bria/fibo-2/edit | $0.040 per image | CONNECTED |
| Qwen Image 3 Edit | alibaba/qwen-image-3/edit | $0.030 per image | CONNECTED |
| Bria guided remove background | bria/guided-remove-background | $0.030 per image | CONNECTED |
| BiRefNet v2 background removal | fal-ai/birefnet/v2 | $0.010 per image | CONNECTED |
| Clarity upscaler | fal-ai/clarity-upscaler | $0.030 per MP | CONNECTED |
| Topaz Image Upscale | topaz/upscale/image/generative | $0.050 per image | CONNECTED (ID corrected) |
| Bria Eraser (mask) | fal-ai/bria/eraser | $0.040 per generation | CONNECTED |
| Virtual try-on (FASHN) | fal-ai/fashn/tryon/v1.6 | $0.075 per generation | DISABLED (Schema pending user paste) |
 
## VIDEO - create (price per second of output)
| Label | Endpoint ids | Price (verified/corrected) | Status |
|---|---|---|---|
| MiniMax H3 Max Turbo (CHEAPEST DRAFT) | minimax/h3-max-turbo/image-to-video, minimax/h3-max-turbo/text-to-video | 480P: $0.025/s, 768P: $0.040/s, 1080P: $0.080/s | CONNECTED |
| MiniMax H3 | minimax/h3/text-to-video, minimax/h3/image-to-video | 480p: $0.050/s, 768p: $0.080/s | CONNECTED |
| MiniMax H3 Max | minimax/h3-max/text-to-video, minimax/h3-max/image-to-video | 768P: $0.080/s | CONNECTED |
| HappyHorse | alibaba/happy-horse/image-to-video, alibaba/happy-horse/text-to-video | 720p: $0.140/s, 1080p: $0.280/s | CONNECTED |
| Seedance 2.0 Fast | bytedance/seedance-2.0/fast/image-to-video, bytedance/seedance-2.0/fast/text-to-video | 720p: $0.2419/s (audio included) | CONNECTED (Price corrected) |
| Seedance 2.5 | bytedance/seedance-2.5/text-to-video, bytedance/seedance-2.5/image-to-video | 480p: $0.2205/s, 720p: $0.4730/s, 1080p: $1.164/s | CONNECTED |
| Kling 3.0 Pro | fal-ai/kling-video/v3/pro/text-to-video, fal-ai/kling-video/v3/pro/image-to-video | $0.112/s (no audio), $0.140/s (with audio) | CONNECTED |
| Kling 3.0 Standard | fal-ai/kling-video/v3/standard/image-to-video | $0.080/s | CONNECTED |
| Kling V3 Turbo Pro | fal-ai/kling-video/v3/turbo/pro/image-to-video | $0.140/s | CONNECTED (ID & price corrected) |
| Kling 2.5 Turbo Pro | fal-ai/kling-video/v2.5-turbo/pro/image-to-video | $0.070/s | CONNECTED (ID corrected) |
| Kling 4.0 | kling/v4/text-to-video, kling/v4/image-to-video | 720p: $0.157/s, 1080p: $0.235/s | DISABLED (Playground only) |
| Wan 3.0 Prime | alibaba/wan-3.0-prime/text-to-video, alibaba/wan-3.0-prime/image-to-video | 720p: $0.100/s, 1080p: $0.150/s | CONNECTED |
| Wan 3.0 (non-Prime) | alibaba/wan-3.0/image-to-video | check | DISABLED (Not yet connected) |
| Grok Imagine Video 1.5 | xai/grok-imagine-video/v1.5/text-to-video, xai/grok-imagine-video/v1.5/image-to-video | $0.070/s | CONNECTED |
| Gemini Omni Flash 1.2 | google/gemini-omni-flash/v1.2/text-to-video | $0.120/s | CONNECTED |
| FLUX 3 video | blackforestlabs/flux-3/image-to-video | $0.120/s | CONNECTED |
| LTX 2.5 Fast | lightricks/ltx-2.5/image-to-video/fast | 720p: $0.090/s, 1080p: $0.130/s, 1440p: $0.190/s, 4K: $0.300/s | CONNECTED (Price corrected) |
| PixVerse V6 | fal-ai/pixverse/v6/image-to-video | $0.080/s | CONNECTED |
| PixVerse C1 | fal-ai/pixverse/c1/text-to-video | check | DISABLED (Not yet connected) |
 
## VIDEO - edit, clean, upscale
| Label | Endpoint id | Price | Status |
|---|---|---|---|
| MiniMax H3 Max Extend | minimax/h3-max/extend-video | $0.080/s | CONNECTED |
| Kling O3 Edit Video Pro | fal-ai/kling-video/o3/pro/video-to-video/edit | $0.168/s | CONNECTED (Price corrected) |
| Grok Imagine Edit Video | xai/grok-imagine-video/edit-video | $0.050/s (First 8s only) | CONNECTED |
| Video Upscaler | fal-ai/video-upscaler | $0.050 fixed | CONNECTED (Replaced RealESRGAN) |
| Bria video eraser (prompt) | bria/bria_video_eraser/erase/prompt | $0.140/s | CONNECTED |
| Bria video eraser (mask) | bria/bria_video_eraser/erase/mask | $0.140/s | CONNECTED |
| Topaz video upscalers | topaz/upscale/video/... | check | DISABLED (Not yet connected) |

## AUDIO - ElevenLabs voice, dialogue, SFX, music, STT & lip sync
| Label | Endpoint id | Price (verified/corrected) | Status |
|---|---|---|---|
| ElevenLabs Turbo v2.5 (CHEAPEST DRAFT) | fal-ai/elevenlabs/tts/turbo-v2.5 | $0.05 per 1,000 characters | CONNECTED |
| ElevenLabs v4 (Pro) | elevenlabs/tts/eleven-v4 | $0.10 per 1,000 characters | CONNECTED |
| ElevenLabs v3 | fal-ai/elevenlabs/tts/eleven-v3 | $0.10 per 1,000 characters | CONNECTED |
| ElevenLabs Multilingual v2 | fal-ai/elevenlabs/tts/multilingual-v2 | $0.10 per 1,000 characters | CONNECTED |
| ElevenLabs v4 Turbo | elevenlabs/tts/eleven-v4-turbo | $0.05 per 1,000 characters | DISABLED (Not connected yet) |
| ElevenLabs Text to Dialogue (v3) | fal-ai/elevenlabs/text-to-dialogue/eleven-v3 | $0.10 per 1,000 characters | CONNECTED |
| ElevenLabs Sound Effects v2 | fal-ai/elevenlabs/sound-effects/v2 | $0.05 per generation | CONNECTED |
| ElevenLabs Music | fal-ai/elevenlabs/music | $0.80 per minute | CONNECTED |
| ElevenLabs Voice Changer | fal-ai/elevenlabs/voice-changer | $0.30 per minute | DISABLED (Schema unverified) |
| ElevenLabs Dubbing | fal-ai/elevenlabs/dubbing | $0.90 per minute | CONNECTED |
| ElevenLabs Scribe v2 (Captions) | fal-ai/elevenlabs/speech-to-text/scribe-v2 | $0.008 per minute | CONNECTED |
| Kling Lip Sync (Audio-to-Video) | fal-ai/kling-video/lipsync/audio-to-video | $0.140/s (2-10s video, 720p/1080p) | CONNECTED |
| Sync.so 1.9 Lip Sync | fal-ai/sync-lipsync | $0.100/s | CONNECTED |
| Video Sound Mix (Server FFmpeg) | local/ffmpeg/audio-mix | Free ($0.00) | CONNECTED |
| Burn Captions (Server FFmpeg) | local/ffmpeg/burn-captions | Free ($0.00) | CONNECTED |

## NOT on fal.ai (do not register)
- Higgsfield Soul 2.0, Soul Cinema, Soul, Face Swap, Character Swap, Genjutsu, Genjutsu Lite, Intone: Higgsfield proprietary products.
- Multi Reference, Auto, Kling O1 image, GPT Image 2.6 Sunburst/Flare, Ideogram 4.5, Ideogram Vector, Ideogram Precise Edit, Recraft V4.1 Utility/Styles, Seedream 5.0 Flash, Nano Banana 2 Lite, Grok Imagine 2.0 image, Grok Imagine 1.5 Lite, Gemini Omni Flash Edit, Seedance 2.0 Mini, MiniMax H3 Lite/Highspeed, WAN 2.2: not found on fal on 2026-11-08.
