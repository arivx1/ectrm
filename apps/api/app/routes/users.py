from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
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
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
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
            )
        )
    if is_active is not None:
        stmt = stmt.where(UserAccount.is_active.is_(is_active))
    return [_to_out(row) for row in db.execute(stmt).scalars().all()]


@router.post("", response_model=UserAccountOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserAccountCreate, db: Session = Depends(get_db)) -> UserAccountOut:
    existing = db.execute(
        select(UserAccount).where(
            (UserAccount.user_id == payload.user_id) | (UserAccount.email == payload.email.lower())
        )
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    now = datetime.now(timezone.utc)
    record = UserAccount(
        user_id=payload.user_id.strip(),
        email=payload.email.strip().lower(),
        display_name=payload.display_name.strip(),
        role=payload.role.strip().upper(),
        is_active=True,
        last_login_at=payload.last_login_at,
        created_at=now,
        created_by=payload.created_by.strip(),
        updated_at=now,
        updated_by=payload.created_by.strip(),
        version=1,
    )
    db.add(record)
    db.commit()
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
        normalized_email = payload.email.strip().lower()
        existing = db.execute(
            select(UserAccount).where(
                UserAccount.email == normalized_email,
                UserAccount.user_id != user_id,
            )
        ).scalars().first()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
        record.email = normalized_email

    if payload.display_name is not None:
        record.display_name = payload.display_name.strip()
    if payload.role is not None:
        record.role = payload.role.strip().upper()
    if payload.last_login_at is not None:
        record.last_login_at = payload.last_login_at

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = payload.updated_by.strip()
    record.version += 1
    db.commit()
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
    record.updated_by = payload.updated_by.strip()
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
    record.updated_by = payload.updated_by.strip()
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
        is_active=record.is_active,
        last_login_at=record.last_login_at,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )
