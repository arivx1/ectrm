from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.reference_data.services.asset_reference_normalization import (
    normalize_reference_asset_links,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Normalize reference asset commodity and location links to curated reference codes."
    )
    parser.add_argument("--requested-by", default="codex")
    parser.add_argument(
        "--asset-reality",
        default="REAL",
        help="Restrict normalization to one asset reality value. Pass ALL to normalize every asset.",
    )
    args = parser.parse_args()

    asset_reality = None if args.asset_reality.strip().upper() == "ALL" else args.asset_reality

    with SessionLocal() as session:
        summary = normalize_reference_asset_links(
            session,
            requested_by=args.requested_by,
            asset_reality=asset_reality,
        )

    print(json.dumps(asdict(summary), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
