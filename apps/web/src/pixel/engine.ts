/**
 * The built-in pixel effect engine — resolves every LED's color for any
 * effect at any moment. Pure and deterministic: the same (params, index,
 * count, timeMs) always yields the same color, so scrubbing the timeline is
 * repeatable and the VoxPixel firmware can reproduce previews exactly (this
 * file is the reference implementation for the remote's port).
 *
 * Speed semantics: 128 ≈ the "designed" tempo of each effect; 0 is ~5× slower,
 * 255 ~3× faster (exponential feel, no dead stop).
 */

export interface PixelParams {
  animation: string;
  color: string;
  /** Background/secondary; undefined = off/black. */
  color2?: string | undefined;
  brightness: number; // 0..255
  speed: number; // 0..255
  size: number; // px
  trail: number; // px
  density: number; // 0..255
  direction: 'forward' | 'reverse';
}

export type Rgb = [number, number, number];

/** Read engine params out of a pixel clip's data, applying defaults. */
export function paramsFromClipData(data: Record<string, unknown>): PixelParams {
  const num = (k: string, d: number) => (typeof data[k] === 'number' ? (data[k] as number) : d);
  const str = (k: string, d: string) => (typeof data[k] === 'string' ? (data[k] as string) : d);
  return {
    animation: str('animation', 'solid'),
    color: str('color', '#FF6A00'),
    color2: typeof data.color2 === 'string' ? (data.color2 as string) : undefined,
    brightness: num('brightness', 255),
    speed: num('speed', 128),
    size: Math.max(1, num('size', 4)),
    trail: Math.max(0, num('trail', 8)),
    density: num('density', 64),
    direction: data.direction === 'reverse' ? 'reverse' : 'forward',
  };
}

// --- small pure helpers --------------------------------------------------------

export function hexToRgbTuple(hex: string): Rgb {
  const h = hex.replace('#', '');
  if (h.length !== 6) return [255, 106, 61];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function scale(c: Rgb, k: number): Rgb {
  const s = Math.max(0, Math.min(1, k));
  return [c[0] * s, c[1] * s, c[2] * s];
}

/** Deterministic hash → 0..1. The engine's only "randomness". */
export function hash01(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Effect tempo multiplier from the 0..255 speed param (128 → 1×). */
function tempo(speed: number): number {
  return Math.pow(2, (speed - 128) / 64); // 0 → 0.25×, 255 → ~4×
}

/** HSV (h 0..1) → RGB, for rainbow/random hues. */
export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] =
    i % 6 === 0 ? [v, t, p] : i % 6 === 1 ? [q, v, p] : i % 6 === 2 ? [p, v, t] : i % 6 === 3 ? [p, q, v] : i % 6 === 4 ? [t, p, v] : [v, p, q];
  return [r * 255, g * 255, b * 255];
}

// --- the engine -----------------------------------------------------------------

/**
 * Color of LED `index` (0-based along the run order) of `count` at `tMs`.
 * Returns the final displayed color (brightness applied, background blended).
 */
