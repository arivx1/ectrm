from __future__ import annotations

import re

from fastapi import HTTPException, status

COUNTERPARTY_TYPES = frozenset(
    {
        "BANK",
        "BROKER",
        "END_USER",
        "MAJOR",
        "MARKETER",
        "MIDSTREAM",
        "PRODUCER",
        "REFINER",
        "SUPPLIER",
        "TRADER",
        "UTILITY",
    }
)
DEFAULT_COUNTERPARTY_TYPE = "SUPPLIER"
_STANDARD_CODE_PATTERN = re.compile(r"[^A-Z0-9]+")


def _validation_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


def _normalize_standard_code(value: str) -> str:
    return _STANDARD_CODE_PATTERN.sub("_", value.strip().upper()).strip("_")


def normalize_counterparty_type(value: str) -> str:
    normalized = _normalize_standard_code(value)
    if normalized not in COUNTERPARTY_TYPES:
        allowed_list = ", ".join(sorted(COUNTERPARTY_TYPES))
        raise _validation_error(
            f"counterparty_type '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_counterparty_type_filter(value: str) -> str:
    return normalize_counterparty_type(value)


def list_counterparty_types() -> list[str]:
    return sorted(COUNTERPARTY_TYPES)
