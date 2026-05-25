from __future__ import annotations

from collections import Counter
from typing import Iterable

from apps.api.app.domains.documents.services.schema_registry import get_document_kind_schema
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentRoutingAssessmentOut
from apps.api.app.schemas.document import DocumentRoutingCandidateOut

from .document_ingestion_common import clean_optional_text

ROUTING_STRATEGY_BY_FAMILY = {
    "TRADE_EXECUTION": "TRADE_FIRST",
    "TRADE_RECONCILIATION": "TRADE_FIRST",
    "LOGISTICS": "DELIVERY_FIRST",
    "NETWORK_FLOW": "DELIVERY_FIRST",
    "SETTLEMENT": "SETTLEMENT_FIRST",
    "QUALITY": "ATTACHMENT_FIRST",
    "COMPLIANCE": "ATTACHMENT_FIRST",
    "MARKET_DATA": "MARKET_DATA_FIRST",
    "GENERAL": "MANUAL_REVIEW",
}

ROLE_PRIORITY = {
    "PRIMARY": 0,
    "SECONDARY": 1,
    "REFERENCE": 2,
}

ROLE_SCORE_BONUS = {
    "PRIMARY": 0.12,
    "SECONDARY": 0.03,
    "REFERENCE": -0.02,
}

STRATEGY_KEY_WEIGHTS: dict[str, dict[str, float]] = {
    "TRADE_FIRST": {
        "trade_id": 1.0,
        "external_trade_id": 0.95,
        "confirmation_number": 0.75,
        "contract_number": 0.75,
        "broker_confirmation_number": 0.75,
        "counterparty": 0.45,
        "trade_date": 0.45,
        "contract_date": 0.4,
        "broker": 0.35,
        "account": 0.25,
        "commodity": 0.25,
        "delivery_start": 0.2,
        "delivery_end": 0.2,
        "communication_date": 0.2,
        "recap_number": 0.45,
        "recap_date": 0.45,
        "trader": 0.2,
        "quantity": 0.2,
        "price": 0.2,
        "subject": 0.12,
    },
    "DELIVERY_FIRST": {
        "delivery_id": 1.0,
        "delivery_order_number": 0.92,
        "packing_list_number": 0.9,
        "bill_of_lading_number": 0.92,
        "waybill_number": 0.9,
        "railcar_number": 0.9,
        "ticket_number": 0.9,
        "delivery_confirmation_number": 0.9,
        "notice_number": 0.82,
        "nomination_reference": 0.88,
        "curtailment_notice_number": 0.9,
        "outage_number": 0.88,
        "pipeline_system": 0.6,
        "contract_number": 0.55,
        "carrier_reference": 0.7,
        "customer_reference": 0.58,
        "asset_reference": 0.45,
        "dispatch_number": 0.9,
        "load_date": 0.45,
        "loading_date": 0.45,
        "delivery_date": 0.45,
        "dispatch_date": 0.45,
        "dispatch_start": 0.35,
        "dispatch_end": 0.35,
        "confirmation_date": 0.4,
        "notice_date": 0.35,
        "effective_start": 0.45,
        "effective_end": 0.32,
        "outage_start": 0.45,
        "outage_end": 0.32,
        "origin": 0.35,
        "destination": 0.35,
        "carrier": 0.32,
        "shipper": 0.28,
        "consignee": 0.28,
        "vessel_name": 0.42,
        "voyage_number": 0.42,
        "load_port": 0.35,
        "discharge_port": 0.35,
        "flow_date": 0.45,
        "nomination_date": 0.3,
        "quantity": 0.25,
        "product": 0.25,
        "tare_weight": 0.16,
        "curtailed_quantity": 0.35,
        "issuing_entity": 0.35,
        "facility": 0.35,
        "receipt_location_code": 0.4,
        "delivery_location_code": 0.4,
        "gross_weight": 0.25,
        "net_weight": 0.25,
        "net_quantity": 0.25,
        "trade_id": 0.4,
    },
    "SETTLEMENT_FIRST": {
        "invoice_number": 1.0,
        "payment_reference": 0.95,
        "letter_of_credit_number": 0.95,
        "claim_number": 0.9,
        "force_majeure_notice_number": 0.72,
        "statement_number": 0.8,
        "trade_id": 0.85,
        "delivery_id": 0.55,
        "counterparty": 0.45,
        "account": 0.55,
        "invoice_date": 0.45,
        "due_date": 0.35,
        "statement_date": 0.45,
        "total_amount": 0.45,
        "advice_date": 0.45,
        "claim_date": 0.45,
        "claim_amount": 0.55,
        "amount": 0.55,
        "issuing_bank": 0.45,
        "applicant": 0.35,
        "beneficiary": 0.35,
        "expiry_date": 0.45,
        "event_start": 0.25,
        "event_end": 0.2,
        "currency": 0.2,
    },
    "MARKET_DATA_FIRST": {
        "price_index_code": 1.0,
        "observation_date": 0.9,
        "publication_date": 0.72,
        "source_provider": 0.72,
        "source_series_id": 0.72,
        "publication_reference": 0.55,
        "commodity": 0.42,
        "market": 0.32,
        "location": 0.32,
        "price": 0.45,
        "currency": 0.2,
        "unit": 0.2,
    },
    "ATTACHMENT_FIRST": {
        "delivery_id": 0.95,
        "trade_id": 0.75,
        "sample_id": 0.9,
        "lot_number": 0.8,
        "certificate_number": 0.85,
        "statement_number": 0.6,
        "spec_name": 0.75,
        "spec_version": 0.45,
        "effective_date": 0.3,
        "product": 0.5,
        "sample_date": 0.45,
        "issue_date": 0.4,
        "document_number": 0.75,
        "origin_country": 0.85,
        "bill_of_lading_number": 0.45,
        "inspection_report_number": 0.85,
        "force_majeure_notice_number": 0.85,
        "inspection_date": 0.45,
        "event_start": 0.45,
        "event_end": 0.35,
        "contract_number": 0.45,
        "inspector": 0.45,
        "location": 0.25,
        "affected_location": 0.35,
        "counterparty": 0.35,
        "vessel_name": 0.25,
        "un_number": 0.8,
        "hazard_class": 0.55,
        "carrier_reference": 0.35,
    },
}

