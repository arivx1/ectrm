#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/server/phase1_remote.sh user@host --audit
  scripts/server/phase1_remote.sh user@host --provision

Environment overrides forwarded to the remote provisioner:
  ECTRM_USER
  ECTRM_ROOT
  ECTRM_INSTALL_DOCKER
  ECTRM_INSTALL_NVIDIA_TOOLKIT
  ECTRM_INSTALL_TAILSCALE
  ECTRM_ENABLE_UFW
  ECTRM_OPEN_HTTP_HTTPS

Examples:
  scripts/server/phase1_remote.sh ectrm@ectrm-server --audit
  ECTRM_INSTALL_TAILSCALE=1 scripts/server/phase1_remote.sh ectrm@ectrm-server --provision
USAGE
}

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 2
fi

REMOTE="$1"
ACTION="$2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_DIR="/tmp/ectrm-phase1-$(date +%Y%m%d%H%M%S)"

case "$ACTION" in
  --audit | --provision)
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required local command: $command_name" >&2
    exit 1
  fi
}

shell_quote() {
  printf "%q" "$1"
}

remote_env_assignment() {
  local key="$1"
  local value="${!key-}"
  if [[ -n "$value" ]]; then
    printf "%s=%s " "$key" "$(shell_quote "$value")"
  fi
}

remote_env_prefix() {
  local key
  for key in \
    ECTRM_USER \
    ECTRM_ROOT \
    ECTRM_INSTALL_DOCKER \
    ECTRM_INSTALL_NVIDIA_TOOLKIT \
    ECTRM_INSTALL_TAILSCALE \
    ECTRM_ENABLE_UFW \
    ECTRM_OPEN_HTTP_HTTPS; do
    remote_env_assignment "$key"
  done
}

require_command ssh
require_command scp

echo "[phase1] local host: $(hostname)"
echo "[phase1] remote target: $REMOTE"
echo "[phase1] action: $ACTION"

ssh "$REMOTE" "mkdir -p $(shell_quote "$REMOTE_DIR")"
scp \
  "$SCRIPT_DIR/phase1_server_audit.sh" \
  "$SCRIPT_DIR/phase1_server_bootstrap.sh" \
  "$REMOTE:$REMOTE_DIR/"

if [[ "$ACTION" == "--audit" ]]; then
  ssh -t "$REMOTE" "bash $(shell_quote "$REMOTE_DIR/phase1_server_audit.sh")"
else
  ENV_PREFIX="$(remote_env_prefix)"
  ssh -t "$REMOTE" "${ENV_PREFIX}bash $(shell_quote "$REMOTE_DIR/phase1_server_audit.sh") && ${ENV_PREFIX}sudo -E bash $(shell_quote "$REMOTE_DIR/phase1_server_bootstrap.sh") && bash $(shell_quote "$REMOTE_DIR/phase1_server_audit.sh")"
fi

ssh "$REMOTE" "rm -rf $(shell_quote "$REMOTE_DIR")"
