# API

The API is the system of record for ECTRM. It accepts trade lifecycle events,
serves current-state projections, exposes reference data, and protects admin
operations with session-based access control.

## What It Owns

- trade lifecycle writes through the `/events` endpoint
- current-state trade reads through `/trades`
- position reads through `/positions`
- reference data maintenance through `/reference/*`
- admin workflows such as user management, seeding, trading sources, and
  external market-data sync
- public runtime metadata through `/health`, `/version`, and `/settings/public`
- assistant routing, prompt preview, and managed prompt profiles through
  `/assistant/*`

## Route Groups

- `/health`, `/version`, `/settings/public`: safe service and runtime metadata
- `/assistant/*`: assistant provider status, prompt-context preview, protected
  prompt routing, current-user run lookup, and public managed-agent listing
- `/mcp-status`: public runtime metadata for the ChatGPT MCP scaffold
- `/mcp/login`, `/mcp/whoami`: OAuth browser handoff and identity-debug helpers
  for the ChatGPT MCP surface when OAuth mode is enabled
- `/auth`: bootstrap the first admin, sign in with password or Google, inspect
  the current session, and log out
- `/events`: append and list event rows
- `/trades`: current trade projection
- `/positions`: current position projection
- `/reference/*`: books, commodities, price indices, currencies, units,
  locations, counterparties, and portfolios
- `/reports/*`: exposure and activity summaries
- `/admin/*`: seed data, external-data runs and sync status, EIA/FRED/CFTC/CAISO/ERCOT/Kalshi sync, trading source admin,
  assistant-agent administration, and assistant run audit listings
- `/users`: user account administration

## Access Model

- Public service metadata remains available without authentication.
- Workspace read endpoints such as `/events`, `/trades`, `/positions`,
  `/reference/*`, `/reports/*`, `/settlement/*`, and
  `/operations/workspace-summary` now require a valid session.
- `POST`, `PUT`, `PATCH`, and `DELETE` calls require a valid session, except
  for `/auth/session`, `/auth/google-session`, and `/auth/bootstrap-admin`.
- `/admin/*` and `/users/*` require an `ADMIN` or `OPS_ADMIN` session.

This keeps public runtime metadata open while protecting the operator
workspaces, writes, and governance actions behind an authenticated session.

## Local Setup

From the repo root:

### 1. Create the virtual environment and install dependencies

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r apps/api/requirements.txt
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

### 3. Apply migrations

```bash
alembic -c apps/api/alembic.ini upgrade head
```

### 4. Run the API

```bash
uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000 --reload
```

The default API base URL is `http://127.0.0.1:8000`.

If you want the standard local API and web workflow in one command from the
repo root, use:

```bash
make dev
```

To enable the first ChatGPT MCP scaffold locally, set `MCP_ENABLED=true` in
`apps/api/.env`, run the API normally, and connect an MCP client to:

```text
http://127.0.0.1:8000/mcp/
```

The current scaffold is intentionally read-only. It exposes `search` and
`fetch` over checked-in repo docs only.

If you also want the MCP surface to require a real ECTRM identity, enable the
OAuth bridge with at least:

```text
MCP_AUTH_MODE=oauth
MCP_OAUTH_ISSUER_URL=http://127.0.0.1:8000/mcp
MCP_OAUTH_SIGNING_SECRET=<strong-random-secret>
```

The current first pass keeps the browser-side authorization UI deliberately
narrow:

- password sign-in against existing ECTRM local users
- optional single-user login when `SINGLE_USER_AUTH_ENABLED=true`
- no Google sign-in inside the MCP OAuth page yet

For ChatGPT developer mode beyond localhost, `MCP_OAUTH_ISSUER_URL` should be a
public HTTPS URL that resolves to the mounted `/mcp` base.

## Verification

From the repo root, the canonical backend verification wrapper is:

```bash
make api-contract-check
make api-mcp-test
make api-assistant-evals
make api-test
```

On a clean checkout, run:

```bash
make api-install
```

first so the local virtual environment exists.

The first GitHub Actions backend lane uses the same commands:

```bash
make api-install
make api-contract-check
make api-assistant-evals
make api-test
```

It currently runs on Python `3.12` and does not provision PostgreSQL, because
the checked-in backend test suite uses self-contained test database fixtures
for the default CI path.

`make api-mcp-test` is the narrow MCP transport lane. Use it whenever changes
touch `/mcp`, MCP auth, or the published `search` and `fetch` tools.

`make api-assistant-evals` is the explicit assistant-governance eval gate. Use
it whenever changes affect prompt behavior, provider fallback, tool access, or
approval-gated action flows.

