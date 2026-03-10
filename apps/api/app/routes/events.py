from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.schemas.event import EventCreate, EventOut
from apps.api.app.shared.enums import PricingType, TradeNature, TradeSide, TradeStructure

router = APIRouter(prefix="/events", tags=["events"])

ZERO = Decimal("0")


def trade_snapshot(trade: Trade | None) -> dict[str, object] | None:
    if trade is None:
        return None

    return {
        "commodity_class": trade.commodity_class,
        "commodity": trade.commodity,
        "volume": Decimal(str(trade.volume or 0)),
        "status": trade.status,
    }


def active_volume_by_commodity(trade: dict[str, object] | None) -> dict[str, Decimal]:
    if trade is None or trade.get("status") == "CANCELLED":
        return {}

    commodity = str(trade.get("commodity") or "UNKNOWN")
    volume = Decimal(str(trade.get("volume") or 0))
    return {commodity: volume}


def apply_position_delta(db: Session, commodity: str, delta: Decimal, updated_at: datetime) -> None:
    if delta == ZERO:
        return

    existing = db.execute(
        select(Position).where(Position.commodity == commodity)
    ).scalars().first()

    if existing is None:
        if delta != ZERO:
            db.add(Position(commodity=commodity, net_volume=delta, updated_at=updated_at))
        return

    next_volume = Decimal(str(existing.net_volume)) + delta
    if next_volume == ZERO:
        db.delete(existing)
        return

    existing.net_volume = next_volume
    existing.updated_at = updated_at


def sync_positions_for_trade_change(
    db: Session,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
    updated_at: datetime,
) -> None:
    before_contrib = active_volume_by_commodity(before)
    after_contrib = active_volume_by_commodity(after)
    commodities = set(before_contrib) | set(after_contrib)

    for commodity in commodities:
        delta = after_contrib.get(commodity, ZERO) - before_contrib.get(commodity, ZERO)
        apply_position_delta(db, commodity, delta, updated_at)


def normalize_commodity_code(value: object | None) -> str:
    return str(value or "").strip().upper()


def normalize_trade_nature(value: object | None) -> str:
    normalized = str(value or TradeNature.PHYSICAL.value).strip().upper()
    valid_values = {trade_nature.value for trade_nature in TradeNature}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade nature '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_trade_structure(value: object | None) -> str:
    normalized = str(value or TradeStructure.SINGLE.value).strip().upper()
    valid_values = {trade_structure.value for trade_structure in TradeStructure}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade structure '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_trade_side(value: object | None) -> str:
    normalized = str(value or TradeSide.BUY.value).strip().upper()
    valid_values = {trade_side.value for trade_side in TradeSide}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade side '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_pricing_type(value: object | None) -> str:
    normalized = str(value or PricingType.FIXED.value).strip().upper()
    valid_values = {pricing_type.value for pricing_type in PricingType}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Pricing type '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_price_index_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def require_active_book(db: Session, book_code: object | None) -> str:
    normalized_book_code = str(book_code or "").strip().upper()
    if not normalized_book_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Book is required and must be selected from reference data",
        )

    reference_book = db.execute(
        select(ReferenceBook).where(
            ReferenceBook.code == normalized_book_code,
            ReferenceBook.is_active.is_(True),
        )
    ).scalars().first()
    if reference_book is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Book '{normalized_book_code}' is not active in reference data",
        )

    return normalized_book_code


def require_active_commodity(
    db: Session,
    commodity_class: object | None,
    commodity_code: object | None,
) -> tuple[str, str]:
    normalized_class = normalize_commodity_code(commodity_class)
    normalized_code = normalize_commodity_code(commodity_code)
    if not normalized_class:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Commodity class is required and must be selected from reference data",
        )
    if not normalized_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Commodity is required and must be selected from reference data",
        )

    reference_commodity = db.execute(
        select(ReferenceCommodity).where(
            ReferenceCommodity.commodity_class == normalized_class,
            ReferenceCommodity.code == normalized_code,
            ReferenceCommodity.is_active.is_(True),
        )
    ).scalars().first()
    if reference_commodity is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Commodity '{normalized_code}' is not active in commodity class "
                f"'{normalized_class}'"
            ),
        )

    return normalized_class, normalized_code


