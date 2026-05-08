# Trading EOD Work Packages

## Goal

Deliver the first trustworthy trading end-of-day workflow for ECTRM so the
desk, operations, settlement, and risk users can answer one daily question with
shared evidence:

- can this trading day be treated as closed on the platform?

The initial slice should:

- define one explicit close basis for the day instead of letting every surface
  silently answer "as of now"
- combine trade, position, PnL, workflow, settlement, and accrual checks into
  one governed close posture
- classify close readiness deterministically as `READY`, `WARNING`, or
  `BLOCKED`
- preserve human sign-off, waiver, and audit expectations
- expose the same close context to humans in the UI and agents through typed
  read tools
- keep official financial and operational truth in typed services, not in
  prompt-only reasoning

This is an operator and governance workflow, not an autonomous trading
capability.

## Primary Design Inputs

- [README.md](../../README.md)
- [Platform Blueprint](./platform-blueprint.md)
- [Business Use Case Roadmap](./business-use-case-roadmap.md)
- [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)
- [Accruals Functionality Redesign](./accruals-functionality-redesign.md)
- [Accruals Work Packages](./accruals-work-packages.md)
- [Agent Role Catalog](./agent-role-catalog.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Trading Source Roadmap](./trading-source-roadmap.md)

## Current Repo Anchors

The EOD slice should extend existing product seams before adding a large
close-engine subsystem.

- Reporting routes:
  `apps/api/app/domains/reports/routes/http.py`
- Reporting services:
  `apps/api/app/domains/reports/services/overview.py`,
  `apps/api/app/domains/reports/services/pnl_history.py`, and
  `apps/api/app/domains/reports/services/settlement.py`
- Operations overview and queue routes:
  `apps/api/app/domains/operations/routes/operations.py`
- Trade attention and workflow services:
  `apps/api/app/domains/operations/services/trade_attention_candidates.py` and
  `apps/api/app/domains/operations/services/workflow_items.py`
- Accrual read routes:
  `apps/api/app/domains/accruals/routes/http.py`
- Projection integrity monitoring:
  `apps/api/app/domains/admin/services/projection_monitoring.py`
- Frontend report client:
  `apps/web/src/entities/reports/api.ts`
- Existing report contracts:
  `apps/api/app/schemas/report.py`
- Existing operations summary contracts:
  `apps/api/app/schemas/operations.py`

The first implementation should prefer composition over replacement:

- reuse existing report builders
- reuse existing workflow and attention signals
- normalize dependency and freshness inputs rather than inventing parallel
  health models
- add close-specific work objects only where the current report surfaces do not
  preserve enough basis, ownership, or audit detail

## Authority Boundary

Phase 1 authority for trading EOD should stay conservative.

Deterministic services and typed product objects must own:

- official close basis for a business date
- close-readiness classification
- stale or missing data rules
- required sign-off roles
- waiver policy and stale-state rechecks
- any mutation of close, workflow, report, or settlement records

Agents may:

- explain the current close posture
- draft desk packs and carry-forward summaries
- summarize blocked or warning checks
- draft owned follow-up by desk, operations, settlement, or risk role
- stage approval-gated workflow updates only after the close objects and policy
  checks exist

Agents may not:

- declare the official trading day closed
- waive blocked checks through prompt-only reasoning
- override PnL, settlement, accrual, or exposure truth
- mutate close state outside typed services
- bind the firm externally

## Work Objects

The EOD slice should introduce or prepare these durable work objects:

| Work object | Initial status | Notes |
| --- | --- | --- |
| EOD run | Planned | Top-level record for one business date, cut-off basis, lifecycle state, and generated summary. |
| EOD check result | Planned | One deterministic rule result with status, evidence, owner role, and stop reason. |
| EOD exception | Planned | Durable blocker or warning that can outlive one chat response and drive ownership. |
| EOD sign-off | Planned | Per-role approval record tied to one EOD run and stale-state basis. |
| EOD waiver | Planned | Explicit override with approver, reason, scope, and expiry or follow-up expectation. |
| Desk close pack | Draft output | Human-readable summary generated from the EOD run and linked evidence. |

## Delivery Order

### Wave 0: Contract And Rules Foundation

1. `TEOD-01` EOD run contract and shared report basis
2. `TEOD-02` deterministic close-readiness decision table
3. `TEOD-03` source freshness and integrity signal normalization

### Wave 1: Operator Close Surface

4. `TEOD-04` EOD aggregation API and close summary surface
5. `TEOD-05` exception routing and ownership workflow
6. `TEOD-06` sign-off, waiver, and audit trail

### Wave 2: Financial Depth And Explainability

