from __future__ import annotations

import unittest
from datetime import datetime, timezone
from typing import Iterable, Optional
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data import nyiso_client
from apps.api.app.domains.reference_data.services.external_data.nyiso_client import (
    NYISOClient,
    NYISOClientError,
)
from apps.api.app.domains.reference_data.services.external_data.nyiso_sync import sync_nyiso_series
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class _FakeResponse:
    status = 200

    def __init__(self, body: str) -> None:
        self.body = body.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return self.body

    def getcode(self) -> int:
        return self.status


class FakeNYISOClient:
    def __init__(self, payload: dict, raises: Optional[Exception] = None) -> None:
        self.payload = payload
        self.raises = raises
        self.calls: list[dict] = []

    def fetch_realtime_zone_lbmps(self, *, zones: Iterable[str]) -> dict:
        self.calls.append({"zones": tuple(zones)})
        if self.raises is not None:
            raise self.raises
        return self.payload


class NYISOSyncTests(unittest.TestCase):
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
                    code="NYISO_NYC_RT5M",
                    name="NYISO New York City Real-Time 5-Minute LBMP",
                    commodity_code="POWER",
                    currency_code="USD",
                    unit_code="MWH",
                    provider="NYISO",
                    market="NYISO",
                    location_code="NYISO_NYC",
                    calendar_code="NYISO",
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
                    price_index_code="NYISO_NYC_RT5M",
                    provider="NYISO",
                    dataset_code="REAL_TIME_ZONE_LBMP",
                    series_id="N.Y.C.",
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

    def test_client_parses_public_realtime_zone_lbmp_rows(self) -> None:
        csv_body = (
            '"Time Stamp","Name","PTID","LBMP ($/MWHr)",'
            '"Marginal Cost Losses ($/MWHr)","Marginal Cost Congestion ($/MWHr)"\n'
            '"05/22/2026 14:10:00","WEST",61752,18.36,-1.64,0.00\n'
            '"05/22/2026 14:10:00","N.Y.C.",61761,22.00,2.00,0.00\n'
        )
        with patch.object(
            nyiso_client,
            "urlopen",
            return_value=_FakeResponse(csv_body),
        ):
            client = NYISOClient(base_url="https://nyiso.example")
            payload = client.fetch_realtime_zone_lbmps(zones=["N.Y.C."])

        self.assertEqual(len(payload["prices"]), 1)
        self.assertEqual(payload["prices"][0]["zone"], "N.Y.C.")
        self.assertEqual(payload["prices"][0]["lbmp"], "22.00")

    def test_sync_creates_price_index_observations_from_source_mapping(self) -> None:
        self._seed_price_index_source()
        client = FakeNYISOClient(
            {
                "prices": [
                    {
                        "timestamp": "05/22/2026 14:10:00",
                        "zone": "N.Y.C.",
                        "ptid": "61761",
                        "lbmp": "22.00",
                        "losses": "2.00",
                        "congestion": "0.00",
                    }
                ]
            }
        )

        with self.SessionLocal() as session:
            run = sync_nyiso_series(session, client=client, requested_by="spec-test")
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(client.calls[0]["zones"], ("N.Y.C.",))
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].price_index_code, "NYISO_NYC_RT5M")
        self.assertEqual(str(observations[0].value), "22.000000")
        self.assertEqual(observations[0].source_provider, "NYISO")
        self.assertEqual(observations[0].source_frequency, "5MIN")

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_price_index_source()

        with self.SessionLocal() as session:
            run = sync_nyiso_series(
                session,
                client=FakeNYISOClient({}, raises=NYISOClientError("boom")),
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)


if __name__ == "__main__":
    unittest.main()
