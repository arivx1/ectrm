# Truck Tracking WP-01: Truck Run And Stop Model

## Purpose

This document turns the first truck-tracking kickoff package into a concrete
work-object and lifecycle contract.

`WP-01` is the same foundational slice described as `TTS-01` in the broader
truck-tracking roadmap. The purpose here is to define the durable run and stop
model before the team adds schema migrations, UI forms, or external tracking
adapters.

## Related Docs

- [Truck Tracking System Architecture](./truck-tracking-system-architecture.md)
- [Truck Tracking System Work Packages](./truck-tracking-system-work-packages.md)
- [Platform Blueprint](./platform-blueprint.md)
- [Governed Core Platform Boundary Reset](./core-platform-boundary-reset.md)
- [Scheduling UI Design Review](./scheduling-ui-design-review.md)
- [Trading And Shipping Document Taxonomy](./document-taxonomy-trading-shipping.md)

## Outcome

ECTRM has a stable truck-run and stop contract that:

- supports multi-stop movements from the start
- treats point-to-point trucking as a simple two-stop case
- keeps `DeliveryObligation` as the parent business object
- separates movement status from stop status and from raw tracking evidence
- defines enough lifecycle and stale-state behavior for follow-on schema and UI
  work

## Locked Inputs

These earlier decisions are assumed and not reopened by `WP-01`:

- multi-stop support is in scope from the first slice
- carrier identity starts as `carrier_name` plus external carrier reference
- manual dispatcher updates define the first operational contract
- low-risk arrival and departure milestones are the first auto-projection
  candidates

## Current Repo Anchors

Backend seams to extend:

- `apps/api/app/models/delivery_obligation.py`
- `apps/api/app/models/delivery_logistics_detail.py`
- `apps/api/app/models/delivery_event.py`
- `apps/api/app/domains/operations/services/shipments.py`
- `apps/api/app/domains/operations/routes/shipments.py`
- `apps/api/app/schemas/shipment.py`

Frontend seams to extend later:

- `apps/web/src/workspaces/shipments/ShipmentWorkspace.tsx`
- `apps/web/src/workspaces/scheduling/SchedulingWorkspace.tsx`
- `apps/web/src/entities/shipments/api.ts`

## Work Object Contract

### `DeliveryObligation`

`DeliveryObligation` remains the canonical parent record.

Truck movements should not become an alternate top-level commercial object.
They are execution-facing child work under the delivery obligation.

### `DeliveryTruckMovement`

One `DeliveryTruckMovement` represents one dispatchable truck run that may
contain one or many ordered stops.

Recommended first-cut fields:

- `movement_id`
- `delivery_id`
- `sequence_no`
- `status`
- `planned_quantity`
- `planned_unit_of_measure`
- `carrier_name`
- `external_carrier_reference`
- `dispatcher_owner`
- `driver_name`
- `driver_phone`
- `tractor_reference`
- `trailer_reference`
- `external_load_reference`
- `bill_of_lading_number`
- `truck_ticket_number`
- `current_stop_sequence`
- `current_location_code`
- `last_signal_at`
- `current_eta_at_destination`
- `hold_reason_code`
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

Field intent:

- `sequence_no` orders multiple truck runs under one delivery obligation
- `planned_quantity` may be a partial quantity when several runs share the same
  delivery obligation
- `external_load_reference` is the main cross-system run identifier when one
  exists
- `current_stop_sequence` lets the system talk about progress without inventing
  a separate current-stop table

### `DeliveryTruckStop`

One `DeliveryTruckStop` represents one operational stop on a truck run.

Recommended first-cut fields:

- `stop_id`
- `movement_id`
- `stop_sequence`
- `stop_type`
- `location_code`
- `planned_arrival_start`
- `planned_arrival_end`
- `planned_departure_start`
- `planned_departure_end`
- `actual_arrived_at`
- `actual_departed_at`
- `appointment_reference`
- `status`
- `planned_quantity`
- `actual_quantity`
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

Recommended stop types:

- `PICKUP`
- `DROPOFF`
- `WAYPOINT`

Point-to-point trucking is the simple case:

- stop 1 = `PICKUP`
- stop 2 = `DROPOFF`

Multi-stop trucking is the general case:

- one or more `PICKUP` stops
- optional `WAYPOINT` stops
- one or more `DROPOFF` stops

## Lifecycle Contract

### Movement Statuses

Movement status should summarize run progress. It should not try to encode
every operational fact that the stop model or milestone history already
captures.

Recommended movement statuses:

- `PLANNED`
  The run exists, but assignment or dispatch work is still incomplete.
