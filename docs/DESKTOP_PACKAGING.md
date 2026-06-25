# Packaging Composer as a real installer (Mac/Windows/Linux)

Follow-up to [`HOSTING_DECISION.md`](./HOSTING_DECISION.md). That doc settled
*where Composer's backend runs* (locally, not the public HTTPS demo). This one
is about *how a non-technical customer gets it onto their computer* — a
different problem, surfaced once we worked through what Docker Desktop
actually asks of a first-time user.

## Why Docker Desktop isn't the answer for this customer

Docker Compose (`docker compose up`) is the right call for the power-user/
self-hoster crowd (people who already run a Synology/Unraid/TrueNAS box) —
that piece is built and documented in `self-hosting.md`. It is **not** the
right call for the target customer here: someone who finds xLights
intimidating and has likely never opened a terminal.

Docker Desktop's real friction for that person:
- A multi-hundred-MB separate download from a company (Docker Inc.) they've
  never heard of — not found via the Mac App Store, the only "install an app"
  instinct most non-technical Mac users have.
- Wants a Docker Hub account/sign-in before real use.
- **On Windows, requires enabling WSL2** — a Windows feature toggle that often
  forces a reboot on a machine that's never had dev tools installed. No
  installer UI can hide a required reboot.
- If anything breaks, the error vocabulary ("container," "image," "compose")
  is completely foreign, with none of the "just restart the app" intuition a
  crashed native app gives you.

A nicer installer wrapped around Docker Desktop can hide the *visible*
complexity, but can't remove the WSL2/reboot requirement or the separate
runtime dependency. xLights itself is a native app — its reputation for
scaring people is mostly about its *feature complexity* once open, not its
install step, which is a worth separating: this doc only addresses "how does
the program get onto the computer," not Composer's own onboarding/UX (a
separate, later problem, and one we have full control over since it's our UI).

## The plan: a native wrapper around the web app we already have

Don't ask the customer's machine to run Docker — or anything else — at all.
Compile the existing web editor into a native desktop app (Tauri) that serves
it locally over `http://localhost` and opens a window on it. Customer
downloads one file per OS, double-clicks it like any other app: no separate
runtime, no reboot, no account, no terminal. (The serving layer is a few lines
of embedded Rust, not a bundled Node process — see "The serving layer" below
for why that ended up being the cleaner answer.)

### Electron vs. Tauri

Both let a web app — what Composer already is — run as a real desktop app
(its own icon, dock/taskbar presence, no browser chrome needed). Tauri's win
here is bigger than just size: because it's a Rust app, the localhost server
can live *inside* the binary as a few lines of Rust (see below), rather than
the bundled Node child process Electron would push us toward.

| | Electron | Tauri |
|---|---|---|
| How it renders | Bundles its own copy of Chromium + Node | Uses the OS's own webview (WebKit on Mac, WebView2 on Windows) |
| Typical app size | ~100-200MB+ | ~10-20MB |
| Memory use | Higher (own browser engine per app) | Lower |
| Ecosystem maturity | Very mature, huge community | Newer, smaller, but production-ready |
| Known apps built with it | Discord, Slack, VS Code, Figma desktop, Notion, WhatsApp Desktop, Postman | Newer/leaner apps; growing fast |
| License | Open source (OpenJS Foundation), free for commercial use | Open source (MIT/Apache-2.0), free for commercial use |

**Leaning Tauri** — Composer doesn't need anything from Electron's deeper
native-integration ecosystem, and the smaller download/memory footprint
matters more for "someone with a 5-year-old laptop" than Electron's larger
community would buy us here. Not a hard commitment — Electron is the safer
"more Stack-Overflow-answers-exist" fallback if Tauri hits an unexpected wall.

### What changes vs. what doesn't

- **Composer's web app (`apps/web`) doesn't change at all.** Same HTML/CSS/JS,
  still runs unmodified in a plain browser (for dev/the demo) *and* inside the
  desktop app — identical code, because both load it from an `http://localhost`
  origin.
- New: a thin Tauri shell (`apps/desktop`) that embeds the web build and, at
  launch, serves it over `http://localhost:<port>` from *inside the binary*,
  then opens a window there.
- Docker Compose + `apps/server` (Node) stay as-is for the self-host/power-user
  path — this isn't a replacement, it's a second on-ramp for a different
  customer.

### The serving layer: embedded Rust, not a bundled Node process

