from __future__ import annotations

import math
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.actualizations import trade_has_actualization_record
from apps.api.app.domains.operations.services.settlement_invoices import trade_has_invoice_record
from apps.api.app.domains.operations.services.settlement_payments import trade_has_payment_records
from apps.api.app.domains.operations.services.trade_confirmations import trade_has_confirmation_record
from apps.api.app.domains.operations.services.trade_credit_exceptions import (
    assess_trade_credit_exception,
)
from apps.api.app.domains.operations.services.trade_credit_exceptions import (
    get_active_trade_credit_exception,
)
from apps.api.app.domains.operations.services.trade_credit_exceptions import (
    invalidate_active_trade_credit_exceptions,
)
from apps.api.app.domains.operations.services.trade_credit_hold import (
    CREDIT_HOLD_GATED_TRADE_FIELDS,
)
from apps.api.app.domains.operations.services.workflow_items import create_trade_workflow_item
from apps.api.app.domains.reference_data.services.counterparty_standards import (
    counterparty_credit_status_allows_trading,
)
from apps.api.app.domains.reference_data.services.counterparty_standards import (
    normalize_counterparty_credit_status,
)
from apps.api.app.domains.risk.services.option_exposures import sync_option_exposures_for_trade_change
from apps.api.app.domains.trading.services.trade_unit_defaults import (
    default_price_unit_code,
    default_quantity_unit_code,
)
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.shared.enums import (
    ActualizationStatus,
    AllocationStatus,
    ConfirmationStatus,
    CreditApprovalStatus,
    InvoiceStatus,
    NominationStatus,
    OptionStyle,
    OptionType,
    PaymentStatus,
    PricingType,
    SettlementStatus,
    TradeInstrumentType,
    TradeNature,
    TradeSide,
    TradeStatus,
    TradeStructure,
    TradeWorkflowType,
)

ZERO = Decimal("0")
DEFAULT_SOURCE_SYSTEM = "ETRM"
OPTION_LIFECYCLE_EVENT_TO_STATUS = {
    "OptionExercised": TradeStatus.EXERCISED.value,
    "OptionExpired": TradeStatus.EXPIRED.value,
    "OptionAssigned": TradeStatus.ASSIGNED.value,
}
OPTION_LIFECYCLE_EVENT_TYPES = set(OPTION_LIFECYCLE_EVENT_TO_STATUS)
CREDIT_HOLD_FIELD_LABELS = {
    "confirmation_status": "confirmation",
    "nomination_status": "nomination",
    "allocation_status": "allocation",
    "actualization_status": "actualization",
    "invoice_status": "invoice",
    "payment_status": "payment",
    "settlement_status": "settlement",
}


def normalize_trade_status(
    value: object | None,
    *,
    default: str = TradeStatus.ACTIVE.value,
) -> str:
    normalized = str(value or default).strip().upper()
    valid_values = {trade_status.value for trade_status in TradeStatus}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade status '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def trade_status_is_active(value: object | None) -> bool:
    return normalize_trade_status(value) == TradeStatus.ACTIVE.value


def trade_snapshot(db: Session, trade: Trade | None) -> dict[str, object] | None:
    if trade is None:
        return None

    db.flush()
    legs = db.execute(
        select(TradeLeg)
        .where(TradeLeg.trade_id == trade.trade_id)
        .order_by(TradeLeg.leg_no.asc())
    ).scalars().all()

    return {
        "trade_id": trade.trade_id,
        "instrument_type": trade.instrument_type,
        "book": trade.book,
        "portfolio": trade.portfolio,
        "counterparty": trade.counterparty,
        "commodity_class": trade.commodity_class,
        "commodity": trade.commodity,
        "trade_structure": trade.trade_structure,
        "trade_side": trade.trade_side,
        "trade_currency_code": trade.trade_currency_code,
        "price_unit_code": trade.price_unit_code,
        "price": Decimal(str(trade.price or 0)) if trade.price is not None else None,
        "volume": Decimal(str(trade.volume or 0)),
        "option_type": trade.option_type,
        "option_style": trade.option_style,
        "option_strike_price": Decimal(str(trade.option_strike_price))
        if trade.option_strike_price is not None
        else None,
        "option_expiration_date": trade.option_expiration_date,
        "status": trade.status,
        "updated_at": trade.updated_at,
        "legs": [
            {
                "commodity": leg.commodity_code,
                "side": leg.side,
                "volume": Decimal(str(leg.quantity or 0)),
            }
            for leg in legs
        ],
    }


