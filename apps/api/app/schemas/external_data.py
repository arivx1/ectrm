from __future__ import annotations

from datetime import date, datetime
from typing import Any
from typing import Literal
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


class CounterpartyCreditSnapshotImport(BaseModel):
    counterparty_code: str = Field(min_length=1, max_length=50)
    source_entity_id: Optional[str] = Field(default=None, min_length=1, max_length=120)
    source_entity_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    match_basis: Optional[str] = Field(default=None, min_length=1, max_length=50)
    matched_identifier_value: Optional[str] = Field(default=None, min_length=1, max_length=120)
    as_of_date: date
    rating_scale: Optional[str] = Field(default=None, min_length=1, max_length=80)
    rating_value: Optional[str] = Field(default=None, min_length=1, max_length=80)
    rating_outlook: Optional[str] = Field(default=None, min_length=1, max_length=80)
    credit_score: Optional[float] = Field(default=None, ge=0)
    probability_of_default: Optional[float] = Field(default=None, ge=0, le=1)
    recommended_limit_currency_code: Optional[str] = Field(default=None, min_length=1, max_length=20)
    recommended_limit_amount: Optional[float] = Field(default=None, gt=0)
    commentary: Optional[str] = None
    downloaded_at: Optional[datetime] = None
    raw_payload: Optional[dict[str, Any]] = None


class CounterpartyCreditImportRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=50)
    snapshots: list[CounterpartyCreditSnapshotImport] = Field(min_length=1)
    requested_by: Optional[str] = Field(default=None, min_length=1, max_length=128)


class DNBCounterpartyCreditPreviewRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(min_length=1)
    default_limit_currency_code: Optional[str] = Field(default="USD", min_length=1, max_length=20)


class CounterpartyCreditPreviewIssueOut(BaseModel):
    severity: str
    code: str
    message: str


class CounterpartyCreditPreviewRowOut(BaseModel):
    row_number: int
    source_entity_id: Optional[str]
    source_entity_name: Optional[str]
    matched_counterparty_code: Optional[str]
    matched_counterparty_name: Optional[str]
    counterparty_is_active: Optional[bool]
    match_status: str
    match_basis: Optional[str]
    matched_identifier_value: Optional[str]
    rating_scale: Optional[str]
    rating_value: Optional[str]
    rating_outlook: Optional[str]
    credit_score: Optional[float]
    probability_of_default: Optional[float]
    recommended_limit_currency_code: Optional[str]
    recommended_limit_amount: Optional[float]
    commentary: Optional[str]
    issues: list[CounterpartyCreditPreviewIssueOut]
    ready_to_import: bool
    snapshot: Optional[CounterpartyCreditSnapshotImport]


class CounterpartyCreditPreviewOut(BaseModel):
    provider: str
    total_rows: int
    matched_rows: int
    ready_rows: int
    warning_rows: int
    blocked_rows: int
    rows: list[CounterpartyCreditPreviewRowOut]


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
    ingestion_method: str
    ingestion_mode: str
    source_system: str
    source_endpoint: Optional[str]
    sync_job_name: str
    default_lookback_days: Optional[int]
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


class PriceSourceReviewOut(BaseModel):
    id: int
    price_index_code: str
    price_index_name: Optional[str]
    commodity_code: Optional[str]
    quote_type: Optional[str]
    market: Optional[str]
    location_code: Optional[str]
    price_unit_code: Optional[str]
    price_currency_code: Optional[str]
    price_index_is_active: Optional[bool]
    provider: str
    dataset_code: Optional[str]
    series_id: str
    frequency: str
    source_unit: str
    source_currency_code: Optional[str]
    transform_rule: Optional[str]
    ingestion_method: Optional[str]
    ingestion_mode: Optional[str]
    source_system: Optional[str]
    source_endpoint: Optional[str]
    sync_job_name: Optional[str]
    default_lookback_days: Optional[int]
    is_active: bool
    review_status: str
    provider_health_status: Optional[str]
    scheduler_interval_minutes: Optional[int]
    success_sla_hours: Optional[int]
    due_for_sync: Optional[bool]
    provider_latest_observation_at: Optional[datetime]
    provider_observation_age_hours: Optional[float]
    latest_run_status: Optional[str]
    latest_run_id: Optional[int]
    last_success_at: Optional[datetime]
    provider_error_summary: Optional[str]
    latest_observation_date: Optional[date]
    latest_value: Optional[float]
    latest_unit_code: Optional[str]
    latest_currency_code: Optional[str]
    latest_source_revision: Optional[str]
    latest_source_published_at: Optional[datetime]
    latest_downloaded_at: Optional[datetime]
    latest_observation_run_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    version: int


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
    fundamentals: list[MarketContextSeriesOut]
    power: list[MarketContextSeriesOut]
    macro: list[MarketContextSeriesOut]
    positioning: list[MarketContextSeriesOut]
    freshness: list[MarketContextFreshnessOut]


class MarketNewsHeadlineOut(BaseModel):
    title: str
    source: Optional[str]
    published_at: Optional[datetime]
    link: str


MarketNewsImpactDirection = Literal["up", "down", "neutral"]
MarketNewsImpactHorizon = Literal[
    "immediate",
    "near_term",
    "mid_term",
    "long_term",
    "very_long_term",
]
MarketNewsLocationScope = Literal[
    "region",
    "country",
    "state",
    "province",
    "territory",
    "city",
    "unspecified",
]


class MarketNewsTaggingImpactIn(BaseModel):
    direction: MarketNewsImpactDirection
    horizon: MarketNewsImpactHorizon


class MarketNewsTaggingLocationIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    scope: MarketNewsLocationScope


class MarketNewsTaggingBaselineIn(BaseModel):
    supply: MarketNewsTaggingImpactIn
    demand: MarketNewsTaggingImpactIn
    market_location: MarketNewsTaggingLocationIn


class MarketNewsTaggingItemIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=280)
    source: Optional[str] = Field(default=None, max_length=160)
    published_at: Optional[datetime] = None
    deterministic: MarketNewsTaggingBaselineIn


class MarketNewsTaggingRequest(BaseModel):
    commodity: Optional[str] = Field(default=None, min_length=1, max_length=50)
    items: list[MarketNewsTaggingItemIn] = Field(min_length=1, max_length=10)


class MarketNewsTaggingImpactOut(BaseModel):
    direction: MarketNewsImpactDirection
    horizon: MarketNewsImpactHorizon
    confidence: float = Field(ge=0, le=1)
    rationale: Optional[str] = Field(default=None, max_length=240)
    source: Literal["ai"] = "ai"


class MarketNewsTaggingLocationOut(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    scope: MarketNewsLocationScope
    confidence: float = Field(ge=0, le=1)
    rationale: Optional[str] = Field(default=None, max_length=240)
    source: Literal["ai"] = "ai"


class MarketNewsTaggingItemOut(BaseModel):
    id: str
    supply: MarketNewsTaggingImpactOut
    demand: MarketNewsTaggingImpactOut
    market_location: MarketNewsTaggingLocationOut


class MarketNewsTaggingOut(BaseModel):
    generated_at: datetime
    provider: str
    model: Optional[str]
    items: list[MarketNewsTaggingItemOut]
    warnings: list[str] = Field(default_factory=list)


class MarketNewsOut(BaseModel):
    generated_at: datetime
    commodity: Optional[str]
    search_query: str
    count: int
    items: list[MarketNewsHeadlineOut]


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
