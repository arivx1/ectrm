from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.event import Event
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.trade import Trade

ZERO = Decimal("0")
NEGATIVE_ONE = Decimal("-1")
POSITIVE_ONE = Decimal("1")
REALIZED_STATUS = "SETTLED"
CANCELLED_STATUS = "CANCELLED"
DEFAULT_PRICING_TYPE = "FIXED"
TRADE_PNL_BASIS = "trade_event_history_mark_to_market"
TRADE_PNL_METHODOLOGY = (
    "Event-sourced daily history valued from stored trade price terms and the latest available "
    "price-index observation for each day. FIXED uses the stored price differential, INDEX uses "
    "the market observation, HYBRID uses market observation plus differential, settlement changes "
    "move priced trades between realized and unrealized buckets, and trades remain unpriced until "
    "required market observations exist."
)


@dataclass
class PnlSnapshot:
    total_pnl: Decimal = ZERO
    realized_pnl: Decimal = ZERO
    unrealized_pnl: Decimal = ZERO
    priced_trade_count: int = 0
    realized_trade_count: int = 0
    unrealized_trade_count: int = 0


def _empty_trade_state(trade_id: str) -> dict[str, Any]:
    return {
        "trade_id": trade_id,
        "status": "ACTIVE",
        "book": None,
        "commodity_class": None,
        "pricing_type": DEFAULT_PRICING_TYPE,
        "price_index_code": None,
        "trade_side": None,
        "price": None,
        "volume": None,
        "settlement_status": "PENDING",
    }


def _trade_direction(state: dict[str, Any]) -> Decimal:
    volume = Decimal(str(state.get("volume") or 0))
    if volume < ZERO:
        return NEGATIVE_ONE

    normalized_side = str(state.get("trade_side") or "").strip().upper()
    if normalized_side == "SELL":
        return NEGATIVE_ONE

    return POSITIVE_ONE


def _mark_to_market_price(
    state: dict[str, Any],
    latest_marks: dict[str, Decimal],
) -> Decimal | None:
    pricing_type = str(state.get("pricing_type") or DEFAULT_PRICING_TYPE).strip().upper()
    stored_price = state.get("price")
    price_index_code = str(state.get("price_index_code") or "").strip().upper()
    market_price = latest_marks.get(price_index_code) if price_index_code else None

    if pricing_type == "FIXED":
        return Decimal(str(stored_price)) if stored_price is not None else None

    if pricing_type == "INDEX":
        return market_price

    if pricing_type == "HYBRID":
        if stored_price is None or market_price is None:
            return None
        return market_price + Decimal(str(stored_price))

    if stored_price is not None:
        return Decimal(str(stored_price))

    return market_price


def _pnl_snapshot_for_state(
    state: dict[str, Any] | None,
    latest_marks: dict[str, Decimal],
) -> PnlSnapshot:
    if state is None:
        return PnlSnapshot()

    if str(state.get("status") or "ACTIVE").strip().upper() == CANCELLED_STATUS:
        return PnlSnapshot()

    volume = state.get("volume")
    mark_to_market_price = _mark_to_market_price(state, latest_marks)
    if mark_to_market_price is None or volume is None:
        return PnlSnapshot()

    contribution = mark_to_market_price * abs(Decimal(str(volume))) * _trade_direction(state)
    settlement_status = str(state.get("settlement_status") or "PENDING").strip().upper()
    if settlement_status == REALIZED_STATUS:
        return PnlSnapshot(
            total_pnl=contribution,
            realized_pnl=contribution,
            unrealized_pnl=ZERO,
            priced_trade_count=1,
            realized_trade_count=1,
            unrealized_trade_count=0,
        )

    return PnlSnapshot(
        total_pnl=contribution,
        realized_pnl=ZERO,
        unrealized_pnl=contribution,
        priced_trade_count=1,
        realized_trade_count=0,
        unrealized_trade_count=1,
    )


def _subtract_pnl_snapshots(after: PnlSnapshot, before: PnlSnapshot) -> PnlSnapshot:
    return PnlSnapshot(
        total_pnl=after.total_pnl - before.total_pnl,
        realized_pnl=after.realized_pnl - before.realized_pnl,
        unrealized_pnl=after.unrealized_pnl - before.unrealized_pnl,
        priced_trade_count=after.priced_trade_count - before.priced_trade_count,
        realized_trade_count=after.realized_trade_count - before.realized_trade_count,
        unrealized_trade_count=after.unrealized_trade_count - before.unrealized_trade_count,
    )


