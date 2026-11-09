# Decisions
 
- Project created. Brand: CRENORD. Provider: fal.ai. Auth: Firebase Google sign-in, owner only.
- OVERRIDE of ARCHITECTURE.md seed list: img_draft is now bytedance/seedream/v5/lite/text-to-image at 0.035 USD per image (unit: image). The model fal-ai/flux-2/klein/9b is NOT used for now because its commercial license is unclear. If added later it must be registered with commercialOk false and enabled false.
- OVERRIDE: the default Draft video model is alibaba/happy-horse/image-to-video at 720p, about 0.14 USD per second. Seedance 2.5 is only used in Final mode.
- Models marked commercialOk false in the registry must not be offered in the UI until the owner confirms the commercial-use badge on the fal model page.
- Prices in the registry are research values and must be re-verified on the fal model page before launch.
- File storage: until dedicated cloud storage exists, keep the fal URL and send the header X-Fal-Object-Lifecycle-Preference with expiration_duration_seconds set to null so output files do not expire.
- Owner chose no cost limit. fal prepaid balance is the real ceiling.
- Owner chose no cost limit and a high rate limit.
- Step 19 Audio & Video Sound: Connected ElevenLabs voiceover (Draft: Turbo v2.5 at $0.05/1k chars, Final: Eleven v4 at $0.10/1k chars, Multilingual v2, and Eleven v3), Dialogue v3, Sound Effects v2, Music ($0.80/min), Scribe v2 STT ($0.008/min), Dubbing ($0.90/min), and Lip Sync (Kling $0.14/s, Sync.so $0.10/s). ElevenLabs Voice Changer and Eleven v4 Turbo are marked disabled pending verified schema. Video audio mixing and caption burning run locally on the server via FFmpeg at zero model cost.


