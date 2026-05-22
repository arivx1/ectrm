from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.document_facet_value import DocumentFacetValue
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentFacetAssignmentOut
from apps.api.app.schemas.document import DocumentFacetSchemaOut
from apps.api.app.schemas.document import DocumentFacetValueOut
from apps.api.app.shared.enums import TransportMode

from .document_ingestion_common import clean_optional_text

DOCUMENT_FACET_SOURCE_VALUES = {"EXTRACTED", "LINKED_RECORD", "MANUAL", "AI_SUGGESTED", "SYSTEM_DERIVED"}
DOCUMENT_FACET_REVIEW_STATUS_VALUES = {"SUGGESTED", "CONFIRMED", "REJECTED"}
DOCUMENT_FACET_SYSTEM_ACTOR_ID = "document_facet_suggester"

_CODE_SEPARATOR_PATTERN = re.compile(r"[^A-Z0-9]+")


def _facet_value(code: str, label: str, description: str | None = None) -> DocumentFacetValueOut:
    return DocumentFacetValueOut(code=code, label=label, description=description)


DOCUMENT_COMMODITY_VALUES = (
    _facet_value("NATURAL_GAS", "Natural Gas"),
    _facet_value("CRUDE_OIL", "Crude Oil"),
    _facet_value("REFINED_PRODUCTS", "Refined Products"),
    _facet_value("LNG", "LNG"),
    _facet_value("NGL", "NGL"),
    _facet_value("POWER", "Power"),
    _facet_value("COAL", "Coal"),
)

DOCUMENT_COMMERCIAL_SIDE_VALUES = (
    _facet_value("BUY", "Purchase", "Commercial purchase or buy-side document context."),
    _facet_value("SELL", "Sale", "Commercial sale or sell-side document context."),
)

DOCUMENT_TRANSPORT_MODE_VALUES = (
    _facet_value(TransportMode.AIR.value, "Air"),
    _facet_value(TransportMode.VESSEL.value, "Vessel"),
    _facet_value(TransportMode.BARGE.value, "Barge"),
    _facet_value(TransportMode.TRUCK.value, "Truck"),
    _facet_value(TransportMode.RAIL.value, "Rail"),
    _facet_value(TransportMode.PIPELINE.value, "Pipeline"),
)

DOCUMENT_ASSET_VALUES = (
    _facet_value("POWER_GENERATION", "Power Generation"),
    _facet_value("TRANSMISSION", "Transmission"),
    _facet_value("UPSTREAM", "Upstream"),
    _facet_value("PIPELINE", "Pipeline"),
)

DOCUMENT_FACET_SCHEMAS = (
    DocumentFacetSchemaOut(
        facet_key="commodity",
        label="Commodity",
        description="Commodity or product family referenced by the document. Multiple values are allowed for packets or mixed invoices.",
        value_type="multi_select",
        repeatable=True,
        allowed_values=list(DOCUMENT_COMMODITY_VALUES),
    ),
    DocumentFacetSchemaOut(
        facet_key="commercial_side",
        label="Purchase/Sale",
        description="Commercial side from the company's perspective. Keep AP/AR invoice direction separate.",
        value_type="multi_select",
        repeatable=True,
        allowed_values=list(DOCUMENT_COMMERCIAL_SIDE_VALUES),
    ),
    DocumentFacetSchemaOut(
        facet_key="transport_mode",
        label="Mode of Transportation",
        description="Movement mode referenced by the document.",
        value_type="multi_select",
        repeatable=True,
        allowed_values=list(DOCUMENT_TRANSPORT_MODE_VALUES),
    ),
    DocumentFacetSchemaOut(
        facet_key="asset",
        label="Asset",
        description="Asset category or infrastructure context referenced by the document.",
        value_type="multi_select",
        repeatable=True,
        allowed_values=list(DOCUMENT_ASSET_VALUES),
    ),
)

