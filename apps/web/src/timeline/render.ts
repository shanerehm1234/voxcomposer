import type { VoxClip, VoxShow, VoxTrack } from '@voxcomposer/shared';
import { hexToRgba, PALETTE, trackColor } from '../styles/palette.js';
import { visibleTicks } from './ruler.js';
import { LAYOUT, msToPx, msToX, type Viewport } from './viewport.js';
import { getPeaks } from '../audio/registry.js';
import { pluginRegistry } from '../plugins/registry.js';
import { drawMockWaveform, drawWaveformFromPeaks, seedFromString } from './waveform.js';

export interface RenderState {
  /** Logical (CSS) pixel size of the canvas. */
  width: number;
  height: number;
  viewport: Viewport;
  show: VoxShow;
  /** Current playhead position in ms. */
  playheadMs: number;
  /** Selected clip ids. */
  selection: ReadonlySet<string>;
  /** Optional loop region in ms; both ends required to draw. */
  loop?: { inMs: number; outMs: number } | null;
  /** Whether loop playback is armed (affects loop region styling). */
  loopEnabled?: boolean;
  /** Active rubber-band selection rect, in absolute canvas px. */
  marquee?: { x: number; y: number; w: number; h: number } | null;
}

/** Y (top) of a track lane, in CSS px, by row index. */
export function trackTop(index: number): number {
  return LAYOUT.rulerHeight + index * (LAYOUT.trackHeight + LAYOUT.trackGap);
}

/** Total content height for N tracks. */
export function tracksHeight(count: number): number {
  return count * (LAYOUT.trackHeight + LAYOUT.trackGap);
}

/** Find the track row index at a given y, or -1 if outside the lane area. */
export function trackIndexAtY(y: number, count: number): number {
  if (y < LAYOUT.rulerHeight) return -1;
  const idx = Math.floor((y - LAYOUT.rulerHeight) / (LAYOUT.trackHeight + LAYOUT.trackGap));
  return idx >= 0 && idx < count ? idx : -1;
}

export function drawTimeline(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { width, height, viewport, show } = s;
  const contentX = LAYOUT.trackHeaderWidth;
  const contentWidth = width - contentX;

  // Background.
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, width, height);

  // --- Content area (grid, lanes, clips), clipped so nothing bleeds under the
  // header column or ruler. ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(contentX, LAYOUT.rulerHeight, contentWidth, height - LAYOUT.rulerHeight);
  ctx.clip();
  ctx.translate(contentX, 0);

  drawLaneBackgrounds(ctx, show.tracks.length, contentWidth);
  drawLoopRegion(ctx, s, contentWidth, height);
  drawGrid(ctx, viewport, contentWidth, show.tracks.length);
  drawClips(ctx, s);

  ctx.restore();

  // --- Header column (track labels), drawn over content's left edge. ---
  drawTrackHeaders(ctx, show.tracks);

  // --- Ruler across the top. ---
  drawRuler(ctx, viewport, contentX, contentWidth);

  // --- Playhead, drawn last so it sits above everything. ---
  drawPlayhead(ctx, s, contentX, contentWidth, height);

  // --- Rubber-band marquee, above all. ---
  if (s.marquee) drawMarquee(ctx, s.marquee, contentX, contentWidth, height);
}

function drawMarquee(
  ctx: CanvasRenderingContext2D,
  m: { x: number; y: number; w: number; h: number },
  contentX: number,
  contentWidth: number,
  height: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(contentX, LAYOUT.rulerHeight, contentWidth, height - LAYOUT.rulerHeight);
  ctx.clip();
  const x = m.w < 0 ? m.x + m.w : m.x;
  const y = m.h < 0 ? m.y + m.h : m.y;
  const w = Math.abs(m.w);
  const h = Math.abs(m.h);
  ctx.fillStyle = hexToRgba(PALETTE.purpleL, 0.12);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = hexToRgba(PALETTE.purpleL, 0.8);
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.setLineDash([]);
  ctx.restore();
}

