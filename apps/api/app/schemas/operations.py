from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class DependencyHealthOut(BaseModel):
    key: str
    label: str
    provider: str
    run_status: str
    health_status: str
    success_sla_hours: int
    last_run_at: Optional[datetime]
    last_success_at: Optional[datetime]
    error_summary: Optional[str]


class DatabaseOverviewOut(BaseModel):
    dialect: str
    name: str
    size_bytes: Optional[int]
    table_count: int
    record_count: int


class SystemOverviewOut(BaseModel):
    generated_at: datetime
    server_status: str
    database_status: str
    database: DatabaseOverviewOut
    uptime_seconds: int
    presence_window_seconds: int
    active_session_count: int
    active_user_count: int
    registered_user_count: int
    active_account_count: int
    open_trade_count: int
    events_last_hour: int
    last_event_recorded_at: Optional[datetime]
    dependency_count: int
    healthy_dependency_count: int
    dependencies: list[DependencyHealthOut]


class TradeCreditApprovalDecisionOut(BaseModel):
    decision_id: int
    trade_id: str
    workflow_item_id: int
    decision: str
    decision_comment: str
    breach_snapshot: dict[str, object] = Field(default_factory=dict)
    decided_at: datetime
    decided_by: str


class TradeCreditExceptionOut(BaseModel):
    exception_id: int
    trade_id: str
    workflow_item_id: int
    approval_decision_id: Optional[int]
    status: str
    limit_currency_code: str
    approved_limit_amount: Optional[float]
    approved_projected_exposure_amount: float
    approved_excess_amount: Optional[float]
    approval_comment: str
    approved_at: datetime
    approved_by: str
    expires_at: datetime
    released_at: Optional[datetime]
    released_by: Optional[str]
    released_reason: Optional[str]
    current_projected_exposure_amount: Optional[float]
    remaining_headroom_amount: Optional[float]
    revalidation_required: bool
    revalidation_reason: Optional[str]


class TradeWorkflowItemOut(BaseModel):
    item_id: int
    trade_id: str
    queue: str
    workflow_type: str
    status: str
    owner: Optional[str]
    due_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    is_closed: bool
    is_overdue: bool
    age_days: int
    trade_nature: str
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    trader_user: Optional[str]
    trade_date: Optional[date]
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    active_credit_exception: Optional[TradeCreditExceptionOut] = None
    credit_decision_history: list[TradeCreditApprovalDecisionOut] = Field(default_factory=list)


class TradeWorkflowItemCreate(BaseModel):
    trade_id: str
    workflow_type: str
    status: Optional[str] = None
    owner: Optional[str] = None
    due_at: Optional[datetime] = None
    notes: Optional[str] = None


class TradeWorkflowItemUpdate(BaseModel):
    status: Optional[str] = None
    owner: Optional[str] = None
    due_at: Optional[datetime] = None
    notes: Optional[str] = None
