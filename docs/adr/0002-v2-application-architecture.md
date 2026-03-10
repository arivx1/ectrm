# ADR 0002: V2 Application Architecture and Canonical Domain Boundaries

## Status

Accepted

## Context

The current repo is a workable prototype:

- FastAPI exposes event, trade, position, and emerging reference-data routes
- React/Vite provides a GUI-first operator screen
- events and projections already exist

The current implementation is still too prototype-shaped for a durable product:

- backend modules are grouped only by technical layer
- frontend behavior is concentrated in a single application file
- the trade model is too shallow for physical versus financial, swaps, and structured pricing
- extensibility has not yet been formalized
- future AI and voice interaction need a safe service layer rather than direct route logic

## Decision

Adopt a domain-oriented v2 architecture while preserving the current stack and additive migration path.

### Architectural rules

1. Keep FastAPI, SQLAlchemy, Alembic, PostgreSQL, React, and Vite.
2. Organize code by domain first, then by technical role inside each domain.
3. Preserve the event store and read-model/projection pattern.
4. Use a strongly typed canonical core schema for high-frequency, analytics-critical use cases.
5. Put customer-specific extensibility into controlled metadata and extension tables, not unbounded EAV.
6. Route GUI, API, automation, AI, and future voice actions through the same application services.
7. Make reference-data and admin changes auditable and explainable.

### Domain map

- `trading`
- `reference_data`
- `risk`
- `operations`
- `settlement`
- `reports`
- `admin`
- `assistant`

### Backend structure

Under `apps/api/app`:

```text
core/
platform/
shared/
domains/
  trading/
  reference_data/
  risk/
  operations/
  settlement/
  reports/
  admin/
  assistant/
```

### Frontend structure

Under `apps/web/src`:

```text
app/
  shell/
  navigation/
workspaces/
features/
entities/
widgets/
shared/
```

### Canonical trade model direction

The canonical trade model will be centered on:

- trade header
- trade legs
- structured price terms
- fees
- allocations
- documents
- activity timeline

Key core enums:

- `trade_nature`: `PHYSICAL | FINANCIAL`
- `trade_structure`: `SINGLE | SWAP`
- `trade_side`: `BUY | SELL`
- `pricing_type`: `FIXED | INDEX | FORMULA | HYBRID`

Price indices must be represented structurally through reference-data IDs or codes, never free text.

### Reference-data direction

The first-class reference-data areas are:

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
- custom fields
- formulas
- rules

### Extensibility direction

Controlled extensibility will use:

- custom field definitions
- formula definitions
- rule definitions
- workflow definitions
- layout, view, and report definitions
- extension tables for truly new customer-specific sub-objects

## Consequences

Positive:

- clearer domain boundaries
- safer evolution toward richer trading workflows
- better fit for GUI-first product development
- stable path for AI and voice without bypassing controls

Tradeoffs:

- some near-term duplication while legacy modules coexist with domain modules
- more explicit structure before all features are implemented
- migrations and projection logic will need to be staged carefully

## Implementation notes

This ADR does not require a big-bang rewrite.

The first implementation steps are:

1. add the domain skeleton and shared enums
2. freeze the canonical schema direction in docs
3. move new work into domain modules first
4. refactor legacy modules incrementally behind compatibility imports where needed