function drawLaneBackgrounds(ctx: CanvasRenderingContext2D, count: number, contentWidth: number) {
  for (let i = 0; i < count; i++) {
    const top = trackTop(i);
    // Faint alternating tint for legibility without harsh banding.
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.010)' : 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, top, contentWidth, LAYOUT.trackHeight);
    // Hairline divider beneath each lane.
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, top + LAYOUT.trackHeight, contentWidth, 1);
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  contentWidth: number,
  trackCount: number,
) {
  const bottom = trackTop(trackCount);
  ctx.lineWidth = 1;
  for (const tick of visibleTicks(vp, contentWidth)) {
    const x = Math.round(tick.x) + 0.5;
    // Major line a touch brighter, with a soft falloff feel via low alpha.
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.moveTo(x, LAYOUT.rulerHeight);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
}

function drawClips(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { show, viewport, selection } = s;
  show.tracks.forEach((track, row) => {
    const top = trackTop(row);
    // Plugin tracks use the owning plugin's brand colour, if registered.
    const plugin = pluginRegistry.forTrackType(track.type);
    const colors = trackColor(track.type);
    const accent = plugin?.color ?? colors.accent;

    // Gentle hint on empty lanes (approachable onboarding).
    if (track.clips.length === 0) {
      ctx.fillStyle = 'rgba(113, 128, 150, 0.45)';
      ctx.font = 'italic 12px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const hint =
        track.type === 'audio' ? 'Drop an audio file here…' : 'Double-click to add a clip…';
      ctx.fillText(hint, 12, top + LAYOUT.trackHeight / 2);
    }

    for (const clip of track.clips) {
      const x = msToX(viewport, clip.startMs);
      const w = Math.max(2, msToPx(viewport, clip.durationMs));
      const y = top + 7;
      const h = LAYOUT.trackHeight - 14;
      const r = 7;
      const selected = selection.has(clip.id);

      ctx.save();
      if (selected) {
        ctx.shadowColor = hexToRgba(accent, 0.55);
        ctx.shadowBlur = 16;
      }

      // Body: vertical gradient from a brighter tint down to a deep base.
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, hexToRgba(accent, selected ? 0.42 : 0.3));
      grad.addColorStop(1, hexToRgba(accent, selected ? 0.2 : 0.13));
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.restore();

      // Waveform envelope for audio clips: real peaks once decoded, else a
      // synthesized placeholder (e.g. demo clips with no imported file).
      if (track.type === 'audio') {
        const peaks = getPeaks(clip.id);
        if (peaks) {
          drawWaveformFromPeaks(ctx, x + 6, y + 5, w - 12, h - 10, peaks, accent);
        } else {
          drawMockWaveform(ctx, x + 6, y + 5, w - 12, h - 10, seedFromString(clip.id), accent);
        }
        drawFades(ctx, clip, viewport, x, y, w, h);
      }

      // Inner top highlight for a glassy edge.
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + r, y + 1);
      ctx.lineTo(x + w - r, y + 1);
      ctx.stroke();

      // Left accent bar.
      ctx.fillStyle = accent;
      roundRectLeft(ctx, x, y, Math.min(3, w), h, r);
      ctx.fill();

      // Border.
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.strokeStyle = selected ? hexToRgba(accent, 0.95) : hexToRgba(accent, 0.45);
      roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
      ctx.stroke();

      // Label (clipped to clip width).
      if (w > 26) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 8, y, w - 14, h);
        ctx.clip();
        ctx.fillStyle = PALETTE.text;
        ctx.font = '500 11px Inter, system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 2;
        const label = plugin?.summarizeClip?.(clip) ?? clipLabel(clip.type, clip.data);
        ctx.fillText(label, x + 9, y + 6);
        ctx.restore();
      }
    }
  });
}

