from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    NormalizedSeriesObservation,
    evaluate_transform_rule,
    parse_period,
)
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition


def normalize_fred_observations(
    *,
    definition: ExternalSeriesDefinition,
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedSeriesObservation]:
    rows = payload.get("observations", [])
    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedSeriesObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        raw_date = row.get("date")
        if not isinstance(raw_date, str) or not raw_date.strip():
            continue

        value = evaluate_transform_rule(definition.transform_rule, row, default_field="value")
        if value is None:
            continue

        revision_start = row.get("realtime_start")
        revision_end = row.get("realtime_end")
        revision = None
        if isinstance(revision_start, str) and revision_start.strip() and isinstance(revision_end, str) and revision_end.strip():
            revision = f"{revision_start.strip()}:{revision_end.strip()}"

        results.append(
            NormalizedSeriesObservation(
                series_code=definition.code,
                observation_date=parse_period(raw_date, definition.frequency),
                value=value,
                unit_code=definition.unit_code.strip().upper(),
                source_provider=definition.provider,
                source_series_id=definition.series_id,
                source_frequency=definition.frequency.strip().upper(),
                source_published_at=None,
                source_revision=revision,
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results
