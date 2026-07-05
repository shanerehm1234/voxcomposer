import { useEffect, useRef } from 'react';
import { getPeaks } from '../audio/registry.js';
import { PEAKS_PER_SEC } from '../audio/analyze.js';
import { readStageFrame } from './stageBus.js';
import { drawStage, STAGE_LAYOUT, stageContentWidth } from './renderStage.js';
import { resolveStageState, type JawSampler } from './stageState.js';

/**
 * The registry-backed jaw sampler: reads the decoded audio's normalised peak
 * envelope (the same data the waveform is drawn from) — a faithful stand-in
 * for the FFT the real skull runs on its own speaker feed. Peaks are averaged
 * over a short window and shaped slightly so consonants snap and silences
 * close the jaw. Returns null when the clip has no decoded audio (the
 * resolver then falls back to a synthetic flap).
 */
const registryJawSampler: JawSampler = (clipId, offsetMs) => {
  const peaks = getPeaks(clipId);
  if (!peaks || peaks.length === 0) return null;
  const center = Math.floor((offsetMs / 1000) * PEAKS_PER_SEC);
  let sum = 0;
  let n = 0;
  for (let i = center - 1; i <= center + 1; i++) {
    if (i >= 0 && i < peaks.length) {
      sum += peaks[i]!;
      n++;
    }
  }
  if (n === 0) return 0;
  const raw = sum / n;
  return Math.min(1, Math.pow(raw * 1.35, 1.25));
};

/**
 * The virtual stage: a live cartoon of every device in the show, driven by the
 * playhead. Owns its own canvas + rAF and reads the frame the Timeline
 * publishes to the stage bus — no React re-rendering at frame rate, matching
 * the Timeline's own architecture. Scrolls horizontally when the cast doesn't
 * fit; repaints only when the frame or viewport actually changed.
 */
export function StagePanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const scrollRef = useRef(0);
  const dirtyRef = useRef(true);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      sizeRef.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      dirtyRef.current = true;
    });
    ro.observe(wrap);

    let raf = 0;
    let lastShow: unknown = null;
    let lastAtMs = -1;
    const loop = () => {
      const frame = readStageFrame();
      if (frame) {
        // Repaint when the playhead or show changed, when a repaint was forced
        // (resize/scroll), or continuously during playback so time-phased
        // animations (chase, glow) keep moving.
        if (
          dirtyRef.current ||
          frame.playing ||
          frame.atMs !== lastAtMs ||
          frame.show !== lastShow
        ) {
          dirtyRef.current = false;
          lastShow = frame.show;
          lastAtMs = frame.atMs;
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) {
            const { width, height, dpr } = sizeRef.current;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const state = resolveStageState(frame.show, frame.atMs, registryJawSampler);
            const maxScroll = Math.max(0, stageContentWidth(state) - width);
            scrollRef.current = Math.min(scrollRef.current, maxScroll);
            drawStage(ctx, state, width, height, scrollRef.current);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative shrink-0 border-b border-border/70"
      style={{ height: STAGE_LAYOUT.height }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Virtual stage — a live preview of every device at the playhead"
        className="block touch-none select-none"
        onWheel={(e) => {
          // Wheel scrolls the cast horizontally (vertical wheels included, for
          // mice without a horizontal wheel).
          const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
          const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
          scrollRef.current = Math.max(0, scrollRef.current + (dx || dy));
          dirtyRef.current = true;
        }}
      />
      <span className="pointer-events-none absolute left-3 top-2 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
        Virtual Stage
      </span>
    </div>
  );
}
