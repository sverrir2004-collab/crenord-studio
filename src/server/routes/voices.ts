import express from 'express';
import { AuthenticatedRequest, requireOwnerAuth } from '../middleware/auth.ts';
import { adminDb } from '../services/firebaseAdmin.ts';

export const voicesRouter = express.Router();
export const inMemoryVoices = new Map<string, any>();

/**
 * GET /api/voices
 * Lists user's custom voices (cloned & designed)
 */
voicesRouter.get('/', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const uid = req.user!.uid;
  try {
    const snap = await adminDb.collection('voices').where('uid', '==', uid).get();
    const voices = snap.docs.map((doc) => doc.data());
    return res.json({ voices });
  } catch {
    const voices = Array.from(inMemoryVoices.values()).filter((v) => v.uid === uid);
    return res.json({ voices });
  }
});

/**
 * DELETE /api/voices/:id
 * Removes a custom voice
 */
voicesRouter.delete('/:id', requireOwnerAuth, async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const uid = req.user!.uid;

  try {
    const docRef = adminDb.collection('voices').doc(id);
    const docSnap = await docRef.get();
    if (docSnap.exists && docSnap.data()?.uid === uid) {
      await docRef.delete();
    }
  } catch {}

  const mem = inMemoryVoices.get(id);
  if (mem && mem.uid === uid) {
    inMemoryVoices.delete(id);
  }

  return res.json({ ok: true, deleted: id });
});
