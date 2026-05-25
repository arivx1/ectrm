from __future__ import annotations

import json
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.usda_nass_client import (
    USDANASSClientError,
)
from apps.api.app.domains.reference_data.services.external_data.usda_nass_price_mapper import (
    normalize_usda_nass_price_observations,
)
from apps.api.app.domains.reference_data.services.external_data.usda_nass_sync import (
    sync_usda_nass_series,
)
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class FakeUSDANASSClient:
    def __init__(self, payload: dict, raises: Optional[Exception] = None) -> None:
        self.payload = payload
        self.raises = raises
        self.calls: list[dict[str, object]] = []

    def fetch_price_series(self, **kwargs):
        self.calls.append(kwargs)
        if self.raises is not None:
            raise self.raises
        return self.payload


class USDANASSSyncTests(unittest.TestCase):
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

    def _seed_price_index_source(self, *, transform_rule: Optional[str] = None) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferencePriceIndex(
                    code="CORN_US_NASS_M",
                    name="U.S. Corn Price Received Monthly",
                    commodity_code="CORN",
                    currency_code="USD",
                    unit_code="BU",
                    provider="USDA_NASS",
                    quote_type="SPOT",
                    market="NASS_QUICKSTATS",
                    location_code="US",
                    calendar_code=None,
                    description="Test USDA NASS price index",
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
                    price_index_code="CORN_US_NASS_M",
                    provider="USDA_NASS",
                    dataset_code="QUICKSTATS_API",
                    series_id="CORN_US_PRICE_RECEIVED_M",
                    frequency="monthly",
                    source_unit="BU",
                    source_currency_code="USD",
                    transform_rule=transform_rule
                    if transform_rule is not None
                    else json.dumps(
                        {
                            "query_params": {
                                "commodity_desc": "CORN",
                                "statisticcat_desc": "PRICE RECEIVED",
                                "short_desc": "CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU",
                                "agg_level_desc": "NATIONAL",
                                "freq_desc": "MONTHLY",
                            }
                        }
                    ),
                    is_active=True,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def test_mapper_normalizes_monthly_quickstats_rows(self) -> None:
        mapping = ReferencePriceIndexSource(
            price_index_code="CORN_US_NASS_M",
            provider="USDA_NASS",
            dataset_code="QUICKSTATS_API",
            series_id="CORN_US_PRICE_RECEIVED_M",
            frequency="monthly",
            source_unit="BU",
            source_currency_code="USD",
            transform_rule=None,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            created_by="test-user",
            updated_at=datetime.now(timezone.utc),
            updated_by="test-user",
            version=1,
        )

        observations = normalize_usda_nass_price_observations(
            mapping=mapping,
            payload={
                "data": [
                    _nass_row(year="2026", begin_code="01", value="4.25"),
                    _nass_row(year="2026", begin_code="02", value="(D)"),
                    _nass_row(year="2026", begin_code="03", value="4.10"),
                ]
            },
            downloaded_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )

        self.assertEqual(len(observations), 2)
        self.assertEqual(observations[0].observation_date, date(2026, 1, 1))
        self.assertEqual(observations[0].value, Decimal("4.25"))
        self.assertEqual(observations[0].source_provider, "USDA_NASS")
        self.assertEqual(observations[0].source_published_at, datetime(2026, 4, 30, 15, 30, tzinfo=timezone.utc))

    def test_sync_creates_price_index_observations(self) -> None:
        self._seed_price_index_source()
        client = FakeUSDANASSClient(
            {
                "data": [
                    _nass_row(year="2026", begin_code="01", value="4.25"),
                    _nass_row(year="2026", begin_code="02", value="4.10"),
                ]
            }
        )

        with self.SessionLocal() as session:
            run = sync_usda_nass_series(
                session,
                client=client,
                requested_by="spec-test",
                lookback_days=900,
                today=date(2026, 5, 1),
            )
            observations = (
                session.query(PriceIndexObservation)
                .order_by(PriceIndexObservation.observation_date.asc())
                .all()
            )

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 2)
        self.assertEqual(len(observations), 2)
        self.assertEqual(observations[0].price_index_code, "CORN_US_NASS_M")
        self.assertEqual(observations[0].value, Decimal("4.250000"))
        self.assertEqual(observations[0].unit_code, "BU")
        self.assertEqual(observations[0].currency_code, "USD")
        self.assertEqual(observations[0].source_provider, "USDA_NASS")
        query_params = client.calls[0]["query_params"]
        self.assertEqual(query_params["commodity_desc"], "CORN")
        self.assertEqual(query_params["year__GE"], 2023)

    def test_sync_is_idempotent_for_unchanged_rows(self) -> None:
        self._seed_price_index_source()
        payload = {"data": [_nass_row(year="2026", begin_code="01", value="4.25")]}

        with self.SessionLocal() as session:
            first_run = sync_usda_nass_series(session, client=FakeUSDANASSClient(payload))

        with self.SessionLocal() as session:
            second_run = sync_usda_nass_series(session, client=FakeUSDANASSClient(payload))
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(first_run.status, "SUCCEEDED")
        self.assertEqual(second_run.status, "SUCCEEDED")
        self.assertEqual(second_run.observation_count, 0)
        self.assertEqual(len(observations), 1)

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_price_index_source()

        with self.SessionLocal() as session:
            run = sync_usda_nass_series(
                session,
                client=FakeUSDANASSClient({}, raises=USDANASSClientError("boom")),
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)

    def test_sync_marks_run_failed_when_mapping_lacks_query_params(self) -> None:
        self._seed_price_index_source(transform_rule="")

        with self.SessionLocal() as session:
            run = sync_usda_nass_series(session, client=FakeUSDANASSClient({}))

        self.assertEqual(run.status, "FAILED")
        self.assertIn("missing query parameters", run.error_summary)


def _nass_row(*, year: str, begin_code: str, value: str) -> dict[str, str]:
    return {
        "source_desc": "SURVEY",
        "sector_desc": "CROPS",
        "group_desc": "FIELD CROPS",
        "commodity_desc": "CORN",
        "class_desc": "ALL CLASSES",
        "util_practice_desc": "GRAIN",
        "prodn_practice_desc": "ALL PRODUCTION PRACTICES",
        "statisticcat_desc": "PRICE RECEIVED",
        "unit_desc": "$ / BU",
        "short_desc": "CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU",
        "domain_desc": "TOTAL",
        "domaincat_desc": "NOT SPECIFIED",
        "agg_level_desc": "NATIONAL",
        "country_name": "UNITED STATES",
        "year": year,
        "freq_desc": "MONTHLY",
        "begin_code": begin_code,
        "end_code": begin_code,
        "reference_period_desc": "MONTH",
        "week_ending": "",
        "load_time": "2026-04-30 15:30:00",
        "Value": value,
    }


if __name__ == "__main__":
    unittest.main()
