# Agent Knowledge Base

## Purpose

This file is the shared memory surface for agents working in this repo. Use it
to preserve reusable lessons about autonomy, deterministic algorithms, action
governance, stop conditions, and implementation patterns.

The knowledge base should help future agents answer:

- Has this judgment already been turned into deterministic logic?
- Is there a known boundary where agents should draft, stage, or stop?
- What tests, services, or docs should be updated when this pattern appears
  again?
- Which lessons are still proposals, and which are accepted practice?

Keep entries short, cited to repo paths where possible, and safe to review in
source control. Do not store secrets, credentials, private counterparty content,
or raw production data.

## How Agents Should Use This

Before increasing autonomy or adding a new action type:

1. Read [Agent Autonomy Rubric](./agent-autonomy-rubric.md).
2. Search this file for related domains, action types, formulas, and stop
   conditions.
3. Prefer an existing deterministic algorithm or governance pattern when one
   applies.
4. If no pattern exists and the judgment is recurring, propose or implement a
   deterministic algorithm.
5. Add or update a lesson after the work, especially when future agents would
   otherwise have to rediscover the same boundary.

## Entry Types

Use one of these types:

| Type | Use when |
| --- | --- |
| `lesson` | A reusable practice or boundary was learned. |
| `algorithm-candidate` | A recurring judgment should probably become deterministic logic. |
| `algorithm-added` | Deterministic logic was implemented or promoted. |
| `stop-condition` | Future agents should pause, narrow authority, or ask for review. |
| `promotion-signal` | Evidence suggests an agent behavior may be safe to promote. |
| `retirement-signal` | Evidence suggests an agent behavior should be paused, narrowed, or removed. |

## Entry Template

```md
### YYYY-MM-DD - Short Title

- Type: lesson | algorithm-candidate | algorithm-added | stop-condition | promotion-signal | retirement-signal
- Domain:
- Applies to:
- Status: proposed | accepted | implemented | retired
- Source:
- Lesson:
- Deterministic opportunity:
- Agent autonomy impact:
- Tests or evidence:
- Follow-up:
```

## Deterministic Algorithm Proposal Checklist

When an agent proposes a new deterministic algorithm, capture:

- the business question it answers
- the owner or reviewer role
- required inputs and source freshness assumptions
- row-level access or permission assumptions
- exact outputs and allowed states
- rule table, formula, threshold, or invariant set
- edge cases and stop conditions
- service, formula, policy, or projection layer where it belongs
- tests, evals, and fixture data needed
- audit, lineage, idempotency, and rollback expectations

If the proposal touches pricing, risk, settlement, credit, compliance,
permissions, reference data, policy, or external commitments, keep it in
proposal form until a human owner approves the domain rule.

## Lessons

### 2026-04-22 - Deterministic Algorithms Are An Agent Promotion Path

- Type: lesson
- Domain: agent governance
- Applies to: autonomy reviews, repeated recommendations, action-governance
  design, formula and policy promotion
