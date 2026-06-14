from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Iterable, Mapping
from urllib.request import urlopen

import pycountry
from shapely.geometry import shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.models.reference_location import ReferenceLocation

ADMIN0_COUNTRIES_GEOJSON_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    "ne_10m_admin_0_countries.geojson"
)
ADMIN1_SUBDIVISIONS_GEOJSON_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    "ne_10m_admin_1_states_provinces.geojson"
)
ADMIN0_MAP_UNITS_GEOJSON_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    "ne_10m_admin_0_map_units.geojson"
)
ADMIN0_MAP_SUBUNITS_GEOJSON_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    "ne_10m_admin_0_map_subunits.geojson"
)

_SUPPORTED_LOCATION_TYPES = {
    "BASIN",
    "CONTINENT",
    "CORRIDOR",
    "COUNTRY",
    "MARKET_AREA",
    "PROVINCE",
    "REGION",
    "STATE",
}
_UK_SUBUNIT_NAME_TO_CODE = {
    "ENGLAND": "GB-ENG",
    "SCOTLAND": "GB-SCT",
    "WALES": "GB-WLS",
    "NORTHERN IRELAND": "GB-NIR",
    "N. IRELAND": "GB-NIR",
}
_SUBDIVISION_TOKEN_ALIASES = {
    ("GB", "ENG"): "GB-ENG",
    ("GB", "EN"): "GB-ENG",
    ("GB", "SCT"): "GB-SCT",
    ("GB", "SC"): "GB-SCT",
    ("GB", "WLS"): "GB-WLS",
    ("GB", "WA"): "GB-WLS",
    ("GB", "NIR"): "GB-NIR",
    ("GB", "NI"): "GB-NIR",
    ("MY", "SWK"): "MY-13",
}
_SPECIAL_LOCATION_MEMBER_CODES = {
    "BASIN_US_GOM": ("USGC",),
    "MARKET_AREA_ASEAN": (
        "COUNTRY_BN",
        "COUNTRY_ID",
        "COUNTRY_KH",
        "COUNTRY_LA",
        "COUNTRY_MM",
        "COUNTRY_MY",
        "COUNTRY_PH",
        "COUNTRY_SG",
        "COUNTRY_TH",
        "COUNTRY_VN",
    ),
}
_CONTINENT_FALLBACK_COORDINATES = {
    "AF": (1.5, 17.3),
    "AN": (-82.9, 23.0),
    "AS": (34.0, 100.0),
    "EU": (54.5, 15.3),
    "NA": (46.0, -100.0),
    "OC": (-22.7, 140.0),
    "SA": (-14.6, -58.4),
}


@dataclass(frozen=True, slots=True)
class LocationSpatialEnrichmentSummary:
    target_location_count: int
    fetched_country_feature_count: int
    fetched_subdivision_feature_count: int
    fetched_map_unit_feature_count: int
    updated_location_count: int
    direct_country_match_count: int
    direct_subdivision_match_count: int
    derived_location_count: int
    remaining_missing_coordinates_count: int


@dataclass(slots=True)
class _Counters:
    fetched_country_feature_count: int = 0
    fetched_subdivision_feature_count: int = 0
    fetched_map_unit_feature_count: int = 0
    updated_location_count: int = 0
    direct_country_match_count: int = 0
    direct_subdivision_match_count: int = 0
    derived_location_count: int = 0


@dataclass(slots=True)
class _LocationCoordinateIndex:
    country_by_alpha2: dict[str, tuple[float, float]]
    subdivision_by_code: dict[str, tuple[float, float]]
    subdivision_by_name: dict[tuple[str, str], tuple[float, float]]
    subdivision_by_token: dict[tuple[str, str], tuple[float, float]]


