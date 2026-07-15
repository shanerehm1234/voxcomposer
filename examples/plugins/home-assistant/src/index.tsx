import type React from 'react';
import type { VoxClip } from '@voxcomposer/shared';
import { definePlugin } from '@voxcomposer/plugin-sdk';

/**
 * Home Assistant — call a HA service (turn a light on, run a scene, fire a
 * script, flip a switch) at a timeline instant. Great for tying room lighting,
 * fog machines on smart plugs, or whole "scenes" into a haunt cue sheet.
 *
 * It POSTs to Home Assistant's REST API:
 *   POST {baseUrl}/api/services/{domain}/{service}
 *   Authorization: Bearer {token}
 *   { "entity_id": "...", ...extra service data }
 *
 * Create a Long-Lived Access Token in HA (Profile → Security → bottom of page).
 * CORS: add your Composer origin to HA's `http.cors_allowed_origins`, or let the
 * request fall back through the Vox Master relay (api.sendHTTP does this
 * automatically when the browser blocks it).
 */

interface HAClipData {
  baseUrl: string; // e.g. http://homeassistant.local:8123
  token: string; // Long-Lived Access Token
  domain: string; // e.g. "light", "switch", "scene", "script"
  service: string; // e.g. "turn_on", "turn_off", "toggle"
  entityId: string; // e.g. "light.porch"
  dataJson?: string; // optional extra service data, e.g. {"brightness":255,"rgb_color":[255,0,0]}
}

function read(clip: VoxClip): HAClipData {
  const d = clip.data as Partial<HAClipData>;
  return {
    baseUrl: (d.baseUrl ?? '').replace(/\/+$/, ''),
    token: d.token ?? '',
    domain: d.domain ?? 'light',
    service: d.service ?? 'turn_on',
    entityId: d.entityId ?? '',
    dataJson: d.dataJson,
  };
}

const COMMON_SERVICES = [
  'light.turn_on',
  'light.turn_off',
  'light.toggle',
  'switch.turn_on',
  'switch.turn_off',
  'scene.turn_on',
  'script.turn_on',
  'media_player.play_media',
  'homeassistant.turn_on',
  'homeassistant.turn_off',
];

export default definePlugin({
  id: 'com.rehmlights.home-assistant',
  name: 'Home Assistant',
  version: '0.1.0',
  author: 'rehmlights',
  description: 'Call a Home Assistant service (light/switch/scene/script) at a timestamp.',
  trackType: 'homeassistant',
  permissions: ['network'],
  color: '#41BDF5',

  summarizeClip(clip) {
    const { domain, service, entityId } = read(clip);
    if (!entityId) return 'Home Assistant — set entity';
    return `${domain}.${service} → ${entityId}`;
  },

  onFrame(_ts, clip, api) {
    const { baseUrl, token, domain, service, entityId, dataJson } = read(clip);
    if (!baseUrl || !token || !entityId) return;

    let extra: Record<string, unknown> = {};
    if (dataJson && dataJson.trim()) {
      try {
        extra = JSON.parse(dataJson);
      } catch {
        api.log('Home Assistant: ignoring invalid Service data JSON');
      }
    }

    void api
      .sendHTTP(`${baseUrl}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entity_id: entityId, ...extra }),
      })
      .then((res) => {
        if (!res.ok) api.log(`Home Assistant ${domain}.${service} → HTTP ${res.status}`);
      })
      .catch((err) => api.log('Home Assistant request failed:', err));
  },

  renderInspector(clip, { onChange }) {
    const d = read(clip);
    const svc = `${d.domain}.${d.service}`;
    const setService = (v: string) => {
      const dot = v.indexOf('.');
      onChange({ domain: v.slice(0, dot), service: v.slice(dot + 1) });
    };
    return (
      <div style={col}>
        <Field label="Home Assistant URL">
          <input
            style={input}
            value={d.baseUrl}
            placeholder="http://homeassistant.local:8123"
            onChange={(e) => onChange({ baseUrl: e.target.value })}
          />
        </Field>
        <Field label="Access token (Long-Lived)">
          <input
            style={input}
            type="password"
            value={d.token}
            placeholder="paste your HA token"
            onChange={(e) => onChange({ token: e.target.value })}
          />
        </Field>
        <Field label="Service">
          <input
            style={input}
            list="ha-services"
            value={svc}
            placeholder="light.turn_on"
            onChange={(e) => setService(e.target.value)}
          />
          <datalist id="ha-services">
            {COMMON_SERVICES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Entity ID">
          <input
            style={input}
            value={d.entityId}
            placeholder="light.porch"
            onChange={(e) => onChange({ entityId: e.target.value })}
          />
        </Field>
        <Field label="Service data (JSON, optional)">
          <input
            style={input}
            value={d.dataJson ?? ''}
            placeholder='{"brightness":255,"rgb_color":[255,0,0]}'
            onChange={(e) => onChange({ dataJson: e.target.value })}
          />
        </Field>
      </div>
    );
  },
});

// --- tiny inline UI helpers (plugins may return real React) ------------------
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#718096' }}>{label}</span>
      {children}
    </label>
  );
}
