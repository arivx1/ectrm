from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services.accruals import (
    MANUAL_ENTRY_TYPES,
    _coerce_utc,
    _refresh_lot_rollup_from_entries,
)
from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot

ZERO = Decimal("0")


def _coerce_decimal(value: object | None, *, field_name: str) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError(f"{field_name} must be numeric.") from exc


def _coerce_effective_date(value: datetime | date | None, *, now: datetime) -> date:
    if value is None:
        return now.date()
    if isinstance(value, datetime):
        normalized = _coerce_utc(value) or now
        return normalized.date()
    return value


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _require_open_lot(db: Session, *, accrual_lot_id: str) -> TradeAccrualLot:
    lot = db.get(TradeAccrualLot, accrual_lot_id)
    if lot is None:
        raise LookupError(f"Accrual lot '{accrual_lot_id}' was not found.")
    if _coerce_utc(lot.closed_at) is not None or str(lot.status).upper() == "REVERSED":
        raise ValueError(f"Accrual lot '{accrual_lot_id}' is closed and cannot accept manual entries.")
    return lot


def create_manual_accrual_entry(
    db: Session,
    *,
    accrual_lot_id: str,
    actor_id: str,
    quantity_delta: object | None = None,
    amount_delta: object | None = None,
    effective_at: datetime | date | None = None,
    notes: str | None = None,
    reference_price: object | None = None,
    price_index_code: str | None = None,
    fx_rate: object | None = None,
    now: datetime | None = None,
) -> TradeAccrualEntry:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    lot = _require_open_lot(db, accrual_lot_id=accrual_lot_id)

    normalized_quantity_delta = _coerce_decimal(quantity_delta, field_name="quantity_delta")
    normalized_amount_delta = _coerce_decimal(amount_delta, field_name="amount_delta") or ZERO
    if normalized_quantity_delta in {None, ZERO} and normalized_amount_delta == ZERO:
        raise ValueError("At least one non-zero quantity_delta or amount_delta is required for a manual accrual entry.")

    entry = TradeAccrualEntry(
        entry_id=str(uuid4()),
        accrual_lot_id=lot.accrual_lot_id,
        entry_type="MANUAL_ADJUSTMENT",
        trade_id=lot.trade_id,
        delivery_id=lot.delivery_id,
        invoice_id=None,
        payment_id=None,
        effective_date=_coerce_effective_date(effective_at, now=reference_time),
        currency_code=lot.accrual_currency_code,
        quantity_delta=normalized_quantity_delta,
        amount_delta=normalized_amount_delta,
        reference_price=_coerce_decimal(reference_price, field_name="reference_price"),
        price_index_code=_normalize_optional_text(price_index_code),
        fx_rate=_coerce_decimal(fx_rate, field_name="fx_rate"),
        notes=_normalize_optional_text(notes),
        reversal_of_entry_id=None,
        created_at=reference_time,
        created_by=actor_id,
    )
    db.add(entry)
    db.flush()

    _refresh_lot_rollup_from_entries(
        db,
        lot=lot,
        actor_id=actor_id,
        updated_at=reference_time,
    )
    record_mutation_provenance(
        db,
        operation_key="accruals.manual_entry.create",
        source_surface="accruals",
        affected_records=[
            {
                "record_type": "trade_accrual_entry",
                "record_id": entry.entry_id,
                "action": "created",
                "label": lot.accrual_lot_id,
            },
            {
                "record_type": "trade_accrual_lot",
                "record_id": lot.accrual_lot_id,
                "action": "updated",
                "label": lot.trade_id,
            },
        ],
        details={
            "accrual_lot_id": lot.accrual_lot_id,
            "trade_id": lot.trade_id,
            "entry_type": entry.entry_type,
            "quantity_delta": float(normalized_quantity_delta) if normalized_quantity_delta is not None else None,
            "amount_delta": float(normalized_amount_delta),
        },
        started_at=reference_time,
        completed_at=reference_time,
    )
    return entry


def reverse_manual_accrual_entry(
    db: Session,
    *,
    entry_id: str,
    actor_id: str,
    reversal_reason: str | None = None,
    effective_at: datetime | date | None = None,
    now: datetime | None = None,
) -> TradeAccrualEntry:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    original = db.get(TradeAccrualEntry, entry_id)
    if original is None:
        raise LookupError(f"Accrual entry '{entry_id}' was not found.")
    if original.entry_type not in MANUAL_ENTRY_TYPES:
        raise ValueError(f"Accrual entry '{entry_id}' is not a manual entry and cannot be reversed through this action.")

    existing_reversal = db.execute(
        select(TradeAccrualEntry.entry_id).where(TradeAccrualEntry.reversal_of_entry_id == entry_id).limit(1)
    ).scalars().first()
    if existing_reversal is not None:
        raise ValueError(f"Accrual entry '{entry_id}' has already been reversed by '{existing_reversal}'.")

    lot = _require_open_lot(db, accrual_lot_id=original.accrual_lot_id)
    reversal_entry = TradeAccrualEntry(
        entry_id=str(uuid4()),
        accrual_lot_id=original.accrual_lot_id,
        entry_type="MANUAL_REVERSAL",
        trade_id=original.trade_id,
        delivery_id=original.delivery_id,
        invoice_id=original.invoice_id,
        payment_id=original.payment_id,
        effective_date=_coerce_effective_date(effective_at, now=reference_time),
        currency_code=original.currency_code,
        quantity_delta=(-Decimal(str(original.quantity_delta))) if original.quantity_delta is not None else None,
        amount_delta=-Decimal(str(original.amount_delta)),
        reference_price=original.reference_price,
        price_index_code=original.price_index_code,
        fx_rate=original.fx_rate,
        notes=_normalize_optional_text(reversal_reason) or f"Reversal of manual accrual entry {entry_id}.",
        reversal_of_entry_id=entry_id,
        created_at=reference_time,
        created_by=actor_id,
    )
    db.add(reversal_entry)
    db.flush()

    _refresh_lot_rollup_from_entries(
        db,
        lot=lot,
        actor_id=actor_id,
        updated_at=reference_time,
    )
    record_mutation_provenance(
        db,
        operation_key="accruals.manual_entry.reverse",
        source_surface="accruals",
        affected_records=[
            {
                "record_type": "trade_accrual_entry",
                "record_id": reversal_entry.entry_id,
                "action": "created",
                "label": lot.accrual_lot_id,
            },
            {
                "record_type": "trade_accrual_entry",
                "record_id": original.entry_id,
                "action": "reversed",
                "label": lot.accrual_lot_id,
            },
            {
                "record_type": "trade_accrual_lot",
                "record_id": lot.accrual_lot_id,
                "action": "updated",
                "label": lot.trade_id,
            },
        ],
        details={
            "accrual_lot_id": lot.accrual_lot_id,
            "trade_id": lot.trade_id,
            "reversal_of_entry_id": entry_id,
            "reversal_entry_id": reversal_entry.entry_id,
        },
        started_at=reference_time,
        completed_at=reference_time,
    )
    return reversal_entry
