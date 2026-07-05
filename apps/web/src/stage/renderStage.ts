import { pixelRgbAt } from '../pixel/engine.js';
import { hexToRgba, PALETTE, STAGE_COLORS } from '../styles/palette.js';
import type {
  AudioVisual,
  DeviceVisual,
  DmxVisual,
  PixelVisual,
  RelayVisual,
  SkullVisual,
  StageState,
} from './stageState.js';

/**
 * Pure canvas draw functions for the virtual stage. Same contract as the
 * timeline's render.ts: no React, no state — everything needed to paint a
 * frame comes in as arguments. Animation phase derives from `atMs` (the
 * playhead), so scrubbing animates the stage and pausing freezes it — the
 * stage always shows exactly what the hardware would be doing at that moment.
 */

export const STAGE_LAYOUT = {
  height: 240,
  cardGap: 12,
  padding: 12,
  skullCardW: 190,
  cardW: 150,
} as const;

const FONT_NAME = '600 11px system-ui, sans-serif';
const FONT_SMALL = '500 9px system-ui, sans-serif';

export function cardWidth(v: DeviceVisual): number {
  return v.kind === 'skull' ? STAGE_LAYOUT.skullCardW : STAGE_LAYOUT.cardW;
}

/** Total content width for a stage state (for horizontal scrolling). */
export function stageContentWidth(state: StageState): number {
  const { cardGap, padding } = STAGE_LAYOUT;
  let w = padding;
  for (const v of state.visuals) w += cardWidth(v) + cardGap;
  return w - cardGap + padding;
}

export function drawStage(
  ctx: CanvasRenderingContext2D,
  state: StageState,
  width: number,
  height: number,
  scrollX: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, width, height);

  if (state.visuals.length === 0) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = FONT_NAME;
    ctx.textAlign = 'center';
    ctx.fillText('No devices in this show yet — add one to see it on the stage', width / 2, height / 2);
    return;
  }

  const { cardGap, padding } = STAGE_LAYOUT;
  const cardH = height - padding * 2;
  let x = padding - scrollX;
  for (const v of state.visuals) {
    const w = cardWidth(v);
    if (x + w > 0 && x < width) drawCard(ctx, v, x, padding, w, cardH, state.atMs);
    x += w + cardGap;
  }
}

// --- cards -------------------------------------------------------------------

function drawCard(
  ctx: CanvasRenderingContext2D,
  v: DeviceVisual,
  x: number,
  y: number,
  w: number,
  h: number,
  atMs: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fillStyle = STAGE_COLORS.card;
  ctx.fill();
  ctx.strokeStyle = STAGE_COLORS.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();

  // Device name along the bottom.
  ctx.font = FONT_NAME;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(truncate(ctx, v.name, w - 16), x + w / 2, y + h - 10);

  const inner = { x, y, w, h: h - 26 }; // area above the name
  switch (v.kind) {
    case 'skull':
      drawSkull(ctx, v, inner);
      break;
    case 'pixel':
      drawPixelStrip(ctx, v, inner, atMs);
      break;
    case 'relay':
      drawRelays(ctx, v, inner);
      break;
    case 'dmx':
      drawDmx(ctx, v, inner);
      break;
    case 'audio':
      drawAudio(ctx, v, inner, atMs);
      break;
  }
  ctx.restore();
}

// --- skull ---------------------------------------------------------------------

