from __future__ import annotations

from dataclasses import asdict
from dataclasses import dataclass
from dataclasses import field
import json
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.documents.services.document_classification_scoring import (
    DeterministicClassificationAssessment,
)
from apps.api.app.domains.documents.services.document_classification_scoring import (
    score_document_page_classification,
)
from apps.api.app.domains.documents.services.document_ingestion_analysis import (
    extract_document_table_blocks,
)
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage

_DEFAULT_CORPUS_PATH = Path(__file__).resolve().parent / "fixtures" / "document_classification_eval_corpus.json"
_ABSTAIN_DOCUMENT_KINDS = frozenset({"UNKNOWN", "OTHER"})
_REDACTED_TEXT_TOKEN = "<text>"


@dataclass(frozen=True)
class DocumentClassificationEvalThresholds:
    min_kind_accuracy: float = 1.0
    max_false_confidence_count: int = 0
    low_confidence_threshold: float = 0.46
    max_review_false_negative_count: int = 0
    max_abstain_false_negative_count: int = 0
    max_low_confidence_false_negative_count: int = 0


@dataclass(frozen=True)
class DocumentClassificationEvalExpectations:
    expected_document_kind: str
    expected_document_subtype: str | None = None
    min_confidence: float | None = None
    max_confidence: float | None = None
    supporting_evidence_contains: tuple[str, ...] = ()
    conflict_contains: tuple[str, ...] = ()
    expect_review_recommended: bool | None = None
    expect_abstain: bool | None = None
    expect_low_confidence: bool | None = None


@dataclass(frozen=True)
class DocumentClassificationEvalCase:
    case_id: str
    filename: str
    raw_text: str | None
    text_source: str
    image_has_visible_content: bool
    expectations: DocumentClassificationEvalExpectations


@dataclass(frozen=True)
class DocumentClassificationEvalCorpus:
    corpus_version: str
    thresholds: DocumentClassificationEvalThresholds
    cases: tuple[DocumentClassificationEvalCase, ...]


@dataclass(frozen=True)
class DocumentClassificationEvalKindMetrics:
    document_kind: str
    case_count: int
    correct_case_count: int
    accuracy: float
    average_confidence: float
    review_recommended_case_count: int
    low_confidence_case_count: int
    abstain_case_count: int


@dataclass(frozen=True)
class DocumentClassificationEvalResult:
    case: DocumentClassificationEvalCase
    assessment: DeterministicClassificationAssessment
    passed: bool
    issues: tuple[str, ...] = ()
    review_recommended: bool = False
    abstained: bool = False
    low_confidence: bool = False

    def to_dict(self) -> dict[str, object]:
        return {
            "case_id": self.case.case_id,
            "filename": self.case.filename,
            "text_source": self.case.text_source,
            "expected_document_kind": self.case.expectations.expected_document_kind,
            "expected_document_subtype": self.case.expectations.expected_document_subtype,
            "actual_document_kind": self.assessment.document_kind,
            "actual_document_subtype": self.assessment.document_subtype,
            "confidence": self.assessment.confidence,
            "matched_by": self.assessment.matched_by,
            "supporting_evidence": list(self.assessment.supporting_evidence),
            "conflicts": list(self.assessment.conflicts),
            "expected_review_recommended": self.case.expectations.expect_review_recommended,
            "actual_review_recommended": self.review_recommended,
            "expected_abstain": self.case.expectations.expect_abstain,
            "actual_abstain": self.abstained,
            "expected_low_confidence": self.case.expectations.expect_low_confidence,
            "actual_low_confidence": self.low_confidence,
            "passed": self.passed,
            "issues": list(self.issues),
        }


