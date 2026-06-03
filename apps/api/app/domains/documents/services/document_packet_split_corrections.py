from __future__ import annotations

import hashlib
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event

from .document_ingestion_review import build_logical_document_estimates


PACKET_SPLIT_CORRECTION_EVENT_TYPE = "DocumentPacketSplitCorrectionCaptured"
HUMAN_PACKET_SPLIT_SOURCE = "human_packet_split"
PACKET_SPLIT_REPLAY_FIXTURE_VERSION = 1
PACKET_SPLIT_REPLAY_SUITE_VERSION = "document-packet-split-corrections-v1"


def build_packet_split_correction_payload(
    *,
    document: DocumentIngestion,
    pages: Sequence[DocumentIngestionPage],
    system_snapshot: Sequence[Mapping[str, Any]],
    accepted_snapshot: Sequence[Mapping[str, Any]],
) -> dict[str, object] | None:
    """Build an activity payload when an operator corrects a system packet split."""

    persisted_system_documents = normalize_packet_split_documents_for_replay(system_snapshot)
    accepted_documents = normalize_packet_split_documents_for_replay(accepted_snapshot)
    if not persisted_system_documents or not accepted_documents:
        return None
    if _contains_human_split_source(system_snapshot):
        return None
    detector_documents = normalize_packet_split_documents_for_replay(
        build_logical_document_estimates(list(pages), document_id=document.document_id)
    )
    system_documents = persisted_system_documents
    if (
        _needs_split_evidence(system_documents)
        and detector_documents
        and _packet_split_membership_signature(detector_documents)
        != _packet_split_membership_signature(accepted_documents)
    ):
        system_documents = detector_documents
    if (
        _packet_split_membership_signature(persisted_system_documents)
        == _packet_split_membership_signature(accepted_documents)
    ):
        return None

    system_shared_pages = _shared_page_numbers(system_documents)
    accepted_shared_pages = _shared_page_numbers(accepted_documents)
    payload: dict[str, object] = {
        "source_file_id": document.document_id,
        "original_filename": document.original_filename,
        "page_count": document.page_count,
        "page_numbers": [
            page.page_number for page in sorted(pages, key=lambda item: item.page_number)
        ],
        "system_logical_document_count": len(system_documents),
        "accepted_logical_document_count": len(accepted_documents),
        "system_logical_documents": system_documents,
        "accepted_logical_documents": accepted_documents,
        "system_shared_page_numbers": system_shared_pages,
        "accepted_shared_page_numbers": accepted_shared_pages,
        "changed_fields": _changed_fields(
            system_documents=system_documents,
            accepted_documents=accepted_documents,
            system_shared_pages=system_shared_pages,
            accepted_shared_pages=accepted_shared_pages,
        ),
        "replay_fixture_version": PACKET_SPLIT_REPLAY_FIXTURE_VERSION,
        "replay_helper": (
            "apps.api.app.domains.documents.services.document_packet_split_corrections."
            "build_packet_split_correction_replay_case"
        ),
    }
    if system_documents != persisted_system_documents:
        payload["persisted_system_logical_documents"] = persisted_system_documents
    return payload


def build_packet_split_correction_replay_case(
    *,
    document: DocumentIngestion,
    pages: Sequence[DocumentIngestionPage],
    correction_payload: Mapping[str, Any],
) -> dict[str, object]:
    """Convert a captured correction activity payload into a deterministic fixture."""

    system_documents = normalize_packet_split_documents_for_replay(
        _mapping_sequence(correction_payload.get("system_logical_documents"))
    )
    accepted_documents = normalize_packet_split_documents_for_replay(
        _mapping_sequence(correction_payload.get("accepted_logical_documents"))
    )
    ordered_pages = sorted(pages, key=lambda item: item.page_number)
    return {
        "fixture_type": "document_packet_split_correction",
        "fixture_version": PACKET_SPLIT_REPLAY_FIXTURE_VERSION,
        "source_file_id": correction_payload.get("source_file_id") or document.document_id,
        "original_filename": correction_payload.get("original_filename") or document.original_filename,
        "page_count": correction_payload.get("page_count") or document.page_count,
        "pages": [_replay_page(page) for page in ordered_pages],
        "system_logical_documents": system_documents,
        "expected_logical_documents": accepted_documents,
        "system_shared_page_numbers": _shared_page_numbers(system_documents),
        "expected_shared_page_numbers": _shared_page_numbers(accepted_documents),
        "changed_fields": list(correction_payload.get("changed_fields") or []),
        "detector_contract": {
            "function": (
                "apps.api.app.domains.documents.services.document_ingestion_review."
                "build_logical_document_estimates"
            ),
            "compare_fields": [
                "sequence_number",
                "document_kind",
                "document_subtype",
                "page_numbers",
                "shared_page_numbers",
            ],
        },
    }


