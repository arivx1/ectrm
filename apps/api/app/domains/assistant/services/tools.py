from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Callable, Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.domains.documents.services.ingestion import (
    get_document_ingestion as load_document_ingestion,
)
from apps.api.app.domains.documents.services.ingestion import (
    list_document_ingestions as load_document_ingestions,
)
from apps.api.app.domains.operations.services import build_workspace_bootstrap_summary
from apps.api.app.domains.operations.services.settlement_invoices import (
    count_invoice_issue_candidates as load_invoice_issue_candidate_count,
)
from apps.api.app.domains.operations.services.settlement_invoices import (
    list_invoice_issue_candidates as load_invoice_issue_candidates,
)
from apps.api.app.domains.operations.services.settlement_invoices import (
    list_trade_invoices as load_trade_invoices,
)
from apps.api.app.domains.operations.services.settlement_payments import (
    list_trade_payments as load_trade_payments,
)
from apps.api.app.domains.reference_data.services.external_data.market_context import build_market_context
from apps.api.app.domains.reference_data.services.records import list_reference_records, normalize_code
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
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
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.trade import Trade, trade_recency_order
from apps.api.app.schemas.assistant import AssistantToolCallOut, AssistantToolDefinitionOut
from apps.api.app.shared.enums import (
    ActualizationStatus,
    AllocationStatus,
    ConfirmationReceiptStatus,
    ConfirmationStatus,
    CreditApprovalStatus,
    InvoiceStatus,
    NominationStatus,
    OptionSettlementStatus,
    PaymentStatus,
    TradeWorkflowType,
)

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

WORKFLOW_TYPE_TO_QUEUE = {
    TradeWorkflowType.CONFIRMATION.value: "operations",
    TradeWorkflowType.NOMINATION.value: "operations",
    TradeWorkflowType.ALLOCATION.value: "operations",
    TradeWorkflowType.ACTUALIZATION.value: "operations",
    TradeWorkflowType.CREDIT_APPROVAL.value: "operations",
    TradeWorkflowType.OPTION_SETTLEMENT.value: "operations",
    TradeWorkflowType.INVOICE.value: "settlement",
    TradeWorkflowType.PAYMENT.value: "settlement",
}

WORKFLOW_CLOSED_STATUS_VALUES = {
    TradeWorkflowType.CONFIRMATION.value: {ConfirmationStatus.CONFIRMED.value},
    TradeWorkflowType.NOMINATION.value: {
        NominationStatus.NOT_REQUIRED.value,
        NominationStatus.COMPLETED.value,
    },
    TradeWorkflowType.ALLOCATION.value: {
        AllocationStatus.NOT_REQUIRED.value,
        AllocationStatus.COMPLETED.value,
    },
    TradeWorkflowType.ACTUALIZATION.value: {
        ActualizationStatus.NOT_REQUIRED.value,
        ActualizationStatus.ACTUALIZED.value,
    },
    TradeWorkflowType.CREDIT_APPROVAL.value: {
        CreditApprovalStatus.APPROVED.value,
        CreditApprovalStatus.NOT_REQUIRED.value,
        CreditApprovalStatus.REJECTED.value,
    },
    TradeWorkflowType.OPTION_SETTLEMENT.value: {
        OptionSettlementStatus.BOOKED.value,
        OptionSettlementStatus.NOT_REQUIRED.value,
    },
    TradeWorkflowType.INVOICE.value: {
        InvoiceStatus.NOT_REQUIRED.value,
        InvoiceStatus.APPROVED.value,
    },
    TradeWorkflowType.PAYMENT.value: {
        PaymentStatus.NOT_REQUIRED.value,
        PaymentStatus.PAID.value,
    },
}

