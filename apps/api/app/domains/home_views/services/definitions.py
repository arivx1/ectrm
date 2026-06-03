from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role
from apps.api.app.domains.home_views.services.registry import (
    HOME_SYSTEM_TEMPLATE_KEY,
    HOME_SYSTEM_TEMPLATE_VERSION,
    HOME_VIEW_CARD_REGISTRY,
    get_home_view_card_registry_entry,
)
from apps.api.app.models.home_view_definition import HomeViewDefinition
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.schemas.home_view import (
    HomeViewCardDefinition,
    HomeViewCardPlacement,
    HomeViewDefinitionCreate,
    HomeViewDefinitionDuplicate,
    HomeViewDefinitionOut,
    HomeViewDefinitionPublish,
    HomeViewDefinitionUpdate,
    HomeViewSystemTemplateOut,
)

HOME_VIEW_STATUS_DRAFT = "DRAFT"
HOME_VIEW_STATUS_ACTIVE = "ACTIVE"
HOME_VIEW_STATUS_RETIRED = "RETIRED"
HOME_VIEW_SCOPE_PERSONAL = "PERSONAL"
HOME_VIEW_SCOPE_TEAM = "TEAM"
HOME_VIEW_SCOPE_ORGANIZATION = "ORGANIZATION"
HOME_VIEW_SHARED_SCOPES = (HOME_VIEW_SCOPE_TEAM, HOME_VIEW_SCOPE_ORGANIZATION)
HOME_VIEW_ORGANIZATION_OWNER_KEY = "organization"
HOME_VIEW_DEFAULT_TEAM_OWNER_KEY = "team:default"
HOME_VIEW_GLOBAL_FILTER_FIELDS = tuple(
    sorted(
        {
            field
            for entry in HOME_VIEW_CARD_REGISTRY
            for field in entry.allowed_filter_fields
        }
    )
)
HOME_VIEW_ASSET_MAP_GEOGRAPHIES = ("North America", "South America", "EMEA", "APAC")
HOME_VIEW_PRICE_MARK_STATUSES = ("all", "with_marks", "missing_marks")
HOME_VIEW_PRICE_SORT_FIELDS = (
    "product",
    "location",
    "price",
    "change",
    "unit",
    "currency",
    "frequency",
    "date",
    "time",
    "updated",
    "source",
)
HOME_VIEW_PRICE_SORT_DIRECTIONS = ("asc", "desc")
HOME_VIEW_PRICE_QUOTE_TYPES = ("SPOT", "FUTURE", "FORWARD", "INDEX", "OTHER")
HOME_VIEW_NEWS_LIMIT_MIN = 1
HOME_VIEW_NEWS_LIMIT_MAX = 10
HOME_VIEW_NEWS_LOOKBACK_DAYS_MIN = 1
HOME_VIEW_NEWS_LOOKBACK_DAYS_MAX = 14


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


def home_view_scope_owner_key(
    scope: str,
    *,
    owner_user_id: str,
    shared_owner_key: str | None = None,
) -> str:
    if scope == HOME_VIEW_SCOPE_PERSONAL:
        return owner_user_id
    if scope == HOME_VIEW_SCOPE_ORGANIZATION:
        return HOME_VIEW_ORGANIZATION_OWNER_KEY
    if scope == HOME_VIEW_SCOPE_TEAM:
        normalized_team_key = (
            shared_owner_key or HOME_VIEW_DEFAULT_TEAM_OWNER_KEY
        ).strip().lower()
        if not normalized_team_key:
            raise HomeViewDefinitionValidationError("team_key must not be blank.")
        if normalized_team_key.startswith("team:"):
            return normalized_team_key
        return f"team:{normalized_team_key}"
    raise HomeViewDefinitionValidationError("Home view scope is not supported.")


def home_view_definition_is_shared(record: HomeViewDefinition) -> bool:
    return record.scope in HOME_VIEW_SHARED_SCOPES


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


def _clean_text_value(value: object, *, field_name: str, uppercase: bool = False) -> str:
    if not isinstance(value, str):
        raise HomeViewDefinitionValidationError(f"{field_name} must be text.")
    normalized = value.strip()
    if not normalized:
        raise HomeViewDefinitionValidationError(f"{field_name} must not be blank.")
    return normalized.upper() if uppercase else normalized


