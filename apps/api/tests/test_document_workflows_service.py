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
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_record_link import DocumentRecordLink
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex


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
            session.query(DocumentRecordLink).delete()
            session.query(PriceIndexObservation).delete()
            session.query(ExternalDataRun).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
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
            header_fields=[
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

    def test_workflow_registry_assigns_process_prices_to_price_publication_report(self) -> None:
        with self.SessionLocal() as session:
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
        self.assertEqual([workflow.workflow_id for workflow in price_workflows.workflows], ["process_prices"])
        self.assertEqual(price_workflows.workflows[0].label, "Process Prices")
        self.assertEqual(invoice_workflows.workflows, [])
        self.assertEqual(invoice_workflows.empty_message, "No workflows assigned to this document type.")

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
