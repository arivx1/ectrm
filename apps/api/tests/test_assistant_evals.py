from __future__ import annotations

from apps.api.tests.assistant_eval_harness import (
    AssistantApiEvalHarness,
    AssistantEvalAgentFixture,
    AssistantEvalCase,
    AssistantEvalExpectations,
    AssistantEvalTradeFixture,
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