> **Updated after a second-opinion round** (two external LLM reviews + the
> realization that the editor uses IndexedDB and talks straight to the Master,
> so the Node server's storage/transcode APIs aren't even used by the editor
> yet). The first sketch here was "bundle the existing Node `apps/server` as a
> self-contained binary (Prisma → `node:sqlite` → esbuild → Node SEA) and
> spawn it as a Tauri *sidecar*." That works, but it's a lot of fragile
> machinery (~100MB Node binary, a child process to babysit, a bundling
> pipeline to maintain).

Since the app is **already a Rust binary** (that's what Tauri is), the local
server doesn't need to be Node at all. The desktop app uses
[`tauri-plugin-localhost`](https://github.com/tauri-apps/tauri-plugin-localhost),
which serves the embedded web build over `http://localhost:<port>` from inside
the app process — a few lines of Rust, no child process, no IPC. That deletes
the entire Node-bundling problem: **no Node, no pnpm, no Prisma, no
`node:sqlite`, no esbuild, no Node SEA, no sidecar lifecycle.** One executable.

Why `http://localhost` specifically, and not just let the webview talk to the
Master from its native origin? Because a Tauri webview's native origin
(`tauri://localhost`, or `http://tauri.localhost` on Windows) is treated as a
**secure context**, which re-triggers the same mixed-content block on `ws://`
that started this whole saga — platform-dependent and fragile. A plain-HTTP
**loopback** origin (`http://localhost:<port>`) is the one origin that
reliably permits `ws://` to a LAN device on every platform; it's exactly what
every local dev server (Vite's own hot-reload included) relies on. So the
embedded localhost server isn't a workaround — it's the deterministic
cross-platform compatibility layer, and it costs almost nothing.

Project storage and audio transcoding (the things `apps/server` adds beyond
serving files) aren't needed by the desktop app today — the editor persists to
the webview's IndexedDB and drives the Master directly. When local file-based
storage *is* wanted, Tauri's native filesystem APIs (Rust commands) are a
better fit than an embedded HTTP API anyway. The Node `apps/server` remains the
right home for those features on the headless/NAS self-host path.

## Releases: automated via CI

Both Electron and Tauri have mature tooling for exactly this:

- **GitHub Actions** builds Mac, Windows, and Linux installers in parallel on
  GitHub's own runners — no need to personally own one of each machine.
  Trigger: push a version tag (e.g. `v1.2.0`) → workflow builds all three →
  uploads them to a GitHub Release automatically.
- **Auto-update**: both frameworks have built-in update checkers (Tauri's
  updater / `electron-updater`) so an already-installed copy can quietly pull
  a new version in the background — the same pattern Chrome/Slack use. Worth
  having from day one given the expectation of frequent updates in year one.
- **Cost**: GitHub Actions is free for this project's scale. The only real
  recurring costs are code-signing credentials — an Apple Developer account
  (~$99/yr, needed so macOS doesn't show an "unidentified developer"
  warning) and a Windows code-signing certificate (~$100-400/yr, same
  reasoning on Windows). Both are about *trust UI*, not functionality — the
  app works unsigned, it just looks scarier on first launch without them.

## Suggested sequencing

1. ✅ **Scaffolded** — `apps/desktop` (Tauri v2 + `tauri-plugin-localhost`).
   Embeds the web build, serves it at `http://localhost:<port>` from inside
   the binary, opens a window there. No Node at runtime. See its own
   [`README.md`](../apps/desktop/README.md) for exact build/run steps per OS.
   Written without a Rust toolchain available to compile-check it against —
   real but expected risk of a small API fix on first `cargo` build (a builder
   method name, or a capability needed to navigate to the localhost URL); the
   architecture (serve at http://localhost, open a window there) is what
   matters and doesn't change even if a detail needs adjusting.
2. **Next — the decisive test**: `pnpm dev` from `apps/desktop` on a real
   machine (Linux, then the Windows laptop — no Mac available yet), point
   Settings at a real VoxMaster, and confirm a device shows up. This is the
   one thing the whole approach rests on: that a `http://localhost` origin in
   the native webview can open `ws://` to the LAN. Expected to work (it's how
   every local dev server behaves), but it's the assumption worth proving
   first on each platform before building anything on top.
3. Once confirmed working: a GitHub Actions workflow building unsigned
   installers for all three platforms on tag push (Tauri's official
   `tauri-action` does this), still without spending on certificates.
4. Only after that's solid: Apple Developer account + Windows signing cert +
   Tauri's built-in updater, for real signed/auto-updating releases.

Composer's own feature development doesn't need to pause for any of this —
the wrapper just embeds whatever `apps/web`/`apps/server` look like at build
time, so the two tracks run in parallel, not in sequence.
