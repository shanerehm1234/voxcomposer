/**
 * The timeline viewport: the single owner of the millisecond <-> pixel mapping.
 *
 * Everything the renderer and interaction code draws is derived from a
 * Viewport, so zoom/scroll behaviour stays consistent and frame-accurate. Time
 * is always milliseconds; the canvas is always device pixels (DPR handled by
 * the component, not here).
 */
export interface Viewport {
  /** Horizontal scale. Higher = more zoomed in. */
  pxPerMs: number;
  /** The time, in ms, shown at the left edge of the track content area. */
  scrollMs: number;
}

/** Fixed pixel geometry of the timeline chrome. */
export const LAYOUT = {
  /** Width of the left track-header / label column. */
  trackHeaderWidth: 180,
  /** Height of the top time ruler. */
  rulerHeight: 32,
  /** Default per-track lane height. */
  trackHeight: 64,
  /** Vertical gap drawn between lanes. */
  trackGap: 1,
} as const;

/** Zoom limits, expressed as the brief's "seconds per division" feel. */
export const ZOOM = {
  /** Most zoomed-in: ~1s spans a wide area. */
  maxPxPerMs: 0.5,
  /** Most zoomed-out: ~60s/div. */
  minPxPerMs: 0.0015,
  /** Multiplicative step per zoom action. */
  factor: 1.25,
} as const;

export function clampZoom(pxPerMs: number): number {
  return Math.min(ZOOM.maxPxPerMs, Math.max(ZOOM.minPxPerMs, pxPerMs));
}

/** Convert a time (ms) to an x coordinate within the content area (0 = header edge). */
export function msToX(vp: Viewport, ms: number): number {
  return (ms - vp.scrollMs) * vp.pxPerMs;
}

/** Convert an x coordinate within the content area back to a time (ms). */
export function xToMs(vp: Viewport, x: number): number {
  return vp.scrollMs + x / vp.pxPerMs;
}

/** Width in px of a duration in ms at the current zoom. */
export function msToPx(vp: Viewport, durationMs: number): number {
  return durationMs * vp.pxPerMs;
}

/**
 * Zoom while keeping the time under `anchorX` (content-area pixels) pinned in
 * place — the natural "zoom toward cursor" behaviour.
 */
export function zoomAt(vp: Viewport, anchorX: number, nextPxPerMs: number): Viewport {
  const pxPerMs = clampZoom(nextPxPerMs);
  const anchorMs = xToMs(vp, anchorX);
  // Solve for scrollMs so that msToX(anchorMs) stays at anchorX.
  const scrollMs = anchorMs - anchorX / pxPerMs;
  return { pxPerMs, scrollMs: Math.max(0, scrollMs) };
}

/** Scroll by a pixel delta (e.g. wheel / drag), never past time 0. */
export function panByPx(vp: Viewport, deltaPx: number): Viewport {
  return { ...vp, scrollMs: Math.max(0, vp.scrollMs + deltaPx / vp.pxPerMs) };
}

/** Fit a duration (ms) into a content width (px), with a little padding. */
export function fitToWidth(durationMs: number, contentWidthPx: number): Viewport {
  if (durationMs <= 0 || contentWidthPx <= 0) {
    return { pxPerMs: 0.05, scrollMs: 0 };
  }
  const pxPerMs = clampZoom((contentWidthPx * 0.97) / durationMs);
  return { pxPerMs, scrollMs: 0 };
}
