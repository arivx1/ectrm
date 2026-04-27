# Governed Core Trade Command Model

## Purpose

This document fulfills `GCP-03` from the
[Governed Core Platform Work Packages](./core-platform-work-packages.md). It
defines the first explicit trade command model for the locked governed-core
slice so ECTRM can move from event-shaped public writes toward command-owned
business mutations.

The core idea is:

- commands are the public write contract
- events are the internal business record

The repo should keep the event store and projection pattern, but the UI,
assistants, scripts, and future automation should stop treating raw
`TradeCreated`, `TradeAmended`, and `TradeCancelled` payloads as the canonical
public mutation interface.

## Related Docs

- [Governed Core Platform Roadmap](./core-platform-roadmap.md)
- [Governed Core Platform Slice Lock](./core-platform-slice-lock.md)
- [Governed Core Platform Boundary Reset](./core-platform-boundary-reset.md)
- [Governed Core Platform Work Packages](./core-platform-work-packages.md)
- [Platform Blueprint](./platform-blueprint.md)
- [ADR 0002: V2 Application Architecture And Canonical Domain Boundaries](../adr/0002-v2-application-architecture.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)

## Current Repo Starting Point

Today the trade write path is event-shaped:

- the web app posts trade lifecycle mutations to `/events`
- the request body carries `event_type` plus a freeform trade payload
- `append_domain_event` writes the event and immediately applies trade
  projection logic
- `apply_trade_event` in
  `apps/api/app/domains/trading/services/trade_event_application.py`
  performs the real validation and mutation semantics

Current anchors:

- `apps/web/src/entities/trade/api.ts`
- `apps/web/src/entities/app/useAppTradeActions.ts`
- `apps/api/app/routes/events.py`
- `apps/api/app/domains/trading/services/event_writes.py`
- `apps/api/app/domains/trading/services/trade_event_application.py`

This has been a good prototype seam because it kept the event store central.
The next phase needs a stronger boundary:

- event payloads are too close to becoming the public write API
- stale-state and expected-version semantics are not first-class in the
  transport contract
- the route does not distinguish command intent from event persistence
- downstream surfaces can be tempted to append business events directly instead
  of going through one owning service

## Command Goal

For the governed-core slice, ECTRM should treat trade writes as explicit
business commands that:

- are named by intent
- validate synchronously before any event is appended
- carry stale-state and provenance metadata
- produce one or more business events as the durable record
- can be reused by routes, scripts, assistants, bulk tools, and future
  automation through the same application service seam

## Design Rules

1. Commands express business intent, not storage mechanics.
   `BookTrade` is a command. `TradeCreated` is an event.

2. Commands are validated before events are written.
   Reference-data checks, policy checks, measurement rules, date rules, and
   credit posture checks belong in command handling.

3. The event store remains the durable record.
   A successful command appends the appropriate business event and then lets the
   projection model update from that record.

4. Commands must carry stale-state context where mutation safety requires it.
   Amend, cancel, and correct paths should not silently overwrite newer state.

5. Compatibility event routes are temporary.
   The existing `/events` path can remain as a compatibility adapter during the
   migration, but it should call the same command-owned service layer rather
   than remain the source of truth for write semantics.

## Locked Slice Scope

This command model is scoped first to the locked product family from
[Governed Core Platform Slice Lock](./core-platform-slice-lock.md):

- single-leg
- fixed-price
- physical
- natural gas
- reference-coded book, portfolio, counterparty, location, commodity, unit,
  currency, and price unit

The command shapes below deliberately match the repo's current field names such
as `book`, `commodity`, `portfolio`, and `counterparty` so the first step does
not create avoidable drift. A later migration can promote those to explicit
`*_code` names once the broader trade and projection contracts are ready.

## Target Command Envelope

Every trade command should carry a stable envelope around the domain-specific
payload.

Recommended minimum fields:

