# Future-Ready Engineering Work Packages

## Goal

Turn the repo's forward-looking architecture direction into concrete delivery
packages that:

- make backend, frontend, assistant, and automation changes safer at higher
  speed
- reduce transport-specific logic and duplicated business rules
- move the product from prototype-shaped seams toward typed, observable,
  governed platform seams
- preserve the current stack and additive migration path instead of triggering
  a rewrite

This package set assumes we want to keep the current event-led, projection-led,
GUI-first direction while making the codebase easier for both humans and
AI-assisted workflows to change responsibly.

## Primary Design Inputs

- [ADR 0002: V2 Application Architecture And Canonical Domain Boundaries](../adr/0002-v2-application-architecture.md)
- [AI Workflow](./ai-workflow.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Agent Platform Phase 1 Tickets](./agent-platform-phase-1-tickets.md)
- [De-hard-code Initiative](./de-hardcode-initiative.md)
- [User Extensibility Initiative](./user-extensibility-initiative.md)
- [Platform Blueprint](./platform-blueprint.md)

## Current Repo Signals

- the backend already has domain scaffolding, but route and transport assembly
  are still concentrated in central seams
- the frontend already uses strict TypeScript and React 19, but major
  workspaces and orchestration surfaces are still large
- assistant governance, prompt tracing, and eval coverage are ahead of most
  prototype codebases and should become the pattern for other automation
  surfaces
- web tests are emerging, but repo-level CI and quality gates are not yet a
  checked-in default

## Delivery Order

### Wave 0: make change safe

1. WP-01 repo quality gates and CI contract
2. WP-02 server-owned API contracts and metadata
3. WP-03 browser and workflow regression coverage

### Wave 1: consolidate canonical seams

4. WP-04 application service boundary hardening
5. WP-05 frontend shell and workspace decomposition
6. WP-06 cross-transport observability and provenance

### Wave 2: govern AI-native execution

7. WP-07 assistant and automation eval expansion
8. WP-08 action gateway for assistant, automation, and bulk edits

### Wave 3: productize extensibility

9. WP-09 metadata-driven views, layouts, and reports
10. WP-10 controlled custom fields, formulas, and promotion path

Detailed execution breakdown for Wave 0:

- [Future-Ready Wave 0 Tickets](./future-ready-wave-0-tickets.md)

Detailed execution breakdown for the supervised agent-platform Phase 1:

- [Agent Platform Phase 1 Tickets](./agent-platform-phase-1-tickets.md)

## Shared Definition Of Done

Each work package is done only when:

- new or changed behavior is covered by automated tests, evals, or browser
  smoke checks appropriate to the risk
- no new write path bypasses typed application services, audit capture, or
  permission checks
- runtime contracts are explicit and versionable where the frontend,
  assistant, or automation depends on them
- correlation, provenance, and failure diagnostics are preserved for the
  affected path
- docs are updated where the operating model, extension surface, or developer
  workflow changes
- migration and rollback expectations are explicit when old and new seams must
  coexist temporarily

## WP-01: Repo Quality Gates And CI Contract

### Priority

P0

### Outcome

Every pull request runs a checked-in quality baseline for the backend, web app,
and contract-sensitive surfaces before changes are merged.

### Why this matters

The next engineering phase will increase parallel change volume. Without a
default CI contract, faster delivery will mostly mean faster regressions.

### Scope

- add checked-in GitHub Actions workflows for the repo's default verification
  path
- define the minimum required lanes for pull requests:
  - backend tests
  - web build
  - web lint
  - web tests
- define which heavier checks stay local-first or run on a slower schedule
- document the canonical local verification commands
- ensure contract-sensitive or eval-sensitive changes fail loudly in CI

### Out of scope

- deployment automation redesign
- exhaustive performance benchmarking in CI

### Suggested owner profile

Platform-minded engineer with enough backend and frontend context to design a
credible default gate

### Dependencies

None

### Acceptance criteria

- a clean checkout can run the documented backend and web verification flow
- pull requests trigger checked-in workflows under `.github/workflows`
- a failing backend test, web build, web lint step, or web test step blocks the
  default merge path
- local-development docs reflect the actual verification contract

## WP-02: Server-Owned API Contracts And Metadata

### Priority

P0

### Outcome

The web app and assistant consume server-owned contracts for stable entities,
metadata, and vocabulary instead of mirroring backend semantics in ad hoc
frontend types and constants.

### Why this matters

AI-assisted coding gets much safer when the source of truth is explicit. Right
now the repo has strong intent here, but some frontend seams still depend on
duplicated or weakly typed contract knowledge.

### Scope

- choose the contract strategy:
  - generated TypeScript types from OpenAPI
  - or a shared schema/package workflow
- remove `unknown[]` placeholders from owned bootstrap and API payload types
- expose server-owned metadata for trade and reference-data vocabularies where
  the web app currently mirrors backend semantics
- move repeated request construction behind typed API helpers
- define how contract changes are reviewed, versioned, and verified

### Out of scope

- a separate backend-for-frontend service
- replacing every internal frontend type in one pass

### Suggested owner profile

