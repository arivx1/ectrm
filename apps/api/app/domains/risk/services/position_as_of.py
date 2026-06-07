from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg

ZERO = Decimal("0")
POSITION_AS_OF_BASIS_V1 = "trade_event_replay_position_as_of_v1"
POSITION_AS_OF_SOURCE_EVENT_REPLAY = "EVENT_REPLAY"
POSITION_AS_OF_SOURCE_LEGACY_PROJECTION = "LEGACY_PROJECTION"
POSITION_AS_OF_SOURCE_MIXED = "MIXED"
POSITION_AS_OF_METHODOLOGY = (
    "Positions are rebuilt by replaying trade lifecycle events through the requested as-of date, "
    "excluding inactive and option trades, and grouping active signed quantities by book, "
    "portfolio, commodity, location, tenor, physical/financial status, pricing basis, side, and "
    "unit. Legacy projection rows without trade events are included only when their trustworthy "
    "projection date is on or before the as-of date, and are labelled separately from replayed "
    "event history."
)
ACTIVE_STATUS = "ACTIVE"
CANCELLED_STATUS = "CANCELLED"
OPTION_INSTRUMENT_TYPE = "OPTION"
DEFAULT_INSTRUMENT_TYPE = "LINEAR"
DEFAULT_TRADE_STRUCTURE = "SINGLE"
DEFAULT_TRADE_NATURE = "PHYSICAL"
DEFAULT_PRICING_TYPE = "FIXED"
DEFAULT_SIDE = "BUY"
TRADE_LIFECYCLE_EVENT_TYPES = (
    "TradeCreated",
    "TradeAmended",
    "TradeCancelled",
    "OptionExercised",
    "OptionExpired",
    "OptionAssigned",
)
OPTION_LIFECYCLE_EVENT_TO_STATUS = {
    "OptionExercised": "EXERCISED",
    "OptionExpired": "EXPIRED",
    "OptionAssigned": "ASSIGNED",
}


@dataclass(frozen=True)
class PositionFactorKey:
    book: str | None
    portfolio: str | None
    commodity_class: str | None
    commodity: str
    location_code: str | None
    tenor_start: date | None
    tenor_end: date | None
    trade_nature: str
    pricing_type: str
    price_index_code: str | None
    price_basis: str
    side: str
    quantity_unit_code: str | None


@dataclass
class PositionContribution:
    trade_id: str
    key: PositionFactorKey
    net_volume: Decimal
    source_basis: str
    latest_change_at: datetime | None
    replayed_event_count: int


@dataclass
class PositionAccumulator:
    key: PositionFactorKey
    net_volume: Decimal = ZERO
    long_volume: Decimal = ZERO
    short_volume: Decimal = ZERO
    trade_ids: set[str] = field(default_factory=set)
    source_bases: set[str] = field(default_factory=set)
    latest_change_at: datetime | None = None
    replayed_event_counts_by_trade: dict[str, int] = field(default_factory=dict)
    legacy_trade_ids: set[str] = field(default_factory=set)

    def add(self, contribution: PositionContribution) -> None:
        self.net_volume += contribution.net_volume
        if contribution.net_volume > ZERO:
            self.long_volume += contribution.net_volume
        elif contribution.net_volume < ZERO:
            self.short_volume += abs(contribution.net_volume)

        self.trade_ids.add(contribution.trade_id)
        self.source_bases.add(contribution.source_basis)
        if contribution.source_basis == POSITION_AS_OF_SOURCE_LEGACY_PROJECTION:
            self.legacy_trade_ids.add(contribution.trade_id)
        else:
            self.replayed_event_counts_by_trade[contribution.trade_id] = contribution.replayed_event_count

        if (
            contribution.latest_change_at is not None
            and (self.latest_change_at is None or contribution.latest_change_at > self.latest_change_at)
        ):
            self.latest_change_at = contribution.latest_change_at


