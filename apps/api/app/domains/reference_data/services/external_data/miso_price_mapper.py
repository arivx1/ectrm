from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.eia_mapper import NormalizedObservation
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    parse_numeric_value,
)
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def normalize_miso_price_observations(
    *,
    mappings: list[ReferencePriceIndexSource],
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
    rows = payload.get("prices")
    if not isinstance(rows, list):
        raise ExternalSeriesSyncError("MISO payload did not include a prices list")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    mappings_by_node = {mapping.series_id.strip().upper(): mapping for mapping in mappings}
    results: list[NormalizedObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        node = str(row.get("node") or "").strip()
        mapping = mappings_by_node.get(node.upper())
        if mapping is None:
            continue

        interval = str(row.get("interval") or "").strip()
        if not interval:
            continue
        interval_start = _parse_miso_interval(interval)

        value = parse_numeric_value(row.get("lmp"))
        if value is None:
            continue

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
                source_revision=interval_start.isoformat(),
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results


def _parse_miso_interval(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise ExternalSeriesSyncError(f"MISO interval was not ISO formatted: {value!r}") from exc
