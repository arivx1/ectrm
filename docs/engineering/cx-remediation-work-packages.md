# CX Remediation Work Packages

## Goal

Turn the current CX review into concrete delivery packages that improve:

- user trust in the shell and system status
- first-run clarity and sign-in flow
- mobile and small-screen usability
- trade-entry efficiency at realistic master-data scale
- durability through stronger regression coverage

This package set assumes we want to preserve the current operator-console
direction rather than redesign the product from scratch.

## Delivery order

### Wave 0: stop visible trust breaks

1. WP-01 mobile shell reliability
2. WP-02 auth continuity and signed-out clarity
3. WP-06 CX regression coverage

### Wave 1: remove environment and workflow friction

4. WP-03 local/dev startup resilience
5. WP-04 trade entry efficiency at scale

### Wave 2: improve intuitiveness and adoption

6. WP-05 navigation and onboarding clarity

## Shared definition of done

Each work package is done only when:

- desktop and mobile behavior are both verified
- signed-out and signed-in states are both verified where relevant
- user-facing copy matches actual runtime behavior
- at least one automated test or smoke check covers the resolved failure mode
- operator-facing docs are updated when the behavior change is discoverable

## WP-01: Mobile Shell Reliability

### Priority

P0

### Outcome

The app shell works on phones and narrow tablets without collapsing the main
content area or leaving the user trapped in an off-canvas layout state.

### Why this matters

Right now the mobile shell can render the main stage at an unusably small width.
That makes the product feel broken before a user evaluates any workflow.

### Scope

- fix responsive CSS cascade conflicts in the shell layout
- verify `.app-shell`, `.main-stage`, `.side-rail`, and mobile topbar behavior
- confirm the closed mobile nav leaves the content column full width
- confirm the opened mobile nav behaves like a drawer rather than a permanent
  second column
- verify Dashboard, Settings, and Trading at small viewport widths
- add browser coverage for the shell at mobile breakpoints

### Out of scope

- mobile-first redesign of dense trading workspaces
- new mobile-specific feature sets

### Suggested owner profile

Frontend engineer with strong CSS/layout debugging experience

### Dependencies

None

### Acceptance criteria

- at `390px` to `430px` viewport width, the main content column uses the
  available viewport width when the nav drawer is closed
- no default dashboard or settings content renders off-canvas on first load
- mobile nav can open and close without overlapping permanent desktop layout
- a browser test fails if the shell regresses into a two-column desktop grid on
  mobile

## WP-02: Auth Continuity And Signed-Out Clarity

### Priority

P0

### Outcome

A user sees one coherent access story:

- signed out: clear sign-in path, not a broken dashboard
- signed in: protected tiles and workspaces receive the session they need

### Why this matters

The current experience mixes "connected" states with auth-required banners.
That undermines trust even when the backend is healthy.

### Scope

- audit protected read calls from the web app and ensure session tokens are
  passed consistently
- fix dashboard reporting/P&L loaders so they use the active auth session
- review other protected workspace reads for the same failure mode
- replace generic signed-out error banners with a deliberate access-state UI
- make single-user, password, and Google entry points prominent when enabled
- align product copy and docs with the actual access model
- decide explicitly whether the platform is:
  - auth-first for most useful data
  - or genuinely readable without auth for standard views

### Out of scope

- broader auth-provider expansion beyond existing password, Google, and
  single-user modes

### Suggested owner profile

One frontend engineer and one backend engineer pairing on auth/state seams

### Dependencies

- none for token propagation
- doc alignment depends on product decision about read-only access

### Acceptance criteria

- a signed-in operator does not see auth-required errors caused by missing
  frontend token propagation
- the dashboard renders without contradictory "connected" and "authentication
  required" states
- a signed-out user lands on a clear sign-in experience with at least one
  obvious next action
- README and operator-facing auth copy match runtime behavior
- automated coverage exists for:
  - signed-out access behavior
  - single-user sign-in
  - signed-in dashboard report loading

## WP-03: Local/Dev Startup Resilience

### Priority

P1

### Outcome

The app starts reliably in local development without looking dead when Vite
chooses a different port or the browser origin drifts from the API allowlist.

### Why this matters

Internal product confidence drops quickly when a healthy backend still produces
"API unavailable" in the browser because of origin assumptions.

### Scope

- remove the brittle dependency on `5173` as the only trusted local web origin
- support common local dev cases where the frontend runs on `5174` or another
  fallback port
- decide whether to solve this through:
  - broader local CORS allowlists
  - shared port reservation discipline
  - generated local env setup
  - or a small startup check that surfaces the mismatch clearly