TARGET_KEY_WEIGHTS: dict[str, dict[str, float]] = {
    "TRADE": {
        "trade_id": 1.0,
        "external_trade_id": 0.95,
        "counterparty": 0.35,
        "trade_date": 0.35,
        "contract_date": 0.3,
        "commodity": 0.2,
        "delivery_start": 0.2,
        "delivery_end": 0.2,
        "recap_number": 0.42,
        "recap_date": 0.35,
        "trader": 0.18,
        "quantity": 0.16,
        "price": 0.16,
        "broker": 0.15,
        "account": 0.1,
        "delivery_id": 0.1,
    },
    "TRADE_WORKFLOW_ITEM": {
        "trade_id": 0.85,
        "external_trade_id": 0.7,
        "recap_number": 0.6,
        "recap_date": 0.45,
        "subject": 0.35,
        "communication_date": 0.25,
        "counterparty": 0.2,
        "commodity": 0.2,
    },
    "TRADE_CONFIRMATION": {
        "confirmation_number": 1.0,
        "trade_id": 0.9,
        "trade_date": 0.35,
        "counterparty": 0.3,
    },
    "POSITION": {
        "account": 1.0,
        "broker": 0.8,
        "statement_number": 0.55,
        "statement_date": 0.35,
        "period_start": 0.3,
        "period_end": 0.3,
    },
    "DELIVERY_OBLIGATION": {
        "delivery_id": 1.0,
        "delivery_order_number": 0.78,
        "packing_list_number": 0.76,
        "bill_of_lading_number": 0.78,
        "waybill_number": 0.78,
        "railcar_number": 0.78,
        "ticket_number": 0.78,
        "notice_number": 0.72,
        "nomination_reference": 0.88,
        "curtailment_notice_number": 0.84,
        "outage_number": 0.8,
        "dispatch_number": 0.84,
        "contract_number": 0.72,
        "pipeline_system": 0.55,
        "carrier_reference": 0.62,
        "customer_reference": 0.5,
        "load_date": 0.35,
        "loading_date": 0.35,
        "delivery_date": 0.35,
        "dispatch_date": 0.35,
        "dispatch_start": 0.32,
        "dispatch_end": 0.28,
        "confirmation_date": 0.35,
        "flow_date": 0.35,
        "effective_start": 0.35,
        "effective_end": 0.28,
        "outage_start": 0.35,
        "outage_end": 0.28,
        "vessel_name": 0.28,
        "voyage_number": 0.28,
        "load_port": 0.28,
        "discharge_port": 0.28,
        "origin": 0.28,
        "destination": 0.28,
        "carrier": 0.24,
        "shipper": 0.22,
        "consignee": 0.22,
        "receipt_location_code": 0.32,
        "delivery_location_code": 0.32,
        "sample_id": 0.2,
        "lot_number": 0.24,
        "product": 0.2,
        "gross_weight": 0.18,
        "net_weight": 0.18,
        "tare_weight": 0.12,
        "facility": 0.2,
        "issuing_entity": 0.2,
        "curtailed_quantity": 0.24,
        "quantity": 0.24,
        "account": 0.16,
        "period_start": 0.14,
        "period_end": 0.14,
        "trade_id": 0.2,
    },
    "DELIVERY_EVENT": {
        "delivery_confirmation_number": 0.95,
        "bill_of_lading_number": 0.88,
        "waybill_number": 0.86,
        "railcar_number": 0.86,
        "ticket_number": 0.88,
        "notice_number": 0.82,
        "dispatch_number": 0.86,
        "carrier_reference": 0.68,
        "asset_reference": 0.45,
        "load_date": 0.45,
        "dispatch_date": 0.45,
        "dispatch_start": 0.38,
        "dispatch_end": 0.32,
        "confirmation_date": 0.45,
        "notice_date": 0.45,
        "vessel_name": 0.35,
        "voyage_number": 0.35,
        "delivery_id": 0.78,
    },
    "DELIVERY": {
        "delivery_id": 1.0,
        "delivery_order_number": 0.84,
        "packing_list_number": 0.82,
        "bill_of_lading_number": 0.86,
        "waybill_number": 0.84,
        "railcar_number": 0.84,
        "ticket_number": 0.84,
        "delivery_confirmation_number": 0.9,
        "notice_number": 0.78,
        "nomination_reference": 0.88,
        "curtailment_notice_number": 0.84,
        "outage_number": 0.8,
        "dispatch_number": 0.84,
        "contract_number": 0.68,
        "pipeline_system": 0.55,
        "carrier_reference": 0.62,
        "customer_reference": 0.5,
        "load_date": 0.38,
        "loading_date": 0.38,
        "delivery_date": 0.38,
        "dispatch_date": 0.38,
        "dispatch_start": 0.32,
        "dispatch_end": 0.28,
        "confirmation_date": 0.38,
        "flow_date": 0.38,
        "effective_start": 0.35,
        "effective_end": 0.28,
        "outage_start": 0.35,
        "outage_end": 0.28,
        "notice_date": 0.35,
        "vessel_name": 0.3,
        "voyage_number": 0.3,
        "load_port": 0.28,
        "discharge_port": 0.28,
        "origin": 0.28,
        "destination": 0.28,
        "carrier": 0.24,
        "shipper": 0.22,
        "consignee": 0.22,
        "sample_id": 0.18,
        "lot_number": 0.24,
        "product": 0.2,
        "gross_weight": 0.18,
        "net_weight": 0.18,
        "tare_weight": 0.12,
        "facility": 0.2,
        "issuing_entity": 0.2,
        "curtailed_quantity": 0.24,
        "quantity": 0.24,
        "account": 0.16,
        "trade_id": 0.18,
    },
    "TRADE_INVOICE": {
        "invoice_number": 1.0,
        "trade_id": 0.7,
        "delivery_id": 0.45,
        "counterparty": 0.35,
        "invoice_date": 0.35,
        "due_date": 0.3,
        "statement_number": 0.18,
        "total_amount": 0.4,
        "claim_number": 0.88,
        "claim_date": 0.35,
        "claim_amount": 0.48,
        "bill_of_lading_number": 0.32,
        "vessel_name": 0.22,
    },
    "TRADE_PAYMENT": {
        "payment_reference": 1.0,
        "statement_number": 0.68,
        "account": 0.72,
        "statement_date": 0.35,
        "invoice_number": 0.52,
        "advice_date": 0.45,
        "amount": 0.45,
    },
    "QUALITY_SPECIFICATION_REFERENCE": {
        "spec_name": 1.0,
        "spec_version": 0.72,
        "effective_date": 0.4,
        "product": 0.4,
        "counterparty": 0.2,
    },
    "QUALITY_RECORD": {
        "statement_number": 0.82,
        "certificate_number": 0.92,
        "sample_id": 0.95,
        "lot_number": 0.82,
        "inspection_report_number": 0.9,
        "inspection_date": 0.38,
        "inspector": 0.35,
        "bill_of_lading_number": 0.24,
        "delivery_id": 0.52,
        "trade_id": 0.35,
        "product": 0.35,
    },
    "QUALITY_SPECIFICATION": {
        "spec_name": 1.0,
        "spec_version": 0.72,
        "effective_date": 0.4,
        "product": 0.4,
        "counterparty": 0.2,
        "trade_id": 0.3,
    },
    "SETTLEMENT_ACCOUNT": {
        "letter_of_credit_number": 1.0,
        "issuing_bank": 0.72,
        "applicant": 0.5,
        "beneficiary": 0.5,
        "expiry_date": 0.4,
        "amount": 0.4,
        "account": 0.55,
        "statement_number": 0.45,
    },
    "PRICE_INDEX_OBSERVATION": {
        "price_index_code": 1.0,
        "observation_date": 0.92,
        "publication_date": 0.62,
        "source_provider": 0.72,
        "source_series_id": 0.72,
        "publication_reference": 0.48,
        "price": 0.4,
        "currency": 0.2,
        "unit": 0.2,
        "commodity": 0.18,
        "location": 0.18,
    },
    "PRICE_INDEX": {
        "price_index_code": 1.0,
        "source_provider": 0.55,
        "source_series_id": 0.42,
        "commodity": 0.5,
        "market": 0.35,
        "location": 0.35,
        "currency": 0.24,
        "unit": 0.24,
    },
    "COMPLIANCE_RECORD": {
        "certificate_number": 0.92,
        "force_majeure_notice_number": 0.92,
        "document_number": 0.82,
        "origin_country": 0.9,
        "counterparty": 0.42,
        "contract_number": 0.48,
        "event_start": 0.52,
        "event_end": 0.32,
        "affected_location": 0.42,
        "product": 0.45,
        "bill_of_lading_number": 0.42,
        "un_number": 0.85,
        "hazard_class": 0.55,
        "delivery_id": 0.36,
        "trade_id": 0.32,
    },
    "INVENTORY_POSITION": {
        "facility": 0.92,
        "account": 0.7,
        "product": 0.62,
        "statement_number": 0.5,
        "period_start": 0.36,
        "period_end": 0.36,
        "inventory_quantity": 0.45,
        "trade_id": 0.24,
        "delivery_id": 0.24,
    },
}

