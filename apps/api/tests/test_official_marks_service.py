from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.risk.services.official_marks import (
    OFFICIAL_CURVE_STATUS_PARTIAL,
    OFFICIAL_CURVE_STATUS_STALE,
    OFFICIAL_MARK_APPROVAL_APPROVED_SOURCE,
    OFFICIAL_MARK_APPROVAL_MISSING_APPROVED_SOURCE,
    OFFICIAL_MARK_APPROVAL_MISSING_OBSERVATION,
    OFFICIAL_MARK_FRESHNESS_FRESH,
    OFFICIAL_MARK_FRESHNESS_MISSING,
    OFFICIAL_MARK_FRESHNESS_STALE,
    OFFICIAL_MARK_INTERPOLATION_NONE,
    build_official_curve,
    get_official_mark,
)
from apps.api.app.models.event import Base
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class OfficialMarksServiceTests(unittest.TestCase):
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
            session.commit()

    def _seed_price_index(
        self,
        session,
        *,
        code: str,
        is_active: bool = True,
    ) -> None:
        now = datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc)
        session.add(
            ReferencePriceIndex(
                code=code,
                name=f"{code} official gas mark",
                commodity_code="NATURAL_GAS",
                currency_code="USD",
                unit_code="MMBTU",
                provider="EIA",
                quote_type="SPOT",
                market="HENRY_HUB",
                location_code="HENRY_HUB",
                calendar_code=None,
                description="Test gas price index",
                is_active=is_active,
                effective_from=None,
                effective_to=None,
                created_at=now,
                created_by="test",
                updated_at=now,
                updated_by="test",
                version=1,
            )
        )

    def _seed_source(
        self,
        session,
        *,
        price_index_code: str,
        provider: str = "EIA",
        series_id: str = "NG.RNGWHHD.D",
        is_active: bool = True,
    ) -> None:
        now = datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc)
        session.add(
            ReferencePriceIndexSource(
                price_index_code=price_index_code,
                provider=provider,
                dataset_code="NG",
                series_id=series_id,
                frequency="daily",
                source_unit="MMBTU",
                source_currency_code="USD",
                transform_rule="field:value",
                is_active=is_active,
                created_at=now,
                created_by="test",
                updated_at=now,
                updated_by="test",
                version=1,
            )
        )

    def _seed_observation(
        self,
        session,
        *,
        price_index_code: str,
        observation_date: date,
        value: str,
        provider: str = "EIA",
        series_id: str = "NG.RNGWHHD.D",
        row_id: int | None = None,
    ) -> None:
        downloaded_at = datetime(
            observation_date.year,
            observation_date.month,
            observation_date.day,
            18,
            0,
            tzinfo=timezone.utc,
        )
        session.add(
            PriceIndexObservation(
                id=row_id,
                price_index_code=price_index_code,
                observation_date=observation_date,
                value=Decimal(value),
                unit_code="MMBTU",
                currency_code="USD",
                source_provider=provider,
                source_series_id=series_id,
                source_frequency="DAILY",
                source_published_at=downloaded_at,
                source_revision=downloaded_at.isoformat(),
                downloaded_at=downloaded_at,
                run_id=1,
                raw_payload={"period": observation_date.isoformat(), "value": value},
                created_at=downloaded_at,
                updated_at=downloaded_at,
            )
        )

    def test_official_mark_uses_latest_approved_source_as_of_date(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(session, code="HENRY_HUB_GAS_D")
            self._seed_source(session, price_index_code="HENRY_HUB_GAS_D")
            self._seed_observation(
                session,
                price_index_code="HENRY_HUB_GAS_D",
                observation_date=date(2026, 6, 1),
                value="3.050000",
                row_id=1,
            )
            self._seed_observation(
                session,
                price_index_code="HENRY_HUB_GAS_D",
                observation_date=date(2026, 6, 2),
                value="9.990000",
                provider="BROKER",
                series_id="BROKER.HH.D",
                row_id=2,
            )
            self._seed_observation(
                session,
                price_index_code="HENRY_HUB_GAS_D",
                observation_date=date(2026, 6, 3),
                value="3.250000",
                row_id=3,
            )
            session.commit()

            mark = get_official_mark(
                session,
                price_index_code="henry_hub_gas_d",
                as_of_date=date(2026, 6, 2),
            )

        self.assertEqual(mark.price_index_code, "HENRY_HUB_GAS_D")
        self.assertEqual(mark.approval_status, OFFICIAL_MARK_APPROVAL_APPROVED_SOURCE)
        self.assertEqual(mark.freshness_status, OFFICIAL_MARK_FRESHNESS_STALE)
        self.assertEqual(mark.observation_date, date(2026, 6, 1))
        self.assertEqual(mark.value, Decimal("3.050000"))
        self.assertEqual(mark.source_provider, "EIA")
        self.assertEqual(mark.days_stale, 1)
        self.assertEqual(mark.interpolation_method, OFFICIAL_MARK_INTERPOLATION_NONE)

    def test_official_mark_reports_fresh_for_same_day_observation(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(session, code="HENRY_HUB_GAS_D")
            self._seed_source(session, price_index_code="HENRY_HUB_GAS_D")
            self._seed_observation(
                session,
                price_index_code="HENRY_HUB_GAS_D",
                observation_date=date(2026, 6, 2),
                value="3.150000",
                row_id=4,
            )
            session.commit()

            mark = get_official_mark(
                session,
                price_index_code="HENRY_HUB_GAS_D",
                as_of_date=date(2026, 6, 2),
            )

        self.assertEqual(mark.freshness_status, OFFICIAL_MARK_FRESHNESS_FRESH)
        self.assertEqual(mark.days_stale, 0)
        self.assertEqual(mark.value, Decimal("3.150000"))

    def test_official_mark_rejects_unapproved_or_inactive_source(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(session, code="UNAPPROVED_GAS_D")
            self._seed_source(
                session,
                price_index_code="UNAPPROVED_GAS_D",
                is_active=False,
            )
            self._seed_observation(
                session,
                price_index_code="UNAPPROVED_GAS_D",
                observation_date=date(2026, 6, 2),
                value="2.990000",
                row_id=10,
            )
            session.commit()

            mark = get_official_mark(
                session,
                price_index_code="UNAPPROVED_GAS_D",
                as_of_date=date(2026, 6, 2),
            )

        self.assertEqual(mark.freshness_status, OFFICIAL_MARK_FRESHNESS_MISSING)
        self.assertEqual(mark.approval_status, OFFICIAL_MARK_APPROVAL_MISSING_APPROVED_SOURCE)
        self.assertIsNone(mark.value)
        self.assertEqual(mark.reason, "Price index has no active approved source.")

    def test_official_mark_reports_missing_observation_for_approved_source(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(session, code="NO_MARK_GAS_D")
            self._seed_source(session, price_index_code="NO_MARK_GAS_D")
            session.commit()

            mark = get_official_mark(
                session,
                price_index_code="NO_MARK_GAS_D",
                as_of_date=date(2026, 6, 2),
            )

        self.assertEqual(mark.freshness_status, OFFICIAL_MARK_FRESHNESS_MISSING)
        self.assertEqual(mark.approval_status, OFFICIAL_MARK_APPROVAL_MISSING_OBSERVATION)
        self.assertEqual(mark.reason, "No approved observation exists on or before the as-of date.")

    def test_official_curve_reports_partial_and_stale_status(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(session, code="HENRY_HUB_GAS_D")
            self._seed_source(session, price_index_code="HENRY_HUB_GAS_D")
            self._seed_observation(
                session,
                price_index_code="HENRY_HUB_GAS_D",
                observation_date=date(2026, 6, 1),
                value="3.050000",
                row_id=20,
            )
            self._seed_price_index(session, code="NO_MARK_GAS_D")
            self._seed_source(session, price_index_code="NO_MARK_GAS_D")
            session.commit()

            partial_curve = build_official_curve(
                session,
                curve_code="gas_daily_official",
                price_index_codes=["HENRY_HUB_GAS_D", "NO_MARK_GAS_D"],
                as_of_date=date(2026, 6, 2),
            )
            stale_curve = build_official_curve(
                session,
                curve_code="gas_daily_official",
                price_index_codes=["HENRY_HUB_GAS_D"],
                as_of_date=date(2026, 6, 2),
            )

        self.assertEqual(partial_curve.curve_code, "GAS_DAILY_OFFICIAL")
        self.assertEqual(partial_curve.status, OFFICIAL_CURVE_STATUS_PARTIAL)
        self.assertEqual(partial_curve.missing_price_index_codes, ("NO_MARK_GAS_D",))
        self.assertEqual(partial_curve.stale_mark_count, 1)
        self.assertEqual(partial_curve.missing_mark_count, 1)
        self.assertEqual(stale_curve.status, OFFICIAL_CURVE_STATUS_STALE)
        self.assertEqual(stale_curve.stale_mark_count, 1)
        self.assertEqual(stale_curve.missing_mark_count, 0)


if __name__ == "__main__":
    unittest.main()