DOCUMENT_FACET_SCHEMA_BY_KEY = {schema.facet_key: schema for schema in DOCUMENT_FACET_SCHEMAS}
DOCUMENT_FACET_VALUE_LABELS = {
    schema.facet_key: {value.code: value.label for value in schema.allowed_values}
    for schema in DOCUMENT_FACET_SCHEMAS
}
OPEN_VALUE_FACETS = {"commodity"}
VALUE_ALIASES = {
    "commodity": {
        "CRUDE": "CRUDE_OIL",
        "OIL": "CRUDE_OIL",
        "NAT_GAS": "NATURAL_GAS",
        "GAS": "NATURAL_GAS",
        "NATURAL_GAS": "NATURAL_GAS",
    },
    "commercial_side": {
        "PURCHASE": "BUY",
        "PURCHASED": "BUY",
        "BUY": "BUY",
        "BOUGHT": "BUY",
        "SALE": "SELL",
        "SALES": "SELL",
        "SELL": "SELL",
        "SOLD": "SELL",
    },
    "asset": {
        "GENERATION": "POWER_GENERATION",
        "POWER_GEN": "POWER_GENERATION",
        "POWER_GENERATION": "POWER_GENERATION",
        "UPSTREAM_PRODUCTION": "UPSTREAM",
        "PRODUCTION": "UPSTREAM",
    },
}

SYSTEM_SUGGESTION_PATTERNS: tuple[tuple[str, str, str, tuple[str, ...], float], ...] = (
    ("commodity", "NATURAL_GAS", "Natural Gas", (r"\bnatural gas\b", r"\bnat gas\b"), 0.76),
    ("commodity", "CRUDE_OIL", "Crude Oil", (r"\bcrude\b", r"\bcrude oil\b"), 0.74),
    ("commodity", "REFINED_PRODUCTS", "Refined Products", (r"\brefined products?\b", r"\bgasoline\b", r"\bdiesel\b"), 0.72),
    ("commodity", "LNG", "LNG", (r"\blng\b", r"\bliquefied natural gas\b"), 0.78),
    ("commodity", "NGL", "NGL", (r"\bngl\b", r"\bnatural gas liquids?\b"), 0.74),
    ("commodity", "POWER", "Power", (r"\bpower\b", r"\belectricity\b"), 0.7),
    ("commodity", "COAL", "Coal", (r"\bcoal\b",), 0.72),
    ("commercial_side", "BUY", "Purchase", (r"\bpurchase\b", r"\bbuy\b", r"\bbuyer\b"), 0.62),
    ("commercial_side", "SELL", "Sale", (r"\bsale\b", r"\bsell\b", r"\bseller\b"), 0.62),
    ("transport_mode", "AIR", "Air", (r"\bair\b", r"\bair freight\b"), 0.68),
    ("transport_mode", "VESSEL", "Vessel", (r"\bvessel\b", r"\btanker\b", r"\bship\b"), 0.76),
    ("transport_mode", "BARGE", "Barge", (r"\bbarge\b",), 0.76),
    ("transport_mode", "TRUCK", "Truck", (r"\btruck\b", r"\btrucking\b"), 0.76),
    ("transport_mode", "RAIL", "Rail", (r"\brail\b", r"\brailcar\b"), 0.76),
    ("transport_mode", "PIPELINE", "Pipeline", (r"\bpipeline\b", r"\bnomination\b"), 0.74),
    ("asset", "POWER_GENERATION", "Power Generation", (r"\bpower generation\b", r"\bgenerator\b", r"\bpower plant\b"), 0.72),
    ("asset", "TRANSMISSION", "Transmission", (r"\btransmission\b",), 0.7),
    ("asset", "UPSTREAM", "Upstream", (r"\bupstream\b", r"\bproduction field\b", r"\bwellhead\b"), 0.7),
    ("asset", "PIPELINE", "Pipeline", (r"\bpipeline asset\b", r"\bpipeline system\b"), 0.68),
)


