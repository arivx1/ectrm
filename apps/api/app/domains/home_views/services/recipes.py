from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.personas import normalize_assistant_persona_key
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.schemas.assistant import AssistantPersona
from apps.api.app.schemas.home_view import HomeViewCardDefinition, HomeViewCardPlacement

HomeViewRecipeKey = Literal[
    "commodity_market_watch",
    "hub_basis_watch",
    "imminent_shipments",
    "settlement_exception_watch",
    "document_review_queue",
]

HOME_VIEW_MARKET_RECIPE_PERSONAS: tuple[AssistantPersona, ...] = (
    "trader",
    "risk",
    "operations",
    "settlement",
)


@dataclass(frozen=True)
class HomeViewRecipeRegistryEntry:
    key: HomeViewRecipeKey
    label: str
    description: str
    input_fields: tuple[str, ...]
    output_fields: tuple[str, ...]
    stop_conditions: tuple[str, ...]


@dataclass(frozen=True)
class HomeViewRecipeOutput:
    recipe_key: HomeViewRecipeKey
    label: str
    fallback_name: str
    persona_hint: AssistantPersona
    cards: tuple[HomeViewCardDefinition, ...]
    global_filters: dict[str, object]
    assumptions: tuple[str, ...]
    missing_evidence: tuple[str, ...]
    supporting_records: tuple[dict[str, object], ...]
    stop_conditions: tuple[str, ...]
    resolved_inputs: dict[str, object]


@dataclass(frozen=True)
class HomeViewRecipeResolution:
    output: HomeViewRecipeOutput | None = None
    warning: str | None = None


HOME_VIEW_RECIPE_REGISTRY: tuple[HomeViewRecipeRegistryEntry, ...] = (
    HomeViewRecipeRegistryEntry(
        key="commodity_market_watch",
        label="Commodity Market Watch",
        description="Market-monitoring Home view for a commodity, price index, and geography.",
        input_fields=("commodity", "price_index", "geography", "persona"),
        output_fields=("card_set", "card_order", "global_filters", "assumptions", "missing_evidence"),
        stop_conditions=(
            "commodity cannot be resolved to an active supported commodity",
            "explicit price_index_code is inactive or unknown when the price-index catalog is populated",
        ),
    ),
    HomeViewRecipeRegistryEntry(
        key="hub_basis_watch",
        label="Hub Basis Watch",
        description="Hub-centered commodity market view with price-index and related-index context.",
        input_fields=("commodity", "price_index", "geography", "persona"),
        output_fields=("card_set", "card_order", "global_filters", "assumptions", "missing_evidence"),
        stop_conditions=(
            "Henry Hub natural gas cannot be resolved from reference data or supported fallback",
            "dedicated basis or exposure cards are required but unavailable",
        ),
    ),
    HomeViewRecipeRegistryEntry(
        key="imminent_shipments",
        label="Imminent Shipments",
        description="Operations view for shipment urgency and delivery-readiness signals.",
        input_fields=("commodity", "book", "portfolio", "workflow_status", "persona"),
        output_fields=("card_set", "card_order", "global_filters", "assumptions", "missing_evidence"),
        stop_conditions=("shipment-specific Home cards are not registered yet",),
    ),
    HomeViewRecipeRegistryEntry(
        key="settlement_exception_watch",
        label="Settlement Exception Watch",
        description="Settlement view for exception queues and finance follow-up signals.",
        input_fields=("book", "portfolio", "workflow_status", "persona"),
        output_fields=("card_set", "card_order", "global_filters", "assumptions", "missing_evidence"),
        stop_conditions=("settlement-exception Home cards are not registered yet",),
    ),
    HomeViewRecipeRegistryEntry(
        key="document_review_queue",
        label="Document Review Queue",
        description="Document-review Home view for pending ingestion and evidence queues.",
        input_fields=("workflow_status", "persona"),
        output_fields=("card_set", "card_order", "global_filters", "assumptions", "missing_evidence"),
        stop_conditions=("document review status cannot be resolved",),
    ),
)
HOME_VIEW_RECIPE_REGISTRY_BY_KEY = {entry.key: entry for entry in HOME_VIEW_RECIPE_REGISTRY}


