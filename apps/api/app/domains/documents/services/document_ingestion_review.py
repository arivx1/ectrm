from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from apps.api.app.domains.documents.services.schema_registry import get_document_kind_schema
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentExtractedFieldOut
from apps.api.app.schemas.document import DocumentReviewStatus
from apps.api.app.schemas.document import DocumentTableBlockOut

from .document_routing import build_document_routing_assessment
from .document_ingestion_common import clean_optional_text
from .document_ingestion_common import humanize_key
from .document_ingestion_common import normalize_key


def build_document_summary(
    pages: list[DocumentIngestionPage],
    *,
    review_status: DocumentReviewStatus | str,
    logical_documents: list[object] | None = None,
) -> dict[str, object]:
    routing_assessment = build_document_routing_assessment(pages, review_status=str(review_status))
    kind_counts = Counter(page.document_kind for page in pages)
    raw_logical_documents = (
        logical_documents
        if logical_documents is not None
        else build_logical_document_estimates(pages)
    )
    logical_document_payloads = [
        _coerce_logical_document_payload(document) for document in raw_logical_documents
    ]
    classification_profile = build_document_classification_profile(
        pages,
        kind_counts=kind_counts,
        logical_documents=logical_document_payloads,
    )
    dominant_document_kind = str(classification_profile["dominant_document_kind"])

    reviewed_page_count = sum(1 for page in pages if page.review_status == "REVIEWED")
    corrected_page_count = sum(
        1
        for page in pages
        if dict(page.classification_payload or {}).get("classification_corrected") is True
    )
    learning_applied_page_count = sum(
        1
        for page in pages
        if dict(page.classification_payload or {}).get("learning_applied") is True
    )
    review_blockers = sum(
        1
        for page in pages
        if page.review_status == "REVIEWED"
        and collect_page_review_errors(
            document_kind=page.document_kind,
            header_fields=list(page.header_fields or []),
            table_blocks=list(page.table_blocks or []),
        )
    )
    artifact_profile = build_artifact_profile(pages)
    structure_profile = build_structure_profile(
        pages,
        artifact_profile=artifact_profile,
        dominant_document_kind=dominant_document_kind,
        logical_documents=logical_document_payloads,
    )

    return {
        **classification_profile,
        "dominant_document_kind": dominant_document_kind,
        "page_kind_counts": dict(kind_counts),
        "header_field_count": sum(len(page.header_fields or []) for page in pages),
        "table_block_count": sum(len(page.table_blocks or []) for page in pages),
        "ocr_page_count": sum(1 for page in pages if page_text_source(page) == "ocr"),
        "review_status": review_status,
        "reviewed_page_count": reviewed_page_count,
        "unreviewed_page_count": max(len(pages) - reviewed_page_count, 0),
        "corrected_page_count": corrected_page_count,
        "learning_applied_page_count": learning_applied_page_count,
        "review_ready": bool(pages) and reviewed_page_count == len(pages) and review_blockers == 0,
        "review_blocker_count": review_blockers,
        "routing_strategy": routing_assessment.routing_strategy,
        "routing_status": routing_assessment.status,
        "routing_primary_record_type": routing_assessment.primary_record_type,
        "routing_assessment": routing_assessment.model_dump(),
        "artifact_profile": artifact_profile,
        "structure_profile": structure_profile,
        "extraction_plan": build_extraction_plan(
            pages,
            artifact_profile=artifact_profile,
            logical_documents=list(structure_profile.get("logical_documents") or []),
        ),
    }


