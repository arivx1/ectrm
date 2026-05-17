# Bloomberg-Style Market Terminal Work Packages

## Goal

Make meaningful progress toward a Bloomberg-style market terminal mode inside
ECTRM without cloning Bloomberg screen art or turning the product into a
separate application.

The target experience is:

- users can choose a denser, monitor-first shell that feels familiar to market
  terminal users
- the shell emphasizes search, saved layouts, quote or monitor boards, fast
  navigation, and multi-panel context
- the first slice stays grounded in ECTRM's current data model: trades,
  positions, events, deliveries, reports, messages, documents, price indices,
  and external market context
- business writes remain behind typed services, permissions, audit, and manual
  review paths

This is a familiarity and productivity program, not an attempt to replicate
vendor branding or proprietary product behavior.

## Primary Design Inputs

- [Trading UI Familiarity Reference](./trading-ui-familiarity-reference.md)
- [Market Terminal Operator Guide](./market-terminal-operator-guide.md)
- [Platform Blueprint](./platform-blueprint.md)
- [Prompt-First Operator Experience Work Packages](./prompt-first-operator-experience-work-packages.md)
- [Trader/Risk MVP Work Packages](./trader-risk-mvp-work-packages.md)
- [Trading Source Roadmap](./trading-source-roadmap.md)

## Implementation Status

Phase 1 is implemented and verified as a Bloomberg-style familiarity layer, not
a vendor clone. The shipped slice is a read, explain, navigate, and personalize
surface over existing ECTRM workspaces.

| Package | Status | Evidence |
| --- | --- | --- |
| MTERM-01 terminal shell and density mode | Implemented | User-selectable market terminal mode, persisted appearance preference, denser shell treatment, and Live Desk landing behavior. |
| MTERM-02 global command and search bar | Implemented | Terminal command bar supports workspace, trade, counterparty, commodity, price-index, and report routing with mutation verbs blocked. |
| MTERM-03 monitor presets and saved layouts | Implemented | Market Overview, Risk Board, and Operations Monitor presets reuse `TileLayout` and saved workspace layout state. |
| MTERM-04 market monitor board | Implemented | Live Desk includes terminal-style market strip, monitor board, cross-panel market, exposure, and operational signals. |
| MTERM-05 instrument brief and drill-down pages | Implemented | Supported market instruments and commodity classes open read-only contextual briefs from terminal search and dashboard tiles. |
| MTERM-06 desk headlines and attention stream | Implemented | Desk headlines blend market, pricing, operational, settlement, document, and message context with routeable source links. |
| MTERM-07 keyboard shortcuts and quick navigation | Implemented | Command, workspace, filter, tile, reset, and shortcut-reference shortcuts are available with conflict-aware handling. |
| MTERM-08 watchlists and alerts | Implemented | Live Desk watchlists serialize safely and evaluate typed price, stale data, exposure, pricing, and settlement alert rules. |
| MTERM-09 regression, assistant routing, and browser smoke coverage | Implemented | Focused web tests, Prompt Home fail-closed coverage, dashboard smoke, full web smoke, and assistant evals pass. |
| MTERM-CLOSEOUT release readiness | Implemented | Roadmap status, operator guide, and Wave 3 candidate backlog documented. |

## Current Repo Anchors

The first Bloomberg-style slice should extend existing seams before adding a
new app surface.

- App shell and route state: `apps/web/src/App.tsx`
- Primary navigation model: `apps/web/src/app/navigation.ts`
- Workspace registry and lazy loading:
  `apps/web/src/entities/app/workspaceRendererRegistry.tsx`
- Dashboard workspace and market tiles:
  `apps/web/src/workspaces/dashboard/DashboardWorkspace.tsx`
- Reports workspace: `apps/web/src/workspaces/reports/ReportsWorkspace.tsx`
- Messaging workspace: `apps/web/src/workspaces/messages/MessagingWorkspace.tsx`
- Document library workspace: `apps/web/src/workspaces/library/LibraryWorkspace.tsx`
- Tile layout engine: `apps/web/src/shared/ui/TileLayout.tsx`
- Personal layout client: `apps/web/src/entities/layouts/api.ts`
- Personal layout API: `apps/api/app/routes/layout_definitions.py`
- External data and market context routes:
  `apps/api/app/routes/external_data.py`

## Experience Principles

1. Emulate workflows, not branding.
   We want information density, keyboard-first movement, saved monitors, and
   fast drill-downs. We do not want copied logos, colors, icons, keyboard
   legends, or screen art.

2. Start as a mode, not a forked app.
   The first step should be a market terminal mode, preset, or workspace layer
   on top of the current shell and dashboard infrastructure.

