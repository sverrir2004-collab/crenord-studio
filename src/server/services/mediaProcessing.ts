import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import * as falService from './fal.ts';

const execFileAsync = promisify(execFile);

export interface ResizeResult {
  format: string;
  width: number;
  height: number;
  url: string;
}

/**
 * Downloads a file from a public URL to a Buffer.
 */
async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download media from ${url}: ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Resizes an image to 4 standard campaign specifications using Sharp:
 * 9:16 (1080x1920), 1:1 (1080x1080), 4:5 (1080x1350), 16:9 (1920x1080).
 * Uses sleek dark containment (#050608) matching the CRENORD canvas.
 * Cost: 0 model credits.
 */
export async function resizeForAds(imageUrl: string, requestedSizes?: string[]): Promise<ResizeResult[]> {
  const inputBuffer = await downloadToBuffer(imageUrl);

  const targets = [
    { format: '9:16', width: 1080, height: 1920 },
    { format: '1:1', width: 1080, height: 1080 },
    { format: '4:5', width: 1080, height: 1350 },
    { format: '16:9', width: 1920, height: 1080 },
  ];

  const filteredTargets = requestedSizes && requestedSizes.length > 0
    ? targets.filter((t) => requestedSizes.includes(t.format))
    : targets;

  const results: ResizeResult[] = [];

  for (const target of filteredTargets) {
    const resizedBuffer = await sharp(inputBuffer)
      .resize({
        width: target.width,
        height: target.height,
        fit: 'contain',
        background: { r: 5, g: 6, b: 8, alpha: 1 },
      })
      .png({ quality: 95 })
      .toBuffer();

    const uploadedUrl = await falService.upload(
      resizedBuffer,
      'image/png',
      `ad_${target.format.replace(':', '_')}.png`
    );

    results.push({
      format: target.format,
      width: target.width,
      height: target.height,
      url: uploadedUrl,
    });
  }

  return results;
}

/**
 * Trims a video on the server using FFmpeg.
 * Cost: 0 model credits.
 */
export async function trimVideo(
  videoUrl: string,
  startSec: number = 0,
  durationSec: number = 5
): Promise<{ url: string; duration: string }> {
  const inputBuffer = await downloadToBuffer(videoUrl);
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `trim_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
  const outputPath = path.join(tempDir, `trim_out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);

    // Run ffmpeg with accurate seek and re-encoding for clean keyframes
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      String(startSec),
      '-i',
      inputPath,
      '-t',
      String(durationSec),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      outputPath,
    ]);

    const outputBuffer = await fs.promises.readFile(outputPath);
    const uploadedUrl = await falService.upload(outputBuffer, 'video/mp4', 'trimmed.mp4');

    return {
      url: uploadedUrl,
      duration: `${durationSec}s`,
    };
  } finally {
    // Clean up temporary files
    try {
      await fs.promises.unlink(inputPath);
    } catch {}
    try {
      await fs.promises.unlink(outputPath);
    } catch {}
  }
}

/**
 * Reformats a video or converts aspect ratio using FFmpeg.
 * Cost: 0 model credits.
 */
export async function reformatVideo(
  videoUrl: string,
  targetFormat: '9:16' | '1:1' | '16:9' | '4:5' | 'MP4' | 'WebM' | string
): Promise<{ url: string; format: string }> {
  const inputBuffer = await downloadToBuffer(videoUrl);
  const tempDir = os.tmpdir();
  const isWebM = targetFormat.toLowerCase() === 'webm';
  const ext = isWebM ? 'webm' : 'mp4';
  const inputPath = path.join(tempDir, `fmt_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
  const outputPath = path.join(tempDir, `fmt_out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);

    // Aspect ratio filter definitions
    const aspectFilters: Record<string, string> = {
      '9:16': 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x050608',
      '1:1': 'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=0x050608',
      '4:5': 'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=0x050608',
      '16:9': 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x050608',
    };

    const filter = aspectFilters[targetFormat];
    const args: string[] = ['-y', '-i', inputPath];

    if (filter) {
      args.push('-vf', filter);
    }

    if (isWebM) {
      args.push('-c:v', 'libvpx-vp9', '-b:v', '2M', '-c:a', 'libopus');
    } else {
      args.push('-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-movflags', '+faststart');
    }

    args.push(outputPath);

    await execFileAsync('ffmpeg', args);

    const outputBuffer = await fs.promises.readFile(outputPath);
    const mime = isWebM ? 'video/webm' : 'video/mp4';
    const uploadedUrl = await falService.upload(outputBuffer, mime, `reformatted.${ext}`);

    return {
      url: uploadedUrl,
      format: targetFormat,
    };
  } finally {
    try {
      await fs.promises.unlink(inputPath);
    } catch {}
    try {
      await fs.promises.unlink(outputPath);
    } catch {}
  }
}

