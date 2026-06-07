#!/usr/bin/env bash
set -euo pipefail

ECTRM_USER="${ECTRM_USER:-ectrm}"
ECTRM_ROOT="${ECTRM_ROOT:-/srv/ectrm}"
ECTRM_INSTALL_DOCKER="${ECTRM_INSTALL_DOCKER:-1}"
ECTRM_INSTALL_NVIDIA_TOOLKIT="${ECTRM_INSTALL_NVIDIA_TOOLKIT:-1}"
ECTRM_INSTALL_TAILSCALE="${ECTRM_INSTALL_TAILSCALE:-0}"
ECTRM_ENABLE_UFW="${ECTRM_ENABLE_UFW:-0}"
ECTRM_OPEN_HTTP_HTTPS="${ECTRM_OPEN_HTTP_HTTPS:-0}"

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

log() {
  printf '[phase1-bootstrap] %s\n' "$1"
}

require_apt_host() {
  if [[ ! -r /etc/os-release ]]; then
    echo "Cannot determine operating system; expected an apt-based Linux host." >&2
    exit 1
  fi

  . /etc/os-release
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "This bootstrap currently expects an apt-based Linux host." >&2
    exit 1
  fi

  if [[ "${ID:-}" != "ubuntu" && "${ID_LIKE:-}" != *"debian"* && "${ID:-}" != "debian" ]]; then
    echo "Unsupported OS ${PRETTY_NAME:-unknown}; expected Ubuntu or Debian-like Linux." >&2
    exit 1
  fi
}

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

install_base_packages() {
  log "Installing base packages"
  apt-get update
  apt_install \
    ca-certificates \
    curl \
    gnupg \
    git \
    jq \
    lsb-release \
    openssh-client \
    postgresql-client \
    rsync \
    ufw
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker Engine and Compose plugin are already available"
    return
  fi

  log "Installing Docker Engine and Compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  local arch
  arch="$(dpkg --print-architecture)"
  cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable
EOF

  apt-get update
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

install_nvidia_container_toolkit() {
  if command -v nvidia-ctk >/dev/null 2>&1; then
    log "NVIDIA Container Toolkit is already available"
    return
  fi

  log "Installing NVIDIA Container Toolkit"
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    >/etc/apt/sources.list.d/nvidia-container-toolkit.list

  apt-get update
  apt_install nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
}

install_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then
    log "Tailscale is already available"
    return
  fi

  log "Installing Tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
  log "Tailscale installed. Run 'sudo tailscale up' manually when ready."
}

create_service_user_and_dirs() {
  if ! id "$ECTRM_USER" >/dev/null 2>&1; then
    log "Creating service user $ECTRM_USER"
    useradd --create-home --shell /bin/bash "$ECTRM_USER"
  fi

  local ectrm_group
  ectrm_group="$(id -gn "$ECTRM_USER")"

  if getent group docker >/dev/null 2>&1; then
    usermod -aG docker "$ECTRM_USER"
    if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
      usermod -aG docker "$SUDO_USER"
    fi
  fi

  log "Creating ECTRM storage layout under $ECTRM_ROOT"
  install -d -o "$ECTRM_USER" -g "$ectrm_group" -m 0750 "$ECTRM_ROOT"
  for name in config postgres documents backups logs models repo; do
    install -d -o "$ECTRM_USER" -g "$ectrm_group" -m 0750 "$ECTRM_ROOT/$name"
  done

  cat >"$ECTRM_ROOT/config/README.md" <<EOF
# ECTRM Server Config

This directory is intentionally server-local. Keep real runtime secrets here,
not in git.

Recommended future files:

- api.env
- web.env
- postgres.env
- caddy.env
EOF
  chown "$ECTRM_USER:$ectrm_group" "$ECTRM_ROOT/config/README.md"
  chmod 0640 "$ECTRM_ROOT/config/README.md"
}

configure_firewall_if_requested() {
  if [[ "$ECTRM_ENABLE_UFW" != "1" ]]; then
    log "Skipping UFW enablement because ECTRM_ENABLE_UFW is not 1"
    return
  fi

  log "Configuring UFW"
  ufw allow OpenSSH
  if [[ "$ECTRM_OPEN_HTTP_HTTPS" == "1" ]]; then
    ufw allow 80/tcp
    ufw allow 443/tcp
  fi
  ufw --force enable
}

write_profile_hint() {
  cat >/etc/profile.d/ectrm.sh <<EOF
export ECTRM_ROOT=${ECTRM_ROOT}
EOF
  chmod 0644 /etc/profile.d/ectrm.sh
}

require_apt_host
log "Bootstrapping host $(hostname) for ECTRM Phase 1"
install_base_packages

if [[ "$ECTRM_INSTALL_DOCKER" == "1" ]]; then
  install_docker
else
  log "Skipping Docker install because ECTRM_INSTALL_DOCKER is not 1"
fi

if [[ "$ECTRM_INSTALL_NVIDIA_TOOLKIT" == "1" ]]; then
  install_nvidia_container_toolkit
else
  log "Skipping NVIDIA Container Toolkit install because ECTRM_INSTALL_NVIDIA_TOOLKIT is not 1"
fi

if [[ "$ECTRM_INSTALL_TAILSCALE" == "1" ]]; then
  install_tailscale
else
  log "Skipping Tailscale install because ECTRM_INSTALL_TAILSCALE is not 1"
fi

create_service_user_and_dirs
configure_firewall_if_requested
write_profile_hint

log "Phase 1 bootstrap complete"
log "If Docker group membership changed, log out and back in before using docker without sudo."
