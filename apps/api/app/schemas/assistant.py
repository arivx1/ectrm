from __future__ import annotations

import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text

AssistantProvider = Literal["openai", "anthropic", "google"]
AssistantMessageRole = Literal["user", "assistant"]
AssistantPromptSectionSource = Literal[
    "system",
    "organization",
    "user",
    "business",
    "data",
    "tool",
    "world",
    "workspace",
    "application",
    "agent",
]
AssistantWorkspace = Literal[
    "dashboard",
    "guide",
    "trades",
    "events",
    "positions",
    "reference",
    "admin",
    "settings",
    "assistant",
]
AssistantAgentStatus = Literal["DRAFT", "ACTIVE", "PAUSED", "RETIRED"]
AssistantAgentScope = Literal["PERSONAL", "TEAM", "ORGANIZATION"]
AssistantAgentCapability = Literal["READ", "EXPLAIN", "DRAFT", "ACTION"]
AssistantRunStatus = Literal["COMPLETED", "FAILED"]

AGENT_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")


class AssistantProviderStatusOut(BaseModel):
    provider: AssistantProvider
    label: str
    enabled: bool
    configured: bool
    is_default: bool
    default_model: str
    base_url: str
    setup_env_var: str


class AssistantToolDefinitionOut(BaseModel):
    name: str
    description: str


class AssistantRuntimeSettingsOut(BaseModel):
    enabled: bool
    default_provider: AssistantProvider
    effective_default_provider: Optional[AssistantProvider]
    configured_provider_count: int
    providers: list[AssistantProviderStatusOut]
    available_tools: list[AssistantToolDefinitionOut]


class AssistantMessageIn(BaseModel):
    role: AssistantMessageRole
    content: str = Field(..., min_length=1, max_length=20_000)

    @field_validator("content")
    @classmethod
    def normalize_content(cls, value: str) -> str:
        return normalize_required_text(value, field_name="content")


