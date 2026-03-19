from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.prompt_context import AssistantPromptSection
from apps.api.app.domains.assistant.services.registry import ManagedAssistantAgent
from apps.api.app.domains.assistant.services.tools import (
    AssistantToolCallTrace,
    AssistantToolExecutionResult,
    AssistantToolService,
    AssistantToolServiceError,
    json_dumps,
)
from apps.api.app.schemas.assistant import AssistantPromptContextRequest

TRADE_ID_PATTERN = re.compile(r"\b([A-Za-z][A-Za-z0-9]{0,5}-\d{2,})\b")
STATUS_PATTERN = re.compile(r"\b(active|cancelled)\b", re.IGNORECASE)
REFERENCE_ENTITY_KEYWORDS = (
    ("price_indices", ("price index", "price indices", "index", "indices")),
    ("counterparties", ("counterparty", "counterparties")),
    ("portfolios", ("portfolio", "portfolios")),
    ("currencies", ("currency", "currencies")),
    ("units", ("unit", "units")),
    ("locations", ("location", "locations")),
    ("books", ("book", "books")),
    ("commodities", ("commodity", "commodities")),
)


@dataclass(frozen=True)
class PlannedAssistantToolCall:
    tool_name: str
    arguments: dict[str, object]


@dataclass(frozen=True)
class ExecutedAssistantToolCall:
    trace: AssistantToolCallTrace
    result: AssistantToolExecutionResult


@dataclass(frozen=True)
class AssistantToolRuntimeResult:
    sections: tuple[AssistantPromptSection, ...]
    traces: tuple[AssistantToolCallTrace, ...]
    warnings: tuple[str, ...] = ()


def execute_live_tools(
    *,
    payload: AssistantPromptContextRequest,
    db: Session,
    agent_definition: ManagedAssistantAgent | None = None,
) -> AssistantToolRuntimeResult:
    if not payload.use_live_tools:
        return AssistantToolRuntimeResult(sections=(), traces=())

    if agent_definition is not None and "READ" not in {
        capability.upper() for capability in agent_definition.capabilities
    }:
        return AssistantToolRuntimeResult(
            sections=(),
            traces=(),
            warnings=(
                f"{agent_definition.name} does not include READ capability, so live tools were disabled for this response.",
            ),
        )

    planned_calls = _build_tool_plan(payload)
    if not planned_calls:
        return AssistantToolRuntimeResult(sections=(), traces=())

    warnings: list[str] = []
    if agent_definition is not None and agent_definition.allowed_tools:
        allowed_tool_names = set(agent_definition.allowed_tools)
        skipped_tool_names: list[str] = []
        filtered_calls: list[PlannedAssistantToolCall] = []
        for planned_call in planned_calls:
            if planned_call.tool_name in allowed_tool_names:
                filtered_calls.append(planned_call)
            else:
                skipped_tool_names.append(planned_call.tool_name)

        if skipped_tool_names:
            skipped_label = ", ".join(dict.fromkeys(skipped_tool_names))
            warnings.append(
                f"{agent_definition.name} skipped disallowed live tools: {skipped_label}."
            )
        planned_calls = filtered_calls

    if not planned_calls:
        return AssistantToolRuntimeResult(sections=(), traces=(), warnings=tuple(warnings))

    tool_service = AssistantToolService(db)
    executed_calls: list[ExecutedAssistantToolCall] = []

    for planned_call in planned_calls:
        try:
            result, trace = tool_service.execute_tool(planned_call.tool_name, planned_call.arguments)
        except AssistantToolServiceError as exc:
            warnings.append(f"{planned_call.tool_name} failed: {exc.message}")
            executed_calls.append(
                ExecutedAssistantToolCall(
                    trace=AssistantToolCallTrace(
                        tool_name=planned_call.tool_name,
                        arguments=planned_call.arguments,
                        summary=f"Tool error: {exc.message}",
                        record_count=0,
                    ),
                    result=AssistantToolExecutionResult(
                        output={"error": exc.message},
                        summary=f"Tool error: {exc.message}",
                        record_count=0,
                        is_error=True,
                    ),
                )
            )
            continue

        executed_calls.append(ExecutedAssistantToolCall(trace=trace, result=result))

    if not executed_calls:
        return AssistantToolRuntimeResult(sections=(), traces=(), warnings=tuple(warnings))

    return AssistantToolRuntimeResult(
        sections=(
            AssistantPromptSection(
                key="live-tool-results",
                title="Live tool results",
                source="tool",
                content=_render_tool_prompt_section_content(executed_calls),
            ),
        ),
        traces=tuple(executed_call.trace for executed_call in executed_calls),
        warnings=tuple(warnings),
    )


