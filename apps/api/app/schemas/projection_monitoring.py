from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ProjectionAlertChannel = Literal["ADMIN_WORKSPACE", "EMAIL", "SLACK", "INCIDENT_QUEUE"]
ProjectionAutoCleanMode = Literal["disabled", "clean_auto_cleanable"]
ProjectionMonitoringHealthStatus = Literal["disabled", "healthy", "attention", "critical"]
ProjectionMonitoringCycleStatus = Literal["idle", "skipped", "healthy", "issues_detected", "issues_auto_cleaned"]
ProjectionMonitoringAlertSeverity = Literal["warning", "critical"]
ProjectionMonitoringDeliveryStatus = Literal["queued", "delivered", "failed", "skipped"]


class TradeProjectionMonitoringScheduleOut(BaseModel):
    enabled: bool = True
    cadence_minutes: int = Field(default=240, ge=15, le=10080)
    auto_clean_mode: ProjectionAutoCleanMode = "clean_auto_cleanable"
    max_cleanup_trades_per_run: int = Field(default=25, ge=1, le=500)


class TradeProjectionMonitoringAlertingOut(BaseModel):
    enabled: bool = True
    issue_count_threshold: int = Field(default=1, ge=0, le=10000)
    impacted_trade_threshold: int = Field(default=1, ge=0, le=10000)
    minimum_alert_interval_minutes: int = Field(default=60, ge=0, le=10080)
    channels: list[ProjectionAlertChannel] = Field(default_factory=lambda: ["ADMIN_WORKSPACE", "EMAIL"])
    routing_note: str = Field(default="", max_length=500)


class TradeProjectionMonitoringDocumentOut(BaseModel):
    policy_key: str = "projection_integrity_monitoring.v1"
    schedule: TradeProjectionMonitoringScheduleOut = Field(default_factory=TradeProjectionMonitoringScheduleOut)
    alerting: TradeProjectionMonitoringAlertingOut = Field(default_factory=TradeProjectionMonitoringAlertingOut)


class TradeProjectionMonitoringRuntimeOut(BaseModel):
    last_evaluated_at: datetime | None = None
    last_evaluated_by: str | None = None
    last_issue_count: int = 0
    last_structural_issue_count: int = 0
    last_invariant_issue_count: int = 0
    last_impacted_trade_count: int = 0
    last_auto_cleaned_trade_count: int = 0
    last_auto_cleaned_trade_ids: list[str] = Field(default_factory=list)
    last_cycle_status: ProjectionMonitoringCycleStatus = "idle"
    last_alert_at: datetime | None = None
    last_alert_reason: str | None = None
    last_alert_severity: ProjectionMonitoringAlertSeverity | None = None


class TradeProjectionMonitoringAlertOut(BaseModel):
    alert_id: str
    created_at: datetime
    severity: ProjectionMonitoringAlertSeverity
    reason: str
    messages: list[str] = Field(default_factory=list)
    channels: list[ProjectionAlertChannel] = Field(default_factory=list)
    issue_count: int = 0
    structural_issue_count: int = 0
    invariant_issue_count: int = 0
    impacted_trade_count: int = 0
    auto_cleaned_trade_ids: list[str] = Field(default_factory=list)


class TradeProjectionMonitoringDeliveryOut(BaseModel):
    delivery_id: str
    alert_id: str
    channel: ProjectionAlertChannel
    status: ProjectionMonitoringDeliveryStatus
    target: str
    title: str
    body: str
    recipients: list[str] = Field(default_factory=list)
    created_at: datetime
    delivered_at: datetime | None = None
    error: str | None = None


class TradeProjectionMonitoringLiveStatusOut(BaseModel):
    health_status: ProjectionMonitoringHealthStatus
    evaluation_due: bool
    next_evaluation_at: datetime | None = None
    live_issue_count: int
    live_structural_issue_count: int = 0
    live_invariant_issue_count: int = 0
    live_impacted_trade_count: int
    should_alert: bool
    alert_messages: list[str] = Field(default_factory=list)
    last_evaluated_at: datetime | None = None
    last_evaluated_by: str | None = None
    last_alert_at: datetime | None = None
    last_alert_reason: str | None = None


class TradeProjectionMonitoringRevisionOut(BaseModel):
    revision_id: int
    version: int
    created_at: datetime
    created_by: str
    change_summary: list[str] = Field(default_factory=list)
    restored_from_revision_id: int | None = None


class TradeProjectionMonitoringAdminOut(BaseModel):
    document: TradeProjectionMonitoringDocumentOut
    updated_at: datetime | None = None
    updated_by: str | None = None
    version: int = 0
    is_default: bool = False
    recent_revisions: list[TradeProjectionMonitoringRevisionOut] = Field(default_factory=list)
    runtime: TradeProjectionMonitoringRuntimeOut = Field(default_factory=TradeProjectionMonitoringRuntimeOut)
    recent_alerts: list[TradeProjectionMonitoringAlertOut] = Field(default_factory=list)
    recent_deliveries: list[TradeProjectionMonitoringDeliveryOut] = Field(default_factory=list)
    live_status: TradeProjectionMonitoringLiveStatusOut


class TradeProjectionMonitoringRunResult(BaseModel):
    cycle_status: ProjectionMonitoringCycleStatus
    executed: bool
    requested_by: str
    evaluated_at: datetime
    issue_count_before: int
    issue_count_after: int
    structural_issue_count_before: int = 0
    invariant_issue_count_before: int = 0
    structural_issue_count_after: int = 0
    invariant_issue_count_after: int = 0
    impacted_trade_count_after: int
    auto_cleaned_trade_ids: list[str] = Field(default_factory=list)
    emitted_alerts: list[TradeProjectionMonitoringAlertOut] = Field(default_factory=list)
    emitted_deliveries: list[TradeProjectionMonitoringDeliveryOut] = Field(default_factory=list)
    summary: str
    next_evaluation_at: datetime | None = None


class TradeProjectionMonitoringUpdate(BaseModel):
    document: TradeProjectionMonitoringDocumentOut
    updated_by: str = Field(..., min_length=1, max_length=128)


class TradeProjectionMonitoringRunRequest(BaseModel):
    requested_by: str = Field(..., min_length=1, max_length=128)
    force: bool = True
