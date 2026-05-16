# Truck Tracking System Work Packages

## Goal

Deliver the first governed truck-tracking slice on top of ECTRM's existing
delivery, shipment, scheduling, workflow, and document seams.

The slice should let operators:

- plan one or more truck movements and stops under a delivery obligation
- track truck progress through accepted milestones and raw telemetry evidence
- see ETA, dwell, and stale-tracking exceptions in existing workspaces
- connect POD and ticket evidence to actualization readiness

This is an operations and visibility program first, not an autonomous dispatch
or fleet-procurement system.

## Primary Design Inputs

- [Truck Tracking System Architecture](./truck-tracking-system-architecture.md)
- [Platform Blueprint](./platform-blueprint.md)
- [Governed Core Platform Boundary Reset](./core-platform-boundary-reset.md)
- [Scheduling UI Design Review](./scheduling-ui-design-review.md)
- [Rail Delivery Schema](./rail-delivery-schema.md)
- [Trading And Shipping Document Taxonomy](./document-taxonomy-trading-shipping.md)
- [Truck Tracking WP-01: Truck Run And Stop Model](./truck-tracking-wp-01-run-stop-model.md)
- [Truck Tracking TTS-02: Schema And API Scaffolding](./truck-tracking-tts-02-schema-api-scaffolding.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)

## Current Repo Anchors

The first truck slice should extend these existing anchors:

- backend shipment routes:
  `apps/api/app/domains/operations/routes/shipments.py`
- backend delivery and shipment services:
  `apps/api/app/domains/operations/services/shipments.py`
- backend actualization service:
  `apps/api/app/domains/operations/services/actualizations.py`
- backend delivery models:
  `apps/api/app/models/delivery_obligation.py`,
  `apps/api/app/models/delivery_logistics_detail.py`,
  `apps/api/app/models/delivery_event.py`
- backend shipment schemas: `apps/api/app/schemas/shipment.py`
- frontend shipment workspace:
  `apps/web/src/workspaces/shipments/ShipmentWorkspace.tsx`
- frontend scheduling workspace:
  `apps/web/src/workspaces/scheduling/SchedulingWorkspace.tsx`
- frontend operations workspace:
  `apps/web/src/workspaces/operations/OperationsWorkspace.tsx`
- frontend shipment API client:
  `apps/web/src/entities/shipments/api.ts`

## Authority Boundary

Phase 1 authority for truck tracking is operational visibility, deterministic
exception handling, and reviewable actualization preparation.

The system may:

- ingest and normalize raw tracking signals
- match signals to truck movements with confidence and explicit failure reasons
- project ETA, dwell, lateness, and stale-tracking exceptions
- create or update internal workflow items under deterministic policy
- accept low-risk checkpoint progression when confidence and freshness rules
  pass

The system may not:

- actualize delivered quantity from telemetry alone
- send carrier or counterparty commitments autonomously
- change settlement or payment records from tracking events
- bypass typed shipment, document, or actualization services

## Delivery Order

### Wave 0: Contract Foundation

1. `TTS-01` truck work object and status contract
2. `TTS-02` truck schema and API scaffolding
3. `TTS-03` tracking signal ingest and matching contract

### Wave 1: First Operator Slice

4. `TTS-04` dispatch and movement workspace integration
5. `TTS-05` accepted milestone projection and correction path

### Wave 2: Operational Intelligence

6. `TTS-06` ETA, dwell, and tracking exception rules
7. `TTS-07` document linkage and actualization readiness

### Wave 3: External Feeds And Explainability

8. `TTS-08` provider adapter rollout
9. `TTS-09` assistant read surfaces, evals, and smoke coverage

## Shared Definition Of Done

Each work package is done only when:

- truck-related writes flow through typed operations or document services
- raw tracking signals remain append-only and auditable
- accepted milestones cite manual, signal, or document evidence explicitly
- stale-state and correction paths are defined for movement edits
- manual fallback exists for dispatch, milestone correction, and actualization
- the narrowest verification lane is added or updated:
  focused API tests, web tests, browser smoke, and assistant evals when
  applicable
- docs are updated when work-object, event, or authority boundaries change

## TTS-01 / WP-01: Truck Run And Stop Model

### Priority

P0

### Size

M

### Outcome

ECTRM has a clear operational model for truck tracking that fits beneath
`DeliveryObligation` and does not overload delivery header rows with per-load
execution detail.

### Status

Drafted in
[Truck Tracking WP-01: Truck Run And Stop Model](./truck-tracking-wp-01-run-stop-model.md).

### Scope

- define `DeliveryTruckDetail`, `DeliveryTruckMovement`, and
  `DeliveryTruckStop` and `DeliveryTrackingSignal` as first-class planning
  objects
- define the parent-child relationship between delivery, movement, signal, and
  accepted milestone event
