from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class EIAMappingError(ValueError):
    pass


@dataclass
class NormalizedObservation:
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


def parse_period(period: str, frequency: str) -> date:
    normalized_frequency = frequency.strip().lower()
    value = period.strip()

    if normalized_frequency in {"daily", "day"}:
        return datetime.strptime(value, "%Y-%m-%d").date()
    if normalized_frequency in {"weekly", "week"}:
        return datetime.strptime(value, "%Y-%m-%d").date()
    if normalized_frequency in {"monthly", "month"}:
        return datetime.strptime(value, "%Y-%m").date()
    if normalized_frequency in {"quarterly", "quarter"}:
        year_text, quarter_text = value.split("-Q", maxsplit=1)
        month = ((int(quarter_text) - 1) * 3) + 1
        return date(int(year_text), month, 1)
    if normalized_frequency in {"annual", "yearly", "year"}:
        return date(int(value), 1, 1)

    raise EIAMappingError(f"Unsupported EIA frequency '{frequency}'")


def build_start_argument(frequency: str, lookback_days: Optional[int], today: Optional[date] = None) -> Optional[str]:
    if lookback_days is None:
        return None

    anchor = today or date.today()
    start_date = anchor - timedelta(days=lookback_days)
    normalized_frequency = frequency.strip().lower()

    if normalized_frequency in {"daily", "day", "weekly", "week"}:
        return start_date.isoformat()
    if normalized_frequency in {"monthly", "month"}:
        return start_date.strftime("%Y-%m")
    if normalized_frequency in {"quarterly", "quarter"}:
        quarter = ((start_date.month - 1) // 3) + 1
        return f"{start_date.year}-Q{quarter}"
    if normalized_frequency in {"annual", "yearly", "year"}:
        return str(start_date.year)

    raise EIAMappingError(f"Unsupported EIA frequency '{frequency}'")


def normalize_observations(
    *,
    mapping: ReferencePriceIndexSource,
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
    response = payload.get("response")
    if not isinstance(response, dict):
        raise EIAMappingError("EIA payload missing response object")

    response_frequency = response.get("frequency")
    frequency = mapping.frequency or response_frequency
    if not frequency:
        raise EIAMappingError(f"No frequency available for series {mapping.series_id}")

    rows = response.get("data", [])
    if not isinstance(rows, list):
        raise EIAMappingError("EIA payload data was not a list")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedObservation] = []
    for row in rows:
        if not isinstance(row, dict):
            raise EIAMappingError("EIA payload row was not an object")

        period = row.get("period")
        if not isinstance(period, str) or not period.strip():
            raise EIAMappingError(f"EIA row missing period for series {mapping.series_id}")

        raw_value = _extract_value(row)
        if _is_missing_value(raw_value):
            continue
        try:
            value = Decimal(str(raw_value))
        except (InvalidOperation, TypeError) as exc:
            raise EIAMappingError(
                f"Could not parse numeric value for series {mapping.series_id}: {raw_value!r}"
            ) from exc

        results.append(
            NormalizedObservation(
                price_index_code=mapping.price_index_code,
                observation_date=parse_period(period, frequency),
                value=value,
                unit_code=_normalize_unit_code(mapping),
                currency_code=_normalize_currency_code(mapping),
                source_provider=mapping.provider,
                source_series_id=mapping.series_id,
                source_frequency=frequency.upper(),
                source_published_at=_parse_published_at(row),
                source_revision=_extract_source_revision(row),
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results


def _extract_value(row: dict[str, Any]) -> Any:
    if "value" in row:
        return row["value"]

    ignored_fields = {
        "period",
        "series-description",
        "seriesDescription",
        "unit",
        "units",
    }
    for key, value in row.items():
        if key in ignored_fields or key.endswith("-units"):
            continue
        if value in (None, ""):
            continue
        if isinstance(value, (str, int, float)):
            return value

    raise EIAMappingError("EIA row did not contain a recognizable value field")


def _is_missing_value(value: Any) -> bool:
    if value is None:
        return True
    if not isinstance(value, str):
        return False
    return value.strip().upper() in {"", "NA", "N/A", "NULL"}


def _normalize_unit_code(mapping: ReferencePriceIndexSource) -> str:
    return mapping.source_unit.strip().upper()


def _normalize_currency_code(mapping: ReferencePriceIndexSource) -> Optional[str]:
    if mapping.source_currency_code is None:
        return None
    return mapping.source_currency_code.strip().upper()


def _parse_published_at(row: dict[str, Any]) -> Optional[datetime]:
    candidates = (
        row.get("updated"),
        row.get("lastUpdated"),
        row.get("modified"),
    )
    for candidate in candidates:
        if not isinstance(candidate, str) or not candidate.strip():
            continue
        text = candidate.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            continue
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    return None


def _extract_source_revision(row: dict[str, Any]) -> Optional[str]:
    for field in ("revision", "revisionDate", "updated", "lastUpdated"):
        value = row.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None
