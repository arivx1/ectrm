from __future__ import annotations

from typing import Any
from datetime import date, datetime
from typing import Literal
from typing import Optional

from pydantic import BaseModel, Field

from apps.api.app.domains.reference_data.services.counterparty_standards import (
    DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
    DEFAULT_COUNTERPARTY_CREDIT_STATUS,
)
from apps.api.app.domains.reference_data.services.pipeline_reference_standards import (
    DEFAULT_PIPELINE_COMMODITY_FAMILY,
    DEFAULT_PIPELINE_JURISDICTION_TYPE,
    DEFAULT_PIPELINE_POINT_ROLE,
    DEFAULT_PIPELINE_TOPOLOGY_MODEL,
)


class ReferenceDataBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class ReferenceDataCreate(ReferenceDataBase):
    created_by: str = Field(..., min_length=1, max_length=128)


class ReferenceDataUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    updated_by: str = Field(..., min_length=1, max_length=128)


class ReferenceDataStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)


class ReferenceDataOut(ReferenceDataBase):
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class BookCreate(ReferenceDataCreate):
    pass


class BookUpdate(ReferenceDataUpdate):
    pass


class BookStatusUpdate(ReferenceDataStatusUpdate):
    pass


class BookOut(ReferenceDataOut):
    pass


class AssetCreate(ReferenceDataCreate):
    code: str = Field(..., min_length=1, max_length=100)
    asset_class: str = Field(..., min_length=1, max_length=40)
    asset_type: str = Field(..., min_length=1, max_length=60)
    asset_reality: str = Field(..., min_length=1, max_length=20)
    commodity_code: Optional[str] = Field(None, min_length=1, max_length=50)
    location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    geometry_geojson: Optional[dict[str, Any]] = None
    capacity_value: Optional[float] = Field(None, ge=0)
    capacity_unit_code: Optional[str] = Field(None, min_length=1, max_length=20)
    operator_name: Optional[str] = Field(None, min_length=1, max_length=120)
    operating_status: str = Field(..., min_length=1, max_length=32)
    source_name: Optional[str] = Field(None, min_length=1, max_length=255)
    source_url: Optional[str] = Field(None, min_length=1)
    confidence: Optional[float] = Field(None, ge=0, le=1)
    notes: Optional[str] = None


class AssetUpdate(ReferenceDataUpdate):
    asset_class: Optional[str] = Field(None, min_length=1, max_length=40)
    asset_type: Optional[str] = Field(None, min_length=1, max_length=60)
    asset_reality: Optional[str] = Field(None, min_length=1, max_length=20)
    commodity_code: Optional[str] = Field(None, min_length=1, max_length=50)
    location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    geometry_geojson: Optional[dict[str, Any]] = None
    capacity_value: Optional[float] = Field(None, ge=0)
    capacity_unit_code: Optional[str] = Field(None, min_length=1, max_length=20)
    operator_name: Optional[str] = Field(None, min_length=1, max_length=120)
    operating_status: Optional[str] = Field(None, min_length=1, max_length=32)
    source_name: Optional[str] = Field(None, min_length=1, max_length=255)
    source_url: Optional[str] = Field(None, min_length=1)
    confidence: Optional[float] = Field(None, ge=0, le=1)
    notes: Optional[str] = None


class AssetStatusUpdate(ReferenceDataStatusUpdate):
    pass


class AssetOut(ReferenceDataOut):
    code: str = Field(..., min_length=1, max_length=100)
    asset_class: str
    asset_type: str
    asset_reality: str
    commodity_code: Optional[str]
    location_code: Optional[str]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geometry_geojson: Optional[dict[str, Any]] = None
    capacity_value: Optional[float]
    capacity_unit_code: Optional[str]
    operator_name: Optional[str]
    operating_status: str
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    confidence: Optional[float] = None
    notes: Optional[str] = None


