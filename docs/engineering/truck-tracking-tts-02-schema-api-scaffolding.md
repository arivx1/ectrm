# Truck Tracking TTS-02: Schema And API Scaffolding

## Purpose

This document turns `TTS-02` into a concrete schema and API scaffolding
package.

`TTS-02` should take the run and stop contract from
[Truck Tracking WP-01: Truck Run And Stop Model](./truck-tracking-wp-01-run-stop-model.md)
and define the additive database, schema, and route direction needed for the
first implementation slice.

This is still a planning and contract package. It does not implement the
tables, migrations, or routes yet.

## Related Docs

- [Truck Tracking System Architecture](./truck-tracking-system-architecture.md)
- [Truck Tracking System Work Packages](./truck-tracking-system-work-packages.md)
- [Truck Tracking WP-01: Truck Run And Stop Model](./truck-tracking-wp-01-run-stop-model.md)
- [Rail Delivery Schema](./rail-delivery-schema.md)
- [Platform Blueprint](./platform-blueprint.md)
- [Governed Core Platform Boundary Reset](./core-platform-boundary-reset.md)

## Outcome

ECTRM has a clear additive schema and route plan for truck tracking that:

- fits the current delivery and shipment seams
- preserves `DeliveryObligation` as the parent record
- supports multi-stop truck runs without a rewrite later
- keeps provider ingest separate from business mutation routes
- gives follow-on implementation work a stable table, schema, and endpoint map

## Locked Inputs

`TTS-02` assumes these decisions are already made:

- multi-stop support is in scope from the first slice
- carrier identity starts as `carrier_name` plus external carrier reference
- manual dispatcher updates are the first operational contract
- raw tracking signals remain evidence and do not directly actualize quantity

## Near-Term Placement

The repo's current additive shape should win over idealized future structure for
the first implementation slice.

Recommended near-term placement:

```text
apps/api/app/
  models/
    delivery_truck_detail.py
    delivery_truck_movement.py
    delivery_truck_stop.py
    delivery_tracking_signal.py
  schemas/
    shipment.py
  domains/operations/
    routes/
      deliveries.py
      truck_tracking.py
    services/
      shipments.py
      truck_tracking.py
```

Guidance:

- keep new SQLAlchemy tables in `apps/api/app/models` to match the current
  delivery model pattern
- keep business routes and orchestration logic in `domains/operations`
- extend `apps/api/app/schemas/shipment.py` first instead of splitting a new
  schema module prematurely
- reserve `domains/integrations` or equivalent provider routes for later
  external ingest work

## Table Direction

## 1. `delivery_truck_details`

This is a one-row-per-delivery extension keyed by `delivery_id`.

Recommended table role:

- store reusable truck-execution defaults that apply to the delivery as a whole
- avoid storing per-run or per-stop progress here

Recommended columns:

- `delivery_id` `String(96)` primary key, FK to `delivery_obligations.delivery_id`
- `target_run_count` `Integer`, nullable
- `dispatcher_owner` `String(128)`, nullable
- `tracking_provider` `String(64)`, nullable
- `tracking_policy` `String(64)`, nullable
- `default_carrier_name` `String(120)`, nullable
- `default_carrier_name_source` `String(32)`, not null
- `default_external_carrier_reference` `String(120)`, nullable
- `default_external_carrier_reference_source` `String(32)`, not null
- `equipment_type` `String(60)`, nullable
- `equipment_type_source` `String(32)`, not null
- `origin_geofence_code` `String(64)`, nullable
- `origin_geofence_code_source` `String(32)`, not null
- `destination_geofence_code` `String(64)`, nullable
- `destination_geofence_code_source` `String(32)`, not null
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

Notes:

- broad desk defaults belong here
- precise appointment windows belong on `delivery_truck_stops`
- this table should only be populated when `transport_mode = TRUCK`

## 2. `delivery_truck_movements`

This is the core truck-run table.

Recommended columns:

- `movement_id` `String(96)` primary key
- `delivery_id` `String(96)` FK to `delivery_obligations.delivery_id`, indexed
- `sequence_no` `Integer`, not null
- `status` `String(32)`, not null
- `planned_quantity` `Numeric(18, 6)`, nullable
- `planned_unit_of_measure` `String(20)`, nullable
- `carrier_name` `String(120)`, nullable
- `carrier_name_source` `String(32)`, not null
- `external_carrier_reference` `String(120)`, nullable
- `external_carrier_reference_source` `String(32)`, not null
- `dispatcher_owner` `String(128)`, nullable
- `dispatcher_owner_source` `String(32)`, not null
- `driver_name` `String(120)`, nullable
- `driver_name_source` `String(32)`, not null
- `driver_phone` `String(40)`, nullable
- `driver_phone_source` `String(32)`, not null
- `tractor_reference` `String(120)`, nullable
- `tractor_reference_source` `String(32)`, not null
- `trailer_reference` `String(120)`, nullable
- `trailer_reference_source` `String(32)`, not null
- `external_load_reference` `String(120)`, nullable
- `external_load_reference_source` `String(32)`, not null
- `bill_of_lading_number` `String(120)`, nullable
- `bill_of_lading_number_source` `String(32)`, not null
- `truck_ticket_number` `String(120)`, nullable
- `truck_ticket_number_source` `String(32)`, not null
- `current_stop_sequence` `Integer`, nullable
- `current_location_code` `String(50)`, nullable
- `last_signal_at` `DateTime(timezone=True)`, nullable
- `current_eta_at_destination` `DateTime(timezone=True)`, nullable
- `hold_reason_code` `String(64)`, nullable
- `hold_reason_code_source` `String(32)`, not null
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

Recommended constraints and indexes:

- unique: `delivery_id, sequence_no`
- index: `delivery_id, status`
- index: `external_load_reference`
- index: `carrier_name`

Design notes:

- `movement_id` should be a stable external-facing identifier, not a hidden
  integer surrogate
- `current_stop_sequence` is a denormalized progress pointer owned by the
  service layer
- source columns should exist for mutable business fields that may later be
  overlaid by synced evidence

## 3. `delivery_truck_stops`

This is the ordered stop table under one truck movement.

Recommended columns:

- `stop_id` `String(96)` primary key
- `movement_id` `String(96)` FK to `delivery_truck_movements.movement_id`,
  indexed
