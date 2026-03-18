from __future__ import annotations

from pydantic import BaseModel

from apps.api.app.schemas.assistant import AssistantRuntimeSettingsOut


class PaginationSettingsOut(BaseModel):
    standard_default: int
    standard_max: int
    admin_default: int
    admin_max: int


class GoogleAuthRuntimeSettingsOut(BaseModel):
    enabled: bool
    client_id: str | None
    auto_create_users: bool


class PublicRuntimeSettingsOut(BaseModel):
    app_version: str
    cors_allow_origins: list[str]
    mutation_protection_enabled: bool
    bootstrap_admin_enabled: bool
    single_user_auth_enabled: bool
    google_auth: GoogleAuthRuntimeSettingsOut
    session_ttl_hours: int
    eia_base_url: str
    eia_timeout_seconds: int
    pagination: PaginationSettingsOut
    assistant: AssistantRuntimeSettingsOut
