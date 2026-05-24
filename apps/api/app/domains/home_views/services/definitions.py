from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role
from apps.api.app.domains.home_views.services.registry import (
    HOME_SYSTEM_TEMPLATE_KEY,
    HOME_SYSTEM_TEMPLATE_VERSION,
    HOME_VIEW_CARD_REGISTRY,
    get_home_view_card_registry_entry,
)
from apps.api.app.models.home_view_definition import HomeViewDefinition
from apps.api.app.schemas.home_view import (
    HomeViewCardDefinition,
    HomeViewCardPlacement,
    HomeViewDefinitionCreate,
    HomeViewDefinitionOut,
    HomeViewDefinitionUpdate,
    HomeViewSystemTemplateOut,
)

HOME_VIEW_STATUS_ACTIVE = "ACTIVE"
HOME_VIEW_SCOPE_PERSONAL = "PERSONAL"
HOME_VIEW_GLOBAL_FILTER_FIELDS = tuple(
    sorted(
        {
            field
            for entry in HOME_VIEW_CARD_REGISTRY
            for field in entry.allowed_filter_fields
        }
    )
)


class HomeViewDefinitionConflictError(ValueError):
    pass


class HomeViewDefinitionNotFoundError(LookupError):
    pass


class HomeViewDefinitionPermissionError(PermissionError):
    pass


class HomeViewDefinitionValidationError(ValueError):
    pass


def home_view_name_key(name: str) -> str:
    return name.strip().casefold()


def home_view_scope_owner_key(scope: str, *, owner_user_id: str) -> str:
    if scope == HOME_VIEW_SCOPE_PERSONAL:
        return owner_user_id
    raise HomeViewDefinitionValidationError("Only PERSONAL Home view definitions are supported in this slice.")


def _default_card_for_entry(entry, *, order: int) -> HomeViewCardDefinition:
    return HomeViewCardDefinition(
        card_id=entry.card_id,
        kind=entry.kind,
        label=entry.label,
        visible=entry.default_visible,
        placement=HomeViewCardPlacement(
            order=order,
            column_span=entry.default_column_span,
            row_span=entry.default_row_span,
        ),
        parameters={},
        filters={},
        data_bindings=list(entry.data_bindings),
    )


def build_home_system_template() -> HomeViewSystemTemplateOut:
    return HomeViewSystemTemplateOut(
        template_key=HOME_SYSTEM_TEMPLATE_KEY,
        template_version=HOME_SYSTEM_TEMPLATE_VERSION,
        label="System Home",
        immutable=True,
        cards=[
            _default_card_for_entry(entry, order=index)
            for index, entry in enumerate(HOME_VIEW_CARD_REGISTRY)
        ],
    )


def _ensure_system_template(base_template_key: str, base_template_version: int) -> None:
    if base_template_key != HOME_SYSTEM_TEMPLATE_KEY:
        raise HomeViewDefinitionValidationError("base_template_key must be system_home.")
    if base_template_version != HOME_SYSTEM_TEMPLATE_VERSION:
        raise HomeViewDefinitionValidationError(
            f"base_template_version must be {HOME_SYSTEM_TEMPLATE_VERSION}."
        )


def _validate_mapping_keys(
    *,
    card_id: str,
    field_label: str,
    values: dict[str, object],
    allowed_keys: tuple[str, ...],
) -> None:
    unknown_keys = sorted(set(values) - set(allowed_keys))
    if unknown_keys:
        raise HomeViewDefinitionValidationError(
            f"{field_label} are not supported for Home card '{card_id}': {', '.join(unknown_keys)}."
        )


def _validate_global_filters(global_filters: dict[str, object]) -> None:
    unknown_keys = sorted(set(global_filters) - set(HOME_VIEW_GLOBAL_FILTER_FIELDS))
    if unknown_keys:
        raise HomeViewDefinitionValidationError(
            f"Global filters are not supported for Home views: {', '.join(unknown_keys)}."
        )


