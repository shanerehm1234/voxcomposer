import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeGif } from '../decode.js';
import { encodeGif } from '../encode.js';
import { quantizeFrames } from '../quantize.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = new Uint8Array(readFileSync(join(here, 'fixtures/sample.gif')));

describe('gif decode', () => {
  it('reads dimensions, frame count, and per-frame delays', () => {
    const g = decodeGif(sample);
    expect(g.width).toBe(48);
    expect(g.height).toBe(48);
    expect(g.frames.length).toBe(4);
    expect(g.loop).toBe(0); // looping GIF
    expect(g.frames.map((f) => f.delayMs)).toEqual([80, 120, 100, 90]);
    // Every pixel is opaque RGBA.
    expect(g.frames[0]!.data.length).toBe(48 * 48 * 4);
    expect(g.frames[0]!.data[3]).toBe(255);
  });
});

describe('gif encode → decode round-trip', () => {
  it('re-encodes to a valid GIF that decodes back with the same shape + close colours', () => {
    const src = decodeGif(sample);
    const q = quantizeFrames(src.frames.map((f) => f.data), src.width, src.height, 64);
    const bytes = encodeGif({
      width: src.width,
      height: src.height,
      palette: q.palette,
      frames: q.indices.map((indices, i) => ({ indices, delayMs: src.frames[i]!.delayMs })),
      loop: 0,
    });

    // It must be a real GIF89a...
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
    // ...that our own decoder reads back identically in shape.
    const back = decodeGif(bytes);
    expect(back.width).toBe(48);
    expect(back.height).toBe(48);
    expect(back.frames.length).toBe(4);
    expect(back.loop).toBe(0);
    expect(back.frames.map((f) => f.delayMs)).toEqual([80, 120, 100, 90]);

    // Colours survive the quantize round-trip closely (simple flat shapes).
    let err = 0;
    const a = src.frames[0]!.data, b = back.frames[0]!.data;
    for (let i = 0; i < a.length; i++) err += Math.abs(a[i]! - b[i]!);
    const meanErr = err / a.length;
    expect(meanErr).toBeLessThan(6);

    // Write it out so the OcularVox C++ decoder can be cross-checked on it.
    try {
      writeFileSync('/tmp/claude-composer-encoded.gif', bytes);
    } catch {
      /* best-effort; not needed for the assertions */
    }
  });
});
