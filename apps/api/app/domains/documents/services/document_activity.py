from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.event_writes import AppendDomainEventCommand
from apps.api.app.domains.trading.services.event_writes import append_domain_event
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event
from apps.api.app.schemas.document import DocumentActivityOut

from .document_ingestion_review import build_logical_document_estimates


DOCUMENT_ACTIVITY_AGGREGATE_TYPE = "document"

_PROCESSOR_LABELS = {
    "builtin": "Built-in Parser",
    "openai": "GPT",
    "anthropic": "Claude",
    "google": "Gemini",
    None: "Built-in Parser",
}


def append_document_activity_event(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
    event_type: str,
    payload: Mapping[str, Any] | None = None,
    occurred_at: datetime | None = None,
) -> Event:
    recorded_at = _coerce_utc(occurred_at) or datetime.now(timezone.utc)
    return append_domain_event(
        db,
        AppendDomainEventCommand(
            aggregate_type=DOCUMENT_ACTIVITY_AGGREGATE_TYPE,
            aggregate_id=document_id,
            event_type=event_type,
            occurred_at=recorded_at,
            recorded_at=recorded_at,
            actor_id=actor_id,
            schema_version=1,
            payload=dict(payload or {}),
            operation_key=f"documents.activity.{event_type}",
            source_surface="documents",
        ),
    )


def load_document_activity_events_by_document_id(
    db: Session,
    *,
    document_ids: list[str],
) -> dict[str, list[Event]]:
    if not document_ids:
        return {}
    events = (
        db.execute(
            select(Event)
            .where(
                Event.aggregate_type == DOCUMENT_ACTIVITY_AGGREGATE_TYPE,
                Event.aggregate_id.in_(document_ids),
            )
            .order_by(Event.aggregate_id, Event.occurred_at, Event.recorded_at, Event.event_id)
        )
        .scalars()
        .all()
    )
    events_by_document_id: dict[str, list[Event]] = {}
    for event in events:
        events_by_document_id.setdefault(event.aggregate_id, []).append(event)
    return events_by_document_id


def serialize_document_activity_events(events: list[Event]) -> list[DocumentActivityOut]:
    classified_count = 0
    serialized: list[DocumentActivityOut] = []
    for event in sorted(events, key=lambda item: (item.occurred_at, item.recorded_at, item.event_id)):
        if event.event_type == "DocumentClassified":
            classified_count += 1
        label, detail = _activity_label_and_detail(event, classification_sequence=classified_count)
        serialized.append(
            DocumentActivityOut(
                activity_id=event.event_id,
                event_type=event.event_type,
                label=label,
                detail=detail,
                occurred_at=event.occurred_at,
                actor_id=event.actor_id,
                payload=dict(event.payload or {}),
            )
        )
    return list(reversed(serialized))


def build_document_classification_snapshot(
    pages: list[DocumentIngestionPage],
) -> dict[str, object]:
    page_snapshots = [_page_classification_snapshot(page) for page in pages]
    logical_document_snapshots = [
        _logical_document_classification_snapshot(document)
        for document in build_logical_document_estimates(pages)
    ]
    kind_counts = Counter(str(page["document_kind"]) for page in page_snapshots)
    known_kinds = {kind for kind in kind_counts if kind not in {"", "UNKNOWN"}}
    if not page_snapshots:
        document_kind = "UNKNOWN"
    elif len(kind_counts) == 1:
        document_kind = next(iter(kind_counts))
    elif len(known_kinds) > 1:
        document_kind = "MIXED"
    else:
        document_kind = kind_counts.most_common(1)[0][0]

    confidences = [
        float(page["confidence"])
        for page in page_snapshots
        if isinstance(page.get("confidence"), (int, float))
    ]
    provider_counts = Counter(
        str(page["processor_provider"])
        for page in page_snapshots
        if page.get("processor_applied") and page.get("processor_provider")
    )
    processor_provider = provider_counts.most_common(1)[0][0] if provider_counts else None
    return {
        "document_kind": document_kind,
        "classification_scope": "LOGICAL_DOCUMENT" if len(logical_document_snapshots) > 1 else "DOCUMENT",
        "logical_document_count": len(logical_document_snapshots),
        "page_count": len(page_snapshots),
        "classified_page_count": sum(1 for page in page_snapshots if page["document_kind"] != "UNKNOWN"),
        "average_confidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
        "processor_provider": processor_provider,
        "logical_document_classifications": logical_document_snapshots,
        "page_classifications": page_snapshots,
    }