## Server-Owned Metadata

`GET /trades/metadata` is now the authoritative contract for backend-governed
trade vocabulary, server-defaulted status behavior, and option/pricing
validation rules. Web clients should consume that endpoint instead of
re-declaring the same semantics locally.

The committed contract artifact for that seam lives at
`apps/api/contracts/trade-metadata.contract.json`. Refresh it after intentional
backend contract changes with:

```bash
make api-contract-refresh
```

## Helpful Local Scripts

Seed reference data and sample transactions:

```bash
PYTHONPATH=. python apps/api/scripts/seed_demo_data.py --target all --action replace --requested-by local-demo
```

Seed the trading source register:

```bash
PYTHONPATH=. python apps/api/scripts/seed_trading_sources.py
```

Rebuild the trade projection:

```bash
PYTHONPATH=. python apps/api/scripts/rebuild_trades_projection.py
```

Rebuild the position projection:

```bash
PYTHONPATH=. python apps/api/scripts/rebuild_positions_projection.py
```

Audit trade projection rows whose `last_event_id` linkage is inconsistent:

```bash
PYTHONPATH=. python apps/api/scripts/audit_trade_projection_integrity.py
```

Audit and remove only auto-cleanable orphan trade projections:

```bash
PYTHONPATH=. python apps/api/scripts/audit_trade_projection_integrity.py --clean
```

Run one scheduler cycle for market data:

```bash
PYTHONPATH=. python apps/api/scripts/run_market_data_scheduler.py --max-cycles 1
```

Run one scheduler cycle for Kalshi only:

```bash
PYTHONPATH=. python apps/api/scripts/run_market_data_scheduler.py --provider kalshi --max-cycles 1
```

Normalize a Robinhood CSV export for analysis:

```bash
PYTHONPATH=. python apps/api/scripts/import_robinhood_csv.py \
  --input /absolute/path/to/robinhood-account-activity.csv \
  --format json \
  --include-raw
```

This writes `/absolute/path/to/robinhood-account-activity.normalized.json` by
default. Use `--format csv` to emit a flat normalized CSV instead.

Summarize a Robinhood CSV export into cash-flow and symbol rollups:

```bash
PYTHONPATH=. python apps/api/scripts/summarize_robinhood_csv.py \
  --input /absolute/path/to/robinhood-account-activity.csv \
  --json-output /absolute/path/to/robinhood-summary.json
```

## Configuration

Example settings live in `apps/api/.env.example`.

The most important settings are:

- `DATABASE_URL`: PostgreSQL connection string
- `ECTRM_API_LOG_LEVEL`: backend log verbosity for request and error logging
- `CORS_ALLOW_ORIGINS`: allowed web origins
- `BOOTSTRAP_ADMIN_TOKEN`: enables first-admin creation through the API
- `GOOGLE_AUTH_ENABLED`, `GOOGLE_AUTH_CLIENT_ID`: expose Google sign-in in the
  web app, validate Google identity tokens on the API, and enable the
  browser-side Google Calendar panel in Settings when a client ID is present
- `GOOGLE_AUTH_AUTO_CREATE_USERS`: optionally create a local account the first
  time a valid Google user signs in
- `GOOGLE_AUTH_DEFAULT_ROLE`: role assigned to auto-created Google users
- `PROJECTION_MONITORING_EMAIL_*`: outbound email transport used when the
  projection-monitoring policy includes the `EMAIL` delivery channel
- `GMAIL_INBOX_*`: inbound Gmail attachment intake for importing PDF emails
  into the document-ingestion queue
- `SESSION_TTL_HOURS`: how long sessions stay valid
- `ASSISTANT_ENABLED`: global switch for assistant routing
- `ASSISTANT_DEFAULT_PROVIDER`: which provider the API prefers by default
- `ASSISTANT_COMPANY_NAME`: organization name included in the prompt
  foundation
- `ASSISTANT_COMPANY_CONTEXT`: reusable company context added to assistant
  prompts
- `ASSISTANT_BUSINESS_CONTEXT`: reusable operating-model context added to
  assistant prompts
- `MCP_ENABLED`: enables the first remote MCP scaffold for ChatGPT developer
  mode and MCP Inspector testing
- `MCP_AUTH_MODE`: `none` for the original local docs-only surface or `oauth`
  to require ChatGPT and other MCP clients to authenticate as explicit ECTRM
  users
- `MCP_SERVER_NAME`, `MCP_SERVER_INSTRUCTIONS`: configure the public-facing MCP
  server identity and read-only guidance
