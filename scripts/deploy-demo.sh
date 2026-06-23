#!/usr/bin/env bash
# Build the web app and publish it to the live nginx demo over the mounted SMB share.
# Public URL: https://voxcomposer.app/demo/  (served from a subpath; build uses base './').
#
# Requires the 'appdata' SMB share to be mounted via GVFS (open it once in Files
# if this path doesn't exist).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
REL="binhex-nginx/nginx/html/voxcomposerapp/demo"

# The 'appdata' share may be mounted by IP or by hostname (unraid.local) — find
# whichever GVFS mount actually has the demo folder.
GVFS_ROOT="/run/user/$(id -u)/gvfs"
DEST=""
for m in "$GVFS_ROOT"/smb-share:server=*,share=appdata; do
  [ -d "$m/$REL" ] && DEST="$m/$REL" && break
done

if [ -z "$DEST" ]; then
  echo "✗ 'appdata' SMB share not mounted (looked under $GVFS_ROOT)."
  echo "  Open it once in your file manager (smb://192.168.1.190/appdata) and retry."
  exit 1
fi

export PATH="$HOME/.local/bin:$PATH"

echo "▶ Building web app…"
( cd "$WEB_DIR" && rm -rf dist && pnpm exec vite build )

echo "▶ Publishing to $DEST"
mkdir -p "$DEST"
rm -rf "${DEST:?}"/*
# SMB can't preserve permissions; ignore that specific noise.
cp -r "$WEB_DIR/dist/." "$DEST"/ 2>&1 | grep -v "preserving permissions" || true

echo "▶ Verifying live URL…"
code=$(curl -s -o /dev/null -w "%{http_code}" "https://voxcomposer.app/demo/" || echo "000")
echo "  https://voxcomposer.app/demo/ -> HTTP $code"
[ "$code" = "200" ] && echo "✓ Demo is live." || echo "⚠ Unexpected status — check nginx/Cloudflare."
