#!/usr/bin/env bash
set -euo pipefail

section() {
  printf '\n== %s ==\n' "$1"
}

show_command() {
  local label="$1"
  shift
  printf '%-28s' "$label"
  if "$@" >/tmp/ectrm-audit-command.out 2>/tmp/ectrm-audit-command.err; then
    head -n 3 /tmp/ectrm-audit-command.out | tr '\n' ' '
    printf '\n'
  else
    printf 'not available'
    if [[ -s /tmp/ectrm-audit-command.err ]]; then
      printf ' (%s)' "$(head -n 1 /tmp/ectrm-audit-command.err)"
    fi
    printf '\n'
  fi
}

section "Host"
echo "hostname: $(hostname)"
echo "date: $(date -Is)"
echo "user: $(id)"
echo "cwd: $(pwd)"
if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  echo "os: ${PRETTY_NAME:-unknown}"
fi
echo "kernel: $(uname -a)"
echo "uptime: $(uptime || true)"

section "CPU And Memory"
if command -v lscpu >/dev/null 2>&1; then
  lscpu | sed -n '1,16p'
fi
free -h || true

section "Disk"
df -h / /srv 2>/dev/null || df -h /
if command -v lsblk >/dev/null 2>&1; then
  lsblk -f
fi

section "Network"
hostname -I 2>/dev/null || true
if command -v ip >/dev/null 2>&1; then
  ip -brief address || true
fi

section "Tools"
show_command "git" git --version
show_command "curl" curl --version
show_command "rsync" rsync --version
show_command "jq" jq --version
show_command "docker" docker --version
show_command "docker compose" docker compose version
show_command "nvidia-smi" nvidia-smi
show_command "tailscale" tailscale version
show_command "ufw" ufw status
show_command "python3" python3 --version
show_command "node" node --version
show_command "psql" psql --version

section "Docker"
if command -v docker >/dev/null 2>&1; then
  docker info --format 'server={{.ServerVersion}} cgroup={{.CgroupDriver}} root={{.DockerRootDir}}' 2>/dev/null || true
fi

section "ECTRM Directories"
for path in \
  /srv/ectrm \
  /srv/ectrm/config \
  /srv/ectrm/postgres \
  /srv/ectrm/documents \
  /srv/ectrm/backups \
  /srv/ectrm/logs \
  /srv/ectrm/models \
  /srv/ectrm/repo; do
  if [[ -e "$path" ]]; then
    ls -ld "$path"
  else
    echo "missing $path"
  fi
done

section "GPU Docker Test"
if [[ "${ECTRM_AUDIT_RUN_DOCKER_GPU_TEST:-0}" == "1" ]]; then
  if command -v docker >/dev/null 2>&1; then
    docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi
  else
    echo "docker unavailable"
  fi
else
  echo "skipped; set ECTRM_AUDIT_RUN_DOCKER_GPU_TEST=1 to run"
fi

rm -f /tmp/ectrm-audit-command.out /tmp/ectrm-audit-command.err