def build_document_classification_profile(
    pages: list[DocumentIngestionPage],
    *,
    kind_counts: Counter[str] | None = None,
    logical_documents: list[object] | None = None,
) -> dict[str, object]:
    counts = kind_counts or Counter(page.document_kind for page in pages)
    page_kinds = [page.document_kind or "UNKNOWN" for page in sorted(pages, key=lambda page: page.page_number)]
    distinct_page_kinds = set(page_kinds)
    concrete_page_kinds = [kind for kind in page_kinds if kind != "UNKNOWN"]
    distinct_concrete_page_kinds = set(concrete_page_kinds)
    raw_logical_documents = (
        logical_documents
        if logical_documents is not None
        else build_logical_document_estimates(pages)
    )
    logical_document_payloads = [
        _coerce_logical_document_payload(document) for document in raw_logical_documents
    ]
    logical_document_kinds = [
        str(document.get("document_kind") or "UNKNOWN")
        for document in logical_document_payloads
    ]
    concrete_logical_document_kinds = [kind for kind in logical_document_kinds if kind != "UNKNOWN"]
    distinct_concrete_logical_document_kinds = set(concrete_logical_document_kinds)
    representative_page_kind = "UNKNOWN"
    for kind, _count in counts.most_common():
        if kind != "UNKNOWN":
            representative_page_kind = kind
            break

    document_type_homogeneous = bool(page_kinds) and len(distinct_page_kinds) == 1 and page_kinds[0] != "UNKNOWN"
    logical_document_count = len(logical_document_payloads)
    if document_type_homogeneous and logical_document_count <= 1:
        document_kind = page_kinds[0]
        return {
            "document_classification_scope": "DOCUMENT",
            "document_classification_kind": document_kind,
            "dominant_document_kind": document_kind,
            "representative_page_document_kind": document_kind,
            "page_level_classification_required": False,
            "logical_document_classification_required": False,
            "logical_document_count": logical_document_count,
            "logical_document_kinds": [document_kind],
            "document_type_homogeneous": True,
            "page_document_kinds": [document_kind],
        }

    if logical_document_count > 1:
        dominant_kind = "MIXED" if len(distinct_concrete_logical_document_kinds) > 1 else (
            concrete_logical_document_kinds[0] if concrete_logical_document_kinds else "UNKNOWN"
        )
        return {
            "document_classification_scope": "LOGICAL_DOCUMENT",
            "document_classification_kind": None,
            "dominant_document_kind": dominant_kind,
            "representative_page_document_kind": representative_page_kind,
            "page_level_classification_required": False,
            "logical_document_classification_required": True,
            "logical_document_count": logical_document_count,
            "logical_document_kinds": sorted(distinct_concrete_logical_document_kinds),
            "document_type_homogeneous": False,
            "page_document_kinds": sorted(distinct_concrete_page_kinds),
        }

    mixed_page_kinds = len(distinct_page_kinds) > 1
    return {
        "document_classification_scope": "PAGE" if pages else "UNCLASSIFIED",
        "document_classification_kind": None,
        "dominant_document_kind": "MIXED" if mixed_page_kinds else "UNKNOWN",
        "representative_page_document_kind": representative_page_kind,
        "page_level_classification_required": bool(pages),
        "logical_document_classification_required": False,
        "logical_document_count": logical_document_count,
        "logical_document_kinds": sorted(distinct_concrete_logical_document_kinds),
        "document_type_homogeneous": False,
        "page_document_kinds": sorted(distinct_concrete_page_kinds),
    }


def build_artifact_profile(pages: list[DocumentIngestionPage]) -> dict[str, object]:
    source_counts = Counter(page_text_source(page) for page in pages)
    processed_pages = [
        page
        for page in pages
        if page.processed_at is not None
        or page.classification_status != "PENDING"
        or page.extraction_status != "PENDING"
    ]
    processed_count = len(processed_pages)
    pdf_text_count = source_counts.get("pdf_text", 0)
    ocr_count = source_counts.get("ocr", 0)
    no_text_count = source_counts.get("none", 0)

    if not pages:
        content_mode = "empty"
        recommended_parse_mode = "manual_review"
        requires_ocr = False
    elif processed_count == 0:
        content_mode = "pending_analysis"
        recommended_parse_mode = "pdf_pending_analysis"
        requires_ocr = False
    elif ocr_count and pdf_text_count:
        content_mode = "hybrid_text_plus_ocr"
        recommended_parse_mode = "pdf_hybrid_text_plus_ocr"
        requires_ocr = True
    elif ocr_count:
        content_mode = "ocr"
        recommended_parse_mode = "pdf_ocr"
        requires_ocr = True
    elif pdf_text_count and no_text_count:
        content_mode = "native_text_with_unparsed_pages"
        recommended_parse_mode = "pdf_text_plus_ocr_fallback"
        requires_ocr = True
    elif pdf_text_count:
        content_mode = "native_text"
        recommended_parse_mode = "pdf_native_text"
        requires_ocr = False
    else:
        content_mode = "image_or_no_text"
        recommended_parse_mode = "pdf_ocr_required"
        requires_ocr = True

    return {
        "detected_file_type": "pdf",
        "content_mode": content_mode,
        "parser_verified": bool(pages),
        "page_count": len(pages),
        "processed_page_count": processed_count,
        "native_text_page_count": pdf_text_count,
        "ocr_page_count": ocr_count,
        "unknown_text_page_count": no_text_count,
        "requires_ocr": requires_ocr,
        "recommended_parse_mode": recommended_parse_mode,
    }


