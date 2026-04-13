from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path

from apps.api.app.domains.trading.services.trade_metadata import build_trade_metadata_contract

DEFAULT_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "contracts" / "trade-metadata.contract.json"


def render_trade_metadata_contract() -> str:
    payload = build_trade_metadata_contract().model_dump(mode="json")
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def write_trade_metadata_contract(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_trade_metadata_contract(), encoding="utf-8")


def check_trade_metadata_contract(output_path: Path) -> int:
    rendered = render_trade_metadata_contract()
    if not output_path.exists():
        print(
            f"Missing contract artifact: {output_path}. Run 'make api-contract-refresh' to create it.",
            file=sys.stderr,
        )
        return 1

    existing = output_path.read_text(encoding="utf-8")
    if existing == rendered:
        print(f"Trade metadata contract is up to date: {output_path}")
        return 0

    diff = "".join(
        difflib.unified_diff(
            existing.splitlines(keepends=True),
            rendered.splitlines(keepends=True),
            fromfile=str(output_path),
            tofile=f"{output_path} (expected)",
        )
    )
    print(
        "Trade metadata contract drift detected. Run 'make api-contract-refresh' and commit the updated artifact.\n"
        + diff,
        file=sys.stderr,
    )
    return 1


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Refresh or verify the committed trade metadata contract artifact.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help=f"Artifact path to write or verify. Defaults to {DEFAULT_OUTPUT_PATH}.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify the committed artifact matches the current backend contract.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    output_path = args.output.resolve()
    if args.check:
        return check_trade_metadata_contract(output_path)

    write_trade_metadata_contract(output_path)
    print(f"Wrote trade metadata contract artifact to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
