from __future__ import annotations

import enum
import unittest
from datetime import datetime, timedelta, timezone
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
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.routes.events import append_event
from apps.api.app.schemas.event import EventCreate
from apps.api.scripts import rebuild_positions_projection


class PositionsRebuildScriptTests(unittest.TestCase):
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
        self.base_time = datetime(2026, 3, 11, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(OptionExposure).delete()
            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Position).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
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
                created_at=self.base_time,
                created_by="test-user",
                updated_at=self.base_time,
                updated_by="test-user",
                version=1,
            )
        )
        for code in ("WTI", "BRENT"):
            session.add(
                ReferenceCommodity(
                    code=code,
                    commodity_class="CRUDE_OIL",
                    name=f"{code} Commodity",
                    description="Test commodity",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.base_time,
                    created_by="test-user",
                    updated_at=self.base_time,
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

    def _append_trade_event(
        self,
        *,
        trade_id: str,
        event_type: str,
        payload: dict[str, object],
        seconds_after_base: int,
    ) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id=trade_id,
                    event_type=event_type,
                    occurred_at=self.base_time + timedelta(seconds=seconds_after_base),
                    actor_id="test-user",
                    payload=payload,
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

    def _position_snapshot(self) -> dict[str, float]:
        with self.SessionLocal() as session:
            return {
                row.commodity: float(row.net_volume)
                for row in session.query(Position).order_by(Position.commodity.asc()).all()
            }

    def _rebuild_positions(self) -> None:
        with patch.object(rebuild_positions_projection, "SessionLocal", self.SessionLocal):
            rebuild_positions_projection.main()

    def _assert_rebuild_matches_live_positions(self, expected: dict[str, float]) -> None:
        self.assertEqual(self._position_snapshot(), expected)

        with self.SessionLocal() as session:
            session.query(Position).delete()
            session.commit()

        self._rebuild_positions()
        self.assertEqual(self._position_snapshot(), expected)

    def test_rebuild_matches_live_positions_for_sell_swap_amend_and_cancel(self) -> None:
        self._append_trade_event(
            trade_id="T-SELL",
            event_type="TradeCreated",
            seconds_after_base=1,
            payload={
                "trade_nature": "PHYSICAL",
                "trade_structure": "SINGLE",
                "trade_side": "SELL",
                "book": "CRUDE_PHYS",
                "commodity_class": "CRUDE_OIL",
                "commodity": "WTI",
                "pricing_type": "FIXED",
                "price": 80,
                "volume": 100,
            },
        )
        self._assert_rebuild_matches_live_positions({"WTI": -100.0})

        self._append_trade_event(
            trade_id="T-SWAP",
            event_type="TradeCreated",
            seconds_after_base=2,
            payload={
                "trade_nature": "PHYSICAL",
                "trade_structure": "SWAP",
                "book": "CRUDE_PHYS",
                "commodity_class": "CRUDE_OIL",
                "commodity": "WTI",
                "pricing_type": "FIXED",
                "price": 1.5,
                "legs": [
                    {
                        "leg_no": 1,
                        "side": "BUY",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "volume": 20,
                    },
                    {
                        "leg_no": 2,
                        "side": "SELL",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "BRENT",
                        "volume": 30,
                    },
                ],
            },
        )
        self._assert_rebuild_matches_live_positions({"BRENT": -30.0, "WTI": -80.0})

        self._append_trade_event(
            trade_id="T-SELL",
            event_type="TradeAmended",
            seconds_after_base=3,
            payload={"volume": 120},
        )
        self._assert_rebuild_matches_live_positions({"BRENT": -30.0, "WTI": -100.0})

        self._append_trade_event(
            trade_id="T-SWAP",
            event_type="TradeCancelled",
            seconds_after_base=4,
            payload={},
        )
        self._assert_rebuild_matches_live_positions({"WTI": -120.0})

    def test_rebuild_falls_back_to_trade_header_when_legs_are_missing(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="LEGACY-SELL",
                    created_at=self.base_time,
                    updated_at=self.base_time,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="SELL",
                    book="CRUDE_PHYS",
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    pricing_type="FIXED",
                    price_index_code=None,
                    price=None,
                    volume=25,
                    status="ACTIVE",
                    last_event_id="legacy-event-1",
                )
            )
            session.commit()

        self._rebuild_positions()
        self.assertEqual(self._position_snapshot(), {"WTI": -25.0})

    def test_rebuild_excludes_option_trades_from_live_and_rebuilt_positions(self) -> None:
        self._append_trade_event(
            trade_id="T-LINEAR",
            event_type="TradeCreated",
            seconds_after_base=1,
            payload={
                "trade_nature": "PHYSICAL",
                "trade_structure": "SINGLE",
                "trade_side": "BUY",
                "book": "CRUDE_PHYS",
                "commodity_class": "CRUDE_OIL",
                "commodity": "WTI",
                "pricing_type": "FIXED",
                "price": 80,
                "volume": 100,
            },
        )
        self._append_trade_event(
            trade_id="T-OPTION",
            event_type="TradeCreated",
            seconds_after_base=2,
            payload={
                "instrument_type": "OPTION",
                "trade_nature": "FINANCIAL",
                "trade_structure": "SINGLE",
                "trade_side": "BUY",
                "book": "CRUDE_PHYS",
                "commodity_class": "CRUDE_OIL",
                "commodity": "WTI",
                "pricing_type": "FIXED",
                "price": 4.25,
                "volume": 12,
                "option_type": "CALL",
                "option_strike_price": 82.5,
                "option_expiration_date": "2026-06-30",
            },
        )

        self._assert_rebuild_matches_live_positions({"WTI": 100.0})


if __name__ == "__main__":
    unittest.main()
