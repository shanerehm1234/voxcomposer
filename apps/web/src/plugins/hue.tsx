import { useEffect, useState } from 'react';
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
 * Philips Hue — drive rooms and scenes from a timeline clip via the LOCAL
 * bridge API (no cloud). Set up ONCE (auto-discover + press the link button),
 * then every clip just picks from *your* rooms and scenes. compileClip() bakes
 * a plain HTTP action into the .vox so the cue fires on the Master unattended.
 *
 * End-user shape:
 *   - Setup (Device manager): discover bridge → press button → paired forever.
 *   - Clip: pick a Scene (recall it) or a Room (on/off, brightness, colour, fade).
 *
 * The bridge is HTTP + sends no CORS headers, so all calls go through
 * api.sendHTTP, which relays via the Vox Master (on the LAN with the bridge).
 */

// --- config + clip model -----------------------------------------------------

interface HueConfig {
  bridgeIp: string;
  username: string; // the bridge API key from link-button pairing
}

function cfg(config: PluginConfig): HueConfig {
  return {
    bridgeIp: typeof config.bridgeIp === 'string' ? config.bridgeIp.trim() : '',
    username: typeof config.username === 'string' ? config.username.trim() : '',
  };
}

interface HueClipData {
  kind: 'scene' | 'group';
  sceneId: string;
  groupId: string; // '0' = all lights
  on: boolean;
  bri: number; // 1..254
  useColor: boolean;
  color: string; // #rrggbb
  transitionMs: number;
  sceneName?: string; // cached for the timeline summary
  groupName?: string;
}

function read(clip: VoxClip): HueClipData {
  const d = clip.data as Partial<HueClipData>;
  return {
    kind: d.kind === 'group' ? 'group' : 'scene',
    sceneId: d.sceneId ?? '',
    groupId: d.groupId ?? '0',
    on: d.on ?? true,
    bri: clamp(Math.round(d.bri ?? 254), 1, 254),
    useColor: d.useColor ?? false,
    color: d.color ?? '#ff0000',
    transitionMs: Math.max(0, Math.round(d.transitionMs ?? 400)),
    sceneName: d.sceneName,
    groupName: d.groupName,
  };
}

// --- the pure action builder (unit-tested) -----------------------------------

/**
 * Build the bridge HTTP call for a clip, or null if nothing actionable. Used
 * both live (onFrame) and baked (compileClip) so the two never drift.
 */