def enrich_reference_location_spatial_fields(
    db: Session,
    *,
    requested_by: str,
    country_features: Iterable[dict[str, Any]] | None = None,
    subdivision_features: Iterable[dict[str, Any]] | None = None,
    map_unit_features: Iterable[dict[str, Any]] | None = None,
) -> LocationSpatialEnrichmentSummary:
    actor_id = resolve_audit_actor_id(requested_by)
    now = datetime.now(timezone.utc)
    counters = _Counters()

    target_locations = _load_target_locations(db)
    coordinate_index = _build_coordinate_index(
        counters=counters,
        country_features=country_features,
        subdivision_features=subdivision_features,
        map_unit_features=map_unit_features,
    )

    for location in target_locations.values():
        if location.latitude is not None and location.longitude is not None:
            continue

        coordinate = None
        if location.subdivision_code:
            coordinate = _resolve_subdivision_coordinate(location, coordinate_index)
            if coordinate is not None:
                counters.direct_subdivision_match_count += 1
        elif location.location_type == "COUNTRY" and location.country_code:
            coordinate = _resolve_country_coordinate(location, coordinate_index)
            if coordinate is not None:
                counters.direct_country_match_count += 1

        if coordinate is not None:
            _apply_location_coordinate(location, coordinate=coordinate, actor_id=actor_id, now=now)
            counters.updated_location_count += 1

    derived_location_codes = _derive_remaining_location_coordinates(
        target_locations,
        coordinate_index=coordinate_index,
    )
    for location_code in derived_location_codes:
        location = target_locations[location_code]
        _mark_location_updated(location, actor_id=actor_id, now=now)
        counters.updated_location_count += 1
        counters.derived_location_count += 1

    remaining_missing_coordinates_count = sum(
        1
        for location in target_locations.values()
        if location.latitude is None or location.longitude is None
    )

    db.commit()
    return LocationSpatialEnrichmentSummary(
        target_location_count=len(target_locations),
        fetched_country_feature_count=counters.fetched_country_feature_count,
        fetched_subdivision_feature_count=counters.fetched_subdivision_feature_count,
        fetched_map_unit_feature_count=counters.fetched_map_unit_feature_count,
        updated_location_count=counters.updated_location_count,
        direct_country_match_count=counters.direct_country_match_count,
        direct_subdivision_match_count=counters.direct_subdivision_match_count,
        derived_location_count=counters.derived_location_count,
        remaining_missing_coordinates_count=remaining_missing_coordinates_count,
    )


def _load_target_locations(db: Session) -> dict[str, ReferenceLocation]:
    stmt = (
        select(ReferenceLocation)
        .where(ReferenceLocation.is_active.is_(True))
        .where(ReferenceLocation.location_type.in_(_SUPPORTED_LOCATION_TYPES))
    )
    return {
        location.code: location
        for location in db.execute(stmt.order_by(ReferenceLocation.code.asc())).scalars().all()
    }


