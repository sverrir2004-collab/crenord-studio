import express from 'express';
import { z } from 'zod';
import JSZip from 'jszip';
import { AuthenticatedRequest, requireOwnerAuth } from '../middleware/auth.ts';
import { adminDb, logFirestoreFallback } from '../services/firebaseAdmin.ts';
import * as mediaProcessing from '../services/mediaProcessing.ts';

export const assetsRouter = express.Router();

const updateAssetSchema = z.object({
  title: z.string().trim().max(200).optional(),
  isFavorite: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  tags: z.array(z.string().max(50)).optional(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'ids array is required').max(100),
});

const bulkAssignProjectSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'ids array is required').max(100),
  projectId: z.string().min(1, 'projectId is required'),
});

const exportAssetSchema = z.object({
  formats: z.array(z.enum(['9:16', '1:1', '4:5', '16:9'])).min(1).max(10).optional(),
});

// Fallback in-memory assets if Firestore is offline
const inMemoryAssets = new Map<string, any>();

/**
 * GET /api/assets
 * Returns assets filtered by user, type, source, projectId, or parentAssetId.
 * Excludes soft-deleted items (deletedAt != null).
 */
assetsRouter.get('/', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const uid = req.user!.uid;
  const { type, source, projectId, parentAssetId, isFavorite, search, sort = 'newest', limit = '100' } = req.query;
  const maxLimit = Math.min(100, parseInt(limit as string, 10) || 60);

  try {
    let q: any = adminDb
      .collection('assets')
      .where('uid', '==', uid);

    if (type && typeof type === 'string' && type !== 'all') {
      q = q.where('type', '==', type);
    }

    if (projectId && typeof projectId === 'string') {
      q = q.where('projectId', '==', projectId);
    }

    if (parentAssetId && typeof parentAssetId === 'string') {
      q = q.where('parentAssetId', '==', parentAssetId);
    }

    const snap = await q.get();
    let assets = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    // Exclude soft-deleted
    assets = assets.filter((a: any) => !a.deletedAt);

    // Filter by source
    if (source && typeof source === 'string' && source !== 'all') {
      assets = assets.filter((a: any) => {
        const tool = (a.tool || '').toLowerCase();
        if (source === 'generated') return tool.includes('create');
        if (source === 'edited') return tool.includes('edit') || tool.includes('replace') || tool.includes('upscale') || tool.includes('resize');
        if (source === 'cleaned') return tool.includes('clean');
        if (source === 'uploaded') return tool.includes('upload') || !tool;
        return true;
      });
    }

    // Filter by favorites
    if (isFavorite === 'true') {
      assets = assets.filter((a: any) => Boolean(a.isFavorite));
    }

    // Search query
    if (search && typeof search === 'string' && search.trim()) {
      const queryStr = search.toLowerCase();
      assets = assets.filter(
        (a: any) =>
          (a.title && a.title.toLowerCase().includes(queryStr)) ||
          (a.metadata?.prompt && a.metadata.prompt.toLowerCase().includes(queryStr))
      );
    }

    // Sort order
    if (sort === 'oldest') {
      assets.sort((a: any, b: any) => (a.createdAt > b.createdAt ? 1 : -1));
    } else if (sort === 'name') {
      assets.sort((a: any, b: any) => (a.title || '').localeCompare(b.title || ''));
    } else {
      // Default: newest first
      assets.sort((a: any, b: any) => (b.createdAt > a.createdAt ? 1 : -1));
    }

    return res.json({ assets: assets.slice(0, maxLimit) });
  } catch (err: any) {
    logFirestoreFallback('assets', err);
    const fallbackList = Array.from(inMemoryAssets.values())
      .filter((a) => a.uid === uid && !a.deletedAt)
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    return res.json({ assets: fallbackList.slice(0, maxLimit) });
  }
});

/**
 * GET /api/assets/:id
 */
assetsRouter.get('/:id', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const uid = req.user!.uid;

  try {
    const doc = await adminDb.collection('assets').doc(id).get();
    if (!doc.exists || doc.data()?.uid !== uid || doc.data()?.deletedAt) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    return res.json({ asset: { id: doc.id, ...doc.data() } });
  } catch (err: any) {
    logFirestoreFallback('assets', err);
    const asset = inMemoryAssets.get(id);
    if (!asset || asset.uid !== uid || asset.deletedAt) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    return res.json({ asset });
  }
});

/**
 * PATCH /api/assets/:id
 */
assetsRouter.patch('/:id', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const parseResult = updateAssetSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.format(),
    });
  }

  const { id } = req.params;
  const uid = req.user!.uid;
  const { title, isFavorite, projectId, tags } = parseResult.data;

  try {
    const docRef = adminDb.collection('assets').doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data()?.uid !== uid || doc.data()?.deletedAt) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (typeof title === 'string') updates.title = title;
    if (typeof isFavorite === 'boolean') updates.isFavorite = isFavorite;
    if (projectId !== undefined) updates.projectId = projectId;
    if (Array.isArray(tags)) updates.tags = tags;

    await docRef.update(updates);
    return res.json({ asset: { id, ...doc.data(), ...updates } });
  } catch (err: any) {
    logFirestoreFallback('assets', err);
    const asset = inMemoryAssets.get(id);
    if (!asset || asset.uid !== uid || asset.deletedAt) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    if (typeof title === 'string') asset.title = title;
    if (typeof isFavorite === 'boolean') asset.isFavorite = isFavorite;
    if (projectId !== undefined) asset.projectId = projectId;
    asset.updatedAt = new Date().toISOString();
    return res.json({ asset });
  }
});

