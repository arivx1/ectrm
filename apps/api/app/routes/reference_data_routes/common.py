from __future__ import annotations

from typing import Optional, TypeVar

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_pipeline_path import ReferencePipelinePath
from apps.api.app.models.reference_pipeline_point import ReferencePipelinePoint
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_rail_line import ReferenceRailLine
from apps.api.app.models.reference_rail_route import ReferenceRailRoute
from apps.api.app.models.reference_spatial_feature import ReferenceSpatialFeature
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade

ModelT = TypeVar(
    "ModelT",
    ReferenceBook,
    ReferenceAsset,
    ReferenceCalendar,
    ReferenceCommodity,
    ReferenceCounterparty,
    ReferenceCurrency,
    ReferenceUnit,
    ReferenceLocation,
    ReferencePipelinePath,
    ReferencePipelinePoint,
    ReferencePortfolio,
    ReferencePriceIndex,
    ReferenceRailLine,
    ReferenceRailRoute,
    ReferenceSpatialFeature,
)


def clean_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def clean_optional_code(value: Optional[str]) -> Optional[str]:
    cleaned = clean_optional_text(value)
    return normalize_code(cleaned) if cleaned is not None else None


def normalize_lei_code(value: Optional[str]) -> Optional[str]:
    return clean_optional_code(value)


def normalize_duns_number(value: Optional[str]) -> Optional[str]:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    return cleaned.replace("-", "").replace(" ", "")


def normalize_ticker_symbol(value: Optional[str]) -> Optional[str]:
    return clean_optional_code(value)


def normalize_location_parent_code(
    db: Session,
    *,
    record_code: str,
    parent_location_code: Optional[str],
) -> Optional[str]:
    normalized_parent_code = clean_optional_code(parent_location_code)
    if normalized_parent_code is None:
        return None
    if normalized_parent_code == record_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Location cannot be its own parent",
        )

    parent = db.execute(
        select(ReferenceLocation).where(ReferenceLocation.code == normalized_parent_code)
    ).scalars().first()
    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Parent location '{normalized_parent_code}' does not exist",
        )
    if not parent.is_active or parent.location_kind != "REGION":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Parent location must be an active REGION",
        )

    current_parent_code = parent.parent_location_code
    visited = {normalized_parent_code}
    while current_parent_code is not None:
        if current_parent_code == record_code:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Location hierarchy cannot contain cycles",
            )
        if current_parent_code in visited:
            break
        visited.add(current_parent_code)
        current_parent_code = db.execute(
            select(ReferenceLocation.parent_location_code).where(
                ReferenceLocation.code == current_parent_code
            )
        ).scalars().first()

    return normalized_parent_code


def validate_location_coordinates(latitude: Optional[float], longitude: Optional[float]) -> None:
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Latitude and longitude must be provided together",
        )


def ensure_location_can_be_region_parent(
    db: Session,
    *,
    record_code: str,
    next_location_kind: str,
) -> None:
    if next_location_kind != "POINT":
        return

    active_child_location_count = db.execute(
        select(func.count()).select_from(ReferenceLocation).where(
            ReferenceLocation.parent_location_code == record_code,
            ReferenceLocation.is_active.is_(True),
        )
    ).scalar_one()
    if active_child_location_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Location with active child locations must remain a REGION",
        )


