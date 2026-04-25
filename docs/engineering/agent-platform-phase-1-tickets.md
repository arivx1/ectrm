# Agent Platform Phase 1 Tickets

## Goal

Break the Phase 1 agent-platform roadmap into independently trackable,
issue-sized tickets that can be scheduled without losing the operating-model
intent.

Phase 1 is about supervised agents, not full autonomy. The target is a platform
where agents can observe, explain, draft, and stage tightly governed actions
while humans retain approval, override, and manual fallback.

Source docs:

- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Role Catalog](./agent-role-catalog.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Agent Role Configuration Work Packages](./agent-role-configuration-work-packages.md)
- [AI Workflow](./ai-workflow.md)

## Planning Assumptions

- tickets should fit normal engineering issue scope, not multi-month epics
- the first implementation slice should strengthen supervision before granting
  more authority
- current managed agents, assistant runs, action requests, and admin approval
  surfaces are assets to build on
- role/profile configuration work should enforce the authority matrix instead
  of relying on prompt conventions
- every ticket that changes agent behavior, tools, action staging, or approval
  behavior needs eval or smoke coverage appropriate to the risk
- existing manual workflows must remain usable while agent surfaces are added
- every ticket that promotes recurring judgment into deterministic logic should
  update the agent knowledge base with the lesson learned

## Recommended Execution Lanes

### Lane A: Canonical Planning And Policy

1. AP1-01 link the agent platform planning package into canonical docs
2. AP1-02 define the Phase 1 action-request contract
3. AP1-03 define stop conditions and auto-pause thresholds

### Lane B: Role And Profile Foundation

4. AP1-04 role archetype registry
5. AP1-05 agent profile metadata and seed migration
6. AP1-06 role-aware policy validator

### Lane C: Action Gateway Hardening

7. AP1-07 action request reviewer metadata
8. AP1-08 stale-state and idempotency checks for staged actions
9. AP1-09 dry-run or preview for one sensitive action type

### Lane D: Control Tower MVP

10. AP1-10 control tower summary API
11. AP1-11 admin control tower overview
12. AP1-12 agent pause and narrowing workflow

### Lane E: Pilot Agent Rollout

13. AP1-13 Phase 1 pilot agent seed and template alignment
14. AP1-14 pre-trade structuring agent draft and review flow
15. AP1-15 document agent triage and reprocess flow
16. AP1-16 trade ops and settlement copilot eval expansion

### Lane F: Measurement And Regression Coverage

17. AP1-17 agent outcome metrics and reporting slice
18. AP1-18 browser smoke coverage for control tower approvals

### Lane G: Deterministic Autonomy Candidates

19. AP1-19 deterministic workflow item update policy

## Shared Ticket Definition Of Done

A Phase 1 ticket is done only when:

- the affected behavior is covered by automated tests, assistant evals, or
  browser smoke checks appropriate to the risk
- the implementation preserves manual fallback
- agent authority remains within the authority matrix
- docs are updated when the operating model, contract, or workflow changes
- run tracing, action request audit, or provenance is preserved for the
  affected path
- failure modes are explicit when follow-on tickets are still needed

## Lane A: Canonical Planning And Policy

## AP1-01: Link The Agent Platform Planning Package

### Size

S

### Outcome

The new agent-platform planning docs are discoverable from the repo's canonical
engineering documentation.

### Scope

- add links to the Phase 1 roadmap, tickets, role catalog, authority matrix,
  work object inventory, autonomy rubric, and role-configuration packages from
  appropriate existing docs
- choose the canonical entry point for agent-platform planning
- note that Phase 1 is supervised, approval-gated, and non-autonomous by
  default

### Out of scope

- implementation changes
- changing any agent authority

### Dependencies

None

### Acceptance criteria

- a reader starting from the repo README or engineering docs can find the
  agent-platform planning set
- links are not duplicated in unrelated docs
- the canonical entry point points to the roadmap and ticket breakdown

## AP1-02: Define The Phase 1 Action-Request Contract

### Size

M

### Outcome

