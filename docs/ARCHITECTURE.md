# CRENORD architecture
 
## Stack
- Client: React + TypeScript (AI Studio default), React Router, lucide-react. No other UI libraries.
- Server: Node.js + Express + TypeScript in the same project (AI Studio full-stack runtime).
- Auth: Firebase Authentication, Sign in with Google. The server verifies the Firebase ID token on every /api request (firebase-admin) and only allows the email in the secret OWNER_EMAIL.
- Database: Firestore. Collections: jobs, assets, projects, usage. The client never writes to Firestore. All writes go through the server. Firestore rules: allow read only when resource.data.uid == request.auth.uid, deny all writes.
- AI provider: fal.ai through @fal-ai/client, server only. Secret: FAL_KEY. Never log it and never send it to the client.
- File storage: the server copies every generated output to our own storage (Cloud Storage or Firebase Storage if it can be enabled in this project). Until that exists, keep the fal URL and send the header X-Fal-Object-Lifecycle-Preference with expiration_duration_seconds set to null so files do not expire. Note this in docs/DECISIONS.md.
- Non-AI media work (resize, crop, pad, trim, mask video) runs on the server: sharp for images and ffmpeg for video. These steps cost no model credits.
 
## Folder structure
- src/client: pages, components, lib/api.ts, styles/tokens.css
- src/server: index.ts, routes (jobs, uploads, assets, projects, usage, models), services (fal, jobs, costGuard, storage, auth), registry/models.ts
- docs: ARCHITECTURE.md, DESIGN.md, DECISIONS.md
 
## API (all routes require auth)
- POST /api/uploads: multipart file, validate type and size, upload, return assetId and url.
- POST /api/jobs: body { tool, modelKey, input, projectId? }. Validate with zod against the registry, run the cost guard, submit to the fal queue, create the job doc, return the job.
- GET /api/jobs/:id: return the job. If status is queued or running, ask fal for the status (reconcile on read). On completion fetch the result, persist outputs, create asset docs, write the usage row and return the final job.
- GET /api/jobs?limit=: recent jobs. POST /api/jobs/:id/cancel.
- GET /api/assets (filters), PATCH /api/assets/:id (favourite, rename), DELETE /api/assets/:id (soft delete).
- GET /api/projects, POST /api/projects, GET/PATCH/DELETE /api/projects/:id, POST /api/projects/:id/assets.
- GET /api/usage: daily totals and rows.
- GET /api/models: the registry as the UI needs it (labels, groups, badges, estimated cost). Never expose FAL_KEY or internal endpoint secrets.
 
## Job lifecycle
- Status: queued, running, succeeded, failed, canceled.
- Job fields: id, uid, tool, modelKey, falEndpoint, falRequestId, input (sanitised), estCostUsd, status, error, outputs [assetId, url, type], createdAt, updatedAt, finishedAt, confirmedRights (for Clean).
- Submit with fal.queue.submit. Never use a blocking call for video. The client polls GET /api/jobs/:id every 3 seconds (back off to 8 seconds).
- No in-memory state: the server may restart at any time. Resume by reconciling jobs that are queued or running whenever they are read or listed.
- Webhooks are NOT used until the app runs on a public HTTPS URL. Polling first.
 
## Cost guard (mandatory)
- The registry gives a unit and a price per model. estCostUsd = price x units (images, megapixels or seconds), computed on the server.
- Reject a job if today's total estCostUsd plus this job exceeds DAILY_CAP_USD (secret, default 3), or if this job alone exceeds MAX_JOB_USD (secret, default 1.5). Return a clear error that the UI shows.
- Default to Draft mode: the cheapest model for the tool, the lowest resolution and the shortest duration. Expensive models need the user to switch to Final.
- Write a usage row for every submitted job. Mark failed jobs. fal does not bill server errors (HTTP 500 and above) but may bill invalid input (422), so validate input before submitting.
- The prepaid fal balance is the hard ceiling. The fal account locks when the balance is low.
 
## Security
- Secrets only in AI Studio Secrets: FAL_KEY, OWNER_EMAIL, DAILY_CAP_USD, MAX_JOB_USD. Nothing secret in client code, logs, Firestore or error messages.
- Every route: verify the Firebase ID token and require email == OWNER_EMAIL. Return 401 or 403 otherwise.
- Validate every body with zod. Limit uploads: images 25 MB, videos 500 MB. Allowed types: jpg, png, webp, mp4, mov, webm.
- Accept input URLs only when they point to our own storage or the fal CDN (avoid SSRF).
- Rate limit job submissions per user (for example 30 per hour).
- Some fal models reject content with a policy error. Show a friendly message.
- Clean requires the rights checkbox. Send it with the job and store it.
 
