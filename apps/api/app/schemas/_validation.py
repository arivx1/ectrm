from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def normalize_required_text(
    value: str,
    *,
    field_name: str,
    uppercase: bool = False,
    lowercase: bool = False,
) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} must not be blank")
    if uppercase:
        normalized = normalized.upper()
    if lowercase:
        normalized = normalized.lower()
    return normalized


def normalize_optional_text(
    value: str | None,
    *,
    field_name: str,
    uppercase: bool = False,
    lowercase: bool = False,
) -> str | None:
    if value is None:
        return None
    return normalize_required_text(
        value,
        field_name=field_name,
        uppercase=uppercase,
        lowercase=lowercase,
    )


def normalize_optional_blankable_text(
    value: str | None,
    *,
    uppercase: bool = False,
    lowercase: bool = False,
) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if uppercase:
        normalized = normalized.upper()
    if lowercase:
        normalized = normalized.lower()
    return normalized


def normalize_optional_timezone(value: str | None, *, field_name: str = "timezone") -> str | None:
    normalized = normalize_optional_blankable_text(value)
    if normalized is None:
        return None
    try:
        ZoneInfo(normalized)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"{field_name} must be a valid IANA timezone name") from exc
    return normalized


def validate_password_not_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("password must not be blank")
    return value
