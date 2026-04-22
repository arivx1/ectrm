from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_credit_approver_role
from apps.api.app.core.request_context import get_request_identity
from apps.api.app.domains.trading.services.event_writes import (
    AppendDomainEventCommand,
    append_domain_event,
)
from apps.api.app.domains.operations.services.actualizations import (
    actualization_workflow_note,
)
from apps.api.app.domains.operations.services.actualizations import (
    synchronize_active_trade_actualization_statuses,
)
from apps.api.app.domains.operations.services.actualizations import (
    trade_has_actualization_record,
)
from apps.api.app.domains.operations.services.audit_events import append_trade_audit_event
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceDescriptor,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceEmptyState,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceListRequest,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourcePrimaryAction,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceSummaryStat,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceSurface,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceSurfaceAction,
)
from apps.api.app.domains.operations.services.resource_views import (
    load_operational_resource_items,
)
from apps.api.app.domains.operations.services.resource_views import (
    paginate_operational_items,
)
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
from apps.api.app.domains.operations.services.trade_credit_freshness import (
    build_trade_credit_approval_freshness_lookup,
)
from apps.api.app.domains.operations.services.trade_credit_hold import (
    format_trade_credit_hold_message,
)
from apps.api.app.domains.operations.services.trade_credit_hold import get_trade_credit_hold_state
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_credit_approval_decision import TradeCreditApprovalDecision
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.operations import TradeCreditApprovalDecisionOut
from apps.api.app.schemas.operations import TradeCreditApprovalFreshnessOut
from apps.api.app.schemas.operations import TradeCreditExceptionOut
from apps.api.app.schemas.operations import OperationalRowActionStateOut
from apps.api.app.schemas.operations import TradeWorkflowItemOut
from apps.api.app.shared.enums import ActualizationStatus
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
OPTION_SETTLEMENT_SOURCE_SYSTEM = "OPTION_SETTLEMENT"

WORKFLOW_TYPE_TO_QUEUE: dict[str, str] = {
    TradeWorkflowType.CONFIRMATION.value: "operations",
    TradeWorkflowType.NOMINATION.value: "operations",
    TradeWorkflowType.ALLOCATION.value: "operations",
    TradeWorkflowType.ACTUALIZATION.value: "operations",
    TradeWorkflowType.CREDIT_APPROVAL.value: "operations",
    TradeWorkflowType.OPTION_SETTLEMENT.value: "operations",
    TradeWorkflowType.INVOICE.value: "settlement",
    TradeWorkflowType.PAYMENT.value: "settlement",
}

WORKFLOW_TYPE_TO_TRADE_FIELD: dict[str, str] = {
    TradeWorkflowType.CONFIRMATION.value: "confirmation_status",
    TradeWorkflowType.NOMINATION.value: "nomination_status",
    TradeWorkflowType.ALLOCATION.value: "allocation_status",
    TradeWorkflowType.ACTUALIZATION.value: "actualization_status",
    TradeWorkflowType.INVOICE.value: "invoice_status",
    TradeWorkflowType.PAYMENT.value: "payment_status",
}