def build_packet_split_correction_replay_suite(
    db: Session,
    *,
    limit: int = 100,
    document_ids: Sequence[str] | None = None,
    suite_version: str = PACKET_SPLIT_REPLAY_SUITE_VERSION,
) -> dict[str, object]:
    """Export captured correction events as replayable detector fixtures."""

    if limit <= 0:
        raise ValueError("limit must be greater than 0")

    events = _load_packet_split_correction_events(db, limit=limit, document_ids=document_ids)
    aggregate_ids = [event.aggregate_id for event in events]
    documents = _load_documents_by_id(db, aggregate_ids)
    pages_by_document_id = _load_pages_by_document_id(db, aggregate_ids)

    cases: list[dict[str, object]] = []
    skipped_events: list[dict[str, object]] = []
    for index, event in enumerate(events, start=1):
        document = documents.get(event.aggregate_id)
        pages = pages_by_document_id.get(event.aggregate_id, [])
        if document is None:
            skipped_events.append(_skipped_event(event, reason="missing_document"))
            continue
        if not pages:
            skipped_events.append(_skipped_event(event, reason="missing_pages"))
            continue
        case = build_packet_split_correction_replay_case(
            document=document,
            pages=pages,
            correction_payload=dict(event.payload or {}),
        )
        case.update(
            {
                "case_id": f"packet-split-correction-{index:04d}",
                "correction_event_id": event.event_id,
                "captured_at": _isoformat(event.occurred_at),
                "captured_by": event.actor_id,
            }
        )
        cases.append(case)

    return {
        "fixture_type": "document_packet_split_correction_suite",
        "suite_version": suite_version,
        "source_event_type": PACKET_SPLIT_CORRECTION_EVENT_TYPE,
        "summary": {
            "event_count": len(events),
            "case_count": len(cases),
            "skipped_event_count": len(skipped_events),
            "document_count": len({case.get("source_file_id") for case in cases}),
            "limit": limit,
        },
        "cases": cases,
        "skipped_events": skipped_events,
    }


def evaluate_packet_split_correction_replay_suite(
    suite: Mapping[str, Any],
    *,
    min_exact_match_rate: float = 1.0,
    max_mismatch_count: int = 0,
) -> dict[str, object]:
    """Replay a packet split correction suite against the current detector."""

    if not 0 <= min_exact_match_rate <= 1:
        raise ValueError("min_exact_match_rate must be between 0 and 1")
    if max_mismatch_count < 0:
        raise ValueError("max_mismatch_count must be >= 0")

    results: list[dict[str, object]] = []
    for case in _mapping_sequence(suite.get("cases")):
        pages = _pages_from_replay_case(case)
        actual_documents = normalize_packet_split_documents_for_replay(
            build_logical_document_estimates(pages, document_id=_case_source_file_id(case))
        )
        expected_documents = normalize_packet_split_documents_for_replay(
            _mapping_sequence(case.get("expected_logical_documents"))
        )
        issues = _packet_split_replay_issues(actual_documents, expected_documents)
        issue_categories = _packet_split_issue_categories(issues)
        exact_match = not issues
        results.append(
            {
                "case_id": case.get("case_id"),
                "correction_event_id": case.get("correction_event_id"),
                "source_file_id": case.get("source_file_id"),
                "original_filename": case.get("original_filename"),
                "expected_logical_document_count": len(expected_documents),
                "actual_logical_document_count": len(actual_documents),
                "expected_shared_page_numbers": _shared_page_numbers(expected_documents),
                "actual_shared_page_numbers": _shared_page_numbers(actual_documents),
                "changed_fields": list(case.get("changed_fields") or []),
                "exact_match": exact_match,
                "issue_categories": issue_categories,
                "issues": issues,
                "expected_logical_documents": expected_documents,
                "actual_logical_documents": actual_documents,
            }
        )

    total_case_count = len(results)
    exact_match_count = sum(1 for result in results if result["exact_match"])
    mismatch_count = total_case_count - exact_match_count
    exact_match_rate = round(exact_match_count / total_case_count, 4) if total_case_count else 1.0
    changed_field_counts = _changed_field_counts(results)
    issue_category_counts = _issue_category_counts(results)
    passed = exact_match_rate >= min_exact_match_rate and mismatch_count <= max_mismatch_count
    return {
        "suite_version": suite.get("suite_version") or PACKET_SPLIT_REPLAY_SUITE_VERSION,
        "total_case_count": total_case_count,
        "exact_match_count": exact_match_count,
        "mismatch_count": mismatch_count,
        "exact_match_rate": exact_match_rate,
        "thresholds": {
            "min_exact_match_rate": min_exact_match_rate,
            "max_mismatch_count": max_mismatch_count,
        },
        "changed_field_counts": changed_field_counts,
        "issue_category_counts": issue_category_counts,
        "passed": passed,
        "results": results,
    }


