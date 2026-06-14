# Arbitrage Detection Design

## Purpose

This document captures the first design for a trader-facing arbitrage detection
app inside ECTRM. The goal is to identify reviewable arbitrage opportunities
without turning early implementation into an opaque optimization project or
granting any autonomous execution authority.

The first release should help a trader answer:

- Can I buy this product or quality at this place and time, transform it
  through known logistics, storage, financing, or conversion steps, and sell it
  elsewhere or later for a positive risk-adjusted margin?

Related docs:

- [Pre-Trade Design](./pre-trade-design.md)
- [Business Use Case Roadmap](./business-use-case-roadmap.md)
- [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)
- [Platform Blueprint](./platform-blueprint.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)

## Operating Principle

Treat every tradable market state as a normalized commodity state, and treat
every feasible economic or logistical move between states as a typed edge in a
transformation graph.

An arbitrage opportunity exists when:

- a trader can buy one state at an executable buy price
- reach another state through one or more feasible graph edges
- and sell that destination state at an executable sell price
- for a positive risk-adjusted margin after explicit costs and buffers

This means the system should not model product, time, and geographic
arbitrages as isolated features. Most valuable real-world opportunities combine
all three.

Example combined path:

- buy Product A in Houston for June
- transport to Rotterdam
- store until July
- convert or blend into Product B
- sell Product B in Rotterdam for July

## Core Abstraction

### Node: Commodity State

A node represents one tradable commodity state.

Example:

`WTI Crude | Cushing | June 2026 | USD/bbl | FOB`

Required fields:

- `product`
- `commodity_family`
- `grade`
- `quality_spec`
- `location`
- `delivery_start`
- `delivery_end`
- `unit`
- `currency`
- `contract_type`
- `incoterm`
- `source_system`

### Edge: Feasible Transformation

An edge represents a feasible transformation from one state to another.

Initial edge types:

- transport
- storage
- product conversion
- quality upgrade
- quality downgrade
- blending
- processing
- contract roll
- unit conversion
- currency conversion
- financing

Required edge attributes:

- `from_state_pattern`
- `to_state_pattern`
- `edge_type`
- `cost_formula`
- `fixed_cost`
- `variable_cost`
- `yield_factor`
- `time_delay_days`
- `capacity`
- `min_volume`
- `max_volume`
- `confidence_score`
- `constraints`

### Opportunity: Buy-Transform-Sell Path

An opportunity is a detected path through the graph where:

- the buy state is supported by a current executable quote
- the sell state is supported by a current executable quote
- the path satisfies required constraints
- the total economics remain positive after explicit costs and risk buffer

In ECTRM terms, the MVP should treat this as a structured recommendation or a
specialized `Market opportunity` shape before promoting it into a separate
durable object family.

## Arbitrage Families

The graph model supports all simple arbitrage families and their combinations.

### Product Or Quality Arbitrage

- Product A vs Product B
- Quality A vs Quality B
- conversion cost
- yield loss
- processing cost
- quality penalties or premiums

### Time Arbitrage

- Time A vs Time B
- storage cost
- financing cost
- insurance
- loss or shrinkage
- calendar spread economics

### Geographic Arbitrage

- Place A vs Place B
- transportation cost
- freight, trucking, rail, or pipeline cost
- terminal fees
- transit time
- duties, taxes, insurance, and demurrage risk

### Combined Opportunities

The engine should support multi-leg paths that combine:

- product or quality change
- time shift
- geographic move

The ranking and explanation layers should still show the component economics
separately so traders can see which part of the path creates or destroys edge.

## Pricing And Economics Rules

### Executable Price Discipline

For executable arbitrage math:

- use `ask_price` when buying
- use `bid_price` when selling

Do not use `last_price` as the default executable price. If bid or ask is
missing and the system falls back to `last_price`, the opportunity should
remain visible only with lower confidence and an explicit warning that the
economics are less reliable.

### Net Arbitrage Formula

Use this first-pass formula:

```text
Net Arb =
    Sell Bid Price at State B
  - Buy Ask Price at State A
  - Product or quality conversion cost
  - Storage cost
  - Transportation cost
  - Financing cost
  - Fees, taxes, losses, and slippage
  - Risk buffer
```

For edge paths with yield loss, apply the yield-adjusted economics
deterministically inside the transformation-cost layer rather than as prompt
prose.

### Required Cost Visibility

Every surfaced opportunity should preserve:

- gross spread
- itemized path costs
- total cost
- net margin
- risk buffer
- assumptions and missing evidence

