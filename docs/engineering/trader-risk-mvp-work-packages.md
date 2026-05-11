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
| Market opportunity | Planned | Start as recommendation output; promote to first-class object only if humans reuse it. |
| Netting set | Planned | Start as deterministic draft output tied to positions and trade legs. |
| Hedge recommendation | Planned | Start as draft output with rejected alternatives and stop conditions. |
| Risk scenario | Planned | Later stress/scenario object once hedge and netting rules stabilize. |

## Delivery Order

### Wave 0: Contract And Evidence Foundation

1. TRMVP-01 recommendation output contract
2. TRMVP-02 source freshness and evidence normalization

### Wave 1: First Trader/Risk Slice

3. TRMVP-03 opportunity, arbitrage, and residual exposure triage
4. TRMVP-04 pre-trade scenario enrichment
5. TRMVP-05 pre-trade workspace integration

### Wave 2: Netting And Hedge Depth

6. TRMVP-06 long/short netting draft rules
7. TRMVP-07 hedge instrument decision table
8. TRMVP-08 risk workspace integration

### Wave 3: Agent And Regression Coverage

9. TRMVP-09 trader/risk assistant evals
10. TRMVP-10 browser smoke for review-to-capture handoff

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

## TRMVP-05: Pre-Trade Workspace Integration

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

## TRMVP-06: Long/Short Netting Draft Rules

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

## TRMVP-07: Hedge Instrument Decision Table

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

## TRMVP-08: Risk Workspace Integration

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

## TRMVP-09: Trader/Risk Assistant Evals

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

## TRMVP-10: Browser Smoke For Review-To-Capture Handoff

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

## Recommended First Implementation Slice

Implement in this order:

1. TRMVP-01 and TRMVP-02 together, because the UI and assistant should not grow
   new recommendation language before the evidence contract exists.
2. TRMVP-03 as a backend-first deterministic service with focused tests.
3. TRMVP-05 as the first user-visible slice in Pre-Trade.
4. TRMVP-09 before any assistant role starts producing hedge or netting drafts.

This sequence gives traders and risk managers visible value while keeping the
system inside read, explain, and draft authority.
