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


def normalize_caiso_observations(
    *,
    definitions: list[ExternalSeriesDefinition],
    snapshot: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedSeriesObservation]:
    trade_date = snapshot.get("trade_date")
    if not isinstance(trade_date, str) or not trade_date.strip():
        raise ExternalSeriesSyncError("CAISO snapshot did not include a trade_date")

    hour = snapshot.get("hour")
    interval = snapshot.get("interval")
    if not isinstance(hour, int) or not isinstance(interval, int):
        raise ExternalSeriesSyncError("CAISO snapshot did not include an hour and interval")

    rows = snapshot.get("prices")
    if not isinstance(rows, list):
        raise ExternalSeriesSyncError("CAISO snapshot did not include a prices list")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    definitions_by_hub = {definition.series_id.strip().upper(): definition for definition in definitions}
    revision = f"{trade_date}:HE{hour:02d}:I{interval:02d}"
    results: list[NormalizedSeriesObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        hub = str(row.get("hub") or "").strip().upper()
        definition = definitions_by_hub.get(hub)
        if definition is None:
            continue

        value = parse_numeric_value(row.get("lmp"))
        if value is None:
            continue

        results.append(
            NormalizedSeriesObservation(
                series_code=definition.code,
                observation_date=parse_period(trade_date, definition.frequency),
                value=value,
                unit_code=definition.unit_code.strip().upper(),
                source_provider=definition.provider,
                source_series_id=definition.series_id,
                source_frequency="5MIN",
                source_published_at=None,
                source_revision=revision,
                downloaded_at=normalized_downloaded_at,
                raw_payload={
                    "trade_date": trade_date,
                    "hour": hour,
                    "interval": interval,
                    **row,
                },
            )
        )

    return results
