from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services import rebuild_trade_accruals_ledger
from apps.api.app.domains.reference_data.services.external_data.eia_wholesale_power_client import (
    EIAWholesalePowerClient,
    EIAWholesalePowerClientError,
)
from apps.api.app.domains.reference_data.services.external_data.eia_wholesale_power_price_mapper import (
    normalize_eia_wholesale_power_price_observations,
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


def sync_eia_wholesale_power_series(
    db: Session,
    *,
    client: Optional[EIAWholesalePowerClient] = None,
    price_index_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
    today: Optional[date] = None,
) -> ExternalDataRun:
    wholesale_client = client or EIAWholesalePowerClient()
    run = create_run(
        db,
        provider="EIA_WHOLESALE_POWER",
        job_name="sync_eia_wholesale_power_prices",
        requested_by=requested_by,
    )

    try:
        price_mappings = _load_price_mappings(db, price_index_code=price_index_code)
        if not price_mappings:
            raise ExternalSeriesSyncError(
                "No active EIA wholesale power price-index sources matched the requested filters"
            )

        run.series_count = len(price_mappings)
        db.commit()

        anchor = today or date.today()
        start_date = anchor - timedelta(days=lookback_days) if lookback_days is not None else None
        years = _years_to_fetch(anchor=anchor, start_date=start_date)
        payload = wholesale_client.fetch_power_prices(
            years=years,
            hubs=[mapping.series_id for mapping in price_mappings],
            start_date=start_date,
        )

        downloaded_at = datetime.now(timezone.utc)
        observations = normalize_eia_wholesale_power_price_observations(
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
                actor_id=requested_by or "external_data:eia_wholesale_power_sync",
                now=downloaded_at,
            )

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("EIA wholesale power run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = written_count
        db.commit()
        db.refresh(run)
        return run
    except (EIAWholesalePowerClientError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)


def _load_price_mappings(
    db: Session,
    *,
    price_index_code: Optional[str],
) -> list[ReferencePriceIndexSource]:
    stmt = select(ReferencePriceIndexSource).where(
        ReferencePriceIndexSource.provider == "EIA_WHOLESALE_POWER",
        ReferencePriceIndexSource.is_active.is_(True),
    )
    if price_index_code:
        stmt = stmt.where(
            ReferencePriceIndexSource.price_index_code == price_index_code.strip().upper()
        )
    return db.execute(stmt.order_by(ReferencePriceIndexSource.price_index_code.asc())).scalars().all()


def _years_to_fetch(*, anchor: date, start_date: Optional[date]) -> tuple[int, ...]:
    if start_date is None:
        return (anchor.year,)
    return tuple(range(start_date.year, anchor.year + 1))
