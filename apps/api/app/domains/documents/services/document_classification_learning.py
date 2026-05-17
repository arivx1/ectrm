from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage

from .document_ingestion_analysis import extract_document_header_fields
from .document_ingestion_common import clean_optional_text
from .document_ingestion_common import normalize_filename
from .document_ingestion_common import normalize_for_matching

LEARNING_VERSION = "content-similarity-v1"
_SIGNATURE_NON_ALPHA_PATTERN = re.compile(r"[^a-z]+")
_SIGNATURE_NUMERIC_TOKEN_PATTERN = re.compile(r"\b\d+\b")
_SIGNATURE_STOP_WORDS = frozenset({"copy", "final", "reviewed", "rev", "signed", "v", "version", "page"})
_CONTENT_STOP_WORDS = frozenset(
    {
        "about",
        "above",
        "after",
        "again",
        "against",
        "also",
        "amount",
        "below",
        "between",
        "could",
        "date",
        "document",
        "from",
        "have",
        "into",
        "other",
        "please",
        "regards",
        "same",
        "should",
        "than",
        "that",
        "their",
        "there",
        "these",
        "they",
        "this",
        "through",
        "trade",
        "under",
        "were",
        "with",
        "would",
        "your",
    }
)
_MAX_UNIGRAM_FEATURES = 18
_MAX_BIGRAM_FEATURES = 10
_MIN_CONTENT_FEATURE_COUNT = 4
_MIN_CONTENT_OVERLAP = 3
_MIN_CONTENT_SIMILARITY = 0.52


@dataclass(frozen=True)
class LearnedClassificationOverride:
    document_kind: str
    document_subtype: str | None
    confidence: float
    example_count: int
    matched_by: str
    content_similarity: float
    filename_matched: bool


def build_document_learning_signature(filename: str) -> str:
    normalized_stem = Path(normalize_filename(filename)).stem.lower()
    normalized_stem = _SIGNATURE_NUMERIC_TOKEN_PATTERN.sub(" ", normalized_stem)
    normalized_stem = _SIGNATURE_NON_ALPHA_PATTERN.sub(" ", normalized_stem)
    tokens = [token for token in normalized_stem.split() if token and token not in _SIGNATURE_STOP_WORDS]
    if not tokens:
        return "document"
    return " ".join(tokens[:8])


def build_document_content_features(raw_text: str | None) -> list[str]:
    normalized_text = normalize_for_matching(raw_text or "")
    if not normalized_text:
        return []

    normalized_text = _SIGNATURE_NUMERIC_TOKEN_PATTERN.sub(" ", normalized_text)
    alpha_text = _SIGNATURE_NON_ALPHA_PATTERN.sub(" ", normalized_text)
    tokens = [
        token
        for token in alpha_text.split()
        if len(token) >= 3 and token not in _CONTENT_STOP_WORDS
    ]
    if not tokens:
        return []

    unigram_counts = Counter(tokens)
    bigram_counts: Counter[str] = Counter()
    for first, second in zip(tokens, tokens[1:]):
        if first == second:
            continue
        bigram_counts[f"{first}_{second}"] += 1

    selected_unigrams = [
        token
        for token, _count in sorted(unigram_counts.items(), key=lambda item: (-item[1], item[0]))[:_MAX_UNIGRAM_FEATURES]
    ]
    selected_bigrams = [
        token
        for token, _count in sorted(bigram_counts.items(), key=lambda item: (-item[1], item[0]))[:_MAX_BIGRAM_FEATURES]
    ]
    return [*selected_unigrams, *selected_bigrams]


def initialize_page_classification_payload(
    *,
    filename: str,
    raw_text: str | None,
    matched_by: str,
    preview_generated: bool,
    image_has_visible_content: bool = False,
    text_source: str,
    document_kind: str,
    document_subtype: str | None,
    confidence: float | None,
    source: str,
    provider: str | None = None,
    model: str | None = None,
    deterministic_assessment: dict[str, object] | None = None,
) -> dict[str, object]:
    content_features = build_document_content_features(raw_text)
    payload: dict[str, object] = {
        "filename": normalize_filename(filename),
        "filename_signature": build_document_learning_signature(filename),
        "content_features": content_features,
        "content_feature_count": len(content_features),
        "preview_generated": preview_generated,
        "image_has_visible_content": image_has_visible_content,
        "text_source": text_source,
        "ocr_used": text_source == "ocr",
        "matched_by": matched_by,
        "system_document_kind": document_kind,
        "system_document_subtype": clean_optional_text(document_subtype),
        "system_classification_confidence": confidence,
        "system_matched_by": matched_by,
        "system_classification_source": source,
        "classification_corrected": False,
        "classification_correction_count": 0,
        "learning_applied": False,
        "learning_example_count": 0,
        "learning_version": LEARNING_VERSION,
    }
    if deterministic_assessment is not None:
        payload["deterministic_assessment"] = deterministic_assessment
    if provider is not None:
        payload["system_classification_provider"] = provider
    if model is not None:
        payload["system_classification_model"] = model
    return payload


