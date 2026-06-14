from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class AlphaVantageMappingError(ValueError):
    pass


@dataclass
class NormalizedAlphaVantageObservation:
    price_index_code: str
    observation_date: date
    value: Decimal
    unit_code: str
    currency_code: Optional[str]
    source_provider: str
    source_series_id: str
    source_frequency: str
    source_published_at: Optional[datetime]
    source_revision: Optional[str]
    downloaded_at: datetime
    raw_payload: dict[str, Any]


def normalize_alpha_vantage_price_observations(
    *,
    mapping: ReferencePriceIndexSource,
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedAlphaVantageObservation]:
    function = _normalize_function(mapping.dataset_code)
    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)

    if function == "GLOBAL_QUOTE":
        row = _global_quote_row(payload, series_id=mapping.series_id)
        return [
            _build_observation(
                mapping=mapping,
                row=row,
                value_field="05. price",
                date_field="07. latest trading day",
                revision_field="07. latest trading day",
                downloaded_at=normalized_downloaded_at,
            )
        ]

    if function.startswith("TIME_SERIES_"):
        timestamp, row = _latest_time_series_row(payload)
        return [
            _build_observation(
                mapping=mapping,
                row=row,
                value_field=_default_time_series_value_field(function),
                date_value=timestamp.split(" ", maxsplit=1)[0],
                revision_value=timestamp,
                downloaded_at=normalized_downloaded_at,
            )
        ]

    if _is_commodity_payload(payload):
        row = _latest_commodity_row(payload, series_id=mapping.series_id)
        return [
            _build_observation(
                mapping=mapping,
                row=row,
                value_field="value",
                date_field="date",
                revision_field="date",
                downloaded_at=normalized_downloaded_at,
            )
        ]

    raise AlphaVantageMappingError(
        f"Unsupported Alpha Vantage payload for function {function!r} and series {mapping.series_id}"
    )


def alpha_vantage_interval_for_mapping(mapping: ReferencePriceIndexSource) -> Optional[str]:
    function = _normalize_function(mapping.dataset_code)
    frequency = mapping.frequency.strip().lower().replace("_", "")

    if function == "TIME_SERIES_INTRADAY":
        if frequency in {"1min", "5min", "15min", "30min", "60min"}:
            return frequency
        return "5min"

    if function not in {"GLOBAL_QUOTE"} and frequency in {"daily", "weekly", "monthly"}:
        return frequency
    return None


def alpha_vantage_outputsize_for_mapping(mapping: ReferencePriceIndexSource) -> Optional[str]:
    function = _normalize_function(mapping.dataset_code)
    if function.startswith("TIME_SERIES_"):
        return "compact"
    return None


def _normalize_function(value: Optional[str]) -> str:
    return (value or "GLOBAL_QUOTE").strip().upper()


def _global_quote_row(payload: dict[str, Any], *, series_id: str) -> dict[str, Any]:
    row = payload.get("Global Quote")
    if not isinstance(row, dict) or not row:
        raise AlphaVantageMappingError(f"Alpha Vantage quote payload missing Global Quote for {series_id}")
    return row