class AssetStandardsOut(BaseModel):
    default_asset_class: str
    default_asset_type_by_class: dict[str, str]
    asset_classes: list[str]
    asset_types_by_class: dict[str, list[str]]
    default_asset_reality: str
    asset_realities: list[str]
    default_operating_status: str
    operating_statuses: list[str]


class AssetMapScopeSummaryOut(BaseModel):
    total_count: int
    total_map_ready_count: int
    filtered_total_count: int
    filtered_map_ready_count: int


class PipelineDetailCreate(BaseModel):
    pipeline_code: str = Field(..., min_length=1, max_length=100)
    commodity_family: str = Field(
        default=DEFAULT_PIPELINE_COMMODITY_FAMILY,
        min_length=1,
        max_length=32,
    )
    jurisdiction_type: str = Field(
        default=DEFAULT_PIPELINE_JURISDICTION_TYPE,
        min_length=1,
        max_length=32,
    )
    topology_model: str = Field(
        default=DEFAULT_PIPELINE_TOPOLOGY_MODEL,
        min_length=1,
        max_length=32,
    )
    market_hub_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    in_service_year: Optional[int] = Field(None, ge=1800, le=2200)
    cross_border: bool = False
    is_bidirectional: bool = False
    tariff_url: Optional[str] = Field(None, min_length=1)
    ebb_url: Optional[str] = Field(None, min_length=1)
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    created_by: str = Field(..., min_length=1, max_length=128)


class PipelineDetailUpdate(BaseModel):
    commodity_family: Optional[str] = Field(None, min_length=1, max_length=32)
    jurisdiction_type: Optional[str] = Field(None, min_length=1, max_length=32)
    topology_model: Optional[str] = Field(None, min_length=1, max_length=32)
    market_hub_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    in_service_year: Optional[int] = Field(None, ge=1800, le=2200)
    cross_border: Optional[bool] = None
    is_bidirectional: Optional[bool] = None
    tariff_url: Optional[str] = Field(None, min_length=1)
    ebb_url: Optional[str] = Field(None, min_length=1)
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    updated_by: str = Field(..., min_length=1, max_length=128)


class PipelineDetailStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)


class PipelineDetailOut(BaseModel):
    pipeline_code: str
    commodity_family: str
    jurisdiction_type: str
    topology_model: str
    market_hub_location_code: Optional[str]
    in_service_year: Optional[int]
    cross_border: bool
    is_bidirectional: bool
    tariff_url: Optional[str]
    ebb_url: Optional[str]
    is_active: bool
    effective_from: Optional[datetime]
    effective_to: Optional[datetime]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class PipelineDetailStandardsOut(BaseModel):
    default_commodity_family: str
    commodity_families: list[str]
    default_jurisdiction_type: str
    jurisdiction_types: list[str]
    default_topology_model: str
    topology_models: list[str]


class PipelinePointCreate(ReferenceDataCreate):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=160)
    pipeline_code: str = Field(..., min_length=1, max_length=100)
    location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    point_role: str = Field(
        default=DEFAULT_PIPELINE_POINT_ROLE,
        min_length=1,
        max_length=32,
    )
    operator_point_code: Optional[str] = Field(None, min_length=1, max_length=120)
    operator_zone: Optional[str] = Field(None, min_length=1, max_length=60)
    connected_pipeline_code: Optional[str] = Field(None, min_length=1, max_length=100)
    is_tradable: bool = False
    is_pricing_point: bool = False
    is_scheduling_point: bool = True
    sort_order: Optional[int] = Field(None, ge=0)


class PipelinePointUpdate(ReferenceDataUpdate):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    pipeline_code: Optional[str] = Field(None, min_length=1, max_length=100)
    location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    point_role: Optional[str] = Field(None, min_length=1, max_length=32)
    operator_point_code: Optional[str] = Field(None, min_length=1, max_length=120)
    operator_zone: Optional[str] = Field(None, min_length=1, max_length=60)
    connected_pipeline_code: Optional[str] = Field(None, min_length=1, max_length=100)
    is_tradable: Optional[bool] = None
    is_pricing_point: Optional[bool] = None
    is_scheduling_point: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)


