# Business Use Case Roadmap

## Purpose

This roadmap turns early persona stories into product capabilities, domain
objects, deterministic algorithms, supervised-agent work, and agent toolkit
requirements. It is meant to bridge business ambition and implementation
planning without weakening the platform's existing governance model.

Related docs:

- [Platform Blueprint](./platform-blueprint.md)
- [Pre-Trade Design](./pre-trade-design.md)
- [Trading Source Roadmap](./trading-source-roadmap.md)
- [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)
- [Accruals Functionality Redesign](./accruals-functionality-redesign.md)
- [Agent Role Catalog](./agent-role-catalog.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)

## Operating Principle

Treat these user stories as requirements for both human operators and AI
agents. Humans need usable workspaces, review paths, and manual fallback.
Agents need typed tools, durable work objects, source evidence, and explicit
authority limits.

Use agents to help people and other agents see, explain, compare, draft, and
stage work. Use deterministic services for prices, positions, fees, freight
costs, exposure, hedges, P&L, accruals, reconciliation, permissions, and any
business record mutation.

The practical rule is:

- agent output can propose a trading or operating action
- typed product objects carry the proposal, evidence, and review state
- deterministic services calculate the official values and policy checks
- humans approve external commitments and high-risk financial decisions

## Agent Toolkit Requirements

When a capability is implemented for a human workspace, design the matching
agent toolkit surface at the same time.

Minimum agent toolkit expectations:

- read tools expose the same governed records, filters, freshness labels, and
  provenance that the workspace uses
- recommendation tools return typed payloads instead of prose-only conclusions
- action-capable flows use published action request types with stale-state,
  idempotency, reviewer role, and expected-effect metadata
- tools distinguish missing data, stale data, unsupported requests, and policy
  stops in machine-readable fields
- assistant evals cover tool selection, no-overclaim behavior, and authority
  boundaries before a role depends on the tool

Do not add an agent-only shortcut when a human work object or service boundary
already exists. The goal is one governed platform surface that humans and
agents can both use with appropriate permissions.

## Persona Use Cases

### Trader

The trader needs the platform to answer:

- Where is there volatility or dislocation I can exploit?
- Which bilateral and exchange-traded opportunities are available?
- What are the full physical economics, including freight and extra fees?
- Which longs and shorts can be matched, netted, or offset?
- How can I flatten the book or improve risk-adjusted profit?
- What is my position, exposure, and P&L right now?

Target capabilities:

- market opportunity workbench
- pre-trade scenario structuring and handoff into trade capture
- freight, tariff, fee, and movement-cost stack
- long/short matching and book-flattening recommendations
- bilateral versus exchange execution comparison
- position, exposure, and P&L cockpit with source lineage

### Risk Manager

The risk manager needs the platform to answer:

- What is the true net exposure after offsets, optionality, and basis risk?
- Which delta should be hedged, and which exposure should remain open?
- Should the hedge use futures, options, swaps, or physical offsets?
- How do refineries, oil and gas production, processing facilities, power
  generation, factories, and consumption assets change forward exposure?
- Which forecast assumptions are stale or risky?

Target capabilities:

- exposure decomposition by book, commodity, location, tenor, asset, and risk
  factor
- hedge recommendation drafts with explicit instrument rationale
- asset-backed forward view that merges physical forecasts with market curves
- risk exception detection and escalation
- scenario and stress views for basis, volatility, weather, and asset output

### Operations Manager

The operations manager needs the platform to answer:

- Which checklist items, handoffs, and reconciliations can be automated?
- Which confirmations, deliveries, schedules, documents, or blockers need
  attention?
- Which workflow updates are safe to stage or eventually execute under policy?
- Where are the recurring breaks that should become deterministic controls?

Target capabilities:

- checklist and workflow templates by trade type, commodity, location, and
  delivery mode
