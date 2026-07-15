import { describe, expect, it } from 'vitest';
import { computePeaks, parseWavPcm, PEAKS_PER_SEC } from '../analyze.js';

/** Build a minimal 16-bit PCM WAV from per-channel float samples. */
function makeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numCh = channels.length;
  const frames = channels[0]!.length;
  const dataBytes = frames * numCh * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numCh * 2, true);
  v.setUint16(32, numCh * 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  let p = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch]![i]!));
      v.setInt16(p, Math.round(s * 32767), true);
      p += 2;
    }
  }
  return buf;
}

describe('parseWavPcm', () => {
  it('decodes a 16-bit mono WAV to normalized floats + sample rate', () => {
    const src = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const parsed = parseWavPcm(makeWav([src], 44100));
    expect(parsed).not.toBeNull();
    expect(parsed!.sampleRate).toBe(44100);
    expect(parsed!.channelData).toHaveLength(1);
    expect(parsed!.channelData[0]!.length).toBe(5);
    expect(parsed!.channelData[0]![1]).toBeCloseTo(0.5, 2);
    expect(parsed!.channelData[0]![2]).toBeCloseTo(-0.5, 2);
  });

  it('de-interleaves stereo channels', () => {
    const left = new Float32Array([0.25, 0.25]);
    const right = new Float32Array([-0.75, -0.75]);
    const parsed = parseWavPcm(makeWav([left, right], 48000));
    expect(parsed!.channelData).toHaveLength(2);
    expect(parsed!.channelData[0]![0]).toBeCloseTo(0.25, 2);
    expect(parsed!.channelData[1]![0]).toBeCloseTo(-0.75, 2);
  });

  it('returns null for non-WAV bytes (caller falls back to the platform decoder)', () => {
    const notWav = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    expect(parseWavPcm(notWav)).toBeNull();
  });
});

describe('computePeaks', () => {
  it('normalizes the loudest peak to 1', () => {
    const sampleRate = 48000;
    const samples = new Float32Array(sampleRate); // 1 second
    // A quiet section and a loud spike.
    samples.fill(0.25);
    samples[1000] = 0.8;
    const peaks = computePeaks(samples, sampleRate);
    expect(Math.max(...peaks)).toBeCloseTo(1, 5);
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0);
  });

  it('produces roughly PEAKS_PER_SEC buckets per second', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate * 2); // 2 seconds
    samples.fill(0.5);
    const peaks = computePeaks(samples, sampleRate);
    expect(peaks.length).toBe(2 * PEAKS_PER_SEC);
  });

  it('handles silence without dividing by zero', () => {
    const peaks = computePeaks(new Float32Array(1000), 44100);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });
});
