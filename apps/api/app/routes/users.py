from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.api.app.core.auth import hash_password, resolve_audit_actor_id
from apps.api.app.core.query_params import ADMIN_LIST_LIMIT_QUERY, LIST_OFFSET_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.assistant.personas import (
    default_assistant_persona_for_role,
    normalize_assistant_persona_key,
)
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.user_account import (
    UserAccountCreate,
    UserAccountOut,
    UserAccountStatusUpdate,
    UserAccountUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserAccountOut])
def list_users(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[UserAccountOut]:
    stmt = select(UserAccount).order_by(UserAccount.display_name.asc()).limit(limit).offset(offset)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                UserAccount.user_id.ilike(pattern),
                UserAccount.display_name.ilike(pattern),
                UserAccount.email.ilike(pattern),
                UserAccount.role.ilike(pattern),
                UserAccount.default_assistant_persona.ilike(pattern),
            )
        )
    if is_active is not None:
        stmt = stmt.where(UserAccount.is_active.is_(is_active))
    return [_to_out(row) for row in db.execute(stmt).scalars().all()]


@router.post("", response_model=UserAccountOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserAccountCreate, db: Session = Depends(get_db)) -> UserAccountOut:
    existing = db.execute(
        select(UserAccount).where(
            (UserAccount.user_id == payload.user_id) | (UserAccount.email == payload.email)
        )
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    now = datetime.now(timezone.utc)
    actor_id = resolve_audit_actor_id(payload.created_by)
    record = UserAccount(
        user_id=payload.user_id,
        email=payload.email,
        display_name=payload.display_name,
        role=payload.role,
        default_assistant_persona=(
            payload.default_assistant_persona
            or default_assistant_persona_for_role(payload.role)
        ),
        password_hash=hash_password(payload.password),
        is_active=True,
        last_login_at=payload.last_login_at,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists") from exc
    db.refresh(record)
    return _to_out(record)


@router.get("/{user_id}", response_model=UserAccountOut)
def get_user(user_id: str, db: Session = Depends(get_db)) -> UserAccountOut:
    record = db.get(UserAccount, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_out(record)


@router.put("/{user_id}", response_model=UserAccountOut)
def update_user(user_id: str, payload: UserAccountUpdate, db: Session = Depends(get_db)) -> UserAccountOut:
    record = db.get(UserAccount, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        existing = db.execute(
            select(UserAccount).where(
                UserAccount.email == payload.email,
                UserAccount.user_id != user_id,
            )
        ).scalars().first()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
        record.email = payload.email

    if payload.display_name is not None:
        record.display_name = payload.display_name
    if payload.role is not None:
        record.role = payload.role
    if payload.default_assistant_persona is not None:
        record.default_assistant_persona = payload.default_assistant_persona
    elif normalize_assistant_persona_key(record.default_assistant_persona) is None:
        record.default_assistant_persona = default_assistant_persona_for_role(record.role)
    if payload.password is not None:
        record.password_hash = hash_password(payload.password)
    if payload.last_login_at is not None:
        record.last_login_at = payload.last_login_at

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use") from exc
    db.refresh(record)
    return _to_out(record)


@router.post("/{user_id}/deactivate", response_model=UserAccountOut)
def deactivate_user(
    user_id: str,
    payload: UserAccountStatusUpdate,
    db: Session = Depends(get_db),
) -> UserAccountOut:
    record = db.get(UserAccount, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="User not found")
    record.is_active = False
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_out(record)


@router.post("/{user_id}/reactivate", response_model=UserAccountOut)
def reactivate_user(
    user_id: str,
    payload: UserAccountStatusUpdate,
    db: Session = Depends(get_db),
) -> UserAccountOut:
    record = db.get(UserAccount, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="User not found")
    record.is_active = True
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    db.commit()
    db.refresh(record)
    return _to_out(record)


def _to_out(record: UserAccount) -> UserAccountOut:
    return UserAccountOut(
        user_id=record.user_id,
        email=record.email,
        display_name=record.display_name,
        role=record.role,
        default_assistant_persona=(
            normalize_assistant_persona_key(record.default_assistant_persona)
            or default_assistant_persona_for_role(record.role)
        ),
        is_active=record.is_active,
        password_set=bool(record.password_hash),
        last_login_at=record.last_login_at,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )
