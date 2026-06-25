// Prevent a console window from popping up alongside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Vox Composer desktop wrapper — see docs/DESKTOP_PACKAGING.md for the full
// reasoning. Short version: the Composer editor is a web app that needs to
// open a plain ws:// connection to a VoxMaster hub on the LAN. Browsers block
// that from an HTTPS origin, and a Tauri webview's native origin
// (tauri://localhost) is treated as a secure context that blocks it too. The
// one origin that reliably allows it on every platform is plain-HTTP
// loopback — http://localhost:<port> — the same thing every local dev server
// (Vite's own hot-reload included) uses.
//
// So this app serves the bundled editor over http://localhost via
// tauri-plugin-localhost and points its window there. The server is just a
// few lines of embedded Rust inside this one binary — NO Node, NO pnpm, NO
// sidecar process. The customer installs nothing; they double-click one app.
//
// NOTE: hand-written without a Rust toolchain available in the environment
// that produced it (no cargo/webview libs here to compile-check against). The
// architecture is the documented tauri-plugin-localhost pattern; if `cargo`
// flags an exact-API mismatch (a builder method name, a permissions/
// capability needed to navigate to the localhost URL), that's expected
// first-build cleanup, not a sign the approach is wrong — cross-reference
// https://v2.tauri.app and the plugin's docs.

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    // A free loopback port, chosen fresh each launch.
    let port = portpicker::pick_unused_port().expect("no free TCP port available");

    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
        .setup(move |app| {
            let url = format!("http://localhost:{port}")
                .parse()
                .expect("a localhost URL with a valid port is always parseable");

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Vox Composer")
                .inner_size(1280.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Vox Composer desktop app");
}
