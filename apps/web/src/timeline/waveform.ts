/**
 * Mock waveform rendering for the demo. Real audio clips will replace this with
 * a min/max-per-pixel envelope computed from decoded PCM (Web Audio API) and
 * cached per zoom LOD — see the build plan. Until then we synthesize a stable,
 * good-looking envelope from a seed so each clip looks distinct and consistent.
 */

/** Deterministic PRNG so a given clip always draws the same waveform. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a real, centered, filled amplitude envelope from a normalised peak array
 * (0..1). Downsamples peaks to the available pixel columns by taking the max in
 * each column's source range, so it stays sharp at every zoom level.
 */
export function drawWaveformFromPeaks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  peaks: Float32Array,
  color: string,
): void {
  if (w < 4 || peaks.length === 0) return;
  const mid = y + h / 2;
  const maxAmp = h / 2 - 1;
  const step = 2; // px per drawn column
  const cols = Math.max(2, Math.floor(w / step));

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (let i = 0; i < cols; i++) {
    const s0 = Math.floor((i / cols) * peaks.length);
    const s1 = Math.max(s0 + 1, Math.floor(((i + 1) / cols) * peaks.length));
    let peak = 0;
    for (let s = s0; s < s1 && s < peaks.length; s++) if (peaks[s]! > peak) peak = peaks[s]!;
    const px = x + i * step;
    const a = Math.max(0.5, peak * maxAmp);
    if (i === 0) ctx.moveTo(px, mid - a);
    else ctx.lineTo(px, mid - a);
  }
  for (let i = cols - 1; i >= 0; i--) {
    const s0 = Math.floor((i / cols) * peaks.length);
    const s1 = Math.max(s0 + 1, Math.floor(((i + 1) / cols) * peaks.length));
    let peak = 0;
    for (let s = s0; s < s1 && s < peaks.length; s++) if (peaks[s]! > peak) peak = peaks[s]!;
    const px = x + i * step;
    const a = Math.max(0.5, peak * maxAmp);
    ctx.lineTo(px, mid + a);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Draw a centered, filled amplitude envelope inside the given rect. Mirrors the
 * envelope around the vertical centre, matching the look in the mockup.
 */
export function drawMockWaveform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  color: string,
): void {
  if (w < 8) return;
  const rand = mulberry32(seed);
  const mid = y + h / 2;
  const maxAmp = h / 2 - 2;
  const step = 3; // px between samples
  const cols = Math.max(2, Math.floor(w / step));

  // Build a smoothed amplitude series with a few loud "syllable" bursts.
  const amps: number[] = [];
  let env = 0.3;
  for (let i = 0; i < cols; i++) {
    const target = rand() < 0.12 ? 0.6 + rand() * 0.4 : 0.15 + rand() * 0.35;
    env += (target - env) * 0.4;
    amps.push(env);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  // Top half, left -> right.
  for (let i = 0; i < cols; i++) {
    const px = x + i * step;
    const a = amps[i]! * maxAmp;
    if (i === 0) ctx.moveTo(px, mid - a);
    else ctx.lineTo(px, mid - a);
  }
  // Bottom half, right -> left (mirror).
  for (let i = cols - 1; i >= 0; i--) {
    const px = x + i * step;
    const a = amps[i]! * maxAmp;
    ctx.lineTo(px, mid + a);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
