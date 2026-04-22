# ECTRM Reference Data Implementation Plan

## Purpose

This document turns the current master-data gap analysis into a repo-specific
implementation plan. It is grounded in the current product shape:

- delivered reference entities: `books`, `commodities`
- partially implemented reference entity: `price_indices`
- current trade projection: `book`, `commodity_class`, `commodity`, `price`, `volume`

The goal is to move the product from prototype-grade dropdown management toward
an authoritative operational reference-data subsystem that can support trading,
pricing, risk, operations, and settlement workflows.

## Current State

### Delivered

- reference CRUD for `books`
- reference CRUD for `commodities`
- UI tabs for `Books` and `Commodities`
- commodity validation on trade write paths

### Partially delivered

- `reference_price_indices` migration
- `ReferencePriceIndex` model
- price-index schemas

### Missing or structurally incomplete

- units of measure
- currencies
- counterparties
- locations
- portfolios
- calendars
- incoterms / delivery terms
- legal entities
- exchanges / market venues
- server-side book validation
- trade schema support for unit, currency, counterparty, location, or index-based pricing

## Design Rules

### Common reference shape

Every reference entity should converge on these fields:

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

Recommended later additions:

- `external_id`
- `metadata` JSON column
- `deactivated_reason`

### Governance rules

- never hard delete operational reference records
- only active records may be selected in trading workflows
- deactivation must fail when active dependencies exist
- all write paths must validate against active reference data
- display audit fields in maintenance surfaces

## Delivery Priorities

### P0: required to make pricing and trade capture credible

1. `reference_units`
2. `reference_currencies`
3. `reference_counterparties`
4. `reference_locations`
5. complete `reference_price_indices`

### P1: required for a scalable trade model

1. `reference_portfolios`
2. `reference_calendars`
3. `reference_incoterms`
4. `reference_legal_entities`

### P2: required for listed / cleared / advanced workflows

1. `reference_exchanges`
2. `reference_brokers`
3. `formula_definitions`
4. `contract_master_agreements`

## Entity Specifications

### 1. Units

#### Why

Quantity and price are ambiguous without units. Exposure aggregation and
indexed pricing both depend on explicit unit semantics.

#### Table

`reference_units`

- `code` varchar(20) primary key
- `name` varchar(120) not null
- `commodity_class` varchar(50) null
- `dimension` varchar(30) not null
- `base_unit_code` varchar(20) null
- `conversion_factor` numeric(18, 8) null
- `precision` integer not null default 3
- `description` text null
- common status/effective/audit/version fields

#### Example records

- `BBL`
- `GAL`
- `MT`
- `MMBTU`
- `MWH`

#### API

- `GET /reference/units`
- `POST /reference/units`
- `GET /reference/units/{code}`
- `PUT /reference/units/{code}`
- `POST /reference/units/{code}/activate`
- `POST /reference/units/{code}/deactivate`

#### UI

- `Reference Data > Units`
- filters:
  - `q`
  - `dimension`
  - `commodity_class`
  - `is_active`
- form fields:
  - code
  - name
  - commodity class
  - dimension
  - base unit
  - conversion factor
  - precision
  - description

#### Validation

- quantity unit must be active
- price unit must be active
- conversion references must point to valid active units
- deactivation blocked if active trades or price indices reference the unit

### 2. Currencies

#### Why

The current product effectively assumes USD. That is not acceptable once the
system prices more than a toy set of trades.

#### Table

`reference_currencies`

- `code` varchar(10) primary key
- `name` varchar(120) not null
- `symbol` varchar(10) null
- `minor_unit_scale` integer not null default 2
- `description` text null
- common status/effective/audit/version fields

#### Example records

- `USD`
- `EUR`
- `GBP`
- `CAD`

#### API

- `GET /reference/currencies`
- `POST /reference/currencies`
- `GET /reference/currencies/{code}`
- `PUT /reference/currencies/{code}`
- `POST /reference/currencies/{code}/activate`
- `POST /reference/currencies/{code}/deactivate`

#### UI

- `Reference Data > Currencies`
- filters:
  - `q`
  - `is_active`

#### Validation

- priced trades must use an active currency
- price indices must reference an active currency
- deactivation blocked if active trades or indices reference the currency

### 3. Counterparties

#### Why

Without counterparties, the system cannot manage commercial exposure, contracts,
or settlement relationships.

#### Table

`reference_counterparties`

- `code` varchar(50) primary key
- `name` varchar(160) not null
- `short_name` varchar(80) null
- `legal_entity_name` varchar(200) null
- `counterparty_type` varchar(50) not null
- `country_code` varchar(10) null
- `external_id` varchar(100) null
- `credit_status` varchar(50) null
- `description` text null
- common status/effective/audit/version fields

#### API

- `GET /reference/counterparties`
- `POST /reference/counterparties`
- `GET /reference/counterparties/{code}`
- `PUT /reference/counterparties/{code}`
- `POST /reference/counterparties/{code}/activate`
- `POST /reference/counterparties/{code}/deactivate`

#### UI

- `Reference Data > Counterparties`
- filters:
  - `q`
  - `counterparty_type`
  - `is_active`