class PipelinePointStatusUpdate(ReferenceDataStatusUpdate):
    pass


class PipelinePointOut(ReferenceDataOut):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=160)
    pipeline_code: str
    location_code: Optional[str]
    point_role: str
    operator_point_code: Optional[str]
    operator_zone: Optional[str]
    connected_pipeline_code: Optional[str]
    is_tradable: bool
    is_pricing_point: bool
    is_scheduling_point: bool
    sort_order: Optional[int]


class PipelinePointStandardsOut(BaseModel):
    default_point_role: str
    point_roles: list[str]


class PipelinePathCreate(ReferenceDataCreate):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=160)
    pipeline_code: str = Field(..., min_length=1, max_length=100)
    receipt_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    delivery_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    receipt_point_code: Optional[str] = Field(None, min_length=1, max_length=100)
    delivery_point_code: Optional[str] = Field(None, min_length=1, max_length=100)
    path_direction: str = Field(..., min_length=1, max_length=20)
    cycle_timezone: Optional[str] = Field(None, min_length=1, max_length=60)


class PipelinePathUpdate(ReferenceDataUpdate):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    pipeline_code: Optional[str] = Field(None, min_length=1, max_length=100)
    receipt_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    delivery_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    receipt_point_code: Optional[str] = Field(None, min_length=1, max_length=100)
    delivery_point_code: Optional[str] = Field(None, min_length=1, max_length=100)
    path_direction: Optional[str] = Field(None, min_length=1, max_length=20)
    cycle_timezone: Optional[str] = Field(None, min_length=1, max_length=60)


class PipelinePathStatusUpdate(ReferenceDataStatusUpdate):
    pass


class PipelinePathOut(ReferenceDataOut):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=160)
    pipeline_code: str
    receipt_location_code: Optional[str]
    delivery_location_code: Optional[str]
    receipt_point_code: Optional[str]
    delivery_point_code: Optional[str]
    path_direction: str
    cycle_timezone: Optional[str]


class PipelinePathStandardsOut(BaseModel):
    default_path_direction: str
    path_directions: list[str]


class RailLineCreate(ReferenceDataCreate):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=160)
    railroad_code: str = Field(..., min_length=1, max_length=30)
    operator_name: Optional[str] = Field(None, min_length=1, max_length=120)
    default_timezone: Optional[str] = Field(None, min_length=1, max_length=60)


class RailLineUpdate(ReferenceDataUpdate):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    railroad_code: Optional[str] = Field(None, min_length=1, max_length=30)
    operator_name: Optional[str] = Field(None, min_length=1, max_length=120)
    default_timezone: Optional[str] = Field(None, min_length=1, max_length=60)


class RailLineStatusUpdate(ReferenceDataStatusUpdate):
    pass


class RailLineOut(ReferenceDataOut):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=160)
    railroad_code: str
    operator_name: Optional[str]
    default_timezone: Optional[str]


class RailRouteCreate(ReferenceDataCreate):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=160)
    rail_line_code: str = Field(..., min_length=1, max_length=100)
    origin_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    destination_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    service_calendar_code: Optional[str] = Field(None, min_length=1, max_length=100)
    route_direction: str = Field(..., min_length=1, max_length=20)
    schedule_timezone: Optional[str] = Field(None, min_length=1, max_length=60)
    placement_cutoff_time_local: Optional[str] = Field(None, min_length=1, max_length=8)
    release_cutoff_time_local: Optional[str] = Field(None, min_length=1, max_length=8)
    placement_free_time_hours: Optional[int] = Field(None, ge=0)
    release_free_time_hours: Optional[int] = Field(None, ge=0)