Every Phase 1 staged action has a documented contract that explains what the
reviewer needs to know before approving.

### Status

Drafted in [Agent Action Request Contract](./agent-action-request-contract.md).

### Scope

- define required metadata for staged actions:
  - owning work object
  - proposed mutation
  - reviewer role
  - business rationale
  - supporting records or tool calls
  - policy checks
  - assumptions and missing evidence
  - expected downstream effects
  - idempotency or replay key when applicable
- map the existing assistant action types to the contract
- document which fields are required now versus planned follow-up

### Out of scope

- database migration by itself
- adding new action types

### Dependencies

- current assistant action request model
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)

### Acceptance criteria

- the contract is documented in engineering docs
- each existing action type has an owning work object and reviewer role
- gaps between current action-request fields and the target contract are
  explicit

## AP1-03: Define Stop Conditions And Auto-Pause Thresholds

### Size

S

### Outcome

The team has explicit criteria for when an agent should refuse, escalate,
narrow authority, or pause.

### Scope

- define common stop conditions:
  - stale data
  - conflicting evidence
  - unsupported action type
  - missing owning work object
  - missing reviewer role
  - excessive uncertainty
  - external-commitment request
- define initial auto-pause signals:
  - repeated failed executions
  - high rejection rate
  - policy validation failures
  - stale tool citations
  - action overreach attempts
- add guidance to role specs and control tower planning

### Out of scope

- implementing auto-pause enforcement
- building alerting UI

### Dependencies

- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)

### Acceptance criteria

- stop conditions are documented and reusable in role specs
- auto-pause thresholds are concrete enough to implement later
- Phase 1 pilot agents reference the stop-condition vocabulary

## Lane B: Role And Profile Foundation

## AP1-04: Role Archetype Registry

### Size

M

### Outcome

The platform has a server-owned role archetype registry that turns documented
agent roles into enforceable metadata.

### Scope

- define role archetype fields for mission, owner role, workspaces, work
  objects, capability ceiling, tool allowlist, action ceiling, approval rules,
  stop conditions, and eval expectations
- choose an initial storage shape, likely code-owned registry for Phase 1
- map current seeded and template agents to role keys
- expose role metadata through an admin API
- validate unique role keys and valid workspace/tool/action references

### Out of scope

- non-admin custom role creation
- expanding any agent action authority

### Dependencies

- AP1-01
- [Agent Role Configuration Work Packages](./agent-role-configuration-work-packages.md)

### Acceptance criteria

- every current curated or template agent maps to a role archetype
- role metadata is server-owned and test-covered
- invalid referenced tools, workspaces, capabilities, or action types fail
  tests

## AP1-05: Agent Profile Metadata And Seed Migration

### Size

M

### Outcome

Managed agents become concrete profiles derived from role archetypes.

### Scope

- extend assistant agent data with role/profile metadata:
  - role key
  - profile kind
  - specialization summary
  - human owner role or owner user where appropriate
  - inherited authority ceiling
- add migration and backfill current seeded agents
- update seed definitions, schemas, web types, and admin helpers
- preserve existing agent IDs and runtime behavior
- include role/profile identity in prompt preview and run traces

### Out of scope

- custom profile activation workflow
- retroactive role metadata for historical runs before migration

### Dependencies

- AP1-04

### Acceptance criteria

- existing seeded agents still seed and update successfully
- admin and public agent listings expose role/profile metadata
- assistant runs include enough role/profile identity for audit
- tests cover migration, listing, CRUD, and prompt context behavior

## AP1-06: Role-Aware Policy Validator

### Size

M

### Outcome

Agent profiles cannot become active when they exceed their role archetype's
authority ceiling.

### Scope

- validate profile capabilities against role capability ceiling
- validate workspaces, tools, and action types against role policy
- require explicit action allowlists for `ACTION` profiles
- avoid implicit broad defaults for role-derived profiles
- return actionable validation errors in admin create/update flows
- add eval coverage for attempted overreach

### Out of scope

- full policy language
- autonomous execution promotion

