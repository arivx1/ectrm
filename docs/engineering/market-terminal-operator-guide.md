# Market Terminal Operator Guide

This guide explains the Bloomberg-style market terminal mode in ECTRM. It is
for operators, product reviewers, and implementation teams who need to use or
evaluate the terminal-mode slice without reading application code.

Terminal mode is a familiarity layer over the existing ECTRM workspaces. It is
not a Bloomberg clone, not a separate application, and not an execution
terminal.

## What Terminal Mode Is For

Use terminal mode when the job is:

- monitoring a live desk picture with denser information layout
- moving quickly between workspaces
- searching for trades, reports, price indices, commodities, and counterparties
- opening focused read-only context from market or desk signals
- saving personal monitor layouts and Live Desk watchlists

Do not use terminal mode as a shortcut around governed workflows. Trade
capture, amendment, cancellation, approvals, settlement, and external
commitments still belong to the typed workspaces and approval paths that own
those actions.

## Enable Terminal Mode

Open `Settings`, then use the appearance control for `Market terminal mode`.

When enabled:

- the shell uses denser spacing and terminal-oriented treatment
- signed-in root landing favors the Live Desk
- the command bar and shortcut reference are available from the shell
- saved appearance preference is restored on reload

You can return to the standard shell from the same settings control.

## Live Desk

`Live Desk` is the terminal-mode home base. It is built on the existing
dashboard workspace and adds monitor-first tiles such as:

- market monitor strip
- market monitor board
- desk headlines
- saved terminal watchlist
- instrument brief
- quote chart and curve panel
- market prices
- position snapshot
- operational attention
- external market context

Each tile should either explain its source context or provide a route into the
workspace that owns deeper detail.

## Monitor Presets

Use the `Monitor preset` selector on personalizable workspaces to apply a
system-owned starting layout.

Current presets:

| Preset | Workspace | Purpose |
| --- | --- | --- |
| Market Overview | Live Desk | Prioritizes market strip, monitor board, desk headlines, watchlist alerts, instrument brief, prices, exposure, and attention. |
| Risk Board | Exposure | Prioritizes risk summary, concentration, pricing coverage, option expiry, marks, and settlement detail. |
| Operations Monitor | Operations | Prioritizes queue pressure, confirmations, documents, credit exceptions, expiry alerts, feeds, and system context. |

After choosing a preset, users can still personalize tile order, visibility,
and span through the existing workspace layout controls. If a future tile
changes or disappears, saved layouts should fail closed through deterministic
layout sanitization instead of silently breaking the workspace.

## Workspace Sets

Terminal mode includes a `Workspace Set` launcher near the top of the shell.
Use it to choose a familiar desk setup, open the primary workspace in the
current tab, and pop out companion workspaces into separate browser tabs or
windows.

Current workspace sets:

| Workspace set | Primary workspace | Companion workspaces | Purpose |
| --- | --- | --- | --- |
| Trader Morning | Live Desk | Trade Capture, Exposure, Reports | Start the day with market pulse, desk work, risk, and reporting close at hand. |
| Risk Review | Exposure | Net Positions, Live Desk, Reports | Compare risk, balances, market context, and reports during review. |
| Ops Close | Work Queue | Settlement, Scheduling, Deliveries, Reports | Line up post-trade blockers, settlement, scheduling, and delivery execution near close. |

Workspace sets do not move windows across physical monitors. The launcher
opens safe ECTRM routes; the user arranges browser windows on monitors as
needed. Preset recommendations such as `Market Overview`, `Risk Board`, and
`Operations Monitor` describe the intended companion layout when that workspace
supports monitor presets.

## Quote Charts And Curve Panels

Live Desk includes a `Quote Chart & Curve Panel` tile for scanning recent
stored price-index observations. It shows:

- a quote selector for desk-linked price indices
- a history chart with latest mark, prior-observation move, percent move, low,
  high, average, and observation count
- a curve strip ranked by active trade usage
- commodity or provider buckets for quick curve context
- brief actions that open existing read-only price-index instrument briefs

This panel uses stored ECTRM price-index observations. It is not a real-time
tick feed, execution blotter, market-data entitlement system, curve valuation
model, or order-entry path.

## Command Bar

Open the command bar with `Ctrl/Cmd+K` or `/` when focus is not inside an input.

Supported scopes:

| Scope | Prefixes | Examples |
| --- | --- | --- |
| Function | `function:`, `fn:`, `cmd:` | `MON`, `DES HENRY_DA`, `EOD`, `SETL` |
| Workspace | `workspace:`, `ws:`, `view:` | `workspace: settlement`, `ws: risk` |
| Trade | `trade:`, `trd:` | `trade: T-AMEND-100` |
| Counterparty | `counterparty:`, `cp:` | `cp: acme` |
| Commodity | `commodity:`, `cmdty:` | `cmdty: gas` |
| Price index | `index:`, `px:`, `price:` | `px: henry`, `index: HH_IFERC` |
| Report | `report:`, `rpt:` | `report: eod`, `rpt: credit` |

Bare aliases also work without a colon:

| Alias | Meaning |
| --- | --- |
| `TRD TRD-1001` or `T TRD-1001` | Open a trade result. |
| `CP SHELL` | Search counterparties. |
| `CMDTY GAS` | Search commodities. |
| `PX HENRY` or `IDX HENRY` | Search price indices. |
| `RPT CREDIT` | Search anchored report modules. |
| `WS RISK` | Search workspaces. |

