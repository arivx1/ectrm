from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.eia_mapper import NormalizedObservation
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    parse_numeric_value,
    parse_period,
)
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def normalize_caiso_price_observations(
    *,
    mappings: list[ReferencePriceIndexSource],
    snapshot: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
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
    mappings_by_hub = {mapping.series_id.strip().upper(): mapping for mapping in mappings}
    revision = f"{trade_date}:HE{hour:02d}:I{interval:02d}"
    results: list[NormalizedObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        hub = str(row.get("hub") or "").strip().upper()
        mapping = mappings_by_hub.get(hub)
        if mapping is None:
            continue

        value = parse_numeric_value(row.get("lmp"))
        if value is None:
            continue

        results.append(
            NormalizedObservation(
                price_index_code=mapping.price_index_code,
                observation_date=parse_period(trade_date, mapping.frequency),
                value=value,
                unit_code=mapping.source_unit.strip().upper(),
                currency_code=(
                    mapping.source_currency_code.strip().upper()
                    if mapping.source_currency_code
                    else None
                ),
                source_provider=mapping.provider,
                source_series_id=mapping.series_id,
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
