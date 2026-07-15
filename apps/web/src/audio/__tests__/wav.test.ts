import { describe, expect, it } from 'vitest';
import { parseWavPcm } from '../analyze.js';
import { encodeWav } from '../wav.js';

describe('encodeWav', () => {
  it('round-trips through parseWavPcm (encode → decode)', () => {
    const src = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]);
    const wav = encodeWav([src], 44100);
    const parsed = parseWavPcm(wav);
    expect(parsed).not.toBeNull();
    expect(parsed!.sampleRate).toBe(44100);
    expect(parsed!.channelData).toHaveLength(1);
    expect(parsed!.channelData[0]!.length).toBe(6);
    expect(parsed!.channelData[0]![1]).toBeCloseTo(0.5, 2);
    expect(parsed!.channelData[0]![2]).toBeCloseTo(-0.5, 2);
    expect(parsed!.channelData[0]![3]).toBeCloseTo(1, 2);
    expect(parsed!.channelData[0]![4]).toBeCloseTo(-1, 2);
  });

  it('encodes stereo interleaved and preserves both channels', () => {
    const left = new Float32Array([0.5, 0.5]);
    const right = new Float32Array([-0.25, -0.25]);
    const parsed = parseWavPcm(encodeWav([left, right], 48000));
    expect(parsed!.sampleRate).toBe(48000);
    expect(parsed!.channelData).toHaveLength(2);
    expect(parsed!.channelData[0]![0]).toBeCloseTo(0.5, 2);
    expect(parsed!.channelData[1]![0]).toBeCloseTo(-0.25, 2);
  });

  it('produces a valid 44-byte header + PCM data section', () => {
    const wav = encodeWav([new Float32Array([0, 0, 0])], 8000);
    expect(wav.byteLength).toBe(44 + 3 * 2); // mono, 3 frames, 16-bit
    const view = new DataView(wav);
    const tag = (o: number) =>
      String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });
});
