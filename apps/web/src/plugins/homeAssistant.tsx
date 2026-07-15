import { useEffect, useMemo, useState } from 'react';
import type { VoxClip } from '@voxcomposer/shared';
import {
  definePlugin,
  type BakedHttpAction,
  type PluginConfig,
  type SetupContext,
  type VoxPlugin,
  type VoxPluginAPI,
} from '@voxcomposer/plugin-sdk';

/**
 * Home Assistant — call any HA service (turn a light on, recall a scene, run a
 * script/automation) from a timeline clip. Set up ONCE with a long-lived access
 * token; every clip then picks from *your* entities and services. compileClip()
 * bakes a plain HTTP action into the .vox so it fires on the Master unattended.
 *
 * End-user shape:
 *   - Setup (Device manager): paste HA URL + a long-lived token → done forever.
 *   - Clip: pick an action (domain.service) + a target entity.
 *
 * HA's REST API needs the token as a Bearer header and (by default) doesn't send
 * CORS headers, so calls go through api.sendHTTP → relayed via the Vox Master.
 */

// --- config + clip model -----------------------------------------------------

interface HaConfig {
  baseUrl: string; // e.g. http://homeassistant.local:8123
  token: string; // long-lived access token
}

function cfg(config: PluginConfig): HaConfig {
  const raw = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : '';
  return {
    baseUrl: raw.replace(/\/+$/, ''), // no trailing slash
    token: typeof config.token === 'string' ? config.token.trim() : '',
  };
}

interface HaClipData {
  domain: string; // e.g. "light", "scene", "script"
  service: string; // e.g. "turn_on"
  entityId: string; // e.g. "light.porch"
  entityName?: string; // cached for the summary
}

function read(clip: VoxClip): HaClipData {
  const d = clip.data as Partial<HaClipData>;
  return {
    domain: d.domain ?? '',
    service: d.service ?? '',
    entityId: d.entityId ?? '',
    entityName: d.entityName,
  };
}

// --- the pure action builder (unit-tested) -----------------------------------