def to_out(record: ModelT, schema_cls):
    payload = dict(
        code=record.code,
        name=record.name,
        description=record.description,
        is_active=record.is_active,
        effective_from=record.effective_from,
        effective_to=record.effective_to,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )
    if isinstance(record, ReferenceCommodity):
        payload["commodity_class"] = record.commodity_class
    if isinstance(record, ReferenceCalendar):
        payload["calendar_type"] = record.calendar_type
        payload["market"] = record.market
        payload["timezone"] = record.timezone
    if isinstance(record, ReferenceAsset):
        payload["asset_class"] = record.asset_class
        payload["asset_type"] = record.asset_type
        payload["asset_reality"] = record.asset_reality
        payload["commodity_code"] = record.commodity_code
        payload["location_code"] = record.location_code
        payload["latitude"] = record.latitude
        payload["longitude"] = record.longitude
        payload["geometry_geojson"] = record.geometry_geojson
        payload["capacity_value"] = record.capacity_value
        payload["capacity_unit_code"] = record.capacity_unit_code
        payload["operator_name"] = record.operator_name
        payload["operating_status"] = record.operating_status
        payload["source_name"] = record.source_name
        payload["source_url"] = record.source_url
        payload["confidence"] = record.confidence
        payload["notes"] = record.notes
    if isinstance(record, ReferenceCounterparty):
        payload["short_name"] = record.short_name
        payload["legal_entity_name"] = record.legal_entity_name
        payload["counterparty_type"] = record.counterparty_type
        payload["country_code"] = record.country_code
        payload["lei_code"] = record.lei_code
        payload["duns_number"] = record.duns_number
        payload["ticker_symbol"] = record.ticker_symbol
        payload["credit_status"] = record.credit_status
    if isinstance(record, ReferenceCurrency):
        payload["symbol"] = record.symbol
    if isinstance(record, ReferenceUnit):
        payload["commodity_class"] = record.commodity_class
        payload["dimension"] = record.dimension
        payload["base_unit_code"] = record.base_unit_code
        payload["conversion_factor"] = (
            float(record.conversion_factor)
            if record.conversion_factor is not None
            else None
        )
        payload["precision"] = record.precision
    if isinstance(record, ReferenceLocation):
        payload["location_kind"] = record.location_kind
        payload["location_type"] = record.location_type
        payload["parent_location_code"] = record.parent_location_code
        payload["market"] = record.market
        payload["city"] = record.city
        payload["subdivision_code"] = record.subdivision_code
        payload["country_code"] = record.country_code
        payload["continent_code"] = record.continent_code
        payload["latitude"] = record.latitude
        payload["longitude"] = record.longitude
        payload["region"] = record.region
        payload["timezone"] = record.timezone
    if isinstance(record, ReferencePipelinePath):
        payload["pipeline_code"] = record.pipeline_code
        payload["receipt_location_code"] = record.receipt_location_code
        payload["delivery_location_code"] = record.delivery_location_code
        payload["receipt_point_code"] = record.receipt_point_code
        payload["delivery_point_code"] = record.delivery_point_code
        payload["path_direction"] = record.path_direction
        payload["cycle_timezone"] = record.cycle_timezone
    if isinstance(record, ReferencePipelinePoint):
        payload["pipeline_code"] = record.pipeline_code
        payload["location_code"] = record.location_code
        payload["point_role"] = record.point_role
        payload["operator_point_code"] = record.operator_point_code
        payload["operator_zone"] = record.operator_zone
        payload["connected_pipeline_code"] = record.connected_pipeline_code
        payload["is_tradable"] = record.is_tradable
        payload["is_pricing_point"] = record.is_pricing_point
        payload["is_scheduling_point"] = record.is_scheduling_point
        payload["sort_order"] = record.sort_order
    if isinstance(record, ReferenceRailLine):
        payload["railroad_code"] = record.railroad_code
        payload["operator_name"] = record.operator_name
        payload["default_timezone"] = record.default_timezone
    if isinstance(record, ReferenceRailRoute):
        payload["rail_line_code"] = record.rail_line_code
        payload["origin_location_code"] = record.origin_location_code
        payload["destination_location_code"] = record.destination_location_code
        payload["service_calendar_code"] = record.service_calendar_code
        payload["route_direction"] = record.route_direction
        payload["schedule_timezone"] = record.schedule_timezone
        payload["placement_cutoff_time_local"] = record.placement_cutoff_time_local
        payload["release_cutoff_time_local"] = record.release_cutoff_time_local
        payload["placement_free_time_hours"] = record.placement_free_time_hours
        payload["release_free_time_hours"] = record.release_free_time_hours
    if isinstance(record, ReferencePortfolio):
        payload["book_code"] = record.book_code
        payload["owner"] = record.owner
        payload["strategy"] = record.strategy
        payload["trader_persona"] = record.trader_persona
        payload["risk_archetype"] = record.risk_archetype
    if isinstance(record, ReferencePriceIndex):
        payload["commodity_code"] = record.commodity_code
        payload["currency_code"] = record.currency_code
        payload["unit_code"] = record.unit_code
        payload["provider"] = record.provider
        payload["market"] = record.market
        payload["location_code"] = record.location_code
        payload["calendar_code"] = record.calendar_code
    if isinstance(record, ReferenceSpatialFeature):
        payload["feature_kind"] = record.feature_kind
        payload["geometry_type"] = record.geometry_type
        payload["entity_type"] = record.entity_type
        payload["entity_code"] = record.entity_code
        payload["label_latitude"] = record.label_latitude
        payload["label_longitude"] = record.label_longitude
        payload["is_primary"] = record.is_primary
        payload["geometry_geojson"] = record.geometry_geojson
        payload["source_name"] = record.source_name
        payload["source_url"] = record.source_url
        payload["confidence"] = record.confidence
        payload["notes"] = record.notes

    return schema_cls(**payload)


def ensure_book_not_in_active_use(db: Session, code: str) -> None:
    active_trade_count = db.execute(
        select(func.count()).select_from(Trade).where(
            Trade.book == code,
            Trade.status == "ACTIVE",
        )
    ).scalar_one()
    if active_trade_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Book cannot be deactivated while active trades reference it",
        )


def ensure_commodity_not_in_active_use(db: Session, code: str) -> None:
    active_trade_count = db.execute(
        select(func.count()).select_from(Trade).where(
            Trade.commodity == code,
            Trade.status == "ACTIVE",
        )
    ).scalar_one()
    if active_trade_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Commodity cannot be deactivated while active trades reference it",
        )


