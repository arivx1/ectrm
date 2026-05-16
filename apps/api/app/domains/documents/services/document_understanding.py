from __future__ import annotations

from collections import Counter
import re

from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.schemas.document import DocumentIngestionPageUnderstandingOut
from apps.api.app.schemas.document import DocumentIngestionUnderstandingOut
from apps.api.app.schemas.document import DocumentUnderstandingClassificationEvidenceOut
from apps.api.app.schemas.document import DocumentUnderstandingContentFingerprintOut
from apps.api.app.schemas.document import DocumentUnderstandingDocumentTextStatsOut
from apps.api.app.schemas.document import DocumentUnderstandingDocumentVisualSummaryOut
from apps.api.app.schemas.document import DocumentUnderstandingLayoutHintsOut
from apps.api.app.schemas.document import DocumentUnderstandingSourceCountsOut
from apps.api.app.schemas.document import DocumentUnderstandingStructureSignalsOut
from apps.api.app.schemas.document import DocumentUnderstandingTextStatsOut
from apps.api.app.schemas.document import DocumentUnderstandingVisualSignalsOut

from .document_classification_learning import build_document_content_features
from .document_classification_learning import build_document_learning_signature
from .document_ingestion_common import clean_optional_text

DOCUMENT_UNDERSTANDING_VERSION = "document-understanding-v1"

_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9]+")
_DATE_PATTERN = re.compile(r"\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b")
_CURRENCY_PATTERN = re.compile(r"\b(?:usd|eur|gbp|cad|aud)\b|[$€£]", re.IGNORECASE)
_TABLE_SPACING_PATTERN = re.compile(r"\s{2,}")


def build_document_page_understanding(
    page: DocumentIngestionPage,
    *,
    preview_available: bool,
) -> DocumentIngestionPageUnderstandingOut:
    payload = dict(page.classification_payload or {})
    raw_text = page.raw_text or ""
    lines = _non_empty_lines(raw_text)
    tokens = _TOKEN_PATTERN.findall(raw_text.lower())
    text_source = _normalized_text_source(payload.get("text_source"))
    header_fields = list(page.header_fields or [])
    table_blocks = list(page.table_blocks or [])
    header_candidate_keys = _header_candidate_keys(header_fields)
    table_template_keys, table_column_keys, table_column_count, table_row_count = _table_structure_signals(table_blocks)
    content_features = _content_features_from_payload(payload, raw_text=raw_text)

    return DocumentIngestionPageUnderstandingOut(
        bundle_version=DOCUMENT_UNDERSTANDING_VERSION,
        text_stats=DocumentUnderstandingTextStatsOut(
            source=text_source,
            text_available=bool(lines),
            character_count=len(raw_text),
            line_count=len(lines),
            token_count=len(tokens),
            numeric_token_count=sum(1 for token in tokens if any(character.isdigit() for character in token)),
            date_like_value_count=len(_DATE_PATTERN.findall(raw_text)),
            currency_marker_count=len(_CURRENCY_PATTERN.findall(raw_text)),
        ),
        layout_hints=DocumentUnderstandingLayoutHintsOut(
            non_empty_line_count=len(lines),
            short_line_count=sum(1 for line in lines if len(line.split()) <= 8),
            uppercase_line_count=sum(1 for line in lines if _line_is_uppercase(line)),
            key_value_line_count=sum(1 for line in lines if _looks_like_key_value_line(line)),
            table_like_line_count=sum(1 for line in lines if _looks_like_table_line(line)),
        ),
        structure_signals=DocumentUnderstandingStructureSignalsOut(
            header_candidate_count=len(header_fields),
            header_candidate_keys=header_candidate_keys,
            table_candidate_count=len(table_blocks),
            table_template_keys=table_template_keys,
            table_column_count=table_column_count,
            table_column_keys=table_column_keys,
            table_row_count=table_row_count,
        ),
        visual_signals=DocumentUnderstandingVisualSignalsOut(
            preview_generated=bool(payload.get("preview_generated")),
            preview_available=preview_available,
            image_has_visible_content=bool(payload.get("image_has_visible_content")),
            ocr_used=bool(payload.get("ocr_used")) or text_source == "ocr",
        ),
        content_fingerprint=DocumentUnderstandingContentFingerprintOut(
            filename_signature=_filename_signature_from_payload(payload),
            content_features=content_features,
            content_feature_count=len(content_features),
            learning_version=clean_optional_text(payload.get("learning_version")),
        ),
        classification_evidence=DocumentUnderstandingClassificationEvidenceOut(
            system_document_kind=clean_optional_text(payload.get("system_document_kind")) or clean_optional_text(page.document_kind),
            system_document_subtype=clean_optional_text(payload.get("system_document_subtype")),
            system_classification_source=clean_optional_text(payload.get("system_classification_source")),
            system_classification_confidence=_coerce_confidence(
                payload.get("system_classification_confidence"),
                fallback=page.classification_confidence,
            ),
            matched_by=clean_optional_text(payload.get("system_matched_by")) or clean_optional_text(payload.get("matched_by")),
            corrected=bool(payload.get("classification_corrected")),
            correction_count=_coerce_non_negative_int(payload.get("classification_correction_count")),
            corrected_document_kind=clean_optional_text(payload.get("corrected_document_kind")),
            corrected_document_subtype=clean_optional_text(payload.get("corrected_document_subtype")),
            learning_applied=bool(payload.get("learning_applied")),
            learning_source=clean_optional_text(payload.get("learning_source")),
            learning_similarity=_coerce_confidence(payload.get("learning_similarity")),
            learning_example_count=_coerce_non_negative_int(payload.get("learning_example_count")),
            automated_document_kind=clean_optional_text(payload.get("automated_document_kind")),
            automated_document_subtype=clean_optional_text(payload.get("automated_document_subtype")),
        ),
    )