- `ASSIGNED`
  Carrier or dispatch ownership is set, but active travel toward the current
  stop has not started.
- `EN_ROUTE_TO_STOP`
  The run is actively heading to the current stop.
- `AT_STOP`
  The truck has arrived at the current stop and stop work is underway or
  waiting to finish.
- `IN_TRANSIT`
  The truck has departed a non-final stop and is moving to a later stop.
- `ON_HOLD`
  A hold prevents normal execution progression.
- `COMPLETED`
  The final active stop has been completed and the run no longer has open
  execution work.
- `CANCELLED`
  The run has been cancelled explicitly.

### Stop Statuses

Stop status should capture local progress at one stop.

Recommended stop statuses:

- `PLANNED`
- `EN_ROUTE`
- `ARRIVED`
- `WORKING`
- `DEPARTED`
- `SKIPPED`
- `CANCELLED`

The stop model is the durable home for stop-by-stop progress. Movement status
rolls up from this state plus explicit hold and cancellation semantics.

### Delivery Roll-Up Direction

Delivery-level execution should remain a higher-level summary.

Recommended roll-up direction:

- any active movement in `ON_HOLD` may place the delivery in `ON_HOLD`
- any active movement in `EN_ROUTE_TO_STOP`, `AT_STOP`, or `IN_TRANSIT` places
  the delivery in `IN_PROGRESS`
- all active movements `COMPLETED` may place the delivery in `COMPLETED`
- all active movements `CANCELLED` may place the delivery in `CANCELLED`
- otherwise the delivery remains `PLANNED` or equivalent pre-execution status

## Invariants

`WP-01` should lock these invariants:

1. Every truck movement belongs to exactly one delivery obligation.
2. Every truck stop belongs to exactly one truck movement.
3. `stop_sequence` is dense, one-based, and unique within a movement.
4. The first active stop must be `PICKUP`.
5. The final active stop must be `DROPOFF`.
6. `WAYPOINT` stops may exist only between the first pickup and final dropoff.
7. A movement must have at least two active stops in the first implementation.
8. Only one stop per movement may be active in `EN_ROUTE`, `ARRIVED`, or
   `WORKING` at a time.
9. A movement cannot be `COMPLETED` until its final active stop is
   `DEPARTED`.
10. Actualization and settlement readiness remain outside the movement status
    contract and require separate evidence and service rules.

## Mutation Expectations

`WP-01` does not require final route implementation, but it should define the
allowed mutation patterns that later API work must preserve.

Required mutation patterns:

- create a movement with its initial ordered stop set
- patch movement metadata such as carrier, dispatcher, equipment, or external
  references
- add a stop before execution starts
- resequence stops before execution starts
- cancel or skip a stop with explicit reason
- cancel a movement with explicit reason

Guardrails:

- stop resequencing should be blocked after any active stop is no longer
  `PLANNED`
- point-to-point and multi-stop runs should use the same create and patch shape
- movement metadata changes should preserve audit and versioning

## Stale-State And Idempotency Basis

Later schema and route work should enforce these minimum stale-state checks.

Movement mutations should compare:

- `movement_id`
- `version`
- current `status`
- current `current_stop_sequence`

Stop mutations should compare:

- `stop_id`
- `version`
- current `status`
- current `stop_sequence`

Recommended idempotent create key families:

- `delivery_id + sequence_no`
- or external load reference when the upstream source owns it

## Relationship To Milestones And Tracking Signals

This package intentionally separates structural lifecycle from evidence
ingestion.

- movement and stop statuses are governed operational state
- `DeliveryEvent` remains the accepted milestone history
- `DeliveryTrackingSignal` remains raw evidence, not official business truth

Examples:

- `ARRIVED_PICKUP` may move the current stop to `ARRIVED`
- `DEPARTED_PICKUP` may move the current stop to `DEPARTED` and the movement to
  `IN_TRANSIT`
- a raw GPS ping may update matching confidence or last-seen context without
  changing accepted run state

## Follow-On Packages Enabled

Once `WP-01` is locked, the team can move safely into:

- schema and route scaffolding
- manual dispatch workflow UI
- accepted milestone projection rules
- scheduling and operations queue views

Without `WP-01`, those packages are likely to create conflicting assumptions.

## Acceptance Criteria

`WP-01` is done when:

- the truck movement and stop model is documented in one canonical place
- status vocabularies and invariants are explicit
- point-to-point and multi-stop behavior use one shared contract
- stale-state expectations are clear enough for route and schema work
- follow-on packages can reference this note instead of redefining the model

## Verification

- docs review
- link and reference checks in touched planning docs
