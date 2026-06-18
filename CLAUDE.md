# Vox Composer

Browser-based PWA for designing and playing back synchronized animatronic shows for haunted
attractions, controlling the VOX ecosystem of wireless remotes. Open source (MIT).
Repo: https://github.com/rehmlights/voxcomposer · App: voxcomposer.app · Docs: voxcomposer.com

## Monorepo layout (pnpm workspaces)

- `apps/web` — React 18 + TS + Vite + Tailwind PWA frontend. The timeline is the heart of the app.
- `apps/server` — Node + Express + Prisma + Socket.io backend (not built yet).
- `packages/shared` — the `.vox` schema, protocol, and migrations. **Source of truth for data shapes.**
- `packages/plugin-sdk` — plugin SDK published to npm (not built yet).
- `examples/plugins/` — example plugins.

Commands (run from repo root): `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`.
pnpm is installed at `~/.local/bin` (via corepack; system `/usr/bin` is not writable).

## Architecture decisions (locked)

- **pnpm workspaces**, not npm — strict dep isolation matters for publishing `plugin-sdk`.
- **The timeline is a custom HTML5 Canvas renderer — NOT a drag-and-drop library.** Frame-accurate
  media sync requires it. If tempted to reach for `react-timeline-editor` or similar: don't.
- **`.vox` is zod-first**: schemas in `packages/shared/src/vox/*` define both runtime validation and
  the TS types (`z.infer`). One source of truth. Import always goes through `loadShow()` so older
  files auto-migrate via the `MIGRATIONS` chain.
- **Plugins run trusted in-process** (not iframe-sandboxed). They may return real React for clip /
  inspector rendering. BUT the browser cannot open raw sockets: `sendUDP/sendOSC/sendMQTT` in the
  plugin API are **relay requests to the Vox Master** over the Socket.io connection, not direct I/O.
- **Palette is single-sourced** in `apps/web/src/styles/palette.ts`. Tailwind imports it; the canvas
  renderer imports it. Never hard-code hex in components or the renderer.

## Hard product constraints (do not violate)

- **Never say "ESP-NOW" or name the radio in any user-facing string.** The wireless protocol is
  always called **"Vox-Link"**.
- **Audio files are NEVER stored on the VPS disk** — always S3-compatible object storage. The VPS
  stays stateless. (Local-disk fallback only for self-hosting when no S3 is configured.)
- **Never stream audio over Vox-Link.** Files are pre-synced to remotes' SD cards; only timestamps
  and commands go wireless.
- **The app must work fully offline after first load.** No internet-required features in the core
  editing workflow. Cloud sync / device connection are additive, never load-bearing for editing.
- **`.vox` files are human-readable JSON** — no binary, no minification.
- Targets: Lighthouse 90+ perf / 100 a11y / 100 best-practices. Timeline is desktop-first; settings,
  device status, and show triggering must work on mobile.

## Timeline internals (apps/web/src/timeline)

- `viewport.ts` — the ONLY place ms↔px conversion lives (`msToX`/`xToMs`, `zoomAt`, `panByPx`).
- `ruler.ts` — nice-interval tick selection + `MM:SS.mmm` timecode formatting.
- `render.ts` — pure draw functions (grid, lanes, clips, headers, ruler, playhead). No React.
- `Timeline.tsx` — owns the canvas, DPR scaling, a dirty-flagged rAF loop, pan/zoom/scrub/play.
  Per-frame state (playhead, viewport-during-drag) lives in refs; React never re-renders at frame
  rate — only low-frequency chrome (time readout) uses React state.

Per-track-type clip colours (from `palette.ts > TRACK_COLORS`): audio = orange-red, dmx = teal,
relay = amber, servo/neck = purple, plugin = neutral.

## Build order (from the brief)

Done: scaffold · shared types · timeline canvas · full app shell · clip select/drag/resize/snap/
delete/undo · editable clip inspector · real audio import (drag-drop) + waveform + local preview
playback · `.vox` export/import (+ migration via loadShow) · IndexedDB persistence (show + audio
blobs, autosave, restore, reset) · PWA (manifest + Workbox SW, installable/offline) · Devices +
Media + Settings tabs (hash-routed) · duplicate/copy/paste clips + context menu + shortcuts ·
marquee + shift-click multi-select (group move) · double-click empty lane to create dmx/relay/
servo/plugin clips · editable neck-motion presets · track rename/delete (right-click header) ·
plugin system: `@voxcomposer/plugin-sdk` + in-app host (registry, permission-gated API) + built-in
WLED/Generic-HTTP/Generic-UDP, surfaced in Settings + rendered on the timeline + custom inspectors ·
MP3/OGG/M4A import (decode in-browser) with `sourceFormat`/`sourceHash` + device `supportsFormats`/
`audioSpec` + format badges (server WAV transcode still TODO) · mobile-responsive chrome · a11y pass
(focus-visible, ARIA) + "?" shortcuts overlay · open-source docs (README/LICENSE/CONTRIBUTING) + CI.
Demo data in `apps/web/src/demo/demoData.ts`. Audio assets cached in `apps/web/src/audio/registry.ts`
(module singleton, keyed by clip id) + persisted in `apps/web/src/storage/db.ts`. Plugin host in
`apps/web/src/plugins/`. Git: github.com/shanerehm1234/voxcomposer (SSH origin); deploy via
`scripts/deploy-demo.sh`.
Next: backend/S3/auth → live preview (Socket.io) → file sync + server-side ffmpeg WAV transcode →
servo keyframe editor → device/track creation UI in Devices tab → polish.

Media stays OFF the server (Shane's call, to avoid bandwidth bills): audio lives in the browser
(IndexedDB/object URLs) + on the local network (Master → SD cards). Server only ever stores the
small `.vox` JSON. S3 is opt-in cloud project sync, off by default.

**Jaw sync is NOT done in the composer.** The OcularVox skull boards run their own onboard FFT on
the audio to move the mouth. The composer's only audio job is to play the right file on cue. Do not
build jaw-envelope/RMS analysis here; `jawSync`/"FFT auto" is just a flag telling the board to do it.

**Audio formats — MP3 in, WAV out.** Accept `.mp3/.wav/.ogg/.m4a` as first-class import (most assets
are MP3). The browser decodes all of them via `decodeAudioData` for the waveform/preview; the
original is stored as-is, never re-encoded client-side. The Ocular Vox boards can't decode MP3 in
real time, so at **sync time** the server transcodes to WAV per the target `VoxDevice.audioSpec`
(e.g. 22.05 kHz / 16-bit / mono) using **ffmpeg**, caching output in S3 keyed by
`sourceHash + targetSpec` (clip carries `sourceFormat` + `sourceHash`). `VoxDevice.supportsFormats`
(default `['wav']`) gates conversion — a future firmware reporting `['wav','mp3']` skips it
(non-breaking). Conversion is server-side only (not built yet); client pieces (accept/decode,
format detect, hashing, capability flags, UI badges) are done. Add ffmpeg to docker-compose +
self-hosting docs when the server lands.

Live demo deploys to nginx via the mounted SMB share at
`/run/user/1000/gvfs/smb-share:server=192.168.1.190,share=appdata/binhex-nginx/nginx/html/voxcomposerapp/demo`
→ public at https://voxcomposer.app/demo/ (Cloudflare). Build needs Vite `base: './'` (subpath).
