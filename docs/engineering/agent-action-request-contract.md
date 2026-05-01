# Agent Action Request Contract

## Purpose

This document defines the governed contract for assistant action requests. It
gives reviewers, implementers, and future agents a shared answer to:

- what action is being proposed?
- which work object owns it?
- who should review it?
- what evidence supports it?
- what policy or stop conditions apply?
- what should happen if the target record changes before approval?

The same contract now supports both review-gated actions and autonomous
execution by execute-capable managed agents. In both modes, freeform model
output must not mutate business records directly; execution still has to flow
through typed action handlers and domain services.

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
| `review_outcome` | Reviewer decision classification: approved as-is, approved with corrections, or rejected. |
| `decision_note` | Optional reviewer note captured with the approval or rejection. |
| `correction_summary` and `correction_fields` | Structured reviewer correction evidence when approval required edits. |
| `created_at`, `decided_at`, `decided_by` | Review and decision audit. |

The current implementation should preserve this shell while making the
`payload` and reviewer metadata more explicit.

## Target Contract

Every action request should answer the following fields either through
top-level columns or a structured metadata envelope.

| Field | Required in Phase 1 | Purpose |
| --- | --- | --- |
| `action_type` | Yes | Selects the deterministic executor. |
| `owning_work_object` | Yes | Points to the durable record that owns the proposed work. |
| `proposed_mutation` | Yes | Explains the business fields or operation to apply. |
| `required_reviewer_role` | Yes | Identifies the human role expected to approve or reject. |
| `business_rationale` | Yes | Explains why the action is appropriate. |
| `supporting_records` | Yes, where available | Lists records or tool calls supporting the action. |
| `policy_checks` | Yes, where available | Summarizes deterministic policy checks that passed, failed, or were not available. |
| `assumptions` | Yes, when present | Shows inferred context the reviewer should validate. |
| `missing_evidence` | Yes, when present | Shows what the agent could not verify. |
| `expected_downstream_effects` | Yes | Describes projections, workflow state, or records expected to change. |
| `stale_state_basis` | Yes | Captures version/status fields used to block stale approvals. |
| `idempotency_key` | Yes | Prevents duplicate side effects on retry or replay. |
| `review_outcome` | On decision | Distinguishes approved-as-is, approved-with-corrections, and rejected outcomes. |
| `decision_note` | Optional on decision | Captures concise reviewer reasoning. |
| `correction_summary` and `correction_fields` | Required for corrected approval | Captures what the reviewer changed before approving. |

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

## Execution Enforcement

The governed action runtime now treats `review_context` as a required execution
contract. Before any side effect runs, the runtime must:

- require a `review_context` envelope
- require a non-empty `review_context.idempotency_key`
- reject duplicate idempotency keys that already executed
- re-read the current target record and compare it with `stale_state_basis`
- record the passed policy and execution evidence in the action `result`

Execute-capable agents may self-execute a governed action in the same request,
but they still use this same contract and persist execution metadata inside
`review_context`, including `execution_mode`,
`autonomous_execution_reason`, and, when applicable,
`delegated_ability_override_reason`.

Correction actions should prefer explicit business reversals or voids over hard
deletes. Settlement corrections now use invoice voids and payment reversals so
the audit trail, stale-state basis, and downstream projection changes remain
inspectable after the fact. Movement corrections now follow the same pattern:
delivery events reverse through append-only correction rows and actualizations
void through explicit metadata instead of delete paths.

Stale-state rechecks are performed server-side for all published action types,
including trade create/amend/cancel, delivery events, actualizations,
confirmations, workflow item updates, invoices, payments, and document
reprocessing. Workflow item updates may still allow an idempotent retry when
the requested mutation is already reflected on the target record.

## Reviewer Decision Capture

Every terminal review should preserve the reviewer outcome, not just the final
request status. Use these outcomes:

- `APPROVED_AS_IS`: the reviewer accepted the staged action without material
  correction.
- `APPROVED_WITH_CORRECTIONS`: the reviewer approved after correcting evidence,
  payload details, assumptions, or expected effects. Capture a correction
  summary or corrected field names before execution.
- `REJECTED`: the reviewer declined the request. Capture a decision note when
  the reason would help future prompt, policy, or deterministic-algorithm work.

