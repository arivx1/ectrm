# Accruals Work Packages

## Goal

Turn the accruals redesign and the review findings into concrete delivery
packages that:

- remove current financial correctness risks
- establish a first-class accruals domain
- connect actualization, invoicing, and cash application cleanly
- improve operator-facing settlement and reporting workflows without a
  big-bang rewrite

This package set assumes we want to preserve the current trade, settlement, and
reports workspaces while evolving the financial model underneath them.

Primary design input:

- [accruals-functionality-redesign.md](/Users/anthonyrivich/Documents/GitHub/ectrm/docs/engineering/accruals-functionality-redesign.md)

## Source Findings

These work packages resolve the findings from the accruals review:

1. paginated payment rows only project against the current page
2. mixed-currency payments are netted directly against invoice balances
3. overpayments are silently hidden as fully settled
4. historical PnL backfills current legacy trade state into earlier as-of dates

## Delivery Order

### Wave 0: stop accounting drift

1. WP-01 page-stable payment projections
2. WP-02 currency-safe payment application
3. WP-03 overpayment and cash exception handling
4. WP-04 historical PnL snapshot integrity

### Wave 1: establish accrual primitives

5. WP-05 accrual domain scaffolding
6. WP-06 accrual lot and entry generation

### Wave 2: connect accruals to settlement

7. WP-07 invoice-to-accrual relief linkage
8. WP-08 cash application and reconciliation

### Wave 3: operator rollout and reporting convergence

9. WP-09 accrual reporting and settlement UX
10. WP-10 PnL and realization semantics convergence

## Shared Definition Of Done

Each work package is done only when:

- API behavior is covered by automated tests or service-level regression tests
- user-facing financial totals reconcile across the affected surfaces
- auditability is preserved for new write paths
- docs are updated where the operator workflow or data model changes
- historical behavior is explicit when exact backfill is not yet possible
- currency behavior is explicit whenever balances can cross invoice or payment
  boundaries

## WP-01: Page-Stable Payment Projections

### Priority

P0

### Status

Implemented on the current branch; retain as a tracked package until merged and
verified in the full backend test environment.

### Outcome

`/settlement/payments` returns `total_paid_amount` and `outstanding_amount`
based on the full invoice payment history for the invoices on the current page,
not just the rows on that page.

### Why this matters

Operators should never see the payment board disagree with the invoice board
because of pagination.

### Scope

- compute per-row payment projection inputs from full invoice history
- add regression coverage for multi-payment, multi-page invoice scenarios
- verify settlement payment board and invoice board stay consistent

### Out of scope

- currency-safe payment application
- overpayment handling
- accrual domain redesign

### Suggested owner profile

Backend engineer familiar with settlement services and report projections

### Dependencies

None

### Acceptance criteria

- paginated payment rows for the same invoice return the same
  `total_paid_amount`
- paginated payment rows for the same invoice return the same
  `outstanding_amount`
- invoice and payment boards reconcile on the same invoice after pagination
- automated coverage exists for at least one invoice whose payments span pages

## WP-02: Currency-Safe Payment Application

### Priority

P0

### Current branch rule

Use strict currency matching for now.

### Outcome

A payment cannot silently relieve an invoice balance in a different currency.

### Why this matters

Cross-currency netting without explicit FX treatment creates false settlement,
incorrect aging, and unreliable accrual reporting.

### Scope

- decide the short-term rule:
  - strict match: payment currency must equal invoice currency
  - or explicit FX application: mismatches require an FX-linked application record
- implement API validation on payment create and update
- align UI defaults and edit controls with the allowed behavior
- update settlement reports so all outstanding, billed, and received balances
  remain currency-safe
- add audit detail for any explicit FX application path

### Out of scope

- full treasury or realized FX PnL workflow

### Suggested owner profile

Backend engineer with accounting domain support from a product/finance partner

### Dependencies

- should follow or land with WP-01
- informs WP-08 cash application design

### Acceptance criteria

- a cross-currency payment cannot settle an invoice implicitly
- any allowed FX path is explicit, auditable, and reportable
- settlement aging and cash forecast do not net balances across currencies
- automated coverage exists for mismatched invoice/payment currency scenarios

## WP-03: Overpayment And Cash Exception Handling

### Priority

P0

### Current branch rule

Do not allow payment amount above remaining open invoice balance until unapplied
cash is modeled explicitly.

### Outcome

