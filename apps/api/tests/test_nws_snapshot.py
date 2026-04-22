from __future__ import annotations

import unittest

from apps.api.app.domains.weather.services.external_data.nws_snapshot import fetch_nws_point_snapshot


class FakeNWSClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def get_point(self, *, latitude: float, longitude: float):
        self.calls.append(("get_point", (latitude, longitude)))
        return {
            "properties": {
                "gridId": "BOX",
                "gridX": 70,
                "gridY": 76,
                "forecastHourly": "https://api.weather.gov/gridpoints/BOX/70,76/forecast/hourly",
                "observationStations": "https://api.weather.gov/gridpoints/BOX/70,76/stations",
            }
        }

    def get_hourly_forecast(self, *, forecast_url: str):
        self.calls.append(("get_hourly_forecast", forecast_url))
        return {
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
                        "probabilityOfPrecipitation": {"value": 5},
                        "relativeHumidity": {"value": 42},
                        "dewpoint": {"value": 4.4},
                        "icon": "https://api.weather.gov/icons/land/day/few?size=small",
                    }
                ]
            }
        }

    def get_stations(self, *, stations_url: str):
        self.calls.append(("get_stations", stations_url))
        return {
            "features": [
                {
                    "id": "https://api.weather.gov/stations/KBOS",
                    "properties": {"stationIdentifier": "KBOS"},
                }
            ]
        }

    def get_station_observations(self, *, station_id: str, limit: int):
        self.calls.append(("get_station_observations", (station_id, limit)))
        return {
            "features": [
                {
                    "id": "https://api.weather.gov/stations/KBOS/observations/2026-03-15T12:00:00+00:00",
                    "properties": {
                        "station": "https://api.weather.gov/stations/KBOS",
                        "timestamp": "2026-03-15T12:00:00+00:00",
                        "textDescription": "Clear",
                        "icon": "https://api.weather.gov/icons/land/day/skc?size=small",
                        "temperature": {"value": 7.2},
                        "dewpoint": {"value": 0.8},
                        "relativeHumidity": {"value": 63},
                        "windSpeed": {"value": 14.8},
                        "windDirection": {"value": 320},
                        "barometricPressure": {"value": 101620},
                        "visibility": {"value": 16090},
                    },
                }
            ]
        }


class NWSSnapshotTests(unittest.TestCase):
    def test_fetch_point_snapshot_resolves_forecast_and_observations(self) -> None:
        client = FakeNWSClient()

        snapshot = fetch_nws_point_snapshot(
            latitude=42.36,
            longitude=-71.06,
            client=client,
            observation_limit=6,
        )

        self.assertEqual(snapshot.point.grid_id, "BOX")
        self.assertEqual(snapshot.primary_station_id, "KBOS")
        self.assertEqual(len(snapshot.forecast_periods), 1)
        self.assertEqual(len(snapshot.observations), 1)
        self.assertEqual(client.calls[-1], ("get_station_observations", ("KBOS", 6)))

    def test_fetch_point_snapshot_rejects_invalid_limit(self) -> None:
        with self.assertRaisesRegex(ValueError, "observation_limit"):
            fetch_nws_point_snapshot(
                latitude=42.36,
                longitude=-71.06,
                client=FakeNWSClient(),
                observation_limit=0,
            )


if __name__ == "__main__":
    unittest.main()