def require_active_price_index(
    db: Session,
    pricing_type: object | None,
    price_index_code: object | None,
) -> tuple[str, str | None]:
    normalized_pricing_type = normalize_pricing_type(pricing_type)
    normalized_price_index_code = normalize_price_index_code(price_index_code)

    if normalized_pricing_type in {PricingType.INDEX.value, PricingType.HYBRID.value}:
        if normalized_price_index_code is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Price index is required when pricing type is INDEX or HYBRID",
            )
    if normalized_price_index_code is None:
        return normalized_pricing_type, None

    reference_price_index = db.execute(
        select(ReferencePriceIndex).where(
            ReferencePriceIndex.code == normalized_price_index_code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalars().first()
    if reference_price_index is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Price index '{normalized_price_index_code}' is not active",
        )

    return normalized_pricing_type, normalized_price_index_code


def validate_trade_structure_payload(
    trade_structure: str,
    trade_side: object | None,
    legs_payload: object | None,
) -> tuple[str | None, list[dict[str, object]]]:
    if legs_payload is None:
        legs = []
    elif isinstance(legs_payload, list):
        legs = [leg for leg in legs_payload if isinstance(leg, dict)]
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="legs must be an array of objects when provided",
        )

    if trade_structure == TradeStructure.SINGLE.value:
        normalized_trade_side = normalize_trade_side(trade_side)
        return normalized_trade_side, legs

    if trade_side is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="trade_side cannot be set on SWAP trades; use legs instead",
        )
    if len(legs) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="SWAP trades require at least two legs",
        )
    return None, legs


def sync_trade_legs(
    db: Session,
    trade_id: str,
    trade_structure: str,
    trade_side: str | None,
    default_commodity_class: str,
    default_commodity_code: str,
    default_volume: object | None,
    legs_payload: list[dict[str, object]],
    timestamp: datetime,
) -> None:
    existing_legs = db.execute(
        select(TradeLeg).where(TradeLeg.trade_id == trade_id)
    ).scalars().all()
    existing_by_leg_no = {leg.leg_no: leg for leg in existing_legs}
    touched_leg_numbers: set[int] = set()

    if trade_structure == TradeStructure.SINGLE.value:
        legs_to_sync = [
            {
                "leg_no": 1,
                "side": trade_side,
                "commodity_class": default_commodity_class,
                "commodity_code": default_commodity_code,
                "quantity": default_volume,
            }
        ]
    else:
        legs_to_sync = []
        for index, leg_payload in enumerate(legs_payload, start=1):
            leg_no_raw = leg_payload.get("leg_no", index)
            try:
                leg_no = int(leg_no_raw)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Each leg must provide a numeric leg_no",
                ) from None
            side = normalize_trade_side(leg_payload.get("side"))
            commodity_class, commodity_code = require_active_commodity(
                db,
                leg_payload.get("commodity_class", default_commodity_class),
                leg_payload.get("commodity", default_commodity_code),
            )
            legs_to_sync.append(
                {
                    "leg_no": leg_no,
                    "side": side,
                    "commodity_class": commodity_class,
                    "commodity_code": commodity_code,
                    "quantity": leg_payload.get("volume", default_volume),
                }
            )

    for leg_data in legs_to_sync:
        leg_no = leg_data["leg_no"]
        touched_leg_numbers.add(leg_no)
        existing_leg = existing_by_leg_no.get(leg_no)
        if existing_leg is None:
            db.add(
                TradeLeg(
                    trade_leg_id=str(uuid.uuid4()),
                    trade_id=trade_id,
                    leg_no=leg_no,
                    side=leg_data["side"],
                    commodity_class=leg_data["commodity_class"],
                    commodity_code=leg_data["commodity_code"],
                    quantity=leg_data["quantity"],
                    created_at=timestamp,
                    updated_at=timestamp,
                )
            )
            continue

        existing_leg.side = leg_data["side"]
        existing_leg.commodity_class = leg_data["commodity_class"]
        existing_leg.commodity_code = leg_data["commodity_code"]
        existing_leg.quantity = leg_data["quantity"]
        existing_leg.updated_at = timestamp

    for existing_leg in existing_legs:
        if existing_leg.leg_no not in touched_leg_numbers:
            db.delete(existing_leg)


