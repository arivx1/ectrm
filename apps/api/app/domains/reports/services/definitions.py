from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role
from apps.api.app.domains.reports.services.definition_validation import (
    validate_report_definition_draft,
    validate_workbook_definition_draft,
)
from apps.api.app.models.report_definition import ReportDefinition
from apps.api.app.models.workbook_definition import WorkbookDefinition
from apps.api.app.schemas.report import (
    ReportDefinitionDraft,
    ReportDefinitionRecordOut,
    ReportDefinitionValidationResult,
    WorkbookDefinitionDraft,
    WorkbookDefinitionRecordOut,
)

REPORT_SCOPE_TEAM_OWNER_KEY = "__team__"
REPORT_SCOPE_GLOBAL_OWNER_KEY = "__global__"
REPORT_SHARED_SCOPES = frozenset({"team", "global"})
REPORT_LIFECYCLE_DRAFT = "draft"
REPORT_LIFECYCLE_PUBLISHED = "published"
REPORT_LIFECYCLE_RETIRED = "retired"


class ReportDefinitionConflictError(ValueError):
    pass


class ReportDefinitionPermissionError(PermissionError):
    pass


class ReportDefinitionNotFoundError(LookupError):
    pass


class ReportDefinitionLifecycleError(ValueError):
    pass


class ReportDefinitionValidationError(ValueError):
    def __init__(self, message: str, validation_result: ReportDefinitionValidationResult) -> None:
        super().__init__(message)
        self.validation_result = validation_result


def definition_scope_owner_key(scope: str, *, owner_user_id: str) -> str:
    if scope == "team":
        return REPORT_SCOPE_TEAM_OWNER_KEY
    if scope == "global":
        return REPORT_SCOPE_GLOBAL_OWNER_KEY
    return owner_user_id


def _can_manage_definition(
    *,
    created_by: str,
    actor_id: str,
    actor_role: str | None,
) -> bool:
    return created_by == actor_id or is_admin_role(actor_role)


