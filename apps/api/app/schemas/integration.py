from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from apps.api.app.schemas._validation import normalize_optional_blankable_text, normalize_required_text

IntegrationAuthStatus = Literal["none", "partial", "configured"]
AttioClientMatchBasis = Literal["exact_name", "search", "none"]
AttioClientType = Literal["Client", "Churned", "Prospect", "Other"]
NexusContactSource = Literal["manual", "attio"]
NexusEngagementProvider = Literal["gmail", "slack"]
NexusEngagementSourceSurface = Literal["gmail_api", "messages_workspace_mirror"]


class AttioRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: Literal["attio_rest_api"] = "attio_rest_api"
    auth_status: IntegrationAuthStatus
    base_url: str
    object_limit: int
    client_sync_limit: int
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
    disqualification_reason: str | None = None
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


class AttioClientSyncRequest(BaseModel):
    limit: int | None = Field(default=None, ge=1, le=500)
    client_names: list[str] = Field(default_factory=list, max_length=500)
    excluded_client_names: list[str] = Field(default_factory=list, max_length=5000)

    @field_validator("client_names", "excluded_client_names")
    @classmethod
    def validate_client_names(cls, value: list[str], info: ValidationInfo) -> list[str]:
        normalized_names: list[str] = []
        seen_names: set[str] = set()
        for client_name in value:
            normalized_name = normalize_required_text(client_name, field_name=info.field_name)
            normalized_key = normalized_name.casefold()
            if normalized_key in seen_names:
                continue
            normalized_names.append(normalized_name)
            seen_names.add(normalized_key)
        return normalized_names


class AttioSyncedClientOut(BaseModel):
    object_slug: Literal["companies"] = "companies"
    record_id: str
    name: str
    type: AttioClientType
    relationship: str
    deal_count: int = 0
    closed_deal_count: int = 0
    open_deal_count: int = 0
    deal_statuses: list[str] = Field(default_factory=list)
    disqualified_deal_count: int = 0
    lost_deal_count: int = 0
    on_hold_deal_count: int = 0
    disqualification_reason: str | None = None
    total_arr: str | None = None
    closed_arr: str | None = None
    open_arr: str | None = None
    web_url: str | None = None
    domains: list[str] = Field(default_factory=list)
    description: str | None = None
    status: str | None = None


class AttioClientSyncOut(BaseModel):
    provider: Literal["attio_rest_api"] = "attio_rest_api"
    configured: bool = True
    object_slug: Literal["companies"] = "companies"
    requested_limit: int
    scanned_record_count: int
    skipped_record_count: int
    returned_client_count: int
    clients: list[AttioSyncedClientOut] = Field(default_factory=list)
    required_scopes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class NexusContactOut(BaseModel):
    contact_id: str
    client_name: str
    name: str
    title: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    time_at_role: str | None = None
    previous_role: str | None = None
    university: str | None = None
    university_2: str | None = None
    location: str | None = None
    email: str | None = None
    phone: str | None = None
    web_url: str | None = None
    source: NexusContactSource
    external_provider: str | None = None
    external_record_id: str | None = None
    created_at: datetime
    updated_at: datetime
    version: int


class NexusContactCreate(BaseModel):
    client_name: str = Field(min_length=1, max_length=256)
    name: str = Field(min_length=1, max_length=256)
    title: str | None = Field(default=None, max_length=256)
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    role: str | None = Field(default=None, max_length=256)
    time_at_role: str | None = Field(default=None, max_length=128)
    previous_role: str | None = Field(default=None, max_length=256)
    university: str | None = Field(default=None, max_length=256)
    university_2: str | None = Field(default=None, max_length=256)
    location: str | None = Field(default=None, max_length=256)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=80)
    web_url: str | None = Field(default=None, max_length=1024)

    @field_validator("client_name")
    @classmethod
    def validate_client_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="client_name")

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator(
        "title",
        "first_name",
        "last_name",
        "role",
        "time_at_role",
        "previous_role",
        "university",
        "university_2",
        "location",
        "email",
        "phone",
        "web_url",
    )
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        return normalize_optional_blankable_text(value)


