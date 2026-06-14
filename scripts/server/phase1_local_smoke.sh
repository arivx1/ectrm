#!/usr/bin/env bash
set -euo pipefail

echo "[phase1-smoke] host=$(hostname) user=$(id -un) date=$(date -Is)"

echo "[phase1-smoke] docker version"
docker --version
docker compose version
docker info --format 'server={{.ServerVersion}} root={{.DockerRootDir}}'

if command -v nvidia-smi >/dev/null 2>&1; then
  echo "[phase1-smoke] nvidia-smi"
  nvidia-smi
else
  echo "[phase1-smoke] nvidia-smi not found"
fi

if [[ "${ECTRM_RUN_GPU_CONTAINER_SMOKE:-0}" == "1" ]]; then
  echo "[phase1-smoke] docker gpu smoke"
  docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi
else
  echo "[phase1-smoke] skipping GPU container smoke; set ECTRM_RUN_GPU_CONTAINER_SMOKE=1 to run"
fi

echo "[phase1-smoke] storage layout"
for path in \
  "${ECTRM_ROOT:-/srv/ectrm}" \
  "${ECTRM_ROOT:-/srv/ectrm}/config" \
  "${ECTRM_ROOT:-/srv/ectrm}/postgres" \
  "${ECTRM_ROOT:-/srv/ectrm}/documents" \
  "${ECTRM_ROOT:-/srv/ectrm}/backups" \
  "${ECTRM_ROOT:-/srv/ectrm}/logs" \
  "${ECTRM_ROOT:-/srv/ectrm}/models" \
  "${ECTRM_ROOT:-/srv/ectrm}/repo"; do
  test -d "$path"
  ls -ld "$path"
done

echo "[phase1-smoke] ok"
