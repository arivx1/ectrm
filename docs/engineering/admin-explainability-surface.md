# Admin Explainability Surface

## Purpose

This document defines a product-facing design addition for the Admin workspace:
an explainability surface that shows how the platform works internally without
falling into raw developer tooling.

The goal is demonstrative clarity. The product should not only let users act on
trades, reference data, and operations; it should also expose curated views into
the system's architecture, workflows, and data lineage.

This is not a generic admin dashboard. It is a guided "window into the machine."

## Why This Belongs in the Product

The current product already has the right ingredients:

- an event store
- projections for `trades` and `positions`
- emerging reference-data governance
- a reserved `Admin` workspace in the UI
- documented domain boundaries and target architecture

Those qualities are differentiators. They should be visible in the product,
especially in a demonstrative environment where stakeholders need to understand
the system's model, not just click through forms.

## Product Positioning

Keep the top-level workspace label as `Admin`, but introduce a distinct section
within it called:

- `How It Works`

Alternative labels if a stronger framing is desired later:

- `System Atlas`
- `Platform Map`
- `Operating Model`

Recommendation: use `How It Works` in the UI because it is plain-language and
immediately legible to both technical and non-technical audiences.

## Experience Principles

### 1. Curated, not exhaustive

Do not expose every table, endpoint, or internal service. Show the parts that
help users understand the product model.

### 2. Productized, not DBA-grade

This should feel like a designed product surface, not an embedded schema tool.
The diagrams should prioritize comprehension over full fidelity.

### 3. Explain state transitions, not just static entities

The most important thing to show is how an action becomes an event, how that
event updates projections, and where the result appears in the UI.

### 4. Tie visuals to live system data where possible

Whenever feasible, diagrams and cards should reflect actual runtime values:

- latest event timestamp
- projection freshness
- active reference records
- recent rebuild status

### 5. Separate operator controls from educational views

Admin should contain both:

- operational controls
- explainability views

These should be visually adjacent but conceptually distinct.

## Proposed Information Architecture

Within `Admin`, create two bands:

1. `How It Works`
2. `Controls and Governance`

The current placeholder cards for projection jobs, reference governance, and
roles/access fit naturally under `Controls and Governance`.

The new addition is the `How It Works` band.

## Core Sections

### 1. Architecture Map

Purpose:
Show the platform's domain model and major product boundaries.

Content:

- domain cards:
  - Trading
  - Reference Data
  - Risk
  - Operations
  - Settlement
  - Reports
  - Admin
  - Assistant
- supporting platform layer:
  - event store
  - projections
  - application services

Interaction:

- hover or click a domain to reveal:
  - what it owns
  - example entities
  - example workflows
  - linked pages or future pages

Design note:
This should read as a product map, not a backend package tree.

### 2. Lifecycle Trace

Purpose:
Show how a user action moves through the system.

Primary trace to support first:

- `Create Trade`
- `Amend Trade`
- `Cancel Trade`

Visual sequence:

1. user action in UI
2. command/write request
3. event persisted
4. projection rebuild or projection update
5. read model refreshed
6. downstream views affected

Example output for a selected trade:

- latest event type
- event count for the trade
- current trade status
- affected projections:
  - trades
  - positions
- last updated timestamps

Design note:
This is the most important section for demonstrating the event-driven shape of
the product.

### 3. Schema Explorer

Purpose:
Provide a legible ERD-style view of core entities and relationships.

Scope for first release:

- `events`
- `trades`
- `positions`
- `reference_books`
- `reference_commodities`
- `reference_price_indices` when surfaced

Behavior:

- show a simplified relationship diagram
- allow selecting an entity to inspect:
  - purpose
  - key fields
  - upstream dependencies
  - downstream consumers

Do not:

- expose every column by default
- mimic a raw database diagram
- mix future-state canonical entities with current-state tables without clear
  labels

Design note:
Use explicit badges like `Current` and `Planned` if future entities are shown.

### 4. Workflow Stories

Purpose:
Translate internal product capability into scenario-based narratives.

These should not look like Jira tickets. They should be presented as guided
operational stories.