- operations queue with deterministic due dates, blockers, and ownership rules
- document and confirmation follow-through with evidence and ambiguity handling
- reconciliation exception workbench
- supervised automation for low-risk internal workflow updates

### Accountant / Settlement User

The accounting user needs the platform to answer:

- Which invoices should be received, issued, confirmed, paid, disputed, or
  chased?
- Which payments are late, mismatched, overpaid, short-paid, or unreconciled?
- What should be accrued, relieved, billed, collected, or written off?
- Which issues can be detected autonomously before month end?

Target capabilities:

- invoice and payment automation under approval controls
- accrual lot and entry ledger tied to delivery actualization, invoicing, and
  cash application
- billed versus collected reconciliation
- accrual exception and aging reports
- autonomous issue detection that drafts or stages reviewable follow-up instead
  of silently changing financial records

## Capability Map

| Capability | Primary persona | Product owner domain | Durable work object | Deterministic core | Agent role |
| --- | --- | --- | --- | --- | --- |
| Market opportunity detection | Trader | Trading / Research | Market opportunity | signal freshness, source weighting, opportunity classification | Market Research Agent |
| Pre-trade structuring | Trader | Trading | Pre-trade scenario, pre-trade review item | scenario validation, credit checks, reference-data checks | Pre-Trade Structuring Agent |
| Freight and fee economics | Trader, Accountant | Trading / Settlement | Movement cost estimate, fee item | cost stack, tariff rules, fee accrual rules | Fee and Accrual Agent |
| Long/short matching | Trader, Risk Manager | Trading / Risk | Netting set | position matching, constraints, optimization objective | Risk Sentinel |
| Book flattening | Trader, Risk Manager | Risk | Hedge recommendation, pre-trade scenario | exposure decomposition, hedge delta, limit policy | Risk Sentinel |
| Hedge instrument choice | Risk Manager | Risk | Hedge recommendation | futures/options/swaps decision table, liquidity and basis checks | Risk Sentinel |
| Asset-backed forecasts | Risk Manager | Risk / Operations | Asset forecast input, risk scenario | forecast normalization, curve mapping, stale-data checks | Market Research Agent |
| Checklist automation | Operations Manager | Operations | Workflow item, checklist template | workflow policy, due dates, owner rules, status transitions | Trade Ops Copilot |
| Reconciliation automation | Operations Manager, Accountant | Operations / Settlement | Operational reconciliation exception, settlement exception | break matching, tolerance rules, escalation policy | Reporting and Reconciliation Agent |
| Invoice and payment follow-through | Accountant | Settlement | Invoice, payment, action request | readiness, stale-state, idempotency, balance checks | Settlement Copilot |
| Accrual automation | Accountant | Accruals | Accrual lot, accrual entry | actualization, price mark, invoice relief, cash application | Fee and Accrual Agent |

## Deterministic Algorithm Candidates

These should not live only in prompts. Each needs owner approval, typed inputs,
tests, and audit behavior before it can be trusted operationally.

### Opportunity Classification

Question:

- Is this market move, spread, basis change, freight move, weather shift, or
  asset forecast change actionable?

Inputs:

- price observations
- official marks
- volatility surfaces
- market positioning
- weather and fundamentals
- source freshness
- current positions and limits

Outputs:

- opportunity category
- confidence and freshness status
- affected books, commodities, locations, tenors, and assets
- suggested next action: watch, scenario, escalate, or ignore

Stop conditions:

- stale source data
- missing official mark
- conflicting sources
- unsupported commodity, tenor, or location mapping
- opportunity would require external commitment without human review

### Physical Movement Cost Stack

Question:

- What is the all-in cost or value of a physical movement?

Inputs:

- origin, destination, mode, quantity, commodity, dates, incoterms or delivery
  terms
- freight rates, broker fees, terminal fees, pipeline tariffs, demurrage,
  inspection, storage, taxes, and other charge schedules
- contract terms and settlement currency

Outputs:

- itemized cost stack
- total expected movement cost
- fee accrual candidates
- missing fee evidence and owner

Stop conditions:

- missing route or delivery terms
- stale tariff or freight source
- unsupported fee type
- currency mismatch without explicit FX handling

### Long/Short Matching And Flattening

Question:

- Which open exposures can offset each other, and which residual delta should
  be hedged or traded?

Inputs:

- positions, trade legs, delivery windows, locations, books, units, price
  indices, quality/specification, counterparty constraints, and limits

Outputs:

- proposed netting set
- residual exposure
- suggested flattening action
- P&L and risk impact preview

Stop conditions:

- mismatched units without approved conversion
- quality or location mismatch outside tolerance
- offset would violate book, counterparty, credit, or compliance policy
- economic impact cannot be priced with available marks

### Hedge Instrument Recommendation

Question:

- Should residual exposure be hedged with futures, options, swaps, physical
  offsets, or no hedge?

Inputs:

- residual delta and optionality
- volatility surface
- liquidity, tenor, margin, basis, credit, and settlement constraints
- risk policy and hedge accounting assumptions where applicable

Outputs:

- recommended hedge instrument type
- rationale and rejected alternatives
- hedge ratio or target delta
- risk and P&L sensitivity preview

Stop conditions:

- missing approved risk policy
- stale volatility or price curves
- unsupported instrument
- hedge accounting or compliance impact is unclear

### Accrual And Reconciliation Exception Detection

Question:

- Which delivered, billed, paid, or expected records no longer reconcile?

Inputs:

- delivery actualizations
- accrual lots and entries
- invoices, payments, disputes, and documents
- tolerance rules, due dates, currencies, and source evidence

Outputs:

- exception type and severity
- owning work object
- proposed follow-up or action request
- expected financial impact

Stop conditions:

- unresolved document ambiguity
- cross-currency netting without explicit FX application
- unsupported overpayment or write-off policy
- missing owner or reviewer role

## Delivery Sequence

Detailed execution breakdown for the first trader/risk slice:

- [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)

### Wave 0: Name The Work And Protect The Controls

- Add the missing durable objects to the work object inventory.
- Keep all commercial and financial mutations behind typed services.
- Make the role-based user manual paths explicit for trader, risk, operations,
  and accounting users.
- Add assistant evals whenever prompt, tool, or action behavior changes.

### Wave 1: Make Trader And Risk Answers Trustworthy

- Extend pre-trade scenarios with richer physical economics and hedge context.
- Add read-only opportunity, netting, and hedge recommendation drafts.
- Add source freshness and missing-evidence labels to all recommendation
  surfaces.
- Do not allow agents to book trades, execute hedges, or send commitments.

### Wave 2: Build The Cost, Accrual, And Reconciliation Spine

- Implement the freight and fee cost stack as deterministic services.
- Promote accrual lots and entries into operator-facing settlement views.
- Add reconciliation exceptions as durable queue context.
- Allow agents to draft or stage follow-up only through approved action types.

### Wave 3: Carefully Expand Bounded Automation

- Promote low-risk internal workflow updates only after policy, audit,
  idempotency, eval, and outcome metrics are proven.
- Keep hedge execution, trade booking, payment release, and external
  communications human-owned unless a separate control model is approved.
- Use outcome metrics and corrected approvals to decide which agents should be
  promoted, narrowed, paused, or retired.

## Verification Expectations

- Docs-only updates should check links and formatting.
- Pre-trade, risk, or recommendation changes should add focused service tests
  for deterministic rules and assistant evals for prompt/tool behavior.
- Settlement, accrual, invoice, or payment changes should add API tests that
  prove balances, currencies, stale-state checks, and audit behavior.
- Operations automation changes should add workflow policy tests and assistant
  evals for action-request metadata.
- Browser smoke coverage should be considered for any new end-to-end operator
  flow that crosses workspaces.
