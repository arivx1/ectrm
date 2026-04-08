# Scheduling UI Design Review

## Goal

Define a scheduling workspace that works for:

- liquids and other discrete logistics movements
- gas and other network-flow scheduling
- power and interval-based scheduling

And review the current implementation against that target.

## What A Good Scheduling UI Must Optimize For

A good scheduler screen is not just a filtered list of trades. It is a workbench for turning commercial obligations into executable physical instructions while keeping timing risk and execution exceptions visible.

Across commodities, the universal scheduler questions are:

1. What needs action next?
2. What deadline or delivery window is at risk?
3. What quantity has been requested, confirmed, and executed?
4. What dependency is blocking execution?
5. Who owns the next move?

That gives us a cross-commodity scheduling model built around five shared axes:

- time: operational day, cycle, interval, live/next/later
- stage: unscheduled, ready, submitted, acknowledged, executed, actualized
- route or asset context: location pair, path, transport, grid, terminal, vessel, pipeline
- quantity state: target, scheduled, confirmed, actualized
- exception state: missing data, commercial hold, operational rejection, imbalance, measurement gap

## Proposed Product Model

### 1. The primary object should be a schedule obligation, not just a trade row

The scheduler should work on a schedule obligation that can sit below a trade or leg and above downstream actualization. That object should support:

- trade linkage: trade, leg, book, portfolio, counterparty
- commodity context: commodity class, commodity, unit, pricing context
- operational context: from location, to location, transport service, asset or path, balancing area or ISO
- time context: operational day, cycle, interval bucket, start/end window
- execution state: requested quantity, scheduled quantity, confirmed quantity, actualized quantity
- scheduler workflow: schedule status, owner, deadline, external reference, exception code

This keeps the UI shared while letting each commodity add metadata without breaking the top-level interaction model.

### 2. The workspace should have one shared shell and three adaptive views

The outer shell should stay consistent:

- command bar
- KPI strip
- central work queue
- time-aware board
- exception panel
- detail drawer

The detail inside those modules should adapt by schedule shape:

- logistics view: movements, assets, load/discharge windows, docs, tenders, nominations
- network-flow view: path, receipt/delivery points, cycle deadlines, submitted vs confirmed quantities, imbalance risk
- power view: day/hour interval completeness, tag status, ISO or balancing area context, profile shape, meter or settlement follow-up

### 3. The top command bar should filter by scheduler concerns, not just commodity mode

Recommended top-bar filters:

- operational date
- owner
- stage
- exception severity
- commodity family
- transport or service type
- counterparty
- location, path, or balancing area
- book or portfolio
- unscheduled only
- partially confirmed only

Current mode-family filtering is still useful, but it should be secondary.

### 4. The main queue should be stage-oriented

The default center-left queue should group obligations by stage:

- due now
- ready to submit
- submitted awaiting acknowledgement
- partially scheduled
- executed awaiting actualization
- blocked

Each row should show:

- schedule reference
- trade or leg reference
- commodity and route context
- target quantity and confirmed quantity
- operational date or cycle
- owner
- next deadline
- top exception

This is the fastest layout for mixed desks because schedulers usually act by stage and timing before they act by commodity.

### 5. The board should be time-native

Schedulers need a board that respects how the commodity actually moves:

- liquids: day/window board with load-discharge sequence
- gas: cycle board by path or pipeline
- power: day/hour grid with interval completeness and tag status

The screen should not force one visual metaphor for all commodities. It should keep one shell and swap the central board module.

### 6. The right-side detail drawer should be operational, not descriptive

When a row is selected, the drawer should answer:

- what exactly is missing
- what can be edited now
- what was last submitted
- what external acknowledgement exists
- what documents or exceptions are attached
- what the next deadline is

Recommended drawer sections:

- summary
- quantities
- route or asset
- workflow and external references
- exceptions
- activity log

### 7. The workspace needs bulk action paths

Schedulers rarely work one row at a time all day. The UI should support:

- assign owner in bulk
- set due date in bulk
- mark schedule submitted
- mark acknowledgement received
- export or copy a schedule packet
- filter to a batch and work it as a set

## Commodity-Specific Behavior

### Liquids

Liquids scheduling usually needs:

- movement identity
- load and discharge location
- transport asset or movement type
- incoterm or title-transfer context
- nomination and allocation workflow
- shipment document readiness

The board should emphasize movements and windows.

### Gas

Gas scheduling usually needs:

- receipt and delivery points
- pipeline or transporter
- cycle deadline
- nominated quantity versus confirmed quantity
- imbalance or cut risk
- upstream and downstream dependency awareness

The board should emphasize path plus cycle.

### Power

Power scheduling usually needs:

- delivery day and interval profile
- market or balancing area context
- scheduled MW or MWh completeness
- tag or interchange status
- interval-level exceptions
- actuals and settlement follow-up

The board should emphasize interval completeness, not just date windows.

## Review Of What We Have Today

## Strengths

The current implementation already has a few solid foundations:

- a dedicated scheduling workspace instead of burying scheduling inside a generic operations screen
- explicit recognition that logistics, network flow, and power schedules are different shapes
- a useful exception queue
- near-term window awareness
- visible data-gap and workflow-gap callouts

