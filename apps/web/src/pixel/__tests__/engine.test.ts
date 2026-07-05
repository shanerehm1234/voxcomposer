import { describe, expect, it } from 'vitest';
import { paramsFromClipData, pixelRgbAt, PIXEL_EFFECTS, type PixelParams } from '../engine.js';

const base: PixelParams = {
  animation: 'solid',
  color: '#FF0000',
  color2: undefined,
  brightness: 255,
  speed: 128,
  size: 4,
  trail: 8,
  density: 64,
  direction: 'forward',
};

describe('paramsFromClipData', () => {
  it('applies defaults and reads set values', () => {
    const p = paramsFromClipData({ animation: 'meteor', speed: 200, direction: 'reverse' });
    expect(p.animation).toBe('meteor');
    expect(p.speed).toBe(200);
    expect(p.direction).toBe('reverse');
    expect(p.size).toBe(4);
    expect(p.brightness).toBe(255);
  });
});

describe('pixelRgbAt', () => {
  it('is deterministic — same inputs, same output', () => {
    for (const fx of PIXEL_EFFECTS) {
      const p = { ...base, animation: fx.id };
      expect(pixelRgbAt(p, 7, 35, 1234)).toEqual(pixelRgbAt(p, 7, 35, 1234));
    }
  });

  it('stays within 0..255 for every effect over time', () => {
    for (const fx of PIXEL_EFFECTS) {
      const p = { ...base, animation: fx.id, color2: '#102040' };
      for (let t = 0; t < 6000; t += 137) {
        const [r, g, b] = pixelRgbAt(p, t % 35, 35, t);
        for (const c of [r, g, b]) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('solid shows the primary; off is black; brightness scales', () => {
    expect(pixelRgbAt(base, 0, 10, 0)).toEqual([255, 0, 0]);
    expect(pixelRgbAt({ ...base, animation: 'off' }, 0, 10, 0)).toEqual([0, 0, 0]);
    const [r] = pixelRgbAt({ ...base, brightness: 128 }, 0, 10, 0);
    expect(r).toBeCloseTo(128, 0);
  });

  it('chase paints the head in primary and the far background in color2', () => {
    const p = { ...base, animation: 'chase', color2: '#000040', size: 2, trail: 2 };
    // t=0 → head at LED 0.
    expect(pixelRgbAt(p, 0, 30, 0)).toEqual([255, 0, 0]);
    // Far from the head: background.
    const [r, g, b] = pixelRgbAt(p, 15, 30, 0);
    expect([r | 0, g | 0, b | 0]).toEqual([0, 0, 64]);
  });

  it('direction=reverse mirrors the strip coordinate', () => {
    const fwd = { ...base, animation: 'chase', size: 1, trail: 0 };
    const rev = { ...fwd, direction: 'reverse' as const };
    expect(pixelRgbAt(fwd, 0, 30, 0)).toEqual(pixelRgbAt(rev, 29, 30, 0));
  });

  it('rainbow varies hue along the strip and ignores the primary color', () => {
    const p = { ...base, animation: 'rainbow' };
    const a = pixelRgbAt(p, 0, 30, 0);
    const c = pixelRgbAt(p, 10, 30, 0);
    expect(a).not.toEqual(c);
  });

  it('twinkle density 0 leaves only the dimmed background', () => {
    const p = { ...base, animation: 'twinkle', density: 0, color2: '#404040' };
    for (let i = 0; i < 20; i++) {
      const [r, g, b] = pixelRgbAt(p, i, 20, 500);
      expect(r).toBeLessThan(60);
      expect(g).toBeLessThan(60);
      expect(b).toBeLessThan(60);
    }
  });
});