- update local-development docs so the happy path matches real behavior
- add a smoke check for local web/API connectivity assumptions

### Out of scope

- production CORS policy redesign

### Suggested owner profile

Backend/platform engineer with frontend dev-environment context

### Dependencies

None

### Acceptance criteria

- the web app can run locally from the documented flow without a hidden
  origin/CORS mismatch
- if a mismatch still occurs, the user sees an explanatory message that points
  to the fix
- local docs describe the actual startup path and supported origins

## WP-04: Trade Entry Efficiency At Scale

### Priority

P1

### Outcome

Trade capture remains usable when reference data is large, messy, and updated
often, instead of only feeling manageable with demo-sized datasets.

### Why this matters

The current form is directionally strong, but large native selects turn routine
entry into scrolling and hunting. That will become one of the biggest operator
fatigue points.

### Scope

- replace the heaviest native selects with searchable controls
- start with:
  - counterparty
  - commodity
  - location
  - portfolio
- support keyboard-first selection
- preserve existing validation and domain rules
- improve progressive disclosure so low-signal fields do not dominate first
  entry
- review default field ordering for fastest common-path capture

### Out of scope

- complete redesign of the trade domain model
- advanced personalization like saved favorites unless needed for MVP usability

### Suggested owner profile

Frontend workflow engineer with design support from an operator-minded PM or
designer

### Dependencies

- should follow WP-02 so auth and data loading feel stable first

### Acceptance criteria

- an operator can select a counterparty from a large list without long manual
  scrolling
- the common single-leg capture flow is faster and visually lighter than the
  current baseline
- keyboard navigation remains intact
- the updated controls are covered by interaction tests

## WP-05: Navigation And Onboarding Clarity

### Priority

P2

### Outcome

A first-time or occasional user can understand where to start, where to perform
the top workflows, and what each workspace is for without prior training.

### Why this matters

The shell looks polished, but it still assumes insider language and mental
models. That limits adoption outside the core builder group.

### Scope

- review navigation labels for first-use comprehensibility
- reduce jargon where labels are clever but unclear
- define the primary "start here" paths for:
  - sign in
  - capture a trade
  - investigate a trade issue
  - review exposure
- strengthen guide/demo entry points as onboarding assets
- improve empty-state and hero copy so each workspace states:
  - what it is for
  - who should use it
  - what to do next

### Out of scope

- net-new workspaces
- major IA replatforming

### Suggested owner profile

Product designer or PM with frontend support

### Dependencies

- benefits from WP-02 so the signed-out and signed-in stories are already clean

### Acceptance criteria

- the first-run path to sign-in, dashboard, and trading is obvious without
  tribal knowledge
- navigation labels test well with internal users who did not build the feature
- guide/demo content is framed as a usable onboarding tool rather than a side
  module

## WP-06: CX Regression Coverage

### Priority

P0

### Outcome

The specific trust breaks from this review become hard to reintroduce silently.

### Why this matters

Current unit and API tests are healthy, but they are not catching the browser
level seams that created the most visible CX failures.

### Scope

- add browser smoke coverage for:
  - signed-out startup
  - single-user sign-in
  - signed-in dashboard render
  - mobile shell width
  - nav drawer open/close on mobile
- add focused tests for auth propagation into protected report loaders
- add a small reviewer checklist for:
  - desktop signed-out
  - desktop signed-in
  - mobile signed-in
- make these checks part of normal validation for shell/auth changes

### Out of scope

- exhaustive end-to-end coverage for every workspace

### Suggested owner profile

Frontend engineer with test infrastructure ownership

### Dependencies

- can start immediately
- should absorb fixtures from WP-01 and WP-02 as those fixes land

### Acceptance criteria

- the browser-level failures from the CX review are represented in automated
  coverage
- shell/auth regressions are caught before manual review
- validation guidance exists for contributors touching shell, auth, or primary
  workspace boot flows

## Suggested sprint cut

If this needs to fit into two short iterations:

### Sprint 1

- WP-01 mobile shell reliability
- WP-02 auth continuity and signed-out clarity
- WP-06 CX regression coverage for those two packages

### Sprint 2

- WP-03 local/dev startup resilience
- WP-04 trade entry efficiency at scale
- WP-05 navigation and onboarding clarity kickoff or design pass

## Exit criteria for the initiative

This remediation effort is complete when:

- the product no longer feels broken on first load
- sign-in state is coherent across the shell and flagship workspaces
- the shell is usable on mobile-sized screens
- trade entry remains workable with larger reference sets
- the main CX failures are covered by automated checks
