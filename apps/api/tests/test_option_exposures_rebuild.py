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
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.routes.events import append_event
from apps.api.app.schemas.event import EventCreate
from apps.api.scripts import rebuild_option_exposures_projection


class OptionExposuresRebuildScriptTests(unittest.TestCase):
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
        self.base_time = datetime(2026, 4, 6, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(OptionExposure).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(ReferenceUnit).delete()
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
        session.add(
            ReferenceCommodity(
                code="WTI",
                commodity_class="CRUDE_OIL",
                name="WTI Commodity",
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
        session.add(
            ReferenceUnit(
                code="BBL",
                name="Barrel",
                commodity_class="CRUDE_OIL",
                dimension="VOLUME",
                base_unit_code=None,
                conversion_factor=None,
                precision=3,
                description="Test barrel unit",
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
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )

    def _snapshot(self) -> list[dict[str, object]]:
        with self.SessionLocal() as session:
            return [
                {
                    "trade_id": row.trade_id,
                    "book": row.book,
                    "commodity": row.commodity,
                    "option_type": row.option_type,
                    "trade_side": row.trade_side,
                    "contract_volume": float(row.contract_volume),
                    "premium_cashflow": float(row.premium_cashflow) if row.premium_cashflow is not None else None,
                    "underlying_equivalent_volume": float(row.underlying_equivalent_volume),
                    "option_expiration_date": str(row.option_expiration_date)
                    if row.option_expiration_date is not None
                    else None,
                }
                for row in session.query(OptionExposure).order_by(OptionExposure.trade_id.asc()).all()
            ]

    def _rebuild_option_exposures(self) -> None:
        with patch.object(rebuild_option_exposures_projection, "SessionLocal", self.SessionLocal):
            rebuild_option_exposures_projection.main()

    def _assert_rebuild_matches_live_option_exposures(self, expected: list[dict[str, object]]) -> None:
        self.assertEqual(self._snapshot(), expected)

        with self.SessionLocal() as session:
            session.query(OptionExposure).delete()
            session.commit()

        self._rebuild_option_exposures()
        self.assertEqual(self._snapshot(), expected)

    def test_rebuild_matches_live_option_exposures_for_create_amend_and_cancel(self) -> None:
        self._append_trade_event(
            trade_id="T-OPTION-1",
            event_type="TradeCreated",
            seconds_after_base=1,
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
                "option_style": "EUROPEAN",
                "option_strike_price": 82.5,
                "option_expiration_date": "2026-06-30",
            },
        )
        self._assert_rebuild_matches_live_option_exposures(
            [
                {
                    "trade_id": "T-OPTION-1",
                    "book": "CRUDE_PHYS",
                    "commodity": "WTI",
                    "option_type": "CALL",
                    "trade_side": "BUY",
                    "contract_volume": 12.0,
                    "premium_cashflow": 51.0,
                    "underlying_equivalent_volume": 12.0,
                    "option_expiration_date": "2026-06-30",
                }
            ]
        )

        self._append_trade_event(
            trade_id="T-OPTION-1",
            event_type="TradeAmended",
            seconds_after_base=2,
            payload={
                "trade_side": "SELL",
                "option_type": "PUT",
                "price": 2.0,
                "volume": 5,
                "option_expiration_date": "2026-07-15",
            },
        )
        self._assert_rebuild_matches_live_option_exposures(
            [
                {
                    "trade_id": "T-OPTION-1",
                    "book": "CRUDE_PHYS",
                    "commodity": "WTI",
                    "option_type": "PUT",
                    "trade_side": "SELL",
                    "contract_volume": 5.0,
                    "premium_cashflow": -10.0,
                    "underlying_equivalent_volume": 5.0,
                    "option_expiration_date": "2026-07-15",
                }
            ]
        )

        self._append_trade_event(
            trade_id="T-OPTION-1",
            event_type="TradeCancelled",
            seconds_after_base=3,
            payload={},
        )
        self._assert_rebuild_matches_live_option_exposures([])

    def test_rebuild_removes_option_exposure_after_assignment(self) -> None:
        self._append_trade_event(
            trade_id="T-OPTION-ASSIGN-1",
            event_type="TradeCreated",
            seconds_after_base=1,
            payload={
                "instrument_type": "OPTION",
                "trade_nature": "FINANCIAL",
                "trade_structure": "SINGLE",
                "trade_side": "SELL",
                "book": "CRUDE_PHYS",
                "commodity_class": "CRUDE_OIL",
                "commodity": "WTI",
                "pricing_type": "FIXED",
                "price": 2.25,
                "volume": 7,
                "option_type": "PUT",
                "option_style": "AMERICAN",
                "option_strike_price": 74,
                "option_expiration_date": "2026-06-30",
            },
        )
        self._assert_rebuild_matches_live_option_exposures(
            [
                {
                    "trade_id": "T-OPTION-ASSIGN-1",
                    "book": "CRUDE_PHYS",
                    "commodity": "WTI",
                    "option_type": "PUT",
                    "trade_side": "SELL",
                    "contract_volume": 7.0,
                    "premium_cashflow": -15.75,
                    "underlying_equivalent_volume": 7.0,
                    "option_expiration_date": "2026-06-30",
                }
            ]
        )

        self._append_trade_event(
            trade_id="T-OPTION-ASSIGN-1",
            event_type="OptionAssigned",
            seconds_after_base=2,
            payload={},
        )
        self._assert_rebuild_matches_live_option_exposures([])


if __name__ == "__main__":
    unittest.main()
