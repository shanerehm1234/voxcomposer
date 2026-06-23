import { useEffect, useRef } from 'react';

interface PixelPreviewProps {
  animation: string;
  color: string; // #rrggbb
  brightness?: number; // 0..255
  /** Number of LEDs to draw. */
  count?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length !== 6) return [255, 106, 61];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * A live virtual approximation of a VoxPixel ring rendering the chosen effect +
 * colour, so the designer sees roughly what the remote will do. Drawn on a
 * small canvas with its own rAF loop (independent of the timeline).
 */
export function PixelPreview({ animation, color, brightness = 255, count = 16 }: PixelPreviewProps) {
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

    const [r, g, b] = hexToRgb(color);
    const bScale = Math.max(0, Math.min(255, brightness)) / 255;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 7;
    const dotR = Math.max(2.5, (2 * Math.PI * radius) / count / 2 - 1);
    let raf = 0;
    const start = performance.now();

    const factorFor = (i: number, t: number): number => {
      switch (animation) {
        case 'off':
          return 0.04;
        case 'pulse':
          return 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 4));
        case 'glow':
          return 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * 1.6));
        case 'flash':
          return Math.sin(t * 9) > 0 ? 1 : 0.05;
        case 'chase': {
          const head = (t * 1.4) % 1; // 0..1 around the ring
          const pos = i / count;
          let d = Math.abs(pos - head);
          d = Math.min(d, 1 - d); // wrap
          return Math.max(0.06, 1 - d * count * 0.6);
        }
        case 'solid':
        default:
          return 1;
      }
    };

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * radius;
        const y = cy + Math.sin(a) * radius;
        const f = factorFor(i, t) * bScale;
        // Dark base dot.
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill();
        // Lit dot + glow.
        if (f > 0.05) {
          ctx.save();
          ctx.shadowColor = `rgba(${r},${g},${b},${0.7 * f})`;
          ctx.shadowBlur = 8 * f;
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${f})`;
          ctx.fill();
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [animation, color, brightness, count]);

  return <canvas ref={ref} className="block w-full" style={{ height: 84 }} />;
}
