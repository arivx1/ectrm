# Trader/Risk MVP Work Packages

## Goal

Deliver the first trustworthy trader and risk-manager slice from the business
use-case roadmap:

- identify opportunity and volatility signals worth reviewing
- identify simple product or quality, time, and geographic arbitrage signals
  worth reviewing
- explain residual exposure and simple long/short offsets
- draft hedge or book-flattening recommendations
- enrich pre-trade scenarios with evidence, freshness, and reviewer focus
- expose the same recommendation evidence through agent-readable tools
- keep all trade booking, hedge execution, and external commitment authority
  with humans

This is an MVP for decision support, not autonomous trading.

## Primary Design Inputs

- [Business Use Case Roadmap](./business-use-case-roadmap.md)
- [Pre-Trade Design](./pre-trade-design.md)
- [Arbitrage Detection Design](./arbitrage-detection-design.md)
- [Trading Source Roadmap](./trading-source-roadmap.md)
- [Agent Role Catalog](./agent-role-catalog.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)

## Current Repo Anchors

The MVP should extend existing seams before adding a large new risk engine.

- Backend pre-trade routes: `apps/api/app/routes/pretrade.py`
- Backend pre-trade schemas: `apps/api/app/schemas/pretrade.py`
- Backend recommendation service:
  `apps/api/app/domains/reports/services/pretrade_recommendations.py`
- Frontend pre-trade workspace:
  `apps/web/src/workspaces/pretrade/PreTradeWorkspace.tsx`
- Frontend pre-trade recommendation helper:
  `apps/web/src/workspaces/pretrade/preTradeRecommendations.ts`
- Pre-trade API client: `apps/web/src/entities/pretrade/api.ts`
- Existing context sources: positions, option exposures, market context,
  latest price-index observations, weather intelligence, active trades,
  counterparties, and counterparty credit profiles.

## Authority Boundary

Phase 1 authority for this MVP is read, explain, and draft only.

Agents and recommendation services may:

- explain market, exposure, and source-freshness context
- draft opportunity notes
- draft pre-trade scenarios
- draft hedge or flattening recommendations
- create review-ready evidence that a human can inspect

They may not:

- book, amend, or cancel trades directly
- execute hedges
- accept bilateral offers
- commit freight or logistics externally
- release cash or issue payment instructions
- change limits, policies, reference data, or agent configuration

## Agent Toolkit Implications

Every trader/risk capability in this MVP should be built for both UI use and
agent use.

Toolkit additions should follow this order:

1. Add or extend read tools for source context, such as positions, option
   exposure, marks, market context, weather, and pre-trade reviews.
2. Add deterministic recommendation tools that return structured opportunity,
   residual exposure, netting, and hedge-draft payloads.
3. Add assistant eval coverage before Market Research, Pre-Trade Structuring,
   or Risk Sentinel agents depend on those tools.
4. Consider approval-gated action request types only after the durable work
   objects, policies, stale-state checks, and outcome metrics exist.

The first toolkit goal is better drafting and explanation, not execution. A
tool response should be usable by an agent without hidden prompt interpretation:
include source snapshots, confidence, missing evidence, rejected alternatives,
policy stops, and suggested next review action as typed fields.

## Work Objects

The MVP should use or prepare these durable work objects:

| Work object | MVP status | Notes |
| --- | --- | --- |
| Pre-trade scenario | Existing | Extend draft fields only after schema and handoff implications are clear. |
| Pre-trade review item | Existing | Primary human review object before trade capture. |
| Market opportunity | Review-draft object implemented | Governance promotion signals can create shared market-opportunity review drafts tied to approved review and recommendation evidence. No trade, pricing, offer, order, execution, credit, risk-limit, or external-commitment authority. |
| Netting set | Review-draft object implemented | Governance promotion signals can create shared review-only netting-set drafts tied to recommendation evidence. No legal, settlement, transfer, or booking authority. |
| Hedge recommendation | Review-draft object implemented | Governance promotion signals can create shared hedge-recommendation review drafts tied to the deterministic decision table. No order, execution, hedge-accounting designation, margin, or treasury authority. |
| Risk scenario | Review-draft object implemented | Governance promotion signals can create shared risk-scenario review drafts tied to approved review and recommendation evidence. No stress-limit, policy, trade, hedge, credit, or external-commitment authority. |
| Promotion outcome metrics | Implemented | Shared read-only metrics summarize promoted draft creation, source-evidence reuse, retirement, source-review rejection, booked-trade merge, and blocking missing-evidence outcomes. No promotion, approval, trade, hedge, policy, credit, or external-commitment authority. |

## Delivery Order

### Wave 0: Contract And Evidence Foundation

1. TRMVP-01 recommendation output contract - implemented
2. TRMVP-02 source freshness and evidence normalization - implemented

