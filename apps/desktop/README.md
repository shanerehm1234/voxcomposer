# @voxcomposer/desktop

A native Mac/Windows/Linux wrapper around Vox Composer — see
[`../../docs/DESKTOP_PACKAGING.md`](../../docs/DESKTOP_PACKAGING.md) for why
this exists. It launches `apps/server` (unchanged — same code as the
Docker/self-host path) and opens a window pointed at it, so there's no
Docker, no separate runtime install, no terminal for a real customer.

**This is a dev-grade test build, not a finished installer.** It spawns the
server via `pnpm` on PATH rather than a bundled standalone binary — right for
proving the whole pipeline works against a real Master; bundling Node into a
true zero-dependency binary is later work (tracked in `DESKTOP_PACKAGING.md`).
Not signed — you'll need to click through an "unidentified developer" /
"Windows protected your PC" warning on first run, which is expected at this
stage.

## One-time setup

You need Rust (via `rustup`) and a few platform packages Tauri's webview
needs to compile against. Skip the OS you're not testing.

### Linux (Debian/Ubuntu)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# restart your shell, or: source "$HOME/.cargo/env"

sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev
```

(Fedora: `dnf install webkit2gtk4.1-devel gtk3-devel librsvg2-devel ...` — same
idea, different package manager. Arch: `pacman -S webkit2gtk-4.1 gtk3 ...`.)

### Windows

1. Install [Rust via rustup](https://rustup.rs) (choose the MSVC toolchain
   when prompted — the default).
2. Install the **Visual Studio Build Tools** (just the "Desktop development
   with C++" workload, not the full IDE) — Tauri's Rust side needs the MSVC
   linker. https://visualstudio.microsoft.com/visual-cpp-build-tools/
3. WebView2 is the rendering engine and ships with Windows 10/11 by default
   (it's what Edge uses) — nothing to install unless you're on an unusually
   stripped-down Windows install.

### Both platforms

You'll also need Node 22+ and pnpm (already required for the rest of this
repo) on PATH, since that's what actually runs `apps/server`.

## Run it

From the repo root, once (sets up the local SQLite schema apps/server needs):

```bash
pnpm install
pnpm --filter @voxcomposer/server db:push
```

Then, from `apps/desktop`:

```bash
pnpm install
pnpm dev
```

This builds `apps/web` (via `beforeDevCommand` in `tauri.conf.json`), then
compiles and launches the Rust shell, which starts `apps/server` and opens a
window pointed at `http://localhost:8080`. Same editor you'd see at that URL
in a browser — except now it's a real window with its own icon, and it's
plain HTTP so it can talk to a real Vox Master with zero mixed-content
issues (see `docs/HOSTING_DECISION.md` for why that matters).

In the app's **Settings → Master Connection**, point it at your real
VoxMaster's hostname/IP, same as you would from a browser.

The first `cargo` build will take a few minutes (compiling Tauri and its
dependencies from scratch); subsequent runs are much faster.

## If something goes wrong

- **"failed to start the local Vox Composer server"** — `pnpm` isn't on PATH
  for however you launched the app, or you skipped `db:push` above.
- **Window opens but shows a connection error** — the server didn't come up
  within 20s; check the terminal `tauri dev` is running in for errors from
  the spawned server process (it logs to the same terminal).
- **A Rust compiler error mentioning `tauri::Window`, `WebviewWindowBuilder`,
  or `setup`** — this file was written without a Rust toolchain available to
  compile-check it against the exact Tauri v2 API. The error message should
  point at the fix; cross-reference https://v2.tauri.app/reference/. Send the
  exact error back if you want help with it.
