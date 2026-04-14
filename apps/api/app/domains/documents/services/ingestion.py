from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from hashlib import sha256
from io import BytesIO
from typing import Any, Callable
from uuid import uuid4

from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.domains.documents.services.document_processor import (
    build_document_processor_runtime_settings as _build_document_processor_runtime_settings,
)
from apps.api.app.domains.documents.services.document_processor import DocumentProcessorOutcome
from apps.api.app.domains.documents.services.document_processor import resolve_requested_document_processor
from apps.api.app.domains.documents.services.document_processor import run_document_processor_analysis
from apps.api.app.domains.documents.services.schema_registry import build_document_schema_registry
from apps.api.app.domains.documents.services.schema_registry import list_supported_document_kinds
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentIngestionOut
from apps.api.app.schemas.document import DocumentProcessorSelection
from apps.api.app.schemas.document import DocumentProcessorRuntimeSettingsOut
from apps.api.app.schemas.document import DocumentSchemaRegistryOut

from .document_ingestion_analysis import build_page_warnings
from .document_ingestion_analysis import classify_document_page
from .document_ingestion_analysis import extract_document_header_fields
from .document_ingestion_analysis import extract_document_table_blocks
from .document_ingestion_analysis import extract_page_text as _extract_page_text
from .document_ingestion_common import CLASSIFIER_VERSION
from .document_ingestion_common import DOCUMENT_PROCESSOR_ACTOR_ID
from .document_ingestion_common import EXTRACTOR_VERSION
from .document_ingestion_common import PREVIEW_IMAGE_MEDIA_TYPE
from .document_ingestion_common import clean_extracted_text
from .document_ingestion_common import clean_optional_text as _clean_optional_text
from .document_ingestion_common import normalize_display_name
from .document_ingestion_common import normalize_filename
from .document_ingestion_review import build_document_summary
from .document_ingestion_review import derive_document_review_status_after_page_change
from .document_ingestion_review import normalize_header_fields
from .document_ingestion_review import normalize_table_blocks
from .document_ingestion_review import validate_document_review_status_transition
from .document_ingestion_review import validate_page_review_state
from .document_ingestion_serialization import get_document_page_preview_path
from .document_ingestion_serialization import load_document_and_pages
from .document_ingestion_serialization import mark_document_processing_failed
from .document_ingestion_serialization import serialize_documents
from .document_ingestion_storage import delete_document_page_preview as _delete_document_page_preview
from .document_ingestion_storage import document_page_preview_absolute_path
from .document_ingestion_storage import load_stored_pdf_bytes as _load_stored_pdf_bytes
from .document_ingestion_storage import store_pdf_bytes as _store_pdf_bytes

try:
    import pymupdf
except ImportError:  # pragma: no cover - dependency should be available in deployed environments
    pymupdf = None

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:  # pragma: no cover - dependency should be available in deployed environments
    RapidOCR = None


def list_document_schema_registry() -> DocumentSchemaRegistryOut:
    return build_document_schema_registry()


def build_document_processor_runtime_settings() -> DocumentProcessorRuntimeSettingsOut:
    return _build_document_processor_runtime_settings()


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
    return serialize_documents(db, documents)


def get_document_ingestion(db: Session, *, document_id: str) -> DocumentIngestionOut:
    document = db.get(DocumentIngestion, document_id)
    if document is None:
        raise LookupError(f"Document '{document_id}' was not found")
    return serialize_documents(db, [document])[0]


def ingest_pdf_document(
    db: Session,
    *,
    actor_id: str,
    filename: str,
    content_type: str | None,
    payload: bytes,
    display_name: str | None = None,
    processor_provider: DocumentProcessorSelection | None = None,
) -> DocumentIngestionOut:
    if not payload:
        raise ValueError("The uploaded PDF was empty")
    if len(payload) > settings.DOCUMENT_MAX_UPLOAD_BYTES:
        raise ValueError(
            f"Uploaded PDF exceeds the {settings.DOCUMENT_MAX_UPLOAD_BYTES:,} byte limit"
        )
    normalized_filename = normalize_filename(filename)
    normalized_display_name = normalize_display_name(display_name, normalized_filename)
    normalized_content_type = (content_type or "application/pdf").strip() or "application/pdf"
    resolved_processor_provider, resolved_processor_model = resolve_requested_document_processor(processor_provider)
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
        processor_provider=resolved_processor_provider,
        processor_model=resolved_processor_model,
        classifier_version=CLASSIFIER_VERSION,
        extractor_version=EXTRACTOR_VERSION,
        analysis_summary=build_document_summary(page_records, review_status="UNREVIEWED"),
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
    return serialize_documents(db, [document], preloaded_pages=page_records)[0]


