from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text

CodexTaskStatus = Literal["QUEUED", "DISPATCHED", "RUNNING", "COMPLETED", "STOPPED", "FAILED", "CANCELLED"]
CodexTaskProvider = Literal["github_actions"]
CodexTaskRunMode = Literal["SINGLE_TASK", "LONG_RUNNING"]
CodexTaskCallbackStatus = Literal["RUNNING", "COMPLETED", "STOPPED", "FAILED"]


class CodexTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    prompt: str = Field(..., min_length=1, max_length=20_000)
    run_mode: CodexTaskRunMode = "SINGLE_TASK"
    max_iterations: int = Field(default=1, ge=1, le=50)
    continuation_prompt: Optional[str] = Field(default=None, max_length=500)
    target_ref: Optional[str] = Field(default=None, max_length=160)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return normalize_required_text(value, field_name="title")

    @field_validator("prompt")
    @classmethod
    def normalize_prompt(cls, value: str) -> str:
        return normalize_required_text(value, field_name="prompt")

    @field_validator("continuation_prompt")
    @classmethod
    def normalize_continuation_prompt(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="continuation_prompt")

    @field_validator("target_ref")
    @classmethod
    def normalize_target_ref(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="target_ref")


class CodexTaskOut(BaseModel):
    id: int
    status: CodexTaskStatus
    provider: CodexTaskProvider
    title: str
    prompt: str
    run_mode: CodexTaskRunMode
    max_iterations: int
    continuation_prompt: Optional[str] = None
    stop_conditions: list[str] = Field(default_factory=list)
    target_ref: str
    repository: Optional[str] = None
    workflow_id: Optional[str] = None
    dispatch_url: Optional[str] = None
    callback_url: Optional[str] = None
    external_url: Optional[str] = None
    workflow_run_id: Optional[str] = None
    workflow_run_url: Optional[str] = None
    branch_name: Optional[str] = None
    pull_request_url: Optional[str] = None
    artifact_url: Optional[str] = None
    iteration_count: int = 0
    iteration_summaries: list[dict[str, object]] = Field(default_factory=list)
    result_summary: Optional[str] = None
    stop_reason: Optional[str] = None
    provider_response: Optional[dict[str, object]] = None
    error_detail: Optional[str] = None
    requested_by: str
    requester_role: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CodexTaskSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: CodexTaskProvider
    repository: Optional[str] = None
    workflow_id: Optional[str] = None
    default_ref: str
    prompt_input_name: str
    long_running_default_max_iterations: int
    long_running_max_iterations: int
    long_running_default_continuation_prompt: str
    missing_configuration: list[str] = Field(default_factory=list)


class CodexTaskCallback(BaseModel):
    status: CodexTaskCallbackStatus
    workflow_run_id: Optional[str] = Field(default=None, max_length=120)
    workflow_run_url: Optional[str] = Field(default=None, max_length=2000)
    branch_name: Optional[str] = Field(default=None, max_length=240)
    pull_request_url: Optional[str] = Field(default=None, max_length=2000)
    artifact_url: Optional[str] = Field(default=None, max_length=2000)
    iteration_count: Optional[int] = Field(default=None, ge=0, le=50)
    iteration_summaries: list[dict[str, object]] = Field(default_factory=list, max_length=50)
    result_summary: Optional[str] = Field(default=None, max_length=10_000)
    stop_reason: Optional[str] = Field(default=None, max_length=2_000)
    error_detail: Optional[str] = Field(default=None, max_length=2_000)

    @field_validator(
        "workflow_run_id",
        "workflow_run_url",
        "branch_name",
        "pull_request_url",
        "artifact_url",
        "result_summary",
        "stop_reason",
        "error_detail",
    )
    @classmethod
    def normalize_optional_callback_text(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="callback_text")
