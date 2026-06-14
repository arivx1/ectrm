from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_location import ReferenceLocation


MIDDLE_EAST_COUNTRY_CODES = frozenset(
    {
        "AE",
        "AM",
        "AZ",
        "BH",
        "CY",
        "GE",
        "IL",
        "IQ",
        "IR",
        "JO",
        "KW",
        "LB",
        "OM",
        "PS",
        "QA",
        "SA",
        "SY",
        "TR",
        "YE",
    }
)

NORTH_AMERICA_COUNTRY_CODES = frozenset(
    {
        "AG",
        "AI",
        "AW",
        "BB",
        "BL",
        "BM",
        "BQ",
        "BS",
        "BZ",
        "CA",
        "CR",
        "CU",
        "CW",
        "DM",
        "DO",
        "GD",
        "GL",
        "GP",
        "GT",
        "HN",
        "HT",
        "JM",
        "KN",
        "KY",
        "LC",
        "MF",
        "MQ",
        "MS",
        "MX",
        "NI",
        "PA",
        "PM",
        "PR",
        "SV",
        "SX",
        "TC",
        "TT",
        "US",
        "VC",
        "VG",
        "VI",
    }
)

SOUTH_AMERICA_COUNTRY_CODES = frozenset(
    {
        "AR",
        "BO",
        "BR",
        "CL",
        "CO",
        "EC",
        "FK",
        "GF",
        "GY",
        "PE",
        "PY",
        "SR",
        "UY",
        "VE",
    }
)

MAP_READY_PLACEMENT_STATUSES = frozenset(
    {
        "asset_geometry",
        "asset_coordinates",
        "linked_location",
    }
)


@dataclass(frozen=True, slots=True)
class AssetMapScopeFilters:
    hidden_geographies: frozenset[str]
    selected_country_code: str | None
    selected_subdivision_code: str | None
    hidden_activities: frozenset[str]
    hidden_subtypes: frozenset[str]


@dataclass(frozen=True, slots=True)
class AssetMapScopeSummary:
    total_count: int
    total_map_ready_count: int
    filtered_total_count: int
    filtered_map_ready_count: int


@dataclass(frozen=True, slots=True)
class _AssetMapScopeRecord:
    asset_class: str
    asset_type: str
    placement_status: str
    latitude: float | None
    longitude: float | None
    country_code: str | None
    subdivision_code: str | None
    continent_code: str | None
    region: str | None


def summarize_asset_map_scope(
    db: Session,
    *,
    filters: AssetMapScopeFilters,
) -> AssetMapScopeSummary:
    normalized_filters = _normalize_filters(filters)
    rows = db.execute(
        select(ReferenceAsset, ReferenceLocation)
        .outerjoin(
            ReferenceLocation,
            ReferenceLocation.code == ReferenceAsset.location_code,
        )
        .order_by(ReferenceAsset.code.asc())
    ).all()
    records = [
        _build_scope_record(asset, location)
        for asset, location in rows
    ]
    filtered_records = [
        record for record in records if _record_matches_filters(record, normalized_filters)
    ]

    return AssetMapScopeSummary(
        total_count=len(records),
        total_map_ready_count=sum(
            1 for record in records if _record_is_map_ready(record)
        ),
        filtered_total_count=len(filtered_records),
        filtered_map_ready_count=sum(
            1 for record in filtered_records if _record_is_map_ready(record)
        ),
    )


def _normalize_filters(filters: AssetMapScopeFilters) -> AssetMapScopeFilters:
    return AssetMapScopeFilters(
        hidden_geographies=_normalize_label_set(filters.hidden_geographies),
        selected_country_code=_normalize_code(filters.selected_country_code),
        selected_subdivision_code=_normalize_code(filters.selected_subdivision_code),
        hidden_activities=_normalize_label_set(filters.hidden_activities),
        hidden_subtypes=_normalize_label_set(filters.hidden_subtypes),
    )


def _normalize_label_set(values: Iterable[str]) -> frozenset[str]:
    return frozenset(
        value.strip().casefold()
        for value in values
        if value and value.strip()
    )