def build_document_understanding(
    *,
    original_filename: str,
    page_understandings: list[DocumentIngestionPageUnderstandingOut],
) -> DocumentIngestionUnderstandingOut:
    source_counts = DocumentUnderstandingSourceCountsOut()
    feature_counts: Counter[str] = Counter()
    header_candidate_keys: set[str] = set()
    table_template_keys: set[str] = set()
    table_column_keys: set[str] = set()
    learning_version = next(
        (
            understanding.content_fingerprint.learning_version
            for understanding in page_understandings
            if understanding.content_fingerprint.learning_version
        ),
        None,
    )

    for understanding in page_understandings:
        text_source = understanding.text_stats.source
        if text_source == "pdf_text":
            source_counts.pdf_text += 1
        elif text_source == "ocr":
            source_counts.ocr += 1
        else:
            source_counts.none += 1

        feature_counts.update(understanding.content_fingerprint.content_features)
        header_candidate_keys.update(understanding.structure_signals.header_candidate_keys)
        table_template_keys.update(understanding.structure_signals.table_template_keys)
        table_column_keys.update(understanding.structure_signals.table_column_keys)

    content_features = [
        feature
        for feature, _count in sorted(feature_counts.items(), key=lambda item: (-item[1], item[0]))
    ]

    return DocumentIngestionUnderstandingOut(
        bundle_version=DOCUMENT_UNDERSTANDING_VERSION,
        page_count=len(page_understandings),
        text_stats=DocumentUnderstandingDocumentTextStatsOut(
            pages_with_text=sum(1 for understanding in page_understandings if understanding.text_stats.text_available),
            source_counts=source_counts,
            total_character_count=sum(understanding.text_stats.character_count for understanding in page_understandings),
            total_line_count=sum(understanding.text_stats.line_count for understanding in page_understandings),
            total_token_count=sum(understanding.text_stats.token_count for understanding in page_understandings),
            total_numeric_token_count=sum(
                understanding.text_stats.numeric_token_count for understanding in page_understandings
            ),
            total_date_like_value_count=sum(
                understanding.text_stats.date_like_value_count for understanding in page_understandings
            ),
            total_currency_marker_count=sum(
                understanding.text_stats.currency_marker_count for understanding in page_understandings
            ),
        ),
        structure_signals=DocumentUnderstandingStructureSignalsOut(
            header_candidate_count=sum(
                understanding.structure_signals.header_candidate_count for understanding in page_understandings
            ),
            header_candidate_keys=sorted(header_candidate_keys),
            table_candidate_count=sum(
                understanding.structure_signals.table_candidate_count for understanding in page_understandings
            ),
            table_template_keys=sorted(table_template_keys),
            table_column_count=sum(understanding.structure_signals.table_column_count for understanding in page_understandings),
            table_column_keys=sorted(table_column_keys),
            table_row_count=sum(understanding.structure_signals.table_row_count for understanding in page_understandings),
        ),
        visual_signals=DocumentUnderstandingDocumentVisualSummaryOut(
            preview_generated_page_count=sum(
                1 for understanding in page_understandings if understanding.visual_signals.preview_generated
            ),
            preview_available_page_count=sum(
                1 for understanding in page_understandings if understanding.visual_signals.preview_available
            ),
            visible_content_page_count=sum(
                1 for understanding in page_understandings if understanding.visual_signals.image_has_visible_content
            ),
        ),
        content_fingerprint=DocumentUnderstandingContentFingerprintOut(
            filename_signature=build_document_learning_signature(original_filename),
            content_features=content_features,
            content_feature_count=len(content_features),
            learning_version=learning_version,
        ),
    )


