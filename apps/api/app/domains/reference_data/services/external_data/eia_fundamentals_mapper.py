from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    NormalizedSeriesObservation,
    evaluate_transform_rule,
    parse_period,
)
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition


def normalize_eia_fundamental_observations(
    *,
    definition: ExternalSeriesDefinition,
    payload: dict,
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedSeriesObservation]:
    response = payload.get("response")
    if not isinstance(response, dict):
        raise ExternalSeriesSyncError("EIA payload missing response object")

    response_frequency = response.get("frequency")
    frequency = definition.frequency or response_frequency
    if not frequency:
        raise ExternalSeriesSyncError(f"No frequency available for series {definition.series_id}")

    rows = response.get("data", [])
    if not isinstance(rows, list):
        raise ExternalSeriesSyncError("EIA payload data was not a list")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedSeriesObservation] = []
    for row in rows:
        if not isinstance(row, dict):
            raise ExternalSeriesSyncError("EIA payload row was not an object")

        period = row.get("period")
        if not isinstance(period, str) or not period.strip():
            raise ExternalSeriesSyncError(f"EIA row missing period for series {definition.series_id}")

        value = evaluate_transform_rule(definition.transform_rule, row, default_field="value")
        if value is None:
            continue

        results.append(
            NormalizedSeriesObservation(
                series_code=definition.code,
                observation_date=parse_period(period, frequency),
                value=value,
                unit_code=definition.unit_code.strip().upper(),
                source_provider=definition.provider,
                source_series_id=definition.series_id,
                source_frequency=frequency.upper(),
                source_published_at=_parse_published_at(row),
                source_revision=_extract_source_revision(row),
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results


def _parse_published_at(row: dict) -> Optional[datetime]:
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
        return parsed.astimezone(timezone.utc)
    return None


def _extract_source_revision(row: dict) -> Optional[str]:
    for field in ("revision", "revisionDate", "updated", "lastUpdated"):
        value = row.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None