class RailRouteUpdate(ReferenceDataUpdate):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    rail_line_code: Optional[str] = Field(None, min_length=1, max_length=100)
    origin_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    destination_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    service_calendar_code: Optional[str] = Field(None, min_length=1, max_length=100)
    route_direction: Optional[str] = Field(None, min_length=1, max_length=20)
    schedule_timezone: Optional[str] = Field(None, min_length=1, max_length=60)
    placement_cutoff_time_local: Optional[str] = Field(None, min_length=1, max_length=8)
    release_cutoff_time_local: Optional[str] = Field(None, min_length=1, max_length=8)
    placement_free_time_hours: Optional[int] = Field(None, ge=0)
    release_free_time_hours: Optional[int] = Field(None, ge=0)


class RailRouteStatusUpdate(ReferenceDataStatusUpdate):
    pass


class RailRouteOut(ReferenceDataOut):
    code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=160)
    rail_line_code: str
    origin_location_code: Optional[str]
    destination_location_code: Optional[str]
    service_calendar_code: Optional[str]
    route_direction: str
    schedule_timezone: Optional[str]
    placement_cutoff_time_local: Optional[str]
    release_cutoff_time_local: Optional[str]
    placement_free_time_hours: Optional[int]
    release_free_time_hours: Optional[int]


class RailRouteStandardsOut(BaseModel):
    default_route_direction: str
    route_directions: list[str]


class SpatialFeatureCreate(ReferenceDataCreate):
    code: str = Field(..., min_length=1, max_length=100)
    feature_kind: str = Field(..., min_length=1, max_length=32)
    geometry_geojson: dict[str, Any]
    entity_type: Optional[str] = Field(None, min_length=1, max_length=32)
    entity_code: Optional[str] = Field(None, min_length=1, max_length=100)
    label_latitude: Optional[float] = Field(None, ge=-90, le=90)
    label_longitude: Optional[float] = Field(None, ge=-180, le=180)
    is_primary: bool = False
    source_name: Optional[str] = Field(None, min_length=1, max_length=255)
    source_url: Optional[str] = Field(None, min_length=1)
    confidence: Optional[float] = Field(None, ge=0, le=1)
    notes: Optional[str] = None


class SpatialFeatureUpdate(ReferenceDataUpdate):
    feature_kind: Optional[str] = Field(None, min_length=1, max_length=32)
    geometry_geojson: Optional[dict[str, Any]] = None
    entity_type: Optional[str] = Field(None, min_length=1, max_length=32)
    entity_code: Optional[str] = Field(None, min_length=1, max_length=100)
    label_latitude: Optional[float] = Field(None, ge=-90, le=90)
    label_longitude: Optional[float] = Field(None, ge=-180, le=180)
    is_primary: Optional[bool] = None
    source_name: Optional[str] = Field(None, min_length=1, max_length=255)
    source_url: Optional[str] = Field(None, min_length=1)
    confidence: Optional[float] = Field(None, ge=0, le=1)
    notes: Optional[str] = None


class SpatialFeatureStatusUpdate(ReferenceDataStatusUpdate):
    pass


class SpatialFeatureOut(ReferenceDataOut):
    code: str = Field(..., min_length=1, max_length=100)
    feature_kind: str
    geometry_type: str
    geometry_geojson: dict[str, Any]
    entity_type: Optional[str] = None
    entity_code: Optional[str] = None
    label_latitude: Optional[float] = None
    label_longitude: Optional[float] = None
    is_primary: bool
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    confidence: Optional[float] = None
    notes: Optional[str] = None


class SpatialFeatureStandardsOut(BaseModel):
    default_feature_kind: str
    feature_kinds: list[str]
    geometry_types: list[str]
    entity_types: list[str]


class CommodityCreate(ReferenceDataCreate):
    commodity_class: str = Field(..., min_length=1, max_length=50)
    allowed_transport_modes: list[str] = Field(default_factory=list)


class CommodityUpdate(ReferenceDataUpdate):
    commodity_class: Optional[str] = Field(None, min_length=1, max_length=50)
    allowed_transport_modes: Optional[list[str]] = None