Terminal functions are deterministic shortcuts, not scripts:

| Function | Opens |
| --- | --- |
| `MON`, `MKT`, `LIVE` | Live Desk monitor. |
| `DES HENRY_DA` | Read-only Live Desk instrument brief for a price index. |
| `DES GAS` | Read-only Live Desk instrument brief for a commodity class. |
| `EOD` | Trading EOD report. |
| `CR` or `CREDIT` | Counterparty Credit Report. |
| `PNL` | Portfolio Snapshot report. |
| `SETL` | Settlement workspace. |
| `OPS`, `POS`, `SCH`, `REF`, `HELP` | Operations, Net Positions, Scheduling, Reference Data, or How It Works. |
| `WSET risk` or `SETUP ops` | Primary workspace for a saved workspace set; use the Workspace Set launcher for companion pop-outs. |

Blank search shows high-value function, workspace, report, and trade starting
points.
Selecting a result opens the destination workspace or record with a terminal
handoff banner when focus context applies.

Mutation-style commands fail closed. For example, commands that begin with
verbs such as `book`, `amend`, `cancel`, `create`, `issue`, `approve`, `save`,
`update`, `pay`, `settle`, `schedule`, `confirm`, `submit`, `execute`,
`allocate`, `nominate`, `actualize`, `release`, `post`, `send`, or `delete`
are treated as unsupported in the terminal command bar. Use the owning
workspace and governed action flow for those jobs.

## Keyboard Shortcuts

Open the shortcut reference with `?`.

Core shortcuts:

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+K` or `/` | Open command bar |
| `Alt+1` | Open Live Desk |
| `Alt+2` | Open Trade Capture |
| `Alt+3` | Open Exposure |
| `Alt+4` | Open Operations |
| `Alt+5` | Open Settlement |
| `Alt+6` | Open Reports |
| `Alt+7` | Open Reference Data |
| `Alt+8` | Open Assistant |
| `Alt+F` | Focus the current workspace filter when available |
| `Alt+J` | Move to the next visible tile or panel |
| `Alt+K` | Move to the previous visible tile or panel |
| `Alt+0` | Clear handoff focus and return to the top of the current workspace |
| `?` | Show terminal shortcuts |

Shortcuts are conflict-aware. They should not hijack normal typing inside
inputs, textareas, selects, or editable regions.

## Watchlists And Alerts

The Live Desk includes a terminal watchlist panel. It can save supported
markets and desk signals into browser storage and evaluate typed in-product
alert rules.

Supported watchlist object families:

- price indices
- commodity classes
- desk signals

Current typed alert conditions:

- price move
- stale market data
- large position threshold
- pricing exception open
- settlement exception open

Alerts are deterministic UI state, not freeform assistant text. Alert rows
show severity, source context, detail, and an action that opens the owning
workspace or supported market brief.

## Instrument Briefs

Instrument briefs are read-only drill-downs for supported market objects. They
are meant to answer "what is this market object connected to inside ECTRM?"
rather than replace the workspaces that own operations.

Supported entry points include:

- command bar price-index results
- Live Desk monitor tiles
- watchlist alert actions

Unsupported instrument destinations fail closed instead of rendering partial
or misleading context.

## Assistant And Prompt Home Handoffs

Prompt Home and assistant responses may offer terminal destinations when the
destination and focus metadata are supported.

Supported handoffs:

- open a terminal destination with a routeable workspace
- focus a supported trade, reference record, market instrument, report, invoice,
  payment, document, or workflow item
- show a handoff banner with provenance and context

Fail-closed behavior:

- unsupported workspaces are ignored
- unsupported focus metadata is rejected
- signed-in onboarding overlays stay hidden while a focused handoff is active
- assistant handoffs remain navigation and explanation, not direct mutation

## Manual Fallback

Every terminal-mode path should leave an obvious manual fallback:

- clear the handoff banner to return to the full workspace
- open the owning workspace from the side rail or `Alt+1...8`
- use the standard workspace forms for business writes
- use `Settings` or `Admin` for access, runtime, and governance issues

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Terminal mode is not active after reload | Open `Settings` and confirm the appearance preference is saved in this browser. |
| Command bar returns unsupported | Check whether the query starts with a mutation verb or unsupported scope. Use the owning workspace for writes. |
| A search result opens the wrong context | Clear the handoff banner, retry with a scoped prefix, or open the workspace directly. |
| A preset seems to hide expected tiles | Reset the workspace layout, then reapply the preset. |
| Watchlist alerts look stale | Confirm market data recency and reference-data activity in `Reference Data` or the linked workspace. |
| Assistant handoff does not open | The destination or focus metadata may be unsupported; use manual navigation and report the prompt as a routing candidate. |

## Verification Evidence

The closeout pass verified the terminal-mode slice with:

- focused terminal command and prompt-navigation tests
- focused terminal alias and function tests
- workspace layout preset tests
- workspace-set launch target and persistence tests
- terminal quote and curve helper tests
- Live Desk rendering tests for the quote chart and curve panel
- terminal shortcut tests
- dashboard watchlist and alert tests
- dashboard browser smoke coverage
- full web lint, build, unit tests, and browser smoke
- assistant evals for prompt-routing safety