def _build_tool_plan(payload: AssistantPromptContextRequest) -> list[PlannedAssistantToolCall]:
    latest_message = _latest_user_message(payload)
    if latest_message is None:
        selected_trade_id = _extract_selected_trade_field(payload.context, field_name="trade_id")
        if selected_trade_id is None:
            return []
        return [
            PlannedAssistantToolCall(
                tool_name="get_trade_by_id",
                arguments={"trade_id": selected_trade_id},
            )
        ]

    latest_message_lower = latest_message.lower()
    selected_trade_id = _resolve_trade_id(latest_message, payload.context)
    selected_trade_commodity = _extract_selected_trade_field(payload.context, field_name="commodity")
    reference_entity_type = _extract_reference_entity_type(latest_message_lower)
    planned_calls: list[PlannedAssistantToolCall] = []

    mentions_trade = _contains_any(
        latest_message_lower,
        "trade",
        "deal",
        "selected trade",
        "current trade",
        "this trade",
        "status",
        "price",
        "volume",
        "counterparty",
        "book",
        "commodity",
    )
    mentions_trade_events = _contains_any(
        latest_message_lower,
        "event",
        "events",
        "timeline",
        "history",
        "recent changes",
        "what changed",
        "changed",
        "amend",
        "amended",
        "cancel",
        "cancelled",
        "why",
    )
    mentions_positions = _contains_any(
        latest_message_lower,
        "position",
        "positions",
        "exposure",
        "exposures",
        "net volume",
        "risk",
    )
    mentions_reference = reference_entity_type is not None or _contains_any(
        latest_message_lower,
        "reference data",
        "approved values",
        "does this code exist",
        "is there a",
    )
    mentions_trade_list = _contains_any(
        latest_message_lower,
        "list trades",
        "show trades",
        "find trades",
        "search trades",
        "open trades",
        "active trades",
        "cancelled trades",
    )
    mentions_platform_summary = _contains_any(
        latest_message_lower,
        "platform state",
        "operations posture",
        "current state",
        "what's going on",
        "whats going on",
        "summarize the current",
        "summarize current",
    )

    if selected_trade_id and (mentions_trade or mentions_trade_events):
        planned_calls.append(
            PlannedAssistantToolCall(
                tool_name="get_trade_by_id",
                arguments={"trade_id": selected_trade_id},
            )
        )

    if selected_trade_id and mentions_trade_events:
        planned_calls.append(
            PlannedAssistantToolCall(
                tool_name="list_trade_events",
                arguments={"trade_id": selected_trade_id, "limit": 8},
            )
        )

    if mentions_positions:
        position_arguments: dict[str, object] = {"limit": 8}
        if selected_trade_commodity and (
            "selected trade" in latest_message_lower
            or "this trade" in latest_message_lower
            or "current trade" in latest_message_lower
        ):
            position_arguments["commodity"] = selected_trade_commodity
        planned_calls.append(
            PlannedAssistantToolCall(
                tool_name="list_positions",
                arguments=position_arguments,
            )
        )

    if mentions_reference and reference_entity_type is not None:
        reference_arguments: dict[str, object] = {
            "entity_type": reference_entity_type,
            "limit": 8,
        }
        reference_code = _extract_reference_code(latest_message)
        if reference_code is not None:
            reference_arguments["code"] = reference_code
        planned_calls.append(
            PlannedAssistantToolCall(
                tool_name="search_reference_data",
                arguments=reference_arguments,
            )
        )

    if mentions_trade_list and selected_trade_id is None:
        trade_arguments: dict[str, object] = {"limit": 8}
        status = _extract_status(latest_message)
        if status is not None:
            trade_arguments["status"] = status
        planned_calls.append(
            PlannedAssistantToolCall(
                tool_name="list_trades",
                arguments=trade_arguments,
            )
        )

    if not planned_calls and mentions_platform_summary:
        planned_calls.extend(
            [
                PlannedAssistantToolCall(tool_name="list_trades", arguments={"limit": 5}),
                PlannedAssistantToolCall(tool_name="list_positions", arguments={"limit": 5}),
                PlannedAssistantToolCall(tool_name="list_trade_events", arguments={"limit": 5}),
            ]
        )

    return _dedupe_tool_calls(planned_calls)