def _build_coordinate_index(
    *,
    counters: _Counters,
    country_features: Iterable[dict[str, Any]] | None,
    subdivision_features: Iterable[dict[str, Any]] | None,
    map_unit_features: Iterable[dict[str, Any]] | None,
) -> _LocationCoordinateIndex:
    country_iterable = (
        list(country_features)
        if country_features is not None
        else _load_geojson_features(ADMIN0_COUNTRIES_GEOJSON_URL)
    )
    subdivision_iterable = (
        list(subdivision_features)
        if subdivision_features is not None
        else _load_geojson_features(ADMIN1_SUBDIVISIONS_GEOJSON_URL)
    )
    map_unit_iterable = (
        list(map_unit_features)
        if map_unit_features is not None
        else (
            _load_geojson_features(ADMIN0_MAP_UNITS_GEOJSON_URL)
            + _load_geojson_features(ADMIN0_MAP_SUBUNITS_GEOJSON_URL)
        )
    )

    counters.fetched_country_feature_count = len(country_iterable)
    counters.fetched_subdivision_feature_count = len(subdivision_iterable)
    counters.fetched_map_unit_feature_count = len(map_unit_iterable)

    country_by_alpha2: dict[str, tuple[float, float]] = {}
    for feature in country_iterable:
        properties = feature.get("properties", {})
        coordinate = _feature_representative_coordinate(feature)
        if coordinate is None:
            continue
        alpha3 = _clean_code(properties.get("ADM0_A3"))
        if alpha3:
            country = pycountry.countries.get(alpha_3=alpha3)
            if country is not None:
                country_by_alpha2[country.alpha_2] = coordinate

    subdivision_by_code: dict[str, tuple[float, float]] = {}
    subdivision_by_name: dict[tuple[str, str], tuple[float, float]] = {}
    subdivision_by_token: dict[tuple[str, str], tuple[float, float]] = {}
    for feature in subdivision_iterable + map_unit_iterable:
        properties = feature.get("properties", {})
        coordinate = _feature_representative_coordinate(feature)
        if coordinate is None:
            continue

        country_code, subdivision_code = _resolve_feature_subdivision_code(properties)
        if not country_code or not subdivision_code:
            continue

        subdivision_by_code[subdivision_code] = coordinate

        for name_field in ("name", "name_en", "NAME", "NAME_LONG", "GEOUNIT"):
            normalized_name = _normalize_name_token(properties.get(name_field))
            if normalized_name:
                subdivision_by_name[(country_code, normalized_name)] = coordinate

        for token in _extract_feature_tokens(properties, subdivision_code=subdivision_code):
            subdivision_by_token[(country_code, token)] = coordinate

        alias_code = _SUBDIVISION_TOKEN_ALIASES.get((country_code, subdivision_code.split("-", 1)[-1]))
        if alias_code is not None:
            subdivision_by_code[alias_code] = coordinate

    return _LocationCoordinateIndex(
        country_by_alpha2=country_by_alpha2,
        subdivision_by_code=subdivision_by_code,
        subdivision_by_name=subdivision_by_name,
        subdivision_by_token=subdivision_by_token,
    )


@lru_cache(maxsize=8)
def _load_geojson_features(url: str) -> list[dict[str, Any]]:
    with urlopen(url, timeout=120) as response:
        payload = json.load(response)
    return payload.get("features", [])


def _resolve_feature_subdivision_code(properties: Mapping[str, Any]) -> tuple[str | None, str | None]:
    iso_3166_2 = _clean_code(properties.get("iso_3166_2") or properties.get("ISO_3166_2"))
    if iso_3166_2 and "-" in iso_3166_2:
        country_code = iso_3166_2.split("-", 1)[0]
        return country_code, iso_3166_2

    country_code = _clean_code(properties.get("iso_a2") or properties.get("ISO_A2"))
    if country_code is None or country_code == "-99":
        country_code = _alpha3_to_alpha2(
            properties.get("ADM0_A3")
            or properties.get("adm0_a3")
            or properties.get("SOV_A3")
            or properties.get("sov_a3")
        )

    normalized_name = _normalize_name_token(
        properties.get("name")
        or properties.get("NAME")
        or properties.get("NAME_LONG")
        or properties.get("GEOUNIT")
    )
    if country_code == "GB" and normalized_name in _UK_SUBUNIT_NAME_TO_CODE:
        return "GB", _UK_SUBUNIT_NAME_TO_CODE[normalized_name]

    return country_code, None


def _extract_feature_tokens(
    properties: Mapping[str, Any],
    *,
    subdivision_code: str,
) -> set[str]:
    tokens: set[str] = set()
    subdivision_suffix = subdivision_code.split("-", 1)[-1]
    tokens.add(_clean_code(subdivision_suffix) or subdivision_suffix)

    for raw_value in (
        properties.get("postal"),
        properties.get("POSTAL"),
        properties.get("code_hasc"),
        properties.get("hasc_maybe"),
        properties.get("abbrev"),
        properties.get("gns_adm1"),
        properties.get("fips"),
    ):
        cleaned = _clean_code(raw_value)
        if cleaned:
            tokens.add(cleaned.split(".")[-1])
            tokens.add(cleaned.split("-")[-1])

    for raw_value in (
        properties.get("name_alt"),
        properties.get("NAME_ALT"),
    ):
        if not raw_value:
            continue
        for entry in str(raw_value).split("|"):
            normalized = _normalize_name_token(entry)
            if normalized:
                tokens.add(normalized)

    normalized_name = _normalize_name_token(
        properties.get("name")
        or properties.get("NAME")
        or properties.get("NAME_LONG")
        or properties.get("GEOUNIT")
    )
    if normalized_name:
        tokens.add(normalized_name)
    return {token for token in tokens if token}


