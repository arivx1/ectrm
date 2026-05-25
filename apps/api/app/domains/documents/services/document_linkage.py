from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Callable

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.models.delivery_logistics_detail import DeliveryLogisticsDetail
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade import trade_recency_order
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.schemas.document import DocumentLinkageAssessmentOut
from apps.api.app.schemas.document import DocumentLinkageCandidateOut
from apps.api.app.schemas.document import DocumentRoutingAssessmentOut
from apps.api.app.schemas.document import DocumentRoutingCandidateOut

from .document_ingestion_common import clean_optional_text
from .document_record_links import list_document_record_links
from .document_record_links import ResolvedDocumentRecordLink
from .document_routing import TARGET_KEY_WEIGHTS
from .document_routing import build_document_routing_assessment

LOOKUP_LIMIT = 4

PRIMARY_IDENTIFIER_KEYS_BY_RECORD_TYPE: dict[str, set[str]] = {
    "TRADE": {"trade_id", "external_trade_id"},
    "TRADE_CONFIRMATION": {"confirmation_number"},
    "TRADE_INVOICE": {"invoice_number"},
    "TRADE_PAYMENT": {"payment_reference", "invoice_number"},
    "DELIVERY": {"delivery_id", "nomination_reference", "carrier_reference", "contract_number"},
    "PRICE_INDEX": {"price_index_code"},
    "PRICE_INDEX_OBSERVATION": {"price_index_code", "observation_date", "source_series_id"},
}


@dataclass(frozen=True)
class _LookupMatch:
    record_id: str
    record_label: str
    summary: str
    matched_keys: list[str]
    exact_identifier_match: bool


def build_document_linkage_assessment(
    db: Session,
    *,
    pages: list[DocumentIngestionPage],
    review_status: str,
    document_id: str | None = None,
) -> DocumentLinkageAssessmentOut:
    routing_assessment = build_document_routing_assessment(pages, review_status=review_status)
    if not pages:
        return DocumentLinkageAssessmentOut(
            status="MANUAL_REVIEW",
            recommended_action="MANUAL_REVIEW",
            confidence=0.0,
            reasons=["No pages are available for record linkage."],
        )

    linked_records = list_document_record_links(db, document_id=document_id) if document_id is not None else []
    field_map = _build_document_field_map(pages)
    if not field_map and not linked_records:
        return DocumentLinkageAssessmentOut(
            status="MANUAL_REVIEW",
            recommended_action="MANUAL_REVIEW",
            confidence=round(routing_assessment.confidence, 3),
            reasons=[
                "No extracted identifiers are available for record lookup yet.",
                *routing_assessment.reasons[:2],
            ],
        )

    candidates: list[DocumentLinkageCandidateOut] = [
        _build_linked_candidate(link)
        for link in linked_records[:LOOKUP_LIMIT]
    ]
    unsupported_targets: list[str] = []
    lookup_builders = _lookup_builders()

    for routing_candidate in routing_assessment.candidates[:LOOKUP_LIMIT]:
        lookup = lookup_builders.get(routing_candidate.record_type)
        if lookup is None:
            unsupported_targets.append(routing_candidate.label)
            if routing_candidate.create_if_missing:
                _append_candidate_if_missing(candidates, _build_create_candidate(routing_candidate))
            continue

        matches = lookup(db, field_map, limit=LOOKUP_LIMIT)
        if matches:
            for match in matches[:LOOKUP_LIMIT]:
                _append_candidate_if_missing(
                    candidates,
                    _build_existing_candidate(
                        routing_candidate=routing_candidate,
                        field_map=field_map,
                        match=match,
                    ),
                )
            continue

        if routing_candidate.create_if_missing:
            _append_candidate_if_missing(candidates, _build_create_candidate(routing_candidate))

    candidates.sort(
        key=lambda candidate: (
            -candidate.score,
            candidate.role != "PRIMARY",
            candidate.existing_record is False,
            -len(candidate.matched_keys),
            candidate.record_label,
        )
    )

    best_candidate = _select_best_candidate(candidates)
    if best_candidate is not None:
        selected_index = candidates.index(best_candidate)
        if selected_index > 0:
            candidates = [best_candidate, *candidates[:selected_index], *candidates[selected_index + 1:]]

    if linked_records and best_candidate is not None:
        status, recommended_action = "READY", "ATTACH"
    else:
        status, recommended_action = _resolve_linkage_decision(
            routing_assessment=routing_assessment,
            best_candidate=best_candidate,
            candidates=candidates,
        )

    reasons = _build_assessment_reasons(
        routing_assessment=routing_assessment,
        best_candidate=best_candidate,
        unsupported_targets=unsupported_targets,
        review_status=review_status,
        linked_records=linked_records,
    )
    _apply_candidate_states(
        candidates,
        best_candidate=best_candidate,
        status=status,
        recommended_action=recommended_action,
        linked_records=linked_records,
    )

    return DocumentLinkageAssessmentOut(
        status=status,
        recommended_action=recommended_action,
        confidence=round(best_candidate.score if best_candidate is not None else routing_assessment.confidence, 3),
        primary_record_type=best_candidate.record_type if best_candidate is not None else None,
        primary_record_id=best_candidate.record_id if best_candidate is not None else None,
        primary_record_label=best_candidate.record_label if best_candidate is not None else None,
        reasons=reasons,
        candidates=candidates[:LOOKUP_LIMIT],
    )


