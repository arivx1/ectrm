from __future__ import annotations

import re
from typing import Optional

from fastapi import HTTPException, status

from apps.api.app.domains.reference_data.services.records import normalize_code

ASSET_CLASSES = frozenset(
    {
        "PIPELINE",
        "GENERATION",
        "REFINERY",
        "UPSTREAM_PRODUCTION",
        "PROCESSING",
        "STORAGE",
        "TERMINAL",
        "CONSUMPTION",
    }
)
DEFAULT_ASSET_CLASS = "PIPELINE"
ASSET_TYPES_BY_CLASS = {
    "PIPELINE": frozenset({"GATHERING", "TRANSMISSION", "DISTRIBUTION"}),
    "GENERATION": frozenset({"THERMAL", "HYDRO", "NUCLEAR", "RENEWABLE", "STORAGE"}),
    "REFINERY": frozenset({"TOPPING", "HYDROSKIMMING", "CONVERSION", "INTEGRATED"}),
    "UPSTREAM_PRODUCTION": frozenset({"OIL_FIELD", "GAS_FIELD", "LNG_PROJECT", "OFFSHORE"}),
    "PROCESSING": frozenset({"GAS_PLANT", "FRACTIONATOR", "LNG_EXPORT", "LNG_IMPORT", "PETROCHEMICAL"}),
    "STORAGE": frozenset({"TANK_FARM", "CAVERN", "RESERVOIR", "BATTERY"}),
    "TERMINAL": frozenset({"MARINE", "PIPELINE", "RAIL", "TRUCK", "LNG"}),
    "CONSUMPTION": frozenset({"INDUSTRIAL", "POWER_LOAD", "RESIDENTIAL", "DATACENTER"}),
}
DEFAULT_ASSET_TYPE_BY_CLASS = {
    "PIPELINE": "TRANSMISSION",
    "GENERATION": "THERMAL",
    "REFINERY": "CONVERSION",
    "UPSTREAM_PRODUCTION": "OIL_FIELD",
    "PROCESSING": "GAS_PLANT",
    "STORAGE": "TANK_FARM",
    "TERMINAL": "MARINE",
    "CONSUMPTION": "INDUSTRIAL",
}
ALL_ASSET_TYPES = frozenset().union(*ASSET_TYPES_BY_CLASS.values())
ASSET_REALITIES = frozenset({"REAL", "SIMULATED"})
DEFAULT_ASSET_REALITY = "REAL"
ASSET_OPERATING_STATUSES = frozenset(
    {"OPERATING", "PLANNED", "UNDER_CONSTRUCTION", "IDLED", "MAINTENANCE", "RETIRED"}
)
DEFAULT_ASSET_OPERATING_STATUS = "OPERATING"
_STANDARD_CODE_PATTERN = re.compile(r"[^A-Z0-9]+")


def _validation_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


def _normalize_standard_code(value: str) -> str:
    return _STANDARD_CODE_PATTERN.sub("_", value.strip().upper()).strip("_")


def normalize_asset_class(value: str) -> str:
    normalized = normalize_code(value)
    if normalized not in ASSET_CLASSES:
        allowed_list = ", ".join(sorted(ASSET_CLASSES))
        raise _validation_error(
            f"asset_class '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_asset_type(value: str, *, asset_class: str) -> str:
    normalized = _normalize_standard_code(value)
    allowed_types = ASSET_TYPES_BY_CLASS[asset_class]
    if normalized not in allowed_types:
        allowed_list = ", ".join(sorted(allowed_types))
        raise _validation_error(
            f"asset_type '{normalized}' is invalid for {asset_class}. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_asset_type_filter(value: str, *, asset_class: Optional[str] = None) -> str:
    if asset_class is not None:
        return normalize_asset_type(value, asset_class=asset_class)

    normalized = _normalize_standard_code(value)
    if normalized not in ALL_ASSET_TYPES:
        allowed_list = ", ".join(sorted(ALL_ASSET_TYPES))
        raise _validation_error(
            f"asset_type '{normalized}' is invalid for assets. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_asset_operating_status(value: str) -> str:
    normalized = normalize_code(value)
    if normalized not in ASSET_OPERATING_STATUSES:
        allowed_list = ", ".join(sorted(ASSET_OPERATING_STATUSES))
        raise _validation_error(
            f"operating_status '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_asset_reality(value: str) -> str:
    normalized = normalize_code(value)
    if normalized not in ASSET_REALITIES:
        allowed_list = ", ".join(sorted(ASSET_REALITIES))
        raise _validation_error(
            f"asset_reality '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def list_asset_classes() -> list[str]:
    return sorted(ASSET_CLASSES)


def list_asset_types_by_class() -> dict[str, list[str]]:
    return {
        asset_class: sorted(asset_types)
        for asset_class, asset_types in ASSET_TYPES_BY_CLASS.items()
    }


def list_asset_operating_statuses() -> list[str]:
    return sorted(ASSET_OPERATING_STATUSES)


def list_asset_realities() -> list[str]:
    return sorted(ASSET_REALITIES)