def resolve_home_view_recipe(
    *,
    db: Session,
    message: str,
    context_fields: dict[str, str],
    persona: str | None = None,
) -> HomeViewRecipeResolution:
    message_lower = message.lower()
    normalized_message = _normalized_lookup_key(message)
    recipe_persona, persona_assumption = _resolve_recipe_persona(context_fields, persona)

    if _mentions_document_review_queue(normalized_message):
        return HomeViewRecipeResolution(output=_document_review_recipe(persona=recipe_persona))
    if _mentions_registered_but_unsupported_recipe(normalized_message):
        return HomeViewRecipeResolution(warning=_unsupported_registered_recipe_warning(normalized_message))

    explicit_price_index = _explicit_price_index_code(message, context_fields)
    if explicit_price_index:
        resolution = _recipe_from_price_index(db=db, price_index_code=explicit_price_index, persona=recipe_persona)
        return _with_persona_assumption(resolution, persona_assumption)

    explicit_commodity = _explicit_commodity_code(context_fields)
    if explicit_commodity:
        if explicit_commodity in {"NATGAS", "NATURAL_GAS", "NAT_GAS", "NG"}:
            resolution = _natural_gas_recipe(
                db=db,
                message_lower=message_lower,
                include_henry_hub=False,
                persona=recipe_persona,
            )
            return _with_persona_assumption(resolution, persona_assumption)
        return HomeViewRecipeResolution(
            warning=f"commodity_code is not supported for assistant Home view creation yet: {explicit_commodity}."
        )

    mentions_hh = bool(re.search(r"\bhh\b", message_lower)) or "henry hub" in normalized_message
    mentions_natural_gas = (
        bool(re.search(r"\bng\b", message_lower))
        or "natural gas" in normalized_message
        or "nat gas" in normalized_message
        or (mentions_hh and "gas" in normalized_message)
    )
    if mentions_hh:
        resolution = _natural_gas_recipe(
            db=db,
            message_lower=message_lower,
            include_henry_hub=True,
            persona=recipe_persona,
        )
        return _with_persona_assumption(resolution, persona_assumption)
    if mentions_natural_gas:
        resolution = _natural_gas_recipe(
            db=db,
            message_lower=message_lower,
            include_henry_hub=False,
            persona=recipe_persona,
        )
        return _with_persona_assumption(resolution, persona_assumption)
    if "atlantis" in normalized_message:
        return HomeViewRecipeResolution(warning="I could not resolve a supported Home view filter signal for Atlantis.")
    return HomeViewRecipeResolution(
        warning=(
            "I couldn't resolve a supported Home view signal from that request. "
            "Name a supported filter such as HH NG, Henry Hub natural gas, or US natural gas."
        )
    )


def home_view_filter_catalog_supporting_record(db: Session) -> dict[str, object]:
    active_commodity_count = len(_active_reference_rows(db, ReferenceCommodity))
    active_location_count = len(_active_reference_rows(db, ReferenceLocation))
    active_price_index_count = len(_active_reference_rows(db, ReferencePriceIndex))
    return _supporting_record(
        "home_view_filter_catalog",
        "current",
        (
            "Validated against the current Home view card registry and active reference catalog "
            f"({active_commodity_count} commodities, {active_location_count} locations, "
            f"{active_price_index_count} price indices)."
        ),
        label="Current Home view filter catalog",
    )


def _with_persona_assumption(
    resolution: HomeViewRecipeResolution,
    persona_assumption: str | None,
) -> HomeViewRecipeResolution:
    if resolution.output is None or persona_assumption is None:
        return resolution
    output = resolution.output
    return HomeViewRecipeResolution(
        output=HomeViewRecipeOutput(
            recipe_key=output.recipe_key,
            label=output.label,
            fallback_name=output.fallback_name,
            persona_hint=output.persona_hint,
            cards=output.cards,
            global_filters=output.global_filters,
            assumptions=(*output.assumptions, persona_assumption),
            missing_evidence=output.missing_evidence,
            supporting_records=output.supporting_records,
            stop_conditions=output.stop_conditions,
            resolved_inputs=output.resolved_inputs,
        )
    )


