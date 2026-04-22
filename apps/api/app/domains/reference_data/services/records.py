from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Optional, TypeVar

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id

ModelT = TypeVar("ModelT")


def normalize_code(value: str) -> str:
    return value.strip().upper()


def list_reference_records(
    db: Session,
    model: type[ModelT],
    q: Optional[str],
    is_active: Optional[bool],
    limit: int,
    offset: int,
    extra_filters: Optional[list[Any]] = None,
) -> list[ModelT]:
    stmt = select(model).order_by(model.code.asc()).limit(limit).offset(offset)

    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                model.code.ilike(pattern),
                model.name.ilike(pattern),
            )
        )
    if is_active is not None:
        stmt = stmt.where(model.is_active == is_active)
    if extra_filters:
        for filter_clause in extra_filters:
            stmt = stmt.where(filter_clause)

    return db.execute(stmt).scalars().all()


def get_reference_record(db: Session, model: type[ModelT], code: str) -> ModelT:
    record = db.execute(select(model).where(model.code == code)).scalars().first()
    if record is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return record


def create_reference_record(
    db: Session,
    model: type[ModelT],
    payload: Any,
    extra_values: Optional[dict[str, Any]] = None,
) -> ModelT:
    now = datetime.now(timezone.utc)
    values = dict(
        code=normalize_code(payload.code),
        name=payload.name.strip(),
        description=payload.description,
        is_active=True,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        created_at=now,
        created_by=resolve_audit_actor_id(payload.created_by),
        updated_at=now,
        updated_by=resolve_audit_actor_id(payload.created_by),
        version=1,
    )
    if extra_values:
        values.update(extra_values)

    record = model(**values)
    db.add(record)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(record)
    return record


def update_reference_record(
    record: Any,
    payload: Any,
    extra_updates: Optional[Callable[[Any, Any, set[str]], None]] = None,
) -> None:
    provided_fields = payload.model_fields_set

    if "name" in provided_fields and payload.name is not None:
        record.name = payload.name.strip()
    if "description" in provided_fields:
        record.description = payload.description
    if "effective_from" in provided_fields:
        record.effective_from = payload.effective_from
    if "effective_to" in provided_fields:
        record.effective_to = payload.effective_to
    if extra_updates is not None:
        extra_updates(record, payload, provided_fields)

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1


def set_reference_active_state(record: Any, is_active: bool, updated_by: str) -> None:
    record.is_active = is_active
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(updated_by)
    record.version += 1
