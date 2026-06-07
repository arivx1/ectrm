from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_trade_side,
    parse_optional_date,
    validate_date_range,
)
from apps.api.app.domains.trading.services.trade_reference_validation import (
    require_active_commodity,
    require_active_location,
)
from apps.api.app.domains.trading.services.trade_unit_resolution import (
    require_active_unit,
)
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.shared.enums import TradeStructure


def sync_trade_legs(
    db: Session,
    trade_id: str,
    trade_structure: str,
    trade_side: str | None,
    default_commodity_class: str,
    default_commodity_code: str,
    default_volume: object | None,
    default_location_code: str | None,
    default_quantity_unit_code: str | None,
    default_delivery_start: date | None,
    default_delivery_end: date | None,
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
                "location_code": default_location_code,
                "quantity": default_volume,
                "quantity_unit_code": default_quantity_unit_code,
                "delivery_start": default_delivery_start,
                "delivery_end": default_delivery_end,
            }
        ]
    else:
        source_legs_payload = legs_payload
        if not source_legs_payload:
            source_legs_payload = [
                {
                    "leg_no": leg.leg_no,
                    "side": leg.side,
                    "commodity_class": leg.commodity_class,
                    "commodity": leg.commodity_code,
                    "volume": leg.quantity,
                }
                for leg in sorted(existing_legs, key=lambda leg: leg.leg_no)
            ]
        legs_to_sync = []
        for index, leg_payload in enumerate(source_legs_payload, start=1):
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
            location_code = require_active_location(
                db,
                leg_payload.get("location_code", default_location_code),
            )
            quantity_unit_code = require_active_unit(
                db,
                leg_payload.get("quantity_unit_code", default_quantity_unit_code),
            )
            delivery_start = parse_optional_date(
                leg_payload.get("delivery_start", default_delivery_start),
                field_name=f"Leg {leg_no} delivery_start",
            )
            delivery_end = parse_optional_date(
                leg_payload.get("delivery_end", default_delivery_end),
                field_name=f"Leg {leg_no} delivery_end",
            )
            validate_date_range(
                delivery_start,
                delivery_end,
                start_field=f"leg {leg_no} delivery_start",
                end_field=f"leg {leg_no} delivery_end",
            )
            legs_to_sync.append(
                {
                    "leg_no": leg_no,
                    "side": side,
                    "commodity_class": commodity_class,
                    "commodity_code": commodity_code,
                    "location_code": location_code,
                    "quantity": leg_payload.get("volume", default_volume),
                    "quantity_unit_code": quantity_unit_code,
                    "delivery_start": delivery_start,
                    "delivery_end": delivery_end,
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
                    location_code=leg_data["location_code"],
                    quantity=leg_data["quantity"],
                    quantity_unit_code=leg_data["quantity_unit_code"],
                    delivery_start=leg_data["delivery_start"],
                    delivery_end=leg_data["delivery_end"],
                    created_at=timestamp,
                    updated_at=timestamp,
                )
            )
            continue

        existing_leg.side = leg_data["side"]
        existing_leg.commodity_class = leg_data["commodity_class"]
        existing_leg.commodity_code = leg_data["commodity_code"]
        existing_leg.location_code = leg_data["location_code"]
        existing_leg.quantity = leg_data["quantity"]
        existing_leg.quantity_unit_code = leg_data["quantity_unit_code"]
        existing_leg.delivery_start = leg_data["delivery_start"]
        existing_leg.delivery_end = leg_data["delivery_end"]
        existing_leg.updated_at = timestamp

    for existing_leg in existing_legs:
        if existing_leg.leg_no not in touched_leg_numbers:
            db.delete(existing_leg)
