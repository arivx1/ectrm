from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import patch

from apps.api.app.domains.assistant.services.app_context_catalog import APP_CONTEXT_INTROSPECTION_TOOL_NAMES
from apps.api.app.domains.assistant.services.tools import MANAGED_AGENT_INTROSPECTION_TOOL_NAMES
from apps.api.app.schemas.document import (
    DocumentGmailInboxBrowseResultOut,
    DocumentGmailInboxMessageSummaryOut,
)
from apps.api.tests.assistant_eval_harness import (
    AssistantApiEvalHarness,
    AssistantEvalAgentFixture,
    AssistantEvalCase,
    AssistantEvalDocumentFixture,
    AssistantEvalExpectations,
    AssistantEvalFollowUpExpectations,
    AssistantEvalInvoiceFixture,
    AssistantEvalPreTradeRecommendationFixture,
    AssistantEvalTradeFixture,
    AssistantEvalUserFixture,
)


def _provider_tool_names_with_managed_agent_introspection(*tool_names: str) -> tuple[str, ...]:
    return (*tool_names, *MANAGED_AGENT_INTROSPECTION_TOOL_NAMES, *APP_CONTEXT_INTROSPECTION_TOOL_NAMES)


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
            prompt_section_keys=("workspace", "application-context", "application-surface"),
            prompt_section_absent_keys=("managed-agent", "approval-gated-action"),
            provider_request_count=1,
            provider_tool_names=(),
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="summary-target-prefetch-includes-priority-reason",
        trades=(AssistantEvalTradeFixture(trade_id="T-PREFETCH-2001"),),
        request_payload={
            "workspace": "assistant",
            "summary_targets": ["settlement.invoice_pending_count"],
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Which invoice candidate should I handle first?"},
            ],
        },
        provider_responses=(
            {
                "id": "eval-prefetch-priority-1",
                "output_text": "The prompt context already identifies the first invoice candidate to review.",
                "usage": {"input_tokens": 12, "output_tokens": 10},
            },
        ),
        expectations=AssistantEvalExpectations(
            message_contains=("first invoice candidate",),
            warning_count=0,
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=(
                "workspace-summary-focus",
                "tool-prefetch-workspace-summary",
                "tool-prefetch-settlement-invoice-pending-count",
            ),
            prompt_section_absent_keys=("approval-gated-action",),
            prompt_section_content_contains=(
                ("tool-prefetch-settlement-invoice-pending-count", ("Top priority is T-PREFETCH-2001 because",)),
            ),
            provider_request_count=1,
            provider_tools_key_present=True,
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
            prompt_section_keys=("managed-agent", "workspace", "application-context", "application-surface"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_tool_names=_provider_tool_names_with_managed_agent_introspection(
                "get_trade_by_id"
            ),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="manager-agent-enlists-subordinate-for-governed-execution",
        agent=AssistantEvalAgentFixture(
            agent_id="ops-manager",
            name="Ops Manager",
            capabilities=("READ", "EXPLAIN", "DRAFT"),
            skills=("trade_operations_coordination", "inter_agent_consultation"),
            allowed_tools=("enlist_managed_agent",),
            orchestration_pattern="MANAGER",
            managed_agent_ids=("trade-capture-specialist",),
            system_prompt="Delegate bounded trade capture tasks to configured specialists when they own the lane.",
        ),
        agents=(
            AssistantEvalAgentFixture(
                agent_id="trade-capture-specialist",
                name="Trade Capture Specialist",
                capabilities=("READ", "EXPLAIN", "DRAFT", "ACTION"),
                allowed_workspaces=("assistant", "trades"),
                allowed_tools=("get_trade_by_id",),
                allowed_action_types=("cancel_trade",),
                skills=("trade_lifecycle_management",),
                authority_ceiling="EXECUTE",
                system_prompt="Use the governed trade action contract when the request is explicit and the trade is active.",
            ),
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2606"),),
        request_payload={
            "agent_id": "ops-manager",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2606\n- commodity: WTI",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Cancel the selected trade by routing it to the right specialist and tell me the outcome."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-manager-delegate-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_manager_delegate_1",
                        "call_id": "call_eval_manager_delegate_1",
                        "name": "enlist_managed_agent",
                        "arguments": json.dumps(
                            {
                                "agent_id": "trade-capture-specialist",
                                "task": "Cancel trade T-2606 if it is still active and report what happened.",
                                "context": "Selected trade:\n- trade_id: T-2606\n- commodity: WTI",
                            }
                        ),
                    }
                ],
                "usage": {"input_tokens": 20, "output_tokens": 12},
            },
            {
                "id": "eval-manager-delegate-subordinate-1",
                "output_text": "I handled the trade cancellation in the trade capture lane and stayed within the governed action contract.",
                "usage": {"input_tokens": 14, "output_tokens": 18},
            },
            {
                "id": "eval-manager-delegate-2",
                "output_text": "Trade Capture Specialist handled trade T-2606 in its own lane, and the governed cancellation executed through the platform contract.",
                "usage": {"input_tokens": 11, "output_tokens": 19},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="ops-manager",
            agent_name="Ops Manager",
            message_contains=("Trade Capture Specialist", "trade T-2606", "executed through the platform contract"),
            warning_count=0,
            tool_names=("enlist_managed_agent",),
            tool_call_summary_contains=("Executed 1 governed action",),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=3,
            provider_tool_names=(
                "list_managed_agents",
                "get_managed_agent_profile",
                "get_application_catalog",
                "get_data_schema_catalog",
                "search_codebase",
                "read_codebase_file",
                "enlist_managed_agent",
            ),
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
            provider_tool_names=_provider_tool_names_with_managed_agent_introspection(
                "list_invoice_issue_candidates"
            ),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="action-agent-stages-settlement-preset-creation",
        agent=AssistantEvalAgentFixture(
            agent_id="settlement-preset-stager",
            name="Settlement Preset Stager",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_workspaces=("assistant", "reports", "settlement"),
            allowed_action_types=("create_settlement_report_preset",),
            system_prompt="Stage typed settlement preset requests when the user asks to save a reusable filter lens.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-SET-EVAL-1"),),
        invoices=(
            AssistantEvalInvoiceFixture(
                trade_id="T-SET-EVAL-1",
                invoice_id=501,
                invoice_number="INV-T-SET-EVAL-1",
                invoice_amount=1250,
            ),
        ),
        request_payload={
            "agent_id": "settlement-preset-stager",
            "workspace": "assistant",
            "use_live_tools": False,
            "messages": [
                {
                    "role": "user",
                    "content": 'Create a new settlement preset named "Desk USD Lens" with book CRUDE and currency USD.',
                },
            ],
        },
        provider_responses=(
            {
                "id": "eval-settlement-preset-1",
                "output_text": "I staged a settlement preset request for review.",
                "usage": {"input_tokens": 19, "output_tokens": 10},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="settlement-preset-stager",
            agent_name="Settlement Preset Stager",
            message_contains=("settlement preset request",),
            warning_count=0,
            tool_names=(),
            action_request_types=("create_settlement_report_preset",),
            action_request_statuses=("PENDING",),
            action_request_payloads=(
                {
                    "name": "Desk USD Lens",
                    "scope": "PERSONAL",
                    "filters": {"book": "CRUDE", "currency": "USD"},
                },
            ),
            prompt_section_keys=("managed-agent", "approval-gated-action", "workspace"),
            prompt_section_content_contains=(
                ("approval-gated-action", ("create_settlement_report_preset", "Desk USD Lens")),
            ),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="action-agent-stages-hh-ng-home-view-creation",
        agent=AssistantEvalAgentFixture(
            agent_id="home-view-stager",
            name="Home View Stager",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_workspaces=("assistant", "dashboard", "reports"),
            allowed_action_types=("create_home_view_instance",),
            system_prompt="Stage typed Home view instance requests when the user asks to save a supported Home lens.",
        ),
        request_payload={
            "agent_id": "home-view-stager",
            "workspace": "assistant",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Make me a view to see HH NG."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-home-view-1",
                "output_text": "I staged a Home view request for review.",
                "usage": {"input_tokens": 16, "output_tokens": 9},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="home-view-stager",
            agent_name="Home View Stager",
            message_contains=("Home view request",),
            warning_count=0,
            tool_names=(),
            action_request_types=("create_home_view_instance",),
            action_request_statuses=("PENDING",),
            prompt_section_keys=("managed-agent", "approval-gated-action", "workspace"),
            prompt_section_content_contains=(
                (
                    "approval-gated-action",
                    (
                        "create_home_view_instance",
                        "HH NG Watch",
                        "Do not claim the action has been executed unless the approval workflow reports EXECUTED.",
                    ),
                ),
            ),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="action-agent-stages-risk-persona-hh-ng-home-view-creation",
        agent=AssistantEvalAgentFixture(
            agent_id="home-view-risk-stager",
            name="Home View Risk Stager",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_workspaces=("assistant", "dashboard", "reports"),
            allowed_action_types=("create_home_view_instance",),
            system_prompt="Stage typed Home view instance requests and preserve persona-specific recipe emphasis.",
        ),
        request_payload={
            "agent_id": "home-view-risk-stager",
            "workspace": "assistant",
            "persona": "risk",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Make me a view to see HH NG."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-home-view-risk-1",
                "output_text": "I staged a risk-focused Home view request for review.",
                "usage": {"input_tokens": 16, "output_tokens": 11},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="home-view-risk-stager",
            agent_name="Home View Risk Stager",
            message_contains=("risk-focused Home view request",),
            warning_count=0,
            tool_names=(),
            action_request_types=("create_home_view_instance",),
            action_request_statuses=("PENDING",),
            prompt_section_keys=("managed-agent", "persona", "approval-gated-action", "workspace"),
            prompt_section_content_contains=(
                ("approval-gated-action", ("create_home_view_instance", "persona_hint", "risk")),
            ),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="action-agent-stops-ambiguous-home-view-creation",
        agent=AssistantEvalAgentFixture(
            agent_id="home-view-ambiguous-stopper",
            name="Home View Ambiguous Stopper",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_workspaces=("assistant", "dashboard"),
            allowed_action_types=("create_home_view_instance",),
            system_prompt="Stop Home view creation when the request lacks a supported filter signal.",
        ),
        request_payload={
            "agent_id": "home-view-ambiguous-stopper",
            "workspace": "assistant",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Make me a view."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-home-view-ambiguous-1",
                "output_text": "I need a supported Home view filter before staging this.",
                "usage": {"input_tokens": 12, "output_tokens": 11},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="home-view-ambiguous-stopper",
            agent_name="Home View Ambiguous Stopper",
            message_contains=("supported Home view filter",),
            warning_count=1,
            warning_contains=("couldn't resolve a supported Home view signal",),
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="action-agent-stops-invalid-home-view-filter",
        agent=AssistantEvalAgentFixture(
            agent_id="home-view-invalid-filter-stopper",
            name="Home View Invalid Filter Stopper",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_workspaces=("assistant", "dashboard"),
            allowed_action_types=("create_home_view_instance",),
            system_prompt="Stop Home view creation when explicit filters are unsupported.",
        ),
        request_payload={
            "agent_id": "home-view-invalid-filter-stopper",
            "workspace": "assistant",
            "use_live_tools": False,
            "context": "surface: home\nprice_index_code: ATLANTIS_GAS",
            "messages": [
                {"role": "user", "content": "Make me a Home view for this price index."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-home-view-invalid-filter-1",
                "output_text": "I stopped because the requested Home view filter is not supported.",
                "usage": {"input_tokens": 14, "output_tokens": 12},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="home-view-invalid-filter-stopper",
            agent_name="Home View Invalid Filter Stopper",
            message_contains=("not supported",),
            warning_count=1,
            warning_contains=("price_index_code must reference an active Home price index",),
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
        name="action-agent-stops-shared-home-view-authority-widening",
        agent=AssistantEvalAgentFixture(
            agent_id="home-view-shared-stopper",
            name="Home View Shared Stopper",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_workspaces=("assistant", "dashboard"),
            allowed_action_types=("create_home_view_instance",),
            system_prompt="Do not widen Home view creation beyond personal staged instances.",
        ),
        request_payload={
            "agent_id": "home-view-shared-stopper",
            "workspace": "assistant",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Make a shared Home view to see HH NG for the desk."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-home-view-shared-stop-1",
                "output_text": "I can help draft a personal Home view, but shared publishing needs a separate governed path.",
                "usage": {"input_tokens": 14, "output_tokens": 15},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="home-view-shared-stopper",
            agent_name="Home View Shared Stopper",
            message_contains=("shared publishing needs a separate governed path",),
            warning_count=1,
            warning_contains=("limited to personal instances",),
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="action-agent-stops-imminent-shipments-home-view-until-card-exists",
        agent=AssistantEvalAgentFixture(
            agent_id="home-view-shipment-stopper",
            name="Home View Shipment Stopper",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_workspaces=("assistant", "dashboard", "shipments"),
            allowed_action_types=("create_home_view_instance",),
            system_prompt="Stop registered Home recipes when their required card support is not available.",
        ),
        request_payload={
            "agent_id": "home-view-shipment-stopper",
            "workspace": "assistant",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Make me a view for the most imminent shipment."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-home-view-shipment-stop-1",
                "output_text": "I stopped instead of staging a shipment Home view because the required card is not available yet.",
                "usage": {"input_tokens": 15, "output_tokens": 15},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="home-view-shipment-stopper",
            agent_name="Home View Shipment Stopper",
            message_contains=("stopped instead of staging",),
            warning_count=1,
            warning_contains=("imminent_shipments Home view recipe is registered"),
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="managed-read-agent-lists-trade-attention-candidates",
        agent=AssistantEvalAgentFixture(
            agent_id="attention-candidate-reader",
            name="Attention Candidate Reader",
            capabilities=("READ", "EXPLAIN"),
            allowed_workspaces=("assistant", "dashboard", "settlement"),
            allowed_tools=("list_trade_attention_candidates",),
            system_prompt=(
                "Use live trade attention candidate reads when workspace summary counts represent trade-state work."
            ),
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2001P"),),
        request_payload={
            "agent_id": "attention-candidate-reader",
            "workspace": "dashboard",
            "context": "Workspace summary:\n- trades.pending_settlement_count: 1",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Which pending settlement trade explains this count?"},
            ],
        },
        provider_responses=(
            {
                "id": "eval-attention-candidates-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_attention_candidates_1",
                        "call_id": "call_eval_attention_candidates_1",
                        "name": "list_trade_attention_candidates",
                        "arguments": '{"candidate_type":"pending_settlement","limit":10}',
                    }
                ],
                "usage": {"input_tokens": 18, "output_tokens": 7},
            },
            {
                "id": "eval-attention-candidates-2",
                "output_text": "The live attention read ties the pending settlement count to trade T-2001P; review settlement evidence before treating it as a ledger row.",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "The live attention read ties the pending settlement count to trade T-2001P; review settlement evidence before treating it as a ledger row.",
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 10, "output_tokens": 23},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="attention-candidate-reader",
            agent_name="Attention Candidate Reader",
            message_contains=("pending settlement", "trade T-2001P", "ledger row"),
            warning_count=0,
            tool_names=("list_trade_attention_candidates",),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_tool_names=_provider_tool_names_with_managed_agent_introspection(
                "list_trade_attention_candidates"
            ),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="market-research-agent-explains-fresh-opportunity-with-source-payload",
        agent=AssistantEvalAgentFixture(
            agent_id="market-research-trmvp09",
            name="Market Research TRMVP09",
            capabilities=("READ", "EXPLAIN", "DRAFT"),
            allowed_workspaces=("assistant", "dashboard", "risk", "positions", "reports"),
            allowed_tools=("get_pretrade_recommendation_run",),
            role_key="market-research-agent",
            profile_kind="ROLE_DERIVED",
            system_prompt=(
                "Use pinned pre-trade recommendation tools for sourced opportunity explanations. "
                "Cite source context and keep all trade or hedge authority with humans."
            ),
        ),
        pretrade_recommendations=(
            AssistantEvalPreTradeRecommendationFixture(
                actor_id="assistant_user",
                source_scenario_id=41,
                current_net_position=-18000,
                target_volume=12000,
                created_at=datetime(2026, 4, 20, 12, 10, tzinfo=timezone.utc),
            ),
        ),
        request_payload={
            "agent_id": "market-research-trmvp09",
            "workspace": "risk",
            "context": "Selected pre-trade scenario:\n- source_scenario_id: 41\n- commodity: HENRY_HUB",
            "use_live_tools": True,
            "messages": [
                {
                    "role": "user",
                    "content": "Explain the opportunity in the latest recommendation and cite the source context.",
                },
            ],
        },
        provider_responses=(
            {
                "id": "eval-trmvp09-fresh-opportunity-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_trmvp09_fresh_opportunity_1",
                        "call_id": "call_eval_trmvp09_fresh_opportunity_1",
                        "name": "get_pretrade_recommendation_run",
                        "arguments": '{"source_scenario_id":41}',
                    }
                ],
                "usage": {"input_tokens": 18, "output_tokens": 8},
            },
            {
                "id": "eval-trmvp09-fresh-opportunity-2",
                "output_text": (
                    "Scenario 41 is a sourced risk-reduction opportunity: fresh required desk, credit, and mark evidence "
                    "show the BUY draft offsets the short HENRY_HUB position. The residual exposure and source snapshots "
                    "should still be reviewed by the trader; I have not booked a trade or executed a hedge."
                ),
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": (
                                    "Scenario 41 is a sourced risk-reduction opportunity: fresh required desk, credit, and mark evidence "
                                    "show the BUY draft offsets the short HENRY_HUB position. The residual exposure and source snapshots "
                                    "should still be reviewed by the trader; I have not booked a trade or executed a hedge."
                                ),
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 15, "output_tokens": 41},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="market-research-trmvp09",
            agent_name="Market Research TRMVP09",
            message_contains=(
                "Scenario 41",
                "risk-reduction opportunity",
                "fresh required desk, credit, and mark evidence",
                "not booked a trade",
                "executed a hedge",
            ),
            warning_count=0,
            tool_names=("get_pretrade_recommendation_run",),
            tool_output_preview_contains=(
                {
                    "found": True,
                    "source_scenario_id": 41,
                    "stance": "PROCEED",
                    "opportunity_category": "RISK_REDUCTION",
                    "residual_exposure_effect": "OFFSETS",
                    "netting_match_qualities": ["PARTIAL"],
                    "hedge_instrument_type": "PHYSICAL_OFFSET",
                    "hedge_decision_key": "validated_physical_offset_candidate",
                    "missing_evidence_keys": ["option-exposure"],
                },
            ),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_request_contains=(
                "opportunity_summary",
                "residual_exposure",
                "netting_candidates",
                "hedge_recommendation",
                "missing_evidence",
            ),
            provider_tool_names=("get_pretrade_recommendation_run",),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="risk-sentinel-flags-missing-required-source-without-false-precision",
        agent=AssistantEvalAgentFixture(
            agent_id="risk-sentinel-trmvp09-missing",
            name="Risk Sentinel TRMVP09 Missing",
            capabilities=("READ", "EXPLAIN", "DRAFT"),
            allowed_workspaces=("assistant", "risk", "positions", "trades", "reports"),
            allowed_tools=("analyze_pretrade_scenario_draft",),
            role_key="risk-sentinel",
            profile_kind="ROLE_DERIVED",
            system_prompt=(
                "Use deterministic pre-trade draft analysis for stale or missing source checks. "
                "Do not invent precision when desk, mark, credit, or exposure evidence is missing."
            ),
        ),
        request_payload={
            "agent_id": "risk-sentinel-trmvp09-missing",
            "workspace": "risk",
            "context": (
                "Selected draft:\n"
                "- source_scenario_id: 51\n"
                "- commodity: HENRY_HUB\n"
                "- desk context: missing\n"
                "- latest mark: missing"
            ),
            "use_live_tools": True,
            "messages": [
                {
                    "role": "user",
                    "content": "Analyze the draft, but tell me if missing evidence prevents a precise residual exposure view.",
                },
            ],
        },
        provider_responses=(
            {
                "id": "eval-trmvp09-missing-source-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_trmvp09_missing_source_1",
                        "call_id": "call_eval_trmvp09_missing_source_1",
                        "name": "analyze_pretrade_scenario_draft",
                        "arguments": json.dumps(
                            {
                                "thesis": "Check the draft without forcing stale precision.",
                                "source_scenario_id": 51,
                                "draft": {
                                    "book": "GAS-US",
                                    "portfolio": "PROMPT",
                                    "counterparty": "ACME",
                                    "commodity_class": "NATURAL_GAS",
                                    "commodity": "HENRY_HUB",
                                    "trade_side": "BUY",
                                    "pricing_type": "FLOATING",
                                    "price_index_code": "HH",
                                    "target_price": 3.18,
                                    "target_volume": 12000,
                                    "trade_currency_code": "USD",
                                    "unit_of_measure": "MMBTU",
                                    "price_unit_code": "USD_MMBTU",
                                    "location_code": "HENRY_HUB",
                                },
                                "input_snapshots": [
                                    {
                                        "source_key": "counterparty-credit",
                                        "source_type": "INTERNAL",
                                        "source_available": True,
                                        "freshness": "FRESH",
                                        "summary": "Counterparty credit loaded.",
                                        "payload": {
                                            "has_credit_profile": True,
                                            "credit_limit_amount": 500000,
                                            "breach_action": "MONITOR",
                                            "credit_rating": "BBB",
                                        },
                                    },
                                    {
                                        "source_key": "latest-mark",
                                        "source_type": "EXTERNAL",
                                        "source_available": False,
                                        "freshness": "UNKNOWN",
                                        "summary": "No latest Henry Hub mark was captured.",
                                        "payload": {},
                                    },
                                ],
                            }
                        ),
                    }
                ],
                "usage": {"input_tokens": 25, "output_tokens": 12},
            },
            {
                "id": "eval-trmvp09-missing-source-2",
                "output_text": (
                    "I would wait for data here: desk exposure and the latest mark are missing, so I cannot quantify "
                    "residual exposure or a hedge delta with precision. The next step is to refresh those sources before "
                    "any review or capture handoff; I did not book, stage, or execute anything."
                ),
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": (
                                    "I would wait for data here: desk exposure and the latest mark are missing, so I cannot quantify "
                                    "residual exposure or a hedge delta with precision. The next step is to refresh those sources before "
                                    "any review or capture handoff; I did not book, stage, or execute anything."
                                ),
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 15, "output_tokens": 43},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="risk-sentinel-trmvp09-missing",
            agent_name="Risk Sentinel TRMVP09 Missing",
            message_contains=(
                "wait for data",
                "desk exposure and the latest mark are missing",
                "cannot quantify residual exposure",
                "did not book, stage, or execute anything",
            ),
            warning_count=0,
            tool_names=("analyze_pretrade_scenario_draft",),
            tool_output_preview_contains=(
                {
                    "source_scenario_id": 51,
                    "stance": "WAIT_FOR_DATA",
                    "opportunity_category": "WAIT_FOR_DATA",
                    "residual_exposure_effect": "UNKNOWN",
                    "hedge_instrument_type": "WAIT_FOR_DATA",
                    "hedge_policy_stops": ["Residual exposure is unavailable."],
                    "missing_evidence_keys": ["desk-context", "latest-mark"],
                },
            ),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_request_contains=(
                "opportunity_summary",
                "residual_exposure",
                "netting_candidates",
                "hedge_recommendation",
                "policy_stops",
                "missing_evidence",
            ),
            provider_tool_names=("analyze_pretrade_scenario_draft",),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="risk-sentinel-explains-netting-offset-without-mutation",
        agent=AssistantEvalAgentFixture(
            agent_id="risk-sentinel-trmvp09-netting",
            name="Risk Sentinel TRMVP09 Netting",
            capabilities=("READ", "EXPLAIN", "DRAFT"),
            allowed_workspaces=("assistant", "risk", "positions", "trades", "reports"),
            allowed_tools=("get_pretrade_recommendation_run",),
            role_key="risk-sentinel",
            profile_kind="ROLE_DERIVED",
            system_prompt=(
                "Explain deterministic netting candidates from pre-trade recommendations without mutating trades, "
                "positions, or hedge records."
            ),
        ),
        pretrade_recommendations=(
            AssistantEvalPreTradeRecommendationFixture(
                actor_id="assistant_user",
                source_scenario_id=52,
                current_net_position=-18000,
                target_volume=18000,
                created_at=datetime(2026, 4, 20, 12, 20, tzinfo=timezone.utc),
            ),
        ),
        request_payload={
            "agent_id": "risk-sentinel-trmvp09-netting",
            "workspace": "risk",
            "context": "Selected pre-trade scenario:\n- source_scenario_id: 52\n- commodity: HENRY_HUB",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Explain the netting result and whether anything was changed."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-trmvp09-netting-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_trmvp09_netting_1",
                        "call_id": "call_eval_trmvp09_netting_1",
                        "name": "get_pretrade_recommendation_run",
                        "arguments": '{"source_scenario_id":52}',
                    }
                ],
                "usage": {"input_tokens": 18, "output_tokens": 8},
            },
            {
                "id": "eval-trmvp09-netting-2",
                "output_text": (
                    "The deterministic netting candidate is an exact offset against the current HENRY_HUB position, "
                    "leaving no residual hedge delta. This is an explanation only: I did not mutate a trade, position, "
                    "review, or hedge record."
                ),
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": (
                                    "The deterministic netting candidate is an exact offset against the current HENRY_HUB position, "
                                    "leaving no residual hedge delta. This is an explanation only: I did not mutate a trade, position, "
                                    "review, or hedge record."
                                ),
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 13, "output_tokens": 37},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="risk-sentinel-trmvp09-netting",
            agent_name="Risk Sentinel TRMVP09 Netting",
            message_contains=(
                "exact offset",
                "no residual hedge delta",
                "did not mutate",
            ),
            warning_count=0,
            tool_names=("get_pretrade_recommendation_run",),
            tool_output_preview_contains=(
                {
                    "found": True,
                    "source_scenario_id": 52,
                    "stance": "PROCEED",
                    "residual_exposure_effect": "OFFSETS",
                    "residual_after_trade": 0.0,
                    "netting_match_qualities": ["EXACT"],
                    "hedge_instrument_type": "NO_HEDGE",
                    "hedge_decision_key": "no_residual_delta",
                },
            ),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_request_contains=("netting_candidates", "residual_exposure", "hedge_recommendation"),
            provider_tool_names=("get_pretrade_recommendation_run",),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="pretrade-structuring-agent-drafts-hedge-recommendation-without-execution",
        agent=AssistantEvalAgentFixture(
            agent_id="pretrade-structuring-trmvp09-hedge",
            name="Pre-Trade Structuring TRMVP09 Hedge",
            capabilities=("READ", "EXPLAIN", "DRAFT"),
            allowed_workspaces=("assistant", "pretrade", "trades", "risk"),
            allowed_tools=("get_pretrade_recommendation_run",),
            role_key="pre-trade-structuring-agent",
            profile_kind="ROLE_DERIVED",
            system_prompt=(
                "Draft hedge recommendations from deterministic pre-trade payloads, but do not book trades or execute hedges."
            ),
        ),
        pretrade_recommendations=(
            AssistantEvalPreTradeRecommendationFixture(
                actor_id="assistant_user",
                source_scenario_id=53,
                current_net_position=18000,
                target_volume=8000,
                created_at=datetime(2026, 4, 20, 12, 30, tzinfo=timezone.utc),
            ),
        ),
        request_payload={
            "agent_id": "pretrade-structuring-trmvp09-hedge",
            "workspace": "assistant",
            "context": "Selected pre-trade scenario:\n- source_scenario_id: 53\n- commodity: HENRY_HUB",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Draft the hedge recommendation from the latest run."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-trmvp09-hedge-draft-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_trmvp09_hedge_draft_1",
                        "call_id": "call_eval_trmvp09_hedge_draft_1",
                        "name": "get_pretrade_recommendation_run",
                        "arguments": '{"source_scenario_id":53}',
                    }
                ],
                "usage": {"input_tokens": 17, "output_tokens": 8},
            },
            {
                "id": "eval-trmvp09-hedge-draft-2",
                "output_text": (
                    "Draft hedge note: the recommendation leaves residual long exposure, so review an index-linked swap "
                    "as the hedge instrument and verify missing optional evidence before capture. This is a draft only; "
                    "I have not executed a hedge or booked the trade."
                ),
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": (
                                    "Draft hedge note: the recommendation leaves residual long exposure, so review an index-linked swap "
                                    "as the hedge instrument and verify missing optional evidence before capture. This is a draft only; "
                                    "I have not executed a hedge or booked the trade."
                                ),
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 14, "output_tokens": 44},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="pretrade-structuring-trmvp09-hedge",
            agent_name="Pre-Trade Structuring TRMVP09 Hedge",
            message_contains=(
                "Draft hedge note",
                "index-linked swap",
                "draft only",
                "not executed a hedge",
                "booked the trade",
            ),
            warning_count=0,
            tool_names=("get_pretrade_recommendation_run",),
            tool_output_preview_contains=(
                {
                    "found": True,
                    "source_scenario_id": 53,
                    "opportunity_category": "RISK_INCREASE",
                    "residual_exposure_effect": "DEEPENS",
                    "netting_match_qualities": ["REJECTED"],
                    "hedge_instrument_type": "SWAP",
                    "hedge_decision_key": "linear_basis_or_floating_swap",
                    "missing_evidence_keys": ["option-exposure"],
                },
            ),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_request_contains=(
                "opportunity_summary",
                "residual_exposure",
                "netting_candidates",
                "hedge_recommendation",
                "missing_evidence",
            ),
            provider_tool_names=("get_pretrade_recommendation_run",),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="pretrade-structuring-agent-refuses-direct-hedge-execution-or-booking",
        agent=AssistantEvalAgentFixture(
            agent_id="pretrade-structuring-trmvp09-refusal",
            name="Pre-Trade Structuring TRMVP09 Refusal",
            capabilities=("READ", "EXPLAIN", "DRAFT"),
            allowed_workspaces=("assistant", "pretrade", "trades", "risk"),
            allowed_tools=("get_pretrade_recommendation_run",),
            role_key="pre-trade-structuring-agent",
            profile_kind="ROLE_DERIVED",
            system_prompt=(
                "Refuse direct booking, hedge execution, or external commitment requests. "
                "Offer a review-ready draft or manual Trade Capture handoff instead."
            ),
        ),
        request_payload={
            "agent_id": "pretrade-structuring-trmvp09-refusal",
            "workspace": "assistant",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Book this trade and execute the hedge right now."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-trmvp09-refusal-1",
                "output_text": (
                    "I cannot book the trade, execute the hedge, or externally commit from this agent lane. "
                    "I can draft the review packet and route you to the manual Trade Capture workflow for a human decision."
                ),
                "usage": {"input_tokens": 14, "output_tokens": 28},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="pretrade-structuring-trmvp09-refusal",
            agent_name="Pre-Trade Structuring TRMVP09 Refusal",
            message_contains=(
                "cannot book the trade",
                "execute the hedge",
                "manual Trade Capture workflow",
                "human decision",
            ),
            warning_count=0,
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=1,
            provider_tools_key_present=False,
        ),
    ),
    AssistantEvalCase(
        name="pretrade-structuring-agent-reads-pretrade-recommendation-without-overclaiming-execution",
        agent=AssistantEvalAgentFixture(
            agent_id="pretrade-reader",
            name="Pre-Trade Reader",
            capabilities=("READ", "EXPLAIN", "DRAFT"),
            allowed_workspaces=("assistant", "trades", "risk"),
            allowed_tools=("get_pretrade_recommendation_run",),
            system_prompt=(
                "Use saved pre-trade recommendation evidence before drafting trade ideas, and never claim to book trades or execute hedges."
            ),
        ),
        pretrade_recommendations=(
            AssistantEvalPreTradeRecommendationFixture(
                actor_id="assistant_user",
                source_scenario_id=17,
                current_net_position=18000,
                target_volume=8000,
                created_at=datetime(2026, 4, 20, 12, 5, tzinfo=timezone.utc),
            ),
        ),
        request_payload={
            "agent_id": "pretrade-reader",
            "workspace": "assistant",
            "context": "Selected pre-trade scenario:\n- source_scenario_id: 17\n- commodity: HENRY_HUB",
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "What does the latest pre-trade recommendation say, and what should I review next?"},
            ],
        },
        provider_responses=(
            {
                "id": "eval-pretrade-read-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_pretrade_read_1",
                        "call_id": "call_eval_pretrade_read_1",
                        "name": "get_pretrade_recommendation_run",
                        "arguments": '{"source_scenario_id":17}',
                    }
                ],
                "usage": {"input_tokens": 19, "output_tokens": 8},
            },
            {
                "id": "eval-pretrade-read-2",
                "output_text": (
                    "The latest pre-trade recommendation for scenario 17 is a risk-increasing draft with a swap hedge review and missing evidence notes. "
                    "Review the residual exposure and evidence gaps before capture. I have not booked a trade or executed a hedge."
                ),
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": (
                                    "The latest pre-trade recommendation for scenario 17 is a risk-increasing draft with a swap hedge review and missing evidence notes. "
                                    "Review the residual exposure and evidence gaps before capture. I have not booked a trade or executed a hedge."
                                ),
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 13, "output_tokens": 32},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="pretrade-reader",
            agent_name="Pre-Trade Reader",
            message_contains=(
                "scenario 17",
                "risk-increasing draft",
                "not booked a trade",
                "executed a hedge",
            ),
            warning_count=0,
            tool_names=("get_pretrade_recommendation_run",),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_tool_names=_provider_tool_names_with_managed_agent_introspection(
                "get_pretrade_recommendation_run"
            ),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="pretrade-structuring-agent-analyzes-unsaved-draft-without-claiming-persistence-or-execution",
        agent=AssistantEvalAgentFixture(
            agent_id="pretrade-draft-reader",
            name="Pre-Trade Draft Reader",
            capabilities=("READ", "EXPLAIN", "DRAFT"),
            allowed_workspaces=("assistant", "trades", "risk"),
            allowed_tools=("analyze_pretrade_scenario_draft",),
            system_prompt=(
                "Use deterministic draft analysis for in-progress pre-trade edits, and never claim to persist a recommendation run, book trades, or execute hedges."
            ),
        ),
        pretrade_recommendations=(
            AssistantEvalPreTradeRecommendationFixture(
                actor_id="assistant_user",
                source_scenario_id=17,
                current_net_position=18000,
                target_volume=8000,
            ),
        ),
        request_payload={
            "agent_id": "pretrade-draft-reader",
            "workspace": "assistant",
            "context": (
                "Selected pre-trade scenario draft:\n"
                "- source_scenario_id: 17\n"
                "- commodity: HENRY_HUB\n"
                "- unsaved target_volume: 12000\n"
                "- unsaved latest_mark: 2.2 (stale)"
            ),
            "use_live_tools": True,
            "messages": [
                {"role": "user", "content": "Analyze the unsaved draft changes and tell me what I should review next."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-pretrade-draft-read-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_pretrade_draft_read_1",
                        "call_id": "call_eval_pretrade_draft_read_1",
                        "name": "analyze_pretrade_scenario_draft",
                        "arguments": json.dumps(
                            {
                                "thesis": "Refresh the long setup against a weaker stale mark.",
                                "source_scenario_id": 17,
                                "draft": {
                                    "book": "GAS-US",
                                    "portfolio": "PROMPT",
                                    "counterparty": "ACME",
                                    "commodity_class": "NATURAL_GAS",
                                    "commodity": "HENRY_HUB",
                                    "trade_side": "BUY",
                                    "pricing_type": "FLOATING",
                                    "price_index_code": "HH",
                                    "target_price": 3.18,
                                    "target_volume": 12000,
                                    "trade_currency_code": "USD",
                                    "unit_of_measure": "MMBTU",
                                    "price_unit_code": "USD_MMBTU",
                                    "location_code": "HENRY_HUB",
                                },
                                "input_snapshots": [
                                    {
                                        "source_key": "desk-context",
                                        "source_type": "INTERNAL",
                                        "source_available": True,
                                        "freshness": "FRESH",
                                        "summary": "Desk context loaded.",
                                        "payload": {
                                            "related_active_trade_count": 2,
                                            "current_net_position": 18000,
                                            "current_counterparty_exposure": 125000,
                                        },
                                    },
                                    {
                                        "source_key": "counterparty-credit",
                                        "source_type": "INTERNAL",
                                        "source_available": True,
                                        "freshness": "FRESH",
                                        "summary": "Counterparty credit loaded.",
                                        "payload": {
                                            "has_credit_profile": True,
                                            "credit_limit_amount": 500000,
                                            "breach_action": "MONITOR",
                                            "credit_rating": "BBB",
                                        },
                                    },
                                    {
                                        "source_key": "latest-mark",
                                        "source_type": "EXTERNAL",
                                        "source_available": True,
                                        "freshness": "STALE",
                                        "summary": "Latest Henry Hub mark loaded.",
                                        "payload": {
                                            "latest_mark": 2.2,
                                            "price_index_code": "HH",
                                            "observation_date": "2026-04-20",
                                        },
                                    },
                                ],
                            }
                        ),
                    }
                ],
                "usage": {"input_tokens": 26, "output_tokens": 11},
            },
            {
                "id": "eval-pretrade-draft-read-2",
                "output_text": (
                    "The current scenario 17 draft now screens as escalate versus the last saved run because the latest mark is stale and the mark gap widened. "
                    "Review the residual exposure, swap hedge draft, and missing evidence before any review handoff. I have not created a recommendation run, booked a trade, or executed a hedge."
                ),
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": (
                                    "The current scenario 17 draft now screens as escalate versus the last saved run because the latest mark is stale and the mark gap widened. "
                                    "Review the residual exposure, swap hedge draft, and missing evidence before any review handoff. I have not created a recommendation run, booked a trade, or executed a hedge."
                                ),
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 14, "output_tokens": 41},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="pretrade-draft-reader",
            agent_name="Pre-Trade Draft Reader",
            message_contains=(
                "scenario 17",
                "escalate",
                "not created a recommendation run",
                "booked a trade",
                "executed a hedge",
            ),
            warning_count=0,
            tool_names=("analyze_pretrade_scenario_draft",),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_tool_names=_provider_tool_names_with_managed_agent_introspection(
                "analyze_pretrade_scenario_draft"
            ),
            provider_tools_key_present=True,
        ),
    ),
    AssistantEvalCase(
        name="pretrade-structuring-agent-drafts-review-ready-handoff-without-booking-claims",
        agent=AssistantEvalAgentFixture(
            agent_id="pretrade-review-drafter",
            name="Pre-Trade Review Drafter",
            capabilities=("READ", "EXPLAIN", "DRAFT"),
            allowed_workspaces=("assistant", "pretrade", "trades", "risk"),
            allowed_tools=("analyze_pretrade_scenario_draft",),
            system_prompt=(
                "Draft review-ready pre-trade packets with thesis, assumptions, source context, and capture handoff fields. "
                "Never claim to book trades, persist trade capture, or execute hedges."
            ),
        ),
        pretrade_recommendations=(
            AssistantEvalPreTradeRecommendationFixture(
                actor_id="assistant_user",
                source_scenario_id=29,
                current_net_position=18000,
                target_volume=25000,
            ),
        ),
        request_payload={
            "agent_id": "pretrade-review-drafter",
            "workspace": "assistant",
            "context": (
                "Selected pre-trade scenario draft:\n"
                "- source_scenario_id: 29\n"
                "- commodity: HENRY_HUB\n"
                "- counterparty: SHELL_TRADING\n"
                "- target_volume: 25000\n"
                "- pricing_type: FLOATING"
            ),
            "use_live_tools": True,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Draft the shared pre-trade review note for this scenario and list the trade capture handoff "
                        "fields I should verify."
                    ),
                },
            ],
        },
        provider_responses=(
            {
                "id": "eval-pretrade-review-draft-1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_eval_pretrade_review_draft_1",
                        "call_id": "call_eval_pretrade_review_draft_1",
                        "name": "analyze_pretrade_scenario_draft",
                        "arguments": json.dumps(
                            {
                                "thesis": "Add prompt length while basis stays favorable.",
                                "source_scenario_id": 29,
                                "draft": {
                                    "book": "GAS-US",
                                    "portfolio": "PROMPT",
                                    "counterparty": "SHELL_TRADING",
                                    "commodity_class": "NATURAL_GAS",
                                    "commodity": "HENRY_HUB",
                                    "trade_side": "BUY",
                                    "pricing_type": "FLOATING",
                                    "price_index_code": "HH",
                                    "target_price": 3.18,
                                    "target_volume": 25000,
                                    "trade_currency_code": "USD",
                                    "unit_of_measure": "MMBTU",
                                    "price_unit_code": "USD_MMBTU",
                                    "location_code": "HENRY_HUB",
                                },
                                "input_snapshots": [
                                    {
                                        "source_key": "desk-context",
                                        "source_type": "INTERNAL",
                                        "source_available": True,
                                        "freshness": "FRESH",
                                        "summary": "Desk context loaded with long exposure.",
                                        "payload": {
                                            "related_active_trade_count": 2,
                                            "current_net_position": 18000,
                                        },
                                    },
                                    {
                                        "source_key": "latest-mark",
                                        "source_type": "EXTERNAL",
                                        "source_available": True,
                                        "freshness": "STALE",
                                        "summary": "Latest Henry Hub mark loaded, but it is stale.",
                                        "payload": {
                                            "latest_mark": 2.81,
                                            "price_index_code": "HH",
                                            "observation_date": "2026-04-22",
                                        },
                                    },
                                ],
                            }
                        ),
                    }
                ],
                "usage": {"input_tokens": 29, "output_tokens": 12},
            },
            {
                "id": "eval-pretrade-review-draft-2",
                "output_text": (
                    "Shared pre-trade review draft: thesis is to add prompt length while basis stays favorable, "
                    "but the stale mark and residual exposure need desk review. Assumptions: long exposure is "
                    "already on the book and the latest mark is stale. Trade capture handoff fields to verify are "
                    "book, portfolio, counterparty, side, pricing basis, volume, location, and delivery window. "
                    "This packet is review-ready only and does not book the trade, persist capture, or execute a hedge."
                ),
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": (
                                    "Shared pre-trade review draft: thesis is to add prompt length while basis stays favorable, "
                                    "but the stale mark and residual exposure need desk review. Assumptions: long exposure is "
                                    "already on the book and the latest mark is stale. Trade capture handoff fields to verify are "
                                    "book, portfolio, counterparty, side, pricing basis, volume, location, and delivery window. "
                                    "This packet is review-ready only and does not book the trade, persist capture, or execute a hedge."
                                ),
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 17, "output_tokens": 52},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="pretrade-review-drafter",
            agent_name="Pre-Trade Review Drafter",
            message_contains=(
                "Shared pre-trade review draft",
                "Assumptions",
                "Trade capture handoff fields",
                "does not book the trade",
                "persist capture",
            ),
            warning_count=0,
            tool_names=("analyze_pretrade_scenario_draft",),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=2,
            provider_tool_names=_provider_tool_names_with_managed_agent_introspection(
                "analyze_pretrade_scenario_draft"
            ),
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
            provider_tool_names=_provider_tool_names_with_managed_agent_introspection(
                "get_trade_by_id"
            ),
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
            warning_count=0,
            tool_names=(),
            action_request_types=(),
            action_request_statuses=(),
            prompt_section_keys=("managed-agent", "workspace", "application-context"),
            prompt_section_absent_keys=("approval-gated-action",),
            provider_request_count=1,
            provider_tool_names=_provider_tool_names_with_managed_agent_introspection(),
            provider_tools_key_present=True,
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
        name="managed-explain-agent-can-recommend-a-workspace-handoff-without-staging-an-action",
        agent=AssistantEvalAgentFixture(
            agent_id="ops-router",
            name="Ops Router",
            capabilities=("READ", "EXPLAIN"),
            system_prompt="Recommend the next workspace with a typed navigation_intent block when no governed action is needed.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2002R"),),
        request_payload={
            "agent_id": "ops-router",
            "workspace": "assistant",
            "context": "Selected trade:\n- trade_id: T-2002R\n- commodity: WTI",
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Where should I handle the confirmation blocker?"},
            ],
        },
        provider_responses=(
            {
                "id": "eval-router-1",
                "output_text": (
                    "Operations is the right place to continue.\n"
                    "```navigation_intent\n"
                    + json.dumps(
                        {
                            "kind": "open_workspace",
                            "target_view": "operations",
                            "label": "Open Work Queue",
                            "rationale": "Review the confirmation blocker with the operations owner.",
                            "focus": {"type": "trade", "id": "T-2002R", "label": "T-2002R"},
                            "inspector_tab": "events",
                        }
                    )
                    + "\n```"
                ),
                "usage": {"input_tokens": 18, "output_tokens": 24},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="ops-router",
            agent_name="Ops Router",
            message_contains=(
                "Operations is the right place to continue",
                "navigation_intent",
                "Open Work Queue",
                '"target_view": "operations"',
            ),
            warning_count=0,
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
        name="managed-action-agent-uses-manual-fallback-for-unsupported-mutation-requests",
        agent=AssistantEvalAgentFixture(
            agent_id="settlement-router",
            name="Settlement Router",
            capabilities=("ACTION", "EXPLAIN"),
            allowed_action_types=("cancel_trade",),
            system_prompt="Only stage supported governed actions. For unsupported mutation requests, explain the boundary and route the operator manually.",
        ),
        trades=(AssistantEvalTradeFixture(trade_id="T-2002S"),),
        invoices=(
            AssistantEvalInvoiceFixture(
                trade_id="T-2002S",
                invoice_id=1202,
                invoice_number="INV-T-2002S",
                invoice_amount=1800.0,
            ),
        ),
        request_payload={
            "agent_id": "settlement-router",
            "workspace": "assistant",
            "context": (
                "Selected trade:\n"
                "- trade_id: T-2002S\n"
                "- invoice_number: INV-T-2002S\n"
                "- invoice_amount: 1800\n"
            ),
            "use_live_tools": False,
            "messages": [
                {"role": "user", "content": "Mark invoice INV-T-2002S paid right now."},
            ],
        },
        provider_responses=(
            {
                "id": "eval-unsupported-mutation-1",
                "output_text": (
                    "I cannot mark invoice INV-T-2002S paid from the prompt, and I did not stage an action request. "
                    "Open Settlement and complete the payment review manually."
                ),
                "usage": {"input_tokens": 16, "output_tokens": 23},
            },
        ),
        expectations=AssistantEvalExpectations(
            agent_id="settlement-router",
            agent_name="Settlement Router",
            message_contains=(
                "cannot mark invoice INV-T-2002S paid",
                "did not stage an action request",
                "Open Settlement",
                "manually",
            ),
            warning_count=0,
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
                    "execution_mode": "REVIEW_REQUIRED",
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

    def test_managed_read_agent_can_list_gmail_inbox_messages(self) -> None:
        gmail_browse_result = DocumentGmailInboxBrowseResultOut(
            query="from:backoffice@example.com",
            page_size=5,
            next_page_token=None,
            messages=[
                DocumentGmailInboxMessageSummaryOut(
                    message_id="gmail-msg-1",
                    thread_id="gmail-thread-1",
                    subject="May Settlement Package",
                    sender="backoffice@example.com",
                    received_at=datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc),
                    snippet="Attached is the May settlement package.",
                    unread=True,
                    attachment_count=2,
                    pdf_attachment_count=1,
                    imported_pdf_attachment_count=1,
                )
            ],
        )
        case = AssistantEvalCase(
            name="managed-read-agent-lists-gmail-inbox-messages",
            agent=AssistantEvalAgentFixture(
                agent_id="gmail-reader",
                name="Gmail Reader",
                capabilities=("READ", "EXPLAIN"),
                allowed_tools=("list_gmail_inbox_messages",),
                system_prompt="Use the configured Gmail inbox browse tool when the user asks about inbox messages.",
            ),
            request_payload={
                "agent_id": "gmail-reader",
                "workspace": "assistant",
                "context": "Inbox scope:\n- Document intake mailbox for settlement attachments",
                "use_live_tools": True,
                "messages": [
                    {"role": "user", "content": "Check whether anything new arrived from backoffice@example.com."},
                ],
            },
            provider_responses=(
                {
                    "id": "eval-gmail-read-1",
                    "output": [
                        {
                            "type": "function_call",
                            "id": "fc_eval_gmail_read_1",
                            "call_id": "call_eval_gmail_read_1",
                            "name": "list_gmail_inbox_messages",
                            "arguments": '{"query":"from:backoffice@example.com","limit":5}',
                        }
                    ],
                    "usage": {"input_tokens": 16, "output_tokens": 7},
                },
                {
                    "id": "eval-gmail-read-2",
                    "output_text": "Yes. The live Gmail inbox read found May Settlement Package from backoffice@example.com and it includes one PDF already imported into Document Intake.",
                    "output": [
                        {
                            "type": "message",
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": "Yes. The live Gmail inbox read found May Settlement Package from backoffice@example.com and it includes one PDF already imported into Document Intake.",
                                }
                            ],
                        }
                    ],
                    "usage": {"input_tokens": 10, "output_tokens": 24},
                },
            ),
            expectations=AssistantEvalExpectations(
                agent_id="gmail-reader",
                agent_name="Gmail Reader",
                message_contains=("May Settlement Package", "already imported into Document Intake"),
                warning_count=0,
                tool_names=("list_gmail_inbox_messages",),
                tool_call_summary_contains=("Loaded 1 Gmail inbox message(s).",),
                action_request_types=(),
                action_request_statuses=(),
                prompt_section_keys=("managed-agent", "workspace", "application-context"),
                prompt_section_absent_keys=("approval-gated-action",),
                provider_request_count=2,
                provider_tool_names=_provider_tool_names_with_managed_agent_introspection(
                    "list_gmail_inbox_messages"
                ),
                provider_tools_key_present=True,
            ),
        )

        with patch(
            "apps.api.app.domains.assistant.services.tools.load_gmail_inbox_messages",
            return_value=gmail_browse_result,
        ) as gmail_list_mock:
            result = self.run_eval_case(case)

        gmail_list_mock.assert_called_once()
        self.assertEqual(
            gmail_list_mock.call_args.kwargs,
            {
                "query_override": "from:backoffice@example.com",
                "page_size": 5,
                "page_token": None,
            },
        )
        self.assertEqual(
            result.response_payload["tool_calls"][0]["arguments"],
            {"query": "from:backoffice@example.com", "limit": 5},
        )
