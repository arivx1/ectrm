from __future__ import annotations

from collections import Counter
from typing import Any

from apps.api.app.domains.documents.services.schema_registry import get_document_kind_schema
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentExtractedFieldOut
from apps.api.app.schemas.document import DocumentReviewStatus
from apps.api.app.schemas.document import DocumentTableBlockOut

from .document_routing import build_document_routing_assessment
from .document_ingestion_common import clean_optional_text
from .document_ingestion_common import humanize_key
from .document_ingestion_common import normalize_key


def build_document_summary(
    pages: list[DocumentIngestionPage],
    *,
    review_status: DocumentReviewStatus | str,
) -> dict[str, object]:
    routing_assessment = build_document_routing_assessment(pages, review_status=str(review_status))
    kind_counts = Counter(page.document_kind for page in pages)
    dominant_document_kind = "UNKNOWN"
    for kind, _count in kind_counts.most_common():
        if kind != "UNKNOWN":
            dominant_document_kind = kind
            break

    reviewed_page_count = sum(1 for page in pages if page.review_status == "REVIEWED")
    review_blockers = sum(
        1
        for page in pages
        if page.review_status == "REVIEWED"
        and collect_page_review_errors(
            document_kind=page.document_kind,
            header_fields=list(page.header_fields or []),
            table_blocks=list(page.table_blocks or []),
        )
    )

    return {
        "dominant_document_kind": dominant_document_kind,
        "page_kind_counts": dict(kind_counts),
        "header_field_count": sum(len(page.header_fields or []) for page in pages),
        "table_block_count": sum(len(page.table_blocks or []) for page in pages),
        "ocr_page_count": sum(1 for page in pages if page_text_source(page) == "ocr"),
        "review_status": review_status,
        "reviewed_page_count": reviewed_page_count,
        "unreviewed_page_count": max(len(pages) - reviewed_page_count, 0),
        "review_ready": bool(pages) and reviewed_page_count == len(pages) and review_blockers == 0,
        "review_blocker_count": review_blockers,
        "routing_strategy": routing_assessment.routing_strategy,
        "routing_status": routing_assessment.status,
        "routing_primary_record_type": routing_assessment.primary_record_type,
        "routing_assessment": routing_assessment.model_dump(),
    }


def validate_document_review_status_transition(
    review_status: str,
    pages: list[DocumentIngestionPage],
) -> None:
    if review_status != "VERIFIED":
        return
    if not pages:
        raise ValueError("A document must have at least one page before it can be verified")
    unreviewed_pages = [str(page.page_number) for page in pages if page.review_status != "REVIEWED"]
    if unreviewed_pages:
        raise ValueError(
            "All pages must be reviewed before the document can be verified. "
            f"Outstanding pages: {', '.join(unreviewed_pages)}"
        )
    for page in pages:
        page_errors = collect_page_review_errors(
            document_kind=page.document_kind,
            header_fields=list(page.header_fields or []),
            table_blocks=list(page.table_blocks or []),
        )
        if page_errors:
            raise ValueError(f"Page {page.page_number} is not ready for verification: {' '.join(page_errors)}")


def validate_page_review_state(
    *,
    document_kind: str,
    header_fields: list[dict[str, object]],
    table_blocks: list[dict[str, object]],
    review_status: str,
) -> None:
    if review_status != "REVIEWED":
        return
    errors = collect_page_review_errors(
        document_kind=document_kind,
        header_fields=header_fields,
        table_blocks=table_blocks,
    )
    if errors:
        raise ValueError(" ".join(errors))


def collect_page_review_errors(
    *,
    document_kind: str,
    header_fields: list[dict[str, object]],
    table_blocks: list[dict[str, object]],
) -> list[str]:
    schema = get_document_kind_schema(document_kind)
    if schema is None or document_kind in {"UNKNOWN", "OTHER"}:
        return []

    errors: list[str] = []
    field_map = {
        str(field.get("field_key", "")).strip().lower(): str(field.get("value", "")).strip()
        for field in header_fields
        if str(field.get("field_key", "")).strip()
    }
    missing_required_fields = [
        field.label
        for field in schema.header_fields
        if field.required and not field_map.get(field.field_key)
    ]
    if missing_required_fields:
        errors.append(f"Missing required fields: {', '.join(missing_required_fields)}.")

    table_templates_by_key = {template.template_key: template for template in schema.table_templates}
    normalized_blocks = [DocumentTableBlockOut.model_validate(block) for block in table_blocks]

    for block in normalized_blocks:
        if block.template_key and block.template_key not in table_templates_by_key:
            errors.append(f"Table template '{block.template_key}' is not supported for {schema.label}.")

    for template in schema.table_templates:
        matching_blocks = [block for block in normalized_blocks if block.template_key == template.template_key]
        if len(matching_blocks) < template.min_occurrences:
            errors.append(
                f"{schema.label} requires at least {template.min_occurrences} '{template.label}' table block"
                f"{'' if template.min_occurrences == 1 else 's'}."
            )
            continue
        required_columns = {column.column_key for column in template.columns if column.required}
        for block in matching_blocks:
            missing_columns = sorted(required_columns - set(block.columns))
            if missing_columns:
                errors.append(
                    f"Table '{template.label}' is missing required columns: {', '.join(missing_columns)}."
                )
    return errors


