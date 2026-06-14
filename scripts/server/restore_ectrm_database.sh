#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ECTRM_CONFIRM_RESTORE=RESTORE scripts/server/restore_ectrm_database.sh /path/to/database.dump

Set either ECTRM_DATABASE_URL or use a running Postgres container:
  ECTRM_DATABASE_URL=postgresql+psycopg://...
  ECTRM_POSTGRES_CONTAINER=ectrm-postgres
  ECTRM_POSTGRES_USER=postgres
  ECTRM_POSTGRES_DB=ectrm
USAGE
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

dump_file="$1"
ECTRM_DATABASE_URL="${ECTRM_DATABASE_URL:-${DATABASE_URL:-}}"
ECTRM_POSTGRES_CONTAINER="${ECTRM_POSTGRES_CONTAINER:-ectrm-postgres}"
ECTRM_POSTGRES_USER="${ECTRM_POSTGRES_USER:-postgres}"
ECTRM_POSTGRES_DB="${ECTRM_POSTGRES_DB:-ectrm}"

if [[ "${ECTRM_CONFIRM_RESTORE:-}" != "RESTORE" ]]; then
  echo "Refusing to restore without ECTRM_CONFIRM_RESTORE=RESTORE." >&2
  exit 1
fi

if [[ ! -r "$dump_file" ]]; then
  echo "Dump file is not readable: $dump_file" >&2
  exit 1
fi

log() {
  printf '[ectrm-restore] %s\n' "$1"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

log "host=$(hostname) user=$(id -un) dump=$dump_file"

if [[ -n "$ECTRM_DATABASE_URL" ]]; then
  require_command pg_restore
  log "Restoring database through ECTRM_DATABASE_URL"
  pg_restore --clean --if-exists --no-owner --dbname "$ECTRM_DATABASE_URL" "$dump_file"
else
  require_command docker
  if ! docker container inspect "$ECTRM_POSTGRES_CONTAINER" >/dev/null 2>&1; then
    echo "No ECTRM_DATABASE_URL set and container '$ECTRM_POSTGRES_CONTAINER' was not found." >&2
    exit 1
  fi

  log "Restoring database into container $ECTRM_POSTGRES_CONTAINER"
  docker exec -i "$ECTRM_POSTGRES_CONTAINER" \
    pg_restore --clean --if-exists --no-owner \
    -U "$ECTRM_POSTGRES_USER" \
    -d "$ECTRM_POSTGRES_DB" \
    <"$dump_file"
fi

log "Restore completed"
