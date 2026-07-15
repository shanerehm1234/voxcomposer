# Writing a Vox Composer plugin

This guide is for anyone — human **or AI assistant** — building a plugin that
adds a new kind of device to Vox Composer. If you follow it end to end you'll
have a working, type-checked plugin that shows up as a device, drags onto the
timeline, and fires real-world side effects on cue.

Two complete, copy-me examples live next to this guide:

- [`examples/plugins/home-assistant`](../examples/plugins/home-assistant) — call
  a Home Assistant service (lights, switches, scenes, scripts).
- [`examples/plugins/philips-hue`](../examples/plugins/philips-hue) — set a
  Philips Hue light/group over the local bridge.

The built-in plugins in [`apps/web/src/plugins/builtins.tsx`](../apps/web/src/plugins/builtins.tsx)
(Generic HTTP / UDP) use the **exact same public SDK**, so they're also good
references.

---

## 1. The mental model

Vox Composer is a timeline. Every **track** has a `type`, and every **clip** on
it carries a `type` + a `data` payload. A plugin **claims one custom track
type** and owns everything about it:

```
   your plugin  ──owns──▶  trackType "hue"
                              │
   a "hue" track ────────────┘   clips of type "hue"
        └── clip.data = { bridgeIp, id, on, bri, color, ... }   ← you define this
```

There are **two ways your clip fires**, and a real integration wants both:

- **Live preview** (Composer open) → the host calls your **`onFrame`** hook.
- **Unattended** (a scheduled show running on the Vox Master, no laptop) → the
  Master can't run your JS, so it replays the plain action your **`compileClip`**
  baked into the show. Implement `compileClip` or your cue won't fire on the
  haunt's nightly run.

You also provide:

- **`summarizeClip`** — the one-line label drawn on the clip in the timeline.
- **`renderInspector`** — a small React form shown when the clip is selected, so
  the user can edit `clip.data`.
- **`renderSetup` / `isConfigured`** — one-time pairing/token setup, stored in
  global plugin config (not per clip).

That's the whole contract. You never touch the canvas, the scheduler, or the
network socket directly — the host does that for you.

> **Why a plugin can't just `fetch()` a UDP socket:** browsers can't open raw
> sockets. UDP/OSC/MQTT are **relayed through the Vox Master** over the app's
> connection. HTTP goes direct from the browser when CORS allows, and otherwise
> also relays through the Master. You call one API (`api.sendUDP`, `api.sendHTTP`,
> …) and the host figures out the transport.

---

## 2. Project layout

A plugin is a tiny TypeScript package:

```
my-plugin/
├── package.json
├── tsconfig.json
└── src/
    └── index.tsx      ← .tsx if you use JSX in renderInspector, else .ts
```

**`package.json`** (copy this, change the name/description):

```json
{
  "name": "@you/plugin-my-thing",
  "version": "0.1.0",
  "type": "module",
  "description": "One-line description shown in the install prompt.",
  "license": "MIT",
  "author": "you",
  "main": "./src/index.tsx",
  "scripts": { "typecheck": "tsc -p tsconfig.json --noEmit" },
  "dependencies": {
    "@voxcomposer/plugin-sdk": "workspace:*",
    "@voxcomposer/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "@types/react": "^18.3.0"
  }
}
```

**`tsconfig.json`**:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "types": []
  },
  "include": ["src"]
}
```

> **Gotcha:** if your `index` file contains JSX (most do, for `renderInspector`),
> it **must** be `index.tsx`. TypeScript will not parse JSX inside a `.ts` file.
> Add `import type React from 'react';` at the top when you reference
> `React.CSSProperties` / `React.ReactNode`.

---

## 3. The plugin object

Author with `definePlugin(...)` — it's an identity function that gives you full
type-checking and inference:

```tsx
import type React from 'react';
import type { VoxClip } from '@voxcomposer/shared';
import { definePlugin } from '@voxcomposer/plugin-sdk';

