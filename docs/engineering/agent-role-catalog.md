# Agent Role Catalog

## Purpose

This catalog defines the first practical set of agent roles for the future
agent-operated ECTRM platform. It turns the broad vision into named operating
roles with clear objectives, workspace scope, permissions, approval boundaries,
and success signals.

The catalog starts from the managed-agent patterns already present in the
product:

- assistant agents with `READ`, `EXPLAIN`, `DRAFT`, and `ACTION` capabilities
- governed live tools exposed through the assistant runtime
- approval-gated action requests for sensitive mutations
- role-derived Admin profiles and presets for trade explanation, operations,
  settlement, document triage, desk briefing, trade operations, and governance

Related docs:

- [AI Workflow](./ai-workflow.md)
- [Future-Ready Engineering Work Packages](./future-ready-engineering-work-packages.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Agent Role Configuration Work Packages](./agent-role-configuration-work-packages.md)

## Role Status Legend

| Status | Meaning |
| --- | --- |
| `Seeded` | Already synchronized as an active role-derived pilot profile. |
| `Role preset` | Already available as an Admin builder preset backed by a role archetype. |
| `Phase 1` | Recommended for the first supervised-agent rollout. |
| `Phase 2+` | Important to the North Star, but should wait until foundational controls mature. |

## Capability Vocabulary

| Capability | Meaning |
| --- | --- |
| `READ` | Agent can use governed read tools when allowed. |
| `EXPLAIN` | Agent can interpret system state and produce grounded summaries. |
| `DRAFT` | Agent can draft notes, messages, checklists, or proposed work. |
| `ACTION` | Agent can stage approval-gated mutations through allowed action types. |

## Current Managed-Agent Anchors

These roles already exist as synchronized pilot profiles or Admin role presets
and should be treated as the first version of the catalog rather than throwaway
examples.

| Role | Status | Primary objective | Workspaces | Current authority |
| --- | --- | --- | --- | --- |
| Trade Ops Copilot | Seeded | Coordinate confirmation, workflow, delivery, and document follow-through for booked trades. | Assistant, Trades, Operations, Deliveries, Scheduling, Reference Data | Read, explain, draft, stage approval-gated ops actions. |
| Settlement Copilot | Seeded | Interpret settlement posture and stage invoice or payment actions when evidence is clear. | Assistant, Settlement, Operations, Reports | Read, explain, draft, stage invoice and payment actions. |
| Trade Governor | Seeded | Review high-sensitivity cancellation requests and stage cancel actions only when evidence is clear. | Assistant, Trades, Operations, Admin | Read, explain, stage cancel-trade actions. |
| Trade Explainer | Role preset | Explain selected trade state, event history, and exposure in desk language. | Assistant, Trades, Activity Feed, Exposure, Net Positions | Read and explain only. |
| Ops Coordinator | Role preset | Summarize downstream blockers across delivery, confirmation, scheduling, and settlement. | Assistant, Deliveries, Scheduling, Operations, Settlement | Read, explain, draft handoff notes. |
| Settlement Analyst | Role preset | Explain invoices, payments, aging, exceptions, and cash follow-up. | Assistant, Settlement, Operations, Reports | Read, explain, draft finance follow-ups. |
| Document Triage | Role preset | Review ingested documents, linkage evidence, routing confidence, and follow-up checks. | Assistant, Operations, Reference Data | Read, explain, draft review notes. |
| Desk Briefing | Role preset | Produce broad desk briefings across exposure, workflow pressure, and market context. | Assistant, Live Desk, Exposure, Net Positions, Reports | Read, explain, draft briefing notes. |

## Proposed Expanded Catalog

