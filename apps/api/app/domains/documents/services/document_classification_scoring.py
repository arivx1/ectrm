from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field

from apps.api.app.schemas.document import DocumentKindSchemaOut
from apps.api.app.schemas.document import DocumentTableTemplateSchemaOut

from .document_ingestion_analysis import CLASSIFICATION_RULES
from .document_ingestion_analysis import extract_document_header_fields
from .document_ingestion_common import PageClassification
from .document_ingestion_common import clean_optional_text
from .document_ingestion_common import humanize_key
from .document_ingestion_common import normalize_for_matching
from .schema_registry import get_document_kind_schema
from .schema_registry import list_supported_document_kinds

DETERMINISTIC_ASSESSMENT_VERSION = "deterministic-score-v1"
LOW_CONFIDENCE_CLASSIFICATION_THRESHOLD = 0.46
_TEXT_KEYWORD_SCORE = 0.44
_EXTRA_TEXT_KEYWORD_SCORE = 0.08
_TITLE_KEYWORD_SCORE = 0.26
_TITLE_LINE_SCAN_LIMIT = 12
_FILENAME_KEYWORD_SCORE = 0.12
_REQUIRED_FIELD_SCORE = 0.24
_MATCHING_KEY_SCORE = 0.16
_HEADER_COVERAGE_SCORE = 0.12
_TABLE_TEMPLATE_SCORE = 0.18
_TABLE_REQUIRED_SCORE = 0.08
_TABLE_ROW_BONUS = 0.02
_AMBIGUITY_MARGIN = 0.12
_MIN_TEMPLATE_OVERLAP = 0.4
_TABLE_COLUMN_ALIASES_BY_TEMPLATE: dict[str, dict[str, str]] = {
    "assay_results": {
        "analysis": "parameter",
        "analyte": "parameter",
        "description": "parameter",
        "property": "parameter",
        "test": "parameter",
        "test_description": "parameter",
        "max": "spec_max",
        "maximum": "spec_max",
        "min": "spec_min",
        "minimum": "spec_min",
        "result": "value",
        "test_result": "value",
    },
}


@dataclass(frozen=True)
class DeterministicClassificationAssessment:
    document_kind: str
    document_subtype: str | None
    confidence: float
    matched_by: str
    supporting_evidence: tuple[str, ...]
    conflicts: tuple[str, ...]
    header_fields: tuple[dict[str, object], ...] = ()
    assessment_version: str = DETERMINISTIC_ASSESSMENT_VERSION

    @property
    def classification(self) -> PageClassification:
        return PageClassification(
            document_kind=self.document_kind,
            document_subtype=self.document_subtype,
            confidence=self.confidence,
            matched_by=self.matched_by,
        )


@dataclass
class _CandidateScore:
    document_kind: str
    document_subtype: str | None = None
    score: float = 0.0
    matched_by_parts: list[str] = field(default_factory=list)
    supporting_evidence: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    header_fields: list[dict[str, object]] = field(default_factory=list)
    keyword_hits: list[str] = field(default_factory=list)
    filename_hits: list[str] = field(default_factory=list)
    required_fields_found: list[str] = field(default_factory=list)
    missing_required_fields: list[str] = field(default_factory=list)
    matching_keys_found: list[str] = field(default_factory=list)
    matched_table_templates: list[str] = field(default_factory=list)


