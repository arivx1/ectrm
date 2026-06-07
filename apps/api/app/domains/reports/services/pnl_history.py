from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.risk.services.official_marks import (
    OfficialMark,
    get_official_mark,
)
from apps.api.app.models.event import Event
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
TRADE_PNL_BASIS = "trade_event_history_official_mark_to_market"
TRADE_PNL_METHODOLOGY = (
    "Event-sourced daily history values trade lifecycle state against the latest official "
    "price-index mark for each day. Official marks are selected from the active approved source "
    "for the linked price index, use the latest observation on or before the as-of date, and do "
    "not interpolate in v1. End-of-window trade breakdown prefers the projected primary price "
    "term when the report reaches the latest known trade state. v1 values only LINEAR single-leg "
    "trades: FIXED uses the fixed price, INDEX uses the official mark, HYBRID uses official mark "
    "plus fixed differential, settlement changes move priced "
    "trades between realized and unrealized buckets, OPTION, SWAP, and FORMULA trades stay out "
    "of MTM totals until dedicated valuation support lands, and legacy projection-only trades "
    "without event history enter the timeline on their latest trustworthy projection date rather "
    "than backfilling future state into earlier as-of dates."
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
TRADE_LIFECYCLE_EVENT_TYPES = (
    "TradeCreated",
    "TradeAmended",
    "TradeCancelled",
    "OptionExercised",
    "OptionExpired",
    "OptionAssigned",
)
ATTRIBUTION_CATEGORY_NEW_POSITION = "NEW_POSITION"
ATTRIBUTION_CATEGORY_REMOVED_POSITION = "REMOVED_POSITION"
ATTRIBUTION_CATEGORY_ENTERED_TOTALS = "ENTERED_TOTALS"
ATTRIBUTION_CATEGORY_EXITED_TOTALS = "EXITED_TOTALS"
ATTRIBUTION_CATEGORY_REALIZATION = "REALIZATION"
ATTRIBUTION_CATEGORY_REOPENED = "REOPENED"
ATTRIBUTION_CATEGORY_POSITION_CHANGE = "POSITION_CHANGE"
ATTRIBUTION_CATEGORY_MARK_CHANGE = "MARK_CHANGE"
ATTRIBUTION_CATEGORY_CARRY = "CARRY"
ATTRIBUTION_CATEGORY_OUTSIDE_TOTALS = "OUTSIDE_TOTALS"
ATTRIBUTION_COMPONENT_TOLERANCE = Decimal("0.0001")
EVENT_DRIVER_FIELD_LABELS = {
    "instrument_type": "instrument",
    "trade_structure": "structure",
    "book": "book",
    "portfolio": "portfolio",
    "commodity_class": "commodity class",
    "pricing_type": "pricing type",
    "price_index_code": "price index",
    "trade_currency_code": "currency",
    "price_unit_code": "price unit",
    "trade_side": "side",
    "price": "fixed price",
    "volume": "quantity",
    "settlement_status": "settlement",
    "status": "status",
}
EVENT_DRIVER_FIELD_ORDER = (
    "settlement_status",
    "volume",
    "price",
    "pricing_type",
    "price_index_code",
    "book",
    "portfolio",
    "trade_side",
    "status",
    "instrument_type",
    "trade_structure",
    "trade_currency_code",
    "price_unit_code",
    "commodity_class",
)


@dataclass
class PnlSnapshot:
    total_pnl: Decimal = ZERO
    realized_pnl: Decimal = ZERO
    unrealized_pnl: Decimal = ZERO
    priced_trade_count: int = 0
    realized_trade_count: int = 0
    unrealized_trade_count: int = 0


@dataclass
class AttributionBreakdown:
    market_move_pnl: Decimal = ZERO
    quantity_change_pnl: Decimal = ZERO
    coverage_change_pnl: Decimal = ZERO
    other_change_pnl: Decimal = ZERO
    realization_transfer_pnl: Decimal = ZERO


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
    portfolio: str | None
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
    mark_evidence: dict[str, Any] | None
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
        "portfolio": None,
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
    official_marks: dict[str, OfficialMark],
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
    official_mark = official_marks.get(price_index_code) if price_index_code else None
    market_price = official_mark.value if official_mark is not None else None
    mark_evidence = _serialize_mark_evidence(official_mark) if price_index_code else None

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
            valuation_status_reason = (
                official_mark.reason
                if official_mark is not None and official_mark.reason
                else "No official mark is available yet for the linked price index."
            )
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
            valuation_status_reason = (
                official_mark.reason
                if official_mark is not None and official_mark.reason
                else "No official mark is available yet for the linked price index."
            )
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
        portfolio=_normalize_text(state.get("portfolio")),
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
        mark_evidence=mark_evidence,
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
    official_marks: dict[str, OfficialMark],
    *,
    primary_price_term: PrimaryPriceTerm | None = None,
) -> PnlSnapshot:
    valuation = _build_trade_valuation(
        state,
        official_marks,
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


def _add_attribution_breakdowns(
    current: AttributionBreakdown,
    delta: AttributionBreakdown,
) -> AttributionBreakdown:
    return AttributionBreakdown(
        market_move_pnl=current.market_move_pnl + delta.market_move_pnl,
        quantity_change_pnl=current.quantity_change_pnl + delta.quantity_change_pnl,
        coverage_change_pnl=current.coverage_change_pnl + delta.coverage_change_pnl,
        other_change_pnl=current.other_change_pnl + delta.other_change_pnl,
        realization_transfer_pnl=current.realization_transfer_pnl + delta.realization_transfer_pnl,
    )


def _serialize_attribution_breakdown(breakdown: AttributionBreakdown) -> dict[str, float]:
    reconciled = (
        breakdown.market_move_pnl
        + breakdown.quantity_change_pnl
        + breakdown.coverage_change_pnl
        + breakdown.other_change_pnl
    )
    return {
        "market_move_pnl": float(breakdown.market_move_pnl),
        "quantity_change_pnl": float(breakdown.quantity_change_pnl),
        "coverage_change_pnl": float(breakdown.coverage_change_pnl),
        "other_change_pnl": float(breakdown.other_change_pnl),
        "realization_transfer_pnl": float(breakdown.realization_transfer_pnl),
        "reconciled_pnl_delta": float(reconciled),
    }


def _event_driver_field_label(field_name: str) -> str:
    return EVENT_DRIVER_FIELD_LABELS.get(field_name, field_name.replace("_", " "))


def _event_driver_value(field_name: str, value: object | None) -> str:
    if value is None:
        return "blank"

    if field_name == "volume":
        quantity = _decimal_or_none(value)
        if quantity is not None:
            normalized = abs(quantity)
            return format(normalized.normalize(), "f").rstrip("0").rstrip(".") or "0"

    normalized_code = _normalize_code(value)
    if normalized_code is not None:
        return normalized_code

    normalized_text = _normalize_text(value)
    if normalized_text is not None:
        return normalized_text

    return str(value)


def _trade_amendment_event_summary(payload: dict[str, Any]) -> str:
    changed_fields = [field_name for field_name in EVENT_DRIVER_FIELD_ORDER if field_name in payload]
    if not changed_fields:
        return "Trade amended"

    parts = [
        f"{_event_driver_field_label(field_name)} to {_event_driver_value(field_name, payload.get(field_name))}"
        for field_name in changed_fields[:3]
    ]
    if len(changed_fields) == 1:
        summary = parts[0]
    elif len(changed_fields) == 2:
        summary = f"{parts[0]} and {parts[1]}"
    else:
        summary = f"{', '.join(parts[:-1])}, and {parts[-1]}"

    remaining_count = len(changed_fields) - len(parts)
    if remaining_count > 0:
        summary = f"{summary} (+{remaining_count} more field{'s' if remaining_count != 1 else ''})"

    return f"Amended {summary}"


def _trade_driver_event_summary(event: Event) -> str:
    payload = event.payload or {}
    if event.event_type == "TradeCreated":
        return "Trade created"
    if event.event_type == "TradeAmended":
        return _trade_amendment_event_summary(payload)
    if event.event_type == "TradeCancelled":
        reason = _normalize_text(payload.get("cancellation_reason"))
        return f"Trade cancelled ({reason})" if reason else "Trade cancelled"
    if event.event_type == "OptionExercised":
        return "Option exercised"
    if event.event_type == "OptionExpired":
        return "Option expired"
    if event.event_type == "OptionAssigned":
        return "Option assigned"
    return event.event_type


def _serialize_attribution_driver_event(event: Event) -> dict[str, Any]:
    return {
        "event_id": event.event_id,
        "event_type": event.event_type,
        "occurred_at": event.occurred_at,
        "actor_id": event.actor_id,
        "summary": _trade_driver_event_summary(event),
    }


def _serialize_mark_evidence(mark: OfficialMark | None) -> dict[str, Any] | None:
    if mark is None:
        return None

    return {
        "price_index_code": mark.price_index_code,
        "valuation_basis": mark.valuation_basis,
        "interpolation_method": mark.interpolation_method,
        "approval_status": mark.approval_status,
        "freshness_status": mark.freshness_status,
        "as_of_date": mark.as_of_date,
        "observation_date": mark.observation_date,
        "source_provider": mark.source_provider,
        "source_series_id": mark.source_series_id,
        "source_published_at": mark.source_published_at,
        "downloaded_at": mark.downloaded_at,
        "run_id": mark.run_id,
        "days_stale": mark.days_stale,
        "reason": mark.reason,
    }


def _serialize_trade_valuation(valuation: TradeValuation) -> dict[str, Any]:
    payload = {
        "trade_id": valuation.trade_id,
        "book": valuation.book,
        "portfolio": valuation.portfolio,
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
    if valuation.mark_evidence is not None:
        payload["mark_evidence"] = valuation.mark_evidence
    return payload


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


def _deserialize_pnl_snapshot(payload: dict[str, Any] | None) -> PnlSnapshot:
    row = payload or {}
    return PnlSnapshot(
        total_pnl=Decimal(str(row.get("total_pnl") or 0)),
        realized_pnl=Decimal(str(row.get("realized_pnl") or 0)),
        unrealized_pnl=Decimal(str(row.get("unrealized_pnl") or 0)),
        priced_trade_count=int(row.get("priced_trade_count") or 0),
        realized_trade_count=int(row.get("realized_trade_count") or 0),
        unrealized_trade_count=int(row.get("unrealized_trade_count") or 0),
    )


def _pnl_snapshot_for_serialized_valuation(valuation: dict[str, Any] | None) -> PnlSnapshot:
    if valuation is None or not bool(valuation.get("included_in_totals")):
        return PnlSnapshot()

    contribution = Decimal(str(valuation.get("pnl_contribution") or 0))
    if str(valuation.get("pnl_bucket") or "").strip().upper() == "REALIZED":
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


def _portfolio_snapshots_from_valuations(valuations: list[dict[str, Any]]) -> dict[str, PnlSnapshot]:
    snapshots: dict[str, PnlSnapshot] = {}
    for valuation in valuations:
        if not bool(valuation.get("included_in_totals")):
            continue
        portfolio_code = _normalize_text(valuation.get("portfolio")) or "UNASSIGNED"
        snapshots[portfolio_code] = _add_pnl_snapshots(
            snapshots.get(portfolio_code, PnlSnapshot()),
            _pnl_snapshot_for_serialized_valuation(valuation),
        )
    return snapshots


def _included_in_totals(valuation: dict[str, Any] | None) -> bool:
    return bool(valuation and valuation.get("included_in_totals"))


def _valuation_pnl_for_totals(valuation: dict[str, Any] | None) -> Decimal:
    if valuation is None or not _included_in_totals(valuation):
        return ZERO
    return Decimal(str(valuation.get("pnl_contribution") or 0))


def _valuation_decimal(valuation: dict[str, Any] | None, field_name: str) -> Decimal | None:
    if valuation is None:
        return None
    raw_value = valuation.get(field_name)
    if raw_value is None:
        return None
    return Decimal(str(raw_value))


def _valuation_signed_quantity(valuation: dict[str, Any] | None) -> Decimal | None:
    quantity = _valuation_decimal(valuation, "quantity")
    if quantity is None:
        return None
    direction = int(valuation.get("direction") or 0) if valuation is not None else 0
    return quantity * Decimal(direction)


def _realization_transfer_amount(
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> Decimal:
    if not _included_in_totals(before) or not _included_in_totals(after):
        return ZERO

    before_bucket = _normalize_code(before.get("pnl_bucket") if before else None)
    after_bucket = _normalize_code(after.get("pnl_bucket") if after else None)
    if before_bucket == after_bucket:
        return ZERO
    if before_bucket == "UNREALIZED" and after_bucket == "REALIZED":
        return _valuation_pnl_for_totals(before)
    if before_bucket == "REALIZED" and after_bucket == "UNREALIZED":
        return -_valuation_pnl_for_totals(after)
    return ZERO


def _attribution_breakdown(
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> AttributionBreakdown:
    pnl_delta = _valuation_pnl_for_totals(after) - _valuation_pnl_for_totals(before)
    realization_transfer_pnl = _realization_transfer_amount(before, after)
    before_included = _included_in_totals(before)
    after_included = _included_in_totals(after)

    if not before_included and not after_included:
        return AttributionBreakdown(realization_transfer_pnl=realization_transfer_pnl)

    if before_included != after_included:
        coverage_change_pnl = ZERO
        quantity_change_pnl = ZERO
        if before is None or after is None:
            quantity_change_pnl = pnl_delta
        else:
            coverage_change_pnl = pnl_delta
        return AttributionBreakdown(
            quantity_change_pnl=quantity_change_pnl,
            coverage_change_pnl=coverage_change_pnl,
            realization_transfer_pnl=realization_transfer_pnl,
        )

    before_effective_mark = _valuation_decimal(before, "effective_mark") or ZERO
    after_effective_mark = _valuation_decimal(after, "effective_mark") or ZERO
    before_market_price = _valuation_decimal(before, "market_price")
    after_market_price = _valuation_decimal(after, "market_price")
    before_quantity = _valuation_signed_quantity(before) or ZERO
    after_quantity = _valuation_signed_quantity(after) or ZERO

    market_move_pnl = ZERO
    if (
        before_market_price is not None
        and after_market_price is not None
        and _normalize_code(before.get("price_index_code") if before else None)
        and _normalize_code(before.get("price_index_code") if before else None)
        == _normalize_code(after.get("price_index_code") if after else None)
    ):
        market_move_pnl = (after_market_price - before_market_price) * before_quantity

    quantity_change_pnl = after_effective_mark * (after_quantity - before_quantity)
    coverage_change_pnl = ZERO
    other_change_pnl = pnl_delta - market_move_pnl - quantity_change_pnl - coverage_change_pnl

    return AttributionBreakdown(
        market_move_pnl=market_move_pnl,
        quantity_change_pnl=quantity_change_pnl,
        coverage_change_pnl=coverage_change_pnl,
        other_change_pnl=other_change_pnl,
        realization_transfer_pnl=realization_transfer_pnl,
    )


def _build_driver_summary(
    driver_events: list[dict[str, Any]],
    breakdown: AttributionBreakdown,
) -> str:
    if driver_events:
        summary_parts = [
            f"{str(event.get('summary') or 'Lifecycle event')} on {event['occurred_at'].date().isoformat()}"
            for event in driver_events[:2]
            if isinstance(event.get("occurred_at"), datetime)
        ]
        if len(driver_events) > 2:
            summary_parts.append(
                f"+{len(driver_events) - 2} more lifecycle event{'s' if len(driver_events) - 2 != 1 else ''}"
            )
        if summary_parts:
            return "; ".join(summary_parts)

    if abs(breakdown.market_move_pnl) > ATTRIBUTION_COMPONENT_TOLERANCE:
        return "No lifecycle events in the compare window; movement came from market or mark changes."
    if abs(breakdown.quantity_change_pnl) > ATTRIBUTION_COMPONENT_TOLERANCE:
        return "No lifecycle events in the compare window; exposure changed across snapshots without a captured trade event."
    if abs(breakdown.coverage_change_pnl) > ATTRIBUTION_COMPONENT_TOLERANCE:
        return "No lifecycle events in the compare window; valuation coverage changed across snapshots."
    if abs(breakdown.realization_transfer_pnl) > ATTRIBUTION_COMPONENT_TOLERANCE:
        return "No lifecycle events in the compare window; value still moved between unrealized and realized buckets."
    if abs(breakdown.other_change_pnl) > ATTRIBUTION_COMPONENT_TOLERANCE:
        return "No lifecycle events in the compare window; residual movement came from pricing-term or other non-market changes."
    return "No lifecycle events in the compare window; valuation carried forward between snapshots."


def _is_changed_attribution_row(row: dict[str, Any]) -> bool:
    return abs(float(row.get("pnl_delta") or 0)) > float(ATTRIBUTION_COMPONENT_TOLERANCE) or str(
        row.get("attribution_category") or ""
    ) not in {"CARRY", "OUTSIDE_TOTALS"}


def _attribution_row_magnitude(row: dict[str, Any]) -> float:
    breakdown = row.get("breakdown") or {}
    return max(
        abs(float(row.get("pnl_delta") or 0)),
        abs(float(breakdown.get("realization_transfer_pnl") or 0)),
        abs(float(breakdown.get("reconciled_pnl_delta") or 0)),
    )


def _attribution_category(
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> str:
    before_included = _included_in_totals(before)
    after_included = _included_in_totals(after)

    if not before_included and not after_included:
        return ATTRIBUTION_CATEGORY_OUTSIDE_TOTALS
    if not before_included and after_included:
        return ATTRIBUTION_CATEGORY_NEW_POSITION if before is None else ATTRIBUTION_CATEGORY_ENTERED_TOTALS
    if before_included and not after_included:
        return ATTRIBUTION_CATEGORY_REMOVED_POSITION if after is None else ATTRIBUTION_CATEGORY_EXITED_TOTALS

    before_bucket = _normalize_code(before.get("pnl_bucket") if before else None)
    after_bucket = _normalize_code(after.get("pnl_bucket") if after else None)
    if before_bucket != after_bucket:
        if before_bucket == "UNREALIZED" and after_bucket == "REALIZED":
            return ATTRIBUTION_CATEGORY_REALIZATION
        if before_bucket == "REALIZED" and after_bucket == "UNREALIZED":
            return ATTRIBUTION_CATEGORY_REOPENED
        return ATTRIBUTION_CATEGORY_POSITION_CHANGE

    if (
        _normalize_text(before.get("portfolio") if before else None) != _normalize_text(after.get("portfolio") if after else None)
        or _normalize_text(before.get("book") if before else None) != _normalize_text(after.get("book") if after else None)
        or _normalize_code(before.get("trade_side") if before else None) != _normalize_code(after.get("trade_side") if after else None)
        or before.get("quantity") != after.get("quantity")
        or before.get("direction") != after.get("direction")
    ):
        return ATTRIBUTION_CATEGORY_POSITION_CHANGE

    if (
        before.get("effective_mark") != after.get("effective_mark")
        or before.get("pricing_type") != after.get("pricing_type")
        or before.get("price_index_code") != after.get("price_index_code")
        or before.get("fixed_price") != after.get("fixed_price")
    ):
        return ATTRIBUTION_CATEGORY_MARK_CHANGE

    return ATTRIBUTION_CATEGORY_CARRY


def _normalize_filter_code(value: str | None) -> str | None:
    return _normalize_code(value)


def _state_matches_filters(
    state: dict[str, Any],
    *,
    book: str | None,
    portfolio: str | None,
    commodity_class: str | None,
) -> bool:
    if book and _normalize_filter_code(state.get("book")) != book:
        return False

    if portfolio and _normalize_filter_code(state.get("portfolio")) != portfolio:
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
        next_state["portfolio"] = payload.get("portfolio")
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
            "portfolio",
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
        "portfolio": row.portfolio,
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


def _legacy_trade_trustworthy_start_date(row: Trade, *, generated_at: datetime) -> date:
    anchor = row.execution_timestamp or row.created_at or generated_at
    anchor_date = anchor.date()
    projection_date = (row.updated_at or row.created_at or generated_at).date()
    return max(anchor_date, projection_date)


def _load_trade_driver_events(
    db: Session,
    *,
    trade_ids: list[str],
    from_as_of: date,
    to_as_of: date,
) -> dict[str, list[dict[str, Any]]]:
    if not trade_ids or from_as_of >= to_as_of:
        return {}

    window_start = datetime.combine(from_as_of + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    window_end = datetime.combine(to_as_of + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    rows = db.execute(
        select(Event)
        .where(
            Event.aggregate_type == "trade",
            Event.aggregate_id.in_(trade_ids),
            Event.event_type.in_(TRADE_LIFECYCLE_EVENT_TYPES),
            Event.occurred_at >= window_start,
            Event.occurred_at < window_end,
        )
        .order_by(Event.aggregate_id.asc(), Event.occurred_at.asc(), Event.recorded_at.asc(), Event.event_id.asc())
    ).scalars().all()

    grouped_events: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped_events.setdefault(row.aggregate_id, []).append(_serialize_attribution_driver_event(row))
    return grouped_events


def _load_daily_official_marks(
    db: Session,
    *,
    price_index_codes: set[str],
    start_date: date,
    end_date: date,
) -> dict[date, dict[str, OfficialMark]]:
    if not price_index_codes:
        return {}

    by_date: dict[date, dict[str, OfficialMark]] = {}
    current_date = start_date
    normalized_codes = sorted(price_index_codes)
    while current_date <= end_date:
        by_date[current_date] = {
            price_index_code: get_official_mark(
                db,
                price_index_code=price_index_code,
                as_of_date=current_date,
            )
            for price_index_code in normalized_codes
        }
        current_date += timedelta(days=1)

    return by_date


def build_pnl_history_report(
    db: Session,
    *,
    as_of: date | None = None,
    book: str | None = None,
    portfolio: str | None = None,
    commodity_class: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    normalized_book = _normalize_filter_code(book)
    normalized_portfolio = _normalize_filter_code(portfolio)
    normalized_commodity_class = _normalize_filter_code(commodity_class)
    end_date = date_to or as_of or generated_at.date()
    window_start_date = date_from

    rows = db.execute(
        select(Event)
        .where(
            Event.aggregate_type == "trade",
            Event.event_type.in_(TRADE_LIFECYCLE_EVENT_TYPES),
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
        if row.trade_id in trade_ids_with_events:
            continue

        row_projection_date = (row.updated_at or row.created_at or generated_at).date()
        trusted_start_date = _legacy_trade_trustworthy_start_date(row, generated_at=generated_at)
        start_dates.append(trusted_start_date)
        if row.price_index_code:
            relevant_price_index_codes.add(row.price_index_code.strip().upper())

        if latest_legacy_projection_date is None or row_projection_date > latest_legacy_projection_date:
            latest_legacy_projection_date = row_projection_date

        legacy_starts_by_date.setdefault(trusted_start_date, []).append(_legacy_trade_state(row))

    if not start_dates:
        return _empty_pnl_history_report(generated_at)

    start_date = min(start_dates)
    if end_date < start_date:
        return _empty_pnl_history_report(generated_at)

    if window_start_date and window_start_date > end_date:
        return _empty_pnl_history_report(generated_at)

    daily_official_marks = _load_daily_official_marks(
        db,
        price_index_codes=relevant_price_index_codes,
        start_date=start_date,
        end_date=end_date,
    )

    current_date = start_date
    active_states: dict[str, dict[str, Any]] = {}
    official_marks: dict[str, OfficialMark] = {}
    latest_snapshot = PnlSnapshot()
    points: list[dict[str, Any]] = []
    while current_date <= end_date:
        official_marks.update(daily_official_marks.get(current_date, {}))

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
                portfolio=normalized_portfolio,
                commodity_class=normalized_commodity_class,
            ):
                continue
            latest_snapshot = _add_pnl_snapshots(
                latest_snapshot,
                _pnl_snapshot_for_state(state, official_marks),
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
            portfolio=normalized_portfolio,
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
            official_marks,
            primary_price_term=primary_price_terms.get(state["trade_id"]),
        )
        if valuation is None:
            continue
        end_snapshot = _add_pnl_snapshots(
            end_snapshot,
            _pnl_snapshot_for_state(
                state,
                official_marks,
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


def build_pnl_comparison_report(
    db: Session,
    *,
    from_as_of: date,
    to_as_of: date,
    book: str | None = None,
    portfolio: str | None = None,
    commodity_class: str | None = None,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    comparison_payload = _build_pnl_comparison_report_payload(
        db,
        from_as_of=from_as_of,
        to_as_of=to_as_of,
        book=book,
        portfolio=portfolio,
        commodity_class=commodity_class,
        generated_at=generated_at,
    )

    daily_bridge: list[dict[str, Any]] = []
    if from_as_of < to_as_of:
        bridge_from = from_as_of
        while bridge_from < to_as_of:
            bridge_to = bridge_from + timedelta(days=1)
            bridge_payload = _build_pnl_comparison_report_payload(
                db,
                from_as_of=bridge_from,
                to_as_of=bridge_to,
                book=book,
                portfolio=portfolio,
                commodity_class=commodity_class,
                generated_at=generated_at,
            )
            changed_rows = [
                row for row in list(bridge_payload.get("attributions") or []) if _is_changed_attribution_row(row)
            ]
            top_driver = (
                sorted(
                    changed_rows,
                    key=lambda row: (
                        -_attribution_row_magnitude(row),
                        str(row.get("trade_id") or ""),
                    ),
                )[0]
                if changed_rows
                else None
            )
            daily_bridge.append(
                {
                    "from_as_of": bridge_from,
                    "to_as_of": bridge_to,
                    "delta": bridge_payload["delta"],
                    "attribution_summary": bridge_payload["attribution_summary"],
                    "changed_trade_count": len(changed_rows),
                    "top_driver_trade_id": str(top_driver.get("trade_id")) if top_driver else None,
                    "top_driver_category": (
                        str(top_driver.get("attribution_category")) if top_driver else None
                    ),
                    "top_driver_pnl_delta": (
                        float(top_driver.get("pnl_delta")) if top_driver is not None else None
                    ),
                    "top_driver_summary": (
                        str(top_driver.get("driver_summary")) if top_driver else None
                    ),
                }
            )
            bridge_from = bridge_to

    return {
        **comparison_payload,
        "daily_bridge": daily_bridge,
    }


def _build_pnl_comparison_report_payload(
    db: Session,
    *,
    from_as_of: date,
    to_as_of: date,
    book: str | None = None,
    portfolio: str | None = None,
    commodity_class: str | None = None,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    resolved_generated_at = generated_at or datetime.now(timezone.utc)
    from_report = build_pnl_history_report(
        db,
        as_of=from_as_of,
        book=book,
        portfolio=portfolio,
        commodity_class=commodity_class,
    )
    to_report = build_pnl_history_report(
        db,
        as_of=to_as_of,
        book=book,
        portfolio=portfolio,
        commodity_class=commodity_class,
    )

    from_snapshot = _deserialize_pnl_snapshot(from_report.get("summary"))
    to_snapshot = _deserialize_pnl_snapshot(to_report.get("summary"))
    delta_snapshot = _subtract_pnl_snapshots(to_snapshot, from_snapshot)

    from_portfolio_snapshots = _portfolio_snapshots_from_valuations(list(from_report.get("valuations") or []))
    to_portfolio_snapshots = _portfolio_snapshots_from_valuations(list(to_report.get("valuations") or []))
    all_portfolios = sorted(set(from_portfolio_snapshots) | set(to_portfolio_snapshots))
    portfolio_deltas: list[dict[str, Any]] = []
    for portfolio_code in all_portfolios:
        before_snapshot = from_portfolio_snapshots.get(portfolio_code, PnlSnapshot())
        after_snapshot = to_portfolio_snapshots.get(portfolio_code, PnlSnapshot())
        portfolio_deltas.append(
            {
                "portfolio": portfolio_code,
                "from_snapshot": _serialize_pnl_snapshot(before_snapshot),
                "to_snapshot": _serialize_pnl_snapshot(after_snapshot),
                "delta": _serialize_pnl_snapshot(_subtract_pnl_snapshots(after_snapshot, before_snapshot)),
            }
        )

    portfolio_deltas.sort(
        key=lambda row: (
            -abs(float(((row.get("delta") or {}).get("total_pnl") or 0))),
            str(row.get("portfolio") or ""),
        )
    )

    from_valuations_by_trade = {
        str(row.get("trade_id")): row
        for row in list(from_report.get("valuations") or [])
        if row.get("trade_id")
    }
    to_valuations_by_trade = {
        str(row.get("trade_id")): row
        for row in list(to_report.get("valuations") or [])
        if row.get("trade_id")
    }
    all_trade_ids = sorted(set(from_valuations_by_trade) | set(to_valuations_by_trade))
    driver_events_by_trade = _load_trade_driver_events(
        db,
        trade_ids=all_trade_ids,
        from_as_of=from_as_of,
        to_as_of=to_as_of,
    )
    attributions: list[dict[str, Any]] = []
    attribution_summary = AttributionBreakdown()
    for trade_id in all_trade_ids:
        before = from_valuations_by_trade.get(trade_id)
        after = to_valuations_by_trade.get(trade_id)
        breakdown = _attribution_breakdown(before, after)
        driver_events = driver_events_by_trade.get(trade_id, [])
        attribution_summary = _add_attribution_breakdowns(attribution_summary, breakdown)
        attributions.append(
            {
                "trade_id": trade_id,
                "attribution_category": _attribution_category(before, after),
                "pnl_delta": float(_valuation_pnl_for_totals(after) - _valuation_pnl_for_totals(before)),
                "breakdown": _serialize_attribution_breakdown(breakdown),
                "driver_summary": _build_driver_summary(driver_events, breakdown),
                "driver_events": driver_events,
                "from_valuation": before,
                "to_valuation": after,
            }
        )

    attributions.sort(
        key=lambda row: (
            -abs(float(row.get("pnl_delta") or 0)),
            str(row.get("trade_id") or ""),
        )
    )

    return {
        "generated_at": resolved_generated_at,
        "basis": str(to_report.get("basis") or from_report.get("basis") or TRADE_PNL_BASIS),
        "methodology": str(to_report.get("methodology") or from_report.get("methodology") or TRADE_PNL_METHODOLOGY),
        "from_as_of": from_as_of,
        "to_as_of": to_as_of,
        "from_snapshot": _serialize_pnl_snapshot(from_snapshot),
        "to_snapshot": _serialize_pnl_snapshot(to_snapshot),
        "delta": _serialize_pnl_snapshot(delta_snapshot),
        "attribution_summary": _serialize_attribution_breakdown(attribution_summary),
        "portfolio_deltas": portfolio_deltas,
        "attributions": attributions,
        "daily_bridge": [],
    }
