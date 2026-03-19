from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.weather_forecast_period import WeatherForecastPeriod
from apps.api.app.models.weather_location import WeatherLocation
from apps.api.app.models.weather_observation import WeatherObservation


def build_nws_sync_status(
    db: Session,
    *,
    include_inactive: bool = False,
    now: Optional[datetime] = None,
) -> dict:
    current_time = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)

    stmt = select(WeatherLocation).order_by(WeatherLocation.code.asc())
    if not include_inactive:
        stmt = stmt.where(WeatherLocation.is_active.is_(True))
    locations = db.execute(stmt).scalars().all()
    location_codes = [row.code for row in locations]

    forecast_downloads = _latest_forecast_downloads(db, location_codes)
    observation_timestamps, observation_downloads = _latest_observation_times(db, location_codes)

    location_rows: list[dict] = []
    healthy_count = 0
    stale_count = 0
    missing_count = 0
    latest_data_at: Optional[datetime] = None

    for location in locations:
        last_forecast_downloaded_at = _coerce_utc(forecast_downloads.get(location.code))
        last_observation_at = _coerce_utc(observation_timestamps.get(location.code))
        last_observation_downloaded_at = _coerce_utc(observation_downloads.get(location.code))

        forecast_age_hours = (
            _hours_between(last_forecast_downloaded_at, current_time)
            if last_forecast_downloaded_at is not None
            else None
        )
        observation_age_hours = (
            _hours_between(last_observation_at, current_time)
            if last_observation_at is not None
            else None
        )
        health_status = _location_health_status(
            forecast_age_hours=forecast_age_hours,
            observation_age_hours=observation_age_hours,
        )
        if health_status == "healthy":
            healthy_count += 1
        elif health_status == "stale":
            stale_count += 1
        else:
            missing_count += 1

        latest_location_data_at = _latest_datetime(
            [row for row in (last_forecast_downloaded_at, last_observation_downloaded_at) if row is not None]
        )
        latest_data_at = _max_datetime(latest_data_at, latest_location_data_at)

        location_rows.append(
            {
                "code": location.code,
                "name": location.name,
                "reference_location_code": location.reference_location_code,
                "station_id": location.station_id,
                "is_active": location.is_active,
                "health_status": health_status,
                "last_forecast_downloaded_at": last_forecast_downloaded_at,
                "last_observation_at": last_observation_at,
                "last_observation_downloaded_at": last_observation_downloaded_at,
                "forecast_age_hours": _round_optional(forecast_age_hours),
                "observation_age_hours": _round_optional(observation_age_hours),
            }
        )

    latest_run = _latest_run_for_provider(db, provider="NWS")
    latest_success = _latest_success_for_provider(db, provider="NWS")
    health_status = _sync_health_status(
        latest_run=latest_run,
        latest_success=latest_success,
        healthy_count=healthy_count,
        stale_count=stale_count,
        missing_count=missing_count,
        active_location_count=len(locations),
        now=current_time,
    )

    return {
        "provider": "NWS",
        "label": "NWS Weather Sync",
        "health_status": health_status,
        "latest_run_status": latest_run.status if latest_run is not None else "NO_RUNS",
        "success_sla_hours": settings.NWS_SYNC_SUCCESS_SLA_HOURS,
        "scheduler_interval_minutes": settings.NWS_SYNC_INTERVAL_MINUTES,
        "forecast_freshness_hours": settings.NWS_FORECAST_FRESHNESS_HOURS,
        "observation_freshness_hours": settings.NWS_OBSERVATION_FRESHNESS_HOURS,
        "last_run_at": _run_reference_time(latest_run),
        "last_success_at": _run_reference_time(latest_success),
        "latest_data_at": latest_data_at,
        "error_summary": latest_run.error_summary if latest_run is not None else None,
        "active_location_count": len(locations),
        "healthy_location_count": healthy_count,
        "stale_location_count": stale_count,
        "missing_location_count": missing_count,
        "latest_run": latest_run,
        "latest_success": latest_success,
        "locations": location_rows,
    }