def build_document_processing_snapshot(
    document: DocumentIngestion,
    pages: list[DocumentIngestionPage],
) -> dict[str, object]:
    logical_documents = build_logical_document_estimates(pages)
    return {
        "status": document.status,
        "processor_provider": document.processor_provider,
        "processor_model": document.processor_model,
        "page_count": document.page_count,
        "logical_document_count": len(logical_documents),
        "processed_page_count": sum(1 for page in pages if page.processed_at is not None),
        "processor_applied_page_count": sum(
            1 for page in pages if bool((page.classification_payload or {}).get("processor_applied"))
        ),
        "processing_error_count": len(document.processing_errors or []),
        "page_error_count": sum(1 for page in pages if page.processing_errors),
        "page_warning_count": sum(1 for page in pages if page.processing_warnings),
    }


def _logical_document_classification_snapshot(document: dict[str, object]) -> dict[str, object]:
    return {
        "logical_document_id": document.get("logical_document_id"),
        "logical_document_key": document.get("logical_document_key"),
        "sequence_number": document.get("sequence_number"),
        "document_kind": document.get("document_kind"),
        "document_subtype": document.get("document_subtype"),
        "page_start": document.get("page_start"),
        "page_end": document.get("page_end"),
        "page_count": document.get("page_count"),
        "classification_status": document.get("classification_status"),
        "classification_confidence": document.get("classification_confidence"),
        "review_status": document.get("review_status"),
        "provenance": {
            "source": dict(document.get("provenance") or {}).get("source"),
            "split_strategy": dict(document.get("provenance") or {}).get("split_strategy"),
            "source_page_numbers": dict(document.get("provenance") or {}).get("source_page_numbers"),
        },
    }


def _page_classification_snapshot(page: DocumentIngestionPage) -> dict[str, object]:
    classification_payload = dict(page.classification_payload or {})
    return {
        "page_number": page.page_number,
        "document_kind": page.document_kind,
        "document_subtype": page.document_subtype,
        "confidence": page.classification_confidence,
        "classification_status": page.classification_status,
        "source": classification_payload.get("system_classification_source")
        or classification_payload.get("classification_source")
        or ("processor" if classification_payload.get("processor_applied") else "deterministic"),
        "matched_by": classification_payload.get("matched_by"),
        "processor_applied": bool(classification_payload.get("processor_applied")),
        "processor_provider": classification_payload.get("processor_provider"),
        "processor_model": classification_payload.get("processor_model"),
        "heuristic_document_kind": classification_payload.get("heuristic_document_kind"),
        "heuristic_document_subtype": classification_payload.get("heuristic_document_subtype"),
    }


def _activity_label_and_detail(
    event: Event,
    *,
    classification_sequence: int,
) -> tuple[str, str]:
    payload = dict(event.payload or {})
    actor = event.actor_id or "system"
    if event.event_type == "DocumentUploaded":
        filename = payload.get("filename") or "the source file"
        return "Uploaded", f"{actor} added {filename}."
    if event.event_type == "DocumentProcessingStarted":
        processor = _processor_detail(payload)
        page_count = _coerce_int(payload.get("page_count"))
        page_text = f" across {page_count} pages" if page_count else ""
        return "Processing Started", f"{processor} started analyzing the file{page_text}."
    if event.event_type == "DocumentAnalyzed":
        processor = _processor_detail(payload)
        processed = _coerce_int(payload.get("processed_page_count"))
        total = _coerce_int(payload.get("page_count"))
        if processed is not None and total is not None:
            return "Analyzed", f"{processor} processed {processed}/{total} pages."
        return "Analyzed", f"{processor} completed document analysis."
    if event.event_type == "DocumentClassified":
        classification = _dict_payload(payload.get("classification"))
        label = "Original Classification" if classification_sequence == 1 else "Reclassified"
        prefix = "Originally classified" if classification_sequence == 1 else "Reclassified"
        return label, _classification_detail(prefix, classification)
    if event.event_type == "DocumentPacketSplitUpdated":
        logical_document_count = _coerce_int(payload.get("logical_document_count"))
        count_text = (
            f"{logical_document_count} logical document{'' if logical_document_count == 1 else 's'}"
            if logical_document_count is not None
            else "logical document page ranges"
        )
        return "Packet Split Updated", f"{actor} updated packet metadata for {count_text}."
    if event.event_type == "DocumentPacketSplitCorrectionCaptured":
        accepted_count = _coerce_int(payload.get("accepted_logical_document_count"))
        count_text = (
            f"{accepted_count} logical document{'' if accepted_count == 1 else 's'}"
            if accepted_count is not None
            else "the accepted logical document layout"
        )
        return "Packet Split Correction", f"{actor} corrected the packet split for {count_text}."
    if event.event_type == "DocumentReprocessRequested":
        previous = _dict_payload(payload.get("previous_classification"))
        processor = _processor_detail(payload, provider_key="processor_provider", model_key="processor_model")
        previous_kind = _format_snapshot_kind(previous)
        return "Reprocessed", f"{actor} queued reprocessing with {processor}. Prior classification: {previous_kind}."
    if event.event_type == "DocumentProcessingFailed":
        message = payload.get("error_message") or "Document processing failed."
        return "Processing Failed", str(message)
    if event.event_type == "DocumentClassificationCorrected":
        previous = _format_snapshot_kind(_dict_payload(payload.get("previous_classification")))
        current = _format_snapshot_kind(_dict_payload(payload.get("classification")))
        return "Classification Updated", f"{actor} changed the document classification from {previous} to {current}."
    if event.event_type == "DocumentPageClassificationUpdated":
        page_number = payload.get("page_number")
        previous_kind = _format_kind(payload.get("previous_document_kind"), payload.get("previous_document_subtype"))
        current_kind = _format_kind(payload.get("document_kind"), payload.get("document_subtype"))
        return "Page Reclassified", f"{actor} changed page {page_number} from {previous_kind} to {current_kind}."
    if event.event_type == "DocumentReviewUpdated":
        previous = payload.get("previous_review_status") or "UNKNOWN"
        current = payload.get("review_status") or "UNKNOWN"
        return "Review Updated", f"{actor} changed review status from {previous} to {current}."
    if event.event_type == "DocumentWorkflowExecuted":
        workflow_label = str(payload.get("label") or payload.get("workflow_id") or "document workflow")
        observation_count = _coerce_int(payload.get("observation_count"))
        count_text = (
            f" {observation_count} observation{'' if observation_count == 1 else 's'} processed."
            if observation_count is not None
            else ""
        )
        return "Workflow Executed", f"{actor} executed {workflow_label}.{count_text}"
    if event.event_type == "DocumentRecordCreationRequested":
        target_label = payload.get("target_record_label") or payload.get("target_record_type") or "record"
        return "Record Needed", f"{actor} requested creation intake for {target_label}."
    if event.event_type == "DocumentRecordCreationResolved":
        request = _dict_payload(payload.get("request"))
        link = _dict_payload(payload.get("record_link"))
        target_label = link.get("record_label") or request.get("target_record_label") or "the resolved record"
        return "Record Request Resolved", f"{actor} resolved missing-record intake with {target_label}."
    if event.event_type == "DocumentRecordCreationCancelled":
        request = _dict_payload(payload.get("request"))
        target_label = request.get("target_record_label") or request.get("target_record_type") or "record"
        return "Record Request Cancelled", f"{actor} cancelled creation intake for {target_label}."
    if event.event_type.startswith("DocumentActionApproval"):
        request = _dict_payload(payload.get("request"))
        title = request.get("title") or request.get("action_type") or "document action"
        return "Action Request", f"{actor} updated action request: {title}."
    return "Updated", f"{actor} updated the file record."


