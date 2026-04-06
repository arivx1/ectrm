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


class ExternalSeriesDefinitionUpsertRequest(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    provider: str = Field(min_length=1, max_length=50)
    dataset_code: Optional[str] = Field(default=None, min_length=1, max_length=120)
    series_id: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=50)
    frequency: str = Field(min_length=1, max_length=20)
    unit_code: str = Field(min_length=1, max_length=20)
    source_url: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, min_length=1)
    query_params: Optional[dict[str, Any]] = None
    transform_rule: Optional[str] = Field(default=None, min_length=1)
    is_active: bool = True
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


class ExternalDataProviderStatusOut(BaseModel):
    provider: str
    label: str
    category: str
    health_status: str
    latest_run_status: str
    success_sla_hours: int
    scheduler_interval_minutes: int
    active_series_count: int
    due_for_sync: bool
    last_run_at: Optional[datetime]
    last_success_at: Optional[datetime]
    latest_observation_at: Optional[datetime]
    observation_age_hours: Optional[float]
    error_summary: Optional[str]
    latest_run: Optional[ExternalDataRunOut]
    latest_success: Optional[ExternalDataRunOut]


class ExternalDataSyncStatusOut(BaseModel):
    generated_at: datetime
    health_status: str
    provider_count: int
    healthy_provider_count: int
    stale_provider_count: int
    failed_provider_count: int
    running_provider_count: int
    unknown_provider_count: int
    providers: list[ExternalDataProviderStatusOut]


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


class MarketContextFreshnessOut(BaseModel):
    provider: str
    label: str
    category: str
    health_status: str
    latest_run_status: str
    due_for_sync: bool
    last_success_at: Optional[datetime]
    latest_observation_at: Optional[datetime]
    observation_age_hours: Optional[float]
    error_summary: Optional[str]


class MarketContextOut(BaseModel):
    generated_at: datetime
    commodity: Optional[str]
    price_indices: list[MarketContextPriceOut]
    power: list[MarketContextSeriesOut]
    macro: list[MarketContextSeriesOut]
    positioning: list[MarketContextSeriesOut]
    freshness: list[MarketContextFreshnessOut]


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