def score_document_page_classification(
    *,
    filename: str,
    raw_text: str | None,
    text_source: str = "pdf_text",
    table_blocks: list[dict[str, object]] | None = None,
    image_has_visible_content: bool = False,
) -> DeterministicClassificationAssessment:
    normalized_text = normalize_for_matching(raw_text or "")
    normalized_filename = normalize_for_matching(filename)
    searchable = "\n".join(part for part in (normalized_text, normalized_filename) if part)
    table_blocks = list(table_blocks or [])

    candidates = [
        _score_schema_candidate(
            document_kind=document_kind,
            normalized_text=normalized_text,
            normalized_filename=normalized_filename,
            raw_text=raw_text,
            text_source=text_source,
            table_blocks=table_blocks,
        )
        for document_kind in list_supported_document_kinds()
        if document_kind not in {"OTHER", "UNKNOWN"}
    ]
    candidates.extend(_fallback_candidates(searchable=searchable, raw_text=raw_text))
    candidates.append(_unknown_candidate())
    ranked = sorted(candidates, key=lambda candidate: (candidate.score, candidate.document_kind != "UNKNOWN"), reverse=True)
    top_candidate = ranked[0]
    second_candidate = ranked[1] if len(ranked) > 1 else None

    if (
        top_candidate.document_kind not in {"OTHER", "UNKNOWN"}
        and top_candidate.score < 0.28
        and not top_candidate.keyword_hits
        and not top_candidate.filename_hits
        and not top_candidate.required_fields_found
        and not top_candidate.matched_table_templates
    ):
        fallback_candidate = next(
            (candidate for candidate in ranked if candidate.document_kind in {"OTHER", "UNKNOWN"}),
            _unknown_candidate(),
        )
        second_candidate = top_candidate
        top_candidate = fallback_candidate

    if _has_only_filename_signal(top_candidate, raw_text=raw_text):
        second_candidate = top_candidate
        top_candidate = _filename_hint_only_other_candidate(top_candidate)

    confidence = _finalize_confidence(
        top_candidate=top_candidate,
        second_candidate=second_candidate,
        raw_text=raw_text,
        text_source=text_source,
        image_has_visible_content=image_has_visible_content,
    )
    conflicts = _dedupe_strings(top_candidate.conflicts)
    if second_candidate is not None and second_candidate.score >= max(top_candidate.score - _AMBIGUITY_MARGIN, 0.3):
        conflicts.append(
            f"Signals were close between {_kind_label(top_candidate.document_kind)} and "
            f"{_kind_label(second_candidate.document_kind)}."
        )
    if text_source == "ocr":
        conflicts.append("OCR fallback was required, so extracted labels may be incomplete.")
    if raw_text is None and image_has_visible_content:
        conflicts.append("Visible page content was detected, but no extractable text was available.")
    if confidence < LOW_CONFIDENCE_CLASSIFICATION_THRESHOLD:
        conflicts.append("Deterministic evidence stayed low-confidence, so manual review is recommended.")

    matched_by = ";".join(_dedupe_strings(top_candidate.matched_by_parts)[:4]) or "fallback:unknown"
    if not top_candidate.supporting_evidence:
        if top_candidate.document_kind == "UNKNOWN":
            supporting_evidence = ("No stable document-specific signals were found in the extracted content.",)
        else:
            supporting_evidence = (f"Defaulted to {_kind_label(top_candidate.document_kind)} from the available signals.",)
    else:
        supporting_evidence = tuple(_dedupe_strings(top_candidate.supporting_evidence))

    return DeterministicClassificationAssessment(
        document_kind=top_candidate.document_kind,
        document_subtype=top_candidate.document_subtype,
        confidence=confidence,
        matched_by=matched_by,
        supporting_evidence=supporting_evidence,
        conflicts=tuple(_dedupe_strings(conflicts)),
        header_fields=tuple(top_candidate.header_fields),
    )


def serialize_deterministic_assessment(
    assessment: DeterministicClassificationAssessment,
) -> dict[str, object]:
    return {
        "assessment_version": assessment.assessment_version,
        "document_kind": assessment.document_kind,
        "document_subtype": assessment.document_subtype,
        "confidence": assessment.confidence,
        "matched_by": assessment.matched_by,
        "supporting_evidence": list(assessment.supporting_evidence),
        "conflicts": list(assessment.conflicts),
    }