def _normalize_code(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip().upper()
    return stripped or None


def _build_scope_record(
    asset: ReferenceAsset,
    location: ReferenceLocation | None,
) -> _AssetMapScopeRecord:
    geometry_latitude, geometry_longitude = _representative_coordinate_from_geojson(
        asset.geometry_geojson
    )
    if geometry_latitude is not None and geometry_longitude is not None:
        placement_status = "asset_geometry"
        latitude = geometry_latitude
        longitude = geometry_longitude
    elif _is_finite_number(asset.latitude) and _is_finite_number(asset.longitude):
        placement_status = "asset_coordinates"
        latitude = asset.latitude
        longitude = asset.longitude
    elif location is None:
        placement_status = "missing_location"
        latitude = None
        longitude = None
    elif _is_finite_number(location.latitude) and _is_finite_number(location.longitude):
        placement_status = "linked_location"
        latitude = location.latitude
        longitude = location.longitude
    else:
        placement_status = "missing_coordinates"
        latitude = None
        longitude = None

    return _AssetMapScopeRecord(
        asset_class=asset.asset_class,
        asset_type=asset.asset_type,
        placement_status=placement_status,
        latitude=latitude,
        longitude=longitude,
        country_code=location.country_code if location is not None else None,
        subdivision_code=location.subdivision_code if location is not None else None,
        continent_code=location.continent_code if location is not None else None,
        region=location.region if location is not None else None,
    )


def _representative_coordinate_from_geojson(
    geojson: dict[str, Any] | None,
) -> tuple[float | None, float | None]:
    positions: list[tuple[float, float]] = []
    _collect_geometry_positions(geojson, positions)
    if not positions:
        return None, None

    min_longitude = positions[0][0]
    max_longitude = positions[0][0]
    min_latitude = positions[0][1]
    max_latitude = positions[0][1]
    for longitude, latitude in positions:
        min_longitude = min(min_longitude, longitude)
        max_longitude = max(max_longitude, longitude)
        min_latitude = min(min_latitude, latitude)
        max_latitude = max(max_latitude, latitude)

    return (min_latitude + max_latitude) / 2, (min_longitude + max_longitude) / 2


def _collect_geometry_positions(
    geojson: dict[str, Any] | None,
    positions: list[tuple[float, float]],
) -> None:
    if not isinstance(geojson, dict):
        return

    geojson_type = geojson.get("type")
    if not isinstance(geojson_type, str):
        return

    if geojson_type == "FeatureCollection":
        features = geojson.get("features")
        if not isinstance(features, list):
            return
        for feature in features:
            if isinstance(feature, dict):
                _collect_geometry_positions(feature, positions)
        return

    if geojson_type == "Feature":
        geometry = geojson.get("geometry")
        if isinstance(geometry, dict):
            _collect_geometry_positions(geometry, positions)
        return

    if geojson_type == "GeometryCollection":
        geometries = geojson.get("geometries")
        if not isinstance(geometries, list):
            return
        for geometry in geometries:
            if isinstance(geometry, dict):
                _collect_geometry_positions(geometry, positions)
        return

    _collect_positions(geojson.get("coordinates"), positions)


def _collect_positions(
    value: Any,
    positions: list[tuple[float, float]],
) -> None:
    if not isinstance(value, list):
        return

    if (
        len(value) >= 2
        and _is_finite_number(value[0])
        and _is_finite_number(value[1])
    ):
        positions.append((float(value[0]), float(value[1])))
        return

    for entry in value:
        _collect_positions(entry, positions)


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (float, int)) and float(value) == value and value not in (float("inf"), float("-inf"))


def _record_matches_filters(
    record: _AssetMapScopeRecord,
    filters: AssetMapScopeFilters,
) -> bool:
    geography_label = _asset_map_geography_label_for_record(record)
    if geography_label is not None and geography_label.casefold() in filters.hidden_geographies:
        return False

    if (
        filters.selected_country_code is not None
        and _normalize_code(record.country_code) != filters.selected_country_code
    ):
        return False

    if (
        filters.selected_subdivision_code is not None
        and _normalize_code(record.subdivision_code)
        != filters.selected_subdivision_code
    ):
        return False

    if all(
        activity_label.casefold() in filters.hidden_activities
        for activity_label in _asset_map_activity_labels_for_asset(record)
    ):
        return False

    if _asset_map_subtype_label_for_asset(record).casefold() in filters.hidden_subtypes:
        return False

    return True


def _record_is_map_ready(record: _AssetMapScopeRecord) -> bool:
    return record.placement_status in MAP_READY_PLACEMENT_STATUSES


