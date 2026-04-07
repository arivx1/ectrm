from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from hashlib import sha256
from io import BytesIO
import re
from pathlib import Path
from typing import Any, Callable, Optional
from uuid import uuid4

from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.domains.documents.services.schema_registry import build_document_schema_registry
from apps.api.app.domains.documents.services.schema_registry import get_document_kind_schema
from apps.api.app.domains.documents.services.schema_registry import list_supported_document_kinds
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentExtractedFieldOut
from apps.api.app.schemas.document import DocumentIngestionOut
from apps.api.app.schemas.document import DocumentIngestionPageOut
from apps.api.app.schemas.document import DocumentReviewStatus
from apps.api.app.schemas.document import DocumentSchemaRegistryOut
from apps.api.app.schemas.document import DocumentTableBlockOut

try:
    import pymupdf
except ImportError:  # pragma: no cover - dependency should be available in deployed environments
    pymupdf = None

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:  # pragma: no cover - dependency should be available in deployed environments
    RapidOCR = None

CLASSIFIER_VERSION = "heuristic-v1"
EXTRACTOR_VERSION = "regex-v2-preview-ocr"
DOCUMENT_PROCESSOR_ACTOR_ID = "document_processor"
RAW_TEXT_EXCERPT_LENGTH = 280
TABLE_LINE_SPLIT_PATTERN = re.compile(r"\t+|\s{2,}")
WHITESPACE_PATTERN = re.compile(r"\s+")
PREVIEW_SUBDIRECTORY = "previews"
PREVIEW_IMAGE_EXTENSION = ".png"
PREVIEW_IMAGE_MEDIA_TYPE = "image/png"


@dataclass(frozen=True)
class PageClassification:
    document_kind: str
    document_subtype: str | None
    confidence: float
    matched_by: str


@dataclass(frozen=True)
class FieldDefinition:
    field_key: str
    label: str
    patterns: tuple[str, ...]


