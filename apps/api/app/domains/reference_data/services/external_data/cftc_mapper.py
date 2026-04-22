from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    NormalizedSeriesObservation,
    evaluate_transform_rule,
    parse_period,
    parse_timestamp,
)
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition


def normalize_cftc_observations(
    *,
    definition: ExternalSeriesDefinition,
    rows: list[dict[str, Any]],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedSeriesObservation]:
    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedSeriesObservation] = []

    for row in rows:
        raw_date = row.get("report_date_as_yyyy_mm_dd")
        if not isinstance(raw_date, str) or not raw_date.strip():
            continue

        value = evaluate_transform_rule(definition.transform_rule, row, default_field="open_interest_all")
        if value is None:
            continue

        results.append(
            NormalizedSeriesObservation(
                series_code=definition.code,
                observation_date=parse_period(raw_date, definition.frequency),
                value=value,
                unit_code=definition.unit_code.strip().upper(),
                source_provider=definition.provider,
                source_series_id=definition.series_id,
                source_frequency=definition.frequency.strip().upper(),
                source_published_at=parse_timestamp(raw_date),
                source_revision=str(row.get("id")).strip() if row.get("id") is not None else None,
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results