def build_structure_profile(
    pages: list[DocumentIngestionPage],
    *,
    artifact_profile: dict[str, object],
    dominant_document_kind: str,
    logical_documents: list[object] | None = None,
) -> dict[str, object]:
    table_profiles = _build_table_profiles(pages)
    raw_logical_documents = (
        logical_documents
        if logical_documents is not None
        else build_logical_document_estimates(pages)
    )
    logical_document_payloads = [
        _coerce_logical_document_payload(document) for document in raw_logical_documents
    ]
    extractable_table_count = sum(1 for table in table_profiles if table.get("extract_as_dataset"))
    has_required_deep_schema = any(
        _schema_requires_deep_extraction(str(document.get("document_kind") or "UNKNOWN"))
        for document in logical_document_payloads
    )

    return {
        "content_mode": artifact_profile.get("content_mode") or "unknown",
        "logical_document_count": len(logical_document_payloads),
        "logical_document_count_estimate": len(logical_document_payloads),
        "logical_documents": logical_document_payloads,
        "has_key_value_fields": any(page.header_fields for page in pages),
        "has_tables": bool(table_profiles),
        "table_count": len(table_profiles),
        "extractable_table_count": extractable_table_count,
        "deep_extraction_required": bool(table_profiles or has_required_deep_schema),
        "dominant_document_kind": dominant_document_kind,
        "tables": table_profiles,
    }


def build_extraction_plan(
    pages: list[DocumentIngestionPage],
    *,
    artifact_profile: dict[str, object],
    logical_documents: list[object],
) -> list[dict[str, object]]:
    plan: list[dict[str, object]] = []
    pages_by_number = {page.page_number: page for page in pages}
    for document in logical_documents:
        if not isinstance(document, dict):
            continue
        document_kind = str(document.get("document_kind") or "UNKNOWN")
        schema = get_document_kind_schema(document_kind)
        page_start = _coerce_int(document.get("page_start"))
        page_end = _coerce_int(document.get("page_end"))
        document_pages = [
            pages_by_number[page_number]
            for page_number in range(page_start or 0, (page_end or 0) + 1)
            if page_number in pages_by_number
        ]
        method = _recommended_extraction_method(document_pages, artifact_profile=artifact_profile)
        if schema is None or document_kind in {"UNKNOWN", "OTHER"} or not schema.extraction_schema_code:
            plan.append(
                {
                    "logical_document_id": document.get("logical_document_id"),
                    "document_kind": document_kind,
                    "page_start": page_start,
                    "page_end": page_end,
                    "schema_code": None,
                    "method": method,
                    "status": "MANUAL_REVIEW",
                    "reason": "No behavior-specific extraction schema is available for this document kind.",
                    "deep_extraction_required": False,
                    "schema_object_keys": [],
                }
            )
            continue

        schema_object_keys = [entry.object_key for entry in schema.extraction_objects]
        plan.append(
            {
                "logical_document_id": document.get("logical_document_id"),
                "document_kind": document_kind,
                "page_start": page_start,
                "page_end": page_end,
                "schema_code": schema.extraction_schema_code,
                "method": method,
                "status": "READY",
                "deep_extraction_required": bool(schema.deep_extraction_required or document.get("table_count")),
                "schema_object_keys": schema_object_keys,
            }
        )
    return plan


