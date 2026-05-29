from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text

JobScheduleStatus = Literal["ACTIVE", "PAUSED", "ARCHIVED"]
JobTriggerType = Literal["TIME", "EVENT"]
JobExecutionMode = Literal["DETERMINISTIC", "AGENTIC", "HYBRID"]
JobMaxAuthority = Literal["OBSERVE", "EXPLAIN", "DRAFT", "STAGE"]
JobRecurrenceFrequency = Literal["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]
JobWeekday = Literal["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
JobRunStatus = Literal["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "SKIPPED"]


def _normalize_datetime(value: datetime | None, *, field_name: str) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must include a timezone offset")
    return value


class JobRecurrence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    frequency: JobRecurrenceFrequency
    interval: int = Field(default=1, ge=1, le=366)
    by_weekday: list[JobWeekday] | None = None
    until_at: datetime | None = None
    count: int | None = Field(default=None, ge=1, le=5000)

    @field_validator("frequency", mode="before")
    @classmethod
    def normalize_frequency(cls, value: str) -> str:
        return normalize_required_text(value, field_name="frequency", uppercase=True)

    @field_validator("by_weekday", mode="before")
    @classmethod
    def normalize_by_weekday(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            normalized_item = normalize_required_text(item, field_name="by_weekday", uppercase=True)
            if normalized_item not in seen:
                normalized.append(normalized_item)
                seen.add(normalized_item)
        return normalized

    @field_validator("until_at")
    @classmethod
    def validate_until_at(cls, value: datetime | None) -> datetime | None:
        return _normalize_datetime(value, field_name="until_at")

    @model_validator(mode="after")
    def validate_weekday_usage(self) -> "JobRecurrence":
        if self.by_weekday and self.frequency != "WEEKLY":
            raise ValueError("by_weekday is only supported for WEEKLY recurrence")
        return self


class TimeJobTrigger(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: datetime
    timezone: str = Field(..., min_length=1, max_length=60)
    recurrence: JobRecurrence | None = None

    @field_validator("starts_at")
    @classmethod
    def validate_starts_at(cls, value: datetime) -> datetime:
        normalized = _normalize_datetime(value, field_name="starts_at")
        if normalized is None:
            raise ValueError("starts_at is required")
        return normalized

    @field_validator("timezone")
    @classmethod
    def normalize_timezone(cls, value: str) -> str:
        return normalize_required_text(value, field_name="timezone")


class EventJobTrigger(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_source: str = Field(..., min_length=1, max_length=80)
    event_type: str = Field(..., min_length=1, max_length=120)
    event_filter: dict[str, object] = Field(default_factory=dict)

    @field_validator("event_source")
    @classmethod
    def normalize_event_source(cls, value: str) -> str:
        return normalize_required_text(value, field_name="event_source", lowercase=True)

    @field_validator("event_type")
    @classmethod
    def normalize_event_type(cls, value: str) -> str:
        return normalize_required_text(value, field_name="event_type")


class JobExecutionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: JobExecutionMode
    deterministic_task_key: str | None = Field(default=None, min_length=1, max_length=120)
    agent_id: str | None = Field(default=None, min_length=1, max_length=64)
    allowed_action_types: list[str] = Field(default_factory=list, max_length=50)
    max_authority: JobMaxAuthority = "DRAFT"
    payload: dict[str, object] = Field(default_factory=dict)

    @field_validator("mode", mode="before")
    @classmethod
    def normalize_mode(cls, value: str) -> str:
        return normalize_required_text(value, field_name="mode", uppercase=True)

    @field_validator("deterministic_task_key")
    @classmethod
    def normalize_deterministic_task_key(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="deterministic_task_key", lowercase=True)

    @field_validator("agent_id")
    @classmethod
    def normalize_agent_id(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="agent_id")

    @field_validator("allowed_action_types", mode="before")
    @classmethod
    def normalize_allowed_action_types(cls, value: list[str] | None) -> list[str]:
        if value is None:
            return []
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            normalized_item = normalize_required_text(item, field_name="allowed_action_types", lowercase=True)
            if normalized_item not in seen:
                normalized.append(normalized_item)
                seen.add(normalized_item)
        return normalized

    @field_validator("max_authority", mode="before")
    @classmethod
    def normalize_max_authority(cls, value: str) -> str:
        return normalize_required_text(value, field_name="max_authority", uppercase=True)

    @model_validator(mode="after")
    def validate_plan_shape(self) -> "JobExecutionPlan":
        has_task = bool(self.deterministic_task_key)
        has_agent = bool(self.agent_id)
        if self.mode == "DETERMINISTIC" and not has_task:
            raise ValueError("deterministic_task_key is required for DETERMINISTIC jobs")
        if self.mode == "AGENTIC" and not has_agent:
            raise ValueError("agent_id is required for AGENTIC jobs")
        if self.mode == "HYBRID" and not (has_task and has_agent):
            raise ValueError("HYBRID jobs require both deterministic_task_key and agent_id")
        if self.allowed_action_types and self.max_authority != "STAGE":
            raise ValueError("allowed_action_types require max_authority STAGE")
        return self


class JobScheduleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    trigger_type: JobTriggerType
    time_trigger: TimeJobTrigger | None = None
    event_trigger: EventJobTrigger | None = None
    execution_plan: JobExecutionPlan

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="description")

    @field_validator("trigger_type", mode="before")
    @classmethod
    def normalize_trigger_type(cls, value: str) -> str:
        return normalize_required_text(value, field_name="trigger_type", uppercase=True)

    @model_validator(mode="after")
    def validate_trigger_shape(self) -> "JobScheduleCreate":
        if self.trigger_type == "TIME" and self.time_trigger is None:
            raise ValueError("time_trigger is required when trigger_type is TIME")
        if self.trigger_type == "EVENT" and self.event_trigger is None:
            raise ValueError("event_trigger is required when trigger_type is EVENT")
        if self.trigger_type == "TIME" and self.event_trigger is not None:
            raise ValueError("event_trigger is only supported when trigger_type is EVENT")
        if self.trigger_type == "EVENT" and self.time_trigger is not None:
            raise ValueError("time_trigger is only supported when trigger_type is TIME")
        return self


class JobScheduleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    status: JobScheduleStatus | None = None
    time_trigger: TimeJobTrigger | None = None
    event_trigger: EventJobTrigger | None = None
    execution_plan: JobExecutionPlan | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="name")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="description")

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="status", uppercase=True)


class JobScheduleOut(BaseModel):
    id: int
    name: str
    description: str | None
    status: JobScheduleStatus
    trigger_type: JobTriggerType
    time_trigger: TimeJobTrigger | None
    event_trigger: EventJobTrigger | None
    execution_plan: JobExecutionPlan
    next_run_at: datetime | None
    last_run_at: datetime | None
    is_user_enabled: bool
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class JobRunOut(BaseModel):
    id: int
    schedule_id: int
    status: JobRunStatus
    trigger_type: JobTriggerType
    scheduled_for: datetime | None
    event_source: str | None
    event_type: str | None
    trigger_ref: str | None
    event_payload: dict[str, object] | None
    idempotency_key: str
    execution_plan: JobExecutionPlan
    schedule_version: int
    attempt_count: int
    started_at: datetime | None
    completed_at: datetime | None
    action_request_ids: list[int]
    result: dict[str, object] | None
    error_detail: str | None
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str


class JobRunBatchOut(BaseModel):
    count: int
    items: list[JobRunOut]


class MaterializeDueJobRunsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    as_of: datetime | None = None
    limit: int = Field(default=50, ge=1, le=500)

    @field_validator("as_of")
    @classmethod
    def validate_as_of(cls, value: datetime | None) -> datetime | None:
        return _normalize_datetime(value, field_name="as_of")


class EnqueueEventJobRunsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_source: str = Field(..., min_length=1, max_length=80)
    event_type: str = Field(..., min_length=1, max_length=120)
    event_ref: str | None = Field(default=None, max_length=240)
    occurred_at: datetime | None = None
    event_payload: dict[str, object] = Field(default_factory=dict)
    limit: int = Field(default=100, ge=1, le=500)

    @field_validator("event_source")
    @classmethod
    def normalize_event_source(cls, value: str) -> str:
        return normalize_required_text(value, field_name="event_source", lowercase=True)

    @field_validator("event_type")
    @classmethod
    def normalize_event_type(cls, value: str) -> str:
        return normalize_required_text(value, field_name="event_type")

    @field_validator("event_ref")
    @classmethod
    def normalize_event_ref(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="event_ref")

    @field_validator("occurred_at")
    @classmethod
    def validate_occurred_at(cls, value: datetime | None) -> datetime | None:
        return _normalize_datetime(value, field_name="occurred_at")


class JobRunStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: JobRunStatus
    result: dict[str, object] | None = None
    action_request_ids: list[int] = Field(default_factory=list, max_length=100)
    error_detail: str | None = Field(default=None, max_length=4000)

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        return normalize_required_text(value, field_name="status", uppercase=True)

    @field_validator("error_detail")
    @classmethod
    def normalize_error_detail(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="error_detail")


class DeterministicJobCatalogEntryOut(BaseModel):
    key: str
    label: str
    description: str
    risk_level: str
    expected_output: str
    authority_note: str
