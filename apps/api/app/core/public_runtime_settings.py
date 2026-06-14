from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.core.query_params import (
    ADMIN_LIST_LIMIT_DEFAULT,
    ADMIN_LIST_LIMIT_MAX,
    STANDARD_LIST_LIMIT_DEFAULT,
    STANDARD_LIST_LIMIT_MAX,
)
from apps.api.app.domains.admin.services.projection_monitoring import (
    build_projection_monitoring_email_runtime_settings,
)
from apps.api.app.domains.assistant.services.chat import build_assistant_runtime_settings
from apps.api.app.domains.operations.services import build_database_overview
from apps.api.app.schemas.runtime_settings import (
    GoogleAuthRuntimeSettingsOut,
    PaginationSettingsOut,
    PublicRuntimeSettingsOut,
)


def build_public_runtime_settings(db: Session) -> PublicRuntimeSettingsOut:
    google_auth_client_id = settings.GOOGLE_AUTH_CLIENT_ID.strip() or None
    return PublicRuntimeSettingsOut(
        app_version=settings.APP_VERSION,
        database=build_database_overview(db),
        cors_allow_origins=settings.cors_allow_origins,
        mutation_protection_enabled=True,
        bootstrap_admin_enabled=bool(settings.BOOTSTRAP_ADMIN_TOKEN.strip() or settings.MUTATION_API_TOKEN.strip()),
        single_user_auth_enabled=settings.SINGLE_USER_AUTH_ENABLED,
        google_auth=GoogleAuthRuntimeSettingsOut(
            enabled=bool(settings.GOOGLE_AUTH_ENABLED and google_auth_client_id),
            client_id=google_auth_client_id,
            auto_create_users=settings.GOOGLE_AUTH_AUTO_CREATE_USERS,
        ),
        projection_monitoring_email=build_projection_monitoring_email_runtime_settings(db),
        session_ttl_hours=settings.SESSION_TTL_HOURS,
        eia_base_url=settings.EIA_BASE_URL,
        eia_timeout_seconds=settings.EIA_TIMEOUT_SECONDS,
        pagination=PaginationSettingsOut(
            standard_default=STANDARD_LIST_LIMIT_DEFAULT,
            standard_max=STANDARD_LIST_LIMIT_MAX,
            admin_default=ADMIN_LIST_LIMIT_DEFAULT,
            admin_max=ADMIN_LIST_LIMIT_MAX,
        ),
        assistant=build_assistant_runtime_settings(),
    )