def build_position_as_of_report(
    db: Session,
    *,
    as_of: date | datetime | None = None,
    book: str | None = None,
    portfolio: str | None = None,
    commodity_class: str | None = None,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    resolved_as_of = _coerce_as_of_date(as_of, generated_at=generated_at)
    replay_cutoff = datetime.combine(resolved_as_of + timedelta(days=1), time.min, tzinfo=timezone.utc)

    normalized_book = _normalize_code_or_none(book)
    normalized_portfolio = _normalize_code_or_none(portfolio)
    normalized_commodity_class = _normalize_code_or_none(commodity_class)

    event_rows = _load_replay_events(db, replay_cutoff=replay_cutoff)
    states_by_trade_id = _replay_trade_states(event_rows)
    event_trade_ids = set(states_by_trade_id)
    legacy_rows = _load_legacy_projection_rows(
        db,
        replay_cutoff=replay_cutoff,
        generated_at=generated_at,
        excluded_trade_ids=event_trade_ids,
    )

    contributions = [
        *(
            contribution
            for state in states_by_trade_id.values()
            for contribution in _contributions_for_state(
                state,
                source_basis=POSITION_AS_OF_SOURCE_EVENT_REPLAY,
            )
        ),
        *(
            contribution
            for row in legacy_rows
            for contribution in _contributions_for_legacy_trade(row, db=db, generated_at=generated_at)
        ),
    ]
    filtered_contributions = [
        contribution
        for contribution in contributions
        if _matches_filters(
            contribution.key,
            book=normalized_book,
            portfolio=normalized_portfolio,
            commodity_class=normalized_commodity_class,
        )
    ]

    accumulators: dict[PositionFactorKey, PositionAccumulator] = {}
    for contribution in filtered_contributions:
        if contribution.net_volume == ZERO:
            continue
        accumulator = accumulators.setdefault(
            contribution.key,
            PositionAccumulator(key=contribution.key),
        )
        accumulator.add(contribution)

    rows = [_serialize_position_row(accumulator) for accumulator in accumulators.values()]
    rows.sort(
        key=lambda row: (
            str(row.get("book") or ""),
            str(row.get("portfolio") or ""),
            str(row.get("commodity_class") or ""),
            str(row.get("commodity") or ""),
            str(row.get("location_code") or ""),
            str(row.get("tenor_start") or ""),
            str(row.get("tenor_end") or ""),
            str(row.get("price_basis") or ""),
            str(row.get("side") or ""),
        )
    )

    net_volume = sum((Decimal(str(row["net_volume"])) for row in rows), ZERO)
    long_volume = sum((Decimal(str(row["long_volume"])) for row in rows), ZERO)
    short_volume = sum((Decimal(str(row["short_volume"])) for row in rows), ZERO)
    event_replayed_trade_ids = {
        contribution.trade_id
        for contribution in filtered_contributions
        if contribution.source_basis == POSITION_AS_OF_SOURCE_EVENT_REPLAY
    }
    legacy_projection_trade_ids = {
        contribution.trade_id
        for contribution in filtered_contributions
        if contribution.source_basis == POSITION_AS_OF_SOURCE_LEGACY_PROJECTION
    }
    latest_replayed_event_at = max(
        (
            state.get("latest_event_at")
            for state in states_by_trade_id.values()
            if isinstance(state.get("latest_event_at"), datetime)
        ),
        default=None,
    )

    return {
        "generated_at": generated_at,
        "as_of": resolved_as_of,
        "basis": POSITION_AS_OF_BASIS_V1,
        "methodology": POSITION_AS_OF_METHODOLOGY,
        "row_count": len(rows),
        "summary": {
            "net_volume": float(net_volume),
            "long_volume": float(long_volume),
            "short_volume": float(short_volume),
            "trade_count": len(event_replayed_trade_ids | legacy_projection_trade_ids),
            "event_replayed_trade_count": len(event_replayed_trade_ids),
            "legacy_projection_trade_count": len(legacy_projection_trade_ids),
            "replayed_event_count": len(event_rows),
            "latest_replayed_event_at": latest_replayed_event_at,
        },
        "rows": rows,
    }


def _load_replay_events(db: Session, *, replay_cutoff: datetime) -> list[Event]:
    return db.execute(
        select(Event)
        .where(
            Event.aggregate_type == "trade",
            Event.event_type.in_(TRADE_LIFECYCLE_EVENT_TYPES),
            Event.occurred_at < replay_cutoff,
        )
        .order_by(Event.occurred_at.asc(), Event.recorded_at.asc(), Event.event_id.asc())
    ).scalars().all()


def _replay_trade_states(events: Iterable[Event]) -> dict[str, dict[str, Any]]:
    states_by_trade_id: dict[str, dict[str, Any]] = {}
    for event in events:
        current = states_by_trade_id.get(event.aggregate_id)
        states_by_trade_id[event.aggregate_id] = _apply_trade_event(current, event)
    return states_by_trade_id


def _apply_trade_event(current: dict[str, Any] | None, event: Event) -> dict[str, Any]:
    payload = event.payload or {}
    if event.event_type == "TradeCreated":
        state = _empty_trade_state(event.aggregate_id)
        for field_name in _TRADE_STATE_PAYLOAD_FIELDS:
            if field_name in payload:
                state[field_name] = payload[field_name]
        state["legs"] = _normalize_legs(payload.get("legs"))
    else:
        state = dict(current or _empty_trade_state(event.aggregate_id))
        if event.event_type == "TradeAmended":
            for field_name in _TRADE_STATE_PAYLOAD_FIELDS:
                if field_name in payload:
                    state[field_name] = payload[field_name]
            if "legs" in payload:
                state["legs"] = _normalize_legs(payload.get("legs"))
        elif event.event_type == "TradeCancelled":
            state["status"] = CANCELLED_STATUS
        elif event.event_type in OPTION_LIFECYCLE_EVENT_TO_STATUS:
            state["status"] = OPTION_LIFECYCLE_EVENT_TO_STATUS[event.event_type]

    state["event_count"] = int(state.get("event_count") or 0) + 1
    state["latest_event_at"] = event.occurred_at
    state["latest_event_id"] = event.event_id
    return state


_TRADE_STATE_PAYLOAD_FIELDS = (
    "instrument_type",
    "trade_nature",
    "trade_structure",
    "trade_side",
    "book",
    "portfolio",
    "commodity_class",
    "commodity",
    "location_code",
    "delivery_start",
    "delivery_end",
    "effective_start_date",
    "effective_end_date",
    "unit_of_measure",
    "pricing_type",
    "price_index_code",
    "volume",
    "status",
)


def _empty_trade_state(trade_id: str) -> dict[str, Any]:
    return {
        "trade_id": trade_id,
        "instrument_type": DEFAULT_INSTRUMENT_TYPE,
        "trade_nature": DEFAULT_TRADE_NATURE,
        "trade_structure": DEFAULT_TRADE_STRUCTURE,
        "trade_side": DEFAULT_SIDE,
        "book": None,
        "portfolio": None,
        "commodity_class": None,
        "commodity": "UNKNOWN",
        "location_code": None,
        "delivery_start": None,
        "delivery_end": None,
        "effective_start_date": None,
        "effective_end_date": None,
        "unit_of_measure": None,
        "pricing_type": DEFAULT_PRICING_TYPE,
        "price_index_code": None,
        "volume": None,
        "status": ACTIVE_STATUS,
        "legs": [],
        "event_count": 0,
        "latest_event_at": None,
        "latest_event_id": None,
    }


def _normalize_legs(value: object | None) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(leg) for leg in value if isinstance(leg, dict)]


