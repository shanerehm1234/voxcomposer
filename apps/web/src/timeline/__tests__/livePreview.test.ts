import type { VoxClip, VoxShow } from '@voxcomposer/shared';
import { describe, expect, it } from 'vitest';
import { resolveActiveClipStates } from '../livePreview.js';

function clip(id: string, type: string, startMs: number, durationMs: number, data: Record<string, unknown> = {}): VoxClip {
  return { id, startMs, durationMs, type, data };
}

function show(): VoxShow {
  const now = new Date().toISOString();
  return {
    version: '1.0.0',
    name: 'T',
    created: now,
    modified: now,
    duration: 30000,
    devices: [
      { id: 'PX1', name: 'Pixel', type: 'pixel', apiVersion: '1.0.0' },
      { id: 'A1', name: 'Audio', type: 'skull', apiVersion: '1.0.0' },
    ],
    tracks: [
      {
        id: 'T1',
        deviceId: 'PX1',
        type: 'pixel',
        label: 'Pixel',
        clips: [clip('c1', 'pixel', 1000, 4000, { animation: 'glow', color: '#1030FF' })],
      },
      {
        id: 'T2',
        deviceId: 'A1',
        type: 'audio',
        label: 'Audio',
        clips: [clip('c2', 'audio', 0, 30000, { filename: 'a.wav' })],
      },
    ],
    metadata: {},
  };
}

describe('resolveActiveClipStates', () => {
  it('returns the live-preview clip active at the playhead', () => {
    const states = resolveActiveClipStates(show(), 2000);
    expect(states).toEqual([
      {
        trackId: 'T1',
        deviceId: 'PX1',
        clipId: 'c1',
        type: 'pixel',
        data: { animation: 'glow', color: '#1030FF' },
      },
    ]);
  });

  it('excludes audio tracks even when the playhead is inside an audio clip', () => {
    const states = resolveActiveClipStates(show(), 2000);
    expect(states.some((s) => s.deviceId === 'A1')).toBe(false);
  });

  it('returns nothing when the playhead is outside every clip', () => {
    expect(resolveActiveClipStates(show(), 10000)).toEqual([]);
  });

  it('treats the clip span as [startMs, startMs+durationMs)', () => {
    expect(resolveActiveClipStates(show(), 1000)).toHaveLength(1); // inclusive start
    expect(resolveActiveClipStates(show(), 5000)).toHaveLength(0); // exclusive end
  });
});
