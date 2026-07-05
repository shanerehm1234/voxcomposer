/**
 * The Composer's working knowledge of WLED effects: the curated picker list
 * and a best-effort mapping of each effect onto our six preview primitives so
 * the virtual stage / inspector preview move like the real remote will.
 *
 * A pixel clip has ONE effect source: `wledFx` set means WLED mode (the
 * remote's WLED engine runs the effect; `animation` is ignored on-device),
 * absent means the basic `animation` field drives it. Previews follow the
 * same rule via `effectiveAnimation()` — never both at once.
 */

/** Curated WLED effects (ids are WLED's own, stable across releases). */
export const WLED_EFFECTS: [number, string][] = [
  [0, 'Solid'],
  [1, 'Blink'],
  [2, 'Breathe'],
  [3, 'Wipe'],
  [6, 'Sweep'],
  [8, 'Colorloop'],
  [9, 'Rainbow'],
  [10, 'Scan'],
  [12, 'Fade'],
  [13, 'Theater'],
  [20, 'Sparkle'],
  [23, 'Strobe'],
];

export const WLED_PALETTES: [number, string][] = [
  [0, 'Default'],
  [1, 'Random Cycle'],
  [2, 'Primary Color'],
  [3, 'Based on Primary'],
  [6, 'Party'],
  [7, 'Cloud'],
  [8, 'Lava'],
  [9, 'Ocean'],
  [10, 'Forest'],
  [11, 'Rainbow'],
];

/** Nearest preview primitive for a WLED effect id. */
const WLED_TO_PRIMITIVE: Record<number, string> = {
  0: 'solid',
  1: 'flash',
  2: 'pulse',
  3: 'chase',
  6: 'chase',
  8: 'glow',
  9: 'chase',
  10: 'chase',
  12: 'pulse',
  13: 'chase',
  20: 'flash',
  23: 'flash',
};

export function wledEffectName(fx: number): string {
  return WLED_EFFECTS.find(([id]) => id === fx)?.[1] ?? `FX #${fx}`;
}

/**
 * Resolve a pixel clip's single source of truth into what previews should
 * animate and what the label should say.
 */
export function effectiveAnimation(
  animation: string,
  wledFx: number | undefined,
): { animation: string; label: string } {
  if (typeof wledFx === 'number') {
    return { animation: WLED_TO_PRIMITIVE[wledFx] ?? 'glow', label: `WLED · ${wledEffectName(wledFx)}` };
  }
  return { animation, label: animation };
}
