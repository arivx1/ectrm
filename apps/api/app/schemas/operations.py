from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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


class SystemOverviewOut(BaseModel):
    generated_at: datetime
    server_status: str
    database_status: str
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