def _clean_text_filter_value(
    value: object,
    *,
    field_name: str,
    uppercase: bool = False,
) -> str | list[str]:
    if isinstance(value, list):
        normalized_values: list[str] = []
        for item in value:
            normalized = _clean_text_value(item, field_name=field_name, uppercase=uppercase)
            if normalized not in normalized_values:
                normalized_values.append(normalized)
        if not normalized_values:
            raise HomeViewDefinitionValidationError(f"{field_name} must include at least one value.")
        return normalized_values
    return _clean_text_value(value, field_name=field_name, uppercase=uppercase)


def _filter_values_as_list(value: str | list[str]) -> list[str]:
    return value if isinstance(value, list) else [value]


def _active_reference_catalog_has_rows(db: Session, model: type) -> bool:
    return bool(
        db.execute(
            select(func.count()).select_from(model).where(model.is_active.is_(True))
        ).scalar_one()
    )


def _ensure_active_reference_values(
    db: Session,
    *,
    model: type,
    column,
    values: str | list[str],
    field_name: str,
) -> None:
    if not _active_reference_catalog_has_rows(db, model):
        return

    expected_values = set(_filter_values_as_list(values))
    found_values = set(
        db.execute(
            select(column).where(
                column.in_(sorted(expected_values)),
                model.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )
    missing_values = sorted(expected_values - found_values)
    if missing_values:
        raise HomeViewDefinitionValidationError(
            f"{field_name} must reference active values: {', '.join(missing_values)}."
        )


def _normalize_price_sort(value: object) -> str:
    normalized = _clean_text_value(value, field_name="price_sort", uppercase=False).lower()
    field, separator, direction = normalized.rpartition("_")
    if (
        not separator
        or field not in HOME_VIEW_PRICE_SORT_FIELDS
        or direction not in HOME_VIEW_PRICE_SORT_DIRECTIONS
    ):
        allowed = ", ".join(
            f"{field}_{direction}"
            for field in HOME_VIEW_PRICE_SORT_FIELDS
            for direction in HOME_VIEW_PRICE_SORT_DIRECTIONS
        )
        raise HomeViewDefinitionValidationError(
            f"price_sort must be one of: {allowed}."
        )
    return normalized


def _normalize_integer_parameter(
    value: object,
    *,
    field_name: str,
    minimum: int,
    maximum: int,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise HomeViewDefinitionValidationError(f"{field_name} must be an integer.")
    if value < minimum or value > maximum:
        raise HomeViewDefinitionValidationError(
            f"{field_name} must be between {minimum} and {maximum}."
        )
    return value


def _normalize_card_parameters(card_id: str, parameters: dict[str, object]) -> dict[str, object]:
    normalized_parameters = dict(parameters)

    if card_id == "prices":
        if "price_mark_status" in normalized_parameters:
            status_value = _clean_text_value(
                normalized_parameters["price_mark_status"],
                field_name="price_mark_status",
                uppercase=False,
            ).lower()
            if status_value not in HOME_VIEW_PRICE_MARK_STATUSES:
                raise HomeViewDefinitionValidationError(
                    "price_mark_status must be all, with_marks, or missing_marks."
                )
            normalized_parameters["price_mark_status"] = status_value
        if "price_sort" in normalized_parameters:
            normalized_parameters["price_sort"] = _normalize_price_sort(
                normalized_parameters["price_sort"]
            )

    if card_id == "map" and "map_record_limit" in normalized_parameters:
        normalized_parameters["map_record_limit"] = _normalize_integer_parameter(
            normalized_parameters["map_record_limit"],
            field_name="map_record_limit",
            minimum=1,
            maximum=5000,
        )

    if card_id == "news":
        if "news_limit" in normalized_parameters:
            normalized_parameters["news_limit"] = _normalize_integer_parameter(
                normalized_parameters["news_limit"],
                field_name="news_limit",
                minimum=HOME_VIEW_NEWS_LIMIT_MIN,
                maximum=HOME_VIEW_NEWS_LIMIT_MAX,
            )
        if "news_lookback_days" in normalized_parameters:
            normalized_parameters["news_lookback_days"] = _normalize_integer_parameter(
                normalized_parameters["news_lookback_days"],
                field_name="news_lookback_days",
                minimum=HOME_VIEW_NEWS_LOOKBACK_DAYS_MIN,
                maximum=HOME_VIEW_NEWS_LOOKBACK_DAYS_MAX,
            )
        if "news_query" in normalized_parameters:
            news_query = _clean_text_value(
                normalized_parameters["news_query"],
                field_name="news_query",
                uppercase=False,
            )
            if len(news_query) > 240:
                raise HomeViewDefinitionValidationError("news_query must be 240 characters or fewer.")
            normalized_parameters["news_query"] = news_query

    return normalized_parameters


def _normalize_card_filters(
    db: Session | None,
    *,
    card_id: str,
    filters: dict[str, object],
) -> dict[str, object]:
    normalized_filters = dict(filters)

    if "price_index_code" in normalized_filters:
        price_index_codes = _clean_text_filter_value(
            normalized_filters["price_index_code"],
            field_name="price_index_code",
            uppercase=True,
        )
        if db is not None:
            _ensure_active_reference_values(
                db,
                model=ReferencePriceIndex,
                column=ReferencePriceIndex.code,
                values=price_index_codes,
                field_name="price_index_code",
            )
        normalized_filters["price_index_code"] = price_index_codes

    if "commodity_code" in normalized_filters:
        commodity_codes = _clean_text_filter_value(
            normalized_filters["commodity_code"],
            field_name="commodity_code",
            uppercase=True,
        )
        if db is not None:
            _ensure_active_reference_values(
                db,
                model=ReferenceCommodity,
                column=ReferenceCommodity.code,
                values=commodity_codes,
                field_name="commodity_code",
            )
        normalized_filters["commodity_code"] = commodity_codes

    if "location_code" in normalized_filters:
        location_codes = _clean_text_filter_value(
            normalized_filters["location_code"],
            field_name="location_code",
            uppercase=True,
        )
        if db is not None:
            _ensure_active_reference_values(
                db,
                model=ReferenceLocation,
                column=ReferenceLocation.code,
                values=location_codes,
                field_name="location_code",
            )
        normalized_filters["location_code"] = location_codes

    if "provider" in normalized_filters:
        provider = _clean_text_filter_value(
            normalized_filters["provider"],
            field_name="provider",
            uppercase=False,
        )
        if db is not None and _active_reference_catalog_has_rows(db, ReferencePriceIndex):
            provider_values = _filter_values_as_list(provider)
            found_provider_values = set(
                db.execute(
                    select(ReferencePriceIndex.provider).where(
                        ReferencePriceIndex.provider.in_(provider_values),
                        ReferencePriceIndex.is_active.is_(True),
                    )
                )
                .scalars()
                .all()
            )
            missing_provider_values = sorted(set(provider_values) - found_provider_values)
            if missing_provider_values:
                raise HomeViewDefinitionValidationError(
                    f"provider must reference active price index providers: {', '.join(missing_provider_values)}."
                )
        normalized_filters["provider"] = provider

    if "quote_type" in normalized_filters:
        quote_type = _clean_text_filter_value(
            normalized_filters["quote_type"],
            field_name="quote_type",
            uppercase=True,
        )
        unsupported_quote_types = sorted(
            set(_filter_values_as_list(quote_type)) - set(HOME_VIEW_PRICE_QUOTE_TYPES)
        )
        if unsupported_quote_types:
            raise HomeViewDefinitionValidationError(
                f"quote_type values are not supported: {', '.join(unsupported_quote_types)}."
            )
        normalized_filters["quote_type"] = quote_type

    if "geography" in normalized_filters:
        raw_geography = normalized_filters["geography"]
        geography = (
            []
            if isinstance(raw_geography, list) and len(raw_geography) == 0
            else _clean_text_filter_value(
                raw_geography,
                field_name="geography",
                uppercase=False,
            )
        )
        unsupported_geographies = sorted(
            set(_filter_values_as_list(geography)) - set(HOME_VIEW_ASSET_MAP_GEOGRAPHIES)
        )
        if unsupported_geographies:
            raise HomeViewDefinitionValidationError(
                f"geography values are not supported: {', '.join(unsupported_geographies)}."
            )
        normalized_filters["geography"] = geography

    if "region" in normalized_filters:
        normalized_filters["region"] = _clean_text_filter_value(
            normalized_filters["region"],
            field_name="region",
            uppercase=False,
        )

    return normalized_filters


def _validate_global_filters(global_filters: dict[str, object]) -> None:
    unknown_keys = sorted(set(global_filters) - set(HOME_VIEW_GLOBAL_FILTER_FIELDS))
    if unknown_keys:
        raise HomeViewDefinitionValidationError(
            f"Global filters are not supported for Home views: {', '.join(unknown_keys)}."
        )


def normalize_home_view_cards(
    cards: list[HomeViewCardDefinition],
    *,
    db: Session | None = None,
) -> list[HomeViewCardDefinition]:
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
        normalized_parameters = _normalize_card_parameters(entry.card_id, dict(card.parameters))
        _validate_mapping_keys(
            card_id=entry.card_id,
            field_label="Filters",
            values=card.filters,
            allowed_keys=entry.allowed_filter_fields,
        )
        normalized_filters = _normalize_card_filters(
            db,
            card_id=entry.card_id,
            filters=dict(card.filters),
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
                parameters=normalized_parameters,
                filters=normalized_filters,
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


def can_edit_home_view_definition(
    record: HomeViewDefinition,
    *,
    actor_id: str,
    actor_role: str | None,
) -> bool:
    return (
        record.scope == HOME_VIEW_SCOPE_PERSONAL
        and (record.scope_owner_key == actor_id or is_admin_role(actor_role))
    )


def can_duplicate_home_view_definition(record: HomeViewDefinition) -> bool:
    return record.status == HOME_VIEW_STATUS_ACTIVE and home_view_definition_is_shared(record)


def can_publish_home_view_definition(
    record: HomeViewDefinition,
    *,
    actor_role: str | None,
) -> bool:
    return (
        is_admin_role(actor_role)
        and record.scope == HOME_VIEW_SCOPE_PERSONAL
        and record.status == HOME_VIEW_STATUS_ACTIVE
    )


def can_retire_home_view_definition(
    record: HomeViewDefinition,
    *,
    actor_role: str | None,
) -> bool:
    return (
        is_admin_role(actor_role)
        and home_view_definition_is_shared(record)
        and record.status == HOME_VIEW_STATUS_ACTIVE
    )


def can_restore_home_view_definition(
    record: HomeViewDefinition,
    *,
    actor_role: str | None,
) -> bool:
    return (
        is_admin_role(actor_role)
        and home_view_definition_is_shared(record)
        and record.status == HOME_VIEW_STATUS_RETIRED
    )


def visible_home_view_definitions_stmt(actor_id: str):
    return select(HomeViewDefinition).where(
        HomeViewDefinition.status == HOME_VIEW_STATUS_ACTIVE,
        or_(
            and_(
                HomeViewDefinition.scope == HOME_VIEW_SCOPE_PERSONAL,
                HomeViewDefinition.scope_owner_key == actor_id,
            ),
            HomeViewDefinition.scope.in_(HOME_VIEW_SHARED_SCOPES),
        ),
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


def get_home_view_definition_record(
    db: Session,
    *,
    definition_id: int,
) -> HomeViewDefinition | None:
    return db.get(HomeViewDefinition, definition_id)


def find_home_view_definition_by_scope_name(
    db: Session,
    *,
    owner_user_id: str,
    scope: str,
    name: str,
    shared_owner_key: str | None = None,
) -> HomeViewDefinition | None:
    scope_owner_key = home_view_scope_owner_key(
        scope,
        owner_user_id=owner_user_id,
        shared_owner_key=shared_owner_key,
    )
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


def home_view_definition_validation_warnings(
    db: Session,
    record: HomeViewDefinition,
) -> list[str]:
    warnings: list[str] = []
    try:
        _ensure_system_template(record.base_template_key, record.base_template_version)
    except HomeViewDefinitionValidationError as exc:
        warnings.append(str(exc))

    try:
        normalize_home_view_cards(_cards_from_record(record), db=db)
    except HomeViewDefinitionValidationError as exc:
        warnings.append(str(exc))

    try:
        _validate_global_filters(_global_filters_from_record(record))
    except HomeViewDefinitionValidationError as exc:
        warnings.append(str(exc))

    return warnings


def to_home_view_definition_out(
    record: HomeViewDefinition,
    *,
    db: Session | None = None,
    actor_id: str,
    actor_role: str | None,
) -> HomeViewDefinitionOut:
    return HomeViewDefinitionOut(
        definition_id=record.id,
        definition_key=record.definition_key,
        name=record.name,
        scope=record.scope,
        scope_owner_key=record.scope_owner_key,
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
        can_edit=can_edit_home_view_definition(record, actor_id=actor_id, actor_role=actor_role),
        can_duplicate=can_duplicate_home_view_definition(record),
        can_publish=can_publish_home_view_definition(record, actor_role=actor_role),
        can_retire=can_retire_home_view_definition(record, actor_role=actor_role),
        can_restore=can_restore_home_view_definition(record, actor_role=actor_role),
        is_shared=home_view_definition_is_shared(record),
        validation_warnings=(
            home_view_definition_validation_warnings(db, record)
            if db is not None
            else []
        ),
    )


def create_home_view_definition(
    db: Session,
    *,
    owner_user_id: str,
    payload: HomeViewDefinitionCreate,
) -> HomeViewDefinition:
    _ensure_system_template(payload.base_template_key, payload.base_template_version)
    if payload.scope != HOME_VIEW_SCOPE_PERSONAL:
        raise HomeViewDefinitionValidationError(
            "Shared Home views must be created by publishing a personal Home view."
        )
    scope_owner_key = home_view_scope_owner_key(payload.scope, owner_user_id=owner_user_id)
    existing = find_home_view_definition_by_scope_name(
        db,
        owner_user_id=owner_user_id,
        scope=payload.scope,
        name=payload.name,
    )
    if existing is not None:
        raise HomeViewDefinitionConflictError(f"Home view '{payload.name}' already exists for this user.")

    cards = normalize_home_view_cards(payload.cards, db=db)
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
    if not can_edit_home_view_definition(record, actor_id=actor_id, actor_role=actor_role):
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
        record.layout_json = _layout_json(normalize_home_view_cards(payload.cards, db=db))
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
    if not can_edit_home_view_definition(record, actor_id=actor_id, actor_role=actor_role):
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
    if not can_edit_home_view_definition(record, actor_id=actor_id, actor_role=actor_role):
        raise HomeViewDefinitionPermissionError("You do not have permission to delete this Home view.")

    db.delete(record)
    db.commit()
    return True


def list_admin_home_view_definitions(
    db: Session,
    *,
    actor_role: str | None,
) -> list[HomeViewDefinition]:
    if not is_admin_role(actor_role):
        raise HomeViewDefinitionPermissionError("Only admins can inspect Home view inventory.")
    return (
        db.execute(
            select(HomeViewDefinition).order_by(
                HomeViewDefinition.updated_at.desc(),
                HomeViewDefinition.name.asc(),
            )
        )
        .scalars()
        .all()
    )


def publish_home_view_definition(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
    payload: HomeViewDefinitionPublish,
) -> HomeViewDefinition:
    if not is_admin_role(actor_role):
        raise HomeViewDefinitionPermissionError("Only admins can publish shared Home views.")

    source = get_home_view_definition_record(db, definition_id=definition_id)
    if source is None:
        raise HomeViewDefinitionNotFoundError("Home view definition was not found.")
    if source.scope != HOME_VIEW_SCOPE_PERSONAL:
        raise HomeViewDefinitionValidationError(
            "Only personal Home views can be published as shared Home views."
        )
    if source.status != HOME_VIEW_STATUS_ACTIVE:
        raise HomeViewDefinitionValidationError("Only active Home views can be published.")

    shared_owner_key = home_view_scope_owner_key(
        payload.scope,
        owner_user_id=actor_id,
        shared_owner_key=payload.team_key,
    )
    shared_name = payload.name or source.name
    existing = find_home_view_definition_by_scope_name(
        db,
        owner_user_id=actor_id,
        scope=payload.scope,
        name=shared_name,
        shared_owner_key=shared_owner_key,
    )
    if existing is not None:
        raise HomeViewDefinitionConflictError(f"Home view '{shared_name}' already exists for this shared scope.")

    cards = normalize_home_view_cards(_cards_from_record(source), db=db)
    global_filters = _global_filters_from_record(source)
    _validate_global_filters(global_filters)

    now = datetime.now(timezone.utc)
    record = HomeViewDefinition(
        definition_key=f"home_view_{uuid.uuid4().hex}",
        name=shared_name,
        name_key=home_view_name_key(shared_name),
        scope=payload.scope,
        scope_owner_key=shared_owner_key,
        base_template_key=source.base_template_key,
        base_template_version=source.base_template_version,
        persona_hint=source.persona_hint,
        layout_json=_layout_json(cards),
        filters_json=_filters_json(global_filters),
        status=HOME_VIEW_STATUS_ACTIVE,
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


def duplicate_home_view_definition_to_personal(
    db: Session,
    *,
    actor_id: str,
    definition_id: int,
    payload: HomeViewDefinitionDuplicate,
) -> HomeViewDefinition:
    source = get_visible_home_view_definition(db, actor_id=actor_id, definition_id=definition_id)
    if source is None:
        raise HomeViewDefinitionNotFoundError("Home view definition was not found.")
    if source.status != HOME_VIEW_STATUS_ACTIVE:
        raise HomeViewDefinitionValidationError("Only active Home views can be duplicated.")

    personal_name = payload.name or f"{source.name} Copy"
    existing = find_home_view_definition_by_scope_name(
        db,
        owner_user_id=actor_id,
        scope=HOME_VIEW_SCOPE_PERSONAL,
        name=personal_name,
    )
    if existing is not None:
        raise HomeViewDefinitionConflictError(f"Home view '{personal_name}' already exists for this user.")

    cards = normalize_home_view_cards(_cards_from_record(source), db=db)
    global_filters = _global_filters_from_record(source)
    _validate_global_filters(global_filters)
    now = datetime.now(timezone.utc)
    record = HomeViewDefinition(
        definition_key=f"home_view_{uuid.uuid4().hex}",
        name=personal_name,
        name_key=home_view_name_key(personal_name),
        scope=HOME_VIEW_SCOPE_PERSONAL,
        scope_owner_key=actor_id,
        base_template_key=source.base_template_key,
        base_template_version=source.base_template_version,
        persona_hint=source.persona_hint,
        layout_json=_layout_json(cards),
        filters_json=_filters_json(global_filters),
        status=HOME_VIEW_STATUS_ACTIVE,
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


def retire_home_view_definition(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> HomeViewDefinition:
    if not is_admin_role(actor_role):
        raise HomeViewDefinitionPermissionError("Only admins can retire shared Home views.")
    record = get_home_view_definition_record(db, definition_id=definition_id)
    if record is None:
        raise HomeViewDefinitionNotFoundError("Home view definition was not found.")
    if not home_view_definition_is_shared(record):
        raise HomeViewDefinitionValidationError("Only shared Home views can be retired.")
    if record.status == HOME_VIEW_STATUS_RETIRED:
        return record
    record.status = HOME_VIEW_STATUS_RETIRED
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record


def restore_home_view_definition(
    db: Session,
    *,
    actor_id: str,
    actor_role: str | None,
    definition_id: int,
) -> HomeViewDefinition:
    if not is_admin_role(actor_role):
        raise HomeViewDefinitionPermissionError("Only admins can restore shared Home views.")
    record = get_home_view_definition_record(db, definition_id=definition_id)
    if record is None:
        raise HomeViewDefinitionNotFoundError("Home view definition was not found.")
    if not home_view_definition_is_shared(record):
        raise HomeViewDefinitionValidationError("Only shared Home views can be restored.")
    if record.status == HOME_VIEW_STATUS_ACTIVE:
        return record
    if record.status != HOME_VIEW_STATUS_RETIRED:
        raise HomeViewDefinitionValidationError("Only retired shared Home views can be restored.")
    record.status = HOME_VIEW_STATUS_ACTIVE
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version += 1
    db.commit()
    db.refresh(record)
    return record
