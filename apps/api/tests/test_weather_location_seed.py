from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.weather.services.seed_weather_locations import seed_starter_weather_locations
from apps.api.app.models.event import Base
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.weather_location import WeatherLocation


class WeatherLocationSeedTests(unittest.TestCase):
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
            session.query(WeatherLocation).delete()
            session.query(ReferenceLocation).delete()
            session.commit()

    def test_seed_creates_starter_locations_and_links_available_reference_locations(self) -> None:
        now = datetime(2026, 3, 17, 8, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    ReferenceLocation(
                        code="HENRY_HUB",
                        name="Henry Hub",
                        location_type="HUB",
                        market="NYMEX",
                        country_code="US",
                        region="Gulf Coast",
                        timezone="America/Chicago",
                        description="Gas hub",
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="test-user",
                        updated_at=now,
                        updated_by="test-user",
                        version=1,
                    ),
                    ReferenceLocation(
                        code="PJM_WEST",
                        name="PJM West",
                        location_type="HUB",
                        market="PJM",
                        country_code="US",
                        region="Mid-Atlantic",
                        timezone="America/New_York",
                        description="Power hub",
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="test-user",
                        updated_at=now,
                        updated_by="test-user",
                        version=1,
                    ),
                ]
            )
            session.commit()

            summary = seed_starter_weather_locations(
                session,
                requested_by="test-user",
                replace_existing=True,
            )
            locations = session.query(WeatherLocation).order_by(WeatherLocation.code.asc()).all()
            henry_hub = session.get(WeatherLocation, "HENRY_HUB")
            pjm_west = session.get(WeatherLocation, "PJM_WEST")
            bos_load = session.get(WeatherLocation, "BOS_LOAD")

        self.assertEqual(summary.total_rows, 6)
        self.assertEqual(summary.created_count, 6)
        self.assertEqual(summary.updated_count, 0)
        self.assertEqual(summary.skipped_count, 0)
        self.assertEqual(summary.missing_reference_codes, [])
        self.assertEqual(len(locations), 6)
        self.assertEqual(henry_hub.reference_location_code, "HENRY_HUB")
        self.assertEqual(pjm_west.reference_location_code, "PJM_WEST")
        self.assertEqual(bos_load.source_provider, "NWS")

    def test_seed_updates_existing_rows_and_preserves_synced_nws_metadata(self) -> None:
        now = datetime(2026, 3, 17, 9, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                WeatherLocation(
                    code="PJM_WEST",
                    name="Old PJM West",
                    reference_location_code=None,
                    latitude=39.0,
                    longitude=-80.0,
                    timezone="America/Chicago",
                    source_provider="NWS",
                    cwa="PBZ",
                    grid_id="PBZ",
                    grid_x=10,
                    grid_y=20,
                    station_id="KPIT",
                    description="Old description",
                    is_active=False,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

            summary = seed_starter_weather_locations(
                session,
                requested_by="test-user",
                replace_existing=True,
            )
            record = session.get(WeatherLocation, "PJM_WEST")

        self.assertEqual(summary.created_count, 5)
        self.assertEqual(summary.updated_count, 1)
        self.assertEqual(summary.skipped_count, 0)
        self.assertEqual(summary.missing_reference_codes, ["HENRY_HUB", "PJM_WEST"])
        self.assertEqual(record.name, "PJM West Weather Point")
        self.assertEqual(record.latitude, 40.4406)
        self.assertEqual(record.longitude, -79.9959)
        self.assertEqual(record.timezone, "America/New_York")
        self.assertTrue(record.is_active)
        self.assertIsNone(record.reference_location_code)
        self.assertEqual(record.cwa, "PBZ")
        self.assertEqual(record.grid_id, "PBZ")
        self.assertEqual(record.station_id, "KPIT")
        self.assertEqual(record.version, 2)

    def test_seed_can_preserve_existing_rows(self) -> None:
        now = datetime(2026, 3, 17, 10, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                WeatherLocation(
                    code="BOS_LOAD",
                    name="Custom Boston",
                    reference_location_code=None,
                    latitude=41.0,
                    longitude=-70.0,
                    timezone="America/New_York",
                    source_provider="NWS",
                    cwa="BOX",
                    grid_id="BOX",
                    grid_x=70,
                    grid_y=76,
                    station_id="KBOS",
                    description="Do not overwrite",
                    is_active=False,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

            summary = seed_starter_weather_locations(
                session,
                requested_by="test-user",
                replace_existing=False,
            )
            record = session.get(WeatherLocation, "BOS_LOAD")

        self.assertEqual(summary.created_count, 5)
        self.assertEqual(summary.updated_count, 0)
        self.assertEqual(summary.skipped_count, 1)
        self.assertEqual(record.name, "Custom Boston")
        self.assertEqual(record.latitude, 41.0)
        self.assertFalse(record.is_active)
        self.assertEqual(record.station_id, "KBOS")


if __name__ == "__main__":
    unittest.main()
