import { useEffect, useRef } from 'react';
import { pixelRgbAt, type PixelParams } from '../pixel/engine.js';

interface PixelPreviewProps {
  /** Full effect-engine params (see pixel/engine.ts). */
  params: PixelParams;
  /** Number of LEDs to draw. */
  count?: number;
}

/**
 * A live virtual preview of the VoxPixel prop, driven by the shared effect
 * engine — the same code the virtual stage uses, so the two always agree.
 * Shape-agnostic: N LEDs wrapped into rows (ring, strip, or matrix — run
 * order is what matters). Runs its own rAF loop, independent of the playhead.
 */
export function PixelPreview({ params, count = 16 }: PixelPreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = Math.max(1, Math.min(count, 120));
    const usableW = w - 20;
    const perRow = Math.min(n, Math.floor(usableW / 9));
    const rows = Math.ceil(n / perRow);
    const dotR = rows > 2 ? 2.5 : 3.5;
    const rowGap = Math.min(13, (h - 12) / rows);
    const startY = h / 2 - ((rows - 1) * rowGap) / 2;
    let raf = 0;

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const spacing = perRow > 1 ? usableW / (perRow - 1) : 0;
        const x = 10 + col * spacing;
        const y = startY + row * rowGap;
        const [r, g, b] = pixelRgbAt(params, i, count, now);
        const lum = (r + g + b) / 765;
        ctx.save();
        if (lum > 0.35 && n <= 60) {
          ctx.shadowColor = `rgb(${r | 0},${g | 0},${b | 0})`;
          ctx.shadowBlur = 9 * lum;
        }
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = lum > 0.01 ? `rgb(${r | 0},${g | 0},${b | 0})` : 'rgba(255,255,255,0.06)';
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [params, count]);

  return <canvas ref={ref} className="block w-full" style={{ height: 84 }} />;
}