- Status: accepted
- Source: [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: agents should not only choose between current deterministic logic and
  open-ended reasoning. When an agent finds a recurring judgment that can be
  expressed as rules, formulas, thresholds, decision tables, or typed service
  behavior, it should propose or implement deterministic logic through the
  normal engineering path.
- Deterministic opportunity: repeated accepted recommendations, prompt
  instructions that compensate for missing product behavior, and stable review
  decisions should be promoted into formulas, policy rules, projection checks,
  or domain services.
- Agent autonomy impact: creating deterministic logic can increase safe autonomy
  because future agents can rely on inspectable rules instead of restating the
  same judgment in prompts.
- Tests or evidence: algorithm proposals should identify required tests, evals,
  fixtures, audit expectations, and reviewer ownership before promotion.
- Follow-up: when a future agent proposes or adds a deterministic algorithm,
  append a focused `algorithm-candidate` or `algorithm-added` entry here.

### 2026-04-22 - Freeform Output Must Not Mutate Records

- Type: stop-condition
- Domain: action governance
- Applies to: assistant actions, automation, bulk work, record mutations
- Status: accepted
- Source: [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: no agent should directly mutate business records from freeform model
  output. Proposed changes must become typed payloads and flow through the same
  application services, permissions, policy checks, audit capture, and review
  paths as manual UI actions.
- Deterministic opportunity: repeated action patterns should become published
  action types with deterministic validation, stale-state checks, idempotency,
  reviewer metadata, and domain-service execution.
- Agent autonomy impact: an agent can draft or stage a mutation only after a
  typed action contract exists. Without that contract, keep the agent at explain
  or draft.
- Tests or evidence: add service tests for validation, permission failure,
  stale-state handling, idempotency, and audit capture; add assistant evals for
  action-governance prompt behavior.
- Follow-up: when a new mutation pattern appears, create or update the action
  gateway contract before increasing autonomy.

### 2026-04-22 - Durable Work Objects Beat Chat State

- Type: lesson
- Domain: work-object governance
- Applies to: staged actions, handoffs, reports, agent-generated work
- Status: accepted
- Source: [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
  and [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: agents and humans should operate on durable records, not loose chat
  state. If future users need to inspect, approve, correct, or take over work,
  the work needs ownership, lifecycle, provenance, permissions, and action
  history.
- Deterministic opportunity: recurring agent outputs should graduate into
  canonical work objects, report definitions, action requests, review items, or
  domain records with typed lifecycle states.
- Agent autonomy impact: do not stage or execute agent work that has no owning
  work object. Draft first, then propose the durable object if the pattern
  repeats.
- Tests or evidence: verify created work objects carry stable identifiers,
  lifecycle status, actor attribution, policy status, and source links.
- Follow-up: when an agent proposes side-channel work, map it to an existing
  object or add an `algorithm-candidate` entry for a new object/lifecycle.

### 2026-04-22 - External Commitments Stay Human-Only In Phase 1

- Type: stop-condition
- Domain: external commitment governance
- Applies to: trade booking, trade amendment, counterparty communication,
  scheduling commitment, payment release, bank instructions
- Status: accepted
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: Phase 1 agents may not externally commit the firm. They can draft or
  stage approved internal requests, but humans remain responsible for booking
  trades, sending counterparty communications, committing logistics externally,
  and releasing cash.
- Deterministic opportunity: before any narrow external-commit case is
  considered, the platform needs deterministic policy checks, legal/compliance
  approval, replay, monitoring, and a kill switch.
- Agent autonomy impact: if the request can bind the firm externally, reduce
  autonomy to draft or human-only review.
- Tests or evidence: evals should catch over-claims of authority, direct booking
  attempts, payment-release attempts, and external communication send attempts.
- Follow-up: keep external-commitment proposals in governance docs until a
  separate control model exists.

### 2026-04-22 - Operational Values Need Deterministic Formulas

- Type: lesson
- Domain: extensibility and reporting
- Applies to: formulas, calculated columns, report values, derived KPIs
- Status: accepted
- Source: [User Extensibility Initiative](./user-extensibility-initiative.md)
  and [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- Lesson: formulas and derived values must be deterministic, typed,
  side-effect-free, inspectable, and built on approved semantic fields. Agents
  can explain or propose formulas, but they must not become the source of truth
  for operational values.
- Deterministic opportunity: repeated calculations should become formula
  definitions, report definitions, domain services, or promoted schema fields
  when they affect validation, workflow branching, official reporting, or
  integrations.
- Agent autonomy impact: agents may draft a formula proposal and explain lineage,
  but trusted values must be produced by deterministic logic.
- Tests or evidence: formula validation should cover type safety, allowed
  functions, dependency cycles, row-level access, lineage, and rollback.
- Follow-up: when an agent notices a recurring calculation in prompts or reports,
  add an `algorithm-candidate` entry and propose the semantic field inputs.

### 2026-04-22 - Workflow Item Updates Are The First Bounded-Execute Candidate

- Type: promotion-signal
- Domain: operations workflow
- Applies to: workflow owner, due date, status, notes, blocker triage
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: workflow item updates are a strong first candidate for bounded
  autonomous execution because they are internal, inspectable, reversible through
  normal workflow correction, and already represented as durable work objects.
- Deterministic opportunity: encode allowed status transitions, required owner
  roles, stale-state checks, idempotency, due-date rules, and blocker escalation
  as deterministic policy before execution.
- Agent autonomy impact: agents should start at draft or stage. Promotion to
  bounded execute needs high approval rate, low correction rate, deterministic
  policy, eval coverage, audit, and owner sign-off.
- Tests or evidence: service tests should cover status transition policy,
  unauthorized owner changes, stale items, repeated requests, and audit trail.
- Follow-up: implement [AP1-19](./agent-platform-phase-1-tickets.md) to turn
  this promotion signal into deterministic workflow item update policy.

### 2026-04-22 - Document Execution Needs Matching And Ambiguity Policy

- Type: algorithm-candidate
- Domain: document workflow
- Applies to: document routing, linkage, reprocessing, document-created records
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md),
  [Agent Role Catalog](./agent-role-catalog.md), and
  [Document Taxonomy](./document-taxonomy-trading-shipping.md)
- Lesson: document agents are valuable for classification, explanation, and
  ambiguity surfacing, but document linkage and document-created records need
  explicit confidence, matching, ambiguity, and approval policy before they
  become more autonomous.
- Deterministic opportunity: create decision tables for document kind support,
  candidate-record matching, minimum evidence, conflicting evidence, reprocess
  eligibility, and manual-review escalation.
- Agent autonomy impact: reprocessing is a safer first staged action. Linkage
  and record creation should remain draft or approval-gated until deterministic
  matching policy exists.
- Tests or evidence: fixture documents should cover confident match, multiple
  candidates, missing keys, unsupported document kind, stale target record, and
  permission denial.
- Follow-up: when document reviewers repeatedly resolve the same ambiguity,
  promote that decision into matching or routing logic.

### 2026-04-22 - Prompt And Tool Changes Need Evals

- Type: lesson
- Domain: assistant evals
- Applies to: prompts, managed agents, tool allowlists, approval behavior,
  over-claiming certainty
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: managed-agent changes should land with eval coverage, not just ad hoc
  prompt spot checks. This is especially important when a change affects tool
  access, action governance, approval boundaries, or claims of certainty without
  a live read.
- Deterministic opportunity: encode expected prompt sections, tool filters,
  warnings, action-staging behavior, and permission boundaries as fixture evals.
- Agent autonomy impact: do not promote an agent role or action type without eval
  cases that cover the new authority boundary.
- Tests or evidence: run or update `make api-assistant-evals` for assistant or
  automation changes that affect provider selection, tools, prompts, approvals,
  or over-claiming certainty.
- Follow-up: add a knowledge-base entry when an eval reveals a new stop
  condition or promotion signal.

### 2026-04-22 - Pause Thresholds Should Become Deterministic Policy

- Type: algorithm-candidate
- Domain: control tower governance
- Applies to: agent pause, narrow, retire, intervention, outcome review
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- Lesson: agents that create noisy drafts, rejected staged actions, failed
  executions, stale-data claims, or repeated corrections should be paused,
  narrowed, or retired based on explicit thresholds instead of subjective vibes.
- Deterministic opportunity: define pause thresholds for rejection rate,
  correction rate, failed-action rate, stale-data warnings, policy failures,
  repeated unsupported requests, and reviewer override frequency.
- Agent autonomy impact: outcome metrics should control promotion and demotion.
  An agent should not gain authority while its value and failure signals are
  unmeasured.
- Tests or evidence: control tower reports should show run count, staged actions,
  approvals, rejections, failures, corrections, pauses, and reviewer overrides.
- Follow-up: once metrics exist, add `promotion-signal` or `retirement-signal`
  entries based on observed thresholds.

### 2026-04-22 - Projection Integrity Is Deterministic Control Logic

- Type: algorithm-added
- Domain: projection monitoring
- Applies to: projection audit, repair, alert delivery, operational controls
- Status: accepted
- Source: [ADR 0003](../adr/0003-operational-framework-and-projection-monitoring.md)
- Lesson: projection integrity monitoring should use deterministic audit checks
  and deterministic repair paths where safe. Agents may summarize failures or
  draft interventions, but the control itself should remain inspectable and
  repeatable.
- Deterministic opportunity: projection checks and safe repairs are a pattern for
  future control-plane algorithms: define invariants, run state, alert history,
  repair eligibility, and operator-visible outcomes.
- Agent autonomy impact: agents can explain projection issues and recommend
  repair actions, but autonomous repair needs deterministic eligibility,
  persisted run state, audit, and admin-facing controls.
- Tests or evidence: tests should cover clean runs, detected drift, safe repair,
  unsafe repair escalation, alert delivery, and persisted run history.
- Follow-up: use this pattern when designing other operational integrity checks.

### 2026-04-22 - Policy And Reference Data Are Not Prompt Problems

- Type: stop-condition
- Domain: policy and reference data
- Applies to: permissions, limits, reference data, approval thresholds, tool
  access, agent configuration
- Status: accepted
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [User Extensibility Initiative](./user-extensibility-initiative.md)
- Lesson: agents may recommend policy or reference-data changes, but they should
  not mutate policy, permissions, reference data, limits, or agent configuration
  directly. These are versioned, owned, auditable product controls.
- Deterministic opportunity: repeated policy decisions should become versioned
  policy rules, typed configuration, admin workflows, or reference-data services
  with ownership and publish controls.
- Agent autonomy impact: keep these requests at draft recommendation unless a
  human owner explicitly approves a governed workflow.
- Tests or evidence: verify permission checks, ownership metadata, publish or
  retire lifecycle, audit attribution, and rollback path.
- Follow-up: when a prompt contains policy-like instructions, propose moving that
  rule into versioned configuration or typed service logic.

### 2026-04-22 - Internal Reports Can Be Early Autonomy With Source Links

- Type: promotion-signal
- Domain: reporting and reconciliation
- Applies to: desk briefings, exception summaries, settlement packs, sourced
  internal reports
- Status: proposed
- Source: [Human-Agent Authority Matrix](./human-agent-authority-matrix.md) and
  [Agent Role Catalog](./agent-role-catalog.md)
- Lesson: internal report generation is a reasonable early autonomy candidate
  when the output is clearly sourced, not an official external commitment, and
  review burden is lower than manual drafting.
- Deterministic opportunity: repeated report shapes should become report
  definitions over approved semantic fields, with deterministic filters,
  sections, lineage, and freshness checks.
- Agent autonomy impact: agents may generate internal draft reports earlier than
  they may mutate records. Official publication, shared presets, or external use
  should stay draft or stage until publication policy exists.
- Tests or evidence: report evals should verify source links, freshness labels,
  row-level access, no hidden data leakage, and clear uncertainty language.
- Follow-up: promote commonly accepted report formats into governed report
  definitions.
