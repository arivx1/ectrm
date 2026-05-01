from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.actualizations import (
    build_delivery_actualization_projection,
)
from apps.api.app.domains.operations.services.audit_events import append_trade_audit_event
from apps.api.app.domains.operations.services.actualizations import delivery_targets_for_trade
from apps.api.app.domains.operations.services.actualizations import list_trade_actualizations_by_delivery_id
from apps.api.app.domains.operations.services.actualizations import load_delivery_target
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
from apps.api.app.domains.operations.services.settlement_payments import (
    derive_invoice_payment_projection,
)
from apps.api.app.domains.operations.services.settlement_payments import (
    synchronize_trade_payment_projection,
)
from apps.api.app.domains.operations.services.trade_credit_hold import (
    format_trade_credit_hold_message,
)
from apps.api.app.domains.operations.services.trade_credit_hold import get_trade_credit_hold_state
from apps.api.app.domains.operations.services.workflow_items import SYSTEM_WORKFLOW_ACTOR
from apps.api.app.domains.operations.services.workflow_items import set_trade_workflow_item_projection
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.operations import OperationalRowActionStateOut
from apps.api.app.schemas.settlement import TradeInvoiceOut
from apps.api.app.shared.enums import InvoiceStatus
from apps.api.app.shared.enums import PaymentStatus
from apps.api.app.shared.enums import SettlementStatus
from apps.api.app.shared.enums import TradeNature
from apps.api.app.shared.enums import TradeStatus
from apps.api.app.shared.enums import TradeWorkflowType

ZERO = Decimal("0")


@dataclass(frozen=True)
class InvoiceScope:
    delivery_id: str | None
    leg_no: int | None
    quantity_unit_code: str | None
    actualized_quantity: Decimal | None
    already_billed_quantity: Decimal


@dataclass(frozen=True)
class TradeInvoiceProjection:
    status: str
    due_at: datetime | None
    notes: str | None


@dataclass(frozen=True)
class InvoiceListRequest(OperationalResourceListRequest):
    trade_id: str | None = None


@dataclass(frozen=True)
class InvoiceListContext:
    payments_by_invoice_id: dict[int, list[TradePayment]]


@dataclass(frozen=True)
class InvoiceIssueCandidate:
    trade_id: str
    trade_nature: str
    book: str
    portfolio: str | None
    counterparty: str | None
    commodity_class: str
    commodity: str
    trader_user: str | None
    trade_date: date | None
    execution_timestamp: datetime | None
    delivery_start: date | None
    delivery_end: date | None
    trade_currency_code: str | None
    invoice_status: str
    payment_status: str
    settlement_status: str
    notional_amount: Decimal | None
    age_days: int | None
    readiness_status: str
    priority_reason: str
    preview_summary: str
    blocking_reasons: tuple[str, ...]
    assumptions: tuple[str, ...]
    recommended_action: dict[str, object]


def _invoice_issue_candidate_sort_key(candidate: InvoiceIssueCandidate) -> tuple[object, ...]:
    readiness_rank = 2
    if candidate.readiness_status == "READY":
        readiness_rank = 0
    elif candidate.readiness_status == "BLOCKED":
        readiness_rank = 1
    execution_timestamp = _coerce_utc(candidate.execution_timestamp) or datetime.max.replace(tzinfo=timezone.utc)
    age_sort = (1, 0) if candidate.age_days is None else (0, -candidate.age_days)
    return (
        readiness_rank,
        age_sort,
        execution_timestamp,
        candidate.trade_id,
    )


def _invoice_issue_candidate_priority_reason(candidate: InvoiceIssueCandidate) -> str:
    if candidate.readiness_status == "READY":
        return "Ready-to-issue invoice candidates rise before blocked previews."
    if candidate.readiness_status == "BLOCKED":
        return "Blocked invoice previews follow ready rows; older blocked items rise first."
    return "Older invoice issue candidates rise first once readiness is equal."


def _audit_invoice_payload(invoice: TradeInvoiceOut) -> dict[str, object]:
    return invoice.model_dump(mode="json")


def _coerce_utc(value: datetime | str | None) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        value = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
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


def _append_note(existing: str | None, addition: str | None) -> str | None:
    normalized_addition = _normalize_optional_text(addition)
    if normalized_addition is None:
        return existing
    if not existing:
        return normalized_addition
    if normalized_addition in existing:
        return existing
    return f"{existing}\n{normalized_addition}"


def _payment_is_paid(payment: TradePayment) -> bool:
    return _coerce_utc(payment.received_at) is not None or payment.status == PaymentStatus.PAID.value


def _normalize_currency_code(value: object | None, *, trade: Trade) -> str:
    normalized = str(value or trade.trade_currency_code or "USD").strip().upper()
    if not normalized:
        raise ValueError("Invoice currency is required.")
    return normalized


def _to_decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (ArithmeticError, InvalidOperation):
        return None


def _normalize_positive_quantity(value: object | None, *, field_name: str) -> Decimal:
    try:
        normalized = Decimal(str(value))
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError(f"{field_name} must be a numeric value.") from exc

    if normalized <= ZERO:
        raise ValueError(f"{field_name} must be greater than zero.")
    return normalized


def _trade_invoices(db: Session, *, trade_id: str) -> list[TradeInvoice]:
    return db.execute(
        select(TradeInvoice)
        .where(TradeInvoice.trade_id == trade_id)
        .order_by(TradeInvoice.created_at.asc(), TradeInvoice.id.asc())
    ).scalars().all()


def _default_invoice_number(trade: Trade, *, sequence_number: int) -> str:
    if sequence_number <= 1:
        return f"INV-{trade.trade_id}"
    return f"INV-{trade.trade_id}-{sequence_number}"


def _normalize_invoice_number(
    value: object | None,
    *,
    trade: Trade,
    existing_invoices: list[TradeInvoice],
    current_invoice_id: int | None = None,
) -> str:
    normalized = str(value or "").strip().upper()
    if not normalized:
        sequence_number = len([invoice for invoice in existing_invoices if invoice.id != current_invoice_id]) + 1
        normalized = _default_invoice_number(trade, sequence_number=sequence_number)

    duplicate = next(
        (
            invoice
            for invoice in existing_invoices
            if invoice.id != current_invoice_id and invoice.invoice_number == normalized
        ),
        None,
    )
    if duplicate is not None:
        raise ValueError(
            f"Invoice number '{normalized}' is already in use for trade '{trade.trade_id}'."
        )
    return normalized


