from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.audit_events import append_trade_audit_event
from apps.api.app.domains.operations.services.trade_confirmation_comparison import (
    TradeConfirmationComparisonResult,
)
from apps.api.app.domains.operations.services.trade_confirmation_comparison import (
    build_trade_confirmation_comparison,
)
from apps.api.app.domains.operations.services.trade_credit_hold import format_trade_credit_hold_message
from apps.api.app.domains.operations.services.trade_credit_hold import get_trade_credit_hold_state
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
    load_operational_resource_items,
)
from apps.api.app.domains.operations.services.workflow_items import set_trade_workflow_item_projection
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.confirmation import TradeConfirmationOut
from apps.api.app.schemas.confirmation import TradeConfirmationMismatchOut
from apps.api.app.shared.enums import ConfirmationReceiptStatus
from apps.api.app.shared.enums import ConfirmationStatus
from apps.api.app.shared.enums import TradeWorkflowType
from apps.api.app.schemas.operations import OperationalRowActionStateOut

CONFIRMATION_ISSUE_METHODS: tuple[str, ...] = ("EMAIL", "EDI", "PORTAL", "MANUAL", "OTHER")
CONFIRMATION_RESPONSE_METHODS: tuple[str, ...] = ("EMAIL", "EDI", "PORTAL", "PHONE", "MANUAL", "OTHER")
CONFIRMATION_RESPONSE_ACTIONS: tuple[str, ...] = (
    ConfirmationReceiptStatus.RECEIVED.value,
    ConfirmationReceiptStatus.COUNTERPARTY_CONFIRMED.value,
    ConfirmationReceiptStatus.COUNTERPARTY_DISPUTED.value,
)
AUTO_GENERATED_CAPTURE_DRAFT_NOTE = (
    "Auto-generated draft from booked trade economics on trade capture."
)
CONFIRMATION_PERMISSION_MESSAGE = (
    "Sign in to create, issue, respond to, and revise confirmation records."
)


@dataclass(frozen=True)
class ConfirmationListRequest(OperationalResourceListRequest):
    trade_id: str | None = None


@dataclass(frozen=True)
class ConfirmationListContext:
    pages_by_document_id: dict[str, list[DocumentIngestionPage]]


def _audit_confirmation_payload(confirmation: TradeConfirmationOut) -> dict[str, object]:
    return confirmation.model_dump(mode="json")


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_optional_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _normalize_issue_method(value: object | None, *, default: str | None = None) -> str | None:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        return default
    normalized = normalized.upper()
    if normalized not in CONFIRMATION_ISSUE_METHODS:
        raise ValueError(
            "Issue method is invalid. Expected one of: "
            f"{', '.join(CONFIRMATION_ISSUE_METHODS)}."
        )
    return normalized


def _normalize_response_method(value: object | None, *, default: str | None = None) -> str | None:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        return default
    normalized = normalized.upper()
    if normalized not in CONFIRMATION_RESPONSE_METHODS:
        raise ValueError(
            "Response method is invalid. Expected one of: "
            f"{', '.join(CONFIRMATION_RESPONSE_METHODS)}."
        )
    return normalized


def _normalize_response_action(value: object | None) -> str:
    normalized = str(value or "").strip().upper()
    if normalized not in CONFIRMATION_RESPONSE_ACTIONS:
        raise ValueError(
            "Confirmation response action is invalid. Expected one of: "
            f"{', '.join(CONFIRMATION_RESPONSE_ACTIONS)}."
        )
    return normalized


def _format_date(value: date | None) -> str | None:
    return value.isoformat() if value is not None else None


def _format_decimal(value: object | None) -> str | None:
    if value is None:
        return None
    try:
        normalized = Decimal(str(value)).normalize()
    except (InvalidOperation, ValueError):
        return str(value)
    return format(normalized, "f")


def _normalize_confirmation_number(
    db: Session,
    *,
    trade: Trade,
    value: object | None,
    fallback_document_fields: dict[str, str] | None = None,
) -> str:
    normalized = str(value or "").strip().upper()
    if normalized:
        return normalized

    if fallback_document_fields:
        document_value = str(fallback_document_fields.get("confirmation_number") or "").strip().upper()
        if document_value:
            return document_value

    sequence = (
        db.execute(
            select(func.count()).select_from(TradeConfirmation).where(TradeConfirmation.trade_id == trade.trade_id)
        ).scalar_one()
        + 1
    )
    return f"CONF-{trade.trade_id}-{sequence:02d}"


def _validate_confirmation_status(value: object | None, *, default: str) -> str:
    normalized = str(value or default).strip().upper()
    valid_values = tuple(status.value for status in ConfirmationStatus)
    if normalized not in valid_values:
        raise ValueError(
            f"Confirmation status '{normalized}' is invalid. Expected one of: {', '.join(valid_values)}."
        )
    return normalized


def _validate_dispute_reason(*, status: str, dispute_reason: str | None) -> None:
    if status == ConfirmationStatus.DISPUTED.value and not dispute_reason:
        raise ValueError("Dispute reason is required when confirmation status is DISPUTED.")


def _document_field_map(pages: list[DocumentIngestionPage]) -> dict[str, str]:
    values: dict[str, str] = {}
    for page in pages:
        if page.document_kind != "TRADE_CONFIRMATION":
            continue
        for raw_field in page.header_fields or []:
            field_key = str(raw_field.get("field_key", "")).strip().lower()
            field_value = str(raw_field.get("value", "")).strip()
            if field_key and field_value and field_key not in values:
                values[field_key] = field_value
    return values


def _load_confirmation_pages_by_document_id(
    db: Session,
    *,
    document_ids: set[str],
) -> dict[str, list[DocumentIngestionPage]]:
    if not document_ids:
        return {}

    pages = db.execute(
        select(DocumentIngestionPage)
        .where(DocumentIngestionPage.document_id.in_(sorted(document_ids)))
        .order_by(DocumentIngestionPage.document_id.asc(), DocumentIngestionPage.page_number.asc())
    ).scalars().all()

    pages_by_document_id: dict[str, list[DocumentIngestionPage]] = {}
    for page in pages:
        pages_by_document_id.setdefault(page.document_id, []).append(page)
    return pages_by_document_id


def _validate_source_document_link_availability(
    db: Session,
    *,
    source_document_id: str | None,
    ignore_confirmation_id: int | None = None,
) -> None:
    if not source_document_id:
        return

    stmt = select(TradeConfirmation).where(TradeConfirmation.source_document_id == source_document_id)
    if ignore_confirmation_id is not None:
        stmt = stmt.where(TradeConfirmation.id != ignore_confirmation_id)
    existing = db.execute(stmt).scalars().first()
    if existing is not None:
        raise ValueError(
            f"Document '{source_document_id}' is already linked to confirmation record {existing.id}."
        )


def _load_trade(db: Session, *, trade_id: str) -> Trade:
    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id, Trade.status == "ACTIVE")).scalars().first()
    if trade is None:
        raise LookupError(f"Trade '{trade_id}' was not found.")
    return trade


