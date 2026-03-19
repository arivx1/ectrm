from __future__ import annotations

from datetime import datetime, timezone
from datetime import date
from typing import Optional
from zoneinfo import ZoneInfo
from zoneinfo import ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.core.query_params import ADMIN_LIST_LIMIT_QUERY, LIST_OFFSET_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.weather.services import build_weather_intelligence_overview
from apps.api.app.domains.weather.services import build_nws_sync_status
from apps.api.app.domains.weather.services.external_data import sync_nws_weather_locations
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.weather_forecast_period import WeatherForecastPeriod
from apps.api.app.models.weather_location import WeatherLocation
from apps.api.app.models.weather_observation import WeatherObservation
from apps.api.app.schemas.external_data import ExternalDataRunOut
from apps.api.app.schemas.weather import (
    NWSSyncRequest,
    StoredWeatherForecastPeriodOut,
    StoredWeatherObservationOut,
    WeatherSyncStatusOut,
    WeatherIntelligenceOverviewOut,
    WeatherLocationCreate,
    WeatherLocationOut,
    WeatherLocationStatusUpdate,
    WeatherLocationUpdate,
)

router = APIRouter(prefix="/weather", tags=["weather"])
admin_router = APIRouter(prefix="/admin/weather", tags=["weather-admin"])


@router.get("/intelligence/overview", response_model=WeatherIntelligenceOverviewOut)
def get_weather_intelligence_overview(
    as_of_date: Optional[date] = None,
    commodity_class: Optional[str] = None,
    region_code: Optional[str] = None,
    db: Session = Depends(get_db),
) -> WeatherIntelligenceOverviewOut:
    return WeatherIntelligenceOverviewOut(
        **build_weather_intelligence_overview(
            db,
            as_of_date=as_of_date,
            commodity_class=commodity_class,
            region_code=region_code,
        )
    )


@router.get("/locations/{location_code}/forecast-periods", response_model=list[StoredWeatherForecastPeriodOut])
def list_weather_forecast_periods(
    location_code: str,
    limit: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
) -> list[StoredWeatherForecastPeriodOut]:
    location = db.get(WeatherLocation, location_code.strip().upper())
    if location is None:
        raise HTTPException(status_code=404, detail="Weather location not found")

    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(WeatherForecastPeriod)
        .where(WeatherForecastPeriod.weather_location_code == location.code)
        .order_by(WeatherForecastPeriod.start_at.asc())
    ).scalars().all()
    current_rows = [row for row in rows if _coerce_utc(row.end_at, timezone_name=location.timezone) >= now]
    return [_to_forecast_out(row) for row in current_rows[:limit]]


@router.get("/locations/{location_code}/observations", response_model=list[StoredWeatherObservationOut])
def list_weather_observations(
    location_code: str,
    limit: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
) -> list[StoredWeatherObservationOut]:
    location = db.get(WeatherLocation, location_code.strip().upper())
    if location is None:
        raise HTTPException(status_code=404, detail="Weather location not found")

    rows = db.execute(
        select(WeatherObservation)
        .where(WeatherObservation.weather_location_code == location.code)
        .order_by(WeatherObservation.observed_at.desc())
        .limit(limit)
    ).scalars().all()
    return [_to_observation_out(row) for row in rows]


@admin_router.get("/locations", response_model=list[WeatherLocationOut])
def list_weather_locations(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[WeatherLocationOut]:
    stmt = select(WeatherLocation).order_by(WeatherLocation.code.asc()).limit(limit).offset(offset)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                WeatherLocation.code.ilike(pattern),
                WeatherLocation.name.ilike(pattern),
                WeatherLocation.reference_location_code.ilike(pattern),
                WeatherLocation.station_id.ilike(pattern),
            )
        )
    if is_active is not None:
        stmt = stmt.where(WeatherLocation.is_active.is_(is_active))
    return [_to_weather_location_out(row) for row in db.execute(stmt).scalars().all()]


