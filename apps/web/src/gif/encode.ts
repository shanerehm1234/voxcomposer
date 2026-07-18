/**
 * A minimal GIF89a encoder for the eye-GIF optimizer: takes indexed frames + a
 * shared palette and writes a looping animated GIF. Dependency-free companion to
 * decode.ts / quantize.ts. Full frames, disposal=1, one global colour table.
 */

export interface EncodeFrame {
  /** width*height palette indices. */
  indices: Uint8Array;
  delayMs: number;
}

interface ByteSink {
  bytes: number[];
  push(b: number): void;
  push16(v: number): void;
}

function sink(): ByteSink {
  const bytes: number[] = [];
  return {
    bytes,
    push: (b) => bytes.push(b & 0xff),
    push16: (v) => { bytes.push(v & 0xff); bytes.push((v >> 8) & 0xff); },
  };
}

/** LZW-compress index data (GIF variant) and emit it as sub-blocks into `out`. */
function lzwCompress(out: ByteSink, indices: Uint8Array, minCodeSize: number): void {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let codeSize = minCodeSize + 1;
  let dict = new Map<string, number>();
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clear; i++) dict.set(String.fromCharCode(i), i);
  };
  resetDict();
  let next = end + 1;

  // Bit accumulator → 255-byte sub-blocks.
  let acc = 0, accBits = 0;
  const block: number[] = [];
  const flushBlock = () => {
    if (block.length === 0) return;
    out.push(block.length);
    for (const b of block) out.push(b);
    block.length = 0;
  };
  const writeCode = (code: number) => {
    acc |= code << accBits; accBits += codeSize;
    while (accBits >= 8) {
      block.push(acc & 0xff); acc >>= 8; accBits -= 8;
      if (block.length === 255) flushBlock();
    }
  };

  out.push(minCodeSize);
  writeCode(clear);

  let w = String.fromCharCode(indices[0]!);
  for (let i = 1; i < indices.length; i++) {
    const c = String.fromCharCode(indices[i]!);
    const wc = w + c;
    if (dict.has(wc)) {
      w = wc;
    } else {
      writeCode(dict.get(w)!);
      dict.set(wc, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
      if (next >= 4096) { writeCode(clear); resetDict(); next = end + 1; codeSize = minCodeSize + 1; }
      w = c;
    }
  }
  writeCode(dict.get(w)!);
  writeCode(end);
  if (accBits > 0) { block.push(acc & 0xff); acc = 0; accBits = 0; if (block.length === 255) flushBlock(); }
  flushBlock();
  out.push(0); // block terminator
}

export function encodeGif(opts: {
  width: number;
  height: number;
  palette: Uint8Array; // colors*3
  frames: EncodeFrame[];
  loop?: number; // 0 = forever (default)
}): Uint8Array<ArrayBuffer> {
  const { width, height, palette, frames } = opts;
  const loop = opts.loop ?? 0;
  const colors = palette.length / 3;

  // Round the palette up to a power of two (2..256); GIF needs that.
  let bits = 1;
  while (1 << bits < colors) bits++;
  bits = Math.max(1, Math.min(8, bits));
  const gctSize = 1 << bits;

  const out = sink();
  // Header + logical screen descriptor.
  for (const ch of 'GIF89a') out.push(ch.charCodeAt(0));
  out.push16(width); out.push16(height);
  out.push(0x80 | ((bits - 1) << 4) | (bits - 1)); // GCT present, colour res, GCT size
  out.push(0); // background colour index
  out.push(0); // aspect ratio
  // Global colour table (padded).
  for (let i = 0; i < gctSize; i++) {
    out.push(i < colors ? palette[i * 3]! : 0);
    out.push(i < colors ? palette[i * 3 + 1]! : 0);
    out.push(i < colors ? palette[i * 3 + 2]! : 0);
  }
  // NETSCAPE looping extension.
  out.push(0x21); out.push(0xff); out.push(11);
  for (const ch of 'NETSCAPE2.0') out.push(ch.charCodeAt(0));
  out.push(3); out.push(1); out.push16(loop); out.push(0);

  const minCodeSize = Math.max(2, bits);
  for (const f of frames) {
    // Graphic control extension (delay + disposal=1, no transparency).
    out.push(0x21); out.push(0xf9); out.push(4);
    out.push(0x04); // disposal = 1 (do not dispose)
    out.push16(Math.round(f.delayMs / 10)); // GIF delays are 1/100 s
    out.push(0); out.push(0);
    // Image descriptor (full frame, no local colour table).
    out.push(0x2c); out.push16(0); out.push16(0); out.push16(width); out.push16(height); out.push(0);
    lzwCompress(out, f.indices, minCodeSize);
  }
  out.push(0x3b); // trailer

  return new Uint8Array(out.bytes);
}