7. `TEOD-07` accrual and delivered-but-unbilled close coverage
8. `TEOD-08` position and PnL explain coverage at close

### Wave 3: Supervised Automation And Coverage

9. `TEOD-09` desk pack drafting and agent toolkit
10. `TEOD-10` scheduled close monitoring and regression coverage

## Shared Definition Of Done

Each package is done only when:

- one explicit `as_of` or close-basis definition is visible on the affected
  EOD surfaces
- deterministic services, not freeform model output, determine official close
  state
- stale, missing, degraded, or unsupported data are visible to the reviewer
- manual fallback remains available when data is incomplete or contradictory
- owner roles and next actions are explicit for blocked or warning checks
- audit fields and stale-state protection exist for any sign-off or waiver path
- docs are updated when the operator workflow, governance model, or report
  basis changes
- assistant or automation behavior changes land with assistant eval coverage
- frontend close workflow changes land with focused web test or smoke coverage

## TEOD-01: EOD Run Contract And Shared Report Basis

### Priority

P0

### Size

M

### Outcome

ECTRM has one typed work object that represents the trading close attempt for a
business date and pins the basis used by the rest of the EOD workflow.

### Scope

- define the minimal `eod_run` contract:
  - stable `run_id`
  - `business_date`
  - `cut_off_at`
  - `as_of`
  - generated timestamps
  - lifecycle state such as `OPEN`, `EVALUATING`, `READY`, `BLOCKED`,
    `SIGNED_OFF`, or `SUPERSEDED`
  - initiating actor
- define which existing reports must honor the run basis:
  - reporting overview
  - exposure summary
  - PnL history and comparison
  - settlement aging
  - cash forecast
  - settlement exceptions
  - accrual reconciliation
- decide whether the first slice stores only basis metadata or also stores a
  normalized snapshot payload
- make the basis explicit instead of silently defaulting every close screen to
  "now"

### Out Of Scope

- final sign-off policy
- waiver execution
- a full replayable snapshot warehouse

### Dependencies

None

### Acceptance Criteria

- one EOD run can be created or loaded for a business date without ambiguity
- every close-facing report can identify the basis it is using
- no EOD surface silently mixes different `as_of` values inside one run
- the contract leaves room for later sign-off, waiver, and versioning metadata

### Verification

- focused API tests for contract shape and basis propagation
- schema or service tests for invalid or contradictory basis inputs

## TEOD-02: Deterministic Close-Readiness Decision Table

### Priority

P0

### Size

M

### Outcome

The platform determines close posture through a typed decision table instead of
through prose-only assistant judgment.

### Scope

- define close statuses such as:
  - `READY`
  - `WARNING`
  - `BLOCKED`
- define close check families for the first slice:
  - trade capture completeness
  - pricing and valuation readiness
  - position or projection integrity
  - workflow and operational backlog
  - settlement readiness
  - accrual coverage
  - dependency or freshness health
- define per-check outputs:
  - status
  - reason code
  - human-facing explanation
  - owning role
  - linked records
  - whether the result can be waived
- define fail-closed behavior for missing or contradictory inputs
- define how run-level status rolls up from the check set

### Out Of Scope

- automated exception resolution
- human approval UI details

### Dependencies

- `TEOD-01`

### Acceptance Criteria

- the same inputs always produce the same EOD status and reason codes
- each blocked or warning result is explainable from structured evidence
- a reviewer can see whether a result is non-waivable, waivable, or purely
  informational
- unsupported or stale inputs do not silently produce `READY`

### Verification

- service tests for status rollup and edge cases
- rule-table tests for missing, stale, contradictory, and healthy inputs

## TEOD-03: Source Freshness And Integrity Signal Normalization

### Priority

P0

### Size

M

### Outcome

EOD checks consume one normalized health model for report freshness,
dependency status, and projection integrity.

### Scope

- normalize source or subsystem health into machine-readable states such as:
  - `OK`
  - `STALE`
  - `DEGRADED`
  - `MISSING`
- define adapters for initial EOD signal sources:
  - dependency health from `/operations/system-overview`
  - projection monitoring snapshot
  - trading source freshness where a close check depends on external data
  - report generation timestamps and coverage flags
  - PnL methodology and historical-coverage limits
- define freshness metadata that must travel with each EOD check:
  - source timestamp
  - freshness state
  - SLA or expectation
  - blocking or warning implication
- align wording with existing source-freshness patterns already used by
  trader/risk recommendation work

### Out Of Scope

- onboarding new external market-data vendors
- full official mark governance for every asset class

### Dependencies

- `TEOD-02`

### Acceptance Criteria

