import { VOX_LINK_API_VERSION } from '@voxcomposer/shared';
import cors from 'cors';
import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { masterRouter } from './routes/master.js';
import { projectsRouter } from './routes/projects.js';
import { transcodeRouter } from './routes/transcode.js';
import { attachVoxLink } from './voxlink.js';

const app: Express = express();
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'voxcomposer-server', voxLinkApi: VOX_LINK_API_VERSION });
});

app.use('/api/projects', projectsRouter);
app.use('/api/transcode', transcodeRouter);
// Mock of the firmware's root HTTP surface (POST /show, /play, /status, …) —
// a dev/test convenience for exercising the protocol without real hardware.
// Doesn't claim "/", so it can't shadow the editor's index.html below; a real
// customer's browser talks straight to their actual Master instead (see
// docs/HOSTING_DECISION.md) — this server's job is serving the app + local
// project storage, not standing in for the hardware.
app.use('/', masterRouter);

// Serve the built editor (apps/web/dist) so this one process is the whole
// local install — "docker compose up" or "pnpm dev" and the app is just
// there at http://localhost:8080, no separate static server required. The
// SPA uses hash-based routing (no History-API paths), so plain static
// serving is enough — no catch-all/rewrite rule needed.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
} else {
  console.warn(
    `[voxcomposer-server] ${webDist} not found — the editor won't be served.\n` +
      '  Build it first: pnpm --filter @voxcomposer/web build',
  );
}

const httpServer = createServer(app);
// Vox-Link mock Master over raw WebSocket (same protocol as the real firmware).
const voxlink = attachVoxLink(httpServer);

export { app, voxlink };

// Start only when run directly (not when imported by tests).
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(env.port, () => {
    console.log(`Vox Composer server listening on http://localhost:${env.port}`);
  });
}