def _score_schema_candidate(
    *,
    document_kind: str,
    normalized_text: str,
    normalized_filename: str,
    raw_text: str | None,
    text_source: str,
    table_blocks: list[dict[str, object]],
) -> _CandidateScore:
    schema = get_document_kind_schema(document_kind)
    candidate = _CandidateScore(document_kind=document_kind)
    if schema is None:
        return candidate

    keyword_hits, filename_hits = _keyword_hits(
        document_kind=document_kind,
        normalized_text=normalized_text,
        normalized_filename=normalized_filename,
    )
    title_hits = _title_keyword_hits(document_kind=document_kind, raw_text=raw_text)
    candidate.keyword_hits = keyword_hits
    candidate.filename_hits = filename_hits
    if keyword_hits:
        candidate.score += min(
            _TEXT_KEYWORD_SCORE + (_EXTRA_TEXT_KEYWORD_SCORE * max(len(keyword_hits) - 1, 0)),
            0.64,
        )
        candidate.matched_by_parts.append(f"text:{keyword_hits[0].replace(' ', '_')}")
        candidate.supporting_evidence.append(
            f"Detected {_kind_label(document_kind).lower()} terminology in extracted text ({', '.join(keyword_hits[:2])})."
        )
    if title_hits:
        candidate.score += _TITLE_KEYWORD_SCORE
        candidate.matched_by_parts.append(f"title:{title_hits[0].replace(' ', '_')}")
        candidate.supporting_evidence.append(
            f"Detected {_kind_label(document_kind).lower()} title line in extracted text ({title_hits[0]})."
        )
    if filename_hits:
        filename_bonus = _FILENAME_KEYWORD_SCORE if not keyword_hits else _FILENAME_KEYWORD_SCORE / 2
        candidate.score += min(filename_bonus + 0.02 * max(len(filename_hits) - 1, 0), 0.18)
        candidate.matched_by_parts.append(f"filename:{filename_hits[0].replace(' ', '_')}")
        candidate.supporting_evidence.append(
            f"Filename also hints at {_kind_label(document_kind).lower()} ({', '.join(filename_hits[:2])})."
        )

    header_fields = extract_document_header_fields(
        document_kind,
        raw_text,
        text_source=text_source,
    )
    candidate.header_fields = list(header_fields)
    found_field_keys = _field_keys(header_fields)
    required_fields = [field.field_key for field in schema.header_fields if field.required]
    candidate.required_fields_found = [field_key for field_key in required_fields if field_key in found_field_keys]
    candidate.missing_required_fields = [field_key for field_key in required_fields if field_key not in found_field_keys]
    if required_fields:
        required_ratio = len(candidate.required_fields_found) / len(required_fields)
        candidate.score += _REQUIRED_FIELD_SCORE * required_ratio
        if candidate.required_fields_found:
            candidate.matched_by_parts.append(
                f"required_fields:{','.join(candidate.required_fields_found[:3])}"
            )
            candidate.supporting_evidence.append(
                f"Matched required {_kind_label(document_kind).lower()} fields: "
                f"{', '.join(_humanized_keys(candidate.required_fields_found[:4]))}."
            )
    matching_keys = [field_key for field_key in schema.matching_keys if field_key in found_field_keys]
    candidate.matching_keys_found = matching_keys
    if schema.matching_keys:
        candidate.score += _MATCHING_KEY_SCORE * (len(matching_keys) / len(schema.matching_keys))
    if matching_keys:
        candidate.supporting_evidence.append(
            f"Found record-linking keys used by {_kind_label(document_kind).lower()}: "
            f"{', '.join(_humanized_keys(matching_keys[:4]))}."
        )

    if schema.header_fields:
        header_coverage = len(found_field_keys) / len(schema.header_fields)
        candidate.score += _HEADER_COVERAGE_SCORE * min(header_coverage, 1.0)

    table_score, matched_template, table_evidence, table_conflicts = _score_table_templates(
        schema=schema,
        table_blocks=table_blocks,
    )
    candidate.score += table_score
    if matched_template is not None:
        candidate.matched_table_templates.append(matched_template)
        candidate.matched_by_parts.append(f"table:{matched_template}")
    if table_evidence is not None:
        candidate.supporting_evidence.append(table_evidence)
    candidate.conflicts.extend(table_conflicts)

    if candidate.keyword_hits and candidate.missing_required_fields and not candidate.required_fields_found:
        candidate.conflicts.append(
            f"Keyword matches suggest {_kind_label(document_kind).lower()}, but expected header fields were not found."
        )

    return candidate


