from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.domains.assistant.services.app_context_catalog import build_application_access_summary
from apps.api.app.domains.assistant.services.registry import ManagedAssistantAgent
from apps.api.app.models.event import Event
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.position import Position
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.roadmap_document import RoadmapDocument
from apps.api.app.models.trade import Trade
from apps.api.app.models.trading_source import TradingSource
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.weather_forecast_period import WeatherForecastPeriod
from apps.api.app.models.weather_location import WeatherLocation
from apps.api.app.models.weather_observation import WeatherObservation
from apps.api.app.schemas.assistant import (
    AssistantPromptContextRequest,
    AssistantPromptSectionFreshness,
    AssistantPromptSectionKind,
    AssistantPromptSectionMergeStrategy,
    AssistantPromptSectionScope,
    AssistantPromptSectionSource,
)


@dataclass(frozen=True)
class AssistantPromptUser:
    user_id: str
    display_name: str
    role: str
    email: str
    session_id: str | None
    session_expires_at: datetime | None


@dataclass(frozen=True)
class AssistantPromptSection:
    contract_key: str | None
    key: str
    title: str
    source: AssistantPromptSectionSource
    scope: AssistantPromptSectionScope
    kind: AssistantPromptSectionKind
    owner: str
    owner_reference: str | None
    freshness: AssistantPromptSectionFreshness
    merge_strategy: AssistantPromptSectionMergeStrategy
    contract_version: int
    uses_fallback: bool
    content: str


@dataclass(frozen=True)
class AssistantPromptEnvelope:
    generated_at: datetime
    agent_id: str | None
    agent_name: str | None
    agent_role_key: str | None
    agent_profile_kind: str | None
    system_prompt: str
    sections: tuple[AssistantPromptSection, ...]
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class AssistantPromptSectionContract:
    contract_key: str
    default_title: str
    source: AssistantPromptSectionSource
    scope: AssistantPromptSectionScope
    kind: AssistantPromptSectionKind
    owner: str
    freshness: AssistantPromptSectionFreshness
    merge_strategy: AssistantPromptSectionMergeStrategy = "APPEND"
    contract_version: int = 1


PROMPT_SECTION_CONTRACTS: dict[str, AssistantPromptSectionContract] = {
    "system-mission": AssistantPromptSectionContract(
        contract_key="system-mission",
        default_title="System Mission",
        source="system",
        scope="SYSTEM",
        kind="IMMUTABLE",
        owner="platform",
        freshness="STATIC",
    ),
    "organization": AssistantPromptSectionContract(
        contract_key="organization",
        default_title="Organization Context",
        source="organization",
        scope="GLOBAL",
        kind="CONFIGURABLE",
        owner="organization-config",
        freshness="STATIC",
    ),
    "user": AssistantPromptSectionContract(
        contract_key="user",
        default_title="Authenticated User",
        source="user",
        scope="USER",
        kind="GENERATED",
        owner="authenticated-user",
        freshness="SESSION",
    ),
    "business-model": AssistantPromptSectionContract(
        contract_key="business-model",
        default_title="Business Operating Model",
        source="business",
        scope="GLOBAL",
        kind="CONFIGURABLE",
        owner="organization-config",
        freshness="STATIC",
    ),
    "data-semantics": AssistantPromptSectionContract(
        contract_key="data-semantics",
        default_title="Data Landscape",
        source="data",
        scope="GLOBAL",
        kind="IMMUTABLE",
        owner="platform",
        freshness="STATIC",
    ),
    "data-inventory": AssistantPromptSectionContract(
        contract_key="data-inventory",
        default_title="Live Data Inventory",
        source="data",
        scope="RUNTIME",
        kind="GENERATED",
        owner="assistant-runtime",
        freshness="LIVE",
    ),
    "application-surface": AssistantPromptSectionContract(
        contract_key="application-surface",
        default_title="Application Access Surface",
        source="application",
        scope="GLOBAL",
        kind="GENERATED",
        owner="assistant-runtime",
        freshness="STATIC",
    ),
    "world-model": AssistantPromptSectionContract(
        contract_key="world-model",
        default_title="World And Time",
        source="world",
        scope="RUNTIME",
        kind="GENERATED",
        owner="assistant-runtime",
        freshness="REQUEST",
    ),
    "managed-agent": AssistantPromptSectionContract(
        contract_key="managed-agent",
        default_title="Managed Agent Profile",
        source="agent",
        scope="AGENT",
        kind="CONFIGURABLE",
        owner="managed-agent-profile",
        freshness="STATIC",
        merge_strategy="APPEND_IF_PRESENT",
    ),
    "workspace": AssistantPromptSectionContract(
        contract_key="workspace",
        default_title="Current Workspace",
        source="workspace",
        scope="REQUEST",
        kind="GENERATED",
        owner="request-payload",
        freshness="REQUEST",
        merge_strategy="APPEND_IF_PRESENT",
    ),
    "workspace-summary-focus": AssistantPromptSectionContract(
        contract_key="workspace-summary-focus",
        default_title="Requested Workspace Summary Focus",
        source="application",
        scope="REQUEST",
        kind="GENERATED",
        owner="request-payload",
        freshness="REQUEST",
        merge_strategy="APPEND_IF_PRESENT",
    ),
    "application-context": AssistantPromptSectionContract(
        contract_key="application-context",
        default_title="Application Context",
        source="application",
        scope="REQUEST",
        kind="GENERATED",
        owner="request-payload",
        freshness="REQUEST",
        merge_strategy="APPEND_IF_PRESENT",
    ),
    "approval-gated-action": AssistantPromptSectionContract(
        contract_key="approval-gated-action",
        default_title="Governed action candidate",
        source="agent",
        scope="REQUEST",
        kind="GENERATED",
        owner="assistant-action-runtime",
        freshness="REQUEST",
        merge_strategy="APPEND_IF_PRESENT",
    ),
    "tool-prefetch": AssistantPromptSectionContract(
        contract_key="tool-prefetch",
        default_title="Live Tool Prefetch",
        source="tool",
        scope="REQUEST",
        kind="GENERATED",
        owner="assistant-runtime",
        freshness="REQUEST",
        merge_strategy="APPEND_IF_PRESENT",
    ),
}


