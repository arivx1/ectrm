from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any

CLASSIFIER_VERSION = "deterministic-v2-content-reviewed-learning"
EXTRACTOR_VERSION = "regex-v2-preview-ocr"
DOCUMENT_PROCESSOR_ACTOR_ID = "document_processor"
RAW_TEXT_EXCERPT_LENGTH = 280
TABLE_LINE_SPLIT_PATTERN = re.compile(r"\t+|\s{2,}")
WHITESPACE_PATTERN = re.compile(r"\s+")
PREVIEW_SUBDIRECTORY = "previews"
PREVIEW_IMAGE_EXTENSION = ".png"
PREVIEW_IMAGE_MEDIA_TYPE = "image/png"


@dataclass(frozen=True)
class PageClassification:
    document_kind: str
    document_subtype: str | None
    confidence: float
    matched_by: str


@dataclass(frozen=True)
class FieldDefinition:
    field_key: str
    label: str
    patterns: tuple[str, ...]


def clean_field_value(value: str) -> str:
    return WHITESPACE_PATTERN.sub(" ", value).strip(" :")


def clean_optional_text(value: Any, *, lowercase: bool = False) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    return normalized.lower() if lowercase else normalized


def normalize_key(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9_]+", "_", value.strip().lower()).strip("_")
    if not normalized:
        return ""
    if not normalized[0].isalpha():
        normalized = f"field_{normalized}"
    return normalized[:64]


def humanize_key(value: str) -> str:
    return value.replace("_", " ").title()


def build_raw_text_excerpt(raw_text: str | None) -> str | None:
    if not raw_text:
        return None
    normalized = WHITESPACE_PATTERN.sub(" ", raw_text).strip()
    if len(normalized) <= RAW_TEXT_EXCERPT_LENGTH:
        return normalized
    return f"{normalized[: RAW_TEXT_EXCERPT_LENGTH - 3]}..."


def normalize_filename(filename: str) -> str:
    cleaned = Path(filename or "document.pdf").name.strip()
    return cleaned or "document.pdf"


def normalize_display_name(display_name: str | None, filename: str) -> str:
    if display_name and display_name.strip():
        return display_name.strip()
    stem = Path(filename).stem.strip()
    return stem or "Uploaded PDF"


def normalize_for_matching(value: str) -> str:
    return WHITESPACE_PATTERN.sub(" ", value.lower()).strip()


def clean_extracted_text(raw_text: str | None) -> str | None:
    if not raw_text:
        return None
    normalized = raw_text.replace("\x00", " ")
    normalized = "\n".join(line.rstrip() for line in normalized.splitlines())
    normalized = normalized.strip()
    return normalized or None
