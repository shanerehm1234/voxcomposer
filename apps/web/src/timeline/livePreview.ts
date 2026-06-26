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
export function resolveActiveClipStates(show: VoxShow, atMs: number): ClipState[] {
  const states: ClipState[] = [];
  for (const track of show.tracks) {
    if (!LIVE_PREVIEW_TYPES.has(track.type)) continue;
    for (const clip of track.clips) {
      if (atMs < clip.startMs || atMs >= clip.startMs + clip.durationMs) continue;
      states.push({
        trackId: track.id,
        deviceId: track.deviceId,
        clipId: clip.id,
        type: clip.type,
        data: clip.data,
      });
    }
  }
  return states;
}