class CommodityStatusUpdate(ReferenceDataStatusUpdate):
    pass


class CommodityOut(ReferenceDataOut):
    commodity_class: str
    allowed_transport_modes: list[str]


class CurrencyCreate(ReferenceDataCreate):
    symbol: Optional[str] = Field(None, min_length=1, max_length=10)


class CurrencyUpdate(ReferenceDataUpdate):
    symbol: Optional[str] = Field(None, min_length=1, max_length=10)


class CurrencyStatusUpdate(ReferenceDataStatusUpdate):
    pass


class CurrencyOut(ReferenceDataOut):
    symbol: Optional[str]


class UnitCreate(ReferenceDataCreate):
    commodity_class: Optional[str] = Field(None, min_length=1, max_length=50)
    dimension: str = Field(..., min_length=1, max_length=30)
    base_unit_code: Optional[str] = Field(None, min_length=1, max_length=20)
    conversion_factor: Optional[float] = None
    precision: int = Field(default=3, ge=0, le=12)


class UnitUpdate(ReferenceDataUpdate):
    commodity_class: Optional[str] = Field(None, min_length=1, max_length=50)
    dimension: Optional[str] = Field(None, min_length=1, max_length=30)
    base_unit_code: Optional[str] = Field(None, min_length=1, max_length=20)
    conversion_factor: Optional[float] = None
    precision: Optional[int] = Field(None, ge=0, le=12)


class UnitStatusUpdate(ReferenceDataStatusUpdate):
    pass


class UnitOut(ReferenceDataOut):
    commodity_class: Optional[str]
    dimension: str
    base_unit_code: Optional[str]
    conversion_factor: Optional[float]
    precision: int


class LocationCreate(ReferenceDataCreate):
    location_kind: str = Field(..., min_length=1, max_length=20)
    location_type: str = Field(..., min_length=1, max_length=50)
    parent_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    market: Optional[str] = Field(None, min_length=1, max_length=80)
    city: Optional[str] = Field(None, min_length=1, max_length=120)
    subdivision_code: Optional[str] = Field(None, min_length=1, max_length=20)
    country_code: Optional[str] = Field(None, min_length=1, max_length=10)
    continent_code: Optional[str] = Field(None, min_length=1, max_length=10)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    region: Optional[str] = Field(None, min_length=1, max_length=80)
    timezone: Optional[str] = Field(None, min_length=1, max_length=60)


class LocationUpdate(ReferenceDataUpdate):
    location_kind: Optional[str] = Field(None, min_length=1, max_length=20)
    location_type: Optional[str] = Field(None, min_length=1, max_length=50)
    parent_location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    market: Optional[str] = Field(None, min_length=1, max_length=80)
    city: Optional[str] = Field(None, min_length=1, max_length=120)
    subdivision_code: Optional[str] = Field(None, min_length=1, max_length=20)
    country_code: Optional[str] = Field(None, min_length=1, max_length=10)
    continent_code: Optional[str] = Field(None, min_length=1, max_length=10)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    region: Optional[str] = Field(None, min_length=1, max_length=80)
    timezone: Optional[str] = Field(None, min_length=1, max_length=60)


class LocationStatusUpdate(ReferenceDataStatusUpdate):
    pass


class LocationOut(ReferenceDataOut):
    location_kind: str
    location_type: str
    parent_location_code: Optional[str]
    market: Optional[str]
    city: Optional[str]
    subdivision_code: Optional[str]
    country_code: Optional[str]
    continent_code: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    region: Optional[str]
    timezone: Optional[str]


class LocationStandardsOut(BaseModel):
    default_location_kind: str
    default_location_type_by_kind: dict[str, str]
    location_kinds: list[str]
    location_types_by_kind: dict[str, list[str]]
    market_codes: list[str]
    continent_codes: list[str]


