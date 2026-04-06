from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

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
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.routes.events import append_event
from apps.api.app.schemas.event import EventCreate


class TradeEventWorkflowTests(unittest.TestCase):
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
        self.now = datetime(2026, 3, 19, 15, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(Position).delete()
            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceCurrency).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.commit()
            self._seed_reference_data(session)

    def _request(self):
        return SimpleNamespace(
            state=SimpleNamespace(correlation_id="test-correlation", actor_id=None),
            headers={},
        )

    def _seed_reference_data(self, session) -> None:
        session.add(
            ReferenceBook(
                code="CRUDE_PHYS",
                name="Crude Physical",
                description="Test book",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add_all(
            [
                ReferenceCommodity(
                    code="WTI",
                    commodity_class="CRUDE_OIL",
                    name="WTI",
                    description="WTI",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test-user",
                    updated_at=self.now,
                    updated_by="test-user",
                    version=1,
                ),
                ReferenceCommodity(
                    code="BRENT",
                    commodity_class="CRUDE_OIL",
                    name="Brent",
                    description="Brent",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test-user",
                    updated_at=self.now,
                    updated_by="test-user",
                    version=1,
                ),
            ]
        )
        session.add(
            ReferenceCounterparty(
                code="SHELL_TRADING",
                name="Shell Trading",
                short_name=None,
                legal_entity_name=None,
                counterparty_type="SUPPLIER",
                country_code=None,
                description="Test counterparty",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferencePortfolio(
                code="OIL_DISCRETIONARY",
                name="Oil Discretionary",
                book_code="CRUDE_PHYS",
                owner=None,
                strategy="Directional",
                trader_persona=None,
                risk_archetype=None,
                description="Test portfolio",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceUnit(
                code="BBL",
                name="Barrel",
                commodity_class="CRUDE_OIL",
                dimension="VOLUME",
                base_unit_code=None,
                conversion_factor=None,
                precision=3,
                description="Barrel",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceCurrency(
                code="USD",
                name="US Dollar",
                symbol="$",
                description="US Dollar",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceLocation(
                code="CUSHING",
                name="Cushing",
                location_kind="POINT",
                location_type="HUB",
                parent_location_code=None,
                market="PHYSICAL",
                city="Cushing",
                subdivision_code="OK",
                country_code="US",
                continent_code="NA",
                latitude=None,
                longitude=None,
                region="Midcontinent",
                timezone="America/Chicago",
                description="Cushing hub",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferencePriceIndex(
                code="WTI_M1",
                name="WTI M1",
                commodity_code="WTI",
                currency_code="USD",
                unit_code="BBL",
                provider="ICE",
                market=None,
                location_code=None,
                calendar_code=None,
                description="WTI M1",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.commit()

    def test_index_trade_can_omit_fixed_price(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-INDEX-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "INDEX",
                        "price_index_code": "WTI_M1",
                        "trade_side": "BUY",
                        "volume": 1000,
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-INDEX-1").one()

        self.assertEqual(trade.pricing_type, "INDEX")
        self.assertEqual(trade.price_index_code, "WTI_M1")
        self.assertIsNone(trade.price)
        self.assertEqual(float(trade.volume), 1000.0)

    def test_trade_created_defaults_source_system_and_persists_quality_and_unit(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-HEADER-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "price": 80.5,
                        "volume": 250,
                        "quality_spec": "10 PPM sulfur max",
                        "unit_of_measure": "BBL",
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-HEADER-1").one()

        self.assertEqual(trade.source_system, "ETRM")
        self.assertEqual(trade.quality_spec, "10 PPM sulfur max")
        self.assertEqual(trade.unit_of_measure, "BBL")

    def test_trade_commercial_terms_persist_to_projection_legs_and_price_terms(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-COMM-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "price": 79.25,
                        "volume": 125,
                        "unit_of_measure": "BBL",
                        "trade_currency_code": "USD",
                        "price_unit_code": "BBL",
                        "location_code": "CUSHING",
                        "trade_date": "2026-03-19",
                        "effective_start_date": "2026-04-01",
                        "effective_end_date": "2026-04-30",
                        "delivery_start": "2026-04-01",
                        "delivery_end": "2026-04-30",
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-COMM-1",
                    event_type="TradeAmended",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "trade_currency_code": "USD",
                        "price_unit_code": "BBL",
                        "location_code": "CUSHING",
                        "delivery_start": "2026-04-05",
                        "delivery_end": "2026-05-01",
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-COMM-1").one()
            leg = session.query(TradeLeg).filter(TradeLeg.trade_id == "T-COMM-1").one()
            term = session.query(TradePriceTerm).filter(TradePriceTerm.trade_id == "T-COMM-1").one()

        self.assertEqual(str(trade.trade_date), "2026-03-19")
        self.assertEqual(str(trade.effective_start_date), "2026-04-01")
        self.assertEqual(str(trade.effective_end_date), "2026-04-30")
        self.assertEqual(trade.trade_currency_code, "USD")
        self.assertEqual(trade.price_unit_code, "BBL")
        self.assertEqual(trade.location_code, "CUSHING")
        self.assertEqual(str(trade.delivery_start), "2026-04-05")
        self.assertEqual(str(trade.delivery_end), "2026-05-01")
        self.assertEqual(leg.location_code, "CUSHING")
        self.assertEqual(leg.quantity_unit_code, "BBL")
        self.assertEqual(str(leg.delivery_start), "2026-04-05")
        self.assertEqual(str(leg.delivery_end), "2026-05-01")
        self.assertEqual(term.currency_code, "USD")
        self.assertEqual(term.price_unit_code, "BBL")

    def test_swap_trade_can_omit_top_level_volume_when_legs_are_present(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SWAP-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FORMULA",
                        "trade_structure": "SWAP",
                        "legs": [
                            {
                                "leg_no": 1,
                                "side": "BUY",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "WTI",
                                "volume": 120,
                            },
                            {
                                "leg_no": 2,
                                "side": "SELL",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "BRENT",
                                "volume": 120,
                            },
                        ],
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-SWAP-1").one()
            legs = session.query(TradeLeg).filter(TradeLeg.trade_id == "T-SWAP-1").order_by(TradeLeg.leg_no.asc()).all()

        self.assertEqual(trade.trade_structure, "SWAP")
        self.assertIsNone(trade.trade_side)
        self.assertIsNone(trade.volume)
        self.assertEqual(len(legs), 2)
        self.assertEqual(float(legs[0].quantity), 120.0)
        self.assertEqual(float(legs[1].quantity), 120.0)

    def test_partial_swap_amend_preserves_existing_legs(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SWAP-AMEND-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FORMULA",
                        "trade_structure": "SWAP",
                        "legs": [
                            {
                                "leg_no": 1,
                                "side": "BUY",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "WTI",
                                "volume": 90,
                            },
                            {
                                "leg_no": 2,
                                "side": "SELL",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "BRENT",
                                "volume": 75,
                            },
                        ],
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SWAP-AMEND-1",
                    event_type="TradeAmended",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "volume": 250,
                        "pricing_status": "PRICED",
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-SWAP-AMEND-1").one()
            legs = session.query(TradeLeg).filter(TradeLeg.trade_id == "T-SWAP-AMEND-1").order_by(TradeLeg.leg_no.asc()).all()
            positions = session.query(Position).order_by(Position.commodity.asc()).all()

        self.assertEqual(trade.pricing_status, "PRICED")
        self.assertEqual(float(trade.volume), 250.0)
        self.assertEqual(len(legs), 2)
        self.assertEqual(float(legs[0].quantity), 90.0)
        self.assertEqual(float(legs[1].quantity), 75.0)
        self.assertEqual([(row.commodity, float(row.net_volume)) for row in positions], [("BRENT", -75.0), ("WTI", 90.0)])


if __name__ == "__main__":
    unittest.main()
