from __future__ import annotations

from fastapi import HTTPException, status

from apps.api.app.domains.reference_data.services.records import normalize_code

PIPELINE_COMMODITY_FAMILIES = frozenset(
    {
        "NATURAL_GAS",
        "CRUDE_OIL",
        "REFINED_PRODUCTS",
        "NGL",
        "PETROCHEMICAL",
        "CO2",
        "MULTIPLE",
        "OTHER",
    }
)
DEFAULT_PIPELINE_COMMODITY_FAMILY = "NATURAL_GAS"

PIPELINE_JURISDICTION_TYPES = frozenset(
    {
        "INTERSTATE",
        "INTRASTATE",
        "GATHERING",
        "LOCAL_DISTRIBUTION",
        "MIXED",
    }
)
DEFAULT_PIPELINE_JURISDICTION_TYPE = "INTERSTATE"

PIPELINE_TOPOLOGY_MODELS = frozenset(
    {
        "POINT_TO_POINT",
        "ZONE_POOL",
        "BATCHED",
        "HEADER_INTERCONNECT",
        "SYSTEM_TO_SYSTEM",
    }
)
DEFAULT_PIPELINE_TOPOLOGY_MODEL = "POINT_TO_POINT"

PIPELINE_POINT_ROLES = frozenset(
    {
        "RECEIPT",
        "DELIVERY",
        "BIDIRECTIONAL",
        "POOL",
        "ZONE",
        "INTERCONNECT",
        "STORAGE",
        "TERMINAL",
        "MARKET_HUB",
        "HEADER",
    }
)
DEFAULT_PIPELINE_POINT_ROLE = "INTERCONNECT"


def _validation_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


def _normalize_choice(value: str, *, allowed: frozenset[str], field_name: str) -> str:
    normalized = normalize_code(value)
    if normalized not in allowed:
        allowed_list = ", ".join(sorted(allowed))
        raise _validation_error(
            f"{field_name} '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_pipeline_commodity_family(value: str) -> str:
    return _normalize_choice(
        value,
        allowed=PIPELINE_COMMODITY_FAMILIES,
        field_name="commodity_family",
    )


def normalize_pipeline_jurisdiction_type(value: str) -> str:
    return _normalize_choice(
        value,
        allowed=PIPELINE_JURISDICTION_TYPES,
        field_name="jurisdiction_type",
    )


def normalize_pipeline_topology_model(value: str) -> str:
    return _normalize_choice(
        value,
        allowed=PIPELINE_TOPOLOGY_MODELS,
        field_name="topology_model",
    )


def normalize_pipeline_point_role(value: str) -> str:
    return _normalize_choice(
        value,
        allowed=PIPELINE_POINT_ROLES,
        field_name="point_role",
    )


def list_pipeline_commodity_families() -> list[str]:
    return sorted(PIPELINE_COMMODITY_FAMILIES)


def list_pipeline_jurisdiction_types() -> list[str]:
    return sorted(PIPELINE_JURISDICTION_TYPES)


def list_pipeline_topology_models() -> list[str]:
    return sorted(PIPELINE_TOPOLOGY_MODELS)


def list_pipeline_point_roles() -> list[str]:
    return sorted(PIPELINE_POINT_ROLES)
