from __future__ import annotations

import unittest
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.caiso_client import CAISOClientError
from apps.api.app.domains.reference_data.services.external_data.caiso_sync import sync_caiso_series
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation


class FakeCAISOClient:
    def __init__(self, snapshot: dict, raises: Optional[Exception] = None) -> None:
        self.snapshot = snapshot
        self.raises = raises
        self.call_count = 0

    def fetch_current_hub_prices(self):
        self.call_count += 1
        if self.raises is not None:
            raise self.raises
        return self.snapshot


class CaisoSyncTests(unittest.TestCase):
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
            session.query(ExternalSeriesObservation).delete()
            session.query(ExternalSeriesDefinition).delete()
            session.query(ExternalDataRun).delete()
            session.commit()

    def _seed_definition(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ExternalSeriesDefinition(
                    code="CAISO_NP15_RT5M",
                    provider="CAISO",
                    dataset_code=None,
                    series_id="NP15",
                    name="CAISO NP15 Real-Time 5-Minute Hub LMP",
                    category="power",
                    frequency="daily",
                    unit_code="USD_MWH",
                    source_url="https://oasis.caiso.com/oasisapi/prc_hub_lmp/PRC_HUB_LMP.html",
                    description="Power test series",
                    query_params={"hub": "NP15"},
                    transform_rule="field:lmp",
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
        client = FakeCAISOClient(
            {
                "trade_date": "2026-04-05",
                "hour": 17,
                "interval": 3,
                "prices": [
                    {"hub": "NP15", "lmp": "28.45", "energy": "27.91", "congestion": "0.20", "losses": "0.34"},
                    {"hub": "SP15", "lmp": "31.11", "energy": "30.01", "congestion": "0.52", "losses": "0.58"},
                ],
            }
        )

        with self.SessionLocal() as session:
            run = sync_caiso_series(session, client=client, requested_by="spec-test")
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].series_code, "CAISO_NP15_RT5M")
        self.assertEqual(str(observations[0].value), "28.450000")
        self.assertEqual(observations[0].source_revision, "2026-04-05:HE17:I03")
        self.assertEqual(client.call_count, 1)

    def test_sync_is_idempotent_for_unchanged_rows(self) -> None:
        self._seed_definition()
        snapshot = {
            "trade_date": "2026-04-05",
            "hour": 17,
            "interval": 3,
            "prices": [{"hub": "NP15", "lmp": "28.45", "energy": "27.91", "congestion": "0.20", "losses": "0.34"}],
        }

        with self.SessionLocal() as session:
            first_run = sync_caiso_series(session, client=FakeCAISOClient(snapshot))

        with self.SessionLocal() as session:
            second_run = sync_caiso_series(session, client=FakeCAISOClient(snapshot))
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(first_run.status, "SUCCEEDED")
        self.assertEqual(second_run.status, "SUCCEEDED")
        self.assertEqual(second_run.observation_count, 0)
        self.assertEqual(len(observations), 1)

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_definition()

        with self.SessionLocal() as session:
            run = sync_caiso_series(
                session,
                client=FakeCAISOClient({}, raises=CAISOClientError("boom")),
            )
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)


if __name__ == "__main__":
    unittest.main()
