from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.documents.services.document_action_approval_requests import (
    list_document_action_approval_requests,
)
from apps.api.app.domains.documents.services.document_action_approval_requests import (
    approve_document_action_approval_request,
)
from apps.api.app.domains.documents.services.document_action_approval_requests import (
    reject_document_action_approval_request,
)
from apps.api.app.domains.documents.services.document_action_approval_requests import (
    stage_document_action_approval_request,
)
from apps.api.app.domains.documents.services.document_candidate_actions import (
    execute_selected_document_record_candidate_attach,
    stage_selected_document_record_candidate_approval_request,
)
from apps.api.app.models import Base
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.document_action_approval_request import DocumentActionApprovalRequest
from apps.api.app.models.document_action_decision import DocumentActionDecision
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_record_link import DocumentRecordLink
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_payment import TradePayment


class DocumentActionApprovalRequestsServiceTests(unittest.TestCase):
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
            session.query(DocumentActionApprovalRequest).delete()
            session.query(DocumentActionDecision).delete()
            session.query(DocumentRecordLink).delete()
            session.query(TradeConfirmation).delete()
            session.query(TradePayment).delete()
            session.query(TradeActualization).delete()
            session.query(DeliveryEvent).delete()
            session.query(DeliveryPipelineDetail).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(Event).delete()
            session.query(TradeInvoice).delete()
            session.query(DeliveryObligation).delete()
            session.query(Trade).delete()
            session.commit()

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
            last_event_id=f"evt-{trade_id}",
        )

    def _seed_verified_document(
        self,
        *,
        document_id: str,
        document_kind: str,
        header_fields: list[dict[str, object]],
        table_blocks: list[dict[str, object]] | None = None,
    ) -> tuple[DocumentIngestion, DocumentIngestionPage]:
        now = datetime(2026, 4, 14, 13, 0, tzinfo=timezone.utc)
        normalized_header_fields = [
            {
                "field_key": str(field["field_key"]),
                "label": str(field.get("label") or str(field["field_key"]).replace("_", " ").title()),
                "value": str(field.get("value") or ""),
                "confidence": field.get("confidence"),
                "source": str(field.get("source") or "review"),
            }
            for field in header_fields
        ]
        document = DocumentIngestion(
            document_id=document_id,
            original_filename=f"{document_id}.pdf",
            display_name=f"Document {document_id}",
            content_type="application/pdf",
            storage_key=f"documents/{document_id}.pdf",
            sha256=f"{document_id.lower():0<64}"[:64],
            size_bytes=1024,
            page_count=1,
            status="ANALYZED",
            processor_provider=None,
            processor_model=None,
            classifier_version="review-v1",
            extractor_version="review-v1",
            analysis_summary={},
            processing_errors=[],
            review_status="VERIFIED",
            review_notes=None,
            reviewed_at=now,
            reviewed_by="tester",
            created_at=now,
            created_by="tester",
            updated_at=now,
            updated_by="tester",
            version=1,
        )
        page = DocumentIngestionPage(
            document_id=document_id,
            page_number=1,
            classification_status="ANALYZED",
            extraction_status="ANALYZED",
            document_kind=document_kind,
            document_subtype=None,
            classification_confidence=0.98,
            classification_payload={},
            header_fields=normalized_header_fields,
            table_blocks=table_blocks or [],
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
        return document, page

    def _seed_confirmation(
        self,
        *,
        trade_id: str,
        confirmation_number: str,
        source_document_id: str | None = None,
    ) -> TradeConfirmation:
        now = datetime(2026, 4, 14, 12, 30, tzinfo=timezone.utc)
        return TradeConfirmation(
            trade_id=trade_id,
            source_document_id=source_document_id,
            confirmation_number=confirmation_number,
            status="SENT",
            sent_at=now,
            confirmed_at=None,
            issue_count=0,
            last_issued_at=None,
            last_issued_by=None,
            last_issue_method=None,
            last_issue_recipient=None,
            last_issue_note=None,
            receipt_status="NOT_ISSUED",
            received_at=None,
            received_by=None,
            response_method=None,
            response_reference=None,
            response_note=None,
            dispute_reason=None,
            notes=None,
            comparison_waiver_note=None,
            comparison_waived_at=None,
            comparison_waived_by=None,
            created_at=now,
            created_by="tester",
            updated_at=now,
            updated_by="tester",
            version=1,
        )

    def _seed_invoice(
        self,
        *,
        trade_id: str,
        invoice_number: str,
        invoice_amount: Decimal = Decimal("99000"),
    ) -> TradeInvoice:
        now = datetime(2026, 4, 14, 12, 45, tzinfo=timezone.utc)
        return TradeInvoice(
            trade_id=trade_id,
            delivery_id=None,
            leg_no=None,
            invoice_number=invoice_number,
            invoice_currency_code="USD",
            billed_quantity=None,
            quantity_unit_code=None,
            invoice_amount=invoice_amount,
            status="ISSUED",
            issued_at=now,
            due_at=datetime(2026, 4, 20, 0, 0, tzinfo=timezone.utc),
            dispute_reason=None,
            notes=None,
            created_at=now,
            created_by="tester",
            updated_at=now,
            updated_by="tester",
            version=1,
        )

    def _seed_payment(
        self,
        *,
        trade_id: str,
        invoice_id: int,
        payment_reference: str,
        payment_amount: Decimal = Decimal("99000"),
    ) -> TradePayment:
        now = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)
        return TradePayment(
            trade_id=trade_id,
            invoice_id=invoice_id,
            payment_reference=payment_reference,
            payment_currency_code="USD",
            payment_amount=payment_amount,
            status="PAID",
            due_at=now,
            received_at=now,
            reversal_of_payment_id=None,
            reversal_reason=None,
            notes=None,
            created_at=now,
            created_by="tester",
            updated_at=now,
            updated_by="tester",
            version=1,
        )

    def _seed_delivery(
        self,
        *,
        trade: Trade,
        delivery_id: str,
        nomination_reference: str,
        leg_no: int | None = 1,
    ) -> tuple[DeliveryObligation, DeliveryPipelineDetail]:
        now = datetime(2026, 4, 14, 12, 50, tzinfo=timezone.utc)
        delivery = DeliveryObligation(
            delivery_id=delivery_id,
            trade_id=trade.trade_id,
            trade_leg_id=None,
            leg_no=leg_no,
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
            nomination_reference=nomination_reference,
            nomination_reference_source="MANUAL",
            created_at=now,
            created_by="tester",
            updated_at=now,
            updated_by="tester",
            version=1,
        )
        return delivery, pipeline_detail

    def test_stage_approval_request_creates_pending_queue_item(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-APR-100")
            document, page = self._seed_verified_document(
                document_id="DOC-APR-100",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-APR-100"},
                    {"field_key": "trade_id", "value": "TRD-APR-100"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            request = stage_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                request_comment="Please confirm before invoice creation.",
            )
            session.commit()

            requests = session.execute(
                select(DocumentActionApprovalRequest).where(
                    DocumentActionApprovalRequest.document_id == document.document_id
                )
            ).scalars().all()
            events = session.execute(
                select(Event).where(
                    Event.aggregate_type == "document",
                    Event.aggregate_id == document.document_id,
                    Event.event_type == "DocumentActionApprovalRequested",
                )
            ).scalars().all()

        self.assertEqual(request.status, "PENDING")
        self.assertEqual(request.action_type, "CREATE_RECORD_FROM_DOCUMENT")
        self.assertEqual(request.operation_type, "issue_trade_invoice")
        self.assertEqual(request.owner_record_type, "TRADE")
        self.assertEqual(request.owner_record_id, "TRD-APR-100")
        self.assertEqual(len(requests), 1)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].payload["request"]["status"], "PENDING")

    def test_stage_approval_request_is_idempotent_while_pending(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-APR-150")
            document, page = self._seed_verified_document(
                document_id="DOC-APR-150",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-APR-150"},
                    {"field_key": "trade_id", "value": "TRD-APR-150"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            first = stage_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                request_comment="Please confirm.",
            )
            second = stage_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                request_comment="Duplicate click.",
            )
            listed = list_document_action_approval_requests(session, status_filter="PENDING")
            first_request_id = first.request_id
            second_request_id = second.request_id
            session.commit()

        self.assertEqual(first_request_id, second_request_id)
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0].request_comment, "Please confirm.")

    def test_execute_selected_candidate_attach_links_high_confidence_invoice(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-SEL-100")
            invoice = TradeInvoice(
                trade_id=trade.trade_id,
                delivery_id=None,
                leg_no=None,
                invoice_number="INV-SEL-100",
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
            document, page = self._seed_verified_document(
                document_id="DOC-SEL-100",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-SEL-100"},
                    {"field_key": "trade_id", "value": "TRD-SEL-100"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            session.add_all([trade, invoice, document, page])
            session.commit()
            session.refresh(invoice)
            invoice_id = str(invoice.id)

            result = execute_selected_document_record_candidate_attach(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_INVOICE",
                record_id=invoice_id,
            )
            session.commit()
            links = session.execute(
                select(DocumentRecordLink).where(DocumentRecordLink.document_id == document.document_id)
            ).scalars().all()

        self.assertEqual(len(links), 1)
        self.assertEqual(links[0].record_type, "TRADE_INVOICE")
        self.assertEqual(links[0].record_id, invoice_id)
        self.assertTrue(any(link.record_label == "Invoice INV-SEL-100" for link in result.record_links))

    def test_execute_selected_candidate_attach_links_high_confidence_delivery(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-SEL-100")
            delivery, pipeline_detail = self._seed_delivery(
                trade=trade,
                delivery_id="DLV-SEL-100",
                nomination_reference="NOM-SEL-100",
            )
            document, page = self._seed_verified_document(
                document_id="DOC-DLV-SEL-100",
                document_kind="PIPELINE_STATEMENT",
                header_fields=[
                    {"field_key": "statement_number", "value": "PIPE-SEL-100"},
                    {"field_key": "trade_id", "value": "TRD-DLV-SEL-100"},
                    {"field_key": "delivery_id", "value": "DLV-SEL-100"},
                    {"field_key": "pipeline_system", "value": "NGPL"},
                    {"field_key": "contract_number", "value": "PIPE-CONTRACT-500"},
                    {"field_key": "nomination_reference", "value": "NOM-SEL-100"},
                    {"field_key": "receipt_location_code", "value": "HOUSTON"},
                    {"field_key": "delivery_location_code", "value": "BEAUMONT"},
                ],
            )
            session.add_all([trade, delivery, pipeline_detail, document, page])
            session.commit()

            result = execute_selected_document_record_candidate_attach(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="DELIVERY",
                record_id=delivery.delivery_id,
            )
            session.commit()
            links = session.execute(
                select(DocumentRecordLink).where(DocumentRecordLink.document_id == document.document_id)
            ).scalars().all()
            linked_records = [(link.record_type, link.record_id) for link in links]

        self.assertEqual(linked_records, [("DELIVERY", "DLV-SEL-100")])
        self.assertTrue(any(link.record_label == "Delivery DLV-SEL-100" for link in result.record_links))

    def test_selected_delivery_create_candidate_approval_materializes_missing_delivery(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-SEL-200")
            document, page = self._seed_verified_document(
                document_id="DOC-DLV-SEL-200",
                document_kind="NOMINATION",
                header_fields=[
                    {"field_key": "nomination_reference", "value": "NOM-SEL-200"},
                    {"field_key": "flow_date", "value": "2026-04-15"},
                    {"field_key": "trade_id", "value": "TRD-DLV-SEL-200"},
                    {"field_key": "contract_number", "value": "PIPE-CONTRACT-200"},
                    {"field_key": "pipeline_system", "value": "NGPL"},
                    {"field_key": "receipt_location_code", "value": "HOUSTON"},
                    {"field_key": "delivery_location_code", "value": "BEAUMONT"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            staged = stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="DELIVERY",
                record_id=None,
                request_comment="Create missing delivery from nomination.",
            )
            self.assertEqual(staged.action_type, "CREATE_RECORD_FROM_DOCUMENT")
            self.assertEqual(staged.operation_type, "create_delivery_from_document")
            self.assertEqual(staged.target_record_type, "DELIVERY")
            self.assertIsNone(staged.target_record_id)
            self.assertEqual(staged.owner_record_type, "TRADE")
            self.assertEqual(staged.owner_record_id, "TRD-DLV-SEL-200")

            executed = approve_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Approved missing delivery creation.",
            )
            executed_status = executed.status
            deliveries = session.execute(
                select(DeliveryObligation).where(DeliveryObligation.trade_id == trade.trade_id)
            ).scalars().all()
            delivery_ids = [delivery.delivery_id for delivery in deliveries]
            links = session.execute(
                select(DocumentRecordLink)
                .where(DocumentRecordLink.document_id == document.document_id)
                .order_by(DocumentRecordLink.record_type.asc())
            ).scalars().all()
            linked_records = {(link.record_type, link.record_id) for link in links}
            session.commit()

        self.assertEqual(executed_status, "EXECUTED")
        self.assertEqual(delivery_ids, ["DLV-TRD-DLV-SEL-200"])
        self.assertEqual(linked_records, {("DELIVERY", "DLV-TRD-DLV-SEL-200"), ("TRADE", "TRD-DLV-SEL-200")})

    def test_selected_delivery_create_candidate_rechecks_missing_record_before_execution(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-SEL-250")
            document, page = self._seed_verified_document(
                document_id="DOC-DLV-SEL-250",
                document_kind="NOMINATION",
                header_fields=[
                    {"field_key": "nomination_reference", "value": "NOM-SEL-250"},
                    {"field_key": "flow_date", "value": "2026-04-15"},
                    {"field_key": "trade_id", "value": "TRD-DLV-SEL-250"},
                    {"field_key": "contract_number", "value": "PIPE-CONTRACT-250"},
                    {"field_key": "pipeline_system", "value": "NGPL"},
                    {"field_key": "receipt_location_code", "value": "HOUSTON"},
                    {"field_key": "delivery_location_code", "value": "BEAUMONT"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="DELIVERY",
                record_id=None,
                request_comment="Create missing delivery from nomination.",
            )
            delivery, pipeline_detail = self._seed_delivery(
                trade=trade,
                delivery_id="DLV-TRD-DLV-SEL-250",
                nomination_reference="NOM-SEL-250",
            )
            session.add_all([delivery, pipeline_detail])
            session.commit()

            with self.assertRaisesRegex(ValueError, "no longer matches a current record candidate"):
                approve_document_action_approval_request(
                    session,
                    document_id=document.document_id,
                    actor_id="approver",
                    decision_comment="Approved missing delivery creation.",
                )

    def test_delivery_confirmation_approval_records_delivery_event_and_links_evidence(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-EVT-300")
            delivery, pipeline_detail = self._seed_delivery(
                trade=trade,
                delivery_id="DLV-TRD-DLV-EVT-300",
                nomination_reference="NOM-EVT-300",
            )
            document, page = self._seed_verified_document(
                document_id="DOC-DLV-EVT-300",
                document_kind="DELIVERY_CONFIRMATION",
                header_fields=[
                    {"field_key": "delivery_confirmation_number", "value": "POD-EVT-300"},
                    {"field_key": "confirmation_date", "value": "2026-04-18"},
                    {"field_key": "trade_id", "value": "TRD-DLV-EVT-300"},
                    {"field_key": "delivery_id", "value": "DLV-TRD-DLV-EVT-300"},
                    {"field_key": "carrier_reference", "value": "CAR-EVT-300"},
                    {"field_key": "destination", "value": "BEAUMONT"},
                ],
            )
            session.add_all([trade, delivery, pipeline_detail, document, page])
            session.commit()

            staged = stage_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                request_comment="Record completed delivery from proof of delivery.",
            )
            self.assertEqual(staged.action_type, "CREATE_RECORD_FROM_DOCUMENT")
            self.assertEqual(staged.operation_type, "record_delivery_event_from_document")
            self.assertEqual(staged.target_record_type, "DELIVERY_EVENT")
            self.assertIsNone(staged.target_record_id)
            self.assertEqual(staged.owner_record_type, "DELIVERY")
            self.assertEqual(staged.owner_record_id, "DLV-TRD-DLV-EVT-300")
            self.assertEqual(staged.action_plan_snapshot["payload"]["event_type"], "DELIVERY_COMPLETED")

            executed = approve_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Approved proof-of-delivery event.",
            )
            executed_status = executed.status
            events = session.execute(
                select(DeliveryEvent).where(DeliveryEvent.delivery_id == delivery.delivery_id)
            ).scalars().all()
            links = session.execute(
                select(DocumentRecordLink)
                .where(DocumentRecordLink.document_id == document.document_id)
                .order_by(DocumentRecordLink.record_type.asc())
            ).scalars().all()
            event_count = len(events)
            event_id = str(events[0].id) if events else None
            event_type = events[0].event_type if events else None
            event_status = events[0].execution_status if events else None
            event_reference = events[0].reference_code if events else None
            event_source = events[0].source if events else None
            linked_records = {(link.record_type, link.record_id) for link in links}
            session.commit()

        self.assertEqual(executed_status, "EXECUTED")
        self.assertEqual(event_count, 1)
        self.assertEqual(event_type, "DELIVERY_COMPLETED")
        self.assertEqual(event_status, "COMPLETED")
        self.assertEqual(event_reference, "POD-EVT-300")
        self.assertEqual(event_source, "DOCUMENT_LIBRARY")
        self.assertIn(("DELIVERY", "DLV-TRD-DLV-EVT-300"), linked_records)
        self.assertIn(("DELIVERY_EVENT", event_id), linked_records)
        self.assertIn(("TRADE", "TRD-DLV-EVT-300"), linked_records)

    def test_delivery_confirmation_approval_records_actualization_and_links_evidence(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-ACT-350")
            delivery, pipeline_detail = self._seed_delivery(
                trade=trade,
                delivery_id="DLV-TRD-DLV-ACT-350",
                nomination_reference="NOM-ACT-350",
                leg_no=None,
            )
            document, page = self._seed_verified_document(
                document_id="DOC-DLV-ACT-350",
                document_kind="DELIVERY_CONFIRMATION",
                header_fields=[
                    {"field_key": "delivery_confirmation_number", "value": "POD-ACT-350"},
                    {"field_key": "confirmation_date", "value": "2026-04-18"},
                    {"field_key": "trade_id", "value": "TRD-DLV-ACT-350"},
                    {"field_key": "delivery_id", "value": "DLV-TRD-DLV-ACT-350"},
                    {"field_key": "carrier_reference", "value": "CAR-ACT-350"},
                    {"field_key": "actual_quantity", "value": "1000"},
                    {"field_key": "unit_of_measure", "value": "BBL"},
                ],
            )
            session.add_all([trade, delivery, pipeline_detail, document, page])
            session.commit()

            staged = stage_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                request_comment="Record actualized delivery quantity from proof of delivery.",
            )
            self.assertEqual(staged.action_type, "CREATE_RECORD_FROM_DOCUMENT")
            self.assertEqual(staged.operation_type, "record_trade_actualization_from_document")
            self.assertEqual(staged.target_record_type, "TRADE_ACTUALIZATION")
            self.assertIsNone(staged.target_record_id)
            self.assertEqual(staged.owner_record_type, "DELIVERY")
            self.assertEqual(staged.owner_record_id, "DLV-TRD-DLV-ACT-350")
            self.assertEqual(staged.action_plan_snapshot["payload"]["actual_quantity"], "1000")

            executed = approve_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Approved actual quantity from POD.",
            )
            actualizations = session.execute(
                select(TradeActualization).where(TradeActualization.trade_id == trade.trade_id)
            ).scalars().all()
            links = session.execute(
                select(DocumentRecordLink)
                .where(DocumentRecordLink.document_id == document.document_id)
                .order_by(DocumentRecordLink.record_type.asc())
            ).scalars().all()
            refreshed_trade = session.get(Trade, trade.trade_id)
            actualization = actualizations[0] if actualizations else None
            linked_records = {(link.record_type, link.record_id) for link in links}
            executed_status = executed.status
            actualization_count = len(actualizations)
            actualization_id = str(actualization.id) if actualization is not None else None
            actualization_delivery_id = actualization.delivery_id if actualization is not None else None
            actualization_quantity = float(actualization.actual_quantity) if actualization is not None else None
            actualization_source = actualization.source if actualization is not None else None
            trade_actualization_status = refreshed_trade.actualization_status if refreshed_trade is not None else None
            session.commit()

        self.assertEqual(executed_status, "EXECUTED")
        self.assertEqual(actualization_count, 1)
        self.assertEqual(actualization_delivery_id, "DLV-TRD-DLV-ACT-350")
        self.assertEqual(actualization_quantity, 1000.0)
        self.assertEqual(actualization_source, "DOCUMENT_LIBRARY")
        self.assertEqual(trade_actualization_status, "ACTUALIZED")
        self.assertIn(("TRADE_ACTUALIZATION", actualization_id), linked_records)
        self.assertIn(("DELIVERY", "DLV-TRD-DLV-ACT-350"), linked_records)
        self.assertIn(("TRADE", "TRD-DLV-ACT-350"), linked_records)

    def test_selected_create_candidate_approval_creates_missing_invoice(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-SEL-200")
            document, page = self._seed_verified_document(
                document_id="DOC-SEL-200",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-SEL-200"},
                    {"field_key": "trade_id", "value": "TRD-SEL-200"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            staged = stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_INVOICE",
                record_id=None,
                request_comment="Create the missing invoice from this document.",
            )
            self.assertEqual(staged.action_type, "CREATE_RECORD_FROM_DOCUMENT")
            self.assertEqual(staged.operation_type, "issue_trade_invoice")
            self.assertEqual(staged.target_record_type, "TRADE_INVOICE")
            self.assertIsNone(staged.target_record_id)
            self.assertEqual(staged.owner_record_type, "TRADE")
            self.assertEqual(staged.owner_record_id, "TRD-SEL-200")
            self.assertEqual(
                staged.action_plan_snapshot["payload"]["selected_candidate"]["existing_record"],
                False,
            )

            executed = approve_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Approved missing invoice creation.",
            )
            executed_status = executed.status
            invoices = session.execute(
                select(TradeInvoice).where(TradeInvoice.trade_id == trade.trade_id)
            ).scalars().all()
            invoice_numbers = [invoice.invoice_number for invoice in invoices]
            links = session.execute(
                select(DocumentRecordLink)
                .where(DocumentRecordLink.document_id == document.document_id)
                .order_by(DocumentRecordLink.record_type.asc())
            ).scalars().all()
            link_record_types = {link.record_type for link in links}
            session.commit()

        self.assertEqual(executed_status, "EXECUTED")
        self.assertEqual(invoice_numbers, ["INV-SEL-200"])
        self.assertEqual(link_record_types, {"TRADE", "TRADE_INVOICE"})

    def test_selected_create_candidate_approval_rechecks_missing_record_before_execution(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-SEL-250")
            document, page = self._seed_verified_document(
                document_id="DOC-SEL-250",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-SEL-250"},
                    {"field_key": "trade_id", "value": "TRD-SEL-250"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_INVOICE",
                record_id=None,
                request_comment="Create the missing invoice from this document.",
            )
            session.add(
                TradeInvoice(
                    trade_id=trade.trade_id,
                    delivery_id=None,
                    leg_no=None,
                    invoice_number="INV-SEL-250",
                    invoice_currency_code="USD",
                    billed_quantity=None,
                    quantity_unit_code=None,
                    invoice_amount=Decimal("99000"),
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
            )
            session.commit()

            with self.assertRaisesRegex(ValueError, "no longer matches a current record candidate"):
                approve_document_action_approval_request(
                    session,
                    document_id=document.document_id,
                    actor_id="approver",
                    decision_comment="Approved missing invoice creation.",
                )

    def test_selected_confirmation_candidate_approval_attaches_existing_confirmation(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-CON-100")
            confirmation = self._seed_confirmation(
                trade_id=trade.trade_id,
                confirmation_number="CONF-SEL-100",
            )
            document, page = self._seed_verified_document(
                document_id="DOC-CON-100",
                document_kind="TRADE_CONFIRMATION",
                header_fields=[
                    {"field_key": "confirmation_number", "value": "CONF-SEL-100"},
                    {"field_key": "trade_id", "value": "TRD-CON-100"},
                ],
            )
            session.add_all([trade, confirmation, document, page])
            session.commit()
            session.refresh(confirmation)
            confirmation_id = str(confirmation.id)

            with self.assertRaisesRegex(ValueError, "requires approval"):
                execute_selected_document_record_candidate_attach(
                    session,
                    document_id=document.document_id,
                    actor_id="reviewer",
                    record_type="TRADE_CONFIRMATION",
                    record_id=confirmation_id,
                )

            staged = stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_CONFIRMATION",
                record_id=confirmation_id,
                request_comment="Attach the selected confirmation.",
            )
            self.assertEqual(staged.action_type, "ATTACH_EXISTING_RECORD")
            self.assertEqual(staged.target_record_type, "TRADE_CONFIRMATION")
            self.assertEqual(staged.target_record_id, confirmation_id)

            approve_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Approved selected confirmation attachment.",
            )
            links = session.execute(
                select(DocumentRecordLink).where(DocumentRecordLink.document_id == document.document_id)
            ).scalars().all()
            linked_records = [(link.record_type, link.record_id) for link in links]
            linked_confirmation = session.get(TradeConfirmation, int(confirmation_id))
            source_document_id = linked_confirmation.source_document_id if linked_confirmation is not None else None
            session.commit()

        self.assertEqual(source_document_id, "DOC-CON-100")
        self.assertEqual(linked_records, [("TRADE_CONFIRMATION", confirmation_id)])

    def test_selected_confirmation_create_candidate_approval_creates_missing_confirmation(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-CON-200")
            document, page = self._seed_verified_document(
                document_id="DOC-CON-200",
                document_kind="TRADE_CONFIRMATION",
                header_fields=[
                    {"field_key": "confirmation_number", "value": "CONF-SEL-200"},
                    {"field_key": "trade_id", "value": "TRD-CON-200"},
                    {"field_key": "trade_date", "value": "2026-04-14"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            staged = stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_CONFIRMATION",
                record_id=None,
                request_comment="Create the missing confirmation from this document.",
            )
            self.assertEqual(staged.action_type, "CREATE_RECORD_FROM_DOCUMENT")
            self.assertEqual(staged.operation_type, "create_trade_confirmation")
            self.assertEqual(staged.target_record_type, "TRADE_CONFIRMATION")
            self.assertIsNone(staged.target_record_id)
            self.assertEqual(staged.owner_record_type, "TRADE")
            self.assertEqual(staged.owner_record_id, "TRD-CON-200")

            executed = approve_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Approved missing confirmation creation.",
            )
            executed_status = executed.status
            confirmations = session.execute(
                select(TradeConfirmation).where(TradeConfirmation.trade_id == trade.trade_id)
            ).scalars().all()
            confirmation_numbers = [confirmation.confirmation_number for confirmation in confirmations]
            source_document_ids = [confirmation.source_document_id for confirmation in confirmations]
            links = session.execute(
                select(DocumentRecordLink)
                .where(DocumentRecordLink.document_id == document.document_id)
                .order_by(DocumentRecordLink.record_type.asc())
            ).scalars().all()
            link_record_types = {link.record_type for link in links}
            session.commit()

        self.assertEqual(executed_status, "EXECUTED")
        self.assertEqual(confirmation_numbers, ["CONF-SEL-200"])
        self.assertEqual(source_document_ids, ["DOC-CON-200"])
        self.assertEqual(link_record_types, {"TRADE", "TRADE_CONFIRMATION"})

    def test_selected_confirmation_create_candidate_rechecks_missing_record_before_execution(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-CON-250")
            document, page = self._seed_verified_document(
                document_id="DOC-CON-250",
                document_kind="TRADE_CONFIRMATION",
                header_fields=[
                    {"field_key": "confirmation_number", "value": "CONF-SEL-250"},
                    {"field_key": "trade_id", "value": "TRD-CON-250"},
                    {"field_key": "trade_date", "value": "2026-04-14"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_CONFIRMATION",
                record_id=None,
                request_comment="Create the missing confirmation from this document.",
            )
            session.add(
                self._seed_confirmation(
                    trade_id=trade.trade_id,
                    confirmation_number="CONF-SEL-250",
                )
            )
            session.commit()

            with self.assertRaisesRegex(ValueError, "no longer matches a current record candidate"):
                approve_document_action_approval_request(
                    session,
                    document_id=document.document_id,
                    actor_id="approver",
                    decision_comment="Approved missing confirmation creation.",
                )

    def test_execute_selected_candidate_attach_links_high_confidence_payment(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-PAY-100")
            invoice = self._seed_invoice(
                trade_id=trade.trade_id,
                invoice_number="INV-PAY-100",
            )
            session.add_all([trade, invoice])
            session.commit()
            session.refresh(invoice)
            payment = self._seed_payment(
                trade_id=trade.trade_id,
                invoice_id=invoice.id,
                payment_reference="PAY-SEL-100",
            )
            document, page = self._seed_verified_document(
                document_id="DOC-PAY-100",
                document_kind="PAYMENT_ADVICE",
                header_fields=[
                    {"field_key": "payment_reference", "value": "PAY-SEL-100"},
                    {"field_key": "invoice_number", "value": "INV-PAY-100"},
                    {"field_key": "advice_date", "value": "2026-04-15"},
                    {"field_key": "amount", "value": "99000"},
                    {"field_key": "currency", "value": "USD"},
                ],
            )
            session.add_all([payment, document, page])
            session.commit()
            session.refresh(payment)
            payment_id = str(payment.id)

            result = execute_selected_document_record_candidate_attach(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_PAYMENT",
                record_id=payment_id,
            )
            session.commit()
            links = session.execute(
                select(DocumentRecordLink).where(DocumentRecordLink.document_id == document.document_id)
            ).scalars().all()
            linked_records = [(link.record_type, link.record_id) for link in links]

        self.assertEqual(linked_records, [("TRADE_PAYMENT", payment_id)])
        self.assertTrue(any(link.record_label == "Payment PAY-SEL-100" for link in result.record_links))

    def test_selected_payment_create_candidate_approval_creates_missing_payment(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-PAY-200")
            invoice = self._seed_invoice(
                trade_id=trade.trade_id,
                invoice_number="INV-PAY-200",
            )
            document, page = self._seed_verified_document(
                document_id="DOC-PAY-200",
                document_kind="PAYMENT_ADVICE",
                header_fields=[
                    {"field_key": "payment_reference", "value": "PAY-SEL-200"},
                    {"field_key": "invoice_number", "value": "INV-PAY-200"},
                    {"field_key": "advice_date", "value": "2026-04-15"},
                    {"field_key": "amount", "value": "99000"},
                    {"field_key": "currency", "value": "USD"},
                ],
            )
            session.add_all([trade, invoice, document, page])
            session.commit()
            session.refresh(invoice)
            invoice_id = str(invoice.id)

            staged = stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_PAYMENT",
                record_id=None,
                request_comment="Create the missing payment from this advice.",
            )
            self.assertEqual(staged.action_type, "CREATE_RECORD_FROM_DOCUMENT")
            self.assertEqual(staged.operation_type, "create_trade_payment")
            self.assertEqual(staged.target_record_type, "TRADE_PAYMENT")
            self.assertIsNone(staged.target_record_id)
            self.assertEqual(staged.owner_record_type, "TRADE_INVOICE")
            self.assertEqual(staged.owner_record_id, invoice_id)
            self.assertEqual(staged.action_plan_snapshot["payload"]["payment_amount"], "99000")
            self.assertEqual(staged.action_plan_snapshot["payload"]["payment_currency_code"], "USD")
            self.assertEqual(staged.action_plan_snapshot["payload"]["received_at"], "2026-04-15")

            executed = approve_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Approved missing payment creation.",
            )
            executed_status = executed.status
            payments = session.execute(
                select(TradePayment).where(TradePayment.invoice_id == invoice.id)
            ).scalars().all()
            payment_summaries = [
                (payment.payment_reference, payment.status, payment.received_at is not None)
                for payment in payments
            ]
            links = session.execute(
                select(DocumentRecordLink)
                .where(DocumentRecordLink.document_id == document.document_id)
                .order_by(DocumentRecordLink.record_type.asc())
            ).scalars().all()
            link_record_types = {link.record_type for link in links}
            session.commit()

        self.assertEqual(executed_status, "EXECUTED")
        self.assertEqual(payment_summaries, [("PAY-SEL-200", "PAID", True)])
        self.assertEqual(link_record_types, {"TRADE_INVOICE", "TRADE_PAYMENT"})

    def test_selected_payment_create_candidate_rechecks_missing_record_before_execution(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-PAY-250")
            invoice = self._seed_invoice(
                trade_id=trade.trade_id,
                invoice_number="INV-PAY-250",
            )
            document, page = self._seed_verified_document(
                document_id="DOC-PAY-250",
                document_kind="PAYMENT_ADVICE",
                header_fields=[
                    {"field_key": "payment_reference", "value": "PAY-SEL-250"},
                    {"field_key": "invoice_number", "value": "INV-PAY-250"},
                    {"field_key": "advice_date", "value": "2026-04-15"},
                    {"field_key": "amount", "value": "99000"},
                    {"field_key": "currency", "value": "USD"},
                ],
            )
            session.add_all([trade, invoice, document, page])
            session.commit()
            session.refresh(invoice)

            stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_PAYMENT",
                record_id=None,
                request_comment="Create the missing payment from this advice.",
            )
            session.add(
                self._seed_payment(
                    trade_id=trade.trade_id,
                    invoice_id=invoice.id,
                    payment_reference="PAY-SEL-250",
                )
            )
            session.commit()

            with self.assertRaisesRegex(ValueError, "no longer matches a current record candidate"):
                approve_document_action_approval_request(
                    session,
                    document_id=document.document_id,
                    actor_id="approver",
                    decision_comment="Approved missing payment creation.",
                )

    def test_selected_low_confidence_candidate_can_be_approved_and_attached(self) -> None:
        invoice_id: str | None = None
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-APR-175")
            invoice = TradeInvoice(
                trade_id=trade.trade_id,
                delivery_id=None,
                leg_no=None,
                invoice_number="INV-APR-175",
                invoice_currency_code="USD",
                billed_quantity=None,
                quantity_unit_code=None,
                invoice_amount=Decimal("99000"),
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
            document, page = self._seed_verified_document(
                document_id="DOC-APR-175",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "trade_id", "value": "TRD-APR-175"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            session.add_all([trade, invoice, document, page])
            session.commit()
            session.refresh(invoice)
            invoice_id = str(invoice.id)

            with self.assertRaisesRegex(ValueError, "requires approval"):
                execute_selected_document_record_candidate_attach(
                    session,
                    document_id=document.document_id,
                    actor_id="reviewer",
                    record_type="TRADE_INVOICE",
                    record_id=invoice_id,
                )

            staged = stage_selected_document_record_candidate_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                record_type="TRADE_INVOICE",
                record_id=invoice_id,
                request_comment="Reviewer selected the matching invoice.",
            )
            self.assertEqual(staged.target_record_type, "TRADE_INVOICE")
            self.assertEqual(staged.target_record_id, invoice_id)
            self.assertIn("selected_candidate", staged.action_plan_snapshot["payload"])

            approve_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Approved selected invoice attachment.",
            )
            links = session.execute(
                select(DocumentRecordLink).where(DocumentRecordLink.document_id == document.document_id)
            ).scalars().all()
            linked_records = [(link.record_type, link.record_id) for link in links]
            session.commit()

        self.assertEqual(linked_records, [("TRADE_INVOICE", invoice_id)])

    def test_approve_request_executes_action_and_marks_request_executed(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-APR-200")
            document, page = self._seed_verified_document(
                document_id="DOC-APR-200",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-APR-200"},
                    {"field_key": "trade_id", "value": "TRD-APR-200"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            staged = stage_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
                request_comment="Stage invoice creation.",
            )
            staged_status = staged.status
            executed = approve_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Approved for execution.",
            )
            executed_status = executed.status
            executed_comment = executed.decision_comment
            executed_decision_id = executed.execution_decision_id
            session.commit()

            invoices = session.execute(
                select(TradeInvoice).where(TradeInvoice.trade_id == trade.trade_id)
            ).scalars().all()
            links = session.execute(
                select(DocumentRecordLink)
                .where(DocumentRecordLink.document_id == document.document_id)
                .order_by(DocumentRecordLink.record_type.asc())
            ).scalars().all()
            decisions = session.execute(
                select(DocumentActionDecision).where(DocumentActionDecision.document_id == document.document_id)
            ).scalars().all()
            approval_events = session.execute(
                select(Event).where(
                    Event.aggregate_type == "document",
                    Event.aggregate_id == document.document_id,
                    Event.event_type == "DocumentActionApprovalExecuted",
                )
            ).scalars().all()

        self.assertEqual(staged_status, "PENDING")
        self.assertEqual(executed_status, "EXECUTED")
        self.assertEqual(executed_comment, "Approved for execution.")
        self.assertIsNotNone(executed_decision_id)
        self.assertEqual(len(invoices), 1)
        self.assertEqual(invoices[0].invoice_number, "INV-APR-200")
        self.assertEqual({link.record_type for link in links}, {"TRADE", "TRADE_INVOICE"})
        self.assertEqual(len(decisions), 1)
        self.assertEqual(decisions[0].decision_comment, "Approved for execution.")
        self.assertEqual(len(approval_events), 1)
        self.assertEqual(approval_events[0].payload["request"]["status"], "EXECUTED")

    def test_reject_request_marks_queue_item_rejected_without_execution(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-APR-300")
            document, page = self._seed_verified_document(
                document_id="DOC-APR-300",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-APR-300"},
                    {"field_key": "trade_id", "value": "TRD-APR-300"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            stage_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="reviewer",
            )
            rejected = reject_document_action_approval_request(
                session,
                document_id=document.document_id,
                actor_id="approver",
                decision_comment="Duplicate of an existing invoice request.",
            )
            rejected_status = rejected.status
            rejected_comment = rejected.decision_comment
            session.commit()

            invoices = session.execute(
                select(TradeInvoice).where(TradeInvoice.trade_id == trade.trade_id)
            ).scalars().all()
            decisions = session.execute(
                select(DocumentActionDecision).where(DocumentActionDecision.document_id == document.document_id)
            ).scalars().all()
            approval_events = session.execute(
                select(Event).where(
                    Event.aggregate_type == "document",
                    Event.aggregate_id == document.document_id,
                    Event.event_type == "DocumentActionApprovalRejected",
                )
            ).scalars().all()

        self.assertEqual(rejected_status, "REJECTED")
        self.assertEqual(rejected_comment, "Duplicate of an existing invoice request.")
        self.assertEqual(invoices, [])
        self.assertEqual(decisions, [])
        self.assertEqual(len(approval_events), 1)
        self.assertEqual(approval_events[0].payload["request"]["status"], "REJECTED")


if __name__ == "__main__":
    unittest.main()
