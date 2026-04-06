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
from apps.api.app.models.trade_price_term import TradePriceTerm

ZERO = Decimal("0")
NEGATIVE_ONE = Decimal("-1")
POSITIVE_ONE = Decimal("1")
REALIZED_STATUS = "SETTLED"
CANCELLED_STATUS = "CANCELLED"
ACTIVE_STATUS = "ACTIVE"
OPTION_LIFECYCLE_EVENT_TO_STATUS = {
    "OptionExercised": "EXERCISED",
    "OptionExpired": "EXPIRED",
    "OptionAssigned": "ASSIGNED",
}
DEFAULT_PRICING_TYPE = "FIXED"
DEFAULT_INSTRUMENT_TYPE = "LINEAR"
DEFAULT_TRADE_STRUCTURE = "SINGLE"
TRADE_PNL_BASIS = "trade_event_history_mark_to_market"
TRADE_PNL_METHODOLOGY = (
    "Event-sourced daily history values trade lifecycle state against the latest available "
    "price-index observation for each day. End-of-window trade breakdown prefers the projected "
    "primary price term when the report reaches the latest known trade state. v1 values only "
    "LINEAR single-leg trades: FIXED uses the fixed price, INDEX uses the market observation, "
    "HYBRID uses market observation plus fixed differential, settlement changes move priced "
    "trades between realized and unrealized buckets, and OPTION, SWAP, and FORMULA trades stay "
    "out of MTM totals until dedicated valuation support lands."
)
SUPPORTED_VALUATION_INSTRUMENT = "LINEAR"
SUPPORTED_VALUATION_STRUCTURE = "SINGLE"
SUPPORTED_VALUATION_PRICING_TYPES = {"FIXED", "INDEX", "HYBRID"}
VALUATION_STATUS_VALUED = "VALUED"
VALUATION_STATUS_UNSUPPORTED_INSTRUMENT = "UNSUPPORTED_INSTRUMENT"
VALUATION_STATUS_UNSUPPORTED_STRUCTURE = "UNSUPPORTED_STRUCTURE"
VALUATION_STATUS_UNSUPPORTED_PRICING_TYPE = "UNSUPPORTED_PRICING_TYPE"
VALUATION_STATUS_UNPRICED_MISSING_QUANTITY = "UNPRICED_MISSING_QUANTITY"
VALUATION_STATUS_UNPRICED_MISSING_FIXED_PRICE = "UNPRICED_MISSING_FIXED_PRICE"
VALUATION_STATUS_UNPRICED_MISSING_PRICE_INDEX = "UNPRICED_MISSING_PRICE_INDEX"
VALUATION_STATUS_UNPRICED_MISSING_MARK = "UNPRICED_MISSING_MARK"
PRICING_SOURCE_EVENT_STATE = "EVENT_STATE"
PRICING_SOURCE_PRIMARY_PRICE_TERM = "PRIMARY_PRICE_TERM"


@dataclass
class PnlSnapshot:
    total_pnl: Decimal = ZERO
    realized_pnl: Decimal = ZERO
    unrealized_pnl: Decimal = ZERO
    priced_trade_count: int = 0
    realized_trade_count: int = 0
    unrealized_trade_count: int = 0


@dataclass
class PrimaryPriceTerm:
    trade_id: str
    pricing_type: str
    fixed_price: Decimal | None
    price_index_code: str | None
    currency_code: str | None
    price_unit_code: str | None


@dataclass
class TradeValuation:
    trade_id: str
    book: str | None
    commodity_class: str | None
    instrument_type: str
    trade_structure: str
    trade_side: str | None
    settlement_status: str
    pnl_bucket: str
    pricing_type: str
    pricing_source: str
    fixed_price: Decimal | None
    price_index_code: str | None
    market_price: Decimal | None
    effective_mark: Decimal | None
    quantity: Decimal | None
    direction: int
    trade_currency_code: str | None
    price_unit_code: str | None
    pnl_contribution: Decimal | None
    valuation_status: str
    valuation_status_reason: str | None
    included_in_totals: bool