def update_system_classification_payload(
    payload: dict[str, object],
    *,
    document_kind: str,
    document_subtype: str | None,
    confidence: float | None,
    matched_by: str,
    source: str,
    provider: str | None = None,
    model: str | None = None,
) -> dict[str, object]:
    updated = dict(payload)
    updated["matched_by"] = matched_by
    updated["system_document_kind"] = document_kind
    updated["system_document_subtype"] = clean_optional_text(document_subtype)
    updated["system_classification_confidence"] = confidence
    updated["system_matched_by"] = matched_by
    updated["system_classification_source"] = source
    if provider is not None:
        updated["system_classification_provider"] = provider
    if model is not None:
        updated["system_classification_model"] = model
    return updated


def apply_learned_classification_override(
    db: Session,
    *,
    page: DocumentIngestionPage,
    filename: str,
) -> None:
    payload = _payload_with_content_features(dict(page.classification_payload or {}), raw_text=page.raw_text)
    learned_override = find_learned_classification_override(
        db,
        filename=filename,
        raw_text=page.raw_text,
    )
    current_subtype = clean_optional_text(page.document_subtype)
    if learned_override is None:
        payload["learning_applied"] = False
        payload["learning_example_count"] = 0
        payload["learning_version"] = LEARNING_VERSION
        page.classification_payload = payload
        return

    if page.document_kind == learned_override.document_kind and current_subtype == learned_override.document_subtype:
        payload["learning_applied"] = False
        payload["learning_example_count"] = learned_override.example_count
        payload["learning_version"] = LEARNING_VERSION
        page.classification_payload = payload
        return

    payload["automated_document_kind"] = page.document_kind
    payload["automated_document_subtype"] = current_subtype
    payload["automated_classification_confidence"] = page.classification_confidence
    payload["automated_matched_by"] = payload.get("system_matched_by") or payload.get("matched_by")
    payload["learning_applied"] = True
    payload["learning_example_count"] = learned_override.example_count
    payload["learning_source"] = "content_similarity"
    payload["learning_similarity"] = learned_override.content_similarity
    payload["learning_filename_assist"] = learned_override.filename_matched
    payload["learning_version"] = LEARNING_VERSION

    page.document_kind = learned_override.document_kind
    page.document_subtype = learned_override.document_subtype
    page.classification_confidence = learned_override.confidence
    learned_header_fields = extract_document_header_fields(
        page.document_kind,
        page.raw_text,
        text_source=_page_text_source_from_payload(payload),
    )
    if learned_header_fields or not list(page.header_fields or []):
        page.header_fields = learned_header_fields
    page.classification_payload = update_system_classification_payload(
        payload,
        document_kind=page.document_kind,
        document_subtype=page.document_subtype,
        confidence=page.classification_confidence,
        matched_by=learned_override.matched_by,
        source="learning",
    )


def record_page_classification_correction(
    page: DocumentIngestionPage,
    *,
    actor_id: str,
    changed_at: datetime,
    previous_document_kind: str,
    previous_document_subtype: str | None,
) -> None:
    payload = _payload_with_content_features(dict(page.classification_payload or {}), raw_text=page.raw_text)
    current_subtype = clean_optional_text(page.document_subtype)
    previous_subtype = clean_optional_text(previous_document_subtype)
    if page.document_kind == previous_document_kind and current_subtype == previous_subtype:
        return

    system_document_kind = _normalize_document_kind(payload.get("system_document_kind")) or previous_document_kind
    system_document_subtype = clean_optional_text(payload.get("system_document_subtype"))
    correction_count = _coerce_positive_int(payload.get("classification_correction_count")) + 1
    corrected = page.document_kind != system_document_kind or current_subtype != system_document_subtype

    payload["classification_correction_count"] = correction_count
    payload["classification_last_changed_at"] = changed_at.isoformat()
    payload["classification_last_changed_by"] = actor_id
    payload["classification_previous_document_kind"] = previous_document_kind
    payload["classification_previous_document_subtype"] = previous_subtype

    if corrected:
        payload["classification_corrected"] = True
        payload["review_override"] = True
        payload["review_override_by"] = actor_id
        payload["review_override_at"] = changed_at.isoformat()
        payload["corrected_document_kind"] = page.document_kind
        payload["corrected_document_subtype"] = current_subtype
    else:
        payload["classification_corrected"] = False
        payload["review_override"] = False
        payload.pop("review_override_by", None)
        payload.pop("review_override_at", None)
        payload.pop("corrected_document_kind", None)
        payload.pop("corrected_document_subtype", None)

    page.classification_payload = payload


