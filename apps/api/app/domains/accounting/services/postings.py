from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
from apps.api.app.models.trade_accounting_entry import TradeAccountingEntry
from apps.api.app.models.trade_accounting_entry_line import TradeAccountingEntryLine
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment

ZERO = Decimal("0")


@dataclass(frozen=True)
class AccountingEntryLineInput:
    side: str
    account_code: str
    amount: Decimal
    currency_code: str
    reference_code: str | None = None
    notes: str | None = None


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_required_text(value: str | None, *, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{field_name} is required.")
    return normalized


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_code(value: str | None, *, field_name: str | None = None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    if not normalized and field_name is not None:
        raise ValueError(f"{field_name} is required.")
    return normalized or None


def _coerce_decimal(value: object, *, field_name: str) -> Decimal:
    try:
        decimal_value = Decimal(str(value))
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError(f"{field_name} must be numeric.") from exc
    if decimal_value <= ZERO:
        raise ValueError(f"{field_name} must be greater than zero.")
    return decimal_value


def _coerce_effective_date(value: datetime | date | None, *, now: datetime) -> date:
    if value is None:
        return now.date()
    if isinstance(value, datetime):
        normalized = _coerce_utc(value) or now
        return normalized.date()
    return value


def _normalize_line_inputs(
    *,
    lines: list[dict[str, object]] | list[AccountingEntryLineInput],
    default_currency_code: str | None,
) -> tuple[list[AccountingEntryLineInput], str]:
    if not lines:
        raise ValueError("At least two accounting lines are required.")

    normalized_lines: list[AccountingEntryLineInput] = []
    for raw_line in lines:
        if isinstance(raw_line, AccountingEntryLineInput):
            side = raw_line.side
            account_code = raw_line.account_code
            amount = raw_line.amount
            currency_code = raw_line.currency_code
            reference_code = raw_line.reference_code
            notes = raw_line.notes
        else:
            if not isinstance(raw_line, dict):
                raise ValueError("Accounting lines must be objects.")
            side = str(raw_line.get("side") or "")
            account_code = str(raw_line.get("account_code") or "")
            amount = raw_line.get("amount")
            currency_code = raw_line.get("currency_code")
            reference_code = raw_line.get("reference_code")
            notes = raw_line.get("notes")

        normalized_side = _normalize_code(side, field_name="side")
        if normalized_side not in {"DEBIT", "CREDIT"}:
            raise ValueError("Accounting line side must be DEBIT or CREDIT.")
        normalized_account_code = _normalize_required_text(account_code, field_name="account_code")
        normalized_currency = _normalize_code(
            str(currency_code) if currency_code is not None else default_currency_code,
            field_name="currency_code",
        )
        assert normalized_currency is not None
        normalized_lines.append(
            AccountingEntryLineInput(
                side=normalized_side,
                account_code=normalized_account_code,
                amount=_coerce_decimal(amount, field_name="amount"),
                currency_code=normalized_currency,
                reference_code=_normalize_optional_text(str(reference_code)) if reference_code is not None else None,
                notes=_normalize_optional_text(str(notes)) if notes is not None else None,
            )
        )

    if len(normalized_lines) < 2:
        raise ValueError("At least two accounting lines are required.")

    entry_currency_code = normalized_lines[0].currency_code
    if any(line.currency_code != entry_currency_code for line in normalized_lines):
        raise ValueError("All accounting lines must use the same currency_code.")

    debit_total = sum((line.amount for line in normalized_lines if line.side == "DEBIT"), ZERO)
    credit_total = sum((line.amount for line in normalized_lines if line.side == "CREDIT"), ZERO)
    if debit_total != credit_total:
        raise ValueError("Accounting entry debits and credits must balance.")
    if debit_total == ZERO or credit_total == ZERO:
        raise ValueError("Accounting entries require at least one debit line and one credit line.")
    return normalized_lines, entry_currency_code


def _load_trade_linkage(
    db: Session,
    *,
    trade_id: str | None,
    accrual_lot_id: str | None,
    accrual_entry_id: str | None,
    invoice_id: int | None,
    payment_id: int | None,
) -> tuple[Trade, TradeAccrualLot | None, TradeAccrualEntry | None, TradeInvoice | None, TradePayment | None]:
    lot = db.get(TradeAccrualLot, accrual_lot_id) if accrual_lot_id is not None else None
    if accrual_lot_id is not None and lot is None:
        raise LookupError(f"Accrual lot '{accrual_lot_id}' was not found.")

    accrual_entry = db.get(TradeAccrualEntry, accrual_entry_id) if accrual_entry_id is not None else None
    if accrual_entry_id is not None and accrual_entry is None:
        raise LookupError(f"Accrual entry '{accrual_entry_id}' was not found.")

    invoice = db.get(TradeInvoice, invoice_id) if invoice_id is not None else None
    if invoice_id is not None and invoice is None:
        raise LookupError(f"Invoice '{invoice_id}' was not found.")

    payment = db.get(TradePayment, payment_id) if payment_id is not None else None
    if payment_id is not None and payment is None:
        raise LookupError(f"Payment '{payment_id}' was not found.")

    resolved_trade_id = (
        _normalize_code(trade_id)
        or (lot.trade_id if lot is not None else None)
        or (accrual_entry.trade_id if accrual_entry is not None else None)
        or (invoice.trade_id if invoice is not None else None)
        or (payment.trade_id if payment is not None else None)
    )
    if resolved_trade_id is None:
        raise ValueError("trade_id or a linked accrual, invoice, or payment reference is required.")

    trade = db.get(Trade, resolved_trade_id)
    if trade is None:
        raise LookupError(f"Trade '{resolved_trade_id}' was not found.")

    for linked_name, linked_trade_id in (
        ("accrual lot", lot.trade_id if lot is not None else None),
        ("accrual entry", accrual_entry.trade_id if accrual_entry is not None else None),
        ("invoice", invoice.trade_id if invoice is not None else None),
        ("payment", payment.trade_id if payment is not None else None),
    ):
        if linked_trade_id is not None and linked_trade_id != trade.trade_id:
            raise ValueError(f"The selected {linked_name} does not belong to trade '{trade.trade_id}'.")
    return trade, lot, accrual_entry, invoice, payment


def _entry_lines(db: Session, *, accounting_entry_id: str) -> list[TradeAccountingEntryLine]:
    return db.execute(
        select(TradeAccountingEntryLine)
        .where(TradeAccountingEntryLine.accounting_entry_id == accounting_entry_id)
        .order_by(TradeAccountingEntryLine.line_no.asc(), TradeAccountingEntryLine.id.asc())
    ).scalars().all()


def _entry_out(entry: TradeAccountingEntry, *, lines: list[TradeAccountingEntryLine]) -> dict[str, Any]:
    return {
        "accounting_entry_id": entry.accounting_entry_id,
        "trade_id": entry.trade_id,
        "accrual_lot_id": entry.accrual_lot_id,
        "accrual_entry_id": entry.accrual_entry_id,
        "invoice_id": entry.invoice_id,
        "payment_id": entry.payment_id,
        "journal_code": entry.journal_code,
        "entry_type": entry.entry_type,
        "status": entry.status,
        "effective_date": entry.effective_date,
        "currency_code": entry.currency_code,
        "description": entry.description,
        "notes": entry.notes,
        "reversal_of_entry_id": entry.reversal_of_entry_id,
        "created_at": _coerce_utc(entry.created_at),
        "created_by": entry.created_by,
        "updated_at": _coerce_utc(entry.updated_at),
        "updated_by": entry.updated_by,
        "version": entry.version,
        "lines": [
            {
                "line_no": line.line_no,
                "side": line.side,
                "account_code": line.account_code,
                "amount": float(line.amount),
                "currency_code": line.currency_code,
                "reference_code": line.reference_code,
                "notes": line.notes,
            }
            for line in lines
        ],
    }


def create_trade_accounting_entry(
    db: Session,
    *,
    actor_id: str,
    lines: list[dict[str, object]] | list[AccountingEntryLineInput],
    description: str,
    trade_id: str | None = None,
    accrual_lot_id: str | None = None,
    accrual_entry_id: str | None = None,
    invoice_id: int | None = None,
    payment_id: int | None = None,
    journal_code: str | None = None,
    entry_type: str | None = None,
    currency_code: str | None = None,
    effective_at: datetime | date | None = None,
    notes: str | None = None,
    now: datetime | None = None,
) -> TradeAccountingEntry:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trade, lot, accrual_entry, invoice, payment = _load_trade_linkage(
        db,
        trade_id=trade_id,
        accrual_lot_id=accrual_lot_id,
        accrual_entry_id=accrual_entry_id,
        invoice_id=invoice_id,
        payment_id=payment_id,
    )
    normalized_lines, entry_currency_code = _normalize_line_inputs(
        lines=lines,
        default_currency_code=_normalize_code(currency_code),
    )

    entry = TradeAccountingEntry(
        accounting_entry_id=str(uuid4()),
        trade_id=trade.trade_id,
        accrual_lot_id=lot.accrual_lot_id if lot is not None else None,
        accrual_entry_id=accrual_entry.entry_id if accrual_entry is not None else None,
        invoice_id=invoice.id if invoice is not None else None,
        payment_id=payment.id if payment is not None else None,
        journal_code=_normalize_code(journal_code) if journal_code is not None else None,
        entry_type=_normalize_code(entry_type) or "MANUAL_POSTING",
        status="POSTED",
        effective_date=_coerce_effective_date(effective_at, now=reference_time),
        currency_code=entry_currency_code,
        description=_normalize_required_text(description, field_name="description"),
        notes=_normalize_optional_text(notes),
        reversal_of_entry_id=None,
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    db.add(entry)
    db.flush()

    for index, line in enumerate(normalized_lines, start=1):
        db.add(
            TradeAccountingEntryLine(
                accounting_entry_id=entry.accounting_entry_id,
                line_no=index,
                side=line.side,
                account_code=line.account_code,
                amount=line.amount,
                currency_code=line.currency_code,
                reference_code=line.reference_code,
                notes=line.notes,
            )
        )
    db.flush()

    record_mutation_provenance(
        db,
        operation_key="accounting.entry.create",
        source_surface="accounting",
        affected_records=[
            {
                "record_type": "trade_accounting_entry",
                "record_id": entry.accounting_entry_id,
                "action": "created",
                "label": trade.trade_id,
            }
        ],
        details={
            "trade_id": trade.trade_id,
            "accrual_lot_id": entry.accrual_lot_id,
            "invoice_id": entry.invoice_id,
            "payment_id": entry.payment_id,
            "entry_type": entry.entry_type,
            "currency_code": entry.currency_code,
            "line_count": len(normalized_lines),
        },
        started_at=reference_time,
        completed_at=reference_time,
    )
    return entry


def reverse_trade_accounting_entry(
    db: Session,
    *,
    accounting_entry_id: str,
    actor_id: str,
    reversal_reason: str | None = None,
    effective_at: datetime | date | None = None,
    now: datetime | None = None,
) -> TradeAccountingEntry:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    original = db.get(TradeAccountingEntry, accounting_entry_id)
    if original is None:
        raise LookupError(f"Accounting entry '{accounting_entry_id}' was not found.")
    if str(original.status).upper() == "REVERSED":
        raise ValueError(f"Accounting entry '{accounting_entry_id}' is already reversed.")

    existing_reversal = db.execute(
        select(TradeAccountingEntry.accounting_entry_id)
        .where(TradeAccountingEntry.reversal_of_entry_id == accounting_entry_id)
        .limit(1)
    ).scalars().first()
    if existing_reversal is not None:
        raise ValueError(
            f"Accounting entry '{accounting_entry_id}' has already been reversed by '{existing_reversal}'."
        )

    original_lines = _entry_lines(db, accounting_entry_id=accounting_entry_id)
    if not original_lines:
        raise ValueError(f"Accounting entry '{accounting_entry_id}' does not have any lines to reverse.")

    reversal_entry = TradeAccountingEntry(
        accounting_entry_id=str(uuid4()),
        trade_id=original.trade_id,
        accrual_lot_id=original.accrual_lot_id,
        accrual_entry_id=original.accrual_entry_id,
        invoice_id=original.invoice_id,
        payment_id=original.payment_id,
        journal_code=original.journal_code,
        entry_type="REVERSAL",
        status="POSTED",
        effective_date=_coerce_effective_date(effective_at, now=reference_time),
        currency_code=original.currency_code,
        description=f"Reversal of {accounting_entry_id}",
        notes=_normalize_optional_text(reversal_reason) or f"Reversal of accounting entry {accounting_entry_id}.",
        reversal_of_entry_id=accounting_entry_id,
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    db.add(reversal_entry)
    db.flush()

    for line in original_lines:
        db.add(
            TradeAccountingEntryLine(
                accounting_entry_id=reversal_entry.accounting_entry_id,
                line_no=line.line_no,
                side="CREDIT" if line.side == "DEBIT" else "DEBIT",
                account_code=line.account_code,
                amount=line.amount,
                currency_code=line.currency_code,
                reference_code=line.reference_code,
                notes=line.notes,
            )
        )

    original.status = "REVERSED"
    original.updated_at = reference_time
    original.updated_by = actor_id
    original.version += 1
    db.flush()

    record_mutation_provenance(
        db,
        operation_key="accounting.entry.reverse",
        source_surface="accounting",
        affected_records=[
            {
                "record_type": "trade_accounting_entry",
                "record_id": original.accounting_entry_id,
                "action": "reversed",
                "label": original.trade_id,
            },
            {
                "record_type": "trade_accounting_entry",
                "record_id": reversal_entry.accounting_entry_id,
                "action": "created",
                "label": original.trade_id,
            },
        ],
        details={
            "trade_id": original.trade_id,
            "reversal_of_entry_id": original.accounting_entry_id,
            "reversal_entry_id": reversal_entry.accounting_entry_id,
        },
        started_at=reference_time,
        completed_at=reference_time,
    )
    return reversal_entry


def list_trade_accounting_entries(
    db: Session,
    *,
    entry_id: str | None = None,
    trade_id: str | None = None,
    accrual_lot_id: str | None = None,
    invoice_id: int | None = None,
    payment_id: int | None = None,
    status_filter: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict[str, Any]]:
    stmt = select(TradeAccountingEntry).order_by(
        TradeAccountingEntry.effective_date.desc(),
        TradeAccountingEntry.created_at.desc(),
        TradeAccountingEntry.accounting_entry_id.asc(),
    )
    if entry_id is not None:
        stmt = stmt.where(TradeAccountingEntry.accounting_entry_id == entry_id)
    if trade_id is not None:
        stmt = stmt.where(TradeAccountingEntry.trade_id == _normalize_code(trade_id))
    if accrual_lot_id is not None:
        stmt = stmt.where(TradeAccountingEntry.accrual_lot_id == accrual_lot_id)
    if invoice_id is not None:
        stmt = stmt.where(TradeAccountingEntry.invoice_id == invoice_id)
    if payment_id is not None:
        stmt = stmt.where(TradeAccountingEntry.payment_id == payment_id)
    if status_filter is not None:
        stmt = stmt.where(TradeAccountingEntry.status == _normalize_code(status_filter))
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    entries = db.execute(stmt).scalars().all()
    if not entries:
        return []

    lines_by_entry_id: dict[str, list[TradeAccountingEntryLine]] = {}
    entry_ids = [entry.accounting_entry_id for entry in entries]
    for line in db.execute(
        select(TradeAccountingEntryLine)
        .where(TradeAccountingEntryLine.accounting_entry_id.in_(entry_ids))
        .order_by(TradeAccountingEntryLine.accounting_entry_id.asc(), TradeAccountingEntryLine.line_no.asc(), TradeAccountingEntryLine.id.asc())
    ).scalars().all():
        lines_by_entry_id.setdefault(line.accounting_entry_id, []).append(line)

    return [
        _entry_out(entry, lines=lines_by_entry_id.get(entry.accounting_entry_id, []))
        for entry in entries
    ]
