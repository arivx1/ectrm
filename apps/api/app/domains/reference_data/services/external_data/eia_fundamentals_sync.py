from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.external_data.eia_client import (
    EIAClient,
    EIAClientError,
)
from apps.api.app.domains.reference_data.services.external_data.eia_fundamentals_mapper import (
    normalize_eia_fundamental_observations,
)
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    build_start_argument,
    create_run,
    load_definitions,
    mark_run_failed,
    upsert_observations,
)
from apps.api.app.models.external_data_run import ExternalDataRun


def sync_eia_fundamental_series(
    db: Session,
    *,
    client: Optional[EIAClient] = None,
    series_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
    today: Optional[date] = None,
) -> ExternalDataRun:
    eia_client = client or EIAClient()
    run = create_run(
        db,
        provider="EIA_FUNDAMENTALS",
        job_name="sync_eia_fundamental_series",
        requested_by=requested_by,
    )

    try:
        definitions = load_definitions(db, provider="EIA_FUNDAMENTALS", series_code=series_code)
        run.series_count = len(definitions)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        total_observations = 0
        for definition in definitions:
            payload = eia_client.fetch_series(
                series_id=definition.series_id,
                frequency=definition.frequency.lower(),
                start=build_start_argument(definition.frequency, lookback_days, today=today),
            )
            observations = normalize_eia_fundamental_observations(
                definition=definition,
                payload=payload,
                downloaded_at=downloaded_at,
            )
            total_observations += upsert_observations(db, run_id=run.id, observations=observations)

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("EIA fundamentals run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_observations
        db.commit()
        db.refresh(run)
        return run
    except (EIAClientError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)