def ensure_active_commodity_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_commodity = db.execute(
        select(ReferenceCommodity).where(
            ReferenceCommodity.code == normalized_code,
            ReferenceCommodity.is_active.is_(True),
        )
    ).scalars().first()
    if reference_commodity is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Commodity '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_active_book_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_book = db.execute(
        select(ReferenceBook).where(
            ReferenceBook.code == normalized_code,
            ReferenceBook.is_active.is_(True),
        )
    ).scalars().first()
    if reference_book is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Book '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_active_currency_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_currency = db.execute(
        select(ReferenceCurrency).where(
            ReferenceCurrency.code == normalized_code,
            ReferenceCurrency.is_active.is_(True),
        )
    ).scalars().first()
    if reference_currency is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Currency '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_active_unit_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_unit = db.execute(
        select(ReferenceUnit).where(
            ReferenceUnit.code == normalized_code,
            ReferenceUnit.is_active.is_(True),
        )
    ).scalars().first()
    if reference_unit is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unit '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_active_location_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_location = db.execute(
        select(ReferenceLocation).where(
            ReferenceLocation.code == normalized_code,
            ReferenceLocation.is_active.is_(True),
        )
    ).scalars().first()
    if reference_location is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Location '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_active_pipeline_asset_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_asset = db.execute(
        select(ReferenceAsset).where(
            ReferenceAsset.code == normalized_code,
            ReferenceAsset.is_active.is_(True),
            ReferenceAsset.asset_class == "PIPELINE",
        )
    ).scalars().first()
    if reference_asset is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Pipeline asset '{normalized_code}' is not an active PIPELINE asset",
        )
    return normalized_code


def ensure_active_rail_line_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_rail_line = db.execute(
        select(ReferenceRailLine).where(
            ReferenceRailLine.code == normalized_code,
            ReferenceRailLine.is_active.is_(True),
        )
    ).scalars().first()
    if reference_rail_line is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Rail line '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def get_active_pipeline_point(db: Session, code: str) -> ReferencePipelinePoint:
    normalized_code = normalize_code(code)
    reference_point = db.execute(
        select(ReferencePipelinePoint).where(
            ReferencePipelinePoint.code == normalized_code,
            ReferencePipelinePoint.is_active.is_(True),
        )
    ).scalars().first()
    if reference_point is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Pipeline point '{normalized_code}' is not active in reference data",
        )
    return reference_point


def ensure_active_pipeline_point_exists(db: Session, code: str) -> str:
    return get_active_pipeline_point(db, code).code


def ensure_active_pipeline_point_belongs_to_pipeline(
    db: Session,
    *,
    point_code: str,
    pipeline_code: str,
    field_name: str,
) -> str:
    normalized_pipeline_code = normalize_code(pipeline_code)
    reference_point = get_active_pipeline_point(db, point_code)
    if reference_point.pipeline_code != normalized_pipeline_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{field_name} '{reference_point.code}' must belong to pipeline "
                f"'{normalized_pipeline_code}'"
            ),
        )
    return reference_point.code


def ensure_active_calendar_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_calendar = db.execute(
        select(ReferenceCalendar).where(
            ReferenceCalendar.code == normalized_code,
            ReferenceCalendar.is_active.is_(True),
        )
    ).scalars().first()
    if reference_calendar is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Calendar '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_currency_not_in_active_use(db: Session, code: str) -> None:
    active_price_index_count = db.execute(
        select(func.count()).select_from(ReferencePriceIndex).where(
            ReferencePriceIndex.currency_code == code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalar_one()
    if active_price_index_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Currency cannot be deactivated while active price indices reference it",
        )


def ensure_unit_not_in_active_use(db: Session, code: str) -> None:
    active_price_index_count = db.execute(
        select(func.count()).select_from(ReferencePriceIndex).where(
            ReferencePriceIndex.unit_code == code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalar_one()
    if active_price_index_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unit cannot be deactivated while active price indices reference it",
        )


def ensure_location_not_in_active_use(db: Session, code: str) -> None:
    active_child_location_count = db.execute(
        select(func.count()).select_from(ReferenceLocation).where(
            ReferenceLocation.parent_location_code == code,
            ReferenceLocation.is_active.is_(True),
        )
    ).scalar_one()
    if active_child_location_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Location cannot be deactivated while active child locations reference it",
        )

    active_price_index_count = db.execute(
        select(func.count()).select_from(ReferencePriceIndex).where(
            ReferencePriceIndex.location_code == code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalar_one()
    if active_price_index_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Location cannot be deactivated while active price indices reference it",
        )


def ensure_price_index_not_in_active_use(db: Session, code: str) -> None:
    active_trade_count = db.execute(
        select(func.count()).select_from(Trade).where(
            Trade.price_index_code == code,
            Trade.status == "ACTIVE",
        )
    ).scalar_one()
    if active_trade_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Price index cannot be deactivated while active trades reference it",
        )


def ensure_calendar_not_in_active_use(db: Session, code: str) -> None:
    active_price_index_count = db.execute(
        select(func.count()).select_from(ReferencePriceIndex).where(
            ReferencePriceIndex.calendar_code == code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalar_one()
    if active_price_index_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Calendar cannot be deactivated while active price indices reference it",
        )
