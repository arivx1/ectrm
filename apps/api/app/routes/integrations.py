from __future__ import annotations

from fastapi import APIRouter, HTTPException

from apps.api.app.domains.integrations.services.anthropic import (
    AnthropicIntegrationError,
    build_anthropic_runtime_settings,
    get_configured_anthropic_api_key,
)
from apps.api.app.domains.integrations.services.attio import (
    AttioIntegrationError,
    build_attio_client_enrichment,
    build_attio_runtime_settings,
    run_attio_connection_test,
)
from apps.api.app.domains.integrations.services.notion import (
    NotionIntegrationError,
    build_notion_runtime_settings,
    run_notion_connection_test,
)
from apps.api.app.schemas.integration import (
    AnthropicAPIKeyLookupOut,
    AnthropicRuntimeSettingsOut,
    AttioClientEnrichmentOut,
    AttioClientEnrichmentRequest,
    AttioConnectionTestOut,
    AttioRuntimeSettingsOut,
    NotionConnectionTestOut,
    NotionRuntimeSettingsOut,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])
admin_router = APIRouter(prefix="/admin/integrations", tags=["integrations-admin"])


@router.post("/attio/client-enrichment", response_model=AttioClientEnrichmentOut)
def get_attio_client_enrichment(payload: AttioClientEnrichmentRequest) -> AttioClientEnrichmentOut:
    try:
        return build_attio_client_enrichment(client_name=payload.client_name)
    except AttioIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.get("/attio/settings", response_model=AttioRuntimeSettingsOut)
def get_attio_settings() -> AttioRuntimeSettingsOut:
    return build_attio_runtime_settings()


@admin_router.post("/attio/test-connection", response_model=AttioConnectionTestOut)
def test_attio_connection() -> AttioConnectionTestOut:
    try:
        return run_attio_connection_test()
    except AttioIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.get("/notion/settings", response_model=NotionRuntimeSettingsOut)
def get_notion_settings() -> NotionRuntimeSettingsOut:
    return build_notion_runtime_settings()


@admin_router.post("/notion/test-connection", response_model=NotionConnectionTestOut)
def test_notion_connection() -> NotionConnectionTestOut:
    try:
        return run_notion_connection_test()
    except NotionIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.get("/anthropic/settings", response_model=AnthropicRuntimeSettingsOut)
def get_anthropic_settings() -> AnthropicRuntimeSettingsOut:
    return build_anthropic_runtime_settings()


@admin_router.get("/anthropic/api-key", response_model=AnthropicAPIKeyLookupOut)
def get_anthropic_api_key() -> AnthropicAPIKeyLookupOut:
    try:
        return get_configured_anthropic_api_key()
    except AnthropicIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
