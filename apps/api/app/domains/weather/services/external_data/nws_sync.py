from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.domains.weather.services.external_data.nws_client import NWSClient
from apps.api.app.domains.weather.services.external_data.nws_client import NWSClientError
from apps.api.app.domains.weather.services.external_data.nws_mapper import NWSForecastPeriod
from apps.api.app.domains.weather.services.external_data.nws_mapper import NWSMappingError
from apps.api.app.domains.weather.services.external_data.nws_mapper import NWSObservation
from apps.api.app.domains.weather.services.external_data.nws_mapper import extract_primary_station_id
from apps.api.app.domains.weather.services.external_data.nws_mapper import normalize_hourly_forecast
from apps.api.app.domains.weather.services.external_data.nws_mapper import normalize_observations
from apps.api.app.domains.weather.services.external_data.nws_mapper import normalize_point_metadata
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.weather_forecast_period import WeatherForecastPeriod
from apps.api.app.models.weather_location import WeatherLocation
from apps.api.app.models.weather_observation import WeatherObservation


class NWSSyncError(RuntimeError):
    pass


def sync_nws_weather_locations(
    db: Session,
    *,
    client: Optional[NWSClient] = None,
    location_codes: Optional[list[str]] = None,
    observation_limit: int = 24,
    requested_by: Optional[str] = None,
) -> ExternalDataRun:
    if observation_limit < 1:
        raise NWSSyncError("observation_limit must be at least 1")

    actor_id = resolve_audit_actor_id(requested_by, required=False) or "system"
    nws_client = client or NWSClient()
    run = _create_run(db, requested_by=actor_id)

    try:
        locations = _load_locations(db, location_codes=location_codes)
        run.series_count = len(locations)
        db.commit()

        total_written = 0
        for location in locations:
            downloaded_at = datetime.now(timezone.utc)
            point_payload = nws_client.get_point(latitude=location.latitude, longitude=location.longitude)
            point = normalize_point_metadata(point_payload)

            forecast_payload = nws_client.get_hourly_forecast(forecast_url=point.forecast_hourly_url)
            forecast_periods = normalize_hourly_forecast(forecast_payload)
            raw_periods = _extract_forecast_payloads(forecast_payload)

            stations_payload = nws_client.get_stations(stations_url=point.observation_stations_url)
            station_id = extract_primary_station_id(stations_payload)

            observations: list[NWSObservation] = []
            raw_observations: list[dict] = []
            if station_id is not None:
                observations_payload = nws_client.get_station_observations(
                    station_id=station_id,
                    limit=observation_limit,
                )
                observations = normalize_observations(observations_payload)
                raw_observations = _extract_observation_payloads(observations_payload)

            _apply_location_metadata(
                location,
                actor_id=actor_id,
                downloaded_at=downloaded_at,
                point=point,
                station_id=station_id,
            )
            db.commit()

            total_written += _upsert_forecast_periods(
                db,
                location_code=location.code,
                run_id=run.id,
                downloaded_at=downloaded_at,
                source_provider=location.source_provider,
                periods=forecast_periods,
                raw_periods=raw_periods,
            )
            total_written += _upsert_observations(
                db,
                location_code=location.code,
                run_id=run.id,
                downloaded_at=downloaded_at,
                source_provider=location.source_provider,
                observations=observations,
                raw_observations=raw_observations,
            )

        run.status = "SUCCEEDED"
        run.finished_at = datetime.now(timezone.utc)
        run.observation_count = total_written
        db.commit()
        db.refresh(run)
        return run
    except (NWSClientError, NWSMappingError, NWSSyncError) as exc:
        db.rollback()
        run = db.get(ExternalDataRun, run.id)
        if run is not None:
            run.status = "FAILED"
            run.finished_at = datetime.now(timezone.utc)
            run.error_summary = str(exc)
            db.commit()
            db.refresh(run)
            return run
        raise


