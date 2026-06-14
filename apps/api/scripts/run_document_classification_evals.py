from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.api.tests.document_classification_eval_harness import (
    evaluate_document_classification_corpus,
)
from apps.api.tests.document_classification_eval_harness import (
    format_document_classification_eval_report,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Replay the checked-in deterministic document-classification gold corpus and "
            "report aggregate accuracy plus per-case failures."
        )
    )
    parser.add_argument(
        "--corpus",
        type=Path,
        help="Optional path to a document-classification replay corpus JSON file.",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        help="Optional path where the eval summary should be written as JSON.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero when the replayed corpus misses its thresholds or case expectations.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    summary = evaluate_document_classification_corpus(args.corpus)
    print(format_document_classification_eval_report(summary))

    if args.json_output is not None:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(
            json.dumps(summary.to_dict(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    if args.check and not summary.passed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
