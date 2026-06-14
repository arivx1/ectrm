from __future__ import annotations

import math
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status

from apps.api.app.shared.enums import (
    PricingType,
    TradeInstrumentType,
    TradeNature,
    TradeSide,
    TradeStatus,
    TradeStructure,
)


def normalize_commodity_code(value: object | None) -> str:
    return str(value or "").strip().upper()


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


def normalize_optional_text(value: object | None, *, uppercase: bool = False) -> str | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None
    return normalized.upper() if uppercase else normalized


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
