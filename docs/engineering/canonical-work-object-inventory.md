# Canonical Work Object Inventory

## Purpose

This inventory defines the durable units of work that humans and agents should
operate on as ECTRM becomes an agent-operated platform.

Agents should not run the business through chat state alone. They need
first-class work objects with ownership, lifecycle, provenance, permissions,
and action history. Humans should be able to inspect, correct, approve, or take
over the same objects without leaving the platform.

Related docs:

- [Agent Role Catalog](./agent-role-catalog.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Document Taxonomy](./document-taxonomy-trading-shipping.md)
- [Accruals Functionality Redesign](./accruals-functionality-redesign.md)

## Status Legend

| Status | Meaning |
| --- | --- |
| `Existing` | A first-class or near-first-class record already exists in the product. |
| `Derived` | The product exposes the concept through reports, summaries, projections, or calculated views. |
| `Emerging` | The product has partial support, but the object needs clearer lifecycle or ownership. |
| `Planned` | Needed for the agent-operated future, but not yet a first-class product object. |

## Pre-Trade And Research Objects

| Work object | Status | Owning domain | Current anchor | Agent relevance |
| --- | --- | --- | --- | --- |
| Market opportunity | Planned | Trading / Reports | Market context, price observations, weather intelligence, positions | Allows research agents to track ideas, assumptions, freshness, and promotion into scenarios. |
| Pre-trade scenario | Existing | Trading | `PreTradeScenarioRecord` | Lets agents draft structured trade ideas without booking trades. |
| Pre-trade review item | Existing | Trading | `PreTradeReviewItemRecord` | Provides a supervised approval path between idea and trade capture. |
| Trade intent | Planned | Trading | Pre-trade draft plus review outcome | Needed to represent a commitment candidate before a trade exists. |
| Desk briefing | Emerging | Reports / Assistant | Desk Briefing agent output, reports, dashboard summaries | Should become a repeatable output with sources, author, and generated-at metadata. |

## Trading And Risk Objects

| Work object | Status | Owning domain | Current anchor | Agent relevance |
| --- | --- | --- | --- | --- |
| Event | Existing | Trading / Platform | `EventRow` | Durable source of truth for lifecycle and audit explanations. |
| Trade | Existing | Trading | `Trade` projection | Primary commercial object used by humans and agents. |
| Trade leg | Emerging | Trading | Current trade payload and v2 design docs | Needed for physical, swap, structured pricing, and delivery-aware autonomy. |
| Price term | Emerging | Trading | Pricing fields and price index reference data | Needed for agents to reason about fixed, index, formula, and hybrid pricing. |
| Position | Existing | Risk / Projections | `PositionRow` | Agents use this to explain net exposure and downstream impact. |
| Option exposure | Existing | Risk | `OptionExposureRow` | Agents use this for option-sensitive risk review. |
| Risk exception | Planned | Risk / Operations | Credit workflow items, exposure reports | Needed for explicit risk sentinel work and escalation. |
| Credit approval decision | Existing | Operations / Risk | `TradeCreditApprovalDecisionRecord` | Controls credit exceptions and should remain human governed. |
| Credit exception | Existing | Operations / Risk | `TradeCreditExceptionRecord` | Helps agents distinguish approved envelope from unresolved breach. |

## Operations And Delivery Objects

| Work object | Status | Owning domain | Current anchor | Agent relevance |
| --- | --- | --- | --- | --- |
| Workflow item | Existing | Operations / Settlement | `TradeWorkflowItemRecord` | Core queue object for blockers, ownership, due dates, approvals, and handoffs. |
| Confirmation | Existing | Operations | `TradeConfirmationRecord` | Allows agents to issue, track, and record confirmation follow-through through approval gates. |
| Confirmation mismatch | Existing | Operations | `TradeConfirmationMismatchRecord` | Lets agents explain why a confirmation is blocked or disputed. |
| Delivery obligation | Existing | Operations | `DeliveryRecord` / `ShipmentRecord` | Primary post-trade movement object for physical and scheduled products. |
| Delivery event | Existing | Operations | `DeliveryEventRecord` | Evidence trail for scheduling, checkpoints, holds, actualization, and completion. |
| Scheduling commitment | Emerging | Operations | Delivery scheduling fields and scheduling workflow items | Needs clearer lifecycle before agent-executed scheduling commitments. |
| Actualization | Emerging | Operations | Delivery actualization fields and trade actualization models | Needed for delivered quantity, invoice readiness, accruals, and settlement. |
| Operational handoff | Planned | Operations | Workflow item notes, owners, route handoffs | Needed for structured human-agent and agent-agent transfers. |

## Document Objects

