from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.kalshi_client import KalshiClientError
from apps.api.app.domains.reference_data.services.external_data.kalshi_sync import sync_kalshi_series
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation


class FakeKalshiClient:
    def __init__(self, payload_by_market: dict[str, dict], raises: Optional[Exception] = None) -> None:
        self.payload_by_market = payload_by_market
        self.raises = raises
        self.calls: list[dict[str, object]] = []

    def fetch_market_candlesticks(self, **kwargs):
        self.calls.append(kwargs)
        if self.raises is not None:
            raise self.raises
        return self.payload_by_market[kwargs["market_ticker"]]


class KalshiSyncTests(unittest.TestCase):
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
                    code="KALSHI_FED_2026_RATE_CUT",
                    provider="KALSHI",
                    dataset_code="KXFEDRATECUT",
                    series_id="KXFEDRATECUT-26DEC17-25BPYES",
                    name="Fed Cuts At Least 25bp In 2026",
                    category="prediction",
                    frequency="daily",
                    unit_code="USD",
                    source_url="https://kalshi.com",
                    description="Test Kalshi market",
                    query_params=None,
                    transform_rule="field:price.close_dollars",
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
        client = FakeKalshiClient(
            {
                "KXFEDRATECUT-26DEC17-25BPYES": {
                    "ticker": "KXFEDRATECUT-26DEC17-25BPYES",
                    "candlesticks": [
                        {
                            "end_period_ts": int(datetime(2026, 4, 2, 23, 59, tzinfo=timezone.utc).timestamp()),
                            "price": {"close_dollars": "0.4100"},
                            "volume": "10.00",
                        },
                        {
                            "end_period_ts": int(datetime(2026, 4, 3, 23, 59, tzinfo=timezone.utc).timestamp()),
                            "price": {"close_dollars": "0.4350"},
                            "volume": "12.00",
                        },
                    ],
                }
            }
        )

        with self.SessionLocal() as session:
            run = sync_kalshi_series(
                session,
                client=client,
                requested_by="spec-test",
                lookback_days=10,
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
        self.assertEqual(str(observations[0].value), "0.410000")
        self.assertEqual(observations[1].observation_date.isoformat(), "2026-04-03")
        self.assertEqual(client.calls[0]["series_ticker"], "KXFEDRATECUT")

    def test_sync_uses_incremental_window_without_explicit_lookback(self) -> None:
        self._seed_definition()
        with self.SessionLocal() as session:
            session.add(
                ExternalDataRun(
                    id=1,
                    provider="KALSHI",
                    job_name="sync_kalshi_series",
                    status="SUCCEEDED",
                    started_at=datetime(2026, 4, 4, 0, 0, tzinfo=timezone.utc),
                    finished_at=datetime(2026, 4, 4, 0, 1, tzinfo=timezone.utc),
                    requested_by="spec-test",
                    series_count=1,
                    observation_count=1,
                    error_summary=None,
                    created_at=datetime(2026, 4, 4, 0, 0, tzinfo=timezone.utc),
                )
            )
            session.add(
                ExternalSeriesObservation(
                    series_code="KALSHI_FED_2026_RATE_CUT",
                    observation_date=date(2026, 4, 3),
                    value=0.435,
                    unit_code="USD",
                    source_provider="KALSHI",
                    source_series_id="KXFEDRATECUT-26DEC17-25BPYES",
                    source_frequency="DAILY",
                    source_published_at=datetime(2026, 4, 3, 23, 59, tzinfo=timezone.utc),
                    source_revision="1775260740",
                    downloaded_at=datetime(2026, 4, 4, 0, 5, tzinfo=timezone.utc),
                    run_id=1,
                    raw_payload={"price": {"close_dollars": "0.4350"}},
                    created_at=datetime(2026, 4, 4, 0, 5, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 4, 4, 0, 5, tzinfo=timezone.utc),
                )
            )
            session.commit()

        client = FakeKalshiClient(
            {
                "KXFEDRATECUT-26DEC17-25BPYES": {
                    "ticker": "KXFEDRATECUT-26DEC17-25BPYES",
                    "candlesticks": [],
                }
            }
        )

        with self.SessionLocal() as session:
            run = sync_kalshi_series(
                session,
                client=client,
                requested_by="spec-test",
                today=date(2026, 4, 5),
            )

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(client.calls[0]["start_ts"], int(datetime(2026, 4, 2, 0, 0, tzinfo=timezone.utc).timestamp()))
        self.assertEqual(client.calls[0]["end_ts"], int(datetime(2026, 4, 5, 23, 59, 59, 999999, tzinfo=timezone.utc).timestamp()))

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_definition()

        with self.SessionLocal() as session:
            run = sync_kalshi_series(
                session,
                client=FakeKalshiClient({}, raises=KalshiClientError("boom")),
            )
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)


if __name__ == "__main__":
    unittest.main()
