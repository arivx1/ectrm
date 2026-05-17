from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.api.app.db.engine import SessionLocal
from apps.api.tests.document_classification_eval_harness import (
    build_reviewed_document_classification_eval_corpus,
)
from apps.api.tests.document_classification_eval_harness import (
    DocumentClassificationEvalThresholds,
)
from apps.api.tests.document_classification_eval_harness import (
    serialize_document_classification_eval_corpus,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Export a sanitized deterministic document-classification replay corpus from reviewed "
            "document-ingestion pages in the configured database."
        )
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Path where the sanitized replay fixture JSON should be written.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum number of reviewed pages to export.",
    )
    parser.add_argument(
        "--only-corrected",
        action="store_true",
        help="Only export reviewed pages that recorded a manual classification correction.",
    )
    parser.add_argument(
        "--review-status",
        default="REVIEWED",
        help="Document page review status to export. Defaults to REVIEWED.",
    )
    parser.add_argument(
        "--corpus-version",
        default="document-classification-reviewed-replay-v1",
        help="Version label recorded in the exported fixture.",
    )
    parser.add_argument(
        "--min-kind-accuracy",
        type=float,
        default=0.85,
        help="Minimum exact document-kind accuracy threshold stored in the exported corpus.",
    )
    parser.add_argument(
        "--max-false-confidence-count",
        type=int,
        default=0,
        help="Maximum allowed count of wrong predictions at 0.70 confidence or above.",
    )
    parser.add_argument(
        "--low-confidence-threshold",
        type=float,
        default=0.46,
        help="Confidence threshold used to mark low-confidence and review-required cases.",
    )
    parser.add_argument(
        "--max-review-false-negative-count",
        type=int,
        default=0,
        help="Maximum allowed count of cases that expected review recommendation but were not flagged.",
    )
    parser.add_argument(
        "--max-abstain-false-negative-count",
        type=int,
        default=0,
        help="Maximum allowed count of cases that expected abstention but were not abstained.",
    )
    parser.add_argument(
        "--max-low-confidence-false-negative-count",
        type=int,
        default=0,
        help="Maximum allowed count of cases that expected low confidence but were not scored low-confidence.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.limit <= 0:
        raise SystemExit("--limit must be greater than 0")
    if not 0 <= args.min_kind_accuracy <= 1:
        raise SystemExit("--min-kind-accuracy must be between 0 and 1")
    if not 0 <= args.low_confidence_threshold <= 1:
        raise SystemExit("--low-confidence-threshold must be between 0 and 1")
    for field_name in (
        "max_false_confidence_count",
        "max_review_false_negative_count",
        "max_abstain_false_negative_count",
        "max_low_confidence_false_negative_count",
    ):
        if getattr(args, field_name) < 0:
            raise SystemExit(f"--{field_name.replace('_', '-')} must be >= 0")

    with SessionLocal() as session:
        corpus = build_reviewed_document_classification_eval_corpus(
            session,
            corpus_version=args.corpus_version,
            limit=args.limit,
            only_corrected=bool(args.only_corrected),
            review_status=str(args.review_status),
            thresholds=DocumentClassificationEvalThresholds(
                min_kind_accuracy=float(args.min_kind_accuracy),
                max_false_confidence_count=int(args.max_false_confidence_count),
                low_confidence_threshold=float(args.low_confidence_threshold),
                max_review_false_negative_count=int(args.max_review_false_negative_count),
                max_abstain_false_negative_count=int(args.max_abstain_false_negative_count),
                max_low_confidence_false_negative_count=int(args.max_low_confidence_false_negative_count),
            ),
        )

    payload = serialize_document_classification_eval_corpus(corpus)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(
        f"Exported {len(corpus.cases)} reviewed classification replay case(s) to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