def _empty_trade_state(trade_id: str) -> dict[str, Any]:
    return {
        "trade_id": trade_id,
        "status": "ACTIVE",
        "instrument_type": DEFAULT_INSTRUMENT_TYPE,
        "trade_structure": DEFAULT_TRADE_STRUCTURE,
        "book": None,
        "commodity_class": None,
        "pricing_type": DEFAULT_PRICING_TYPE,
        "price_index_code": None,
        "trade_currency_code": None,
        "price_unit_code": None,
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


def _normalize_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _normalize_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _decimal_or_none(value: object | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _load_primary_price_terms(
    db: Session,
    *,
    trade_ids: list[str],
) -> dict[str, PrimaryPriceTerm]:
    if not trade_ids:
        return {}

    rows = db.execute(
        select(TradePriceTerm)
        .where(
            TradePriceTerm.trade_id.in_(trade_ids),
            TradePriceTerm.term_no == 1,
        )
        .order_by(TradePriceTerm.trade_id.asc(), TradePriceTerm.updated_at.desc())
    ).scalars().all()

    terms_by_trade_id: dict[str, PrimaryPriceTerm] = {}
    for row in rows:
        if row.trade_id in terms_by_trade_id:
            continue
        terms_by_trade_id[row.trade_id] = PrimaryPriceTerm(
            trade_id=row.trade_id,
            pricing_type=_normalize_code(row.pricing_type) or DEFAULT_PRICING_TYPE,
            fixed_price=_decimal_or_none(row.fixed_price),
            price_index_code=_normalize_code(row.price_index_code),
            currency_code=_normalize_code(row.currency_code),
            price_unit_code=_normalize_code(row.price_unit_code),
        )

    return terms_by_trade_id


def _pricing_inputs_for_state(
    state: dict[str, Any],
    primary_price_term: PrimaryPriceTerm | None,
) -> dict[str, Any]:
    event_pricing_type = _normalize_code(state.get("pricing_type")) or DEFAULT_PRICING_TYPE
    event_fixed_price = _decimal_or_none(state.get("price"))
    event_price_index_code = _normalize_code(state.get("price_index_code"))
    event_trade_currency_code = _normalize_code(state.get("trade_currency_code"))
    event_price_unit_code = _normalize_code(state.get("price_unit_code"))

    if primary_price_term is None:
        return {
            "pricing_type": event_pricing_type,
            "fixed_price": event_fixed_price,
            "price_index_code": event_price_index_code,
            "trade_currency_code": event_trade_currency_code,
            "price_unit_code": event_price_unit_code,
            "pricing_source": PRICING_SOURCE_EVENT_STATE,
        }

    return {
        "pricing_type": primary_price_term.pricing_type or event_pricing_type,
        "fixed_price": (
            primary_price_term.fixed_price
            if primary_price_term.fixed_price is not None
            else event_fixed_price
        ),
        "price_index_code": primary_price_term.price_index_code or event_price_index_code,
        "trade_currency_code": primary_price_term.currency_code or event_trade_currency_code,
        "price_unit_code": primary_price_term.price_unit_code or event_price_unit_code,
        "pricing_source": PRICING_SOURCE_PRIMARY_PRICE_TERM,
    }


def _build_trade_valuation(
    state: dict[str, Any] | None,
    latest_marks: dict[str, Decimal],
    *,
    primary_price_term: PrimaryPriceTerm | None = None,
) -> TradeValuation | None:
    if state is None:
        return None

    status = _normalize_code(state.get("status")) or "ACTIVE"
    if status != ACTIVE_STATUS:
        return None

    instrument_type = _normalize_code(state.get("instrument_type")) or DEFAULT_INSTRUMENT_TYPE
    trade_structure = _normalize_code(state.get("trade_structure")) or DEFAULT_TRADE_STRUCTURE
    trade_side = _normalize_code(state.get("trade_side"))
    settlement_status = _normalize_code(state.get("settlement_status")) or "PENDING"
    pnl_bucket = "REALIZED" if settlement_status == REALIZED_STATUS else "UNREALIZED"

    pricing_inputs = _pricing_inputs_for_state(state, primary_price_term)
    pricing_type = pricing_inputs["pricing_type"]
    fixed_price = pricing_inputs["fixed_price"]
    price_index_code = pricing_inputs["price_index_code"]
    trade_currency_code = pricing_inputs["trade_currency_code"]
    price_unit_code = pricing_inputs["price_unit_code"]
    pricing_source = pricing_inputs["pricing_source"]

    quantity_raw = _decimal_or_none(state.get("volume"))
    quantity = abs(quantity_raw) if quantity_raw is not None else None
    direction = int(_trade_direction(state))
    market_price = latest_marks.get(price_index_code) if price_index_code else None

    valuation_status = VALUATION_STATUS_VALUED
    valuation_status_reason: str | None = None
    effective_mark: Decimal | None = None

    if instrument_type != SUPPORTED_VALUATION_INSTRUMENT:
        valuation_status = VALUATION_STATUS_UNSUPPORTED_INSTRUMENT
        valuation_status_reason = "Only LINEAR trades are included in mark-to-market v1."
    elif trade_structure != SUPPORTED_VALUATION_STRUCTURE:
        valuation_status = VALUATION_STATUS_UNSUPPORTED_STRUCTURE
        valuation_status_reason = "Only SINGLE trades are included in mark-to-market v1."
    elif pricing_type not in SUPPORTED_VALUATION_PRICING_TYPES:
        valuation_status = VALUATION_STATUS_UNSUPPORTED_PRICING_TYPE
        valuation_status_reason = (
            f"Pricing type '{pricing_type}' is not included in mark-to-market v1."
        )
    elif quantity is None:
        valuation_status = VALUATION_STATUS_UNPRICED_MISSING_QUANTITY
        valuation_status_reason = "Trade quantity is required before the trade can be marked."
    elif pricing_type == "FIXED":
        if fixed_price is None:
            valuation_status = VALUATION_STATUS_UNPRICED_MISSING_FIXED_PRICE
            valuation_status_reason = "Fixed pricing requires a fixed price on the primary price term."
        else:
            effective_mark = fixed_price
    elif pricing_type == "INDEX":
        if price_index_code is None:
            valuation_status = VALUATION_STATUS_UNPRICED_MISSING_PRICE_INDEX
            valuation_status_reason = "Index pricing requires a linked price index."
        elif market_price is None:
            valuation_status = VALUATION_STATUS_UNPRICED_MISSING_MARK
            valuation_status_reason = "No market observation is available yet for the linked price index."
        else:
            effective_mark = market_price
    elif pricing_type == "HYBRID":
        if fixed_price is None:
            valuation_status = VALUATION_STATUS_UNPRICED_MISSING_FIXED_PRICE
            valuation_status_reason = "Hybrid pricing requires a fixed differential on the primary price term."
        elif price_index_code is None:
            valuation_status = VALUATION_STATUS_UNPRICED_MISSING_PRICE_INDEX
            valuation_status_reason = "Hybrid pricing requires a linked price index."
        elif market_price is None:
            valuation_status = VALUATION_STATUS_UNPRICED_MISSING_MARK
            valuation_status_reason = "No market observation is available yet for the linked price index."
        else:
            effective_mark = market_price + fixed_price

    pnl_contribution = (
        effective_mark * quantity * Decimal(direction)
        if effective_mark is not None and quantity is not None
        else None
    )
    included_in_totals = valuation_status == VALUATION_STATUS_VALUED and pnl_contribution is not None

    return TradeValuation(
        trade_id=state["trade_id"],
        book=_normalize_text(state.get("book")),
        commodity_class=_normalize_code(state.get("commodity_class")),
        instrument_type=instrument_type,
        trade_structure=trade_structure,
        trade_side=trade_side,
        settlement_status=settlement_status,
        pnl_bucket=pnl_bucket,
        pricing_type=pricing_type,
        pricing_source=pricing_source,
        fixed_price=fixed_price,
        price_index_code=price_index_code,
        market_price=market_price,
        effective_mark=effective_mark,
        quantity=quantity,
        direction=direction,
        trade_currency_code=trade_currency_code,
        price_unit_code=price_unit_code,
        pnl_contribution=pnl_contribution,
        valuation_status=valuation_status,
        valuation_status_reason=valuation_status_reason,
        included_in_totals=included_in_totals,
    )


def _pnl_snapshot_for_state(
    state: dict[str, Any] | None,
    latest_marks: dict[str, Decimal],
    *,
    primary_price_term: PrimaryPriceTerm | None = None,
) -> PnlSnapshot:
    valuation = _build_trade_valuation(
        state,
        latest_marks,
        primary_price_term=primary_price_term,
    )
    if valuation is None or not valuation.included_in_totals or valuation.pnl_contribution is None:
        return PnlSnapshot()

    if valuation.pnl_bucket == "REALIZED":
        return PnlSnapshot(
            total_pnl=valuation.pnl_contribution,
            realized_pnl=valuation.pnl_contribution,
            unrealized_pnl=ZERO,
            priced_trade_count=1,
            realized_trade_count=1,
            unrealized_trade_count=0,
        )

    return PnlSnapshot(
        total_pnl=valuation.pnl_contribution,
        realized_pnl=ZERO,
        unrealized_pnl=valuation.pnl_contribution,
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


def _serialize_trade_valuation(valuation: TradeValuation) -> dict[str, Any]:
    return {
        "trade_id": valuation.trade_id,
        "book": valuation.book,
        "commodity_class": valuation.commodity_class,
        "instrument_type": valuation.instrument_type,
        "trade_structure": valuation.trade_structure,
        "trade_side": valuation.trade_side,
        "settlement_status": valuation.settlement_status,
        "pnl_bucket": valuation.pnl_bucket,
        "pricing_type": valuation.pricing_type,
        "pricing_source": valuation.pricing_source,
        "fixed_price": float(valuation.fixed_price) if valuation.fixed_price is not None else None,
        "price_index_code": valuation.price_index_code,
        "market_price": float(valuation.market_price) if valuation.market_price is not None else None,
        "effective_mark": float(valuation.effective_mark) if valuation.effective_mark is not None else None,
        "quantity": float(valuation.quantity) if valuation.quantity is not None else None,
        "direction": valuation.direction,
        "trade_currency_code": valuation.trade_currency_code,
        "price_unit_code": valuation.price_unit_code,
        "pnl_contribution": (
            float(valuation.pnl_contribution)
            if valuation.pnl_contribution is not None
            else None
        ),
        "valuation_status": valuation.valuation_status,
        "valuation_status_reason": valuation.valuation_status_reason,
        "included_in_totals": valuation.included_in_totals,
    }


def _empty_pnl_history_report(generated_at: datetime) -> dict[str, Any]:
    return {
        "generated_at": generated_at,
        "basis": TRADE_PNL_BASIS,
        "methodology": TRADE_PNL_METHODOLOGY,
        "point_count": 0,
        "points": [],
        "summary": _serialize_pnl_snapshot(PnlSnapshot()),
        "valuations": [],
    }


def _normalize_filter_code(value: str | None) -> str | None:
    return _normalize_code(value)


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
        next_state["instrument_type"] = payload.get("instrument_type") or DEFAULT_INSTRUMENT_TYPE
        next_state["trade_structure"] = payload.get("trade_structure") or DEFAULT_TRADE_STRUCTURE
        next_state["book"] = payload.get("book")
        next_state["commodity_class"] = payload.get("commodity_class")
        next_state["pricing_type"] = payload.get("pricing_type") or DEFAULT_PRICING_TYPE
        next_state["price_index_code"] = payload.get("price_index_code")
        next_state["trade_currency_code"] = payload.get("trade_currency_code")
        next_state["price_unit_code"] = payload.get("price_unit_code")
        next_state["trade_side"] = payload.get("trade_side")
        next_state["price"] = payload.get("price")
        next_state["volume"] = payload.get("volume")
        next_state["settlement_status"] = payload.get("settlement_status") or "PENDING"
        next_state["status"] = payload.get("status") or "ACTIVE"
        return next_state

    next_state = dict(current or _empty_trade_state(event.aggregate_id))

    if event.event_type == "TradeAmended":
        for field_name in (
            "instrument_type",
            "trade_structure",
            "book",
            "commodity_class",
            "pricing_type",
            "price_index_code",
            "trade_currency_code",
            "price_unit_code",
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

    if event.event_type in OPTION_LIFECYCLE_EVENT_TO_STATUS:
        next_state["status"] = OPTION_LIFECYCLE_EVENT_TO_STATUS[event.event_type]
        return next_state

    return next_state


def _legacy_trade_state(row: Trade) -> dict[str, Any]:
    return {
        "trade_id": row.trade_id,
        "status": row.status,
        "instrument_type": row.instrument_type,
        "trade_structure": row.trade_structure,
        "book": row.book,
        "commodity_class": row.commodity_class,
        "pricing_type": row.pricing_type,
        "price_index_code": row.price_index_code,
        "trade_currency_code": row.trade_currency_code,
        "price_unit_code": row.price_unit_code,
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
            Event.event_type.in_((
                "TradeCreated",
                "TradeAmended",
                "TradeCancelled",
                "OptionExercised",
                "OptionExpired",
                "OptionAssigned",
            )),
        )
        .order_by(Event.occurred_at.asc(), Event.recorded_at.asc(), Event.event_id.asc())
    ).scalars().all()

    relevant_price_index_codes: set[str] = set()
    events_by_date: dict[date, list[Event]] = {}
    trade_ids_with_events: set[str] = set()
    latest_event_date: date | None = None

    for row in rows:
        trade_ids_with_events.add(row.aggregate_id)
        events_by_date.setdefault(row.occurred_at.date(), []).append(row)
        if latest_event_date is None or row.occurred_at.date() > latest_event_date:
            latest_event_date = row.occurred_at.date()
        event_price_index_code = str((row.payload or {}).get("price_index_code") or "").strip().upper()
        if event_price_index_code:
            relevant_price_index_codes.add(event_price_index_code)

    legacy_rows = db.execute(
        select(Trade)
        .where(Trade.status == ACTIVE_STATUS)
        .order_by(Trade.created_at.asc(), Trade.trade_id.asc())
    ).scalars().all()
    legacy_starts_by_date: dict[date, list[dict[str, Any]]] = {}
    start_dates: list[date] = list(events_by_date.keys())
    latest_legacy_projection_date: date | None = None

    for row in legacy_rows:
        anchor = row.execution_timestamp or row.created_at or generated_at
        anchor_date = anchor.date()
        start_dates.append(anchor_date)
        if row.price_index_code:
            relevant_price_index_codes.add(row.price_index_code.strip().upper())

        if row.trade_id in trade_ids_with_events:
            continue

        row_projection_date = (row.updated_at or row.created_at or generated_at).date()
        if latest_legacy_projection_date is None or row_projection_date > latest_legacy_projection_date:
            latest_legacy_projection_date = row_projection_date

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

    latest_known_trade_state_date = max(
        (
            candidate
            for candidate in (latest_event_date, latest_legacy_projection_date)
            if candidate is not None
        ),
        default=None,
    )
    can_use_projected_primary_terms = (
        latest_known_trade_state_date is not None and latest_known_trade_state_date <= end_date
    )
    end_states = [
        state
        for state in active_states.values()
        if str(state.get("status") or ACTIVE_STATUS).strip().upper() == ACTIVE_STATUS
        and _state_matches_filters(
            state,
            book=normalized_book,
            commodity_class=normalized_commodity_class,
        )
    ]
    end_states.sort(key=lambda state: state["trade_id"])
    primary_price_terms = _load_primary_price_terms(
        db,
        trade_ids=[state["trade_id"] for state in end_states],
    ) if can_use_projected_primary_terms else {}
    end_snapshot = PnlSnapshot()
    valuations: list[dict[str, Any]] = []
    for state in end_states:
        valuation = _build_trade_valuation(
            state,
            latest_marks,
            primary_price_term=primary_price_terms.get(state["trade_id"]),
        )
        if valuation is None:
            continue
        end_snapshot = _add_pnl_snapshots(
            end_snapshot,
            _pnl_snapshot_for_state(
                state,
                latest_marks,
                primary_price_term=primary_price_terms.get(state["trade_id"]),
            ),
        )
        valuations.append(_serialize_trade_valuation(valuation))

    if points and points[-1]["date"] == end_date:
        points[-1] = {
            "date": end_date,
            **_serialize_pnl_snapshot(end_snapshot),
        }

    return {
        "generated_at": generated_at,
        "basis": TRADE_PNL_BASIS,
        "methodology": TRADE_PNL_METHODOLOGY,
        "point_count": len(points),
        "points": points,
        "summary": _serialize_pnl_snapshot(end_snapshot),
        "valuations": valuations,
    }
