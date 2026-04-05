from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.external_data.cftc_client import (
    CFTCClient,
    CFTCClientError,
)
from apps.api.app.domains.reference_data.services.external_data.cftc_mapper import normalize_cftc_observations
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    build_start_argument,
    create_run,
    load_definitions,
    mark_run_failed,
    upsert_observations,
)
from apps.api.app.models.external_data_run import ExternalDataRun


def sync_cftc_series(
    db: Session,
    *,
    client: Optional[CFTCClient] = None,
    series_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
    today: Optional[date] = None,
) -> ExternalDataRun:
    cftc_client = client or CFTCClient()
    run = create_run(db, provider="CFTC", job_name="sync_cftc_series", requested_by=requested_by)

    try:
        definitions = load_definitions(db, provider="CFTC", series_code=series_code)
        run.series_count = len(definitions)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        total_observations = 0
        for definition in definitions:
            if not definition.dataset_code:
                raise ExternalSeriesSyncError(f"CFTC series {definition.code} did not define a dataset code")
            start = build_start_argument(definition.frequency, lookback_days, today=today)
            rows = cftc_client.fetch_rows(
                dataset_code=definition.dataset_code,
                filters=definition.query_params if isinstance(definition.query_params, dict) else None,
                start=start,
            )
            observations = normalize_cftc_observations(
                definition=definition,
                rows=rows,
                downloaded_at=downloaded_at,
            )
            total_observations += upsert_observations(db, run_id=run.id, observations=observations)

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("CFTC run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_observations
        db.commit()
        db.refresh(run)
        return run
    except (CFTCClientError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)