@dataclass(frozen=True)
class DocumentClassificationEvalSummary:
    corpus_version: str
    thresholds: DocumentClassificationEvalThresholds
    total_case_count: int
    passed_case_count: int
    kind_accuracy: float
    false_confidence_count: int
    review_recommendation_accuracy: float
    review_false_negative_count: int
    abstain_accuracy: float
    abstain_false_negative_count: int
    low_confidence_accuracy: float
    low_confidence_false_negative_count: int
    covered_document_kinds: tuple[str, ...]
    kind_metrics: tuple[DocumentClassificationEvalKindMetrics, ...] = field(default_factory=tuple)
    confusion_matrix: dict[str, dict[str, int]] = field(default_factory=dict)
    results: tuple[DocumentClassificationEvalResult, ...] = field(default_factory=tuple)

    @property
    def passed(self) -> bool:
        return (
            self.passed_case_count == self.total_case_count
            and self.kind_accuracy >= self.thresholds.min_kind_accuracy
            and self.false_confidence_count <= self.thresholds.max_false_confidence_count
            and self.review_false_negative_count <= self.thresholds.max_review_false_negative_count
            and self.abstain_false_negative_count <= self.thresholds.max_abstain_false_negative_count
            and self.low_confidence_false_negative_count <= self.thresholds.max_low_confidence_false_negative_count
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "corpus_version": self.corpus_version,
            "thresholds": asdict(self.thresholds),
            "total_case_count": self.total_case_count,
            "passed_case_count": self.passed_case_count,
            "kind_accuracy": self.kind_accuracy,
            "false_confidence_count": self.false_confidence_count,
            "review_recommendation_accuracy": self.review_recommendation_accuracy,
            "review_false_negative_count": self.review_false_negative_count,
            "abstain_accuracy": self.abstain_accuracy,
            "abstain_false_negative_count": self.abstain_false_negative_count,
            "low_confidence_accuracy": self.low_confidence_accuracy,
            "low_confidence_false_negative_count": self.low_confidence_false_negative_count,
            "covered_document_kinds": list(self.covered_document_kinds),
            "kind_metrics": [asdict(metric) for metric in self.kind_metrics],
            "confusion_matrix": self.confusion_matrix,
            "passed": self.passed,
            "results": [result.to_dict() for result in self.results],
        }


def load_document_classification_eval_corpus(
    path: Path | None = None,
) -> DocumentClassificationEvalCorpus:
    corpus_path = path or _DEFAULT_CORPUS_PATH
    payload = json.loads(corpus_path.read_text(encoding="utf-8"))
    thresholds_payload = payload.get("thresholds") or {}
    thresholds = DocumentClassificationEvalThresholds(
        min_kind_accuracy=float(thresholds_payload.get("min_kind_accuracy", 1.0)),
        max_false_confidence_count=int(thresholds_payload.get("max_false_confidence_count", 0)),
        low_confidence_threshold=float(thresholds_payload.get("low_confidence_threshold", 0.46)),
        max_review_false_negative_count=int(thresholds_payload.get("max_review_false_negative_count", 0)),
        max_abstain_false_negative_count=int(thresholds_payload.get("max_abstain_false_negative_count", 0)),
        max_low_confidence_false_negative_count=int(thresholds_payload.get("max_low_confidence_false_negative_count", 0)),
    )
    cases = tuple(_parse_case(item) for item in list(payload.get("cases") or []))
    return DocumentClassificationEvalCorpus(
        corpus_version=str(payload.get("corpus_version") or "document-classification-eval-corpus"),
        thresholds=thresholds,
        cases=cases,
    )