def _trade_notional_amount(trade: Trade) -> Decimal | None:
    if trade.price is None or trade.volume is None:
        return None
    try:
        return abs(Decimal(str(trade.price)) * Decimal(str(trade.volume)))
    except (ArithmeticError, InvalidOperation):
        return None


def _invoice_amount_from_quantity(trade: Trade, *, billed_quantity: Decimal | None) -> Decimal | None:
    if billed_quantity is None or trade.price is None:
        return None
    try:
        return abs(Decimal(str(trade.price)) * billed_quantity)
    except (ArithmeticError, InvalidOperation):
        return None


def _normalize_invoice_amount(
    value: object | None,
    *,
    trade: Trade,
    billed_quantity: Decimal | None,
) -> Decimal:
    candidate = value
    if candidate is None and billed_quantity is not None:
        candidate = _invoice_amount_from_quantity(trade, billed_quantity=billed_quantity)
        if candidate is None:
            raise ValueError(
                "Invoice amount could not be derived from billed quantity because the trade price is unavailable. "
                "Provide invoice_amount explicitly."
            )
    if candidate is None:
        candidate = _trade_notional_amount(trade)
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
        trade.delivery_end or trade.effective_end_date or trade.delivery_start or trade.trade_date
    )
    if candidate is None or candidate < issued_at:
        return issued_at + timedelta(days=5)
    return candidate


def _default_issued_at(
    due_at: datetime | None,
    fallback: datetime,
) -> datetime:
    normalized_due_at = _coerce_utc(due_at)
    if normalized_due_at is None:
        return fallback
    return min(normalized_due_at, fallback)


def _normalize_issued_at(
    value: datetime | None,
    *,
    due_at: datetime | None,
    fallback: datetime,
) -> datetime:
    return _coerce_utc(value) or _default_issued_at(due_at=due_at, fallback=fallback)


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


def _scope_label(scope: InvoiceScope) -> str:
    if scope.leg_no is not None:
        return f"leg {scope.leg_no}"
    return "delivery"


def _remaining_actualized_quantity(scope: InvoiceScope) -> Decimal | None:
    if scope.actualized_quantity is None:
        return None
    return max(scope.actualized_quantity - scope.already_billed_quantity, ZERO)


def _resolve_invoice_scope(
    db: Session,
    *,
    trade: Trade,
    leg_no: int | None,
    existing_invoices: list[TradeInvoice],
    invoice_amount_provided: bool,
    billed_quantity_provided: bool,
) -> InvoiceScope:
    if trade.trade_nature != TradeNature.PHYSICAL.value:
        if leg_no is not None:
            raise ValueError("Leg-scoped invoicing is only supported for physical trades.")
        return InvoiceScope(
            delivery_id=None,
            leg_no=None,
            quantity_unit_code=None,
            actualized_quantity=None,
            already_billed_quantity=ZERO,
        )

    target = None
    if leg_no is not None:
        target = load_delivery_target(db, trade_id=trade.trade_id, leg_no=leg_no)
    else:
        targets = delivery_targets_for_trade(db, trade=trade)
        if len(targets) == 1:
            target = targets[0]
        elif billed_quantity_provided or not invoice_amount_provided:
            raise ValueError(
                f"Trade '{trade.trade_id}' has leg-level delivery obligations. "
                "Provide a leg number to bill actualized quantity."
            )

    if target is None:
        return InvoiceScope(
            delivery_id=None,
            leg_no=None,
            quantity_unit_code=None,
            actualized_quantity=None,
            already_billed_quantity=ZERO,
        )

    actualizations_by_delivery_id = list_trade_actualizations_by_delivery_id(db, trade_ids=[trade.trade_id])
    projection = build_delivery_actualization_projection(
        trade=trade,
        leg=target.leg,
        actualization=actualizations_by_delivery_id.get(target.delivery_id),
    )
    already_billed_quantity = sum(
        (
            _to_decimal(invoice.billed_quantity) or ZERO
            for invoice in existing_invoices
            if invoice.delivery_id == target.delivery_id
        ),
        start=ZERO,
    )
    return InvoiceScope(
        delivery_id=target.delivery_id,
        leg_no=target.leg_no,
        quantity_unit_code=target.unit_of_measure,
        actualized_quantity=_to_decimal(projection.actual_quantity),
        already_billed_quantity=already_billed_quantity,
    )


def _normalize_billed_quantity(
    value: object | None,
    *,
    trade: Trade,
    scope: InvoiceScope,
    default_to_remaining_actualized: bool,
) -> Decimal | None:
    if value is None and not default_to_remaining_actualized:
        return None

    if scope.delivery_id is None:
        if value is not None:
            raise ValueError(
                "Billed quantity can only be recorded against a physical delivery invoice scope."
            )
        return None

    remaining_quantity = _remaining_actualized_quantity(scope)
    if value is None:
        if remaining_quantity is None or remaining_quantity <= ZERO:
            raise ValueError(
                f"Trade '{trade.trade_id}' does not have uninvoiced actualized quantity for {_scope_label(scope)}. "
                "Record or expand shipment actualization before issuing a quantity-based invoice."
            )
        return remaining_quantity

    normalized = _normalize_positive_quantity(value, field_name="Billed quantity")
    if remaining_quantity is None or remaining_quantity <= ZERO:
        raise ValueError(
            f"Trade '{trade.trade_id}' does not have uninvoiced actualized quantity for {_scope_label(scope)}. "
            "Record or expand shipment actualization before issuing a quantity-based invoice."
        )
    if normalized > remaining_quantity:
        raise ValueError(
            f"Billed quantity {normalized:.6f} exceeds remaining actualized quantity "
            f"{remaining_quantity:.6f} for {_scope_label(scope)}."
        )
    return normalized