| Role | Status | Primary objective | Initial work objects | Suggested authority ceiling |
| --- | --- | --- | --- | --- |
| Market Research Agent | Phase 1 | Monitor market, weather, logistics, macro, positioning, and source freshness signals. | Market opportunity, desk briefing, pre-trade scenario | Read, explain, draft. |
| Pre-Trade Structuring Agent | Phase 1 | Convert market context and internal constraints into trade ideas and review-ready structures. | Pre-trade scenario, pre-trade review item, trade intent | Read, explain, draft. Stage review items only after eval and outcome review. |
| Risk Sentinel | Phase 1 | Watch exposure, pricing gaps, credit freshness, option exposures, and stale assumptions. | Risk exception, workflow item, approval request | Read, explain, draft, stage internal workflow items later. |
| Trade Explainer | Role preset | Explain current trade state, what changed, and downstream exposure impact. | Trade, event, position, option exposure | Read, explain. |
| Trade Governor | Seeded | Handle sensitive trade cancellation governance with strict scope. | Trade, event, workflow item, approval request | Stage cancel actions only. |
| Trade Ops Copilot | Seeded | Keep booked trades moving through confirmations, work queues, delivery blockers, and documents. | Workflow item, confirmation, delivery, document review item | Stage approved operations actions. |
| Logistics Coordinator | Phase 2+ | Manage delivery readiness, scheduling detail, logistics blockers, and actualization evidence. | Delivery obligation, scheduling commitment, delivery event | Stage scheduling and actualization actions after controls mature. |
| Document Agent | Phase 1 | Classify, match, route, and stage follow-up for trade, logistics, and settlement documents. | Document ingestion, document action plan, record link | Read, explain, draft. Stage reprocess only after eval and outcome review. |
| Settlement Copilot | Seeded | Manage invoice and payment follow-through under approval controls. | Invoice, payment, settlement exception | Stage invoice and payment actions. |
| Fee and Accrual Agent | Phase 2+ | Identify fees, delivered-but-unbilled exposure, accrual lots, and reconciliation gaps. | Fee item, accrual lot, invoice, delivery actualization | Read, explain, draft until accrual domain matures. |
| Counterparty Outreach Agent | Phase 2+ | Draft and track bilateral counterparty communications. | Communication draft, confirmation, workflow item | Draft only until external-commitment rules mature. |
| Reporting and Reconciliation Agent | Phase 1 | Produce desk packs, exception packs, reconciliation summaries, and outcome reports. | Report, settlement exception, risk exception, agent outcome | Read, explain, draft. |
| Control Tower Agent | Phase 2+ | Monitor other agents, stale runs, blocked approvals, and intervention needs. | Agent run, action request, intervention record | Read, explain, draft intervention recommendations. |

## Phase 1 Starter Lineup

Phase 1 should prioritize agents that can create value while the authority model
is still conservative. These agents should operate in read, draft, shadow, or
approval-gated modes before any broad autonomous execution.

### 1. Market Research Agent

Objective:

- Turn market data, weather intelligence, price observations, external source
  freshness, and position context into opportunity and risk briefings.

Key inputs:

- Market context
- Weather intelligence
- Price observations
- Positions
- Active trades
- Trading source freshness

Outputs:

- Desk briefings
- Market opportunity notes
- Watchlist updates
- Suggested pre-trade scenarios

Initial authority:

- Read and draft only.
- No trade creation, external communication, or commitment authority.

Success signals:

- Briefings are timely, cited to live system data, and useful enough for desk
  review.
- Humans promote a meaningful share of generated opportunities into pre-trade
  scenarios or review items.

### 2. Pre-Trade Structuring Agent

Objective:

- Convert researched opportunities into reviewable trade structures that can
  flow into the Pre-Trade and Trade Capture workspaces.

Key inputs:

- Market opportunity
- Reference data
- Counterparty credit profile
- Positions and exposure
- Price index metadata
- Weather and external data context

Outputs:

- Pre-trade scenarios
- Pre-trade review items
- Draft trade capture payloads
- Review notes and assumptions

Initial authority:

- Read, explain, and draft.
- Approval-gated staging for pre-trade review items is a later promotion step
  after eval coverage and outcome review.

Success signals:

- Human reviewers accept or refine generated scenarios instead of rebuilding
  them from scratch.
- Trade capture handoffs contain enough structured context to reduce re-entry
  and ambiguity.

### 3. Document Agent

Objective:

