import { VOX_LINK_API_VERSION } from '@voxcomposer/shared';
import cors from 'cors';
import express, { type Express } from 'express';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@voxcomposer/shared';
import { env } from './env.js';
import { projectsRouter } from './routes/projects.js';
import { transcodeRouter } from './routes/transcode.js';
import { attachSocketHandlers } from './socket.js';

const app: Express = express();
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'voxcomposer-server', voxLinkApi: VOX_LINK_API_VERSION });
});

app.use('/api/projects', projectsRouter);
app.use('/api/transcode', transcodeRouter);

const httpServer = createServer(app);
const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: env.corsOrigin },
});

attachSocketHandlers(io);

export { app, io };

// Start only when run directly (not when imported by tests).
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(env.port, () => {
    console.log(`Vox Composer server listening on http://localhost:${env.port}`);
  });
}
