from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping
from urllib.parse import urlencode
from urllib.request import urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_asset import ReferenceAsset

WRI_SOURCE_NAME = "WRI Global Power Plant Database via CE data hub CKAN Data API"
WRI_RESOURCE_ID = "a11ea493-46f9-4846-8893-a6964182b89d"
WRI_DATASTORE_SEARCH_URL = "https://datahub.digicirc.eu/api/3/action/datastore_search"

HIFLD_ELECTRIC_POWER_TRANSMISSION_LINES_SOURCE_NAME = (
    "HIFLD Open Energy FeatureServer - electric_power_transmission_lines"
)
HIFLD_NATURAL_GAS_COMPRESSOR_STATIONS_SOURCE_NAME = (
    "HIFLD Open Energy FeatureServer - natural_gas_compressor_stations"
)
HIFLD_PETROLEUM_TERMINALS_SOURCE_NAME = "HIFLD Open Energy FeatureServer - petroleum_terminals"

_MAX_ASSET_NAME_LENGTH = 160
_MAX_OPERATOR_NAME_LENGTH = 120
_HIFLD_NOT_AVAILABLE_VALUES = {"NOT AVAILABLE", "UNKNOWN", "UNKNOWN128553", "UNKNOWN109715", "UNKNOWN109571"}


@dataclass(frozen=True, slots=True)
class AssetSpatialEnrichmentSummary:
    asset_reality: str | None
    target_asset_count: int
    fetched_source_record_count: int
    updated_asset_count: int
    coordinates_updated_count: int
    geometry_updated_count: int
    name_updated_count: int
    operator_updated_count: int
    remaining_missing_coordinates_count: int


@dataclass(frozen=True, slots=True)
class _HifldSourceConfig:
    source_name: str
    public_query_url: str
    geometry_kind: str


@dataclass(slots=True)
class _Counters:
    fetched_source_record_count: int = 0
    updated_asset_count: int = 0
    coordinates_updated_count: int = 0
    geometry_updated_count: int = 0
    name_updated_count: int = 0
    operator_updated_count: int = 0


_HIFLD_SOURCE_CONFIGS: dict[str, _HifldSourceConfig] = {
    HIFLD_ELECTRIC_POWER_TRANSMISSION_LINES_SOURCE_NAME: _HifldSourceConfig(
        source_name=HIFLD_ELECTRIC_POWER_TRANSMISSION_LINES_SOURCE_NAME,
        public_query_url=(
            "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/"
            "US_Electric_Power_Transmission_Lines/FeatureServer/0/query"
        ),
        geometry_kind="line",
    ),
    HIFLD_NATURAL_GAS_COMPRESSOR_STATIONS_SOURCE_NAME: _HifldSourceConfig(
        source_name=HIFLD_NATURAL_GAS_COMPRESSOR_STATIONS_SOURCE_NAME,
        public_query_url=(
            "https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/"
            "Natural_Gas_Compressor_Stations/FeatureServer/0/query"
        ),
        geometry_kind="point",
    ),
    HIFLD_PETROLEUM_TERMINALS_SOURCE_NAME: _HifldSourceConfig(
        source_name=HIFLD_PETROLEUM_TERMINALS_SOURCE_NAME,
        public_query_url=(
            "https://services8.arcgis.com/llOiK2G4U90VVgb7/arcgis/rest/services/"
            "HIFLD_Petroleum_Terminals/FeatureServer/0/query"
        ),
        geometry_kind="point",
    ),
}

_SUPPORTED_SOURCE_NAMES = (WRI_SOURCE_NAME, *_HIFLD_SOURCE_CONFIGS.keys())


