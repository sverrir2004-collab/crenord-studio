import express from 'express';
import { AuthenticatedRequest, requireOwnerAuth } from '../middleware/auth.ts';

export const meRouter = express.Router();

meRouter.get('/', requireOwnerAuth, (req: AuthenticatedRequest, res: express.Response) => {
  return res.json({
    uid: req.user?.uid,
    email: req.user?.email,
    isOwner: true,
  });
});