- Make document-heavy workflows faster by classifying documents, explaining
  routing confidence, surfacing missing identifiers, and staging safe reprocess
  actions.

Key inputs:

- Document ingestion records
- Page-level classifications and extractions
- Linkage assessments
- Document action plans
- Reference data and related trade or settlement records

Outputs:

- Review notes
- Linkage recommendations
- Manual-review escalations
- Reprocess action requests

Initial authority:

- Read, explain, and draft.
- Staged reprocess actions require a separate promotion review with eval
  coverage.
- Do not auto-create commercial or settlement records without a separate
  approval policy.

Success signals:

- Fewer documents sit in unclear review states.
- More documents reach confident linkage or explicit manual-review state.

### 4. Trade Ops Copilot

Objective:

- Help operations teams clear booked-trade follow-through by combining
  workflow, confirmation, delivery, and document context.

Key inputs:

- Trade workbench
- Workflow items
- Confirmations
- Deliveries
- Document ingestions

Outputs:

- Blocker summaries
- Owner and due-date recommendations
- Confirmation issuance requests
- Confirmation response requests
- Workflow item update requests

Initial authority:

- Continue using current approval-gated action requests.
- Keep action types narrow: issue confirmation, record confirmation response,
  update workflow item, and reprocess document ingestion.

Success signals:

- Higher approval hit rate for staged actions.
- Reduced overdue workflow items.
- Shorter time from trade booking to confirmation and operational readiness.

### 5. Settlement Copilot

Objective:

- Help finance and operations teams manage invoice readiness, payment
  follow-through, aging, and settlement exceptions.

Key inputs:

- Invoices
- Payments
- Settlement summary
- Settlement reports
- Workflow items
- Trade context

Outputs:

- Cash status explanations
- Invoice action requests
- Payment action requests
- Collection or dispute follow-up notes

Initial authority:

- Stage invoice issuance and payment creation through approval-gated action
  requests.
- Do not release cash or send external payment instructions in Phase 1.

Success signals:

- Fewer overdue settlement exceptions.
- Higher accuracy of invoice and payment staging.
- Clear reduction in finance review time per exception.

### 6. Trade Governor

Objective:

- Provide a constrained governance path for trade cancellation requests.

Key inputs:

- Current trade projection
- Event history
- Trade workbench
- Open workflow items

Outputs:

- Cancellation recommendation
- Cancellation action request
- Audit-ready reviewer context

Initial authority:

- Stage cancel-trade requests only.
- Never approve its own request.

Success signals:

- Cancellation requests are more complete, better explained, and easier to
  approve or reject.
- Stale or unsafe cancellation requests fail safely.

## Role Design Template

Every new agent role should be documented with the same structure before it is
created in Admin:

| Field | Required answer |
| --- | --- |
| Mission | What business outcome is this agent responsible for? |
| Human owner | Which role supervises it? |
| Workspaces | Where can the agent operate? |
| Work objects | Which durable records can it read or act on? |
| Inputs | Which live tools, datasets, or context sources can it use? |
| Outputs | What does it produce: explanation, draft, action request, report, alert, or handoff? |
| Authority ceiling | What is the highest allowed level: read, draft, stage, execute, or external commit? |
| Approval rules | Which actions require which reviewers? |
| Stop conditions | What uncertainty, data conflict, or policy boundary forces escalation? |
| Success metrics | How will the team know the role is worth keeping? |
| Eval coverage | Which evals or smoke flows protect the role? |

## Recommended Catalog Governance

- Keep seeded agents conservative and narrow.
- Treat broader roles as role presets or draft role-derived profiles until the
  authority matrix, eval coverage, and action gateway are ready.
- Do not grant `ACTION` to a role unless every allowed action type has an
  explicit approval rule and eval coverage.
- Promote, narrow, pause, or retire profiles through outcome review rather than
  editing prompt text alone.
- Prefer multiple narrow agents over one broad "desk agent" until provenance,
  handoffs, and policy controls mature.
- Retire or pause roles that create review burden without measurable workflow
  benefit.
