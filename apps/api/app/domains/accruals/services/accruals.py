from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot


def _normalize_code(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized or None


def _decimal_to_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _lot_filters(
    *,
    trade_id: str | None = None,
    delivery_id: str | None = None,
    book: str | None = None,
    portfolio: str | None = None,
    counterparty: str | None = None,
    commodity_class: str | None = None,
    accrual_currency_code: str | None = None,
    status_filter: str | None = None,
) -> list[Any]:
    filters: list[Any] = []

    normalized_trade_id = _normalize_code(trade_id)
    if normalized_trade_id:
        filters.append(func.upper(TradeAccrualLot.trade_id) == normalized_trade_id)

    normalized_delivery_id = _normalize_code(delivery_id)
    if normalized_delivery_id:
        filters.append(func.upper(TradeAccrualLot.delivery_id) == normalized_delivery_id)

    normalized_book = _normalize_code(book)
    if normalized_book:
        filters.append(func.upper(TradeAccrualLot.book) == normalized_book)

    normalized_portfolio = _normalize_code(portfolio)
    if normalized_portfolio:
        filters.append(func.upper(TradeAccrualLot.portfolio) == normalized_portfolio)

    normalized_counterparty = _normalize_code(counterparty)
    if normalized_counterparty:
        filters.append(func.upper(TradeAccrualLot.counterparty) == normalized_counterparty)

    normalized_commodity_class = _normalize_code(commodity_class)
    if normalized_commodity_class:
        filters.append(func.upper(TradeAccrualLot.commodity_class) == normalized_commodity_class)

    normalized_accrual_currency_code = _normalize_code(accrual_currency_code)
    if normalized_accrual_currency_code:
        filters.append(func.upper(TradeAccrualLot.accrual_currency_code) == normalized_accrual_currency_code)

    normalized_status = _normalize_code(status_filter)
    if normalized_status:
        filters.append(func.upper(TradeAccrualLot.status) == normalized_status)

    return filters


def _to_lot_out(
    lot: TradeAccrualLot,
    *,
    entry_count: int,
    last_entry_at: datetime | None,
) -> dict[str, Any]:
    actualized_quantity = lot.actualized_quantity
    billed_quantity = lot.billed_quantity
    accrued_amount = lot.accrued_amount
    billed_amount = lot.billed_amount
    collected_amount = lot.collected_amount
    disputed_amount = lot.disputed_amount

    return {
        "accrual_lot_id": lot.accrual_lot_id,
        "trade_id": lot.trade_id,
        "delivery_id": lot.delivery_id,
        "leg_no": lot.leg_no,
        "book": lot.book,
        "portfolio": lot.portfolio,
        "counterparty": lot.counterparty,
        "commodity_class": lot.commodity_class,
        "commodity": lot.commodity,
        "trade_currency_code": lot.trade_currency_code,
        "accrual_currency_code": lot.accrual_currency_code,
        "quantity_unit_code": lot.quantity_unit_code,
        "planned_quantity": _decimal_to_float(lot.planned_quantity),
        "actualized_quantity": float(actualized_quantity),
        "billed_quantity": float(billed_quantity),
        "accrued_amount": float(accrued_amount),
        "billed_amount": float(billed_amount),
        "collected_amount": float(collected_amount),
        "disputed_amount": float(disputed_amount),
        "unbilled_quantity": float(actualized_quantity - billed_quantity),
        "unbilled_amount": float(accrued_amount - billed_amount),
        "billed_uncollected_amount": float(billed_amount - collected_amount),
        "net_open_amount": float(accrued_amount - collected_amount),
        "status": lot.status,
        "opened_at": _coerce_utc(lot.opened_at),
        "closed_at": _coerce_utc(lot.closed_at),
        "notes": lot.notes,
        "created_at": _coerce_utc(lot.created_at),
        "created_by": lot.created_by,
        "updated_at": _coerce_utc(lot.updated_at),
        "updated_by": lot.updated_by,
        "version": lot.version,
        "entry_count": entry_count,
        "last_entry_at": _coerce_utc(last_entry_at),
    }


def list_accrual_lots(
    db: Session,
    *,
    trade_id: str | None = None,
    delivery_id: str | None = None,
    book: str | None = None,
    portfolio: str | None = None,
    counterparty: str | None = None,
    commodity_class: str | None = None,
    accrual_currency_code: str | None = None,
    status_filter: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict[str, Any]]:
    stmt = (
        select(TradeAccrualLot)
        .where(
            *_lot_filters(
                trade_id=trade_id,
                delivery_id=delivery_id,
                book=book,
                portfolio=portfolio,
                counterparty=counterparty,
                commodity_class=commodity_class,
                accrual_currency_code=accrual_currency_code,
                status_filter=status_filter,
            )
        )
        .order_by(TradeAccrualLot.opened_at.desc(), TradeAccrualLot.accrual_lot_id.asc())
    )
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    lots = db.execute(stmt).scalars().all()
    if not lots:
        return []

    lot_ids = [lot.accrual_lot_id for lot in lots]
    entry_summary_rows = db.execute(
        select(
            TradeAccrualEntry.accrual_lot_id,
            func.count(TradeAccrualEntry.entry_id),
            func.max(TradeAccrualEntry.created_at),
        )
        .where(TradeAccrualEntry.accrual_lot_id.in_(lot_ids))
        .group_by(TradeAccrualEntry.accrual_lot_id)
    ).all()
    entry_summaries = {
        accrual_lot_id: {"entry_count": int(entry_count), "last_entry_at": _coerce_utc(last_entry_at)}
        for accrual_lot_id, entry_count, last_entry_at in entry_summary_rows
    }

    return [
        _to_lot_out(
            lot,
            entry_count=entry_summaries.get(lot.accrual_lot_id, {}).get("entry_count", 0),
            last_entry_at=entry_summaries.get(lot.accrual_lot_id, {}).get("last_entry_at"),
        )
        for lot in lots
    ]


def list_accrual_entries(
    db: Session,
    *,
    accrual_lot_id: str,
) -> list[dict[str, Any]]:
    lot = db.get(TradeAccrualLot, accrual_lot_id)
    if lot is None:
        raise LookupError(f"Accrual lot '{accrual_lot_id}' was not found.")

    rows = db.execute(
        select(TradeAccrualEntry)
        .where(TradeAccrualEntry.accrual_lot_id == accrual_lot_id)
        .order_by(
            TradeAccrualEntry.effective_date.asc(),
            TradeAccrualEntry.created_at.asc(),
            TradeAccrualEntry.entry_id.asc(),
        )
    ).scalars().all()

    return [
        {
            "entry_id": row.entry_id,
            "accrual_lot_id": row.accrual_lot_id,
            "entry_type": row.entry_type,
            "trade_id": row.trade_id,
            "delivery_id": row.delivery_id,
            "invoice_id": row.invoice_id,
            "payment_id": row.payment_id,
            "effective_date": row.effective_date,
            "currency_code": row.currency_code,
            "quantity_delta": _decimal_to_float(row.quantity_delta),
            "amount_delta": float(row.amount_delta),
            "reference_price": _decimal_to_float(row.reference_price),
            "price_index_code": row.price_index_code,
            "fx_rate": _decimal_to_float(row.fx_rate),
            "notes": row.notes,
            "created_at": _coerce_utc(row.created_at),
            "created_by": row.created_by,
        }
        for row in rows
    ]


def build_accrual_reconciliation_report(
    db: Session,
    *,
    trade_id: str | None = None,
    delivery_id: str | None = None,
    book: str | None = None,
    portfolio: str | None = None,
    counterparty: str | None = None,
    commodity_class: str | None = None,
    accrual_currency_code: str | None = None,
    status_filter: str | None = None,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    rows = db.execute(
        select(
            TradeAccrualLot.book,
            TradeAccrualLot.portfolio,
            TradeAccrualLot.counterparty,
            TradeAccrualLot.commodity_class,
            TradeAccrualLot.accrual_currency_code,
            func.count(TradeAccrualLot.accrual_lot_id),
            func.sum(TradeAccrualLot.actualized_quantity),
            func.sum(TradeAccrualLot.billed_quantity),
            func.sum(TradeAccrualLot.accrued_amount),
            func.sum(TradeAccrualLot.billed_amount),
            func.sum(TradeAccrualLot.collected_amount),
            func.sum(TradeAccrualLot.disputed_amount),
        )
        .where(
            *_lot_filters(
                trade_id=trade_id,
                delivery_id=delivery_id,
                book=book,
                portfolio=portfolio,
                counterparty=counterparty,
                commodity_class=commodity_class,
                accrual_currency_code=accrual_currency_code,
                status_filter=status_filter,
            )
        )
        .group_by(
            TradeAccrualLot.book,
            TradeAccrualLot.portfolio,
            TradeAccrualLot.counterparty,
            TradeAccrualLot.commodity_class,
            TradeAccrualLot.accrual_currency_code,
        )
        .order_by(
            TradeAccrualLot.book.asc(),
            TradeAccrualLot.portfolio.asc(),
            TradeAccrualLot.counterparty.asc(),
            TradeAccrualLot.commodity_class.asc(),
            TradeAccrualLot.accrual_currency_code.asc(),
        )
    ).all()

    report_rows: list[dict[str, Any]] = []
    currency_summaries: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "currency_code": "",
            "lot_count": 0,
            "accrued_amount": 0.0,
            "billed_amount": 0.0,
            "collected_amount": 0.0,
            "disputed_amount": 0.0,
            "unbilled_amount": 0.0,
            "billed_uncollected_amount": 0.0,
            "net_open_amount": 0.0,
        }
    )
    total_lot_count = 0

    for row in rows:
        (
            row_book,
            row_portfolio,
            row_counterparty,
            row_commodity_class,
            row_currency_code,
            row_lot_count,
            row_actualized_quantity,
            row_billed_quantity,
            row_accrued_amount,
            row_billed_amount,
            row_collected_amount,
            row_disputed_amount,
        ) = row

        actualized_quantity = Decimal(str(row_actualized_quantity or 0))
        billed_quantity = Decimal(str(row_billed_quantity or 0))
        accrued_amount = Decimal(str(row_accrued_amount or 0))
        billed_amount = Decimal(str(row_billed_amount or 0))
        collected_amount = Decimal(str(row_collected_amount or 0))
        disputed_amount = Decimal(str(row_disputed_amount or 0))
        unbilled_quantity = actualized_quantity - billed_quantity
        unbilled_amount = accrued_amount - billed_amount
        billed_uncollected_amount = billed_amount - collected_amount
        net_open_amount = accrued_amount - collected_amount
        lot_count = int(row_lot_count or 0)

        report_rows.append(
            {
                "book": row_book,
                "portfolio": row_portfolio,
                "counterparty": row_counterparty,
                "commodity_class": row_commodity_class,
                "currency_code": row_currency_code,
                "lot_count": lot_count,
                "actualized_quantity": float(actualized_quantity),
                "billed_quantity": float(billed_quantity),
                "unbilled_quantity": float(unbilled_quantity),
                "accrued_amount": float(accrued_amount),
                "billed_amount": float(billed_amount),
                "collected_amount": float(collected_amount),
                "disputed_amount": float(disputed_amount),
                "unbilled_amount": float(unbilled_amount),
                "billed_uncollected_amount": float(billed_uncollected_amount),
                "net_open_amount": float(net_open_amount),
            }
        )

        total_lot_count += lot_count
        currency_summary = currency_summaries[row_currency_code]
        currency_summary["currency_code"] = row_currency_code
        currency_summary["lot_count"] += lot_count
        currency_summary["accrued_amount"] += float(accrued_amount)
        currency_summary["billed_amount"] += float(billed_amount)
        currency_summary["collected_amount"] += float(collected_amount)
        currency_summary["disputed_amount"] += float(disputed_amount)
        currency_summary["unbilled_amount"] += float(unbilled_amount)
        currency_summary["billed_uncollected_amount"] += float(billed_uncollected_amount)
        currency_summary["net_open_amount"] += float(net_open_amount)

    return {
        "generated_at": generated_at,
        "row_count": len(report_rows),
        "lot_count": total_lot_count,
        "currency_summaries": sorted(currency_summaries.values(), key=lambda row: row["currency_code"]),
        "rows": report_rows,
    }
