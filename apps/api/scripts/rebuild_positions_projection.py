from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import text, select

from apps.api.app.db.engine import SessionLocal
from apps.api.app.models.trade import Trade
from apps.api.app.models.position import Position


def main() -> None:
    db = SessionLocal()

    try:
        print("Clearing positions projection...")
        db.execute(text("DELETE FROM positions"))
        db.commit()

        trades = db.execute(select(Trade)).scalars().all()

        totals: dict[str, Decimal] = {}
        now = datetime.now(timezone.utc)

        for t in trades:
            if t.status == "CANCELLED":
                continue

            commodity = t.commodity or "UNKNOWN"
            volume = Decimal(str(t.volume or 0))

            totals[commodity] = totals.get(commodity, Decimal("0")) + volume

        print(f"Writing {len(totals)} positions...")

        for commodity, net_volume in totals.items():
            db.add(
                Position(
                    commodity=commodity,
                    net_volume=net_volume,
                    updated_at=now,
                )
            )

        db.commit()
        print("Positions rebuild complete.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
