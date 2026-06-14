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
from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    PACKET_SPLIT_REPLAY_SUITE_VERSION,
)
from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    build_packet_split_correction_replay_suite,
)
from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    evaluate_packet_split_correction_replay_suite,
)
from apps.api.app.domains.documents.services.document_packet_split_corrections import (
    format_packet_split_correction_eval_report,
)
from apps.api.tests.document_packet_split_eval_harness import (
    load_document_packet_split_correction_eval_corpus,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Export captured document packet-split corrections as replay fixtures and "
            "evaluate the current deterministic split detector against them."
        )
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        help="Optional existing packet-split correction fixture suite JSON to evaluate.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path where the generated fixture suite JSON should be written.",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        help="Optional path where the eval summary should be written as JSON.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum number of correction events to export from the configured database.",
    )
    parser.add_argument(
        "--document-id",
        action="append",
        default=[],
        help="Restrict export to a document id. May be provided more than once.",
    )
    parser.add_argument(
        "--suite-version",
        default=PACKET_SPLIT_REPLAY_SUITE_VERSION,
        help="Version label recorded in generated fixture suites.",
    )
    parser.add_argument(
        "--min-exact-match-rate",
        type=float,
        default=1.0,
        help="Minimum exact packet-split match rate required when --check is used.",
    )
    parser.add_argument(
        "--max-mismatch-count",
        type=int,
        default=0,
        help="Maximum mismatched replay cases allowed when --check is used.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero when the replay summary misses its thresholds.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.limit <= 0:
        raise SystemExit("--limit must be greater than 0")
    if not 0 <= args.min_exact_match_rate <= 1:
        raise SystemExit("--min-exact-match-rate must be between 0 and 1")
    if args.max_mismatch_count < 0:
        raise SystemExit("--max-mismatch-count must be >= 0")

    if args.fixture is not None:
        suite = load_document_packet_split_correction_eval_corpus(args.fixture)
    else:
        with SessionLocal() as session:
            suite = build_packet_split_correction_replay_suite(
                session,
                limit=int(args.limit),
                document_ids=list(args.document_id or []),
                suite_version=str(args.suite_version),
            )

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(suite, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"Exported {len(suite.get('cases') or [])} packet split correction case(s) to {args.output}")

    summary = evaluate_packet_split_correction_replay_suite(
        suite,
        min_exact_match_rate=float(args.min_exact_match_rate),
        max_mismatch_count=int(args.max_mismatch_count),
    )
    print(format_packet_split_correction_eval_report(summary))

    if args.json_output is not None:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(
            json.dumps(summary, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    if args.check and not summary["passed"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
