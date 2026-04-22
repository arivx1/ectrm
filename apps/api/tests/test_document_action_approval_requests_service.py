from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.documents.services.document_action_approval_requests import (
    approve_document_action_approval_request,
)
from apps.api.app.domains.documents.services.document_action_approval_requests import (
    reject_document_action_approval_request,
)
from apps.api.app.domains.documents.services.document_action_approval_requests import (
    stage_document_action_approval_request,
)
from apps.api.app.models import Base
from apps.api.app.models.document_action_approval_request import DocumentActionApprovalRequest
from apps.api.app.models.document_action_decision import DocumentActionDecision
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_record_link import DocumentRecordLink
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_leg import TradeLeg


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
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(Event).delete()
            session.query(TradeInvoice).delete()
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
        return document, page

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