def format_packet_split_correction_eval_report(summary: Mapping[str, Any]) -> str:
    total = int(summary.get("total_case_count") or 0)
    exact = int(summary.get("exact_match_count") or 0)
    mismatches = int(summary.get("mismatch_count") or 0)
    rate = float(summary.get("exact_match_rate") or 0.0)
    status = "PASS" if summary.get("passed") else "FAIL"
    lines = [
        f"Document packet split correction replay: {status}",
        f"Cases: {total} | exact matches: {exact} | mismatches: {mismatches} | exact match rate: {rate:.2%}",
    ]
    failed_results = [
        result for result in _mapping_sequence(summary.get("results")) if not result.get("exact_match")
    ]
    issue_category_counts = _mapping(summary.get("issue_category_counts"))
    if issue_category_counts:
        lines.append("Mismatches by cause:")
        for category, count in sorted(issue_category_counts.items(), key=lambda item: (-int(item[1]), item[0])):
            lines.append(f"- {category}: {count}")
    if failed_results:
        lines.append("Mismatched cases:")
        for result in failed_results[:10]:
            issues = ", ".join(str(issue) for issue in result.get("issues", []))
            categories = ", ".join(str(category) for category in result.get("issue_categories", []))
            prefix = f"[{categories}] " if categories else ""
            lines.append(
                f"- {result.get('case_id') or result.get('source_file_id')}: {prefix}{issues or 'packet split mismatch'}"
            )
    return "\n".join(lines)


def normalize_packet_split_documents_for_replay(
    logical_documents: Sequence[Mapping[str, Any]],
) -> list[dict[str, object]]:
    documents: list[dict[str, object]] = []
    for fallback_index, item in enumerate(logical_documents, start=1):
        if not isinstance(item, Mapping):
            continue
        provenance = _mapping(item.get("provenance"))
        sequence_number = _optional_int(item.get("sequence_number")) or fallback_index
        page_numbers = _document_page_numbers(item, provenance=provenance)
        documents.append(
            {
                "sequence_number": sequence_number,
                "logical_document_key": _optional_str(item.get("logical_document_key")) or f"LD-{sequence_number:03d}",
                "document_kind": _normalized_kind(item.get("document_kind")),
                "document_subtype": _optional_str(item.get("document_subtype")),
                "page_numbers": page_numbers,
                "page_ids": _document_page_ids(item, provenance=provenance),
                "shared_page_numbers": _as_int_list(item.get("shared_page_numbers"))
                or _as_int_list(provenance.get("shared_page_numbers")),
                "split_source": _optional_str(item.get("split_source")) or _optional_str(provenance.get("source")),
                "split_strategy": _optional_str(item.get("split_strategy"))
                or _optional_str(provenance.get("split_strategy")),
                "split_confidence": _optional_float(item.get("split_confidence"))
                if _optional_float(item.get("split_confidence")) is not None
                else _optional_float(provenance.get("split_confidence")),
                "split_evidence": _mapping_list(item.get("split_evidence"))
                or _mapping_list(provenance.get("split_evidence")),
            }
        )
    return sorted(documents, key=lambda item: (int(item["sequence_number"]), list(item["page_numbers"])))