def _load_payments_by_invoice_id(
    db: Session,
    *,
    invoice_ids: list[int],
) -> dict[int, list[TradePayment]]:
    if not invoice_ids:
        return {}

    payments = db.execute(
        select(TradePayment)
        .where(TradePayment.invoice_id.in_(invoice_ids))
        .order_by(TradePayment.invoice_id.asc(), TradePayment.due_at.asc(), TradePayment.id.asc())
    ).scalars().all()

    payments_by_invoice_id: dict[int, list[TradePayment]] = {}
    for payment in payments:
        payments_by_invoice_id.setdefault(payment.invoice_id, []).append(payment)
    return payments_by_invoice_id


def _derive_trade_invoice_projection(invoices: list[TradeInvoice]) -> TradeInvoiceProjection:
    if not invoices:
        return TradeInvoiceProjection(
            status=InvoiceStatus.PENDING.value,
            due_at=None,
            notes=None,
        )

    disputed_invoices = [invoice for invoice in invoices if invoice.status == InvoiceStatus.DISPUTED.value]
    if disputed_invoices:
        due_at = min((_coerce_utc(invoice.due_at) or datetime.max.replace(tzinfo=timezone.utc)) for invoice in disputed_invoices)
        if len(disputed_invoices) == 1 and len(invoices) == 1:
            return TradeInvoiceProjection(
                status=InvoiceStatus.DISPUTED.value,
                due_at=due_at,
                notes=_workflow_note_for_invoice(disputed_invoices[0]),
            )
        return TradeInvoiceProjection(
            status=InvoiceStatus.DISPUTED.value,
            due_at=due_at if due_at != datetime.max.replace(tzinfo=timezone.utc) else None,
            notes=f"{len(disputed_invoices)} disputed invoice(s) recorded across {len(invoices)} invoice(s).",
        )

    due_candidates = [
        _coerce_utc(invoice.due_at)
        for invoice in invoices
        if invoice.status != InvoiceStatus.NOT_REQUIRED.value
    ]
    due_candidates = [value for value in due_candidates if value is not None]
    due_at = min(due_candidates) if due_candidates else None

    if any(invoice.status == InvoiceStatus.ISSUED.value for invoice in invoices):
        status = InvoiceStatus.ISSUED.value
    elif any(invoice.status == InvoiceStatus.APPROVED.value for invoice in invoices):
        status = InvoiceStatus.APPROVED.value
    elif all(invoice.status == InvoiceStatus.NOT_REQUIRED.value for invoice in invoices):
        status = InvoiceStatus.NOT_REQUIRED.value
    else:
        status = InvoiceStatus.PENDING.value

    if len(invoices) == 1:
        return TradeInvoiceProjection(
            status=status,
            due_at=due_at,
            notes=_workflow_note_for_invoice(invoices[0]),
        )

    note = f"{len(invoices)} invoice(s) recorded."
    if due_at is not None:
        note = f"{note} Next due {due_at.date().isoformat()}."
    return TradeInvoiceProjection(status=status, due_at=due_at, notes=note)


def preview_trade_invoice_void(
    db: Session,
    *,
    invoice_id: int,
    void_reason: object | None = None,
    now: Optional[datetime] = None,
) -> dict[str, object]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = db.execute(
        select(TradeInvoice, Trade)
        .join(Trade, Trade.trade_id == TradeInvoice.trade_id)
        .where(TradeInvoice.id == invoice_id)
    ).first()
    if row is None:
        return {
            "preview_type": "void_trade_invoice",
            "status": "BLOCKED",
            "summary": f"Invoice void preview for invoice {invoice_id} is blocked.",
            "affected_records": [],
            "field_changes": [],
            "expected_side_effects": [],
            "warnings": [],
            "blocking_reasons": [f"Invoice '{invoice_id}' was not found."],
            "assumptions": [],
        }

    invoice, trade = row
    payments = db.execute(
        select(TradePayment)
        .where(TradePayment.invoice_id == invoice.id)
        .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
    ).scalars().all()
    payment_projection = derive_invoice_payment_projection(
        invoice=invoice,
        payments=payments,
        now=reference_time,
    )
    blocking_reasons: list[str] = []
    if invoice.status == InvoiceStatus.NOT_REQUIRED.value:
        blocking_reasons.append(
            f"Invoice '{invoice.invoice_number}' is already marked NOT_REQUIRED and cannot be voided again."
        )

    normalized_void_reason = _normalize_optional_text(void_reason)
    if normalized_void_reason is None:
        blocking_reasons.append("Void reason is required.")

    if payment_projection.total_paid_amount > ZERO:
        blocking_reasons.append(
            f"Invoice '{invoice.invoice_number}' still has net paid cash applied. Reverse the payment before voiding the invoice."
        )

    auto_cleared_payments = [
        payment
        for payment in payments
        if payment.status != PaymentStatus.NOT_REQUIRED.value
        and not _payment_is_paid(payment)
    ]
    preview_status = "BLOCKED" if blocking_reasons else "READY"
    return {
        "preview_type": "void_trade_invoice",
        "status": preview_status,
        "summary": (
            f"Invoice {invoice.invoice_number} for trade {trade.trade_id} will be voided and removed from active settlement posture."
            if not blocking_reasons
            else f"Invoice void preview for invoice {invoice.invoice_number} is blocked."
        ),
        "affected_records": [
            {
                "type": "trade_invoice",
                "id": str(invoice.id),
                "label": f"Invoice {invoice.invoice_number}",
                "summary": (
                    f"{invoice.status} invoice for {invoice.invoice_currency_code} {float(invoice.invoice_amount):.2f} "
                    f"on trade {trade.trade_id}."
                ),
            },
            {
                "type": "trade",
                "id": trade.trade_id,
                "label": f"Trade {trade.trade_id}",
                "summary": f"Trade settlement status is {trade.settlement_status}.",
            },
        ],
        "field_changes": [
            {
                "field": "status",
                "current_value": invoice.status,
                "proposed_value": InvoiceStatus.NOT_REQUIRED.value,
            },
            {
                "field": "voided_at",
                "current_value": _coerce_utc(invoice.voided_at).isoformat() if invoice.voided_at is not None else None,
                "proposed_value": reference_time.isoformat(),
            },
            {
                "field": "void_reason",
                "current_value": invoice.void_reason,
                "proposed_value": normalized_void_reason,
            },
            {
                "field": "payment_records_auto_cleared",
                "current_value": 0,
                "proposed_value": len(auto_cleared_payments),
            },
        ],
        "expected_side_effects": [
            "Mark the invoice as NOT_REQUIRED and stamp explicit void metadata.",
            "Refresh invoice and payment workflow projections.",
            "Synchronize physical accrual invoice relief back to the corrected state when applicable.",
            "Append a TradeInvoiceVoided audit event after execution.",
            *(
                [f"Automatically clear {len(auto_cleared_payments)} unpaid payment record(s) tied to the invoice."]
                if auto_cleared_payments
                else []
            ),
        ],
        "warnings": [
            *(
                ["This invoice already has payment history; only unpaid payment records will be auto-cleared."]
                if payments and auto_cleared_payments
                else []
            ),
        ],
        "blocking_reasons": blocking_reasons,
        "assumptions": [],
    }


