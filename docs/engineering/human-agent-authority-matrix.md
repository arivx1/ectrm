# Human-Agent Authority Matrix

## Purpose

This matrix defines how authority should be divided between humans, agents, and
platform policy as ECTRM evolves toward an agent-operated trading and
operations platform.

The goal is not to make every action autonomous. The goal is to make authority
explicit so agents can safely progress from read-only assistance into
approval-gated and eventually bounded autonomous execution.

Related docs:

- [Agent Role Catalog](./agent-role-catalog.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [AI Workflow](./ai-workflow.md)

## Authority Verbs

| Verb | Meaning |
| --- | --- |
| Observe | Read live or historical platform state. |
| Explain | Interpret state in business language and cite supporting records. |
| Draft | Prepare text, notes, scenarios, reports, or payloads without mutating records. |
| Stage | Create an approval-gated action request for a human or policy-controlled executor. |
| Execute | Mutate internal platform state without per-action human approval. |
| Externally commit | Send, book, communicate, pay, schedule, or otherwise bind the firm outside the platform. |
| Approve | Decide whether a staged action can execute. In Phase 1, approval remains human or explicit policy controlled. |

## Human Owner Roles

| Owner role | Primary responsibility |
| --- | --- |
| Trader | Owns commercial intent, trade economics, amendments, and counterparty commercial discussions. |
| Desk Lead | Owns desk priorities, operating posture, major overrides, and escalation triage. |
| Operations Lead | Owns confirmations, delivery readiness, scheduling, blockers, and operational handoffs. |
| Settlement Lead | Owns invoices, payments, cash exceptions, disputes, and finance follow-up. |
| Risk or Credit Owner | Owns limit breaches, credit approval, stale credit evidence, and risk escalation. |
| Admin or Platform Owner | Owns agent configuration, policy changes, access, run tracing, and system controls. |
| Compliance or Legal Owner | Owns sanctions, restricted counterparties, regulated communications, and legal commitments. |

## Default Authority By Action Family

| Action family | Examples | Phase 1 agent ceiling | Human owner | External commitment | Notes |
| --- | --- | --- | --- | --- | --- |
| Internal briefing and analysis | Desk summary, exposure explanation, market context summary | Execute draft output internally | Desk Lead | No | Safe early autonomy candidate if provenance is visible. |
| Market opportunity generation | Opportunity note, watchlist item, research thesis | Draft | Trader or Desk Lead | No | Agent can propose, but humans decide whether to pursue. |
| Pre-trade scenario drafting | Scenario draft, thesis, target price, target volume | Draft, then stage review item | Trader | No | Good Phase 1 target because it precedes commitment. |
| Pre-trade review decision | Approve or reject review item for capture | Draft recommendation | Trader or Desk Lead | No | Approval should stay human until review policy is formal. |
| Trade capture | Book a new trade | Draft only | Trader | Potentially yes | Direct booking should not be agent-executed in Phase 1. |
| Trade amendment | Change economics, dates, counterparty, quantity, pricing | Draft only | Trader | Potentially yes | Requires stronger event, policy, and approval controls. |
| Trade cancellation | Cancel active trade | Stage | Trader, Desk Lead, or Admin | Potentially yes | Current Trade Governor pattern is a good constrained model. |
| Workflow item update | Owner, due date, status, notes | Stage, then limited execute later | Operations Lead or Settlement Lead | No | Good candidate for bounded autonomy after evals and policy. |
| Confirmation issuance | Issue trade confirmation | Stage | Operations Lead or Trader | Yes | Requires reviewer confidence in economics and recipient. |
| Confirmation response recording | Record counterparty response | Stage | Operations Lead | Sometimes | Safer than issuance, but still needs evidence and audit. |
| Delivery blocker triage | Blocker summary, owner, next action | Draft or stage workflow update | Operations Lead | No | Good Phase 1 workflow improvement area. |
| Scheduling commitment | Commit schedule, nomination, allocation | Draft initially | Operations Lead | Yes | Move slowly because this can create external obligations. |
| Delivery actualization | Record actual delivered quantity or event | Draft initially | Operations Lead | Sometimes | Requires source evidence and correction policy. |
| Document reprocessing | Re-run ingestion or review flow | Stage | Operations Lead or Admin | No | Current action type is a safe first document action. |
| Document linkage | Attach document to trade, delivery, invoice, or payment | Draft initially, stage later | Owning workflow lead | No | Can become approval-gated once linkage confidence rules exist. |
| Document-created records | Create confirmation, invoice, payment, or quality record from document | Draft initially, stage later | Owning workflow lead | Potentially yes | Requires explicit matching, ambiguity, and approval policy. |
| Invoice issuance | Issue invoice record | Stage | Settlement Lead | Yes | Current Settlement Copilot pattern is appropriate. |
| Payment recording | Record payment against invoice | Stage | Settlement Lead | Sometimes | Recording receipt is lower risk than funds release. |
| Payment release or instruction | Send payment, release funds, communicate bank instructions | Human only | Settlement Lead, Finance, Compliance | Yes | Keep out of agent execution until a separate payments control model exists. |
| Settlement exception triage | Aging, dispute, missing invoice, missing payment | Draft or stage workflow update | Settlement Lead | No | Strong Phase 1 target for measurable cycle-time reduction. |
| Fee identification | Identify missing fees or charges | Draft | Settlement Lead or Trader | No | Needs fee model before execution. |
| Accrual recognition | Create or update accrual lot/entry | Draft initially | Settlement Lead or Controller | No | Wait for accrual domain to exist. |
| Risk alerting | Exposure breach, stale price, stale credit, position change | Draft alert, then stage workflow item later | Risk or Credit Owner | No | Good Phase 1 sentinel candidate. |
| Credit approval | Approve breached counterparty exposure | Draft recommendation only | Risk or Credit Owner | Potentially yes | Keep human-only until delegated approval policy is explicit. |
| Counterparty email draft | Draft outreach, confirmation chase, collection note | Draft | Trader, Operations Lead, or Settlement Lead | Yes when sent | Agent can draft; human sends in Phase 1. |
| Counterparty communication send | Send email or message externally | Human only | Owning business user | Yes | Requires communication policy, disclaimers, and audit. |
| Binding bilateral commitment | Accept offer, confirm economics, agree logistics, settle dispute | Human only | Trader or authorized owner | Yes | Highest-risk class. Not a Phase 1 autonomy target. |
| Report generation | Daily desk pack, settlement pack, exception summary | Execute draft internally | Desk Lead or Settlement Lead | No | Good early autonomy candidate with source links. |
| Shared report publication | Publish report preset or official pack | Draft or stage | Desk Lead or Admin | Sometimes | Approval needed if used as official record. |
| Agent configuration | Create, change, pause, retire agent | Draft recommendation only | Admin or Platform Owner | No | Admin action only. |
| Policy or limit change | Approval thresholds, tool access, action scopes, credit limits | Draft recommendation only | Admin, Risk, or Compliance | Potentially yes | Never prompt-only. Requires versioned policy workflow. |

## Phase 1 Defaults

Phase 1 should use these defaults unless a specific exception is approved:

- Agents may observe, explain, and draft across their allowed workspace scope.
- Agents may stage only published approval-gated action types.
- Agents may not approve their own action requests.
- Agents may not externally commit the firm.
- Agents may not mutate policy, permissions, reference data, or agent
  configuration.
- Agents may not create or amend trades directly.
- Agents may not release cash, send bank instructions, or bind counterparty
  communications.

## Authority Escalation Ladder

| Stage | Agent authority | Required proof before promotion |
| --- | --- | --- |
| Shadow | Agent observes and recommends, but humans do normal work. | Recommendations are useful and cite correct records. |
| Draft | Agent prepares scenarios, notes, messages, and reports. | Human review burden is lower than manual drafting. |
| Stage | Agent creates approval-gated action requests. | High approval hit rate and low failed-action rate. |
| Bounded execute | Agent executes low-risk internal actions within policy. | Evals, audit, idempotency, rollback/correction path, and owner sign-off. |
| External commit | Agent can bind the firm in narrowly defined cases. | Strong policy engine, legal/compliance approval, replay, monitoring, and kill switch. |

## Required Approval Metadata

Every staged action request should include:

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

## Open Decisions

- Which trade-related actions should ever move beyond `Stage`?
- Can any counterparty communication be sent by an agent, or should humans
  always send externally?
- Who is authorized to approve agent-staged invoice and payment records?
- Should workflow item status changes become low-risk autonomous actions once
  the work queue model is stable?
- What threshold of failed, rejected, or corrected actions should pause an
  agent automatically?
