# Accruals Functionality Redesign

## Purpose

This document defines the recommended target shape for accruals in ECTRM.
Today the product has settlement, payment, and PnL reporting primitives, but it
does not yet have a first-class accrual subsystem. The goal is to add one
without breaking the existing operator flow.

## Current State

The repo already contains important building blocks:

- `trade_actualizations` records executed quantity by delivery scope
- `trade_invoices` can already be delivery-scoped and quantity-based
- `trade_payments` applies cash receipts against invoices
- settlement reports cover aging, cash forecast, and exceptions
- PnL reports provide daily history and comparison views

The current gap is that accruals do not exist as their own domain concept.
Instead, the system infers financial state from a mix of:

- trade projection fields such as `settlement_status`
- invoice ledger state
- payment ledger state
- current mutable trade rows for legacy history

That creates four product problems:

1. Delivered-but-unbilled exposure is mostly invisible.
2. Economic accrual, invoicing, and cash collection are conflated.
3. Historical reporting depends too heavily on mutable projections.
4. Reconciliation works at the invoice level, not at the delivery/accrual level.

## Why A Redesign Is Needed

Accruals should sit between physical execution and cash settlement.

The current pipeline is:

1. trade capture
2. delivery actualization
3. invoice issuance
4. payment receipt
5. reporting

The missing stage is:

1. trade capture
2. delivery actualization
3. accrual recognition
4. invoice matching / relief
5. cash application
6. reporting

Without that middle stage, the platform cannot answer core operator questions
cleanly:

- What value has been earned or incurred but not yet billed?
- Which deliveries are accrued, invoiced, disputed, or collected?
- How much of reported PnL is operational accrual versus cash realization?
- Which invoice lines relieved which delivered quantities?

## Design Principles

1. Make accruals delivery-scoped, not just trade-scoped.
   - Use `delivery_id` and `leg_no` wherever possible.

2. Separate economic accrual from invoice and payment lifecycle.
   - Accrued does not mean billed.
   - Billed does not mean collected.

3. Use immutable entries plus derived projections.
   - Entries preserve history.
   - Projections keep the UI fast.

4. Keep currency handling explicit.
   - Do not net cross-currency balances without an FX application record.

5. Support backdated corrections safely.
   - Actualization corrections, price true-ups, and invoice disputes should not
     erase prior history.

## Recommended Domain Model

### New core concept: accrual lot

An accrual lot is the primary unit of accrual accounting in the platform.
Recommended grain:

- one lot per `trade_id + delivery_id + accrual_currency_code`

For non-physical trades, the grain can remain trade-level until a more detailed
financial settlement design is needed.

Recommended fields:

- `accrual_lot_id`
- `trade_id`
- `delivery_id`
- `leg_no`
- `book`
- `portfolio`
- `counterparty`
- `commodity_class`
- `commodity`
- `trade_currency_code`
- `accrual_currency_code`
- `quantity_unit_code`
- `planned_quantity`
- `actualized_quantity`
- `billed_quantity`
- `accrued_amount`
- `billed_amount`
- `collected_amount`
- `disputed_amount`
- `status`
- `opened_at`
- `closed_at`
- `created_at`
- `updated_at`

### New immutable ledger: accrual entries

Accrual entries are append-only and explain why a lot changed.

Recommended entry types:

- `ACTUALIZATION_ESTIMATE`
- `ACTUALIZATION_TRUE_UP`
- `PRICE_MARK`
- `INVOICE_APPLIED`
- `CASH_APPLIED`
- `DISPUTE_HOLD`
- `DISPUTE_RELEASE`
- `WRITE_OFF`
- `REVERSAL`
- `FX_APPLICATION`

Recommended fields:

- `entry_id`
- `accrual_lot_id`
- `entry_type`
- `trade_id`
- `delivery_id`
- `invoice_id`
- `payment_id`
- `effective_date`
- `currency_code`
- `quantity_delta`
- `amount_delta`
- `reference_price`
- `price_index_code`
- `fx_rate`
- `notes`
- `created_at`
- `created_by`

### New projections

Derived projections should support the operator UI without forcing the UI to
rebuild balances from raw entries.

Recommended projections:

- `trade_accrual_projection`
- `accrual_rollforward_daily`
- `accrual_reconciliation_projection`

## Lifecycle Model

Recommended lot statuses:

- `ESTIMATED`
- `ACCRUED`
- `PARTIALLY_BILLED`
- `BILLED`
- `PARTIALLY_COLLECTED`
- `COLLECTED`
- `DISPUTED`
- `WRITTEN_OFF`
- `REVERSED`

