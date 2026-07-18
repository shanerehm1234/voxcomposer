/**
 * A small, dependency-free animated-GIF decoder (GIF87a/89a) — a TypeScript
 * port of the OcularVox firmware's gif_decoder, so the Composer decodes GIFs
 * exactly the way the skull does. Used by the eye-GIF optimizer to pull frames
 * out of any GIF (from the internet, wherever) before downscaling + re-encoding.
 *
 * Native ImageDecoder isn't reliable across the Tauri webviews / Firefox, so we
 * decode ourselves. Composites in RGBA so per-frame local palettes and
 * cross-frame disposal stay correct.
 *
 * Supported: LZW, global + local color tables, transparency, disposal 0-3,
 * interlace, the NETSCAPE loop count.
 */

export interface GifFrame {
  /** RGBA pixels, width*height*4 (fully composited to this frame). */
  data: Uint8ClampedArray;
  /** How long this frame is shown, in milliseconds. */
  delayMs: number;
}

export interface DecodedGif {
  width: number;
  height: number;
  /** NETSCAPE loop count: 0 = forever, -1 = play once (no loop block). */
  loop: number;
  frames: GifFrame[];
}

export function decodeGif(bytes: Uint8Array): DecodedGif {
  let p = 0;
  const u8 = () => bytes[p++]!;
  const u16 = () => bytes[p++]! | (bytes[p++]! << 8);
  const skipSubBlocks = () => {
    let n: number;
    while ((n = u8()) > 0) p += n;
  };

  const sig = String.fromCharCode(...bytes.slice(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('not a GIF');
  p = 6;
  const width = u16();
  const height = u16();
  const packed = u8();
  const bgIndex = u8();
  u8(); // aspect ratio

  let gct: Uint8Array | null = null;
  if (packed & 0x80) {
    const size = 1 << ((packed & 0x07) + 1);
    gct = bytes.subarray(p, p + size * 3);
    p += size * 3;
  }
  const bg: [number, number, number] =
    gct && bgIndex * 3 + 2 < gct.length ? [gct[bgIndex * 3]!, gct[bgIndex * 3 + 1]!, gct[bgIndex * 3 + 2]!] : [0, 0, 0];

  // Persistent RGBA canvas, plus a backup for disposal-mode-3.
  const canvas = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    canvas[i * 4] = bg[0]; canvas[i * 4 + 1] = bg[1]; canvas[i * 4 + 2] = bg[2]; canvas[i * 4 + 3] = 255;
  }
  const backup = new Uint8ClampedArray(width * height * 4);

  const frames: GifFrame[] = [];
  let loop = -1;

  // The most recent Graphic Control Extension, consumed by the next image.
  let pendingGce = { disposal: 0, delay: 0, transparent: -1 };

  // Disposal owed by the previous frame, applied before the next is drawn.
  let prevDisposal = 0, prevX = 0, prevY = 0, prevW = 0, prevH = 0;
  let havePrev = false;

  for (;;) {
    const intro = u8();
    if (intro === 0x3b || p >= bytes.length) break; // trailer / EOF

    if (intro === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        u8(); // block size (4)
        const gcePacked = u8();
        const delay = u16();
        const transparent = u8();
        u8(); // terminator
        pendingGce = { disposal: (gcePacked >> 2) & 0x07, delay, transparent: gcePacked & 1 ? transparent : -1 };
      } else if (label === 0xff) {
        const n = u8();
        const app = String.fromCharCode(...bytes.slice(p, p + n));
        p += n;
        if (app === 'NETSCAPE2.0') {
          const sub = u8();
          if (sub >= 3) { u8(); loop = u16(); for (let i = 3; i < sub; i++) u8(); }
          skipSubBlocks();
        } else {
          skipSubBlocks();
        }
      } else {
        skipSubBlocks();
      }
      continue;
    }
    if (intro !== 0x2c) throw new Error(`bad block 0x${intro.toString(16)}`);

    // Apply the previous frame's disposal now.
    if (havePrev) {
      if (prevDisposal === 2) {
        for (let y = 0; y < prevH && prevY + y < height; y++)
          for (let x = 0; x < prevW && prevX + x < width; x++) {
            const i = ((prevY + y) * width + prevX + x) * 4;
            canvas[i] = bg[0]; canvas[i + 1] = bg[1]; canvas[i + 2] = bg[2]; canvas[i + 3] = 255;
          }
      } else if (prevDisposal === 3) {
        canvas.set(backup);
      }
    }

    // Image descriptor.
    const left = u16(), top = u16(), fw = u16(), fh = u16();
    const ipacked = u8();
    let table = gct;
    if (ipacked & 0x80) {
      const size = 1 << ((ipacked & 0x07) + 1);
      table = bytes.subarray(p, p + size * 3);
      p += size * 3;
    }
    const interlace = (ipacked & 0x40) !== 0;
    const gce = pendingGce;
    pendingGce = { disposal: 0, delay: 0, transparent: -1 };

    if (gce.disposal === 3) backup.set(canvas);

    // --- LZW decode into the RGBA canvas ---
    const minCode = u8();
    const clear = 1 << minCode;
    const end = clear + 1;
    let codeSize = minCode + 1;
    let next = end + 1;
    const prefix = new Int32Array(4096);
    const suffix = new Uint8Array(4096);
    const stack = new Uint8Array(4096);
    let prev = -1, prevFirst = 0;

    // Bit reader over LZW sub-blocks.
    let blockLen = 0, blockPos = 0, acc = 0, accBits = 0, done = false;
    let blockStart = 0;
    const nextByte = (): number => {
      if (blockPos >= blockLen) {
        if (done) return -1;
        const n = u8();
        if (n === 0) { done = true; return -1; }
        blockStart = p; blockLen = n; blockPos = 0; p += n;
      }
      return bytes[blockStart + blockPos++]!;
    };
    const getCode = (): number => {
      while (accBits < codeSize) {
        const b = nextByte();
        if (b < 0) return -1;
        acc |= b << accBits; accBits += 8;
      }
      const c = acc & ((1 << codeSize) - 1);
      acc >>= codeSize; accBits -= codeSize;
      return c;
    };

    let outX = 0, outRow = 0, iPass = 0;
    const iStart = [0, 4, 2, 1], iStep = [8, 8, 4, 2];
    let fy = interlace ? iStart[0]! : 0;
    const put = (index: number) => {
      if (outRow < fh) {
        const cx = left + outX, cy = top + fy;
        if (cx < width && cy < height && !(gce.transparent >= 0 && index === gce.transparent) && table) {
          const di = (cy * width + cx) * 4;
          canvas[di] = table[index * 3]!; canvas[di + 1] = table[index * 3 + 1]!; canvas[di + 2] = table[index * 3 + 2]!; canvas[di + 3] = 255;
        }
      }
      if (++outX >= fw) {
        outX = 0; outRow++;
        if (interlace) { fy += iStep[iPass]!; while (fy >= fh && iPass < 3) { iPass++; fy = iStart[iPass]!; } }
        else fy++;
      }
    };

    for (;;) {
      const code = getCode();
      if (code < 0 || code === end) break;
      if (code === clear) { codeSize = minCode + 1; next = end + 1; prev = -1; continue; }
      if (code > next) break;
      let sp = 0, cur: number;
      if (code === next) { stack[sp++] = prevFirst; cur = prev; } else cur = code;
      while (cur >= clear) { stack[sp++] = suffix[cur]!; cur = prefix[cur]!; }
      const first = cur; stack[sp++] = first;
      while (sp > 0) put(stack[--sp]!);
      if (prev >= 0 && next < 4096) {
        prefix[next] = prev; suffix[next] = first; next++;
        if (next === (1 << codeSize) && codeSize < 12) codeSize++;
      }
      prev = code; prevFirst = first;
    }
    if (!done) skipSubBlocks();

    frames.push({ data: canvas.slice(), delayMs: gce.delay * 10 });
    prevDisposal = gce.disposal; prevX = left; prevY = top; prevW = fw; prevH = fh; havePrev = true;
  }

  return { width, height, loop, frames };
}