def _first_present_value(fields: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = fields.get(key.lower())
        if value:
            return value
    return None


def _normalized_lookup_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()


def _object_ref(record_type: str, record_id: object, label: str | None = None) -> dict[str, object]:
    normalized_id = str(record_id)
    return {
        "type": record_type,
        "id": normalized_id,
        "label": label or f"{record_type.replace('_', ' ').title()} {normalized_id}",
    }


def _supporting_record(
    record_type: str,
    record_id: object,
    summary: str,
    label: str | None = None,
) -> dict[str, object]:
    return {
        **_object_ref(record_type, record_id, label),
        "summary": summary,
    }


def _resolve_recipe_persona(
    context_fields: dict[str, str],
    persona: str | None,
) -> tuple[AssistantPersona, str | None]:
    requested_persona = _first_present_value(
        context_fields,
        "home_view_persona",
        "view_persona",
        "assistant_persona",
        "persona",
    )
    normalized = normalize_assistant_persona_key(requested_persona or persona)
    if normalized in HOME_VIEW_MARKET_RECIPE_PERSONAS:
        return normalized, None
    if normalized is not None:
        return (
            "trader",
            f"Persona {normalized} does not have a dedicated market-view recipe yet; trader emphasis was used.",
        )
    return "trader", "No persona was provided to the recipe registry; trader emphasis was used."


def _explicit_price_index_code(message: str, context_fields: dict[str, str]) -> str | None:
    context_value = _first_present_value(context_fields, "price_index_code", "home_price_index_code")
    if context_value:
        return context_value.strip().upper()
    match = re.search(
        r"\bprice[_\s-]*index(?:[_\s-]*code)?\s*[:#]\s*([A-Za-z0-9_]{2,50})\b",
        message,
        re.IGNORECASE,
    )
    if match is not None:
        return match.group(1).strip().upper()
    return None


def _explicit_commodity_code(context_fields: dict[str, str]) -> str | None:
    context_value = _first_present_value(context_fields, "commodity_code", "home_commodity_code")
    return context_value.strip().upper() if context_value else None


def _active_reference_rows(db: Session, model: type) -> list:
    return list(db.execute(select(model).where(model.is_active.is_(True))).scalars().all())


def _find_active_price_index(db: Session, code: str) -> ReferencePriceIndex | None:
    return (
        db.execute(
            select(ReferencePriceIndex).where(
                ReferencePriceIndex.code == code.strip().upper(),
                ReferencePriceIndex.is_active.is_(True),
            )
        )
        .scalars()
        .first()
    )


def _choose_natural_gas_commodity_code(db: Session) -> tuple[str | None, str | None]:
    active_commodities = _active_reference_rows(db, ReferenceCommodity)
    if not active_commodities:
        return "NATGAS", "No active commodity catalog rows were available; NATGAS was used as the supported natural-gas fallback."

    preferred_codes = ("NATGAS", "NATURAL_GAS", "NAT_GAS", "NG")
    by_code = {row.code.upper(): row for row in active_commodities}
    for code in preferred_codes:
        if code in by_code:
            return by_code[code].code, None
    for row in active_commodities:
        normalized_name = _normalized_lookup_key(f"{row.code} {row.name}")
        if "natural gas" in normalized_name or "nat gas" in normalized_name:
            return row.code, None
    return None, "I could not resolve an active natural-gas commodity code for that Home view."


def _choose_henry_hub_location_code(db: Session) -> tuple[str | None, str | None]:
    active_locations = _active_reference_rows(db, ReferenceLocation)
    if not active_locations:
        return "HENRY_HUB", "No active location catalog rows were available; HENRY_HUB was used as the supported Henry Hub fallback."

    by_code = {row.code.upper(): row for row in active_locations}
    if "HENRY_HUB" in by_code:
        return by_code["HENRY_HUB"].code, None
    for row in active_locations:
        normalized_name = _normalized_lookup_key(f"{row.code} {row.name}")
        if "henry hub" in normalized_name:
            return row.code, None
    return None, "No active Henry Hub location was available; the view will use commodity-level filters."


def _choose_henry_hub_price_index(db: Session) -> tuple[str | None, str | None, dict[str, object] | None]:
    active_indices = _active_reference_rows(db, ReferencePriceIndex)
    if not active_indices:
        return (
            "HH_NATGAS",
            "No active price-index catalog rows were available; HH_NATGAS was used as the supported Henry Hub fallback.",
            None,
        )

    preferred_codes = ("HH_NATGAS", "NG_HH_PROMPT", "HH")
    by_code = {row.code.upper(): row for row in active_indices}
    for code in preferred_codes:
        if code in by_code:
            row = by_code[code]
            return row.code, None, _price_index_supporting_record(row)
    for row in active_indices:
        normalized_name = _normalized_lookup_key(f"{row.code} {row.name} {row.commodity_code}")
        if "henry hub" in normalized_name or "hh natgas" in normalized_name:
            return row.code, None, _price_index_supporting_record(row)
    return None, "I could not resolve an active Henry Hub natural-gas price index for that Home view.", None


def _price_index_supporting_record(row: ReferencePriceIndex) -> dict[str, object]:
    return _supporting_record(
        "reference_price_index",
        row.code,
        f"Active price index {row.name} for {row.commodity_code}.",
        label=row.name,
    )


def _related_gas_price_indices(
    db: Session,
    *,
    primary_code: str,
    commodity_code: str,
) -> tuple[ReferencePriceIndex, ...]:
    if not commodity_code:
        return ()
    rows = (
        db.execute(
            select(ReferencePriceIndex)
            .where(
                ReferencePriceIndex.is_active.is_(True),
                ReferencePriceIndex.commodity_code == commodity_code,
                ReferencePriceIndex.code != primary_code,
            )
            .order_by(ReferencePriceIndex.code)
            .limit(3)
        )
        .scalars()
        .all()
    )
    return tuple(rows)


def _recipe_from_price_index(
    *,
    db: Session,
    price_index_code: str,
    persona: AssistantPersona,
) -> HomeViewRecipeResolution:
    active_indices = _active_reference_rows(db, ReferencePriceIndex)
    price_index = _find_active_price_index(db, price_index_code)
    if price_index is None:
        if active_indices or price_index_code != "HH_NATGAS":
            return HomeViewRecipeResolution(
                warning=f"price_index_code must reference an active Home price index: {price_index_code}."
            )
        commodity_code = "NATGAS"
        location_code = "HENRY_HUB"
        index_label = "Henry Hub Natural Gas"
        missing_evidence: list[str] = [
            "No active price-index catalog rows were available; HH_NATGAS was used as the supported Henry Hub fallback."
        ]
        supporting_records: list[dict[str, object]] = []
    else:
        commodity_code = price_index.commodity_code
        location_code = price_index.location_code
        index_label = price_index.name
        missing_evidence = []
        supporting_records = [_price_index_supporting_record(price_index)]

    map_filters: dict[str, object] = {"commodity_code": commodity_code, "geography": "North America"}
    if location_code:
        map_filters["location_code"] = location_code
    recipe_key: HomeViewRecipeKey = "hub_basis_watch" if price_index_code == "HH_NATGAS" else "commodity_market_watch"
    price_filters: dict[str, object] = {
        "price_index_code": price_index_code,
        "commodity_code": commodity_code,
    }
    assumptions = ["Mapped the request through the deterministic Home view recipe registry."]
    if recipe_key == "hub_basis_watch":
        _extend_basis_context(
            db,
            primary_code=price_index_code,
            commodity_code=commodity_code,
            price_filters=price_filters,
            supporting_records=supporting_records,
            assumptions=assumptions,
            missing_evidence=missing_evidence,
        )
    return HomeViewRecipeResolution(
        output=_market_recipe_output(
            recipe_key=recipe_key,
            label=index_label,
            fallback_name="HH NG Watch" if price_index_code == "HH_NATGAS" else f"{price_index_code} Watch",
            persona=persona,
            global_filters={"commodity_code": commodity_code},
            price_filters=price_filters,
            map_filters=map_filters,
            assumptions=tuple(assumptions),
            missing_evidence=tuple(missing_evidence),
            supporting_records=tuple(supporting_records),
            resolved_inputs={
                "commodity_code": commodity_code,
                "price_index_code": price_index_code,
                "location_code": location_code,
                "geography": "North America",
            },
        )
    )


def _natural_gas_recipe(
    *,
    db: Session,
    message_lower: str,
    include_henry_hub: bool,
    persona: AssistantPersona,
) -> HomeViewRecipeResolution:
    commodity_code, commodity_warning = _choose_natural_gas_commodity_code(db)
    if commodity_code is None:
        return HomeViewRecipeResolution(warning=commodity_warning)

    missing_evidence: list[str] = []
    if commodity_warning:
        missing_evidence.append(commodity_warning)
    supporting_records: list[dict[str, object]] = []
    price_filters: dict[str, object] = {"commodity_code": commodity_code}
    map_filters: dict[str, object] = {"commodity_code": commodity_code, "geography": "North America"}
    fallback_name = "US Natural Gas Watch" if " us " in f" {message_lower} " or "united states" in message_lower else "Natural Gas Watch"
    label = "Natural Gas"
    recipe_key: HomeViewRecipeKey = "commodity_market_watch"
    assumptions = ["Mapped the request through the deterministic Home view recipe registry."]
    if include_henry_hub:
        price_index_code, price_index_warning, price_index_record = _choose_henry_hub_price_index(db)
        if price_index_code is None:
            return HomeViewRecipeResolution(warning=price_index_warning)
        price_filters["price_index_code"] = price_index_code
        if price_index_record is not None:
            supporting_records.append(price_index_record)
        if price_index_warning:
            missing_evidence.append(price_index_warning)
        location_code, location_warning = _choose_henry_hub_location_code(db)
        if location_code is not None:
            map_filters["location_code"] = location_code
        if location_warning:
            missing_evidence.append(location_warning)
        fallback_name = "HH NG Watch"
        label = "Henry Hub Natural Gas"
        recipe_key = "hub_basis_watch"
        assumptions.append("Interpreted HH NG as Henry Hub natural gas.")
        _extend_basis_context(
            db,
            primary_code=price_index_code,
            commodity_code=commodity_code,
            price_filters=price_filters,
            supporting_records=supporting_records,
            assumptions=assumptions,
            missing_evidence=missing_evidence,
        )

    return HomeViewRecipeResolution(
        output=_market_recipe_output(
            recipe_key=recipe_key,
            label=label,
            fallback_name=fallback_name,
            persona=persona,
            global_filters={"commodity_code": commodity_code},
            price_filters=price_filters,
            map_filters=map_filters,
            assumptions=tuple(assumptions),
            missing_evidence=tuple(missing_evidence),
            supporting_records=tuple(supporting_records),
            resolved_inputs={
                "commodity_code": commodity_code,
                "price_index_code": price_filters.get("price_index_code"),
                "location_code": map_filters.get("location_code"),
                "geography": map_filters.get("geography"),
            },
        )
    )


def _extend_basis_context(
    db: Session,
    *,
    primary_code: str,
    commodity_code: str,
    price_filters: dict[str, object],
    supporting_records: list[dict[str, object]],
    assumptions: list[str],
    missing_evidence: list[str],
) -> None:
    related_indices = _related_gas_price_indices(db, primary_code=primary_code, commodity_code=commodity_code)
    if related_indices:
        price_filters["price_index_code"] = [primary_code, *(row.code for row in related_indices)]
        supporting_records.extend(_price_index_supporting_record(row) for row in related_indices)
        assumptions.append("Included related active natural-gas price indices for basis context.")
    else:
        missing_evidence.append(
            "No related active natural-gas price indices were available for basis context."
        )


def _market_recipe_output(
    *,
    recipe_key: HomeViewRecipeKey,
    label: str,
    fallback_name: str,
    persona: AssistantPersona,
    global_filters: dict[str, object],
    price_filters: dict[str, object],
    map_filters: dict[str, object],
    assumptions: tuple[str, ...],
    missing_evidence: tuple[str, ...],
    supporting_records: tuple[dict[str, object], ...],
    resolved_inputs: dict[str, object],
) -> HomeViewRecipeOutput:
    cards, persona_missing_evidence = _market_cards_for_persona(
        persona=persona,
        price_filters=price_filters,
        map_filters=map_filters,
    )
    registry_entry = HOME_VIEW_RECIPE_REGISTRY_BY_KEY[recipe_key]
    return HomeViewRecipeOutput(
        recipe_key=recipe_key,
        label=label,
        fallback_name=fallback_name,
        persona_hint=persona,
        cards=cards,
        global_filters=global_filters,
        assumptions=assumptions,
        missing_evidence=(*missing_evidence, *persona_missing_evidence),
        supporting_records=supporting_records,
        stop_conditions=registry_entry.stop_conditions,
        resolved_inputs={**resolved_inputs, "persona": persona},
    )


def _market_cards_for_persona(
    *,
    persona: AssistantPersona,
    price_filters: dict[str, object],
    map_filters: dict[str, object],
) -> tuple[tuple[HomeViewCardDefinition, ...], tuple[str, ...]]:
    missing_evidence: tuple[str, ...] = ()
    if persona == "risk":
        ordered_visible = ("map", "prices", "prompt", "communication")
        missing_evidence = ("No dedicated exposure or position Home card exists yet; risk emphasis uses map and price context.",)
    elif persona == "operations":
        ordered_visible = ("map", "prompt", "timeframe", "communication", "prices")
        missing_evidence = (
            "No dedicated shipment Home card exists yet; operations emphasis uses map, prompt, timeframe, and communications cards.",
        )
    elif persona == "settlement":
        ordered_visible = ("prices", "documents", "communication", "prompt")
        missing_evidence = (
            "No dedicated settlement exception Home card exists yet; settlement emphasis uses price, document, and communications cards.",
        )
    else:
        ordered_visible = ("prices", "map", "prompt")

    full_order = [*ordered_visible, *[card_id for card_id in _HOME_CARD_DEFAULT_ORDER if card_id not in ordered_visible]]
    cards: list[HomeViewCardDefinition] = []
    for order, card_id in enumerate(full_order):
        cards.append(
            _home_view_card(
                card_id=card_id,
                order=order,
                visible=card_id in ordered_visible,
                price_filters=price_filters,
                map_filters=map_filters,
                persona=persona,
            )
        )
    return tuple(cards), missing_evidence


_HOME_CARD_DEFAULT_ORDER: tuple[str, ...] = (
    "timeframe",
    "prices",
    "map",
    "documents",
    "communication",
    "prompt",
)


def _home_view_card(
    *,
    card_id: str,
    order: int,
    visible: bool,
    price_filters: dict[str, object],
    map_filters: dict[str, object],
    persona: AssistantPersona,
) -> HomeViewCardDefinition:
    if card_id == "prices":
        return HomeViewCardDefinition(
            card_id="prices",
            visible=visible,
            placement=HomeViewCardPlacement(order=order, column_span=2, row_span=1),
            parameters={"price_sort": "updated_desc"},
            filters=dict(price_filters),
            data_bindings=["latest_price_marks", "market_price_indices"],
        )
    if card_id == "map":
        return HomeViewCardDefinition(
            card_id="map",
            visible=visible,
            placement=HomeViewCardPlacement(order=order, column_span=2, row_span=2),
            parameters={"map_record_limit": 250},
            filters=dict(map_filters),
            data_bindings=["asset_map", "weather_overlays"],
        )
    if card_id == "prompt":
        starter_kit = "market_watch"
        if persona == "risk":
            starter_kit = "risk_review"
        elif persona == "operations":
            starter_kit = "operations_handoff"
        elif persona == "settlement":
            starter_kit = "settlement_review"
        return HomeViewCardDefinition(
            card_id="prompt",
            visible=visible,
            placement=HomeViewCardPlacement(order=order, column_span=2, row_span=1),
            parameters={"starter_kit": starter_kit},
            filters={"workflow_category": "market_monitoring"},
            data_bindings=["assistant_conversation", "operator_attention_counts"],
        )
    if card_id == "documents":
        filters = {"review_status": "NEEDS_REVIEW"} if persona == "settlement" else {}
        return HomeViewCardDefinition(
            card_id="documents",
            visible=visible,
            placement=HomeViewCardPlacement(order=order, column_span=1, row_span=1),
            parameters={},
            filters=filters,
            data_bindings=["document_ingestion"],
        )
    if card_id == "communication":
        return HomeViewCardDefinition(
            card_id="communication",
            visible=visible,
            placement=HomeViewCardPlacement(order=order, column_span=1, row_span=1),
            parameters={},
            filters={"workflow_category": "market_monitoring"} if visible else {},
            data_bindings=["message_threads", "operator_attention_counts"],
        )
    return HomeViewCardDefinition(
        card_id="timeframe",
        visible=visible,
        placement=HomeViewCardPlacement(order=order, column_span=1, row_span=1),
        parameters={},
        filters={},
        data_bindings=["calendar_events", "user_events"],
    )


def _mentions_document_review_queue(normalized_message: str) -> bool:
    return "document" in normalized_message and ("review" in normalized_message or "queue" in normalized_message)


def _document_review_recipe(*, persona: AssistantPersona) -> HomeViewRecipeOutput:
    registry_entry = HOME_VIEW_RECIPE_REGISTRY_BY_KEY["document_review_queue"]
    ordered_visible = ("documents", "prompt", "communication")
    full_order = [*ordered_visible, *[card_id for card_id in _HOME_CARD_DEFAULT_ORDER if card_id not in ordered_visible]]
    cards: list[HomeViewCardDefinition] = []
    for order, card_id in enumerate(full_order):
        if card_id == "documents":
            cards.append(
                HomeViewCardDefinition(
                    card_id="documents",
                    visible=True,
                    placement=HomeViewCardPlacement(order=order, column_span=2, row_span=1),
                    parameters={},
                    filters={"review_status": "NEEDS_REVIEW"},
                    data_bindings=["document_ingestion"],
                )
            )
        elif card_id == "prompt":
            cards.append(
                HomeViewCardDefinition(
                    card_id="prompt",
                    visible=True,
                    placement=HomeViewCardPlacement(order=order, column_span=2, row_span=1),
                    parameters={"starter_kit": "document_review"},
                    filters={"workflow_category": "document_review"},
                    data_bindings=["assistant_conversation", "operator_attention_counts"],
                )
            )
        elif card_id == "communication":
            cards.append(
                HomeViewCardDefinition(
                    card_id="communication",
                    visible=True,
                    placement=HomeViewCardPlacement(order=order, column_span=1, row_span=1),
                    parameters={},
                    filters={"workflow_category": "document_review"},
                    data_bindings=["message_threads", "operator_attention_counts"],
                )
            )
        else:
            cards.append(
                _home_view_card(
                    card_id=card_id,
                    order=order,
                    visible=False,
                    price_filters={},
                    map_filters={},
                    persona=persona,
                )
            )
    return HomeViewRecipeOutput(
        recipe_key="document_review_queue",
        label="Document Review Queue",
        fallback_name="Document Review Queue",
        persona_hint=persona,
        cards=tuple(cards),
        global_filters={"review_status": "NEEDS_REVIEW"},
        assumptions=("Mapped the request through the deterministic Home view recipe registry.",),
        missing_evidence=(),
        supporting_records=(),
        stop_conditions=registry_entry.stop_conditions,
        resolved_inputs={"workflow_status": "NEEDS_REVIEW", "persona": persona},
    )


def _mentions_registered_but_unsupported_recipe(normalized_message: str) -> bool:
    return (
        ("shipment" in normalized_message or "delivery" in normalized_message)
        or ("settlement" in normalized_message and ("exception" in normalized_message or "queue" in normalized_message))
    )


def _unsupported_registered_recipe_warning(normalized_message: str) -> str:
    if "settlement" in normalized_message:
        return (
            "The settlement_exception_watch Home view recipe is registered, but a dedicated settlement "
            "exception Home card is not available yet."
        )
    return (
        "The imminent_shipments Home view recipe is registered, but a dedicated shipment Home card is not available yet."
    )
