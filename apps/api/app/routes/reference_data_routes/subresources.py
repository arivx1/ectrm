from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.core.http import execute_http_action
from apps.api.app.domains.reference_data.services.records import get_reference_record, normalize_code


@dataclass(frozen=True, slots=True)
class OwnedReferenceSubresourceSpec:
    parent_model: type[Any]
    record_model: type[Any]
    owner_field_name: str
    to_out: Callable[[Any], Any]
    build_default_record: Callable[[str, datetime, str], Any]
    list_order_by: tuple[Any, ...] = ()


@dataclass(frozen=True, slots=True)
class ReferenceCollectionQuerySpec:
    build_stmt: Callable[..., Any]
    to_out: Callable[[Any], Any]
    reduce_rows: Callable[[list[Any]], list[Any]] | None = None


def require_owned_reference_parent_code(
    spec: OwnedReferenceSubresourceSpec,
    code: str,
    *,
    db: Session,
) -> str:
    normalized_code = normalize_code(code)
    get_reference_record(db, spec.parent_model, normalized_code)
    return normalized_code


def list_owned_reference_collection(
    spec: OwnedReferenceSubresourceSpec,
    *,
    db: Session,
    limit: int,
    offset: int,
) -> list[Any]:
    stmt = select(spec.record_model)
    if spec.list_order_by:
        stmt = stmt.order_by(*spec.list_order_by)
    stmt = stmt.limit(limit).offset(offset)
    rows = db.execute(stmt).scalars().all()
    return [spec.to_out(row) for row in rows]


def list_reference_collection_query(
    spec: ReferenceCollectionQuerySpec,
    *,
    db: Session,
    limit: int,
    offset: int,
    **kwargs: Any,
) -> list[Any]:
    stmt = spec.build_stmt(db=db, **kwargs)
    if spec.reduce_rows is None:
        stmt = stmt.limit(limit).offset(offset)
        rows = db.execute(stmt).scalars().all()
    else:
        rows = db.execute(stmt).scalars().all()
        rows = spec.reduce_rows(rows)
        rows = rows[offset : offset + limit]
    return [spec.to_out(row) for row in rows]


def get_scoped_subresource_record(
    *,
    db: Session,
    model: type[Any],
    record_id: Any,
    owner_field_name: str,
    owner_code: str,
    not_found_detail: str,
) -> Any:
    record = db.get(model, record_id)
    if record is None or getattr(record, owner_field_name) != owner_code:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail)
    return record


def upsert_owned_reference_record(
    spec: OwnedReferenceSubresourceSpec,
    code: str,
    payload: Any,
    *,
    db: Session,
    mutate_record: Callable[[Session, Any, Any], None],
    owner_is_normalized: bool = False,
) -> Any:
    owner_code = (
        code
        if owner_is_normalized
        else require_owned_reference_parent_code(spec, code, db=db)
    )
    owner_field = getattr(spec.record_model, spec.owner_field_name)
    record = db.execute(
        select(spec.record_model).where(owner_field == owner_code)
    ).scalars().first()

    def mutate_owned_record() -> Any:
        nonlocal record
        actor_id = resolve_audit_actor_id(payload.updated_by)
        now = datetime.now(timezone.utc)
        if record is None:
            record = spec.build_default_record(owner_code, now, actor_id)
            db.add(record)
        else:
            record.updated_at = now
            record.updated_by = actor_id
            record.version += 1
        mutate_record(db, record, payload)
        return record

    updated_record = execute_http_action(
        db,
        mutate_owned_record,
        commit=True,
    )
    db.refresh(updated_record)
    return spec.to_out(updated_record)
