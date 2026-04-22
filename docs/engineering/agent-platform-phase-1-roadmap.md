# Agent Platform Phase 1 Roadmap

## Purpose

This roadmap turns the agent-operated ECTRM vision into the first executable
product phase. Phase 1 is not about full autonomy. It is about making the
platform safe and useful for supervised agents that can read, explain, draft,
and stage tightly governed actions.

Related docs:

- [Agent Role Catalog](./agent-role-catalog.md)
- [Agent Platform Phase 1 Tickets](./agent-platform-phase-1-tickets.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [Agent Role Configuration Work Packages](./agent-role-configuration-work-packages.md)
- [AI Workflow](./ai-workflow.md)
- [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- [ADR 0002](../adr/0002-v2-application-architecture.md)

## Phase 1 Goal

ECTRM should support a first-generation control loop where humans can supervise
managed agents, agents can work from live platform context, and sensitive
mutations flow through approval-gated action requests with traceable evidence.

Phase 1 succeeds when the platform can answer these questions:

- Which agents are active?
- What work are they allowed to do?
- What data and tools did they use?
- What did they recommend or stage?
- Who approved or rejected the action?
- What changed in the system?
- What outcome did the work produce?

## Phase 1 Non-Goals

- No fully autonomous trade booking.
- No autonomous external counterparty communication.
- No autonomous cash release or payment instruction.
- No broad "desk agent" with unconstrained tools and actions.
- No direct mutation of records from freeform model output.
- No replacement of manual workflows.

## Current Platform Starting Point

| Surface | Current strength | Phase 1 opportunity |
| --- | --- | --- |
| Assistant and Admin | Managed agents, prompt context, live read tools, run tracing, action requests, agent management. | Expand into a lightweight control tower. |
| Pre-Trade | Scenarios, review items, market context, weather, reference data, handoff into trade capture. | Add agent-generated scenarios and review-ready trade ideas. |
| Trading, Activity Feed, Exposure, Net Positions | Trade projections, event history, positions, option exposure, metadata. | Support trade explanation, risk sentinel review, and governance staging. |
| Operations | Workflow items, confirmations, delivery records, scheduling signals, document panels. | Let agents triage blockers and stage narrow operational actions. |
| Documents | Schema registry, routing, linkage, action plans, review state. | Let agents explain ambiguity and stage safe reprocessing. |
| Settlement | Invoices, payments, aging, exceptions, reports. | Let agents stage invoice/payment actions and reduce exception review time. |
| Reports | Exposure, activity, settlement, PnL, and report presets. | Let agents generate sourced desk and exception packs. |
| Admin | Users, sync status, agent management, approvals, projection monitoring. | Centralize supervision, policy, and agent outcome visibility. |

## Workstream 1: Operating Model And Governance

Outcome:

- The team agrees on who agents are, what they can do, and how humans supervise
  them.

Deliverables:

- Agent role catalog.
- Human-agent authority matrix.
- Canonical work object inventory.
- Phase 1 default policy: read, explain, draft, stage, but no external commit.
- Initial stop-condition rules for uncertainty, stale data, policy conflicts,
  and unsupported requests.

Exit criteria:

- Every Phase 1 agent has a named human owner.
- Every Phase 1 action type has an approval owner.
- No Phase 1 role has ambiguous authority to bind the firm.

## Workstream 2: Action Gateway Hardening

Outcome:

- Approval-gated action requests become the common pattern for assistant,
  automation, and future bulk work.

Current anchor:

- Existing assistant action requests support cancel trade, issue confirmation,
  record confirmation response, update workflow item, issue invoice, create
  payment, and reprocess document ingestion.

Deliverables:

- Document the canonical action-request shape.
- Add explicit policy and reviewer metadata to staged action requests.
- Add stale-state and idempotency expectations for each action type.
- Add dry-run or preview semantics for at least one high-risk action type.
- Keep action execution delegated to typed domain services.

Exit criteria:

- A reviewer can understand what will happen before approving.
- The system can explain why an action failed, became stale, or was blocked.
- At least one non-assistant or broader automation candidate can reuse the
  action-gateway pattern.

## Workstream 3: Control Tower MVP

Outcome:

- Admin evolves from isolated controls into the first human supervision surface
  for agent-operated work.

Deliverables:

- Agent roster view with status, scope, capabilities, allowed tools, and
  allowed actions.
- Pending action request inbox with reviewer context and source evidence.
- Recent agent runs with warnings, tool traces, action requests, and outcomes.
- Pause or retire controls for unsafe or noisy agents.
- Basic outcome metrics: run count, staged actions, approvals, rejections,
  failures, and oldest pending request.

Exit criteria:

- A human supervisor can see what agents are doing without opening the original
  chat.
- A human can pause or narrow an agent when behavior is not trustworthy.
- Action requests remain recoverable and auditable after the original run.

## Workstream 4: Phase 1 Pilot Agents

Outcome:

- A small set of agents creates measurable value under conservative authority.

Pilot lineup:

| Agent | Initial mode | Primary value |
| --- | --- | --- |
| Market Research Agent | Read and draft | Desk and opportunity briefings. |
| Pre-Trade Structuring Agent | Read and draft, then stage review items | Review-ready trade ideas without trade booking. |
| Document Agent | Read, explain, draft, stage reprocess | Faster document triage and ambiguity surfacing. |
| Trade Ops Copilot | Read, explain, draft, stage ops actions | Shorter confirmation and workflow follow-through cycles. |
| Settlement Copilot | Read, explain, draft, stage settlement actions | Faster invoice/payment exception handling. |
| Trade Governor | Read, explain, stage cancel-trade | Safer cancellation review and audit context. |

Deliverables:

- Role specs in Admin for each pilot agent.
- Eval coverage for prompt behavior, tool allowlists, and staged actions.
- Seed/demo data that exercises each pilot path.
- Clear human owner and approval role for each pilot.

Exit criteria:

- Pilot agents produce useful work without expanding authority beyond the
  authority matrix.
- Staged actions have high reviewer comprehension and low failed-execution
  rates.
- The team can measure whether each agent reduces cycle time or review effort.

## Workstream 5: Work Object Normalization

Outcome:

- Agents and humans operate on durable records instead of loose chat context.

Deliverables:

- Map every Phase 1 agent output to a canonical work object.
- Add missing relationships where action requests need stronger ownership:
  trade, workflow item, document ingestion, invoice, payment, or pre-trade
  review.
- Ensure handoffs include source object, target object, owner, due date, and
  reason.
- Avoid creating agent-only work that humans cannot inspect in normal
  workspaces.

Exit criteria:

- Every staged action points to an owning work object.
- Manual takeover is possible from the relevant workspace.
- Agent-generated work is visible in the same queues humans already use.

## Workstream 6: Evaluation, Replay, And Outcomes

Outcome:

- Agent behavior becomes a tested product surface, not a prompt experiment.

Deliverables:

- Expand assistant eval cases for each Phase 1 pilot agent.
- Track approval hit rate, rejection rate, failure rate, and stale-action rate.
- Add replay-ready run context for sensitive actions.
- Create a small agent outcome report for control tower use.
- Define automatic pause thresholds for noisy or unsafe behavior.

Exit criteria:

- Changes to tools, prompts, action rules, or approval behavior fail in evals
  when they regress trust boundaries.
- Human supervisors can compare agent value across roles.
- The team can decide to promote, constrain, or retire an agent based on
  evidence.

## Recommended Milestones

| Milestone | Outcome | Primary docs or surfaces |
| --- | --- | --- |
| M1: Governance package | Roles, authority, work objects, and Phase 1 plan are agreed. | This planning package. |
| M2: Action gateway contract | Staged actions have reviewer metadata, stale-state checks, and clearer policy hooks. | Assistant action requests, backend services, evals. |
| M3: Control tower MVP | Admin shows agent roster, runs, approvals, outcomes, and pause controls. | Admin workspace, assistant run/action APIs. |
| M4: Read/draft pilots | Market, pre-trade, document, and reporting agents operate without mutations. | Assistant agents, Pre-Trade, Documents, Reports. |
| M5: Approval-gated pilots | Trade Ops, Settlement, and Trade Governor stage narrow actions. | Operations, Settlement, Trades, action gateway. |
| M6: Outcome review | Agent value and risk are reviewed before any bounded execution promotion. | Reports, Admin, evals, run analytics. |

## Current Workspace To Agent Roadmap

| Workspace | First agent fit | Current API anchors | Phase 1 gap |
| --- | --- | --- | --- |
| Live Desk | Desk Briefing, Market Research Agent | `/reports/*`, market context, weather, positions | Source-linked briefing object and outcome tracking. |
| Pre-Trade | Pre-Trade Structuring Agent | `/pretrade/*`, market context, reference data | Staged review-item action and trade-intent handoff. |
| Trade Capture | Trade Explainer, Trade Governor | `/trades`, `/events`, `/assistant/*` | No direct agent booking; improve governance context. |
| Activity Feed | Trade Explainer, Risk Sentinel | `/events` | Better event-to-action provenance links. |
| Exposure / Net Positions | Risk Sentinel, Desk Briefing | `/positions`, `/option-exposures`, `/reports/exposure-summary` | Explicit risk exception object. |
| Deliveries / Scheduling | Trade Ops Copilot, Logistics Coordinator | `/deliveries`, `/shipments`, `/operations/work-items` | Scheduling commitment authority and actualization policy. |
| Operations | Trade Ops Copilot, Ops Coordinator | `/operations/*`, `/confirmations/*` | Generalized action request ownership and policy metadata. |
| Settlement | Settlement Copilot | `/settlement/*`, `/reports/settlement-*` | Clear cash-action authority and exception lifecycle. |
| Documents | Document Agent | `/documents/*`, schema registry, ingestion records | Governed document execution rules beyond reprocess. |
| Reports | Reporting and Reconciliation Agent | `/reports/*` | Official report publication and lineage controls. |
| Admin | Control Tower Agent, human supervisors | `/admin/assistant/*`, `/admin/*` | Unified supervision, policy, and outcome dashboard. |

## Promotion Rules

An agent should not move from `Draft` to `Stage` unless:

- its role spec is documented
- its allowed tools and action types are pinned
- its human owner is named
- eval coverage exists
- approval owner is clear
- staged action payloads are typed and reviewable

An agent should not move from `Stage` to `Execute` unless:

- actions are low risk and internal only
- policy checks are deterministic
- idempotency and stale-state checks exist
- failures are observable
- manual correction path is documented
- outcome metrics show trustworthiness over time

## Open Product Decisions

- Should Pre-Trade scenarios become the first agent-created business object?
- Should workflow item updates be the first bounded autonomous action type?
- Should document linkage actions require explicit approval even at high
  confidence?
- What should automatically pause an agent?
- What is the first outcome metric strong enough to justify expanded autonomy?
