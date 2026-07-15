import { describe, expect, it } from 'vitest';
import type { VoxShow } from '@voxcomposer/shared';
import { deviceAudioName, missingAudio, neededAudio } from '../sync.js';

describe('deviceAudioName', () => {
  it('normalizes any source to a .wav basename', () => {
    expect(deviceAudioName('growl.mp3')).toBe('growl.wav');
    expect(deviceAudioName('laugh.wav')).toBe('laugh.wav');
    expect(deviceAudioName('/media/clips/scream.ogg')).toBe('scream.wav');
    expect(deviceAudioName('C:\\snd\\thud.m4a')).toBe('thud.wav');
    expect(deviceAudioName('noext')).toBe('noext.wav');
  });
});

function show(tracks: VoxShow['tracks']): VoxShow {
  return { version: '1', name: 't', duration: 1000, tracks, devices: [] } as unknown as VoxShow;
}
function audioTrack(deviceId: string, files: string[]) {
  return {
    id: `trk-${deviceId}`,
    deviceId,
    type: 'audio',
    label: 'A',
    clips: files.map((f, i) => ({
      id: `c${i}`,
      startMs: 0,
      durationMs: 100,
      type: 'audio',
      data: { filename: f, deviceId },
    })),
  } as unknown as VoxShow['tracks'][number];
}

describe('neededAudio', () => {
  it('collects the device WAV names for one device, deduped', () => {
    const s = show([
      audioTrack('SKULL', ['growl.mp3', 'laugh.wav', 'growl.mp3']), // dup source
      audioTrack('OTHER', ['nope.wav']), // different device
    ]);
    const needed = neededAudio(s, 'SKULL').sort();
    expect(needed).toEqual(['growl.wav', 'laugh.wav']);
  });

  it('ignores non-audio tracks', () => {
    const s = show([
      { id: 'e', deviceId: 'SKULL', type: 'eyes', label: 'E', clips: [] } as unknown as VoxShow['tracks'][number],
    ]);
    expect(neededAudio(s, 'SKULL')).toEqual([]);
  });
});

describe('missingAudio', () => {
  it('returns needed names not present on the device (case-insensitive)', () => {
    expect(missingAudio(['growl.wav', 'laugh.wav'], ['GROWL.WAV'])).toEqual(['laugh.wav']);
    expect(missingAudio(['a.wav'], ['a.wav', 'b.wav'])).toEqual([]);
    expect(missingAudio(['a.wav', 'b.wav'], [])).toEqual(['a.wav', 'b.wav']);
  });
});