def can_edit_report_definition(
    record: ReportDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> bool:
    return record.lifecycle_status == REPORT_LIFECYCLE_DRAFT and _can_manage_definition(
        created_by=record.created_by,
        actor_id=actor_id,
        actor_role=actor_role,
    )


def can_publish_report_definition(
    record: ReportDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> bool:
    if record.lifecycle_status != REPORT_LIFECYCLE_DRAFT:
        return False
    if record.scope in REPORT_SHARED_SCOPES:
        return is_admin_role(actor_role)
    return _can_manage_definition(created_by=record.created_by, actor_id=actor_id, actor_role=actor_role)


def can_retire_report_definition(
    record: ReportDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> bool:
    if record.lifecycle_status == REPORT_LIFECYCLE_RETIRED:
        return False
    if record.scope in REPORT_SHARED_SCOPES:
        return is_admin_role(actor_role)
    return _can_manage_definition(created_by=record.created_by, actor_id=actor_id, actor_role=actor_role)


def can_edit_workbook_definition(
    record: WorkbookDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> bool:
    return record.lifecycle_status == REPORT_LIFECYCLE_DRAFT and _can_manage_definition(
        created_by=record.created_by,
        actor_id=actor_id,
        actor_role=actor_role,
    )


def can_publish_workbook_definition(
    record: WorkbookDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> bool:
    if record.lifecycle_status != REPORT_LIFECYCLE_DRAFT:
        return False
    if record.scope in REPORT_SHARED_SCOPES:
        return is_admin_role(actor_role)
    return _can_manage_definition(created_by=record.created_by, actor_id=actor_id, actor_role=actor_role)


def can_retire_workbook_definition(
    record: WorkbookDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> bool:
    if record.lifecycle_status == REPORT_LIFECYCLE_RETIRED:
        return False
    if record.scope in REPORT_SHARED_SCOPES:
        return is_admin_role(actor_role)
    return _can_manage_definition(created_by=record.created_by, actor_id=actor_id, actor_role=actor_role)


def _ensure_valid_definition(validation_result: ReportDefinitionValidationResult) -> None:
    if validation_result.valid:
        return
    raise ReportDefinitionValidationError("Report definition validation failed.", validation_result)


def _serialize_report_definition(definition: ReportDefinitionDraft) -> dict[str, object]:
    return definition.model_dump(mode="json")


def _serialize_workbook_definition(definition: WorkbookDefinitionDraft) -> dict[str, object]:
    return definition.model_dump(mode="json")


def _serialize_validation(validation_result: ReportDefinitionValidationResult) -> dict[str, object]:
    return validation_result.model_dump(mode="json")


def _visible_report_definitions_stmt(actor_id: str, actor_role: str | None):
    stmt = select(ReportDefinition)
    if is_admin_role(actor_role):
        return stmt
    return stmt.where(
        or_(
            ReportDefinition.created_by == actor_id,
            and_(
                ReportDefinition.scope.in_(tuple(REPORT_SHARED_SCOPES)),
                ReportDefinition.lifecycle_status == REPORT_LIFECYCLE_PUBLISHED,
            ),
        )
    )


def _visible_workbook_definitions_stmt(actor_id: str, actor_role: str | None):
    stmt = select(WorkbookDefinition)
    if is_admin_role(actor_role):
        return stmt
    return stmt.where(
        or_(
            WorkbookDefinition.created_by == actor_id,
            and_(
                WorkbookDefinition.scope.in_(tuple(REPORT_SHARED_SCOPES)),
                WorkbookDefinition.lifecycle_status == REPORT_LIFECYCLE_PUBLISHED,
            ),
        )
    )


def _find_report_definition_duplicate(
    db: Session,
    *,
    report_key: str,
    scope_owner_key: str,
    exclude_id: int | None = None,
) -> ReportDefinition | None:
    stmt = select(ReportDefinition).where(
        ReportDefinition.report_key == report_key,
        ReportDefinition.scope_owner_key == scope_owner_key,
    )
    if exclude_id is not None:
        stmt = stmt.where(ReportDefinition.id != exclude_id)
    return db.execute(stmt).scalars().first()


def _find_workbook_definition_duplicate(
    db: Session,
    *,
    workbook_key: str,
    scope_owner_key: str,
    exclude_id: int | None = None,
) -> WorkbookDefinition | None:
    stmt = select(WorkbookDefinition).where(
        WorkbookDefinition.workbook_key == workbook_key,
        WorkbookDefinition.scope_owner_key == scope_owner_key,
    )
    if exclude_id is not None:
        stmt = stmt.where(WorkbookDefinition.id != exclude_id)
    return db.execute(stmt).scalars().first()


def list_visible_report_definitions(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
) -> list[ReportDefinition]:
    return db.execute(
        _visible_report_definitions_stmt(actor_id, actor_role)
        .order_by(ReportDefinition.lifecycle_status.asc(), ReportDefinition.name.asc())
    ).scalars().all()


def get_visible_report_definition(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> ReportDefinition | None:
    return db.execute(
        _visible_report_definitions_stmt(actor_id, actor_role).where(ReportDefinition.id == definition_id)
    ).scalars().first()


def create_report_definition_record(
    db: Session,
    *,
    actor_id: str,
    definition: ReportDefinitionDraft,
) -> ReportDefinition:
    validation_result = validate_report_definition_draft(definition)
    _ensure_valid_definition(validation_result)

    scope_owner_key = definition_scope_owner_key(definition.scope, owner_user_id=actor_id)
    if _find_report_definition_duplicate(
        db,
        report_key=definition.report_key,
        scope_owner_key=scope_owner_key,
    ):
        raise ReportDefinitionConflictError(
            f"Report definition '{definition.report_key}' already exists for this scope."
        )

    now = datetime.now(timezone.utc)
    record = ReportDefinition(
        report_key=definition.report_key,
        name=definition.name,
        description=definition.description,
        scope=definition.scope,
        scope_owner_key=scope_owner_key,
        lifecycle_status=REPORT_LIFECYCLE_DRAFT,
        definition_json=_serialize_report_definition(definition),
        validation_json=_serialize_validation(validation_result),
        referenced_dataset_ids=validation_result.referenced_dataset_ids,
        definition_version=1,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_report_definition_record(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
    definition: ReportDefinitionDraft,
) -> ReportDefinition:
    record = get_visible_report_definition(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        definition_id=definition_id,
    )
    if record is None:
        raise ReportDefinitionNotFoundError("Report definition was not found.")
    if not can_edit_report_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise ReportDefinitionPermissionError("You do not have permission to edit this report definition.")

    validation_result = validate_report_definition_draft(definition)
    _ensure_valid_definition(validation_result)

    scope_owner_key = definition_scope_owner_key(definition.scope, owner_user_id=record.created_by)
    if _find_report_definition_duplicate(
        db,
        report_key=definition.report_key,
        scope_owner_key=scope_owner_key,
        exclude_id=record.id,
    ):
        raise ReportDefinitionConflictError(
            f"Report definition '{definition.report_key}' already exists for this scope."
        )

    record.report_key = definition.report_key
    record.name = definition.name
    record.description = definition.description
    record.scope = definition.scope
    record.scope_owner_key = scope_owner_key
    record.definition_json = _serialize_report_definition(definition)
    record.validation_json = _serialize_validation(validation_result)
    record.referenced_dataset_ids = validation_result.referenced_dataset_ids
    record.definition_version += 1
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def publish_report_definition_record(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> ReportDefinition:
    record = get_visible_report_definition(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        definition_id=definition_id,
    )
    if record is None:
        raise ReportDefinitionNotFoundError("Report definition was not found.")
    if record.lifecycle_status != REPORT_LIFECYCLE_DRAFT:
        raise ReportDefinitionLifecycleError("Only draft report definitions can be published.")
    if not can_publish_report_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise ReportDefinitionPermissionError("You do not have permission to publish this report definition.")

    definition = ReportDefinitionDraft.model_validate(record.definition_json)
    validation_result = validate_report_definition_draft(definition)
    _ensure_valid_definition(validation_result)

    now = datetime.now(timezone.utc)
    record.lifecycle_status = REPORT_LIFECYCLE_PUBLISHED
    record.validation_json = _serialize_validation(validation_result)
    record.referenced_dataset_ids = validation_result.referenced_dataset_ids
    record.published_at = now
    record.published_by = actor_id
    record.updated_at = now
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def retire_report_definition_record(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> ReportDefinition:
    record = get_visible_report_definition(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        definition_id=definition_id,
    )
    if record is None:
        raise ReportDefinitionNotFoundError("Report definition was not found.")
    if record.lifecycle_status == REPORT_LIFECYCLE_RETIRED:
        raise ReportDefinitionLifecycleError("Report definition is already retired.")
    if not can_retire_report_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise ReportDefinitionPermissionError("You do not have permission to retire this report definition.")

    now = datetime.now(timezone.utc)
    record.lifecycle_status = REPORT_LIFECYCLE_RETIRED
    record.retired_at = now
    record.retired_by = actor_id
    record.updated_at = now
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def to_report_definition_out(
    record: ReportDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> ReportDefinitionRecordOut:
    return ReportDefinitionRecordOut(
        definition_id=record.id,
        report_key=record.report_key,
        name=record.name,
        description=record.description,
        scope=record.scope,
        lifecycle_status=record.lifecycle_status,
        definition_version=record.definition_version,
        version=record.version,
        definition=ReportDefinitionDraft.model_validate(record.definition_json),
        validation_result=ReportDefinitionValidationResult.model_validate(record.validation_json),
        referenced_dataset_ids=list(record.referenced_dataset_ids or []),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        published_at=record.published_at,
        published_by=record.published_by,
        retired_at=record.retired_at,
        retired_by=record.retired_by,
        can_edit=can_edit_report_definition(record, actor_id=actor_id, actor_role=actor_role),
        can_publish=can_publish_report_definition(record, actor_id=actor_id, actor_role=actor_role),
        can_retire=can_retire_report_definition(record, actor_id=actor_id, actor_role=actor_role),
    )


def list_visible_workbook_definitions(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
) -> list[WorkbookDefinition]:
    return db.execute(
        _visible_workbook_definitions_stmt(actor_id, actor_role)
        .order_by(WorkbookDefinition.lifecycle_status.asc(), WorkbookDefinition.name.asc())
    ).scalars().all()


def get_visible_workbook_definition(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> WorkbookDefinition | None:
    return db.execute(
        _visible_workbook_definitions_stmt(actor_id, actor_role).where(WorkbookDefinition.id == definition_id)
    ).scalars().first()


def create_workbook_definition_record(
    db: Session,
    *,
    actor_id: str,
    definition: WorkbookDefinitionDraft,
) -> WorkbookDefinition:
    validation_result = validate_workbook_definition_draft(definition)
    _ensure_valid_definition(validation_result)

    scope_owner_key = definition_scope_owner_key(definition.scope, owner_user_id=actor_id)
    if _find_workbook_definition_duplicate(
        db,
        workbook_key=definition.workbook_key,
        scope_owner_key=scope_owner_key,
    ):
        raise ReportDefinitionConflictError(
            f"Workbook definition '{definition.workbook_key}' already exists for this scope."
        )

    now = datetime.now(timezone.utc)
    record = WorkbookDefinition(
        workbook_key=definition.workbook_key,
        name=definition.name,
        description=definition.description,
        scope=definition.scope,
        scope_owner_key=scope_owner_key,
        lifecycle_status=REPORT_LIFECYCLE_DRAFT,
        definition_json=_serialize_workbook_definition(definition),
        validation_json=_serialize_validation(validation_result),
        referenced_dataset_ids=validation_result.referenced_dataset_ids,
        definition_version=1,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_workbook_definition_record(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
    definition: WorkbookDefinitionDraft,
) -> WorkbookDefinition:
    record = get_visible_workbook_definition(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        definition_id=definition_id,
    )
    if record is None:
        raise ReportDefinitionNotFoundError("Workbook definition was not found.")
    if not can_edit_workbook_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise ReportDefinitionPermissionError("You do not have permission to edit this workbook definition.")

    validation_result = validate_workbook_definition_draft(definition)
    _ensure_valid_definition(validation_result)

    scope_owner_key = definition_scope_owner_key(definition.scope, owner_user_id=record.created_by)
    if _find_workbook_definition_duplicate(
        db,
        workbook_key=definition.workbook_key,
        scope_owner_key=scope_owner_key,
        exclude_id=record.id,
    ):
        raise ReportDefinitionConflictError(
            f"Workbook definition '{definition.workbook_key}' already exists for this scope."
        )

    record.workbook_key = definition.workbook_key
    record.name = definition.name
    record.description = definition.description
    record.scope = definition.scope
    record.scope_owner_key = scope_owner_key
    record.definition_json = _serialize_workbook_definition(definition)
    record.validation_json = _serialize_validation(validation_result)
    record.referenced_dataset_ids = validation_result.referenced_dataset_ids
    record.definition_version += 1
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def publish_workbook_definition_record(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> WorkbookDefinition:
    record = get_visible_workbook_definition(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        definition_id=definition_id,
    )
    if record is None:
        raise ReportDefinitionNotFoundError("Workbook definition was not found.")
    if record.lifecycle_status != REPORT_LIFECYCLE_DRAFT:
        raise ReportDefinitionLifecycleError("Only draft workbook definitions can be published.")
    if not can_publish_workbook_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise ReportDefinitionPermissionError("You do not have permission to publish this workbook definition.")

    definition = WorkbookDefinitionDraft.model_validate(record.definition_json)
    validation_result = validate_workbook_definition_draft(definition)
    _ensure_valid_definition(validation_result)

    now = datetime.now(timezone.utc)
    record.lifecycle_status = REPORT_LIFECYCLE_PUBLISHED
    record.validation_json = _serialize_validation(validation_result)
    record.referenced_dataset_ids = validation_result.referenced_dataset_ids
    record.published_at = now
    record.published_by = actor_id
    record.updated_at = now
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def retire_workbook_definition_record(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> WorkbookDefinition:
    record = get_visible_workbook_definition(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        definition_id=definition_id,
    )
    if record is None:
        raise ReportDefinitionNotFoundError("Workbook definition was not found.")
    if record.lifecycle_status == REPORT_LIFECYCLE_RETIRED:
        raise ReportDefinitionLifecycleError("Workbook definition is already retired.")
    if not can_retire_workbook_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise ReportDefinitionPermissionError("You do not have permission to retire this workbook definition.")

    now = datetime.now(timezone.utc)
    record.lifecycle_status = REPORT_LIFECYCLE_RETIRED
    record.retired_at = now
    record.retired_by = actor_id
    record.updated_at = now
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def to_workbook_definition_out(
    record: WorkbookDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> WorkbookDefinitionRecordOut:
    return WorkbookDefinitionRecordOut(
        definition_id=record.id,
        workbook_key=record.workbook_key,
        name=record.name,
        description=record.description,
        scope=record.scope,
        lifecycle_status=record.lifecycle_status,
        definition_version=record.definition_version,
        version=record.version,
        definition=WorkbookDefinitionDraft.model_validate(record.definition_json),
        validation_result=ReportDefinitionValidationResult.model_validate(record.validation_json),
        referenced_dataset_ids=list(record.referenced_dataset_ids or []),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        published_at=record.published_at,
        published_by=record.published_by,
        retired_at=record.retired_at,
        retired_by=record.retired_by,
        can_edit=can_edit_workbook_definition(record, actor_id=actor_id, actor_role=actor_role),
        can_publish=can_publish_workbook_definition(record, actor_id=actor_id, actor_role=actor_role),
        can_retire=can_retire_workbook_definition(record, actor_id=actor_id, actor_role=actor_role),
    )
