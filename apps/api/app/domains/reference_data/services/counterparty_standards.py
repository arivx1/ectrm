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
COUNTERPARTY_CREDIT_STATUS_ORDER = (
    "APPROVED",
    "REVIEW_REQUIRED",
    "ON_HOLD",
    "BLOCKED",
)
COUNTERPARTY_CREDIT_STATUSES = frozenset(COUNTERPARTY_CREDIT_STATUS_ORDER)
DEFAULT_COUNTERPARTY_CREDIT_STATUS = "APPROVED"
TRADABLE_COUNTERPARTY_CREDIT_STATUSES = frozenset({"APPROVED"})
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


def normalize_counterparty_credit_status(value: str | None) -> str:
    normalized = _normalize_standard_code(value or DEFAULT_COUNTERPARTY_CREDIT_STATUS)
    if normalized not in COUNTERPARTY_CREDIT_STATUSES:
        allowed_list = ", ".join(COUNTERPARTY_CREDIT_STATUS_ORDER)
        raise _validation_error(
            f"credit_status '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def list_counterparty_credit_statuses() -> list[str]:
    return list(COUNTERPARTY_CREDIT_STATUS_ORDER)


def counterparty_credit_status_allows_trading(value: str | None) -> bool:
    return normalize_counterparty_credit_status(value) in TRADABLE_COUNTERPARTY_CREDIT_STATUSES


def list_counterparty_types() -> list[str]:
    return sorted(COUNTERPARTY_TYPES)
