import express from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireOwnerAuth } from '../middleware/auth.ts';
import { adminDb, logFirestoreFallback } from '../services/firebaseAdmin.ts';

export const projectsRouter = express.Router();

const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(100),
  description: z.string().trim().max(500).optional(),
  collageColors: z.array(z.string()).length(4).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  collageColors: z.array(z.string()).length(4).optional(),
});

const addProjectAssetsSchema = z.object({
  assetIds: z.array(z.string().min(1)).min(1, 'assetIds array is required').max(100),
});

// Fallback in-memory projects if Firestore credentials are not local
const inMemoryProjects = new Map<string, any>();

/**
 * GET /api/projects
 * Lists all active projects for the current user (excluding soft-deleted).
 */
projectsRouter.get('/', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const uid = req.user!.uid;

  try {
    const snap = await adminDb
      .collection('projects')
      .where('uid', '==', uid)
      .get();

    const projects: any[] = [];
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (!data.deletedAt) {
        projects.push({ id: doc.id, ...data });
      }
    });

    projects.sort((a, b) => (b.updatedAt || b.createdAt || '') > (a.updatedAt || a.createdAt || '') ? 1 : -1);
    return res.json({ projects });
  } catch (err: any) {
    logFirestoreFallback('projects', err);
    const list = Array.from(inMemoryProjects.values())
      .filter((p) => p.uid === uid && !p.deletedAt)
      .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
    return res.json({ projects: list });
  }
});

/**
 * POST /api/projects
 * Creates a new project with chosen palette and name.
 */
projectsRouter.post('/', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const parseResult = createProjectSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.format(),
    });
  }

  const uid = req.user!.uid;
  const { name, description, collageColors } = parseResult.data;

  const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const newProject = {
    id,
    uid,
    name: name.trim(),
    description: description || '',
    collageColors: collageColors || ['#101217', '#1a202d', '#222938', '#141720'],
    assetCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  try {
    await adminDb.collection('projects').doc(id).set(newProject);
  } catch (err: any) {
    logFirestoreFallback('projects', err);
    inMemoryProjects.set(id, newProject);
  }

  return res.status(201).json({ project: newProject });
});

/**
 * GET /api/projects/:id
 * Fetches project details, associated active assets, and recent job activity.
 */
projectsRouter.get('/:id', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const uid = req.user!.uid;

  try {
    const docRef = adminDb.collection('projects').doc(id);
    const doc = await docRef.get();

    if (!doc.exists || doc.data()?.uid !== uid || doc.data()?.deletedAt) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectData = { id: doc.id, ...doc.data() };

    // Fetch assets assigned to this project
    const assetSnap = await adminDb
      .collection('assets')
      .where('uid', '==', uid)
      .where('projectId', '==', id)
      .get();

    const assets = assetSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((a: any) => !a.deletedAt);

    // Fetch jobs associated with this project
    const jobSnap = await adminDb
      .collection('jobs')
      .where('uid', '==', uid)
      .where('projectId', '==', id)
      .get();

    const activity = jobSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.createdAt > a.createdAt ? 1 : -1));

    return res.json({
      project: {
        ...projectData,
        assetCount: assets.length,
      },
      assets,
      activity,
    });
  } catch (err: any) {
    logFirestoreFallback('projects', err);
    const proj = inMemoryProjects.get(id);
    if (!proj || proj.uid !== uid || proj.deletedAt) {
      return res.status(404).json({ error: 'Project not found' });
    }
    return res.json({ project: proj, assets: [], activity: [] });
  }
});

/**
 * PATCH /api/projects/:id
 * Renames or updates a project's details.
 */
projectsRouter.patch('/:id', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const parseResult = updateProjectSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.format(),
    });
  }

  const { id } = req.params;
  const uid = req.user!.uid;
  const { name, description, collageColors } = parseResult.data;

  try {
    const docRef = adminDb.collection('projects').doc(id);
    const doc = await docRef.get();

    if (!doc.exists || doc.data()?.uid !== uid || doc.data()?.deletedAt) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (collageColors !== undefined) updates.collageColors = collageColors;

    await docRef.update(updates);
    const updated = { id, ...doc.data(), ...updates };
    return res.json({ project: updated });
  } catch (err: any) {
    logFirestoreFallback('projects', err);
    const proj = inMemoryProjects.get(id);
    if (!proj || proj.uid !== uid || proj.deletedAt) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (name !== undefined) proj.name = name;
    if (description !== undefined) proj.description = description;
    if (collageColors !== undefined) proj.collageColors = collageColors;
    proj.updatedAt = new Date().toISOString();
    return res.json({ project: proj });
  }
});

/**
 * DELETE /api/projects/:id
 * Soft deletes a project (sets deletedAt).
 */
projectsRouter.delete('/:id', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const uid = req.user!.uid;

  try {
    const docRef = adminDb.collection('projects').doc(id);
    const doc = await docRef.get();

    if (!doc.exists || doc.data()?.uid !== uid) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await docRef.update({ deletedAt: new Date().toISOString() });
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    logFirestoreFallback('projects', err);
    const proj = inMemoryProjects.get(id);
    if (proj && proj.uid === uid) {
      proj.deletedAt = new Date().toISOString();
      return res.json({ success: true, deletedId: id });
    }
    return res.status(500).json({ error: `Delete failed: ${err.message}` });
  }
});

/**
 * POST /api/projects/:id/assets
 * Adds one or more assets to a project.
 */
projectsRouter.post('/:id/assets', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const parseResult = addProjectAssetsSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parseResult.error.format(),
    });
  }

  const { id } = req.params;
  const uid = req.user!.uid;
  const { assetIds } = parseResult.data;

  try {
    const batch = adminDb.batch();
    const now = new Date().toISOString();

    for (const aId of assetIds) {
      const aRef = adminDb.collection('assets').doc(aId);
      batch.update(aRef, { projectId: id, updatedAt: now });
    }

    // Update project updatedAt
    const pRef = adminDb.collection('projects').doc(id);
    batch.update(pRef, { updatedAt: now });

    await batch.commit();
    return res.json({ success: true, addedCount: assetIds.length });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to add assets: ${err.message}` });
  }
});

/**
 * DELETE /api/projects/:id/assets/:assetId
 * Removes an asset from a project (sets projectId to null).
 */
projectsRouter.delete('/:id/assets/:assetId', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id, assetId } = req.params;
  const uid = req.user!.uid;

  try {
    const aRef = adminDb.collection('assets').doc(assetId);
    const aDoc = await aRef.get();
    if (aDoc.exists && aDoc.data()?.uid === uid) {
      await aRef.update({ projectId: null, updatedAt: new Date().toISOString() });
    }
    return res.json({ success: true, removedAssetId: assetId });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to remove asset: ${err.message}` });
  }
});