/** Build the HA REST call for a clip, or null if incomplete. */
export function buildHaAction(d: HaClipData, c: HaConfig): BakedHttpAction | null {
  if (!c.baseUrl || !c.token || !d.domain || !d.service) return null;
  const body = d.entityId ? { entity_id: d.entityId } : {};
  return {
    kind: 'http',
    method: 'POST',
    url: `${c.baseUrl}/api/services/${d.domain}/${d.service}`,
    headers: {
      Authorization: `Bearer ${c.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function isConfigured(config: PluginConfig): boolean {
  const c = cfg(config);
  return !!(c.baseUrl && c.token);
}

// --- the plugin --------------------------------------------------------------

export const homeAssistantPlugin: VoxPlugin = definePlugin({
  id: 'com.rehmlights.home-assistant',
  name: 'Home Assistant',
  version: '1.0.0',
  author: 'rehmlights',
  description: 'Call any Home Assistant service (lights, scenes, scripts) at a cue.',
  trackType: 'home-assistant',
  permissions: ['network'],
  color: '#41BDF5',

  isConfigured,

  summarizeClip(clip) {
    const d = read(clip);
    if (!d.domain || !d.service) return 'HA — pick an action';
    const svc = `${d.domain}.${d.service}`;
    return d.entityId ? `HA ${svc} → ${d.entityName ?? d.entityId}` : `HA ${svc}`;
  },

  compileClip(clip, config) {
    return buildHaAction(read(clip), cfg(config));
  },

  onFrame(_ts, clip, api) {
    const action = buildHaAction(read(clip), cfg(api.getConfig()));
    if (!action) return;
    void api
      .sendHTTP(action.url, { method: action.method, headers: action.headers, body: action.body })
      .then((res) => {
        if (!res.ok) api.log(`HA → HTTP ${res.status}`);
      })
      .catch((err) => api.log('HA request failed:', err));
  },

  renderSetup(ctx) {
    return <HaSetup ctx={ctx} />;
  },

  renderInspector(clip, ctx) {
    return <HaInspector clip={clip} onChange={ctx.onChange} config={ctx.config} api={ctx.api} />;
  },
});

// --- setup UI: URL + long-lived token ----------------------------------------

function HaSetup({ ctx }: { ctx: SetupContext }) {
  const c = cfg(ctx.config);
  const [url, setUrl] = useState(c.baseUrl);
  const [token, setToken] = useState(c.token);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const testAndSave = async () => {
    const base = url.trim().replace(/\/+$/, '');
    if (!base || !token.trim()) return setStatus('enter both the URL and a token');
    setBusy(true);
    setStatus('checking…');
    try {
      const res = await ctx.api.sendHTTP(`${base}/api/`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (res.ok) {
        ctx.save({ baseUrl: base, token: token.trim() });
        setStatus('connected ✓');
      } else {
        setStatus(res.status === 401 ? 'token rejected (401)' : `HA returned HTTP ${res.status}`);
      }
    } catch {
      setStatus('couldn’t reach Home Assistant — check the URL / Master');
    }
    setBusy(false);
  };

  if (isConfigured(ctx.config)) {
    return (
      <div style={col}>
        <div style={{ fontSize: 13, color: '#5DCAA5' }}>✓ Connected to {c.baseUrl}</div>
        <button style={btnGhost} onClick={() => ctx.save({ baseUrl: '', token: '' })}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div style={col}>
      <div style={{ fontSize: 12, color: '#94A3B8' }}>
        Create a long-lived token in HA (Profile → Security → Long-lived access tokens), paste it
        once.
      </div>
      <Field label="Home Assistant URL">
        <input
          style={input}
          value={url}
          placeholder="http://homeassistant.local:8123"
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <Field label="Long-lived access token">
        <input
          style={input}
          type="password"
          value={token}
          placeholder="paste token"
          onChange={(e) => setToken(e.target.value)}
        />
      </Field>
      <button style={btnPrimary} onClick={testAndSave} disabled={busy}>
        {busy ? 'Connecting…' : 'Connect'}
      </button>
      {status && <div style={{ fontSize: 12, color: '#94A3B8' }}>{status}</div>}
    </div>
  );
}

// --- inspector: pick a service + entity --------------------------------------

interface HaEntity {
  entityId: string;
  name: string;
  domain: string;
}

function HaInspector({
  clip,
  onChange,
  config,
  api,
}: {
  clip: VoxClip;
  onChange: (data: Record<string, unknown>) => void;
  config: PluginConfig;
  api: VoxPluginAPI;
}) {
  const c = cfg(config);
  const d = read(clip);
  const [services, setServices] = useState<string[]>([]); // "domain.service"
  const [entities, setEntities] = useState<HaEntity[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');

  useEffect(() => {
    if (!c.baseUrl || !c.token) return;
    let alive = true;
    setLoadState('loading');
    const headers = { Authorization: `Bearer ${c.token}` };
    Promise.all([
      api.sendHTTP(`${c.baseUrl}/api/services`, { headers }).then((r) => r.json()),
      api.sendHTTP(`${c.baseUrl}/api/states`, { headers }).then((r) => r.json()),
    ])
      .then(([svc, states]) => {
        if (!alive) return;
        setServices(flattenServices(svc));
        setEntities(toEntities(states));
        setLoadState('ok');
      })
      .catch(() => alive && setLoadState('err'));
    return () => {
      alive = false;
    };
  }, [c.baseUrl, c.token, api]);

  // Only offer entities in the selected service's domain (plus "no target").
  const entityChoices = useMemo(
    () => (d.domain ? entities.filter((e) => e.domain === d.domain) : entities),
    [entities, d.domain],
  );

  if (!isConfigured(config)) {
    return (
      <div style={{ fontSize: 13, color: '#94A3B8' }}>
        Set up Home Assistant in Settings → Plugins first (URL + token).
      </div>
    );
  }

  return (
    <div style={col}>
      {loadState === 'loading' && <Muted>Loading your services & entities…</Muted>}
      {loadState === 'err' && <Muted>Couldn’t reach Home Assistant — is the Master online?</Muted>}

      <Field label="Action (service)">
        <select
          style={input}
          value={d.domain && d.service ? `${d.domain}.${d.service}` : ''}
          onChange={(e) => {
            const [domain, ...rest] = e.target.value.split('.');
            onChange({ domain: domain ?? '', service: rest.join('.') });
          }}
        >
          <option value="">— pick an action —</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Target entity (optional)">
        <select
          style={input}
          value={d.entityId}
          onChange={(e) => {
            const ent = entityChoices.find((x) => x.entityId === e.target.value);
            onChange({ entityId: e.target.value, entityName: ent?.name });
          }}
        >
          <option value="">— none —</option>
          {entityChoices.map((ent) => (
            <option key={ent.entityId} value={ent.entityId}>
              {ent.name} ({ent.entityId})
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

// --- helpers -----------------------------------------------------------------

/** GET /api/services → [{domain, services:{name:{...}}}] → ["light.turn_on", …]. */
function flattenServices(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const d of list as { domain?: string; services?: Record<string, unknown> }[]) {
    if (!d?.domain || !d.services) continue;
    for (const svc of Object.keys(d.services)) out.push(`${d.domain}.${svc}`);
  }
  return out.sort();
}

/** GET /api/states → [{entity_id, attributes:{friendly_name}}] → entities. */
function toEntities(list: unknown): HaEntity[] {
  if (!Array.isArray(list)) return [];
  return (list as { entity_id?: string; attributes?: { friendly_name?: string } }[])
    .filter((e) => typeof e.entity_id === 'string')
    .map((e) => ({
      entityId: e.entity_id!,
      name: e.attributes?.friendly_name ?? e.entity_id!,
      domain: e.entity_id!.split('.')[0] ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- inline UI atoms (shared shape with the Hue plugin) ----------------------

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
const btnPrimary: React.CSSProperties = {
  ...input,
  cursor: 'pointer',
  background: '#534AB7',
  border: '1px solid #6B62D6',
  textAlign: 'center',
};
const btnGhost: React.CSSProperties = { ...input, cursor: 'pointer', width: 'auto', whiteSpace: 'nowrap' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 11, color: '#718096' }}>{label}</span>
      {children}
    </label>
  );
}
function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: '#718096' }}>{children}</div>;
}
