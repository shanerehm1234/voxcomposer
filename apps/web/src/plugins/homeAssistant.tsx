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
  dataJson?: string; // optional extra service params, e.g. {"filename":"/config/www/x.jpg"}
}

function read(clip: VoxClip): HaClipData {
  const d = clip.data as Partial<HaClipData>;
  return {
    domain: d.domain ?? '',
    service: d.service ?? '',
    entityId: d.entityId ?? '',
    entityName: d.entityName,
    dataJson: d.dataJson,
  };
}

/** Parse the optional extra-params JSON; returns {} if empty/invalid. */
function parseExtra(dataJson?: string): Record<string, unknown> {
  if (!dataJson || !dataJson.trim()) return {};
  try {
    const v = JSON.parse(dataJson);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// --- the pure action builder (unit-tested) -----------------------------------

/** Build the HA REST call for a clip, or null if incomplete. */
export function buildHaAction(d: HaClipData, c: HaConfig): BakedHttpAction | null {
  if (!c.baseUrl || !c.token || !d.domain || !d.service) return null;
  const body = {
    ...(d.entityId ? { entity_id: d.entityId } : {}),
    ...parseExtra(d.dataJson), // extra params (e.g. camera.snapshot filename) win
  };
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

  const [filter, setFilter] = useState('');

  // The entity you're targeting drives everything: filter the (possibly huge)
  // entity list by a search box, then offer only the services that make sense
  // for that entity's domain (plus the universal homeassistant.* ones).
  const picked = entities.find((e) => e.entityId === d.entityId);
  const entityChoices = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? entities.filter((e) => e.name.toLowerCase().includes(q) || e.entityId.toLowerCase().includes(q))
      : entities;
    return list.slice(0, 200); // keep the dropdown sane on big installs
  }, [entities, filter]);

  const serviceChoices = useMemo(() => {
    if (!picked) return services;
    return services.filter(
      (s) => s.startsWith(`${picked.domain}.`) || s.startsWith('homeassistant.'),
    );
  }, [services, picked]);

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

      <Field label={`Entity${entities.length ? ` (${entities.length})` : ''}`}>
        <input
          style={input}
          value={filter}
          placeholder="search… e.g. porch, lock, front door"
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          style={{ ...input, marginTop: 6 }}
          value={d.entityId}
          onChange={(e) => {
            const ent = entities.find((x) => x.entityId === e.target.value);
            // Reset the action when the domain changes so you can't keep a
            // stale, invalid service (a big source of HA 400/500 errors).
            const domainChanged = ent && d.domain && ent.domain !== d.domain;
            onChange({
              entityId: e.target.value,
              entityName: ent?.name,
              ...(domainChanged ? { domain: '', service: '' } : {}),
            });
          }}
        >
          <option value="">— pick an entity —</option>
          {entityChoices.map((ent) => (
            <option key={ent.entityId} value={ent.entityId}>
              {ent.name} — {ent.entityId}
            </option>
          ))}
        </select>
      </Field>

      <Field label={picked ? `Action for ${picked.name}` : 'Action (pick an entity first)'}>
        <select
          style={input}
          value={d.domain && d.service ? `${d.domain}.${d.service}` : ''}
          onChange={(e) => {
            const [domain, ...rest] = e.target.value.split('.');
            onChange({ domain: domain ?? '', service: rest.join('.') });
          }}
        >
          <option value="">— pick an action —</option>
          {serviceChoices.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Extra data (optional JSON)">
        <input
          style={input}
          value={d.dataJson ?? ''}
          placeholder='e.g. {"brightness_pct": 60} or {"filename": "/config/www/snap.jpg"}'
          onChange={(e) => onChange({ dataJson: e.target.value })}
        />
        {d.dataJson && d.dataJson.trim() && Object.keys(parseExtra(d.dataJson)).length === 0 && (
          <span style={{ fontSize: 11, color: '#E0794B' }}>not valid JSON — will be ignored</span>
        )}
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