def _load_verified_confirmation_document(
    db: Session,
    *,
    source_document_id: str,
    trade: Trade,
) -> tuple[DocumentIngestion, list[DocumentIngestionPage], dict[str, str]]:
    document = db.get(DocumentIngestion, source_document_id)
    if document is None:
        raise LookupError(f"Document '{source_document_id}' was not found.")
    if document.review_status != "VERIFIED":
        raise ValueError("Linked confirmation documents must be verified before they can drive a confirmation record.")

    pages = db.execute(
        select(DocumentIngestionPage)
        .where(DocumentIngestionPage.document_id == source_document_id)
        .order_by(DocumentIngestionPage.page_number.asc(), DocumentIngestionPage.page_id.asc())
    ).scalars().all()
    confirmation_pages = [
        page
        for page in pages
        if page.document_kind == "TRADE_CONFIRMATION" and page.review_status == "REVIEWED"
    ]
    if not confirmation_pages:
        raise ValueError(
            "Linked confirmation documents must include at least one reviewed TRADE_CONFIRMATION page."
        )

    field_map = _document_field_map(confirmation_pages)
    extracted_trade_id = str(field_map.get("trade_id") or "").strip()
    if extracted_trade_id and extracted_trade_id.upper() != trade.trade_id.upper():
        raise ValueError(
            f"Document '{source_document_id}' belongs to trade '{extracted_trade_id}', not '{trade.trade_id}'."
        )

    return document, confirmation_pages, field_map


def _normalize_sent_at(
    value: datetime | None,
    *,
    status: str,
    fallback_document: DocumentIngestion | None,
    fallback_confirmed_at: datetime | None,
    fallback: datetime,
) -> datetime | None:
    normalized = _coerce_utc(value)
    if normalized is not None:
        return normalized
    if status in {ConfirmationStatus.SENT.value, ConfirmationStatus.CONFIRMED.value, ConfirmationStatus.DISPUTED.value}:
        return (
            _coerce_utc(fallback_document.reviewed_at) if fallback_document is not None else None
        ) or fallback_confirmed_at or fallback
    return None


def _normalize_confirmed_at(
    value: datetime | None,
    *,
    status: str,
    fallback_document: DocumentIngestion | None,
    fallback_sent_at: datetime | None,
    fallback: datetime,
) -> datetime | None:
    normalized = _coerce_utc(value)
    if normalized is not None:
        return normalized
    if status == ConfirmationStatus.CONFIRMED.value:
        return (
            _coerce_utc(fallback_document.reviewed_at) if fallback_document is not None else None
        ) or fallback_sent_at or fallback
    return None


def _validate_confirmation_timestamps(
    *,
    sent_at: datetime | None,
    confirmed_at: datetime | None,
) -> None:
    if sent_at is not None and confirmed_at is not None and confirmed_at < sent_at:
        raise ValueError("Confirmed timestamp must be on or after the sent timestamp.")


def _workflow_note_for_confirmation(
    confirmation: TradeConfirmation,
    *,
    document: DocumentIngestion | None,
) -> str | None:
    issue_summary = _issue_summary_for_confirmation(confirmation)
    receipt_summary = _receipt_summary_for_confirmation(confirmation)

    base_note: str | None = None
    if confirmation.status == ConfirmationStatus.DISPUTED.value:
        base_note = confirmation.dispute_reason
    elif confirmation.comparison_waiver_note:
        if confirmation.notes:
            base_note = f"{confirmation.notes} Waiver: {confirmation.comparison_waiver_note}"
        else:
            base_note = f"Comparison waived: {confirmation.comparison_waiver_note}"
    elif confirmation.notes:
        base_note = confirmation.notes
    elif document is not None:
        base_note = f"Linked to verified document {document.display_name}."

    note_parts = [part for part in (base_note, issue_summary, receipt_summary) if part]
    return " ".join(note_parts) if note_parts else None


def _issue_summary_for_confirmation(confirmation: TradeConfirmation) -> str | None:
    if confirmation.issue_count <= 0:
        return None

    summary = (
        "Issued once"
        if confirmation.issue_count == 1
        else f"Reissued {confirmation.issue_count} times"
    )
    if confirmation.last_issue_method:
        summary = f"{summary} via {confirmation.last_issue_method}"
    if confirmation.last_issue_recipient:
        summary = f"{summary} to {confirmation.last_issue_recipient}"
    if confirmation.last_issued_at:
        issue_date = _coerce_utc(confirmation.last_issued_at)
        if issue_date is not None:
            summary = f"{summary} on {issue_date.date().isoformat()}"
    if confirmation.last_issue_note:
        summary = f"{summary}. {confirmation.last_issue_note}"
    return summary + "."


def _receipt_summary_for_confirmation(confirmation: TradeConfirmation) -> str | None:
    if confirmation.receipt_status == ConfirmationReceiptStatus.NOT_ISSUED.value:
        return None
    if confirmation.receipt_status == ConfirmationReceiptStatus.ISSUED_AWAITING_RESPONSE.value:
        return "Awaiting counterparty response."

    if confirmation.receipt_status == ConfirmationReceiptStatus.RECEIVED.value:
        summary = "Counterparty receipt acknowledged"
    elif confirmation.receipt_status == ConfirmationReceiptStatus.COUNTERPARTY_CONFIRMED.value:
        summary = "Counterparty confirmed"
    elif confirmation.receipt_status == ConfirmationReceiptStatus.COUNTERPARTY_DISPUTED.value:
        summary = "Counterparty disputed"
    else:
        summary = f"Response status {confirmation.receipt_status.replace('_', ' ').lower()}"

    if confirmation.response_method:
        summary = f"{summary} via {confirmation.response_method}"
    if confirmation.response_reference:
        summary = f"{summary} ref {confirmation.response_reference}"
    if confirmation.received_at:
        received_at = _coerce_utc(confirmation.received_at)
        if received_at is not None:
            summary = f"{summary} on {received_at.date().isoformat()}"
    if confirmation.response_note:
        summary = f"{summary}. {confirmation.response_note}"
    return summary + "."


