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
- Engineering blueprint:
  [docs/engineering/platform-blueprint.md](docs/engineering/platform-blueprint.md)
- AI workflow and prompt-management notes:
  [docs/engineering/ai-workflow.md](docs/engineering/ai-workflow.md)
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
  seeding, and external EIA market-data sync
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
python3 -m venv .venv
. .venv/bin/activate
pip install -r apps/api/requirements.txt
```

### 3. Apply database migrations

```bash
alembic -c apps/api/alembic.ini upgrade head
```

### 4. Run the API

```bash
uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Run the web app in a second terminal

```bash
cd apps/web
npm install
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

## Environment Notes

- Backend example settings live in `apps/api/.env.example`
- Frontend example settings live in `apps/web/.env.example`
- Assistant provider keys and model defaults are configured on the backend in
  `apps/api/.env`
- The web app uses `VITE_API_BASE` when provided, otherwise it points to the
  current host on port `8000`

## Additional Docs

- [Trading source register](docs/engineering/trading-source-register.csv)
- [ETRM trading source register](docs/engineering/trading-source-register-etrm.csv)
- [Trading source seed script](docs/engineering/trading-source-register-seed.psql)
- [Trading source roadmap](docs/engineering/trading-source-roadmap.md)
