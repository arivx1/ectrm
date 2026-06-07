from __future__ import annotations

import unittest
from datetime import date, datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.risk.services.position_as_of import (
    POSITION_AS_OF_BASIS_V1,
    POSITION_AS_OF_SOURCE_EVENT_REPLAY,
    POSITION_AS_OF_SOURCE_LEGACY_PROJECTION,
    build_position_as_of_report,
)
from apps.api.app.models.event import Base, Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg


class PositionAsOfServiceTests(unittest.TestCase):
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
            session.query(TradeLeg).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.commit()

    def _event(
        self,
        *,
        event_id: str,
        trade_id: str,
        event_type: str,
        occurred_at: datetime,
        payload: dict[str, object],
    ) -> Event:
        return Event(
            event_id=event_id,
            aggregate_type="trade",
            aggregate_id=trade_id,
            event_type=event_type,
            occurred_at=occurred_at,
            recorded_at=occurred_at,
            actor_id="test-user",
            correlation_id=None,
            causation_id=None,
            schema_version=1,
            payload=payload,
        )

    def test_position_as_of_replays_amendments_and_cancellations_by_date(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    self._event(
                        event_id="evt-pos-1",
                        trade_id="T-BUY",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
                        payload={
                            "trade_side": "BUY",
                            "book": "CRUDE_PHYS",
                            "portfolio": "PROMPT",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "location_code": "CUSHING",
                            "delivery_start": "2026-04-01",
                            "delivery_end": "2026-04-30",
                            "unit_of_measure": "BBL",
                            "pricing_type": "INDEX",
                            "price_index_code": "WTI_CUSHING_M",
                            "volume": 100,
                        },
                    ),
                    self._event(
                        event_id="evt-pos-2",
                        trade_id="T-SELL",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 3, 2, 9, 0, tzinfo=timezone.utc),
                        payload={
                            "trade_side": "SELL",
                            "book": "CRUDE_PHYS",
                            "portfolio": "PROMPT",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "location_code": "CUSHING",
                            "delivery_start": "2026-04-01",
                            "delivery_end": "2026-04-30",
                            "unit_of_measure": "BBL",
                            "pricing_type": "INDEX",
                            "price_index_code": "WTI_CUSHING_M",
                            "volume": 30,
                        },
                    ),
                    self._event(
                        event_id="evt-pos-3",
                        trade_id="T-BUY",
                        event_type="TradeAmended",
                        occurred_at=datetime(2026, 3, 3, 9, 0, tzinfo=timezone.utc),
                        payload={"volume": 120},
                    ),
                    self._event(
                        event_id="evt-pos-4",
                        trade_id="T-BUY",
                        event_type="TradeCancelled",
                        occurred_at=datetime(2026, 3, 4, 9, 0, tzinfo=timezone.utc),
                        payload={},
                    ),
                ]
            )
            session.commit()

            march_2 = build_position_as_of_report(session, as_of=date(2026, 3, 2))
            march_3 = build_position_as_of_report(session, as_of=date(2026, 3, 3))
            march_4 = build_position_as_of_report(session, as_of=date(2026, 3, 4))

        self.assertEqual(march_2["basis"], POSITION_AS_OF_BASIS_V1)
        self.assertEqual(march_2["summary"]["net_volume"], 70.0)
        self.assertEqual(march_2["summary"]["replayed_event_count"], 2)
        self.assertEqual(
            [(row["side"], row["net_volume"]) for row in march_2["rows"]],
            [("BUY", 100.0), ("SELL", -30.0)],
        )
        self.assertEqual(march_3["summary"]["net_volume"], 90.0)
        self.assertEqual(
            [(row["side"], row["net_volume"], row["replayed_event_count"]) for row in march_3["rows"]],
            [("BUY", 120.0, 2), ("SELL", -30.0, 1)],
        )
        self.assertEqual(march_4["summary"]["net_volume"], -30.0)
        self.assertEqual(march_4["summary"]["trade_count"], 1)
        self.assertEqual(
            [(row["side"], row["net_volume"]) for row in march_4["rows"]],
            [("SELL", -30.0)],
        )

    def test_position_as_of_decomposes_swap_legs_by_risk_factor(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                self._event(
                    event_id="evt-swap-1",
                    trade_id="T-SWAP",
                    event_type="TradeCreated",
                    occurred_at=datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc),
                    payload={
                        "trade_nature": "FINANCIAL",
                        "trade_structure": "SWAP",
                        "book": "CRUDE_PHYS",
                        "portfolio": "ARB",
                        "pricing_type": "INDEX",
                        "price_index_code": "WTI_BRENT_SPREAD_M",
                        "legs": [
                            {
                                "leg_no": 1,
                                "side": "BUY",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "WTI",
                                "location_code": "CUSHING",
                                "volume": 90,
                                "quantity_unit_code": "BBL",
                                "delivery_start": "2026-06-01",
                                "delivery_end": "2026-06-30",
                            },
                            {
                                "leg_no": 2,
                                "side": "SELL",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "BRENT",
                                "location_code": "USGC",
                                "volume": 75,
                                "quantity_unit_code": "BBL",
                                "delivery_start": "2026-07-01",
                                "delivery_end": "2026-07-31",
                            },
                        ],
                    },
                )
            )
            session.commit()

            report = build_position_as_of_report(session, as_of=date(2026, 5, 1))

        self.assertEqual(report["summary"]["net_volume"], 15.0)
        self.assertEqual(report["summary"]["long_volume"], 90.0)
        self.assertEqual(report["summary"]["short_volume"], 75.0)
        self.assertEqual(report["row_count"], 2)
        rows_by_commodity = {row["commodity"]: row for row in report["rows"]}
        self.assertEqual(rows_by_commodity["WTI"]["net_volume"], 90.0)
        self.assertEqual(rows_by_commodity["WTI"]["location_code"], "CUSHING")
        self.assertEqual(rows_by_commodity["WTI"]["tenor_start"], date(2026, 6, 1))
        self.assertEqual(rows_by_commodity["WTI"]["physical_financial_status"], "FINANCIAL")
        self.assertEqual(rows_by_commodity["WTI"]["price_basis"], "INDEX:WTI_BRENT_SPREAD_M")
        self.assertEqual(rows_by_commodity["WTI"]["source_basis"], POSITION_AS_OF_SOURCE_EVENT_REPLAY)
        self.assertEqual(rows_by_commodity["BRENT"]["net_volume"], -75.0)
        self.assertEqual(rows_by_commodity["BRENT"]["location_code"], "USGC")
        self.assertEqual(rows_by_commodity["BRENT"]["tenor_start"], date(2026, 7, 1))
        self.assertEqual(rows_by_commodity["BRENT"]["short_volume"], 75.0)

    def test_position_as_of_labels_legacy_projection_fallback(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="LEGACY-GAS-1",
                    created_at=datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 1, 5, 9, 0, tzinfo=timezone.utc),
                    execution_timestamp=datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc),
                    trade_date=date(2026, 1, 1),
                    effective_start_date=date(2026, 2, 1),
                    effective_end_date=date(2026, 2, 28),
                    unit_of_measure="MMBTU",
                    location_code="HENRY_HUB",
                    instrument_type="LINEAR",
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="GAS_PHYS",
                    portfolio="PROMPT",
                    commodity_class="NATURAL_GAS",
                    commodity="HENRY_HUB_GAS",
                    pricing_type="INDEX",
                    pricing_status="PRICED",
                    price_index_code="HENRY_HUB_GAS_M",
                    price=None,
                    volume=1000,
                    status="ACTIVE",
                    last_event_id="legacy-event-1",
                )
            )
            session.commit()

            before_projection = build_position_as_of_report(session, as_of=date(2026, 1, 4))
            on_projection = build_position_as_of_report(session, as_of=date(2026, 1, 5))

        self.assertEqual(before_projection["row_count"], 0)
        self.assertEqual(before_projection["summary"]["legacy_projection_trade_count"], 0)
        self.assertEqual(on_projection["row_count"], 1)
        self.assertEqual(on_projection["summary"]["legacy_projection_trade_count"], 1)
        row = on_projection["rows"][0]
        self.assertEqual(row["source_basis"], POSITION_AS_OF_SOURCE_LEGACY_PROJECTION)
        self.assertEqual(row["legacy_projection_count"], 1)
        self.assertEqual(row["net_volume"], 1000.0)
        self.assertEqual(row["location_code"], "HENRY_HUB")
        self.assertEqual(row["tenor_start"], date(2026, 2, 1))
        self.assertEqual(row["quantity_unit_code"], "MMBTU")

    def test_position_as_of_filters_by_book_portfolio_and_commodity_class(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    self._event(
                        event_id="evt-filter-pos-1",
                        trade_id="T-GAS",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 4, 1, 9, 0, tzinfo=timezone.utc),
                        payload={
                            "trade_side": "BUY",
                            "book": "GAS_PHYS",
                            "portfolio": "PROMPT",
                            "commodity_class": "NATURAL_GAS",
                            "commodity": "HENRY_HUB_GAS",
                            "volume": 100,
                        },
                    ),
                    self._event(
                        event_id="evt-filter-pos-2",
                        trade_id="T-POWER",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 4, 1, 10, 0, tzinfo=timezone.utc),
                        payload={
                            "trade_side": "BUY",
                            "book": "POWER_WEST",
                            "portfolio": "LOAD_SHAPING",
                            "commodity_class": "POWER",
                            "commodity": "SP15_POWER",
                            "volume": 50,
                        },
                    ),
                ]
            )
            session.commit()

            report = build_position_as_of_report(
                session,
                as_of=date(2026, 4, 1),
                book="gas_phys",
                portfolio="prompt",
                commodity_class="natural_gas",
            )

        self.assertEqual(report["row_count"], 1)
        self.assertEqual(report["summary"]["net_volume"], 100.0)
        self.assertEqual(report["rows"][0]["commodity"], "HENRY_HUB_GAS")


if __name__ == "__main__":
    unittest.main()
