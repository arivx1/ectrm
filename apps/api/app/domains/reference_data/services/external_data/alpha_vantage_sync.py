from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services import rebuild_trade_accruals_ledger
from apps.api.app.domains.reference_data.services.external_data.alpha_vantage_client import (
    AlphaVantageClient,
    AlphaVantageClientError,
)
from apps.api.app.domains.reference_data.services.external_data.alpha_vantage_mapper import (
    AlphaVantageMappingError,
    alpha_vantage_interval_for_mapping,
    alpha_vantage_outputsize_for_mapping,
    normalize_alpha_vantage_price_observations,
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


def sync_alpha_vantage_prices(
    db: Session,
    *,
    client: Optional[AlphaVantageClient] = None,
    price_index_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
) -> ExternalDataRun:
    del lookback_days

    alpha_client = client or AlphaVantageClient()
    run = create_run(
        db,
        provider="ALPHA_VANTAGE",
        job_name="sync_alpha_vantage_prices",
        requested_by=requested_by,
    )

    try:
        mappings = _load_mappings(db, price_index_code=price_index_code)
        run.series_count = len(mappings)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        total_observations = 0
        changed_price_index_codes: set[str] = set()
        for mapping in mappings:
            payload = alpha_client.fetch_series(
                function=mapping.dataset_code or "GLOBAL_QUOTE",
                symbol=mapping.series_id,
                interval=alpha_vantage_interval_for_mapping(mapping),
                outputsize=alpha_vantage_outputsize_for_mapping(mapping),
            )
            observations = normalize_alpha_vantage_price_observations(
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
                actor_id=requested_by or "external_data:alpha_vantage_sync",
                now=downloaded_at,
            )

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("Alpha Vantage run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_observations
        db.commit()
        db.refresh(run)
        return run
    except (AlphaVantageClientError, AlphaVantageMappingError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)


def _load_mappings(
    db: Session,
    *,
    price_index_code: Optional[str],
) -> list[ReferencePriceIndexSource]:
    stmt = select(ReferencePriceIndexSource).where(
        ReferencePriceIndexSource.provider == "ALPHA_VANTAGE",
        ReferencePriceIndexSource.is_active.is_(True),
    )
    if price_index_code:
        stmt = stmt.where(ReferencePriceIndexSource.price_index_code == price_index_code.strip().upper())

    rows = db.execute(stmt.order_by(ReferencePriceIndexSource.price_index_code.asc())).scalars().all()
    if not rows:
        raise ExternalSeriesSyncError("No active Alpha Vantage price-index sources matched the requested filters")
    return rows
