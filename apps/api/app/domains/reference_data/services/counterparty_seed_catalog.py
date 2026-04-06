from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

REAL_COUNTERPARTY_ROW_COUNT = 500
ADDITIONAL_REAL_COUNTERPARTY_ROW_COUNT = 500
ENERGY_REAL_COUNTERPARTY_ROW_COUNT = 500
_DATA_DIRECTORY = Path(__file__).resolve().parent / "data"
REAL_COUNTERPARTY_DATA_PATH = _DATA_DIRECTORY / "real_counterparties.json"
ADDITIONAL_REAL_COUNTERPARTY_DATA_PATH = _DATA_DIRECTORY / "additional_real_counterparties.json"
ENERGY_REAL_COUNTERPARTY_DATA_PATH = _DATA_DIRECTORY / "energy_real_counterparties.json"


def _load_counterparty_rows(path: Path, expected_count: int, label: str) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)

    if len(rows) != expected_count:
        raise RuntimeError(
            f"{label} count drifted unexpectedly: "
            f"expected {expected_count}, got {len(rows)}"
        )

    return rows


@lru_cache(maxsize=1)
def build_real_counterparty_rows() -> list[dict[str, Any]]:
    return _load_counterparty_rows(
        REAL_COUNTERPARTY_DATA_PATH,
        REAL_COUNTERPARTY_ROW_COUNT,
        "Real counterparty seed catalog",
    )


@lru_cache(maxsize=1)
def build_additional_real_counterparty_rows() -> list[dict[str, Any]]:
    return _load_counterparty_rows(
        ADDITIONAL_REAL_COUNTERPARTY_DATA_PATH,
        ADDITIONAL_REAL_COUNTERPARTY_ROW_COUNT,
        "Additional real counterparty seed catalog",
    )


@lru_cache(maxsize=1)
def build_energy_real_counterparty_rows() -> list[dict[str, Any]]:
    return _load_counterparty_rows(
        ENERGY_REAL_COUNTERPARTY_DATA_PATH,
        ENERGY_REAL_COUNTERPARTY_ROW_COUNT,
        "Energy real counterparty seed catalog",
    )
