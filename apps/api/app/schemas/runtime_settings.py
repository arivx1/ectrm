from __future__ import annotations

from pydantic import BaseModel


class PaginationSettingsOut(BaseModel):
    standard_default: int
    standard_max: int
    admin_default: int
    admin_max: int


class PublicRuntimeSettingsOut(BaseModel):
    app_version: str
    cors_allow_origins: list[str]
    mutation_protection_enabled: bool
    bootstrap_admin_enabled: bool
    session_ttl_hours: int
    eia_base_url: str
    eia_timeout_seconds: int
    pagination: PaginationSettingsOut
