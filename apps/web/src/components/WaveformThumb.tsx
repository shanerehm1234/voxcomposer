import { useEffect, useRef } from 'react';
import { getPeaks } from '../audio/registry.js';
import { drawMockWaveform, drawWaveformFromPeaks, seedFromString } from '../timeline/waveform.js';

interface WaveformThumbProps {
  /** Explicit envelope (the media library stores one per file). Wins over seedKey. */
  peaks?: number[] | Float32Array;
  /** Seed/key — a clip id (real peaks if imported) or filename (synthesized). */
  seedKey?: string;
  color: string;
  className?: string;
  height?: number;
}

/**
 * A small standalone waveform preview. Draws explicit `peaks` when given
 * (real data), falls back to the audio registry via `seedKey`, then to a
 * stable synthesized envelope.
 */
export function WaveformThumb({ peaks, seedKey = '', color, className, height = 36 }: WaveformThumbProps) {
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
    const data = peaks
      ? peaks instanceof Float32Array
        ? peaks
        : Float32Array.from(peaks)
      : getPeaks(seedKey);
    if (data && data.length > 0) drawWaveformFromPeaks(ctx, 0, 0, w, h, data, color);
    else drawMockWaveform(ctx, 0, 0, w, h, seedFromString(seedKey), color);
  }, [peaks, seedKey, color]);

  return <canvas ref={ref} className={className} style={{ width: '100%', height }} />;
}
