#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="apps/web"
API_PID=""
WEB_PID=""

log() {
  printf '[dev] %s\n' "$1"
}

stop_pid() {
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  stop_pid "$WEB_PID"
  stop_pid "$API_PID"
  exit "$exit_code"
}

ensure_backend_dependencies() {
  if [[ -x "$ROOT_DIR/.venv/bin/uvicorn" ]]; then
    return
  fi

  log "Backend virtualenv is missing. Running 'make api-install'..."
  make -C "$ROOT_DIR" api-install
}

ensure_web_dependencies() {
  if [[ -x "$ROOT_DIR/$WEB_DIR/node_modules/.bin/vite" ]]; then
    return
  fi

  log "Web dependencies are missing. Running 'make web-install'..."
  make -C "$ROOT_DIR" web-install
}

trap cleanup EXIT INT TERM

if [[ "${ECTRM_DEV_SKIP_DB:-0}" != "1" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "[dev] Docker is required for 'make dev'. Set ECTRM_DEV_SKIP_DB=1 to skip docker compose startup." >&2
    exit 1
  fi

  log "Starting PostgreSQL via docker compose..."
  (
    cd "$ROOT_DIR"
    docker compose up -d
  )
else
  log "Skipping docker compose startup because ECTRM_DEV_SKIP_DB=1."
fi

ensure_backend_dependencies
ensure_web_dependencies

log "Starting API at http://127.0.0.1:8000 ..."
(
  cd "$ROOT_DIR"
  exec "$ROOT_DIR/.venv/bin/uvicorn" apps.api.app.main:app --host 0.0.0.0 --port 8000 --reload
) &
API_PID=$!

log "Starting web app. Vite will report the local URL once ready..."
(
  cd "$ROOT_DIR/$WEB_DIR"
  exec "$ROOT_DIR/$WEB_DIR/node_modules/.bin/vite"
) &
WEB_PID=$!

log "Press Ctrl+C to stop both services."

while true; do
  if [[ -n "$API_PID" ]] && ! kill -0 "$API_PID" 2>/dev/null; then
    wait "$API_PID"
    exit $?
  fi

  if [[ -n "$WEB_PID" ]] && ! kill -0 "$WEB_PID" 2>/dev/null; then
    wait "$WEB_PID"
    exit $?
  fi

  sleep 1
done
