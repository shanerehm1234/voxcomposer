import type { VoxShow } from '@voxcomposer/shared';
import { describe, expect, it } from 'vitest';
import {
  fadeEnvelope,
  resolveStageState,
  sampleKeyframes,
  synthJaw,
  RELAY_CHANNELS,
  type DmxVisual,
  type PixelVisual,
  type RelayVisual,
  type SkullVisual,
} from '../stageState.js';

const noJaw = () => null;

function show(partial: Partial<VoxShow>): VoxShow {
  return {
    version: '1.0.0',
    name: 'test',
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
    duration: 60_000,
    devices: [],
    tracks: [],
    metadata: {},
    ...partial,
  } as VoxShow;
}

const clip = (id: string, startMs: number, durationMs: number, type: string, data: Record<string, unknown>) =>
  ({ id, startMs, durationMs, type, data });

describe('fadeEnvelope', () => {
  it('ramps in, holds, and ramps out', () => {
    expect(fadeEnvelope(0, 10_000, 1000, 1000)).toBe(0);
    expect(fadeEnvelope(500, 10_000, 1000, 1000)).toBeCloseTo(0.5);
    expect(fadeEnvelope(5000, 10_000, 1000, 1000)).toBe(1);
    expect(fadeEnvelope(9500, 10_000, 1000, 1000)).toBeCloseTo(0.5);
    expect(fadeEnvelope(10_000, 10_000, 1000, 1000)).toBe(0);
  });

  it('is 1 everywhere with no fades', () => {
    expect(fadeEnvelope(0, 5000, 0, 0)).toBe(1);
    expect(fadeEnvelope(4999, 5000, 0, 0)).toBe(1);
  });
});

describe('sampleKeyframes', () => {
  const kf = [
    { timeMs: 0, value: 0 },
    { timeMs: 1000, value: 1 },
  ];
  it('interpolates linearly between keyframes', () => {
    expect(sampleKeyframes(kf, 500)).toBeCloseTo(0.5);
    expect(sampleKeyframes(kf, 250)).toBeCloseTo(0.25);
  });
  it('clamps to the ends', () => {
    expect(sampleKeyframes(kf, -100)).toBe(0);
    expect(sampleKeyframes(kf, 5000)).toBe(1);
  });
  it('centres when there are no keyframes', () => {
    expect(sampleKeyframes([], 500)).toBe(0.5);
  });
});