def _resolve_subdivision_coordinate(
    location: ReferenceLocation,
    coordinate_index: _LocationCoordinateIndex,
) -> tuple[float, float] | None:
    subdivision_code = location.subdivision_code
    if subdivision_code is None:
        return None

    if subdivision_code in coordinate_index.subdivision_by_code:
        return coordinate_index.subdivision_by_code[subdivision_code]

    normalized_name = _normalize_name_token(location.name)
    if location.country_code and normalized_name:
        coordinate = coordinate_index.subdivision_by_name.get((location.country_code, normalized_name))
        if coordinate is not None:
            return coordinate

    country_code = location.country_code
    if country_code is None:
        return None

    subdivision_suffix = subdivision_code.split("-", 1)[-1]
    coordinate = coordinate_index.subdivision_by_token.get((country_code, _clean_code(subdivision_suffix) or subdivision_suffix))
    if coordinate is not None:
        return coordinate
    return coordinate_index.subdivision_by_token.get((country_code, normalized_name or ""))


def _resolve_country_coordinate(
    location: ReferenceLocation,
    coordinate_index: _LocationCoordinateIndex,
) -> tuple[float, float] | None:
    if location.country_code is None:
        return None
    return coordinate_index.country_by_alpha2.get(location.country_code)


def _derive_remaining_location_coordinates(
    locations_by_code: Mapping[str, ReferenceLocation],
    *,
    coordinate_index: _LocationCoordinateIndex,
) -> list[str]:
    updated_codes: list[str] = []
    made_progress = True
    while made_progress:
        made_progress = False
        for location in locations_by_code.values():
            if location.latitude is not None and location.longitude is not None:
                continue

            coordinate = _derive_location_coordinate(
                location,
                locations_by_code=locations_by_code,
                coordinate_index=coordinate_index,
            )
            if coordinate is None:
                continue

            _apply_location_coordinate(location, coordinate=coordinate, actor_id=None, now=None)
            updated_codes.append(location.code)
            made_progress = True
    return updated_codes


def _derive_location_coordinate(
    location: ReferenceLocation,
    *,
    locations_by_code: Mapping[str, ReferenceLocation],
    coordinate_index: _LocationCoordinateIndex,
) -> tuple[float, float] | None:
    if location.code in _SPECIAL_LOCATION_MEMBER_CODES:
        member_coordinates = _collect_member_coordinates(
            _SPECIAL_LOCATION_MEMBER_CODES[location.code],
            locations_by_code=locations_by_code,
        )
        return _average_coordinates(member_coordinates)

    if location.location_type == "CONTINENT":
        member_coordinates = [
            (candidate.latitude, candidate.longitude)
            for candidate in locations_by_code.values()
            if candidate.continent_code == location.continent_code
            and candidate.location_type == "COUNTRY"
            and candidate.latitude is not None
            and candidate.longitude is not None
        ]
        coordinate = _average_coordinates(member_coordinates)
        if coordinate is not None:
            return coordinate
        if location.continent_code in _CONTINENT_FALLBACK_COORDINATES:
            return _CONTINENT_FALLBACK_COORDINATES[location.continent_code]

    if location.location_type == "CORRIDOR":
        return _average_coordinates(
            _collect_member_coordinates(
                _collect_location_member_codes(location),
                locations_by_code=locations_by_code,
            )
        )

    if location.location_type == "REGION":
        member_codes = _collect_location_member_codes(location)
        if member_codes:
            return _average_coordinates(
                _collect_member_coordinates(member_codes, locations_by_code=locations_by_code)
            )

    if location.location_type == "BASIN":
        if location.parent_location_code:
            parent = locations_by_code.get(location.parent_location_code)
            if parent and parent.latitude is not None and parent.longitude is not None:
                return parent.latitude, parent.longitude

    if location.location_type == "MARKET_AREA" and location.continent_code:
        continent = locations_by_code.get(f"CONTINENT_{location.continent_code}")
        if continent and continent.latitude is not None and continent.longitude is not None:
            return continent.latitude, continent.longitude

    if location.country_code and location.code.startswith("REGION_"):
        country_code, member_tokens = _parse_region_member_tokens(location.code, location.country_code)
        member_coordinates = [
            coordinate_index.subdivision_by_token.get((country_code, token))
            or coordinate_index.subdivision_by_name.get((country_code, token))
            or coordinate_index.subdivision_by_code.get(
                _SUBDIVISION_TOKEN_ALIASES.get((country_code, token), "")
            )
            for token in member_tokens
        ]
        return _average_coordinates([coordinate for coordinate in member_coordinates if coordinate is not None])

    return None


