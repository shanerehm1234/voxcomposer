import type React from 'react';
import type { VoxClip } from '@voxcomposer/shared';
import { definePlugin } from '@voxcomposer/plugin-sdk';

/**
 * Philips Hue — drive a Hue light or group (color, brightness, on/off) from a
 * timeline clip via the LOCAL bridge API (no cloud). Perfect for snapping a
 * room blood-red on a scare, then fading back.
 *
 * Talks to the bridge directly:
 *   PUT http://{bridgeIp}/api/{username}/lights/{id}/state      (a single light)
 *   PUT http://{bridgeIp}/api/{username}/groups/{id}/action     (a room/group)
 *   { "on": true, "bri": 1..254, "hue": 0..65535, "sat": 0..254, "transitiontime": ds }
 *
 * Get a `username` (API key) once: press the round link button on the bridge,
 * then within 30s POST {"devicetype":"voxcomposer#haunt"} to http://{bridgeIp}/api
 * — the response contains your username. Find light/group ids at
 * http://{bridgeIp}/api/{username}/lights.
 *
 * CORS: the bridge sends no CORS headers, so a browser fetch is blocked —
 * api.sendHTTP automatically relays it through the Vox Master instead (the
 * Master is on the LAN with the bridge). No extra setup.
 */

interface HueClipData {
  bridgeIp: string;
  username: string;
  target: 'lights' | 'groups';
  id: string;
  on: boolean;
  bri: number; // 1..254
  color: string; // #rrggbb (converted to hue/sat below)
  useColor: boolean; // false = brightness/on only (keep current colour)
  transitionMs: number; // fade time
}

function read(clip: VoxClip): HueClipData {
  const d = clip.data as Partial<HueClipData>;
  return {
    bridgeIp: (d.bridgeIp ?? '').trim(),
    username: (d.username ?? '').trim(),
    target: d.target === 'groups' ? 'groups' : 'lights',
    id: d.id ?? '',
    on: d.on ?? true,
    bri: clamp(Math.round(d.bri ?? 254), 1, 254),
    color: d.color ?? '#ff0000',
    useColor: d.useColor ?? true,
    transitionMs: Math.max(0, Math.round(d.transitionMs ?? 400)),
  };
}

export default definePlugin({
  id: 'com.rehmlights.philips-hue',
  name: 'Philips Hue',
  version: '0.1.0',
  author: 'rehmlights',
  description: 'Set a Hue light or group (color, brightness, on/off) at a timestamp.',
  trackType: 'hue',
  permissions: ['network'],
  color: '#F5A623',

  summarizeClip(clip) {
    const d = read(clip);
    if (!d.id) return 'Hue — set light/group';
    const what = `${d.target === 'groups' ? 'group' : 'light'} ${d.id}`;
    if (!d.on) return `Hue ${what} → off`;
    return d.useColor ? `Hue ${what} → ${d.color} ${pct(d.bri)}` : `Hue ${what} → ${pct(d.bri)}`;
  },

  onFrame(_ts, clip, api) {
    const d = read(clip);
    if (!d.bridgeIp || !d.username || !d.id) return;

    const body: Record<string, unknown> = {
      on: d.on,
      transitiontime: Math.round(d.transitionMs / 100), // Hue uses deciseconds
    };
    if (d.on) {
      body.bri = d.bri;
      if (d.useColor) {
        const { hue, sat } = hexToHueSat(d.color);
        body.hue = hue;
        body.sat = sat;
      }
    }
    const path = d.target === 'groups' ? `groups/${d.id}/action` : `lights/${d.id}/state`;
    void api
      .sendHTTP(`http://${d.bridgeIp}/api/${d.username}/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      .then((res) => {
        if (!res.ok) api.log(`Hue → HTTP ${res.status}`);
      })
      .catch((err) => api.log('Hue request failed:', err));
  },

  renderInspector(clip, { onChange }) {
    const d = read(clip);
    return (
      <div style={col}>
        <Field label="Bridge IP">
          <input
            style={input}
            value={d.bridgeIp}
            placeholder="192.168.1.50"
            onChange={(e) => onChange({ bridgeIp: e.target.value })}
          />
        </Field>
        <Field label="Bridge username (API key)">
          <input
            style={input}
            type="password"
            value={d.username}
            placeholder="press link button + POST /api to get one"
            onChange={(e) => onChange({ username: e.target.value })}
          />
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Target">
            <select
              style={input}
              value={d.target}
              onChange={(e) => onChange({ target: e.target.value })}
            >
              <option value="lights">Light</option>
              <option value="groups">Group / room</option>
            </select>
          </Field>
          <Field label="ID">
            <input
              style={input}
              value={d.id}
              placeholder="1"
              onChange={(e) => onChange({ id: e.target.value })}
            />
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#E2E8F0' }}>
          <input type="checkbox" checked={d.on} onChange={(e) => onChange({ on: e.target.checked })} />
          On
        </label>
        <Field label={`Brightness — ${pct(d.bri)}`}>
          <input
            type="range"
            min={1}
            max={254}
            value={d.bri}
            onChange={(e) => onChange({ bri: Number(e.target.value) })}
          />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#E2E8F0' }}>
          <input
            type="checkbox"
            checked={d.useColor}
            onChange={(e) => onChange({ useColor: e.target.checked })}
          />
          Set colour
        </label>
        {d.useColor && (
          <Field label="Colour">
            <input
              type="color"
              value={d.color}
              onChange={(e) => onChange({ color: e.target.value })}
              style={{ ...input, height: 40, padding: 4 }}
            />
          </Field>
        )}
        <Field label={`Fade — ${d.transitionMs} ms`}>
          <input
            type="range"
            min={0}
            max={5000}
            step={100}
            value={d.transitionMs}
            onChange={(e) => onChange({ transitionMs: Number(e.target.value) })}
          />
        </Field>
      </div>
    );
  },
});

// --- colour + math helpers ---------------------------------------------------
function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
function pct(bri: number): string {
  return `${Math.round((bri / 254) * 100)}%`;
}
/** #rrggbb → Hue's hue (0..65535) + sat (0..254). */
function hexToHueSat(hex: string): { hue: number; sat: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { hue: 0, sat: 254 };
  const r = parseInt(m[1]!, 16) / 255;
  const g = parseInt(m[2]!, 16) / 255;
  const b = parseInt(m[3]!, 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  h = (h * 60 + 360) % 360;
  const s = max === 0 ? 0 : delta / max;
  return { hue: Math.round((h / 360) * 65535), sat: Math.round(s * 254) };
}

// --- tiny inline UI helpers --------------------------------------------------
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const input: React.CSSProperties = {
  width: '100%',
  background: '#0F1117',
  border: '1px solid #2D3748',
  borderRadius: 8,
  color: '#E2E8F0',
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
};
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 11, color: '#718096' }}>{label}</span>
      {children}
    </label>
  );
}
