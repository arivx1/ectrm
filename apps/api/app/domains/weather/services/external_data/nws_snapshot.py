from __future__ import annotations

from typing import Optional

from apps.api.app.domains.weather.services.external_data.nws_client import NWSClient
from apps.api.app.domains.weather.services.external_data.nws_mapper import (
    NWSPointSnapshot,
    extract_primary_station_id,
    normalize_hourly_forecast,
    normalize_observations,
    normalize_point_metadata,
)


def fetch_nws_point_snapshot(
    *,
    latitude: float,
    longitude: float,
    client: Optional[NWSClient] = None,
    observation_limit: int = 24,
) -> NWSPointSnapshot:
    if observation_limit < 1:
        raise ValueError("observation_limit must be at least 1")

    nws_client = client or NWSClient()
    point_payload = nws_client.get_point(latitude=latitude, longitude=longitude)
    point = normalize_point_metadata(point_payload)

    forecast_payload = nws_client.get_hourly_forecast(forecast_url=point.forecast_hourly_url)
    stations_payload = nws_client.get_stations(stations_url=point.observation_stations_url)
    primary_station_id = extract_primary_station_id(stations_payload)

    observations = []
    if primary_station_id is not None:
        observations_payload = nws_client.get_station_observations(
            station_id=primary_station_id,
            limit=observation_limit,
        )
        observations = normalize_observations(observations_payload)

    return NWSPointSnapshot(
        point=point,
        primary_station_id=primary_station_id,
        forecast_periods=normalize_hourly_forecast(forecast_payload),
        observations=observations,
    )
