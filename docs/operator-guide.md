# ECTRM Operator Guide

This guide is for semi-technical users: product managers, business analysts,
operators, implementation partners, and anyone who needs to understand the
platform without reading application code.

## What ECTRM Is

ECTRM is a prototype operator console for commodity trading and risk workflows.
It brings together:

- trade capture and lifecycle updates
- audit-friendly event history
- position and exposure views
- reference data maintenance
- admin and runtime controls

The product is organized as a set of workspaces in the web app, backed by a
FastAPI service and a PostgreSQL database.

## The Main Idea

ECTRM is built around events and projections.

- An `event` is the durable record of a business action.
  Examples: `TradeCreated`, `TradeAmended`, `TradeCancelled`.
- A `projection` is a convenient read model built from those events.
  Examples: the current `trades` view and the aggregated `positions` view.
- `reference data` is the controlled list of valid values used across the app.
  Examples: books, commodities, price indices, currencies, units,
  counterparties, and portfolios.

If you remember one thing, it is this: the system stores what happened, then
builds user-friendly views from that history.

## Key Business Objects

- `Book`: the trading container a deal belongs to
- `Commodity`: the traded product or exposure driver
- `Counterparty`: the external company or trading partner on the deal
- `Portfolio`: an optional reporting or ownership grouping under a book
- `Price index`: a named market reference used for index-linked pricing
- `Trade`: the current state of a commercial position
- `Position`: the net exposure derived from active trades

## Workspaces In The Web App

### Guide

Use Guide when you need product context without leaving the application.

- read the checked-in operator guide from inside the console
- jump between concepts, workflows, and access notes quickly
- move straight from a help section into the workspace you need next

### Dashboard

Use Dashboard when you want a quick operational picture.

- highlights current system health
- surfaces recent trade activity and event flow
- summarizes exposure without forcing users into raw tables first

### Trades

Use Trades when you need to capture a deal or work on one that already exists.

- capture a new trade
- select a trade from the list
- inspect the current state
- switch between overview, events, amend, and risk tabs
- cancel or amend a trade without leaving the workspace

This is the main lifecycle workspace for both entry and follow-on changes.

### Events

Use Events when you need chronology and auditability.

- review the event stream as a timeline
- filter to a specific aggregate when you need detail
- confirm the exact order in which lifecycle changes were recorded

This is especially useful when the current state looks surprising and you want
to understand why.

### Positions

Use Positions for net exposure and risk-oriented review.

- see exposure summarized by commodity class
- inspect commodity-level position rows
- confirm whether active trades are contributing the expected net volume

This workspace is read-focused and helps translate transaction activity into a
risk view.

### Reference Data

Use Reference Data to maintain controlled master data.

Today it covers:

- books
- commodities
- price indices
- currencies
- units
- locations
- counterparties
- portfolios

Why it matters:

- trade capture depends on these lists
- dropdowns stay consistent across the app
- inactive records can be blocked from unsafe changes when active trades still
  depend on them

### Admin

Use Admin for governance and operational support.

Current admin-facing capabilities include:

- user management
- external EIA market-data sync monitoring
- trading source register access
- schema and explainability-oriented summaries

This workspace is intentionally more technical than Dashboard or Trades, but it
still presents the system in product language rather than database language.

### Settings

Use Settings for access and runtime setup.

- sign in with an existing account
- bootstrap the first admin account when the API is configured for it
- review safe runtime settings exposed by the backend
- change browser-side API and query-limit overrides for local testing
- connect Google Calendar in the browser to pull the next few scheduled events
  into the app without storing Google calendar data on the ECTRM API

If you need to make changes and the app is behaving like read-only software,
this is the first place to check.

## Typical Workflows

### 1. Explore The App Locally

1. Start PostgreSQL, the API, and the web app.
2. Open the web console.
3. If no admin account exists yet and bootstrap is enabled, use Settings to
   create the first admin.
4. If needed, load demo data so the tables and dashboards are populated.