Initial stories:

- Capture a trade
- Amend a trade
- Govern reference data
- Rebuild a projection
- Trace why a position changed

Each story should show:

- actor
- trigger
- system checks
- records touched
- outcome

Design note:
Think "sequence card" or "stepper narrative," not backlog text.

### 5. System Provenance

Purpose:
Show whether the product is explainable and healthy right now.

Initial cards:

- latest event ingested
- last trade projection update
- last position projection update
- projection rebuild availability/status
- schema version currently emitted by writes
- count of active books and commodities

This turns the explainability surface from static documentation into a live
system window.

## Recommended Page Layout

Use a desktop-first, two-depth layout:

1. Hero strip
2. Explainability modules
3. Controls/governance modules

### Hero strip

Contains:

- title: `Admin`
- subtitle: concise statement that this workspace covers both governance and
  platform transparency
- 3 summary metrics:
  - events recorded
  - projections fresh/stale
  - active reference records

### Explainability modules

Grid of four primary cards:

- Architecture Map
- Lifecycle Trace
- Schema Explorer
- Workflow Stories

Below that, a full-width provenance strip.

### Controls/governance modules

Retain and expand the current cards:

- Projection Jobs
- Reference Governance
- Roles and Access

## Visual Direction

The look should feel like an operations console with editorial clarity.

### Tone

- precise
- architectural
- calm
- demonstrative

### Avoid

- novelty charts with unclear value
- generic analytics-dashboard styling
- over-detailed boxes-and-arrows diagrams
- decorative "AI system" motifs

### Suggested visual language

- panel-based layout
- thin connector lines between system steps
- muted neutral base with one accent color for state flow
- subtle status tones for fresh/stale/warning
- typography that distinguishes:
  - product sections
  - system entities
  - event types

## Data Model for the UI

This surface should eventually be API-backed rather than hardcoded.

Recommended frontend view models:

- `AdminHowItWorksSummary`
- `LifecycleTraceView`
- `SchemaEntityView`
- `WorkflowStoryView`
- `SystemProvenanceView`

Recommended backend support, additive over time:

- `/admin/explainability/summary`
- `/admin/explainability/lifecycle/trades/{trade_id}`
- `/admin/explainability/schema`
- `/admin/explainability/workflows`
- `/admin/explainability/provenance`

The first implementation can mix live API data with curated static metadata.

## First Implementation Slice

Deliver the smallest version that proves the concept without building a
full diagramming system.

### Phase 1

Implement inside `Admin`:

- hero strip with live counts
- architecture map as curated cards
- lifecycle trace for the selected trade using existing `trades` and `events`
- simplified schema explorer using static metadata for current tables
- retain existing governance cards below

This can be built with the current frontend shape, though it will be cleaner
once `App.tsx` is decomposed into workspace/page components.

### Phase 2

Add:

- provenance strip fed by admin endpoints
- workflow stories
- richer entity relationships
- projection job status wiring

### Phase 3

Add:

- toggle between current-state and target-state architecture
- richer domain drill-down
- future canonical trade model views

## Content Rules

To keep this surface credible:

- every visual must answer a real user question
- every diagram must map to an actual implementation or clearly marked plan
- future-state concepts must be labeled as planned
- static explanatory content must be short and scannable
- technical vocabulary should be present, but never unexplained

## Success Criteria

This addition is successful if a new stakeholder can open Admin and quickly
understand:

- what the core product domains are
- how a trade change propagates through the system
- what data objects matter most
- where governance lives
- whether the system is currently healthy and explainable

## Implementation Notes for the Current Repo

This design aligns with the existing frontend and documentation:

- current UI already has an `Admin` view placeholder
- architecture docs already define domain boundaries
- current API already exposes enough data to drive an initial lifecycle trace
- existing events/projections model is strong enough to visualize immediately

The next practical UI step should be:

1. split the Admin page into its own workspace component
2. create static metadata for schema entities and workflow stories
3. derive lifecycle trace data from current `trades` and `events`
4. add admin API endpoints only where live provenance needs backend support
