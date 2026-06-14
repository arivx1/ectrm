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


def normalize_ercot_price_observations(
    *,
    mappings: list[ReferencePriceIndexSource],
    snapshot: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
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
    mappings_by_hub = {mapping.series_id.strip().upper(): mapping for mapping in mappings}
    revision = f"{operating_day}:IE{interval_ending}"
    results: list[NormalizedObservation] = []

    for hub, raw_value in prices.items():
        mapping = mappings_by_hub.get(str(hub).strip().upper())
        if mapping is None:
            continue

        value = parse_numeric_value(raw_value)
        if value is None:
            continue

        results.append(
            NormalizedObservation(
                price_index_code=mapping.price_index_code,
                observation_date=parse_period(operating_day, mapping.frequency),
                value=value,
                unit_code=mapping.source_unit.strip().upper(),
                currency_code=(
                    mapping.source_currency_code.strip().upper()
                    if mapping.source_currency_code
                    else None
                ),
                source_provider=mapping.provider,
                source_series_id=mapping.series_id,
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
