from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.weather_forecast_period import WeatherForecastPeriod
from apps.api.app.models.weather_location import WeatherLocation
from apps.api.app.models.weather_observation import WeatherObservation
from apps.api.app.routes.weather import get_nws_sync_status


class WeatherSyncStatusApiTests(unittest.TestCase):
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

    def _seed_location(self, *, code: str, name: str, active: bool = True) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                WeatherLocation(
                    code=code,
                    name=name,
                    reference_location_code=None,
                    latitude=42.0,
                    longitude=-71.0,
                    timezone="America/New_York",
                    source_provider="NWS",
                    cwa=None,
                    grid_id=None,
                    grid_x=None,
                    grid_y=None,
                    station_id=f"K{code[:3]}",
                    description="status test",
                    is_active=active,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def _seed_run(
        self,
        *,
        run_id: int,
        status: str,
        started_at: datetime,
        finished_at: Optional[datetime],
        error_summary: Optional[str] = None,
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                ExternalDataRun(
                    id=run_id,
                    provider="NWS",
                    job_name="sync_nws_weather_data",
                    status=status,
                    started_at=started_at,
                    finished_at=finished_at,
                    requested_by="test-user",
                    series_count=2,
                    observation_count=12,
                    error_summary=error_summary,
                    created_at=started_at,
                )
            )
            session.commit()

    def _seed_forecast(self, *, location_code: str, downloaded_at: datetime, run_id: int) -> None:
        with self.SessionLocal() as session:
            session.add(
                WeatherForecastPeriod(
                    weather_location_code=location_code,
                    source_provider="NWS",
                    period_number=1,
                    start_at=downloaded_at,
                    end_at=downloaded_at + timedelta(hours=1),
                    is_daytime=True,
                    temperature=45.0,
                    temperature_unit="F",
                    wind_speed="10 mph",
                    wind_direction="NW",
                    short_forecast="Cloudy",
                    detailed_forecast="Cloudy",
                    probability_of_precipitation_pct=10.0,
                    relative_humidity_pct=60.0,
                    dewpoint_celsius=None,
                    icon_url=None,
                    downloaded_at=downloaded_at,
                    run_id=run_id,
                    raw_payload={"number": 1},
                    created_at=downloaded_at,
                    updated_at=downloaded_at,
                )
            )
            session.commit()

    def _seed_observation(self, *, location_code: str, observed_at: datetime, downloaded_at: datetime, run_id: int) -> None:
        with self.SessionLocal() as session:
            session.add(
                WeatherObservation(
                    weather_location_code=location_code,
                    source_provider="NWS",
                    station_id=f"K{location_code[:3]}",
                    observed_at=observed_at,
                    text_description="Clear",
                    icon_url=None,
                    temperature_celsius=7.0,
                    dewpoint_celsius=None,
                    relative_humidity_pct=None,
                    wind_speed_kmh=None,
                    wind_direction_degrees=None,
                    barometric_pressure_pa=None,
                    visibility_meters=None,
                    downloaded_at=downloaded_at,
                    run_id=run_id,
                    raw_payload={"station": location_code},
                    created_at=downloaded_at,
                    updated_at=downloaded_at,
                )
            )
            session.commit()

    def test_sync_status_reports_location_freshness_and_latest_runs(self) -> None:
        now = datetime.now(timezone.utc)
        self._seed_location(code="BOS_LOAD", name="Boston Load Center")
        self._seed_location(code="ERCOT_HOUSTON", name="ERCOT Houston Load Center")
        self._seed_run(
            run_id=1,
            status="SUCCEEDED",
            started_at=now - timedelta(hours=2),
            finished_at=now - timedelta(hours=2) + timedelta(minutes=5),
        )
        self._seed_forecast(location_code="BOS_LOAD", downloaded_at=now - timedelta(hours=2), run_id=1)
        self._seed_observation(
            location_code="BOS_LOAD",
            observed_at=now - timedelta(hours=1),
            downloaded_at=now - timedelta(minutes=55),
            run_id=1,
        )
        self._seed_forecast(location_code="ERCOT_HOUSTON", downloaded_at=now - timedelta(hours=10), run_id=1)

        with self.SessionLocal() as session:
            payload = get_nws_sync_status(db=session)

        self.assertEqual(payload.provider, "NWS")
        self.assertEqual(payload.latest_run_status, "SUCCEEDED")
        self.assertEqual(payload.active_location_count, 2)
        self.assertEqual(payload.healthy_location_count, 1)
        self.assertEqual(payload.stale_location_count, 0)
        self.assertEqual(payload.missing_location_count, 1)
        self.assertEqual(payload.health_status, "degraded")
        self.assertIsNotNone(payload.latest_run)
        self.assertEqual(payload.latest_run.id, 1)
        self.assertEqual(payload.locations[0].code, "BOS_LOAD")
        self.assertEqual(payload.locations[0].health_status, "healthy")
        self.assertEqual(payload.locations[1].code, "ERCOT_HOUSTON")
        self.assertEqual(payload.locations[1].health_status, "missing")

    def test_sync_status_marks_failed_latest_run(self) -> None:
        now = datetime.now(timezone.utc)
        self._seed_location(code="BOS_LOAD", name="Boston Load Center")
        self._seed_run(
            run_id=1,
            status="SUCCEEDED",
            started_at=now - timedelta(hours=2),
            finished_at=now - timedelta(hours=2) + timedelta(minutes=5),
        )
        self._seed_run(
            run_id=2,
            status="FAILED",
            started_at=now - timedelta(minutes=30),
            finished_at=now - timedelta(minutes=29),
            error_summary="upstream timeout",
        )
        self._seed_forecast(location_code="BOS_LOAD", downloaded_at=now - timedelta(hours=1), run_id=1)
        self._seed_observation(
            location_code="BOS_LOAD",
            observed_at=now - timedelta(minutes=30),
            downloaded_at=now - timedelta(minutes=25),
            run_id=1,
        )

        with self.SessionLocal() as session:
            payload = get_nws_sync_status(db=session)

        self.assertEqual(payload.health_status, "failed")
        self.assertEqual(payload.error_summary, "upstream timeout")
        self.assertEqual(payload.latest_run.id, 2)


if __name__ == "__main__":
    unittest.main()
