from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.asset_standards import (
    DEFAULT_ASSET_CLASS,
    DEFAULT_ASSET_REALITY,
    DEFAULT_ASSET_OPERATING_STATUS,
    DEFAULT_ASSET_TYPE_BY_CLASS,
    list_asset_classes,
    list_asset_realities,
    list_asset_operating_statuses,
    list_asset_types_by_class,
    normalize_asset_class,
    normalize_asset_reality,
    normalize_asset_operating_status,
    normalize_asset_type,
    normalize_asset_type_filter,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.domains.reference_data.services.spatial_geometry import normalize_geojson_object
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.schemas.reference_data import (
    AssetCreate,
    AssetOut,
    AssetStandardsOut,
    AssetStatusUpdate,
    AssetUpdate,
)

from .common import (
    clean_optional_text,
    ensure_active_commodity_exists,
    ensure_active_location_exists,
    ensure_active_unit_exists,
)
from .factory import ReferenceDataCrudSpec
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _normalize_capacity_fields(
    db: Session,
    *,
    capacity_value: Optional[float],
    capacity_unit_code: Optional[str],
) -> tuple[Optional[float], Optional[str]]:
    if (capacity_value is None) != (capacity_unit_code is None):
        raise ValueError("capacity_value and capacity_unit_code must be provided together")

    if capacity_value is None:
        return None, None

    return capacity_value, ensure_active_unit_exists(db, capacity_unit_code)


def _normalize_coordinate_fields(
    *,
    latitude: Optional[float],
    longitude: Optional[float],
) -> tuple[Optional[float], Optional[float]]:
    if (latitude is None) != (longitude is None):
        raise ValueError("latitude and longitude must be provided together")

    if latitude is None:
        return None, None

    return latitude, longitude

def _build_asset_create_values(db: Session, payload: AssetCreate) -> dict[str, object]:
    asset_class = normalize_asset_class(payload.asset_class)
    asset_type = normalize_asset_type(payload.asset_type, asset_class=asset_class)
    asset_reality = normalize_asset_reality(payload.asset_reality)
    operating_status = normalize_asset_operating_status(payload.operating_status)

    try:
        capacity_value, capacity_unit_code = _normalize_capacity_fields(
            db,
            capacity_value=payload.capacity_value,
            capacity_unit_code=payload.capacity_unit_code,
        )
        latitude, longitude = _normalize_coordinate_fields(
            latitude=payload.latitude,
            longitude=payload.longitude,
        )
        geometry_geojson = normalize_geojson_object(payload.geometry_geojson, field_name="geometry_geojson")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return {
        "asset_class": asset_class,
        "asset_type": asset_type,
        "asset_reality": asset_reality,
        "commodity_code": (
            ensure_active_commodity_exists(db, payload.commodity_code)
            if payload.commodity_code is not None and payload.commodity_code.strip()
            else None
        ),
        "location_code": (
            ensure_active_location_exists(db, payload.location_code)
            if payload.location_code is not None and payload.location_code.strip()
            else None
        ),
        "latitude": latitude,
        "longitude": longitude,
        "geometry_geojson": geometry_geojson,
        "capacity_value": capacity_value,
        "capacity_unit_code": capacity_unit_code,
        "operator_name": clean_optional_text(payload.operator_name),
        "operating_status": operating_status,
        "source_name": clean_optional_text(payload.source_name),
        "source_url": clean_optional_text(payload.source_url),
        "confidence": payload.confidence,
        "notes": clean_optional_text(payload.notes),
    }


def _update_asset_fields(db: Session, record, payload, provided_fields: set[str]) -> None:
    next_asset_class = record.asset_class
    if "asset_class" in provided_fields and payload.asset_class is not None:
        next_asset_class = normalize_asset_class(payload.asset_class)

    next_asset_type = record.asset_type
    if "asset_type" in provided_fields and payload.asset_type is not None:
        next_asset_type = normalize_asset_type(payload.asset_type, asset_class=next_asset_class)
    elif "asset_class" in provided_fields:
        next_asset_type = normalize_asset_type(record.asset_type, asset_class=next_asset_class)

    next_capacity_value = record.capacity_value
    if "capacity_value" in provided_fields:
        next_capacity_value = payload.capacity_value
    next_capacity_unit_code = record.capacity_unit_code
    if "capacity_unit_code" in provided_fields:
        next_capacity_unit_code = payload.capacity_unit_code
    next_latitude = record.latitude
    if "latitude" in provided_fields:
        next_latitude = payload.latitude
    next_longitude = record.longitude
    if "longitude" in provided_fields:
        next_longitude = payload.longitude

    try:
        normalized_capacity_value, normalized_capacity_unit_code = _normalize_capacity_fields(
            db,
            capacity_value=next_capacity_value,
            capacity_unit_code=next_capacity_unit_code,
        )
        normalized_latitude, normalized_longitude = _normalize_coordinate_fields(
            latitude=next_latitude,
            longitude=next_longitude,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    if "asset_class" in provided_fields and payload.asset_class is not None:
        record.asset_class = next_asset_class
    if "asset_type" in provided_fields or "asset_class" in provided_fields:
        record.asset_type = next_asset_type
    if "asset_reality" in provided_fields and payload.asset_reality is not None:
        record.asset_reality = normalize_asset_reality(payload.asset_reality)
    if "commodity_code" in provided_fields:
        record.commodity_code = (
            ensure_active_commodity_exists(db, payload.commodity_code)
            if payload.commodity_code is not None and payload.commodity_code.strip()
            else None
        )
    if "location_code" in provided_fields:
        record.location_code = (
            ensure_active_location_exists(db, payload.location_code)
            if payload.location_code is not None and payload.location_code.strip()
            else None
        )
    if "latitude" in provided_fields or "longitude" in provided_fields:
        record.latitude = normalized_latitude
        record.longitude = normalized_longitude
    if "geometry_geojson" in provided_fields:
        try:
            record.geometry_geojson = normalize_geojson_object(payload.geometry_geojson, field_name="geometry_geojson")
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if "capacity_value" in provided_fields or "capacity_unit_code" in provided_fields:
        record.capacity_value = normalized_capacity_value
        record.capacity_unit_code = normalized_capacity_unit_code
    if "operator_name" in provided_fields:
        record.operator_name = clean_optional_text(payload.operator_name)
    if "operating_status" in provided_fields and payload.operating_status is not None:
        record.operating_status = normalize_asset_operating_status(payload.operating_status)
    if "source_name" in provided_fields:
        record.source_name = clean_optional_text(payload.source_name)
    if "source_url" in provided_fields:
        record.source_url = clean_optional_text(payload.source_url)
    if "confidence" in provided_fields:
        record.confidence = payload.confidence
    if "notes" in provided_fields:
        record.notes = clean_optional_text(payload.notes)


ASSET_SPEC = ReferenceDataCrudSpec(
    model=ReferenceAsset,
    out_schema_cls=AssetOut,
    duplicate_detail="Asset already exists",
    build_create_extra_values=_build_asset_create_values,
    update_extra_fields=_update_asset_fields,
)


@router.get("/assets", response_model=List[AssetOut])
def list_assets(
    q: Optional[str] = None,
    asset_class: Optional[str] = None,
    asset_type: Optional[str] = None,
    asset_reality: Optional[str] = None,
    operating_status: Optional[str] = None,
    commodity_code: Optional[str] = None,
    location_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[AssetOut]:
    extra_filters = []
    normalized_asset_class: Optional[str] = None
    if asset_class:
        normalized_asset_class = normalize_asset_class(asset_class)
        extra_filters.append(ReferenceAsset.asset_class == normalized_asset_class)
    if asset_type:
        extra_filters.append(
            ReferenceAsset.asset_type
            == normalize_asset_type_filter(asset_type, asset_class=normalized_asset_class)
        )
    if asset_reality:
        extra_filters.append(ReferenceAsset.asset_reality == normalize_asset_reality(asset_reality))
    if operating_status:
        extra_filters.append(
            ReferenceAsset.operating_status == normalize_asset_operating_status(operating_status)
        )
    if commodity_code:
        extra_filters.append(ReferenceAsset.commodity_code == normalize_code(commodity_code))
    if location_code:
        extra_filters.append(ReferenceAsset.location_code == normalize_code(location_code))

    return list_reference_collection(
        ASSET_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
        search_columns=[
            ReferenceAsset.code,
            ReferenceAsset.name,
            ReferenceAsset.description,
            ReferenceAsset.operator_name,
            ReferenceAsset.source_name,
            ReferenceAsset.source_url,
            ReferenceAsset.notes,
        ],
    )


@router.get("/assets/standards", response_model=AssetStandardsOut)
def list_asset_standards() -> AssetStandardsOut:
    return AssetStandardsOut(
        default_asset_class=DEFAULT_ASSET_CLASS,
        default_asset_type_by_class=dict(DEFAULT_ASSET_TYPE_BY_CLASS),
        asset_classes=list_asset_classes(),
        asset_types_by_class=list_asset_types_by_class(),
        default_asset_reality=DEFAULT_ASSET_REALITY,
        asset_realities=list_asset_realities(),
        default_operating_status=DEFAULT_ASSET_OPERATING_STATUS,
        operating_statuses=list_asset_operating_statuses(),
    )


@router.post("/assets", response_model=AssetOut, status_code=201)
def create_asset(payload: AssetCreate, db: Session = Depends(get_db)) -> AssetOut:
    return create_reference_resource(ASSET_SPEC, payload, db=db)


@router.get("/assets/{code}", response_model=AssetOut)
def get_asset(code: str, db: Session = Depends(get_db)) -> AssetOut:
    return get_reference_resource(ASSET_SPEC, code, db=db)


@router.put("/assets/{code}", response_model=AssetOut)
def update_asset(code: str, payload: AssetUpdate, db: Session = Depends(get_db)) -> AssetOut:
    return update_reference_resource(ASSET_SPEC, code, payload, db=db)


@router.post("/assets/{code}/deactivate", response_model=AssetOut)
def deactivate_asset(
    code: str,
    payload: AssetStatusUpdate,
    db: Session = Depends(get_db),
) -> AssetOut:
    return set_reference_resource_active(
        ASSET_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/assets/{code}/activate", response_model=AssetOut)
def activate_asset(
    code: str,
    payload: AssetStatusUpdate,
    db: Session = Depends(get_db),
) -> AssetOut:
    return set_reference_resource_active(
        ASSET_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