def find_learned_classification_override(
    db: Session,
    *,
    filename: str,
    raw_text: str | None,
) -> LearnedClassificationOverride | None:
    current_filename_signature = build_document_learning_signature(filename)
    current_content_features = set(build_document_content_features(raw_text))
    if len(current_content_features) < _MIN_CONTENT_FEATURE_COUNT:
        return None

    rows = db.execute(
        select(
            DocumentIngestion.original_filename,
            DocumentIngestionPage.document_kind,
            DocumentIngestionPage.document_subtype,
            DocumentIngestionPage.classification_payload,
            DocumentIngestionPage.raw_text,
        ).join(
            DocumentIngestionPage,
            DocumentIngestion.document_id == DocumentIngestionPage.document_id,
        )
    ).all()

    correction_counts: Counter[tuple[str, str | None]] = Counter()
    best_similarity_by_class: dict[tuple[str, str | None], float] = {}
    filename_match_by_class: dict[tuple[str, str | None], bool] = {}

    for original_filename, document_kind, document_subtype, classification_payload, candidate_raw_text in rows:
        payload = dict(classification_payload or {})
        if payload.get("classification_corrected") is not True:
            continue

        candidate_payload = _payload_with_content_features(payload, raw_text=candidate_raw_text)
        candidate_content_features = set(candidate_payload.get("content_features") or [])
        if len(candidate_content_features) < _MIN_CONTENT_FEATURE_COUNT:
            continue

        overlap_count = len(current_content_features & candidate_content_features)
        content_similarity = _dice_similarity(current_content_features, candidate_content_features)
        filename_matched = (
            str(candidate_payload.get("filename_signature") or build_document_learning_signature(original_filename))
            == current_filename_signature
        )
        if not _content_similarity_is_reusable(
            overlap_count=overlap_count,
            content_similarity=content_similarity,
        ):
            continue

        corrected_document_kind = _normalize_document_kind(payload.get("corrected_document_kind")) or document_kind
        corrected_document_subtype = clean_optional_text(payload.get("corrected_document_subtype"))
        if not corrected_document_kind:
            continue

        class_key = (corrected_document_kind, corrected_document_subtype)
        correction_counts[class_key] += 1
        best_similarity_by_class[class_key] = max(
            best_similarity_by_class.get(class_key, 0.0),
            content_similarity,
        )
        filename_match_by_class[class_key] = filename_match_by_class.get(class_key, False) or filename_matched

    if len(correction_counts) != 1:
        return None

    (document_kind, document_subtype), example_count = correction_counts.most_common(1)[0]
    best_similarity = best_similarity_by_class[(document_kind, document_subtype)]
    filename_matched = filename_match_by_class[(document_kind, document_subtype)]
    confidence = min(
        0.99,
        0.76 + min(example_count, 4) * 0.04 + min(best_similarity, 1.0) * 0.15 + (0.03 if filename_matched else 0.0),
    )
    matched_by = "learned:content_similarity" if not filename_matched else "learned:content_similarity+filename"
    return LearnedClassificationOverride(
        document_kind=document_kind,
        document_subtype=document_subtype,
        confidence=confidence,
        example_count=example_count,
        matched_by=matched_by,
        content_similarity=best_similarity,
        filename_matched=filename_matched,
    )


def _payload_with_content_features(payload: dict[str, object], *, raw_text: str | None) -> dict[str, object]:
    updated = dict(payload)
    content_features = updated.get("content_features")
    if isinstance(content_features, list) and content_features:
        updated["content_feature_count"] = len(content_features)
        return updated
    computed_content_features = build_document_content_features(raw_text)
    updated["content_features"] = computed_content_features
    updated["content_feature_count"] = len(computed_content_features)
    return updated


def _content_similarity_is_reusable(*, overlap_count: int, content_similarity: float) -> bool:
    return overlap_count >= _MIN_CONTENT_OVERLAP and content_similarity >= _MIN_CONTENT_SIMILARITY


def _dice_similarity(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    intersection_count = len(left & right)
    return (2 * intersection_count) / (len(left) + len(right))


def _page_text_source_from_payload(payload: dict[str, object]) -> str:
    candidate = str(payload.get("text_source", "")).strip().lower()
    if candidate in {"pdf_text", "ocr"}:
        return candidate
    return "pdf_text"


def _normalize_document_kind(value: Any) -> str | None:
    normalized = clean_optional_text(value)
    return normalized.upper() if normalized else None


def _coerce_positive_int(value: Any) -> int:
    if isinstance(value, int) and value >= 0:
        return value
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return 0
    return normalized if normalized >= 0 else 0