The system should never show only a final score without the underlying
economics.

## Separation Of Concerns

Keep market observations separate from transformation logic.

### Market Observations

- bids
- asks
- last prices
- available volumes
- forward curves
- timestamps
- source identity
- source freshness
- source reliability

### Transformation Logic

- transport routes
- storage rules
- conversion rules
- blending rules
- quality adjustments
- cost formulas
- constraints
- financing assumptions

This separation is important for auditability. Market data changes frequently.
Transformation rules should evolve as governed deterministic logic, reference
data, or manually maintained assumptions.

## Domain Models

The first typed model set should look like this.

### `CommodityState`

- `id`
- `commodity_family`
- `product`
- `grade`
- `quality_spec`
- `location`
- `delivery_start`
- `delivery_end`
- `unit`
- `currency`
- `contract_type`
- `incoterm`
- `source_system`

### `MarketQuote`

- `id`
- `state_id`
- `bid_price`
- `ask_price`
- `last_price`
- `volume_available`
- `timestamp`
- `source`
- `confidence_score`
- `staleness_score`

### `TransformationEdge`

- `id`
- `from_state_pattern`
- `to_state_pattern`
- `edge_type`
- `cost_formula`
- `fixed_cost`
- `variable_cost`
- `yield_factor`
- `time_delay_days`
- `capacity`
- `min_volume`
- `max_volume`
- `confidence_score`
- `constraints`

### `ArbitrageOpportunity`

- `id`
- `buy_state_id`
- `sell_state_id`
- `path_edges`
- `buy_price`
- `sell_price`
- `gross_spread`
- `total_cost`
- `net_margin`
- `net_margin_percent`
- `estimated_pnl`
- `max_volume`
- `capital_required`
- `time_to_realize`
- `confidence_score`
- `risk_score`
- `status`
- `created_at`

## Application Layers

The app should be organized into explicit layers so the first MVP remains easy
to test and extend.

### 1. Data Collection

Collect:

- market prices and forward curves
- physical assessments
- broker quotes
- storage rates
- transport costs
- product and quality specs
- FX rates
- manually entered desk assumptions

### 2. Data Normalization

Normalize:

- product names
- quality specs
- locations
- currencies
- units
- delivery periods
- contract terms
- timestamps
- source reliability

### 3. Market State Store

Store normalized:

- commodity states
- quotes
- freshness metadata
- source metadata

### 4. Transformation Graph

Build a graph of feasible transformations from:

- storage edges
- transport edges
- product conversion edges
- blending edges
- financing edges
- contract and unit normalization edges

### 5. Arbitrage Engine

For each buyable state and sellable state:

- find the cheapest feasible path from State A to State B
- calculate total path cost
- apply yield, time, and capacity effects
- calculate net margin
- apply constraints and risk buffer
- rank the opportunity

### 6. Opportunity Surfacing

Show highest-value opportunities with:

- plain-English explanation
- cost breakdown
- path detail
- freshness and reliability warnings
- max executable volume
- risk notes and assumptions

## Clean Architecture Guidance

The first production version should live behind typed application services, not
inside ad hoc prompts or frontend-only business logic.

### Backend Domain Shape

Recommended backend package under `apps/api/app/domains`:

```text
arbitrage/
  models/
  routes/
  schemas/
  services/
    source_adapters.py
    normalization.py
    state_store.py
    edge_catalog.py
    graph_builder.py
    pathfinder.py
    economics.py
    ranking.py
    explainability.py
```

Recommended service responsibilities:

- `source_adapters.py`: collect quotes and assumptions from governed sources
- `normalization.py`: turn source rows into canonical states and quote records
- `state_store.py`: resolve and query normalized state and quote snapshots
- `edge_catalog.py`: store and evaluate typed transformation rules
- `graph_builder.py`: materialize the feasible state-transition graph
- `pathfinder.py`: run Dijkstra or equivalent cheapest-path search
- `economics.py`: calculate path cost, yield-adjusted output, and net margin
- `ranking.py`: compute risk-adjusted opportunity score
- `explainability.py`: generate reviewer-facing breakdown payloads

### Frontend Shape

Recommended frontend feature area under `apps/web/src/features` or
`apps/web/src/workspaces`:

```text
arbitrage/
  api/
  components/
  model/
  pages/
  utils/
```

The first UI cut can live inside Pre-Trade instead of launching a completely
separate surface. If trader usage proves durable, it can become its own
workspace later.

### Governance Rules