def resolve_prompt_section_contract(contract_key: str) -> AssistantPromptSectionContract:
    contract = PROMPT_SECTION_CONTRACTS.get(contract_key)
    if contract is None:
        raise RuntimeError(f"Unknown assistant prompt section contract '{contract_key}'")
    return contract


def build_prompt_section(
    *,
    contract_key: str,
    content: str,
    key: str | None = None,
    title: str | None = None,
    owner_reference: str | None = None,
    freshness: AssistantPromptSectionFreshness | None = None,
    merge_strategy: AssistantPromptSectionMergeStrategy | None = None,
    uses_fallback: bool = False,
) -> AssistantPromptSection:
    contract = resolve_prompt_section_contract(contract_key)
    return AssistantPromptSection(
        contract_key=contract.contract_key,
        key=key or contract.contract_key,
        title=title or contract.default_title,
        source=contract.source,
        scope=contract.scope,
        kind=contract.kind,
        owner=contract.owner,
        owner_reference=owner_reference,
        freshness=freshness or contract.freshness,
        merge_strategy=merge_strategy or contract.merge_strategy,
        contract_version=contract.contract_version,
        uses_fallback=uses_fallback,
        content=content,
    )


def build_prompt_context(
    *,
    payload: AssistantPromptContextRequest,
    user: AssistantPromptUser,
    db: Session,
    agent_definition: ManagedAssistantAgent | None = None,
) -> AssistantPromptEnvelope:
    generated_at = datetime.now(timezone.utc)
    sections = [
        _build_system_section(),
        _build_organization_section(),
        _build_user_section(user),
        _build_business_section(),
        _build_data_semantics_section(),
        _build_data_inventory_section(db),
        _build_application_surface_section(),
        _build_world_section(generated_at),
    ]

    if agent_definition is not None:
        sections.append(_build_agent_section(agent_definition))
    if payload.workspace is not None:
        sections.append(_build_workspace_section(payload.workspace))
    if payload.summary_targets:
        sections.append(_build_workspace_summary_focus_section(payload.summary_targets))
    if payload.context:
        sections.append(
            build_prompt_section(
                contract_key="application-context",
                content=payload.context,
            )
        )

    rendered_prompt = render_prompt_sections(sections)
    return AssistantPromptEnvelope(
        generated_at=generated_at,
        agent_id=agent_definition.agent_id if agent_definition is not None else None,
        agent_name=agent_definition.name if agent_definition is not None else None,
        agent_role_key=agent_definition.role_key if agent_definition is not None else None,
        agent_profile_kind=agent_definition.profile_kind if agent_definition is not None else None,
        system_prompt=rendered_prompt,
        sections=tuple(sections),
    )


