from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.domains.reference_data.services.spatial_feature_standards import (
    DEFAULT_SPATIAL_FEATURE_KIND,
    list_spatial_feature_entity_types,
    list_spatial_feature_geometry_types,
    list_spatial_feature_kinds,
    normalize_spatial_feature_entity_type,
    normalize_spatial_feature_kind,
)
from apps.api.app.domains.reference_data.services.spatial_geometry import (
    derive_geometry_type,
    normalize_geojson_object,
)
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_spatial_feature import ReferenceSpatialFeature
from apps.api.app.schemas.reference_data import (
    SpatialFeatureCreate,
    SpatialFeatureOut,
    SpatialFeatureStandardsOut,
    SpatialFeatureStatusUpdate,
    SpatialFeatureUpdate,
)

from .common import clean_optional_code, clean_optional_text
from .factory import ReferenceDataCrudSpec
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _normalize_label_coordinates(
    *,
    label_latitude: Optional[float],
    label_longitude: Optional[float],
) -> tuple[Optional[float], Optional[float]]:
    if (label_latitude is None) != (label_longitude is None):
        raise ValueError("label_latitude and label_longitude must be provided together")

    if label_latitude is None:
        return None, None

    return label_latitude, label_longitude


def _normalize_entity_link(
    db: Session,
    *,
    entity_type: Optional[str],
    entity_code: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    normalized_entity_type = clean_optional_text(entity_type)
    normalized_entity_code = clean_optional_code(entity_code)

    if normalized_entity_type is None and normalized_entity_code is None:
        return None, None

    if normalized_entity_type is None or normalized_entity_code is None:
        raise ValueError("entity_type and entity_code must be provided together")

    normalized_entity_type = normalize_spatial_feature_entity_type(normalized_entity_type)
    if normalized_entity_type == "ASSET":
        linked_asset = db.execute(
            select(ReferenceAsset.code).where(ReferenceAsset.code == normalized_entity_code)
        ).scalars().first()
        if linked_asset is None:
            raise ValueError(f"Linked asset '{normalized_entity_code}' does not exist")
        return normalized_entity_type, normalized_entity_code

    linked_location = db.execute(
        select(ReferenceLocation.code).where(ReferenceLocation.code == normalized_entity_code)
    ).scalars().first()
    if linked_location is None:
        raise ValueError(f"Linked location '{normalized_entity_code}' does not exist")
    return normalized_entity_type, normalized_entity_code


def _build_spatial_feature_create_values(
    db: Session,
    payload: SpatialFeatureCreate,
) -> dict[str, object]:
    feature_kind = normalize_spatial_feature_kind(payload.feature_kind)

    try:
        geometry_geojson = normalize_geojson_object(payload.geometry_geojson, field_name="geometry_geojson")
        if geometry_geojson is None:
            raise ValueError("geometry_geojson is required")
        geometry_type = derive_geometry_type(geometry_geojson, field_name="geometry_geojson")
        label_latitude, label_longitude = _normalize_label_coordinates(
            label_latitude=payload.label_latitude,
            label_longitude=payload.label_longitude,
        )
        entity_type, entity_code = _normalize_entity_link(
            db,
            entity_type=payload.entity_type,
            entity_code=payload.entity_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return {
        "feature_kind": feature_kind,
        "geometry_type": geometry_type,
        "entity_type": entity_type,
        "entity_code": entity_code,
        "label_latitude": label_latitude,
        "label_longitude": label_longitude,
        "is_primary": payload.is_primary,
        "geometry_geojson": geometry_geojson,
        "source_name": clean_optional_text(payload.source_name),
        "source_url": clean_optional_text(payload.source_url),
        "confidence": payload.confidence,
        "notes": clean_optional_text(payload.notes),
    }


def _update_spatial_feature_fields(db: Session, record, payload, provided_fields: set[str]) -> None:
    if "feature_kind" in provided_fields and payload.feature_kind is not None:
        record.feature_kind = normalize_spatial_feature_kind(payload.feature_kind)

    next_label_latitude = record.label_latitude
    if "label_latitude" in provided_fields:
        next_label_latitude = payload.label_latitude
    next_label_longitude = record.label_longitude
    if "label_longitude" in provided_fields:
        next_label_longitude = payload.label_longitude

    next_entity_type = record.entity_type
    if "entity_type" in provided_fields:
        next_entity_type = payload.entity_type
    next_entity_code = record.entity_code
    if "entity_code" in provided_fields:
        next_entity_code = payload.entity_code

    try:
        normalized_label_latitude, normalized_label_longitude = _normalize_label_coordinates(
            label_latitude=next_label_latitude,
            label_longitude=next_label_longitude,
        )
        normalized_entity_type, normalized_entity_code = _normalize_entity_link(
            db,
            entity_type=next_entity_type,
            entity_code=next_entity_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    if "geometry_geojson" in provided_fields:
        try:
            geometry_geojson = normalize_geojson_object(payload.geometry_geojson, field_name="geometry_geojson")
            if geometry_geojson is None:
                raise ValueError("geometry_geojson is required")
            record.geometry_geojson = geometry_geojson
            record.geometry_type = derive_geometry_type(geometry_geojson, field_name="geometry_geojson")
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    if "entity_type" in provided_fields or "entity_code" in provided_fields:
        record.entity_type = normalized_entity_type
        record.entity_code = normalized_entity_code

    if "label_latitude" in provided_fields or "label_longitude" in provided_fields:
        record.label_latitude = normalized_label_latitude
        record.label_longitude = normalized_label_longitude

    if "is_primary" in provided_fields and payload.is_primary is not None:
        record.is_primary = payload.is_primary
    if "source_name" in provided_fields:
        record.source_name = clean_optional_text(payload.source_name)
    if "source_url" in provided_fields:
        record.source_url = clean_optional_text(payload.source_url)
    if "confidence" in provided_fields:
        record.confidence = payload.confidence
    if "notes" in provided_fields:
        record.notes = clean_optional_text(payload.notes)


SPATIAL_FEATURE_SPEC = ReferenceDataCrudSpec(
    model=ReferenceSpatialFeature,
    out_schema_cls=SpatialFeatureOut,
    duplicate_detail="Spatial feature already exists",
    build_create_extra_values=_build_spatial_feature_create_values,
    update_extra_fields=_update_spatial_feature_fields,
)


@router.get("/spatial-features", response_model=List[SpatialFeatureOut])
def list_spatial_features(
    q: Optional[str] = None,
    feature_kind: Optional[str] = None,
    geometry_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[SpatialFeatureOut]:
    extra_filters = []

    if feature_kind:
        extra_filters.append(
            ReferenceSpatialFeature.feature_kind == normalize_spatial_feature_kind(feature_kind)
        )
    if geometry_type:
        extra_filters.append(ReferenceSpatialFeature.geometry_type == normalize_code(geometry_type))
    if entity_type:
        extra_filters.append(
            ReferenceSpatialFeature.entity_type
            == normalize_spatial_feature_entity_type(entity_type)
        )
    if entity_code:
        extra_filters.append(ReferenceSpatialFeature.entity_code == normalize_code(entity_code))

    return list_reference_collection(
        SPATIAL_FEATURE_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
        search_columns=[
            ReferenceSpatialFeature.code,
            ReferenceSpatialFeature.name,
            ReferenceSpatialFeature.description,
            ReferenceSpatialFeature.feature_kind,
            ReferenceSpatialFeature.geometry_type,
            ReferenceSpatialFeature.entity_type,
            ReferenceSpatialFeature.entity_code,
            ReferenceSpatialFeature.source_name,
            ReferenceSpatialFeature.source_url,
            ReferenceSpatialFeature.notes,
        ],
    )


@router.get("/spatial-features/standards", response_model=SpatialFeatureStandardsOut)
def list_spatial_feature_standards() -> SpatialFeatureStandardsOut:
    return SpatialFeatureStandardsOut(
        default_feature_kind=DEFAULT_SPATIAL_FEATURE_KIND,
        feature_kinds=list_spatial_feature_kinds(),
        geometry_types=list_spatial_feature_geometry_types(),
        entity_types=list_spatial_feature_entity_types(),
    )


@router.post("/spatial-features", response_model=SpatialFeatureOut, status_code=201)
def create_spatial_feature(
    payload: SpatialFeatureCreate,
    db: Session = Depends(get_db),
) -> SpatialFeatureOut:
    return create_reference_resource(SPATIAL_FEATURE_SPEC, payload, db=db)


@router.get("/spatial-features/{code}", response_model=SpatialFeatureOut)
def get_spatial_feature(code: str, db: Session = Depends(get_db)) -> SpatialFeatureOut:
    return get_reference_resource(SPATIAL_FEATURE_SPEC, code, db=db)


@router.put("/spatial-features/{code}", response_model=SpatialFeatureOut)
def update_spatial_feature(
    code: str,
    payload: SpatialFeatureUpdate,
    db: Session = Depends(get_db),
) -> SpatialFeatureOut:
    return update_reference_resource(SPATIAL_FEATURE_SPEC, code, payload, db=db)


@router.post("/spatial-features/{code}/deactivate", response_model=SpatialFeatureOut)
def deactivate_spatial_feature(
    code: str,
    payload: SpatialFeatureStatusUpdate,
    db: Session = Depends(get_db),
) -> SpatialFeatureOut:
    return set_reference_resource_active(
        SPATIAL_FEATURE_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/spatial-features/{code}/activate", response_model=SpatialFeatureOut)
def activate_spatial_feature(
    code: str,
    payload: SpatialFeatureStatusUpdate,
    db: Session = Depends(get_db),
) -> SpatialFeatureOut:
    return set_reference_resource_active(
        SPATIAL_FEATURE_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