def _collect_location_member_codes(location: ReferenceLocation) -> list[str]:
    if location.code.startswith("CORRIDOR_"):
        tokens = location.code.removeprefix("CORRIDOR_").split("_")
        return [_token_to_location_code(token) for token in tokens]
    return []


def _parse_region_member_tokens(code: str, country_code: str) -> tuple[str, list[str]]:
    tokens = code.removeprefix("REGION_").split("_")
    if tokens and tokens[0] == country_code:
        tokens = tokens[1:]
    return country_code, [_normalize_name_token(token) or token for token in tokens]


def _token_to_location_code(token: str) -> str:
    cleaned = _clean_code(token) or token
    if cleaned in _CONTINENT_FALLBACK_COORDINATES:
        return f"CONTINENT_{cleaned}"
    return f"COUNTRY_{cleaned}"


def _collect_member_coordinates(
    member_codes: Iterable[str],
    *,
    locations_by_code: Mapping[str, ReferenceLocation],
) -> list[tuple[float, float]]:
    coordinates: list[tuple[float, float]] = []
    for member_code in member_codes:
        member = locations_by_code.get(member_code)
        if member is None or member.latitude is None or member.longitude is None:
            continue
        coordinates.append((member.latitude, member.longitude))
    return coordinates


def _average_coordinates(
    coordinates: Iterable[tuple[float, float]],
) -> tuple[float, float] | None:
    coordinate_list = list(coordinates)
    if not coordinate_list:
        return None
    latitude = sum(item[0] for item in coordinate_list) / len(coordinate_list)
    longitude = sum(item[1] for item in coordinate_list) / len(coordinate_list)
    return latitude, longitude


def _apply_location_coordinate(
    location: ReferenceLocation,
    *,
    coordinate: tuple[float, float],
    actor_id: str | None,
    now: datetime | None,
) -> None:
    location.latitude = coordinate[0]
    location.longitude = coordinate[1]
    if actor_id is not None and now is not None:
        _mark_location_updated(location, actor_id=actor_id, now=now)


def _mark_location_updated(
    location: ReferenceLocation,
    *,
    actor_id: str,
    now: datetime,
) -> None:
    location.updated_at = now
    location.updated_by = actor_id
    location.version += 1


def _feature_representative_coordinate(feature: Mapping[str, Any]) -> tuple[float, float] | None:
    geometry = feature.get("geometry")
    if not geometry:
        return None
    representative_point = shape(geometry).representative_point()
    return representative_point.y, representative_point.x


def _normalize_name_token(value: Any) -> str | None:
    if value is None:
        return None
    normalized = (
        str(value)
        .upper()
        .replace(",", " ")
        .replace(".", " ")
        .replace("-", " ")
        .replace("/", " ")
    )
    normalized = " ".join(normalized.split())
    return normalized or None


def _clean_code(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip().upper()
    return cleaned or None


def _alpha3_to_alpha2(value: Any) -> str | None:
    alpha3 = _clean_code(value)
    if alpha3 is None or alpha3 == "-99":
        return None
    country = pycountry.countries.get(alpha_3=alpha3)
    return country.alpha_2 if country is not None else None
