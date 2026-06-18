import type { VoxClip } from '@voxcomposer/shared';
import { definePlugin } from '@voxcomposer/plugin-sdk';

/** A WLED clip's payload. */
interface WledClipData {
  /** WLED node host/IP, e.g. "192.168.1.50". */
  host: string;
  /** Preset slot to activate. */
  preset: number;
  /** Optional friendly label for the preset. */
  label?: string;
}

function read(clip: VoxClip): WledClipData {
  const d = clip.data as Partial<WledClipData>;
  return { host: d.host ?? '', preset: typeof d.preset === 'number' ? d.preset : 1, label: d.label };
}

/**
 * WLED — drives WLED LED controllers on the local network by activating a
 * preset (`{"ps": N}`) when a clip plays. Demonstrates a plugin that returns a
 * real React inspector (plugins run trusted, in-process).
 */
export default definePlugin({
  id: 'com.wled.integration',
  name: 'WLED',
  version: '1.0.0',
  author: 'rehmlights',
  description: 'Trigger WLED presets on a pixel track from the timeline.',
  trackType: 'wled',
  permissions: ['network'],
  color: '#00A2FF',

  summarizeClip(clip) {
    const { host, preset, label } = read(clip);
    if (!host) return 'WLED — set node';
    return label ? `WLED ${label}` : `WLED ${stripHost(host)} · ps ${preset}`;
  },

  onFrame(_timestamp, clip, api) {
    const { host, preset } = read(clip);
    if (!host) return;
    // WLED JSON API: activate a preset.
    void api
      .sendHTTP(`http://${host}/json/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ps: preset }),
      })
      .catch((err) => api.log('WLED preset request failed:', err));
  },

  renderInspector(clip, { onChange }) {
    const { host, preset, label } = read(clip);
    const field: React.CSSProperties = {
      width: '100%',
      background: '#0F1117',
      border: '1px solid #2D3748',
      borderRadius: 8,
      color: '#E2E8F0',
      padding: '6px 10px',
      fontSize: 13,
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#718096' }}>WLED node</span>
          <input
            style={field}
            value={host}
            placeholder="192.168.1.50"
            onChange={(e) => onChange({ host: e.target.value })}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#718096' }}>Preset slot</span>
          <input
            style={field}
            type="number"
            min={1}
            value={preset}
            onChange={(e) => onChange({ preset: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#718096' }}>Label (optional)</span>
          <input
            style={field}
            value={label ?? ''}
            placeholder="Lightning burst"
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </label>
      </div>
    );
  },
});

function stripHost(host: string): string {
  return host.replace(/^https?:\/\//, '');
}
