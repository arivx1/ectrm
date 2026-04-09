from __future__ import annotations

import unittest
from datetime import date, datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reports.services.pnl_history import (
    build_pnl_comparison_report,
    build_pnl_history_report,
)
from apps.api.app.models.event import Base, Event
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_price_term import TradePriceTerm


class PnlHistoryReportTests(unittest.TestCase):
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
            session.query(Event).delete()
            session.query(PriceIndexObservation).delete()
            session.query(TradePriceTerm).delete()
            session.query(Trade).delete()
            session.commit()

    def test_event_history_moves_pnl_between_realized_and_unrealized(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Event(
                        event_id="evt-1",
                        aggregate_type="trade",
                        aggregate_id="T-BUY",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 1, 12, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "trade_side": "BUY",
                            "price": 2.0,
                            "volume": 100.0,
                            "settlement_status": "PENDING",
                        },
                    ),
                    Event(
                        event_id="evt-2",
                        aggregate_type="trade",
                        aggregate_id="T-SELL",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 2, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 2, 12, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "trade_side": "SELL",
                            "price": 1.5,
                            "volume": 50.0,
                            "settlement_status": "PENDING",
                        },
                    ),
                    Event(
                        event_id="evt-3",
                        aggregate_type="trade",
                        aggregate_id="T-BUY",
                        event_type="TradeAmended",
                        occurred_at=datetime(2026, 3, 3, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 3, 12, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={"settlement_status": "SETTLED"},
                    ),
                    Event(
                        event_id="evt-4",
                        aggregate_type="trade",
                        aggregate_id="T-SELL",
                        event_type="TradeCancelled",
                        occurred_at=datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 4, 12, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={},
                    ),
                ]
            )
            session.commit()

            report = build_pnl_history_report(session, as_of=date(2026, 3, 4))

        self.assertEqual(report["point_count"], 4)
        self.assertEqual(
            report["points"],
            [
                {
                    "date": date(2026, 3, 1),
                    "total_pnl": 200.0,
                    "realized_pnl": 0.0,
                    "unrealized_pnl": 200.0,
                    "priced_trade_count": 1,
                    "realized_trade_count": 0,
                    "unrealized_trade_count": 1,
                },
                {
                    "date": date(2026, 3, 2),
                    "total_pnl": 125.0,
                    "realized_pnl": 0.0,
                    "unrealized_pnl": 125.0,
                    "priced_trade_count": 2,
                    "realized_trade_count": 0,
                    "unrealized_trade_count": 2,
                },
                {
                    "date": date(2026, 3, 3),
                    "total_pnl": 125.0,
                    "realized_pnl": 200.0,
                    "unrealized_pnl": -75.0,
                    "priced_trade_count": 2,
                    "realized_trade_count": 1,
                    "unrealized_trade_count": 1,
                },
                {
                    "date": date(2026, 3, 4),
                    "total_pnl": 200.0,
                    "realized_pnl": 200.0,
                    "unrealized_pnl": 0.0,
                    "priced_trade_count": 1,
                    "realized_trade_count": 1,
                    "unrealized_trade_count": 0,
                },
            ],
        )
        self.assertEqual(
            report["summary"],
            {
                "total_pnl": 200.0,
                "realized_pnl": 200.0,
                "unrealized_pnl": 0.0,
                "priced_trade_count": 1,
                "realized_trade_count": 1,
                "unrealized_trade_count": 0,
            },
        )

    def test_legacy_trade_rows_are_included_without_event_history(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="LEGACY-1",
                    created_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                    execution_timestamp=None,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE_PHYS",
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=10.0,
                    volume=3.0,
                    settlement_status="SETTLED",
                    status="ACTIVE",
                    last_event_id="legacy-event-1",
                )
            )
            session.commit()

            report = build_pnl_history_report(session, as_of=date(2026, 3, 6))

        self.assertEqual(report["point_count"], 2)
        self.assertEqual(
            report["points"],
            [
                {
                    "date": date(2026, 3, 5),
                    "total_pnl": 30.0,
                    "realized_pnl": 30.0,
                    "unrealized_pnl": 0.0,
                    "priced_trade_count": 1,
                    "realized_trade_count": 1,
                    "unrealized_trade_count": 0,
                },
                {
                    "date": date(2026, 3, 6),
                    "total_pnl": 30.0,
                    "realized_pnl": 30.0,
                    "unrealized_pnl": 0.0,
                    "priced_trade_count": 1,
                    "realized_trade_count": 1,
                    "unrealized_trade_count": 0,
                },
            ],
        )

    def test_index_and_hybrid_trades_use_latest_available_market_marks(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Event(
                        event_id="evt-mtm-1",
                        aggregate_type="trade",
                        aggregate_id="T-HYBRID",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 1, 9, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "trade_side": "BUY",
                            "pricing_type": "HYBRID",
                            "price_index_code": "USGC_DIESEL_SPOT_D",
                            "price": 1.5,
                            "volume": 10.0,
                            "settlement_status": "PENDING",
                        },
                    ),
                    Event(
                        event_id="evt-mtm-2",
                        aggregate_type="trade",
                        aggregate_id="T-INDEX",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 1, 10, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "trade_side": "SELL",
                            "pricing_type": "INDEX",
                            "price_index_code": "GASOLINE_US_REG_W",
                            "price": None,
                            "volume": 4.0,
                            "settlement_status": "PENDING",
                        },
                    ),
                    PriceIndexObservation(
                        id=100,
                        price_index_code="GASOLINE_US_REG_W",
                        observation_date=date(2026, 3, 1),
                        value=3.0,
                        unit_code="GAL",
                        currency_code="USD",
                        source_provider="EIA",
                        source_series_id="GAS",
                        source_frequency="WEEKLY",
                        source_published_at=None,
                        source_revision=None,
                        downloaded_at=datetime(2026, 3, 1, 17, 0, tzinfo=timezone.utc),
                        run_id=1,
                        raw_payload=None,
                        created_at=datetime(2026, 3, 1, 17, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 1, 17, 0, tzinfo=timezone.utc),
                    ),
                    PriceIndexObservation(
                        id=101,
                        price_index_code="USGC_DIESEL_SPOT_D",
                        observation_date=date(2026, 3, 2),
                        value=5.0,
                        unit_code="GAL",
                        currency_code="USD",
                        source_provider="EIA",
                        source_series_id="DSL",
                        source_frequency="DAILY",
                        source_published_at=None,
                        source_revision=None,
                        downloaded_at=datetime(2026, 3, 2, 17, 0, tzinfo=timezone.utc),
                        run_id=1,
                        raw_payload=None,
                        created_at=datetime(2026, 3, 2, 17, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 2, 17, 0, tzinfo=timezone.utc),
                    ),
                    PriceIndexObservation(
                        id=102,
                        price_index_code="USGC_DIESEL_SPOT_D",
                        observation_date=date(2026, 3, 3),
                        value=6.0,
                        unit_code="GAL",
                        currency_code="USD",
                        source_provider="EIA",
                        source_series_id="DSL",
                        source_frequency="DAILY",
                        source_published_at=None,
                        source_revision=None,
                        downloaded_at=datetime(2026, 3, 3, 17, 0, tzinfo=timezone.utc),
                        run_id=1,
                        raw_payload=None,
                        created_at=datetime(2026, 3, 3, 17, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 3, 17, 0, tzinfo=timezone.utc),
                    ),
                    PriceIndexObservation(
                        id=103,
                        price_index_code="GASOLINE_US_REG_W",
                        observation_date=date(2026, 3, 3),
                        value=4.0,
                        unit_code="GAL",
                        currency_code="USD",
                        source_provider="EIA",
                        source_series_id="GAS",
                        source_frequency="WEEKLY",
                        source_published_at=None,
                        source_revision=None,
                        downloaded_at=datetime(2026, 3, 3, 17, 0, tzinfo=timezone.utc),
                        run_id=1,
                        raw_payload=None,
                        created_at=datetime(2026, 3, 3, 17, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 3, 17, 0, tzinfo=timezone.utc),
                    ),
                ]
            )
            session.commit()

            report = build_pnl_history_report(session, as_of=date(2026, 3, 3))

        self.assertEqual(
            report["points"],
            [
                {
                    "date": date(2026, 3, 1),
                    "total_pnl": -12.0,
                    "realized_pnl": 0.0,
                    "unrealized_pnl": -12.0,
                    "priced_trade_count": 1,
                    "realized_trade_count": 0,
                    "unrealized_trade_count": 1,
                },
                {
                    "date": date(2026, 3, 2),
                    "total_pnl": 53.0,
                    "realized_pnl": 0.0,
                    "unrealized_pnl": 53.0,
                    "priced_trade_count": 2,
                    "realized_trade_count": 0,
                    "unrealized_trade_count": 2,
                },
                {
                    "date": date(2026, 3, 3),
                    "total_pnl": 59.0,
                    "realized_pnl": 0.0,
                    "unrealized_pnl": 59.0,
                    "priced_trade_count": 2,
                    "realized_trade_count": 0,
                    "unrealized_trade_count": 2,
                },
            ],
        )

    def test_filters_limit_report_by_book_portfolio_commodity_class_and_date_window(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Event(
                        event_id="evt-filter-1",
                        aggregate_type="trade",
                        aggregate_id="T-CRUDE",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 1, 8, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "trade_side": "BUY",
                            "book": "CRUDE_PHYS",
                            "portfolio": "PROMPT",
                            "commodity_class": "CRUDE_OIL",
                            "price": 2.0,
                            "volume": 100.0,
                            "settlement_status": "PENDING",
                        },
                    ),
                    Event(
                        event_id="evt-filter-2",
                        aggregate_type="trade",
                        aggregate_id="T-POWER",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 2, 8, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 2, 8, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "trade_side": "BUY",
                            "book": "POWER_WEST",
                            "portfolio": "LOAD_SHAPING",
                            "commodity_class": "POWER",
                            "price": 5.0,
                            "volume": 4.0,
                            "settlement_status": "PENDING",
                        },
                    ),
                ]
            )
            session.commit()

            report = build_pnl_history_report(
                session,
                as_of=date(2026, 3, 4),
                book="power_west",
                portfolio="load_shaping",
                commodity_class="power",
                date_from=date(2026, 3, 2),
                date_to=date(2026, 3, 3),
            )

        self.assertEqual(report["point_count"], 2)
        self.assertEqual(
            report["points"],
            [
                {
                    "date": date(2026, 3, 2),
                    "total_pnl": 20.0,
                    "realized_pnl": 0.0,
                    "unrealized_pnl": 20.0,
                    "priced_trade_count": 1,
                    "realized_trade_count": 0,
                    "unrealized_trade_count": 1,
                },
                {
                    "date": date(2026, 3, 3),
                    "total_pnl": 20.0,
                    "realized_pnl": 0.0,
                    "unrealized_pnl": 20.0,
                    "priced_trade_count": 1,
                    "realized_trade_count": 0,
                    "unrealized_trade_count": 1,
                },
            ],
        )
        self.assertEqual(
            report["summary"],
            {
                "total_pnl": 20.0,
                "realized_pnl": 0.0,
                "unrealized_pnl": 20.0,
                "priced_trade_count": 1,
                "realized_trade_count": 0,
                "unrealized_trade_count": 1,
            },
        )

    def test_date_window_before_first_trade_returns_empty_report(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                Event(
                    event_id="evt-window-1",
                    aggregate_type="trade",
                    aggregate_id="T-LATE",
                    event_type="TradeCreated",
                    occurred_at=datetime(2026, 3, 10, 8, 0, tzinfo=timezone.utc),
                    recorded_at=datetime(2026, 3, 10, 8, 1, tzinfo=timezone.utc),
                    actor_id="ops",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={
                        "trade_side": "BUY",
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "price": 4.0,
                        "volume": 5.0,
                        "settlement_status": "PENDING",
                    },
                )
            )
            session.commit()

            report = build_pnl_history_report(
                session,
                date_from=date(2026, 3, 1),
                date_to=date(2026, 3, 5),
            )

        self.assertEqual(report["point_count"], 0)
        self.assertEqual(report["points"], [])
        self.assertEqual(
            report["summary"],
            {
                "total_pnl": 0.0,
                "realized_pnl": 0.0,
                "unrealized_pnl": 0.0,
                "priced_trade_count": 0,
                "realized_trade_count": 0,
                "unrealized_trade_count": 0,
            },
        )

    def test_current_snapshot_prefers_projected_primary_price_term(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="TERM-1",
                    created_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 6, 8, 0, tzinfo=timezone.utc),
                    execution_timestamp=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE_PHYS",
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    trade_currency_code="USD",
                    price_unit_code="BBL",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=10.0,
                    volume=2.0,
                    settlement_status="PENDING",
                    status="ACTIVE",
                    instrument_type="LINEAR",
                    last_event_id="legacy-event-term-1",
                )
            )
            session.add(
                TradePriceTerm(
                    trade_price_term_id="term-1-primary",
                    trade_id="TERM-1",
                    term_no=1,
                    pricing_type="FIXED",
                    fixed_price=12.0,
                    price_index_code=None,
                    currency_code="USD",
                    price_unit_code="BBL",
                    created_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 6, 8, 0, tzinfo=timezone.utc),
                )
            )
            session.commit()

            report = build_pnl_history_report(session, as_of=date(2026, 3, 6))

        self.assertEqual(report["summary"]["total_pnl"], 24.0)
        self.assertEqual(report["points"][-1]["total_pnl"], 24.0)
        self.assertEqual(len(report["valuations"]), 1)
        self.assertEqual(
            report["valuations"][0],
            {
                "trade_id": "TERM-1",
                "book": "CRUDE_PHYS",
                "portfolio": None,
                "commodity_class": "CRUDE_OIL",
                "instrument_type": "LINEAR",
                "trade_structure": "SINGLE",
                "trade_side": "BUY",
                "settlement_status": "PENDING",
                "pnl_bucket": "UNREALIZED",
                "pricing_type": "FIXED",
                "pricing_source": "PRIMARY_PRICE_TERM",
                "fixed_price": 12.0,
                "price_index_code": None,
                "market_price": None,
                "effective_mark": 12.0,
                "quantity": 2.0,
                "direction": 1,
                "trade_currency_code": "USD",
                "price_unit_code": "BBL",
                "pnl_contribution": 24.0,
                "valuation_status": "VALUED",
                "valuation_status_reason": None,
                "included_in_totals": True,
            },
        )

    def test_historical_window_uses_event_state_before_later_price_amendment(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Event(
                        event_id="evt-hist-1",
                        aggregate_type="trade",
                        aggregate_id="T-HIST",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 1, 9, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "trade_side": "BUY",
                            "pricing_type": "FIXED",
                            "price": 5.0,
                            "volume": 10.0,
                            "settlement_status": "PENDING",
                        },
                    ),
                    Event(
                        event_id="evt-hist-2",
                        aggregate_type="trade",
                        aggregate_id="T-HIST",
                        event_type="TradeAmended",
                        occurred_at=datetime(2026, 3, 3, 9, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 3, 9, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={"price": 7.0},
                    ),
                    TradePriceTerm(
                        trade_price_term_id="term-hist-primary",
                        trade_id="T-HIST",
                        term_no=1,
                        pricing_type="FIXED",
                        fixed_price=7.0,
                        price_index_code=None,
                        currency_code="USD",
                        price_unit_code="BBL",
                        created_at=datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 3, 9, 1, tzinfo=timezone.utc),
                    ),
                ]
            )
            session.commit()

            report = build_pnl_history_report(session, as_of=date(2026, 3, 2))

        self.assertEqual(report["summary"]["total_pnl"], 50.0)
        self.assertEqual(
            report["valuations"][0]["pricing_source"],
            "EVENT_STATE",
        )
        self.assertEqual(report["valuations"][0]["fixed_price"], 5.0)
        self.assertEqual(report["valuations"][0]["effective_mark"], 5.0)
        self.assertEqual(report["valuations"][0]["pnl_contribution"], 50.0)

    def test_unsupported_trades_are_reported_but_excluded_from_totals(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Trade(
                        trade_id="FORMULA-1",
                        created_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                        execution_timestamp=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="CRUDE_PHYS",
                        commodity_class="CRUDE_OIL",
                        commodity="WTI",
                        pricing_type="FORMULA",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=80.0,
                        volume=1.0,
                        settlement_status="PENDING",
                        status="ACTIVE",
                        instrument_type="LINEAR",
                        last_event_id="legacy-formula-1",
                    ),
                    Trade(
                        trade_id="OPTION-1",
                        created_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                        execution_timestamp=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                        trade_nature="FINANCIAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="CRUDE_PHYS",
                        commodity_class="CRUDE_OIL",
                        commodity="WTI",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=2.0,
                        volume=100.0,
                        settlement_status="PENDING",
                        status="ACTIVE",
                        instrument_type="OPTION",
                        option_type="CALL",
                        option_expiration_date=date(2026, 4, 30),
                        option_strike_price=85.0,
                        last_event_id="legacy-option-1",
                    ),
                    Trade(
                        trade_id="SWAP-1",
                        created_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                        execution_timestamp=datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                        trade_nature="PHYSICAL",
                        trade_structure="SWAP",
                        trade_side=None,
                        book="CRUDE_PHYS",
                        commodity_class="CRUDE_OIL",
                        commodity="WTI",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=1.0,
                        volume=100.0,
                        settlement_status="PENDING",
                        status="ACTIVE",
                        instrument_type="LINEAR",
                        last_event_id="legacy-swap-1",
                    ),
                ]
            )
            session.commit()

            report = build_pnl_history_report(session, as_of=date(2026, 3, 5))

        self.assertEqual(
            report["summary"],
            {
                "total_pnl": 0.0,
                "realized_pnl": 0.0,
                "unrealized_pnl": 0.0,
                "priced_trade_count": 0,
                "realized_trade_count": 0,
                "unrealized_trade_count": 0,
            },
        )
        valuations_by_trade = {row["trade_id"]: row for row in report["valuations"]}
        self.assertEqual(
            valuations_by_trade["FORMULA-1"]["valuation_status"],
            "UNSUPPORTED_PRICING_TYPE",
        )
        self.assertEqual(
            valuations_by_trade["OPTION-1"]["valuation_status"],
            "UNSUPPORTED_INSTRUMENT",
        )
        self.assertEqual(
            valuations_by_trade["SWAP-1"]["valuation_status"],
            "UNSUPPORTED_STRUCTURE",
        )
        self.assertTrue(all(not row["included_in_totals"] for row in report["valuations"]))

    def test_comparison_report_returns_summary_delta_and_trade_attribution(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Event(
                        event_id="evt-comp-1",
                        aggregate_type="trade",
                        aggregate_id="T-BUY",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 1, 12, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "trade_side": "BUY",
                            "book": "CRUDE_PHYS",
                            "portfolio": "PROMPT",
                            "price": 2.0,
                            "volume": 100.0,
                            "settlement_status": "PENDING",
                        },
                    ),
                    Event(
                        event_id="evt-comp-2",
                        aggregate_type="trade",
                        aggregate_id="T-SELL",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 2, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 2, 12, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={
                            "trade_side": "SELL",
                            "book": "CRUDE_PHYS",
                            "portfolio": "PROMPT",
                            "price": 1.5,
                            "volume": 50.0,
                            "settlement_status": "PENDING",
                        },
                    ),
                    Event(
                        event_id="evt-comp-3",
                        aggregate_type="trade",
                        aggregate_id="T-BUY",
                        event_type="TradeAmended",
                        occurred_at=datetime(2026, 3, 3, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 3, 12, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={"settlement_status": "SETTLED"},
                    ),
                    Event(
                        event_id="evt-comp-4",
                        aggregate_type="trade",
                        aggregate_id="T-SELL",
                        event_type="TradeCancelled",
                        occurred_at=datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc),
                        recorded_at=datetime(2026, 3, 4, 12, 1, tzinfo=timezone.utc),
                        actor_id="ops",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={},
                    ),
                ]
            )
            session.commit()

            report = build_pnl_comparison_report(
                session,
                from_as_of=date(2026, 3, 2),
                to_as_of=date(2026, 3, 4),
                portfolio="prompt",
            )

        self.assertEqual(
            report["delta"],
            {
                "total_pnl": 75.0,
                "realized_pnl": 200.0,
                "unrealized_pnl": -125.0,
                "priced_trade_count": -1,
                "realized_trade_count": 1,
                "unrealized_trade_count": -2,
            },
        )
        self.assertEqual(len(report["portfolio_deltas"]), 1)
        self.assertEqual(report["portfolio_deltas"][0]["portfolio"], "PROMPT")
        self.assertEqual(report["portfolio_deltas"][0]["delta"]["total_pnl"], 75.0)
        self.assertEqual(
            report["attribution_summary"],
            {
                "market_move_pnl": 0.0,
                "quantity_change_pnl": 75.0,
                "coverage_change_pnl": 0.0,
                "other_change_pnl": 0.0,
                "realization_transfer_pnl": 200.0,
                "reconciled_pnl_delta": 75.0,
            },
        )
        self.assertEqual(
            report["daily_bridge"],
            [
                {
                    "from_as_of": date(2026, 3, 2),
                    "to_as_of": date(2026, 3, 3),
                    "delta": {
                        "total_pnl": 0.0,
                        "realized_pnl": 200.0,
                        "unrealized_pnl": -200.0,
                        "priced_trade_count": 0,
                        "realized_trade_count": 1,
                        "unrealized_trade_count": -1,
                    },
                    "attribution_summary": {
                        "market_move_pnl": 0.0,
                        "quantity_change_pnl": 0.0,
                        "coverage_change_pnl": 0.0,
                        "other_change_pnl": 0.0,
                        "realization_transfer_pnl": 200.0,
                        "reconciled_pnl_delta": 0.0,
                    },
                    "changed_trade_count": 1,
                    "top_driver_trade_id": "T-BUY",
                    "top_driver_category": "REALIZATION",
                    "top_driver_pnl_delta": 0.0,
                    "top_driver_summary": "Amended settlement to SETTLED on 2026-03-03",
                },
                {
                    "from_as_of": date(2026, 3, 3),
                    "to_as_of": date(2026, 3, 4),
                    "delta": {
                        "total_pnl": 75.0,
                        "realized_pnl": 0.0,
                        "unrealized_pnl": 75.0,
                        "priced_trade_count": -1,
                        "realized_trade_count": 0,
                        "unrealized_trade_count": -1,
                    },
                    "attribution_summary": {
                        "market_move_pnl": 0.0,
                        "quantity_change_pnl": 75.0,
                        "coverage_change_pnl": 0.0,
                        "other_change_pnl": 0.0,
                        "realization_transfer_pnl": 0.0,
                        "reconciled_pnl_delta": 75.0,
                    },
                    "changed_trade_count": 1,
                    "top_driver_trade_id": "T-SELL",
                    "top_driver_category": "REMOVED_POSITION",
                    "top_driver_pnl_delta": 75.0,
                    "top_driver_summary": "Trade cancelled on 2026-03-04",
                },
            ],
        )
        attributions_by_trade = {row["trade_id"]: row for row in report["attributions"]}
        self.assertEqual(attributions_by_trade["T-BUY"]["attribution_category"], "REALIZATION")
        self.assertEqual(attributions_by_trade["T-BUY"]["pnl_delta"], 0.0)
        self.assertEqual(
            attributions_by_trade["T-BUY"]["breakdown"],
            {
                "market_move_pnl": 0.0,
                "quantity_change_pnl": 0.0,
                "coverage_change_pnl": 0.0,
                "other_change_pnl": 0.0,
                "realization_transfer_pnl": 200.0,
                "reconciled_pnl_delta": 0.0,
            },
        )
        self.assertEqual(
            attributions_by_trade["T-BUY"]["driver_summary"],
            "Amended settlement to SETTLED on 2026-03-03",
        )
        self.assertEqual(
            attributions_by_trade["T-BUY"]["driver_events"],
            [
                {
                    "event_id": "evt-comp-3",
                    "event_type": "TradeAmended",
                    "occurred_at": datetime(2026, 3, 3, 12, 0),
                    "actor_id": "ops",
                    "summary": "Amended settlement to SETTLED",
                }
            ],
        )
        self.assertEqual(attributions_by_trade["T-SELL"]["attribution_category"], "REMOVED_POSITION")
        self.assertEqual(attributions_by_trade["T-SELL"]["pnl_delta"], 75.0)
        self.assertEqual(
            attributions_by_trade["T-SELL"]["breakdown"],
            {
                "market_move_pnl": 0.0,
                "quantity_change_pnl": 75.0,
                "coverage_change_pnl": 0.0,
                "other_change_pnl": 0.0,
                "realization_transfer_pnl": 0.0,
                "reconciled_pnl_delta": 75.0,
            },
        )
        self.assertEqual(
            attributions_by_trade["T-SELL"]["driver_summary"],
            "Trade cancelled on 2026-03-04",
        )
        self.assertEqual(
            attributions_by_trade["T-SELL"]["driver_events"],
            [
                {
                    "event_id": "evt-comp-4",
                    "event_type": "TradeCancelled",
                    "occurred_at": datetime(2026, 3, 4, 12, 0),
                    "actor_id": "ops",
                    "summary": "Trade cancelled",
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