TABLE_BONUS_BY_STRATEGY: dict[str, set[str]] = {
    "TRADE_FIRST": {"economic_terms", "commercial_terms", "execution_lines", "statement_lines"},
    "DELIVERY_FIRST": {
        "shipment_lines",
        "flow_lines",
        "inventory_lines",
        "delivered_lines",
        "measurement_lines",
        "weight_measurements",
        "packing_lines",
    },
    "SETTLEMENT_FIRST": {"line_items", "settlement_lines", "statement_lines", "claim_lines"},
    "MARKET_DATA_FIRST": {"price_lines"},
    "ATTACHMENT_FIRST": {"quality_results", "analyte_results", "assay_results", "parameter_limits", "hazardous_components"},
}

HIGH_SIGNAL_KEYS = {
    "trade_id",
    "external_trade_id",
    "delivery_id",
    "delivery_order_number",
    "packing_list_number",
    "invoice_number",
    "payment_reference",
    "letter_of_credit_number",
    "claim_number",
    "curtailment_notice_number",
    "dispatch_number",
    "force_majeure_notice_number",
    "outage_number",
    "confirmation_number",
    "contract_number",
    "bill_of_lading_number",
    "waybill_number",
    "railcar_number",
    "ticket_number",
    "delivery_confirmation_number",
    "customer_reference",
    "notice_number",
    "nomination_reference",
    "sample_id",
    "certificate_number",
    "inspection_report_number",
    "document_number",
    "origin_country",
    "un_number",
    "price_index_code",
    "source_series_id",
}


