# ECTRM

ECTRM is a prototype commodity trading and risk platform built around an
event-led backend and an operator-facing web console. It combines trade
capture, audit-friendly event history, reference data stewardship, exposure
views, and a small set of admin controls in one repo.

This project is a good fit for:

- semi-technical users who need to understand what the platform does
- product and operations partners who want a guided walkthrough
- engineers who need a repo-level starting point before diving deeper

## Start Here

- Semi-technical product and operations guide:
  [docs/operator-guide.md](docs/operator-guide.md)
- Backend guide: [apps/api/README.md](apps/api/README.md)
- Frontend guide: [apps/web/README.md](apps/web/README.md)
- Coding-agent guide: [AGENTS.md](AGENTS.md)
- Engineering blueprint:
  [docs/engineering/platform-blueprint.md](docs/engineering/platform-blueprint.md)
- Governed core platform roadmap:
  [docs/engineering/core-platform-roadmap.md](docs/engineering/core-platform-roadmap.md)
- AI workflow and prompt-management notes:
  [docs/engineering/ai-workflow.md](docs/engineering/ai-workflow.md)
- Agent context and configuration work packages:
  [docs/engineering/agent-context-work-packages.md](docs/engineering/agent-context-work-packages.md)
- Agent autonomy rubric:
  [docs/engineering/agent-autonomy-rubric.md](docs/engineering/agent-autonomy-rubric.md)
- Agent platform Phase 1 roadmap:
  [docs/engineering/agent-platform-phase-1-roadmap.md](docs/engineering/agent-platform-phase-1-roadmap.md)
- Agent knowledge base:
  [docs/engineering/agent-knowledge-base.md](docs/engineering/agent-knowledge-base.md)
- Local development notes:
  [docs/engineering/local-development.md](docs/engineering/local-development.md)

## What The Platform Does

- captures new trades and records every lifecycle change as an event
- rebuilds current trade state and net positions from that event history
- manages reference data such as books, commodities, price indices,
  currencies, units, locations, counterparties, and portfolios
- exposes operator workspaces for guide, dashboard, trades, events, positions,
  reference data, admin, settings, and a provider-routed assistant
- supports administrative tasks such as user management, trading source
  seeding, and external EIA/FRED/CFTC/Kalshi market-data sync
- can proxy assistant prompts through GPT, Claude, or Gemini when the
  corresponding backend API keys are configured
- can manage assistant-agent prompt profiles and build server-owned prompt
  context from the authenticated user, business model, and current data

## How It Works In Plain English

- An `event` is the permanent record of something that happened, such as a
  trade being created, amended, or cancelled.
- A `trade` is the current business view of that history after the relevant
  events are applied.
- A `position` is an aggregated exposure view, grouped by commodity.
- `reference data` is the approved list of values the platform relies on when
  users capture or maintain records.
- `admin` features are protected so only admin-capable sessions can use them.

If you only need the product walkthrough, the
[operator guide](docs/operator-guide.md) is the best next stop.

## Repository Map

- `apps/api`: FastAPI backend, database models, Alembic migrations, scripts,
  and tests
- `apps/web`: React + Vite operator console
- `docs`: product, engineering, and architecture notes
- `specs`: focused implementation and requirements notes
- `packages`: shared package workspace reserved for cross-app code

## Quick Local Start

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Create the Python environment and install backend dependencies

```bash
make api-install
```

### 3. Apply database migrations

```bash
alembic -c apps/api/alembic.ini upgrade head
```

### 4. Run the API

```bash
make api-dev
```

### 5. Run the web app in a second terminal

```bash
make web-install
cd apps/web
npm run dev
```

The default local URLs are:

- API: `http://127.0.0.1:8000`
- Web: `http://localhost:5173`

### Optional: Load demo records

From the repo root, with the Python virtual environment active:

```bash
PYTHONPATH=. python apps/api/scripts/seed_demo_data.py --target all --action replace --requested-by local-demo
```

This loads reference data and sample transactions so the workspaces are easier
to explore.

## Verification

Run these commands from the repo root:

```bash
make api-contract-check
make api-assistant-evals
make api-test
make web-build
make web-lint
make web-test
make verify
```

`make verify` assumes the Python virtual environment already exists and the web
dependencies have already been installed. On a clean checkout, run:

```bash
make api-install
make web-install
```

If the backend-owned trade metadata contract changes intentionally, refresh the
committed artifact before pushing:

```bash
make api-contract-refresh
```

before the verification targets.

If assistant or automation behavior changes, run the explicit eval lane too:

```bash
make api-assistant-evals
```

For the seeded browser smoke harness, install Chromium once and run:

```bash
make web-smoke-install
make web-smoke-test
```

The browser smoke path is intentionally separate from `make verify` during Wave
0. It boots a Vite app server plus a deterministic mock API fixture inside the
test process, so it does not require a separately running backend. GitHub
Actions has a matching manual `Browser Smoke` workflow that uses the same
`make web-smoke-test` entrypoint after installing Playwright's Linux browser
dependencies.

## Environment Notes

- Backend example settings live in `apps/api/.env.example`
- Frontend example settings live in `apps/web/.env.example`
- Assistant provider keys and model defaults are configured on the backend in
  `apps/api/.env`
- The web app uses `VITE_API_BASE` when provided, otherwise it points to the
  current host on port `8000`

## Additional Docs

- [Business use case roadmap](docs/engineering/business-use-case-roadmap.md)
- [Governed core platform roadmap](docs/engineering/core-platform-roadmap.md)
- [Governed core platform slice lock](docs/engineering/core-platform-slice-lock.md)
- [Governed core platform boundary reset](docs/engineering/core-platform-boundary-reset.md)
- [Governed core trade command model](docs/engineering/core-platform-trade-command-model.md)
- [Governed core platform work packages](docs/engineering/core-platform-work-packages.md)
- [Trader/Risk MVP work packages](docs/engineering/trader-risk-mvp-work-packages.md)
- [Trading EOD work packages](docs/engineering/trading-eod-work-packages.md)
- [Trading source register](docs/engineering/trading-source-register.csv)
- [ETRM trading source register](docs/engineering/trading-source-register-etrm.csv)
- [Trading source candidates](docs/engineering/trading-source-candidates.csv)
- [Trading source candidate guide](docs/engineering/trading-source-candidates.md)
- [Trading source seed script](docs/engineering/trading-source-register-seed.psql)
- [Trading source roadmap](docs/engineering/trading-source-roadmap.md)
- [Future-ready engineering work packages](docs/engineering/future-ready-engineering-work-packages.md)
- [Future-ready Wave 0 tickets](docs/engineering/future-ready-wave-0-tickets.md)
- [Agent platform Phase 1 tickets](docs/engineering/agent-platform-phase-1-tickets.md)
- [Prompt-first operator experience work packages](docs/engineering/prompt-first-operator-experience-work-packages.md)
- [ChatGPT MCP work packages](docs/engineering/chatgpt-mcp-work-packages.md)
- [Agent role catalog](docs/engineering/agent-role-catalog.md)
- [Human-agent authority matrix](docs/engineering/human-agent-authority-matrix.md)
- [Canonical work object inventory](docs/engineering/canonical-work-object-inventory.md)
