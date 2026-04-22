from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import text, select

from apps.api.app.db.engine import SessionLocal
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.shared.enums import (
    AllocationStatus,
    ConfirmationStatus,
    InvoiceStatus,
    NominationStatus,
    OptionStyle,
    OptionType,
    PaymentStatus,
    PricingStatus,
    PricingType,
    SettlementStatus,
    TradeInstrumentType,
    TradeNature,
    TradeSide,
    TradeStatus,
    TradeStructure,
)


DEFAULT_BOOK = "CRUDE_PHYS"
DEFAULT_SOURCE_SYSTEM = "ETRM"
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
OPTION_LIFECYCLE_EVENT_TO_STATUS = {
    "OptionExercised": TradeStatus.EXERCISED.value,
    "OptionExpired": TradeStatus.EXPIRED.value,
    "OptionAssigned": TradeStatus.ASSIGNED.value,
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


def normalize_instrument_type(value):
    normalized = str(value or TradeInstrumentType.LINEAR.value).strip().upper()
    valid_values = {instrument_type.value for instrument_type in TradeInstrumentType}
    return normalized if normalized in valid_values else TradeInstrumentType.LINEAR.value


def normalize_trade_structure(value):
    normalized = str(value or TradeStructure.SINGLE.value).strip().upper()
    valid_values = {trade_structure.value for trade_structure in TradeStructure}
    return normalized if normalized in valid_values else TradeStructure.SINGLE.value


def normalize_trade_side(value):
    normalized = str(value or TradeSide.BUY.value).strip().upper()
    valid_values = {trade_side.value for trade_side in TradeSide}
    return normalized if normalized in valid_values else TradeSide.BUY.value


def normalize_trade_status(value, default=TradeStatus.ACTIVE.value):
    normalized = str(value or default).strip().upper()
    valid_values = {trade_status.value for trade_status in TradeStatus}
    return normalized if normalized in valid_values else default


def normalize_option_type(value):
    normalized = normalize_optional_text(value, uppercase=True)
    valid_values = {option_type.value for option_type in OptionType}
    if normalized in valid_values:
        return normalized
    return None


def normalize_option_style(value):
    normalized = normalize_optional_text(value, uppercase=True)
    valid_values = {option_style.value for option_style in OptionStyle}
    if normalized in valid_values:
        return normalized
    return None


def normalize_price_index_code(value):
    normalized = str(value or "").strip().upper()
    return normalized or None


def normalize_optional_text(value, *, uppercase=False):
    normalized = str(value or "").strip()
    if not normalized:
        return None
    return normalized.upper() if uppercase else normalized


def validate_originating_option_trade_reference(
    trade_state,
    *,
    trade_id,
    instrument_type,
    originating_option_trade_id,
):
    normalized_originating_trade_id = normalize_optional_text(originating_option_trade_id)
    if normalized_originating_trade_id is None:
        return None

    if normalize_instrument_type(instrument_type) != TradeInstrumentType.LINEAR.value:
        raise ValueError("originating_option_trade_id can only be set on LINEAR trades")
    if normalized_originating_trade_id == trade_id:
        raise ValueError("originating_option_trade_id cannot reference the trade being created")

    originating_trade = trade_state.get(normalized_originating_trade_id)
    if originating_trade is None:
        raise ValueError(
            f"originating_option_trade_id '{normalized_originating_trade_id}' does not reference an existing trade"
        )
    if normalize_instrument_type(originating_trade.get("instrument_type")) != TradeInstrumentType.OPTION.value:
        raise ValueError("originating_option_trade_id must reference an OPTION trade")
    if normalize_trade_status(originating_trade.get("status")) not in {
        TradeStatus.EXERCISED.value,
        TradeStatus.ASSIGNED.value,
    }:
        raise ValueError(
            f"originating_option_trade_id '{normalized_originating_trade_id}' must reference an "
            "EXERCISED or ASSIGNED option trade"
        )
    for existing_trade_id, existing_trade in trade_state.items():
        if existing_trade_id == trade_id:
            continue
        if existing_trade.get("originating_option_trade_id") == normalized_originating_trade_id:
            raise ValueError(
                f"Option trade '{normalized_originating_trade_id}' already has a resulting trade "
                f"'{existing_trade_id}'"
            )
    return normalized_originating_trade_id


def normalize_trade_header_status(value, default, *, field_name, valid_values):
    normalized = str(value or default).strip().upper()
    if not normalized:
        return default
    if normalized not in valid_values:
        raise ValueError(
            f"{field_name} '{normalized}' is invalid. Expected one of: "
            f"{', '.join(sorted(valid_values))}"
        )
    return normalized


def normalize_execution_timestamp(value):
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    candidate = str(value).strip()
    if not candidate:
        return None
    parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_optional_date(value):
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        coerced = value if value.tzinfo is None else value.astimezone(timezone.utc)
        return coerced.date()
    if isinstance(value, date):
        return value
    candidate = str(value).strip()
    if not candidate:
        return None
    if "T" in candidate:
        return datetime.fromisoformat(candidate.replace("Z", "+00:00")).date()
    return date.fromisoformat(candidate)


def validate_date_range(start_value, end_value, *, start_field, end_field):
    if start_value is not None and end_value is not None and end_value < start_value:
        raise ValueError(f"{end_field} must be on or after {start_field}")


def default_trade_workflow_statuses(trade_nature):
    requires_physical_workflows = trade_nature == TradeNature.PHYSICAL.value
    return {
        "confirmation_status": ConfirmationStatus.PENDING.value,
        "nomination_status": (
            NominationStatus.PENDING.value
            if requires_physical_workflows
            else NominationStatus.NOT_REQUIRED.value
        ),
        "allocation_status": (
            AllocationStatus.PENDING.value
            if requires_physical_workflows
            else AllocationStatus.NOT_REQUIRED.value
        ),
        "invoice_status": (
            InvoiceStatus.PENDING.value
            if requires_physical_workflows
            else InvoiceStatus.NOT_REQUIRED.value
        ),
        "payment_status": PaymentStatus.PENDING.value,
    }


def apply_portfolio_payload(trade_state, payload, *, book_changed=False):
    if "portfolio" in payload:
        portfolio = normalize_optional_text(payload.get("portfolio"), uppercase=True)
        trade_state["portfolio"] = portfolio
        trade_state["portfolio_book"] = trade_state.get("book") if portfolio else None
        return

    if book_changed and trade_state.get("portfolio") is not None:
        if trade_state.get("portfolio_book") != trade_state.get("book"):
            trade_state["portfolio"] = None
            trade_state["portfolio_book"] = None


def normalize_legs(value):
    if not isinstance(value, list):
        return []
    return [leg for leg in value if isinstance(leg, dict)]


def validate_option_fields(
    *,
    instrument_type,
    trade_nature,
    trade_structure,
    pricing_type,
    option_type,
    option_style,
    option_strike_price,
    option_expiration_date,
):
    normalized_option_type = normalize_option_type(option_type)
    normalized_option_style = normalize_option_style(option_style)
    normalized_option_strike_price = to_decimal_or_none(option_strike_price)
    normalized_option_expiration_date = parse_optional_date(option_expiration_date)

    if instrument_type != TradeInstrumentType.OPTION.value:
        if any(
            value is not None
            for value in (
                normalized_option_type,
                normalized_option_style,
                normalized_option_strike_price,
                normalized_option_expiration_date,
            )
        ):
            raise ValueError("Option fields can only be set when instrument_type is OPTION")
        return None, None, None, None

    if trade_nature != TradeNature.FINANCIAL.value:
        raise ValueError("Options must be booked as FINANCIAL trades")
    if trade_structure != TradeStructure.SINGLE.value:
        raise ValueError("Options currently support SINGLE structure only")
    if pricing_type != PricingType.FIXED.value:
        raise ValueError("Options currently require FIXED pricing for premium capture")
    if normalized_option_type is None:
        raise ValueError("option_type is required when instrument_type is OPTION")
    if normalized_option_strike_price is None:
        raise ValueError("option_strike_price is required when instrument_type is OPTION")
    if normalized_option_expiration_date is None:
        raise ValueError("option_expiration_date is required when instrument_type is OPTION")

    return (
        normalized_option_type,
        normalized_option_style or OptionStyle.AMERICAN.value,
        normalized_option_strike_price,
        normalized_option_expiration_date,
    )


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
                    trade_structure = normalize_trade_structure(payload.get("trade_structure"))
                    instrument_type = normalize_instrument_type(payload.get("instrument_type"))
                    trade_nature_value = payload.get("trade_nature")
                    if instrument_type == TradeInstrumentType.OPTION.value and trade_nature_value in {None, ""}:
                        trade_nature_value = TradeNature.FINANCIAL.value
                    trade_nature = normalize_trade_nature(trade_nature_value)
                    workflow_defaults = default_trade_workflow_statuses(trade_nature)
                    normalized_book = normalize_book(payload.get("book"))
                    normalized_portfolio = normalize_optional_text(payload.get("portfolio"), uppercase=True)
                    execution_timestamp = normalize_execution_timestamp(payload.get("execution_timestamp"))
                    trade_date = parse_optional_date(payload.get("trade_date"))
                    if trade_date is None:
                        trade_date = (execution_timestamp or e.occurred_at or now).date()
                    effective_start_date = parse_optional_date(payload.get("effective_start_date"))
                    effective_end_date = parse_optional_date(payload.get("effective_end_date"))
                    delivery_start = parse_optional_date(payload.get("delivery_start"))
                    delivery_end = parse_optional_date(payload.get("delivery_end"))
                    validate_date_range(
                        effective_start_date,
                        effective_end_date,
                        start_field="effective_start_date",
                        end_field="effective_end_date",
                    )
                    validate_date_range(
                        delivery_start,
                        delivery_end,
                        start_field="delivery_start",
                        end_field="delivery_end",
                    )
                    pricing_type = normalize_pricing_type(payload.get("pricing_type"))
                    (
                        option_type,
                        option_style,
                        option_strike_price,
                        option_expiration_date,
                    ) = validate_option_fields(
                        instrument_type=instrument_type,
                        trade_nature=trade_nature,
                        trade_structure=trade_structure,
                        pricing_type=pricing_type,
                        option_type=payload.get("option_type"),
                        option_style=payload.get("option_style"),
                        option_strike_price=payload.get("option_strike_price"),
                        option_expiration_date=payload.get("option_expiration_date"),
                    )
                    originating_option_trade_id = validate_originating_option_trade_reference(
                        trade_state,
                        trade_id=trade_id,
                        instrument_type=instrument_type,
                        originating_option_trade_id=payload.get("originating_option_trade_id"),
                    )
                    trade_state[trade_id] = {
                        "trade_id": trade_id,
                        "originating_option_trade_id": originating_option_trade_id,
                        "external_trade_id": normalize_optional_text(payload.get("external_trade_id")),
                        "source_system": normalize_optional_text(payload.get("source_system"), uppercase=True)
                        or DEFAULT_SOURCE_SYSTEM,
                        "created_at": now,
                        "updated_at": now,
                        "execution_timestamp": execution_timestamp,
                        "trade_date": trade_date,
                        "effective_start_date": effective_start_date,
                        "effective_end_date": effective_end_date,
                        "quality_spec": normalize_optional_text(payload.get("quality_spec")),
                        "unit_of_measure": normalize_optional_text(payload.get("unit_of_measure"), uppercase=True),
                        "trade_currency_code": normalize_optional_text(
                            payload.get("trade_currency_code"),
                            uppercase=True,
                        ),
                        "location_code": normalize_optional_text(payload.get("location_code"), uppercase=True),
                        "delivery_start": delivery_start,
                        "delivery_end": delivery_end,
                        "price_unit_code": normalize_optional_text(
                            payload.get("price_unit_code"),
                            uppercase=True,
                        ),
                        "instrument_type": instrument_type,
                        "option_type": option_type,
                        "option_style": option_style,
                        "option_strike_price": option_strike_price,
                        "option_expiration_date": option_expiration_date,
                        "trade_nature": trade_nature,
                        "trade_structure": trade_structure,
                        "trade_side": (
                            None
                            if trade_structure == TradeStructure.SWAP.value
                            else normalize_trade_side(payload.get("trade_side"))
                        ),
                        "legs": normalize_legs(payload.get("legs")),
                        "book": normalized_book,
                        "portfolio": normalized_portfolio,
                        "portfolio_book": normalized_book if normalized_portfolio else None,
                        "counterparty": normalize_optional_text(payload.get("counterparty"), uppercase=True),
                        "commodity_class": normalize_commodity_class(
                            payload.get("commodity_class"),
                            payload.get("commodity"),
                        ),
                        "commodity": normalize_commodity_code(payload.get("commodity")),
                        "pricing_type": pricing_type,
                        "pricing_status": normalize_trade_header_status(
                            payload.get("pricing_status"),
                            "PENDING",
                            field_name="Pricing status",
                            valid_values={pricing_status.value for pricing_status in PricingStatus},
                        ),
                        "confirmation_status": normalize_trade_header_status(
                            payload.get("confirmation_status"),
                            workflow_defaults["confirmation_status"],
                            field_name="Confirmation status",
                            valid_values={
                                confirmation_status.value
                                for confirmation_status in ConfirmationStatus
                            },
                        ),
                        "nomination_status": normalize_trade_header_status(
                            payload.get("nomination_status"),
                            workflow_defaults["nomination_status"],
                            field_name="Nomination status",
                            valid_values={
                                nomination_status.value for nomination_status in NominationStatus
                            },
                        ),
                        "allocation_status": normalize_trade_header_status(
                            payload.get("allocation_status"),
                            workflow_defaults["allocation_status"],
                            field_name="Allocation status",
                            valid_values={
                                allocation_status.value for allocation_status in AllocationStatus
                            },
                        ),
                        "price_index_code": normalize_price_index_code(payload.get("price_index_code")),
                        "price": to_decimal_or_none(payload.get("price")),
                        "volume": to_decimal_or_none(payload.get("volume")),
                        "invoice_status": normalize_trade_header_status(
                            payload.get("invoice_status"),
                            workflow_defaults["invoice_status"],
                            field_name="Invoice status",
                            valid_values={invoice_status.value for invoice_status in InvoiceStatus},
                        ),
                        "payment_status": normalize_trade_header_status(
                            payload.get("payment_status"),
                            workflow_defaults["payment_status"],
                            field_name="Payment status",
                            valid_values={payment_status.value for payment_status in PaymentStatus},
                        ),
                        "settlement_status": normalize_trade_header_status(
                            payload.get("settlement_status"),
                            "PENDING",
                            field_name="Settlement status",
                            valid_values={settlement_status.value for settlement_status in SettlementStatus},
                        ),
                        "trader_user": normalize_optional_text(payload.get("trader_user")),
                        "status": normalize_trade_status(payload.get("status")),
                        "last_event_id": e.event_id,
                    }
                else:
                    existing["updated_at"] = now
                    if "instrument_type" in payload:
                        existing["instrument_type"] = normalize_instrument_type(payload.get("instrument_type"))
                    if "external_trade_id" in payload:
                        existing["external_trade_id"] = normalize_optional_text(payload.get("external_trade_id"))
                    if "source_system" in payload:
                        existing["source_system"] = normalize_optional_text(
                            payload.get("source_system"),
                            uppercase=True,
                        )
                    if "execution_timestamp" in payload:
                        existing["execution_timestamp"] = normalize_execution_timestamp(
                            payload.get("execution_timestamp")
                        )
                    if "trade_date" in payload:
                        existing["trade_date"] = parse_optional_date(payload.get("trade_date"))
                    if "effective_start_date" in payload:
                        existing["effective_start_date"] = parse_optional_date(
                            payload.get("effective_start_date")
                        )
                    if "effective_end_date" in payload:
                        existing["effective_end_date"] = parse_optional_date(
                            payload.get("effective_end_date")
                        )
                    if "quality_spec" in payload:
                        existing["quality_spec"] = normalize_optional_text(payload.get("quality_spec"))
                    if "unit_of_measure" in payload:
                        existing["unit_of_measure"] = normalize_optional_text(
                            payload.get("unit_of_measure"),
                            uppercase=True,
                        )
                    if "trade_currency_code" in payload:
                        existing["trade_currency_code"] = normalize_optional_text(
                            payload.get("trade_currency_code"),
                            uppercase=True,
                        )
                    if "location_code" in payload:
                        existing["location_code"] = normalize_optional_text(
                            payload.get("location_code"),
                            uppercase=True,
                        )
                    if "delivery_start" in payload:
                        existing["delivery_start"] = parse_optional_date(payload.get("delivery_start"))
                    if "delivery_end" in payload:
                        existing["delivery_end"] = parse_optional_date(payload.get("delivery_end"))
                    if "price_unit_code" in payload:
                        existing["price_unit_code"] = normalize_optional_text(
                            payload.get("price_unit_code"),
                            uppercase=True,
                        )
                    if "trade_nature" in payload:
                        existing["trade_nature"] = normalize_trade_nature(payload.get("trade_nature"))
                    if "trade_structure" in payload:
                        existing["trade_structure"] = normalize_trade_structure(
                            payload.get("trade_structure")
                        )
                    if "trade_side" in payload:
                        existing["trade_side"] = (
                            None
                            if existing["trade_structure"] == TradeStructure.SWAP.value and payload.get("trade_side") is None
                            else normalize_trade_side(payload.get("trade_side"))
                        )
                    if "legs" in payload:
                        existing["legs"] = normalize_legs(payload.get("legs"))
                    previous_book = normalize_book(existing.get("book"))
                    existing["book"] = normalize_book(payload.get("book", existing.get("book")))
                    apply_portfolio_payload(
                        existing,
                        payload,
                        book_changed=existing["book"] != previous_book,
                    )
                    if "counterparty" in payload:
                        existing["counterparty"] = normalize_optional_text(
                            payload.get("counterparty"),
                            uppercase=True,
                        )
                    if payload.get("commodity_class") is not None or payload.get("commodity") is not None:
                        existing["commodity_class"] = normalize_commodity_class(
                            payload.get("commodity_class", existing.get("commodity_class")),
                            payload.get("commodity", existing.get("commodity")),
                        )
                    if payload.get("commodity") is not None:
                        existing["commodity"] = normalize_commodity_code(payload.get("commodity"))
                    if "pricing_type" in payload:
                        existing["pricing_type"] = normalize_pricing_type(payload.get("pricing_type"))
                    if "pricing_status" in payload:
                        existing["pricing_status"] = normalize_trade_header_status(
                            payload.get("pricing_status"),
                            existing.get("pricing_status", "PENDING"),
                            field_name="Pricing status",
                            valid_values={pricing_status.value for pricing_status in PricingStatus},
                        )
                    if "confirmation_status" in payload:
                        existing["confirmation_status"] = normalize_trade_header_status(
                            payload.get("confirmation_status"),
                            existing.get("confirmation_status", ConfirmationStatus.PENDING.value),
                            field_name="Confirmation status",
                            valid_values={
                                confirmation_status.value for confirmation_status in ConfirmationStatus
                            },
                        )
                    if "nomination_status" in payload:
                        existing["nomination_status"] = normalize_trade_header_status(
                            payload.get("nomination_status"),
                            existing.get("nomination_status", NominationStatus.PENDING.value),
                            field_name="Nomination status",
                            valid_values={
                                nomination_status.value for nomination_status in NominationStatus
                            },
                        )
                    if "allocation_status" in payload:
                        existing["allocation_status"] = normalize_trade_header_status(
                            payload.get("allocation_status"),
                            existing.get("allocation_status", AllocationStatus.PENDING.value),
                            field_name="Allocation status",
                            valid_values={
                                allocation_status.value for allocation_status in AllocationStatus
                            },
                        )
                    if "price_index_code" in payload:
                        existing["price_index_code"] = normalize_price_index_code(
                            payload.get("price_index_code")
                        )
                    if "price" in payload:
                        existing["price"] = to_decimal_or_none(payload.get("price"))
                    if "volume" in payload:
                        existing["volume"] = to_decimal_or_none(payload.get("volume"))
                    if "invoice_status" in payload:
                        existing["invoice_status"] = normalize_trade_header_status(
                            payload.get("invoice_status"),
                            existing.get("invoice_status", InvoiceStatus.PENDING.value),
                            field_name="Invoice status",
                            valid_values={invoice_status.value for invoice_status in InvoiceStatus},
                        )
                    if "payment_status" in payload:
                        existing["payment_status"] = normalize_trade_header_status(
                            payload.get("payment_status"),
                            existing.get("payment_status", PaymentStatus.PENDING.value),
                            field_name="Payment status",
                            valid_values={payment_status.value for payment_status in PaymentStatus},
                        )
                    if "settlement_status" in payload:
                        existing["settlement_status"] = normalize_trade_header_status(
                            payload.get("settlement_status"),
                            existing.get("settlement_status", "PENDING"),
                            field_name="Settlement status",
                            valid_values={settlement_status.value for settlement_status in SettlementStatus},
                        )
                    if "trader_user" in payload:
                        existing["trader_user"] = normalize_optional_text(payload.get("trader_user"))
                    if payload.get("status") is not None:
                        existing["status"] = normalize_trade_status(payload.get("status"))
                    validate_date_range(
                        existing.get("effective_start_date"),
                        existing.get("effective_end_date"),
                        start_field="effective_start_date",
                        end_field="effective_end_date",
                    )
                    validate_date_range(
                        existing.get("delivery_start"),
                        existing.get("delivery_end"),
                        start_field="delivery_start",
                        end_field="delivery_end",
                    )
                    option_type_value = payload.get("option_type", existing.get("option_type"))
                    option_style_value = payload.get("option_style", existing.get("option_style"))
                    option_strike_price_value = payload.get(
                        "option_strike_price",
                        existing.get("option_strike_price"),
                    )
                    option_expiration_date_value = payload.get(
                        "option_expiration_date",
                        existing.get("option_expiration_date"),
                    )
                    if (
                        "instrument_type" in payload
                        and existing.get("instrument_type", TradeInstrumentType.LINEAR.value)
                        != TradeInstrumentType.OPTION.value
                    ):
                        option_type_value = payload.get("option_type")
                        option_style_value = payload.get("option_style")
                        option_strike_price_value = payload.get("option_strike_price")
                        option_expiration_date_value = payload.get("option_expiration_date")
                    (
                        existing["option_type"],
                        existing["option_style"],
                        existing["option_strike_price"],
                        existing["option_expiration_date"],
                    ) = validate_option_fields(
                        instrument_type=existing.get("instrument_type", TradeInstrumentType.LINEAR.value),
                        trade_nature=existing.get("trade_nature", TradeNature.PHYSICAL.value),
                        trade_structure=existing.get("trade_structure", TradeStructure.SINGLE.value),
                        pricing_type=existing.get("pricing_type", PricingType.FIXED.value),
                        option_type=option_type_value,
                        option_style=option_style_value,
                        option_strike_price=option_strike_price_value,
                        option_expiration_date=option_expiration_date_value,
                    )
                    existing["last_event_id"] = e.event_id

            elif e.event_type == "TradeAmended":
                existing = trade_state.get(trade_id)

                if existing is None:
                    print(f"Skipping TradeAmended for missing trade: {trade_id}")
                    continue

                existing["updated_at"] = now
                if "originating_option_trade_id" in payload:
                    requested_originating_trade_id = normalize_optional_text(payload.get("originating_option_trade_id"))
                    if requested_originating_trade_id != existing.get("originating_option_trade_id"):
                        raise ValueError(
                            "originating_option_trade_id is immutable and can only be set when the trade is created"
                        )
                if existing.get("originating_option_trade_id") is not None and "instrument_type" in payload:
                    requested_instrument_type = normalize_instrument_type(payload.get("instrument_type"))
                    if requested_instrument_type != TradeInstrumentType.LINEAR.value:
                        raise ValueError(
                            "Trades linked from an originating_option_trade_id must remain LINEAR instruments"
                        )
                if "instrument_type" in payload:
                    existing["instrument_type"] = normalize_instrument_type(payload.get("instrument_type"))
                if "external_trade_id" in payload:
                    existing["external_trade_id"] = normalize_optional_text(payload.get("external_trade_id"))
                if "source_system" in payload:
                    existing["source_system"] = normalize_optional_text(
                        payload.get("source_system"),
                        uppercase=True,
                    )
                if "execution_timestamp" in payload:
                    existing["execution_timestamp"] = normalize_execution_timestamp(
                        payload.get("execution_timestamp")
                    )
                if "trade_date" in payload:
                    existing["trade_date"] = parse_optional_date(payload.get("trade_date"))
                if "effective_start_date" in payload:
                    existing["effective_start_date"] = parse_optional_date(
                        payload.get("effective_start_date")
                    )
                if "effective_end_date" in payload:
                    existing["effective_end_date"] = parse_optional_date(
                        payload.get("effective_end_date")
                    )
                if "quality_spec" in payload:
                    existing["quality_spec"] = normalize_optional_text(payload.get("quality_spec"))
                if "unit_of_measure" in payload:
                    existing["unit_of_measure"] = normalize_optional_text(
                        payload.get("unit_of_measure"),
                        uppercase=True,
                    )
                if "trade_currency_code" in payload:
                    existing["trade_currency_code"] = normalize_optional_text(
                        payload.get("trade_currency_code"),
                        uppercase=True,
                    )
                if "location_code" in payload:
                    existing["location_code"] = normalize_optional_text(
                        payload.get("location_code"),
                        uppercase=True,
                    )
                if "delivery_start" in payload:
                    existing["delivery_start"] = parse_optional_date(payload.get("delivery_start"))
                if "delivery_end" in payload:
                    existing["delivery_end"] = parse_optional_date(payload.get("delivery_end"))
                if "price_unit_code" in payload:
                    existing["price_unit_code"] = normalize_optional_text(
                        payload.get("price_unit_code"),
                        uppercase=True,
                    )
                if "trade_nature" in payload:
                    existing["trade_nature"] = normalize_trade_nature(payload.get("trade_nature"))
                if "trade_structure" in payload:
                    existing["trade_structure"] = normalize_trade_structure(payload.get("trade_structure"))
                if "trade_side" in payload:
                    existing["trade_side"] = (
                        None
                        if existing["trade_structure"] == TradeStructure.SWAP.value and payload.get("trade_side") is None
                        else normalize_trade_side(payload.get("trade_side"))
                    )
                if "legs" in payload:
                    existing["legs"] = normalize_legs(payload.get("legs"))
                previous_book = normalize_book(existing.get("book"))
                if "book" in payload:
                    existing["book"] = normalize_book(payload.get("book"))
                else:
                    existing["book"] = normalize_book(existing.get("book"))
                apply_portfolio_payload(
                    existing,
                    payload,
                    book_changed=existing["book"] != previous_book,
                )
                if "counterparty" in payload:
                    existing["counterparty"] = normalize_optional_text(
                        payload.get("counterparty"),
                        uppercase=True,
                    )
                if "commodity_class" in payload or "commodity" in payload:
                    existing["commodity_class"] = normalize_commodity_class(
                        payload.get("commodity_class", existing.get("commodity_class")),
                        payload.get("commodity", existing.get("commodity")),
                    )
                if payload.get("commodity") is not None:
                    existing["commodity"] = normalize_commodity_code(payload.get("commodity"))
                if "pricing_type" in payload:
                    existing["pricing_type"] = normalize_pricing_type(payload.get("pricing_type"))
                if "pricing_status" in payload:
                    existing["pricing_status"] = normalize_trade_header_status(
                        payload.get("pricing_status"),
                        existing.get("pricing_status", "PENDING"),
                        field_name="Pricing status",
                        valid_values={pricing_status.value for pricing_status in PricingStatus},
                    )
                if "confirmation_status" in payload:
                    existing["confirmation_status"] = normalize_trade_header_status(
                        payload.get("confirmation_status"),
                        existing.get("confirmation_status", ConfirmationStatus.PENDING.value),
                        field_name="Confirmation status",
                        valid_values={
                            confirmation_status.value for confirmation_status in ConfirmationStatus
                        },
                    )
                if "nomination_status" in payload:
                    existing["nomination_status"] = normalize_trade_header_status(
                        payload.get("nomination_status"),
                        existing.get("nomination_status", NominationStatus.PENDING.value),
                        field_name="Nomination status",
                        valid_values={nomination_status.value for nomination_status in NominationStatus},
                    )
                if "allocation_status" in payload:
                    existing["allocation_status"] = normalize_trade_header_status(
                        payload.get("allocation_status"),
                        existing.get("allocation_status", AllocationStatus.PENDING.value),
                        field_name="Allocation status",
                        valid_values={allocation_status.value for allocation_status in AllocationStatus},
                    )
                if "price_index_code" in payload:
                    existing["price_index_code"] = normalize_price_index_code(
                        payload.get("price_index_code")
                    )
                if "price" in payload:
                    existing["price"] = to_decimal_or_none(payload.get("price"))
                if "volume" in payload:
                    existing["volume"] = to_decimal_or_none(payload.get("volume"))
                if "invoice_status" in payload:
                    existing["invoice_status"] = normalize_trade_header_status(
                        payload.get("invoice_status"),
                        existing.get("invoice_status", InvoiceStatus.PENDING.value),
                        field_name="Invoice status",
                        valid_values={invoice_status.value for invoice_status in InvoiceStatus},
                    )
                if "payment_status" in payload:
                    existing["payment_status"] = normalize_trade_header_status(
                        payload.get("payment_status"),
                        existing.get("payment_status", PaymentStatus.PENDING.value),
                        field_name="Payment status",
                        valid_values={payment_status.value for payment_status in PaymentStatus},
                    )
                if "settlement_status" in payload:
                    existing["settlement_status"] = normalize_trade_header_status(
                        payload.get("settlement_status"),
                        existing.get("settlement_status", "PENDING"),
                        field_name="Settlement status",
                        valid_values={settlement_status.value for settlement_status in SettlementStatus},
                    )
                if "trader_user" in payload:
                    existing["trader_user"] = normalize_optional_text(payload.get("trader_user"))
                if payload.get("status") is not None:
                    existing["status"] = normalize_trade_status(payload.get("status"))
                validate_date_range(
                    existing.get("effective_start_date"),
                    existing.get("effective_end_date"),
                    start_field="effective_start_date",
                    end_field="effective_end_date",
                )
                validate_date_range(
                    existing.get("delivery_start"),
                    existing.get("delivery_end"),
                    start_field="delivery_start",
                    end_field="delivery_end",
                )
                option_type_value = payload.get("option_type", existing.get("option_type"))
                option_style_value = payload.get("option_style", existing.get("option_style"))
                option_strike_price_value = payload.get(
                    "option_strike_price",
                    existing.get("option_strike_price"),
                )
                option_expiration_date_value = payload.get(
                    "option_expiration_date",
                    existing.get("option_expiration_date"),
                )
                if (
                    "instrument_type" in payload
                    and existing.get("instrument_type", TradeInstrumentType.LINEAR.value)
                    != TradeInstrumentType.OPTION.value
                ):
                    option_type_value = payload.get("option_type")
                    option_style_value = payload.get("option_style")
                    option_strike_price_value = payload.get("option_strike_price")
                    option_expiration_date_value = payload.get("option_expiration_date")
                (
                    existing["option_type"],
                    existing["option_style"],
                    existing["option_strike_price"],
                    existing["option_expiration_date"],
                ) = validate_option_fields(
                    instrument_type=existing.get("instrument_type", TradeInstrumentType.LINEAR.value),
                    trade_nature=existing.get("trade_nature", TradeNature.PHYSICAL.value),
                    trade_structure=existing.get("trade_structure", TradeStructure.SINGLE.value),
                    pricing_type=existing.get("pricing_type", PricingType.FIXED.value),
                    option_type=option_type_value,
                    option_style=option_style_value,
                    option_strike_price=option_strike_price_value,
                    option_expiration_date=option_expiration_date_value,
                )
                existing["last_event_id"] = e.event_id

            elif e.event_type == "TradeCancelled":
                existing = trade_state.get(trade_id)

                if existing is None:
                    print(f"Skipping TradeCancelled for missing trade: {trade_id}")
                    continue

                existing["updated_at"] = now
                existing["book"] = normalize_book(existing.get("book"))
                existing["status"] = TradeStatus.CANCELLED.value
                existing["last_event_id"] = e.event_id

            elif e.event_type in OPTION_LIFECYCLE_EVENT_TO_STATUS:
                existing = trade_state.get(trade_id)

                if existing is None:
                    print(f"Skipping {e.event_type} for missing trade: {trade_id}")
                    continue

                if existing.get("instrument_type", TradeInstrumentType.LINEAR.value) != TradeInstrumentType.OPTION.value:
                    print(f"Skipping {e.event_type} for non-option trade: {trade_id}")
                    continue

                existing["updated_at"] = now
                existing["status"] = OPTION_LIFECYCLE_EVENT_TO_STATUS[e.event_type]
                existing["last_event_id"] = e.event_id

        print(f"Writing {len(trade_state)} trades to projection...")
        for trade in trade_state.values():
            db.add(
                Trade(
                    trade_id=trade["trade_id"],
                    originating_option_trade_id=trade.get("originating_option_trade_id"),
                    external_trade_id=trade.get("external_trade_id"),
                    source_system=trade.get("source_system"),
                    created_at=trade["created_at"],
                    updated_at=trade["updated_at"],
                    execution_timestamp=trade.get("execution_timestamp"),
                    trade_date=trade.get("trade_date"),
                    effective_start_date=trade.get("effective_start_date"),
                    effective_end_date=trade.get("effective_end_date"),
                    quality_spec=trade.get("quality_spec"),
                    unit_of_measure=trade.get("unit_of_measure"),
                    trade_currency_code=trade.get("trade_currency_code"),
                    location_code=trade.get("location_code"),
                    delivery_start=trade.get("delivery_start"),
                    delivery_end=trade.get("delivery_end"),
                    price_unit_code=trade.get("price_unit_code"),
                    instrument_type=trade.get("instrument_type", TradeInstrumentType.LINEAR.value),
                    option_type=trade.get("option_type"),
                    option_style=trade.get("option_style"),
                    option_strike_price=trade.get("option_strike_price"),
                    option_expiration_date=trade.get("option_expiration_date"),
                    trade_nature=trade.get("trade_nature", TradeNature.PHYSICAL.value),
                    trade_structure=trade.get("trade_structure", TradeStructure.SINGLE.value),
                    trade_side=(
                        trade.get("trade_side")
                        if trade.get("trade_structure", TradeStructure.SINGLE.value) == TradeStructure.SWAP.value
                        else trade.get("trade_side", TradeSide.BUY.value)
                    ),
                    book=normalize_book(trade.get("book")),
                    portfolio=trade.get("portfolio"),
                    counterparty=trade.get("counterparty"),
                    commodity_class=trade["commodity_class"],
                    commodity=trade["commodity"],
                    pricing_type=trade.get("pricing_type", PricingType.FIXED.value),
                    pricing_status=trade.get("pricing_status", "PENDING"),
                    confirmation_status=trade.get(
                        "confirmation_status",
                        ConfirmationStatus.PENDING.value,
                    ),
                    nomination_status=trade.get(
                        "nomination_status",
                        NominationStatus.PENDING.value,
                    ),
                    allocation_status=trade.get(
                        "allocation_status",
                        AllocationStatus.PENDING.value,
                    ),
                    price_index_code=trade.get("price_index_code"),
                    price=trade["price"],
                    volume=trade["volume"],
                    invoice_status=trade.get("invoice_status", InvoiceStatus.PENDING.value),
                    payment_status=trade.get("payment_status", PaymentStatus.PENDING.value),
                    settlement_status=trade.get("settlement_status", "PENDING"),
                    trader_user=trade.get("trader_user"),
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
                        location_code=trade.get("location_code"),
                        quantity=trade["volume"],
                        quantity_unit_code=trade.get("unit_of_measure"),
                        delivery_start=trade.get("delivery_start"),
                        delivery_end=trade.get("delivery_end"),
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
                            location_code=normalize_optional_text(
                                leg.get("location_code"),
                                uppercase=True,
                            )
                            or trade.get("location_code"),
                            quantity=to_decimal_or_none(leg.get("volume", trade["volume"])),
                            quantity_unit_code=normalize_optional_text(
                                leg.get("quantity_unit_code"),
                                uppercase=True,
                            )
                            or trade.get("unit_of_measure"),
                            delivery_start=parse_optional_date(leg.get("delivery_start"))
                            or trade.get("delivery_start"),
                            delivery_end=parse_optional_date(leg.get("delivery_end"))
                            or trade.get("delivery_end"),
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
                    currency_code=trade.get("trade_currency_code"),
                    price_unit_code=trade.get("price_unit_code"),
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