def build_logical_document_estimates(
    pages: list[DocumentIngestionPage],
    *,
    document_id: str | None = None,
) -> list[dict[str, object]]:
    ordered_pages = sorted(pages, key=lambda page: page.page_number)
    if not ordered_pages:
        return []

    groups: list[list[DocumentIngestionPage]] = []
    current_group: list[DocumentIngestionPage] = [ordered_pages[0]]
    current_key = _logical_document_group_key(ordered_pages[0])
    for page in ordered_pages[1:]:
        page_key = _logical_document_group_key(page)
        if page_key == current_key:
            current_group.append(page)
            continue
        groups.append(current_group)
        current_group = [page]
        current_key = page_key
    groups.append(current_group)

    logical_documents: list[dict[str, object]] = []
    for index, group in enumerate(groups, start=1):
        page_start = group[0].page_number
        page_end = group[-1].page_number
        document_kind = group[0].document_kind or "UNKNOWN"
        document_subtype = clean_optional_text(group[0].document_subtype)
        confidences = [
            page.classification_confidence
            for page in group
            if isinstance(page.classification_confidence, (int, float))
        ]
        table_count = sum(len(page.table_blocks or []) for page in group)
        logical_document_key = f"LD-{index:03d}"
        page_numbers = [page.page_number for page in group]
        page_ids = [page.page_id for page in group if page.page_id is not None]
        logical_documents.append(
            {
                "logical_document_id": (
                    f"{document_id}:{logical_document_key}"
                    if document_id is not None
                    else logical_document_key
                ),
                "logical_document_key": logical_document_key,
                "sequence_number": index,
                "document_kind": document_kind,
                "document_subtype": document_subtype,
                "page_start": page_start,
                "page_end": page_end,
                "page_numbers": page_numbers,
                "page_count": len(group),
                "classification_status": _merged_analysis_status(page.classification_status for page in group),
                "classification_confidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
                "review_status": _logical_document_review_status(group),
                "reviewed_at": _logical_document_reviewed_at(group),
                "reviewed_by": _logical_document_reviewed_by(group),
                "table_count": table_count,
                "deep_extraction_required": bool(table_count or _schema_requires_deep_extraction(document_kind)),
                "provenance": {
                    "source": "system_page_classification",
                    "split_strategy": "contiguous_page_classification_run",
                    "split_reason": (
                        "Contiguous pages with matching document kind and subtype are grouped as one logical document."
                    ),
                    "source_file_id": document_id,
                    "source_page_numbers": page_numbers,
                    "source_page_ids": page_ids,
                    "page_range": {
                        "start": page_start,
                        "end": page_end,
                    },
                    "classification_sources": [
                        _page_classification_source_snapshot(page)
                        for page in group
                    ],
                    "review_sources": [
                        _page_review_source_snapshot(page)
                        for page in group
                    ],
                },
            }
        )
    return logical_documents


def _logical_document_group_key(page: DocumentIngestionPage) -> tuple[str, str | None]:
    return page.document_kind or "UNKNOWN", clean_optional_text(page.document_subtype)


