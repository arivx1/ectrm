# Client-Server Phase 1 Runbook

## Purpose

Phase 1 makes the gaming PC a trustworthy ECTRM server candidate. It does not
cut over the database, expose the app publicly, or make the server the live
source of truth yet.

The target outcome is a reachable, auditable Linux host with Docker, GPU
container support, explicit storage paths, backup space, and a clear operating
boundary for Codex on both machines.

## Phase 1 Decisions

### Server Authority

The server is the future authoritative runtime host. During Phase 1, the local
machine remains the active development/runtime source unless a later cutover
step says otherwise.

Do not run two writable ECTRM databases as peers. When the server becomes live,
only the server database and server document storage should be treated as
authoritative.

### Network Exposure

Use VPN or LAN access first. Do not expose ECTRM to the public internet during
Phase 1.

Recommended shape:

```text
laptop browser / Codex -> VPN or LAN -> server SSH and future HTTPS
```

Open public HTTPS later only after TLS, auth, backups, restore, and service
supervision have all been tested.

### Host Operating Model

Recommended host baseline:

- Ubuntu Server LTS
- SSH key authentication
- Docker Engine with the Compose plugin
- NVIDIA driver installed on the host
- NVIDIA Container Toolkit configured for Docker
- optional Tailscale or WireGuard for VPN access

### Storage Layout

Use explicit server paths:

```text
/srv/ectrm/config
/srv/ectrm/postgres
/srv/ectrm/documents
/srv/ectrm/backups
/srv/ectrm/logs
/srv/ectrm/models
/srv/ectrm/repo
```

The `config` directory is for server-local runtime configuration. The `postgres`
and `documents` directories are the future durable business state. Backups must
include both the database and document storage.

### Codex Coordination

Codex may run on both machines, but host roles should stay explicit:

- local Codex: code changes, tests, local development, browser smoke checks
- server Codex: provisioning, deploys, logs, backups, migrations, restore tests

Before running server-impacting commands, print or verify:

- `hostname`
- `pwd`
- `git branch --show-current`
- `git status --short`
- target database host/name, with secrets redacted

Migrations, restore, volume deletion, and production environment edits should
be treated as stop-sign operations.

## Local Driver Scripts

The Phase 1 scripts are under `scripts/server`.

Run a remote audit from this repo:

```bash
scripts/server/phase1_remote.sh user@server --audit
```

Run provisioning after reviewing the audit:

```bash
scripts/server/phase1_remote.sh user@server --provision
```

The provisioner is intentionally conservative:

- installs base packages
- installs Docker Engine when missing
- optionally installs NVIDIA Container Toolkit
- creates `/srv/ectrm` directories
- does not enable UFW by default
- does not start ECTRM services
- does not change application data

After provisioning, run a local smoke check on the server:

```bash
scripts/server/phase1_local_smoke.sh
```

When ECTRM services are deployed in a later phase, use the guarded backup and
restore helpers:

```bash
scripts/server/backup_ectrm_state.sh
ECTRM_CONFIRM_RESTORE=RESTORE scripts/server/restore_ectrm_database.sh /srv/ectrm/backups/<timestamp>/database.dump
```

The restore command is destructive and intentionally requires
`ECTRM_CONFIRM_RESTORE=RESTORE`.

## Useful Environment Overrides

Pass overrides before the remote command:

```bash
ECTRM_USER=ectrm \
ECTRM_ROOT=/srv/ectrm \
ECTRM_INSTALL_NVIDIA_TOOLKIT=1 \
ECTRM_INSTALL_TAILSCALE=0 \
ECTRM_ENABLE_UFW=0 \
scripts/server/phase1_remote.sh user@server --provision
```

Set `ECTRM_ENABLE_UFW=1` only after confirming SSH access and console fallback.
Set `ECTRM_OPEN_HTTP_HTTPS=1` only when you deliberately want the server to
listen on ports 80 and 443.

## Phase 1 Exit Criteria

Phase 1 is complete when:

- the server is reachable over SSH by stable hostname or VPN name
- Docker Engine and `docker compose` work
- the GPU is visible through `nvidia-smi`
- a Docker GPU test passes, if local model work is planned
- `/srv/ectrm` storage directories exist
- Codex can audit host identity before operational commands
- no public ECTRM app port is exposed unless explicitly chosen

## Next Phase

Phase 2 should add a server compose stack, reverse proxy, server environment
template, migration workflow, and backup/restore drills before any database
cutover.
