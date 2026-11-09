import express from 'express';
import { requireOwnerAuth } from '../middleware/auth.ts';
import { getPublicModelsList } from '../registry/models.ts';

export const modelsRouter = express.Router();

modelsRouter.get('/', requireOwnerAuth, (req: express.Request, res: express.Response) => {
  let models = getPublicModelsList();
  const tool = req.query.tool as string | undefined;
  if (tool) {
    models = models.filter((m) => m.tool === tool);
  }
  return res.json({ models });
});