def enrich_reference_asset_spatial_fields(
    db: Session,
    *,
    requested_by: str,
    asset_reality: str | None = "REAL",
    wri_records: Iterable[dict[str, Any]] | None = None,
    hifld_records_by_source_name: Mapping[str, Iterable[dict[str, Any]]] | None = None,
) -> AssetSpatialEnrichmentSummary:
    actor_id = resolve_audit_actor_id(requested_by)
    normalized_reality = normalize_code(asset_reality) if asset_reality is not None else None
    now = datetime.now(timezone.utc)
    counters = _Counters()

    target_assets_by_source = _load_target_assets_by_source(db, asset_reality=normalized_reality)

    wri_assets = target_assets_by_source.get(WRI_SOURCE_NAME, {})
    if wri_assets:
        _enrich_wri_assets(
            wri_assets,
            counters=counters,
            now=now,
            actor_id=actor_id,
            wri_records=wri_records,
        )

    for source_name, config in _HIFLD_SOURCE_CONFIGS.items():
        source_assets = target_assets_by_source.get(source_name, {})
        if not source_assets:
            continue
        ordered_records = None
        if hifld_records_by_source_name is not None:
            ordered_records = hifld_records_by_source_name.get(source_name)
        _enrich_hifld_assets(
            source_assets,
            config=config,
            counters=counters,
            now=now,
            actor_id=actor_id,
            ordered_records=ordered_records,
        )

    target_assets = [
        asset
        for source_assets in target_assets_by_source.values()
        for asset in source_assets.values()
    ]
    remaining_missing_coordinates_count = sum(
        1
        for asset in target_assets
        if asset.latitude is None or asset.longitude is None
    )

    db.commit()
    return AssetSpatialEnrichmentSummary(
        asset_reality=normalized_reality,
        target_asset_count=len(target_assets),
        fetched_source_record_count=counters.fetched_source_record_count,
        updated_asset_count=counters.updated_asset_count,
        coordinates_updated_count=counters.coordinates_updated_count,
        geometry_updated_count=counters.geometry_updated_count,
        name_updated_count=counters.name_updated_count,
        operator_updated_count=counters.operator_updated_count,
        remaining_missing_coordinates_count=remaining_missing_coordinates_count,
    )


def _load_target_assets_by_source(
    db: Session,
    *,
    asset_reality: str | None,
) -> dict[str, dict[str, ReferenceAsset]]:
    stmt = select(ReferenceAsset).where(ReferenceAsset.source_name.in_(_SUPPORTED_SOURCE_NAMES))
    if asset_reality is not None:
        stmt = stmt.where(ReferenceAsset.asset_reality == asset_reality)
    grouped: dict[str, dict[str, ReferenceAsset]] = {}
    for asset in db.execute(stmt.order_by(ReferenceAsset.source_name.asc(), ReferenceAsset.code.asc())).scalars().all():
        grouped.setdefault(asset.source_name or "", {})[asset.code] = asset
    return grouped


def _enrich_wri_assets(
    target_assets: dict[str, ReferenceAsset],
    *,
    counters: _Counters,
    now: datetime,
    actor_id: str,
    wri_records: Iterable[dict[str, Any]] | None,
) -> None:
    row_id_to_asset = _map_wri_row_ids(target_assets)
    if not row_id_to_asset:
        return

    record_iterable = (
        iter(wri_records)
        if wri_records is not None
        else _iter_wri_records(max_row_id=max(row_id_to_asset))
    )

    for record in record_iterable:
        counters.fetched_source_record_count += 1
        row_id = _parse_row_id(record)
        if row_id is None:
            continue

        asset = row_id_to_asset.get(row_id)
        if asset is None:
            continue

        changed = False

        latitude = _parse_optional_float(record.get("latitude"))
        longitude = _parse_optional_float(record.get("longitude"))
        if latitude is not None and longitude is not None:
            geometry_geojson = {
                "type": "Point",
                "coordinates": [longitude, latitude],
            }
            changed = _apply_geometry_updates(
                asset,
                geometry_geojson=geometry_geojson,
                counters=counters,
            ) or changed

        source_name = _clean_optional_text(record.get("name"))
        if source_name is not None:
            changed = _apply_asset_name(
                asset,
                name=source_name,
                counters=counters,
            ) or changed

        owner_name = _clean_optional_text(record.get("owner"))
        if owner_name is not None:
            changed = _apply_operator_name(
                asset,
                operator_name=owner_name,
                counters=counters,
            ) or changed

        if changed:
            _mark_asset_updated(asset, now=now, actor_id=actor_id)
            counters.updated_asset_count += 1


