import { describe, expect, it } from 'vitest';
import { clampZoom, msToX, panByPx, xToMs, ZOOM, zoomAt, type Viewport } from '../viewport.js';

const vp: Viewport = { pxPerMs: 0.05, scrollMs: 1000 };

describe('viewport conversions', () => {
  it('round-trips ms -> x -> ms', () => {
    const ms = 5000;
    expect(xToMs(vp, msToX(vp, ms))).toBeCloseTo(ms, 6);
  });

  it('places scrollMs at x=0', () => {
    expect(msToX(vp, vp.scrollMs)).toBeCloseTo(0, 6);
  });
});

describe('zoomAt', () => {
  it('keeps the time under the anchor pixel fixed', () => {
    const anchorX = 240;
    const anchorMs = xToMs(vp, anchorX);
    const next = zoomAt(vp, anchorX, vp.pxPerMs * 2);
    expect(msToX(next, anchorMs)).toBeCloseTo(anchorX, 4);
  });

  it('clamps zoom to the configured range', () => {
    expect(clampZoom(999)).toBe(ZOOM.maxPxPerMs);
    expect(clampZoom(0)).toBe(ZOOM.minPxPerMs);
  });
});

describe('panByPx', () => {
  it('never scrolls before time 0', () => {
    const next = panByPx({ pxPerMs: 0.05, scrollMs: 100 }, -100000);
    expect(next.scrollMs).toBe(0);
  });
});
