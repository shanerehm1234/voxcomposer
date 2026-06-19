import { Router, raw } from 'express';
import { readCached, transcodeToWav, type TargetSpec } from '../transcode.js';

export const transcodeRouter: Router = Router();

/**
 * POST /api/transcode?hash=<sourceHash>&sampleRate=22050&bitDepth=16&channels=1
 * Body: raw encoded audio bytes (application/octet-stream).
 * Returns: the transcoded WAV (audio/wav), cached by hash + spec.
 *
 * The browser uploads source audio over the LAN at sync time; the server
 * transcodes to the target device's WAV spec and caches it. Media stays local.
 */
transcodeRouter.post('/', raw({ type: '*/*', limit: '64mb' }), async (req, res) => {
  const hash = String(req.query.hash ?? '');
  const spec: TargetSpec = {
    // Default WAV spec: 44.1 kHz / 16-bit / stereo (per-device audioSpec overrides).
    sampleRate: Number(req.query.sampleRate ?? 44100),
    bitDepth: Number(req.query.bitDepth ?? 16),
    channels: Number(req.query.channels ?? 2) === 1 ? 1 : 2,
  };
  if (!hash) return res.status(400).json({ error: 'Missing ?hash= (source content hash).' });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Empty audio body.' });
  }

  try {
    const outPath = await transcodeToWav(new Uint8Array(req.body), hash, spec);
    const wav = await readCached(outPath);
    res.setHeader('content-type', 'audio/wav');
    res.setHeader('x-vox-cache-key', outPath.split('/').pop() ?? '');
    res.send(wav);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Transcode failed' });
  }
});
