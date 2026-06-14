from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceDescriptor,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceEmptyState,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceListRequest,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourcePrimaryAction,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceSummaryStat,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceSurface,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceSurfaceAction,
)
from apps.api.app.domains.operations.services.resource_views import (
    paginate_operational_items,
)
from apps.api.app.models.document_record_creation_request import DocumentRecordCreationRequest
from apps.api.app.schemas.operations import DocumentRecordCreationWorkItemOut


@dataclass(frozen=True, slots=True)
class DocumentRecordCreationWorkItemRoute:
    queue: str
    handoff_type: str
    routing_label: str
    next_action_label: str
    priority: str


DOCUMENT_RECORD_CREATION_WORK_ITEM_ROUTES: dict[str, DocumentRecordCreationWorkItemRoute] = {
    "TRADE": DocumentRecordCreationWorkItemRoute(
        queue="operations",
        handoff_type="trade_capture",
        routing_label="Trade Capture",
        next_action_label="Create or identify the trade, then resolve the document link.",
        priority="HIGH",
    ),
    "DELIVERY": DocumentRecordCreationWorkItemRoute(
        queue="operations",
        handoff_type="delivery_creation",
        routing_label="Delivery Scheduling",
        next_action_label="Create or identify the delivery, then resolve the document link.",
        priority="HIGH",
    ),
    "TRADE_INVOICE": DocumentRecordCreationWorkItemRoute(
        queue="settlement",
        handoff_type="invoice_creation",
        routing_label="Invoice Ledger",
        next_action_label="Create or identify the invoice, then resolve the document link.",
        priority="NORMAL",
    ),
}


def document_record_creation_work_items_table_available(db: Session) -> bool:
    inspector = inspect(db.connection())
    return inspector.has_table(DocumentRecordCreationRequest.__tablename__)


def list_document_record_creation_work_items(
    db: Session,
    *,
    queue: str | None = None,
    target_record_type: str | None = None,
    include_closed: bool = False,
    limit: int = 50,
    offset: int = 0,
    now: datetime | None = None,
) -> list[DocumentRecordCreationWorkItemOut]:
    if not document_record_creation_work_items_table_available(db):
        return []

    normalized_queue = _normalized_optional_queue(queue)
    normalized_target_record_type = _normalized_optional_token(target_record_type)
    if normalized_queue and normalized_queue not in {"operations", "settlement"}:
        raise ValueError("Document record creation work item queue must be operations or settlement.")
    if normalized_target_record_type and normalized_target_record_type not in DOCUMENT_RECORD_CREATION_WORK_ITEM_ROUTES:
        raise ValueError(
            "Document record creation work item target_record_type must be one of: "
            + ", ".join(sorted(DOCUMENT_RECORD_CREATION_WORK_ITEM_ROUTES))
            + "."
        )
    if (
        normalized_queue
        and normalized_target_record_type
        and DOCUMENT_RECORD_CREATION_WORK_ITEM_ROUTES[normalized_target_record_type].queue != normalized_queue
    ):
        return []

    rows = _load_document_record_creation_request_rows(
        db,
        queue=normalized_queue,
        target_record_type=normalized_target_record_type,
        include_closed=include_closed,
    )
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    items = [
        _to_document_record_creation_work_item_out(request, now=reference_time)
        for request in rows
    ]
    if offset:
        items = items[offset:]
    return items[:limit]


def _load_document_record_creation_request_rows(
    db: Session,
    *,
    queue: str | None,
    target_record_type: str | None,
    include_closed: bool,
) -> list[DocumentRecordCreationRequest]:
    route_target_types = [
        target
        for target, route in DOCUMENT_RECORD_CREATION_WORK_ITEM_ROUTES.items()
        if queue is None or route.queue == queue
    ]
    if target_record_type is not None:
        route_target_types = [target_record_type]

    statement = select(DocumentRecordCreationRequest).where(
        DocumentRecordCreationRequest.target_record_type.in_(route_target_types)
    )
    if not include_closed:
        statement = statement.where(DocumentRecordCreationRequest.status == "OPEN")

    rows = list(db.execute(statement).scalars().all())
    return sorted(rows, key=_document_record_creation_work_item_sort_key)


def _document_record_creation_work_item_sort_key(
    request: DocumentRecordCreationRequest,
) -> tuple[int, int, datetime, int]:
    route = DOCUMENT_RECORD_CREATION_WORK_ITEM_ROUTES[request.target_record_type]
    open_rank = 0 if request.status == "OPEN" else 1
    priority_rank = 0 if route.priority == "HIGH" else 1
    requested_at = _coerce_utc(request.requested_at) or datetime.min.replace(tzinfo=timezone.utc)
    return (open_rank, priority_rank, requested_at, request.request_id)


