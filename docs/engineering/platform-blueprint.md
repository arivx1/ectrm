# ECTRM Platform Blueprint

## Purpose

This document defines the next stable shape of the project after the current
prototype phase. It is opinionated and repo-specific: it assumes the current
stack remains in place, but the project is reorganized so reference data,
trading workflows, and projections can evolve without constant drift.

## Current State

The repository already has a workable prototype:

- `apps/api` exposes FastAPI endpoints for `events`, `trades`, and `positions`
- `apps/api/alembic` manages schema migrations
- `apps/api/scripts` rebuilds projections
- `apps/web` is a React + Vite operator UI
- events are stored separately from trade and position projections

The prototype gaps are also clear:

- reference data does not exist as a first-class subsystem
- UI dropdowns still rely on hardcoded values
- trade payloads use free-form `book` and `commodity` strings
- project hygiene is loose: local artifacts and generated files can drift into the repo
- the app behaves like a dashboard, not yet like an operator/admin console

## Design Principles

1. Keep the current core stack.
   - FastAPI
   - SQLAlchemy
   - Alembic
   - PostgreSQL
   - React
   - Vite

2. Treat reference data as application-managed operational data.
   - Business users maintain it in the app
   - Developers and DB admins inspect it in database tools
   - Production edits in SQL are break-glass only

3. Prefer stable codes over free-form labels.
   - `book_code`, not just `book`
   - `commodity_code`, not just `commodity`

4. Keep event store and projections, but let validation depend on reference data.

5. Standardize a GUI-first workflow without making one paid IDE mandatory.
   - PyCharm Professional is a strong default
   - VS Code remains an acceptable alternative
   - one canonical run/debug workflow should exist in the repo docs

## Target Architecture

### Backend package layout

Target backend layout under `apps/api/app`:

```text
app/
  main.py
  config.py
  db/
    engine.py
    session.py
  deps/
    db.py
    auth.py
  core/
    errors.py
    logging.py
    security.py
  domains/
    trading/
      models/
      routes/
      schemas/
      services/
    reference_data/
      models/
      routes/
      schemas/
      services/
    projections/
      models/
      routes/
      services/
    admin/
      routes/
      schemas/
  shared/
    enums.py
    pagination.py
    audit.py
```

This does not need to happen in one commit. The first practical move is to
introduce `domains/reference_data` and migrate the current route/model layout
toward domain boundaries incrementally.

### Frontend layout

Target frontend layout under `apps/web/src`:

```text
src/
  app/
    AppShell.tsx
    navigation.ts
  pages/
    DashboardPage.tsx
    TradesPage.tsx
    EventsPage.tsx
    PositionsPage.tsx
    reference-data/
      BooksPage.tsx
      CommoditiesPage.tsx
    admin/
      AdminPage.tsx
  features/
    trades/
    events/
    positions/
    reference-data/
  components/
    layout/
    tables/
    forms/
    feedback/
  lib/
    api.ts
    format.ts
    reference-data.ts
```

The current single-file `App.tsx` is acceptable for prototype velocity, but the
next UI work should split by page and feature.

## Reference Data Strategy

### First entities

Build these first:

1. `reference_books`
2. `reference_commodities`

These are enough to remove hardcoded book and commodity options from the UI and
to establish the reference-data pattern for the rest of the system.

### Common schema

Every reference entity should converge on this shape:

- `code`
- `name`
- `description`
- `is_active`
- `effective_from`
- `effective_to`
- `created_at`
- `created_by`
- `updated_at`
- `updated_by`
- `version`

Recommended additions for later:

- `external_id`
- `metadata` JSON column for low-risk extensibility
- `deactivated_reason`

### Governance rules

Reference data should support these rules from the start or near-start:

- deactivate instead of hard delete
- prevent deactivation when active dependencies exist
- expose audit fields in the API and UI
- keep room for maker-checker approval later

## Trading Model Migration

### Current model

The current trade flow stores:

- `book`
- `commodity`

as free-form strings in both the event payload and the trade projection.

### Target model

The trade domain should move toward:

- `book_code`
- `commodity_code`

and optionally denormalized display fields in projections:

- `book_name`
- `commodity_name`

### Migration path

Do this in two steps:

#### Step 1: Introduce reference tables and API-driven selection

- create `reference_books` and `reference_commodities`
- add read APIs and admin CRUD APIs
- make the UI load dropdown options from those APIs
- keep event payloads as `book` and `commodity` temporarily for compatibility

#### Step 2: Introduce stable code fields

- extend event payloads to emit `book_code` and `commodity_code`
- extend trade projection to persist those codes
- validate incoming codes against active reference data
- keep denormalized labels in projections only where needed for UX

## Projection Strategy

The current projections are:

- `trades`
- `positions`

The next projection to add after reference data is:

- `book_positions`

Recommended shape:

- `book_code`
- `commodity_code`
- `net_volume`
- `updated_at`

That projection becomes the base for risk and portfolio views.

## API Blueprint

### Existing namespaces to preserve

- `/events`
- `/trades`
- `/positions`

### New namespaces

Add:

- `/reference/books`
- `/reference/commodities`

Later:

- `/admin/reference/books`
- `/admin/reference/commodities`

If admin and non-admin concerns remain simple, the same namespace can be used
with role checks rather than a separate `/admin` prefix.

### Initial endpoints

For books:

- `GET /reference/books`
- `POST /reference/books`
- `GET /reference/books/{code}`
- `PUT /reference/books/{code}`
- `POST /reference/books/{code}/deactivate`
- `POST /reference/books/{code}/activate`

