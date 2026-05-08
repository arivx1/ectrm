from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, status

from apps.api.app.domains.reference_data.services.records import normalize_code

RAIL_ROUTE_DIRECTIONS = frozenset({"FORWARD", "REVERSE", "BIDIRECTIONAL"})
DEFAULT_RAIL_ROUTE_DIRECTION = "BIDIRECTIONAL"


def _validation_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


def normalize_rail_route_direction(value: str) -> str:
    normalized = normalize_code(value)
    if normalized not in RAIL_ROUTE_DIRECTIONS:
        allowed_list = ", ".join(sorted(RAIL_ROUTE_DIRECTIONS))
        raise _validation_error(
            f"route_direction '{normalized}' is invalid. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_rail_local_time(value: Optional[str], *, field_name: str) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None

    hour_text, separator, minute_text = cleaned.partition(":")
    if separator != ":" or not hour_text.isdigit() or not minute_text.isdigit():
        raise _validation_error(
            f"{field_name} '{cleaned}' is invalid. Expected 24-hour HH:MM format."
        )

    hour = int(hour_text)
    minute = int(minute_text)
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise _validation_error(
            f"{field_name} '{cleaned}' is invalid. Expected 24-hour HH:MM format."
        )

    return f"{hour:02d}:{minute:02d}"


def list_rail_route_directions() -> list[str]:
    return sorted(RAIL_ROUTE_DIRECTIONS)
