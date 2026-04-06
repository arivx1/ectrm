from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable, Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.external_data.market_context import build_market_context
from apps.api.app.domains.reference_data.services.records import list_reference_records, normalize_code
from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.assistant import AssistantToolCallOut, AssistantToolDefinitionOut

REFERENCE_ENTITY_TYPE_ALIASES = {
    "books": "books",
    "book": "books",
    "commodities": "commodities",
    "commodity": "commodities",
    "price_indices": "price_indices",
    "price-index": "price_indices",
    "price-indices": "price_indices",
    "price_index": "price_indices",
    "currencies": "currencies",
    "currency": "currencies",
    "units": "units",
    "unit": "units",
    "locations": "locations",
    "location": "locations",
    "counterparties": "counterparties",
    "counterparty": "counterparties",
    "portfolios": "portfolios",
    "portfolio": "portfolios",
}


@dataclass(frozen=True)
class AssistantToolDefinition:
    name: str
    description: str
    parameters: dict[str, Any]
    executor: Callable[[Session, dict[str, Any]], "AssistantToolExecutionResult"]


@dataclass(frozen=True)
class AssistantToolExecutionResult:
    output: dict[str, Any]
    summary: str
    record_count: Optional[int] = None
    is_error: bool = False


@dataclass(frozen=True)
class AssistantToolCallTrace:
    tool_name: str
    arguments: dict[str, Any]
    summary: str
    record_count: Optional[int] = None

    def to_out(self) -> AssistantToolCallOut:
        return AssistantToolCallOut(
            tool_name=self.tool_name,
            arguments=self.arguments,
            summary=self.summary,
            record_count=self.record_count,
        )


class AssistantToolServiceError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class AssistantToolService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._tools = {tool.name: tool for tool in build_tool_definitions()}

    def list_tools(self) -> list[AssistantToolDefinition]:
        return list(self._tools.values())

    def list_tool_summaries(self) -> list[AssistantToolDefinitionOut]:
        return [
            AssistantToolDefinitionOut(name=tool.name, description=tool.description)
            for tool in self.list_tools()
        ]

    def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> tuple[AssistantToolExecutionResult, AssistantToolCallTrace]:
        tool = self._tools.get(tool_name)
        if tool is None:
            raise AssistantToolServiceError(f"Unknown assistant tool '{tool_name}'.")

        result = tool.executor(self._db, arguments)
        trace = AssistantToolCallTrace(
            tool_name=tool.name,
            arguments=arguments,
            summary=result.summary,
            record_count=result.record_count,
        )
        return result, trace


