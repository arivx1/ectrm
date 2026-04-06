from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.operations import TradeWorkflowItemOut
from apps.api.app.shared.enums import AllocationStatus
from apps.api.app.shared.enums import ConfirmationStatus
from apps.api.app.shared.enums import InvoiceStatus
from apps.api.app.shared.enums import NominationStatus
from apps.api.app.shared.enums import PaymentStatus
from apps.api.app.shared.enums import SettlementStatus
from apps.api.app.shared.enums import TradeWorkflowType

SYSTEM_WORKFLOW_ACTOR = "system.workflow"

WORKFLOW_TYPE_TO_QUEUE: dict[str, str] = {
    TradeWorkflowType.CONFIRMATION.value: "operations",
    TradeWorkflowType.NOMINATION.value: "operations",
    TradeWorkflowType.ALLOCATION.value: "operations",
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
    if trade.status == "CANCELLED":
        return

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    existing_items = db.execute(
        select(TradeWorkflowItem).where(TradeWorkflowItem.trade_id == trade.trade_id)
    ).scalars().all()
    items_by_type = {item.workflow_type: item for item in existing_items}

    for workflow_type in (workflow_type.value for workflow_type in TradeWorkflowType):
        expected_status = workflow_status_from_trade(trade, workflow_type)
        default_due_at = _default_due_at_for_trade(trade, workflow_type)
        item = items_by_type.get(workflow_type)
        if item is None:
            db.add(
                TradeWorkflowItem(
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
            )
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


def synchronize_active_trade_workflow_items(
    db: Session,
    *,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: Optional[datetime] = None,
) -> None:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trades = db.execute(
        select(Trade)
        .where(Trade.status != "CANCELLED")
        .order_by(Trade.updated_at.desc(), Trade.trade_id.desc())
    ).scalars().all()

    for trade in trades:
        synchronize_trade_workflow_items(db, trade, actor_id=actor_id, now=reference_time)


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


def _workflow_attention_rank(item: TradeWorkflowItemOut) -> tuple[int, datetime, datetime, str, str]:
    if item.status in {"DISPUTED", "OVERDUE"}:
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


def _to_out(item: TradeWorkflowItem, trade: Trade, *, now: Optional[datetime] = None) -> TradeWorkflowItemOut:
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
    db.flush()

    stmt = (
        select(TradeWorkflowItem, Trade)
        .join(Trade, Trade.trade_id == TradeWorkflowItem.trade_id)
        .where(Trade.status != "CANCELLED")
    )
    if trade_id:
        stmt = stmt.where(TradeWorkflowItem.trade_id == trade_id)

    rows = db.execute(stmt).all()
    items = [_to_out(item, trade, now=reference_time) for item, trade in rows]
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
    status: object | None = None,
    owner: object | None = None,
    due_at: datetime | None = None,
    notes: object | None = None,
    now: Optional[datetime] = None,
) -> TradeWorkflowItemOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    normalized_type = normalize_workflow_type(workflow_type)

    trade = db.execute(
        select(Trade).where(Trade.trade_id == trade_id, Trade.status != "CANCELLED")
    ).scalars().first()
    if trade is None:
        raise LookupError(f"Trade '{trade_id}' was not found.")

    synchronize_trade_workflow_items(db, trade, actor_id=actor_id, now=reference_time)
    db.flush()

    item = db.execute(
        select(TradeWorkflowItem).where(
            TradeWorkflowItem.trade_id == trade_id,
            TradeWorkflowItem.workflow_type == normalized_type,
        )
    ).scalars().first()
    if item is None:
        raise LookupError(f"Workflow item for trade '{trade_id}' and type '{normalized_type}' was not found.")

    changed = False
    if status is not None:
        normalized_status = normalize_workflow_status(normalized_type, status)
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

    workflow_items = db.execute(
        select(TradeWorkflowItem).where(TradeWorkflowItem.trade_id == trade_id)
    ).scalars().all()
    rollup_trade_workflow_statuses(trade, workflow_items, now=reference_time)
    db.flush()
    return _to_out(item, trade, now=reference_time)


def update_trade_workflow_item(
    db: Session,
    *,
    item_id: int,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> TradeWorkflowItemOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = db.execute(
        select(TradeWorkflowItem, Trade)
        .join(Trade, Trade.trade_id == TradeWorkflowItem.trade_id)
        .where(
            TradeWorkflowItem.id == item_id,
            Trade.status != "CANCELLED",
        )
    ).first()
    if row is None:
        raise LookupError(f"Workflow item '{item_id}' was not found.")

    item, trade = row
    changed = False

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

    workflow_items = db.execute(
        select(TradeWorkflowItem).where(TradeWorkflowItem.trade_id == item.trade_id)
    ).scalars().all()
    rollup_trade_workflow_statuses(trade, workflow_items, now=reference_time)
    db.flush()
    return _to_out(item, trade, now=reference_time)