### Wave 1: First Trader/Risk Slice

3. TRMVP-03 opportunity, arbitrage, and residual exposure triage - implemented
4. TRMVP-04 pre-trade scenario enrichment - implemented
5. TRMVP-05 pre-trade workspace integration - implemented

### Wave 2: Netting And Hedge Depth

6. TRMVP-06 long/short netting draft rules - implemented
7. TRMVP-07 hedge instrument decision table - implemented
8. TRMVP-08 risk workspace integration - implemented

### Wave 3: Agent And Regression Coverage

9. TRMVP-09 trader/risk assistant evals - implemented
10. TRMVP-10 browser smoke for review-to-capture handoff - implemented

### Wave 4: Reviewer-Reuse Promotion Signals

11. TRMVP-11 pre-trade governance promotion signals - implemented
12. TRMVP-12 pre-trade netting-set review drafts - implemented
13. TRMVP-13 pre-trade hedge-recommendation review drafts - implemented
14. TRMVP-14 pre-trade risk-scenario review drafts - implemented
15. TRMVP-15 pre-trade market-opportunity review drafts - implemented

### Wave 5: Outcome Measurement

16. TRMVP-16 promoted-draft review-outcome metrics - implemented

## Shared Definition Of Done

Each work package is done only when:

- recommendation outputs cite source records or source snapshots
- stale, missing, and degraded data are visible to the reviewer
- matching agent-facing tool or payload implications are documented
- deterministic rule results are covered by focused tests
- assistant behavior changes include assistant eval coverage
- trade capture remains a human action
- hedge execution remains out of scope
- every handoff into Trade Capture preserves review context and manual fallback
- docs are updated when contracts, rules, or authority boundaries change

## TRMVP-01: Recommendation Output Contract

Status: implemented.

### Priority

P0

### Size

M

### Outcome

Pre-trade recommendation results can carry opportunity, residual exposure,
netting, and hedge-draft details without collapsing them into freeform text.

### Scope

- extend the recommendation result contract with optional structured sections:
  - `opportunity_summary`
  - `residual_exposure`
  - `netting_candidates`
  - `hedge_recommendation`
  - `rejected_alternatives`
  - `missing_evidence`
- keep the fields optional so existing recommendation runs remain compatible
- make each section source-aware and reviewer-friendly
- design the section shape so assistant tools can return the same data without
  prompt-only parsing
- update frontend types and rendering for the new fields

### Out Of Scope

- creating a full risk factor model
- persisting market opportunities as separate records
- adding hedge execution or order workflow

### Acceptance Criteria

- existing pre-trade recommendation runs still serialize and render
- a new recommendation can show residual exposure and reviewer focus as
  structured data
- the same recommendation payload can be consumed by the UI and assistant tools
- missing evidence is visible without requiring the reviewer to read the raw
  assistant prompt or chat history
- contract changes are covered by backend and frontend type/test updates

### Verification

- focused API tests for schema compatibility and new optional fields
- focused web tests for rendering the new recommendation sections

## TRMVP-02: Source Freshness And Evidence Normalization

Status: implemented.

### Priority

P0

### Size

M

### Outcome

Opportunity and hedge recommendations share one freshness and provenance model
across positions, marks, market context, weather, credit, and option exposure.

### Scope

- extend pre-trade source adapters where needed for:
  - positions
  - option exposures
  - latest official or indicative marks
  - volatility or option-sensitive inputs when available
  - weather and market context
- normalize source status into `OK`, `STALE`, `DEGRADED`, or `MISSING`
- define freshness service-level agreements per source family
- include source snapshots on recommendation runs
- define which normalized source fields should be exposed through assistant
  read tools

### Out Of Scope

- new market-data vendor integration
- volatility surface ingestion if the source is not yet available
- official books-and-records valuation

### Acceptance Criteria

- every recommendation run lists the source adapters it used
- source status is available to humans in the UI and to agents through typed
  tool output
- stale or missing required evidence forces `WAIT_FOR_DATA` or `ESCALATE`
- optional evidence can improve confidence without blocking all analysis
- source freshness appears in both API output and the pre-trade UI

### Verification

- service tests for stale, missing, degraded, and healthy source inputs
- web tests for freshness labels and missing-evidence display

## TRMVP-03: Opportunity, Arbitrage, And Residual Exposure Triage

Status: implemented.

### Priority

P0

### Size

M

### Outcome

The system can draft a first trader/risk triage result that explains why a
scenario or simple arbitrage candidate may be interesting and what residual
exposure remains.

### Scope

- add deterministic triage rules for:
  - target price versus latest mark gap
  - product or quality spreads net of conversion price
  - calendar or time spreads net of storage price
  - geographic spreads net of transportation price
  - current net position impact
  - related active trade count
  - weather or market freshness watch conditions
  - credit readiness
