from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.prompt_context import AssistantPromptSection
from apps.api.app.domains.assistant.services.registry import ManagedAssistantAgent
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.assistant import AssistantPromptRequest

TRADE_ID_PATTERN = re.compile(r"\b([A-Za-z][A-Za-z0-9]{0,5}-\d{2,})\b")


@dataclass(frozen=True)
class AssistantActionProposal:
    action_type: str
    summary: str
    description: str
    payload: dict[str, object]


@dataclass(frozen=True)
class AssistantActionRuntimeResult:
    sections: tuple[AssistantPromptSection, ...]
    proposals: tuple[AssistantActionProposal, ...]
    warnings: tuple[str, ...] = ()


def plan_action_requests(
    *,
    payload: AssistantPromptRequest,
    db: Session,
    agent_definition: ManagedAssistantAgent | None,
) -> AssistantActionRuntimeResult:
    if agent_definition is None:
        return AssistantActionRuntimeResult(sections=(), proposals=())
    if "ACTION" not in {capability.upper() for capability in agent_definition.capabilities}:
        return AssistantActionRuntimeResult(sections=(), proposals=())

    latest_message = _latest_user_message(payload)
    if latest_message is None:
        return AssistantActionRuntimeResult(sections=(), proposals=())

    latest_message_lower = latest_message.lower()
    if not _mentions_cancel_trade(latest_message_lower):
        return AssistantActionRuntimeResult(sections=(), proposals=())

    trade_id = _resolve_trade_id(latest_message, payload.context)
    if trade_id is None:
        return AssistantActionRuntimeResult(
            sections=(),
            proposals=(),
            warnings=("No trade was identified for an approval-gated cancellation request.",),
        )

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return AssistantActionRuntimeResult(
            sections=(),
            proposals=(),
            warnings=(f"Trade {trade_id} was not found, so no approval request was staged.",),
        )
    if str(trade.status or "ACTIVE").strip().upper() != "ACTIVE":
        return AssistantActionRuntimeResult(
            sections=(),
            proposals=(),
            warnings=(f"Trade {trade_id} is already closed as {trade.status}, so no approval request was staged.",),
        )

    proposal = AssistantActionProposal(
        action_type="cancel_trade",
        summary=f"Cancel trade {trade_id}",
        description=(
            f"Create a TradeCancelled event for {trade_id}. "
            "If approved, the application will mark the trade as cancelled and recalculate trade projections."
        ),
        payload={"trade_id": trade_id},
    )
    return AssistantActionRuntimeResult(
        sections=(
            AssistantPromptSection(
                key="approval-gated-action",
                title="Approval-gated action candidate",
                source="agent",
                content=(
                    "The application can stage an approval-gated action for explicit confirmation.\n"
                    f"action_type: {proposal.action_type}\n"
                    f"summary: {proposal.summary}\n"
                    f"description: {proposal.description}\n"
                    f"payload: {proposal.payload}\n"
                    "Do not claim the action has been executed unless the approval workflow reports EXECUTED."
                ),
            ),
        ),
        proposals=(proposal,),
    )


def _latest_user_message(payload: AssistantPromptRequest) -> str | None:
    for message in reversed(payload.messages):
        if message.role == "user":
            return message.content.strip() or None
    return None


def _mentions_cancel_trade(message_lower: str) -> bool:
    return any(
        phrase in message_lower
        for phrase in (
            "cancel trade",
            "cancel this trade",
            "cancel the trade",
            "cancel selected trade",
            "cancel the selected trade",
            "cancel current trade",
            "cancel it",
        )
    )


def _resolve_trade_id(message: str, context: str | None) -> str | None:
    direct_match = TRADE_ID_PATTERN.search(message)
    if direct_match is not None:
        return direct_match.group(1).upper()

    if not context:
        return None

    selected_match = re.search(r"^- trade_id:\s*(.+)$", context, re.IGNORECASE | re.MULTILINE)
    if selected_match is None:
        return None
    return selected_match.group(1).strip().upper() or None
