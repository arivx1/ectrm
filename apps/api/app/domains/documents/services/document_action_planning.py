from __future__ import annotations

from decimal import Decimal, InvalidOperation

from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentActionPlanOut
from apps.api.app.schemas.document import DocumentActionRecordRefOut
from apps.api.app.schemas.document import DocumentLinkageAssessmentOut
from apps.api.app.schemas.document import DocumentLinkageCandidateOut

from .document_ingestion_common import clean_optional_text

ACTION_OPERATION_BY_TARGET: dict[str, str] = {
    "TRADE_CONFIRMATION": "create_trade_confirmation",
    "TRADE_INVOICE": "issue_trade_invoice",
    "TRADE_PAYMENT": "create_trade_payment",
    "QUALITY_SPECIFICATION": "create_quality_specification",
}

ACTION_PREFERRED_TARGETS_BY_KIND: dict[str, tuple[str, ...]] = {
    "DEAL_RECAP": ("TRADE", "TRADE_WORKFLOW_ITEM"),
    "TRADE_CONFIRMATION": ("TRADE_CONFIRMATION", "TRADE"),
    "INVOICE": ("TRADE_INVOICE", "TRADE"),
    "PAYMENT_ADVICE": ("TRADE_PAYMENT", "TRADE_INVOICE"),
    "DEMURRAGE_CLAIM": ("TRADE_INVOICE", "DELIVERY"),
    "LETTER_OF_CREDIT": ("TRADE", "SETTLEMENT_ACCOUNT"),
    "FORCE_MAJEURE_NOTICE": ("COMPLIANCE_RECORD", "TRADE"),
    "QUALITY_SPECIFICATION": ("QUALITY_SPECIFICATION", "TRADE"),
    "NOMINATION": ("DELIVERY", "TRADE"),
    "CURTAILMENT_NOTICE": ("DELIVERY", "TRADE"),
    "PIPELINE_STATEMENT": ("DELIVERY", "TRADE"),
    "DISPATCH_NOTICE": ("DELIVERY", "TRADE"),
    "OUTAGE_NOTICE": ("DELIVERY", "TRADE"),
    "STORAGE_STATEMENT": ("DELIVERY", "INVENTORY_POSITION"),
    "PRICE_PUBLICATION": ("PRICE_INDEX_OBSERVATION", "PRICE_INDEX"),
}

CREATE_OWNER_REQUIREMENTS: dict[str, tuple[str, ...]] = {
    "TRADE_CONFIRMATION": ("TRADE",),
    "TRADE_INVOICE": ("TRADE",),
    "TRADE_PAYMENT": ("TRADE_INVOICE",),
    "QUALITY_SPECIFICATION": ("TRADE",),
}

CREATE_OWNER_REQUIRED: set[str] = {
    "TRADE_CONFIRMATION",
    "TRADE_INVOICE",
    "TRADE_PAYMENT",
}


def build_document_action_plan(
    *,
    document_id: str,
    pages: list[DocumentIngestionPage],
    review_status: str,
    linkage_assessment: DocumentLinkageAssessmentOut,
) -> DocumentActionPlanOut:
    if not pages:
        return DocumentActionPlanOut(
            status="BLOCKED",
            action_type="MANUAL_REVIEW",
            operation_type="manual_review_document_linkage",
            candidate_state="MANUAL_REVIEW",
            title="Manual Review Required",
            description="No pages are available yet, so the document cannot be routed into a downstream record action.",
            confidence=0.0,
            missing_evidence=["analyzed_pages"],
            reasons=["At least one analyzed page is required before planning a document action."],
            payload={"document_id": document_id},
        )

    dominant_kind = _dominant_document_kind(pages)
    candidates = list(linkage_assessment.candidates)
    if not candidates:
        return _manual_review_plan(
            document_id=document_id,
            confidence=linkage_assessment.confidence,
            reasons=[
                "No record candidates are available yet.",
                *linkage_assessment.reasons[:2],
            ],
        )

    candidate_by_type = _candidate_map(candidates, existing_only=True)
    create_candidate_by_type = _candidate_map(candidates, existing_only=False, create_only=True)
    preferred_types = ACTION_PREFERRED_TARGETS_BY_KIND.get(
        dominant_kind,
        tuple(dict.fromkeys(candidate.record_type for candidate in candidates)),
    )

    for record_type in preferred_types:
        existing_candidate = candidate_by_type.get(record_type)
        if existing_candidate is not None:
            return build_document_action_plan_for_candidate(
                document_id=document_id,
                pages=pages,
                review_status=review_status,
                linkage_assessment=linkage_assessment,
                selected_candidate=existing_candidate,
            )

        create_candidate = create_candidate_by_type.get(record_type)
        if create_candidate is not None:
            return build_document_action_plan_for_candidate(
                document_id=document_id,
                pages=pages,
                review_status=review_status,
                linkage_assessment=linkage_assessment,
                selected_candidate=create_candidate,
            )

    for candidate in candidates:
        if candidate.existing_record:
            return build_document_action_plan_for_candidate(
                document_id=document_id,
                pages=pages,
                review_status=review_status,
                linkage_assessment=linkage_assessment,
                selected_candidate=candidate,
            )

    for candidate in candidates:
        if not candidate.existing_record and candidate.create_if_missing:
            return build_document_action_plan_for_candidate(
                document_id=document_id,
                pages=pages,
                review_status=review_status,
                linkage_assessment=linkage_assessment,
                selected_candidate=candidate,
            )

    return _manual_review_plan(
        document_id=document_id,
        confidence=linkage_assessment.confidence,
        reasons=linkage_assessment.reasons or ["The document still needs manual action planning."],
    )


