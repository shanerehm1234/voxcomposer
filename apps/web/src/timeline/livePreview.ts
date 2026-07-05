import type { ClipState, VoxShow } from '@voxcomposer/shared';

/**
 * Clip types streamed to real hardware while live preview is on. Audio isn't
 * here: it plays back locally in the browser (and on a real show, off the
 * Master's own SD card) rather than as a per-frame Vox-Link command, so
 * relaying it as a "clip state" would just be a remote command nothing reads.
 */
const LIVE_PREVIEW_TYPES = new Set(['pixel', 'eyes', 'dmx', 'relay', 'servo', 'neck']);

/**
 * Resolve every clip active at `atMs` into the wire `ClipState[]` a
 * `preview_frame` carries — one entry per (track, clip) whose span contains
 * the playhead. Pure function of `show` + `atMs` so the timeline's render
 * loop can call it every tick without any extra state to keep in sync.
 */
/** Linear fade multiplier (0..1) for a pixel clip at `offsetMs` into it. */
function pixelFade(data: Record<string, unknown>, offsetMs: number, durationMs: number): number {
  const num = (k: string) => (typeof data[k] === 'number' ? (data[k] as number) : 0);
  const fadeIn = num('fadeInMs');
  const fadeOut = num('fadeOutMs');
  let f = 1;
  if (fadeIn > 0 && offsetMs < fadeIn) f = Math.min(f, offsetMs / fadeIn);
  const tail = durationMs - offsetMs;
  if (fadeOut > 0 && tail < fadeOut) f = Math.min(f, Math.max(0, tail / fadeOut));
  return f;
}

export function resolveActiveClipStates(show: VoxShow, atMs: number): ClipState[] {
  const states: ClipState[] = [];
  for (const track of show.tracks) {
    if (!LIVE_PREVIEW_TYPES.has(track.type)) continue;
    for (const clip of track.clips) {
      if (atMs < clip.startMs || atMs >= clip.startMs + clip.durationMs) continue;
      let data = clip.data;
      // Pixel fades ease brightness up/down at the clip's ends. Applied here
      // (Composer streams ~10Hz) so the remote just shows the faded value.
      if (track.type === 'pixel') {
        const f = pixelFade(clip.data as Record<string, unknown>, atMs - clip.startMs, clip.durationMs);
        if (f < 1) {
          const bri = typeof clip.data.brightness === 'number' ? clip.data.brightness : 255;
          data = { ...clip.data, brightness: Math.round(bri * f) };
        }
      }
      states.push({
        trackId: track.id,
        deviceId: track.deviceId,
        clipId: clip.id,
        type: clip.type,
        data,
      });
    }
  }
  return states;
}
