import { useEffect, useRef } from 'react';
import type { FixtureLook, FixtureProfile } from '@voxcomposer/shared';

interface FixturePreviewProps {
  profile: FixtureProfile;
  /** The look being edited: semantic role → 0..255. */
  look: FixtureLook;
}

/** Named color-wheel slots carry no RGB, so map the common wheel names to a
 *  representative hue for the beam. Anything unmatched falls back to white. */
const COLOR_HEX: [RegExp, string][] = [
  [/open|white|no\s*colou?r|clear/, '#FFFFFF'],
  [/deep\s*red|dark\s*red/, '#E01010'],
  [/red/, '#FF3A2E'],
  [/amber/, '#FFB300'],
  [/orange/, '#FF7A00'],
  [/yellow/, '#FFE000'],
  [/lime/, '#B6FF3A'],
  [/green/, '#39FF6A'],
  [/aqua|cyan|turquoise/, '#30F0FF'],
  [/congo|light\s*blue/, '#5AA0FF'],
  [/blue/, '#3A5BFF'],
  [/lavender|purple|violet|indigo/, '#9B5CFF'],
  [/magenta|pink|rose/, '#FF48C4'],
  [/uv|ultra/, '#7A2BFF'],
];

function colorForName(name: string | undefined): string {
  if (!name) return '#FFFFFF';
  const n = name.toLowerCase();
  for (const [re, hex] of COLOR_HEX) if (re.test(n)) return hex;
  return '#FFFFFF';
}

/** Resolve a role's live value: the look wins, else the channel's power-on
 *  default, else the supplied fallback (also used when the role is absent). */
function roleValue(profile: FixtureProfile, look: FixtureLook, role: string, fallback: number): number {
  if (look[role] !== undefined) return look[role];
  const ch = profile.channels.find((c) => c.role === role);
  return ch?.default ?? fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * A live beam preview of a moving-head/DMX fixture, driven by the look being
 * edited — the beam swings left/right with PAN, up/down with TILT, tints to the
 * selected color-wheel slot, and brightens with the DIMMER (fixtures without a
 * dimmer channel read as full). Fills the gap where eyes/pixels have previews
 * but DMX only had sliders. Static per look (no animation), so it's
 * reduced-motion safe by construction.
 */
export function FixturePreview({ profile, look }: FixturePreviewProps) {
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

    // --- resolve the look into beam parameters --------------------------------
    const pan = roleValue(profile, look, 'PAN', 128);
    const tilt = roleValue(profile, look, 'TILT', 128);
    const hasDimmer = profile.channels.some((c) => c.role === 'DIMMER');
    const dimmer = look.DIMMER !== undefined ? look.DIMMER : hasDimmer ? roleValue(profile, look, 'DIMMER', 255) : 255;
    const lit = Math.max(0, Math.min(1, dimmer / 255));

    const slotValue = look.COLOR_WHEEL;
    const slot = slotValue !== undefined ? profile.color_wheel?.find((s) => s.value === slotValue) : undefined;
    const goboSlot = look.GOBO_WHEEL !== undefined ? profile.gobo_wheel?.find((s) => s.value === look.GOBO_WHEEL) : undefined;
    const [cr, cg, cb] = hexToRgb(colorForName(slot?.name));

    // --- geometry -------------------------------------------------------------
    const panN = (pan - 128) / 128; // -1 (left) .. +1 (right)
    const tiltN = tilt / 255; //        0 (near/low) .. 1 (up/high)
    const headX = w / 2;
    const headY = h - 12;
    const spotX = w / 2 + panN * (w * 0.36);
    const spotY = headY - 14 - tiltN * (h - 40);
    const spotR = 15 + lit * 8;

    // --- stage backdrop (always dark — it depicts a darkened venue) -----------
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b0b14');
    bg.addColorStop(1, '#15131f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // faint floor line
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headY - 2);
    ctx.lineTo(w, headY - 2);
    ctx.stroke();

    const rgba = (a: number) => `rgba(${cr},${cg},${cb},${a})`;

    // --- beam cone ------------------------------------------------------------
    const spread = 7 + spotR * 0.5;
    const grad = ctx.createLinearGradient(headX, headY, spotX, spotY);
    grad.addColorStop(0, rgba(0.05 + 0.28 * lit));
    grad.addColorStop(1, rgba(0.02 + 0.16 * lit));
    ctx.beginPath();
    ctx.moveTo(headX - 4, headY);
    ctx.lineTo(spotX - spread, spotY);
    ctx.lineTo(spotX + spread, spotY);
    ctx.lineTo(headX + 4, headY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // --- landing spot (radial glow) ------------------------------------------
    const spot = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, spotR);
    spot.addColorStop(0, rgba(0.25 + 0.7 * lit));
    spot.addColorStop(0.6, rgba(0.08 + 0.3 * lit));
    spot.addColorStop(1, rgba(0));
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(spotX, spotY, spotR, 0, Math.PI * 2);
    ctx.fill();
    // gobo hint: break the spot into a dotted ring so it doesn't read as a flat wash
    if (goboSlot && !/open|none|no\s*gobo/i.test(goboSlot.name) && lit > 0.05) {
      ctx.fillStyle = rgba(0.15 + 0.5 * lit);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(spotX + Math.cos(a) * spotR * 0.5, spotY + Math.sin(a) * spotR * 0.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- fixture head ---------------------------------------------------------
    ctx.fillStyle = '#2a2740';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    const hw = 9;
    ctx.beginPath();
    ctx.roundRect(headX - hw, headY - 4, hw * 2, 10, 3);
    ctx.fill();
    ctx.stroke();
    // emitter, tinted by the beam
    ctx.fillStyle = lit > 0.02 ? rgba(0.5 + 0.5 * lit) : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(headX, headY, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // --- caption (color / gobo name) -----------------------------------------
    const label = [slot?.name, goboSlot?.name].filter(Boolean).join(' · ');
    if (label) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(label, 7, 6);
    }
    if (lit < 0.02) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('blackout', w - 7, 6);
      ctx.textAlign = 'left';
    }
  }, [profile, look]);

  return <canvas ref={ref} className="block w-full" style={{ height: 132 }} />;
}
