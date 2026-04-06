from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.trade import Trade


def build_exposure_summary(db: Session) -> list[dict]:
    trade_counts = {
        commodity: count
        for commodity, count in db.execute(
            select(Trade.commodity, func.count())
            .where(Trade.status == "ACTIVE")
            .group_by(Trade.commodity)
        ).all()
    }

    rows = db.execute(select(Position).order_by(Position.commodity.asc())).scalars().all()
    return [
        {
            "commodity": row.commodity,
            "net_volume": float(row.net_volume),
            "active_trade_count": trade_counts.get(row.commodity, 0),
            "updated_at": row.updated_at,
        }
        for row in rows
    ]


def build_activity_summary(db: Session) -> list[dict]:
    return [
        {
            "event_type": event_type,
            "event_count": event_count,
            "last_occurred_at": last_occurred_at,
        }
        for event_type, event_count, last_occurred_at in db.execute(
            select(Event.event_type, func.count(), func.max(Event.occurred_at))
            .where(Event.aggregate_type == "trade")
            .group_by(Event.event_type)
            .order_by(func.max(Event.occurred_at).desc())
        ).all()
    ]


def build_reporting_overview(db: Session) -> dict:
    exposure = build_exposure_summary(db)
    activity = build_activity_summary(db)
    active_trade_count = db.execute(
        select(func.count()).select_from(Trade).where(Trade.status == "ACTIVE")
    ).scalar_one()
    gross_net_volume = sum((Decimal(str(row["net_volume"])) for row in exposure), start=Decimal("0"))
    return {
        "active_trade_count": active_trade_count,
        "tracked_commodity_count": len(exposure),
        "gross_net_volume": float(gross_net_volume),
        "exposure": exposure,
        "activity": activity,
    }