Recommended lifecycle rules:

1. Actualization creates or updates the accrual lot quantity.
2. Pricing determines the accrued amount for that lot.
3. Invoice issuance relieves accrued balance and creates billed balance.
4. Payment receipt relieves billed balance and creates collected balance.
5. Disputes freeze or flag the affected billed balance without hiding it.

## Reporting Model

The current settlement reports should remain, but accruals need their own
reporting surfaces.

### New accrual reports

- Unbilled accrual aging
- Accrued vs billed reconciliation
- Billed vs collected reconciliation
- Delivery-level accrual rollforward
- Dispute and write-off exposure

### PnL redesign guidance

The current PnL service uses `settlement_status` as the switch between realized
and unrealized buckets. That is useful as a temporary operator view, but it is
not a strong long-term accrual model.

Recommended future split:

- mark-to-market PnL
- accrual PnL
- billed receivable / payable
- cash collected / paid

That makes the reporting questions much clearer:

- open market exposure
- earned or incurred operational accrual
- invoiced but unpaid receivable
- collected cash

## API And UI Proposal

### Backend

Add a dedicated accruals domain under `apps/api/app/domains/accruals` with:

- models
- schemas
- services
- routes

Recommended read APIs:

- `GET /accruals/lots`
- `GET /accruals/rollforward`
- `GET /accruals/reconciliation`
- `GET /accruals/exceptions`

Recommended mutation APIs:

- no manual accrual write APIs at first
- generate accrual entries from actualization, invoice, payment, and dispute events

### Frontend

Recommended UX additions:

- settlement cards should show `Actualized`, `Accrued`, `Billed`, and `Collected`
- reports workspace should gain an `Accruals` section
- delivery and trade detail views should expose accrual lot linkage

## Phased Implementation Plan

### Phase 1: harden the current settlement ledger

Ship the fixes that make current settlement data trustworthy enough to support
accrual work.

- ensure page-stable payment projections
- reject unsupported cross-currency payment netting
- handle overpayments and short-pay exceptions explicitly
- tighten historical reporting where mutable projections leak into past dates

Recommended short-term hardening rule:

- payment currency must match invoice currency
- payment amount must not exceed the invoice's remaining open balance
- explicit FX application and unapplied cash handling arrive in the later cash
  application phase
- projection-only legacy trades without event history enter PnL history on their
  latest trustworthy projection date instead of backfilling current state into
  earlier as-of windows

### Phase 2: read-only accrual projection

Create accrual lots and a projection from:

- trade header and pricing terms
- delivery targets
- actualizations
- invoices
- payments

Do not add manual accrual edits yet.

Current branch progress:

- backend accrual scaffolding exists with dedicated lot and entry tables
- read-only APIs exist for lot listing, ledger entry inspection, and
  reconciliation projection
- active physical trades now synchronize delivery-scoped accrual lots from
  recorded actualizations and current pricing inputs
- EIA price sync can rebuild affected index-priced accrual marks through the
  accrual rebuild path
- physical invoice issue and update now create explicit invoice-relief and
  dispute ledger entries when matching accrual lots exist
- older physical invoices can backfill onto delivery lots after later
  actualization creates accrual capacity

### Phase 3: invoice-to-accrual linkage

Relieve accrual lots when invoices are issued.

Key requirement:

- every invoice line should explain which lot or lots it relieved

### Phase 4: cash application and reconciliation

Make payment application explicit and currency-safe.

Key requirements:

- payment must reconcile to billed balance
- FX treatment must be explicit
- overpayment, write-off, and dispute paths must remain visible

### Phase 5: reporting convergence

Refactor reports so that:

- settlement reports use accrual-aware balances
- PnL views stop relying on raw `settlement_status` for realization semantics
- dashboard summaries separate accrual, receivable, and cash states

## Immediate Recommendation

Yes, a redesign is needed.

The optimal path is not to bolt more logic onto `settlement_status` or to add a
single accrual report on top of the existing invoice/payment tables. The better
approach is:

1. keep the current settlement ledger
2. add a delivery-scoped accrual ledger beside it
3. derive projections and reports from that accrual ledger
4. progressively move realization and reconciliation logic onto the new model

This keeps today’s workflows working while giving the product a clean path to:

- unbilled accrual visibility
- invoice relief traceability
- cash reconciliation
- historically reliable financial reporting
