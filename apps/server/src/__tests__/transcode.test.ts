import { describe, expect, it } from 'vitest';
import { cacheKey } from '../transcode.js';

describe('cacheKey', () => {
  it('combines source hash + target spec into a stable .wav name', () => {
    const key = cacheKey('abc123', { sampleRate: 22050, bitDepth: 16, channels: 1 });
    expect(key).toBe('abc123_22050_16_1.wav');
  });

  it('is stable for the same inputs and varies by spec', () => {
    const a = cacheKey('h', { sampleRate: 44100, bitDepth: 16, channels: 2 });
    const b = cacheKey('h', { sampleRate: 44100, bitDepth: 16, channels: 2 });
    const c = cacheKey('h', { sampleRate: 22050, bitDepth: 16, channels: 1 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('sanitises unsafe characters from the hash', () => {
    expect(cacheKey('../../etc/passwd', { sampleRate: 22050, bitDepth: 16, channels: 1 })).toBe(
      'etcpasswd_22050_16_1.wav',
    );
  });
});
