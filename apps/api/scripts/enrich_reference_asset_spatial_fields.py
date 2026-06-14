from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.reference_data.services.asset_spatial_enrichment import (
    enrich_reference_asset_spatial_fields,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Hydrate reference asset spatial fields from upstream source catalogs."
    )
    parser.add_argument("--requested-by", default="codex")
    parser.add_argument(
        "--asset-reality",
        default="REAL",
        help="Restrict enrichment to one asset reality value. Pass ALL to enrich every matching asset.",
    )
    args = parser.parse_args()

    asset_reality = None if args.asset_reality.strip().upper() == "ALL" else args.asset_reality

    with SessionLocal() as session:
        summary = enrich_reference_asset_spatial_fields(
            session,
            requested_by=args.requested_by,
            asset_reality=asset_reality,
        )

    print(json.dumps(asdict(summary), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