def process_document_ingestion(
    db: Session,
    *,
    document_id: str,
    actor_id: str = DOCUMENT_PROCESSOR_ACTOR_ID,
    reset_review_state: bool = False,
) -> DocumentIngestionOut:
    document, pages = load_document_and_pages(db, document_id=document_id)
    now = datetime.now(timezone.utc)
    document.status = "PROCESSING"
    document.processing_errors = []
    document.updated_at = now
    document.updated_by = actor_id
    document.analysis_summary = build_document_summary(pages, review_status=document.review_status)

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

        processor_outcome, processor_warnings = run_document_processor_analysis(
            filename=document.original_filename,
            payload=payload,
            pages=pages,
            processor_provider=document.processor_provider,
        )
        if processor_outcome is not None:
            document.processor_provider = processor_outcome.provider
            document.processor_model = processor_outcome.model
            _apply_document_processor_outcome(
                pages=pages,
                outcome=processor_outcome,
            )
        if processor_warnings:
            _apply_document_processor_warnings(
                pages=pages,
                provider=document.processor_provider,
                model=document.processor_model,
                warnings=processor_warnings,
            )

        document.status = "FAILED" if page_errors and len(page_errors) == len(pages) else "ANALYZED"
        document.processing_errors = page_errors
        document.analysis_summary = build_document_summary(pages, review_status=document.review_status)
        document.updated_at = datetime.now(timezone.utc)
        document.updated_by = actor_id
        document.version += 1
        db.flush()
        return serialize_documents(db, [document], preloaded_pages=pages)[0]
    except Exception as exc:
        mark_document_processing_failed(
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
    processor_provider: DocumentProcessorSelection | None = None,
    processor_provider_specified: bool = False,
) -> DocumentIngestionOut:
    document, pages = load_document_and_pages(db, document_id=document_id)
    now = datetime.now(timezone.utc)
    if processor_provider_specified:
        resolved_processor_provider, resolved_processor_model = resolve_requested_document_processor(processor_provider)
        document.processor_provider = resolved_processor_provider
        document.processor_model = resolved_processor_model
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

    document.analysis_summary = build_document_summary(pages, review_status=document.review_status)
    db.flush()
    return serialize_documents(db, [document], preloaded_pages=pages)[0]


def _apply_document_processor_outcome(
    *,
    pages: list[DocumentIngestionPage],
    outcome: DocumentProcessorOutcome,
) -> None:
    page_map = {page.page_number: page for page in pages}
    for result in outcome.pages:
        page = page_map.get(result.page_number)
        if page is None:
            continue
        heuristic_document_kind = page.document_kind
        heuristic_document_subtype = page.document_subtype
        overrode_heuristics = (
            result.document_kind != "UNKNOWN"
            and (
                result.document_kind != heuristic_document_kind
                or _clean_optional_text(result.document_subtype) != _clean_optional_text(heuristic_document_subtype)
            )
        )
        if result.document_kind != "UNKNOWN" or page.document_kind == "UNKNOWN":
            page.document_kind = result.document_kind
            page.document_subtype = result.document_subtype
            page.classification_confidence = result.confidence
        page.header_fields = result.header_fields or list(page.header_fields or [])
        page.table_blocks = result.table_blocks or list(page.table_blocks or [])
        classification_payload = dict(page.classification_payload or {})
        classification_payload["processor_provider"] = outcome.provider
        classification_payload["processor_model"] = outcome.model
        classification_payload["processor_applied"] = True
        classification_payload["heuristic_document_kind"] = heuristic_document_kind
        classification_payload["heuristic_document_subtype"] = heuristic_document_subtype
        classification_payload["processor_overrode_heuristics"] = overrode_heuristics
        classification_payload["processor_partial"] = result.partial
        classification_payload["processor_warnings"] = list(result.warnings or [])
        page.classification_payload = classification_payload
        if result.warnings:
            page.processing_warnings = _dedupe_preserving_order(
                [*list(page.processing_warnings or []), *result.warnings]
            )