def signed_volume(side: object | None, quantity: object | None) -> Decimal:
    volume = Decimal(str(quantity or 0))
    normalized_side = str(side or TradeSide.BUY.value).strip().upper()
    if normalized_side == TradeSide.SELL.value:
        return volume * Decimal("-1")
    return volume


def active_volume_by_commodity(trade: dict[str, object] | None) -> dict[str, Decimal]:
    instrument_type = (
        str(trade.get("instrument_type") or TradeInstrumentType.LINEAR.value).strip().upper()
        if trade is not None
        else None
    )
    if (
        trade is None
        or not trade_status_is_active(trade.get("status"))
        or instrument_type == TradeInstrumentType.OPTION.value
    ):
        return {}

    if trade.get("trade_structure") == TradeStructure.SWAP.value:
        totals: dict[str, Decimal] = {}
        for leg in trade.get("legs", []):
            if not isinstance(leg, dict):
                continue
            commodity = str(leg.get("commodity") or "UNKNOWN")
            totals[commodity] = totals.get(commodity, ZERO) + signed_volume(
                leg.get("side"),
                leg.get("volume"),
            )
        return {
            commodity: quantity
            for commodity, quantity in totals.items()
            if quantity != ZERO
        }

    commodity = str(trade.get("commodity") or "UNKNOWN")
    volume = signed_volume(trade.get("trade_side"), trade.get("volume"))
    if volume == ZERO:
        return {}
    return {commodity: volume}


def apply_position_delta(db: Session, commodity: str, delta: Decimal, updated_at: datetime) -> None:
    if delta == ZERO:
        return

    existing = db.execute(
        select(Position).where(Position.commodity == commodity)
    ).scalars().first()

    if existing is None:
        if delta != ZERO:
            db.add(Position(commodity=commodity, net_volume=delta, updated_at=updated_at))
        return

    next_volume = Decimal(str(existing.net_volume)) + delta
    if next_volume == ZERO:
        db.delete(existing)
        return

    existing.net_volume = next_volume
    existing.updated_at = updated_at


def sync_positions_for_trade_change(
    db: Session,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
    updated_at: datetime,
) -> None:
    before_contrib = active_volume_by_commodity(before)
    after_contrib = active_volume_by_commodity(after)
    commodities = set(before_contrib) | set(after_contrib)

    for commodity in commodities:
        delta = after_contrib.get(commodity, ZERO) - before_contrib.get(commodity, ZERO)
        apply_position_delta(db, commodity, delta, updated_at)


def normalize_commodity_code(value: object | None) -> str:
    return str(value or "").strip().upper()


def normalize_trade_nature(value: object | None) -> str:
    normalized = str(value or TradeNature.PHYSICAL.value).strip().upper()
    valid_values = {trade_nature.value for trade_nature in TradeNature}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade nature '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_instrument_type(value: object | None) -> str:
    normalized = str(value or TradeInstrumentType.LINEAR.value).strip().upper()
    valid_values = {instrument_type.value for instrument_type in TradeInstrumentType}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Instrument type '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_trade_structure(value: object | None) -> str:
    normalized = str(value or TradeStructure.SINGLE.value).strip().upper()
    valid_values = {trade_structure.value for trade_structure in TradeStructure}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade structure '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_trade_side(value: object | None) -> str:
    normalized = str(value or TradeSide.BUY.value).strip().upper()
    valid_values = {trade_side.value for trade_side in TradeSide}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade side '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_option_type(value: object | None) -> str | None:
    normalized = normalize_optional_text(value, uppercase=True)
    if normalized is None:
        return None
    valid_values = {option_type.value for option_type in OptionType}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Option type '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_option_style(value: object | None) -> str | None:
    normalized = normalize_optional_text(value, uppercase=True)
    if normalized is None:
        return None
    valid_values = {option_style.value for option_style in OptionStyle}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Option style '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_pricing_type(value: object | None) -> str:
    normalized = str(value or PricingType.FIXED.value).strip().upper()
    valid_values = {pricing_type.value for pricing_type in PricingType}
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Pricing type '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def normalize_price_index_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def normalize_optional_text(value: object | None, *, uppercase: bool = False) -> str | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None
    return normalized.upper() if uppercase else normalized


