#!/usr/bin/env bash
# Serve the site locally and expose it through a temporary Cloudflare Quick Tunnel.
# The public URL is random and stops working as soon as this script exits (Ctrl+C).
# Usage: ./preview.sh            (port 8000)
#        PORT=8001 ./preview.sh
set -euo pipefail

PORT="${PORT:-8000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/formulaire-preview"
LOG="$(mktemp)"
SERVER_PID=""
TUNNEL_PID=""

cleanup() {
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  rm -f "$LOG"
  echo "Server and tunnel stopped, the link no longer works."
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Use a system cloudflared if present, otherwise download it once into the cache dir
if command -v cloudflared >/dev/null; then
  CLOUDFLARED="cloudflared"
else
  case "$(uname -m)" in
    x86_64) ARCH=amd64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
    armv7l) ARCH=arm ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  CLOUDFLARED="$CACHE_DIR/cloudflared"
  if [ ! -x "$CLOUDFLARED" ]; then
    echo "Downloading cloudflared into $CACHE_DIR ..."
    mkdir -p "$CACHE_DIR"
    curl -fsSL -o "$CLOUDFLARED.tmp" \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARCH"
    chmod +x "$CLOUDFLARED.tmp"
    mv "$CLOUDFLARED.tmp" "$CLOUDFLARED"
  fi
fi

if ss -tln | grep -q ":$PORT "; then
  echo "Port $PORT is already in use. Retry with another one: PORT=8001 $0" >&2
  exit 1
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER_PID=$!
"$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!

echo "Starting tunnel..."
URL=""
for _ in $(seq 1 30); do
  URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -n 1 || true)"
  [ -n "$URL" ] && break
  kill -0 "$TUNNEL_PID" 2>/dev/null || break
  sleep 1
done
if [ -z "$URL" ]; then
  echo "Could not create the tunnel:" >&2
  tail -n 20 "$LOG" >&2
  exit 1
fi

# A fresh hostname takes a few seconds to resolve
echo "Waiting for the link to become reachable..."
for _ in $(seq 1 20); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/" || true)" = "200" ] && break
  sleep 3
done

echo
echo "  $URL"
echo
command -v qrencode >/dev/null && qrencode -t ansiutf8 "$URL"
echo "Press Ctrl+C to stop."
wait "$TUNNEL_PID"