def sync_primary_price_term(
    db: Session,
    trade_id: str,
    pricing_type: str,
    fixed_price: object | None,
    price_index_code: str | None,
    timestamp: datetime,
) -> None:
    term = db.execute(
        select(TradePriceTerm).where(
            TradePriceTerm.trade_id == trade_id,
            TradePriceTerm.term_no == 1,
        )
    ).scalars().first()

    if term is None:
        term = TradePriceTerm(
            trade_price_term_id=str(uuid.uuid4()),
            trade_id=trade_id,
            term_no=1,
            pricing_type=pricing_type,
            fixed_price=fixed_price,
            price_index_code=price_index_code,
            created_at=timestamp,
            updated_at=timestamp,
        )
        db.add(term)
        return

    term.pricing_type = pricing_type
    term.fixed_price = fixed_price
    term.price_index_code = price_index_code
    term.updated_at = timestamp


@router.post("", response_model=EventOut, status_code=201)
def append_event(payload: EventCreate, request: Request, db: Session = Depends(get_db)) -> EventOut:
    correlation_id = getattr(request.state, "correlation_id", None) or request.headers.get("x-correlation-id")
    recorded_at = datetime.now(timezone.utc)

    e = Event(
        event_id=str(uuid.uuid4()),
        aggregate_type=payload.aggregate_type,
        aggregate_id=payload.aggregate_id,
        event_type=payload.event_type,
        occurred_at=payload.occurred_at,
        recorded_at=recorded_at,
        actor_id=payload.actor_id,
        correlation_id=correlation_id,
        causation_id=payload.causation_id,
        schema_version=payload.schema_version,
        payload=payload.payload,
    )
    try:
        db.add(e)
        db.flush()

        if e.aggregate_type == "trade" and e.event_type in {"TradeCreated", "TradeAmended", "TradeCancelled"}:
            payload_data = e.payload or {}
            existing = db.execute(
                select(Trade).where(Trade.trade_id == e.aggregate_id)
            ).scalars().first()
            before = trade_snapshot(existing)

            if e.event_type == "TradeCreated":
                trade_nature = normalize_trade_nature(payload_data.get("trade_nature"))
                trade_structure = normalize_trade_structure(payload_data.get("trade_structure"))
                trade_side, legs_payload = validate_trade_structure_payload(
                    trade_structure,
                    payload_data.get("trade_side"),
                    payload_data.get("legs"),
                )
                book = require_active_book(db, payload_data.get("book"))
                commodity_class, commodity = require_active_commodity(
                    db,
                    payload_data.get("commodity_class"),
                    payload_data.get("commodity"),
                )
                price = payload_data.get("price")
                volume = payload_data.get("volume")
                pricing_type, price_index_code = require_active_price_index(
                    db,
                    payload_data.get("pricing_type"),
                    payload_data.get("price_index_code"),
                )

                if existing is None:
                    existing = Trade(
                        trade_id=e.aggregate_id,
                        created_at=recorded_at,
                        updated_at=recorded_at,
                        trade_nature=trade_nature,
                        trade_structure=trade_structure,
                        trade_side=trade_side,
                        book=book,
                        commodity_class=commodity_class,
                        commodity=commodity,
                        pricing_type=pricing_type,
                        price_index_code=price_index_code,
                        price=price,
                        volume=volume,
                        status="ACTIVE",
                        last_event_id=e.event_id,
                    )
                    db.add(existing)
                else:
                    existing.updated_at = recorded_at
                    existing.trade_nature = trade_nature
                    existing.trade_structure = trade_structure
                    existing.trade_side = trade_side
                    existing.book = book
                    existing.commodity_class = commodity_class
                    existing.commodity = commodity
                    existing.pricing_type = pricing_type
                    existing.price_index_code = price_index_code
                    existing.price = price
                    existing.volume = volume
                    existing.status = "ACTIVE"
                    existing.last_event_id = e.event_id
                sync_primary_price_term(
                    db,
                    e.aggregate_id,
                    pricing_type,
                    price,
                    price_index_code,
                    recorded_at,
                )
                sync_trade_legs(
                    db,
                    e.aggregate_id,
                    trade_structure,
                    trade_side,
                    commodity_class,
                    commodity,
                    volume,
                    legs_payload,
                    recorded_at,
                )

            elif e.event_type == "TradeAmended" and existing is not None:
                existing.updated_at = recorded_at

                legs_payload: list[dict[str, object]] = []
                should_sync_legs = False
                if "trade_nature" in payload_data and payload_data["trade_nature"] is not None:
                    existing.trade_nature = normalize_trade_nature(payload_data["trade_nature"])
                if "trade_structure" in payload_data and payload_data["trade_structure"] is not None:
                    existing.trade_structure = normalize_trade_structure(payload_data["trade_structure"])
                if (
                    "trade_structure" in payload_data
                    or "trade_side" in payload_data
                    or "legs" in payload_data
                ):
                    normalized_trade_side, legs_payload = validate_trade_structure_payload(
                        existing.trade_structure,
                        payload_data.get("trade_side", existing.trade_side),
                        payload_data.get("legs"),
                    )
                    existing.trade_side = normalized_trade_side
                    should_sync_legs = True
                if "book" in payload_data and payload_data["book"] is not None:
                    existing.book = require_active_book(db, payload_data["book"])
                if (
                    "commodity" in payload_data and payload_data["commodity"] is not None
                ) or (
                    "commodity_class" in payload_data and payload_data["commodity_class"] is not None
                ):
                    commodity_class, commodity = require_active_commodity(
                        db,
                        payload_data.get("commodity_class", existing.commodity_class),
                        payload_data.get("commodity", existing.commodity),
                    )
                    existing.commodity_class = commodity_class
                    existing.commodity = commodity
                    should_sync_legs = True
                if (
                    "pricing_type" in payload_data and payload_data["pricing_type"] is not None
                ) or (
                    "price_index_code" in payload_data
                ):
                    pricing_type, price_index_code = require_active_price_index(
                        db,
                        payload_data.get("pricing_type", existing.pricing_type),
                        payload_data.get("price_index_code", existing.price_index_code),
                    )
                    existing.pricing_type = pricing_type
                    existing.price_index_code = price_index_code
                if "price" in payload_data and payload_data["price"] is not None:
                    existing.price = payload_data["price"]
                if "volume" in payload_data and payload_data["volume"] is not None:
                    existing.volume = payload_data["volume"]
                    should_sync_legs = True
                if "status" in payload_data and payload_data["status"] is not None:
                    existing.status = payload_data["status"]

                existing.last_event_id = e.event_id
                sync_primary_price_term(
                    db,
                    e.aggregate_id,
                    existing.pricing_type,
                    existing.price,
                    existing.price_index_code,
                    recorded_at,
                )
                if should_sync_legs:
                    sync_trade_legs(
                        db,
                        e.aggregate_id,
                        existing.trade_structure,
                        existing.trade_side,
                        existing.commodity_class,
                        existing.commodity,
                        existing.volume,
                        legs_payload,
                        recorded_at,
                    )

            elif e.event_type == "TradeCancelled" and existing is not None:
                existing.updated_at = recorded_at
                existing.status = "CANCELLED"
                existing.last_event_id = e.event_id

            after = trade_snapshot(existing)
            sync_positions_for_trade_change(db, before, after, recorded_at)

        db.commit()
        db.refresh(e)
    except Exception:
        db.rollback()
        raise

    return EventOut(
        event_id=e.event_id,
        aggregate_type=e.aggregate_type,
        aggregate_id=e.aggregate_id,
        event_type=e.event_type,
        occurred_at=e.occurred_at,
        recorded_at=e.recorded_at,
        actor_id=e.actor_id,
        correlation_id=e.correlation_id,
        causation_id=e.causation_id,
        schema_version=e.schema_version,
        payload=e.payload,
    )


@router.get("", response_model=List[EventOut])
def list_events(
    aggregate_type: Optional[str] = None,
    aggregate_id: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> List[EventOut]:
    limit = max(1, min(limit, 500))

    stmt = select(Event).order_by(Event.recorded_at.desc()).limit(limit)

    if aggregate_type:
        stmt = stmt.where(Event.aggregate_type == aggregate_type)
    if aggregate_id:
        stmt = stmt.where(Event.aggregate_id == aggregate_id)

    rows = db.execute(stmt).scalars().all()
    return [
        EventOut(
            event_id=r.event_id,
            aggregate_type=r.aggregate_type,
            aggregate_id=r.aggregate_id,
            event_type=r.event_type,
            occurred_at=r.occurred_at,
            recorded_at=r.recorded_at,
            actor_id=r.actor_id,
            correlation_id=r.correlation_id,
            causation_id=r.causation_id,
            schema_version=r.schema_version,
            payload=r.payload,
        )
        for r in rows
    ]
