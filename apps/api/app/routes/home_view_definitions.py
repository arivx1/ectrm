from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.home_views.services.definitions import (
    HomeViewDefinitionConflictError,
    HomeViewDefinitionNotFoundError,
    HomeViewDefinitionPermissionError,
    HomeViewDefinitionValidationError,
    build_home_system_template,
    create_home_view_definition,
    delete_home_view_definition,
    get_visible_home_view_definition,
    list_visible_home_view_definitions,
    reset_home_view_definition,
    to_home_view_definition_out,
    update_home_view_definition,
)
from apps.api.app.schemas.home_view import (
    HomeViewDefinitionCreate,
    HomeViewDefinitionOut,
    HomeViewDefinitionUpdate,
    HomeViewSystemTemplateOut,
)

router = APIRouter(prefix="/home-view-definitions", tags=["home-view-definitions"])


def _require_authenticated_actor(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return actor_id


def _authenticated_actor_role(request: Request) -> str | None:
    role = getattr(request.state, "actor_role", None)
    return role if isinstance(role, str) else None


@router.get("/system-template", response_model=HomeViewSystemTemplateOut)
def get_home_system_template(request: Request) -> HomeViewSystemTemplateOut:
    _require_authenticated_actor(request)
    return build_home_system_template()


@router.get("", response_model=list[HomeViewDefinitionOut])
def get_home_view_definitions(
    request: Request,
    db: Session = Depends(get_db),
) -> list[HomeViewDefinitionOut]:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    records = list_visible_home_view_definitions(db, actor_id=actor_id)
    return [
        to_home_view_definition_out(record, actor_id=actor_id, actor_role=actor_role)
        for record in records
    ]


@router.post("", response_model=HomeViewDefinitionOut, status_code=status.HTTP_201_CREATED)
def create_home_view(
    payload: HomeViewDefinitionCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> HomeViewDefinitionOut:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    try:
        record = create_home_view_definition(db, owner_user_id=actor_id, payload=payload)
    except HomeViewDefinitionConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except HomeViewDefinitionValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return to_home_view_definition_out(record, actor_id=actor_id, actor_role=actor_role)


@router.get("/{definition_id}", response_model=HomeViewDefinitionOut)
def get_home_view_definition(
    definition_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> HomeViewDefinitionOut:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    record = get_visible_home_view_definition(db, actor_id=actor_id, definition_id=definition_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Home view definition was not found.")
    return to_home_view_definition_out(record, actor_id=actor_id, actor_role=actor_role)


@router.patch("/{definition_id}", response_model=HomeViewDefinitionOut)
def update_home_view(
    definition_id: int,
    payload: HomeViewDefinitionUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> HomeViewDefinitionOut:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    try:
        record = update_home_view_definition(
            db,
            actor_id=actor_id,
            actor_role=actor_role,
            definition_id=definition_id,
            payload=payload,
        )
    except HomeViewDefinitionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except HomeViewDefinitionPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except HomeViewDefinitionConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except HomeViewDefinitionValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return to_home_view_definition_out(record, actor_id=actor_id, actor_role=actor_role)


@router.post("/{definition_id}/reset", response_model=HomeViewDefinitionOut)
def reset_home_view(
    definition_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> HomeViewDefinitionOut:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    try:
        record = reset_home_view_definition(
            db,
            actor_id=actor_id,
            actor_role=actor_role,
            definition_id=definition_id,
        )
    except HomeViewDefinitionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except HomeViewDefinitionPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return to_home_view_definition_out(record, actor_id=actor_id, actor_role=actor_role)


@router.delete("/{definition_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_home_view(
    definition_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    actor_id = _require_authenticated_actor(request)
    actor_role = _authenticated_actor_role(request)
    try:
        delete_home_view_definition(
            db,
            actor_id=actor_id,
            actor_role=actor_role,
            definition_id=definition_id,
        )
    except HomeViewDefinitionPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