- `stop_sequence` `Integer`, not null
- `stop_type` `String(32)`, not null
- `status` `String(32)`, not null
- `location_code` `String(50)`, nullable
- `location_code_source` `String(32)`, not null
- `planned_arrival_start` `DateTime(timezone=True)`, nullable
- `planned_arrival_end` `DateTime(timezone=True)`, nullable
- `planned_departure_start` `DateTime(timezone=True)`, nullable
- `planned_departure_end` `DateTime(timezone=True)`, nullable
- `appointment_reference` `String(120)`, nullable
- `appointment_reference_source` `String(32)`, not null
- `planned_quantity` `Numeric(18, 6)`, nullable
- `actual_quantity` `Numeric(18, 6)`, nullable
- `actual_arrived_at` `DateTime(timezone=True)`, nullable
- `actual_departed_at` `DateTime(timezone=True)`, nullable
- `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

Recommended constraints and indexes:

- unique: `movement_id, stop_sequence`
- index: `movement_id, status`
- index: `location_code`

Design notes:

- stop sequencing is the main structural guarantee for multi-stop support
- actual arrival and departure times are owned by accepted operations state, not
  by raw signal ingest alone

## 4. `delivery_tracking_signals`

This is an append-only normalized evidence ledger.

Recommended columns:

- `signal_id` `BigInteger` primary key or equivalent auto-increment identity
- `delivery_id` `String(96)`, nullable, indexed
- `movement_id` `String(96)`, nullable, indexed
- `stop_id` `String(96)`, nullable, indexed
- `source_system` `String(64)`, not null
- `source_event_id` `String(128)`, nullable
- `signal_type` `String(64)`, not null
- `occurred_at` `DateTime(timezone=True)`, not null
- `received_at` `DateTime(timezone=True)`, not null
- `latitude` `Numeric(12, 8)`, nullable
- `longitude` `Numeric(12, 8)`, nullable
- `location_code` `String(50)`, nullable
- `external_status` `String(64)`, nullable
- `normalized_status` `String(64)`, nullable
- `match_confidence` `Numeric(6, 4)`, nullable
- `dedupe_key` `String(160)`, not null
- `processing_status` `String(32)`, not null
- `processing_error` `String(2000)`, nullable
- `raw_payload` `JSONB`, not null

Recommended constraints and indexes:

- unique: `dedupe_key`
- index: `source_system, source_event_id`
- index: `movement_id, occurred_at`
- index: `delivery_id, occurred_at`

Design notes:

- `movement_id` and `stop_id` must remain nullable so unresolved evidence can
  be stored without unsafe matching
- this table belongs to the truck slice now even though the first operational
  contract is still manual updates, because later ingest should not have to
  redesign the schema

## Output Schema Direction

Near-term Pydantic additions should live in `apps/api/app/schemas/shipment.py`.

Recommended output models:

- `DeliveryTruckDetailOut`
- `DeliveryTruckStopOut`
- `DeliveryTruckMovementSummaryOut`
- `DeliveryTruckMovementOut`
- `DeliveryTrackingSignalOut`

Recommended write models:

- `DeliveryTruckDetailUpdate`
- `DeliveryTruckMovementCreate`
- `DeliveryTruckMovementUpdate`
- `DeliveryTruckMovementCancelWrite`
- `DeliveryTruckStopCreate`
- `DeliveryTruckStopUpdate`
- `DeliveryTruckStopSkipWrite`
- `DeliveryTruckStopCancelWrite`

Recommended embedding direction:

- extend `DeliveryObligationOut` with:
  - `truck_detail: Optional[DeliveryTruckDetailOut]`
  - `truck_movement_count: int`
  - `active_truck_movement_count: int`
- do not embed full movement and stop trees into the default delivery list
  response in the first pass
- use dedicated movement endpoints for full run and stop detail

This keeps the current list routes usable while allowing the shipment workspace
to drill into the truck slice deliberately.

## Route Direction

Truck-specific delivery patching should stay under `deliveries.py`.
Movement and stop resources should live under a dedicated operations route file
such as `domains/operations/routes/truck_tracking.py`.

Recommended first route surface:

- `PATCH /deliveries/{delivery_id}/truck-details`
- `GET /deliveries/{delivery_id}/truck-movements`
- `POST /deliveries/{delivery_id}/truck-movements`
- `GET /truck-movements/{movement_id}`
- `PATCH /truck-movements/{movement_id}`
- `POST /truck-movements/{movement_id}/cancel`
- `POST /truck-movements/{movement_id}/stops`
- `PATCH /truck-stops/{stop_id}`
- `POST /truck-stops/{stop_id}/skip`
- `POST /truck-stops/{stop_id}/cancel`

Route ownership rules:

- business-facing create, patch, skip, and cancel routes belong to
  `operations`
- provider or webhook ingest routes do not belong here
- later tracking ingest should use integration routes and deterministic
  services, not patch business records directly

## Service Ownership

Recommended near-term service split:

- `shipments.py`
  delivery-owned patch behavior that returns `DeliveryObligationOut`
- `truck_tracking.py`
  movement and stop create, update, list, skip, and cancel behavior

Recommended service responsibilities:

- validate that truck detail and movement writes are only valid when the
  delivery transport mode is `TRUCK`
- enforce stop sequencing invariants from `WP-01`
- maintain `current_stop_sequence`, movement status, and version increments
- preserve manual field-source semantics across future resync paths

## Suggested Migration Order

1. add new SQLAlchemy models and Alembic migration for:
   - `delivery_truck_details`
   - `delivery_truck_movements`
   - `delivery_truck_stops`
   - `delivery_tracking_signals`
2. extend `shipment.py` with truck detail and movement/stop schemas
3. add route scaffolding and service stubs for:
   - delivery truck details
   - truck movement list/create/get/patch/cancel
   - truck stop create/patch/skip/cancel
4. extend delivery serializers with truck summary counts only
5. leave provider-authenticated ingest routes for `TTS-03`

This order gives the team additive scaffolding without forcing UI work or
external feeds into the same package.

## Explicit Non-Goals

`TTS-02` should not:

- define provider-specific payload mappings
- implement ETA, dwell, or milestone projection rules
- define document-linkage readiness logic
- turn tracking-signal ingest into business-state mutation
- flatten truck-specific state into freeform delivery notes

## Acceptance Criteria

`TTS-02` is done when:

- the four main truck tables are defined clearly enough for migration work
- near-term placement matches the repo's actual additive seams
- route ownership between `deliveries`, truck business resources, and future
  integration ingest is explicit
- `shipment.py` extension direction is clear
- follow-on implementation can build schema and route code without reopening the
  core scaffolding assumptions

## Verification

- docs review
- schema and route proposal walkthrough
