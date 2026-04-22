from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

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
from apps.api.app.domains.operations.services.workflow_items import SYSTEM_WORKFLOW_ACTOR
from apps.api.app.domains.operations.services.workflow_items import set_trade_workflow_item_projection
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.operations import OperationalRowActionStateOut
from apps.api.app.schemas.settlement import TradePaymentOut
from apps.api.app.shared.enums import InvoiceStatus
from apps.api.app.shared.enums import PaymentStatus
from apps.api.app.shared.enums import SettlementStatus
from apps.api.app.shared.enums import TradeWorkflowType

ZERO = Decimal("0")


@dataclass(frozen=True)
class PaymentListRequest(OperationalResourceListRequest):
    trade_id: str | None = None
    invoice_id: int | None = None


@dataclass(frozen=True)
class PaymentListContext:
    payments_by_invoice_id: dict[int, list[TradePayment]]


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_optional_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _normalize_required_text(value: object | None, *, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{field_name} is required.")
    return normalized


def _normalize_payment_reference(
    value: object | None,
    *,
    trade: Trade,
    sequence_number: int,
) -> str:
    normalized = str(value or "").strip().upper()
    return normalized or f"PAY-{trade.trade_id}-{sequence_number}"


def _normalize_payment_currency_code(value: object | None, *, invoice: TradeInvoice, trade: Trade) -> str:
    normalized = str(value or invoice.invoice_currency_code or trade.trade_currency_code or "USD").strip().upper()
    if not normalized:
        raise ValueError("Payment currency is required.")
    return normalized


def _payment_currency_matches_invoice(payment_currency_code: object | None, *, invoice: TradeInvoice) -> bool:
    normalized_payment_currency = str(payment_currency_code or "").strip().upper()
    normalized_invoice_currency = str(invoice.invoice_currency_code or "").strip().upper()
    return bool(normalized_payment_currency) and normalized_payment_currency == normalized_invoice_currency


def _validate_payment_currency_matches_invoice(payment_currency_code: str, *, invoice: TradeInvoice) -> None:
    if _payment_currency_matches_invoice(payment_currency_code, invoice=invoice):
        return
    raise ValueError(
        f"Payment currency '{payment_currency_code}' must match invoice currency "
        f"'{invoice.invoice_currency_code}' until explicit FX application is supported."
    )


def _normalize_payment_amount(value: object | None, *, invoice: TradeInvoice) -> Decimal:
    candidate = value if value is not None else invoice.invoice_amount
    try:
        normalized = Decimal(str(candidate))
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError("Payment amount must be a numeric value.") from exc

    if normalized <= ZERO:
        raise ValueError("Payment amount must be greater than zero.")
    return normalized


def _normalize_payment_status(value: object | None) -> str:
    normalized = _normalize_required_text(value, field_name="Payment status").upper()
    valid_values = tuple(payment_status.value for payment_status in PaymentStatus)
    if normalized not in valid_values:
        raise ValueError(
            f"Payment status '{normalized}' is invalid. Expected one of: {', '.join(valid_values)}."
        )
    return normalized


def _normalize_due_at(value: datetime | None, *, invoice: TradeInvoice) -> datetime:
    normalized = _coerce_utc(value) or _coerce_utc(invoice.due_at)
    if normalized is None:
        raise ValueError("Payment due timestamp is required.")
    return normalized


def _normalize_received_at(value: datetime | None) -> Optional[datetime]:
    return _coerce_utc(value)


def _base_due_status(*, due_at: datetime, now: datetime) -> str:
    if due_at.date() < now.date():
        return PaymentStatus.OVERDUE.value
    if due_at <= now:
        return PaymentStatus.DUE.value
    return PaymentStatus.PENDING.value


def _effective_payment_status(payment: TradePayment, *, now: datetime) -> str:
    if _coerce_utc(payment.received_at) is not None or payment.status == PaymentStatus.PAID.value:
        return PaymentStatus.PAID.value
    if payment.status == PaymentStatus.NOT_REQUIRED.value:
        return PaymentStatus.NOT_REQUIRED.value
    if payment.status in {PaymentStatus.DUE.value, PaymentStatus.OVERDUE.value}:
        return payment.status
    due_at = _coerce_utc(payment.due_at) or now
    return _base_due_status(due_at=due_at, now=now)


@dataclass
class PaymentProjection:
    payment_status: str
    settlement_status: str
    next_due_at: datetime | None
    total_paid_amount: Decimal
    outstanding_amount: Decimal
    note: str | None


def _audit_payment_payload(payment: TradePaymentOut) -> dict[str, object]:
    return payment.model_dump(mode="json")


def _payment_reserves_invoice_balance(
    *,
    payment_status: str,
) -> bool:
    return payment_status != PaymentStatus.NOT_REQUIRED.value


def _payment_applies_to_invoice(
    payment: TradePayment,
    *,
    invoice: TradeInvoice,
) -> bool:
    return (
        _payment_reserves_invoice_balance(payment_status=payment.status)
        and _payment_currency_matches_invoice(payment.payment_currency_code, invoice=invoice)
    )


def _sum_reserved_invoice_payment_amount(
    payments: list[TradePayment],
    *,
    invoice: TradeInvoice,
    exclude_payment_id: int | None = None,
) -> Decimal:
    return sum(
        (
            Decimal(str(payment.payment_amount))
            for payment in payments
            if (exclude_payment_id is None or payment.id != exclude_payment_id)
            and _payment_applies_to_invoice(payment, invoice=invoice)
        ),
        start=ZERO,
    )


def _validate_payment_amount_within_invoice_balance(
    *,
    invoice: TradeInvoice,
    payments: list[TradePayment],
    next_payment_amount: Decimal,
    next_payment_status: str,
    next_payment_currency_code: str,
    exclude_payment_id: int | None = None,
    current_payment: TradePayment | None = None,
) -> None:
    if not _payment_reserves_invoice_balance(payment_status=next_payment_status):
        return
    if not _payment_currency_matches_invoice(next_payment_currency_code, invoice=invoice):
        return

    invoice_amount = Decimal(str(invoice.invoice_amount))
    reserved_amount = _sum_reserved_invoice_payment_amount(
        payments,
        invoice=invoice,
        exclude_payment_id=exclude_payment_id,
    )
    remaining_open_balance = invoice_amount - reserved_amount

    if next_payment_amount <= remaining_open_balance:
        return

    if current_payment is not None:
        current_payment_amount = Decimal(str(current_payment.payment_amount))
        if (
            current_payment_amount == next_payment_amount
            and current_payment.status == next_payment_status
            and current_payment.payment_currency_code == next_payment_currency_code
        ):
            return

    display_remaining_open_balance = max(remaining_open_balance, ZERO)
    raise ValueError(
        f"Payment amount {next_payment_amount:.2f} exceeds the remaining open balance of "
        f"{invoice.invoice_currency_code} {display_remaining_open_balance:.2f}."
    )


def derive_invoice_payment_projection(
    *,
    invoice: TradeInvoice,
    payments: list[TradePayment],
    now: datetime,
) -> PaymentProjection:
    invoice_amount = Decimal(str(invoice.invoice_amount))
    applicable_payments = [payment for payment in payments if _payment_applies_to_invoice(payment, invoice=invoice)]
    paid_payments = [
        payment
        for payment in applicable_payments
        if _effective_payment_status(payment, now=now) == PaymentStatus.PAID.value
    ]
    total_paid_amount = sum((Decimal(str(payment.payment_amount)) for payment in paid_payments), start=ZERO)
    outstanding_amount = (
        ZERO
        if invoice.status == InvoiceStatus.NOT_REQUIRED.value
        else max(invoice_amount - total_paid_amount, ZERO)
    )

    unpaid_due_dates = [
        _coerce_utc(payment.due_at)
        for payment in applicable_payments
        if _effective_payment_status(payment, now=now) != PaymentStatus.PAID.value
    ]
    unpaid_due_dates = [value for value in unpaid_due_dates if value is not None]
    next_due_at = min(unpaid_due_dates) if unpaid_due_dates else _coerce_utc(invoice.due_at)
    due_status = _base_due_status(due_at=next_due_at or now, now=now)

    if invoice.status == InvoiceStatus.DISPUTED.value:
        payment_status = due_status if outstanding_amount > ZERO else PaymentStatus.PAID.value
        settlement_status = SettlementStatus.DISPUTED.value
    elif outstanding_amount <= ZERO and payments:
        payment_status = PaymentStatus.PAID.value
        settlement_status = SettlementStatus.SETTLED.value
    elif total_paid_amount > ZERO:
        payment_status = due_status
        settlement_status = SettlementStatus.PARTIALLY_SETTLED.value
    elif invoice.status == InvoiceStatus.NOT_REQUIRED.value:
        payment_status = PaymentStatus.NOT_REQUIRED.value
        settlement_status = SettlementStatus.SETTLED.value
    else:
        payment_status = due_status
        if invoice.status in {InvoiceStatus.ISSUED.value, InvoiceStatus.APPROVED.value}:
            settlement_status = SettlementStatus.INVOICED.value
        else:
            settlement_status = SettlementStatus.PENDING.value

    note = None
    if outstanding_amount > ZERO:
        note = (
            f"Outstanding {invoice.invoice_currency_code} {outstanding_amount:.2f} "
            f"of {invoice.invoice_currency_code} {invoice_amount:.2f}."
        )
    elif total_paid_amount > ZERO:
        note = f"Paid {invoice.invoice_currency_code} {total_paid_amount:.2f}."

    return PaymentProjection(
        payment_status=payment_status,
        settlement_status=settlement_status,
        next_due_at=next_due_at,
        total_paid_amount=total_paid_amount,
        outstanding_amount=outstanding_amount,
        note=note,
    )


def _aggregate_trade_payment_note(
    *,
    invoices: list[TradeInvoice],
    total_paid_amount: Decimal,
    total_outstanding_amount: Decimal,
) -> str | None:
    if not invoices:
        return None

    currencies = sorted({invoice.invoice_currency_code for invoice in invoices if invoice.invoice_currency_code})
    if total_outstanding_amount > ZERO:
        if len(currencies) == 1:
            return (
                f"Outstanding {currencies[0]} {total_outstanding_amount:.2f} "
                f"across {len(invoices)} invoice(s)."
            )
        return f"Outstanding balances remain across {len(invoices)} invoice(s)."

    if total_paid_amount > ZERO:
        if len(currencies) == 1:
            return f"Paid {currencies[0]} {total_paid_amount:.2f} across {len(invoices)} invoice(s)."
        return f"Paid balances recorded across {len(invoices)} invoice(s)."

    if all(invoice.status == InvoiceStatus.NOT_REQUIRED.value for invoice in invoices):
        return "No cash settlement is required for the recorded invoices."
    return None


def derive_trade_payment_projection(
    *,
    invoices: list[TradeInvoice],
    payments_by_invoice_id: dict[int, list[TradePayment]],
    now: datetime,
) -> PaymentProjection:
    if not invoices:
        return PaymentProjection(
            payment_status=PaymentStatus.PENDING.value,
            settlement_status=SettlementStatus.PENDING.value,
            next_due_at=None,
            total_paid_amount=ZERO,
            outstanding_amount=ZERO,
            note=None,
        )

    projections = [
        derive_invoice_payment_projection(
            invoice=invoice,
            payments=payments_by_invoice_id.get(invoice.id, []),
            now=now,
        )
        for invoice in invoices
    ]
    total_paid_amount = sum((projection.total_paid_amount for projection in projections), start=ZERO)
    total_outstanding_amount = sum((projection.outstanding_amount for projection in projections), start=ZERO)
    next_due_dates = [
        projection.next_due_at
        for projection in projections
        if projection.next_due_at is not None and projection.outstanding_amount > ZERO
    ]
    next_due_at = min(next_due_dates) if next_due_dates else None
    has_disputed_invoice = any(invoice.status == InvoiceStatus.DISPUTED.value for invoice in invoices)

    if total_outstanding_amount <= ZERO:
        payment_status = (
            PaymentStatus.NOT_REQUIRED.value
            if all(invoice.status == InvoiceStatus.NOT_REQUIRED.value for invoice in invoices)
            else PaymentStatus.PAID.value
        )
        settlement_status = (
            SettlementStatus.DISPUTED.value if has_disputed_invoice else SettlementStatus.SETTLED.value
        )
    else:
        open_projections = [projection for projection in projections if projection.outstanding_amount > ZERO]
        if any(projection.payment_status == PaymentStatus.OVERDUE.value for projection in open_projections):
            payment_status = PaymentStatus.OVERDUE.value
        elif any(projection.payment_status == PaymentStatus.DUE.value for projection in open_projections):
            payment_status = PaymentStatus.DUE.value
        elif all(projection.payment_status == PaymentStatus.NOT_REQUIRED.value for projection in open_projections):
            payment_status = PaymentStatus.NOT_REQUIRED.value
        else:
            payment_status = PaymentStatus.PENDING.value

        if has_disputed_invoice:
            settlement_status = SettlementStatus.DISPUTED.value
        elif total_paid_amount > ZERO:
            settlement_status = SettlementStatus.PARTIALLY_SETTLED.value
        elif any(invoice.status in {InvoiceStatus.ISSUED.value, InvoiceStatus.APPROVED.value} for invoice in invoices):
            settlement_status = SettlementStatus.INVOICED.value
        else:
            settlement_status = SettlementStatus.PENDING.value

    return PaymentProjection(
        payment_status=payment_status,
        settlement_status=settlement_status,
        next_due_at=next_due_at,
        total_paid_amount=total_paid_amount,
        outstanding_amount=total_outstanding_amount,
        note=_aggregate_trade_payment_note(
            invoices=invoices,
            total_paid_amount=total_paid_amount,
            total_outstanding_amount=total_outstanding_amount,
        ),
    )


def _payment_row(
    db: Session,
    *,
    payment_id: int,
) -> tuple[TradePayment, TradeInvoice, Trade, TradeWorkflowItem | None] | None:
    return db.execute(
        select(TradePayment, TradeInvoice, Trade, TradeWorkflowItem)
        .join(TradeInvoice, TradeInvoice.id == TradePayment.invoice_id)
        .join(Trade, Trade.trade_id == TradePayment.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            (TradeWorkflowItem.trade_id == TradePayment.trade_id)
            & (TradeWorkflowItem.workflow_type == TradeWorkflowType.PAYMENT.value),
        )
        .where(
            TradePayment.id == payment_id,
            Trade.status == "ACTIVE",
        )
    ).first()


def trade_has_payment_records(db: Session, *, trade_id: str) -> bool:
    return (
        db.execute(select(TradePayment.id).where(TradePayment.trade_id == trade_id).limit(1)).scalar_one_or_none()
        is not None
    )


def synchronize_trade_payment_projection(
    db: Session,
    *,
    trade: Trade,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    now: Optional[datetime] = None,
) -> TradeWorkflowItem | None:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    invoices = db.execute(
        select(TradeInvoice)
        .where(TradeInvoice.trade_id == trade.trade_id)
        .order_by(TradeInvoice.created_at.asc(), TradeInvoice.id.asc())
    ).scalars().all()
    if not invoices:
        return None

    payments = db.execute(
        select(TradePayment)
        .where(TradePayment.trade_id == trade.trade_id)
        .order_by(TradePayment.due_at.asc(), TradePayment.created_at.asc(), TradePayment.id.asc())
    ).scalars().all()
    payments_by_invoice_id: dict[int, list[TradePayment]] = {}
    for payment in payments:
        payments_by_invoice_id.setdefault(payment.invoice_id, []).append(payment)

    projection = derive_trade_payment_projection(
        invoices=invoices,
        payments_by_invoice_id=payments_by_invoice_id,
        now=reference_time,
    )
    workflow_item = set_trade_workflow_item_projection(
        db,
        trade=trade,
        workflow_type=TradeWorkflowType.PAYMENT.value,
        status=projection.payment_status,
        actor_id=actor_id,
        now=reference_time,
        due_at=projection.next_due_at,
        notes=projection.note,
    )

    changed = False
    if trade.payment_status != projection.payment_status:
        trade.payment_status = projection.payment_status
        changed = True
    if trade.settlement_status != projection.settlement_status:
        trade.settlement_status = projection.settlement_status
        changed = True
    if changed:
        trade.updated_at = reference_time
    db.flush()
    return workflow_item


def _to_out(
    payment: TradePayment,
    invoice: TradeInvoice,
    trade: Trade,
    workflow_item: TradeWorkflowItem | None,
    *,
    payments_for_invoice: list[TradePayment],
    now: Optional[datetime] = None,
) -> TradePaymentOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    projection = derive_invoice_payment_projection(
        invoice=invoice,
        payments=payments_for_invoice,
        now=reference_time,
    )
    due_at = _coerce_utc(payment.due_at) or reference_time
    received_at = _coerce_utc(payment.received_at)
    effective_status = _effective_payment_status(payment, now=reference_time)
    is_overdue = effective_status == PaymentStatus.OVERDUE.value
    mark_paid_blocked_reason = (
        "This payment record is already marked as paid."
        if effective_status == PaymentStatus.PAID.value
        else None
    )

    return TradePaymentOut(
        payment_id=payment.id,
        trade_id=payment.trade_id,
        invoice_id=payment.invoice_id,
        invoice_number=invoice.invoice_number,
        payment_reference=payment.payment_reference,
        payment_currency_code=payment.payment_currency_code,
        payment_amount=float(payment.payment_amount),
        status=effective_status,
        due_at=due_at,
        received_at=received_at,
        notes=payment.notes,
        created_at=_coerce_utc(payment.created_at) or reference_time,
        created_by=payment.created_by,
        updated_at=_coerce_utc(payment.updated_at) or reference_time,
        updated_by=payment.updated_by,
        version=payment.version,
        workflow_item_id=workflow_item.id if workflow_item is not None else None,
        workflow_owner=workflow_item.owner if workflow_item is not None else None,
        is_overdue=is_overdue,
        age_days=max(0, int((reference_time - (_coerce_utc(payment.created_at) or reference_time)).total_seconds() // 86_400)),
        invoice_amount=float(invoice.invoice_amount),
        total_paid_amount=float(projection.total_paid_amount),
        outstanding_amount=float(projection.outstanding_amount),
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
        invoice_status=invoice.status,
        settlement_status=projection.settlement_status,
        action_states=[
            OperationalRowActionStateOut(key="save"),
            OperationalRowActionStateOut(
                key="markPaid",
                available=mark_paid_blocked_reason is None,
                blocked_reason=mark_paid_blocked_reason,
            ),
        ],
    )


def _load_trade_payment_rows(
    db: Session,
    request: PaymentListRequest,
) -> list[tuple[TradePayment, TradeInvoice, Trade, TradeWorkflowItem | None]]:
    stmt = (
        select(TradePayment, TradeInvoice, Trade, TradeWorkflowItem)
        .join(TradeInvoice, TradeInvoice.id == TradePayment.invoice_id)
        .join(Trade, Trade.trade_id == TradePayment.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            (TradeWorkflowItem.trade_id == TradePayment.trade_id)
            & (TradeWorkflowItem.workflow_type == TradeWorkflowType.PAYMENT.value),
        )
        .where(Trade.status == "ACTIVE")
        .order_by(Trade.trade_id.asc(), TradePayment.due_at.asc(), TradePayment.id.asc())
    )
    if request.trade_id:
        stmt = stmt.where(TradePayment.trade_id == request.trade_id)
    if request.invoice_id is not None:
        stmt = stmt.where(TradePayment.invoice_id == request.invoice_id)
    if request.offset:
        stmt = stmt.offset(request.offset)
    if request.limit is not None:
        stmt = stmt.limit(request.limit)
    return list(db.execute(stmt).all())


def _load_trade_payment_context(
    db: Session,
    rows: list[tuple[TradePayment, TradeInvoice, Trade, TradeWorkflowItem | None]],
    _request: PaymentListRequest,
) -> PaymentListContext:
    invoice_ids = sorted({invoice.id for _payment, invoice, _trade, _workflow_item in rows})
    payments_by_invoice_id: dict[int, list[TradePayment]] = {}
    if invoice_ids:
        all_invoice_payments = db.execute(
            select(TradePayment)
            .where(TradePayment.invoice_id.in_(invoice_ids))
            .order_by(TradePayment.invoice_id.asc(), TradePayment.due_at.asc(), TradePayment.id.asc())
        ).scalars().all()
        for payment in all_invoice_payments:
            payments_by_invoice_id.setdefault(payment.invoice_id, []).append(payment)
    return PaymentListContext(payments_by_invoice_id=payments_by_invoice_id)


def _build_trade_payment_item(
    row: tuple[TradePayment, TradeInvoice, Trade, TradeWorkflowItem | None],
    context: PaymentListContext,
    request: PaymentListRequest,
) -> TradePaymentOut:
    payment, invoice, trade, workflow_item = row
    return _to_out(
        payment,
        invoice,
        trade,
        workflow_item,
        payments_for_invoice=context.payments_by_invoice_id.get(invoice.id, [payment]),
        now=request.reference_time,
    )


TRADE_PAYMENT_RESOURCE_DESCRIPTOR = OperationalResourceDescriptor[
    PaymentListRequest,
    tuple[TradePayment, TradeInvoice, Trade, TradeWorkflowItem | None],
    PaymentListContext,
    TradePaymentOut,
](
    resource_key="payments",
    filters=("trade_id", "invoice_id"),
    sort_fields=("trade_id asc", "due_at asc", "id asc"),
    actions=("create", "update"),
    surface=OperationalResourceSurface(
        title="Payment Ledger",
        description=(
            "Cash collection and settlement now run from dedicated payment records instead of a status-only queue row."
        ),
        board_section="Queue",
        actions=(
            OperationalResourceSurfaceAction(
                key="create",
                label="Add Payment",
                detail="Create the next payment record in the invoice cash-collection chain.",
                permission_message="Sign in to schedule, receive, and reconcile settlement payments.",
            ),
            OperationalResourceSurfaceAction(
                key="save",
                label="Save",
                detail="Persist due date, amount, receipt timing, and note changes on the payment record.",
                permission_message="Sign in to schedule, receive, and reconcile settlement payments.",
            ),
            OperationalResourceSurfaceAction(
                key="markPaid",
                label="Mark Paid",
                detail="Mark the payment as received and stamp the collection timing directly on the ledger.",
                permission_message="Sign in to schedule, receive, and reconcile settlement payments.",
            ),
        ),
        primary_action=OperationalResourcePrimaryAction(
            key="record_payment",
            label="Record payment",
            detail="Capture due dates, receipts, and reconciliation state directly against the invoice payment chain.",
        ),
        empty_state=OperationalResourceEmptyState(
            title="No payment ledger",
            detail="Issued invoices will populate payment records here as collection and reconciliation work opens.",
        ),
        summary_stats=(
            OperationalResourceSummaryStat(
                key="cash_due",
                label="Cash due",
                detail="Keep due and upcoming receipts visible before collection timing slips through the queue.",
            ),
            OperationalResourceSummaryStat(
                key="overdue_receipts",
                label="Overdue receipts",
                detail="Escalate late payments and missing receipts inside the same ledger that tracks updates and notes.",
            ),
            OperationalResourceSummaryStat(
                key="reconciliation_state",
                label="Reconciliation",
                detail="Treat received, cleared, and disputed cash as explicit records instead of derived payment status only.",
            ),
        ),
    ),
    load_rows=_load_trade_payment_rows,
    load_context=_load_trade_payment_context,
    build_item=_build_trade_payment_item,
)


def list_trade_payments(
    db: Session,
    *,
    trade_id: str | None = None,
    invoice_id: int | None = None,
    limit: int | None = None,
    offset: int = 0,
    now: Optional[datetime] = None,
) -> list[TradePaymentOut]:
    return load_operational_resource_items(
        TRADE_PAYMENT_RESOURCE_DESCRIPTOR,
        db,
        PaymentListRequest(
            reference_time=_coerce_utc(now) or datetime.now(timezone.utc),
            trade_id=trade_id,
            invoice_id=invoice_id,
            limit=limit,
            offset=offset,
        ),
    )


def create_trade_payment(
    db: Session,
    *,
    invoice_id: int,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    payment_reference: object | None = None,
    payment_currency_code: object | None = None,
    payment_amount: object | None = None,
    status: object | None = None,
    due_at: datetime | None = None,
    received_at: datetime | None = None,
    notes: object | None = None,
    now: Optional[datetime] = None,
) -> TradePaymentOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = db.execute(
        select(TradeInvoice, Trade)
        .join(Trade, Trade.trade_id == TradeInvoice.trade_id)
        .where(
            TradeInvoice.id == invoice_id,
            Trade.status == "ACTIVE",
        )
    ).first()
    if row is None:
        raise LookupError(f"Invoice '{invoice_id}' was not found.")

    invoice, trade = row
    existing_payments = db.execute(
        select(TradePayment)
        .where(TradePayment.invoice_id == invoice_id)
        .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
    ).scalars().all()
    next_due_at = _normalize_due_at(due_at, invoice=invoice)
    next_received_at = _normalize_received_at(received_at)
    next_status = _normalize_payment_status(status) if status is not None else _base_due_status(due_at=next_due_at, now=reference_time)
    next_payment_currency_code = _normalize_payment_currency_code(payment_currency_code, invoice=invoice, trade=trade)
    _validate_payment_currency_matches_invoice(next_payment_currency_code, invoice=invoice)
    next_payment_amount = _normalize_payment_amount(payment_amount, invoice=invoice)

    if next_received_at is not None:
        next_status = PaymentStatus.PAID.value
    elif next_status == PaymentStatus.PAID.value:
        next_received_at = reference_time

    _validate_payment_amount_within_invoice_balance(
        invoice=invoice,
        payments=existing_payments,
        next_payment_amount=next_payment_amount,
        next_payment_status=next_status,
        next_payment_currency_code=next_payment_currency_code,
    )

    payment = TradePayment(
        trade_id=trade.trade_id,
        invoice_id=invoice.id,
        payment_reference=_normalize_payment_reference(
            payment_reference,
            trade=trade,
            sequence_number=len(existing_payments) + 1,
        ),
        payment_currency_code=next_payment_currency_code,
        payment_amount=next_payment_amount,
        status=next_status,
        due_at=next_due_at,
        received_at=next_received_at,
        notes=_normalize_optional_text(notes),
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    db.add(payment)
    db.flush()
    workflow_item = synchronize_trade_payment_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    payments = db.execute(
        select(TradePayment)
        .where(TradePayment.invoice_id == invoice.id)
        .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
    ).scalars().all()
    payment_out = _to_out(payment, invoice, trade, workflow_item, payments_for_invoice=payments, now=reference_time)
    append_trade_audit_event(
        db,
        trade_id=payment_out.trade_id,
        actor_id=actor_id,
        event_type="TradePaymentCreated",
        occurred_at=payment_out.updated_at,
        causation_id=f"trade-payment:{payment_out.payment_id}",
        payload={
            "request": jsonable_encoder(
                {
                    key: value
                    for key, value in {
                        "invoice_id": invoice_id,
                        "payment_reference": payment_reference,
                        "payment_currency_code": payment_currency_code,
                        "payment_amount": payment_amount,
                        "status": status,
                        "due_at": due_at,
                        "received_at": received_at,
                        "notes": notes,
                    }.items()
                    if value is not None
                }
            ),
            "payment": _audit_payment_payload(payment_out),
        },
    )
    return payment_out


def update_trade_payment(
    db: Session,
    *,
    payment_id: int,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> TradePaymentOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = _payment_row(db, payment_id=payment_id)
    if row is None:
        raise LookupError(f"Payment '{payment_id}' was not found.")

    payment, invoice, trade, _ = row
    existing_payments = db.execute(
        select(TradePayment)
        .where(TradePayment.invoice_id == invoice.id)
        .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
    ).scalars().all()

    next_payment_reference = payment.payment_reference
    next_payment_currency_code = payment.payment_currency_code
    next_payment_amount = Decimal(str(payment.payment_amount))
    next_status = payment.status
    next_due_at = _coerce_utc(payment.due_at) or reference_time
    next_received_at = _coerce_utc(payment.received_at)
    next_notes = payment.notes

    if "payment_reference" in changes:
        next_payment_reference = _normalize_payment_reference(
            changes.get("payment_reference"),
            trade=trade,
            sequence_number=max(len(existing_payments), 1),
        )
    if "payment_currency_code" in changes:
        next_payment_currency_code = _normalize_payment_currency_code(
            changes.get("payment_currency_code"),
            invoice=invoice,
            trade=trade,
        )
    if "payment_amount" in changes:
        next_payment_amount = _normalize_payment_amount(changes.get("payment_amount"), invoice=invoice)
    if "status" in changes:
        next_status = _normalize_payment_status(changes.get("status"))
    if "due_at" in changes:
        next_due_at = _normalize_due_at(changes.get("due_at"), invoice=invoice)  # type: ignore[arg-type]
    if "received_at" in changes:
        next_received_at = _normalize_received_at(changes.get("received_at"))  # type: ignore[arg-type]
    if "notes" in changes:
        next_notes = _normalize_optional_text(changes.get("notes"))

    if next_received_at is not None:
        next_status = PaymentStatus.PAID.value
    elif next_status == PaymentStatus.PAID.value:
        next_received_at = reference_time
    else:
        next_received_at = None

    _validate_payment_currency_matches_invoice(next_payment_currency_code, invoice=invoice)
    _validate_payment_amount_within_invoice_balance(
        invoice=invoice,
        payments=existing_payments,
        next_payment_amount=next_payment_amount,
        next_payment_status=next_status,
        next_payment_currency_code=next_payment_currency_code,
        exclude_payment_id=payment.id,
        current_payment=payment,
    )

    changed = False
    if payment.payment_reference != next_payment_reference:
        payment.payment_reference = next_payment_reference
        changed = True
    if payment.payment_currency_code != next_payment_currency_code:
        payment.payment_currency_code = next_payment_currency_code
        changed = True
    if Decimal(str(payment.payment_amount)) != next_payment_amount:
        payment.payment_amount = next_payment_amount
        changed = True
    if payment.status != next_status:
        payment.status = next_status
        changed = True
    if _coerce_utc(payment.due_at) != next_due_at:
        payment.due_at = next_due_at
        changed = True
    if _coerce_utc(payment.received_at) != next_received_at:
        payment.received_at = next_received_at
        changed = True
    if payment.notes != next_notes:
        payment.notes = next_notes
        changed = True

    if changed:
        payment.updated_at = reference_time
        payment.updated_by = actor_id
        payment.version += 1

    workflow_item = synchronize_trade_payment_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    payments = db.execute(
        select(TradePayment)
        .where(TradePayment.invoice_id == invoice.id)
        .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
    ).scalars().all()
    payment_out = _to_out(payment, invoice, trade, workflow_item, payments_for_invoice=payments, now=reference_time)
    append_trade_audit_event(
        db,
        trade_id=payment_out.trade_id,
        actor_id=actor_id,
        event_type="TradePaymentUpdated",
        occurred_at=payment_out.updated_at,
        causation_id=f"trade-payment:{payment_out.payment_id}",
        payload={
            "requested_changes": jsonable_encoder(changes),
            "payment": _audit_payment_payload(payment_out),
        },
    )
    return payment_out
