import type { VoxClip } from '@voxcomposer/shared';
import { definePlugin, type VoxPlugin } from '@voxcomposer/plugin-sdk';
import { pluginRegistry } from './registry.js';

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

const wled: VoxPlugin = definePlugin({
  id: 'com.wled.integration',
  name: 'WLED',
  version: '1.0.0',
  author: 'Vox Composer',
  description: 'Trigger WLED presets on a pixel track over the local network.',
  trackType: 'wled',
  permissions: ['network'],
  color: '#00A2FF',
  summarizeClip(clip) {
    const host = str(clip, 'host');
    const preset = num(clip, 'preset', 1);
    const label = str(clip, 'label');
    if (!host) return 'WLED — set node';
    return label ? `WLED ${label}` : `WLED ${host} · ps ${preset}`;
  },
  onFrame(_ts, clip, api) {
    const host = str(clip, 'host');
    if (!host) return;
    void api
      .sendHTTP(`http://${host}/json/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ps: num(clip, 'preset', 1) }),
      })
      .catch((e) => api.log('WLED request failed', e));
  },
  renderInspector(clip, { onChange }) {
    const host = str(clip, 'host');
    const preset = num(clip, 'preset', 1);
    const label = str(clip, 'label');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={labelStyle}>
          <span style={capStyle}>WLED node</span>
          <input
            style={fieldStyle}
            value={host}
            placeholder="192.168.1.50"
            onChange={(e) => onChange({ host: e.target.value })}
          />
        </label>
        <label style={labelStyle}>
          <span style={capStyle}>Preset slot</span>
          <input
            style={fieldStyle}
            type="number"
            min={1}
            value={preset}
            onChange={(e) => onChange({ preset: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label style={labelStyle}>
          <span style={capStyle}>Label (optional)</span>
          <input
            style={fieldStyle}
            value={label}
            placeholder="Lightning burst"
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </label>
      </div>
    );
  },
});

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

export const BUILTIN_PLUGINS: VoxPlugin[] = [wled, genericHttp, genericUdp];

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