def render_prompt_sections(sections: list[AssistantPromptSection] | tuple[AssistantPromptSection, ...]) -> str:
    return "\n\n".join(
        f"{section.title}:\n{section.content}"
        for section in sections
        if section.content.strip()
    )


def _build_system_section() -> AssistantPromptSection:
    system_prompt = settings.ASSISTANT_SYSTEM_PROMPT.strip()
    return build_prompt_section(
        contract_key="system-mission",
        content=system_prompt,
        uses_fallback=_uses_setting_default("ASSISTANT_SYSTEM_PROMPT", system_prompt),
    )


def _build_organization_section() -> AssistantPromptSection:
    company_name = settings.ASSISTANT_COMPANY_NAME.strip() or "ECTRM"
    company_context = settings.ASSISTANT_COMPANY_CONTEXT.strip()
    return build_prompt_section(
        contract_key="organization",
        content=(
            f"Company name: {company_name}\n"
            f"{company_context}\n"
            "Primary user personas include trading, operations, risk, reference-data stewardship, "
            "and administrative support."
        ).strip(),
        uses_fallback=(
            _uses_setting_default("ASSISTANT_COMPANY_NAME", company_name)
            or _uses_setting_default("ASSISTANT_COMPANY_CONTEXT", company_context)
        ),
    )


def _build_user_section(user: AssistantPromptUser) -> AssistantPromptSection:
    expires_at = user.session_expires_at.isoformat() if user.session_expires_at is not None else "unknown"
    return build_prompt_section(
        contract_key="user",
        content=(
            f"user_id: {user.user_id}\n"
            f"display_name: {user.display_name}\n"
            f"email: {user.email}\n"
            f"role: {user.role}\n"
            f"session_id: {user.session_id or 'unknown'}\n"
            f"session_expires_at: {expires_at}\n"
            "Treat the role as workflow context, not as permission to invent approvals or completed actions."
        ),
        owner_reference=user.user_id,
    )


def _build_business_section() -> AssistantPromptSection:
    business_context = settings.ASSISTANT_BUSINESS_CONTEXT.strip()
    return build_prompt_section(
        contract_key="business-model",
        content=(
            f"{business_context}\n"
            "Key operator workflows: capture trades, amend or cancel trades through explicit events, "
            "review event timelines, monitor positions, maintain reference data, and oversee data loads."
        ).strip(),
        uses_fallback=_uses_setting_default("ASSISTANT_BUSINESS_CONTEXT", business_context),
    )


def _build_data_semantics_section() -> AssistantPromptSection:
    return build_prompt_section(
        contract_key="data-semantics",
        content=(
            "Reference or master data defines governed lists such as books, commodities, price indices, "
            "currencies, units, locations, counterparties, and portfolios.\n"
            "Transactional data is the event stream that records what happened, when, and who triggered it.\n"
            "Projection data is the derived current-state view, mainly trades and positions.\n"
            "External world data includes EIA price observations and NWS weather data when loaded.\n"
            "Governance data includes users, trading-source inventory, roadmap documents, and external-data run history."
        ),
    )


def _build_data_inventory_section(db: Session) -> AssistantPromptSection:
    # Keep this runtime inventory structure aligned with the maintained
    # reference snapshot in docs/engineering/ai-workflow.md.
    reference_lines = _render_reference_inventory(db)
    transaction_lines = _render_transaction_inventory(db)
    external_lines = _render_external_inventory(db)
    governance_lines = _render_governance_inventory(db)

    content = "\n".join(
        [
            "Reference and master data:",
            *reference_lines,
            "Transactional and projection data:",
            *transaction_lines,
            "External and world data:",
            *external_lines,
            "Governance and knowledge data:",
            *governance_lines,
        ]
    )
    return build_prompt_section(
        contract_key="data-inventory",
        content=content,
    )