def build_document_page_routing_assessment(
    *,
    document_kind: str,
    header_fields: list[dict[str, object]],
    table_blocks: list[dict[str, object]],
    review_status: str,
) -> DocumentRoutingAssessmentOut:
    schema = get_document_kind_schema(document_kind)
    if schema is None or document_kind in {"UNKNOWN", "OTHER"}:
        return DocumentRoutingAssessmentOut(
            routing_strategy="MANUAL_REVIEW",
            status="MANUAL_REVIEW",
            confidence=0.05,
            reasons=["Routing stays manual until this page has a supported document kind."],
        )

    strategy = ROUTING_STRATEGY_BY_FAMILY.get(str(schema.document_family), "MANUAL_REVIEW")
    if strategy == "MANUAL_REVIEW":
        return DocumentRoutingAssessmentOut(
            routing_strategy="MANUAL_REVIEW",
            status="MANUAL_REVIEW",
            confidence=0.1,
            reasons=[f"{schema.label} does not have an automated routing strategy yet."],
        )

    field_map = _field_map(header_fields)
    available_keys = {key for key, value in field_map.items() if value}
    schema_matching_keys = tuple(schema.matching_keys)
    matched_keys = sorted(key for key in schema_matching_keys if key in available_keys)
    missing_keys = sorted(key for key in schema_matching_keys if key not in available_keys)
    table_bonus = _table_bonus(table_blocks, strategy=strategy)
    review_bonus = 0.06 if review_status == "REVIEWED" else 0.0

    candidates: list[DocumentRoutingCandidateOut] = []
    for target in schema.record_targets:
        target_weights = _target_weights(record_type=target.record_type, strategy=strategy, matching_keys=schema_matching_keys)
        matched_target_keys = sorted(key for key in target_weights if key in available_keys)
        missing_target_keys = sorted(key for key in target_weights if key not in available_keys)
        weight_total = sum(target_weights.values()) or 1.0
        score = min(
            0.99,
            sum(target_weights[key] for key in matched_target_keys) / weight_total
            + ROLE_SCORE_BONUS.get(target.role, 0.0)
            + table_bonus
            + review_bonus,
        )
        candidates.append(
            DocumentRoutingCandidateOut(
                record_type=target.record_type,
                label=target.label,
                role=target.role,
                score=round(max(score, 0.0), 3),
                matched_keys=matched_target_keys,
                missing_keys=missing_target_keys,
                rationale=_candidate_rationale(
                    label=target.label,
                    matched_keys=matched_target_keys,
                    missing_keys=missing_target_keys,
                    review_status=review_status,
                    create_if_missing=target.create_if_missing,
                ),
                create_if_missing=target.create_if_missing,
            )
        )

    candidates.sort(key=lambda candidate: (-candidate.score, ROLE_PRIORITY.get(candidate.role, 99), candidate.label))
    best_candidate = candidates[0] if candidates else None

    reasons = _assessment_reasons(
        strategy=strategy,
        matched_keys=matched_keys,
        missing_keys=missing_keys,
        review_status=review_status,
        table_bonus=table_bonus,
    )

    confidence = best_candidate.score if best_candidate is not None else 0.0
    status = _assessment_status(
        confidence=confidence,
        review_status=review_status,
        matched_keys=matched_keys,
    )

    return DocumentRoutingAssessmentOut(
        routing_strategy=strategy,
        status=status,
        confidence=round(confidence, 3),
        primary_record_type=best_candidate.record_type if best_candidate is not None else None,
        primary_label=best_candidate.label if best_candidate is not None else None,
        matched_keys=matched_keys,
        missing_keys=missing_keys,
        reasons=reasons,
        candidates=candidates,
    )


