from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.messages.services.workspace import (
    MessagingWorkspaceError,
    create_messaging_workspace_post,
    list_messaging_workspace_state,
    to_messaging_workspace_message_out,
)
from apps.api.app.schemas.messaging import (
    MessagingWorkspaceMessageOut,
    MessagingWorkspacePostCreate,
    MessagingWorkspaceStateOut,
)

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/workspace", response_model=MessagingWorkspaceStateOut)
def get_messaging_workspace_state(
    db: Session = Depends(get_db),
) -> MessagingWorkspaceStateOut:
    return list_messaging_workspace_state(db)


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