def _score_table_templates(
    *,
    schema: DocumentKindSchemaOut,
    table_blocks: list[dict[str, object]],
) -> tuple[float, str | None, str | None, list[str]]:
    best_score = 0.0
    best_template_key: str | None = None
    best_evidence: str | None = None
    conflicts: list[str] = []

    for template in schema.table_templates:
        template_score, template_evidence = _table_template_match_score(template, table_blocks)
        if template_score > best_score:
            best_score = template_score
            best_template_key = template.template_key
            best_evidence = template_evidence
        if template.min_occurrences > 0 and template_score < 0.12 and table_blocks:
            conflicts.append(
                f"Parsed table content did not cleanly match the expected {template.label.lower()} layout."
            )
    return best_score, best_template_key, best_evidence, conflicts


def _table_template_match_score(
    template: DocumentTableTemplateSchemaOut,
    table_blocks: list[dict[str, object]],
) -> tuple[float, str | None]:
    expected_columns = {
        clean_optional_text(column.column_key, lowercase=True)
        for column in template.columns
        if clean_optional_text(column.column_key, lowercase=True)
    }
    required_columns = {
        clean_optional_text(column.column_key, lowercase=True)
        for column in template.columns
        if column.required and clean_optional_text(column.column_key, lowercase=True)
    }
    if not expected_columns:
        return 0.0, None

    best_score = 0.0
    best_overlap: list[str] = []
    for block in table_blocks:
        block_columns = {
            _canonical_table_column_key(
                clean_optional_text(column, lowercase=True),
                template_key=template.template_key,
            )
            for column in list(block.get("columns") or [])
            if clean_optional_text(column, lowercase=True)
        }
        if not block_columns:
            continue
        overlap = sorted(expected_columns & block_columns)
        if not overlap:
            continue
        overlap_ratio = len(overlap) / len(expected_columns)
        required_ratio = (
            len(required_columns & block_columns) / len(required_columns)
            if required_columns
            else overlap_ratio
        )
        row_count = len(list(block.get("rows") or []))
        score = (_TABLE_TEMPLATE_SCORE * overlap_ratio) + (_TABLE_REQUIRED_SCORE * required_ratio)
        if row_count > 0:
            score += _TABLE_ROW_BONUS
        if overlap_ratio >= _MIN_TEMPLATE_OVERLAP and score > best_score:
            best_score = score
            best_overlap = overlap

    if best_score <= 0 or not best_overlap:
        return 0.0, None
    return (
        best_score,
        f"Parsed table columns align with the {template.label.lower()} layout ({', '.join(_humanized_keys(best_overlap[:4]))}).",
    )


def _canonical_table_column_key(value: str | None, *, template_key: str) -> str | None:
    if value is None:
        return None
    return _TABLE_COLUMN_ALIASES_BY_TEMPLATE.get(template_key, {}).get(value, value)


def _fallback_candidates(*, searchable: str, raw_text: str | None) -> list[_CandidateScore]:
    candidates: list[_CandidateScore] = []
    if "statement" in searchable:
        candidates.append(
            _CandidateScore(
                document_kind="OTHER",
                document_subtype="STATEMENT",
                score=0.38,
                matched_by_parts=["fallback:statement"],
                supporting_evidence=["Detected generic statement terminology without a cleaner typed match."],
            )
        )
    elif raw_text:
        candidates.append(
            _CandidateScore(
                document_kind="OTHER",
                document_subtype=None,
                score=0.18,
                matched_by_parts=["fallback:other"],
                supporting_evidence=["Extracted content exists, but it did not fit a stronger typed document schema."],
            )
        )
    return candidates


