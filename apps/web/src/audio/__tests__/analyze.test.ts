import { describe, expect, it } from 'vitest';
import { computePeaks, PEAKS_PER_SEC } from '../analyze.js';

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
