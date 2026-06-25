# Self-hosting Vox Composer

Vox Composer runs entirely on your own hardware, no cloud required. See
[`HOSTING_DECISION.md`](./HOSTING_DECISION.md) for the full reasoning — short
version: a browser can only open the unencrypted `ws://` connection a real Vox
Master speaks if the page itself was loaded over plain HTTP. A page loaded over
HTTPS (the public `voxcomposer.app` demo included) can never reach your Master —
that's a browser security boundary, not a bug, and no app-side fix exists. So
**running the local server below is how you actually drive a real show.**

## Option 1 — the local server (recommended; this is the real production path)

```bash
# from the repo root
docker compose up -d --build
```

That's it — `http://<this-host>:8080` is the whole app: the editor, local
`.vox` project storage (SQLite), and audio transcoding (ffmpeg). Open it from
the same machine, or from any other device on the same network (a tablet
backstage, a second laptop) by using that machine's address instead of
`localhost`. Point **Settings → Master Connection** at your real Master's
hostname/IP and it works — no mixed-content issue, because this page is plain
HTTP.

Without Docker:

```bash
pnpm install
pnpm --filter @voxcomposer/web build          # build the editor once
pnpm --filter @voxcomposer/server db:push     # create the SQLite schema (first run)
pnpm --filter @voxcomposer/server dev         # http://localhost:8080
```

See [`apps/server/README.md`](../apps/server/README.md) for the full option
list (ports, cache dir, etc. — all via [`.env.example`](../.env.example)).

> **Want remote access** (editing a show from outside your home network)?
> The Master's own [`SECURITY.md`](../../VOXMASTER/docs/SECURITY.md) already
> answers this for the Master itself: Tailscale, not a public port. The same
> answer extends to whichever machine is running this local server — install
> Tailscale there too. No relay service, no extra accounts, no new attack
> surface beyond what you already trust.

## Option 2 — static editor only (preview/marketing; no real Master)

This is how the public demo at `voxcomposer.app/demo` is hosted — useful for
showing off the timeline editor with mock data, **not** for driving real
hardware (see the warning banner the app itself shows when loaded over
HTTPS).

```bash
pnpm install
pnpm --filter @voxcomposer/web build
npx serve apps/web/dist
#   …or copy dist/ into nginx / Caddy / Apache / Netlify / Cloudflare Pages
```

What you get: full timeline editing, multi-track, multi-select, undo/redo,
audio import with waveforms and local preview playback, `.vox`/show-package
export/import, installable PWA with offline support — everything except a
live connection to a real Master if this is served over HTTPS.

> **Media stays local.** Imported audio lives in the browser (IndexedDB) and
> on your local network's remotes (SD cards). Nothing is uploaded to a server
> in this mode.

## Multi-user / cloud sync (future, optional, not built)

`apps/server`'s SQLite-backed storage can move to Postgres, and an auth
provider (Clerk) can be added behind environment variables, **if** multi-user
ever becomes a real need. Both stay strictly opt-in — single-user, no-login,
fully local is the default and the only thing that exists today.