- every EOD check cites the source timestamps and normalized health it relied
  on
- stale or missing inputs are visible in both API output and close UI
- the same freshness semantics can later be reused by agents and reports
- close classification can distinguish bad data from ordinary business backlog

### Verification

- focused service tests for freshness normalization
- API tests for propagated freshness and coverage metadata

## TEOD-04: EOD Aggregation API And Close Summary Surface

### Priority

P0

### Size

L

### Outcome

Operators can load one EOD summary that aggregates the close basis, top-line
status, and linked report sections for a business date.

### Scope

- add read APIs for:
  - current EOD run summary
  - historical EOD run lookup
  - EOD check result listing
- define a close summary response that reuses existing report builders where
  possible instead of re-implementing the same math
- add an initial web surface for:
  - run status
  - check counts by severity
  - linked sections for positions, PnL, workflow, settlement, and accruals
  - visible basis metadata and freshness notes
- prefer an initial lightweight surface over a full new workspace if a report
  or operations shell can host the first slice cleanly

### Out Of Scope

- final sign-off flow
- agent-authored draft packs

### Dependencies

- `TEOD-01`
- `TEOD-02`
- `TEOD-03`

### Acceptance Criteria

- an operator can load one business date and see the platform's consolidated
  EOD posture
- summary totals tie back to the linked underlying report sections
- the UI makes the difference between blocked, warning, and ready checks
  obvious
- the surface preserves a manual path into the underlying workflow and report
  pages

### Verification

- focused API tests for EOD summary assembly
- focused web tests for summary rendering and status states

## TEOD-05: Exception Routing And Ownership Workflow

### Priority

P0

### Size

L

### Outcome

Blocked and warning close findings become durable owned work, not just a red
badge on one screen.

### Scope

- define whether close exceptions should:
  - reuse current workflow items directly
  - create a thin close-exception layer over multiple records
  - or use a hybrid model
- assign initial owner roles by check family:
  - Trader or Desk Lead
  - Operations Lead
  - Settlement Lead
  - Risk or Credit Owner
- add next-step and linked-record expectations for each close exception
- define how one exception maps to multiple underlying trade or invoice records
- decide when an exception auto-closes versus when a reviewer must confirm
  closure

### Out Of Scope

- broad bounded-autonomy execution for exception resolution
- external counterparty communication

### Dependencies

- `TEOD-04`

### Acceptance Criteria

- every blocked result has a named owner role and at least one linked record
- reviewers can distinguish operational backlog from true close blockers
- exception lifecycle changes are auditable
- the platform supports carry-forward from one close cycle to the next when the
  underlying issue remains unresolved

### Verification

- focused API or service tests for exception creation, linkage, and roll-forward
- focused web tests for ownership and lifecycle rendering

## TEOD-06: Sign-Off, Waiver, And Audit Trail

### Priority

P0

### Size

L

### Outcome

The platform captures who accepted the EOD posture, what they accepted, and
whether any warning or blocked checks were explicitly waived.

### Scope

- define required sign-off roles for the first slice
- add sign-off records tied to:
  - EOD run
  - actor
  - timestamp
  - stale-state basis
  - notes or decision summary
- define waiver rules:
  - which checks are waivable
  - required approver role
  - required reason
  - expiry or revisit expectation
  - effect on run-level status
- preserve a truthful distinction between:
  - closed cleanly
  - closed with waivers
  - not closed

### Out Of Scope

- policy-admin UI for changing required sign-off roles
- autonomous waiver approval

### Dependencies

- `TEOD-02`
- `TEOD-05`

### Acceptance Criteria

- a final close state cannot appear without the required sign-off records or
  explicit waiver model
- sign-off fails safely when the underlying run basis or check set has changed
- waivers preserve approver, reason, scope, and downstream impact
- the audit trail is readable without opening the original chat or report tabs

### Verification

- focused API tests for sign-off and stale-state behavior
- focused web tests for approval and waiver rendering

## TEOD-07: Accrual And Delivered-But-Unbilled Close Coverage

### Priority

P1

### Size

L

### Outcome

The EOD process surfaces delivered-but-unbilled and accrual-reconciliation
gaps instead of implying that settlement status alone is enough for close.

### Scope

- connect EOD checks to current accrual reconciliation reads
- define the first close checks for:
  - delivered quantity without actualization support
  - accrued versus billed gaps
  - billed versus collected gaps
  - missing invoice readiness where actualization exists
- make partial coverage explicit while the accrual domain is still maturing
- align the close workflow with the accrual redesign and work-package roadmap

### Out Of Scope

- a full treasury workflow
- realized FX treatment beyond current explicit rules