def _contains_human_split_source(snapshot: Sequence[Mapping[str, Any]]) -> bool:
    return any(
        _mapping(item.get("provenance")).get("source") == HUMAN_PACKET_SPLIT_SOURCE
        for item in snapshot
        if isinstance(item, Mapping)
    )


def _needs_split_evidence(documents: Sequence[Mapping[str, Any]]) -> bool:
    return any(
        not item.get("split_source") or not item.get("split_evidence")
        for item in documents
    )


def _packet_split_membership_signature(
    documents: Sequence[Mapping[str, Any]],
) -> list[tuple[str, str | None, tuple[int, ...]]]:
    return [
        (
            _normalized_kind(item.get("document_kind")),
            _optional_str(item.get("document_subtype")),
            tuple(_as_int_list(item.get("page_numbers"))),
        )
        for item in documents
    ]


def _changed_fields(
    *,
    system_documents: Sequence[Mapping[str, Any]],
    accepted_documents: Sequence[Mapping[str, Any]],
    system_shared_pages: Sequence[int],
    accepted_shared_pages: Sequence[int],
) -> list[str]:
    fields: list[str] = []
    if len(system_documents) != len(accepted_documents):
        fields.append("logical_document_count")
    if [
        (_normalized_kind(item.get("document_kind")), _optional_str(item.get("document_subtype")))
        for item in system_documents
    ] != [
        (_normalized_kind(item.get("document_kind")), _optional_str(item.get("document_subtype")))
        for item in accepted_documents
    ]:
        fields.append("document_kind")
    if [
        tuple(_as_int_list(item.get("page_numbers"))) for item in system_documents
    ] != [
        tuple(_as_int_list(item.get("page_numbers"))) for item in accepted_documents
    ]:
        fields.append("page_membership")
    if list(system_shared_pages) != list(accepted_shared_pages):
        fields.append("shared_page_numbers")
    return fields or ["packet_split_metadata"]


def _shared_page_numbers(documents: Sequence[Mapping[str, Any]]) -> list[int]:
    counts: Counter[int] = Counter()
    explicit: set[int] = set()
    for item in documents:
        for page_number in _as_int_list(item.get("page_numbers")):
            counts[page_number] += 1
        explicit.update(_as_int_list(item.get("shared_page_numbers")))
    return sorted({page_number for page_number, count in counts.items() if count > 1} | explicit)


def _document_page_numbers(item: Mapping[str, Any], *, provenance: Mapping[str, Any]) -> list[int]:
    page_numbers = _as_int_list(item.get("page_numbers"))
    if page_numbers:
        return page_numbers
    memberships = _mapping_sequence(item.get("page_memberships"))
    page_numbers = _as_int_list([membership.get("page_number") for membership in memberships])
    if page_numbers:
        return page_numbers
    page_numbers = _as_int_list(provenance.get("source_page_numbers"))
    if page_numbers:
        return page_numbers
    page_start = _optional_int(item.get("page_start"))
    page_end = _optional_int(item.get("page_end"))
    if page_start is not None and page_end is not None and page_end >= page_start:
        return list(range(page_start, page_end + 1))
    return []


def _document_page_ids(item: Mapping[str, Any], *, provenance: Mapping[str, Any]) -> list[int]:
    page_ids = _as_int_list(item.get("page_ids"))
    if page_ids:
        return page_ids
    memberships = _mapping_sequence(item.get("page_memberships"))
    page_ids = _as_int_list([membership.get("page_id") for membership in memberships])
    if page_ids:
        return page_ids
    return _as_int_list(provenance.get("source_page_ids"))


