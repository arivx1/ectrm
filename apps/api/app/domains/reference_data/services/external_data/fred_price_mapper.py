from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.eia_mapper import NormalizedObservation
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    evaluate_transform_rule,
    parse_period,
)
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def normalize_fred_price_observations(
    *,
    mapping: ReferencePriceIndexSource,
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
    rows = payload.get("observations", [])
    if not isinstance(rows, list):
        raise ExternalSeriesSyncError("FRED response did not include an observations list")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        raw_date = row.get("date")
        if not isinstance(raw_date, str) or not raw_date.strip():
            continue

        value = evaluate_transform_rule(mapping.transform_rule, row, default_field="value")
        if value is None:
            continue

        revision_start = row.get("realtime_start")
        revision_end = row.get("realtime_end")
        revision = None
        if (
            isinstance(revision_start, str)
            and revision_start.strip()
            and isinstance(revision_end, str)
            and revision_end.strip()
        ):
            revision = f"{revision_start.strip()}:{revision_end.strip()}"

        results.append(
            NormalizedObservation(
                price_index_code=mapping.price_index_code,
                observation_date=parse_period(raw_date, mapping.frequency),
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
                source_published_at=None,
                source_revision=revision,
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results
