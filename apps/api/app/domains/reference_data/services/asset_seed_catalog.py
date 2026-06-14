from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

REAL_ASSET_CANDIDATE_ROW_COUNT = 25
_DATA_DIRECTORY = Path(__file__).resolve().parent / "data"
REAL_ASSET_CANDIDATE_DATA_PATH = _DATA_DIRECTORY / "real_asset_candidates.json"


def _load_asset_rows(path: Path, expected_count: int, label: str) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)

    if len(rows) != expected_count:
        raise RuntimeError(
            f"{label} count drifted unexpectedly: "
            f"expected {expected_count}, got {len(rows)}"
        )

    return rows


@lru_cache(maxsize=1)
def build_real_asset_candidate_rows() -> list[dict[str, Any]]:
    return _load_asset_rows(
        REAL_ASSET_CANDIDATE_DATA_PATH,
        REAL_ASSET_CANDIDATE_ROW_COUNT,
        "Real asset candidate catalog",
    )