def _contributions_for_state(
    state: dict[str, Any],
    *,
    source_basis: str,
) -> list[PositionContribution]:
    if not _state_is_positionable(state):
        return []

    if _normalize_code(state.get("trade_structure")) == "SWAP" and state.get("legs"):
        return [
            _contribution_from_payload(
                state,
                leg,
                source_basis=source_basis,
                latest_change_at=state.get("latest_event_at"),
                replayed_event_count=int(state.get("event_count") or 0),
            )
            for leg in state.get("legs", [])
            if isinstance(leg, dict)
        ]

    return [
        _contribution_from_payload(
            state,
            {},
            source_basis=source_basis,
            latest_change_at=state.get("latest_event_at"),
            replayed_event_count=int(state.get("event_count") or 0),
        )
    ]


def _state_is_positionable(state: dict[str, Any]) -> bool:
    if _normalize_code(state.get("status")) != ACTIVE_STATUS:
        return False
    if _normalize_code(state.get("instrument_type")) == OPTION_INSTRUMENT_TYPE:
        return False
    return True


def _contribution_from_payload(
    state: dict[str, Any],
    leg: dict[str, Any],
    *,
    source_basis: str,
    latest_change_at: object | None,
    replayed_event_count: int,
) -> PositionContribution:
    side = _normalize_code(leg.get("side")) if leg else None
    side = side or _normalize_code(state.get("trade_side")) or DEFAULT_SIDE
    raw_volume = leg.get("volume", leg.get("quantity")) if leg else None
    if raw_volume is None:
        raw_volume = state.get("volume")
    net_volume = _signed_volume(side, raw_volume)
    commodity_class = _normalize_code_or_none(leg.get("commodity_class") if leg else None)
    commodity = _normalize_code_or_none(leg.get("commodity") or leg.get("commodity_code") if leg else None)
    location_code = _normalize_code_or_none(leg.get("location_code") if leg else None)
    quantity_unit_code = _normalize_code_or_none(leg.get("quantity_unit_code") if leg else None)
    tenor_start = _date_or_none(leg.get("delivery_start") if leg else None)
    tenor_end = _date_or_none(leg.get("delivery_end") if leg else None)

    commodity_class = commodity_class or _normalize_code_or_none(state.get("commodity_class"))
    commodity = commodity or _normalize_code_or_none(state.get("commodity")) or "UNKNOWN"
    location_code = location_code or _normalize_code_or_none(state.get("location_code"))
    quantity_unit_code = quantity_unit_code or _normalize_code_or_none(state.get("unit_of_measure"))
    tenor_start = tenor_start or _date_or_none(state.get("delivery_start")) or _date_or_none(state.get("effective_start_date"))
    tenor_end = tenor_end or _date_or_none(state.get("delivery_end")) or _date_or_none(state.get("effective_end_date"))
    pricing_type = _normalize_code(state.get("pricing_type")) or DEFAULT_PRICING_TYPE
    price_index_code = _normalize_code_or_none(state.get("price_index_code"))
    trade_nature = _normalize_code(state.get("trade_nature")) or DEFAULT_TRADE_NATURE

    return PositionContribution(
        trade_id=str(state.get("trade_id")),
        key=PositionFactorKey(
            book=_normalize_code_or_none(state.get("book")),
            portfolio=_normalize_code_or_none(state.get("portfolio")),
            commodity_class=commodity_class,
            commodity=commodity,
            location_code=location_code,
            tenor_start=tenor_start,
            tenor_end=tenor_end,
            trade_nature=trade_nature,
            pricing_type=pricing_type,
            price_index_code=price_index_code,
            price_basis=_price_basis(pricing_type, price_index_code),
            side=side,
            quantity_unit_code=quantity_unit_code,
        ),
        net_volume=net_volume,
        source_basis=source_basis,
        latest_change_at=latest_change_at if isinstance(latest_change_at, datetime) else None,
        replayed_event_count=replayed_event_count,
    )


