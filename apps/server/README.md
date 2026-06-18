# @voxcomposer/server

The local, self-hosted Vox Composer backend. Single-user, no cloud required.

It provides:

- **Project storage** — `.vox` shows in SQLite (a single file; swap to Postgres later for multi-user).
- **Audio transcoding** — MP3/OGG/M4A → WAV at a device's spec via ffmpeg, cached on local disk by
  `sourceHash + spec` so re-syncing an unchanged show never reconverts.
- **Live-preview relay** — Socket.io carrying the Vox-Link preview protocol to a Vox Master (a mock
  Master responds today, until the real device interface is wired).

## Run it

```bash
# from the repo root
pnpm --filter @voxcomposer/server db:push   # create the SQLite schema (first run)
pnpm --filter @voxcomposer/server dev        # http://localhost:8080
```

Or with Docker (includes ffmpeg), from the repo root:

```bash
docker compose up -d --build
```

Then set the server URL in the editor's **Settings → Master Connection**.

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