class CounterpartyCreate(ReferenceDataCreate):
    short_name: Optional[str] = Field(None, min_length=1, max_length=80)
    legal_entity_name: Optional[str] = Field(None, min_length=1, max_length=200)
    counterparty_type: str = Field(..., min_length=1, max_length=50)
    country_code: Optional[str] = Field(None, min_length=1, max_length=10)
    lei_code: Optional[str] = Field(None, min_length=1, max_length=20)
    duns_number: Optional[str] = Field(None, min_length=1, max_length=20)
    ticker_symbol: Optional[str] = Field(None, min_length=1, max_length=32)
    credit_status: str = Field(default=DEFAULT_COUNTERPARTY_CREDIT_STATUS, min_length=1, max_length=50)


class CounterpartyUpdate(ReferenceDataUpdate):
    short_name: Optional[str] = Field(None, min_length=1, max_length=80)
    legal_entity_name: Optional[str] = Field(None, min_length=1, max_length=200)
    counterparty_type: Optional[str] = Field(None, min_length=1, max_length=50)
    country_code: Optional[str] = Field(None, min_length=1, max_length=10)
    lei_code: Optional[str] = Field(None, min_length=1, max_length=20)
    duns_number: Optional[str] = Field(None, min_length=1, max_length=20)
    ticker_symbol: Optional[str] = Field(None, min_length=1, max_length=32)
    credit_status: Optional[str] = Field(None, min_length=1, max_length=50)


class CounterpartyStatusUpdate(ReferenceDataStatusUpdate):
    pass


class CounterpartyOut(ReferenceDataOut):
    short_name: Optional[str]
    legal_entity_name: Optional[str]
    counterparty_type: str
    country_code: Optional[str]
    lei_code: Optional[str]
    duns_number: Optional[str]
    ticker_symbol: Optional[str]
    credit_status: str


class CounterpartyStandardsOut(BaseModel):
    default_counterparty_type: str
    counterparty_types: list[str]
    default_counterparty_credit_status: str
    counterparty_credit_statuses: list[str]
    default_counterparty_credit_breach_action: str
    counterparty_credit_breach_actions: list[str]


class CounterpartyCreditProfileUpsert(BaseModel):
    credit_rating: Optional[str] = Field(None, min_length=1, max_length=80)
    review_due_at: Optional[date] = None
    limit_currency_code: Optional[str] = Field(None, min_length=1, max_length=20)
    limit_amount: Optional[float] = Field(None, gt=0)
    breach_action: Optional[str] = Field(
        default=DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
        min_length=1,
        max_length=50,
    )
    notes: Optional[str] = None
    updated_by: str = Field(..., min_length=1, max_length=128)


class CounterpartyCreditProfileOut(BaseModel):
    counterparty_code: str
    credit_rating: Optional[str]
    review_due_at: Optional[date]
    limit_currency_code: Optional[str]
    limit_amount: Optional[float]
    breach_action: str
    notes: Optional[str]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class CounterpartyExternalCreditSnapshotOut(BaseModel):
    id: int
    counterparty_code: str
    provider: str
    source_entity_id: Optional[str]
    source_entity_name: Optional[str]
    match_basis: Optional[str]
    matched_identifier_value: Optional[str]
    as_of_date: date
    rating_scale: Optional[str]
    rating_value: Optional[str]
    rating_outlook: Optional[str]
    credit_score: Optional[float]
    probability_of_default: Optional[float]
    recommended_limit_currency_code: Optional[str]
    recommended_limit_amount: Optional[float]
    commentary: Optional[str]
    downloaded_at: datetime
    run_id: int
    created_at: datetime
    updated_at: datetime
    version: int


class CounterpartyExternalCreditPromotionRequest(BaseModel):
    promote_rating: bool = True
    promote_limit: bool = True
    append_commentary_to_notes: bool = True
    review_due_at: Optional[date] = None
    updated_by: str = Field(..., min_length=1, max_length=128)


