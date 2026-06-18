import type { VoxShow } from '@voxcomposer/shared';
import { describe, expect, it } from 'vitest';
import { clipAtPoint, clipsInRect } from '../hitTest.js';
import type { Viewport } from '../viewport.js';

// pxPerMs 0.1 → 1000 ms == 100 px; lanes: trackTop(row) = 32 + row*65, body y 6..58.
const vp: Viewport = { pxPerMs: 0.1, scrollMs: 0 };

function show(): VoxShow {
  const now = new Date().toISOString();
  const mk = (id: string, startMs: number, durationMs: number) => ({
    id,
    startMs,
    durationMs,
    type: 'audio',
    data: {},
  });
  return {
    version: '1.0.0',
    name: 'T',
    created: now,
    modified: now,
    duration: 10000,
    devices: [],
    tracks: [
      { id: 't0', deviceId: 'd', type: 'audio', label: 'A', clips: [mk('c0', 0, 1000)] },
      { id: 't1', deviceId: 'd', type: 'audio', label: 'B', clips: [mk('c1', 2000, 1000)] },
    ],
    metadata: {},
  };
}

describe('clipAtPoint', () => {
  it('hits a clip body and detects resize edges', () => {
    const s = show();
    // c0 spans x 0..100 on lane 0 (body y ~38..90).
    expect(clipAtPoint(s, vp, 50, 50)?.clipId).toBe('c0');
    expect(clipAtPoint(s, vp, 1, 50)?.zone).toBe('resize-start');
    expect(clipAtPoint(s, vp, 99, 50)?.zone).toBe('resize-end');
    expect(clipAtPoint(s, vp, 150, 50)).toBeNull();
  });
});

describe('clipsInRect', () => {
  it('selects only clips the rect intersects on the right lane', () => {
    const s = show();
    // Rect over lane 0, x 0..150 → c0 only.
    expect(clipsInRect(s, vp, { x: 0, y: 38, w: 150, h: 40 })).toEqual(['c0']);
  });

  it('selects clips across lanes when the rect spans them', () => {
    const s = show();
    const ids = clipsInRect(s, vp, { x: 0, y: 38, w: 400, h: 120 });
    expect(ids.sort()).toEqual(['c0', 'c1']);
  });

  it('normalises a rect dragged up-and-left (negative w/h)', () => {
    const s = show();
    // Drag from (150,90) to (0,38) → covers c0.
    expect(clipsInRect(s, vp, { x: 150, y: 90, w: -150, h: -52 })).toEqual(['c0']);
  });

  it('selects nothing for an empty gap', () => {
    const s = show();
    expect(clipsInRect(s, vp, { x: 120, y: 38, w: 60, h: 40 })).toEqual([]);
  });
});
