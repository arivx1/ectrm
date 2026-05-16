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
- `Library`: browse uploaded PDFs with search, preview, and review status in
  one place
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

From the repo root, `make dev` starts PostgreSQL, the API, and this Vite app
together and shuts them all down on `Ctrl+C`.

Useful companion commands:

```bash
npm run build
npm run lint
npm test
npm run test:smoke
npm run preview
```

From the repo root, the canonical verification wrappers are:

```bash
make web-install
make web-build
make web-lint
make web-test
make web-smoke-test
```

The first GitHub Actions web lane uses the same shared entrypoints:

```bash
make web-install
make web-lint
make web-build
make web-test
```

The default local URL is `http://localhost:5173`.

## Browser Smoke Harness

The repo now has a dedicated Playwright smoke harness for high-visibility
browser flows. It uses a self-hosted Vite app server plus deterministic fixture
data from `tests/browser/support` instead of depending on a separately started
API or demo database.

The current Wave 0 smoke suite covers:

- seeded dashboard boot
- mobile shell drawer behavior at phone width
- signed-out start-here routing into the auth gate
- signed-in trade capture through one deterministic create-ticket path
- admin-governed assistant approval rejection and execution through the seeded inbox

The signed-in trade capture smoke uses the seeded local `OPS_ADMIN` session and
captures one fixed-price natural gas ticket against the deterministic
`WEST_POWER` / `WAHA_GAS` fixture set. The harness creates `TRD-10001` and
expects the form to reset to the next suggested identifier after the mutation
lands.

The first governance smoke targets the assistant approval inbox rather than a
generic admin CRUD surface because it exercises the clearest trust boundary in
the current product: a cross-user assistant action that must be reviewed and
explicitly rejected or executed by an administrative human.

Run it from the repo root:

```bash
make web-smoke-install
make web-smoke-test
```

On GitHub Actions, the manual `Browser Smoke` workflow uses the same
`make web-smoke-test` command after installing Chromium with Linux system
dependencies.

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

- service metadata such as runtime health can load without signing in
- signing in unlocks the protected workspace reads and all write operations
- admin-capable sessions unlock protected admin panels
- the browser stores the active session locally so page refreshes can restore
  it

The Settings workspace is the main place to sign in, sign out, or bootstrap the
first admin user. The Assistant workspace also requires a signed-in session
because prompt submission is protected server-side. Most operator-facing
workspaces now expect an authenticated session before they can load their data.

## Google Calendar In Settings

The Settings workspace includes a browser-side Google Calendar panel for
pulling the next few events into the app without routing calendar traffic
through the ECTRM API. That same panel now owns the Home timeline overlay
preferences for the day, week, and month cards.

To enable that UI locally:

1. Set `GOOGLE_AUTH_CLIENT_ID` in `apps/api/.env` to a Google OAuth web client
   ID.
2. Restart the API so `GET /settings/public` exposes the configured client ID
   to the web app.
3. Make sure the Google OAuth client allows the local web origins you use,
   such as `http://localhost:5173` and `http://127.0.0.1:5173`.
4. Enable the Google Calendar API in the same Google Cloud project.

Behavior notes:

- `GOOGLE_AUTH_ENABLED=true` is only required when you also want Google-based
  app sign-in. The calendar panel itself only needs the client ID.
- The browser requests Google `calendar.readonly` access directly from Google.
- The Google access token and fetched calendar events stay in browser storage
  for the local session and are not persisted by the ECTRM API.

## Key Source Areas

- `src/App.tsx`: top-level state, data loading, and workspace routing
- `src/workspaces`: page-level workspace UIs
- `src/workspaces/library`: dedicated uploaded-document browser and review
  surface
- `src/features`: workflow-specific logic, especially trade and reference-data
  flows
- `src/entities`: API-facing data loaders and mutations
- `src/shared`: models, formatting, API helpers, and runtime config

## Best Companion Docs

- Product walkthrough: `docs/operator-guide.md`
- Repo overview: `README.md`
- Backend guide: `apps/api/README.md`
