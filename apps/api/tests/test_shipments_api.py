from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models import Base, Trade
from apps.api.app.routes.shipments import list_shipments


class ShipmentsApiTests(unittest.TestCase):
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
            session.query(Trade).delete()
            session.commit()

        self.now = datetime(2026, 4, 5, 18, 0, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            session.add_all(
                [
                    Trade(
                        trade_id="T-BLOCKED-1",
                        external_trade_id="EXT-BLOCKED-1",
                        source_system="ETRM",
                        execution_timestamp=None,
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="CRUDE_PHYS",
                        portfolio="LOGISTICS",
                        counterparty=None,
                        commodity_class="CRUDE_OIL",
                        commodity="WTI",
                        pricing_type="INDEX",
                        pricing_status="PENDING",
                        price_index_code=None,
                        price=None,
                        volume=None,
                        settlement_status="PENDING",
                        trader_user="ops.alpha",
                        status="ACTIVE",
                        last_event_id="evt-blocked-1",
                        created_at=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 5, 8, 0, tzinfo=timezone.utc),
                    ),
                    Trade(
                        trade_id="T-READY-1",
                        external_trade_id="EXT-READY-1",
                        source_system="ETRM",
                        execution_timestamp=datetime(2026, 4, 4, 14, 15, tzinfo=timezone.utc),
                        quality_spec=None,
                        unit_of_measure="BBL",
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="SELL",
                        book="PRODUCTS_PHYS",
                        portfolio="DISTILLATE",
                        counterparty="SHELL_TRADING",
                        commodity_class="REFINED_PRODUCTS",
                        commodity="ULSD",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=84.25,
                        volume=25000,
                        settlement_status="PENDING",
                        trader_user="ops.beta",
                        status="ACTIVE",
                        last_event_id="evt-ready-1",
                        created_at=datetime(2026, 4, 4, 14, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 5, 9, 30, tzinfo=timezone.utc),
                    ),
                    Trade(
                        trade_id="T-COMPLETE-1",
                        external_trade_id=None,
                        source_system="ETRM",
                        execution_timestamp=datetime(2026, 4, 2, 9, 0, tzinfo=timezone.utc),
                        quality_spec=None,
                        unit_of_measure="MMBTU",
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="GAS_PHYS",
                        portfolio=None,
                        counterparty="BP",
                        commodity_class="NATURAL_GAS",
                        commodity="HH",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=2.35,
                        volume=10000,
                        settlement_status="SETTLED",
                        trader_user="ops.gamma",
                        status="ACTIVE",
                        last_event_id="evt-complete-1",
                        created_at=datetime(2026, 4, 2, 8, 30, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 5, 10, 0, tzinfo=timezone.utc),
                    ),
                    Trade(
                        trade_id="T-FIN-1",
                        external_trade_id=None,
                        source_system="ETRM",
                        execution_timestamp=datetime(2026, 4, 4, 10, 0, tzinfo=timezone.utc),
                        trade_nature="FINANCIAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="FIN_BOOK",
                        portfolio=None,
                        counterparty="BANK_X",
                        commodity_class="CRUDE_OIL",
                        commodity="WTI_SWAP",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=80,
                        volume=1000,
                        settlement_status="PENDING",
                        trader_user="ops.gamma",
                        status="ACTIVE",
                        last_event_id="evt-fin-1",
                        created_at=datetime(2026, 4, 4, 10, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 4, 10, 0, tzinfo=timezone.utc),
                    ),
                    Trade(
                        trade_id="T-CANCELLED-1",
                        external_trade_id=None,
                        source_system="ETRM",
                        execution_timestamp=datetime(2026, 4, 3, 10, 0, tzinfo=timezone.utc),
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="SELL",
                        book="CRUDE_PHYS",
                        portfolio=None,
                        counterparty="CHEVRON",
                        commodity_class="CRUDE_OIL",
                        commodity="BRENT",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=79,
                        volume=500,
                        settlement_status="PENDING",
                        trader_user="ops.delta",
                        status="CANCELLED",
                        last_event_id="evt-cancelled-1",
                        created_at=datetime(2026, 4, 3, 10, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 3, 10, 0, tzinfo=timezone.utc),
                    ),
                ]
            )
            session.commit()

    def test_list_shipments_derives_operational_queue_from_active_physical_trades(self) -> None:
        with self.SessionLocal() as session:
            payload = list_shipments(db=session)

        self.assertEqual([shipment.trade_id for shipment in payload], ["T-BLOCKED-1", "T-READY-1", "T-COMPLETE-1"])

        blocked = payload[0]
        self.assertEqual(blocked.shipment_id, "SHP-T-BLOCKED-1")
        self.assertEqual(blocked.direction, "INBOUND")
        self.assertEqual(blocked.status, "BLOCKED")
        self.assertEqual(blocked.booked_at, datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc))
        self.assertEqual(blocked.blocker_count, 5)
        self.assertIn("Counterparty assignment is missing.", blocked.blockers)
        self.assertIn("Price index is missing for non-fixed pricing.", blocked.blockers)

        ready = payload[1]
        self.assertEqual(ready.direction, "OUTBOUND")
        self.assertEqual(ready.status, "READY")
        self.assertEqual(ready.volume, 25000.0)
        self.assertEqual(ready.blockers, [])

        complete = payload[2]
        self.assertEqual(complete.status, "COMPLETED")
        self.assertEqual(complete.blocker_count, 0)
