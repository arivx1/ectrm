from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.shared.enums import CreditApprovalStatus
from apps.api.app.shared.enums import TradeWorkflowType

CREDIT_HOLD_ACTIVE_STATUSES = frozenset(
    {
        CreditApprovalStatus.PENDING_REVIEW.value,
        CreditApprovalStatus.REJECTED.value,
    }
)
DOWNSTREAM_CREDIT_GATED_WORKFLOW_TYPES = frozenset(
    {
        TradeWorkflowType.CONFIRMATION.value,
        TradeWorkflowType.NOMINATION.value,
        TradeWorkflowType.ALLOCATION.value,
        TradeWorkflowType.INVOICE.value,
        TradeWorkflowType.PAYMENT.value,
    }
)
CREDIT_HOLD_GATED_TRADE_FIELDS = (
    "confirmation_status",
    "nomination_status",
    "allocation_status",
    "invoice_status",
    "payment_status",
    "settlement_status",
)


@dataclass(frozen=True)
class TradeCreditHoldState:
    approval_status: str = CreditApprovalStatus.NOT_REQUIRED.value
    hold_active: bool = False
    hold_reason: str | None = None
    updated_at: datetime | None = None


def _default_hold_reason(status: str) -> str | None:
    if status == CreditApprovalStatus.PENDING_REVIEW.value:
        return "Credit approval is pending review."
    if status == CreditApprovalStatus.REJECTED.value:
        return "Credit approval was rejected."
    return None


def trade_credit_hold_state_from_item(item: TradeWorkflowItem | None) -> TradeCreditHoldState:
    if item is None:
        return TradeCreditHoldState()

    approval_status = str(item.status or CreditApprovalStatus.NOT_REQUIRED.value).strip().upper()
    if not approval_status:
        approval_status = CreditApprovalStatus.NOT_REQUIRED.value

    hold_active = approval_status in CREDIT_HOLD_ACTIVE_STATUSES
    hold_reason = (item.notes or "").strip() or _default_hold_reason(approval_status)
    if not hold_active:
        hold_reason = None

    return TradeCreditHoldState(
        approval_status=approval_status,
        hold_active=hold_active,
        hold_reason=hold_reason,
        updated_at=item.updated_at,
    )


def build_trade_credit_hold_lookup(
    db: Session,
    *,
    trade_ids: Iterable[str],
) -> dict[str, TradeCreditHoldState]:
    normalized_trade_ids = tuple(
        dict.fromkeys(str(trade_id).strip() for trade_id in trade_ids if str(trade_id).strip())
    )
    if not normalized_trade_ids:
        return {}

    states = {trade_id: TradeCreditHoldState() for trade_id in normalized_trade_ids}
    items = db.execute(
        select(TradeWorkflowItem).where(
            TradeWorkflowItem.trade_id.in_(normalized_trade_ids),
            TradeWorkflowItem.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value,
        )
    ).scalars().all()
    for item in items:
        states[item.trade_id] = trade_credit_hold_state_from_item(item)
    return states


def get_trade_credit_hold_state(db: Session, *, trade_id: str) -> TradeCreditHoldState:
    item = db.execute(
        select(TradeWorkflowItem).where(
            TradeWorkflowItem.trade_id == trade_id,
            TradeWorkflowItem.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value,
        )
    ).scalars().first()
    return trade_credit_hold_state_from_item(item)


def format_trade_credit_hold_message(
    trade_id: str,
    hold_state: TradeCreditHoldState,
    *,
    blocked_action: str | None = None,
) -> str:
    approval_label = hold_state.approval_status.replace("_", " ")
    hold_reason = hold_state.hold_reason or _default_hold_reason(hold_state.approval_status) or "Credit approval is required."
    message = f"Trade '{trade_id}' is on credit hold ({approval_label}). {hold_reason}"
    if blocked_action:
        return f"{message} {blocked_action}"
    return message
