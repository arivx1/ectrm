from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.bls_client import (
    BLSPPIClientError,
)
from apps.api.app.domains.reference_data.services.external_data.bls_price_mapper import (
    normalize_bls_ppi_price_observations,
)
from apps.api.app.domains.reference_data.services.external_data.bls_sync import sync_bls_ppi_series
from apps.api.app.models import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class FakeBLSPPIClient:
    def __init__(self, payload: dict[str, object], raises: Exception | None = None) -> None:
        self.payload = payload
        self.raises = raises
        self.calls: list[dict[str, object]] = []

    def fetch_series(self, *, series_ids, start_year=None, end_year=None):
        self.calls.append(
            {
                "series_ids": list(series_ids),
                "start_year": start_year,
                "end_year": end_year,
            }
        )
        if self.raises is not None:
            raise self.raises
        return self.payload


class BLSPPISyncTests(unittest.TestCase):
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
            session.query(ReferencePriceIndexSource).delete()
            session.commit()

    def _seed_mapping(self, *, series_id: str = "WPU1017") -> None:
        now = datetime(2026, 5, 24, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferencePriceIndexSource(
                    price_index_code="STEEL_MILL_PRODUCTS_BLS_PPI_M",
                    provider="BLS_PPI",
                    dataset_code="BLS_PUBLIC_API_V2",
                    series_id=series_id,
                    frequency="monthly",
                    source_unit="INDEX",
                    source_currency_code="XXX",
                    transform_rule=None,
                    is_active=True,
                    created_at=now,
                    created_by="test",
                    updated_at=now,
                    updated_by="test",
                    version=1,
                )
            )
            session.commit()

    def test_mapper_normalizes_monthly_ppi_rows_and_skips_annual_average(self) -> None:
        mapping = ReferencePriceIndexSource(
            price_index_code="STEEL_MILL_PRODUCTS_BLS_PPI_M",
            provider="BLS_PPI",
            dataset_code="BLS_PUBLIC_API_V2",
            series_id="WPU1017",
            frequency="monthly",
            source_unit="INDEX",
            source_currency_code="XXX",
            transform_rule=None,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            created_by="test",
            updated_at=datetime.now(timezone.utc),
            updated_by="test",
            version=1,
        )
        payload = _bls_payload(
            [
                {
                    "year": "2026",
                    "period": "M04",
                    "periodName": "April",
                    "latest": "true",
                    "value": "344.202",
                    "footnotes": [{"code": "P", "text": "Preliminary"}],
                },
                {
                    "year": "2026",
                    "period": "M13",
                    "periodName": "Annual",
                    "value": "300.000",
                    "footnotes": [],
                },
            ]
        )

        observations = normalize_bls_ppi_price_observations(
            mapping=mapping,
            payload=payload,
            downloaded_at=datetime(2026, 5, 24, tzinfo=timezone.utc),
        )

        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].observation_date, date(2026, 4, 1))
        self.assertEqual(observations[0].value, Decimal("344.202"))
        self.assertEqual(observations[0].unit_code, "INDEX")
        self.assertEqual(observations[0].currency_code, "XXX")
        self.assertEqual(observations[0].source_revision, "latest:true;footnotes:P")
        self.assertEqual(observations[0].raw_payload["seriesID"], "WPU1017")

    def test_sync_inserts_observations_and_passes_year_window(self) -> None:
        self._seed_mapping()
        client = FakeBLSPPIClient(
            _bls_payload(
                [
                    {
                        "year": "2026",
                        "period": "M04",
                        "value": "344.202",
                        "footnotes": [],
                    }
                ]
            )
        )

        with self.SessionLocal() as session:
            run = sync_bls_ppi_series(
                session,
                client=client,
                lookback_days=365,
                requested_by="spec-test",
                today=date(2026, 5, 24),
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(client.calls[0]["series_ids"], ["WPU1017"])
        self.assertEqual(client.calls[0]["start_year"], 2025)
        self.assertEqual(client.calls[0]["end_year"], 2026)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].source_provider, "BLS_PPI")

    def test_sync_is_idempotent_for_unchanged_observations(self) -> None:
        self._seed_mapping()
        payload = _bls_payload(
            [
                {
                    "year": "2026",
                    "period": "M04",
                    "value": "344.202",
                    "footnotes": [],
                }
            ]
        )

        with self.SessionLocal() as session:
            first_run = sync_bls_ppi_series(session, client=FakeBLSPPIClient(payload))
            first_observation_count = first_run.observation_count
            second_run = sync_bls_ppi_series(session, client=FakeBLSPPIClient(payload))
            second_observation_count = second_run.observation_count
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(first_observation_count, 1)
        self.assertEqual(second_observation_count, 0)
        self.assertEqual(len(observations), 1)

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_mapping()

        with self.SessionLocal() as session:
            run = sync_bls_ppi_series(
                session,
                client=FakeBLSPPIClient({}, raises=BLSPPIClientError("boom")),
            )

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")

    def test_sync_marks_run_failed_when_no_sources_match(self) -> None:
        with self.SessionLocal() as session:
            run = sync_bls_ppi_series(session, client=FakeBLSPPIClient({}))

        self.assertEqual(run.status, "FAILED")
        self.assertIn("No active BLS PPI", run.error_summary)


def _bls_payload(rows: list[dict[str, object]], *, series_id: str = "WPU1017") -> dict[str, object]:
    return {
        "status": "REQUEST_SUCCEEDED",
        "message": [],
        "Results": {
            "series": [
                {
                    "seriesID": series_id,
                    "data": rows,
                }
            ]
        },
    }


if __name__ == "__main__":
    unittest.main()