CONFIRMATION_STATUS_VALUES = {status.value for status in ConfirmationStatus}
CONFIRMATION_RECEIPT_STATUS_VALUES = {status.value for status in ConfirmationReceiptStatus}


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
                "Prefer this over guessing counts or examples from the prompt context. Results are ordered "
                "by deterministic trade recency and include metadata about ties at the latest boundary."
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
                        "description": "Optional exact trade status filter, such as ACTIVE, CANCELLED, EXERCISED, EXPIRED, or ASSIGNED.",
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
                "history behind a trade projection. When a trade projection exists but event linkage is "
                "missing, the result includes projection-consistency diagnostics."
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
                    "event_id": {
                        "type": "string",
                        "description": "Optional exact event identifier lookup, such as a trade projection last_event_id.",
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
        AssistantToolDefinition(
            name="list_workflow_items",
            description=(
                "Load persisted trade workflow queue items across operations and settlement. Use this when "
                "the user asks what needs follow-up, who owns a handoff, what is overdue, or whether a "
                "trade still has open confirmation, credit, invoice, payment, or actualization work."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Optional exact trade identifier filter, such as T-1001.",
                    },
                    "queue": {
                        "type": "string",
                        "enum": ["operations", "settlement"],
                        "description": "Optional queue filter.",
                    },
                    "workflow_type": {
                        "type": "string",
                        "description": "Optional exact workflow type such as CONFIRMATION, CREDIT_APPROVAL, INVOICE, or PAYMENT.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional exact workflow status filter such as PENDING, DUE, OVERDUE, APPROVED, or CONFIRMED.",
                    },
                    "owner": {
                        "type": "string",
                        "description": "Optional case-insensitive owner search.",
                    },
                    "include_closed": {
                        "type": "boolean",
                        "description": "Whether to include closed queue items. Defaults to false.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_workflow_items,
        ),
        AssistantToolDefinition(
            name="list_trade_confirmations",
            description=(
                "Load trade confirmation ledger records for active trades. Use this when the user asks "
                "whether a trade has been sent, confirmed, disputed, or is still awaiting counterparty "
                "response. The tool can focus on only current confirmation versions or include history."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Optional exact trade identifier filter, such as T-1001.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional exact confirmation status such as SENT, CONFIRMED, or DISPUTED.",
                    },
                    "receipt_status": {
                        "type": "string",
                        "description": "Optional exact receipt status such as ISSUED_AWAITING_RESPONSE or COUNTERPARTY_DISPUTED.",
                    },
                    "current_only": {
                        "type": "boolean",
                        "description": "Whether to return only the latest confirmation row per trade. Defaults to true.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_trade_confirmations,
        ),
        AssistantToolDefinition(
            name="get_trade_workbench",
            description=(
                "Build a one-shot operator workbench for a single trade by combining current trade state, "
                "recent events, open workflow items, confirmation history, settlement records, and delivery "
                "tracking. Use this when the user wants the full operational picture for one trade."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Exact trade identifier, such as T-1001.",
                    },
                    "row_limit": {
                        "type": "integer",
                        "description": "Maximum rows to include per related section. Defaults to 5 and is capped at 10.",
                    },
                    "event_limit": {
                        "type": "integer",
                        "description": "Maximum recent event rows to include. Defaults to 5 and is capped at 10.",
                    },
                },
                "required": ["trade_id"],
                "additionalProperties": False,
            },
            executor=_get_trade_workbench,
        ),
        AssistantToolDefinition(
            name="list_trade_invoices",
            description=(
                "Load persisted settlement invoice records with outstanding and paid amounts already projected. "
                "Use this when the user asks what has already been billed, which existing invoices are overdue, "
                "or what remains open on created invoice records. For pending or unissued first-invoice work, "
                "use list_invoice_issue_candidates."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Optional exact trade identifier filter.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional exact invoice status filter, such as ISSUED, APPROVED, or DISPUTED.",
                    },
                    "overdue_only": {
                        "type": "boolean",
                        "description": "Whether to return only overdue invoice rows. Defaults to false.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_trade_invoices,
        ),
        AssistantToolDefinition(
            name="list_invoice_issue_candidates",
            description=(
                "Load active trades that need their first settlement invoice record, including deterministic "
                "invoice-issue preview status and blockers. Use this when the workspace summary shows pending "
                "or unissued invoices, or when the user asks to handle open invoice work that is not yet an "
                "invoice ledger row."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "ready_only": {
                        "type": "boolean",
                        "description": "Whether to return only candidates whose invoice-issue preview is READY. Defaults to false.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_invoice_issue_candidates,
        ),
        AssistantToolDefinition(
            name="list_trade_payments",
            description=(
                "Load settlement payment records with invoice balance context. Use this when the user asks "
                "what cash is due, what has been paid, or which payments are overdue for a trade or invoice."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Optional exact trade identifier filter.",
                    },
                    "invoice_id": {
                        "type": "integer",
                        "description": "Optional exact invoice identifier filter.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional exact payment status filter, such as PENDING, DUE, OVERDUE, or PAID.",
                    },
                    "overdue_only": {
                        "type": "boolean",
                        "description": "Whether to return only overdue payment rows. Defaults to false.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_trade_payments,
        ),
        AssistantToolDefinition(
            name="get_trade_settlement_summary",
            description=(
                "Build a settlement summary for one trade by aggregating invoice and payment records. Use "
                "this when the user asks what is invoiced, paid, outstanding, disputed, or overdue."
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
            executor=_get_trade_settlement_summary,
        ),
        AssistantToolDefinition(
            name="list_deliveries",
            description=(
                "Load delivery obligations with execution and actualization context. Use this when the user "
                "asks about shipment scheduling, execution progress, delivery ownership, or physical follow-up "
                "for one or more trades."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Optional exact trade identifier filter.",
                    },
                    "execution_status": {
                        "type": "string",
                        "description": "Optional execution status filter, such as PLANNED, SCHEDULED, IN_PROGRESS, or COMPLETED.",
                    },
                    "operations_owner": {
                        "type": "string",
                        "description": "Optional case-insensitive owner search.",
                    },
                    "commodity": {
                        "type": "string",
                        "description": "Optional exact commodity code filter.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_deliveries,
        ),
        AssistantToolDefinition(
            name="list_documents",
            description=(
                "Load document-ingestion records with classification and routing summaries. Use this when the "
                "user asks what documents are available, which ones still need review, or what kind of "
                "trading or settlement document has been processed."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Optional exact document ingestion status such as UPLOADED, PROCESSING, ANALYZED, or FAILED.",
                    },
                    "review_status": {
                        "type": "string",
                        "description": "Optional exact review status such as UNREVIEWED, IN_REVIEW, or VERIFIED.",
                    },
                    "document_kind": {
                        "type": "string",
                        "description": "Optional dominant document kind filter such as TRADE_CONFIRMATION or INVOICE.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 5 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_documents,
        ),
        AssistantToolDefinition(
            name="get_document_ingestion",
            description=(
                "Load one document-ingestion record including page-level extracted fields, table blocks, and "
                "routing assessment. Use this when the user wants the detailed parsed view of a document."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "Exact document identifier.",
                    }
                },
                "required": ["document_id"],
                "additionalProperties": False,
            },
            executor=_get_document_ingestion,
        ),
        AssistantToolDefinition(
            name="get_workspace_summary",
            description=(
                "Load the operator workspace bootstrap summary across trades, positions, work items, "
                "confirmations, invoices, payments, dashboard attention, and settlement health. Use this "
                "for a compact current-state overview of the platform."
            ),
            parameters={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            executor=_get_workspace_summary,
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
    stmt = select(Trade).order_by(*trade_recency_order())

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
    payload = {
        "count": len(rows),
        "items": [_serialize_trade(row) for row in rows],
        "latest_group": _serialize_latest_trade_group(db, rows[0]) if rows else None,
    }
    summary = f"Returned {len(rows)} trade projection row(s)."
    latest_group = payload["latest_group"]
    if latest_group and latest_group["count"] > 1:
        summary += (
            f" {latest_group['count']} trades share the latest ordering boundary at "
            f"{latest_group['updated_at']}."
        )
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(rows))


def _list_trade_events(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    limit = _normalize_limit(arguments.get("limit"), default=10)
    trade_id = _optional_text(arguments.get("trade_id"))
    aggregate_type = _optional_text(arguments.get("aggregate_type"))
    event_type = _optional_text(arguments.get("event_type"))
    event_id = _optional_text(arguments.get("event_id"))

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
    if event_id:
        stmt = stmt.where(Event.event_id == event_id)

    rows = db.execute(stmt.limit(limit)).scalars().all()
    diagnostics = _build_event_lookup_diagnostics(
        db,
        trade_id=trade_id,
        event_type=event_type,
        event_id=event_id,
        matched_rows=rows,
    )
    payload = {
        "count": len(rows),
        "items": [_serialize_event(row) for row in rows],
        "diagnostics": diagnostics,
    }
    if trade_id:
        summary = f"Returned {len(rows)} event row(s) for trade {trade_id}."
        if diagnostics["consistency_status"] == "projection_last_event_missing":
            summary += (
                f" Trade projection exists but last_event_id "
                f"{diagnostics['trade_projection_last_event_id']} is missing from the event store."
            )
        elif diagnostics["consistency_status"] == "projection_last_event_mismatch":
            summary += " Trade projection exists but its last_event_id points to a different aggregate."
        elif diagnostics["consistency_status"] == "trade_projection_missing":
            summary += " No live trade projection matched that trade_id."
        elif diagnostics["consistency_status"] == "no_matching_events_for_filters":
            summary += " The trade has event rows, but none matched the requested filters."
    elif event_id:
        summary = f"Returned {len(rows)} event row(s) for event_id {event_id}."
    else:
        summary = f"Returned {len(rows)} event row(s)."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(rows))


def _serialize_latest_trade_group(db: Session, latest_trade: Trade) -> dict[str, Any]:
    latest_group_rows = db.execute(
        select(Trade.trade_id)
        .where(
            Trade.updated_at == latest_trade.updated_at,
            Trade.created_at == latest_trade.created_at,
        )
        .order_by(Trade.trade_id.desc())
    ).all()
    trade_ids = [row[0] for row in latest_group_rows]
    return {
        "updated_at": _json_default(latest_trade.updated_at),
        "created_at": _json_default(latest_trade.created_at),
        "count": len(trade_ids),
        "trade_ids": trade_ids,
    }


def _build_event_lookup_diagnostics(
    db: Session,
    *,
    trade_id: str | None,
    event_type: str | None,
    event_id: str | None,
    matched_rows: list[Event],
) -> dict[str, Any]:
    diagnostics: dict[str, Any] = {
        "trade_id": trade_id,
        "event_id": event_id,
        "event_type": event_type,
        "trade_projection_found": False,
        "trade_projection_last_event_id": None,
        "last_event_found": False,
        "last_event_matches_trade": False,
        "total_trade_events": len(matched_rows) if trade_id and event_type is None and event_id is None else None,
        "consistency_status": "ok",
    }
    if not trade_id:
        if event_id is not None:
            diagnostics["last_event_found"] = bool(matched_rows)
            diagnostics["consistency_status"] = "ok" if matched_rows else "event_missing"
        return diagnostics

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        diagnostics["consistency_status"] = "trade_projection_missing"
        return diagnostics

    diagnostics["trade_projection_found"] = True
    diagnostics["trade_projection_last_event_id"] = trade.last_event_id

    total_trade_events = db.execute(
        select(func.count())
        .select_from(Event)
        .where(
            Event.aggregate_type == "trade",
            Event.aggregate_id == trade_id,
        )
    ).scalar_one()
    diagnostics["total_trade_events"] = int(total_trade_events)

    last_event = db.execute(select(Event).where(Event.event_id == trade.last_event_id)).scalars().first()
    if last_event is not None:
        diagnostics["last_event_found"] = True
        diagnostics["last_event_matches_trade"] = (
            last_event.aggregate_type == "trade" and last_event.aggregate_id == trade_id
        )

    if matched_rows:
        if last_event is None:
            diagnostics["consistency_status"] = "projection_last_event_missing"
        elif not diagnostics["last_event_matches_trade"]:
            diagnostics["consistency_status"] = "projection_last_event_mismatch"
        return diagnostics

    if total_trade_events > 0:
        diagnostics["consistency_status"] = "no_matching_events_for_filters"
    elif last_event is None:
        diagnostics["consistency_status"] = "projection_last_event_missing"
    elif not diagnostics["last_event_matches_trade"]:
        diagnostics["consistency_status"] = "projection_last_event_mismatch"
    else:
        diagnostics["consistency_status"] = "aggregate_events_missing"
    return diagnostics


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


def _list_workflow_items(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    limit = _normalize_limit(arguments.get("limit"), default=10)
    trade_id = _optional_text(arguments.get("trade_id"))
    workflow_type = _normalize_optional_workflow_type(arguments.get("workflow_type"))
    status = _optional_upper(arguments.get("status"))
    owner = _optional_text(arguments.get("owner"))
    queue = _normalize_optional_workflow_queue(arguments.get("queue"))
    include_closed = _normalize_bool(
        arguments.get("include_closed"),
        default=False,
        field_name="include_closed",
    )

    stmt = select(TradeWorkflowItem, Trade).join(Trade, Trade.trade_id == TradeWorkflowItem.trade_id)
    if trade_id:
        stmt = stmt.where(TradeWorkflowItem.trade_id == trade_id)
    if queue:
        stmt = stmt.where(TradeWorkflowItem.workflow_type.in_(_workflow_types_for_queue(queue)))
    if workflow_type:
        stmt = stmt.where(TradeWorkflowItem.workflow_type == workflow_type)
    if status:
        stmt = stmt.where(TradeWorkflowItem.status == status)
    if owner:
        stmt = stmt.where(TradeWorkflowItem.owner.ilike(f"%{owner}%"))
    if not include_closed:
        stmt = stmt.where(_workflow_item_open_predicate())

    rows = db.execute(
        stmt.order_by(
            TradeWorkflowItem.due_at.is_(None),
            TradeWorkflowItem.due_at.asc(),
            TradeWorkflowItem.updated_at.desc(),
            TradeWorkflowItem.id.desc(),
        ).limit(limit)
    ).all()

    reference_time = datetime.now(timezone.utc)
    items = [
        _serialize_workflow_item(item, trade, reference_time=reference_time)
        for item, trade in rows
    ]
    overdue_count = sum(1 for item in items if item["is_overdue"])
    payload = {"count": len(items), "items": items}

    summary_parts = [f"Returned {len(items)} workflow item(s)"]
    if queue:
        summary_parts.append(f"from the {queue} queue")
    if workflow_type:
        summary_parts.append(f"for workflow type {workflow_type}")
    if trade_id:
        summary_parts.append(f"for trade {trade_id}")
    summary = " ".join(summary_parts).rstrip(".") + "."
    if overdue_count:
        summary += f" {overdue_count} item(s) are overdue."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


def _list_trade_confirmations(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    limit = _normalize_limit(arguments.get("limit"), default=10)
    trade_id = _optional_text(arguments.get("trade_id"))
    status = _normalize_optional_confirmation_status(arguments.get("status"))
    receipt_status = _normalize_optional_confirmation_receipt_status(arguments.get("receipt_status"))
    current_only = _normalize_bool(
        arguments.get("current_only"),
        default=True,
        field_name="current_only",
    )

    latest_confirmation_subquery = (
        select(
            TradeConfirmation.trade_id.label("trade_id"),
            func.max(TradeConfirmation.id).label("current_confirmation_id"),
        )
        .group_by(TradeConfirmation.trade_id)
        .subquery()
    )

    stmt = (
        select(
            TradeConfirmation,
            Trade,
            TradeWorkflowItem,
            latest_confirmation_subquery.c.current_confirmation_id,
        )
        .join(Trade, Trade.trade_id == TradeConfirmation.trade_id)
        .outerjoin(
            TradeWorkflowItem,
            and_(
                TradeWorkflowItem.trade_id == TradeConfirmation.trade_id,
                TradeWorkflowItem.workflow_type == TradeWorkflowType.CONFIRMATION.value,
            ),
        )
        .outerjoin(
            latest_confirmation_subquery,
            latest_confirmation_subquery.c.trade_id == TradeConfirmation.trade_id,
        )
        .where(Trade.status == "ACTIVE")
    )
    if trade_id:
        stmt = stmt.where(TradeConfirmation.trade_id == trade_id)
    if status:
        stmt = stmt.where(TradeConfirmation.status == status)
    if receipt_status:
        stmt = stmt.where(TradeConfirmation.receipt_status == receipt_status)
    if current_only:
        stmt = stmt.where(TradeConfirmation.id == latest_confirmation_subquery.c.current_confirmation_id)

    rows = db.execute(
        stmt.order_by(TradeConfirmation.created_at.desc(), TradeConfirmation.id.desc()).limit(limit)
    ).all()
    items = [
        _serialize_trade_confirmation(
            confirmation,
            trade,
            workflow_item,
            is_current=confirmation.id == current_confirmation_id,
        )
        for confirmation, trade, workflow_item, current_confirmation_id in rows
    ]
    attention_count = sum(1 for item in items if item["needs_attention"])
    payload = {"count": len(items), "items": items}

    row_label = "current confirmation row(s)" if current_only else "confirmation row(s)"
    summary = f"Returned {len(items)} {row_label}."
    if trade_id:
        summary = f"Returned {len(items)} {row_label} for trade {trade_id}."
    if attention_count:
        summary += f" {attention_count} row(s) need follow-up."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


def _get_trade_workbench(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    trade_id = _require_text(arguments.get("trade_id"), field_name="trade_id")
    row_limit = _normalize_section_limit(arguments.get("row_limit"), default=5)
    event_limit = _normalize_section_limit(arguments.get("event_limit"), default=5)

    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return AssistantToolExecutionResult(
            output={"found": False, "trade_id": trade_id},
            summary=f"No live trade projection matched trade_id {trade_id}.",
            record_count=0,
        )

    recent_events_result = _list_trade_events(db, {"trade_id": trade_id, "limit": event_limit})
    workflow_result = _list_workflow_items(db, {"trade_id": trade_id, "limit": row_limit})
    confirmation_result = _list_trade_confirmations(
        db,
        {"trade_id": trade_id, "current_only": False, "limit": row_limit},
    )
    settlement_result = _get_trade_settlement_summary(db, {"trade_id": trade_id})
    deliveries_result = _list_deliveries(db, {"trade_id": trade_id, "limit": row_limit})

    open_work_item_count = int(
        db.execute(
            select(func.count())
            .select_from(TradeWorkflowItem)
            .where(
                TradeWorkflowItem.trade_id == trade_id,
                _workflow_item_open_predicate(),
            )
        ).scalar_one()
    )
    total_event_count = int(
        db.execute(
            select(func.count())
            .select_from(Event)
            .where(
                Event.aggregate_type == "trade",
                Event.aggregate_id == trade_id,
            )
        ).scalar_one()
    )
    total_confirmation_count = int(
        db.execute(
            select(func.count())
            .select_from(TradeConfirmation)
            .where(TradeConfirmation.trade_id == trade_id)
        ).scalar_one()
    )
    total_delivery_count = int(
        db.execute(
            select(func.count())
            .select_from(DeliveryObligation)
            .where(DeliveryObligation.trade_id == trade_id)
        ).scalar_one()
    )

    payload = {
        "found": True,
        "trade": _serialize_trade(trade),
        "recent_events": {
            "count": recent_events_result.output["count"],
            "total_count": total_event_count,
            "items": recent_events_result.output["items"],
            "diagnostics": recent_events_result.output["diagnostics"],
        },
        "workflow": {
            "count": workflow_result.output["count"],
            "open_count": open_work_item_count,
            "items": workflow_result.output["items"],
        },
        "confirmations": {
            "count": confirmation_result.output["count"],
            "total_count": total_confirmation_count,
            "items": confirmation_result.output["items"],
        },
        "settlement": settlement_result.output,
        "deliveries": {
            "count": deliveries_result.output["count"],
            "total_count": total_delivery_count,
            "items": deliveries_result.output["items"],
        },
    }
    summary = (
        f"Built trade workbench for {trade_id}: {open_work_item_count} open workflow item(s), "
        f"{total_confirmation_count} confirmation row(s), "
        f"{settlement_result.output['invoice_count']} invoice(s), "
        f"{settlement_result.output['payment_count']} payment(s), and "
        f"{total_delivery_count} delivery row(s)."
    )
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=1)


def _list_trade_invoices(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    trade_id = _optional_text(arguments.get("trade_id"))
    status = _optional_upper(arguments.get("status"))
    overdue_only = _normalize_bool(
        arguments.get("overdue_only"),
        default=False,
        field_name="overdue_only",
    )
    limit = _normalize_limit(arguments.get("limit"), default=10)

    rows = load_trade_invoices(db, trade_id=trade_id, limit=None)
    if status:
        rows = [row for row in rows if row.status == status]
    if overdue_only:
        rows = [row for row in rows if row.is_overdue]
    rows = rows[:limit]

    items = [_dump_model(row) for row in rows]
    overdue_count = sum(1 for row in rows if row.is_overdue)
    payload = {"count": len(items), "items": items}
    summary = f"Returned {len(items)} trade invoice row(s)."
    if trade_id:
        summary = f"Returned {len(items)} trade invoice row(s) for trade {trade_id}."
    if overdue_count:
        summary += f" {overdue_count} invoice(s) are overdue."
    if trade_id is None and not status and not overdue_only:
        candidate_count = load_invoice_issue_candidate_count(db)
        if candidate_count:
            payload["unissued_invoice_candidate_count"] = candidate_count
            payload["suggested_next_tool"] = "list_invoice_issue_candidates"
            candidate_summary = (
                f"{candidate_count} active trade(s) need first invoice records; "
                "use list_invoice_issue_candidates to inspect those candidates."
            )
            if items:
                summary += f" Separately, {candidate_summary}"
            else:
                summary += f" {candidate_summary}"
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


def _list_invoice_issue_candidates(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    ready_only = _normalize_bool(
        arguments.get("ready_only"),
        default=False,
        field_name="ready_only",
    )
    limit = _normalize_limit(arguments.get("limit"), default=10)

    rows = load_invoice_issue_candidates(db, limit=None)
    if ready_only:
        rows = [row for row in rows if row.readiness_status == "READY"]
    rows = rows[:limit]

    items = [_dump_invoice_issue_candidate(row) for row in rows]
    ready_count = sum(1 for row in rows if row.readiness_status == "READY")
    blocked_count = sum(1 for row in rows if row.readiness_status == "BLOCKED")
    payload = {
        "count": len(items),
        "ready_count": ready_count,
        "blocked_count": blocked_count,
        "items": items,
    }
    summary = (
        f"Returned {len(items)} invoice issue candidate trade(s): "
        f"{ready_count} ready and {blocked_count} blocked by deterministic preview checks."
    )
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


def _list_trade_payments(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    trade_id = _optional_text(arguments.get("trade_id"))
    invoice_id = _normalize_optional_int(arguments.get("invoice_id"), field_name="invoice_id")
    status = _optional_upper(arguments.get("status"))
    overdue_only = _normalize_bool(
        arguments.get("overdue_only"),
        default=False,
        field_name="overdue_only",
    )
    limit = _normalize_limit(arguments.get("limit"), default=10)

    rows = load_trade_payments(db, trade_id=trade_id, invoice_id=invoice_id, limit=None)
    if status:
        rows = [row for row in rows if row.status == status]
    if overdue_only:
        rows = [row for row in rows if row.is_overdue]
    rows = rows[:limit]

    items = [_dump_model(row) for row in rows]
    overdue_count = sum(1 for row in rows if row.is_overdue)
    payload = {"count": len(items), "items": items}
    summary = f"Returned {len(items)} trade payment row(s)."
    if trade_id:
        summary = f"Returned {len(items)} trade payment row(s) for trade {trade_id}."
    elif invoice_id is not None:
        summary = f"Returned {len(items)} trade payment row(s) for invoice {invoice_id}."
    if overdue_count:
        summary += f" {overdue_count} payment(s) are overdue."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


def _get_trade_settlement_summary(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    trade_id = _require_text(arguments.get("trade_id"), field_name="trade_id")
    trade = db.execute(select(Trade).where(Trade.trade_id == trade_id)).scalars().first()
    if trade is None:
        return AssistantToolExecutionResult(
            output={"found": False, "trade_id": trade_id},
            summary=f"No live trade projection matched trade_id {trade_id}.",
            record_count=0,
        )

    invoices = load_trade_invoices(db, trade_id=trade_id, limit=None)
    payments = load_trade_payments(db, trade_id=trade_id, limit=None)
    total_invoiced_amount = sum(float(row.invoice_amount) for row in invoices)
    total_paid_amount = sum(float(row.payment_amount) for row in payments if row.status == PaymentStatus.PAID.value)
    total_outstanding_amount = sum(float(row.outstanding_amount) for row in invoices)
    overdue_invoice_count = sum(1 for row in invoices if row.is_overdue)
    overdue_payment_count = sum(1 for row in payments if row.is_overdue)
    disputed_invoice_count = sum(1 for row in invoices if row.status == InvoiceStatus.DISPUTED.value)

    latest_invoice_due_at = max((row.due_at for row in invoices), default=None)
    latest_payment_due_at = max((row.due_at for row in payments), default=None)

    payload = {
        "found": True,
        "trade_id": trade_id,
        "trade_status": trade.status,
        "invoice_status": trade.invoice_status,
        "payment_status": trade.payment_status,
        "settlement_status": trade.settlement_status,
        "invoice_count": len(invoices),
        "payment_count": len(payments),
        "total_invoiced_amount": total_invoiced_amount,
        "total_paid_amount": total_paid_amount,
        "outstanding_amount": total_outstanding_amount,
        "overdue_invoice_count": overdue_invoice_count,
        "overdue_payment_count": overdue_payment_count,
        "disputed_invoice_count": disputed_invoice_count,
        "latest_invoice_due_at": _json_default(latest_invoice_due_at),
        "latest_payment_due_at": _json_default(latest_payment_due_at),
        "invoices": [_dump_model(row) for row in invoices[:10]],
        "payments": [_dump_model(row) for row in payments[:10]],
    }
    summary = (
        f"Settlement summary for {trade_id}: {len(invoices)} invoice(s), {len(payments)} payment(s), "
        f"{total_outstanding_amount:.2f} outstanding, "
        f"{overdue_invoice_count} overdue invoice(s), and {overdue_payment_count} overdue payment(s)."
    )
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(invoices) + len(payments))


def _list_deliveries(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    trade_id = _optional_text(arguments.get("trade_id"))
    execution_status = _optional_upper(arguments.get("execution_status"))
    operations_owner = _optional_text(arguments.get("operations_owner"))
    commodity = _optional_upper(arguments.get("commodity"))
    limit = _normalize_limit(arguments.get("limit"), default=10)

    stmt = select(DeliveryObligation, Trade).join(Trade, Trade.trade_id == DeliveryObligation.trade_id)
    if trade_id:
        stmt = stmt.where(DeliveryObligation.trade_id == trade_id)
    if execution_status:
        stmt = stmt.where(DeliveryObligation.execution_status == execution_status)
    if operations_owner:
        stmt = stmt.where(DeliveryObligation.operations_owner.ilike(f"%{operations_owner}%"))
    if commodity:
        stmt = stmt.where(DeliveryObligation.commodity == commodity)

    rows = db.execute(
        stmt.order_by(
            DeliveryObligation.delivery_start.is_(None),
            DeliveryObligation.delivery_start.asc(),
            DeliveryObligation.updated_at.desc(),
            DeliveryObligation.delivery_id.asc(),
        ).limit(limit)
    ).all()

    delivery_ids = [delivery.delivery_id for delivery, _trade in rows]
    event_rows = (
        db.execute(
            select(
                DeliveryEvent.delivery_id,
                func.count(DeliveryEvent.id),
                func.max(DeliveryEvent.occurred_at),
            )
            .where(DeliveryEvent.delivery_id.in_(delivery_ids))
            .group_by(DeliveryEvent.delivery_id)
        ).all()
        if delivery_ids
        else []
    )
    event_summary_by_delivery_id = {
        delivery_id: {"event_count": int(event_count or 0), "latest_event_at": latest_event_at}
        for delivery_id, event_count, latest_event_at in event_rows
    }
    actualizations = (
        db.execute(select(TradeActualization).where(TradeActualization.delivery_id.in_(delivery_ids))).scalars().all()
        if delivery_ids
        else []
    )
    actualization_by_delivery_id = {
        actualization.delivery_id: actualization
        for actualization in actualizations
    }

    items = [
        _serialize_delivery_summary(
            delivery,
            trade,
            event_summary=event_summary_by_delivery_id.get(delivery.delivery_id),
            actualization=actualization_by_delivery_id.get(delivery.delivery_id),
        )
        for delivery, trade in rows
    ]
    payload = {"count": len(items), "items": items}
    summary = f"Returned {len(items)} delivery row(s)."
    if trade_id:
        summary = f"Returned {len(items)} delivery row(s) for trade {trade_id}."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


def _list_documents(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    status = _optional_upper(arguments.get("status"))
    review_status = _optional_upper(arguments.get("review_status"))
    document_kind = _optional_upper(arguments.get("document_kind"))
    limit = _normalize_limit(arguments.get("limit"), default=5)

    fetch_limit = max(limit * 4, 20)
    rows = load_document_ingestions(db, limit=fetch_limit, offset=0)
    if status:
        rows = [row for row in rows if row.status == status]
    if review_status:
        rows = [row for row in rows if row.review_status == review_status]
    if document_kind:
        rows = [
            row
            for row in rows
            if str(row.analysis_summary.get("dominant_document_kind") or "").strip().upper() == document_kind
        ]
    rows = rows[:limit]

    items = [_summarize_document(row) for row in rows]
    payload = {"count": len(items), "items": items}
    summary = f"Returned {len(items)} document row(s)."
    if document_kind:
        summary += f" Dominant document kind filter: {document_kind}."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


def _get_document_ingestion(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    document_id = _require_text(arguments.get("document_id"), field_name="document_id")
    try:
        document = load_document_ingestion(db, document_id=document_id)
    except LookupError:
        return AssistantToolExecutionResult(
            output={"found": False, "document_id": document_id},
            summary=f"Document {document_id} was not found.",
            record_count=0,
        )

    payload = {"found": True, "document": _dump_model(document)}
    dominant_kind = document.analysis_summary.get("dominant_document_kind")
    summary = (
        f"Loaded document {document_id} with status {document.status}, review status {document.review_status}, "
        f"and dominant kind {dominant_kind or 'UNKNOWN'}."
    )
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=1)


def _get_workspace_summary(db: Session, _arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    payload = {
        "generated_at": _json_default(datetime.now(timezone.utc)),
        **build_workspace_bootstrap_summary(db),
    }
    summary = (
        f"Workspace summary loaded: {payload['trades']['total_count']} trades, "
        f"{payload['work_items']['total_count']} workflow item(s), "
        f"{payload['invoices']['total_count']} invoice(s), and "
        f"{payload['payments']['total_count']} payment(s)."
    )
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=1)


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
        "instrument_type": trade.instrument_type,
        "option_type": trade.option_type,
        "option_style": trade.option_style,
        "option_strike_price": _json_default(trade.option_strike_price),
        "option_expiration_date": _json_default(trade.option_expiration_date),
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


def _serialize_workflow_item(
    item: TradeWorkflowItem,
    trade: Trade,
    *,
    reference_time: datetime,
) -> dict[str, Any]:
    created_at = _coerce_datetime(item.created_at)
    due_at = _coerce_optional_datetime(item.due_at)
    updated_at = _coerce_datetime(item.updated_at)
    is_closed = _workflow_item_is_closed(item.workflow_type, item.status)
    return {
        "item_id": item.id,
        "trade_id": item.trade_id,
        "queue": WORKFLOW_TYPE_TO_QUEUE.get(item.workflow_type, "operations"),
        "workflow_type": item.workflow_type,
        "status": item.status,
        "owner": item.owner,
        "due_at": _json_default(due_at),
        "notes": item.notes,
        "created_at": _json_default(created_at),
        "created_by": item.created_by,
        "updated_at": _json_default(updated_at),
        "updated_by": item.updated_by,
        "version": item.version,
        "is_closed": is_closed,
        "is_overdue": bool(due_at and due_at < reference_time and not is_closed),
        "age_days": max(0, int((reference_time - created_at).total_seconds() // 86_400)),
        "trade_status": trade.status,
        "trade_nature": trade.trade_nature,
        "book": trade.book,
        "portfolio": trade.portfolio,
        "counterparty": trade.counterparty,
        "commodity_class": trade.commodity_class,
        "commodity": trade.commodity,
        "trader_user": trade.trader_user,
        "trade_date": _json_default(trade.trade_date),
        "delivery_start": _json_default(trade.delivery_start),
        "delivery_end": _json_default(trade.delivery_end),
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


def _serialize_trade_confirmation(
    confirmation: TradeConfirmation,
    trade: Trade,
    workflow_item: TradeWorkflowItem | None,
    *,
    is_current: bool,
) -> dict[str, Any]:
    return {
        "confirmation_id": confirmation.id,
        "trade_id": confirmation.trade_id,
        "source_document_id": confirmation.source_document_id,
        "confirmation_number": confirmation.confirmation_number,
        "status": confirmation.status,
        "sent_at": _json_default(confirmation.sent_at),
        "confirmed_at": _json_default(confirmation.confirmed_at),
        "issue_count": confirmation.issue_count,
        "last_issued_at": _json_default(confirmation.last_issued_at),
        "last_issued_by": confirmation.last_issued_by,
        "last_issue_method": confirmation.last_issue_method,
        "last_issue_recipient": confirmation.last_issue_recipient,
        "last_issue_note": confirmation.last_issue_note,
        "receipt_status": confirmation.receipt_status,
        "received_at": _json_default(confirmation.received_at),
        "received_by": confirmation.received_by,
        "response_method": confirmation.response_method,
        "response_reference": confirmation.response_reference,
        "response_note": confirmation.response_note,
        "dispute_reason": confirmation.dispute_reason,
        "notes": confirmation.notes,
        "comparison_waiver_note": confirmation.comparison_waiver_note,
        "comparison_waived_at": _json_default(confirmation.comparison_waived_at),
        "comparison_waived_by": confirmation.comparison_waived_by,
        "created_at": _json_default(confirmation.created_at),
        "created_by": confirmation.created_by,
        "updated_at": _json_default(confirmation.updated_at),
        "updated_by": confirmation.updated_by,
        "version": confirmation.version,
        "workflow_item_id": workflow_item.id if workflow_item is not None else None,
        "workflow_owner": workflow_item.owner if workflow_item is not None else None,
        "workflow_due_at": _json_default(workflow_item.due_at) if workflow_item is not None else None,
        "is_current": is_current,
        "needs_attention": _confirmation_needs_attention(confirmation),
        "trade_status": trade.status,
        "trade_nature": trade.trade_nature,
        "book": trade.book,
        "portfolio": trade.portfolio,
        "counterparty": trade.counterparty,
        "commodity_class": trade.commodity_class,
        "commodity": trade.commodity,
        "trader_user": trade.trader_user,
        "trade_date": _json_default(trade.trade_date),
        "delivery_start": _json_default(trade.delivery_start),
        "delivery_end": _json_default(trade.delivery_end),
    }


def _serialize_delivery_summary(
    delivery: DeliveryObligation,
    trade: Trade,
    *,
    event_summary: dict[str, Any] | None,
    actualization: TradeActualization | None,
) -> dict[str, Any]:
    return {
        "delivery_id": delivery.delivery_id,
        "trade_id": delivery.trade_id,
        "leg_no": delivery.leg_no,
        "external_trade_id": delivery.external_trade_id,
        "direction": delivery.direction,
        "mode_family": delivery.mode_family,
        "transport_mode": delivery.transport_mode,
        "book": delivery.book,
        "portfolio": delivery.portfolio,
        "counterparty": delivery.counterparty,
        "commodity_class": delivery.commodity_class,
        "commodity": delivery.commodity,
        "volume": _json_default(delivery.volume),
        "unit_of_measure": delivery.unit_of_measure,
        "location_code": delivery.location_code,
        "delivery_start": _json_default(delivery.delivery_start),
        "delivery_end": _json_default(delivery.delivery_end),
        "execution_status": delivery.execution_status,
        "operations_owner": delivery.operations_owner,
        "external_reference": delivery.external_reference,
        "ops_notes": delivery.ops_notes,
        "booked_at": _json_default(delivery.booked_at),
        "updated_at": _json_default(delivery.updated_at),
        "event_count": int((event_summary or {}).get("event_count") or 0),
        "latest_event_at": _json_default((event_summary or {}).get("latest_event_at")),
        "actualized_quantity": _json_default(actualization.actual_quantity if actualization is not None else None),
        "actualized_at": _json_default(actualization.actualized_at if actualization is not None else None),
        "actualization_source": actualization.source if actualization is not None else None,
        "confirmation_status": trade.confirmation_status,
        "nomination_status": trade.nomination_status,
        "allocation_status": trade.allocation_status,
        "actualization_status": trade.actualization_status,
        "invoice_status": trade.invoice_status,
        "payment_status": trade.payment_status,
        "settlement_status": trade.settlement_status,
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


def _normalize_section_limit(value: Any, *, default: int) -> int:
    if value is None:
        return default
    try:
        limit = int(value)
    except (TypeError, ValueError) as exc:
        raise AssistantToolServiceError("section limits must be whole numbers.") from exc
    return max(1, min(limit, 10))


def _normalize_bool(value: Any, *, default: bool, field_name: str) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise AssistantToolServiceError(f"{field_name} must be a boolean.")


def _normalize_optional_workflow_queue(value: Any) -> str | None:
    normalized = _optional_text(value)
    if normalized is None:
        return None
    queue = normalized.lower()
    if queue not in {"operations", "settlement"}:
        raise AssistantToolServiceError("queue must be either operations or settlement.")
    return queue


def _normalize_optional_workflow_type(value: Any) -> str | None:
    normalized = _optional_text(value)
    if normalized is None:
        return None
    workflow_type = normalized.upper()
    if workflow_type not in WORKFLOW_TYPE_TO_QUEUE:
        allowed = ", ".join(sorted(WORKFLOW_TYPE_TO_QUEUE))
        raise AssistantToolServiceError(f"workflow_type must be one of {allowed}.")
    return workflow_type


def _normalize_optional_confirmation_status(value: Any) -> str | None:
    normalized = _optional_upper(value)
    if normalized is None:
        return None
    if normalized not in CONFIRMATION_STATUS_VALUES:
        allowed = ", ".join(sorted(CONFIRMATION_STATUS_VALUES))
        raise AssistantToolServiceError(f"status must be one of {allowed}.")
    return normalized


def _normalize_optional_confirmation_receipt_status(value: Any) -> str | None:
    normalized = _optional_upper(value)
    if normalized is None:
        return None
    if normalized not in CONFIRMATION_RECEIPT_STATUS_VALUES:
        allowed = ", ".join(sorted(CONFIRMATION_RECEIPT_STATUS_VALUES))
        raise AssistantToolServiceError(f"receipt_status must be one of {allowed}.")
    return normalized


def _normalize_optional_int(value: Any, *, field_name: str) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise AssistantToolServiceError(f"{field_name} must be a whole number.") from exc


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


def _workflow_item_open_predicate() -> Any:
    predicates = [
        and_(
            TradeWorkflowItem.workflow_type == workflow_type,
            ~TradeWorkflowItem.status.in_(tuple(closed_statuses)),
        )
        for workflow_type, closed_statuses in WORKFLOW_CLOSED_STATUS_VALUES.items()
    ]
    return or_(*predicates)


def _workflow_types_for_queue(queue: str) -> tuple[str, ...]:
    return tuple(
        workflow_type
        for workflow_type, workflow_queue in WORKFLOW_TYPE_TO_QUEUE.items()
        if workflow_queue == queue
    )


def _workflow_item_is_closed(workflow_type: str, status: str) -> bool:
    return status in WORKFLOW_CLOSED_STATUS_VALUES.get(workflow_type, set())


def _confirmation_needs_attention(confirmation: TradeConfirmation) -> bool:
    return confirmation.status == ConfirmationStatus.DISPUTED.value or confirmation.receipt_status in {
        ConfirmationReceiptStatus.ISSUED_AWAITING_RESPONSE.value,
        ConfirmationReceiptStatus.COUNTERPARTY_DISPUTED.value,
    }


def _summarize_document(document: Any) -> dict[str, Any]:
    analysis_summary = dict(getattr(document, "analysis_summary", {}) or {})
    return {
        "document_id": document.document_id,
        "display_name": document.display_name,
        "original_filename": document.original_filename,
        "status": document.status,
        "review_status": document.review_status,
        "page_count": document.page_count,
        "processor_provider": document.processor_provider,
        "processor_model": document.processor_model,
        "dominant_document_kind": analysis_summary.get("dominant_document_kind"),
        "page_kind_counts": analysis_summary.get("page_kind_counts", {}),
        "routing_status": analysis_summary.get("routing_status"),
        "routing_primary_record_type": analysis_summary.get("routing_primary_record_type"),
        "review_ready": analysis_summary.get("review_ready"),
        "review_blocker_count": analysis_summary.get("review_blocker_count"),
        "processing_error_count": len(document.processing_errors or []),
        "created_at": _json_default(document.created_at),
        "updated_at": _json_default(document.updated_at),
    }


def _dump_invoice_issue_candidate(value: Any) -> dict[str, Any]:
    return {
        "trade_id": value.trade_id,
        "trade_nature": value.trade_nature,
        "book": value.book,
        "portfolio": value.portfolio,
        "counterparty": value.counterparty,
        "commodity_class": value.commodity_class,
        "commodity": value.commodity,
        "trader_user": value.trader_user,
        "trade_date": _json_default(value.trade_date),
        "execution_timestamp": _json_default(value.execution_timestamp),
        "delivery_start": _json_default(value.delivery_start),
        "delivery_end": _json_default(value.delivery_end),
        "trade_currency_code": value.trade_currency_code,
        "invoice_status": value.invoice_status,
        "payment_status": value.payment_status,
        "settlement_status": value.settlement_status,
        "notional_amount": _json_default(value.notional_amount),
        "age_days": value.age_days,
        "readiness_status": value.readiness_status,
        "preview_summary": value.preview_summary,
        "blocking_reasons": list(value.blocking_reasons),
        "assumptions": list(value.assumptions),
        "recommended_action": value.recommended_action,
    }


def _dump_model(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    raise AssistantToolServiceError("Tool serialization expected a pydantic model instance.")


def _coerce_datetime(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _coerce_optional_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return _coerce_datetime(value)


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