- model simple buy and sell states plus typed transformation edges for the
  narrow MVP commodity set
- use ask prices when buying and bid prices when selling whenever executable
  quotes are available
- calculate whether the draft direction appears to reduce or deepen current
  exposure
- emit a reviewer-facing opportunity category such as:
  - `MARK_GAP`
  - `ARBITRAGE`
  - `EXPOSURE_OFFSET`
  - `RISK_REDUCTION`
  - `WAIT_FOR_DATA`
- explain the top drivers and missing evidence

### Out Of Scope

- statistical alpha ranking
- execution routing
- automated watchlist persistence
- advanced optimization beyond first-pass cheapest-path search

### Acceptance Criteria

- a BUY or SELL draft can explain whether it offsets or deepens current
  exposure
- a simple product, time, or geographic arbitrage candidate can show gross
  spread, bridge cost, and net opportunity in deterministic fields
- a material target-versus-mark gap is shown as an opportunity driver
- missing mark, position, or credit evidence downgrades the recommendation
- output is deterministic for the same inputs

### Verification

- focused service tests for offsetting, deepening, missing mark, stale source,
  and credit-block scenarios
- focused service tests for conversion-cost, storage-cost, transport-cost, and
  unsupported-mapping scenarios

## TRMVP-04: Pre-Trade Scenario Enrichment

### Priority

P0

### Size

M

### Outcome

Saved pre-trade scenarios can preserve enough trader/risk rationale to avoid
manual re-entry when the user moves from analysis to review and capture.

### Scope

- add optional draft metadata for:
  - opportunity category
  - hedge intent
  - residual exposure summary
  - source freshness summary
  - reviewer focus
- preserve compatibility with existing personal saved scenarios
- carry recommendation run references into review items
- include the enriched context in the Trade Capture workflow note

### Out Of Scope

- making scenarios shared by default
- automatic trade capture
- creating hedge orders

### Acceptance Criteria

- existing scenarios continue to load
- enriched scenarios can be saved, reopened, and converted to review items
- Trade Capture handoff shows where the draft came from and what needs review
- human users can edit or ignore the recommendation context

### Verification

- focused API tests for create/update compatibility
- web tests for save, reopen, and handoff behavior

### Implementation Status

Implemented. Saved scenarios and shared review items now accept optional
typed enrichment for opportunity category, hedge intent, residual exposure,
source freshness, reviewer focus, and recommendation run reference fields.
Review creation derives enrichment from an attached recommendation run when
available, falls back to source scenario enrichment otherwise, and the approved
review-to-Trade-Capture workflow note includes the enriched context.

## TRMVP-05: Pre-Trade Workspace Integration

Status: implemented.

### Priority

P0

### Size

M

### Outcome

The Pre-Trade workspace surfaces opportunity, exposure, freshness, and hedge
draft context in a compact review flow.

### Scope

- add a recommendation panel section for opportunity and residual exposure
- add source freshness and missing-evidence states near the recommendation
- add a clear path to save as scenario or submit as review item
- keep old manual scenario editing available
- ensure mobile layout remains usable

### Out Of Scope

- large visual redesign
- replacing the Risk workspace
- live order or hedge workflow

### Acceptance Criteria

- a user can understand the recommended stance without opening raw source JSON
- stale or missing evidence is visible before the handoff
- the user can move from recommendation to review item to Trade Capture
- manual scenario entry remains possible when recommendation data is unavailable

### Verification

- focused web tests for recommendation rendering and review-item creation
- browser smoke candidate for recommendation-to-capture handoff

### Implementation Status

Implemented. The Pre-Trade recommendation panel now builds a compact
workspace brief from deterministic recommendation analysis, with stance,
opportunity, residual exposure, source freshness, missing evidence, hedge
draft, reviewer focus, and save/review/capture actions visible together.
Manual scenario entry remains available when recommendation analysis is
missing, and the readiness panel uses responsive grid and action-row styling
so the handoff path stays usable on narrow screens.

## TRMVP-06: Long/Short Netting Draft Rules

Status: implemented.

### Priority

P1

### Size

M

### Outcome

The platform can draft simple netting sets that explain which positions or
trade groups appear offsettable and what residual remains.

### Scope

- define first-pass matching criteria:
  - commodity
  - book or allowed book group
  - unit
  - location when available
  - delivery or tenor overlap when available
  - price index or basis compatibility when available
- compute gross exposure, offset quantity, and residual exposure
- emit mismatch reasons for candidates that cannot net
- keep the output as analysis only

### Out Of Scope

- legal netting agreements
- settlement netting
- cross-commodity spread models
- automated position transfer or book flattening trades