def _apply_document_processor_warnings(
    *,
    pages: list[DocumentIngestionPage],
    provider: str | None,
    model: str | None,
    warnings: list[str],
) -> None:
    if not warnings:
        return
    deduped_warnings = _dedupe_preserving_order([warning for warning in warnings if warning])
    for page in pages:
        page.processing_warnings = _dedupe_preserving_order(
            [*list(page.processing_warnings or []), *deduped_warnings]
        )
        classification_payload = dict(page.classification_payload or {})
        if provider is not None:
            classification_payload["processor_provider"] = provider
        if model:
            classification_payload["processor_model"] = model
        classification_payload["processor_applied"] = bool(classification_payload.get("processor_applied"))
        classification_payload["processor_partial"] = True
        existing_warnings = list(classification_payload.get("processor_warnings") or [])
        classification_payload["processor_warnings"] = _dedupe_preserving_order(
            [*existing_warnings, *deduped_warnings]
        )
        page.classification_payload = classification_payload


def _dedupe_preserving_order(values: list[str]) -> list[str]:
    deduped_values: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped_values.append(value)
    return deduped_values


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
            document, pages = load_document_and_pages(db, document_id=document_id)
            if document.status != "FAILED":
                mark_document_processing_failed(
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
    document, pages = load_document_and_pages(db, document_id=document_id)
    now = datetime.now(timezone.utc)

    if "display_name" in changes:
        display_name = normalize_display_name(changes.get("display_name"), document.original_filename)
        document.display_name = display_name

    if "review_notes" in changes:
        document.review_notes = _clean_optional_text(changes.get("review_notes"))

    if "review_status" in changes:
        next_review_status = str(changes["review_status"]).upper()
        validate_document_review_status_transition(next_review_status, pages)
        document.review_status = next_review_status
        if next_review_status == "VERIFIED":
            document.reviewed_at = now
            document.reviewed_by = actor_id
        else:
            document.reviewed_at = None
            document.reviewed_by = None

    document.analysis_summary = build_document_summary(pages, review_status=document.review_status)
    document.updated_at = now
    document.updated_by = actor_id
    document.version += 1
    db.flush()
    return serialize_documents(db, [document], preloaded_pages=pages)[0]


def update_document_ingestion_page(
    db: Session,
    *,
    document_id: str,
    page_id: int,
    actor_id: str,
    changes: dict[str, Any],
) -> DocumentIngestionOut:
    document, pages = load_document_and_pages(db, document_id=document_id)
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
        page.header_fields = normalize_header_fields(changes.get("header_fields") or [], document_kind=page.document_kind)
    elif "document_kind" in changes and page.document_kind != previous_document_kind:
        page.header_fields = extract_document_header_fields(page.document_kind, page.raw_text)

    if "table_blocks" in changes:
        page.table_blocks = normalize_table_blocks(changes.get("table_blocks") or [], document_kind=page.document_kind)

    if "review_notes" in changes:
        page.review_notes = _clean_optional_text(changes.get("review_notes"))

    if "review_status" in changes:
        next_review_status = str(changes["review_status"]).upper()
        validate_page_review_state(
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

    document.review_status = derive_document_review_status_after_page_change(document.review_status, pages)
    if document.review_status != "VERIFIED":
        document.reviewed_at = None
        document.reviewed_by = None
    document.analysis_summary = build_document_summary(pages, review_status=document.review_status)
    document.updated_at = now
    document.updated_by = actor_id
    document.version += 1
    db.flush()
    return serialize_documents(db, [document], preloaded_pages=pages)[0]


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
    normalized_raw_text = clean_extracted_text(raw_text)
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
            normalized_ocr_text = clean_extracted_text(ocr_text)
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
    page_record.processing_warnings = build_page_warnings(
        raw_text=raw_text,
        table_blocks=table_blocks,
        text_source=text_source,
        extra_warnings=[*preview_warnings, *ocr_warnings],
    )
    page_record.processing_errors = extraction_errors
    page_record.processed_at = processed_at


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
    preview_path = document_page_preview_absolute_path(document_id=document_id, page_number=page_number)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview_path.write_bytes(pixmap.tobytes(PREVIEW_IMAGE_MEDIA_TYPE.split("/")[-1]))
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

    preview_path = document_page_preview_absolute_path(document_id=document_id, page_number=page_number)
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