def normalize_document_facet_assignments(
    raw_values: Iterable[object],
    *,
    document_id: str,
    page_id: int | None,
    actor_id: str,
    changed_at: datetime | None = None,
) -> list[DocumentFacetValue]:
    now = changed_at or datetime.now(timezone.utc)
    normalized: list[DocumentFacetValue] = []
    seen: set[tuple[str, str]] = set()
    for raw_value in raw_values:
        payload = _coerce_payload(raw_value)
        facet_key = _normalize_facet_key(payload.get("facet_key"))
        schema = DOCUMENT_FACET_SCHEMA_BY_KEY.get(facet_key)
        if schema is None:
            valid_keys = ", ".join(sorted(DOCUMENT_FACET_SCHEMA_BY_KEY))
            raise ValueError(f"Document facet '{facet_key}' is not supported. Expected one of: {valid_keys}.")

        value_code = _normalize_value_code(payload.get("value_code"))
        value_code = VALUE_ALIASES.get(facet_key, {}).get(value_code, value_code)
        value_labels = DOCUMENT_FACET_VALUE_LABELS.get(facet_key, {})
        if value_code not in value_labels and facet_key not in OPEN_VALUE_FACETS:
            valid_values = ", ".join(sorted(value_labels))
            raise ValueError(f"Document facet value '{value_code}' is invalid for {facet_key}. Expected one of: {valid_values}.")
        dedupe_key = (facet_key, value_code)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        source = _normalize_source(payload.get("source"))
        review_status = _normalize_review_status(payload.get("review_status"))
        label = clean_optional_text(payload.get("value_label")) or value_labels.get(value_code) or _humanize_code(value_code)
        normalized.append(
            DocumentFacetValue(
                document_id=document_id,
                page_id=page_id,
                facet_key=facet_key,
                value_code=value_code,
                value_label_snapshot=label[:160],
                source=source,
                confidence=_normalize_confidence(payload.get("confidence")),
                review_status=review_status,
                evidence=_normalize_evidence(payload.get("evidence")),
                created_at=now,
                created_by=actor_id,
                updated_at=now,
                updated_by=actor_id,
                version=1,
            )
        )
    return normalized


def replace_document_facet_values(
    db: Session,
    *,
    document_id: str,
    page_id: int | None,
    actor_id: str,
    raw_values: Iterable[object],
) -> None:
    query = db.query(DocumentFacetValue).filter(DocumentFacetValue.document_id == document_id)
    if page_id is None:
        query = query.filter(DocumentFacetValue.page_id.is_(None))
    else:
        query = query.filter(DocumentFacetValue.page_id == page_id)
    query.delete(synchronize_session=False)

    now = datetime.now(timezone.utc)
    for facet_value in normalize_document_facet_assignments(
        raw_values,
        document_id=document_id,
        page_id=page_id,
        actor_id=actor_id,
        changed_at=now,
    ):
        db.add(facet_value)


def refresh_system_suggested_page_facets(
    db: Session,
    *,
    page: DocumentIngestionPage,
    actor_id: str = DOCUMENT_FACET_SYSTEM_ACTOR_ID,
) -> None:
    if page.page_id is None:
        return

    existing_values = (
        db.execute(
            select(DocumentFacetValue).where(
                DocumentFacetValue.document_id == page.document_id,
                DocumentFacetValue.page_id == page.page_id,
            )
        )
        .scalars()
        .all()
    )
    existing_non_system = {
        (value.facet_key, value.value_code)
        for value in existing_values
        if value.source != "SYSTEM_DERIVED" and value.review_status != "REJECTED"
    }
    for value in existing_values:
        if value.source == "SYSTEM_DERIVED":
            db.delete(value)

    suggestions = [
        suggestion
        for suggestion in suggest_document_facets_from_text(page.raw_text)
        if (str(suggestion["facet_key"]), str(suggestion["value_code"])) not in existing_non_system
    ]
    now = datetime.now(timezone.utc)
    for facet_value in normalize_document_facet_assignments(
        suggestions,
        document_id=page.document_id,
        page_id=page.page_id,
        actor_id=actor_id,
        changed_at=now,
    ):
        db.add(facet_value)


def suggest_document_facets_from_text(raw_text: str | None) -> list[dict[str, object]]:
    text = clean_optional_text(raw_text, lowercase=True)
    if not text:
        return []

    suggestions: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    for facet_key, value_code, value_label, patterns, confidence in SYSTEM_SUGGESTION_PATTERNS:
        matched_pattern = next((pattern for pattern in patterns if re.search(pattern, text, flags=re.IGNORECASE)), None)
        if matched_pattern is None:
            continue
        key = (facet_key, value_code)
        if key in seen:
            continue
        seen.add(key)
        suggestions.append(
            {
                "facet_key": facet_key,
                "value_code": value_code,
                "value_label": value_label,
                "source": "SYSTEM_DERIVED",
                "confidence": confidence,
                "review_status": "SUGGESTED",
                "evidence": [f"Matched text pattern: {matched_pattern}"],
            }
        )
    return suggestions