def _asset_map_subtype_label_for_asset(
    asset: _AssetMapScopeRecord,
) -> str:
    asset_class = _normalize_code(asset.asset_class) or ""
    asset_type = _normalize_code(asset.asset_type) or ""

    if asset_class == "UPSTREAM_PRODUCTION":
        return "Upstream Oil & Gas"
    if asset_class == "PIPELINE":
        return "Pipeline"
    if asset_class == "REFINERY":
        return "Refinery"
    if asset_class == "PROCESSING":
        return "Petrochem" if asset_type == "PETROCHEMICAL" else "NG Processing"
    if asset_class == "STORAGE":
        return "Storage"
    if asset_class == "GENERATION":
        return "Storage" if asset_type == "STORAGE" else "Power Generation"
    if asset_class == "TERMINAL":
        if asset_type == "PIPELINE":
            return "Pipeline"
        if asset_type == "LNG":
            return "NG Processing"
        return "Other"
    return "Other"


def _asset_map_activity_labels_for_asset(
    asset: _AssetMapScopeRecord,
) -> list[str]:
    asset_class = _normalize_code(asset.asset_class) or ""
    asset_type = _normalize_code(asset.asset_type) or ""

    if asset_class == "UPSTREAM_PRODUCTION":
        return ["Positions", "Inventory"]
    if asset_class == "PIPELINE":
        return ["Positions", "Shipments"]
    if asset_class == "REFINERY":
        return ["Positions", "Inventory"]
    if asset_class in {"PROCESSING", "STORAGE"}:
        return ["Positions", "Shipments", "Inventory"]
    if asset_class == "TERMINAL":
        if asset_type == "LNG":
            return ["Positions", "Shipments", "Inventory"]
        if asset_type == "PIPELINE":
            return ["Positions", "Shipments"]
        return ["Shipments", "Inventory"]
    if asset_class in {"GENERATION", "CONSUMPTION"}:
        return ["Positions"]
    return ["Positions"]


def _asset_map_geography_label_for_record(
    record: _AssetMapScopeRecord,
) -> str | None:
    return _asset_map_geography_label_for_point(
        latitude=record.latitude,
        longitude=record.longitude,
        country_code=record.country_code,
        continent_code=record.continent_code,
        region=record.region,
    )


def _asset_map_geography_label_for_point(
    *,
    latitude: float | None,
    longitude: float | None,
    country_code: str | None,
    continent_code: str | None,
    region: str | None,
) -> str | None:
    region_label = _geography_label_for_region_text(region)
    if region_label is not None:
        return region_label

    normalized_country_code = _normalize_code(country_code) or ""
    if normalized_country_code in MIDDLE_EAST_COUNTRY_CODES:
        return "EMEA"
    if normalized_country_code in NORTH_AMERICA_COUNTRY_CODES:
        return "North America"
    if normalized_country_code in SOUTH_AMERICA_COUNTRY_CODES:
        return "South America"

    continent_label = _geography_label_for_continent_code(continent_code)
    if continent_label is not None:
        return continent_label

    if not _is_finite_number(latitude) or not _is_finite_number(longitude):
        return None

    if -170 <= float(longitude) <= -30:
        if float(latitude) < 12 and float(longitude) >= -92:
            return "South America"
        return "North America"

    if -30 <= float(longitude) < 60:
        return "EMEA"

    return "APAC"


def _geography_label_for_region_text(region: str | None) -> str | None:
    region_text = _normalize_code(region) or ""
    if not region_text:
        return None

    if (
        "NORTH AMERICA" in region_text
        or "CARIBBEAN" in region_text
        or "CENTRAL AMERICA" in region_text
    ):
        return "North America"

    if (
        "SOUTH AMERICA" in region_text
        or "LATAM" in region_text
        or "LATIN AMERICA" in region_text
    ):
        return "South America"

    if (
        "EMEA" in region_text
        or "EUROPE" in region_text
        or "MIDDLE EAST" in region_text
        or "AFRICA" in region_text
    ):
        return "EMEA"

    if (
        "APAC" in region_text
        or "ASIA" in region_text
        or "PACIFIC" in region_text
        or "OCEANIA" in region_text
    ):
        return "APAC"

    return None


def _geography_label_for_continent_code(continent_code: str | None) -> str | None:
    normalized_continent_code = _normalize_code(continent_code)
    if normalized_continent_code == "NA":
        return "North America"
    if normalized_continent_code == "SA":
        return "South America"
    if normalized_continent_code in {"EU", "AF"}:
        return "EMEA"
    if normalized_continent_code in {"AS", "OC"}:
        return "APAC"
    return None
