from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_logical_document import DocumentLogicalDocument
from apps.api.app.models.document_logical_document_page import DocumentLogicalDocumentPage

from .document_activity import append_document_activity_event
from .document_ingestion_review import build_logical_document_estimates
from .document_ingestion_review import validate_document_review_status_transition
from .document_packet_split_corrections import PACKET_SPLIT_CORRECTION_EVENT_TYPE
from .document_packet_split_corrections import build_packet_split_correction_payload
from .schema_registry import list_supported_document_kinds


MANUAL_SPLIT_SOURCE = "human_packet_split"


def load_document_logical_documents_by_document_id(
    db: Session,
    *,
    document_ids: list[str],
) -> dict[str, list[DocumentLogicalDocument]]:
    if not document_ids:
        return {}
    rows = (
        db.execute(
            select(DocumentLogicalDocument)
            .where(DocumentLogicalDocument.document_id.in_(document_ids))
            .order_by(DocumentLogicalDocument.document_id, DocumentLogicalDocument.sequence_number)
        )
        .scalars()
        .all()
    )
    by_document_id: dict[str, list[DocumentLogicalDocument]] = {}
    for row in rows:
        by_document_id.setdefault(row.document_id, []).append(row)
    return by_document_id


def load_document_logical_document_memberships_by_document_id(
    db: Session,
    *,
    document_ids: list[str],
) -> dict[str, list[DocumentLogicalDocumentPage]]:
    if not document_ids:
        return {}
    rows = (
        db.execute(
            select(DocumentLogicalDocumentPage)
            .where(DocumentLogicalDocumentPage.document_id.in_(document_ids))
            .order_by(
                DocumentLogicalDocumentPage.document_id,
                DocumentLogicalDocumentPage.logical_document_id,
                DocumentLogicalDocumentPage.sequence_number,
                DocumentLogicalDocumentPage.page_number,
            )
        )
        .scalars()
        .all()
    )
    by_document_id: dict[str, list[DocumentLogicalDocumentPage]] = {}
    for row in rows:
        by_document_id.setdefault(row.document_id, []).append(row)
    return by_document_id