- define multi-stop support as the default contract shape, with point-to-point
  modeled as a simple two-stop case
- define a truck movement status model and its roll-up into the shared
  delivery-level execution status
- define a stop status model and stop sequencing expectations
- define the minimum identity keys for matching and idempotency:
  `movement_id`, `delivery_id`, provider event ID, external load reference,
  ticket or BOL references
- define how workflow items and documents attach to a truck movement

### Out Of Scope

- database migrations
- external provider integration
- map rendering

### Acceptance Criteria

- truck movements are documented as delivery-owned child work objects
- status and event vocabulary are explicit enough for backend and frontend work
- the contract distinguishes raw signal evidence from accepted business events
- correction and stale-state expectations are named

### Verification

- docs review
- link and reference checks in touched planning docs

## TTS-02: Truck Schema And API Scaffolding

### Priority

P0

### Size

M

### Outcome

The team has a clear additive schema and route direction for truck tracking
that fits the existing operations domain.

### Status

Drafted in
[Truck Tracking TTS-02: Schema And API Scaffolding](./truck-tracking-tts-02-schema-api-scaffolding.md).

### Scope

- define first-cut fields for `delivery_truck_details`
- define first-cut fields for `delivery_truck_movements`
- define first-cut fields for `delivery_truck_stops`
- define first-cut fields for `delivery_tracking_signals`
- define recommended route additions or extensions for movement CRUD, truck
  detail updates, stop CRUD, and integration ingest
- define where new code should live in `operations` and `integrations`
- define audit, version, and `<field>_source` expectations where applicable

### Out Of Scope

- full provider-specific payload mapping
- route implementation
- UI behavior

### Acceptance Criteria

- the schema direction is additive and compatible with current shipment flows
- the API proposal preserves typed write boundaries
- truck-specific detail is not forced into generic freeform notes
- route ownership between business APIs and integration endpoints is clear

### Verification

- docs review
- schema and route proposal walkthrough

## TTS-03: Tracking Signal Ingest And Matching Contract

### Priority

P0

### Size

M

### Outcome

Raw carrier, broker, GPS, or ELD updates can land in ECTRM as auditable
tracking evidence without silently mutating business state.

### Scope

- define normalized tracking signal fields
- define provider event ID, dedupe key, and replay expectations
- define signal-to-movement and stop matching inputs and confidence outcomes
- define unresolved-signal behavior when a safe movement match is not possible
- define provider-authenticated integration route expectations
- define the minimum signal freshness metadata needed for ETA and stale-tracking
  rules
- define manual dispatcher updates as the first canonical tracking contract,
  with external feeds layered on after the contract proves stable

### Out Of Scope

- implementing a live adapter
- auto-actualization
- agent behavior

### Acceptance Criteria

- signal ingestion is append-only and idempotent by design
- matching outcomes distinguish matched, unresolved, duplicate, and rejected
- unmatched or conflicting signals have a human-visible handling path
- the contract is usable by both polling and webhook-style providers

### Verification

- docs review
- focused design review of idempotency and matching assumptions

## TTS-04: Dispatch And Movement Workspace Integration

### Priority

P0

### Size

L

### Outcome

Operators can create and manage truck movements inside the current shipment and
scheduling workspaces without needing a separate product surface.

### Scope

- define the shipment workspace additions for per-delivery truck movements
- define the stop editor and sequencing behavior for multi-stop runs
- define the scheduling workspace additions for truck dispatch queues and
  appointment urgency
- define the minimum editor fields for movement assignment, references, and
  manual checkpoint capture
- define the operations workspace additions for cross-delivery truck exception
  triage
- define movement-level filtering, grouping, and status presentation

### Out Of Scope

- map playback
- provider integration
- settlement workflow changes

### Acceptance Criteria

- the first truck UI lives inside existing shipment, scheduling, and operations
  surfaces
- users can see multiple movements under one delivery obligation
- users can see multiple ordered stops under one truck movement
- truck work is grouped by operational stage and urgency, not only by commodity
  mode
- the proposal keeps manual fallback for dispatch and milestone correction

### Verification

- focused web tests for movement rendering and editor behavior when implemented
- browser smoke for dispatch-to-tracking flows when the slice becomes live

## TTS-05: Accepted Milestone Projection And Correction Path

### Priority

P0

### Size

M

### Outcome

ECTRM can turn trusted manual updates, documents, or normalized signals into
accepted truck milestones without hiding source evidence or losing correction
history.

### Scope

- define how truck checkpoints map into `DeliveryEvent`
- define `checkpoint_code` or equivalent sub-typing under accepted delivery
  events
- define how milestones attach to the movement and, when relevant, a specific
  stop
- define when checkpoint progression may auto-advance versus when it must stage
  a conflict or review
- define how `EVENT_REVERSED` or equivalent correction flows should work for
  mistaken truck milestones
