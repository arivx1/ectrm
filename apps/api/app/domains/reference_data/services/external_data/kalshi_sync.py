from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.domains.reference_data.services.external_data.kalshi_client import (
    KalshiClient,
    KalshiClientError,
)
from apps.api.app.domains.reference_data.services.external_data.kalshi_mapper import (
    normalize_kalshi_candlesticks,
)
from apps.api.app.domains.reference_data.services.external_data.series_framework import (
    ExternalSeriesSyncError,
    create_run,
    load_definitions,
    mark_run_failed,
    upsert_observations,
)
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation


def sync_kalshi_series(
    db: Session,
    *,
    client: Optional[KalshiClient] = None,
    series_code: Optional[str] = None,
    lookback_days: Optional[int] = None,
    requested_by: Optional[str] = None,
    today: Optional[date] = None,
) -> ExternalDataRun:
    kalshi_client = client or KalshiClient()
    run = create_run(db, provider="KALSHI", job_name="sync_kalshi_series", requested_by=requested_by)

    try:
        definitions = load_definitions(db, provider="KALSHI", series_code=series_code)
        run.series_count = len(definitions)
        db.commit()

        downloaded_at = datetime.now(timezone.utc)
        total_observations = 0
        for definition in definitions:
            _validate_definition(definition)
            start_ts, end_ts = _resolve_time_window(
                db,
                definition_code=definition.code,
                lookback_days=lookback_days,
                today=today,
            )
            payload = kalshi_client.fetch_market_candlesticks(
                market_ticker=definition.series_id,
                series_ticker=definition.dataset_code,
                start_ts=start_ts,
                end_ts=end_ts,
                period_interval=1440,
            )
            observations = normalize_kalshi_candlesticks(
                definition=definition,
                payload=payload,
                downloaded_at=downloaded_at,
            )
            total_observations += upsert_observations(db, run_id=run.id, observations=observations)

        run = db.get(ExternalDataRun, run.id)
        if run is None:
            raise ExternalSeriesSyncError("Kalshi run disappeared before completion")
        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_observations
        db.commit()
        db.refresh(run)
        return run
    except (KalshiClientError, ExternalSeriesSyncError) as exc:
        db.rollback()
        return mark_run_failed(db, run_id=run.id, error=exc)


def _validate_definition(definition: ExternalSeriesDefinition) -> None:
    if definition.frequency.strip().lower() not in {"daily", "day"}:
        raise ExternalSeriesSyncError(
            f"Kalshi series {definition.code} must use daily frequency because observations are stored one row per day"
        )


def _resolve_time_window(
    db: Session,
    *,
    definition_code: str,
    lookback_days: Optional[int],
    today: Optional[date],
) -> tuple[int, int]:
    anchor_date = today or date.today()
    end_dt = datetime.combine(anchor_date, time.max, tzinfo=timezone.utc)

    if lookback_days is not None:
        start_date = anchor_date - timedelta(days=lookback_days)
    else:
        start_date = _default_start_date(db, definition_code=definition_code, anchor_date=anchor_date)

    start_dt = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    return int(start_dt.timestamp()), int(end_dt.timestamp())


def _default_start_date(db: Session, *, definition_code: str, anchor_date: date) -> date:
    latest_observation_date = db.execute(
        select(ExternalSeriesObservation.observation_date)
        .where(ExternalSeriesObservation.series_code == definition_code)
        .order_by(ExternalSeriesObservation.observation_date.desc())
        .limit(1)
    ).scalar_one_or_none()
    if latest_observation_date is not None:
        return min(latest_observation_date - timedelta(days=1), anchor_date)
    return anchor_date - timedelta(days=settings.KALSHI_DEFAULT_LOOKBACK_DAYS)
