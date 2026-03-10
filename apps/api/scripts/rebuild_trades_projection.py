from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import text, select

from apps.api.app.db.engine import SessionLocal
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.shared.enums import PricingType, TradeNature, TradeSide, TradeStructure


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


def normalize_pricing_type(value):
    normalized = str(value or PricingType.FIXED.value).strip().upper()
    valid_values = {pricing_type.value for pricing_type in PricingType}
    return normalized if normalized in valid_values else PricingType.FIXED.value


def normalize_trade_nature(value):
    normalized = str(value or TradeNature.PHYSICAL.value).strip().upper()
    valid_values = {trade_nature.value for trade_nature in TradeNature}
    return normalized if normalized in valid_values else TradeNature.PHYSICAL.value


def normalize_trade_structure(value):
    normalized = str(value or TradeStructure.SINGLE.value).strip().upper()
    valid_values = {trade_structure.value for trade_structure in TradeStructure}
    return normalized if normalized in valid_values else TradeStructure.SINGLE.value


def normalize_trade_side(value):
    normalized = str(value or TradeSide.BUY.value).strip().upper()
    valid_values = {trade_side.value for trade_side in TradeSide}
    return normalized if normalized in valid_values else TradeSide.BUY.value


def normalize_price_index_code(value):
    normalized = str(value or "").strip().upper()
    return normalized or None


def normalize_legs(value):
    if not isinstance(value, list):
        return []
    return [leg for leg in value if isinstance(leg, dict)]


def main() -> None:
    db = SessionLocal()

    try:
        print("Clearing trades projection...")
        db.execute(text("DELETE FROM trade_legs"))
        db.execute(text("DELETE FROM trade_price_terms"))
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
                        "trade_nature": normalize_trade_nature(payload.get("trade_nature")),
                        "trade_structure": normalize_trade_structure(payload.get("trade_structure")),
                        "trade_side": normalize_trade_side(payload.get("trade_side")),
                        "legs": normalize_legs(payload.get("legs")),
                        "book": normalize_book(payload.get("book")),
                        "commodity_class": normalize_commodity_class(
                            payload.get("commodity_class"),
                            payload.get("commodity"),
                        ),
                        "commodity": normalize_commodity_code(payload.get("commodity")),
                        "pricing_type": normalize_pricing_type(payload.get("pricing_type")),
                        "price_index_code": normalize_price_index_code(payload.get("price_index_code")),
                        "price": to_decimal_or_none(payload.get("price")),
                        "volume": to_decimal_or_none(payload.get("volume")),
                        "status": payload.get("status") or "ACTIVE",
                        "last_event_id": e.event_id,
                    }
                else:
                    existing["updated_at"] = now
                    if "trade_nature" in payload:
                        existing["trade_nature"] = normalize_trade_nature(payload.get("trade_nature"))
                    if "trade_structure" in payload:
                        existing["trade_structure"] = normalize_trade_structure(
                            payload.get("trade_structure")
                        )
                    if "trade_side" in payload:
                        existing["trade_side"] = normalize_trade_side(payload.get("trade_side"))
                    if "legs" in payload:
                        existing["legs"] = normalize_legs(payload.get("legs"))
                    existing["book"] = normalize_book(payload.get("book", existing.get("book")))
                    if payload.get("commodity_class") is not None or payload.get("commodity") is not None:
                        existing["commodity_class"] = normalize_commodity_class(
                            payload.get("commodity_class", existing.get("commodity_class")),
                            payload.get("commodity", existing.get("commodity")),
                        )
                    if payload.get("commodity") is not None:
                        existing["commodity"] = normalize_commodity_code(payload.get("commodity"))
                    if "pricing_type" in payload:
                        existing["pricing_type"] = normalize_pricing_type(payload.get("pricing_type"))
                    if "price_index_code" in payload:
                        existing["price_index_code"] = normalize_price_index_code(
                            payload.get("price_index_code")
                        )
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
                if "trade_nature" in payload:
                    existing["trade_nature"] = normalize_trade_nature(payload.get("trade_nature"))
                if "trade_structure" in payload:
                    existing["trade_structure"] = normalize_trade_structure(payload.get("trade_structure"))
                if "trade_side" in payload:
                    existing["trade_side"] = normalize_trade_side(payload.get("trade_side"))
                if "legs" in payload:
                    existing["legs"] = normalize_legs(payload.get("legs"))
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
                if "pricing_type" in payload:
                    existing["pricing_type"] = normalize_pricing_type(payload.get("pricing_type"))
                if "price_index_code" in payload:
                    existing["price_index_code"] = normalize_price_index_code(
                        payload.get("price_index_code")
                    )
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
                    trade_nature=trade.get("trade_nature", TradeNature.PHYSICAL.value),
                    trade_structure=trade.get("trade_structure", TradeStructure.SINGLE.value),
                    trade_side=(
                        trade.get("trade_side")
                        if trade.get("trade_structure", TradeStructure.SINGLE.value) == TradeStructure.SWAP.value
                        else trade.get("trade_side", TradeSide.BUY.value)
                    ),
                    book=normalize_book(trade.get("book")),
                    commodity_class=trade["commodity_class"],
                    commodity=trade["commodity"],
                    pricing_type=trade.get("pricing_type", PricingType.FIXED.value),
                    price_index_code=trade.get("price_index_code"),
                    price=trade["price"],
                    volume=trade["volume"],
                    status=trade["status"],
                    last_event_id=trade["last_event_id"],
                )
            )
            if trade.get("trade_structure", TradeStructure.SINGLE.value) == TradeStructure.SINGLE.value:
                db.add(
                    TradeLeg(
                        trade_leg_id=f"{trade['trade_id']}-leg-1",
                        trade_id=trade["trade_id"],
                        leg_no=1,
                        side=trade.get("trade_side", TradeSide.BUY.value),
                        commodity_class=trade["commodity_class"],
                        commodity_code=trade["commodity"],
                        quantity=trade["volume"],
                        created_at=trade["created_at"],
                        updated_at=trade["updated_at"],
                    )
                )
            else:
                for index, leg in enumerate(trade.get("legs", []), start=1):
                    db.add(
                        TradeLeg(
                            trade_leg_id=f"{trade['trade_id']}-leg-{index}",
                            trade_id=trade["trade_id"],
                            leg_no=int(leg.get("leg_no", index)),
                            side=normalize_trade_side(leg.get("side")),
                            commodity_class=normalize_commodity_class(
                                leg.get("commodity_class"),
                                leg.get("commodity", trade["commodity"]),
                            ),
                            commodity_code=normalize_commodity_code(
                                leg.get("commodity", trade["commodity"])
                            ),
                            quantity=to_decimal_or_none(leg.get("volume", trade["volume"])),
                            created_at=trade["created_at"],
                            updated_at=trade["updated_at"],
                        )
                    )
            db.add(
                TradePriceTerm(
                    trade_price_term_id=f"{trade['trade_id']}-1",
                    trade_id=trade["trade_id"],
                    term_no=1,
                    pricing_type=trade.get("pricing_type", PricingType.FIXED.value),
                    fixed_price=trade["price"],
                    price_index_code=trade.get("price_index_code"),
                    created_at=trade["created_at"],
                    updated_at=trade["updated_at"],
                )
            )

        db.commit()
        print("Trades projection rebuild complete.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
