from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.trade_credit_hold import (
    format_trade_credit_hold_message,
)
from apps.api.app.domains.operations.services.trade_credit_hold import get_trade_credit_hold_state
from apps.api.app.domains.operations.services.workflow_items import SYSTEM_WORKFLOW_ACTOR
from apps.api.app.domains.operations.services.settlement_payments import synchronize_trade_payment_projection
from apps.api.app.domains.operations.services.workflow_items import set_trade_workflow_item_projection
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.settlement import TradeInvoiceOut
from apps.api.app.shared.enums import InvoiceStatus
from apps.api.app.shared.enums import PaymentStatus
from apps.api.app.shared.enums import TradeWorkflowType

ZERO = Decimal("0")


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


def _normalize_required_text(value: object | None, *, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{field_name} is required.")
    return normalized


def _normalize_currency_code(value: object | None, *, trade: Trade) -> str:
    normalized = str(value or trade.trade_currency_code or "USD").strip().upper()
    if not normalized:
        raise ValueError("Invoice currency is required.")
    return normalized


def _default_invoice_number(trade: Trade) -> str:
    return f"INV-{trade.trade_id}"


def _normalize_invoice_number(value: object | None, *, trade: Trade) -> str:
    normalized = str(value or "").strip().upper()
    return normalized or _default_invoice_number(trade)


def _trade_notional_amount(trade: Trade) -> Decimal | None:
    if trade.price is None or trade.volume is None:
        return None
    try:
        return abs(Decimal(str(trade.price)) * Decimal(str(trade.volume)))
    except (ArithmeticError, InvalidOperation):
        return None


def _normalize_invoice_amount(value: object | None, *, trade: Trade) -> Decimal:
    candidate = value if value is not None else _trade_notional_amount(trade)
    if candidate is None:
        raise ValueError("Invoice amount is required and must be greater than zero.")

    try:
        normalized = Decimal(str(candidate))
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError("Invoice amount must be a numeric value.") from exc

    if normalized <= ZERO:
        raise ValueError("Invoice amount must be greater than zero.")
    return normalized


def _default_due_at(trade: Trade, *, issued_at: datetime) -> datetime:
    candidate = _at_midday_utc(
        trade.delivery_end
        or trade.effective_end_date
        or trade.delivery_start
        or trade.trade_date
    )
    if candidate is None or candidate < issued_at:
        return issued_at + timedelta(days=5)
    return candidate


def _normalize_issued_at(value: datetime | None, *, fallback: datetime) -> datetime:
    return _coerce_utc(value) or fallback


def _normalize_due_at(value: datetime | None, *, trade: Trade, issued_at: datetime) -> datetime:
    normalized = _coerce_utc(value) or _default_due_at(trade, issued_at=issued_at)
    if normalized < issued_at:
        raise ValueError("Invoice due date must be on or after the issued timestamp.")
    return normalized


def _validate_invoice_status(status: object | None) -> str:
    normalized = _normalize_required_text(status, field_name="Invoice status").upper()
    valid_values = tuple(invoice_status.value for invoice_status in InvoiceStatus)
    if normalized not in valid_values:
        raise ValueError(
            f"Invoice status '{normalized}' is invalid. Expected one of: {', '.join(valid_values)}."
        )
    return normalized


def _validate_dispute_reason(*, status: str, dispute_reason: str | None) -> None:
    if status == InvoiceStatus.DISPUTED.value and not dispute_reason:
        raise ValueError("Dispute reason is required when invoice status is DISPUTED.")


def _workflow_note_for_invoice(invoice: TradeInvoice) -> str | None:
    if invoice.status == InvoiceStatus.DISPUTED.value:
        return invoice.dispute_reason
    return invoice.notes


def _to_out(
    invoice: TradeInvoice,
    trade: Trade,
    workflow_item: TradeWorkflowItem | None,
    *,
    now: Optional[datetime] = None,
) -> TradeInvoiceOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    issued_at = _coerce_utc(invoice.issued_at) or reference_time
    due_at = _coerce_utc(invoice.due_at) or issued_at
    is_overdue = (
        due_at < reference_time
        and trade.payment_status not in {PaymentStatus.PAID.value, PaymentStatus.NOT_REQUIRED.value}
    )
    return TradeInvoiceOut(
        invoice_id=invoice.id,
        trade_id=invoice.trade_id,
        invoice_number=invoice.invoice_number,
        invoice_currency_code=invoice.invoice_currency_code,
        invoice_amount=float(invoice.invoice_amount),
        status=invoice.status,
        issued_at=issued_at,
        due_at=due_at,
        dispute_reason=invoice.dispute_reason,
        notes=invoice.notes,
        created_at=_coerce_utc(invoice.created_at) or issued_at,
        created_by=invoice.created_by,
        updated_at=_coerce_utc(invoice.updated_at) or reference_time,
        updated_by=invoice.updated_by,
        version=invoice.version,
        workflow_item_id=workflow_item.id if workflow_item is not None else None,
        workflow_owner=workflow_item.owner if workflow_item is not None else None,
        is_overdue=is_overdue,
        age_days=max(0, int((reference_time - issued_at).total_seconds() // 86_400)),
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
        payment_status=trade.payment_status,
        settlement_status=trade.settlement_status,
    )


def _invoice_row(
    db: Session,
    *,
    invoice_id: int,
) -> tuple[TradeInvoice, Trade, TradeWorkflowItem | None] | None:
    return db.execute(
        select(TradeInvoice, Trade, TradeWorkflowItem)
        .join(Trade, Trade.trade_id == TradeInvoice.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            (TradeWorkflowItem.trade_id == TradeInvoice.trade_id)
            & (TradeWorkflowItem.workflow_type == TradeWorkflowType.INVOICE.value),
        )
        .where(
            TradeInvoice.id == invoice_id,
            Trade.status != "CANCELLED",
        )
    ).first()


def _sync_invoice_projection(
    db: Session,
    *,
    trade: Trade,
    invoice: TradeInvoice,
    actor_id: str,
    now: Optional[datetime] = None,
) -> TradeWorkflowItem:
    return set_trade_workflow_item_projection(
        db,
        trade=trade,
        workflow_type=TradeWorkflowType.INVOICE.value,
        status=invoice.status,
        actor_id=actor_id,
        now=now,
        due_at=invoice.due_at,
        notes=_workflow_note_for_invoice(invoice),
    )


def trade_has_invoice_record(db: Session, *, trade_id: str) -> bool:
    return (
        db.execute(
            select(TradeInvoice.id).where(TradeInvoice.trade_id == trade_id).limit(1)
        ).scalar_one_or_none()
        is not None
    )


def list_trade_invoices(
    db: Session,
    *,
    trade_id: str | None = None,
    now: Optional[datetime] = None,
) -> list[TradeInvoiceOut]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    stmt = (
        select(TradeInvoice, Trade, TradeWorkflowItem)
        .join(Trade, Trade.trade_id == TradeInvoice.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            (TradeWorkflowItem.trade_id == TradeInvoice.trade_id)
            & (TradeWorkflowItem.workflow_type == TradeWorkflowType.INVOICE.value),
        )
        .where(Trade.status != "CANCELLED")
        .order_by(TradeInvoice.due_at.asc(), TradeInvoice.updated_at.desc(), TradeInvoice.id.desc())
    )
    if trade_id:
        stmt = stmt.where(TradeInvoice.trade_id == trade_id)

    rows = db.execute(stmt).all()
    return [_to_out(invoice, trade, workflow_item, now=reference_time) for invoice, trade, workflow_item in rows]


def issue_trade_invoice(
    db: Session,
    *,
    trade_id: str,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    invoice_number: object | None = None,
    invoice_currency_code: object | None = None,
    invoice_amount: object | None = None,
    issued_at: datetime | None = None,
    due_at: datetime | None = None,
    notes: object | None = None,
    now: Optional[datetime] = None,
) -> TradeInvoiceOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trade = db.execute(
        select(Trade).where(Trade.trade_id == trade_id, Trade.status != "CANCELLED")
    ).scalars().first()
    if trade is None:
        raise LookupError(f"Trade '{trade_id}' was not found.")

    credit_hold_state = get_trade_credit_hold_state(db, trade_id=trade.trade_id)
    if credit_hold_state.hold_active:
        raise ValueError(
            format_trade_credit_hold_message(
                trade.trade_id,
                credit_hold_state,
                blocked_action=(
                    "Settlement actions are blocked until credit approves the trade "
                    "or the trade is amended back within limit."
                ),
            )
        )

    existing_invoice = db.execute(
        select(TradeInvoice).where(TradeInvoice.trade_id == trade_id)
    ).scalars().first()
    if existing_invoice is not None:
        raise ValueError(f"Trade '{trade_id}' already has an invoice record.")

    normalized_issued_at = _normalize_issued_at(issued_at, fallback=reference_time)
    invoice = TradeInvoice(
        trade_id=trade.trade_id,
        invoice_number=_normalize_invoice_number(invoice_number, trade=trade),
        invoice_currency_code=_normalize_currency_code(invoice_currency_code, trade=trade),
        invoice_amount=_normalize_invoice_amount(invoice_amount, trade=trade),
        status=InvoiceStatus.ISSUED.value,
        issued_at=normalized_issued_at,
        due_at=_normalize_due_at(due_at, trade=trade, issued_at=normalized_issued_at),
        dispute_reason=None,
        notes=_normalize_optional_text(notes),
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    db.add(invoice)
    db.flush()
    workflow_item = _sync_invoice_projection(
        db,
        trade=trade,
        invoice=invoice,
        actor_id=actor_id,
        now=reference_time,
    )
    synchronize_trade_payment_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    return _to_out(invoice, trade, workflow_item, now=reference_time)


def update_trade_invoice(
    db: Session,
    *,
    invoice_id: int,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> TradeInvoiceOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = _invoice_row(db, invoice_id=invoice_id)
    if row is None:
        raise LookupError(f"Invoice '{invoice_id}' was not found.")

    invoice, trade, workflow_item = row
    credit_hold_state = get_trade_credit_hold_state(db, trade_id=trade.trade_id)
    if credit_hold_state.hold_active:
        raise ValueError(
            format_trade_credit_hold_message(
                trade.trade_id,
                credit_hold_state,
                blocked_action=(
                    "Settlement actions are blocked until credit approves the trade "
                    "or the trade is amended back within limit."
                ),
            )
        )
    next_invoice_number = invoice.invoice_number
    next_invoice_currency_code = invoice.invoice_currency_code
    next_invoice_amount = Decimal(str(invoice.invoice_amount))
    next_status = invoice.status
    next_issued_at = _coerce_utc(invoice.issued_at) or reference_time
    next_due_at = _coerce_utc(invoice.due_at) or next_issued_at
    next_dispute_reason = invoice.dispute_reason
    next_notes = invoice.notes

    if "invoice_number" in changes:
        next_invoice_number = _normalize_invoice_number(changes.get("invoice_number"), trade=trade)
    if "invoice_currency_code" in changes:
        next_invoice_currency_code = _normalize_currency_code(changes.get("invoice_currency_code"), trade=trade)
    if "invoice_amount" in changes:
        next_invoice_amount = _normalize_invoice_amount(changes.get("invoice_amount"), trade=trade)
    if "status" in changes:
        next_status = _validate_invoice_status(changes.get("status"))
    if "issued_at" in changes:
        next_issued_at = _normalize_issued_at(changes.get("issued_at"), fallback=next_issued_at)  # type: ignore[arg-type]
    if "due_at" in changes:
        next_due_at = _normalize_due_at(changes.get("due_at"), trade=trade, issued_at=next_issued_at)  # type: ignore[arg-type]
    else:
        next_due_at = _normalize_due_at(next_due_at, trade=trade, issued_at=next_issued_at)
    if "dispute_reason" in changes:
        next_dispute_reason = _normalize_optional_text(changes.get("dispute_reason"))
    if "notes" in changes:
        next_notes = _normalize_optional_text(changes.get("notes"))

    _validate_dispute_reason(status=next_status, dispute_reason=next_dispute_reason)

    changed = False
    if invoice.invoice_number != next_invoice_number:
        invoice.invoice_number = next_invoice_number
        changed = True
    if invoice.invoice_currency_code != next_invoice_currency_code:
        invoice.invoice_currency_code = next_invoice_currency_code
        changed = True
    if Decimal(str(invoice.invoice_amount)) != next_invoice_amount:
        invoice.invoice_amount = next_invoice_amount
        changed = True
    if invoice.status != next_status:
        invoice.status = next_status
        changed = True
    if _coerce_utc(invoice.issued_at) != next_issued_at:
        invoice.issued_at = next_issued_at
        changed = True
    if _coerce_utc(invoice.due_at) != next_due_at:
        invoice.due_at = next_due_at
        changed = True
    if invoice.dispute_reason != next_dispute_reason:
        invoice.dispute_reason = next_dispute_reason
        changed = True
    if invoice.notes != next_notes:
        invoice.notes = next_notes
        changed = True

    if changed:
        invoice.updated_at = reference_time
        invoice.updated_by = actor_id
        invoice.version += 1

    workflow_item = _sync_invoice_projection(
        db,
        trade=trade,
        invoice=invoice,
        actor_id=actor_id,
        now=reference_time,
    )
    synchronize_trade_payment_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    return _to_out(invoice, trade, workflow_item, now=reference_time)
