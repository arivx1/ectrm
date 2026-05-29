from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.documents.services.document_action_planning import build_document_action_plan
from apps.api.app.domains.documents.services.document_linkage import build_document_linkage_assessment
from apps.api.app.models import Base
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment


class DocumentActionPlanningServiceTests(unittest.TestCase):
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
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeConfirmation).delete()
            session.query(TradeActualization).delete()
            session.query(DeliveryEvent).delete()
            session.query(DeliveryPipelineDetail).delete()
            session.query(DeliveryObligation).delete()
            session.query(Trade).delete()
            session.commit()

    def _reviewed_page(self, *, document_kind: str, header_fields: list[dict[str, object]]) -> DocumentIngestionPage:
        now = datetime.now(timezone.utc)
        return DocumentIngestionPage(
            document_id="DOC-200",
            page_number=1,
            classification_status="ANALYZED",
            extraction_status="ANALYZED",
            document_kind=document_kind,
            document_subtype=None,
            classification_confidence=0.95,
            classification_payload={},
            header_fields=header_fields,
            table_blocks=[],
            raw_text=None,
            processing_warnings=[],
            processing_errors=[],
            review_status="REVIEWED",
            review_notes=None,
            reviewed_at=now,
            reviewed_by="tester",
            processed_at=now,
            created_at=now,
            updated_at=now,
        )

    def _seed_trade(self, *, trade_id: str, counterparty: str = "Shell Trading") -> Trade:
        now = datetime(2026, 4, 14, 12, 0, tzinfo=timezone.utc)
        return Trade(
            trade_id=trade_id,
            originating_option_trade_id=None,
            external_trade_id=None,
            source_system="ICE",
            created_at=now,
            updated_at=now,
            execution_timestamp=now,
            trade_date=date(2026, 4, 14),
            effective_start_date=date(2026, 4, 15),
            effective_end_date=date(2026, 4, 30),
            quality_spec="ULSD 10 PPM",
            unit_of_measure="BBL",
            trade_currency_code="USD",
            location_code="HOUSTON",
            delivery_start=date(2026, 4, 15),
            delivery_end=date(2026, 4, 30),
            price_unit_code="USD/BBL",
            instrument_type="LINEAR",
            option_type=None,
            option_style=None,
            option_strike_price=None,
            option_expiration_date=None,
            trade_nature="PHYSICAL",
            trade_structure="SINGLE",
            trade_side="BUY",
            book="GULF_PRODUCTS",
            portfolio="DISTILLATES",
            counterparty=counterparty,
            commodity_class="REFINED_PRODUCTS",
            commodity="ULSD",
            pricing_type="FIXED",
            pricing_status="PRICED",
            confirmation_status="PENDING",
            nomination_status="PENDING",
            allocation_status="PENDING",
            actualization_status="PENDING",
            price_index_code=None,
            price=Decimal("2.750000"),
            volume=Decimal("1000.000000"),
            invoice_status="PENDING",
            payment_status="PENDING",
            settlement_status="PENDING",
            trader_user="trader@example.com",
            status="ACTIVE",
            last_event_id="evt-200",
        )

    def _seed_delivery(self, *, trade: Trade, delivery_id: str) -> tuple[DeliveryObligation, DeliveryPipelineDetail]:
        now = datetime(2026, 4, 14, 12, 50, tzinfo=timezone.utc)
        delivery = DeliveryObligation(
            delivery_id=delivery_id,
            trade_id=trade.trade_id,
            trade_leg_id=None,
            leg_no=1,
            external_trade_id=trade.external_trade_id,
            direction="OUTBOUND",
            mode_family="NETWORK_FLOW",
            transport_mode="PIPELINE",
            transport_mode_source="EXPLICIT",
            delivery_profile="FLOW_WINDOW",
            book=trade.book,
            book_source="TRADE_DERIVED",
            portfolio=trade.portfolio,
            portfolio_source="TRADE_DERIVED",
            counterparty=trade.counterparty,
            counterparty_source="TRADE_DERIVED",
            commodity_class=trade.commodity_class,
            commodity=trade.commodity,
            volume=trade.volume,
            unit_of_measure=trade.unit_of_measure,
            trade_currency_code=trade.trade_currency_code,
            price_unit_code=trade.price_unit_code,
            location_code=trade.location_code,
            location_source="TRADE_DERIVED",
            delivery_start=trade.delivery_start,
            delivery_end=trade.delivery_end,
            delivery_window_source="TRADE_DERIVED",
            execution_status="SCHEDULED",
            execution_status_source="SYSTEM_GENERATED",
            operations_owner=None,
            operations_owner_source="SYSTEM_GENERATED",
            external_reference=None,
            external_reference_source="SYSTEM_GENERATED",
            ops_notes=None,
            ops_notes_source="SYSTEM_GENERATED",
            booked_at=now,
            source_trade_updated_at=trade.updated_at,
            created_at=now,
            created_by="tester",
            updated_at=now,
            updated_by="tester",
            version=1,
        )
        pipeline_detail = DeliveryPipelineDetail(
            delivery_id=delivery.delivery_id,
            pipeline_system="NGPL",
            pipeline_system_source="MANUAL",
            pipeline_path=None,
            pipeline_path_source="SYSTEM_GENERATED",
            receipt_location_code="HOUSTON",
            receipt_location_code_source="MANUAL",
            delivery_location_code="BEAUMONT",
            delivery_location_code_source="MANUAL",
            contract_number="PIPE-CONTRACT-500",
            contract_number_source="MANUAL",
            cycle_code=None,
            cycle_code_source="SYSTEM_GENERATED",
            nomination_reference="NOM-ACT-600",
            nomination_reference_source="MANUAL",
            created_at=now,
            created_by="tester",
            updated_at=now,
            updated_by="tester",
            version=1,
        )
        return delivery, pipeline_detail

    def test_existing_invoice_plans_attach_existing_record(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-ACT-100")
            invoice = TradeInvoice(
                trade_id=trade.trade_id,
                delivery_id=None,
                leg_no=None,
                invoice_number="INV-ACT-100",
                invoice_currency_code="USD",
                billed_quantity=None,
                quantity_unit_code=None,
                invoice_amount=Decimal("125000"),
                status="ISSUED",
                issued_at=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
                due_at=datetime(2026, 4, 20, 0, 0, tzinfo=timezone.utc),
                dispute_reason=None,
                notes=None,
                created_at=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
                created_by="tester",
                updated_at=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
                updated_by="tester",
                version=1,
            )
            session.add_all([trade, invoice])
            session.commit()
            session.refresh(invoice)

            page = self._reviewed_page(
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-ACT-100"},
                    {"field_key": "trade_id", "value": "TRD-ACT-100"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )

        self.assertEqual(plan.status, "READY")
        self.assertEqual(plan.action_type, "ATTACH_EXISTING_RECORD")
        self.assertEqual(plan.candidate_state, "ATTACH_READY")
        self.assertEqual(plan.target.record_type, "TRADE_INVOICE")
        self.assertEqual(plan.target.record_id, str(invoice.id))
        self.assertEqual(plan.operation_type, "link_document_to_record")

    def test_missing_invoice_plans_create_under_trade_owner(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-ACT-200")
            session.add(trade)
            session.commit()

            page = self._reviewed_page(
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-ACT-200"},
                    {"field_key": "trade_id", "value": "TRD-ACT-200"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )

        self.assertEqual(plan.status, "READY")
        self.assertEqual(plan.action_type, "CREATE_RECORD_FROM_DOCUMENT")
        self.assertEqual(plan.candidate_state, "CREATE_CANDIDATE")
        self.assertEqual(plan.operation_type, "issue_trade_invoice")
        self.assertEqual(plan.target.record_type, "TRADE_INVOICE")
        self.assertFalse(plan.target.existing_record)
        self.assertEqual(plan.owner.record_type, "TRADE")
        self.assertEqual(plan.required_owner_record_types, ["TRADE"])
        self.assertEqual(plan.owner.record_id, "TRD-ACT-200")
        self.assertEqual(plan.payload["trade_id"], "TRD-ACT-200")
        self.assertEqual(plan.payload["invoice_number"], "INV-ACT-200")
        self.assertEqual(plan.payload["invoice_date"], "2026-04-14")
        self.assertEqual(plan.payload["invoice_amount"], "99000")

    def test_trade_confirmation_plans_create_confirmation_under_trade(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-CON-300")
            session.add(trade)
            session.commit()

            page = self._reviewed_page(
                document_kind="TRADE_CONFIRMATION",
                header_fields=[
                    {"field_key": "confirmation_number", "value": "CONF-300"},
                    {"field_key": "trade_id", "value": "TRD-CON-300"},
                    {"field_key": "trade_date", "value": "2026-04-14"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )

        self.assertEqual(plan.status, "READY")
        self.assertEqual(plan.action_type, "CREATE_RECORD_FROM_DOCUMENT")
        self.assertEqual(plan.candidate_state, "CREATE_CANDIDATE")
        self.assertEqual(plan.operation_type, "create_trade_confirmation")
        self.assertEqual(plan.target.record_type, "TRADE_CONFIRMATION")
        self.assertEqual(plan.owner.record_type, "TRADE")
        self.assertEqual(plan.payload["source_document_id"], "DOC-200")
        self.assertEqual(plan.payload["confirmation_number"], "CONF-300")
        self.assertEqual(plan.payload["trade_date"], "2026-04-14")

    def test_create_plan_blocks_without_required_owner_anchor(self) -> None:
        with self.SessionLocal() as session:
            page = self._reviewed_page(
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-BLOCK-400"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )

        self.assertEqual(plan.status, "BLOCKED")
        self.assertEqual(plan.action_type, "MANUAL_REVIEW")
        self.assertEqual(plan.candidate_state, "OWNER_REQUIRED")
        self.assertEqual(plan.target.record_type, "TRADE_INVOICE")
        self.assertEqual(plan.required_owner_record_types, ["TRADE"])
        self.assertIn("owner:TRADE", plan.missing_evidence)

    def test_missing_delivery_plans_create_under_trade_owner(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-ACT-500")
            session.add(trade)
            session.commit()

            page = self._reviewed_page(
                document_kind="NOMINATION",
                header_fields=[
                    {"field_key": "nomination_reference", "value": "NOM-ACT-500"},
                    {"field_key": "flow_date", "value": "2026-04-15"},
                    {"field_key": "trade_id", "value": "TRD-DLV-ACT-500"},
                    {"field_key": "contract_number", "value": "PIPE-CONTRACT-500"},
                    {"field_key": "pipeline_system", "value": "NGPL"},
                    {"field_key": "receipt_location_code", "value": "HOUSTON"},
                    {"field_key": "delivery_location_code", "value": "BEAUMONT"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )

        self.assertEqual(plan.status, "READY")
        self.assertEqual(plan.action_type, "CREATE_RECORD_FROM_DOCUMENT")
        self.assertEqual(plan.operation_type, "create_delivery_from_document")
        self.assertEqual(plan.candidate_state, "CREATE_CANDIDATE")
        self.assertEqual(plan.target.record_type, "DELIVERY")
        self.assertEqual(plan.owner.record_type, "TRADE")
        self.assertEqual(plan.owner.record_id, "TRD-DLV-ACT-500")
        self.assertEqual(plan.required_owner_record_types, ["TRADE"])
        self.assertEqual(plan.payload["trade_id"], "TRD-DLV-ACT-500")
        self.assertEqual(plan.payload["nomination_reference"], "NOM-ACT-500")

    def test_existing_nomination_delivery_plans_schedule_update(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-SCH-550")
            delivery, pipeline_detail = self._seed_delivery(trade=trade, delivery_id="DLV-SCH-550")
            session.add_all([trade, delivery, pipeline_detail])
            session.commit()

            page = self._reviewed_page(
                document_kind="NOMINATION",
                header_fields=[
                    {"field_key": "nomination_reference", "value": "NOM-SCH-550"},
                    {"field_key": "flow_date", "value": "2026-04-15"},
                    {"field_key": "trade_id", "value": "TRD-DLV-SCH-550"},
                    {"field_key": "delivery_id", "value": "DLV-SCH-550"},
                    {"field_key": "contract_number", "value": "PIPE-CONTRACT-550"},
                    {"field_key": "pipeline_system", "value": "NGPL"},
                    {"field_key": "receipt_location_code", "value": "HOUSTON"},
                    {"field_key": "delivery_location_code", "value": "BEAUMONT"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )

        self.assertEqual(plan.status, "READY")
        self.assertEqual(plan.action_type, "UPDATE_RECORD_FROM_DOCUMENT")
        self.assertEqual(plan.operation_type, "update_delivery_schedule_from_document")
        self.assertEqual(plan.candidate_state, "UPDATE_CANDIDATE")
        self.assertEqual(plan.target.record_type, "DELIVERY")
        self.assertEqual(plan.target.record_id, "DLV-SCH-550")
        self.assertEqual(plan.payload["delivery_id"], "DLV-SCH-550")
        self.assertEqual(
            plan.payload["pipeline_detail_changes"],
            {
                "pipeline_system": "NGPL",
                "pipeline_contract_number": "PIPE-CONTRACT-550",
                "receipt_location_code": "HOUSTON",
                "delivery_location_code": "BEAUMONT",
                "nomination_reference": "NOM-SCH-550",
            },
        )

    def test_delivery_confirmation_plans_delivery_event_under_existing_delivery(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-EVT-600")
            delivery, pipeline_detail = self._seed_delivery(trade=trade, delivery_id="DLV-EVT-600")
            session.add_all([trade, delivery, pipeline_detail])
            session.commit()

            page = self._reviewed_page(
                document_kind="DELIVERY_CONFIRMATION",
                header_fields=[
                    {"field_key": "delivery_confirmation_number", "value": "POD-ACT-600"},
                    {"field_key": "confirmation_date", "value": "2026-04-18"},
                    {"field_key": "trade_id", "value": "TRD-DLV-EVT-600"},
                    {"field_key": "delivery_id", "value": "DLV-EVT-600"},
                    {"field_key": "carrier_reference", "value": "CAR-ACT-600"},
                    {"field_key": "destination", "value": "BEAUMONT"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )

        self.assertEqual(plan.status, "READY")
        self.assertEqual(plan.action_type, "CREATE_RECORD_FROM_DOCUMENT")
        self.assertEqual(plan.operation_type, "record_delivery_event_from_document")
        self.assertEqual(plan.candidate_state, "CREATE_CANDIDATE")
        self.assertEqual(plan.target.record_type, "DELIVERY_EVENT")
        self.assertFalse(plan.target.existing_record)
        self.assertEqual(plan.owner.record_type, "DELIVERY")
        self.assertEqual(plan.owner.record_id, "DLV-EVT-600")
        self.assertEqual(plan.required_owner_record_types, ["DELIVERY"])
        self.assertEqual(plan.payload["delivery_id"], "DLV-EVT-600")
        self.assertEqual(plan.payload["event_type"], "DELIVERY_COMPLETED")
        self.assertEqual(plan.payload["occurred_at"], "2026-04-18")
        self.assertEqual(plan.payload["reference_code"], "POD-ACT-600")

    def test_delivery_confirmation_with_quantity_plans_actualization_under_existing_delivery(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-ACT-625")
            delivery, pipeline_detail = self._seed_delivery(trade=trade, delivery_id="DLV-TRD-DLV-ACT-625")
            session.add_all([trade, delivery, pipeline_detail])
            session.commit()

            page = self._reviewed_page(
                document_kind="DELIVERY_CONFIRMATION",
                header_fields=[
                    {"field_key": "delivery_confirmation_number", "value": "POD-ACT-625"},
                    {"field_key": "confirmation_date", "value": "2026-04-18"},
                    {"field_key": "trade_id", "value": "TRD-DLV-ACT-625"},
                    {"field_key": "delivery_id", "value": "DLV-TRD-DLV-ACT-625"},
                    {"field_key": "carrier_reference", "value": "CAR-ACT-625"},
                    {"field_key": "actual_quantity", "value": "1,000 BBL"},
                    {"field_key": "unit_of_measure", "value": "BBL"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )

        self.assertEqual(plan.status, "READY")
        self.assertEqual(plan.action_type, "CREATE_RECORD_FROM_DOCUMENT")
        self.assertEqual(plan.operation_type, "record_trade_actualization_from_document")
        self.assertEqual(plan.target.record_type, "TRADE_ACTUALIZATION")
        self.assertFalse(plan.target.existing_record)
        self.assertEqual(plan.owner.record_type, "DELIVERY")
        self.assertEqual(plan.owner.record_id, "DLV-TRD-DLV-ACT-625")
        self.assertEqual(plan.required_owner_record_types, ["DELIVERY"])
        self.assertEqual(plan.payload["delivery_id"], "DLV-TRD-DLV-ACT-625")
        self.assertEqual(plan.payload["actual_quantity"], "1000")
        self.assertEqual(plan.payload["actualized_at"], "2026-04-18")
        self.assertEqual(plan.payload["quantity_basis"], "actual_quantity")
        self.assertEqual(plan.payload["reference_code"], "POD-ACT-625")

    def test_delivery_confirmation_without_delivery_plans_delivery_creation_first(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-EVT-650")
            session.add(trade)
            session.commit()

            page = self._reviewed_page(
                document_kind="DELIVERY_CONFIRMATION",
                header_fields=[
                    {"field_key": "delivery_confirmation_number", "value": "POD-ACT-650"},
                    {"field_key": "confirmation_date", "value": "2026-04-18"},
                    {"field_key": "trade_id", "value": "TRD-DLV-EVT-650"},
                    {"field_key": "carrier_reference", "value": "CAR-ACT-650"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )

        self.assertEqual(plan.status, "READY")
        self.assertEqual(plan.action_type, "CREATE_RECORD_FROM_DOCUMENT")
        self.assertEqual(plan.operation_type, "create_delivery_from_document")
        self.assertEqual(plan.target.record_type, "DELIVERY")
        self.assertEqual(plan.owner.record_type, "TRADE")
        self.assertEqual(plan.owner.record_id, "TRD-DLV-EVT-650")


if __name__ == "__main__":
    unittest.main()