WORKFLOW_ALLOWED_STATUS_VALUES: dict[str, tuple[str, ...]] = {
    TradeWorkflowType.CONFIRMATION.value: tuple(status.value for status in ConfirmationStatus),
    TradeWorkflowType.NOMINATION.value: tuple(status.value for status in NominationStatus),
    TradeWorkflowType.ALLOCATION.value: tuple(status.value for status in AllocationStatus),
    TradeWorkflowType.ACTUALIZATION.value: tuple(status.value for status in ActualizationStatus),
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
    TradeWorkflowType.ACTUALIZATION.value: {
        ActualizationStatus.NOT_REQUIRED.value,
        ActualizationStatus.ACTUALIZED.value,
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


def _audit_work_item_payload(item: TradeWorkflowItemOut) -> dict[str, object]:
    return item.model_dump(mode="json")

AUTOMATED_WORKFLOW_TYPES: tuple[str, ...] = (
    TradeWorkflowType.CONFIRMATION.value,
    TradeWorkflowType.NOMINATION.value,
    TradeWorkflowType.ALLOCATION.value,
    TradeWorkflowType.ACTUALIZATION.value,
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


@dataclass(frozen=True)
class WorkflowItemListRequest(OperationalResourceListRequest):
    queue: str | None = None
    include_closed: bool = False
    trade_id: str | None = None


@dataclass(frozen=True)
class WorkflowItemListContext:
    linked_trades_by_option_trade_id: dict[str, Trade]
    credit_decision_history_by_item_id: dict[int, list[TradeCreditApprovalDecisionOut]]
    active_credit_exception_by_trade_id: dict[str, TradeCreditExceptionOut]
    credit_approval_freshness_by_trade_id: dict[str, TradeCreditApprovalFreshnessOut]


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


def find_linked_trade_for_originating_option(
    db: Session,
    *,
    originating_option_trade_id: str,
) -> Trade | None:
    return db.execute(
        select(Trade)
        .where(Trade.originating_option_trade_id == originating_option_trade_id)
        .order_by(Trade.created_at.asc(), Trade.trade_id.asc())
    ).scalars().first()


def build_option_settlement_resulting_trade_payload(
    trade: Trade,
    *,
    occurred_at: datetime,
) -> dict[str, object]:
    resulting_side = _resulting_underlying_side_for_option_settlement(trade)
    if resulting_side is None:
        raise ValueError(
            f"Trade '{trade.trade_id}' does not have a resulting underlying side for option settlement."
        )

    effective_timestamp = _coerce_utc(occurred_at) or datetime.now(timezone.utc)
    effective_date = effective_timestamp.date()
    effective_start_date = trade.effective_start_date or trade.delivery_start or effective_date
    effective_end_date = trade.effective_end_date or trade.delivery_end or effective_start_date
    delivery_start = trade.delivery_start or effective_start_date
    delivery_end = trade.delivery_end or effective_end_date

    return {
        "originating_option_trade_id": trade.trade_id,
        "source_system": OPTION_SETTLEMENT_SOURCE_SYSTEM,
        "execution_timestamp": effective_timestamp.isoformat(),
        "trade_date": effective_date.isoformat(),
        "effective_start_date": effective_start_date.isoformat(),
        "effective_end_date": effective_end_date.isoformat(),
        "quality_spec": trade.quality_spec,
        "unit_of_measure": trade.unit_of_measure,
        "trade_currency_code": trade.trade_currency_code,
        "location_code": trade.location_code,
        "delivery_start": delivery_start.isoformat(),
        "delivery_end": delivery_end.isoformat(),
        "price_unit_code": trade.price_unit_code,
        "instrument_type": TradeInstrumentType.LINEAR.value,
        "trade_nature": trade.trade_nature,
        "trade_structure": "SINGLE",
        "trade_side": resulting_side,
        "book": trade.book,
        "portfolio": trade.portfolio,
        "counterparty": trade.counterparty,
        "commodity_class": trade.commodity_class,
        "commodity": trade.commodity,
        "pricing_type": "FIXED",
        "pricing_status": "PRICED",
        "price_index_code": trade.price_index_code,
        "price": float(trade.option_strike_price) if trade.option_strike_price is not None else None,
        "volume": float(trade.volume) if trade.volume is not None else None,
        "trader_user": trade.trader_user,
        "status": TradeStatus.ACTIVE.value,
    }


def build_option_settlement_booking_notes(existing_notes: object | None, *, linked_trade_id: str) -> str:
    booking_note = f"Underlying booked as {linked_trade_id}."
    normalized_notes = _normalize_optional_text(existing_notes)
    if normalized_notes is None:
        return booking_note
    if booking_note in normalized_notes:
        return normalized_notes
    separator = "" if normalized_notes.endswith((".", "!", "?")) else "."
    return f"{normalized_notes}{separator} {booking_note}"


def _load_option_settlement_work_item_for_booking(
    db: Session,
    *,
    item_id: int,
) -> tuple[TradeWorkflowItem, Trade]:
    row = db.execute(
        select(TradeWorkflowItem, Trade)
        .join(Trade, Trade.trade_id == TradeWorkflowItem.trade_id)
        .where(
            TradeWorkflowItem.id == item_id,
            TradeWorkflowItem.workflow_type == TradeWorkflowType.OPTION_SETTLEMENT.value,
            Trade.status.in_(tuple(OPTION_SETTLEMENT_SOURCE_TRADE_STATUSES)),
        )
    ).first()
    if row is None:
        raise LookupError(f"Workflow item '{item_id}' was not found or is not an option settlement handoff.")
    return row


def _next_resulting_trade_id(db: Session, *, originating_option_trade_id: str) -> str:
    base_suffix = "-UNDERLYING"
    truncated_parent_id = originating_option_trade_id[: max(1, 64 - len(base_suffix))]
    base_trade_id = f"{truncated_parent_id}{base_suffix}"
    candidate_trade_id = base_trade_id
    sequence = 2

    while db.execute(select(Trade.trade_id).where(Trade.trade_id == candidate_trade_id)).scalar_one_or_none():
        suffix = f"-{sequence}"
        candidate_trade_id = f"{base_trade_id[: max(1, 64 - len(suffix))]}{suffix}"
        sequence += 1

    return candidate_trade_id


def _option_settlement_occurred_at(db: Session, *, trade: Trade, fallback: datetime) -> datetime:
    lifecycle_event = db.execute(select(Event).where(Event.event_id == trade.last_event_id)).scalars().first()
    if lifecycle_event is not None:
        occurred_at = _coerce_utc(lifecycle_event.occurred_at)
        if occurred_at is not None:
            return occurred_at

    return _coerce_utc(trade.updated_at) or _coerce_utc(trade.execution_timestamp) or fallback


def _append_trade_projection_event(
    db: Session,
    *,
    aggregate_id: str,
    event_type: str,
    occurred_at: datetime,
    actor_id: str,
    payload: dict[str, object],
    schema_version: int = 1,
    causation_id: str | None = None,
    recorded_at: datetime | None = None,
) -> Event:
    identity = get_request_identity()
    effective_recorded_at = _coerce_utc(recorded_at) or datetime.now(timezone.utc)
    return append_domain_event(
        db,
        AppendDomainEventCommand(
            aggregate_type="trade",
            aggregate_id=aggregate_id,
            event_type=event_type,
            occurred_at=_coerce_utc(occurred_at) or effective_recorded_at,
            recorded_at=effective_recorded_at,
            actor_id=actor_id,
            correlation_id=identity.correlation_id,
            causation_id=causation_id,
            schema_version=schema_version,
            payload=payload,
        ),
    )


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
    if normalized_type == TradeWorkflowType.ACTUALIZATION.value:
        actualization_anchor = trade.delivery_end or trade.delivery_start or trade.effective_end_date or trade_anchor
        return _at_midday_utc(actualization_anchor + timedelta(days=1))
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


def _validate_actualization_workflow_status_change(
    db: Session,
    *,
    trade: Trade,
    requested_status: str,
) -> None:
    if trade_has_actualization_record(db, trade_id=trade.trade_id):
        raise ValueError(
            "Actualization status is derived from recorded delivery actualizations. "
            "Update the shipment actualization instead."
        )
    if requested_status not in {
        ActualizationStatus.PENDING.value,
        ActualizationStatus.NOT_REQUIRED.value,
    }:
        raise ValueError(
            "Use shipment actualization to record executed quantity and timestamp before marking actualization complete."
        )


def synchronize_trade_workflow_items(
    db: Session,
    trade: Trade,
    *,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: Optional[datetime] = None,
    rollup_settlement_status: bool = False,
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
        default_notes = (
            actualization_workflow_note(expected_status)
            if workflow_type == TradeWorkflowType.ACTUALIZATION.value
            else None
        )
        item = items_by_type.get(workflow_type)
        if item is None:
            item = TradeWorkflowItem(
                trade_id=trade.trade_id,
                workflow_type=workflow_type,
                status=expected_status,
                owner=None,
                due_at=default_due_at,
                notes=default_notes,
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
        if item.notes is None and default_notes is not None:
            item.notes = default_notes
            changed = True
        if changed:
            item.updated_at = reference_time
            item.updated_by = actor_id
            item.version += 1

    rollup_trade_workflow_statuses(
        trade,
        list(items_by_type.values()),
        now=reference_time,
        rollup_settlement_status=rollup_settlement_status,
    )


def synchronize_active_trade_workflow_items(
    db: Session,
    *,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: Optional[datetime] = None,
) -> None:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    synchronize_active_trade_actualization_statuses(db, now=reference_time)
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
    rollup_settlement_status: bool = True,
) -> bool:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    items_by_type = {item.workflow_type: item for item in workflow_items}

    confirmation_item = items_by_type.get(TradeWorkflowType.CONFIRMATION.value)
    nomination_item = items_by_type.get(TradeWorkflowType.NOMINATION.value)
    allocation_item = items_by_type.get(TradeWorkflowType.ALLOCATION.value)
    actualization_item = items_by_type.get(TradeWorkflowType.ACTUALIZATION.value)
    invoice_item = items_by_type.get(TradeWorkflowType.INVOICE.value)
    payment_item = items_by_type.get(TradeWorkflowType.PAYMENT.value)

    next_confirmation_status = confirmation_item.status if confirmation_item is not None else trade.confirmation_status
    next_nomination_status = nomination_item.status if nomination_item is not None else trade.nomination_status
    next_allocation_status = allocation_item.status if allocation_item is not None else trade.allocation_status
    next_actualization_status = (
        actualization_item.status if actualization_item is not None else trade.actualization_status
    )
    next_invoice_status = invoice_item.status if invoice_item is not None else trade.invoice_status
    next_payment_status = payment_item.status if payment_item is not None else trade.payment_status
    next_settlement_status = (
        _derive_settlement_status(next_invoice_status, next_payment_status)
        if rollup_settlement_status
        else trade.settlement_status
    )

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
    if trade.actualization_status != next_actualization_status:
        trade.actualization_status = next_actualization_status
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
    rollup_settlement_status: bool = True,
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
    rollup_trade_workflow_statuses(
        trade,
        workflow_items,
        now=reference_time,
        rollup_settlement_status=rollup_settlement_status,
    )
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
    linked_trade: Trade | None = None,
    credit_approval_freshness: TradeCreditApprovalFreshnessOut | None = None,
    active_credit_exception: TradeCreditExceptionOut | None = None,
    credit_decision_history: list[TradeCreditApprovalDecisionOut] | None = None,
) -> TradeWorkflowItemOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    created_at = _coerce_utc(item.created_at) or reference_time
    updated_at = _coerce_utc(item.updated_at) or reference_time
    due_at = _coerce_utc(item.due_at)
    is_closed = is_workflow_item_closed(item.workflow_type, item.status)
    is_overdue = bool(due_at is not None and due_at < reference_time and not is_closed)
    approval_blocked_reason = None
    if credit_approval_freshness is not None and credit_approval_freshness.approval_blocked:
        approval_blocked_reason = " ".join(credit_approval_freshness.blocking_reasons).strip() or (
            "Clear credit freshness blockers before approving the workflow item."
        )
    action_states: list[OperationalRowActionStateOut] = [
        OperationalRowActionStateOut(key="assignSelf"),
        OperationalRowActionStateOut(key="save"),
    ]
    if item.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value:
        action_states.extend(
            [
                OperationalRowActionStateOut(
                    key="approve",
                    available=approval_blocked_reason is None,
                    blocked_reason=approval_blocked_reason,
                ),
                OperationalRowActionStateOut(key="reject"),
            ]
        )
    if item.workflow_type == TradeWorkflowType.OPTION_SETTLEMENT.value and not is_closed:
        action_states.append(
            OperationalRowActionStateOut(
                key="bookUnderlying",
                label="Mark Booked" if linked_trade is not None else None,
            )
        )

    return TradeWorkflowItemOut(
        item_id=item.id,
        trade_id=item.trade_id,
        linked_trade_id=linked_trade.trade_id if linked_trade is not None else None,
        linked_trade_status=linked_trade.status if linked_trade is not None else None,
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
        action_states=action_states,
        credit_approval_freshness=credit_approval_freshness,
        active_credit_exception=active_credit_exception,
        credit_decision_history=credit_decision_history or [],
    )


def _normalize_workflow_queue(queue: str | None) -> str | None:
    normalized_queue = str(queue or "").strip().lower() or None
    if normalized_queue not in {None, "operations", "settlement"}:
        raise ValueError("Queue must be one of: operations, settlement.")
    return normalized_queue


def _synchronize_workflow_item_resource(
    db: Session,
    request: WorkflowItemListRequest,
) -> None:
    synchronize_active_trade_workflow_items(db, now=request.reference_time)
    synchronize_option_settlement_workflow_items(db, now=request.reference_time)
    db.flush()


def _load_workflow_item_rows(
    db: Session,
    request: WorkflowItemListRequest,
) -> list[tuple[TradeWorkflowItem, Trade]]:
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
    if request.trade_id:
        stmt = stmt.where(TradeWorkflowItem.trade_id == request.trade_id)
    return list(db.execute(stmt).all())


def _load_workflow_item_context(
    db: Session,
    rows: list[tuple[TradeWorkflowItem, Trade]],
    request: WorkflowItemListRequest,
) -> WorkflowItemListContext:
    option_settlement_trade_ids = [
        trade.trade_id
        for item, trade in rows
        if item.workflow_type == TradeWorkflowType.OPTION_SETTLEMENT.value
    ]
    linked_trades_by_option_trade_id: dict[str, Trade] = {}
    if option_settlement_trade_ids:
        linked_trades_by_option_trade_id = {
            linked_trade.originating_option_trade_id: linked_trade
            for linked_trade in db.execute(
                select(Trade)
                .where(Trade.originating_option_trade_id.in_(option_settlement_trade_ids))
                .order_by(Trade.created_at.asc(), Trade.trade_id.asc())
            ).scalars().all()
            if linked_trade.originating_option_trade_id is not None
        }
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
        now=request.reference_time,
    )
    credit_approval_freshness_by_trade_id = build_trade_credit_approval_freshness_lookup(
        db,
        trades=[trade for item, trade in rows if item.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value],
        as_of=request.reference_time,
    )
    return WorkflowItemListContext(
        linked_trades_by_option_trade_id=linked_trades_by_option_trade_id,
        credit_decision_history_by_item_id=credit_decision_history_by_item_id,
        active_credit_exception_by_trade_id=active_credit_exception_by_trade_id,
        credit_approval_freshness_by_trade_id=credit_approval_freshness_by_trade_id,
    )


def _build_workflow_item_list_item(
    row: tuple[TradeWorkflowItem, Trade],
    context: WorkflowItemListContext,
    request: WorkflowItemListRequest,
) -> TradeWorkflowItemOut:
    item, trade = row
    return _to_out(
        item,
        trade,
        now=request.reference_time,
        linked_trade=context.linked_trades_by_option_trade_id.get(trade.trade_id)
        if item.workflow_type == TradeWorkflowType.OPTION_SETTLEMENT.value
        else None,
        credit_approval_freshness=context.credit_approval_freshness_by_trade_id.get(trade.trade_id),
        active_credit_exception=context.active_credit_exception_by_trade_id.get(trade.trade_id),
        credit_decision_history=context.credit_decision_history_by_item_id.get(item.id, []),
    )


def _finalize_workflow_item_list(
    items: list[TradeWorkflowItemOut],
    request: WorkflowItemListRequest,
) -> list[TradeWorkflowItemOut]:
    filtered_items = items
    if request.queue is not None:
        filtered_items = [item for item in filtered_items if item.queue == request.queue]
    if not request.include_closed:
        filtered_items = [item for item in filtered_items if not item.is_closed]
    return paginate_operational_items(
        sorted(filtered_items, key=_workflow_attention_rank),
        request,
    )


WORKFLOW_ITEM_RESOURCE_DESCRIPTOR = OperationalResourceDescriptor[
    WorkflowItemListRequest,
    tuple[TradeWorkflowItem, Trade],
    WorkflowItemListContext,
    TradeWorkflowItemOut,
](
    resource_key="work_items",
    filters=("queue", "include_closed", "trade_id"),
    sort_fields=("attention_rank",),
    actions=("create", "update", "book_underlying"),
    surface=OperationalResourceSurface(
        title="Operational Work Queue",
        description=(
            "The queue stays focused on owner, due date, and downstream handoff decisions after "
            "record-managed ledgers set lifecycle state."
        ),
        board_section="Critical Path",
        actions=(
            OperationalResourceSurfaceAction(
                key="create",
                label="Create Work Item",
                detail="Open the next manual or exceptional handoff when operations needs an explicit owner and due date.",
                permission_message="Sign in to edit workflow ownership, due dates, and statuses.",
            ),
            OperationalResourceSurfaceAction(
                key="assignSelf",
                label="Assign Me",
                detail="Claim ownership of the workflow item directly from the queue.",
                permission_message="Sign in to edit workflow ownership, due dates, and statuses.",
            ),
            OperationalResourceSurfaceAction(
                key="save",
                label="Save",
                detail="Persist workflow owner, due date, status, and note changes on the active handoff.",
                permission_message="Sign in to edit workflow ownership, due dates, and statuses.",
            ),
            OperationalResourceSurfaceAction(
                key="approve",
                label="Approve With Comment",
                detail="Approve the credit workflow decision and leave an auditable explanation on the item.",
                permission_message="Only authorized credit approvers can approve credit workflow items.",
                comment_required=True,
                comment_hint="Add a decision comment before approving a credit approval workflow item.",
            ),
            OperationalResourceSurfaceAction(
                key="reject",
                label="Reject With Comment",
                detail="Reject the credit workflow decision and record the rationale on the item.",
                permission_message="Only authorized credit approvers can reject credit workflow items.",
                comment_required=True,
                comment_hint="Add a decision comment before rejecting a credit approval workflow item.",
            ),
            OperationalResourceSurfaceAction(
                key="bookUnderlying",
                label="Book Underlying",
                detail="Complete the option-settlement handoff by booking or confirming the linked underlying trade.",
                permission_message="Sign in to edit workflow ownership, due dates, and statuses.",
            ),
        ),
        primary_action=OperationalResourcePrimaryAction(
            key="create_handoff",
            label="Create handoff",
            detail="Open the next operational workflow item as soon as the desk needs a named owner and due date.",
        ),
        empty_state=OperationalResourceEmptyState(
            title="No open work queue",
            detail="Create active trades to start opening confirmation, actualization, credit, or settlement handoffs.",
        ),
        summary_stats=(
            OperationalResourceSummaryStat(
                key="unassigned_handoffs",
                label="Unassigned handoffs",
                detail="Keep ownerless tasks visible before they age into hidden operational risk.",
            ),
            OperationalResourceSummaryStat(
                key="due_and_overdue",
                label="Due and overdue",
                detail="Rank the queue by attention so near-term handoffs rise above passive backlog.",
            ),
            OperationalResourceSummaryStat(
                key="exception_path",
                label="Exception path",
                detail="Use the same queue to route credit, dispute, and option settlement exceptions through operations.",
            ),
        ),
    ),
    load_rows=_load_workflow_item_rows,
    load_context=_load_workflow_item_context,
    build_item=_build_workflow_item_list_item,
    synchronize=_synchronize_workflow_item_resource,
    finalize_items=_finalize_workflow_item_list,
)


def list_trade_workflow_items(
    db: Session,
    *,
    queue: str | None = None,
    include_closed: bool = False,
    trade_id: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    now: Optional[datetime] = None,
) -> list[TradeWorkflowItemOut]:
    return load_operational_resource_items(
        WORKFLOW_ITEM_RESOURCE_DESCRIPTOR,
        db,
        WorkflowItemListRequest(
            reference_time=_coerce_utc(now) or datetime.now(timezone.utc),
            queue=_normalize_workflow_queue(queue),
            include_closed=include_closed,
            trade_id=trade_id,
            limit=limit,
            offset=offset,
        ),
    )


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
        if normalized_type == TradeWorkflowType.ACTUALIZATION.value:
            if status is not None:
                _validate_actualization_workflow_status_change(
                    db,
                    trade=trade,
                    requested_status=normalized_status,
                )
            if not normalized_notes:
                normalized_notes = actualization_workflow_note(normalized_status)
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
        item_out = _to_out(
            item,
            trade,
            now=reference_time,
            credit_approval_freshness=build_trade_credit_approval_freshness_lookup(
                db,
                trades=[trade],
                as_of=reference_time,
            ).get(trade.trade_id),
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
        append_trade_audit_event(
            db,
            trade_id=item_out.trade_id,
            actor_id=actor_id,
            event_type="TradeWorkflowItemUpserted",
            occurred_at=item_out.updated_at,
            causation_id=f"trade-workflow-item:{item_out.item_id}",
            payload={
                "request": jsonable_encoder(
                    {
                        key: value
                        for key, value in {
                            "trade_id": trade_id,
                            "workflow_type": normalized_type,
                            "status": status,
                            "owner": owner,
                            "due_at": due_at,
                            "notes": notes,
                        }.items()
                        if value is not None
                    }
                ),
                "workflow_item": _audit_work_item_payload(item_out),
            },
        )
        return item_out

    changed = False
    previous_status = item.status
    requested_status: str | None = None
    if status is not None:
        normalized_status = normalize_workflow_status(normalized_type, status)
        if normalized_type == TradeWorkflowType.ACTUALIZATION.value and normalized_status != item.status:
            _validate_actualization_workflow_status_change(
                db,
                trade=trade,
                requested_status=normalized_status,
            )
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
    item_out = _to_out(
        item,
        trade,
        now=reference_time,
        linked_trade=find_linked_trade_for_originating_option(db, originating_option_trade_id=trade.trade_id)
        if item.workflow_type == TradeWorkflowType.OPTION_SETTLEMENT.value
        else None,
        credit_approval_freshness=build_trade_credit_approval_freshness_lookup(
            db,
            trades=[trade],
            as_of=reference_time,
        ).get(trade.trade_id),
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
    append_trade_audit_event(
        db,
        trade_id=item_out.trade_id,
        actor_id=actor_id,
        event_type="TradeWorkflowItemUpserted",
        occurred_at=item_out.updated_at,
        causation_id=f"trade-workflow-item:{item_out.item_id}",
        payload={
            "request": jsonable_encoder(
                {
                    key: value
                    for key, value in {
                        "trade_id": trade_id,
                        "workflow_type": normalized_type,
                        "status": status,
                        "owner": owner,
                        "due_at": due_at,
                        "notes": notes,
                    }.items()
                    if value is not None
                }
            ),
            "workflow_item": _audit_work_item_payload(item_out),
        },
    )
    return item_out


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

    if item.workflow_type == TradeWorkflowType.ACTUALIZATION.value and "status" in changes:
        requested_status = normalize_workflow_status(item.workflow_type, changes.get("status"))
        if requested_status != item.status:
            _validate_actualization_workflow_status_change(
                db,
                trade=trade,
                requested_status=requested_status,
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
    item_out = _to_out(
        item,
        trade,
        now=reference_time,
        linked_trade=find_linked_trade_for_originating_option(db, originating_option_trade_id=trade.trade_id)
        if item.workflow_type == TradeWorkflowType.OPTION_SETTLEMENT.value
        else None,
        credit_approval_freshness=build_trade_credit_approval_freshness_lookup(
            db,
            trades=[trade],
            as_of=reference_time,
        ).get(trade.trade_id),
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
    append_trade_audit_event(
        db,
        trade_id=item_out.trade_id,
        actor_id=actor_id,
        event_type="TradeWorkflowItemUpdated",
        occurred_at=item_out.updated_at,
        causation_id=f"trade-workflow-item:{item_out.item_id}",
        payload={
            "requested_changes": jsonable_encoder(changes),
            "workflow_item": _audit_work_item_payload(item_out),
        },
    )
    return item_out


def book_trade_workflow_item_underlying(
    db: Session,
    *,
    item_id: int,
    actor_id: str,
    actor_role: str | None,
    now: Optional[datetime] = None,
) -> TradeWorkflowItemOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    item, trade = _load_option_settlement_work_item_for_booking(db, item_id=item_id)
    linked_trade = find_linked_trade_for_originating_option(db, originating_option_trade_id=trade.trade_id)
    settlement_occurred_at = _option_settlement_occurred_at(db, trade=trade, fallback=reference_time)

    if linked_trade is None:
        child_trade_id = _next_resulting_trade_id(db, originating_option_trade_id=trade.trade_id)
        _append_trade_projection_event(
            db,
            aggregate_id=child_trade_id,
            event_type="TradeCreated",
            occurred_at=settlement_occurred_at,
            actor_id=actor_id,
            payload=build_option_settlement_resulting_trade_payload(
                trade,
                occurred_at=settlement_occurred_at,
            ),
            schema_version=1,
            recorded_at=reference_time,
        )
        linked_trade = db.execute(select(Trade).where(Trade.trade_id == child_trade_id)).scalars().first()
        if linked_trade is None:
            raise RuntimeError("Option settlement booking created an event but no resulting trade was projected.")

    item_out = update_trade_workflow_item(
        db,
        item_id=item.id,
        actor_id=actor_id,
        actor_role=actor_role,
        changes={
            "status": OptionSettlementStatus.BOOKED.value,
            "notes": build_option_settlement_booking_notes(item.notes, linked_trade_id=linked_trade.trade_id),
        },
        now=reference_time,
    )
    append_trade_audit_event(
        db,
        trade_id=item_out.trade_id,
        actor_id=actor_id,
        event_type="TradeWorkflowItemUnderlyingBooked",
        occurred_at=item_out.updated_at,
        causation_id=f"trade-workflow-item:{item_out.item_id}",
        payload={
            "linked_trade_id": linked_trade.trade_id,
            "workflow_item": _audit_work_item_payload(item_out),
        },
    )
    return item_out