def _classification_detail(prefix: str, classification: Mapping[str, object]) -> str:
    kind = _format_snapshot_kind(classification)
    page_count = _coerce_int(classification.get("page_count"))
    classified_page_count = _coerce_int(classification.get("classified_page_count"))
    confidence = classification.get("average_confidence")
    provider = classification.get("processor_provider")
    source = _PROCESSOR_LABELS.get(provider, "document processor") if provider else "deterministic scoring"
    page_text = ""
    if page_count is not None and classified_page_count is not None:
        page_text = f" across {classified_page_count}/{page_count} pages"
    confidence_text = ""
    if isinstance(confidence, (int, float)):
        confidence_text = f" with {round(float(confidence) * 100)}% average confidence"
    return f"{prefix} as {kind}{page_text} by {source}{confidence_text}."


def _processor_detail(
    payload: Mapping[str, object],
    *,
    provider_key: str = "processor_provider",
    model_key: str = "processor_model",
) -> str:
    provider = payload.get(provider_key)
    model = payload.get(model_key)
    label = _PROCESSOR_LABELS.get(provider, "Built-in Parser")
    return f"{label} / {model}" if model else label


def _format_snapshot_kind(snapshot: Mapping[str, object]) -> str:
    page_classifications = snapshot.get("page_classifications")
    kind = _format_kind(snapshot.get("document_kind"), snapshot.get("document_subtype"))
    if kind == "MIXED" and isinstance(page_classifications, list):
        page_parts = []
        for page in page_classifications[:4]:
            if isinstance(page, dict):
                page_parts.append(
                    f"page {page.get('page_number')}: "
                    f"{_format_kind(page.get('document_kind'), page.get('document_subtype'))}"
                )
        if page_parts:
            return f"MIXED ({'; '.join(page_parts)})"
    return kind


def _format_kind(kind: object, subtype: object = None) -> str:
    formatted_kind = str(kind or "UNKNOWN").strip().upper().replace("_", " ") or "UNKNOWN"
    formatted_subtype = str(subtype or "").strip().upper().replace("_", " ")
    return f"{formatted_kind} / {formatted_subtype}" if formatted_subtype else formatted_kind


def _dict_payload(value: object) -> dict[str, object]:
    return dict(value) if isinstance(value, dict) else {}


def _coerce_int(value: object) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
