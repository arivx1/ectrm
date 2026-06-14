from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.messages.services.workspace import (
    MessagingWorkspaceError,
    create_messaging_workspace_post,
    list_messaging_workspace_state,
    to_messaging_workspace_message_out,
    update_messaging_workspace_post,
)
from apps.api.app.domains.integrations.services.slack_messaging import (
    SlackMessagingIntegrationError,
    build_slack_messaging_runtime_settings,
    create_slack_messaging_workspace_post,
    sync_slack_messaging_workspace,
)
from apps.api.app.schemas.messaging import (
    MessagingSlackRuntimeSettingsOut,
    MessagingSlackSyncResultOut,
    MessagingWorkspaceMessageOut,
    MessagingWorkspacePostCreate,
    MessagingWorkspacePostUpdate,
    MessagingWorkspaceStateOut,
)

router = APIRouter(prefix="/messages", tags=["messages"])


def _require_authenticated_actor(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=401, detail="Sign in before using the Slack messaging connector.")
    return actor_id


@router.get("/workspace", response_model=MessagingWorkspaceStateOut)
def get_messaging_workspace_state(
    db: Session = Depends(get_db),
) -> MessagingWorkspaceStateOut:
    return list_messaging_workspace_state(db)


@router.get("/workspace/slack/settings", response_model=MessagingSlackRuntimeSettingsOut)
def get_slack_messaging_settings() -> MessagingSlackRuntimeSettingsOut:
    return build_slack_messaging_runtime_settings()


@router.post("/workspace/slack/sync", response_model=MessagingSlackSyncResultOut)
def sync_workspace_slack_messages(
    request: Request,
    db: Session = Depends(get_db),
) -> MessagingSlackSyncResultOut:
    _require_authenticated_actor(request)
    try:
        return sync_slack_messaging_workspace(db)
    except (MessagingWorkspaceError, SlackMessagingIntegrationError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/workspace/slack/posts", response_model=MessagingWorkspaceMessageOut, status_code=status.HTTP_201_CREATED)
def create_workspace_slack_post(
    payload: MessagingWorkspacePostCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> MessagingWorkspaceMessageOut:
    actor_id = _require_authenticated_actor(request)
    try:
        record = create_slack_messaging_workspace_post(
            db,
            payload=payload,
            actor_id=actor_id,
            session_id=getattr(request.state, "session_id", None),
            actor_role=getattr(request.state, "actor_role", None),
        )
    except (MessagingWorkspaceError, SlackMessagingIntegrationError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_messaging_workspace_message_out(record)


@router.post("/workspace/posts", response_model=MessagingWorkspaceMessageOut, status_code=status.HTTP_201_CREATED)
def create_workspace_post(
    payload: MessagingWorkspacePostCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> MessagingWorkspaceMessageOut:
    try:
        record = create_messaging_workspace_post(
            db,
            payload=payload,
            actor_id=getattr(request.state, "actor_id", None),
            session_id=getattr(request.state, "session_id", None),
            actor_role=getattr(request.state, "actor_role", None),
        )
    except MessagingWorkspaceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_messaging_workspace_message_out(record)


@router.patch("/workspace/posts/{message_id}", response_model=MessagingWorkspaceMessageOut)
def update_workspace_post(
    message_id: str,
    payload: MessagingWorkspacePostUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> MessagingWorkspaceMessageOut:
    try:
        record = update_messaging_workspace_post(
            db,
            message_id=message_id,
            payload=payload,
            actor_id=getattr(request.state, "actor_id", None),
            session_id=getattr(request.state, "session_id", None),
            actor_role=getattr(request.state, "actor_role", None),
        )
    except MessagingWorkspaceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_messaging_workspace_message_out(record)