3. Keep one domain model underneath.
   Terminal mode should not invent new meanings for trades, positions, reports,
   events, or approvals.

4. Read and route first, mutate later if ever.
   Bloomberg-style familiarity should begin with search, monitoring, explain,
   and navigation. Trade capture and business changes must continue through
   governed flows.

5. Design for multiple monitors and power users.
   Density, saved layouts, keyboard shortcuts, and fast context switching are
   part of the value proposition, not polish items.

## Authority Boundary

Phase 1 authority for this program is read, explain, navigate, and save
personal view preferences.

The market terminal mode may:

- open workspaces and route to focused records
- search for supported objects
- show derived market context, positions, reports, events, and desk attention
- save user-specific layout, density, and watchlist preferences

It may not:

- book, amend, cancel, approve, or settle trades directly
- submit orders to an exchange or broker
- send external commitments
- bypass action requests, permissions, stale-state checks, or audit

## Work Objects

| Work object | Status | Notes |
| --- | --- | --- |
| Terminal mode preference | Implemented | User-level choice for layout density and terminal-style navigation. |
| Workspace layout definition | Existing | Reuse the current personal layout API before adding anything heavier. |
| Monitor preset | Implemented | System-owned starting layouts such as Market Overview, Risk Board, and Operations Monitor. |
| Watchlist | Implemented | Saved list of price indices, commodity classes, and desk signals for the Live Desk. |
| Instrument brief | Implemented | Read-only drill-down object for a price index, commodity class, or market theme. |
| Alert definition | Implemented | Typed thresholds or status triggers for watchlists and attention cards. |
| Desk headline or attention item | Implemented | Unified stream built from market context, events, reports, docs, and messages. |

## Delivery Order

### Wave 0: Foundation For A Terminal Mode

1. MTERM-01 terminal shell and density mode - implemented
2. MTERM-02 global command and search bar - implemented
3. MTERM-03 monitor presets and saved layouts - implemented

### Wave 1: First Bloomberg-Style Operating Surface

4. MTERM-04 market monitor board - implemented
5. MTERM-05 instrument brief and drill-down pages - implemented
6. MTERM-06 desk headlines and attention stream - implemented

### Wave 2: Power-User Depth

7. MTERM-07 keyboard shortcuts and quick navigation - implemented
8. MTERM-08 watchlists and alerts - implemented
9. MTERM-09 regression, assistant routing, and browser smoke coverage - implemented

### Closeout

10. MTERM-CLOSEOUT release readiness - implemented

### Wave 3: Candidate Enhancements

These are intentionally candidates, not committed scope. They should be
selected after the Phase 1 terminal mode has been reviewed by operators.

1. MTERM-10 multi-monitor workspace sets
2. MTERM-11 expanded terminal command aliases and functions
3. MTERM-12 time-series, quote chart, and curve panels
4. MTERM-13 persistent alert delivery and notification routing
5. MTERM-14 deeper instrument analytics for curve, basis, volatility, and P&L

## Shared Definition Of Done

Each work package is done only when:

- the new terminal behavior reuses existing route, workspace, and business
  objects where possible
- terminal-mode actions cannot mutate business records outside governed flows
- manual fallback to the existing workspaces remains obvious
- dense layouts still work on a standard laptop viewport and large monitors
- saved user preferences fail closed when the underlying workspace changes
- focused tests cover the new client-side contract or rendering behavior
- browser smoke or assistant eval coverage is added when route or prompt-led
  behavior changes
- docs are updated when the user workflow or operating model changes

## MTERM-01: Terminal Shell And Density Mode

### Status

Implemented.

### Priority

P0

### Outcome

ECTRM has a user-selectable market terminal mode that makes the shell denser,
reduces oversized onboarding chrome, and makes dashboard-style monitoring a
first-class landing option.

### Scope

- add a user-facing "market terminal" appearance or workspace mode
- define a denser spacing and panel treatment for the shell
- support a monitoring-first landing path alongside the existing Prompt Home
- make room for multi-panel work without creating a second application shell
- preserve direct links to all existing workspaces

### Out Of Scope

- copying Bloomberg visual branding
- replacing Prompt Home
- removing the current dashboard or assistant surfaces

### Acceptance Criteria

- a signed-in user can switch between the default shell and terminal mode
- terminal mode uses a visibly denser layout tuned for heavy information use
- route navigation, auth gating, and current workspaces still behave normally
- the mode is stored as a user preference and restored on reload

### Verification

- focused web tests for mode toggle and persisted preference
- focused rendering checks for shell class changes and fallback behavior

