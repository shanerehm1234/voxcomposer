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

## The plan: a native wrapper around what we already built

Don't ask the customer's machine to run Docker at all. Wrap the **same**
`apps/server` (Express + SQLite + static-served editor — already built,
already working, verified live) inside a native desktop app shell instead of
launching it via `docker compose`. Customer downloads one signed file per OS,
double-clicks it like any other app, no separate runtime, no reboot, no
account.

### Electron vs. Tauri

Both let a web app — what Composer already is — run as a real desktop app
(its own icon, dock/taskbar presence, no browser chrome needed), and both can
spawn our existing server process internally.

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

- **Composer's web app (`apps/web`) doesn't change at all.** Same HTML/CSS/JS.
- **`apps/server` doesn't change.** The wrapper just launches it instead of
  `docker compose` doing so.
- New: a thin native shell (Tauri project) that, on launch, starts the
  bundled server and opens a window pointed at `http://localhost:<port>`.
- Docker Compose stays as-is for the self-host/power-user path — this isn't a
  replacement, it's a second on-ramp for a different customer.

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

1. ✅ **Scaffolded** — `apps/desktop` (Tauri v2). Spawns `apps/server`
   unchanged, opens a window at `http://localhost:8080`. See its own
   [`README.md`](../apps/desktop/README.md) for exact setup/run steps per OS.
   Written without a Rust toolchain available to compile-check it against —
   real but expected risk of a small API fix needed on first build; the
   architecture (spawn server, poll until it's listening, open a plain-HTTP
   window) is the part that matters and doesn't change even if a method name
   needs adjusting.
2. **Next**: actually run it — `pnpm dev` from `apps/desktop` on a real
   machine with the Rust toolchain + platform webview deps installed (Linux
   and Windows, per the README; no Mac available to test yet) — confirm a
   real VoxMaster shows up exactly like it does from a browser today.
3. Once confirmed working: a GitHub Actions workflow building unsigned dev
   artifacts for all three platforms, still without spending on certificates.
4. Only after that's solid: Apple Developer account + Windows signing cert,
   real signed/auto-updating releases.

Composer's own feature development doesn't need to pause for any of this —
the wrapper just embeds whatever `apps/web`/`apps/server` look like at build
time, so the two tracks run in parallel, not in sequence.
