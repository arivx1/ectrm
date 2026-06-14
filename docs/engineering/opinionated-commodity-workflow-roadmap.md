# Opinionated Commodity Workflow Roadmap

## Purpose

This document distills the user-provided `Commodity Roadmap.pdf` into a
repo-native product direction guide for future ECTRM work. The source document
is a broad roadmap for opinionated commodity workflows, reports, and vertical
product packs.

Use this as directional product context. It is not a substitute for domain
owner approval, implementation specs, source-code inspection, market-data
entitlements, or the governance rules in the agent and action-request docs.

## Core Thesis

Commodity AI should not behave like a blank prompt box or a generic dashboard.
It should guide operators toward the workflows, reports, data objects, and
decisions that are normal for the relevant commodity market.

The product architecture should work as an inheritance tree:

| Layer | Purpose | Examples |
| --- | --- | --- |
| Layer 0: all commodities | Shared workflows, documents, data objects, reporting patterns, workflow state, and evidence. | Daily brief, forward curve report, exposure pack, inventory/logistics report, scenario pack. |
| Layer 1: major commodity groups | Sector-level market structure and default product packs. | Energy, metals, agriculture, chemicals, cross-commodity and adjacent markets. |
| Layer 2: sub-commodity groups | Domain-specific workflows, reports, pricing logic, and data structures. | Crude, LNG, power, NGLs, steel, aluminum, grains, livestock, petrochemicals. |
| Layer 3: market-specific extensions | Jurisdiction, asset, grade, contract, or regional depth where market design demands it. | California power, Alberta power, Mont Belvieu propane, LME aluminum premiums, EU certificates. |
| Layer 4: customer-specific configuration | Customer systems, internal names, portfolio hierarchies, permissions, approvals, and report formats. | ETRM integration, internal risk limits, custom approval chains. |

Default posture: build opinionated defaults into reusable product surfaces, and
leave customer-specific variation at the configuration edge.

## Product Principles

- Opinionated by default, configurable at the edges.
- Inheritance over reinvention: reuse common commodity concepts, but preserve
  market-specific semantics.
- Decision-first, not dashboard-first: each workflow should answer a business
  question, produce a document, trigger a decision, or monitor an exception.
- Commodity semantics are product concepts: units, grades, quality specs,
  locations, curves, basis, premiums, freight, storage, seasonality, contracts,
  and jurisdiction must be explicit data.
- Reports are core product surfaces, not one-off generated text.
- Data lineage, source freshness, assumptions, transformations, citations, and
  version history are required for trust.
- Agents can explain, draft, synthesize, triage, and stage reviewable work, but
  durable business truth belongs in deterministic services, typed records,
  projections, policies, and auditable workflows.

## Launch-Pack Definition

A commodity pack should not launch because it has a few prompts. A minimum
credible launch pack should include:

- reference data and ontology coverage for the commodity, units, locations,
  grades, instruments, aliases, and key assets
- at least three opinionated reports with reusable templates and source lineage
- at least two workflow loops that move from data to analysis to document to
  review to decision
- a role-specific user experience for at least one primary persona and one
  secondary persona
- alerting or monitoring for the most important market or operational exceptions
- a defined integration path for customer data and external data sources
- clear support boundaries for what the pack does, does not support, and allows
  customers to configure

Prioritize packs using customer pull, revenue impact, repeatability, data
readiness, differentiation, implementation effort, strategic adjacency, and
operational risk.

## All-Commodities Foundation

The all-commodities layer is the reusable core. Build or extend this layer
before adding narrow vertical behavior unless the vertical request proves a
missing shared abstraction.

| Workflow | User question | Opinionated output |
| --- | --- | --- |
| Daily market brief | What changed overnight and what matters today? | Role-aware note with prices, news, flows, inventory, risks, and follow-ups. |
| Market balance review | Is the market long, short, balanced, or changing direction? | Supply-demand balance with assumptions, drivers, changes, and confidence. |
| Forward curve and spread review | What do curves, spreads, basis, and premiums imply? | Curve commentary, key moves, decomposition, and trade or risk implications. |
| Position and exposure review | Where are we exposed and what changed? | Position summary, P&L explain, sensitivities, limit exceptions, and hedge gaps. |
| Inventory and logistics review | Where is physical material, where is it going, and what is constrained? | Movement report with transport, storage, scheduling, and exception tracking. |
| Scenario analysis | What changes under demand, supply, weather, outages, freight, or policy shocks? | Scenario pack with assumptions, deltas, outputs, and recommended review actions. |
| Document generation | Can the system produce a report, memo, or customer-ready summary? | Template-backed document with citations, source lineage, and review state. |
| Exception monitoring | What needs human attention now? | Alerts for data breaks, market moves, inventory changes, operational constraints, or risk breaches. |
| Decision review and approval | What should be approved, escalated, or revisited? | Workflow state, owner, rationale, evidence pack, and audit trail. |