def normalize_trade_header_status(
    value: object | None,
    *,
    default: str,
    field_name: str,
    valid_values: set[str],
) -> str:
    normalized = str(value or default).strip().upper()
    if not normalized:
        return default
    if normalized not in valid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{field_name} '{normalized}' is invalid. Expected one of: "
                f"{', '.join(sorted(valid_values))}"
            ),
        )
    return normalized


def parse_execution_timestamp(value: object | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="execution_timestamp must be a valid ISO-8601 datetime",
            ) from exc
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="execution_timestamp must be a datetime or ISO-8601 string",
    )


def parse_optional_date(value: object | None, *, field_name: str) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        coerced = value if value.tzinfo is None else value.astimezone(timezone.utc)
        return coerced.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            if "T" in candidate:
                return datetime.fromisoformat(candidate.replace("Z", "+00:00")).date()
            return date.fromisoformat(candidate)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} must be a valid ISO-8601 date",
            ) from exc
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"{field_name} must be a date or ISO-8601 string",
    )


def normalize_optional_number(value: object | None, *, field_name: str) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be a numeric value",
        )
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} must be a finite numeric value",
            )
        return float(value)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        try:
            return float(Decimal(candidate))
        except Exception as exc:  # pragma: no cover - Decimal uses multiple exception types
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} must be a numeric value",
            ) from exc

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"{field_name} must be a numeric value",
    )


def validate_date_range(
    start_value: date | None,
    end_value: date | None,
    *,
    start_field: str,
    end_field: str,
) -> None:
    if start_value is not None and end_value is not None and end_value < start_value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{end_field} must be on or after {start_field}",
        )


def default_trade_workflow_statuses(trade_nature: str) -> dict[str, str]:
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
        "actualization_status": (
            ActualizationStatus.PENDING.value
            if requires_physical_workflows
            else ActualizationStatus.NOT_REQUIRED.value
        ),
        "invoice_status": (
            InvoiceStatus.PENDING.value
            if requires_physical_workflows
            else InvoiceStatus.NOT_REQUIRED.value
        ),
        "payment_status": PaymentStatus.PENDING.value,
    }


def validate_trade_measurements(
    *,
    trade_structure: str,
    pricing_type: str,
    price: float | None,
    volume: float | None,
) -> None:
    if pricing_type in {PricingType.FIXED.value, PricingType.HYBRID.value} and price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Price Differential is required when pricing type is FIXED or HYBRID",
        )
    if trade_structure == TradeStructure.SINGLE.value and volume is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Volume is required for SINGLE trades",
        )


def validate_option_fields(
    *,
    instrument_type: str,
    trade_nature: str,
    trade_structure: str,
    pricing_type: str,
    option_type: object | None,
    option_style: object | None,
    option_strike_price: object | None,
    option_expiration_date: object | None,
) -> tuple[str | None, str | None, float | None, date | None]:
    normalized_option_type = normalize_option_type(option_type)
    normalized_option_style = normalize_option_style(option_style)
    normalized_option_strike_price = normalize_optional_number(
        option_strike_price,
        field_name="Option strike price",
    )
    normalized_option_expiration_date = parse_optional_date(
        option_expiration_date,
        field_name="option_expiration_date",
    )

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
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Option fields can only be set when instrument_type is OPTION",
            )
        return None, None, None, None

    if trade_nature != TradeNature.FINANCIAL.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Options must be booked as FINANCIAL trades",
        )
    if trade_structure != TradeStructure.SINGLE.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Options currently support SINGLE structure only",
        )
    if pricing_type != PricingType.FIXED.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Options currently require FIXED pricing for premium capture",
        )
    if normalized_option_type is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_type is required when instrument_type is OPTION",
        )
    if normalized_option_strike_price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_strike_price is required when instrument_type is OPTION",
        )
    if normalized_option_expiration_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="option_expiration_date is required when instrument_type is OPTION",
        )

    return (
        normalized_option_type,
        normalized_option_style or OptionStyle.AMERICAN.value,
        normalized_option_strike_price,
        normalized_option_expiration_date,
    )