/**
 * Probes video duration and dimensions via ffprobe.
 */
export async function getVideoMetadata(source: string | Buffer, filenameHint?: string): Promise<{ duration: number; width: number; height: number; fps: number }> {
  const inputBuffer = Buffer.isBuffer(source) ? source : await downloadToBuffer(source);
  const tempDir = os.tmpdir();
  const ext = filenameHint ? path.extname(filenameHint) || '.mp4' : '.mp4';
  const inputPath = path.join(tempDir, `probe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${ext}`);
  try {
    await fs.promises.writeFile(inputPath, inputBuffer);
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=width,height,r_frame_rate',
      '-of', 'json',
      inputPath,
    ]);
    const parsed = JSON.parse(stdout);
    const durStr = parsed.format?.duration;
    if (!durStr || isNaN(parseFloat(durStr))) {
      throw new Error('Unable to determine media duration from ffprobe');
    }
    const duration = parseFloat(durStr);
    const videoStream = parsed.streams?.find((s: any) => s.width && s.height);
    const width = videoStream ? parseInt(videoStream.width, 10) || 1280 : 0;
    const height = videoStream ? parseInt(videoStream.height, 10) || 720 : 0;
    let fps = 30;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      if (num && den) fps = Math.round(num / den);
    }
    return { duration, width, height, fps };
  } finally {
    try { await fs.promises.unlink(inputPath); } catch {}
  }
}

/**
 * Creates a mask video from a static PNG mask with the exact same resolution, duration,
 * and framerate as the source video, uploaded to fal storage.
 * Used for manual video clean with bria/bria_video_eraser/erase/mask.
 */
