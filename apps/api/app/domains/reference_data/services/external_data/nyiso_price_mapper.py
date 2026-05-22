from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.eia_mapper import NormalizedObservation
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    parse_numeric_value,
)
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def normalize_nyiso_price_observations(
    *,
    mappings: list[ReferencePriceIndexSource],
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
    rows = payload.get("prices")
    if not isinstance(rows, list):
        raise ExternalSeriesSyncError("NYISO payload did not include a prices list")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    mappings_by_zone = {mapping.series_id.strip().upper(): mapping for mapping in mappings}
    results: list[NormalizedObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        zone = str(row.get("zone") or "").strip()
        mapping = mappings_by_zone.get(zone.upper())
        if mapping is None:
            continue

        timestamp = str(row.get("timestamp") or "").strip()
        if not timestamp:
            continue
        interval_start = _parse_nyiso_timestamp(timestamp)

        value = parse_numeric_value(row.get("lbmp"))
        if value is None:
            continue

        ptid = str(row.get("ptid") or "").strip()
        revision = f"{interval_start.isoformat()}:ptid:{ptid}" if ptid else interval_start.isoformat()
        results.append(
            NormalizedObservation(
                price_index_code=mapping.price_index_code,
                observation_date=interval_start.date(),
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
                raw_payload=row,
            )
        )

    return results


def _parse_nyiso_timestamp(value: str) -> datetime:
    try:
        return datetime.strptime(value, "%m/%d/%Y %H:%M:%S")
    except ValueError as exc:
        raise ExternalSeriesSyncError(f"NYISO timestamp was not in MM/DD/YYYY HH:MM:SS format: {value!r}") from exc