def _build_document_field_map(pages: list[DocumentIngestionPage]) -> dict[str, str]:
    field_map: dict[str, str] = {}
    ordered_pages = sorted(
        pages,
        key=lambda page: (page.review_status != "REVIEWED", page.page_number),
    )
    for page in ordered_pages:
        for field in page.header_fields or []:
            key = clean_optional_text(field.get("field_key"), lowercase=True)
            value = clean_optional_text(field.get("value"))
            if key and value and key not in field_map:
                field_map[key] = value
    return field_map


def _build_existing_candidate(
    *,
    routing_candidate: DocumentRoutingCandidateOut,
    field_map: dict[str, str],
    match: _LookupMatch,
) -> DocumentLinkageCandidateOut:
    relevant_keys = [
        key
        for key in field_map
        if key in TARGET_KEY_WEIGHTS.get(routing_candidate.record_type, {})
    ] or list(dict.fromkeys(routing_candidate.matched_keys + routing_candidate.missing_keys))
    missing_keys = sorted(key for key in relevant_keys if key not in match.matched_keys)
    score = _score_existing_candidate(
        record_type=routing_candidate.record_type,
        routing_candidate=routing_candidate,
        matched_keys=match.matched_keys,
        relevant_keys=relevant_keys,
        exact_identifier_match=match.exact_identifier_match,
    )
    reason = (
        f"Matched {_render_keys(match.matched_keys)} against the existing {routing_candidate.label.lower()}."
        if match.matched_keys
        else f"Matched the existing {routing_candidate.label.lower()} using supporting context."
    )
    return DocumentLinkageCandidateOut(
        record_type=routing_candidate.record_type,
        record_id=match.record_id,
        record_label=match.record_label,
        role=routing_candidate.role,
        candidate_state="ATTACH_REVIEW",
        existing_record=True,
        score=score,
        matched_keys=match.matched_keys,
        missing_keys=missing_keys,
        summary=match.summary,
        reason=reason,
        create_if_missing=routing_candidate.create_if_missing,
    )


def _build_linked_candidate(link: ResolvedDocumentRecordLink) -> DocumentLinkageCandidateOut:
    return DocumentLinkageCandidateOut(
        record_type=link.record_type,
        record_id=link.record_id,
        record_label=link.record_label,
        role=link.role,
        candidate_state="ALREADY_LINKED",
        existing_record=True,
        score=1.0,
        matched_keys=[],
        missing_keys=[],
        summary=link.summary,
        reason="This document is already linked to the record in the system.",
        create_if_missing=False,
    )


def _build_create_candidate(routing_candidate: DocumentRoutingCandidateOut) -> DocumentLinkageCandidateOut:
    score = min(0.97, routing_candidate.score * 0.94 + (0.04 if routing_candidate.role == "PRIMARY" else 0.0))
    return DocumentLinkageCandidateOut(
        record_type=routing_candidate.record_type,
        record_id=None,
        record_label=f"Create {routing_candidate.label}",
        role=routing_candidate.role,
        candidate_state="CREATE_CANDIDATE",
        existing_record=False,
        score=round(score, 3),
        matched_keys=list(routing_candidate.matched_keys),
        missing_keys=list(routing_candidate.missing_keys),
        summary=(
            f"No existing {routing_candidate.label.lower()} matched yet. "
            "The captured document keys are strong enough to seed record creation later."
        ),
        reason=(
            f"{routing_candidate.label} can be created if the owning business object is confirmed. "
            f"{routing_candidate.rationale}"
        ),
        create_if_missing=True,
    )


def _append_candidate_if_missing(
    candidates: list[DocumentLinkageCandidateOut],
    candidate: DocumentLinkageCandidateOut,
) -> None:
    candidate_key = (candidate.record_type, candidate.record_id or "", candidate.record_label)
    if any(
        (existing.record_type, existing.record_id or "", existing.record_label) == candidate_key
        for existing in candidates
    ):
        return
    candidates.append(candidate)