For commodities:

- `GET /reference/commodities`
- `POST /reference/commodities`
- `GET /reference/commodities/{code}`
- `PUT /reference/commodities/{code}`
- `POST /reference/commodities/{code}/deactivate`
- `POST /reference/commodities/{code}/activate`

### Query behavior

At minimum, list endpoints should support:

- `q`
- `is_active`
- `limit`
- `offset`

## UI Blueprint

### Primary navigation

The app should evolve into a real operator console with these top-level areas:

- Dashboard
- Trades
- Events
- Positions
- Reference Data
- Admin

### Reference Data pages

Each reference entity page should support:

- search and filter
- create/edit form
- activate/deactivate actions
- inline validation
- change metadata display

The first two pages should be:

- Books
- Commodities

### Trade form behavior

The create/amend trade flows should:

- load book options from `/reference/books`
- load commodity options from `/reference/commodities`
- only allow active values
- stop using hardcoded defaults once seed data exists

## Data Model Blueprint

### Phase 1 tables

#### `reference_books`

- `code` varchar primary key
- `name` varchar not null
- `description` text null
- `is_active` boolean not null default true
- `effective_from` timestamptz null
- `effective_to` timestamptz null
- `created_at` timestamptz not null
- `created_by` varchar not null
- `updated_at` timestamptz not null
- `updated_by` varchar not null
- `version` integer not null default 1

Indexes:

- `ix_reference_books_name`
- `ix_reference_books_is_active`

#### `reference_commodities`

- `code` varchar primary key
- `name` varchar not null
- `description` text null
- `is_active` boolean not null default true
- `effective_from` timestamptz null
- `effective_to` timestamptz null
- `created_at` timestamptz not null
- `created_by` varchar not null
- `updated_at` timestamptz not null
- `updated_by` varchar not null
- `version` integer not null default 1

Indexes:

- `ix_reference_commodities_name`
- `ix_reference_commodities_is_active`

### Later tables

Planned later:

- `reference_counterparties`
- `reference_locations`
- `reference_units`
- `reference_currencies`
- `reference_calendars`
- `reference_price_indices`

## Developer Experience Standard

### Canonical local workflow

The standard development workflow should be documented as:

1. open repo in IDE
2. run API via run configuration
3. run web app via run configuration
4. run rebuild scripts via run configuration
5. inspect database with GUI

### Tooling position

- `PyCharm Professional`: preferred Python-first IDE
- `VS Code`: acceptable alternative
- `Miniconda`: preferred if the team wants conda
- `venv`: still acceptable for lightweight local setup
- `pgAdmin` or `DBeaver`: standard DB inspection tool, pick one as primary if team consistency matters

### Repo hygiene requirements

The repo should ignore:

- `.venv/`
- `.DS_Store`
- `node_modules/`
- `dist/`
- `.env`
- local IDE files
- TypeScript build artifacts

This is a required foundation item, not an optional cleanup.

## Delivery Plan

### Phase A: Stop drift

Goal:

- make local development reproducible

Deliverables:

- clean `.gitignore`
- remove generated and machine-local artifacts from version control
- document canonical local workflow
- add run/debug configuration docs or checked-in config templates

### Phase B: Build reference-data foundation

Goal:

- establish the first reusable reference-data subsystem

Deliverables:

- migrations for `reference_books` and `reference_commodities`
- SQLAlchemy models
- Pydantic schemas
- FastAPI routes
- seed script or seed migration for local defaults

### Phase C: Wire UI to reference data

Goal:

- eliminate hardcoded trade-entry options

Deliverables:

- API client helpers
- books page
- commodities page
- create/amend trade forms loading live options

### Phase D: Move trading to stable codes

Goal:

- enforce valid trade inputs at the domain level

Deliverables:

- `book_code` and `commodity_code` support in events and projections
- validation against active reference data
- migration path for existing rows

### Phase E: Add governance

Goal:

- support controlled operational maintenance

Deliverables:

- auth
- roles
- admin-only edit permissions
- audit history surfaces

## Tactical Next Steps

These are the highest-value next tasks I can execute in this repo immediately.

### Option 1: Repo hygiene pass

I can:

- add or fix a root `.gitignore`
- stop tracking `.DS_Store`, `.venv`, `dist`, and similar local artifacts
- document the canonical local workflow in `README.md` or `docs/engineering`

Why first:

- it prevents further repo drift before more features land

### Option 2: Reference data backend foundation

I can:

- add Alembic migrations for `reference_books` and `reference_commodities`
- add SQLAlchemy models
- add schemas and FastAPI routes
- add basic list/create/update/activate/deactivate behavior

Why second:

- it unlocks removal of hardcoded UI values

### Option 3: UI reference-data integration

I can:

- replace hardcoded `BOOK_OPTIONS`
- fetch books and commodities from the API
- add loading/error states around those dropdowns

Prerequisite:

- option 2, or stubbed frontend data if you want UI-first scaffolding

### Option 4: UI shell split

I can:

- split the current `App.tsx` into pages and shared components
- add left-nav structure for `Dashboard`, `Trades`, `Events`, `Positions`, `Reference Data`, `Admin`
- keep current data flows while preparing for route-based expansion

Why now:

- the UI is improved visually, but still structurally concentrated in one file

## Recommended Immediate Sequence

Recommended execution order for the next coding passes:

1. repo hygiene pass
2. reference data backend for books and commodities
3. trade form integration with reference APIs
4. operator nav and dedicated reference-data pages

That sequence gives the project a stable foundation without blocking on auth,
approvals, or full domain reorganization.
