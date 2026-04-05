from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.fred_client import FREDClientError
from apps.api.app.domains.reference_data.services.external_data.fred_sync import sync_fred_series
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation


class FakeFREDClient:
    def __init__(self, payload_by_series: dict[str, dict], raises: Optional[Exception] = None) -> None:
        self.payload_by_series = payload_by_series
        self.raises = raises
        self.calls: list[dict[str, object]] = []

    def fetch_series(self, **kwargs):
        self.calls.append(kwargs)
        if self.raises is not None:
            raise self.raises
        return self.payload_by_series[kwargs["series_id"]]


class FredSyncTests(unittest.TestCase):
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
                    code="FRED_DGS10",
                    provider="FRED",
                    dataset_code=None,
                    series_id="DGS10",
                    name="10-Year Treasury Constant Maturity Rate",
                    category="macro",
                    frequency="daily",
                    unit_code="PCT",
                    source_url="https://fred.stlouisfed.org/series/DGS10",
                    description="Test series",
                    query_params=None,
                    transform_rule="field:value",
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
        client = FakeFREDClient(
            {
                "DGS10": {
                    "observations": [
                        {
                            "date": "2026-04-02",
                            "value": "4.31",
                            "realtime_start": "2026-04-02",
                            "realtime_end": "2026-04-02",
                        },
                        {
                            "date": "2026-04-03",
                            "value": "4.28",
                            "realtime_start": "2026-04-03",
                            "realtime_end": "2026-04-03",
                        },
                    ]
                }
            }
        )

        with self.SessionLocal() as session:
            run = sync_fred_series(
                session,
                client=client,
                requested_by="spec-test",
                lookback_days=30,
                today=date(2026, 4, 5),
            )
            observations = (
                session.query(ExternalSeriesObservation)
                .order_by(ExternalSeriesObservation.observation_date.asc())
                .all()
            )

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 2)
        self.assertEqual(len(observations), 2)
        self.assertEqual(str(observations[0].value), "4.310000")
        self.assertEqual(observations[1].series_code, "FRED_DGS10")
        self.assertEqual(client.calls[0]["observation_start"], "2026-03-06")

    def test_sync_is_idempotent_for_unchanged_rows(self) -> None:
        self._seed_definition()
        payload = {
            "observations": [
                {
                    "date": "2026-04-03",
                    "value": "4.28",
                    "realtime_start": "2026-04-03",
                    "realtime_end": "2026-04-03",
                }
            ]
        }

        with self.SessionLocal() as session:
            first_run = sync_fred_series(session, client=FakeFREDClient({"DGS10": payload}))

        with self.SessionLocal() as session:
            second_run = sync_fred_series(session, client=FakeFREDClient({"DGS10": payload}))
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(first_run.status, "SUCCEEDED")
        self.assertEqual(second_run.status, "SUCCEEDED")
        self.assertEqual(second_run.observation_count, 0)
        self.assertEqual(len(observations), 1)

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_definition()

        with self.SessionLocal() as session:
            run = sync_fred_series(
                session,
                client=FakeFREDClient({}, raises=FREDClientError("boom")),
            )
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)

    def test_sync_skips_missing_values(self) -> None:
        self._seed_definition()
        client = FakeFREDClient(
            {
                "DGS10": {
                    "observations": [
                        {"date": "2026-04-02", "value": "."},
                        {
                            "date": "2026-04-03",
                            "value": "4.28",
                            "realtime_start": "2026-04-03",
                            "realtime_end": "2026-04-03",
                        },
                    ]
                }
            }
        )

        with self.SessionLocal() as session:
            run = sync_fred_series(session, client=client, requested_by="spec-test")
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].observation_date, date(2026, 4, 3))


if __name__ == "__main__":
    unittest.main()
