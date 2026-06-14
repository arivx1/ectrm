#!/usr/bin/env bash
set -euo pipefail

ECTRM_ROOT="${ECTRM_ROOT:-/srv/ectrm}"
ECTRM_BACKUP_DIR="${ECTRM_BACKUP_DIR:-$ECTRM_ROOT/backups}"
ECTRM_DOCUMENTS_ROOT="${ECTRM_DOCUMENTS_ROOT:-$ECTRM_ROOT/documents}"
ECTRM_DATABASE_URL="${ECTRM_DATABASE_URL:-${DATABASE_URL:-}}"
ECTRM_POSTGRES_CONTAINER="${ECTRM_POSTGRES_CONTAINER:-ectrm-postgres}"
ECTRM_POSTGRES_USER="${ECTRM_POSTGRES_USER:-postgres}"
ECTRM_POSTGRES_DB="${ECTRM_POSTGRES_DB:-ectrm}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$ECTRM_BACKUP_DIR/$timestamp"

log() {
  printf '[ectrm-backup] %s\n' "$1"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

write_metadata() {
  {
    echo "created_at_utc=$timestamp"
    echo "hostname=$(hostname)"
    echo "user=$(id -un)"
    echo "ectrm_root=$ECTRM_ROOT"
    echo "documents_root=$ECTRM_DOCUMENTS_ROOT"
    if [[ -d "$ECTRM_ROOT/repo/.git" ]]; then
      git -C "$ECTRM_ROOT/repo" branch --show-current 2>/dev/null | sed 's/^/git_branch=/'
      git -C "$ECTRM_ROOT/repo" rev-parse HEAD 2>/dev/null | sed 's/^/git_head=/'
      git -C "$ECTRM_ROOT/repo" status --short 2>/dev/null | sed 's/^/git_status=/'
    fi
    if command -v docker >/dev/null 2>&1; then
      docker ps --format '{{.Names}} {{.Image}} {{.Status}}' 2>/dev/null | sed 's/^/docker_ps=/'
    fi
  } >"$backup_dir/metadata.txt"
}

backup_database() {
  if [[ -n "$ECTRM_DATABASE_URL" ]]; then
    require_command pg_dump
    log "Backing up database through ECTRM_DATABASE_URL"
    pg_dump --format=custom --file "$backup_dir/database.dump" "$ECTRM_DATABASE_URL"
    return
  fi

  require_command docker
  if ! docker container inspect "$ECTRM_POSTGRES_CONTAINER" >/dev/null 2>&1; then
    echo "No ECTRM_DATABASE_URL set and container '$ECTRM_POSTGRES_CONTAINER' was not found." >&2
    exit 1
  fi

  log "Backing up database from container $ECTRM_POSTGRES_CONTAINER"
  docker exec "$ECTRM_POSTGRES_CONTAINER" \
    pg_dump -U "$ECTRM_POSTGRES_USER" -d "$ECTRM_POSTGRES_DB" --format=custom \
    >"$backup_dir/database.dump"
}

backup_documents() {
  if [[ ! -d "$ECTRM_DOCUMENTS_ROOT" ]]; then
    log "Documents root $ECTRM_DOCUMENTS_ROOT does not exist; writing empty marker"
    touch "$backup_dir/documents-root-missing"
    return
  fi

  log "Backing up documents from $ECTRM_DOCUMENTS_ROOT"
  tar -C "$ECTRM_DOCUMENTS_ROOT" -czf "$backup_dir/documents.tar.gz" .
}

mkdir -p "$backup_dir"
chmod 0700 "$backup_dir"

write_metadata
backup_database
backup_documents

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_dir" && sha256sum * >SHA256SUMS)
elif command -v shasum >/dev/null 2>&1; then
  (cd "$backup_dir" && shasum -a 256 * >SHA256SUMS)
fi

log "Backup written to $backup_dir"
