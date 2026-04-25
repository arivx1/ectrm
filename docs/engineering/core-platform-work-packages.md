# Governed Core Platform Work Packages

## Goal

Turn the governed-core roadmap into concrete work packages that harden one
end-to-end operating slice before ECTRM expands more product breadth or agent
authority.

These packages assume:

- one product family is chosen first
- the current stack and modular-monolith direction remain in place
- deterministic services own business truth and mutation authority
- action requests become a shared workflow primitive
- the assistant runtime remains a subordinate read, explain, draft, and stage
  layer

## Primary Design Inputs

- [Governed Core Platform Roadmap](./core-platform-roadmap.md)
- [Governed Core Platform Slice Lock](./core-platform-slice-lock.md)
- [Platform Blueprint](./platform-blueprint.md)
- [ADR 0002: V2 Application Architecture And Canonical Domain Boundaries](../adr/0002-v2-application-architecture.md)
- [Business Use Case Roadmap](./business-use-case-roadmap.md)
- [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- [AI Workflow](./ai-workflow.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)

## Current Repo Anchors

- event and projection seams already exist for core trading records
- backend domain scaffolding already supports additive migration
- reference-data, pre-trade, operations, settlement, and assistant surfaces
  already expose useful slices of the future system
- assistant run tracing, evals, and action-request governance are ahead of many
  prototype systems and should become the pattern for other automation seams
- current product breadth is wider than the maturity of the core trade,
  reference-data, policy, and settlement model

## Delivery Order

### Wave 0: Scope Lock And Boundary Reset

1. GCP-01 first product slice lock
2. GCP-02 authority-first domain boundary reset
3. GCP-03 explicit trade command model

### Wave 1: Trustworthy Transaction Spine

4. GCP-04 canonical business-event envelope
5. GCP-05 projection freshness and replay safety
6. GCP-06 reference-data governance v1
7. GCP-07 policy and entitlements service v1

### Wave 2: Economic Truth And External Safety

8. GCP-08 side-effect ledger and integration outbox
9. GCP-09 position as-of and valuation basis
10. GCP-10 settlement preview and exception model

### Wave 3: Shared Workflow And Queue-Led Product Surfaces

11. GCP-11 action requests as a shared workflow primitive
12. GCP-12 queue-led operator slice

### Wave 4: Governed AI Inside Stable Boundaries

13. GCP-13 AI gateway authority boundary
14. GCP-14 governed AI pilot and outcome gate

## Shared Definition Of Done

Each work package is done only when:

- new or changed write paths use typed domain or application services
- stale-state checks, idempotency rules, and audit expectations are explicit
  for the affected mutations
- reports, admin panels, assistant tools, and frontend code do not become the
  only place a business rule exists
- verification is added at the narrowest lane that proves the change:
  API tests, assistant evals, web tests, or browser smoke
- docs are updated when operating-model, authority, or deterministic-rule
  boundaries change
- recurring deterministic judgments are captured in the
  [Agent Knowledge Base](./agent-knowledge-base.md)

## GCP-01: First Product Slice Lock

### Priority

P0

### Size

S

### Outcome

The team aligns on one product family and one governed end-to-end workflow
slice, with explicit out-of-scope items for the core-platform phase.

### Status

Drafted in [Governed Core Platform Slice Lock](./core-platform-slice-lock.md).

### Scope

- choose the first product family
- name the target end-to-end path:
  `capture -> approval -> lifecycle -> position impact -> settlement preview -> audit/explanation`
- define the minimum persona path for trader, operations, and settlement review
  inside that slice
- publish the out-of-scope list for this phase
- align seed data, demos, and browser smoke targets with the chosen slice

### Out Of Scope

- a second product family
- new top-level workspaces that are not needed for the slice
- broader AI autonomy decisions

### Acceptance Criteria

- the chosen product family and golden path are documented
- in-scope and out-of-scope items are explicit
- the chosen slice maps to a deterministic smokeable demo path
- new roadmap work can be evaluated against the slice before approval

### Verification

- docs review
- link and reference checks in touched planning docs

## GCP-02: Authority-First Domain Boundary Reset

### Priority

P0

### Size

M

### Outcome

The repo has a canonical module direction based on business authority and
invariants rather than UI surfaces.

### Scope

- define the durable core seams:
  `trade_lifecycle`, `reference_data`, `market_data`, `risk`, `settlement`,
  `operations`, `workflow`, `policy`, `documents`, `integrations`,
  `ai_gateway`, and `audit`
- explain how those seams fit the additive migration path from ADR 0002
- define allowed dependency direction between those seams
- document that `admin`, `reports`, and `assistant` are surfaces or
  orchestration layers, not the only home of business truth
- identify anti-patterns such as business rules living only in frontend code,
  prompts, or report queries

### Out Of Scope

- moving every existing file immediately
- deployment or database splitting

### Acceptance Criteria

- planning docs agree on the target module direction
- new work can name an owning durable seam before implementation starts
- cross-cutting surfaces no longer read like business-rule dumping grounds

### Verification

- docs review across roadmap, blueprint, and related planning docs

## GCP-03: Explicit Trade Command Model

### Priority

P0

### Size

M

### Outcome

Critical trade lifecycle writes move toward explicit commands and handlers
instead of generic update behavior.

### Scope

- define the first command catalog for the chosen slice:
  `BookTrade`, `AmendTradeTerms`, `CancelTrade`, `CorrectTrade`, and any other
  minimum needed mutation
- map existing routes and forms to command-oriented service entry points
- define expected-version and stale-state semantics for the commands
- document which lifecycle actions are still deferred

### Out Of Scope

- full coverage for every future lifecycle action
- a one-commit rewrite of all trading routes

### Acceptance Criteria

- generic update semantics are no longer the target direction for trade writes
- the first command catalog is documented and testable
- command ownership and stale-state expectations are explicit

### Verification

- focused API tests when the first command handlers land
- contract or schema tests for new command payloads

## GCP-04: Canonical Business-Event Envelope

### Priority

P0

### Size

M

### Outcome

Trade and workflow events use a consistent versioned envelope that is safe to
replay and defensible in audit.

### Scope

- define required metadata for governed business events:
  actor, role context, source, command ID, correlation ID, causation ID,
  expected record version, policy version, reference-data version,
  business timestamp, system timestamp, effective date, and correction linkage
- define event schema versioning and upcast expectations
- distinguish business facts from CRUD delta noise
- document which existing events need follow-up migration or compatibility
  handling

### Out Of Scope

- event-sourcing every table
- redesigning all historical rows in one pass

### Acceptance Criteria

- the canonical envelope is documented and reusable
- new event work does not need to invent ad hoc metadata fields
- replay and audit questions can be answered from the envelope design

### Verification

- focused schema tests when the first versioned envelope lands
- replay fixture updates where event metadata changes

## GCP-05: Projection Freshness And Replay Safety

### Priority

P0

### Size

M

### Outcome

Operator and reviewer surfaces can see whether projections are current enough
to trust, and rebuild paths are safe and observable.

### Scope

- expose projection version, last applied event, refresh time, and stale state
- define pending-command or lag behavior where useful for review
- add rebuild-from-zero and replay safety expectations
- document duplicate, missing, and out-of-order event handling
- ensure replay and rebuild paths never re-trigger external side effects

### Out Of Scope

- full streaming infrastructure redesign
- background-worker platform expansion beyond current needs

### Acceptance Criteria

- projection freshness is a product-visible concept
- stale approvals or reviews can be blocked deterministically
- replay, rebuild, and lag expectations are explicit for the first slice

### Verification

- focused API tests for freshness metadata
- projection rebuild and replay tests for the first slice

## GCP-06: Reference-Data Governance V1

### Priority

P0

### Size

L

### Outcome

The chosen slice's reference data becomes versioned, approval-aware, and safe
enough to support deterministic validation and downstream explanation.

### Scope

- add or harden effective dating, version history, and status transitions
- define maker-checker expectations where required
- add dependency protection and impact analysis for in-use records
- capture provenance for source and override context
- define which reference-data areas are critical for the first slice

### Out Of Scope

- all future reference-data entities
- custom field and formula extensibility redesign

### Acceptance Criteria

- critical reference data for the chosen slice can answer "what was valid when"
- destructive edits are replaced by governed status and version transitions
- dependent workflows can detect invalid or stale reference assumptions

### Verification

- focused API tests for effective dating and dependency protection
- web tests for approval or version-state surfaces when added

## GCP-07: Policy And Entitlements Service V1

### Priority

P0

### Size

L

### Outcome

The platform can answer deterministic authorization and approval questions
through one policy seam instead of scattered route, UI, and assistant checks.

### Scope

- define the first policy contract:
  `can(subject, action, object, context)`
- cover the chosen slice's key checks, such as book access, mutation authority,
  reviewer role, segregation of duties, and override rules
- define policy snapshot or version capture for audit-sensitive paths
- align assistant action-request staging with the same policy seam

### Out Of Scope

- every future policy rule in one wave
- a third-party policy-engine migration by itself

### Acceptance Criteria

- core write and approval paths for the chosen slice do not rely on scattered
  policy checks
- the same policy contract can be reused by human and assistant paths
- approval and override rules are explicit and testable

### Verification

- focused API tests for permission and reviewer-role outcomes
- assistant eval updates where staging behavior depends on policy

## GCP-08: Side-Effect Ledger And Integration Outbox

### Priority

P0

### Size

M

### Outcome

External effects become replay-safe, idempotent, and independently auditable
instead of being casually mixed into core event handling.

### Scope

- define an outbox or side-effect ledger for outbound actions
- capture payload hash, destination, idempotency key, submission attempt,
  acknowledgement, retry state, and override context
- identify which current or planned flows need the pattern first
- document replay-safe integration expectations for the first slice

### Out Of Scope

- every integration rewrite in one pass
- broad message-bus adoption

### Acceptance Criteria

- the first external-effect boundary is documented and owned
- replay does not imply re-sending external commitments
- side effects have clearer failure and acknowledgement semantics

### Verification

- focused service tests for idempotency and retry behavior
- integration-oriented tests where the first outbox flow lands

## GCP-09: Position As-Of And Valuation Basis

### Priority

P1

### Size

M

### Outcome

Positions become explicit as-of views, and valuation or pricing outputs cite
their input basis instead of reading like opaque projections.

### Scope

- define as-of semantics for position reads in the chosen slice
- define the minimum market-data or valuation-basis contract needed for that
  slice
- capture snapshot IDs, freshness, and input provenance for valuation-sensitive
  outputs
- keep risk or valuation outputs immutable where the slice needs them

### Out Of Scope

- a full cross-commodity risk engine
- advanced hedging analytics

### Acceptance Criteria

- operators can tell what time and input basis a position or valuation output
  reflects
- downstream explanation surfaces can cite the same basis
- the first valuation-sensitive workflow stops depending on hand-wavy implied
  context

### Verification

- focused API tests for as-of contracts
- calculation or snapshot fixture tests where valuation basis is introduced

## GCP-10: Settlement Preview And Exception Model

### Priority

P0

### Size

L

### Outcome

Settlement becomes a first-class governed domain for the chosen slice, starting
with preview, readiness, and exception visibility before issuance or payment
execution.

### Scope

- define the settlement preview record or service contract for the slice
- capture readiness checks, dispute flags, tolerance warnings, and blocker
  reasons
- define the minimum downstream objects and statuses for invoice or payment
  follow-through
- align settlement review surfaces with the same deterministic rule outputs

### Out Of Scope

- full accounting export redesign
- every future accrual or payment scenario

### Acceptance Criteria

- settlement is modeled as more than a report
- invoice or payment actions can cite deterministic readiness and blocker state
- operators can inspect why a record is ready, blocked, disputed, or stale

### Verification

- focused API tests for settlement preview and blocker rules
- web tests for exception and readiness rendering

## GCP-11: Action Requests As A Shared Workflow Primitive

### Priority

P0

### Size

M

### Outcome

Action requests become a common workflow record for humans, assistants, and
future automation rather than an assistant-only artifact.

### Scope

- move planning and contract language toward a workflow-domain primitive
- require owning work object, reviewer role, rationale, evidence, stale-state
  basis, and idempotency key
- document how human-created and assistant-created requests share the same
  review and execution seams
- align approval surfaces and audit views with the shared contract

### Out Of Scope

- full workflow engine generalization
- promotion to autonomous execution

### Acceptance Criteria

- action requests are described as a platform primitive, not only an assistant
  feature
- reviewers can understand the requested change without opening the original
  chat
- human and assistant paths can converge on the same approval and execution
  pattern

### Verification

- focused API tests for action-request metadata and stale-state behavior
- assistant eval updates for staging semantics

## GCP-12: Queue-Led Operator Slice

### Priority

P1

### Size

M

### Outcome

The first product slice becomes queue- and exception-led instead of relying
only on wide navigation and page hopping.

### Scope

- identify the first high-signal queues for the chosen slice
- map queue entries to owning work objects and manual takeover paths
- keep existing detail pages as drill-down destinations
- make rationale, freshness, and blocker state visible in the queue surface

### Out Of Scope

- replacing every workspace
- a generic queue framework for all future domains

### Acceptance Criteria

- the chosen slice has at least one operator queue that drives real work
- queue items link into the same governed detail and action seams
- the queue does not invent business logic separate from domain services

### Verification

- focused web tests for queue rendering and drill-down behavior
- browser smoke updates for the chosen end-to-end path where needed

## GCP-13: AI Gateway Authority Boundary

### Priority

P0

### Size

M

### Outcome

The assistant runtime is explicitly boxed into least-privilege read and staging
seams, with no direct mutation authority over core business records.

### Scope

- document the AI gateway contract and least-privilege rules
- ensure allowed tool categories stay read-only unless a typed action-request
  staging seam is involved
- define data classification, masking, trace-retention, and provider-routing
  expectations for the chosen slice
- align model or provider selection with workflow risk tier where needed

### Out Of Scope

- provider proliferation for higher-trust workflows
- broader autonomous execution

### Acceptance Criteria

- the AI runtime has no ambiguous direct write path into trade, settlement,
  reference-data, or policy records
- read tools are scoped by the same entitlements and data-governance rules as
  human views
- traces and provider choices are documented as governance concerns, not only
  runtime details

### Verification

- `make api-assistant-evals`
- focused tests for tool allowlists, masking, or policy-scoped reads

## GCP-14: Governed AI Pilot And Outcome Gate

### Priority

P1

### Size

M

### Outcome

AI adds value only inside the proven governed slice, and promotion beyond
`Stage` remains blocked until outcome evidence says otherwise.

### Scope

- choose the first AI pilot workflows for the slice, such as explanation,
  drafting, exception summarization, or typed action-request suggestions
- define measurable success and stop conditions
- align pilot evals, browser smoke, and outcome metrics with the slice
- document the evidence required before any authority increase is discussed

### Out Of Scope

- broad autonomous execution
- pilots that are not tied to the chosen product slice

### Acceptance Criteria

- pilots improve comprehension, draft quality, or review speed in the slice
- pilots stay within read, explain, draft, or stage authority
- approval, correction, stale-action, and failure metrics exist before any
  promotion discussion

### Verification

- `make api-assistant-evals`
- `make web-test`
- `make web-smoke-test` when the pilot changes browser-level workflow
