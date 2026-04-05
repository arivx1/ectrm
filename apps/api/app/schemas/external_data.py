from __future__ import annotations

from datetime import date, datetime
from typing import Any
from typing import Optional

from pydantic import BaseModel
from pydantic import Field


class ExternalDataRunOut(BaseModel):
    id: int
    provider: str
    job_name: str
    status: str
    started_at: datetime
    finished_at: Optional[datetime]
    requested_by: Optional[str]
    series_count: int
    observation_count: int
    error_summary: Optional[str]
    created_at: datetime


class EIASyncRequest(BaseModel):
    series_id: Optional[str] = Field(default=None, min_length=1, max_length=200)
    price_index_code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    lookback_days: Optional[int] = Field(default=None, ge=1, le=3650)
    requested_by: Optional[str] = Field(default=None, min_length=1, max_length=128)


class ExternalSeriesSyncRequest(BaseModel):
    series_code: Optional[str] = Field(default=None, min_length=1, max_length=80)
    lookback_days: Optional[int] = Field(default=None, ge=1, le=3650)
    requested_by: Optional[str] = Field(default=None, min_length=1, max_length=128)


class ExternalSeriesDefinitionOut(BaseModel):
    code: str
    provider: str
    dataset_code: Optional[str]
    series_id: str
    name: str
    category: str
    frequency: str
    unit_code: str
    source_url: Optional[str]
    description: Optional[str]
    query_params: Optional[dict[str, Any]]
    transform_rule: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    version: int


class ExternalSeriesObservationOut(BaseModel):
    id: int
    series_code: str
    observation_date: date
    value: float
    unit_code: str
    source_provider: str
    source_series_id: str
    source_frequency: str
    source_published_at: Optional[datetime]
    source_revision: Optional[str]
    downloaded_at: datetime
    run_id: int
    created_at: datetime
    updated_at: datetime


class MarketContextPriceOut(BaseModel):
    price_index_code: str
    name: str
    commodity_code: str
    market: Optional[str]
    location_code: Optional[str]
    observation_date: date
    value: float
    unit_code: str
    currency_code: Optional[str]
    source_provider: str
    source_series_id: str
    downloaded_at: datetime


class MarketContextSeriesOut(BaseModel):
    series_code: str
    name: str
    category: str
    observation_date: date
    value: float
    unit_code: str
    source_provider: str
    source_series_id: str
    downloaded_at: datetime


class MarketContextOut(BaseModel):
    generated_at: datetime
    commodity: Optional[str]
    price_indices: list[MarketContextPriceOut]
    macro: list[MarketContextSeriesOut]
    positioning: list[MarketContextSeriesOut]


class PriceIndexObservationOut(BaseModel):
    id: int
    price_index_code: str
    observation_date: date
    value: float
    unit_code: str
    currency_code: Optional[str]
    source_provider: str
    source_series_id: str
    source_frequency: str
    source_published_at: Optional[datetime]
    source_revision: Optional[str]
    downloaded_at: datetime
    run_id: int
    created_at: datetime
    updated_at: datetime
