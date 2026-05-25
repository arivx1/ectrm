from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.documents.services.document_action_execution import execute_document_action_plan
from apps.api.app.models import Base
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_record_link import DocumentRecordLink
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment


class DocumentActionExecutionServiceTests(unittest.TestCase):
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
            session.query(DocumentRecordLink).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeConfirmation).delete()
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

    def test_execute_attach_links_document_to_existing_invoice(self) -> None:
        invoice_id: str | None = None
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-EXEC-100")
            invoice = TradeInvoice(
                trade_id=trade.trade_id,
                delivery_id=None,
                leg_no=None,
                invoice_number="INV-EXEC-100",
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
                document_id="DOC-EXEC-100",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-EXEC-100"},
                    {"field_key": "trade_id", "value": "TRD-EXEC-100"},
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

            result = execute_document_action_plan(
                session,
                document_id=document.document_id,
                actor_id="tester",
            )
            session.commit()

            links = session.execute(
                select(DocumentRecordLink).where(DocumentRecordLink.document_id == document.document_id)
            ).scalars().all()

        self.assertEqual(len(links), 1)
        self.assertEqual(links[0].record_type, "TRADE_INVOICE")
        self.assertEqual(links[0].record_id, invoice_id)
        self.assertTrue(any(link.record_label == "Invoice INV-EXEC-100" for link in result.record_links))

    def test_direct_execute_blocks_create_invoice_without_approval(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-EXEC-200")
            document, page = self._seed_verified_document(
                document_id="DOC-EXEC-200",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-EXEC-200"},
                    {"field_key": "trade_id", "value": "TRD-EXEC-200"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            session.add_all([trade, document, page])
            session.commit()

            with self.assertRaisesRegex(ValueError, "staged for approval"):
                execute_document_action_plan(
                    session,
                    document_id=document.document_id,
                    actor_id="tester",
                )
            session.commit()

            invoices = session.execute(
                select(TradeInvoice).where(TradeInvoice.trade_id == trade.trade_id)
            ).scalars().all()
            links = session.execute(
                select(DocumentRecordLink)
                .where(DocumentRecordLink.document_id == document.document_id)
                .order_by(DocumentRecordLink.record_type.asc())
            ).scalars().all()

        self.assertEqual(invoices, [])
        self.assertEqual(links, [])


if __name__ == "__main__":
    unittest.main()
