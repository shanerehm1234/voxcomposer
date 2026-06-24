import type { VoxClip, VoxDevice, VoxShow } from '@voxcomposer/shared';

/** Smallest clip length a resize is allowed to produce. */
export const MIN_CLIP_MS = 50;

/** Default snap grid, in ms. */
export const SNAP_MS = 100;

export function snap(ms: number, enabled: boolean, step = SNAP_MS): number {
  return enabled ? Math.round(ms / step) * step : ms;
}

/** Return a new show with one clip replaced by `next` (matched by id). */
export function replaceClip(show: VoxShow, clipId: string, next: VoxClip): VoxShow {
  return {
    ...show,
    modified: new Date().toISOString(),
    tracks: show.tracks.map((track) => {
      if (!track.clips.some((c) => c.id === clipId)) return track;
      return { ...track, clips: track.clips.map((c) => (c.id === clipId ? next : c)) };
    }),
  };
}

/** Return a new show with `clip` appended to the given track. */
export function addClip(show: VoxShow, trackId: string, clip: VoxClip): VoxShow {
  return {
    ...show,
    modified: new Date().toISOString(),
    tracks: show.tracks.map((track) =>
      track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track,
    ),
  };
}

/** Return a new show with the given clip removed. */
export function removeClip(show: VoxShow, clipId: string): VoxShow {
  return {
    ...show,
    modified: new Date().toISOString(),
    tracks: show.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((c) => c.id !== clipId),
    })),
  };
}

/** Return a new show with a track (and all its clips) removed. */
export function removeTrack(show: VoxShow, trackId: string): VoxShow {
  return {
    ...show,
    modified: new Date().toISOString(),
    tracks: show.tracks.filter((t) => t.id !== trackId),
  };
}

/**
 * Return a new show with `device` added (or, if its id already matches an
 * existing device, replacing it in place — supports both "add" and "edit").
 */
export function addDevice(show: VoxShow, device: VoxDevice): VoxShow {
  const exists = show.devices.some((d) => d.id === device.id);
  return {
    ...show,
    modified: new Date().toISOString(),
    devices: exists
      ? show.devices.map((d) => (d.id === device.id ? device : d))
      : [...show.devices, device],
  };
}

/** Return a new show with the device removed (tracks pointing to it are left as-is). */
export function removeDevice(show: VoxShow, deviceId: string): VoxShow {
  return {
    ...show,
    modified: new Date().toISOString(),
    devices: show.devices.filter((d) => d.id !== deviceId),
  };
}

/** Return a new show with a track's label changed. */
export function setTrackLabel(show: VoxShow, trackId: string, label: string): VoxShow {
  return {
    ...show,
    modified: new Date().toISOString(),
    tracks: show.tracks.map((t) => (t.id === trackId ? { ...t, label } : t)),
  };
}

export function findClip(show: VoxShow, clipId: string): VoxClip | null {
  for (const track of show.tracks) {
    const found = track.clips.find((c) => c.id === clipId);
    if (found) return found;
  }
  return null;
}

export function findTrackIdOfClip(show: VoxShow, clipId: string): string | null {
  for (const track of show.tracks) {
    if (track.clips.some((c) => c.id === clipId)) return track.id;
  }
  return null;
}

/** Generate a reasonably unique clip id. */
export function newClipId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `clip-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Clone `clip` onto `trackId` at `startMs` with a fresh id. Returns both. */
export function pasteClip(
  show: VoxShow,
  trackId: string,
  clip: VoxClip,
  startMs: number,
): { show: VoxShow; clip: VoxClip } {
  const copy: VoxClip = {
    ...clip,
    id: newClipId(),
    startMs: Math.max(0, startMs),
    data: { ...clip.data },
  };
  return { show: addClip(show, trackId, copy), clip: copy };
}

export type DragMode = 'move' | 'resize-start' | 'resize-end';

/**
 * Compute a clip's new position/length for a drag of `deltaMs`, snapping and
 * clamping. Pure — returns the fields that change, leaving the caller to merge.
 */
export function applyDrag(
  origStartMs: number,
  origDurMs: number,
  mode: DragMode,
  deltaMs: number,
  snapOn: boolean,
): { startMs: number; durationMs: number } {
  if (mode === 'move') {
    const startMs = Math.max(0, snap(origStartMs + deltaMs, snapOn));
    return { startMs, durationMs: origDurMs };
  }
  if (mode === 'resize-end') {
    const end = snap(origStartMs + origDurMs + deltaMs, snapOn);
    const durationMs = Math.max(MIN_CLIP_MS, end - origStartMs);
    return { startMs: origStartMs, durationMs };
  }
  // resize-start: move the left edge, keep the right edge fixed.
  const rightEdge = origStartMs + origDurMs;
  const startMs = Math.max(0, Math.min(snap(origStartMs + deltaMs, snapOn), rightEdge - MIN_CLIP_MS));
  return { startMs, durationMs: rightEdge - startMs };
}
