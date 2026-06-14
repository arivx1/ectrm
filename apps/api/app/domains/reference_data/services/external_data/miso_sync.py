from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services import rebuild_trade_accruals_ledger
from apps.api.app.domains.reference_data.services.external_data.miso_client import (
    MISOClient,
    MISOClientError,
)
from apps.api.app.domains.reference_data.services.external_data.miso_price_mapper import (
    normalize_miso_price_observations,
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


def sync_miso_series(
    db: Session,
    *,
    client: Optional[MISOClient] = None,
    price_index_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
    today: Optional[date] = None,
) -> ExternalDataRun:
    del lookback_days, today

    miso_client = client or MISOClient()
    run = create_run(db, provider="MISO", job_name="sync_miso_power_prices", requested_by=requested_by)

    try:
        price_mappings = _load_price_mappings(db, price_index_code=price_index_code)
        if not price_mappings:
            raise ExternalSeriesSyncError("No active MISO price-index sources matched the requested filters")

        run.series_count = len(price_mappings)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        payload = miso_client.fetch_realtime_five_minute_expost(
            nodes=[mapping.series_id for mapping in price_mappings],
        )
        observations = normalize_miso_price_observations(
            mappings=price_mappings,
            payload=payload,
            downloaded_at=downloaded_at,
        )
        written_count, changed_price_index_codes = upsert_price_index_observations(
            db,
            run_id=run.id,
            observations=observations,
        )

        if changed_price_index_codes:
            rebuild_trade_accruals_ledger(
                db,
                price_index_codes=sorted(changed_price_index_codes),
                actor_id=requested_by or "external_data:miso_sync",
                now=downloaded_at,
            )

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("MISO run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = written_count
        db.commit()
        db.refresh(run)
        return run
    except (MISOClientError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)


def _load_price_mappings(
    db: Session,
    *,
    price_index_code: Optional[str],
) -> list[ReferencePriceIndexSource]:
    stmt = select(ReferencePriceIndexSource).where(
        ReferencePriceIndexSource.provider == "MISO",
        ReferencePriceIndexSource.is_active.is_(True),
    )
    if price_index_code:
        stmt = stmt.where(
            ReferencePriceIndexSource.price_index_code == price_index_code.strip().upper()
        )
    return db.execute(stmt.order_by(ReferencePriceIndexSource.price_index_code.asc())).scalars().all()