function drawSkull(
  ctx: CanvasRenderingContext2D,
  v: SkullVisual,
  r: { x: number; y: number; w: number; h: number },
): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2 - 6;
  ctx.save();
  // Neck: pan slides the head sideways, tilt nods it, roll cocks it.
  ctx.translate(cx + v.neck.pan * 14, cy + v.neck.tilt * 10);
  ctx.rotate(v.neck.roll * 0.28);

  const jawDrop = v.jawOpen * 16;

  // Cranium.
  ctx.beginPath();
  ctx.ellipse(0, -10, 40, 42, 0, 0, Math.PI * 2);
  ctx.fillStyle = STAGE_COLORS.bone;
  ctx.fill();
  // Cheekbone shading.
  ctx.beginPath();
  ctx.ellipse(0, 16, 26, 14, 0, 0, Math.PI);
  ctx.fillStyle = STAGE_COLORS.boneShade;
  ctx.fill();

  // Eye sockets — pupils follow the eyes clip's gaze when one is active,
  // otherwise drift with the neck.
  const lookX = v.eyes ? v.eyes.lookX : v.neck.pan * 0.6;
  const lookY = v.eyes ? v.eyes.lookY : v.neck.tilt * 0.5;
  for (const side of [-1, 1] as const) {
    const ex = side * 17;
    const ey = -14;
    ctx.beginPath();
    ctx.arc(ex, ey, 12, 0, Math.PI * 2);
    ctx.fillStyle = STAGE_COLORS.socket;
    ctx.fill();
    const px = ex + lookX * 5;
    const py = ey + lookY * 4;
    if (v.eyes) {
      const grad = ctx.createRadialGradient(px, py, 1, px, py, 8);
      grad.addColorStop(0, v.eyes.color);
      grad.addColorStop(1, hexToRgba(v.eyes.color, 0));
      ctx.save();
      ctx.shadowColor = v.eyes.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = STAGE_COLORS.eyeIdle;
      ctx.fill();
    }
  }

  // Nasal cavity.
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(-4.5, 10);
  ctx.lineTo(4.5, 10);
  ctx.closePath();
  ctx.fillStyle = STAGE_COLORS.socket;
  ctx.fill();

  // Upper teeth.
  ctx.fillStyle = STAGE_COLORS.bone;
  for (let i = -2; i <= 2; i++) ctx.fillRect(i * 7 - 2.5, 22, 5, 8);

  // Mandible, dropped by jawOpen.
  ctx.save();
  ctx.translate(0, jawDrop);
  ctx.beginPath();
  ctx.roundRect(-22, 34, 44, 14, [4, 4, 10, 10]);
  ctx.fillStyle = STAGE_COLORS.bone;
  ctx.fill();
  ctx.fillStyle = STAGE_COLORS.boneShade;
  for (let i = -2; i <= 2; i++) ctx.fillRect(i * 7 - 2.5, 30, 5, 6);
  ctx.restore();

  ctx.restore();

  // Eye animation label + audio filename, small, under the chin area.
  ctx.font = FONT_SMALL;
  ctx.textAlign = 'center';
  if (v.eyes) {
    ctx.fillStyle = v.eyes.color;
    ctx.fillText(truncate(ctx, `eyes: ${v.eyes.animation}`, r.w - 12), cx, r.y + r.h - 2);
  } else if (v.talking && v.audioFilename) {
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(truncate(ctx, `♪ ${v.audioFilename}`, r.w - 12), cx, r.y + r.h - 2);
  }
}

// --- pixel strip -----------------------------------------------------------------

function drawPixelStrip(
  ctx: CanvasRenderingContext2D,
  v: PixelVisual,
  r: { x: number; y: number; w: number; h: number },
  atMs: number,
): void {
  // Shape-agnostic: the prop might be a ring, a strip, a matrix — we draw N
  // LEDs wrapped into rows that fit the card, animated along their run order.
  // Colors come from the shared effect engine so this preview, the inspector
  // preview, and (eventually) the remote firmware all agree.
  const count = Math.max(1, Math.min(v.count, 120)); // drawing cap; motion still uses real count
  const cy = r.y + r.h / 2;
  const usableW = r.w - 24;
  const perRow = Math.min(count, Math.floor(usableW / 9));
  const rows = Math.ceil(count / perRow);
  const dotR = rows > 2 ? 3 : 4.5;
  const rowGap = Math.min(14, (r.h - 40) / rows);
  const startY = cy - ((rows - 1) * rowGap) / 2 - 4;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const spacing = perRow > 1 ? usableW / (perRow - 1) : 0;
    const lx = r.x + 12 + col * spacing;
    const ly = startY + row * rowGap;
    ctx.beginPath();
    ctx.arc(lx, ly, dotR, 0, Math.PI * 2);
    if (v.active) {
      const [cr, cg, cb] = pixelRgbAt(v.active.params, i, v.count, atMs);
      const lum = (cr + cg + cb) / 765;
      ctx.save();
      if (lum > 0.35 && count <= 60) {
        ctx.shadowColor = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
        ctx.shadowBlur = 12 * lum;
      }
      ctx.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = PALETTE.bg3;
      ctx.fill();
    }
  }
  ctx.font = FONT_SMALL;
  ctx.textAlign = 'center';
  ctx.fillStyle = v.active ? v.active.params.color : PALETTE.muted;
  ctx.fillText(
    v.active ? `${v.active.label} · ${v.count}px` : `dark · ${v.count}px`,
    r.x + r.w / 2,
    r.y + r.h - 4,
  );
}