### Acceptance Criteria

- exact commodity/unit/book matches can produce a proposed netting set
- mismatched units, locations, or tenors produce explicit rejection reasons
- residual exposure is visible after proposed offsets
- no business records are mutated by netting analysis

### Verification

- service tests for exact match, partial offset, unit mismatch, location
  mismatch, and no-match cases

### Implementation Status

Implemented. Pre-trade recommendations now emit deterministic
`netting_candidates` with gross exposure, offset quantity, residual exposure,
legacy matched/residual quantities, source refs, matching constraints, and
explicit rejection reasons. The first-pass rule accepts opposing long/short
drafts when commodity, book or allowed book group, unit, location, delivery
window, price index, and pricing type evidence are compatible. It rejects
same-side drafts, missing open positions, and available mismatch evidence
without mutating positions, trades, reviews, or scenarios.

## TRMVP-07: Hedge Instrument Decision Table

Status: implemented.

### Priority

P1

### Size

L

### Outcome

The system can draft a hedge recommendation that explains when futures,
options, swaps, physical offsets, or no hedge should be reviewed.

### Scope

- define an explicit decision table using:
  - residual delta
  - optionality
  - basis risk
  - tenor
  - liquidity availability
  - volatility data freshness
  - credit and settlement constraints
- return recommended instrument type plus rejected alternatives
- include stop conditions for missing policy, stale curves, unsupported
  instruments, or unclear hedge-accounting implications

### Out Of Scope

- pricing options or swaps beyond available deterministic inputs
- hedge execution
- hedge accounting designation
- margin or treasury optimization beyond explanatory fields

### Acceptance Criteria

- a simple linear residual can produce a futures or swap review suggestion
- option-sensitive exposure can recommend review of optional hedges only when
  option evidence is fresh enough
- unsupported or stale cases return `WAIT_FOR_DATA` or `ESCALATE`
- rejected alternatives are visible with reasons

### Verification

- service tests for futures, swaps, options, physical offset, no hedge, stale
  volatility, and missing policy cases
- assistant evals to ensure agents do not claim they executed or guaranteed a
  hedge

### Implementation Status

Implemented. Pre-trade recommendations now draft hedge-review instruments from
an explicit deterministic decision table over residual delta, optionality,
basis risk, tenor, liquidity availability, volatility evidence freshness,
credit constraints, settlement constraints, hedge policy, curve freshness, and
hedge-accounting clarity. The service emits a recommended instrument type,
decision key, decision factors, policy stops, source refs, and rejected
alternatives. Physical-offset recommendations reuse the typed netting result;
option recommendations require fresh option/volatility evidence; linear
residuals route to futures or swaps when policy and curve evidence allow; flat,
stale, unsupported, or blocked cases return `NO_HEDGE`, `WAIT_FOR_DATA`, or
`ESCALATE` without execution authority.

## TRMVP-08: Risk Workspace Integration

Status: implemented.

### Priority

P1

### Size

M

### Outcome

Risk users can review residual exposure, netting drafts, and hedge drafts from
the risk-oriented workspace without starting in Trade Capture.

### Scope

- add a read-only risk triage panel or tab
- link triage output to pre-trade scenarios or review items
- expose source freshness and missing-evidence labels
- preserve existing exposure and option exposure views

### Out Of Scope

- replacing reports
- adding order management
- changing official P&L methodology

### Acceptance Criteria

- Risk users can start from exposure and create a reviewable pre-trade scenario
- risk triage output links back to source positions and marks
- stale evidence is visible before a scenario is promoted
- the existing Risk workspace behavior is preserved

### Verification

- focused web tests for risk triage rendering and pre-trade handoff

### Implementation Status

Implemented. The Risk workspace now includes a Pre-Trade Risk Triage tile that
derives review-only offset candidates from live linear positions, related
active trades, and latest price-index marks. Each candidate keeps source
position, source trade, mark freshness, draft side, target volume, and manual
review guardrails visible before staging. Creating a review from Risk writes
through the existing typed Pre-Trade scenario, recommendation-run, and review
item APIs, enriches the review from the deterministic recommendation run, and
keeps trade capture and hedge execution out of scope.

## TRMVP-09: Trader/Risk Assistant Evals

Status: implemented.

### Priority

P1

### Size

M

### Outcome

Assistant behavior around trader/risk recommendations is release-gated so the
agent does not over-claim authority or certainty.

### Scope

- add eval cases for:
  - opportunity explanation with fresh evidence
  - stale mark or missing source fallback
  - netting explanation without mutation
  - hedge recommendation draft without execution
  - explicit refusal to book or execute a hedge
- cover the expected tool payload fields for opportunity, residual exposure,
  netting, hedge recommendation, missing evidence, and policy stops
