from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.alpha_vantage_client import (
    AlphaVantageClientError,
)
from apps.api.app.domains.reference_data.services.external_data.alpha_vantage_sync import (
    sync_alpha_vantage_prices,
)
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class FakeAlphaVantageClient:
    def __init__(self, payload_by_symbol: dict[str, dict], raises: Optional[Exception] = None) -> None:
        self.payload_by_symbol = payload_by_symbol
        self.raises = raises
        self.calls: list[dict[str, object]] = []

    def fetch_series(self, **kwargs):
        self.calls.append(kwargs)
        if self.raises is not None:
            raise self.raises
        return self.payload_by_symbol[kwargs["symbol"]]


class AlphaVantageSyncTests(unittest.TestCase):
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

    def _seed_mapping(
        self,
        *,
        price_index_code: str = "SPY_US_ALPHA_Q",
        commodity_code: str = "ETF",
        unit_code: str = "SHARE",
        dataset_code: str = "GLOBAL_QUOTE",
        series_id: str = "SPY",
        frequency: str = "intraday",
    ) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferencePriceIndex(
                    code=price_index_code,
                    name=f"{series_id} demo quote",
                    commodity_code=commodity_code,
                    currency_code="USD",
                    unit_code=unit_code,
                    provider="ALPHA_VANTAGE",
                    market="NASDAQ",
                    location_code=None,
                    calendar_code="NASDAQ",
                    description="Test Alpha Vantage demo quote",
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
                    price_index_code=price_index_code,
                    provider="ALPHA_VANTAGE",
                    dataset_code=dataset_code,
                    series_id=series_id,
                    frequency=frequency,
                    source_unit=unit_code,
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

    def test_sync_creates_price_observation_from_global_quote(self) -> None:
        self._seed_mapping()
        client = FakeAlphaVantageClient(
            {
                "SPY": {
                    "Global Quote": {
                        "01. symbol": "SPY",
                        "05. price": "512.34",
                        "07. latest trading day": "2026-06-04",
                    }
                }
            }
        )

        with self.SessionLocal() as session:
            run = sync_alpha_vantage_prices(session, client=client, requested_by="spec-test")
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].price_index_code, "SPY_US_ALPHA_Q")
        self.assertEqual(observations[0].observation_date, date(2026, 6, 4))
        self.assertEqual(observations[0].value, Decimal("512.340000"))
        self.assertEqual(observations[0].unit_code, "SHARE")
        self.assertEqual(observations[0].source_provider, "ALPHA_VANTAGE")
        self.assertEqual(observations[0].source_revision, "2026-06-04")
        self.assertEqual(client.calls[0]["function"], "GLOBAL_QUOTE")
        self.assertEqual(client.calls[0]["symbol"], "SPY")
        self.assertIsNone(client.calls[0]["interval"])

    def test_sync_can_filter_by_price_index_code(self) -> None:
        self._seed_mapping()
        self._seed_mapping(price_index_code="AAPL_US_ALPHA_Q", commodity_code="EQUITY", series_id="AAPL")
        client = FakeAlphaVantageClient(
            {
                "AAPL": {
                    "Global Quote": {
                        "01. symbol": "AAPL",
                        "05. price": "199.10",
                        "07. latest trading day": "2026-06-04",
                    }
                }
            }
        )

        with self.SessionLocal() as session:
            run = sync_alpha_vantage_prices(
                session,
                client=client,
                price_index_code="AAPL_US_ALPHA_Q",
                requested_by="spec-test",
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].price_index_code, "AAPL_US_ALPHA_Q")
        self.assertEqual(client.calls[0]["symbol"], "AAPL")

    def test_sync_normalizes_alpha_vantage_commodity_payload(self) -> None:
        self._seed_mapping(
            price_index_code="WTI_ALPHA_D",
            commodity_code="WTI",
            unit_code="BBL",
            dataset_code="WTI",
            series_id="WTI",
            frequency="daily",
        )
        client = FakeAlphaVantageClient(
            {
                "WTI": {
                    "name": "West Texas Intermediate",
                    "interval": "daily",
                    "unit": "dollars per barrel",
                    "data": [
                        {"date": "2026-06-03", "value": "67.11"},
                        {"date": "2026-06-04", "value": "67.42"},
                    ],
                }
            }
        )

        with self.SessionLocal() as session:
            run = sync_alpha_vantage_prices(session, client=client, requested_by="spec-test")
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(observations[0].observation_date, date(2026, 6, 4))
        self.assertEqual(observations[0].value, Decimal("67.420000"))
        self.assertEqual(observations[0].unit_code, "BBL")
        self.assertEqual(client.calls[0]["function"], "WTI")
        self.assertEqual(client.calls[0]["interval"], "daily")

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_mapping()

        with self.SessionLocal() as session:
            run = sync_alpha_vantage_prices(
                session,
                client=FakeAlphaVantageClient({}, raises=AlphaVantageClientError("quota exhausted")),
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "quota exhausted")
        self.assertEqual(observations, [])


if __name__ == "__main__":
    unittest.main()