def _coerce_logical_document_payload(document: object) -> dict[str, object]:
    if isinstance(document, dict):
        payload = dict(document)
    else:
        payload = {
            "logical_document_id": getattr(document, "logical_document_id", None),
            "logical_document_key": getattr(document, "logical_document_key", None),
            "sequence_number": getattr(document, "sequence_number", None),
            "document_kind": getattr(document, "document_kind", None),
            "document_subtype": getattr(document, "document_subtype", None),
            "page_start": getattr(document, "page_start", None),
            "page_end": getattr(document, "page_end", None),
            "page_count": getattr(document, "page_count", None),
            "classification_status": getattr(document, "classification_status", None),
            "classification_confidence": getattr(document, "classification_confidence", None),
            "review_status": getattr(document, "review_status", None),
            "reviewed_at": getattr(document, "reviewed_at", None),
            "reviewed_by": getattr(document, "reviewed_by", None),
            "provenance": getattr(document, "provenance", None),
        }

    page_start = _coerce_int(payload.get("page_start"))
    page_end = _coerce_int(payload.get("page_end"))
    page_numbers = payload.get("page_numbers")
    if not isinstance(page_numbers, list) and page_start is not None and page_end is not None:
        page_numbers = list(range(page_start, page_end + 1))
    reviewed_at = payload.get("reviewed_at")
    if isinstance(reviewed_at, datetime):
        reviewed_at = reviewed_at.isoformat()

    return {
        "logical_document_id": clean_optional_text(payload.get("logical_document_id")) or "LD-UNKNOWN",
        "logical_document_key": clean_optional_text(payload.get("logical_document_key")) or "LD-UNKNOWN",
        "sequence_number": _coerce_int(payload.get("sequence_number")) or 0,
        "document_kind": (clean_optional_text(payload.get("document_kind")) or "UNKNOWN").upper(),
        "document_subtype": clean_optional_text(payload.get("document_subtype")),
        "page_start": page_start,
        "page_end": page_end,
        "page_numbers": page_numbers if isinstance(page_numbers, list) else [],
        "page_count": _coerce_int(payload.get("page_count")) or 0,
        "classification_status": (clean_optional_text(payload.get("classification_status")) or "PENDING").upper(),
        "classification_confidence": payload.get("classification_confidence"),
        "review_status": (clean_optional_text(payload.get("review_status")) or "UNREVIEWED").upper(),
        "reviewed_at": reviewed_at,
        "reviewed_by": clean_optional_text(payload.get("reviewed_by")),
        "provenance": payload.get("provenance") if isinstance(payload.get("provenance"), dict) else {},
    }


def _merged_analysis_status(statuses: object) -> str:
    normalized = [
        (clean_optional_text(status) or "PENDING").upper()
        for status in statuses
    ]
    if not normalized:
        return "PENDING"
    if any(status == "FAILED" for status in normalized):
        return "FAILED"
    if all(status == "ANALYZED" for status in normalized):
        return "ANALYZED"
    return "PENDING"


def _logical_document_review_status(pages: list[DocumentIngestionPage]) -> str:
    if pages and all(page.review_status == "REVIEWED" for page in pages):
        return "VERIFIED"
    if any(page.review_status == "REVIEWED" for page in pages):
        return "IN_REVIEW"
    return "UNREVIEWED"


def _logical_document_reviewed_at(pages: list[DocumentIngestionPage]) -> object | None:
    reviewed_dates = [page.reviewed_at for page in pages if page.reviewed_at is not None]
    return max(reviewed_dates) if reviewed_dates and all(page.review_status == "REVIEWED" for page in pages) else None


def _logical_document_reviewed_by(pages: list[DocumentIngestionPage]) -> str | None:
    reviewers = {
        clean_optional_text(page.reviewed_by)
        for page in pages
        if page.review_status == "REVIEWED" and clean_optional_text(page.reviewed_by)
    }
    if len(reviewers) == 1 and all(page.review_status == "REVIEWED" for page in pages):
        return next(iter(reviewers))
    return None


def _page_classification_source_snapshot(page: DocumentIngestionPage) -> dict[str, object]:
    classification_payload = dict(page.classification_payload or {})
    return {
        "page_number": page.page_number,
        "page_id": page.page_id,
        "document_kind": page.document_kind,
        "document_subtype": page.document_subtype,
        "classification_status": page.classification_status,
        "confidence": page.classification_confidence,
        "source": classification_payload.get("system_classification_source")
        or classification_payload.get("classification_source")
        or ("processor" if classification_payload.get("processor_applied") else "deterministic"),
        "matched_by": classification_payload.get("matched_by"),
    }


