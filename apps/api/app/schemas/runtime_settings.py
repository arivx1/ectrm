from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from apps.api.app.schemas.operations import DatabaseOverviewOut
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


class ProjectionMonitoringEmailRuntimeSettingsOut(BaseModel):
    transport: Literal["local_archive", "smtp"]
    provider_hint: Literal["none", "gmail", "generic_smtp"]
    smtp_host: str | None
    smtp_port: int | None
    sender: str
    recipient_count: int
    auth_status: Literal["none", "partial", "configured"]


class PublicRuntimeSettingsOut(BaseModel):
    app_version: str
    database: DatabaseOverviewOut
    cors_allow_origins: list[str]
    mutation_protection_enabled: bool
    bootstrap_admin_enabled: bool
    single_user_auth_enabled: bool
    google_auth: GoogleAuthRuntimeSettingsOut
    projection_monitoring_email: ProjectionMonitoringEmailRuntimeSettingsOut
    session_ttl_hours: int
    eia_base_url: str
    eia_timeout_seconds: int
    pagination: PaginationSettingsOut
    assistant: AssistantRuntimeSettingsOut