- pin allowed tools for any trader/risk agent profile involved
- verify generated responses cite available source context or clearly state
  what is missing

### Out Of Scope

- live market-data benchmark evaluation
- agent-side trade execution
- tool access to unapproved external systems

### Acceptance Criteria

- `make api-assistant-evals` covers the new authority boundary
- the assistant can draft analysis but does not claim to execute trades or
  hedges
- stale or missing source data produces uncertainty language and no false
  precision

### Verification

- `make api-assistant-evals`

### Implementation Status

Implemented. The assistant eval harness now verifies pre-trade recommendation
tool previews and the structured payload fields handed back to the model
runtime. Trader/risk eval cases cover fresh opportunity explanation, missing
source fallback with policy stops, netting explanation without mutation, hedge
recommendation drafting without execution, and direct refusal to book or
execute a hedge. The Market Research, Pre-Trade Structuring, and Risk Sentinel
role coverage labels now include the trader/risk recommendation authority
boundary.

## TRMVP-10: Browser Smoke For Review-To-Capture Handoff

Status: implemented.

### Priority

P1

### Size

M

### Outcome

The cross-workspace path from recommendation to review item to Trade Capture is
protected by browser smoke coverage.

### Scope

- seed or mock enough data for a deterministic pre-trade recommendation
- open Pre-Trade
- view recommendation and source freshness
- create or open a review item
- hand off to Trade Capture
- confirm the draft fields and workflow note are present

### Out Of Scope

- booking a live trade in smoke coverage unless the existing trade-capture
  smoke path already owns that
- visual regression snapshots for every panel state

### Acceptance Criteria

- browser smoke fails if the handoff loses scenario context
- mobile or narrow viewport still exposes the primary review action
- the test does not require a live external market-data call

### Verification

- `make web-smoke-test`

### Implementation Status

Implemented. The browser smoke harness now seeds deterministic pre-trade
analysis, recommendation-run, review, governance, drift-check, and workflow-note
API behavior. Smoke coverage opens Pre-Trade, reviews stale source evidence,
submits and approves a review item, opens the approved review in Trade Capture,
books the ticket, and asserts the confirmation workflow note preserves the
approved review context. A narrow-viewport smoke check verifies the primary
`Submit For Review` action remains visible near the recommendation brief.

## TRMVP-11: Pre-Trade Governance Promotion Signals

Status: implemented.

### Priority

P1

### Size

M

### Outcome

Governance can show whether repeated human review behavior is creating enough
evidence to promote a draft netting set, hedge recommendation, or Risk triage
candidate into a durable work object.

### Scope

- add read-only promotion candidates to the pre-trade governance summary,
  items payload, and audit export
- derive candidates deterministically from visible review reuse, approved or
  booked reviews, linked recommendation runs, override decisions, supported
  netting matches, hedge decision-table output, and Risk workspace triage notes
- preserve stop reasons when promotion evidence is incomplete, overridden, or
  only partially supported
- surface promotion signals in the Pre-Trade governance tile without creating
  netting sets, hedge orders, risk scenarios, or trade mutations

### Out Of Scope

- durable netting-set records
- durable hedge-recommendation workflow objects
- first-class risk scenario records
- hedge execution, booking automation, or policy override automation

### Acceptance Criteria

- governance summary exposes promotion-signal counts and top candidate type
- governance items expose candidate type, status, score, evidence counts,
  latest review/run ids, rationale, stop reasons, and sample ids
- audit export includes promotion-candidate rows for reviewability
- Pre-Trade users can drill into promotion signals separately from review
  queues and stale evidence

### Verification

- `./.venv/bin/python -m unittest apps.api.tests.test_pretrade_api`
- focused web type/build checks when the workspace contract changes

### Implementation Status

Implemented. The governance service now emits read-only promotion candidates
for netting sets, hedge recommendations, Risk scenarios, and market
opportunities. Candidates remain review-only signals: rejected reviews do not
count, overrides hold candidates in watch status, partial netting evidence
preserves stop reasons, market-opportunity signals are limited to supported
mark-gap or arbitrage recommendation evidence, and no business records are
created by the signal.

## TRMVP-12: Pre-Trade Netting-Set Review Drafts

Status: implemented.

### Priority

P1

### Size

M

### Outcome

The strongest reviewer-approved netting-set promotion signal can be promoted
into a durable, shared, review-only netting-set draft with source evidence and
stop reasons preserved.

### Scope

- add a typed backend service for pre-trade netting-set review drafts
- create drafts only from a current `NETTING_SET` governance promotion signal
  with a linked recommendation run and supported `EXACT` or `PARTIAL` netting
  candidates
- persist the source promotion score, evidence counts, latest ids, sample ids,
  rationale, stop reasons, scenario draft, and netting candidates
