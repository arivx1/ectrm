# Web App

This app is the operator-facing ECTRM console. It presents the platform as a
set of workspaces instead of a single screen, making it easier to move between
trade capture, lifecycle review, reference data maintenance, admin operations,
and runtime settings.

## Main Workspaces

- `Guide`: read the checked-in operator guide without leaving the app
- `Dashboard`: high-level status, activity, and exposure
- `Trades`: capture, inspect, amend, or cancel an individual trade
- `Events`: review the event timeline
- `Positions`: inspect net commodity exposure
- `Reference Data`: maintain controlled master data
- `Admin`: user management, external-data visibility, and governance-oriented
  system views
- `Settings`: authentication and runtime overrides
- `Assistant`: send prompts through the backend to GPT, Claude, or Gemini with
  optional in-app context grounding

## Local Run

From `apps/web`:

```bash
npm install
npm run dev
```

Useful companion commands:

```bash
npm run build
npm run lint
npm run preview
```

The default local URL is `http://localhost:5173`.

## API Connection

The frontend uses these settings from `apps/web/.env.example`:

- `VITE_API_BASE`: full API base URL
- `VITE_API_PORT`: fallback port when `VITE_API_BASE` is not set
- `VITE_BOOTSTRAP_EVENTS_LIMIT`: bootstrap event list size
- `VITE_SELECTED_TRADE_EVENTS_LIMIT`: selected-trade event list size
- `VITE_BOOTSTRAP_REFERENCE_LIMIT`: reference data bootstrap size
- `VITE_BOOTSTRAP_EXTERNAL_RUNS_LIMIT`: admin external-run bootstrap size
- `VITE_BOOTSTRAP_TRADING_SOURCES_LIMIT`: trading source bootstrap size

If `VITE_API_BASE` is not provided, the app points to the current hostname on
port `8000`. The checked-in local default uses `http://127.0.0.1:8000` to
avoid machines where `localhost:8000` is already claimed by another process.

## What The App Loads

On startup the app pulls a workspace bootstrap package that includes:

- API health
- trades
- events
- positions
- books
- commodities
- price indices
- currencies
- units
- locations
- counterparties
- portfolios

If the current session has admin access, it also loads:

- external data runs
- external data sync status
- trading sources

## Authentication Behavior

- read-only browsing works for most standard data
- signing in unlocks write operations
- admin-capable sessions unlock protected admin panels
- the browser stores the active session locally so page refreshes can restore
  it

The Settings workspace is the main place to sign in, sign out, or bootstrap the
first admin user. The Assistant workspace also requires a signed-in session
because prompt submission is protected server-side.

## Key Source Areas

- `src/App.tsx`: top-level state, data loading, and workspace routing
- `src/workspaces`: page-level workspace UIs
- `src/features`: workflow-specific logic, especially trade and reference-data
  flows
- `src/entities`: API-facing data loaders and mutations
- `src/shared`: models, formatting, API helpers, and runtime config

## Best Companion Docs

- Product walkthrough: `docs/operator-guide.md`
- Repo overview: `README.md`
- Backend guide: `apps/api/README.md`
