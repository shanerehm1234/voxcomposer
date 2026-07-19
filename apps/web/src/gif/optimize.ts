/**
 * optimizeEyeGif — turn ANY GIF (dragged in from the internet, any size) into
 * one the OcularVox can play: decode every frame, scale to fit a <=240 square
 * (centered, letterboxed — the round LCD hides the corners anyway), cap the
 * frame count, and re-encode a compact looping GIF with a shared palette.
 *
 * decode/quantize/encode are pure + unit-tested; only the frame scaling here
 * uses a canvas, so this module is browser-only.
 */
import { decodeGif } from './decode.js';
import { encodeGif } from './encode.js';
import { quantizeFrames } from './quantize.js';

export const EYE_MAX_DIM = 232;
const MAX_FRAMES = 48; // keep files streamable off the skull's SD

export interface OptimizedGif {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  frames: number;
  /** True if anything actually changed (else the original was already fine). */
  changed: boolean;
}

export function optimizeEyeGif(input: Uint8Array): OptimizedGif {
  const gif = decodeGif(input);
  const { width: w, height: h } = gif;

  // Square target side: fit within EYE_MAX_DIM without upscaling small GIFs.
  const side = Math.min(EYE_MAX_DIM, Math.max(w, h));
  const scale = Math.min(side / w, side / h);
  const dw = Math.round(w * scale), dh = Math.round(h * scale);
  const ox = Math.floor((side - dw) / 2), oy = Math.floor((side - dh) / 2);

  // Drop frames evenly if there are too many.
  const src = gif.frames;
  const step = Math.ceil(src.length / MAX_FRAMES);
  const chosen = src.filter((_, i) => i % step === 0);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w; srcCanvas.height = h;
  const sctx = srcCanvas.getContext('2d')!;
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = side; dstCanvas.height = side;
  const dctx = dstCanvas.getContext('2d')!;
  dctx.imageSmoothingQuality = 'high';

  const scaledFrames: Uint8ClampedArray[] = [];
  const delays: number[] = [];
  const srcImage = sctx.createImageData(w, h);
  for (let i = 0; i < chosen.length; i++) {
    const f = chosen[i]!;
    srcImage.data.set(f.data);
    sctx.putImageData(srcImage, 0, 0);
    dctx.clearRect(0, 0, side, side);
    dctx.fillStyle = '#000';
    dctx.fillRect(0, 0, side, side);
    dctx.drawImage(srcCanvas, ox, oy, dw, dh);
    scaledFrames.push(dctx.getImageData(0, 0, side, side).data);
    // Merged frames inherit the summed delay so timing is preserved.
    delays.push(f.delayMs * step || 60);
  }

  const q = quantizeFrames(scaledFrames, side, side, 64);
  const bytes = encodeGif({
    width: side,
    height: side,
    palette: q.palette,
    frames: q.indices.map((indices, i) => ({ indices, delayMs: delays[i]! })),
    loop: 0,
  });

  const changed = side !== w || side !== h || chosen.length !== src.length || bytes.length < input.length;
  return { bytes, width: side, height: side, frames: chosen.length, changed };
}