- keep creation idempotent for the same latest review/run source evidence
- expose list and promote-from-governance API endpoints
- surface existing drafts in the Pre-Trade governance promotion drill-through

### Out Of Scope

- legal netting agreement decisions
- settlement netting
- position transfers, book-flattening trades, trade amendments, or trade
  booking
- hedge execution or hedge-order workflow
- automatic approval of review items or policy overrides

### Acceptance Criteria

- `GET /pretrade/netting-sets` lists shared review drafts
- `POST /pretrade/netting-sets/from-promotion` creates or returns the review
  draft for the current netting-set promotion signal
- unsupported or missing promotion evidence returns a reviewable error instead
  of creating a weak draft
- the Pre-Trade workspace shows netting-set drafts alongside promotion signals
- agents and UI copy preserve the boundary between review-draft netting and
  legal, settlement, or execution authority

### Verification

- `./.venv/bin/python -m unittest apps.api.tests.test_pretrade_api`
- `npm --prefix apps/web run test -- preTradeApi.test.ts`
- `npm --prefix apps/web run build`
- `npm --prefix apps/web run lint`

### Implementation Status

Implemented. A governance `NETTING_SET` promotion signal can now create a
shared `REVIEW_DRAFT` netting-set work object that preserves the linked
recommendation run, latest review id, source score, source evidence summary,
rationale, stop reasons, scenario draft, and supported netting candidates. The
promotion path is idempotent for the same latest run/review evidence, visible
in the Pre-Trade governance tile, and remains review-only with no trade,
position, hedge, legal-netting, or settlement-netting mutation authority.

## TRMVP-13: Pre-Trade Hedge-Recommendation Review Drafts

Status: implemented.

### Priority

P1

### Size

M

### Outcome

The strongest reviewer-approved hedge-recommendation promotion signal can be
promoted into a durable, shared, review-only hedge workflow draft with source
evidence, policy stops, and rejected alternatives preserved.

### Scope

- add a typed backend service for pre-trade hedge-recommendation review drafts
- create drafts only from a current `HEDGE_RECOMMENDATION` governance
  promotion signal with a linked recommendation run and a supported hedge
  instrument recommendation
- persist the source promotion score, evidence counts, latest ids, sample ids,
  rationale, stop reasons, recommendation stance/score/headline, scenario
  draft, residual exposure, hedge recommendation, rejected alternatives, and
  missing evidence
- keep creation idempotent for the same latest review/run source evidence
- expose list and promote-from-governance API endpoints
- surface existing drafts in the Pre-Trade governance promotion drill-through

### Out Of Scope

- hedge execution, order routing, or broker/venue communication
- hedge-accounting designation
- margin, treasury, collateral, or liquidity optimization
- credit approval, settlement approval, policy override, or limit changes
- trade booking, trade amendment, or automatic approval of pre-trade reviews

### Acceptance Criteria

- `GET /pretrade/hedge-recommendations` lists shared review drafts
- `POST /pretrade/hedge-recommendations/from-promotion` creates or returns the
  review draft for the current hedge-recommendation promotion signal
- unsupported or missing hedge recommendation evidence returns a reviewable
  error instead of creating a weak draft
- the Pre-Trade workspace shows hedge-recommendation drafts alongside promotion
  signals
- agents and UI copy preserve the boundary between review-draft hedge
  recommendations and execution, accounting, credit, settlement, or policy
  authority

### Verification

- `./.venv/bin/python -m unittest apps.api.tests.test_pretrade_api`
- `npm --prefix apps/web run test -- preTradeApi.test.ts`
- `npm --prefix apps/web run build`
- `npm --prefix apps/web run lint`
- `npm --prefix apps/web run test:smoke -- --grep "pre-trade smoke"`

### Implementation Status

Implemented. A governance `HEDGE_RECOMMENDATION` promotion signal can now
create a shared `REVIEW_DRAFT` hedge-recommendation work object that preserves
the linked recommendation run, latest review id, source score, source evidence
summary, rationale, stop reasons, deterministic hedge recommendation,
residual exposure, rejected alternatives, and missing evidence. The promotion
path is idempotent for the same latest run/review evidence, visible in the
Pre-Trade governance tile, and remains review-only with no hedge execution,
trade mutation, hedge-accounting, margin, treasury, credit, settlement, or
policy-change authority.

## TRMVP-14: Pre-Trade Risk-Scenario Review Drafts

Status: implemented.

### Priority

P1

### Size

M

### Outcome

The strongest reviewer-approved Risk triage promotion signal can be promoted
into a durable, shared, review-only risk-scenario draft with review provenance,
recommendation evidence, residual exposure, missing evidence, and reviewer
focus preserved.

### Scope