def evaluate_document_classification_corpus(
    path: Path | None = None,
) -> DocumentClassificationEvalSummary:
    corpus = load_document_classification_eval_corpus(path)
    results = tuple(
        run_document_classification_eval_case(case, low_confidence_threshold=corpus.thresholds.low_confidence_threshold)
        for case in corpus.cases
    )
    total_case_count = len(results)
    passed_case_count = sum(1 for result in results if result.passed)
    exact_kind_matches = sum(
        1
        for result in results
        if result.assessment.document_kind == result.case.expectations.expected_document_kind
    )
    false_confidence_count = sum(
        1
        for result in results
        if result.assessment.document_kind != result.case.expectations.expected_document_kind
        and result.assessment.confidence >= 0.7
    )
    review_expected = [result for result in results if result.case.expectations.expect_review_recommended is not None]
    abstain_expected = [result for result in results if result.case.expectations.expect_abstain is not None]
    low_confidence_expected = [result for result in results if result.case.expectations.expect_low_confidence is not None]
    covered_document_kinds = tuple(
        sorted({result.case.expectations.expected_document_kind for result in results})
    )
    kind_metrics = _build_kind_metrics(results)
    confusion_matrix = _build_confusion_matrix(results)
    return DocumentClassificationEvalSummary(
        corpus_version=corpus.corpus_version,
        thresholds=corpus.thresholds,
        total_case_count=total_case_count,
        passed_case_count=passed_case_count,
        kind_accuracy=(exact_kind_matches / total_case_count) if total_case_count else 0.0,
        false_confidence_count=false_confidence_count,
        review_recommendation_accuracy=_boolean_accuracy(
            review_expected,
            expected_getter=lambda result: result.case.expectations.expect_review_recommended,
            actual_getter=lambda result: result.review_recommended,
        ),
        review_false_negative_count=_false_negative_count(
            review_expected,
            expected_getter=lambda result: result.case.expectations.expect_review_recommended,
            actual_getter=lambda result: result.review_recommended,
        ),
        abstain_accuracy=_boolean_accuracy(
            abstain_expected,
            expected_getter=lambda result: result.case.expectations.expect_abstain,
            actual_getter=lambda result: result.abstained,
        ),
        abstain_false_negative_count=_false_negative_count(
            abstain_expected,
            expected_getter=lambda result: result.case.expectations.expect_abstain,
            actual_getter=lambda result: result.abstained,
        ),
        low_confidence_accuracy=_boolean_accuracy(
            low_confidence_expected,
            expected_getter=lambda result: result.case.expectations.expect_low_confidence,
            actual_getter=lambda result: result.low_confidence,
        ),
        low_confidence_false_negative_count=_false_negative_count(
            low_confidence_expected,
            expected_getter=lambda result: result.case.expectations.expect_low_confidence,
            actual_getter=lambda result: result.low_confidence,
        ),
        covered_document_kinds=covered_document_kinds,
        kind_metrics=kind_metrics,
        confusion_matrix=confusion_matrix,
        results=results,
    )


def run_document_classification_eval_case(
    case: DocumentClassificationEvalCase,
    *,
    low_confidence_threshold: float = 0.46,
) -> DocumentClassificationEvalResult:
    table_blocks = (
        extract_document_table_blocks(case.raw_text, text_source=case.text_source)
        if case.raw_text
        else []
    )
    assessment = score_document_page_classification(
        filename=case.filename,
        raw_text=case.raw_text,
        text_source=case.text_source,
        table_blocks=table_blocks,
        image_has_visible_content=case.image_has_visible_content,
    )
    abstained = _assessment_abstained(assessment)
    low_confidence = _assessment_low_confidence(
        assessment,
        low_confidence_threshold=low_confidence_threshold,
    )
    review_recommended = abstained or low_confidence or _assessment_mentions_manual_review(assessment)
    issues = _case_issues(
        case=case,
        assessment=assessment,
        review_recommended=review_recommended,
        abstained=abstained,
        low_confidence=low_confidence,
    )
    return DocumentClassificationEvalResult(
        case=case,
        assessment=assessment,
        passed=not issues,
        issues=tuple(issues),
        review_recommended=review_recommended,
        abstained=abstained,
        low_confidence=low_confidence,
    )


