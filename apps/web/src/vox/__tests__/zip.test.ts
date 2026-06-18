import { describe, expect, it } from 'vitest';
import { createZip, crc32, readZip } from '../zip.js';

const enc = new TextEncoder();

describe('crc32', () => {
  it('matches the well-known CRC-32 of "hello world"', () => {
    expect(crc32(enc.encode('hello world'))).toBe(0x0d4a1185);
  });
  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('createZip', () => {
  it('produces a parseable archive with a valid EOCD and entries', async () => {
    const files = [
      { name: 'show.vox', data: enc.encode('{"hi":true}') },
      { name: 'audio/a.wav', data: new Uint8Array([1, 2, 3, 4, 5]) },
    ];
    const blob = createZip(files);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(buf.buffer);

    // Starts with a local file header.
    expect(dv.getUint32(0, true)).toBe(0x04034b50);

    // EOCD is the last 22 bytes; signature + entry count.
    const eocd = buf.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    expect(dv.getUint16(eocd + 10, true)).toBe(2); // total entries

    // Walk the central directory and round-trip each name + CRC.
    const cdOffset = dv.getUint32(eocd + 16, true);
    let p = cdOffset;
    const seen: { name: string; crc: number }[] = [];
    for (let i = 0; i < 2; i++) {
      expect(dv.getUint32(p, true)).toBe(0x02014b50);
      const crc = dv.getUint32(p + 16, true);
      const nameLen = dv.getUint16(p + 28, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
      seen.push({ name, crc });
      p += 46 + nameLen;
    }
    expect(seen.map((s) => s.name)).toEqual(['show.vox', 'audio/a.wav']);
    expect(seen[0]!.crc).toBe(crc32(files[0]!.data));
    expect(seen[1]!.crc).toBe(crc32(files[1]!.data));
  });

  it('round-trips through readZip with identical names and bytes', async () => {
    const files = [
      { name: 'haunt.vox', data: enc.encode('{"name":"Haunt","x":42}') },
      { name: 'audio/intro.wav', data: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]) },
    ];
    const out = await readZip(createZip(files));
    expect(out.map((e) => e.name)).toEqual(['haunt.vox', 'audio/intro.wav']);
    expect(new TextDecoder().decode(out[0]!.data)).toBe('{"name":"Haunt","x":42}');
    expect([...out[1]!.data]).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it('rejects a non-zip blob', async () => {
    await expect(readZip(new Blob([new Uint8Array([1, 2, 3])]))).rejects.toThrow(/ZIP/);
  });
});
