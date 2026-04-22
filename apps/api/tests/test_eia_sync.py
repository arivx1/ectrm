from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.eia_client import EIAClientError
from apps.api.app.domains.reference_data.services.external_data.eia_sync import sync_eia_series
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class FakeEIAClient:
    def __init__(self, payload_by_series: dict[str, dict], raises: Optional[Exception] = None) -> None:
        self.payload_by_series = payload_by_series
        self.raises = raises
        self.calls: list[dict[str, object]] = []

    def fetch_series(self, **kwargs):
        self.calls.append(kwargs)
        if self.raises is not None:
            raise self.raises
        return self.payload_by_series[kwargs["series_id"]]


class EiaSyncTests(unittest.TestCase):
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
            session.query(ReferencePriceIndexSource).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ExternalDataRun).delete()
            session.commit()

    def _seed_price_index(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferencePriceIndex(
                    code="ULSD_US_RETAIL",
                    name="US Retail Diesel",
                    commodity_code="ULSD",
                    currency_code="USD",
                    unit_code="GAL",
                    provider="EIA",
                    market="US",
                    location_code=None,
                    calendar_code=None,
                    description="Test price index",
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
                    price_index_code="ULSD_US_RETAIL",
                    provider="EIA",
                    dataset_code="PET",
                    series_id="PET.EMD_EPD2D_PTE_NUS_DPG.W",
                    frequency="weekly",
                    source_unit="GAL",
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
        self._seed_price_index()
        client = FakeEIAClient(
            {
                "PET.EMD_EPD2D_PTE_NUS_DPG.W": {
                    "response": {
                        "frequency": "weekly",
                        "data": [
                            {"period": "2026-03-02", "value": "3.455", "updated": "2026-03-04T17:00:00Z"},
                            {"period": "2026-02-23", "value": "3.400", "updated": "2026-03-04T17:00:00Z"},
                        ],
                    }
                }
            }
        )

        with self.SessionLocal() as session:
            run = sync_eia_series(
                session,
                client=client,
                requested_by="spec-test",
                lookback_days=14,
                today=date(2026, 3, 10),
            )
            observations = (
                session.query(PriceIndexObservation)
                .order_by(PriceIndexObservation.observation_date.desc())
                .all()
            )

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 2)
        self.assertEqual(len(observations), 2)
        self.assertEqual(observations[0].price_index_code, "ULSD_US_RETAIL")
        self.assertEqual(observations[0].value, Decimal("3.455"))
        self.assertEqual(client.calls[0]["frequency"], "weekly")
        self.assertEqual(client.calls[0]["start"], "2026-02-24")

    def test_sync_is_idempotent_for_unchanged_rows(self) -> None:
        self._seed_price_index()
        payload = {
            "response": {
                "frequency": "weekly",
                "data": [
                    {"period": "2026-03-02", "value": "3.455", "updated": "2026-03-04T17:00:00Z"},
                ],
            }
        }

        with self.SessionLocal() as session:
            first_run = sync_eia_series(session, client=FakeEIAClient({"PET.EMD_EPD2D_PTE_NUS_DPG.W": payload}))

        with self.SessionLocal() as session:
            second_run = sync_eia_series(session, client=FakeEIAClient({"PET.EMD_EPD2D_PTE_NUS_DPG.W": payload}))
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(first_run.status, "SUCCEEDED")
        self.assertEqual(second_run.status, "SUCCEEDED")
        self.assertEqual(second_run.observation_count, 0)
        self.assertEqual(len(observations), 1)

    def test_sync_updates_revised_values(self) -> None:
        self._seed_price_index()
        initial_payload = {
            "response": {
                "frequency": "weekly",
                "data": [
                    {"period": "2026-03-02", "value": "3.455", "updated": "2026-03-04T17:00:00Z"},
                ],
            }
        }
        revised_payload = {
            "response": {
                "frequency": "weekly",
                "data": [
                    {"period": "2026-03-02", "value": "3.500", "updated": "2026-03-11T17:00:00Z"},
                ],
            }
        }

        with self.SessionLocal() as session:
            sync_eia_series(session, client=FakeEIAClient({"PET.EMD_EPD2D_PTE_NUS_DPG.W": initial_payload}))

        with self.SessionLocal() as session:
            revised_run = sync_eia_series(
                session,
                client=FakeEIAClient({"PET.EMD_EPD2D_PTE_NUS_DPG.W": revised_payload}),
            )
            observation = session.query(PriceIndexObservation).one()

        self.assertEqual(revised_run.observation_count, 1)
        self.assertEqual(observation.value, Decimal("3.500"))
        self.assertEqual(observation.source_revision, "2026-03-11T17:00:00Z")

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_price_index()

        with self.SessionLocal() as session:
            run = sync_eia_series(
                session,
                client=FakeEIAClient({}, raises=EIAClientError("boom")),
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)

    def test_sync_skips_rows_with_missing_values(self) -> None:
        self._seed_price_index()
        client = FakeEIAClient(
            {
                "PET.EMD_EPD2D_PTE_NUS_DPG.W": {
                    "response": {
                        "frequency": "weekly",
                        "data": [
                            {"period": "2026-03-09", "value": None},
                            {"period": "2026-03-02", "value": "3.455", "updated": "2026-03-04T17:00:00Z"},
                        ],
                    }
                }
            }
        )

        with self.SessionLocal() as session:
            run = sync_eia_series(session, client=client, requested_by="spec-test")
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].observation_date, date(2026, 3, 2))


if __name__ == "__main__":
    unittest.main()
