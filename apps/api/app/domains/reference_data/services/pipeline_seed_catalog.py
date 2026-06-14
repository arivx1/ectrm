from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

PIPELINE_SEED_CANDIDATE_COUNT = 10
PIPELINE_POINT_SEED_CANDIDATE_COUNT = 33
_DATA_DIRECTORY = Path(__file__).resolve().parent / "data"
PIPELINE_SEED_CANDIDATE_DATA_PATH = _DATA_DIRECTORY / "pipeline_seed_candidates.json"


def _load_pipeline_seed_payload(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict):
        raise RuntimeError("Pipeline seed candidate catalog must be a JSON object")

    pipeline_rows = payload.get("pipelines")
    point_rows = payload.get("points")
    if not isinstance(pipeline_rows, list) or not isinstance(point_rows, list):
        raise RuntimeError(
            "Pipeline seed candidate catalog must contain 'pipelines' and 'points' lists"
        )

    if len(pipeline_rows) != PIPELINE_SEED_CANDIDATE_COUNT:
        raise RuntimeError(
            "Pipeline seed candidate catalog pipeline count drifted unexpectedly: "
            f"expected {PIPELINE_SEED_CANDIDATE_COUNT}, got {len(pipeline_rows)}"
        )
    if len(point_rows) != PIPELINE_POINT_SEED_CANDIDATE_COUNT:
        raise RuntimeError(
            "Pipeline seed candidate catalog point count drifted unexpectedly: "
            f"expected {PIPELINE_POINT_SEED_CANDIDATE_COUNT}, got {len(point_rows)}"
        )

    return payload


@lru_cache(maxsize=1)
def build_pipeline_seed_candidate_catalog() -> dict[str, list[dict[str, Any]]]:
    payload = _load_pipeline_seed_payload(PIPELINE_SEED_CANDIDATE_DATA_PATH)
    return {
        "pipelines": list(payload["pipelines"]),
        "points": list(payload["points"]),
    }
