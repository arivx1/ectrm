from __future__ import annotations

from datetime import date
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas.external_data import ExternalDataRunOut
from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text


class WeatherLocationCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=160)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    reference_location_code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    timezone: Optional[str] = Field(default=None, min_length=1, max_length=60)
    description: Optional[str] = None
    created_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return normalize_required_text(value, field_name="code", uppercase=True)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("reference_location_code")
    @classmethod
    def normalize_reference_location_code(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="reference_location_code", uppercase=True)

    @field_validator("timezone")
    @classmethod
    def normalize_timezone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="timezone")

    @field_validator("created_by")
    @classmethod
    def normalize_created_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="created_by")


class WeatherLocationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    reference_location_code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    timezone: Optional[str] = Field(default=None, min_length=1, max_length=60)
    description: Optional[str] = None
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="name")

    @field_validator("reference_location_code")
    @classmethod
    def normalize_reference_location_code(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="reference_location_code", uppercase=True)

    @field_validator("timezone")
    @classmethod
    def normalize_timezone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="timezone")

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class WeatherLocationStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class NWSSyncRequest(BaseModel):
    location_codes: Optional[list[str]] = None
    observation_limit: int = Field(default=24, ge=1, le=168)
    requested_by: Optional[str] = Field(default=None, min_length=1, max_length=128)

    @field_validator("location_codes")
    @classmethod
    def normalize_location_codes(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return None
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            normalized_item = normalize_required_text(item, field_name="location_codes", uppercase=True)
            if normalized_item not in seen:
                normalized.append(normalized_item)
                seen.add(normalized_item)
        return normalized

    @field_validator("requested_by")
    @classmethod
    def normalize_requested_by(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="requested_by")


class WeatherLocationOut(BaseModel):
    code: str
    name: str
    reference_location_code: Optional[str]
    latitude: float
    longitude: float
    timezone: Optional[str]
    source_provider: str
    cwa: Optional[str]
    grid_id: Optional[str]
    grid_x: Optional[int]
    grid_y: Optional[int]
    station_id: Optional[str]
    description: Optional[str]
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class StoredWeatherForecastPeriodOut(BaseModel):
    id: int
    weather_location_code: str
    source_provider: str
    period_number: int
    start_at: datetime
    end_at: datetime
    is_daytime: bool
    temperature: Optional[float]
    temperature_unit: Optional[str]
    wind_speed: Optional[str]
    wind_direction: Optional[str]
    short_forecast: Optional[str]
    detailed_forecast: Optional[str]
    probability_of_precipitation_pct: Optional[float]
    relative_humidity_pct: Optional[float]
    dewpoint_celsius: Optional[float]
    icon_url: Optional[str]
    downloaded_at: datetime
    run_id: int


class StoredWeatherObservationOut(BaseModel):
    id: int
    weather_location_code: str
    source_provider: str
    station_id: str
    observed_at: datetime
    text_description: Optional[str]
    icon_url: Optional[str]
    temperature_celsius: Optional[float]
    dewpoint_celsius: Optional[float]
    relative_humidity_pct: Optional[float]
    wind_speed_kmh: Optional[float]
    wind_direction_degrees: Optional[float]
    barometric_pressure_pa: Optional[float]
    visibility_meters: Optional[float]
    downloaded_at: datetime
    run_id: int


class WeatherCommodityExposureOut(BaseModel):
    commodity_code: str
    commodity_name: str
    commodity_class: str
    net_volume: float
    active_trade_count: int
    directional_bias: str
    weather_sensitivity_score: float
    primary_driver: str
    suggested_watch: str


class WeatherRegionalSignalOut(BaseModel):
    region_code: str
    region_name: str
    demand_risk: str
    supply_risk: str
    storm_risk: str
    primary_driver: str
    narrative: str
    data_mode: Optional[str] = None
    tracked_location_count: Optional[int] = None
    current_temperature_f: Optional[float] = None
    forecast_average_temperature_f: Optional[float] = None
    temperature_trend_f: Optional[float] = None
    heating_degree_days_24h: Optional[float] = None
    cooling_degree_days_24h: Optional[float] = None
    forecast_bias_f: Optional[float] = None
    forecast_age_hours: Optional[float] = None
    observation_age_hours: Optional[float] = None


class WeatherTrackedSourceOut(BaseModel):
    source_id: str
    source_name: str
    source_category: str
    update_frequency: str
    business_owner: str
    status: str


class WeatherIntelligenceOverviewOut(BaseModel):
    analysis_mode: str
    as_of_date: date
    seasonal_regime: str
    headline: str
    summary: str
    latest_position_update_at: Optional[datetime]
    latest_weather_update_at: Optional[datetime] = None
    live_weather_location_count: int = 0
    weather_sensitive_exposure_count: int
    weather_sensitive_gross_volume: float
    focus_areas: list[str]
    exposures: list[WeatherCommodityExposureOut]
    regional_signals: list[WeatherRegionalSignalOut]
    tracked_sources: list[WeatherTrackedSourceOut]


class WeatherSyncLocationStatusOut(BaseModel):
    code: str
    name: str
    reference_location_code: Optional[str]
    station_id: Optional[str]
    is_active: bool
    health_status: str
    last_forecast_downloaded_at: Optional[datetime]
    last_observation_at: Optional[datetime]
    last_observation_downloaded_at: Optional[datetime]
    forecast_age_hours: Optional[float]
    observation_age_hours: Optional[float]


class WeatherSyncStatusOut(BaseModel):
    provider: str
    label: str
    health_status: str
    latest_run_status: str
    success_sla_hours: int
    scheduler_interval_minutes: int
    forecast_freshness_hours: int
    observation_freshness_hours: int
    last_run_at: Optional[datetime]
    last_success_at: Optional[datetime]
    latest_data_at: Optional[datetime]
    error_summary: Optional[str]
    active_location_count: int
    healthy_location_count: int
    stale_location_count: int
    missing_location_count: int
    latest_run: Optional[ExternalDataRunOut]
    latest_success: Optional[ExternalDataRunOut]
    locations: list[WeatherSyncLocationStatusOut]