def _resolve_linkage_decision(
    *,
    routing_assessment: DocumentRoutingAssessmentOut,
    best_candidate: DocumentLinkageCandidateOut | None,
    candidates: list[DocumentLinkageCandidateOut],
) -> tuple[str, str]:
    if best_candidate is None:
        if routing_assessment.status in {"INSUFFICIENT", "MANUAL_REVIEW"}:
            return "MANUAL_REVIEW", "MANUAL_REVIEW"
        return "CANDIDATE", "REVIEW"

    if not best_candidate.existing_record:
        if routing_assessment.status in {"READY", "PARTIAL"}:
            return "CREATE", "CREATE"
        return "CANDIDATE", "REVIEW"

    identifier_keys = PRIMARY_IDENTIFIER_KEYS_BY_RECORD_TYPE.get(best_candidate.record_type, set())
    matched_identifier = any(key in identifier_keys for key in best_candidate.matched_keys)
    next_same_role_existing_score = max(
        (
            candidate.score
            for candidate in candidates[1:]
            if candidate.existing_record
            and candidate.role == best_candidate.role
        ),
        default=0.0,
    )
    if (
        routing_assessment.status == "READY"
        and best_candidate.role == "PRIMARY"
        and matched_identifier
        and best_candidate.score >= 0.74
    ):
        return "READY", "ATTACH"
    if (
        routing_assessment.status == "READY"
        and best_candidate.score >= 0.82
        and (best_candidate.score - next_same_role_existing_score) >= 0.08
    ):
        return "READY", "ATTACH"
    return "CANDIDATE", "REVIEW"


def _select_best_candidate(candidates: list[DocumentLinkageCandidateOut]) -> DocumentLinkageCandidateOut | None:
    if not candidates:
        return None

    best_overall = candidates[0]
    primary_candidates = [candidate for candidate in candidates if candidate.role == "PRIMARY"]
    if not primary_candidates:
        return best_overall

    best_primary = primary_candidates[0]
    if best_primary.score >= best_overall.score - 0.08:
        return best_primary
    return best_overall


def _apply_candidate_states(
    candidates: list[DocumentLinkageCandidateOut],
    *,
    best_candidate: DocumentLinkageCandidateOut | None,
    status: str,
    recommended_action: str,
    linked_records: list[ResolvedDocumentRecordLink],
) -> None:
    linked_keys = {(link.record_type, link.record_id) for link in linked_records}
    for candidate in candidates:
        if candidate.record_id is not None and (candidate.record_type, candidate.record_id) in linked_keys:
            candidate.candidate_state = "ALREADY_LINKED"
            continue
        if not candidate.existing_record:
            candidate.candidate_state = "CREATE_CANDIDATE"
            continue
        if candidate is best_candidate and status == "READY" and recommended_action == "ATTACH":
            candidate.candidate_state = "ATTACH_READY"
            continue
        candidate.candidate_state = "ATTACH_REVIEW"


def _build_assessment_reasons(
    *,
    routing_assessment: DocumentRoutingAssessmentOut,
    best_candidate: DocumentLinkageCandidateOut | None,
    unsupported_targets: list[str],
    review_status: str,
    linked_records: list[ResolvedDocumentRecordLink],
) -> list[str]:
    reasons: list[str] = []
    if linked_records and best_candidate is not None:
        reasons.append(f"Document is already linked to {best_candidate.record_label}.")
    elif best_candidate is None:
        reasons.append("No concrete system records matched the extracted document identifiers.")
    elif best_candidate.existing_record:
        reasons.append(
            f"Best existing match is {best_candidate.record_label} via {_render_keys(best_candidate.matched_keys)}."
        )
    else:
        reasons.append(
            f"No existing {best_candidate.record_type.replace('_', ' ').lower()} matched, so creation is the current best next step."
        )

    if unsupported_targets:
        reasons.append(
            f"Lookup scaffolding is not implemented yet for {', '.join(target.lower() for target in unsupported_targets[:3])}."
        )

    if review_status != "VERIFIED":
        reasons.append("Document review is not verified yet, so linkage remains advisory.")

    reasons.extend(routing_assessment.reasons[:2])
    return reasons[:4]