def format_document_classification_eval_report(
    summary: DocumentClassificationEvalSummary,
) -> str:
    lines = [
        f"Corpus: {summary.corpus_version}",
        f"Cases: {summary.passed_case_count}/{summary.total_case_count} passed",
        f"Kind accuracy: {summary.kind_accuracy:.0%}",
        f"False-confidence count: {summary.false_confidence_count}",
        f"Review-recommendation accuracy: {summary.review_recommendation_accuracy:.0%}"
        f" (false negatives: {summary.review_false_negative_count})",
        f"Abstain accuracy: {summary.abstain_accuracy:.0%}"
        f" (false negatives: {summary.abstain_false_negative_count})",
        f"Low-confidence accuracy: {summary.low_confidence_accuracy:.0%}"
        f" (false negatives: {summary.low_confidence_false_negative_count})",
        f"Covered kinds: {', '.join(summary.covered_document_kinds)}",
    ]
    if summary.kind_metrics:
        lines.append("Per-kind metrics:")
        for metric in summary.kind_metrics:
            lines.append(
                f"- {metric.document_kind}: {metric.correct_case_count}/{metric.case_count}"
                f" correct, avg confidence {metric.average_confidence:.2f},"
                f" abstain {metric.abstain_case_count},"
                f" low-confidence {metric.low_confidence_case_count},"
                f" review-recommended {metric.review_recommended_case_count}"
            )
    confusion_pairs = [
        (expected_kind, actual_kind, count)
        for expected_kind, actuals in summary.confusion_matrix.items()
        for actual_kind, count in actuals.items()
        if expected_kind != actual_kind and count > 0
    ]
    if confusion_pairs:
        lines.append("Confusion summary:")
        for expected_kind, actual_kind, count in sorted(confusion_pairs, key=lambda item: (-item[2], item[0], item[1]))[:8]:
            lines.append(f"- expected {expected_kind}, predicted {actual_kind}: {count}")
    failing_results = [result for result in summary.results if not result.passed]
    if not failing_results:
        lines.append("Failing cases: none")
        return "\n".join(lines)

    lines.append("Failing cases:")
    for result in failing_results:
        lines.append(
            f"- {result.case.case_id}: predicted {result.assessment.document_kind}"
            f" at {result.assessment.confidence:.2f}"
        )
        for issue in result.issues:
            lines.append(f"  * {issue}")
    return "\n".join(lines)


def _parse_case(payload: dict[str, Any]) -> DocumentClassificationEvalCase:
    expectations_payload = dict(payload.get("expectations") or {})
    expectations = DocumentClassificationEvalExpectations(
        expected_document_kind=str(expectations_payload["expected_document_kind"]).strip().upper(),
        expected_document_subtype=_optional_text(expectations_payload.get("expected_document_subtype")),
        min_confidence=_optional_float(expectations_payload.get("min_confidence")),
        max_confidence=_optional_float(expectations_payload.get("max_confidence")),
        supporting_evidence_contains=tuple(
            str(item).strip()
            for item in list(expectations_payload.get("supporting_evidence_contains") or [])
            if str(item).strip()
        ),
        conflict_contains=tuple(
            str(item).strip()
            for item in list(expectations_payload.get("conflict_contains") or [])
            if str(item).strip()
        ),
        expect_review_recommended=_optional_bool(expectations_payload.get("expect_review_recommended")),
        expect_abstain=_optional_bool(expectations_payload.get("expect_abstain")),
        expect_low_confidence=_optional_bool(expectations_payload.get("expect_low_confidence")),
    )
    raw_text = payload.get("raw_text")
    return DocumentClassificationEvalCase(
        case_id=str(payload["case_id"]).strip(),
        filename=str(payload["filename"]).strip(),
        raw_text=str(raw_text) if isinstance(raw_text, str) else None,
        text_source=_optional_text(payload.get("text_source")) or "pdf_text",
        image_has_visible_content=bool(payload.get("image_has_visible_content")),
        expectations=expectations,
    )