export function buildHueAction(d: HueClipData, c: HueConfig): BakedHttpAction | null {
  if (!c.bridgeIp || !c.username) return null;
  const base = `http://${c.bridgeIp}/api/${c.username}`;
  const transitiontime = Math.round(d.transitionMs / 100); // Hue uses deciseconds
  const json = (body: unknown, path: string): BakedHttpAction => ({
    kind: 'http',
    method: 'PUT',
    url: `${base}/${path}`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (d.kind === 'scene') {
    if (!d.sceneId) return null;
    // Recall a scene by writing it to the "all lights" group action.
    return json({ scene: d.sceneId, transitiontime }, 'groups/0/action');
  }

  const body: Record<string, unknown> = { on: d.on, transitiontime };
  if (d.on) {
    body.bri = d.bri;
    if (d.useColor) {
      const { hue, sat } = hexToHueSat(d.color);
      body.hue = hue;
      body.sat = sat;
    }
  }
  return json(body, `groups/${d.groupId || '0'}/action`);
}

function isConfigured(config: PluginConfig): boolean {
  const c = cfg(config);
  return !!(c.bridgeIp && c.username);
}

// --- the plugin --------------------------------------------------------------

export const huePlugin: VoxPlugin = definePlugin({
  id: 'com.rehmlights.hue',
  name: 'Philips Hue',
  version: '1.0.0',
  author: 'rehmlights',
  description: 'Recall a Hue scene or set a room (colour, brightness, on/off) at a cue.',
  trackType: 'hue',
  permissions: ['network'],
  color: '#F5A623',

  isConfigured,

  summarizeClip(clip) {
    const d = read(clip);
    if (d.kind === 'scene') return d.sceneId ? `Hue scene → ${d.sceneName ?? d.sceneId}` : 'Hue — pick a scene';
    const where = d.groupId === '0' ? 'all lights' : (d.groupName ?? `room ${d.groupId}`);
    if (!d.on) return `Hue ${where} → off`;
    return d.useColor ? `Hue ${where} → ${d.color} ${pct(d.bri)}` : `Hue ${where} → ${pct(d.bri)}`;
  },

  compileClip(clip, config) {
    return buildHueAction(read(clip), cfg(config));
  },

  onFrame(_ts, clip, api) {
    const action = buildHueAction(read(clip), cfg(api.getConfig()));
    if (!action) return;
    void api
      .sendHTTP(action.url, { method: action.method, headers: action.headers, body: action.body })
      .then((res) => {
        if (!res.ok) api.log(`Hue → HTTP ${res.status}`);
      })
      .catch((err) => api.log('Hue request failed:', err));
  },

  renderSetup(ctx) {
    return <HueSetup ctx={ctx} />;
  },

  renderInspector(clip, ctx) {
    return <HueInspector clip={clip} onChange={ctx.onChange} config={ctx.config} api={ctx.api} />;
  },
});

// --- setup UI: discover + link-button pairing --------------------------------

function HueSetup({ ctx }: { ctx: SetupContext }) {
  const c = cfg(ctx.config);
  const [ip, setIp] = useState(c.bridgeIp);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const discover = async () => {
    setStatus('looking for a bridge…');
    try {
      // Hue's N-UPnP discovery returns bridges on this network.
      const res = await ctx.api.sendHTTP('https://discovery.meethue.com/');
      const list = (await res.json()) as { internalipaddress?: string }[];
      const found = list?.[0]?.internalipaddress;
      if (found) {
        setIp(found);
        setStatus(`found a bridge at ${found}`);
      } else setStatus('no bridge found — enter the IP manually');
    } catch {
      setStatus('discovery failed — enter the bridge IP manually');
    }
  };

  const pair = async () => {
    if (!ip.trim()) return setStatus('enter the bridge IP first');
    setBusy(true);
    setStatus('press the round button on the bridge, then this will pair…');
    // Poll for ~30s; success only comes after the link button is pressed.
    for (let i = 0; i < 15; i++) {
      try {
        const res = await ctx.api.sendHTTP(`http://${ip.trim()}/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ devicetype: 'voxcomposer#haunt' }),
        });
        const body = (await res.json()) as {
          success?: { username: string };
          error?: { type: number };
        }[];
        const username = body?.[0]?.success?.username;
        if (username) {
          ctx.save({ bridgeIp: ip.trim(), username });
          setStatus('paired ✓');
          setBusy(false);
          return;
        }
      } catch {
        /* bridge unreachable — keep trying briefly */
      }
      await sleep(2000);
    }
    setBusy(false);
    setStatus('timed out — press the button on the bridge and try again');
  };

  if (isConfigured(ctx.config)) {
    return (
      <div style={col}>
        <div style={{ fontSize: 13, color: '#5DCAA5' }}>✓ Paired to bridge {c.bridgeIp}</div>
        <button style={btnGhost} onClick={() => ctx.save({ bridgeIp: '', username: '' })}>
          Forget bridge
        </button>
      </div>
    );
  }

  return (
    <div style={col}>
      <div style={{ fontSize: 12, color: '#94A3B8' }}>
        1. Find your bridge, 2. press its round button, 3. click Pair. One time only.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={input}
          value={ip}
          placeholder="192.168.1.50"
          onChange={(e) => setIp(e.target.value)}
        />
        <button style={btnGhost} onClick={discover}>
          Discover
        </button>
      </div>
      <button style={btnPrimary} onClick={pair} disabled={busy}>
        {busy ? 'Waiting for button…' : 'Pair'}
      </button>
      {status && <div style={{ fontSize: 12, color: '#94A3B8' }}>{status}</div>}
    </div>
  );
}

// --- inspector: pick a scene or a room ---------------------------------------

interface NamedItem {
  id: string;
  name: string;
}

function HueInspector({
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
  const [scenes, setScenes] = useState<NamedItem[]>([]);
  const [groups, setGroups] = useState<NamedItem[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');

  useEffect(() => {
    if (!c.bridgeIp || !c.username) return;
    let alive = true;
    setLoadState('loading');
    const base = `http://${c.bridgeIp}/api/${c.username}`;
    Promise.all([
      api.sendHTTP(`${base}/scenes`).then((r) => r.json()),
      api.sendHTTP(`${base}/groups`).then((r) => r.json()),
    ])
      .then(([sc, gr]) => {
        if (!alive) return;
        setScenes(toNamed(sc));
        setGroups(toNamed(gr));
        setLoadState('ok');
      })
      .catch(() => alive && setLoadState('err'));
    return () => {
      alive = false;
    };
  }, [c.bridgeIp, c.username, api]);

  if (!isConfigured(config)) {
    return (
      <div style={{ fontSize: 13, color: '#94A3B8' }}>
        Set up Philips Hue in Settings → Plugins first (pair with your bridge).
      </div>
    );
  }

  return (
    <div style={col}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Tab active={d.kind === 'scene'} onClick={() => onChange({ kind: 'scene' })}>
          Scene
        </Tab>
        <Tab active={d.kind === 'group'} onClick={() => onChange({ kind: 'group' })}>
          Room
        </Tab>
      </div>

      {loadState === 'loading' && <Muted>Loading your rooms & scenes…</Muted>}
      {loadState === 'err' && <Muted>Couldn’t reach the bridge — is the Master online?</Muted>}

      {d.kind === 'scene' ? (
        <Field label="Scene">
          <select
            style={input}
            value={d.sceneId}
            onChange={(e) => {
              const s = scenes.find((x) => x.id === e.target.value);
              onChange({ sceneId: e.target.value, sceneName: s?.name });
            }}
          >
            <option value="">— pick a scene —</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <Field label="Room / group">
            <select
              style={input}
              value={d.groupId}
              onChange={(e) => {
                const g = groups.find((x) => x.id === e.target.value);
                onChange({ groupId: e.target.value, groupName: g?.name });
              }}
            >
              <option value="0">All lights</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <label style={checkRow}>
            <input type="checkbox" checked={d.on} onChange={(e) => onChange({ on: e.target.checked })} />
            On
          </label>
          {d.on && (
            <>
              <Field label={`Brightness — ${pct(d.bri)}`}>
                <input
                  type="range"
                  min={1}
                  max={254}
                  value={d.bri}
                  onChange={(e) => onChange({ bri: Number(e.target.value) })}
                />
              </Field>
              <label style={checkRow}>
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
            </>
          )}
        </>
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
}

// --- helpers -----------------------------------------------------------------

/** Hue returns `{ "<id>": { name, ... }, ... }` for /scenes and /groups. */
function toNamed(map: unknown): NamedItem[] {
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map as Record<string, { name?: string }>)
    .map(([id, v]) => ({ id, name: v?.name ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
function pct(bri: number): string {
  return `${Math.round((bri / 254) * 100)}%`;
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** #rrggbb → Hue's hue (0..65535) + sat (0..254). */
export function hexToHueSat(hex: string): { hue: number; sat: number } {
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

// --- inline UI atoms ---------------------------------------------------------

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
const checkRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: '#E2E8F0',
};

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
function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...input,
        cursor: 'pointer',
        flex: 1,
        textAlign: 'center',
        background: active ? '#534AB7' : '#0F1117',
        borderColor: active ? '#6B62D6' : '#2D3748',
      }}
    >
      {children}
    </button>
  );
}