def _build_world_section(generated_at: datetime) -> AssistantPromptSection:
    return build_prompt_section(
        contract_key="world-model",
        content=(
            f"Current UTC timestamp: {generated_at.isoformat()}\n"
            "Live external facts are time-sensitive. Prefer the application context and loaded market or weather "
            "data over model memory.\n"
            "If the system does not contain a current external fact, say so clearly instead of guessing."
        ),
        freshness="REQUEST",
    )


def _build_application_surface_section() -> AssistantPromptSection:
    return build_prompt_section(
        contract_key="application-surface",
        content=build_application_access_summary(),
    )


def _build_agent_section(agent_definition: ManagedAssistantAgent) -> AssistantPromptSection:
    capabilities = ", ".join(agent_definition.capabilities)
    skills = ", ".join(agent_definition.skills) if agent_definition.skills else "none"
    workspaces = ", ".join(agent_definition.allowed_workspaces)
    allowed_tools = ", ".join(agent_definition.allowed_tools) if agent_definition.allowed_tools else "all published read-only tools"
    allowed_actions = (
        ", ".join(agent_definition.allowed_action_types)
        if agent_definition.allowed_action_types
        else "none"
    )
    profile_lines = [
        f"agent_id: {agent_definition.agent_id}",
        f"name: {agent_definition.name}",
        f"scope: {agent_definition.scope}",
        f"profile_kind: {agent_definition.profile_kind}",
    ]
    if agent_definition.role_key:
        profile_lines.append(f"role_key: {agent_definition.role_key}")
    if agent_definition.human_owner_role:
        profile_lines.append(f"human_owner_role: {agent_definition.human_owner_role}")
    if agent_definition.authority_ceiling:
        profile_lines.append(f"authority_ceiling: {agent_definition.authority_ceiling}")
    profile_lines.append(f"orchestration_pattern: {agent_definition.orchestration_pattern}")
    if agent_definition.parent_agent_id:
        profile_lines.append(f"parent_agent_id: {agent_definition.parent_agent_id}")
    if agent_definition.managed_agent_ids:
        profile_lines.append(f"managed_agent_ids: {', '.join(agent_definition.managed_agent_ids)}")
    if agent_definition.specialization_summary:
        profile_lines.append(f"specialization_summary: {agent_definition.specialization_summary}")
    if agent_definition.activation_notes:
        profile_lines.append(f"activation_notes: {agent_definition.activation_notes}")
    if agent_definition.delegation_guidance:
        profile_lines.append(f"delegation_guidance: {agent_definition.delegation_guidance}")
    profile_lines.extend(
        [
            "build_recipe: role + skills + capabilities + workspaces + live tools + governed actions + system prompt",
            f"capabilities: {capabilities}",
            f"skills: {skills}",
            f"allowed_workspaces: {workspaces}",
            f"allowed_tools: {allowed_tools}",
            f"allowed_actions: {allowed_actions}",
            f"instructions:\n{agent_definition.system_prompt}",
        ]
    )
    return build_prompt_section(
        contract_key="managed-agent",
        content="\n".join(profile_lines),
        owner_reference=agent_definition.agent_id,
    )


def _build_workspace_section(workspace: str) -> AssistantPromptSection:
    return build_prompt_section(
        contract_key="workspace",
        content=f"The current workspace is {workspace}. Tailor explanations and next steps to that surface.",
        owner_reference=workspace,
    )


def _build_workspace_summary_focus_section(summary_targets: list[str]) -> AssistantPromptSection:
    lines = [
        "The current request is explicitly anchored to these workspace summary counts:",
        *[f"- {target}" for target in summary_targets],
        "Prefer the matching candidate reads before inferring missing ledger rows from those summary counts.",
    ]
    return build_prompt_section(
        contract_key="workspace-summary-focus",
        content="\n".join(lines),
    )


def _uses_setting_default(field_name: str, value: str) -> bool:
    default_value = type(settings).model_fields[field_name].default
    if not isinstance(default_value, str):
        return False
    return value.strip() == default_value.strip()


