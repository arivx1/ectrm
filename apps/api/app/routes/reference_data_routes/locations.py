from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.location_standards import (
    DEFAULT_LOCATION_KIND,
    DEFAULT_LOCATION_TYPE_BY_KIND,
    infer_country_code_from_subdivision,
    list_continent_codes,
    list_location_kinds,
    list_location_market_codes,
    list_location_types_by_kind,
    normalize_continent_code,
    normalize_country_code,
    normalize_location_kind,
    normalize_location_market,
    normalize_location_type,
    normalize_location_type_filter,
    normalize_subdivision_code,
    normalize_timezone_name,
)
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.schemas.reference_data import (
    LocationCreate,
    LocationOut,
    LocationStandardsOut,
    LocationStatusUpdate,
    LocationUpdate,
)

from .common import (
    clean_optional_text,
    ensure_location_can_be_region_parent,
    ensure_location_not_in_active_use,
    normalize_location_parent_code,
    to_out,
    validate_location_coordinates,
)
from .factory import create_reference_resource
from .factory import get_reference_resource
from .factory import list_reference_collection
from .factory import ReferenceDataCrudSpec
from .factory import set_reference_resource_active
from .factory import update_reference_resource

router = APIRouter()


def _update_location_fields(db: Session, record, payload, provided_fields: set[str]) -> None:
    next_location_kind = record.location_kind
    if "location_kind" in provided_fields and payload.location_kind is not None:
        next_location_kind = normalize_location_kind(payload.location_kind)
    ensure_location_can_be_region_parent(
        db,
        record_code=record.code,
        next_location_kind=next_location_kind,
    )

    next_location_type = record.location_type
    if "location_type" in provided_fields and payload.location_type is not None:
        next_location_type = normalize_location_type(
            payload.location_type,
            location_kind=next_location_kind,
        )
    elif "location_kind" in provided_fields:
        next_location_type = normalize_location_type(
            record.location_type,
            location_kind=next_location_kind,
        )

    next_parent_location_code = record.parent_location_code
    if "parent_location_code" in provided_fields:
        next_parent_location_code = normalize_location_parent_code(
            db,
            record_code=record.code,
            parent_location_code=payload.parent_location_code,
        )

    next_latitude = record.latitude
    if "latitude" in provided_fields:
        next_latitude = payload.latitude
    next_longitude = record.longitude
    if "longitude" in provided_fields:
        next_longitude = payload.longitude
    validate_location_coordinates(next_latitude, next_longitude)

    next_country_code = record.country_code
    if "country_code" in provided_fields:
        next_country_code = normalize_country_code(payload.country_code)

    next_subdivision_code = record.subdivision_code
    if "subdivision_code" in provided_fields:
        next_subdivision_code = normalize_subdivision_code(
            payload.subdivision_code,
            country_code=next_country_code,
        )
    elif "country_code" in provided_fields and next_subdivision_code is not None:
        next_subdivision_code = normalize_subdivision_code(
            next_subdivision_code,
            country_code=next_country_code,
        )
    if next_country_code is None and next_subdivision_code is not None:
        next_country_code = infer_country_code_from_subdivision(next_subdivision_code)

    next_continent_code = record.continent_code
    if "continent_code" in provided_fields:
        next_continent_code = normalize_continent_code(payload.continent_code)

    next_market = record.market
    if "market" in provided_fields:
        next_market = normalize_location_market(payload.market)

    next_timezone = record.timezone
    if "timezone" in provided_fields:
        next_timezone = normalize_timezone_name(payload.timezone)

    if "location_kind" in provided_fields and payload.location_kind is not None:
        record.location_kind = next_location_kind
    if "location_type" in provided_fields or "location_kind" in provided_fields:
        record.location_type = next_location_type
    if "parent_location_code" in provided_fields:
        record.parent_location_code = next_parent_location_code
    if "market" in provided_fields:
        record.market = next_market
    if "city" in provided_fields:
        record.city = clean_optional_text(payload.city)
    if "subdivision_code" in provided_fields or "country_code" in provided_fields:
        record.subdivision_code = next_subdivision_code
        record.country_code = next_country_code
    if "continent_code" in provided_fields:
        record.continent_code = next_continent_code
    if "latitude" in provided_fields:
        record.latitude = payload.latitude
    if "longitude" in provided_fields:
        record.longitude = payload.longitude
    if "region" in provided_fields:
        record.region = clean_optional_text(payload.region)
    if "timezone" in provided_fields:
        record.timezone = next_timezone


