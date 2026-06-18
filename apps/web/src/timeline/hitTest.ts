import type { VoxShow } from '@voxcomposer/shared';
import { trackTop } from './render.js';
import { LAYOUT, msToPx, msToX, type Viewport } from './viewport.js';

export interface ClipHit {
  trackId: string;
  clipId: string;
  /** Which part of the clip the point landed on. */
  zone: 'body' | 'resize-start' | 'resize-end';
}

const EDGE_PX = 6;

/**
 * Find the clip at a point in the content area. `contentX` is pixels from the
 * left edge of the track content (i.e. already minus the header width); `y` is
 * canvas-relative. Returns null when the point is empty space.
 *
 * Geometry MUST stay in sync with drawClips() in render.ts.
 */
export function clipAtPoint(
  show: VoxShow,
  vp: Viewport,
  contentX: number,
  y: number,
): ClipHit | null {
  for (let row = 0; row < show.tracks.length; row++) {
    const top = trackTop(row);
    const clipY = top + 6;
    const clipH = LAYOUT.trackHeight - 12;
    if (y < clipY || y > clipY + clipH) continue;

    const track = show.tracks[row]!;
    for (const clip of track.clips) {
      const x = msToX(vp, clip.startMs);
      const w = Math.max(2, msToPx(vp, clip.durationMs));
      if (contentX < x || contentX > x + w) continue;
      let zone: ClipHit['zone'] = 'body';
      if (w > EDGE_PX * 3) {
        if (contentX <= x + EDGE_PX) zone = 'resize-start';
        else if (contentX >= x + w - EDGE_PX) zone = 'resize-end';
      }
      return { trackId: track.id, clipId: clip.id, zone };
    }
  }
  return null;
}

/**
 * Ids of every clip whose body rect intersects a marquee rect. The rect is
 * given in the same coordinate space as {@link clipAtPoint}: `x` in content px
 * (header excluded), `y` canvas-relative. Normalises negative w/h.
 */
export function clipsInRect(
  show: VoxShow,
  vp: Viewport,
  rect: { x: number; y: number; w: number; h: number },
): string[] {
  const rx = rect.w < 0 ? rect.x + rect.w : rect.x;
  const ry = rect.h < 0 ? rect.y + rect.h : rect.y;
  const rw = Math.abs(rect.w);
  const rh = Math.abs(rect.h);
  const ids: string[] = [];
  for (let row = 0; row < show.tracks.length; row++) {
    const top = trackTop(row);
    const clipY = top + 6;
    const clipH = LAYOUT.trackHeight - 12;
    // Vertical overlap with this lane?
    if (ry + rh < clipY || ry > clipY + clipH) continue;
    for (const clip of show.tracks[row]!.clips) {
      const x = msToX(vp, clip.startMs);
      const w = Math.max(2, msToPx(vp, clip.durationMs));
      if (x + w < rx || x > rx + rw) continue; // horizontal overlap
      ids.push(clip.id);
    }
  }
  return ids;
}
