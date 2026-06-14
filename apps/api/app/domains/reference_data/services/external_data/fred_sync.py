from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services import rebuild_trade_accruals_ledger
from apps.api.app.domains.reference_data.services.external_data.fred_client import (
    FREDClient,
    FREDClientError,
)
from apps.api.app.domains.reference_data.services.external_data.fred_mapper import normalize_fred_observations
from apps.api.app.domains.reference_data.services.external_data.fred_price_mapper import normalize_fred_price_observations
from apps.api.app.domains.reference_data.services.external_data.price_index_observation_writer import (
    upsert_price_index_observations,
)
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    create_run,
    mark_run_failed,
    upsert_observations,
)
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


def sync_fred_series(
    db: Session,
    *,
    client: Optional[FREDClient] = None,
    series_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
    today: Optional[date] = None,
) -> ExternalDataRun:
    fred_client = client or FREDClient()
    run = create_run(db, provider="FRED", job_name="sync_fred_series", requested_by=requested_by)

    try:
        definitions = _load_definitions(db, series_code=series_code)
        price_mappings = _load_price_mappings(db, price_index_code=series_code)
        if not definitions and not price_mappings:
            raise ExternalSeriesSyncError(
                "No active FRED external series or price-index sources matched the requested filters"
            )

        run.series_count = len(definitions) + len(price_mappings)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        total_observations = 0
        changed_price_index_codes: set[str] = set()
        observation_start = None
        if lookback_days is not None:
            anchor = today or date.today()
            observation_start = (anchor - timedelta(days=lookback_days)).isoformat()

        for definition in definitions:
            payload = fred_client.fetch_series(
                series_id=definition.series_id,
                observation_start=observation_start,
            )
            observations = normalize_fred_observations(
                definition=definition,
                payload=payload,
                downloaded_at=downloaded_at,
            )
            total_observations += upsert_observations(db, run_id=run.id, observations=observations)

        for mapping in price_mappings:
            payload = fred_client.fetch_series(
                series_id=mapping.series_id,
                observation_start=observation_start,
            )
            observations = normalize_fred_price_observations(
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
                actor_id=requested_by or "external_data:fred_sync",
                now=downloaded_at,
            )

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("FRED run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_observations
        db.commit()
        db.refresh(run)
        return run
    except (FREDClientError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)


def _load_definitions(
    db: Session,
    *,
    series_code: Optional[str],
) -> list[ExternalSeriesDefinition]:
    stmt = select(ExternalSeriesDefinition).where(
        ExternalSeriesDefinition.provider == "FRED",
        ExternalSeriesDefinition.is_active.is_(True),
    )
    if series_code:
        stmt = stmt.where(ExternalSeriesDefinition.code == series_code.strip().upper())
    return db.execute(stmt.order_by(ExternalSeriesDefinition.code.asc())).scalars().all()


def _load_price_mappings(
    db: Session,
    *,
    price_index_code: Optional[str],
) -> list[ReferencePriceIndexSource]:
    stmt = select(ReferencePriceIndexSource).where(
        ReferencePriceIndexSource.provider == "FRED",
        ReferencePriceIndexSource.is_active.is_(True),
    )
    if price_index_code:
        stmt = stmt.where(
            ReferencePriceIndexSource.price_index_code == price_index_code.strip().upper()
        )
    return db.execute(stmt.order_by(ReferencePriceIndexSource.price_index_code.asc())).scalars().all()
