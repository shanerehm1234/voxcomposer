/**
 * Median-cut colour quantization for the eye-GIF optimizer. Downscaled frames
 * have thousands of interpolated colours; a GIF needs <=256. We build ONE shared
 * palette across all frames (smaller output, no per-frame palette churn) and map
 * every pixel to it with a cached nearest-colour lookup.
 */

export interface Quantized {
  /** RGB triplets, `colors*3` bytes. */
  palette: Uint8Array;
  colors: number;
  /** One `width*height` index array per input frame. */
  indices: Uint8Array[];
}

interface Box {
  pixels: number[]; // packed 0xRRGGBB
  rMin: number; rMax: number; gMin: number; gMax: number; bMin: number; bMax: number;
}

function shrink(box: Box): void {
  box.rMin = box.gMin = box.bMin = 255;
  box.rMax = box.gMax = box.bMax = 0;
  for (const px of box.pixels) {
    const r = (px >> 16) & 0xff, g = (px >> 8) & 0xff, b = px & 0xff;
    if (r < box.rMin) box.rMin = r; if (r > box.rMax) box.rMax = r;
    if (g < box.gMin) box.gMin = g; if (g > box.gMax) box.gMax = g;
    if (b < box.bMin) box.bMin = b; if (b > box.bMax) box.bMax = b;
  }
}

/** Quantize RGBA frames to a shared palette of at most `maxColors` colours. */
export function quantizeFrames(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  maxColors = 256,
): Quantized {
  const pxCount = width * height;

  // Sample pixels across all frames (cap the work regardless of size/length).
  const sample: number[] = [];
  const target = 24000;
  const stride = Math.max(1, Math.floor((frames.length * pxCount) / target));
  let k = 0;
  for (const f of frames) {
    for (let i = 0; i < pxCount; i++, k++) {
      if (k % stride) continue;
      const o = i * 4;
      sample.push((f[o]! << 16) | (f[o + 1]! << 8) | f[o + 2]!);
    }
  }

  // Median-cut: split the box with the largest range along its longest axis.
  const first: Box = { pixels: sample, rMin: 0, rMax: 0, gMin: 0, gMax: 0, bMin: 0, bMax: 0 };
  shrink(first);
  const boxes: Box[] = [first];
  while (boxes.length < maxColors) {
    // pick the box with the largest single-channel range and >1 colour
    let bi = -1, best = 0;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i]!;
      if (bx.pixels.length < 2) continue;
      const range = Math.max(bx.rMax - bx.rMin, bx.gMax - bx.gMin, bx.bMax - bx.bMin);
      if (range > best) { best = range; bi = i; }
    }
    if (bi < 0) break;
    const box = boxes[bi]!;
    const rr = box.rMax - box.rMin, gr = box.gMax - box.gMin, br = box.bMax - box.bMin;
    const ch = rr >= gr && rr >= br ? 16 : gr >= br ? 8 : 0;
    box.pixels.sort((a, b) => ((a >> ch) & 0xff) - ((b >> ch) & 0xff));
    const mid = box.pixels.length >> 1;
    const lo: Box = { pixels: box.pixels.slice(0, mid), rMin: 0, rMax: 0, gMin: 0, gMax: 0, bMin: 0, bMax: 0 };
    const hi: Box = { pixels: box.pixels.slice(mid), rMin: 0, rMax: 0, gMin: 0, gMax: 0, bMin: 0, bMax: 0 };
    shrink(lo); shrink(hi);
    boxes.splice(bi, 1, lo, hi);
  }

  // Palette = average colour of each box.
  const colors = boxes.length;
  const palette = new Uint8Array(colors * 3);
  boxes.forEach((box, i) => {
    let r = 0, g = 0, b = 0;
    for (const px of box.pixels) { r += (px >> 16) & 0xff; g += (px >> 8) & 0xff; b += px & 0xff; }
    const n = Math.max(1, box.pixels.length);
    palette[i * 3] = Math.round(r / n); palette[i * 3 + 1] = Math.round(g / n); palette[i * 3 + 2] = Math.round(b / n);
  });

  // Nearest-colour mapping, cached by a 15-bit (5/channel) RGB key.
  const cache = new Int16Array(32768).fill(-1);
  const nearest = (r: number, g: number, b: number): number => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key]!;
    if (hit >= 0) return hit;
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < colors; i++) {
      const dr = r - palette[i * 3]!, dg = g - palette[i * 3 + 1]!, db = b - palette[i * 3 + 2]!;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; bestI = i; if (d === 0) break; }
    }
    cache[key] = bestI;
    return bestI;
  };

  const indices = frames.map((f) => {
    const out = new Uint8Array(pxCount);
    for (let i = 0; i < pxCount; i++) {
      const o = i * 4;
      out[i] = nearest(f[o]!, f[o + 1]!, f[o + 2]!);
    }
    return out;
  });

  return { palette, colors, indices };
}