For the exact local commands, start with
[README.md](../README.md),
[apps/api/README.md](../apps/api/README.md), and
[apps/web/README.md](../apps/web/README.md).

### 2. Capture A Trade

Start from Trades.

- choose the book and commodity
- fill in core header fields such as counterparty, portfolio, pricing status,
  settlement status, and trader
- choose the trade structure
- for single-leg trades, enter the primary side and volume
- for swap trades, use the leg editor and provide at least two complete legs
- choose the pricing type
- add a price index only when the pricing method needs one
- submit the trade

Behind the scenes, the app sends a `TradeCreated` event and refreshes the
trade and position views.

### 3. Amend Or Cancel A Trade

1. Open the Trades workspace.
2. Select the trade.
3. Review the current state and event history.
4. Open the Amend tab to change the allowed fields.
5. Save the amendment or cancel the trade.

An amendment adds another event rather than silently rewriting history.

### 4. Review Why A Trade Looks Wrong

1. Open Trades and select the trade.
2. Check the Events tab for the trade-specific history.
3. Open the broader Events workspace if you need wider system context.
4. Check Positions to see how the trade is affecting exposure.

This is the basic operator path for explainability.

### 5. Maintain Reference Data Safely

1. Open Reference Data.
2. Choose the record type, such as books or commodities.
3. Create, edit, activate, or deactivate records.
4. If deactivation is blocked, review the active trades that still depend on
   that record before retrying.

This helps prevent broken dropdowns and invalid trade capture.

### 6. Work With Admin Features

Admin-capable users can:

- create or deactivate user accounts
- inspect external market-data sync runs
- trigger seeded trading source refreshes
- use schema and provenance views to explain how events feed projections

### 7. Connect Google Calendar In Settings

1. Open Settings.
2. Scroll to the Google Calendar panel.
3. If the panel says the calendar connection is not configured, ask your
   implementation team to set `GOOGLE_AUTH_CLIENT_ID` on the API and restart
   it.
4. Once enabled, connect your Google account and grant readonly calendar
   access.
5. Choose the calendar you want and refresh when you need a newer snapshot.

The current UI only reads upcoming events for the next 7 days. The Google
token and event content stay browser-side for this feature, persist in this
browser until you disconnect or clear site data, and are not stored by the
ECTRM API.

## Roles And Access

The codebase currently enforces two broad access patterns:

- read access is open for most standard endpoints
- write actions require an authenticated session

Administrative surfaces are stricter.

- `/admin/*` routes require `ADMIN` or `OPS_ADMIN`
- `/users` routes also require `ADMIN` or `OPS_ADMIN`

The UI also suggests other business-facing roles such as `TRADER`,
`OPERATIONS`, and `VIEWER`. Today, the strongest hard gate is whether the
session is admin-capable.

## What Makes This Different From A Plain CRUD App

In a basic CRUD system, the software usually edits the current trade row in
place and moves on.

ECTRM instead keeps the event history and derives the current view from it.
That makes it easier to answer questions like:

- What changed?
- When did it change?
- Who triggered the change?
- Why does the current trade look different from what I entered earlier?

This design is helpful for auditability, projection rebuilds, and operational
explainability.

## Common Questions

### Why do trades and events both exist?

Events are the durable history. Trades are the fast current-state view built
from that history.

### Why do positions sometimes need a rebuild?

Positions are a projection. If the logic changes or data drifts, rebuild
scripts can regenerate the projection from the event stream.

### Why can a reference record be deactivated in some cases but not others?

The app tries to prevent unsafe deactivation when active trades still depend on
the record.

### Why is Admin empty or limited for some users?

Because admin endpoints require an `ADMIN` or `OPS_ADMIN` session.

## Where To Go Next

- Product and repo overview: [README.md](../README.md)
- Backend detail: [apps/api/README.md](../apps/api/README.md)
- Frontend detail: [apps/web/README.md](../apps/web/README.md)
- Architecture and future shape:
  [docs/engineering/platform-blueprint.md](engineering/platform-blueprint.md)
