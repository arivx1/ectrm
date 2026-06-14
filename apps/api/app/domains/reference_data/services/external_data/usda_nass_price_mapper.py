from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.eia_mapper import NormalizedObservation
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    parse_numeric_value,
    parse_period,
    parse_timestamp,
)
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def normalize_usda_nass_price_observations(
    *,
    mapping: ReferencePriceIndexSource,
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
    rows = payload.get("data", [])
    if not isinstance(rows, list):
        raise ExternalSeriesSyncError("USDA NASS response did not include a data list")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        observation_date = _parse_observation_date(row, mapping.frequency)
        value = _parse_nass_value(row.get("Value") or row.get("value"))
        if value is None:
            continue

        load_time = row.get("load_time")
        results.append(
            NormalizedObservation(
                price_index_code=mapping.price_index_code,
                observation_date=observation_date,
                value=value,
                unit_code=mapping.source_unit.strip().upper(),
                currency_code=(
                    mapping.source_currency_code.strip().upper()
                    if mapping.source_currency_code
                    else None
                ),
                source_provider=mapping.provider,
                source_series_id=mapping.series_id,
                source_frequency=mapping.frequency.strip().upper(),
                source_published_at=parse_timestamp(load_time),
                source_revision=load_time.strip() if isinstance(load_time, str) and load_time.strip() else None,
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results


def _parse_nass_value(value: Any) -> Optional[Decimal]:
    if isinstance(value, str) and value.strip().upper() in {"(D)", "(Z)", "(NA)", "--", "---"}:
        return None
    return parse_numeric_value(value)


def _parse_observation_date(row: dict[str, Any], frequency: str) -> date:
    normalized_frequency = frequency.strip().lower()
    year_text = str(row.get("year") or "").strip()
    if not year_text:
        raise ExternalSeriesSyncError("USDA NASS row did not include a year")

    if normalized_frequency in {"monthly", "month"}:
        month_text = str(row.get("begin_code") or row.get("end_code") or "").strip()
        if not month_text or month_text == "00":
            reference_period = str(row.get("reference_period_desc") or "").strip()
            if reference_period:
                return parse_period(f"{year_text}-{_month_from_reference_period(reference_period):02d}", frequency)
            raise ExternalSeriesSyncError("USDA NASS monthly row did not include a usable month")
        return date(int(year_text), int(month_text), 1)

    if normalized_frequency in {"weekly", "week"}:
        week_ending = str(row.get("week_ending") or "").strip()
        if not week_ending:
            raise ExternalSeriesSyncError("USDA NASS weekly row did not include week_ending")
        return parse_period(week_ending, frequency)

    return parse_period(year_text, frequency)


def _month_from_reference_period(reference_period: str) -> int:
    normalized = reference_period.strip().upper()[:3]
    months = {
        "JAN": 1,
        "FEB": 2,
        "MAR": 3,
        "APR": 4,
        "MAY": 5,
        "JUN": 6,
        "JUL": 7,
        "AUG": 8,
        "SEP": 9,
        "OCT": 10,
        "NOV": 11,
        "DEC": 12,
    }
    try:
        return months[normalized]
    except KeyError as exc:
        raise ExternalSeriesSyncError(
            f"USDA NASS monthly row had unsupported reference period {reference_period!r}"
        ) from exc