| Work object | Status | Owning domain | Current anchor | Agent relevance |
| --- | --- | --- | --- | --- |
| Document ingestion | Existing | Documents / Operations | `DocumentIngestionRecord` | Main object for classification, extraction, review, and linkage. |
| Document page | Existing | Documents | `DocumentIngestionPageRecord` | Supports page-level classification and extraction review. |
| Routing assessment | Existing | Documents | `DocumentRoutingAssessmentRecord` | Helps agents explain document type and target family. |
| Linkage assessment | Existing | Documents | `DocumentLinkageAssessmentRecord` | Helps agents explain candidate record matches and missing keys. |
| Document action plan | Existing | Documents | `DocumentActionPlanRecord` | Natural bridge from document understanding to governed action. |
| Document record link | Existing | Documents | `DocumentRecordLinkRecord` | Evidence that a document was attached to a business record. |
| Manual review task | Emerging | Documents / Operations | Review status and workflow items | Should become an explicit queue object when ambiguity remains. |

## Settlement, Fees, And Accrual Objects

| Work object | Status | Owning domain | Current anchor | Agent relevance |
| --- | --- | --- | --- | --- |
| Invoice | Existing | Settlement | `TradeInvoiceRecord` | Lets agents explain and stage invoice follow-through. |
| Payment | Existing | Settlement | `TradePaymentRecord` | Lets agents explain and stage payment recording. |
| Settlement exception | Derived | Reports / Settlement | `SettlementExceptionReport` rows | Should become action-driving queue context for settlement agents. |
| Settlement aging row | Derived | Reports / Settlement | `SettlementAgingReport` rows | Helps agents prioritize collection and overdue review. |
| Fee item | Planned | Settlement / Trading | Future fee model | Needed to detect, accrue, invoice, and reconcile fees. |
| Accrual lot | Planned | Accruals | Accruals redesign document | Needed to separate delivered, accrued, billed, and collected economics. |
| Accrual entry | Planned | Accruals | Accruals redesign document | Needed for immutable economic rollforward. |
| Dispute | Emerging | Settlement / Operations | Invoice dispute reason, workflow item notes | Needs first-class lifecycle for agent and human ownership. |

## Governance And Control Tower Objects

| Work object | Status | Owning domain | Current anchor | Agent relevance |
| --- | --- | --- | --- | --- |
| Agent definition | Existing | Assistant / Admin | `AssistantAdminAgent` | Names an agent, scope, capabilities, tools, actions, and prompt profile. |
| Agent run | Existing | Assistant | Assistant run audit rows | Core object for traceability, replay, and evaluation. |
| Assistant conversation | Existing | Assistant | Assistant conversation records | Useful context, but should not replace work objects. |
| Action request | Existing | Assistant / Governance | `AssistantActionRequest` | Current approval-gated mutation object. Should evolve into generalized action gateway. |
| Approval decision | Emerging | Governance | Action request decision fields and credit decisions | Needed across all staged actions. |
| Policy rule | Planned | Governance / Admin | Agent allowed tools and actions, role gates | Needed so limits and approvals live outside prompts. |
| Agent assignment | Planned | Control Tower | Agent status plus future roster state | Tracks which agent owns which work and goal. |
| Intervention record | Planned | Control Tower | Future pause, redirect, takeover, or override record | Needed for human supervision and accountability. |
| Outcome record | Planned | Reports / Control Tower | Future agent outcome analytics | Needed to measure value, risk, and trust over time. |

## Minimum Work Object Contract

Every canonical work object should converge on these fields or equivalents:

| Field family | Purpose |
| --- | --- |
| Stable identifier | Enables references across humans, agents, reports, and audit logs. |
| Type and domain | Makes routing and ownership explicit. |
| Lifecycle status | Lets humans and agents know whether work is open, blocked, approved, executed, or closed. |
| Owner | Supports handoffs, escalation, and accountability. |
| Source records | Shows the upstream evidence or business objects that created the work. |
| Related records | Connects downstream effects and linked workflow context. |
| Created and updated audit | Maintains attribution for human and agent changes. |
| Version or revision | Supports idempotency, stale-state checks, and safe retries. |
| Policy status | Shows whether required policy checks passed, failed, or were not applicable. |
| Action history | Explains what was proposed, approved, rejected, executed, corrected, or overridden. |

## Phase 1 Work Object Priorities

Phase 1 should avoid inventing every future object at once. It should focus on
the objects that already exist and can support supervised agent value quickly:

1. Agent definition
2. Agent run
3. Action request
4. Pre-trade scenario
5. Pre-trade review item
6. Trade
7. Event
8. Workflow item
9. Confirmation
10. Delivery obligation
11. Document ingestion
12. Document action plan
13. Invoice
14. Payment

## Design Rules

- Do not use chat history as the only place a business decision exists.
- Do not let agents create side-channel work that humans cannot inspect in the
  normal product.
- Do not create agent-only records when a human workflow object already exists.
- Prefer explicit work objects over hidden async jobs for business-visible
  activity.
- Keep manual takeover possible at the object level, not only at the agent
  level.

