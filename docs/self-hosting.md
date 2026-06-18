# Self-hosting Vox Composer

Vox Composer is designed to run on your own hardware with minimal cloud dependency. The editor is a
static single-page app and needs **no backend** for the full editing workflow — show design, audio
import + preview, `.vox` export/import, and offline use all run entirely in the browser.

## Option 1 — static editor only (recommended to start)

This is exactly how the public demo is hosted.

```bash
pnpm install
pnpm --filter @voxcomposer/web build
# serve apps/web/dist/ with any static web server:
npx serve apps/web/dist
#   …or copy dist/ into nginx / Caddy / Apache / Netlify / Cloudflare Pages
```

Because the app uses **hash-based routing** and a **relative asset base** (`base: './'` in
`vite.config.ts`), `dist/` works under any path — a domain root or a subfolder like
`/voxcomposer/demo/` — with no server rewrite rules.

What you get with the static build:

- Full timeline editing, multi-track, multi-select, undo/redo
- Audio import (`.mp3/.wav/.ogg/.m4a`) with waveforms and local preview playback
- `.vox` export/import and full **show package** (`.zip`) export/import
- Installable PWA with offline support and IndexedDB persistence of your shows and audio

> **Media stays local.** Imported audio lives in the browser (IndexedDB) and on your local
> network's remotes (SD cards). Nothing is uploaded to a server in this mode.

## Option 2 — full stack (planned)

The optional backend (`apps/server`) adds user accounts, cloud project sync, live preview over
Socket.io, file sync to remotes, and **server-side MP3 → WAV transcoding** (via ffmpeg) for remotes
whose firmware only plays WAV. It is not built yet; this section documents the intended setup so the
configuration is stable from day one.

A single `docker-compose.yml` will spin up the full stack:

- `web` — the static editor
- `server` — Node + Express + Prisma + Socket.io
- `postgres` — project metadata (never media)
- `minio` — S3-compatible object storage for the small `.vox` JSON and transcoded WAV cache
- **ffmpeg** — bundled in the server image for transcoding (it is a system binary, not an npm
  package, so Railway/most Node hosts need a Docker layer or buildpack that includes it)

All cloud services are optional and configured via environment variables (see
[`.env.example`](../.env.example)):

- **No S3 configured** → falls back to local-disk storage for the `.vox` JSON.
- **No auth configured** → runs in single-user mode with no login.

Audio is **never** stored on the VPS disk — always S3-compatible object storage — keeping the VPS
stateless and your bandwidth bills low.

## Connecting to a Vox Master

Live preview and file sync talk to a **Vox Master** station on your local Wi-Fi over Socket.io. Set
its IP in **Settings → Master Connection**. This is purely local — no internet required — and the
Master relays timestamps and commands to the remotes over **Vox-Link**.
