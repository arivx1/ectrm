from __future__ import annotations

from fastapi import HTTPException, status

from apps.api.app.domains.reference_data.services.records import normalize_code

PIPELINE_PATH_DIRECTIONS = frozenset({"FORWARD", "REVERSE", "BIDIRECTIONAL"})
DEFAULT_PIPELINE_PATH_DIRECTION = "BIDIRECTIONAL"


def _validation_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


def normalize_pipeline_path_direction(value: str) -> str:
    normalized = normalize_code(value)
    if normalized not in PIPELINE_PATH_DIRECTIONS:
        allowed_list = ", ".join(sorted(PIPELINE_PATH_DIRECTIONS))
        raise _validation_error(
            f"path_direction '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def list_pipeline_path_directions() -> list[str]:
    return sorted(PIPELINE_PATH_DIRECTIONS)
