# Agent Autonomy Rubric

## Purpose

This rubric helps humans, agents, and future automation decide whether work
should be handled by deterministic product logic, an approval-gated agent, or a
more autonomous agent.

Use it when:

- creating or changing an agent role
- adding a new assistant action type
- deciding whether an agent should create or propose deterministic logic
- deciding whether a workflow should move from draft to staged action
- deciding whether a staged action can become bounded autonomous execution
- turning repeated user requests into product configuration, formulas, services,
  or policy rules
- recording lessons that future agents should reuse

The default answer is conservative: deterministic services own business truth
and writes; agents explain, draft, triage, and stage reviewable work until the
system has enough proof to safely grant more authority.

## Core Principle

Use deterministic logic when the system must be correct, repeatable,
auditable, or enforceable.

Use agents when the work requires judgment over ambiguous context, synthesis
across records, natural-language explanation, or drafting a proposed next step.

Do not let freeform model output directly mutate business records. If an agent
proposes a change, the proposed mutation must become a typed payload that flows
through the same application services, policy checks, permissions, audit, and
review paths as manual UI actions.

## Autonomy Levels

| Level | Agent can | Typical use |
| --- | --- | --- |
| Observe | Read approved context and tools. | Find relevant records or source context. |
| Explain | Interpret state and cite evidence. | Explain exposure, workflow status, or document ambiguity. |
| Draft | Prepare non-mutating text or payloads. | Draft scenarios, reports, notes, checklists, or messages. |
| Stage | Create approval-gated action requests. | Propose workflow updates, invoice actions, document reprocessing, or trade cancellation. |
| Bounded execute | Mutate low-risk internal state without per-action human approval. | Narrow workflow status updates after policy, eval, and audit proof. |
| External commit | Bind the firm outside the platform. | Trade booking, counterparty communication, scheduling commitment, or payment instruction. |

Phase 1 default: agents may observe, explain, draft, and stage only published
approval-gated action types. They may not externally commit the firm.

## Deterministic By Default

Choose deterministic algorithms, typed configuration, policy rules, or domain
services when the work:

- defines business truth or current state
- calculates pricing, exposure, risk, settlement, credit, PnL, or official
  reporting values
- validates permissions, limits, approval requirements, or row-level access
- determines whether an action is allowed
- mutates records, emits events, or triggers downstream workflow
- repairs projections or reconciles data
- needs exact replay, idempotency, rollback, or audit evidence
- is a repeated customization that can be expressed as metadata, a formula, or
  a product primitive

For formulas and derived values, use deterministic, typed, side-effect-free
definitions over approved semantic fields. Do not use an agent as the source of
truth for a value that users will rely on operationally.

## Creating Deterministic Algorithms

Agents are allowed to identify, propose, and when the task scope permits,
implement new deterministic algorithms. The goal is not to keep agents away from
business logic; it is to make sure durable logic graduates out of prompts and
into reviewable product surfaces.

Create or propose deterministic logic when an agent sees:

- the same judgment being repeated across requests
- an explanation that depends on stable rules rather than open-ended reasoning
- prompt instructions compensating for missing product behavior
- a recurring review decision that could be validated from structured fields
- a calculation, classification, freshness check, or routing rule that users
  will rely on operationally
- an agent-generated recommendation that reviewers accept consistently enough
  to encode as policy, metadata, or service logic

A deterministic algorithm proposal should define:

- the business question it answers
- the owning domain and human owner
- the inputs, source freshness requirements, and row-level access assumptions
- the output type, allowed states, and failure modes
- the exact rule set, formula, threshold, or decision table
- invariants, edge cases, and stop conditions
- where the logic should live: formula definition, policy rule, domain service,
  projection monitor, route helper, or UI helper
- required tests, eval cases, and fixture data
- audit, lineage, and rollback expectations

If the agent implements the algorithm, the implementation must use the repo's
normal typed service boundaries and test conventions. If the change affects
pricing, risk, settlement, credit, compliance, permissions, policy, reference
data, or external commitments, the agent should draft the proposal and require
human review before relying on it.

After proposing or implementing deterministic logic, record the lesson in the
[Agent Knowledge Base](./agent-knowledge-base.md) so other agents can reuse the
pattern.

## Agent-Suitable Work

Use an agent when the work:

- starts from ambiguous, incomplete, or unstructured context
- requires summarizing or explaining multiple records in business language
- benefits from surfacing assumptions, conflicts, and missing evidence
- produces a draft that a human can accept, edit, or reject
- proposes an action but does not execute it directly
- routes work to an existing durable object that humans already inspect
- helps reduce review effort without hiding the underlying evidence

Good early candidates include desk briefings, pre-trade scenario drafts,
document triage explanations, settlement exception summaries, workflow blocker
triage, and sourced report drafts.

## Increase Autonomy When

Move an agent from a lower level to a higher level only when all relevant
conditions are true:

- the role spec is documented
- the human owner and approval owner are named
- allowed tools and action types are pinned
- outputs map to durable work objects, not chat state alone
- staged payloads are typed, previewable, and reviewable
- policy checks are deterministic
- stale-state checks and idempotency keys exist where needed
- failures are observable and produce actionable reasons
- manual correction or rollback is documented
- evals cover prompt behavior, tool access, and action governance
- approval, rejection, correction, and failure rates show trustworthiness over
  time

Autonomy should expand because the system has evidence, not because the prompt
sounds confident.

## Decrease Autonomy When

Keep the agent at draft or stage, or require a human-only path, when the work:

- books, amends, or cancels trades without an explicit governed action type
- sends external counterparty communication
- commits schedules, nominations, allocations, or logistics externally
- releases cash or sends bank instructions
- changes policy, permissions, reference data, limits, or agent configuration
- changes pricing, settlement, credit, compliance, or official reporting logic
- lacks fresh source data or cites conflicting evidence
- depends on hidden assumptions the reviewer cannot inspect
- has no clear owning work object
- has no named human owner
- cannot be corrected cleanly after execution
- would create review burden without measurable value

When in doubt, reduce authority and ask for review.

## Action Request Requirements

Every staged action should include enough information for a reviewer or policy
executor to understand the proposed change before it runs:

- action type
- owning work object
- proposed mutation
- business rationale
- supporting records or tool calls
- policy checks performed
- assumptions
- uncertainty or missing evidence
- expected downstream effects
- required reviewer role
- idempotency key or replay protection where applicable

If the action cannot be represented this way, it is not ready for agent-staged
execution.

## Quick Decision Checklist

Answer these in order:

1. Does this define business truth, policy, permissioning, or a value used by
   pricing, risk, settlement, compliance, or official reporting?
   - Yes: deterministic service, typed policy, or governed formula.
   - No: continue.
2. Does this mutate a record or emit an event?
   - Yes: typed service plus approval-gated action request unless already
     approved for bounded execution.
   - No: continue.
3. Does this bind the firm externally?
   - Yes: human-only unless a separate legal, compliance, and policy model has
     explicitly approved the narrow case.
   - No: continue.
4. Is the hard part ambiguity, synthesis, explanation, or drafting?
   - Yes: agent-suitable.
   - No: prefer deterministic product logic.
5. Is the same judgment likely to recur?
   - Yes: create or propose a deterministic algorithm and record the lesson.
   - No: continue.
6. Can success be measured through approvals, corrections, failures, and review
   effort?
   - Yes: consider staged execution with evals and outcome tracking.
   - No: keep the agent at explain or draft.

## Knowledge Capture

Agents should save reusable lessons when they discover:

- a pattern that should become deterministic logic
- a deterministic algorithm that was added or changed
- an autonomy boundary that was clarified by a real workflow
- a stop condition, failure mode, or reviewer expectation that future agents
  should check
- a prompt instruction that should be replaced by product behavior

Use [Agent Knowledge Base](./agent-knowledge-base.md) for lightweight lessons.
Use an ADR when the lesson changes architecture. Use product or engineering
docs when the lesson changes user-facing behavior or implementation policy.

## Promotion And Retirement

Promote autonomy gradually:

1. Shadow: agent observes and recommends.
2. Draft: agent prepares reviewable work.
3. Stage: agent creates approval-gated action requests.
4. Bounded execute: agent executes low-risk internal actions under deterministic
   policy.
5. External commit: only after separate legal, compliance, replay, monitoring,
   and kill-switch controls exist.

Pause, narrow, or retire an agent when it repeatedly produces low-value drafts,
stages actions that reviewers reject, fails policy checks, cites stale data,
over-claims certainty, or increases review burden without measurable workflow
benefit.

## Related Docs

- [AI Workflow](./ai-workflow.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Role Catalog](./agent-role-catalog.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [User Extensibility Initiative](./user-extensibility-initiative.md)
