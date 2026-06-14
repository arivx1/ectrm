from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services import rebuild_trade_accruals_ledger
from apps.api.app.domains.reference_data.services.external_data.bls_client import (
    BLSPPIClient,
    BLSPPIClientError,
)
from apps.api.app.domains.reference_data.services.external_data.bls_price_mapper import (
    normalize_bls_ppi_price_observations,
)
from apps.api.app.domains.reference_data.services.external_data.price_index_observation_writer import (
    upsert_price_index_observations,
)
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    create_run,
    mark_run_failed,
)
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


BLS_PPI_SERIES_REQUEST_LIMIT = 25


def sync_bls_ppi_series(
    db: Session,
    *,
    client: Optional[BLSPPIClient] = None,
    price_index_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
    today: Optional[date] = None,
) -> ExternalDataRun:
    bls_client = client or BLSPPIClient()
    run = create_run(db, provider="BLS_PPI", job_name="sync_bls_ppi_prices", requested_by=requested_by)

    try:
        mappings = _load_price_mappings(db, price_index_code=price_index_code)
        run.series_count = len(mappings)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        start_year, end_year = _year_window_from_lookback(lookback_days=lookback_days, today=today)
        total_observations = 0
        changed_price_index_codes: set[str] = set()

        for mapping_chunk in _chunks(mappings, BLS_PPI_SERIES_REQUEST_LIMIT):
            payload = bls_client.fetch_series(
                series_ids=[mapping.series_id for mapping in mapping_chunk],
                start_year=start_year,
                end_year=end_year,
            )
            for mapping in mapping_chunk:
                observations = normalize_bls_ppi_price_observations(
                    mapping=mapping,
                    payload=payload,
                    downloaded_at=downloaded_at,
                )
                written_count, changed_codes = upsert_price_index_observations(
                    db,
                    run_id=run.id,
                    observations=observations,
                )
                total_observations += written_count
                changed_price_index_codes.update(changed_codes)

        if changed_price_index_codes:
            rebuild_trade_accruals_ledger(
                db,
                price_index_codes=sorted(changed_price_index_codes),
                actor_id=requested_by or "external_data:bls_ppi_sync",
                now=downloaded_at,
            )

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("BLS PPI run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_observations
        db.commit()
        db.refresh(run)
        return run
    except (BLSPPIClientError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)


def _load_price_mappings(
    db: Session,
    *,
    price_index_code: Optional[str],
) -> list[ReferencePriceIndexSource]:
    stmt = select(ReferencePriceIndexSource).where(
        ReferencePriceIndexSource.provider == "BLS_PPI",
        ReferencePriceIndexSource.is_active.is_(True),
    )
    if price_index_code:
        stmt = stmt.where(
            ReferencePriceIndexSource.price_index_code == price_index_code.strip().upper()
        )

    rows = db.execute(stmt.order_by(ReferencePriceIndexSource.price_index_code.asc())).scalars().all()
    if not rows:
        raise ExternalSeriesSyncError("No active BLS PPI price-index sources matched the requested filters")
    return rows


def _year_window_from_lookback(
    *,
    lookback_days: Optional[int],
    today: Optional[date],
) -> tuple[Optional[int], Optional[int]]:
    if lookback_days is None:
        return None, None
    anchor = today or date.today()
    return (anchor - timedelta(days=lookback_days)).year, anchor.year


def _chunks(
    rows: list[ReferencePriceIndexSource],
    size: int,
) -> list[list[ReferencePriceIndexSource]]:
    return [rows[index : index + size] for index in range(0, len(rows), size)]