## MTERM-02: Global Command And Search Bar

### Status

Implemented.

### Priority

P0

### Outcome

Users can open one keyboard-first command bar to search and navigate across
workspaces and key desk objects.

### Scope

- add a global command bar entrypoint such as `/` or `Ctrl/Cmd+K`
- support typed search results for at least:
  - workspaces
  - trades
  - counterparties
  - commodities
  - price indices
  - reports
- route selected results into existing workspaces with handoff context
- distinguish navigation intents from business mutations
- show clear empty, loading, and unsupported-result states

### Out Of Scope

- natural-language order entry
- unrestricted fuzzy search across every record in the database
- model-only routing without deterministic result types

### Acceptance Criteria

- the command bar opens from keyboard and shell UI affordances
- selecting a result routes to a concrete existing workspace or focused object
- unsupported results fail closed with a readable explanation
- the command bar works in both default mode and terminal mode

### Verification

- focused web tests for search categories, keyboard open, and route handoff
- browser smoke for open-search-select-route behavior

## MTERM-03: Monitor Presets And Saved Layouts

### Status

Implemented.

### Priority

P0

### Outcome

Users can start from system-provided monitor presets and save personal
variations using the existing layout-definition infrastructure.

### Scope

- define system presets such as:
  - Market Overview
  - Risk Board
  - Operations Monitor
  - Settlement Watch
- map those presets onto the existing tile layout engine and layout API
- allow users to save personal layout changes on top of a chosen preset
- provide reset and fallback behavior when tiles evolve over time

### Out Of Scope

- arbitrary user-authored layout DSLs
- cross-workspace freeform drag-and-drop composition
- multi-user shared publishing workflows

### Acceptance Criteria

- at least three terminal-friendly presets are available from the UI
- a user can personalize tile order, visibility, and span and persist changes
- preset changes do not break existing saved layouts silently
- the fallback path is deterministic when a tile no longer exists

### Verification

- focused API tests for layout validation
- focused web tests for preset selection, save, reset, and schema drift fallback

## MTERM-04: Market Monitor Board

### Status

Implemented.

### Priority

P1

### Outcome

ECTRM exposes a first monitor board that feels closer to a market-data terminal
than a simple dashboard.

### Scope

- extend the dashboard or add a dedicated monitor board using existing tiles
  plus new terminal-oriented tiles
- include a compact market strip for selected commodities or price indices
- include cross-panel market context, price, exposure, and operational signals
- support fast click-through from a tile into reports, positions, trades, or
  operations
- start with current market context and external data rather than requiring a
  full real-time market data stack

### Out Of Scope

- tick-level market data infrastructure
- exchange execution
- custom formula scripting

### Acceptance Criteria

- the board supports a dense, multi-tile monitoring layout
- users can see market context next to exposure and operational risk signals
- each major tile has a clear click-through path into an existing workspace
- stale or missing external data is visible on the board

### Verification

- focused web tests for tile rendering and navigation
- focused backend or contract tests if new summary payloads are introduced

## MTERM-05: Instrument Brief And Drill-Down Pages

### Status

Implemented.

### Priority

P1

### Outcome

Users can open a Bloomberg-like read-only brief for a supported object such as
a price index, commodity, or market theme.

### Scope

- define the first supported drill-down objects, likely:
  - price indices
  - commodity classes
  - market context themes
- show summary stats, recent history, related positions, relevant trades,
  linked reports, and notable events
- support deep links from the command bar, monitor board, and reports
- reuse existing data contracts where possible before adding new endpoints

### Out Of Scope

- security-master coverage for every instrument type
- options analytics depth beyond current repo capabilities
- external charting terminals embedded in iframes

### Acceptance Criteria

- a user can open a supported drill-down from at least two different entry
  points
- each brief includes related ECTRM context, not just a standalone chart
- unsupported objects fail closed instead of rendering partial junk
- the brief makes it obvious which workspace owns deeper operational detail

### Verification

- focused web tests for drill-down rendering and routing
- focused service tests if new summary builders are introduced

## MTERM-06: Desk Headlines And Attention Stream

### Status

Implemented.

### Priority

P1

### Outcome

ECTRM provides a terminal-style headline and attention feed that blends market
signals with desk workflow context.

### Scope

- define a unified read model for desk headlines or attention items
- combine selected inputs such as:
  - market context summaries
  - notable trade or position changes
  - expiring options or pricing coverage gaps
  - operational blockers
  - document ingestion or settlement exceptions
  - messages or notifications where appropriate
- allow filtering by commodity family, desk concern, or severity
- link each item to the owning workspace