- `MCP_DOCS_RESULT_LIMIT`: caps how many doc matches the starter `search` tool
  returns
- `MCP_DOCS_REPO_URL_OVERRIDE`: optional canonical repo URL override for MCP
  search and fetch citations when local git remotes are unavailable or
  unsuitable
- `MCP_OAUTH_ISSUER_URL`: absolute mounted `/mcp` URL advertised to OAuth-capable
  MCP clients; use localhost only for local testing and HTTPS for hosted use
- `MCP_OAUTH_SIGNING_SECRET`: HMAC secret used to sign MCP OAuth access and
  refresh tokens
- `MCP_OAUTH_REQUIRED_SCOPES`: space-delimited scopes granted to the first
  read-only MCP tool family
- `MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS`,
  `MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS`,
  `MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS`: expiry controls for the OAuth
  access-token, refresh-token, and authorization-code lifecycle
- `use_live_tools` on assistant requests: exposes read-only runtime data tools
  to the selected model provider, executes requested tool calls server-side,
  and returns tool-call traces with the response; prompt preview stays a pure
  grounding preview and does not execute those tools
- `ASSISTANT_MAX_TOOL_ROUNDS`: caps how many live tool-execution rounds the
  assistant can take during one response
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`: enable GPT, Claude,
  and Gemini respectively
- `OPENAI_AGENT_BUILDER_MODEL`: optional override for the OpenAI model used
  when the admin agent builder generates a managed-agent draft
- `EIA_API_KEY`: unlocks external EIA sync
- `FRED_API_KEY`: unlocks external FRED sync
- `CAISO_BASE_URL`: points at the CAISO OASIS current hub-price page used for public power sync
- `ERCOT_BASE_URL`: points at the ERCOT real-time settlement point display page used for public power sync
- `EIA_SYNC_INTERVAL_MINUTES`, `FRED_SYNC_INTERVAL_MINUTES`, `CFTC_SYNC_INTERVAL_MINUTES`, `CAISO_SYNC_INTERVAL_MINUTES`, `ERCOT_SYNC_INTERVAL_MINUTES`: scheduler cadence targets and freshness guidance for market-data providers

Failed API responses include an `x-correlation-id` response header. Auth and
unhandled-error payloads also include the same correlation ID in the JSON body,
and the web client now surfaces that ID in error banners so operators can match
a visible failure to the backend request log quickly.
- `KALSHI_BASE_URL`: points at the Kalshi REST API for public market data
- `KALSHI_SYNC_INTERVAL_MINUTES`, `KALSHI_SYNC_SUCCESS_SLA_HOURS`: control
  when Kalshi is considered due and when the sync is considered stale

## Browser Google Calendar Panel

The Settings workspace can show upcoming Google Calendar events without routing
calendar traffic through the API. To enable that panel:

1. In Google Cloud, create or select the project that will own the browser-side
   calendar access.
2. Enable the Google Calendar API in that project.
3. If Google prompts for it, complete the OAuth consent setup for the project.
4. Create an OAuth client ID with application type `Web application`.
5. Under authorized JavaScript origins, add the local web origins you use for
   ECTRM, such as:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - any alternate local Vite origin you actually run, such as
     `http://localhost:5174`
6. Copy the client ID value. It should look similar to:

   ```text
   1234567890-abc123def456.apps.googleusercontent.com
   ```

7. Add it to `apps/api/.env`:

   ```text
   GOOGLE_AUTH_CLIENT_ID=1234567890-abc123def456.apps.googleusercontent.com
   ```

8. Restart the API and reload the Settings workspace.

`GOOGLE_AUTH_ENABLED=true` is only required when you also want Google-based app
sign-in. The calendar panel itself only needs the exposed client ID because the
browser requests `calendar.readonly` access directly from Google.

Implementation notes:

- Set the client ID, not the client secret.
- The API exposes `GOOGLE_AUTH_CLIENT_ID` through `GET /settings/public`, and
  the browser uses that value to request Google Calendar readonly access
  directly from Google.
- The Google access token stays in the browser session for this panel and is
  not persisted by the ECTRM API.

## Gmail Inbox Delivery

Projection monitoring already has an outbound email seam. If you want those
alerts to land in a Gmail or Google Workspace inbox instead of the local email
archive fallback, configure the API with:

- `PROJECTION_MONITORING_EMAIL_SMTP_HOST=smtp.gmail.com`
- `PROJECTION_MONITORING_EMAIL_SMTP_PORT=587`
- `PROJECTION_MONITORING_EMAIL_FROM=<your-google-address>`
- `PROJECTION_MONITORING_EMAIL_SMTP_USERNAME=<your-google-address>`
- `PROJECTION_MONITORING_EMAIL_SMTP_PASSWORD=<google-app-password>`

Then make sure the target Gmail address is either:

- listed in `PROJECTION_MONITORING_EMAIL_RECIPIENTS`, or
- attached to an active admin-capable user account in ECTRM

If `PROJECTION_MONITORING_EMAIL_SMTP_HOST` is blank, the `EMAIL` channel stays
local-first and records delivery into the archived sink instead of sending to
an external inbox.

## Gmail Inbox Intake

The document workspace can also pull PDF attachments directly from a Gmail or
Google Workspace inbox and run them through the same governed document
ingestion pipeline used for manual uploads.

Configure the API with:

- `GMAIL_INBOX_ENABLED=true`
- `GMAIL_INBOX_CLIENT_ID=<google-oauth-client-id>`
- `GMAIL_INBOX_CLIENT_SECRET=<google-oauth-client-secret>`
- `GMAIL_INBOX_REFRESH_TOKEN=<google-oauth-refresh-token>`
- `GMAIL_INBOX_ACCOUNT_EMAIL=<mailbox-address>`
- `GMAIL_INBOX_QUERY=has:attachment filename:pdf in:inbox`

The current first-pass import is intentionally narrow:

- it reads Gmail through the read-only Gmail API
- it lets authenticated users browse recent matching Gmail messages in the
  Document Intake workspace before importing anything
- it imports PDF attachments only
- it stages those files as `document_ingestion` records instead of mutating
  business records directly
- it records per-message receipts so the same attachment is not imported twice

Once configured, authenticated users can call `POST /documents/imports/gmail`
or use the Documents workspace button to pull the next batch into the review
queue. The same workspace now reads `GET /documents/gmail/messages` and
`GET /documents/gmail/messages/{message_id}` to render a read-only in-app inbox
browser for the configured mailbox.

## Implementation Shape

- `app/main.py`: app startup, middleware, router wiring, and public settings
- `app/routes`: API route handlers
- `app/models`: SQLAlchemy models
- `app/schemas`: Pydantic request and response models
- `alembic`: database migrations
- `scripts`: rebuild and seed helpers
- `tests`: API and domain-level tests

## Assistant Governance

Managed assistant agents can now carry both an `allowed_tools` list and a
separate `allowed_action_types` list in addition to their capability tags.
This means:

- `READ` no longer implies unrestricted access to every published live tool
- `ACTION` no longer implies unrestricted access to every approval-gated
  mutation type

Admins can pin each agent to the exact read-only tool subset and action subset
it is allowed to use. The admin data routes also expose a curated assistant
agent seed action for opinionated defaults such as `trade-ops-copilot`,
`settlement-copilot`, and `trade-governor`.

Each successful or failed assistant response also records an `assistant_run`
row for auditability. Those records capture the resolved runtime, prompt
sections, warnings, tool traces, token usage, user/session metadata, and the
final assistant or provider-error outcome.

The backend also includes a fixture-style managed-agent eval suite in
`apps/api/tests/test_assistant_evals.py`. It runs `/assistant/respond` through
the real API stack with mocked provider responses and asserts expected
warnings, tool usage, action-request staging, and persisted run traces.

Run it with:

```bash
PYTHONPATH=/Users/anthonyrivich/Documents/GitHub/ectrm ./.venv/bin/python -m unittest \
  apps.api.tests.test_assistant_evals
```

## Kalshi Setup

Kalshi market data plugs into the generic `external_series` framework. The
current implementation stores one daily candlestick-derived observation per
configured market, which fits the existing per-day observation model.

1. Create an external series definition with `POST /admin/external-data/series-definitions`.
2. Use `provider="KALSHI"` and set `series_id` to the Kalshi market ticker.
3. Optionally set `dataset_code` to the Kalshi series ticker. If omitted, the
   sync infers it from the market ticker prefix.
4. Leave `transform_rule` blank to default to `field:price.close_dollars`, or
   provide another candlestick field such as `field:price.mean_dollars` or
   `field:volume_fp`.
5. Run the sync with `POST /admin/external-data/kalshi/sync` or the helper
   script below.

Example script call:

```bash
PYTHONPATH=. python apps/api/scripts/sync_external_series_data.py \
  --provider kalshi \
  --series-code KALSHI_FED_2026_RATE_CUT \
  --lookback-days 30 \
  --requested-by local-admin
```