def _enrich_hifld_assets(
    target_assets: dict[str, ReferenceAsset],
    *,
    config: _HifldSourceConfig,
    counters: _Counters,
    now: datetime,
    actor_id: str,
    ordered_records: Iterable[dict[str, Any]] | None,
) -> None:
    offset_to_asset = _map_hifld_result_offsets(target_assets)
    if not offset_to_asset:
        return

    max_offset = max(offset_to_asset)
    record_iterable = (
        iter(ordered_records)
        if ordered_records is not None
        else _iter_hifld_records(config=config, max_offset=max_offset)
    )

    for offset, record in enumerate(record_iterable):
        if offset > max_offset:
            break

        counters.fetched_source_record_count += 1
        asset = offset_to_asset.get(offset)
        if asset is None:
            continue

        attributes = _extract_hifld_attributes(record)
        geometry_geojson = _extract_hifld_geometry(record, geometry_kind=config.geometry_kind)
        changed = False

        if geometry_geojson is not None:
            changed = _apply_geometry_updates(
                asset,
                geometry_geojson=geometry_geojson,
                counters=counters,
            ) or changed

        hifld_name = _build_hifld_asset_name(config=config, attributes=attributes)
        if hifld_name is not None:
            changed = _apply_asset_name(
                asset,
                name=hifld_name,
                counters=counters,
            ) or changed

        operator_name = _build_hifld_operator_name(config=config, attributes=attributes)
        if operator_name is not None:
            changed = _apply_operator_name(
                asset,
                operator_name=operator_name,
                counters=counters,
            ) or changed

        operating_status = _map_hifld_operating_status(attributes.get("STATUS"))
        if operating_status is not None and asset.operating_status != operating_status:
            asset.operating_status = operating_status
            changed = True

        if changed:
            _mark_asset_updated(asset, now=now, actor_id=actor_id)
            counters.updated_asset_count += 1


def _iter_wri_records(
    *,
    max_row_id: int,
    page_size: int = 1000,
) -> Iterable[dict[str, Any]]:
    offset = 0
    while offset < max_row_id:
        params = {
            "resource_id": WRI_RESOURCE_ID,
            "limit": page_size,
            "offset": offset,
        }
        url = WRI_DATASTORE_SEARCH_URL + "?" + urlencode(params)
        with urlopen(url, timeout=60) as response:
            payload = json.load(response)
        if not payload.get("success"):
            raise ValueError("WRI datastore search did not succeed")
        rows = payload.get("result", {}).get("records", [])
        if not rows:
            break
        for row in rows:
            yield row
        offset += page_size


def _iter_hifld_records(
    *,
    config: _HifldSourceConfig,
    max_offset: int,
    page_size: int = 1000,
) -> Iterable[dict[str, Any]]:
    offset = 0
    while offset <= max_offset:
        params = {
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": 4326,
            "f": "pjson",
            "resultRecordCount": min(page_size, max_offset - offset + 1),
            "resultOffset": offset,
            "orderByFields": "OBJECTID",
        }
        with urlopen(config.public_query_url + "?" + urlencode(params), timeout=120) as response:
            payload = json.load(response)
        features = payload.get("features", [])
        if not features:
            break
        for feature in features:
            yield feature
        offset += len(features)


def _map_wri_row_ids(target_assets: dict[str, ReferenceAsset]) -> dict[int, ReferenceAsset]:
    row_id_to_asset: dict[int, ReferenceAsset] = {}
    for asset_code, asset in target_assets.items():
        suffix = asset_code.removeprefix("WRI_GPPD_CKAN_ROW_")
        if suffix.isdigit():
            row_id_to_asset[int(suffix)] = asset
    return row_id_to_asset