class NexusAttioContactImport(BaseModel):
    record_id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=256)
    title: str | None = Field(default=None, max_length=256)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=80)
    web_url: str | None = Field(default=None, max_length=1024)

    @field_validator("record_id")
    @classmethod
    def validate_record_id(cls, value: str) -> str:
        return normalize_required_text(value, field_name="record_id")

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("title", "email", "phone", "web_url")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        return normalize_optional_blankable_text(value)


class NexusAttioContactImportRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=256)
    contacts: list[NexusAttioContactImport] = Field(default_factory=list, max_length=100)

    @field_validator("client_name")
    @classmethod
    def validate_client_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="client_name")


class NexusClientEngagementRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=256)
    domains: list[str] = Field(default_factory=list, max_length=25)
    contact_emails: list[str] = Field(default_factory=list, max_length=100)
    lookback_days: int = Field(default=365, ge=1, le=365)
    limit: int = Field(default=10, ge=1, le=50)

    @field_validator("client_name")
    @classmethod
    def validate_client_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="client_name")

    @field_validator("domains", "contact_emails")
    @classmethod
    def validate_text_values(cls, value: list[str]) -> list[str]:
        normalized_values: list[str] = []
        seen_values: set[str] = set()
        for item in value:
            normalized = normalize_optional_blankable_text(item)
            if normalized is None:
                continue
            normalized_key = normalized.casefold()
            if normalized_key in seen_values:
                continue
            seen_values.add(normalized_key)
            normalized_values.append(normalized)
        return normalized_values


class NexusClientEngagementOut(BaseModel):
    provider: NexusEngagementProvider
    source_surface: NexusEngagementSourceSurface
    external_id: str
    title: str
    snippet: str | None = None
    occurred_at: datetime | None = None
    author: str | None = None
    matched_basis: list[str] = Field(default_factory=list)
    conversation_id: str | None = None
    url: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


class NexusClientEngagementsOut(BaseModel):
    client_name: str
    lookback_days: int
    requested_limit: int
    matched_count: int
    returned_count: int
    source_counts: dict[str, int] = Field(default_factory=dict)
    gmail_query: str | None = None
    items: list[NexusClientEngagementOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    read_only: bool = True


class NotionRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: Literal["notion_api"] = "notion_api"
    auth_status: IntegrationAuthStatus
    base_url: str
    api_version: str
    search_limit: int
    client_page_confidence_threshold: float
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


class NotionClientPagesRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=256)

    @field_validator("client_name")
    @classmethod
    def validate_client_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="client_name")


class NotionClientPageOut(BaseModel):
    object: Literal["page"] = "page"
    page_id: str
    title: str | None = None
    url: str | None = None
    created_time: str | None = None
    last_edited_time: str | None = None
    parent_type: str | None = None
    relevance_confidence: float = 0
    relevance_basis: list[str] = Field(default_factory=list)


class NotionClientPagesOut(BaseModel):
    provider: Literal["notion_api"] = "notion_api"
    configured: bool = True
    client_name: str
    query: str
    matched: bool
    confidence_threshold: float = 0
    candidate_page_count: int = 0
    rejected_page_count: int = 0
    returned_page_count: int
    has_more: bool
    pages: list[NotionClientPageOut] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


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


class GrainRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: Literal["grain_api"] = "grain_api"
    auth_status: IntegrationAuthStatus
    base_url: str
    public_api_version: str
    recording_limit: int
    required_capabilities: list[str] = Field(default_factory=list)
    missing_configuration: list[str] = Field(default_factory=list)


class GrainRecordingSummaryOut(BaseModel):
    id: str
    title: str | None = None
    url: str | None = None
    source: str | None = None
    media_type: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    duration_seconds: float | None = None
    participant_count: int | None = None


class GrainClientRecordingsRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=256)

    @field_validator("client_name")
    @classmethod
    def validate_client_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="client_name")


class GrainClientRecordingsOut(BaseModel):
    provider: Literal["grain_api"] = "grain_api"
    configured: bool = True
    client_name: str
    query: str
    matched: bool
    recording_count: int
    returned_recording_count: int
    cursor: str | None = None
    recordings: list[GrainRecordingSummaryOut] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class GrainConnectionTestOut(BaseModel):
    provider: Literal["grain_api"] = "grain_api"
    status: Literal["connected"] = "connected"
    recording_count: int
    returned_recording_count: int
    cursor: str | None = None
    recordings: list[GrainRecordingSummaryOut] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class LinearRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: Literal["linear_api"] = "linear_api"
    auth_status: IntegrationAuthStatus
    graphql_url: str
    issue_limit: int
    required_capabilities: list[str] = Field(default_factory=list)
    missing_configuration: list[str] = Field(default_factory=list)


class LinearIssueSummaryOut(BaseModel):
    id: str
    identifier: str
    title: str
    url: str | None = None
    description: str | None = None
    priority: int | None = None
    priority_label: str | None = None
    state_name: str | None = None
    state_type: str | None = None
    team_key: str | None = None
    team_name: str | None = None
    assignee_name: str | None = None
    assignee_email: str | None = None
    project_name: str | None = None
    project_url: str | None = None
    label_names: list[str] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None
    due_date: str | None = None


class LinearClientIssuesRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=256)

    @field_validator("client_name")
    @classmethod
    def validate_client_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="client_name")


class LinearClientIssuesOut(BaseModel):
    provider: Literal["linear_api"] = "linear_api"
    configured: bool = True
    client_name: str
    query: str
    matched: bool
    issue_count: int
    returned_issue_count: int
    issues: list[LinearIssueSummaryOut] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class LinearConnectionTestOut(BaseModel):
    provider: Literal["linear_api"] = "linear_api"
    status: Literal["connected"] = "connected"
    issue_count: int
    returned_issue_count: int
    issues: list[LinearIssueSummaryOut] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class GmailInboxIntegrationRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: Literal["gmail_api"] = "gmail_api"
    auth_status: IntegrationAuthStatus
    account_email: str | None = None
    query: str
    max_messages_per_import: int
    base_url: str
    token_url: str
    required_scopes: list[str] = Field(default_factory=list)
    missing_configuration: list[str] = Field(default_factory=list)


class GmailInboxConnectionTestOut(BaseModel):
    provider: Literal["gmail_api"] = "gmail_api"
    status: Literal["connected"] = "connected"
    account_email: str | None = None
    profile_email: str | None = None
    messages_total: int | None = None
    threads_total: int | None = None
    history_id: str | None = None
    query: str
    returned_message_count: int
    next_page_token: str | None = None
    required_scopes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SlackMessagingIntegrationRuntimeSettingsOut(BaseModel):
    enabled: bool
    configured: bool
    provider: Literal["slack_web_api"] = "slack_web_api"
    auth_status: IntegrationAuthStatus
    base_url: str
    configured_channel_count: int
    channel_limit: int
    history_limit: int
    required_scopes: list[str] = Field(default_factory=list)
    missing_configuration: list[str] = Field(default_factory=list)


class SlackConversationSummaryOut(BaseModel):
    channel_id: str
    name: str
    label: str
    kind: Literal["channel", "dm"]
    is_private: bool
    member_count: int | None = None


class SlackMessagingConnectionTestOut(BaseModel):
    provider: Literal["slack_web_api"] = "slack_web_api"
    status: Literal["connected"] = "connected"
    conversation_count: int
    returned_conversation_count: int
    configured_channel_count: int
    conversations: list[SlackConversationSummaryOut] = Field(default_factory=list)
    required_scopes: list[str] = Field(default_factory=list)
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
