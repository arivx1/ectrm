from __future__ import annotations

import enum
import unittest
from datetime import date, datetime, timezone

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.operations.services.shipments import list_delivery_obligations_for_operations
from apps.api.app.models import Base, Trade
from apps.api.app.models.trade_leg import TradeLeg


class DeliveriesApiTests(unittest.TestCase):
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
            session.commit()

        with self.SessionLocal() as session:
            session.add_all(
                [
                    Trade(
                        trade_id="T-LOG-1",
                        external_trade_id="EXT-LOG-1",
                        source_system="ETRM",
                        execution_timestamp=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
                        trade_date=date(2026, 4, 1),
                        effective_start_date=date(2026, 4, 6),
                        effective_end_date=date(2026, 4, 8),
                        quality_spec=None,
                        unit_of_measure="BBL",
                        trade_currency_code="USD",
                        location_code="CUSHING",
                        delivery_start=date(2026, 4, 6),
                        delivery_end=date(2026, 4, 8),
                        price_unit_code="BBL",
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="CRUDE_PHYS",
                        portfolio="LOGISTICS",
                        counterparty="SHELL_TRADING",
                        commodity_class="CRUDE_OIL",
                        commodity="WTI",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        confirmation_status="CONFIRMED",
                        nomination_status="NOT_REQUIRED",
                        allocation_status="NOT_REQUIRED",
                        price_index_code=None,
                        price=81.25,
                        volume=1000,
                        invoice_status="PENDING",
                        payment_status="PENDING",
                        settlement_status="PENDING",
                        trader_user="ops.alpha",
                        status="ACTIVE",
                        last_event_id="evt-log-1",
                        created_at=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 2, 8, 0, tzinfo=timezone.utc),
                    ),
                    Trade(
                        trade_id="T-GAS-1",
                        external_trade_id="EXT-GAS-1",
                        source_system="ETRM",
                        execution_timestamp=datetime(2026, 4, 2, 9, 0, tzinfo=timezone.utc),
                        trade_date=date(2026, 4, 2),
                        effective_start_date=date(2026, 4, 8),
                        effective_end_date=date(2026, 4, 8),
                        quality_spec=None,
                        unit_of_measure="MMBTU",
                        trade_currency_code="USD",
                        location_code="HENRY_HUB",
                        delivery_start=date(2026, 4, 8),
                        delivery_end=date(2026, 4, 8),
                        price_unit_code="MMBTU",
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="SELL",
                        book="GAS_PHYS",
                        portfolio=None,
                        counterparty="BP",
                        commodity_class="NATURAL_GAS",
                        commodity="HH",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        confirmation_status="CONFIRMED",
                        nomination_status="NOMINATED",
                        allocation_status="ALLOCATED",
                        price_index_code=None,
                        price=2.35,
                        volume=10000,
                        invoice_status="PENDING",
                        payment_status="PENDING",
                        settlement_status="PENDING",
                        trader_user="ops.beta",
                        status="ACTIVE",
                        last_event_id="evt-gas-1",
                        created_at=datetime(2026, 4, 2, 9, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 2, 10, 0, tzinfo=timezone.utc),
                    ),
                    Trade(
                        trade_id="T-POWER-1",
                        external_trade_id="EXT-POWER-1",
                        source_system="ETRM",
                        execution_timestamp=datetime(2026, 4, 3, 11, 0, tzinfo=timezone.utc),
                        trade_date=date(2026, 4, 3),
                        effective_start_date=date(2026, 4, 7),
                        effective_end_date=date(2026, 4, 7),
                        quality_spec=None,
                        unit_of_measure="MWH",
                        trade_currency_code="USD",
                        location_code="PJM_WEST",
                        delivery_start=date(2026, 4, 7),
                        delivery_end=date(2026, 4, 7),
                        price_unit_code="MWH",
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="POWER_PHYS",
                        portfolio=None,
                        counterparty="CONSTELLATION",
                        commodity_class="POWER",
                        commodity="PJM_WEST_DA",
                        pricing_type="INDEX",
                        pricing_status="PENDING",
                        confirmation_status="CONFIRMED",
                        nomination_status="SCHEDULED",
                        allocation_status="NOT_REQUIRED",
                        price_index_code="PJM_WEST_ONPEAK_DA",
                        price=None,
                        volume=500,
                        invoice_status="PENDING",
                        payment_status="PENDING",
                        settlement_status="PENDING",
                        trader_user="ops.gamma",
                        status="ACTIVE",
                        last_event_id="evt-power-1",
                        created_at=datetime(2026, 4, 3, 11, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 3, 12, 0, tzinfo=timezone.utc),
                    ),
                    Trade(
                        trade_id="T-SWAP-1",
                        external_trade_id="EXT-SWAP-1",
                        source_system="ETRM",
                        execution_timestamp=datetime(2026, 4, 4, 13, 0, tzinfo=timezone.utc),
                        trade_date=date(2026, 4, 4),
                        effective_start_date=date(2026, 4, 9),
                        effective_end_date=date(2026, 4, 9),
                        quality_spec=None,
                        unit_of_measure="MMBTU",
                        trade_currency_code="USD",
                        location_code=None,
                        delivery_start=None,
                        delivery_end=None,
                        price_unit_code="MMBTU",
                        trade_nature="PHYSICAL",
                        trade_structure="SWAP",
                        trade_side=None,
                        book="GAS_BASIS",
                        portfolio="MIDCON",
                        counterparty="MERCURIA",
                        commodity_class="NATURAL_GAS",
                        commodity="BASIS_SWAP",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        confirmation_status="CONFIRMED",
                        nomination_status="NOT_REQUIRED",
                        allocation_status="NOT_REQUIRED",
                        price_index_code=None,
                        price=0.12,
                        volume=10000,
                        invoice_status="PENDING",
                        payment_status="PENDING",
                        settlement_status="PENDING",
                        trader_user="ops.delta",
                        status="ACTIVE",
                        last_event_id="evt-swap-1",
                        created_at=datetime(2026, 4, 4, 13, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 4, 14, 0, tzinfo=timezone.utc),
                    ),
                    Trade(
                        trade_id="T-FIN-1",
                        external_trade_id=None,
                        source_system="ETRM",
                        execution_timestamp=datetime(2026, 4, 4, 10, 0, tzinfo=timezone.utc),
                        trade_date=date(2026, 4, 4),
                        effective_start_date=None,
                        effective_end_date=None,
                        quality_spec=None,
                        unit_of_measure="BBL",
                        trade_currency_code="USD",
                        location_code="CUSHING",
                        delivery_start=date(2026, 4, 5),
                        delivery_end=date(2026, 4, 5),
                        price_unit_code="BBL",
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
                        confirmation_status="CONFIRMED",
                        nomination_status="NOT_REQUIRED",
                        allocation_status="NOT_REQUIRED",
                        price_index_code=None,
                        price=80,
                        volume=1000,
                        invoice_status="PENDING",
                        payment_status="PENDING",
                        settlement_status="PENDING",
                        trader_user="ops.delta",
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
                        trade_date=date(2026, 4, 3),
                        effective_start_date=None,
                        effective_end_date=None,
                        quality_spec=None,
                        unit_of_measure="BBL",
                        trade_currency_code="USD",
                        location_code="CUSHING",
                        delivery_start=date(2026, 4, 5),
                        delivery_end=date(2026, 4, 5),
                        price_unit_code="BBL",
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
                        confirmation_status="CONFIRMED",
                        nomination_status="NOT_REQUIRED",
                        allocation_status="NOT_REQUIRED",
                        price_index_code=None,
                        price=79,
                        volume=500,
                        invoice_status="PENDING",
                        payment_status="PENDING",
                        settlement_status="PENDING",
                        trader_user="ops.delta",
                        status="CANCELLED",
                        last_event_id="evt-cancelled-1",
                        created_at=datetime(2026, 4, 3, 10, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 3, 10, 0, tzinfo=timezone.utc),
                    ),
                ]
            )
            session.add_all(
                [
                    TradeLeg(
                        trade_leg_id="leg-swap-1",
                        trade_id="T-SWAP-1",
                        leg_no=1,
                        side="BUY",
                        commodity_class="NATURAL_GAS",
                        commodity_code="HH",
                        location_code="HENRY_HUB",
                        quantity=10000,
                        quantity_unit_code="MMBTU",
                        delivery_start=date(2026, 4, 9),
                        delivery_end=date(2026, 4, 9),
                        created_at=datetime(2026, 4, 4, 13, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 4, 14, 15, tzinfo=timezone.utc),
                    ),
                    TradeLeg(
                        trade_leg_id="leg-swap-2",
                        trade_id="T-SWAP-1",
                        leg_no=2,
                        side="SELL",
                        commodity_class="NATURAL_GAS",
                        commodity_code="CHI",
                        location_code="CHICAGO_CITYGATE",
                        quantity=10000,
                        quantity_unit_code="MMBTU",
                        delivery_start=date(2026, 4, 9),
                        delivery_end=date(2026, 4, 9),
                        created_at=datetime(2026, 4, 4, 13, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 4, 14, 20, tzinfo=timezone.utc),
                    ),
                ]
            )
            session.commit()

    def test_list_deliveries_builds_cross_mode_delivery_obligations(self) -> None:
        with self.SessionLocal() as session:
            payload = list_delivery_obligations_for_operations(
                db=session,
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )

        self.assertEqual(
            [delivery.delivery_id for delivery in payload],
            ["DLV-T-LOG-1", "DLV-T-POWER-1", "DLV-T-GAS-1", "DLV-T-SWAP-1-L1", "DLV-T-SWAP-1-L2"],
        )

        logistics = payload[0]
        self.assertEqual(logistics.mode_family, "LOGISTICS")
        self.assertEqual(logistics.transport_mode, "UNSPECIFIED")
        self.assertEqual(logistics.transport_mode_source, "UNSPECIFIED")
        self.assertEqual(logistics.delivery_profile, "LOAD_DISCHARGE_WINDOW")
        self.assertEqual(logistics.direction, "INBOUND")
        self.assertEqual(logistics.status, "BLOCKED")
        self.assertEqual(logistics.location_code, "CUSHING")
        self.assertEqual(logistics.confirmation_status, "CONFIRMED")
        self.assertEqual(logistics.nomination_status, "NOT_REQUIRED")
        self.assertEqual(logistics.invoice_status, "PENDING")
        self.assertEqual(logistics.payment_status, "PENDING")
        self.assertIn("Explicit transport mode is missing for discrete logistics delivery.", logistics.blockers)

        power = payload[1]
        self.assertEqual(power.mode_family, "POWER_SCHEDULE")
        self.assertEqual(power.transport_mode, "POWER_GRID")
        self.assertEqual(power.transport_mode_source, "DERIVED")
        self.assertEqual(power.delivery_profile, "INTERVAL_SCHEDULE")
        self.assertEqual(power.status, "IN_PROGRESS")
        self.assertEqual(power.location_code, "PJM_WEST")
        self.assertEqual(power.price_unit_code, "MWH")
        self.assertEqual(power.nomination_status, "SCHEDULED")
        self.assertEqual(power.blockers, [])

        gas = payload[2]
        self.assertEqual(gas.mode_family, "NETWORK_FLOW")
        self.assertEqual(gas.transport_mode, "PIPELINE")
        self.assertEqual(gas.transport_mode_source, "DERIVED")
        self.assertEqual(gas.delivery_profile, "FLOW_WINDOW")
        self.assertEqual(gas.direction, "OUTBOUND")
        self.assertEqual(gas.status, "READY")
        self.assertEqual(gas.volume, 10000.0)
        self.assertEqual(gas.confirmation_status, "CONFIRMED")
        self.assertEqual(gas.nomination_status, "NOMINATED")
        self.assertEqual(gas.allocation_status, "ALLOCATED")
        self.assertEqual(gas.invoice_status, "PENDING")
        self.assertEqual(gas.payment_status, "PENDING")

        swap_leg_one = payload[3]
        swap_leg_two = payload[4]
        self.assertEqual(swap_leg_one.trade_id, "T-SWAP-1")
        self.assertEqual(swap_leg_one.leg_no, 1)
        self.assertEqual(swap_leg_one.location_code, "HENRY_HUB")
        self.assertEqual(swap_leg_one.direction, "INBOUND")
        self.assertEqual(swap_leg_one.status, "READY")
        self.assertEqual(swap_leg_one.confirmation_status, "CONFIRMED")
        self.assertEqual(swap_leg_two.leg_no, 2)
        self.assertEqual(swap_leg_two.location_code, "CHICAGO_CITYGATE")
        self.assertEqual(swap_leg_two.direction, "OUTBOUND")
