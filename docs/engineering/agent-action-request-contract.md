# Agent Action Request Contract

## Purpose

This document defines the Phase 1 contract for agent-staged action requests.
It gives reviewers, implementers, and future agents a shared answer to:

- what action is being proposed?
- which work object owns it?
- who should review it?
- what evidence supports it?
- what policy or stop conditions apply?
- what should happen if the target record changes before approval?

Phase 1 action requests are approval-gated. They are not autonomous execution
and they must not let freeform model output mutate business records directly.

Related docs:

- [Agent Platform Phase 1 Roadmap](./agent-platform-phase-1-roadmap.md)
- [Agent Platform Phase 1 Tickets](./agent-platform-phase-1-tickets.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [AI Workflow](./ai-workflow.md)

## Current Record Shape

The current `assistant_action_requests` table already provides the core
approval shell:

| Field | Current purpose |
| --- | --- |
| `id` | Stable action request ID. |
| `run_id` | Assistant run that staged the request. |
| `status` | `PENDING`, `EXECUTED`, `REJECTED`, or `FAILED`. |
| `user_id` and `session_id` | User/session that initiated the request. |
| `workspace` | Workspace context when the request was staged. |
| `agent_id` and `agent_name` | Managed agent that staged the request. |
| `action_type` | Published action type to execute. |
| `summary` and `description` | Human-facing reviewer explanation. |
| `payload` | Typed action payload consumed by execution code. |
| `result` | Execution result after approval succeeds. |
| `error_detail` | Failure reason after approval fails. |
| `created_at`, `decided_at`, `decided_by` | Review and decision audit. |

Phase 1 should preserve this shell while making the `payload` and reviewer
metadata more explicit.

## Target Contract

Every staged action request should answer the following fields either through
top-level columns or a structured metadata envelope.

| Field | Required in Phase 1 | Purpose |
| --- | --- | --- |
| `action_type` | Yes | Selects the deterministic executor. |
| `owning_work_object` | Yes | Points to the durable record that owns the proposed work. |
| `proposed_mutation` | Yes | Explains the business fields or operation to apply. |
| `required_reviewer_role` | Yes | Identifies the human role expected to approve or reject. |
| `business_rationale` | Yes | Explains why the action is appropriate. |
| `supporting_records` | Yes, where available | Lists records or tool calls supporting the action. |
| `policy_checks` | Planned | Summarizes deterministic policy checks that passed, failed, or were not available. |
| `assumptions` | Yes, when present | Shows inferred context the reviewer should validate. |
| `missing_evidence` | Yes, when present | Shows what the agent could not verify. |
| `expected_downstream_effects` | Yes | Describes projections, workflow state, or records expected to change. |
| `stale_state_basis` | Planned | Captures version/status fields used to block stale approvals. |
| `idempotency_key` | Planned | Prevents duplicate side effects on retry or replay. |

## Recommended Payload Envelope

Until the database has dedicated columns for all reviewer metadata, use a
reserved `review_context` object inside `payload`.

```json
{
  "domain_payload_field": "value",
  "review_context": {
    "owning_work_object": {
      "type": "trade",
      "id": "TRD-10001",
      "label": "Trade TRD-10001"
    },
    "required_reviewer_role": "TRADER",
    "business_rationale": "The trade was identified as the active selected trade and cancellation was explicitly requested.",
    "supporting_records": [
      {
        "type": "trade",
        "id": "TRD-10001",
        "summary": "Current status was ACTIVE when staged."
      }
    ],
    "assumptions": [],
    "missing_evidence": [],
    "expected_downstream_effects": [
      "Create a TradeCancelled event.",
      "Mark the trade projection as CANCELLED.",
      "Refresh position and option exposure projections."
    ],
    "stale_state_basis": {
      "status": "ACTIVE",
      "last_event_id": "evt-123"
    },
    "idempotency_key": "assistant-action:cancel_trade:TRD-10001:evt-123"
  }
}
```

The envelope should be treated as reviewer and governance metadata. Execution
must continue to use typed domain payload fields and deterministic services,
not arbitrary metadata values.

## Current Action Type Map

| Action type | Owning work object | Reviewer role | Current required payload | Expected effect | Phase 1 contract gap |
| --- | --- | --- | --- | --- | --- |
| `cancel_trade` | `trade` | Trader, Desk Lead, or Admin | `trade_id` | Creates `TradeCancelled`, marks trade cancelled, refreshes projections. | Add stale basis from trade status and `last_event_id`; add downstream-effect metadata. |
| `issue_trade_confirmation` | `trade_confirmation` | Operations Lead or Trader | `confirmation_id` | Updates issue metadata and confirmation workflow state. | Add target trade/confirmation summary, recipient evidence, and reviewer role. |
| `record_trade_confirmation_response` | `trade_confirmation` | Operations Lead | `confirmation_id`, `action` | Updates receipt status and downstream workflow state. | Add response evidence, source reference, and stale basis from confirmation version/status. |
| `update_trade_workflow_item` | `trade_workflow_item` | Operations Lead or Settlement Lead | `item_id`, `changes` | Applies workflow field changes with audit. | Add old/new field preview, queue owner, and stale basis from workflow item version/status. |
| `issue_trade_invoice` | `trade_invoice` candidate owned by `trade` | Settlement Lead | `trade_id` | Creates invoice and refreshes settlement workflow projections. | Add amount/date evidence, invoice readiness checks, and clear missing-evidence fields. |
| `create_trade_payment` | `trade_payment` candidate owned by `trade_invoice` | Settlement Lead | `invoice_id` | Creates payment and refreshes payment workflow projections. | Add outstanding amount, currency checks, and stale basis from invoice/payment balance. |
| `reprocess_document_ingestion` | `document_ingestion` | Operations Lead or Admin | `document_id` | Resets analysis state and reruns document processing. | Add current review status, processor selection rationale, and expected state reset. |

## Reviewer Display Requirements

Approval surfaces should make these fields visible before the decision:

- action type
- summary
- owning work object
- requesting user and agent
- required reviewer role
- proposed mutation
- business rationale
- supporting records
- assumptions and missing evidence
- expected downstream effects
- stale-state warning when applicable
- previous failure detail if the request is no longer pending

The reviewer should not need to open the original chat to understand the
request.

## Stale-State Rules

Phase 1 execution should fail safely when the target record no longer matches
the staged assumptions.

Recommended checks by action:

| Action type | Minimum stale-state basis |
| --- | --- |
| `cancel_trade` | Trade exists, status is still `ACTIVE`, and `last_event_id` matches when available. |
| `issue_trade_confirmation` | Confirmation exists and current status/issue count still matches staged basis. |
| `record_trade_confirmation_response` | Confirmation exists and receipt status still matches staged basis. |
| `update_trade_workflow_item` | Workflow item exists and version/status still matches staged basis. |
| `issue_trade_invoice` | Trade exists, settlement/invoice readiness has not materially changed, and no duplicate invoice number was created. |
| `create_trade_payment` | Invoice exists, outstanding amount/currency still support the payment, and duplicate payment reference is not present. |
| `reprocess_document_ingestion` | Document exists and is not already in a conflicting processing state. |

## Idempotency Guidance

Every action request should be safe to retry after transient failure. Phase 1
idempotency keys can be deterministic strings derived from:

- action type
- owning work object type and ID
- target record version or event ID
- relevant external reference such as invoice number, payment reference, or
  confirmation number

If a deterministic idempotency key cannot be built, the action should remain
approval-gated and retry should be conservative.

## Stop Conditions

An agent should not stage an action request when:

- it cannot identify the owning work object
- the action would externally commit the firm beyond the authority matrix
- required payload fields are missing
- the target record is missing, closed, or already in a terminal state
- source evidence conflicts with the requested mutation
- the reviewer role is unclear
- the action is not in the agent's allowed action list

When a stop condition is hit, the agent should explain what is missing and
recommend the next manual or lower-authority step.

## Implementation Notes

- The first implementation can add `review_context` inside JSON payloads before
  adding new columns.
- Execution code should validate domain payload fields independently of
  `review_context`.
- The Admin approval inbox and Assistant pending-approval surfaces should read
  the same serialized contract.
- Assistant evals should assert that staged action requests include reviewer
  metadata for at least one representative action per action-capable pilot
  agent.

