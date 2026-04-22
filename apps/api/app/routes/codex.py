from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_session_principal
from apps.api.app.core.query_params import ADMIN_LIST_LIMIT_QUERY, LIST_OFFSET_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.codex.services.tasks import (
    CodexTaskCallbackError,
    CodexTaskDispatchError,
    build_codex_task_settings,
    create_codex_task,
    list_codex_tasks,
    to_codex_task_out,
    update_codex_task_from_callback,
)
from apps.api.app.schemas.codex import CodexTaskCallback, CodexTaskCreate, CodexTaskOut, CodexTaskSettingsOut

router = APIRouter(prefix="/admin/codex", tags=["codex-admin"])
callback_router = APIRouter(prefix="/codex", tags=["codex-callback"])


@router.get("/settings", response_model=CodexTaskSettingsOut)
def get_codex_task_settings() -> CodexTaskSettingsOut:
    return build_codex_task_settings()


@router.get("/tasks", response_model=list[CodexTaskOut])
def list_admin_codex_tasks(
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[CodexTaskOut]:
    return [to_codex_task_out(record) for record in list_codex_tasks(db, limit=limit, offset=offset)]


@router.post("/tasks", response_model=CodexTaskOut, status_code=201)
async def create_admin_codex_task(
    payload: CodexTaskCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> CodexTaskOut:
    principal = resolve_session_principal(db, request.headers.get("authorization"))
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication is required")

    try:
        record = await create_codex_task(
            db=db,
            payload=payload,
            requested_by=principal.user_id,
            requester_role=principal.role,
        )
    except CodexTaskDispatchError as exc:
        raise HTTPException(status_code=409, detail=exc.detail) from exc
    return to_codex_task_out(record)


@callback_router.post("/tasks/{task_id}/callback", response_model=CodexTaskOut)
def receive_codex_task_callback(
    task_id: int,
    payload: CodexTaskCallback,
    request: Request,
    db: Session = Depends(get_db),
) -> CodexTaskOut:
    callback_token = request.headers.get("x-codex-callback-token") or request.headers.get("authorization")
    try:
        record = update_codex_task_from_callback(
            db,
            task_id=task_id,
            payload=payload,
            callback_token=callback_token,
        )
    except CodexTaskCallbackError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_codex_task_out(record)