def _build_location_create_values(db: Session, payload: LocationCreate) -> dict[str, object]:
    normalized_code = payload.code.strip().upper()
    normalized_location_kind = normalize_location_kind(payload.location_kind)
    normalized_location_type = normalize_location_type(
        payload.location_type,
        location_kind=normalized_location_kind,
    )
    normalized_parent_location_code = normalize_location_parent_code(
        db,
        record_code=normalized_code,
        parent_location_code=payload.parent_location_code,
    )
    validate_location_coordinates(payload.latitude, payload.longitude)
    normalized_country_code = normalize_country_code(payload.country_code)
    normalized_subdivision_code = normalize_subdivision_code(
        payload.subdivision_code,
        country_code=normalized_country_code,
    )
    if normalized_country_code is None and normalized_subdivision_code is not None:
        normalized_country_code = infer_country_code_from_subdivision(normalized_subdivision_code)

    return {
        "location_kind": normalized_location_kind,
        "location_type": normalized_location_type,
        "parent_location_code": normalized_parent_location_code,
        "market": normalize_location_market(payload.market),
        "city": clean_optional_text(payload.city),
        "subdivision_code": normalized_subdivision_code,
        "country_code": normalized_country_code,
        "continent_code": normalize_continent_code(payload.continent_code),
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "region": clean_optional_text(payload.region),
        "timezone": normalize_timezone_name(payload.timezone),
    }


LOCATION_SPEC = ReferenceDataCrudSpec(
    model=ReferenceLocation,
    out_schema_cls=LocationOut,
    duplicate_detail="Location already exists",
    build_create_extra_values=_build_location_create_values,
    update_extra_fields=_update_location_fields,
    validate_deactivate=ensure_location_not_in_active_use,
)


@router.get("/locations", response_model=List[LocationOut])
def list_locations(
    q: Optional[str] = None,
    market: Optional[str] = None,
    location_kind: Optional[str] = None,
    location_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> List[LocationOut]:
    extra_filters = []
    normalized_location_kind: Optional[str] = None
    if market:
        extra_filters.append(ReferenceLocation.market == normalize_location_market(market))
    if location_kind:
        normalized_location_kind = normalize_location_kind(location_kind)
        extra_filters.append(ReferenceLocation.location_kind == normalized_location_kind)
    if location_type:
        normalized_location_type = normalize_location_type_filter(
            location_type,
            location_kind=normalized_location_kind,
        )
        extra_filters.append(ReferenceLocation.location_type == normalized_location_type)
    return list_reference_collection(
        LOCATION_SPEC,
        db=db,
        q=q,
        is_active=is_active,
        limit=limit,
        offset=offset,
        extra_filters=extra_filters,
    )


@router.get("/locations/standards", response_model=LocationStandardsOut)
def list_location_standards() -> LocationStandardsOut:
    return LocationStandardsOut(
        default_location_kind=DEFAULT_LOCATION_KIND,
        default_location_type_by_kind=DEFAULT_LOCATION_TYPE_BY_KIND,
        location_kinds=list_location_kinds(),
        location_types_by_kind=list_location_types_by_kind(),
        market_codes=list_location_market_codes(),
        continent_codes=list_continent_codes(),
    )


@router.post("/locations", response_model=LocationOut, status_code=201)
def create_location(payload: LocationCreate, db: Session = Depends(get_db)) -> LocationOut:
    return create_reference_resource(LOCATION_SPEC, payload, db=db)


@router.get("/locations/{code}", response_model=LocationOut)
def get_location(code: str, db: Session = Depends(get_db)) -> LocationOut:
    return get_reference_resource(LOCATION_SPEC, code, db=db)


@router.put("/locations/{code}", response_model=LocationOut)
def update_location(code: str, payload: LocationUpdate, db: Session = Depends(get_db)) -> LocationOut:
    return update_reference_resource(LOCATION_SPEC, code, payload, db=db)


@router.post("/locations/{code}/deactivate", response_model=LocationOut)
def deactivate_location(
    code: str,
    payload: LocationStatusUpdate,
    db: Session = Depends(get_db),
) -> LocationOut:
    return set_reference_resource_active(
        LOCATION_SPEC,
        code,
        payload,
        is_active=False,
        db=db,
    )


@router.post("/locations/{code}/activate", response_model=LocationOut)
def activate_location(
    code: str,
    payload: LocationStatusUpdate,
    db: Session = Depends(get_db),
) -> LocationOut:
    return set_reference_resource_active(
        LOCATION_SPEC,
        code,
        payload,
        is_active=True,
        db=db,
    )