### Dependencies

- AP1-04
- AP1-05

### Acceptance criteria

- profiles cannot silently expand tools or action types beyond role policy
- action-capable profiles require explicit allowed action types
- existing curated seeded agents pass validation
- tests cover successful narrowed specialization and blocked overreach

## Lane C: Action Gateway Hardening

## AP1-07: Action Request Reviewer Metadata

### Size

M

### Outcome

Action requests include enough reviewer, ownership, and evidence metadata for a
human to approve confidently outside the original chat.

### Scope

- add fields or structured payload conventions for:
  - owning work object type and ID
  - required reviewer role
  - support summary
  - assumptions
  - missing evidence
  - expected downstream effects
- update serializers and web display components
- update existing action planners to populate the new metadata where possible
- preserve backward compatibility for older action requests

### Out of scope

- new action types
- dry-run execution

### Dependencies

- AP1-02

### Acceptance criteria

- admin and assistant approval inboxes show owning object and reviewer context
- existing action requests still render
- evals cover at least one metadata-bearing staged action

## AP1-08: Stale-State And Idempotency Checks For Staged Actions

### Size

L

### Outcome

Sensitive staged actions fail safely when the underlying work object changed
or when an approval is retried.

### Status

Implemented for the current Phase 1 action gateway.

### Implementation note

Approval now requires a non-empty `review_context.stale_state_basis` and an
`idempotency_key` before execution. Action handlers re-read the current work
object state at approval time and fail the request without side effects when
the staged evidence is stale. The current stale-state coverage includes trade
cancellation, confirmation issue/response, workflow item update, invoice issue,
payment creation, and document reprocessing. Invoice and payment staging also
tracks the relevant invoice/payment collection state so manual side effects
between staging and approval are detected before a duplicate or stale settlement
mutation can execute. Workflow item updates support bounded idempotent retries
when the requested change was already applied.

### Scope

- define stale-state checks for each current action type
- add idempotency or replay expectations for action execution
- block execution when the referenced trade, workflow item, confirmation,
  invoice, payment, or document no longer matches the staged assumptions
- improve failed action result details for reviewer recovery
- add tests for stale and retry scenarios

### Out of scope

- general-purpose workflow engine
- background job scheduler redesign

### Dependencies

- AP1-07

### Acceptance criteria

- stale state produces `FAILED` with actionable error detail instead of unsafe
  execution
- retries do not duplicate unsafe side effects
- assistant evals cover at least one stale-state failure

## AP1-09: Dry-Run Or Preview For One Sensitive Action Type

### Status

Implemented for `issue_trade_invoice` on 2026-04-22. Staged invoice actions now
carry a deterministic `action_preview` in review context, approval surfaces show
affected records, field changes, expected side effects, assumptions, warnings,
and blockers, and blocked previews cannot be approved into execution.

### Size

M

### Outcome

At least one high-risk staged action supports a preview that describes the
mutation before approval.

### Scope

- choose the first preview target:
  - `cancel_trade`
  - `issue_trade_invoice`
  - or `issue_trade_confirmation`
- return a preview summary that includes affected records and expected
  downstream changes
- display preview details in approval surfaces
- add tests for preview output and blocked preview states

### Out of scope

- preview support for every action type
- changing approval ownership

### Dependencies

- AP1-07
- AP1-08 recommended

### Acceptance criteria

- selected action type has deterministic preview behavior
- preview data appears before the reviewer approves
- failed previews do not create action side effects

## Lane D: Control Tower MVP

## AP1-10: Control Tower Summary API

### Status

Implemented on 2026-04-22. Admins can load a typed read-only control tower
summary covering agent roster counts, run counts, action request posture,
oldest pending action, blocked previews, and deterministic trust signals for
policy warnings, missing eval coverage, run warnings, pending backlogs, and
failed actions.

### Size

M

### Outcome

Admin can load one compact summary of agent roster, runs, action requests, and
trust signals.

### Scope

