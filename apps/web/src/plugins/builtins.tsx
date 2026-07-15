import type { VoxClip } from '@voxcomposer/shared';
import { definePlugin, type VoxPlugin } from '@voxcomposer/plugin-sdk';
import { pluginRegistry } from './registry.js';
import { huePlugin } from './hue.js';
import { homeAssistantPlugin } from './homeAssistant.js';

/**
 * The plugins Vox Composer ships with in v1. They're authored with the same
 * public SDK third-party plugins use — just bundled and trusted by default.
 * Third-party authoring templates live in `examples/plugins/`.
 */

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: '#0F1117',
  border: '1px solid #2D3748',
  borderRadius: 8,
  color: '#E2E8F0',
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const capStyle: React.CSSProperties = { fontSize: 11, color: '#718096' };

// Note: there is no WLED/pixel plugin here — `pixel` is a native track/clip
// type (see packages/shared/src/vox/clip.ts: PixelClipData), not a plugin.
// The Master relays pixel clip data verbatim to the addressed VoxPixel remote
// by deviceId; nothing in the Composer talks to a WLED device's IP directly.
// See docs/PAIRING.md for why: device identity/trust lives on the Master.

const genericHttp: VoxPlugin = definePlugin({
  id: 'com.voxcomposer.generic-http',
  name: 'Generic HTTP',
  version: '1.0.0',
  author: 'Vox Composer',
  description: 'Send an HTTP GET or POST to any URL at a timestamp.',
  trackType: 'http',
  permissions: ['network'],
  color: '#7AA2F7',
  summarizeClip(clip) {
    const url = str(clip, 'url');
    const method = str(clip, 'method') || 'GET';
    return url ? `${method} ${url.replace(/^https?:\/\//, '')}` : 'HTTP — set URL';
  },
  onFrame(_ts, clip, api) {
    const url = str(clip, 'url');
    if (!url) return;
    const method = str(clip, 'method') === 'POST' ? 'POST' : 'GET';
    void api
      .sendHTTP(url, { method, body: method === 'POST' ? str(clip, 'body') : undefined })
      .catch((e) => api.log('HTTP request failed', e));
  },
  renderInspector(clip, { onChange }) {
    const url = str(clip, 'url');
    const method = str(clip, 'method') || 'GET';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={labelStyle}>
          <span style={capStyle}>URL</span>
          <input
            style={fieldStyle}
            value={url}
            placeholder="http://device.local/trigger"
            onChange={(e) => onChange({ url: e.target.value })}
          />
        </label>
        <label style={labelStyle}>
          <span style={capStyle}>Method</span>
          <select
            style={fieldStyle}
            value={method}
            onChange={(e) => onChange({ method: e.target.value })}
          >
            <option>GET</option>
            <option>POST</option>
          </select>
        </label>
      </div>
    );
  },
});

const genericUdp: VoxPlugin = definePlugin({
  id: 'com.voxcomposer.generic-udp',
  name: 'Generic UDP',
  version: '1.0.0',
  author: 'Vox Composer',
  description: 'Send a raw UDP packet to any host/port (OSC, custom protocols).',
  trackType: 'udp',
  permissions: ['network'],
  color: '#5DCAA5',
  summarizeClip(clip) {
    const host = str(clip, 'host');
    const port = num(clip, 'port', 0);
    return host ? `UDP ${host}:${port}` : 'UDP — set host';
  },
  onFrame(_ts, clip, api) {
    const host = str(clip, 'host');
    if (!host) return;
    void api
      .sendUDP(host, num(clip, 'port', 0), new TextEncoder().encode(str(clip, 'payload')))
      .catch((e) => api.log('UDP send failed', e));
  },
});

export const BUILTIN_PLUGINS: VoxPlugin[] = [
  huePlugin,
  homeAssistantPlugin,
  genericHttp,
  genericUdp,
];

/** Register the built-ins once. Safe to call repeatedly. */
export function registerBuiltins(): void {
  for (const p of BUILTIN_PLUGINS) {
    if (!pluginRegistry.has(p.id)) pluginRegistry.register(p);
  }
}

// --- helpers ---------------------------------------------------------------

function str(clip: VoxClip, key: string): string {
  const v = (clip.data as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}
function num(clip: VoxClip, key: string, fallback: number): number {
  const v = (clip.data as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : fallback;
}