def preview_trade_invoice_issue(
    db: Session,
    *,
    trade_id: str,
    leg_no: int | None = None,
    invoice_number: object | None = None,
    invoice_currency_code: object | None = None,
    billed_quantity: object | None = None,
    invoice_amount: object | None = None,
    issued_at: datetime | None = None,
    due_at: datetime | None = None,
    now: Optional[datetime] = None,
) -> dict[str, object]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return _blocked_invoice_issue_preview(
            trade_id=trade_id,
            reasons=(f"Trade '{trade_id}' was not found.",),
            existing_invoices=[],
        )

    existing_invoices = _trade_invoices(db, trade_id=trade.trade_id)
    affected_records = [
        {
            "type": "trade",
            "id": trade.trade_id,
            "label": f"Trade {trade.trade_id}",
            "summary": (
                f"{trade.status} {trade.trade_nature} trade for "
                f"{trade.counterparty or 'unknown counterparty'} with settlement status {trade.settlement_status}."
            ),
        }
    ]
    if existing_invoices:
        affected_records.append(
            {
                "type": "trade_invoice_collection",
                "id": trade.trade_id,
                "label": f"Invoices for {trade.trade_id}",
                "summary": f"{len(existing_invoices)} existing invoice(s) will remain unchanged by this preview.",
            }
        )

    blocking_reasons: list[str] = []
    if trade.status != TradeStatus.ACTIVE.value:
        blocking_reasons.append(
            f"Trade '{trade.trade_id}' is {trade.status}; invoice issuance requires an ACTIVE trade."
        )

    credit_hold_state = get_trade_credit_hold_state(db, trade_id=trade.trade_id)
    if credit_hold_state.hold_active:
        blocking_reasons.append(
            format_trade_credit_hold_message(
                trade.trade_id,
                credit_hold_state,
                blocked_action=(
                    "Settlement actions are blocked until credit approves the trade "
                    "or the trade is amended back within limit."
                ),
            )
        )

    try:
        scope = _resolve_invoice_scope(
            db,
            trade=trade,
            leg_no=leg_no,
            existing_invoices=existing_invoices,
            invoice_amount_provided=invoice_amount is not None,
            billed_quantity_provided=billed_quantity is not None,
        )
        normalized_billed_quantity = _normalize_billed_quantity(
            billed_quantity,
            trade=trade,
            scope=scope,
            default_to_remaining_actualized=scope.delivery_id is not None and invoice_amount is None,
        )
        normalized_issued_at = _normalize_issued_at(
            issued_at,
            due_at=due_at,
            fallback=reference_time,
        )
        normalized_due_at = _normalize_due_at(due_at, trade=trade, issued_at=normalized_issued_at)
        normalized_invoice_amount = _normalize_invoice_amount(
            invoice_amount,
            trade=trade,
            billed_quantity=normalized_billed_quantity,
        )
        normalized_invoice_number = _normalize_invoice_number(
            invoice_number,
            trade=trade,
            existing_invoices=existing_invoices,
        )
        normalized_invoice_currency_code = _normalize_currency_code(invoice_currency_code, trade=trade)
    except (LookupError, ValueError) as exc:
        blocking_reasons.append(str(exc))
        return _blocked_invoice_issue_preview(
            trade_id=trade.trade_id,
            reasons=tuple(blocking_reasons),
            existing_invoices=existing_invoices,
            affected_records=affected_records,
        )

    if blocking_reasons:
        return _blocked_invoice_issue_preview(
            trade_id=trade.trade_id,
            reasons=tuple(blocking_reasons),
            existing_invoices=existing_invoices,
            affected_records=affected_records,
        )

    assumptions = []
    if invoice_number is None:
        assumptions.append("Invoice number will be generated from the trade and invoice sequence.")
    if invoice_currency_code is None:
        assumptions.append("Invoice currency will default from the trade currency.")
    if invoice_amount is None:
        assumptions.append("Invoice amount will be derived from billed quantity or trade notional.")
    if issued_at is None:
        assumptions.append("Issued timestamp will default to the approval execution time.")
    if due_at is None:
        assumptions.append("Due timestamp will default from delivery/trade dates or five days after issue.")

    return {
        "preview_type": "issue_trade_invoice",
        "status": "READY",
        "summary": (
            f"Approval will create invoice {normalized_invoice_number} for trade {trade.trade_id} "
            f"for {normalized_invoice_currency_code} {float(normalized_invoice_amount):.2f}."
        ),
        "affected_records": affected_records,
        "field_changes": [
            {"field": "invoice_number", "current_value": None, "proposed_value": normalized_invoice_number},
            {
                "field": "invoice_currency_code",
                "current_value": None,
                "proposed_value": normalized_invoice_currency_code,
            },
            {
                "field": "invoice_amount",
                "current_value": None,
                "proposed_value": float(normalized_invoice_amount),
            },
            {
                "field": "billed_quantity",
                "current_value": None,
                "proposed_value": (
                    float(normalized_billed_quantity) if normalized_billed_quantity is not None else None
                ),
            },
            {"field": "issued_at", "current_value": None, "proposed_value": normalized_issued_at.isoformat()},
            {"field": "due_at", "current_value": None, "proposed_value": normalized_due_at.isoformat()},
            {"field": "leg_no", "current_value": None, "proposed_value": scope.leg_no},
            {"field": "delivery_id", "current_value": None, "proposed_value": scope.delivery_id},
        ],
        "expected_side_effects": [
            "Create one trade invoice record.",
            "Refresh invoice workflow projections.",
            "Synchronize accrual relief for physical trades when applicable.",
            "Append a TradeInvoiceIssued audit event after execution.",
        ],
        "warnings": [
            warning
            for warning in (
                f"{len(existing_invoices)} existing invoice(s) are already recorded for this trade."
                if existing_invoices
                else None,
            )
            if warning is not None
        ],
        "blocking_reasons": [],
        "assumptions": assumptions,
        "existing_invoice_count": len(existing_invoices),
    }