def sync_document_logical_documents(
    db: Session,
    *,
    document: DocumentIngestion,
    pages: list[DocumentIngestionPage],
    actor_id: str,
    occurred_at: datetime | None = None,
    emit_activity: bool = True,
) -> list[DocumentLogicalDocument]:
    synced_at = occurred_at or datetime.now(timezone.utc)
    existing_rows = (
        db.execute(
            select(DocumentLogicalDocument)
            .where(DocumentLogicalDocument.document_id == document.document_id)
            .order_by(DocumentLogicalDocument.sequence_number)
        )
        .scalars()
        .all()
    )
    existing_memberships = load_document_logical_document_memberships_by_document_id(
        db,
        document_ids=[document.document_id],
    ).get(document.document_id, [])
    memberships_by_logical_document = _memberships_by_logical_document(existing_memberships)
    previous_snapshot = [
        _audit_snapshot(row, memberships=memberships_by_logical_document.get(row.logical_document_id, []))
        for row in existing_rows
    ]

    if _has_manual_split(existing_rows):
        synced_rows = _refresh_manual_logical_documents(
            rows=existing_rows,
            memberships_by_logical_document=memberships_by_logical_document,
            pages=pages,
            synced_at=synced_at,
            actor_id=actor_id,
        )
        db.flush()
        next_snapshot = [
            _audit_snapshot(row, memberships=memberships_by_logical_document.get(row.logical_document_id, []))
            for row in synced_rows
        ]
        if emit_activity and previous_snapshot != next_snapshot:
            _append_packet_split_event(
                db,
                document_id=document.document_id,
                actor_id=actor_id,
                occurred_at=synced_at,
                previous_snapshot=previous_snapshot,
                next_snapshot=next_snapshot,
            )
        return synced_rows

    desired_segments = build_logical_document_estimates(pages, document_id=document.document_id)
    existing_by_key = {row.logical_document_key: row for row in existing_rows}

    synced_rows: list[DocumentLogicalDocument] = []
    desired_keys: set[str] = set()
    for segment in desired_segments:
        logical_document_key = str(segment["logical_document_key"])
        desired_keys.add(logical_document_key)
        row = existing_by_key.get(logical_document_key)
        if row is None:
            row = DocumentLogicalDocument(
                logical_document_id=str(segment["logical_document_id"]),
                document_id=document.document_id,
                logical_document_key=logical_document_key,
                sequence_number=int(segment["sequence_number"]),
                page_start=int(segment["page_start"]),
                page_end=int(segment["page_end"]),
                page_count=int(segment["page_count"]),
                document_kind=str(segment["document_kind"]),
                document_subtype=_optional_str(segment.get("document_subtype")),
                classification_status=str(segment["classification_status"]),
                classification_confidence=_optional_float(segment.get("classification_confidence")),
                review_status=str(segment["review_status"]),
                review_notes=None,
                reviewed_at=segment.get("reviewed_at") if isinstance(segment.get("reviewed_at"), datetime) else None,
                reviewed_by=_optional_str(segment.get("reviewed_by")),
                provenance=dict(segment.get("provenance") or {}),
                created_at=synced_at,
                created_by=actor_id,
                updated_at=synced_at,
                updated_by=actor_id,
                version=1,
            )
            db.add(row)
        else:
            row.sequence_number = int(segment["sequence_number"])
            row.page_start = int(segment["page_start"])
            row.page_end = int(segment["page_end"])
            row.page_count = int(segment["page_count"])
            row.document_kind = str(segment["document_kind"])
            row.document_subtype = _optional_str(segment.get("document_subtype"))
            row.classification_status = str(segment["classification_status"])
            row.classification_confidence = _optional_float(segment.get("classification_confidence"))
            row.review_status = str(segment["review_status"])
            row.reviewed_at = segment.get("reviewed_at") if isinstance(segment.get("reviewed_at"), datetime) else None
            row.reviewed_by = _optional_str(segment.get("reviewed_by"))
            row.provenance = dict(segment.get("provenance") or {})
            row.updated_at = synced_at
            row.updated_by = actor_id
            row.version += 1
        synced_rows.append(row)

    for row in existing_rows:
        if row.logical_document_key not in desired_keys:
            db.delete(row)

    db.flush()
    _replace_system_memberships(
        db,
        document_id=document.document_id,
        segments=desired_segments,
        pages=pages,
        actor_id=actor_id,
        occurred_at=synced_at,
    )
    db.flush()
    synced_memberships = load_document_logical_document_memberships_by_document_id(
        db,
        document_ids=[document.document_id],
    ).get(document.document_id, [])
    synced_memberships_by_logical_document = _memberships_by_logical_document(synced_memberships)
    next_snapshot = [
        _audit_snapshot(row, memberships=synced_memberships_by_logical_document.get(row.logical_document_id, []))
        for row in synced_rows
    ]
    if emit_activity and previous_snapshot != next_snapshot:
        _append_packet_split_event(
            db,
            document_id=document.document_id,
            actor_id=actor_id,
            occurred_at=synced_at,
            previous_snapshot=previous_snapshot,
            next_snapshot=next_snapshot,
        )

    return synced_rows