One backend engineer and one frontend engineer pairing on schema ownership

### Dependencies

- WP-01 should land first or in parallel so contract regressions are gated

### Acceptance criteria

- core workspace bootstrap payloads no longer use `unknown[]` for server-owned
  domain records
- at least one metadata surface replaces mirrored frontend business vocabulary
- contract drift can be detected automatically in CI or local verification
- the de-hardcode initiative's remaining API-helper work is materially reduced

## WP-03: Browser And Workflow Regression Coverage

### Priority

P0

### Outcome

Critical operator journeys are covered by browser or integration-level checks,
not just helper-level unit tests.

### Why this matters

This codebase is increasingly about workflow trust. The most expensive
regressions will come from shells, auth states, multi-step forms, and mutation
flows that still look fine in isolated unit tests.

### Scope

- pick the first high-signal browser smoke suite for the repo
- cover representative desktop and mobile flows:
  - shell startup
  - sign-in or signed-out redirect clarity
  - trade capture happy path
  - one admin or assistant governance path
- reuse seed/demo data where possible for deterministic browser checks
- align the existing `apps/web/tests` suite with a clearer test pyramid
- document which flows are mandatory smoke coverage before workspace refactors

### Out of scope

- exhaustive end-to-end coverage for every workspace
- visual diff tooling for every component state

### Suggested owner profile

Frontend engineer with test-infrastructure support from a platform engineer

### Dependencies

- WP-01 for CI wiring
- benefits from WP-02 where contracts affect seeded browser fixtures

### Acceptance criteria

- at least one browser-accessible smoke suite runs against the documented local
  or CI setup
- mobile shell behavior and one signed-in workflow are covered
- a regression in the shell, auth entry path, or primary trade flow fails the
  default verification path
- test docs explain where to add unit, integration, and browser coverage

## WP-04: Application Service Boundary Hardening

### Priority

P0

### Outcome

Mutating business behavior flows through explicit domain services that can be
reused by routes, scripts, assistants, bulk tools, and future automation.

### Why this matters

The most important "new-age" coding practice is not autonomous code generation.
It is making sure every execution surface uses the same safe, inspectable
business seams.

### Scope

- define the canonical command and query seam for domain services
- thin route handlers that still hold meaningful business logic
- ensure scripts and emerging automation paths reuse the same service entry
  points where possible
- standardize service inputs, outputs, and domain error handling
- make audit capture and actor identity available at the service boundary

### Out of scope

- microservice decomposition
- rewriting already healthy domain modules just for cosmetic consistency

### Suggested owner profile

Backend engineer with architectural ownership of domain boundaries

### Dependencies

- WP-02 for contract clarity where services define API-facing behavior

### Acceptance criteria

- at least two high-value mutating domains use a documented application-service
  pattern
- routes become thin transport adapters rather than business-rule owners
- one non-route caller reuses the same application-service seam successfully
- service-level regression tests cover the extracted seam

## WP-05: Frontend Shell And Workspace Decomposition

### Priority

P1

### Outcome

The frontend becomes easier to change through smaller, more compiler-friendly
workspace modules instead of a few orchestration-heavy files.

### Why this matters

React is moving toward compiler-assisted optimization and simpler mental models.
That rewards smaller pure components, clearer ownership, and less centralized
state choreography.

### Scope

- reduce orchestration pressure in `App.tsx` and the heaviest workspace files
- formalize workspace module seams such as:
  - descriptor
  - loader
  - controller
  - renderer
- split data loading, mutation wiring, and presentational rendering more
  cleanly
- prefer patterns that remain friendly to React 19 and future compiler
  assumptions
- preserve current UX and navigation behavior while refactoring

### Out of scope

- product redesign
- a full state-management-library migration

### Suggested owner profile

Frontend engineer with strong architectural discipline and comfort refactoring
large React surfaces

### Dependencies

- WP-03 so shell and workflow regressions are easier to catch

### Acceptance criteria

- `App.tsx` no longer acts as the effective integration point for most
  workspace-specific concerns
- at least three of the largest workspace or orchestration modules are split
  into clearer owned seams
- refactored workspaces preserve existing behavior under automated coverage
- frontend architecture docs reflect the new module conventions

## WP-06: Cross-Transport Observability And Provenance

### Priority

P1

### Outcome

Operators and engineers can trace what happened across API calls, assistant
runs, sync jobs, and future automation with one coherent provenance model.

### Why this matters

As more work is performed through assistants and automation, observability stops
being an internal nice-to-have and becomes part of product trust.

### Scope

- standardize provenance fields for mutating work:
  - actor
  - source surface
  - correlation id
  - outcome
  - timing
  - affected records
- align browser-visible error reporting with backend correlation and audit data
- connect assistant traces, tool usage, and action requests to the same
  provenance expectations
- identify one admin-facing or explainability-facing surface to expose this
  lineage clearly

### Out of scope

- migrating to a new observability vendor
- full distributed tracing across every external dependency

### Suggested owner profile

Backend/platform engineer with empathy for operator-facing explainability

### Dependencies

- WP-04 for canonical service seams
- informs WP-08 action-gateway audit behavior

