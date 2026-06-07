from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas._validation import normalize_required_text

IntegrationAuthStatus = Literal["none", "partial", "configured"]
AttioClientMatchBasis = Literal["exact_name", "search", "none"]


class AttioRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: Literal["attio_rest_api"] = "attio_rest_api"
    auth_status: IntegrationAuthStatus
    base_url: str
    object_limit: int
    required_scopes: list[str] = Field(default_factory=list)
    missing_configuration: list[str] = Field(default_factory=list)


class AttioObjectSummaryOut(BaseModel):
    api_slug: str
    singular_noun: str | None = None
    plural_noun: str | None = None
    workspace_id: str | None = None
    object_id: str | None = None
    created_at: str | None = None


class AttioConnectionTestOut(BaseModel):
    provider: Literal["attio_rest_api"] = "attio_rest_api"
    status: Literal["connected"] = "connected"
    workspace_id: str | None = None
    object_count: int
    returned_object_count: int
    objects: list[AttioObjectSummaryOut] = Field(default_factory=list)
    required_scopes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class AttioClientEnrichmentRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=256)

    @field_validator("client_name")
    @classmethod
    def validate_client_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="client_name")


class AttioClientMatchedRecordOut(BaseModel):
    object_slug: Literal["companies"] = "companies"
    record_id: str
    label: str
    web_url: str | None = None
    domains: list[str] = Field(default_factory=list)
    description: str | None = None
    status: str | None = None


class AttioClientContactOut(BaseModel):
    record_id: str
    name: str
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    web_url: str | None = None


class AttioClientDealOut(BaseModel):
    record_id: str
    name: str
    stage: str | None = None
    value: str | None = None
    close_date: str | None = None
    web_url: str | None = None


class AttioClientEnrichmentOut(BaseModel):
    provider: Literal["attio_rest_api"] = "attio_rest_api"
    configured: bool = True
    client_name: str
    matched: bool
    match_basis: AttioClientMatchBasis
    company: AttioClientMatchedRecordOut | None = None
    contacts: list[AttioClientContactOut] = Field(default_factory=list)
    deals: list[AttioClientDealOut] = Field(default_factory=list)
    required_scopes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class NotionRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: Literal["notion_api"] = "notion_api"
    auth_status: IntegrationAuthStatus
    base_url: str
    api_version: str
    search_limit: int
    required_capabilities: list[str] = Field(default_factory=list)
    missing_configuration: list[str] = Field(default_factory=list)


class NotionUserOut(BaseModel):
    id: str
    object: str | None = None
    type: str | None = None
    name: str | None = None
    avatar_url: str | None = None
    workspace_name: str | None = None
    workspace_id: str | None = None
    owner_type: str | None = None


class NotionSearchResultSummaryOut(BaseModel):
    object: str
    id: str
    title: str | None = None
    url: str | None = None
    created_time: str | None = None
    last_edited_time: str | None = None
    parent_type: str | None = None


class NotionConnectionTestOut(BaseModel):
    provider: Literal["notion_api"] = "notion_api"
    status: Literal["connected"] = "connected"
    user: NotionUserOut
    accessible_result_count: int
    returned_result_count: int
    has_more: bool
    results: list[NotionSearchResultSummaryOut] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class AnthropicRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: Literal["anthropic_admin_api"] = "anthropic_admin_api"
    auth_status: IntegrationAuthStatus
    base_url: str
    api_version: str
    tracked_api_key_id: str | None = None
    missing_configuration: list[str] = Field(default_factory=list)


class AnthropicAPIKeyActorOut(BaseModel):
    id: str
    type: str


class AnthropicAPIKeyOut(BaseModel):
    id: str
    created_at: str
    created_by: AnthropicAPIKeyActorOut
    expires_at: str | None = None
    name: str
    partial_key_hint: str
    status: Literal["active", "inactive", "archived", "expired"]
    type: Literal["api_key"] = "api_key"
    workspace_id: str | None = None


class AnthropicAPIKeyLookupOut(BaseModel):
    provider: Literal["anthropic_admin_api"] = "anthropic_admin_api"
    status: Literal["connected"] = "connected"
    api_key: AnthropicAPIKeyOut
    warnings: list[str] = Field(default_factory=list)