def update_document_logical_document_splits(
    db: Session,
    *,
    document: DocumentIngestion,
    pages: list[DocumentIngestionPage],
    actor_id: str,
    logical_documents: list[dict[str, Any]],
    expected_document_version: int | None = None,
    occurred_at: datetime | None = None,
) -> list[DocumentLogicalDocument]:
    if expected_document_version is not None and document.version != expected_document_version:
        raise ValueError(
            f"Document '{document.document_id}' changed from version {expected_document_version} to {document.version}"
        )
    if not logical_documents:
        raise ValueError("At least one logical document is required")

    now = occurred_at or datetime.now(timezone.utc)
    supported_kinds = set(list_supported_document_kinds())
    page_by_id = {page.page_id: page for page in pages if page.page_id is not None}
    expected_page_ids = set(page_by_id)
    if not expected_page_ids:
        raise ValueError("No analyzed pages are available for split review")

    normalized_items: list[dict[str, Any]] = []
    assigned_page_ids: set[int] = set()
    for index, item in enumerate(logical_documents, start=1):
        document_kind = str(item.get("document_kind") or "").strip().upper()
        if document_kind not in supported_kinds:
            raise ValueError(f"Document kind '{document_kind}' is not supported")
        raw_page_ids = item.get("page_ids") or []
        if not isinstance(raw_page_ids, list) or not raw_page_ids:
            raise ValueError(f"Logical document {index} must include at least one page")
        page_ids: list[int] = []
        for raw_page_id in raw_page_ids:
            try:
                page_id = int(raw_page_id)
            except (TypeError, ValueError):
                raise ValueError(f"Logical document {index} includes an invalid page id") from None
            if page_id not in page_by_id:
                raise ValueError(f"Page id '{page_id}' does not belong to document '{document.document_id}'")
            if page_id not in page_ids:
                page_ids.append(page_id)
        page_ids.sort(key=lambda candidate: page_by_id[candidate].page_number)
        assigned_page_ids.update(page_ids)
        review_status = str(item.get("review_status") or "UNREVIEWED").strip().upper()
        validate_document_review_status_transition(review_status, [page_by_id[page_id] for page_id in page_ids])
        normalized_items.append(
            {
                "sequence_number": index,
                "logical_document_key": f"LD-{index:03d}",
                "logical_document_id": f"{document.document_id}:LD-{index:03d}",
                "document_kind": document_kind,
                "document_subtype": _optional_str(item.get("document_subtype")),
                "page_ids": page_ids,
                "review_status": review_status,
                "review_notes": _optional_str(item.get("review_notes")),
            }
        )

    missing_page_numbers = [
        page_by_id[page_id].page_number
        for page_id in sorted(expected_page_ids - assigned_page_ids, key=lambda candidate: page_by_id[candidate].page_number)
    ]
    if missing_page_numbers:
        missing = ", ".join(str(page_number) for page_number in missing_page_numbers)
        raise ValueError(f"Every source page must belong to at least one logical document. Missing pages: {missing}")

    existing_rows = (
        db.execute(
            select(DocumentLogicalDocument)
            .where(DocumentLogicalDocument.document_id == document.document_id)
            .order_by(DocumentLogicalDocument.sequence_number)
        )
        .scalars()
        .all()
    )
    existing_memberships = load_document_logical_document_memberships_by_document_id(
        db,
        document_ids=[document.document_id],
    ).get(document.document_id, [])
    existing_memberships_by_logical_document = _memberships_by_logical_document(existing_memberships)
    previous_snapshot = [
        _audit_snapshot(row, memberships=existing_memberships_by_logical_document.get(row.logical_document_id, []))
        for row in existing_rows
    ]

    db.execute(
        delete(DocumentLogicalDocumentPage).where(DocumentLogicalDocumentPage.document_id == document.document_id)
    )
    for row in existing_rows:
        db.delete(row)
    db.flush()

    next_rows: list[DocumentLogicalDocument] = []
    for item in normalized_items:
        member_pages = [page_by_id[page_id] for page_id in item["page_ids"]]
        source_page_numbers = [page.page_number for page in member_pages]
        source_page_ids = [page.page_id for page in member_pages if page.page_id is not None]
        page_start = min(source_page_numbers)
        page_end = max(source_page_numbers)
        row = DocumentLogicalDocument(
            logical_document_id=str(item["logical_document_id"]),
            document_id=document.document_id,
            logical_document_key=str(item["logical_document_key"]),
            sequence_number=int(item["sequence_number"]),
            page_start=page_start,
            page_end=page_end,
            page_count=len(member_pages),
            document_kind=str(item["document_kind"]),
            document_subtype=_optional_str(item.get("document_subtype")),
            classification_status=_merged_analysis_status(page.classification_status for page in member_pages),
            classification_confidence=_average_confidence(member_pages),
            review_status=str(item["review_status"]),
            review_notes=_optional_str(item.get("review_notes")),
            reviewed_at=now if item["review_status"] == "VERIFIED" else None,
            reviewed_by=actor_id if item["review_status"] == "VERIFIED" else None,
            provenance={
                "source": MANUAL_SPLIT_SOURCE,
                "split_strategy": "operator_reviewed_membership",
                "split_reason": "Operator reviewed logical-document membership for the source packet.",
                "split_confidence": 1.0,
                "split_evidence": [
                    {
                        "type": "operator_reviewed_membership",
                        "confidence": 1.0,
                        "summary": "Operator reviewed and saved this logical-document membership.",
                        "page_numbers": source_page_numbers,
                        "document_kind": str(item["document_kind"]),
                    }
                ],
                "source_file_id": document.document_id,
                "source_page_numbers": source_page_numbers,
                "source_page_ids": source_page_ids,
                "page_range": {"start": page_start, "end": page_end},
                "shared_page_numbers": _shared_page_numbers(normalized_items, page_by_id),
            },
            created_at=now,
            created_by=actor_id,
            updated_at=now,
            updated_by=actor_id,
            version=1,
        )
        db.add(row)
        next_rows.append(row)

    db.flush()
    for item in normalized_items:
        row = next(row for row in next_rows if row.logical_document_id == item["logical_document_id"])
        for sequence_number, page_id in enumerate(item["page_ids"], start=1):
            page = page_by_id[page_id]
            db.add(
                DocumentLogicalDocumentPage(
                    logical_document_id=row.logical_document_id,
                    document_id=document.document_id,
                    page_id=page_id,
                    page_number=page.page_number,
                    sequence_number=sequence_number,
                    span_type="FULL_PAGE",
                    region_payload={},
                    provenance={
                        "source": MANUAL_SPLIT_SOURCE,
                        "split_strategy": "operator_reviewed_membership",
                        "split_confidence": 1.0,
                        "source_file_id": document.document_id,
                        "source_page_number": page.page_number,
                        "source_page_id": page_id,
                    },
                    created_at=now,
                    created_by=actor_id,
                    updated_at=now,
                    updated_by=actor_id,
                    version=1,
                )
            )

    db.flush()
    memberships = load_document_logical_document_memberships_by_document_id(
        db,
        document_ids=[document.document_id],
    ).get(document.document_id, [])
    memberships_by_logical_document = _memberships_by_logical_document(memberships)
    next_snapshot = [
        _audit_snapshot(row, memberships=memberships_by_logical_document.get(row.logical_document_id, []))
        for row in next_rows
    ]
    _append_packet_split_event(
        db,
        document_id=document.document_id,
        actor_id=actor_id,
        occurred_at=now,
        previous_snapshot=previous_snapshot,
        next_snapshot=next_snapshot,
    )
    correction_payload = build_packet_split_correction_payload(
        document=document,
        pages=pages,
        system_snapshot=previous_snapshot,
        accepted_snapshot=next_snapshot,
    )
    if correction_payload is not None:
        append_document_activity_event(
            db,
            document_id=document.document_id,
            actor_id=actor_id,
            event_type=PACKET_SPLIT_CORRECTION_EVENT_TYPE,
            occurred_at=now,
            payload=correction_payload,
        )
    return next_rows