/**
 * DELETE /api/assets/:id (Soft delete)
 */
assetsRouter.delete('/:id', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const uid = req.user!.uid;

  try {
    const docRef = adminDb.collection('assets').doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data()?.uid !== uid) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    // Soft delete
    await docRef.update({ deletedAt: new Date().toISOString() });
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    logFirestoreFallback('assets', err);
    const asset = inMemoryAssets.get(id);
    if (asset && asset.uid === uid) {
      asset.deletedAt = new Date().toISOString();
      return res.json({ success: true, deletedId: id });
    }
    return res.status(500).json({ error: `Delete failed: ${err.message}` });
  }
});

/**
 * POST /api/assets/bulk-delete (Soft delete multiple assets)
 */
assetsRouter.post('/bulk-delete', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const parseResult = bulkDeleteSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.format(),
    });
  }

  const uid = req.user!.uid;
  const { ids } = parseResult.data;

  const now = new Date().toISOString();
  try {
    const batch = adminDb.batch();
    for (const id of ids) {
      const ref = adminDb.collection('assets').doc(id);
      batch.update(ref, { deletedAt: now });
    }
    await batch.commit();
    return res.json({ success: true, count: ids.length });
  } catch (err: any) {
    logFirestoreFallback('assets', err);
    for (const id of ids) {
      const asset = inMemoryAssets.get(id);
      if (asset && asset.uid === uid) asset.deletedAt = now;
    }
    return res.json({ success: true, count: ids.length });
  }
});

/**
 * POST /api/assets/bulk-assign-project
 */
assetsRouter.post('/bulk-assign-project', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const parseResult = bulkAssignProjectSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.format(),
    });
  }

  const uid = req.user!.uid;
  const { ids, projectId } = parseResult.data;

  const now = new Date().toISOString();
  try {
    const batch = adminDb.batch();
    for (const id of ids) {
      const ref = adminDb.collection('assets').doc(id);
      batch.update(ref, { projectId, updatedAt: now });
    }
    await batch.commit();
    return res.json({ success: true, count: ids.length });
  } catch (err: any) {
    for (const id of ids) {
      const asset = inMemoryAssets.get(id);
      if (asset && asset.uid === uid) {
        asset.projectId = projectId;
        asset.updatedAt = now;
      }
    }
    return res.json({ success: true, count: ids.length });
  }
});

/**
 * POST /api/assets/:id/export
 * Creates chosen aspect ratios using sharp (images) or ffmpeg (videos) — NO AI, cost 0 —
 * and returns a bundled .zip archive.
 */
assetsRouter.post('/:id/export', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const parseResult = exportAssetSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.format(),
    });
  }

  const { id } = req.params;
  const uid = req.user!.uid;
  const formats = parseResult.data.formats || ['9:16', '1:1', '4:5', '16:9'];

  try {
    let asset: any = null;
    const doc = await adminDb.collection('assets').doc(id).get();
    if (doc.exists && doc.data()?.uid === uid) {
      asset = doc.data();
    } else {
      asset = inMemoryAssets.get(id);
    }

    if (!asset || !asset.url) {
      return res.status(404).json({ error: 'Asset media URL not found' });
    }

    const zip = new JSZip();
    const folderName = (asset.title || 'crenord_export').replace(/[^a-zA-Z0-9_-]/g, '_');
    const folder = zip.folder(folderName) || zip;

    if (asset.type === 'video') {
      // Reformat each ratio using ffmpeg
      for (const fmt of formats) {
        try {
          const result = await mediaProcessing.reformatVideo(asset.url, fmt);
          const vidRes = await fetch(result.url);
          const buf = await vidRes.arrayBuffer();
          const cleanFmt = fmt.replace(':', '_');
          folder.file(`${folderName}_${cleanFmt}.mp4`, buf);
        } catch (err: any) {
          console.error(`Video format ${fmt} failed:`, err);
        }
      }
    } else {
      // Resize each ratio using sharp
      const results = await mediaProcessing.resizeForAds(asset.url, formats);
      for (const r of results) {
        try {
          const imgRes = await fetch(r.url);
          const buf = await imgRes.arrayBuffer();
          const cleanFmt = r.format.replace(':', '_');
          folder.file(`${folderName}_${cleanFmt}.png`, buf);
        } catch (err: any) {
          console.error(`Image format ${r.format} failed:`, err);
        }
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderName}_formats.zip"`);
    return res.send(zipBuffer);
  } catch (err: any) {
    return res.status(500).json({ error: `Export failed: ${err.message}` });
  }
});