export async function generateMaskVideo(maskPngUrl: string, sourceVideoUrl: string): Promise<string> {
  const [maskBuffer, videoMeta] = await Promise.all([
    downloadToBuffer(maskPngUrl),
    getVideoMetadata(sourceVideoUrl),
  ]);

  const tempDir = os.tmpdir();
  const maskPngPath = path.join(tempDir, `mask_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.png`);
  const outputMaskVideoPath = path.join(tempDir, `mask_vid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);

  try {
    await fs.promises.writeFile(maskPngPath, maskBuffer);

    // Generate static mask video matching width, height, fps, and duration of the source video
    await execFileAsync('ffmpeg', [
      '-y',
      '-loop', '1',
      '-i', maskPngPath,
      '-t', String(videoMeta.duration),
      '-vf', `scale=${videoMeta.width}:${videoMeta.height},format=yuv420p`,
      '-r', String(videoMeta.fps),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      outputMaskVideoPath,
    ]);

    const maskVideoBuffer = await fs.promises.readFile(outputMaskVideoPath);
    const uploadedUrl = await falService.upload(maskVideoBuffer, 'video/mp4', 'mask_video.mp4');
    return uploadedUrl;
  } finally {
    try { await fs.promises.unlink(maskPngPath); } catch {}
    try { await fs.promises.unlink(outputMaskVideoPath); } catch {}
  }
}

/**
 * Applies the ffmpeg delogo filter to blur/blend a fixed rectangular region (e.g. watermark or logo).
 */
export async function applyFfmpegDelogo(
  videoUrl: string,
  rect: { x: number; y: number; w: number; h: number }
): Promise<string> {
  const [inputBuffer, meta] = await Promise.all([
    downloadToBuffer(videoUrl),
    getVideoMetadata(videoUrl),
  ]);

  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `delogo_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
  const outputPath = path.join(tempDir, `delogo_out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);

    // Ensure valid coordinates within video dimensions
    const x = Math.max(0, Math.min(meta.width - 2, Math.round(rect.x || 0)));
    const y = Math.max(0, Math.min(meta.height - 2, Math.round(rect.y || 0)));
    const w = Math.max(2, Math.min(meta.width - x, Math.round(rect.w || 32)));
    const h = Math.max(2, Math.min(meta.height - y, Math.round(rect.h || 32)));

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', `delogo=x=${x}:y=${y}:w=${w}:h=${h}`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-c:a', 'copy',
      outputPath,
    ]);

    const outputBuffer = await fs.promises.readFile(outputPath);
    const uploadedUrl = await falService.upload(outputBuffer, 'video/mp4', 'delogo_cleaned.mp4');
    return uploadedUrl;
  } finally {
    try { await fs.promises.unlink(inputPath); } catch {}
    try { await fs.promises.unlink(outputPath); } catch {}
  }
}

/**
 * Extracts the first 4 seconds of a video clip for fast, low-cost comparison testing.
 */
export async function extractFirst4Seconds(videoUrl: string): Promise<string> {
  const inputBuffer = await downloadToBuffer(videoUrl);
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `first4_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
  const outputPath = path.join(tempDir, `first4_out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);

    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', '0',
      '-t', '4',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-c:a', 'aac',
      outputPath,
    ]);

    const outputBuffer = await fs.promises.readFile(outputPath);
    const uploadedUrl = await falService.upload(outputBuffer, 'video/mp4', 'test_4s_clip.mp4');
    return uploadedUrl;
  } finally {
    try { await fs.promises.unlink(inputPath); } catch {}
    try { await fs.promises.unlink(outputPath); } catch {}
  }
}

/**
 * Processes video with Bria Video Eraser prompt mode.
 * Per fal.ai requirement: clip must be SHORTER than 5 seconds.
 * If clip > 4.5s, splits with ffmpeg into pieces under 5s (4.5s), processes each, joins with ffmpeg, and restores original audio.
 */
export async function processBriaVideoEraserPipeline(
  videoUrl: string,
  prompt: string
): Promise<string> {
  const meta = await getVideoMetadata(videoUrl);

  // If <= 4.5s, single call
  if (meta.duration <= 4.5) {
    const submitResult = await falService.submit('bria/bria_video_eraser/erase/prompt', {
      prompt,
      video_url: videoUrl,
      preserve_audio: true,
      auto_trim: true,
      output_container_and_codec: 'mp4_h264',
    });
    let attempts = 0;
    while (attempts < 60) {
      await new Promise((r) => setTimeout(r, 2000));
      attempts++;
      const statusRes = (await falService.status('bria/bria_video_eraser/erase/prompt', submitResult.requestId)) as any;
      if (statusRes.status === 'COMPLETED') {
        const result = await falService.result('bria/bria_video_eraser/erase/prompt', submitResult.requestId);
        const url = (result as any).video?.url || (result as any).url;
        if (url) return url;
      }
      if (statusRes.status === 'FAILED') {
        throw new Error(`Bria processing failed: ${statusRes.error || 'Unknown error'}`);
      }
    }
    throw new Error('Bria processing timed out');
  }

  // Clip > 4.5s: split into <= 4.5s chunks, process each, concat with ffmpeg, restore audio
  const tempDir = os.tmpdir();
  const inputBuffer = await downloadToBuffer(videoUrl);
  const prefix = `bria_pipe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const inputPath = path.join(tempDir, `${prefix}_in.mp4`);
  const origAudioPath = path.join(tempDir, `${prefix}_audio.aac`);
  const cleanedChunks: string[] = [];

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);

    // Extract original audio
    try {
      await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-vn', '-acodec', 'copy', origAudioPath]);
    } catch {
      try {
        await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-vn', '-acodec', 'aac', origAudioPath]);
      } catch {}
    }

    const chunkDuration = 4.5;
    const numChunks = Math.ceil(meta.duration / chunkDuration);

    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkDuration;
      const chunkPath = path.join(tempDir, `${prefix}_chunk_${i}.mp4`);
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', String(start),
        '-t', String(chunkDuration),
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-an',
        chunkPath,
      ]);

      const chunkBuf = await fs.promises.readFile(chunkPath);
      const chunkUrl = await falService.upload(chunkBuf, 'video/mp4', `chunk_${i}.mp4`);

      // Submit chunk to fal
      const chunkJob = await falService.submit('bria/bria_video_eraser/erase/prompt', {
        prompt,
        video_url: chunkUrl,
        preserve_audio: false,
        auto_trim: true,
        output_container_and_codec: 'mp4_h264',
      });

      let done = false;
      let chunkAttempts = 0;
      let cleanedChunkUrl = '';
      while (!done && chunkAttempts < 60) {
        await new Promise((r) => setTimeout(r, 2000));
        chunkAttempts++;
        const st = (await falService.status('bria/bria_video_eraser/erase/prompt', chunkJob.requestId)) as any;
        if (st.status === 'COMPLETED') {
          const res = await falService.result('bria/bria_video_eraser/erase/prompt', chunkJob.requestId);
          cleanedChunkUrl = (res as any).video?.url || (res as any).url;
          done = true;
        } else if (st.status === 'FAILED') {
          throw new Error(`Chunk ${i} failed: ${st.error}`);
        }
      }

      if (!cleanedChunkUrl) throw new Error(`Chunk ${i} timed out`);

      const cleanedBuf = await downloadToBuffer(cleanedChunkUrl);
      const cleanedChunkLocalPath = path.join(tempDir, `${prefix}_cleaned_${i}.mp4`);
      await fs.promises.writeFile(cleanedChunkLocalPath, cleanedBuf);
      cleanedChunks.push(cleanedChunkLocalPath);

      try { await fs.promises.unlink(chunkPath); } catch {}
    }

    // Write concat list
    const listPath = path.join(tempDir, `${prefix}_concat.txt`);
    const listContent = cleanedChunks.map((p) => `file '${p}'`).join('\n');
    await fs.promises.writeFile(listPath, listContent);

    // Join with ffmpeg and attach original audio
    const joinedPath = path.join(tempDir, `${prefix}_joined.mp4`);
    const hasAudio = fs.existsSync(origAudioPath);

    if (hasAudio) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-i', origAudioPath,
        '-map', '0:v:0',
        '-map', '1:a:0?',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-shortest',
        joinedPath,
      ]);
    } else {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        joinedPath,
      ]);
    }

    const joinedBuf = await fs.promises.readFile(joinedPath);
    const finalUrl = await falService.upload(joinedBuf, 'video/mp4', 'bria_cleaned_joined.mp4');

    try { await fs.promises.unlink(listPath); } catch {}
    try { await fs.promises.unlink(joinedPath); } catch {}

    return finalUrl;
  } finally {
    try { await fs.promises.unlink(inputPath); } catch {}
    try { await fs.promises.unlink(origAudioPath); } catch {}
    for (const c of cleanedChunks) {
      try { await fs.promises.unlink(c); } catch {}
    }
  }
}