def _audit_snapshot(
    row: DocumentLogicalDocument,
    *,
    memberships: list[DocumentLogicalDocumentPage] | None = None,
) -> dict[str, object]:
    provenance = dict(row.provenance or {})
    ordered_memberships = sorted(memberships or [], key=lambda item: (item.sequence_number, item.page_number))
    membership_page_numbers = [membership.page_number for membership in ordered_memberships]
    membership_page_ids = [membership.page_id for membership in ordered_memberships]
    source_page_numbers = membership_page_numbers or provenance.get("source_page_numbers")
    source_page_ids = membership_page_ids or provenance.get("source_page_ids")
    return {
        "logical_document_id": row.logical_document_id,
        "logical_document_key": row.logical_document_key,
        "sequence_number": row.sequence_number,
        "document_kind": row.document_kind,
        "document_subtype": row.document_subtype,
        "page_start": row.page_start,
        "page_end": row.page_end,
        "page_count": row.page_count,
        "classification_status": row.classification_status,
        "classification_confidence": row.classification_confidence,
        "review_status": row.review_status,
        "page_memberships": [
            {
                "membership_id": membership.membership_id,
                "page_id": membership.page_id,
                "page_number": membership.page_number,
                "sequence_number": membership.sequence_number,
                "span_type": membership.span_type,
            }
            for membership in ordered_memberships
        ],
        "provenance": {
            "source": provenance.get("source"),
            "split_strategy": provenance.get("split_strategy"),
            "split_reason": provenance.get("split_reason"),
            "split_confidence": provenance.get("split_confidence"),
            "split_evidence": provenance.get("split_evidence"),
            "source_file_id": provenance.get("source_file_id"),
            "source_page_numbers": source_page_numbers,
            "source_page_ids": source_page_ids,
            "page_range": provenance.get("page_range"),
            "shared_page_numbers": provenance.get("shared_page_numbers"),
        },
    }