### Acceptance criteria

- mutating paths capture a shared minimum provenance set
- correlation ids remain visible from user-facing failures back to backend logs
- at least one explainability or admin surface can show cross-transport lineage
- docs describe the provenance contract for new features

## WP-07: Assistant And Automation Eval Expansion

### Priority

P0

### Outcome

Assistant and automation behavior is treated like a tested product surface with
release-gating eval coverage for risky flows.

### Why this matters

This repo already has the right instinct here. The next step is making evals a
default practice for any change that affects prompts, tools, approvals, or
automated decision-making.

### Scope

- expand the current assistant eval catalog into a maintainable suite of
  scenarios
- cover high-risk behavior classes such as:
  - tool allowlist enforcement
  - stale or partial context handling
  - approval-gated action requests
  - provider/model fallback behavior
  - explicit no-claim behavior when live reads are unavailable
- define when evals are required for new assistant or automation features
- decide which eval lanes run on pull requests versus slower schedules

### Out of scope

- autonomous write execution without explicit governance
- benchmarking every model choice on every branch

### Suggested owner profile

Backend engineer or applied-AI engineer with product judgment about acceptable
assistant behavior

### Dependencies

- WP-01 for CI policy
- benefits from WP-06 provenance conventions

### Acceptance criteria

- assistant and automation changes have a documented eval-entry requirement
- at least one eval suite runs as part of normal verification
- failures in tool governance or approval behavior are caught by automated evals
- docs explain how to add a new eval case and when one is required

## WP-08: Action Gateway For Assistant, Automation, And Bulk Edits

### Priority

P0

### Outcome

Non-form write execution flows through one governed action pattern with dry-run,
approval, audit, and idempotency support.

### Why this matters

If assistants, bulk tools, imports, and future recurring jobs all invent their
own write path, the platform will become harder to trust just as it becomes
more capable.

### Scope

- define the action-request shape for non-trivial writes
- support preview or dry-run behavior where practical
- define approval requirements for sensitive actions
- route at least one assistant or admin bulk-edit path through the action
  gateway
- ensure the gateway delegates actual business behavior to typed application
  services
- define idempotency and replay expectations for retried actions

### Out of scope

- a general-purpose workflow engine
- full job scheduling redesign

### Suggested owner profile

Backend engineer with ownership of assistant governance and admin controls

### Dependencies

- WP-04 for service-boundary reuse
- WP-06 for provenance
- WP-07 for eval coverage

### Acceptance criteria

- at least one assistant, bulk-edit, or automation write path uses the gateway
- sensitive actions can be staged for approval rather than executed implicitly
- dry-run or preview behavior exists for at least one high-risk action type
- the gateway produces auditable records tied back to the initiating surface

## WP-09: Metadata-Driven Views, Layouts, And Reports

### Priority

P1

### Outcome

Users can shape selected workspace layouts, shared views, and derived reports
through governed metadata instead of engineering changes.

### Why this matters

A future-ready product is not one where AI writes every customization. It is
one where repeated customizations become first-class product primitives with
ownership, status, and versioning.

### Scope

- formalize the metadata model for:
  - personal layout preferences
  - shared view definitions
  - report definitions
- make publication lifecycle explicit for shared definitions
- ensure derived reports build on approved semantic fields rather than ad hoc
  query logic
- identify the first UI surfaces that can be driven by these definitions
- keep explainability and lineage visible for report-driven outputs

### Out of scope

- arbitrary user-authored SQL
- replacing every hardcoded workspace surface at once

### Suggested owner profile

Product-minded full-stack engineer with interest in admin and reporting
surfaces

### Dependencies

- WP-02 for stable contracts
- WP-04 for service boundaries

### Acceptance criteria

- at least one shared layout or view definition is versioned and published via
  metadata
- at least one report surface reads from a governed report definition
- ownership, status, and audit fields are visible for shared definitions
- docs explain which customization requests belong to metadata versus schema

## WP-10: Controlled Custom Fields, Formulas, And Promotion Path

### Priority

P1

### Outcome

Low-risk extensibility becomes a governed product feature with a clear path for
graduating successful extensions into the core model.

### Why this matters

This is how the repo avoids both extremes:

- hardcoding every customer-specific variation
- or dissolving the domain model into generic blobs

### Scope

- define typed custom-field metadata for low-risk additive extensions
- define deterministic formula metadata for approved derived values
- identify which domains can safely host the first extension surface
- enforce governance rules around ownership, version, publish status, and
  rollback
- document the graduation rubric for promoting widely adopted extensions into
  engineering-owned schema

### Out of scope

- unbounded EAV modeling
- moving analytics-critical or control-critical trade semantics into generic
  metadata

### Suggested owner profile

Architecturally minded full-stack engineer with product support for governance
rules

### Dependencies

- WP-09 for the shared metadata operating model

### Acceptance criteria

- at least one low-risk extension type works end to end with validation and
  audit capture
- formulas are deterministic, typed, and inspectable
- a documented promotion checklist exists for moving successful extensions into
  core schema
- the extensibility docs and architecture docs stay aligned on what is and is
  not allowed