def validate_option_lifecycle_transition(
    trade: Trade,
    *,
    event_type: str,
    occurred_at: datetime,
) -> str:
    if normalize_instrument_type(trade.instrument_type) != TradeInstrumentType.OPTION.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{event_type} can only be recorded for OPTION trades",
        )

    current_status = normalize_trade_status(trade.status)
    if current_status != TradeStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Trade {trade.trade_id} is already closed as {current_status} and cannot record "
                f"{event_type}"
            ),
        )

    if trade.option_expiration_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Trade {trade.trade_id} is missing option_expiration_date",
        )

    effective_event_date = occurred_at.date()
    expiration_date = trade.option_expiration_date
    option_style = normalize_option_style(trade.option_style) or OptionStyle.AMERICAN.value
    trade_side = normalize_trade_side(trade.trade_side)

    if event_type == "OptionExpired":
        if effective_event_date < expiration_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"OptionExpired cannot be recorded before expiration date "
                    f"{expiration_date.isoformat()}"
                ),
            )
        return OPTION_LIFECYCLE_EVENT_TO_STATUS[event_type]

    if event_type == "OptionExercised" and trade_side != TradeSide.BUY.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only BUY option trades can be exercised. Use OptionAssigned for short options.",
        )
    if event_type == "OptionAssigned" and trade_side != TradeSide.SELL.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only SELL option trades can be assigned. Use OptionExercised for long options.",
        )

    if option_style == OptionStyle.EUROPEAN.value:
        if effective_event_date != expiration_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{event_type} can only be recorded on expiration date "
                    f"{expiration_date.isoformat()} for EUROPEAN options"
                ),
            )
    elif effective_event_date > expiration_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{event_type} must be recorded on or before expiration date "
                f"{expiration_date.isoformat()} for {option_style} options"
            ),
        )

    return OPTION_LIFECYCLE_EVENT_TO_STATUS[event_type]


def validate_originating_option_trade_reference(
    db: Session,
    *,
    trade_id: str,
    instrument_type: str,
    originating_option_trade_id: object | None,
) -> str | None:
    normalized_originating_trade_id = normalize_optional_text(originating_option_trade_id)
    if normalized_originating_trade_id is None:
        return None

    if normalize_instrument_type(instrument_type) != TradeInstrumentType.LINEAR.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="originating_option_trade_id can only be set on LINEAR trades",
        )
    if normalized_originating_trade_id == trade_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="originating_option_trade_id cannot reference the trade being created",
        )

    originating_trade = db.execute(
        select(Trade).where(Trade.trade_id == normalized_originating_trade_id)
    ).scalars().first()
    if originating_trade is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"originating_option_trade_id '{normalized_originating_trade_id}' "
                "does not reference an existing trade"
            ),
        )
    if normalize_instrument_type(originating_trade.instrument_type) != TradeInstrumentType.OPTION.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="originating_option_trade_id must reference an OPTION trade",
        )
    if normalize_trade_status(originating_trade.status) not in {
        TradeStatus.EXERCISED.value,
        TradeStatus.ASSIGNED.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"originating_option_trade_id '{normalized_originating_trade_id}' must reference an "
                "EXERCISED or ASSIGNED option trade"
            ),
        )

    existing_child_trade = db.execute(
        select(Trade).where(
            Trade.originating_option_trade_id == normalized_originating_trade_id,
            Trade.trade_id != trade_id,
        )
    ).scalars().first()
    if existing_child_trade is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Option trade '{normalized_originating_trade_id}' already has a resulting trade "
                f"'{existing_child_trade.trade_id}'"
            ),
        )

    return normalized_originating_trade_id


def reject_invoice_projection_override(
    db: Session,
    *,
    trade_id: str,
    payload_data: dict[str, object],
) -> None:
    payload_fields = set(payload_data)

    if {"invoice_status", "settlement_status"} & payload_fields and trade_has_invoice_record(
        db,
        trade_id=trade_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Invoice and settlement statuses are now derived from settlement invoices for this trade. "
                "Update the invoice record from the Settlement workspace instead of amending the trade header."
            ),
        )

    if "payment_status" in payload_fields and trade_has_payment_records(db, trade_id=trade_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Payment status is now derived from settlement payments for this trade. "
                "Update the payment record from the Settlement workspace instead of amending the trade header."
            ),
        )


def reject_confirmation_projection_override(
    db: Session,
    *,
    trade_id: str,
    payload_data: dict[str, object],
) -> None:
    if "confirmation_status" not in payload_data:
        return
    if not trade_has_confirmation_record(db, trade_id=trade_id):
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            "Confirmation status is now derived from managed confirmation records for this trade. "
            "Update the current confirmation from Operations instead of amending the trade header."
        ),
    )


