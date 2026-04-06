from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from apps.api.app.domains.reference_data.services.counterparty_standards import (
    DEFAULT_COUNTERPARTY_CREDIT_BREACH_ACTION,
    DEFAULT_COUNTERPARTY_CREDIT_STATUS,
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


class CommodityCreate(ReferenceDataCreate):
    commodity_class: str = Field(..., min_length=1, max_length=50)


class CommodityUpdate(ReferenceDataUpdate):
    commodity_class: Optional[str] = Field(None, min_length=1, max_length=50)


class CommodityStatusUpdate(ReferenceDataStatusUpdate):
    pass


class CommodityOut(ReferenceDataOut):
    commodity_class: str


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


class PriceIndexCreate(ReferenceDataCreate):
    commodity_code: str = Field(..., min_length=1, max_length=50)
    currency_code: str = Field(..., min_length=1, max_length=20)
    unit_code: str = Field(..., min_length=1, max_length=20)
    provider: str = Field(..., min_length=1, max_length=120)
    market: Optional[str] = Field(None, min_length=1, max_length=120)
    location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    calendar_code: Optional[str] = Field(None, min_length=1, max_length=50)


class PriceIndexUpdate(ReferenceDataUpdate):
    commodity_code: Optional[str] = Field(None, min_length=1, max_length=50)
    currency_code: Optional[str] = Field(None, min_length=1, max_length=20)
    unit_code: Optional[str] = Field(None, min_length=1, max_length=20)
    provider: Optional[str] = Field(None, min_length=1, max_length=120)
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
    market: Optional[str]
    location_code: Optional[str]
    calendar_code: Optional[str]
