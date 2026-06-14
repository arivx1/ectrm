# Governed Core Platform Boundary Reset

## Purpose

This document fulfills `GCP-02` from the
[Governed Core Platform Work Packages](./core-platform-work-packages.md). It
turns the governed-core roadmap into a concrete authority-first boundary map so
the team can harden the first product slice without pushing business logic into
UI surfaces, reports, admin helpers, or assistant-specific code.

This is an additive refinement of
[ADR 0002: V2 Application Architecture And Canonical Domain Boundaries](../adr/0002-v2-application-architecture.md),
not a replacement for it. ADR 0002 established the repo's domain-oriented
direction. This document sharpens which seams should own durable business truth
inside that architecture while the platform proves its first governed slice.

## Related Docs

- [Governed Core Platform Roadmap](./core-platform-roadmap.md)
- [Governed Core Platform Slice Lock](./core-platform-slice-lock.md)
- [Governed Core Platform Work Packages](./core-platform-work-packages.md)
- [ADR 0002: V2 Application Architecture And Canonical Domain Boundaries](../adr/0002-v2-application-architecture.md)
- [Platform Blueprint](./platform-blueprint.md)
- [AI Workflow](./ai-workflow.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)

## Boundary Goal

New work should organize around business authority and invariants first, then
map those seams into routes, reports, workspaces, assistant tools, and admin
surfaces.

The main correction this document makes is simple:

- `admin` is not a business domain
- `reports` is not a business domain
- `assistant` is not a business domain

They are important product surfaces, but they should not become the only place
where durable business rules live.

## Design Rules

1. Deterministic services own business truth.
   Trade validity, reference-data validity, permissions, approval rules,
   settlement readiness, valuation basis, and external side-effect eligibility
   belong in typed services and policies.

2. Surfaces orchestrate; domains decide.
   Routes, workspaces, admin panels, report endpoints, and assistant tools may
   compose and present results, but they should not invent the underlying
   business rule.

3. Query surfaces may summarize; they may not redefine.
   Reports and admin views should summarize governed outputs. If a report is
   the only place a rule exists, the boundary is wrong.

4. The AI runtime is subordinate.
   The assistant may read, explain, draft, and stage typed action requests, but
   it should not become a second mutation architecture.

5. Workflow coordinates; owning domains validate.
   Approval, queueing, and action-request routing may live in a workflow seam,
   but the owning domain still decides whether the requested mutation is valid.

## Current Repo Starting Point

The repo already has useful domain scaffolding under `apps/api/app/domains`:

- `trading`
- `reference_data`
- `risk`
- `operations`
- `settlement`
- `reports`
- `admin`
- `assistant`
- plus newer seams such as `documents`, `weather`, `accruals`, and `codex`

This is a good prototype-to-product bridge, but it is still easy for business
logic to drift into cross-cutting surfaces:

- `admin` can become a dumping ground for supervision plus hidden business
  decisions
- `reports` can become a place where joins and conditional logic quietly define
  product truth
- `assistant` can become a shadow workflow engine if action and policy seams do
  not stay explicit

`GCP-02` exists to stop that drift early.

## Authority-First Core Seams

During the governed-core phase, new work should trend toward these durable
seams, even when the first implementation still lives inside an existing ADR
0002 domain package:

```text
trade_lifecycle
reference_data
market_data
risk
settlement
operations
workflow
policy
documents
integrations
ai_gateway
audit
```

These are not a demand for a big-bang directory rewrite. They are the target
ownership map for service boundaries and code review.

## Seam Definitions

### `trade_lifecycle`

Owns:

- trade commands
- lifecycle validation
- event append semantics
- trade versioning and stale-state checks
- correction, reversal, cancel, amend, and related lifecycle rules

Does not own:

- AI prompt behavior
- report-only projections
- settlement readiness decisions
- generic workflow inbox behavior

### `reference_data`

Owns:

- effective-dated master data
- active or inactive eligibility
- dependency-safe deactivation
- provenance and approval of operational reference records

Does not own:

- trade command decisions beyond reference validity
- assistant-specific lookup behavior
- report formatting

### `market_data`

Owns:

- marks, observations, fixings, curves, and related source freshness
- market-data snapshot IDs and provenance
- normalization of external pricing inputs

Does not own:

- trade lifecycle decisions
- risk policy
- report-only derived metrics that should live in risk or settlement

### `risk`

Owns:

- exposure decomposition
- valuation basis and immutable result records where applicable
- risk exceptions and risk-oriented derived outputs

Does not own:

- trade booking
- policy approval decisions
- assistant role behavior

### `settlement`

Owns:

- settlement readiness and blocker rules
- invoice and payment state
- settlement exceptions
- cashflow or preview records for the chosen slice

Does not own:

- generic queue logic
- trade lifecycle truth
- AI action authority

### `operations`

Owns:

- operational follow-through for confirmed trades
- workflow-supporting facts such as confirmations, deliveries, or operations
  exceptions where those records are part of the business domain

Does not own:

- generic action approval plumbing
- trade booking truth
- reference-data authority

### `workflow`

Owns:

- action requests
- approval metadata
- queue state
- reviewer assignments
- escalation and stale-review coordination

Does not own:

- whether a trade, invoice, or payment mutation is valid
- underlying domain calculations
- prompt behavior

### `policy`

Owns:

- authorization
- reviewer-role eligibility
- segregation-of-duties rules
- override rules
- approval thresholds
- policy snapshots used by high-trust actions

Does not own:

- the business records being mutated
- prompt wording
- report rendering

### `documents`

Owns:

- document ingestion records
- extraction staging
- document linkage evidence
- document version and provenance

Does not own:

- direct mutation of commercial records from extraction output
- settlement or trade truth by itself

### `integrations`

Owns:

- external sync adapters
- outbox or side-effect delivery
- acknowledgement and retry semantics
- integration-specific provenance

Does not own:

- direct business-record writes that bypass typed services
- report-only joins

### `ai_gateway`

Owns:

- prompt assembly
- tool registration and least-privilege exposure
- provider routing and model metadata
- run tracing
- eval hooks
- typed action-request staging

Does not own:

- direct trade, settlement, policy, or reference-data mutation
- hidden business rules that humans cannot inspect outside the assistant

### `audit`

Owns:

- append-only provenance
- run, action, and event traceability
- audit-safe correlation between commands, events, projections, approvals, and
  side effects

Does not own:

- business validity by itself
- UI-only narratives disconnected from governed records

## Dependency Direction

The preferred dependency flow for the governed-core phase is:

1. `reference_data` and `policy` are foundational.
2. `trade_lifecycle` depends on `reference_data` and `policy`.
3. `market_data` is an external-input seam with its own provenance and may be
   consumed by `risk` and `settlement`.
4. `risk`, `settlement`, and `operations` consume governed trade, reference,
   policy, and market-data outputs as needed.
5. `workflow` coordinates review and action routing on top of owning domain
   facts and services.
6. `integrations` and `documents` call typed domain or workflow seams; they do
   not bypass them.
7. `ai_gateway`, admin surfaces, and report surfaces sit outside the business
   core and compose read or stage paths through those seams.
8. `audit` spans the system but should not become a hidden business-rules
   engine.

### Allowed Dependency Examples

- `trade_lifecycle -> reference_data`
- `trade_lifecycle -> policy`
- `risk -> trade_lifecycle`
- `risk -> market_data`
- `settlement -> trade_lifecycle`
- `settlement -> reference_data`
- `settlement -> policy`
- `workflow -> policy`
- `workflow -> trade_lifecycle`
- `workflow -> settlement`
- `ai_gateway -> workflow`
- `ai_gateway -> governed read/query services`
- `reports surface -> governed query services`
- `admin surface -> governed query services`
- `integrations -> typed application services`

### Disallowed Dependency Examples

- `trade_lifecycle -> ai_gateway`
- `trade_lifecycle -> admin`
- `trade_lifecycle -> reports`
- `settlement -> assistant prompt code`
- `policy -> frontend route state`
- `workflow -> inventing domain validity rules`
- `documents -> directly creating official trade or settlement truth from raw
  extraction`
- `integrations -> raw ORM writes into business tables`

