# Governed Core Platform Slice Lock

## Purpose

This document fulfills `GCP-01` from the
[Governed Core Platform Work Packages](./core-platform-work-packages.md). It
locks the first product family and golden-path workflow for the governed-core
phase so the repo can harden one trustworthy operating slice before expanding
broader CTRM, settlement, reporting, or agent-platform scope.

## Related Docs

- [Governed Core Platform Roadmap](./core-platform-roadmap.md)
- [Governed Core Platform Work Packages](./core-platform-work-packages.md)
- [Platform Blueprint](./platform-blueprint.md)
- [Business Use Case Roadmap](./business-use-case-roadmap.md)
- [Reference Data Implementation Plan](./reference-data-implementation-plan.md)
- [Trading Source Roadmap](./trading-source-roadmap.md)
- [Accruals Functionality Redesign](./accruals-functionality-redesign.md)
- [AI Workflow](./ai-workflow.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)

## Locked Decision

The first governed core slice for ECTRM is:

`single-leg, fixed-price, physical natural gas trade capture and lifecycle review with deterministic reference-data validation, projection-backed position impact, settlement preview, and audit/explanation`

This is a product-family lock, not a forever architecture limit. The goal is
to prove the platform's trade, policy, projection, settlement, and AI
governance spine on the narrowest serious commodity workflow already grounded
in the repo.

## Why This Slice

This slice fits the current codebase better than broader alternatives because:

- the repo already has a browser-smoked signed-in trade capture flow for a
  fixed-price physical trade
- the checked-in trade metadata contract already defaults toward
  `PHYSICAL`, `SINGLE`, `LINEAR`, and `FIXED`
- the seeded smoke and demo data already exercise reference-coded book,
  portfolio, counterparty, location, commodity, unit, and currency inputs
- the repo already has downstream settlement candidate and action-request seams
  for invoice and payment follow-through
- the slice is narrow enough to harden trade truth, projection freshness,
  reference-data governance, and settlement readiness without needing a full
  multi-asset or multi-leg abstraction layer first

## Current Repo Anchors

The decision is grounded in checked-in repo behavior and contracts:

- signed-in trade-capture smoke:
  `apps/web/tests/browser/smokeHarness.spec.ts`
- trade-capture field and amend smoke:
  `apps/web/tests/tradingBrowserSmoke.test.ts`
- settlement and invoice candidate fixture surface:
  `apps/web/tests/browser/support/smokeFixtures.ts`
- server-owned trade metadata contract:
  `apps/api/contracts/trade-metadata.contract.json`
- reference-data priority plan for credible trade capture:
  [Reference Data Implementation Plan](./reference-data-implementation-plan.md)
- source-governance milestone for controlled trade capture:
  [Trading Source Roadmap](./trading-source-roadmap.md)

## Product Family Definition

The governed-core phase should treat this product family as the baseline:

- commodity class: `NATURAL_GAS`
- trade nature: `PHYSICAL`
- trade structure: `SINGLE`
- instrument type: `LINEAR`
- pricing type: `FIXED`
- base currency for the slice: `USD`
- canonical quantity unit for the first path: `MMBTU`
- canonical price-unit expectation for the first path: `USD/MMBTU`
- location model: reference-coded physical delivery location or hub
- counterparty model: active, reference-managed counterparty with credit posture
- book and portfolio model: active, reference-managed desk and portfolio codes

The smoke fixture path currently demonstrates this with a deterministic trade
created against reference-coded selections such as `WEST_POWER`, `WEST_BAL`,
`CASCADE_UTIL`, `WAHA_POOL`, and `WAHA_GAS`. Those codes are fixture examples,
not the only allowed production values. The important constraint is the
governed shape of the trade, not the fixture's exact desk naming.

## Golden Path

The golden path for the governed-core phase is:

1. A human operator captures a single-leg physical gas trade using active
   reference-coded book, portfolio, counterparty, location, commodity, unit,
   currency, and price-unit selections.
2. The backend validates the command against deterministic trade metadata,
   reference-data rules, and policy checks before appending the lifecycle
   event.
3. A versioned business event records the mutation with actor, correlation,
   causation, expected-version, and policy context sufficient for replay and
   audit.
4. Trade and position projections refresh with visible freshness or lag state.
5. Humans can inspect lifecycle history and explain the resulting position
   impact from the same governed records.
6. Downstream settlement surfaces can show readiness, blocker, or exception
   posture for invoice or payment follow-through without requiring a full
   accrual subsystem first.