def normalize_home_view_cards(cards: list[HomeViewCardDefinition]) -> list[HomeViewCardDefinition]:
    seen_card_ids: set[str] = set()
    normalized_cards: list[HomeViewCardDefinition] = []

    for card in cards:
        if card.card_id in seen_card_ids:
            raise HomeViewDefinitionValidationError("Home view cards must not contain duplicate card ids.")

        entry = get_home_view_card_registry_entry(card.card_id)
        _validate_mapping_keys(
            card_id=entry.card_id,
            field_label="Parameters",
            values=card.parameters,
            allowed_keys=entry.allowed_parameters,
        )
        _validate_mapping_keys(
            card_id=entry.card_id,
            field_label="Filters",
            values=card.filters,
            allowed_keys=entry.allowed_filter_fields,
        )

        next_data_bindings = list(card.data_bindings or entry.data_bindings)
        unknown_bindings = sorted(set(next_data_bindings) - set(entry.data_bindings))
        if unknown_bindings:
            raise HomeViewDefinitionValidationError(
                f"Data bindings are not supported for Home card '{entry.card_id}': {', '.join(unknown_bindings)}."
            )

        placement = card.placement or HomeViewCardPlacement(
            order=len(normalized_cards),
            column_span=entry.default_column_span,
            row_span=entry.default_row_span,
        )
        normalized_cards.append(
            HomeViewCardDefinition(
                card_id=entry.card_id,
                kind=entry.kind,
                label=entry.label,
                visible=card.visible,
                placement=HomeViewCardPlacement(
                    order=len(normalized_cards),
                    column_span=placement.column_span,
                    row_span=placement.row_span,
                ),
                parameters=dict(card.parameters),
                filters=dict(card.filters),
                data_bindings=next_data_bindings,
            )
        )
        seen_card_ids.add(entry.card_id)

    for entry in HOME_VIEW_CARD_REGISTRY:
        if entry.card_id in seen_card_ids:
            continue
        normalized_cards.append(_default_card_for_entry(entry, order=len(normalized_cards)))

    return normalized_cards


def _layout_json(cards: list[HomeViewCardDefinition]) -> dict[str, object]:
    return {"cards": [card.model_dump(mode="json") for card in cards]}


def _filters_json(global_filters: dict[str, object]) -> dict[str, object]:
    return {"global": dict(global_filters)}


def _cards_from_record(record: HomeViewDefinition) -> list[HomeViewCardDefinition]:
    raw_cards = (record.layout_json or {}).get("cards")
    if not isinstance(raw_cards, list):
        raw_cards = []
    cards = [HomeViewCardDefinition.model_validate(card) for card in raw_cards]
    return normalize_home_view_cards(cards)


def _global_filters_from_record(record: HomeViewDefinition) -> dict[str, object]:
    raw_global_filters = (record.filters_json or {}).get("global")
    return dict(raw_global_filters) if isinstance(raw_global_filters, dict) else {}