def _add_pnl_snapshots(current: PnlSnapshot, delta: PnlSnapshot) -> PnlSnapshot:
    return PnlSnapshot(
        total_pnl=current.total_pnl + delta.total_pnl,
        realized_pnl=current.realized_pnl + delta.realized_pnl,
        unrealized_pnl=current.unrealized_pnl + delta.unrealized_pnl,
        priced_trade_count=current.priced_trade_count + delta.priced_trade_count,
        realized_trade_count=current.realized_trade_count + delta.realized_trade_count,
        unrealized_trade_count=current.unrealized_trade_count + delta.unrealized_trade_count,
    )


def _serialize_pnl_snapshot(snapshot: PnlSnapshot) -> dict[str, float | int]:
    return {
        "total_pnl": float(snapshot.total_pnl),
        "realized_pnl": float(snapshot.realized_pnl),
        "unrealized_pnl": float(snapshot.unrealized_pnl),
        "priced_trade_count": snapshot.priced_trade_count,
        "realized_trade_count": snapshot.realized_trade_count,
        "unrealized_trade_count": snapshot.unrealized_trade_count,
    }


def _empty_pnl_history_report(generated_at: datetime) -> dict[str, Any]:
    return {
        "generated_at": generated_at,
        "basis": TRADE_PNL_BASIS,
        "methodology": TRADE_PNL_METHODOLOGY,
        "point_count": 0,
        "points": [],
        "summary": _serialize_pnl_snapshot(PnlSnapshot()),
    }