class PortfolioCreate(ReferenceDataCreate):
    book_code: str = Field(..., min_length=1, max_length=50)
    owner: Optional[str] = Field(None, min_length=1, max_length=120)
    strategy: Optional[str] = Field(None, min_length=1, max_length=120)
    trader_persona: Optional[str] = Field(None, min_length=1, max_length=120)
    risk_archetype: Optional[str] = Field(None, min_length=1, max_length=60)


class PortfolioUpdate(ReferenceDataUpdate):
    book_code: Optional[str] = Field(None, min_length=1, max_length=50)
    owner: Optional[str] = Field(None, min_length=1, max_length=120)
    strategy: Optional[str] = Field(None, min_length=1, max_length=120)
    trader_persona: Optional[str] = Field(None, min_length=1, max_length=120)
    risk_archetype: Optional[str] = Field(None, min_length=1, max_length=60)


class PortfolioStatusUpdate(ReferenceDataStatusUpdate):
    pass


class PortfolioOut(ReferenceDataOut):
    book_code: str
    owner: Optional[str]
    strategy: Optional[str]
    trader_persona: Optional[str]
    risk_archetype: Optional[str]


class CalendarCreate(ReferenceDataCreate):
    name: str = Field(..., min_length=1, max_length=160)
    calendar_type: str = Field(..., min_length=1, max_length=50)
    market: Optional[str] = Field(None, min_length=1, max_length=80)
    timezone: Optional[str] = Field(None, min_length=1, max_length=60)


class CalendarUpdate(ReferenceDataUpdate):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    calendar_type: Optional[str] = Field(None, min_length=1, max_length=50)
    market: Optional[str] = Field(None, min_length=1, max_length=80)
    timezone: Optional[str] = Field(None, min_length=1, max_length=60)


class CalendarStatusUpdate(ReferenceDataStatusUpdate):
    pass


class CalendarOut(ReferenceDataOut):
    name: str = Field(..., min_length=1, max_length=160)
    calendar_type: str
    market: Optional[str]
    timezone: Optional[str]


class CalendarHolidayBase(BaseModel):
    holiday_date: date
    name: str = Field(..., min_length=1, max_length=160)
    closure_type: str = Field(default="FULL_CLOSED", min_length=1, max_length=32)
    is_provisional: bool = False
    description: Optional[str] = None


class CalendarHolidayCreate(CalendarHolidayBase):
    created_by: str = Field(..., min_length=1, max_length=128)


class CalendarHolidayUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    closure_type: Optional[str] = Field(None, min_length=1, max_length=32)
    is_provisional: Optional[bool] = None
    description: Optional[str] = None
    updated_by: str = Field(..., min_length=1, max_length=128)


class CalendarHolidayStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)


class CalendarHolidayOut(CalendarHolidayBase):
    calendar_code: str
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class CalendarHolidayImportRequest(BaseModel):
    csv_text: str = Field(..., min_length=1)
    requested_by: str = Field(..., min_length=1, max_length=128)
    replace_existing: bool = True
    deactivate_missing: bool = False


class CalendarHolidayImportSummaryOut(BaseModel):
    calendar_code: str
    requested_by: str
    total_rows: int
    created_count: int
    updated_count: int
    deactivated_count: int
    skipped_count: int


class CalendarRuleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    rule_type: str = Field(..., min_length=1, max_length=32)
    closure_type: str = Field(default="FULL_CLOSED", min_length=1, max_length=32)
    month: Optional[int] = Field(None, ge=1, le=12)
    day: Optional[int] = Field(None, ge=1, le=31)
    weekday: Optional[int] = Field(None, ge=0, le=6)
    occurrence: Optional[int] = Field(None, ge=1, le=5)
    offset_days: Optional[int] = None
    observance_shift: Optional[str] = Field(None, min_length=1, max_length=32)
    is_provisional: bool = False
    description: Optional[str] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class CalendarRuleCreate(CalendarRuleBase):
    created_by: str = Field(..., min_length=1, max_length=128)


class CalendarRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    rule_type: Optional[str] = Field(None, min_length=1, max_length=32)
    closure_type: Optional[str] = Field(None, min_length=1, max_length=32)
    month: Optional[int] = Field(None, ge=1, le=12)
    day: Optional[int] = Field(None, ge=1, le=31)
    weekday: Optional[int] = Field(None, ge=0, le=6)
    occurrence: Optional[int] = Field(None, ge=1, le=5)
    offset_days: Optional[int] = None
    observance_shift: Optional[str] = Field(None, min_length=1, max_length=32)
    is_provisional: Optional[bool] = None
    description: Optional[str] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    updated_by: str = Field(..., min_length=1, max_length=128)


class CalendarRuleStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)


class CalendarRuleOut(CalendarRuleBase):
    id: int
    calendar_code: str
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class CalendarOverlayBase(BaseModel):
    overlay_calendar_code: str = Field(..., min_length=1, max_length=50)
    priority: int = Field(default=100, ge=0, le=100000)
    description: Optional[str] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class CalendarOverlayCreate(CalendarOverlayBase):
    created_by: str = Field(..., min_length=1, max_length=128)


class CalendarOverlayUpdate(BaseModel):
    priority: Optional[int] = Field(None, ge=0, le=100000)
    description: Optional[str] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    updated_by: str = Field(..., min_length=1, max_length=128)


class CalendarOverlayStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)


class CalendarOverlayOut(CalendarOverlayBase):
    id: int
    calendar_code: str
    overlay_calendar_code: str
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class CalendarBusinessDayMatchOut(BaseModel):
    calendar_code: str
    source_kind: str
    source_key: str
    name: str
    closure_type: str
    is_provisional: bool


class CalendarBusinessDayStatusOut(BaseModel):
    calendar_code: str
    evaluated_date: date
    is_business_day: bool
    closure_type: str
    source_calendar_codes: list[str]
    matches: list[CalendarBusinessDayMatchOut] = Field(default_factory=list)


class CalendarBusinessDayDateOut(BaseModel):
    calendar_code: str
    start_date: date
    result_date: date
    include_start: bool
    business_days: Optional[int] = None


class CalendarBusinessDayCountOut(BaseModel):
    calendar_code: str
    start_date: date
    end_date: date
    include_start: bool
    include_end: bool
    business_day_count: int


PriceIndexQuoteType = Literal["SPOT", "FUTURE", "FORWARD", "INDEX", "OTHER"]


class PriceIndexCreate(ReferenceDataCreate):
    commodity_code: str = Field(..., min_length=1, max_length=50)
    currency_code: str = Field(..., min_length=1, max_length=20)
    unit_code: str = Field(..., min_length=1, max_length=20)
    provider: str = Field(..., min_length=1, max_length=120)
    quote_type: PriceIndexQuoteType = "SPOT"
    market: Optional[str] = Field(None, min_length=1, max_length=120)
    location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    calendar_code: Optional[str] = Field(None, min_length=1, max_length=50)


class PriceIndexUpdate(ReferenceDataUpdate):
    commodity_code: Optional[str] = Field(None, min_length=1, max_length=50)
    currency_code: Optional[str] = Field(None, min_length=1, max_length=20)
    unit_code: Optional[str] = Field(None, min_length=1, max_length=20)
    provider: Optional[str] = Field(None, min_length=1, max_length=120)
    quote_type: Optional[PriceIndexQuoteType] = None
    market: Optional[str] = Field(None, min_length=1, max_length=120)
    location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    calendar_code: Optional[str] = Field(None, min_length=1, max_length=50)


class PriceIndexStatusUpdate(ReferenceDataStatusUpdate):
    pass


class PriceIndexOut(ReferenceDataOut):
    commodity_code: str
    currency_code: str
    unit_code: str
    provider: str
    quote_type: PriceIndexQuoteType
    market: Optional[str]
    location_code: Optional[str]
    calendar_code: Optional[str]
