from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.eia_client import EIAClientError
from apps.api.app.domains.reference_data.services.external_data.eia_fundamentals_sync import (
    sync_eia_fundamental_series,
)
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation


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


class EiaFundamentalsSyncTests(unittest.TestCase):
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

    def _seed_series(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    ExternalSeriesDefinition(
                        code="EIA_CRUDE_PROD_US_M",
                        provider="EIA_FUNDAMENTALS",
                        dataset_code="PET",
                        series_id="PET.MCRFPUS2.M",
                        name="U.S. Crude Oil Field Production",
                        category="fundamentals",
                        frequency="monthly",
                        unit_code="KBBL_D",
                        source_url="https://www.eia.gov/dnav/pet/pet_crd_crpdn_adc_mbblpd_m.htm",
                        description="Test crude production series",
                        query_params=None,
                        transform_rule="field:value",
                        is_active=True,
                        created_at=now,
                        created_by="test-user",
                        updated_at=now,
                        updated_by="test-user",
                        version=1,
                    ),
                    ExternalSeriesDefinition(
                        code="EIA_NG_STORAGE_LOWER48_W",
                        provider="EIA_FUNDAMENTALS",
                        dataset_code="NG",
                        series_id="NG.NW2_EPG0_SWO_R48_BCF.W",
                        name="Lower 48 Working Gas in Storage",
                        category="fundamentals",
                        frequency="weekly",
                        unit_code="BCF",
                        source_url="https://www.eia.gov/dnav/ng/ng_stor_wkly_s1_w.htm",
                        description="Test gas storage series",
                        query_params=None,
                        transform_rule="field:value",
                        is_active=True,
                        created_at=now,
                        created_by="test-user",
                        updated_at=now,
                        updated_by="test-user",
                        version=1,
                    ),
                ]
            )
            session.commit()

    def test_sync_creates_run_and_observations(self) -> None:
        self._seed_series()
        client = FakeEIAClient(
            {
                "PET.MCRFPUS2.M": {
                    "response": {
                        "frequency": "monthly",
                        "data": [
                            {"period": "2026-02", "value": "13246", "updated": "2026-03-01T12:00:00Z"},
                        ],
                    }
                },
                "NG.NW2_EPG0_SWO_R48_BCF.W": {
                    "response": {
                        "frequency": "weekly",
                        "data": [
                            {"period": "2026-04-03", "value": "1865", "updated": "2026-04-03T14:30:00Z"},
                        ],
                    }
                },
            }
        )

        with self.SessionLocal() as session:
            run = sync_eia_fundamental_series(
                session,
                client=client,
                requested_by="spec-test",
                lookback_days=120,
                today=date(2026, 4, 5),
            )
            observations = (
                session.query(ExternalSeriesObservation)
                .order_by(ExternalSeriesObservation.series_code.asc(), ExternalSeriesObservation.observation_date.desc())
                .all()
            )

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 2)
        self.assertEqual(run.observation_count, 2)
        self.assertEqual(len(observations), 2)
        self.assertEqual(observations[0].series_code, "EIA_CRUDE_PROD_US_M")
        self.assertEqual(observations[0].value, Decimal("13246"))
        self.assertEqual(observations[1].series_code, "EIA_NG_STORAGE_LOWER48_W")
        self.assertEqual(client.calls[0]["frequency"], "monthly")
        self.assertEqual(client.calls[0]["start"], "2025-12")
        self.assertEqual(client.calls[1]["frequency"], "weekly")
        self.assertEqual(client.calls[1]["start"], "2025-12-06")

    def test_sync_is_idempotent_for_unchanged_rows(self) -> None:
        self._seed_series()
        payloads = {
            "PET.MCRFPUS2.M": {
                "response": {
                    "frequency": "monthly",
                    "data": [{"period": "2026-02", "value": "13246", "updated": "2026-03-01T12:00:00Z"}],
                }
            },
            "NG.NW2_EPG0_SWO_R48_BCF.W": {
                "response": {
                    "frequency": "weekly",
                    "data": [{"period": "2026-04-03", "value": "1865", "updated": "2026-04-03T14:30:00Z"}],
                }
            },
        }

        with self.SessionLocal() as session:
            first_run = sync_eia_fundamental_series(session, client=FakeEIAClient(payloads))

        with self.SessionLocal() as session:
            second_run = sync_eia_fundamental_series(session, client=FakeEIAClient(payloads))
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(first_run.status, "SUCCEEDED")
        self.assertEqual(second_run.status, "SUCCEEDED")
        self.assertEqual(second_run.observation_count, 0)
        self.assertEqual(len(observations), 2)

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_series()

        with self.SessionLocal() as session:
            run = sync_eia_fundamental_series(
                session,
                client=FakeEIAClient({}, raises=EIAClientError("boom")),
            )
            observations = session.query(ExternalSeriesObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)


if __name__ == "__main__":
    unittest.main()
