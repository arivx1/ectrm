from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.document_logical_document import DocumentLogicalDocument

from .document_activity import append_document_activity_event
from .document_ingestion_review import build_logical_document_estimates


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
    desired_segments = build_logical_document_estimates(pages, document_id=document.document_id)
    existing_rows = (
        db.execute(
            select(DocumentLogicalDocument)
            .where(DocumentLogicalDocument.document_id == document.document_id)
            .order_by(DocumentLogicalDocument.sequence_number)
        )
        .scalars()
        .all()
    )
    previous_snapshot = [_audit_snapshot(row) for row in existing_rows]
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
    next_snapshot = [_audit_snapshot(row) for row in synced_rows]
    if emit_activity and previous_snapshot != next_snapshot:
        append_document_activity_event(
            db,
            document_id=document.document_id,
            actor_id=actor_id,
            event_type="DocumentPacketSplitUpdated",
            occurred_at=synced_at,
            payload={
                "source_file_id": document.document_id,
                "logical_document_count": len(next_snapshot),
                "previous_logical_document_count": len(previous_snapshot),
                "logical_documents": next_snapshot,
                "previous_logical_documents": previous_snapshot,
            },
        )

    return synced_rows


def _audit_snapshot(row: DocumentLogicalDocument) -> dict[str, object]:
    provenance = dict(row.provenance or {})
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
        "provenance": {
            "source": provenance.get("source"),
            "split_strategy": provenance.get("split_strategy"),
            "source_file_id": provenance.get("source_file_id"),
            "source_page_numbers": provenance.get("source_page_numbers"),
            "source_page_ids": provenance.get("source_page_ids"),
            "page_range": provenance.get("page_range"),
        },
    }


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _optional_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None
