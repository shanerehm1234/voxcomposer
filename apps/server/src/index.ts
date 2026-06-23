import { VOX_LINK_API_VERSION } from '@voxcomposer/shared';
import cors from 'cors';
import express, { type Express } from 'express';
import { createServer } from 'node:http';
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
// Mock of the firmware's root HTTP surface (POST /show, /play, /status, …).
app.use('/', masterRouter);

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
