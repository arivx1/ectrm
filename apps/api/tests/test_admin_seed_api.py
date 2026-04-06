from __future__ import annotations

import enum
import unittest

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.routes.admin_data import (
    list_admin_transaction_scenarios,
    seed_admin_reference_data,
    seed_admin_transactions,
)
from apps.api.app.routes.reports import get_activity_summary, get_exposure_summary, get_reporting_overview
from apps.api.app.schemas.admin_seed import ReferenceSeedRequest, TransactionSeedRequest


class AdminSeedApiTests(unittest.TestCase):
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
            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Position).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(ReferencePriceIndexSource).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceCurrency).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.commit()

    def test_reference_seed_populates_master_data(self) -> None:
        with self.SessionLocal() as session:
            payload = seed_admin_reference_data(
                ReferenceSeedRequest(requested_by="test-user", replace_existing=True),
                db=session,
            )

            self.assertEqual(payload.total_records, sum(payload.entity_counts.values()))
            self.assertEqual(payload.entity_counts["commodities"], 11)
            self.assertEqual(payload.entity_counts["locations"], 514)
            self.assertEqual(payload.entity_counts["counterparties"], 16)
            self.assertEqual(payload.entity_counts["price_indices"], 7)
            self.assertEqual(payload.entity_counts["price_index_sources"], 6)
            self.assertEqual(
                {
                    row.code
                    for row in session.query(ReferencePriceIndex).all()
                },
                {
                    "BRENT_SPOT_D",
                    "DIESEL_US_RETAIL_W",
                    "GASOLINE_US_REG_W",
                    "HENRY_HUB_GAS_D",
                    "PJM_WEST_ONPEAK_DA",
                    "USGC_DIESEL_SPOT_D",
                    "WTI_CUSHING_PHYS_D",
                },
            )
            self.assertTrue(
                {
                    row.code
                    for row in session.query(ReferenceLocation).all()
                }.issuperset(
                    {
                        "ARA",
                        "CONTINENT_NA",
                        "COUNTRY_US",
                        "CUSHING",
                        "ERCOT_NORTH",
                        "MIDLAND",
                        "SUBDIVISION_US_TX",
                        "SUBDIVISION_ZA_GP",
                        "WAHA",
                    }
                )
            )
            cushing = session.get(ReferenceLocation, "CUSHING")
            usgc = session.get(ReferenceLocation, "USGC")
            self.assertIsNotNone(cushing)
            self.assertIsNotNone(usgc)
            assert cushing is not None
            assert usgc is not None
            self.assertEqual(cushing.location_kind, "POINT")
            self.assertEqual(cushing.parent_location_code, "PADD2")
            self.assertEqual(cushing.subdivision_code, "US-OK")
            self.assertAlmostEqual(cushing.latitude or 0.0, 35.9853)
            self.assertEqual(usgc.location_kind, "REGION")
            self.assertEqual(usgc.city, "New Orleans")
            self.assertEqual(usgc.continent_code, "NA")
            country_us = session.get(ReferenceLocation, "COUNTRY_US")
            subdivision_us_tx = session.get(ReferenceLocation, "SUBDIVISION_US_TX")
            subdivision_ca_ab = session.get(ReferenceLocation, "SUBDIVISION_CA_AB")
            self.assertIsNotNone(country_us)
            self.assertIsNotNone(subdivision_us_tx)
            self.assertIsNotNone(subdivision_ca_ab)
            assert country_us is not None
            assert subdivision_us_tx is not None
            assert subdivision_ca_ab is not None
            self.assertEqual(country_us.parent_location_code, "CONTINENT_NA")
            self.assertEqual(country_us.location_type, "COUNTRY")
            self.assertEqual(subdivision_us_tx.parent_location_code, "COUNTRY_US")
            self.assertEqual(subdivision_us_tx.location_type, "STATE")
            self.assertEqual(subdivision_ca_ab.location_type, "PROVINCE")
            self.assertTrue(
                {
                    row.code
                    for row in session.query(ReferenceCounterparty).all()
                }.issuperset(
                    {
                        "BP",
                        "CHEVRON",
                        "CONSTELLATION",
                        "MERCURIA",
                        "TRAFIGURA",
                        "VALERO",
                    }
                )
            )

    def test_transaction_seed_supports_add_replace_and_delete(self) -> None:
        with self.SessionLocal() as session:
            scenarios = list_admin_transaction_scenarios()
            self.assertEqual([row.code for row in scenarios], ["core_demo", "gulf_coast_dislocation"])

            first = seed_admin_transactions(
                TransactionSeedRequest(
                    action="replace",
                    scenario_codes=["core_demo"],
                    requested_by="test-user",
                ),
                db=session,
            )
            self.assertEqual(first.trades_seeded, 4)
            self.assertEqual(first.positions_rebuilt, 4)

            second = seed_admin_transactions(
                TransactionSeedRequest(
                    action="add",
                    scenario_codes=["gulf_coast_dislocation"],
                    requested_by="test-user",
                ),
                db=session,
            )
            self.assertEqual(second.trades_seeded, 2)
            self.assertEqual(session.query(Trade).count(), 6)

            third = seed_admin_transactions(
                TransactionSeedRequest(
                    action="replace",
                    scenario_codes=["gulf_coast_dislocation"],
                    requested_by="test-user",
                ),
                db=session,
            )
            self.assertEqual(third.scenario_codes, ["gulf_coast_dislocation"])
            self.assertEqual(session.query(Trade).count(), 2)

            final_payload = seed_admin_transactions(
                TransactionSeedRequest(
                    action="delete",
                    scenario_codes=[],
                    requested_by="test-user",
                ),
                db=session,
            )
            self.assertEqual(final_payload.action, "delete")
            self.assertEqual(session.query(Trade).count(), 0)
            self.assertEqual(session.query(Event).count(), 0)
            self.assertEqual(session.query(Position).count(), 0)

    def test_reporting_module_reads_seeded_transaction_data(self) -> None:
        with self.SessionLocal() as session:
            seed_admin_transactions(
                TransactionSeedRequest(
                    action="replace",
                    scenario_codes=["core_demo", "gulf_coast_dislocation"],
                    requested_by="test-user",
                ),
                db=session,
            )

            exposure = get_exposure_summary(db=session)
            activity = get_activity_summary(db=session)
            overview = get_reporting_overview(db=session)

            self.assertEqual(exposure[0].commodity, "DIESEL")
            self.assertTrue(any(row.commodity == "WTI" and row.net_volume == 100000.0 for row in exposure))
            self.assertTrue(any(row.event_type == "TradeCreated" and row.event_count == 6 for row in activity))
            self.assertEqual(overview.active_trade_count, 5)
            self.assertEqual(overview.tracked_commodity_count, 4)


if __name__ == "__main__":
    unittest.main()