def _replay_page(page: DocumentIngestionPage) -> dict[str, object]:
    raw_text = page.raw_text or ""
    return {
        "page_id": page.page_id,
        "page_number": page.page_number,
        "classification_status": page.classification_status,
        "extraction_status": page.extraction_status,
        "document_kind": page.document_kind,
        "document_subtype": page.document_subtype,
        "classification_confidence": page.classification_confidence,
        "classification_payload": dict(page.classification_payload or {}),
        "header_fields": list(page.header_fields or []),
        "table_blocks": list(page.table_blocks or []),
        "raw_text": raw_text,
        "raw_text_sha256": hashlib.sha256(raw_text.encode("utf-8")).hexdigest() if raw_text else None,
        "processing_warnings": list(page.processing_warnings or []),
        "processing_errors": list(page.processing_errors or []),
        "review_status": page.review_status,
    }


def _load_packet_split_correction_events(
    db: Session,
    *,
    limit: int,
    document_ids: Sequence[str] | None,
) -> list[Event]:
    filters = [
        Event.aggregate_type == "document",
        Event.event_type == PACKET_SPLIT_CORRECTION_EVENT_TYPE,
    ]
    normalized_document_ids = [str(document_id) for document_id in document_ids or [] if str(document_id).strip()]
    if normalized_document_ids:
        filters.append(Event.aggregate_id.in_(normalized_document_ids))
    return list(
        db.execute(
            select(Event)
            .where(*filters)
            .order_by(Event.occurred_at.asc(), Event.recorded_at.asc(), Event.event_id.asc())
            .limit(limit)
        )
        .scalars()
        .all()
    )


def _load_documents_by_id(
    db: Session,
    document_ids: Sequence[str],
) -> dict[str, DocumentIngestion]:
    normalized_ids = sorted({str(document_id) for document_id in document_ids if str(document_id).strip()})
    if not normalized_ids:
        return {}
    rows = (
        db.execute(select(DocumentIngestion).where(DocumentIngestion.document_id.in_(normalized_ids)))
        .scalars()
        .all()
    )
    return {row.document_id: row for row in rows}


def _load_pages_by_document_id(
    db: Session,
    document_ids: Sequence[str],
) -> dict[str, list[DocumentIngestionPage]]:
    normalized_ids = sorted({str(document_id) for document_id in document_ids if str(document_id).strip()})
    if not normalized_ids:
        return {}
    rows = (
        db.execute(
            select(DocumentIngestionPage)
            .where(DocumentIngestionPage.document_id.in_(normalized_ids))
            .order_by(DocumentIngestionPage.document_id, DocumentIngestionPage.page_number)
        )
        .scalars()
        .all()
    )
    pages_by_document_id: dict[str, list[DocumentIngestionPage]] = {}
    for row in rows:
        pages_by_document_id.setdefault(row.document_id, []).append(row)
    return pages_by_document_id


def _skipped_event(event: Event, *, reason: str) -> dict[str, object]:
    return {
        "event_id": event.event_id,
        "source_file_id": event.aggregate_id,
        "occurred_at": _isoformat(event.occurred_at),
        "reason": reason,
    }


def _pages_from_replay_case(case: Mapping[str, Any]) -> list[DocumentIngestionPage]:
    document_id = _case_source_file_id(case)
    now = datetime(1970, 1, 1, tzinfo=timezone.utc)
    pages: list[DocumentIngestionPage] = []
    for item in _mapping_sequence(case.get("pages")):
        page_id = _optional_int(item.get("page_id"))
        page = DocumentIngestionPage(
            document_id=document_id,
            page_number=_optional_int(item.get("page_number")) or len(pages) + 1,
            classification_status=_optional_str(item.get("classification_status")) or "ANALYZED",
            extraction_status=_optional_str(item.get("extraction_status")) or "ANALYZED",
            document_kind=_normalized_kind(item.get("document_kind")),
            document_subtype=_optional_str(item.get("document_subtype")),
            classification_confidence=_optional_float(item.get("classification_confidence")),
            classification_payload=_mapping(item.get("classification_payload")),
            header_fields=_mapping_list(item.get("header_fields")),
            table_blocks=_mapping_list(item.get("table_blocks")),
            raw_text=_optional_str(item.get("raw_text")),
            processing_warnings=[str(value) for value in item.get("processing_warnings", [])]
            if isinstance(item.get("processing_warnings"), Sequence)
            and not isinstance(item.get("processing_warnings"), (str, bytes))
            else [],
            processing_errors=[str(value) for value in item.get("processing_errors", [])]
            if isinstance(item.get("processing_errors"), Sequence)
            and not isinstance(item.get("processing_errors"), (str, bytes))
            else [],
            review_status=_optional_str(item.get("review_status")) or "UNREVIEWED",
            review_notes=None,
            reviewed_at=None,
            reviewed_by=None,
            processed_at=now,
            created_at=now,
            updated_at=now,
        )
        if page_id is not None:
            page.page_id = page_id
        pages.append(page)
    return sorted(pages, key=lambda page: page.page_number)


