# E/CTRM V2 Design Package

## Current-state summary

The repo already contains the correct early primitives:

- FastAPI backend with event storage and projections
- React/Vite frontend with a GUI-first operator surface
- emerging reference-data CRUD for books and commodities
- Alembic migrations and projection rebuild scripts

The current shape is still prototype-grade:

- backend modules are flat instead of domain-oriented
- trade schema is too narrow for structured pricing and multi-leg swaps
- reference-data coverage is incomplete
- frontend UX is monolithic and page-local
- there is no formal metadata/extensibility subsystem yet

## Recommended target-state architecture

### Product workspaces

- Dashboard
- Trading
- Risk
- Operations
- Settlement
- Reports
- Reference Data
- Admin
- Assistant

### Backend domains

- `trading`
- `reference_data`
- `risk`
- `operations`
- `settlement`
- `reports`
- `admin`
- `assistant`

### Interaction model

- GUI uses typed command/query services
- AI and future voice use the same services
- all writes go through validation, permissioning, and audit
- projections remain optimized for UX and reporting

## Canonical domain model proposal

### Trade header

- `trade_id`
- `trade_number`
- `trade_nature`
- `trade_structure`
- `trade_side`
- `status`
- `book_id`
- `portfolio_id`
- `commodity_id`
- `counterparty_id`
- `currency_id`
- `unit_id`
- `trade_date`
- `execution_ts`
- `effective_start_date`
- `effective_end_date`
- `pricing_type`
- `version`
- `created_at`
- `updated_at`

### Trade legs

Swaps are modeled with legs. Single trades still use a leg structure so the model remains uniform.

Each leg includes:

- `trade_leg_id`
- `trade_id`
- `leg_no`
- `side`
- `commodity_id`
- `location_id`
- `quantity`
- `unit_id`
- `currency_id`
- `delivery_start`
- `delivery_end`
- `incoterm_id`

### Price terms

- `trade_price_term_id`
- `trade_id`
- `trade_leg_id`
- `pricing_type`
- `fixed_price`
- `price_index_id`
- `formula_definition_id`
- `currency_id`
- `price_unit_id`
- `index_quote_side`
- `index_lag_days`
- `index_calendar_id`
- `floor_price`
- `ceiling_price`

### Future-ready sub-objects

- fees
- allocations
- documents
- comments
- activities

## Reference-data model proposal

Every reference entity should support:

- stable ID
- code
- name
- description
- status
- effective dating
- version
- audit fields

### Core reference entities

- books
- portfolios
- commodities
- counterparties
- locations
- units
- currencies
- price indices
- calendars
- terms and incoterms

### Price indices are first-class

Price indices must be reference data with structured attributes:

- commodity
- publisher
- market
- currency
- unit
- location
- calendar
- index type

## Metadata and extensibility proposal

Use a three-tier model:

1. Core schema for common, analytics-critical fields.
2. Custom field definitions for lower-frequency customer-specific attributes.
3. Extension tables for new customer-specific structured sub-objects.

Metadata subsystems:

- custom field definitions
- formula definitions
- rule definitions
- workflow definitions
- layout definitions
- view definitions
- report definitions

Guardrail:

Do not replace core relational design with generic EAV.

## UI/UX architecture proposal

### Experience model

- workspace-based shell
- desktop-first operator flows
- mobile-first review and approval patterns where appropriate
- reusable activity timeline
- reusable grid and form primitives
- assistant panel as a cross-workspace tool

### Admin explainability surface

Admin should not only provide controls. It should also expose curated views into
how the platform works, including:

- architecture map
- event-to-projection lifecycle trace
- schema explorer
- workflow stories
- live system provenance

See [admin-explainability-surface.md](/Users/anthonyrivich/Documents/GitHub/ectrm/docs/engineering/admin-explainability-surface.md).

### Desktop priorities

- dense grids
- advanced editing
- bulk updates
- administration
- analytics

### Mobile priorities

- search
- review
- approvals
- summaries
- alerts
- comments

### Assistant modes

- read/query
- explain
- draft
- action
- voice

Action mode must execute through the same application services as manual UI actions.

## Risks and tradeoffs

- additive migration is slower than a rewrite, but much safer
- a strong canonical schema increases upfront design work, but prevents long-term schema chaos
- controlled extensibility requires governance and admin UX, but avoids unmaintainable customization

## Phased implementation roadmap

### Phase 1: Architecture foundation

- add domain skeletons
- add shared enums and contracts
- split frontend into app, workspaces, features, entities, widgets, shared

### Phase 2: Reference-data foundation

- complete books and commodities
- add price indices
- standardize reference-data APIs and audit logging

### Phase 3: Trade v2 schema

- add trade header, legs, and price terms
- support physical versus financial and single versus swap
- support structural price index references

### Phase 4: Trading workspace UX

- app shell
- blotter
- trade detail
- capture and amend flows
- timeline and documents

### Phase 5: Extensibility platform

- custom fields
- formulas
- rules
- workflows
- layouts, views, and reports

### Phase 6: Risk, operations, settlement, reports

- richer projections
- operational workflows
- reporting surfaces

### Phase 7: Assistant and voice-ready services

- query and explanation layer
- safe action requests
- transcript and activity integration

## Exact next step

Implement the architecture skeleton and shared canonical enums first, without changing existing runtime behavior. After that, move the reference-data subsystem into the new domain structure and add first-class price indices.