def _normalize_filter_code(value: str | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _state_matches_filters(
    state: dict[str, Any],
    *,
    book: str | None,
    commodity_class: str | None,
) -> bool:
    if book and _normalize_filter_code(state.get("book")) != book:
        return False

    if commodity_class and _normalize_filter_code(state.get("commodity_class")) != commodity_class:
        return False

    return True


def _apply_trade_event(current: dict[str, Any] | None, event: Event) -> dict[str, Any]:
    payload = event.payload or {}

    if event.event_type == "TradeCreated":
        next_state = _empty_trade_state(event.aggregate_id)
        next_state["book"] = payload.get("book")
        next_state["commodity_class"] = payload.get("commodity_class")
        next_state["pricing_type"] = payload.get("pricing_type") or DEFAULT_PRICING_TYPE
        next_state["price_index_code"] = payload.get("price_index_code")
        next_state["trade_side"] = payload.get("trade_side")
        next_state["price"] = payload.get("price")
        next_state["volume"] = payload.get("volume")
        next_state["settlement_status"] = payload.get("settlement_status") or "PENDING"
        next_state["status"] = payload.get("status") or "ACTIVE"
        return next_state

    next_state = dict(current or _empty_trade_state(event.aggregate_id))

    if event.event_type == "TradeAmended":
        for field_name in (
            "book",
            "commodity_class",
            "pricing_type",
            "price_index_code",
            "trade_side",
            "price",
            "volume",
            "settlement_status",
            "status",
        ):
            if field_name in payload:
                next_state[field_name] = payload[field_name]
        return next_state

    if event.event_type == "TradeCancelled":
        next_state["status"] = CANCELLED_STATUS
        return next_state

    return next_state


def _legacy_trade_state(row: Trade) -> dict[str, Any]:
    return {
        "trade_id": row.trade_id,
        "status": row.status,
        "book": row.book,
        "commodity_class": row.commodity_class,
        "pricing_type": row.pricing_type,
        "price_index_code": row.price_index_code,
        "trade_side": row.trade_side,
        "price": row.price,
        "volume": row.volume,
        "settlement_status": row.settlement_status,
    }


def _load_daily_mark_updates(
    db: Session,
    *,
    price_index_codes: set[str],
    end_date: date,
) -> dict[date, dict[str, Decimal]]:
    if not price_index_codes:
        return {}

    rows = db.execute(
        select(PriceIndexObservation)
        .where(
            PriceIndexObservation.price_index_code.in_(sorted(price_index_codes)),
            PriceIndexObservation.observation_date <= end_date,
        )
        .order_by(
            PriceIndexObservation.observation_date.asc(),
            PriceIndexObservation.downloaded_at.asc(),
            PriceIndexObservation.id.asc(),
        )
    ).scalars().all()

    by_date: dict[date, dict[str, Decimal]] = {}
    for row in rows:
        daily_marks = by_date.setdefault(row.observation_date, {})
        daily_marks[row.price_index_code] = Decimal(str(row.value))

    return by_date


def build_pnl_history_report(
    db: Session,
    *,
    as_of: date | None = None,
    book: str | None = None,
    commodity_class: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    normalized_book = _normalize_filter_code(book)
    normalized_commodity_class = _normalize_filter_code(commodity_class)
    end_date = date_to or as_of or generated_at.date()
    window_start_date = date_from

    rows = db.execute(
        select(Event)
        .where(
            Event.aggregate_type == "trade",
            Event.event_type.in_(("TradeCreated", "TradeAmended", "TradeCancelled")),
        )
        .order_by(Event.occurred_at.asc(), Event.recorded_at.asc(), Event.event_id.asc())
    ).scalars().all()

    relevant_price_index_codes: set[str] = set()
    events_by_date: dict[date, list[Event]] = {}
    trade_ids_with_events: set[str] = set()

    for row in rows:
        trade_ids_with_events.add(row.aggregate_id)
        events_by_date.setdefault(row.occurred_at.date(), []).append(row)
        event_price_index_code = str((row.payload or {}).get("price_index_code") or "").strip().upper()
        if event_price_index_code:
            relevant_price_index_codes.add(event_price_index_code)

    legacy_rows = db.execute(
        select(Trade)
        .where(Trade.status != CANCELLED_STATUS)
        .order_by(Trade.created_at.asc(), Trade.trade_id.asc())
    ).scalars().all()
    legacy_starts_by_date: dict[date, list[dict[str, Any]]] = {}
    start_dates: list[date] = list(events_by_date.keys())

    for row in legacy_rows:
        anchor = row.execution_timestamp or row.created_at or generated_at
        anchor_date = anchor.date()
        start_dates.append(anchor_date)
        if row.price_index_code:
            relevant_price_index_codes.add(row.price_index_code.strip().upper())

        if row.trade_id in trade_ids_with_events:
            continue

        legacy_starts_by_date.setdefault(anchor_date, []).append(_legacy_trade_state(row))

    if not start_dates:
        return _empty_pnl_history_report(generated_at)

    daily_mark_updates = _load_daily_mark_updates(
        db,
        price_index_codes=relevant_price_index_codes,
        end_date=end_date,
    )

    start_date = min(start_dates)
    if end_date < start_date:
        return _empty_pnl_history_report(generated_at)

    if window_start_date and window_start_date > end_date:
        return _empty_pnl_history_report(generated_at)

    current_date = start_date
    active_states: dict[str, dict[str, Any]] = {}
    latest_marks: dict[str, Decimal] = {}
    latest_snapshot = PnlSnapshot()
    points: list[dict[str, Any]] = []
    while current_date <= end_date:
        latest_marks.update(daily_mark_updates.get(current_date, {}))

        for state in legacy_starts_by_date.get(current_date, []):
            active_states[state["trade_id"]] = dict(state)

        for row in events_by_date.get(current_date, []):
            current_state = active_states.get(row.aggregate_id)
            active_states[row.aggregate_id] = _apply_trade_event(current_state, row)

        latest_snapshot = PnlSnapshot()
        for state in active_states.values():
            if not _state_matches_filters(
                state,
                book=normalized_book,
                commodity_class=normalized_commodity_class,
            ):
                continue
            latest_snapshot = _add_pnl_snapshots(
                latest_snapshot,
                _pnl_snapshot_for_state(state, latest_marks),
            )

        if window_start_date is None or current_date >= window_start_date:
            points.append(
                {
                    "date": current_date,
                    **_serialize_pnl_snapshot(latest_snapshot),
                }
            )
        current_date += timedelta(days=1)

    return {
        "generated_at": generated_at,
        "basis": TRADE_PNL_BASIS,
        "methodology": TRADE_PNL_METHODOLOGY,
        "point_count": len(points),
        "points": points,
        "summary": _serialize_pnl_snapshot(latest_snapshot),
    }
