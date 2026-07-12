import { useEffect, useRef } from 'react';

interface EyePreviewProps {
  /** Eye glow color (hex). */
  color: string;
  /** Gaze direction, each -1..1 (from the look-pad). */
  lookX?: number;
  lookY?: number;
  /** Eye style / animation id (idle, flash, glow, blink, angry, ...). */
  animation?: string;
}

/** Parse #rgb / #rrggbb to [r,g,b]; falls back to a warm amber. */
function toRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [255, 106, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A live preview of the OcularVox eyes for the clip inspector — two glowing
 * irises tinted by the clip color that follow its gaze, with a light per-style
 * animation (pulse / blink / steady flash). Draws the same eyes the virtual
 * stage does, so the inspector and stage agree. Replaces the pixel-strip
 * preview that eyes clips used to (wrongly) borrow.
 */
export function EyePreview({ color, lookX = 0, lookY = 0, animation = 'idle' }: EyePreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Latest props for the persistent rAF loop, without restarting it each render.
  const propsRef = useRef({ color, lookX, lookY, animation });
  propsRef.current = { color, lookX, lookY, animation };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const { color: col, lookX: lx, lookY: ly, animation: anim } = propsRef.current;
      const [r, g, b] = toRgb(col);
      const t = now / 1000;

      // Per-style intensity 0..1 and a blink phase.
      let intensity = 0.85;
      if (anim === 'flash') intensity = 0.7 + 0.3 * (Math.sin(t * 9) > 0.6 ? 1 : 0.4);
      else if (anim === 'glow' || anim === 'pulse' || anim === 'breathe')
        intensity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.2));
      else intensity = 0.8 + 0.08 * Math.sin(t * 2); // gentle idle shimmer
      // Periodic blink (~ every 4s) for the calmer styles.
      const blinkStyle = anim !== 'flash';
      const blinkPhase = t % 4;
      const blink = blinkStyle && blinkPhase < 0.16 ? 1 - Math.abs(blinkPhase - 0.08) / 0.08 : 0;

      const cx = w / 2;
      const cy = h / 2;
      const gap = Math.min(w * 0.22, 46);
      const R = Math.min(h * 0.34, gap * 0.82, 30); // socket radius
      const angry = anim === 'angry' || anim === 'mad';

      for (const side of [-1, 1] as const) {
        const ex = cx + side * gap;
        const ey = cy;
        // Socket.
        ctx.beginPath();
        ctx.arc(ex, ey, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fill();

        // Iris/pupil, offset by gaze.
        const px = ex + lx * R * 0.4;
        const py = ey + ly * R * 0.4;
        const pr = R * 0.62;
        const a = intensity * (1 - blink);
        const grad = ctx.createRadialGradient(px, py, 1, px, py, pr);
        grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
        grad.addColorStop(0.55, `rgba(${r},${g},${b},${a * 0.85})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.save();
        ctx.shadowColor = `rgb(${r},${g},${b})`;
        ctx.shadowBlur = 16 * a;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // Eyelid: a blink sweep, and a permanent angry brow.
        const lid = Math.max(blink, angry ? 0.35 : 0);
        if (lid > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ex, ey, R + 1, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          if (angry && blink < 0.5) {
            // Angled top lid pointing toward the nose.
            ctx.beginPath();
            ctx.moveTo(ex - side * R, ey - R);
            ctx.lineTo(ex + side * R, ey - R + R * 0.9);
            ctx.lineTo(ex + side * R, ey - R);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(ex - R - 1, ey - R - 1, (R + 1) * 2, (R + 1) * 2 * lid);
          }
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="block h-24 w-full" aria-label="Eyes preview" />;
}
