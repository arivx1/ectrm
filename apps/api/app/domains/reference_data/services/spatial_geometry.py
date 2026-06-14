from __future__ import annotations

import json
from typing import Any


ALLOWED_GEOJSON_TYPES = frozenset(
    {
        "Point",
        "MultiPoint",
        "LineString",
        "MultiLineString",
        "Polygon",
        "MultiPolygon",
        "GeometryCollection",
        "Feature",
        "FeatureCollection",
    }
)

GEOMETRY_TYPE_POINT = "POINT"
GEOMETRY_TYPE_LINE = "LINE"
GEOMETRY_TYPE_AREA = "AREA"
GEOMETRY_TYPE_MIXED = "MIXED"
GEOMETRY_TYPES = frozenset(
    {
        GEOMETRY_TYPE_POINT,
        GEOMETRY_TYPE_LINE,
        GEOMETRY_TYPE_AREA,
        GEOMETRY_TYPE_MIXED,
    }
)

_GEOMETRY_TYPE_BY_GEOJSON_TYPE = {
    "Point": GEOMETRY_TYPE_POINT,
    "MultiPoint": GEOMETRY_TYPE_POINT,
    "LineString": GEOMETRY_TYPE_LINE,
    "MultiLineString": GEOMETRY_TYPE_LINE,
    "Polygon": GEOMETRY_TYPE_AREA,
    "MultiPolygon": GEOMETRY_TYPE_AREA,
}


def normalize_geojson_object(
    value: dict[str, Any] | None,
    *,
    field_name: str,
) -> dict[str, Any] | None:
    if value is None:
        return None

    if not isinstance(value, dict):
        raise ValueError(f"{field_name} must be a GeoJSON object")

    try:
        json.dumps(value)
    except TypeError as exc:
        raise ValueError(f"{field_name} must be JSON serializable") from exc

    geojson_type = value.get("type")
    if not isinstance(geojson_type, str) or geojson_type not in ALLOWED_GEOJSON_TYPES:
        allowed_types = ", ".join(sorted(ALLOWED_GEOJSON_TYPES))
        raise ValueError(f"{field_name} type must be one of {allowed_types}")

    if geojson_type == "Feature":
        geometry = value.get("geometry")
        if geometry is None or not isinstance(geometry, dict):
            raise ValueError(f"{field_name} Feature objects must include a geometry object")
        normalize_geojson_object(geometry, field_name=field_name)
        return value

    if geojson_type == "FeatureCollection":
        features = value.get("features")
        if not isinstance(features, list):
            raise ValueError(f"{field_name} FeatureCollection objects must include a features array")
        for feature in features:
            if not isinstance(feature, dict):
                raise ValueError(f"{field_name} FeatureCollection features must be objects")
            normalize_geojson_object(feature, field_name=field_name)
        return value

    if geojson_type == "GeometryCollection":
        geometries = value.get("geometries")
        if not isinstance(geometries, list):
            raise ValueError(f"{field_name} GeometryCollection objects must include a geometries array")
        for geometry in geometries:
            if not isinstance(geometry, dict):
                raise ValueError(f"{field_name} GeometryCollection geometries must be objects")
            normalize_geojson_object(geometry, field_name=field_name)
        return value

    if "coordinates" not in value:
        raise ValueError(f"{field_name} geometry objects must include coordinates")

    return value


def derive_geometry_type(value: dict[str, Any], *, field_name: str) -> str:
    geometry_types = _collect_geometry_types(value, field_name=field_name)
    if not geometry_types:
        raise ValueError(f"{field_name} must include at least one geometry")
    if len(geometry_types) == 1:
        return next(iter(geometry_types))
    return GEOMETRY_TYPE_MIXED


def list_geometry_types() -> list[str]:
    return sorted(GEOMETRY_TYPES)


def _collect_geometry_types(value: dict[str, Any], *, field_name: str) -> set[str]:
    geojson_type = value.get("type")
    if not isinstance(geojson_type, str):
        raise ValueError(f"{field_name} must include a GeoJSON type")

    if geojson_type == "Feature":
        geometry = value.get("geometry")
        if not isinstance(geometry, dict):
            raise ValueError(f"{field_name} Feature objects must include a geometry object")
        return _collect_geometry_types(geometry, field_name=field_name)

    if geojson_type == "FeatureCollection":
        features = value.get("features")
        if not isinstance(features, list):
            raise ValueError(f"{field_name} FeatureCollection objects must include a features array")
        geometry_types: set[str] = set()
        for feature in features:
            if not isinstance(feature, dict):
                raise ValueError(f"{field_name} FeatureCollection features must be objects")
            geometry_types.update(_collect_geometry_types(feature, field_name=field_name))
        return geometry_types

    if geojson_type == "GeometryCollection":
        geometries = value.get("geometries")
        if not isinstance(geometries, list):
            raise ValueError(f"{field_name} GeometryCollection objects must include a geometries array")
        geometry_types: set[str] = set()
        for geometry in geometries:
            if not isinstance(geometry, dict):
                raise ValueError(f"{field_name} GeometryCollection geometries must be objects")
            geometry_types.update(_collect_geometry_types(geometry, field_name=field_name))
        return geometry_types

    geometry_type = _GEOMETRY_TYPE_BY_GEOJSON_TYPE.get(geojson_type)
    if geometry_type is None:
        allowed_types = ", ".join(sorted(ALLOWED_GEOJSON_TYPES))
        raise ValueError(f"{field_name} type must be one of {allowed_types}")
    return {geometry_type}