def _create_run(db: Session, *, requested_by: Optional[str]) -> ExternalDataRun:
    now = datetime.now(timezone.utc)
    run = ExternalDataRun(
        provider="NWS",
        job_name="sync_nws_weather_data",
        status="RUNNING",
        started_at=now,
        finished_at=None,
        requested_by=requested_by,
        series_count=0,
        observation_count=0,
        error_summary=None,
        created_at=now,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _load_locations(
    db: Session,
    *,
    location_codes: Optional[list[str]],
) -> list[WeatherLocation]:
    stmt = select(WeatherLocation).where(WeatherLocation.is_active.is_(True))
    if location_codes:
        stmt = stmt.where(WeatherLocation.code.in_(location_codes))

    rows = db.execute(stmt.order_by(WeatherLocation.code.asc())).scalars().all()
    if not rows:
        raise NWSSyncError("No active weather locations matched the requested filters")
    return rows


def _apply_location_metadata(
    location: WeatherLocation,
    *,
    actor_id: str,
    downloaded_at: datetime,
    point,
    station_id: Optional[str],
) -> None:
    changed = False
    for field_name, value in (
        ("source_provider", "NWS"),
        ("timezone", point.time_zone or location.timezone),
        ("cwa", point.cwa),
        ("grid_id", point.grid_id),
        ("grid_x", point.grid_x),
        ("grid_y", point.grid_y),
        ("station_id", station_id or location.station_id),
    ):
        if value is None:
            continue
        if getattr(location, field_name) != value:
            setattr(location, field_name, value)
            changed = True

    if changed:
        location.updated_at = downloaded_at
        location.updated_by = actor_id
        location.version += 1


def _upsert_forecast_periods(
    db: Session,
    *,
    location_code: str,
    run_id: int,
    downloaded_at: datetime,
    source_provider: str,
    periods: list[NWSForecastPeriod],
    raw_periods: list[dict],
) -> int:
    written = 0
    for period, raw_payload in zip(periods, raw_periods):
        existing = db.execute(
            select(WeatherForecastPeriod).where(
                WeatherForecastPeriod.weather_location_code == location_code,
                WeatherForecastPeriod.source_provider == source_provider,
                WeatherForecastPeriod.start_at == period.start_at,
            )
        ).scalars().first()

        if existing is None:
            db.add(
                WeatherForecastPeriod(
                    weather_location_code=location_code,
                    source_provider=source_provider,
                    period_number=period.period_number,
                    start_at=period.start_at,
                    end_at=period.end_at,
                    is_daytime=period.is_daytime,
                    temperature=period.temperature,
                    temperature_unit=period.temperature_unit,
                    wind_speed=period.wind_speed,
                    wind_direction=period.wind_direction,
                    short_forecast=period.short_forecast,
                    detailed_forecast=period.detailed_forecast,
                    probability_of_precipitation_pct=period.probability_of_precipitation_pct,
                    relative_humidity_pct=period.relative_humidity_pct,
                    dewpoint_celsius=period.dewpoint_celsius,
                    icon_url=period.icon_url,
                    downloaded_at=downloaded_at,
                    run_id=run_id,
                    raw_payload=raw_payload,
                    created_at=downloaded_at,
                    updated_at=downloaded_at,
                )
            )
            written += 1
            continue

        if _forecast_period_changed(existing, period, raw_payload):
            existing.period_number = period.period_number
            existing.end_at = period.end_at
            existing.is_daytime = period.is_daytime
            existing.temperature = period.temperature
            existing.temperature_unit = period.temperature_unit
            existing.wind_speed = period.wind_speed
            existing.wind_direction = period.wind_direction
            existing.short_forecast = period.short_forecast
            existing.detailed_forecast = period.detailed_forecast
            existing.probability_of_precipitation_pct = period.probability_of_precipitation_pct
            existing.relative_humidity_pct = period.relative_humidity_pct
            existing.dewpoint_celsius = period.dewpoint_celsius
            existing.icon_url = period.icon_url
            existing.downloaded_at = downloaded_at
            existing.run_id = run_id
            existing.raw_payload = raw_payload
            existing.updated_at = downloaded_at
            written += 1

    db.commit()
    return written


def _upsert_observations(
    db: Session,
    *,
    location_code: str,
    run_id: int,
    downloaded_at: datetime,
    source_provider: str,
    observations: list[NWSObservation],
    raw_observations: list[dict],
) -> int:
    written = 0
    for observation, raw_payload in zip(observations, raw_observations):
        existing = db.execute(
            select(WeatherObservation).where(
                WeatherObservation.weather_location_code == location_code,
                WeatherObservation.source_provider == source_provider,
                WeatherObservation.station_id == observation.station_id,
                WeatherObservation.observed_at == observation.observed_at,
            )
        ).scalars().first()

        if existing is None:
            db.add(
                WeatherObservation(
                    weather_location_code=location_code,
                    source_provider=source_provider,
                    station_id=observation.station_id,
                    observed_at=observation.observed_at,
                    text_description=observation.text_description,
                    icon_url=observation.icon_url,
                    temperature_celsius=observation.temperature_celsius,
                    dewpoint_celsius=observation.dewpoint_celsius,
                    relative_humidity_pct=observation.relative_humidity_pct,
                    wind_speed_kmh=observation.wind_speed_kmh,
                    wind_direction_degrees=observation.wind_direction_degrees,
                    barometric_pressure_pa=observation.barometric_pressure_pa,
                    visibility_meters=observation.visibility_meters,
                    downloaded_at=downloaded_at,
                    run_id=run_id,
                    raw_payload=raw_payload,
                    created_at=downloaded_at,
                    updated_at=downloaded_at,
                )
            )
            written += 1
            continue

        if _observation_changed(existing, observation, raw_payload):
            existing.text_description = observation.text_description
            existing.icon_url = observation.icon_url
            existing.temperature_celsius = observation.temperature_celsius
            existing.dewpoint_celsius = observation.dewpoint_celsius
            existing.relative_humidity_pct = observation.relative_humidity_pct
            existing.wind_speed_kmh = observation.wind_speed_kmh
            existing.wind_direction_degrees = observation.wind_direction_degrees
            existing.barometric_pressure_pa = observation.barometric_pressure_pa
            existing.visibility_meters = observation.visibility_meters
            existing.downloaded_at = downloaded_at
            existing.run_id = run_id
            existing.raw_payload = raw_payload
            existing.updated_at = downloaded_at
            written += 1

    db.commit()
    return written


def _forecast_period_changed(
    existing: WeatherForecastPeriod,
    period: NWSForecastPeriod,
    raw_payload: dict,
) -> bool:
    return any(
        (
            existing.period_number != period.period_number,
            not _datetimes_match(existing.end_at, period.end_at),
            existing.is_daytime != period.is_daytime,
            existing.temperature != period.temperature,
            existing.temperature_unit != period.temperature_unit,
            existing.wind_speed != period.wind_speed,
            existing.wind_direction != period.wind_direction,
            existing.short_forecast != period.short_forecast,
            existing.detailed_forecast != period.detailed_forecast,
            existing.probability_of_precipitation_pct != period.probability_of_precipitation_pct,
            existing.relative_humidity_pct != period.relative_humidity_pct,
            existing.dewpoint_celsius != period.dewpoint_celsius,
            existing.icon_url != period.icon_url,
            existing.raw_payload != raw_payload,
        )
    )


def _datetimes_match(left: datetime, right: datetime) -> bool:
    if left.tzinfo is None and right.tzinfo is not None:
        return left == right.replace(tzinfo=None)
    if right.tzinfo is None and left.tzinfo is not None:
        return left.replace(tzinfo=None) == right
    return _normalize_datetime(left) == _normalize_datetime(right)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _observation_changed(
    existing: WeatherObservation,
    observation: NWSObservation,
    raw_payload: dict,
) -> bool:
    return any(
        (
            existing.text_description != observation.text_description,
            existing.icon_url != observation.icon_url,
            existing.temperature_celsius != observation.temperature_celsius,
            existing.dewpoint_celsius != observation.dewpoint_celsius,
            existing.relative_humidity_pct != observation.relative_humidity_pct,
            existing.wind_speed_kmh != observation.wind_speed_kmh,
            existing.wind_direction_degrees != observation.wind_direction_degrees,
            existing.barometric_pressure_pa != observation.barometric_pressure_pa,
            existing.visibility_meters != observation.visibility_meters,
            existing.raw_payload != raw_payload,
        )
    )


def _extract_forecast_payloads(payload: dict) -> list[dict]:
    properties = payload.get("properties", {})
    periods = properties.get("periods", [])
    if not isinstance(periods, list):
        raise NWSSyncError("NWS forecast payload did not include a valid periods list")
    return [item for item in periods if isinstance(item, dict)]


def _extract_observation_payloads(payload: dict) -> list[dict]:
    features = payload.get("features", [])
    if not isinstance(features, list):
        raise NWSSyncError("NWS observations payload did not include a valid features list")
    return [item for item in features if isinstance(item, dict)]
