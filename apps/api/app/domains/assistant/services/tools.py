from __future__ import annotations

import inspect
import json
from dataclasses import dataclass, replace
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Awaitable, Callable, Optional

from pydantic import ValidationError
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.request_context import get_request_identity
from apps.api.app.domains.accruals.services.accruals import (
    build_accrual_reconciliation_report as load_accrual_reconciliation_report,
)
from apps.api.app.domains.accruals.services.accruals import (
    list_accrual_entries as load_accrual_entries,
)
from apps.api.app.domains.accruals.services.accruals import (
    list_accrual_lots as load_accrual_lots,
)
from apps.api.app.domains.accounting.services import (
    list_trade_accounting_entries as load_trade_accounting_entries,
)
from apps.api.app.domains.assistant.services.app_context_catalog import (
    APP_CONTEXT_INTROSPECTION_TOOL_NAMES,
    build_application_catalog,
    build_data_schema_catalog,
    read_codebase_file,
    search_codebase,
)
from apps.api.app.domains.documents.services.ingestion import (
    get_document_ingestion as load_document_ingestion,
)
from apps.api.app.domains.documents.services.ingestion import (
    list_document_ingestions as load_document_ingestions,
)
from apps.api.app.domains.home_views.services.definitions import (
    HOME_VIEW_ASSET_MAP_GEOGRAPHIES,
    HOME_VIEW_PRICE_MARK_STATUSES,
    HOME_VIEW_PRICE_QUOTE_TYPES,
    HOME_VIEW_PRICE_SORT_DIRECTIONS,
    HOME_VIEW_PRICE_SORT_FIELDS,
    build_home_system_template,
    list_visible_home_view_definitions,
    to_home_view_definition_out,
)
from apps.api.app.domains.home_views.services.registry import (
    HOME_SYSTEM_TEMPLATE_KEY,
    HOME_SYSTEM_TEMPLATE_VERSION,
    HOME_VIEW_CARD_REGISTRY,
)
from apps.api.app.domains.integrations.services.gmail_inbox import (
    GmailInboxIntegrationError,
    get_gmail_inbox_message_detail as load_gmail_inbox_message_detail,
)
from apps.api.app.domains.integrations.services.gmail_inbox import (
    list_gmail_inbox_messages as load_gmail_inbox_messages,
)
from apps.api.app.domains.messages.services.workspace import (
    list_messaging_workspace_state as load_messaging_workspace_state,
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
from apps.api.app.domains.reports.services.settlement import (
    build_settlement_filter_options,
)
from apps.api.app.domains.reports.services.settlement_presets import (
    list_visible_settlement_presets,
    to_settlement_preset_out,
)
from apps.api.app.domains.operations.services.trade_attention_candidates import (
    TRADE_ATTENTION_CANDIDATE_TYPE_NAMES,
    count_trade_attention_candidates as load_trade_attention_candidate_count,
    get_trade_attention_candidate_definition,
    list_trade_attention_candidates as load_trade_attention_candidates,
)
from apps.api.app.domains.reports.services.pretrade_recommendations import (
    accessible_recommendation_run_records,
    build_pretrade_recommendation_draft_analysis,
    get_accessible_recommendation_run_record,
    latest_accessible_recommendation_run_record,
    previous_recommendation_run_record,
    to_recommendation_run_out,
)
from apps.api.app.domains.reference_data.services.external_data.market_context import (
    build_latest_price_snapshot,
    build_market_context,
)
from apps.api.app.domains.reference_data.services.external_data.market_news import (
    DEFAULT_MARKET_NEWS_LOOKBACK_DAYS,
    MarketNewsClientError,
    load_market_news_headlines,
)
from apps.api.app.domains.reference_data.services.records import list_reference_records, normalize_code
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade import Trade, trade_recency_order
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.assistant import (
    AssistantToolCallOut,
    AssistantToolDefinitionOut,
    AssistantToolEvidenceOut,
)
from apps.api.app.schemas.pretrade import PreTradeRecommendationDraftAnalysisCreate
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
    "calendars": "calendars",
    "calendar": "calendars",
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

MANAGED_AGENT_BUILD_RECIPE = "role + skills + capabilities + workspaces + live tools + governed actions + system prompt"
MANAGED_AGENT_INTROSPECTION_TOOL_NAMES: tuple[str, ...] = (
    "list_managed_agents",
    "get_managed_agent_profile",
)
GLOBAL_READ_INTROSPECTION_TOOL_NAMES: tuple[str, ...] = (
    *MANAGED_AGENT_INTROSPECTION_TOOL_NAMES,
    *APP_CONTEXT_INTROSPECTION_TOOL_NAMES,
)
HOME_VIEW_ASSISTANT_TOOL_NAMES: tuple[str, ...] = (
    "list_home_view_cards",
    "get_home_system_template",
    "get_home_view_filter_options",
    "list_home_view_instances",
)
MANAGED_AGENT_COORDINATION_TOOL_NAMES: tuple[str, ...] = (
    "consult_managed_agent",
    "enlist_managed_agent",
)
MAX_MANAGED_AGENT_DELEGATION_DEPTH = 2

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
    executor: Callable[[Session, dict[str, Any]], "AssistantToolExecutionResult | Awaitable[AssistantToolExecutionResult]"]


@dataclass(frozen=True)
class AssistantToolExecutionResult:
    output: dict[str, Any]
    summary: str
    record_count: Optional[int] = None
    is_error: bool = False
    evidence_items: tuple[AssistantToolEvidenceOut, ...] = ()


@dataclass(frozen=True)
class AssistantToolCallTrace:
    tool_name: str
    arguments: dict[str, Any]
    summary: str
    record_count: Optional[int] = None
    output_preview: dict[str, Any] | None = None
    evidence_items: tuple[AssistantToolEvidenceOut, ...] = ()

    def to_out(self) -> AssistantToolCallOut:
        return AssistantToolCallOut(
            tool_name=self.tool_name,
            arguments=self.arguments,
            summary=self.summary,
            record_count=self.record_count,
            output_preview=dict(self.output_preview or {}),
            evidence_items=[
                evidence_item
                if isinstance(evidence_item, AssistantToolEvidenceOut)
                else AssistantToolEvidenceOut.model_validate(evidence_item)
                for evidence_item in self.evidence_items
            ],
        )


def _trim_tool_output_text(value: Any, *, max_length: int = 480) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.split()).strip()
    if not normalized:
        return None
    if len(normalized) <= max_length:
        return normalized
    return f"{normalized[: max_length - 3].rstrip()}..."


def _normalize_tool_evidence_badges(values: list[str | None]) -> list[str]:
    badges: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value is None:
            continue
        normalized = " ".join(value.split()).strip()
        if not normalized or normalized in seen:
            continue
        badges.append(normalized)
        seen.add(normalized)
    return badges


def _tool_evidence_locator(path: str, *, start_line: int | None = None, end_line: int | None = None) -> str:
    if start_line is None:
        return path
    if end_line is None or end_line == start_line:
        return f"{path}:{start_line}"
    return f"{path}:{start_line}-{end_line}"


