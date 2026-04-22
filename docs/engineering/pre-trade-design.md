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

## Likely Next Steps

1. Add shared or team-visible scenario scope once governance expectations are clear.
2. Push the recommendation engine into an API/domain service once the rules stabilize.
3. Expand the scenario draft with optional fixed-price economics, delivery intent, and richer portfolio constraints.
4. Expand analysis with portfolio limits, historical volatility, optionality, and richer source weighting.

The trader/risk MVP delivery breakdown lives in
[Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md).
