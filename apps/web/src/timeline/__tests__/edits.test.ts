import type { VoxClip, VoxShow } from '@voxcomposer/shared';
import { describe, expect, it } from 'vitest';
import {
  addClip,
  applyDrag,
  findClip,
  findTrackIdOfClip,
  MIN_CLIP_MS,
  pasteClip,
  removeClip,
  replaceClip,
  snap,
} from '../edits.js';

function clip(id: string, startMs: number, durationMs: number): VoxClip {
  return { id, startMs, durationMs, type: 'audio', data: { filename: `${id}.wav` } };
}

function show(): VoxShow {
  const now = new Date().toISOString();
  return {
    version: '1.0.0',
    name: 'T',
    created: now,
    modified: now,
    duration: 30000,
    devices: [{ id: 'D1', name: 'Dev', type: 'skull', apiVersion: '1.0.0' }],
    tracks: [{ id: 'T1', deviceId: 'D1', type: 'audio', label: 'A', clips: [clip('c1', 1000, 4000)] }],
    metadata: {},
  };
}

describe('snap', () => {
  it('rounds to the grid when enabled, passes through when not', () => {
    expect(snap(1040, true, 100)).toBe(1000);
    expect(snap(1060, true, 100)).toBe(1100);
    expect(snap(1234, false)).toBe(1234);
  });
});

describe('applyDrag', () => {
  it('move keeps duration and clamps at 0', () => {
    expect(applyDrag(1000, 4000, 'move', -5000, false)).toEqual({ startMs: 0, durationMs: 4000 });
  });

  it('resize-end enforces a minimum length', () => {
    const r = applyDrag(1000, 4000, 'resize-end', -100000, false);
    expect(r.startMs).toBe(1000);
    expect(r.durationMs).toBe(MIN_CLIP_MS);
  });

  it('resize-start keeps the right edge fixed', () => {
    const orig = { start: 1000, dur: 4000 };
    const r = applyDrag(orig.start, orig.dur, 'resize-start', -500, false);
    expect(r.startMs).toBe(500);
    expect(r.startMs + r.durationMs).toBe(orig.start + orig.dur);
  });
});

describe('clip collection ops', () => {
  it('replaceClip swaps the clip by id', () => {
    const next = replaceClip(show(), 'c1', { ...clip('c1', 2000, 4000) });
    expect(findClip(next, 'c1')?.startMs).toBe(2000);
  });

  it('removeClip drops the clip', () => {
    expect(findClip(removeClip(show(), 'c1'), 'c1')).toBeNull();
  });

  it('addClip appends to the right track', () => {
    const next = addClip(show(), 'T1', clip('c2', 8000, 1000));
    expect(next.tracks[0]!.clips).toHaveLength(2);
    expect(findTrackIdOfClip(next, 'c2')).toBe('T1');
  });

  it('pasteClip clones with a fresh id and independent data', () => {
    const s = show();
    const src = findClip(s, 'c1')!;
    const { clip: copy } = pasteClip(s, 'T1', src, 9000);
    expect(copy.id).not.toBe(src.id);
    expect(copy.startMs).toBe(9000);
    expect(copy.data).not.toBe(src.data);
  });
});