def build_document_routing_assessment(
    pages: list[DocumentIngestionPage],
    *,
    review_status: str,
) -> DocumentRoutingAssessmentOut:
    if not pages:
        return DocumentRoutingAssessmentOut(
            routing_strategy="MANUAL_REVIEW",
            status="MANUAL_REVIEW",
            confidence=0.0,
            reasons=["No pages are available for routing."],
        )

    page_level_kinds = sorted({page.document_kind for page in pages if page.document_kind != "UNKNOWN"})
    has_unknown_pages = any(page.document_kind == "UNKNOWN" for page in pages)
    if len(page_level_kinds) > 1 or (has_unknown_pages and page_level_kinds):
        reason = (
            f"Document packet contains multiple logical document kinds: {', '.join(page_level_kinds)}."
            if len(page_level_kinds) > 1
            else f"Document packet has unclassified pages alongside {page_level_kinds[0]} pages."
        )
        return DocumentRoutingAssessmentOut(
            routing_strategy="MANUAL_REVIEW",
            status="MANUAL_REVIEW",
            confidence=0.0,
            reasons=[
                reason,
                "Route each logical document page range separately instead of assigning one file-level target.",
            ],
        )

    dominant_kind = _dominant_document_kind(pages)
    relevant_pages = [page for page in pages if page.document_kind == dominant_kind] or pages
    combined_header_fields = _merge_header_fields(relevant_pages)
    combined_table_blocks = [block for page in relevant_pages for block in (page.table_blocks or [])]
    effective_review_status = "REVIEWED" if review_status == "VERIFIED" else review_status
    assessment = build_document_page_routing_assessment(
        document_kind=dominant_kind,
        header_fields=combined_header_fields,
        table_blocks=combined_table_blocks,
        review_status=effective_review_status,
    )

    families = set()
    for page in pages:
        if page.document_kind in {"UNKNOWN", "OTHER"}:
            continue
        schema = get_document_kind_schema(page.document_kind)
        if schema is not None:
            families.add(str(schema.document_family))
    kinds = {page.document_kind for page in pages if page.document_kind not in {"UNKNOWN", "OTHER"}}
    if len(families) > 1 or len(kinds) > 1:
        adjusted_confidence = max(round(assessment.confidence - 0.08, 3), 0.0)
        return assessment.model_copy(
            update={
                "confidence": adjusted_confidence,
                "reasons": [
                    f"Document has mixed page kinds: {', '.join(sorted(kinds))}.",
                    *assessment.reasons,
                ],
            }
        )
    return assessment


