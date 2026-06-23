/**
 * The single source of truth for Vox Composer's colours.
 *
 * Both Tailwind (build-time, see tailwind.config.ts) and the Canvas timeline
 * renderer (runtime, which cannot read Tailwind classes) import from here, so
 * the palette can never drift between DOM and canvas.
 */
export const PALETTE = {
  bg: '#0F1117',
  bg2: '#141820',
  bg3: '#1a1f2e',
  purple: '#534AB7',
  purpleL: '#AFA9EC',
  purpleD: '#2D2560',
  teal: '#1D9E75',
  tealL: '#5DCAA5',
  text: '#E2E8F0',
  muted: '#718096',
  border: '#2D3748',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * Per-track-type colour treatment for the timeline, per the design brief:
 * audio = orange-red, DMX = green/teal, relay = amber, servo/neck = purple,
 * plugin = neutral. `fill` is the clip body, `accent` the edge/label.
 */
export const TRACK_COLORS: Record<string, { fill: string; accent: string }> = {
  audio: { fill: '#3a2218', accent: '#E8623D' },
  dmx: { fill: '#13322a', accent: PALETTE.teal },
  relay: { fill: '#3a2f12', accent: '#E0A92B' },
  servo: { fill: PALETTE.purpleD, accent: PALETTE.purpleL },
  neck: { fill: PALETTE.purpleD, accent: PALETTE.purpleL },
  pixel: { fill: '#2a2418', accent: '#FF8A3D' },
  eyes: { fill: '#241f3a', accent: PALETTE.purpleL },
  plugin: { fill: '#21262f', accent: PALETTE.muted },
};

export function trackColor(type: string): { fill: string; accent: string } {
  return TRACK_COLORS[type] ?? TRACK_COLORS.plugin!;
}

/** Convert a `#rrggbb` hex to an `rgba()` string at the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
