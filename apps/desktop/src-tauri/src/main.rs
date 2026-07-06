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
use tauri_plugin_dialog::DialogExt;
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

/// Minimal percent-decoding for the /__open query value (encodeURIComponent
/// output: alphanumerics survive, everything else arrives as %XX).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if let (Some(h), Some(l)) = (
                bytes.get(i + 1).and_then(|c| (*c as char).to_digit(16)),
                bytes.get(i + 2).and_then(|c| (*c as char).to_digit(16)),
            ) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A JSON HTTP response (application/json) with the given status code.
fn json_response(status: u16, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let header = Header::from_bytes(b"Content-Type".as_ref(), b"application/json".as_ref())
        .expect("a valid Content-Type header");
    Response::from_string(body).with_status_code(status).with_header(header)
}

/// Escape a string as a JSON string literal (including the surrounding quotes)
/// — paths can contain backslashes (Windows) or quotes, which would otherwise
/// break the hand-built JSON envelope.
fn json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn main() {
    let port = portpicker::pick_unused_port().expect("no free TCP port available");

    tauri::Builder::default()
        // "Open web UI" buttons (Master + remotes) hand URLs to the system
        // browser through this plugin — the webview itself swallows
        // target="_blank" navigations. See openExternal() in apps/web.
        .plugin(tauri_plugin_opener::init())
        // Native "Save As" dialog for File > Save .vox (used from Rust via the
        // /__save asset-server route below — no JS capabilities needed).
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let resolver = app.asset_resolver();
            // Handle for the asset-server thread so /__save can raise a native
            // save dialog on the correct (UI) thread.
            let handle = app.handle().clone();
            let server =
                Server::http(("127.0.0.1", port)).expect("failed to start the local asset server");
            eprintln!("[voxcomposer-desktop] serving the editor on http://localhost:{port}");

            std::thread::spawn(move || {
                for mut request in server.incoming_requests() {
                    let url = request.url().to_string();

                    // "Open web UI" buttons hit this endpoint (see the web
                    // app's openExternal()): hand the URL to the system
                    // browser from native code. Same-origin fetch — no IPC,
                    // no capabilities, works in every webview.
                    if let Some(q) = url.strip_prefix("/__open?url=") {
                        let target = percent_decode(q);
                        if target.starts_with("http://") || target.starts_with("https://") {
                            if let Err(e) = tauri_plugin_opener::open_url(&target, None::<&str>) {
                                eprintln!("[voxcomposer-desktop] failed to open {target:?}: {e}");
                            }
                        }
                        let _ = request.respond(Response::empty(204));
                        continue;
                    }

                    // File > Save .vox: the POST body is the show bytes and the
                    // ?name= query is the suggested filename. Raise a native
                    // "Save As" dialog, write the bytes to the chosen path, and
                    // reply with a small JSON envelope. The distinctive JSON is
                    // what lets the web side tell "ran in the desktop shell"
                    // (saved/cancelled) apart from "not the desktop" (a browser
                    // dev server would 404 or hand back index.html) so it can
                    // fall back to the browser's own save path.
                    if let Some(q) = url.strip_prefix("/__save?name=") {
                        let name = percent_decode(q);
                        let mut body = Vec::new();
                        if let Err(e) = request.as_reader().read_to_end(&mut body) {
                            eprintln!("[voxcomposer-desktop] /__save read failed: {e}");
                            let _ = request.respond(json_response(
                                500,
                                "{\"saved\":false,\"error\":\"read failed\"}",
                            ));
                            continue;
                        }
                        let picked = handle
                            .dialog()
                            .file()
                            .set_file_name(name)
                            .blocking_save_file();
                        match picked.and_then(|fp| fp.into_path().ok()) {
                            Some(path) => match std::fs::write(&path, &body) {
                                Ok(()) => {
                                    let body = format!(
                                        "{{\"saved\":true,\"path\":{}}}",
                                        json_string(&path.to_string_lossy())
                                    );
                                    let _ = request.respond(json_response(200, &body));
                                }
                                Err(e) => {
                                    eprintln!("[voxcomposer-desktop] /__save write failed: {e}");
                                    let _ = request.respond(json_response(
                                        500,
                                        "{\"saved\":false,\"error\":\"write failed\"}",
                                    ));
                                }
                            },
                            None => {
                                // User dismissed the dialog.
                                let _ = request.respond(json_response(
                                    200,
                                    "{\"saved\":false,\"cancelled\":true}",
                                ));
                            }
                        }
                        continue;
                    }

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
