from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import text, select

from apps.api.app.db.engine import SessionLocal
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade


DEFAULT_BOOK = "CRUDE_PHYS"
COMMODITY_CLASS_BY_CODE = {
    "POWER": "POWER",
    "NATURAL_GAS": "NATURAL_GAS",
    "LNG": "LNG",
    "PROPANE": "NGL",
    "BUTANE": "NGL",
    "ISOBUTANE": "NGL",
    "ETHANE": "NGL",
    "NATURAL_GASOLINE": "NGL",
    "NGL": "NGL",
    "WTI": "CRUDE_OIL",
    "BRENT": "CRUDE_OIL",
    "LLS": "CRUDE_OIL",
    "ANS": "CRUDE_OIL",
    "DUBAI": "CRUDE_OIL",
    "CRUDE_OIL": "CRUDE_OIL",
    "METHANOL": "CHEMICAL",
    "AMMONIA": "CHEMICAL",
    "UREA": "CHEMICAL",
    "COPPER": "BASE_METAL",
    "ALUMINUM": "BASE_METAL",
    "NICKEL": "BASE_METAL",
    "ZINC": "BASE_METAL",
    "GOLD": "PRECIOUS_METAL",
    "SILVER": "PRECIOUS_METAL",
    "PLATINUM": "PRECIOUS_METAL",
    "PALLADIUM": "PRECIOUS_METAL",
    "IRON_ORE": "METAL_ORE",
    "BAUXITE": "METAL_ORE",
    "SPODUMENE": "METAL_ORE",
    "WHEAT": "AGRICULTURE",
    "CORN": "AGRICULTURE",
    "SOYBEANS": "AGRICULTURE",
    "SUGAR": "AGRICULTURE",
    "COFFEE": "AGRICULTURE",
    "COTTON": "AGRICULTURE",
    "COAL": "OTHER",
    "CARBON": "OTHER",
    "GASOLINE": "REFINED_PRODUCTS",
    "DIESEL": "REFINED_PRODUCTS",
    "JET_FUEL": "REFINED_PRODUCTS",
    "FUEL_OIL": "REFINED_PRODUCTS",
    "NAPHTHA": "REFINED_PRODUCTS",
}

LEGACY_COMMODITY_CODE_BY_VALUE = {
    "CRUDE": "WTI",
}


def to_decimal_or_none(value):
    if value is None:
        return None
    return Decimal(str(value))


def normalize_book(value):
    if value is None:
        return DEFAULT_BOOK
    value_str = str(value).strip()
    return value_str or DEFAULT_BOOK


def normalize_commodity_class(value, commodity):
    if value is not None and str(value).strip():
        return str(value).strip().upper()
    return COMMODITY_CLASS_BY_CODE.get(str(commodity or "").strip().upper(), "OTHER")


def normalize_commodity_code(value):
    normalized = str(value or "").strip().upper()
    return LEGACY_COMMODITY_CODE_BY_VALUE.get(normalized, normalized or "UNKNOWN")


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
                        "book": normalize_book(payload.get("book")),
                        "commodity_class": normalize_commodity_class(
                            payload.get("commodity_class"),
                            payload.get("commodity"),
                        ),
                        "commodity": normalize_commodity_code(payload.get("commodity")),
                        "price": to_decimal_or_none(payload.get("price")),
                        "volume": to_decimal_or_none(payload.get("volume")),
                        "status": payload.get("status") or "ACTIVE",
                        "last_event_id": e.event_id,
                    }
                else:
                    existing["updated_at"] = now
                    existing["book"] = normalize_book(payload.get("book", existing.get("book")))
                    if payload.get("commodity_class") is not None or payload.get("commodity") is not None:
                        existing["commodity_class"] = normalize_commodity_class(
                            payload.get("commodity_class", existing.get("commodity_class")),
                            payload.get("commodity", existing.get("commodity")),
                        )
                    if payload.get("commodity") is not None:
                        existing["commodity"] = normalize_commodity_code(payload.get("commodity"))
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
                if "book" in payload:
                    existing["book"] = normalize_book(payload.get("book"))
                else:
                    existing["book"] = normalize_book(existing.get("book"))
                if "commodity_class" in payload or "commodity" in payload:
                    existing["commodity_class"] = normalize_commodity_class(
                        payload.get("commodity_class", existing.get("commodity_class")),
                        payload.get("commodity", existing.get("commodity")),
                    )
                if payload.get("commodity") is not None:
                    existing["commodity"] = normalize_commodity_code(payload.get("commodity"))
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
                existing["book"] = normalize_book(existing.get("book"))
                existing["status"] = "CANCELLED"
                existing["last_event_id"] = e.event_id

        print(f"Writing {len(trade_state)} trades to projection...")
        for trade in trade_state.values():
            db.add(
                Trade(
                    trade_id=trade["trade_id"],
                    created_at=trade["created_at"],
                    updated_at=trade["updated_at"],
                    book=normalize_book(trade.get("book")),
                    commodity_class=trade["commodity_class"],
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
