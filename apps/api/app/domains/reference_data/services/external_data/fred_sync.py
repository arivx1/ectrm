from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.external_data.fred_client import (
    FREDClient,
    FREDClientError,
)
from apps.api.app.domains.reference_data.services.external_data.fred_mapper import normalize_fred_observations
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    create_run,
    load_definitions,
    mark_run_failed,
    upsert_observations,
)
from apps.api.app.models.external_data_run import ExternalDataRun


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
        definitions = load_definitions(db, provider="FRED", series_code=series_code)
        run.series_count = len(definitions)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        total_observations = 0
        for definition in definitions:
            observation_start = None
            if lookback_days is not None:
                anchor = today or date.today()
                observation_start = (anchor - timedelta(days=lookback_days)).isoformat()
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
