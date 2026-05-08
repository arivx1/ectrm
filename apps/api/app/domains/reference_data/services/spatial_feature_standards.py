from __future__ import annotations

from fastapi import HTTPException, status

from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.domains.reference_data.services.spatial_geometry import list_geometry_types

SPATIAL_FEATURE_KINDS = frozenset(
    {
        "AREA",
        "BASIN",
        "CORRIDOR",
        "FOOTPRINT",
        "PIPELINE",
        "REGION",
        "ROUTE",
        "TERRITORY",
    }
)
DEFAULT_SPATIAL_FEATURE_KIND = "REGION"

SPATIAL_FEATURE_ENTITY_TYPES = frozenset({"ASSET", "LOCATION", "RAIL_ROUTE"})


def _validation_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


def normalize_spatial_feature_kind(value: str) -> str:
    normalized = normalize_code(value)
    if normalized not in SPATIAL_FEATURE_KINDS:
        allowed_list = ", ".join(sorted(SPATIAL_FEATURE_KINDS))
        raise _validation_error(
            f"feature_kind '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_spatial_feature_entity_type(value: str) -> str:
    normalized = normalize_code(value)
    if normalized not in SPATIAL_FEATURE_ENTITY_TYPES:
        allowed_list = ", ".join(sorted(SPATIAL_FEATURE_ENTITY_TYPES))
        raise _validation_error(
            f"entity_type '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def list_spatial_feature_kinds() -> list[str]:
    return sorted(SPATIAL_FEATURE_KINDS)


def list_spatial_feature_entity_types() -> list[str]:
    return sorted(SPATIAL_FEATURE_ENTITY_TYPES)


def list_spatial_feature_geometry_types() -> list[str]:
    return list_geometry_types()
