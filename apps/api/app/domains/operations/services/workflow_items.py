from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_credit_approver_role
from apps.api.app.domains.reports.services.counterparty_credit import (
    CounterpartyCreditTradeInput,
)
from apps.api.app.domains.reports.services.counterparty_credit import (
    evaluate_counterparty_credit_policy,
)
from apps.api.app.domains.operations.services.trade_credit_hold import (
    DOWNSTREAM_CREDIT_GATED_WORKFLOW_TYPES,
)
from apps.api.app.domains.operations.services.trade_credit_exceptions import (
    build_active_trade_credit_exception_lookup,
)
from apps.api.app.domains.operations.services.trade_credit_exceptions import (
    create_trade_credit_exception,
)
from apps.api.app.domains.operations.services.trade_credit_exceptions import (
    invalidate_active_trade_credit_exceptions,
)
from apps.api.app.domains.operations.services.trade_credit_freshness import (
    assert_trade_credit_approval_freshness,
)
from apps.api.app.domains.operations.services.trade_credit_hold import (
    format_trade_credit_hold_message,
)
from apps.api.app.domains.operations.services.trade_credit_hold import get_trade_credit_hold_state
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_credit_approval_decision import TradeCreditApprovalDecision
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.operations import TradeCreditApprovalDecisionOut
from apps.api.app.schemas.operations import TradeCreditExceptionOut
from apps.api.app.schemas.operations import TradeWorkflowItemOut
from apps.api.app.shared.enums import AllocationStatus
from apps.api.app.shared.enums import ConfirmationStatus
from apps.api.app.shared.enums import CreditApprovalStatus
from apps.api.app.shared.enums import InvoiceStatus
from apps.api.app.shared.enums import NominationStatus
from apps.api.app.shared.enums import OptionSettlementStatus
from apps.api.app.shared.enums import OptionType
from apps.api.app.shared.enums import PaymentStatus
from apps.api.app.shared.enums import SettlementStatus
from apps.api.app.shared.enums import TradeInstrumentType
from apps.api.app.shared.enums import TradeSide
from apps.api.app.shared.enums import TradeStatus
from apps.api.app.shared.enums import TradeWorkflowType

SYSTEM_WORKFLOW_ACTOR = "system.workflow"

WORKFLOW_TYPE_TO_QUEUE: dict[str, str] = {
    TradeWorkflowType.CONFIRMATION.value: "operations",
    TradeWorkflowType.NOMINATION.value: "operations",
    TradeWorkflowType.ALLOCATION.value: "operations",
    TradeWorkflowType.CREDIT_APPROVAL.value: "operations",
    TradeWorkflowType.OPTION_SETTLEMENT.value: "operations",
    TradeWorkflowType.INVOICE.value: "settlement",
    TradeWorkflowType.PAYMENT.value: "settlement",
}

WORKFLOW_TYPE_TO_TRADE_FIELD: dict[str, str] = {
    TradeWorkflowType.CONFIRMATION.value: "confirmation_status",
    TradeWorkflowType.NOMINATION.value: "nomination_status",
    TradeWorkflowType.ALLOCATION.value: "allocation_status",
    TradeWorkflowType.INVOICE.value: "invoice_status",
    TradeWorkflowType.PAYMENT.value: "payment_status",
}

WORKFLOW_ALLOWED_STATUS_VALUES: dict[str, tuple[str, ...]] = {
    TradeWorkflowType.CONFIRMATION.value: tuple(status.value for status in ConfirmationStatus),
    TradeWorkflowType.NOMINATION.value: tuple(status.value for status in NominationStatus),
    TradeWorkflowType.ALLOCATION.value: tuple(status.value for status in AllocationStatus),
    TradeWorkflowType.CREDIT_APPROVAL.value: tuple(
        status.value for status in CreditApprovalStatus
    ),
    TradeWorkflowType.OPTION_SETTLEMENT.value: tuple(
        status.value for status in OptionSettlementStatus
    ),
    TradeWorkflowType.INVOICE.value: tuple(status.value for status in InvoiceStatus),
    TradeWorkflowType.PAYMENT.value: tuple(status.value for status in PaymentStatus),
}

WORKFLOW_CLOSED_STATUS_VALUES: dict[str, set[str]] = {
    TradeWorkflowType.CONFIRMATION.value: {ConfirmationStatus.CONFIRMED.value},
    TradeWorkflowType.NOMINATION.value: {
        NominationStatus.NOT_REQUIRED.value,
        NominationStatus.COMPLETED.value,
    },
    TradeWorkflowType.ALLOCATION.value: {
        AllocationStatus.NOT_REQUIRED.value,
        AllocationStatus.COMPLETED.value,
    },
    TradeWorkflowType.INVOICE.value: {
        InvoiceStatus.NOT_REQUIRED.value,
        InvoiceStatus.APPROVED.value,
    },
    TradeWorkflowType.PAYMENT.value: {
        PaymentStatus.NOT_REQUIRED.value,
        PaymentStatus.PAID.value,
    },
    TradeWorkflowType.CREDIT_APPROVAL.value: {
        CreditApprovalStatus.APPROVED.value,
        CreditApprovalStatus.NOT_REQUIRED.value,
        CreditApprovalStatus.REJECTED.value,
    },
    TradeWorkflowType.OPTION_SETTLEMENT.value: {
        OptionSettlementStatus.BOOKED.value,
        OptionSettlementStatus.NOT_REQUIRED.value,
    },
}

