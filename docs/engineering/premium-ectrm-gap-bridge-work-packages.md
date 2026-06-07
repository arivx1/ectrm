# Premium E/CTRM Gap Bridge Work Packages

## Purpose

This package set turns the premium E/CTRM capability gap into executable,
repo-native work packages.

It does not replace the governed-core roadmap. It sharpens that roadmap against
the current premium market benchmark and keeps the bridge anchored to the
locked first product slice:

`single-leg, fixed-price, physical natural gas trade capture and lifecycle review with deterministic reference-data validation, projection-backed position impact, settlement preview, and audit/explanation`

## Related Docs

- [Governed Core Platform Roadmap](./core-platform-roadmap.md)
- [Governed Core Platform Work Packages](./core-platform-work-packages.md)
- [Governed Core Platform Slice Lock](./core-platform-slice-lock.md)
- [Governed Core Trade Command Model](./core-platform-trade-command-model.md)
- [Business Use Case Roadmap](./business-use-case-roadmap.md)
- [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)
- [Accruals Work Packages](./accruals-work-packages.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)

External public benchmark references used for this bridge:

- [ION Openlink](https://iongroup.com/products/commodities/openlink/)
- [ION Allegro](https://iongroup.com/products/commodities/allegro/)
- [ION RightAngle](https://iongroup.com/products/commodities/rightangle/)
- [Amphora Symphony CTRM](https://amphora.net/product/symphony/)
- [Enuit ENTRADE features](https://www.enuit.com/etrm-ctrm-features)
- [PCI ETRM](https://www.pcienergysolutions.com/solutions/etrm/)
- [Gartner Peer Insights ETRM feature categories](https://reviews.api.gartner.com/reviews/market/energy-trading-and-risk-management)

## Bridge Principle

Do not chase every premium module at once. Bridge the gap by making the locked
gas slice premium-grade end to end:

```text
governed trade -> official economics -> position and valuation truth
  -> physical scheduling/actualization -> settlement preview and accounting
  -> integrations, controls, reporting, and governed AI assistance
```

Screens, reports, and assistant features should follow those deterministic
truth seams instead of creating separate business-rule islands.

## Capability Maturity Scale

Use this scale when evaluating each capability.

| Level | Meaning |
| --- | --- |
| 0 - Not started | No durable product seam exists. |
| 1 - Prototype | A useful surface or model exists, but semantics, tests, policy, or operational controls are incomplete. |
| 2 - Governed MVP | Typed service ownership, deterministic rules, audit, focused tests, and manual fallback exist for the locked slice. |
| 3 - Enterprise-ready | Scalable, integrated, role-governed, reconciled, and supportable enough for production-like operations in the locked slice. |

## Premium Gap Scorecard

| Capability | Premium expectation | Current ECTRM baseline | Bridge target for locked gas slice |
| --- | --- | --- | --- |
| Trade lifecycle | Physical/financial deal capture, amendments, corrections, approvals, confirmations, audit, and STP. | Event-led trade capture, amend/cancel, projections, statuses, reference-data-backed forms. | Explicit command catalog, versioned event envelope, approval/correction semantics, and lifecycle tests. |
| Trade economics | Quantity schedules, pricing formulae, secondary costs, delivery/payment terms, and price-unit controls. | Header-level trade economics plus price, volume, price index, units, and basic workflow statuses. | First-class gas trade economics model for fixed-price physical deals. |
| Market data and curves | Official marks, vendor feeds, source freshness, curve construction, as-of access, and approval. | External series and price observations exist across public sync sources. | Official mark/curve store with freshness, approval, and valuation basis for gas. |
| Position and valuation | As-of positions, MTM, P&L, exposure decomposition, basis, and methodology. | Positions, option exposure seams, P&L report schemas, and recommendation evidence. | Deterministic position-as-of and MTM/P&L engine with documented methodology. |
| Credit and limits | Counterparty exposure, limits, credit workflow, breach actions, and review freshness. | Counterparty credit profiles, reports, and policy-oriented seams. | Deterministic credit/limit service used by trade capture, review, and reports. |
| Physical operations | Scheduling, nominations, actualization, inventory, transport modes, and exception queues. | Deliveries, scheduling, operations queues, truck/vessel/pipeline/power details, and actualization surfaces. | Gas scheduling/nomination core, actualization, and typed operations exceptions. |
| Settlement and accounting | Settlement preview, invoice lines, payment application, accrual relief, tax, accounting postings, ERP/GL interface. | Invoices, payments, settlement reports, accrual lots/entries, and action-request seams. | Settlement preview, line-level invoice/payment application, accrual relief, and posting export contract. |
| Integrations | Exchanges, brokers, price vendors, pipelines, ISOs/RTOs, ERP, treasury, GL, and regulatory repositories. | Public market data/weather integrations, Gmail/Slack, and sync monitoring. | Adapter framework plus first gas-relevant external contracts and idempotent outbox. |
| Reporting and compliance | EOD/month-end packs, regulatory reports, audit trails, reconciliation, and data lineage. | Report definitions, P&L history, settlement reports, EOD summary, audit/provenance surfaces. | Slice-level EOD pack with trade, valuation, credit, operations, settlement, projection, and data-freshness evidence. |
| Enterprise controls | Entitlements, segregation of duties, maker-checker, supportability, replay, resilience, and volume behavior. | Broad auth gates, admin controls, projection monitoring, and eval/test lanes. | Action/resource entitlements, SoD, projection SLAs, replay checks, and runbooks. |
| Governed AI | AI reads, explains, drafts, and stages through the same governed seams humans use. | Strong assistant governance, traces, evals, action requests, and outcome metrics. | Tool parity and action-request staging for the locked slice only, gated by outcome evidence. |

## Delivery Order

### Wave 0: Bridge Lock And Maturity Baseline

1. PGB-00 premium bridge scope lock
2. PGB-01 premium capability scorecard

### Wave 1: Transaction And Economic Spine

3. PGB-02 canonical trade command implementation plan
4. PGB-03 versioned business-event envelope implementation plan
5. PGB-04 approval and correction workflow design
6. PGB-05 gas trade economics model v1

### Wave 2: Market Data, Valuation, Risk, And Credit

7. PGB-06 official mark and curve store
8. PGB-07 MTM and P&L engine v1
9. PGB-08 position as-of and risk factor decomposition
10. PGB-09 limit and credit policy service
11. PGB-10 scenario and stress v1

### Wave 3: Physical Operations

12. PGB-11 gas scheduling and nomination core
13. PGB-12 actualization and inventory ledger
14. PGB-13 secondary cost and freight stack
15. PGB-14 operations exception workbench

### Wave 4: Settlement And Accounting

16. PGB-15 settlement preview engine
17. PGB-16 invoice line and payment application model
18. PGB-17 accrual relief and accounting postings
19. PGB-18 ERP/GL interface contract

### Wave 5: Integrations And Enterprise Controls

20. PGB-19 market and operational adapter framework
21. PGB-20 regulatory and audit reporting v1
22. PGB-21 entitlements and segregation of duties
23. PGB-22 operational resilience pass

### Wave 6: Governed AI Acceleration

24. PGB-23 assistant tool parity
25. PGB-24 staged action requests for slice workflows
26. PGB-25 AI outcome gate

## Shared Definition Of Done

Each package is done only when:

- the owning durable domain seam is named
- business writes go through typed services, not prompts, reports, or frontend
  helpers
- deterministic rules identify inputs, outputs, stop conditions, policy
  evidence, stale-state behavior, and audit expectations
- manual fallback and reviewer visibility remain available
- focused verification exists for the affected seam
- assistant evals are updated when assistant behavior, tools, authority, or
  action-request planning changes
- the [Agent Knowledge Base](./agent-knowledge-base.md) is updated when the
  work teaches future agents a reusable autonomy, policy, action-contract, or
  deterministic-algorithm lesson

## PGB-00: Premium Bridge Scope Lock

### Priority

P0

### Size

S

### Status

Drafted here. It reuses the locked gas slice from
[Governed Core Platform Slice Lock](./core-platform-slice-lock.md).

### Outcome

The premium capability bridge is explicitly scoped to the locked physical gas
slice and cannot reopen broad multi-commodity ambition before the slice is
trustworthy.

### Scope

- confirm the locked gas slice is the bridge target
- name the premium-grade destination for that slice
- map premium modules to slice-limited work packages
- reject new work that does not harden trade, valuation, operations,
  settlement, controls, integrations, reporting, or governed AI for the slice

### Out Of Scope

- options, swaps, multi-leg trades, index/formula pricing, broad power ISO
  depth, broad LNG, broad freight, or enterprise multi-commodity rollout
- autonomous trade booking, cash release, or external commitments

### Acceptance Criteria

- product and engineering can evaluate every premium-gap item against the
  locked slice
- the bridge can be linked from roadmap and work-package docs
- each follow-on work package has an owning durable domain seam

### Verification

- docs link/reference check

## PGB-01: Premium Capability Scorecard

### Priority

P0

### Size

S

### Status

Drafted here as the initial scorecard.

### Outcome

The repo has a durable scorecard for comparing ECTRM with premium E/CTRM
capabilities without over-claiming current maturity.

### Scope

- define maturity scale
- list major premium E/CTRM capability categories
- document current baseline and target bridge state
- use the scorecard in planning and roadmap triage

### Out Of Scope

- vendor-by-vendor competitive matrix
- procurement-style feature checklist for every commodity class

### Acceptance Criteria

- scorecard names each major gap category
- current baseline distinguishes prototype surfaces from governed MVP
- bridge target is slice-limited and actionable

### Verification

- docs link/reference check

## PGB-02: Canonical Trade Command Implementation Plan

### Priority

P0

### Size

M

### Outcome

The locked slice has implementation-ready command work that moves trade writes
toward explicit `BookTrade`, `AmendTradeTerms`, `CancelTrade`, and
`CorrectTrade` semantics.

### Scope

- turn the command model into route, schema, service, and test tasks
- map current `/events` compatibility behavior into command-owned handlers
- define stale-state, expected-version, idempotency, duplicate-create, and
  correction rules
- identify fields that remain header-level until PGB-05 lands

### Current Implementation Note

- `CorrectTrade` now enters through the backend command service, requires
  `expected_last_event_id`, `correction_reason`, and a known
  `corrects_event_id`, and records correction-aware provenance while
  temporarily emitting `TradeAmended` during the compatibility phase.
- Remaining bridge work: add dedicated command route shape, decide when to
  promote `TradeCorrected`, and migrate UI/action-request callers away from raw
  event semantics.

### Verification

- focused API tests for command payload validation and event append behavior
- trade metadata contract check when command metadata changes

## PGB-03: Versioned Business-Event Envelope Implementation Plan

### Priority

P0

### Size

M

### Outcome

Trade and downstream workflow events have implementation-ready metadata,
versioning, and replay expectations.

### Scope

- define envelope fields for actor, role, command, correlation, causation,
  expected version, policy evidence, reference-data basis, effective date,
  correction linkage, and schema version
- plan compatibility for existing event rows
- define projection rebuild behavior when older event envelopes are missing
  fields

### Verification

- focused projection rebuild tests
- event schema or contract tests

## PGB-04: Approval And Correction Workflow Design

### Priority

P0

### Size

M

### Outcome

Sensitive lifecycle changes and bad-event corrections have explicit review,
append-only correction, and audit semantics.

### Scope

- define which gas-slice actions require maker-checker review
- define correction record shape and replay behavior
- define stale target checks for approval execution
- preserve human takeover and manual fallback

### Verification

- focused API tests for approval/correction stop conditions
- assistant evals if correction proposals are staged by AI

## PGB-05: Gas Trade Economics Model V1

### Priority

P0

### Size

L

### Outcome

The fixed-price physical gas slice has explicit economic terms instead of
relying only on trade header fields.

### Scope

- model quantity schedule, delivery period, fixed price, price unit, currency,
  location/hub, payment terms, and initial fee hooks
- validate unit and price-unit compatibility
- keep index/formula pricing out of scope except as a future extension point
- expose economics consistently to trade capture, valuation, settlement
  preview, reports, and assistant read tools

### Verification

- focused API tests for economics validation
- web tests for capture/edit rendering when UI changes

## PGB-06: Official Mark And Curve Store

### Priority

P0

### Size

L

### Outcome

Valuation and risk use approved gas marks with visible source, freshness, and
as-of semantics.

### Scope

- define official mark and curve records
- distinguish vendor/raw observations from approved marks
- support as-of reads and freshness status
- document interpolation or no-interpolation behavior for v1
- connect selected gas marks to valuation basis

### Current Implementation Note

- `apps/api/app/domains/risk/services/official_marks.py` now provides the
  first read-only official mark and curve seam. It selects the latest
  observation on or before the as-of date only from active price-index sources,
  reports `FRESH`, `STALE`, or `MISSING`, and uses explicit `NONE`
  interpolation for v1.
- Remaining bridge work: decide whether official marks need persisted approval
  records beyond active source configuration, add route/report exposure, and
  expand curve construction beyond the first read-only gas seam.

### Verification

- focused API tests for source, approval, freshness, and as-of behavior

## PGB-07: MTM And P&L Engine V1

### Priority

P0

### Size

L

### Outcome

The locked slice has deterministic MTM and P&L outputs with methodology,
coverage, exclusions, and stale-data stops.

### Scope

- calculate fixed-price physical gas MTM from trade economics and official mark
- separate realized, unrealized, and excluded valuations
- include methodology text and source evidence in API outputs
- stop or degrade when official marks, quantities, or units are missing

### Current Implementation Note

- `apps/api/app/domains/reports/services/pnl_history.py` now values indexed and
  hybrid trades through the PGB-06 official mark service instead of reading raw
  `PriceIndexObservation` rows directly.
- P&L valuation payloads include mark evidence for indexed pricing, including
  basis, no-interpolation method, approved-source status, freshness, selected
  observation date, source provider/series, run id, staleness, and missing-mark
  reason when applicable.
- Remaining bridge work: persist/report official marks as first-class records
  if owners require approval workflows beyond active source configuration,
  tighten unit/currency compatibility stops, and broaden valuation coverage
  beyond LINEAR single-leg fixed/index/hybrid trades.

### Verification

- focused API tests for valuation math, missing marks, stale marks, and
  report totals

## PGB-08: Position As-Of And Risk Factor Decomposition

### Priority

P1

### Size

L

### Outcome

Positions can be reviewed as of a date and decomposed by book, portfolio,
commodity, location, tenor, side, physical/financial status, and price basis.

### Scope

- define as-of position read model for the gas slice
- add risk-factor dimensions needed by valuation, credit, and EOD reporting
- preserve projection freshness and replay evidence

### Current Implementation Note

- `apps/api/app/domains/risk/services/position_as_of.py` now provides the first
  read-only position-as-of service. It replays trade lifecycle events through
  the requested as-of date, excludes inactive and option trades, decomposes swap
  legs, and groups signed exposure by book, portfolio, commodity, location,
  tenor, side, physical/financial status, pricing basis, and unit.
- Rows preserve replay evidence through source basis, contributing trade ids,
  latest change timestamp, per-row event counts, and legacy projection counts.
  Legacy trades without event history enter only when their trustworthy
  projection timestamp is on or before the as-of date and remain labelled as
  `LEGACY_PROJECTION`.
- Remaining bridge work: expose the service through route/report contracts,
  reconcile it with the current `positions` projection, add unit conversion
  policy, and feed credit, EOD, and exposure decomposition from the same
  position-as-of basis.

### Verification

- focused projection and position tests

## PGB-09: Limit And Credit Policy Service

### Priority

P0

### Size

L

### Outcome

Credit and limit decisions are deterministic, reusable, and visible during
capture, review, reporting, and assistant explanation.

### Scope

- centralize counterparty exposure calculation for the gas slice
- define limit utilization, breach, review-freshness, and action behavior
- make policy output machine-readable with stop conditions and override hooks
- integrate with trade command validation and reports

### Current Implementation Note

- `apps/api/app/domains/risk/services/counterparty_credit_policy.py` now
  provides the first typed counterparty credit-limit policy service. It
  calculates current and projected exposure, assigns `CLEAR`, `WATCH`,
  `BREACH`, `STALE_REVIEW`, and `OVERRIDE_APPROVED` statuses, and emits
  machine-readable action, stop, warning, freshness, utilization, and override
  evidence.
- `apps/api/app/domains/reports/services/counterparty_credit.py` now delegates
  trade-policy evaluation and report exposure calculations to that risk service
  while preserving the existing policy dict keys used by trade validation and
  credit workflow helpers.
- Remaining bridge work: persist versioned limit-policy configuration beyond
  the current credit profile fields, wire active credit exceptions directly into
  the policy override input, expose policy evidence through report/API
  contracts, and feed command validation from the typed result without the
  compatibility dict layer.

### Verification

- focused API tests for clear, watch, breach, stale review, and override cases

## PGB-10: Scenario And Stress V1

### Priority

P1

### Size

M

### Outcome

Risk users can run simple governed shocks over the locked gas slice without
turning recommendations into execution.

### Scope

- support flat price, basis, volume, and delivery-disruption shocks
- report affected trades, positions, MTM delta, and missing evidence
- keep hedge execution and autonomous action out of scope

### Current Implementation Note

- `apps/api/app/domains/risk/services/scenario_stress.py` now provides the
  first read-only scenario stress service. It consumes PGB-07 P&L valuations
  and PGB-08 position-as-of rows, applies flat-price, basis, volume, and
  delivery-disruption shocks in memory, and labels the result as
  `READ_ONLY_NO_EXECUTION`.
- Trade impacts preserve official-mark evidence and produce MTM deltas only
  when the source valuation is included in governed P&L totals. Missing marks
  or incomplete valuation inputs become blocking missing-evidence rows rather
  than invented prices.
- Position impacts use the event-replayed position rows for volume and
  delivery-disruption effects. Delivery disruptions require overlapping tenor
  evidence; missing tenors are reported as missing evidence.
- Remaining bridge work: expose scenario runs through route/UI contracts, add
  persisted scenario templates/run history if owners need repeatable libraries,
  broaden shock factor coverage beyond the locked gas slice, and connect EOD or
  assistant read tools to the same read-only service.

### Verification

- focused API tests for scenario math and missing-evidence handling

## PGB-11: Gas Scheduling And Nomination Core

### Priority

P0

### Size

L

### Outcome

Physical gas deals have deterministic scheduling and nomination state that
operations, settlement, and assistant tools can trust.

### Scope

- model schedule commitment, nomination reference, route/path, scheduled
  quantity, start/end gas day, and owner
- define status transitions and blockers
- validate required fields for pipeline-style gas movement
- expose readiness and blocker state to operations queues

### Current Implementation Note

- `apps/api/app/domains/operations/services/gas_scheduling.py` now provides the
  first deterministic gas schedule commitment service over existing delivery
  obligations and pipeline detail records. It models scheduled quantity, unit,
  start/end gas day, owner, pipeline system, route/path, receipt/delivery
  locations, contract/cycle, and nomination reference with an explicit
  `delivery_obligation_pipeline_nomination_v1` basis.
- The service defines nomination status transitions across `PENDING`,
  `SCHEDULED`, `NOMINATED`, `COMPLETED`, and `NOT_REQUIRED`; validates pipeline
  gas movement blockers before status transitions; updates the trade nomination
  status and delivery execution status only through the typed service; and
  writes trade audit events for schedule capture/status changes.
- `apps/api/app/domains/operations/services/shipments.py` now reuses the gas
  scheduling blocker helper so operations delivery-board rows surface missing
  schedule owner, pipeline system/path, receipt/delivery point, and nomination
  reference evidence.
- Remaining bridge work: expose the schedule commitment contract directly
  through route/UI schemas, add persisted schedule-run/version history if
  operators need multiple nomination cycles, connect scheduling readiness to
  settlement/actualization preview, and extend from the first gas pipeline slice
  into richer pipeline bulletin-board or nomination-feed integrations.

### Verification

- focused API tests for scheduling lifecycle and blocker transitions
- web tests if scheduling workspace behavior changes

## PGB-12: Actualization And Inventory Ledger

### Priority

P1

### Size

L

### Outcome

Actual delivered gas quantities become auditable records that can drive
settlement preview, accruals, and position updates.

### Scope

- define actualization records linked to trade and schedule commitments
- record actual quantity, unit, location, gas day, source, and evidence
- define whether inventory is in scope for the first gas slice or explicitly
  deferred behind actualization-only treatment

### Current Implementation Note

- `apps/api/app/domains/operations/services/actualization_ledger.py` now
  provides the first deterministic actualization ledger report over existing
  `TradeActualization`, `DeliveryObligation`, and `DeliveryPipelineDetail`
  records. It emits the `trade_actualization_schedule_evidence_v1` basis,
  actual quantity, unit, actual gas day, delivery location, source evidence,
  linked schedule commitment evidence, settlement eligibility/blockers, and
  correction metadata.
- `upsert_trade_actualization` and `void_trade_actualization` continue to own
  actualization writes, accrual synchronization, workflow synchronization, and
  audit events. Their trade audit payloads now include an
  `actualization_ledger` snapshot so create, correction, and void actions carry
  the same settlement and inventory boundary evidence that reports use.
- Inventory is explicitly deferred for this first gas slice with
  `ACTUALIZATION_ONLY_INVENTORY_DEFERRED`: no inventory ledger entries are
  created, and actualization records are treated as settlement/accrual
  evidence until custody, ownership, and balance policy are approved.
- Remaining bridge work: expose the ledger through an operations or settlement
  route contract, connect it directly to the settlement preview engine, add
  inventory policy/ledger posting if approved, and expand gas-day handling when
  pipeline feeds provide a business gas-day separate from actualized timestamp.

### Verification

- focused API tests for actualization create/correct and settlement linkage

## PGB-13: Secondary Cost And Freight Stack

### Priority

P1

### Size

M

### Outcome

Transport, tariff, storage, and other gas-slice costs are explicit enough to
feed settlement and P&L instead of living in notes or assumptions.

### Scope

- define first fee item model and cost ownership
- distinguish estimated, accrued, invoiced, and relieved costs
- connect cost items to trade economics, actualization, and settlement preview

### Verification

- focused API tests for cost inclusion/exclusion and status transitions

## PGB-14: Operations Exception Workbench

### Priority

P1

### Size

M

### Outcome

Operational gaps are typed exceptions that humans and assistants can inspect,
route, and resolve.

### Scope

- define exceptions for missing nomination, stale schedule, missing actuals,
  quantity mismatch, document missing, and settlement blocked
- add owner, severity, stale-state basis, source evidence, and resolution path
- connect exceptions to queues rather than only dashboards

### Verification

- focused API tests and web tests for exception rendering

## PGB-15: Settlement Preview Engine

### Priority

P0

### Size

L

### Outcome

The platform can preview expected invoice/cash posture for the gas slice before
issuance or payment actions.

### Scope

- calculate expected settlement from trade economics, actuals or scheduled
  quantity, price, fees, due calendars, and counterparty terms
- produce readiness, blocker, assumption, and exception outputs
- keep preview distinct from executed invoice or payment records

### Verification

- focused API tests for ready, blocked, disputed, stale, and missing-evidence
  previews

## PGB-16: Invoice Line And Payment Application Model

### Priority

P0

### Size

L

### Outcome

Settlement moves from header-level invoice/payment math toward line-level
traceability and explicit cash application.

### Scope

- model invoice lines linked to trade, actualization, fee, or accrual basis
- model payment application records
- handle short pay, overpay, unapplied cash, and dispute states explicitly
- prevent cross-currency netting unless an approved FX treatment exists

### Verification

- focused API tests for line totals, payment application, overpay, short pay,
  disputes, and currency stops

## PGB-17: Accrual Relief And Accounting Postings

### Priority

P1

### Size

L

### Outcome

Accruals, invoices, and accounting posting drafts reconcile through the same
gas-slice settlement basis.

### Scope

- connect accrual lots to actualization and invoice lines
- create explicit relief events or entries
- draft accounting postings with source evidence and idempotency keys
- keep final ERP/GL posting behind PGB-18

### Verification

- focused API tests for accrual creation, relief, and posting draft balance

## PGB-18: ERP/GL Interface Contract

### Priority

P1

### Size

M

### Outcome

Accounting outputs have a documented, idempotent integration contract before
any live ERP/GL connection is built.

### Scope

- define outbound posting/export schema
- include idempotency, replay, correction, and status callback behavior
- define reconciliation report expectations
- keep vendor-specific adapters out of the first contract unless required

### Verification

- contract tests for exported posting payloads

## PGB-19: Market And Operational Adapter Framework

### Priority

P1

### Size

L

### Outcome

External connectivity is handled through a reusable adapter pattern instead of
one-off sync code.

### Scope

- define adapter lifecycle, source identity, idempotency, freshness, retry, and
  observability expectations
- align with the side-effect ledger and integration outbox
- identify first gas-relevant adapters: price source, pipeline nomination/feed,
  ERP/GL export, and document inbox

### Verification

- focused adapter tests with deterministic fixtures

## PGB-20: Regulatory And Audit Reporting V1

### Priority

P1

### Size

M

### Outcome

The locked slice has a defendable EOD/audit pack with trade, position,
valuation, credit, operations, settlement, projection, and data-freshness
evidence.

### Scope

- extend EOD reporting around official marks and settlement preview
- add audit exports for command/event/projection lineage
- define regulatory placeholders only where the gas slice needs them

### Verification

- focused report tests

## PGB-21: Entitlements And Segregation Of Duties

### Priority

P0

### Size

L

### Outcome

The locked slice no longer depends mostly on broad admin/write gates for
business authority.

### Scope

- define action/resource permission matrix for trade, operations, settlement,
  reference data, policy, reports, and assistant actions
- define maker-checker and override roles
- enforce permissions in typed services and action-request execution

### Verification

- focused API tests for allowed, denied, maker-checker, and override cases
- assistant evals for authority-boundary behavior

## PGB-22: Operational Resilience Pass

### Priority

P1

### Size

M

### Outcome

The gas slice has supportable replay, freshness, reconciliation, and smoke
behavior.

### Scope

- define projection freshness SLAs
- add replay and reconciliation jobs for trade, position, valuation,
  scheduling, settlement, and accrual outputs
- document runbooks and operational alerts
- set first volume/performance targets for the slice

### Verification

- projection integrity tests
- focused smoke checks
- browser smoke for the golden path

## PGB-23: Assistant Tool Parity

### Priority

P1

### Size

M

### Outcome

Agents can inspect the same governed gas-slice records, freshness labels, and
policy outputs that humans use.

### Scope

- expose read tools for trade economics, official marks, valuation, position,
  credit, scheduling, settlement preview, exceptions, and audit lineage
- include missing evidence and stale-data states in machine-readable form
- avoid agent-only shortcuts

### Verification

- `make api-assistant-evals`
- focused assistant tooling tests

## PGB-24: Staged Action Requests For Slice Workflows

### Priority

P1

### Size

L

### Outcome

Low-risk internal workflow updates can be staged through shared action
requests while sensitive actions stay human-reviewed.

### Scope

- define action request types for correction proposal, scheduling update,
  settlement preview follow-up, invoice draft, payment application draft, and
  accrual entry draft where policy permits
- require stale-state basis, reviewer role, expected effect, and policy
  evidence
- keep external commitments and cash release out of scope

### Verification

- focused action-request tests
- `make api-assistant-evals`

## PGB-25: AI Outcome Gate

### Priority

P1

### Size

M

### Outcome

AI assistance only widens after measured outcomes show it improves the locked
slice without weakening controls.

### Scope

- measure approval rate, rejection reasons, stale-state failures, manual
  cleanup, cycle-time impact, and policy stops
- define promotion, pause, and rollback criteria
- keep authority changes human-owned

### Verification

- assistant outcome metric tests
- `make api-assistant-evals`

## First Implementation Cut

Start with these packages:

1. PGB-02 canonical trade command implementation plan
2. PGB-06 official mark and curve store
3. PGB-07 MTM and P&L engine v1
4. PGB-11 gas scheduling and nomination core
5. PGB-15 settlement preview engine
6. PGB-21 entitlements and segregation of duties

This cut creates the minimum credible premium spine for the locked gas slice:
governed trade, official marks, valuation truth, physical lifecycle, settlement
readiness, and action-level authority.
