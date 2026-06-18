import { useEffect, useRef } from 'react';
import { getPeaks } from '../audio/registry.js';
import { drawMockWaveform, drawWaveformFromPeaks, seedFromString } from '../timeline/waveform.js';

interface WaveformThumbProps {
  /** Seed/key — a clip id (real peaks if imported) or filename (synthesized). */
  seedKey: string;
  color: string;
  className?: string;
  height?: number;
}

/**
 * A small standalone waveform preview. Uses real decoded peaks when the key
 * matches an imported clip, otherwise a stable synthesized envelope — so the
 * media library always looks alive.
 */
export function WaveformThumb({ seedKey, color, className, height = 36 }: WaveformThumbProps) {
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
    ctx.clearRect(0, 0, w, h);
    const peaks = getPeaks(seedKey);
    if (peaks) drawWaveformFromPeaks(ctx, 0, 0, w, h, peaks, color);
    else drawMockWaveform(ctx, 0, 0, w, h, seedFromString(seedKey), color);
  }, [seedKey, color]);

  return <canvas ref={ref} className={className} style={{ width: '100%', height }} />;
}
