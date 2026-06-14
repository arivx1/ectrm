from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from dataclasses import field
from datetime import datetime
from typing import Any

from apps.api.app.domains.documents.services.document_ingestion_analysis import CLASSIFICATION_RULES
from apps.api.app.domains.documents.services.document_ingestion_analysis import extract_document_header_fields
from apps.api.app.domains.documents.services.schema_registry import get_document_kind_schema
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentExtractedFieldOut
from apps.api.app.schemas.document import DocumentReviewStatus
from apps.api.app.schemas.document import DocumentTableBlockOut

from .document_routing import build_document_routing_assessment
from .document_ingestion_common import clean_optional_text
from .document_ingestion_common import humanize_key
from .document_ingestion_common import normalize_for_matching
from .document_ingestion_common import normalize_key


_SYSTEM_PAGE_CLASSIFICATION_SOURCE = "system_page_classification"
_SYSTEM_PACKET_STRUCTURE_SOURCE = "system_packet_structure"
_CONTIGUOUS_SPLIT_STRATEGY = "contiguous_page_classification_run"
_STRUCTURE_SPLIT_STRATEGY = "packet_structure_signal_run"
_ATTACHMENT_BOUNDARY_MARKERS = (
    "attached documents",
    "attachments",
    "backup documentation",
    "backup documents",
    "enclosures",
    "exhibits",
    "miscellaneous documents",
    "supporting documents",
    "supporting documentation",
)
_COMMON_REFERENCE_KEYS = {
    "account",
    "applicant",
    "beneficiary",
    "buyer",
    "carrier",
    "commodity",
    "consignee",
    "counterparty",
    "customer_reference",
    "delivery_id",
    "external_trade_id",
    "product",
    "seller",
    "shipper",
    "source_series_id",
    "trade_id",
}
_SPLIT_CONFIDENCE_CONTIGUOUS = 0.68
_SPLIT_CONFIDENCE_DISTINCT_IDENTITY = 0.86
_SPLIT_CONFIDENCE_SECTION_BOUNDARY = 0.82
_SPLIT_CONFIDENCE_ADJACENT_IDENTITY = 0.78
_SPLIT_CONFIDENCE_ATTACHMENT_MARKER = 0.7


@dataclass(frozen=True)
class _PageStructureSignal:
    page: DocumentIngestionPage
    group_key: tuple[str, str | None]
    section_title_kinds: set[str]
    identity_values_by_kind: dict[str, dict[str, str]]
    attachment_markers: list[str]


