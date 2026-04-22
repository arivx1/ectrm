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

### 2026-04-22 - Prompt Navigation Is A UI Intent

- Type: lesson
- Domain: prompt-first operator experience
- Applies to: assistant landing surfaces, workspace routing, route handoffs,
  prompt-led old-UX navigation, action governance
- Status: proposed
- Source: [Prompt-First Operator Experience Work Packages](./prompt-first-operator-experience-work-packages.md)
  and [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- Lesson: prompt-led navigation should be modeled as a non-mutating UI intent,
  separate from assistant action requests. The assistant may recommend opening,
  focusing, or filtering a workspace, but business writes must continue through
  typed services, permission checks, audit, and approval-gated action requests
  where required.
- Deterministic opportunity: repeated accepted routing decisions should become
  deterministic intent rules with typed inputs, allowed destinations, rejection
  reasons, and focused browser or assistant-eval coverage.
- Agent autonomy impact: navigation intent can make the assistant feel more
  capable without increasing mutation authority. If the request changes
  records, emits events, or creates external commitments, reduce authority back
  to staged action or manual workflow.
- Tests or evidence: initial proof should cover default prompt landing,
  accepted workspace navigation, focused trade handoff, invalid intent
  rejection, and unsupported mutation fallback.
- Follow-up: implement the prompt-first work packages before considering any
  broader prompt-led execution authority.

### 2026-04-22 - Assistant Feedback Belongs On Runs

- Type: lesson
- Domain: assistant outcome tracking
- Applies to: assistant responses, run tracing, eval inputs, prompt review
- Status: implemented
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: user feedback on an assistant answer should be captured as a durable
  run-level record with user/session provenance, not as loose chat text or a
  hidden prompt adjustment.
- Deterministic opportunity: recurring feedback comments that identify stable
  product behavior, missing evidence rules, or repeatable answer-quality checks
  should feed the deterministic algorithm loop instead of remaining prompt-only.
- Agent autonomy impact: feedback improves promotion and retirement signals,
  but it does not grant mutation authority or change business records directly.
- Tests or evidence: focused API coverage verifies feedback creation, update,
  access scoping, conversation reload serialization, and admin aggregation by
  agent, workspace, recent feedback, and helpful vs. needs-work totals.
- Follow-up: connect recurring needs-work comments to eval cases and agent
  health reviews.

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

### 2026-04-22 - Workflow Item Update Policy Belongs In The Service Layer

- Type: algorithm-added
- Domain: operations workflow
- Applies to: `update_trade_workflow_item`, assistant-staged workflow updates,
  manual workflow item patches, future workflow automation
- Status: implemented
- Source:
  [`workflow_items.py`](../../apps/api/app/domains/operations/services/workflow_items.py),
  [`action_runtime.py`](../../apps/api/app/domains/assistant/services/action_runtime.py),
  and [AP1-19](./agent-platform-phase-1-tickets.md)
- Lesson: workflow item update authority must be evaluated by a shared,
  side-effect-free policy before any route, assistant action, or future
  automation mutates the item. Route-only guards are insufficient because
  assistant approvals can execute through service paths that bypass route
  helpers.
- Deterministic opportunity: use observed approval outcomes, reviewer
  corrections, and policy-failure rates to define promotion thresholds before
  any workflow update moves from staged approval to bounded execution.
- Agent autonomy impact: agents may stage workflow updates only after the policy
  normalizes changes, checks deterministic blockers, and emits reviewer role,
  old/new preview values, stale-state basis, and idempotency key. This does not
  grant bounded autonomous execution yet.
- Tests or evidence: `apps.api.tests.test_operations_workflow_items_api` covers
  the policy review context, terminal transition blocking, due-date windows,
  stale-version failure, idempotent retry handling, assistant execution
  blockers, rollup behavior, and credit constraints;
  `apps.api.tests.test_assistant_evals` covers the assistant governance path.
- Follow-up: use the outcome-metrics endpoint to collect enough workflow-update
  history before proposing any bounded-execution policy expansion.

### 2026-04-22 - Outcome Metrics Can Recommend Autonomy Changes, Not Apply Them

- Type: algorithm-added
- Domain: assistant governance
- Applies to: admin outcome reporting, action request review burden, bounded
  execution promotion review, pause recommendations
- Status: implemented
- Source:
  [`outcome_metrics.py`](../../apps/api/app/domains/assistant/services/outcome_metrics.py),
  [`assistant.py`](../../apps/api/app/routes/assistant.py), and
  [AP1-17](./agent-platform-phase-1-tickets.md)
- Lesson: autonomy promotion needs deterministic observed-outcome thresholds,
  but threshold results should remain advisory until a human owner explicitly
  changes policy. Metrics can identify candidates and noisy agents; they should
  not silently alter authority.
- Deterministic rule: compute action outcome rates from decided action
  requests, stale-action outcomes from stale failures or idempotent stale
  retries, and pause signals from rejection, failed-execution, stale-action, and
  aged-pending thresholds. Promotion requires enough decided outcomes, no
  pending backlog, and rates below conservative limits.
- Agent autonomy impact: agents can be flagged as
  `ELIGIBLE_FOR_BOUNDED_REVIEW` or `RECOMMEND_PAUSE`, but both states require a
  human admin decision before capabilities, action policy, or status changes.
- Tests or evidence: `apps.api.tests.test_assistant_api` seeds contrasting
  high-confidence and noisy agents, then verifies by-agent and by-action-type
  recommendation behavior from the Admin metrics endpoint. The Admin workspace
  now renders the advisory endpoint through a read-only outcome metrics panel.
- Follow-up: add correction capture so reviewer edits, not only
  approve/reject/failed outcomes, can inform promotion thresholds.

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

### 2026-04-22 - Codex Dispatch Is An Admin Engineering Workflow

- Type: lesson
- Domain: engineering automation
- Applies to: Codex task dispatch, repository-changing agent work, admin
  workflow automation
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: kicking off Codex from inside ECTRM should be treated as an
  admin-owned engineering workflow, not as a normal business assistant action.
  The app may record a task and dispatch a configured repository workflow, but
  Codex results should still land as reviewable code artifacts such as branches,
  pull requests, or workflow output.
- Deterministic opportunity: keep dispatch configuration in typed backend
  settings and task state in durable `codex_task_requests` records with explicit
  statuses.
- Agent autonomy impact: assistants may draft Codex task prompts, but starting
  repository-mutating work should remain behind admin authentication and
  server-side credentials.
- Tests or evidence: focused API coverage should verify disabled/config-missing
  behavior, successful dispatch recording, and failed dispatch audit state.
- Follow-up: if assistants later stage Codex tasks, add a typed action request
  and approval path instead of letting chat text dispatch directly.

### 2026-04-22 - Long-Running Codex Needs Explicit Stop Conditions

- Type: lesson
- Domain: engineering automation
- Applies to: Codex task dispatch, long-running repository agents,
  recommendation loops
- Status: accepted
- Source: [AI Workflow](./ai-workflow.md)
- Lesson: letting Codex continue from one completed task into the next should be
  modeled as a bounded loop, not as open-ended autonomy. The request must carry
  a run mode, iteration cap, continuation question, and stop conditions so the
  repository workflow has a deterministic contract to follow.
- Deterministic opportunity: store loop controls on `codex_task_requests` and
  render the continuation contract into the dispatch prompt rather than relying
  on freeform operator wording. Track execution through a token-authenticated
  callback that writes workflow run, branch, pull request, artifact, summary,
  and stop-reason metadata back to the original task record.
- Agent autonomy impact: long-running Codex may choose the next repository task
  only when it is concrete, high-confidence, repository-local, and within the
  original request. It must stop for protected business domains, production data
  mutation, external commitments, or verification failures requiring human
  review.
- Tests or evidence: API coverage should verify loop metadata persistence,
  prompt contract rendering, configured iteration caps, callback token
  enforcement, and execution-state updates.

### 2026-04-22 - Codex Dispatch Smoke Tests Stay Two-Stage

- Type: lesson
- Domain: engineering automation
- Applies to: Codex task dispatch, GitHub workflow callbacks, long-running
  repository agents
- Status: implemented
- Source: [AI Workflow](./ai-workflow.md) and
  [`run_codex_task_smoke.py`](../../apps/api/scripts/run_codex_task_smoke.py)
- Lesson: verify Codex dispatch in two stages. First run the local smoke path
  to prove the workflow contract, admin task creation, callback updates, and
  callback-token rejection without mutating GitHub. Then run a live dispatch
  only after the remote workflow, API environment, and GitHub secrets are
  configured.
- Deterministic opportunity: keep smoke readiness checks explicit so missing
  secrets or unregistered workflows fail as setup gaps, not ambiguous task
  failures.
- Agent autonomy impact: local smoke coverage can validate plumbing, but it
  does not prove repository-mutating autonomy. Live Codex runs remain
  admin-owned and should land as reviewable branches, pull requests, or
  artifacts.
- Tests or evidence: `make api-codex-smoke` creates a local long-running Codex
  task, posts running and completed callbacks, rejects a bad callback token,
  and reports missing live prerequisites.
- Follow-up: once the Codex workflow is present on GitHub and secrets are
  configured, dispatch a tiny no-op admin task to exercise the full GitHub
  Actions path.

### 2026-04-22 - Corrected Approvals Still Mean Human Cleanup

- Type: algorithm-added
- Domain: assistant governance
- Applies to: action request approvals, outcome metrics, bounded-execution
  promotion review, deterministic algorithm candidates
- Status: implemented
- Source:
  [`action_requests.py`](../../apps/api/app/domains/assistant/services/action_requests.py),
  [`outcome_metrics.py`](../../apps/api/app/domains/assistant/services/outcome_metrics.py),
  and [Agent Action Request Contract](./agent-action-request-contract.md)
- Lesson: an approved action is not always an autonomy win. If the reviewer
  approved only after correcting the agent's evidence, payload framing, or
  assumptions, preserve that distinction as `APPROVED_WITH_CORRECTIONS` with a
  summary or corrected field names.
- Deterministic opportunity: repeated corrected fields are candidates for typed
  validation, policy checks, formula logic, stale-state enrichment, or prompt
  evals. When the same correction recurs, propose the deterministic rule instead
  of relying on future reviewers to catch it.
- Agent autonomy impact: corrected approvals count against bounded-execution
  promotion. Future agents should treat a high correction rate as evidence to
  keep the action staged, narrow authority, or create a deterministic algorithm
  before asking for more autonomy.
- Tests or evidence: API coverage verifies corrected-approval persistence,
  correction-detail validation, rejection notes, audit-trace serialization, and
  outcome-metric correction rates and promotion blockers. Web tests verify that
  approval and rejection calls send structured decision metadata.
- Follow-up: review recurring `correction_fields` during autonomy reviews and
  append `algorithm-candidate` entries when a stable rule emerges.
