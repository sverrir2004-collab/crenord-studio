import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServerApp } from './src/server/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createServerApp();
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // On server start, do health check using checkFirestore(). Log the code and message on error.
  const { checkFirestore } = await import('./src/server/services/firebaseAdmin.ts');
  const health = await checkFirestore();
  app.locals.firestoreConnected = health.ok;
  if (health.ok) {
    console.log('[Firestore] Startup health check succeeded: Database is connected.');
  } else {
    console.error(`[Firestore] Startup health check failed (${health.code}): ${health.message}`);
  }

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Finish running jobs in the background so results are saved even when the browser tab is closed.
  const { sweepInFlightJobs } = await import('./src/server/routes/jobs.ts');
  setInterval(() => {
    sweepInFlightJobs().catch(() => {});
  }, 15000);

  app.listen(port, '0.0.0.0', () => {
    console.log(`CRENORD server running on port ${port}`);
  });
}

startServer();