def _latest_confirmation_id_for_trade(db: Session, *, trade_id: str) -> int | None:
    return db.execute(
        select(TradeConfirmation.id)
        .where(TradeConfirmation.trade_id == trade_id)
        .order_by(TradeConfirmation.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def _sync_confirmation_projection(
    db: Session,
    *,
    trade: Trade,
    confirmation: TradeConfirmation,
    actor_id: str,
    now: datetime,
    document: DocumentIngestion | None,
) -> TradeWorkflowItem:
    return set_trade_workflow_item_projection(
        db,
        trade=trade,
        workflow_type=TradeWorkflowType.CONFIRMATION.value,
        status=confirmation.status,
        actor_id=actor_id,
        now=now,
        rollup_settlement_status=False,
        notes=_workflow_note_for_confirmation(confirmation, document=document),
    )


def _assert_confirmation_status_change_not_credit_blocked(
    db: Session,
    *,
    trade: Trade,
    previous_status: str,
    next_status: str,
) -> None:
    if previous_status == next_status:
        return

    credit_hold_state = get_trade_credit_hold_state(db, trade_id=trade.trade_id)
    if not credit_hold_state.hold_active:
        return

    raise ValueError(
        format_trade_credit_hold_message(
            trade.trade_id,
            credit_hold_state,
            blocked_action=(
                "Updating confirmation status is blocked until credit approves the trade "
                "or the trade is amended back within limit."
            ),
        )
    )


def _assert_issued_confirmation_status_change_uses_response_action(
    *,
    confirmation: TradeConfirmation,
    next_status: str,
    status_requested: bool,
) -> None:
    if not status_requested:
        return
    if confirmation.issue_count <= 0:
        return
    if next_status == confirmation.status:
        return

    raise ValueError(
        "Issued confirmations track counterparty progress through response actions. "
        "Use the confirmation response workflow instead of updating status directly."
    )


def _assert_confirmation_comparison_not_blocked(
    *,
    status: str,
    comparison_result: TradeConfirmationComparisonResult,
) -> None:
    if status != ConfirmationStatus.CONFIRMED.value or not comparison_result.has_blocking_mismatches:
        return
    if comparison_result.comparison_status == "WAIVED":
        return

    mismatch_labels = ", ".join(mismatch.label for mismatch in comparison_result.mismatches[:3])
    if len(comparison_result.mismatches) > 3:
        mismatch_labels = f"{mismatch_labels}, and {len(comparison_result.mismatches) - 3} more"
    raise ValueError(
        "Cannot mark this confirmation CONFIRMED because the linked document does not match the booked trade "
        f"for {mismatch_labels}. Save it as SENT or provide a comparison waiver note."
    )


def _apply_comparison_waiver_state(
    confirmation: TradeConfirmation,
    *,
    comparison_result: TradeConfirmationComparisonResult,
    comparison_waiver_note: str | None,
    actor_id: str,
    now: datetime,
) -> None:
    normalized_waiver_note = _normalize_optional_text(comparison_waiver_note)
    if comparison_result.has_blocking_mismatches and normalized_waiver_note:
        note_changed = confirmation.comparison_waiver_note != normalized_waiver_note
        confirmation.comparison_waiver_note = normalized_waiver_note
        if note_changed or confirmation.comparison_waived_at is None:
            confirmation.comparison_waived_at = now
            confirmation.comparison_waived_by = actor_id
        return

    confirmation.comparison_waiver_note = None
    confirmation.comparison_waived_at = None
    confirmation.comparison_waived_by = None


def _confirmation_response_blocked_reason(confirmation: TradeConfirmation) -> str | None:
    if confirmation.status != ConfirmationStatus.SENT.value:
        return "Only sent confirmation versions can record a counterparty response."
    if confirmation.issue_count <= 0:
        return "Issue the confirmation before recording a counterparty response."
    return None


def _confirmation_action_states(
    confirmation: TradeConfirmation,
    *,
    comparison_result: TradeConfirmationComparisonResult,
) -> list[OperationalRowActionStateOut]:
    response_blocked_reason = _confirmation_response_blocked_reason(confirmation)
    confirmed_blocked_reason = response_blocked_reason
    if confirmed_blocked_reason is None and comparison_result.has_blocking_mismatches and not confirmation.comparison_waiver_note:
        confirmed_blocked_reason = (
            "Resolve blocking comparison mismatches or add a waiver note before marking the confirmation as confirmed."
        )
    issue_blocked_reason = None
    if confirmation.status not in {ConfirmationStatus.PENDING.value, ConfirmationStatus.SENT.value}:
        issue_blocked_reason = "Only pending or sent confirmation versions can be issued."

    save_blocked_reason = None
    if (
        confirmation.status == ConfirmationStatus.CONFIRMED.value
        and comparison_result.has_blocking_mismatches
        and not confirmation.comparison_waiver_note
    ):
        save_blocked_reason = (
            "Resolve blocking comparison mismatches or add a waiver note before saving a confirmed confirmation version."
        )

    return [
        OperationalRowActionStateOut(
            key="issue",
            available=issue_blocked_reason is None,
            blocked_reason=issue_blocked_reason,
            label="Reissue Confirmation" if confirmation.issue_count > 0 else None,
        ),
        OperationalRowActionStateOut(
            key="received",
            available=response_blocked_reason is None,
            blocked_reason=response_blocked_reason,
        ),
        OperationalRowActionStateOut(
            key="confirmed",
            available=confirmed_blocked_reason is None,
            blocked_reason=confirmed_blocked_reason,
        ),
        OperationalRowActionStateOut(
            key="disputed",
            available=response_blocked_reason is None,
            blocked_reason=response_blocked_reason,
        ),
        OperationalRowActionStateOut(
            key="save",
            available=save_blocked_reason is None,
            blocked_reason=save_blocked_reason,
        ),
        OperationalRowActionStateOut(key="newVersion"),
    ]


def _to_out(
    confirmation: TradeConfirmation,
    trade: Trade,
    workflow_item: TradeWorkflowItem | None,
    source_document: DocumentIngestion | None,
    *,
    comparison_result: TradeConfirmationComparisonResult,
    now: datetime,
    is_current: bool,
) -> TradeConfirmationOut:
    created_at = _coerce_utc(confirmation.created_at) or now
    updated_at = _coerce_utc(confirmation.updated_at) or created_at
    return TradeConfirmationOut(
        confirmation_id=confirmation.id,
        trade_id=confirmation.trade_id,
        source_document_id=confirmation.source_document_id,
        source_document_display_name=source_document.display_name if source_document is not None else None,
        source_document_review_status=source_document.review_status if source_document is not None else None,
        confirmation_number=confirmation.confirmation_number,
        status=confirmation.status,
        sent_at=_coerce_utc(confirmation.sent_at),
        confirmed_at=_coerce_utc(confirmation.confirmed_at),
        issue_count=confirmation.issue_count,
        last_issued_at=_coerce_utc(confirmation.last_issued_at),
        last_issued_by=confirmation.last_issued_by,
        last_issue_method=confirmation.last_issue_method,
        last_issue_recipient=confirmation.last_issue_recipient,
        last_issue_note=confirmation.last_issue_note,
        receipt_status=confirmation.receipt_status,
        received_at=_coerce_utc(confirmation.received_at),
        received_by=confirmation.received_by,
        response_method=confirmation.response_method,
        response_reference=confirmation.response_reference,
        response_note=confirmation.response_note,
        dispute_reason=confirmation.dispute_reason,
        notes=confirmation.notes,
        comparison_waiver_note=confirmation.comparison_waiver_note,
        comparison_waived_at=_coerce_utc(confirmation.comparison_waived_at),
        comparison_waived_by=confirmation.comparison_waived_by,
        created_at=created_at,
        created_by=confirmation.created_by,
        updated_at=updated_at,
        updated_by=confirmation.updated_by,
        version=confirmation.version,
        workflow_item_id=workflow_item.id if workflow_item is not None else None,
        workflow_owner=workflow_item.owner if workflow_item is not None else None,
        is_current=is_current,
        age_days=max(0, int((now - created_at).total_seconds() // 86_400)),
        trade_nature=trade.trade_nature,
        book=trade.book,
        portfolio=trade.portfolio,
        counterparty=trade.counterparty,
        commodity_class=trade.commodity_class,
        commodity=trade.commodity,
        trader_user=trade.trader_user,
        trade_date=trade.trade_date,
        delivery_start=trade.delivery_start,
        delivery_end=trade.delivery_end,
        comparison_status=comparison_result.comparison_status,
        blocking_mismatch_count=comparison_result.blocking_mismatch_count,
        mismatches=[
            TradeConfirmationMismatchOut(
                field_key=mismatch.field_key,
                label=mismatch.label,
                mismatch_type=mismatch.mismatch_type,
                expected_value=mismatch.expected_value,
                actual_value=mismatch.actual_value,
                blocking=mismatch.blocking,
            )
            for mismatch in comparison_result.mismatches
        ],
        action_states=_confirmation_action_states(
            confirmation,
            comparison_result=comparison_result,
        ),
    )


def trade_has_confirmation_record(db: Session, *, trade_id: str) -> bool:
    return (
        db.execute(
            select(TradeConfirmation.id).where(TradeConfirmation.trade_id == trade_id).limit(1)
        ).scalar_one_or_none()
        is not None
    )


def ensure_trade_confirmation_draft_for_trade_capture(
    db: Session,
    *,
    trade: Trade,
    actor_id: str,
    now: datetime,
) -> TradeConfirmationOut | None:
    db.flush()
    if trade.confirmation_status != ConfirmationStatus.PENDING.value:
        return None
    if trade_has_confirmation_record(db, trade_id=trade.trade_id):
        return None

    return create_trade_confirmation(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        status=ConfirmationStatus.PENDING.value,
        notes=AUTO_GENERATED_CAPTURE_DRAFT_NOTE,
        now=now,
        enforce_credit_hold_status_change=False,
    )


def _trade_confirmation_revision_snapshot(
    db: Session,
    *,
    trade: Trade,
) -> dict[str, object]:
    snapshot: dict[str, object] = {
        "trade_date": _format_date(trade.trade_date),
        "counterparty": trade.counterparty,
        "trade_side": trade.trade_side,
        "commodity": trade.commodity,
        "volume": _format_decimal(trade.volume),
        "unit_of_measure": trade.unit_of_measure,
        "price": _format_decimal(trade.price),
        "price_unit_code": trade.price_unit_code,
        "delivery_start": _format_date(trade.delivery_start),
        "delivery_end": _format_date(trade.delivery_end),
        "location_code": trade.location_code,
        "instrument_type": trade.instrument_type,
        "trade_structure": trade.trade_structure,
        "option_type": trade.option_type,
        "option_style": trade.option_style,
        "option_strike_price": _format_decimal(trade.option_strike_price),
        "option_expiration_date": _format_date(trade.option_expiration_date),
    }
    if trade.trade_structure != "SINGLE":
        legs = db.execute(
            select(TradeLeg)
            .where(TradeLeg.trade_id == trade.trade_id)
            .order_by(TradeLeg.leg_no.asc(), TradeLeg.trade_leg_id.asc())
        ).scalars().all()
        snapshot["legs"] = [
            {
                "leg_no": leg.leg_no,
                "side": leg.side,
                "commodity_class": leg.commodity_class,
                "commodity_code": leg.commodity_code,
                "location_code": leg.location_code,
                "quantity": _format_decimal(leg.quantity),
                "quantity_unit_code": leg.quantity_unit_code,
                "delivery_start": _format_date(leg.delivery_start),
                "delivery_end": _format_date(leg.delivery_end),
            }
            for leg in legs
        ]
    return snapshot


def build_trade_confirmation_revision_snapshot(
    db: Session,
    *,
    trade: Trade,
) -> dict[str, object]:
    return _trade_confirmation_revision_snapshot(db, trade=trade)


def _changed_trade_confirmation_revision_fields(
    *,
    before: dict[str, object],
    after: dict[str, object],
) -> list[str]:
    return sorted(field_key for field_key in set(before) | set(after) if before.get(field_key) != after.get(field_key))


def _trade_confirmation_change_label(field_key: str) -> str:
    labels = {
        "trade_date": "trade date",
        "counterparty": "counterparty",
        "trade_side": "side",
        "commodity": "commodity",
        "volume": "volume",
        "unit_of_measure": "unit",
        "price": "price",
        "price_unit_code": "price unit",
        "delivery_start": "delivery start",
        "delivery_end": "delivery end",
        "location_code": "location",
        "instrument_type": "instrument type",
        "trade_structure": "trade structure",
        "option_type": "option type",
        "option_style": "option style",
        "option_strike_price": "strike price",
        "option_expiration_date": "option expiration",
        "legs": "legs",
    }
    return labels.get(field_key, field_key.replace("_", " "))


def _format_trade_confirmation_change_summary(field_keys: list[str]) -> str:
    labels = [_trade_confirmation_change_label(field_key) for field_key in field_keys]
    if not labels:
        return "booked economics"
    if len(labels) <= 3:
        return ", ".join(labels)
    return f"{', '.join(labels[:3])}, and {len(labels) - 3} more"


def _auto_generated_amendment_draft_note(
    *,
    changed_fields: list[str],
    superseded_confirmation_number: str | None = None,
) -> str:
    change_summary = _format_trade_confirmation_change_summary(changed_fields)
    if superseded_confirmation_number:
        return (
            f"Supersedes {superseded_confirmation_number} after booked economics changed "
            f"on trade amendment: {change_summary}."
    )
    return f"Auto-generated draft after booked economics changed on trade amendment: {change_summary}."


def _load_confirmation_list_rows(
    db: Session,
    request: ConfirmationListRequest,
) -> list[tuple[TradeConfirmation, Trade, TradeWorkflowItem | None, DocumentIngestion | None, int | None]]:
    latest_confirmation_subquery = (
        select(
            TradeConfirmation.trade_id.label("trade_id"),
            func.max(TradeConfirmation.id).label("current_confirmation_id"),
        )
        .group_by(TradeConfirmation.trade_id)
        .subquery()
    )

    stmt = (
        select(
            TradeConfirmation,
            Trade,
            TradeWorkflowItem,
            DocumentIngestion,
            latest_confirmation_subquery.c.current_confirmation_id,
        )
        .join(Trade, Trade.trade_id == TradeConfirmation.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            (TradeWorkflowItem.trade_id == TradeConfirmation.trade_id)
            & (TradeWorkflowItem.workflow_type == TradeWorkflowType.CONFIRMATION.value),
        )
        .outerjoin(DocumentIngestion, DocumentIngestion.document_id == TradeConfirmation.source_document_id)
        .outerjoin(
            latest_confirmation_subquery,
            latest_confirmation_subquery.c.trade_id == TradeConfirmation.trade_id,
        )
        .where(Trade.status == "ACTIVE")
        .order_by(TradeConfirmation.created_at.desc(), TradeConfirmation.id.desc())
    )
    if request.trade_id:
        stmt = stmt.where(TradeConfirmation.trade_id == request.trade_id)
    if request.offset:
        stmt = stmt.offset(request.offset)
    if request.limit is not None:
        stmt = stmt.limit(request.limit)
    return list(db.execute(stmt).all())


def _load_confirmation_list_context(
    db: Session,
    rows: list[tuple[TradeConfirmation, Trade, TradeWorkflowItem | None, DocumentIngestion | None, int | None]],
    _request: ConfirmationListRequest,
) -> ConfirmationListContext:
    return ConfirmationListContext(
        pages_by_document_id=_load_confirmation_pages_by_document_id(
            db,
            document_ids={
                confirmation.source_document_id
                for confirmation, _trade, _workflow_item, _source_document, _current_confirmation_id in rows
                if confirmation.source_document_id
            },
        )
    )


def _build_confirmation_list_item(
    row: tuple[TradeConfirmation, Trade, TradeWorkflowItem | None, DocumentIngestion | None, int | None],
    context: ConfirmationListContext,
    request: ConfirmationListRequest,
) -> TradeConfirmationOut:
    confirmation, trade, workflow_item, source_document, current_confirmation_id = row
    return _to_out(
        confirmation,
        trade,
        workflow_item,
        source_document,
        comparison_result=build_trade_confirmation_comparison(
            trade=trade,
            confirmation_pages=context.pages_by_document_id.get(confirmation.source_document_id or "", []),
            comparison_waiver_note=confirmation.comparison_waiver_note,
        ),
        now=request.reference_time,
        is_current=confirmation.id == current_confirmation_id,
    )


CONFIRMATION_RESOURCE_DESCRIPTOR = OperationalResourceDescriptor[
    ConfirmationListRequest,
    tuple[TradeConfirmation, Trade, TradeWorkflowItem | None, DocumentIngestion | None, int | None],
    ConfirmationListContext,
    TradeConfirmationOut,
](
    resource_key="confirmations",
    filters=("trade_id",),
    sort_fields=("created_at desc", "id desc"),
    actions=("create", "update", "issue", "record_response"),
    surface=OperationalResourceSurface(
        title="Confirmation Ledger",
        description=(
            "Dedicated confirmation records drive draft, issue, dispute, and amendment handling "
            "straight from the operational record set."
        ),
        board_section="Trade Confirmation",
        actions=(
            OperationalResourceSurfaceAction(
                key="create",
                label="Create Confirmation",
                detail="Create the first managed confirmation record for the trade.",
                permission_message=CONFIRMATION_PERMISSION_MESSAGE,
            ),
            OperationalResourceSurfaceAction(
                key="issue",
                label="Issue Confirmation",
                detail="Issue the current confirmation draft once terms and comparison results are clean.",
                permission_message=CONFIRMATION_PERMISSION_MESSAGE,
            ),
            OperationalResourceSurfaceAction(
                key="received",
                label="Mark Received",
                detail="Record receipt of the counterparty response without resolving it as confirmed or disputed.",
                permission_message=CONFIRMATION_PERMISSION_MESSAGE,
            ),
            OperationalResourceSurfaceAction(
                key="confirmed",
                label="Counterparty Confirmed",
                detail="Record a clean counterparty confirmation response on the current issued record.",
                permission_message=CONFIRMATION_PERMISSION_MESSAGE,
            ),
            OperationalResourceSurfaceAction(
                key="disputed",
                label="Counterparty Disputed",
                detail="Record a disputed response on the current issued confirmation version.",
                permission_message=CONFIRMATION_PERMISSION_MESSAGE,
                comment_required=True,
                comment_hint="Add a dispute reason or response note before marking the confirmation as disputed.",
            ),
            OperationalResourceSurfaceAction(
                key="save",
                label="Save Current",
                detail="Persist edits to the current confirmation version without creating a new version.",
                permission_message=CONFIRMATION_PERMISSION_MESSAGE,
            ),
            OperationalResourceSurfaceAction(
                key="newVersion",
                label="Log New Version",
                detail="Create a fresh managed version when economics or supporting documents change.",
                permission_message=CONFIRMATION_PERMISSION_MESSAGE,
            ),
        ),
        primary_action=OperationalResourcePrimaryAction(
            key="issue_current_draft",
            label="Issue current draft",
            detail="Promote the latest confirmation version once terms and comparison results are clean.",
        ),
        empty_state=OperationalResourceEmptyState(
            title="No confirmation queue",
            detail="Active trades will appear here once there is confirmation work to manage.",
        ),
        summary_stats=(
            OperationalResourceSummaryStat(
                key="draft_versions",
                label="Draft versions",
                detail="Keep draft and amended confirmation versions inside one auditable ledger.",
            ),
            OperationalResourceSummaryStat(
                key="issue_responses",
                label="Issue and response loop",
                detail="Track issue timing, counterparty responses, and reconciliation without leaving the board.",
            ),
            OperationalResourceSummaryStat(
                key="comparison_exceptions",
                label="Document comparison",
                detail="Surface mismatches between booked economics and verified confirmation pages before issue.",
            ),
        ),
    ),
    load_rows=_load_confirmation_list_rows,
    load_context=_load_confirmation_list_context,
    build_item=_build_confirmation_list_item,
)


def list_trade_confirmations(
    db: Session,
    *,
    trade_id: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    now: Optional[datetime] = None,
) -> list[TradeConfirmationOut]:
    return load_operational_resource_items(
        CONFIRMATION_RESOURCE_DESCRIPTOR,
        db,
        ConfirmationListRequest(
            reference_time=_coerce_utc(now) or datetime.now(timezone.utc),
            trade_id=trade_id,
            limit=limit,
            offset=offset,
        ),
    )


def create_trade_confirmation(
    db: Session,
    *,
    trade_id: str,
    actor_id: str,
    source_document_id: str | None = None,
    confirmation_number: str | None = None,
    status: str | None = None,
    sent_at: datetime | None = None,
    confirmed_at: datetime | None = None,
    dispute_reason: str | None = None,
    notes: str | None = None,
    comparison_waiver_note: str | None = None,
    now: Optional[datetime] = None,
    enforce_credit_hold_status_change: bool = True,
) -> TradeConfirmationOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trade = _load_trade(db, trade_id=trade_id)
    normalized_source_document_id = _normalize_optional_text(source_document_id)
    _validate_source_document_link_availability(db, source_document_id=normalized_source_document_id)

    source_document: DocumentIngestion | None = None
    confirmation_pages: list[DocumentIngestionPage] = []
    document_fields: dict[str, str] = {}
    if normalized_source_document_id is not None:
        source_document, confirmation_pages, document_fields = _load_verified_confirmation_document(
            db,
            source_document_id=normalized_source_document_id,
            trade=trade,
        )

    normalized_comparison_waiver_note = _normalize_optional_text(comparison_waiver_note)
    comparison_result_without_waiver = build_trade_confirmation_comparison(
        trade=trade,
        confirmation_pages=confirmation_pages,
        comparison_waiver_note=None,
    )
    normalized_status = _validate_confirmation_status(
        status,
        default=(
            ConfirmationStatus.CONFIRMED.value
            if source_document is not None and not comparison_result_without_waiver.has_blocking_mismatches
            else ConfirmationStatus.SENT.value
        ),
    )
    if enforce_credit_hold_status_change:
        _assert_confirmation_status_change_not_credit_blocked(
            db,
            trade=trade,
            previous_status=trade.confirmation_status,
            next_status=normalized_status,
        )
    normalized_confirmation_number = _normalize_confirmation_number(
        db,
        trade=trade,
        value=confirmation_number,
        fallback_document_fields=document_fields,
    )
    normalized_dispute_reason = _normalize_optional_text(dispute_reason)
    normalized_notes = _normalize_optional_text(notes)
    normalized_confirmed_at = _normalize_confirmed_at(
        confirmed_at,
        status=normalized_status,
        fallback_document=source_document,
        fallback_sent_at=_coerce_utc(sent_at),
        fallback=reference_time,
    )
    normalized_sent_at = _normalize_sent_at(
        sent_at,
        status=normalized_status,
        fallback_document=source_document,
        fallback_confirmed_at=normalized_confirmed_at,
        fallback=reference_time,
    )
    _validate_dispute_reason(status=normalized_status, dispute_reason=normalized_dispute_reason)
    _validate_confirmation_timestamps(
        sent_at=normalized_sent_at,
        confirmed_at=normalized_confirmed_at,
    )

    comparison_result = build_trade_confirmation_comparison(
        trade=trade,
        confirmation_pages=confirmation_pages,
        comparison_waiver_note=normalized_comparison_waiver_note,
    )
    _assert_confirmation_comparison_not_blocked(
        status=normalized_status,
        comparison_result=comparison_result,
    )

    confirmation = TradeConfirmation(
        trade_id=trade.trade_id,
        source_document_id=normalized_source_document_id,
        confirmation_number=normalized_confirmation_number,
        status=normalized_status,
        sent_at=normalized_sent_at,
        confirmed_at=normalized_confirmed_at,
        issue_count=0,
        last_issued_at=None,
        last_issued_by=None,
        last_issue_method=None,
        last_issue_recipient=None,
        last_issue_note=None,
        receipt_status=ConfirmationReceiptStatus.NOT_ISSUED.value,
        received_at=None,
        received_by=None,
        response_method=None,
        response_reference=None,
        response_note=None,
        dispute_reason=normalized_dispute_reason,
        notes=normalized_notes,
        comparison_waiver_note=None,
        comparison_waived_at=None,
        comparison_waived_by=None,
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    _apply_comparison_waiver_state(
        confirmation,
        comparison_result=comparison_result,
        comparison_waiver_note=normalized_comparison_waiver_note,
        actor_id=actor_id,
        now=reference_time,
    )
    db.add(confirmation)
    db.flush()

    workflow_item = _sync_confirmation_projection(
        db,
        trade=trade,
        confirmation=confirmation,
        actor_id=actor_id,
        now=reference_time,
        document=source_document,
    )
    db.flush()
    confirmation_out = _to_out(
        confirmation,
        trade,
        workflow_item,
        source_document,
        comparison_result=build_trade_confirmation_comparison(
            trade=trade,
            confirmation_pages=confirmation_pages,
            comparison_waiver_note=confirmation.comparison_waiver_note,
        ),
        now=reference_time,
        is_current=True,
    )
    append_trade_audit_event(
        db,
        trade_id=confirmation_out.trade_id,
        actor_id=actor_id,
        event_type="TradeConfirmationCreated",
        occurred_at=confirmation_out.updated_at,
        causation_id=f"trade-confirmation:{confirmation_out.confirmation_id}",
        payload={
            "request": jsonable_encoder(
                {
                    key: value
                    for key, value in {
                        "trade_id": trade_id,
                        "source_document_id": source_document_id,
                        "confirmation_number": confirmation_number,
                        "status": status,
                        "sent_at": sent_at,
                        "confirmed_at": confirmed_at,
                        "dispute_reason": dispute_reason,
                        "notes": notes,
                        "comparison_waiver_note": comparison_waiver_note,
                    }.items()
                    if value is not None
                }
            ),
            "confirmation": _audit_confirmation_payload(confirmation_out),
        },
    )
    return confirmation_out


def issue_trade_confirmation(
    db: Session,
    *,
    confirmation_id: int,
    actor_id: str,
    issue_method: str | None = None,
    issue_recipient: str | None = None,
    issue_note: str | None = None,
    issued_at: datetime | None = None,
    now: Optional[datetime] = None,
) -> TradeConfirmationOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    effective_issued_at = _coerce_utc(issued_at) or reference_time
    row = db.execute(
        select(TradeConfirmation, Trade, TradeWorkflowItem, DocumentIngestion)
        .join(Trade, Trade.trade_id == TradeConfirmation.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            (TradeWorkflowItem.trade_id == TradeConfirmation.trade_id)
            & (TradeWorkflowItem.workflow_type == TradeWorkflowType.CONFIRMATION.value),
        )
        .outerjoin(DocumentIngestion, DocumentIngestion.document_id == TradeConfirmation.source_document_id)
        .where(
            TradeConfirmation.id == confirmation_id,
            Trade.status == "ACTIVE",
        )
    ).first()
    if row is None:
        raise LookupError(f"Confirmation record '{confirmation_id}' was not found.")

    confirmation, trade, workflow_item, source_document = row
    is_current = confirmation.id == _latest_confirmation_id_for_trade(db, trade_id=confirmation.trade_id)
    if not is_current:
        raise ValueError("Only the current confirmation record can be issued or reissued.")
    if confirmation.status not in {ConfirmationStatus.PENDING.value, ConfirmationStatus.SENT.value}:
        raise ValueError("Only current PENDING or SENT confirmation records can be issued or reissued.")

    confirmation_pages: list[DocumentIngestionPage] = []
    if source_document is not None:
        _source_document, confirmation_pages, _document_fields = _load_verified_confirmation_document(
            db,
            source_document_id=source_document.document_id,
            trade=trade,
        )
        source_document = _source_document

    if confirmation.status == ConfirmationStatus.PENDING.value:
        _assert_confirmation_status_change_not_credit_blocked(
            db,
            trade=trade,
            previous_status=confirmation.status,
            next_status=ConfirmationStatus.SENT.value,
        )
        confirmation.status = ConfirmationStatus.SENT.value

    previous_issue_count = confirmation.issue_count
    confirmation.issue_count = previous_issue_count + 1
    confirmation.last_issued_at = effective_issued_at
    confirmation.last_issued_by = actor_id
    confirmation.last_issue_method = _normalize_issue_method(
        issue_method,
        default=confirmation.last_issue_method or "MANUAL",
    )
    confirmation.last_issue_recipient = (
        _normalize_optional_text(issue_recipient)
        if issue_recipient is not None
        else confirmation.last_issue_recipient
    )
    confirmation.last_issue_note = (
        _normalize_optional_text(issue_note)
        if issue_note is not None
        else confirmation.last_issue_note
    )
    confirmation.receipt_status = ConfirmationReceiptStatus.ISSUED_AWAITING_RESPONSE.value
    confirmation.received_at = None
    confirmation.received_by = None
    confirmation.response_method = None
    confirmation.response_reference = None
    confirmation.response_note = None
    if confirmation.sent_at is None:
        confirmation.sent_at = effective_issued_at
    confirmation.updated_at = reference_time
    confirmation.updated_by = actor_id
    confirmation.version += 1
    db.flush()

    workflow_item = _sync_confirmation_projection(
        db,
        trade=trade,
        confirmation=confirmation,
        actor_id=actor_id,
        now=reference_time,
        document=source_document,
    )
    db.flush()

    confirmation_out = _to_out(
        confirmation,
        trade,
        workflow_item,
        source_document,
        comparison_result=build_trade_confirmation_comparison(
            trade=trade,
            confirmation_pages=confirmation_pages,
            comparison_waiver_note=confirmation.comparison_waiver_note,
        ),
        now=reference_time,
        is_current=True,
    )
    append_trade_audit_event(
        db,
        trade_id=confirmation_out.trade_id,
        actor_id=actor_id,
        event_type="TradeConfirmationIssued",
        occurred_at=confirmation_out.updated_at,
        causation_id=f"trade-confirmation:{confirmation_out.confirmation_id}:issue:{confirmation_out.issue_count}",
        payload={
            "request": jsonable_encoder(
                {
                    key: value
                    for key, value in {
                        "issued_at": issued_at,
                        "issue_method": issue_method,
                        "issue_recipient": issue_recipient,
                        "issue_note": issue_note,
                    }.items()
                    if value is not None
                }
            ),
            "previous_issue_count": previous_issue_count,
            "confirmation": _audit_confirmation_payload(confirmation_out),
        },
    )
    return confirmation_out


def record_trade_confirmation_response(
    db: Session,
    *,
    confirmation_id: int,
    actor_id: str,
    action: str,
    received_at: datetime | None = None,
    response_method: str | None = None,
    response_reference: str | None = None,
    response_note: str | None = None,
    dispute_reason: str | None = None,
    now: Optional[datetime] = None,
) -> TradeConfirmationOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    effective_received_at = _coerce_utc(received_at) or reference_time
    normalized_action = _normalize_response_action(action)
    row = db.execute(
        select(TradeConfirmation, Trade, TradeWorkflowItem, DocumentIngestion)
        .join(Trade, Trade.trade_id == TradeConfirmation.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            (TradeWorkflowItem.trade_id == TradeConfirmation.trade_id)
            & (TradeWorkflowItem.workflow_type == TradeWorkflowType.CONFIRMATION.value),
        )
        .outerjoin(DocumentIngestion, DocumentIngestion.document_id == TradeConfirmation.source_document_id)
        .where(
            TradeConfirmation.id == confirmation_id,
            Trade.status == "ACTIVE",
        )
    ).first()
    if row is None:
        raise LookupError(f"Confirmation record '{confirmation_id}' was not found.")

    confirmation, trade, workflow_item, source_document = row
    is_current = confirmation.id == _latest_confirmation_id_for_trade(db, trade_id=confirmation.trade_id)
    if not is_current:
        raise ValueError("Only the current confirmation record can accept counterparty responses.")
    if confirmation.issue_count <= 0:
        raise ValueError("Confirmation responses cannot be recorded before the current record is issued.")
    if confirmation.status != ConfirmationStatus.SENT.value:
        raise ValueError("Only current SENT confirmation records can accept counterparty responses.")
    normalized_sent_at = _coerce_utc(confirmation.sent_at)
    if normalized_sent_at is not None and effective_received_at < normalized_sent_at:
        raise ValueError("Received timestamp must be on or after the confirmation sent timestamp.")

    confirmation_pages: list[DocumentIngestionPage] = []
    if source_document is not None:
        _source_document, confirmation_pages, _document_fields = _load_verified_confirmation_document(
            db,
            source_document_id=source_document.document_id,
            trade=trade,
        )
        source_document = _source_document

    normalized_response_method = _normalize_response_method(response_method)
    normalized_response_reference = _normalize_optional_text(response_reference)
    normalized_response_note = _normalize_optional_text(response_note)
    normalized_dispute_reason = _normalize_optional_text(dispute_reason)

    next_status = confirmation.status
    if normalized_action == ConfirmationReceiptStatus.COUNTERPARTY_CONFIRMED.value:
        next_status = ConfirmationStatus.CONFIRMED.value
        _assert_confirmation_status_change_not_credit_blocked(
            db,
            trade=trade,
            previous_status=confirmation.status,
            next_status=next_status,
        )
        comparison_result = build_trade_confirmation_comparison(
            trade=trade,
            confirmation_pages=confirmation_pages,
            comparison_waiver_note=confirmation.comparison_waiver_note,
        )
        _assert_confirmation_comparison_not_blocked(
            status=next_status,
            comparison_result=comparison_result,
        )
        confirmation.status = next_status
        confirmation.confirmed_at = _normalize_confirmed_at(
            effective_received_at,
            status=confirmation.status,
            fallback_document=source_document,
            fallback_sent_at=normalized_sent_at,
            fallback=reference_time,
        )
        confirmation.dispute_reason = None
    elif normalized_action == ConfirmationReceiptStatus.COUNTERPARTY_DISPUTED.value:
        next_status = ConfirmationStatus.DISPUTED.value
        _assert_confirmation_status_change_not_credit_blocked(
            db,
            trade=trade,
            previous_status=confirmation.status,
            next_status=next_status,
        )
        confirmation.status = next_status
        confirmation.confirmed_at = None
        confirmation.dispute_reason = normalized_dispute_reason or normalized_response_note
        _validate_dispute_reason(status=confirmation.status, dispute_reason=confirmation.dispute_reason)
    else:
        confirmation.confirmed_at = None

    confirmation.receipt_status = normalized_action
    confirmation.received_at = effective_received_at
    confirmation.received_by = actor_id
    confirmation.response_method = normalized_response_method
    confirmation.response_reference = normalized_response_reference
    confirmation.response_note = normalized_response_note
    _validate_confirmation_timestamps(
        sent_at=normalized_sent_at,
        confirmed_at=confirmation.confirmed_at,
    )
    confirmation.updated_at = reference_time
    confirmation.updated_by = actor_id
    confirmation.version += 1
    db.flush()

    workflow_item = _sync_confirmation_projection(
        db,
        trade=trade,
        confirmation=confirmation,
        actor_id=actor_id,
        now=reference_time,
        document=source_document,
    )
    db.flush()

    confirmation_out = _to_out(
        confirmation,
        trade,
        workflow_item,
        source_document,
        comparison_result=build_trade_confirmation_comparison(
            trade=trade,
            confirmation_pages=confirmation_pages,
            comparison_waiver_note=confirmation.comparison_waiver_note,
        ),
        now=reference_time,
        is_current=True,
    )

    event_type = {
        ConfirmationReceiptStatus.RECEIVED.value: "TradeConfirmationReceived",
        ConfirmationReceiptStatus.COUNTERPARTY_CONFIRMED.value: "TradeConfirmationCounterpartyConfirmed",
        ConfirmationReceiptStatus.COUNTERPARTY_DISPUTED.value: "TradeConfirmationCounterpartyDisputed",
    }[normalized_action]
    append_trade_audit_event(
        db,
        trade_id=confirmation_out.trade_id,
        actor_id=actor_id,
        event_type=event_type,
        occurred_at=confirmation_out.updated_at,
        causation_id=(
            f"trade-confirmation:{confirmation_out.confirmation_id}:response:"
            f"{normalized_action.lower()}:{confirmation_out.version}"
        ),
        payload={
            "request": jsonable_encoder(
                {
                    key: value
                    for key, value in {
                        "action": action,
                        "received_at": received_at,
                        "response_method": response_method,
                        "response_reference": response_reference,
                        "response_note": response_note,
                        "dispute_reason": dispute_reason,
                    }.items()
                    if value is not None
                }
            ),
            "confirmation": _audit_confirmation_payload(confirmation_out),
        },
    )
    return confirmation_out


def maybe_supersede_trade_confirmation_for_trade_amendment(
    db: Session,
    *,
    trade: Trade,
    actor_id: str,
    now: datetime,
    before_revision_snapshot: dict[str, object],
) -> TradeConfirmationOut | None:
    db.flush()

    current_confirmation = db.execute(
        select(TradeConfirmation)
        .where(TradeConfirmation.trade_id == trade.trade_id)
        .order_by(TradeConfirmation.id.desc())
        .limit(1)
    ).scalars().first()

    after_revision_snapshot = _trade_confirmation_revision_snapshot(db, trade=trade)
    changed_fields = _changed_trade_confirmation_revision_fields(
        before=before_revision_snapshot,
        after=after_revision_snapshot,
    )
    if not changed_fields:
        return None

    if current_confirmation is None:
        if trade.confirmation_status != ConfirmationStatus.PENDING.value:
            return None
        return create_trade_confirmation(
            db,
            trade_id=trade.trade_id,
            actor_id=actor_id,
            status=ConfirmationStatus.PENDING.value,
            notes=_auto_generated_amendment_draft_note(changed_fields=changed_fields),
            now=now,
            enforce_credit_hold_status_change=False,
        )

    superseding_confirmation = create_trade_confirmation(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        status=ConfirmationStatus.PENDING.value,
        notes=_auto_generated_amendment_draft_note(
            changed_fields=changed_fields,
            superseded_confirmation_number=current_confirmation.confirmation_number,
        ),
        now=now,
        enforce_credit_hold_status_change=False,
    )
    append_trade_audit_event(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeConfirmationSuperseded",
        occurred_at=superseding_confirmation.updated_at,
        causation_id=f"trade-confirmation:{superseding_confirmation.confirmation_id}",
        payload={
            "superseded_confirmation_id": current_confirmation.id,
            "superseded_confirmation_number": current_confirmation.confirmation_number,
            "superseded_confirmation_status": current_confirmation.status,
            "changed_fields": changed_fields,
            "before_revision": before_revision_snapshot,
            "after_revision": after_revision_snapshot,
            "confirmation": _audit_confirmation_payload(superseding_confirmation),
        },
    )
    return superseding_confirmation


def update_trade_confirmation(
    db: Session,
    *,
    confirmation_id: int,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> TradeConfirmationOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    row = db.execute(
        select(TradeConfirmation, Trade, TradeWorkflowItem, DocumentIngestion)
        .join(Trade, Trade.trade_id == TradeConfirmation.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            (TradeWorkflowItem.trade_id == TradeConfirmation.trade_id)
            & (TradeWorkflowItem.workflow_type == TradeWorkflowType.CONFIRMATION.value),
        )
        .outerjoin(DocumentIngestion, DocumentIngestion.document_id == TradeConfirmation.source_document_id)
        .where(
            TradeConfirmation.id == confirmation_id,
            Trade.status == "ACTIVE",
        )
    ).first()
    if row is None:
        raise LookupError(f"Confirmation record '{confirmation_id}' was not found.")

    confirmation, trade, workflow_item, current_source_document = row
    source_document = current_source_document
    confirmation_pages: list[DocumentIngestionPage] = []
    document_fields: dict[str, str] = {}

    if "source_document_id" in changes:
        normalized_source_document_id = _normalize_optional_text(changes.get("source_document_id"))
        _validate_source_document_link_availability(
            db,
            source_document_id=normalized_source_document_id,
            ignore_confirmation_id=confirmation.id,
        )
        confirmation.source_document_id = normalized_source_document_id
        if normalized_source_document_id is not None:
            source_document, confirmation_pages, document_fields = _load_verified_confirmation_document(
                db,
                source_document_id=normalized_source_document_id,
                trade=trade,
            )
        else:
            source_document = None
    elif source_document is not None:
        _source_document, confirmation_pages, document_fields = _load_verified_confirmation_document(
            db,
            source_document_id=source_document.document_id,
            trade=trade,
        )
        source_document = _source_document

    if "confirmation_number" in changes:
        confirmation.confirmation_number = _normalize_confirmation_number(
            db,
            trade=trade,
            value=changes.get("confirmation_number") or confirmation.confirmation_number,
            fallback_document_fields=document_fields,
        )

    status_input = changes.get("status") if "status" in changes else confirmation.status
    next_status = _validate_confirmation_status(status_input, default=confirmation.status)
    _assert_issued_confirmation_status_change_uses_response_action(
        confirmation=confirmation,
        next_status=next_status,
        status_requested="status" in changes,
    )
    is_current = confirmation.id == _latest_confirmation_id_for_trade(db, trade_id=confirmation.trade_id)
    if is_current:
        _assert_confirmation_status_change_not_credit_blocked(
            db,
            trade=trade,
            previous_status=confirmation.status,
            next_status=next_status,
        )
    confirmation.status = next_status

    if "dispute_reason" in changes:
        confirmation.dispute_reason = _normalize_optional_text(changes.get("dispute_reason"))
    if "notes" in changes:
        confirmation.notes = _normalize_optional_text(changes.get("notes"))

    normalized_comparison_waiver_note = (
        _normalize_optional_text(changes.get("comparison_waiver_note"))
        if "comparison_waiver_note" in changes
        else confirmation.comparison_waiver_note
    )

    explicit_confirmed_at = (
        changes.get("confirmed_at") if "confirmed_at" in changes else confirmation.confirmed_at
    )
    explicit_sent_at = changes.get("sent_at") if "sent_at" in changes else confirmation.sent_at
    confirmation.confirmed_at = _normalize_confirmed_at(
        _coerce_utc(explicit_confirmed_at),
        status=confirmation.status,
        fallback_document=source_document,
        fallback_sent_at=_coerce_utc(explicit_sent_at),
        fallback=reference_time,
    )
    confirmation.sent_at = _normalize_sent_at(
        _coerce_utc(explicit_sent_at),
        status=confirmation.status,
        fallback_document=source_document,
        fallback_confirmed_at=confirmation.confirmed_at,
        fallback=reference_time,
    )
    _validate_dispute_reason(status=confirmation.status, dispute_reason=confirmation.dispute_reason)
    _validate_confirmation_timestamps(sent_at=confirmation.sent_at, confirmed_at=confirmation.confirmed_at)

    comparison_result = build_trade_confirmation_comparison(
        trade=trade,
        confirmation_pages=confirmation_pages,
        comparison_waiver_note=normalized_comparison_waiver_note,
    )
    _assert_confirmation_comparison_not_blocked(
        status=confirmation.status,
        comparison_result=comparison_result,
    )
    _apply_comparison_waiver_state(
        confirmation,
        comparison_result=comparison_result,
        comparison_waiver_note=normalized_comparison_waiver_note,
        actor_id=actor_id,
        now=reference_time,
    )

    confirmation.updated_at = reference_time
    confirmation.updated_by = actor_id
    confirmation.version += 1
    db.flush()

    if is_current:
        workflow_item = _sync_confirmation_projection(
            db,
            trade=trade,
            confirmation=confirmation,
            actor_id=actor_id,
            now=reference_time,
            document=source_document,
        )
        db.flush()

    confirmation_out = _to_out(
        confirmation,
        trade,
        workflow_item,
        source_document,
        comparison_result=build_trade_confirmation_comparison(
            trade=trade,
            confirmation_pages=confirmation_pages,
            comparison_waiver_note=confirmation.comparison_waiver_note,
        ),
        now=reference_time,
        is_current=is_current,
    )
    append_trade_audit_event(
        db,
        trade_id=confirmation_out.trade_id,
        actor_id=actor_id,
        event_type="TradeConfirmationUpdated",
        occurred_at=confirmation_out.updated_at,
        causation_id=f"trade-confirmation:{confirmation_out.confirmation_id}",
        payload={
            "requested_changes": jsonable_encoder(changes),
            "confirmation": _audit_confirmation_payload(confirmation_out),
        },
    )
    return confirmation_out
