from __future__ import annotations

from apps.api.tests.assistant_eval_harness import (
    AssistantApiEvalHarness,
    AssistantEvalAgentFixture,
    AssistantEvalCase,
    AssistantEvalDocumentFixture,
    AssistantEvalExpectations,
    AssistantEvalFollowUpExpectations,
    AssistantEvalInvoiceFixture,
    AssistantEvalTradeFixture,
    AssistantEvalUserFixture,
)


MANAGED_AGENT_EVAL_CASES = (
    AssistantEvalCase(
        name="default-provider-falls-back-to-first-configured-runtime",
        request_payload={
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2000\n- commodity: WTI",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Summarize the selected trade from the provided context only."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-fallback-1",
                "output_text": "Using the configured runtime, I can summarize the selected trade from the provided context only.",
                "usage": {"input_tokens": 14, "output_tokens": 16},
            },
        ),
        expectations=AssistantEvalExpectations(
            provider="openai",
            model="gpt-5-mini",
            agent_id=None,
            agent_name=None,
            message_contains=("configured runtime", "provided context only"),
            warning_count=0,
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("workspace", "application-context"),
            prompt_section_absent_keys=("managed-agent", "approval-gated-action"),
            provider_request_count=1,
            provider_tool_names=(),
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-read-agent-uses-allowed-live-tools",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-reader",
            name="Trade Reader",
            capabilities=("READ", "EXPLAIN"),
            allowed_tools=("get_trade_by_id",),
            system_prompt="Use authoritative live reads before explaining a selected trade.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2001"),),
        request_payload={
            "agent_id": "trade-reader",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2001\n- commodity: WTI",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Explain the selected trade and confirm its latest status."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-read-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_read_1",
                        "call_id": "call_eval_read_1",
                        "name": "get_trade_by_id",
                        "arguments": '{"trade_id":"T-2001"}',
                    }
                ],
                "usage": {"input_tokens": 17, "output_tokens": 7},
            },
            {
                "id": "eval-read-2",
                "output_text": "Trade T-2001 is ACTIVE and still priced as WTI in book CRUDE.",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "Trade T-2001 is ACTIVE and still priced as WTI in book CRUDE.",
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 8, "output_tokens": 11},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-reader",
            agent_name="Trade Reader",
            message_contains=("Trade T-2001", "ACTIVE"),
            warning_count=0,
            tool_names=("get_trade_by_id",),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_tool_names=("get_trade_by_id",),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="settlement-read-agent-lists-invoice-issue-candidates",
        agent=AssistantEvalAgentFixture(
            agent_id="settlement-candidate-reader",
            name="Settlement Candidate Reader",
            capabilities=("READ", "EXPLAIN"),
            allowed_workspaces=("assistant", "settlement"),
            allowed_tools=("list_invoice_issue_candidates",),
            system_prompt=(
                "Use live settlement candidate reads when the user asks about pending or unissued invoices."
            ),
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2001I"),),
        request_payload={
            "agent_id": "settlement-candidate-reader",
            "workspace": "settlement",
            "context": "Workspace summary:\n- settlement.invoice_pending_count: 1",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Which pending invoice should I handle first?"},
            ],
        },
        provider_responses=(
            {
                "id": "eval-invoice-candidates-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_invoice_candidates_1",
                        "call_id": "call_eval_invoice_candidates_1",
                        "name": "list_invoice_issue_candidates",
                        "arguments": '{"limit":10}',
                    }
                ],
                "usage": {"input_tokens": 18, "output_tokens": 7},
            },
            {
                "id": "eval-invoice-candidates-2",
                "output_text": "The live candidate read found trade T-2001I still needs its first invoice record; stage issuance only after the preview evidence is clear.",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "The live candidate read found trade T-2001I still needs its first invoice record; stage issuance only after the preview evidence is clear.",
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 10, "output_tokens": 22},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="settlement-candidate-reader",
            agent_name="Settlement Candidate Reader",
            message_contains=("trade T-2001I", "first invoice record", "only after"),
            warning_count=0,
            tool_names=("list_invoice_issue_candidates",),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_tool_names=("list_invoice_issue_candidates",),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="managed-read-agent-prefers-live-evidence-over-stale-context",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-reader-live-evidence",
            name="Trade Reader Live Evidence",
            capabilities=("READ", "EXPLAIN"),
            allowed_tools=("get_trade_by_id",),
            system_prompt="Use live trade reads to resolve any conflict between saved context and current state.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2001C"),),
        request_payload={
            "agent_id": "trade-reader-live-evidence",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2001C\n- commodity: WTI\n- status: CANCELLED",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "The sidebar says this trade is cancelled. Verify the latest status and explain any mismatch."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-read-live-evidence-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_read_live_evidence_1",
                        "call_id": "call_eval_read_live_evidence_1",
                        "name": "get_trade_by_id",
                        "arguments": '{"trade_id":"T-2001C"}',
                    }
                ],
                "usage": {"input_tokens": 19, "output_tokens": 7},
            },
            {
                "id": "eval-read-live-evidence-2",
                "output_text": "The saved context says CANCELLED, but the latest live read shows trade T-2001C is ACTIVE.",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "The saved context says CANCELLED, but the latest live read shows trade T-2001C is ACTIVE.",
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 9, "output_tokens": 15},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-reader-live-evidence",
            agent_name="Trade Reader Live Evidence",
            message_contains=("saved context says CANCELLED", "trade T-2001C is ACTIVE"),
            warning_count=0,
            tool_names=("get_trade_by_id",),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_content_contains=(
                (
                    "application-context",
                    (
                        "status: CANCELLED",
                    ),
                ),
            ),
            provider_request_count=2,
            provider_tool_names=("get_trade_by_id",),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="managed-read-agent-without-enabled-tools-falls-back-to-context-only",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-reader-no-tools",
            name="Trade Reader No Tools",
            capabilities=("READ", "EXPLAIN"),
            allowed_tools=("tool_not_published_here",),
            system_prompt="Use live reads when available, but stay explicit when the runtime cannot offer them.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2001B"),),
        request_payload={
            "agent_id": "trade-reader-no-tools",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2001B\n- commodity: WTI",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Explain the selected trade and be explicit if live reads are unavailable."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-read-no-tools-1",
                "output_text": "I could not verify this with live reads on this worker, so I am using only the provided context.",
                "usage": {"input_tokens": 18, "output_tokens": 18},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-reader-no-tools",
            agent_name="Trade Reader No Tools",
            message_contains=("could not verify", "provided context"),
            warning_count=1,
            warning_contains=("has no enabled live tools on this API worker",),
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=1,
            provider_tool_names=(),
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-draft-agent-warns-and-skips-live-tools",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-writer",
            name="Trade Writer",
            capabilities=("EXPLAIN", "DRAFT"),
            system_prompt="Draft clear operator notes without claiming hidden reads.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2002"),),
        request_payload={
            "agent_id": "trade-writer",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2002\n- commodity: WTI",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Explain the selected trade and draft an operator note."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-write-1",
                "output_text": "I can draft the note from the provided context, but I did not use live reads.",
                "usage": {"input_tokens": 12, "output_tokens": 14},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-writer",
            agent_name="Trade Writer",
            message_contains=("draft the note", "did not use live reads"),
            warning_count=1,
            warning_contains=("does not include READ capability",),
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=1,
            provider_tool_names=(),
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-action-agent-stages-approval-gated-cancel-request",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-captain",
            name="Trade Captain",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("cancel_trade",),
            system_prompt="Stage approval-gated trade actions when the user explicitly requests them.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2003"),),
        request_payload={
            "agent_id": "trade-captain",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2003\n- commodity: WTI",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Cancel the selected trade and explain the workflow."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-action-1",
                "output_text": "I staged a cancellation request for approval. The trade is not cancelled until that request is approved.",
                "usage": {"input_tokens": 18, "output_tokens": 16},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-captain",
            agent_name="Trade Captain",
            message_contains=("staged a cancellation request", "not cancelled until"),
            warning_count=0,
            tool_names=(),
            action_request_types=("cancel_trade",),
            action_request_statuses=("PENDING",),
            action_request_payloads=({"trade_id": "T-2003"},),
            action_request_review_contexts=(
                {
                    "owning_work_object": {"type": "trade", "id": "T-2003", "label": "Trade T-2003"},
                    "required_reviewer_role": "TRADER_OR_DESK_LEAD",
                    "business_rationale": (
                        "Trade T-2003 was identified from the request context and was active when the action was staged."
                    ),
                    "proposed_mutation": {
                        "operation": "cancel_trade",
                        "trade_id": "T-2003",
                        "status": "CANCELLED",
                    },
                    "supporting_records": [
                        {
                            "type": "trade",
                            "id": "T-2003",
                            "label": "Trade T-2003",
                            "summary": "Current trade status was ACTIVE when staged.",
                        },
                    ],
                    "assumptions": [],
                    "missing_evidence": [],
                    "expected_downstream_effects": [
                        "Create a TradeCancelled event.",
                        "Mark the trade projection as CANCELLED.",
                        "Refresh position and option exposure projections.",
                    ],
                    "stale_state_basis": {"status": "ACTIVE", "last_event_id": "evt-t-2003"},
                    "idempotency_key": "assistant-action:cancel_trade:T-2003:evt-t-2003",
                },
            ),
            prompt_section_keys=("managed-agent", "workspace", "application-context", "approval-gated-action"),
            prompt_section_content_contains=(
                (
                    "approval-gated-action",
                    (
                        "Do not claim the action has been executed unless the approval workflow reports EXECUTED.",
                    ),
                ),
            ),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-action-agent-approval-executes-cancel-request",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-captain-exec",
            name="Trade Captain Exec",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("cancel_trade",),
            system_prompt="Stage governed trade actions, and be explicit that execution only happens after approval.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2004"),),
        request_payload={
            "agent_id": "trade-captain-exec",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2004\n- commodity: WTI",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Cancel the selected trade and explain what happens next."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-action-exec-1",
                "output_text": "I staged a cancellation request for approval. It will only execute after the approval workflow completes.",
                "usage": {"input_tokens": 18, "output_tokens": 17},
            },
        ),
        follow_up_action="approve_first_action_request",
        follow_up_expectations=AssistantEvalFollowUpExpectations(
            action_request_status="EXECUTED",
            result_contains={
                "trade_id": "T-2004",
                "trade_status": "CANCELLED",
            },
            result_is_none=False,
            trade_statuses=(("T-2004", "CANCELLED"),),
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-captain-exec",
            agent_name="Trade Captain Exec",
            message_contains=("staged a cancellation request", "only execute after"),
            warning_count=0,
            tool_names=(),
            action_request_types=("cancel_trade",),
            action_request_statuses=("PENDING",),
            action_request_payloads=({"trade_id": "T-2004"},),
            prompt_section_keys=("managed-agent", "workspace", "application-context", "approval-gated-action"),
            prompt_section_content_contains=(
                (
                    "approval-gated-action",
                    (
                        "Do not claim the action has been executed unless the approval workflow reports EXECUTED.",
                    ),
                ),
            ),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-action-agent-cross-user-admin-approval-executes-cancel-request",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-captain-cross-user-admin",
            name="Trade Captain Cross User Admin",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("cancel_trade",),
            system_prompt="Stage governed trade actions for administrative approval without implying self-approval.",
        ),
        request_user=AssistantEvalUserFixture(
            user_id="trader_alpha",
            email="trader.alpha@example.com",
            display_name="Trader Alpha",
            role="TRADER",
        ),
        follow_up_user=AssistantEvalUserFixture(
            user_id="ops_admin_reviewer",
            email="ops.admin@example.com",
            display_name="Ops Admin Reviewer",
            role="OPS_ADMIN",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2004A"),),
        request_payload={
            "agent_id": "trade-captain-cross-user-admin",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2004A\n- commodity: WTI",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Cancel this trade and send it to the approval queue."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-action-cross-user-admin-1",
                "output_text": "I staged a cancellation request for approval. An administrative reviewer must approve it before execution.",
                "usage": {"input_tokens": 18, "output_tokens": 17},
            },
        ),
        follow_up_action="approve_first_action_request",
        follow_up_expectations=AssistantEvalFollowUpExpectations(
            action_request_status="EXECUTED",
            result_contains={
                "trade_id": "T-2004A",
                "trade_status": "CANCELLED",
            },
            result_is_none=False,
            trade_statuses=(("T-2004A", "CANCELLED"),),
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-captain-cross-user-admin",
            agent_name="Trade Captain Cross User Admin",
            message_contains=("staged a cancellation request", "administrative reviewer"),
            warning_count=0,
            tool_names=(),
            action_request_types=("cancel_trade",),
            action_request_statuses=("PENDING",),
            action_request_payloads=({"trade_id": "T-2004A"},),
            prompt_section_keys=("managed-agent", "workspace", "application-context", "approval-gated-action"),
            prompt_section_content_contains=(
                (
                    "approval-gated-action",
                    (
                        "Do not claim the action has been executed unless the approval workflow reports EXECUTED.",
                    ),
                ),
            ),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-action-agent-cross-user-trader-approval-is-forbidden",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-captain-cross-user-denied",
            name="Trade Captain Cross User Denied",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("cancel_trade",),
            system_prompt="Stage governed trade actions while preserving approval access boundaries.",
        ),
        request_user=AssistantEvalUserFixture(
            user_id="trader_alpha",
            email="trader.alpha@example.com",
            display_name="Trader Alpha",
            role="TRADER",
        ),
        follow_up_user=AssistantEvalUserFixture(
            user_id="trader_bravo",
            email="trader.bravo@example.com",
            display_name="Trader Bravo",
            role="TRADER",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2004B"),),
        request_payload={
            "agent_id": "trade-captain-cross-user-denied",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2004B\n- commodity: WTI",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Cancel this trade and make sure approval is required."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-action-cross-user-denied-1",
                "output_text": "I staged a cancellation request for approval. It remains pending until an authorized reviewer decides it.",
                "usage": {"input_tokens": 18, "output_tokens": 17},
            },
        ),
        follow_up_action="approve_first_action_request",
        follow_up_expectations=AssistantEvalFollowUpExpectations(
            http_status=403,
            response_detail_contains=("do not have access to this assistant action request",),
            result_is_none=True,
            trade_statuses=(("T-2004B", "ACTIVE"),),
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-captain-cross-user-denied",
            agent_name="Trade Captain Cross User Denied",
            message_contains=("staged a cancellation request", "authorized reviewer"),
            warning_count=0,
            tool_names=(),
            action_request_types=("cancel_trade",),
            action_request_statuses=("PENDING",),
            action_request_payloads=({"trade_id": "T-2004B"},),
            prompt_section_keys=("managed-agent", "workspace", "application-context", "approval-gated-action"),
            prompt_section_content_contains=(
                (
                    "approval-gated-action",
                    (
                        "Do not claim the action has been executed unless the approval workflow reports EXECUTED.",
                    ),
                ),
            ),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-action-agent-approval-fails-safely-when-trade-becomes-stale",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-captain-stale",
            name="Trade Captain Stale",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("cancel_trade",),
            system_prompt="Stage governed trade actions, but fail safely if the underlying trade changes before approval.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2005"),),
        request_payload={
            "agent_id": "trade-captain-stale",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2005\n- commodity: WTI",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Cancel the selected trade and explain that approval is still required."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-action-stale-1",
                "output_text": "I staged a cancellation request for approval. It has not executed yet.",
                "usage": {"input_tokens": 18, "output_tokens": 14},
            },
        ),
        follow_up_action="approve_first_action_request",
        before_follow_up_trade_status_updates=(("T-2005", "CANCELLED"),),
        follow_up_expectations=AssistantEvalFollowUpExpectations(
            action_request_status="FAILED",
            error_detail_contains=("staged review context is stale", "status expected 'ACTIVE' but found 'CANCELLED'"),
            result_is_none=True,
            trade_statuses=(("T-2005", "CANCELLED"),),
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-captain-stale",
            agent_name="Trade Captain Stale",
            message_contains=("staged a cancellation request", "not executed yet"),
            warning_count=0,
            tool_names=(),
            action_request_types=("cancel_trade",),
            action_request_statuses=("PENDING",),
            action_request_payloads=({"trade_id": "T-2005"},),
            prompt_section_keys=("managed-agent", "workspace", "application-context", "approval-gated-action"),
            prompt_section_content_contains=(
                (
                    "approval-gated-action",
                    (
                        "Do not claim the action has been executed unless the approval workflow reports EXECUTED.",
                    ),
                ),
            ),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-action-agent-does-not-stage-cancel-request-for-closed-trade",
        agent=AssistantEvalAgentFixture(
            agent_id="trade-captain-closed",
            name="Trade Captain Closed",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("cancel_trade",),
            system_prompt="Refuse to imply a governed action was staged when the selected trade is already closed.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2006", status="CANCELLED"),),
        request_payload={
            "agent_id": "trade-captain-closed",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2006\n- commodity: WTI",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Cancel the selected trade and tell me what happens next."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-action-closed-1",
                "output_text": "The selected trade is already cancelled, so I did not stage a new cancellation request.",
                "usage": {"input_tokens": 18, "output_tokens": 16},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="trade-captain-closed",
            agent_name="Trade Captain Closed",
            message_contains=("already cancelled", "did not stage"),
            warning_count=1,
            warning_contains=("already closed as CANCELLED",),
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-action-agent-approval-executes-invoice-issue",
        agent=AssistantEvalAgentFixture(
            agent_id="settlement-governor-invoice",
            name="Settlement Governor Invoice",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("issue_trade_invoice",),
            system_prompt="Stage governed invoice issuance requests and make the approval dependency explicit.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2010"),),
        request_payload={
            "agent_id": "settlement-governor-invoice",
            "workspace": "assistant",
            "context": (
                "Selected trade:\n"
                "- trade_id: T-2010\n"
                "- invoice_number: INV-T-2010\n"
                "- invoice_amount: 2500\n"
            ),
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Issue invoice for this trade."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-invoice-issue-1",
                "output_text": "I staged an invoice issue request for approval. The invoice will only be issued after approval executes.",
                "usage": {"input_tokens": 16, "output_tokens": 17},
            },
        ),
        follow_up_action="approve_first_action_request",
        follow_up_expectations=AssistantEvalFollowUpExpectations(
            action_request_status="EXECUTED",
            result_contains={
                "trade_id": "T-2010",
                "status": "ISSUED",
            },
            result_is_none=False,
        ),
        expectations=AssistantEvalExpectations(
            agent_id="settlement-governor-invoice",
            agent_name="Settlement Governor Invoice",
            message_contains=("staged an invoice issue request", "only be issued after approval"),
            warning_count=0,
            tool_names=(),
            action_request_types=("issue_trade_invoice",),
            action_request_statuses=("PENDING",),
            prompt_section_keys=("managed-agent", "workspace", "application-context", "approval-gated-action"),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-action-agent-approval-executes-payment-creation",
        agent=AssistantEvalAgentFixture(
            agent_id="settlement-governor-payment",
            name="Settlement Governor Payment",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("create_trade_payment",),
            system_prompt="Stage governed payment requests and wait for approval before implying execution.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2011"),),
        invoices=(
            AssistantEvalInvoiceFixture(
                trade_id="T-2011",
                invoice_id=21,
                invoice_number="INV-T-2011",
                invoice_amount=1800.0,
            ),
        ),
        request_payload={
            "agent_id": "settlement-governor-payment",
            "workspace": "assistant",
            "context": (
                "Selected invoice:\n"
                "- invoice_id: 21\n"
                "- payment_reference: PAY-T-2011-1\n"
                "- payment_amount: 1800\n"
                "- status: PAID\n"
            ),
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Record payment for this invoice."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-payment-create-1",
                "output_text": "I staged a payment request for approval. It will only be created after approval executes.",
                "usage": {"input_tokens": 16, "output_tokens": 16},
            },
        ),
        follow_up_action="approve_first_action_request",
        follow_up_expectations=AssistantEvalFollowUpExpectations(
            action_request_status="EXECUTED",
            result_contains={
                "invoice_id": 21,
                "status": "PAID",
            },
            result_is_none=False,
        ),
        expectations=AssistantEvalExpectations(
            agent_id="settlement-governor-payment",
            agent_name="Settlement Governor Payment",
            message_contains=("staged a payment request", "only be created after approval"),
            warning_count=0,
            tool_names=(),
            action_request_types=("create_trade_payment",),
            action_request_statuses=("PENDING",),
            prompt_section_keys=("managed-agent", "workspace", "application-context", "approval-gated-action"),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-action-agent-approval-executes-document-reprocess",
        agent=AssistantEvalAgentFixture(
            agent_id="docs-governor-reprocess",
            name="Docs Governor Reprocess",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("reprocess_document_ingestion",),
            system_prompt="Stage governed document reprocess actions and keep the approval boundary explicit.",
        ),
        documents=(
            AssistantEvalDocumentFixture(document_id="DOC-2020"),
        ),
        request_payload={
            "agent_id": "docs-governor-reprocess",
            "workspace": "assistant",
            "context": (
                "Selected document:\n"
                "- document_id: DOC-2020\n"
                "- processor_provider: openai\n"
            ),
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Reprocess this document."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-doc-reprocess-1",
                "output_text": "I staged a document reprocess request for approval. It will only run after approval executes.",
                "usage": {"input_tokens": 14, "output_tokens": 16},
            },
        ),
        follow_up_action="approve_first_action_request",
        follow_up_expectations=AssistantEvalFollowUpExpectations(
            action_request_status="EXECUTED",
            result_contains={
                "document_id": "DOC-2020",
                "status": "UPLOADED",
            },
            result_is_none=False,
        ),
        expectations=AssistantEvalExpectations(
            agent_id="docs-governor-reprocess",
            agent_name="Docs Governor Reprocess",
            message_contains=("staged a document reprocess request", "only run after approval"),
            warning_count=0,
            tool_names=(),
            action_request_types=("reprocess_document_ingestion",),
            action_request_statuses=("PENDING",),
            prompt_section_keys=("managed-agent", "workspace", "application-context", "approval-gated-action"),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
)


class AssistantManagedAgentEvalTests(AssistantApiEvalHarness):
    def test_managed_agent_eval_suite(self) -> None:
        for case in MANAGED_AGENT_EVAL_CASES:
            with self.subTest(case=case.name):
                self.run_eval_case(case)
