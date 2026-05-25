from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import (
    authenticate_user,
    authenticate_google_user,
    bootstrap_admin_token,
    create_user_session,
    hash_password,
    provision_single_user_auth_user,
    resolve_session_principal,
    revoke_user_session,
    touch_user_session,
)
from apps.api.app.deps.db import get_db
from apps.api.app.domains.assistant.personas import (
    default_assistant_persona_for_role,
    normalize_assistant_persona_key,
)
from apps.api.app.domains.reference_data.services.external_data.provider_sync import (
    run_login_triggered_market_data_syncs,
)
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.auth import (
    AuthenticatedUserOut,
    AuthenticatedUserProfileUpdate,
    BootstrapAdminRequest,
    CurrentSessionOut,
    GoogleSessionRequest,
    SessionLoginRequest,
    SessionOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/bootstrap-admin", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def bootstrap_admin_account(
    payload: BootstrapAdminRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> SessionOut:
    configured_token = bootstrap_admin_token()
    if not configured_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin bootstrap is not configured on this API.",
        )
    if payload.bootstrap_token.strip() != configured_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bootstrap token is invalid")

    user_count = db.execute(select(func.count()).select_from(UserAccount)).scalar_one()
    if user_count:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin bootstrap is no longer available")

    now = datetime.now(timezone.utc)
    user = UserAccount(
        user_id=payload.user_id,
        email=payload.email,
        display_name=payload.display_name,
        first_name=None,
        last_name=None,
        preferred_timezone=None,
        primary_location=None,
        role="OPS_ADMIN",
        default_assistant_persona=default_assistant_persona_for_role("OPS_ADMIN"),
        password_hash=hash_password(payload.password),
        is_active=True,
        last_login_at=now,
        created_at=now,
        created_by="bootstrap-admin",
        updated_at=now,
        updated_by="bootstrap-admin",
        version=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    session_record, access_token = create_user_session(db, user)
    _queue_login_market_data_sync(request, background_tasks, requested_by=user.user_id)
    return SessionOut(
        session_id=session_record.session_id,
        access_token=access_token,
        expires_at=session_record.expires_at,
        show_start_here=True,
        user=_to_authenticated_user(user),
    )


@router.post("/session", response_model=SessionOut)
def create_session(
    payload: SessionLoginRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> SessionOut:
    user = authenticate_user(
        db,
        identifier=payload.identifier,
        password=payload.password,
    )
    show_start_here = user.last_login_at is None
    user.last_login_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    user.updated_by = user.user_id
    user.version += 1
    db.commit()
    db.refresh(user)

    session_record, access_token = create_user_session(db, user)
    _queue_login_market_data_sync(request, background_tasks, requested_by=user.user_id)
    return SessionOut(
        session_id=session_record.session_id,
        access_token=access_token,
        expires_at=session_record.expires_at,
        show_start_here=show_start_here,
        user=_to_authenticated_user(user),
    )


@router.post("/single-user-session", response_model=SessionOut)
def create_single_user_session(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> SessionOut:
    user, show_start_here = provision_single_user_auth_user(db)
    session_record, access_token = create_user_session(db, user)
    _queue_login_market_data_sync(request, background_tasks, requested_by=user.user_id)
    return SessionOut(
        session_id=session_record.session_id,
        access_token=access_token,
        expires_at=session_record.expires_at,
        show_start_here=show_start_here,
        user=_to_authenticated_user(user),
    )


@router.post("/google-session", response_model=SessionOut)
def create_google_session(
    payload: GoogleSessionRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> SessionOut:
    user, show_start_here = authenticate_google_user(
        db,
        id_token=payload.id_token,
    )
    session_record, access_token = create_user_session(db, user)
    _queue_login_market_data_sync(request, background_tasks, requested_by=user.user_id)
    return SessionOut(
        session_id=session_record.session_id,
        access_token=access_token,
        expires_at=session_record.expires_at,
        show_start_here=show_start_here,
        user=_to_authenticated_user(user),
    )


@router.get("/me", response_model=CurrentSessionOut)
def get_current_session(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> CurrentSessionOut:
    principal = resolve_session_principal(db, request.headers.get("authorization"))
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")

    user = db.get(UserAccount, principal.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")

    touch_user_session(db, principal.session_id)
    _queue_login_market_data_sync(request, background_tasks, requested_by=user.user_id)
    return CurrentSessionOut(
        session_id=principal.session_id,
        expires_at=principal.expires_at,
        user=_to_authenticated_user(user),
    )


@router.patch("/me/profile", response_model=AuthenticatedUserOut)
def update_current_user_profile(
    payload: AuthenticatedUserProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthenticatedUserOut:
    principal = resolve_session_principal(db, request.headers.get("authorization"))
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")

    user = db.get(UserAccount, principal.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")

    if "display_name" in payload.model_fields_set and payload.display_name is not None:
        user.display_name = payload.display_name
    if "first_name" in payload.model_fields_set:
        user.first_name = payload.first_name
    if "last_name" in payload.model_fields_set:
        user.last_name = payload.last_name
    if "preferred_timezone" in payload.model_fields_set:
        user.preferred_timezone = payload.preferred_timezone
    if "primary_location" in payload.model_fields_set:
        user.primary_location = payload.primary_location
    if "default_assistant_persona" in payload.model_fields_set:
        user.default_assistant_persona = (
            payload.default_assistant_persona
            or default_assistant_persona_for_role(user.role)
        )
    if "assistant_context_blurb" in payload.model_fields_set:
        user.assistant_context_blurb = payload.assistant_context_blurb

    user.updated_at = datetime.now(timezone.utc)
    user.updated_by = user.user_id
    user.version += 1
    db.commit()
    db.refresh(user)
    return _to_authenticated_user(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout_current_session(request: Request, db: Session = Depends(get_db)) -> Response:
    principal = resolve_session_principal(db, request.headers.get("authorization"))
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    revoke_user_session(db, principal.session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/heartbeat", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def heartbeat_current_session(request: Request, db: Session = Depends(get_db)) -> Response:
    principal = resolve_session_principal(db, request.headers.get("authorization"))
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")

    touched = touch_user_session(db, principal.session_id)
    if touched is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _to_authenticated_user(user: UserAccount) -> AuthenticatedUserOut:
    return AuthenticatedUserOut(
        user_id=user.user_id,
        email=user.email,
        display_name=user.display_name,
        first_name=user.first_name,
        last_name=user.last_name,
        preferred_timezone=user.preferred_timezone,
        primary_location=user.primary_location,
        role=user.role,
        default_assistant_persona=(
            normalize_assistant_persona_key(user.default_assistant_persona)
            or default_assistant_persona_for_role(user.role)
        ),
        assistant_context_blurb=user.assistant_context_blurb,
    )


def _queue_login_market_data_sync(request: Request, background_tasks: BackgroundTasks, *, requested_by: str) -> None:
    session_factory = getattr(request.app.state, "session_factory", None)
    task_kwargs = {"requested_by": requested_by}
    if session_factory is not None:
        task_kwargs["session_factory"] = session_factory
    background_tasks.add_task(run_login_triggered_market_data_syncs, **task_kwargs)