Common report surfaces:

- daily commodity brief
- weekly market balance
- forward curve report
- risk and exposure pack
- inventory and logistics report
- executive summary
- customer or counterparty note
- regulatory or jurisdiction memo
- post-event review

Common product modules:

- ontology and reference data
- report builder with opinionated templates
- workflow engine for tasks, approvals, assignments, evidence, and review state
- data lineage and evidence model
- alerting, monitoring, and exception queues
- scenario engine
- integration surfaces for ETRM/CTRM, ERP, market data, spreadsheets, email,
  documents, and BI

## Sector Direction

### Energy

Energy should be the first deep vertical when customer pull is strong because
it forces the platform to handle physical movement, financial instruments,
regional markets, infrastructure bottlenecks, asset economics, operations, and
jurisdictional rules.

Sub-packs:

- crude
- refined products
- natural gas
- LNG
- NGLs and LPG
- coal
- power
- renewables and certificates
- nuclear fuel as a strategic procurement module

Opinionated rules:

- Location is central. Benchmark price is only a starting point.
- Time granularity matters, from multi-year fuel contracts to intraday power.
- Physical constraints drive financial outcomes.
- Energy documents are business objects: confirmations, nominations, tariffs,
  market notices, SPAs, PPAs, invoices, settlement statements, quality specs,
  and environmental attributes.
- Power requires jurisdiction packs, not a generic power dashboard.

Recommended sequence:

| Version | Goal | Representative build |
| --- | --- | --- |
| Energy Core V1 | Market intelligence and price/risk explanation. | Energy executive brief, hydrocarbons brief, power and renewables brief, price move explainer, curve/spread/basis watch, weather-to-energy brief, outage monitor, inventory recap, regulatory watchlist, contract/document summary. |
| Energy Core V2 | Commercial decision support. | Price and basis workbench, hedge memo generator, delivered fuel cost calculator, exposure mapper, asset margin calculators, contract formula extractor, scenario engine, procurement memo. |
| Energy Core V3 | Operations, scheduling, and settlement. | Nomination assistant, pipeline notice summarizer, cargo tracker, storage obligation tracker, ISO settlement explainer, invoice reconciliation, delivery exception detector, operational risk dashboard. |
| Energy Core V4 | Portfolio and asset optimization. | Cross-energy exposure, hedge effectiveness, storage optimization, LNG cargo optimization, power dispatch support, renewable capture/curtailment optimization, environmental compliance portfolio, executive risk cockpit. |

### Metals

Metals need a supply-chain view connecting ores, concentrates, refining,
regional premiums, exchange inventories, quality specs, scrap, and end-use
demand.

Sub-packs:

- ores and concentrates
- aluminum chain
- steel chain
- base and refined metals
- precious metals
- battery and critical minerals
- scrap and circular metals

Opinionated rules:

- Every metal needs a form and grade model.
- Physical pricing is usually benchmark plus premium plus product adders plus
  freight, duty, financing, and contract terms.
- Every physical workflow needs a spec checker for COAs, assays, mill certs,
  contracts, and quality documents.
- Procurement is as important as trading for many metals users.
- Warehouse warrants, exchange inventory, premiums, smelter/refinery economics,
  mill margins, and scrap substitution should be first-class workflow concepts.

### Agriculture

Agriculture is a set of seasonal production systems connected to logistics,
processing economics, local basis markets, export flows, and risk-management
instruments.

Sub-packs:

- grains and oilseeds
- softs and fibers
- livestock
- dairy
- fertilizers and inputs
- specialty crops
- biofuels, feed, and food ingredients

Opinionated rules:

- Crop year, marketing year, old crop, and new crop need explicit modeling.
- Weather must connect to crop stage, animal health, yield, logistics, and
  commercial decisions.
- Local cash basis matters as much as futures for many workflows.
- Quality, grade, moisture, protein, test weight, defects, dockage, residues,
  and food safety documents are product concepts.
- WASDE-style balance workflows, export sales/inspection flows, crop progress,
  processing margins, and procurement contracts should be template-backed.

### Chemicals

Chemicals need feedstock-chain logic. A useful product connects energy
feedstocks, plant outages, capacity, operating rates, formula pricing, product
grades, specs, and downstream demand.

Sub-packs:

- feedstocks and building blocks
- olefins and aromatics
- polymers and resins
- chlor-alkali and vinyls
- methanol, syngas, and C1 chemicals
- fertilizers and ammonia
- industrial gases
- intermediates and solvents
- specialty and formulated chemicals
- inorganics and mineral chemicals
- circular chemicals and recycled plastics