| Field | Purpose |
| --- | --- |
| `command_id` | Stable idempotency and audit key for the write request. |
| `command_type` | Business intent such as `BookTrade` or `CancelTrade`. |
| `aggregate_type` | `trade` for this slice. |
| `aggregate_id` | Target `trade_id`. |
| `actor_id` | Human or delegated actor identity. |
| `source_surface` | UI, assistant action review, script, import job, or other caller. |
| `requested_at` | Request timestamp. |
| `correlation_id` | Cross-surface tracing identifier. |
| `causation_id` | Upstream trigger when relevant. |
| `expected_last_event_id` | Stale-state guard for amend, cancel, and correct flows. |
| `policy_snapshot_id` | Deterministic policy version when needed for high-trust actions. |
| `reference_snapshot_id` | Optional future hook when reference-data snapshotting becomes explicit. |
| `payload` | Typed command body. |

The current repo does not yet persist every one of these fields as first-class
columns. The governed-core phase should still define them now so command
transport, audit capture, and future event-envelope work converge on one shape.

## First Command Catalog

The first catalog for the governed-core slice is:

1. `BookTrade`
2. `AmendTradeTerms`
3. `CancelTrade`
4. `CorrectTrade`

These names are intentionally business-oriented. They are the command layer
above today's `TradeCreated`, `TradeAmended`, and `TradeCancelled` events.

## Command Definitions

### 1. `BookTrade`

Business intent:

- create the first governed trade record for the locked slice

Initial command payload for the slice:

- `trade_id`
- `book`
- `portfolio`
- `counterparty`
- `commodity_class`
- `commodity`
- `location_code`
- `unit_of_measure`
- `trade_currency_code`
- `price_unit_code`
- `trade_nature`
- `trade_structure`
- `instrument_type`
- `trade_side`
- `pricing_type`
- `price`
- `volume`
- optional operational dates and metadata already supported by the repo:
  `execution_timestamp`, `trade_date`, `effective_start_date`,
  `effective_end_date`, `delivery_start`, `delivery_end`, `quality_spec`,
  `source_system`, `external_trade_id`, `trader_user`
- optional pre-trade linkage already supported by the repo:
  `pretrade_review_id`, `pretrade_recommendation_run_id`

Initial stale-state rule:

- `trade_id` must not already exist

Initial validation ownership:

- reference-data validity
- measurement and date-range rules
- pricing-type rules
- trade metadata defaults
- counterparty credit block checks
- human booking ownership and permission checks

Event mapping:

- successful `BookTrade` emits `TradeCreated`

### 2. `AmendTradeTerms`

Business intent:

- change mutable trade terms for an existing active trade in a governed way

Initial command payload for the slice:

- `trade_id`
- `expected_last_event_id`
- changed fields only from the currently supported amend surface
- optional `amend_reason`

Initial stale-state rule:

- target trade must exist
- target trade must still be `ACTIVE`
- target trade `last_event_id` must match `expected_last_event_id`

Initial validation ownership:

- active-reference validation for any changed coded fields
- measurement and date-range revalidation for changed fields
- portfolio/book consistency
- counterparty credit block recheck when economic inputs changed
- policy and permission checks for who may amend

Event mapping:

- successful `AmendTradeTerms` emits `TradeAmended`

### 3. `CancelTrade`

Business intent:

- cancel an active trade through a typed lifecycle action

Initial command payload for the slice:

- `trade_id`
- `expected_last_event_id`
- `cancellation_reason`

Initial stale-state rule:

- target trade must exist
- target trade must still be `ACTIVE`
- target trade `last_event_id` must match `expected_last_event_id`

Initial validation ownership:

- cancellation eligibility for the current status
- policy and reviewer eligibility
- downstream blocker checks if later policy introduces them

Event mapping:

- successful `CancelTrade` emits `TradeCancelled`

### 4. `CorrectTrade`

Business intent:

- fix an earlier incorrect trade state in an auditable correction path rather
  than encouraging ad hoc overwrite behavior

Initial command payload for the slice:

- `trade_id`
- `expected_last_event_id`
- `corrected_fields`
- `correction_reason`
- `corrects_event_id`

Initial stale-state rule:

- target trade must exist
- target trade `last_event_id` must match `expected_last_event_id`
- `corrects_event_id` must resolve to a known prior trade event

Initial validation ownership:

- same field-level validations as amend for affected fields
- explicit correction rationale requirement
- policy checks for who may perform a correction

Compatibility note:

- the current repo does not yet have a dedicated `TradeCorrected` event type
  wired into projection application. Until that lands, `CorrectTrade` should be
  treated as a planned command shape whose first implementation may temporarily
  map into `TradeAmended` plus correction metadata. The long-term target is a
  distinct correction event and clearer reversal lineage.

## Route And Service Strategy

The command service is the canonical seam. Route shape is secondary.

Recommended target:

- one typed trade-command application service under the trading domain
- thin HTTP routes that translate transport payloads into commands
- compatibility support for the current `/events` route during migration

Recommended future route shapes:

- `POST /trades/commands/book`
- `POST /trades/{trade_id}/commands/amend`
- `POST /trades/{trade_id}/commands/cancel`
- `POST /trades/{trade_id}/commands/correct`

Migration rule:

- do not let new callers append raw trade lifecycle events directly when a
  command service exists for the same business intent

## Validation Ownership

For the locked slice, the command layer should own synchronous validation for:

- active book, portfolio, counterparty, location, commodity, unit, currency,
  and price-unit checks
- trade metadata defaults and vocabulary alignment
- pricing-type requirements
- date-range validity
- trade-structure and measurement rules
- counterparty credit block checks
- permission and policy eligibility
- stale-state expectations

The event layer should not become the only place those rules exist.

## Command-To-Event Mapping Table

| Command | Current compatibility event | Notes |
| --- | --- | --- |
| `BookTrade` | `TradeCreated` | First-class create path for the slice. |
| `AmendTradeTerms` | `TradeAmended` | Requires expected last-event guard. |
| `CancelTrade` | `TradeCancelled` | Requires active-status and expected last-event guard. |
| `CorrectTrade` | `TradeAmended` with correction metadata initially, then `TradeCorrected` later | Transitional compatibility path only. |

## Stale-State Expectations

The first governed-core command model should make stale-state a first-class
concern:

- create paths guard on non-existence of `trade_id`
- amend, cancel, and correct paths guard on `expected_last_event_id`
- reviewer or assistant-staged downstream actions should continue to re-read
  current trade state before execution
- command failures caused by stale state should be explicit and user-visible,
  not silent overwrites

This aligns the trade write path with the stale-state posture already required
for assistant action requests.

## Current-To-Target Migration

### Stage 1: Command documentation and compatibility adapter

- define the command catalog and envelope
- keep the current `/events` route working
- route existing create, amend, and cancel UI calls through a compatibility
  adapter that maps event-shaped requests into command handling

### Stage 2: Command service becomes canonical

- add explicit command handlers in the trading domain
- centralize validation in those handlers
- make event writing an internal step of command execution

### Stage 3: Dedicated transport contracts

- expose explicit trade-command routes
- migrate the web app away from direct event-type write semantics
- keep `/events` for read and compatibility scenarios only where justified

### Stage 4: Event-envelope hardening

- align command metadata with the broader business-event envelope work from
  `GCP-04`
- record `command_id`, expected-version context, and policy metadata
  consistently in audit-safe seams

## Out Of Scope For This Command Model

- swap or multi-leg command depth beyond documenting future direction
- option lifecycle redesign
- a full generic workflow engine
- replacing every historical event path immediately
- a dedicated correction-event implementation in the same package
- bulk import command orchestration beyond reusing the same service later

## Exit Criteria For GCP-03

`GCP-03` is complete when:

- the first command catalog is explicit and grounded in the locked slice
- the repo has a canonical command envelope and stale-state expectations
- trade writes have a named target service seam above raw event append calls
- create, amend, cancel, and planned correction paths no longer rely on
  undocumented event payload semantics
- follow-on implementation work can wire API tests and UI changes against the
  command model instead of re-deciding write intent each time

## Implications For The Next Packages

- `GCP-04` should add the event metadata needed so command provenance and event
  provenance stay aligned
- `GCP-05` should expose the projection freshness and `last_event_id` semantics
  that make stale-state enforcement visible
- `GCP-07` should provide the deterministic policy seam the command handlers
  call instead of scattering permission logic
- `GCP-11` should reuse these same stale-state and idempotency expectations when
  action requests stage downstream trade mutations