def _case_issues(
    *,
    case: DocumentClassificationEvalCase,
    assessment: DeterministicClassificationAssessment,
    review_recommended: bool,
    abstained: bool,
    low_confidence: bool,
) -> list[str]:
    issues: list[str] = []
    expectations = case.expectations
    if assessment.document_kind != expectations.expected_document_kind:
        issues.append(
            f"expected document kind {expectations.expected_document_kind}, got {assessment.document_kind}"
        )
    if expectations.expected_document_subtype != assessment.document_subtype:
        issues.append(
            f"expected document subtype {expectations.expected_document_subtype!r}, "
            f"got {assessment.document_subtype!r}"
        )
    if expectations.min_confidence is not None and assessment.confidence < expectations.min_confidence:
        issues.append(
            f"expected confidence >= {expectations.min_confidence:.2f}, got {assessment.confidence:.2f}"
        )
    if expectations.max_confidence is not None and assessment.confidence > expectations.max_confidence:
        issues.append(
            f"expected confidence <= {expectations.max_confidence:.2f}, got {assessment.confidence:.2f}"
        )

    supporting_evidence = "\n".join(assessment.supporting_evidence).lower()
    conflicts = "\n".join(assessment.conflicts).lower()
    for snippet in expectations.supporting_evidence_contains:
        if snippet.lower() not in supporting_evidence:
            issues.append(f"missing supporting evidence snippet: {snippet}")
    for snippet in expectations.conflict_contains:
        if snippet.lower() not in conflicts:
            issues.append(f"missing conflict snippet: {snippet}")
    if expectations.expect_review_recommended is not None and review_recommended != expectations.expect_review_recommended:
        issues.append(
            f"expected review_recommended={expectations.expect_review_recommended}, got {review_recommended}"
        )
    if expectations.expect_abstain is not None and abstained != expectations.expect_abstain:
        issues.append(
            f"expected abstain={expectations.expect_abstain}, got {abstained}"
        )
    if expectations.expect_low_confidence is not None and low_confidence != expectations.expect_low_confidence:
        issues.append(
            f"expected low_confidence={expectations.expect_low_confidence}, got {low_confidence}"
        )
    return issues


def build_reviewed_document_classification_eval_corpus(
    session: Session,
    *,
    corpus_version: str = "document-classification-reviewed-replay-v1",
    limit: int = 100,
    only_corrected: bool = False,
    review_status: str = "REVIEWED",
    thresholds: DocumentClassificationEvalThresholds | None = None,
) -> DocumentClassificationEvalCorpus:
    normalized_review_status = review_status.strip().upper()
    rows = session.execute(
        select(DocumentIngestion, DocumentIngestionPage)
        .join(DocumentIngestionPage, DocumentIngestion.document_id == DocumentIngestionPage.document_id)
        .where(DocumentIngestionPage.review_status == normalized_review_status)
        .order_by(DocumentIngestion.updated_at.desc(), DocumentIngestionPage.page_number.asc())
    ).all()

    cases: list[DocumentClassificationEvalCase] = []
    for document, page in rows:
        payload = dict(page.classification_payload or {})
        if only_corrected and payload.get("classification_corrected") is not True:
            continue
        case = _build_reviewed_eval_case(
            document=document,
            page=page,
            payload=payload,
            case_index=len(cases) + 1,
        )
        if case is None:
            continue
        cases.append(case)
        if len(cases) >= limit:
            break

    return DocumentClassificationEvalCorpus(
        corpus_version=corpus_version,
        thresholds=thresholds or DocumentClassificationEvalThresholds(),
        cases=tuple(cases),
    )


def serialize_document_classification_eval_corpus(
    corpus: DocumentClassificationEvalCorpus,
) -> dict[str, object]:
    return {
        "corpus_version": corpus.corpus_version,
        "thresholds": asdict(corpus.thresholds),
        "cases": [
            {
                "case_id": case.case_id,
                "filename": case.filename,
                "raw_text": case.raw_text,
                "text_source": case.text_source,
                "image_has_visible_content": case.image_has_visible_content,
                "expectations": {
                    "expected_document_kind": case.expectations.expected_document_kind,
                    "expected_document_subtype": case.expectations.expected_document_subtype,
                    "min_confidence": case.expectations.min_confidence,
                    "max_confidence": case.expectations.max_confidence,
                    "supporting_evidence_contains": list(case.expectations.supporting_evidence_contains),
                    "conflict_contains": list(case.expectations.conflict_contains),
                    "expect_review_recommended": case.expectations.expect_review_recommended,
                    "expect_abstain": case.expectations.expect_abstain,
                    "expect_low_confidence": case.expectations.expect_low_confidence,
                },
            }
            for case in corpus.cases
        ],
    }


