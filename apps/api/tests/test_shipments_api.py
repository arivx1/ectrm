from __future__ import annotations

import enum
import unittest
from datetime import date, datetime, timezone

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.operations.services.actualizations import void_trade_actualization
from apps.api.app.domains.operations.services.shipments import list_delivery_obligations_for_operations
from apps.api.app.domains.operations.services.shipments import append_delivery_event
from apps.api.app.domains.operations.services.shipments import create_delivery_from_document
from apps.api.app.domains.operations.services.shipments import reverse_delivery_event
from apps.api.app.domains.operations.services.shipments import synchronize_delivery_obligations_from_trades
from apps.api.app.domains.operations.services.shipments import update_delivery_rail_detail
from apps.api.app.models import Base, Trade
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_logistics_detail import DeliveryLogisticsDetail
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.delivery_power_detail import DeliveryPowerDetail
from apps.api.app.models.delivery_rail_detail import DeliveryRailDetail
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_rail_line import ReferenceRailLine
from apps.api.app.models.reference_rail_route import ReferenceRailRoute
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem


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
            session.query(TradeAccrualEntry).delete()
            session.query(TradeAccrualLot).delete()
            session.query(TradeActualization).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(DeliveryEvent).delete()
            session.query(DeliveryLogisticsDetail).delete()
            session.query(DeliveryPipelineDetail).delete()
            session.query(DeliveryPowerDetail).delete()
            session.query(DeliveryRailDetail).delete()
            session.query(DeliveryObligation).delete()
            session.query(ReferenceRailRoute).delete()
            session.query(ReferenceRailLine).delete()
            session.query(ReferenceCalendar).delete()
            session.query(ReferenceLocation).delete()
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
                    TradeWorkflowItem(
                        trade_id="T-POWER-1",
                        workflow_type="NOMINATION",
                        status="SCHEDULED",
                        owner="scheduler.power",
                        due_at=datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
                        notes="Tag queued with ISO.",
                        created_at=datetime(2026, 4, 3, 12, 0, tzinfo=timezone.utc),
                        created_by="ops.seed",
                        updated_at=datetime(2026, 4, 4, 8, 0, tzinfo=timezone.utc),
                        updated_by="ops.seed",
                        version=2,
                    ),
                    TradeWorkflowItem(
                        trade_id="T-GAS-1",
                        workflow_type="ALLOCATION",
                        status="ALLOCATED",
                        owner="scheduler.gas",
                        due_at=datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc),
                        notes="Awaiting pipeline confirmation sweep.",
                        created_at=datetime(2026, 4, 2, 10, 0, tzinfo=timezone.utc),
                        created_by="ops.seed",
                        updated_at=datetime(2026, 4, 4, 9, 0, tzinfo=timezone.utc),
                        updated_by="ops.seed",
                        version=3,
                    ),
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

    def _seed_rail_route(
        self,
        *,
        route_code: str = "BNSF_MIDLAND_TO_CUSHING",
        rail_line_code: str = "BNSF_SOUTHERN_TRANSCON",
        railroad_code: str = "BNSF",
        origin_location_code: str = "MIDLAND",
        destination_location_code: str = "CUSHING",
        route_direction: str = "EASTBOUND",
        schedule_timezone: str = "America/Chicago",
        service_calendar_code: str = "US_FED_BANK",
        route_is_active: bool = True,
        line_is_active: bool = True,
    ) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    ReferenceCalendar(
                        code=service_calendar_code,
                        name="US Rail Service Calendar",
                        calendar_type="OPERATIONS",
                        market="US_RAIL",
                        timezone=schedule_timezone,
                        description=None,
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        created_by="ops.seed",
                        updated_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        updated_by="ops.seed",
                        version=1,
                    ),
                    ReferenceLocation(
                        code=origin_location_code,
                        parent_location_code=None,
                        name=origin_location_code.replace("_", " ").title(),
                        location_kind="POINT",
                        location_type="TERMINAL",
                        market=None,
                        city=None,
                        subdivision_code=None,
                        country_code="US",
                        continent_code="NA",
                        latitude=None,
                        longitude=None,
                        region=None,
                        timezone="America/Chicago",
                        description=None,
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        created_by="ops.seed",
                        updated_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        updated_by="ops.seed",
                        version=1,
                    ),
                    ReferenceLocation(
                        code=destination_location_code,
                        parent_location_code=None,
                        name=destination_location_code.replace("_", " ").title(),
                        location_kind="POINT",
                        location_type="TERMINAL",
                        market=None,
                        city=None,
                        subdivision_code=None,
                        country_code="US",
                        continent_code="NA",
                        latitude=None,
                        longitude=None,
                        region=None,
                        timezone="America/Chicago",
                        description=None,
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        created_by="ops.seed",
                        updated_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        updated_by="ops.seed",
                        version=1,
                    ),
                    ReferenceRailLine(
                        code=rail_line_code,
                        railroad_code=railroad_code,
                        operator_name="BNSF Railway",
                        default_timezone="America/Chicago",
                        name="BNSF Southern Transcon",
                        description=None,
                        is_active=line_is_active,
                        effective_from=None,
                        effective_to=None,
                        created_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        created_by="ops.seed",
                        updated_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        updated_by="ops.seed",
                        version=1,
                    ),
                    ReferenceRailRoute(
                        code=route_code,
                        rail_line_code=rail_line_code,
                        origin_location_code=origin_location_code,
                        destination_location_code=destination_location_code,
                        service_calendar_code=service_calendar_code,
                        route_direction=route_direction,
                        schedule_timezone=schedule_timezone,
                        placement_cutoff_time_local="14:00",
                        release_cutoff_time_local="10:00",
                        placement_free_time_hours=48,
                        release_free_time_hours=24,
                        name="Midland to Cushing",
                        description=None,
                        is_active=route_is_active,
                        effective_from=None,
                        effective_to=None,
                        created_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        created_by="ops.seed",
                        updated_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
                        updated_by="ops.seed",
                        version=1,
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
        self.assertEqual(logistics.actualization_status, "PENDING")
        self.assertIsNone(logistics.actualized_quantity)
        self.assertIsNone(logistics.actualized_at)
        self.assertEqual(logistics.invoice_status, "PENDING")
        self.assertEqual(logistics.payment_status, "PENDING")
        self.assertEqual(logistics.scheduling_stage, "BLOCKED")
        self.assertIsNone(logistics.scheduling_owner)
        self.assertIsNone(logistics.scheduling_due_at)
        self.assertEqual(logistics.open_scheduling_work_item_count, 0)
        self.assertIsNone(logistics.next_scheduling_workflow_type)
        self.assertEqual(
            [item.workflow_type for item in logistics.scheduling_work_items],
            ["CONFIRMATION", "NOMINATION", "ALLOCATION"],
        )
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
        self.assertEqual(power.actualization_status, "PENDING")
        self.assertEqual(power.blockers, [])
        self.assertEqual(power.scheduling_stage, "IN_FLIGHT")
        self.assertEqual(power.scheduling_owner, "scheduler.power")
        self.assertEqual(power.scheduling_due_at, datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc))
        self.assertEqual(power.open_scheduling_work_item_count, 1)
        self.assertEqual(power.next_scheduling_workflow_type, "NOMINATION")
        self.assertEqual(power.next_scheduling_workflow_status, "SCHEDULED")
        self.assertEqual(power.scheduling_work_items[0].owner, "scheduler.power")

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
        self.assertEqual(gas.actualization_status, "PENDING")
        self.assertEqual(gas.invoice_status, "PENDING")
        self.assertEqual(gas.payment_status, "PENDING")
        self.assertEqual(gas.scheduling_stage, "IN_FLIGHT")
        self.assertEqual(gas.scheduling_owner, "scheduler.gas")
        self.assertEqual(gas.next_scheduling_workflow_type, "NOMINATION")
        self.assertEqual(gas.next_scheduling_workflow_status, "NOMINATED")
        self.assertEqual(gas.open_scheduling_work_item_count, 2)

        swap_leg_one = payload[3]
        swap_leg_two = payload[4]
        self.assertEqual(swap_leg_one.trade_id, "T-SWAP-1")
        self.assertEqual(swap_leg_one.leg_no, 1)
        self.assertEqual(swap_leg_one.location_code, "HENRY_HUB")
        self.assertEqual(swap_leg_one.direction, "INBOUND")
        self.assertEqual(swap_leg_one.status, "READY")
        self.assertEqual(swap_leg_one.actualization_status, "PENDING")
        self.assertEqual(swap_leg_one.scheduling_stage, "WATCHLIST")
        self.assertEqual(swap_leg_one.confirmation_status, "CONFIRMED")
        self.assertEqual(swap_leg_two.leg_no, 2)
        self.assertEqual(swap_leg_two.location_code, "CHICAGO_CITYGATE")
        self.assertEqual(swap_leg_two.direction, "OUTBOUND")
        self.assertEqual(swap_leg_two.actualization_status, "PENDING")
        self.assertEqual(swap_leg_two.scheduling_stage, "WATCHLIST")

    def test_delivery_projection_surfaces_actualized_quantity_and_variance(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                TradeActualization(
                    delivery_id="DLV-T-SWAP-1-L2",
                    trade_id="T-SWAP-1",
                    leg_no=2,
                    actual_quantity=9500,
                    actualized_at=datetime(2026, 4, 9, 18, 0, tzinfo=timezone.utc),
                    source="PIPELINE",
                    notes="Final pipeline confirmation posted.",
                    created_at=datetime(2026, 4, 9, 18, 0, tzinfo=timezone.utc),
                    created_by="ops.scheduler",
                    updated_at=datetime(2026, 4, 9, 18, 0, tzinfo=timezone.utc),
                    updated_by="ops.scheduler",
                    version=1,
                )
            )
            session.commit()

        with self.SessionLocal() as session:
            payload = list_delivery_obligations_for_operations(
                session,
                now=datetime(2026, 4, 6, 12, 0, tzinfo=timezone.utc),
            )

        swap_leg_two = next(delivery for delivery in payload if delivery.delivery_id == "DLV-T-SWAP-1-L2")
        self.assertEqual(swap_leg_two.actualization_status, "PARTIALLY_ACTUALIZED")
        self.assertEqual(swap_leg_two.actualized_quantity, 9500.0)
        self.assertEqual(swap_leg_two.actualized_at, datetime(2026, 4, 9, 18, 0, tzinfo=timezone.utc))
        self.assertEqual(swap_leg_two.actualization_source, "PIPELINE")
        self.assertEqual(swap_leg_two.actualization_notes, "Final pipeline confirmation posted.")
        self.assertEqual(swap_leg_two.actualization_variance_quantity, -500.0)

    def test_sync_seeds_persisted_delivery_obligations_and_mode_detail_rows(self) -> None:
        with self.SessionLocal() as session:
            result = synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )
            session.commit()

            obligations = session.execute(
                select(DeliveryObligation).order_by(DeliveryObligation.delivery_id.asc())
            ).scalars().all()
            logistics_details = session.execute(select(DeliveryLogisticsDetail)).scalars().all()
            pipeline_details = session.execute(select(DeliveryPipelineDetail)).scalars().all()
            power_details = session.execute(select(DeliveryPowerDetail)).scalars().all()

        self.assertEqual(result.created_count, 5)
        self.assertEqual(result.updated_count, 0)
        self.assertEqual(result.deleted_count, 0)
        self.assertEqual(result.total_count, 5)
        self.assertEqual(result.logistics_count, 1)
        self.assertEqual(result.network_flow_count, 3)
        self.assertEqual(result.power_schedule_count, 1)

        self.assertEqual(
            [record.delivery_id for record in obligations],
            ["DLV-T-GAS-1", "DLV-T-LOG-1", "DLV-T-POWER-1", "DLV-T-SWAP-1-L1", "DLV-T-SWAP-1-L2"],
        )
        self.assertEqual(len(logistics_details), 1)
        self.assertEqual(logistics_details[0].delivery_id, "DLV-T-LOG-1")
        self.assertEqual(logistics_details[0].destination_location_code, "CUSHING")
        self.assertEqual(logistics_details[0].destination_location_code_source, "TRADE_DERIVED")
        self.assertEqual(logistics_details[0].origin_location_code_source, "SYSTEM_GENERATED")
        self.assertEqual(len(pipeline_details), 3)
        self.assertEqual(sorted(detail.delivery_id for detail in pipeline_details), ["DLV-T-GAS-1", "DLV-T-SWAP-1-L1", "DLV-T-SWAP-1-L2"])
        self.assertEqual(
            sorted(filter(None, (detail.delivery_location_code for detail in pipeline_details))),
            ["CHICAGO_CITYGATE", "HENRY_HUB", "HENRY_HUB"],
        )
        self.assertTrue(all(detail.delivery_location_code_source == "TRADE_DERIVED" for detail in pipeline_details))
        self.assertEqual(len(power_details), 1)
        self.assertEqual(power_details[0].delivery_id, "DLV-T-POWER-1")
        self.assertEqual(power_details[0].market_operator, "PJM")
        self.assertEqual(power_details[0].pricing_node_code, "PJM_WEST")
        self.assertEqual(power_details[0].market_operator_source, "SYSTEM_GENERATED")
        self.assertEqual(power_details[0].pricing_node_code_source, "TRADE_DERIVED")
        self.assertEqual(power_details[0].delivery_node_code_source, "TRADE_DERIVED")

    def test_scoped_sync_materializes_requested_trade_without_global_prune(self) -> None:
        with self.SessionLocal() as session:
            result = synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.document",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
                trade_ids=["T-GAS-1"],
                delete_obsolete=False,
            )
            session.commit()

            obligations = session.execute(
                select(DeliveryObligation).order_by(DeliveryObligation.delivery_id.asc())
            ).scalars().all()
            pipeline_details = session.execute(select(DeliveryPipelineDetail)).scalars().all()

        self.assertEqual(result.created_count, 1)
        self.assertEqual(result.updated_count, 0)
        self.assertEqual(result.deleted_count, 0)
        self.assertEqual(result.total_count, 1)
        self.assertEqual([record.delivery_id for record in obligations], ["DLV-T-GAS-1"])
        self.assertEqual([detail.delivery_id for detail in pipeline_details], ["DLV-T-GAS-1"])

    def test_create_delivery_from_document_materializes_single_trade_delivery(self) -> None:
        with self.SessionLocal() as session:
            delivery = create_delivery_from_document(
                session,
                trade_id="T-GAS-1",
                actor_id="ops.document",
                source_document_id="DOC-GAS-NOM-1",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )
            session.commit()

            obligations = session.execute(
                select(DeliveryObligation).order_by(DeliveryObligation.delivery_id.asc())
            ).scalars().all()
            pipeline_detail = session.get(DeliveryPipelineDetail, "DLV-T-GAS-1")

        self.assertEqual(delivery.delivery_id, "DLV-T-GAS-1")
        self.assertEqual(delivery.created_by, "ops.document")
        self.assertEqual([record.delivery_id for record in obligations], ["DLV-T-GAS-1"])
        self.assertIsNotNone(pipeline_detail)

    def test_create_delivery_from_document_rejects_non_physical_or_inactive_trade(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(LookupError, "Active physical trade 'T-FIN-1' was not found"):
                create_delivery_from_document(
                    session,
                    trade_id="T-FIN-1",
                    actor_id="ops.document",
                    source_document_id="DOC-FIN-1",
                )

            with self.assertRaisesRegex(LookupError, "Active physical trade 'T-CANCELLED-1' was not found"):
                create_delivery_from_document(
                    session,
                    trade_id="T-CANCELLED-1",
                    actor_id="ops.document",
                    source_document_id="DOC-CANCELLED-1",
                )

    def test_create_delivery_from_document_blocks_duplicates_and_noncanonical_ids(self) -> None:
        with self.SessionLocal() as session:
            create_delivery_from_document(
                session,
                trade_id="T-GAS-1",
                actor_id="ops.document",
                source_document_id="DOC-GAS-NOM-1",
            )
            session.commit()

            with self.assertRaisesRegex(ValueError, "already exists"):
                create_delivery_from_document(
                    session,
                    trade_id="T-GAS-1",
                    actor_id="ops.document",
                    source_document_id="DOC-GAS-NOM-RETRY",
                )

            with self.assertRaisesRegex(ValueError, "not a canonical delivery"):
                create_delivery_from_document(
                    session,
                    trade_id="T-POWER-1",
                    actor_id="ops.document",
                    source_document_id="DOC-POWER-SCHEDULE",
                    delivery_id="DLV-WRONG",
                )

    def test_create_delivery_from_document_requires_leg_target_for_multi_leg_trade(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(ValueError, "multiple delivery legs"):
                create_delivery_from_document(
                    session,
                    trade_id="T-SWAP-1",
                    actor_id="ops.document",
                    source_document_id="DOC-SWAP-NOM",
                )

            delivery = create_delivery_from_document(
                session,
                trade_id="T-SWAP-1",
                actor_id="ops.document",
                source_document_id="DOC-SWAP-NOM",
                leg_no=2,
            )
            session.commit()
            persisted_target = session.get(DeliveryObligation, "DLV-T-SWAP-1-L2")

        self.assertEqual(delivery.delivery_id, "DLV-T-SWAP-1-L2")
        self.assertIsNotNone(persisted_target)

    def test_persisted_transport_override_removes_missing_mode_blocker(self) -> None:
        with self.SessionLocal() as session:
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )
            logistics_delivery = session.get(DeliveryObligation, "DLV-T-LOG-1")
            self.assertIsNotNone(logistics_delivery)
            if logistics_delivery is None:
                raise AssertionError("Expected synchronized logistics delivery to exist.")
            logistics_delivery.transport_mode = "TRUCK"
            logistics_delivery.transport_mode_source = "EXPLICIT"
            logistics_delivery.mode_family = "LOGISTICS"
            logistics_delivery.delivery_profile = "LOAD_DISCHARGE_WINDOW"
            logistics_delivery.updated_at = datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc)
            logistics_delivery.updated_by = "ops.dispatch"
            logistics_delivery.version += 1

            logistics_detail = session.get(DeliveryLogisticsDetail, "DLV-T-LOG-1")
            self.assertIsNotNone(logistics_detail)
            if logistics_detail is None:
                raise AssertionError("Expected synchronized logistics detail row to exist.")
            logistics_detail.carrier_name = "Acme Trucking"
            logistics_detail.carrier_name_source = "MANUAL"
            logistics_detail.asset_reference = "TRUCK-17"
            logistics_detail.asset_reference_source = "MANUAL"
            logistics_detail.updated_at = datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc)
            logistics_detail.updated_by = "ops.dispatch"
            logistics_detail.version += 1
            session.commit()

        with self.SessionLocal() as session:
            payload = list_delivery_obligations_for_operations(
                session,
                now=datetime(2026, 4, 5, 14, 0, tzinfo=timezone.utc),
            )

        logistics = next(delivery for delivery in payload if delivery.delivery_id == "DLV-T-LOG-1")
        self.assertEqual(logistics.transport_mode, "TRUCK")
        self.assertEqual(logistics.transport_mode_source, "EXPLICIT")
        self.assertEqual(logistics.carrier_name, "Acme Trucking")
        self.assertEqual(logistics.asset_reference, "TRUCK-17")
        self.assertNotIn("Explicit transport mode is missing for discrete logistics delivery.", logistics.blockers)

    def test_route_bound_rail_delivery_requires_route_and_station_details(self) -> None:
        with self.SessionLocal() as session:
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )
            logistics_delivery = session.get(DeliveryObligation, "DLV-T-LOG-1")
            self.assertIsNotNone(logistics_delivery)
            if logistics_delivery is None:
                raise AssertionError("Expected synchronized logistics delivery to exist.")
            logistics_delivery.transport_mode = "RAIL"
            logistics_delivery.transport_mode_source = "EXPLICIT"
            logistics_delivery.mode_family = "LOGISTICS"
            logistics_delivery.delivery_profile = "LOAD_DISCHARGE_WINDOW"
            logistics_delivery.updated_at = datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc)
            logistics_delivery.updated_by = "ops.dispatch"
            logistics_delivery.version += 1
            session.commit()

        with self.SessionLocal() as session:
            payload = list_delivery_obligations_for_operations(
                session,
                now=datetime(2026, 4, 5, 14, 0, tzinfo=timezone.utc),
            )

        logistics = next(delivery for delivery in payload if delivery.delivery_id == "DLV-T-LOG-1")
        self.assertIn("Rail route selection is missing.", logistics.blockers)
        self.assertIn("Rail origin station is missing.", logistics.blockers)
        self.assertIn("Rail destination station is missing.", logistics.blockers)

        self._seed_rail_route()
        with self.SessionLocal() as session:
            logistics_detail = session.get(DeliveryLogisticsDetail, "DLV-T-LOG-1")
            self.assertIsNotNone(logistics_detail)
            if logistics_detail is None:
                raise AssertionError("Expected synchronized logistics detail to exist.")
            logistics_detail.origin_location_code = "HOUSTON"
            logistics_detail.origin_location_code_source = "MANUAL"
            logistics_detail.updated_at = datetime(2026, 4, 5, 15, 0, tzinfo=timezone.utc)
            logistics_detail.updated_by = "ops.dispatch"
            logistics_detail.version += 1

            update_delivery_rail_detail(
                session,
                delivery_id="DLV-T-LOG-1",
                actor_id="ops.dispatch",
                changes={
                    "rail_route_code": "BNSF_MIDLAND_TO_CUSHING",
                    "origin_station_code": "MIDLAND_YARD",
                    "destination_station_code": "CUSHING_TERM",
                },
                now=datetime(2026, 4, 5, 15, 5, tzinfo=timezone.utc),
            )
            session.commit()

        with self.SessionLocal() as session:
            payload = list_delivery_obligations_for_operations(
                session,
                now=datetime(2026, 4, 5, 16, 0, tzinfo=timezone.utc),
            )

        logistics = next(delivery for delivery in payload if delivery.delivery_id == "DLV-T-LOG-1")
        self.assertEqual(logistics.rail_route_code, "BNSF_MIDLAND_TO_CUSHING")
        self.assertEqual(logistics.rail_line_code, "BNSF_SOUTHERN_TRANSCON")
        self.assertEqual(logistics.railroad_code, "BNSF")
        self.assertEqual(logistics.rail_route_direction, "EASTBOUND")
        self.assertEqual(logistics.rail_schedule_timezone, "America/Chicago")
        self.assertEqual(logistics.rail_service_calendar_code, "US_FED_BANK")
        self.assertEqual(logistics.rail_placement_cutoff_time_local, "14:00")
        self.assertEqual(logistics.rail_release_cutoff_time_local, "10:00")
        self.assertEqual(logistics.rail_placement_free_time_hours, 48)
        self.assertEqual(logistics.rail_release_free_time_hours, 24)
        self.assertIn(
            "Rail origin location does not match selected route origin 'MIDLAND'.",
            logistics.blockers,
        )

        with self.SessionLocal() as session:
            logistics_detail = session.get(DeliveryLogisticsDetail, "DLV-T-LOG-1")
            self.assertIsNotNone(logistics_detail)
            if logistics_detail is None:
                raise AssertionError("Expected synchronized logistics detail to exist.")
            logistics_detail.origin_location_code = "MIDLAND"
            logistics_detail.origin_location_code_source = "MANUAL"
            logistics_detail.updated_at = datetime(2026, 4, 5, 16, 5, tzinfo=timezone.utc)
            logistics_detail.updated_by = "ops.dispatch"
            logistics_detail.version += 1
            session.commit()

        with self.SessionLocal() as session:
            payload = list_delivery_obligations_for_operations(
                session,
                now=datetime(2026, 4, 5, 17, 0, tzinfo=timezone.utc),
            )

        logistics = next(delivery for delivery in payload if delivery.delivery_id == "DLV-T-LOG-1")
        self.assertEqual(logistics.status, "READY")
        self.assertNotIn("Rail route selection is missing.", logistics.blockers)
        self.assertNotIn("Rail origin station is missing.", logistics.blockers)
        self.assertNotIn("Rail destination station is missing.", logistics.blockers)
        self.assertNotIn(
            "Rail origin location does not match selected route origin 'MIDLAND'.",
            logistics.blockers,
        )

    def test_route_bound_rail_delivery_flags_inactive_route_and_waybill_gaps(self) -> None:
        self._seed_rail_route()
        with self.SessionLocal() as session:
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )
            logistics_delivery = session.get(DeliveryObligation, "DLV-T-LOG-1")
            self.assertIsNotNone(logistics_delivery)
            if logistics_delivery is None:
                raise AssertionError("Expected synchronized logistics delivery to exist.")
            logistics_delivery.transport_mode = "RAIL"
            logistics_delivery.transport_mode_source = "EXPLICIT"
            logistics_delivery.mode_family = "LOGISTICS"
            logistics_delivery.delivery_profile = "LOAD_DISCHARGE_WINDOW"
            logistics_delivery.updated_at = datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc)
            logistics_delivery.updated_by = "ops.dispatch"
            logistics_delivery.version += 1

            logistics_detail = session.get(DeliveryLogisticsDetail, "DLV-T-LOG-1")
            self.assertIsNotNone(logistics_detail)
            if logistics_detail is None:
                raise AssertionError("Expected synchronized logistics detail to exist.")
            logistics_detail.origin_location_code = "MIDLAND"
            logistics_detail.origin_location_code_source = "MANUAL"
            logistics_detail.updated_at = datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc)
            logistics_detail.updated_by = "ops.dispatch"
            logistics_detail.version += 1
            session.commit()

        with self.SessionLocal() as session:
            update_delivery_rail_detail(
                session,
                delivery_id="DLV-T-LOG-1",
                actor_id="ops.dispatch",
                changes={
                    "rail_route_code": "BNSF_MIDLAND_TO_CUSHING",
                    "origin_station_code": "MIDLAND_YARD",
                    "destination_station_code": "CUSHING_TERM",
                },
                now=datetime(2026, 4, 5, 14, 0, tzinfo=timezone.utc),
            )
            trade = session.get(Trade, "T-LOG-1")
            self.assertIsNotNone(trade)
            if trade is None:
                raise AssertionError("Expected logistics trade to exist.")
            trade.nomination_status = "NOMINATED"
            trade.updated_at = datetime(2026, 4, 5, 14, 5, tzinfo=timezone.utc)

            rail_route = session.get(ReferenceRailRoute, "BNSF_MIDLAND_TO_CUSHING")
            self.assertIsNotNone(rail_route)
            if rail_route is None:
                raise AssertionError("Expected rail route to exist.")
            rail_route.is_active = False
            rail_route.updated_at = datetime(2026, 4, 5, 14, 5, tzinfo=timezone.utc)
            rail_route.updated_by = "ops.reference"
            rail_route.version += 1
            session.commit()

        with self.SessionLocal() as session:
            payload = list_delivery_obligations_for_operations(
                session,
                now=datetime(2026, 4, 5, 15, 0, tzinfo=timezone.utc),
            )

        logistics = next(delivery for delivery in payload if delivery.delivery_id == "DLV-T-LOG-1")
        self.assertEqual(logistics.status, "BLOCKED")
        self.assertIn(
            "Selected rail route 'BNSF_MIDLAND_TO_CUSHING' is inactive in reference data.",
            logistics.blockers,
        )
        self.assertIn("Waybill reference is missing after rail scheduling started.", logistics.blockers)

    def test_sync_preserves_manual_shared_overrides_and_refreshes_trade_derived_fields(self) -> None:
        with self.SessionLocal() as session:
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )
            logistics_delivery = session.get(DeliveryObligation, "DLV-T-LOG-1")
            self.assertIsNotNone(logistics_delivery)
            if logistics_delivery is None:
                raise AssertionError("Expected synchronized logistics delivery to exist.")

            logistics_delivery.book = "OPS_BOOK"
            logistics_delivery.book_source = "MANUAL"
            logistics_delivery.location_code = "MIDLAND"
            logistics_delivery.location_source = "MANUAL"
            logistics_delivery.delivery_start = date(2026, 4, 9)
            logistics_delivery.delivery_end = date(2026, 4, 10)
            logistics_delivery.delivery_window_source = "MANUAL"
            logistics_delivery.execution_status = "ON_HOLD"
            logistics_delivery.execution_status_source = "MANUAL"
            logistics_delivery.operations_owner = "dispatch.alpha"
            logistics_delivery.operations_owner_source = "MANUAL"
            logistics_delivery.external_reference = "OPS-REF-22"
            logistics_delivery.external_reference_source = "MANUAL"
            logistics_delivery.ops_notes = "Hold at origin pending paperwork."
            logistics_delivery.ops_notes_source = "MANUAL"
            logistics_detail = session.get(DeliveryLogisticsDetail, "DLV-T-LOG-1")
            self.assertIsNotNone(logistics_detail)
            if logistics_detail is None:
                raise AssertionError("Expected synchronized logistics detail to exist.")
            logistics_detail.carrier_name = "Acme Trucking"
            logistics_detail.carrier_name_source = "MANUAL"
            logistics_detail.updated_at = datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc)
            logistics_detail.updated_by = "ops.dispatch"
            logistics_detail.version += 1
            logistics_delivery.updated_at = datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc)
            logistics_delivery.updated_by = "ops.dispatch"
            logistics_delivery.version += 1

            trade = session.get(Trade, "T-LOG-1")
            self.assertIsNotNone(trade)
            if trade is None:
                raise AssertionError("Expected source trade to exist.")
            trade.book = "CRUDE_PHYS_UPDATED"
            trade.counterparty = "MOTIVA"
            trade.location_code = "HOUSTON"
            trade.delivery_start = date(2026, 4, 11)
            trade.delivery_end = date(2026, 4, 12)
            trade.actualization_status = "ACTUALIZED"
            trade.updated_at = datetime(2026, 4, 5, 14, 0, tzinfo=timezone.utc)
            session.commit()

        with self.SessionLocal() as session:
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 5, 15, 0, tzinfo=timezone.utc),
            )
            session.commit()

            refreshed_delivery = session.get(DeliveryObligation, "DLV-T-LOG-1")
            self.assertIsNotNone(refreshed_delivery)
            if refreshed_delivery is None:
                raise AssertionError("Expected synchronized logistics delivery to remain.")

            self.assertEqual(refreshed_delivery.book, "OPS_BOOK")
            self.assertEqual(refreshed_delivery.book_source, "MANUAL")
            self.assertEqual(refreshed_delivery.counterparty, "MOTIVA")
            self.assertEqual(refreshed_delivery.counterparty_source, "TRADE_DERIVED")
            self.assertEqual(refreshed_delivery.location_code, "MIDLAND")
            self.assertEqual(refreshed_delivery.location_source, "MANUAL")
            self.assertEqual(refreshed_delivery.delivery_start, date(2026, 4, 9))
            self.assertEqual(refreshed_delivery.delivery_end, date(2026, 4, 10))
            self.assertEqual(refreshed_delivery.delivery_window_source, "MANUAL")
            self.assertEqual(refreshed_delivery.execution_status, "ON_HOLD")
            self.assertEqual(refreshed_delivery.execution_status_source, "MANUAL")
            self.assertEqual(refreshed_delivery.operations_owner, "dispatch.alpha")
            self.assertEqual(refreshed_delivery.operations_owner_source, "MANUAL")
            self.assertEqual(refreshed_delivery.external_reference, "OPS-REF-22")
            self.assertEqual(refreshed_delivery.external_reference_source, "MANUAL")
            self.assertEqual(refreshed_delivery.ops_notes, "Hold at origin pending paperwork.")
            self.assertEqual(refreshed_delivery.ops_notes_source, "MANUAL")

            refreshed_logistics_detail = session.get(DeliveryLogisticsDetail, "DLV-T-LOG-1")
            self.assertIsNotNone(refreshed_logistics_detail)
            if refreshed_logistics_detail is None:
                raise AssertionError("Expected synchronized logistics detail to remain.")
            self.assertEqual(refreshed_logistics_detail.destination_location_code, "MIDLAND")
            self.assertEqual(refreshed_logistics_detail.destination_location_code_source, "SYSTEM_GENERATED")
            self.assertEqual(refreshed_logistics_detail.carrier_name, "Acme Trucking")
            self.assertEqual(refreshed_logistics_detail.carrier_name_source, "MANUAL")

    def test_delivery_events_drive_execution_status_and_survive_trade_sync(self) -> None:
        with self.SessionLocal() as session:
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )
            append_delivery_event(
                session,
                delivery_id="DLV-T-GAS-1",
                actor_id="scheduler.gas",
                event_type="SCHEDULE_COMMITTED",
                occurred_at=datetime(2026, 4, 8, 7, 0, tzinfo=timezone.utc),
                location_code="HENRY_HUB",
                reference_code="NOM-70",
                notes="Timely nomination accepted.",
                now=datetime(2026, 4, 8, 7, 5, tzinfo=timezone.utc),
            )
            append_delivery_event(
                session,
                delivery_id="DLV-T-GAS-1",
                actor_id="scheduler.gas",
                event_type="DELIVERY_COMPLETED",
                occurred_at=datetime(2026, 4, 8, 18, 0, tzinfo=timezone.utc),
                location_code="HENRY_HUB",
                reference_code="ALLOC-70",
                notes="Flow confirmed complete.",
                now=datetime(2026, 4, 8, 18, 5, tzinfo=timezone.utc),
            )
            session.commit()

        with self.SessionLocal() as session:
            before_sync = list_delivery_obligations_for_operations(
                session,
                now=datetime(2026, 4, 8, 19, 0, tzinfo=timezone.utc),
            )

        gas_delivery = next(delivery for delivery in before_sync if delivery.delivery_id == "DLV-T-GAS-1")
        self.assertEqual(gas_delivery.execution_status, "COMPLETED")
        self.assertEqual(gas_delivery.event_count, 2)
        self.assertEqual(gas_delivery.latest_event_type, "DELIVERY_COMPLETED")
        self.assertEqual(gas_delivery.delivery_events[0].reference_code, "ALLOC-70")
        self.assertEqual(gas_delivery.status, "COMPLETED")

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-GAS-1")
            self.assertIsNotNone(trade)
            if trade is None:
                raise AssertionError("Expected synchronized gas trade to exist.")
            trade.actualization_status = "PENDING"
            trade.nomination_status = "PENDING"
            trade.updated_at = datetime(2026, 4, 8, 20, 0, tzinfo=timezone.utc)

            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 8, 20, 5, tzinfo=timezone.utc),
            )
            session.commit()

        with self.SessionLocal() as session:
            synced_delivery = session.get(DeliveryObligation, "DLV-T-GAS-1")
            self.assertIsNotNone(synced_delivery)
            if synced_delivery is None:
                raise AssertionError("Expected synchronized gas delivery to remain.")
            self.assertEqual(synced_delivery.execution_status, "COMPLETED")
            self.assertEqual(synced_delivery.execution_status_source, "SYSTEM_GENERATED")

            payload = list_delivery_obligations_for_operations(
                session,
                now=datetime(2026, 4, 8, 20, 10, tzinfo=timezone.utc),
            )

        gas_delivery_after_sync = next(delivery for delivery in payload if delivery.delivery_id == "DLV-T-GAS-1")
        self.assertEqual(gas_delivery_after_sync.execution_status, "COMPLETED")
        self.assertEqual(gas_delivery_after_sync.latest_event_type, "DELIVERY_COMPLETED")
        self.assertEqual(gas_delivery_after_sync.event_count, 2)

    def test_reverse_delivery_event_appends_reversal_and_recomputes_live_status(self) -> None:
        with self.SessionLocal() as session:
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )
            append_delivery_event(
                session,
                delivery_id="DLV-T-GAS-1",
                actor_id="scheduler.gas",
                event_type="SCHEDULE_COMMITTED",
                occurred_at=datetime(2026, 4, 8, 7, 0, tzinfo=timezone.utc),
                location_code="HENRY_HUB",
                reference_code="NOM-70",
                notes="Timely nomination accepted.",
                now=datetime(2026, 4, 8, 7, 5, tzinfo=timezone.utc),
            )
            completed_delivery = append_delivery_event(
                session,
                delivery_id="DLV-T-GAS-1",
                actor_id="scheduler.gas",
                event_type="DELIVERY_COMPLETED",
                occurred_at=datetime(2026, 4, 8, 18, 0, tzinfo=timezone.utc),
                location_code="HENRY_HUB",
                reference_code="ALLOC-70",
                notes="Flow confirmed complete.",
                now=datetime(2026, 4, 8, 18, 5, tzinfo=timezone.utc),
            )
            completed_event_id = completed_delivery.delivery_events[0].event_id
            reversed_delivery = reverse_delivery_event(
                session,
                delivery_id="DLV-T-GAS-1",
                event_id=completed_event_id,
                actor_id="ops.corrector",
                reversal_reason="Completion was posted against the wrong cycle close.",
                reversed_at=datetime(2026, 4, 8, 19, 0, tzinfo=timezone.utc),
                source="ops-console",
                notes="Reopen movement state while allocation is corrected.",
                now=datetime(2026, 4, 8, 19, 5, tzinfo=timezone.utc),
            )
            session.commit()

        self.assertEqual(reversed_delivery.execution_status, "SCHEDULED")
        self.assertEqual(reversed_delivery.latest_event_type, "EVENT_REVERSED")
        self.assertEqual(reversed_delivery.event_count, 3)
        self.assertEqual(reversed_delivery.delivery_events[0].reversal_of_event_id, completed_event_id)
        self.assertEqual(
            reversed_delivery.delivery_events[0].reversal_reason,
            "Completion was posted against the wrong cycle close.",
        )

        with self.SessionLocal() as session:
            persisted_delivery = session.get(DeliveryObligation, "DLV-T-GAS-1")
            self.assertIsNotNone(persisted_delivery)
            if persisted_delivery is None:
                raise AssertionError("Expected synchronized gas delivery to remain.")
            self.assertEqual(persisted_delivery.execution_status, "SCHEDULED")
            reversal_event = (
                session.query(DeliveryEvent)
                .filter(DeliveryEvent.delivery_id == "DLV-T-GAS-1", DeliveryEvent.event_type == "EVENT_REVERSED")
                .one()
            )
            self.assertEqual(reversal_event.reversal_of_event_id, completed_event_id)
            self.assertEqual(reversal_event.created_by, "ops.corrector")

    def test_reverse_delivery_event_rejects_duplicate_and_reversal_targets(self) -> None:
        with self.SessionLocal() as session:
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.sync",
                now=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            )
            completed_delivery = append_delivery_event(
                session,
                delivery_id="DLV-T-LOG-1",
                actor_id="ops.logger",
                event_type="DELIVERY_COMPLETED",
                occurred_at=datetime(2026, 4, 6, 17, 0, tzinfo=timezone.utc),
                location_code="CUSHING",
                reference_code="BOL-LOG-1",
                notes="Logged in error.",
                now=datetime(2026, 4, 6, 17, 5, tzinfo=timezone.utc),
            )
            completed_event_id = completed_delivery.delivery_events[0].event_id
            reverse_delivery_event(
                session,
                delivery_id="DLV-T-LOG-1",
                event_id=completed_event_id,
                actor_id="ops.corrector",
                reversal_reason="Wrong truck ticket.",
                reversed_at=datetime(2026, 4, 6, 18, 0, tzinfo=timezone.utc),
                now=datetime(2026, 4, 6, 18, 5, tzinfo=timezone.utc),
            )
            session.commit()

            reversal_event_id = (
                session.query(DeliveryEvent.id)
                .filter(
                    DeliveryEvent.delivery_id == "DLV-T-LOG-1",
                    DeliveryEvent.event_type == "EVENT_REVERSED",
                )
                .scalar()
            )

            with self.assertRaisesRegex(ValueError, "already been reversed"):
                reverse_delivery_event(
                    session,
                    delivery_id="DLV-T-LOG-1",
                    event_id=completed_event_id,
                    actor_id="ops.corrector",
                    reversal_reason="Duplicate retry.",
                    now=datetime(2026, 4, 6, 18, 10, tzinfo=timezone.utc),
                )

            with self.assertRaisesRegex(ValueError, "already a reversal entry"):
                reverse_delivery_event(
                    session,
                    delivery_id="DLV-T-LOG-1",
                    event_id=reversal_event_id,
                    actor_id="ops.corrector",
                    reversal_reason="Should not reverse a reversal.",
                    now=datetime(2026, 4, 6, 18, 15, tzinfo=timezone.utc),
                )

    def test_void_trade_actualization_marks_record_void_and_clears_projection(self) -> None:
        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-LOG-1")
            self.assertIsNotNone(trade)
            if trade is None:
                raise AssertionError("Expected logistics trade to exist.")
            trade.actualization_status = "ACTUALIZED"
            session.add(
                TradeActualization(
                    delivery_id="DLV-T-LOG-1",
                    trade_id="T-LOG-1",
                    leg_no=None,
                    actual_quantity=1000,
                    actualized_at=datetime(2026, 4, 7, 18, 0, tzinfo=timezone.utc),
                    source="terminal-report",
                    notes="Mistaken delivered quantity.",
                    voided_at=None,
                    voided_by=None,
                    void_reason=None,
                    created_at=datetime(2026, 4, 7, 18, 0, tzinfo=timezone.utc),
                    created_by="ops.seed",
                    updated_at=datetime(2026, 4, 7, 18, 0, tzinfo=timezone.utc),
                    updated_by="ops.seed",
                    version=1,
                )
            )
            session.commit()

            actualization = void_trade_actualization(
                session,
                trade_id="T-LOG-1",
                actor_id="ops.corrector",
                void_reason="Movement was recorded against the wrong trade ticket.",
                notes="Clear the mistaken delivered quantity from live state.",
                now=datetime(2026, 4, 7, 19, 0, tzinfo=timezone.utc),
            )
            session.commit()

        self.assertEqual(actualization.actualization_status, "PENDING")
        self.assertIsNone(actualization.actual_quantity)
        self.assertIsNone(actualization.actualized_at)
        self.assertIsNotNone(actualization.voided_at)
        self.assertEqual(actualization.void_reason, "Movement was recorded against the wrong trade ticket.")

        with self.SessionLocal() as session:
            persisted_actualization = (
                session.query(TradeActualization)
                .filter(TradeActualization.delivery_id == "DLV-T-LOG-1")
                .one()
            )
            self.assertEqual(float(persisted_actualization.actual_quantity), 1000.0)
            self.assertIsNotNone(persisted_actualization.voided_at)
            self.assertEqual(persisted_actualization.voided_by, "ops.corrector")

            payload = list_delivery_obligations_for_operations(
                session,
                now=datetime(2026, 4, 7, 19, 5, tzinfo=timezone.utc),
            )

        logistics = next(delivery for delivery in payload if delivery.delivery_id == "DLV-T-LOG-1")
        self.assertEqual(logistics.actualization_status, "PENDING")
        self.assertIsNone(logistics.actualized_quantity)
        self.assertIsNone(logistics.actualized_at)

    def test_void_trade_actualization_rejects_missing_and_already_voided_rows(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(LookupError, "does not have an actualization record to void"):
                void_trade_actualization(
                    session,
                    trade_id="T-POWER-1",
                    actor_id="ops.corrector",
                    void_reason="Nothing to void yet.",
                    now=datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
                )

            trade = session.get(Trade, "T-POWER-1")
            self.assertIsNotNone(trade)
            if trade is None:
                raise AssertionError("Expected power trade to exist.")
            trade.actualization_status = "ACTUALIZED"
            session.add(
                TradeActualization(
                    delivery_id="DLV-T-POWER-1",
                    trade_id="T-POWER-1",
                    leg_no=None,
                    actual_quantity=500,
                    actualized_at=datetime(2026, 4, 7, 18, 0, tzinfo=timezone.utc),
                    source="iso-report",
                    notes="Temporary actualization.",
                    voided_at=None,
                    voided_by=None,
                    void_reason=None,
                    created_at=datetime(2026, 4, 7, 18, 0, tzinfo=timezone.utc),
                    created_by="ops.seed",
                    updated_at=datetime(2026, 4, 7, 18, 0, tzinfo=timezone.utc),
                    updated_by="ops.seed",
                    version=1,
                )
            )
            session.commit()

            void_trade_actualization(
                session,
                trade_id="T-POWER-1",
                actor_id="ops.corrector",
                void_reason="Wrong interval schedule.",
                now=datetime(2026, 4, 7, 19, 0, tzinfo=timezone.utc),
            )
            session.commit()

            with self.assertRaisesRegex(ValueError, "already voided"):
                void_trade_actualization(
                    session,
                    trade_id="T-POWER-1",
                    actor_id="ops.corrector",
                    void_reason="Duplicate retry.",
                    now=datetime(2026, 4, 7, 19, 5, tzinfo=timezone.utc),
                )
