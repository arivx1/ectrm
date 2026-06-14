from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional

from apps.api.app.domains.reference_data.services.external_data.eia_mapper import NormalizedObservation
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    parse_numeric_value,
)
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def normalize_bls_ppi_price_observations(
    *,
    mapping: ReferencePriceIndexSource,
    payload: dict[str, Any],
    downloaded_at: Optional[datetime] = None,
) -> list[NormalizedObservation]:
    series = _series_payload(payload, mapping.series_id)
    rows = series.get("data", [])
    if not isinstance(rows, list):
        raise ExternalSeriesSyncError(f"BLS PPI series {mapping.series_id} did not include a data list")

    normalized_downloaded_at = downloaded_at or datetime.now(timezone.utc)
    results: list[NormalizedObservation] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        observation_date = _parse_bls_month(row)
        if observation_date is None:
            continue

        value = parse_numeric_value(row.get("value"))
        if value is None:
            continue

        results.append(
            NormalizedObservation(
                price_index_code=mapping.price_index_code,
                observation_date=observation_date,
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
                source_revision=_source_revision(row),
                downloaded_at=normalized_downloaded_at,
                raw_payload={"seriesID": mapping.series_id, **row},
            )
        )

    return results


def _series_payload(payload: dict[str, Any], series_id: str) -> dict[str, Any]:
    results = payload.get("Results")
    series_rows = results.get("series") if isinstance(results, dict) else None
    if not isinstance(series_rows, list):
        raise ExternalSeriesSyncError("BLS PPI response did not include a Results.series list")

    normalized_series_id = series_id.strip().upper()
    for series in series_rows:
        if not isinstance(series, dict):
            continue
        if str(series.get("seriesID") or "").strip().upper() == normalized_series_id:
            return series

    raise ExternalSeriesSyncError(f"BLS PPI response did not include series {normalized_series_id}")


def _parse_bls_month(row: dict[str, Any]) -> Optional[date]:
    year_text = str(row.get("year") or "").strip()
    period = str(row.get("period") or "").strip().upper()
    if not year_text or not period:
        raise ExternalSeriesSyncError("BLS PPI row did not include year and period")
    if period == "M13":
        return None
    if len(period) != 3 or not period.startswith("M"):
        raise ExternalSeriesSyncError(f"BLS PPI monthly row had unsupported period {period!r}")

    return date(int(year_text), int(period[1:]), 1)


def _source_revision(row: dict[str, Any]) -> Optional[str]:
    parts: list[str] = []
    latest = str(row.get("latest") or "").strip().lower()
    if latest:
        parts.append(f"latest:{latest}")

    footnotes = row.get("footnotes")
    if isinstance(footnotes, list):
        codes = [
            str(footnote.get("code") or "").strip()
            for footnote in footnotes
            if isinstance(footnote, dict) and str(footnote.get("code") or "").strip()
        ]
        if codes:
            parts.append(f"footnotes:{','.join(codes)}")

    return ";".join(parts) or None