Correction metadata is an autonomy signal. A high approval rate with frequent
corrections should not be treated as ready for bounded execution, because the
human reviewer is still doing material cleanup. Outcome metrics should count
corrected approvals separately and block promotion when correction rate exceeds
the configured threshold.

## Current Action Type Map

| Action type | Owning work object | Reviewer role | Current required payload | Expected effect | Phase 1 contract gap |
| --- | --- | --- | --- | --- | --- |
| `cancel_trade` | `trade` | Trader, Desk Lead, or Admin | `trade_id` | Creates `TradeCancelled`, marks trade cancelled, refreshes projections. | Add stale basis from trade status and `last_event_id`; add downstream-effect metadata. |
| `create_trade` | `trade` | Trader or Desk Lead | `trade_id` plus trade economics payload | Creates `TradeCreated`, builds the active trade projection, and refreshes downstream workflow or position projections. | Keep required field checks, reference-data validation, and explicit create-only stale basis. |
| `amend_trade` | `trade` | Trader or Desk Lead | `trade_id` plus changed trade fields | Creates `TradeAmended`, updates the trade projection, and refreshes downstream workflow or position projections. | Keep changed-field preview, event-led audit context, and stale basis from trade status plus `last_event_id`. |
| `issue_trade_confirmation` | `trade_confirmation` | Operations Lead or Trader | `confirmation_id` | Updates issue metadata and confirmation workflow state. | Add target trade/confirmation summary, recipient evidence, and reviewer role. |
| `record_trade_confirmation_response` | `trade_confirmation` | Operations Lead | `confirmation_id`, `action` | Updates receipt status and downstream workflow state. | Add response evidence, source reference, and stale basis from confirmation version/status. |
| `update_trade_workflow_item` | `trade_workflow_item` | Operations Lead or Settlement Lead | `item_id`, `changes` | Applies workflow field changes with audit. | Add old/new field preview, queue owner, and stale basis from workflow item version/status. |
| `record_trade_actualization` | `trade_actualization` owned by `trade` | Operations Lead | `trade_id`, `actual_quantity`, `actualized_at` | Upserts actualization state and refreshes downstream accrual and workflow projections. | Keep delivery ID derivation, quantity evidence, and stale basis from actualization version plus trade status. |
| `record_delivery_event` | `delivery_obligation` | Operations Lead | `delivery_id`, `event_type`, `occurred_at` | Appends a delivery event and refreshes derived movement execution state. | Use canonical delivery IDs, event-history stale basis, and explicit event-type validation. |
| `reverse_delivery_event` | `delivery_event` owned by `delivery_obligation` | Operations Lead | `delivery_id`, `event_id`, `reversal_reason` | Appends an `EVENT_REVERSED` correction row and recomputes live movement execution state from remaining active event history. | Keep the path append-only, block duplicate reversals, and preserve target-event stale-state checks. |
| `void_trade_actualization` | `trade_actualization` owned by `trade` | Operations Lead | `trade_id`, `void_reason` | Stamps explicit void metadata on the recorded actualization and refreshes downstream actualization, accrual, and workflow projections. | Keep the path non-destructive, require a reason, and block repeat voids through actualization-version stale checks. |
| `create_manual_accrual_entry` | `trade_accrual_lot` | Settlement Lead or Controller | `accrual_lot_id` plus non-zero `quantity_delta` or `amount_delta`, and `effective_at` | Appends an immutable manual accrual entry and recomputes the owning lot rollup. | Keep the action limited to open lots, immutable entries, and explicit evidence-linked deltas. |
| `reverse_accrual_entry` | `trade_accrual_entry` | Settlement Lead or Controller | `entry_id` | Appends an immutable reversal entry and recomputes the owning lot rollup. | Restrict the path to manual accrual entries and preserve duplicate-reversal protection. |
| `issue_trade_invoice` | `trade_invoice` candidate owned by `trade` | Settlement Lead | `trade_id` | Creates an internal invoice record and refreshes settlement workflow projections. | Keep invoice readiness preview, duplicate invoice prevention, and accrual-relief sync inside the typed settlement service. |
| `void_trade_invoice` | `trade_invoice` | Settlement Lead | `invoice_id`, `void_reason` | Marks the invoice `NOT_REQUIRED`, stamps explicit void metadata, refreshes settlement posture, and unwinds eligible invoice relief. | Block while net paid cash is still applied and keep payment-state drift checks tied to the invoice. |
| `create_trade_payment` | `trade_payment` candidate owned by `trade_invoice` | Settlement Lead | `invoice_id` plus payment amount, status, and currency fields when needed | Creates a payment record and refreshes payment workflow projections. | Keep outstanding-balance, currency-match, and duplicate-reference checks inside the typed settlement payment service. |
| `reverse_trade_payment` | `trade_payment` | Settlement Lead | `payment_id`, `reversal_reason` | Appends an offsetting reversal payment record, refreshes payment workflow projections, and reopens invoice balance when appropriate. | Keep reversal immutable and block duplicate reversal or reversal-of-reversal attempts. |
| `create_accounting_entry` | `trade` plus linked accrual, invoice, or payment evidence when present | Controller or Finance Lead | `trade_id`, balanced `lines`, `description`, and `effective_at` | Creates a posted internal accounting entry plus balanced posting lines. | Enforce balanced same-currency lines and keep linkage validation inside the typed posting service. |
| `reverse_accounting_entry` | `trade_accounting_entry` | Controller or Finance Lead | `accounting_entry_id` | Creates an offsetting reversal entry, marks the original reversed, and preserves the ledger trail. | Keep reversal immutable and block duplicate reversal attempts. |
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
- terminal review outcome, decision note, and correction details after decision

