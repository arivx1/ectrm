# Rail Delivery Schema

## Purpose

This note defines the first durable schema slice for rail-specific delivery
detail in the scheduling and shipments domain.

The goal is to avoid overloading generic logistics fields with every rail
concept while still keeping delivery writes behind the existing typed shipment
service.

## Placement

Rail delivery detail extends the existing delivery model instead of replacing
it:

- `delivery_obligations` remains the canonical delivery work object
- `delivery_logistics_details` keeps shared discrete-movement fields such as:
  - origin and destination location codes
  - carrier name and carrier reference
  - asset reference and equipment type
  - load and discharge references
- `delivery_rail_details` carries rail-only execution fields that are durable
  enough to deserve typed schema

This keeps the top-level delivery board shared while allowing rail obligations
to accumulate specific operational detail.

## First-Cut Fields

`delivery_rail_details` is a one-row-per-delivery audited extension keyed by
`delivery_id`.

Included fields:

- `origin_station_code`
- `destination_station_code`
- `waybill_reference`
- `release_number`
- `unit_train_id`
- `railcar_count`
- standard audit and source fields:
  - `created_at`, `created_by`, `updated_at`, `updated_by`, `version`
  - `<field>_source` for each mutable business field

## API Contract

The first backend contract exposes rail detail through the delivery payload and
through a dedicated patch path:

- `PATCH /deliveries/{delivery_id}/rail-details`

Guardrails:

- rail detail is only valid when the delivery is still in `LOGISTICS`
  mode-family and the explicit transport mode is `RAIL`
- writes stay in the shipment application service
- manual field sources are preserved across delivery resync

## Reference Data Anchors

Rail reference data now has a first backend shape alongside the delivery
extension:

- `reference_rail_lines` stores reusable rail corridor or subdivision headers
- `reference_rail_routes` stores schedulable origin/destination paths under a
  rail line

The delivery projection now binds each rail movement to a selected
`rail_route_code` on `delivery_rail_details` and derives `rail_line_code`,
`railroad_code`, route direction, scheduling timezone, service calendar, local
cutoff times, and starter free-time windows from the reference hierarchy at
read time. The route binding remains audited at the delivery level, while
corridor ownership, lane definitions, and route operating clocks stay curated
in reference data.

## How This Helps Scheduling

Rail scheduling needs two different layers of truth:

1. reusable lane context
   - which railroad or corridor is being used
   - which recurring origin/destination lane the scheduler intends to work
   - which timezone and route vocabulary the desk should use
2. movement-specific execution detail
   - which station pair the movement actually used
   - which waybill and release were issued
   - which unit train or car-count summary belongs to this movement

The current split is useful because it matches that operating reality:

- `reference_rail_lines` and `reference_rail_routes` give the desk a curated
  lane catalog for filters, defaults, and shared naming
- `delivery_rail_details` keeps the movement-specific facts that should stay
  editable and audited at the delivery-obligation level

That means schedulers do not need to keep retyping the same corridor and route
context on every obligation, but they also do not have to bend reference data
into holding per-shipment execution artifacts.

The new service-clock fields add a third layer that still belongs with the
reusable route definition rather than the shipment:

- which service calendar determines whether the lane is notionally open
- which local placement and release cutoffs define the route's operating day
- which starter free-time assumptions the desk should use before a more exact
  facility-specific demurrage model exists

## What Makes The Current Slice Operationally Useful

The current schema is already enough to improve a shared scheduling board in
three practical ways:

- queue filtering and ownership:
  rail lines and routes give schedulers a stable way to group obligations by
  corridor, railroad, or recurring lane instead of freeform notes
- route-aware detail entry:
  rail detail keeps station, waybill, release, and unit-train fields typed so
  the board can show what is still missing before or after scheduling activity
- blocker explanation:
  the system now has explicit fields it can reason over when explaining why a
  rail movement is still only watchlist-ready versus truly schedulable,
  including route selection, missing stations, route-location mismatch, and
  post-nomination waybill gaps

## Implemented Rail Scheduling Slice

The current backend scheduling slice stays inside the existing shared delivery
object instead of creating a parallel rail-only work object.

### 1. Bind each rail obligation to a curated route