/** Draw fade-in / fade-out ramps on an audio clip. */
function drawFades(
  ctx: CanvasRenderingContext2D,
  clip: VoxClip,
  vp: Viewport,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const data = clip.data as Record<string, unknown>;
  const fadeInMs = Number(data.fadeInMs ?? 0);
  const fadeOutMs = Number(data.fadeOutMs ?? 0);
  if (fadeInMs <= 0 && fadeOutMs <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.lineWidth = 1;

  if (fadeInMs > 0) {
    const fw = Math.min(w, msToPx(vp, fadeInMs));
    ctx.fillStyle = 'rgba(15,17,23,0.5)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + fw, y);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + fw, y);
    ctx.stroke();
  }
  if (fadeOutMs > 0) {
    const fw = Math.min(w, msToPx(vp, fadeOutMs));
    ctx.fillStyle = 'rgba(15,17,23,0.5)';
    ctx.beginPath();
    ctx.moveTo(x + w - fw, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(x + w - fw, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLoopRegion(
  ctx: CanvasRenderingContext2D,
  s: RenderState,
  _contentWidth: number,
  height: number,
) {
  if (!s.loop) return;
  const x1 = msToX(s.viewport, s.loop.inMs);
  const x2 = msToX(s.viewport, s.loop.outMs);
  const enabled = s.loopEnabled ?? false;
  ctx.fillStyle = hexToRgba(PALETTE.teal, enabled ? 0.12 : 0.06);
  ctx.fillRect(x1, LAYOUT.rulerHeight, x2 - x1, height - LAYOUT.rulerHeight);
  // Edge markers.
  ctx.fillStyle = hexToRgba(PALETTE.teal, enabled ? 0.9 : 0.4);
  ctx.fillRect(x1, LAYOUT.rulerHeight, 2, height - LAYOUT.rulerHeight);
  ctx.fillRect(x2 - 2, LAYOUT.rulerHeight, 2, height - LAYOUT.rulerHeight);
}

function drawTrackHeaders(ctx: CanvasRenderingContext2D, tracks: VoxTrack[]) {
  const colHeight = LAYOUT.rulerHeight + tracksHeight(tracks.length);

  // Column base with a faint left-to-right gradient for depth.
  const bgGrad = ctx.createLinearGradient(0, 0, LAYOUT.trackHeaderWidth, 0);
  bgGrad.addColorStop(0, PALETTE.bg2);
  bgGrad.addColorStop(1, '#10141c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, LAYOUT.rulerHeight, LAYOUT.trackHeaderWidth, tracksHeight(tracks.length));

  // Right separator hairline.
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LAYOUT.trackHeaderWidth + 0.5, 0);
  ctx.lineTo(LAYOUT.trackHeaderWidth + 0.5, colHeight);
  ctx.stroke();

  tracks.forEach((track, row) => {
    const top = trackTop(row);
    const colors = trackColor(track.type);

    // Lane divider in the header column.
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, top + LAYOUT.trackHeight, LAYOUT.trackHeaderWidth, 1);

    // Accent pill.
    ctx.fillStyle = colors.accent;
    roundRect(ctx, 12, top + LAYOUT.trackHeight / 2 - 9, 3, 18, 1.5);
    ctx.fill();

    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 13px "Space Grotesk", system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(track.label, 26, top + LAYOUT.trackHeight / 2 - 3, LAYOUT.trackHeaderWidth - 36);

    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 10px Inter, system-ui, sans-serif';
    ctx.fillText(track.type.toUpperCase(), 26, top + LAYOUT.trackHeight / 2 + 13);
  });
}

function drawRuler(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  contentX: number,
  contentWidth: number,
) {
  const w = contentX + contentWidth;
  // Subtle vertical gradient gives the ruler a tactile, raised feel.
  const grad = ctx.createLinearGradient(0, 0, 0, LAYOUT.rulerHeight);
  grad.addColorStop(0, '#171c26');
  grad.addColorStop(1, PALETTE.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, LAYOUT.rulerHeight);

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, LAYOUT.rulerHeight + 0.5);
  ctx.lineTo(w, LAYOUT.rulerHeight + 0.5);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(contentX, 0, contentWidth, LAYOUT.rulerHeight);
  ctx.clip();
  ctx.translate(contentX, 0);
  ctx.textBaseline = 'middle';
  for (const tick of visibleTicks(vp, contentWidth)) {
    const x = Math.round(tick.x) + 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(x, LAYOUT.rulerHeight - 7);
    ctx.lineTo(x, LAYOUT.rulerHeight);
    ctx.stroke();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 10px "Space Grotesk", Inter, system-ui, sans-serif';
    ctx.fillText(tick.label, tick.x + 5, LAYOUT.rulerHeight / 2 - 1);
  }
  ctx.restore();
}

function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  s: RenderState,
  contentX: number,
  contentWidth: number,
  height: number,
) {
  const x = contentX + msToX(s.viewport, s.playheadMs);
  if (x < contentX || x > contentX + contentWidth) return;
  const px = Math.round(x) + 0.5;

  ctx.save();
  ctx.shadowColor = hexToRgba(PALETTE.purpleL, 0.6);
  ctx.shadowBlur = 8;
  ctx.strokeStyle = PALETTE.purpleL;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, LAYOUT.rulerHeight - 4);
  ctx.lineTo(px, height);
  ctx.stroke();
  ctx.restore();

  // Handle in the ruler — a sleek downward chevron.
  ctx.fillStyle = PALETTE.purpleL;
  ctx.beginPath();
  ctx.moveTo(x - 6, 2);
  ctx.lineTo(x + 6, 2);
  ctx.lineTo(x + 6, 9);
  ctx.lineTo(x, 15);
  ctx.lineTo(x - 6, 9);
  ctx.closePath();
  ctx.fill();
}

// --- helpers ---------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Rounds only the left corners — for the accent bar against a clip's left edge. */
function roundRectLeft(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function clipLabel(type: string, data: Record<string, unknown>): string {
  if (type === 'audio' && typeof data.filename === 'string') return data.filename;
  if (type === 'plugin' && typeof data.pluginId === 'string') return data.pluginId;
  return type;
}