- add a typed backend service for pre-trade risk-scenario review drafts
- create drafts only from a current `RISK_SCENARIO` governance promotion signal
  with a linked pre-trade review
- carry linked recommendation-run evidence when the review or promotion signal
  has a visible run
- persist the source promotion score, evidence counts, latest ids, sample ids,
  rationale, stop reasons, source review status/thesis/notes/owner,
  recommendation stance/score/headline, scenario draft, enrichment, residual
  exposure, input snapshots, missing evidence, and reviewer focus
- keep creation idempotent for the same latest review/run source evidence
- expose list and promote-from-governance API endpoints
- surface existing risk-scenario drafts in the Pre-Trade governance promotion
  drill-through

### Out Of Scope

- stress-limit, VaR, or official risk methodology changes
- policy override, limit approval, credit approval, or exposure-limit mutation
- hedge execution, hedge-order workflow, or hedge-accounting designation
- trade booking, trade amendment, or automatic approval of pre-trade reviews
- external counterparty, broker, venue, logistics, or payment commitments

### Acceptance Criteria

- `GET /pretrade/risk-scenarios` lists shared review drafts
- `POST /pretrade/risk-scenarios/from-promotion` creates or returns the review
  draft for the current Risk scenario promotion signal
- missing review evidence returns a reviewable error instead of creating a weak
  draft
- the Pre-Trade workspace shows risk-scenario drafts alongside promotion
  signals and existing netting/hedge drafts
- agents and UI copy preserve the boundary between review-draft Risk scenarios
  and official risk, policy, credit, hedge, trade, or external-commitment
  authority

### Verification

- `./.venv/bin/python -m unittest apps.api.tests.test_pretrade_api`
- `npm --prefix apps/web run test -- preTradeApi.test.ts`
- `npm --prefix apps/web run build`
- `npm --prefix apps/web run lint`
- `npm --prefix apps/web run test:smoke -- --grep "pre-trade smoke"`

### Implementation Status

Implemented. A governance `RISK_SCENARIO` promotion signal can now create a
shared `REVIEW_DRAFT` risk-scenario work object that preserves the linked
review, optional linked recommendation run, source score, source evidence
summary, rationale, stop reasons, review status/thesis/notes/owner,
recommendation stance/score/headline, scenario draft, enrichment, residual
exposure, input snapshots, missing evidence, and reviewer focus. The promotion
path is idempotent for the same latest run/review evidence, visible in the
Pre-Trade governance tile, and remains review-only with no trade, hedge,
stress-limit, policy, credit, settlement, or external-commitment authority.

## TRMVP-15: Pre-Trade Market-Opportunity Review Drafts

Status: implemented.

### Priority

P1

### Size

M

### Outcome

The strongest reviewer-approved market-opportunity promotion signal can be
promoted into a durable, shared, review-only market-opportunity draft with
review provenance, recommendation evidence, opportunity summary, optional
arbitrage economics, residual exposure, missing evidence, and reviewer focus
preserved.

### Scope

- add a typed backend service for pre-trade market-opportunity review drafts
- create drafts only from a current `MARKET_OPPORTUNITY` governance promotion
  signal with a linked pre-trade review, linked recommendation run, and
  supported `MARK_GAP` or `ARBITRAGE` opportunity category
- carry linked recommendation-run evidence, including opportunity summary,
  optional arbitrage candidate, residual exposure, input snapshots, missing
  evidence, next actions, and reviewer focus
- persist the source promotion score, evidence counts, latest ids, sample ids,
  rationale, stop reasons, source review status/thesis/notes/owner, and
  recommendation stance/score/headline
- keep creation idempotent for the same latest review/run source evidence
- expose list and promote-from-governance API endpoints
- surface existing market-opportunity drafts in the Pre-Trade governance
  promotion drill-through

### Out Of Scope

- trade booking, trade amendment, automatic review approval, or offer acceptance
- order routing, broker/venue communication, external counterparty outreach, or
  logistics/payment commitment
- official price marks, valuation methodology, or pricing policy changes
- stress-limit, exposure-limit, credit, compliance, or policy override changes
- hedge execution, hedge-accounting designation, margin, treasury, collateral,
  settlement, or position-transfer workflow

### Acceptance Criteria

- `GET /pretrade/market-opportunities` lists shared review drafts
- `POST /pretrade/market-opportunities/from-promotion` creates or returns the
  review draft for the current market-opportunity promotion signal
- unsupported opportunity categories or missing review/run evidence return a
  reviewable error instead of creating a weak draft
- the Pre-Trade workspace shows market-opportunity drafts alongside promotion
  signals and existing netting, hedge, and risk-scenario drafts
- agents and UI copy preserve the boundary between review-draft market
  opportunities and trade, price-mark, order, credit, risk-limit, hedge,
  settlement, or external-commitment authority

