from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import text, select

from apps.api.app.db.engine import SessionLocal
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade


def to_decimal_or_none(value):
    if value is None:
        return None
    return Decimal(str(value))


def main() -> None:
    db = SessionLocal()

    try:
        print("Clearing trades projection...")
        db.execute(text("DELETE FROM trades"))
        db.commit()

        print("Loading trade events...")
        events = db.execute(
            select(Event)
            .where(Event.aggregate_type == "trade")
            .order_by(Event.recorded_at.asc())
        ).scalars().all()

        print(f"Found {len(events)} trade events")

        # In-memory projection state keyed by trade_id
        trade_state: dict[str, dict] = {}

        for e in events:
            payload = e.payload or {}
            trade_id = e.aggregate_id
            now = e.recorded_at or datetime.now(timezone.utc)

            if e.event_type == "TradeCreated":
                existing = trade_state.get(trade_id)

                if existing is None:
                    trade_state[trade_id] = {
                        "trade_id": trade_id,
                        "created_at": now,
                        "updated_at": now,
                        "commodity": payload.get("commodity") or "UNKNOWN",
                        "price": to_decimal_or_none(payload.get("price")),
                        "volume": to_decimal_or_none(payload.get("volume")),
                        "status": payload.get("status") or "ACTIVE",
                        "last_event_id": e.event_id,
                    }
                else:
                    # Treat duplicate TradeCreated as latest overwrite for mutable fields
                    existing["updated_at"] = now
                    if payload.get("commodity") is not None:
                        existing["commodity"] = payload.get("commodity")
                    if payload.get("price") is not None:
                        existing["price"] = to_decimal_or_none(payload.get("price"))
                    if payload.get("volume") is not None:
                        existing["volume"] = to_decimal_or_none(payload.get("volume"))
                    if payload.get("status") is not None:
                        existing["status"] = payload.get("status")
                    existing["last_event_id"] = e.event_id

            elif e.event_type == "TradeAmended":
                existing = trade_state.get(trade_id)

                if existing is None:
                    print(f"Skipping TradeAmended for missing trade: {trade_id}")
                    continue

                existing["updated_at"] = now
                if payload.get("commodity") is not None:
                    existing["commodity"] = payload.get("commodity")
                if payload.get("price") is not None:
                    existing["price"] = to_decimal_or_none(payload.get("price"))
                if payload.get("volume") is not None:
                    existing["volume"] = to_decimal_or_none(payload.get("volume"))
                if payload.get("status") is not None:
                    existing["status"] = payload.get("status")
                existing["last_event_id"] = e.event_id

            elif e.event_type == "TradeCancelled":
                existing = trade_state.get(trade_id)

                if existing is None:
                    print(f"Skipping TradeCancelled for missing trade: {trade_id}")
                    continue

                existing["updated_at"] = now
                existing["status"] = "CANCELLED"
                existing["last_event_id"] = e.event_id

        print(f"Writing {len(trade_state)} trades to projection...")
        for trade in trade_state.values():
            db.add(
                Trade(
                    trade_id=trade["trade_id"],
                    created_at=trade["created_at"],
                    updated_at=trade["updated_at"],
                    commodity=trade["commodity"],
                    price=trade["price"],
                    volume=trade["volume"],
                    status=trade["status"],
                    last_event_id=trade["last_event_id"],
                )
            )

        db.commit()
        print("Trades projection rebuild complete.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
