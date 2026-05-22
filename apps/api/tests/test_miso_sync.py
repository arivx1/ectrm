from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from typing import Iterable, Optional
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data import miso_client
from apps.api.app.domains.reference_data.services.external_data.miso_client import (
    MISOClient,
    MISOClientError,
)
from apps.api.app.domains.reference_data.services.external_data.miso_sync import sync_miso_series
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class _FakeResponse:
    status = 200

    def __init__(self, payload: dict) -> None:
        self.body = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return self.body

    def getcode(self) -> int:
        return self.status


class FakeMISOClient:
    def __init__(self, payload: dict, raises: Optional[Exception] = None) -> None:
        self.payload = payload
        self.raises = raises
        self.calls: list[dict] = []

    def fetch_realtime_five_minute_expost(self, *, nodes: Iterable[str]) -> dict:
        self.calls.append({"nodes": tuple(nodes)})
        if self.raises is not None:
            raise self.raises
        return self.payload


class MISOSyncTests(unittest.TestCase):
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

    def _seed_price_index_source(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferencePriceIndex(
                    code="MISO_INDIANA_HUB_RT5M",
                    name="MISO Indiana Hub Real-Time 5-Minute LMP",
                    commodity_code="POWER",
                    currency_code="USD",
                    unit_code="MWH",
                    provider="MISO",
                    market="MISO",
                    location_code="MISO_INDIANA_HUB",
                    calendar_code="MISO",
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
                    price_index_code="MISO_INDIANA_HUB_RT5M",
                    provider="MISO",
                    dataset_code="REAL_TIME_FIVE_MIN_EXPOST",
                    series_id="INDIANA.HUB",
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

    def test_client_parses_public_realtime_expost_rows(self) -> None:
        with patch.object(
            miso_client,
            "urlopen",
            return_value=_FakeResponse(
                {
                    "headers": ["INTERVAL", "CPNODE", "LMP", "MLC", "MCC"],
                    "data": [
                        ["2026-05-22T13:00:00", "MICHIGAN.HUB", "18.10", "0.10", "1.20"],
                        ["2026-05-22T13:00:00", "INDIANA.HUB", "20.55", "0.30", "2.40"],
                    ],
                }
            ),
        ):
            client = MISOClient(base_url="https://miso.example")
            payload = client.fetch_realtime_five_minute_expost(nodes=["INDIANA.HUB"])

        self.assertEqual(len(payload["prices"]), 1)
        self.assertEqual(payload["prices"][0]["node"], "INDIANA.HUB")
        self.assertEqual(payload["prices"][0]["lmp"], "20.55")

    def test_sync_creates_price_index_observations_from_source_mapping(self) -> None:
        self._seed_price_index_source()
        client = FakeMISOClient(
            {
                "prices": [
                    {
                        "interval": "2026-05-22T13:00:00",
                        "node": "INDIANA.HUB",
                        "lmp": "20.55",
                        "losses": "0.30",
                        "congestion": "2.40",
                    }
                ]
            }
        )

        with self.SessionLocal() as session:
            run = sync_miso_series(session, client=client, requested_by="spec-test")
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(client.calls[0]["nodes"], ("INDIANA.HUB",))
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].price_index_code, "MISO_INDIANA_HUB_RT5M")
        self.assertEqual(str(observations[0].value), "20.550000")
        self.assertEqual(observations[0].source_provider, "MISO")
        self.assertEqual(observations[0].source_frequency, "5MIN")

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_price_index_source()

        with self.SessionLocal() as session:
            run = sync_miso_series(
                session,
                client=FakeMISOClient({}, raises=MISOClientError("boom")),
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)


if __name__ == "__main__":
    unittest.main()