def _score_existing_candidate(
    *,
    record_type: str,
    routing_candidate: DocumentRoutingCandidateOut,
    matched_keys: list[str],
    relevant_keys: list[str],
    exact_identifier_match: bool,
) -> float:
    weight_map = TARGET_KEY_WEIGHTS.get(record_type, {})
    matched_weight = sum(weight_map.get(key, 0.2) for key in matched_keys)
    relevant_weight = sum(weight_map.get(key, 0.2) for key in relevant_keys) or max(matched_weight, 1.0)
    score = routing_candidate.score * 0.45 + (matched_weight / relevant_weight) * 0.47 + (0.08 if exact_identifier_match else 0.0)

    identifier_keys = PRIMARY_IDENTIFIER_KEYS_BY_RECORD_TYPE.get(record_type, set())
    if not any(key in identifier_keys for key in matched_keys):
        score = min(score, 0.58 if len(matched_keys) <= 1 else 0.68)

    return round(min(score, 0.99), 3)


def _lookup_builders() -> dict[str, Callable[[Session, dict[str, str], int], list[_LookupMatch]]]:
    return {
        "TRADE": _lookup_trades,
        "TRADE_CONFIRMATION": _lookup_trade_confirmations,
        "TRADE_INVOICE": _lookup_trade_invoices,
        "TRADE_PAYMENT": _lookup_trade_payments,
        "DELIVERY": _lookup_deliveries,
        "PRICE_INDEX": _lookup_price_indices,
        "PRICE_INDEX_OBSERVATION": _lookup_price_index_observations,
    }


def _lookup_trades(db: Session, field_map: dict[str, str], limit: int) -> list[_LookupMatch]:
    trade_id = _normalized_token(field_map.get("trade_id"))
    external_trade_id = _normalized_token(field_map.get("external_trade_id"))
    counterparty = _normalized_text(field_map.get("counterparty"))
    trade_date = _parse_date(field_map.get("trade_date") or field_map.get("contract_date"))
    commodity = _normalized_text(field_map.get("commodity"))
    delivery_start = _parse_date(field_map.get("delivery_start"))
    delivery_end = _parse_date(field_map.get("delivery_end"))

    conditions = []
    if trade_id:
        conditions.append(func.upper(Trade.trade_id) == trade_id)
    if external_trade_id:
        conditions.append(func.upper(Trade.external_trade_id) == external_trade_id)
    if counterparty and trade_date:
        conditions.append(
            and_(
                _lower_equals(Trade.counterparty, counterparty),
                Trade.trade_date == trade_date,
            )
        )
    if counterparty and commodity:
        conditions.append(
            and_(
                _lower_equals(Trade.counterparty, counterparty),
                _lower_equals(Trade.commodity, commodity),
            )
        )
    if counterparty and delivery_start and delivery_end:
        conditions.append(
            and_(
                _lower_equals(Trade.counterparty, counterparty),
                Trade.delivery_start == delivery_start,
                Trade.delivery_end == delivery_end,
            )
        )
    if not conditions:
        return []

    rows = db.execute(
        select(Trade)
        .where(or_(*conditions))
        .order_by(*trade_recency_order())
        .limit(limit)
    ).scalars().all()

    matches: list[_LookupMatch] = []
    for trade in rows:
        matched_keys: list[str] = []
        if trade_id and _normalized_token(trade.trade_id) == trade_id:
            matched_keys.append("trade_id")
        if external_trade_id and _normalized_token(trade.external_trade_id) == external_trade_id:
            matched_keys.append("external_trade_id")
        if counterparty and _normalized_text(trade.counterparty) == counterparty:
            matched_keys.append("counterparty")
        if commodity and _normalized_text(trade.commodity) == commodity:
            matched_keys.append("commodity")
        if trade_date and _same_date(trade.trade_date, trade_date):
            matched_keys.append("trade_date")
        if delivery_start and _same_date(trade.delivery_start, delivery_start):
            matched_keys.append("delivery_start")
        if delivery_end and _same_date(trade.delivery_end, delivery_end):
            matched_keys.append("delivery_end")
        if not matched_keys:
            continue

        summary_parts = [
            f"Counterparty {trade.counterparty}" if trade.counterparty else None,
            trade.commodity,
            trade.trade_date.isoformat() if trade.trade_date is not None else None,
            trade.status,
        ]
        matches.append(
            _LookupMatch(
                record_id=trade.trade_id,
                record_label=f"Trade {trade.trade_id}",
                summary=" • ".join(part for part in summary_parts if part),
                matched_keys=matched_keys,
                exact_identifier_match=bool({"trade_id", "external_trade_id"} & set(matched_keys)),
            )
        )
    return matches


