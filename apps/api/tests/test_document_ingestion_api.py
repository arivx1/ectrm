from __future__ import annotations

import enum
import io
import json
import tempfile
import time
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import httpx

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
from apps.api.app.domains.documents.services.document_processor import _build_openai_text_format
from apps.api.app.domains.documents.services.document_processor import _generate_openai_document_analysis
from apps.api.app.domains.documents.services.document_processor import DocumentProcessorOutcome
from apps.api.app.domains.documents.services.document_processor import DocumentProcessorPageResult
from apps.api.app.domains.documents.services.document_processor import DocumentProcessorProviderConfig
from apps.api.app.domains.documents.services.document_processor import run_document_processor_analysis
from apps.api.app.domains.documents.services.ingestion import classify_document_page
from apps.api.app.domains.documents.services.ingestion import extract_document_header_fields
from apps.api.app.domains.documents.services.ingestion import extract_document_table_blocks
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_record_link import DocumentRecordLink
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


def _httpx_json_response(method: str, url: str, status_code: int, payload: dict[str, object]) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        request=httpx.Request(method, url),
        json=payload,
    )


class _FakeHttpxClient:
    def __init__(
        self,
        *,
        post_responses: list[httpx.Response | Exception] | None = None,
        delete_responses: list[httpx.Response | Exception] | None = None,
    ) -> None:
        self.post_responses = list(post_responses or [])
        self.delete_responses = list(delete_responses or [])
        self.post_calls: list[tuple[str, dict[str, object]]] = []
        self.delete_calls: list[tuple[str, dict[str, object]]] = []

    def __enter__(self) -> _FakeHttpxClient:
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False

    def close(self) -> None:
        return None

    def post(self, url: str, **kwargs: object) -> httpx.Response:
        self.post_calls.append((url, dict(kwargs)))
        if not self.post_responses:
            raise AssertionError(f"Unexpected POST request for {url}")
        response = self.post_responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def delete(self, url: str, **kwargs: object) -> httpx.Response:
        self.delete_calls.append((url, dict(kwargs)))
        if not self.delete_responses:
            raise AssertionError(f"Unexpected DELETE request for {url}")
        response = self.delete_responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


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
        self._previous_document_ai_enabled = settings.DOCUMENT_AI_ENABLED
        self._previous_document_ai_default_provider = settings.DOCUMENT_AI_DEFAULT_PROVIDER
        self._previous_document_ai_openai_model = settings.DOCUMENT_AI_OPENAI_MODEL
        self._previous_document_ai_anthropic_model = settings.DOCUMENT_AI_ANTHROPIC_MODEL
        self._previous_document_ai_google_model = settings.DOCUMENT_AI_GOOGLE_MODEL
        self._previous_document_ai_openai_inline_file_max_bytes = settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES
        self._previous_openai_api_key = settings.OPENAI_API_KEY
        self._previous_openai_model = settings.OPENAI_MODEL
        self._previous_anthropic_api_key = settings.ANTHROPIC_API_KEY
        self._previous_google_api_key = settings.GOOGLE_API_KEY
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"
        settings.DOCUMENT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
        settings.DOCUMENT_AI_ENABLED = True
        settings.DOCUMENT_AI_DEFAULT_PROVIDER = "openai"
        settings.DOCUMENT_AI_OPENAI_MODEL = ""
        settings.DOCUMENT_AI_ANTHROPIC_MODEL = ""
        settings.DOCUMENT_AI_GOOGLE_MODEL = ""
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 8 * 1024 * 1024
        settings.OPENAI_API_KEY = ""
        settings.OPENAI_MODEL = "gpt-5-mini"
        settings.ANTHROPIC_API_KEY = ""
        settings.GOOGLE_API_KEY = ""
        self._storage_tempdir = tempfile.TemporaryDirectory()
        settings.DOCUMENT_STORAGE_ROOT = Path(self._storage_tempdir.name)

        with self.SessionLocal() as session:
            session.query(DocumentRecordLink).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()

    def tearDown(self) -> None:
        settings.BOOTSTRAP_ADMIN_TOKEN = self._previous_bootstrap_admin_token
        settings.DOCUMENT_STORAGE_ROOT = self._previous_document_storage_root
        settings.DOCUMENT_MAX_UPLOAD_BYTES = self._previous_document_max_upload_bytes
        settings.DOCUMENT_AI_ENABLED = self._previous_document_ai_enabled
        settings.DOCUMENT_AI_DEFAULT_PROVIDER = self._previous_document_ai_default_provider
        settings.DOCUMENT_AI_OPENAI_MODEL = self._previous_document_ai_openai_model
        settings.DOCUMENT_AI_ANTHROPIC_MODEL = self._previous_document_ai_anthropic_model
        settings.DOCUMENT_AI_GOOGLE_MODEL = self._previous_document_ai_google_model
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = self._previous_document_ai_openai_inline_file_max_bytes
        settings.OPENAI_API_KEY = self._previous_openai_api_key
        settings.OPENAI_MODEL = self._previous_openai_model
        settings.ANTHROPIC_API_KEY = self._previous_anthropic_api_key
        settings.GOOGLE_API_KEY = self._previous_google_api_key
        self._storage_tempdir.cleanup()

    def _openai_provider_config(self) -> DocumentProcessorProviderConfig:
        return DocumentProcessorProviderConfig(
            provider="openai",
            label="GPT",
            api_key="openai-test-key",
            model="gpt-5-mini",
            base_url="https://api.openai.com/v1",
            configured=True,
            enabled=True,
            is_default=True,
            setup_env_var="OPENAI_API_KEY",
        )

    def _openai_page_payload(
        self,
        *,
        page_number: int,
        document_kind: str = "INVOICE",
        document_subtype: str | None = None,
        confidence: float = 0.95,
        warnings: list[str] | None = None,
    ) -> dict[str, object]:
        return {
            "page_number": page_number,
            "document_kind": document_kind,
            "document_subtype": document_subtype,
            "confidence": confidence,
            "header_fields": [],
            "table_blocks": [],
            "warnings": warnings or [],
        }

    def _openai_completed_response_payload(self, *pages: dict[str, object]) -> dict[str, object]:
        return {
            "status": "completed",
            "output_text": json.dumps({"pages": list(pages)}),
        }

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

    def _build_trade(self, *, trade_id: str, counterparty: str = "Shell Trading") -> Trade:
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
            last_event_id="evt-100",
        )

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
        self.assertEqual(analyzed["analysis_summary"]["routing_strategy"], "SETTLEMENT_FIRST")
        self.assertEqual(analyzed["routing_assessment"]["routing_strategy"], "SETTLEMENT_FIRST")
        self.assertEqual(analyzed["routing_assessment"]["status"], "INSUFFICIENT")
        self.assertEqual(len(analyzed["pages"]), 2)
        self.assertTrue(all(page["document_kind"] == "INVOICE" for page in analyzed["pages"]))
        self.assertTrue(all(page["routing_assessment"]["routing_strategy"] == "SETTLEMENT_FIRST" for page in analyzed["pages"]))
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
        self.assertIn("PIPELINE_STATEMENT", kinds)
        self.assertIn("QUALITY_SPECIFICATION", kinds)
        self.assertTrue(any(field["field_key"] == "invoice_number" for field in kinds["INVOICE"]["header_fields"]))
        self.assertTrue(any(template["template_key"] == "line_items" for template in kinds["INVOICE"]["table_templates"]))
        self.assertEqual(kinds["TRADE_CONFIRMATION"]["document_family"], "TRADE_EXECUTION")
        self.assertIn("trade_id", kinds["TRADE_CONFIRMATION"]["matching_keys"])
        self.assertTrue(any(target["record_type"] == "TRADE" for target in kinds["TRADE_CONFIRMATION"]["record_targets"]))
        self.assertTrue(
            any(target["create_if_missing"] for target in kinds["INVOICE"]["record_targets"] if target["record_type"] == "TRADE_INVOICE")
        )

    def test_trade_shipping_taxonomy_classifies_additional_document_types(self) -> None:
        samples = {
            "pipeline-statement.pdf": (
                "PIPELINE_STATEMENT",
                """
                Pipeline Statement
                Statement Number: PIPE-100
                Pipeline System: NGPL
                Nomination Reference: NOM-7
                """,
            ),
            "truck-ticket.pdf": (
                "TRUCK_TICKET",
                """
                Truck Ticket
                Truck Ticket Number: TT-45
                Carrier: Fleet Hauling
                Load Date: 2026-04-10
                """,
            ),
            "quality-specification.pdf": (
                "QUALITY_SPECIFICATION",
                """
                Quality Specification
                Specification Name: ULSD 10 PPM
                Effective Date: 2026-04-01
                Product: ULSD
                """,
            ),
            "hazmat-sheet.pdf": (
                "HAZARDOUS_CARGO_DOCUMENTATION",
                """
                Safety Data Sheet
                Document Number: SDS-200
                Product: Methanol
                Hazard Class: 3
                """,
            ),
        }

        for filename, (expected_kind, text) in samples.items():
            with self.subTest(filename=filename):
                classification = classify_document_page(filename, text)
                self.assertEqual(classification.document_kind, expected_kind)

    def test_document_processor_settings_report_effective_provider_status(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.GOOGLE_API_KEY = "google-test-key"
        settings.DOCUMENT_AI_DEFAULT_PROVIDER = "anthropic"

        response = self.client.get(
            "/documents/settings",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["enabled"])
        self.assertEqual(payload["default_provider"], "anthropic")
        self.assertEqual(payload["effective_default_provider"], "openai")
        self.assertEqual(payload["configured_provider_count"], 2)

        providers = {row["provider"]: row for row in payload["providers"]}
        self.assertTrue(providers["openai"]["configured"])
        self.assertFalse(providers["anthropic"]["configured"])
        self.assertTrue(providers["anthropic"]["is_default"])
        self.assertEqual(providers["google"]["setup_env_var"], "GOOGLE_API_KEY")

    def test_openai_document_processor_uses_strict_json_schema_format(self) -> None:
        text_format = _build_openai_text_format()

        self.assertEqual(text_format["type"], "json_schema")
        self.assertEqual(text_format["name"], "document_page_analysis")
        self.assertTrue(text_format["strict"])
        self.assertEqual(text_format["schema"]["type"], "object")
        self.assertFalse(text_format["schema"]["additionalProperties"])
        self.assertIn("pages", text_format["schema"]["properties"])

    def test_openai_document_processor_inlines_small_pdf_payloads(self) -> None:
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 512
        provider = self._openai_provider_config()

        with patch(
            "apps.api.app.domains.documents.services.document_processor._upload_openai_input_file",
        ) as upload_mock, patch(
            "apps.api.app.domains.documents.services.document_processor._delete_openai_uploaded_file",
        ) as delete_mock, patch(
            "apps.api.app.domains.documents.services.document_processor._post_json",
            return_value={
                "status": "completed",
                "output_text": json.dumps(
                    {
                        "pages": [
                            {
                                "page_number": 1,
                                "document_kind": "INVOICE",
                                "document_subtype": None,
                                "confidence": 0.95,
                                "header_fields": [],
                                "table_blocks": [],
                                "warnings": [],
                            }
                        ]
                    }
                ),
            },
        ) as post_json_mock:
            result = _generate_openai_document_analysis(
                provider=provider,
                model=provider.model,
                filename="small.pdf",
                payload=b"%PDF-small",
                pages=[object()],
            )

        self.assertEqual(result.pages[0].document_kind, "INVOICE")
        upload_mock.assert_not_called()
        delete_mock.assert_not_called()
        file_input = post_json_mock.call_args.kwargs["payload"]["input"][0]["content"][1]
        self.assertEqual(file_input["type"], "input_file")
        self.assertEqual(file_input["filename"], "small.pdf")
        self.assertTrue(file_input["file_data"].startswith("data:application/pdf;base64,"))

    def test_openai_document_processor_uploads_large_pdf_payloads_and_cleans_up(self) -> None:
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 1
        provider = self._openai_provider_config()

        with patch(
            "apps.api.app.domains.documents.services.document_processor._upload_openai_input_file",
            return_value="file-uploaded",
        ) as upload_mock, patch(
            "apps.api.app.domains.documents.services.document_processor._delete_openai_uploaded_file",
        ) as delete_mock, patch(
            "apps.api.app.domains.documents.services.document_processor._post_json",
            return_value={
                "status": "completed",
                "output_text": json.dumps(
                    {
                        "pages": [
                            {
                                "page_number": 1,
                                "document_kind": "INVOICE",
                                "document_subtype": None,
                                "confidence": 0.95,
                                "header_fields": [],
                                "table_blocks": [],
                                "warnings": [],
                            }
                        ]
                    }
                ),
            },
        ) as post_json_mock:
            result = _generate_openai_document_analysis(
                provider=provider,
                model=provider.model,
                filename="large.pdf",
                payload=b"%PDF-large",
                pages=[object()],
            )

        self.assertEqual(result.pages[0].document_kind, "INVOICE")
        upload_mock.assert_called_once()
        delete_mock.assert_called_once()
        file_input = post_json_mock.call_args.kwargs["payload"]["input"][0]["content"][1]
        self.assertEqual(file_input, {"type": "input_file", "file_id": "file-uploaded"})

    def test_openai_document_processor_cleans_up_uploaded_file_after_request_failure(self) -> None:
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 1
        provider = self._openai_provider_config()

        with patch(
            "apps.api.app.domains.documents.services.document_processor._upload_openai_input_file",
            return_value="file-uploaded",
        ), patch(
            "apps.api.app.domains.documents.services.document_processor._delete_openai_uploaded_file",
        ) as delete_mock, patch(
            "apps.api.app.domains.documents.services.document_processor._post_json",
            side_effect=ValueError("OpenAI request failed."),
        ):
            with self.assertRaisesRegex(ValueError, "OpenAI request failed."):
                _generate_openai_document_analysis(
                    provider=provider,
                    model=provider.model,
                    filename="large.pdf",
                    payload=b"%PDF-large",
                    pages=[object()],
                )

        delete_mock.assert_called_once()

    def test_openai_document_processor_reports_uploaded_file_http_failure(self) -> None:
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 1
        provider = self._openai_provider_config()
        fake_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    "https://api.openai.com/v1/files",
                    400,
                    {"error": {"message": "Upload rejected."}},
                )
            ]
        )

        with patch(
            "apps.api.app.domains.documents.services.document_processor.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaisesRegex(ValueError, "GPT file upload failed: Upload rejected."):
                _generate_openai_document_analysis(
                    provider=provider,
                    model=provider.model,
                    filename="large.pdf",
                    payload=b"%PDF-large",
                    pages=[object()],
                )

        self.assertEqual(len(fake_client.post_calls), 1)
        self.assertEqual(fake_client.post_calls[0][0], "https://api.openai.com/v1/files")
        self.assertEqual(fake_client.delete_calls, [])

    def test_openai_document_processor_reports_incomplete_response_and_cleans_up_uploaded_file(self) -> None:
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 1
        provider = self._openai_provider_config()
        fake_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    "https://api.openai.com/v1/files",
                    200,
                    {"id": "file-uploaded"},
                ),
                _httpx_json_response(
                    "POST",
                    "https://api.openai.com/v1/responses",
                    200,
                    {"status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}},
                ),
            ],
            delete_responses=[
                _httpx_json_response(
                    "DELETE",
                    "https://api.openai.com/v1/files/file-uploaded",
                    200,
                    {"id": "file-uploaded", "deleted": True},
                )
            ],
        )

        with patch(
            "apps.api.app.domains.documents.services.document_processor.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaisesRegex(
                ValueError,
                "GPT returned incomplete structured output. Reason: max_output_tokens.",
            ):
                _generate_openai_document_analysis(
                    provider=provider,
                    model=provider.model,
                    filename="large.pdf",
                    payload=b"%PDF-large",
                    pages=[object()],
                )

        self.assertEqual(len(fake_client.delete_calls), 1)
        self.assertEqual(fake_client.delete_calls[0][0], "https://api.openai.com/v1/files/file-uploaded")

    def test_openai_document_processor_reports_refusal_and_cleans_up_uploaded_file(self) -> None:
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 1
        provider = self._openai_provider_config()
        fake_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    "https://api.openai.com/v1/files",
                    200,
                    {"id": "file-uploaded"},
                ),
                _httpx_json_response(
                    "POST",
                    "https://api.openai.com/v1/responses",
                    200,
                    {
                        "status": "completed",
                        "output": [
                            {
                                "type": "message",
                                "content": [
                                    {
                                        "type": "refusal",
                                        "refusal": "The PDF cannot be processed safely.",
                                    }
                                ],
                            }
                        ],
                    },
                ),
            ],
            delete_responses=[
                _httpx_json_response(
                    "DELETE",
                    "https://api.openai.com/v1/files/file-uploaded",
                    200,
                    {"id": "file-uploaded", "deleted": True},
                )
            ],
        )

        with patch(
            "apps.api.app.domains.documents.services.document_processor.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaisesRegex(
                ValueError,
                "GPT refused the document-processing request: The PDF cannot be processed safely.",
            ):
                _generate_openai_document_analysis(
                    provider=provider,
                    model=provider.model,
                    filename="large.pdf",
                    payload=b"%PDF-large",
                    pages=[object()],
                )

        self.assertEqual(len(fake_client.delete_calls), 1)

    def test_openai_document_processor_succeeds_when_uploaded_file_delete_fails(self) -> None:
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 1
        provider = self._openai_provider_config()
        fake_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    "https://api.openai.com/v1/files",
                    200,
                    {"id": "file-uploaded"},
                ),
                _httpx_json_response(
                    "POST",
                    "https://api.openai.com/v1/responses",
                    200,
                    self._openai_completed_response_payload(self._openai_page_payload(page_number=1)),
                ),
            ],
            delete_responses=[
                _httpx_json_response(
                    "DELETE",
                    "https://api.openai.com/v1/files/file-uploaded",
                    500,
                    {"error": {"message": "Delete failed."}},
                )
            ],
        )

        with patch(
            "apps.api.app.domains.documents.services.document_processor.httpx.Client",
            return_value=fake_client,
        ):
            result = _generate_openai_document_analysis(
                provider=provider,
                model=provider.model,
                filename="large.pdf",
                payload=b"%PDF-large",
                pages=[object()],
            )

        self.assertEqual(result.pages[0].document_kind, "INVOICE")
        self.assertEqual(len(fake_client.delete_calls), 1)

    def test_run_document_processor_analysis_warns_on_duplicate_and_missing_pages(self) -> None:
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 512
        fake_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    "https://api.openai.com/v1/responses",
                    200,
                    self._openai_completed_response_payload(
                        self._openai_page_payload(page_number=1, warnings=["First result."]),
                        self._openai_page_payload(page_number=1, warnings=["Duplicate result."]),
                    ),
                )
            ]
        )

        with patch(
            "apps.api.app.domains.documents.services.document_processor.httpx.Client",
            return_value=fake_client,
        ):
            outcome, warnings = run_document_processor_analysis(
                filename="inline.pdf",
                payload=b"%PDF-inline",
                pages=[object(), object()],
                processor_provider="openai",
            )

        self.assertIsNotNone(outcome)
        assert outcome is not None
        self.assertEqual(len(outcome.pages), 1)
        self.assertEqual(outcome.pages[0].page_number, 1)
        self.assertIn(
            "GPT returned duplicate analysis for page 1; only the first result was applied.",
            warnings,
        )
        self.assertIn(
            "GPT did not return page analysis for pages 2.",
            warnings,
        )

    def test_upload_can_force_built_in_parser_only(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"

        response = self.client.post(
            "/documents/uploads",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("invoice-batch.pdf", self._build_pdf_bytes(page_count=1), "application/pdf")},
            data={"processor_provider": "builtin"},
        )

        self.assertEqual(response.status_code, 201)
        uploaded = response.json()
        self.assertEqual(uploaded["processor_provider"], "builtin")
        self.assertIsNone(uploaded["processor_model"])

        analyzed = self._wait_for_document(admin_token, uploaded["document_id"])
        page = analyzed["pages"][0]
        self.assertEqual(analyzed["processor_provider"], "builtin")
        self.assertIsNone(analyzed["processor_model"])
        self.assertIsNone(analyzed["processor_trace"])
        self.assertIsNone(page["processor_trace"])
        self.assertFalse(page["classification_payload"].get("processor_applied", False))

    def test_reprocess_can_switch_back_to_built_in_parser_only(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"

        fake_processor_outcome = (
            DocumentProcessorOutcome(
                provider="openai",
                model="gpt-5-mini",
                pages=[
                    DocumentProcessorPageResult(
                        page_number=1,
                        document_kind="INVOICE",
                        document_subtype="AI_PASS",
                        confidence=0.97,
                        header_fields=[],
                        table_blocks=[],
                        warnings=["AI result applied."],
                    )
                ],
            ),
            [],
        )

        with patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=fake_processor_outcome,
        ):
            uploaded = self._upload_document(admin_token, page_count=1)
            document = self._wait_for_document(admin_token, uploaded["document_id"])

        self.assertEqual(document["processor_provider"], "openai")
        self.assertEqual(document["pages"][0]["document_subtype"], "AI_PASS")

        reprocess_response = self.client.post(
            f"/documents/{document['document_id']}/reprocess",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"processor_provider": "builtin"},
        )

        self.assertEqual(reprocess_response.status_code, 202)
        reprocess_body = reprocess_response.json()
        self.assertEqual(reprocess_body["processor_provider"], "builtin")
        self.assertIsNone(reprocess_body["processor_model"])

        reanalyzed = self._wait_for_document(admin_token, document["document_id"])
        self.assertEqual(reanalyzed["processor_provider"], "builtin")
        self.assertIsNone(reanalyzed["processor_model"])
        self.assertIsNone(reanalyzed["processor_trace"])
        self.assertIsNone(reanalyzed["pages"][0]["processor_trace"])
        self.assertNotEqual(reanalyzed["pages"][0]["document_subtype"], "AI_PASS")

    def test_upload_can_persist_processor_provider_and_apply_document_ai_result(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"

        fake_processor_outcome = (
            DocumentProcessorOutcome(
                provider="openai",
                model="gpt-5-mini",
                pages=[
                    DocumentProcessorPageResult(
                        page_number=1,
                        document_kind="INVOICE",
                        document_subtype="SALES",
                        confidence=0.97,
                        header_fields=[
                            {
                                "field_key": "invoice_number",
                                "label": "Invoice Number",
                                "value": "INV-9001",
                                "confidence": 0.97,
                                "source": "openai:document_ai",
                            }
                        ],
                        table_blocks=[
                            {
                                "table_index": 1,
                                "template_key": "line_items",
                                "title": "Charges",
                                "columns": ["description", "quantity", "line_amount"],
                                "rows": [
                                    {
                                        "description": "WTI April",
                                        "quantity": "1000",
                                        "line_amount": "79250",
                                    }
                                ],
                                "header_row_detected": True,
                                "source": "openai:document_ai",
                            }
                        ],
                        warnings=["Document AI result applied."],
                    )
                ],
            ),
            [],
        )

        with patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=fake_processor_outcome,
        ):
            response = self.client.post(
                "/documents/uploads",
                headers={"Authorization": f"Bearer {admin_token}"},
                files={"file": ("invoice-batch.pdf", self._build_pdf_bytes(page_count=1), "application/pdf")},
                data={"processor_provider": "openai"},
            )

        self.assertEqual(response.status_code, 201)
        uploaded = response.json()
        analyzed = self._wait_for_document(admin_token, uploaded["document_id"])
        page = analyzed["pages"][0]

        self.assertEqual(analyzed["processor_provider"], "openai")
        self.assertEqual(analyzed["processor_model"], "gpt-5-mini")
        self.assertTrue(analyzed["processor_trace"]["applied"])
        self.assertEqual(analyzed["processor_trace"]["applied_page_count"], 1)
        self.assertTrue(analyzed["processor_trace"]["overrode_heuristics"])
        self.assertEqual(page["document_kind"], "INVOICE")
        self.assertEqual(page["document_subtype"], "SALES")
        self.assertEqual(page["classification_payload"]["processor_provider"], "openai")
        self.assertTrue(page["processor_trace"]["applied"])
        self.assertEqual(page["processor_trace"]["provider"], "openai")
        self.assertEqual(page["processor_trace"]["heuristic_document_kind"], "INVOICE")
        self.assertTrue(page["processor_trace"]["overrode_heuristics"])
        self.assertTrue(any(field["field_key"] == "invoice_number" for field in page["header_fields"]))
        self.assertTrue(any(table["template_key"] == "line_items" for table in page["table_blocks"]))
        self.assertIn("Document AI result applied.", page["processing_warnings"])

    def test_reprocess_can_switch_document_processor_provider(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.GOOGLE_API_KEY = "google-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"
        settings.GOOGLE_MODEL = "gemini-2.5-flash"

        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        self.assertEqual(document["processor_provider"], "openai")

        fake_google_outcome = (
            DocumentProcessorOutcome(
                provider="google",
                model="gemini-2.5-flash",
                pages=[
                    DocumentProcessorPageResult(
                        page_number=1,
                        document_kind="INVOICE",
                        document_subtype="GOOGLE_REPROCESS",
                        confidence=0.91,
                        header_fields=[],
                        table_blocks=[],
                        warnings=["Google reprocess applied."],
                    )
                ],
            ),
            [],
        )

        with patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=fake_google_outcome,
        ):
            reprocess_response = self.client.post(
                f"/documents/{document['document_id']}/reprocess",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"processor_provider": "google"},
            )

        self.assertEqual(reprocess_response.status_code, 202)
        reprocess_body = reprocess_response.json()
        self.assertEqual(reprocess_body["processor_provider"], "google")
        self.assertEqual(reprocess_body["processor_model"], "gemini-2.5-flash")

        reanalyzed = self._wait_for_document(admin_token, document["document_id"])
        self.assertEqual(reanalyzed["processor_provider"], "google")
        self.assertEqual(reanalyzed["processor_model"], "gemini-2.5-flash")
        self.assertEqual(reanalyzed["processor_trace"]["provider"], "google")
        self.assertEqual(reanalyzed["pages"][0]["document_subtype"], "GOOGLE_REPROCESS")
        self.assertEqual(reanalyzed["pages"][0]["processor_trace"]["provider"], "google")

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

    def test_document_response_includes_existing_record_linkage_candidates(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        page = document["pages"][0]
        invoice_id: str | None = None

        with self.SessionLocal() as session:
            trade = self._build_trade(trade_id="T-INV-9001")
            invoice = TradeInvoice(
                trade_id=trade.trade_id,
                delivery_id=None,
                leg_no=None,
                invoice_number="INV-9001",
                invoice_currency_code="USD",
                billed_quantity=None,
                quantity_unit_code=None,
                invoice_amount=Decimal("79250"),
                status="ISSUED",
                issued_at=datetime(2026, 4, 6, 0, 0, tzinfo=timezone.utc),
                due_at=datetime(2026, 4, 15, 0, 0, tzinfo=timezone.utc),
                dispute_reason=None,
                notes=None,
                created_at=datetime(2026, 4, 6, 0, 0, tzinfo=timezone.utc),
                created_by="tester",
                updated_at=datetime(2026, 4, 6, 0, 0, tzinfo=timezone.utc),
                updated_by="tester",
                version=1,
            )
            session.add_all([trade, invoice])
            session.commit()
            session.refresh(invoice)
            invoice_id = str(invoice.id)

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
            },
        )
        self.assertEqual(page_response.status_code, 200)
        page_body = page_response.json()
        self.assertEqual(page_body["linkage_assessment"]["status"], "CANDIDATE")
        self.assertEqual(page_body["linkage_assessment"]["recommended_action"], "REVIEW")
        self.assertEqual(page_body["linkage_assessment"]["primary_record_type"], "TRADE_INVOICE")
        self.assertEqual(page_body["analysis_summary"]["linkage_status"], "CANDIDATE")
        self.assertEqual(page_body["analysis_summary"]["linkage_primary_record_type"], "TRADE_INVOICE")
        self.assertEqual(page_body["action_plan"]["status"], "REVIEW")
        self.assertEqual(page_body["action_plan"]["action_type"], "ATTACH_EXISTING_RECORD")
        self.assertEqual(page_body["action_plan"]["operation_type"], "link_document_to_record")
        self.assertEqual(page_body["action_plan"]["target"]["record_type"], "TRADE_INVOICE")
        self.assertEqual(page_body["action_plan"]["target"]["record_id"], invoice_id)
        self.assertEqual(page_body["analysis_summary"]["action_plan_status"], "REVIEW")
        self.assertEqual(page_body["analysis_summary"]["action_plan_type"], "ATTACH_EXISTING_RECORD")
        self.assertTrue(
            any(candidate["record_label"] == "Invoice INV-9001" for candidate in page_body["linkage_assessment"]["candidates"])
        )

        verify_response = self.client.patch(
            f"/documents/{document['document_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"review_status": "VERIFIED"},
        )
        self.assertEqual(verify_response.status_code, 200)
        verify_body = verify_response.json()
        self.assertEqual(verify_body["linkage_assessment"]["status"], "READY")
        self.assertEqual(verify_body["linkage_assessment"]["recommended_action"], "ATTACH")
        self.assertEqual(verify_body["analysis_summary"]["linkage_status"], "READY")
        self.assertEqual(verify_body["action_plan"]["status"], "READY")
        self.assertEqual(verify_body["action_plan"]["action_type"], "ATTACH_EXISTING_RECORD")
        self.assertEqual(verify_body["analysis_summary"]["action_plan_status"], "READY")

        execute_response = self.client.post(
            f"/documents/{document['document_id']}/execute-action-plan",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(execute_response.status_code, 200)
        execute_body = execute_response.json()
        self.assertEqual(len(execute_body["record_links"]), 1)
        self.assertEqual(execute_body["record_links"][0]["record_type"], "TRADE_INVOICE")
        self.assertEqual(execute_body["record_links"][0]["record_id"], invoice_id)
        self.assertEqual(execute_body["analysis_summary"]["record_link_count"], 1)

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