def _blocked_invoice_issue_preview(
    *,
    trade_id: str,
    reasons: tuple[str, ...],
    existing_invoices: list[TradeInvoice],
    affected_records: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "preview_type": "issue_trade_invoice",
        "status": "BLOCKED",
        "summary": f"Invoice issue preview for trade {trade_id} is blocked.",
        "affected_records": list(affected_records or []),
        "field_changes": [],
        "expected_side_effects": [],
        "warnings": [],
        "blocking_reasons": list(reasons),
        "assumptions": [],
        "existing_invoice_count": len(existing_invoices),
    }


def _to_out(
    invoice: TradeInvoice,
    trade: Trade,
    workflow_item: TradeWorkflowItem | None,
    *,
    payments_for_invoice: list[TradePayment],
    now: Optional[datetime] = None,
) -> TradeInvoiceOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    issued_at = _coerce_utc(invoice.issued_at) or reference_time
    due_at = _coerce_utc(invoice.due_at) or issued_at
    payment_projection = derive_invoice_payment_projection(
        invoice=invoice,
        payments=payments_for_invoice,
        now=reference_time,
    )
    credit_hold_blocked_reason = None
    if bool(getattr(trade, "credit_hold_active", False)):
        credit_hold_blocked_reason = format_trade_credit_hold_message(get_trade_credit_hold_state(trade))

    return TradeInvoiceOut(
        invoice_id=invoice.id,
        trade_id=invoice.trade_id,
        delivery_id=invoice.delivery_id,
        leg_no=invoice.leg_no,
        invoice_number=invoice.invoice_number,
        invoice_currency_code=invoice.invoice_currency_code,
        billed_quantity=float(invoice.billed_quantity) if invoice.billed_quantity is not None else None,
        quantity_unit_code=invoice.quantity_unit_code,
        invoice_amount=float(invoice.invoice_amount),
        status=invoice.status,
        issued_at=issued_at,
        due_at=due_at,
        dispute_reason=invoice.dispute_reason,
        voided_at=_coerce_utc(invoice.voided_at),
        voided_by=invoice.voided_by,
        void_reason=invoice.void_reason,
        notes=invoice.notes,
        created_at=_coerce_utc(invoice.created_at) or issued_at,
        created_by=invoice.created_by,
        updated_at=_coerce_utc(invoice.updated_at) or reference_time,
        updated_by=invoice.updated_by,
        version=invoice.version,
        workflow_item_id=workflow_item.id if workflow_item is not None else None,
        workflow_owner=workflow_item.owner if workflow_item is not None else None,
        is_overdue=payment_projection.payment_status == PaymentStatus.OVERDUE.value,
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
        payment_status=payment_projection.payment_status,
        settlement_status=payment_projection.settlement_status,
        total_paid_amount=float(payment_projection.total_paid_amount),
        outstanding_amount=float(payment_projection.outstanding_amount),
        action_states=[
            OperationalRowActionStateOut(
                key="save",
                available=credit_hold_blocked_reason is None,
                blocked_reason=credit_hold_blocked_reason,
            ),
            OperationalRowActionStateOut(
                key="approve",
                available=credit_hold_blocked_reason is None,
                blocked_reason=credit_hold_blocked_reason,
            ),
            OperationalRowActionStateOut(
                key="dispute",
                available=credit_hold_blocked_reason is None,
                blocked_reason=credit_hold_blocked_reason,
            ),
        ],
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
            Trade.status == "ACTIVE",
        )
    ).first()


def synchronize_trade_invoice_projection(
    db: Session,
    *,
    trade: Trade,
    actor_id: str,
    now: Optional[datetime] = None,
) -> TradeWorkflowItem | None:
    invoices = _trade_invoices(db, trade_id=trade.trade_id)
    if not invoices:
        return None

    projection = _derive_trade_invoice_projection(invoices)
    return set_trade_workflow_item_projection(
        db,
        trade=trade,
        workflow_type=TradeWorkflowType.INVOICE.value,
        status=projection.status,
        actor_id=actor_id,
        now=now,
        due_at=projection.due_at,
        notes=projection.notes,
    )


def trade_has_invoice_record(db: Session, *, trade_id: str) -> bool:
    return (
        db.execute(select(TradeInvoice.id).where(TradeInvoice.trade_id == trade_id).limit(1)).scalar_one_or_none()
        is not None
    )


def _invoice_issue_candidate_conditions() -> tuple[object, ...]:
    invoice_record_exists = select(TradeInvoice.id).where(TradeInvoice.trade_id == Trade.trade_id).exists()
    open_settlement_trade_condition = ~and_(
        Trade.settlement_status == SettlementStatus.SETTLED.value,
        Trade.payment_status.in_((PaymentStatus.PAID.value, PaymentStatus.NOT_REQUIRED.value)),
    )
    return (
        Trade.status == TradeStatus.ACTIVE.value,
        open_settlement_trade_condition,
        Trade.invoice_status != InvoiceStatus.NOT_REQUIRED.value,
        ~invoice_record_exists,
    )


def count_invoice_issue_candidates(db: Session) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(Trade)
            .where(*_invoice_issue_candidate_conditions())
        ).scalar_one()
    )