@dataclass
class _LogicalDocumentGroup:
    group_key: tuple[str, str | None]
    signals: list[_PageStructureSignal]
    reasons: list[str] = field(default_factory=list)
    evidence: list[dict[str, object]] = field(default_factory=list)
    confidence: float = _SPLIT_CONFIDENCE_CONTIGUOUS
    enhanced: bool = False


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
    page_membership_counts: Counter[int] = Counter()
    for document in logical_document_payloads:
        for page_number in document.get("page_numbers", []):
            if isinstance(page_number, int):
                page_membership_counts[page_number] += 1
    shared_page_numbers = [
        page_number
        for page_number, count in sorted(page_membership_counts.items())
        if count > 1
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
        "shared_page_numbers": shared_page_numbers,
        "shared_page_count": len(shared_page_numbers),
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
        page_numbers = [
            page_number
            for page_number in document.get("page_numbers", [])
            if isinstance(page_number, int)
        ]
        if not page_numbers and page_start is not None and page_end is not None:
            page_numbers = list(range(page_start, page_end + 1))
        document_pages = [pages_by_number[page_number] for page_number in page_numbers if page_number in pages_by_number]
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

    signals = [_build_page_structure_signal(page) for page in ordered_pages]
    groups = _build_logical_document_groups(signals)
    _apply_shared_boundary_pages(groups)
    shared_page_numbers = _shared_page_numbers_for_groups(groups)

    logical_documents: list[dict[str, object]] = []
    for index, group in enumerate(groups, start=1):
        group_signals = _sorted_unique_signals(group.signals)
        group_pages = [signal.page for signal in group_signals]
        page_start = group_pages[0].page_number
        page_end = group_pages[-1].page_number
        document_kind = group.group_key[0] or "UNKNOWN"
        document_subtype = group.group_key[1]
        confidences = [
            page.classification_confidence
            for page in group_pages
            if isinstance(page.classification_confidence, (int, float))
        ]
        table_count = sum(len(page.table_blocks or []) for page in group_pages)
        logical_document_key = f"LD-{index:03d}"
        page_numbers = [page.page_number for page in group_pages]
        page_ids = [page.page_id for page in group_pages if page.page_id is not None]
        segment_shared_pages = [
            page_number for page_number in page_numbers if page_number in shared_page_numbers
        ]
        enhanced = group.enhanced or bool(segment_shared_pages)
        split_source = _SYSTEM_PACKET_STRUCTURE_SOURCE if enhanced else _SYSTEM_PAGE_CLASSIFICATION_SOURCE
        split_strategy = _STRUCTURE_SPLIT_STRATEGY if enhanced else _CONTIGUOUS_SPLIT_STRATEGY
        split_reason = (
            " ".join(group.reasons)
            if group.reasons
            else "Contiguous pages with matching document kind and subtype are grouped as one logical document."
        )
        split_evidence = group.evidence or [
            {
                "type": "contiguous_page_classification",
                "confidence": _SPLIT_CONFIDENCE_CONTIGUOUS,
                "summary": (
                    "Grouped contiguous pages with matching document kind and subtype."
                ),
                "page_numbers": page_numbers,
                "document_kind": document_kind,
            }
        ]
        provenance: dict[str, object] = {
            "source": split_source,
            "split_strategy": split_strategy,
            "split_reason": split_reason,
            "split_confidence": round(max(group.confidence, _SPLIT_CONFIDENCE_CONTIGUOUS), 2),
            "split_evidence": split_evidence,
            "source_file_id": document_id,
            "source_page_numbers": page_numbers,
            "source_page_ids": page_ids,
            "page_range": {
                "start": page_start,
                "end": page_end,
            },
            "classification_sources": [
                _page_classification_source_snapshot(page)
                for page in group_pages
            ],
            "review_sources": [
                _page_review_source_snapshot(page)
                for page in group_pages
            ],
        }
        if segment_shared_pages:
            provenance["shared_page_numbers"] = segment_shared_pages
        if group.reasons:
            provenance["structure_signals"] = list(group.reasons)
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
                "page_count": len(group_pages),
                "classification_status": _merged_analysis_status(page.classification_status for page in group_pages),
                "classification_confidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
                "review_status": _logical_document_review_status(group_pages),
                "reviewed_at": _logical_document_reviewed_at(group_pages),
                "reviewed_by": _logical_document_reviewed_by(group_pages),
                "table_count": table_count,
                "deep_extraction_required": bool(table_count or _schema_requires_deep_extraction(document_kind)),
                "provenance": provenance,
            }
        )
    return logical_documents


def _build_logical_document_groups(
    signals: list[_PageStructureSignal],
) -> list[_LogicalDocumentGroup]:
    groups: list[_LogicalDocumentGroup] = []
    current_group = _LogicalDocumentGroup(group_key=signals[0].group_key, signals=[signals[0]])

    for signal in signals[1:]:
        if signal.group_key != current_group.group_key:
            groups.append(current_group)
            current_group = _LogicalDocumentGroup(group_key=signal.group_key, signals=[signal])
            continue
        if _starts_new_same_kind_document(signal, current_group):
            groups.append(current_group)
            evidence = _distinct_identity_evidence(signal)
            current_group = _LogicalDocumentGroup(
                group_key=signal.group_key,
                signals=[signal],
                reasons=[str(evidence["summary"])],
                evidence=[evidence],
                confidence=_SPLIT_CONFIDENCE_DISTINCT_IDENTITY,
                enhanced=True,
            )
            continue
        current_group.signals.append(signal)
    groups.append(current_group)
    return groups


def _apply_shared_boundary_pages(groups: list[_LogicalDocumentGroup]) -> None:
    for index in range(len(groups) - 1):
        left = groups[index]
        right = groups[index + 1]
        left_last = _sorted_unique_signals(left.signals)[-1]
        right_first = _sorted_unique_signals(right.signals)[0]
        left_kind = left.group_key[0]
        right_kind = right.group_key[0]
        if left.group_key == right.group_key:
            continue

        left_boundary_evidence = _adjacent_boundary_evidence(left_last, right_kind)
        if left_boundary_evidence is not None:
            right.signals.append(left_last)
            left.enhanced = True
            right.enhanced = True
            _append_group_evidence(left, left_boundary_evidence)
            _append_group_evidence(right, left_boundary_evidence)

        right_boundary_evidence = _adjacent_boundary_evidence(right_first, left_kind)
        if right_boundary_evidence is not None:
            left.signals.append(right_first)
            left.enhanced = True
            right.enhanced = True
            _append_group_evidence(left, right_boundary_evidence)
            _append_group_evidence(right, right_boundary_evidence)