def _render_reference_inventory(db: Session) -> list[str]:
    return [
        _format_active_total("Books", _safe_count_active(db, ReferenceBook), _safe_count(db, ReferenceBook)),
        _format_active_total(
            "Commodities",
            _safe_count_active(db, ReferenceCommodity),
            _safe_count(db, ReferenceCommodity),
        ),
        _format_active_total(
            "Counterparties",
            _safe_count_active(db, ReferenceCounterparty),
            _safe_count(db, ReferenceCounterparty),
        ),
        _format_active_total("Calendars", _safe_count_active(db, ReferenceCalendar), _safe_count(db, ReferenceCalendar)),
        _format_active_total(
            "Portfolios",
            _safe_count_active(db, ReferencePortfolio),
            _safe_count(db, ReferencePortfolio),
        ),
        _format_active_total(
            "Price indices",
            _safe_count_active(db, ReferencePriceIndex),
            _safe_count(db, ReferencePriceIndex),
        ),
        _format_active_total("Currencies", _safe_count_active(db, ReferenceCurrency), _safe_count(db, ReferenceCurrency)),
        _format_active_total("Units", _safe_count_active(db, ReferenceUnit), _safe_count(db, ReferenceUnit)),
        _format_active_total("Locations", _safe_count_active(db, ReferenceLocation), _safe_count(db, ReferenceLocation)),
    ]


def _render_transaction_inventory(db: Session) -> list[str]:
    total_trades = _safe_count(db, Trade)
    active_trades = _safe_count_where(db, Trade, Trade.status == "ACTIVE")

    trade_line = _format_counts(
        "Trades",
        total=total_trades,
        active=active_trades,
        cancelled=None,
    )
    return [
        _format_simple_count("Events", _safe_count(db, Event)),
        trade_line,
        _format_simple_count("Positions", _safe_count(db, Position)),
    ]


def _render_external_inventory(db: Session) -> list[str]:
    return [
        _format_simple_count("Price observations", _safe_count(db, PriceIndexObservation)),
        _format_simple_count("External data runs", _safe_count(db, ExternalDataRun)),
        _format_simple_count("Weather locations", _safe_count(db, WeatherLocation)),
        _format_simple_count("Weather observations", _safe_count(db, WeatherObservation)),
        _format_simple_count("Weather forecast periods", _safe_count(db, WeatherForecastPeriod)),
    ]


def _render_governance_inventory(db: Session) -> list[str]:
    return [
        _format_active_total("Users", _safe_count_active(db, UserAccount), _safe_count(db, UserAccount)),
        _format_simple_count("Trading sources", _safe_count(db, TradingSource)),
        _format_simple_count("Roadmap documents", _safe_count(db, RoadmapDocument)),
    ]


def _safe_count(db: Session, model: type[object]) -> int | None:
    try:
        return db.execute(select(func.count()).select_from(model)).scalar_one()
    except SQLAlchemyError:
        return None


def _safe_count_active(db: Session, model: type[object]) -> int | None:
    try:
        return db.execute(
            select(func.count()).select_from(model).where(getattr(model, "is_active").is_(True))
        ).scalar_one()
    except (AttributeError, SQLAlchemyError):
        return None


def _safe_count_where(db: Session, model: type[object], condition) -> int | None:
    try:
        return db.execute(select(func.count()).select_from(model).where(condition)).scalar_one()
    except SQLAlchemyError:
        return None


def _format_simple_count(label: str, value: int | None) -> str:
    if value is None:
        return f"- {label}: unavailable"
    return f"- {label}: {value}"


def _format_active_total(label: str, active: int | None, total: int | None) -> str:
    if active is None and total is None:
        return f"- {label}: unavailable"
    if active is None:
        return f"- {label}: {total} total"
    if total is None:
        return f"- {label}: {active} active"
    return f"- {label}: {active} active / {total} total"


def _format_counts(
    label: str,
    *,
    total: int | None,
    active: int | None,
    cancelled: int | None,
) -> str:
    parts: list[str] = []
    if total is not None:
        parts.append(f"{total} total")
    if active is not None:
        parts.append(f"{active} active")
    if cancelled is not None:
        parts.append(f"{cancelled} cancelled")
    if not parts:
        return f"- {label}: unavailable"
    return f"- {label}: {' / '.join(parts)}"
