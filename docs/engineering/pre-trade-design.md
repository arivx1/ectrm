# Pre-Trade Design

## Goal

Stand up a first-class pre-trade surface that does three things in one place:

1. accumulates internal and external context
2. analyzes that context in an explainable way
3. produces recommendations before the user opens the live trade ticket

## Phase 1 Shape

The first implementation is intentionally thin and deterministic.

- UI surface: `apps/web/src/workspaces/pretrade/PreTradeWorkspace.tsx`
- recommendation engine: `apps/web/src/workspaces/pretrade/preTradeRecommendations.ts`
- navigation entry: `pretrade` view in the shared workspace registry

This version now supports personal saved scenarios and a direct handoff into Trade Capture. It is still intentionally lightweight: a saved pre-trade scenario is a desk-authored thesis plus the minimum draft fields needed to resume analysis and prefill a booking ticket.

## Data Accumulation

### Internal sources

- live projected positions
- active trades
- counterparties
- counterparty credit profiles
- promoted external counterparty credit snapshots already stored in reference data

These come from the existing workspace bootstrap and keep the first version grounded in platform-owned data.

### External sources

- market context from `/market-data/context`
- latest price index observations from `/market-data/price-indices/observations/latest`
- weather context from `/weather/intelligence/overview`

The current design pulls external data live at workspace time so recommendations can reflect current marks and freshness status without waiting for a new backend aggregation layer.

## Analysis Model

Phase 1 uses explainable rules rather than opaque scoring.

- position impact: does the scenario offset or deepen current exposure?
- pricing context: is there a live mark or at least a suggested pricing reference?
- counterparty governance: is the selected counterparty tradable and within indicative limit policy?
- external freshness: are the upstream signals healthy enough to trust?
- weather sensitivity: should the desk treat the commodity as weather-driven right now?

The recommendation engine emits individual signals plus an overall stance:

- `PROCEED`
- `PROCEED_WITH_CARE`
- `ESCALATE`
- `WAIT_FOR_DATA`

## Why This Cut First

- It reuses existing backend contracts instead of inventing a large new domain too early.
- It gives the desk visible value immediately.
- It keeps recommendation logic inspectable and testable.
- It creates a stable seam for later backend orchestration.

## Current Persistence + Handoff

- Backend API: `/pretrade/scenarios`
- Persistence backing: shared preset storage with a dedicated `pretrade` key
- Scope: personal-only for now
- Handoff: the workspace applies the saved or in-memory scenario directly into the Trade Capture form before navigating to `trades`

## Future Extension: Arbitrage Identification

After the current scenario workflow stabilizes, pre-trade should add a
dedicated arbitrage-identification lane for traders. The first cut should stay
simple and explainable: detect candidate spreads, normalize the economics, and
surface the highest reviewable opportunities without booking anything.

The detailed design for that lane now lives in
[Arbitrage Detection Design](./arbitrage-detection-design.md).

### Simple Arbitrage Taxonomy

Phase 1 of this lane should treat every simple arbitrage candidate as one of
three base families, while still allowing combined graph paths across them:

- product or quality arbitrage: `Product A`, `Product B`, and conversion price
- time arbitrage: `Time A`, `Time B`, and storage price
- geographic arbitrage: `Place A`, `Place B`, and transportation price

Some real opportunities will combine more than one family, but the system
should still explain the component economics separately so the trader can see
what actually drives the edge.

### Data Collection

The arbitrage lane needs normalized source inputs for:

- market prices or marks for both sides of the comparison
- product and quality mappings, including approved conversion relationships
- tenor or delivery-window anchors for time spreads
- origin, destination, route, and logistics anchors for geographic spreads
- conversion, storage, transportation, tariff, and fee cost inputs
- units of measure, currencies, and FX normalization where required
- source freshness, provenance, and tradability flags

### Data Processing

The deterministic processing layer should:

- generate candidate product, time, and place comparisons from normalized
  market data
- represent tradable states as nodes and feasible transformations as typed
  graph edges
- reject unsupported mappings before any ranking is shown
- calculate gross spread, explicit cost stack, and resulting net opportunity
- preserve the bridge variable that explains the spread:
  conversion price, storage price, or transportation price
- use executable buy and sell prices where available:
  ask when buying and bid when selling
- attach missing-evidence, stale-source, and policy-stop labels instead of
  hiding gaps in a confidence score

### Surfacing Opportunities

The UI and any matching agent tools should surface opportunities as ranked,
reviewable drafts rather than freeform conclusions.

The first ranking pass should emphasize:

- net opportunity after explicit costs, not raw spread alone
- freshness and completeness of the source inputs
- relevance to the trader's current books, positions, and delivery posture
- a clear next action such as watch, create pre-trade scenario, escalate, or
  ignore

### Governance Boundary

Arbitrage economics and ranking should live in deterministic services once the
rules stabilize. Agents can explain the opportunity, summarize the evidence,
and draft a pre-trade scenario, but they should not become the source of truth
for conversion, storage, transportation, or ranked opportunity values.

## Likely Next Steps

1. Add shared or team-visible scenario scope once governance expectations are clear.
2. Push the recommendation engine into an API/domain service once the rules stabilize.
3. Expand the scenario draft with optional fixed-price economics, delivery intent, and richer portfolio constraints.
4. Expand analysis with portfolio limits, historical volatility, optionality, and richer source weighting.
5. Add simple arbitrage detection for product or quality, time, and geographic spreads with explicit cost-stack evidence and ranked pre-trade opportunity output.

The trader/risk MVP delivery breakdown lives in
[Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md).