#### Validation

- every trade must reference an active counterparty
- deactivation blocked if active trades reference the counterparty

### 4. Locations

#### Why

Commodity identity is incomplete without delivery or pricing location. Exposure
and index selection both depend on explicit location master data.

#### Table

`reference_locations`

- `code` varchar(50) primary key
- `name` varchar(160) not null
- `location_type` varchar(50) not null
- `market` varchar(80) null
- `country_code` varchar(10) null
- `region` varchar(80) null
- `timezone` varchar(60) null
- `external_id` varchar(100) null
- `description` text null
- common status/effective/audit/version fields

#### Example records

- `HENRY_HUB`
- `WAHA`
- `NYH`
- `USGC`

#### API

- `GET /reference/locations`
- `POST /reference/locations`
- `GET /reference/locations/{code}`
- `PUT /reference/locations/{code}`
- `POST /reference/locations/{code}/activate`
- `POST /reference/locations/{code}/deactivate`

#### UI

- `Reference Data > Locations`
- filters:
  - `q`
  - `market`
  - `location_type`
  - `country_code`
  - `is_active`

#### Validation

- location required for physical legs
- price indices may only reference active locations
- deactivation blocked if active trades or indices reference the location

### 5. Price Indices

#### Why

Indexed pricing is impossible to model cleanly without a first-class reference
entity. The repo already contains partial price-index scaffolding and should be
completed rather than redesigned.

#### Table

`reference_price_indices`

Existing fields already present in the repo:

- `code`
- `name`
- `commodity_code`
- `currency_code`
- `unit_code`
- `provider`
- `market`
- `location_code`
- `calendar_code`
- `description`
- common status/effective/audit/version fields

Recommended additions:

- `index_type` varchar(50) null
- `quote_side` varchar(30) null

#### API

- `GET /reference/price-indices`
- `POST /reference/price-indices`
- `GET /reference/price-indices/{code}`
- `PUT /reference/price-indices/{code}`
- `POST /reference/price-indices/{code}/activate`
- `POST /reference/price-indices/{code}/deactivate`

#### UI

- `Reference Data > Price Indices`
- filters:
  - `q`
  - `commodity_code`
  - `provider`
  - `market`
  - `is_active`

#### Validation

- referenced commodity must be active
- referenced currency must be active
- referenced unit must be active
- referenced location must be active when present
- referenced calendar must be active when present
- deactivation blocked if active trades reference the index

### 6. Portfolios

#### Why

`Book` is currently overloaded. Portfolios should be a distinct organizational
layer for risk and reporting.

#### Table

`reference_portfolios`

- `code` varchar(50) primary key
- `name` varchar(160) not null
- `book_code` varchar(50) not null
- `owner` varchar(120) null
- `strategy` varchar(120) null
- `description` text null
- common status/effective/audit/version fields

#### API

- `GET /reference/portfolios`
- `POST /reference/portfolios`
- `GET /reference/portfolios/{code}`
- `PUT /reference/portfolios/{code}`
- `POST /reference/portfolios/{code}/activate`
- `POST /reference/portfolios/{code}/deactivate`

#### Validation

- portfolio must reference an active book
- active trades may not reference deactivated portfolios

### 7. Calendars

#### Why

Pricing lags, business-day adjustments, and settlement dates all depend on
calendar master data.

#### Table

`reference_calendars`

- `code` varchar(50) primary key
- `name` varchar(160) not null
- `calendar_type` varchar(50) not null
- `market` varchar(80) null
- `timezone` varchar(60) null
- `description` text null
- common status/effective/audit/version fields

#### API

- `GET /reference/calendars`
- `POST /reference/calendars`
- `GET /reference/calendars/{code}`
- `PUT /reference/calendars/{code}`
- `POST /reference/calendars/{code}/activate`
- `POST /reference/calendars/{code}/deactivate`

### 8. Incoterms / Delivery Terms

#### Why

Physical delivery semantics should not be embedded as free text on trades.

#### Table

`reference_incoterms`

- `code` varchar(20) primary key
- `name` varchar(120) not null
- `version_label` varchar(40) null
- `term_type` varchar(50) null
- `description` text null
- common status/effective/audit/version fields

#### API

- `GET /reference/incoterms`
- `POST /reference/incoterms`
- `GET /reference/incoterms/{code}`
- `PUT /reference/incoterms/{code}`
- `POST /reference/incoterms/{code}/activate`
- `POST /reference/incoterms/{code}/deactivate`

## Trade Model Changes

## Target trade header

Replace the current narrow projection fields with stable code-based references:

- `trade_id`
- `trade_number`
- `trade_nature`
- `trade_structure`
- `trade_side`
- `status`
- `book_code`
- `portfolio_code`
- `counterparty_code`
- `trade_currency_code`
- `trade_date`
- `execution_ts`
- `effective_start_date`
- `effective_end_date`
- `pricing_type`
- `version`
- `created_at`
- `updated_at`

Optional denormalized display fields in projections:

- `book_name`
- `portfolio_name`
- `counterparty_name`

### Target trade legs

