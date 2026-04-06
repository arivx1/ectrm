from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    NormalizedSeriesObservation,
    parse_numeric_value,
    parse_period,
)
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition


def normalize_ercot_observations(
    *,
    definitions: list[ExternalSeriesDefinition],
    snapshot: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedSeriesObservation]:
    operating_day = snapshot.get("operating_day")
    interval_ending = snapshot.get("interval_ending")
    prices = snapshot.get("prices")

    if not isinstance(operating_day, str) or not operating_day.strip():
        raise ExternalSeriesSyncError("ERCOT snapshot did not include an operating_day")
    if not isinstance(interval_ending, str) or not interval_ending.strip():
        raise ExternalSeriesSyncError("ERCOT snapshot did not include an interval_ending")
    if not isinstance(prices, dict):
        raise ExternalSeriesSyncError("ERCOT snapshot did not include a prices object")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    definitions_by_hub = {definition.series_id.strip().upper(): definition for definition in definitions}
    revision = f"{operating_day}:IE{interval_ending}"
    results: list[NormalizedSeriesObservation] = []

    for hub, raw_value in prices.items():
        definition = definitions_by_hub.get(str(hub).strip().upper())
        if definition is None:
            continue

        value = parse_numeric_value(raw_value)
        if value is None:
            continue

        results.append(
            NormalizedSeriesObservation(
                series_code=definition.code,
                observation_date=parse_period(operating_day, definition.frequency),
                value=value,
                unit_code=definition.unit_code.strip().upper(),
                source_provider=definition.provider,
                source_series_id=definition.series_id,
                source_frequency="15MIN",
                source_published_at=None,
                source_revision=revision,
                downloaded_at=normalized_downloaded_at,
                raw_payload={
                    "operating_day": operating_day,
                    "interval_ending": interval_ending,
                    "hub": hub,
                    "price": raw_value,
                    "last_updated": snapshot.get("last_updated"),
                },
            )
        )

    return results
