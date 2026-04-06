from __future__ import annotations

import argparse
import json
from pathlib import Path

from apps.api.app.shared.robinhood_csv import parse_robinhood_csv
from apps.api.app.shared.robinhood_report import render_robinhood_report_text
from apps.api.app.shared.robinhood_report import summarize_robinhood_rows


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Summarize a Robinhood account activity CSV into cash-flow and symbol rollups.",
    )
    parser.add_argument("--input", required=True, help="Path to the Robinhood CSV export.")
    parser.add_argument(
        "--top-symbols",
        type=int,
        default=10,
        help="Number of symbols to include in the report output.",
    )
    parser.add_argument(
        "--json-output",
        help="Optional path to write the report as JSON.",
    )
    return parser


def main() -> int:
    args = build_arg_parser().parse_args()
    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        print(f"Robinhood summary failed: input file not found: {input_path}")
        return 1

    try:
        rows, _ = parse_robinhood_csv(input_path)
        report = summarize_robinhood_rows(rows, top_symbols=args.top_symbols)
    except Exception as exc:  # pragma: no cover - defensive CLI boundary
        print(f"Robinhood summary failed: {exc}")
        return 1

    print(render_robinhood_report_text(report))

    if args.json_output:
        output_path = Path(args.json_output).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report.to_dict(), indent=2) + "\n", encoding="utf-8")
        print(f"JSON report written to {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