def derive_document_review_status_after_page_change(
    current_status: str,
    pages: list[DocumentIngestionPage],
) -> str:
    if current_status == "VERIFIED":
        return "IN_REVIEW"
    if any(page.review_status == "REVIEWED" for page in pages):
        return "IN_REVIEW"
    return "UNREVIEWED"


def page_text_source(page: DocumentIngestionPage) -> str:
    classification_payload = dict(page.classification_payload or {})
    candidate = str(classification_payload.get("text_source", "")).strip().lower()
    if candidate in {"pdf_text", "ocr"}:
        return candidate
    return "none"


def normalize_header_fields(
    fields: list[dict[str, Any]],
    *,
    document_kind: str,
) -> list[dict[str, object]]:
    schema = get_document_kind_schema(document_kind)
    labels_by_key = {field.field_key: field.label for field in schema.header_fields} if schema else {}
    normalized_fields: list[dict[str, object]] = []
    seen_keys: set[str] = set()
    for raw_field in fields:
        field_key = normalize_key(str(raw_field.get("field_key", "")))
        if not field_key:
            continue
        value = clean_optional_text(raw_field.get("value"))
        if value is None:
            continue
        if field_key in seen_keys:
            raise ValueError(f"Header fields must not contain duplicate field keys: {field_key}")
        seen_keys.add(field_key)
        normalized_fields.append(
            DocumentExtractedFieldOut(
                field_key=field_key,
                label=clean_optional_text(raw_field.get("label")) or labels_by_key.get(field_key) or humanize_key(field_key),
                value=value,
                confidence=raw_field.get("confidence"),
                source=clean_optional_text(raw_field.get("source")) or "review",
            ).model_dump()
        )
    return normalized_fields


def normalize_table_blocks(
    blocks: list[dict[str, Any]],
    *,
    document_kind: str,
) -> list[dict[str, object]]:
    schema = get_document_kind_schema(document_kind)
    templates_by_key = {template.template_key: template for template in schema.table_templates} if schema else {}
    normalized_blocks: list[dict[str, object]] = []

    for index, raw_block in enumerate(blocks, start=1):
        template_key = clean_optional_text(raw_block.get("template_key"), lowercase=True)
        if template_key is not None and template_key not in templates_by_key:
            raise ValueError(f"Table template '{template_key}' is not supported for document kind '{document_kind}'")

        columns = [
            normalize_key(str(column))
            for column in raw_block.get("columns", [])
            if normalize_key(str(column))
        ]
        if template_key and not columns:
            columns = [column.column_key for column in templates_by_key[template_key].columns]

        seen_columns: list[str] = []
        deduped_columns: set[str] = set()
        for column in columns:
            if column in deduped_columns:
                raise ValueError(f"Table block {index} contains duplicate column '{column}'")
            deduped_columns.add(column)
            seen_columns.append(column)
        columns = seen_columns

        rows: list[dict[str, str | None]] = []
        for raw_row in raw_block.get("rows", []):
            normalized_row: dict[str, str | None] = {}
            for key, value in raw_row.items():
                normalized_key = normalize_key(str(key))
                if not normalized_key:
                    continue
                if normalized_key not in columns:
                    columns.append(normalized_key)
                normalized_row[normalized_key] = clean_optional_text(value)
            rows.append({column: normalized_row.get(column) for column in columns})

        normalized_blocks.append(
            DocumentTableBlockOut(
                table_index=index,
                template_key=template_key,
                title=clean_optional_text(raw_block.get("title")),
                columns=columns,
                rows=rows,
                header_row_detected=bool(raw_block.get("header_row_detected", False)),
                source=clean_optional_text(raw_block.get("source"), lowercase=True) or "review",
            ).model_dump()
        )
    return normalized_blocks