## fal usage rules
- Install @fal-ai/client on the server only. Configure credentials from process.env.FAL_KEY on the server only.
- Submit: fal.queue.submit(endpointId, { input }) returns request_id. Status: fal.queue.status(endpointId, { requestId, logs: true }). Result: fal.queue.result(endpointId, { requestId }) and read result.data.
- Local files: upload on the server with fal.storage.upload(file) and pass the returned URL as input.
- Output URLs are public and expire (default at least 7 days). Copy them to our storage on success.
- New fal accounts allow 2 concurrent requests. More jobs wait in fal's queue. The UI shows Queued and never treats waiting as a failure.
- Do not invent parameters. For every endpoint, use the schema from https://fal.ai/models/ENDPOINT-ID/llms.txt that the owner pastes into the prompt.
 
## Model registry (src/server/registry/models.ts)
One array. Fields per entry: key, tool, label, group, badge, endpoint, provider (fal), unit (image, megapixel, second or video), price (USD per unit), priceNote, priceVerifiedOn (date), mode (draft or final), inputMap (how UI fields map to the endpoint parameters), outputType (image or video), maxDuration, resolutions, commercialOk (owner confirms on the fal model page).
All model ids, prices and input mappings live only here. Swapping provider later means a new provider value and a new service file, not a rewrite.
 
## Seed entries
Verify every id and price on its fal page before use. Prices change. The numbers are what research found.
 
image.create
- img_draft: fal-ai/flux-2/klein/9b, megapixel, 0.006, draft, under one second
- img_standard: bytedance/seedream/v5/lite/text-to-image, image, 0.035, draft or final
- img_pro: bytedance/seedream/v5/pro/text-to-image, image, 0.0675 up to 1536x1536 and 0.135 up to 2048x2048 (tentative), final
- img_text: openai/gpt-image-2, image, about 0.02 low, 0.07 medium, 0.19 high, final, best text rendering
- img_typo: fal-ai/ideogram/v3, image, about 0.06 balanced, typography
 
image.edit
- edit_kontext: fal-ai/flux-kontext (check price)
- edit_gpt: openai/gpt-image-2/edit (check price)
- edit_seedream: bytedance/seedream/v5/pro/edit (check price)
- edit_nano: fal-ai/nano-banana-pro/edit, about 0.15 per image at 1K
 
image.removeBackground
- bg_bria: fal-ai/bria/background/remove (check price)
- bg_guided: bria/guided-remove-background, 0.03 per image, optional prompt
 
image.upscale
- up_clarity: fal-ai/clarity-upscaler (check price)
- up_topaz: topaz/upscale/image/precision (check price)
 
image.clean
- clean_img_mask: fal-ai/bria/eraser, 0.04 per generation, inputs image_url and mask_url
 
video.create (pick the cheapest that looks good in your own tests)
- vid_budget_a: Grok Imagine Video, about 0.07 per second at 720p (find the endpoint id on fal)
- vid_budget_b: Kling 2.5 Turbo Pro, about 0.35 for 5 seconds and about 0.07 per extra second (find the endpoint id)
- vid_budget_c: Kling 3.0 Pro, about 0.112 per second without audio (image-to-video takes start_image_url)
- vid_happy: alibaba/happy-horse/image-to-video and alibaba/happy-horse/text-to-video, about 0.14 per second at 720p and 0.28 at 1080p
- vid_seedance2: bytedance/seedance-2.0/fast/image-to-video, about 0.2419 per second at 720p with audio included; standard tier bytedance/seedance-2.0/image-to-video
- vid_seedance25: bytedance/seedance-2.5/image-to-video, text-to-video and reference-to-video; price scales with resolution; up to 30 seconds; aspect_ratio can be auto
 
video.clean
- vclean_prompt: bria/bria_video_eraser/erase/prompt, prompt such as text, logo or watermark, about 0.14 per second of video
- vclean_mask: bria/bria_video_eraser/erase/mask, needs a mask video
- vclean_void: fal-ai/void-video-inpainting, optional mask video or text description, requires a prompt that describes the background
 
video.upscale
- fal-ai/video-upscaler, fal-ai/bytedance-upscaler/upscale/video, fal-ai/seedvr/upscale/video, topaz/upscale/video/precision (check price of each)
