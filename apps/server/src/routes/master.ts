import { loadShow, type VoxShow } from '@voxcomposer/shared';
import { Router } from 'express';

/**
 * Mock of the VoxMaster firmware's HTTP surface (root paths, not /api/*), so the
 * editor's "Send to Master" / playback can be exercised without hardware. Mirrors
 * the real endpoints: POST/GET /show, POST /play, POST /stop, GET /status.
 */
export const masterRouter: Router = Router();

let activeShow: VoxShow | null = null;
let playing = false;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'show';
}

masterRouter.post('/show', (req, res) => {
  let show;
  try {
    show = loadShow(req.body).show;
  } catch (err) {
    return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'Invalid .vox' });
  }
  activeShow = show;
  const clips = show.tracks.reduce((n, t) => n + t.clips.length, 0);
  res.json({ ok: true, name: show.name, slug: slugify(show.name), clips, durationMs: show.duration });
});

masterRouter.get('/show', (_req, res) => {
  if (!activeShow) return res.status(404).json({ ok: false, error: 'No active show' });
  res.json(activeShow);
});

masterRouter.post('/play', (_req, res) => {
  if (!activeShow) return res.status(409).json({ ok: false, error: 'No active show' });
  playing = true;
  res.json({ ok: true, playing });
});

masterRouter.post('/stop', (_req, res) => {
  playing = false;
  res.json({ ok: true, playing });
});

masterRouter.get('/status', (_req, res) => {
  res.json({
    ok: true,
    service: 'voxmaster-mock',
    show: activeShow ? { name: activeShow.name, durationMs: activeShow.duration } : null,
    playing,
  });
});
