from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentActionPlanOut
from apps.api.app.schemas.document import DocumentExtractedFieldOut
from apps.api.app.schemas.document import DocumentIngestionOut
from apps.api.app.schemas.document import DocumentLinkageAssessmentOut
from apps.api.app.schemas.document import DocumentIngestionPageOut
from apps.api.app.schemas.document import DocumentRecordLinkOut
from apps.api.app.schemas.document import DocumentProcessorDocumentTraceOut
from apps.api.app.schemas.document import DocumentProcessorPageTraceOut
from apps.api.app.schemas.document import DocumentProcessorProvider
from apps.api.app.schemas.document import DocumentRoutingAssessmentOut
from apps.api.app.schemas.document import DocumentTableBlockOut

from .document_ingestion_common import build_raw_text_excerpt
from .document_ingestion_common import clean_optional_text
from .document_action_planning import build_document_action_plan
from .document_linkage import build_document_linkage_assessment
from .document_routing import build_document_page_routing_assessment
from .document_record_links import load_document_record_links_by_document_id
from .document_record_links import to_document_record_link_out
from .document_ingestion_review import build_document_summary
from .document_ingestion_review import page_text_source
from .document_ingestion_storage import document_page_preview_absolute_path
from .document_ingestion_storage import document_page_preview_exists
from .document_ingestion_storage import stored_pdf_absolute_path

VALID_DOCUMENT_PROCESSOR_PROVIDERS = {"openai", "anthropic", "google"}


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


def get_document_source_file_details(
    db: Session,
    *,
    document_id: str,
) -> tuple[Path, str, str]:
    document = db.get(DocumentIngestion, document_id)
    if document is None:
        raise LookupError(f"Document '{document_id}' was not found")

    source_path = stored_pdf_absolute_path(document.storage_key)
    if not source_path.exists():
        raise LookupError(f"Stored source PDF is not available for document '{document_id}'")

    return source_path, document.content_type, document.original_filename


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
    record_links_by_document = load_document_record_links_by_document_id(db, document_ids=document_ids)

    serialized: list[DocumentIngestionOut] = []
    for document in documents:
        document_pages = pages_by_document.get(document.document_id, [])
        document_record_links = record_links_by_document.get(document.document_id, [])
        source_available = stored_pdf_absolute_path(document.storage_key).exists()
        document_summary = build_document_summary(document_pages, review_status=document.review_status)
        document_routing_payload = document_summary.get("routing_assessment")
        document_routing_assessment = (
            DocumentRoutingAssessmentOut.model_validate(document_routing_payload)
            if isinstance(document_routing_payload, dict)
            else None
        )
        document_linkage_assessment = build_document_linkage_assessment(
            db,
            pages=document_pages,
            review_status=document.review_status,
            document_id=document.document_id,
        )
        document_action_plan = build_document_action_plan(
            document_id=document.document_id,
            pages=document_pages,
            review_status=document.review_status,
            linkage_assessment=document_linkage_assessment,
        )
        serialized_page_processor_traces = [
            _build_document_page_processor_trace(
                page,
                fallback_provider=document.processor_provider,
                fallback_model=document.processor_model,
            )
            for page in document_pages
        ]
        document_processor_trace = _build_document_processor_trace(
            page_traces=serialized_page_processor_traces,
            fallback_provider=document.processor_provider,
            fallback_model=document.processor_model,
        )
        document_summary.update(
            {
                "linkage_status": document_linkage_assessment.status,
                "linkage_recommended_action": document_linkage_assessment.recommended_action,
                "linkage_primary_record_type": document_linkage_assessment.primary_record_type,
                "linkage_primary_record_id": document_linkage_assessment.primary_record_id,
                "linkage_candidate_count": len(document_linkage_assessment.candidates),
                "action_plan_status": document_action_plan.status,
                "action_plan_type": document_action_plan.action_type,
                "action_plan_operation_type": document_action_plan.operation_type,
                "record_link_count": len(document_record_links),
            }
        )
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
                processor_trace=serialized_page_processor_traces[page_index],
                routing_assessment=build_document_page_routing_assessment(
                    document_kind=page.document_kind,
                    header_fields=list(page.header_fields or []),
                    table_blocks=list(page.table_blocks or []),
                    review_status=page.review_status,
                ),
            )
            for page_index, page in enumerate(document_pages)
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
                source_available=source_available,
                status=document.status,
                processor_provider=document.processor_provider,
                processor_model=document.processor_model,
                classifier_version=document.classifier_version,
                extractor_version=document.extractor_version,
                analysis_summary=document_summary,
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
                processor_trace=document_processor_trace,
                routing_assessment=document_routing_assessment,
                linkage_assessment=DocumentLinkageAssessmentOut.model_validate(document_linkage_assessment),
                action_plan=DocumentActionPlanOut.model_validate(document_action_plan),
                record_links=[
                    DocumentRecordLinkOut.model_validate(to_document_record_link_out(link))
                    for link in document_record_links
                ],
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


