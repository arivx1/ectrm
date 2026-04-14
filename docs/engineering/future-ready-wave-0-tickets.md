# Future-Ready Wave 0 Tickets

## Goal

Break Wave 0 of the future-ready engineering plan into independently trackable,
issue-sized tickets that can be scheduled across a small team without losing
the architectural intent.

Source work packages:

- [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- WP-01 repo quality gates and CI contract
- WP-02 server-owned API contracts and metadata
- WP-03 browser and workflow regression coverage

## Planning Assumptions

- these tickets are meant to fit normal engineering issue scope, not epics
- multiple tickets can run in parallel as long as they do not fight over the
  same verification seams
- the current emerging `apps/web/tests` suite is an asset to build on, not
  something to replace
- browser coverage should focus on the highest-trust workflows first, not every
  workspace

## Recommended Execution Lanes

### Lane A: CI foundation

1. FR0-01 canonical verification entrypoints
2. FR0-02 backend pull-request workflow
3. FR0-03 web pull-request workflow

### Lane B: contract hardening

4. FR0-04 workspace bootstrap type ownership
5. FR0-05 server-owned trade metadata endpoint
6. FR0-06 consume server-owned trade metadata in the web app
7. FR0-07 typed API helper consolidation
8. FR0-08 contract drift verification in CI

### Lane C: browser smoke coverage

9. FR0-09 browser smoke harness and seeded environment
10. FR0-10 mobile shell and signed-out entry smoke flow
11. FR0-11 signed-in trade capture smoke flow
12. FR0-12 admin or assistant governance smoke flow

## Shared Ticket Definition Of Done

A Wave 0 ticket is done only when:

- the affected seam is verified by automated checks appropriate to the change
- docs are updated if the developer workflow or runtime contract changed
- the ticket leaves behind a usable platform slice, not just scaffolding
- failure modes are explicit when follow-on tickets are still needed

## CI Foundation Tickets

## FR0-01: Canonical Verification Entrypoints

### Size

S

### Outcome

The repo has one documented verification contract that local developers and CI
both use.

### Scope

- choose the canonical commands for:
  - backend tests
  - web build
  - web lint
  - web tests
- decide whether the canonical entrypoint is:
  - direct documented commands
  - or small repo-level helper scripts
- document the commands in local development and contributor-facing docs
- ensure the commands work from a clean checkout with the documented setup

### Out of scope

- browser smoke tests
- new deployment workflows

### Dependencies

None

### Acceptance criteria

- one documented verification path exists for backend and web changes
- the commands are suitable for reuse in CI without hidden local assumptions
- docs explain when a change requires the full verification path versus a
  narrower local check

## FR0-02: Backend Pull-Request Workflow

### Size

M

### Outcome

Backend pull requests run a checked-in workflow that exercises the repo's
default backend verification contract.

### Scope

- add a GitHub Actions workflow for backend validation
- install Python dependencies and run the canonical backend test command
- make failures visible in a pull-request-friendly way
- document any environment setup or service assumptions the workflow requires

### Out of scope

- browser coverage
- full scheduled data-sync test matrix

### Dependencies

- FR0-01

### Acceptance criteria

- backend pull requests trigger a checked-in workflow
- the workflow fails when the backend verification command fails
- the workflow setup is documented enough to debug locally

## FR0-03: Web Pull-Request Workflow

### Size

M

### Outcome

Web pull requests run build, lint, and test checks through a checked-in
workflow.

### Scope

- add a GitHub Actions workflow for web validation
- install Node dependencies and run the canonical web commands
- define caching or setup choices that keep the workflow practical
- document any assumptions around Node version and working directory

### Out of scope

- browser smoke coverage
- visual regression tooling

### Dependencies

- FR0-01

### Acceptance criteria

- web pull requests trigger a checked-in workflow
- the workflow fails on build, lint, or unit/integration test failures
- the workflow setup matches the documented local commands

## Contract Hardening Tickets

## FR0-04: Workspace Bootstrap Type Ownership

### Size

M

### Outcome

The main workspace bootstrap payload uses owned domain types instead of
`unknown[]` placeholders for server-owned records.

### Scope

- inventory `unknown[]` usage in the workspace bootstrap types
- replace the highest-value bootstrap placeholders with concrete types
- align frontend loaders and call sites with the clarified types
- add targeted regression coverage for the typed bootstrap helpers

### Out of scope

- typing every frontend data structure in one pass
- introducing a new shared package by itself

### Dependencies

- can start in parallel with FR0-02 and FR0-03

### Acceptance criteria

- the primary workspace bootstrap surface no longer uses `unknown[]` for its
  first targeted entities
- typed bootstrap changes are covered by automated tests
- the repo docs note which payload areas still need follow-on typing work

### Follow-on note

After the initial bootstrap ownership slice, follow-on typing work should focus
on:

- non-bootstrap API payloads that still rely on ad hoc nested objects
- assistant and admin response areas with flexible tool or run snapshots
- server-owned metadata surfaces that will be formalized in FR0-05 through
  FR0-07

## FR0-05: Server-Owned Trade Metadata Endpoint

### Size

M

### Outcome

Trade metadata that should be governed by the backend is exposed from a
dedicated server-owned contract.

### Scope

- choose the first metadata slice to expose from the backend
- likely candidates:
  - trade enums
  - pricing type options
  - default option sets
  - validation-facing vocabulary that the web app currently mirrors
- add the endpoint or contract surface on the API
- add tests for shape, stability, and representative values
- document intended ownership of this metadata

### Out of scope

- migrating every UI option set at once
- turning reference data into static metadata

### Dependencies

- FR0-01 recommended

### Acceptance criteria

- the backend publishes one authoritative trade metadata surface
- automated tests verify the metadata contract
- docs state that the selected metadata is server-owned

### Implementation note

- `GET /trades/metadata` is the selected Wave 0 contract surface
- it owns backend-governed trade vocabulary, defaulted status behavior, and
  option/pricing validation rules
- browser-only conveniences should stay out of this contract unless the backend
  actually governs them

## FR0-06: Consume Server-Owned Trade Metadata In The Web App

### Size

M

### Outcome

The web app consumes the new backend metadata surface instead of mirroring the
same semantics locally.

### Scope

- replace one meaningful frontend-mirrored trade metadata surface with the new
  backend contract
- update trade forms or loaders to use the fetched metadata
- handle loading and fallback states explicitly
- add regression coverage for the web-side consumption path

### Out of scope

- migrating unrelated reference-data loaders
- changing product behavior beyond ownership of the metadata

### Dependencies

- FR0-05

### Acceptance criteria

- one meaningful trade metadata seam is no longer mirrored locally
- the web app keeps working when the backend metadata contract is present
- tests cover the web-side consumption path

## FR0-07: Typed API Helper Consolidation

### Size

M

### Outcome

Remaining ad hoc request construction for the targeted Wave 0 surfaces moves
behind typed API helpers.

### Scope

- identify remaining targeted fetch paths that still assemble requests ad hoc
- move those requests behind typed helpers
- standardize error handling and response typing for those helpers
- add or update tests around helper behavior

### Out of scope

- refactoring every fetch in the app
- introducing a new client library by default

### Dependencies

- benefits from FR0-04 through FR0-06

### Acceptance criteria

- targeted Wave 0 fetch paths no longer assemble request details inline
- helper behavior is covered by tests
- the de-hardcode initiative's next-step API-helper goal is materially advanced

## FR0-08: Contract Drift Verification In CI

### Size

S

### Outcome

Contract-sensitive changes fail quickly when the backend and web app drift on
the targeted Wave 0 seams.

### Scope

- choose the first contract drift check:
  - generated types committed and diff-checked
  - schema generation check
  - or focused contract test coverage
- wire the selected drift check into the CI path
- document how engineers refresh or repair the contract artifacts

### Out of scope

- full schema-registry tooling
- versioned external API publication

### Dependencies

- FR0-02 and FR0-03
- depends on the chosen contract strategy from FR0-04 through FR0-06

### Acceptance criteria

- CI fails when the targeted contract artifacts drift unexpectedly
- developers have a documented way to refresh the contract state
- the first contract-sensitive seam is guarded automatically

### Implementation note

- the selected first drift check is a committed trade metadata artifact at
  `apps/api/contracts/trade-metadata.contract.json`
- `make api-contract-check` verifies that the backend-owned
  `GET /trades/metadata` payload still matches that artifact
- `make api-contract-refresh` rewrites the artifact after intentional contract
  changes

## Browser Smoke Coverage Tickets

## FR0-09: Browser Smoke Harness And Seeded Environment

### Size

M

### Outcome

The repo has a practical browser smoke harness with deterministic data and a
documented startup path.

### Scope

- choose the browser smoke framework
- define the seeded environment and data setup for smoke flows
- document how CI and local runs start the app stack for browser checks
- add one trivial harness-level smoke test to prove the plumbing

### Out of scope

- full browser coverage for all workspaces
- load testing

### Dependencies

- FR0-01
- benefits from FR0-02 and FR0-03

### Acceptance criteria

- the repo can run one browser smoke test from a documented setup path
- the smoke environment uses deterministic seeded or fixture data
- the framework choice and startup contract are documented

### Implementation note

- Wave 0 chooses Playwright Test as the browser harness
- the initial seeded environment is a self-hosted Vite app server plus an
  in-process mock API with deterministic fixture data under
  `apps/web/tests/browser/support`
- `make web-smoke-install` and `make web-smoke-test` are the canonical local
  entrypoints
- the matching CI startup path is the manual `Browser Smoke` workflow, which
  uses `make web-smoke-install-ci` and `make web-smoke-test`

## FR0-10: Mobile Shell And Signed-Out Entry Smoke Flow

### Size

M

### Outcome

The browser suite protects the highest-visibility trust seam: app startup on a
mobile viewport and the signed-out entry state.

### Scope

- add a smoke flow for mobile shell startup
- verify the nav drawer and main content layout at a representative phone width
- verify the signed-out entry or redirect experience is coherent
- keep assertions focused on durable behavior, not fragile visual trivia

### Out of scope

- exhaustive mobile behavior for every workspace
- full auth-provider matrix coverage

### Dependencies

- FR0-09

### Acceptance criteria

- a mobile shell regression can fail the smoke suite
- the signed-out entry experience is asserted in browser coverage
- the test is stable enough for normal CI use

### Implementation note

- the Playwright smoke suite now asserts a phone-width shell layout plus mobile
  nav drawer overlay behavior
- a signed-out browser path now verifies the start-here overlay routes trade
  capture intent into the auth gate with the expected return-intent message

## FR0-11: Signed-In Trade Capture Smoke Flow

### Size

M

### Outcome

The primary operator write journey is covered by browser automation.

### Scope

- add a signed-in trade capture happy-path smoke test
- use deterministic master data and account state
- verify the main capture flow through a durable success condition
- keep the test narrow enough to remain reliable in CI

### Out of scope

- every trade variant
- amendment and cancellation flows in Wave 0

### Dependencies

- FR0-09
- benefits from FR0-04 through FR0-07 where the capture surface depends on
  cleaner contracts

### Acceptance criteria

- the repo has one signed-in trade capture browser smoke flow
- the flow fails on a broken primary capture journey
- the test data and login assumptions are documented

### Implementation note

- the Playwright smoke suite now signs in with the seeded local `OPS_ADMIN`
  session and submits one deterministic fixed-price natural gas ticket
- the create flow asserts the `TradeCreated` mutation lands, the app routes to
  the created trade, and the capture form resets to the next suggested trade ID

## FR0-12: Admin Or Assistant Governance Smoke Flow

### Size

M

### Outcome

One governance-oriented surface is protected by browser smoke coverage so Wave 0
does not optimize only for the happy-path trading shell.

### Scope

- choose one representative governance flow:
  - assistant approval inbox
  - agent management
  - user management
  - or another stable admin control surface
- add a browser smoke test for the chosen flow
- verify one meaningful governance interaction or state read
- document why this surface was chosen as the first governance smoke target

### Out of scope

- full admin regression coverage
- exhaustive permission-matrix testing

### Dependencies

- FR0-09

### Acceptance criteria

- one governance-oriented flow is covered by browser smoke automation
- the selected flow verifies a meaningful admin or assistant trust seam
- docs explain how follow-on governance smoke tests should be prioritized

### Implementation note

- Wave 0 uses the admin assistant approval inbox as the first governance smoke
  target because it protects the clearest human trust boundary in the current
  product: a cross-user assistant action that an admin can explicitly reject or
  execute
- the Playwright smoke suite now seeds one pending assistant action request,
  opens the real Admin workspace, and rejects that request through the inbox
- follow-on governance smoke priorities should expand outward from that trust
  seam: assistant approval execution, agent-management mutations, then broader
  user-management or roadmap-control regressions

## Suggested Milestones

### Milestone 1: foundation available

- FR0-01
- FR0-02
- FR0-03
- FR0-09

### Milestone 2: first typed contract slice

- FR0-04
- FR0-05
- FR0-06
- FR0-07
- FR0-08

### Milestone 3: workflow trust protected

- FR0-10
- FR0-11
- FR0-12
