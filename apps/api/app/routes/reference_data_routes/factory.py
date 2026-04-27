from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.http import execute_http_action
from apps.api.app.domains.reference_data.services.records import (
    create_reference_record,
    get_reference_record,
    list_reference_records,
    normalize_code,
    set_reference_active_state,
    update_reference_record,
)

from .common import to_out


@dataclass(frozen=True, slots=True)
class ReferenceDataCrudSpec:
    model: type[Any]
    out_schema_cls: type[Any]
    duplicate_detail: str
    build_create_extra_values: Callable[[Session, Any], dict[str, Any]] | None = None
    validate_update: Callable[[Session, Any], None] | None = None
    update_extra_fields: Callable[[Session, Any, Any, set[str]], None] | None = None
    validate_deactivate: Callable[[Session, str], None] | None = None


def list_reference_collection(
    spec: ReferenceDataCrudSpec,
    *,
    db: Session,
    q: str | None,
    is_active: bool | None,
    limit: int,
    offset: int,
    extra_filters: list[Any] | None = None,
    search_columns: list[Any] | None = None,
) -> list[Any]:
    rows = list_reference_records(
        db,
        spec.model,
        q,
        is_active,
        limit,
        offset,
        extra_filters=extra_filters,
        search_columns=search_columns,
    )
    return [to_out(row, spec.out_schema_cls) for row in rows]


def create_reference_resource(
    spec: ReferenceDataCrudSpec,
    payload: Any,
    *,
    db: Session,
) -> Any:
    normalized_code = normalize_code(payload.code)
    existing = db.execute(
        select(spec.model).where(spec.model.code == normalized_code)
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=spec.duplicate_detail)

    extra_values = spec.build_create_extra_values(db, payload) if spec.build_create_extra_values else None
    record = create_reference_record(
        db,
        spec.model,
        payload,
        extra_values=extra_values,
    )
    return to_out(record, spec.out_schema_cls)


def get_reference_resource(
    spec: ReferenceDataCrudSpec,
    code: str,
    *,
    db: Session,
) -> Any:
    record = get_reference_record(db, spec.model, normalize_code(code))
    return to_out(record, spec.out_schema_cls)


def update_reference_resource(
    spec: ReferenceDataCrudSpec,
    code: str,
    payload: Any,
    *,
    db: Session,
) -> Any:
    record = get_reference_record(db, spec.model, normalize_code(code))

    def mutate_reference_record() -> Any:
        if spec.validate_update is not None:
            spec.validate_update(db, payload)
        update_reference_record(
            record,
            payload,
            extra_updates=(
                lambda current_record, current_payload, provided_fields: spec.update_extra_fields(
                    db,
                    current_record,
                    current_payload,
                    provided_fields,
                )
            )
            if spec.update_extra_fields is not None
            else None,
        )
        return record

    updated_record = execute_http_action(
        db,
        mutate_reference_record,
        commit=True,
    )
    db.refresh(updated_record)
    return to_out(updated_record, spec.out_schema_cls)


def set_reference_resource_active(
    spec: ReferenceDataCrudSpec,
    code: str,
    payload: Any,
    *,
    is_active: bool,
    db: Session,
) -> Any:
    record = get_reference_record(db, spec.model, normalize_code(code))

    def mutate_reference_record() -> Any:
        if not is_active and spec.validate_deactivate is not None:
            spec.validate_deactivate(db, record.code)
        set_reference_active_state(record, is_active, payload.updated_by)
        return record

    updated_record = execute_http_action(
        db,
        mutate_reference_record,
        commit=True,
    )
    db.refresh(updated_record)
    return to_out(updated_record, spec.out_schema_cls)
