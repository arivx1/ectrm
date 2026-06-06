# Governed Core Platform Roadmap

## Purpose

This roadmap narrows the next 12 to 18 months of ECTRM work to proving one
trustworthy end-to-end operating slice for one product family.

It exists to keep the repo from expanding workspaces, AI surfaces, reporting
paths, and auxiliary domains faster than the trade, reference-data, policy,
position, and settlement spine can safely support.

## Related Docs

- [Platform Blueprint](./platform-blueprint.md)
- [Governed Core Platform Slice Lock](./core-platform-slice-lock.md)
- [Governed Core Platform Boundary Reset](./core-platform-boundary-reset.md)
- [Governed Core Trade Command Model](./core-platform-trade-command-model.md)
- [ADR 0002: V2 Application Architecture And Canonical Domain Boundaries](../adr/0002-v2-application-architecture.md)
- [Business Use Case Roadmap](./business-use-case-roadmap.md)
- [Premium E/CTRM Gap Bridge Work Packages](./premium-ectrm-gap-bridge-work-packages.md)
- [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- [AI Workflow](./ai-workflow.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Governed Core Platform Work Packages](./core-platform-work-packages.md)
- [Excel-Style Reporting Architecture](./excel-style-reporting-architecture.md)

## Roadmap Goal

ECTRM should support one serious governed workflow slice where the platform can:

- capture a trade through explicit commands and versioned business events
- apply deterministic policy and approval rules before sensitive mutations land
- rebuild current trade and position state with freshness and replay safety
- preview downstream settlement posture and exception state
- expose audit, provenance, and explanation surfaces that humans can inspect
- let AI read, explain, draft, and stage typed action requests without direct
  mutation authority over business records

Success for this roadmap is not "more surfaces." Success is one product family
with a trustworthy spine:

`capture -> approval -> lifecycle -> position impact -> settlement preview -> audit/explanation`

The premium E/CTRM gap bridge uses this same slice as the path from prototype
surface area toward premium-grade capability. It should sharpen this roadmap,
not widen it into a multi-commodity feature chase.

## Planning Posture

1. Prove one product family first.
   Depth beats breadth during this phase.

2. Keep the modular-monolith path.
   Preserve the current stack and additive migration path. Do not split into
   microservices because the repo is broad; split only when boundaries and load
   justify it.

3. Keep deterministic services as the source of truth.
   Trade lifecycle, reference data, permissions, policy, valuation basis,
   settlement state, and external side-effect rules belong in typed services,
   not prompts, reports, or frontend helpers.

4. Treat action requests as a shared workflow primitive.
   Approval-gated mutations should be reusable across humans, assistants,
   automation, and future bulk tools.

5. Keep the AI gateway subordinate.
   The assistant runtime is a governed acceleration layer, not a parallel
   authority system. It may read, explain, draft, and stage, but it should not
   bypass the same service, policy, stale-state, idempotency, and audit seams
   used by human workflows.

6. Make queue-led work the product destination.
   Workspace breadth is useful, but the long-term operating model should be
   queue- and exception-led rather than a collection of thin pages.

7. Treat admin and reports as surfaces, not dumping grounds.
   They may orchestrate, summarize, and supervise. They should not become the
   only place a business rule exists.

## Current Repo Signals

The repo already has several strong anchors:

- event-led trade history and projection rebuild patterns
- backend domain scaffolding under `apps/api/app/domains`
- a GUI-first operator console with increasingly specialized workspaces
- explicit assistant governance docs, traces, evals, and staged action paths
- growing reference-data and pre-trade seams that already point toward richer
  domain ownership

The biggest current risk is sequencing:

- the product surface is broad relative to the maturity of the core domain
  semantics
- some planning and runtime seams still mix business domains with surfaces such
  as `admin`, `reports`, and `assistant`
- assistant governance is more explicit than some underlying policy,
  reference-data, lifecycle, and settlement seams
- the next phase could accidentally build a polished platform shell around an
  insufficiently governed core if scope is not narrowed deliberately

## 12 To 18 Month Target Outcome

For one product family, ECTRM should support:

- governed trade capture through explicit commands
- versioned business events with replay-safe metadata
- current trade and position views with freshness indicators
- versioned and approval-aware reference data for the slice
- deterministic policy and entitlement checks
- settlement preview with exception visibility
- action requests with reviewer context and stale-state enforcement
- audit and explanation surfaces that cite the same records and rule outputs
- AI assistance that improves explanation, drafting, and review speed without
  creating a shadow write path

## Target Module Direction

ECTRM can keep the accepted domain-oriented architecture from ADR 0002 while
sharpening the durable authority seams inside it. New work should trend toward
these cores, even if some of them start as subpackages inside existing domains:

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

Notes:

- `admin` remains an important supervision and configuration surface, but not a
  primary home for business truth.
- `reports` remain important outputs, but report logic should be assembled from
  governed domain and projection seams rather than becoming a hidden business
  rules layer.
- `assistant` evolves toward an `ai_gateway` posture: governed prompt assembly,
  tool access, traces, evals, and staged action creation, but not direct record
  mutation.

## Delivery Order

### Wave 0: Scope Lock And Boundary Reset

Outcome:

- the team aligns on the first product family and stops expanding laterally
  during core-platform hardening

Primary packages:

- GCP-01 first product slice lock
- GCP-02 authority-first domain boundary reset
- GCP-03 explicit trade command model

Exit criteria:

- the first product slice is documented with explicit out-of-scope items
- new work can name the owning core module before implementation starts
- no critical lifecycle write depends on a generic "update trade" path

### Wave 1: Trustworthy Transaction Spine

Outcome:

- the trade and projection foundation becomes safe enough to support
  settlement, review, and staged action flows without ambiguity

Primary packages:

- GCP-04 canonical business-event envelope
- GCP-05 projection freshness and replay safety
- GCP-06 reference-data governance v1
- GCP-07 policy and entitlements service v1

Exit criteria:

- lifecycle events carry replay-safe metadata and versioning
- projections expose freshness and lag state to operators and reviewers
- the first reference-data set for the slice is versioned, approval-aware, and
  dependency-safe
- policy checks answer who can act on what under which context

### Wave 2: Economic Truth And External Safety

Outcome:

- downstream economic and operational consequences are modeled as governed
  platform outputs rather than inferred from thin projections

Primary packages:

- GCP-08 side-effect ledger and integration outbox
- GCP-09 position as-of and valuation basis
- GCP-10 settlement preview and exception model

Exit criteria:

- external side effects are replay-safe and independently auditable
- position and valuation outputs cite their input basis and freshness
- settlement preview and exception posture are available before downstream
  issuance or payment actions

### Wave 3: Shared Workflow And Queue-Led Product Surfaces

Outcome:

- humans and agents work through the same approval and review objects, and the
  operator experience starts to center on queues and exceptions instead of only
  page navigation

Primary packages:

- GCP-11 action requests as a shared workflow primitive
- GCP-12 queue-led operator slice

Exit criteria:

- staged actions are not assistant-only artifacts
- queue surfaces exist for the chosen slice's approvals, blockers, or
  exceptions
- humans can take over from the relevant workspace without relying on chat
  context

### Wave 4: Governed AI Inside Stable Boundaries

Outcome:

- AI improves work speed inside a proven control model instead of stretching
  product scope

Primary packages:

- GCP-13 AI gateway authority boundary
- GCP-14 governed AI pilot and outcome gate

Exit criteria:

- the AI runtime can read, explain, draft, and stage through least-privilege
  seams only
- pilot workflows improve comprehension or cycle time without creating a new
  mutation bypass
- promotion beyond `Stage` remains blocked until deterministic policy,
  outcome evidence, and rollback expectations are strong enough

## Not Now

Defer these during the governed-core phase unless the first product slice
cannot ship without them:

- broad autonomous execution
- broad workspace expansion outside the first slice
- generic report builders
- highly configurable agent profiles beyond enforceable capability metadata
- multi-provider optimization for higher-trust workflows
- microservice decomposition
- broad weather-as-a-domain work unless it is part of the chosen product slice
- advanced hedge automation and wider market-research surfaces

## First 90 Days

The first 90 days should establish the scope and trust boundaries, not chase
new surface area.

### Month 1

- finish GCP-01, GCP-02, and the planning portion of GCP-03
- name the first product family and golden-path workflow
- publish the out-of-scope list and dependency rules

### Month 2

- complete GCP-03 implementation planning
- define GCP-04 event metadata and GCP-05 projection freshness contracts
- begin replay and rebuild test planning for the first slice

### Month 3

- start GCP-06 and GCP-07 for the chosen slice's critical reference and policy
  seams
- define the first side-effect ledger boundary from GCP-08
- update browser smoke and seed data to prove the chosen end-to-end path

## Decision Rule For New Work

When a proposed feature or refactor appears during this roadmap, ask:

1. Does it make the chosen governed slice more trustworthy end to end?
2. Does it harden deterministic business truth, policy, replay safety, or
   reviewability?
3. Does it keep AI within read, explain, draft, or stage boundaries?
4. Does it reduce hidden logic in reports, admin surfaces, prompts, or frontend
   helpers?

If the answer is no, the work should usually be deferred until the governed
core slice is proven.
