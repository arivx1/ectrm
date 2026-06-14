from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.integrations.services.anthropic import (
    AnthropicIntegrationError,
    build_anthropic_runtime_settings,
    get_configured_anthropic_api_key,
)
from apps.api.app.domains.integrations.services.attio import (
    AttioIntegrationError,
    build_attio_client_enrichment,
    build_attio_client_sync,
    build_attio_runtime_settings,
    run_attio_connection_test,
)
from apps.api.app.domains.integrations.services.grain import (
    GrainIntegrationError,
    build_grain_client_recordings,
    build_grain_runtime_settings,
    run_grain_connection_test,
)
from apps.api.app.domains.integrations.services.gmail_inbox import (
    GmailInboxIntegrationError,
    build_gmail_inbox_integration_runtime_settings,
    run_gmail_inbox_connection_test,
)
from apps.api.app.domains.integrations.services.linear import (
    LinearIntegrationError,
    build_linear_client_issues,
    build_linear_runtime_settings,
    run_linear_connection_test,
)
from apps.api.app.domains.integrations.services.notion import (
    NotionIntegrationError,
    build_notion_client_pages,
    build_notion_runtime_settings,
    run_notion_connection_test,
)
from apps.api.app.domains.integrations.services.nexus_contacts import (
    NexusContactServiceError,
    create_manual_nexus_contact,
    delete_nexus_contact,
    list_nexus_contacts,
    upsert_attio_nexus_contacts,
)
from apps.api.app.domains.integrations.services.nexus_engagements import build_nexus_client_engagements
from apps.api.app.domains.integrations.services.slack_messaging import (
    SlackMessagingIntegrationError,
    build_slack_messaging_integration_runtime_settings,
    run_slack_messaging_connection_test,
)
from apps.api.app.schemas.integration import (
    AnthropicAPIKeyLookupOut,
    AnthropicRuntimeSettingsOut,
    AttioClientEnrichmentOut,
    AttioClientEnrichmentRequest,
    AttioClientSyncOut,
    AttioClientSyncRequest,
    AttioConnectionTestOut,
    AttioRuntimeSettingsOut,
    GrainClientRecordingsOut,
    GrainClientRecordingsRequest,
    GrainConnectionTestOut,
    GrainRuntimeSettingsOut,
    GmailInboxConnectionTestOut,
    GmailInboxIntegrationRuntimeSettingsOut,
    LinearClientIssuesOut,
    LinearClientIssuesRequest,
    LinearConnectionTestOut,
    LinearRuntimeSettingsOut,
    NexusAttioContactImportRequest,
    NexusClientEngagementRequest,
    NexusClientEngagementsOut,
    NexusContactCreate,
    NexusContactOut,
    NotionClientPagesOut,
    NotionClientPagesRequest,
    NotionConnectionTestOut,
    NotionRuntimeSettingsOut,
    SlackMessagingConnectionTestOut,
    SlackMessagingIntegrationRuntimeSettingsOut,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])
admin_router = APIRouter(prefix="/admin/integrations", tags=["integrations-admin"])