def _latest_forecast_downloads(db: Session, location_codes: list[str]) -> dict[str, datetime]:
    if not location_codes:
        return {}
    rows = db.execute(
        select(
            WeatherForecastPeriod.weather_location_code,
            func.max(WeatherForecastPeriod.downloaded_at),
        )
        .where(WeatherForecastPeriod.weather_location_code.in_(location_codes))
        .group_by(WeatherForecastPeriod.weather_location_code)
    ).all()
    return {location_code: downloaded_at for location_code, downloaded_at in rows}


def _latest_observation_times(db: Session, location_codes: list[str]) -> tuple[dict[str, datetime], dict[str, datetime]]:
    if not location_codes:
        return {}, {}
    rows = db.execute(
        select(
            WeatherObservation.weather_location_code,
            func.max(WeatherObservation.observed_at),
            func.max(WeatherObservation.downloaded_at),
        )
        .where(WeatherObservation.weather_location_code.in_(location_codes))
        .group_by(WeatherObservation.weather_location_code)
    ).all()
    observed_at = {location_code: latest_observed_at for location_code, latest_observed_at, _ in rows}
    downloaded_at = {location_code: latest_downloaded_at for location_code, _, latest_downloaded_at in rows}
    return observed_at, downloaded_at


def _latest_run_for_provider(db: Session, *, provider: str) -> Optional[ExternalDataRun]:
    return db.execute(
        select(ExternalDataRun)
        .where(ExternalDataRun.provider == provider)
        .order_by(ExternalDataRun.started_at.desc(), ExternalDataRun.id.desc())
    ).scalars().first()


def _latest_success_for_provider(db: Session, *, provider: str) -> Optional[ExternalDataRun]:
    return db.execute(
        select(ExternalDataRun)
        .where(
            ExternalDataRun.provider == provider,
            ExternalDataRun.status == "SUCCEEDED",
        )
        .order_by(ExternalDataRun.finished_at.desc(), ExternalDataRun.started_at.desc(), ExternalDataRun.id.desc())
    ).scalars().first()


def _sync_health_status(
    *,
    latest_run: Optional[ExternalDataRun],
    latest_success: Optional[ExternalDataRun],
    healthy_count: int,
    stale_count: int,
    missing_count: int,
    active_location_count: int,
    now: datetime,
) -> str:
    if latest_run is None:
        return "unknown"
    if latest_run.status == "RUNNING":
        return "running"
    if latest_run.status == "FAILED":
        return "failed"

    success_at = _run_reference_time(latest_success)
    if success_at is None:
        return "unknown"
    if success_at < now - _hours_delta(settings.NWS_SYNC_SUCCESS_SLA_HOURS):
        return "stale"
    if active_location_count == 0:
        return "unknown"
    if missing_count or stale_count:
        return "degraded"
    if healthy_count == active_location_count:
        return "healthy"
    return "degraded"


def _location_health_status(
    *,
    forecast_age_hours: Optional[float],
    observation_age_hours: Optional[float],
) -> str:
    if forecast_age_hours is None or observation_age_hours is None:
        return "missing"
    if (
        forecast_age_hours > settings.NWS_FORECAST_FRESHNESS_HOURS
        or observation_age_hours > settings.NWS_OBSERVATION_FRESHNESS_HOURS
    ):
        return "stale"
    return "healthy"


def _run_reference_time(run: Optional[ExternalDataRun]) -> Optional[datetime]:
    if run is None:
        return None
    return _coerce_utc(run.finished_at if run.finished_at is not None else run.started_at)


def _hours_delta(hours: int):
    from datetime import timedelta

    return timedelta(hours=hours)


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _hours_between(start: datetime, end: datetime) -> float:
    return max((end - start).total_seconds() / 3600.0, 0.0)


def _round_optional(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round(value, 1)


def _latest_datetime(values: list[datetime]) -> Optional[datetime]:
    if not values:
        return None
    return max(values)


def _max_datetime(left: Optional[datetime], right: Optional[datetime]) -> Optional[datetime]:
    if left is None:
        return right
    if right is None:
        return left
    return right if right > left else left
