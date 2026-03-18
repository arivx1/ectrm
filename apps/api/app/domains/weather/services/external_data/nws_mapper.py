from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional
from urllib.parse import urlparse


class NWSMappingError(RuntimeError):
    pass


@dataclass(frozen=True)
class NWSPointMetadata:
    grid_id: str
    grid_x: int
    grid_y: int
    cwa: Optional[str]
    forecast_url: Optional[str]
    forecast_hourly_url: str
    forecast_grid_data_url: Optional[str]
    observation_stations_url: str
    county_zone_url: Optional[str]
    fire_weather_zone_url: Optional[str]
    time_zone: Optional[str]


@dataclass(frozen=True)
class NWSForecastPeriod:
    period_number: int
    start_at: datetime
    end_at: datetime
    is_daytime: bool
    temperature: Optional[int]
    temperature_unit: Optional[str]
    wind_speed: Optional[str]
    wind_direction: Optional[str]
    short_forecast: Optional[str]
    detailed_forecast: Optional[str]
    probability_of_precipitation_pct: Optional[float]
    relative_humidity_pct: Optional[float]
    dewpoint_celsius: Optional[float]
    icon_url: Optional[str]


@dataclass(frozen=True)
class NWSObservation:
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


@dataclass(frozen=True)
class NWSPointSnapshot:
    point: NWSPointMetadata
    primary_station_id: Optional[str]
    forecast_periods: list[NWSForecastPeriod]
    observations: list[NWSObservation]


def normalize_point_metadata(payload: dict[str, Any]) -> NWSPointMetadata:
    properties = _require_dict(payload.get("properties"), "properties")
    return NWSPointMetadata(
        grid_id=_require_str(properties.get("gridId"), "properties.gridId"),
        grid_x=_require_int(properties.get("gridX"), "properties.gridX"),
        grid_y=_require_int(properties.get("gridY"), "properties.gridY"),
        cwa=_optional_str(properties.get("cwa")),
        forecast_url=_optional_str(properties.get("forecast")),
        forecast_hourly_url=_require_str(properties.get("forecastHourly"), "properties.forecastHourly"),
        forecast_grid_data_url=_optional_str(properties.get("forecastGridData")),
        observation_stations_url=_require_str(
            properties.get("observationStations"),
            "properties.observationStations",
        ),
        county_zone_url=_optional_str(properties.get("county")),
        fire_weather_zone_url=_optional_str(properties.get("fireWeatherZone")),
        time_zone=_optional_str(properties.get("timeZone")),
    )


def extract_primary_station_id(payload: dict[str, Any]) -> Optional[str]:
    features = payload.get("features", [])
    if not isinstance(features, list) or not features:
        return None

    first = features[0]
    if not isinstance(first, dict):
        raise NWSMappingError("features[0] was not an object")

    properties = _require_dict(first.get("properties"), "features[0].properties")
    candidate = (
        _optional_str(properties.get("stationIdentifier"))
        or _optional_str(properties.get("@id"))
        or _optional_str(first.get("id"))
    )
    if candidate is None:
        return None
    return _extract_station_id(candidate)


