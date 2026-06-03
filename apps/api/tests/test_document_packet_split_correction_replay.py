from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    PACKET_SPLIT_CORRECTION_EVENT_TYPE,
)
from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    build_packet_split_correction_payload,
)
from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    build_packet_split_correction_replay_suite,
)
from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    evaluate_packet_split_correction_replay_suite,
)
from apps.api.app.models import Base
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event
from apps.api.scripts.run_document_packet_split_correction_replay import main as replay_main
from apps.api.tests.document_packet_split_eval_harness import (
    evaluate_document_packet_split_correction_eval_corpus,
)
from apps.api.tests.document_packet_split_eval_harness import (
    format_document_packet_split_correction_eval_report,
)
from apps.api.tests.document_packet_split_eval_harness import (
    load_document_packet_split_correction_eval_corpus,
)


class DocumentPacketSplitCorrectionReplayTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=self.engine)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_seed_packet_split_correction_corpus_replays_expected_results(self) -> None:
        corpus = load_document_packet_split_correction_eval_corpus()
        summary = evaluate_document_packet_split_correction_eval_corpus()

        self.assertEqual(corpus["suite_version"], "document-packet-split-corrections-v1")
        self.assertEqual(len(corpus["cases"]), 3)
        self.assertTrue(summary["passed"])
        self.assertEqual(summary["total_case_count"], 3)
        self.assertEqual(summary["exact_match_count"], 3)
        self.assertEqual(summary["mismatch_count"], 0)
        self.assertGreaterEqual(summary["changed_field_counts"]["page_membership"], 3)
        self.assertEqual(summary["issue_category_counts"], {})

    def test_packet_split_replay_report_groups_mismatches_by_cause(self) -> None:
        corpus = load_document_packet_split_correction_eval_corpus()
        broken_corpus = json.loads(json.dumps(corpus))
        broken_corpus["cases"][0]["expected_logical_documents"][1]["page_numbers"] = [3]
        broken_corpus["cases"][0]["expected_logical_documents"][1]["shared_page_numbers"] = []

        summary = evaluate_packet_split_correction_replay_suite(broken_corpus)
        report = format_document_packet_split_correction_eval_report(summary)

        self.assertFalse(summary["passed"])
        self.assertEqual(summary["mismatch_count"], 1)
        self.assertEqual(summary["issue_category_counts"]["page_membership"], 1)
        self.assertEqual(summary["issue_category_counts"]["shared_page"], 1)
        self.assertIn("Mismatches by cause:", report)
        self.assertIn("- page_membership: 1", report)
        self.assertIn("- shared_page: 1", report)

    def test_captured_corrections_export_and_replay_against_detector(self) -> None:
        with self.SessionLocal() as session:
            event_id = self._seed_shared_boundary_correction(session)

            suite = build_packet_split_correction_replay_suite(session, limit=10)
            summary = evaluate_packet_split_correction_replay_suite(suite)

        self.assertEqual(suite["summary"]["event_count"], 1)
        self.assertEqual(suite["summary"]["case_count"], 1)
        self.assertEqual(suite["summary"]["skipped_event_count"], 0)
        case = suite["cases"][0]
        self.assertEqual(case["correction_event_id"], event_id)
        self.assertEqual(case["expected_shared_page_numbers"], [2])
        self.assertEqual(case["expected_logical_documents"][1]["page_numbers"], [2, 3])
        self.assertIn("raw_text_sha256", case["pages"][0])

        self.assertTrue(summary["passed"])
        self.assertEqual(summary["total_case_count"], 1)
        self.assertEqual(summary["exact_match_count"], 1)
        self.assertEqual(summary["mismatch_count"], 0)
        self.assertEqual(summary["results"][0]["actual_shared_page_numbers"], [2])

    def test_replay_script_writes_fixture_and_eval_summary(self) -> None:
        with self.SessionLocal() as session:
            event_id = self._seed_shared_boundary_correction(session)

        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_path = Path(temp_dir) / "packet-split-corrections.json"
            summary_path = Path(temp_dir) / "packet-split-summary.json"
            with patch(
                "apps.api.scripts.run_document_packet_split_correction_replay.SessionLocal",
                self.SessionLocal,
            ):
                exit_code = replay_main(
                    [
                        "--output",
                        str(fixture_path),
                        "--json-output",
                        str(summary_path),
                        "--limit",
                        "10",
                        "--check",
                    ]
                )

            self.assertEqual(exit_code, 0)
            fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
            self.assertEqual(fixture["cases"][0]["correction_event_id"], event_id)
            self.assertEqual(fixture["cases"][0]["expected_shared_page_numbers"], [2])
            self.assertTrue(summary["passed"])
            self.assertEqual(summary["exact_match_count"], 1)

    def _seed_shared_boundary_correction(self, session) -> str:
        now = datetime(2026, 5, 29, 12, 0, tzinfo=timezone.utc)
        document = DocumentIngestion(
            document_id="DOC-PACKET-CORRECTION-1",
            original_filename="shared-boundary-packet.pdf",
            display_name="shared-boundary-packet",
            content_type="application/pdf",
            storage_key="documents/DOC-PACKET-CORRECTION-1.pdf",
            sha256="2" * 64,
            size_bytes=4096,
            page_count=3,
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
        session.add(document)
        pages = [
            DocumentIngestionPage(
                document_id=document.document_id,
                page_number=1,
                classification_status="ANALYZED",
                extraction_status="ANALYZED",
                document_kind="BILL_OF_LADING",
                document_subtype=None,
                classification_confidence=0.93,
                classification_payload={"text_source": "pdf_text"},
                header_fields=[],
                table_blocks=[],
                raw_text="\n".join(
                    [
                        "Bill of Lading",
                        "Bill of Lading Number: BOL-REPLAY-1",
                        "Carrier: Acme Logistics",
                        "Origin: HOUSTON",
                        "Destination: NEW ORLEANS",
                    ]
                ),
                processing_warnings=[],
                processing_errors=[],
                review_status="UNREVIEWED",
                review_notes=None,
                reviewed_at=None,
                reviewed_by=None,
                processed_at=now,
                created_at=now,
                updated_at=now,
            ),
            DocumentIngestionPage(
                document_id=document.document_id,
                page_number=2,
                classification_status="ANALYZED",
                extraction_status="ANALYZED",
                document_kind="BILL_OF_LADING",
                document_subtype=None,
                classification_confidence=0.91,
                classification_payload={"text_source": "pdf_text"},
                header_fields=[],
                table_blocks=[],
                raw_text="\n".join(
                    [
                        "Bill of Lading",
                        "Bill of Lading Number: BOL-REPLAY-1",
                        "",
                        "Invoice",
                        "Invoice Number: INV-REPLAY-2",
                        "Invoice Date: 2026-05-01",
                        "Total Amount: USD 98000",
                    ]
                ),
                processing_warnings=[],
                processing_errors=[],
                review_status="UNREVIEWED",
                review_notes=None,
                reviewed_at=None,
                reviewed_by=None,
                processed_at=now,
                created_at=now,
                updated_at=now,
            ),
            DocumentIngestionPage(
                document_id=document.document_id,
                page_number=3,
                classification_status="ANALYZED",
                extraction_status="ANALYZED",
                document_kind="INVOICE",
                document_subtype=None,
                classification_confidence=0.94,
                classification_payload={"text_source": "pdf_text"},
                header_fields=[],
                table_blocks=[],
                raw_text="\n".join(
                    [
                        "Invoice",
                        "Invoice Number: INV-REPLAY-2",
                        "Invoice Date: 2026-05-01",
                        "Total Amount: USD 98000",
                    ]
                ),
                processing_warnings=[],
                processing_errors=[],
                review_status="UNREVIEWED",
                review_notes=None,
                reviewed_at=None,
                reviewed_by=None,
                processed_at=now,
                created_at=now,
                updated_at=now,
            ),
        ]
        session.add_all(pages)
        session.flush()

        system_snapshot = [
            self._snapshot(
                document=document,
                sequence_number=1,
                document_kind="BILL_OF_LADING",
                pages=[pages[0], pages[1]],
                source="system_page_classification",
            ),
            self._snapshot(
                document=document,
                sequence_number=2,
                document_kind="INVOICE",
                pages=[pages[2]],
                source="system_page_classification",
            ),
        ]
        accepted_snapshot = [
            self._snapshot(
                document=document,
                sequence_number=1,
                document_kind="BILL_OF_LADING",
                pages=[pages[0], pages[1]],
                source="human_packet_split",
                shared_page_numbers=[2],
            ),
            self._snapshot(
                document=document,
                sequence_number=2,
                document_kind="INVOICE",
                pages=[pages[1], pages[2]],
                source="human_packet_split",
                shared_page_numbers=[2],
            ),
        ]
        payload = build_packet_split_correction_payload(
            document=document,
            pages=pages,
            system_snapshot=system_snapshot,
            accepted_snapshot=accepted_snapshot,
        )
        self.assertIsNotNone(payload)
        event_id = "EVT-PACKET-CORRECTION-1"
        session.add(
            Event(
                event_id=event_id,
                aggregate_type="document",
                aggregate_id=document.document_id,
                event_type=PACKET_SPLIT_CORRECTION_EVENT_TYPE,
                occurred_at=now,
                recorded_at=now,
                actor_id="doc_admin",
                correlation_id=None,
                causation_id=None,
                schema_version=1,
                payload=payload,
            )
        )
        session.commit()
        return event_id

    def _snapshot(
        self,
        *,
        document: DocumentIngestion,
        sequence_number: int,
        document_kind: str,
        pages: list[DocumentIngestionPage],
        source: str,
        shared_page_numbers: list[int] | None = None,
    ) -> dict[str, object]:
        page_numbers = [page.page_number for page in pages]
        page_ids = [page.page_id for page in pages]
        logical_document_key = f"LD-{sequence_number:03d}"
        return {
            "logical_document_id": f"{document.document_id}:{logical_document_key}",
            "logical_document_key": logical_document_key,
            "sequence_number": sequence_number,
            "document_kind": document_kind,
            "document_subtype": None,
            "page_start": min(page_numbers),
            "page_end": max(page_numbers),
            "page_count": len(page_numbers),
            "classification_status": "ANALYZED",
            "classification_confidence": 0.92,
            "review_status": "UNREVIEWED",
            "page_memberships": [
                {
                    "page_id": page.page_id,
                    "page_number": page.page_number,
                    "sequence_number": index,
                    "span_type": "FULL_PAGE",
                }
                for index, page in enumerate(pages, start=1)
            ],
            "provenance": {
                "source": source,
                "split_strategy": "operator_reviewed_membership"
                if source == "human_packet_split"
                else "contiguous_page_classification_run",
                "split_confidence": 1.0 if source == "human_packet_split" else 0.68,
                "split_evidence": [
                    {
                        "type": "operator_reviewed_membership"
                        if source == "human_packet_split"
                        else "contiguous_page_classification",
                        "confidence": 1.0 if source == "human_packet_split" else 0.68,
                        "summary": "Operator accepted this membership."
                        if source == "human_packet_split"
                        else "Previous system grouping.",
                        "page_numbers": page_numbers,
                        "document_kind": document_kind,
                    }
                ],
                "source_file_id": document.document_id,
                "source_page_numbers": page_numbers,
                "source_page_ids": page_ids,
                "page_range": {"start": min(page_numbers), "end": max(page_numbers)},
                "shared_page_numbers": shared_page_numbers or [],
            },
        }


if __name__ == "__main__":
    unittest.main()
