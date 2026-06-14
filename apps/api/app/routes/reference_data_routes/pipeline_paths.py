from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.location_standards import normalize_timezone_name
from apps.api.app.domains.reference_data.services.pipeline_path_standards import (
    DEFAULT_PIPELINE_PATH_DIRECTION,
    list_pipeline_path_directions,
    normalize_pipeline_path_direction,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_pipeline_path import ReferencePipelinePath
from apps.api.app.schemas.reference_data import (
    PipelinePathCreate,
    PipelinePathOut,
    PipelinePathStandardsOut,
    PipelinePathStatusUpdate,
    PipelinePathUpdate,
)

from .common import (
    ensure_active_location_exists,
    ensure_active_pipeline_asset_exists,
    ensure_active_pipeline_point_belongs_to_pipeline,
)
from .factory import ReferenceDataCrudSpec
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _normalize_pipeline_point_code(
    db: Session,
    *,
    point_code: Optional[str],
    pipeline_code: str,
    field_name: str,
) -> Optional[str]:
    if point_code is None or not point_code.strip():
        return None
    return ensure_active_pipeline_point_belongs_to_pipeline(
        db,
        point_code=point_code,
        pipeline_code=pipeline_code,
        field_name=field_name,
    )


def _build_pipeline_path_create_values(db: Session, payload: PipelinePathCreate) -> dict[str, object]:
    pipeline_code = ensure_active_pipeline_asset_exists(db, payload.pipeline_code)
    return {
        "pipeline_code": pipeline_code,
        "receipt_location_code": (
            ensure_active_location_exists(db, payload.receipt_location_code)
            if payload.receipt_location_code is not None and payload.receipt_location_code.strip()
            else None
        ),
        "delivery_location_code": (
            ensure_active_location_exists(db, payload.delivery_location_code)
            if payload.delivery_location_code is not None and payload.delivery_location_code.strip()
            else None
        ),
        "receipt_point_code": _normalize_pipeline_point_code(
            db,
            point_code=payload.receipt_point_code,
            pipeline_code=pipeline_code,
            field_name="receipt_point_code",
        ),
        "delivery_point_code": _normalize_pipeline_point_code(
            db,
            point_code=payload.delivery_point_code,
            pipeline_code=pipeline_code,
            field_name="delivery_point_code",
        ),
        "path_direction": normalize_pipeline_path_direction(payload.path_direction),
        "cycle_timezone": normalize_timezone_name(payload.cycle_timezone),
    }


def _update_pipeline_path_fields(db: Session, record, payload, provided_fields: set[str]) -> None:
    next_pipeline_code = record.pipeline_code
    if "pipeline_code" in provided_fields and payload.pipeline_code is not None:
        next_pipeline_code = ensure_active_pipeline_asset_exists(db, payload.pipeline_code)
    if "receipt_location_code" in provided_fields:
        record.receipt_location_code = (
            ensure_active_location_exists(db, payload.receipt_location_code)
            if payload.receipt_location_code is not None and payload.receipt_location_code.strip()
            else None
        )
    if "delivery_location_code" in provided_fields:
        record.delivery_location_code = (
            ensure_active_location_exists(db, payload.delivery_location_code)
            if payload.delivery_location_code is not None and payload.delivery_location_code.strip()
            else None
        )
    if "receipt_point_code" in provided_fields:
        record.receipt_point_code = _normalize_pipeline_point_code(
            db,
            point_code=payload.receipt_point_code,
            pipeline_code=next_pipeline_code,
            field_name="receipt_point_code",
        )
    elif "pipeline_code" in provided_fields and record.receipt_point_code is not None:
        record.receipt_point_code = _normalize_pipeline_point_code(
            db,
            point_code=record.receipt_point_code,
            pipeline_code=next_pipeline_code,
            field_name="receipt_point_code",
        )
    if "delivery_point_code" in provided_fields:
        record.delivery_point_code = _normalize_pipeline_point_code(
            db,
            point_code=payload.delivery_point_code,
            pipeline_code=next_pipeline_code,
            field_name="delivery_point_code",
        )
    elif "pipeline_code" in provided_fields and record.delivery_point_code is not None:
        record.delivery_point_code = _normalize_pipeline_point_code(
            db,
            point_code=record.delivery_point_code,
            pipeline_code=next_pipeline_code,
            field_name="delivery_point_code",
        )
    if "path_direction" in provided_fields and payload.path_direction is not None:
        record.path_direction = normalize_pipeline_path_direction(payload.path_direction)
    if "cycle_timezone" in provided_fields:
        record.cycle_timezone = normalize_timezone_name(payload.cycle_timezone)
    record.pipeline_code = next_pipeline_code


PIPELINE_PATH_SPEC = ReferenceDataCrudSpec(
    model=ReferencePipelinePath,
    out_schema_cls=PipelinePathOut,
    duplicate_detail="Pipeline path already exists",
    build_create_extra_values=_build_pipeline_path_create_values,
    update_extra_fields=_update_pipeline_path_fields,
)


@router.get("/pipeline-paths", response_model=List[PipelinePathOut])
def list_pipeline_paths(
    q: Optional[str] = None,
    pipeline_code: Optional[str] = None,
    receipt_location_code: Optional[str] = None,
    delivery_location_code: Optional[str] = None,
    receipt_point_code: Optional[str] = None,
    delivery_point_code: Optional[str] = None,
    path_direction: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[PipelinePathOut]:
    extra_filters = []
    if pipeline_code:
        extra_filters.append(ReferencePipelinePath.pipeline_code == normalize_code(pipeline_code))
    if receipt_location_code:
        extra_filters.append(
            ReferencePipelinePath.receipt_location_code == normalize_code(receipt_location_code)
        )
    if delivery_location_code:
        extra_filters.append(
            ReferencePipelinePath.delivery_location_code == normalize_code(delivery_location_code)
        )
    if receipt_point_code:
        extra_filters.append(
            ReferencePipelinePath.receipt_point_code == normalize_code(receipt_point_code)
        )
    if delivery_point_code:
        extra_filters.append(
            ReferencePipelinePath.delivery_point_code == normalize_code(delivery_point_code)
        )
    if path_direction:
        extra_filters.append(
            ReferencePipelinePath.path_direction == normalize_pipeline_path_direction(path_direction)
        )

    return list_reference_collection(
        PIPELINE_PATH_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
        search_columns=[
            ReferencePipelinePath.code,
            ReferencePipelinePath.pipeline_code,
            ReferencePipelinePath.name,
            ReferencePipelinePath.description,
            ReferencePipelinePath.receipt_location_code,
            ReferencePipelinePath.delivery_location_code,
            ReferencePipelinePath.receipt_point_code,
            ReferencePipelinePath.delivery_point_code,
            ReferencePipelinePath.cycle_timezone,
        ],
    )


@router.get("/pipeline-paths/standards", response_model=PipelinePathStandardsOut)
def list_pipeline_path_standards() -> PipelinePathStandardsOut:
    return PipelinePathStandardsOut(
        default_path_direction=DEFAULT_PIPELINE_PATH_DIRECTION,
        path_directions=list_pipeline_path_directions(),
    )


@router.post("/pipeline-paths", response_model=PipelinePathOut, status_code=201)
def create_pipeline_path(payload: PipelinePathCreate, db: Session = Depends(get_db)) -> PipelinePathOut:
    return create_reference_resource(PIPELINE_PATH_SPEC, payload, db=db)


@router.get("/pipeline-paths/{code}", response_model=PipelinePathOut)
def get_pipeline_path(code: str, db: Session = Depends(get_db)) -> PipelinePathOut:
    return get_reference_resource(PIPELINE_PATH_SPEC, code, db=db)


@router.put("/pipeline-paths/{code}", response_model=PipelinePathOut)
def update_pipeline_path(
    code: str,
    payload: PipelinePathUpdate,
    db: Session = Depends(get_db),
) -> PipelinePathOut:
    return update_reference_resource(PIPELINE_PATH_SPEC, code, payload, db=db)


@router.post("/pipeline-paths/{code}/deactivate", response_model=PipelinePathOut)
def deactivate_pipeline_path(
    code: str,
    payload: PipelinePathStatusUpdate,
    db: Session = Depends(get_db),
) -> PipelinePathOut:
    return set_reference_resource_active(
        PIPELINE_PATH_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/pipeline-paths/{code}/activate", response_model=PipelinePathOut)
def activate_pipeline_path(
    code: str,
    payload: PipelinePathStatusUpdate,
    db: Session = Depends(get_db),
) -> PipelinePathOut:
    return set_reference_resource_active(
        PIPELINE_PATH_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