// --- relays ----------------------------------------------------------------------

function drawRelays(
  ctx: CanvasRenderingContext2D,
  v: RelayVisual,
  r: { x: number; y: number; w: number; h: number },
): void {
  const size = 30;
  const gap = 10;
  const total = v.channels.length * size + (v.channels.length - 1) * gap;
  let x = r.x + (r.w - total) / 2;
  const y = r.y + r.h / 2 - size / 2;
  for (const ch of v.channels) {
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 6);
    if (ch.on) {
      ctx.save();
      ctx.shadowColor = STAGE_COLORS.relayOn;
      ctx.shadowBlur = 12;
      ctx.fillStyle = STAGE_COLORS.relayOn;
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = PALETTE.bg;
    } else {
      ctx.fillStyle = PALETTE.bg3;
      ctx.fill();
      ctx.strokeStyle = STAGE_COLORS.cardBorder;
      ctx.stroke();
      ctx.fillStyle = PALETTE.muted;
    }
    ctx.font = FONT_NAME;
    ctx.textAlign = 'center';
    ctx.fillText(String(ch.channel), x + size / 2, y + size / 2 + 4);
    x += size + gap;
  }
}

// --- dmx -------------------------------------------------------------------------

function drawDmx(
  ctx: CanvasRenderingContext2D,
  v: DmxVisual,
  r: { x: number; y: number; w: number; h: number },
): void {
  if (v.channels.length === 0) {
    ctx.font = FONT_SMALL;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('all channels at 0', r.x + r.w / 2, r.y + r.h / 2);
    return;
  }
  const shown = v.channels.slice(0, 6);
  const barW = 14;
  const gap = 8;
  const maxH = r.h - 34;
  const total = shown.length * barW + (shown.length - 1) * gap;
  let x = r.x + (r.w - total) / 2;
  const base = r.y + 10 + maxH;
  for (const ch of shown) {
    const h = Math.max(2, (ch.value / 255) * maxH);
    ctx.fillStyle = PALETTE.bg3;
    ctx.fillRect(x, r.y + 10, barW, maxH);
    ctx.save();
    ctx.shadowColor = STAGE_COLORS.dmxBar;
    ctx.shadowBlur = ch.value > 40 ? 8 : 0;
    ctx.fillStyle = STAGE_COLORS.dmxBar;
    ctx.fillRect(x, base - h, barW, h);
    ctx.restore();
    ctx.font = FONT_SMALL;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(String(ch.channel), x + barW / 2, base + 12);
    x += barW + gap;
  }
}

// --- audio -----------------------------------------------------------------------

function drawAudio(
  ctx: CanvasRenderingContext2D,
  v: AudioVisual,
  r: { x: number; y: number; w: number; h: number },
  atMs: number,
): void {
  const cx = r.x + r.w / 2 - 10;
  const cy = r.y + r.h / 2 - 4;
  const level = v.playing?.level ?? 0;

  // Speaker body + cone.
  ctx.fillStyle = level > 0 ? STAGE_COLORS.audioArc : PALETTE.muted;
  ctx.fillRect(cx - 12, cy - 6, 8, 12);
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 6);
  ctx.lineTo(cx + 5, cy - 14);
  ctx.lineTo(cx + 5, cy + 14);
  ctx.lineTo(cx - 4, cy + 6);
  ctx.closePath();
  ctx.fill();

  // Arcs scale with the (fade-aware) level; a light flutter shows it's alive.
  const flutter = level > 0 ? level * (0.85 + 0.15 * Math.sin(atMs * 0.02)) : 0;
  const arcs = Math.ceil(flutter * 3);
  ctx.strokeStyle = STAGE_COLORS.audioArc;
  ctx.lineWidth = 2;
  for (let i = 1; i <= 3; i++) {
    ctx.globalAlpha = i <= arcs ? 0.9 : 0.12;
    ctx.beginPath();
    ctx.arc(cx + 6, cy, 6 + i * 6, -Math.PI / 3.2, Math.PI / 3.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.font = FONT_SMALL;
  ctx.textAlign = 'center';
  ctx.fillStyle = v.playing ? PALETTE.text : PALETTE.muted;
  ctx.fillText(
    truncate(ctx, v.playing ? `♪ ${v.playing.filename}` : 'silent', r.w - 12),
    r.x + r.w / 2,
    cy + 34,
  );
}

// --- util ------------------------------------------------------------------------

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}