### Verification

- `./.venv/bin/python -m unittest apps.api.tests.test_pretrade_api`
- `npm --prefix apps/web run test -- preTradeApi.test.ts`
- `npm --prefix apps/web run build`
- `npm --prefix apps/web run lint`
- `npm --prefix apps/web run test:smoke -- --grep "pre-trade smoke"`

### Implementation Status

Implemented. A governance `MARKET_OPPORTUNITY` promotion signal can now create
a shared `REVIEW_DRAFT` market-opportunity work object that preserves the
linked review, linked recommendation run, source score, source evidence
summary, rationale, stop reasons, review status/thesis/notes/owner,
recommendation stance/score/headline, recommendation draft, opportunity
summary, optional arbitrage candidate, residual exposure, input snapshots,
missing evidence, next actions, and reviewer focus. The promotion path is
idempotent for the same latest run/review evidence, visible in the Pre-Trade
governance tile, and remains review-only with no trade, price-mark, order,
execution, hedge, risk-limit, credit, settlement, or external-commitment
authority.

## TRMVP-16: Promoted-Draft Review-Outcome Metrics

Status: implemented.

### Priority

P1

### Size

S

### Outcome

Promoted netting-set, hedge-recommendation, risk-scenario, and
market-opportunity review drafts now have read-only outcome metrics that show
whether drafts were created, reused by source evidence, retired, rejected by
the source review, merged into a booked trade, or still blocked by missing
evidence.

### Scope

- add a typed backend service that reads all shared promoted draft records
- derive outcome buckets from persisted draft payloads plus live linked
  pre-trade review and trade status where available
- expose aggregate counts, per-draft-type counts, and per-draft evidence rows
  through `GET /pretrade/promotion-outcomes`
- surface the outcome metrics and latest promoted draft rows in the Pre-Trade
  governance tile
- keep outcome metrics read-only and suitable for future agent/autonomy
  promotion analysis

### Out Of Scope

- changing draft status, approving reviews, or retiring drafts automatically
- creating action requests from outcome metrics
- trade booking, trade amendment, hedge execution, price-mark changes, credit
  approval, policy changes, settlement workflow, or external commitments
- using outcome metrics as sufficient proof for autonomous execution without a
  separate owner-approved threshold policy

### Acceptance Criteria

- `GET /pretrade/promotion-outcomes` requires authentication and returns all
  six outcome buckets
- counts are split by promoted draft type and backed by per-draft evidence rows
- booked linked reviews appear as booked-trade merge outcomes with linked trade
  status when the trade is visible
- rejected source reviews, retired draft payloads, repeated source evidence,
  and blocking missing evidence are counted separately
- the Pre-Trade workspace shows the metrics without creating any new business
  mutation path

### Verification

- `./.venv/bin/python -m unittest apps.api.tests.test_pretrade_api`
- `npm --prefix apps/web run test -- preTradeApi.test.ts`
- `npm --prefix apps/web run build`
- targeted frontend ESLint for touched Pre-Trade files
- `npm --prefix apps/web run test:smoke -- --grep "pre-trade smoke"`

### Implementation Status

Implemented. The reports domain now builds a shared promoted-draft outcome
summary across netting-set, hedge-recommendation, risk-scenario, and
market-opportunity review drafts. The summary is deterministic, read-only, and
derives its buckets from persisted promotion evidence plus live linked
pre-trade review/trade state. The Pre-Trade governance tile renders the
aggregate counts, per-object counts, and latest draft rows while preserving the
existing boundary: metrics inform humans and future policy design, but they do
not approve reviews, retire drafts, book trades, execute hedges, change price
marks, change credit/risk policy, or externally commit the firm.

## Recommended First Implementation Slice

The TRMVP-01 through TRMVP-16 sequence is now implemented as the evidence,
triage, rationale handoff, workspace-review, deterministic netting,
deterministic hedge-draft, Risk workspace exposure triage, assistant-eval, and
regression-smoke foundation plus reviewer-reuse promotion signals and the first
durable netting-set, hedge-recommendation, risk-scenario, and
market-opportunity review drafts, with promoted-draft outcome metrics for
trader/risk decision support.

Next recommended work should turn those outcomes into explicit lifecycle and
promotion policy, still before adding higher-authority workflows:

1. Add manual promoted-draft lifecycle controls for owner notes, retire
   reasons, and stale/reopened review handling.
2. Define owner-approved promotion thresholds that use outcome metrics:
   minimum reuse, maximum rejection/correction rate, no blocking evidence, and
   documented rollback/correction paths.
3. Only deepen hedge-accounting, margin, treasury, or execution workflows after
   owner-approved policies and source contracts exist.