- define how movement status and delivery status projections respond to
  accepted milestones
- lock the initial auto-projection set to low-risk arrival and departure
  location milestones only

### Out Of Scope

- quantity actualization
- provider rollout
- assistant tooling

### Acceptance Criteria

- accepted milestones remain append-only business events
- source evidence is explicit for every accepted checkpoint
- backwards or conflicting checkpoint motion has a governed correction path
- delivery and movement status roll-up rules are documented
- auto-projected milestones are explicitly narrower than quantity-sensitive or
  dispute-prone milestones

### Verification

- focused API tests for milestone projection and correction paths when
  implemented
- web tests for movement timeline and conflict visibility

## TTS-06: ETA, Dwell, And Tracking Exception Rules

### Priority

P1

### Size

M

### Outcome

Truck operators can see which movements are on time, at risk, late, dwelling,
or stale from a deterministic ruleset instead of ad hoc judgment.

### Scope

- define ETA status states
- define stale-tracking thresholds by provider or policy family
- define dwell detection inputs and thresholds
- define which exceptions create or update workflow items automatically
- define how exception state rolls up from movement to delivery-level
  operational visibility
- define how lack of signal freshness should degrade confidence rather than
  fabricate certainty

### Out Of Scope

- route optimization
- carrier scorecards
- pricing or detention economics

### Acceptance Criteria

- ETA, lateness, dwell, and stale-tracking states are deterministic
- operators can distinguish missing data from true late movement behavior
- workflow items are created only through explicit rules
- exception rules do not mutate actualization or settlement state directly

### Verification

- focused API tests for ETA and exception classification
- focused web tests for exception labels and queue grouping

## TTS-07: Document Linkage And Actualization Readiness

### Priority

P1

### Size

M

### Outcome

Truck tickets, weigh tickets, and POD evidence can support actualization
readiness without allowing documents or telemetry to bypass governed quantity
capture.

### Scope

- define the primary routing targets for truck tickets, weigh tickets, and PODs
- define movement-versus-delivery document attachment rules
- define when a document should also attach to a specific truck stop
- define actualization-readiness states based on document evidence and operator
  review
- define how document evidence can confirm or create accepted truck milestones
- define conflict behavior when document evidence disagrees with tracking
  signals or manual checkpoints

### Out Of Scope

- invoice issuance
- settlement auto-execution
- full extraction implementation

### Acceptance Criteria

- document evidence supports, but does not replace, typed actualization writes
- the platform can distinguish ready-to-actualize from missing-evidence states
- document linkage rules align with the existing trading and shipping taxonomy
- conflicts between document and signal evidence are visible to operators

### Verification

- focused API tests for readiness classification and document linkage
- web tests for movement document evidence and actualization readiness display

## TTS-08: Provider Adapter Rollout

### Priority

P1

### Size

L

### Outcome

ECTRM has one provider-agnostic tracking adapter contract and can onboard the
first real carrier, broker, or telematics source without rewriting business
logic.

### Scope

- define one provider-neutral normalization contract
- define provider authentication, replay, and failure handling expectations
- define adapter observability and dead-letter handling
- define rollout order for the first real provider family
- define fallback behavior when providers omit stable IDs, coordinates, or
  freshness guarantees

### Out Of Scope

- supporting every provider at once
- replacing manual dispatcher updates
- public external partner self-service

### Acceptance Criteria

- provider-specific code stops at the normalization boundary
- downstream truck business rules consume one normalized contract
- replay, duplicate, and partial-failure handling are explicit
- manual operations continue to work while a provider is degraded or offline

### Verification

- focused adapter tests with provider fixtures when implemented
- operational runbook review for auth, replay, and dead-letter handling

## TTS-09: Assistant Read Surfaces, Evals, And Smoke Coverage

### Priority

P2

### Size

M

### Outcome

Truck-tracking context becomes explainable and inspectable through the same
governed product surfaces that humans use, with coverage to prevent assistant
overreach.

### Scope

- define read-only assistant or API toolkit access for truck movements,
  accepted milestones, ETA status, and exceptions
- define which tracking evidence fields are safe and useful to expose
- define assistant evaluation cases for no-overclaim behavior, stale-data
  handling, and manual-fallback guidance
- define browser smoke targets for dispatch, tracking, and actualization-ready
  follow-through

### Out Of Scope

- assistant-executed carrier commitments
- autonomous actualization
- autonomous workflow approvals

### Acceptance Criteria

- human and assistant read surfaces expose the same core truck evidence
- assistant behavior is explicitly gated to explain and draft only
- stale tracking, unresolved matches, and missing documents are visible in eval
  expectations
- the truck slice has a browser-level smoke target once the end-to-end path is
  stable

### Verification

- `make api-assistant-evals` when assistant-facing behavior lands
- focused web tests and `make web-smoke-test` for end-to-end operator flows