The reviewer should not need to open the original chat to understand the
request.

## Stale-State Rules

Phase 1 execution should fail safely when the target record no longer matches
the staged assumptions.

Recommended checks by action:

| Action type | Minimum stale-state basis |
| --- | --- |
| `cancel_trade` | Trade exists, status is still `ACTIVE`, and `last_event_id` matches when available. |
| `create_trade` | Trade does not already exist for the requested `trade_id`. |
| `amend_trade` | Trade exists, current status still permits amendment, and `last_event_id` matches when available. |
| `issue_trade_confirmation` | Confirmation exists and current status/issue count still matches staged basis. |
| `record_trade_confirmation_response` | Confirmation exists and receipt status still matches staged basis. |
| `update_trade_workflow_item` | Workflow item exists and version/status still matches staged basis. |
| `record_trade_actualization` | Trade exists, current trade status still matches, and current actualization version or quantity has not drifted from the staged basis. |
| `record_delivery_event` | Delivery exists under the canonical delivery projection, current execution status still matches, and event count plus latest event basis have not drifted. |
| `reverse_delivery_event` | Delivery exists, current execution status plus event-count basis still match, target event still exists on that delivery, and the target event has not already been reversed or itself become a reversal row. |
| `void_trade_actualization` | Trade exists, current trade status still matches, actualization record still exists for the derived delivery ID, and the actualization version plus `voided_at` basis have not drifted. |
| `create_manual_accrual_entry` | Accrual lot exists, is still open, and lot status, version, and entry count still match the staged basis. |
| `reverse_accrual_entry` | Accrual entry exists, still belongs to the same lot, and no reversal entry has been recorded since staging. |
| `issue_trade_invoice` | Trade exists, settlement/invoice readiness has not materially changed, and no duplicate invoice number was created. |
| `void_trade_invoice` | Invoice exists, is not already `NOT_REQUIRED`, invoice version and payment-state token still match the staged basis, and no net paid cash has appeared since staging. |
| `create_trade_payment` | Invoice exists, outstanding amount/currency still support the payment, and duplicate payment reference is not present. |
| `reverse_trade_payment` | Payment exists, still belongs to the same invoice, payment version and `invoice_id` still match the staged basis, and no reversal entry has already been recorded. |
| `create_accounting_entry` | Trade exists, linked accrual or settlement records still match their staged versions, and the entry does not already exist under the idempotency key. |
| `reverse_accounting_entry` | Accounting entry exists, current status and version still match the staged basis, and no reversal entry has already been recorded. |
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
- Assistant evals should assert that both staged and autonomously executed
  action requests include reviewer metadata for at least one representative
  action per action-capable pilot agent.