def load_document_facet_values_by_document_id(
    db: Session,
    *,
    document_ids: list[str],
) -> dict[str, list[DocumentFacetValue]]:
    if not document_ids:
        return {}
    rows = (
        db.execute(
            select(DocumentFacetValue)
            .where(DocumentFacetValue.document_id.in_(document_ids))
            .order_by(
                DocumentFacetValue.document_id,
                DocumentFacetValue.page_id,
                DocumentFacetValue.facet_key,
                DocumentFacetValue.value_label_snapshot,
            )
        )
        .scalars()
        .all()
    )
    grouped: dict[str, list[DocumentFacetValue]] = {}
    for row in rows:
        grouped.setdefault(row.document_id, []).append(row)
    return grouped


def to_document_facet_assignment_out(value: DocumentFacetValue) -> DocumentFacetAssignmentOut:
    return DocumentFacetAssignmentOut(
        facet_value_id=value.facet_value_id or 0,
        document_id=value.document_id,
        page_id=value.page_id,
        facet_key=value.facet_key,
        facet_label=DOCUMENT_FACET_SCHEMA_BY_KEY.get(value.facet_key, DocumentFacetSchemaOut(
            facet_key=value.facet_key,
            label=_humanize_code(value.facet_key),
            description=None,
        )).label,
        value_code=value.value_code,
        value_label=value.value_label_snapshot,
        source=value.source,
        confidence=value.confidence,
        review_status=value.review_status,
        evidence=list(value.evidence or []),
        created_at=value.created_at,
        created_by=value.created_by,
        updated_at=value.updated_at,
        updated_by=value.updated_by,
        version=value.version,
    )


def _coerce_payload(raw_value: object) -> dict[str, object]:
    if isinstance(raw_value, dict):
        return raw_value
    if hasattr(raw_value, "model_dump"):
        return raw_value.model_dump()
    raise ValueError("Document facet values must be objects.")


def _normalize_facet_key(value: object) -> str:
    normalized = clean_optional_text(value, lowercase=True)
    if not normalized:
        raise ValueError("Document facet key is required.")
    normalized = re.sub(r"[^a-z0-9_]+", "_", normalized).strip("_")
    if not normalized:
        raise ValueError("Document facet key is required.")
    return normalized


def _normalize_value_code(value: object) -> str:
    normalized = clean_optional_text(value)
    if not normalized:
        raise ValueError("Document facet value is required.")
    return _CODE_SEPARATOR_PATTERN.sub("_", normalized.upper()).strip("_")


def _normalize_source(value: object) -> str:
    normalized = _normalize_value_code(value or "MANUAL")
    if normalized not in DOCUMENT_FACET_SOURCE_VALUES:
        valid_values = ", ".join(sorted(DOCUMENT_FACET_SOURCE_VALUES))
        raise ValueError(f"Document facet source '{normalized}' is invalid. Expected one of: {valid_values}.")
    return normalized


def _normalize_review_status(value: object) -> str:
    normalized = _normalize_value_code(value or "CONFIRMED")
    if normalized not in DOCUMENT_FACET_REVIEW_STATUS_VALUES:
        valid_values = ", ".join(sorted(DOCUMENT_FACET_REVIEW_STATUS_VALUES))
        raise ValueError(f"Document facet review status '{normalized}' is invalid. Expected one of: {valid_values}.")
    return normalized


def _normalize_confidence(value: object) -> float | None:
    if value is None:
        return None
    try:
        confidence = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Document facet confidence must be a number between 0 and 1.") from exc
    if confidence < 0 or confidence > 1:
        raise ValueError("Document facet confidence must be between 0 and 1.")
    return confidence


def _normalize_evidence(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = clean_optional_text(item)
        if text is None or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized[:20]


def _humanize_code(value: str) -> str:
    return " ".join(part for part in value.replace("_", " ").title().split())
