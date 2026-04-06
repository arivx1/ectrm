from __future__ import annotations

import argparse
from pathlib import Path

from apps.api.app.shared.robinhood_csv import derive_default_output_path
from apps.api.app.shared.robinhood_csv import parse_robinhood_csv
from apps.api.app.shared.robinhood_csv import write_normalized_csv
from apps.api.app.shared.robinhood_csv import write_normalized_json


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Normalize a Robinhood account activity CSV into analysis-friendly JSON or CSV.",
    )
    parser.add_argument("--input", required=True, help="Path to the Robinhood CSV export.")
    parser.add_argument(
        "--output",
        help="Path to write the normalized file. Defaults to <input>.normalized.<format>.",
    )
    parser.add_argument(
        "--format",
        choices=("json", "csv"),
        default="json",
        help="Output format for the normalized file.",
    )
    parser.add_argument(
        "--include-raw",
        action="store_true",
        help="Include the original source cells in the normalized output.",
    )
    return parser


def main() -> int:
    args = build_arg_parser().parse_args()
    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        print(f"Robinhood import failed: input file not found: {input_path}")
        return 1

    output_path = Path(args.output).expanduser().resolve() if args.output else derive_default_output_path(
        input_path,
        output_format=args.format,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        rows, summary = parse_robinhood_csv(input_path, include_raw=args.include_raw)
        if args.format == "csv":
            write_normalized_csv(output_path, rows=rows, include_raw=args.include_raw)
        else:
            write_normalized_json(
                output_path,
                rows=rows,
                summary=summary,
                include_raw=args.include_raw,
            )
    except Exception as exc:  # pragma: no cover - defensive CLI boundary
        print(f"Robinhood import failed: {exc}")
        return 1

    print(f"Wrote {len(rows)} normalized rows to {output_path}")
    if summary.field_mapping:
        mapped_headers = ", ".join(
            f"{field}={header}" for field, header in sorted(summary.field_mapping.items())
        )
        print(f"Matched headers: {mapped_headers}")
    if summary.activity_families:
        activity_summary = ", ".join(
            f"{family}={count}" for family, count in sorted(summary.activity_families.items())
        )
        print(f"Activity families: {activity_summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
