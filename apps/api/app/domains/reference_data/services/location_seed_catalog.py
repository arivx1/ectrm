from __future__ import annotations

from functools import lru_cache
from typing import Any

import pycountry

STANDARDIZED_LOCATION_ROW_COUNT = 500

STANDARD_CONTINENTS: tuple[tuple[str, str], ...] = (
    ("AF", "Africa"),
    ("AN", "Antarctica"),
    ("AS", "Asia"),
    ("EU", "Europe"),
    ("NA", "North America"),
    ("OC", "Oceania"),
    ("SA", "South America"),
)

STANDARDIZED_LOCATION_COUNTRY_CODES: tuple[str, ...] = (
    "US",
    "CA",
    "MX",
    "BR",
    "AR",
    "DE",
    "FR",
    "IT",
    "NL",
    "TR",
    "SA",
    "AE",
    "CN",
    "IN",
    "KR",
    "AU",
    "ZA",
    "NG",
)

COUNTRY_TO_CONTINENT_CODE = {
    "AE": "AS",
    "AR": "SA",
    "AU": "OC",
    "BR": "SA",
    "CA": "NA",
    "CN": "AS",
    "DE": "EU",
    "FR": "EU",
    "IN": "AS",
    "IT": "EU",
    "KR": "AS",
    "MX": "NA",
    "NG": "AF",
    "NL": "EU",
    "SA": "AS",
    "TR": "AS",
    "US": "NA",
    "ZA": "AF",
}


def _continent_location_code(continent_code: str) -> str:
    return f"CONTINENT_{continent_code}"


def _country_location_code(country_code: str) -> str:
    return f"COUNTRY_{country_code}"


def _subdivision_location_code(subdivision_code: str) -> str:
    return f"SUBDIVISION_{subdivision_code.replace('-', '_')}"


def _subdivision_location_type(raw_type: str) -> str:
    normalized_type = raw_type.strip().lower()
    if "state" in normalized_type or "territory" in normalized_type:
        return "STATE"
    if any(
        token in normalized_type
        for token in (
            "province",
            "prefecture",
            "emirate",
            "governorate",
        )
    ):
        return "PROVINCE"
    return "REGION"


def _require_country(country_code: str):
    country = pycountry.countries.get(alpha_2=country_code)
    if country is None:
        raise RuntimeError(f"Unsupported ISO country code '{country_code}' in standardized location seed catalog")
    return country


def _top_level_subdivisions(country_code: str):
    return sorted(
        (
            subdivision
            for subdivision in pycountry.subdivisions
            if subdivision.country_code == country_code and getattr(subdivision, "parent_code", None) is None
        ),
        key=lambda subdivision: subdivision.code,
    )


@lru_cache(maxsize=1)
def build_standardized_location_rows() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    continent_names = dict(STANDARD_CONTINENTS)

    for continent_code, continent_name in STANDARD_CONTINENTS:
        rows.append(
            {
                "code": _continent_location_code(continent_code),
                "name": continent_name,
                "location_kind": "REGION",
                "location_type": "CONTINENT",
                "parent_location_code": None,
                "market": None,
                "city": None,
                "subdivision_code": None,
                "country_code": None,
                "continent_code": continent_code,
                "latitude": None,
                "longitude": None,
                "region": None,
                "timezone": None,
                "description": f"Standard continent region for {continent_name}.",
            }
        )

    for country_code in STANDARDIZED_LOCATION_COUNTRY_CODES:
        country = _require_country(country_code)
        continent_code = COUNTRY_TO_CONTINENT_CODE[country_code]
        country_location_code = _country_location_code(country_code)

        rows.append(
            {
                "code": country_location_code,
                "name": country.name,
                "location_kind": "REGION",
                "location_type": "COUNTRY",
                "parent_location_code": _continent_location_code(continent_code),
                "market": None,
                "city": None,
                "subdivision_code": None,
                "country_code": country_code,
                "continent_code": continent_code,
                "latitude": None,
                "longitude": None,
                "region": None,
                "timezone": None,
                "description": f"ISO 3166-1 country region for {country.name}.",
            }
        )

        for subdivision in _top_level_subdivisions(country_code):
            rows.append(
                {
                    "code": _subdivision_location_code(subdivision.code),
                    "name": subdivision.name,
                    "location_kind": "REGION",
                    "location_type": _subdivision_location_type(subdivision.type),
                    "parent_location_code": country_location_code,
                    "market": None,
                    "city": None,
                    "subdivision_code": subdivision.code,
                    "country_code": country_code,
                    "continent_code": continent_code,
                    "latitude": None,
                    "longitude": None,
                    "region": None,
                    "timezone": None,
                    "description": f"ISO 3166-2 {subdivision.type.lower()} region in {country.name}.",
                }
            )

    if len(rows) != STANDARDIZED_LOCATION_ROW_COUNT:
        raise RuntimeError(
            "Standardized location seed catalog count drifted unexpectedly: "
            f"expected {STANDARDIZED_LOCATION_ROW_COUNT}, got {len(rows)}"
        )

    return rows