describe('synthJaw', () => {
  it('stays in 0..1 and actually moves', () => {
    let min = 1;
    let max = 0;
    for (let t = 0; t < 5000; t += 37) {
      const v = synthJaw(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(max - min).toBeGreaterThan(0.3);
  });
});

describe('resolveStageState', () => {
  it('seeds one idle visual per stage-capable device, preserving order', () => {
    const s = show({
      devices: [
        { id: 'SK:1', name: 'Skelly', type: 'skull', apiVersion: '1.0.0' },
        { id: 'PX:1', name: 'Porch', type: 'pixel', apiVersion: '1.0.0' },
        { id: 'SE:1', name: 'Sensor', type: 'sense', apiVersion: '1.0.0' },
      ],
    });
    const state = resolveStageState(s, 0, noJaw);
    expect(state.visuals.map((v) => v.kind)).toEqual(['skull', 'pixel']);
    const skull = state.visuals[0] as SkullVisual;
    expect(skull.jawOpen).toBe(0);
    expect(skull.eyes).toBeNull();
    expect(skull.talking).toBe(false);
  });

  it('animates the jaw from the sampler while a jawSync audio clip is active', () => {
    const s = show({
      devices: [{ id: 'SK:1', name: 'Skelly', type: 'skull', apiVersion: '1.0.0' }],
      tracks: [
        {
          id: 't1',
          deviceId: 'SK:1',
          type: 'audio',
          label: 'voice',
          clips: [clip('c1', 1000, 4000, 'audio', { filename: 'talk.wav', deviceId: 'SK:1', jawSync: true })],
        },
      ],
    });
    const jaw = (id: string, _offsetMs: number) => (id === 'c1' ? 0.8 : null);
    const during = resolveStageState(s, 2000, jaw).visuals[0] as SkullVisual;
    expect(during.talking).toBe(true);
    expect(during.jawOpen).toBeCloseTo(0.8);
    expect(during.audioFilename).toBe('talk.wav');

    const before = resolveStageState(s, 500, jaw).visuals[0] as SkullVisual;
    expect(before.talking).toBe(false);
    expect(before.jawOpen).toBe(0);
  });

  it('falls back to the synthetic flap when no audio is decoded', () => {
    const s = show({
      devices: [{ id: 'SK:1', name: 'Skelly', type: 'skull', apiVersion: '1.0.0' }],
      tracks: [
        {
          id: 't1',
          deviceId: 'SK:1',
          type: 'audio',
          label: 'voice',
          clips: [clip('c1', 0, 4000, 'audio', { filename: 'talk.wav', deviceId: 'SK:1', jawSync: true })],
        },
      ],
    });
    const v = resolveStageState(s, 1234, noJaw).visuals[0] as SkullVisual;
    expect(v.jawOpen).toBeCloseTo(synthJaw(1234));
  });

  it('scales the jaw by the fade envelope', () => {
    const s = show({
      devices: [{ id: 'SK:1', name: 'Skelly', type: 'skull', apiVersion: '1.0.0' }],
      tracks: [
        {
          id: 't1',
          deviceId: 'SK:1',
          type: 'audio',
          label: 'voice',
          clips: [
            clip('c1', 0, 10_000, 'audio', {
              filename: 'talk.wav',
              deviceId: 'SK:1',
              jawSync: true,
              fadeInMs: 1000,
            }),
          ],
        },
      ],
    });
    const jaw = () => 1;
    const v = resolveStageState(s, 500, jaw).visuals[0] as SkullVisual;
    expect(v.jawOpen).toBeCloseTo(0.5);
  });

  it('applies eyes and 3-axis neck clips to the skull', () => {
    const s = show({
      devices: [{ id: 'SK:1', name: 'Skelly', type: 'skull', apiVersion: '1.0.0' }],
      tracks: [
        {
          id: 't-eyes',
          deviceId: 'SK:1',
          type: 'eyes',
          label: 'eyes',
          clips: [clip('e1', 0, 5000, 'eyes', { animation: 'flicker', color: '#FF0000' })],
        },
        {
          id: 't-neck',
          deviceId: 'SK:1',
          type: 'servo',
          label: 'neck',
          clips: [
            clip('n1', 0, 2000, 'servo', {
              axis: 'pan',
              keyframes: [
                { timeMs: 0, value: 0 },
                { timeMs: 2000, value: 1 },
              ],
            }),
            clip('n2', 0, 2000, 'servo', { axis: 'tilt', keyframes: [{ timeMs: 0, value: 1 }] }),
          ],
        },
      ],
    });
    const v = resolveStageState(s, 1000, noJaw).visuals[0] as SkullVisual;
    expect(v.eyes).toEqual({ animation: 'flicker', color: '#FF0000', lookX: 0, lookY: 0 });
    expect(v.neck.pan).toBeCloseTo(0); // keyframe value 0.5 at midpoint → centred
    expect(v.neck.tilt).toBe(1);
    expect(v.neck.roll).toBe(0);
  });

  it('handles relay on/off/pulse with 4 channels', () => {
    const s = show({
      devices: [{ id: 'RL:1', name: 'Relays', type: 'relay', apiVersion: '1.0.0' }],
      tracks: [
        {
          id: 't1',
          deviceId: 'RL:1',
          type: 'relay',
          label: 'relays',
          clips: [
            clip('r1', 0, 5000, 'relay', { channel: 1, action: 'on' }),
            clip('r2', 0, 5000, 'relay', { channel: 3, action: 'pulse', durationMs: 1000 }),
          ],
        },
      ],
    });
    const early = resolveStageState(s, 500, noJaw).visuals[0] as RelayVisual;
    expect(early.channels).toHaveLength(RELAY_CHANNELS);
    expect(early.channels.find((c) => c.channel === 1)?.on).toBe(true);
    expect(early.channels.find((c) => c.channel === 3)?.on).toBe(true);
    expect(early.channels.find((c) => c.channel === 2)?.on).toBe(false);

    const late = resolveStageState(s, 3000, noJaw).visuals[0] as RelayVisual;
    expect(late.channels.find((c) => c.channel === 1)?.on).toBe(true); // still on
    expect(late.channels.find((c) => c.channel === 3)?.on).toBe(false); // pulse over
  });

  it('ramps DMX values through fadeMs', () => {
    const s = show({
      devices: [{ id: 'DX:1', name: 'Lights', type: 'dmx', apiVersion: '1.0.0' }],
      tracks: [
        {
          id: 't1',
          deviceId: 'DX:1',
          type: 'dmx',
          label: 'dmx',
          clips: [clip('d1', 0, 4000, 'dmx', { channel: 5, value: 200, fadeMs: 1000 })],
        },
      ],
    });
    const mid = resolveStageState(s, 500, noJaw).visuals[0] as DmxVisual;
    expect(mid.channels).toEqual([{ channel: 5, value: 100 }]);
    const after = resolveStageState(s, 2000, noJaw).visuals[0] as DmxVisual;
    expect(after.channels).toEqual([{ channel: 5, value: 200 }]);
  });

  it('activates a pixel strip from a pixel clip and goes dark outside it', () => {
    const s = show({
      devices: [{ id: 'PX:1', name: 'Porch', type: 'pixel', apiVersion: '1.0.0' }],
      tracks: [
        {
          id: 't1',
          deviceId: 'PX:1',
          type: 'pixel',
          label: 'pixels',
          clips: [clip('p1', 1000, 2000, 'pixel', { animation: 'chase', color: '#00FF00', brightness: 128 })],
        },
      ],
    });
    const on = resolveStageState(s, 1500, noJaw).visuals[0] as PixelVisual;
    expect(on.active?.label).toBe('chase');
    expect(on.active?.params.animation).toBe('chase');
    expect(on.active?.params.color).toBe('#00FF00');
    expect(on.active?.params.brightness).toBe(128);
    const off = resolveStageState(s, 3500, noJaw).visuals[0] as PixelVisual;
    expect(off.active).toBeNull();
  });

  it('lets a WLED effect supersede the basic animation, and carries pixelCount', () => {
    const s = show({
      devices: [
        { id: 'PX:1', name: 'Ring', type: 'pixel', apiVersion: '1.0.0', pixelCount: 35 },
      ],
      tracks: [
        {
          id: 't1',
          deviceId: 'PX:1',
          type: 'pixel',
          label: 'pixels',
          clips: [
            clip('p1', 0, 2000, 'pixel', {
              animation: 'solid', // must be ignored: wledFx wins
              color: '#00FF00',
              brightness: 255,
              wledFx: 2, // Breathe → pulse primitive
            }),
          ],
        },
      ],
    });
    const v = resolveStageState(s, 1000, noJaw).visuals[0] as PixelVisual;
    expect(v.count).toBe(35);
    expect(v.active?.params.animation).toBe('pulse');
    expect(v.active?.label).toBe('WLED · Breathe');
  });

  it('carries the secondary color through when set', () => {
    const s = show({
      devices: [{ id: 'PX:1', name: 'Ring', type: 'pixel', apiVersion: '1.0.0' }],
      tracks: [
        {
          id: 't1',
          deviceId: 'PX:1',
          type: 'pixel',
          label: 'pixels',
          clips: [
            clip('p1', 0, 2000, 'pixel', { animation: 'chase', color: '#FF0000', color2: '#001040' }),
          ],
        },
      ],
    });
    const v = resolveStageState(s, 1000, noJaw).visuals[0] as PixelVisual;
    expect(v.active?.params.color2).toBe('#001040');
  });

  it('routes audio clips by their data.deviceId, not the track device', () => {
    const s = show({
      devices: [
        { id: 'MA:1', name: 'Master', type: 'audio', apiVersion: '1.0.0' },
        { id: 'SK:1', name: 'Skelly', type: 'skull', apiVersion: '1.0.0' },
      ],
      tracks: [
        {
          id: 't1',
          deviceId: 'MA:1',
          type: 'audio',
          label: 'shared track',
          clips: [clip('c1', 0, 2000, 'audio', { filename: 'talk.wav', deviceId: 'SK:1', jawSync: true })],
        },
      ],
    });
    const state = resolveStageState(s, 1000, () => 0.5);
    const skull = state.visuals.find((v) => v.kind === 'skull') as SkullVisual;
    expect(skull.talking).toBe(true);
    expect(skull.jawOpen).toBeCloseTo(0.5);
  });
});