AUTOMATED_WORKFLOW_TYPES: tuple[str, ...] = (
    TradeWorkflowType.CONFIRMATION.value,
    TradeWorkflowType.NOMINATION.value,
    TradeWorkflowType.ALLOCATION.value,
    TradeWorkflowType.INVOICE.value,
    TradeWorkflowType.PAYMENT.value,
)

_UNSET = object()
CREDIT_APPROVAL_DECISION_STATUS_VALUES = {
    CreditApprovalStatus.APPROVED.value,
    CreditApprovalStatus.REJECTED.value,
}
OPTION_SETTLEMENT_SOURCE_TRADE_STATUSES = {
    TradeStatus.EXERCISED.value,
    TradeStatus.ASSIGNED.value,
}


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _at_midday_utc(value: date | None) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.combine(value, time(hour=12), tzinfo=timezone.utc)


def _normalize_optional_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _normalize_code(value: object | None) -> str:
    return str(value or "").strip().upper()


def _format_decimal(value: object | None) -> str | None:
    if value is None:
        return None
    text = format(Decimal(str(value)), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _credit_workflow_status_change_allowed(*, actor_id: str, actor_role: str | None) -> bool:
    normalized_actor_id = str(actor_id or "").strip().lower()
    return normalized_actor_id.startswith("system.") or is_credit_approver_role(actor_role)


def _credit_exception_release_reason_for_status(status: str) -> str:
    if status == CreditApprovalStatus.PENDING_REVIEW.value:
        return "Credit exception was reopened for fresh review."
    if status == CreditApprovalStatus.REJECTED.value:
        return "Credit exception was closed because credit rejected the trade."
    if status == CreditApprovalStatus.NOT_REQUIRED.value:
        return "Credit exception was cleared because the trade no longer requires an exception."
    return "Credit exception was closed."


def _trade_supports_workflow_type(trade: Trade, workflow_type: str) -> bool:
    normalized_type = normalize_workflow_type(workflow_type)
    trade_status = _normalize_code(trade.status)
    if normalized_type == TradeWorkflowType.OPTION_SETTLEMENT.value:
        return (
            _normalize_code(trade.instrument_type) == TradeInstrumentType.OPTION.value
            and trade_status in OPTION_SETTLEMENT_SOURCE_TRADE_STATUSES
        )
    return trade_status == TradeStatus.ACTIVE.value


def _resulting_underlying_side_for_option_settlement(trade: Trade) -> str | None:
    trade_status = _normalize_code(trade.status)
    option_type = _normalize_code(trade.option_type)
    if trade_status == TradeStatus.EXERCISED.value:
        if option_type == OptionType.CALL.value:
            return TradeSide.BUY.value
        if option_type == OptionType.PUT.value:
            return TradeSide.SELL.value
    if trade_status == TradeStatus.ASSIGNED.value:
        if option_type == OptionType.CALL.value:
            return TradeSide.SELL.value
        if option_type == OptionType.PUT.value:
            return TradeSide.BUY.value
    return None


def _default_option_settlement_notes(trade: Trade) -> str:
    lifecycle_label = _normalize_code(trade.status).replace("_", " ").title()
    resulting_side = _resulting_underlying_side_for_option_settlement(trade) or "BOOK"
    quantity_text = _format_decimal(trade.volume) or "unknown"
    quantity_unit = _normalize_optional_text(trade.unit_of_measure)
    quantity_label = f"{quantity_text} {quantity_unit}".strip()
    strike_text = _format_decimal(trade.option_strike_price)
    strike_suffix_parts = [value for value in [trade.trade_currency_code, trade.price_unit_code] if value]
    strike_suffix = f" {'/'.join(strike_suffix_parts)}" if strike_suffix_parts else ""

    note = (
        f"{lifecycle_label} option requires booking resulting {resulting_side} "
        f"{trade.commodity} {quantity_label}."
    )
    if strike_text is not None:
        note = f"{note} Strike {strike_text}{strike_suffix}."
    return f"{note} Mark BOOKED once the downstream underlying handoff is captured."


def _build_credit_approval_breach_snapshot(
    db: Session,
    *,
    trade: Trade,
    captured_at: datetime,
) -> dict[str, object]:
    policy_result = evaluate_counterparty_credit_policy(
        db,
        trade_input=CounterpartyCreditTradeInput(
            trade_id=trade.trade_id,
            counterparty_code=trade.counterparty,
            trade_currency_code=trade.trade_currency_code,
            price=trade.price,
            volume=trade.volume,
            status=trade.status,
        ),
    )

    snapshot: dict[str, object] = {
        "captured_at": captured_at.isoformat(),
        "trade_id": trade.trade_id,
        "trade_status": trade.status,
        "counterparty_code": trade.counterparty,
        "trade_currency_code": trade.trade_currency_code,
        "price": float(trade.price) if trade.price is not None else None,
        "volume": float(trade.volume) if trade.volume is not None else None,
    }
    if policy_result is None:
        snapshot.update(
            {
                "breach_action": None,
                "limit_currency_code": None,
                "limit_amount": None,
                "current_exposure_amount": None,
                "projected_trade_exposure_amount": None,
                "projected_exposure_amount": None,
                "projected_utilization_percent": None,
                "limit_breached": False,
                "comparable": False,
                "comparison_reason": "no_credit_profile",
            }
        )
        return snapshot

    snapshot.update(
        {
            "breach_action": policy_result.get("breach_action"),
            "limit_currency_code": policy_result.get("limit_currency_code"),
            "limit_amount": policy_result.get("limit_amount"),
            "current_exposure_amount": policy_result.get("current_exposure_amount"),
            "projected_trade_exposure_amount": policy_result.get("projected_trade_exposure_amount"),
            "projected_exposure_amount": policy_result.get("projected_exposure_amount"),
            "projected_utilization_percent": policy_result.get("projected_utilization_percent"),
            "limit_breached": bool(policy_result.get("limit_breached")),
            "comparable": bool(policy_result.get("comparable")),
            "comparison_reason": policy_result.get("comparison_reason"),
        }
    )
    return snapshot


def _decision_to_out(record: TradeCreditApprovalDecision) -> TradeCreditApprovalDecisionOut:
    return TradeCreditApprovalDecisionOut(
        decision_id=record.id,
        trade_id=record.trade_id,
        workflow_item_id=record.workflow_item_id,
        decision=record.decision,
        decision_comment=record.decision_comment,
        breach_snapshot=dict(record.breach_snapshot or {}),
        decided_at=record.decided_at,
        decided_by=record.decided_by,
    )


def _credit_decision_history_by_workflow_item_id(
    db: Session,
    *,
    workflow_item_ids: list[int],
) -> dict[int, list[TradeCreditApprovalDecisionOut]]:
    if not workflow_item_ids:
        return {}

    rows = db.execute(
        select(TradeCreditApprovalDecision)
        .where(TradeCreditApprovalDecision.workflow_item_id.in_(workflow_item_ids))
        .order_by(
            TradeCreditApprovalDecision.decided_at.desc(),
            TradeCreditApprovalDecision.id.desc(),
        )
    ).scalars().all()

    decisions_by_item_id: dict[int, list[TradeCreditApprovalDecisionOut]] = defaultdict(list)
    for row in rows:
        decisions_by_item_id[row.workflow_item_id].append(_decision_to_out(row))
    return decisions_by_item_id


def _append_credit_approval_decision(
    db: Session,
    *,
    trade: Trade,
    workflow_item: TradeWorkflowItem,
    decision: str,
    decision_comment: str,
    actor_id: str,
    decided_at: datetime,
) -> TradeCreditApprovalDecision:
    record = TradeCreditApprovalDecision(
            trade_id=trade.trade_id,
            workflow_item_id=workflow_item.id,
            decision=decision,
            decision_comment=decision_comment,
            breach_snapshot=_build_credit_approval_breach_snapshot(
                db,
                trade=trade,
                captured_at=decided_at,
            ),
            decided_at=decided_at,
            decided_by=actor_id,
        )
    db.add(record)
    db.flush()
    return record


def workflow_queue_for_type(workflow_type: str) -> str:
    normalized = normalize_workflow_type(workflow_type)
    return WORKFLOW_TYPE_TO_QUEUE[normalized]


def normalize_workflow_type(value: object | None) -> str:
    normalized = str(value or "").strip().upper()
    valid_values = tuple(workflow_type.value for workflow_type in TradeWorkflowType)
    if normalized not in valid_values:
        raise ValueError(
            f"Workflow type '{normalized}' is invalid. Expected one of: {', '.join(valid_values)}."
        )
    return normalized


def workflow_allowed_statuses(workflow_type: str) -> tuple[str, ...]:
    normalized_type = normalize_workflow_type(workflow_type)
    return WORKFLOW_ALLOWED_STATUS_VALUES[normalized_type]


def normalize_workflow_status(workflow_type: str, value: object | None) -> str:
    normalized_type = normalize_workflow_type(workflow_type)
    normalized_status = str(value or "").strip().upper()
    if not normalized_status:
        raise ValueError("Workflow status is required.")

    valid_values = workflow_allowed_statuses(normalized_type)
    if normalized_status not in valid_values:
        raise ValueError(
            f"Workflow status '{normalized_status}' is invalid for {normalized_type}. "
            f"Expected one of: {', '.join(valid_values)}."
        )
    return normalized_status


def normalize_workflow_due_at(value: datetime | None) -> Optional[datetime]:
    return _coerce_utc(value)


def workflow_status_from_trade(trade: Trade, workflow_type: str) -> str:
    normalized_type = normalize_workflow_type(workflow_type)
    return str(getattr(trade, WORKFLOW_TYPE_TO_TRADE_FIELD[normalized_type]))


def is_workflow_item_closed(workflow_type: str, status: str) -> bool:
    normalized_type = normalize_workflow_type(workflow_type)
    return status in WORKFLOW_CLOSED_STATUS_VALUES[normalized_type]


def _default_due_at_for_trade(trade: Trade, workflow_type: str) -> Optional[datetime]:
    normalized_type = normalize_workflow_type(workflow_type)
    trade_anchor = trade.trade_date or (_coerce_utc(trade.execution_timestamp) or _coerce_utc(trade.created_at)).date()

    if normalized_type == TradeWorkflowType.CONFIRMATION.value:
        return _at_midday_utc(trade_anchor + timedelta(days=1))
    if normalized_type == TradeWorkflowType.NOMINATION.value:
        return _at_midday_utc(trade.delivery_start or trade.effective_start_date)
    if normalized_type == TradeWorkflowType.ALLOCATION.value:
        return _at_midday_utc(trade.delivery_end or trade.delivery_start or trade.effective_end_date)
    if normalized_type == TradeWorkflowType.INVOICE.value:
        return _at_midday_utc(trade.delivery_end or trade.effective_end_date or trade_anchor)
    if normalized_type == TradeWorkflowType.PAYMENT.value:
        payment_anchor = trade.delivery_end or trade.effective_end_date or trade_anchor
        return _at_midday_utc(payment_anchor + timedelta(days=5))
    if normalized_type == TradeWorkflowType.CREDIT_APPROVAL.value:
        return _at_midday_utc(trade_anchor + timedelta(days=1))
    if normalized_type == TradeWorkflowType.OPTION_SETTLEMENT.value:
        settlement_anchor = (
            _coerce_utc(trade.updated_at)
            or _coerce_utc(trade.execution_timestamp)
            or _coerce_utc(trade.created_at)
        )
        anchor_date = settlement_anchor.date() if settlement_anchor is not None else trade_anchor
        return _at_midday_utc(anchor_date + timedelta(days=1))
    return None


def _derive_settlement_status(invoice_status: str, payment_status: str) -> str:
    if invoice_status == InvoiceStatus.DISPUTED.value:
        return SettlementStatus.DISPUTED.value
    if payment_status in {PaymentStatus.PAID.value, PaymentStatus.NOT_REQUIRED.value}:
        if invoice_status in {
            InvoiceStatus.APPROVED.value,
            InvoiceStatus.ISSUED.value,
            InvoiceStatus.NOT_REQUIRED.value,
        }:
            return SettlementStatus.SETTLED.value
        return SettlementStatus.PARTIALLY_SETTLED.value
    if invoice_status in {InvoiceStatus.ISSUED.value, InvoiceStatus.APPROVED.value} or payment_status in {
        PaymentStatus.DUE.value,
        PaymentStatus.OVERDUE.value,
    }:
        return SettlementStatus.INVOICED.value
    return SettlementStatus.PENDING.value


def synchronize_trade_workflow_items(
    db: Session,
    trade: Trade,
    *,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: Optional[datetime] = None,
) -> None:
    if str(trade.status or "ACTIVE").strip().upper() != "ACTIVE":
        return

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    existing_items = db.execute(
        select(TradeWorkflowItem).where(TradeWorkflowItem.trade_id == trade.trade_id)
    ).scalars().all()
    items_by_type = {item.workflow_type: item for item in existing_items}

    for workflow_type in AUTOMATED_WORKFLOW_TYPES:
        expected_status = workflow_status_from_trade(trade, workflow_type)
        default_due_at = _default_due_at_for_trade(trade, workflow_type)
        item = items_by_type.get(workflow_type)
        if item is None:
            item = TradeWorkflowItem(
                trade_id=trade.trade_id,
                workflow_type=workflow_type,
                status=expected_status,
                owner=None,
                due_at=default_due_at,
                notes=None,
                created_at=reference_time,
                created_by=actor_id,
                updated_at=reference_time,
                updated_by=actor_id,
                version=1,
            )
            db.add(item)
            items_by_type[workflow_type] = item
            continue

        changed = False
        if item.status != expected_status:
            item.status = expected_status
            changed = True
        if item.due_at is None and default_due_at is not None:
            item.due_at = default_due_at
            changed = True
        if changed:
            item.updated_at = reference_time
            item.updated_by = actor_id
            item.version += 1

    rollup_trade_workflow_statuses(trade, list(items_by_type.values()), now=reference_time)


def synchronize_active_trade_workflow_items(
    db: Session,
    *,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: Optional[datetime] = None,
) -> None:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trades = db.execute(
        select(Trade)
        .where(Trade.status == "ACTIVE")
        .order_by(Trade.updated_at.desc(), Trade.trade_id.desc())
    ).scalars().all()

    for trade in trades:
        synchronize_trade_workflow_items(db, trade, actor_id=actor_id, now=reference_time)


def synchronize_option_settlement_workflow_items(
    db: Session,
    *,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: Optional[datetime] = None,
) -> None:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trades = db.execute(
        select(Trade)
        .where(
            Trade.instrument_type == TradeInstrumentType.OPTION.value,
            Trade.status.in_(tuple(OPTION_SETTLEMENT_SOURCE_TRADE_STATUSES)),
        )
        .order_by(Trade.updated_at.desc(), Trade.trade_id.desc())
    ).scalars().all()

    for trade in trades:
        item = db.execute(
            select(TradeWorkflowItem).where(
                TradeWorkflowItem.trade_id == trade.trade_id,
                TradeWorkflowItem.workflow_type == TradeWorkflowType.OPTION_SETTLEMENT.value,
            )
        ).scalars().first()
        if item is not None:
            continue
        item_timestamp = _coerce_utc(trade.updated_at) or reference_time
        db.add(
            TradeWorkflowItem(
                trade_id=trade.trade_id,
                workflow_type=TradeWorkflowType.OPTION_SETTLEMENT.value,
                status=OptionSettlementStatus.PENDING.value,
                owner=None,
                due_at=_default_due_at_for_trade(trade, TradeWorkflowType.OPTION_SETTLEMENT.value),
                notes=_default_option_settlement_notes(trade),
                created_at=item_timestamp,
                created_by=actor_id,
                updated_at=item_timestamp,
                updated_by=actor_id,
                version=1,
            )
        )


def rollup_trade_workflow_statuses(
    trade: Trade,
    workflow_items: list[TradeWorkflowItem],
    *,
    now: Optional[datetime] = None,
) -> bool:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    items_by_type = {item.workflow_type: item for item in workflow_items}

    confirmation_item = items_by_type.get(TradeWorkflowType.CONFIRMATION.value)
    nomination_item = items_by_type.get(TradeWorkflowType.NOMINATION.value)
    allocation_item = items_by_type.get(TradeWorkflowType.ALLOCATION.value)
    invoice_item = items_by_type.get(TradeWorkflowType.INVOICE.value)
    payment_item = items_by_type.get(TradeWorkflowType.PAYMENT.value)

    next_confirmation_status = confirmation_item.status if confirmation_item is not None else trade.confirmation_status
    next_nomination_status = nomination_item.status if nomination_item is not None else trade.nomination_status
    next_allocation_status = allocation_item.status if allocation_item is not None else trade.allocation_status
    next_invoice_status = invoice_item.status if invoice_item is not None else trade.invoice_status
    next_payment_status = payment_item.status if payment_item is not None else trade.payment_status
    next_settlement_status = _derive_settlement_status(next_invoice_status, next_payment_status)

    changed = False
    if trade.confirmation_status != next_confirmation_status:
        trade.confirmation_status = next_confirmation_status
        changed = True
    if trade.nomination_status != next_nomination_status:
        trade.nomination_status = next_nomination_status
        changed = True
    if trade.allocation_status != next_allocation_status:
        trade.allocation_status = next_allocation_status
        changed = True
    if trade.invoice_status != next_invoice_status:
        trade.invoice_status = next_invoice_status
        changed = True
    if trade.payment_status != next_payment_status:
        trade.payment_status = next_payment_status
        changed = True
    if trade.settlement_status != next_settlement_status:
        trade.settlement_status = next_settlement_status
        changed = True
    if changed:
        trade.updated_at = reference_time
    return changed


def set_trade_workflow_item_projection(
    db: Session,
    *,
    trade: Trade,
    workflow_type: str,
    status: object | None,
    actor_id: str,
    now: Optional[datetime] = None,
    due_at: datetime | None | object = _UNSET,
    notes: object | None | object = _UNSET,
) -> TradeWorkflowItem:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    normalized_type = normalize_workflow_type(workflow_type)
    normalized_status = normalize_workflow_status(normalized_type, status)
    item = db.execute(
        select(TradeWorkflowItem).where(
            TradeWorkflowItem.trade_id == trade.trade_id,
            TradeWorkflowItem.workflow_type == normalized_type,
        )
    ).scalars().first()

    if item is None:
        resolved_due_at = (
            normalize_workflow_due_at(due_at) if due_at is not _UNSET else _default_due_at_for_trade(trade, normalized_type)
        )
        item = TradeWorkflowItem(
            trade_id=trade.trade_id,
            workflow_type=normalized_type,
            status=normalized_status,
            owner=None,
            due_at=resolved_due_at,
            notes=_normalize_optional_text(notes) if notes is not _UNSET else None,
            created_at=reference_time,
            created_by=actor_id,
            updated_at=reference_time,
            updated_by=actor_id,
            version=1,
        )
        db.add(item)
        db.flush()
    else:
        changed = False
        if item.status != normalized_status:
            item.status = normalized_status
            changed = True
        if due_at is _UNSET:
            default_due_at = _default_due_at_for_trade(trade, normalized_type)
            if item.due_at is None and default_due_at is not None:
                item.due_at = default_due_at
                changed = True
        else:
            normalized_due_at = normalize_workflow_due_at(due_at)
            if item.due_at != normalized_due_at:
                item.due_at = normalized_due_at
                changed = True
        if notes is not _UNSET:
            normalized_notes = _normalize_optional_text(notes)
            if item.notes != normalized_notes:
                item.notes = normalized_notes
                changed = True
        if changed:
            item.updated_at = reference_time
            item.updated_by = actor_id
            item.version += 1

    workflow_items = db.execute(
        select(TradeWorkflowItem).where(TradeWorkflowItem.trade_id == trade.trade_id)
    ).scalars().all()
    rollup_trade_workflow_statuses(trade, workflow_items, now=reference_time)
    db.flush()
    return item


def _workflow_attention_rank(item: TradeWorkflowItemOut) -> tuple[int, datetime, datetime, str, str]:
    if item.status in {"DISPUTED", "OVERDUE", CreditApprovalStatus.REJECTED.value}:
        priority = 0
    elif item.is_overdue:
        priority = 1
    elif item.due_at is not None:
        priority = 2
    else:
        priority = 3

    due_at = _coerce_utc(item.due_at) or datetime.max.replace(tzinfo=timezone.utc)
    updated_at = _coerce_utc(item.updated_at) or datetime.min.replace(tzinfo=timezone.utc)
    return (priority, due_at, updated_at, item.trade_id, item.workflow_type)


def _to_out(
    item: TradeWorkflowItem,
    trade: Trade,
    *,
    now: Optional[datetime] = None,
    active_credit_exception: TradeCreditExceptionOut | None = None,
    credit_decision_history: list[TradeCreditApprovalDecisionOut] | None = None,
) -> TradeWorkflowItemOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    created_at = _coerce_utc(item.created_at) or reference_time
    updated_at = _coerce_utc(item.updated_at) or reference_time
    due_at = _coerce_utc(item.due_at)
    is_closed = is_workflow_item_closed(item.workflow_type, item.status)
    is_overdue = bool(due_at is not None and due_at < reference_time and not is_closed)

    return TradeWorkflowItemOut(
        item_id=item.id,
        trade_id=item.trade_id,
        queue=workflow_queue_for_type(item.workflow_type),
        workflow_type=item.workflow_type,
        status=item.status,
        owner=item.owner,
        due_at=due_at,
        notes=item.notes,
        created_at=created_at,
        created_by=item.created_by,
        updated_at=updated_at,
        updated_by=item.updated_by,
        version=item.version,
        is_closed=is_closed,
        is_overdue=is_overdue,
        age_days=max(0, int((reference_time - created_at).total_seconds() // 86_400)),
        trade_nature=trade.trade_nature,
        book=trade.book,
        portfolio=trade.portfolio,
        counterparty=trade.counterparty,
        commodity_class=trade.commodity_class,
        commodity=trade.commodity,
        trader_user=trade.trader_user,
        trade_date=trade.trade_date,
        delivery_start=trade.delivery_start,
        delivery_end=trade.delivery_end,
        active_credit_exception=active_credit_exception,
        credit_decision_history=credit_decision_history or [],
    )


def list_trade_workflow_items(
    db: Session,
    *,
    queue: str | None = None,
    include_closed: bool = False,
    trade_id: str | None = None,
    now: Optional[datetime] = None,
) -> list[TradeWorkflowItemOut]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    normalized_queue = str(queue or "").strip().lower() or None
    if normalized_queue not in {None, "operations", "settlement"}:
        raise ValueError("Queue must be one of: operations, settlement.")

    synchronize_active_trade_workflow_items(db, now=reference_time)
    synchronize_option_settlement_workflow_items(db, now=reference_time)
    db.flush()

    stmt = (
        select(TradeWorkflowItem, Trade)
        .join(Trade, Trade.trade_id == TradeWorkflowItem.trade_id)
        .where(
            or_(
                Trade.status == TradeStatus.ACTIVE.value,
                and_(
                    TradeWorkflowItem.workflow_type == TradeWorkflowType.OPTION_SETTLEMENT.value,
                    Trade.status.in_(tuple(OPTION_SETTLEMENT_SOURCE_TRADE_STATUSES)),
                ),
            )
        )
    )
    if trade_id:
        stmt = stmt.where(TradeWorkflowItem.trade_id == trade_id)

    rows = db.execute(stmt).all()
    credit_decision_history_by_item_id = _credit_decision_history_by_workflow_item_id(
        db,
        workflow_item_ids=[
            item.id
            for item, _trade in rows
            if item.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value
        ],
    )
    active_credit_exception_by_trade_id = build_active_trade_credit_exception_lookup(
        db,
        trades=[trade for _item, trade in rows],
        now=reference_time,
    )
    items = [
        _to_out(
            item,
            trade,
            now=reference_time,
            active_credit_exception=active_credit_exception_by_trade_id.get(trade.trade_id),
            credit_decision_history=credit_decision_history_by_item_id.get(item.id, []),
        )
        for item, trade in rows
    ]
    if normalized_queue is not None:
        items = [item for item in items if item.queue == normalized_queue]
    if not include_closed:
        items = [item for item in items if not item.is_closed]
    return sorted(items, key=_workflow_attention_rank)


def create_trade_workflow_item(
    db: Session,
    *,
    trade_id: str,
    workflow_type: str,
    actor_id: str,
    actor_role: str | None = None,
    enforce_credit_authorization: bool = True,
    status: object | None = None,
    owner: object | None = None,
    due_at: datetime | None = None,
    notes: object | None = None,
    now: Optional[datetime] = None,
) -> TradeWorkflowItemOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    normalized_type = normalize_workflow_type(workflow_type)
    db.flush()

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None or not _trade_supports_workflow_type(trade, normalized_type):
        if normalized_type == TradeWorkflowType.OPTION_SETTLEMENT.value:
            raise LookupError(
                f"Trade '{trade_id}' does not have an exercised or assigned option settlement to manage."
            )
        raise LookupError(f"Trade '{trade_id}' was not found.")

    if _normalize_code(trade.status) == TradeStatus.ACTIVE.value:
        synchronize_trade_workflow_items(db, trade, actor_id=actor_id, now=reference_time)
    db.flush()

    item = db.execute(
        select(TradeWorkflowItem).where(
            TradeWorkflowItem.trade_id == trade_id,
            TradeWorkflowItem.workflow_type == normalized_type,
        )
    ).scalars().first()
    if item is None:
        if status is not None:
            normalized_status = normalize_workflow_status(normalized_type, status)
        elif normalized_type in WORKFLOW_TYPE_TO_TRADE_FIELD:
            normalized_status = workflow_status_from_trade(trade, normalized_type)
        elif normalized_type == TradeWorkflowType.CREDIT_APPROVAL.value:
            normalized_status = CreditApprovalStatus.PENDING_REVIEW.value
        elif normalized_type == TradeWorkflowType.OPTION_SETTLEMENT.value:
            normalized_status = OptionSettlementStatus.PENDING.value
        else:
            raise LookupError(
                f"Workflow item for trade '{trade_id}' and type '{normalized_type}' was not found."
            )
        normalized_notes = _normalize_optional_text(notes)
        if normalized_type == TradeWorkflowType.OPTION_SETTLEMENT.value and not normalized_notes:
            normalized_notes = _default_option_settlement_notes(trade)
        if (
            enforce_credit_authorization
            and normalized_type == TradeWorkflowType.CREDIT_APPROVAL.value
            and normalized_status != CreditApprovalStatus.PENDING_REVIEW.value
        ):
            if not _credit_workflow_status_change_allowed(actor_id=actor_id, actor_role=actor_role):
                raise PermissionError(
                    "Only CREDIT_APPROVER, OPS_ADMIN, or ADMIN sessions can change credit approval workflow status."
                )
        if (
            normalized_type == TradeWorkflowType.CREDIT_APPROVAL.value
            and normalized_status in CREDIT_APPROVAL_DECISION_STATUS_VALUES
        ):
            if not normalized_notes:
                raise ValueError("Recording a credit approval decision requires an audit comment in notes.")
            if normalized_status == CreditApprovalStatus.APPROVED.value:
                assert_trade_credit_approval_freshness(
                    db,
                    trade=trade,
                    as_of=reference_time,
                )

        item = TradeWorkflowItem(
            trade_id=trade_id,
            workflow_type=normalized_type,
            status=normalized_status,
            owner=_normalize_optional_text(owner),
            due_at=normalize_workflow_due_at(due_at)
            if due_at is not None
            else _default_due_at_for_trade(trade, normalized_type),
            notes=normalized_notes,
            created_at=reference_time,
            created_by=actor_id,
            updated_at=reference_time,
            updated_by=actor_id,
            version=1,
        )
        db.add(item)
        db.flush()
        if normalized_type == TradeWorkflowType.CREDIT_APPROVAL.value and normalized_status in CREDIT_APPROVAL_DECISION_STATUS_VALUES:
            decision_record = _append_credit_approval_decision(
                db,
                trade=trade,
                workflow_item=item,
                decision=normalized_status,
                decision_comment=item.notes or "",
                actor_id=actor_id,
                decided_at=reference_time,
            )
            if normalized_status == CreditApprovalStatus.APPROVED.value:
                create_trade_credit_exception(
                    db,
                    trade_id=trade.trade_id,
                    workflow_item_id=item.id,
                    approval_decision_id=decision_record.id,
                    approval_snapshot=dict(decision_record.breach_snapshot or {}),
                    approved_at=reference_time,
                    approved_by=actor_id,
                    approval_comment=item.notes or "",
                )
        workflow_items = db.execute(
            select(TradeWorkflowItem).where(TradeWorkflowItem.trade_id == trade_id)
        ).scalars().all()
        rollup_trade_workflow_statuses(trade, workflow_items, now=reference_time)
        db.flush()
        return _to_out(
            item,
            trade,
            now=reference_time,
            active_credit_exception=build_active_trade_credit_exception_lookup(
                db,
                trades=[trade],
                now=reference_time,
            ).get(trade.trade_id),
            credit_decision_history=_credit_decision_history_by_workflow_item_id(
                db,
                workflow_item_ids=[item.id],
            ).get(item.id, []),
        )

    changed = False
    previous_status = item.status
    requested_status: str | None = None
    if status is not None:
        normalized_status = normalize_workflow_status(normalized_type, status)
        if (
            enforce_credit_authorization
            and normalized_type == TradeWorkflowType.CREDIT_APPROVAL.value
            and normalized_status != item.status
        ):
            normalized_notes = _normalize_optional_text(notes)
            if not _credit_workflow_status_change_allowed(actor_id=actor_id, actor_role=actor_role):
                raise PermissionError(
                    "Only CREDIT_APPROVER, OPS_ADMIN, or ADMIN sessions can change credit approval workflow status."
                )
            if (
                normalized_status in CREDIT_APPROVAL_DECISION_STATUS_VALUES
                and not normalized_notes
                and not (item.notes or "").strip()
            ):
                raise ValueError("Recording a credit approval decision requires an audit comment in notes.")
        if (
            normalized_type == TradeWorkflowType.CREDIT_APPROVAL.value
            and normalized_status == CreditApprovalStatus.APPROVED.value
            and normalized_status != item.status
        ):
            assert_trade_credit_approval_freshness(
                db,
                trade=trade,
                as_of=reference_time,
            )
        requested_status = normalized_status
        if item.status != normalized_status:
            item.status = normalized_status
            changed = True
    if owner is not None:
        normalized_owner = _normalize_optional_text(owner)
        if item.owner != normalized_owner:
            item.owner = normalized_owner
            changed = True
    if due_at is not None:
        normalized_due_at = normalize_workflow_due_at(due_at)
        if item.due_at != normalized_due_at:
            item.due_at = normalized_due_at
            changed = True
    if notes is not None:
        normalized_notes = _normalize_optional_text(notes)
        if item.notes != normalized_notes:
            item.notes = normalized_notes
            changed = True

    if changed:
        item.updated_at = reference_time
        item.updated_by = actor_id
        item.version += 1
    if (
        normalized_type == TradeWorkflowType.CREDIT_APPROVAL.value
        and requested_status is not None
        and previous_status == CreditApprovalStatus.APPROVED.value
        and requested_status != CreditApprovalStatus.APPROVED.value
    ):
        invalidate_active_trade_credit_exceptions(
            db,
            trade_id=trade.trade_id,
            released_at=reference_time,
            released_by=actor_id,
            released_reason=_credit_exception_release_reason_for_status(requested_status),
            status=requested_status,
        )
    if (
        requested_status in CREDIT_APPROVAL_DECISION_STATUS_VALUES
        and item.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value
        and previous_status != requested_status
        and item.status == requested_status
    ):
        decision_record = _append_credit_approval_decision(
            db,
            trade=trade,
            workflow_item=item,
            decision=requested_status,
            decision_comment=item.notes or "",
            actor_id=actor_id,
            decided_at=reference_time,
        )
        if requested_status == CreditApprovalStatus.APPROVED.value:
            create_trade_credit_exception(
                db,
                trade_id=trade.trade_id,
                workflow_item_id=item.id,
                approval_decision_id=decision_record.id,
                approval_snapshot=dict(decision_record.breach_snapshot or {}),
                approved_at=reference_time,
                approved_by=actor_id,
                approval_comment=item.notes or "",
            )

    workflow_items = db.execute(
        select(TradeWorkflowItem).where(TradeWorkflowItem.trade_id == trade_id)
    ).scalars().all()
    rollup_trade_workflow_statuses(trade, workflow_items, now=reference_time)
    db.flush()
    return _to_out(
        item,
        trade,
        now=reference_time,
        active_credit_exception=build_active_trade_credit_exception_lookup(
            db,
            trades=[trade],
            now=reference_time,
        ).get(trade.trade_id),
        credit_decision_history=_credit_decision_history_by_workflow_item_id(
            db,
            workflow_item_ids=[item.id],
        ).get(item.id, []),
    )


def update_trade_workflow_item(
    db: Session,
    *,
    item_id: int,
    actor_id: str,
    actor_role: str | None,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> TradeWorkflowItemOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = db.execute(
        select(TradeWorkflowItem, Trade)
        .join(Trade, Trade.trade_id == TradeWorkflowItem.trade_id)
        .where(
            TradeWorkflowItem.id == item_id,
            or_(
                Trade.status == TradeStatus.ACTIVE.value,
                and_(
                    TradeWorkflowItem.workflow_type == TradeWorkflowType.OPTION_SETTLEMENT.value,
                    Trade.status.in_(tuple(OPTION_SETTLEMENT_SOURCE_TRADE_STATUSES)),
                ),
            ),
        )
    ).first()
    if row is None:
        raise LookupError(f"Workflow item '{item_id}' was not found.")

    item, trade = row
    changed = False
    previous_status = item.status
    requested_status: str | None = None

    if item.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value and "status" in changes:
        requested_status = normalize_workflow_status(item.workflow_type, changes.get("status"))
        next_notes = item.notes
        if "notes" in changes:
            next_notes = _normalize_optional_text(changes.get("notes"))
        if requested_status != item.status:
            if not _credit_workflow_status_change_allowed(actor_id=actor_id, actor_role=actor_role):
                raise PermissionError(
                    "Only CREDIT_APPROVER, OPS_ADMIN, or ADMIN sessions can change credit approval workflow status."
                )
            if requested_status in CREDIT_APPROVAL_DECISION_STATUS_VALUES and not next_notes:
                raise ValueError("Recording a credit approval decision requires an audit comment in notes.")
            if requested_status == CreditApprovalStatus.APPROVED.value:
                assert_trade_credit_approval_freshness(
                    db,
                    trade=trade,
                    as_of=reference_time,
                )

    if item.workflow_type in DOWNSTREAM_CREDIT_GATED_WORKFLOW_TYPES and "status" in changes:
        requested_status = normalize_workflow_status(item.workflow_type, changes.get("status"))
        if requested_status != item.status:
            credit_hold_state = get_trade_credit_hold_state(db, trade_id=item.trade_id)
            if credit_hold_state.hold_active:
                workflow_label = item.workflow_type.replace("_", " ").lower()
                raise ValueError(
                    format_trade_credit_hold_message(
                        trade.trade_id,
                        credit_hold_state,
                        blocked_action=(
                            f"Updating {workflow_label} status is blocked until credit approves the trade "
                            "or the trade is amended back within limit."
                        ),
                    )
                )

    if "status" in changes:
        normalized_status = normalize_workflow_status(item.workflow_type, changes.get("status"))
        if item.status != normalized_status:
            item.status = normalized_status
            changed = True
    if "owner" in changes:
        normalized_owner = _normalize_optional_text(changes.get("owner"))
        if item.owner != normalized_owner:
            item.owner = normalized_owner
            changed = True
    if "due_at" in changes:
        normalized_due_at = normalize_workflow_due_at(changes.get("due_at"))  # type: ignore[arg-type]
        if item.due_at != normalized_due_at:
            item.due_at = normalized_due_at
            changed = True
    if "notes" in changes:
        normalized_notes = _normalize_optional_text(changes.get("notes"))
        if item.notes != normalized_notes:
            item.notes = normalized_notes
            changed = True

    if changed:
        item.updated_at = reference_time
        item.updated_by = actor_id
        item.version += 1
        if (
            item.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value
            and requested_status is not None
            and previous_status == CreditApprovalStatus.APPROVED.value
            and requested_status != CreditApprovalStatus.APPROVED.value
        ):
            invalidate_active_trade_credit_exceptions(
                db,
                trade_id=trade.trade_id,
                released_at=reference_time,
                released_by=actor_id,
                released_reason=_credit_exception_release_reason_for_status(requested_status),
                status=requested_status,
            )
        if (
            item.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value
            and requested_status in CREDIT_APPROVAL_DECISION_STATUS_VALUES
            and previous_status != requested_status
        ):
            decision_record = _append_credit_approval_decision(
                db,
                trade=trade,
                workflow_item=item,
                decision=requested_status,
                decision_comment=item.notes or "",
                actor_id=actor_id,
                decided_at=reference_time,
            )
            if requested_status == CreditApprovalStatus.APPROVED.value:
                create_trade_credit_exception(
                    db,
                    trade_id=trade.trade_id,
                    workflow_item_id=item.id,
                    approval_decision_id=decision_record.id,
                    approval_snapshot=dict(decision_record.breach_snapshot or {}),
                    approved_at=reference_time,
                    approved_by=actor_id,
                    approval_comment=item.notes or "",
                )

    workflow_items = db.execute(
        select(TradeWorkflowItem).where(TradeWorkflowItem.trade_id == item.trade_id)
    ).scalars().all()
    rollup_trade_workflow_statuses(trade, workflow_items, now=reference_time)
    db.flush()
    return _to_out(
        item,
        trade,
        now=reference_time,
        active_credit_exception=build_active_trade_credit_exception_lookup(
            db,
            trades=[trade],
            now=reference_time,
        ).get(trade.trade_id),
        credit_decision_history=_credit_decision_history_by_workflow_item_id(
            db,
            workflow_item_ids=[item.id],
        ).get(item.id, []),
    )
