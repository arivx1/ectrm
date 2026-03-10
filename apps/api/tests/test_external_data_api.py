from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.routes.external_data import (
    get_external_data_run,
    get_latest_price_index_observation,
    list_external_data_runs,
    trigger_eia_sync,
)
from apps.api.app.schemas.external_data import EIASyncRequest


class ExternalDataApiTests(unittest.TestCase):
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
            session.query(ExternalDataRun).delete()
            session.query(ReferencePriceIndex).delete()
            session.commit()

    def _seed_rows(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    ReferencePriceIndex(
                        code="WTI_CUSHING_D",
                        name="WTI Cushing Spot Daily",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="EIA",
                        market="CUSHING",
                        location_code=None,
                        calendar_code=None,
                        description="Test",
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=datetime.now(timezone.utc),
                        created_by="system",
                        updated_at=datetime.now(timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    ExternalDataRun(
                        id=1,
                        provider="EIA",
                        job_name="sync_eia_price_data",
                        status="FAILED",
                        started_at=datetime(2026, 3, 9, 12, 0, tzinfo=timezone.utc),
                        finished_at=datetime(2026, 3, 9, 12, 5, tzinfo=timezone.utc),
                        requested_by="user-a",
                        series_count=1,
                        observation_count=0,
                        error_summary="boom",
                        created_at=datetime(2026, 3, 9, 12, 0, tzinfo=timezone.utc),
                    ),
                    ExternalDataRun(
                        id=2,
                        provider="EIA",
                        job_name="sync_eia_price_data",
                        status="SUCCEEDED",
                        started_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                        finished_at=datetime(2026, 3, 10, 12, 5, tzinfo=timezone.utc),
                        requested_by="user-b",
                        series_count=1,
                        observation_count=2,
                        error_summary=None,
                        created_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                    ),
                    PriceIndexObservation(
                        id=1,
                        price_index_code="WTI_CUSHING_D",
                        observation_date=date(2026, 3, 9),
                        value=Decimal("66.100000"),
                        unit_code="BBL",
                        currency_code="USD",
                        source_provider="EIA",
                        source_series_id="PET.RWTC.D",
                        source_frequency="DAILY",
                        source_published_at=datetime(2026, 3, 9, 17, 0, tzinfo=timezone.utc),
                        source_revision="2026-03-09T17:00:00Z",
                        downloaded_at=datetime(2026, 3, 10, 12, 5, tzinfo=timezone.utc),
                        run_id=2,
                        raw_payload={"period": "2026-03-09", "value": "66.1"},
                        created_at=datetime(2026, 3, 10, 12, 5, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 10, 12, 5, tzinfo=timezone.utc),
                    ),
                    PriceIndexObservation(
                        id=2,
                        price_index_code="WTI_CUSHING_D",
                        observation_date=date(2026, 3, 10),
                        value=Decimal("67.200000"),
                        unit_code="BBL",
                        currency_code="USD",
                        source_provider="EIA",
                        source_series_id="PET.RWTC.D",
                        source_frequency="DAILY",
                        source_published_at=datetime(2026, 3, 10, 17, 0, tzinfo=timezone.utc),
                        source_revision="2026-03-10T17:00:00Z",
                        downloaded_at=datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc),
                        run_id=2,
                        raw_payload={"period": "2026-03-10", "value": "67.2"},
                        created_at=datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc),
                    ),
                ]
            )
            session.commit()

    def test_list_external_data_runs_orders_latest_first(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = list_external_data_runs(provider="EIA", limit=50, offset=0, db=session)

        self.assertEqual([row.id for row in payload], [2, 1])

    def test_get_external_data_run_returns_requested_run(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = get_external_data_run(2, db=session)

        self.assertEqual(payload.status, "SUCCEEDED")
        self.assertEqual(payload.observation_count, 2)

    def test_get_latest_price_index_observation_returns_latest_date(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = get_latest_price_index_observation("wti_cushing_d", db=session)

        self.assertEqual(payload.price_index_code, "WTI_CUSHING_D")
        self.assertEqual(payload.observation_date, date(2026, 3, 10))
        self.assertEqual(payload.value, 67.2)

    def test_trigger_eia_sync_returns_run_payload(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            expected_run = session.query(ExternalDataRun).filter(ExternalDataRun.id == 2).one()
            with patch("apps.api.app.routes.external_data.sync_eia_series", return_value=expected_run) as sync_mock:
                payload = trigger_eia_sync(
                    EIASyncRequest(
                        price_index_code="WTI_CUSHING_D",
                        lookback_days=30,
                        requested_by="anthony",
                    ),
                    db=session,
                )

        self.assertEqual(payload.id, 2)
        self.assertEqual(payload.status, "SUCCEEDED")
        sync_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