def _signed_volume(side: object | None, quantity: object | None) -> Decimal:
    volume = Decimal(str(quantity or 0))
    normalized_side = _normalize_code(side) or DEFAULT_SIDE
    if volume < ZERO:
        return volume
    if normalized_side == "SELL":
        return volume * Decimal("-1")
    return volume


def _price_basis(pricing_type: str, price_index_code: str | None) -> str:
    if price_index_code:
        return f"{pricing_type}:{price_index_code}"
    return pricing_type


def _load_legacy_projection_rows(
    db: Session,
    *,
    replay_cutoff: datetime,
    generated_at: datetime,
    excluded_trade_ids: set[str],
) -> list[Trade]:
    rows = db.execute(
        select(Trade)
        .where(Trade.status == ACTIVE_STATUS)
        .order_by(Trade.created_at.asc(), Trade.trade_id.asc())
    ).scalars().all()
    return [
        row
        for row in rows
        if row.trade_id not in excluded_trade_ids
        and _legacy_trade_trustworthy_timestamp(row, generated_at=generated_at) < replay_cutoff
    ]


def _legacy_trade_trustworthy_timestamp(row: Trade, *, generated_at: datetime) -> datetime:
    anchor = _ensure_utc(row.execution_timestamp or row.created_at or generated_at)
    projection_timestamp = _ensure_utc(row.updated_at or row.created_at or generated_at)
    return max(anchor, projection_timestamp)


