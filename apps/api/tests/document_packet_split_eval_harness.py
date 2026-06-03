from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    evaluate_packet_split_correction_replay_suite,
)
from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    format_packet_split_correction_eval_report,
)


_DEFAULT_CORPUS_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "document_packet_split_correction_eval_corpus.json"
)


def load_document_packet_split_correction_eval_corpus(
    path: Path | None = None,
) -> dict[str, Any]:
    corpus_path = path or _DEFAULT_CORPUS_PATH
    return json.loads(corpus_path.read_text(encoding="utf-8"))


def evaluate_document_packet_split_correction_eval_corpus(
    path: Path | None = None,
) -> dict[str, object]:
    corpus = load_document_packet_split_correction_eval_corpus(path)
    thresholds = _mapping(corpus.get("thresholds"))
    return evaluate_packet_split_correction_replay_suite(
        corpus,
        min_exact_match_rate=_optional_float(thresholds.get("min_exact_match_rate"), default=1.0),
        max_mismatch_count=_optional_int(thresholds.get("max_mismatch_count"), default=0),
    )


def format_document_packet_split_correction_eval_report(
    summary: Mapping[str, Any],
) -> str:
    return format_packet_split_correction_eval_report(summary)


def _mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _optional_float(value: object, *, default: float) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return default


def _optional_int(value: object, *, default: int) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return default
