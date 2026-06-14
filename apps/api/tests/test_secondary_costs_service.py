from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.operations.services.secondary_costs import (
    SECONDARY_COST_CHARGE_PAYABLE,
    SECONDARY_COST_CHARGE_RECEIVABLE,
    SECONDARY_COST_QUANTITY_ACTUAL,
    SECONDARY_COST_QUANTITY_FIXED,
    SECONDARY_COST_SETTLEMENT_BLOCKED,
    SECONDARY_COST_SETTLEMENT_EXCLUDED,
    SECONDARY_COST_SETTLEMENT_INCLUDED,
    SECONDARY_COST_STACK_BASIS_V1,
    SECONDARY_COST_STATUS_ACCRUED,
    SECONDARY_COST_STATUS_ESTIMATED,
    SECONDARY_COST_STATUS_INVOICED,
    SECONDARY_COST_STATUS_RELIEVED,
    SecondaryCostItemInput,
    build_secondary_cost_stack_report,
    transition_secondary_cost_item_status,
    upsert_secondary_cost_item,
)
from apps.api.app.models import Base
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_secondary_cost_item import TradeSecondaryCostItem


class SecondaryCostsServiceTests(unittest.TestCase):
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
            session.query(Event).delete()
            session.query(TradeSecondaryCostItem).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeActualization).delete()
            session.query(DeliveryPipelineDetail).delete()
            session.query(DeliveryObligation).delete()
            session.query(Trade).delete()
            session.commit()

    def _seed_gas_trade(
        self,
        session,
        *,
        trade_id: str = "T-GAS-COST",
        with_actualization: bool = True,
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
                location_code="HENRY_HUB",
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
                location_code="HENRY_HUB",
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
                delivery_location_code="HENRY_HUB",
                delivery_location_code_source="MANUAL",
                contract_number="K-100",
                contract_number_source="MANUAL",
                cycle_code="TIMELY",
                cycle_code_source="MANUAL",
                nomination_reference="NOM-4455",
                nomination_reference_source="MANUAL",
                created_at=self.now,
                created_by="test",
                updated_at=self.now,
                updated_by="test",
                version=1,
            )
        )
        if with_actualization:
            session.add(
                TradeActualization(
                    delivery_id=delivery_id,
                    trade_id=trade_id,
                    leg_no=None,
                    actual_quantity=Decimal("975.500000"),
                    actualized_at=datetime(2026, 8, 5, 6, 0, tzinfo=timezone.utc),
                    source="PIPELINE_EBB",
                    notes="Meter statement MS-7788.",
                    created_at=self.now,
                    created_by="ops.actuals",
                    updated_at=self.now,
                    updated_by="ops.actuals",
                    version=1,
                )
            )

    def _seed_invoice(self, session, *, trade_id: str = "T-GAS-COST") -> TradeInvoice:
        invoice = TradeInvoice(
            trade_id=trade_id,
            delivery_id=f"DLV-{trade_id}",
            leg_no=None,
            invoice_number=f"INV-{trade_id}-COST",
            invoice_currency_code="USD",
            billed_quantity=None,
            quantity_unit_code=None,
            invoice_amount=Decimal("1250.000000"),
            status="ISSUED",
            issued_at=self.now + timedelta(days=1),
            due_at=self.now + timedelta(days=5),
            dispute_reason=None,
            voided_at=None,
            voided_by=None,
            void_reason=None,
            notes="Pipeline tariff invoice.",
            created_at=self.now,
            created_by="settlement.ops",
            updated_at=self.now,
            updated_by="settlement.ops",
            version=1,
        )
        session.add(invoice)
        session.flush()
        return invoice

    def test_accrued_actual_basis_tariff_is_included_with_actualization_evidence(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_trade(session)
            session.commit()

            cost = upsert_secondary_cost_item(
                session,
                trade_id="T-GAS-COST",
                actor_id="ops.costs",
                now=self.now,
                payload=SecondaryCostItemInput(
                    delivery_id="DLV-T-GAS-COST",
                    cost_type="PIPELINE_TARIFF",
                    cost_owner="SHIPPER",
                    charge_side=SECONDARY_COST_CHARGE_PAYABLE,
                    quantity_basis=SECONDARY_COST_QUANTITY_ACTUAL,
                    quantity=Decimal("975.500000"),
                    quantity_unit_code="MMBTU",
                    rate=Decimal("1.281394"),
                    amount=Decimal("1250.000000"),
                    currency_code="USD",
                    status=SECONDARY_COST_STATUS_ACCRUED,
                    source="PIPELINE_TARIFF_STATEMENT",
                    evidence_reference="TAR-443",
                    notes="Tariff accrued from pipeline statement.",
                ),
            )
            session.commit()

            report = build_secondary_cost_stack_report(
                session,
                trade_id="T-GAS-COST",
                now=self.now,
            )
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-GAS-COST",
                    Event.event_type == "TradeSecondaryCostItemCreated",
                )
                .one()
            )

        self.assertEqual(report["basis"], SECONDARY_COST_STACK_BASIS_V1)
        self.assertEqual(report["summary"]["total_items"], 1)
        self.assertEqual(report["summary"]["settlement_included_items"], 1)
        self.assertEqual(report["currency_summaries"][0]["accrued_amount"], -1250.0)
        self.assertEqual(report["currency_summaries"][0]["settlement_preview_amount"], -1250.0)

        entry = report["entries"][0]
        self.assertEqual(entry["cost_item_id"], cost.cost_item_id)
        self.assertEqual(entry["cost_type"], "PIPELINE_TARIFF")
        self.assertEqual(entry["cost_owner"], "SHIPPER")
        self.assertEqual(entry["status"], SECONDARY_COST_STATUS_ACCRUED)
        self.assertEqual(entry["signed_amount"], -1250.0)
        self.assertEqual(entry["actualization_linkage"]["status"], "ELIGIBLE")
        self.assertEqual(entry["actualization_linkage"]["actual_quantity"], 975.5)
        self.assertEqual(entry["settlement_linkage"]["status"], SECONDARY_COST_SETTLEMENT_INCLUDED)
        self.assertEqual(entry["settlement_linkage"]["settlement_amount"], -1250.0)
        self.assertEqual(entry["settlement_linkage"]["blockers"], [])
        self.assertEqual(entry["trade_economics"]["trade_price"], 3.25)
        self.assertEqual(entry["trade_economics"]["trade_volume"], 1000.0)

        audit_cost = audit_event.payload["secondary_cost"]
        self.assertEqual(audit_cost["basis"], SECONDARY_COST_STACK_BASIS_V1)
        self.assertEqual(audit_cost["settlement_linkage"]["status"], SECONDARY_COST_SETTLEMENT_INCLUDED)

    def test_estimated_fixed_receivable_cost_is_included_without_actualization_requirement(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_trade(session, with_actualization=False)
            session.commit()

            upsert_secondary_cost_item(
                session,
                trade_id="T-GAS-COST",
                actor_id="ops.costs",
                now=self.now,
                payload=SecondaryCostItemInput(
                    cost_type="STORAGE_REBATE",
                    cost_owner="DESK",
                    charge_side=SECONDARY_COST_CHARGE_RECEIVABLE,
                    quantity_basis=SECONDARY_COST_QUANTITY_FIXED,
                    amount=Decimal("325.500000"),
                    currency_code="USD",
                    status=SECONDARY_COST_STATUS_ESTIMATED,
                    source="OPS_ESTIMATE",
                    evidence_reference="EST-77",
                    notes="Expected storage rebate.",
                ),
            )
            session.commit()

            report = build_secondary_cost_stack_report(
                session,
                trade_id="T-GAS-COST",
                now=self.now,
            )

        entry = report["entries"][0]
        self.assertEqual(entry["status"], SECONDARY_COST_STATUS_ESTIMATED)
        self.assertFalse(entry["actualization_linkage"]["required"])
        self.assertEqual(entry["lifecycle_amounts"]["estimated_amount"], 325.5)
        self.assertEqual(entry["settlement_linkage"]["status"], SECONDARY_COST_SETTLEMENT_INCLUDED)
        self.assertEqual(entry["settlement_linkage"]["reason"], "ESTIMATED_SECONDARY_COST")
        self.assertEqual(report["currency_summaries"][0]["estimated_amount"], 325.5)

    def test_invoiced_and_relieved_costs_are_excluded_from_settlement_preview(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_trade(session)
            invoice = self._seed_invoice(session)
            session.commit()

            cost = upsert_secondary_cost_item(
                session,
                trade_id="T-GAS-COST",
                actor_id="ops.costs",
                now=self.now,
                payload=SecondaryCostItemInput(
                    delivery_id="DLV-T-GAS-COST",
                    cost_type="PIPELINE_TARIFF",
                    cost_owner="SHIPPER",
                    charge_side=SECONDARY_COST_CHARGE_PAYABLE,
                    quantity_basis=SECONDARY_COST_QUANTITY_ACTUAL,
                    quantity=Decimal("975.500000"),
                    quantity_unit_code="MMBTU",
                    amount=Decimal("1250.000000"),
                    currency_code="USD",
                    status=SECONDARY_COST_STATUS_ACCRUED,
                    source="PIPELINE_TARIFF_STATEMENT",
                    evidence_reference="TAR-443",
                ),
            )
            transition_secondary_cost_item_status(
                session,
                cost_item_id=cost.cost_item_id,
                target_status=SECONDARY_COST_STATUS_INVOICED,
                invoice_id=invoice.id,
                actor_id="settlement.ops",
                now=self.now + timedelta(hours=1),
            )
            session.commit()

            invoiced_report = build_secondary_cost_stack_report(
                session,
                trade_id="T-GAS-COST",
                now=self.now,
            )
            transition_secondary_cost_item_status(
                session,
                cost_item_id=cost.cost_item_id,
                target_status=SECONDARY_COST_STATUS_RELIEVED,
                actor_id="settlement.ops",
                now=self.now + timedelta(hours=2),
            )
            session.commit()
            relieved_report = build_secondary_cost_stack_report(
                session,
                trade_id="T-GAS-COST",
                now=self.now,
            )

        invoiced_entry = invoiced_report["entries"][0]
        self.assertEqual(invoiced_entry["status"], SECONDARY_COST_STATUS_INVOICED)
        self.assertEqual(invoiced_entry["invoice_number"], "INV-T-GAS-COST-COST")
        self.assertEqual(invoiced_entry["settlement_linkage"]["status"], SECONDARY_COST_SETTLEMENT_EXCLUDED)
        self.assertEqual(invoiced_entry["settlement_linkage"]["reason"], "ALREADY_INVOICED")
        self.assertEqual(invoiced_entry["lifecycle_amounts"]["invoiced_amount"], -1250.0)
        self.assertEqual(invoiced_report["summary"]["settlement_excluded_items"], 1)

        relieved_entry = relieved_report["entries"][0]
        self.assertEqual(relieved_entry["status"], SECONDARY_COST_STATUS_RELIEVED)
        self.assertEqual(relieved_entry["settlement_linkage"]["status"], SECONDARY_COST_SETTLEMENT_EXCLUDED)
        self.assertEqual(relieved_entry["settlement_linkage"]["reason"], "RELIEVED_BY_SETTLEMENT")
        self.assertEqual(relieved_entry["lifecycle_amounts"]["relieved_amount"], -1250.0)
        self.assertEqual(relieved_report["currency_summaries"][0]["settlement_preview_amount"], 0.0)

    def test_actual_basis_cost_without_actualization_blocks_settlement_linkage(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_trade(session, with_actualization=False)
            session.commit()

            upsert_secondary_cost_item(
                session,
                trade_id="T-GAS-COST",
                actor_id="ops.costs",
                now=self.now,
                payload=SecondaryCostItemInput(
                    delivery_id="DLV-T-GAS-COST",
                    cost_type="PIPELINE_TARIFF",
                    cost_owner="SHIPPER",
                    charge_side=SECONDARY_COST_CHARGE_PAYABLE,
                    quantity_basis=SECONDARY_COST_QUANTITY_ACTUAL,
                    amount=Decimal("1250.000000"),
                    currency_code="USD",
                    status=SECONDARY_COST_STATUS_ACCRUED,
                    source="PIPELINE_TARIFF_STATEMENT",
                    evidence_reference="TAR-443",
                ),
            )
            session.commit()

            report = build_secondary_cost_stack_report(
                session,
                trade_id="T-GAS-COST",
                now=self.now,
            )

        entry = report["entries"][0]
        self.assertEqual(entry["settlement_linkage"]["status"], SECONDARY_COST_SETTLEMENT_BLOCKED)
        blocker_codes = {blocker["code"] for blocker in entry["settlement_linkage"]["blockers"]}
        self.assertEqual(blocker_codes, {"MISSING_ACTUALIZATION_EVIDENCE"})
        self.assertEqual(report["summary"]["settlement_blocked_items"], 1)

    def test_invoiced_transition_requires_valid_invoice_linkage(self) -> None:
        with self.SessionLocal() as session:
            self._seed_gas_trade(session)
            session.commit()

            cost = upsert_secondary_cost_item(
                session,
                trade_id="T-GAS-COST",
                actor_id="ops.costs",
                now=self.now,
                payload=SecondaryCostItemInput(
                    delivery_id="DLV-T-GAS-COST",
                    cost_type="PIPELINE_TARIFF",
                    cost_owner="SHIPPER",
                    charge_side=SECONDARY_COST_CHARGE_PAYABLE,
                    quantity_basis=SECONDARY_COST_QUANTITY_ACTUAL,
                    amount=Decimal("1250.000000"),
                    currency_code="USD",
                    status=SECONDARY_COST_STATUS_ACCRUED,
                    source="PIPELINE_TARIFF_STATEMENT",
                    evidence_reference="TAR-443",
                ),
            )

            with self.assertRaisesRegex(ValueError, "Invoice id is required"):
                transition_secondary_cost_item_status(
                    session,
                    cost_item_id=cost.cost_item_id,
                    target_status=SECONDARY_COST_STATUS_INVOICED,
                    actor_id="settlement.ops",
                    now=self.now,
                )

            with self.assertRaisesRegex(LookupError, "Invoice '999' was not found"):
                transition_secondary_cost_item_status(
                    session,
                    cost_item_id=cost.cost_item_id,
                    target_status=SECONDARY_COST_STATUS_INVOICED,
                    invoice_id=999,
                    actor_id="settlement.ops",
                    now=self.now,
                )
