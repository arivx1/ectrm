from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.documents.services.document_linkage import build_document_linkage_assessment
from apps.api.app.models import Base
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_payment import TradePayment


class DocumentLinkageServiceTests(unittest.TestCase):
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
            session.query(PriceIndexObservation).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeConfirmation).delete()
            session.query(TradeActualization).delete()
            session.query(DeliveryPipelineDetail).delete()
            session.query(DeliveryObligation).delete()
            session.query(Trade).delete()
            session.commit()

    def _reviewed_page(self, *, document_kind: str, header_fields: list[dict[str, object]]) -> DocumentIngestionPage:
        now = datetime.now(timezone.utc)
        return DocumentIngestionPage(
            document_id="DOC-100",
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

    def _seed_trade(self, *, trade_id: str, external_trade_id: str | None = None, counterparty: str = "Shell Trading") -> Trade:
        now = datetime(2026, 4, 14, 12, 0, tzinfo=timezone.utc)
        return Trade(
            trade_id=trade_id,
            originating_option_trade_id=None,
            external_trade_id=external_trade_id,
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
            last_event_id="evt-100",
        )

    def test_delivery_confirmation_links_to_existing_actualization(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-ACT-100")
            actualization = TradeActualization(
                delivery_id="DLV-TRD-ACT-100",
                trade_id=trade.trade_id,
                leg_no=None,
                actual_quantity=Decimal("1000"),
                actualized_at=datetime(2026, 4, 18, 0, 0, tzinfo=timezone.utc),
                source="DOCUMENT_LIBRARY",
                notes="Prior reviewed actualization.",
                created_at=datetime(2026, 4, 18, 0, 0, tzinfo=timezone.utc),
                created_by="tester",
                updated_at=datetime(2026, 4, 18, 0, 0, tzinfo=timezone.utc),
                updated_by="tester",
                version=1,
            )
            session.add_all([trade, actualization])
            session.commit()
            session.refresh(actualization)
            actualization_id = str(actualization.id)

            page = self._reviewed_page(
                document_kind="DELIVERY_CONFIRMATION",
                header_fields=[
                    {"field_key": "delivery_confirmation_number", "value": "POD-ACT-100"},
                    {"field_key": "confirmation_date", "value": "2026-04-18"},
                    {"field_key": "trade_id", "value": "TRD-ACT-100"},
                    {"field_key": "delivery_id", "value": "DLV-TRD-ACT-100"},
                    {"field_key": "actual_quantity", "value": "1000"},
                ],
            )

            assessment = build_document_linkage_assessment(
                session,
                pages=[page],
                review_status="VERIFIED",
            )

        self.assertEqual(assessment.status, "READY")
        self.assertEqual(assessment.recommended_action, "ATTACH")
        self.assertEqual(assessment.primary_record_type, "TRADE_ACTUALIZATION")
        self.assertEqual(assessment.primary_record_id, actualization_id)
        self.assertEqual(assessment.candidates[0].candidate_state, "ATTACH_READY")
        self.assertIn("delivery_id", assessment.candidates[0].matched_keys)
        self.assertIn("actual_quantity", assessment.candidates[0].matched_keys)

    def test_invoice_links_to_existing_trade_invoice(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-INV-100")
            invoice = TradeInvoice(
                trade_id=trade.trade_id,
                delivery_id=None,
                leg_no=None,
                invoice_number="INV-100",
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
                    {"field_key": "invoice_number", "value": "INV-100"},
                    {"field_key": "trade_id", "value": "TRD-INV-100"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )

            assessment = build_document_linkage_assessment(
                session,
                pages=[page],
                review_status="VERIFIED",
            )

        self.assertEqual(assessment.status, "READY")
        self.assertEqual(assessment.recommended_action, "ATTACH")
        self.assertEqual(assessment.primary_record_type, "TRADE_INVOICE")
        self.assertEqual(assessment.primary_record_id, str(invoice.id))
        self.assertEqual(assessment.candidates[0].candidate_state, "ATTACH_READY")
        self.assertIn("invoice_number", assessment.candidates[0].matched_keys)
        self.assertIn("trade_id", assessment.candidates[0].matched_keys)

    def test_invoice_without_existing_record_suggests_creation(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-INV-200")
            session.add(trade)
            session.commit()

            page = self._reviewed_page(
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-200"},
                    {"field_key": "trade_id", "value": "TRD-INV-200"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )

            assessment = build_document_linkage_assessment(
                session,
                pages=[page],
                review_status="VERIFIED",
            )

        self.assertEqual(assessment.status, "CREATE")
        self.assertEqual(assessment.recommended_action, "CREATE")
        self.assertEqual(assessment.primary_record_type, "TRADE_INVOICE")
        self.assertIsNone(assessment.primary_record_id)
        self.assertFalse(assessment.candidates[0].existing_record)
        self.assertEqual(assessment.candidates[0].candidate_state, "CREATE_CANDIDATE")
        self.assertTrue(any(candidate.record_type == "TRADE" and candidate.existing_record for candidate in assessment.candidates))

    def test_pipeline_statement_links_to_delivery_by_nomination(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-DLV-300")
            delivery = DeliveryObligation(
                delivery_id="DLV-300",
                trade_id=trade.trade_id,
                trade_leg_id=None,
                leg_no=1,
                external_trade_id=None,
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
                booked_at=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
                source_trade_updated_at=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
                created_at=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
                created_by="tester",
                updated_at=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
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
                contract_number="PIPE-CONTRACT-300",
                contract_number_source="MANUAL",
                cycle_code=None,
                cycle_code_source="SYSTEM_GENERATED",
                nomination_reference="NOM-300",
                nomination_reference_source="MANUAL",
                created_at=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
                created_by="tester",
                updated_at=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
                updated_by="tester",
                version=1,
            )
            session.add_all([trade, delivery, pipeline_detail])
            session.commit()

            page = self._reviewed_page(
                document_kind="PIPELINE_STATEMENT",
                header_fields=[
                    {"field_key": "statement_number", "value": "PIPE-300"},
                    {"field_key": "trade_id", "value": "TRD-DLV-300"},
                    {"field_key": "pipeline_system", "value": "NGPL"},
                    {"field_key": "contract_number", "value": "PIPE-CONTRACT-300"},
                    {"field_key": "nomination_reference", "value": "NOM-300"},
                    {"field_key": "receipt_location_code", "value": "HOUSTON"},
                    {"field_key": "delivery_location_code", "value": "BEAUMONT"},
                ],
            )

            assessment = build_document_linkage_assessment(
                session,
                pages=[page],
                review_status="VERIFIED",
            )

        self.assertEqual(assessment.status, "READY")
        self.assertEqual(assessment.primary_record_type, "DELIVERY")
        self.assertEqual(assessment.primary_record_id, "DLV-300")
        self.assertEqual(assessment.candidates[0].candidate_state, "ATTACH_READY")
        self.assertIn("nomination_reference", assessment.candidates[0].matched_keys)

    def test_quality_specification_can_propose_creation_and_keep_trade_context(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(trade_id="TRD-SPEC-400", counterparty="Chevron")
            session.add(trade)
            session.commit()

            page = self._reviewed_page(
                document_kind="QUALITY_SPECIFICATION",
                header_fields=[
                    {"field_key": "spec_name", "value": "ULSD 10 PPM"},
                    {"field_key": "spec_version", "value": "REV-4"},
                    {"field_key": "trade_id", "value": "TRD-SPEC-400"},
                    {"field_key": "counterparty", "value": "Chevron"},
                    {"field_key": "product", "value": "ULSD"},
                ],
            )

            assessment = build_document_linkage_assessment(
                session,
                pages=[page],
                review_status="VERIFIED",
            )

        self.assertEqual(assessment.status, "CREATE")
        self.assertEqual(assessment.primary_record_type, "QUALITY_SPECIFICATION")
        self.assertTrue(any(candidate.record_type == "TRADE" and candidate.existing_record for candidate in assessment.candidates))

    def test_price_publication_links_to_existing_price_observation(self) -> None:
        with self.SessionLocal() as session:
            now = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)
            price_index = ReferencePriceIndex(
                code="WTI_CUSHING_D",
                name="WTI Cushing Daily",
                commodity_code="WTI",
                currency_code="USD",
                unit_code="BBL",
                provider="EIA",
                quote_type="SPOT",
                market="Crude Oil",
                location_code="CUSHING",
                calendar_code=None,
                description="Daily WTI Cushing price assessment.",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=now,
                created_by="tester",
                updated_at=now,
                updated_by="tester",
                version=1,
            )
            observation = PriceIndexObservation(
                price_index_code=price_index.code,
                observation_date=date(2026, 4, 15),
                value=Decimal("84.250000"),
                unit_code="BBL",
                currency_code="USD",
                source_provider="EIA",
                source_series_id="PET.RWTC.D",
                source_frequency="daily",
                source_published_at=now,
                source_revision="2026-04-15",
                downloaded_at=now,
                run_id=42,
                raw_payload={"series_id": "PET.RWTC.D"},
                created_at=now,
                updated_at=now,
            )
            session.add_all([price_index, observation])
            session.commit()
            session.refresh(observation)

            page = self._reviewed_page(
                document_kind="PRICE_PUBLICATION",
                header_fields=[
                    {"field_key": "publication_date", "value": "2026-04-15"},
                    {"field_key": "observation_date", "value": "2026-04-15"},
                    {"field_key": "price_index_code", "value": "WTI_CUSHING_D"},
                    {"field_key": "source_provider", "value": "EIA"},
                    {"field_key": "source_series_id", "value": "PET.RWTC.D"},
                    {"field_key": "commodity", "value": "WTI"},
                    {"field_key": "location", "value": "CUSHING"},
                    {"field_key": "price", "value": "84.25"},
                    {"field_key": "currency", "value": "USD"},
                    {"field_key": "unit", "value": "BBL"},
                ],
            )

            assessment = build_document_linkage_assessment(
                session,
                pages=[page],
                review_status="VERIFIED",
            )

        self.assertEqual(assessment.status, "READY")
        self.assertEqual(assessment.recommended_action, "ATTACH")
        self.assertEqual(assessment.primary_record_type, "PRICE_INDEX_OBSERVATION")
        self.assertEqual(assessment.primary_record_id, str(observation.id))
        self.assertIn("price_index_code", assessment.candidates[0].matched_keys)
        self.assertIn("observation_date", assessment.candidates[0].matched_keys)


if __name__ == "__main__":
    unittest.main()