Those are good primitives. The current surface is not wrong; it is just still closer to a scheduling dashboard than a scheduler execution console.

## Gaps

### Gap 1: the data model is too trade-centric for real scheduling work

Current delivery rows only expose:

- one location field
- one delivery start and end window
- one volume
- generic confirmation, nomination, and allocation statuses
- a blocker list

That is enough for a generalized delivery board, but not enough for a serious scheduler workbench across liquids, gas, and power.

Missing fields for a stronger scheduling UI include:

- from and to location
- asset, path, or service provider
- schedule owner
- schedule deadline
- schedule status distinct from nomination status
- scheduled, confirmed, and actualized quantities
- external schedule references or acknowledgements
- operational day, cycle, or interval granularity
- commodity-specific metadata

### Gap 2: commodity classification is too coarse

Current classification reduces everything to three families by commodity class or unit:

- `LOGISTICS`
- `NETWORK_FLOW`
- `POWER_SCHEDULE`

That is a useful start, but it is too coarse to drive the right operational experience for all commodities. It does not distinguish:

- truck versus marine versus storage-heavy liquids workflows
- gas path and cycle complexity
- hourly versus block power schedules

### Gap 3: the current UI organizes primarily by mode and generic readiness, not by operational stage

The existing workspace is optimized around:

- mode focus
- due soon
- blocked
- ready to schedule

That works for awareness, but not for throughput. Schedulers usually need a queue by stage and deadline first, then mode second.

### Gap 4: the current board is not truly time-native for gas or power

The current window board is still fundamentally a card list of delivery windows. That works for logistics. It is much weaker for:

- gas cycles and nomination cutoffs
- power interval completeness and tagging

Power and gas need the central board to express cycle and interval state directly.

### Gap 5: the editable workflow surface lives outside the scheduling workspace

The actual editable workflow tooling is in operations. The scheduling workspace is currently read-oriented and can open the trade, but it does not let the scheduler work the queue in place.

That split is manageable at small scale, but it will make mixed-commodity scheduling slower because the scheduler must mentally bridge:

- scheduling board
- operations queue
- trade detail

## Recommended UI Architecture

## Shared shell

### Top strip

- operational date selector
- saved views
- commodity and route filters
- owner filter
- stage filter
- exception filter
- search

### KPI strip

- due this cycle or today
- unscheduled
- submitted awaiting ack
- partially confirmed
- actualization gaps
- blocked

### Center-left queue

Grouped by stage with sortable deadlines.

### Center board

Adaptive board:

- logistics timeline
- gas cycle board
- power interval board

### Right drawer

Selected schedule details and next actions.

## Initial screen layout recommendation

For the first strong version in this repo:

1. Keep the top summary and exception concepts.
2. Replace mode-first navigation with stage-first navigation.
3. Keep mode-family as a secondary segment or chip filter.
4. Add an interactive selected-row detail panel.
5. Bring basic workflow editing into the scheduling workspace.
6. Introduce a board module that can switch between:
   - window board
   - cycle board
   - interval board

## Recommended Build Order

### Phase 1: improve the current UI with existing data

- keep the current projection
- make stage the primary grouping
- add selected-row detail drawer
- add inline ownership and due-date edits
- add saved filters for common scheduler views
- keep mode-family as a secondary lens

This is the highest-value near-term step.

### Phase 2: extend the scheduling projection

Add fields for:

- schedule owner
- deadline
- route context
- separate schedule status
- scheduled and confirmed quantity
- operational day and cycle or interval markers

This unlocks a materially better mixed-commodity board without requiring full commodity-specific workflows yet.

### Phase 3: add commodity-native board modules

- liquids movement board
- gas cycle board
- power interval board

### Phase 4: add bulk actions and activity history

- batch ownership
- batch submission
- acknowledgement tracking
- schedule activity log

## Code Review Notes Against Today

These are the specific areas that best explain today’s limits:

- `apps/api/app/schemas/shipment.py`
  The delivery payload is intentionally small and has no schedule-specific fields beyond generic statuses.

- `apps/api/app/domains/operations/services/shipments.py`
  Classification is heuristic and blocker logic is mostly generic trade workflow logic, not commodity-native schedule logic.

- `apps/web/src/workspaces/scheduling/SchedulingWorkspace.tsx`
  The screen is mode- and awareness-oriented, with no editable scheduling workbench or selected-row detail model.

- `apps/web/src/workspaces/operations/WorkflowQueueEditor.tsx`
  The editable workflow controls exist, but they live in operations rather than in scheduling.

## Bottom Line

Today’s scheduling UI is a good generalized scheduling dashboard.

It is not yet a strong all-commodities scheduler console because it lacks:

- a schedule-obligation data model
- stage-first queueing
- commodity-native board modules
- in-workspace editing and batch actions
- gas- and power-specific time structures

The best next move is not a full rewrite. It is:

1. reshape the scheduling workspace around stage and deadline
2. pull lightweight editing into scheduling
3. extend the delivery projection with schedule-native fields
4. then add commodity-specific board modules
