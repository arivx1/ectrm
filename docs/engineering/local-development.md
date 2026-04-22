# Local Development Workflow

## Standard workflow

The project should be developed with a GUI-first workflow:

1. open the repo in your IDE
2. run the API from an IDE run/debug configuration
3. run the web app from an IDE run/debug configuration
4. run projection rebuild scripts from IDE run/debug configurations
5. inspect PostgreSQL with a database GUI

The terminal is still useful, but it should not be the only way to operate the
project locally.

## Recommended tools

- IDE: PyCharm Professional or VS Code
- Python environment: `venv` or Miniconda
- Database GUI: pgAdmin or DBeaver

## Canonical local commands

These are the commands the IDE configurations should wrap. Verification runs
from the repo root through the `Makefile` so local checks and CI can share the
same entrypoints.

### API

```bash
uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Web

```bash
npm run dev
```

Run this from:

```text
apps/web
```

If Vite needs another local port because `5173` is already occupied, the API
should still accept loopback browser origins such as `http://localhost:5174`
and `http://127.0.0.1:5174` as long as loopback origins remain part of the
configured CORS allowlist.

### Rebuild trades projection

```bash
PYTHONPATH=. python apps/api/scripts/rebuild_trades_projection.py
```

### Rebuild positions projection

```bash
PYTHONPATH=. python apps/api/scripts/rebuild_positions_projection.py
```

## Canonical verification commands

Run these from the repo root:

```bash
make api-contract-check
make api-assistant-evals
make api-test
make web-build
make web-lint
make web-test
make verify
```

`make verify` is the aggregate Wave 0 verification path. It assumes:

- `.venv` already exists for the backend
- web dependencies are already installed under `apps/web`

On a clean checkout, run these first:

```bash
make api-install
make web-install
```

If `GET /trades/metadata` changes intentionally, refresh the committed contract
artifact with:

```bash
make api-contract-refresh
```

For the seeded browser smoke harness, run:

```bash
make web-smoke-install
make web-smoke-test
```

This browser path is intentionally separate from `make verify` during Wave 0.
It starts a Vite app server plus a deterministic mock API fixture inside the
Playwright run, so no separately running API or demo database is required.

The CI workflows introduced under the future-ready plan should reuse these same
verification targets instead of redefining parallel command sets.

Use `make api-assistant-evals` explicitly whenever changes affect assistant or
automation behavior. That lane is also part of the repo-level `make verify`
contract now.

The first backend CI lane runs on Python `3.12`, checks the committed trade
metadata contract artifact with `make api-contract-check`, and currently does
not start a PostgreSQL service container because the checked-in backend suite
is using self-contained test database fixtures for the default pull-request
path.

The first web CI lane now uses `make web-install`, `make web-lint`,
`make web-build`, and `make web-test` as the blocking pull-request path so the
frontend verification contract matches the repo-level Make targets.

The first browser smoke CI path is a manual `Browser Smoke` workflow. It uses
`make web-install`, `make web-smoke-install-ci`, and `make web-smoke-test` so
the Playwright startup path matches the local seeded harness contract.