def _map_hifld_result_offsets(target_assets: dict[str, ReferenceAsset]) -> dict[int, ReferenceAsset]:
    offset_to_asset: dict[int, ReferenceAsset] = {}
    for asset in target_assets.values():
        result_offset = _parse_hifld_result_offset(asset)
        if result_offset is not None:
            offset_to_asset[result_offset] = asset
    return offset_to_asset


def _parse_hifld_result_offset(asset: ReferenceAsset) -> int | None:
    source_url = asset.source_url or ""
    match = re.search(r"[?&]resultOffset=(\d+)", source_url)
    if match is None:
        return None
    return int(match.group(1))


def _extract_hifld_attributes(record: dict[str, Any]) -> dict[str, Any]:
    raw_attributes = record.get("attributes")
    if isinstance(raw_attributes, dict):
        return raw_attributes
    return {}


def _extract_hifld_geometry(
    record: dict[str, Any],
    *,
    geometry_kind: str,
) -> dict[str, Any] | None:
    raw_geometry = record.get("geometry")
    if not isinstance(raw_geometry, dict):
        return None

    if geometry_kind == "point":
        longitude = _parse_optional_float(raw_geometry.get("x"))
        latitude = _parse_optional_float(raw_geometry.get("y"))
        if latitude is None or longitude is None:
            return None
        return {
            "type": "Point",
            "coordinates": [longitude, latitude],
        }

    paths = raw_geometry.get("paths")
    if not isinstance(paths, list) or not paths:
        return None

    normalized_paths: list[list[list[float]]] = []
    for path in paths:
        if not isinstance(path, list):
            continue
        normalized_path: list[list[float]] = []
        for point in path:
            if (
                isinstance(point, list)
                and len(point) >= 2
                and isinstance(point[0], (int, float))
                and isinstance(point[1], (int, float))
            ):
                normalized_path.append([float(point[0]), float(point[1])])
        if normalized_path:
            normalized_paths.append(normalized_path)
    normalized_paths = [path for path in normalized_paths if path]
    if not normalized_paths:
        return None
    if len(normalized_paths) == 1:
        return {
            "type": "LineString",
            "coordinates": normalized_paths[0],
        }
    return {
        "type": "MultiLineString",
        "coordinates": normalized_paths,
    }


def _apply_geometry_updates(
    asset: ReferenceAsset,
    *,
    geometry_geojson: dict[str, Any],
    counters: _Counters,
) -> bool:
    changed = False
    latitude, longitude = _derive_representative_coordinate(geometry_geojson)
    if latitude is not None and longitude is not None:
        if asset.latitude != latitude or asset.longitude != longitude:
            asset.latitude = latitude
            asset.longitude = longitude
            counters.coordinates_updated_count += 1
            changed = True

    if asset.geometry_geojson != geometry_geojson:
        asset.geometry_geojson = geometry_geojson
        counters.geometry_updated_count += 1
        changed = True
    return changed


def _derive_representative_coordinate(geometry_geojson: dict[str, Any]) -> tuple[float | None, float | None]:
    positions: list[tuple[float, float]] = []
    _collect_geojson_positions(geometry_geojson.get("coordinates"), positions)
    if not positions:
        return None, None

    min_longitude = min(longitude for longitude, _ in positions)
    max_longitude = max(longitude for longitude, _ in positions)
    min_latitude = min(latitude for _, latitude in positions)
    max_latitude = max(latitude for _, latitude in positions)
    return (min_latitude + max_latitude) / 2, (min_longitude + max_longitude) / 2