def _non_empty_lines(raw_text: str) -> list[str]:
    return [line.strip() for line in raw_text.splitlines() if line.strip()]


def _line_is_uppercase(line: str) -> bool:
    letters = [character for character in line if character.isalpha()]
    return bool(letters) and "".join(letters).upper() == "".join(letters)


def _looks_like_key_value_line(line: str) -> bool:
    if ":" in line:
        return True
    tokens = line.split()
    if len(tokens) < 2 or len(tokens) > 10 or not any(character.isdigit() for character in line):
        return False
    alpha_prefix_count = 0
    for token in tokens:
        if any(character.isdigit() for character in token):
            break
        if token.isalpha():
            alpha_prefix_count += 1
    return alpha_prefix_count >= 2


def _looks_like_table_line(line: str) -> bool:
    return line.count("|") >= 2 or "\t" in line or len(_TABLE_SPACING_PATTERN.findall(line)) >= 2


def _header_candidate_keys(fields: list[dict[str, object]]) -> list[str]:
    return _normalized_string_list(
        (clean_optional_text(field.get("field_key"), lowercase=True) for field in fields),
        sort_values=True,
    )


def _table_structure_signals(
    table_blocks: list[dict[str, object]],
) -> tuple[list[str], list[str], int, int]:
    template_keys = _normalized_string_list(
        (clean_optional_text(block.get("template_key"), lowercase=True) for block in table_blocks),
        sort_values=True,
    )
    column_count = 0
    row_count = 0
    column_keys: list[str] = []

    for block in table_blocks:
        columns = [
            clean_optional_text(column, lowercase=True)
            for column in list(block.get("columns") or [])
        ]
        normalized_columns = _normalized_string_list(columns, sort_values=True)
        column_keys.extend(normalized_columns)
        column_count += len(normalized_columns)
        row_count += len(list(block.get("rows") or []))

    return template_keys, _normalized_string_list(column_keys, sort_values=True), column_count, row_count


def _content_features_from_payload(payload: dict[str, object], *, raw_text: str) -> list[str]:
    payload_features = payload.get("content_features")
    normalized_features = _normalized_string_list(payload_features if isinstance(payload_features, list) else [])
    if normalized_features:
        return normalized_features
    return build_document_content_features(raw_text)


def _filename_signature_from_payload(payload: dict[str, object]) -> str | None:
    existing_signature = clean_optional_text(payload.get("filename_signature"))
    if existing_signature:
        return existing_signature
    filename = clean_optional_text(payload.get("filename"))
    if filename:
        return build_document_learning_signature(filename)
    return None


def _normalized_text_source(value: object | None) -> str:
    normalized = clean_optional_text(value, lowercase=True)
    if normalized in {"pdf_text", "ocr"}:
        return normalized
    return "none"


def _normalized_string_list(values, *, sort_values: bool = False) -> list[str]:
    normalized_values: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = clean_optional_text(value)
        if normalized is None or normalized in seen:
            continue
        seen.add(normalized)
        normalized_values.append(normalized)
    return sorted(normalized_values) if sort_values else normalized_values


def _coerce_non_negative_int(value: object | None) -> int:
    if isinstance(value, int) and value >= 0:
        return value
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return 0
    return normalized if normalized >= 0 else 0


def _coerce_confidence(value: object | None, *, fallback: float | None = None) -> float | None:
    candidate = fallback if value is None else value
    try:
        normalized = float(candidate) if candidate is not None else None
    except (TypeError, ValueError):
        return None
    if normalized is None or normalized < 0 or normalized > 1:
        return None
    return normalized