def _lookup_trade_confirmations(db: Session, field_map: dict[str, str], limit: int) -> list[_LookupMatch]:
    confirmation_number = _normalized_token(field_map.get("confirmation_number"))
    trade_id = _normalized_token(field_map.get("trade_id"))
    if not confirmation_number and not trade_id:
        return []

    conditions = []
    if confirmation_number:
        conditions.append(func.upper(TradeConfirmation.confirmation_number) == confirmation_number)
    if trade_id:
        conditions.append(func.upper(TradeConfirmation.trade_id) == trade_id)

    rows = db.execute(
        select(TradeConfirmation)
        .where(or_(*conditions))
        .order_by(TradeConfirmation.updated_at.desc(), TradeConfirmation.id.desc())
        .limit(limit)
    ).scalars().all()

    matches: list[_LookupMatch] = []
    for confirmation in rows:
        matched_keys: list[str] = []
        if confirmation_number and _normalized_token(confirmation.confirmation_number) == confirmation_number:
            matched_keys.append("confirmation_number")
        if trade_id and _normalized_token(confirmation.trade_id) == trade_id:
            matched_keys.append("trade_id")
        if not matched_keys:
            continue
        matches.append(
            _LookupMatch(
                record_id=str(confirmation.id),
                record_label=f"Confirmation {confirmation.confirmation_number}",
                summary=f"Trade {confirmation.trade_id} • {confirmation.status}",
                matched_keys=matched_keys,
                exact_identifier_match="confirmation_number" in matched_keys,
            )
        )
    return matches


def _lookup_trade_invoices(db: Session, field_map: dict[str, str], limit: int) -> list[_LookupMatch]:
    invoice_number = _normalized_token(field_map.get("invoice_number"))
    trade_id = _normalized_token(field_map.get("trade_id"))
    delivery_id = _normalized_token(field_map.get("delivery_id"))
    counterparty = _normalized_text(field_map.get("counterparty"))
    invoice_date = _parse_date(field_map.get("invoice_date"))
    due_date = _parse_date(field_map.get("due_date"))
    total_amount = _parse_decimal(field_map.get("total_amount"))

    conditions = []
    if invoice_number:
        conditions.append(func.upper(TradeInvoice.invoice_number) == invoice_number)
    if trade_id:
        conditions.append(func.upper(TradeInvoice.trade_id) == trade_id)
    if delivery_id:
        conditions.append(func.upper(TradeInvoice.delivery_id) == delivery_id)
    if not conditions:
        return []

    rows = db.execute(
        select(TradeInvoice, Trade)
        .join(Trade, Trade.trade_id == TradeInvoice.trade_id)
        .where(or_(*conditions))
        .order_by(TradeInvoice.updated_at.desc(), TradeInvoice.id.desc())
        .limit(limit)
    ).all()

    matches: list[_LookupMatch] = []
    for invoice, trade in rows:
        matched_keys: list[str] = []
        if invoice_number and _normalized_token(invoice.invoice_number) == invoice_number:
            matched_keys.append("invoice_number")
        if trade_id and _normalized_token(invoice.trade_id) == trade_id:
            matched_keys.append("trade_id")
        if delivery_id and _normalized_token(invoice.delivery_id) == delivery_id:
            matched_keys.append("delivery_id")
        if counterparty and _normalized_text(trade.counterparty) == counterparty:
            matched_keys.append("counterparty")
        if invoice_date and _same_date(invoice.issued_at, invoice_date):
            matched_keys.append("invoice_date")
        if due_date and _same_date(invoice.due_at, due_date):
            matched_keys.append("due_date")
        if total_amount is not None and _same_decimal(invoice.invoice_amount, total_amount):
            matched_keys.append("total_amount")
        if not matched_keys:
            continue

        matches.append(
            _LookupMatch(
                record_id=str(invoice.id),
                record_label=f"Invoice {invoice.invoice_number}",
                summary=(
                    f"Trade {invoice.trade_id} • {invoice.status} • "
                    f"{invoice.invoice_currency_code} {invoice.invoice_amount}"
                ),
                matched_keys=matched_keys,
                exact_identifier_match="invoice_number" in matched_keys,
            )
        )
    return matches