def reject_actualization_projection_override(
    db: Session,
    *,
    trade_id: str,
    payload_data: dict[str, object],
) -> None:
    if "actualization_status" not in payload_data:
        return
    if not trade_has_actualization_record(db, trade_id=trade_id):
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            "Actualization status is now derived from recorded delivery actualizations for this trade. "
            "Update the shipment actualization instead of amending the trade header."
        ),
    )


def require_active_book(db: Session, book_code: object | None) -> str:
    normalized_book_code = str(book_code or "").strip().upper()
    if not normalized_book_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Book is required and must be selected from reference data",
        )

    reference_book = db.execute(
        select(ReferenceBook).where(
            ReferenceBook.code == normalized_book_code,
            ReferenceBook.is_active.is_(True),
        )
    ).scalars().first()
    if reference_book is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Book '{normalized_book_code}' is not active in reference data",
        )

    return normalized_book_code


def require_active_commodity(
    db: Session,
    commodity_class: object | None,
    commodity_code: object | None,
) -> tuple[str, str]:
    normalized_class = normalize_commodity_code(commodity_class)
    normalized_code = normalize_commodity_code(commodity_code)
    if not normalized_class:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Commodity class is required and must be selected from reference data",
        )
    if not normalized_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Commodity is required and must be selected from reference data",
        )

    reference_commodity = db.execute(
        select(ReferenceCommodity).where(
            ReferenceCommodity.commodity_class == normalized_class,
            ReferenceCommodity.code == normalized_code,
            ReferenceCommodity.is_active.is_(True),
        )
    ).scalars().first()
    if reference_commodity is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Commodity '{normalized_code}' is not active in commodity class "
                f"'{normalized_class}'"
            ),
        )

    return normalized_class, normalized_code


def require_active_counterparty(db: Session, counterparty_code: object | None) -> str | None:
    normalized_counterparty_code = normalize_optional_text(counterparty_code, uppercase=True)
    if normalized_counterparty_code is None:
        return None

    reference_counterparty = db.execute(
        select(ReferenceCounterparty).where(
            ReferenceCounterparty.code == normalized_counterparty_code,
            ReferenceCounterparty.is_active.is_(True),
        )
    ).scalars().first()
    if reference_counterparty is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Counterparty '{normalized_counterparty_code}' is not active in reference data",
        )
    if not counterparty_credit_status_allows_trading(reference_counterparty.credit_status):
        normalized_credit_status = normalize_counterparty_credit_status(
            reference_counterparty.credit_status
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Counterparty '{normalized_counterparty_code}' is not tradable because "
                f"credit status is '{normalized_credit_status}'. Set it to APPROVED before "
                f"booking or amending trades."
            ),
        )

    return normalized_counterparty_code


def _format_counterparty_credit_limit_message(policy_result: dict[str, object]) -> str:
    counterparty_code = str(policy_result["counterparty_code"])
    limit_currency_code = str(policy_result["limit_currency_code"])
    projected_exposure_amount = float(policy_result["projected_exposure_amount"])
    limit_amount = float(policy_result["limit_amount"])
    projected_utilization_percent = float(policy_result["projected_utilization_percent"])
    breach_action = str(policy_result["breach_action"])
    return (
        f"Counterparty '{counterparty_code}' would exceed its approved credit limit: projected exposure "
        f"{limit_currency_code} {projected_exposure_amount:,.2f} versus limit "
        f"{limit_currency_code} {limit_amount:,.2f} ({projected_utilization_percent:.1f}% utilization). "
        f"Breach action is '{breach_action}'."
    )


def _requested_credit_hold_blocked_fields(
    trade: Trade,
    payload_data: dict[str, object],
) -> list[str]:
    blocked_fields: list[str] = []
    for field_name in CREDIT_HOLD_GATED_TRADE_FIELDS:
        if field_name not in payload_data:
            continue
        next_value = payload_data.get(field_name)
        if next_value is None:
            continue
        normalized_next_value = str(next_value).strip().upper()
        current_value = str(getattr(trade, field_name) or "").strip().upper()
        if normalized_next_value and normalized_next_value != current_value:
            blocked_fields.append(CREDIT_HOLD_FIELD_LABELS[field_name])
    return blocked_fields


