from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.location_standards import normalize_timezone_name
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_rail_line import ReferenceRailLine
from apps.api.app.schemas.reference_data import (
    RailLineCreate,
    RailLineOut,
    RailLineStatusUpdate,
    RailLineUpdate,
)

from .common import clean_optional_text
from .factory import ReferenceDataCrudSpec
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _build_rail_line_create_values(_db: Session, payload: RailLineCreate) -> dict[str, object]:
    return {
        "railroad_code": normalize_code(payload.railroad_code),
        "operator_name": clean_optional_text(payload.operator_name),
        "default_timezone": normalize_timezone_name(payload.default_timezone),
    }


def _update_rail_line_fields(_db: Session, record, payload, provided_fields: set[str]) -> None:
    if "railroad_code" in provided_fields and payload.railroad_code is not None:
        record.railroad_code = normalize_code(payload.railroad_code)
    if "operator_name" in provided_fields:
        record.operator_name = clean_optional_text(payload.operator_name)
    if "default_timezone" in provided_fields:
        record.default_timezone = normalize_timezone_name(payload.default_timezone)


RAIL_LINE_SPEC = ReferenceDataCrudSpec(
    model=ReferenceRailLine,
    out_schema_cls=RailLineOut,
    duplicate_detail="Rail line already exists",
    build_create_extra_values=_build_rail_line_create_values,
    update_extra_fields=_update_rail_line_fields,
)


@router.get("/rail-lines", response_model=List[RailLineOut])
def list_rail_lines(
    q: Optional[str] = None,
    railroad_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[RailLineOut]:
    extra_filters = []
    if railroad_code:
        extra_filters.append(ReferenceRailLine.railroad_code == normalize_code(railroad_code))

    return list_reference_collection(
        RAIL_LINE_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
        search_columns=[
            ReferenceRailLine.code,
            ReferenceRailLine.railroad_code,
            ReferenceRailLine.name,
            ReferenceRailLine.description,
            ReferenceRailLine.operator_name,
            ReferenceRailLine.default_timezone,
        ],
    )


@router.post("/rail-lines", response_model=RailLineOut, status_code=201)
def create_rail_line(payload: RailLineCreate, db: Session = Depends(get_db)) -> RailLineOut:
    return create_reference_resource(RAIL_LINE_SPEC, payload, db=db)


@router.get("/rail-lines/{code}", response_model=RailLineOut)
def get_rail_line(code: str, db: Session = Depends(get_db)) -> RailLineOut:
    return get_reference_resource(RAIL_LINE_SPEC, code, db=db)


@router.put("/rail-lines/{code}", response_model=RailLineOut)
def update_rail_line(
    code: str,
    payload: RailLineUpdate,
    db: Session = Depends(get_db),
) -> RailLineOut:
    return update_reference_resource(RAIL_LINE_SPEC, code, payload, db=db)


@router.post("/rail-lines/{code}/deactivate", response_model=RailLineOut)
def deactivate_rail_line(
    code: str,
    payload: RailLineStatusUpdate,
    db: Session = Depends(get_db),
) -> RailLineOut:
    return set_reference_resource_active(
        RAIL_LINE_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/rail-lines/{code}/activate", response_model=RailLineOut)
def activate_rail_line(
    code: str,
    payload: RailLineStatusUpdate,
    db: Session = Depends(get_db),
) -> RailLineOut:
    return set_reference_resource_active(
        RAIL_LINE_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