/**
 * Converts audio to requested output format (mp3, mp3_high, wav, opus) using FFmpeg.
 */
export async function convertAudioFormat(
  audioUrl: string,
  targetFormat: 'mp3' | 'mp3_high' | 'wav' | 'opus' | string
): Promise<{ url: string; format: string }> {
  const inputBuffer = await downloadToBuffer(audioUrl);
  const tempDir = os.tmpdir();
  const fmt = (targetFormat || 'mp3').toLowerCase();

  let ext = 'mp3';
  let mime = 'audio/mpeg';
  let codecArgs: string[] = ['-c:a', 'libmp3lame', '-b:a', '128k'];

  if (fmt.includes('wav')) {
    ext = 'wav';
    mime = 'audio/wav';
    codecArgs = ['-c:a', 'pcm_s16le'];
  } else if (fmt.includes('opus')) {
    ext = 'opus';
    mime = 'audio/opus';
    codecArgs = ['-c:a', 'libopus', '-b:a', '128k'];
  } else if (fmt.includes('192') || fmt.includes('high') || fmt.includes('320')) {
    ext = 'mp3';
    mime = 'audio/mpeg';
    codecArgs = ['-c:a', 'libmp3lame', '-b:a', '320k'];
  }

  const inputPath = path.join(tempDir, `audio_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.tmp`);
  const outputPath = path.join(tempDir, `audio_out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      ...codecArgs,
      outputPath,
    ]);

    const outputBuffer = await fs.promises.readFile(outputPath);
    const uploadedUrl = await falService.upload(outputBuffer, mime, `converted_audio.${ext}`);
    return { url: uploadedUrl, format: ext };
  } finally {
    try { await fs.promises.unlink(inputPath); } catch {}
    try { await fs.promises.unlink(outputPath); } catch {}
  }
}

/**
 * Extracts the audio track from a video as a mono 16kHz MP3.
 * Optimized specifically for ElevenLabs Scribe v2 speech-to-text.
 */
export async function extractAudioTrack(videoUrl: string): Promise<string> {
  const inputBuffer = await downloadToBuffer(videoUrl);
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `stt_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
  const outputPath = path.join(tempDir, `stt_audio_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp3`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vn',
      '-c:a', 'libmp3lame',
      '-ar', '16000',
      '-ac', '1',
      '-b:a', '64k',
      outputPath,
    ]);

    const outputBuffer = await fs.promises.readFile(outputPath);
    const uploadedUrl = await falService.upload(outputBuffer, 'audio/mpeg', 'extracted_voice.mp3');
    return uploadedUrl;
  } finally {
    try { await fs.promises.unlink(inputPath); } catch {}
    try { await fs.promises.unlink(outputPath); } catch {}
  }
}