def _lookup_trade_payments(db: Session, field_map: dict[str, str], limit: int) -> list[_LookupMatch]:
    payment_reference = _normalized_token(field_map.get("payment_reference"))
    invoice_number = _normalized_token(field_map.get("invoice_number"))
    trade_id = _normalized_token(field_map.get("trade_id"))
    due_date = _parse_date(field_map.get("due_date"))
    total_amount = _parse_decimal(field_map.get("total_amount"))

    conditions = []
    if payment_reference:
        conditions.append(func.upper(TradePayment.payment_reference) == payment_reference)
    if invoice_number:
        conditions.append(func.upper(TradeInvoice.invoice_number) == invoice_number)
    if trade_id:
        conditions.append(func.upper(TradePayment.trade_id) == trade_id)
    if not conditions:
        return []

    rows = db.execute(
        select(TradePayment, TradeInvoice)
        .join(TradeInvoice, TradeInvoice.id == TradePayment.invoice_id)
        .where(or_(*conditions))
        .order_by(TradePayment.updated_at.desc(), TradePayment.id.desc())
        .limit(limit)
    ).all()

    matches: list[_LookupMatch] = []
    for payment, invoice in rows:
        matched_keys: list[str] = []
        if payment_reference and _normalized_token(payment.payment_reference) == payment_reference:
            matched_keys.append("payment_reference")
        if invoice_number and _normalized_token(invoice.invoice_number) == invoice_number:
            matched_keys.append("invoice_number")
        if trade_id and _normalized_token(payment.trade_id) == trade_id:
            matched_keys.append("trade_id")
        if due_date and _same_date(payment.due_at, due_date):
            matched_keys.append("due_date")
        if total_amount is not None and _same_decimal(payment.payment_amount, total_amount):
            matched_keys.append("total_amount")
        if not matched_keys:
            continue
        matches.append(
            _LookupMatch(
                record_id=str(payment.id),
                record_label=f"Payment {payment.payment_reference}",
                summary=f"Invoice {invoice.invoice_number} • Trade {payment.trade_id} • {payment.status}",
                matched_keys=matched_keys,
                exact_identifier_match=bool({"payment_reference", "invoice_number"} & set(matched_keys)),
            )
        )
    return matches


def _lookup_deliveries(db: Session, field_map: dict[str, str], limit: int) -> list[_LookupMatch]:
    delivery_id = _normalized_token(field_map.get("delivery_id"))
    trade_id = _normalized_token(field_map.get("trade_id"))
    external_trade_id = _normalized_token(field_map.get("external_trade_id"))
    nomination_reference = _normalized_token(field_map.get("nomination_reference"))
    contract_number = _normalized_token(field_map.get("contract_number"))
    pipeline_system = _normalized_text(field_map.get("pipeline_system"))
    carrier_reference = _normalized_token(field_map.get("carrier_reference"))
    asset_reference = _normalized_token(field_map.get("asset_reference"))
    receipt_location_code = _normalized_token(field_map.get("receipt_location_code"))
    delivery_location_code = _normalized_token(field_map.get("delivery_location_code"))
    origin = _normalized_token(field_map.get("origin"))
    destination = _normalized_token(field_map.get("destination"))
    load_date = _parse_date(field_map.get("load_date") or field_map.get("confirmation_date"))

    conditions = []
    if delivery_id:
        conditions.append(func.upper(DeliveryObligation.delivery_id) == delivery_id)
    if trade_id:
        conditions.append(func.upper(DeliveryObligation.trade_id) == trade_id)
    if external_trade_id:
        conditions.append(func.upper(DeliveryObligation.external_trade_id) == external_trade_id)
    if nomination_reference:
        conditions.append(func.upper(DeliveryPipelineDetail.nomination_reference) == nomination_reference)
    if contract_number:
        conditions.append(func.upper(DeliveryPipelineDetail.contract_number) == contract_number)
    if carrier_reference:
        conditions.append(func.upper(DeliveryLogisticsDetail.carrier_reference) == carrier_reference)
    if asset_reference:
        conditions.append(func.upper(DeliveryLogisticsDetail.asset_reference) == asset_reference)
    if not conditions:
        return []

    rows = db.execute(
        select(DeliveryObligation, DeliveryLogisticsDetail, DeliveryPipelineDetail)
        .outerjoin(DeliveryLogisticsDetail, DeliveryLogisticsDetail.delivery_id == DeliveryObligation.delivery_id)
        .outerjoin(DeliveryPipelineDetail, DeliveryPipelineDetail.delivery_id == DeliveryObligation.delivery_id)
        .where(or_(*conditions))
        .order_by(DeliveryObligation.updated_at.desc(), DeliveryObligation.delivery_id.asc())
        .limit(limit)
    ).all()

    matches: list[_LookupMatch] = []
    for delivery, logistics_detail, pipeline_detail in rows:
        matched_keys: list[str] = []
        if delivery_id and _normalized_token(delivery.delivery_id) == delivery_id:
            matched_keys.append("delivery_id")
        if trade_id and _normalized_token(delivery.trade_id) == trade_id:
            matched_keys.append("trade_id")
        if external_trade_id and _normalized_token(delivery.external_trade_id) == external_trade_id:
            matched_keys.append("external_trade_id")
        if nomination_reference and _normalized_token(_getattr(pipeline_detail, "nomination_reference")) == nomination_reference:
            matched_keys.append("nomination_reference")
        if contract_number and _normalized_token(_getattr(pipeline_detail, "contract_number")) == contract_number:
            matched_keys.append("contract_number")
        if pipeline_system and _normalized_text(_getattr(pipeline_detail, "pipeline_system")) == pipeline_system:
            matched_keys.append("pipeline_system")
        if carrier_reference and _normalized_token(_getattr(logistics_detail, "carrier_reference")) == carrier_reference:
            matched_keys.append("carrier_reference")
        if asset_reference and _normalized_token(_getattr(logistics_detail, "asset_reference")) == asset_reference:
            matched_keys.append("asset_reference")
        if receipt_location_code and _normalized_token(_getattr(pipeline_detail, "receipt_location_code")) == receipt_location_code:
            matched_keys.append("receipt_location_code")
        if delivery_location_code and _normalized_token(_getattr(pipeline_detail, "delivery_location_code")) == delivery_location_code:
            matched_keys.append("delivery_location_code")
        if origin and _normalized_token(_getattr(logistics_detail, "origin_location_code")) == origin:
            matched_keys.append("origin")
        if destination and _normalized_token(_getattr(logistics_detail, "destination_location_code")) == destination:
            matched_keys.append("destination")
        if load_date and (_same_date(delivery.delivery_start, load_date) or _same_date(delivery.delivery_end, load_date)):
            matched_keys.append("load_date")
        if not matched_keys:
            continue

        reference = _getattr(pipeline_detail, "nomination_reference") or _getattr(logistics_detail, "carrier_reference")
        summary_parts = [
            f"Trade {delivery.trade_id}",
            delivery.transport_mode,
            delivery.counterparty,
            reference,
        ]
        matches.append(
            _LookupMatch(
                record_id=delivery.delivery_id,
                record_label=f"Delivery {delivery.delivery_id}",
                summary=" • ".join(part for part in summary_parts if part),
                matched_keys=matched_keys,
                exact_identifier_match=bool(PRIMARY_IDENTIFIER_KEYS_BY_RECORD_TYPE["DELIVERY"] & set(matched_keys)),
            )
        )
    return matches


