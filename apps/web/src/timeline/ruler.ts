import type { Viewport } from './viewport.js';
import { xToMs } from './viewport.js';

/** Candidate tick intervals in ms — a 1/2/5 progression across many scales. */
const NICE_INTERVALS_MS = [
  10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000,
  600_000,
];

/**
 * Pick a major tick interval (ms) so that ticks are at least `minPx` apart at
 * the current zoom. Keeps the ruler legible from 1s/div to 60s/div.
 */
export function chooseTickIntervalMs(vp: Viewport, minPx = 80): number {
  for (const interval of NICE_INTERVALS_MS) {
    if (interval * vp.pxPerMs >= minPx) return interval;
  }
  return NICE_INTERVALS_MS[NICE_INTERVALS_MS.length - 1]!;
}

export interface RulerTick {
  ms: number;
  /** x within the content area. */
  x: number;
  label: string;
}

/**
 * Generate the visible major ticks for the ruler/grid given the content width.
 */
export function visibleTicks(vp: Viewport, contentWidthPx: number): RulerTick[] {
  const interval = chooseTickIntervalMs(vp);
  const startMs = Math.floor(vp.scrollMs / interval) * interval;
  const endMs = xToMs(vp, contentWidthPx);
  const ticks: RulerTick[] = [];
  for (let ms = startMs; ms <= endMs; ms += interval) {
    if (ms < 0) continue;
    ticks.push({ ms, x: (ms - vp.scrollMs) * vp.pxPerMs, label: formatTimecode(ms, interval) });
  }
  return ticks;
}

/**
 * Format a timestamp as MM:SS or MM:SS.mmm. Millisecond precision is shown only
 * when the tick interval is sub-second, to avoid noise when zoomed out.
 */
export function formatTimecode(ms: number, intervalMs = 1000): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (intervalMs >= 1000) return `${mm}:${ss}`;
  const millis = Math.round(ms % 1000);
  return `${mm}:${ss}.${String(millis).padStart(3, '0')}`;
}