def _contributions_for_legacy_trade(
    row: Trade,
    *,
    db: Session,
    generated_at: datetime,
) -> list[PositionContribution]:
    state = {
        "trade_id": row.trade_id,
        "instrument_type": row.instrument_type,
        "trade_nature": row.trade_nature,
        "trade_structure": row.trade_structure,
        "trade_side": row.trade_side,
        "book": row.book,
        "portfolio": row.portfolio,
        "commodity_class": row.commodity_class,
        "commodity": row.commodity,
        "location_code": row.location_code,
        "delivery_start": row.delivery_start,
        "delivery_end": row.delivery_end,
        "effective_start_date": row.effective_start_date,
        "effective_end_date": row.effective_end_date,
        "unit_of_measure": row.unit_of_measure,
        "pricing_type": row.pricing_type,
        "price_index_code": row.price_index_code,
        "volume": row.volume,
        "status": row.status,
        "event_count": 0,
        "latest_event_at": row.updated_at or row.created_at or generated_at,
        "legs": [],
    }
    legs = db.execute(
        select(TradeLeg)
        .where(TradeLeg.trade_id == row.trade_id)
        .order_by(TradeLeg.leg_no.asc())
    ).scalars().all()
    if legs:
        state["legs"] = [
            {
                "side": leg.side,
                "commodity_class": leg.commodity_class,
                "commodity": leg.commodity_code,
                "location_code": leg.location_code,
                "volume": leg.quantity,
                "quantity_unit_code": leg.quantity_unit_code,
                "delivery_start": leg.delivery_start,
                "delivery_end": leg.delivery_end,
            }
            for leg in legs
        ]

    return _contributions_for_state(
        state,
        source_basis=POSITION_AS_OF_SOURCE_LEGACY_PROJECTION,
    )


def _serialize_position_row(accumulator: PositionAccumulator) -> dict[str, Any]:
    key = accumulator.key
    source_basis = (
        next(iter(accumulator.source_bases))
        if len(accumulator.source_bases) == 1
        else POSITION_AS_OF_SOURCE_MIXED
    )
    return {
        "book": key.book,
        "portfolio": key.portfolio,
        "commodity_class": key.commodity_class,
        "commodity": key.commodity,
        "location_code": key.location_code,
        "tenor_start": key.tenor_start,
        "tenor_end": key.tenor_end,
        "trade_nature": key.trade_nature,
        "physical_financial_status": key.trade_nature,
        "pricing_type": key.pricing_type,
        "price_index_code": key.price_index_code,
        "price_basis": key.price_basis,
        "side": key.side,
        "quantity_unit_code": key.quantity_unit_code,
        "net_volume": float(accumulator.net_volume),
        "long_volume": float(accumulator.long_volume),
        "short_volume": float(accumulator.short_volume),
        "trade_count": len(accumulator.trade_ids),
        "contributing_trade_ids": sorted(accumulator.trade_ids),
        "source_basis": source_basis,
        "latest_change_at": accumulator.latest_change_at,
        "replayed_event_count": sum(accumulator.replayed_event_counts_by_trade.values()),
        "legacy_projection_count": len(accumulator.legacy_trade_ids),
    }


def _matches_filters(
    key: PositionFactorKey,
    *,
    book: str | None,
    portfolio: str | None,
    commodity_class: str | None,
) -> bool:
    if book and key.book != book:
        return False
    if portfolio and key.portfolio != portfolio:
        return False
    if commodity_class and key.commodity_class != commodity_class:
        return False
    return True


def _coerce_as_of_date(value: date | datetime | None, *, generated_at: datetime) -> date:
    if value is None:
        return generated_at.date()
    if isinstance(value, datetime):
        return value.date()
    return value


def _normalize_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _normalize_code_or_none(value: object | None) -> str | None:
    return _normalize_code(value)


def _date_or_none(value: object | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