def _lookup_price_indices(db: Session, field_map: dict[str, str], limit: int) -> list[_LookupMatch]:
    price_index_code = _normalized_token(field_map.get("price_index_code"))
    source_provider = _normalized_token(field_map.get("source_provider"))
    commodity = _normalized_token(field_map.get("commodity"))
    market = _normalized_text(field_map.get("market"))
    location = _normalized_token(field_map.get("location"))
    currency = _normalized_token(field_map.get("currency"))
    unit = _normalized_token(field_map.get("unit"))

    conditions = []
    if price_index_code:
        conditions.append(func.upper(ReferencePriceIndex.code) == price_index_code)
    if source_provider and commodity:
        conditions.append(
            and_(
                func.upper(ReferencePriceIndex.provider) == source_provider,
                func.upper(ReferencePriceIndex.commodity_code) == commodity,
            )
        )
    if source_provider and location:
        conditions.append(
            and_(
                func.upper(ReferencePriceIndex.provider) == source_provider,
                func.upper(func.coalesce(ReferencePriceIndex.location_code, "")) == location,
            )
        )
    if market and commodity:
        conditions.append(
            and_(
                _lower_equals(ReferencePriceIndex.market, market),
                func.upper(ReferencePriceIndex.commodity_code) == commodity,
            )
        )
    if not conditions:
        return []

    rows = db.execute(
        select(ReferencePriceIndex)
        .where(or_(*conditions))
        .order_by(ReferencePriceIndex.provider.asc(), ReferencePriceIndex.code.asc())
        .limit(limit)
    ).scalars().all()

    matches: list[_LookupMatch] = []
    for price_index in rows:
        matched_keys: list[str] = []
        if price_index_code and _normalized_token(price_index.code) == price_index_code:
            matched_keys.append("price_index_code")
        if source_provider and _normalized_token(price_index.provider) == source_provider:
            matched_keys.append("source_provider")
        if commodity and _normalized_token(price_index.commodity_code) == commodity:
            matched_keys.append("commodity")
        if market and _normalized_text(price_index.market) == market:
            matched_keys.append("market")
        if location and _normalized_token(price_index.location_code) == location:
            matched_keys.append("location")
        if currency and _normalized_token(price_index.currency_code) == currency:
            matched_keys.append("currency")
        if unit and _normalized_token(price_index.unit_code) == unit:
            matched_keys.append("unit")
        if not matched_keys:
            continue

        summary_parts = [
            price_index.provider,
            price_index.commodity_code,
            price_index.market,
            price_index.location_code,
        ]
        matches.append(
            _LookupMatch(
                record_id=price_index.code,
                record_label=f"Price Index {price_index.code}",
                summary=" • ".join(part for part in summary_parts if part),
                matched_keys=matched_keys,
                exact_identifier_match="price_index_code" in matched_keys,
            )
        )
    return matches


