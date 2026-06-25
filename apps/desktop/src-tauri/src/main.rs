// Vox Composer desktop wrapper — see docs/DESKTOP_PACKAGING.md in the repo
// root for why this exists (Docker Desktop is the wrong install path for a
// non-technical customer; this is a native shell around the SAME local
// server we already built and verified, apps/server, unchanged).
//
// DEV-GRADE WIRING, NOT YET A FINISHED INSTALLER: this spawns the local
// server via `pnpm` on PATH (assumes Node/pnpm are already installed on the
// dev machine running `tauri dev`) rather than a bundled standalone binary.
// That's the right scope for "prove the pipeline works end-to-end against a
// real Master" — bundling Node into a true zero-dependency binary is later
// work, once this approach is confirmed to actually work for this app.
//
// NOTE: hand-written without a Rust toolchain available in the environment
// that produced this file (no cargo/webkit2gtk here to compile-check it
// against). The architecture is sound, but if `cargo` reports a type or
// method mismatch against the exact Tauri v2 API, that's expected risk, not
// a sign the approach is wrong — check https://v2.tauri.app's docs for
// `setup`/`on_window_event`/`WebviewWindowBuilder` and adjust.

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// The local server's port (apps/server's default — see apps/server/src/env.ts).
const SERVER_PORT: u16 = 8080;
/// How long to wait for the server to start accepting connections before
/// giving up and opening the window anyway (it'll just show a connection
/// error, which is at least a clear signal something's wrong).
const SERVER_READY_TIMEOUT: Duration = Duration::from_secs(20);

/// Holds the spawned server's `Child` handle so it can be killed when the
/// window closes — Rust does NOT do this automatically when a `Child` is
/// dropped, so without this the server would keep running as an orphan
/// process after the app appears to have quit.
struct ServerProcess(Mutex<Option<Child>>);

/// `apps/desktop/src-tauri` -> repo root is three levels up. Resolved from
/// `CARGO_MANIFEST_DIR` (always the directory containing this Cargo.toml, set
/// at compile time) rather than the process's current directory, so this
/// works regardless of where `tauri dev`/the built binary is actually run from.
fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .expect("repo root should resolve relative to src-tauri/Cargo.toml")
}

/// Poll until something is listening on `port`, or `timeout` elapses.
fn wait_for_server(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn main() {
    tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let root = repo_root();
            eprintln!("[voxcomposer-desktop] starting local server (repo root: {root:?})");

            // Runs the SAME apps/server code the Docker/self-host path uses
            // (apps/server/package.json's "start" script) — nothing about the
            // server changes for the desktop build.
            let child = Command::new("pnpm")
                .args(["--filter", "@voxcomposer/server", "start"])
                .current_dir(&root)
                .spawn()
                .expect(
                    "failed to start the local Vox Composer server — is pnpm on PATH? \
                     (run `pnpm --filter @voxcomposer/server db:push` once first, too)",
                );

            *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);

            if !wait_for_server(SERVER_PORT, SERVER_READY_TIMEOUT) {
                eprintln!(
                    "[voxcomposer-desktop] server didn't come up within {SERVER_READY_TIMEOUT:?} — \
                     opening the window anyway; check the terminal output above for errors."
                );
            }

            let url = format!("http://localhost:{SERVER_PORT}")
                .parse()
                .expect("hardcoded localhost URL is always valid");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Vox Composer")
                .inner_size(1280.0, 800.0)
                .build()?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill the server when the window closes — otherwise it lingers
            // as an orphaned background process after the app "quits".
            if let WindowEvent::CloseRequested { .. } = event {
                let state = window.app_handle().state::<ServerProcess>();
                if let Some(mut child) = state.0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the Vox Composer desktop app");
}