def _require_authenticated_actor(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return actor_id


@router.post("/attio/client-enrichment", response_model=AttioClientEnrichmentOut)
def get_attio_client_enrichment(payload: AttioClientEnrichmentRequest) -> AttioClientEnrichmentOut:
    try:
        return build_attio_client_enrichment(client_name=payload.client_name)
    except AttioIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/attio/client-sync", response_model=AttioClientSyncOut)
def sync_attio_clients(payload: AttioClientSyncRequest) -> AttioClientSyncOut:
    try:
        return build_attio_client_sync(
            limit=payload.limit,
            client_names=payload.client_names,
            excluded_client_names=payload.excluded_client_names,
        )
    except AttioIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/notion/client-pages", response_model=NotionClientPagesOut)
def get_notion_client_pages(payload: NotionClientPagesRequest) -> NotionClientPagesOut:
    try:
        return build_notion_client_pages(client_name=payload.client_name)
    except NotionIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/grain/client-recordings", response_model=GrainClientRecordingsOut)
def get_grain_client_recordings(payload: GrainClientRecordingsRequest) -> GrainClientRecordingsOut:
    try:
        return build_grain_client_recordings(client_name=payload.client_name)
    except GrainIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/linear/client-issues", response_model=LinearClientIssuesOut)
def get_linear_client_issues(payload: LinearClientIssuesRequest) -> LinearClientIssuesOut:
    try:
        return build_linear_client_issues(client_name=payload.client_name)
    except LinearIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/nexus/contacts", response_model=list[NexusContactOut])
def get_nexus_contacts(request: Request, db: Session = Depends(get_db)) -> list[NexusContactOut]:
    _require_authenticated_actor(request)
    return list_nexus_contacts(db)


@router.post("/nexus/client-engagements", response_model=NexusClientEngagementsOut)
def get_nexus_client_engagements(
    payload: NexusClientEngagementRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> NexusClientEngagementsOut:
    _require_authenticated_actor(request)
    return build_nexus_client_engagements(db, payload=payload)


@router.post("/nexus/contacts", response_model=NexusContactOut, status_code=status.HTTP_201_CREATED)
def create_nexus_contact(
    payload: NexusContactCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> NexusContactOut:
    actor_id = _require_authenticated_actor(request)
    return create_manual_nexus_contact(db, payload=payload, actor_id=actor_id)


@router.post("/nexus/contacts/import-attio", response_model=list[NexusContactOut])
def import_attio_nexus_contacts(
    payload: NexusAttioContactImportRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> list[NexusContactOut]:
    actor_id = _require_authenticated_actor(request)
    return upsert_attio_nexus_contacts(
        db,
        client_name=payload.client_name,
        contacts=payload.contacts,
        actor_id=actor_id,
    )


@router.delete("/nexus/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def remove_nexus_contact(contact_id: str, request: Request, db: Session = Depends(get_db)) -> Response:
    _require_authenticated_actor(request)
    try:
        delete_nexus_contact(db, contact_id=contact_id)
    except NexusContactServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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


@admin_router.get("/grain/settings", response_model=GrainRuntimeSettingsOut)
def get_grain_settings() -> GrainRuntimeSettingsOut:
    return build_grain_runtime_settings()


@admin_router.post("/grain/test-connection", response_model=GrainConnectionTestOut)
def test_grain_connection() -> GrainConnectionTestOut:
    try:
        return run_grain_connection_test()
    except GrainIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.get("/linear/settings", response_model=LinearRuntimeSettingsOut)
def get_linear_settings() -> LinearRuntimeSettingsOut:
    return build_linear_runtime_settings()


@admin_router.post("/linear/test-connection", response_model=LinearConnectionTestOut)
def test_linear_connection() -> LinearConnectionTestOut:
    try:
        return run_linear_connection_test()
    except LinearIntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.get("/gmail/settings", response_model=GmailInboxIntegrationRuntimeSettingsOut)
def get_gmail_inbox_settings() -> GmailInboxIntegrationRuntimeSettingsOut:
    return build_gmail_inbox_integration_runtime_settings()


@admin_router.post("/gmail/test-connection", response_model=GmailInboxConnectionTestOut)
def test_gmail_inbox_connection() -> GmailInboxConnectionTestOut:
    try:
        return run_gmail_inbox_connection_test()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except GmailInboxIntegrationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@admin_router.get("/slack/settings", response_model=SlackMessagingIntegrationRuntimeSettingsOut)
def get_slack_messaging_settings() -> SlackMessagingIntegrationRuntimeSettingsOut:
    return build_slack_messaging_integration_runtime_settings()


@admin_router.post("/slack/test-connection", response_model=SlackMessagingConnectionTestOut)
def test_slack_messaging_connection() -> SlackMessagingConnectionTestOut:
    try:
        return run_slack_messaging_connection_test()
    except SlackMessagingIntegrationError as exc:
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
