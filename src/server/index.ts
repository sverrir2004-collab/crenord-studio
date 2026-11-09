import express from 'express';
import { meRouter } from './routes/me.ts';
import { modelsRouter } from './routes/models.ts';
import { usageRouter } from './routes/usage.ts';
import { jobsRouter } from './routes/jobs.ts';
import { uploadsRouter } from './routes/uploads.ts';
import { assetsRouter } from './routes/assets.ts';
import { projectsRouter } from './routes/projects.ts';
import { voicesRouter } from './routes/voices.ts';

import { checkFirestore, FirestoreCheckResult } from './services/firebaseAdmin.ts';

let cachedHealthResult: FirestoreCheckResult | null = null;
let lastHealthCheckTime = 0;
const HEALTH_CACHE_TTL_MS = 20_000; // 20 seconds

export function createServerApp() {
  const app = express();

  app.use(express.json());

  // API Routes
  app.use('/api/me', meRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/usage', usageRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/voices', voicesRouter);

  // Health and System Status endpoints
  app.get('/api/health', async (req, res) => {
    const now = Date.now();
    const isForce = req.query.force === 'true' || req.query.refresh === 'true';
    if (!cachedHealthResult || isForce || (now - lastHealthCheckTime) >= HEALTH_CACHE_TTL_MS) {
      cachedHealthResult = await checkFirestore();
      lastHealthCheckTime = now;
      req.app.locals.firestoreConnected = cachedHealthResult.ok;
    }

    res.json({
      status: 'ok',
      studio: 'CRENORD',
      firestore: Boolean(cachedHealthResult.ok),
      firestoreCode: cachedHealthResult.code,
      firestoreMessage: cachedHealthResult.message,
    });
  });

  app.get('/api/system/status', async (req, res) => {
    const firestore = Boolean(cachedHealthResult?.ok ?? req.app.locals.firestoreConnected);
    res.json({
      firestoreConnected: firestore,
      storageMode: firestore ? 'firestore' : 'memory',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