def _build_tool_evidence_item(
    *,
    kind: str,
    title: str,
    summary: str,
    locator: str | None = None,
    excerpt: str | None = None,
    badges: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> AssistantToolEvidenceOut:
    return AssistantToolEvidenceOut(
        kind=kind,
        title=title,
        summary=summary,
        locator=locator,
        excerpt=excerpt,
        badges=list(badges or []),
        metadata=dict(metadata or {}),
    )


def _build_managed_agent_list_evidence(items: list[dict[str, Any]]) -> tuple[AssistantToolEvidenceOut, ...]:
    manager_count = sum(1 for item in items if item.get("managed_agent_ids"))
    parent_link_count = sum(1 for item in items if item.get("parent_agent_id"))
    evidence_items = [
        _build_tool_evidence_item(
            kind="agent_hierarchy",
            title="Managed agent roster",
            summary=(
                f"{len(items)} active managed agent profile(s) are available for assistant coordination."
            ),
            badges=_normalize_tool_evidence_badges(
                [
                    f"{manager_count} manager(s)",
                    f"{parent_link_count} child link(s)",
                ]
            ),
            metadata={
                "agent_count": len(items),
                "manager_count": manager_count,
                "parent_link_count": parent_link_count,
            },
        )
    ]
    for item in items[:4]:
        evidence_items.append(
            _build_tool_evidence_item(
                kind="agent",
                title=str(item.get("name") or item.get("agent_id") or "Managed agent"),
                locator=str(item.get("agent_id") or "") or None,
                summary=str(item.get("relationship_summary") or item.get("description") or "Managed agent profile."),
                badges=_normalize_tool_evidence_badges(
                    [
                        str(item.get("role_key") or "") or None,
                        str(item.get("profile_kind") or "") or None,
                        str(item.get("orchestration_pattern") or "") or None,
                        (
                            f"{len(item.get('managed_agent_ids') or [])} subordinate(s)"
                            if item.get("managed_agent_ids")
                            else None
                        ),
                    ]
                ),
            )
        )
    return tuple(evidence_items)


def _build_managed_agent_profile_evidence(output: dict[str, Any]) -> tuple[AssistantToolEvidenceOut, ...]:
    agent = output.get("agent") or {}
    relationships = output.get("relationships") or {}
    managed_agent_ids = list(relationships.get("managed_agent_ids") or [])
    managed_by_agent_ids = list(relationships.get("managed_by_agent_ids") or [])
    role_archetype = output.get("role_archetype") or {}
    evidence_items = [
        _build_tool_evidence_item(
            kind="agent",
            title=str(agent.get("name") or agent.get("agent_id") or "Managed agent"),
            locator=str(agent.get("agent_id") or "") or None,
            summary=str(agent.get("description") or "Managed agent profile."),
            badges=_normalize_tool_evidence_badges(
                [
                    str(agent.get("role_key") or "") or None,
                    str(agent.get("profile_kind") or "") or None,
                    str(agent.get("orchestration_pattern") or "") or None,
                    str(agent.get("authority_ceiling") or "") or None,
                ]
            ),
        ),
        _build_tool_evidence_item(
            kind="agent_hierarchy",
            title="Hierarchy wiring",
            locator=str(agent.get("agent_id") or "") or None,
            summary=str(
                relationships.get("summary")
                or f"{agent.get('name') or 'This agent'} has no configured parent or subordinate relationships."
            ),
            badges=_normalize_tool_evidence_badges(
                [
                    (
                        f"manages {', '.join(managed_agent_ids)}"
                        if managed_agent_ids
                        else None
                    ),
                    (
                        f"managed by {', '.join(managed_by_agent_ids)}"
                        if managed_by_agent_ids
                        else None
                    ),
                ]
            ),
            metadata={
                "managed_agent_ids": managed_agent_ids,
                "managed_by_agent_ids": managed_by_agent_ids,
            },
        ),
    ]
    if role_archetype:
        evidence_items.append(
            _build_tool_evidence_item(
                kind="agent",
                title=str(role_archetype.get("label") or role_archetype.get("role_key") or "Role archetype"),
                locator=str(role_archetype.get("role_key") or "") or None,
                summary=str(role_archetype.get("description") or "Curated managed-agent role archetype."),
                badges=_normalize_tool_evidence_badges(
                    [
                        str(role_archetype.get("catalog_status") or "") or None,
                        str(role_archetype.get("authority_ceiling") or "") or None,
                    ]
                ),
            )
        )
    return tuple(evidence_items)


def _build_application_catalog_evidence(payload: dict[str, Any]) -> tuple[AssistantToolEvidenceOut, ...]:
    evidence_items = [
        _build_tool_evidence_item(
            kind="application",
            title=str(payload.get("application", {}).get("name") or "ECTRM application catalog"),
            summary=(
                f"{payload.get('route_group_count', 0)} route group(s), "
                f"{payload.get('route_count', 0)} route(s), and "
                f"{len(payload.get('workspace_catalog') or [])} workspace(s) are published."
            ),
            badges=_normalize_tool_evidence_badges(
                [
                    f"{len(payload.get('frontend_workspace_modules') or [])} frontend workspace module(s)",
                    f"{len(payload.get('schema_modules') or [])} schema module(s)",
                ]
            ),
        )
    ]
    for route_group in list(payload.get("route_groups") or [])[:3]:
        evidence_items.append(
            _build_tool_evidence_item(
                kind="route_group",
                title=str(route_group.get("name") or route_group.get("domain") or "Route group"),
                locator=str(route_group.get("domain") or "") or None,
                summary=(
                    f"{route_group.get('route_count', 0)} route(s) are registered under "
                    f"{route_group.get('domain') or 'this domain'}."
                ),
                badges=_normalize_tool_evidence_badges(
                    [
                        f"{len(route_group.get('routes') or [])} route definition(s)",
                    ]
                ),
            )
        )
    documentation_entry_points = list(payload.get("documentation_entry_points") or [])
    if documentation_entry_points:
        evidence_items.append(
            _build_tool_evidence_item(
                kind="documentation",
                title="Documentation entry points",
                summary=(
                    f"{len(documentation_entry_points)} documentation file(s) are exposed through the app catalog."
                ),
                locator=documentation_entry_points[0],
                badges=documentation_entry_points[:3],
            )
        )
    return tuple(evidence_items)


def _build_schema_catalog_evidence(payload: dict[str, Any], *, table_name: str | None) -> tuple[AssistantToolEvidenceOut, ...]:
    if table_name is not None:
        if not payload.get("found", False):
            return (
                _build_tool_evidence_item(
                    kind="schema",
                    title="Schema lookup",
                    locator=table_name,
                    summary=f"No database table matched {table_name}.",
                ),
            )
        table_payload = payload.get("table") or {}
        return (
            _build_tool_evidence_item(
                kind="table",
                title=str(table_payload.get("table_name") or table_name),
                locator=str(table_payload.get("model_name") or table_payload.get("table_name") or table_name),
                summary=(
                    f"{table_payload.get('column_count', 0)} column(s), "
                    f"{len(table_payload.get('foreign_keys') or [])} relationship(s), "
                    f"record count {table_payload.get('record_count', 'n/a')}."
                ),
                badges=_normalize_tool_evidence_badges(
                    [
                        (
                            f"pk: {', '.join(table_payload.get('primary_key') or [])}"
                            if table_payload.get("primary_key")
                            else None
                        ),
                    ]
                ),
            ),
        )

    return (
        _build_tool_evidence_item(
            kind="schema",
            title="Database schema catalog",
            summary=(
                f"{payload.get('table_count', 0)} table(s) and "
                f"{payload.get('relationship_count', 0)} foreign-key relationship(s) are mapped."
            ),
        ),
    )


def _build_code_search_evidence(payload: dict[str, Any]) -> tuple[AssistantToolEvidenceOut, ...]:
    evidence_items: list[AssistantToolEvidenceOut] = []
    for item in list(payload.get("items") or [])[:5]:
        path = str(item.get("path") or "codebase")
        line_number = item.get("line_number")
        evidence_items.append(
            _build_tool_evidence_item(
                kind="code_search_hit",
                title=path,
                locator=_tool_evidence_locator(path, start_line=int(line_number)) if isinstance(line_number, int) else path,
                summary=str(item.get("snippet") or "Code search match."),
                badges=_normalize_tool_evidence_badges(
                    [
                        str(payload.get("scope") or "") or None,
                        str(payload.get("query") or "") or None,
                    ]
                ),
            )
        )
    return tuple(evidence_items)


def _build_code_file_evidence(payload: dict[str, Any]) -> tuple[AssistantToolEvidenceOut, ...]:
    path = str(payload.get("path") or "codebase file")
    start_line = payload.get("start_line")
    end_line = payload.get("end_line")
    excerpt = _trim_tool_output_text(payload.get("content"), max_length=420)
    return (
        _build_tool_evidence_item(
            kind="code_file",
            title=path,
            locator=(
                _tool_evidence_locator(path, start_line=start_line, end_line=end_line)
                if isinstance(start_line, int)
                else path
            ),
            summary=(
                f"Read lines {payload.get('start_line', 'n/a')}-{payload.get('end_line', 'n/a')} "
                f"out of {payload.get('total_lines', 'n/a')} total line(s)."
            ),
            excerpt=excerpt,
            badges=_normalize_tool_evidence_badges(
                [
                    "truncated" if payload.get("truncated") else None,
                ]
            ),
        ),
    )


def _build_home_view_card_registry_evidence(payload: dict[str, Any]) -> tuple[AssistantToolEvidenceOut, ...]:
    return (
        _build_tool_evidence_item(
            kind="application",
            title="Home card registry",
            locator="home_view_cards",
            summary=(
                f"{payload.get('card_count', 0)} supported Home card(s) are available on "
                f"{payload.get('template_key', HOME_SYSTEM_TEMPLATE_KEY)} v{payload.get('template_version', HOME_SYSTEM_TEMPLATE_VERSION)}."
            ),
            badges=_normalize_tool_evidence_badges(
                [
                    "read-only",
                    f"{len(payload.get('supported_filter_fields') or [])} filter field(s)",
                ]
            ),
            metadata={
                "template_key": payload.get("template_key"),
                "template_version": payload.get("template_version"),
                "card_ids": [row.get("card_id") for row in payload.get("cards") or []],
            },
        ),
    )


def _build_home_system_template_evidence(payload: dict[str, Any]) -> tuple[AssistantToolEvidenceOut, ...]:
    return (
        _build_tool_evidence_item(
            kind="application",
            title=str(payload.get("label") or "System Home"),
            locator=str(payload.get("template_key") or HOME_SYSTEM_TEMPLATE_KEY),
            summary=(
                f"Immutable Home template v{payload.get('template_version')} includes "
                f"{payload.get('card_count', 0)} card(s)."
            ),
            badges=_normalize_tool_evidence_badges(["immutable", "read-only"]),
            metadata={
                "template_key": payload.get("template_key"),
                "template_version": payload.get("template_version"),
                "card_ids": [row.get("card_id") for row in payload.get("cards") or []],
            },
        ),
    )


def _build_home_view_filter_options_evidence(payload: dict[str, Any]) -> tuple[AssistantToolEvidenceOut, ...]:
    cards = list(payload.get("cards") or [])
    return (
        _build_tool_evidence_item(
            kind="application",
            title="Home card filter options",
            locator=str(payload.get("card_id") or "all_home_cards"),
            summary=(
                f"Loaded supported filter and parameter option metadata for {len(cards)} Home card(s)."
            ),
            badges=_normalize_tool_evidence_badges(
                [
                    "read-only",
                    "reference-backed" if payload.get("includes_reference_options") else None,
                ]
            ),
            metadata={
                "card_id": payload.get("card_id"),
                "reference_option_limit": payload.get("reference_option_limit"),
                "card_ids": [row.get("card_id") for row in cards],
            },
        ),
    )


def _build_home_view_instances_evidence(payload: dict[str, Any]) -> tuple[AssistantToolEvidenceOut, ...]:
    items = list(payload.get("items") or [])
    warning_count = sum(
        1
        for item in items
        if (item.get("validation") or {}).get("warning_count")
    )
    return (
        _build_tool_evidence_item(
            kind="application",
            title="Visible Home view instances",
            locator=str(payload.get("actor_id") or "current_user"),
            summary=(
                f"{payload.get('count', 0)} visible active Home view instance(s) were loaded for the current actor."
            ),
            badges=_normalize_tool_evidence_badges(
                [
                    "visibility-scoped",
                    f"{payload.get('shared_count', 0)} shared",
                    f"{payload.get('personal_count', 0)} personal",
                    f"{warning_count} warning(s)" if warning_count else None,
                ]
            ),
            metadata={
                "actor_id": payload.get("actor_id"),
                "scope_filter": payload.get("scope_filter"),
                "definition_ids": [row.get("definition_id") for row in items],
            },
        ),
    )


def _build_tool_output_preview(tool_name: str, output: dict[str, Any]) -> dict[str, Any] | None:
    if tool_name == "consult_managed_agent":
        preview = {
            "advisory_only": True,
            "agent_id": output.get("agent_id"),
            "agent_name": output.get("agent_name"),
            "workspace": output.get("workspace"),
            "answer": _trim_tool_output_text(output.get("answer")),
            "warnings": list(output.get("warnings") or []),
        }
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "enlist_managed_agent":
        preview = {
            "delegated": True,
            "advisory_only": False,
            "agent_id": output.get("agent_id"),
            "agent_name": output.get("agent_name"),
            "workspace": output.get("workspace"),
            "answer": _trim_tool_output_text(output.get("answer")),
            "warnings": list(output.get("warnings") or []),
            "run_id": output.get("run_id"),
            "run_recorded_at": output.get("run_recorded_at"),
            "action_request_count": output.get("action_request_count"),
            "executed_action_count": output.get("executed_action_count"),
            "pending_action_count": output.get("pending_action_count"),
            "failed_action_count": output.get("failed_action_count"),
        }
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "list_home_view_cards":
        preview = {
            "card_count": output.get("card_count"),
            "template_key": output.get("template_key"),
            "template_version": output.get("template_version"),
            "card_ids": [row.get("card_id") for row in list(output.get("cards") or [])[:8]],
            "supported_filter_fields": list(output.get("supported_filter_fields") or []),
        }
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "get_home_system_template":
        preview = {
            "template_key": output.get("template_key"),
            "template_version": output.get("template_version"),
            "immutable": output.get("immutable"),
            "card_count": output.get("card_count"),
            "card_ids": [row.get("card_id") for row in list(output.get("cards") or [])[:8]],
        }
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "get_home_view_filter_options":
        cards = list(output.get("cards") or [])
        preview = {
            "card_id": output.get("card_id"),
            "card_count": len(cards),
            "card_ids": [row.get("card_id") for row in cards[:8]],
            "includes_reference_options": output.get("includes_reference_options"),
            "reference_option_limit": output.get("reference_option_limit"),
        }
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "list_home_view_instances":
        preview = {
            "count": output.get("count"),
            "personal_count": output.get("personal_count"),
            "shared_count": output.get("shared_count"),
            "scope_filter": output.get("scope_filter"),
            "definition_ids": [row.get("definition_id") for row in list(output.get("items") or [])[:8]],
        }
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "list_slack_messaging_conversations":
        preview = {
            "count": output.get("count"),
            "query": output.get("query"),
            "conversation_ids": [
                row.get("conversation_id")
                for row in list(output.get("items") or [])[:8]
            ],
            "labels": [row.get("label") for row in list(output.get("items") or [])[:8]],
        }
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "get_slack_messaging_conversation":
        conversation = output.get("conversation") or {}
        preview = {
            "found": output.get("found"),
            "conversation_id": output.get("conversation_id") or conversation.get("conversation_id"),
            "label": conversation.get("label"),
            "timeline_count": conversation.get("timeline_count"),
            "message_count": conversation.get("message_count"),
        }
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "analyze_pretrade_scenario_draft":
        analysis = output.get("analysis")
        if not isinstance(analysis, dict):
            return None
        recommendation = analysis.get("recommendation")
        comparison = analysis.get("comparison")
        preview = _build_pretrade_recommendation_tool_preview(
            recommendation if isinstance(recommendation, dict) else {},
            source_scenario_id=analysis.get("source_scenario_id"),
            source_review_id=analysis.get("source_review_id"),
            input_snapshot_count=len(list(analysis.get("input_snapshots") or [])),
        )
        if isinstance(comparison, dict):
            preview["comparison_previous_run_id"] = comparison.get("previous_run_id")
            preview["comparison_stance_delta"] = comparison.get("stance_delta")
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "get_pretrade_recommendation_run":
        if not output.get("found"):
            return {
                "found": False,
                "lookup": output.get("lookup"),
            }
        run = output.get("run")
        if not isinstance(run, dict):
            return {"found": True}
        recommendation = run.get("recommendation")
        preview = _build_pretrade_recommendation_tool_preview(
            recommendation if isinstance(recommendation, dict) else {},
            run_id=run.get("run_id"),
            source_scenario_id=run.get("source_scenario_id"),
            source_review_id=run.get("source_review_id"),
            input_snapshot_count=len(list(run.get("input_snapshots") or [])),
        )
        preview["found"] = True
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    if tool_name == "get_document_type_counts":
        segments = list(output.get("segments") or [])
        top_segment = segments[0] if segments and isinstance(segments[0], dict) else {}
        preview = {
            "total_count": output.get("total_count"),
            "type_count": output.get("type_count"),
            "top_document_kind": top_segment.get("document_kind"),
            "top_count": top_segment.get("count"),
        }
        return {key: value for key, value in preview.items() if value not in (None, [], "")}

    return None


def _build_pretrade_recommendation_tool_preview(
    recommendation: dict[str, Any],
    *,
    run_id: object | None = None,
    source_scenario_id: object | None = None,
    source_review_id: object | None = None,
    input_snapshot_count: int | None = None,
) -> dict[str, Any]:
    opportunity_summary = recommendation.get("opportunity_summary")
    residual_exposure = recommendation.get("residual_exposure")
    hedge_recommendation = recommendation.get("hedge_recommendation")
    netting_candidates = recommendation.get("netting_candidates")
    missing_evidence = recommendation.get("missing_evidence")

    return {
        "run_id": run_id,
        "source_scenario_id": source_scenario_id,
        "source_review_id": source_review_id,
        "stance": recommendation.get("stance"),
        "opportunity_category": (
            opportunity_summary.get("category")
            if isinstance(opportunity_summary, dict)
            else None
        ),
        "residual_exposure_effect": (
            residual_exposure.get("exposure_effect")
            if isinstance(residual_exposure, dict)
            else None
        ),
        "residual_after_trade": (
            residual_exposure.get("residual_after_trade")
            if isinstance(residual_exposure, dict)
            else None
        ),
        "netting_match_qualities": [
            candidate.get("match_quality")
            for candidate in list(netting_candidates or [])
            if isinstance(candidate, dict)
        ],
        "hedge_instrument_type": (
            hedge_recommendation.get("instrument_type")
            if isinstance(hedge_recommendation, dict)
            else None
        ),
        "hedge_decision_key": (
            hedge_recommendation.get("decision_key")
            if isinstance(hedge_recommendation, dict)
            else None
        ),
        "hedge_decision_factors": (
            list(hedge_recommendation.get("decision_factors") or [])
            if isinstance(hedge_recommendation, dict)
            else []
        ),
        "hedge_policy_stops": (
            list(hedge_recommendation.get("policy_stops") or [])
            if isinstance(hedge_recommendation, dict)
            else []
        ),
        "missing_evidence_keys": [
            item.get("evidence_key")
            for item in list(missing_evidence or [])
            if isinstance(item, dict)
        ],
        "input_snapshot_count": input_snapshot_count,
    }


class AssistantToolServiceError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class AssistantToolService:
    def __init__(
        self,
        db: Session,
        *,
        actor_id: str | None = None,
        caller_agent: Any | None = None,
        delegation_depth: int = 0,
    ) -> None:
        self._db = db
        self._actor_id = actor_id
        self._caller_agent = caller_agent
        self._delegation_depth = delegation_depth
        self._tools = {tool.name: tool for tool in build_tool_definitions(actor_id=actor_id)}

    def set_caller_agent(self, caller_agent: Any | None) -> None:
        self._caller_agent = caller_agent

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

        result = self._execute_tool_result(tool, arguments)
        if inspect.isawaitable(result):
            raise AssistantToolServiceError(
                f"Assistant tool '{tool_name}' requires async execution and is unavailable in this sync context."
            )
        trace = AssistantToolCallTrace(
            tool_name=tool.name,
            arguments=arguments,
            summary=result.summary,
            record_count=result.record_count,
            output_preview=_build_tool_output_preview(tool.name, result.output),
            evidence_items=tuple(result.evidence_items),
        )
        return result, trace

    async def execute_tool_async(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> tuple[AssistantToolExecutionResult, AssistantToolCallTrace]:
        tool = self._tools.get(tool_name)
        if tool is None:
            raise AssistantToolServiceError(f"Unknown assistant tool '{tool_name}'.")

        result = self._execute_tool_result(tool, arguments)
        if inspect.isawaitable(result):
            result = await result
        trace = AssistantToolCallTrace(
            tool_name=tool.name,
            arguments=arguments,
            summary=result.summary,
            record_count=result.record_count,
            output_preview=_build_tool_output_preview(tool.name, result.output),
            evidence_items=tuple(result.evidence_items),
        )
        return result, trace

    def _execute_tool_result(
        self,
        tool: AssistantToolDefinition,
        arguments: dict[str, Any],
    ) -> AssistantToolExecutionResult | Awaitable[AssistantToolExecutionResult]:
        if tool.name == "consult_managed_agent":
            return _consult_managed_agent(
                self._db,
                arguments,
                actor_id=self._actor_id,
                caller_agent=self._caller_agent,
            )
        if tool.name == "enlist_managed_agent":
            return _enlist_managed_agent(
                self._db,
                arguments,
                actor_id=self._actor_id,
                caller_agent=self._caller_agent,
                delegation_depth=self._delegation_depth,
            )
        return tool.executor(self._db, arguments)


def build_tool_definitions(*, actor_id: str | None = None) -> list[AssistantToolDefinition]:
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
                "Search governed reference data across books, commodities, calendars, price indices, currencies, units, "
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
                            "calendars",
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
            name="get_latest_commodity_prices",
            description=(
                "Load the latest commodity price observations already synced into ECTRM. Use this when the "
                "user asks for the freshest loaded benchmark or hub prices and you need a compact price-only "
                "answer with freshness metadata instead of the broader market-context bundle."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "commodity": {
                        "type": "string",
                        "description": "Optional commodity hint such as WTI, BRENT, HH, NATURAL_GAS, or POWER.",
                    },
                    "price_index_code": {
                        "type": "string",
                        "description": "Optional exact price index code such as WTI_CUSHING_D. Takes priority over commodity.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum rows to return. Defaults to 5 and is capped at 10.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_get_latest_commodity_prices,
        ),
        AssistantToolDefinition(
            name="get_latest_market_news",
            description=(
                "Fetch recent commodity and market headlines from a live RSS search at response time. Use this "
                "when the user asks for the latest news and you need current headlines, source names, publish "
                "times, and links rather than only the platform's loaded data."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "commodity": {
                        "type": "string",
                        "description": "Optional commodity hint such as WTI, BRENT, HH, NATURAL_GAS, or POWER.",
                    },
                    "query": {
                        "type": "string",
                        "description": "Optional extra search terms such as refinery outages, OPEC, LNG, or storm impacts.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum headlines to return. Defaults to 5 and is capped at 10.",
                    },
                    "lookback_days": {
                        "type": "integer",
                        "description": (
                            "How many recent days to search. Defaults to "
                            f"{DEFAULT_MARKET_NEWS_LOOKBACK_DAYS} and is capped at 14."
                        ),
                    },
                },
                "additionalProperties": False,
            },
            executor=_get_latest_market_news,
        ),
        AssistantToolDefinition(
            name="analyze_pretrade_scenario_draft",
            description=(
                "Analyze an in-progress pre-trade scenario draft with the deterministic recommendation engine. "
                "Use this when the user is editing a draft and wants the current opportunity, residual exposure, "
                "hedge suggestion, missing evidence, or a comparison against the latest visible saved run. This "
                "is read-only and does not persist a recommendation run, book a trade, approve a review, or "
                "execute a hedge."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "thesis": {
                        "type": "string",
                        "description": "Optional working thesis for the in-progress draft.",
                    },
                    "draft": {
                        "type": "object",
                        "description": (
                            "Required PreTradeScenarioDraft-compatible object containing the current in-progress "
                            "scenario fields such as book, commodity, trade_side, pricing_type, counterparty, "
                            "target_price, target_volume, and delivery window."
                        ),
                    },
                    "source_scenario_id": {
                        "type": "integer",
                        "description": (
                            "Optional saved pre-trade scenario identifier used only to compare the draft with the "
                            "latest visible saved recommendation run."
                        ),
                    },
                    "source_review_id": {
                        "type": "integer",
                        "description": (
                            "Optional pre-trade review identifier used only to compare the draft with the latest "
                            "visible saved recommendation run attached to that review."
                        ),
                    },
                    "input_snapshots": {
                        "type": "array",
                        "description": (
                            "Optional structured evidence snapshots already gathered for the draft. Each item "
                            "should follow the PreTradeRecommendationSourceSnapshot contract."
                        ),
                        "items": {"type": "object"},
                    },
                },
                "required": ["draft"],
                "additionalProperties": False,
            },
            executor=lambda db, arguments: _analyze_pretrade_scenario_draft(
                db,
                arguments,
                actor_id=actor_id,
            ),
        ),
        AssistantToolDefinition(
            name="get_pretrade_recommendation_run",
            description=(
                "Load one saved pre-trade recommendation run, or the latest visible run for a scenario or review. "
                "Use this when the user asks what opportunity the platform identified, what residual exposure and "
                "hedge draft were suggested, or which evidence is missing. This is read-only and does not book "
                "trades, approve reviews, or execute hedges."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "run_id": {
                        "type": "integer",
                        "description": "Optional exact recommendation run identifier.",
                    },
                    "source_scenario_id": {
                        "type": "integer",
                        "description": "Optional pre-trade scenario identifier. Returns the latest visible run for that scenario.",
                    },
                    "source_review_id": {
                        "type": "integer",
                        "description": "Optional pre-trade review identifier. Returns the latest visible run attached to that review.",
                    },
                },
                "additionalProperties": False,
            },
            executor=lambda db, arguments: _get_pretrade_recommendation_run(
                db,
                arguments,
                actor_id=actor_id,
            ),
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
                "Load persisted trade confirmation ledger records for active trades. Use this when the user asks "
                "whether a trade has been sent, confirmed, disputed, or is still awaiting counterparty "
                "response. The tool can focus on only current confirmation versions or include history. For "
                "confirmation backlog counts that may not have ledger rows yet, use list_trade_attention_candidates."
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
            name="list_trade_attention_candidates",
            description=(
                "Load active trades that explain workspace attention and settlement status counts even when no "
                "child ledger row exists yet. Use this when a summary count such as confirmation_backlog_count, "
                "nomination_backlog_count, payment_due_count, pending_settlement_count, or trade_exception_count "
                "does not line up with persisted confirmation, delivery, invoice, or payment rows."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "candidate_type": {
                        "type": "string",
                        "enum": list(TRADE_ATTENTION_CANDIDATE_TYPE_NAMES),
                        "description": (
                            "Optional attention category to list. Examples: confirmation_backlog, "
                            "nomination_backlog, allocation_backlog, payment_due, pending_settlement, "
                            "settlement_exception. Defaults to all candidate categories."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_trade_attention_candidates,
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
                "Load persisted settlement payment records with invoice balance context. Use this when the user asks "
                "what cash is due, what has been paid, or which existing payments are overdue for a trade or invoice. "
                "For due or overdue payment counts that may not have payment rows yet, use list_trade_attention_candidates."
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
            name="get_settlement_report_filter_options",
            description=(
                "Load the currently valid settlement report filter options, including books, counterparties, "
                "currencies, exception types, and severities. Use this before proposing or saving a settlement "
                "report preset so the chosen filters stay inside the typed catalog."
            ),
            parameters={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            executor=_get_settlement_report_filter_options,
        ),
        AssistantToolDefinition(
            name="list_settlement_report_presets",
            description=(
                "Load settlement report presets visible to the authenticated user, including personal and shared "
                "presets plus their saved filters. Use this when the user asks what presets already exist or before "
                "creating a new preset to avoid duplicate names."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "enum": ["PERSONAL", "SHARED"],
                        "description": "Optional preset scope filter.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of presets to return. Defaults to 25 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=lambda db, arguments, actor_id=actor_id: _list_settlement_report_presets(
                db,
                arguments,
                actor_id=actor_id,
            ),
        ),
        AssistantToolDefinition(
            name="list_home_view_cards",
            description=(
                "List the supported Prompt Home card registry with card ids, labels, default placement, allowed "
                "parameters, allowed filters, and data bindings. Use this before drafting a Home view so the "
                "assistant stays inside the typed Home card contract. This is read-only."
            ),
            parameters={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            executor=_list_home_view_cards,
        ),
        AssistantToolDefinition(
            name="get_home_system_template",
            description=(
                "Load the immutable System Home template, including the default card order and visibility. Use this "
                "when the user asks what the base Home looks like or before proposing a saved Home instance. "
                "This is read-only and does not create or update a view."
            ),
            parameters={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            executor=_get_home_system_template,
        ),
        AssistantToolDefinition(
            name="get_home_view_filter_options",
            description=(
                "Load supported Prompt Home card filter and parameter options, including active reference-data "
                "choices where safe. Use this before proposing filters such as HH NG, US natural gas, geography, "
                "quote type, or price-card sort behavior. This is read-only."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "card_id": {
                        "type": "string",
                        "description": "Optional Home card id to focus, such as prices, news, map, documents, communication, timeframe, or prompt.",
                    },
                    "include_reference_options": {
                        "type": "boolean",
                        "description": "Whether to include active reference-data option examples for supported fields. Defaults to true.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum active reference options per field. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_get_home_view_filter_options,
        ),
        AssistantToolDefinition(
            name="list_home_view_instances",
            description=(
                "List active Home view instances visible to the authenticated user, including personal and shared "
                "definitions, owner scope, status, version, validation metadata, and optional card summaries. "
                "Use this before drafting or staging a new saved Home view to avoid duplicates and respect visibility."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "enum": ["PERSONAL", "TEAM", "ORGANIZATION", "SHARED"],
                        "description": "Optional visible scope filter. SHARED includes TEAM and ORGANIZATION instances.",
                    },
                    "include_cards": {
                        "type": "boolean",
                        "description": "Whether to include concise saved card configuration summaries. Defaults to true.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of visible Home instances to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=lambda db, arguments, actor_id=actor_id: _list_home_view_instances(
                db,
                arguments,
                actor_id=actor_id,
            ),
        ),
        AssistantToolDefinition(
            name="list_deliveries",
            description=(
                "Load delivery obligations with execution and actualization context. Use this when the user "
                "asks about shipment scheduling, execution progress, delivery ownership, or physical follow-up "
                "for one or more trades. For nomination or allocation backlog counts that may not have delivery "
                "rows yet, use list_trade_attention_candidates."
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
            name="list_accrual_lots",
            description=(
                "Load live trade accrual lots with unbilled, billed, collected, and disputed balances. Use "
                "this when the user asks about delivered-but-unbilled exposure, fee or accrual posture, or "
                "trade-level reconciliation gaps."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Optional exact trade identifier filter.",
                    },
                    "delivery_id": {
                        "type": "string",
                        "description": "Optional exact delivery identifier filter.",
                    },
                    "book": {
                        "type": "string",
                        "description": "Optional exact book filter.",
                    },
                    "portfolio": {
                        "type": "string",
                        "description": "Optional exact portfolio filter.",
                    },
                    "counterparty": {
                        "type": "string",
                        "description": "Optional exact counterparty filter.",
                    },
                    "commodity_class": {
                        "type": "string",
                        "description": "Optional exact commodity class filter.",
                    },
                    "accrual_currency_code": {
                        "type": "string",
                        "description": "Optional exact accrual currency filter.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional exact accrual lot status filter.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_accrual_lots,
        ),
        AssistantToolDefinition(
            name="list_accrual_entries",
            description=(
                "Load detailed accrual ledger entries for one accrual lot. Use this when the user needs the "
                "effective-date entry trail behind a lot's accrued, billed, collected, or disputed balances."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "accrual_lot_id": {
                        "type": "string",
                        "description": "Exact accrual lot identifier.",
                    }
                },
                "required": ["accrual_lot_id"],
                "additionalProperties": False,
            },
            executor=_list_accrual_entries,
        ),
        AssistantToolDefinition(
            name="get_accrual_reconciliation",
            description=(
                "Build an accrual reconciliation summary grouped by book, portfolio, counterparty, commodity "
                "class, and currency. Use this for controller-style open-accrual or billed-versus-collected "
                "analysis across a filtered slice."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "trade_id": {
                        "type": "string",
                        "description": "Optional exact trade identifier filter.",
                    },
                    "delivery_id": {
                        "type": "string",
                        "description": "Optional exact delivery identifier filter.",
                    },
                    "book": {
                        "type": "string",
                        "description": "Optional exact book filter.",
                    },
                    "portfolio": {
                        "type": "string",
                        "description": "Optional exact portfolio filter.",
                    },
                    "counterparty": {
                        "type": "string",
                        "description": "Optional exact counterparty filter.",
                    },
                    "commodity_class": {
                        "type": "string",
                        "description": "Optional exact commodity class filter.",
                    },
                    "accrual_currency_code": {
                        "type": "string",
                        "description": "Optional exact accrual currency filter.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional exact accrual lot status filter.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_get_accrual_reconciliation,
        ),
        AssistantToolDefinition(
            name="list_accounting_entries",
            description=(
                "Load internal accounting postings tied to trades, accruals, invoices, or payments. Use this when "
                "the user asks about journal history, posted accounting adjustments, or whether an internal posting "
                "has already been reversed."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "entry_id": {
                        "type": "string",
                        "description": "Optional exact accounting entry identifier.",
                    },
                    "trade_id": {
                        "type": "string",
                        "description": "Optional exact trade identifier filter.",
                    },
                    "accrual_lot_id": {
                        "type": "string",
                        "description": "Optional exact accrual lot identifier filter.",
                    },
                    "invoice_id": {
                        "type": "integer",
                        "description": "Optional exact invoice identifier filter.",
                    },
                    "payment_id": {
                        "type": "integer",
                        "description": "Optional exact payment identifier filter.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional exact posting status filter such as POSTED or REVERSED.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of rows to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_accounting_entries,
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
            name="get_document_type_counts",
            description=(
                "Count document-ingestion records by dominant document type and return a chart artifact. Use this "
                "when the user asks for document type totals, counts by document type, or a chart of documents. "
                "The document-type aggregation is categorical, so request pie or bar for chart_type. This is "
                "read-only. When presenting the result in Prompt Home or Messages, include the "
                "returned chart object as JSON in a fenced block labelled ectrm-chart so the app can render it."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "chart_type": {
                        "type": "string",
                        "description": "Optional chart type for categorical document type counts. Supported values: pie or bar. Defaults to pie.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Optional exact document ingestion status such as UPLOADED, PROCESSING, ANALYZED, or FAILED.",
                    },
                    "review_status": {
                        "type": "string",
                        "description": "Optional exact review status such as UNREVIEWED, IN_REVIEW, or VERIFIED.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_get_document_type_counts,
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
            name="list_gmail_inbox_messages",
            description=(
                "Browse recent messages from the configured Gmail inbox integration. Use this when the user "
                "asks to search email, review recent inbox activity, or inspect attachment/import status "
                "without leaving the app. This is read-only and does not import or mutate messages."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional Gmail search query override scoped to the configured inbox.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of messages to return. Defaults to 10 and is capped at 25.",
                    },
                    "page_token": {
                        "type": "string",
                        "description": "Optional continuation token from a previous Gmail inbox browse result.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_gmail_inbox_messages,
        ),
        AssistantToolDefinition(
            name="get_gmail_inbox_message",
            description=(
                "Load one Gmail inbox message with sender, recipients, snippet, truncated body text, and "
                "attachment import status. Use this after listing inbox messages when the user wants the "
                "full read-only detail for a specific message."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "message_id": {
                        "type": "string",
                        "description": "Exact Gmail message identifier from list_gmail_inbox_messages.",
                    }
                },
                "required": ["message_id"],
                "additionalProperties": False,
            },
            executor=_get_gmail_inbox_message,
        ),
        AssistantToolDefinition(
            name="list_slack_messaging_conversations",
            description=(
                "Browse Slack-backed conversations mirrored into the ECTRM Messages workspace. Use this when "
                "the user asks to review Slack activity, search synced Slack lanes, or connect Slack context "
                "to desk work without leaving the app. This is read-only and uses the durable local mirror; it "
                "does not call Slack live or post messages."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional case-insensitive search across Slack labels, topics, previews, and synced message bodies.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of conversations to return. Defaults to 10 and is capped at 25.",
                    },
                    "message_limit": {
                        "type": "integer",
                        "description": "Recent synced messages to include per conversation. Defaults to 3 and is capped at 25.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_slack_messaging_conversations,
        ),
        AssistantToolDefinition(
            name="get_slack_messaging_conversation",
            description=(
                "Load one Slack-backed conversation from the ECTRM Messages mirror, including recent synced "
                "timeline items, members, highlights, and local provenance. Use this after listing Slack "
                "conversations when the user wants detailed read-only Slack context."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "conversation_id": {
                        "type": "string",
                        "description": "Exact Slack-backed messaging conversation id, such as slack-C123ABC.",
                    },
                    "message_limit": {
                        "type": "integer",
                        "description": "Recent synced timeline items to include. Defaults to 25 and is capped at 25.",
                    },
                },
                "required": ["conversation_id"],
                "additionalProperties": False,
            },
            executor=_get_slack_messaging_conversation,
        ),
        AssistantToolDefinition(
            name="list_managed_agents",
            description=(
                "List active managed assistant agents, including their role, skills, authority, orchestration "
                "pattern, build recipe ingredients, and explicit hierarchy links. Use this when the user asks "
                "which agents exist, how they differ, or how they relate to each other."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional case-insensitive search across agent id, name, description, or role key.",
                    },
                    "role_key": {
                        "type": "string",
                        "description": "Optional exact role key filter.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_list_managed_agents,
        ),
        AssistantToolDefinition(
            name="get_managed_agent_profile",
            description=(
                "Load one active managed assistant agent profile with its build recipe, capabilities, skills, "
                "allowed tools, governed actions, hierarchy links, and role-archetype guidance. Use this when "
                "the user asks how a specific agent is constructed or how it fits into the roster."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Exact managed agent identifier.",
                    }
                },
                "required": ["agent_id"],
                "additionalProperties": False,
            },
            executor=(
                lambda db, arguments, actor_id=actor_id: _get_managed_agent_profile(
                    db,
                    arguments,
                    actor_id=actor_id,
                )
            ),
        ),
        AssistantToolDefinition(
            name="get_application_catalog",
            description=(
                "Load the app-wide topology catalog, including route groups, workspace names, schema module entry "
                "points, frontend workspace modules, documentation anchors, published code roots, and the current "
                "database overview. Use this when the user asks how ECTRM is organized or where something lives."
            ),
            parameters={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            executor=_get_application_catalog,
        ),
        AssistantToolDefinition(
            name="get_data_schema_catalog",
            description=(
                "Load the governed database schema catalog for ECTRM. Use this when the user asks about tables, "
                "columns, primary keys, or foreign-key relationships. Optionally focus on one exact table name."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "description": "Optional exact table name such as trades, events, assistant_agents, or trade_invoices.",
                    },
                },
                "additionalProperties": False,
            },
            executor=_get_data_schema_catalog,
        ),
        AssistantToolDefinition(
            name="search_codebase",
            description=(
                "Search published ECTRM source and documentation text across the API, web, or engineering docs "
                "trees. Use this when the user asks where logic lives, which file defines a concept, or how the "
                "codebase references a specific route, model, workspace, or workflow."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Case-insensitive substring to search for.",
                    },
                    "scope": {
                        "type": "string",
                        "enum": ["all", "api", "web", "docs"],
                        "description": "Which published codebase area to search. Defaults to all.",
                    },
                    "path_prefix": {
                        "type": "string",
                        "description": "Optional repo-relative file or directory prefix such as apps/api/app/routes or docs/engineering/ai-workflow.md.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of matches to return. Defaults to 10 and is capped at 25.",
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            executor=_search_codebase,
        ),
        AssistantToolDefinition(
            name="read_codebase_file",
            description=(
                "Read a published ECTRM source or documentation file by repo-relative path with stable line "
                "numbers. Use this after search_codebase or when the user names a specific file and you need the "
                "authoritative code or docs excerpt."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Repo-relative file path such as apps/api/app/routes/assistant.py or docs/engineering/ai-workflow.md.",
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "Optional 1-based starting line number. Defaults to 1.",
                    },
                    "end_line": {
                        "type": "integer",
                        "description": "Optional inclusive ending line number. When omitted, the tool returns a capped window.",
                    },
                },
                "required": ["path"],
                "additionalProperties": False,
            },
            executor=_read_codebase_file,
        ),
        AssistantToolDefinition(
            name="enlist_managed_agent",
            description=(
                "Delegate a bounded subtask to another active managed agent. Use this when a specialist should "
                "gather evidence, draft output, or stage/execute a governed action inside its own lane through "
                "the normal assistant run, tool, policy, and action-request pipeline."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Exact managed agent identifier to enlist.",
                    },
                    "task": {
                        "type": "string",
                        "description": "A clear bounded task for the enlisted managed agent.",
                    },
                    "context": {
                        "type": "string",
                        "description": "Optional shared context for the enlisted managed agent.",
                    },
                    "workspace": {
                        "type": "string",
                        "description": (
                            "Optional workspace to use. When omitted, assistant is preferred if allowed; "
                            "otherwise the enlisted agent's first allowed workspace is used."
                        ),
                    },
                    "use_live_tools": {
                        "type": "boolean",
                        "description": "Whether the enlisted managed agent may use its allowed live tools.",
                    },
                },
                "required": ["agent_id", "task"],
                "additionalProperties": False,
            },
            executor=lambda _db, _arguments: AssistantToolExecutionResult(
                output={"ok": False},
                summary="enlist_managed_agent requires async execution.",
                is_error=True,
            ),
        ),
        AssistantToolDefinition(
            name="consult_managed_agent",
            description=(
                "Ask another active managed agent for advisory input on a narrow question. Use this when a "
                "different managed agent has a clearer domain specialty and you want a second view before "
                "answering the user. This is advisory-only: the consulted agent cannot stage or execute governed "
                "actions through this path."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "The managed agent identifier to consult.",
                    },
                    "question": {
                        "type": "string",
                        "description": "The specific advisory question for the other agent.",
                    },
                    "context": {
                        "type": "string",
                        "description": "Optional supporting context to share with the consulted agent.",
                    },
                    "workspace": {
                        "type": "string",
                        "description": "Optional workspace to anchor the consultation. Defaults to assistant or the target's first allowed workspace.",
                    },
                    "use_live_tools": {
                        "type": "boolean",
                        "description": "Whether the consulted agent may use its own live read tools. Defaults to true.",
                    },
                },
                "required": ["agent_id", "question"],
                "additionalProperties": False,
            },
            executor=(lambda db, arguments, actor_id=actor_id: _consult_managed_agent(db, arguments, actor_id=actor_id)),
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


def augment_managed_agent_introspection_tools(
    tool_names: tuple[str, ...],
    *,
    capabilities: tuple[str, ...],
) -> tuple[str, ...]:
    if "READ" not in {str(capability).upper() for capability in capabilities}:
        return tuple(tool_names)
    resolved_tools = list(tool_names)
    seen = set(resolved_tools)
    for tool_name in GLOBAL_READ_INTROSPECTION_TOOL_NAMES:
        if tool_name not in seen:
            resolved_tools.append(tool_name)
            seen.add(tool_name)
    return tuple(resolved_tools)


def _list_home_view_cards(_db: Session, _arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    cards = [_serialize_home_view_registry_entry(entry) for entry in HOME_VIEW_CARD_REGISTRY]
    supported_filter_fields = sorted({field for entry in HOME_VIEW_CARD_REGISTRY for field in entry.allowed_filter_fields})
    supported_parameters = sorted({parameter for entry in HOME_VIEW_CARD_REGISTRY for parameter in entry.allowed_parameters})
    payload = {
        "catalog_key": "home_card_registry",
        "template_key": HOME_SYSTEM_TEMPLATE_KEY,
        "template_version": HOME_SYSTEM_TEMPLATE_VERSION,
        "card_count": len(cards),
        "cards": cards,
        "supported_filter_fields": supported_filter_fields,
        "supported_parameters": supported_parameters,
        "static_options": {
            "geography": list(HOME_VIEW_ASSET_MAP_GEOGRAPHIES),
            "price_mark_status": list(HOME_VIEW_PRICE_MARK_STATUSES),
            "price_sort": _home_view_price_sort_options(),
            "quote_type": list(HOME_VIEW_PRICE_QUOTE_TYPES),
        },
        "read_only": True,
    }
    return AssistantToolExecutionResult(
        output=payload,
        summary=f"Loaded the Home card registry with {len(cards)} supported card(s).",
        record_count=len(cards),
        evidence_items=_build_home_view_card_registry_evidence(payload),
    )


def _get_home_system_template(_db: Session, _arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    template = build_home_system_template()
    cards = [_serialize_home_view_card_definition(card) for card in template.cards]
    payload = {
        "template_key": template.template_key,
        "template_version": template.template_version,
        "label": template.label,
        "immutable": template.immutable,
        "card_count": len(cards),
        "cards": cards,
        "read_only": True,
    }
    return AssistantToolExecutionResult(
        output=payload,
        summary=f"Loaded immutable System Home template v{template.template_version} with {len(cards)} card(s).",
        record_count=len(cards),
        evidence_items=_build_home_system_template_evidence(payload),
    )


def _get_home_view_filter_options(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    card_id = _normalize_optional_home_view_card_id(arguments.get("card_id"))
    include_reference_options = _normalize_bool(
        arguments.get("include_reference_options"),
        default=True,
        field_name="include_reference_options",
    )
    limit = _normalize_limit(arguments.get("limit"), default=10)
    entries = [
        entry
        for entry in HOME_VIEW_CARD_REGISTRY
        if card_id is None or entry.card_id == card_id
    ]
    cards = [
        _serialize_home_view_filter_option_card(
            db,
            entry,
            include_reference_options=include_reference_options,
            limit=limit,
        )
        for entry in entries
    ]
    payload = {
        "card_id": card_id,
        "cards": cards,
        "includes_reference_options": include_reference_options,
        "reference_option_limit": limit,
        "read_only": True,
    }
    summary = f"Loaded Home filter and parameter option metadata for {len(cards)} card(s)."
    if card_id:
        summary += f" Card '{card_id}'."
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=len(cards),
        evidence_items=_build_home_view_filter_options_evidence(payload),
    )


def _list_home_view_instances(
    db: Session,
    arguments: dict[str, Any],
    *,
    actor_id: str | None,
) -> AssistantToolExecutionResult:
    if not actor_id:
        raise AssistantToolServiceError("list_home_view_instances requires an authenticated actor context.")

    scope_filter = _normalize_optional_home_view_scope(arguments.get("scope"))
    include_cards = _normalize_bool(arguments.get("include_cards"), default=True, field_name="include_cards")
    limit = _normalize_limit(arguments.get("limit"), default=10)
    actor_role = _resolve_tool_actor_role(db, actor_id)
    records = list_visible_home_view_definitions(db, actor_id=actor_id)
    if scope_filter == "SHARED":
        records = [record for record in records if record.scope in {"TEAM", "ORGANIZATION"}]
    elif scope_filter is not None:
        records = [record for record in records if record.scope == scope_filter]
    rows = [
        to_home_view_definition_out(record, db=db, actor_id=actor_id, actor_role=actor_role)
        for record in records[:limit]
    ]
    items = [
        _serialize_home_view_definition_summary(row, include_cards=include_cards)
        for row in rows
    ]
    personal_count = sum(1 for row in items if row.get("scope") == "PERSONAL")
    shared_count = sum(1 for row in items if row.get("is_shared"))
    payload = {
        "actor_id": actor_id,
        "scope_filter": scope_filter,
        "count": len(items),
        "personal_count": personal_count,
        "shared_count": shared_count,
        "items": items,
        "truncated": len(records) > len(items),
        "read_only": True,
    }
    summary = f"Loaded {len(items)} visible active Home view instance(s)."
    if scope_filter:
        summary += f" Scope filter {scope_filter}."
    if payload["truncated"]:
        summary += " Results were truncated at the tool limit."
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=len(items),
        evidence_items=_build_home_view_instances_evidence(payload),
    )


def _serialize_home_view_registry_entry(entry: Any) -> dict[str, Any]:
    return {
        "card_id": entry.card_id,
        "kind": entry.kind,
        "label": entry.label,
        "default_visible": entry.default_visible,
        "default_placement": {
            "column_span": entry.default_column_span,
            "row_span": entry.default_row_span,
        },
        "allowed_parameters": list(entry.allowed_parameters),
        "allowed_filter_fields": list(entry.allowed_filter_fields),
        "data_bindings": list(entry.data_bindings),
    }


def _serialize_home_view_card_definition(card: Any) -> dict[str, Any]:
    placement = card.placement
    payload: dict[str, Any] = {
        "card_id": card.card_id,
        "kind": card.kind,
        "label": card.label,
        "visible": card.visible,
        "placement": (
            {
                "order": placement.order,
                "column_span": placement.column_span,
                "row_span": placement.row_span,
            }
            if placement is not None
            else None
        ),
        "data_bindings": list(card.data_bindings or []),
    }
    if card.parameters:
        payload["parameters"] = dict(card.parameters)
    if card.filters:
        payload["filters"] = dict(card.filters)
    return payload


def _serialize_home_view_definition_summary(
    definition: Any,
    *,
    include_cards: bool,
) -> dict[str, Any]:
    visible_cards = [card.card_id for card in definition.cards if card.visible]
    payload: dict[str, Any] = {
        "definition_id": definition.definition_id,
        "definition_key": definition.definition_key,
        "name": definition.name,
        "scope": definition.scope,
        "scope_owner_key": definition.scope_owner_key,
        "status": definition.status,
        "version": definition.version,
        "base_template_key": definition.base_template_key,
        "base_template_version": definition.base_template_version,
        "persona_hint": definition.persona_hint,
        "is_shared": definition.is_shared,
        "can_edit": definition.can_edit,
        "can_duplicate": definition.can_duplicate,
        "updated_at": _json_default(definition.updated_at),
        "updated_by": definition.updated_by,
        "global_filters": dict(definition.global_filters or {}),
        "card_count": len(definition.cards),
        "visible_card_ids": visible_cards,
        "validation": {
            "ok": not definition.validation_warnings,
            "warning_count": len(definition.validation_warnings),
            "warnings": list(definition.validation_warnings),
        },
    }
    if include_cards:
        payload["cards"] = [_serialize_home_view_card_definition(card) for card in definition.cards]
    return payload


def _normalize_optional_home_view_card_id(value: Any) -> str | None:
    card_id = _optional_text(value)
    if card_id is None:
        return None
    normalized = card_id.strip().lower().replace("-", "_")
    supported = {entry.card_id for entry in HOME_VIEW_CARD_REGISTRY}
    if normalized not in supported:
        raise AssistantToolServiceError(
            f"card_id must be one of {', '.join(sorted(supported))}."
        )
    return normalized


def _normalize_optional_home_view_scope(value: Any) -> str | None:
    scope = _optional_upper(value)
    if scope is None:
        return None
    if scope not in {"PERSONAL", "TEAM", "ORGANIZATION", "SHARED"}:
        raise AssistantToolServiceError("scope must be PERSONAL, TEAM, ORGANIZATION, or SHARED.")
    return scope


def _resolve_tool_actor_role(db: Session, actor_id: str) -> str | None:
    request_role = get_request_identity().role
    if request_role:
        return request_role
    actor = db.get(UserAccount, actor_id)
    return actor.role if actor is not None else None


def _home_view_price_sort_options() -> list[str]:
    return [
        f"{field}_{direction}"
        for field in HOME_VIEW_PRICE_SORT_FIELDS
        for direction in HOME_VIEW_PRICE_SORT_DIRECTIONS
    ]


def _serialize_home_view_filter_option_card(
    db: Session,
    entry: Any,
    *,
    include_reference_options: bool,
    limit: int,
) -> dict[str, Any]:
    return {
        "card_id": entry.card_id,
        "label": entry.label,
        "kind": entry.kind,
        "filters": [
            _home_view_filter_field_options(
                db,
                field_name,
                include_reference_options=include_reference_options,
                limit=limit,
            )
            for field_name in entry.allowed_filter_fields
        ],
        "parameters": [
            _home_view_parameter_options(parameter_name)
            for parameter_name in entry.allowed_parameters
        ],
    }


def _home_view_filter_field_options(
    db: Session,
    field_name: str,
    *,
    include_reference_options: bool,
    limit: int,
) -> dict[str, Any]:
    if field_name == "price_index_code":
        return _home_view_reference_field_options(
            db,
            field_name=field_name,
            source="reference_price_indices.active",
            include_reference_options=include_reference_options,
            limit=limit,
            rows_loader=_home_view_price_index_options,
        )
    if field_name == "commodity_code":
        return _home_view_reference_field_options(
            db,
            field_name=field_name,
            source="reference_commodities.active",
            include_reference_options=include_reference_options,
            limit=limit,
            rows_loader=_home_view_commodity_options,
        )
    if field_name == "location_code":
        return _home_view_reference_field_options(
            db,
            field_name=field_name,
            source="reference_locations.active",
            include_reference_options=include_reference_options,
            limit=limit,
            rows_loader=_home_view_location_options,
        )
    if field_name == "provider":
        return _home_view_distinct_value_field_options(
            db,
            field_name=field_name,
            source="reference_price_indices.active.provider",
            include_reference_options=include_reference_options,
            limit=limit,
            model=ReferencePriceIndex,
            column=ReferencePriceIndex.provider,
        )
    if field_name == "region":
        return _home_view_distinct_value_field_options(
            db,
            field_name=field_name,
            source="reference_locations.active.region",
            include_reference_options=include_reference_options,
            limit=limit,
            model=ReferenceLocation,
            column=ReferenceLocation.region,
        )
    if field_name == "quote_type":
        return _home_view_static_field_options(
            field_name=field_name,
            source="home_view_contract.static",
            options=list(HOME_VIEW_PRICE_QUOTE_TYPES),
        )
    if field_name == "geography":
        return _home_view_static_field_options(
            field_name=field_name,
            source="home_view_contract.static",
            options=list(HOME_VIEW_ASSET_MAP_GEOGRAPHIES),
        )
    return {
        "field": field_name,
        "kind": "filter",
        "value_shape": "text_or_text_list",
        "source": "home_view_contract.free_text",
        "options": [],
        "option_count": 0,
        "truncated": False,
    }


def _home_view_parameter_options(parameter_name: str) -> dict[str, Any]:
    if parameter_name == "price_mark_status":
        return _home_view_static_field_options(
            field_name=parameter_name,
            source="home_view_contract.static",
            options=list(HOME_VIEW_PRICE_MARK_STATUSES),
            kind="parameter",
        )
    if parameter_name == "price_sort":
        return _home_view_static_field_options(
            field_name=parameter_name,
            source="home_view_contract.static",
            options=_home_view_price_sort_options(),
            kind="parameter",
        )
    if parameter_name == "map_record_limit":
        return {
            "field": parameter_name,
            "kind": "parameter",
            "value_shape": "integer",
            "source": "home_view_contract.range",
            "minimum": 1,
            "maximum": 5000,
            "options": [],
            "option_count": 0,
            "truncated": False,
        }
    if parameter_name == "news_limit":
        return {
            "field": parameter_name,
            "kind": "parameter",
            "value_shape": "integer",
            "source": "home_view_contract.range",
            "minimum": 1,
            "maximum": 10,
            "options": [],
            "option_count": 0,
            "truncated": False,
        }
    if parameter_name == "news_lookback_days":
        return {
            "field": parameter_name,
            "kind": "parameter",
            "value_shape": "integer",
            "source": "home_view_contract.range",
            "minimum": 1,
            "maximum": 14,
            "options": [],
            "option_count": 0,
            "truncated": False,
        }
    if parameter_name == "news_query":
        return {
            "field": parameter_name,
            "kind": "parameter",
            "value_shape": "text",
            "source": "home_view_contract.free_text",
            "maximum_length": 240,
            "options": [],
            "option_count": 0,
            "truncated": False,
        }
    return {
        "field": parameter_name,
        "kind": "parameter",
        "value_shape": "json_value",
        "source": "home_view_contract.config",
        "options": [],
        "option_count": 0,
        "truncated": False,
    }


def _home_view_static_field_options(
    *,
    field_name: str,
    source: str,
    options: list[str],
    kind: str = "filter",
) -> dict[str, Any]:
    return {
        "field": field_name,
        "kind": kind,
        "value_shape": "text_or_text_list" if kind == "filter" else "text",
        "source": source,
        "options": list(options),
        "option_count": len(options),
        "truncated": False,
    }


def _home_view_reference_field_options(
    db: Session,
    *,
    field_name: str,
    source: str,
    include_reference_options: bool,
    limit: int,
    rows_loader: Callable[[Session, int], tuple[list[dict[str, Any]], int]],
) -> dict[str, Any]:
    options: list[dict[str, Any]] = []
    option_count = 0
    if include_reference_options:
        options, option_count = rows_loader(db, limit)
    return {
        "field": field_name,
        "kind": "filter",
        "value_shape": "code_or_code_list",
        "source": source,
        "options": options,
        "option_count": option_count,
        "truncated": option_count > len(options),
    }


def _home_view_distinct_value_field_options(
    db: Session,
    *,
    field_name: str,
    source: str,
    include_reference_options: bool,
    limit: int,
    model: Any,
    column: Any,
) -> dict[str, Any]:
    values: list[str] = []
    if include_reference_options:
        values = [
            str(value)
            for value in db.execute(
                select(column)
                .where(model.is_active.is_(True), column.is_not(None))
                .distinct()
                .order_by(column)
            )
            .scalars()
            .all()
            if _optional_text(value) is not None
        ]
    return {
        "field": field_name,
        "kind": "filter",
        "value_shape": "text_or_text_list",
        "source": source,
        "options": values[:limit],
        "option_count": len(values),
        "truncated": len(values) > limit,
    }


def _home_view_price_index_options(db: Session, limit: int) -> tuple[list[dict[str, Any]], int]:
    option_count = int(
        db.execute(
            select(func.count()).select_from(ReferencePriceIndex).where(ReferencePriceIndex.is_active.is_(True))
        ).scalar_one()
    )
    rows = (
        db.execute(
            select(ReferencePriceIndex)
            .where(ReferencePriceIndex.is_active.is_(True))
            .order_by(ReferencePriceIndex.code)
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return (
        [
            {
                "code": row.code,
                "name": row.name,
                "commodity_code": row.commodity_code,
                "location_code": row.location_code,
                "provider": row.provider,
                "quote_type": row.quote_type,
                "market": row.market,
            }
            for row in rows
        ],
        option_count,
    )


def _home_view_commodity_options(db: Session, limit: int) -> tuple[list[dict[str, Any]], int]:
    option_count = int(
        db.execute(
            select(func.count()).select_from(ReferenceCommodity).where(ReferenceCommodity.is_active.is_(True))
        ).scalar_one()
    )
    rows = (
        db.execute(
            select(ReferenceCommodity)
            .where(ReferenceCommodity.is_active.is_(True))
            .order_by(ReferenceCommodity.code)
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return (
        [
            {
                "code": row.code,
                "name": row.name,
                "commodity_class": row.commodity_class,
            }
            for row in rows
        ],
        option_count,
    )


def _home_view_location_options(db: Session, limit: int) -> tuple[list[dict[str, Any]], int]:
    option_count = int(
        db.execute(
            select(func.count()).select_from(ReferenceLocation).where(ReferenceLocation.is_active.is_(True))
        ).scalar_one()
    )
    rows = (
        db.execute(
            select(ReferenceLocation)
            .where(ReferenceLocation.is_active.is_(True))
            .order_by(ReferenceLocation.code)
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return (
        [
            {
                "code": row.code,
                "name": row.name,
                "location_type": row.location_type,
                "market": row.market,
                "region": row.region,
                "country_code": row.country_code,
            }
            for row in rows
        ],
        option_count,
    )


def _list_managed_agents(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    query = _optional_text(arguments.get("query"))
    role_key = _optional_text(arguments.get("role_key"))
    agent_payloads = _load_managed_agent_payloads(db)
    filtered_agents = [
        payload
        for payload in agent_payloads
        if _managed_agent_matches_filters(payload["agent"], query=query, role_key=role_key)
    ]
    items = [_build_managed_agent_summary_row(payload, agent_payloads) for payload in filtered_agents]
    summary = f"Loaded {len(items)} active managed agent profile(s)."
    if query:
        summary += f" Query '{query}'."
    if role_key:
        summary += f" Role '{role_key}'."
    return AssistantToolExecutionResult(
        output={"count": len(items), "items": items},
        summary=summary,
        record_count=len(items),
        evidence_items=_build_managed_agent_list_evidence(items),
    )


def _get_managed_agent_profile(
    db: Session,
    arguments: dict[str, Any],
    *,
    actor_id: str | None,
) -> AssistantToolExecutionResult:
    from apps.api.app.models.user_account import UserAccount

    agent_id = _require_text(arguments.get("agent_id"), field_name="agent_id").lower()
    actor = db.get(UserAccount, actor_id) if actor_id else None
    agent_payloads = _load_managed_agent_payloads(db)
    target_payload = next((payload for payload in agent_payloads if payload["agent"]["agent_id"] == agent_id), None)
    if target_payload is None:
        return AssistantToolExecutionResult(
            output={"found": False, "agent_id": agent_id},
            summary=f"No active managed agent matched agent_id {agent_id}.",
            record_count=0,
        )

    agent = target_payload["agent"]
    build_recipe = _build_managed_agent_runtime_recipe(
        agent,
        system_prompt_visible=bool(actor is not None and actor.role == "OPS_ADMIN"),
        system_prompt=target_payload["record"].system_prompt,
    )

    output = {
        "found": True,
        "agent": agent,
        "build_recipe": build_recipe,
        "relationships": _build_managed_agent_relationships(agent, agent_payloads),
        "role_archetype": target_payload["role_archetype"],
    }
    return AssistantToolExecutionResult(
        output=output,
        summary=f"Loaded managed agent profile for {agent['name']}.",
        record_count=1,
        evidence_items=_build_managed_agent_profile_evidence(output),
    )


def _get_application_catalog(db: Session, _arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    payload = build_application_catalog(db)
    summary = (
        f"Loaded the ECTRM application catalog with {payload['route_group_count']} route group(s), "
        f"{payload['route_count']} published route(s), and {len(payload['workspace_catalog'])} workspace(s)."
    )
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=payload["route_count"],
        evidence_items=_build_application_catalog_evidence(payload),
    )


def _get_data_schema_catalog(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    table_name = _optional_text(arguments.get("table_name"))
    payload = build_data_schema_catalog(db, table_name=table_name)
    if table_name is not None and not payload.get("found", False):
        return AssistantToolExecutionResult(
            output=payload,
            summary=f"No database table matched {table_name}.",
            record_count=0,
            evidence_items=_build_schema_catalog_evidence(payload, table_name=table_name),
        )

    if table_name is not None:
        table_payload = payload["table"]
        summary = (
            f"Loaded schema details for table {table_payload['table_name']} with "
            f"{table_payload['column_count']} column(s) and {len(table_payload['foreign_keys'])} relationship(s)."
        )
        return AssistantToolExecutionResult(
            output=payload,
            summary=summary,
            record_count=1,
            evidence_items=_build_schema_catalog_evidence(payload, table_name=table_name),
        )

    summary = (
        f"Loaded schema details for {payload['table_count']} table(s) with "
        f"{payload['relationship_count']} foreign-key relationship(s)."
    )
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=int(payload["table_count"]),
        evidence_items=_build_schema_catalog_evidence(payload, table_name=table_name),
    )


def _search_codebase(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    del db
    query = _require_text(arguments.get("query"), field_name="query")
    scope = _optional_text(arguments.get("scope")) or "all"
    path_prefix = _optional_text(arguments.get("path_prefix"))
    limit = _normalize_limit(arguments.get("limit"), default=10)
    try:
        payload = search_codebase(
            query=query,
            scope=scope,
            limit=limit,
            path_prefix=path_prefix,
        )
    except ValueError as exc:
        raise AssistantToolServiceError(str(exc)) from exc

    summary = f"Found {payload['count']} codebase match(es) for '{query}' in scope {payload['scope']}."
    if payload["truncated"]:
        summary += " Results were truncated at the tool limit."
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=payload["count"],
        evidence_items=_build_code_search_evidence(payload),
    )


def _read_codebase_file(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    del db
    path = _require_text(arguments.get("path"), field_name="path")
    start_line = _normalize_optional_int(arguments.get("start_line"), field_name="start_line") or 1
    end_line = _normalize_optional_int(arguments.get("end_line"), field_name="end_line")
    try:
        payload = read_codebase_file(
            path=path,
            start_line=start_line,
            end_line=end_line,
        )
    except ValueError as exc:
        raise AssistantToolServiceError(str(exc)) from exc

    summary = (
        f"Loaded {payload['path']} lines {payload['start_line']}-{payload['end_line']} "
        f"out of {payload['total_lines']} total line(s)."
    )
    if payload["truncated"]:
        summary += " The read window was truncated."
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=1,
        evidence_items=_build_code_file_evidence(payload),
    )


async def _consult_managed_agent(
    db: Session,
    arguments: dict[str, Any],
    *,
    actor_id: str | None,
    caller_agent: Any | None = None,
) -> AssistantToolExecutionResult:
    from apps.api.app.domains.assistant.services.chat import AssistantService
    from apps.api.app.domains.assistant.services.prompt_context import AssistantPromptUser, build_prompt_context
    from apps.api.app.domains.assistant.services.registry import ACTIVE_ASSISTANT_AGENT_STATUS, to_managed_agent
    from apps.api.app.domains.assistant.services.skills import INTER_AGENT_CONSULTATION_SKILL
    from apps.api.app.models.assistant_agent import AssistantAgent
    from apps.api.app.schemas.assistant import AssistantPromptContextRequest, AssistantPromptRequest

    if not actor_id:
        raise AssistantToolServiceError("consult_managed_agent requires an authenticated actor context.")

    target_agent_id = _require_text(arguments.get("agent_id"), field_name="agent_id").lower()
    question = _require_text(arguments.get("question"), field_name="question")
    consultation_context = _optional_text(arguments.get("context"))
    requested_workspace = _optional_text(arguments.get("workspace"))
    use_live_tools = _normalize_bool(arguments.get("use_live_tools"), default=True, field_name="use_live_tools")

    actor = db.get(UserAccount, actor_id)
    if actor is None:
        raise AssistantToolServiceError("The current user could not be resolved for agent consultation.")

    target_record = db.get(AssistantAgent, target_agent_id)
    if target_record is None:
        raise AssistantToolServiceError(f"No managed agent matched agent_id {target_agent_id}.")
    if target_record.status != ACTIVE_ASSISTANT_AGENT_STATUS:
        raise AssistantToolServiceError(f"{target_record.name} is not active and cannot be consulted.")

    _enforce_managed_agent_coordination_hierarchy(caller_agent, target_agent_id)

    target_agent = to_managed_agent(target_record)
    workspace = _resolve_consult_workspace(target_agent.allowed_workspaces, requested_workspace)
    consultation_agent = replace(
        target_agent,
        skills=tuple(skill for skill in target_agent.skills if skill != INTER_AGENT_CONSULTATION_SKILL),
        allowed_tools=tuple(tool_name for tool_name in target_agent.allowed_tools if tool_name != "consult_managed_agent"),
    )
    prompt_user = AssistantPromptUser(
        user_id=actor.user_id,
        display_name=actor.display_name,
        first_name=actor.first_name,
        last_name=actor.last_name,
        preferred_timezone=actor.preferred_timezone,
        primary_location=actor.primary_location,
        role=actor.role,
        email=actor.email,
        default_persona=actor.default_assistant_persona,
        assistant_context_blurb=actor.assistant_context_blurb,
        session_id=None,
        session_expires_at=None,
    )
    prompt_context = build_prompt_context(
        payload=AssistantPromptContextRequest(
            workspace=workspace,
            context=_build_consultation_context(target_record.name, consultation_context),
            use_live_tools=use_live_tools,
        ),
        user=prompt_user,
        db=db,
        agent_definition=consultation_agent,
    )
    response = await AssistantService(db, actor_id=actor_id).generate_response(
        payload=AssistantPromptRequest(
            workspace=workspace,
            use_live_tools=use_live_tools,
            messages=[{"role": "user", "content": question}],
        ),
        agent_definition=consultation_agent,
        prompt_context=prompt_context,
    )
    return AssistantToolExecutionResult(
        output={
            "ok": True,
            "advisory_only": True,
            "agent_id": consultation_agent.agent_id,
            "agent_name": consultation_agent.name,
            "workspace": workspace,
            "answer": response.message.content,
            "warnings": list(response.warnings),
            "tool_calls": [call.model_dump(mode="json") for call in response.tool_calls],
            "build_recipe": _build_managed_agent_runtime_recipe(_managed_agent_to_dict(consultation_agent)),
        },
        summary=f"Consulted {consultation_agent.name} for advisory input.",
        record_count=1,
    )


async def _enlist_managed_agent(
    db: Session,
    arguments: dict[str, Any],
    *,
    actor_id: str | None,
    caller_agent: Any | None = None,
    delegation_depth: int = 0,
) -> AssistantToolExecutionResult:
    from apps.api.app.domains.assistant.services.action_requests import create_action_requests, to_action_request_out_list
    from apps.api.app.domains.assistant.services.chat import AssistantService
    from apps.api.app.domains.assistant.services.execution import (
        _to_prompt_section_out,
        _autonomous_execution_update_message,
        _autonomously_execute_action_requests,
        prepare_assistant_execution,
    )
    from apps.api.app.domains.assistant.services.policies import authority_allows_execution
    from apps.api.app.domains.assistant.services.prompt_context import AssistantPromptUser
    from apps.api.app.domains.assistant.services.registry import ACTIVE_ASSISTANT_AGENT_STATUS, to_managed_agent
    from apps.api.app.domains.assistant.services.runs import attach_run_metadata, create_assistant_run
    from apps.api.app.models.assistant_agent import AssistantAgent
    from apps.api.app.schemas.assistant import AssistantPromptRequest, AssistantPromptResponse

    if not actor_id:
        raise AssistantToolServiceError("enlist_managed_agent requires an authenticated actor context.")

    _enforce_managed_agent_delegation_depth(delegation_depth)

    target_agent_id = _require_text(arguments.get("agent_id"), field_name="agent_id").lower()
    task = _require_text(arguments.get("task"), field_name="task")
    delegated_context = _optional_text(arguments.get("context"))
    requested_workspace = _optional_text(arguments.get("workspace"))
    use_live_tools = _normalize_bool(arguments.get("use_live_tools"), default=True, field_name="use_live_tools")

    actor = db.get(UserAccount, actor_id)
    if actor is None:
        raise AssistantToolServiceError("The current user could not be resolved for managed-agent delegation.")

    target_record = db.get(AssistantAgent, target_agent_id)
    if target_record is None:
        raise AssistantToolServiceError(f"No managed agent matched agent_id {target_agent_id}.")
    if target_record.status != ACTIVE_ASSISTANT_AGENT_STATUS:
        raise AssistantToolServiceError(f"{target_record.name} is not active and cannot be enlisted.")

    _enforce_managed_agent_coordination_hierarchy(caller_agent, target_agent_id)

    target_agent = to_managed_agent(target_record)
    workspace = _resolve_consult_workspace(target_agent.allowed_workspaces, requested_workspace)
    request_identity = get_request_identity()
    delegated_session_id = request_identity.session_id or _synthetic_delegated_session_id(
        actor_id=actor_id,
        target_agent_id=target_agent.agent_id,
    )
    delegated_role = request_identity.role or actor.role
    delegated_user = AssistantPromptUser(
        user_id=actor.user_id,
        display_name=actor.display_name,
        first_name=actor.first_name,
        last_name=actor.last_name,
        preferred_timezone=actor.preferred_timezone,
        primary_location=actor.primary_location,
        role=delegated_role,
        email=actor.email,
        default_persona=actor.default_assistant_persona,
        assistant_context_blurb=actor.assistant_context_blurb,
        session_id=delegated_session_id,
        session_expires_at=None,
    )
    delegated_payload = AssistantPromptRequest(
        agent_id=target_agent.agent_id,
        workspace=workspace,
        context=_build_enlistment_context(
            caller_agent_name=str(getattr(caller_agent, "name", "") or "another managed agent"),
            target_agent_name=target_agent.name,
            context=delegated_context,
        ),
        use_live_tools=use_live_tools,
        messages=[{"role": "user", "content": task}],
    )
    prepared = prepare_assistant_execution(
        db=db,
        payload=delegated_payload,
        authorization_header=None,
        user=delegated_user,
    )
    _annotate_delegated_action_proposals(
        prepared.action_runtime_result.proposals,
        caller_agent=caller_agent,
        workspace=workspace,
        task=task,
    )

    response = await AssistantService(
        db,
        actor_id=actor_id,
        delegation_depth=delegation_depth + 1,
    ).generate_response(
        delegated_payload,
        agent_definition=prepared.agent_definition,
        prompt_context=prepared.prompt_context,
    )
    if not isinstance(response, AssistantPromptResponse):
        response = AssistantPromptResponse.model_validate(response)
    if response.agent_role_key is None:
        response.agent_role_key = prepared.prompt_context.agent_role_key
    if response.agent_profile_kind is None:
        response.agent_profile_kind = prepared.prompt_context.agent_profile_kind

    run_record = create_assistant_run(
        db=db,
        conversation_id=None,
        status="COMPLETED",
        user_id=delegated_user.user_id,
        session_id=delegated_session_id,
        user_role=delegated_user.role,
        workspace=workspace,
        agent_id=response.agent_id,
        agent_name=response.agent_name,
        agent_role_key=response.agent_role_key,
        agent_profile_kind=response.agent_profile_kind,
        provider=response.provider,
        model=response.model,
        use_live_tools=use_live_tools,
        request_messages=delegated_payload.messages,
        application_context=delegated_payload.context,
        prompt_sections=[_to_prompt_section_out(section) for section in prepared.prompt_context.sections],
        rendered_system_prompt=prepared.prompt_context.system_prompt,
        warnings=response.warnings,
        tool_calls=response.tool_calls,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        assistant_message=response.message.content,
    )
    action_request_records = create_action_requests(
        db=db,
        run_id=run_record.id,
        user_id=delegated_user.user_id,
        session_id=delegated_session_id,
        workspace=workspace,
        agent_id=response.agent_id,
        agent_name=response.agent_name,
        proposals=prepared.action_runtime_result.proposals,
    )
    if authority_allows_execution(target_agent.authority_ceiling):
        action_request_records = _autonomously_execute_action_requests(
            db=db,
            records=action_request_records,
            actor_id=response.agent_id or target_agent.agent_id,
            actor_role=delegated_user.role,
        )
        execution_update = _autonomous_execution_update_message(action_request_records)
        if execution_update:
            response.message.content = f"{response.message.content}\n\n{execution_update}"
            run_record.assistant_message = response.message.content
            db.commit()
            db.refresh(run_record)

    response.action_requests = to_action_request_out_list(action_request_records)
    response = attach_run_metadata(response, run_record)
    action_request_outputs = [row.model_dump(mode="json") for row in response.action_requests]
    executed_count = sum(1 for row in action_request_outputs if row["status"] == "EXECUTED")
    pending_count = sum(1 for row in action_request_outputs if row["status"] == "PENDING")
    failed_count = sum(1 for row in action_request_outputs if row["status"] == "FAILED")

    return AssistantToolExecutionResult(
        output={
            "ok": True,
            "delegated": True,
            "advisory_only": False,
            "agent_id": target_agent.agent_id,
            "agent_name": target_agent.name,
            "workspace": workspace,
            "answer": response.message.content,
            "warnings": list(response.warnings),
            "tool_calls": [call.model_dump(mode="json") for call in response.tool_calls],
            "action_requests": action_request_outputs,
            "action_request_count": len(action_request_outputs),
            "executed_action_count": executed_count,
            "pending_action_count": pending_count,
            "failed_action_count": failed_count,
            "run_id": response.run_id,
            "run_recorded_at": response.run_recorded_at.isoformat() if response.run_recorded_at else None,
            "build_recipe": _build_managed_agent_runtime_recipe(_managed_agent_to_dict(target_agent)),
        },
        summary=_build_enlisted_managed_agent_summary(
            agent_name=target_agent.name,
            executed_count=executed_count,
            pending_count=pending_count,
            failed_count=failed_count,
        ),
        record_count=1,
    )


def _resolve_consult_workspace(
    allowed_workspaces: tuple[str, ...],
    requested_workspace: str | None,
) -> str:
    if requested_workspace is not None:
        normalized_workspace = requested_workspace.strip().lower()
        if normalized_workspace not in set(allowed_workspaces):
            raise AssistantToolServiceError(
                f"The consulted agent is not configured for the {normalized_workspace} workspace."
            )
        return normalized_workspace
    if "assistant" in set(allowed_workspaces):
        return "assistant"
    if not allowed_workspaces:
        raise AssistantToolServiceError("The consulted agent has no allowed workspaces.")
    return allowed_workspaces[0]


def _enforce_managed_agent_coordination_hierarchy(caller_agent: Any | None, target_agent_id: str) -> None:
    if caller_agent is None:
        return

    managed_agent_ids = tuple(getattr(caller_agent, "managed_agent_ids", ()) or ())
    if managed_agent_ids:
        if target_agent_id not in set(managed_agent_ids):
            raise AssistantToolServiceError(
                f"{getattr(caller_agent, 'name', 'This agent')} may only consult configured managed agents: "
                f"{', '.join(managed_agent_ids)}."
            )
        return

    orchestration_pattern = str(getattr(caller_agent, "orchestration_pattern", "SINGLE") or "SINGLE").upper()
    if orchestration_pattern != "SINGLE":
        raise AssistantToolServiceError(
            f"{getattr(caller_agent, 'name', 'This agent')} uses {orchestration_pattern} orchestration but has no configured managed_agent_ids."
        )


def _enforce_managed_agent_delegation_depth(delegation_depth: int) -> None:
    if delegation_depth >= MAX_MANAGED_AGENT_DELEGATION_DEPTH:
        raise AssistantToolServiceError(
            "Managed-agent delegation is limited to two nested layers. Stop here and synthesize with the evidence already gathered."
        )


def _build_consultation_context(agent_name: str, context: str | None) -> str:
    lines = [
        f"This is an internal advisory consultation for {agent_name}.",
        "Return analysis only.",
        "Do not claim that any governed action was staged or executed through this consultation.",
        "Do not consult any other managed agent from inside this consultation.",
    ]
    if context:
        lines.extend(["Shared context:", context])
    return "\n".join(lines)


def _build_enlistment_context(
    *,
    caller_agent_name: str,
    target_agent_name: str,
    context: str | None,
) -> str:
    lines = [
        f"This is an internal delegated task from {caller_agent_name} to {target_agent_name}.",
        "Own the task inside your allowed lane and use your normal live-tool and governed-action scope when justified.",
        "Any governed mutation must still flow through typed action requests or bounded autonomous execution metadata.",
        "Be explicit about what you observed, what you drafted, and whether anything was staged or executed.",
    ]
    if context:
        lines.extend(["Shared context:", context])
    return "\n".join(lines)


def _annotate_delegated_action_proposals(
    proposals: tuple[Any, ...],
    *,
    caller_agent: Any | None,
    workspace: str,
    task: str,
) -> None:
    if caller_agent is None:
        return
    delegated_by_agent_id = _optional_text(getattr(caller_agent, "agent_id", None))
    delegated_by_agent_name = _optional_text(getattr(caller_agent, "name", None))
    if delegated_by_agent_id is None and delegated_by_agent_name is None:
        return
    for proposal in proposals:
        review_context = proposal.payload.get("review_context")
        if not isinstance(review_context, dict):
            continue
        review_context["delegated_by_agent"] = {
            "agent_id": delegated_by_agent_id,
            "name": delegated_by_agent_name,
        }
        review_context["delegated_task"] = task
        review_context["delegated_workspace"] = workspace


def _build_enlisted_managed_agent_summary(
    *,
    agent_name: str,
    executed_count: int,
    pending_count: int,
    failed_count: int,
) -> str:
    parts = [f"Enlisted {agent_name}."]
    if executed_count:
        parts.append(f"Executed {executed_count} governed action(s).")
    if pending_count:
        parts.append(f"Staged {pending_count} action request(s) for review.")
    if failed_count:
        parts.append(f"{failed_count} delegated action(s) failed.")
    if executed_count == 0 and pending_count == 0 and failed_count == 0:
        parts.append("No governed actions were staged or executed.")
    return " ".join(parts)


def _synthetic_delegated_session_id(*, actor_id: str, target_agent_id: str) -> str:
    return f"delegated:{actor_id}:{target_agent_id}"


def _managed_agent_to_dict(agent: Any) -> dict[str, Any]:
    return {
        "role_key": getattr(agent, "role_key", None),
        "profile_kind": getattr(agent, "profile_kind", None),
        "authority_ceiling": getattr(agent, "authority_ceiling", None),
        "orchestration_pattern": getattr(agent, "orchestration_pattern", "SINGLE"),
        "parent_agent_id": getattr(agent, "parent_agent_id", None),
        "managed_agent_ids": list(getattr(agent, "managed_agent_ids", ()) or ()),
        "delegation_guidance": getattr(agent, "delegation_guidance", None),
        "skills": list(getattr(agent, "skills", ()) or ()),
        "capabilities": list(getattr(agent, "capabilities", ()) or ()),
        "allowed_workspaces": list(getattr(agent, "allowed_workspaces", ()) or ()),
        "allowed_tools": list(getattr(agent, "allowed_tools", ()) or ()),
        "allowed_action_types": list(getattr(agent, "allowed_action_types", ()) or ()),
    }


def _build_managed_agent_runtime_recipe(
    agent: dict[str, Any],
    *,
    system_prompt_visible: bool = False,
    system_prompt: str | None = None,
) -> dict[str, Any]:
    payload = {
        "expression": MANAGED_AGENT_BUILD_RECIPE,
        "role_key": agent.get("role_key"),
        "profile_kind": agent.get("profile_kind"),
        "authority_ceiling": agent.get("authority_ceiling"),
        "orchestration_pattern": agent.get("orchestration_pattern"),
        "parent_agent_id": agent.get("parent_agent_id"),
        "managed_agent_ids": list(agent.get("managed_agent_ids") or []),
        "delegation_guidance": agent.get("delegation_guidance"),
        "skills": list(agent.get("skills") or []),
        "capabilities": list(agent.get("capabilities") or []),
        "allowed_workspaces": list(agent.get("allowed_workspaces") or []),
        "allowed_tools": list(agent.get("allowed_tools") or []),
        "allowed_action_types": list(agent.get("allowed_action_types") or []),
        "system_prompt_visible": system_prompt_visible,
    }
    if system_prompt_visible:
        payload["system_prompt"] = system_prompt
    return payload


def _load_managed_agent_payloads(db: Session) -> list[dict[str, Any]]:
    from apps.api.app.domains.assistant.services.eval_gates import build_agent_eval_gate, build_role_archetype_eval_gate
    from apps.api.app.domains.assistant.services.registry import (
        list_public_agent_records,
        summarize_agent_token_budgets,
        to_public_agent_out,
    )
    from apps.api.app.domains.assistant.services.role_archetypes import get_role_archetype, to_role_archetype_out

    records = list_public_agent_records(db)
    token_budgets = summarize_agent_token_budgets(db, records)
    payloads: list[dict[str, Any]] = []
    for record in records:
        public_agent = to_public_agent_out(
            record,
            token_budget=token_budgets.get(record.agent_id),
            eval_gate=build_agent_eval_gate(db, record),
        )
        role = get_role_archetype(record.role_key) if record.role_key else None
        payloads.append(
            {
                "record": record,
                "agent": _dump_model(public_agent),
                "role_archetype": (
                    _dump_model(to_role_archetype_out(role, eval_gate=build_role_archetype_eval_gate(role)))
                    if role is not None
                    else None
                ),
            }
        )
    return payloads


def _managed_agent_matches_filters(
    agent: dict[str, Any],
    *,
    query: str | None,
    role_key: str | None,
) -> bool:
    if role_key is not None and str(agent.get("role_key") or "").lower() != role_key.lower():
        return False
    if query is None:
        return True
    haystack = " ".join(
        [
            str(agent.get("agent_id") or ""),
            str(agent.get("name") or ""),
            str(agent.get("description") or ""),
            str(agent.get("role_key") or ""),
            str(agent.get("specialization_summary") or ""),
        ]
    ).lower()
    return query.lower() in haystack


def _build_managed_agent_summary_row(
    payload: dict[str, Any],
    agent_payloads: list[dict[str, Any]],
) -> dict[str, Any]:
    agent = payload["agent"]
    relationships = _build_managed_agent_relationships(agent, agent_payloads)
    return {
        "agent_id": agent["agent_id"],
        "name": agent["name"],
        "description": agent["description"],
        "role_key": agent["role_key"],
        "profile_kind": agent["profile_kind"],
        "authority_ceiling": agent["authority_ceiling"],
        "human_owner_role": agent["human_owner_role"],
        "orchestration_pattern": agent["orchestration_pattern"],
        "parent_agent_id": agent["parent_agent_id"],
        "managed_agent_ids": list(agent["managed_agent_ids"]),
        "managed_by_agent_ids": list(relationships["managed_by_agent_ids"]),
        "skills": list(agent["skills"]),
        "capabilities": list(agent["capabilities"]),
        "allowed_workspaces": list(agent["allowed_workspaces"]),
        "build_recipe": MANAGED_AGENT_BUILD_RECIPE,
        "specialization_summary": agent["specialization_summary"],
        "relationship_summary": relationships["summary"],
        "related_agents": relationships["related_agents"],
    }


def _build_managed_agent_relationships(
    agent: dict[str, Any],
    agent_payloads: list[dict[str, Any]],
) -> dict[str, Any]:
    agent_by_id = {payload["agent"]["agent_id"]: payload["agent"] for payload in agent_payloads}
    relationship_types_by_agent_id: dict[str, set[str]] = {}

    def register(related_agent_id: str, relationship_type: str) -> None:
        if not related_agent_id:
            return
        relationship_types_by_agent_id.setdefault(related_agent_id, set()).add(relationship_type)

    parent_agent_id = str(agent.get("parent_agent_id") or "")
    if parent_agent_id:
        register(parent_agent_id, "parent")

    for managed_agent_id in list(agent.get("managed_agent_ids") or []):
        register(str(managed_agent_id), "manages")

    for payload in agent_payloads:
        other_agent = payload["agent"]
        other_agent_id = str(other_agent.get("agent_id") or "")
        if other_agent_id == agent["agent_id"]:
            continue
        if agent["agent_id"] == other_agent.get("parent_agent_id"):
            register(other_agent_id, "parent_of")
            register(other_agent_id, "manages")
        if agent["agent_id"] in set(other_agent.get("managed_agent_ids") or []):
            register(other_agent_id, "managed_by")

    related_agents = []
    for related_agent_id in sorted(relationship_types_by_agent_id):
        related_agent = agent_by_id.get(related_agent_id)
        related_agents.append(
            {
                "agent_id": related_agent_id,
                "name": related_agent["name"] if related_agent is not None else related_agent_id,
                "role_key": related_agent["role_key"] if related_agent is not None else None,
                "relationship_types": sorted(relationship_types_by_agent_id[related_agent_id]),
            }
        )

    managed_by_agent_ids = sorted(
        related_agent["agent_id"]
        for related_agent in related_agents
        if "managed_by" in set(related_agent["relationship_types"]) or "parent" in set(related_agent["relationship_types"])
    )
    return {
        "parent_agent_id": parent_agent_id or None,
        "managed_agent_ids": list(agent.get("managed_agent_ids") or []),
        "managed_by_agent_ids": managed_by_agent_ids,
        "related_agents": related_agents,
        "summary": _build_managed_agent_relationship_summary(
            parent_agent_id=parent_agent_id or None,
            managed_agent_ids=tuple(agent.get("managed_agent_ids") or ()),
            managed_by_agent_ids=tuple(managed_by_agent_ids),
        ),
    }


def _build_managed_agent_relationship_summary(
    *,
    parent_agent_id: str | None,
    managed_agent_ids: tuple[str, ...],
    managed_by_agent_ids: tuple[str, ...],
) -> str:
    summary_parts: list[str] = []
    if managed_by_agent_ids:
        summary_parts.append(f"managed by {', '.join(managed_by_agent_ids)}")
    elif parent_agent_id:
        summary_parts.append(f"reports to {parent_agent_id}")
    if managed_agent_ids:
        summary_parts.append(f"manages {', '.join(managed_agent_ids)}")
    if not summary_parts:
        return "No explicit managed-agent links are configured."
    return "; ".join(summary_parts) + "."


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


def _get_latest_commodity_prices(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    commodity = _optional_upper(arguments.get("commodity"))
    price_index_code = _optional_upper(arguments.get("price_index_code"))
    limit = _normalize_market_context_limit(arguments.get("limit"), default=5)
    payload = build_latest_price_snapshot(
        db,
        commodity=commodity,
        price_index_code=price_index_code,
        limit=limit,
    )
    count = payload["count"]
    stale_or_failed_count = sum(
        1
        for row in payload["items"]
        if row["provider_health_status"] in {"stale", "failed", "unknown"}
    )

    if price_index_code:
        if count:
            summary = f"Loaded the latest commodity price for {price_index_code}."
        else:
            summary = f"No loaded commodity price matched price_index_code {price_index_code}."
    elif commodity:
        summary = f"Loaded {count} latest commodity price row(s) for {commodity}."
    else:
        summary = f"Loaded {count} latest commodity price row(s)."

    if stale_or_failed_count:
        summary += f" Freshness watch on {stale_or_failed_count} provider(s)."

    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=count,
    )


def _get_latest_market_news(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    _ = db
    commodity = _optional_upper(arguments.get("commodity"))
    query = _optional_text(arguments.get("query"))
    limit = _normalize_market_news_limit(arguments.get("limit"), default=5)
    lookback_days = _normalize_market_news_lookback_days(
        arguments.get("lookback_days"),
        default=DEFAULT_MARKET_NEWS_LOOKBACK_DAYS,
    )

    try:
        payload = load_market_news_headlines(
            query=query,
            commodity=commodity,
            limit=limit,
            lookback_days=lookback_days,
        )
    except MarketNewsClientError as exc:
        raise AssistantToolServiceError(str(exc)) from exc

    count = payload["count"]
    if commodity and query:
        summary = f"Loaded {count} recent headline(s) for {commodity} using query '{query}'."
    elif commodity:
        summary = f"Loaded {count} recent headline(s) for {commodity}."
    elif query:
        summary = f"Loaded {count} recent headline(s) using query '{query}'."
    else:
        summary = f"Loaded {count} recent market headline(s)."

    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=count,
    )


def _analyze_pretrade_scenario_draft(
    db: Session,
    arguments: dict[str, Any],
    *,
    actor_id: str | None,
) -> AssistantToolExecutionResult:
    if actor_id is None:
        raise AssistantToolServiceError(
            "Authenticated actor context is required to analyze pre-trade scenario drafts."
        )

    try:
        payload = PreTradeRecommendationDraftAnalysisCreate.model_validate(arguments)
    except ValidationError as exc:
        error = exc.errors(include_url=False)[0]
        field_path = ".".join(str(part) for part in error.get("loc", ()))
        detail = error.get("msg", "Invalid pre-trade draft analysis arguments.")
        if field_path:
            detail = f"{field_path}: {detail}"
        raise AssistantToolServiceError(detail) from exc

    previous_record = latest_accessible_recommendation_run_record(
        db,
        actor_id=actor_id,
        source_scenario_id=payload.source_scenario_id,
        source_review_id=payload.source_review_id,
    )
    analysis = build_pretrade_recommendation_draft_analysis(
        thesis=payload.thesis,
        draft=payload.draft,
        source_scenario_id=payload.source_scenario_id,
        source_review_id=payload.source_review_id,
        input_snapshots=payload.input_snapshots,
        db=db,
        as_of=datetime.now(timezone.utc),
        actor_id=actor_id,
        previous_record=previous_record,
    )
    anchor = "draft"
    if payload.source_review_id is not None:
        anchor = f"review {payload.source_review_id} draft"
    elif payload.source_scenario_id is not None:
        anchor = f"scenario {payload.source_scenario_id} draft"
    comparison_summary = ""
    if analysis.comparison is not None:
        comparison_summary = f" Compared with saved run {analysis.comparison.previous_run_id}."
    summary = (
        f"Analyzed {anchor}: {analysis.recommendation.stance.replace('_', ' ').lower()} stance"
        f" with {len(analysis.recommendation.missing_evidence)} missing evidence item(s)."
        f"{comparison_summary}"
    )
    return AssistantToolExecutionResult(
        output={"analysis": analysis.model_dump(mode="json", exclude_none=True)},
        summary=summary,
        record_count=1,
    )


def _get_pretrade_recommendation_run(
    db: Session,
    arguments: dict[str, Any],
    *,
    actor_id: str | None,
) -> AssistantToolExecutionResult:
    if actor_id is None:
        raise AssistantToolServiceError(
            "Authenticated actor context is required to load pre-trade recommendation runs."
        )

    run_id = _normalize_optional_positive_int(arguments.get("run_id"), field_name="run_id")
    source_scenario_id = _normalize_optional_positive_int(
        arguments.get("source_scenario_id"),
        field_name="source_scenario_id",
    )
    source_review_id = _normalize_optional_positive_int(
        arguments.get("source_review_id"),
        field_name="source_review_id",
    )
    provided_lookup_count = sum(
        1
        for value in (run_id, source_scenario_id, source_review_id)
        if value is not None
    )
    if provided_lookup_count != 1:
        raise AssistantToolServiceError(
            "Provide exactly one of run_id, source_scenario_id, or source_review_id."
        )

    if run_id is not None:
        record = get_accessible_recommendation_run_record(
            db,
            recommendation_run_id=run_id,
            actor_id=actor_id,
        )
        lookup_summary = f"run_id {run_id}"
    else:
        record = latest_accessible_recommendation_run_record(
            db,
            actor_id=actor_id,
            source_scenario_id=source_scenario_id,
            source_review_id=source_review_id,
        )
        if source_scenario_id is not None:
            lookup_summary = f"latest run for scenario {source_scenario_id}"
        else:
            lookup_summary = f"latest run for review {source_review_id}"

    if record is None:
        return AssistantToolExecutionResult(
            output={
                "found": False,
                "lookup": {
                    "run_id": run_id,
                    "source_scenario_id": source_scenario_id,
                    "source_review_id": source_review_id,
                },
            },
            summary=f"No visible pre-trade recommendation run matched {lookup_summary}.",
            record_count=0,
        )

    accessible_records = accessible_recommendation_run_records(db, actor_id=actor_id)
    run = to_recommendation_run_out(
        record,
        actor_id=actor_id,
        previous_record=previous_recommendation_run_record(accessible_records, record),
    )
    missing_evidence_count = len(run.recommendation.missing_evidence)
    summary = (
        f"Loaded pre-trade recommendation run {run.run_id} in stance "
        f"{run.recommendation.stance} for {lookup_summary}."
    )
    if missing_evidence_count:
        summary += f" Missing or impaired evidence flagged on {missing_evidence_count} section(s)."

    return AssistantToolExecutionResult(
        output={
            "found": True,
            "lookup": {
                "run_id": run_id,
                "source_scenario_id": source_scenario_id,
                "source_review_id": source_review_id,
            },
            "run": run.model_dump(mode="json", exclude_none=True),
        },
        summary=summary,
        record_count=1,
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
    if trade_id is None and status is None and receipt_status is None:
        candidate_count = load_trade_attention_candidate_count(db, "confirmation_backlog")
        if candidate_count:
            payload["confirmation_backlog_candidate_count"] = candidate_count
            payload["suggested_next_tool"] = "list_trade_attention_candidates"
            summary += (
                f" {candidate_count} active trade(s) are in confirmation backlog; "
                "use list_trade_attention_candidates with candidate_type confirmation_backlog to inspect rows "
                "that may not have confirmation ledger records yet."
            )
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


def _list_trade_attention_candidates(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    candidate_type = _normalize_optional_trade_attention_candidate_type(arguments.get("candidate_type"))
    limit = _normalize_limit(arguments.get("limit"), default=10)

    rows = load_trade_attention_candidates(db, candidate_type=candidate_type, limit=limit)
    items = [_dump_trade_attention_candidate(row) for row in rows]
    type_counts: dict[str, int] = {}
    for row in rows:
        for row_candidate_type in row.candidate_types:
            type_counts[row_candidate_type] = type_counts.get(row_candidate_type, 0) + 1

    payload: dict[str, Any] = {
        "count": len(items),
        "items": items,
        "candidate_type_counts": type_counts,
    }
    if candidate_type is not None:
        definition = get_trade_attention_candidate_definition(candidate_type)
        payload["candidate_type"] = definition.candidate_type
        payload["source_count_key"] = definition.source_count_key
        payload["description"] = definition.description
        summary = (
            f"Returned {len(items)} {definition.label.lower()} trade attention candidate(s) "
            f"for {definition.source_count_key}."
        )
    else:
        payload["candidate_types"] = list(TRADE_ATTENTION_CANDIDATE_TYPE_NAMES)
        summary = f"Returned {len(items)} trade attention candidate(s) across workspace count categories."
    if rows:
        summary += f" Top priority is {rows[0].trade_id} because {rows[0].priority_reason}"
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
    if rows:
        summary += f" Top priority is {rows[0].trade_id} because {rows[0].priority_reason}"
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
    if trade_id is None and invoice_id is None and not status and not overdue_only:
        candidate_count = load_trade_attention_candidate_count(db, "payment_due")
        if candidate_count:
            payload["payment_due_candidate_count"] = candidate_count
            payload["suggested_next_tool"] = "list_trade_attention_candidates"
            candidate_summary = (
                f"{candidate_count} active trade(s) have due or overdue payment status; "
                "use list_trade_attention_candidates with candidate_type payment_due to inspect rows "
                "that may not have payment ledger records yet."
            )
            if items:
                summary += f" Separately, {candidate_summary}"
            else:
                summary += f" {candidate_summary}"
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


def _get_settlement_report_filter_options(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    filter_options = build_settlement_filter_options(db)
    payload = {
        "books": list(filter_options["books"]),
        "counterparties": list(filter_options["counterparties"]),
        "currencies": list(filter_options["currencies"]),
        "exception_types": list(filter_options["exception_types"]),
        "severities": list(filter_options["severities"]),
    }
    summary = (
        "Loaded settlement report filter options with "
        f"{len(payload['books'])} book(s), "
        f"{len(payload['counterparties'])} counterparty option(s), and "
        f"{len(payload['currencies'])} currency option(s)."
    )
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=sum(len(value) for value in payload.values()),
    )


def _list_settlement_report_presets(
    db: Session,
    arguments: dict[str, Any],
    *,
    actor_id: str | None,
) -> AssistantToolExecutionResult:
    if actor_id is None:
        raise AssistantToolServiceError("list_settlement_report_presets requires an authenticated actor.")

    scope = _optional_upper(arguments.get("scope"))
    if scope is not None and scope not in {"PERSONAL", "SHARED"}:
        raise AssistantToolServiceError("scope must be PERSONAL or SHARED when provided.")
    limit = _normalize_limit(arguments.get("limit"), default=25)

    records = list_visible_settlement_presets(db, actor_id=actor_id)
    if scope is not None:
        records = [record for record in records if record.scope == scope]
    records = records[:limit]

    items = [
        to_settlement_preset_out(record, actor_id=actor_id, actor_role=None).model_dump(mode="json")
        for record in records
    ]
    payload = {"count": len(items), "items": items}
    summary = f"Returned {len(items)} settlement report preset(s)."
    if scope is not None:
        summary = f"Returned {len(items)} {scope.lower()} settlement report preset(s)."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


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
    if trade_id is None and not execution_status and not operations_owner and not commodity:
        nomination_candidate_count = load_trade_attention_candidate_count(db, "nomination_backlog")
        allocation_candidate_count = load_trade_attention_candidate_count(db, "allocation_backlog")
        if nomination_candidate_count or allocation_candidate_count:
            payload["nomination_backlog_candidate_count"] = nomination_candidate_count
            payload["allocation_backlog_candidate_count"] = allocation_candidate_count
            payload["suggested_next_tool"] = "list_trade_attention_candidates"
            summary += (
                f" {nomination_candidate_count} nomination and {allocation_candidate_count} allocation "
                "candidate trade(s) may require attention outside persisted delivery rows; use "
                "list_trade_attention_candidates to inspect them."
            )
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(items))


def _list_accrual_lots(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    limit = _normalize_limit(arguments.get("limit"), default=10)
    rows = load_accrual_lots(
        db,
        trade_id=_optional_text(arguments.get("trade_id")),
        delivery_id=_optional_text(arguments.get("delivery_id")),
        book=_optional_upper(arguments.get("book")),
        portfolio=_optional_upper(arguments.get("portfolio")),
        counterparty=_optional_upper(arguments.get("counterparty")),
        commodity_class=_optional_upper(arguments.get("commodity_class")),
        accrual_currency_code=_optional_upper(arguments.get("accrual_currency_code")),
        status_filter=_optional_upper(arguments.get("status")),
        limit=limit,
        offset=0,
    )
    payload = {"count": len(rows), "items": rows}
    summary = f"Returned {len(rows)} accrual lot row(s)."
    trade_id = _optional_text(arguments.get("trade_id"))
    if trade_id:
        summary = f"Returned {len(rows)} accrual lot row(s) for trade {trade_id}."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(rows))


def _list_accrual_entries(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    accrual_lot_id = _require_text(arguments.get("accrual_lot_id"), field_name="accrual_lot_id")
    try:
        rows = load_accrual_entries(db, accrual_lot_id=accrual_lot_id)
    except LookupError:
        return AssistantToolExecutionResult(
            output={"found": False, "accrual_lot_id": accrual_lot_id},
            summary=f"Accrual lot {accrual_lot_id} was not found.",
            record_count=0,
        )

    payload = {"found": True, "count": len(rows), "items": rows}
    summary = f"Returned {len(rows)} accrual entry row(s) for lot {accrual_lot_id}."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(rows))


def _get_accrual_reconciliation(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    payload = load_accrual_reconciliation_report(
        db,
        trade_id=_optional_text(arguments.get("trade_id")),
        delivery_id=_optional_text(arguments.get("delivery_id")),
        book=_optional_upper(arguments.get("book")),
        portfolio=_optional_upper(arguments.get("portfolio")),
        counterparty=_optional_upper(arguments.get("counterparty")),
        commodity_class=_optional_upper(arguments.get("commodity_class")),
        accrual_currency_code=_optional_upper(arguments.get("accrual_currency_code")),
        status_filter=_optional_upper(arguments.get("status")),
    )
    summary = (
        f"Accrual reconciliation returned {payload['row_count']} grouped row(s) across "
        f"{payload['lot_count']} accrual lot(s)."
    )
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=int(payload["row_count"]),
    )


def _list_accounting_entries(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    limit = _normalize_limit(arguments.get("limit"), default=10)
    rows = load_trade_accounting_entries(
        db,
        entry_id=_optional_text(arguments.get("entry_id")),
        trade_id=_optional_text(arguments.get("trade_id")),
        accrual_lot_id=_optional_text(arguments.get("accrual_lot_id")),
        invoice_id=_normalize_optional_int(arguments.get("invoice_id"), field_name="invoice_id"),
        payment_id=_normalize_optional_int(arguments.get("payment_id"), field_name="payment_id"),
        status_filter=_optional_upper(arguments.get("status")),
        limit=limit,
        offset=0,
    )
    payload = {"count": len(rows), "items": rows}
    summary = f"Returned {len(rows)} accounting entry row(s)."
    trade_id = _optional_text(arguments.get("trade_id"))
    if trade_id:
        summary = f"Returned {len(rows)} accounting entry row(s) for trade {trade_id}."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=len(rows))


def _normalize_document_kind_for_counts(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text or "UNKNOWN"


def _format_document_kind_label(value: str) -> str:
    return value.replace("_", " ").title()


def _normalize_document_type_count_chart_type(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text if text in {"pie", "bar"} else "pie"


def _document_count_kind(
    document: DocumentIngestion,
    page_kind_counts_by_document: dict[str, dict[str, int]],
) -> str:
    analysis_summary = dict(document.analysis_summary or {})
    summary_kind = _normalize_document_kind_for_counts(analysis_summary.get("dominant_document_kind"))
    if summary_kind != "UNKNOWN":
        return summary_kind

    page_kind_counts = page_kind_counts_by_document.get(document.document_id, {})
    known_page_kind_counts = {
        kind: count
        for kind, count in page_kind_counts.items()
        if kind and kind != "UNKNOWN" and count > 0
    }
    if len(known_page_kind_counts) == 1:
        return next(iter(known_page_kind_counts))
    if len(known_page_kind_counts) > 1:
        return "MIXED"
    return "UNKNOWN"


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


def _get_document_type_counts(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    chart_type = _normalize_document_type_count_chart_type(arguments.get("chart_type"))
    status = _optional_upper(arguments.get("status"))
    review_status = _optional_upper(arguments.get("review_status"))

    documents = (
        db.execute(
            select(DocumentIngestion).order_by(
                DocumentIngestion.created_at.desc(),
                DocumentIngestion.document_id.desc(),
            )
        )
        .scalars()
        .all()
    )
    if status:
        documents = [document for document in documents if document.status == status]
    if review_status:
        documents = [document for document in documents if document.review_status == review_status]

    document_ids = [document.document_id for document in documents]
    page_kind_counts_by_document: dict[str, dict[str, int]] = {}
    if document_ids:
        page_rows = db.execute(
            select(DocumentIngestionPage.document_id, DocumentIngestionPage.document_kind).where(
                DocumentIngestionPage.document_id.in_(document_ids)
            )
        ).all()
        for document_id, document_kind in page_rows:
            normalized_kind = _normalize_document_kind_for_counts(document_kind)
            page_kind_counts = page_kind_counts_by_document.setdefault(str(document_id), {})
            page_kind_counts[normalized_kind] = page_kind_counts.get(normalized_kind, 0) + 1

    counts_by_kind: dict[str, int] = {}
    for document in documents:
        document_kind = _document_count_kind(document, page_kind_counts_by_document)
        counts_by_kind[document_kind] = counts_by_kind.get(document_kind, 0) + 1

    total_count = sum(counts_by_kind.values())
    segments = [
        {
            "document_kind": document_kind,
            "label": _format_document_kind_label(document_kind),
            "count": count,
            "value": count,
            "percentage": round(count / total_count, 4) if total_count else 0,
        }
        for document_kind, count in sorted(
            counts_by_kind.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]
    chart = {
        "artifact_type": "ectrm.chart",
        "version": 1,
        "chart_type": chart_type,
        "title": "Documents by document type",
        "value_label": "Documents",
        "segments": segments,
    }
    filters = {
        key: value
        for key, value in {
            "status": status,
            "review_status": review_status,
        }.items()
        if value
    }
    payload = {
        "total_count": total_count,
        "type_count": len(segments),
        "segments": segments,
        "chart": chart,
        "filters": filters,
        "render_hint": (
            "Include the chart object JSON in a fenced block labelled ectrm-chart when the user asks to see "
            "the chart in Prompt Home or Messages. The chart renderer also supports line, area, scatter, and "
            "histogram artifacts when a tool returns points or bins for those shapes."
        ),
    }
    summary = f"Returned document type counts for {total_count} document row(s) across {len(segments)} type(s)."
    if filters:
        summary += f" Filters: {', '.join(f'{key}={value}' for key, value in filters.items())}."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=total_count)


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


def _list_gmail_inbox_messages(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    query = _optional_text(arguments.get("query"))
    page_token = _optional_text(arguments.get("page_token"))
    limit = _normalize_limit(arguments.get("limit"), default=10)

    try:
        browse_result = load_gmail_inbox_messages(
            db,
            query_override=query,
            page_size=limit,
            page_token=page_token,
        )
    except (LookupError, ValueError, GmailInboxIntegrationError) as exc:
        raise AssistantToolServiceError(str(exc)) from exc

    payload = _dump_model(browse_result)
    messages = list(payload.pop("messages", []))
    payload["count"] = len(messages)
    payload["items"] = messages
    summary = f"Loaded {len(messages)} Gmail inbox message(s)."
    if query:
        summary += f" Query '{query}'."
    if browse_result.next_page_token:
        summary += " More messages are available via next_page_token."
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=len(messages),
    )


def _get_gmail_inbox_message(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    message_id = _require_text(arguments.get("message_id"), field_name="message_id")
    try:
        message = load_gmail_inbox_message_detail(db, message_id=message_id)
    except LookupError:
        return AssistantToolExecutionResult(
            output={"found": False, "message_id": message_id},
            summary=f"Gmail message {message_id} was not found.",
            record_count=0,
        )
    except (ValueError, GmailInboxIntegrationError) as exc:
        raise AssistantToolServiceError(str(exc)) from exc

    importable_attachment_count = sum(1 for attachment in message.attachments if attachment.importable)
    sender = (message.sender or "").strip()[:120] or "unknown sender"
    subject = (message.subject or "").strip()[:160] or "no subject"
    payload = {"found": True, "message": _dump_model(message)}
    summary = (
        f"Loaded Gmail message {message_id} from {sender} with subject {subject} and "
        f"{len(message.attachments)} attachment(s)."
    )
    if importable_attachment_count:
        summary += f" {importable_attachment_count} importable PDF attachment(s) detected."
    if message.body_truncated:
        summary += " Body text was truncated."
    return AssistantToolExecutionResult(output=payload, summary=summary, record_count=1)


def _list_slack_messaging_conversations(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    query = _optional_text(arguments.get("query"))
    limit = _normalize_limit(arguments.get("limit"), default=10)
    message_limit = _normalize_limit(arguments.get("message_limit"), default=3)

    conversations = _load_slack_messaging_conversations(db)
    if query:
        conversations = [
            conversation
            for conversation in conversations
            if _slack_messaging_conversation_matches_query(conversation, query)
        ]
    conversations = sorted(
        conversations,
        key=lambda conversation: (
            _coerce_optional_datetime(conversation.latest_activity_at) or datetime.min.replace(tzinfo=timezone.utc),
            conversation.conversation_id,
        ),
        reverse=True,
    )
    selected = conversations[:limit]
    items = [
        _dump_slack_messaging_conversation_summary(conversation, message_limit=message_limit)
        for conversation in selected
    ]
    payload = {
        "count": len(items),
        "total_matching_count": len(conversations),
        "query": query,
        "items": items,
        "read_only": True,
        "source_provider": "slack",
        "source_surface": "messages_workspace_mirror",
    }
    summary = f"Loaded {len(items)} Slack-backed messaging conversation(s)."
    if query:
        summary += f" Query '{query}'."
    if len(conversations) > len(items):
        summary += " More conversations matched than were returned."
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=len(items),
        evidence_items=_build_slack_messaging_conversation_evidence(
            items,
            total_matching_count=len(conversations),
        ),
    )


def _get_slack_messaging_conversation(db: Session, arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    conversation_id = _require_text(arguments.get("conversation_id"), field_name="conversation_id")
    message_limit = _normalize_limit(arguments.get("message_limit"), default=25)
    conversations = _load_slack_messaging_conversations(db)
    conversation = next(
        (item for item in conversations if item.conversation_id == conversation_id),
        None,
    )
    if conversation is None:
        return AssistantToolExecutionResult(
            output={
                "found": False,
                "conversation_id": conversation_id,
                "read_only": True,
                "source_provider": "slack",
                "source_surface": "messages_workspace_mirror",
            },
            summary=f"Slack-backed messaging conversation {conversation_id} was not found.",
            record_count=0,
            evidence_items=(
                _build_tool_evidence_item(
                    kind="application",
                    title="Slack messaging mirror",
                    locator=conversation_id,
                    summary=f"No Slack-backed mirrored conversation matched {conversation_id}.",
                    badges=["read-only", "not found"],
                ),
            ),
        )

    conversation_payload = _dump_slack_messaging_conversation_detail(
        conversation,
        message_limit=message_limit,
    )
    payload = {
        "found": True,
        "conversation_id": conversation_id,
        "conversation": conversation_payload,
        "read_only": True,
        "source_provider": "slack",
        "source_surface": "messages_workspace_mirror",
    }
    timeline_count = conversation_payload["timeline_count"]
    summary = (
        f"Loaded Slack-backed messaging conversation {conversation.label} "
        f"with {conversation_payload['message_count']} message(s)."
    )
    if conversation_payload["timeline_truncated"]:
        summary += f" Returned the latest {message_limit} of {timeline_count} timeline item(s)."
    return AssistantToolExecutionResult(
        output=payload,
        summary=summary,
        record_count=1,
        evidence_items=(
            _build_tool_evidence_item(
                kind="application",
                title=conversation.label,
                locator=conversation.conversation_id,
                summary=(
                    f"{conversation_payload['message_count']} synced Slack message(s) are available "
                    "from the durable Messages mirror."
                ),
                badges=_normalize_tool_evidence_badges(["Slack", "read-only", "durable mirror"]),
                metadata={
                    "conversation_id": conversation.conversation_id,
                    "source_provider": "slack",
                    "timeline_count": timeline_count,
                },
            ),
        ),
    )


def _load_slack_messaging_conversations(db: Session) -> list[Any]:
    state = load_messaging_workspace_state(db)
    return [
        conversation
        for conversation in state.conversations
        if conversation.source_provider == "slack"
    ]


def _slack_messaging_conversation_matches_query(conversation: Any, query: str) -> bool:
    normalized_query = query.casefold()
    haystack: list[str] = [
        conversation.conversation_id,
        conversation.label,
        conversation.connected_workspace,
        conversation.assistant_workspace,
        conversation.description,
        conversation.topic,
        conversation.preview,
    ]
    for item in conversation.timeline:
        haystack.extend(
            [
                item.source or "",
                item.label or "",
                item.detail or "",
                " ".join(item.body),
            ]
        )
        if item.author is not None:
            haystack.extend([item.author.name, item.author.title, item.author.presence])
        if item.attachment is not None:
            haystack.extend(
                [
                    item.attachment.label,
                    item.attachment.title,
                    item.attachment.summary,
                    item.attachment.footnote,
                ]
            )
    return any(normalized_query in text.casefold() for text in haystack if text)


def _dump_slack_messaging_conversation_summary(conversation: Any, *, message_limit: int) -> dict[str, Any]:
    recent_items = _latest_slack_messaging_timeline_items(conversation.timeline, limit=message_limit)
    return {
        "conversation_id": conversation.conversation_id,
        "label": conversation.label,
        "kind": conversation.kind,
        "section": conversation.section,
        "connected_workspace": conversation.connected_workspace,
        "assistant_workspace": conversation.assistant_workspace,
        "topic": conversation.topic,
        "description": conversation.description,
        "preview": conversation.preview,
        "latest_activity_at": _json_default(conversation.latest_activity_at),
        "unread_count": conversation.unread_count,
        "message_count": _slack_messaging_message_count(conversation.timeline),
        "timeline_count": len(conversation.timeline),
        "recent_messages": [_dump_model(item) for item in recent_items],
        "source_provider": conversation.source_provider,
    }


def _dump_slack_messaging_conversation_detail(conversation: Any, *, message_limit: int) -> dict[str, Any]:
    timeline_items = _latest_slack_messaging_timeline_items(conversation.timeline, limit=message_limit)
    payload = _dump_model(conversation)
    payload["timeline"] = [_dump_model(item) for item in timeline_items]
    payload["timeline_count"] = len(conversation.timeline)
    payload["timeline_returned_count"] = len(timeline_items)
    payload["timeline_truncated"] = len(conversation.timeline) > len(timeline_items)
    payload["message_count"] = _slack_messaging_message_count(conversation.timeline)
    payload["source_surface"] = "messages_workspace_mirror"
    return payload


def _latest_slack_messaging_timeline_items(timeline: list[Any], *, limit: int) -> list[Any]:
    items = list(timeline)
    if len(items) <= limit:
        return items
    return items[-limit:]


def _slack_messaging_message_count(timeline: list[Any]) -> int:
    return sum(1 for item in timeline if item.kind == "message" and item.deleted_at is None)


def _build_slack_messaging_conversation_evidence(
    items: list[dict[str, Any]],
    *,
    total_matching_count: int,
) -> tuple[AssistantToolEvidenceOut, ...]:
    evidence_items = [
        _build_tool_evidence_item(
            kind="application",
            title="Slack messaging mirror",
            summary=(
                f"{total_matching_count} Slack-backed conversation(s) matched in the durable Messages mirror."
            ),
            badges=_normalize_tool_evidence_badges(["Slack", "read-only", "durable mirror"]),
            metadata={
                "source_provider": "slack",
                "source_surface": "messages_workspace_mirror",
                "conversation_ids": [row.get("conversation_id") for row in items],
            },
        )
    ]
    for item in items[:3]:
        evidence_items.append(
            _build_tool_evidence_item(
                kind="application",
                title=str(item.get("label") or item.get("conversation_id") or "Slack conversation"),
                locator=str(item.get("conversation_id") or "") or None,
                summary=str(item.get("preview") or item.get("topic") or "Synced Slack conversation."),
                badges=_normalize_tool_evidence_badges(
                    [
                        "Slack",
                        "read-only",
                        f"{item.get('message_count', 0)} message(s)",
                    ]
                ),
                metadata={
                    "conversation_id": item.get("conversation_id"),
                    "latest_activity_at": item.get("latest_activity_at"),
                },
            )
        )
    return tuple(evidence_items)


def _get_workspace_summary(db: Session, _arguments: dict[str, Any]) -> AssistantToolExecutionResult:
    payload = {
        "generated_at": _json_default(datetime.now(timezone.utc)),
        **build_workspace_bootstrap_summary(db),
    }
    payload["candidate_read_hints"] = {
        "dashboard.attention.confirmation_backlog_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "confirmation_backlog"},
        },
        "dashboard.attention.nomination_backlog_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "nomination_backlog"},
        },
        "dashboard.attention.allocation_backlog_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "allocation_backlog"},
        },
        "dashboard.attention.invoice_backlog_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "invoice_backlog"},
        },
        "dashboard.attention.overdue_payment_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "overdue_payment"},
        },
        "dashboard.attention.stale_pricing_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "stale_pricing"},
        },
        "dashboard.attention.incomplete_ops_data_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "incomplete_ops_data"},
        },
        "settlement.invoice_pending_count": {
            "tool": "list_invoice_issue_candidates",
            "arguments": {},
        },
        "settlement.payment_due_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "payment_due"},
        },
        "settlement.trade_exception_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "settlement_exception"},
        },
        "trades.pending_settlement_count": {
            "tool": "list_trade_attention_candidates",
            "arguments": {"candidate_type": "pending_settlement"},
        },
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
    if isinstance(record, ReferenceCalendar):
        payload["calendar_type"] = record.calendar_type
        payload["market"] = record.market
        payload["timezone"] = record.timezone
    if isinstance(record, ReferencePriceIndex):
        payload["commodity_code"] = record.commodity_code
        payload["currency_code"] = record.currency_code
        payload["unit_code"] = record.unit_code
        payload["provider"] = record.provider
        payload["quote_type"] = record.quote_type
        payload["market"] = record.market
        payload["location_code"] = record.location_code
        payload["calendar_code"] = record.calendar_code
    return payload


def _reference_model_for_entity_type(entity_type: str) -> Any:
    normalized = REFERENCE_ENTITY_TYPE_ALIASES.get(entity_type, entity_type)
    mapping = {
        "books": ReferenceBook,
        "commodities": ReferenceCommodity,
        "calendars": ReferenceCalendar,
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
            "entity_type must be one of books, commodities, calendars, price_indices, currencies, units, locations, counterparties, or portfolios."
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


def _normalize_market_news_limit(value: Any, *, default: int) -> int:
    if value is None:
        return default
    try:
        limit = int(value)
    except (TypeError, ValueError) as exc:
        raise AssistantToolServiceError("limit must be a whole number.") from exc
    return max(1, min(limit, 10))


def _normalize_market_news_lookback_days(value: Any, *, default: int) -> int:
    if value is None:
        return default
    try:
        lookback_days = int(value)
    except (TypeError, ValueError) as exc:
        raise AssistantToolServiceError("lookback_days must be a whole number.") from exc
    return max(1, min(lookback_days, 14))


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


def _normalize_optional_trade_attention_candidate_type(value: Any) -> str | None:
    normalized = _optional_text(value)
    if normalized is None:
        return None
    candidate_type = normalized.lower().replace("-", "_")
    if candidate_type not in TRADE_ATTENTION_CANDIDATE_TYPE_NAMES:
        allowed = ", ".join(TRADE_ATTENTION_CANDIDATE_TYPE_NAMES)
        raise AssistantToolServiceError(f"candidate_type must be one of {allowed}.")
    return candidate_type


def _normalize_optional_int(value: Any, *, field_name: str) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise AssistantToolServiceError(f"{field_name} must be a whole number.") from exc


def _normalize_optional_positive_int(value: Any, *, field_name: str) -> int | None:
    normalized = _normalize_optional_int(value, field_name=field_name)
    if normalized is None:
        return None
    if normalized < 1:
        raise AssistantToolServiceError(f"{field_name} must be greater than zero.")
    return normalized


def _require_text(value: Any, *, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise AssistantToolServiceError(f"{field_name} is required.")
    return normalized


def _optional_text(value: Any) -> Optional[str]:
    normalized = str(value or "").strip()
    return normalized or None


def _truncate_text(value: str | None, max_length: int) -> str | None:
    normalized = _optional_text(value)
    if normalized is None:
        return None
    if len(normalized) <= max_length:
        return normalized
    if max_length <= 3:
        return normalized[:max_length]
    return f"{normalized[: max_length - 3].rstrip()}..."


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
        "priority_reason": value.priority_reason,
        "preview_summary": value.preview_summary,
        "blocking_reasons": list(value.blocking_reasons),
        "assumptions": list(value.assumptions),
        "recommended_action": value.recommended_action,
    }


def _dump_trade_attention_candidate(value: Any) -> dict[str, Any]:
    supporting_records = dict(value.supporting_records or {})
    supporting_records["open_workflow_items"] = [
        {
            **item,
            "due_at": _json_default(item.get("due_at")),
        }
        for item in supporting_records.get("open_workflow_items", [])
        if isinstance(item, dict)
    ]
    return {
        "trade_id": value.trade_id,
        "candidate_types": list(value.candidate_types),
        "source_count_keys": list(value.source_count_keys),
        "priority_reason": value.priority_reason,
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
        "confirmation_status": value.confirmation_status,
        "nomination_status": value.nomination_status,
        "allocation_status": value.allocation_status,
        "pricing_status": value.pricing_status,
        "invoice_status": value.invoice_status,
        "payment_status": value.payment_status,
        "settlement_status": value.settlement_status,
        "age_days": value.age_days,
        "supporting_records": supporting_records,
        "suggested_next_tool": value.suggested_next_tool,
        "next_steps": list(value.next_steps),
        "blocking_reasons": list(value.blocking_reasons),
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
