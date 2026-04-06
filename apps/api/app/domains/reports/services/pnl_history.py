from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade

ZERO = Decimal("0")
NEGATIVE_ONE = Decimal("-1")
POSITIVE_ONE = Decimal("1")
REALIZED_STATUS = "SETTLED"
CANCELLED_STATUS = "CANCELLED"
TRADE_PNL_BASIS = "trade_event_history_proxy"
TRADE_PNL_METHODOLOGY = (
    "Event-sourced daily history derived from stored price differentials times volume. "
    "Settlement changes move priced trades between realized and unrealized buckets, "
    "and unpriced trades are excluded."
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


def _pnl_snapshot_for_state(state: dict[str, Any] | None) -> PnlSnapshot:
    if state is None:
        return PnlSnapshot()

    if str(state.get("status") or "ACTIVE").strip().upper() == CANCELLED_STATUS:
        return PnlSnapshot()

    price = state.get("price")
    volume = state.get("volume")
    if price is None or volume is None:
        return PnlSnapshot()

    contribution = Decimal(str(price)) * abs(Decimal(str(volume))) * _trade_direction(state)
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


def _apply_trade_event(current: dict[str, Any] | None, event: Event) -> dict[str, Any]:
    payload = event.payload or {}

    if event.event_type == "TradeCreated":
        next_state = _empty_trade_state(event.aggregate_id)
        next_state["trade_side"] = payload.get("trade_side")
        next_state["price"] = payload.get("price")
        next_state["volume"] = payload.get("volume")
        next_state["settlement_status"] = payload.get("settlement_status") or "PENDING"
        next_state["status"] = payload.get("status") or "ACTIVE"
        return next_state

    next_state = dict(current or _empty_trade_state(event.aggregate_id))

    if event.event_type == "TradeAmended":
        for field_name in ("trade_side", "price", "volume", "settlement_status", "status"):
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
        "trade_side": row.trade_side,
        "price": row.price,
        "volume": row.volume,
        "settlement_status": row.settlement_status,
    }


def build_pnl_history_report(db: Session, *, as_of: date | None = None) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    end_date = as_of or generated_at.date()

    rows = db.execute(
        select(Event)
        .where(
            Event.aggregate_type == "trade",
            Event.event_type.in_(("TradeCreated", "TradeAmended", "TradeCancelled")),
        )
        .order_by(Event.occurred_at.asc(), Event.recorded_at.asc(), Event.event_id.asc())
    ).scalars().all()

    state_by_trade: dict[str, dict[str, Any]] = {}
    trade_ids_with_events: set[str] = set()
    daily_deltas: dict[date, PnlSnapshot] = {}

    for row in rows:
        trade_ids_with_events.add(row.aggregate_id)

        before_state = state_by_trade.get(row.aggregate_id)
        before_snapshot = _pnl_snapshot_for_state(before_state)
        after_state = _apply_trade_event(before_state, row)
        after_snapshot = _pnl_snapshot_for_state(after_state)
        state_by_trade[row.aggregate_id] = after_state

        event_date = row.occurred_at.date()
        delta = _subtract_pnl_snapshots(after_snapshot, before_snapshot)
        daily_deltas[event_date] = _add_pnl_snapshots(daily_deltas.get(event_date, PnlSnapshot()), delta)

    legacy_rows = db.execute(
        select(Trade)
        .where(Trade.status != CANCELLED_STATUS)
        .order_by(Trade.created_at.asc(), Trade.trade_id.asc())
    ).scalars().all()

    for row in legacy_rows:
        if row.trade_id in trade_ids_with_events:
            continue

        anchor = row.execution_timestamp or row.created_at or generated_at
        anchor_date = anchor.date()
        snapshot = _pnl_snapshot_for_state(_legacy_trade_state(row))
        daily_deltas[anchor_date] = _add_pnl_snapshots(daily_deltas.get(anchor_date, PnlSnapshot()), snapshot)

    if not daily_deltas:
        return {
            "generated_at": generated_at,
            "basis": TRADE_PNL_BASIS,
            "methodology": TRADE_PNL_METHODOLOGY,
            "point_count": 0,
            "points": [],
            "summary": _serialize_pnl_snapshot(PnlSnapshot()),
        }

    start_date = min(daily_deltas)
    if end_date < start_date:
        end_date = start_date

    current_date = start_date
    running = PnlSnapshot()
    points: list[dict[str, Any]] = []
    while current_date <= end_date:
        running = _add_pnl_snapshots(running, daily_deltas.get(current_date, PnlSnapshot()))
        points.append(
            {
                "date": current_date,
                **_serialize_pnl_snapshot(running),
            }
        )
        current_date += timedelta(days=1)

    return {
        "generated_at": generated_at,
        "basis": TRADE_PNL_BASIS,
        "methodology": TRADE_PNL_METHODOLOGY,
        "point_count": len(points),
        "points": points,
        "summary": _serialize_pnl_snapshot(running),
    }