export default definePlugin({
  // ---- manifest (shown in the install / permissions prompt) ----
  id: 'com.you.my-thing',      // reverse-DNS, globally unique
  name: 'My Thing',
  version: '0.1.0',
  author: 'you',
  description: 'What it does, in one line.',
  trackType: 'mything',        // your custom track type — must be unique
  permissions: ['network'],    // see §4
  color: '#7AA2F7',            // accent for your track + clips (optional)

  // ---- hooks (all optional except you'll want onFrame) ----
  onRegister(api) { /* one-time setup */ },
  summarizeClip(clip) { return 'label for the clip body'; },
  onFrame(timestamp, clip, api) { /* fire the side effect */ },
  renderInspector(clip, ctx) { return <YourForm .../>; },
});
```

### Manifest fields

| field | notes |
|---|---|
| `id` | Reverse-DNS, globally unique (`com.you.my-thing`). Must contain a dot. |
| `name` | Human name shown in the UI. |
| `version` | Semver string. |
| `author` | You / your org. |
| `description` | One line; shown in the install prompt. |
| `trackType` | The custom track-type id you own. **Must be unique** across all installed plugins — registration throws on a clash. |
| `permissions` | Array; the user approves these at install (see §4). |
| `color` | Optional hex accent for your track + clips. |

---

## 4. Permissions

Declare only what you need. The host **enforces** them — calling an API method
without its permission throws.

| permission | grants |
|---|---|
| `network` | `sendUDP` / `sendOSC` / `sendMQTT` / `sendHTTP` |
| `devices` | `getDevice(id)` — read a paired device's info |
| `show-read` | `getCurrentShow()` |
| `show-write` | edit clips on your own track |
| `master` | `emitToMaster(event, payload)` — custom Master events |

Most integrations (HTTP/UDP gear, smart lights, home automation) need only
`['network']`.

---

## 5. Lifecycle hooks

### `onFrame(timestamp, clip, api)` — the important one

Called on every preview/playback frame **while a clip on your track is active**.
The host de-dupes: you get called repeatedly, so make the side effect
**idempotent** (send the same command again = same result). Read your config out
of `clip.data`, bail if it's incomplete, and fire:

```tsx
onFrame(_ts, clip, api) {
  const d = clip.data as { url?: string };
  if (!d.url) return;
  void api.sendHTTP(d.url, { method: 'POST' })
    .catch((e) => api.log('request failed', e));
},
```

Always `.catch()` network calls and report via `api.log` — a throw here
shouldn't break playback.

### `summarizeClip(clip)` — the timeline label

Return a short string drawn on the clip body. Keep it scannable:

```tsx
summarizeClip(clip) {
  const d = clip.data as { id?: string; color?: string };
  return d.id ? `Hue ${d.id} → ${d.color}` : 'Hue — set light';
},
```

### `renderInspector(clip, ctx)` — the edit form

Return **real React**. Read current values from `clip.data`; commit changes with
`ctx.onChange(partial)` — it merges into `clip.data` and is **undoable**. You get
a fresh render on every change, so it's a normal controlled form:

```tsx
renderInspector(clip, { onChange }) {
  const url = (clip.data as { url?: string }).url ?? '';
  return (
    <label>
      URL
      <input value={url} onChange={(e) => onChange({ url: e.target.value })} />
    </label>
  );
},
```

`onChange` takes a **partial** — only the keys you pass are updated.

### `onRegister(api)` — optional one-time setup

Runs once when the plugin loads. Rarely needed.

### `compileClip(clip, config)` — run on the Master, unattended ⭐

`onFrame` only fires while the Composer is driving preview/playback. A haunt runs
its shows **from the Vox Master with no laptop present**, and the Master can't run
your JavaScript. So for a cue to fire on a scheduled show, bake it into a plain,
serializable action the Master replays at cue time:

```ts
compileClip(clip, config) {
  const d = clip.data as { url?: string };
  if (!d.url) return null;
  return {
    kind: 'http',
    method: 'POST',
    url: d.url,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hello: 'world' }),
  }; // a BakedHttpAction — pure data, no closures
}
```

When the show is sent to the Master, the host calls `compileClip` for every clip
on your track and embeds the result. **If your integration should work on an
unattended show (almost all do), implement `compileClip`.** Keep `onFrame` too so
live preview still fires instantly — build both from one shared helper so they
never drift (see the Hue/HA built-ins for the pattern).

### `renderSetup(ctx)` + `isConfigured(config)` — one-time setup ⭐

Credentials and pairing are entered **once**, globally — never per clip. Store
them in plugin config (`ctx.save(patch)` / `api.getConfig()`), not `clip.data`:

```tsx
renderSetup(ctx) {                       // shown on your card in Settings → Plugins
  return (
    <button onClick={async () => {
      const res = await ctx.api.sendHTTP('http://bridge/api', { method: 'POST', body: '...' });
      const key = (await res.json())[0]?.success?.username;
      if (key) ctx.save({ key });         // persisted globally, forever
    }}>Pair</button>
  );
},
isConfigured(config) { return !!config.key; },  // drives the "Needs setup" badge
```

Then `renderInspector` and `compileClip` read `config` (or `api.getConfig()`) for
the credentials and fetch live lists (rooms, entities) via `ctx.api.sendHTTP` —
so every clip is just a dropdown of the user's own stuff. This is the difference
between a developer toy and an end-user integration.

---

## 6. The API surface (`VoxPluginAPI`)

```ts
sendUDP(host, port, data: Uint8Array): Promise<void>   // needs 'network'
sendOSC(host, port, address, args): Promise<void>      // needs 'network'
sendMQTT(broker, topic, payload): Promise<void>        // needs 'network'
sendHTTP(url, init?): Promise<Response>                 // needs 'network'
getCurrentShow(): VoxShow                               // needs 'show-read'
getDevice(deviceId): VoxDevice | undefined             // needs 'devices'
emitToMaster(event, payload): void                     // needs 'master'
getConfig(): PluginConfig                               // your persisted global config
setConfig(patch): void                                  // merge + persist config
log(...args): void                                     // always available
```

**HTTP + CORS:** `sendHTTP` runs from the browser when the target sends CORS
headers; when it doesn't (e.g. a Philips Hue bridge, some local gear), the host
transparently relays it through the Vox Master, which is on the same LAN as your
device. You don't have to detect this — just call `sendHTTP`.

**`api.log`** writes to the plugin console shown in Developer mode — your primary
debugging tool.

---

## 7. Appearing as a device + dragging onto the timeline

Once your plugin is installed, its track type is available in the app:

1. **Add a device** → choose **"Custom / plugin"** and pick your plugin. It then
   appears in the device sidebar alongside the Vox remotes.
2. **Drag it onto the timeline** to create a track of your `trackType`.
3. **Add a clip** on that track, select it, and your `renderInspector` form
   appears in the inspector. Edit it like any other clip.
4. On play/preview, your `onFrame` fires.

You don't write any of that wiring — claiming the `trackType` is what hooks you
into all of it.

---

## 8. Test it

From the repo root:

```bash
pnpm --filter @you/plugin-my-thing typecheck   # must pass
pnpm dev                                        # run the app and try it live
```

A green typecheck is the bar for "it'll load". Then exercise it in the running
app: add the device, drop a clip, fill in the inspector, hit play, and watch
`api.log` output in Developer mode.

---

## 9. Publish it

Plugins live in their own git repo so anyone can install them:

1. Put the package (the three files from §2) in a new repo. Name it
   **`vox-plugin-<slug>`** (e.g. `vox-plugin-hue`) and add the GitHub topic
   **`vox-plugin`** so the in-app browser and other authors can find it.
2. Tag a release (`v0.1.0`).
3. Users install by pointing Vox Composer's plugin loader at your repo/bundle
   (Settings → Plugins), approve the permissions prompt, and it registers.

Use the [plugin submission template](../.github/ISSUE_TEMPLATE/plugin_submission.md)
if you want it listed in the community directory.

---

## 10. Checklist for AI authors

If you're an assistant generating a plugin from a device's API docs, produce
**exactly** this and nothing more:

- [ ] `package.json`, `tsconfig.json`, `src/index.tsx` (§2) — names/ids changed.
- [ ] `import type React from 'react';` at the top (you use JSX).
- [ ] A `definePlugin({...})` **default export** with a unique reverse-DNS `id`
      and a unique `trackType`.
- [ ] The **minimum** `permissions` (usually `['network']`).
- [ ] A typed `interface XxxClipData` for `clip.data`, plus a `read(clip)` helper
      that fills in safe defaults for every field.
- [ ] A shared `buildAction(data, config)` helper returning a `BakedHttpAction`
      or `null`, used by **both** `onFrame` (live) and `compileClip` (unattended
      Master) so they never drift.
- [ ] `onFrame` that reads the config, **returns early if incomplete**, fires via
      `api.send*`, and `.catch()`es with `api.log`.
- [ ] `compileClip(clip, config)` returning that same baked action — **required**
      for the cue to fire on an unattended, Master-scheduled show.
- [ ] If the device needs credentials/pairing: `renderSetup` + `isConfigured`,
      storing config via `ctx.save` / `api.setConfig` (never in `clip.data`).
- [ ] `summarizeClip` returning a short, scannable label.
- [ ] `renderInspector` — a controlled form calling `onChange(partial)`, reading
      live lists (rooms/entities) from `ctx.api.sendHTTP` where possible.
- [ ] `pnpm --filter <name> typecheck` passes clean.

Do **not** import Node APIs, open sockets directly, add build tooling beyond
`tsc`, or reach outside `clip.data` for state. Model your file on
`examples/plugins/home-assistant/src/index.tsx` — it hits every one of these
points.
```
