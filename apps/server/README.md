# @voxcomposer/server

The local, self-hosted Vox Composer backend — and, since it also serves the
built editor (see `index.ts`), the whole local install. Single-user, no cloud
required. This is the real production path for actually driving a physical
Vox Master; see [`../../docs/HOSTING_DECISION.md`](../../docs/HOSTING_DECISION.md)
for why (short version: a browser loaded over HTTPS — like the public
voxcomposer.app demo — can never open a `ws://` connection to a Master on
your LAN; loaded from here, over plain HTTP, it can).

It provides:

- **The editor itself** — `apps/web`'s built static bundle, served directly.
- **Project storage** — `.vox` shows in SQLite (a single file; swap to Postgres later for multi-user).
- **Audio transcoding** — MP3/OGG/M4A → WAV at a device's spec via ffmpeg, cached on local disk by
  `sourceHash + spec` so re-syncing an unchanged show never reconverts.
- **A mock Master** for local dev/testing without real hardware (same raw-WS
  Vox-Link protocol the real firmware speaks) — point the editor's Settings at
  a real Master's hostname/IP instead for an actual show.

## Run it

```bash
# from the repo root
pnpm --filter @voxcomposer/web build         # build the editor once
pnpm --filter @voxcomposer/server db:push    # create the SQLite schema (first run)
pnpm --filter @voxcomposer/server dev        # http://localhost:8080 — editor + API
```

Or with Docker (includes ffmpeg, builds the editor into the image), from the repo root:

```bash
docker compose up -d --build
```

Then open `http://localhost:8080` (or `http://<this-host>:8080` from another
device on the same LAN) — that's the editor. Point **Settings → Master
Connection** at your real Master's hostname/IP to drive an actual show.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness + Vox-Link API version |
| GET | `/api/projects` | List projects (metadata) |
| GET | `/api/projects/:id` | Fetch a project + its `.vox` |
| POST | `/api/projects` | Create from `{ vox }` (validated) |
| PUT | `/api/projects/:id` | Replace a project's show |
| DELETE | `/api/projects/:id` | Delete |
| POST | `/api/transcode?hash=&sampleRate=&bitDepth=&channels=` | Raw audio body → WAV (cached) |

Socket.io events follow `packages/shared/src/protocol.ts`.

## Configuration

All optional — see [`.env.example`](../../.env.example). Defaults: port `8080`, SQLite at
`./dev.db`, cache in `.cache/audio`, `ffmpeg` on PATH.
