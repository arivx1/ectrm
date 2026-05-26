from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.documents.services.document_workflows import execute_document_workflow
from apps.api.app.domains.documents.services.document_workflows import list_document_workflows
from apps.api.app.models import Base
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_record_link import DocumentRecordLink
from apps.api.app.models.event import Event
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice


class DocumentWorkflowsServiceTests(unittest.TestCase):
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
            session.query(MutationProvenanceRecord).delete()
            session.query(Event).delete()
            session.query(DocumentRecordLink).delete()
            session.query(PriceIndexObservation).delete()
            session.query(ExternalDataRun).delete()
            session.query(DeliveryPipelineDetail).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(TradeInvoice).delete()
            session.query(DeliveryObligation).delete()
            session.query(Trade).delete()
            session.query(ReferencePriceIndex).delete()
            session.commit()

    def _seed_price_index(self, session) -> ReferencePriceIndex:
        now = datetime(2026, 4, 14, 12, 0, tzinfo=timezone.utc)
        record = ReferencePriceIndex(
            code="WTI_CUSHING_D",
            name="WTI Cushing Daily",
            commodity_code="WTI",
            currency_code="USD",
            unit_code="BBL",
            provider="EIA",
            quote_type="SPOT",
            market="US",
            location_code="CUSHING",
            calendar_code=None,
            description=None,
            is_active=True,
            effective_from=None,
            effective_to=None,
            created_at=now,
            created_by="tester",
            updated_at=now,
            updated_by="tester",
            version=1,
        )
        session.add(record)
        return record

    def _seed_verified_document(
        self,
        session,
        *,
        document_id: str = "DOC-PRICE-1",
        document_kind: str = "PRICE_PUBLICATION",
        header_fields: list[dict[str, object]] | None = None,
        table_blocks: list[dict[str, object]] | None = None,
    ) -> DocumentIngestion:
        now = datetime(2026, 4, 15, 10, 0, tzinfo=timezone.utc)
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
            classification_confidence=0.99,
            classification_payload={},
            header_fields=header_fields or [
                {
                    "field_key": "publication_date",
                    "label": "Publication Date",
                    "value": "2026-04-15",
                    "confidence": 0.99,
                    "source": "review",
                },
                {
                    "field_key": "observation_date",
                    "label": "Observation Date",
                    "value": "2026-04-15",
                    "confidence": 0.99,
                    "source": "review",
                },
                {
                    "field_key": "price_index_code",
                    "label": "Price Index Code",
                    "value": "WTI_CUSHING_D",
                    "confidence": 0.99,
                    "source": "review",
                },
                {
                    "field_key": "source_provider",
                    "label": "Source Provider",
                    "value": "EIA",
                    "confidence": 0.99,
                    "source": "review",
                },
                {
                    "field_key": "source_series_id",
                    "label": "Source Series ID",
                    "value": "PET.RWTC.D",
                    "confidence": 0.99,
                    "source": "review",
                },
                {
                    "field_key": "price",
                    "label": "Price",
                    "value": "USD 84.25",
                    "confidence": 0.99,
                    "source": "review",
                },
                {
                    "field_key": "currency",
                    "label": "Currency",
                    "value": "USD",
                    "confidence": 0.99,
                    "source": "review",
                },
                {
                    "field_key": "unit",
                    "label": "Unit",
                    "value": "BBL",
                    "confidence": 0.99,
                    "source": "review",
                },
            ],
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
        session.add_all([document, page])
        return document

    def _seed_trade(self, session, *, trade_id: str = "TRD-WF-100") -> Trade:
        now = datetime(2026, 4, 14, 12, 0, tzinfo=timezone.utc)
        record = Trade(
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
            last_event_id="evt-wf-100",
        )
        session.add(record)
        return record

    def _seed_invoice(
        self,
        session,
        *,
        trade_id: str,
        invoice_number: str,
        invoice_amount: Decimal = Decimal("99000"),
    ) -> TradeInvoice:
        now = datetime(2026, 4, 14, 12, 45, tzinfo=timezone.utc)
        record = TradeInvoice(
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
        session.add(record)
        return record

    def _seed_delivery(
        self,
        session,
        *,
        trade: Trade,
        delivery_id: str,
        nomination_reference: str,
    ) -> tuple[DeliveryObligation, DeliveryPipelineDetail]:
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
            contract_number="PIPE-CONTRACT-600",
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
        session.add_all([delivery, pipeline_detail])
        return delivery, pipeline_detail

    def test_workflow_registry_assigns_process_prices_to_price_publication_report(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(session)
            document = self._seed_verified_document(session)
            invoice = self._seed_verified_document(
                session,
                document_id="DOC-INVOICE-1",
                document_kind="INVOICE",
            )
            session.commit()

            price_workflows = list_document_workflows(session, document_id=document.document_id)
            invoice_workflows = list_document_workflows(session, document_id=invoice.document_id)

        self.assertEqual(price_workflows.document_type_label, "Price Publication Report")
        self.assertEqual([workflow.workflow_id for workflow in price_workflows.workflows], ["match_existing_record", "process_prices"])
        self.assertEqual(price_workflows.workflows[0].label, "Match Existing Record")
        self.assertEqual(price_workflows.workflows[0].candidate_state, "ATTACH_READY")
        self.assertEqual(price_workflows.workflows[1].label, "Process Prices")
        self.assertEqual(price_workflows.linkage_assessment.primary_record_type, "PRICE_INDEX")
        self.assertEqual([workflow.workflow_id for workflow in invoice_workflows.workflows], ["create_invoice_from_document"])
        self.assertEqual(invoice_workflows.workflows[0].status, "BLOCKED")
        self.assertEqual(invoice_workflows.empty_message, "No workflows assigned to this document type.")

    def test_workflow_summary_exposes_create_invoice_candidate_under_trade(self) -> None:
        with self.SessionLocal() as session:
            self._seed_trade(session, trade_id="TRD-WF-200")
            document = self._seed_verified_document(
                session,
                document_id="DOC-INVOICE-WF-200",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-WF-200"},
                    {"field_key": "trade_id", "value": "TRD-WF-200"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "99000"},
                ],
            )
            session.commit()

            workflows = list_document_workflows(session, document_id=document.document_id)

        self.assertEqual(workflows.action_plan.candidate_state, "CREATE_CANDIDATE")
        self.assertEqual(workflows.governance.status, "HUMAN_CONFIRMATION_REQUIRED")
        self.assertEqual([workflow.workflow_id for workflow in workflows.workflows], ["create_invoice_from_document", "match_existing_record"])
        create_workflow = workflows.workflows[0]
        self.assertEqual(create_workflow.status, "READY")
        self.assertEqual(create_workflow.target.record_type, "TRADE_INVOICE")
        self.assertEqual(create_workflow.owner.record_type, "TRADE")
        self.assertEqual(create_workflow.owner.record_id, "TRD-WF-200")
        self.assertTrue(create_workflow.approval_required)
        self.assertIn("CREATES_NEW_RECORD", create_workflow.risk_flags)
        self.assertIn("FINANCIAL_MUTATION", create_workflow.risk_flags)

    def test_workflow_summary_exposes_create_confirmation_candidate_under_trade(self) -> None:
        with self.SessionLocal() as session:
            self._seed_trade(session, trade_id="TRD-WF-CON-200")
            document = self._seed_verified_document(
                session,
                document_id="DOC-CON-WF-200",
                document_kind="TRADE_CONFIRMATION",
                header_fields=[
                    {"field_key": "confirmation_number", "value": "CONF-WF-200"},
                    {"field_key": "trade_id", "value": "TRD-WF-CON-200"},
                    {"field_key": "trade_date", "value": "2026-04-14"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                ],
            )
            session.commit()

            workflows = list_document_workflows(session, document_id=document.document_id)

        self.assertEqual(workflows.action_plan.candidate_state, "CREATE_CANDIDATE")
        self.assertEqual(workflows.action_plan.operation_type, "create_trade_confirmation")
        self.assertEqual(workflows.governance.status, "HUMAN_CONFIRMATION_REQUIRED")
        self.assertEqual(
            [workflow.workflow_id for workflow in workflows.workflows],
            ["create_confirmation_from_document", "match_existing_record"],
        )
        create_workflow = workflows.workflows[0]
        self.assertEqual(create_workflow.status, "READY")
        self.assertEqual(create_workflow.target.record_type, "TRADE_CONFIRMATION")
        self.assertEqual(create_workflow.owner.record_type, "TRADE")
        self.assertEqual(create_workflow.owner.record_id, "TRD-WF-CON-200")
        self.assertTrue(create_workflow.approval_required)
        self.assertIn("CREATES_NEW_RECORD", create_workflow.risk_flags)
        self.assertIn("FINANCIAL_MUTATION", create_workflow.risk_flags)

    def test_workflow_summary_exposes_create_payment_candidate_under_invoice(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(session, trade_id="TRD-WF-PAY-200")
            invoice = self._seed_invoice(
                session,
                trade_id=trade.trade_id,
                invoice_number="INV-WF-PAY-200",
            )
            document = self._seed_verified_document(
                session,
                document_id="DOC-PAY-WF-200",
                document_kind="PAYMENT_ADVICE",
                header_fields=[
                    {"field_key": "payment_reference", "value": "PAY-WF-200"},
                    {"field_key": "invoice_number", "value": "INV-WF-PAY-200"},
                    {"field_key": "advice_date", "value": "2026-04-15"},
                    {"field_key": "amount", "value": "99000"},
                    {"field_key": "currency", "value": "USD"},
                ],
            )
            session.commit()
            invoice_id = str(invoice.id)

            workflows = list_document_workflows(session, document_id=document.document_id)

        self.assertEqual(workflows.action_plan.candidate_state, "CREATE_CANDIDATE")
        self.assertEqual(workflows.action_plan.operation_type, "create_trade_payment")
        self.assertEqual(workflows.governance.status, "HUMAN_CONFIRMATION_REQUIRED")
        self.assertEqual(
            [workflow.workflow_id for workflow in workflows.workflows],
            ["create_payment_from_document", "match_existing_record"],
        )
        create_workflow = workflows.workflows[0]
        self.assertEqual(create_workflow.status, "READY")
        self.assertEqual(create_workflow.target.record_type, "TRADE_PAYMENT")
        self.assertEqual(create_workflow.owner.record_type, "TRADE_INVOICE")
        self.assertEqual(create_workflow.owner.record_id, invoice_id)
        self.assertTrue(create_workflow.approval_required)
        self.assertIn("CREATES_NEW_RECORD", create_workflow.risk_flags)
        self.assertIn("FINANCIAL_MUTATION", create_workflow.risk_flags)

    def test_workflow_summary_exposes_existing_delivery_candidate_for_pipeline_statement(self) -> None:
        with self.SessionLocal() as session:
            trade = self._seed_trade(session, trade_id="TRD-DLV-WF-200")
            self._seed_delivery(
                session,
                trade=trade,
                delivery_id="DLV-WF-200",
                nomination_reference="NOM-WF-200",
            )
            document = self._seed_verified_document(
                session,
                document_id="DOC-DLV-WF-200",
                document_kind="PIPELINE_STATEMENT",
                header_fields=[
                    {"field_key": "statement_number", "value": "PIPE-WF-200"},
                    {"field_key": "trade_id", "value": "TRD-DLV-WF-200"},
                    {"field_key": "delivery_id", "value": "DLV-WF-200"},
                    {"field_key": "pipeline_system", "value": "NGPL"},
                    {"field_key": "contract_number", "value": "PIPE-CONTRACT-600"},
                    {"field_key": "nomination_reference", "value": "NOM-WF-200"},
                    {"field_key": "receipt_location_code", "value": "HOUSTON"},
                    {"field_key": "delivery_location_code", "value": "BEAUMONT"},
                ],
            )
            session.commit()

            workflows = list_document_workflows(session, document_id=document.document_id)

        self.assertEqual(workflows.action_plan.action_type, "ATTACH_EXISTING_RECORD")
        self.assertEqual(workflows.action_plan.operation_type, "link_document_to_record")
        self.assertEqual(workflows.action_plan.target.record_type, "DELIVERY")
        self.assertEqual(workflows.action_plan.target.record_id, "DLV-WF-200")
        self.assertEqual(workflows.action_plan.candidate_state, "ATTACH_READY")
        self.assertEqual([workflow.workflow_id for workflow in workflows.workflows], ["match_existing_record"])
        self.assertEqual(workflows.workflows[0].status, "READY")

    def test_workflow_summary_blocks_missing_delivery_creation_until_typed_service_exists(self) -> None:
        with self.SessionLocal() as session:
            self._seed_trade(session, trade_id="TRD-DLV-WF-300")
            document = self._seed_verified_document(
                session,
                document_id="DOC-DLV-WF-300",
                document_kind="NOMINATION",
                header_fields=[
                    {"field_key": "nomination_reference", "value": "NOM-WF-300"},
                    {"field_key": "flow_date", "value": "2026-04-15"},
                    {"field_key": "trade_id", "value": "TRD-DLV-WF-300"},
                    {"field_key": "contract_number", "value": "PIPE-CONTRACT-300"},
                    {"field_key": "pipeline_system", "value": "NGPL"},
                    {"field_key": "receipt_location_code", "value": "HOUSTON"},
                    {"field_key": "delivery_location_code", "value": "BEAUMONT"},
                ],
            )
            session.commit()

            workflows = list_document_workflows(session, document_id=document.document_id)

        self.assertEqual(workflows.action_plan.status, "BLOCKED")
        self.assertEqual(workflows.action_plan.action_type, "MANUAL_REVIEW")
        self.assertEqual(workflows.action_plan.operation_type, "manual_review_document_linkage")
        self.assertEqual(workflows.action_plan.target.record_type, "DELIVERY")
        self.assertEqual(workflows.action_plan.owner.record_type, "TRADE")
        self.assertEqual(workflows.action_plan.owner.record_id, "TRD-DLV-WF-300")
        self.assertIn("typed_creation_service", workflows.action_plan.missing_evidence)
        self.assertEqual([workflow.workflow_id for workflow in workflows.workflows], ["create_delivery_from_document", "match_existing_record"])
        create_workflow = workflows.workflows[0]
        self.assertEqual(create_workflow.status, "BLOCKED")
        self.assertEqual(create_workflow.candidate_state, "MANUAL_REVIEW")
        self.assertEqual(create_workflow.target.record_type, "DELIVERY")
        self.assertIn("typed creation service", create_workflow.disabled_reason)

    def test_workflow_summary_blocks_invoice_creation_without_owner_trade(self) -> None:
        with self.SessionLocal() as session:
            document = self._seed_verified_document(
                session,
                document_id="DOC-INVOICE-WF-300",
                document_kind="INVOICE",
                header_fields=[
                    {"field_key": "invoice_number", "value": "INV-WF-300"},
                    {"field_key": "invoice_date", "value": "2026-04-14"},
                    {"field_key": "due_date", "value": "2026-04-20"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "125000"},
                ],
            )
            session.commit()

            workflows = list_document_workflows(session, document_id=document.document_id)

        self.assertEqual(workflows.action_plan.candidate_state, "OWNER_REQUIRED")
        self.assertEqual([workflow.workflow_id for workflow in workflows.workflows], ["create_invoice_from_document"])
        create_workflow = workflows.workflows[0]
        self.assertEqual(create_workflow.status, "BLOCKED")
        self.assertEqual(create_workflow.candidate_state, "OWNER_REQUIRED")
        self.assertEqual(create_workflow.required_owner_record_types, ["TRADE"])
        self.assertIn("owner:TRADE", create_workflow.missing_evidence)
        self.assertIn("confirmed owner record", create_workflow.disabled_reason)

    def test_execute_process_prices_writes_price_observation_and_links_document(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(session)
            document = self._seed_verified_document(session)
            session.commit()

            result = execute_document_workflow(
                session,
                document_id=document.document_id,
                workflow_id="process_prices",
                actor_id="tester",
            )
            session.commit()

            observations = session.execute(select(PriceIndexObservation)).scalars().all()
            links = (
                session.execute(
                    select(DocumentRecordLink)
                    .where(DocumentRecordLink.document_id == document.document_id)
                    .order_by(DocumentRecordLink.record_type.asc())
                )
                .scalars()
                .all()
            )
            activity_events = (
                session.execute(
                    select(Event)
                    .where(
                        Event.aggregate_type == "document",
                        Event.aggregate_id == document.document_id,
                        Event.event_type == "DocumentWorkflowExecuted",
                    )
                )
                .scalars()
                .all()
            )

        self.assertEqual(result.created_count, 1)
        self.assertEqual(result.updated_count, 0)
        self.assertEqual(result.unchanged_count, 0)
        self.assertEqual(result.price_index_codes, ["WTI_CUSHING_D"])
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].price_index_code, "WTI_CUSHING_D")
        self.assertEqual(observations[0].observation_date, date(2026, 4, 15))
        self.assertEqual(observations[0].value, Decimal("84.250000"))
        self.assertEqual(observations[0].currency_code, "USD")
        self.assertEqual(observations[0].unit_code, "BBL")
        self.assertEqual(observations[0].source_provider, "EIA")
        self.assertEqual(observations[0].source_series_id, "PET.RWTC.D")
        self.assertEqual({link.record_type for link in links}, {"PRICE_INDEX", "PRICE_INDEX_OBSERVATION"})
        self.assertEqual({link.source for link in links}, {"DOCUMENT_WORKFLOW"})
        self.assertEqual(len(activity_events), 1)
        self.assertEqual(activity_events[0].payload["workflow_id"], "process_prices")
        self.assertEqual(activity_events[0].payload["observation_count"], 1)

    def test_execute_process_prices_is_idempotent_for_matching_document_rows(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(session)
            document = self._seed_verified_document(session)
            session.commit()

            first_result = execute_document_workflow(
                session,
                document_id=document.document_id,
                workflow_id="process_prices",
                actor_id="tester",
            )
            session.commit()
            second_result = execute_document_workflow(
                session,
                document_id=document.document_id,
                workflow_id="process_prices",
                actor_id="tester",
            )
            session.commit()

            observations = session.execute(select(PriceIndexObservation)).scalars().all()

        self.assertEqual(first_result.created_count, 1)
        self.assertEqual(second_result.created_count, 0)
        self.assertEqual(second_result.updated_count, 0)
        self.assertEqual(second_result.unchanged_count, 1)
        self.assertEqual(len(observations), 1)


if __name__ == "__main__":
    unittest.main()