def _append_packet_split_event(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
    occurred_at: datetime,
    previous_snapshot: list[dict[str, object]],
    next_snapshot: list[dict[str, object]],
) -> None:
    append_document_activity_event(
        db,
        document_id=document_id,
        actor_id=actor_id,
        event_type="DocumentPacketSplitUpdated",
        occurred_at=occurred_at,
        payload={
            "source_file_id": document_id,
            "logical_document_count": len(next_snapshot),
            "previous_logical_document_count": len(previous_snapshot),
            "logical_documents": next_snapshot,
            "previous_logical_documents": previous_snapshot,
        },
    )


def _replace_system_memberships(
    db: Session,
    *,
    document_id: str,
    segments: list[dict[str, object]],
    pages: list[DocumentIngestionPage],
    actor_id: str,
    occurred_at: datetime,
) -> None:
    page_by_id = {page.page_id: page for page in pages if page.page_id is not None}
    page_by_number = {page.page_number: page for page in pages}
    db.execute(delete(DocumentLogicalDocumentPage).where(DocumentLogicalDocumentPage.document_id == document_id))
    for segment in segments:
        provenance = segment.get("provenance")
        provenance_payload = provenance if isinstance(provenance, dict) else {}
        segment_source = _optional_str(provenance_payload.get("source")) or "system_page_classification"
        split_strategy = _optional_str(provenance_payload.get("split_strategy"))
        split_confidence = _optional_float(provenance_payload.get("split_confidence"))
        source_page_ids = [
            int(page_id)
            for page_id in provenance_payload.get("source_page_ids", [])
            if isinstance(page_id, int)
        ]
        segment_pages = [page_by_id[page_id] for page_id in source_page_ids if page_id in page_by_id]
        if not segment_pages:
            source_page_numbers = segment.get("page_numbers") or []
            if isinstance(source_page_numbers, list):
                segment_pages = [
                    page_by_number[int(page_number)]
                    for page_number in source_page_numbers
                    if isinstance(page_number, int) and int(page_number) in page_by_number
                ]
        for sequence_number, page in enumerate(sorted(segment_pages, key=lambda item: item.page_number), start=1):
            if page.page_id is None:
                continue
            db.add(
                DocumentLogicalDocumentPage(
                    logical_document_id=str(segment["logical_document_id"]),
                    document_id=document_id,
                    page_id=page.page_id,
                    page_number=page.page_number,
                    sequence_number=sequence_number,
                    span_type="FULL_PAGE",
                    region_payload={},
                    provenance={
                        "source": segment_source,
                        "split_strategy": split_strategy,
                        "split_confidence": split_confidence,
                        "source_file_id": document_id,
                        "source_page_number": page.page_number,
                        "source_page_id": page.page_id,
                    },
                    created_at=occurred_at,
                    created_by=actor_id,
                    updated_at=occurred_at,
                    updated_by=actor_id,
                    version=1,
                )
            )


