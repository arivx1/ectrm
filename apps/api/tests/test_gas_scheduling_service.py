from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.operations.services.gas_scheduling import (
    GAS_SCHEDULE_BASIS_V1,
    GAS_SCHEDULE_READINESS_BLOCKED,
    GAS_SCHEDULE_READINESS_IN_FLIGHT,
    GasScheduleCommitmentInput,
    build_gas_schedule_readiness,
    record_gas_schedule_commitment,
    transition_gas_schedule_status,
)
from apps.api.app.domains.operations.services.shipments import get_delivery_obligation_for_operations
from apps.api.app.models import Base
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade


class GasSchedulingServiceTests(unittest.TestCase):
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
            session.query(DeliveryPipelineDetail).delete()
            session.query(DeliveryObligation).delete()
            session.query(Trade).delete()
            session.commit()

    def _seed_gas_delivery(
        self,
        session,
        *,
        trade_id: str = "T-GAS-SCHED",
        delivery_id: str = "DLV-T-GAS-SCHED",
        confirmation_status: str = "CONFIRMED",
        nomination_status: str = "PENDING",
        scheduled_quantity: Decimal | None = Decimal("1000.000000"),
        quantity_unit_code: str | None = "MMBTU",
        gas_day_start: date | None = date(2026, 8, 1),
        gas_day_end: date | None = date(2026, 8, 31),
        owner: str | None = "sched.ops",
        pipeline_system: str | None = "NGPL",
        pipeline_path: str | None = "WAHA_TO_HENRY",
        receipt_location_code: str | None = "WAHA",
        delivery_location_code: str | None = "HENRY_HUB",
        nomination_reference: str | None = None,
        with_pipeline_detail: bool = True,
    ) -> None:
        now = datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc)
        session.add(
            Trade(
                trade_id=trade_id,
                originating_option_trade_id=None,
                external_trade_id=f"EXT-{trade_id}",
                source_system="ETRM",
                created_at=now,
                updated_at=now,
                execution_timestamp=now,
                trade_date=date(2026, 7, 20),
                effective_start_date=gas_day_start,
                effective_end_date=gas_day_end,
                quality_spec=None,
                unit_of_measure=quantity_unit_code,
                trade_currency_code="USD",
                location_code=delivery_location_code,
                delivery_start=gas_day_start,
                delivery_end=gas_day_end,
                price_unit_code="USD/MMBTU",
                instrument_type="LINEAR",
                option_type=None,
                option_style=None,
                option_strike_price=None,
                option_expiration_date=None,
                trade_nature="PHYSICAL",
                trade_structure="SINGLE",
                trade_side="BUY",
                book="GAS_PHYS",
                portfolio="PROMPT",
                counterparty="SHELL_TRADING",
                commodity_class="NATURAL_GAS",
                commodity="HENRY_HUB_GAS",
                pricing_type="FIXED",
                pricing_status="PRICED",
                confirmation_status=confirmation_status,
                nomination_status=nomination_status,
                allocation_status="PENDING",
                actualization_status="PENDING",
                price_index_code=None,
                price=Decimal("3.250000"),
                volume=scheduled_quantity,
                invoice_status="PENDING",
                payment_status="PENDING",
                settlement_status="PENDING",
                trader_user="trader.alpha",
                status="ACTIVE",
                last_event_id=f"evt-{trade_id}",
            )
        )
        session.add(
            DeliveryObligation(
                delivery_id=delivery_id,
                trade_id=trade_id,
                trade_leg_id=None,
                leg_no=None,
                external_trade_id=f"EXT-{trade_id}",
                direction="INBOUND",
                mode_family="NETWORK_FLOW",
                transport_mode="PIPELINE",
                transport_mode_source="DERIVED",
                delivery_profile="FLOW_WINDOW",
                book="GAS_PHYS",
                book_source="TRADE_DERIVED",
                portfolio="PROMPT",
                portfolio_source="TRADE_DERIVED",
                counterparty="SHELL_TRADING",
                counterparty_source="TRADE_DERIVED",
                commodity_class="NATURAL_GAS",
                commodity="HENRY_HUB_GAS",
                volume=scheduled_quantity,
                unit_of_measure=quantity_unit_code,
                trade_currency_code="USD",
                price_unit_code="USD/MMBTU",
                location_code=delivery_location_code,
                location_source="TRADE_DERIVED",
                delivery_start=gas_day_start,
                delivery_end=gas_day_end,
                delivery_window_source="TRADE_DERIVED",
                execution_status="PLANNED",
                execution_status_source="SYSTEM_GENERATED",
                operations_owner=owner,
                operations_owner_source="MANUAL" if owner else "SYSTEM_GENERATED",
                external_reference=None,
                external_reference_source="SYSTEM_GENERATED",
                ops_notes=None,
                ops_notes_source="SYSTEM_GENERATED",
                booked_at=now,
                source_trade_updated_at=now,
                created_at=now,
                created_by="test",
                updated_at=now,
                updated_by="test",
                version=1,
            )
        )
        if with_pipeline_detail:
            session.add(
                DeliveryPipelineDetail(
                    delivery_id=delivery_id,
                    pipeline_system=pipeline_system,
                    pipeline_system_source="MANUAL" if pipeline_system else "SYSTEM_GENERATED",
                    pipeline_path=pipeline_path,
                    pipeline_path_source="MANUAL" if pipeline_path else "SYSTEM_GENERATED",
                    receipt_location_code=receipt_location_code,
                    receipt_location_code_source="MANUAL" if receipt_location_code else "SYSTEM_GENERATED",
                    delivery_location_code=delivery_location_code,
                    delivery_location_code_source="MANUAL" if delivery_location_code else "SYSTEM_GENERATED",
                    contract_number="K-100",
                    contract_number_source="MANUAL",
                    cycle_code="TIMELY",
                    cycle_code_source="MANUAL",
                    nomination_reference=nomination_reference,
                    nomination_reference_source="MANUAL" if nomination_reference else "SYSTEM_GENERATED",
                    created_at=now,
                    created_by="test",
                    updated_at=now,
                    updated_by="test",
                    version=1,
                )
            )

    def test_readiness_reports_blockers_for_missing_pipeline_schedule_fields(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_delivery(
                session,
                confirmation_status="PENDING",
                scheduled_quantity=None,
                quantity_unit_code=None,
                gas_day_start=None,
                gas_day_end=None,
                owner=None,
                with_pipeline_detail=False,
            )
            session.commit()

            readiness = build_gas_schedule_readiness(
                session,
                delivery_id="DLV-T-GAS-SCHED",
                now=datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc),
            )

        self.assertEqual(readiness.basis, GAS_SCHEDULE_BASIS_V1)
        self.assertEqual(readiness.readiness_status, GAS_SCHEDULE_READINESS_BLOCKED)
        blocker_codes = {blocker.code for blocker in readiness.blockers}
        self.assertIn("CONFIRMATION_NOT_COMPLETE", blocker_codes)
        self.assertIn("MISSING_SCHEDULED_QUANTITY", blocker_codes)
        self.assertIn("MISSING_GAS_DAY_WINDOW", blocker_codes)
        self.assertIn("MISSING_SCHEDULE_OWNER", blocker_codes)
        self.assertIn("MISSING_PIPELINE_SYSTEM", blocker_codes)
        self.assertIn("MISSING_PIPELINE_PATH", blocker_codes)
        self.assertIn("MISSING_RECEIPT_LOCATION", blocker_codes)
        self.assertIn("MISSING_DELIVERY_LOCATION", blocker_codes)

    def test_record_commitment_transitions_pending_schedule_to_scheduled(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_delivery(
                session,
                scheduled_quantity=None,
                quantity_unit_code=None,
                gas_day_start=None,
                gas_day_end=None,
                owner=None,
                with_pipeline_detail=False,
            )
            session.commit()

            readiness = record_gas_schedule_commitment(
                session,
                delivery_id="DLV-T-GAS-SCHED",
                actor_id="sched.ops",
                target_status="SCHEDULED",
                now=datetime(2026, 7, 21, 9, 0, tzinfo=timezone.utc),
                payload=GasScheduleCommitmentInput(
                    scheduled_quantity=Decimal("1250.000000"),
                    quantity_unit_code="MMBTU",
                    gas_day_start=date(2026, 8, 1),
                    gas_day_end=date(2026, 8, 31),
                    owner="sched.ops",
                    pipeline_system="NGPL",
                    pipeline_path="WAHA_TO_HENRY",
                    receipt_location_code="WAHA",
                    delivery_location_code="HENRY_HUB",
                    contract_number="K-100",
                    cycle_code="TIMELY",
                ),
            )
            session.commit()

            trade = session.get(Trade, "T-GAS-SCHED")
            delivery = session.get(DeliveryObligation, "DLV-T-GAS-SCHED")
            pipeline_detail = session.get(DeliveryPipelineDetail, "DLV-T-GAS-SCHED")
            audit_events = session.execute(
                select(Event).where(Event.event_type == "TradeGasScheduleStatusTransitioned")
            ).scalars().all()

        self.assertEqual(readiness.readiness_status, GAS_SCHEDULE_READINESS_IN_FLIGHT)
        self.assertEqual(readiness.current_nomination_status, "SCHEDULED")
        self.assertEqual(readiness.next_action, "SUBMIT_NOMINATION")
        self.assertEqual(readiness.blocker_count, 0)
        self.assertEqual(trade.nomination_status, "SCHEDULED")
        self.assertEqual(delivery.execution_status, "SCHEDULED")
        self.assertEqual(float(delivery.volume), 1250.0)
        self.assertEqual(delivery.operations_owner, "sched.ops")
        self.assertEqual(pipeline_detail.pipeline_path, "WAHA_TO_HENRY")
        self.assertEqual(len(audit_events), 1)
        self.assertEqual(audit_events[0].payload["readiness"]["basis"], GAS_SCHEDULE_BASIS_V1)

    def test_nomination_transition_requires_nomination_reference(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_delivery(session, nomination_status="SCHEDULED")
            session.commit()

            with self.assertRaisesRegex(ValueError, "Nomination reference is required"):
                transition_gas_schedule_status(
                    session,
                    delivery_id="DLV-T-GAS-SCHED",
                    actor_id="sched.ops",
                    target_status="NOMINATED",
                    now=datetime(2026, 7, 22, 10, 0, tzinfo=timezone.utc),
                )

            readiness = record_gas_schedule_commitment(
                session,
                delivery_id="DLV-T-GAS-SCHED",
                actor_id="sched.ops",
                target_status="NOMINATED",
                now=datetime(2026, 7, 22, 10, 5, tzinfo=timezone.utc),
                payload=GasScheduleCommitmentInput(nomination_reference="NOM-2026-08-HH"),
            )
            session.commit()

            trade = session.get(Trade, "T-GAS-SCHED")
            pipeline_detail = session.get(DeliveryPipelineDetail, "DLV-T-GAS-SCHED")

        self.assertEqual(readiness.current_nomination_status, "NOMINATED")
        self.assertEqual(readiness.next_action, "COMPLETE_NOMINATION")
        self.assertEqual(readiness.blocker_count, 0)
        self.assertEqual(trade.nomination_status, "NOMINATED")
        self.assertEqual(pipeline_detail.nomination_reference, "NOM-2026-08-HH")

    def test_delivery_board_exposes_gas_schedule_blockers(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_delivery(
                session,
                owner=None,
                pipeline_path=None,
                receipt_location_code=None,
            )
            session.commit()

            delivery = get_delivery_obligation_for_operations(
                session,
                delivery_id="DLV-T-GAS-SCHED",
                now=datetime(2026, 7, 20, 12, 0, tzinfo=timezone.utc),
            )

        self.assertEqual(delivery.scheduling_stage, "BLOCKED")
        self.assertIn("Operations owner is required for gas schedule commitment.", delivery.blockers)
        self.assertIn("Pipeline route/path is required for gas schedule commitment.", delivery.blockers)
        self.assertIn("Receipt location is required for gas schedule commitment.", delivery.blockers)


if __name__ == "__main__":
    unittest.main()
