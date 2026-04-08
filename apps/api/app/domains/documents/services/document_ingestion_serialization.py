from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentExtractedFieldOut
from apps.api.app.schemas.document import DocumentIngestionOut
from apps.api.app.schemas.document import DocumentIngestionPageOut
from apps.api.app.schemas.document import DocumentTableBlockOut

from .document_ingestion_common import build_raw_text_excerpt
from .document_ingestion_common import clean_optional_text
from .document_ingestion_review import build_document_summary
from .document_ingestion_review import page_text_source
from .document_ingestion_storage import document_page_preview_absolute_path
from .document_ingestion_storage import document_page_preview_exists


def load_document_and_pages(
    db: Session,
    *,
    document_id: str,
) -> tuple[DocumentIngestion, list[DocumentIngestionPage]]:
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
    _document, pages = load_document_and_pages(db, document_id=document_id)
    page = next((candidate for candidate in pages if candidate.page_id == page_id), None)
    if page is None:
        raise LookupError(f"Page '{page_id}' was not found for document '{document_id}'")
    preview_path = document_page_preview_absolute_path(document_id=document_id, page_number=page.page_number)
    if not preview_path.exists():
        raise LookupError(f"Preview image is not available for page '{page_id}' in document '{document_id}'")
    return preview_path


def serialize_documents(
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
                raw_text_excerpt=build_raw_text_excerpt(page.raw_text),
                text_source=page_text_source(page),
                preview_available=document_page_preview_exists(
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


def mark_document_processing_failed(
    *,
    document: DocumentIngestion,
    pages: list[DocumentIngestionPage],
    actor_id: str,
    error_message: str,
) -> None:
    now = datetime.now(timezone.utc)
    normalized_error = clean_optional_text(error_message) or "Document processing failed."
    document.status = "FAILED"
    document.processing_errors = [normalized_error]
    document.updated_at = now
    document.updated_by = actor_id
    document.analysis_summary = build_document_summary(pages, review_status=document.review_status)
    document.version += 1

    for page in pages:
        if page.classification_status == "PENDING":
            page.classification_status = "FAILED"
        if page.extraction_status == "PENDING":
            page.extraction_status = "FAILED"
        page.processing_errors = list(page.processing_errors or []) + [normalized_error]
        page.updated_at = now
