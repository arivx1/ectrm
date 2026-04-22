from __future__ import annotations

import re
from functools import lru_cache
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pycountry
from fastapi import HTTPException, status

from apps.api.app.domains.reference_data.services.records import normalize_code

LOCATION_KINDS = frozenset({"POINT", "REGION"})
DEFAULT_LOCATION_KIND = "POINT"
LOCATION_TYPES_BY_KIND = {
    "POINT": frozenset(
        {
            "HUB",
            "TERMINAL",
            "PORT",
            "NODE",
            "ZONE",
            "CITY",
            "AIRPORT",
            "DELIVERY_POINT",
            "TRADING_POINT",
        }
    ),
    "REGION": frozenset(
        {
            "REGION",
            "COUNTRY",
            "STATE",
            "PROVINCE",
            "CONTINENT",
            "PADD",
            "BASIN",
            "MARKET_AREA",
            "CORRIDOR",
        }
    ),
}
DEFAULT_LOCATION_TYPE_BY_KIND = {
    "POINT": "HUB",
    "REGION": "REGION",
}
ALL_LOCATION_TYPES = frozenset().union(*LOCATION_TYPES_BY_KIND.values())
LOCATION_MARKET_CODES = frozenset(
    {
        "PHYSICAL",
        "NYMEX",
        "ICE",
        "CME",
        "NGX",
        "PJM",
        "ERCOT",
        "CAISO",
        "MISO",
        "SPP",
        "ISO_NE",
        "NYISO",
        "ICE_EUROPE",
        "EEX",
        "TTF",
        "NBP",
        "JKM",
    }
)
CONTINENT_CODES = frozenset({"AF", "AN", "AS", "EU", "NA", "OC", "SA"})
_MARKET_CODE_PATTERN = re.compile(r"[^A-Z0-9]+")


def _validation_error(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


def _normalize_standard_code(value: str) -> str:
    return _MARKET_CODE_PATTERN.sub("_", value.strip().upper()).strip("_")


def normalize_location_kind(value: str) -> str:
    normalized = normalize_code(value)
    if normalized not in LOCATION_KINDS:
        raise _validation_error("location_kind must be one of POINT or REGION")
    return normalized


def normalize_location_type(value: str, *, location_kind: str) -> str:
    normalized = _normalize_standard_code(value)
    allowed_types = LOCATION_TYPES_BY_KIND[location_kind]
    if normalized not in allowed_types:
        allowed_list = ", ".join(sorted(allowed_types))
        raise _validation_error(
            f"location_type '{normalized}' is invalid for {location_kind}. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_location_type_filter(
    value: str,
    *,
    location_kind: Optional[str] = None,
) -> str:
    if location_kind is not None:
        return normalize_location_type(value, location_kind=location_kind)

    normalized = _normalize_standard_code(value)
    if normalized not in ALL_LOCATION_TYPES:
        allowed_list = ", ".join(sorted(ALL_LOCATION_TYPES))
        raise _validation_error(
            f"location_type '{normalized}' is invalid for locations. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_location_market(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    normalized = _normalize_standard_code(cleaned)
    if normalized not in LOCATION_MARKET_CODES:
        allowed_list = ", ".join(sorted(LOCATION_MARKET_CODES))
        raise _validation_error(
            f"market '{normalized}' is invalid for locations. Allowed values: {allowed_list}"
        )
    return normalized


def normalize_country_code(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    normalized = normalize_code(cleaned)
    if pycountry.countries.get(alpha_2=normalized) is None:
        raise _validation_error(
            f"country_code '{normalized}' must be a valid ISO 3166-1 alpha-2 code"
        )
    return normalized


def normalize_subdivision_code(
    value: Optional[str],
    *,
    country_code: Optional[str],
) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    normalized = normalize_code(cleaned)
    subdivision = _lookup_subdivision(normalized)
    if subdivision is None:
        raise _validation_error(
            f"subdivision_code '{normalized}' must be a valid ISO 3166-2 code"
        )
    if country_code is not None and subdivision.country_code != country_code:
        raise _validation_error(
            f"subdivision_code '{normalized}' does not belong to country_code '{country_code}'"
        )
    return normalized


def infer_country_code_from_subdivision(subdivision_code: Optional[str]) -> Optional[str]:
    if subdivision_code is None:
        return None
    subdivision = _lookup_subdivision(subdivision_code)
    return subdivision.country_code if subdivision is not None else None


def normalize_continent_code(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    normalized = normalize_code(cleaned)
    if normalized not in CONTINENT_CODES:
        allowed_list = ", ".join(sorted(CONTINENT_CODES))
        raise _validation_error(
            f"continent_code '{normalized}' must be one of {allowed_list}"
        )
    return normalized


def normalize_timezone_name(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        ZoneInfo(cleaned)
    except ZoneInfoNotFoundError as exc:
        raise _validation_error(
            f"timezone '{cleaned}' must be a valid IANA timezone name"
        ) from exc
    return cleaned


def list_location_kinds() -> list[str]:
    return sorted(LOCATION_KINDS)


def list_location_types_by_kind() -> dict[str, list[str]]:
    return {
        location_kind: sorted(location_types)
        for location_kind, location_types in LOCATION_TYPES_BY_KIND.items()
    }


def list_location_market_codes() -> list[str]:
    return sorted(LOCATION_MARKET_CODES)


def list_continent_codes() -> list[str]:
    return sorted(CONTINENT_CODES)


@lru_cache(maxsize=None)
def _lookup_subdivision(code: str):
    return pycountry.subdivisions.get(code=code)
