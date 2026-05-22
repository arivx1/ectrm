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


def normalize_eia_wholesale_power_price_observations(
    *,
    mappings: list[ReferencePriceIndexSource],
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
    rows = payload.get("prices")
    if not isinstance(rows, list):
        raise ExternalSeriesSyncError("EIA wholesale power payload did not include a prices list")

    mappings_by_hub = {mapping.series_id.strip().upper(): mapping for mapping in mappings}
    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        hub = str(row.get("price_hub") or "").strip().upper()
        mapping = mappings_by_hub.get(hub)
        if mapping is None:
            continue

        delivery_start = row.get("delivery_start_date")
        if not isinstance(delivery_start, str) or not delivery_start.strip():
            continue

        value = evaluate_transform_rule(
            mapping.transform_rule,
            row,
            default_field="wtd_avg_price",
        )
        if value is None:
            continue

        trade_date = row.get("trade_date")
        delivery_end = row.get("delivery_end_date")
        revision_parts = [
            part
            for part in (
                f"trade:{trade_date}" if isinstance(trade_date, str) and trade_date.strip() else None,
                f"delivery:{delivery_start}",
                f"end:{delivery_end}" if isinstance(delivery_end, str) and delivery_end.strip() else None,
            )
            if part is not None
        ]

        results.append(
            NormalizedObservation(
                price_index_code=mapping.price_index_code,
                observation_date=parse_period(delivery_start, mapping.frequency),
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
                source_revision=":".join(revision_parts),
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results
