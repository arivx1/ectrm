from __future__ import annotations

import unittest
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.ercot_client import ERCOTClientError
from apps.api.app.domains.reference_data.services.external_data.ercot_sync import sync_ercot_series
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class FakeERCOTClient:
    def __init__(self, snapshot: dict, raises: Optional[Exception] = None) -> None:
        self.snapshot = snapshot
        self.raises = raises
        self.call_count = 0

    def fetch_real_time_hub_prices(self):
        self.call_count += 1
        if self.raises is not None:
            raise self.raises
        return self.snapshot


class ErcotSyncTests(unittest.TestCase):
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
            session.query(PriceIndexObservation).delete()
            session.query(ExternalSeriesObservation).delete()
            session.query(ReferencePriceIndexSource).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ExternalSeriesDefinition).delete()
            session.query(ExternalDataRun).delete()
            session.commit()

    def _seed_definition(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ExternalSeriesDefinition(
                    code="ERCOT_HB_HOUSTON_RT15M",
                    provider="ERCOT",
                    dataset_code=None,
                    series_id="HB_HOUSTON",
                    name="ERCOT Houston Real-Time Hub SPP",
                    category="power",
                    frequency="daily",
                    unit_code="USD_MWH",
                    source_url="https://www.ercot.com/content/cdr/html/real_time_spp.html",
                    description="Power test series",
                    query_params={"hub": "HB_HOUSTON"},
                    transform_rule="field:price",
                    is_active=True,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def _seed_price_index_source(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferencePriceIndex(
                    code="ERCOT_HB_HOUSTON_RT15M",
                    name="ERCOT Houston Real-Time Hub SPP",
                    commodity_code="POWER",
                    currency_code="USD",
                    unit_code="MWH",
                    provider="ERCOT",
                    market="ERCOT",
                    location_code=None,
                    calendar_code="ERCOT",
                    description="Power price-index test row",
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
            session.add(
                ReferencePriceIndexSource(
                    price_index_code="ERCOT_HB_HOUSTON_RT15M",
                    provider="ERCOT",
                    dataset_code="REAL_TIME_SPP",
                    series_id="HB_HOUSTON",
                    frequency="daily",
                    source_unit="MWH",
                    source_currency_code="USD",
                    transform_rule=None,
                    is_active=True,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def test_sync_creates_run_and_observations(self) -> None:
        self._seed_definition()
        client = FakeERCOTClient(
            {
                "operating_day": "2026-04-05",
                "interval_ending": "1930",
                "last_updated": "Apr 05, 2026 19:32",
                "prices": {
                    "HB_HOUSTON": "23.95",
                    "HB_NORTH": "24.10",
                },
            }
        )

        with self.SessionLocal() as session:
            run = sync_ercot_series(session, client=client, requested_by="spec-test")
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].series_code, "ERCOT_HB_HOUSTON_RT15M")
        self.assertEqual(str(observations[0].value), "23.950000")
        self.assertEqual(observations[0].source_revision, "2026-04-05:IE1930")
        self.assertEqual(client.call_count, 1)

    def test_sync_creates_price_index_observations_from_source_mapping(self) -> None:
        self._seed_price_index_source()
        client = FakeERCOTClient(
            {
                "operating_day": "2026-04-05",
                "interval_ending": "1930",
                "last_updated": "Apr 05, 2026 19:32",
                "prices": {
                    "HB_HOUSTON": "23.95",
                    "HB_NORTH": "24.10",
                },
            }
        )

        with self.SessionLocal() as session:
            run = sync_ercot_series(session, client=client, requested_by="spec-test")
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].price_index_code, "ERCOT_HB_HOUSTON_RT15M")
        self.assertEqual(str(observations[0].value), "23.950000")
        self.assertEqual(observations[0].unit_code, "MWH")
        self.assertEqual(observations[0].currency_code, "USD")
        self.assertEqual(observations[0].source_frequency, "15MIN")
        self.assertEqual(observations[0].source_revision, "2026-04-05:IE1930")
        self.assertEqual(client.call_count, 1)

    def test_sync_is_idempotent_for_unchanged_rows(self) -> None:
        self._seed_definition()
        snapshot = {
            "operating_day": "2026-04-05",
            "interval_ending": "1930",
            "last_updated": "Apr 05, 2026 19:32",
            "prices": {
                "HB_HOUSTON": "23.95",
            },
        }

        with self.SessionLocal() as session:
            first_run = sync_ercot_series(session, client=FakeERCOTClient(snapshot))

        with self.SessionLocal() as session:
            second_run = sync_ercot_series(session, client=FakeERCOTClient(snapshot))
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(first_run.status, "SUCCEEDED")
        self.assertEqual(second_run.status, "SUCCEEDED")
        self.assertEqual(second_run.observation_count, 0)
        self.assertEqual(len(observations), 1)

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_definition()

        with self.SessionLocal() as session:
            run = sync_ercot_series(
                session,
                client=FakeERCOTClient({}, raises=ERCOTClientError("boom")),
            )
            observations = session.query(ExternalSeriesObservation).all()
            price_observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)
        self.assertEqual(len(price_observations), 0)


if __name__ == "__main__":
    unittest.main()
