from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.eia_mapper import NormalizedObservation
from apps.api.app.domains.reference_data.services.external_data.series_framework import ExternalSeriesSyncError
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def normalize_world_bank_price_observations(
    *,
    mapping: ReferencePriceIndexSource,
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
    rows = payload.get("prices", [])
    if not isinstance(rows, list):
        raise ExternalSeriesSyncError("World Bank Pink Sheet payload did not include a prices list")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedObservation] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if str(row.get("series_id") or "").strip() != mapping.series_id:
            continue

        raw_date = row.get("observation_date")
        if not isinstance(raw_date, str) or not raw_date.strip():
            continue

        value = _parse_decimal(row.get("value"))
        if value is None:
            continue

        results.append(
            NormalizedObservation(
                price_index_code=mapping.price_index_code,
                observation_date=datetime.strptime(raw_date.strip(), "%Y-%m-%d").date(),
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
                source_revision=_clean_text(row.get("source_revision")),
                downloaded_at=normalized_downloaded_at,
                raw_payload=row,
            )
        )

    return results


def _parse_decimal(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text in {"\u2026", ".", "NA", "N/A", "NULL"}:
        return None
    try:
        return Decimal(text.replace(",", ""))
    except (InvalidOperation, ValueError) as exc:
        raise ExternalSeriesSyncError(f"Could not parse World Bank Pink Sheet value {value!r}") from exc


def _clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = " ".join(str(value).split()).strip()
    return text or None