### Dependencies

- `TEOD-04`
- relevant accrual packages, especially accrual reconciliation and invoice
  linkage work

### Acceptance Criteria

- EOD can surface materially delivered-but-unbilled or unreconciled accrual
  exposure
- partial historical or domain coverage is visible instead of hidden
- close reviewers can tie accrual blockers back to delivery, invoice, or
  payment evidence
- settlement-ready and accrual-ready remain distinguishable states

### Verification

- focused service tests for accrual-derived close checks
- report or API tests for coverage flags and grouped exception outputs

## TEOD-08: Position And PnL Explain Coverage At Close

### Priority

P1

### Size

M

### Outcome

The close workflow can explain what changed in exposure and PnL for the day
instead of only showing static totals.

### Scope

- define close-oriented summary sections for:
  - day-over-day exposure change
  - largest PnL drivers
  - priced versus unpriced exposure at close
  - major methodology or coverage caveats
- reuse existing PnL history and comparison services where possible
- surface historical-coverage caveats from the current PnL methodology so the
  desk does not over-trust legacy backfill
- define the minimum explainability payload an agent or reviewer needs for a
  desk close pack

### Out Of Scope

- a full VaR, Greeks, or stress engine
- official books-and-records valuation redesign

### Dependencies

- `TEOD-04`
- `TEOD-07` for deeper accrual-aware financial explanation

### Acceptance Criteria

- reviewers can see not only the close totals but also the biggest drivers of
  change
- stale marks, missing pricing, or unsupported history are visible in the
  explanation layer
- close summaries can distinguish realized, unrealized, and partial-coverage
  caveats without freeform prompt reconstruction

### Verification

- focused API tests for close explanation payloads
- focused web tests for top-driver and caveat rendering

## TEOD-09: Desk Pack Drafting And Agent Toolkit

### Priority

P1

### Size

M

### Outcome

The platform can generate a reviewable close pack draft from typed EOD data,
and agents can explain the close without inventing their own hidden basis.

### Scope

- define a typed read tool or response surface for EOD runs and checks
- define a draft close-pack structure with sections such as:
  - run basis
  - summary status
  - blocked items
  - warnings and waivers
  - carry-forward items for tomorrow
- enable reporting or reconciliation agents to draft summaries from the typed
  close payload
- keep the role ceiling at read, explain, and draft only

### Out Of Scope

- autonomous finalization of the close
- automatic waiver creation

### Dependencies

- `TEOD-04`
- `TEOD-06`
- `TEOD-08`

### Acceptance Criteria

- the assistant can explain the same close posture the UI shows
- the draft pack cites the EOD run basis and linked evidence
- assistant outputs do not over-claim that the trading day is officially closed
  unless the typed run state says so
- live-tool and prompt behavior are covered by assistant evals

### Verification

- `make api-assistant-evals`
- focused API tests for EOD tool output
- focused web tests for draft-pack rendering when applicable

## TEOD-10: Scheduled Close Monitoring And Regression Coverage

### Priority

P1

### Size

M

### Outcome

ECTRM can detect when a close cycle is due, evaluate whether the close is
ready, and alert the right users without implying autonomous authority over the
official close itself.

### Scope

- define a scheduled evaluation path for EOD runs
- reuse existing monitoring and alerting patterns where possible
- add delivery options for:
  - admin or operations workspace visibility
  - inbox item or workflow creation
  - optional email-style alerting later
- add regression coverage for:
  - API status assembly
  - close workflow rendering
  - assistant no-overclaim behavior
  - any browser-level close handoff that spans multiple surfaces

### Out Of Scope

- automatic trade, settlement, or accrual correction
- autonomous close approval

### Dependencies

- `TEOD-04`
- `TEOD-06`
- `TEOD-09`

### Acceptance Criteria

- a scheduled close evaluation can mark a run as not ready and route attention
  without changing financial truth
- operators can rerun or refresh the close evaluation through a controlled path
- the regression suite covers the critical API, UI, and assistant behavior
  expected by the EOD workflow

### Verification

- focused API tests for scheduled evaluation
- `make api-assistant-evals` when assistant behavior changes
- `make web-test` and `make web-smoke-test` when the browser close flow changes

## Suggested First Slice

The smallest credible implementation path is:

1. `TEOD-01` EOD run contract and shared basis
2. `TEOD-02` deterministic readiness rules
3. `TEOD-03` freshness and integrity normalization
4. `TEOD-04` one close summary API and UI surface

That sequence is enough to give ECTRM a truthful daily close posture before
adding sign-off, waivers, accrual depth, or agent-authored desk packs.
