from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models import Base
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.scripts.export_document_classification_replay_fixture import (
    main as export_replay_fixture_main,
)
from apps.api.tests.document_classification_eval_harness import (
    build_reviewed_document_classification_eval_corpus,
)
from apps.api.tests.document_classification_eval_harness import (
    evaluate_document_classification_corpus,
)
from apps.api.tests.document_classification_eval_harness import (
    load_document_classification_eval_corpus,
)


class DocumentClassificationEvalTests(unittest.TestCase):
    def test_seed_document_classification_corpus_replays_expected_results(self) -> None:
        corpus = load_document_classification_eval_corpus()
        summary = evaluate_document_classification_corpus()

        self.assertEqual(summary.corpus_version, corpus.corpus_version)
        self.assertEqual(summary.total_case_count, len(corpus.cases))
        self.assertEqual(summary.passed_case_count, summary.total_case_count)
        self.assertGreaterEqual(summary.kind_accuracy, corpus.thresholds.min_kind_accuracy)
        self.assertLessEqual(summary.false_confidence_count, corpus.thresholds.max_false_confidence_count)
        self.assertLessEqual(
            summary.review_false_negative_count,
            corpus.thresholds.max_review_false_negative_count,
        )
        self.assertLessEqual(
            summary.abstain_false_negative_count,
            corpus.thresholds.max_abstain_false_negative_count,
        )
        self.assertLessEqual(
            summary.low_confidence_false_negative_count,
            corpus.thresholds.max_low_confidence_false_negative_count,
        )
        self.assertGreaterEqual(summary.review_recommendation_accuracy, 1.0)
        self.assertGreaterEqual(summary.abstain_accuracy, 1.0)
        self.assertGreaterEqual(summary.low_confidence_accuracy, 1.0)
        self.assertGreaterEqual(len(summary.covered_document_kinds), 8)
        self.assertIn("INVOICE", summary.covered_document_kinds)
        self.assertIn("UNKNOWN", summary.covered_document_kinds)
        self.assertIn("OTHER", summary.covered_document_kinds)
        self.assertTrue(any(metric.document_kind == "INVOICE" for metric in summary.kind_metrics))
        self.assertIn("INVOICE", summary.confusion_matrix)
        self.assertTrue(summary.passed, "seed classification corpus should replay without regressions")

    def test_reviewed_document_export_builds_sanitized_replay_cases(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=engine)
        now = datetime.now(timezone.utc)

        with SessionLocal() as session:
            document = DocumentIngestion(
                document_id="DOC-EVAL-1",
                original_filename="Shell Confidential Invoice.pdf",
                display_name="Shell Confidential Invoice",
                content_type="application/pdf",
                storage_key="documents/DOC-EVAL-1.pdf",
                sha256="0" * 64,
                size_bytes=2048,
                page_count=1,
                status="ANALYZED",
                processor_provider="builtin",
                processor_model=None,
                classifier_version="deterministic-v1",
                extractor_version="regex-v2-preview-ocr",
                analysis_summary={},
                processing_errors=[],
                review_status="IN_REVIEW",
                review_notes=None,
                reviewed_at=None,
                reviewed_by=None,
                created_at=now,
                created_by="seed",
                updated_at=now,
                updated_by="seed",
                version=1,
            )
            page = DocumentIngestionPage(
                document_id=document.document_id,
                page_number=1,
                classification_status="ANALYZED",
                extraction_status="ANALYZED",
                document_kind="INVOICE",
                document_subtype=None,
                classification_confidence=1.0,
                classification_payload={
                    "text_source": "pdf_text",
                    "classification_corrected": True,
                    "image_has_visible_content": True,
                },
                header_fields=[
                    {"field_key": "invoice_number", "label": "Invoice Number", "value": "SHELL-INV-991"},
                    {"field_key": "counterparty", "label": "Counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "label": "Total Amount", "value": "99250"},
                ],
                table_blocks=[
                    {
                        "columns": ["description", "quantity", "line_amount"],
                        "rows": [{"description": "ULSD", "quantity": "1000", "line_amount": "99250"}],
                    }
                ],
                raw_text="Invoice Number: SHELL-INV-991\nCounterparty: Shell Trading\nTotal Amount: 99250",
                processing_warnings=[],
                processing_errors=[],
                review_status="REVIEWED",
                review_notes="Corrected by operator.",
                reviewed_at=now,
                reviewed_by="doc_admin",
                processed_at=now,
                created_at=now,
                updated_at=now,
            )
            session.add(document)
            session.add(page)
            session.commit()

            corpus = build_reviewed_document_classification_eval_corpus(
                session,
                limit=10,
                only_corrected=True,
            )

        self.assertEqual(corpus.corpus_version, "document-classification-reviewed-replay-v1")
        self.assertEqual(len(corpus.cases), 1)
        case = corpus.cases[0]
        self.assertEqual(case.filename, "reviewed-document-0001.pdf")
        self.assertEqual(case.expectations.expected_document_kind, "INVOICE")
        self.assertTrue(case.expectations.expect_review_recommended)
        self.assertFalse(case.expectations.expect_abstain)
        self.assertTrue(case.expectations.expect_low_confidence)
        self.assertIn("Invoice Number: <identifier>", case.raw_text or "")
        self.assertIn("Counterparty: <party>", case.raw_text or "")
        self.assertNotIn("Shell Trading", case.raw_text or "")

    def test_export_script_writes_reviewed_replay_fixture(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=engine)
        now = datetime.now(timezone.utc)

        with SessionLocal() as session:
            document = DocumentIngestion(
                document_id="DOC-EVAL-2",
                original_filename="Trade Confirmation.pdf",
                display_name="Trade Confirmation",
                content_type="application/pdf",
                storage_key="documents/DOC-EVAL-2.pdf",
                sha256="1" * 64,
                size_bytes=1024,
                page_count=1,
                status="ANALYZED",
                processor_provider="builtin",
                processor_model=None,
                classifier_version="deterministic-v1",
                extractor_version="regex-v2-preview-ocr",
                analysis_summary={},
                processing_errors=[],
                review_status="IN_REVIEW",
                review_notes=None,
                reviewed_at=None,
                reviewed_by=None,
                created_at=now,
                created_by="seed",
                updated_at=now,
                updated_by="seed",
                version=1,
            )
            page = DocumentIngestionPage(
                document_id=document.document_id,
                page_number=1,
                classification_status="ANALYZED",
                extraction_status="ANALYZED",
                document_kind="TRADE_CONFIRMATION",
                document_subtype=None,
                classification_confidence=1.0,
                classification_payload={"text_source": "pdf_text", "classification_corrected": False},
                header_fields=[
                    {"field_key": "confirmation_number", "label": "Confirmation Number", "value": "CONF-2201"},
                    {"field_key": "trade_id", "label": "Trade ID", "value": "T-2201"},
                    {"field_key": "trade_date", "label": "Trade Date", "value": "2026-04-08"},
                ],
                table_blocks=[],
                raw_text="Confirmation Number: CONF-2201",
                processing_warnings=[],
                processing_errors=[],
                review_status="REVIEWED",
                review_notes=None,
                reviewed_at=now,
                reviewed_by="doc_admin",
                processed_at=now,
                created_at=now,
                updated_at=now,
            )
            session.add(document)
            session.add(page)
            session.commit()

            with tempfile.TemporaryDirectory() as temp_dir:
                output_path = Path(temp_dir) / "reviewed-replay.json"
                with patch("apps.api.scripts.export_document_classification_replay_fixture.SessionLocal", SessionLocal):
                    exit_code = export_replay_fixture_main(
                        [
                            "--output",
                            str(output_path),
                            "--limit",
                            "10",
                            "--min-kind-accuracy",
                            "0.8",
                        ]
                    )

                self.assertEqual(exit_code, 0)
                payload = output_path.read_text(encoding="utf-8")
                self.assertIn('"corpus_version": "document-classification-reviewed-replay-v1"', payload)
                self.assertIn('"expected_document_kind": "TRADE_CONFIRMATION"', payload)
                self.assertIn('"min_kind_accuracy": 0.8', payload)


if __name__ == "__main__":
    unittest.main()
