from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.cftc_client import CFTCClientError
from apps.api.app.domains.reference_data.services.external_data.cftc_sync import sync_cftc_series
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation


class FakeCFTCClient:
    def __init__(self, rows_by_dataset: dict[str, list[dict]], raises: Optional[Exception] = None) -> None:
        self.rows_by_dataset = rows_by_dataset
        self.raises = raises
        self.calls: list[dict[str, object]] = []

    def fetch_rows(self, **kwargs):
        self.calls.append(kwargs)
        if self.raises is not None:
            raise self.raises
        return self.rows_by_dataset[kwargs["dataset_code"]]


class CftcSyncTests(unittest.TestCase):
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
                    code="CFTC_WTI_MM_NET",
                    provider="CFTC",
                    dataset_code="72hh-3qpy",
                    series_id="067651",
                    name="WTI Managed Money Net",
                    category="positioning",
                    frequency="weekly",
                    unit_code="CONTRACTS",
                    source_url="https://publicreporting.cftc.gov/",
                    description="Test series",
                    query_params={"cftc_contract_market_code": "067651"},
                    transform_rule="net:m_money_positions_long_all:m_money_positions_short_all",
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
        client = FakeCFTCClient(
            {
                "72hh-3qpy": [
                    {
                        "id": "abc-1",
                        "report_date_as_yyyy_mm_dd": "2026-03-24T00:00:00.000",
                        "m_money_positions_long_all": "181139",
                        "m_money_positions_short_all": "86803",
                    },
                    {
                        "id": "abc-2",
                        "report_date_as_yyyy_mm_dd": "2026-03-31T00:00:00.000",
                        "m_money_positions_long_all": "177780",
                        "m_money_positions_short_all": "104433",
                    },
                ]
            }
        )

        with self.SessionLocal() as session:
            run = sync_cftc_series(
                session,
                client=client,
                requested_by="spec-test",
                lookback_days=21,
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
        self.assertEqual(str(observations[0].value), "94336.000000")
        self.assertEqual(str(observations[1].value), "73347.000000")
        self.assertEqual(client.calls[0]["filters"], {"cftc_contract_market_code": "067651"})
        self.assertEqual(client.calls[0]["start"], "2026-03-15")

    def test_sync_is_idempotent_for_unchanged_rows(self) -> None:
        self._seed_definition()
        rows = [
            {
                "id": "abc-1",
                "report_date_as_yyyy_mm_dd": "2026-03-31T00:00:00.000",
                "m_money_positions_long_all": "177780",
                "m_money_positions_short_all": "104433",
            }
        ]

        with self.SessionLocal() as session:
            first_run = sync_cftc_series(session, client=FakeCFTCClient({"72hh-3qpy": rows}))

        with self.SessionLocal() as session:
            second_run = sync_cftc_series(session, client=FakeCFTCClient({"72hh-3qpy": rows}))
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(first_run.status, "SUCCEEDED")
        self.assertEqual(second_run.status, "SUCCEEDED")
        self.assertEqual(second_run.observation_count, 0)
        self.assertEqual(len(observations), 1)

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_definition()

        with self.SessionLocal() as session:
            run = sync_cftc_series(
                session,
                client=FakeCFTCClient({}, raises=CFTCClientError("boom")),
            )
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)


if __name__ == "__main__":
    unittest.main()
