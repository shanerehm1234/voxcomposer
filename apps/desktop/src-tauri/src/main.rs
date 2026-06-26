// Prevent a console window from popping up alongside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Vox Composer desktop wrapper — see docs/DESKTOP_PACKAGING.md for the full
// reasoning. Short version: the Composer editor is a web app that needs to
// open a plain ws:// connection to a VoxMaster hub on the LAN. Browsers block
// that from an HTTPS origin, and a Tauri webview's native origin
// (tauri://localhost) is treated as a secure context that blocks it too. The
// one origin that reliably allows it on every platform is plain-HTTP loopback
// — http://localhost:<port> — the same thing every local dev server (Vite's
// own hot-reload included) uses.
//
// So this app serves the editor (embedded at compile time from apps/web/dist
// via `frontendDist` in tauri.conf.json) over a tiny in-process HTTP server
// on http://localhost and points its window there. NO Node, NO pnpm, NO child
// process — one self-contained binary.
//
// We serve the assets ourselves (instead of tauri-plugin-localhost, which
// returned 500 for `/` against this Tauri version — an asset-key lookup
// mismatch) so we control the key lookup and can log a miss, making failures
// diagnosable from the terminal instead of an opaque 500.

use tauri::{WebviewUrl, WebviewWindowBuilder};
use tiny_http::{Header, Response, Server};

/// Asset keys to try for a given request URL, most-specific first. Tauri's
/// embedded-asset resolver has varied on whether keys carry a leading slash
/// between versions, so we try both forms; for a path that doesn't look like
/// a file (an SPA route) we also fall back to index.html.
fn candidate_keys(url: &str) -> Vec<String> {
    let path = url.split(['?', '#']).next().unwrap_or("/");
    let trimmed = path.trim_start_matches('/');

    let mut keys = Vec::new();
    if trimmed.is_empty() {
        keys.push("index.html".to_string());
        keys.push("/index.html".to_string());
    } else {
        keys.push(trimmed.to_string());
        keys.push(format!("/{trimmed}"));
    }

    let last_segment = path.rsplit('/').next().unwrap_or("");
    if !last_segment.contains('.') {
        keys.push("index.html".to_string());
        keys.push("/index.html".to_string());
    }
    keys
}

fn main() {
    let port = portpicker::pick_unused_port().expect("no free TCP port available");

    tauri::Builder::default()
        .setup(move |app| {
            let resolver = app.asset_resolver();
            let server =
                Server::http(("127.0.0.1", port)).expect("failed to start the local asset server");
            eprintln!("[voxcomposer-desktop] serving the editor on http://localhost:{port}");

            std::thread::spawn(move || {
                for request in server.incoming_requests() {
                    let url = request.url().to_string();
                    let keys = candidate_keys(&url);

                    // Resolve the asset first; respond() consumes `request`, so
                    // it must be called exactly once (in one branch below).
                    let asset = keys.iter().find_map(|key| resolver.get(key.clone()));

                    match asset {
                        Some(asset) => {
                            let header = Header::from_bytes(
                                b"Content-Type".as_ref(),
                                asset.mime_type.as_bytes(),
                            )
                            .expect("a valid Content-Type header");
                            let response = Response::from_data(asset.bytes).with_header(header);
                            let _ = request.respond(response);
                        }
                        None => {
                            eprintln!(
                                "[voxcomposer-desktop] 404 for {url:?} — no embedded asset under {keys:?}"
                            );
                            let _ = request.respond(
                                Response::from_string("not found").with_status_code(404),
                            );
                        }
                    }
                }
            });

            let app_url = format!("http://localhost:{port}")
                .parse()
                .expect("a localhost URL with a valid port is always parseable");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url))
                .title("Vox Composer")
                .inner_size(1280.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Vox Composer desktop app");
}