def _logical_document_group_key(page: DocumentIngestionPage) -> tuple[str, str | None]:
    return page.document_kind or "UNKNOWN", clean_optional_text(page.document_subtype)


def _build_page_structure_signal(page: DocumentIngestionPage) -> _PageStructureSignal:
    raw_text = page.raw_text or ""
    normalized_text = normalize_for_matching(raw_text)
    text_source = page_text_source(page)
    section_title_kinds = _section_title_kinds(raw_text)
    identity_values_by_kind: dict[str, dict[str, str]] = {}
    for document_kind, _keywords in CLASSIFICATION_RULES:
        if document_kind in {"OTHER", "UNKNOWN"}:
            continue
        if document_kind == page.document_kind:
            fields = list(page.header_fields or [])
            if not fields:
                fields = extract_document_header_fields(document_kind, raw_text, text_source=text_source)
        elif document_kind in section_title_kinds or _kind_keywords_present(document_kind, normalized_text):
            fields = extract_document_header_fields(document_kind, raw_text, text_source=text_source)
        else:
            fields = []
        identity_values = _distinctive_identity_values(document_kind, fields)
        if identity_values:
            identity_values_by_kind[document_kind] = identity_values

    return _PageStructureSignal(
        page=page,
        group_key=_logical_document_group_key(page),
        section_title_kinds=section_title_kinds,
        identity_values_by_kind=identity_values_by_kind,
        attachment_markers=[
            marker
            for marker in _ATTACHMENT_BOUNDARY_MARKERS
            if marker in normalized_text
        ],
    )


def _starts_new_same_kind_document(
    signal: _PageStructureSignal,
    current_group: _LogicalDocumentGroup,
) -> bool:
    document_kind = signal.group_key[0]
    if document_kind in {"OTHER", "UNKNOWN"}:
        return False

    signal_identity = signal.identity_values_by_kind.get(document_kind, {})
    if not signal_identity:
        return False

    current_identity = _merged_identity_values(current_group.signals, document_kind)
    if not current_identity:
        return False

    if not _has_document_start_evidence(signal, document_kind):
        return False

    return _identity_values_conflict(current_identity, signal_identity)


def _adjacent_boundary_evidence(
    signal: _PageStructureSignal,
    document_kind: str,
) -> dict[str, object] | None:
    page_number = signal.page.page_number
    if document_kind in {"OTHER", "UNKNOWN"}:
        if not signal.attachment_markers:
            return None
        return {
            "type": "attachment_boundary_marker",
            "confidence": _SPLIT_CONFIDENCE_ATTACHMENT_MARKER,
            "summary": (
                f"Page {page_number} contains attachment or supporting-document markers near the packet boundary."
            ),
            "page_number": page_number,
            "document_kind": document_kind,
            "markers": signal.attachment_markers,
        }
    if document_kind in signal.section_title_kinds:
        return {
            "type": "section_title_boundary",
            "confidence": _SPLIT_CONFIDENCE_SECTION_BOUNDARY,
            "summary": (
                f"Page {page_number} also contains a {document_kind} section title at the packet boundary."
            ),
            "page_number": page_number,
            "document_kind": document_kind,
        }
    identity_values = signal.identity_values_by_kind.get(document_kind, {})
    if identity_values and _has_document_start_evidence(signal, document_kind):
        return {
            "type": "adjacent_identity_boundary",
            "confidence": _SPLIT_CONFIDENCE_ADJACENT_IDENTITY,
            "summary": (
                f"Page {page_number} contains {document_kind} identity evidence at the packet boundary."
            ),
            "page_number": page_number,
            "document_kind": document_kind,
            "identity_keys": sorted(identity_values),
        }
    return None


def _distinct_identity_evidence(signal: _PageStructureSignal) -> dict[str, object]:
    document_kind = signal.group_key[0]
    identity_values = signal.identity_values_by_kind.get(document_kind, {})
    return {
        "type": "distinct_identity",
        "confidence": _SPLIT_CONFIDENCE_DISTINCT_IDENTITY,
        "summary": (
            f"Page {signal.page.page_number} starts a new {document_kind} from distinct identity evidence."
        ),
        "page_number": signal.page.page_number,
        "document_kind": document_kind,
        "identity_keys": sorted(identity_values),
    }


def _append_group_evidence(
    group: _LogicalDocumentGroup,
    evidence: dict[str, object],
) -> None:
    summary = clean_optional_text(evidence.get("summary"))
    if summary and summary not in group.reasons:
        group.reasons.append(summary)
    if evidence not in group.evidence:
        group.evidence.append(evidence)
    confidence = evidence.get("confidence")
    if isinstance(confidence, (int, float)):
        group.confidence = max(group.confidence, float(confidence))