def build_tool_definitions() -> list[AssistantToolDefinition]:
    return [
        AssistantToolDefinition(
            name="get_trade_by_id",
            description=(
                "Load one live trade projection by exact trade_id. Use this when the user names a specific "
                "trade and you need authoritative current state fields such as status, commodity, pricing, "
                "book, and latest event linkage. This returns projection data, not raw event history."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Exact trade identifier, such as T-1001.",
                    }
                },
                "required": ["trade_id"],
                "additionalProperties": False,
            },
            executor=_get_trade_by_id,
        ),
        AssistantToolDefinition(
            name="list_trades",
            description=(
                "Search or filter live trade projections. Use this when the user asks for trades by book, "
                "commodity, counterparty, status, or a short free-text query across common trade fields. "
                "Prefer this over guessing counts or examples from the prompt context."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional free-text search across trade_id, external_trade_id, book, commodity, and counterparty.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional exact trade status filter, such as ACTIVE or CANCELLED.",
                    },
                    "book": {
                        "type": "string",
                        "description": "Optional exact book code filter.",
                    },
                    "commodity": {
                        "type": "string",
                        "description": "Optional exact commodity code filter.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 5 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_trades,
        ),
        AssistantToolDefinition(
            name="list_trade_events",
            description=(
                "Load recent event-store rows, optionally scoped to a trade or filtered by event type. Use "
                "this when the user asks what changed, wants a timeline, or needs to verify the latest event "
                "history behind a trade projection."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Optional trade identifier. When provided, the tool filters to aggregate_type trade and that aggregate_id.",
                    },
                    "aggregate_type": {
                        "type": "string",
                        "description": "Optional aggregate type filter when trade_id is not enough.",
                    },
                    "event_type": {
                        "type": "string",
                        "description": "Optional exact event type filter, such as TradeAmended.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_trade_events,
        ),
        AssistantToolDefinition(
            name="list_positions",
            description=(
                "Load current position projection rows. Use this when the user asks about commodity exposure, "
                "wants the largest positions, or needs confirmation of net volume by commodity. Results come "
                "from the projection table rather than from an LLM summary."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "commodity": {
                        "type": "string",
                        "description": "Optional commodity code filter or partial match.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_positions,
        ),
        AssistantToolDefinition(
            name="search_reference_data",
            description=(
                "Search governed reference data across books, commodities, price indices, currencies, units, "
                "locations, counterparties, or portfolios. Use this when the user asks whether a code exists, "
                "what the approved values are, or which reference records match a search term."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "entity_type": {
                        "type": "string",
                        "enum": [
                            "books",
                            "commodities",
                            "price_indices",
                            "currencies",
                            "units",
                            "locations",
                            "counterparties",
                            "portfolios",
                        ],
                        "description": "Reference-data entity family to search.",
                    },
                    "query": {
                        "type": "string",
                        "description": "Optional free-text search across code and name.",
                    },
                    "code": {
                        "type": "string",
                        "description": "Optional exact code lookup. When provided it takes priority over query.",
                    },
                    "is_active": {
                        "type": "boolean",
                        "description": "Optional active-state filter. Defaults to true when omitted.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "required": ["entity_type"],
                "additionalProperties": False,
            },
            executor=_search_reference_data,
        ),
        AssistantToolDefinition(
            name="get_market_context",
            description=(
                "Load the latest unified market context across price-index observations, macro series, and "
                "positioning series. Use this when the user asks what is happening in crude, gas, power, or "
                "macro right now and you need current structured data instead of a generic summary."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "commodity": {
                        "type": "string",
                        "description": "Optional commodity hint such as WTI, BRENT, HH, NATURAL_GAS, or POWER.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum rows to return per section. Defaults to 5 and is capped at 10.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_get_market_context,
        ),
    ]


def list_tool_names() -> tuple[str, ...]:
    return tuple(tool.name for tool in build_tool_definitions())


def json_dumps(value: Any) -> str:
    return json.dumps(value, default=_json_default, separators=(",", ":"))


def _get_trade_by_id(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    trade_id = _require_text(arguments.get("trade_id"), field_name="trade_id")
    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return AssistantToolExecutionResult(
            output={"found": False, "trade_id": trade_id},
            summary=f"No live trade projection matched trade_id {trade_id}.",
            record_count=0,
        )

    payload = {"found": True, "trade": _serialize_trade(trade)}
    summary = (
        f"Loaded trade {trade.trade_id} in status {trade.status} for {trade.commodity} "
        f"in book {trade.book}."
    )
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=1)


def _list_trades(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    limit = _normalize_limit(arguments.get("limit"), default=5)
    stmt = select(Trade).order_by(Trade.updated_at.desc())

    query = _optional_text(arguments.get("query"))
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                Trade.trade_id.ilike(pattern),
                Trade.external_trade_id.ilike(pattern),
                Trade.book.ilike(pattern),
                Trade.commodity.ilike(pattern),
                Trade.counterparty.ilike(pattern),
            )
        )

    status = _optional_upper(arguments.get("status"))
    if status:
        stmt = stmt.where(Trade.status == status)

    book = _optional_upper(arguments.get("book"))
    if book:
        stmt = stmt.where(Trade.book == book)

    commodity = _optional_upper(arguments.get("commodity"))
    if commodity:
        stmt = stmt.where(Trade.commodity == commodity)

    rows = db.execute(stmt.limit(limit)).scalars().all()
    payload = {"count": len(rows), "items": [_serialize_trade(row) for row in rows]}
    summary = f"Returned {len(rows)} trade projection row(s)."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(rows))


def _list_trade_events(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    limit = _normalize_limit(arguments.get("limit"), default=10)
    trade_id = _optional_text(arguments.get("trade_id"))
    aggregate_type = _optional_text(arguments.get("aggregate_type"))
    event_type = _optional_text(arguments.get("event_type"))

    stmt = select(Event).order_by(Event.occurred_at.desc(), Event.recorded_at.desc())
    if trade_id:
        stmt = stmt.where(
            Event.aggregate_type == "trade",
            Event.aggregate_id == trade_id,
        )
    elif aggregate_type:
        stmt = stmt.where(Event.aggregate_type == aggregate_type)
    if event_type:
        stmt = stmt.where(Event.event_type == event_type)

    rows = db.execute(stmt.limit(limit)).scalars().all()
    payload = {"count": len(rows), "items": [_serialize_event(row) for row in rows]}
    if trade_id:
        summary = f"Returned {len(rows)} event row(s) for trade {trade_id}."
    else:
        summary = f"Returned {len(rows)} event row(s)."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(rows))


def _list_positions(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    limit = _normalize_limit(arguments.get("limit"), default=10)
    commodity = _optional_upper(arguments.get("commodity"))

    stmt = select(Position)
    if commodity:
        pattern = f"%{commodity}%"
        stmt = stmt.where(Position.commodity.ilike(pattern))

    rows = db.execute(stmt).scalars().all()
    ordered_rows = sorted(rows, key=lambda row: abs(float(row.net_volume)), reverse=True)[:limit]
    payload = {"count": len(ordered_rows), "items": [_serialize_position(row) for row in ordered_rows]}
    if commodity:
        summary = f"Returned {len(ordered_rows)} position row(s) matching commodity filter {commodity}."
    else:
        summary = f"Returned {len(ordered_rows)} position row(s)."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(ordered_rows))


def _search_reference_data(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    entity_type = _normalize_reference_entity_type(arguments.get("entity_type"))
    limit = _normalize_limit(arguments.get("limit"), default=10)
    query = _optional_text(arguments.get("query"))
    code = _optional_upper(arguments.get("code"))
    is_active = arguments.get("is_active")
    is_active_filter = True if is_active is None else bool(is_active)

    model = _reference_model_for_entity_type(entity_type)
    rows: list[Any]
    if code:
        stmt = select(model).where(model.code == code)
        if is_active is not None or is_active_filter:
            stmt = stmt.where(model.is_active == is_active_filter)
        rows = db.execute(stmt.limit(limit)).scalars().all()
    else:
        rows = list_reference_records(
            db,
            model,
            query,
            is_active_filter,
            limit,
            0,
        )

    payload = {
        "entity_type": entity_type,
        "count": len(rows),
        "items": [_serialize_reference_record(row) for row in rows],
    }
    summary = f"Returned {len(rows)} reference-data row(s) from {entity_type}."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(rows))


def _get_market_context(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    commodity = _optional_upper(arguments.get("commodity"))
    limit = _normalize_market_context_limit(arguments.get("limit"), default=5)
    payload = build_market_context(db, commodity=commodity, limit=limit)
    price_count = len(payload["price_indices"])
    power_count = len(payload["power"])
    macro_count = len(payload["macro"])
    positioning_count = len(payload["positioning"])
    stale_or_failed_count = sum(
        1
        for row in payload["freshness"]
        if row["health_status"] in {"stale", "failed", "unknown"}
    )
    if commodity:
        summary = (
            f"Loaded market context for {commodity}: {price_count} price index row(s), "
            f"{power_count} power row(s), {macro_count} macro row(s), and "
            f"{positioning_count} positioning row(s)."
        )
    else:
        summary = (
            f"Loaded market context: {price_count} price index row(s), "
            f"{power_count} power row(s), {macro_count} macro row(s), and "
            f"{positioning_count} positioning row(s)."
        )
    if stale_or_failed_count:
        summary += f" Freshness watch on {stale_or_failed_count} provider(s)."
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=price_count + power_count + macro_count + positioning_count,
    )


def _serialize_trade(trade: Trade) -> dict[str, Any]:
    return {
        "trade_id": trade.trade_id,
        "external_trade_id": trade.external_trade_id,
        "source_system": trade.source_system,
        "created_at": _json_default(trade.created_at),
        "updated_at": _json_default(trade.updated_at),
        "execution_timestamp": _json_default(trade.execution_timestamp),
        "quality_spec": trade.quality_spec,
        "unit_of_measure": trade.unit_of_measure,
        "trade_nature": trade.trade_nature,
        "trade_structure": trade.trade_structure,
        "trade_side": trade.trade_side,
        "book": trade.book,
        "portfolio": trade.portfolio,
        "counterparty": trade.counterparty,
        "commodity_class": trade.commodity_class,
        "commodity": trade.commodity,
        "pricing_type": trade.pricing_type,
        "pricing_status": trade.pricing_status,
        "price_index_code": trade.price_index_code,
        "price": _json_default(trade.price),
        "volume": _json_default(trade.volume),
        "settlement_status": trade.settlement_status,
        "trader_user": trade.trader_user,
        "status": trade.status,
        "last_event_id": trade.last_event_id,
    }


def _serialize_event(event: Event) -> dict[str, Any]:
    return {
        "event_id": event.event_id,
        "aggregate_type": event.aggregate_type,
        "aggregate_id": event.aggregate_id,
        "event_type": event.event_type,
        "occurred_at": _json_default(event.occurred_at),
        "recorded_at": _json_default(event.recorded_at),
        "actor_id": event.actor_id,
        "correlation_id": event.correlation_id,
        "causation_id": event.causation_id,
        "schema_version": event.schema_version,
        "payload": event.payload,
    }


def _serialize_position(position: Position) -> dict[str, Any]:
    return {
        "commodity": position.commodity,
        "net_volume": _json_default(position.net_volume),
        "updated_at": _json_default(position.updated_at),
    }


def _serialize_reference_record(record: Any) -> dict[str, Any]:
    payload = {
        "code": record.code,
        "name": record.name,
        "description": record.description,
        "is_active": record.is_active,
        "created_at": _json_default(getattr(record, "created_at", None)),
        "updated_at": _json_default(getattr(record, "updated_at", None)),
        "version": getattr(record, "version", None),
    }
    if isinstance(record, ReferenceCommodity):
        payload["commodity_class"] = record.commodity_class
    if isinstance(record, ReferenceCounterparty):
        payload["counterparty_type"] = record.counterparty_type
        payload["short_name"] = record.short_name
        payload["country_code"] = record.country_code
    if isinstance(record, ReferenceCurrency):
        payload["symbol"] = record.symbol
    if isinstance(record, ReferenceUnit):
        payload["commodity_class"] = record.commodity_class
        payload["dimension"] = record.dimension
        payload["precision"] = record.precision
    if isinstance(record, ReferenceLocation):
        payload["location_type"] = record.location_type
        payload["market"] = record.market
        payload["country_code"] = record.country_code
        payload["region"] = record.region
        payload["timezone"] = record.timezone
    if isinstance(record, ReferencePortfolio):
        payload["book_code"] = record.book_code
        payload["owner"] = record.owner
        payload["strategy"] = record.strategy
    if isinstance(record, ReferencePriceIndex):
        payload["commodity_code"] = record.commodity_code
        payload["currency_code"] = record.currency_code
        payload["unit_code"] = record.unit_code
        payload["provider"] = record.provider
        payload["market"] = record.market
        payload["location_code"] = record.location_code
        payload["calendar_code"] = record.calendar_code
    return payload


def _reference_model_for_entity_type(entity_type: str) -> Any:
    normalized = REFERENCE_ENTITY_TYPE_ALIASES.get(entity_type, entity_type)
    mapping = {
        "books": ReferenceBook,
        "commodities": ReferenceCommodity,
        "price_indices": ReferencePriceIndex,
        "currencies": ReferenceCurrency,
        "units": ReferenceUnit,
        "locations": ReferenceLocation,
        "counterparties": ReferenceCounterparty,
        "portfolios": ReferencePortfolio,
    }
    model = mapping.get(normalized)
    if model is None:
        raise AssistantToolServiceError(f"Unsupported reference-data entity_type '{entity_type}'.")
    return model


def _normalize_reference_entity_type(value: Any) -> str:
    normalized = _require_text(value, field_name="entity_type").lower().replace("-", "_")
    mapped = REFERENCE_ENTITY_TYPE_ALIASES.get(normalized)
    if mapped is None:
        raise AssistantToolServiceError(
            "entity_type must be one of books, commodities, price_indices, currencies, units, locations, counterparties, or portfolios."
        )
    return mapped


def _normalize_limit(value: Any, *, default: int) -> int:
    if value is None:
        return default
    try:
        limit = int(value)
    except (TypeError, ValueError) as exc:
        raise AssistantToolServiceError("limit must be a whole number.") from exc
    return max(1, min(limit, 25))


def _normalize_market_context_limit(value: Any, *, default: int) -> int:
    if value is None:
        return default
    try:
        limit = int(value)
    except (TypeError, ValueError) as exc:
        raise AssistantToolServiceError("limit must be a whole number.") from exc
    return max(1, min(limit, 10))


def _require_text(value: Any, *, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise AssistantToolServiceError(f"{field_name} is required.")
    return normalized


def _optional_text(value: Any) -> Optional[str]:
    normalized = str(value or "").strip()
    return normalized or None


def _optional_upper(value: Any) -> Optional[str]:
    normalized = _optional_text(value)
    return normalize_code(normalized) if normalized is not None else None


def _json_default(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value