def _format_credit_exception_revalidation_message(
    *,
    revalidation_reason: str | None,
    approved_exception,
    current_projected_exposure_amount: float | None,
    remaining_headroom_amount: float | None,
) -> str:
    normalized_reason = str(revalidation_reason or "").strip().upper()
    if normalized_reason == "EXCEPTION_EXPIRED":
        expires_at = (
            approved_exception.expires_at.date().isoformat()
            if approved_exception.expires_at is not None
            else "the configured expiry date"
        )
        return f"The approved credit exception expired on {expires_at} and must be refreshed."
    if normalized_reason == "EXCEEDS_APPROVED_EXCEPTION":
        currency_code = approved_exception.limit_currency_code
        approved_projected_exposure = float(approved_exception.approved_projected_exposure_amount)
        if current_projected_exposure_amount is not None:
            overrun = current_projected_exposure_amount - approved_projected_exposure
            return (
                "The amended trade now exceeds the previously approved credit exception envelope: "
                f"projected exposure {currency_code} {current_projected_exposure_amount:,.2f} versus approved "
                f"exception ceiling {currency_code} {approved_projected_exposure:,.2f} "
                f"({currency_code} {overrun:,.2f} above the approved envelope)."
            )
        return "The amended trade now exceeds the previously approved credit exception envelope."
    if normalized_reason == "LIMIT_CURRENCY_CHANGED":
        return (
            "The current credit policy comparison basis changed, so the previous approved "
            "exception can no longer be relied on."
        )
    if normalized_reason in {
        "NO_POLICY_CONTEXT",
        "NOT_COMPARABLE",
        "CURRENCY_MISMATCH",
        "MISSING_TRADE_MEASUREMENTS",
    }:
        return (
            "The amended trade can no longer be compared reliably to the approved credit "
            "exception envelope and must be re-reviewed."
        )
    if remaining_headroom_amount is not None and remaining_headroom_amount < 0:
        currency_code = approved_exception.limit_currency_code
        return (
            f"The amended trade is {currency_code} {abs(remaining_headroom_amount):,.2f} "
            "outside the approved exception envelope."
        )
    return (
        "The amended trade must be re-reviewed against credit because the prior exception "
        "no longer covers the new projected exposure."
    )


def _sync_credit_approval_workflow_item(
    db: Session,
    *,
    trade: Trade,
    actor_id: str,
    now: datetime,
    policy_result: dict[str, object] | None,
) -> None:
    existing_item = db.execute(
        select(TradeWorkflowItem).where(
            TradeWorkflowItem.trade_id == trade.trade_id,
            TradeWorkflowItem.workflow_type == TradeWorkflowType.CREDIT_APPROVAL.value,
        )
    ).scalars().first()

    requires_approval = bool(
        policy_result is not None
        and policy_result.get("limit_breached")
        and policy_result.get("breach_action") == "REQUIRE_APPROVAL"
    )
    if requires_approval:
        if existing_item is not None and existing_item.status == CreditApprovalStatus.APPROVED.value:
            active_exception = get_active_trade_credit_exception(db, trade_id=trade.trade_id)
            if active_exception is not None:
                exception_assessment = assess_trade_credit_exception(
                    exception=active_exception,
                    trade=trade,
                    db=db,
                    now=now,
                    policy_result=policy_result,
                )
                if not exception_assessment.revalidation_required:
                    return
                revalidation_message = _format_credit_exception_revalidation_message(
                    revalidation_reason=exception_assessment.revalidation_reason,
                    approved_exception=active_exception,
                    current_projected_exposure_amount=exception_assessment.current_projected_exposure_amount,
                    remaining_headroom_amount=exception_assessment.remaining_headroom_amount,
                )
                invalidate_active_trade_credit_exceptions(
                    db,
                    trade_id=trade.trade_id,
                    released_at=now,
                    released_by=actor_id,
                    released_reason=revalidation_message,
                    status=CreditApprovalStatus.PENDING_REVIEW.value,
                )
            else:
                revalidation_message = (
                    "The prior credit approval has no active exception envelope on file, so the amended trade must be re-reviewed."
                )

            notes = (
                f"{_format_counterparty_credit_limit_message(policy_result)} "
                f"{revalidation_message} Trade booking remains in place, but credit approval must be refreshed before the exception can be relied on again."
            )
            create_trade_workflow_item(
                db,
                trade_id=trade.trade_id,
                workflow_type=TradeWorkflowType.CREDIT_APPROVAL.value,
                actor_id=actor_id,
                enforce_credit_authorization=False,
                status=CreditApprovalStatus.PENDING_REVIEW.value,
                notes=notes,
                now=now,
            )
            return
        if existing_item is not None and existing_item.status == CreditApprovalStatus.REJECTED.value:
            return
        notes = (
            f"{_format_counterparty_credit_limit_message(policy_result)} "
            "Trade booking is allowed, but credit review is required before the breach can be accepted."
        )
        create_trade_workflow_item(
            db,
            trade_id=trade.trade_id,
            workflow_type=TradeWorkflowType.CREDIT_APPROVAL.value,
            actor_id=actor_id,
            enforce_credit_authorization=False,
            status=CreditApprovalStatus.PENDING_REVIEW.value,
            notes=notes,
            now=now,
        )
        return

    if existing_item is None or existing_item.status in {
        CreditApprovalStatus.APPROVED.value,
        CreditApprovalStatus.NOT_REQUIRED.value,
    }:
        return

    notes = (
        f"{existing_item.notes}\n"
        "Closed automatically because projected exposure is now within the approved credit tolerance."
        if existing_item.notes
        else "Closed automatically because projected exposure is now within the approved credit tolerance."
    )
    create_trade_workflow_item(
        db,
        trade_id=trade.trade_id,
        workflow_type=TradeWorkflowType.CREDIT_APPROVAL.value,
        actor_id=actor_id,
        enforce_credit_authorization=False,
        status=CreditApprovalStatus.NOT_REQUIRED.value,
        notes=notes,
        now=now,
    )


