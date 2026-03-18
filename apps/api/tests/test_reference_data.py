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
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.position import Position
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.routes.events import append_event
from apps.api.app.routes.reference_data import (
    CommodityCreate,
    CommodityStatusUpdate,
    CounterpartyCreate,
    CurrencyCreate,
    CurrencyStatusUpdate,
    LocationCreate,
    LocationStatusUpdate,
    PriceIndexCreate,
    PriceIndexUpdate,
    PortfolioCreate,
    PortfolioUpdate,
    UnitCreate,
    UnitStatusUpdate,
    create_commodity,
    create_counterparty,
    create_currency,
    create_location,
    create_portfolio,
    create_price_index,
    create_unit,
    deactivate_currency,
    deactivate_commodity,
    deactivate_location,
    deactivate_price_index,
    deactivate_unit,
    list_price_indices,
    update_price_index,
)
from apps.api.app.schemas.reference_data import PriceIndexStatusUpdate
from apps.api.app.schemas.event import EventCreate


def coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class ReferenceDataApiTests(unittest.TestCase):
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
            session.query(ReferencePriceIndex).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceCurrency).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Position).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.query(Trade).delete()
            session.commit()

    def _create_commodity(self, code: str, is_active: bool = True) -> None:
        with self.SessionLocal() as session:
            create_commodity(
                CommodityCreate(
                    code=code,
                    name=f"{code} Commodity",
                    commodity_class="CRUDE_OIL",
                    description="test commodity",
                    created_by="test-user",
                ),
                db=session,
            )
            if not is_active:
                deactivate_commodity(
                    code,
                    CommodityStatusUpdate(updated_by="test-user"),
                    db=session,
                )

    def _create_book(self, code: str, is_active: bool = True) -> None:
        with self.SessionLocal() as session:
            session.add(
                ReferenceBook(
                    code=code,
                    name=f"{code} Book",
                    description="test book",
                    is_active=is_active,
                    effective_from=None,
                    effective_to=None,
                    created_at=datetime.now(timezone.utc),
                    created_by="test-user",
                    updated_at=datetime.now(timezone.utc),
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def _request(self):
        return SimpleNamespace(state=SimpleNamespace(correlation_id="test-correlation"), headers={})

    def _create_currency(self, code: str, symbol: str | None = None) -> None:
        with self.SessionLocal() as session:
            create_currency(
                CurrencyCreate(
                    code=code,
                    name=f"{code} Currency",
                    symbol=symbol,
                    description="test currency",
                    created_by="test-user",
                ),
                db=session,
            )

    def _create_unit(self, code: str, dimension: str = "VOLUME") -> None:
        with self.SessionLocal() as session:
            create_unit(
                UnitCreate(
                    code=code,
                    name=f"{code} Unit",
                    commodity_class="CRUDE_OIL",
                    dimension=dimension,
                    description="test unit",
                    created_by="test-user",
                ),
                db=session,
            )

    def _create_location(self, code: str) -> None:
        with self.SessionLocal() as session:
            create_location(
                LocationCreate(
                    code=code,
                    name=f"{code} Location",
                    location_type="HUB",
                    market="PHYSICAL",
                    country_code="US",
                    region="GULF",
                    timezone="America/Chicago",
                    description="test location",
                    created_by="test-user",
                ),
                db=session,
            )

    def test_create_price_index_requires_active_commodity(self) -> None:
        self._create_currency("USD", "$")
        self._create_unit("BBL")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Commodity 'WTI' is not active"):
                create_price_index(
                    PriceIndexCreate(
                        code="WTI_M1",
                        name="WTI Front Month",
                        commodity_code="WTI",
                        currency_code="usd",
                        unit_code="bbl",
                        provider="ICE",
                        market="nymex",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_create_price_index_normalizes_and_returns_payload(self) -> None:
        self._create_commodity("WTI")
        self._create_currency("USD", "$")
        self._create_unit("BBL")
        self._create_location("CUSHING")

        with self.SessionLocal() as session:
            payload = create_price_index(
                PriceIndexCreate(
                    code="wti_m1",
                    name="WTI Front Month",
                    commodity_code="wti",
                    currency_code="usd",
                    unit_code="bbl",
                    provider="  ICE  ",
                    market="  nymex  ",
                    location_code="  cushing  ",
                    calendar_code="  usny  ",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(payload.code, "WTI_M1")
        self.assertEqual(payload.commodity_code, "WTI")
        self.assertEqual(payload.currency_code, "USD")
        self.assertEqual(payload.unit_code, "BBL")
        self.assertEqual(payload.provider, "ICE")
        self.assertEqual(payload.market, "nymex")
        self.assertEqual(payload.location_code, "CUSHING")
        self.assertEqual(payload.calendar_code, "USNY")

    def test_update_price_index_rejects_inactive_commodity(self) -> None:
        self._create_commodity("WTI")
        self._create_commodity("BRENT", is_active=False)
        self._create_currency("USD", "$")
        self._create_unit("BBL")

        with self.SessionLocal() as session:
            create_price_index(
                PriceIndexCreate(
                    code="WTI_M1",
                    name="WTI Front Month",
                    commodity_code="WTI",
                    currency_code="USD",
                    unit_code="BBL",
                    provider="ICE",
                    created_by="test-user",
                ),
                db=session,
            )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Commodity 'BRENT' is not active"):
                update_price_index(
                    "WTI_M1",
                    PriceIndexUpdate(
                        commodity_code="BRENT",
                        updated_by="test-user",
                    ),
                    db=session,
                )

    def test_list_price_indices_filters_by_commodity_code(self) -> None:
        self._create_commodity("WTI")
        self._create_commodity("BRENT")
        self._create_currency("USD", "$")
        self._create_unit("BBL")

        with self.SessionLocal() as session:
            for code, commodity_code in (("WTI_M1", "WTI"), ("BRENT_M1", "BRENT")):
                create_price_index(
                    PriceIndexCreate(
                        code=code,
                        name=code,
                        commodity_code=commodity_code,
                        currency_code="USD",
                        unit_code="BBL",
                        provider="ICE",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            payload = list_price_indices(
                q=None,
                commodity_code="WTI",
                is_active=None,
                limit=50,
                offset=0,
                db=session,
            )

        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0].code, "WTI_M1")

    def test_create_price_index_requires_active_currency_unit_and_location(self) -> None:
        self._create_commodity("WTI")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Currency 'USD' is not active"):
                create_price_index(
                    PriceIndexCreate(
                        code="WTI_M1",
                        name="WTI Front Month",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="ICE",
                        created_by="test-user",
                    ),
                    db=session,
                )

        self._create_currency("USD", "$")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Unit 'BBL' is not active"):
                create_price_index(
                    PriceIndexCreate(
                        code="WTI_M1",
                        name="WTI Front Month",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="ICE",
                        created_by="test-user",
                    ),
                    db=session,
                )

        self._create_unit("BBL")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Location 'CUSHING' is not active"):
                create_price_index(
                    PriceIndexCreate(
                        code="WTI_M1",
                        name="WTI Front Month",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="ICE",
                        location_code="CUSHING",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_deactivate_currency_unit_and_location_blocked_by_active_price_index(self) -> None:
        self._create_commodity("WTI")
        self._create_currency("USD", "$")
        self._create_unit("BBL")
        self._create_location("CUSHING")

        with self.SessionLocal() as session:
            create_price_index(
                PriceIndexCreate(
                    code="WTI_M1",
                    name="WTI Front Month",
                    commodity_code="WTI",
                    currency_code="USD",
                    unit_code="BBL",
                    provider="ICE",
                    location_code="CUSHING",
                    created_by="test-user",
                ),
                db=session,
            )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Currency cannot be deactivated while active price indices reference it"):
                deactivate_currency("USD", CurrencyStatusUpdate(updated_by="test-user"), db=session)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Unit cannot be deactivated while active price indices reference it"):
                deactivate_unit("BBL", UnitStatusUpdate(updated_by="test-user"), db=session)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Location cannot be deactivated while active price indices reference it"):
                deactivate_location("CUSHING", LocationStatusUpdate(updated_by="test-user"), db=session)

    def test_trade_create_requires_active_book(self) -> None:
        self._create_commodity("WTI")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Book is required and must be selected from reference data"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-BOOK-1",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

        self._create_book("CRUDE_PHYS", is_active=False)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Book 'CRUDE_PHYS' is not active in reference data"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-BOOK-2",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

        with self.SessionLocal() as session:
            session.query(ReferenceBook).delete()
            session.commit()

        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            event = append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-BOOK-3",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "book": "crude_phys",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "price": 80,
                        "volume": 1000,
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-BOOK-3").first()

        self.assertEqual(event.aggregate_id, "T-BOOK-3")
        self.assertIsNotNone(trade)
        self.assertEqual(trade.book, "CRUDE_PHYS")

    def test_trade_sell_updates_positions_as_negative_volume(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SELL-1",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "SELL",
                        "price": 80,
                        "volume": 1000,
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            position = session.query(Position).filter(Position.commodity == "WTI").one()

        self.assertEqual(float(position.net_volume), -1000.0)

    def test_trade_header_fields_validate_active_counterparty_and_matching_portfolio(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Counterparty 'SHELL_TRADING' is not active"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-HEADER-1",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "counterparty": "SHELL_TRADING",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

        with self.SessionLocal() as session:
            create_counterparty(
                CounterpartyCreate(
                    code="SHELL_TRADING",
                    name="Shell Trading",
                    counterparty_type="supplier",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )
            create_portfolio(
                PortfolioCreate(
                    code="POWER_DISCRETIONARY",
                    name="Power Discretionary",
                    book_code="CRUDE_PHYS",
                    description="test portfolio",
                    created_by="test-user",
                ),
                db=session,
            )
            portfolio = session.query(ReferencePortfolio).filter_by(code="POWER_DISCRETIONARY").one()
            portfolio.book_code = "POWER_BOOK"
            session.commit()

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Portfolio 'POWER_DISCRETIONARY' belongs to book 'POWER_BOOK'"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-HEADER-2",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "portfolio": "POWER_DISCRETIONARY",
                            "counterparty": "SHELL_TRADING",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

    def test_trade_amend_persists_extended_header_fields(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            create_counterparty(
                CounterpartyCreate(
                    code="SHELL_TRADING",
                    name="Shell Trading",
                    counterparty_type="supplier",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )
            create_counterparty(
                CounterpartyCreate(
                    code="BP_TRADING",
                    name="BP Trading",
                    counterparty_type="supplier",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )
            create_portfolio(
                PortfolioCreate(
                    code="OIL_DISCRETIONARY",
                    name="Oil Discretionary",
                    book_code="CRUDE_PHYS",
                    description="test portfolio",
                    created_by="test-user",
                ),
                db=session,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-HEADER-3",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "external_trade_id": " ext-001 ",
                        "source_system": "etrm",
                        "execution_timestamp": "2026-03-11T08:30:00-05:00",
                        "book": "CRUDE_PHYS",
                        "portfolio": "oil_discretionary",
                        "counterparty": "shell_trading",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "pricing_status": "priced",
                        "settlement_status": "pending",
                        "trader_user": "trader.alpha",
                        "trade_side": "BUY",
                        "price": 80,
                        "volume": 1000,
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-HEADER-3",
                    event_type="TradeAmended",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "external_trade_id": None,
                        "source_system": "ice_csv",
                        "execution_timestamp": "2026-03-11T14:45:00Z",
                        "counterparty": "BP_TRADING",
                        "portfolio": None,
                        "pricing_status": "pending",
                        "settlement_status": "settled",
                        "trader_user": "trader.beta",
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-HEADER-3").one()

        self.assertIsNone(trade.external_trade_id)
        self.assertEqual(trade.source_system, "ICE_CSV")
        self.assertEqual(
            coerce_utc(trade.execution_timestamp),
            datetime(2026, 3, 11, 14, 45, tzinfo=timezone.utc),
        )
        self.assertEqual(trade.counterparty, "BP_TRADING")
        self.assertIsNone(trade.portfolio)
        self.assertEqual(trade.pricing_status, "PENDING")
        self.assertEqual(trade.settlement_status, "SETTLED")
        self.assertEqual(trade.trader_user, "trader.beta")

    def test_trade_header_fields_reject_invalid_status_values(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Pricing status 'UNKNOWN' is invalid"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-HEADER-INVALID-1",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "pricing_status": "unknown",
                            "trade_side": "BUY",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

            with self.assertRaisesRegex(Exception, "Settlement status 'COMPLETE' is invalid"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-HEADER-INVALID-2",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "settlement_status": "complete",
                            "trade_side": "BUY",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

    def test_swap_positions_use_trade_legs(self) -> None:
        self._create_commodity("WTI")
        self._create_commodity("BRENT")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SWAP-1",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_structure": "SWAP",
                        "price": 0,
                        "volume": 0,
                        "legs": [
                            {
                                "leg_no": 1,
                                "side": "BUY",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "WTI",
                                "volume": 1000,
                            },
                            {
                                "leg_no": 2,
                                "side": "SELL",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "BRENT",
                                "volume": 950,
                            },
                        ],
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            positions = {
                row.commodity: float(row.net_volume)
                for row in session.query(Position).all()
            }

        self.assertEqual(positions["WTI"], 1000.0)
        self.assertEqual(positions["BRENT"], -950.0)

    def test_trade_amend_requires_existing_trade(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Trade not found"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-MISSING-1",
                        event_type="TradeAmended",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={"price": 92},
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

    def test_deactivate_price_index_rejected_while_active_trade_references_it(self) -> None:
        self._create_commodity("WTI")
        self._create_currency("USD", "$")
        self._create_unit("BBL")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            create_price_index(
                PriceIndexCreate(
                    code="WTI_M1",
                    name="WTI Front Month",
                    commodity_code="WTI",
                    currency_code="USD",
                    unit_code="BBL",
                    provider="ICE",
                    created_by="test-user",
                ),
                db=session,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-INDEX-1",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "INDEX",
                        "price_index_code": "WTI_M1",
                        "price": None,
                        "volume": 1000,
                        "trade_side": "BUY",
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Price index cannot be deactivated while active trades reference it"):
                deactivate_price_index(
                    "WTI_M1",
                    PriceIndexStatusUpdate(updated_by="test-user"),
                    db=session,
                )

    def test_create_counterparty_normalizes_type_and_country(self) -> None:
        with self.SessionLocal() as session:
            payload = create_counterparty(
                CounterpartyCreate(
                    code="shell_trading",
                    name="Shell Trading",
                    short_name="Shell",
                    legal_entity_name="Shell Trading US Company",
                    counterparty_type="supplier",
                    country_code="us",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(payload.code, "SHELL_TRADING")
        self.assertEqual(payload.counterparty_type, "SUPPLIER")
        self.assertEqual(payload.country_code, "US")

    def test_portfolio_requires_active_book(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Book 'CRUDE_PHYS' is not active"):
                create_portfolio(
                    PortfolioCreate(
                        code="OIL_DISCRETIONARY",
                        name="Oil Discretionary",
                        book_code="CRUDE_PHYS",
                        owner="ops",
                        strategy="Directional",
                        trader_persona="Speculator",
                        risk_archetype="directional",
                        description="test portfolio",
                        created_by="test-user",
                    ),
                    db=session,
                )

        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            payload = create_portfolio(
                PortfolioCreate(
                    code="OIL_DISCRETIONARY",
                    name="Oil Discretionary",
                    book_code="crude_phys",
                    owner="ops",
                    strategy="Directional",
                    trader_persona="Speculator",
                    risk_archetype="directional",
                    description="test portfolio",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(payload.code, "OIL_DISCRETIONARY")
        self.assertEqual(payload.book_code, "CRUDE_PHYS")
        self.assertEqual(payload.trader_persona, "Speculator")
        self.assertEqual(payload.risk_archetype, "DIRECTIONAL")

        with self.SessionLocal() as session:
            portfolio = session.query(ReferencePortfolio).filter_by(code="OIL_DISCRETIONARY").first()
            self.assertIsNotNone(portfolio)
            self.assertEqual(portfolio.trader_persona, "Speculator")
            self.assertEqual(portfolio.risk_archetype, "DIRECTIONAL")

        self._create_book("POWER_BOOK", is_active=False)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Book 'POWER_BOOK' is not active"):
                update_payload = PortfolioUpdate(book_code="POWER_BOOK", updated_by="test-user")
                from apps.api.app.routes.reference_data import update_portfolio

                update_portfolio("OIL_DISCRETIONARY", update_payload, db=session)

        with self.SessionLocal() as session:
            from apps.api.app.routes.reference_data import update_portfolio

            updated = update_portfolio(
                "OIL_DISCRETIONARY",
                PortfolioUpdate(
                    trader_persona="Risk Manager",
                    risk_archetype="risk_reduction",
                    updated_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(updated.trader_persona, "Risk Manager")
        self.assertEqual(updated.risk_archetype, "RISK_REDUCTION")


if __name__ == "__main__":
    unittest.main()