def _trade_age_days(trade: Trade, *, reference_time: datetime) -> int | None:
    execution_timestamp = _coerce_utc(trade.execution_timestamp)
    if execution_timestamp is not None:
        return max(0, int((reference_time - execution_timestamp).total_seconds() // 86_400))
    if trade.trade_date is not None:
        return max(0, (reference_time.date() - trade.trade_date).days)
    return None


def _to_invoice_issue_candidate(
    db: Session,
    *,
    trade: Trade,
    reference_time: datetime,
) -> InvoiceIssueCandidate:
    preview = preview_trade_invoice_issue(
        db,
        trade_id=trade.trade_id,
        now=reference_time,
    )
    readiness_status = str(preview.get("status") or "UNKNOWN")
    candidate = InvoiceIssueCandidate(
        trade_id=trade.trade_id,
        trade_nature=trade.trade_nature,
        book=trade.book,
        portfolio=trade.portfolio,
        counterparty=trade.counterparty,
        commodity_class=trade.commodity_class,
        commodity=trade.commodity,
        trader_user=trade.trader_user,
        trade_date=trade.trade_date,
        execution_timestamp=_coerce_utc(trade.execution_timestamp),
        delivery_start=trade.delivery_start,
        delivery_end=trade.delivery_end,
        trade_currency_code=trade.trade_currency_code,
        invoice_status=trade.invoice_status,
        payment_status=trade.payment_status,
        settlement_status=trade.settlement_status,
        notional_amount=_trade_notional_amount(trade),
        age_days=_trade_age_days(trade, reference_time=reference_time),
        readiness_status=readiness_status,
        priority_reason="",
        preview_summary=str(preview.get("summary") or ""),
        blocking_reasons=tuple(str(reason) for reason in preview.get("blocking_reasons") or ()),
        assumptions=tuple(str(assumption) for assumption in preview.get("assumptions") or ()),
        recommended_action={
            "action_type": "issue_trade_invoice",
            "requires_approval": True,
            "payload": {"trade_id": trade.trade_id},
            "preview_status": readiness_status,
        },
    )
    return InvoiceIssueCandidate(
        **{
            **candidate.__dict__,
            "priority_reason": _invoice_issue_candidate_priority_reason(candidate),
        }
    )


def list_invoice_issue_candidates(
    db: Session,
    *,
    limit: int | None = None,
    offset: int = 0,
    now: Optional[datetime] = None,
) -> list[InvoiceIssueCandidate]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    stmt = (
        select(Trade)
        .where(*_invoice_issue_candidate_conditions())
        .order_by(
            Trade.execution_timestamp.is_(None).asc(),
            Trade.execution_timestamp.asc(),
            Trade.trade_id.asc(),
        )
    )

    trades = db.execute(stmt).scalars().all()
    candidates = [
        _to_invoice_issue_candidate(db, trade=trade, reference_time=reference_time)
        for trade in trades
    ]
    candidates.sort(key=_invoice_issue_candidate_sort_key)
    if offset:
        candidates = candidates[offset:]
    if limit is not None:
        candidates = candidates[:limit]
    return candidates


def _load_trade_invoice_rows(
    db: Session,
    request: InvoiceListRequest,
) -> list[tuple[TradeInvoice, Trade, TradeWorkflowItem | None]]:
    stmt = (
        select(TradeInvoice, Trade, TradeWorkflowItem)
        .join(Trade, Trade.trade_id == TradeInvoice.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            (TradeWorkflowItem.trade_id == TradeInvoice.trade_id)
            & (TradeWorkflowItem.workflow_type == TradeWorkflowType.INVOICE.value),
        )
        .where(Trade.status == "ACTIVE")
        .order_by(TradeInvoice.due_at.asc(), TradeInvoice.updated_at.desc(), TradeInvoice.id.desc())
    )
    if request.trade_id:
        stmt = stmt.where(TradeInvoice.trade_id == request.trade_id)
    if request.offset:
        stmt = stmt.offset(request.offset)
    if request.limit is not None:
        stmt = stmt.limit(request.limit)
    return list(db.execute(stmt).all())


def _load_trade_invoice_context(
    db: Session,
    rows: list[tuple[TradeInvoice, Trade, TradeWorkflowItem | None]],
    _request: InvoiceListRequest,
) -> InvoiceListContext:
    return InvoiceListContext(
        payments_by_invoice_id=_load_payments_by_invoice_id(
            db,
            invoice_ids=[invoice.id for invoice, _trade, _workflow_item in rows],
        )
    )


def _build_trade_invoice_item(
    row: tuple[TradeInvoice, Trade, TradeWorkflowItem | None],
    context: InvoiceListContext,
    request: InvoiceListRequest,
) -> TradeInvoiceOut:
    invoice, trade, workflow_item = row
    return _to_out(
        invoice,
        trade,
        workflow_item,
        payments_for_invoice=context.payments_by_invoice_id.get(invoice.id, []),
        now=request.reference_time,
    )


TRADE_INVOICE_RESOURCE_DESCRIPTOR = OperationalResourceDescriptor[
    InvoiceListRequest,
    tuple[TradeInvoice, Trade, TradeWorkflowItem | None],
    InvoiceListContext,
    TradeInvoiceOut,
](
    resource_key="invoices",
    filters=("trade_id",),
    sort_fields=("due_at asc", "updated_at desc", "id desc"),
    actions=("create", "update"),
    surface=OperationalResourceSurface(
        title="Invoice Ledger",
        description=(
            "Dedicated invoice records drive invoice issuance, updates, and settlement rollups for each active trade."
        ),
        board_section="Queue",
        actions=(
            OperationalResourceSurfaceAction(
                key="issue",
                label="Issue Invoice",
                detail="Create the next invoice record for the selected trade or delivery scope.",
                permission_message="Sign in to issue, approve, and dispute settlement invoices.",
            ),
            OperationalResourceSurfaceAction(
                key="save",
                label="Save",
                detail="Persist invoice date, amount, note, and scope changes without changing the status.",
                permission_message="Sign in to issue, approve, and dispute settlement invoices.",
            ),
            OperationalResourceSurfaceAction(
                key="approve",
                label="Approve",
                detail="Approve the invoice record once terms, quantities, and notes are ready to lock in.",
                permission_message="Sign in to issue, approve, and dispute settlement invoices.",
            ),
            OperationalResourceSurfaceAction(
                key="dispute",
                label="Mark Disputed",
                detail="Move the invoice into dispute status and preserve the dispute rationale on the ledger.",
                permission_message="Sign in to issue, approve, and dispute settlement invoices.",
                comment_required=True,
                comment_hint="Add a dispute reason before marking the invoice as disputed.",
            ),
        ),
        primary_action=OperationalResourcePrimaryAction(
            key="issue_invoice",
            label="Issue invoice",
            detail="Create the first invoice record as soon as commercial settlement moves out of status-only tracking.",
        ),
        empty_state=OperationalResourceEmptyState(
            title="No invoice ledger",
            detail="Trades that need invoicing will appear here once settlement work opens on the active book.",
        ),
        summary_stats=(
            OperationalResourceSummaryStat(
                key="first_issue",
                label="First issue pending",
                detail="Spot trades that still need their first invoice record before cash collection can begin.",
            ),
            OperationalResourceSummaryStat(
                key="invoice_disputes",
                label="Invoice disputes",
                detail="Keep disputed invoice terms inside the same ledger as issuance and amendment history.",
            ),
            OperationalResourceSummaryStat(
                key="settlement_aging",
                label="Settlement aging",
                detail="Track due dates and late updates before invoice aging turns into payment delay.",
            ),
        ),
    ),
    load_rows=_load_trade_invoice_rows,
    load_context=_load_trade_invoice_context,
    build_item=_build_trade_invoice_item,
)


def list_trade_invoices(
    db: Session,
    *,
    trade_id: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    now: Optional[datetime] = None,
) -> list[TradeInvoiceOut]:
    return load_operational_resource_items(
        TRADE_INVOICE_RESOURCE_DESCRIPTOR,
        db,
        InvoiceListRequest(
            reference_time=_coerce_utc(now) or datetime.now(timezone.utc),
            trade_id=trade_id,
            limit=limit,
            offset=offset,
        ),
    )


def issue_trade_invoice(
    db: Session,
    *,
    trade_id: str,
    actor_id: str = SYSTEM_WORKFLOW_ACTOR,
    leg_no: int | None = None,
    invoice_number: object | None = None,
    invoice_currency_code: object | None = None,
    billed_quantity: object | None = None,
    invoice_amount: object | None = None,
    issued_at: datetime | None = None,
    due_at: datetime | None = None,
    notes: object | None = None,
    now: Optional[datetime] = None,
) -> TradeInvoiceOut:
    from apps.api.app.domains.accruals.services import (
        synchronize_trade_accruals,
        synchronize_trade_invoice_relief,
    )

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trade = db.execute(
        select(Trade).where(Trade.trade_id == trade_id, Trade.status == "ACTIVE")
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

    existing_invoices = _trade_invoices(db, trade_id=trade.trade_id)
    scope = _resolve_invoice_scope(
        db,
        trade=trade,
        leg_no=leg_no,
        existing_invoices=existing_invoices,
        invoice_amount_provided=invoice_amount is not None,
        billed_quantity_provided=billed_quantity is not None,
    )
    normalized_billed_quantity = _normalize_billed_quantity(
        billed_quantity,
        trade=trade,
        scope=scope,
        default_to_remaining_actualized=scope.delivery_id is not None and invoice_amount is None,
    )
    normalized_issued_at = _normalize_issued_at(
        issued_at,
        due_at=due_at,
        fallback=reference_time,
    )
    invoice = TradeInvoice(
        trade_id=trade.trade_id,
        delivery_id=scope.delivery_id,
        leg_no=scope.leg_no,
        invoice_number=_normalize_invoice_number(
            invoice_number,
            trade=trade,
            existing_invoices=existing_invoices,
        ),
        invoice_currency_code=_normalize_currency_code(invoice_currency_code, trade=trade),
        billed_quantity=normalized_billed_quantity,
        quantity_unit_code=scope.quantity_unit_code if normalized_billed_quantity is not None else None,
        invoice_amount=_normalize_invoice_amount(
            invoice_amount,
            trade=trade,
            billed_quantity=normalized_billed_quantity,
        ),
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
    if trade.trade_nature == TradeNature.PHYSICAL.value:
        synchronize_trade_accruals(
            db,
            trade_id=trade.trade_id,
            actor_id=actor_id,
            now=reference_time,
        )
        synchronize_trade_invoice_relief(
            db,
            invoice_id=invoice.id,
            actor_id=actor_id,
            now=reference_time,
            strict=True,
        )

    workflow_item = synchronize_trade_invoice_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    synchronize_trade_payment_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    invoice_out = _to_out(invoice, trade, workflow_item, payments_for_invoice=[], now=reference_time)
    append_trade_audit_event(
        db,
        trade_id=invoice_out.trade_id,
        actor_id=actor_id,
        event_type="TradeInvoiceIssued",
        occurred_at=invoice_out.updated_at,
        causation_id=f"trade-invoice:{invoice_out.invoice_id}",
        payload={
            "request": jsonable_encoder(
                {
                    key: value
                    for key, value in {
                        "trade_id": trade_id,
                        "leg_no": leg_no,
                        "invoice_number": invoice_number,
                        "invoice_currency_code": invoice_currency_code,
                        "billed_quantity": billed_quantity,
                        "invoice_amount": invoice_amount,
                        "issued_at": issued_at,
                        "due_at": due_at,
                        "notes": notes,
                    }.items()
                    if value is not None
                }
            ),
            "invoice": _audit_invoice_payload(invoice_out),
        },
    )
    return invoice_out


def update_trade_invoice(
    db: Session,
    *,
    invoice_id: int,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> TradeInvoiceOut:
    from apps.api.app.domains.accruals.services import (
        synchronize_trade_accruals,
        synchronize_trade_invoice_relief,
    )

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = _invoice_row(db, invoice_id=invoice_id)
    if row is None:
        raise LookupError(f"Invoice '{invoice_id}' was not found.")

    invoice, trade, _ = row
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

    existing_invoices = _trade_invoices(db, trade_id=trade.trade_id)
    next_invoice_number = invoice.invoice_number
    next_invoice_currency_code = invoice.invoice_currency_code
    next_invoice_amount = Decimal(str(invoice.invoice_amount))
    next_status = invoice.status
    next_issued_at = _coerce_utc(invoice.issued_at) or reference_time
    next_due_at = _coerce_utc(invoice.due_at) or next_issued_at
    next_dispute_reason = invoice.dispute_reason
    next_notes = invoice.notes

    if "invoice_number" in changes:
        next_invoice_number = _normalize_invoice_number(
            changes.get("invoice_number"),
            trade=trade,
            existing_invoices=existing_invoices,
            current_invoice_id=invoice.id,
        )
    if "invoice_currency_code" in changes:
        next_invoice_currency_code = _normalize_currency_code(changes.get("invoice_currency_code"), trade=trade)
    if "invoice_amount" in changes:
        next_invoice_amount = _normalize_invoice_amount(
            changes.get("invoice_amount"),
            trade=trade,
            billed_quantity=_to_decimal(invoice.billed_quantity),
        )
    if "status" in changes:
        next_status = _validate_invoice_status(changes.get("status"))
    if "issued_at" in changes:
        next_issued_at = _normalize_issued_at(
            changes.get("issued_at"),  # type: ignore[arg-type]
            due_at=next_due_at,
            fallback=next_issued_at,
        )
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
    if trade.trade_nature == TradeNature.PHYSICAL.value:
        synchronize_trade_accruals(
            db,
            trade_id=trade.trade_id,
            actor_id=actor_id,
            now=reference_time,
        )
        synchronize_trade_invoice_relief(
            db,
            invoice_id=invoice.id,
            actor_id=actor_id,
            now=reference_time,
            strict=True,
        )

    workflow_item = synchronize_trade_invoice_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    synchronize_trade_payment_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    payments_by_invoice_id = _load_payments_by_invoice_id(db, invoice_ids=[invoice.id])
    invoice_out = _to_out(
        invoice,
        trade,
        workflow_item,
        payments_for_invoice=payments_by_invoice_id.get(invoice.id, []),
        now=reference_time,
    )
    append_trade_audit_event(
        db,
        trade_id=invoice_out.trade_id,
        actor_id=actor_id,
        event_type="TradeInvoiceUpdated",
        occurred_at=invoice_out.updated_at,
        causation_id=f"trade-invoice:{invoice_out.invoice_id}",
        payload={
            "requested_changes": jsonable_encoder(changes),
            "invoice": _audit_invoice_payload(invoice_out),
        },
    )
    return invoice_out


def void_trade_invoice(
    db: Session,
    *,
    invoice_id: int,
    actor_id: str,
    void_reason: object | None,
    notes: object | None = None,
    now: Optional[datetime] = None,
) -> TradeInvoiceOut:
    from apps.api.app.domains.accruals.services import (
        synchronize_trade_accruals,
        synchronize_trade_invoice_relief,
    )

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = db.execute(
        select(TradeInvoice, Trade)
        .join(Trade, Trade.trade_id == TradeInvoice.trade_id)
        .where(TradeInvoice.id == invoice_id)
    ).first()
    if row is None:
        raise LookupError(f"Invoice '{invoice_id}' was not found.")

    invoice, trade = row
    if invoice.status == InvoiceStatus.NOT_REQUIRED.value:
        raise ValueError(f"Invoice '{invoice.invoice_number}' is already marked NOT_REQUIRED.")

    normalized_void_reason = _normalize_required_text(void_reason, field_name="Void reason")
    invoice_payments = db.execute(
        select(TradePayment)
        .where(TradePayment.invoice_id == invoice.id)
        .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
    ).scalars().all()
    payment_projection = derive_invoice_payment_projection(
        invoice=invoice,
        payments=invoice_payments,
        now=reference_time,
    )
    if payment_projection.total_paid_amount > ZERO:
        raise ValueError(
            f"Invoice '{invoice.invoice_number}' still has net paid cash applied. Reverse the payment before voiding the invoice."
        )

    invoice.status = InvoiceStatus.NOT_REQUIRED.value
    invoice.dispute_reason = None
    invoice.voided_at = reference_time
    invoice.voided_by = actor_id
    invoice.void_reason = normalized_void_reason
    invoice.notes = _append_note(invoice.notes, _normalize_optional_text(notes))
    invoice.updated_at = reference_time
    invoice.updated_by = actor_id
    invoice.version += 1

    auto_cleared_payment_ids: list[int] = []
    for payment in invoice_payments:
        if payment.status == PaymentStatus.NOT_REQUIRED.value:
            continue
        if _payment_is_paid(payment):
            continue
        payment.status = PaymentStatus.NOT_REQUIRED.value
        payment.received_at = None
        payment.notes = _append_note(
            payment.notes,
            f"Auto-cleared when invoice {invoice.invoice_number} was voided.",
        )
        payment.updated_at = reference_time
        payment.updated_by = actor_id
        payment.version += 1
        auto_cleared_payment_ids.append(payment.id)

    if trade.trade_nature == TradeNature.PHYSICAL.value:
        synchronize_trade_accruals(
            db,
            trade_id=trade.trade_id,
            actor_id=actor_id,
            now=reference_time,
        )
        synchronize_trade_invoice_relief(
            db,
            invoice_id=invoice.id,
            actor_id=actor_id,
            now=reference_time,
            strict=False,
        )

    workflow_item = synchronize_trade_invoice_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    synchronize_trade_payment_projection(
        db,
        trade=trade,
        actor_id=actor_id,
        now=reference_time,
    )
    refreshed_payments = db.execute(
        select(TradePayment)
        .where(TradePayment.invoice_id == invoice.id)
        .order_by(TradePayment.due_at.asc(), TradePayment.id.asc())
    ).scalars().all()
    invoice_out = _to_out(
        invoice,
        trade,
        workflow_item,
        payments_for_invoice=refreshed_payments,
        now=reference_time,
    )
    append_trade_audit_event(
        db,
        trade_id=invoice_out.trade_id,
        actor_id=actor_id,
        event_type="TradeInvoiceVoided",
        occurred_at=invoice_out.updated_at,
        causation_id=f"trade-invoice:void:{invoice_out.invoice_id}",
        payload={
            "request": jsonable_encoder(
                {
                    "invoice_id": invoice_id,
                    "void_reason": normalized_void_reason,
                    "notes": notes,
                }
            ),
            "auto_cleared_payment_ids": auto_cleared_payment_ids,
            "invoice": _audit_invoice_payload(invoice_out),
        },
    )
    return invoice_out