- create an admin summary endpoint for:
  - active, draft, paused, and retired agent counts
  - recent run counts
  - pending action counts
  - oldest pending action
  - failed action count
  - rejected action count
  - agents with policy warnings or missing eval coverage when available
- reuse existing assistant agent, run, and action-request records
- add backend tests for summary shape and access control

### Out of scope

- full analytics warehouse
- auto-pause enforcement

### Dependencies

- AP1-05 if role/profile fields are included

### Acceptance criteria

- endpoint is admin-protected
- summary is deterministic in seeded tests
- response is typed for web consumption

## AP1-11: Admin Control Tower Overview

### Status

Implemented on 2026-04-22. The Admin workspace now has an Agent Control Tower
overview that loads the AP1-10 summary, shows roster posture, run and action
signals, oldest pending action, trust signals, and links to the agent registry,
outcome metrics, and approval inbox while preserving a conservative Phase 1
autonomy statement.

### Size

M

### Outcome

The Admin workspace has a control tower overview that lets supervisors see
agent activity without opening individual chats.

### Scope

- add control tower section to Admin
- show agent roster summary, pending approvals, recent runs, failure signals,
  and oldest pending action
- link to existing agent management and approval inbox panels
- show a conservative Phase 1 autonomy statement in-product

### Out of scope

- full run replay UI
- custom analytics dashboard builder

### Dependencies

- AP1-10

### Acceptance criteria

- admin users can see current agent operating posture in one place
- non-admin users cannot access protected control data
- web tests cover rendering with seeded summary data

## AP1-12: Agent Pause And Narrowing Workflow

### Size

M

### Outcome

Admins can respond to unsafe or noisy agent behavior by pausing an agent or
narrowing its tools/actions without leaving the control tower flow.

### Status

Implemented on 2026-04-23.

### Scope

- expose quick links or actions from control tower to agent edit
- support pause action using existing agent status mechanics
- make tool/action narrowing clear and auditable
- surface policy warning language from role-aware validation when available

### Out of scope

- automatic pause enforcement
- complex approval flow for agent config changes

### Dependencies

- AP1-06
- AP1-11

### Acceptance criteria

- admin can pause an active agent from the supervision flow
- narrowing tools/actions cannot exceed role policy
- changes remain visible in agent audit fields

### Implementation notes

- trust-signal cards now open the agent registry with a pause or narrowing
  supervision draft
- pause and narrowing drafts reuse the existing typed agent update flow instead
  of introducing a parallel mutation path
- supervision drafts stamp activation notes so the change remains visible in the
  agent audit surface before save
- role-fit validation warnings and errors are surfaced inside the supervision
  review banner to keep policy boundaries visible while narrowing scope

## Lane E: Pilot Agent Rollout

## AP1-13: Phase 1 Pilot Agent Seed And Template Alignment

### Size

M

### Outcome

Seeded agents, admin templates, and the role catalog agree on the Phase 1 pilot
lineup.

### Status

Implemented on 2026-04-23.

### Scope

- align seeded and template agents with role archetype keys
- decide which Phase 1 roles are seeded versus template-only:
  - Market Research Agent
  - Pre-Trade Structuring Agent
  - Document Agent
  - Trade Ops Copilot
  - Settlement Copilot
  - Trade Governor
- update seed tests and admin template tests
- avoid granting new action authority unless separately ticketed

### Out of scope

- implementing new tools for every pilot role
- full control tower analytics

### Dependencies

- AP1-04
- AP1-05
- AP1-06

### Acceptance criteria

- role catalog, seed definitions, and admin templates use consistent names and
  role keys
- seeded agents pass policy validation
- template-only roles are clearly labeled as not automatically activated

### Implementation notes

- the synchronized seeded-default lineup is now limited to:
  - Trade Ops Copilot
  - Settlement Copilot
  - Trade Governor
- the Admin blueprint catalog now focuses on the six canonical Phase 1 pilot
  roles:
  - Market Research Agent
  - Pre-Trade Structuring Agent
  - Document Agent
  - Trade Ops Copilot
  - Settlement Copilot
  - Trade Governor