@admin_router.get("/sync/status", response_model=WeatherSyncStatusOut)
def get_nws_sync_status(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
) -> WeatherSyncStatusOut:
    payload = build_nws_sync_status(db, include_inactive=include_inactive)
    latest_run = payload.pop("latest_run")
    latest_success = payload.pop("latest_success")
    return WeatherSyncStatusOut(
        **payload,
        latest_run=_to_run_out(latest_run) if latest_run is not None else None,
        latest_success=_to_run_out(latest_success) if latest_success is not None else None,
    )


@admin_router.post("/locations", response_model=WeatherLocationOut, status_code=status.HTTP_201_CREATED)
def create_weather_location(
    payload: WeatherLocationCreate,
    db: Session = Depends(get_db),
) -> WeatherLocationOut:
    existing = db.get(WeatherLocation, payload.code)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Weather location already exists")
    _ensure_reference_location_exists(db, payload.reference_location_code)

    actor_id = resolve_audit_actor_id(payload.created_by)
    now = datetime.now(timezone.utc)
    record = WeatherLocation(
        code=payload.code,
        name=payload.name,
        reference_location_code=payload.reference_location_code,
        latitude=payload.latitude,
        longitude=payload.longitude,
        timezone=payload.timezone,
        source_provider="NWS",
        cwa=None,
        grid_id=None,
        grid_x=None,
        grid_y=None,
        station_id=None,
        description=payload.description,
        is_active=True,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Weather location already exists") from exc
    db.refresh(record)
    return _to_weather_location_out(record)


@admin_router.get("/locations/{location_code}", response_model=WeatherLocationOut)
def get_weather_location(location_code: str, db: Session = Depends(get_db)) -> WeatherLocationOut:
    record = db.get(WeatherLocation, location_code.strip().upper())
    if record is None:
        raise HTTPException(status_code=404, detail="Weather location not found")
    return _to_weather_location_out(record)


@admin_router.put("/locations/{location_code}", response_model=WeatherLocationOut)
def update_weather_location(
    location_code: str,
    payload: WeatherLocationUpdate,
    db: Session = Depends(get_db),
) -> WeatherLocationOut:
    record = db.get(WeatherLocation, location_code.strip().upper())
    if record is None:
        raise HTTPException(status_code=404, detail="Weather location not found")
    _ensure_reference_location_exists(db, payload.reference_location_code)

    if "name" in payload.model_fields_set and payload.name is not None:
        record.name = payload.name
    if "latitude" in payload.model_fields_set and payload.latitude is not None:
        record.latitude = payload.latitude
    if "longitude" in payload.model_fields_set and payload.longitude is not None:
        record.longitude = payload.longitude
    if "reference_location_code" in payload.model_fields_set:
        record.reference_location_code = payload.reference_location_code
    if "timezone" in payload.model_fields_set:
        record.timezone = payload.timezone
    if "description" in payload.model_fields_set:
        record.description = payload.description

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_weather_location_out(record)


@admin_router.post("/locations/{location_code}/deactivate", response_model=WeatherLocationOut)
def deactivate_weather_location(
    location_code: str,
    payload: WeatherLocationStatusUpdate,
    db: Session = Depends(get_db),
) -> WeatherLocationOut:
    record = db.get(WeatherLocation, location_code.strip().upper())
    if record is None:
        raise HTTPException(status_code=404, detail="Weather location not found")
    record.is_active = False
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_weather_location_out(record)


@admin_router.post("/locations/{location_code}/reactivate", response_model=WeatherLocationOut)
def reactivate_weather_location(
    location_code: str,
    payload: WeatherLocationStatusUpdate,
    db: Session = Depends(get_db),
) -> WeatherLocationOut:
    record = db.get(WeatherLocation, location_code.strip().upper())
    if record is None:
        raise HTTPException(status_code=404, detail="Weather location not found")
    record.is_active = True
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_weather_location_out(record)


@admin_router.post("/sync/nws", response_model=ExternalDataRunOut)
def trigger_nws_weather_sync(
    payload: NWSSyncRequest,
    db: Session = Depends(get_db),
) -> ExternalDataRunOut:
    run = sync_nws_weather_locations(
        db,
        location_codes=payload.location_codes,
        observation_limit=payload.observation_limit,
        requested_by=payload.requested_by,
    )
    return _to_run_out(run)


def _ensure_reference_location_exists(db: Session, code: Optional[str]) -> None:
    if code is None:
        return
    if db.get(ReferenceLocation, code) is None:
        raise HTTPException(status_code=400, detail=f"Reference location '{code}' was not found")


def _coerce_utc(value: datetime, *, timezone_name: Optional[str] = None) -> datetime:
    if value.tzinfo is None:
        if timezone_name:
            try:
                return value.replace(tzinfo=ZoneInfo(timezone_name)).astimezone(timezone.utc)
            except ZoneInfoNotFoundError:
                pass
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _to_weather_location_out(record: WeatherLocation) -> WeatherLocationOut:
    return WeatherLocationOut(
        code=record.code,
        name=record.name,
        reference_location_code=record.reference_location_code,
        latitude=record.latitude,
        longitude=record.longitude,
        timezone=record.timezone,
        source_provider=record.source_provider,
        cwa=record.cwa,
        grid_id=record.grid_id,
        grid_x=record.grid_x,
        grid_y=record.grid_y,
        station_id=record.station_id,
        description=record.description,
        is_active=record.is_active,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )


def _to_forecast_out(row: WeatherForecastPeriod) -> StoredWeatherForecastPeriodOut:
    return StoredWeatherForecastPeriodOut(
        id=row.id,
        weather_location_code=row.weather_location_code,
        source_provider=row.source_provider,
        period_number=row.period_number,
        start_at=row.start_at,
        end_at=row.end_at,
        is_daytime=row.is_daytime,
        temperature=row.temperature,
        temperature_unit=row.temperature_unit,
        wind_speed=row.wind_speed,
        wind_direction=row.wind_direction,
        short_forecast=row.short_forecast,
        detailed_forecast=row.detailed_forecast,
        probability_of_precipitation_pct=row.probability_of_precipitation_pct,
        relative_humidity_pct=row.relative_humidity_pct,
        dewpoint_celsius=row.dewpoint_celsius,
        icon_url=row.icon_url,
        downloaded_at=row.downloaded_at,
        run_id=row.run_id,
    )


def _to_observation_out(row: WeatherObservation) -> StoredWeatherObservationOut:
    return StoredWeatherObservationOut(
        id=row.id,
        weather_location_code=row.weather_location_code,
        source_provider=row.source_provider,
        station_id=row.station_id,
        observed_at=row.observed_at,
        text_description=row.text_description,
        icon_url=row.icon_url,
        temperature_celsius=row.temperature_celsius,
        dewpoint_celsius=row.dewpoint_celsius,
        relative_humidity_pct=row.relative_humidity_pct,
        wind_speed_kmh=row.wind_speed_kmh,
        wind_direction_degrees=row.wind_direction_degrees,
        barometric_pressure_pa=row.barometric_pressure_pa,
        visibility_meters=row.visibility_meters,
        downloaded_at=row.downloaded_at,
        run_id=row.run_id,
    )


def _to_run_out(row: ExternalDataRun) -> ExternalDataRunOut:
    return ExternalDataRunOut(
        id=row.id,
        provider=row.provider,
        job_name=row.job_name,
        status=row.status,
        started_at=row.started_at,
        finished_at=row.finished_at,
        requested_by=row.requested_by,
        series_count=row.series_count,
        observation_count=row.observation_count,
        error_summary=row.error_summary,
        created_at=row.created_at,
    )
