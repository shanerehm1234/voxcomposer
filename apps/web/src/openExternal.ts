/**
 * Open a URL in the user's real browser, from either runtime:
 * - In a plain browser tab, window.open works and returns the new window.
 * - In the Tauri desktop shell, the webview swallows window.open/_blank (it
 *   returns null) — so we fall back to a same-origin GET on `/__open`, which
 *   the shell's own asset server handles by launching the system browser
 *   from native code (see apps/desktop src-tauri/src/main.rs). No IPC, no
 *   capability config, nothing to break.
 */
export function openExternal(url: string): void {
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    void fetch(`/__open?url=${encodeURIComponent(url)}`).catch(() => {
      /* last resort: nothing sensible left to try */
    });
  }
}