- `trade_leg_id`
- `trade_id`
- `leg_no`
- `side`
- `commodity_code`
- `location_code`
- `quantity`
- `quantity_unit_code`
- `delivery_start`
- `delivery_end`
- `incoterm_code`

### Target price terms

- `trade_price_term_id`
- `trade_id`
- `trade_leg_id`
- `pricing_type`
- `fixed_price`
- `price_index_code`
- `formula_definition_code`
- `currency_code`
- `price_unit_code`
- `index_quote_side`
- `index_lag_days`
- `index_calendar_code`
- `floor_price`
- `ceiling_price`

### Write-path validation rules

All trade writes must validate active reference values for:

- `book_code`
- `portfolio_code`
- `counterparty_code`
- `commodity_code`
- `location_code`
- `quantity_unit_code`
- `trade_currency_code`
- `price_unit_code`
- `price_index_code`
- `index_calendar_code`
- `incoterm_code`

The current behavior that accepts a raw `book` string or silently defaults one
must be removed once migration compatibility is no longer needed.

## API Backlog

### Reference endpoints

Use the same pattern already established for books and commodities:

- list
- create
- get by code
- update
- activate
- deactivate

Minimum list-query support for every entity:

- `q`
- `is_active`
- `limit`
- `offset`

Entity-specific filters should be added where they materially improve operator
workflows:

- `commodity_class` for units and commodities
- `market` for locations and indices
- `counterparty_type` for counterparties
- `book_code` for portfolios

### Trade endpoints

The existing event-driven write model can remain in place, but payloads should
evolve in two steps.

#### Step 1: additive compatibility

- allow `book_code`
- allow `counterparty_code`
- allow `trade_currency_code`
- allow `quantity_unit_code`
- allow `price_unit_code`
- allow `location_code`
- allow `price_index_code`

#### Step 2: authoritative payloads

- require stable code fields
- stop relying on free-form strings
- stop defaulting missing book values
- reject inactive or unknown reference values

## UI Backlog

### Reference Data workspace

Expand the current `Reference Data` area from two tabs into a real maintenance
workspace:

- Books
- Commodities
- Units
- Currencies
- Counterparties
- Locations
- Price Indices
- Portfolios
- Calendars
- Incoterms

Each page should support:

- search and filters
- create/edit form
- active/inactive status toggle
- audit metadata display
- dependency-aware deactivation errors

### Trade capture

Replace the current minimal trade form with selectors for:

- book
- portfolio
- counterparty
- commodity
- location
- quantity
- quantity unit
- pricing type
- fixed price or index selection
- trade currency
- price unit
- effective dates
- delivery dates
- incoterm

Behavior rules:

- only active reference values are selectable
- commodity options filter location and unit options where relevant
- index options filter by commodity, currency, unit, and market where possible

### Trade inspector and grids

Display:

- counterparty
- location
- quantity with unit
- price with currency and unit
- price index or pricing basis
- portfolio

## Migration Plan

### Phase A: finish the reference-data base

1. add migrations for:
   - `reference_units`
   - `reference_currencies`
   - `reference_counterparties`
   - `reference_locations`
   - `reference_portfolios`
   - `reference_calendars`
   - `reference_incoterms`
2. finish price-index route support
3. add models, schemas, and routes
4. seed baseline local data

### Phase B: expand the UI

1. add reference-data pages and forms
2. add API client helpers
3. expose dependency errors on deactivate actions

### Phase C: extend trading payloads and projections

1. add code-based fields to trade events
2. add code-based columns to projections
3. keep compatibility with existing rows temporarily
4. add backfill scripts where possible

### Phase D: enforce authoritative validation

1. validate all reference codes on write
2. remove free-form book reliance
3. remove fallback defaults
4. reject invalid or inactive references

### Phase E: governance hardening

1. add `external_id`
2. add `metadata` JSON
3. add `deactivated_reason`
4. add audit history views
5. add maker-checker workflow for sensitive entities

## Suggested Sprint Breakdown

### Sprint 1

- finish price indices
- add units
- add currencies
- add locations

### Sprint 2

- add counterparties
- add portfolios
- add reference-data UI pages for the new entities

### Sprint 3

- extend trade payloads and projections to stable reference codes
- add trade form selectors for the new dependencies
- enforce validation for books, counterparties, units, currencies, locations

### Sprint 4

- add calendars
- add incoterms
- add governance hardening

## Repo Impact

Expected implementation touchpoints:

- `apps/api/alembic/versions`
- `apps/api/app/models`
- `apps/api/app/schemas/reference_data.py`
- `apps/api/app/routes/reference_data.py`
- `apps/api/app/routes/events.py`
- `apps/api/app/models/trade.py`
- `apps/api/app/schemas/trade.py`
- `apps/web/src/App.tsx` or its replacement feature modules

## Decision Summary

The next concrete engineering package should be:

1. complete `price_indices`
2. add `units`, `currencies`, `locations`, `counterparties`
3. move trade capture to stable, validated reference codes
4. then add `portfolios`, `calendars`, and `incoterms`

This sequence fixes the biggest current modeling problems first while preserving
the existing event-store and projection architecture.
