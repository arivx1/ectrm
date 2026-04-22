from __future__ import annotations


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


def validate_password_not_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("password must not be blank")
    return value