def build_document_action_plan_for_candidate(
    *,
    document_id: str,
    pages: list[DocumentIngestionPage],
    review_status: str,
    linkage_assessment: DocumentLinkageAssessmentOut,
    selected_candidate: DocumentLinkageCandidateOut,
) -> DocumentActionPlanOut:
    candidates = list(linkage_assessment.candidates)
    if selected_candidate.existing_record:
        return _build_attach_plan(
            document_id=document_id,
            candidate=selected_candidate,
            review_status=review_status,
            linkage_assessment=linkage_assessment,
        )

    if selected_candidate.create_if_missing:
        return _build_create_plan(
            document_id=document_id,
            candidate=selected_candidate,
            review_status=review_status,
            linkage_assessment=linkage_assessment,
            field_map=_build_document_field_map(pages),
            all_candidates=candidates,
        )

    return _manual_review_plan(
        document_id=document_id,
        confidence=linkage_assessment.confidence,
        reasons=[
            f"Selected candidate {selected_candidate.record_label} is not eligible for attach or create.",
            *linkage_assessment.reasons[:2],
        ],
    )


def _build_attach_plan(
    *,
    document_id: str,
    candidate: DocumentLinkageCandidateOut,
    review_status: str,
    linkage_assessment: DocumentLinkageAssessmentOut,
) -> DocumentActionPlanOut:
    status = "READY" if review_status == "VERIFIED" else "REVIEW"
    action_record = _action_record(candidate)
    candidate_state = _attach_candidate_state(candidate=candidate, status=status)
    reasons = [
        f"{candidate.record_label} is the strongest existing {candidate.record_type.replace('_', ' ').lower()} match.",
        candidate.reason,
        *linkage_assessment.reasons[:2],
    ]
    if review_status != "VERIFIED":
        reasons.insert(0, "Verify the document before executing the attach decision.")

    return DocumentActionPlanOut(
        status=status,
        action_type="ATTACH_EXISTING_RECORD",
        operation_type="link_document_to_record",
        candidate_state=candidate_state,
        title=f"Attach To {candidate.record_label}",
        description=(
            f"Use the current document as supporting evidence for {candidate.record_label}. "
            "This is the best downstream attachment target based on the captured identifiers."
        ),
        confidence=round(candidate.score, 3),
        target=action_record,
        owner=None,
        missing_evidence=_candidate_missing_evidence(candidate),
        reasons=reasons[:4],
        payload={
            "document_id": document_id,
            "target_record_type": candidate.record_type,
            "target_record_id": candidate.record_id,
        },
    )