Overpayments, short pays, and unapplied cash remain visible financial
exceptions instead of being clamped into a clean settled state.

### Why this matters

The system currently hides a class of cash mismatch that operators and
accounting users need to see immediately.

### Scope

- decide how to model overpayment:
  - reject overpay at entry
  - or accept it and create explicit unapplied cash / overpayment exceptions
- extend payment projection logic so negative residuals are not silently clipped
- add exception/reporting support for:
  - overpayment
  - unapplied cash
  - short pay
- update settlement UI to surface these states clearly
- define workflow ownership for cash exceptions

### Out of scope

- customer credit memo workflow unless needed for the first overpay design

### Suggested owner profile

Backend engineer plus settlement/accounting workflow owner

### Dependencies

- WP-02 if overpayment policy depends on currency-safe application
- informs WP-08 reconciliation design

### Acceptance criteria

- an overpay does not produce a silent `SETTLED` result unless business rules
  explicitly allow and record it
- exception reports distinguish short-pay and overpay cases
- settlement UI shows remaining or excess cash explicitly
- automated coverage exists for exact pay, short pay, and overpay scenarios

## WP-04: Historical PnL Snapshot Integrity

### Priority

P1

### Current branch rule

Projection-only legacy trades without event history enter the timeline on their
latest trustworthy projection date, not their original trade date, until a more
complete historical snapshot basis exists.

### Outcome

Historical as-of PnL no longer backfills future-mutated legacy trade state into
earlier dates.

### Why this matters

Accrual and PnL trust break quickly when a report for an earlier date reflects a
later amendment.

### Scope

- choose the short-term integrity policy for trades without event history:
  - exclude unsupported earlier history and expose a coverage gap
  - or build a trustworthy snapshot basis before earlier reporting is allowed
- stop using mutable current trade rows as authoritative historical state for
  earlier dates
- add explicit methodology text or report flags where coverage is partial
- add tests for legacy rows with later amendments

### Out of scope

- full historical event reconstruction for every legacy trade if source data
  does not exist

### Suggested owner profile

Backend/reporting engineer comfortable with event-sourced and snapshot-based
reporting tradeoffs

### Dependencies

- should land before WP-10

### Acceptance criteria

- a report for date `T` does not show values sourced from amendments after `T`
- coverage gaps are explicit if exact historical reconstruction is unavailable
- automated coverage exists for at least one legacy trade amended after the
  requested as-of date

## WP-05: Accrual Domain Scaffolding

### Priority

P1

### Current branch scope

Read-only backend scaffolding exists for the accrual domain:

- `trade_accrual_lots` and `trade_accrual_entries` ledger tables
- `GET /accruals/lots`
- `GET /accruals/lots/{accrual_lot_id}/entries`
- `GET /accruals/reconciliation`

### Outcome

The codebase has a dedicated accruals domain that can own models, services, and
APIs without burying accrual logic inside settlement reports.

### Why this matters

The redesign should become a real subsystem, not another layer of derived logic
inside the current report services.

### Scope

- add `apps/api/app/domains/accruals`
- introduce initial models for:
  - accrual lots
  - accrual entries
  - optional accrual projections
- add base schemas and read services
- add Alembic migrations
- define a clear boundary between:
  - actualization
  - accrual recognition
  - invoicing
  - payment application

### Out of scope

- full UI rollout
- full PnL convergence

### Suggested owner profile

Backend/domain-model engineer

### Dependencies

- benefits from completion of Wave 0 packages

### Acceptance criteria

- accrual models and migrations exist
- domain services can read and project accrual state
- no existing settlement flow breaks from the scaffolding
- the new domain boundary is documented

## WP-06: Accrual Lot And Entry Generation

### Priority

P1

### Outcome

The platform can derive accrued quantity and amount from actualizations and
pricing into delivery-scoped accrual lots plus immutable accrual entries.

### Why this matters

This is the first package that makes unbilled delivered value visible as a
first-class concept.

### Scope

- define lot grain for physical and non-physical trades
- generate or update accrual lots from:
  - delivery targets
  - actualizations
  - trade pricing terms
  - price-index observations where applicable
- create entry types for:
  - estimated accrual
  - true-up
  - price mark
- expose read APIs for accrual lot state
- define how backdated actualization corrections affect entries

### Out of scope

- invoice relief
- cash application

### Suggested owner profile

Backend engineer with strong operational-finance modeling skills

