from __future__ import annotations

import unittest
from datetime import date, datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reports.services.pnl_history import build_pnl_history_report
from apps.api.app.models.event import Base, Event
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.trade import Trade


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


if __name__ == "__main__":
    unittest.main()