Opinionated rules:

- Chemicals should be modeled as chains, not isolated products.
- Formula pricing and supplier terms are central, not edge cases.
- Plant outage and allocation monitoring is one of the most important daily
  workflows.
- SDS, COA, TDS, GHS labels, customer qualification, and shipping documents are
  product objects.
- Chemical logistics requires packaging, compatibility, hazard classification,
  labels, tank cleaning, temperature/pressure requirements, and segregation
  logic.
- Compliance belongs inside commercial workflows because it determines whether
  products can be sold, shipped, used, or substituted.
- Procurement is the primary wedge for many chemical users.

### Cross-Commodity And Adjacent Markets

Do not treat this as "other." This is shared commodity infrastructure for
delivered economics, procurement, logistics, compliance, and claims.

Priority packs:

- freight and logistics
- environmental commodities and certificates
- forest products
- fertilizers and agricultural inputs as a bridge sector
- nuclear fuel
- construction and industrial bulk materials
- water constraints
- food ingredients and CPG procurement
- recycling and circular materials

The defining shared workflow is delivered cost:

```text
delivered cost =
  commodity benchmark price
  + basis / premium / differential
  + freight
  + fuel or bunker adjustment
  + terminal fees
  + storage
  + insurance
  + demurrage or detention
  + duties or tariffs
  + financing
  + quality adjustment
  + compliance or certificate cost
  + FX
```

Environmental instruments are claim-bearing instruments. Their workflow needs
price, jurisdiction, vintage, registry, eligibility, methodology, technology,
retirement status, claim rights, audit evidence, and counterparty risk.

## Repo Implementation Implications

When a feature request draws from this roadmap, classify the work before
implementing:

1. Is it a shared all-commodity capability, sector pack, sub-commodity pack,
   jurisdiction/grade/asset extension, or customer configuration?
2. Which durable domain owns the business truth: trading, reference data, risk,
   operations, settlement, accruals, documents, reports, market data, or policy?
3. Which typed data objects are required: commodity, product, grade, quality
   spec, location, hub, curve, index, basis, premium, freight rate, storage
   cost, conversion factor, contract, position, hedge, exposure, inventory,
   shipment, schedule, asset, outage, certificate, or alert?
4. Which deterministic service or formula owns official values?
5. Which report template, workflow state, action request, or review object
   carries the decision?
6. What source freshness, provenance, citations, audit, and manual fallback are
   required?
7. What matching agent-readable tool or payload should expose the same governed
   records and stop reasons?

Prefer implementing reusable Layer 0 primitives before hardcoding a vertical
exception. Add vertical semantics as typed extensions, not as prompt-only
instructions.

## Agent And Autonomy Implications

Agents may:

- assemble market briefs and report drafts from governed data
- explain source freshness, assumptions, scenarios, and missing evidence
- draft hedge memos, procurement memos, delivered-cost explanations, and
  exception summaries
- triage documents and propose typed workflow actions
- stage reviewable actions when an action contract, policy, stale-state basis,
  idempotency behavior, reviewer role, and audit trail exist

Agents may not:

- directly book, amend, cancel, settle, pay, hedge, trade, retire certificates,
  make compliance claims, or externally commit the firm from freeform text
- invent official marks, freight rates, contract formulas, eligibility rules,
  certificate ownership, customer approvals, or regulatory conclusions
- turn customer-specific configuration into core behavior without an explicit
  typed configuration model
- move pricing, risk, settlement, credit, compliance, permissions, policy,
  reference-data, or external-commitment rules into prompt text

## Stop Signs

Keep the work as a proposal or require domain-owner approval when:

- a rule affects pricing, risk, settlement, credit, compliance, permissions,
  reference data, policy, or external commitments
- market data licensing or provenance is unclear
- the workflow would make a regulatory, environmental, low-carbon, recycled,
  eligibility, retirement, or customer claim
- hedge recommendations move from explanation into execution or external order
  routing
- settlement, invoice, ISO uplift, payment, or cash instructions would be
  generated or changed
- a vertical-specific rule is being added without a clear owning domain,
  typed data shape, test fixture, audit trail, and rollback/correction path

## Suggested Roadmap Tracker Columns

If this roadmap is converted into a tracker, use one row per pack, workflow,
report, data object, integration, or action type. Suggested columns:

- commodity group
- sub-commodity
- roadmap layer
- persona
- workflow
- report/document
- durable work object
- deterministic service or formula
- data dependencies and source freshness
- external data entitlement
- integration dependency
- review or approval boundary
- agent tool implication
- stop conditions
- customer evidence
- priority score
- effort
- owner
- phase
- launch criteria
- verification lane
