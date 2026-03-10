from __future__ import annotations

from datetime import date, datetime
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
