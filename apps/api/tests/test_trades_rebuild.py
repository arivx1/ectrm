from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.event import Event
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.routes.events import append_event
from apps.api.app.schemas.event import EventCreate
from apps.api.scripts import rebuild_trades_projection


def coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class TradesRebuildScriptTests(unittest.TestCase):
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
        self.now = datetime(2026, 3, 11, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceCurrency).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.commit()
            self._seed_reference_data(session)

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
        session.add(
            ReferenceCommodity(
                code="WTI",
                commodity_class="CRUDE_OIL",
                name="WTI",
                description="Test commodity",
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
        session.commit()

    def _request(self):
        return SimpleNamespace(
            state=SimpleNamespace(correlation_id="test-correlation", actor_id=None),
            headers={},
        )

    def test_rebuild_preserves_extended_trade_header_fields(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-REBUILD-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "external_trade_id": "EXT-9001",
                        "source_system": "ETRM",
                        "execution_timestamp": "2026-03-11T06:15:00-06:00",
                        "trade_date": "2026-03-11",
                        "effective_start_date": "2026-04-01",
                        "effective_end_date": "2026-04-30",
                        "quality_spec": "10 PPM sulfur max",
                        "unit_of_measure": "BBL",
                        "trade_currency_code": "USD",
                        "location_code": "CUSHING",
                        "delivery_start": "2026-04-01",
                        "delivery_end": "2026-04-30",
                        "price_unit_code": "BBL",
                        "book": "CRUDE_PHYS",
                        "portfolio": "OIL_DISCRETIONARY",
                        "counterparty": "SHELL_TRADING",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "pricing_status": "PRICED",
                        "confirmation_status": "CONFIRMED",
                        "nomination_status": "COMPLETED",
                        "allocation_status": "COMPLETED",
                        "invoice_status": "APPROVED",
                        "payment_status": "PAID",
                        "settlement_status": "SETTLED",
                        "trader_user": "trader.alpha",
                        "trade_side": "BUY",
                        "price": 81,
                        "volume": 500,
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            trade_before = session.query(Trade).filter(Trade.trade_id == "T-REBUILD-1").one()
            self.assertEqual(trade_before.external_trade_id, "EXT-9001")

            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Trade).delete()
            session.commit()

        with patch.object(rebuild_trades_projection, "SessionLocal", self.SessionLocal):
            rebuild_trades_projection.main()

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-REBUILD-1").one()
            leg = session.query(TradeLeg).filter(TradeLeg.trade_id == "T-REBUILD-1").one()
            term = session.query(TradePriceTerm).filter(TradePriceTerm.trade_id == "T-REBUILD-1").one()

        self.assertEqual(trade.external_trade_id, "EXT-9001")
        self.assertEqual(trade.source_system, "ETRM")
        self.assertEqual(
            coerce_utc(trade.execution_timestamp),
            datetime(2026, 3, 11, 12, 15, tzinfo=timezone.utc),
        )
        self.assertEqual(str(trade.trade_date), "2026-03-11")
        self.assertEqual(str(trade.effective_start_date), "2026-04-01")
        self.assertEqual(str(trade.effective_end_date), "2026-04-30")
        self.assertEqual(trade.quality_spec, "10 PPM sulfur max")
        self.assertEqual(trade.unit_of_measure, "BBL")
        self.assertEqual(trade.trade_currency_code, "USD")
        self.assertEqual(trade.location_code, "CUSHING")
        self.assertEqual(str(trade.delivery_start), "2026-04-01")
        self.assertEqual(str(trade.delivery_end), "2026-04-30")
        self.assertEqual(trade.price_unit_code, "BBL")
        self.assertEqual(trade.book, "CRUDE_PHYS")
        self.assertEqual(trade.portfolio, "OIL_DISCRETIONARY")
        self.assertEqual(trade.counterparty, "SHELL_TRADING")
        self.assertEqual(trade.pricing_status, "PRICED")
        self.assertEqual(trade.confirmation_status, "CONFIRMED")
        self.assertEqual(trade.nomination_status, "COMPLETED")
        self.assertEqual(trade.allocation_status, "COMPLETED")
        self.assertEqual(trade.invoice_status, "APPROVED")
        self.assertEqual(trade.payment_status, "PAID")
        self.assertEqual(trade.settlement_status, "SETTLED")
        self.assertEqual(trade.trader_user, "trader.alpha")
        self.assertEqual(leg.location_code, "CUSHING")
        self.assertEqual(leg.quantity_unit_code, "BBL")
        self.assertEqual(str(leg.delivery_start), "2026-04-01")
        self.assertEqual(str(leg.delivery_end), "2026-04-30")
        self.assertEqual(term.currency_code, "USD")
        self.assertEqual(term.price_unit_code, "BBL")

    def test_rebuild_clears_carried_portfolio_when_book_changes_without_replacement(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                ReferenceBook(
                    code="POWER_BOOK",
                    name="Power Book",
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
                    Event(
                        event_id="event-1",
                        aggregate_type="trade",
                        aggregate_id="T-REBUILD-BOOK-1",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        recorded_at=self.now,
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "book": "CRUDE_PHYS",
                            "portfolio": "OIL_DISCRETIONARY",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "price": 81,
                            "volume": 500,
                        },
                    ),
                    Event(
                        event_id="event-2",
                        aggregate_type="trade",
                        aggregate_id="T-REBUILD-BOOK-1",
                        event_type="TradeAmended",
                        occurred_at=datetime(2026, 3, 11, 12, 5, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 11, 12, 5, tzinfo=timezone.utc),
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={"book": "POWER_BOOK"},
                    ),
                ]
            )
            session.commit()

        with patch.object(rebuild_trades_projection, "SessionLocal", self.SessionLocal):
            rebuild_trades_projection.main()

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-REBUILD-BOOK-1").one()

        self.assertEqual(trade.book, "POWER_BOOK")
        self.assertIsNone(trade.portfolio)

    def test_rebuild_preserves_option_lifecycle_closeout_statuses(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Event(
                        event_id="event-opt-exercise-create",
                        aggregate_type="trade",
                        aggregate_id="T-OPT-EXERCISED-1",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        recorded_at=self.now,
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "instrument_type": "OPTION",
                            "trade_nature": "FINANCIAL",
                            "trade_structure": "SINGLE",
                            "trade_side": "BUY",
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 3.5,
                            "volume": 10,
                            "option_type": "CALL",
                            "option_style": "AMERICAN",
                            "option_strike_price": 81,
                            "option_expiration_date": "2026-06-30",
                        },
                    ),
                    Event(
                        event_id="event-opt-exercise-close",
                        aggregate_type="trade",
                        aggregate_id="T-OPT-EXERCISED-1",
                        event_type="OptionExercised",
                        occurred_at=datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc),
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={},
                    ),
                    Event(
                        event_id="event-opt-expired-create",
                        aggregate_type="trade",
                        aggregate_id="T-OPT-EXPIRED-1",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        recorded_at=self.now,
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "instrument_type": "OPTION",
                            "trade_nature": "FINANCIAL",
                            "trade_structure": "SINGLE",
                            "trade_side": "BUY",
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 2.2,
                            "volume": 4,
                            "option_type": "PUT",
                            "option_style": "AMERICAN",
                            "option_strike_price": 74,
                            "option_expiration_date": "2026-03-19",
                        },
                    ),
                    Event(
                        event_id="event-opt-expired-close",
                        aggregate_type="trade",
                        aggregate_id="T-OPT-EXPIRED-1",
                        event_type="OptionExpired",
                        occurred_at=datetime(2026, 3, 19, 18, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 19, 18, 0, tzinfo=timezone.utc),
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={},
                    ),
                    Event(
                        event_id="event-opt-assigned-create",
                        aggregate_type="trade",
                        aggregate_id="T-OPT-ASSIGNED-1",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        recorded_at=self.now,
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "instrument_type": "OPTION",
                            "trade_nature": "FINANCIAL",
                            "trade_structure": "SINGLE",
                            "trade_side": "SELL",
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 1.8,
                            "volume": 5,
                            "option_type": "CALL",
                            "option_style": "AMERICAN",
                            "option_strike_price": 83,
                            "option_expiration_date": "2026-06-30",
                        },
                    ),
                    Event(
                        event_id="event-opt-assigned-close",
                        aggregate_type="trade",
                        aggregate_id="T-OPT-ASSIGNED-1",
                        event_type="OptionAssigned",
                        occurred_at=datetime(2026, 3, 21, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 21, 12, 0, tzinfo=timezone.utc),
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={},
                    ),
                ]
            )
            session.commit()

        with patch.object(rebuild_trades_projection, "SessionLocal", self.SessionLocal):
            rebuild_trades_projection.main()

        with self.SessionLocal() as session:
            exercised_trade = session.query(Trade).filter(Trade.trade_id == "T-OPT-EXERCISED-1").one()
            expired_trade = session.query(Trade).filter(Trade.trade_id == "T-OPT-EXPIRED-1").one()
            assigned_trade = session.query(Trade).filter(Trade.trade_id == "T-OPT-ASSIGNED-1").one()

        self.assertEqual(exercised_trade.status, "EXERCISED")
        self.assertEqual(expired_trade.status, "EXPIRED")
        self.assertEqual(assigned_trade.status, "ASSIGNED")

    def test_rebuild_preserves_originating_option_trade_link_on_resulting_linear_trade(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Event(
                        event_id="event-opt-link-create",
                        aggregate_type="trade",
                        aggregate_id="T-OPT-LINKED-REBUILD-1",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        recorded_at=self.now,
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "instrument_type": "OPTION",
                            "trade_nature": "FINANCIAL",
                            "trade_structure": "SINGLE",
                            "trade_side": "BUY",
                            "book": "CRUDE_PHYS",
                            "portfolio": "PROMPT",
                            "counterparty": "SHELL_TRADING",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 3.5,
                            "volume": 10,
                            "unit_of_measure": "BBL",
                            "trade_currency_code": "USD",
                            "location_code": "CUSHING",
                            "price_unit_code": "BBL",
                            "option_type": "CALL",
                            "option_style": "AMERICAN",
                            "option_strike_price": 81,
                            "option_expiration_date": "2026-06-30",
                        },
                    ),
                    Event(
                        event_id="event-opt-link-exercise",
                        aggregate_type="trade",
                        aggregate_id="T-OPT-LINKED-REBUILD-1",
                        event_type="OptionExercised",
                        occurred_at=datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc),
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={},
                    ),
                    Event(
                        event_id="event-opt-link-child-create",
                        aggregate_type="trade",
                        aggregate_id="T-OPT-LINKED-REBUILD-1-UNDERLYING",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 20, 12, 1, tzinfo=timezone.utc),
                        actor_id="ops-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "originating_option_trade_id": "T-OPT-LINKED-REBUILD-1",
                            "source_system": "OPTION_SETTLEMENT",
                            "instrument_type": "LINEAR",
                            "trade_nature": "FINANCIAL",
                            "trade_structure": "SINGLE",
                            "trade_side": "BUY",
                            "book": "CRUDE_PHYS",
                            "portfolio": "PROMPT",
                            "counterparty": "SHELL_TRADING",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "pricing_status": "PRICED",
                            "price": 81,
                            "volume": 10,
                            "unit_of_measure": "BBL",
                            "trade_currency_code": "USD",
                            "location_code": "CUSHING",
                            "price_unit_code": "BBL",
                        },
                    ),
                ]
            )
            session.commit()

        with patch.object(rebuild_trades_projection, "SessionLocal", self.SessionLocal):
            rebuild_trades_projection.main()

        with self.SessionLocal() as session:
            linked_trade = (
                session.query(Trade)
                .filter(Trade.trade_id == "T-OPT-LINKED-REBUILD-1-UNDERLYING")
                .one()
            )

        self.assertEqual(linked_trade.originating_option_trade_id, "T-OPT-LINKED-REBUILD-1")
        self.assertEqual(linked_trade.instrument_type, "LINEAR")
        self.assertEqual(linked_trade.trade_side, "BUY")

    def test_rebuild_rejects_invalid_trade_header_status_values(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                Event(
                    event_id="event-invalid-status",
                    aggregate_type="trade",
                    aggregate_id="T-REBUILD-INVALID-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    recorded_at=self.now,
                    actor_id="test-user",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "pricing_status": "UNKNOWN",
                        "trade_side": "BUY",
                        "price": 81,
                        "volume": 500,
                    },
                )
            )
            session.commit()

        with patch.object(rebuild_trades_projection, "SessionLocal", self.SessionLocal):
            with self.assertRaisesRegex(ValueError, "Pricing status 'UNKNOWN' is invalid"):
                rebuild_trades_projection.main()

    def test_rebuild_can_clear_price_when_switching_to_index_pricing(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Event(
                        event_id="event-create-index-shift",
                        aggregate_type="trade",
                        aggregate_id="T-REBUILD-INDEX-1",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        recorded_at=self.now,
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=3,
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "price": 81,
                            "volume": 500,
                        },
                    ),
                    Event(
                        event_id="event-amend-index-shift",
                        aggregate_type="trade",
                        aggregate_id="T-REBUILD-INDEX-1",
                        event_type="TradeAmended",
                        occurred_at=datetime(2026, 3, 11, 12, 5, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 11, 12, 5, tzinfo=timezone.utc),
                        actor_id="test-user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=3,
                        payload={
                            "pricing_type": "INDEX",
                            "price_index_code": "WTI_M1",
                            "price": None,
                        },
                    ),
                ]
            )
            session.commit()

        with patch.object(rebuild_trades_projection, "SessionLocal", self.SessionLocal):
            rebuild_trades_projection.main()

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-REBUILD-INDEX-1").one()

        self.assertEqual(trade.pricing_type, "INDEX")
        self.assertEqual(trade.price_index_code, "WTI_M1")
        self.assertIsNone(trade.price)


if __name__ == "__main__":
    unittest.main()