FIELD_DEFINITIONS: dict[str, tuple[FieldDefinition, ...]] = {
    "INVOICE": (
        FieldDefinition("invoice_number", "Invoice Number", (r"invoice\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("invoice_date", "Invoice Date", (r"invoice\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("due_date", "Due Date", (r"due\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)", r"customer\s*[:#]?\s*(.+)")),
        FieldDefinition("total_amount", "Total Amount", (r"total\s*(?:amount|due)?\s*[:#]?\s*([$A-Z0-9,.\- ]+)",)),
    ),
    "TRADE_CONFIRMATION": (
        FieldDefinition(
            "confirmation_number",
            "Confirmation Number",
            (r"confirmation\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("trade_date", "Trade Date", (r"trade\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("trade_id", "Trade ID", (r"trade\s*(?:id|number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("counterparty", "Counterparty", (r"counterparty\s*[:#]?\s*(.+)",)),
    ),
    "BILL_OF_LADING": (
        FieldDefinition(
            "bill_of_lading_number",
            "Bill of Lading Number",
            (r"bill\s+of\s+lading\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("carrier", "Carrier", (r"carrier\s*[:#]?\s*(.+)",)),
        FieldDefinition("load_date", "Load Date", (r"(?:load|shipment)\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("origin", "Origin", (r"(?:origin|load\s+port)\s*[:#]?\s*(.+)",)),
        FieldDefinition("destination", "Destination", (r"(?:destination|discharge\s+port)\s*[:#]?\s*(.+)",)),
    ),
    "CERTIFICATE_OF_ANALYSIS": (
        FieldDefinition(
            "certificate_number",
            "Certificate Number",
            (r"certificate\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",),
        ),
        FieldDefinition("sample_date", "Sample Date", (r"sample\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("lot_number", "Lot Number", (r"lot\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("product", "Product", (r"product\s*[:#]?\s*(.+)",)),
    ),
    "SETTLEMENT_STATEMENT": (
        FieldDefinition("statement_number", "Statement Number", (r"statement\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("statement_date", "Statement Date", (r"statement\s*date\s*[:#]?\s*([A-Z0-9,\/\- ]+)",)),
        FieldDefinition("account", "Account", (r"account\s*[:#]?\s*(.+)",)),
    ),
    "WEIGH_TICKET": (
        FieldDefinition("ticket_number", "Ticket Number", (r"(?:weigh|scale)\s*ticket\s*(?:number|no\.?)\s*[:#]?\s*([A-Z0-9\-\/]+)",)),
        FieldDefinition("gross_weight", "Gross Weight", (r"gross\s*weight\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
        FieldDefinition("net_weight", "Net Weight", (r"net\s*weight\s*[:#]?\s*([A-Z0-9,.\- ]+)",)),
    ),
}

CLASSIFICATION_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("TRADE_CONFIRMATION", ("trade confirmation", "confirmation number", "confirmation no")),
    ("INVOICE", ("invoice", "invoice number", "invoice no", "amount due")),
    ("BILL_OF_LADING", ("bill of lading", "bol number", "bill of lading number")),
    ("CERTIFICATE_OF_ANALYSIS", ("certificate of analysis", "coa", "certificate number")),
    ("SETTLEMENT_STATEMENT", ("settlement statement", "statement of settlement")),
    ("WEIGH_TICKET", ("weigh ticket", "scale ticket", "gross weight", "net weight")),
)


def list_document_schema_registry() -> DocumentSchemaRegistryOut:
    return build_document_schema_registry()


def list_document_ingestions(
    db: Session,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[DocumentIngestionOut]:
    documents = (
        db.execute(
            select(DocumentIngestion)
            .order_by(DocumentIngestion.created_at.desc(), DocumentIngestion.document_id.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    if not documents:
        return []
    return _serialize_documents(db, documents)


def get_document_ingestion(db: Session, *, document_id: str) -> DocumentIngestionOut:
    document = db.get(DocumentIngestion, document_id)
    if document is None:
        raise LookupError(f"Document '{document_id}' was not found")
    return _serialize_documents(db, [document])[0]


def ingest_pdf_document(
    db: Session,
    *,
    actor_id: str,
    filename: str,
    content_type: str | None,
    payload: bytes,
    display_name: str | None = None,
) -> DocumentIngestionOut:
    if not payload:
        raise ValueError("The uploaded PDF was empty")
    if len(payload) > settings.DOCUMENT_MAX_UPLOAD_BYTES:
        raise ValueError(
            f"Uploaded PDF exceeds the {settings.DOCUMENT_MAX_UPLOAD_BYTES:,} byte limit"
        )
    normalized_filename = _normalize_filename(filename)
    normalized_display_name = _normalize_display_name(display_name, normalized_filename)
    normalized_content_type = (content_type or "application/pdf").strip() or "application/pdf"
    if normalized_content_type.lower() != "application/pdf" and not normalized_filename.lower().endswith(".pdf"):
        raise ValueError("Only PDF uploads are supported")
    if not payload.lstrip().startswith(b"%PDF-"):
        raise ValueError("The uploaded file is not a valid PDF")

    try:
        reader = PdfReader(BytesIO(payload))
    except PdfReadError as exc:
        raise ValueError("The uploaded PDF could not be read") from exc

    if reader.is_encrypted:
        raise ValueError("Encrypted PDFs are not supported yet")

    document_id = str(uuid4())
    now = datetime.now(timezone.utc)
    storage_key = _store_pdf_bytes(document_id=document_id, payload=payload)

    page_records = [
        DocumentIngestionPage(
            document_id=document_id,
            page_number=page_index,
            classification_status="PENDING",
            extraction_status="PENDING",
            document_kind="UNKNOWN",
            document_subtype=None,
            classification_confidence=None,
            classification_payload={},
            header_fields=[],
            table_blocks=[],
            raw_text=None,
            processing_warnings=[],
            processing_errors=[],
            review_status="UNREVIEWED",
            review_notes=None,
            reviewed_at=None,
            reviewed_by=None,
            processed_at=None,
            created_at=now,
            updated_at=now,
        )
        for page_index in range(1, len(reader.pages) + 1)
    ]

    document = DocumentIngestion(
        document_id=document_id,
        original_filename=normalized_filename,
        display_name=normalized_display_name,
        content_type=normalized_content_type,
        storage_key=storage_key,
        sha256=sha256(payload).hexdigest(),
        size_bytes=len(payload),
        page_count=len(page_records),
        status="UPLOADED",
        classifier_version=CLASSIFIER_VERSION,
        extractor_version=EXTRACTOR_VERSION,
        analysis_summary=_build_document_summary(page_records, review_status="UNREVIEWED"),
        processing_errors=[],
        review_status="UNREVIEWED",
        review_notes=None,
        reviewed_at=None,
        reviewed_by=None,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(document)
    for page_record in page_records:
        db.add(page_record)
    db.flush()
    return _serialize_documents(db, [document], preloaded_pages=page_records)[0]


def process_document_ingestion(
    db: Session,
    *,
    document_id: str,
    actor_id: str = DOCUMENT_PROCESSOR_ACTOR_ID,
    reset_review_state: bool = False,
) -> DocumentIngestionOut:
    document, pages = _load_document_and_pages(db, document_id=document_id)
    now = datetime.now(timezone.utc)
    document.status = "PROCESSING"
    document.processing_errors = []
    document.updated_at = now
    document.updated_by = actor_id
    document.analysis_summary = _build_document_summary(pages, review_status=document.review_status)

    if reset_review_state:
        document.review_status = "UNREVIEWED"
        document.review_notes = None
        document.reviewed_at = None
        document.reviewed_by = None

    for page in pages:
        _delete_document_page_preview(document_id=document.document_id, page_number=page.page_number)
        page.classification_status = "PENDING"
        page.extraction_status = "PENDING"
        page.document_kind = "UNKNOWN"
        page.document_subtype = None
        page.classification_confidence = None
        page.classification_payload = {}
        page.header_fields = []
        page.table_blocks = []
        page.raw_text = None
        page.processing_warnings = []
        page.processing_errors = []
        page.processed_at = None
        page.updated_at = now
        if reset_review_state:
            page.review_status = "UNREVIEWED"
            page.review_notes = None
            page.reviewed_at = None
            page.reviewed_by = None

    db.flush()

    try:
        payload = _load_stored_pdf_bytes(document.storage_key)
        reader = PdfReader(BytesIO(payload))
        if reader.is_encrypted:
            raise ValueError("Encrypted PDFs are not supported yet")
        rendered_document = pymupdf.open(stream=payload, filetype="pdf") if pymupdf is not None else None

        page_errors: list[str] = []
        try:
            for page, source_page in zip(pages, reader.pages):
                rendered_page = rendered_document.load_page(page.page_number - 1) if rendered_document is not None else None
                _populate_page_analysis(
                    page,
                    source_page=source_page,
                    rendered_page=rendered_page,
                    document_id=document.document_id,
                    filename=document.original_filename,
                    processed_at=now,
                )
                page_errors.extend(page.processing_errors or [])
        finally:
            if rendered_document is not None:
                rendered_document.close()

        document.status = "FAILED" if page_errors and len(page_errors) == len(pages) else "ANALYZED"
        document.processing_errors = page_errors
        document.analysis_summary = _build_document_summary(pages, review_status=document.review_status)
        document.updated_at = datetime.now(timezone.utc)
        document.updated_by = actor_id
        document.version += 1
        db.flush()
        return _serialize_documents(db, [document], preloaded_pages=pages)[0]
    except Exception as exc:
        _mark_document_processing_failed(
            db,
            document=document,
            pages=pages,
            actor_id=actor_id,
            error_message=str(exc),
        )
        db.flush()
        raise


def reprocess_document_ingestion(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
) -> DocumentIngestionOut:
    document, pages = _load_document_and_pages(db, document_id=document_id)
    now = datetime.now(timezone.utc)
    document.status = "UPLOADED"
    document.processing_errors = []
    document.review_status = "UNREVIEWED"
    document.review_notes = None
    document.reviewed_at = None
    document.reviewed_by = None
    document.updated_at = now
    document.updated_by = actor_id
    document.version += 1

    for page in pages:
        _delete_document_page_preview(document_id=document.document_id, page_number=page.page_number)
        page.classification_status = "PENDING"
        page.extraction_status = "PENDING"
        page.document_kind = "UNKNOWN"
        page.document_subtype = None
        page.classification_confidence = None
        page.classification_payload = {}
        page.header_fields = []
        page.table_blocks = []
        page.raw_text = None
        page.processing_warnings = []
        page.processing_errors = []
        page.processed_at = None
        page.review_status = "UNREVIEWED"
        page.review_notes = None
        page.reviewed_at = None
        page.reviewed_by = None
        page.updated_at = now

    document.analysis_summary = _build_document_summary(pages, review_status=document.review_status)
    db.flush()
    return _serialize_documents(db, [document], preloaded_pages=pages)[0]


def run_document_processing_job(
    session_factory: Callable[[], Session],
    *,
    document_id: str,
    reset_review_state: bool = False,
) -> None:
    try:
        with session_factory() as db:
            process_document_ingestion(
                db,
                document_id=document_id,
                actor_id=DOCUMENT_PROCESSOR_ACTOR_ID,
                reset_review_state=reset_review_state,
            )
            db.commit()
    except Exception:
        with session_factory() as db:
            document, pages = _load_document_and_pages(db, document_id=document_id)
            if document.status != "FAILED":
                _mark_document_processing_failed(
                    db,
                    document=document,
                    pages=pages,
                    actor_id=DOCUMENT_PROCESSOR_ACTOR_ID,
                    error_message="Background document processing failed.",
                )
                db.commit()


def update_document_ingestion(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
    changes: dict[str, Any],
) -> DocumentIngestionOut:
    document, pages = _load_document_and_pages(db, document_id=document_id)
    now = datetime.now(timezone.utc)

    if "display_name" in changes:
        display_name = _normalize_display_name(changes.get("display_name"), document.original_filename)
        document.display_name = display_name

    if "review_notes" in changes:
        document.review_notes = _clean_optional_text(changes.get("review_notes"))

    if "review_status" in changes:
        next_review_status = str(changes["review_status"]).upper()
        _validate_document_review_status_transition(next_review_status, pages)
        document.review_status = next_review_status
        if next_review_status == "VERIFIED":
            document.reviewed_at = now
            document.reviewed_by = actor_id
        else:
            document.reviewed_at = None
            document.reviewed_by = None

    document.analysis_summary = _build_document_summary(pages, review_status=document.review_status)
    document.updated_at = now
    document.updated_by = actor_id
    document.version += 1
    db.flush()
    return _serialize_documents(db, [document], preloaded_pages=pages)[0]


def update_document_ingestion_page(
    db: Session,
    *,
    document_id: str,
    page_id: int,
    actor_id: str,
    changes: dict[str, Any],
) -> DocumentIngestionOut:
    document, pages = _load_document_and_pages(db, document_id=document_id)
    page = next((candidate for candidate in pages if candidate.page_id == page_id), None)
    if page is None:
        raise LookupError(f"Page '{page_id}' was not found for document '{document_id}'")

    now = datetime.now(timezone.utc)
    previous_document_kind = page.document_kind
    next_document_kind = str(changes.get("document_kind", page.document_kind)).upper()
    if next_document_kind not in list_supported_document_kinds():
        raise ValueError(f"Document kind '{next_document_kind}' is not supported")

    if "document_subtype" in changes:
        page.document_subtype = _clean_optional_text(changes.get("document_subtype"))

    if "document_kind" in changes:
        page.document_kind = next_document_kind
        page.classification_confidence = 1.0
        classification_payload = dict(page.classification_payload or {})
        classification_payload["review_override"] = True
        classification_payload["review_override_by"] = actor_id
        classification_payload["review_override_at"] = now.isoformat()
        classification_payload["previous_document_kind"] = previous_document_kind
        page.classification_payload = classification_payload

    if "header_fields" in changes:
        page.header_fields = _normalize_header_fields(changes.get("header_fields") or [], document_kind=page.document_kind)
    elif "document_kind" in changes and page.document_kind != previous_document_kind:
        page.header_fields = extract_document_header_fields(page.document_kind, page.raw_text)

    if "table_blocks" in changes:
        page.table_blocks = _normalize_table_blocks(changes.get("table_blocks") or [], document_kind=page.document_kind)

    if "review_notes" in changes:
        page.review_notes = _clean_optional_text(changes.get("review_notes"))

    if "review_status" in changes:
        next_review_status = str(changes["review_status"]).upper()
        _validate_page_review_state(
            document_kind=page.document_kind,
            header_fields=list(page.header_fields or []),
            table_blocks=list(page.table_blocks or []),
            review_status=next_review_status,
        )
        page.review_status = next_review_status
        if next_review_status == "REVIEWED":
            page.reviewed_at = now
            page.reviewed_by = actor_id
        else:
            page.reviewed_at = None
            page.reviewed_by = None

    page.updated_at = now

    document.review_status = _derive_document_review_status_after_page_change(document.review_status, pages)
    if document.review_status != "VERIFIED":
        document.reviewed_at = None
        document.reviewed_by = None
    document.analysis_summary = _build_document_summary(pages, review_status=document.review_status)
    document.updated_at = now
    document.updated_by = actor_id
    document.version += 1
    db.flush()
    return _serialize_documents(db, [document], preloaded_pages=pages)[0]


def classify_document_page(filename: str, raw_text: str | None) -> PageClassification:
    normalized_filename = _normalize_for_matching(filename)
    normalized_text = _normalize_for_matching(raw_text or "")
    searchable = "\n".join(part for part in (normalized_filename, normalized_text) if part)

    for document_kind, keywords in CLASSIFICATION_RULES:
        for keyword in keywords:
            if keyword in normalized_text:
                return PageClassification(
                    document_kind=document_kind,
                    document_subtype=None,
                    confidence=0.96,
                    matched_by=f"text:{keyword}",
                )
        for keyword in keywords:
            if keyword in normalized_filename:
                return PageClassification(
                    document_kind=document_kind,
                    document_subtype=None,
                    confidence=0.72,
                    matched_by=f"filename:{keyword}",
                )

    if "statement" in searchable:
        return PageClassification(
            document_kind="OTHER",
            document_subtype="STATEMENT",
            confidence=0.45,
            matched_by="fallback:statement",
        )

    return PageClassification(
        document_kind="UNKNOWN",
        document_subtype=None,
        confidence=0.05,
        matched_by="fallback:unknown",
    )


def extract_document_header_fields(
    document_kind: str,
    raw_text: str | None,
    *,
    text_source: str = "pdf_text",
) -> list[dict[str, object]]:
    if not raw_text:
        return []

    definitions = FIELD_DEFINITIONS.get(document_kind, ())
    extracted_fields: list[dict[str, object]] = []
    seen_fields: set[str] = set()
    for definition in definitions:
        for pattern in definition.patterns:
            match = re.search(pattern, raw_text, flags=re.IGNORECASE | re.MULTILINE)
            if match is None:
                continue
            value = _clean_field_value(match.group(1))
            if not value or definition.field_key in seen_fields:
                continue
            seen_fields.add(definition.field_key)
            extracted_fields.append(
                DocumentExtractedFieldOut(
                    field_key=definition.field_key,
                    label=definition.label,
                    value=value,
                    confidence=0.78,
                    source=f"{text_source}:regex",
                ).model_dump()
            )
            break
    return extracted_fields


def extract_document_table_blocks(
    raw_text: str | None,
    *,
    text_source: str = "pdf_text",
) -> list[dict[str, object]]:
    if not raw_text:
        return []

    lines = [line.strip() for line in raw_text.splitlines()]
    if not any(lines):
        return []

    blocks: list[list[str]] = []
    current_block: list[str] = []
    for line in lines:
        if not line:
            if len(current_block) >= 2:
                blocks.append(current_block)
            current_block = []
            continue
        if _looks_like_table_line(line):
            current_block.append(line)
            continue
        if len(current_block) >= 2:
            blocks.append(current_block)
        current_block = []
    if len(current_block) >= 2:
        blocks.append(current_block)

    serialized_blocks: list[dict[str, object]] = []
    for index, block_lines in enumerate(blocks, start=1):
        table = _build_table_block(index=index, lines=block_lines, text_source=text_source)
        if table is not None:
            serialized_blocks.append(table.model_dump())
    return serialized_blocks


def _load_document_and_pages(db: Session, *, document_id: str) -> tuple[DocumentIngestion, list[DocumentIngestionPage]]:
    document = db.get(DocumentIngestion, document_id)
    if document is None:
        raise LookupError(f"Document '{document_id}' was not found")
    pages = (
        db.execute(
            select(DocumentIngestionPage)
            .where(DocumentIngestionPage.document_id == document_id)
            .order_by(DocumentIngestionPage.page_number)
        )
        .scalars()
        .all()
    )
    return document, pages


def get_document_page_preview_path(
    db: Session,
    *,
    document_id: str,
    page_id: int,
) -> Path:
    _document, pages = _load_document_and_pages(db, document_id=document_id)
    page = next((candidate for candidate in pages if candidate.page_id == page_id), None)
    if page is None:
        raise LookupError(f"Page '{page_id}' was not found for document '{document_id}'")
    preview_path = _document_page_preview_absolute_path(document_id=document_id, page_number=page.page_number)
    if not preview_path.exists():
        raise LookupError(f"Preview image is not available for page '{page_id}' in document '{document_id}'")
    return preview_path


def _serialize_documents(
    db: Session,
    documents: list[DocumentIngestion],
    *,
    preloaded_pages: Optional[list[DocumentIngestionPage]] = None,
) -> list[DocumentIngestionOut]:
    document_ids = [document.document_id for document in documents]
    pages = preloaded_pages
    if pages is None:
        pages = (
            db.execute(
                select(DocumentIngestionPage)
                .where(DocumentIngestionPage.document_id.in_(document_ids))
                .order_by(DocumentIngestionPage.document_id, DocumentIngestionPage.page_number)
            )
            .scalars()
            .all()
        )

    pages_by_document: dict[str, list[DocumentIngestionPage]] = defaultdict(list)
    for page in pages:
        pages_by_document[page.document_id].append(page)

    serialized: list[DocumentIngestionOut] = []
    for document in documents:
        serialized_pages = [
            DocumentIngestionPageOut(
                page_id=page.page_id or 0,
                page_number=page.page_number,
                classification_status=page.classification_status,
                extraction_status=page.extraction_status,
                document_kind=page.document_kind,
                document_subtype=page.document_subtype,
                classification_confidence=page.classification_confidence,
                classification_payload=page.classification_payload or {},
                header_fields=[
                    DocumentExtractedFieldOut.model_validate(field)
                    for field in (page.header_fields or [])
                ],
                table_blocks=[
                    DocumentTableBlockOut.model_validate(block)
                    for block in (page.table_blocks or [])
                ],
                raw_text_excerpt=_build_raw_text_excerpt(page.raw_text),
                text_source=_page_text_source(page),
                preview_available=_document_page_preview_exists(
                    document_id=page.document_id,
                    page_number=page.page_number,
                ),
                processing_warnings=list(page.processing_warnings or []),
                processing_errors=list(page.processing_errors or []),
                review_status=page.review_status,
                review_notes=page.review_notes,
                reviewed_at=page.reviewed_at,
                reviewed_by=page.reviewed_by,
                processed_at=page.processed_at,
            )
            for page in pages_by_document.get(document.document_id, [])
        ]
        serialized.append(
            DocumentIngestionOut(
                document_id=document.document_id,
                original_filename=document.original_filename,
                display_name=document.display_name,
                content_type=document.content_type,
                storage_key=document.storage_key,
                sha256=document.sha256,
                size_bytes=document.size_bytes,
                page_count=document.page_count,
                status=document.status,
                classifier_version=document.classifier_version,
                extractor_version=document.extractor_version,
                analysis_summary=document.analysis_summary or {},
                processing_errors=list(document.processing_errors or []),
                review_status=document.review_status,
                review_notes=document.review_notes,
                reviewed_at=document.reviewed_at,
                reviewed_by=document.reviewed_by,
                created_at=document.created_at,
                created_by=document.created_by,
                updated_at=document.updated_at,
                updated_by=document.updated_by,
                version=document.version,
                pages=serialized_pages,
            )
        )
    return serialized


def _build_document_summary(
    pages: list[DocumentIngestionPage],
    *,
    review_status: DocumentReviewStatus | str,
) -> dict[str, object]:
    kind_counts = Counter(page.document_kind for page in pages)
    dominant_document_kind = "UNKNOWN"
    for kind, _count in kind_counts.most_common():
        if kind != "UNKNOWN":
            dominant_document_kind = kind
            break

    reviewed_page_count = sum(1 for page in pages if page.review_status == "REVIEWED")
    review_blockers = sum(
        1
        for page in pages
        if page.review_status == "REVIEWED"
        and _collect_page_review_errors(
            document_kind=page.document_kind,
            header_fields=list(page.header_fields or []),
            table_blocks=list(page.table_blocks or []),
        )
    )

    return {
        "dominant_document_kind": dominant_document_kind,
        "page_kind_counts": dict(kind_counts),
        "header_field_count": sum(len(page.header_fields or []) for page in pages),
        "table_block_count": sum(len(page.table_blocks or []) for page in pages),
        "ocr_page_count": sum(1 for page in pages if _page_text_source(page) == "ocr"),
        "review_status": review_status,
        "reviewed_page_count": reviewed_page_count,
        "unreviewed_page_count": max(len(pages) - reviewed_page_count, 0),
        "review_ready": bool(pages) and reviewed_page_count == len(pages) and review_blockers == 0,
        "review_blocker_count": review_blockers,
    }


def _validate_document_review_status_transition(
    review_status: str,
    pages: list[DocumentIngestionPage],
) -> None:
    if review_status != "VERIFIED":
        return
    if not pages:
        raise ValueError("A document must have at least one page before it can be verified")
    unreviewed_pages = [str(page.page_number) for page in pages if page.review_status != "REVIEWED"]
    if unreviewed_pages:
        raise ValueError(
            "All pages must be reviewed before the document can be verified. "
            f"Outstanding pages: {', '.join(unreviewed_pages)}"
        )
    for page in pages:
        page_errors = _collect_page_review_errors(
            document_kind=page.document_kind,
            header_fields=list(page.header_fields or []),
            table_blocks=list(page.table_blocks or []),
        )
        if page_errors:
            raise ValueError(f"Page {page.page_number} is not ready for verification: {' '.join(page_errors)}")


def _validate_page_review_state(
    *,
    document_kind: str,
    header_fields: list[dict[str, object]],
    table_blocks: list[dict[str, object]],
    review_status: str,
) -> None:
    if review_status != "REVIEWED":
        return
    errors = _collect_page_review_errors(
        document_kind=document_kind,
        header_fields=header_fields,
        table_blocks=table_blocks,
    )
    if errors:
        raise ValueError(" ".join(errors))


def _collect_page_review_errors(
    *,
    document_kind: str,
    header_fields: list[dict[str, object]],
    table_blocks: list[dict[str, object]],
) -> list[str]:
    schema = get_document_kind_schema(document_kind)
    if schema is None or document_kind in {"UNKNOWN", "OTHER"}:
        return []

    errors: list[str] = []
    field_map = {
        str(field.get("field_key", "")).strip().lower(): str(field.get("value", "")).strip()
        for field in header_fields
        if str(field.get("field_key", "")).strip()
    }
    missing_required_fields = [
        field.label
        for field in schema.header_fields
        if field.required and not field_map.get(field.field_key)
    ]
    if missing_required_fields:
        errors.append(f"Missing required fields: {', '.join(missing_required_fields)}.")

    table_templates_by_key = {template.template_key: template for template in schema.table_templates}
    normalized_blocks = [DocumentTableBlockOut.model_validate(block) for block in table_blocks]

    for block in normalized_blocks:
        if block.template_key and block.template_key not in table_templates_by_key:
            errors.append(f"Table template '{block.template_key}' is not supported for {schema.label}.")

    for template in schema.table_templates:
        matching_blocks = [block for block in normalized_blocks if block.template_key == template.template_key]
        if len(matching_blocks) < template.min_occurrences:
            errors.append(
                f"{schema.label} requires at least {template.min_occurrences} '{template.label}' table block"
                f"{'' if template.min_occurrences == 1 else 's'}."
            )
            continue
        required_columns = {column.column_key for column in template.columns if column.required}
        for block in matching_blocks:
            missing_columns = sorted(required_columns - set(block.columns))
            if missing_columns:
                errors.append(
                    f"Table '{template.label}' is missing required columns: {', '.join(missing_columns)}."
                )
    return errors


def _derive_document_review_status_after_page_change(
    current_status: str,
    pages: list[DocumentIngestionPage],
) -> str:
    if current_status == "VERIFIED":
        return "IN_REVIEW"
    if any(page.review_status == "REVIEWED" for page in pages):
        return "IN_REVIEW"
    return "UNREVIEWED"


def _page_text_source(page: DocumentIngestionPage) -> str:
    classification_payload = dict(page.classification_payload or {})
    candidate = str(classification_payload.get("text_source", "")).strip().lower()
    if candidate in {"pdf_text", "ocr"}:
        return candidate
    return "none"


def _normalize_header_fields(
    fields: list[dict[str, Any]],
    *,
    document_kind: str,
) -> list[dict[str, object]]:
    schema = get_document_kind_schema(document_kind)
    labels_by_key = {field.field_key: field.label for field in schema.header_fields} if schema else {}
    normalized_fields: list[dict[str, object]] = []
    seen_keys: set[str] = set()
    for raw_field in fields:
        field_key = _normalize_key(str(raw_field.get("field_key", "")))
        if not field_key:
            continue
        value = _clean_optional_text(raw_field.get("value"))
        if value is None:
            continue
        if field_key in seen_keys:
            raise ValueError(f"Header fields must not contain duplicate field keys: {field_key}")
        seen_keys.add(field_key)
        normalized_fields.append(
            DocumentExtractedFieldOut(
                field_key=field_key,
                label=_clean_optional_text(raw_field.get("label")) or labels_by_key.get(field_key) or _humanize_key(field_key),
                value=value,
                confidence=raw_field.get("confidence"),
                source=_clean_optional_text(raw_field.get("source")) or "review",
            ).model_dump()
        )
    return normalized_fields


def _normalize_table_blocks(
    blocks: list[dict[str, Any]],
    *,
    document_kind: str,
) -> list[dict[str, object]]:
    schema = get_document_kind_schema(document_kind)
    templates_by_key = {template.template_key: template for template in schema.table_templates} if schema else {}
    normalized_blocks: list[dict[str, object]] = []

    for index, raw_block in enumerate(blocks, start=1):
        template_key = _clean_optional_text(raw_block.get("template_key"), lowercase=True)
        if template_key is not None and template_key not in templates_by_key:
            raise ValueError(f"Table template '{template_key}' is not supported for document kind '{document_kind}'")

        columns = [_normalize_key(str(column)) for column in raw_block.get("columns", []) if _normalize_key(str(column))]
        if template_key and not columns:
            columns = [column.column_key for column in templates_by_key[template_key].columns]

        seen_columns: list[str] = []
        deduped_columns: set[str] = set()
        for column in columns:
            if column in deduped_columns:
                raise ValueError(f"Table block {index} contains duplicate column '{column}'")
            deduped_columns.add(column)
            seen_columns.append(column)
        columns = seen_columns

        rows: list[dict[str, Optional[str]]] = []
        for raw_row in raw_block.get("rows", []):
            normalized_row: dict[str, Optional[str]] = {}
            for key, value in raw_row.items():
                normalized_key = _normalize_key(str(key))
                if not normalized_key:
                    continue
                if normalized_key not in columns:
                    columns.append(normalized_key)
                normalized_row[normalized_key] = _clean_optional_text(value)
            rows.append({column: normalized_row.get(column) for column in columns})

        normalized_blocks.append(
            DocumentTableBlockOut(
                table_index=index,
                template_key=template_key,
                title=_clean_optional_text(raw_block.get("title")),
                columns=columns,
                rows=rows,
                header_row_detected=bool(raw_block.get("header_row_detected", False)),
                source=_clean_optional_text(raw_block.get("source"), lowercase=True) or "review",
            ).model_dump()
        )
    return normalized_blocks


def _extract_page_text(page) -> tuple[str | None, list[str]]:
    try:
        raw_text = page.extract_text() or None
    except Exception as exc:  # pragma: no cover - defensive against parser-specific failures
        return None, [f"Text extraction failed: {exc}"]
    return raw_text, []


def _populate_page_analysis(
    page_record: DocumentIngestionPage,
    *,
    source_page,
    rendered_page,
    document_id: str,
    filename: str,
    processed_at: datetime,
) -> None:
    preview_warnings: list[str] = []
    ocr_warnings: list[str] = []
    raw_text, extraction_errors = _extract_page_text(source_page)
    normalized_raw_text = _clean_extracted_text(raw_text)
    text_source = "pdf_text" if normalized_raw_text else "none"
    preview_generated = False
    image_has_visible_content = False

    if rendered_page is not None:
        try:
            preview_generated, image_has_visible_content = _render_document_page_preview(
                document_id=document_id,
                page_number=page_record.page_number,
                rendered_page=rendered_page,
            )
        except Exception as exc:  # pragma: no cover - defensive against rendering failures
            preview_warnings.append(f"Page preview rendering failed: {exc}")
    else:
        preview_warnings.append("Page preview rendering is unavailable in this environment.")

    if normalized_raw_text:
        raw_text = normalized_raw_text
    else:
        raw_text = None
        if image_has_visible_content:
            ocr_text, ocr_warnings = _extract_text_from_rendered_page(
                document_id=document_id,
                page_number=page_record.page_number,
            )
            normalized_ocr_text = _clean_extracted_text(ocr_text)
            if normalized_ocr_text:
                raw_text = normalized_ocr_text
                text_source = "ocr"
                ocr_warnings = ["OCR fallback extracted text from the rendered page image.", *ocr_warnings]

    classification = classify_document_page(filename, raw_text)
    header_fields = extract_document_header_fields(
        classification.document_kind,
        raw_text,
        text_source=text_source,
    )
    table_blocks = extract_document_table_blocks(raw_text, text_source=text_source)
    extraction_status = "FAILED" if extraction_errors else "ANALYZED"

    page_record.classification_status = "ANALYZED"
    page_record.extraction_status = extraction_status
    page_record.document_kind = classification.document_kind
    page_record.document_subtype = classification.document_subtype
    page_record.classification_confidence = classification.confidence
    page_record.classification_payload = {
        "matched_by": classification.matched_by,
        "filename": filename,
        "preview_generated": preview_generated,
        "text_source": text_source,
        "ocr_used": text_source == "ocr",
    }
    page_record.header_fields = header_fields
    page_record.table_blocks = table_blocks
    page_record.raw_text = raw_text
    page_record.processing_warnings = _build_page_warnings(
        raw_text=raw_text,
        table_blocks=table_blocks,
        text_source=text_source,
        extra_warnings=[*preview_warnings, *ocr_warnings],
    )
    page_record.processing_errors = extraction_errors
    page_record.processed_at = processed_at


def _load_stored_pdf_bytes(storage_key: str) -> bytes:
    absolute_path = settings.DOCUMENT_STORAGE_ROOT / storage_key
    if not absolute_path.exists():
        raise ValueError(f"Stored PDF '{storage_key}' could not be found")
    return absolute_path.read_bytes()


def _mark_document_processing_failed(
    db: Session,
    *,
    document: DocumentIngestion,
    pages: list[DocumentIngestionPage],
    actor_id: str,
    error_message: str,
) -> None:
    now = datetime.now(timezone.utc)
    normalized_error = _clean_optional_text(error_message) or "Document processing failed."
    document.status = "FAILED"
    document.processing_errors = [normalized_error]
    document.updated_at = now
    document.updated_by = actor_id
    document.analysis_summary = _build_document_summary(pages, review_status=document.review_status)
    document.version += 1

    for page in pages:
        if page.classification_status == "PENDING":
            page.classification_status = "FAILED"
        if page.extraction_status == "PENDING":
            page.extraction_status = "FAILED"
        page.processing_errors = list(page.processing_errors or []) + [normalized_error]
        page.updated_at = now


def _build_page_warnings(
    *,
    raw_text: str | None,
    table_blocks: list[dict[str, object]],
    text_source: str,
    extra_warnings: list[str] | None = None,
) -> list[str]:
    warnings: list[str] = list(extra_warnings or [])
    if not raw_text:
        warnings.append("No extractable text was found on this page. OCR may be required.")
    elif text_source == "ocr":
        warnings.append("Page text was captured through OCR fallback instead of embedded PDF text.")
    if raw_text and not table_blocks and _looks_table_like_overall(raw_text):
        warnings.append("Possible table content was detected, but no stable table block was parsed.")
    return warnings


def _build_raw_text_excerpt(raw_text: str | None) -> str | None:
    if not raw_text:
        return None
    normalized = WHITESPACE_PATTERN.sub(" ", raw_text).strip()
    if len(normalized) <= RAW_TEXT_EXCERPT_LENGTH:
        return normalized
    return f"{normalized[: RAW_TEXT_EXCERPT_LENGTH - 3]}..."


def _normalize_filename(filename: str) -> str:
    cleaned = Path(filename or "document.pdf").name.strip()
    return cleaned or "document.pdf"


def _normalize_display_name(display_name: str | None, filename: str) -> str:
    if display_name and display_name.strip():
        return display_name.strip()
    stem = Path(filename).stem.strip()
    return stem or "Uploaded PDF"


def _normalize_for_matching(value: str) -> str:
    return WHITESPACE_PATTERN.sub(" ", value.lower()).strip()


def _store_pdf_bytes(*, document_id: str, payload: bytes) -> str:
    storage_root = settings.DOCUMENT_STORAGE_ROOT
    storage_root.mkdir(parents=True, exist_ok=True)
    stored_name = f"{document_id}.pdf"
    relative_path = Path(datetime.now(timezone.utc).strftime("%Y/%m/%d")) / stored_name
    absolute_path = storage_root / relative_path
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    absolute_path.write_bytes(payload)
    return relative_path.as_posix()


def _clean_extracted_text(raw_text: str | None) -> str | None:
    if not raw_text:
        return None
    normalized = raw_text.replace("\x00", " ")
    normalized = "\n".join(line.rstrip() for line in normalized.splitlines())
    normalized = normalized.strip()
    return normalized or None


def _document_page_preview_relative_path(*, document_id: str, page_number: int) -> Path:
    return Path(PREVIEW_SUBDIRECTORY) / document_id / f"page-{page_number:03d}{PREVIEW_IMAGE_EXTENSION}"


def _document_page_preview_absolute_path(*, document_id: str, page_number: int) -> Path:
    return settings.DOCUMENT_STORAGE_ROOT / _document_page_preview_relative_path(
        document_id=document_id,
        page_number=page_number,
    )


def _document_page_preview_exists(*, document_id: str, page_number: int) -> bool:
    return _document_page_preview_absolute_path(document_id=document_id, page_number=page_number).exists()


def _delete_document_page_preview(*, document_id: str, page_number: int) -> None:
    preview_path = _document_page_preview_absolute_path(document_id=document_id, page_number=page_number)
    try:
        preview_path.unlink()
    except FileNotFoundError:
        return


def _render_document_page_preview(
    *,
    document_id: str,
    page_number: int,
    rendered_page,
) -> tuple[bool, bool]:
    if pymupdf is None:
        return False, False

    render_scale = settings.DOCUMENT_PAGE_RENDER_DPI / 72
    pixmap = rendered_page.get_pixmap(matrix=pymupdf.Matrix(render_scale, render_scale), alpha=False)
    preview_path = _document_page_preview_absolute_path(document_id=document_id, page_number=page_number)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview_path.write_bytes(pixmap.tobytes("png"))
    return True, _pixmap_has_visible_content(pixmap)


def _pixmap_has_visible_content(pixmap) -> bool:
    pixel_count = max(pixmap.width * pixmap.height, 0)
    if pixel_count == 0 or pixmap.n <= 0:
        return False

    sample_step = max(pixel_count // 25_000, 1)
    dark_samples = 0
    sampled = 0
    for pixel_index in range(0, pixel_count, sample_step):
        sample_index = pixel_index * pixmap.n
        rgb = pixmap.samples[sample_index : sample_index + min(3, pixmap.n)]
        if not rgb:
            continue
        sampled += 1
        luminance = sum(rgb[:3]) / len(rgb[:3])
        if luminance < 235:
            dark_samples += 1
    return sampled > 0 and dark_samples >= max(sampled // 400, 24)


@lru_cache(maxsize=1)
def _get_ocr_engine():
    if not settings.DOCUMENT_OCR_ENABLED or RapidOCR is None:
        return None
    return RapidOCR()


def _extract_text_from_rendered_page(
    *,
    document_id: str,
    page_number: int,
) -> tuple[str | None, list[str]]:
    if not settings.DOCUMENT_OCR_ENABLED:
        return None, []

    ocr_engine = _get_ocr_engine()
    if ocr_engine is None:
        return None, ["OCR fallback is enabled, but OCR dependencies are unavailable in this environment."]

    preview_path = _document_page_preview_absolute_path(document_id=document_id, page_number=page_number)
    if not preview_path.exists():
        return None, ["OCR fallback could not run because the rendered page preview is missing."]

    try:
        result, _elapsed = ocr_engine(str(preview_path))
    except Exception as exc:  # pragma: no cover - depends on OCR runtime details
        return None, [f"OCR fallback failed: {exc}"]

    if not result:
        return None, []

    lines: list[str] = []
    for item in result:
        if not item or len(item) < 2:
            continue
        text_payload = item[1]
        if isinstance(text_payload, (list, tuple)):
            line_text = str(text_payload[0] if text_payload else "").strip()
        else:
            line_text = str(text_payload).strip()
        if line_text:
            lines.append(line_text)
    return ("\n".join(lines).strip() or None), []


def _clean_field_value(value: str) -> str:
    normalized = WHITESPACE_PATTERN.sub(" ", value).strip(" :")
    return normalized


def _clean_optional_text(value: Any, *, lowercase: bool = False) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    return normalized.lower() if lowercase else normalized


def _normalize_key(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9_]+", "_", value.strip().lower()).strip("_")
    if not normalized:
        return ""
    if not normalized[0].isalpha():
        normalized = f"field_{normalized}"
    return normalized[:64]


def _humanize_key(value: str) -> str:
    return value.replace("_", " ").title()


def _looks_like_table_line(line: str) -> bool:
    if "\t" in line:
        return True
    segments = [segment.strip() for segment in TABLE_LINE_SPLIT_PATTERN.split(line) if segment.strip()]
    if len(segments) >= 3:
        return True
    if len(segments) == 2:
        return True
    return False


def _looks_table_like_overall(raw_text: str) -> bool:
    numeric_lines = 0
    dense_lines = 0
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if len(re.findall(r"\d", stripped)) >= 3:
            numeric_lines += 1
        if len([segment for segment in TABLE_LINE_SPLIT_PATTERN.split(stripped) if segment.strip()]) >= 3:
            dense_lines += 1
    return numeric_lines >= 2 or dense_lines >= 2


def _build_table_block(*, index: int, lines: list[str], text_source: str) -> DocumentTableBlockOut | None:
    split_rows = [
        [segment.strip() for segment in TABLE_LINE_SPLIT_PATTERN.split(line) if segment.strip()]
        for line in lines
    ]
    split_rows = [row for row in split_rows if len(row) >= 2]
    if len(split_rows) < 2:
        return None

    max_columns = max(len(row) for row in split_rows)
    header_row_detected = _looks_like_header_row(split_rows[0], split_rows[1] if len(split_rows) > 1 else None)
    if header_row_detected:
        columns = _normalize_table_headers(split_rows[0], max_columns=max_columns)
        data_rows = split_rows[1:]
    else:
        columns = [f"column_{position}" for position in range(1, max_columns + 1)]
        data_rows = split_rows

    rows: list[dict[str, Optional[str]]] = []
    for row in data_rows:
        normalized_row = {column: row[position] if position < len(row) else None for position, column in enumerate(columns)}
        if any(value not in (None, "") for value in normalized_row.values()):
            rows.append(normalized_row)
    if not rows:
        return None

    return DocumentTableBlockOut(
        table_index=index,
        template_key=None,
        title=lines[0] if not header_row_detected and len(lines[0]) <= 80 else None,
        columns=columns,
        rows=rows,
        header_row_detected=header_row_detected,
        source=f"{text_source}:whitespace-grid",
    )


def _looks_like_header_row(first_row: list[str], second_row: list[str] | None) -> bool:
    if second_row is None:
        return False
    if any(any(char.isdigit() for char in value) for value in first_row):
        return False
    return any(any(char.isdigit() for char in value) for value in second_row)


def _normalize_table_headers(values: list[str], *, max_columns: int) -> list[str]:
    normalized_headers: list[str] = []
    seen_headers: Counter[str] = Counter()
    for position in range(max_columns):
        raw_value = values[position] if position < len(values) else ""
        normalized = re.sub(r"[^a-z0-9]+", "_", raw_value.lower()).strip("_") or f"column_{position + 1}"
        seen_headers[normalized] += 1
        if seen_headers[normalized] > 1:
            normalized = f"{normalized}_{seen_headers[normalized]}"
        normalized_headers.append(normalized)
    return normalized_headers
