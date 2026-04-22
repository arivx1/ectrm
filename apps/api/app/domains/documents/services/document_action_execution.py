from __future__ import annotations

from datetime import datetime, time, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.settlement_invoices import issue_trade_invoice
from apps.api.app.domains.operations.services.settlement_payments import create_trade_payment
from apps.api.app.domains.operations.services.trade_confirmations import create_trade_confirmation
from apps.api.app.domains.operations.services.trade_confirmations import update_trade_confirmation
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.schemas.document import DocumentActionPlanOut
from apps.api.app.schemas.document import DocumentIngestionOut

from .document_action_planning import build_document_action_plan
from .document_ingestion_serialization import load_document_and_pages
from .document_ingestion_serialization import serialize_documents
from .document_linkage import build_document_linkage_assessment
from .document_record_links import create_document_record_link

SUPPORTED_DOCUMENT_ACTION_OPERATIONS: frozenset[str] = frozenset(
    {
        "link_document_to_record",
        "create_trade_confirmation",
        "issue_trade_invoice",
        "create_trade_payment",
    }
)


def execute_document_action_plan(
    db: Session,
    *,
    document_id: str,
    actor_id: str,
) -> DocumentIngestionOut:
    reference_time = datetime.now(timezone.utc)
    document, pages = load_document_and_pages(db, document_id=document_id)
    if document.review_status != "VERIFIED":
        raise ValueError("Only verified documents can execute an action plan.")

    linkage_assessment = build_document_linkage_assessment(
        db,
        pages=pages,
        review_status=document.review_status,
        document_id=document.document_id,
    )
    action_plan = build_document_action_plan(
        document_id=document.document_id,
        pages=pages,
        review_status=document.review_status,
        linkage_assessment=linkage_assessment,
    )
    if action_plan.status != "READY":
        raise ValueError("The current document action plan is not ready to execute.")
    if action_plan.operation_type not in SUPPORTED_DOCUMENT_ACTION_OPERATIONS:
        raise ValueError(
            f"Document action operation '{action_plan.operation_type}' is not supported for execution yet."
        )

    changed = _apply_document_action(
        db,
        document=document,
        actor_id=actor_id,
        action_plan=action_plan,
        now=reference_time,
    )
    if changed:
        document.updated_at = reference_time
        document.updated_by = actor_id
        document.version += 1
        db.flush()

    return serialize_documents(db, [document], preloaded_pages=pages)[0]


def _apply_document_action(
    db: Session,
    *,
    document: DocumentIngestion,
    actor_id: str,
    action_plan: DocumentActionPlanOut,
    now: datetime,
) -> bool:
    if action_plan.operation_type == "link_document_to_record":
        _attach_existing_record(
            db,
            document=document,
            actor_id=actor_id,
            action_plan=action_plan,
            now=now,
        )
        return True

    if action_plan.operation_type == "create_trade_confirmation":
        created_confirmation = create_trade_confirmation(
            db,
            trade_id=_require_payload_value(action_plan.payload, "trade_id"),
            actor_id=actor_id,
            source_document_id=document.document_id,
            confirmation_number=_optional_payload_value(action_plan.payload, "confirmation_number"),
            notes=_execution_note(document),
            sent_at=_parse_datetime_candidate(action_plan.payload.get("trade_date")),
            now=now,
        )
        create_document_record_link(
            db,
            document_id=document.document_id,
            record_type="TRADE_CONFIRMATION",
            record_id=str(created_confirmation.confirmation_id),
            actor_id=actor_id,
            role="PRIMARY",
        )
        _link_owner_record(db, document=document, actor_id=actor_id, action_plan=action_plan)
        return True

    if action_plan.operation_type == "issue_trade_invoice":
        leg_no = _resolve_leg_no_from_action_payload(
            db,
            delivery_id=_optional_payload_value(action_plan.payload, "delivery_id"),
        )
        created_invoice = issue_trade_invoice(
            db,
            trade_id=_require_payload_value(action_plan.payload, "trade_id"),
            actor_id=actor_id,
            leg_no=leg_no,
            invoice_number=_optional_payload_value(action_plan.payload, "invoice_number"),
            invoice_amount=action_plan.payload.get("invoice_amount"),
            issued_at=_parse_datetime_candidate(action_plan.payload.get("invoice_date")),
            due_at=_parse_datetime_candidate(action_plan.payload.get("due_at")),
            notes=_execution_note(document),
            now=now,
        )
        create_document_record_link(
            db,
            document_id=document.document_id,
            record_type="TRADE_INVOICE",
            record_id=str(created_invoice.invoice_id),
            actor_id=actor_id,
            role="PRIMARY",
        )
        _link_owner_record(db, document=document, actor_id=actor_id, action_plan=action_plan)
        return True

    if action_plan.operation_type == "create_trade_payment":
        invoice_id = _require_payload_value(action_plan.payload, "invoice_id")
        created_payment = create_trade_payment(
            db,
            invoice_id=int(invoice_id),
            actor_id=actor_id,
            payment_reference=_optional_payload_value(action_plan.payload, "payment_reference"),
            payment_amount=action_plan.payload.get("payment_amount"),
            due_at=_parse_datetime_candidate(action_plan.payload.get("due_at")),
            notes=_execution_note(document),
            now=now,
        )
        create_document_record_link(
            db,
            document_id=document.document_id,
            record_type="TRADE_PAYMENT",
            record_id=str(created_payment.payment_id),
            actor_id=actor_id,
            role="PRIMARY",
        )
        _link_owner_record(db, document=document, actor_id=actor_id, action_plan=action_plan)
        return True

    raise ValueError(f"Document action operation '{action_plan.operation_type}' is not supported.")