def can_manage_home_view_definition(
    record: HomeViewDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> bool:
    return record.scope_owner_key == actor_id or is_admin_role(actor_role)


def visible_home_view_definitions_stmt(actor_id: str):
    return select(HomeViewDefinition).where(
        HomeViewDefinition.scope == HOME_VIEW_SCOPE_PERSONAL,
        HomeViewDefinition.scope_owner_key == actor_id,
        HomeViewDefinition.status == HOME_VIEW_STATUS_ACTIVE,
    )


def list_visible_home_view_definitions(db: Session, *, actor_id: str) -> list[HomeViewDefinition]:
    return (
        db.execute(
            visible_home_view_definitions_stmt(actor_id).order_by(
                HomeViewDefinition.updated_at.desc(),
                HomeViewDefinition.name.asc(),
            )
        )
        .scalars()
        .all()
    )


def get_visible_home_view_definition(
    db: Session,
    *,
    actor_id: str,
    definition_id: int,
) -> HomeViewDefinition | None:
    return (
        db.execute(
            visible_home_view_definitions_stmt(actor_id).where(
                HomeViewDefinition.id == definition_id,
            )
        )
        .scalars()
        .first()
    )


def find_home_view_definition_by_scope_name(
    db: Session,
    *,
    owner_user_id: str,
    scope: str,
    name: str,
) -> HomeViewDefinition | None:
    scope_owner_key = home_view_scope_owner_key(scope, owner_user_id=owner_user_id)
    return (
        db.execute(
            select(HomeViewDefinition).where(
                HomeViewDefinition.scope == scope,
                HomeViewDefinition.scope_owner_key == scope_owner_key,
                HomeViewDefinition.name_key == home_view_name_key(name),
            )
        )
        .scalars()
        .first()
    )


def to_home_view_definition_out(
    record: HomeViewDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> HomeViewDefinitionOut:
    return HomeViewDefinitionOut(
        definition_id=record.id,
        definition_key=record.definition_key,
        name=record.name,
        scope=record.scope,
        base_template_key=record.base_template_key,
        base_template_version=record.base_template_version,
        persona_hint=record.persona_hint,
        cards=_cards_from_record(record),
        global_filters=_global_filters_from_record(record),
        status=record.status,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
        can_edit=can_manage_home_view_definition(record, actor_id=actor_id, actor_role=actor_role),
    )


def create_home_view_definition(
    db: Session,
    *,
    owner_user_id: str,
    payload: HomeViewDefinitionCreate,
) -> HomeViewDefinition:
    _ensure_system_template(payload.base_template_key, payload.base_template_version)
    scope_owner_key = home_view_scope_owner_key(payload.scope, owner_user_id=owner_user_id)
    existing = find_home_view_definition_by_scope_name(
        db,
        owner_user_id=owner_user_id,
        scope=payload.scope,
        name=payload.name,
    )
    if existing is not None:
        raise HomeViewDefinitionConflictError(f"Home view '{payload.name}' already exists for this user.")

    cards = normalize_home_view_cards(payload.cards)
    _validate_global_filters(payload.global_filters)
    now = datetime.now(timezone.utc)
    record = HomeViewDefinition(
        definition_key=f"home_view_{uuid.uuid4().hex}",
        name=payload.name,
        name_key=home_view_name_key(payload.name),
        scope=payload.scope,
        scope_owner_key=scope_owner_key,
        base_template_key=payload.base_template_key,
        base_template_version=payload.base_template_version,
        persona_hint=payload.persona_hint,
        layout_json=_layout_json(cards),
        filters_json=_filters_json(payload.global_filters),
        status=HOME_VIEW_STATUS_ACTIVE,
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


def update_home_view_definition(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
    payload: HomeViewDefinitionUpdate,
) -> HomeViewDefinition:
    record = get_visible_home_view_definition(db, actor_id=actor_id, definition_id=definition_id)
    if record is None:
        raise HomeViewDefinitionNotFoundError("Home view definition was not found.")
    if not can_manage_home_view_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise HomeViewDefinitionPermissionError("You do not have permission to edit this Home view.")

    next_name = payload.name or record.name
    next_name_key = home_view_name_key(next_name)
    duplicate = (
        db.execute(
            select(HomeViewDefinition).where(
                HomeViewDefinition.scope == record.scope,
                HomeViewDefinition.scope_owner_key == record.scope_owner_key,
                HomeViewDefinition.name_key == next_name_key,
                HomeViewDefinition.id != record.id,
            )
        )
        .scalars()
        .first()
    )
    if duplicate is not None:
        raise HomeViewDefinitionConflictError(f"Home view '{next_name}' already exists for this user.")

    if payload.name is not None:
        record.name = payload.name
        record.name_key = next_name_key
    if "persona_hint" in payload.model_fields_set:
        record.persona_hint = payload.persona_hint
    if payload.cards is not None:
        record.layout_json = _layout_json(normalize_home_view_cards(payload.cards))
    if payload.global_filters is not None:
        _validate_global_filters(payload.global_filters)
        record.filters_json = _filters_json(payload.global_filters)

    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def reset_home_view_definition(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> HomeViewDefinition:
    record = get_visible_home_view_definition(db, actor_id=actor_id, definition_id=definition_id)
    if record is None:
        raise HomeViewDefinitionNotFoundError("Home view definition was not found.")
    if not can_manage_home_view_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise HomeViewDefinitionPermissionError("You do not have permission to reset this Home view.")

    system_template = build_home_system_template()
    record.base_template_key = system_template.template_key
    record.base_template_version = system_template.template_version
    record.layout_json = _layout_json(system_template.cards)
    record.filters_json = _filters_json({})
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def delete_home_view_definition(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> bool:
    record = get_visible_home_view_definition(db, actor_id=actor_id, definition_id=definition_id)
    if record is None:
        return False
    if not can_manage_home_view_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise HomeViewDefinitionPermissionError("You do not have permission to delete this Home view.")

    db.delete(record)
    db.commit()
    return True