export function pixelRgbAt(p: PixelParams, index: number, count: number, tMs: number): Rgb {
  const primary = hexToRgbTuple(p.color);
  const bg = p.color2 ? hexToRgbTuple(p.color2) : BLACK;
  const t = tMs * tempo(p.speed);
  // Direction flips the strip's coordinate, not each effect's math.
  const i = p.direction === 'reverse' ? count - 1 - index : index;
  const bright = p.brightness / 255;

  let out: Rgb;
  switch (p.animation) {
    case 'off':
      return BLACK;
    case 'solid':
      out = primary;
      break;
    case 'flash':
      out = t % 600 < 300 ? primary : bg;
      break;
    case 'pulse':
      out = mix(bg, primary, 0.5 + 0.5 * Math.sin(t * 0.008));
      break;
    case 'glow':
      out = scale(primary, 0.55 + 0.45 * Math.sin(t * 0.004));
      break;
    case 'chase': {
      const head = Math.floor(t / 60) % count;
      const dist = (head - i + count) % count;
      if (dist < p.size) out = primary;
      else if (dist < p.size + p.trail) out = mix(primary, bg, (dist - p.size + 1) / (p.trail + 1));
      else out = bg;
      break;
    }
    case 'scanner': {
      // Larson: head bounces end to end; distance fades through the trail.
      const span = Math.max(1, count - 1);
      const phase = (t / 40) % (span * 2);
      const head = phase <= span ? phase : span * 2 - phase;
      const dist = Math.abs(i - head);
      if (dist < p.size / 2) out = primary;
      else if (dist < p.size / 2 + p.trail) out = mix(primary, bg, (dist - p.size / 2) / p.trail);
      else out = bg;
      break;
    }
    case 'wipe': {
      // Fill with primary, then fill with background, repeat.
      const cyc = (t / 40) % (count * 2);
      const fillingPrimary = cyc < count;
      const edge = fillingPrimary ? cyc : cyc - count;
      const filled = i <= edge;
      out = fillingPrimary ? (filled ? primary : bg) : filled ? bg : primary;
      break;
    }
    case 'meteor': {
      const head = Math.floor(t / 50) % (count + p.trail + p.size);
      const dist = head - i;
      if (dist >= 0 && dist < p.size) {
        out = mix(primary, WHITE, 0.55); // white-hot head
      } else if (dist >= p.size && dist < p.size + p.trail) {
        // Decaying tail with deterministic sparkle dropout.
        const k = 1 - (dist - p.size) / p.trail;
        const sparkle = hash01(i, Math.floor(t / 90)) < 0.35 ? 0.25 : 1;
        out = mix(bg, primary, k * k * sparkle);
      } else {
        out = bg;
      }
      break;
    }
    case 'twinkle': {
      // Each LED breathes up/down on its own schedule; density = how many.
      const cycle = 1400;
      const seed = hash01(i, Math.floor(t / cycle));
      const active = seed < p.density / 255;
      if (!active) {
        out = scale(bg, 0.6);
      } else {
        const phase = ((t % cycle) / cycle + hash01(i * 3, 7)) % 1;
        out = mix(scale(bg, 0.6), primary, Math.sin(phase * Math.PI));
      }
      break;
    }
    case 'sparkle': {
      // Short-lived glints (one 80ms frame) on the background.
      const frame = Math.floor(t / 80);
      const lit = hash01(i, frame) < p.density / 900;
      out = lit ? mix(primary, WHITE, 0.6) : scale(bg, 0.7);
      break;
    }
    case 'lightning': {
      // Clusters of 2-4 rapid full-strip flickers, then darkness. Density
      // sets how often a cluster strikes.
      const slot = 900; // ms per strike opportunity
      const n = Math.floor(t / slot);
      const strikes = hash01(11, n) < 0.25 + (p.density / 255) * 0.6;
      if (!strikes) {
        out = scale(bg, 0.4);
      } else {
        const within = t % slot;
        const flickers = 2 + Math.floor(hash01(3, n) * 3); // 2..4
        const fLen = 70;
        let lit = false;
        for (let f = 0; f < flickers; f++) {
          const startAt = f * fLen * 2 + hash01(f, n) * 60;
          if (within >= startAt && within < startAt + fLen) lit = true;
        }
        out = lit ? mix(primary, WHITE, 0.85) : scale(bg, 0.4);
      }
      break;
    }
    case 'rainbow': {
      const hue = ((i / count) * 1.0 + t * 0.00012) % 1;
      out = hsvToRgb(hue, 1, 1);
      break;
    }
    case 'random': {
      // Every LED cross-fades between deterministic random hues.
      const cycle = 2400;
      const n = Math.floor(t / cycle);
      const k = (t % cycle) / cycle;
      const h1 = hash01(i, n);
      const h2 = hash01(i, n + 1);
      out = mix(hsvToRgb(h1, 1, 1), hsvToRgb(h2, 1, 1), k * k * (3 - 2 * k));
      break;
    }
    default:
      out = primary;
      break;
  }
  return [out[0] * bright, out[1] * bright, out[2] * bright];
}

// --- inspector metadata -----------------------------------------------------------

export interface EffectDef {
  id: string;
  name: string;
  /** Which engine params this effect actually reads (drives the UI). */
  uses: { speed?: boolean; size?: boolean; trail?: boolean; density?: boolean; direction?: boolean; color2?: string };
}

export const PIXEL_EFFECTS: EffectDef[] = [
  { id: 'solid', name: 'Solid', uses: {} },
  { id: 'glow', name: 'Glow', uses: { speed: true } },
  { id: 'pulse', name: 'Pulse', uses: { speed: true, color2: 'Fade-to color' } },
  { id: 'flash', name: 'Flash', uses: { speed: true, color2: 'Alternate color' } },
  { id: 'chase', name: 'Chase', uses: { speed: true, size: true, trail: true, direction: true, color2: 'Background' } },
  { id: 'scanner', name: 'Scanner (bounce)', uses: { speed: true, size: true, trail: true, color2: 'Background' } },
  { id: 'wipe', name: 'Wipe', uses: { speed: true, direction: true, color2: 'Wipe-to color' } },
  { id: 'meteor', name: 'Meteor', uses: { speed: true, size: true, trail: true, direction: true } },
  { id: 'twinkle', name: 'Twinkle', uses: { speed: true, density: true, color2: 'Background' } },
  { id: 'sparkle', name: 'Sparkle', uses: { speed: true, density: true, color2: 'Background' } },
  { id: 'lightning', name: 'Lightning', uses: { density: true, color2: 'Ambient glow' } },
  { id: 'rainbow', name: 'Rainbow', uses: { speed: true, direction: true } },
  { id: 'random', name: 'Random fade', uses: { speed: true } },
  { id: 'off', name: 'Off (dark)', uses: {} },
];