def _page_review_source_snapshot(page: DocumentIngestionPage) -> dict[str, object]:
    return {
        "page_number": page.page_number,
        "page_id": page.page_id,
        "review_status": page.review_status,
        "reviewed_at": page.reviewed_at.isoformat() if page.reviewed_at is not None else None,
        "reviewed_by": page.reviewed_by,
    }


def _build_table_profiles(pages: list[DocumentIngestionPage]) -> list[dict[str, object]]:
    table_profiles: list[dict[str, object]] = []
    for page in sorted(pages, key=lambda candidate: candidate.page_number):
        for table_position, table in enumerate(page.table_blocks or [], start=1):
            template_key = clean_optional_text(table.get("template_key"), lowercase=True)
            columns = [str(column) for column in table.get("columns") or [] if str(column).strip()]
            rows = list(table.get("rows") or [])
            table_index = _coerce_int(table.get("table_index")) or table_position
            row_profiles = _profile_table_rows(rows=rows, columns=columns)
            table_profiles.append(
                {
                    "table_id": f"p{page.page_number}-t{table_index}",
                    "logical_document_kind": page.document_kind or "UNKNOWN",
                    "source_location": {
                        "location_type": "pdf_page",
                        "page": page.page_number,
                    },
                    "detected_table_type": "detected_grid",
                    "semantic_table_type": template_key or "unknown_table",
                    "extract_as_dataset": template_key is not None,
                    "template_key": template_key,
                    "header_row_count": 1 if table.get("header_row_detected") else 0,
                    "data_row_count": sum(1 for row in row_profiles if row["row_type"] == "data"),
                    "column_count": len(columns),
                    "has_totals_row": any(row["row_type"] == "total" for row in row_profiles),
                    "has_subtotals": any(row["row_type"] == "subtotal" for row in row_profiles),
                    "has_repeated_headers": False,
                    "continues_from_previous_page": False,
                    "continues_to_next_page": False,
                    "confidence": 0.72 if template_key is None else 0.86,
                    "columns": [
                        {
                            "column_index": index,
                            "raw_header": column,
                            "normalized_column_code": normalize_key(column),
                            "confidence": 0.78 if template_key is None else 0.9,
                        }
                        for index, column in enumerate(columns, start=1)
                    ],
                    "rows": row_profiles,
                    "source": clean_optional_text(table.get("source"), lowercase=True),
                }
            )
    return table_profiles


def _profile_table_rows(*, rows: list[object], columns: list[str]) -> list[dict[str, object]]:
    row_profiles: list[dict[str, object]] = []
    for index, raw_row in enumerate(rows, start=1):
        row = raw_row if isinstance(raw_row, dict) else {}
        row_text = " ".join(str(row.get(column) or "") for column in columns).strip().lower()
        if not row_text:
            row_type = "blank"
        elif "subtotal" in row_text:
            row_type = "subtotal"
        elif "total" in row_text:
            row_type = "total"
        elif all(not str(row.get(column) or "").strip() for column in columns):
            row_type = "blank"
        else:
            row_type = "data"
        row_profiles.append(
            {
                "row_index": index,
                "row_type": row_type,
                "confidence": 0.8,
            }
        )
    return row_profiles


def _recommended_extraction_method(
    pages: list[DocumentIngestionPage],
    *,
    artifact_profile: dict[str, object],
) -> str:
    if not pages:
        return str(artifact_profile.get("recommended_parse_mode") or "manual_review")
    source_counts = Counter(page_text_source(page) for page in pages)
    if source_counts.get("ocr") and source_counts.get("pdf_text"):
        return "pdf_hybrid_text_plus_ocr"
    if source_counts.get("ocr"):
        return "pdf_ocr"
    if source_counts.get("pdf_text"):
        return "pdf_native_text"
    return "pdf_ocr_required"


def _schema_requires_deep_extraction(document_kind: str) -> bool:
    schema = get_document_kind_schema(document_kind)
    return bool(schema and schema.deep_extraction_required)