def _attach_existing_record(
    db: Session,
    *,
    document: DocumentIngestion,
    actor_id: str,
    action_plan: DocumentActionPlanOut,
    now: datetime,
) -> None:
    target = action_plan.target
    if target is None or not target.record_id:
        raise ValueError("Attach actions require a concrete target record.")

    if target.record_type == "TRADE_CONFIRMATION":
        confirmation = db.get(TradeConfirmation, int(target.record_id))
        if confirmation is None:
            raise LookupError(f"Confirmation '{target.record_id}' was not found.")
        if confirmation.source_document_id and confirmation.source_document_id != document.document_id:
            raise ValueError(
                f"Confirmation '{target.record_id}' is already linked to document '{confirmation.source_document_id}'."
            )
        if confirmation.source_document_id != document.document_id:
            update_trade_confirmation(
                db,
                confirmation_id=confirmation.id,
                actor_id=actor_id,
                changes={"source_document_id": document.document_id},
                now=now,
            )

    create_document_record_link(
        db,
        document_id=document.document_id,
        record_type=target.record_type,
        record_id=target.record_id,
        actor_id=actor_id,
        role="PRIMARY",
    )


def _link_owner_record(
    db: Session,
    *,
    document: DocumentIngestion,
    actor_id: str,
    action_plan: DocumentActionPlanOut,
) -> None:
    owner = action_plan.owner
    if owner is None or not owner.record_id:
        return
    create_document_record_link(
        db,
        document_id=document.document_id,
        record_type=owner.record_type,
        record_id=owner.record_id,
        actor_id=actor_id,
        role="SECONDARY",
    )


def _resolve_leg_no_from_action_payload(
    db: Session,
    *,
    delivery_id: str | None,
) -> int | None:
    if not delivery_id:
        return None
    delivery = db.execute(
        select(DeliveryObligation).where(DeliveryObligation.delivery_id == delivery_id)
    ).scalars().first()
    if delivery is None:
        raise LookupError(f"Delivery '{delivery_id}' was not found.")
    return delivery.leg_no


def _parse_datetime_candidate(value: object | None) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if "T" in text:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return _coerce_utc(parsed)
    parsed_date = datetime.fromisoformat(text)
    if parsed_date.tzinfo is None and parsed_date.time() == time.min:
        return parsed_date.replace(tzinfo=timezone.utc)
    return _coerce_utc(parsed_date)


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _execution_note(document: DocumentIngestion) -> str:
    return f"Created from verified document {document.display_name} ({document.document_id})."


def _require_payload_value(payload: dict[str, object], key: str) -> str:
    value = _optional_payload_value(payload, key)
    if value is None:
        raise ValueError(f"Document action payload is missing '{key}'.")
    return value


def _optional_payload_value(payload: dict[str, object], key: str) -> str | None:
    text = str(payload.get(key) or "").strip()
    return text or None
