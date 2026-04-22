from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.documents.services.document_action_governance import build_document_action_governance
from apps.api.app.domains.documents.services.document_action_planning import build_document_action_plan
from apps.api.app.domains.documents.services.document_linkage import build_document_linkage_assessment
from apps.api.app.models import Base
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.schemas.document import DocumentRecordLinkOut


class DocumentActionGovernanceServiceTests(unittest.TestCase):
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
            session.query(Trade).delete()
            session.commit()

    def _reviewed_page(self, *, document_kind: str, header_fields: list[dict[str, object]]) -> DocumentIngestionPage:
        now = datetime.now(timezone.utc)
        return DocumentIngestionPage(
            document_id="DOC-GOV-200",
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
            last_event_id=f"evt-{trade_id}",
        )

    def test_attach_plan_is_auto_eligible_when_match_is_strong(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-GOV-100")
            invoice = TradeInvoice(
                trade_id=trade.trade_id,
                delivery_id=None,
                leg_no=None,
                invoice_number="INV-GOV-100",
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
                    {"field_key": "invoice_number", "value": "INV-GOV-100"},
                    {"field_key": "trade_id", "value": "TRD-GOV-100"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-GOV-100",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )
            governance = build_document_action_governance(
                action_plan=plan,
                linkage_assessment=linkage,
            )

        self.assertEqual(governance.status, "AUTO_EXECUTION_ELIGIBLE")
        self.assertEqual(governance.recommended_execution_mode, "AUTO")
        self.assertTrue(governance.manual_execution_allowed)
        self.assertTrue(governance.auto_execution_allowed)
        self.assertFalse(governance.approval_required)

    def test_create_plan_requires_human_confirmation(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-GOV-200")
            session.add(trade)
            session.commit()

            page = self._reviewed_page(
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-GOV-200"},
                    {"field_key": "trade_id", "value": "TRD-GOV-200"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-GOV-200",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )
            governance = build_document_action_governance(
                action_plan=plan,
                linkage_assessment=linkage,
            )

        self.assertEqual(governance.status, "HUMAN_CONFIRMATION_REQUIRED")
        self.assertEqual(governance.recommended_execution_mode, "MANUAL")
        self.assertTrue(governance.manual_execution_allowed)
        self.assertFalse(governance.auto_execution_allowed)
        self.assertIn("CREATES_NEW_RECORD", governance.risk_flags)
        self.assertIn("FINANCIAL_MUTATION", governance.risk_flags)

    def test_blocked_plan_remains_manual_review_required(self) -> None:
        with self.SessionLocal() as session:
            page = self._reviewed_page(
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-GOV-300"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-GOV-300",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )
            governance = build_document_action_governance(
                action_plan=plan,
                linkage_assessment=linkage,
            )

        self.assertEqual(governance.status, "MANUAL_REVIEW_REQUIRED")
        self.assertEqual(governance.recommended_execution_mode, "NONE")
        self.assertFalse(governance.manual_execution_allowed)
        self.assertFalse(governance.auto_execution_allowed)

    def test_existing_link_marks_action_as_already_applied(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-GOV-400")
            invoice = TradeInvoice(
                trade_id=trade.trade_id,
                delivery_id=None,
                leg_no=None,
                invoice_number="INV-GOV-400",
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
                    {"field_key": "invoice_number", "value": "INV-GOV-400"},
                    {"field_key": "trade_id", "value": "TRD-GOV-400"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            linkage = build_document_linkage_assessment(session, pages=[page], review_status="VERIFIED")
            plan = build_document_action_plan(
                document_id="DOC-GOV-400",
                pages=[page],
                review_status="VERIFIED",
                linkage_assessment=linkage,
            )
            governance = build_document_action_governance(
                action_plan=plan,
                linkage_assessment=linkage,
                record_links=[
                    DocumentRecordLinkOut(
                        record_type="TRADE_INVOICE",
                        record_id=str(invoice.id),
                        record_label="Invoice INV-GOV-400",
                        role="PRIMARY",
                        source="ACTION_PLAN",
                        summary="Trade TRD-GOV-400 • Issued",
                        linked_at=datetime(2026, 4, 14, 13, 0, tzinfo=timezone.utc),
                        linked_by="tester",
                    )
                ],
            )

        self.assertEqual(governance.status, "ALREADY_APPLIED")
        self.assertEqual(governance.recommended_execution_mode, "NONE")
        self.assertFalse(governance.manual_execution_allowed)
        self.assertFalse(governance.auto_execution_allowed)
        self.assertIn("ALREADY_APPLIED", governance.risk_flags)


if __name__ == "__main__":
    unittest.main()