def _field_map(header_fields: list[dict[str, object]]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for field in header_fields:
        key = clean_optional_text(field.get("field_key"), lowercase=True)
        value = clean_optional_text(field.get("value"))
        if key and value and key not in normalized:
            normalized[key] = value
    return normalized


def _target_weights(
    *,
    record_type: str,
    strategy: str,
    matching_keys: Iterable[str],
) -> dict[str, float]:
    strategy_weights = STRATEGY_KEY_WEIGHTS.get(strategy, {})
    record_weights = TARGET_KEY_WEIGHTS.get(record_type, {})
    merged: dict[str, float] = {}
    for key in matching_keys:
        if key in record_weights:
            merged[key] = record_weights[key]
        elif key in strategy_weights:
            merged[key] = strategy_weights[key]
    return merged or {key: strategy_weights.get(key, 0.2) for key in matching_keys}


def _table_bonus(table_blocks: list[dict[str, object]], *, strategy: str) -> float:
    template_keys = {
        clean_optional_text(block.get("template_key"), lowercase=True)
        for block in table_blocks
    }
    template_keys.discard(None)
    if template_keys & TABLE_BONUS_BY_STRATEGY.get(strategy, set()):
        return 0.05
    if table_blocks:
        return 0.02
    return 0.0


def _candidate_rationale(
    *,
    label: str,
    matched_keys: list[str],
    missing_keys: list[str],
    review_status: str,
    create_if_missing: bool,
) -> str:
    parts: list[str] = []
    if matched_keys:
        parts.append(f"Matched {_render_keys(matched_keys[:4])} for {label.lower()}.")
    else:
        parts.append(f"No strong routing keys matched for {label.lower()} yet.")
    if missing_keys:
        parts.append(f"Still missing {_render_keys(missing_keys[:3])}.")
    if review_status != "REVIEWED":
        parts.append("Routing is still advisory until the page has been reviewed.")
    elif create_if_missing:
        parts.append("This target can be created later if no existing record is found.")
    return " ".join(parts)


def _assessment_reasons(
    *,
    strategy: str,
    matched_keys: list[str],
    missing_keys: list[str],
    review_status: str,
    table_bonus: float,
) -> list[str]:
    reasons: list[str] = [f"Routing strategy is {strategy.replace('_', ' ').lower()} based on the document family."]
    high_signal_matches = [key for key in matched_keys if key in HIGH_SIGNAL_KEYS]
    if high_signal_matches:
        reasons.append(f"Strong identifiers are present: {_render_keys(high_signal_matches[:4])}.")
    elif matched_keys:
        reasons.append(f"Routing context is present through {_render_keys(matched_keys[:4])}.")
    else:
        reasons.append("No matching keys have been captured yet.")
    if missing_keys:
        reasons.append(f"Still missing {_render_keys(missing_keys[:4])}.")
    if table_bonus >= 0.05:
        reasons.append("The extracted table structure supports this routing strategy.")
    if review_status != "REVIEWED":
        reasons.append("Document review is incomplete, so routing stays advisory.")
    return reasons


def _assessment_status(
    *,
    confidence: float,
    review_status: str,
    matched_keys: list[str],
) -> str:
    if not matched_keys:
        return "INSUFFICIENT"
    if confidence >= 0.78 and review_status == "REVIEWED":
        return "READY"
    if confidence >= 0.42:
        return "PARTIAL"
    return "INSUFFICIENT"


def _render_keys(keys: list[str]) -> str:
    return ", ".join(keys)


def _dominant_document_kind(pages: list[DocumentIngestionPage]) -> str:
    kind_counts = Counter(page.document_kind for page in pages)
    for kind, _count in kind_counts.most_common():
        if kind != "UNKNOWN":
            return kind
    return "UNKNOWN"


def _merge_header_fields(pages: list[DocumentIngestionPage]) -> list[dict[str, object]]:
    merged: dict[str, dict[str, object]] = {}
    ordered_pages = sorted(
        pages,
        key=lambda page: (page.review_status != "REVIEWED", page.page_number),
    )
    for page in ordered_pages:
        for field in page.header_fields or []:
            key = clean_optional_text(field.get("field_key"), lowercase=True)
            value = clean_optional_text(field.get("value"))
            if not key or not value or key in merged:
                continue
            merged[key] = dict(field)
    return list(merged.values())
