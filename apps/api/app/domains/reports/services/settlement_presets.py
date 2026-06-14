from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.schemas.report import (
    SettlementReportPresetCreate,
    SettlementReportPresetOut,
    SettlementReportPresetUpdate,
    SettlementReportFilters,
)

SETTLEMENT_PRESET_KEY = "settlement"
SETTLEMENT_SHARED_OWNER_KEY = "__shared__"


class SettlementReportPresetConflictError(ValueError):
    pass


class SettlementReportPresetPermissionError(PermissionError):
    pass


class SettlementReportPresetNotFoundError(LookupError):
    pass


def settlement_preset_scope_owner_key(scope: str, *, owner_user_id: str) -> str:
    return SETTLEMENT_SHARED_OWNER_KEY if scope == "SHARED" else owner_user_id


def settlement_preset_name_key(name: str) -> str:
    return name.strip().casefold()


def can_manage_settlement_preset(record: ReportPreset, *, actor_id: str, actor_role: str | None) -> bool:
    return record.created_by == actor_id or is_admin_role(actor_role)


def visible_settlement_presets_stmt(actor_id: str):
    return select(ReportPreset).where(
        ReportPreset.preset_key == SETTLEMENT_PRESET_KEY,
        or_(
            ReportPreset.scope_owner_key == actor_id,
            ReportPreset.scope_owner_key == SETTLEMENT_SHARED_OWNER_KEY,
        ),
    )


def list_visible_settlement_presets(db: Session, *, actor_id: str) -> list[ReportPreset]:
    return db.execute(
        visible_settlement_presets_stmt(actor_id).order_by(ReportPreset.scope.asc(), ReportPreset.name.asc())
    ).scalars().all()


def get_visible_settlement_preset(
    db: Session,
    *,
    actor_id: str,
    preset_id: int,
) -> ReportPreset | None:
    return db.execute(
        visible_settlement_presets_stmt(actor_id).where(ReportPreset.id == preset_id)
    ).scalars().first()


def find_settlement_preset_by_scope_name(
    db: Session,
    *,
    owner_user_id: str,
    scope: str,
    name: str,
) -> ReportPreset | None:
    scope_owner_key = settlement_preset_scope_owner_key(scope, owner_user_id=owner_user_id)
    name_key = settlement_preset_name_key(name)
    return db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == SETTLEMENT_PRESET_KEY,
            ReportPreset.scope_owner_key == scope_owner_key,
            ReportPreset.name_key == name_key,
        )
    ).scalars().first()


def to_settlement_preset_out(
    record: ReportPreset,
    *,
    actor_id: str,
    actor_role: str | None,
) -> SettlementReportPresetOut:
    return SettlementReportPresetOut(
        preset_id=record.id,
        preset_key="settlement",
        name=record.name,
        scope=record.scope,
        filters=SettlementReportFilters.model_validate(record.filters_json or {}),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=can_manage_settlement_preset(record, actor_id=actor_id, actor_role=actor_role),
    )


def create_settlement_report_preset(
    db: Session,
    *,
    owner_user_id: str,
    payload: SettlementReportPresetCreate,
) -> ReportPreset:
    existing = find_settlement_preset_by_scope_name(
        db,
        owner_user_id=owner_user_id,
        scope=payload.scope,
        name=payload.name,
    )
    if existing is not None:
        raise SettlementReportPresetConflictError(
            f"Settlement preset '{payload.name}' already exists for this scope."
        )

    now = datetime.now(timezone.utc)
    scope_owner_key = settlement_preset_scope_owner_key(payload.scope, owner_user_id=owner_user_id)
    record = ReportPreset(
        preset_key=SETTLEMENT_PRESET_KEY,
        scope=payload.scope,
        scope_owner_key=scope_owner_key,
        name=payload.name,
        name_key=settlement_preset_name_key(payload.name),
        filters_json=payload.filters.model_dump(exclude_none=True),
        created_at=now,
        created_by=owner_user_id,
        updated_at=now,
        updated_by=owner_user_id,
        version=1,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_settlement_report_preset(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    preset_id: int,
    payload: SettlementReportPresetUpdate,
) -> ReportPreset:
    record = get_visible_settlement_preset(db, actor_id=actor_id, preset_id=preset_id)
    if record is None:
        raise SettlementReportPresetNotFoundError("Settlement preset was not found.")
    if not can_manage_settlement_preset(record, actor_id=actor_id, actor_role=actor_role):
        raise SettlementReportPresetPermissionError("You do not have permission to edit this preset.")

    next_scope = payload.scope or record.scope
    next_name = payload.name or record.name
    next_scope_owner_key = settlement_preset_scope_owner_key(next_scope, owner_user_id=actor_id)
    next_name_key = settlement_preset_name_key(next_name)

    duplicate = db.execute(
        select(ReportPreset).where(
            ReportPreset.preset_key == SETTLEMENT_PRESET_KEY,
            ReportPreset.scope_owner_key == next_scope_owner_key,
            ReportPreset.name_key == next_name_key,
            ReportPreset.id != record.id,
        )
    ).scalars().first()
    if duplicate is not None:
        raise SettlementReportPresetConflictError(
            f"Settlement preset '{next_name}' already exists for this scope."
        )

    if payload.name is not None:
        record.name = payload.name
        record.name_key = next_name_key
    if payload.scope is not None:
        record.scope = next_scope
        record.scope_owner_key = next_scope_owner_key
    if payload.filters is not None:
        record.filters_json = payload.filters.model_dump(exclude_none=True)

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def delete_settlement_report_preset(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    preset_id: int,
) -> bool:
    record = get_visible_settlement_preset(db, actor_id=actor_id, preset_id=preset_id)
    if record is None:
        return False
    if not can_manage_settlement_preset(record, actor_id=actor_id, actor_role=actor_role):
        raise SettlementReportPresetPermissionError("You do not have permission to delete this preset.")

    db.delete(record)
    db.commit()
    return True
