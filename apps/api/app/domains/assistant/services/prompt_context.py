from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.domains.assistant.services.registry import ManagedAssistantAgent
from apps.api.app.models.event import Event
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.position import Position
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_book import ReferenceBook
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
from apps.api.app.schemas.assistant import AssistantPromptContextRequest, AssistantPromptSectionSource


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
    key: str
    title: str
    source: AssistantPromptSectionSource
    content: str


@dataclass(frozen=True)
class AssistantPromptEnvelope:
    generated_at: datetime
    agent_id: str | None
    agent_name: str | None
    system_prompt: str
    sections: tuple[AssistantPromptSection, ...]
    warnings: tuple[str, ...] = ()


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
        _build_world_section(generated_at),
    ]

    if agent_definition is not None:
        sections.append(_build_agent_section(agent_definition))
    if payload.workspace is not None:
        sections.append(_build_workspace_section(payload.workspace))
    if payload.context:
        sections.append(
            AssistantPromptSection(
                key="application-context",
                title="Application Context",
                source="application",
                content=payload.context,
            )
        )

    rendered_prompt = render_prompt_sections(sections)
    return AssistantPromptEnvelope(
        generated_at=generated_at,
        agent_id=agent_definition.agent_id if agent_definition is not None else None,
        agent_name=agent_definition.name if agent_definition is not None else None,
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
    return AssistantPromptSection(
        key="system-mission",
        title="System Mission",
        source="system",
        content=settings.ASSISTANT_SYSTEM_PROMPT.strip(),
    )


def _build_organization_section() -> AssistantPromptSection:
    company_name = settings.ASSISTANT_COMPANY_NAME.strip() or "ECTRM"
    company_context = settings.ASSISTANT_COMPANY_CONTEXT.strip()
    return AssistantPromptSection(
        key="organization",
        title="Organization Context",
        source="organization",
        content=(
            f"Company name: {company_name}\n"
            f"{company_context}\n"
            "Primary user personas include trading, operations, risk, reference-data stewardship, "
            "and administrative support."
        ).strip(),
    )


def _build_user_section(user: AssistantPromptUser) -> AssistantPromptSection:
    expires_at = user.session_expires_at.isoformat() if user.session_expires_at is not None else "unknown"
    return AssistantPromptSection(
        key="user",
        title="Authenticated User",
        source="user",
        content=(
            f"user_id: {user.user_id}\n"
            f"display_name: {user.display_name}\n"
            f"email: {user.email}\n"
            f"role: {user.role}\n"
            f"session_id: {user.session_id or 'unknown'}\n"
            f"session_expires_at: {expires_at}\n"
            "Treat the role as workflow context, not as permission to invent approvals or completed actions."
        ),
    )


def _build_business_section() -> AssistantPromptSection:
    return AssistantPromptSection(
        key="business-model",
        title="Business Operating Model",
        source="business",
        content=(
            f"{settings.ASSISTANT_BUSINESS_CONTEXT.strip()}\n"
            "Key operator workflows: capture trades, amend or cancel trades through explicit events, "
            "review event timelines, monitor positions, maintain reference data, and oversee data loads."
        ).strip(),
    )


def _build_data_semantics_section() -> AssistantPromptSection:
    return AssistantPromptSection(
        key="data-semantics",
        title="Data Landscape",
        source="data",
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
    return AssistantPromptSection(
        key="data-inventory",
        title="Live Data Inventory",
        source="data",
        content=content,
    )


def _build_world_section(generated_at: datetime) -> AssistantPromptSection:
    return AssistantPromptSection(
        key="world-model",
        title="World And Time",
        source="world",
        content=(
            f"Current UTC timestamp: {generated_at.isoformat()}\n"
            "Live external facts are time-sensitive. Prefer the application context and loaded market or weather "
            "data over model memory.\n"
            "If the system does not contain a current external fact, say so clearly instead of guessing."
        ),
    )


def _build_agent_section(agent_definition: ManagedAssistantAgent) -> AssistantPromptSection:
    capabilities = ", ".join(agent_definition.capabilities)
    workspaces = ", ".join(agent_definition.allowed_workspaces)
    allowed_tools = ", ".join(agent_definition.allowed_tools) if agent_definition.allowed_tools else "all published read-only tools"
    return AssistantPromptSection(
        key="managed-agent",
        title="Managed Agent Profile",
        source="agent",
        content=(
            f"agent_id: {agent_definition.agent_id}\n"
            f"name: {agent_definition.name}\n"
            f"scope: {agent_definition.scope}\n"
            f"capabilities: {capabilities}\n"
            f"allowed_workspaces: {workspaces}\n"
            f"allowed_tools: {allowed_tools}\n"
            f"instructions:\n{agent_definition.system_prompt}"
        ),
    )


def _build_workspace_section(workspace: str) -> AssistantPromptSection:
    return AssistantPromptSection(
        key="workspace",
        title="Current Workspace",
        source="workspace",
        content=f"The current workspace is {workspace}. Tailor explanations and next steps to that surface.",
    )


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
    cancelled_trades = _safe_count_where(db, Trade, Trade.status == "CANCELLED")
    active_trades = None
    if total_trades is not None and cancelled_trades is not None:
        active_trades = total_trades - cancelled_trades

    trade_line = _format_counts(
        "Trades",
        total=total_trades,
        active=active_trades,
        cancelled=cancelled_trades,
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
