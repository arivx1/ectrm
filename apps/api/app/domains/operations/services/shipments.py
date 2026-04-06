from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.trade import Trade
from apps.api.app.schemas.shipment import ShipmentOut


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _booked_at_for_trade(trade: Trade) -> datetime:
    return _coerce_utc(trade.execution_timestamp) or _coerce_utc(trade.created_at) or datetime.now(timezone.utc)


def _direction_for_trade(trade: Trade) -> str:
    normalized_side = (trade.trade_side or "").strip().upper()
    if normalized_side == "BUY":
        return "INBOUND"
    if normalized_side == "SELL":
        return "OUTBOUND"
    return "UNSPECIFIED"


def _blockers_for_trade(trade: Trade) -> list[str]:
    blockers: list[str] = []

    if not (trade.counterparty or "").strip():
        blockers.append("Counterparty assignment is missing.")
    if trade.volume is None or float(trade.volume) == 0:
        blockers.append("Shipment volume has not been captured.")
    if not (trade.unit_of_measure or "").strip():
        blockers.append("Unit of measure is missing.")
    if trade.execution_timestamp is None:
        blockers.append("Execution timestamp is missing.")
    if trade.pricing_type != "FIXED" and not (trade.price_index_code or "").strip():
        blockers.append("Price index is missing for non-fixed pricing.")

    return blockers


def _status_for_trade(trade: Trade, blockers: list[str]) -> str:
    if trade.settlement_status == "SETTLED":
        return "COMPLETED"
    if blockers:
        return "BLOCKED"
    if trade.pricing_status == "PRICED":
        return "READY"
    return "IN_PROGRESS"


def list_shipments_for_operations(db: Session, *, now: Optional[datetime] = None) -> list[ShipmentOut]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trades = db.execute(
        select(Trade)
        .where(
            Trade.trade_nature == "PHYSICAL",
            Trade.status != "CANCELLED",
        )
        .order_by(Trade.updated_at.desc(), Trade.trade_id.desc())
    ).scalars().all()

    shipments: list[ShipmentOut] = []
    for trade in trades:
        booked_at = _booked_at_for_trade(trade)
        blockers = _blockers_for_trade(trade)
        status = _status_for_trade(trade, blockers)
        last_updated_at = _coerce_utc(trade.updated_at) or booked_at
        age_days = max(0, int((reference_time - booked_at).total_seconds() // 86400))

        shipments.append(
            ShipmentOut(
                shipment_id=f"SHP-{trade.trade_id}",
                trade_id=trade.trade_id,
                external_trade_id=trade.external_trade_id,
                status=status,
                direction=_direction_for_trade(trade),
                book=trade.book,
                portfolio=trade.portfolio,
                counterparty=trade.counterparty,
                commodity_class=trade.commodity_class,
                commodity=trade.commodity,
                volume=float(trade.volume) if trade.volume is not None else None,
                unit_of_measure=trade.unit_of_measure,
                booked_at=booked_at,
                last_updated_at=last_updated_at,
                age_days=age_days,
                pricing_status=trade.pricing_status,
                settlement_status=trade.settlement_status,
                blocker_count=len(blockers),
                blockers=blockers,
            )
        )

    status_rank = {"BLOCKED": 0, "IN_PROGRESS": 1, "READY": 2, "COMPLETED": 3}
    return sorted(
        shipments,
        key=lambda shipment: (
            status_rank.get(shipment.status, 99),
            -shipment.age_days,
            shipment.trade_id,
        ),
    )