def _coerce_int(value: object) -> int | None:
    if isinstance(value, int):
        return value
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def validate_document_review_status_transition(
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
        page_errors = collect_page_review_errors(
            document_kind=page.document_kind,
            header_fields=list(page.header_fields or []),
            table_blocks=list(page.table_blocks or []),
        )
        if page_errors:
            raise ValueError(f"Page {page.page_number} is not ready for verification: {' '.join(page_errors)}")


def validate_page_review_state(
    *,
    document_kind: str,
    header_fields: list[dict[str, object]],
    table_blocks: list[dict[str, object]],
    review_status: str,
) -> None:
    if review_status != "REVIEWED":
        return
    errors = collect_page_review_errors(
        document_kind=document_kind,
        header_fields=header_fields,
        table_blocks=table_blocks,
    )
    if errors:
        raise ValueError(" ".join(errors))


def collect_page_review_errors(
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


def derive_document_review_status_after_page_change(
    current_status: str,
    pages: list[DocumentIngestionPage],
) -> str:
    if current_status == "VERIFIED":
        return "IN_REVIEW"
    if any(page.review_status == "REVIEWED" for page in pages):
        return "IN_REVIEW"
    return "UNREVIEWED"


def page_text_source(page: DocumentIngestionPage) -> str:
    classification_payload = dict(page.classification_payload or {})
    candidate = str(classification_payload.get("text_source", "")).strip().lower()
    if candidate in {"pdf_text", "ocr"}:
        return candidate
    return "none"


def normalize_header_fields(
    fields: list[dict[str, Any]],
    *,
    document_kind: str,
) -> list[dict[str, object]]:
    schema = get_document_kind_schema(document_kind)
    labels_by_key = {field.field_key: field.label for field in schema.header_fields} if schema else {}
    normalized_fields: list[dict[str, object]] = []
    seen_keys: set[str] = set()
    for raw_field in fields:
        field_key = normalize_key(str(raw_field.get("field_key", "")))
        if not field_key:
            continue
        value = clean_optional_text(raw_field.get("value"))
        if value is None:
            continue
        if field_key in seen_keys:
            raise ValueError(f"Header fields must not contain duplicate field keys: {field_key}")
        seen_keys.add(field_key)
        normalized_fields.append(
            DocumentExtractedFieldOut(
                field_key=field_key,
                label=clean_optional_text(raw_field.get("label")) or labels_by_key.get(field_key) or humanize_key(field_key),
                value=value,
                confidence=raw_field.get("confidence"),
                source=clean_optional_text(raw_field.get("source")) or "review",
            ).model_dump()
        )
    return normalized_fields


def normalize_table_blocks(
    blocks: list[dict[str, Any]],
    *,
    document_kind: str,
) -> list[dict[str, object]]:
    schema = get_document_kind_schema(document_kind)
    templates_by_key = {template.template_key: template for template in schema.table_templates} if schema else {}
    normalized_blocks: list[dict[str, object]] = []

    for index, raw_block in enumerate(blocks, start=1):
        template_key = clean_optional_text(raw_block.get("template_key"), lowercase=True)
        if template_key is not None and template_key not in templates_by_key:
            raise ValueError(f"Table template '{template_key}' is not supported for document kind '{document_kind}'")

        columns = [
            normalize_key(str(column))
            for column in raw_block.get("columns", [])
            if normalize_key(str(column))
        ]
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

        rows: list[dict[str, str | None]] = []
        for raw_row in raw_block.get("rows", []):
            normalized_row: dict[str, str | None] = {}
            for key, value in raw_row.items():
                normalized_key = normalize_key(str(key))
                if not normalized_key:
                    continue
                if normalized_key not in columns:
                    columns.append(normalized_key)
                normalized_row[normalized_key] = clean_optional_text(value)
            rows.append({column: normalized_row.get(column) for column in columns})

        normalized_blocks.append(
            DocumentTableBlockOut(
                table_index=index,
                template_key=template_key,
                title=clean_optional_text(raw_block.get("title")),
                columns=columns,
                rows=rows,
                header_row_detected=bool(raw_block.get("header_row_detected", False)),
                source=clean_optional_text(raw_block.get("source"), lowercase=True) or "review",
            ).model_dump()
        )
    return normalized_blocks