class AssistantMessageOut(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str


class AssistantPromptContextRequest(BaseModel):
    agent_id: Optional[str] = Field(default=None, max_length=64)
    provider: Optional[AssistantProvider] = None
    workspace: Optional[AssistantWorkspace] = None
    context: Optional[str] = Field(default=None, max_length=20_000)
    use_live_tools: bool = True

    @field_validator("agent_id")
    @classmethod
    def normalize_agent_id(cls, value: Optional[str]) -> Optional[str]:
        normalized = normalize_optional_text(value, field_name="agent_id", lowercase=True)
        if normalized is None:
            return None
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("context")
    @classmethod
    def normalize_context(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="context")


class AssistantPromptRequest(AssistantPromptContextRequest):
    messages: list[AssistantMessageIn] = Field(..., min_length=1, max_length=40)


class AssistantUsageOut(BaseModel):
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None


class AssistantToolCallOut(BaseModel):
    tool_name: str
    summary: str
    arguments: dict[str, object] = Field(default_factory=dict)
    record_count: Optional[int] = None


class AssistantPromptResponse(BaseModel):
    run_id: Optional[int] = None
    run_recorded_at: Optional[datetime] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    provider: AssistantProvider
    model: str
    message: AssistantMessageOut
    usage: AssistantUsageOut
    warnings: list[str] = Field(default_factory=list)
    tool_calls: list[AssistantToolCallOut] = Field(default_factory=list)


class AssistantPromptSectionOut(BaseModel):
    key: str
    title: str
    source: AssistantPromptSectionSource
    content: str


class AssistantPromptContextOut(BaseModel):
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    provider: AssistantProvider
    model: str
    generated_at: datetime
    warnings: list[str] = Field(default_factory=list)
    sections: list[AssistantPromptSectionOut]
    rendered_system_prompt: str


def _ensure_distinct_values(values: list[str], *, field_name: str) -> list[str]:
    if len(values) != len(set(values)):
        raise ValueError(f"{field_name} must not contain duplicates")
    return values


class AssistantAgentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: str = Field(..., min_length=1, max_length=500)
    status: AssistantAgentStatus
    scope: AssistantAgentScope
    provider: Optional[AssistantProvider] = None
    model: Optional[str] = Field(default=None, max_length=160)
    allowed_workspaces: list[AssistantWorkspace] = Field(..., min_length=1, max_length=8)
    capabilities: list[AssistantAgentCapability] = Field(..., min_length=1, max_length=4)
    allowed_tools: list[str] = Field(default_factory=list, max_length=16)
    system_prompt: str = Field(..., min_length=1, max_length=20_000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return normalize_required_text(value, field_name="description")

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="model")

    @field_validator("system_prompt")
    @classmethod
    def normalize_system_prompt(cls, value: str) -> str:
        return normalize_required_text(value, field_name="system_prompt")

    @field_validator("allowed_workspaces")
    @classmethod
    def validate_allowed_workspaces(cls, value: list[AssistantWorkspace]) -> list[AssistantWorkspace]:
        return _ensure_distinct_values(value, field_name="allowed_workspaces")

    @field_validator("capabilities")
    @classmethod
    def validate_capabilities(cls, value: list[AssistantAgentCapability]) -> list[AssistantAgentCapability]:
        return _ensure_distinct_values(value, field_name="capabilities")

    @field_validator("allowed_tools")
    @classmethod
    def normalize_allowed_tools(cls, value: list[str]) -> list[str]:
        normalized = [normalize_required_text(tool_name, field_name="allowed_tools").lower() for tool_name in value]
        return _ensure_distinct_values(normalized, field_name="allowed_tools")

    @field_validator("model")
    @classmethod
    def validate_model_requires_provider(cls, value: Optional[str], info: ValidationInfo) -> Optional[str]:
        provider = info.data.get("provider")
        if value is not None and provider is None:
            raise ValueError("provider is required when model is set")
        return value


class AssistantAgentCreate(AssistantAgentBase):
    agent_id: str = Field(..., min_length=2, max_length=64)
    created_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("agent_id")
    @classmethod
    def normalize_agent_id(cls, value: str) -> str:
        normalized = normalize_required_text(value, field_name="agent_id", lowercase=True)
        if not AGENT_ID_PATTERN.fullmatch(normalized):
            raise ValueError("agent_id must use lowercase letters, numbers, hyphens, or underscores")
        return normalized

    @field_validator("created_by")
    @classmethod
    def normalize_created_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="created_by")


class AssistantAgentUpdate(AssistantAgentBase):
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class AssistantAgentOut(BaseModel):
    agent_id: str
    name: str
    description: str
    status: AssistantAgentStatus
    scope: AssistantAgentScope
    provider: Optional[AssistantProvider]
    model: Optional[str]
    allowed_workspaces: list[AssistantWorkspace]
    capabilities: list[AssistantAgentCapability]
    allowed_tools: list[str]


class AssistantAgentAdminOut(AssistantAgentOut):
    system_prompt: str
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class AssistantRunSummaryOut(BaseModel):
    run_id: int
    status: AssistantRunStatus
    created_at: datetime
    completed_at: datetime
    user_id: str
    user_role: str
    workspace: Optional[AssistantWorkspace]
    agent_id: Optional[str]
    agent_name: Optional[str]
    provider: AssistantProvider
    model: str
    use_live_tools: bool
    warning_count: int
    tool_call_count: int
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    latest_user_message: Optional[str] = None
    assistant_message: Optional[str] = None
    error_detail: Optional[str] = None


class AssistantRunOut(AssistantRunSummaryOut):
    request_messages: list[AssistantMessageIn]
    application_context: Optional[str] = None
    prompt_sections: list[AssistantPromptSectionOut]
    rendered_system_prompt: str
    warnings: list[str] = Field(default_factory=list)
    tool_calls: list[AssistantToolCallOut] = Field(default_factory=list)