def _has_manual_split(rows: list[DocumentLogicalDocument]) -> bool:
    return any(dict(row.provenance or {}).get("source") == MANUAL_SPLIT_SOURCE for row in rows)


def _refresh_manual_logical_documents(
    *,
    rows: list[DocumentLogicalDocument],
    memberships_by_logical_document: dict[str, list[DocumentLogicalDocumentPage]],
    pages: list[DocumentIngestionPage],
    synced_at: datetime,
    actor_id: str,
) -> list[DocumentLogicalDocument]:
    page_by_id = {page.page_id: page for page in pages if page.page_id is not None}
    synced_rows: list[DocumentLogicalDocument] = []
    for row in rows:
        memberships = memberships_by_logical_document.get(row.logical_document_id, [])
        member_pages = [
            page_by_id[membership.page_id]
            for membership in memberships
            if membership.page_id in page_by_id
        ]
        if not member_pages:
            continue
        source_page_numbers = [page.page_number for page in sorted(member_pages, key=lambda item: item.page_number)]
        source_page_ids = [page.page_id for page in sorted(member_pages, key=lambda item: item.page_number) if page.page_id is not None]
        provenance = dict(row.provenance or {})
        provenance.update(
            {
                "source_page_numbers": source_page_numbers,
                "source_page_ids": source_page_ids,
                "page_range": {"start": min(source_page_numbers), "end": max(source_page_numbers)},
            }
        )
        row.page_start = min(source_page_numbers)
        row.page_end = max(source_page_numbers)
        row.page_count = len(member_pages)
        row.classification_status = _merged_analysis_status(page.classification_status for page in member_pages)
        row.classification_confidence = _average_confidence(member_pages)
        row.provenance = provenance
        row.updated_at = synced_at
        row.updated_by = actor_id
        row.version += 1
        synced_rows.append(row)
    return synced_rows


def _memberships_by_logical_document(
    memberships: list[DocumentLogicalDocumentPage],
) -> dict[str, list[DocumentLogicalDocumentPage]]:
    grouped: dict[str, list[DocumentLogicalDocumentPage]] = {}
    for membership in memberships:
        grouped.setdefault(membership.logical_document_id, []).append(membership)
    return grouped


def _merged_analysis_status(statuses: Any) -> str:
    normalized = [str(status or "").strip().upper() for status in statuses]
    if any(status == "FAILED" for status in normalized):
        return "FAILED"
    if normalized and all(status == "ANALYZED" for status in normalized):
        return "ANALYZED"
    return "PENDING"


def _average_confidence(pages: list[DocumentIngestionPage]) -> float | None:
    confidences = [
        page.classification_confidence
        for page in pages
        if isinstance(page.classification_confidence, (int, float))
    ]
    if not confidences:
        return None
    return round(sum(confidences) / len(confidences), 4)


def _shared_page_numbers(
    items: list[dict[str, Any]],
    page_by_id: dict[int, DocumentIngestionPage],
) -> list[int]:
    counts: dict[int, int] = {}
    for item in items:
        for page_id in item.get("page_ids", []):
            counts[page_id] = counts.get(page_id, 0) + 1
    return [
        page_by_id[page_id].page_number
        for page_id, count in sorted(counts.items(), key=lambda entry: page_by_id[entry[0]].page_number)
        if count > 1 and page_id in page_by_id
    ]


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _optional_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None
