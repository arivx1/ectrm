from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.pipeline_reference_standards import (
    DEFAULT_PIPELINE_POINT_ROLE,
    list_pipeline_point_roles,
    normalize_pipeline_point_role,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_pipeline_point import ReferencePipelinePoint
from apps.api.app.schemas.reference_data import (
    PipelinePointCreate,
    PipelinePointOut,
    PipelinePointStandardsOut,
    PipelinePointStatusUpdate,
    PipelinePointUpdate,
)

from .common import (
    clean_optional_text,
    ensure_active_location_exists,
    ensure_active_pipeline_asset_exists,
)
from .factory import ReferenceDataCrudSpec
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _normalize_connected_pipeline_code(db: Session, value: Optional[str]) -> Optional[str]:
    if value is None or not value.strip():
        return None
    return ensure_active_pipeline_asset_exists(db, value)


def _build_pipeline_point_create_values(
    db: Session,
    payload: PipelinePointCreate,
) -> dict[str, object]:
    return {
        "pipeline_code": ensure_active_pipeline_asset_exists(db, payload.pipeline_code),
        "location_code": (
            ensure_active_location_exists(db, payload.location_code)
            if payload.location_code is not None and payload.location_code.strip()
            else None
        ),
        "point_role": normalize_pipeline_point_role(payload.point_role),
        "operator_point_code": clean_optional_text(payload.operator_point_code),
        "operator_zone": clean_optional_text(payload.operator_zone),
        "connected_pipeline_code": _normalize_connected_pipeline_code(
            db,
            payload.connected_pipeline_code,
        ),
        "is_tradable": payload.is_tradable,
        "is_pricing_point": payload.is_pricing_point,
        "is_scheduling_point": payload.is_scheduling_point,
        "sort_order": payload.sort_order,
    }


def _update_pipeline_point_fields(db: Session, record, payload, provided_fields: set[str]) -> None:
    if "pipeline_code" in provided_fields and payload.pipeline_code is not None:
        record.pipeline_code = ensure_active_pipeline_asset_exists(db, payload.pipeline_code)
    if "location_code" in provided_fields:
        record.location_code = (
            ensure_active_location_exists(db, payload.location_code)
            if payload.location_code is not None and payload.location_code.strip()
            else None
        )
    if "point_role" in provided_fields and payload.point_role is not None:
        record.point_role = normalize_pipeline_point_role(payload.point_role)
    if "operator_point_code" in provided_fields:
        record.operator_point_code = clean_optional_text(payload.operator_point_code)
    if "operator_zone" in provided_fields:
        record.operator_zone = clean_optional_text(payload.operator_zone)
    if "connected_pipeline_code" in provided_fields:
        record.connected_pipeline_code = _normalize_connected_pipeline_code(
            db,
            payload.connected_pipeline_code,
        )
    if "is_tradable" in provided_fields and payload.is_tradable is not None:
        record.is_tradable = payload.is_tradable
    if "is_pricing_point" in provided_fields and payload.is_pricing_point is not None:
        record.is_pricing_point = payload.is_pricing_point
    if "is_scheduling_point" in provided_fields and payload.is_scheduling_point is not None:
        record.is_scheduling_point = payload.is_scheduling_point
    if "sort_order" in provided_fields:
        record.sort_order = payload.sort_order


PIPELINE_POINT_SPEC = ReferenceDataCrudSpec(
    model=ReferencePipelinePoint,
    out_schema_cls=PipelinePointOut,
    duplicate_detail="Pipeline point already exists",
    build_create_extra_values=_build_pipeline_point_create_values,
    update_extra_fields=_update_pipeline_point_fields,
)


@router.get("/pipeline-points", response_model=List[PipelinePointOut])
def list_pipeline_points(
    q: Optional[str] = None,
    pipeline_code: Optional[str] = None,
    location_code: Optional[str] = None,
    point_role: Optional[str] = None,
    connected_pipeline_code: Optional[str] = None,
    is_tradable: Optional[bool] = None,
    is_pricing_point: Optional[bool] = None,
    is_scheduling_point: Optional[bool] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[PipelinePointOut]:
    extra_filters = []
    if pipeline_code:
        extra_filters.append(ReferencePipelinePoint.pipeline_code == normalize_code(pipeline_code))
    if location_code:
        extra_filters.append(ReferencePipelinePoint.location_code == normalize_code(location_code))
    if point_role:
        extra_filters.append(
            ReferencePipelinePoint.point_role == normalize_pipeline_point_role(point_role)
        )
    if connected_pipeline_code:
        extra_filters.append(
            ReferencePipelinePoint.connected_pipeline_code == normalize_code(connected_pipeline_code)
        )
    if is_tradable is not None:
        extra_filters.append(ReferencePipelinePoint.is_tradable == is_tradable)
    if is_pricing_point is not None:
        extra_filters.append(ReferencePipelinePoint.is_pricing_point == is_pricing_point)
    if is_scheduling_point is not None:
        extra_filters.append(ReferencePipelinePoint.is_scheduling_point == is_scheduling_point)

    return list_reference_collection(
        PIPELINE_POINT_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
        search_columns=[
            ReferencePipelinePoint.code,
            ReferencePipelinePoint.pipeline_code,
            ReferencePipelinePoint.name,
            ReferencePipelinePoint.description,
            ReferencePipelinePoint.location_code,
            ReferencePipelinePoint.point_role,
            ReferencePipelinePoint.operator_point_code,
            ReferencePipelinePoint.operator_zone,
        ],
    )


@router.get("/pipeline-points/standards", response_model=PipelinePointStandardsOut)
def list_pipeline_point_standards() -> PipelinePointStandardsOut:
    return PipelinePointStandardsOut(
        default_point_role=DEFAULT_PIPELINE_POINT_ROLE,
        point_roles=list_pipeline_point_roles(),
    )


@router.post("/pipeline-points", response_model=PipelinePointOut, status_code=201)
def create_pipeline_point(
    payload: PipelinePointCreate,
    db: Session = Depends(get_db),
) -> PipelinePointOut:
    return create_reference_resource(PIPELINE_POINT_SPEC, payload, db=db)


@router.get("/pipeline-points/{code}", response_model=PipelinePointOut)
def get_pipeline_point(code: str, db: Session = Depends(get_db)) -> PipelinePointOut:
    return get_reference_resource(PIPELINE_POINT_SPEC, code, db=db)


@router.put("/pipeline-points/{code}", response_model=PipelinePointOut)
def update_pipeline_point(
    code: str,
    payload: PipelinePointUpdate,
    db: Session = Depends(get_db),
) -> PipelinePointOut:
    return update_reference_resource(PIPELINE_POINT_SPEC, code, payload, db=db)


@router.post("/pipeline-points/{code}/deactivate", response_model=PipelinePointOut)
def deactivate_pipeline_point(
    code: str,
    payload: PipelinePointStatusUpdate,
    db: Session = Depends(get_db),
) -> PipelinePointOut:
    return set_reference_resource_active(
        PIPELINE_POINT_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/pipeline-points/{code}/activate", response_model=PipelinePointOut)
def activate_pipeline_point(
    code: str,
    payload: PipelinePointStatusUpdate,
    db: Session = Depends(get_db),
) -> PipelinePointOut:
    return set_reference_resource_active(
        PIPELINE_POINT_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
