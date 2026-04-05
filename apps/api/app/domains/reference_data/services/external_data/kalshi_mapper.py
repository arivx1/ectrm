from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    NormalizedSeriesObservation,
    evaluate_transform_rule,
)
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition


def normalize_kalshi_candlesticks(
    *,
    definition: ExternalSeriesDefinition,
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedSeriesObservation]:
    rows = payload.get("candlesticks", [])
    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedSeriesObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        published_at = _parse_unix_timestamp(row.get("end_period_ts"))
        if published_at is None:
            continue

        value = evaluate_transform_rule(definition.transform_rule or "field:price.close", row, default_field="price.close")
        if value is None:
            continue

        raw_end_period = row.get("end_period_ts")
        results.append(
            NormalizedSeriesObservation(
                series_code=definition.code,
                observation_date=published_at.date(),
                value=value,
                unit_code=definition.unit_code.strip().upper(),
                source_provider=definition.provider,
                source_series_id=definition.series_id,
                source_frequency="DAILY",
                source_published_at=published_at,
                source_revision=str(raw_end_period).strip() if raw_end_period is not None else None,
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results


def _parse_unix_timestamp(value: Any) -> Optional[datetime]:
    if value is None:
        return None

    try:
        raw_value = int(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise ExternalSeriesSyncError(f"Kalshi candlestick timestamp was invalid: {value!r}") from exc

    if raw_value > 10**12:
        raw_value = raw_value // 1000
    return datetime.fromtimestamp(raw_value, tz=timezone.utc)
