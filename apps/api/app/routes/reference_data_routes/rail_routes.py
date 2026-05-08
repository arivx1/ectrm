from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.location_standards import normalize_timezone_name
from apps.api.app.domains.reference_data.services.rail_route_standards import (
    DEFAULT_RAIL_ROUTE_DIRECTION,
    list_rail_route_directions,
    normalize_rail_local_time,
    normalize_rail_route_direction,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_rail_route import ReferenceRailRoute
from apps.api.app.schemas.reference_data import (
    RailRouteCreate,
    RailRouteOut,
    RailRouteStandardsOut,
    RailRouteStatusUpdate,
    RailRouteUpdate,
)

from .common import ensure_active_calendar_exists, ensure_active_location_exists, ensure_active_rail_line_exists
from .factory import ReferenceDataCrudSpec
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _build_rail_route_create_values(db: Session, payload: RailRouteCreate) -> dict[str, object]:
    return {
        "rail_line_code": ensure_active_rail_line_exists(db, payload.rail_line_code),
        "origin_location_code": (
            ensure_active_location_exists(db, payload.origin_location_code)
            if payload.origin_location_code is not None and payload.origin_location_code.strip()
            else None
        ),
        "destination_location_code": (
            ensure_active_location_exists(db, payload.destination_location_code)
            if payload.destination_location_code is not None and payload.destination_location_code.strip()
            else None
        ),
        "service_calendar_code": (
            ensure_active_calendar_exists(db, payload.service_calendar_code)
            if payload.service_calendar_code is not None and payload.service_calendar_code.strip()
            else None
        ),
        "route_direction": normalize_rail_route_direction(payload.route_direction),
        "schedule_timezone": normalize_timezone_name(payload.schedule_timezone),
        "placement_cutoff_time_local": normalize_rail_local_time(
            payload.placement_cutoff_time_local,
            field_name="placement_cutoff_time_local",
        ),
        "release_cutoff_time_local": normalize_rail_local_time(
            payload.release_cutoff_time_local,
            field_name="release_cutoff_time_local",
        ),
        "placement_free_time_hours": payload.placement_free_time_hours,
        "release_free_time_hours": payload.release_free_time_hours,
    }


def _update_rail_route_fields(db: Session, record, payload, provided_fields: set[str]) -> None:
    if "rail_line_code" in provided_fields and payload.rail_line_code is not None:
        record.rail_line_code = ensure_active_rail_line_exists(db, payload.rail_line_code)
    if "origin_location_code" in provided_fields:
        record.origin_location_code = (
            ensure_active_location_exists(db, payload.origin_location_code)
            if payload.origin_location_code is not None and payload.origin_location_code.strip()
            else None
        )
    if "destination_location_code" in provided_fields:
        record.destination_location_code = (
            ensure_active_location_exists(db, payload.destination_location_code)
            if payload.destination_location_code is not None and payload.destination_location_code.strip()
            else None
        )
    if "service_calendar_code" in provided_fields:
        record.service_calendar_code = (
            ensure_active_calendar_exists(db, payload.service_calendar_code)
            if payload.service_calendar_code is not None and payload.service_calendar_code.strip()
            else None
        )
    if "route_direction" in provided_fields and payload.route_direction is not None:
        record.route_direction = normalize_rail_route_direction(payload.route_direction)
    if "schedule_timezone" in provided_fields:
        record.schedule_timezone = normalize_timezone_name(payload.schedule_timezone)
    if "placement_cutoff_time_local" in provided_fields:
        record.placement_cutoff_time_local = normalize_rail_local_time(
            payload.placement_cutoff_time_local,
            field_name="placement_cutoff_time_local",
        )
    if "release_cutoff_time_local" in provided_fields:
        record.release_cutoff_time_local = normalize_rail_local_time(
            payload.release_cutoff_time_local,
            field_name="release_cutoff_time_local",
        )
    if "placement_free_time_hours" in provided_fields:
        record.placement_free_time_hours = payload.placement_free_time_hours
    if "release_free_time_hours" in provided_fields:
        record.release_free_time_hours = payload.release_free_time_hours


RAIL_ROUTE_SPEC = ReferenceDataCrudSpec(
    model=ReferenceRailRoute,
    out_schema_cls=RailRouteOut,
    duplicate_detail="Rail route already exists",
    build_create_extra_values=_build_rail_route_create_values,
    update_extra_fields=_update_rail_route_fields,
)


@router.get("/rail-routes", response_model=List[RailRouteOut])
def list_rail_routes(
    q: Optional[str] = None,
    rail_line_code: Optional[str] = None,
    origin_location_code: Optional[str] = None,
    destination_location_code: Optional[str] = None,
    service_calendar_code: Optional[str] = None,
    route_direction: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[RailRouteOut]:
    extra_filters = []
    if rail_line_code:
        extra_filters.append(ReferenceRailRoute.rail_line_code == normalize_code(rail_line_code))
    if origin_location_code:
        extra_filters.append(
            ReferenceRailRoute.origin_location_code == normalize_code(origin_location_code)
        )
    if destination_location_code:
        extra_filters.append(
            ReferenceRailRoute.destination_location_code == normalize_code(destination_location_code)
        )
    if service_calendar_code:
        extra_filters.append(
            ReferenceRailRoute.service_calendar_code == normalize_code(service_calendar_code)
        )
    if route_direction:
        extra_filters.append(
            ReferenceRailRoute.route_direction == normalize_rail_route_direction(route_direction)
        )

    return list_reference_collection(
        RAIL_ROUTE_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
        search_columns=[
            ReferenceRailRoute.code,
            ReferenceRailRoute.rail_line_code,
            ReferenceRailRoute.name,
            ReferenceRailRoute.description,
            ReferenceRailRoute.origin_location_code,
            ReferenceRailRoute.destination_location_code,
            ReferenceRailRoute.service_calendar_code,
            ReferenceRailRoute.schedule_timezone,
        ],
    )


@router.get("/rail-routes/standards", response_model=RailRouteStandardsOut)
def list_rail_route_standards() -> RailRouteStandardsOut:
    return RailRouteStandardsOut(
        default_route_direction=DEFAULT_RAIL_ROUTE_DIRECTION,
        route_directions=list_rail_route_directions(),
    )


@router.post("/rail-routes", response_model=RailRouteOut, status_code=201)
def create_rail_route(payload: RailRouteCreate, db: Session = Depends(get_db)) -> RailRouteOut:
    return create_reference_resource(RAIL_ROUTE_SPEC, payload, db=db)


@router.get("/rail-routes/{code}", response_model=RailRouteOut)
def get_rail_route(code: str, db: Session = Depends(get_db)) -> RailRouteOut:
    return get_reference_resource(RAIL_ROUTE_SPEC, code, db=db)


@router.put("/rail-routes/{code}", response_model=RailRouteOut)
def update_rail_route(
    code: str,
    payload: RailRouteUpdate,
    db: Session = Depends(get_db),
) -> RailRouteOut:
    return update_reference_resource(RAIL_ROUTE_SPEC, code, payload, db=db)


@router.post("/rail-routes/{code}/deactivate", response_model=RailRouteOut)
def deactivate_rail_route(
    code: str,
    payload: RailRouteStatusUpdate,
    db: Session = Depends(get_db),
) -> RailRouteOut:
    return set_reference_resource_active(
        RAIL_ROUTE_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/rail-routes/{code}/activate", response_model=RailRouteOut)
def activate_rail_route(
    code: str,
    payload: RailRouteStatusUpdate,
    db: Session = Depends(get_db),
) -> RailRouteOut:
    return set_reference_resource_active(
        RAIL_ROUTE_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