- Market Research Agent, Pre-Trade Structuring Agent, and Document Agent are
  available as template-only blueprints until their dedicated workflows land
- broader non-pilot helper roles still exist in the server role catalog, but
  they are no longer represented as synchronized pilot defaults

## AP1-14: Pre-Trade Structuring Agent Draft And Review Flow

### Size

L

### Outcome

The pre-trade pilot can draft review-ready scenarios without booking trades.

### Status

Implemented on 2026-04-23.

### Scope

- define the agent's allowed tools and workspace context
- let the agent produce structured scenario or review-item draft content
- add approval-gated staging only if the pre-trade review item action contract
  is ready
- ensure generated drafts preserve thesis, assumptions, source context, and
  trade capture handoff fields
- add eval coverage for draft quality and no-direct-booking behavior

### Out of scope

- autonomous trade capture
- external counterparty communication

### Dependencies

- AP1-02
- AP1-13

### Acceptance criteria

- agent can draft a pre-trade scenario grounded in live context
- the workflow does not book a trade directly
- tests or evals verify no external-commitment or trade-booking overreach

### Implementation notes

- Pre-Trade now generates a deterministic structuring-agent packet from the
  current scenario draft plus live recommendation analysis
- the packet includes:
  - thesis and proposed structure summary
  - working assumptions
  - source context and reviewer focus
  - trade-capture handoff fields
  - explicit no-booking guardrails
- submitting a pre-trade draft for review now stages that packet into the
  shared review queue through `review_notes`
- the workflow still fails closed:
  - opening Trade Capture only opens a manual draft form
  - no autonomous trade booking or external commitment was added
- assistant eval coverage now checks for review-ready draft language plus
  explicit refusal to book or persist capture

## AP1-15: Document Agent Triage And Reprocess Flow

### Size

M

### Outcome

The document pilot can explain routing ambiguity and stage safe document
reprocess actions.

### Scope

- align Document Agent role with document ingestion tools
- improve prompt/context guidance around routing, linkage, missing keys, and
  manual review
- stage only `reprocess_document_ingestion` in Phase 1
- add eval coverage for confident explanation, ambiguity surfacing, and safe
  refusal when document identity is unclear

### Out of scope

- auto-creating invoices, payments, confirmations, or deliveries from documents
- autonomous document linkage

### Dependencies

- AP1-07
- AP1-13

### Acceptance criteria

- document agent can explain routing and linkage status from real records
- reprocess action requests include owning document ID and reviewer context
- ambiguous documents produce escalation language instead of unsupported action

## AP1-16: Trade Ops And Settlement Copilot Eval Expansion

### Size

M

### Outcome

The two action-capable pilot copilots have stronger eval coverage for tool
governance, action staging, and safe failure.

### Scope

- add or expand eval cases for:
  - workflow item update staging
  - confirmation issue staging
  - confirmation response staging
  - invoice issue staging
  - payment creation staging
  - stale or missing owning records
  - disallowed action attempts
- ensure evals inspect tool traces and action request metadata

### Out of scope

- adding new action types
- changing business behavior beyond eval-driven fixes

### Dependencies

- AP1-07
- AP1-08 where stale-state behavior is tested

### Acceptance criteria

- action-capable pilot agents have named eval cases for their allowed action
  families
- failures in action governance fail the assistant eval lane
- eval fixture docs explain when to add new cases

## Lane F: Measurement And Regression Coverage

## AP1-17: Agent Outcome Metrics And Reporting Slice

### Size

M

### Outcome

The platform can measure whether Phase 1 agents are creating value or review
burden.

### Implementation note

An initial Admin outcome-metrics API is implemented at
`GET /admin/assistant/outcome-metrics` and surfaced in the Admin workspace. It
aggregates run counts, warning/tool counts, feedback, staged/decided action
outcomes, stale-action outcomes, average decision time, and oldest pending
action age by agent and by action type. The endpoint applies conservative
recommendation thresholds that can mark an agent or action type as
`INSUFFICIENT_DATA`, `KEEP_STAGED`, `ELIGIBLE_FOR_BOUNDED_REVIEW`, or
`RECOMMEND_PAUSE`. These recommendations are advisory only; they do not grant
bounded execution or auto-pause agents.