### Dependencies

- WP-05

### Acceptance criteria

- a delivered-but-unbilled physical trade produces visible accrual state
- accrual quantity and amount are traceable to source actualization and pricing
- backdated corrections append or adjust entries without erasing audit history
- automated coverage exists for fixed-price and index-priced examples

## WP-07: Invoice-To-Accrual Relief Linkage

### Priority

P1

### Outcome

Invoice issuance relieves accrual balances explicitly, with traceability from
invoice to accrual lot.

### Why this matters

Without relief linkage, the platform still cannot reconcile unbilled exposure
against billed receivables at delivery scope.

### Scope

- add linkage between invoice lines and accrual lots
- relieve accrued quantity and amount when invoices are issued
- support partial billing across one or more deliveries
- preserve dispute visibility without deleting the relief history
- expose read views for:
  - accrued but unbilled
  - billed against accrued
  - disputed billed balance

### Out of scope

- cash application beyond invoice linkage

### Suggested owner profile

Backend engineer with settlement and invoicing context

### Dependencies

- WP-06

### Acceptance criteria

- every invoiced balance can be traced back to relieved accrual lots
- partial billing is visible and reconciles cleanly
- disputed invoices preserve accrual linkage and visibility
- automated coverage exists for partial and multi-delivery billing

## WP-08: Cash Application And Reconciliation

### Priority

P1

### Outcome

Cash receipt becomes an explicit application workflow rather than an implicit
netting step against invoice amount.

### Why this matters

This package resolves the mixed-currency and overpayment findings in the
long-term architecture and makes settlement reporting genuinely reconcilable.

### Scope

- introduce explicit payment application records or equivalent linkage
- support:
  - exact pay
  - short pay
  - overpay
  - unapplied cash
  - FX-aware application
- project billed, collected, disputed, and unapplied balances separately
- feed exception reporting and owner workflow from these states

### Out of scope

- full bank statement ingestion

### Suggested owner profile

Backend engineer with accounting workflow support

### Dependencies

- WP-02
- WP-03
- WP-07

### Acceptance criteria

- cash can be traced from payment to invoice application
- unapplied and excess cash are explicit states, not hidden residuals
- currency handling is explicit and auditable
- settlement reports reconcile billed and collected balances from the same
  application basis

## WP-09: Accrual Reporting And Settlement UX

### Priority

P2

### Outcome

Operators can work accruals directly in the UI instead of inferring them from
aging and payment boards.

### Why this matters

The accrual redesign only becomes useful when it is surfaced where operators
already live: Settlement, Reports, and delivery/trade detail views.

### Scope

- add accrual reports:
  - unbilled accrual aging
  - accrued vs billed reconciliation
  - billed vs collected reconciliation
  - accrual exception view
- add accrual columns or cards to settlement surfaces
- expose delivery/trade detail linkage for accrual lots and invoice relief
- provide export support where settlement reports already support export

### Out of scope

- complete redesign of the entire Settlement workspace shell

### Suggested owner profile

Frontend engineer paired with backend/reporting engineer

### Dependencies

- WP-06
- WP-07
- WP-08

### Acceptance criteria

- operators can see delivered-but-unbilled balances without leaving the app
- accrual, billed, and collected states are visually distinct
- exported report totals reconcile to the underlying accrual projections
- interaction coverage exists for the core accrual report filters and views

## WP-10: PnL And Realization Semantics Convergence

### Priority

P2

### Outcome

P&L and accrual reporting use a coherent financial model instead of relying on
`settlement_status` alone to switch between realized and unrealized buckets.

### Why this matters

The current report is a useful operator approximation, but it is not a durable
basis for accrual-aware financial reporting.

### Scope

- define target reporting splits for:
  - mark-to-market
  - operational accrual
  - billed receivable/payable
  - collected cash
- refactor comparison and history methodology to align with the new model
- keep operator-friendly explainability in the report output
- add methodology and coverage notes where semantics change

### Out of scope

- enterprise general-ledger integration

### Suggested owner profile

Reporting engineer with finance/product partnership

### Dependencies

- WP-04
- WP-06
- WP-07
- WP-08

### Acceptance criteria

- realized/unrealized reporting no longer depends solely on
  `settlement_status`
- report methodology explains how accrual, billed, and cash states affect P&L
- comparison outputs remain explainable at trade level
- regression coverage exists for core before/after scenarios
