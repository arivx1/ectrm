from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
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
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.auth import (
    AuthenticatedUserOut,
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
        role="OPS_ADMIN",
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
    return SessionOut(
        session_id=session_record.session_id,
        access_token=access_token,
        expires_at=session_record.expires_at,
        user=_to_authenticated_user(user),
    )


@router.post("/session", response_model=SessionOut)
def create_session(
    payload: SessionLoginRequest,
    db: Session = Depends(get_db),
) -> SessionOut:
    user = authenticate_user(
        db,
        identifier=payload.identifier,
        password=payload.password,
    )
    user.last_login_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    user.updated_by = user.user_id
    user.version += 1
    db.commit()
    db.refresh(user)

    session_record, access_token = create_user_session(db, user)
    return SessionOut(
        session_id=session_record.session_id,
        access_token=access_token,
        expires_at=session_record.expires_at,
        user=_to_authenticated_user(user),
    )


@router.post("/single-user-session", response_model=SessionOut)
def create_single_user_session(db: Session = Depends(get_db)) -> SessionOut:
    user = provision_single_user_auth_user(db)
    session_record, access_token = create_user_session(db, user)
    return SessionOut(
        session_id=session_record.session_id,
        access_token=access_token,
        expires_at=session_record.expires_at,
        user=_to_authenticated_user(user),
    )


@router.post("/google-session", response_model=SessionOut)
def create_google_session(
    payload: GoogleSessionRequest,
    db: Session = Depends(get_db),
) -> SessionOut:
    user = authenticate_google_user(
        db,
        id_token=payload.id_token,
    )
    session_record, access_token = create_user_session(db, user)
    return SessionOut(
        session_id=session_record.session_id,
        access_token=access_token,
        expires_at=session_record.expires_at,
        user=_to_authenticated_user(user),
    )


@router.get("/me", response_model=CurrentSessionOut)
def get_current_session(request: Request, db: Session = Depends(get_db)) -> CurrentSessionOut:
    principal = resolve_session_principal(db, request.headers.get("authorization"))
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")

    user = db.get(UserAccount, principal.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")

    touch_user_session(db, principal.session_id)
    return CurrentSessionOut(
        session_id=principal.session_id,
        expires_at=principal.expires_at,
        user=_to_authenticated_user(user),
    )


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
        role=user.role,
    )
