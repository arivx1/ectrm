from __future__ import annotations

import base64
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
from apps.api.app.domains.documents.services.document_classification_scoring import score_document_page_classification
from apps.api.app.domains.documents.services.document_ingestion_review import build_document_summary
from apps.api.app.domains.documents.services.document_facets import suggest_document_facets_from_text
from apps.api.app.domains.documents.services.document_processor import _build_openai_text_format
from apps.api.app.domains.documents.services.document_processor import _generate_openai_document_analysis
from apps.api.app.domains.documents.services.document_processor import DocumentProcessorOutcome
from apps.api.app.domains.documents.services.document_processor import DocumentProcessorPageResult
from apps.api.app.domains.documents.services.document_processor import DocumentProcessorProviderConfig
from apps.api.app.domains.documents.services.document_processor import run_document_processor_analysis
from apps.api.app.domains.documents.services.ingestion import classify_document_page
from apps.api.app.domains.documents.services.ingestion import extract_document_header_fields
from apps.api.app.domains.documents.services.ingestion import extract_document_table_blocks
from apps.api.app.domains.documents.services.document_ingestion_storage import document_page_preview_absolute_path
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.document_facet_value import DocumentFacetValue
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_logical_document import DocumentLogicalDocument
from apps.api.app.models.document_record_link import DocumentRecordLink
from apps.api.app.models.event import Event
from apps.api.app.models.gmail_inbox_import_receipt import GmailInboxImportReceipt
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
        get_responses: list[httpx.Response | Exception] | None = None,
        post_responses: list[httpx.Response | Exception] | None = None,
        delete_responses: list[httpx.Response | Exception] | None = None,
    ) -> None:
        self.get_responses = list(get_responses or [])
        self.post_responses = list(post_responses or [])
        self.delete_responses = list(delete_responses or [])
        self.get_calls: list[tuple[str, dict[str, object]]] = []
        self.post_calls: list[tuple[str, dict[str, object]]] = []
        self.delete_calls: list[tuple[str, dict[str, object]]] = []

    def __enter__(self) -> _FakeHttpxClient:
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False

    def close(self) -> None:
        return None

    def get(self, url: str, **kwargs: object) -> httpx.Response:
        self.get_calls.append((url, dict(kwargs)))
        if not self.get_responses:
            raise AssertionError(f"Unexpected GET request for {url}")
        response = self.get_responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

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
        self._previous_document_ai_confidence_threshold = settings.DOCUMENT_AI_CONFIDENCE_THRESHOLD
        self._previous_document_ai_openai_model = settings.DOCUMENT_AI_OPENAI_MODEL
        self._previous_document_ai_anthropic_model = settings.DOCUMENT_AI_ANTHROPIC_MODEL
        self._previous_document_ai_google_model = settings.DOCUMENT_AI_GOOGLE_MODEL
        self._previous_document_ai_openai_inline_file_max_bytes = settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES
        self._previous_openai_api_key = settings.OPENAI_API_KEY
        self._previous_openai_model = settings.OPENAI_MODEL
        self._previous_anthropic_api_key = settings.ANTHROPIC_API_KEY
        self._previous_google_api_key = settings.GOOGLE_API_KEY
        self._previous_gmail_inbox_enabled = settings.GMAIL_INBOX_ENABLED
        self._previous_gmail_inbox_client_id = settings.GMAIL_INBOX_CLIENT_ID
        self._previous_gmail_inbox_client_secret = settings.GMAIL_INBOX_CLIENT_SECRET
        self._previous_gmail_inbox_refresh_token = settings.GMAIL_INBOX_REFRESH_TOKEN
        self._previous_gmail_inbox_account_email = settings.GMAIL_INBOX_ACCOUNT_EMAIL
        self._previous_gmail_inbox_query = settings.GMAIL_INBOX_QUERY
        self._previous_gmail_inbox_max_messages_per_import = settings.GMAIL_INBOX_MAX_MESSAGES_PER_IMPORT
        self._previous_gmail_inbox_timeout_seconds = settings.GMAIL_INBOX_TIMEOUT_SECONDS
        self._previous_gmail_inbox_token_url = settings.GMAIL_INBOX_TOKEN_URL
        self._previous_gmail_inbox_api_base_url = settings.GMAIL_INBOX_API_BASE_URL
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"
        settings.DOCUMENT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
        settings.DOCUMENT_AI_ENABLED = True
        settings.DOCUMENT_AI_DEFAULT_PROVIDER = "openai"
        settings.DOCUMENT_AI_CONFIDENCE_THRESHOLD = 0.46
        settings.DOCUMENT_AI_OPENAI_MODEL = ""
        settings.DOCUMENT_AI_ANTHROPIC_MODEL = ""
        settings.DOCUMENT_AI_GOOGLE_MODEL = ""
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = 8 * 1024 * 1024
        settings.OPENAI_API_KEY = ""
        settings.OPENAI_MODEL = "gpt-5-mini"
        settings.ANTHROPIC_API_KEY = ""
        settings.GOOGLE_API_KEY = ""
        settings.GMAIL_INBOX_ENABLED = False
        settings.GMAIL_INBOX_CLIENT_ID = ""
        settings.GMAIL_INBOX_CLIENT_SECRET = ""
        settings.GMAIL_INBOX_REFRESH_TOKEN = ""
        settings.GMAIL_INBOX_ACCOUNT_EMAIL = ""
        settings.GMAIL_INBOX_QUERY = "has:attachment filename:pdf in:inbox"
        settings.GMAIL_INBOX_MAX_MESSAGES_PER_IMPORT = 10
        settings.GMAIL_INBOX_TIMEOUT_SECONDS = 20
        settings.GMAIL_INBOX_TOKEN_URL = "https://oauth2.googleapis.com/token"
        settings.GMAIL_INBOX_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1"
        self._storage_tempdir = tempfile.TemporaryDirectory()
        settings.DOCUMENT_STORAGE_ROOT = Path(self._storage_tempdir.name)

        with self.SessionLocal() as session:
            session.query(Event).delete()
            session.query(DocumentRecordLink).delete()
            session.query(DocumentFacetValue).delete()
            session.query(GmailInboxImportReceipt).delete()
            session.query(DocumentLogicalDocument).delete()
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
        settings.DOCUMENT_AI_CONFIDENCE_THRESHOLD = self._previous_document_ai_confidence_threshold
        settings.DOCUMENT_AI_OPENAI_MODEL = self._previous_document_ai_openai_model
        settings.DOCUMENT_AI_ANTHROPIC_MODEL = self._previous_document_ai_anthropic_model
        settings.DOCUMENT_AI_GOOGLE_MODEL = self._previous_document_ai_google_model
        settings.DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES = self._previous_document_ai_openai_inline_file_max_bytes
        settings.OPENAI_API_KEY = self._previous_openai_api_key
        settings.OPENAI_MODEL = self._previous_openai_model
        settings.ANTHROPIC_API_KEY = self._previous_anthropic_api_key
        settings.GOOGLE_API_KEY = self._previous_google_api_key
        settings.GMAIL_INBOX_ENABLED = self._previous_gmail_inbox_enabled
        settings.GMAIL_INBOX_CLIENT_ID = self._previous_gmail_inbox_client_id
        settings.GMAIL_INBOX_CLIENT_SECRET = self._previous_gmail_inbox_client_secret
        settings.GMAIL_INBOX_REFRESH_TOKEN = self._previous_gmail_inbox_refresh_token
        settings.GMAIL_INBOX_ACCOUNT_EMAIL = self._previous_gmail_inbox_account_email
        settings.GMAIL_INBOX_QUERY = self._previous_gmail_inbox_query
        settings.GMAIL_INBOX_MAX_MESSAGES_PER_IMPORT = self._previous_gmail_inbox_max_messages_per_import
        settings.GMAIL_INBOX_TIMEOUT_SECONDS = self._previous_gmail_inbox_timeout_seconds
        settings.GMAIL_INBOX_TOKEN_URL = self._previous_gmail_inbox_token_url
        settings.GMAIL_INBOX_API_BASE_URL = self._previous_gmail_inbox_api_base_url
        self._storage_tempdir.cleanup()

    def _openai_provider_config(self) -> DocumentProcessorProviderConfig:
        return DocumentProcessorProviderConfig(
            provider="openai",
            label="GPT",
            api_key="openai-test-key",
            model="gpt-5-mini",
            model_options=("gpt-5-mini", "gpt-5", "gpt-5-nano"),
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

    def _summary_page(
        self,
        *,
        page_number: int,
        document_kind: str,
        classification_status: str = "ANALYZED",
    ) -> DocumentIngestionPage:
        now = datetime(2026, 4, 14, 12, 0, tzinfo=timezone.utc)
        return DocumentIngestionPage(
            document_id="summary-doc",
            page_number=page_number,
            classification_status=classification_status,
            extraction_status="ANALYZED",
            document_kind=document_kind,
            document_subtype=None,
            classification_confidence=0.92,
            classification_payload={},
            header_fields=[],
            table_blocks=[],
            raw_text="",
            processing_warnings=[],
            processing_errors=[],
            review_status="UNREVIEWED",
            review_notes=None,
            reviewed_at=None,
            reviewed_by=None,
            processed_at=now,
            created_at=now,
            updated_at=now,
        )

    def _configure_gmail_inbox(self) -> None:
        settings.GMAIL_INBOX_ENABLED = True
        settings.GMAIL_INBOX_CLIENT_ID = "gmail-client-id"
        settings.GMAIL_INBOX_CLIENT_SECRET = "gmail-client-secret"
        settings.GMAIL_INBOX_REFRESH_TOKEN = "gmail-refresh-token"
        settings.GMAIL_INBOX_ACCOUNT_EMAIL = "ops-inbox@example.com"
        settings.GMAIL_INBOX_QUERY = "has:attachment filename:pdf in:inbox"
        settings.GMAIL_INBOX_MAX_MESSAGES_PER_IMPORT = 10
        settings.GMAIL_INBOX_TIMEOUT_SECONDS = 5

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
        self.assertEqual(analyzed["analysis_summary"]["document_classification_scope"], "DOCUMENT")
        self.assertEqual(analyzed["analysis_summary"]["document_classification_kind"], "OTHER")
        self.assertEqual(analyzed["analysis_summary"]["dominant_document_kind"], "OTHER")
        self.assertFalse(analyzed["analysis_summary"]["page_level_classification_required"])
        self.assertEqual(analyzed["analysis_summary"]["routing_strategy"], "MANUAL_REVIEW")
        self.assertEqual(analyzed["analysis_summary"]["artifact_profile"]["detected_file_type"], "pdf")
        self.assertEqual(analyzed["analysis_summary"]["artifact_profile"]["recommended_parse_mode"], "pdf_ocr_required")
        self.assertFalse(analyzed["analysis_summary"]["structure_profile"]["deep_extraction_required"])
        self.assertEqual(analyzed["analysis_summary"]["structure_profile"]["logical_document_count_estimate"], 1)
        self.assertEqual(analyzed["analysis_summary"]["extraction_plan"][0]["document_kind"], "OTHER")
        self.assertIsNone(analyzed["analysis_summary"]["extraction_plan"][0]["schema_code"])
        self.assertEqual(analyzed["analysis_summary"]["extraction_plan"][0]["status"], "MANUAL_REVIEW")
        self.assertEqual(analyzed["routing_assessment"]["routing_strategy"], "MANUAL_REVIEW")
        self.assertEqual(analyzed["routing_assessment"]["status"], "MANUAL_REVIEW")
        self.assertEqual(len(analyzed["pages"]), 2)
        self.assertTrue(all(page["document_kind"] == "OTHER" for page in analyzed["pages"]))
        self.assertTrue(all(page["document_subtype"] == "FILENAME_HINT_ONLY" for page in analyzed["pages"]))
        self.assertTrue(all(page["routing_assessment"]["routing_strategy"] == "MANUAL_REVIEW" for page in analyzed["pages"]))
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
            self.assertEqual(pages[0].document_kind, "OTHER")
            self.assertEqual(document.review_status, "UNREVIEWED")
            self.assertEqual(pages[0].review_status, "UNREVIEWED")

    def test_document_patch_persists_controlled_facet_values(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)

        response = self.client.patch(
            f"/documents/{uploaded['document_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "facet_values": [
                    {"facet_key": "commodity", "value_code": "Natural Gas"},
                    {"facet_key": "commercial_side", "value_code": "purchase"},
                    {"facet_key": "transport_mode", "value_code": "pipeline"},
                    {"facet_key": "asset", "value_code": "power generation"},
                ]
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        facets = {(facet["facet_key"], facet["value_code"]): facet for facet in body["facet_values"]}
        self.assertEqual(facets[("commodity", "NATURAL_GAS")]["value_label"], "Natural Gas")
        self.assertEqual(facets[("commercial_side", "BUY")]["value_label"], "Purchase")
        self.assertEqual(facets[("transport_mode", "PIPELINE")]["value_label"], "Pipeline")
        self.assertEqual(facets[("asset", "POWER_GENERATION")]["value_label"], "Power Generation")
        manual_document_facets = [
            facet
            for facet in body["facet_values"]
            if facet["facet_key"] in {"commodity", "commercial_side", "transport_mode", "asset"}
        ]
        self.assertTrue(all(facet["page_id"] is None for facet in manual_document_facets))
        self.assertTrue(all(facet["source"] == "MANUAL" for facet in manual_document_facets))
        self.assertTrue(all(facet["review_status"] == "CONFIRMED" for facet in manual_document_facets))

        fetched = self.client.get(
            f"/documents/{uploaded['document_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(fetched.status_code, 200)
        fetched_facets = {
            (facet["facet_key"], facet["value_code"])
            for facet in fetched.json()["facet_values"]
        }
        self.assertTrue(
            {
                ("commodity", "NATURAL_GAS"),
                ("commercial_side", "BUY"),
                ("transport_mode", "PIPELINE"),
                ("asset", "POWER_GENERATION"),
            }.issubset(fetched_facets)
        )

    def test_document_patch_tracks_human_added_and_system_added_tag_changes(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document_id = str(uploaded["document_id"])
        now = datetime(2026, 5, 23, 12, 0, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            session.add_all(
                [
                    DocumentFacetValue(
                        document_id=document_id,
                        page_id=None,
                        facet_key="commodity",
                        value_code="NATURAL_GAS",
                        value_label_snapshot="Natural Gas",
                        source="SYSTEM_DERIVED",
                        confidence=0.76,
                        review_status="SUGGESTED",
                        evidence=["Matched text pattern: natural gas"],
                        created_at=now,
                        created_by="document_facet_suggester",
                        updated_at=now,
                        updated_by="document_facet_suggester",
                        version=1,
                    ),
                    DocumentFacetValue(
                        document_id=document_id,
                        page_id=None,
                        facet_key="transport_mode",
                        value_code="PIPELINE",
                        value_label_snapshot="Pipeline",
                        source="MANUAL",
                        confidence=None,
                        review_status="CONFIRMED",
                        evidence=[],
                        created_at=now,
                        created_by="doc_admin",
                        updated_at=now,
                        updated_by="doc_admin",
                        version=1,
                    ),
                ]
            )
            session.commit()

        response = self.client.patch(
            f"/documents/{document_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "facet_values": [
                    {
                        "facet_key": "commodity",
                        "value_code": "natural gas",
                        "source": "MANUAL",
                        "review_status": "CONFIRMED",
                    },
                    {
                        "facet_key": "asset",
                        "value_code": "upstream",
                    },
                ]
            },
        )

        self.assertEqual(response.status_code, 200)
        facets = {(facet["facet_key"], facet["value_code"]): facet for facet in response.json()["facet_values"]}
        self.assertEqual(facets[("commodity", "NATURAL_GAS")]["source"], "SYSTEM_DERIVED")
        self.assertEqual(facets[("commodity", "NATURAL_GAS")]["review_status"], "CONFIRMED")
        self.assertEqual(facets[("commodity", "NATURAL_GAS")]["updated_by"], "doc_admin")
        self.assertEqual(facets[("asset", "UPSTREAM")]["source"], "MANUAL")
        self.assertEqual(facets[("asset", "UPSTREAM")]["created_by"], "doc_admin")
        self.assertEqual(facets[("transport_mode", "PIPELINE")]["source"], "MANUAL")
        self.assertEqual(facets[("transport_mode", "PIPELINE")]["review_status"], "REJECTED")
        self.assertEqual(facets[("transport_mode", "PIPELINE")]["updated_by"], "doc_admin")
        self.assertIn("Removed by doc_admin.", facets[("transport_mode", "PIPELINE")]["evidence"])

    def test_page_patch_persists_page_level_facet_values(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        page_id = uploaded["pages"][0]["page_id"]

        response = self.client.patch(
            f"/documents/{uploaded['document_id']}/pages/{page_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "facet_values": [
                    {
                        "facet_key": "transport_mode",
                        "value_code": "truck",
                        "source": "AI_SUGGESTED",
                        "review_status": "SUGGESTED",
                        "confidence": 0.71,
                        "evidence": ["Matched truck reference."],
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        transport_facet = next(
            facet for facet in body["facet_values"] if facet["facet_key"] == "transport_mode"
        )
        page_transport_facet = next(
            facet for facet in body["pages"][0]["facet_values"] if facet["facet_key"] == "transport_mode"
        )
        self.assertEqual(transport_facet["page_id"], page_id)
        self.assertEqual(transport_facet["value_code"], "TRUCK")
        self.assertEqual(transport_facet["source"], "AI_SUGGESTED")
        self.assertEqual(page_transport_facet["value_label"], "Truck")
        self.assertEqual(page_transport_facet["evidence"], ["Matched truck reference."])

    def test_document_patch_rejects_invalid_facet_values(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)

        response = self.client.patch(
            f"/documents/{uploaded['document_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"facet_values": [{"facet_key": "transport_mode", "value_code": "hovercraft"}]},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("invalid for transport_mode", response.text)

    def test_document_facet_suggester_extracts_starter_tags_from_text(self) -> None:
        suggestions = suggest_document_facets_from_text(
            "Natural gas purchase confirmation for pipeline delivery to a power generation asset."
        )

        pairs = {(suggestion["facet_key"], suggestion["value_code"]) for suggestion in suggestions}
        self.assertIn(("commodity", "NATURAL_GAS"), pairs)
        self.assertIn(("commercial_side", "BUY"), pairs)
        self.assertIn(("transport_mode", "PIPELINE"), pairs)
        self.assertIn(("asset", "POWER_GENERATION"), pairs)
        self.assertTrue(all(suggestion["review_status"] == "SUGGESTED" for suggestion in suggestions))

    def test_document_facet_suggester_uses_order_kind_for_commercial_side(self) -> None:
        purchase_order_suggestions = suggest_document_facets_from_text(
            """
            Purchase Order
            Purchase Order No 28561
            Buyer: Gulf Trading LLC
            Seller: Atlantic Fuels
            Vessel: MT Example
            """,
            document_kind="PURCHASE_ORDER",
        )
        purchase_order_pairs = {
            (suggestion["facet_key"], suggestion["value_code"]) for suggestion in purchase_order_suggestions
        }
        self.assertIn(("document_type", "PURCHASE_ORDER"), purchase_order_pairs)
        self.assertIn(("commercial_side", "BUY"), purchase_order_pairs)
        self.assertNotIn(("commercial_side", "SELL"), purchase_order_pairs)
        self.assertIn(("transport_mode", "VESSEL"), purchase_order_pairs)
        self.assertTrue(
            any(
                suggestion["value_label"] == "Purchase Order"
                for suggestion in purchase_order_suggestions
                if suggestion["facet_key"] == "document_type"
            )
        )
        self.assertTrue(
            any(
                "Document kind PURCHASE_ORDER" in " ".join(suggestion["evidence"])
                for suggestion in purchase_order_suggestions
                if suggestion["facet_key"] == "commercial_side"
            )
        )

        sales_order_suggestions = suggest_document_facets_from_text(
            """
            Sales Order
            Sales Order No SO-4412
            Customer: Gulf Trading LLC
            Seller: Atlantic Fuels
            Vessel: MT Example
            """,
            document_kind="SALES_ORDER",
        )
        sales_order_pairs = {
            (suggestion["facet_key"], suggestion["value_code"]) for suggestion in sales_order_suggestions
        }
        self.assertIn(("document_type", "SALES_ORDER"), sales_order_pairs)
        self.assertIn(("commercial_side", "SELL"), sales_order_pairs)
        self.assertNotIn(("commercial_side", "BUY"), sales_order_pairs)
        self.assertIn(("transport_mode", "VESSEL"), sales_order_pairs)

        empty_text_pairs = {
            (suggestion["facet_key"], suggestion["value_code"])
            for suggestion in suggest_document_facets_from_text(None, document_kind="PURCHASE_ORDER")
        }
        self.assertEqual(empty_text_pairs, {("document_type", "PURCHASE_ORDER"), ("commercial_side", "BUY")})

    def test_document_facet_suggester_abstains_from_price_publication_side_and_tags_products(self) -> None:
        suggestions = suggest_document_facets_from_text(
            """
            PRICE PUBLICATION REPORT
            Global Commodity Price Index
            U.S. Market Assessments - FOB U.S. Gulf

            Product                 Contract / Period    Pricing Basis    Low     High    Midpoint
            Brent Crude             Prompt               FOB U.S. Gulf     81.75   82.50   82.13
            ULSD 10 ppm Sulfur      February 2026        FOB U.S. Gulf     87.05   87.85   87.45
            Soybean Meal 48%        Jan 2026             FOB U.S. Gulf     415.00  420.00  417.50

            This publication is not a purchase order or a sales order.
            """,
            document_kind="PRICE_PUBLICATION",
        )

        pairs = {(suggestion["facet_key"], suggestion["value_code"]) for suggestion in suggestions}
        self.assertIn(("document_type", "PRICE_PUBLICATION"), pairs)
        self.assertIn(("commodity", "CRUDE_OIL"), pairs)
        self.assertIn(("commodity", "DIESEL"), pairs)
        self.assertIn(("commodity", "SOYBEAN_MEAL"), pairs)
        self.assertNotIn(("commercial_side", "BUY"), pairs)
        self.assertNotIn(("commercial_side", "SELL"), pairs)

    def test_document_kind_correction_refreshes_system_order_side_facets(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        document_id = str(document["document_id"])
        now = datetime(2026, 5, 22, 12, 0, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            page = session.query(DocumentIngestionPage).filter(DocumentIngestionPage.document_id == document_id).one()
            self.assertIsNotNone(page.page_id)
            page.document_kind = "WEIGH_TICKET"
            page.raw_text = """
            Purchase Order
            Purchase Order No 28561
            Buyer: Gulf Trading LLC
            Seller: Atlantic Fuels
            Vessel: MT Example
            """
            session.add(
                DocumentFacetValue(
                    document_id=document_id,
                    page_id=page.page_id,
                    facet_key="commercial_side",
                    value_code="SELL",
                    value_label_snapshot="Sale",
                    source="SYSTEM_DERIVED",
                    confidence=0.62,
                    review_status="SUGGESTED",
                    evidence=["Matched stale seller label."],
                    created_at=now,
                    created_by="document_facet_suggester",
                    updated_at=now,
                    updated_by="document_facet_suggester",
                    version=1,
                )
            )
            session.add(
                DocumentFacetValue(
                    document_id=document_id,
                    page_id=page.page_id,
                    facet_key="document_type",
                    value_code="WEIGH_TICKET",
                    value_label_snapshot="Weigh Ticket",
                    source="SYSTEM_DERIVED",
                    confidence=0.68,
                    review_status="SUGGESTED",
                    evidence=["Stale system classification."],
                    created_at=now,
                    created_by="document_facet_suggester",
                    updated_at=now,
                    updated_by="document_facet_suggester",
                    version=1,
                )
            )
            session.commit()

        response = self.client.patch(
            f"/documents/{document_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"document_kind": "PURCHASE_ORDER"},
        )
        self.assertEqual(response.status_code, 200)
        page_facets = response.json()["pages"][0]["facet_values"]
        commercial_side_codes = {
            facet["value_code"] for facet in page_facets if facet["facet_key"] == "commercial_side"
        }
        document_type_codes = {
            facet["value_code"] for facet in page_facets if facet["facet_key"] == "document_type"
        }
        self.assertEqual(document_type_codes, {"PURCHASE_ORDER"})
        self.assertEqual(commercial_side_codes, {"BUY"})
        self.assertTrue(
            any("Document kind PURCHASE_ORDER" in " ".join(facet["evidence"]) for facet in page_facets)
        )

    def test_summary_classifies_homogeneous_upload_at_document_level(self) -> None:
        pages = [
            self._summary_page(page_number=1, document_kind="INVOICE"),
            self._summary_page(page_number=2, document_kind="INVOICE"),
        ]

        summary = build_document_summary(pages, review_status="UNREVIEWED")

        self.assertEqual(summary["document_classification_scope"], "DOCUMENT")
        self.assertEqual(summary["document_classification_kind"], "INVOICE")
        self.assertEqual(summary["dominant_document_kind"], "INVOICE")
        self.assertFalse(summary["page_level_classification_required"])
        self.assertTrue(summary["document_type_homogeneous"])
        self.assertEqual(summary["page_document_kinds"], ["INVOICE"])
        self.assertEqual(summary["structure_profile"]["logical_document_count_estimate"], 1)

    def test_summary_requires_page_level_classification_for_mixed_upload(self) -> None:
        pages = [
            self._summary_page(page_number=1, document_kind="INVOICE"),
            self._summary_page(page_number=2, document_kind="BILL_OF_LADING"),
        ]

        summary = build_document_summary(pages, review_status="UNREVIEWED")

        self.assertEqual(summary["document_classification_scope"], "LOGICAL_DOCUMENT")
        self.assertIsNone(summary["document_classification_kind"])
        self.assertEqual(summary["dominant_document_kind"], "MIXED")
        self.assertEqual(summary["representative_page_document_kind"], "INVOICE")
        self.assertFalse(summary["page_level_classification_required"])
        self.assertTrue(summary["logical_document_classification_required"])
        self.assertFalse(summary["document_type_homogeneous"])
        self.assertEqual(summary["page_document_kinds"], ["BILL_OF_LADING", "INVOICE"])
        self.assertEqual(summary["structure_profile"]["logical_document_count_estimate"], 2)
        self.assertEqual(summary["routing_strategy"], "MANUAL_REVIEW")
        self.assertIn("multiple logical document kinds", " ".join(summary["routing_assessment"]["reasons"]))

    def test_packet_upload_persists_logical_documents_with_page_range_provenance(self) -> None:
        admin_token = self._bootstrap_admin()
        invoice_text = "\n".join(
            [
                "Invoice",
                "Invoice Number: INV-PACKET-100",
                "Trade ID: TRD-PACKET-100",
                "Invoice Date: 2026-04-14",
                "Due Date: 2026-04-20",
                "Counterparty: Shell Trading",
                "Total Amount: USD 125000",
            ]
        )
        bol_text = "\n".join(
            [
                "Bill of Lading",
                "BOL Number: BOL-PACKET-200",
                "Delivery ID: DLV-PACKET-200",
                "Carrier: Acme Logistics",
                "Load Date: 2026-04-14",
                "Origin: HOUSTON",
                "Destination: NEW ORLEANS",
            ]
        )

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            side_effect=[(invoice_text, []), (bol_text, [])],
        ):
            response = self.client.post(
                "/documents/uploads",
                headers={"Authorization": f"Bearer {admin_token}"},
                files={"file": ("packet.pdf", self._build_pdf_bytes(page_count=2), "application/pdf")},
                data={"processor_provider": "builtin"},
            )
            self.assertEqual(response.status_code, 201)
            uploaded = response.json()
            document = self._wait_for_document(admin_token, uploaded["document_id"])

        self.assertEqual(document["uploaded_file_id"], document["document_id"])
        self.assertEqual(document["analysis_summary"]["document_classification_scope"], "LOGICAL_DOCUMENT")
        self.assertTrue(document["analysis_summary"]["logical_document_classification_required"])
        self.assertEqual(document["analysis_summary"]["structure_profile"]["logical_document_count"], 2)
        self.assertEqual(len(document["logical_documents"]), 2)
        self.assertEqual(document["logical_documents"][0]["document_kind"], "INVOICE")
        self.assertEqual(document["logical_documents"][0]["page_start"], 1)
        self.assertEqual(document["logical_documents"][0]["page_end"], 1)
        self.assertEqual(document["logical_documents"][0]["page_numbers"], [1])
        self.assertEqual(document["logical_documents"][1]["document_kind"], "BILL_OF_LADING")
        self.assertEqual(document["logical_documents"][1]["page_start"], 2)
        self.assertEqual(document["logical_documents"][1]["page_end"], 2)
        self.assertEqual(document["pages"][0]["logical_document_key"], "LD-001")
        self.assertEqual(document["pages"][1]["logical_document_key"], "LD-002")

        with self.SessionLocal() as session:
            rows = (
                session.query(DocumentLogicalDocument)
                .filter(DocumentLogicalDocument.document_id == document["document_id"])
                .order_by(DocumentLogicalDocument.sequence_number)
                .all()
            )
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0].page_start, 1)
            self.assertEqual(rows[0].page_end, 1)
            self.assertEqual(rows[0].provenance["source"], "system_page_classification")
            self.assertEqual(rows[0].provenance["split_strategy"], "contiguous_page_classification_run")
            self.assertEqual(rows[0].provenance["source_page_numbers"], [1])
            self.assertEqual(rows[1].provenance["source_page_numbers"], [2])

    def test_packet_split_activity_records_auditable_page_ranges(self) -> None:
        admin_token = self._bootstrap_admin()
        texts = [
            (
                "\n".join(
                    [
                        "Invoice",
                        "Invoice Number: INV-AUDIT-1",
                        "Trade ID: TRD-AUDIT-1",
                        "Invoice Date: 2026-04-14",
                        "Total Amount: USD 125000",
                    ]
                ),
                [],
            ),
            (
                "\n".join(
                    [
                        "Trade Confirmation",
                        "Confirmation Number: CONF-AUDIT-2",
                        "Trade ID: TRD-AUDIT-2",
                        "Trade Date: 2026-04-14",
                        "Counterparty: Shell Trading",
                    ]
                ),
                [],
            ),
        ]

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            side_effect=texts,
        ):
            response = self.client.post(
                "/documents/uploads",
                headers={"Authorization": f"Bearer {admin_token}"},
                files={"file": ("audit-packet.pdf", self._build_pdf_bytes(page_count=2), "application/pdf")},
                data={"processor_provider": "builtin"},
            )
            self.assertEqual(response.status_code, 201)
            document = self._wait_for_document(admin_token, response.json()["document_id"])

        packet_events = [
            entry for entry in document["activity"] if entry["event_type"] == "DocumentPacketSplitUpdated"
        ]
        self.assertTrue(packet_events)
        latest_packet_event = packet_events[0]
        self.assertEqual(latest_packet_event["payload"]["logical_document_count"], 2)
        event_ranges = latest_packet_event["payload"]["logical_documents"]
        self.assertEqual(event_ranges[0]["page_start"], 1)
        self.assertEqual(event_ranges[0]["page_end"], 1)
        self.assertEqual(event_ranges[0]["provenance"]["source_page_numbers"], [1])
        self.assertEqual(event_ranges[1]["page_start"], 2)
        self.assertEqual(event_ranges[1]["page_end"], 2)
        self.assertEqual(event_ranges[1]["provenance"]["source_page_numbers"], [2])

        classified_events = [
            entry for entry in document["activity"] if entry["event_type"] == "DocumentClassified"
        ]
        self.assertEqual(len(classified_events), 1)
        classification = classified_events[0]["payload"]["classification"]
        self.assertEqual(classification["classification_scope"], "LOGICAL_DOCUMENT")
        self.assertEqual(classification["logical_document_count"], 2)
        self.assertEqual(classification["logical_document_classifications"][0]["page_start"], 1)
        self.assertEqual(classification["logical_document_classifications"][1]["page_start"], 2)

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

    def test_page_preview_endpoint_regenerates_missing_rendered_png(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        page = document["pages"][0]
        preview_path = document_page_preview_absolute_path(
            document_id=document["document_id"],
            page_number=page["page_number"],
        )
        self.assertTrue(preview_path.exists())
        preview_path.unlink()

        response = self.client.get(
            f"/documents/{document['document_id']}/pages/{page['page_id']}/preview",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("image/png", response.headers["content-type"])
        self.assertTrue(response.content.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertTrue(preview_path.exists())

    def test_document_source_endpoint_returns_original_pdf(self) -> None:
        admin_token = self._bootstrap_admin()
        payload = self._build_pdf_bytes(page_count=1)

        response = self.client.post(
            "/documents/uploads",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("source-packet.pdf", payload, "application/pdf")},
        )
        self.assertEqual(response.status_code, 201)
        document = response.json()
        self.assertTrue(document["source_available"])

        source_response = self.client.get(
            f"/documents/{document['document_id']}/source",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(source_response.status_code, 200)
        self.assertIn("application/pdf", source_response.headers["content-type"])
        self.assertEqual(
            source_response.headers["content-disposition"],
            'attachment; filename="source-packet.pdf"',
        )
        self.assertEqual(source_response.content, payload)

    def test_document_marks_missing_source_pdf_as_unavailable(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        self.assertTrue(document["source_available"])

        source_path = settings.DOCUMENT_STORAGE_ROOT / document["storage_key"]
        source_path.unlink()

        list_response = self.client.get(
            "/documents",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        listed_document = next(
            record
            for record in list_response.json()
            if record["document_id"] == document["document_id"]
        )
        self.assertFalse(listed_document["source_available"])

        get_response = self.client.get(
            f"/documents/{document['document_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(get_response.status_code, 200)
        self.assertFalse(get_response.json()["source_available"])

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
        self.assertTrue(
            any(
                facet["facet_key"] == "commodity"
                and facet["value_code"] == "CRUDE_OIL"
                and facet["source"] == "SYSTEM_DERIVED"
                and facet["review_status"] == "SUGGESTED"
                for facet in page["facet_values"]
            )
        )
        self.assertTrue(
            any(
                facet["facet_key"] == "document_type"
                and facet["value_code"] == "INVOICE"
                and facet["value_label"] == "Invoice"
                and facet["source"] == "SYSTEM_DERIVED"
                and facet["review_status"] == "SUGGESTED"
                for facet in page["facet_values"]
            )
        )

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

    def test_deterministic_scoring_uses_schema_evidence_and_reports_conflicts(self) -> None:
        text = """
        Invoice
        Invoice Number: INV-1007
        Invoice Date: 2026-04-06
        Counterparty: Shell Trading
        Total Amount: USD 79250

        Description  Quantity  Line Amount
        WTI April  1000  79250
        """
        table_blocks = extract_document_table_blocks(text, text_source="ocr")

        assessment = score_document_page_classification(
            filename="scan-1007.pdf",
            raw_text=text,
            text_source="ocr",
            table_blocks=table_blocks,
        )

        self.assertEqual(assessment.document_kind, "INVOICE")
        self.assertGreaterEqual(assessment.confidence, 0.6)
        self.assertTrue(
            any("Matched required invoice fields" in evidence for evidence in assessment.supporting_evidence)
        )
        self.assertTrue(
            any("Parsed table columns align with the line items layout" in evidence for evidence in assessment.supporting_evidence)
        )
        self.assertTrue(any("OCR fallback was required" in conflict for conflict in assessment.conflicts))

    def test_purchase_order_filename_and_header_classify_as_purchase_order(self) -> None:
        text = """
        Purchase Order
        Purchase Order No 28561
        Order Date: 2026-05-22
        Buyer: Gulf Trading LLC
        Seller: Atlantic Fuels
        Commodity: ULSD
        Quantity: 10000 bbl
        Vessel: MT Example
        Delivery Location: Houston Terminal
        """
        classification = classify_document_page("PURCHASE ORDER NO 28561 (1).pdf", text)
        self.assertEqual(classification.document_kind, "PURCHASE_ORDER")

        table_blocks = extract_document_table_blocks(text)
        assessment = score_document_page_classification(
            filename="PURCHASE ORDER NO 28561 (1).pdf",
            raw_text=text,
            text_source="pdf_text",
            table_blocks=table_blocks,
        )
        self.assertEqual(assessment.document_kind, "PURCHASE_ORDER")
        self.assertGreaterEqual(assessment.confidence, 0.85)
        self.assertTrue(
            any("Detected purchase order terminology" in evidence for evidence in assessment.supporting_evidence)
        )
        self.assertTrue(
            any("Matched required purchase order fields" in evidence for evidence in assessment.supporting_evidence)
        )

    def test_sales_order_filename_and_header_classify_as_sales_order(self) -> None:
        text = """
        Sales Order
        Sales Order No SO-4412
        Order Date: 2026-05-22
        Customer: Gulf Trading LLC
        Seller: Atlantic Fuels
        Commodity: ULSD
        Quantity: 8000 bbl
        Vessel: MT Example
        Delivery Location: Houston Terminal
        """
        classification = classify_document_page("SALES ORDER SO-4412.pdf", text)
        self.assertEqual(classification.document_kind, "SALES_ORDER")

        table_blocks = extract_document_table_blocks(text)
        assessment = score_document_page_classification(
            filename="SALES ORDER SO-4412.pdf",
            raw_text=text,
            text_source="pdf_text",
            table_blocks=table_blocks,
        )
        self.assertEqual(assessment.document_kind, "SALES_ORDER")
        self.assertGreaterEqual(assessment.confidence, 0.85)
        self.assertTrue(
            any("Detected sales order terminology" in evidence for evidence in assessment.supporting_evidence)
        )
        self.assertTrue(
            any("Matched required sales order fields" in evidence for evidence in assessment.supporting_evidence)
        )

    def test_certificate_of_analysis_quality_table_beats_sales_order_field_noise(self) -> None:
        text = """
        KLK OLEO
        INTERATLAS CHEMICAL INC

        Product          PALMERA DM-10 (LIQUID) DIMER ACID
        Quantity (kg)    19700
        Customer-Ref.    111064
        Delivery No.     8010842123000010
        Batch No.        EM0583-2604050303
        Shipped by       SIMU 251872-6
        Date of Despatch 07.04.2026
        Manufacturing Date 05.04.2026

        We certify, that we have examined a sample of the above mentioned goods with the following results;

        Test Description       Unit       Min.       Max.       Result       Method
        Acid value             mgKOH/g    190        197        192          ISO 660
        Colour Gardner         Gardner    0          8.0        6.2          ISO4630-2
        Monomer                %          1          3          1            In-house method
        1,5-Mer                %          4          6          5            In-house method
        Trimer                 %          18         22         20           In-house method
        Dyn. Viscosity at 25C  mPa s      7700       8700       8019         ISO 3219

        Andre Jansen / Quality Control Team Lead
        """
        classification = classify_document_page("page-6.pdf", text)
        self.assertEqual(classification.document_kind, "CERTIFICATE_OF_ANALYSIS")

        table_blocks = extract_document_table_blocks(text)
        assessment = score_document_page_classification(
            filename="page-6.pdf",
            raw_text=text,
            text_source="pdf_text",
            table_blocks=table_blocks,
        )
        self.assertEqual(assessment.document_kind, "CERTIFICATE_OF_ANALYSIS")
        self.assertGreaterEqual(assessment.confidence, 0.46)
        self.assertTrue(
            any(
                "Parsed table columns align with the assay results layout" in evidence
                for evidence in assessment.supporting_evidence
            )
        )

        sales_order_fields = extract_document_header_fields("SALES_ORDER", text)
        self.assertFalse(any(field["field_key"] == "buyer" for field in sales_order_fields))

    def test_packing_list_title_line_provides_strong_classification_evidence(self) -> None:
        text = """
        KLK Emmerich GmbH

        PACKING LIST

        To
        INTERATLAS CHEMICAL INC
        63 CHURCH ST. SUITE 203
        ST CATHARINES, ONTARIO

        Loading Address
        4200 KLK Emmerich GmbH
        Wardstrasse

        Quantity and Description of Goods     Package     Weight
        """
        assessment = score_document_page_classification(
            filename="page-4.pdf",
            raw_text=text,
            text_source="pdf_text",
            table_blocks=extract_document_table_blocks(text),
        )

        self.assertEqual(assessment.document_kind, "PACKING_LIST")
        self.assertGreaterEqual(assessment.confidence, 0.70)
        self.assertTrue(
            any("Detected packing list title line" in evidence for evidence in assessment.supporting_evidence)
        )

    def test_packing_list_title_and_delivery_order_classify_as_packing_list(self) -> None:
        text = """
        PACKING LIST
        Delivery Order No. : 8010842123
        Date : 07-April-2026
        Haulier : SHIPPING POINT => SEE NEXT PAGE
        Loading Date : 07-Apr-2026
        Delivery Date : 07-Apr-2026
        Cust. Ref No : 411064

        Quantity and Description of Goods    Package    Gross Wt.    Net Wt.    Tare Wt.
        01010 10101765 PALMERA DM-10 (LIQUID) DIMER ACID    1    19,700 MT    19,700 MT    0,000 MT

        SHIPPER: KLK Emmerich GmbH
        """
        classification = classify_document_page("klk-packing-list.pdf", text)
        self.assertEqual(classification.document_kind, "PACKING_LIST")

        table_blocks = extract_document_table_blocks(text)
        assessment = score_document_page_classification(
            filename="klk-packing-list.pdf",
            raw_text=text,
            text_source="pdf_text",
            table_blocks=table_blocks,
        )
        self.assertEqual(assessment.document_kind, "PACKING_LIST")
        self.assertGreaterEqual(assessment.confidence, 0.85)
        self.assertTrue(
            any("Detected packing list terminology" in evidence for evidence in assessment.supporting_evidence)
        )
        self.assertTrue(
            any("Matched required packing list fields" in evidence for evidence in assessment.supporting_evidence)
        )
        facet_suggestions = suggest_document_facets_from_text(
            text,
            document_kind=assessment.document_kind,
            classification_confidence=assessment.confidence,
        )
        self.assertTrue(
            any(
                suggestion["facet_key"] == "document_type"
                and suggestion["value_code"] == "PACKING_LIST"
                and suggestion["value_label"] == "Packing List"
                for suggestion in facet_suggestions
            )
        )

    def test_filename_only_document_type_hint_falls_back_to_other(self) -> None:
        assessment = score_document_page_classification(
            filename="invoice-batch.pdf",
            raw_text=None,
            text_source="none",
            table_blocks=[],
            image_has_visible_content=False,
        )

        self.assertEqual(assessment.document_kind, "OTHER")
        self.assertEqual(assessment.document_subtype, "FILENAME_HINT_ONLY")
        self.assertLessEqual(assessment.confidence, 0.12)
        self.assertTrue(any("Filename hints at invoice" in evidence for evidence in assessment.supporting_evidence))
        self.assertTrue(any("Other for manual review" in conflict for conflict in assessment.conflicts))

    def test_schema_registry_exposes_supported_document_contracts(self) -> None:
        admin_token = self._bootstrap_admin()
        response = self.client.get(
            "/documents/schema-registry",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["version"])
        document_facets = {facet["facet_key"]: facet for facet in body["document_facets"]}
        self.assertIn("document_type", document_facets)
        self.assertIn("commodity", document_facets)
        self.assertIn("commercial_side", document_facets)
        self.assertIn("transport_mode", document_facets)
        self.assertIn("asset", document_facets)
        self.assertTrue(
            any(
                value["code"] == "PACKING_LIST" and value["label"] == "Packing List"
                for value in document_facets["document_type"]["allowed_values"]
            )
        )
        self.assertTrue(
            any(value["code"] == "NATURAL_GAS" for value in document_facets["commodity"]["allowed_values"])
        )
        self.assertTrue(
            any(value["code"] == "BUY" and value["label"] == "Purchase" for value in document_facets["commercial_side"]["allowed_values"])
        )
        kinds = {entry["document_kind"]: entry for entry in body["document_kinds"]}
        self.assertIn("INVOICE", kinds)
        self.assertIn("DEAL_RECAP", kinds)
        self.assertIn("PURCHASE_ORDER", kinds)
        self.assertIn("SALES_ORDER", kinds)
        self.assertIn("LETTER_OF_CREDIT", kinds)
        self.assertIn("BILL_OF_LADING", kinds)
        self.assertIn("PACKING_LIST", kinds)
        self.assertIn("PIPELINE_STATEMENT", kinds)
        self.assertIn("PRICE_PUBLICATION", kinds)
        self.assertIn("QUALITY_SPECIFICATION", kinds)
        self.assertEqual(len(kinds), len(body["document_kinds"]))
        self.assertTrue(any(field["field_key"] == "invoice_number" for field in kinds["INVOICE"]["header_fields"]))
        self.assertTrue(any(field["field_key"] == "purchase_order_number" for field in kinds["PURCHASE_ORDER"]["header_fields"]))
        self.assertTrue(any(template["template_key"] == "order_lines" for template in kinds["PURCHASE_ORDER"]["table_templates"]))
        self.assertTrue(any(field["field_key"] == "sales_order_number" for field in kinds["SALES_ORDER"]["header_fields"]))
        self.assertTrue(any(template["template_key"] == "order_lines" for template in kinds["SALES_ORDER"]["table_templates"]))
        self.assertTrue(any(field["field_key"] == "letter_of_credit_number" for field in kinds["LETTER_OF_CREDIT"]["header_fields"]))
        self.assertTrue(any(field["field_key"] == "delivery_order_number" for field in kinds["PACKING_LIST"]["header_fields"]))
        self.assertTrue(any(template["template_key"] == "packing_lines" for template in kinds["PACKING_LIST"]["table_templates"]))
        self.assertTrue(any(template["template_key"] == "line_items" for template in kinds["INVOICE"]["table_templates"]))
        self.assertEqual(kinds["INVOICE"]["extraction_schema_code"], "INVOICE.v1")
        self.assertTrue(kinds["INVOICE"]["deep_extraction_required"])
        invoice_extraction_objects = {
            entry["object_key"]: entry for entry in kinds["INVOICE"]["extraction_objects"]
        }
        self.assertIn("header", invoice_extraction_objects)
        self.assertIn("invoice_lines", invoice_extraction_objects)
        self.assertEqual(invoice_extraction_objects["invoice_lines"]["canonical_table"], "invoice_line")
        self.assertIn("line_items", invoice_extraction_objects["invoice_lines"]["table_template_keys"])
        self.assertIn("line_amounts_should_sum_to_total_when_lines_present", kinds["INVOICE"]["validation_rules"])
        self.assertIn("require_review_if_total_amount_mismatch", kinds["INVOICE"]["review_rules"])
        invoice_facets = {facet["facet_key"]: facet for facet in kinds["INVOICE"]["facets"]}
        self.assertIn("economic_purpose", invoice_facets)
        self.assertIn("invoice_stage", invoice_facets)
        self.assertIn("accounting_direction", invoice_facets)
        self.assertIn("line_charge_type", invoice_facets)
        self.assertEqual(invoice_facets["line_charge_type"]["value_type"], "multi_select")
        self.assertTrue(
            any(value["code"] == "freight" for value in invoice_facets["economic_purpose"]["allowed_values"])
        )
        bill_of_lading_facets = {facet["facet_key"]: facet for facet in kinds["BILL_OF_LADING"]["facets"]}
        self.assertIn("transport_mode", bill_of_lading_facets)
        self.assertIn("legal_role", bill_of_lading_facets)
        self.assertTrue(
            any(value["code"] == "vessel" for value in bill_of_lading_facets["transport_mode"]["allowed_values"])
        )
        self.assertEqual(kinds["BILL_OF_LADING"]["extraction_schema_code"], "BOL.v1")
        bol_extraction_objects = {
            entry["object_key"]: entry for entry in kinds["BILL_OF_LADING"]["extraction_objects"]
        }
        self.assertIn("cargo_lines", bol_extraction_objects)
        self.assertEqual(bol_extraction_objects["cargo_lines"]["canonical_table"], "bol_cargo")
        self.assertEqual(kinds["PACKING_LIST"]["extraction_schema_code"], "PACKING_LIST.v1")
        packing_list_facets = {facet["facet_key"]: facet for facet in kinds["PACKING_LIST"]["facets"]}
        self.assertIn("transport_mode", packing_list_facets)
        packing_list_extraction_objects = {
            entry["object_key"]: entry for entry in kinds["PACKING_LIST"]["extraction_objects"]
        }
        self.assertIn("packing_lines", packing_list_extraction_objects)
        self.assertEqual(packing_list_extraction_objects["packing_lines"]["canonical_table"], "packing_list_line")
        self.assertEqual(kinds["UNKNOWN"]["facets"], [])
        self.assertIsNone(kinds["UNKNOWN"]["extraction_schema_code"])
        self.assertEqual(kinds["TRADE_CONFIRMATION"]["document_family"], "TRADE_EXECUTION")
        self.assertEqual(kinds["DEAL_RECAP"]["document_family"], "TRADE_EXECUTION")
        self.assertEqual(kinds["PRICE_PUBLICATION"]["document_family"], "MARKET_DATA")
        self.assertIn("trade_id", kinds["TRADE_CONFIRMATION"]["matching_keys"])
        self.assertIn("letter_of_credit_number", kinds["LETTER_OF_CREDIT"]["matching_keys"])
        self.assertIn("price_index_code", kinds["PRICE_PUBLICATION"]["matching_keys"])
        self.assertTrue(any(target["record_type"] == "TRADE" for target in kinds["TRADE_CONFIRMATION"]["record_targets"]))
        self.assertTrue(
            any(target["record_type"] == "PRICE_INDEX_OBSERVATION" for target in kinds["PRICE_PUBLICATION"]["record_targets"])
        )
        self.assertTrue(any(field["field_key"] == "price" for field in kinds["PRICE_PUBLICATION"]["header_fields"]))
        self.assertTrue(any(template["template_key"] == "price_lines" for template in kinds["PRICE_PUBLICATION"]["table_templates"]))
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
            "deal-recap.pdf": (
                "DEAL_RECAP",
                """
                Deal Recap
                Recap Date: 2026-04-08
                Counterparty: Shell Trading
                Commodity: WTI
                Quantity: 1000 bbl
                Price: USD 79.25
                """,
            ),
            "purchase-order-28561.pdf": (
                "PURCHASE_ORDER",
                """
                Purchase Order
                Purchase Order No 28561
                Buyer: Gulf Trading LLC
                Seller: Atlantic Fuels
                Commodity: ULSD
                Quantity: 10000 bbl
                Vessel: MT Example
                """,
            ),
            "sales-order-so-4412.pdf": (
                "SALES_ORDER",
                """
                Sales Order
                Sales Order No SO-4412
                Customer: Gulf Trading LLC
                Seller: Atlantic Fuels
                Commodity: ULSD
                Quantity: 8000 bbl
                Vessel: MT Example
                """,
            ),
            "letter-of-credit.pdf": (
                "LETTER_OF_CREDIT",
                """
                Letter of Credit
                Letter of Credit Number: LC-4488
                Expiry Date: 2026-05-31
                Issuing Bank: First Commodity Bank
                Applicant: Gulf Trading LLC
                Beneficiary: Shell Trading
                Amount: USD 500000
                """,
            ),
            "nomination.pdf": (
                "NOMINATION",
                """
                Pipeline Nomination
                Nomination Reference: NOM-700
                Flow Date: 2026-04-12
                Pipeline System: NGPL
                Contract Number: CN-900
                Quantity: 10000 MMBtu
                """,
            ),
            "curtailment-notice.pdf": (
                "CURTAILMENT_NOTICE",
                """
                Curtailment Notice
                Curtailment Notice Number: CURT-100
                Notice Date: 2026-04-13
                Effective Start: 2026-04-14 06:00
                Issuing Entity: NGPL
                Pipeline System: NGPL
                Nomination Reference: NOM-700
                Curtailed Quantity: 2500 MMBtu
                """,
            ),
            "railcar-ticket.pdf": (
                "RAILCAR_TICKET",
                """
                Railcar Ticket
                Waybill Number: WB-77
                Railcar Number: UTLX12345
                Carrier: BNSF
                Load Date: 2026-04-11
                """,
            ),
            "dispatch-notice.pdf": (
                "DISPATCH_NOTICE",
                """
                Dispatch Notice
                Dispatch Number: DSP-55
                Dispatch Date: 2026-04-12
                Delivery ID: DEL-900
                Carrier: Fleet Hauling
                Asset Reference: TRUCK-12
                Quantity: 800 bbl
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
            "packing-list.pdf": (
                "PACKING_LIST",
                """
                Packing List
                Delivery Order No. 8010842123
                Loading Date: 2026-04-07
                Delivery Date: 2026-04-07
                Cust. Ref No: 411064
                Quantity and Description of Goods    Package    Gross Wt.    Net Wt.
                PALMERA DM-10 DIMER ACID    1    19,700 MT    19,700 MT
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
            "inspection-report.pdf": (
                "INSPECTION_REPORT",
                """
                Inspection Report
                Inspection Report Number: IR-200
                Inspection Date: 2026-04-10
                Inspector: SGS
                Product: Gasoline
                """,
            ),
            "force-majeure-notice.pdf": (
                "FORCE_MAJEURE_NOTICE",
                """
                Force Majeure Notice
                Force Majeure Notice Number: FM-77
                Notice Date: 2026-04-15
                Counterparty: Shell Trading
                Contract Number: CN-900
                Event Start: 2026-04-15
                Affected Location: Houston Terminal
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
            "certificate-of-origin.pdf": (
                "CERTIFICATE_OF_ORIGIN",
                """
                Certificate of Origin
                Certificate Number: COO-900
                Origin Country: Canada
                Product: Crude Oil
                Bill of Lading Number: BOL-88
                """,
            ),
            "notice-of-readiness.pdf": (
                "NOTICE_OF_READINESS",
                """
                Notice of Readiness
                Notice Date: 2026-04-12
                Vessel Name: Energy Star
                Voyage Number: V-100
                Load Port: Houston
                """,
            ),
            "demurrage-claim.pdf": (
                "DEMURRAGE_CLAIM",
                """
                Demurrage Claim
                Claim Number: DEM-44
                Claim Date: 2026-04-18
                Counterparty: Shell Trading
                Claim Amount: USD 12500
                Bill of Lading Number: BOL-88
                """,
            ),
            "payment-advice.pdf": (
                "PAYMENT_ADVICE",
                """
                Payment Advice
                Payment Reference: PAY-123
                Advice Date: 2026-04-20
                Invoice Number: INV-1007
                Amount: USD 79250
                """,
            ),
            "outage-notice.pdf": (
                "OUTAGE_NOTICE",
                """
                Outage Notice
                Outage Number: OUT-12
                Notice Date: 2026-04-11
                Facility: Houston Terminal
                Outage Start: 2026-04-12 06:00
                Reason: Planned maintenance
                """,
            ),
            "storage-statement.pdf": (
                "STORAGE_STATEMENT",
                """
                Storage Statement
                Statement Number: STOR-33
                Facility: Houston Terminal
                Product: ULSD
                Inventory Quantity: 50000 bbl
                """,
            ),
            "price-publication.pdf": (
                "PRICE_PUBLICATION",
                """
                Price Publication
                Publication Date: 2026-04-15
                Observation Date: 2026-04-15
                Price Index Code: WTI_CUSHING_D
                Publisher: EIA
                Commodity: WTI
                Location: Cushing
                Price: USD 84.25
                Currency: USD
                Unit: BBL
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
        self.assertEqual(payload["ai_processing_confidence_threshold"], 0.46)

        providers = {row["provider"]: row for row in payload["providers"]}
        self.assertTrue(providers["openai"]["configured"])
        self.assertIn("gpt-5", providers["openai"]["available_models"])
        self.assertIn("gpt-5-mini", providers["openai"]["available_models"])
        self.assertFalse(providers["anthropic"]["configured"])
        self.assertIn("claude-sonnet-4-0", providers["anthropic"]["available_models"])
        self.assertTrue(providers["anthropic"]["is_default"])
        self.assertIn("gemini-2.5-pro", providers["google"]["available_models"])
        self.assertEqual(providers["google"]["setup_env_var"], "GOOGLE_API_KEY")

    def test_document_processor_settings_include_gmail_inbox_runtime(self) -> None:
        admin_token = self._bootstrap_admin()
        self._configure_gmail_inbox()

        response = self.client.get(
            "/documents/settings",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("gmail_inbox", payload)
        self.assertEqual(
            payload["gmail_inbox"],
            {
                "enabled": True,
                "configured": True,
                "provider": "gmail_api",
                "account_email": "ops-inbox@example.com",
                "query": "has:attachment filename:pdf in:inbox",
                "max_messages_per_import": 10,
                "auth_status": "configured",
            },
        )

    def test_gmail_message_browser_lists_recent_messages(self) -> None:
        admin_token = self._bootstrap_admin()
        self._configure_gmail_inbox()

        with self.SessionLocal() as session:
            session.add(
                GmailInboxImportReceipt(
                    gmail_message_id="gmail-msg-1",
                    gmail_thread_id="gmail-thread-1",
                    gmail_part_token="attachment-1",
                    gmail_attachment_id="attachment-1",
                    gmail_subject="May Settlement Package",
                    gmail_sender="backoffice@example.com",
                    gmail_received_at=datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc),
                    document_id="DOC-IMPORTED-1",
                    imported_at=datetime(2026, 5, 7, 12, 5, tzinfo=timezone.utc),
                    imported_by="doc_admin",
                    version=1,
                )
            )
            session.commit()

        fake_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    settings.GMAIL_INBOX_TOKEN_URL,
                    200,
                    {"access_token": "gmail-access-token"},
                )
            ],
            get_responses=[
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages",
                    200,
                    {
                        "messages": [
                            {"id": "gmail-msg-1", "threadId": "gmail-thread-1"},
                            {"id": "gmail-msg-2", "threadId": "gmail-thread-2"},
                        ],
                        "nextPageToken": "next-page-token",
                    },
                ),
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages/gmail-msg-1",
                    200,
                    {
                        "id": "gmail-msg-1",
                        "threadId": "gmail-thread-1",
                        "snippet": "May settlement package attached.",
                        "internalDate": "1746612345000",
                        "labelIds": ["INBOX", "UNREAD"],
                        "payload": {
                            "headers": [
                                {"name": "Subject", "value": "May Settlement Package"},
                                {"name": "From", "value": "backoffice@example.com"},
                            ],
                            "parts": [
                                {
                                    "partId": "1",
                                    "filename": "settlement.pdf",
                                    "mimeType": "application/pdf",
                                    "body": {"attachmentId": "attachment-1", "size": 1024},
                                },
                                {
                                    "partId": "2",
                                    "filename": "terminal.png",
                                    "mimeType": "image/png",
                                    "body": {"attachmentId": "attachment-2", "size": 256},
                                },
                            ],
                        },
                    },
                ),
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages/gmail-msg-2",
                    200,
                    {
                        "id": "gmail-msg-2",
                        "threadId": "gmail-thread-2",
                        "snippet": "Reminder about hedging review.",
                        "internalDate": "1746615345000",
                        "labelIds": ["INBOX"],
                        "payload": {
                            "headers": [
                                {"name": "Subject", "value": "Hedging Review Reminder"},
                                {"name": "From", "value": "risk@example.com"},
                            ],
                            "parts": [],
                        },
                    },
                ),
            ],
        )

        with patch(
            "apps.api.app.domains.integrations.services.gmail_inbox.httpx.Client",
            return_value=fake_client,
        ):
            response = self.client.get(
                "/documents/gmail/messages",
                headers={"Authorization": f"Bearer {admin_token}"},
                params={"page_size": 2},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["query"], "has:attachment filename:pdf in:inbox")
        self.assertEqual(payload["page_size"], 2)
        self.assertEqual(payload["next_page_token"], "next-page-token")
        self.assertEqual(len(payload["messages"]), 2)
        self.assertEqual(payload["messages"][0]["message_id"], "gmail-msg-1")
        self.assertEqual(payload["messages"][0]["subject"], "May Settlement Package")
        self.assertEqual(payload["messages"][0]["sender"], "backoffice@example.com")
        self.assertTrue(payload["messages"][0]["unread"])
        self.assertEqual(payload["messages"][0]["attachment_count"], 2)
        self.assertEqual(payload["messages"][0]["pdf_attachment_count"], 1)
        self.assertEqual(payload["messages"][0]["imported_pdf_attachment_count"], 1)
        self.assertEqual(payload["messages"][1]["message_id"], "gmail-msg-2")
        self.assertEqual(payload["messages"][1]["attachment_count"], 0)
        self.assertFalse(payload["messages"][1]["unread"])

    def test_gmail_message_browser_returns_message_detail_with_body_and_attachment_status(self) -> None:
        admin_token = self._bootstrap_admin()
        self._configure_gmail_inbox()
        body_text = "Settlement statement attached.\nPlease review by EOD."
        inline_body = base64.urlsafe_b64encode(body_text.encode("utf-8")).decode("ascii").rstrip("=")

        with self.SessionLocal() as session:
            session.add(
                GmailInboxImportReceipt(
                    gmail_message_id="gmail-msg-1",
                    gmail_thread_id="gmail-thread-1",
                    gmail_part_token="attachment-1",
                    gmail_attachment_id="attachment-1",
                    gmail_subject="May Settlement Package",
                    gmail_sender="backoffice@example.com",
                    gmail_received_at=datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc),
                    document_id="DOC-IMPORTED-1",
                    imported_at=datetime(2026, 5, 7, 12, 5, tzinfo=timezone.utc),
                    imported_by="doc_admin",
                    version=1,
                )
            )
            session.commit()

        fake_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    settings.GMAIL_INBOX_TOKEN_URL,
                    200,
                    {"access_token": "gmail-access-token"},
                )
            ],
            get_responses=[
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages/gmail-msg-1",
                    200,
                    {
                        "id": "gmail-msg-1",
                        "threadId": "gmail-thread-1",
                        "snippet": "Settlement statement attached.",
                        "internalDate": "1746612345000",
                        "labelIds": ["INBOX", "UNREAD"],
                        "payload": {
                            "headers": [
                                {"name": "Subject", "value": "May Settlement Package"},
                                {"name": "From", "value": "backoffice@example.com"},
                                {"name": "To", "value": "ops-inbox@example.com"},
                            ],
                            "parts": [
                                {
                                    "partId": "0",
                                    "mimeType": "text/plain",
                                    "body": {"data": inline_body},
                                },
                                {
                                    "partId": "1",
                                    "filename": "settlement.pdf",
                                    "mimeType": "application/pdf",
                                    "body": {"attachmentId": "attachment-1", "size": 2048},
                                },
                                {
                                    "partId": "2",
                                    "filename": "cover-note.txt",
                                    "mimeType": "text/plain",
                                    "body": {"attachmentId": "attachment-2", "size": 128},
                                },
                            ],
                        },
                    },
                )
            ],
        )

        with patch(
            "apps.api.app.domains.integrations.services.gmail_inbox.httpx.Client",
            return_value=fake_client,
        ):
            response = self.client.get(
                "/documents/gmail/messages/gmail-msg-1",
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["message_id"], "gmail-msg-1")
        self.assertEqual(payload["subject"], "May Settlement Package")
        self.assertEqual(payload["sender"], "backoffice@example.com")
        self.assertEqual(payload["to_recipients"], "ops-inbox@example.com")
        self.assertTrue(payload["unread"])
        self.assertEqual(payload["body_text"], body_text)
        self.assertFalse(payload["body_truncated"])
        self.assertEqual(len(payload["attachments"]), 2)
        self.assertEqual(payload["attachments"][0]["filename"], "settlement.pdf")
        self.assertTrue(payload["attachments"][0]["importable"])
        self.assertTrue(payload["attachments"][0]["already_imported"])
        self.assertEqual(payload["attachments"][1]["filename"], "cover-note.txt")
        self.assertFalse(payload["attachments"][1]["importable"])
        self.assertFalse(payload["attachments"][1]["already_imported"])

    def test_gmail_import_route_imports_pdf_attachments_once(self) -> None:
        admin_token = self._bootstrap_admin()
        self._configure_gmail_inbox()
        inline_pdf = base64.urlsafe_b64encode(self._build_pdf_bytes(page_count=1)).decode("ascii").rstrip("=")

        first_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    settings.GMAIL_INBOX_TOKEN_URL,
                    200,
                    {"access_token": "gmail-access-token"},
                )
            ],
            get_responses=[
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages",
                    200,
                    {"messages": [{"id": "gmail-msg-1", "threadId": "gmail-thread-1"}]},
                ),
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages/gmail-msg-1",
                    200,
                    {
                        "id": "gmail-msg-1",
                        "threadId": "gmail-thread-1",
                        "internalDate": "1746612345000",
                        "payload": {
                            "headers": [
                                {"name": "Subject", "value": "May Settlement Package"},
                                {"name": "From", "value": "backoffice@example.com"},
                            ],
                            "parts": [
                                {
                                    "partId": "1",
                                    "filename": "settlement.pdf",
                                    "mimeType": "application/pdf",
                                    "body": {"data": inline_pdf},
                                }
                            ],
                        },
                    },
                ),
            ],
        )

        with patch(
            "apps.api.app.domains.integrations.services.gmail_inbox.httpx.Client",
            return_value=first_client,
        ):
            first_response = self.client.post(
                "/documents/imports/gmail",
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        self.assertEqual(first_response.status_code, 202)
        first_payload = first_response.json()
        self.assertEqual(first_payload["query"], "has:attachment filename:pdf in:inbox")
        self.assertEqual(first_payload["matched_message_count"], 1)
        self.assertEqual(first_payload["matched_attachment_count"], 1)
        self.assertEqual(first_payload["imported_count"], 1)
        self.assertEqual(first_payload["skipped_count"], 0)
        self.assertEqual(len(first_payload["imported_documents"]), 1)
        self.assertEqual(first_payload["imported_documents"][0]["display_name"], "Gmail · May Settlement Package · settlement.pdf")
        self.assertEqual(first_payload["imported_documents"][0]["gmail_message_id"], "gmail-msg-1")
        self.assertEqual(first_payload["warnings"], [])

        with self.SessionLocal() as session:
            self.assertEqual(session.query(DocumentIngestion).count(), 1)
            self.assertEqual(session.query(GmailInboxImportReceipt).count(), 1)
            receipt = session.query(GmailInboxImportReceipt).one()
            self.assertEqual(receipt.gmail_message_id, "gmail-msg-1")
            self.assertEqual(receipt.gmail_part_token, "inline:1")
            self.assertEqual(receipt.document_id, first_payload["imported_documents"][0]["document_id"])

        second_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    settings.GMAIL_INBOX_TOKEN_URL,
                    200,
                    {"access_token": "gmail-access-token"},
                )
            ],
            get_responses=[
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages",
                    200,
                    {"messages": [{"id": "gmail-msg-1", "threadId": "gmail-thread-1"}]},
                ),
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages/gmail-msg-1",
                    200,
                    {
                        "id": "gmail-msg-1",
                        "threadId": "gmail-thread-1",
                        "internalDate": "1746612345000",
                        "payload": {
                            "headers": [
                                {"name": "Subject", "value": "May Settlement Package"},
                                {"name": "From", "value": "backoffice@example.com"},
                            ],
                            "parts": [
                                {
                                    "partId": "1",
                                    "filename": "settlement.pdf",
                                    "mimeType": "application/pdf",
                                    "body": {"data": inline_pdf},
                                }
                            ],
                        },
                    },
                ),
            ],
        )

        with patch(
            "apps.api.app.domains.integrations.services.gmail_inbox.httpx.Client",
            return_value=second_client,
        ):
            second_response = self.client.post(
                "/documents/imports/gmail",
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        self.assertEqual(second_response.status_code, 202)
        second_payload = second_response.json()
        self.assertEqual(second_payload["imported_count"], 0)
        self.assertEqual(second_payload["skipped_count"], 1)
        self.assertEqual(second_payload["warnings"], [])

        with self.SessionLocal() as session:
            self.assertEqual(session.query(DocumentIngestion).count(), 1)
            self.assertEqual(session.query(GmailInboxImportReceipt).count(), 1)

    def test_openai_document_processor_uses_strict_json_schema_format(self) -> None:
        text_format = _build_openai_text_format()

        def assert_strict_object_schemas(schema: dict[str, object]) -> None:
            if "anyOf" in schema:
                for option in schema["anyOf"]:
                    if isinstance(option, dict):
                        assert_strict_object_schemas(option)
                return
            if schema.get("type") == "array":
                items = schema.get("items")
                if isinstance(items, dict):
                    assert_strict_object_schemas(items)
                return
            if schema.get("type") != "object":
                return

            properties = schema.get("properties")
            self.assertIsInstance(properties, dict)
            assert isinstance(properties, dict)
            self.assertFalse(schema.get("additionalProperties", True))
            self.assertEqual(set(schema.get("required", [])), set(properties))
            for value in properties.values():
                if isinstance(value, dict):
                    assert_strict_object_schemas(value)

        self.assertEqual(text_format["type"], "json_schema")
        self.assertEqual(text_format["name"], "document_page_analysis")
        self.assertTrue(text_format["strict"])
        self.assertEqual(text_format["schema"]["type"], "object")
        self.assertFalse(text_format["schema"]["additionalProperties"])
        self.assertIn("pages", text_format["schema"]["properties"])
        assert_strict_object_schemas(text_format["schema"])
        page_schema = text_format["schema"]["properties"]["pages"]["items"]
        table_schema = page_schema["properties"]["table_blocks"]["items"]
        row_schema = table_schema["properties"]["rows"]["items"]
        self.assertEqual(set(row_schema["properties"]), {"cells"})

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
                                "table_blocks": [
                                    {
                                        "template_key": "line_items",
                                        "title": "Charges",
                                        "columns": ["description", "quantity", "line_amount"],
                                        "rows": [
                                            {
                                                "cells": [
                                                    {"column": "description", "value": "WTI April"},
                                                    {"column": "quantity", "value": "1000"},
                                                    {"column": "line_amount", "value": "79250"},
                                                ]
                                            }
                                        ],
                                        "header_row_detected": True,
                                        "confidence": 0.92,
                                    }
                                ],
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
        self.assertEqual(result.pages[0].table_blocks[0].rows[0]["description"], "WTI April")
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

    def test_low_confidence_upload_uses_configured_ai_fallback(self) -> None:
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
                        document_subtype="AI_FALLBACK",
                        confidence=0.96,
                        header_fields=[
                            {
                                "field_key": "invoice_number",
                                "label": "Invoice Number",
                                "value": "INV-LOW-1",
                                "confidence": 0.96,
                                "source": "openai:document_ai",
                            }
                        ],
                        table_blocks=[],
                        warnings=["AI fallback resolved the low-confidence page."],
                    )
                ],
            ),
            [],
        )

        with patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=fake_processor_outcome,
        ) as processor_mock:
            uploaded = self._upload_document(
                admin_token,
                filename="invoice-batch.pdf",
                page_count=1,
            )
            analyzed = self._wait_for_document(admin_token, uploaded["document_id"])

        processor_mock.assert_called_once()
        page = analyzed["pages"][0]
        self.assertEqual(analyzed["processor_provider"], "openai")
        self.assertEqual(analyzed["processor_model"], "gpt-5-mini")
        self.assertTrue(analyzed["processor_trace"]["applied"])
        self.assertEqual(page["document_kind"], "INVOICE")
        self.assertEqual(page["document_subtype"], "AI_FALLBACK")
        self.assertEqual(page["classification_payload"]["heuristic_document_kind"], "OTHER")
        self.assertEqual(page["classification_payload"]["heuristic_document_subtype"], "FILENAME_HINT_ONLY")
        self.assertEqual(page["classification_payload"]["processor_provider"], "openai")
        self.assertTrue(page["classification_payload"]["processor_applied"])
        self.assertTrue(page["processor_trace"]["applied"])
        self.assertIn("AI fallback resolved the low-confidence page.", page["processing_warnings"])

    def test_high_confidence_upload_skips_ai_fallback(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"
        raw_text = "\n".join(
            [
                "INVOICE",
                "Invoice Number: INV-9001",
                "Invoice Date: 2026-04-06",
                "Due Date: 2026-04-15",
                "Counterparty: Shell Trading",
                "Total Amount: USD 79250",
            ]
        )

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            return_value=(raw_text, []),
        ), patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=(None, []),
        ) as processor_mock:
            uploaded = self._upload_document(
                admin_token,
                filename="invoice-packet.pdf",
                page_count=1,
            )
            analyzed = self._wait_for_document(admin_token, uploaded["document_id"])

        processor_mock.assert_not_called()
        page = analyzed["pages"][0]
        self.assertEqual(page["document_kind"], "INVOICE")
        self.assertGreaterEqual(page["classification_confidence"], 0.46)
        self.assertFalse(page["classification_payload"].get("processor_applied", False))
        self.assertEqual(page["classification_payload"]["ai_processing_confidence_threshold"], 0.46)
        self.assertFalse(page["classification_payload"]["ai_processing_required"])

    def test_upload_can_raise_ai_fallback_threshold_for_high_confidence_pages(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"
        raw_text = "\n".join(
            [
                "INVOICE",
                "Invoice Number: INV-9002",
                "Invoice Date: 2026-04-06",
                "Due Date: 2026-04-15",
                "Counterparty: Shell Trading",
                "Total Amount: USD 79250",
            ]
        )
        fake_processor_outcome = (
            DocumentProcessorOutcome(
                provider="openai",
                model="gpt-5-mini",
                pages=[
                    DocumentProcessorPageResult(
                        page_number=1,
                        document_kind="INVOICE",
                        document_subtype="AI_THRESHOLD",
                        confidence=0.97,
                        header_fields=[],
                        table_blocks=[],
                        warnings=["AI threshold selected this high-confidence page."],
                    )
                ],
            ),
            [],
        )

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            return_value=(raw_text, []),
        ), patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=fake_processor_outcome,
        ) as processor_mock:
            response = self.client.post(
                "/documents/uploads",
                headers={"Authorization": f"Bearer {admin_token}"},
                files={"file": ("invoice-packet.pdf", self._build_pdf_bytes(page_count=1), "application/pdf")},
                data={"processor_provider": "openai", "ai_confidence_threshold": "1"},
            )
            self.assertEqual(response.status_code, 201)
            uploaded = response.json()
            analyzed = self._wait_for_document(admin_token, uploaded["document_id"])

        processor_mock.assert_called_once()
        page = analyzed["pages"][0]
        self.assertEqual(page["document_subtype"], "AI_THRESHOLD")
        self.assertTrue(page["classification_payload"]["ai_processing_required"])
        self.assertEqual(page["classification_payload"]["ai_processing_confidence_threshold"], 1.0)
        self.assertIn("AI threshold selected this high-confidence page.", page["processing_warnings"])

    def test_activity_log_preserves_original_classification_and_reprocess_history(self) -> None:
        admin_token = self._bootstrap_admin()
        invoice_text = "\n".join(
            [
                "Invoice",
                "Invoice Number: INV-1007",
                "Invoice Date: 2026-04-06",
                "Due Date: 2026-04-15",
                "Counterparty: Shell Trading",
                "Total Amount: USD 79250",
                "",
                "Description  Quantity  Line Amount",
                "WTI April  1000  79250",
            ]
        )
        confirmation_text = "\n".join(
            [
                "Trade Confirmation",
                "Confirmation Number: CONF-3301",
                "Trade ID: T-3301",
                "Trade Date: 2026-04-08",
                "Counterparty: Shell Trading",
                "",
                "Term Name  Term Value",
                "Pricing Period  April 2026",
            ]
        )

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            return_value=(invoice_text, []),
        ):
            uploaded = self._upload_document(admin_token, filename="invoice-1007.pdf", page_count=1)
            document = self._wait_for_document(admin_token, uploaded["document_id"])

        original_classification_events = [
            entry for entry in document["activity"] if entry["event_type"] == "DocumentClassified"
        ]
        self.assertEqual(len(original_classification_events), 1)
        self.assertEqual(original_classification_events[0]["label"], "Original Classification")
        self.assertEqual(original_classification_events[0]["payload"]["classification"]["document_kind"], "INVOICE")
        self.assertIn("Originally classified as INVOICE", original_classification_events[0]["detail"])

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            return_value=(confirmation_text, []),
        ):
            response = self.client.post(
                f"/documents/{uploaded['document_id']}/reprocess",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            self.assertEqual(response.status_code, 202)
            reprocessed = self._wait_for_document(admin_token, uploaded["document_id"])

        activity = reprocessed["activity"]
        classified_events = [entry for entry in activity if entry["event_type"] == "DocumentClassified"]
        reprocess_events = [entry for entry in activity if entry["event_type"] == "DocumentReprocessRequested"]
        self.assertEqual(len(classified_events), 2)
        self.assertEqual(len(reprocess_events), 1)
        latest_classification = classified_events[0]
        original_classification = classified_events[-1]
        self.assertEqual(latest_classification["label"], "Reclassified")
        self.assertEqual(latest_classification["payload"]["classification"]["document_kind"], "TRADE_CONFIRMATION")
        self.assertIn("Reclassified as TRADE CONFIRMATION", latest_classification["detail"])
        self.assertEqual(original_classification["label"], "Original Classification")
        self.assertEqual(original_classification["payload"]["classification"]["document_kind"], "INVOICE")
        self.assertEqual(
            reprocess_events[0]["payload"]["previous_classification"]["document_kind"],
            "INVOICE",
        )
        self.assertIn("Prior classification: INVOICE", reprocess_events[0]["detail"])

    def test_upload_can_force_built_in_parser_only(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"

        with patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=(None, []),
        ) as processor_mock:
            response = self.client.post(
                "/documents/uploads",
                headers={"Authorization": f"Bearer {admin_token}"},
                files={"file": ("invoice-batch.pdf", self._build_pdf_bytes(page_count=1), "application/pdf")},
                data={"processor_provider": "builtin"},
            )

        self.assertEqual(response.status_code, 201)
        uploaded = response.json()
        processor_mock.assert_not_called()
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
        self.assertEqual(page["processor_trace"]["heuristic_document_kind"], "OTHER")
        self.assertTrue(page["processor_trace"]["overrode_heuristics"])
        self.assertTrue(any(field["field_key"] == "invoice_number" for field in page["header_fields"]))
        self.assertTrue(any(table["template_key"] == "line_items" for table in page["table_blocks"]))
        self.assertIn("Document AI result applied.", page["processing_warnings"])

    def test_upload_can_choose_a_non_default_processor_model(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"

        fake_processor_outcome = (
            DocumentProcessorOutcome(
                provider="openai",
                model="gpt-5",
                pages=[
                    DocumentProcessorPageResult(
                        page_number=1,
                        document_kind="INVOICE",
                        document_subtype="GPT_5_PASS",
                        confidence=0.98,
                        header_fields=[],
                        table_blocks=[],
                        warnings=[],
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
                data={"processor_provider": "openai", "processor_model": "gpt-5"},
            )

        self.assertEqual(response.status_code, 201)
        uploaded = response.json()
        self.assertEqual(uploaded["processor_provider"], "openai")
        self.assertEqual(uploaded["processor_model"], "gpt-5")

        analyzed = self._wait_for_document(admin_token, uploaded["document_id"])
        self.assertEqual(analyzed["processor_model"], "gpt-5")
        self.assertEqual(analyzed["pages"][0]["document_subtype"], "GPT_5_PASS")

    def test_reprocess_can_switch_document_processor_provider(self) -> None:
        admin_token = self._bootstrap_admin()
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.GOOGLE_API_KEY = "google-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"
        settings.GOOGLE_MODEL = "gemini-2.5-flash"

        with patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=(None, ["Initial AI fallback skipped in test."]),
        ):
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

    def test_status_only_document_verification_does_not_require_extracted_page_fields(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=1)
        document = self._wait_for_document(admin_token, uploaded["document_id"])
        page = document["pages"][0]

        classify_response = self.client.patch(
            f"/documents/{document['document_id']}/pages/{page['page_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"document_kind": "PRICE_PUBLICATION"},
        )
        self.assertEqual(classify_response.status_code, 200)

        verify_response = self.client.patch(
            f"/documents/{document['document_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "review_status": "VERIFIED",
                "verification_mode": "STATUS_ONLY",
            },
        )
        self.assertEqual(verify_response.status_code, 200)
        verify_body = verify_response.json()
        self.assertEqual(verify_body["review_status"], "VERIFIED")
        self.assertEqual(verify_body["reviewed_by"], "doc_admin")
        self.assertEqual(verify_body["pages"][0]["review_status"], "UNREVIEWED")
        self.assertFalse(verify_body["analysis_summary"]["review_ready"])

    def test_saved_classification_correction_is_reused_for_matching_document_content(self) -> None:
        admin_token = self._bootstrap_admin()
        first_raw_text = "\n".join(
            [
                "INVOICE NUMBER INV-9001",
                "INVOICE DATE 2026-04-06",
                "DUE DATE 2026-04-15",
                "COUNTERPARTY Shell Trading",
                "TRADE ID T-INV-9001",
                "TOTAL AMOUNT USD 79250",
            ]
        )
        second_raw_text = "\n".join(
            [
                "INVOICE NUMBER INV-9002",
                "INVOICE DATE 2026-05-06",
                "DUE DATE 2026-05-15",
                "COUNTERPARTY Shell Trading",
                "TRADE ID T-INV-9002",
                "TOTAL AMOUNT USD 80400",
            ]
        )

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            return_value=(first_raw_text, []),
        ), patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=(None, []),
        ):
            first_upload = self._upload_document(
                admin_token,
                filename="desk-upload-alpha.pdf",
                page_count=1,
            )
        first_document = self._wait_for_document(admin_token, first_upload["document_id"])
        first_page = first_document["pages"][0]

        self.assertEqual(first_page["document_kind"], "INVOICE")
        self.assertEqual(first_page["classification_payload"]["system_document_kind"], "INVOICE")
        self.assertGreater(len(first_page["classification_payload"]["content_features"]), 0)
        self.assertEqual(first_document["analysis_summary"]["corrected_page_count"], 0)

        correction_response = self.client.patch(
            f"/documents/{first_document['document_id']}/pages/{first_page['page_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "document_kind": "TRADE_CONFIRMATION",
                "document_subtype": "DESK_REVIEWED",
                "review_notes": "Desk reviewed the upload and corrected the document kind.",
            },
        )
        self.assertEqual(correction_response.status_code, 200)
        corrected_document = correction_response.json()
        corrected_page = corrected_document["pages"][0]
        corrected_payload = corrected_page["classification_payload"]

        self.assertEqual(corrected_page["document_kind"], "TRADE_CONFIRMATION")
        self.assertEqual(corrected_page["document_subtype"], "DESK_REVIEWED")
        self.assertTrue(corrected_payload["classification_corrected"])
        self.assertEqual(corrected_payload["system_document_kind"], "INVOICE")
        self.assertEqual(corrected_payload["corrected_document_kind"], "TRADE_CONFIRMATION")
        self.assertEqual(corrected_payload["corrected_document_subtype"], "DESK_REVIEWED")
        self.assertEqual(corrected_payload["classification_correction_count"], 1)
        self.assertEqual(corrected_document["analysis_summary"]["corrected_page_count"], 1)

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            return_value=(second_raw_text, []),
        ), patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=(None, []),
        ):
            second_upload = self._upload_document(
                admin_token,
                filename="settlement-desk-note.pdf",
                page_count=1,
            )
        learned_document = self._wait_for_document(admin_token, second_upload["document_id"])
        learned_page = learned_document["pages"][0]
        learned_payload = learned_page["classification_payload"]

        self.assertEqual(learned_page["document_kind"], "TRADE_CONFIRMATION")
        self.assertEqual(learned_page["document_subtype"], "DESK_REVIEWED")
        self.assertTrue(learned_payload["learning_applied"])
        self.assertEqual(learned_payload["learning_example_count"], 1)
        self.assertEqual(learned_payload["automated_document_kind"], "INVOICE")
        self.assertEqual(learned_payload["automated_document_subtype"], None)
        self.assertEqual(learned_payload["system_document_kind"], "TRADE_CONFIRMATION")
        self.assertEqual(learned_payload["system_document_subtype"], "DESK_REVIEWED")
        self.assertEqual(learned_payload["system_classification_source"], "learning")
        self.assertEqual(learned_payload["learning_source"], "content_similarity")
        self.assertFalse(learned_payload["learning_filename_assist"])
        self.assertGreater(learned_payload["learning_similarity"], 0.5)
        self.assertEqual(learned_document["analysis_summary"]["learning_applied_page_count"], 1)

    def test_document_update_can_manually_set_document_kind_for_the_whole_file(self) -> None:
        admin_token = self._bootstrap_admin()
        uploaded = self._upload_document(admin_token, page_count=2)
        document = self._wait_for_document(admin_token, uploaded["document_id"])

        self.assertTrue(all(page["document_kind"] == "OTHER" for page in document["pages"]))

        update_response = self.client.patch(
            f"/documents/{document['document_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"document_kind": "DELIVERY_CONFIRMATION"},
        )
        self.assertEqual(update_response.status_code, 200)
        updated = update_response.json()

        self.assertEqual(updated["analysis_summary"]["dominant_document_kind"], "DELIVERY_CONFIRMATION")
        self.assertEqual(updated["analysis_summary"]["corrected_page_count"], 2)
        self.assertTrue(all(page["document_kind"] == "DELIVERY_CONFIRMATION" for page in updated["pages"]))
        self.assertTrue(all(page["classification_confidence"] == 1.0 for page in updated["pages"]))
        self.assertTrue(
            all(page["classification_payload"]["classification_corrected"] is True for page in updated["pages"])
        )
        self.assertTrue(
            all(
                page["classification_payload"]["corrected_document_kind"] == "DELIVERY_CONFIRMATION"
                for page in updated["pages"]
            )
        )

    def test_document_response_includes_typed_understanding_bundle(self) -> None:
        admin_token = self._bootstrap_admin()
        raw_text = "\n".join(
            [
                "INVOICE NUMBER INV-9001",
                "INVOICE DATE 2026-04-06",
                "TOTAL AMOUNT USD 79250",
                "DESCRIPTION    QUANTITY    LINE AMOUNT",
                "WTI APRIL      1000        79250",
            ]
        )
        header_fields = [
            {
                "field_key": "invoice_number",
                "label": "Invoice Number",
                "value": "INV-9001",
                "confidence": 0.92,
                "source": "heuristic",
            },
            {
                "field_key": "total_amount",
                "label": "Total Amount",
                "value": "79250",
                "confidence": 0.9,
                "source": "heuristic",
            },
        ]
        table_blocks = [
            {
                "table_index": 1,
                "template_key": "line_items",
                "title": "Charges",
                "columns": ["description", "quantity", "line_amount"],
                "rows": [
                    {
                        "description": "WTI APRIL",
                        "quantity": "1000",
                        "line_amount": "79250",
                    }
                ],
                "header_row_detected": True,
                "source": "heuristic",
            }
        ]

        with patch(
            "apps.api.app.domains.documents.services.ingestion._extract_page_text",
            return_value=(raw_text, []),
        ), patch(
            "apps.api.app.domains.documents.services.ingestion.extract_document_header_fields",
            return_value=header_fields,
        ), patch(
            "apps.api.app.domains.documents.services.ingestion.extract_document_table_blocks",
            return_value=table_blocks,
        ), patch(
            "apps.api.app.domains.documents.services.ingestion.run_document_processor_analysis",
            return_value=(None, []),
        ):
            uploaded = self._upload_document(
                admin_token,
                filename="invoice-packet.pdf",
                page_count=1,
            )

        document = self._wait_for_document(admin_token, uploaded["document_id"])
        page = document["pages"][0]
        page_understanding = page["understanding"]
        document_understanding = document["understanding"]

        self.assertEqual(page_understanding["bundle_version"], "document-understanding-v1")
        self.assertEqual(page_understanding["text_stats"]["source"], "pdf_text")
        self.assertTrue(page_understanding["text_stats"]["text_available"])
        self.assertGreater(page_understanding["text_stats"]["token_count"], 0)
        self.assertGreater(page_understanding["text_stats"]["currency_marker_count"], 0)
        self.assertIn("invoice_number", page_understanding["structure_signals"]["header_candidate_keys"])
        self.assertEqual(page_understanding["structure_signals"]["table_candidate_count"], 1)
        self.assertEqual(page_understanding["structure_signals"]["table_row_count"], 1)
        self.assertEqual(page_understanding["visual_signals"]["preview_available"], page["preview_available"])
        self.assertEqual(page_understanding["classification_evidence"]["system_document_kind"], "INVOICE")
        self.assertEqual(page_understanding["content_fingerprint"]["filename_signature"], "invoice packet")
        self.assertGreater(page_understanding["content_fingerprint"]["content_feature_count"], 0)
        self.assertEqual(page_understanding["deterministic_assessment"]["document_kind"], "INVOICE")
        self.assertGreater(page_understanding["deterministic_assessment"]["confidence"], 0.7)
        self.assertTrue(page_understanding["deterministic_assessment"]["supporting_evidence"])

        self.assertEqual(document_understanding["bundle_version"], "document-understanding-v1")
        self.assertEqual(document_understanding["page_count"], 1)
        self.assertEqual(document_understanding["text_stats"]["pages_with_text"], 1)
        self.assertEqual(document_understanding["text_stats"]["source_counts"]["pdf_text"], 1)
        self.assertGreater(document_understanding["text_stats"]["total_character_count"], 0)
        self.assertEqual(document_understanding["structure_signals"]["table_candidate_count"], 1)
        self.assertEqual(document_understanding["structure_signals"]["table_row_count"], 1)
        self.assertIn("line_items", document_understanding["structure_signals"]["table_template_keys"])
        self.assertEqual(
            document_understanding["visual_signals"]["preview_available_page_count"],
            1 if page["preview_available"] else 0,
        )
        self.assertGreater(document_understanding["content_fingerprint"]["content_feature_count"], 0)
        self.assertEqual(document_understanding["content_fingerprint"]["filename_signature"], "invoice packet")
        self.assertEqual(document_understanding["deterministic_assessment"]["document_kind"], "INVOICE")
        self.assertTrue(document_understanding["deterministic_assessment"]["supporting_evidence"])

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
        self.assertEqual(reanalyzed["pages"][0]["document_kind"], "OTHER")
        self.assertEqual(reanalyzed["pages"][0]["document_subtype"], "FILENAME_HINT_ONLY")

        with self.SessionLocal() as session:
            stored_document = session.get(DocumentIngestion, document["document_id"])
            stored_page = session.get(DocumentIngestionPage, page["page_id"])
            self.assertEqual(stored_document.review_status, "UNREVIEWED")
            self.assertIsNone(stored_document.reviewed_by)
            self.assertEqual(stored_page.review_status, "UNREVIEWED")
            self.assertIsNone(stored_page.reviewed_by)
