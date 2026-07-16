import { describe, expect, it } from 'vitest';
import { encodeOsc } from '../osc.js';

const hex = (b: Uint8Array) => [...b].map((n) => n.toString(16).padStart(2, '0')).join(' ');

describe('encodeOsc', () => {
  it('encodes an address with no args (4-byte aligned, NUL-terminated)', () => {
    // "/a" -> 2f 61 00 00 ; "," -> 2c 00 00 00
    expect(hex(encodeOsc('/a', []))).toBe('2f 61 00 00 2c 00 00 00');
  });

  it('encodes an int32 arg big-endian with an ",i" tag', () => {
    // addr "/a" | tags ",i" | int32 1
    expect(hex(encodeOsc('/a', [1]))).toBe('2f 61 00 00 2c 69 00 00 00 00 00 01');
  });

  it('encodes a float32 arg for a non-integer number', () => {
    const b = encodeOsc('/x', [1.0]);
    // 1.0 is integer -> 'i', so use a fractional value to force 'f'
    const f = encodeOsc('/x', [0.5]);
    expect(hex(b).includes('69')).toBe(true); // ',i'
    // 0.5 float32 big-endian = 3f 00 00 00
    expect(hex(f).endsWith('3f 00 00 00')).toBe(true);
    expect(hex(f).includes('66')).toBe(true); // ',f'
  });

  it('encodes a string arg (padded) and boolean tags (no data bytes)', () => {
    const b = encodeOsc('/m', ['hi', true, false]);
    // tags ",sTF" ; string "hi" -> 68 69 00 00
    expect(hex(b)).toContain('2c 73 54 46'); // ,sTF
    expect(hex(b)).toContain('68 69 00 00'); // "hi"\0\0
    // T and F contribute NO argument data — only the "hi" string block after tags.
    // tags ",sTF" is 4 chars -> needs a NUL -> padded to 8 bytes.
    expect(b.length).toBe(4 /*addr*/ + 8 /*tags ,sTF\0…*/ + 4 /*"hi"*/);
  });
});