/**
 * Mixes voiceover, music, and sound effects onto an existing video with per-track volume controls.
 * Supports "Replace original audio" or "Mix with original audio".
 * Cost: 0 model credits (runs on server via FFmpeg).
 */
export async function mixAudioWithVideo(options: {
  videoUrl: string;
  voiceUrl?: string;
  musicUrl?: string;
  sfxUrl?: string;
  replaceOriginal?: boolean;
  voiceVolume?: number;
  musicVolume?: number;
  sfxVolume?: number;
}): Promise<string> {
  const {
    videoUrl,
    voiceUrl,
    musicUrl,
    sfxUrl,
    replaceOriginal = false,
    voiceVolume = 1.0,
    musicVolume = 0.25,
    sfxVolume = 0.8,
  } = options;

  const tempDir = os.tmpdir();
  const prefix = `mix_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const videoPath = path.join(tempDir, `${prefix}_vid.mp4`);
  const outputPath = path.join(tempDir, `${prefix}_out.mp4`);

  const cleanupPaths: string[] = [videoPath, outputPath];

  try {
    const videoBuffer = await downloadToBuffer(videoUrl);
    await fs.promises.writeFile(videoPath, videoBuffer);

    const inputs: string[] = ['-y', '-i', videoPath];
    const filterParts: string[] = [];
    const mixLabels: string[] = [];

    // Track input indices
    let nextInputIdx = 1;

    // Check if we keep original video audio
    if (!replaceOriginal) {
      filterParts.push(`[0:a]volume=1.0[a0]`);
      mixLabels.push('[a0]');
    }

    if (voiceUrl) {
      const voicePath = path.join(tempDir, `${prefix}_voice.mp3`);
      cleanupPaths.push(voicePath);
      const voiceBuf = await downloadToBuffer(voiceUrl);
      await fs.promises.writeFile(voicePath, voiceBuf);
      inputs.push('-i', voicePath);
      const vol = Math.max(0, Math.min(2.0, voiceVolume));
      filterParts.push(`[${nextInputIdx}:a]volume=${vol.toFixed(2)}[av]`);
      mixLabels.push('[av]');
      nextInputIdx++;
    }

    if (musicUrl) {
      const musicPath = path.join(tempDir, `${prefix}_music.mp3`);
      cleanupPaths.push(musicPath);
      const musicBuf = await downloadToBuffer(musicUrl);
      await fs.promises.writeFile(musicPath, musicBuf);
      inputs.push('-i', musicPath);
      const vol = Math.max(0, Math.min(2.0, musicVolume));
      filterParts.push(`[${nextInputIdx}:a]volume=${vol.toFixed(2)}[am]`);
      mixLabels.push('[am]');
      nextInputIdx++;
    }

    if (sfxUrl) {
      const sfxPath = path.join(tempDir, `${prefix}_sfx.mp3`);
      cleanupPaths.push(sfxPath);
      const sfxBuf = await downloadToBuffer(sfxUrl);
      await fs.promises.writeFile(sfxPath, sfxBuf);
      inputs.push('-i', sfxPath);
      const vol = Math.max(0, Math.min(2.0, sfxVolume));
      filterParts.push(`[${nextInputIdx}:a]volume=${vol.toFixed(2)}[as]`);
      mixLabels.push('[as]');
      nextInputIdx++;
    }

    if (mixLabels.length === 0) {
      // Nothing to mix or replace
      return videoUrl;
    }

    const filterComplex = `${filterParts.join(';')};${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=2[aout]`;

    inputs.push('-filter_complex', filterComplex);
    inputs.push('-map', '0:v');
    inputs.push('-map', '[aout]');
    inputs.push('-c:v', 'copy');
    inputs.push('-c:a', 'aac');
    inputs.push('-b:a', '192k');
    inputs.push('-movflags', '+faststart');
    inputs.push(outputPath);

    await execFileAsync('ffmpeg', inputs);

    const outputBuffer = await fs.promises.readFile(outputPath);
    const uploadedUrl = await falService.upload(outputBuffer, 'video/mp4', 'mixed_video.mp4');
    return uploadedUrl;
  } finally {
    for (const p of cleanupPaths) {
      try { await fs.promises.unlink(p); } catch {}
    }
  }
}

/**
 * Burns stylized subtitles (.srt) onto video frames using FFmpeg's libass engine.
 * Cost: 0 model credits (server-side).
 */
export async function burnCaptionsToVideo(
  videoUrl: string,
  srtContent: string
): Promise<string> {
  const inputBuffer = await downloadToBuffer(videoUrl);
  const tempDir = os.tmpdir();
  const prefix = `captions_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const videoPath = path.join(tempDir, `${prefix}_in.mp4`);
  const srtPath = path.join(tempDir, `${prefix}.srt`);
  const outputPath = path.join(tempDir, `${prefix}_out.mp4`);

  try {
    await fs.promises.writeFile(videoPath, inputBuffer);
    await fs.promises.writeFile(srtPath, srtContent, 'utf-8');

    // Escape srt path for ffmpeg filter string (colons and backslashes)
    const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-vf', `subtitles=${escapedSrtPath}:force_style='FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,MarginV=30'`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '19',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ]);

    const outputBuffer = await fs.promises.readFile(outputPath);
    const uploadedUrl = await falService.upload(outputBuffer, 'video/mp4', 'captioned_video.mp4');
    return uploadedUrl;
  } finally {
    try { await fs.promises.unlink(videoPath); } catch {}
    try { await fs.promises.unlink(srtPath); } catch {}
    try { await fs.promises.unlink(outputPath); } catch {}
  }
}

/**
 * Splits text into chunks under maxChars (default 4500) respecting sentence boundaries.
 */
export function splitTextIntoChunks(text: string, maxChars = 4500): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length <= maxChars) {
      current += sentence;
    } else {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Concatenates multiple audio files into a single unified MP3 using FFmpeg.
 */
export async function concatAudioFiles(audioUrls: string[]): Promise<string> {
  if (audioUrls.length === 1) return audioUrls[0];
  const tempDir = os.tmpdir();
  const prefix = `concat_aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const localPaths: string[] = [];
  const listPath = path.join(tempDir, `${prefix}_list.txt`);
  const outputPath = path.join(tempDir, `${prefix}_joined.mp3`);

  try {
    for (let i = 0; i < audioUrls.length; i++) {
      const buf = await downloadToBuffer(audioUrls[i]);
      const p = path.join(tempDir, `${prefix}_part_${i}.mp3`);
      await fs.promises.writeFile(p, buf);
      localPaths.push(p);
    }

    const listContent = localPaths.map((p) => `file '${p}'`).join('\n');
    await fs.promises.writeFile(listPath, listContent);

    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      outputPath,
    ]);

    const outputBuffer = await fs.promises.readFile(outputPath);
    const uploadedUrl = await falService.upload(outputBuffer, 'audio/mpeg', 'joined_voiceover.mp3');
    return uploadedUrl;
  } finally {
    try { await fs.promises.unlink(listPath); } catch {}
    try { await fs.promises.unlink(outputPath); } catch {}
    for (const p of localPaths) {
      try { await fs.promises.unlink(p); } catch {}
    }
  }
}