### Out Of Scope

- third-party licensed news ingestion unless a source is separately approved
- chat or messaging replacement
- model-generated headlines that bypass deterministic evidence selection

### Acceptance Criteria

- the feed shows a mixed stream of market and operational attention items
- each item cites its source object or owning workflow
- a user can filter the feed without losing routeability
- empty states explain whether the issue is no data, no matches, or no events

### Verification

- focused web tests for feed filtering and link-through
- focused backend tests if a new headline aggregation service is added

## MTERM-07: Keyboard Shortcuts And Quick Navigation

### Status

Implemented.

### Priority

P1

### Outcome

Terminal mode feels materially faster for power users because high-frequency
navigation flows no longer require pointer-only interaction.

### Scope

- add documented shortcuts for:
  - open command bar
  - switch primary workspaces
  - focus filter bars
  - move between tiles or panels
  - reset to a default workspace focus
- expose a small in-product shortcut reference
- keep shortcuts discoverable and conflict-aware

### Out Of Scope

- one-to-one replication of Bloomberg keyboard legends
- hidden expert-only navigation with no visible help

### Acceptance Criteria

- common navigation flows can be completed without reaching for the mouse
- shortcuts are visible from the product
- shortcut conflicts degrade safely in forms or text inputs

### Verification

- focused web tests for at least the command bar and workspace-switch shortcuts
- browser smoke for a basic keyboard-only navigation path

## MTERM-08: Watchlists And Alerts

### Status

Implemented.

### Priority

P2

### Outcome

Users can save the small set of markets and desk signals they care about and
see terminal-mode attention cues when those signals move.

### Scope

- define typed watchlists for supported objects
- allow a watchlist to power tiles, strips, or compact side panels
- define typed alert thresholds for:
  - price moves
  - stale market data
  - large position changes
  - pricing or settlement exceptions
- keep alert delivery in-product first

### Out Of Scope

- external SMS, email, or push notification infrastructure
- arbitrary expression languages in the first slice

### Acceptance Criteria

- a user can save at least one watchlist and reuse it in terminal mode
- alerts appear as governed in-product status, not freeform assistant text
- alert conditions are typed and testable

### Verification

- focused tests for watchlist serialization and alert evaluation rules
- focused web tests for rendering alert states

## MTERM-09: Regression, Assistant Routing, And Browser Smoke Coverage

### Status

Implemented.

### Priority

P0

### Outcome

The new terminal-mode behavior has enough regression coverage that we can
iterate without breaking route safety, layout persistence, or prompt-to-screen
handoffs.

### Scope

- add focused web tests for terminal mode shell behavior
- add route and handoff tests for command-bar navigation
- add browser smoke coverage for:
  - terminal-mode landing
  - command bar open and route
  - preset load
  - drill-down open
- add assistant eval or prompt-routing coverage if Prompt Home can open
  terminal destinations

### Out Of Scope

- exhaustive end-to-end automation for every workspace
- backend performance benchmarking as the only exit criterion

### Acceptance Criteria

- the highest-risk route and layout flows are covered by automated checks
- prompt-led navigation into terminal mode fails closed when unsupported
- smoke coverage proves the feature can be used from a fresh browser session

### Verification

- `make web-test`
- `make web-smoke-test` for the seeded browser path when browser routing changes
- `make api-assistant-evals` if prompt routing behavior changes

## MTERM-CLOSEOUT: Terminal Mode Release Readiness

### Status

Implemented.

### Priority

P0

### Outcome

The implemented terminal-mode slice is documented, reviewable, and ready for
operator feedback without relying on chat history or code archaeology.

### Scope

- mark MTERM-01 through MTERM-09 implementation status in this roadmap
- add an operator guide that explains:
  - terminal mode intent and boundaries
  - command bar scopes and supported prefixes
  - monitor presets and saved layouts
  - watchlists and typed alerts
  - keyboard shortcuts
  - assistant handoffs and fail-closed behavior
- document Wave 3 candidate enhancements without committing them as active work
- keep the authority boundary explicit: terminal mode is still read, explain,
  navigate, and personalize first

### Out Of Scope

- creating new terminal product behavior
- staging or committing unrelated dirty worktree changes
- promoting Wave 3 candidates without operator review

### Acceptance Criteria

- the roadmap reflects the implemented Phase 1 terminal-mode slice
- operators have a single guide for using the terminal-mode behavior
- future contributors can see what is shipped, what is bounded, and what is
  merely candidate scope

### Verification

- docs links resolve locally
- markdown formatting is readable
- no code tests are required unless implementation behavior changes
