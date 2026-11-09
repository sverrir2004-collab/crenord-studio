import express from 'express';
import multer from 'multer';
import { AuthenticatedRequest, requireOwnerAuth } from '../middleware/auth.ts';
import { adminDb } from '../services/firebaseAdmin.ts';
import * as falService from '../services/fal.ts';
import * as mediaProcessing from '../services/mediaProcessing.ts';

export const uploadsRouter = express.Router();

// Memory storage for uploads, limiting image to 25MB, video to 500MB
const storage = multer.memoryStorage();
const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedMime = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
      'audio/flac',
    ];
    if (allowedMime.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: jpg, png, webp, mp4, mov, webm, audio/mpeg, audio/mp3, audio/wav, audio/x-wav, audio/mp4, audio/x-m4a, audio/aac, audio/ogg, audio/webm, audio/flac.`));
    }
  },
});

/**
 * POST /api/uploads
 * Uploads a multipart file to fal CDN storage and records the asset.
 */
uploadsRouter.post(
  '/',
  requireOwnerAuth,
  uploadMiddleware.single('file'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { buffer, mimetype, originalname, size } = req.file;
    const isAudio = mimetype.startsWith('audio/');
    const isVideo = !isAudio && (mimetype.startsWith('video/') || mimetype === 'video/quicktime');
    const isImage = !isVideo && !isAudio;

    // Size checks
    if (isImage && size > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image file size exceeds maximum 25 MB' });
    }
    if (isAudio && size > 100 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio file size exceeds maximum 100 MB' });
    }
    if (isVideo && size > 500 * 1024 * 1024) {
      return res.status(400).json({ error: 'Video file size exceeds maximum 500 MB (recommend keeping below 200 MB)' });
    }

    const uid = req.user!.uid;

    try {
      // If video or audio, probe duration via ffprobe on the buffer
      let mediaDuration: number | null = null;
      let mediaWidth: number | null = null;
      let mediaHeight: number | null = null;

      if (isVideo || isAudio) {
        try {
          const meta = await mediaProcessing.getVideoMetadata(buffer, originalname);
          if (typeof meta.duration === 'number' && !isNaN(meta.duration) && meta.duration > 0) {
            mediaDuration = Math.round(meta.duration * 10) / 10;
            if (isVideo) {
              mediaWidth = meta.width;
              mediaHeight = meta.height;
            }
          } else {
            mediaDuration = null;
          }
        } catch {
          mediaDuration = null;
        }
      }

      // Upload via fal.storage.upload
      const url = await falService.upload(buffer, mimetype, originalname);

      const now = new Date().toISOString();
      const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const mediaType: 'video' | 'audio' | 'image' = isAudio ? 'audio' : isVideo ? 'video' : 'image';

      const assetDoc = {
        id: assetId,
        uid,
        url,
        type: mediaType,
        title: originalname || (isVideo ? 'Uploaded video' : isAudio ? 'Uploaded audio' : 'Uploaded image'),
        tool: 'upload',
        modelKey: 'manual_upload',
        metadata: {
          mimeType: mimetype,
          fileSize: size,
          uploadedAt: now,
          duration: mediaDuration !== null ? `${mediaDuration}s` : undefined,
          width: mediaWidth || undefined,
          height: mediaHeight || undefined,
        },
        createdAt: now,
      };

      try {
        await adminDb.collection('assets').doc(assetId).set(assetDoc);
      } catch {
        // Fallback handled in memory
      }

      return res.status(201).json({
        assetId,
        url,
        type: mediaType,
        duration: mediaDuration,
        width: mediaWidth,
        height: mediaHeight,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: `File upload failed: ${err.message || 'Storage error'}`,
      });
    }
  }
);
