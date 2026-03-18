from __future__ import annotations

import unittest
from datetime import datetime
from datetime import timezone

from apps.api.app.domains.weather.services.external_data.nws_mapper import (
    NWSMappingError,
    extract_primary_station_id,
    normalize_hourly_forecast,
    normalize_observations,
    normalize_point_metadata,
)


class NWSMapperTests(unittest.TestCase):
    def test_normalize_point_metadata(self) -> None:
        payload = {
            "properties": {
                "gridId": "BOX",
                "gridX": 70,
                "gridY": 76,
                "cwa": "BOX",
                "forecast": "https://api.weather.gov/gridpoints/BOX/70,76/forecast",
                "forecastHourly": "https://api.weather.gov/gridpoints/BOX/70,76/forecast/hourly",
                "forecastGridData": "https://api.weather.gov/gridpoints/BOX/70,76",
                "observationStations": "https://api.weather.gov/gridpoints/BOX/70,76/stations",
                "county": "https://api.weather.gov/zones/county/MAC025",
                "fireWeatherZone": "https://api.weather.gov/zones/fire/MAZ007",
                "timeZone": "America/New_York",
            }
        }

        metadata = normalize_point_metadata(payload)

        self.assertEqual(metadata.grid_id, "BOX")
        self.assertEqual(metadata.grid_x, 70)
        self.assertEqual(metadata.grid_y, 76)
        self.assertEqual(metadata.forecast_hourly_url, "https://api.weather.gov/gridpoints/BOX/70,76/forecast/hourly")
        self.assertEqual(metadata.observation_stations_url, "https://api.weather.gov/gridpoints/BOX/70,76/stations")

    def test_normalize_hourly_forecast(self) -> None:
        payload = {
            "properties": {
                "periods": [
                    {
                        "number": 1,
                        "startTime": "2026-03-15T08:00:00-04:00",
                        "endTime": "2026-03-15T09:00:00-04:00",
                        "isDaytime": True,
                        "temperature": 48,
                        "temperatureUnit": "F",
                        "windSpeed": "8 mph",
                        "windDirection": "NW",
                        "shortForecast": "Mostly Sunny",
                        "detailedForecast": "Mostly sunny with light northwest wind.",
                        "probabilityOfPrecipitation": {"unitCode": "wmoUnit:percent", "value": 5},
                        "relativeHumidity": {"unitCode": "wmoUnit:percent", "value": 42},
                        "dewpoint": {"unitCode": "wmoUnit:degC", "value": 4.4},
                        "icon": "https://api.weather.gov/icons/land/day/few?size=small",
                    }
                ]
            }
        }

        periods = normalize_hourly_forecast(payload)

        self.assertEqual(len(periods), 1)
        period = periods[0]
        self.assertEqual(period.period_number, 1)
        self.assertEqual(period.start_at, datetime.fromisoformat("2026-03-15T08:00:00-04:00"))
        self.assertEqual(period.temperature, 48)
        self.assertEqual(period.temperature_unit, "F")
        self.assertEqual(period.probability_of_precipitation_pct, 5.0)
        self.assertEqual(period.relative_humidity_pct, 42.0)
        self.assertEqual(period.dewpoint_celsius, 4.4)

    def test_extract_primary_station_and_normalize_observations(self) -> None:
        stations_payload = {
            "features": [
                {
                    "id": "https://api.weather.gov/stations/KBOS",
                    "properties": {
                        "stationIdentifier": "KBOS",
                    },
                }
            ]
        }
        observations_payload = {
            "features": [
                {
                    "id": "https://api.weather.gov/stations/KBOS/observations/2026-03-15T12:00:00+00:00",
                    "properties": {
                        "station": "https://api.weather.gov/stations/KBOS",
                        "timestamp": "2026-03-15T12:00:00+00:00",
                        "textDescription": "Clear",
                        "icon": "https://api.weather.gov/icons/land/day/skc?size=small",
                        "temperature": {"unitCode": "wmoUnit:degC", "value": 7.2},
                        "dewpoint": {"unitCode": "wmoUnit:degC", "value": 0.8},
                        "relativeHumidity": {"unitCode": "wmoUnit:percent", "value": 63},
                        "windSpeed": {"unitCode": "wmoUnit:km_h-1", "value": 14.8},
                        "windDirection": {"unitCode": "wmoUnit:degree_(angle)", "value": 320},
                        "barometricPressure": {"unitCode": "wmoUnit:Pa", "value": 101620},
                        "visibility": {"unitCode": "wmoUnit:m", "value": 16090},
                    },
                }
            ]
        }

        primary_station_id = extract_primary_station_id(stations_payload)
        observations = normalize_observations(observations_payload)

        self.assertEqual(primary_station_id, "KBOS")
        self.assertEqual(len(observations), 1)
        observation = observations[0]
        self.assertEqual(observation.station_id, "KBOS")
        self.assertEqual(observation.observed_at, datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc))
        self.assertEqual(observation.temperature_celsius, 7.2)
        self.assertEqual(observation.wind_speed_kmh, 14.8)
        self.assertEqual(observation.visibility_meters, 16090.0)

    def test_normalize_observations_falls_back_to_station_id_from_feature_id(self) -> None:
        observations_payload = {
            "features": [
                {
                    "id": "https://api.weather.gov/stations/KJFK/observations/2026-03-15T12:00:00+00:00",
                    "properties": {
                        "timestamp": "2026-03-15T12:00:00+00:00",
                        "temperature": {"value": 6.5},
                    },
                }
            ]
        }

        observations = normalize_observations(observations_payload)

        self.assertEqual(observations[0].station_id, "KJFK")

    def test_normalize_point_metadata_rejects_missing_payload(self) -> None:
        with self.assertRaisesRegex(NWSMappingError, "properties"):
            normalize_point_metadata({})


if __name__ == "__main__":
    unittest.main()
