from __future__ import annotations

import enum
import unittest
from datetime import date

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.calendar_business_days import evaluate_calendar_day
from apps.api.app.domains.admin.services.seed_reference_data import seed_reference_master_data
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_calendar_holiday import ReferenceCalendarHoliday
from apps.api.app.models.reference_calendar_overlay import ReferenceCalendarOverlay
from apps.api.app.models.reference_calendar_rule import ReferenceCalendarRule
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_pipeline_detail import ReferencePipelineDetail
from apps.api.app.models.reference_pipeline_path import ReferencePipelinePath
from apps.api.app.models.reference_pipeline_point import ReferencePipelinePoint
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource
from apps.api.app.models.reference_rail_line import ReferenceRailLine
from apps.api.app.models.reference_rail_route import ReferenceRailRoute
from apps.api.app.models.reference_spatial_feature import ReferenceSpatialFeature
from apps.api.app.models.reference_unit import ReferenceUnit


class CalendarSeedCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        for table in [
            ReferenceBook.__table__,
            ReferenceCommodity.__table__,
            ReferenceCurrency.__table__,
            ReferenceUnit.__table__,
            ReferenceLocation.__table__,
            ReferenceAsset.__table__,
            ReferenceCounterparty.__table__,
            ReferencePortfolio.__table__,
            ReferenceCalendar.__table__,
            ReferenceCalendarHoliday.__table__,
            ReferenceCalendarOverlay.__table__,
            ReferenceCalendarRule.__table__,
            ReferencePipelineDetail.__table__,
            ReferencePipelinePoint.__table__,
            ReferencePipelinePath.__table__,
            ReferencePriceIndex.__table__,
            ReferencePriceIndexSource.__table__,
            ReferenceRailLine.__table__,
            ReferenceRailRoute.__table__,
            ReferenceSpatialFeature.__table__,
        ]:
            table.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            session.query(ReferencePriceIndexSource).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ReferenceSpatialFeature).delete()
            session.query(ReferenceRailRoute).delete()
            session.query(ReferenceRailLine).delete()
            session.query(ReferenceCalendarOverlay).delete()
            session.query(ReferenceCalendarRule).delete()
            session.query(ReferenceCalendarHoliday).delete()
            session.query(ReferenceCalendar).delete()
            session.query(ReferencePipelinePath).delete()
            session.query(ReferencePipelinePoint).delete()
            session.query(ReferencePipelineDetail).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferenceAsset).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceCurrency).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.commit()

    def test_seed_reference_master_data_includes_operational_calendar_catalog(self) -> None:
        with self.SessionLocal() as session:
            summary = seed_reference_master_data(
                session,
                requested_by="test-user",
                replace_existing=True,
            )
            calendar_codes = {
                row.code
                for row in session.query(ReferenceCalendar).all()
            }
            overlay_count = session.query(ReferenceCalendarOverlay).count()
            rule_count = session.query(ReferenceCalendarRule).count()
            spatial_feature_count = session.query(ReferenceSpatialFeature).count()

        payment_system_codes = {
            "CA_LYNX",
            "EUR_TARGET",
            "IL_ZAHAV",
            "MX_SPEI",
            "UK_CHAPS",
            "US_CHIPS",
            "US_FEDWIRE",
        }
        exchange_codes = {
            "CME_ENERGY",
            "HKEX",
            "ICE_EU",
            "ICE_US",
            "JPX",
            "LME",
            "NASDAQ",
            "NYSE",
            "SGX",
        }
        power_market_codes = {
            "AESO",
            "CAISO",
            "ERCOT",
            "IESO",
            "ISO_NE",
            "MISO",
            "NYISO",
            "PJM",
            "SPP",
        }
        operations_codes = {
            "ARA_PORT",
            "FUJAIRAH_PORT",
            "NAESB_GAS",
            "SINGAPORE_PORT",
            "USGC_PORT",
        }
        overlay_codes = {
            "AU_NSW_BANK",
            "AU_QLD_BANK",
            "AU_VIC_BANK",
            "AU_WA_BANK",
            "DE_BADEN_WUERTTEMBERG_PUBLIC",
            "DE_BAVARIA_PUBLIC",
            "HK_BANK_NATIONAL",
        }

        self.assertEqual(summary.entity_counts["calendars"], 73)
        self.assertEqual(summary.entity_counts["calendar_overlays"], overlay_count)
        self.assertEqual(summary.entity_counts["calendar_rules"], rule_count)
        self.assertEqual(summary.entity_counts["spatial_features"], spatial_feature_count)
        self.assertEqual(spatial_feature_count, 6)
        self.assertEqual(len(calendar_codes), 73)
        self.assertGreaterEqual(overlay_count, 20)
        self.assertGreaterEqual(rule_count, 130)
        self.assertTrue(calendar_codes.issuperset(payment_system_codes))
        self.assertTrue(calendar_codes.issuperset(exchange_codes))
        self.assertTrue(calendar_codes.issuperset(power_market_codes))
        self.assertTrue(calendar_codes.issuperset(operations_codes))
        self.assertTrue(calendar_codes.issuperset(overlay_codes))

    def test_seeded_business_day_rules_match_initial_target_calendars(self) -> None:
        with self.SessionLocal() as session:
            seed_reference_master_data(
                session,
                requested_by="test-user",
                replace_existing=True,
            )
            fedwire_friday = evaluate_calendar_day(
                session,
                calendar_code="US_FEDWIRE",
                evaluated_date=date(2026, 7, 3),
            )
            fedwire_monday = evaluate_calendar_day(
                session,
                calendar_code="US_FEDWIRE",
                evaluated_date=date(2027, 7, 5),
            )
            nyse_friday = evaluate_calendar_day(
                session,
                calendar_code="NYSE",
                evaluated_date=date(2026, 7, 3),
            )
            target_good_friday = evaluate_calendar_day(
                session,
                calendar_code="EUR_TARGET",
                evaluated_date=date(2026, 4, 3),
            )
            pjm_preholiday = evaluate_calendar_day(
                session,
                calendar_code="PJM",
                evaluated_date=date(2026, 7, 3),
            )

        self.assertTrue(fedwire_friday.is_business_day)
        self.assertEqual(fedwire_friday.closure_type, "OPEN")
        self.assertFalse(fedwire_monday.is_business_day)
        self.assertIn("Independence Day", {match.name for match in fedwire_monday.matches})
        self.assertFalse(nyse_friday.is_business_day)
        self.assertIn("Independence Day", {match.name for match in nyse_friday.matches})
        self.assertFalse(target_good_friday.is_business_day)
        self.assertIn("Good Friday", {match.name for match in target_good_friday.matches})
        self.assertTrue(pjm_preholiday.is_business_day)


if __name__ == "__main__":
    unittest.main()