def _latest_user_message(payload: AssistantPromptContextRequest) -> str | None:
    messages = getattr(payload, "messages", None)
    if not messages:
        return None
    for message in reversed(messages):
        if message.role == "user":
            return message.content.strip() or None
    return None


def _resolve_trade_id(message: str, context: str | None) -> str | None:
    direct_trade_id = _extract_trade_id(message)
    if direct_trade_id is not None:
        return direct_trade_id

    if context and _contains_any(message.lower(), "selected trade", "this trade", "current trade"):
        return _extract_selected_trade_field(context, field_name="trade_id")

    return None


def _extract_trade_id(text: str | None) -> str | None:
    if not text:
        return None
    match = TRADE_ID_PATTERN.search(text)
    if match is None:
        return None
    return match.group(1).upper()


def _extract_selected_trade_field(context: str | None, *, field_name: str) -> str | None:
    if not context:
        return None

    pattern = re.compile(rf"^- {re.escape(field_name)}:\s*(.+)$", re.MULTILINE | re.IGNORECASE)
    match = pattern.search(context)
    if match is None:
        return None
    value = match.group(1).strip()
    if not value:
        return None
    if field_name == "trade_id":
        return value.upper()
    return value


def _extract_reference_entity_type(message_lower: str) -> str | None:
    for entity_type, keywords in REFERENCE_ENTITY_KEYWORDS:
        if any(keyword in message_lower for keyword in keywords):
            return entity_type
    return None


def _extract_reference_code(message: str) -> str | None:
    quoted_match = re.search(r"[\"']([A-Za-z0-9_.-]{2,})[\"']", message)
    if quoted_match is not None:
        return quoted_match.group(1).strip().upper()

    explicit_code_match = re.search(r"\bcode\s+([A-Za-z0-9_.-]{2,})\b", message, re.IGNORECASE)
    if explicit_code_match is not None:
        return explicit_code_match.group(1).strip().upper()

    return None


def _extract_status(message: str) -> str | None:
    match = STATUS_PATTERN.search(message)
    if match is None:
        return None
    return match.group(1).upper()


def _contains_any(message_lower: str, *needles: str) -> bool:
    return any(needle in message_lower for needle in needles)


def _dedupe_tool_calls(planned_calls: list[PlannedAssistantToolCall]) -> list[PlannedAssistantToolCall]:
    deduped_calls: list[PlannedAssistantToolCall] = []
    seen: set[tuple[str, str]] = set()

    for planned_call in planned_calls:
        signature = (planned_call.tool_name, json_dumps(planned_call.arguments))
        if signature in seen:
            continue
        seen.add(signature)
        deduped_calls.append(planned_call)

    return deduped_calls[:3]


def _render_tool_prompt_section_content(executed_calls: list[ExecutedAssistantToolCall]) -> str:
    lines = [
        "The following data was retrieved from the application database during this request. Prefer it over model memory.",
    ]

    for index, executed_call in enumerate(executed_calls, start=1):
        lines.extend(
            [
                f"Tool {index}: {executed_call.trace.tool_name}",
                f"Arguments: {json_dumps(executed_call.trace.arguments)}",
                f"Summary: {executed_call.trace.summary}",
                f"Output JSON: {json_dumps(executed_call.result.output)}",
            ]
        )

    return "\n".join(lines)