def _has_only_filename_signal(candidate: _CandidateScore, *, raw_text: str | None) -> bool:
    if (raw_text or "").strip() or candidate.document_kind in {"OTHER", "UNKNOWN"}:
        return False
    return (
        bool(candidate.filename_hits)
        and not candidate.keyword_hits
        and not candidate.required_fields_found
        and not candidate.matching_keys_found
        and not candidate.matched_table_templates
    )


def _filename_hint_only_other_candidate(candidate: _CandidateScore) -> _CandidateScore:
    hinted_label = _kind_label(candidate.document_kind).lower()
    hits = ", ".join(candidate.filename_hits[:2])
    return _CandidateScore(
        document_kind="OTHER",
        document_subtype="FILENAME_HINT_ONLY",
        score=max(candidate.score, 0.16),
        matched_by_parts=["fallback:filename_hint_only"],
        supporting_evidence=[
            f"Filename hints at {hinted_label} ({hits}), but no extractable content confirmed that type."
        ],
        conflicts=[
            "Only filename hints were available, so the document was placed in Other for manual review."
        ],
    )


def _unknown_candidate() -> _CandidateScore:
    return _CandidateScore(
        document_kind="UNKNOWN",
        document_subtype=None,
        score=0.05,
        matched_by_parts=["fallback:unknown"],
    )


def _keyword_hits(
    *,
    document_kind: str,
    normalized_text: str,
    normalized_filename: str,
) -> tuple[list[str], list[str]]:
    for candidate_kind, keywords in CLASSIFICATION_RULES:
        if candidate_kind != document_kind:
            continue
        text_hits = [keyword for keyword in keywords if keyword in normalized_text]
        filename_hits = [keyword for keyword in keywords if keyword in normalized_filename]
        return text_hits, filename_hits
    return [], []


def _title_keyword_hits(*, document_kind: str, raw_text: str | None) -> list[str]:
    if not raw_text:
        return []
    early_lines = {
        normalize_for_matching(line).strip(" :#.-")
        for line in raw_text.splitlines()[:_TITLE_LINE_SCAN_LIMIT]
        if line.strip()
    }
    if not early_lines:
        return []
    for candidate_kind, keywords in CLASSIFICATION_RULES:
        if candidate_kind != document_kind:
            continue
        return [keyword for keyword in keywords if keyword in early_lines]
    return []


def _field_keys(header_fields: list[dict[str, object]]) -> set[str]:
    keys = {
        clean_optional_text(field.get("field_key"), lowercase=True)
        for field in header_fields
    }
    keys.discard(None)
    return {key for key in keys if key is not None}


def _finalize_confidence(
    *,
    top_candidate: _CandidateScore,
    second_candidate: _CandidateScore | None,
    raw_text: str | None,
    text_source: str,
    image_has_visible_content: bool,
) -> float:
    confidence = min(max(top_candidate.score, 0.05), 0.98)
    if second_candidate is not None:
        margin = top_candidate.score - second_candidate.score
        if margin < _AMBIGUITY_MARGIN:
            confidence = min(confidence, max(0.32, confidence - ((_AMBIGUITY_MARGIN - margin) / 2)))
    if top_candidate.document_kind == "OTHER" and top_candidate.document_subtype == "STATEMENT":
        confidence = min(confidence, 0.45)
    if top_candidate.document_kind == "UNKNOWN":
        confidence = min(confidence, 0.12)
    if raw_text is None:
        confidence = min(confidence, 0.22 if image_has_visible_content else 0.12)
    if text_source == "ocr":
        confidence = min(confidence, 0.86)
    return round(max(confidence, 0.05), 2)


def _humanized_keys(values: list[str]) -> list[str]:
    return [humanize_key(value) for value in values]


def _kind_label(document_kind: str) -> str:
    return document_kind.replace("_", " ").title()


def _dedupe_strings(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped
