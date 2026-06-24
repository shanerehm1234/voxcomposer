# Contributing to Vox Composer

Thanks for helping build Vox Composer! This guide covers local development, code style, and how to
write plugins.

## Development setup

Requires **Node 22+** and **pnpm 9+** (via `corepack enable`).

```bash
pnpm install
pnpm dev          # web app on http://localhost:5173
```

Before opening a PR, make sure these pass (CI runs them on every PR):

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Project layout

- `apps/web` — the React + Canvas editor. The timeline is the heart of the app.
- `packages/shared` — the `.vox` schema (zod-first) and the Vox-Link protocol. **Change data shapes
  here**, and add a migration when the format version bumps.
- `packages/plugin-sdk` — the public plugin API.
- `examples/plugins` — reference plugins.

A few architecture rules worth knowing (full notes in [CLAUDE.md](CLAUDE.md)):

- The timeline is a **custom Canvas renderer**, not a drag-and-drop library — frame-accurate media
  sync needs it. Per-frame state lives in refs; React never re-renders at frame rate.
- The palette is single-sourced in `apps/web/src/styles/palette.ts` — both Tailwind and the canvas
  import it. **Never hard-code hex** in components or the renderer.
- The wireless protocol is always called **"Vox-Link"** in user-facing strings.
- The `.vox` format is **human-readable JSON** — no binary, no minification.

## Code style

- TypeScript, strict mode. Prefer `z.infer` types from the shared schema over hand-written ones.
- Formatting is handled by Prettier (`pnpm format`); config is in `.prettierrc.json`
  (single quotes, trailing commas, 100-col).
- Keep functions small and the comment density matching the surrounding code.

## Writing a plugin

Plugins extend Vox Composer with a custom **track type**. They run trusted, in-process, and may
return real React for their inspector UI.

```ts
import { definePlugin } from '@voxcomposer/plugin-sdk';

export default definePlugin({
  id: 'com.example.thing',      // reverse-DNS id
  name: 'Thing',
  version: '1.0.0',
  author: 'you',
  description: 'What it does',
  trackType: 'thing',           // clips with this type route to your plugin
  permissions: ['network'],     // approved by the user at install
  color: '#7AA2F7',

  // One-line label drawn on the clip in the canvas timeline.
  summarizeClip: (clip) => `Thing ${clip.data.value}`,

  // Fired each preview/playback frame while a clip on your track is active.
  onFrame: (timestamp, clip, api) => {
    void api.sendHTTP(`http://${clip.data.host}/go`);
  },

  // Optional React UI in the clip inspector.
  renderInspector: (clip, { onChange }) => (
    <input value={clip.data.host ?? ''} onChange={(e) => onChange({ host: e.target.value })} />
  ),
});
```

### The plugin API

The `VoxPluginAPI` passed to your plugin is **permission-gated** — declare what you need in
`permissions` and the host enforces it. Note that the browser can't open raw sockets, so
`sendUDP` / `sendOSC` / `sendMQTT` are **relayed through the Vox Master**, while `sendHTTP` can go
direct when CORS allows:

| Method | Permission | Notes |
| --- | --- | --- |
| `sendUDP/sendOSC/sendMQTT` | `network` | relayed via the Master (async) |
| `sendHTTP` | `network` | direct from the browser, else relayed |
| `getCurrentShow` | `show-read` | read-only snapshot |
| `getDevice` | `devices` | look up a paired remote |
| `emitToMaster` | `master` | custom Master events |
| `log` | — | writes to the Developer-mode console |

See [`examples/plugins/generic-http`](examples/plugins/generic-http) for a working
reference. Note: VoxPixel/WLED remotes are *not* a good fit for a plugin — `pixel`
is a native track/clip type the Vox Master routes by device ID (see
`docs/PAIRING.md` in the VoxMaster repo for why device identity/trust lives on
the Master, not in a plugin talking to a device's IP directly).

## Submitting changes

1. Branch off `main`.
2. Keep PRs focused; include a short description of the change and why.
3. Make sure `pnpm typecheck && pnpm test && pnpm build` are green.
4. For plugin submissions, include your `definePlugin` module and a one-paragraph description of
   what it integrates with.
