from __future__ import annotations

import enum
import io
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.deps.db import get_db
from apps.api.app.domains.documents.services.ingestion import classify_document_page
from apps.api.app.domains.documents.services.ingestion import extract_document_header_fields
from apps.api.app.domains.documents.services.ingestion import extract_document_table_blocks
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class DocumentIngestionApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

        cls.original_session_factory = app.state.session_factory
        app.state.session_factory = cls.SessionLocal

        def _get_test_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _get_test_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        app.state.session_factory = cls.original_session_factory
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        self._previous_bootstrap_admin_token = settings.BOOTSTRAP_ADMIN_TOKEN
        self._previous_document_storage_root = settings.DOCUMENT_STORAGE_ROOT
        self._previous_document_max_upload_bytes = settings.DOCUMENT_MAX_UPLOAD_BYTES
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"
        settings.DOCUMENT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
        self._storage_tempdir = tempfile.TemporaryDirectory()
        settings.DOCUMENT_STORAGE_ROOT = Path(self._storage_tempdir.name)

        with self.SessionLocal() as session:
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()

    def tearDown(self) -> None:
        settings.BOOTSTRAP_ADMIN_TOKEN = self._previous_bootstrap_admin_token
        settings.DOCUMENT_STORAGE_ROOT = self._previous_document_storage_root
        settings.DOCUMENT_MAX_UPLOAD_BYTES = self._previous_document_max_upload_bytes
        self._storage_tempdir.cleanup()

    def _bootstrap_admin(self) -> str:
        response = self.client.post(
            "/auth/bootstrap-admin",
            json={
                "bootstrap_token": "bootstrap-secret",
                "user_id": "doc_admin",
                "email": "documents@example.com",
                "display_name": "Documents Admin",
                "password": "supersecret1",
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["access_token"]

    def _build_pdf_bytes(self, *, page_count: int = 2) -> bytes:
        writer = PdfWriter()
        for _index in range(page_count):
            writer.add_blank_page(width=612, height=792)
        buffer = io.BytesIO()
        writer.write(buffer)
        return buffer.getvalue()

    def _upload_document(self, admin_token: str, *, filename: str = "invoice-batch.pdf", page_count: int = 1) -> dict[str, object]:
        response = self.client.post(
            "/documents/uploads",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": (filename, self._build_pdf_bytes(page_count=page_count), "application/pdf")},
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def _wait_for_document(self, admin_token: str, document_id: str, *, max_attempts: int = 40) -> dict[str, object]:
        latest_payload: dict[str, object] | None = None
        for _attempt in range(max_attempts):
            response = self.client.get(
                f"/documents/{document_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            self.assertEqual(response.status_code, 200)
            latest_payload = response.json()
            if latest_payload["status"] in {"ANALYZED", "FAILED"}:
                return latest_payload
            time.sleep(0.01)

        self.fail(f"Document '{document_id}' did not finish processing in time. Last payload: {latest_payload}")

    def test_upload_pdf_creates_document_and_page_records(self) -> None:
        admin_token = self._bootstrap_admin()
        payload = self._build_pdf_bytes(page_count=2)

        response = self.client.post(
            "/documents/uploads",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("invoice-batch.pdf", payload, "application/pdf")},
            data={"display_name": "April Invoice Batch"},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["display_name"], "April Invoice Batch")
        self.assertEqual(body["page_count"], 2)
        self.assertIn(body["status"], {"UPLOADED", "PROCESSING", "ANALYZED"})
        self.assertEqual(len(body["pages"]), 2)

        analyzed = self._wait_for_document(admin_token, body["document_id"])
        self.assertEqual(analyzed["status"], "ANALYZED")
        self.assertEqual(analyzed["analysis_summary"]["dominant_document_kind"], "INVOICE")
        self.assertEqual(len(analyzed["pages"]), 2)
        self.assertTrue(all(page["document_kind"] == "INVOICE" for page in analyzed["pages"]))
        self.assertTrue(all("OCR may be required" in " ".join(page["processing_warnings"]) for page in analyzed["pages"]))
        self.assertTrue(all(page["preview_available"] for page in analyzed["pages"]))
        self.assertTrue(all(page["text_source"] == "none" for page in analyzed["pages"]))

        list_response = self.client.get(
            "/documents",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.json()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["document_id"], body["document_id"])

        stored_paths = list(settings.DOCUMENT_STORAGE_ROOT.rglob("*.pdf"))
        self.assertEqual(len(stored_paths), 1)
        self.assertEqual(stored_paths[0].read_bytes(), payload)

        with self.SessionLocal() as session:
            document = session.get(DocumentIngestion, body["document_id"])
            self.assertIsNotNone(document)
            pages = (
                session.query(DocumentIngestionPage)
                .filter(DocumentIngestionPage.document_id == body["document_id"])
                .order_by(DocumentIngestionPage.page_number)
                .all()
            )
            self.assertEqual(len(pages), 2)
            self.assertEqual(pages[0].document_kind, "INVOICE")
            self.assertEqual(document.review_status, "UNREVIEWED")
            self.assertEqual(pages[0].review_status, "UNREVIEWED")

    def test_upload_requires_pdf(self) -> None:
        admin_token = self._bootstrap_admin()
        response = self.client.post(
            "/documents/uploads",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("not-a-pdf.txt", b"hello", "text/plain")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("PDF", response.json()["detail"])

    def test_page_preview_endpoint_returns_rendered_png(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        page = document["pages"][0]

        response = self.client.get(
            f"/documents/{document['document_id']}/pages/{page['page_id']}/preview",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("image/png", response.headers["content-type"])
        self.assertTrue(response.content.startswith(b"\x89PNG\r\n\x1a\n"))

    def test_ocr_fallback_is_used_when_native_text_is_missing(self) -> None:
        admin_token = self._bootstrap_admin()

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            return_value=(None, []),
        ), patch(
            "apps.api.app.domains.documents.services.ingestion._pixmap_has_visible_content",
            return_value=True,
        ), patch(
            "apps.api.app.domains.documents.services.ingestion._extract_text_from_rendered_page",
            return_value=(
                "\n".join(
                    [
                        "INVOICE",
                        "Invoice Number: INV-9001",
                        "Invoice Date: 2026-04-06",
                        "Due Date: 2026-04-15",
                        "Counterparty: Shell Trading",
                        "Total Amount: 79250",
                        "",
                        "Description  Quantity  Amount",
                        "WTI April  1000  79250",
                    ]
                ),
                [],
            ),
        ):
            uploaded = self._upload_document(admin_token, page_count=1)
            document = self._wait_for_document(admin_token, uploaded["document_id"])

        page = document["pages"][0]
        self.assertEqual(page["text_source"], "ocr")
        self.assertEqual(page["document_kind"], "INVOICE")
        self.assertTrue(page["preview_available"])
        self.assertTrue(any(field["field_key"] == "invoice_number" for field in page["header_fields"]))
        self.assertTrue(any(table["source"].startswith("ocr:") for table in page["table_blocks"]))

    def test_heuristics_extract_fields_and_multiple_table_blocks(self) -> None:
        text = """
        INVOICE
        Invoice Number: INV-1007
        Due Date: 2026-04-15

        Product  Qty  Amount
        WTI  1000  79250
        Brent  250  20150

        Fee  Rate
        Terminal  1250
        """
        classification = classify_document_page("invoice-1007.pdf", text)
        self.assertEqual(classification.document_kind, "INVOICE")

        header_fields = extract_document_header_fields(classification.document_kind, text)
        self.assertTrue(any(field["field_key"] == "invoice_number" for field in header_fields))
        self.assertTrue(any(field["field_key"] == "due_date" for field in header_fields))

        table_blocks = extract_document_table_blocks(text)
        self.assertEqual(len(table_blocks), 2)
        self.assertEqual(table_blocks[0]["columns"], ["product", "qty", "amount"])
        self.assertEqual(table_blocks[1]["rows"][0]["fee"], "Terminal")

    def test_schema_registry_exposes_supported_document_contracts(self) -> None:
        admin_token = self._bootstrap_admin()
        response = self.client.get(
            "/documents/schema-registry",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["version"])
        kinds = {entry["document_kind"]: entry for entry in body["document_kinds"]}
        self.assertIn("INVOICE", kinds)
        self.assertTrue(any(field["field_key"] == "invoice_number" for field in kinds["INVOICE"]["header_fields"]))
        self.assertTrue(any(template["template_key"] == "line_items" for template in kinds["INVOICE"]["table_templates"]))

    def test_page_review_requires_required_fields_and_template_columns(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        page = document["pages"][0]

        missing_required_response = self.client.patch(
            f"/documents/{document['document_id']}/pages/{page['page_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "document_kind": "INVOICE",
                "header_fields": [
                    {"field_key": "invoice_number", "value": "INV-9001"},
                ],
                "table_blocks": [],
                "review_status": "REVIEWED",
            },
        )
        self.assertEqual(missing_required_response.status_code, 422)
        self.assertIn("Missing required fields", missing_required_response.json()["detail"])

        invalid_table_response = self.client.patch(
            f"/documents/{document['document_id']}/pages/{page['page_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "document_kind": "INVOICE",
                "header_fields": [
                    {"field_key": "invoice_number", "value": "INV-9001"},
                    {"field_key": "invoice_date", "value": "2026-04-06"},
                    {"field_key": "due_date", "value": "2026-04-15"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "79250"},
                ],
                "table_blocks": [
                    {
                        "template_key": "line_items",
                        "columns": ["description", "quantity"],
                        "rows": [{"description": "WTI", "quantity": "1000"}],
                    }
                ],
                "review_status": "REVIEWED",
            },
        )
        self.assertEqual(invalid_table_response.status_code, 422)
        self.assertIn("missing required columns", invalid_table_response.json()["detail"])

    def test_reviewed_page_can_be_saved_and_document_can_be_verified(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        page = document["pages"][0]

        premature_verify_response = self.client.patch(
            f"/documents/{document['document_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"review_status": "VERIFIED"},
        )
        self.assertEqual(premature_verify_response.status_code, 422)
        self.assertIn("All pages must be reviewed", premature_verify_response.json()["detail"])

        page_response = self.client.patch(
            f"/documents/{document['document_id']}/pages/{page['page_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "document_kind": "INVOICE",
                "document_subtype": "SALES",
                "header_fields": [
                    {"field_key": "invoice_number", "value": "INV-9001"},
                    {"field_key": "invoice_date", "value": "2026-04-06"},
                    {"field_key": "due_date", "value": "2026-04-15"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "79250"},
                    {"field_key": "trade_id", "value": "T-INV-9001"},
                ],
                "table_blocks": [
                    {
                        "template_key": "line_items",
                        "title": "Charges",
                        "columns": ["description", "quantity", "line_amount"],
                        "rows": [
                            {"description": "WTI April", "quantity": "1000", "line_amount": "79250"},
                        ],
                    }
                ],
                "review_status": "REVIEWED",
                "review_notes": "Validated against the desk copy.",
            },
        )
        self.assertEqual(page_response.status_code, 200)
        page_body = page_response.json()["pages"][0]
        self.assertEqual(page_body["review_status"], "REVIEWED")
        self.assertEqual(page_body["document_kind"], "INVOICE")
        self.assertEqual(page_body["table_blocks"][0]["template_key"], "line_items")
        self.assertEqual(page_response.json()["review_status"], "IN_REVIEW")

        verify_response = self.client.patch(
            f"/documents/{document['document_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "review_status": "VERIFIED",
                "review_notes": "Ready for downstream matching.",
            },
        )
        self.assertEqual(verify_response.status_code, 200)
        verify_body = verify_response.json()
        self.assertEqual(verify_body["review_status"], "VERIFIED")
        self.assertEqual(verify_body["reviewed_by"], "doc_admin")
        self.assertTrue(verify_body["analysis_summary"]["review_ready"])

    def test_reprocess_resets_review_state_and_reanalyzes_document(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        page = document["pages"][0]

        page_response = self.client.patch(
            f"/documents/{document['document_id']}/pages/{page['page_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "document_kind": "INVOICE",
                "header_fields": [
                    {"field_key": "invoice_number", "value": "INV-9001"},
                    {"field_key": "invoice_date", "value": "2026-04-06"},
                    {"field_key": "due_date", "value": "2026-04-15"},
                    {"field_key": "counterparty", "value": "Shell Trading"},
                    {"field_key": "total_amount", "value": "79250"},
                ],
                "table_blocks": [
                    {
                        "template_key": "line_items",
                        "columns": ["description", "quantity", "line_amount"],
                        "rows": [{"description": "WTI April", "quantity": "1000", "line_amount": "79250"}],
                    }
                ],
                "review_status": "REVIEWED",
                "review_notes": "Checked before reprocess.",
            },
        )
        self.assertEqual(page_response.status_code, 200)
        reviewed = page_response.json()
        self.assertEqual(reviewed["pages"][0]["review_status"], "REVIEWED")

        reprocess_response = self.client.post(
            f"/documents/{document['document_id']}/reprocess",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        self.assertEqual(reprocess_response.status_code, 202)
        reprocess_body = reprocess_response.json()
        self.assertEqual(reprocess_body["status"], "UPLOADED")
        self.assertEqual(reprocess_body["review_status"], "UNREVIEWED")
        self.assertEqual(reprocess_body["pages"][0]["review_status"], "UNREVIEWED")
        self.assertEqual(reprocess_body["pages"][0]["document_kind"], "UNKNOWN")
        self.assertEqual(reprocess_body["pages"][0]["header_fields"], [])

        reanalyzed = self._wait_for_document(admin_token, document["document_id"])
        self.assertEqual(reanalyzed["status"], "ANALYZED")
        self.assertEqual(reanalyzed["review_status"], "UNREVIEWED")
        self.assertEqual(reanalyzed["pages"][0]["review_status"], "UNREVIEWED")
        self.assertEqual(reanalyzed["pages"][0]["document_kind"], "INVOICE")

        with self.SessionLocal() as session:
            stored_document = session.get(DocumentIngestion, document["document_id"])
            stored_page = session.get(DocumentIngestionPage, page["page_id"])
            self.assertEqual(stored_document.review_status, "UNREVIEWED")
            self.assertIsNone(stored_document.reviewed_by)
            self.assertEqual(stored_page.review_status, "UNREVIEWED")
            self.assertIsNone(stored_page.reviewed_by)