Each rail delivery now binds to `rail_route_code` on
`delivery_rail_details`, and the projection derives the rail line through the
reference relationship.

That gives the scheduler one selected lane for:

- board filters such as railroad, line, route, origin, and destination
- default station or timezone suggestions
- validation that delivery-level stations are consistent with the chosen route

`rail_route_code` remains the authoritative binding field. `rail_line_code`
stays derived unless later performance or denormalized reporting needs justify
storing both.

### 2. Derive rail readiness and blockers deterministically

Rail scheduling becomes meaningfully better once readiness stops depending on
freeform operator memory and starts using typed checks. The first implemented
blockers are:

- route not selected
- origin or destination station missing
- origin or destination location mismatch against the selected route
- waybill pending after a movement is marked submitted or nominated
- release number pending once a waybill is captured after scheduling starts
- railcar count missing when a unit-train identifier is present

These should feed the shared delivery scheduling projection and blocker list,
not a separate rail-only status framework.

### 3. Keep reusable lane data separate from execution evidence

The reference route should answer "what lane is this movement supposed to use?"

The delivery rail detail should answer "what happened on this specific
movement?"

That means these stay at the delivery level:

- waybill reference
- release number
- unit train id
- final station pair when it differs from the reference default
- movement-specific railcar count

If the desk later needs both planned and executed railcar counts, split those
into separate fields instead of overloading one value with mixed meaning.

### 4. Use delivery events for movement milestones

Route selection and missing-detail blockers should determine whether a movement
is ready to work. Delivery events should still be the audit trail for what
actually happened next.

For rail, the first likely event candidates are things like:

- released
- waybilled
- placed
- pulled
- arrived
- constructively placed

Those should remain event-history facts, not mutable status toggles.

### 5. Put reusable route clocks on the route, not the movement

The first operating-clock slice now lives on `reference_rail_routes`:

- `service_calendar_code`
- `placement_cutoff_time_local`
- `release_cutoff_time_local`
- `placement_free_time_hours`
- `release_free_time_hours`

Those fields are optional in this first pass so the desk can adopt them
incrementally, but they are still projected onto each selected rail delivery
as derived scheduling context.

That keeps the ownership boundary clear:

- route metadata answers "what operating clock do we usually schedule against
  on this lane?"
- delivery rail detail still answers "what happened on this movement?"

Do not copy these fields down into `delivery_rail_details` unless the product
later needs planned-versus-actual divergence tracking for cutoffs or free time.

## Suggested Phase Order

To keep rail scheduling useful without overbuilding:

1. expose the derived rail route clock in the scheduling workspace
2. use `service_calendar_code` plus local cutoff fields for cutoff-aware
   readiness and demurrage-risk projection
3. add rail milestone event conventions only after route-bound scheduling is
   stable

## Deferred On Purpose

The first cut does not try to model every rail artifact.

Still deferred:

- individual railcar records and car-level status history
- demurrage, switching, and other fee/economic records
- event-level rail milestone taxonomy beyond the shared delivery event model

If car-level identity or repeated per-car workflow becomes operationally
important, promote that into a child table such as
`delivery_railcars` instead of storing comma-separated identifiers in the
header row.

## Rail Map View Pattern

The first useful map slice keeps business reference data and drawable geometry
separate.

- `reference_rail_routes` stays the operational lane record that scheduling,
  validation, and delivery binding use.
- `reference_spatial_features` carries the drawable overlay geometry that the
  map can render and toggle independently.

That pattern is now implemented through `RAIL_ROUTE`-linked spatial features
seeded from the route catalog. Each seeded rail route gets one primary
straight-line overlay built from its origin and destination reference-location
coordinates.

This is intentionally a first-pass approximation:

- good enough to make rail lanes visible in the map workspace
- good enough to let operators toggle rail corridors without inventing a new
  map-only rail model
- not good enough to represent real track geometry or interchange complexity

If later product work needs higher fidelity, keep the same ownership split:

- route rows still own business meaning
- spatial features still own renderable geometry

Upgrade the geometry quality by replacing or supplementing the seeded
straight-line overlays instead of pushing GeoJSON directly onto the rail route
records.