7. The assistant may explain, draft, summarize, and stage typed action
   requests inside this slice, but it may not book, amend, or settle directly.

## In Scope For The Governed-Core Phase

### Trade semantics

- create the first trade through explicit command handling
- support the first narrow lifecycle follow-ups needed for the slice, starting
  with amend, cancel, and correction planning
- keep trade booking a human-owned action
- make trade truth event-led and replay-safe

### Reference-data seams

- books
- portfolios
- counterparties
- locations
- commodities
- units
- currencies
- price-unit validation needed for the fixed-price path

### Policy and review seams

- deterministic permission and reviewer-role checks for the slice
- segregation-of-duties and override rules where needed
- approval-gated downstream actions such as cancel, invoice issue, and payment
  creation

### Projection and position seams

- current trade projection for the chosen slice
- position impact view with freshness metadata
- stale-state checks when approvals or staged actions depend on current
  projections

### Settlement seams

- settlement preview and readiness status
- invoice candidate or blocker visibility
- payment candidate or blocker visibility
- clear distinction between preview, staged action, and executed external
  outcome

### Explainability and AI seams

- event and audit visibility for the slice
- assistant explanation and draft flows
- typed staged action requests with owning work object, reviewer context, and
  stale-state basis

## Explicitly Out Of Scope For This Slice Lock

- options, swaps, or other multi-leg trade structures
- index-priced, formula-priced, or hybrid-priced trade capture
- cross-currency settlement and FX-aware valuation
- broad weather, freight, logistics, or scheduling platform expansion
- full accrual-lot implementation
- full valuation, VaR, or hedge-recommendation engine depth
- generic reporting builder work
- autonomous trade booking
- autonomous invoice issuance, payment release, or external communication
- broad multi-provider AI routing for higher-trust workflows
- widening the first slice to multiple product families before this one is
  trusted end to end

## Approval And Authority Model For The Slice

The first slice uses these authority rules:

- humans own trade capture and any booking decision
- deterministic policy owns permission checks, stale-state rules, and mutation
  eligibility
- assistants may observe, explain, draft, and stage only through typed action
  requests
- approval-gated downstream actions remain human-reviewed
- no freeform model output directly mutates trade, reference-data, settlement,
  or policy records

This means the "approval" step in the near-term golden path is satisfied by
human booking ownership plus explicit approval-gated downstream actions. If the
team later adds a dedicated pre-trade review object to this slice, it should
strengthen the same control model rather than replace it.

## Minimum Reference And Source Baseline

The first slice should not expand until it has a stable baseline for:

- active books and portfolios
- active commodities
- active counterparties and credit posture
- active locations
- active units and price units
- active currencies
- trade metadata defaults and vocabulary owned by the API
- source and audit coverage strong enough to defend controlled trade capture

This aligns with the `M1: Controlled trade capture` milestone from the
[Trading Source Roadmap](./trading-source-roadmap.md).

## Exit Criteria For GCP-01

`GCP-01` is complete when:

- the first product family is explicit and stable enough to govern roadmap
  choices
- the golden path is named and maps to existing or near-term smokeable repo
  behavior
- in-scope and out-of-scope boundaries are clear enough to reject lateral
  expansion during core-platform hardening
- the slice names the minimum trade, reference-data, policy, projection, and
  settlement seams required for trust
- downstream work packages can reference this document instead of re-deciding
  the first slice

## Implications For The Next Packages

- `GCP-02` should define the durable module boundaries needed to support this
  slice without pushing business logic into `admin`, `reports`, or `assistant`.
- `GCP-03` should define the first explicit command catalog around this trade
  family.
- `GCP-04` and `GCP-05` should harden the event envelope and projection
  freshness for this exact path before more lifecycle breadth is added.
- `GCP-06` and `GCP-07` should prioritize the slice's reference-data and policy
  seams ahead of wider feature work.
- `GCP-10` should stop at settlement preview and readiness for this slice
  before expanding into deeper accrual or accounting design.
- `GCP-13` and `GCP-14` should keep AI limited to explanation, drafting, and
  staged actions inside this slice until outcome evidence justifies more.

## Decision Rule

During the governed-core phase, a proposed feature should usually be deferred
if it cannot answer one of these questions positively:

1. Does it make the locked gas trade path more trustworthy end to end?
2. Does it harden deterministic trade, reference-data, policy, projection, or
   settlement truth for the slice?
3. Does it improve reviewability, replay safety, or auditability of the slice?
4. Does it keep AI inside the same governed seams instead of widening its
   authority?

If not, it is probably not part of the first governed-core slice.