## Mapping From Current Repo Domains

This map helps reviewers place new work without requiring an immediate
directory-level rewrite.

### Current `trading`

Primary future ownership:

- `trade_lifecycle`

Likely follow-on splits later:

- some query or projection helpers may migrate toward `workflow`, `risk`, or
  `audit` depending on the owning rule

### Current `reference_data`

Primary future ownership:

- `reference_data`

### Current `risk`

Primary future ownership:

- `risk`
- parts of `market_data` consumption depending on source handling

### Current `settlement`

Primary future ownership:

- `settlement`

### Current `operations`

Primary future ownership:

- `operations`
- some queue or review coordination may move toward `workflow`

### Current `documents`

Primary future ownership:

- `documents`

### Current `assistant`

Primary future ownership:

- `ai_gateway`
- temporary home for staged action orchestration until `workflow` is promoted

Important constraint:

- do not let `assistant` remain the only place action-review logic, allowed
  action semantics, or stop conditions exist

### Current `admin`

Primary future ownership:

- admin and supervision surfaces over `workflow`, `ai_gateway`, `policy`,
  `audit`, and integration status

Important constraint:

- `admin` may expose controls and visibility, but it should not become the only
  place domain rules or record mutations are implemented

### Current `reports`

Primary future ownership:

- reporting and query surfaces over `risk`, `settlement`, `operations`,
  `workflow`, and `audit`

Important constraint:

- do not place source-of-truth business calculations only in report builders or
  report queries

### Current `weather`

Primary future ownership:

- `market_data` or `integrations`, unless weather becomes a direct first-class
  business domain for a later product family

### Current `accruals`

Primary future ownership:

- settlement-adjacent domain logic that may remain closely coupled to
  `settlement` until the accrual subsystem matures

### Current `codex`

Primary future ownership:

- platform or admin automation surface, not business-record truth

## Surface Rules

### Admin

Allowed:

- supervision
- configuration
- policy visibility
- run and approval visibility
- integration status

Not allowed as the only home for:

- trade validity rules
- settlement readiness rules
- reference-data dependency logic

### Reports

Allowed:

- aggregation
- historical views
- export formatting
- operator or management summaries

Not allowed as the only home for:

- PnL realization switches
- settlement reconciliation truth
- exposure calculations
- lifecycle status derivation

### Assistant

Allowed:

- explain
- draft
- summarize
- route
- create typed action requests

Not allowed as the only home for:

- approval policy
- action validity rules
- business mutation semantics
- stop-condition enforcement

### Frontend Workspaces And Helpers

Allowed:

- display
- navigation
- local interaction state
- non-authoritative composition of governed backend outputs

Not allowed as the only home for:

- pricing rules
- entitlement logic
- settlement logic
- lifecycle validity

## Anti-Patterns To Reject

Reject or refactor work when it introduces these patterns:

- business rules that exist only in `admin`
- business rules that exist only in `reports`
- business rules that exist only in prompts or agent profiles
- business rules that exist only in frontend helpers or form defaults
- assistant tools that write directly to business tables
- integration code that bypasses typed services and writes raw ORM rows
- workflow queues that decide business validity instead of routing work
- document extraction that directly creates official business records without
  staging, validation, and review

## Review Checklist

When reviewing new work, ask:

1. Which durable seam owns this rule or mutation?
2. Is the code being placed in a surface because that was convenient?
3. Could a human inspect the same governed output outside the assistant?
4. Would a report still be correct if its bespoke query logic disappeared?
5. Would the owning domain still be valid if the admin panel were removed?
6. Is the workflow seam coordinating, or is it quietly deciding business
   truth?
7. Is the AI runtime composing governed outputs, or inventing a second policy
   system?

If those questions do not have clean answers, the boundary is probably wrong.

## Practical Next Steps

- use this boundary map when implementing `GCP-03` through `GCP-14`
- bias new code toward the owning seam even if compatibility imports or
  compatibility routes still exist
- prefer small refactors that move rule ownership first, then move files later
- update the agent knowledge base whenever recurring rule-placement judgment
  becomes deterministic enough to encode as a planning or review rule