def _lookup_price_index_observations(db: Session, field_map: dict[str, str], limit: int) -> list[_LookupMatch]:
    price_index_code = _normalized_token(field_map.get("price_index_code"))
    source_provider = _normalized_token(field_map.get("source_provider"))
    source_series_id = _normalized_token(field_map.get("source_series_id"))
    observation_date = _parse_date(field_map.get("observation_date") or field_map.get("publication_date"))
    publication_date = _parse_date(field_map.get("publication_date"))
    price = _parse_decimal(field_map.get("price"))
    currency = _normalized_token(field_map.get("currency"))
    unit = _normalized_token(field_map.get("unit"))

    conditions = []
    if price_index_code and observation_date:
        conditions.append(
            and_(
                func.upper(PriceIndexObservation.price_index_code) == price_index_code,
                PriceIndexObservation.observation_date == observation_date,
            )
        )
    if price_index_code and source_provider:
        conditions.append(
            and_(
                func.upper(PriceIndexObservation.price_index_code) == price_index_code,
                func.upper(PriceIndexObservation.source_provider) == source_provider,
            )
        )
    if source_provider and source_series_id:
        conditions.append(
            and_(
                func.upper(PriceIndexObservation.source_provider) == source_provider,
                func.upper(PriceIndexObservation.source_series_id) == source_series_id,
            )
        )
    if not conditions:
        return []

    rows = db.execute(
        select(PriceIndexObservation)
        .where(or_(*conditions))
        .order_by(PriceIndexObservation.observation_date.desc(), PriceIndexObservation.id.desc())
        .limit(limit)
    ).scalars().all()

    matches: list[_LookupMatch] = []
    for observation in rows:
        matched_keys: list[str] = []
        if price_index_code and _normalized_token(observation.price_index_code) == price_index_code:
            matched_keys.append("price_index_code")
        if observation_date and _same_date(observation.observation_date, observation_date):
            matched_keys.append("observation_date")
        if publication_date and _same_date(observation.source_published_at, publication_date):
            matched_keys.append("publication_date")
        if source_provider and _normalized_token(observation.source_provider) == source_provider:
            matched_keys.append("source_provider")
        if source_series_id and _normalized_token(observation.source_series_id) == source_series_id:
            matched_keys.append("source_series_id")
        if price is not None and _same_decimal(observation.value, price):
            matched_keys.append("price")
        if currency and _normalized_token(observation.currency_code) == currency:
            matched_keys.append("currency")
        if unit and _normalized_token(observation.unit_code) == unit:
            matched_keys.append("unit")
        if not matched_keys:
            continue

        matches.append(
            _LookupMatch(
                record_id=str(observation.id),
                record_label=f"Price Observation {observation.price_index_code} {observation.observation_date.isoformat()}",
                summary=(
                    f"{observation.source_provider} • {observation.source_series_id} • "
                    f"{observation.value} {observation.currency_code or ''}/{observation.unit_code}"
                ),
                matched_keys=matched_keys,
                exact_identifier_match=bool({"price_index_code", "observation_date", "source_series_id"} & set(matched_keys)),
            )
        )
    return matches


def _lower_equals(column: object, value: str):
    return func.lower(func.coalesce(column, "")) == value


def _normalized_text(value: object | None) -> str | None:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    return " ".join(cleaned.casefold().split())


def _normalized_token(value: object | None) -> str | None:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    return " ".join(cleaned.upper().split())


def _parse_date(value: object | None) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    candidate = cleaned.strip()
    if "T" in candidate:
        candidate = candidate.split("T", 1)[0]
    try:
        return date.fromisoformat(candidate)
    except ValueError:
        return None


def _parse_decimal(value: object | None) -> Decimal | None:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    normalized = cleaned.replace(",", "").replace("$", "")
    try:
        return Decimal(normalized)
    except InvalidOperation:
        return None


def _same_date(left: object | None, right: date | None) -> bool:
    if right is None:
        return False
    return _parse_date(left) == right


def _same_decimal(left: object | None, right: Decimal | None) -> bool:
    if right is None:
        return False
    if left is None:
        return False
    try:
        left_value = Decimal(str(left))
    except InvalidOperation:
        return False
    return abs(left_value - right) <= Decimal("0.01")


def _getattr(instance: object | None, attribute: str) -> object | None:
    if instance is None:
        return None
    return getattr(instance, attribute)


def _render_keys(keys: list[str]) -> str:
    return ", ".join(keys) if keys else "supporting context"
