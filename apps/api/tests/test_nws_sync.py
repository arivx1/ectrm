from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.weather.services.external_data.nws_client import NWSClientError
from apps.api.app.domains.weather.services.external_data.nws_sync import sync_nws_weather_locations
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.weather_forecast_period import WeatherForecastPeriod
from apps.api.app.models.weather_location import WeatherLocation
from apps.api.app.models.weather_observation import WeatherObservation


class FakeNWSClient:
    def __init__(self, *, raises: Exception | None = None) -> None:
        self.raises = raises
        self.calls: list[tuple[str, object]] = []

    def get_point(self, *, latitude: float, longitude: float):
        self.calls.append(("get_point", (latitude, longitude)))
        if self.raises is not None:
            raise self.raises
        return {
            "properties": {
                "gridId": "BOX",
                "gridX": 70,
                "gridY": 76,
                "cwa": "BOX",
                "forecastHourly": "https://api.weather.gov/gridpoints/BOX/70,76/forecast/hourly",
                "observationStations": "https://api.weather.gov/gridpoints/BOX/70,76/stations",
                "timeZone": "America/New_York",
            }
        }

    def get_hourly_forecast(self, *, forecast_url: str):
        self.calls.append(("get_hourly_forecast", forecast_url))
        return {
            "properties": {
                "periods": [
                    {
                        "number": 1,
                        "startTime": "2026-03-16T08:00:00-04:00",
                        "endTime": "2026-03-16T09:00:00-04:00",
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
                    "id": "https://api.weather.gov/stations/KBOS/observations/2026-03-16T12:00:00+00:00",
                    "properties": {
                        "station": "https://api.weather.gov/stations/KBOS",
                        "timestamp": "2026-03-16T12:00:00+00:00",
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


class NWSSyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            session.query(WeatherObservation).delete()
            session.query(WeatherForecastPeriod).delete()
            session.query(WeatherLocation).delete()
            session.query(ExternalDataRun).delete()
            session.commit()

    def _seed_location(self, code: str = "BOS") -> None:
        now = datetime(2026, 3, 16, 9, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                WeatherLocation(
                    code=code,
                    name="Boston Load Zone",
                    reference_location_code=None,
                    latitude=42.36,
                    longitude=-71.06,
                    timezone=None,
                    source_provider="NWS",
                    cwa=None,
                    grid_id=None,
                    grid_x=None,
                    grid_y=None,
                    station_id=None,
                    description="Test weather point",
                    is_active=True,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def test_sync_persists_forecasts_and_observations(self) -> None:
        self._seed_location()
        client = FakeNWSClient()

        with self.SessionLocal() as session:
            run = sync_nws_weather_locations(
                session,
                client=client,
                requested_by="test-user",
                observation_limit=6,
            )
            location = session.get(WeatherLocation, "BOS")
            forecasts = session.query(WeatherForecastPeriod).all()
            observations = session.query(WeatherObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.provider, "NWS")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 2)
        self.assertEqual(location.grid_id, "BOX")
        self.assertEqual(location.station_id, "KBOS")
        self.assertEqual(location.timezone, "America/New_York")
        self.assertEqual(len(forecasts), 1)
        self.assertEqual(forecasts[0].weather_location_code, "BOS")
        self.assertEqual(forecasts[0].temperature, 48)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].station_id, "KBOS")
        self.assertEqual(client.calls[-1], ("get_station_observations", ("KBOS", 6)))

    def test_sync_is_idempotent_for_unchanged_payloads(self) -> None:
        self._seed_location()
        client = FakeNWSClient()

        with self.SessionLocal() as session:
            first_run = sync_nws_weather_locations(session, client=client, requested_by="test-user")

        with self.SessionLocal() as session:
            second_run = sync_nws_weather_locations(session, client=FakeNWSClient(), requested_by="test-user")
            forecasts = session.query(WeatherForecastPeriod).all()
            observations = session.query(WeatherObservation).all()

        self.assertEqual(first_run.status, "SUCCEEDED")
        self.assertEqual(second_run.status, "SUCCEEDED")
        self.assertEqual(second_run.observation_count, 0)
        self.assertEqual(len(forecasts), 1)
        self.assertEqual(len(observations), 1)

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_location()

        with self.SessionLocal() as session:
            run = sync_nws_weather_locations(
                session,
                client=FakeNWSClient(raises=NWSClientError("boom")),
                requested_by="test-user",
            )

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")


if __name__ == "__main__":
    unittest.main()