### Scope

- define first outcome metrics:
  - run count
  - staged action count
  - approval count
  - rejection count
  - failed execution count
  - stale-action count
  - average approval age
- expose metrics by agent and action type
- add a small Admin or Reports display
- document interpretation limits for early metrics

### Out of scope

- PnL attribution by agent
- long-term data warehouse model

### Dependencies

- AP1-10

### Acceptance criteria

- supervisors can see approval/rejection/failure posture by agent
- metrics can identify noisy or low-value agents
- tests cover aggregation on seeded data

## AP1-18: Browser Smoke Coverage For Control Tower Approvals

### Size

M

### Outcome

The highest-trust Phase 1 browser path is protected by smoke coverage.

### Scope

- extend the browser smoke suite to cover:
  - signed-in admin opens control tower
  - pending action request is visible
  - reviewer can reject or approve through the existing approval path
  - summary updates after decision
- reuse deterministic seeded fixtures
- keep the smoke focused on governance, not every agent screen

### Out of scope

- visual regression testing
- full cross-browser matrix

### Dependencies

- AP1-10
- AP1-11

### Acceptance criteria

- a regression in control tower loading or approval decision flow fails the
  smoke test
- fixture setup is documented enough for local debugging
- smoke coverage remains deterministic and not dependent on live model calls

## Lane G: Deterministic Autonomy Candidates

## AP1-19: Deterministic Workflow Item Update Policy

### Size

M

### Outcome

Workflow item updates have a deterministic policy layer that can support safer
agent-staged updates now and measured bounded execution later.

### Implementation note

The workflow-item policy is implemented in the operations workflow-item service.
It centralizes editable-field normalization, explicit status transition tables,
due-date scheduling windows, ledger-managed status blockers, credit constraints,
actualization blockers, reviewer role metadata, old/new preview values,
stale-state basis, expected-version failure handling, idempotent retry
recognition, and deterministic idempotency keys for manual and assistant-staged
workflow updates. Remaining follow-up work before bounded autonomous execution
should define production outcome metrics, correction thresholds, and
workflow-type-specific policy promotions.

### Scope

- define a workflow item update policy for:
  - editable fields: `status`, `owner`, `due_at`, and `notes`
  - status transitions by workflow type
  - owner and reviewer role expectations
  - due-date validation and blocked/overdue handling
  - ledger-managed workflow types that must be updated through their owning
    records instead
  - credit-hold and credit-approval constraints
  - terminal-state and closed-trade stop conditions
- implement or centralize the policy in operations domain service code so routes,
  assistant action execution, and future automation use the same checks
- add stale-state basis and deterministic idempotency guidance for
  `update_trade_workflow_item`
- add old/new field preview data to staged action review context where possible
- update assistant action planning so staged workflow updates cite the owning
  workflow item, requested changes, reviewer role, and missing evidence
- update the [Agent Knowledge Base](./agent-knowledge-base.md) with any policy
  decisions that future agents should reuse

### Out of scope

- granting bounded autonomous execution
- creating a general workflow engine
- changing externally binding scheduling, nomination, or payment behavior
- replacing ledger-managed confirmation, invoice, or payment records

### Dependencies

- AP1-02
- AP1-07
- AP1-08 recommended
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)

### Acceptance criteria

- workflow item update validation is deterministic and shared by manual,
  assistant-staged, and future automation paths
- invalid transitions return actionable reasons without partial writes
- staged workflow update requests include owning work object, old/new preview,
  reviewer role, stale-state basis, and assumptions or missing evidence
- tests cover allowed updates, blocked transitions, ledger-managed blockers,
  credit constraints, stale-state failure, idempotent retry, and audit capture
- assistant evals cover at least one valid staged workflow update and one
  refused or blocked workflow update
- the knowledge base records any accepted policy rules or remaining
  algorithm-candidate gaps