def _collect_geojson_positions(
    value: Any,
    positions: list[tuple[float, float]],
) -> None:
    if not isinstance(value, list):
        return
    if len(value) >= 2 and isinstance(value[0], (int, float)) and isinstance(value[1], (int, float)):
        positions.append((float(value[0]), float(value[1])))
        return
    for entry in value:
        _collect_geojson_positions(entry, positions)


def _build_hifld_asset_name(
    *,
    config: _HifldSourceConfig,
    attributes: Mapping[str, Any],
) -> str | None:
    if config.geometry_kind == "point":
        return _clean_hifld_text(attributes.get("NAME"))

    substation_1 = _clean_hifld_text(attributes.get("SUB_1"))
    substation_2 = _clean_hifld_text(attributes.get("SUB_2"))
    line_id = _clean_hifld_text(attributes.get("ID"))
    voltage_class = _clean_hifld_text(attributes.get("VOLT_CLASS"))

    if substation_1 is not None and substation_2 is not None:
        base_name = f"{substation_1} to {substation_2} Transmission Line"
    elif line_id is not None:
        base_name = f"HIFLD Transmission Line {line_id}"
    else:
        return None

    if voltage_class is not None and voltage_class != "NOT AVAILABLE":
        return f"{base_name} ({voltage_class} kV class)"
    return base_name


def _build_hifld_operator_name(
    *,
    config: _HifldSourceConfig,
    attributes: Mapping[str, Any],
) -> str | None:
    candidate_fields = ("OWNER", "OPERATOR") if config.geometry_kind == "line" else ("OPERATOR", "OWNER", "PIPECO")
    for field_name in candidate_fields:
        candidate = _clean_hifld_text(attributes.get(field_name))
        if candidate is not None:
            return candidate
    return None


def _map_hifld_operating_status(value: Any) -> str | None:
    normalized = _clean_hifld_text(value)
    if normalized is None:
        return None
    if normalized in {"IN SERVICE", "OPERATING"}:
        return "OPERATING"
    if normalized in {"PLANNED"}:
        return "PLANNED"
    if normalized in {"UNDER CONSTRUCTION", "CONSTRUCTION"}:
        return "UNDER_CONSTRUCTION"
    if normalized in {"IDLE", "IDLED"}:
        return "IDLED"
    if normalized in {"RETIRED", "DISMANTLED", "ABANDONED", "OUT OF SERVICE"}:
        return "RETIRED"
    if normalized in {"MAINTENANCE"}:
        return "MAINTENANCE"
    return None


def _apply_asset_name(
    asset: ReferenceAsset,
    *,
    name: str,
    counters: _Counters,
) -> bool:
    normalized_name = _truncate_text(name, _MAX_ASSET_NAME_LENGTH)
    if asset.name == normalized_name:
        return False
    asset.name = normalized_name
    counters.name_updated_count += 1
    return True


def _apply_operator_name(
    asset: ReferenceAsset,
    *,
    operator_name: str,
    counters: _Counters,
) -> bool:
    normalized_operator_name = _truncate_text(operator_name, _MAX_OPERATOR_NAME_LENGTH)
    if asset.operator_name == normalized_operator_name:
        return False
    asset.operator_name = normalized_operator_name
    counters.operator_updated_count += 1
    return True


def _mark_asset_updated(
    asset: ReferenceAsset,
    *,
    now: datetime,
    actor_id: str,
) -> None:
    asset.updated_at = now
    asset.updated_by = actor_id
    asset.version += 1


def _parse_row_id(record: dict[str, Any]) -> int | None:
    raw_value = record.get("_id")
    if raw_value in (None, ""):
        return None
    try:
        return int(raw_value)
    except (TypeError, ValueError):
        return None


def _parse_optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clean_hifld_text(value: Any) -> str | None:
    cleaned = _clean_optional_text(value)
    if cleaned is None:
        return None
    if cleaned.upper() in _HIFLD_NOT_AVAILABLE_VALUES:
        return None
    return cleaned


def _clean_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _truncate_text(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value
    return value[: max_length - 3].rstrip() + "..."