def _build_reviewed_eval_case(
    *,
    document: DocumentIngestion,
    page: DocumentIngestionPage,
    payload: dict[str, object],
    case_index: int,
) -> DocumentClassificationEvalCase | None:
    synthesized_text = _build_sanitized_replay_text(page=page)
    if synthesized_text is None:
        return None

    expect_abstain = page.document_kind in _ABSTAIN_DOCUMENT_KINDS
    expect_review_recommended = bool(payload.get("classification_corrected")) or expect_abstain
    expect_low_confidence = bool(payload.get("classification_corrected")) or expect_abstain
    return DocumentClassificationEvalCase(
        case_id=f"reviewed_case_{case_index:04d}",
        filename=f"reviewed-document-{case_index:04d}.pdf",
        raw_text=synthesized_text,
        text_source=_optional_text(payload.get("text_source")) or "pdf_text",
        image_has_visible_content=bool(payload.get("image_has_visible_content")),
        expectations=DocumentClassificationEvalExpectations(
            expected_document_kind=page.document_kind.strip().upper(),
            expected_document_subtype=_optional_text(page.document_subtype),
            expect_review_recommended=expect_review_recommended,
            expect_abstain=expect_abstain,
            expect_low_confidence=expect_low_confidence,
        ),
    )


def _build_sanitized_replay_text(page: DocumentIngestionPage) -> str | None:
    header_fields = list(page.header_fields or [])
    table_blocks = list(page.table_blocks or [])
    lines: list[str] = []

    for field_payload in header_fields:
        field_key = _optional_text(field_payload.get("field_key")) or "field"
        label = _optional_text(field_payload.get("label")) or field_key.replace("_", " ").title()
        lines.append(f"{label}: {_placeholder_for_key(field_key)}")

    for table_block in table_blocks:
        columns = [
            _optional_text(column) or "column"
            for column in list(table_block.get("columns") or [])
        ]
        normalized_columns = [column for column in columns if column]
        if not normalized_columns:
            continue
        lines.append("")
        lines.append("  ".join(column.replace("_", " ").title() for column in normalized_columns))
        lines.append("  ".join(_placeholder_for_key(column) for column in normalized_columns))

    if lines:
        return "\n".join(lines).strip() or None
    return _sanitize_free_text(page.raw_text)


def _sanitize_free_text(raw_text: str | None) -> str | None:
    if raw_text is None:
        return None
    sanitized_lines: list[str] = []
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if ":" in stripped:
            key, _separator, _value = stripped.partition(":")
            sanitized_lines.append(f"{key.strip()}: {_placeholder_for_key(key)}")
            continue
        tokens = stripped.split()
        sanitized_tokens = [
            _preserve_or_redact_token(token)
            for token in tokens
        ]
        sanitized_line = " ".join(token for token in sanitized_tokens if token)
        if sanitized_line:
            sanitized_lines.append(sanitized_line)
    sanitized_text = "\n".join(sanitized_lines).strip()
    return sanitized_text or None


def _preserve_or_redact_token(token: str) -> str:
    normalized = token.strip()
    if not normalized:
        return ""
    lowercase = normalized.lower().strip(",.:;()[]{}")
    if lowercase in {
        "invoice",
        "confirmation",
        "statement",
        "trade",
        "broker",
        "pipeline",
        "nomination",
        "quality",
        "specification",
        "certificate",
        "analysis",
        "safety",
        "data",
        "sheet",
        "bill",
        "lading",
        "truck",
        "ticket",
        "delivery",
        "account",
        "product",
        "amount",
        "quantity",
        "description",
        "period",
        "date",
    }:
        return normalized
    if any(character.isdigit() for character in normalized):
        return "<number>"
    if normalized.isupper() and len(normalized) <= 5:
        return normalized
    return _REDACTED_TEXT_TOKEN