def normalize_hourly_forecast(payload: dict[str, Any]) -> list[NWSForecastPeriod]:
    properties = _require_dict(payload.get("properties"), "properties")
    periods = properties.get("periods", [])
    if not isinstance(periods, list):
        raise NWSMappingError("properties.periods was not a list")

    normalized: list[NWSForecastPeriod] = []
    for index, item in enumerate(periods):
        if not isinstance(item, dict):
            raise NWSMappingError(f"properties.periods[{index}] was not an object")
        normalized.append(
            NWSForecastPeriod(
                period_number=_require_int(item.get("number"), f"properties.periods[{index}].number"),
                start_at=_parse_datetime(
                    item.get("startTime"),
                    f"properties.periods[{index}].startTime",
                ),
                end_at=_parse_datetime(
                    item.get("endTime"),
                    f"properties.periods[{index}].endTime",
                ),
                is_daytime=bool(item.get("isDaytime")),
                temperature=_optional_int(item.get("temperature")),
                temperature_unit=_optional_str(item.get("temperatureUnit")),
                wind_speed=_optional_str(item.get("windSpeed")),
                wind_direction=_optional_str(item.get("windDirection")),
                short_forecast=_optional_str(item.get("shortForecast")),
                detailed_forecast=_optional_str(item.get("detailedForecast")),
                probability_of_precipitation_pct=_measurement_value(item.get("probabilityOfPrecipitation")),
                relative_humidity_pct=_measurement_value(item.get("relativeHumidity")),
                dewpoint_celsius=_measurement_value(item.get("dewpoint")),
                icon_url=_optional_str(item.get("icon")),
            )
        )

    return normalized


def normalize_observations(payload: dict[str, Any]) -> list[NWSObservation]:
    features = payload.get("features", [])
    if not isinstance(features, list):
        raise NWSMappingError("features was not a list")

    normalized: list[NWSObservation] = []
    for index, item in enumerate(features):
        if not isinstance(item, dict):
            raise NWSMappingError(f"features[{index}] was not an object")

        properties = _require_dict(item.get("properties"), f"features[{index}].properties")
        station_candidate = (
            _optional_str(properties.get("station"))
            or _optional_str(properties.get("@id"))
            or _optional_str(item.get("id"))
        )
        if station_candidate is None:
            raise NWSMappingError(f"features[{index}] did not include station metadata")

        normalized.append(
            NWSObservation(
                station_id=_extract_station_id(station_candidate),
                observed_at=_parse_datetime(properties.get("timestamp"), f"features[{index}].properties.timestamp"),
                text_description=_optional_str(properties.get("textDescription")),
                icon_url=_optional_str(properties.get("icon")),
                temperature_celsius=_measurement_value(properties.get("temperature")),
                dewpoint_celsius=_measurement_value(properties.get("dewpoint")),
                relative_humidity_pct=_measurement_value(properties.get("relativeHumidity")),
                wind_speed_kmh=_measurement_value(properties.get("windSpeed")),
                wind_direction_degrees=_measurement_value(properties.get("windDirection")),
                barometric_pressure_pa=_measurement_value(properties.get("barometricPressure")),
                visibility_meters=_measurement_value(properties.get("visibility")),
            )
        )

    return normalized


def _require_dict(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise NWSMappingError(f"{field_name} was not an object")
    return value


def _require_str(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise NWSMappingError(f"{field_name} was not a non-empty string")
    return value.strip()


def _optional_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise NWSMappingError("Expected string value")
    stripped = value.strip()
    return stripped or None


def _require_int(value: Any, field_name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise NWSMappingError(f"{field_name} was not an integer") from exc


def _optional_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise NWSMappingError("Expected integer value") from exc


def _measurement_value(value: Any) -> Optional[float]:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise NWSMappingError("Expected measurement object")
    raw = value.get("value")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError) as exc:
        raise NWSMappingError("Measurement value was not numeric") from exc


def _parse_datetime(value: Any, field_name: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise NWSMappingError(f"{field_name} was not a non-empty ISO timestamp")
    candidate = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise NWSMappingError(f"{field_name} was not a valid ISO timestamp") from exc


def _extract_terminal_token(value: str) -> str:
    parsed = urlparse(value)
    path = parsed.path or value
    token = path.rstrip("/").split("/")[-1].strip()
    if not token:
        raise NWSMappingError("Could not extract identifier from station reference")
    return token.upper()


def _extract_station_id(value: str) -> str:
    parsed = urlparse(value)
    parts = [part for part in (parsed.path or value).split("/") if part]
    for index, part in enumerate(parts):
        if part == "stations" and index + 1 < len(parts):
            return parts[index + 1].strip().upper()
    return _extract_terminal_token(value)