def _latest_time_series_row(payload: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    series_key = next(
        (
            key
            for key, value in payload.items()
            if key.startswith("Time Series") and isinstance(value, dict)
        ),
        None,
    )
    if series_key is None:
        raise AlphaVantageMappingError("Alpha Vantage payload missing time-series data")

    series_rows = payload[series_key]
    if not isinstance(series_rows, dict) or not series_rows:
        raise AlphaVantageMappingError("Alpha Vantage time-series data was empty")

    timestamp = max(str(key) for key in series_rows)
    row = series_rows.get(timestamp)
    if not isinstance(row, dict):
        raise AlphaVantageMappingError("Alpha Vantage time-series row was not an object")
    return timestamp, row


def _is_commodity_payload(payload: dict[str, Any]) -> bool:
    rows = payload.get("data")
    return isinstance(rows, list)


def _latest_commodity_row(payload: dict[str, Any], *, series_id: str) -> dict[str, Any]:
    rows = payload.get("data")
    if not isinstance(rows, list):
        raise AlphaVantageMappingError(f"Alpha Vantage commodity payload missing data rows for {series_id}")

    candidates = [row for row in rows if isinstance(row, dict) and str(row.get("date") or "").strip()]
    if not candidates:
        raise AlphaVantageMappingError(f"Alpha Vantage commodity payload had no dated rows for {series_id}")
    return max(candidates, key=lambda row: str(row.get("date") or ""))


def _build_observation(
    *,
    mapping: ReferencePriceIndexSource,
    row: dict[str, Any],
    value_field: str,
    downloaded_at: datetime,
    date_field: Optional[str] = None,
    date_value: Optional[str] = None,
    revision_field: Optional[str] = None,
    revision_value: Optional[str] = None,
) -> NormalizedAlphaVantageObservation:
    raw_value = _extract_value(row, mapping.transform_rule, default_field=value_field)
    if _is_missing_value(raw_value):
        raise AlphaVantageMappingError(f"Alpha Vantage row missing value for {mapping.price_index_code}")

    raw_date = date_value if date_value is not None else _lookup_field_value(row, date_field or "")
    if not isinstance(raw_date, str) or not raw_date.strip():
        raise AlphaVantageMappingError(f"Alpha Vantage row missing date for {mapping.price_index_code}")

    revision = revision_value
    if revision is None and revision_field:
        raw_revision = _lookup_field_value(row, revision_field)
        revision = str(raw_revision).strip() if raw_revision not in (None, "") else None

    return NormalizedAlphaVantageObservation(
        price_index_code=mapping.price_index_code,
        observation_date=_parse_date(raw_date),
        value=_parse_decimal(raw_value),
        unit_code=_normalize_unit_code(mapping),
        currency_code=_normalize_currency_code(mapping),
        source_provider=mapping.provider,
        source_series_id=mapping.series_id,
        source_frequency=mapping.frequency.strip().upper(),
        source_published_at=None,
        source_revision=revision,
        downloaded_at=downloaded_at,
        raw_payload=row,
    )


def _default_time_series_value_field(function: str) -> str:
    if function == "TIME_SERIES_DAILY_ADJUSTED":
        return "5. adjusted close"
    return "4. close"


def _extract_value(row: dict[str, Any], transform_rule: Optional[str], *, default_field: str) -> Any:
    rule = (transform_rule or "").strip()
    if not rule:
        return _lookup_field_value(row, default_field)
    if rule.startswith("field:"):
        return _lookup_field_value(row, rule.split(":", maxsplit=1)[1].strip())
    raise AlphaVantageMappingError(f"Unsupported Alpha Vantage transform rule {rule!r}")


def _lookup_field_value(row: dict[str, Any], field_name: str) -> Any:
    if field_name in row:
        return row[field_name]

    current: Any = row
    for part in field_name.split("."):
        key = part.strip()
        if not key:
            continue
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _parse_date(value: str) -> date:
    date_text = value.strip().split(" ", maxsplit=1)[0].split("T", maxsplit=1)[0]
    try:
        return datetime.strptime(date_text, "%Y-%m-%d").date()
    except ValueError as exc:
        raise AlphaVantageMappingError(f"Could not parse Alpha Vantage date {value!r}") from exc


def _parse_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value).strip().replace(",", ""))
    except (InvalidOperation, TypeError) as exc:
        raise AlphaVantageMappingError(f"Could not parse Alpha Vantage numeric value {value!r}") from exc


def _is_missing_value(value: Any) -> bool:
    if value is None:
        return True
    if not isinstance(value, str):
        return False
    return value.strip().upper() in {"", "NA", "N/A", "NULL", "."}


def _normalize_unit_code(mapping: ReferencePriceIndexSource) -> str:
    return mapping.source_unit.strip().upper()


def _normalize_currency_code(mapping: ReferencePriceIndexSource) -> Optional[str]:
    if mapping.source_currency_code is None:
        return None
    normalized = mapping.source_currency_code.strip().upper()
    return normalized or None