def _placeholder_for_key(value: str) -> str:
    normalized = value.strip().lower().replace(" ", "_")
    if any(keyword in normalized for keyword in ("date", "period_start", "period_end", "start", "end", "expiration")):
        return "<date>"
    if any(keyword in normalized for keyword in ("amount", "price", "line_amount", "total")):
        return "<amount>"
    if any(keyword in normalized for keyword in ("quantity", "volume", "weight")):
        return "<quantity>"
    if any(keyword in normalized for keyword in ("counterparty", "sender", "broker", "carrier", "customer")):
        return "<party>"
    if any(keyword in normalized for keyword in ("origin", "destination", "location", "port")):
        return "<location>"
    if any(keyword in normalized for keyword in ("product", "commodity", "spec_name")):
        return "<product>"
    if any(keyword in normalized for keyword in ("number", "reference", "id", "account", "ticket", "contract", "invoice")):
        return "<identifier>"
    return _REDACTED_TEXT_TOKEN


def _assessment_abstained(assessment: DeterministicClassificationAssessment) -> bool:
    return assessment.document_kind in _ABSTAIN_DOCUMENT_KINDS


def _assessment_low_confidence(
    assessment: DeterministicClassificationAssessment,
    *,
    low_confidence_threshold: float,
) -> bool:
    return assessment.confidence <= low_confidence_threshold


def _assessment_mentions_manual_review(assessment: DeterministicClassificationAssessment) -> bool:
    return any("manual review" in conflict.lower() for conflict in assessment.conflicts)


def _boolean_accuracy(results, *, expected_getter, actual_getter) -> float:
    if not results:
        return 1.0
    matches = sum(1 for result in results if expected_getter(result) == actual_getter(result))
    return matches / len(results)


def _false_negative_count(results, *, expected_getter, actual_getter) -> int:
    return sum(
        1
        for result in results
        if expected_getter(result) is True and actual_getter(result) is False
    )


def _build_kind_metrics(
    results: tuple[DocumentClassificationEvalResult, ...],
) -> tuple[DocumentClassificationEvalKindMetrics, ...]:
    by_kind: dict[str, list[DocumentClassificationEvalResult]] = {}
    for result in results:
        by_kind.setdefault(result.case.expectations.expected_document_kind, []).append(result)

    metrics: list[DocumentClassificationEvalKindMetrics] = []
    for document_kind, kind_results in sorted(by_kind.items()):
        case_count = len(kind_results)
        correct_case_count = sum(1 for result in kind_results if result.assessment.document_kind == document_kind)
        metrics.append(
            DocumentClassificationEvalKindMetrics(
                document_kind=document_kind,
                case_count=case_count,
                correct_case_count=correct_case_count,
                accuracy=(correct_case_count / case_count) if case_count else 0.0,
                average_confidence=(
                    sum(result.assessment.confidence for result in kind_results) / case_count
                ) if case_count else 0.0,
                review_recommended_case_count=sum(1 for result in kind_results if result.review_recommended),
                low_confidence_case_count=sum(1 for result in kind_results if result.low_confidence),
                abstain_case_count=sum(1 for result in kind_results if result.abstained),
            )
        )
    return tuple(metrics)


def _build_confusion_matrix(
    results: tuple[DocumentClassificationEvalResult, ...],
) -> dict[str, dict[str, int]]:
    confusion: dict[str, dict[str, int]] = {}
    for result in results:
        expected = result.case.expectations.expected_document_kind
        actual = result.assessment.document_kind
        confusion.setdefault(expected, {})
        confusion[expected][actual] = confusion[expected].get(actual, 0) + 1
    return confusion


def _optional_text(value: object | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _optional_float(value: object | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _optional_bool(value: object | None) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise ValueError(f"Cannot coerce {value!r} to bool")