- keep transformation rules and economics in deterministic services
- keep writes behind typed application services
- preserve manual fallback for every recommended action
- let agents explain opportunities and draft scenarios, but not define the
  official economics

## First Algorithm Cut

Start with a simple, auditable graph search.

```text
For each quote with ask_price:
    let A = buy state
    let buy_price = ask_price

    For each quote with bid_price:
        let B = sell state
        let sell_price = bid_price

        Find cheapest feasible transformation path from A to B.

        If path exists:
            total_cost = sum(path edge costs)
            net_margin = sell_price - buy_price - total_cost

            If net_margin > threshold:
                create opportunity record
```

Recommended MVP choices:

- use Dijkstra or another shortest-path algorithm for cheapest path
- ignore complex capacity optimization at first
- support simple min and max volume checks where easy
- keep every rejected path reason inspectable

Do not start with:

- min-cost flow
- linear programming
- mixed-integer optimization
- Monte Carlo simulation
- automated execution

## Opportunity Ranking

Do not rank on raw margin alone.

The first ranking pass should incorporate:

- net margin per unit
- estimated total P&L
- available executable volume
- capital required
- time to realize
- confidence score
- risk score
- quote freshness
- source reliability
- number of legs
- operational complexity
- capacity certainty

Suggested initial score:

```text
Opportunity Score =
    expected P&L
  x confidence score
  x execution probability
  / capital required
  / risk score
```

The exact weighting should stay configurable and reviewable. The dashboard
should still display the raw economics beside the score.

## MVP Scope

Start narrow.

The first release should target:

- one commodity family
- a small number of products or grades
- a small number of locations
- monthly delivery periods
- manually entered transport costs
- manually entered storage costs
- manually entered conversion costs
- normalized market quotes
- basic graph search for cheapest path
- ranked opportunity dashboard

The first MVP should optimize for:

- correctness of economics
- transparency of assumptions
- ease of debugging
- speed of iteration

Not for:

- broad market coverage
- perfect real-time ingestion
- enterprise optimization
- autonomous workflow

## UI Expectations

### Dashboard

Show highest-ranked opportunities with filters for:

- commodity
- product
- location
- delivery period
- opportunity type
- minimum margin
- confidence level

### Opportunity Detail

Every opportunity detail surface should show:

- buy leg
- sell leg
- transformation path
- cost breakdown
- net margin
- estimated P&L
- max executable volume
- confidence score
- risk score
- source data
- assumptions
- warnings

Each opportunity should also be explainable in plain English.

Example explanation shape:

- Buy Product A in Houston for June delivery at `$100/unit`.
- Transport Houston to Rotterdam for `$3.25/unit`.
- Store June to July for `$1.10/unit`.
- Convert Product A to Product B for `$2.00/unit` at `98%` yield.
- Sell Product B in Rotterdam for July delivery at `$111/unit`.

Example economics:

- Gross spread: `$11.00/unit`
- Total cost: `$6.35/unit`
- Net margin: `$4.65/unit`
- Max volume: `50,000 units`
- Estimated P&L: `$232,500`

Example warning set:

- freight cost is estimated
- sell-side quote is `4` hours old
- conversion yield is assumed

## Recommended Phase Plan

### Phase 0: Contract And Manual Assumption Setup

- define canonical state, quote, and edge schemas
- define bid or ask fallback and staleness rules
- define manual assumption inputs for transport, storage, and conversion
- define the first normalized quote snapshot contract

### Phase 1: Narrow Arbitrage MVP

- ingest one commodity family
- normalize quotes into commodity states
- maintain a small edge catalog with manual costs
- run cheapest-path detection
- show ranked opportunities in a trader-facing dashboard

### Phase 2: Better Economics And Governance

- add richer cost formulas
- add more edge constraints and capacity checks
- add path-level audit and provenance
- add pre-trade scenario handoff from an opportunity

### Phase 3: Scale And Advanced Optimization

- add broader commodity coverage
- add richer quote ingestion
- add advanced optimization methods
- add alerts, scenario analysis, and deeper risk modeling

## Verification Expectations

When this design turns into implementation:

- add focused service tests for normalization, pathfinding, pricing rules,
  yield handling, and ranking behavior
- add stale-data and missing-bid-or-ask tests
- add web tests for dashboard filters, explanation rendering, and warning
  states
- add assistant evals if managed agents consume or explain arbitrage payloads

If the product later stages actions from these opportunities, those actions
must still flow through typed reviewable work objects and the existing action
governance model.
