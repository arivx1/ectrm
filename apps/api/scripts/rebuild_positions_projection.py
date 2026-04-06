from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import text, select

from apps.api.app.db.engine import SessionLocal
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.position import Position


ZERO = Decimal("0")


def signed_quantity(side: str | None, quantity: object | None) -> Decimal:
    volume = Decimal(str(quantity or 0))
    if (side or "BUY").strip().upper() == "SELL":
        return volume * Decimal("-1")
    return volume


def accumulate_position(
    totals: dict[str, dict[str, object]],
    commodity: str | None,
    delta: Decimal,
    updated_at: datetime,
) -> None:
    normalized_commodity = str(commodity or "UNKNOWN").strip().upper() or "UNKNOWN"
    if delta == ZERO:
        return

    current = totals.setdefault(
        normalized_commodity,
        {"net_volume": ZERO, "updated_at": updated_at},
    )
    current["net_volume"] = Decimal(str(current["net_volume"])) + delta
    if updated_at > current["updated_at"]:
        current["updated_at"] = updated_at


def main() -> None:
    db = SessionLocal()

    try:
        print("Clearing positions projection...")
        db.execute(text("DELETE FROM positions"))
        db.commit()

        trades = db.execute(select(Trade)).scalars().all()
        legs_by_trade_id: dict[str, list[TradeLeg]] = {}
        for leg in db.execute(
            select(TradeLeg).order_by(TradeLeg.trade_id.asc(), TradeLeg.leg_no.asc())
        ).scalars():
            legs_by_trade_id.setdefault(leg.trade_id, []).append(leg)

        totals: dict[str, dict[str, object]] = {}
        now = datetime.now(timezone.utc)

        for t in trades:
            if t.status == "CANCELLED":
                continue
            if str(getattr(t, "instrument_type", "LINEAR") or "LINEAR").strip().upper() == "OPTION":
                continue

            trade_updated_at = t.updated_at or now
            legs = legs_by_trade_id.get(t.trade_id, [])
            if legs:
                for leg in legs:
                    accumulate_position(
                        totals,
                        leg.commodity_code,
                        signed_quantity(leg.side, leg.quantity),
                        leg.updated_at or trade_updated_at,
                    )
                continue

            accumulate_position(
                totals,
                t.commodity,
                signed_quantity(t.trade_side, t.volume),
                trade_updated_at,
            )

        print(f"Writing {len(totals)} positions...")

        for commodity, payload in totals.items():
            net_volume = Decimal(str(payload["net_volume"]))
            if net_volume == ZERO:
                continue
            db.add(
                Position(
                    commodity=commodity,
                    net_volume=net_volume,
                    updated_at=payload["updated_at"],
                )
            )

        db.commit()
        print("Positions rebuild complete.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
