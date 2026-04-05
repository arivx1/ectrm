from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.weather_forecast_period import WeatherForecastPeriod
from apps.api.app.models.weather_location import WeatherLocation
from apps.api.app.models.weather_observation import WeatherObservation
from apps.api.app.routes.weather import (
    create_weather_location,
    list_weather_forecast_periods,
    list_weather_locations,
    list_weather_observations,
    trigger_nws_weather_sync,
)
from apps.api.app.schemas.weather import NWSSyncRequest, WeatherLocationCreate


class WeatherDataApiTests(unittest.TestCase):
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
            session.query(ReferenceLocation).delete()
            session.query(ExternalDataRun).delete()
            session.commit()

    def _seed_reference_location(self) -> None:
        now = datetime(2026, 3, 16, 8, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferenceLocation(
                    code="BOS_LOAD",
                    name="Boston Load Zone",
                    location_kind="POINT",
                    location_type="ZONE",
                    market="ISO_NE",
                    city="Boston",
                    subdivision_code="US-MA",
                    country_code="US",
                    continent_code="NA",
                    latitude=42.3601,
                    longitude=-71.0589,
                    region="NORTHEAST",
                    timezone="America/New_York",
                    description="Test",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def _seed_weather_location_with_data(self) -> None:
        now = datetime(2026, 3, 16, 9, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                WeatherLocation(
                    code="BOS",
                    name="Boston Load Zone",
                    reference_location_code=None,
                    latitude=42.36,
                    longitude=-71.06,
                    timezone="America/New_York",
                    source_provider="NWS",
                    cwa="BOX",
                    grid_id="BOX",
                    grid_x=70,
                    grid_y=76,
                    station_id="KBOS",
                    description="Test point",
                    is_active=True,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.add(
                ExternalDataRun(
                    id=1,
                    provider="NWS",
                    job_name="sync_nws_weather_data",
                    status="SUCCEEDED",
                    started_at=now,
                    finished_at=now,
                    requested_by="test-user",
                    series_count=1,
                    observation_count=2,
                    error_summary=None,
                    created_at=now,
                )
            )
            session.add(
                WeatherForecastPeriod(
                    weather_location_code="BOS",
                    source_provider="NWS",
                    period_number=1,
                    start_at=datetime(2026, 3, 16, 12, 0, tzinfo=timezone.utc),
                    end_at=datetime(2026, 3, 16, 13, 0, tzinfo=timezone.utc),
                    is_daytime=True,
                    temperature=48,
                    temperature_unit="F",
                    wind_speed="8 mph",
                    wind_direction="NW",
                    short_forecast="Mostly Sunny",
                    detailed_forecast="Mostly sunny with light northwest wind.",
                    probability_of_precipitation_pct=5.0,
                    relative_humidity_pct=42.0,
                    dewpoint_celsius=4.4,
                    icon_url="https://api.weather.gov/icons/land/day/few?size=small",
                    downloaded_at=now,
                    run_id=1,
                    raw_payload={"number": 1},
                    created_at=now,
                    updated_at=now,
                )
            )
            session.add(
                WeatherObservation(
                    weather_location_code="BOS",
                    source_provider="NWS",
                    station_id="KBOS",
                    observed_at=datetime(2026, 3, 16, 12, 0, tzinfo=timezone.utc),
                    text_description="Clear",
                    icon_url="https://api.weather.gov/icons/land/day/skc?size=small",
                    temperature_celsius=7.2,
                    dewpoint_celsius=0.8,
                    relative_humidity_pct=63.0,
                    wind_speed_kmh=14.8,
                    wind_direction_degrees=320.0,
                    barometric_pressure_pa=101620.0,
                    visibility_meters=16090.0,
                    downloaded_at=now,
                    run_id=1,
                    raw_payload={"timestamp": "2026-03-16T12:00:00+00:00"},
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

    def test_create_weather_location_and_list_it(self) -> None:
        self._seed_reference_location()
        with self.SessionLocal() as session:
            created = create_weather_location(
                WeatherLocationCreate(
                    code="bos",
                    name="Boston Load Zone",
                    latitude=42.36,
                    longitude=-71.06,
                    reference_location_code="bos_load",
                    timezone="America/New_York",
                    description="Primary demand zone weather point",
                    created_by="test-user",
                ),
                db=session,
            )
            rows = list_weather_locations(q="bos", is_active=True, limit=50, offset=0, db=session)

        self.assertEqual(created.code, "BOS")
        self.assertEqual(created.reference_location_code, "BOS_LOAD")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].code, "BOS")

    def test_list_weather_forecast_periods_and_observations(self) -> None:
        self._seed_weather_location_with_data()
        with patch("apps.api.app.routes.weather.datetime") as datetime_mock:
            datetime_mock.now.return_value = datetime(2026, 3, 16, 12, 30, tzinfo=timezone.utc)
            with self.SessionLocal() as session:
                forecasts = list_weather_forecast_periods("bos", limit=24, db=session)
                observations = list_weather_observations("bos", limit=24, db=session)

        self.assertEqual(len(forecasts), 1)
        self.assertEqual(forecasts[0].weather_location_code, "BOS")
        self.assertEqual(forecasts[0].temperature, 48.0)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].station_id, "KBOS")

    def test_list_weather_forecast_periods_excludes_expired_rows(self) -> None:
        self._seed_weather_location_with_data()
        with self.SessionLocal() as session:
            session.add(
                WeatherForecastPeriod(
                    weather_location_code="BOS",
                    source_provider="NWS",
                    period_number=0,
                    start_at=datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc),
                    end_at=datetime(2026, 3, 15, 13, 0, tzinfo=timezone.utc),
                    is_daytime=True,
                    temperature=41,
                    temperature_unit="F",
                    wind_speed="6 mph",
                    wind_direction="NW",
                    short_forecast="Clear",
                    detailed_forecast="Clear and quiet.",
                    probability_of_precipitation_pct=0.0,
                    relative_humidity_pct=51.0,
                    dewpoint_celsius=1.2,
                    icon_url="https://api.weather.gov/icons/land/day/skc?size=small",
                    downloaded_at=datetime(2026, 3, 15, 9, 0, tzinfo=timezone.utc),
                    run_id=1,
                    raw_payload={"number": 0},
                    created_at=datetime(2026, 3, 15, 9, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 15, 9, 0, tzinfo=timezone.utc),
                )
            )
            session.add(
                WeatherForecastPeriod(
                    weather_location_code="BOS",
                    source_provider="NWS",
                    period_number=2,
                    start_at=datetime(2026, 3, 16, 13, 0, tzinfo=timezone.utc),
                    end_at=datetime(2026, 3, 16, 14, 0, tzinfo=timezone.utc),
                    is_daytime=True,
                    temperature=50,
                    temperature_unit="F",
                    wind_speed="9 mph",
                    wind_direction="NW",
                    short_forecast="Sunny",
                    detailed_forecast="Sunny with a light breeze.",
                    probability_of_precipitation_pct=0.0,
                    relative_humidity_pct=39.0,
                    dewpoint_celsius=5.0,
                    icon_url="https://api.weather.gov/icons/land/day/few?size=small",
                    downloaded_at=datetime(2026, 3, 16, 9, 0, tzinfo=timezone.utc),
                    run_id=1,
                    raw_payload={"number": 2},
                    created_at=datetime(2026, 3, 16, 9, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 16, 9, 0, tzinfo=timezone.utc),
                )
            )
            session.commit()

        with patch("apps.api.app.routes.weather.datetime") as datetime_mock:
            datetime_mock.now.return_value = datetime(2026, 3, 16, 12, 30, tzinfo=timezone.utc)
            with self.SessionLocal() as session:
                forecasts = list_weather_forecast_periods("bos", limit=24, db=session)

        self.assertEqual([forecast.period_number for forecast in forecasts], [1, 2])

    def test_trigger_nws_sync_returns_external_data_run_payload(self) -> None:
        self._seed_weather_location_with_data()
        with self.SessionLocal() as session:
            expected_run = session.get(ExternalDataRun, 1)
            with patch(
                "apps.api.app.routes.weather.sync_nws_weather_locations",
                return_value=expected_run,
            ) as sync_mock:
                payload = trigger_nws_weather_sync(
                    NWSSyncRequest(
                        location_codes=["bos"],
                        observation_limit=12,
                        requested_by="test-user",
                    ),
                    db=session,
                )

        self.assertEqual(payload.provider, "NWS")
        self.assertEqual(payload.series_count, 1)
        sync_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