def _build_create_plan(
    *,
    document_id: str,
    candidate: DocumentLinkageCandidateOut,
    review_status: str,
    linkage_assessment: DocumentLinkageAssessmentOut,
    field_map: dict[str, str],
    all_candidates: list[DocumentLinkageCandidateOut],
) -> DocumentActionPlanOut:
    owner_candidate = _resolve_owner_candidate(candidate.record_type, all_candidates=all_candidates)
    owner_required = candidate.record_type in CREATE_OWNER_REQUIRED
    required_owner_record_types = list(CREATE_OWNER_REQUIREMENTS.get(candidate.record_type, ()))
    if owner_required and owner_candidate is None:
        return DocumentActionPlanOut(
            status="BLOCKED",
            action_type="MANUAL_REVIEW",
            operation_type="manual_review_document_linkage",
            candidate_state="OWNER_REQUIRED",
            title=f"Resolve Owner Before Creating {candidate.record_label.replace('Create ', '')}",
            description=(
                f"The document suggests creating a {candidate.record_type.replace('_', ' ').lower()}, "
                "but the owning trade or invoice anchor is not matched strongly enough yet."
            ),
            confidence=round(candidate.score, 3),
            target=_action_record(candidate),
            owner=None,
            required_owner_record_types=required_owner_record_types,
            missing_evidence=_owner_missing_evidence(required_owner_record_types, candidate),
            reasons=[
                f"{candidate.record_label} is the leading creation candidate.",
                "A confirmed owner record is required before creation can proceed.",
                *linkage_assessment.reasons[:2],
            ][:4],
            payload={
                "document_id": document_id,
                "target_record_type": candidate.record_type,
            },
        )

    status = "READY" if review_status == "VERIFIED" else "REVIEW"
    owner_record = _action_record(owner_candidate) if owner_candidate is not None else None
    target_label = candidate.record_label.replace("Create ", "")
    title = (
        f"Create {target_label} Under {owner_candidate.record_label}"
        if owner_candidate is not None
        else f"Create {target_label} From Document"
    )
    description = (
        f"Create a new {candidate.record_type.replace('_', ' ').lower()} using this document as the source of business evidence."
    )
    if owner_candidate is not None:
        description += f" The matched {owner_candidate.record_label.lower()} should act as the owning anchor."

    reasons = [
        candidate.reason,
        (
            f"Use {owner_candidate.record_label} as the owning record."
            if owner_candidate is not None
            else "This record type can be created without a parent match."
        ),
        *linkage_assessment.reasons[:2],
    ]
    if review_status != "VERIFIED":
        reasons.insert(0, "Verify the document before executing the create decision.")

    return DocumentActionPlanOut(
        status=status,
        action_type="CREATE_RECORD_FROM_DOCUMENT",
        operation_type=ACTION_OPERATION_BY_TARGET.get(candidate.record_type, "create_record_from_document"),
        candidate_state="CREATE_CANDIDATE",
        title=title,
        description=description,
        confidence=round(candidate.score, 3),
        target=_action_record(candidate),
        owner=owner_record,
        required_owner_record_types=required_owner_record_types,
        missing_evidence=_candidate_missing_evidence(candidate),
        reasons=reasons[:4],
        payload=_build_create_payload(
            document_id=document_id,
            target_candidate=candidate,
            owner_candidate=owner_candidate,
            field_map=field_map,
        ),
    )


def _manual_review_plan(
    *,
    document_id: str,
    confidence: float,
    reasons: list[str],
) -> DocumentActionPlanOut:
    return DocumentActionPlanOut(
        status="BLOCKED",
        action_type="MANUAL_REVIEW",
        operation_type="manual_review_document_linkage",
        candidate_state="MANUAL_REVIEW",
        title="Manual Review Required",
        description="The document does not yet have a safe attach-or-create action. A reviewer should resolve the linkage first.",
        confidence=round(confidence, 3),
        missing_evidence=_normalize_missing_evidence(reasons),
        reasons=reasons[:4],
        payload={"document_id": document_id},
    )


