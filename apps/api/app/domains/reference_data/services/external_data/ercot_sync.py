from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.external_data.ercot_client import (
    ERCOTClient,
    ERCOTClientError,
)
from apps.api.app.domains.reference_data.services.external_data.ercot_mapper import normalize_ercot_observations
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    create_run,
    load_definitions,
    mark_run_failed,
    upsert_observations,
)
from apps.api.app.models.external_data_run import ExternalDataRun


def sync_ercot_series(
    db: Session,
    *,
    client: Optional[ERCOTClient] = None,
    series_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
    today: Optional[date] = None,
) -> ExternalDataRun:
    del lookback_days, today

    ercot_client = client or ERCOTClient()
    run = create_run(db, provider="ERCOT", job_name="sync_ercot_power_series", requested_by=requested_by)

    try:
        definitions = load_definitions(db, provider="ERCOT", series_code=series_code)
        run.series_count = len(definitions)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        snapshot = ercot_client.fetch_real_time_hub_prices()
        observations = normalize_ercot_observations(
            definitions=definitions,
            snapshot=snapshot,
            downloaded_at=downloaded_at,
        )
        total_observations = upsert_observations(db, run_id=run.id, observations=observations)

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("ERCOT run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_observations
        db.commit()
        db.refresh(run)
        return run
    except (ERCOTClientError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)
