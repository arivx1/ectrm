from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.documents.services.document_record_creation_requests import (
    DocumentRecordCreationRequestPersistenceUnavailable,
    cancel_document_record_creation_request,
    list_document_record_creation_requests,
    resolve_document_record_creation_request,
    stage_document_record_creation_request,
)
from apps.api.app.domains.documents.services.document_workflows import list_document_workflows
from apps.api.app.models import Base
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_record_creation_request import DocumentRecordCreationRequest
from apps.api.app.models.document_record_link import DocumentRecordLink
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade


class DocumentRecordCreationRequestsServiceTests(unittest.TestCase):
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
            session.query(DocumentRecordCreationRequest).delete()
            session.query(DocumentRecordLink).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(Event).delete()
            session.query(Trade).delete()
            session.commit()

    def _seed_verified_document(
        self,
        session,
        *,
        document_id: str,
        document_kind: str,
        review_status: str = "VERIFIED",
        page_review_status: str = "REVIEWED",
        header_fields: list[dict[str, object]],
    ) -> DocumentIngestion:
        now = datetime(2026, 5, 29, 10, 0, tzinfo=timezone.utc)
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
            review_status=review_status,
            review_notes=None,
            reviewed_at=now if review_status == "VERIFIED" else None,
            reviewed_by="tester" if review_status == "VERIFIED" else None,
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
            classification_confidence=0.99,
            classification_payload={},
            header_fields=header_fields,
            table_blocks=[],
            raw_text=None,
            processing_warnings=[],
            processing_errors=[],
            review_status=page_review_status,
            review_notes=None,
            reviewed_at=now if page_review_status == "REVIEWED" else None,
            reviewed_by="tester" if page_review_status == "REVIEWED" else None,
            processed_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add_all([document, page])
        return document

    def _seed_trade(self, session, *, trade_id: str) -> Trade:
        now = datetime(2026, 5, 28, 12, 0, tzinfo=timezone.utc)
        trade = Trade(
            trade_id=trade_id,
            originating_option_trade_id=None,
            external_trade_id=None,
            source_system="ICE",
            created_at=now,
            updated_at=now,
            execution_timestamp=now,
            trade_date=date(2026, 5, 28),
            effective_start_date=date(2026, 5, 29),
            effective_end_date=date(2026, 5, 30),
            quality_spec="ULSD 10 PPM",
            unit_of_measure="BBL",
            trade_currency_code="USD",
            location_code="HOUSTON",
            delivery_start=date(2026, 5, 29),
            delivery_end=date(2026, 5, 30),
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
            counterparty="Shell Trading",
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
            last_event_id="evt-record-creation-test",
        )
        session.add(trade)
        return trade

    def test_stages_missing_owner_invoice_creation_request_and_dedupes_open_request(self) -> None:
        with self.SessionLocal() as session:
            document = self._seed_verified_document(
                session,
                document_id="DOC-RCR-INVOICE-1",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-RCR-1"},
                    {"field_key": "invoice_date", "value": "2026-05-29"},
                    {"field_key": "due_date", "value": "2026-06-05"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            session.commit()

            request = stage_document_record_creation_request(
                session,
                document_id=document.document_id,
                actor_id="ops@example.com",
                request_comment="No matching trade anchor exists yet.",
            )
            duplicate = stage_document_record_creation_request(
                session,
                document_id=document.document_id,
                actor_id="ops@example.com",
            )
            session.commit()

            requests = session.execute(select(DocumentRecordCreationRequest)).scalars().all()
            events = session.execute(select(Event).where(Event.event_type == "DocumentRecordCreationRequested")).scalars().all()
            listed_requests = list_document_record_creation_requests(session)

        self.assertEqual(request.request_id, duplicate.request_id)
        self.assertEqual(len(requests), 1)
        self.assertEqual(len(events), 1)
        self.assertEqual(request.target_record_type, "TRADE_INVOICE")
        self.assertEqual(request.status, "OPEN")
        self.assertEqual(request.required_owner_record_types, ["TRADE"])
        self.assertIn("owner:TRADE", request.missing_evidence)
        self.assertEqual(request.captured_fields["invoice_number"], "INV-RCR-1")
        self.assertEqual(request.request_comment, "No matching trade anchor exists yet.")
        self.assertEqual([item.request_id for item in listed_requests], [request.request_id])

    def test_stages_trade_creation_request_when_document_implies_trade_without_typed_service(self) -> None:
        with self.SessionLocal() as session:
            document = self._seed_verified_document(
                session,
                document_id="DOC-RCR-PO-1",
                document_kind="PURCHASE_ORDER",
                header_fields=[
                    {"field_key": "purchase_order_number", "value": "PO-RCR-1"},
                    {"field_key": "buyer", "value": "Metro Fuels"},
                    {"field_key": "seller", "value": "Shell Trading"},
                    {"field_key": "commodity", "value": "ULSD"},
                    {"field_key": "quantity", "value": "1000 BBL"},
                ],
            )
            session.commit()

            request = stage_document_record_creation_request(
                session,
                document_id=document.document_id,
                actor_id="ops@example.com",
            )
            workflows = list_document_workflows(session, document_id=document.document_id)

        self.assertEqual(request.target_record_type, "TRADE")
        self.assertEqual(request.target_record_label, "Trade")
        self.assertIn("typed_creation_service", request.missing_evidence)
        self.assertEqual(request.captured_fields["purchase_order_number"], "PO-RCR-1")
        self.assertEqual([item.request_id for item in workflows.record_creation_requests], [request.request_id])
        self.assertIn("request_missing_record_creation", [workflow.workflow_id for workflow in workflows.workflows])
        intake_workflow = next(
            workflow
            for workflow in workflows.workflows
            if workflow.workflow_id == "request_missing_record_creation"
        )
        self.assertEqual(intake_workflow.status, "EXECUTED")
        self.assertIn("already open", intake_workflow.disabled_reason)

    def test_does_not_stage_intake_when_create_action_is_ready_for_approval(self) -> None:
        with self.SessionLocal() as session:
            self._seed_trade(session, trade_id="TRD-RCR-READY")
            document = self._seed_verified_document(
                session,
                document_id="DOC-RCR-INVOICE-READY",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-RCR-READY"},
                    {"field_key": "trade_id", "value": "TRD-RCR-READY"},
                    {"field_key": "invoice_date", "value": "2026-05-29"},
                    {"field_key": "due_date", "value": "2026-06-05"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            session.commit()

            with self.assertRaisesRegex(ValueError, "does not identify a missing record"):
                stage_document_record_creation_request(
                    session,
                    document_id=document.document_id,
                    actor_id="ops@example.com",
                )

    def test_resolves_open_request_by_linking_created_record(self) -> None:
        with self.SessionLocal() as session:
            document = self._seed_verified_document(
                session,
                document_id="DOC-RCR-RESOLVE-1",
                document_kind="PURCHASE_ORDER",
                header_fields=[
                    {"field_key": "purchase_order_number", "value": "PO-RCR-RESOLVE"},
                    {"field_key": "buyer", "value": "Metro Fuels"},
                    {"field_key": "seller", "value": "Shell Trading"},
                    {"field_key": "commodity", "value": "ULSD"},
                    {"field_key": "quantity", "value": "1000 BBL"},
                ],
            )
            session.commit()

            request = stage_document_record_creation_request(
                session,
                document_id=document.document_id,
                actor_id="ops@example.com",
            )
            self._seed_trade(session, trade_id="TRD-RCR-RESOLVED")
            session.commit()

            resolved = resolve_document_record_creation_request(
                session,
                document_id=document.document_id,
                request_id=request.request_id,
                actor_id="ops@example.com",
                record_type="TRADE",
                record_id="TRD-RCR-RESOLVED",
                resolution_comment="Trade was created from the PO queue.",
            )
            session.commit()

            links = session.execute(select(DocumentRecordLink)).scalars().all()
            events = (
                session.execute(
                    select(Event).where(Event.event_type == "DocumentRecordCreationResolved")
                )
                .scalars()
                .all()
            )
            open_requests = list_document_record_creation_requests(session, status_filter="OPEN")
            resolved_requests = list_document_record_creation_requests(session, status_filter="RESOLVED")

        self.assertEqual(resolved.status, "RESOLVED")
        self.assertEqual(resolved.resolved_record_type, "TRADE")
        self.assertEqual(resolved.resolved_record_id, "TRD-RCR-RESOLVED")
        self.assertEqual(resolved.resolution_comment, "Trade was created from the PO queue.")
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0].record_type, "TRADE")
        self.assertEqual(links[0].record_id, "TRD-RCR-RESOLVED")
        self.assertEqual(links[0].source, "RECORD_CREATION_REQUEST")
        self.assertEqual(len(events), 1)
        self.assertEqual(open_requests, [])
        self.assertEqual([item.request_id for item in resolved_requests], [request.request_id])

    def test_resolution_requires_matching_target_record_type(self) -> None:
        with self.SessionLocal() as session:
            document = self._seed_verified_document(
                session,
                document_id="DOC-RCR-MISMATCH-1",
                document_kind="PURCHASE_ORDER",
                header_fields=[
                    {"field_key": "purchase_order_number", "value": "PO-RCR-MISMATCH"},
                    {"field_key": "buyer", "value": "Metro Fuels"},
                    {"field_key": "seller", "value": "Shell Trading"},
                    {"field_key": "commodity", "value": "ULSD"},
                    {"field_key": "quantity", "value": "1000 BBL"},
                ],
            )
            session.commit()
            request = stage_document_record_creation_request(
                session,
                document_id=document.document_id,
                actor_id="ops@example.com",
            )
            self._seed_trade(session, trade_id="TRD-RCR-MISMATCH")
            session.commit()

            with self.assertRaisesRegex(ValueError, "same target record type"):
                resolve_document_record_creation_request(
                    session,
                    document_id=document.document_id,
                    request_id=request.request_id,
                    actor_id="ops@example.com",
                    record_type="DELIVERY",
                    record_id="TRD-RCR-MISMATCH",
                )

    def test_cancels_open_request_without_linking_record(self) -> None:
        with self.SessionLocal() as session:
            document = self._seed_verified_document(
                session,
                document_id="DOC-RCR-CANCEL-1",
                document_kind="PURCHASE_ORDER",
                header_fields=[
                    {"field_key": "purchase_order_number", "value": "PO-RCR-CANCEL"},
                    {"field_key": "buyer", "value": "Metro Fuels"},
                    {"field_key": "seller", "value": "Shell Trading"},
                    {"field_key": "commodity", "value": "ULSD"},
                    {"field_key": "quantity", "value": "1000 BBL"},
                ],
            )
            session.commit()
            request = stage_document_record_creation_request(
                session,
                document_id=document.document_id,
                actor_id="ops@example.com",
            )

            cancelled = cancel_document_record_creation_request(
                session,
                document_id=document.document_id,
                request_id=request.request_id,
                actor_id="ops@example.com",
                resolution_comment="Duplicate intake opened by mistake.",
            )
            session.commit()
            cancelled_status = cancelled.status
            cancelled_comment = cancelled.resolution_comment
            cancelled_resolved_record_id = cancelled.resolved_record_id

            links = session.execute(select(DocumentRecordLink)).scalars().all()
            events = (
                session.execute(
                    select(Event).where(Event.event_type == "DocumentRecordCreationCancelled")
                )
                .scalars()
                .all()
            )

        self.assertEqual(cancelled_status, "CANCELLED")
        self.assertEqual(cancelled_comment, "Duplicate intake opened by mistake.")
        self.assertEqual(cancelled_resolved_record_id, None)
        self.assertEqual(links, [])
        self.assertEqual(len(events), 1)

    def test_terminal_request_cannot_be_resolved_twice(self) -> None:
        with self.SessionLocal() as session:
            document = self._seed_verified_document(
                session,
                document_id="DOC-RCR-TERMINAL-1",
                document_kind="PURCHASE_ORDER",
                header_fields=[
                    {"field_key": "purchase_order_number", "value": "PO-RCR-TERMINAL"},
                    {"field_key": "buyer", "value": "Metro Fuels"},
                    {"field_key": "seller", "value": "Shell Trading"},
                    {"field_key": "commodity", "value": "ULSD"},
                    {"field_key": "quantity", "value": "1000 BBL"},
                ],
            )
            session.commit()
            request = stage_document_record_creation_request(
                session,
                document_id=document.document_id,
                actor_id="ops@example.com",
            )
            self._seed_trade(session, trade_id="TRD-RCR-TERMINAL")
            session.commit()

            resolve_document_record_creation_request(
                session,
                document_id=document.document_id,
                request_id=request.request_id,
                actor_id="ops@example.com",
                record_type="TRADE",
                record_id="TRD-RCR-TERMINAL",
            )

            with self.assertRaisesRegex(ValueError, "already resolved"):
                resolve_document_record_creation_request(
                    session,
                    document_id=document.document_id,
                    request_id=request.request_id,
                    actor_id="ops@example.com",
                    record_type="TRADE",
                    record_id="TRD-RCR-TERMINAL",
                )

    def test_requires_verified_document_before_staging_intake(self) -> None:
        with self.SessionLocal() as session:
            document = self._seed_verified_document(
                session,
                document_id="DOC-RCR-UNVERIFIED",
                document_kind="INVOICE",
                review_status="IN_REVIEW",
                page_review_status="REVIEWED",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-RCR-UNVERIFIED"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            session.commit()

            with self.assertRaisesRegex(ValueError, "Only verified documents"):
                stage_document_record_creation_request(
                    session,
                    document_id=document.document_id,
                    actor_id="ops@example.com",
                )

    def test_stage_request_reports_schema_drift_when_intake_table_is_missing(self) -> None:
        DocumentRecordCreationRequest.__table__.drop(bind=self.engine, checkfirst=True)
        try:
            with self.SessionLocal() as session:
                document = self._seed_verified_document(
                    session,
                    document_id="DOC-RCR-MISSING-TABLE",
                    document_kind="PURCHASE_ORDER",
                    header_fields=[
                        {"field_key": "purchase_order_number", "value": "PO-RCR-MISSING"},
                        {"field_key": "buyer", "value": "Metro Fuels"},
                        {"field_key": "seller", "value": "Shell Trading"},
                        {"field_key": "commodity", "value": "ULSD"},
                        {"field_key": "quantity", "value": "1000 BBL"},
                    ],
                )
                session.commit()

                with self.assertRaisesRegex(DocumentRecordCreationRequestPersistenceUnavailable, "schema is behind"):
                    stage_document_record_creation_request(
                        session,
                        document_id=document.document_id,
                        actor_id="ops@example.com",
                    )
        finally:
            DocumentRecordCreationRequest.__table__.create(bind=self.engine, checkfirst=True)


if __name__ == "__main__":
    unittest.main()
