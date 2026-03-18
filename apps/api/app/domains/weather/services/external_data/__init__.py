from __future__ import annotations

from apps.api.app.domains.weather.services.external_data.nws_client import NWSClient
from apps.api.app.domains.weather.services.external_data.nws_client import NWSClientError
from apps.api.app.domains.weather.services.external_data.nws_mapper import (
    NWSForecastPeriod,
    NWSMappingError,
    NWSObservation,
    NWSPointMetadata,
    NWSPointSnapshot,
    extract_primary_station_id,
    normalize_hourly_forecast,
    normalize_observations,
    normalize_point_metadata,
)
from apps.api.app.domains.weather.services.external_data.nws_snapshot import fetch_nws_point_snapshot
from apps.api.app.domains.weather.services.external_data.nws_sync import NWSSyncError
from apps.api.app.domains.weather.services.external_data.nws_sync import sync_nws_weather_locations

__all__ = [
    "NWSClient",
    "NWSClientError",
    "NWSForecastPeriod",
    "NWSMappingError",
    "NWSObservation",
    "NWSPointMetadata",
    "NWSPointSnapshot",
    "NWSSyncError",
    "extract_primary_station_id",
    "fetch_nws_point_snapshot",
    "normalize_hourly_forecast",
    "normalize_observations",
    "normalize_point_metadata",
    "sync_nws_weather_locations",
]