def require_active_portfolio(
    db: Session,
    portfolio_code: object | None,
    *,
    book_code: str,
) -> str | None:
    normalized_portfolio_code = normalize_optional_text(portfolio_code, uppercase=True)
    if normalized_portfolio_code is None:
        return None

    reference_portfolio = db.execute(
        select(ReferencePortfolio).where(
            ReferencePortfolio.code == normalized_portfolio_code,
            ReferencePortfolio.is_active.is_(True),
        )
    ).scalars().first()
    if reference_portfolio is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Portfolio '{normalized_portfolio_code}' is not active in reference data",
        )
    if reference_portfolio.book_code != book_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Portfolio '{normalized_portfolio_code}' belongs to book "
                f"'{reference_portfolio.book_code}', not '{book_code}'"
            ),
        )

    return normalized_portfolio_code


def require_active_price_index(
    db: Session,
    pricing_type: object | None,
    price_index_code: object | None,
) -> tuple[str, str | None]:
    normalized_pricing_type = normalize_pricing_type(pricing_type)
    normalized_price_index_code = normalize_price_index_code(price_index_code)

    if normalized_pricing_type in {PricingType.INDEX.value, PricingType.HYBRID.value}:
        if normalized_price_index_code is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Price index is required when pricing type is INDEX or HYBRID",
            )
    if normalized_price_index_code is None:
        return normalized_pricing_type, None

    reference_price_index = db.execute(
        select(ReferencePriceIndex).where(
            ReferencePriceIndex.code == normalized_price_index_code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalars().first()
    if reference_price_index is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Price index '{normalized_price_index_code}' is not active",
        )

    return normalized_pricing_type, normalized_price_index_code


def require_active_unit(db: Session, unit_code: object | None) -> str | None:
    normalized_unit_code = normalize_optional_text(unit_code, uppercase=True)
    if normalized_unit_code is None:
        return None

    reference_unit = db.execute(
        select(ReferenceUnit).where(
            ReferenceUnit.code == normalized_unit_code,
            ReferenceUnit.is_active.is_(True),
        )
    ).scalars().first()
    if reference_unit is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unit '{normalized_unit_code}' is not active in reference data",
        )

    return normalized_unit_code


def _active_price_index_unit(db: Session, price_index_code: object | None) -> str | None:
    normalized_price_index_code = normalize_optional_text(price_index_code, uppercase=True)
    if normalized_price_index_code is None:
        return None

    reference_price_index = db.execute(
        select(ReferencePriceIndex.unit_code).where(
            ReferencePriceIndex.code == normalized_price_index_code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalar_one_or_none()
    return normalize_optional_text(reference_price_index, uppercase=True)


def _first_active_unit(db: Session, *candidates: object | None) -> str | None:
    for candidate in candidates:
        unit_code = require_active_unit(db, candidate)
        if unit_code is not None:
            return unit_code
    return None


def resolve_trade_quantity_unit(
    db: Session,
    unit_code: object | None,
    *,
    commodity_class: object | None,
    commodity: object | None,
    price_index_code: object | None = None,
) -> str:
    resolved_unit_code = _first_active_unit(
        db,
        unit_code,
        default_quantity_unit_code(
            commodity_class=commodity_class,
            commodity=commodity,
        ),
        _active_price_index_unit(db, price_index_code),
    )
    if resolved_unit_code is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unit of measure is required and could not be inferred from commodity reference data.",
        )
    return resolved_unit_code


def resolve_trade_price_unit(
    db: Session,
    unit_code: object | None,
    *,
    commodity_class: object | None,
    commodity: object | None,
    price_index_code: object | None = None,
) -> str:
    resolved_unit_code = _first_active_unit(
        db,
        unit_code,
        _active_price_index_unit(db, price_index_code),
        default_price_unit_code(
            commodity_class=commodity_class,
            commodity=commodity,
            price_index_code=price_index_code,
        ),
    )
    if resolved_unit_code is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Price unit is required and could not be inferred from commodity or price index reference data.",
        )
    return resolved_unit_code


def require_active_currency(db: Session, currency_code: object | None) -> str | None:
    normalized_currency_code = normalize_optional_text(currency_code, uppercase=True)
    if normalized_currency_code is None:
        return None

    reference_currency = db.execute(
        select(ReferenceCurrency).where(
            ReferenceCurrency.code == normalized_currency_code,
            ReferenceCurrency.is_active.is_(True),
        )
    ).scalars().first()
    if reference_currency is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Currency '{normalized_currency_code}' is not active in reference data",
        )

    return normalized_currency_code


def require_active_location(db: Session, location_code: object | None) -> str | None:
    normalized_location_code = normalize_optional_text(location_code, uppercase=True)
    if normalized_location_code is None:
        return None

    reference_location = db.execute(
        select(ReferenceLocation).where(
            ReferenceLocation.code == normalized_location_code,
            ReferenceLocation.is_active.is_(True),
        )
    ).scalars().first()
    if reference_location is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Location '{normalized_location_code}' is not active in reference data",
        )

    return normalized_location_code


def validate_trade_structure_payload(
    trade_structure: str,
    trade_side: object | None,
    legs_payload: object | None,
) -> tuple[str | None, list[dict[str, object]]]:
    if legs_payload is None:
        legs = []
    elif isinstance(legs_payload, list):
        legs = [leg for leg in legs_payload if isinstance(leg, dict)]
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="legs must be an array of objects when provided",
        )

    if trade_structure == TradeStructure.SINGLE.value:
        normalized_trade_side = normalize_trade_side(trade_side)
        return normalized_trade_side, legs

    if trade_side is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="trade_side cannot be set on SWAP trades; use legs instead",
        )
    if len(legs) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="SWAP trades require at least two legs",
        )
    return None, legs


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


def sync_primary_price_term(
    db: Session,
    trade_id: str,
    pricing_type: str,
    fixed_price: object | None,
    price_index_code: str | None,
    currency_code: str | None,
    price_unit_code: str | None,
    timestamp: datetime,
) -> None:
    term = db.execute(
        select(TradePriceTerm).where(
            TradePriceTerm.trade_id == trade_id,
            TradePriceTerm.term_no == 1,
        )
    ).scalars().first()

    if term is None:
        term = TradePriceTerm(
            trade_price_term_id=str(uuid.uuid4()),
            trade_id=trade_id,
            term_no=1,
            pricing_type=pricing_type,
            fixed_price=fixed_price,
            price_index_code=price_index_code,
            currency_code=currency_code,
            price_unit_code=price_unit_code,
            created_at=timestamp,
            updated_at=timestamp,
        )
        db.add(term)
        return

    term.pricing_type = pricing_type
    term.fixed_price = fixed_price
    term.price_index_code = price_index_code
    term.currency_code = currency_code
    term.price_unit_code = price_unit_code
    term.updated_at = timestamp
