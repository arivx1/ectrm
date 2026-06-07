from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_leg_projection import sync_trade_legs
from apps.api.app.domains.trading.services.trade_price_projection import sync_primary_price_term
from apps.api.app.domains.trading.services.trade_write_contracts import (
    ValidatedAmendTradeWrite,
    ValidatedBookTradeWrite,
)
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade


def sync_booked_trade_terms(
    db: Session,
    *,
    event: Event,
    validated: ValidatedBookTradeWrite,
    recorded_at: datetime,
) -> None:
    sync_primary_price_term(
        db,
        event.aggregate_id,
        validated.pricing_type,
        validated.price,
        validated.price_index_code,
        validated.trade_currency_code,
        validated.price_unit_code,
        recorded_at,
    )
    sync_trade_legs(
        db,
        event.aggregate_id,
        validated.trade_structure,
        validated.trade_side,
        validated.commodity_class,
        validated.commodity,
        validated.volume,
        validated.location_code,
        validated.unit_of_measure,
        validated.delivery_start,
        validated.delivery_end,
        validated.legs_payload,
        recorded_at,
    )


def sync_amended_trade_terms(
    db: Session,
    *,
    event: Event,
    trade: Trade,
    validated: ValidatedAmendTradeWrite,
    recorded_at: datetime,
) -> None:
    sync_primary_price_term(
        db,
        event.aggregate_id,
        trade.pricing_type,
        trade.price,
        trade.price_index_code,
        trade.trade_currency_code,
        trade.price_unit_code,
        recorded_at,
    )
    if not validated.should_sync_legs:
        return
    sync_trade_legs(
        db,
        event.aggregate_id,
        validated.trade_structure,
        validated.trade_side,
        validated.commodity_class,
        validated.commodity,
        validated.volume,
        validated.location_code,
        validated.unit_of_measure,
        validated.delivery_start,
        validated.delivery_end,
        validated.legs_payload or [],
        recorded_at,
    )