def _packet_split_replay_issues(
    actual_documents: Sequence[Mapping[str, Any]],
    expected_documents: Sequence[Mapping[str, Any]],
) -> list[str]:
    issues: list[str] = []
    if len(actual_documents) != len(expected_documents):
        issues.append(
            f"logical document count expected {len(expected_documents)} got {len(actual_documents)}"
        )
    for index in range(max(len(actual_documents), len(expected_documents))):
        expected = expected_documents[index] if index < len(expected_documents) else None
        actual = actual_documents[index] if index < len(actual_documents) else None
        display_index = index + 1
        if expected is None:
            issues.append(f"unexpected logical document {display_index}")
            continue
        if actual is None:
            issues.append(f"missing logical document {display_index}")
            continue
        expected_kind = (_normalized_kind(expected.get("document_kind")), _optional_str(expected.get("document_subtype")))
        actual_kind = (_normalized_kind(actual.get("document_kind")), _optional_str(actual.get("document_subtype")))
        if actual_kind != expected_kind:
            issues.append(f"document {display_index} kind expected {expected_kind[0]} got {actual_kind[0]}")
        expected_pages = _as_int_list(expected.get("page_numbers"))
        actual_pages = _as_int_list(actual.get("page_numbers"))
        if actual_pages != expected_pages:
            issues.append(f"document {display_index} pages expected {expected_pages} got {actual_pages}")
        expected_shared_pages = _as_int_list(expected.get("shared_page_numbers"))
        actual_shared_pages = _as_int_list(actual.get("shared_page_numbers"))
        if actual_shared_pages != expected_shared_pages:
            issues.append(
                f"document {display_index} shared pages expected {expected_shared_pages} got {actual_shared_pages}"
            )
    return issues


def _packet_split_issue_categories(issues: Sequence[str]) -> list[str]:
    categories: set[str] = set()
    for issue in issues:
        normalized = issue.lower()
        if "logical document count" in normalized or "missing logical document" in normalized or "unexpected logical document" in normalized:
            categories.add("logical_document_count")
        if "kind expected" in normalized:
            categories.add("document_kind")
        if "shared pages expected" in normalized:
            categories.add("shared_page")
        elif "pages expected" in normalized:
            categories.add("page_membership")
    return sorted(categories)


def _changed_field_counts(results: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for result in results:
        for field in result.get("changed_fields", []):
            counts[str(field)] += 1
    return dict(sorted(counts.items()))


def _issue_category_counts(results: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for result in results:
        for category in result.get("issue_categories", []):
            counts[str(category)] += 1
    return dict(sorted(counts.items()))


def _case_source_file_id(case: Mapping[str, Any]) -> str:
    return _optional_str(case.get("source_file_id")) or _optional_str(case.get("case_id")) or "packet-split-replay"


def _isoformat(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _mapping_sequence(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [dict(item) for item in value if isinstance(item, Mapping)]


def _mapping_list(value: object) -> list[dict[str, object]]:
    return [dict(item) for item in _mapping_sequence(value)]


def _as_int_list(value: object) -> list[int]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    numbers: list[int] = []
    for item in value:
        candidate = _optional_int(item)
        if candidate is not None:
            numbers.append(candidate)
    return numbers


def _optional_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def _optional_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _normalized_kind(value: object) -> str:
    return (_optional_str(value) or "UNKNOWN").upper()
