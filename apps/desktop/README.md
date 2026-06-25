# @voxcomposer/desktop

The native Mac/Windows/Linux build of Vox Composer — one double-click app, no
Docker, no terminal, no separate runtime for the customer. See
[`../../docs/DESKTOP_PACKAGING.md`](../../docs/DESKTOP_PACKAGING.md) for the
full architecture and why it's built this way.

## How it works (short version)

It's a [Tauri](https://v2.tauri.app) app. The whole Composer editor
(`apps/web`'s build) is compiled into a single native binary. At launch it
serves that editor over `http://localhost:<port>` from inside the binary
(via `tauri-plugin-localhost`) and opens a window there. That plain-HTTP
localhost origin is the thing that lets the editor open a `ws://` connection
to a VoxMaster on your network — which a normal HTTPS website (and even
Tauri's own `tauri://` origin) can't do. **No Node, no pnpm, no sidecar
process** — the "server" is a few lines of Rust inside the one app.

## What the customer needs to run it: nothing

- **Windows**: nothing — WebView2 (the rendering engine) ships with Windows 10/11.
- **macOS**: nothing — WKWebView is part of the OS.
- **Linux**: the WebKitGTK *runtime* (`libwebkit2gtk-4.1-0`), which nearly every
  desktop Linux already has; the `.deb` declares it as a dependency so it
  installs automatically, and the AppImage is self-contained.

That's the whole point — they download one installer and double-click it.

---

## Building it (this is for US, the developers — not the customer)

You need the toolchain only to *compile* the installer. Skip the OS you're not
building on.

### Common (all platforms)

Node 22+ and pnpm (already required by the rest of this repo) — the web build
gets embedded into the app.

### Linux (Debian/Ubuntu)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# restart your shell, or: source "$HOME/.cargo/env"

sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev
```

(Fedora: `dnf install webkit2gtk4.1-devel gtk3-devel ...`. Arch:
`pacman -S webkit2gtk-4.1 gtk3 ...`.)

### Windows

1. [Rust via rustup](https://rustup.rs) — accept the default MSVC toolchain.
2. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   — just the "Desktop development with C++" workload (the Rust linker needs it).
3. WebView2 is already on Windows 10/11; nothing to install.

## Run it (dev)

From `apps/desktop`:

```bash
pnpm install      # installs the Tauri CLI
pnpm dev          # builds apps/web, compiles the Rust shell, opens the app
```

`pnpm dev` runs `tauri dev`, which: builds `apps/web` → `dist/` (via
`beforeDevCommand`), compiles and launches the native app, which serves that
build at `http://localhost:<port>` and opens a window on it. The first Rust
build takes a few minutes (compiling Tauri from scratch); later runs are fast.

Then in **Settings → Master Connection**, point it at your real VoxMaster's
hostname/IP — same as you would from a browser. This is the moment of truth:
a real device should show up in the sidebar, because the app's origin is now
plain-HTTP localhost.

## Build an installer

```bash
pnpm bundle       # tauri build — produces installers under src-tauri/target/release/bundle/
```

(It's `bundle`, not `build`, on purpose — so the monorepo's routine
`pnpm -r build` / CI doesn't try to compile a native installer, which needs
the Rust toolchain. Building installers is an explicit release step.)

Linux gives you a `.deb` and an `.AppImage`; Windows an `.msi`/`.exe`; macOS a
`.dmg`/`.app` (only buildable on a Mac). **Not code-signed yet** — first launch
shows an "unidentified developer" / "Windows protected your PC" warning;
click through it (that's a later, separate step — see DESKTOP_PACKAGING.md).

## Icons

`src-tauri/icons/` currently holds placeholder icons generated from the web
app's PWA logo. The `.icns` (macOS) one is a quick stand-in, not a real
multi-resolution icns — regenerate the whole set properly before a real
release with `pnpm tauri icon path/to/logo-1024.png`.

## If something goes wrong

- **A Rust compile error about `WebviewWindowBuilder`, the localhost plugin, or
  a missing permission/capability to navigate to the localhost URL** — this was
  written without a Rust toolchain to compile-check it; the message should point
  at the fix. The architecture (serve the build at http://localhost, open a
  window there) is the documented `tauri-plugin-localhost` pattern; send me the
  exact error and it should be a quick adjustment.
- **Window opens but the editor is blank** — `apps/web` didn't build, or
  `frontendDist` (`../../web/dist`) is empty. Run `pnpm --filter
  @voxcomposer/web build` from the repo root and check `apps/web/dist` exists.
- **Editor loads but no devices appear** — confirm the Master's reachable from
  this machine (`curl http://voxmaster.local/status`) and that you set its
  address in Settings. If `curl` works but the app shows nothing, *that's* the
  interesting case — it'd mean the localhost origin still isn't allowed to open
  ws:// in this webview, which is exactly what we're here to verify; tell me.