def _has_document_start_evidence(signal: _PageStructureSignal, document_kind: str) -> bool:
    if document_kind in signal.section_title_kinds:
        return True
    raw_text = signal.page.raw_text or ""
    normalized_lines = [
        normalize_for_matching(line)
        for line in raw_text.splitlines()[:12]
        if line.strip()
    ]
    return any("page 1 of" in line or line in {"page 1", "p 1"} for line in normalized_lines)


def _merged_identity_values(
    signals: list[_PageStructureSignal],
    document_kind: str,
) -> dict[str, str]:
    merged: dict[str, str] = {}
    for signal in signals:
        for key, value in signal.identity_values_by_kind.get(document_kind, {}).items():
            merged.setdefault(key, value)
    return merged


def _identity_values_conflict(
    current_identity: dict[str, str],
    next_identity: dict[str, str],
) -> bool:
    for key, next_value in next_identity.items():
        current_value = current_identity.get(key)
        if current_value is not None and current_value != next_value:
            return True
    return False


def _section_title_kinds(raw_text: str | None) -> set[str]:
    if not raw_text:
        return set()
    title_lines = [
        normalize_for_matching(line)
        for line in raw_text.splitlines()
        if _line_can_be_section_title(line)
    ]
    if not title_lines:
        return set()

    hits: set[str] = set()
    for document_kind, keywords in CLASSIFICATION_RULES:
        if document_kind in {"OTHER", "UNKNOWN"}:
            continue
        for line in title_lines:
            if any(_keyword_matches_title_line(keyword, line) for keyword in keywords):
                hits.add(document_kind)
                break
    return hits


def _line_can_be_section_title(line: str) -> bool:
    stripped = line.strip(" \t#.-")
    if not stripped:
        return False
    if ":" in stripped and not stripped.endswith(":"):
        return False
    if len(stripped) > 90:
        return False
    words = [word for word in normalize_for_matching(stripped).split() if word]
    return 1 <= len(words) <= 8


def _keyword_matches_title_line(keyword: str, normalized_line: str) -> bool:
    if not keyword or not normalized_line:
        return False
    if normalized_line == keyword:
        return True
    if normalized_line.startswith(f"{keyword} "):
        return True
    if normalized_line.endswith(f" {keyword}"):
        return True
    return f" {keyword} " in f" {normalized_line} " and len(normalized_line) <= len(keyword) + 28


def _kind_keywords_present(document_kind: str, normalized_text: str) -> bool:
    if not normalized_text:
        return False
    for candidate_kind, keywords in CLASSIFICATION_RULES:
        if candidate_kind != document_kind:
            continue
        return any(keyword in normalized_text for keyword in keywords)
    return False


def _distinctive_identity_values(
    document_kind: str,
    fields: list[dict[str, object]],
) -> dict[str, str]:
    distinctive_keys = _distinctive_identity_keys(document_kind)
    values: dict[str, str] = {}
    for field in fields:
        field_key = clean_optional_text(field.get("field_key"), lowercase=True)
        if field_key not in distinctive_keys:
            continue
        value = clean_optional_text(field.get("value"))
        if value is None:
            continue
        values[field_key] = value.upper()
    return values


def _distinctive_identity_keys(document_kind: str) -> set[str]:
    schema = get_document_kind_schema(document_kind)
    if schema is None:
        return set()
    candidate_keys = {
        field.field_key
        for field in schema.header_fields
        if field.value_type == "identifier"
    } | set(schema.matching_keys)
    distinctive_keys: set[str] = set()
    for key in candidate_keys:
        normalized_key = normalize_key(key)
        if normalized_key in _COMMON_REFERENCE_KEYS:
            continue
        if normalized_key.endswith("_number") or normalized_key.endswith("_reference"):
            distinctive_keys.add(normalized_key)
            continue
        if normalized_key in {"sample_id", "lot_number", "voyage_number"}:
            distinctive_keys.add(normalized_key)
    return distinctive_keys


def _sorted_unique_signals(signals: list[_PageStructureSignal]) -> list[_PageStructureSignal]:
    by_page_number: dict[int, _PageStructureSignal] = {}
    for signal in signals:
        by_page_number[signal.page.page_number] = signal
    return [
        by_page_number[page_number]
        for page_number in sorted(by_page_number)
    ]


def _shared_page_numbers_for_groups(groups: list[_LogicalDocumentGroup]) -> set[int]:
    counts: Counter[int] = Counter()
    for group in groups:
        for signal in _sorted_unique_signals(group.signals):
            counts[signal.page.page_number] += 1
    return {page_number for page_number, count in counts.items() if count > 1}


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