def _normalize_document_processor_provider(
    value: object | None,
) -> DocumentProcessorProvider | None:
    normalized = clean_optional_text(value, lowercase=True)
    if normalized in VALID_DOCUMENT_PROCESSOR_PROVIDERS:
        return normalized  # type: ignore[return-value]
    return None


def _normalized_processor_warning_list(value: object | None) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        warning = clean_optional_text(item)
        if warning is None or warning in seen:
            continue
        seen.add(warning)
        normalized.append(warning)
    return normalized


def _build_document_page_processor_trace(
    page: DocumentIngestionPage,
    *,
    fallback_provider: str | None,
    fallback_model: str | None,
) -> DocumentProcessorPageTraceOut | None:
    classification_payload = dict(page.classification_payload or {})
    provider = _normalize_document_processor_provider(
        classification_payload.get("processor_provider") or fallback_provider
    )
    model = clean_optional_text(classification_payload.get("processor_model")) or clean_optional_text(fallback_model)
    applied = bool(classification_payload.get("processor_applied"))
    overrode_heuristics = bool(classification_payload.get("processor_overrode_heuristics"))
    partial = bool(classification_payload.get("processor_partial"))
    warnings = _normalized_processor_warning_list(classification_payload.get("processor_warnings"))
    heuristic_document_kind = clean_optional_text(classification_payload.get("heuristic_document_kind"))
    heuristic_document_subtype = clean_optional_text(classification_payload.get("heuristic_document_subtype"))

    if not any(
        [
            provider,
            model,
            applied,
            overrode_heuristics,
            partial,
            warnings,
            heuristic_document_kind,
            heuristic_document_subtype,
        ]
    ):
        return None

    return DocumentProcessorPageTraceOut(
        provider=provider,
        model=model,
        applied=applied,
        overrode_heuristics=overrode_heuristics,
        partial=partial,
        warning_count=len(warnings),
        warnings=warnings,
        heuristic_document_kind=heuristic_document_kind,
        heuristic_document_subtype=heuristic_document_subtype,
    )


def _build_document_processor_trace(
    *,
    page_traces: list[DocumentProcessorPageTraceOut | None],
    fallback_provider: str | None,
    fallback_model: str | None,
) -> DocumentProcessorDocumentTraceOut | None:
    provider = _normalize_document_processor_provider(fallback_provider)
    model = clean_optional_text(fallback_model)
    applied_page_count = sum(1 for trace in page_traces if trace is not None and trace.applied)
    overridden_page_count = sum(1 for trace in page_traces if trace is not None and trace.overrode_heuristics)
    partial_page_count = sum(1 for trace in page_traces if trace is not None and trace.partial)

    warnings: list[str] = []
    seen: set[str] = set()
    for trace in page_traces:
        if trace is None:
            continue
        for warning in trace.warnings:
            if warning in seen:
                continue
            seen.add(warning)
            warnings.append(warning)

    if not any([provider, model, applied_page_count, overridden_page_count, partial_page_count, warnings]):
        return None

    return DocumentProcessorDocumentTraceOut(
        provider=provider,
        model=model,
        applied=applied_page_count > 0,
        overrode_heuristics=overridden_page_count > 0,
        partial=partial_page_count > 0 or bool(warnings),
        warning_count=len(warnings),
        warnings=warnings,
        applied_page_count=applied_page_count,
        overridden_page_count=overridden_page_count,
        partial_page_count=partial_page_count,
    )
