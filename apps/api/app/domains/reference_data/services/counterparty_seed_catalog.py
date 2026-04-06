from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

REAL_COUNTERPARTY_ROW_COUNT = 500
REAL_COUNTERPARTY_DATA_PATH = Path(__file__).resolve().parent / "data" / "real_counterparties.json"


@lru_cache(maxsize=1)
def build_real_counterparty_rows() -> list[dict[str, Any]]:
    with REAL_COUNTERPARTY_DATA_PATH.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)

    if len(rows) != REAL_COUNTERPARTY_ROW_COUNT:
        raise RuntimeError(
            "Real counterparty seed catalog count drifted unexpectedly: "
            f"expected {REAL_COUNTERPARTY_ROW_COUNT}, got {len(rows)}"
        )

    return rows