def _build_create_payload(
    *,
    document_id: str,
    target_candidate: DocumentLinkageCandidateOut,
    owner_candidate: DocumentLinkageCandidateOut | None,
    field_map: dict[str, str],
) -> dict[str, object]:
    payload: dict[str, object] = {
        "document_id": document_id,
        "target_record_type": target_candidate.record_type,
    }
    if owner_candidate is not None:
        payload["owner_record_type"] = owner_candidate.record_type
        payload["owner_record_id"] = owner_candidate.record_id

    if target_candidate.record_type == "TRADE_CONFIRMATION":
        payload.update(
            {
                "trade_id": owner_candidate.record_id if owner_candidate is not None else field_map.get("trade_id"),
                "source_document_id": document_id,
                "confirmation_number": field_map.get("confirmation_number") or field_map.get("broker_confirmation_number"),
                "trade_date": field_map.get("trade_date"),
                "counterparty": field_map.get("counterparty"),
            }
        )
        return payload

    if target_candidate.record_type == "TRADE_INVOICE":
        payload.update(
            {
                "trade_id": owner_candidate.record_id if owner_candidate is not None else field_map.get("trade_id"),
                "invoice_number": field_map.get("invoice_number"),
                "invoice_date": field_map.get("invoice_date"),
                "due_at": field_map.get("due_date"),
                "invoice_amount": _normalized_amount(field_map.get("total_amount")),
                "counterparty": field_map.get("counterparty"),
            }
        )
        if field_map.get("delivery_id"):
            payload["delivery_id"] = field_map.get("delivery_id")
        return payload

    if target_candidate.record_type == "TRADE_PAYMENT":
        advice_date = field_map.get("advice_date")
        payload.update(
            {
                "invoice_id": owner_candidate.record_id if owner_candidate is not None else None,
                "trade_id": owner_candidate.record_id if owner_candidate and owner_candidate.record_type == "TRADE" else field_map.get("trade_id"),
                "invoice_number": field_map.get("invoice_number"),
                "payment_reference": field_map.get("payment_reference"),
                "payment_amount": _normalized_amount(field_map.get("amount") or field_map.get("total_amount")),
                "payment_currency_code": field_map.get("currency"),
                "due_at": field_map.get("due_date") or advice_date,
                "received_at": advice_date,
            }
        )
        return payload

    if target_candidate.record_type == "QUALITY_SPECIFICATION":
        payload.update(
            {
                "trade_id": owner_candidate.record_id if owner_candidate is not None else field_map.get("trade_id"),
                "spec_name": field_map.get("spec_name"),
                "spec_version": field_map.get("spec_version"),
                "effective_date": field_map.get("effective_date"),
                "product": field_map.get("product"),
                "counterparty": field_map.get("counterparty"),
            }
        )
        return payload

    payload["captured_fields"] = {
        key: value
        for key, value in field_map.items()
        if key in set(target_candidate.matched_keys + target_candidate.missing_keys)
    }
    return payload


def _resolve_owner_candidate(
    target_record_type: str,
    *,
    all_candidates: list[DocumentLinkageCandidateOut],
) -> DocumentLinkageCandidateOut | None:
    allowed_owner_types = CREATE_OWNER_REQUIREMENTS.get(target_record_type, ())
    if not allowed_owner_types:
        return None
    for owner_type in allowed_owner_types:
        for candidate in all_candidates:
            if candidate.existing_record and candidate.record_type == owner_type:
                return candidate
    return None


def _candidate_map(
    candidates: list[DocumentLinkageCandidateOut],
    *,
    existing_only: bool,
    create_only: bool = False,
) -> dict[str, DocumentLinkageCandidateOut]:
    mapped: dict[str, DocumentLinkageCandidateOut] = {}
    for candidate in candidates:
        if existing_only and not candidate.existing_record:
            continue
        if create_only and (candidate.existing_record or not candidate.create_if_missing):
            continue
        mapped.setdefault(candidate.record_type, candidate)
    return mapped


def _dominant_document_kind(pages: list[DocumentIngestionPage]) -> str:
    counts: dict[str, int] = {}
    for page in pages:
        if page.document_kind in {"UNKNOWN", "OTHER"}:
            continue
        counts[page.document_kind] = counts.get(page.document_kind, 0) + 1
    if not counts:
        return "UNKNOWN"
    return max(counts.items(), key=lambda item: (item[1], item[0]))[0]


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


def _action_record(candidate: DocumentLinkageCandidateOut) -> DocumentActionRecordRefOut:
    return DocumentActionRecordRefOut(
        record_type=candidate.record_type,
        record_id=candidate.record_id,
        record_label=candidate.record_label,
        existing_record=candidate.existing_record,
    )


def _attach_candidate_state(*, candidate: DocumentLinkageCandidateOut, status: str) -> str:
    if candidate.candidate_state == "ALREADY_LINKED":
        return "ALREADY_LINKED"
    if status == "READY":
        return "ATTACH_READY"
    return "ATTACH_REVIEW"


def _candidate_missing_evidence(candidate: DocumentLinkageCandidateOut) -> list[str]:
    return [key for key in candidate.missing_keys if key not in set(candidate.matched_keys)]


def _owner_missing_evidence(
    required_owner_record_types: list[str],
    candidate: DocumentLinkageCandidateOut,
) -> list[str]:
    owner_items = [f"owner:{record_type}" for record_type in required_owner_record_types]
    return [*owner_items, *_candidate_missing_evidence(candidate)]


def _normalize_missing_evidence(reasons: list[str]) -> list[str]:
    if not reasons:
        return []
    normalized: list[str] = []
    for reason in reasons:
        text = clean_optional_text(reason)
        if text and text not in normalized:
            normalized.append(text)
    return normalized[:4]


def _normalized_amount(value: str | None) -> str | None:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    normalized = cleaned.replace(",", "").replace("$", "")
    try:
        return str(Decimal(normalized))
    except InvalidOperation:
        return cleaned