def _to_document_record_creation_work_item_out(
    request: DocumentRecordCreationRequest,
    *,
    now: datetime,
) -> DocumentRecordCreationWorkItemOut:
    route = DOCUMENT_RECORD_CREATION_WORK_ITEM_ROUTES[request.target_record_type]
    missing_owners = _missing_owner_record_types(request)
    age_days = max(0, (_coerce_utc(now) - (_coerce_utc(request.requested_at) or now)).days)
    return DocumentRecordCreationWorkItemOut(
        request_id=request.request_id,
        document_id=request.document_id,
        status=request.status,
        queue=route.queue,
        handoff_type=route.handoff_type,
        routing_label=route.routing_label,
        next_action_label=(
            "Create or identify the owning record first, then create or link the target record."
            if missing_owners
            else route.next_action_label
        ),
        priority="BLOCKED" if missing_owners else route.priority,
        document_kind=request.document_kind,
        target_record_type=request.target_record_type,
        target_record_label=request.target_record_label,
        owner_record_type=request.owner_record_type,
        owner_record_id=request.owner_record_id,
        required_owner_record_types=list(request.required_owner_record_types or []),
        matched_keys=list(request.matched_keys or []),
        missing_evidence=list(request.missing_evidence or []),
        blocking_reasons=[
            f"Missing owning {_format_token(owner_record_type)} record"
            for owner_record_type in missing_owners
        ],
        next_steps=_next_steps_for_request(request=request, route=route, missing_owners=missing_owners),
        captured_fields=dict(request.captured_fields or {}),
        title=request.title,
        description=request.description,
        request_comment=request.request_comment,
        requested_at=request.requested_at,
        requested_by=request.requested_by,
        updated_at=request.updated_at,
        updated_by=request.updated_by,
        age_days=age_days,
        is_closed=request.status != "OPEN",
        version=request.version,
    )


def _next_steps_for_request(
    *,
    request: DocumentRecordCreationRequest,
    route: DocumentRecordCreationWorkItemRoute,
    missing_owners: list[str],
) -> list[str]:
    if missing_owners:
        return [
            f"Create or identify the owning {_format_token(owner_record_type)} record."
            for owner_record_type in missing_owners
        ] + [route.next_action_label]
    return [route.next_action_label]


def _missing_owner_record_types(request: DocumentRecordCreationRequest) -> list[str]:
    missing_owner_record_types: list[str] = []
    for owner_record_type in request.required_owner_record_types or []:
        normalized_owner_record_type = _normalized_optional_token(owner_record_type)
        if not normalized_owner_record_type:
            continue
        if request.owner_record_type == normalized_owner_record_type and request.owner_record_id:
            continue
        if normalized_owner_record_type not in missing_owner_record_types:
            missing_owner_record_types.append(normalized_owner_record_type)
    return missing_owner_record_types


def _normalized_optional_token(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    return normalized.upper()


def _normalized_optional_queue(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if not normalized:
        return None
    return normalized


def _format_token(value: str) -> str:
    return value.replace("_", " ").title()


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _descriptor_load_rows(
    db: Session,
    request: OperationalResourceListRequest,
) -> list[DocumentRecordCreationRequest]:
    return _load_document_record_creation_request_rows(
        db,
        queue=None,
        target_record_type=None,
        include_closed=False,
    )


def _descriptor_load_context(
    db: Session,
    rows: list[DocumentRecordCreationRequest],
    request: OperationalResourceListRequest,
) -> datetime:
    return request.reference_time


def _descriptor_build_item(
    row: DocumentRecordCreationRequest,
    context: datetime,
    request: OperationalResourceListRequest,
) -> DocumentRecordCreationWorkItemOut:
    return _to_document_record_creation_work_item_out(row, now=context)


DOCUMENT_RECORD_CREATION_WORK_ITEM_RESOURCE_DESCRIPTOR = OperationalResourceDescriptor[
    OperationalResourceListRequest,
    DocumentRecordCreationRequest,
    datetime,
    DocumentRecordCreationWorkItemOut,
](
    resource_key="document_record_creation_requests",
    filters=("queue", "status", "target_record_type", "document_kind"),
    sort_fields=("requested_at", "target_record_type", "priority"),
    actions=("resolve_after_record_creation", "cancel_intake_request"),
    surface=OperationalResourceSurface(
        title="Document Intake Work Items",
        description=(
            "Verified Library documents that imply missing trade, delivery, or invoice records "
            "are routed to the owning queue without automatically creating business records."
        ),
        board_section="Document Intake",
        actions=(
            OperationalResourceSurfaceAction(
                key="resolve_after_record_creation",
                label="Resolve After Creation",
                detail="Link the document once the owning desk creates or identifies the target record.",
                permission_message=(
                    "Only operations, settlement, OPS_ADMIN, or ADMIN sessions can resolve document intake."
                ),
                comment_required=False,
            ),
            OperationalResourceSurfaceAction(
                key="cancel_intake_request",
                label="Cancel Intake",
                detail="Close intake with a comment when the document should not create a record.",
                permission_message=(
                    "Only operations, settlement, OPS_ADMIN, or ADMIN sessions can cancel document intake."
                ),
                comment_required=True,
                comment_hint="Explain why the missing-record intake is no longer needed.",
            ),
        ),
        primary_action=OperationalResourcePrimaryAction(
            key="create_missing_record",
            label="Create Missing Record",
            detail="Use the target desk's typed workflow, then resolve the Library intake request.",
        ),
        empty_state=OperationalResourceEmptyState(
            title="No document intake work items",
            detail="Verified documents that imply missing trade, delivery, or invoice records will appear here.",
        ),
        summary_stats=(
            OperationalResourceSummaryStat(
                key="trade_delivery_operations",
                label="Operations Intake",
                detail="Trade and delivery creation requests route to operations until resolved or cancelled.",
            ),
            OperationalResourceSummaryStat(
                key="invoice_settlement",
                label="Settlement Intake",
                detail="Invoice creation requests route to settlement so accounting can create the record explicitly.",
            ),
        ),
    ),
    load_rows=_descriptor_load_rows,
    load_context=_descriptor_load_context,
    build_item=_descriptor_build_item,
    finalize_items=paginate_operational_items,
)


__all__ = [
    "DOCUMENT_RECORD_CREATION_WORK_ITEM_RESOURCE_DESCRIPTOR",
    "DOCUMENT_RECORD_CREATION_WORK_ITEM_ROUTES",
    "document_record_creation_work_items_table_available",
    "list_document_record_creation_work_items",
]
