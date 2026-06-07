from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.operations.services.actualization_ledger import (
    ACTUALIZATION_LEDGER_BASIS_V1,
    ACTUALIZATION_SETTLEMENT_BLOCKED,
    ACTUALIZATION_SETTLEMENT_ELIGIBLE,
    INVENTORY_TREATMENT_ACTUALIZATION_ONLY_DEFERRED,
    build_actualization_ledger_report,
)
from apps.api.app.domains.operations.services.actualizations import (
    upsert_trade_actualization,
    void_trade_actualization,
)
from apps.api.app.models import Base
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem


class ActualizationLedgerServiceTests(unittest.TestCase):
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
        self.now = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(TradeAccrualEntry).delete()
            session.query(TradeAccrualLot).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(Event).delete()
            session.query(TradeActualization).delete()
            session.query(DeliveryPipelineDetail).delete()
            session.query(DeliveryObligation).delete()
            session.query(Trade).delete()
            session.commit()

    def _seed_gas_trade_with_schedule(
        self,
        session,
        *,
        trade_id: str = "T-GAS-ACT",
        delivery_location_code: str | None = "HENRY_HUB",
        nomination_reference: str | None = "NOM-4455",
    ) -> None:
        delivery_id = f"DLV-{trade_id}"
        session.add(
            Trade(
                trade_id=trade_id,
                originating_option_trade_id=None,
                external_trade_id=f"EXT-{trade_id}",
                source_system="ETRM",
                created_at=self.now,
                updated_at=self.now,
                execution_timestamp=self.now,
                trade_date=date(2026, 7, 20),
                effective_start_date=date(2026, 8, 1),
                effective_end_date=date(2026, 8, 31),
                quality_spec=None,
                unit_of_measure="MMBTU",
                trade_currency_code="USD",
                location_code=delivery_location_code,
                delivery_start=date(2026, 8, 1),
                delivery_end=date(2026, 8, 31),
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
                confirmation_status="CONFIRMED",
                nomination_status="NOMINATED",
                allocation_status="PENDING",
                actualization_status="PENDING",
                price_index_code=None,
                price=Decimal("3.250000"),
                volume=Decimal("1000.000000"),
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
                volume=Decimal("1000.000000"),
                unit_of_measure="MMBTU",
                trade_currency_code="USD",
                price_unit_code="USD/MMBTU",
                location_code=delivery_location_code,
                location_source="TRADE_DERIVED",
                delivery_start=date(2026, 8, 1),
                delivery_end=date(2026, 8, 31),
                delivery_window_source="TRADE_DERIVED",
                execution_status="SCHEDULED",
                execution_status_source="MANUAL",
                operations_owner="sched.ops",
                operations_owner_source="MANUAL",
                external_reference=None,
                external_reference_source="SYSTEM_GENERATED",
                ops_notes=None,
                ops_notes_source="SYSTEM_GENERATED",
                booked_at=self.now,
                source_trade_updated_at=self.now,
                created_at=self.now,
                created_by="test",
                updated_at=self.now,
                updated_by="test",
                version=1,
            )
        )
        session.add(
            DeliveryPipelineDetail(
                delivery_id=delivery_id,
                pipeline_system="NGPL",
                pipeline_system_source="MANUAL",
                pipeline_path="WAHA_TO_HENRY",
                pipeline_path_source="MANUAL",
                receipt_location_code="WAHA",
                receipt_location_code_source="MANUAL",
                delivery_location_code=delivery_location_code,
                delivery_location_code_source="MANUAL" if delivery_location_code else "SYSTEM_GENERATED",
                contract_number="K-100",
                contract_number_source="MANUAL",
                cycle_code="TIMELY",
                cycle_code_source="MANUAL",
                nomination_reference=nomination_reference,
                nomination_reference_source="MANUAL" if nomination_reference else "SYSTEM_GENERATED",
                created_at=self.now,
                created_by="test",
                updated_at=self.now,
                updated_by="test",
                version=1,
            )
        )

    def test_actualization_ledger_records_schedule_evidence_and_deferred_inventory_boundary(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_trade_with_schedule(session)
            session.commit()

            upsert_trade_actualization(
                session,
                trade_id="T-GAS-ACT",
                actual_quantity=Decimal("975.500000"),
                actualized_at=datetime(2026, 8, 5, 6, 0, tzinfo=timezone.utc),
                source="PIPELINE_EBB",
                notes="Meter statement MS-7788.",
                actor_id="ops.actuals",
                now=self.now,
            )
            session.commit()

            report = build_actualization_ledger_report(
                session,
                trade_id="T-GAS-ACT",
                now=self.now,
            )
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-GAS-ACT",
                    Event.event_type == "TradeActualizationUpserted",
                )
                .one()
            )

        self.assertEqual(report["basis"], ACTUALIZATION_LEDGER_BASIS_V1)
        self.assertEqual(report["inventory_treatment"], INVENTORY_TREATMENT_ACTUALIZATION_ONLY_DEFERRED)
        self.assertEqual(report["summary"]["total_entries"], 1)
        self.assertEqual(report["summary"]["settlement_eligible_entries"], 1)
        self.assertEqual(report["summary"]["inventory_entries_created"], 0)

        entry = report["entries"][0]
        self.assertEqual(entry["actual_quantity"], 975.5)
        self.assertEqual(entry["quantity_unit_code"], "MMBTU")
        self.assertEqual(entry["actual_gas_day"], date(2026, 8, 5))
        self.assertEqual(entry["gas_day_start"], date(2026, 8, 1))
        self.assertEqual(entry["gas_day_end"], date(2026, 8, 31))
        self.assertEqual(entry["location_code"], "HENRY_HUB")
        self.assertEqual(entry["schedule_commitment"]["pipeline_path"], "WAHA_TO_HENRY")
        self.assertEqual(entry["schedule_commitment"]["nomination_reference"], "NOM-4455")
        self.assertEqual(entry["settlement_linkage"]["status"], ACTUALIZATION_SETTLEMENT_ELIGIBLE)
        self.assertTrue(entry["settlement_linkage"]["eligible"])
        self.assertEqual(entry["settlement_linkage"]["settlement_quantity"], 975.5)
        self.assertEqual(entry["settlement_linkage"]["blockers"], [])
        self.assertEqual(entry["inventory"]["inventory_treatment"], INVENTORY_TREATMENT_ACTUALIZATION_ONLY_DEFERRED)
        self.assertFalse(entry["inventory"]["inventory_ledger_entry_created"])

        audit_ledger = audit_event.payload["actualization_ledger"]
        self.assertEqual(audit_ledger["basis"], ACTUALIZATION_LEDGER_BASIS_V1)
        self.assertEqual(audit_ledger["actual_gas_day"], "2026-08-05")
        self.assertEqual(audit_ledger["settlement_linkage"]["status"], ACTUALIZATION_SETTLEMENT_ELIGIBLE)
        self.assertEqual(
            audit_ledger["inventory"]["inventory_treatment"],
            INVENTORY_TREATMENT_ACTUALIZATION_ONLY_DEFERRED,
        )

    def test_actualization_correction_updates_single_ledger_entry_and_audit_snapshot(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_trade_with_schedule(session)
            session.commit()

            upsert_trade_actualization(
                session,
                trade_id="T-GAS-ACT",
                actual_quantity=Decimal("950.000000"),
                actualized_at=datetime(2026, 8, 5, 6, 0, tzinfo=timezone.utc),
                source="PIPELINE_EBB",
                notes="Initial actual.",
                actor_id="ops.actuals",
                now=self.now,
            )
            upsert_trade_actualization(
                session,
                trade_id="T-GAS-ACT",
                actual_quantity=Decimal("985.250000"),
                actualized_at=datetime(2026, 8, 5, 7, 0, tzinfo=timezone.utc),
                source="PIPELINE_EBB",
                notes="Corrected meter statement.",
                actor_id="ops.actuals",
                now=datetime(2026, 8, 5, 13, 0, tzinfo=timezone.utc),
            )
            session.commit()

            report = build_actualization_ledger_report(
                session,
                trade_id="T-GAS-ACT",
                now=self.now,
            )
            actualization_count = (
                session.query(TradeActualization)
                .filter(TradeActualization.trade_id == "T-GAS-ACT")
                .count()
            )
            audit_events = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-GAS-ACT",
                    Event.event_type == "TradeActualizationUpserted",
                )
                .order_by(Event.recorded_at.asc(), Event.event_id.asc())
                .all()
            )

        self.assertEqual(actualization_count, 1)
        self.assertEqual(len(audit_events), 2)
        entry = report["entries"][0]
        self.assertEqual(entry["actual_quantity"], 985.25)
        self.assertEqual(entry["version"], 2)
        self.assertEqual(entry["settlement_linkage"]["settlement_quantity"], 985.25)
        self.assertEqual(audit_events[-1].payload["actualization_ledger"]["actual_quantity"], 985.25)
        self.assertEqual(audit_events[-1].payload["actualization_ledger"]["version"], 2)

    def test_voided_actualization_is_excluded_by_default_and_blocked_when_included(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_trade_with_schedule(session)
            session.commit()

            upsert_trade_actualization(
                session,
                trade_id="T-GAS-ACT",
                actual_quantity=Decimal("975.000000"),
                actualized_at=datetime(2026, 8, 5, 6, 0, tzinfo=timezone.utc),
                source="PIPELINE_EBB",
                notes="Initial actual.",
                actor_id="ops.actuals",
                now=self.now,
            )
            void_trade_actualization(
                session,
                trade_id="T-GAS-ACT",
                actor_id="ops.actuals",
                void_reason="Meter correction superseded this record.",
                now=datetime(2026, 8, 5, 14, 0, tzinfo=timezone.utc),
            )
            session.commit()

            active_report = build_actualization_ledger_report(
                session,
                trade_id="T-GAS-ACT",
                now=self.now,
            )
            full_report = build_actualization_ledger_report(
                session,
                trade_id="T-GAS-ACT",
                include_voided=True,
                now=self.now,
            )
            void_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-GAS-ACT",
                    Event.event_type == "TradeActualizationVoided",
                )
                .one()
            )

        self.assertEqual(active_report["summary"]["total_entries"], 0)
        self.assertEqual(full_report["summary"]["total_entries"], 1)
        entry = full_report["entries"][0]
        self.assertIsNotNone(entry["voided_at"])
        self.assertEqual(entry["settlement_linkage"]["status"], ACTUALIZATION_SETTLEMENT_BLOCKED)
        self.assertFalse(entry["settlement_linkage"]["eligible"])
        self.assertIsNone(entry["settlement_linkage"]["settlement_quantity"])
        blocker_codes = {blocker["code"] for blocker in entry["settlement_linkage"]["blockers"]}
        self.assertIn("VOIDED_ACTUALIZATION", blocker_codes)
        self.assertEqual(
            void_event.payload["actualization_ledger"]["settlement_linkage"]["status"],
            ACTUALIZATION_SETTLEMENT_BLOCKED,
        )

    def test_actualization_without_source_evidence_blocks_settlement_linkage(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_trade_with_schedule(session)
            session.commit()

            upsert_trade_actualization(
                session,
                trade_id="T-GAS-ACT",
                actual_quantity=Decimal("975.000000"),
                actualized_at=datetime(2026, 8, 5, 6, 0, tzinfo=timezone.utc),
                source=None,
                notes="Quantity entered without meter evidence.",
                actor_id="ops.actuals",
                now=self.now,
            )
            session.commit()

            report = build_actualization_ledger_report(
                session,
                trade_id="T-GAS-ACT",
                now=self.now,
            )

        entry = report["entries"][0]
        self.assertEqual(report["summary"]["settlement_blocked_entries"], 1)
        self.assertEqual(entry["settlement_linkage"]["status"], ACTUALIZATION_SETTLEMENT_BLOCKED)
        self.assertFalse(entry["settlement_linkage"]["eligible"])
        blocker_codes = {blocker["code"] for blocker in entry["settlement_linkage"]["blockers"]}
        self.assertEqual(blocker_codes, {"MISSING_SOURCE_EVIDENCE"})
        self.assertEqual(entry["actual_quantity"], 975.0)
        self.assertEqual(entry["location_code"], "HENRY_HUB")
