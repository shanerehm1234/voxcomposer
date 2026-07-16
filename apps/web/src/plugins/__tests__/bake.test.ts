import { beforeEach, describe, expect, it } from 'vitest';
import type { VoxShow } from '@voxcomposer/shared';
import { registerBuiltins } from '../builtins.js';
import { setPluginConfig } from '../config.js';
import { bakeShow, countBaked } from '../bake.js';

/**
 * bakeShow stamps each plugin clip with the concrete HTTP action the Master
 * replays. A configured Hue clip must gain `data.baked`; a native track must be
 * left untouched.
 */

function show(): VoxShow {
  return {
    version: '1',
    name: 't',
    duration: 1000,
    devices: [],
    tracks: [
      {
        id: 'hue-trk',
        type: 'hue',
        label: 'Hue',
        clips: [
          { id: 'c1', startMs: 0, durationMs: 500, type: 'hue', data: { kind: 'scene', sceneId: 'SC1', sceneName: 'Spooky' } },
          { id: 'c2', startMs: 500, durationMs: 500, type: 'hue', data: { kind: 'scene', sceneId: '' } }, // nothing picked
        ],
      },
      {
        id: 'audio-trk',
        type: 'audio',
        label: 'Audio',
        clips: [{ id: 'a1', startMs: 0, durationMs: 500, type: 'audio', data: { filename: 'growl.mp3' } }],
      },
    ],
  } as unknown as VoxShow;
}

describe('bakeShow', () => {
  beforeEach(() => {
    registerBuiltins();
    setPluginConfig('com.rehmlights.hue', { bridgeIp: '10.0.0.5', username: 'KEY' });
  });

  it('bakes an HTTP action onto a configured, selected Hue clip', () => {
    const baked = bakeShow(show());
    const hueTrack = baked.tracks.find((t) => t.type === 'hue')!;
    const c1 = hueTrack.clips[0]!.data as { baked?: { url: string; method: string } };
    expect(c1.baked).toMatchObject({
      method: 'PUT',
      url: 'http://10.0.0.5/api/KEY/groups/0/action',
    });
  });

  it('leaves unselected plugin clips and native tracks untouched', () => {
    const baked = bakeShow(show());
    const hueTrack = baked.tracks.find((t) => t.type === 'hue')!;
    expect((hueTrack.clips[1]!.data as { baked?: unknown }).baked).toBeUndefined();
    const audio = baked.tracks.find((t) => t.type === 'audio')!;
    expect((audio.clips[0]!.data as { baked?: unknown }).baked).toBeUndefined();
    expect(countBaked(show())).toBe(1);
  });

  it('rewrites audio clip filenames to the on-device WAV name', () => {
    const baked = bakeShow(show());
    const audio = baked.tracks.find((t) => t.type === 'audio')!;
    expect((audio.clips[0]!.data as { filename?: string }).filename).toBe('growl.wav');
  });

  it('does not mutate the original show', () => {
    const s = show();
    bakeShow(s);
    expect((s.tracks[0]!.clips[0]!.data as { baked?: unknown }).baked).toBeUndefined();
  });

  it('bakes nothing when the plugin is unconfigured', () => {
    setPluginConfig('com.rehmlights.hue', { bridgeIp: '', username: '' });
    expect(countBaked(show())).toBe(0);
  });
});
