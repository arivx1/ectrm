from __future__ import annotations

from dataclasses import dataclass
from typing import get_args

from apps.api.app.domains.assistant.services.tools import list_tool_names
from apps.api.app.schemas.assistant import (
    ALL_ASSISTANT_ACTION_TYPES,
    AssistantAgentAuthorityLevel,
    AssistantAgentCapability,
    AssistantAgentEvalGateOut,
    AssistantAgentRoleArchetypeOut,
    AssistantAgentRoleCatalogStatus,
    AssistantWorkspace,
)


class AssistantAgentRoleRegistryError(ValueError):
    pass


@dataclass(frozen=True)
class AssistantAgentRoleArchetype:
    role_key: str
    name: str
    description: str
    catalog_status: AssistantAgentRoleCatalogStatus
    mission: tuple[str, ...]
    human_owner_role: str
    allowed_workspaces: tuple[AssistantWorkspace, ...]
    work_objects: tuple[str, ...]
    capability_ceiling: tuple[AssistantAgentCapability, ...]
    default_tools: tuple[str, ...]
    maximum_action_types: tuple[str, ...]
    authority_ceiling: AssistantAgentAuthorityLevel
    approval_rules: tuple[str, ...]
    stop_conditions: tuple[str, ...]
    success_metrics: tuple[str, ...]
    required_eval_coverage: tuple[str, ...]
    base_prompt_guidance: tuple[str, ...]
    current_profile_ids: tuple[str, ...] = ()


ROLE_ARCHETYPE_DEFINITIONS: tuple[AssistantAgentRoleArchetype, ...] = (
    AssistantAgentRoleArchetype(
        role_key="trade-ops-copilot",
        name="Trade Ops Copilot",
        description="Coordinates confirmation, workflow, delivery, and document follow-through for booked trades.",
        catalog_status="SEEDED",
        mission=(
            "Keep booked trades moving through confirmation, workflow, delivery, and document follow-through.",
            "Stage the smallest justified operational action when live evidence is clear.",
        ),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "trades", "operations", "shipments", "scheduling", "reference"),
        work_objects=("trade", "workflow item", "confirmation", "delivery obligation", "document ingestion"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        default_tools=(
            "get_trade_workbench",
            "list_workflow_items",
            "list_trade_confirmations",
            "list_deliveries",
            "list_documents",
            "get_document_ingestion",
        ),
        maximum_action_types=(
            "issue_trade_confirmation",
            "record_trade_confirmation_response",
            "update_trade_workflow_item",
            "reprocess_document_ingestion",
        ),
        authority_ceiling="STAGE",
        approval_rules=("Operations Lead or owning workflow lead reviews staged operational actions.",),
        stop_conditions=(
            "Trade identity, workflow item, delivery, confirmation, or document evidence is ambiguous.",
            "The requested change would externally commit the firm outside the approved action gateway.",
        ),
        success_metrics=(
            "Higher approval hit rate for staged operational actions.",
            "Reduced overdue workflow items and confirmation follow-up time.",
        ),
        required_eval_coverage=(
            "Allowed operational action staging.",
            "Denied unsupported trade, settlement, and policy actions.",
            "Tool allowlist enforcement.",
        ),
        base_prompt_guidance=(
            "Lead with the blocker or next action.",
            "Show evidence and remaining human checks before staging an action.",
        ),
        current_profile_ids=("trade-ops-copilot",),
    ),
    AssistantAgentRoleArchetype(
        role_key="settlement-copilot",
        name="Settlement Copilot",
        description="Pairs settlement analysis with approval-gated invoice and payment staging.",
        catalog_status="SEEDED",
        mission=(
            "Explain invoice, payment, aging, and settlement exception posture.",
            "Stage invoice or payment actions only when settlement evidence supports them.",
        ),
        human_owner_role="Settlement Lead",
        allowed_workspaces=("assistant", "settlement", "operations", "reports"),
        work_objects=("invoice", "payment", "settlement exception", "workflow item", "trade"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        default_tools=(
            "list_trade_invoices",
            "list_trade_payments",
            "get_trade_settlement_summary",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=("issue_trade_invoice", "create_trade_payment"),
        authority_ceiling="STAGE",
        approval_rules=("Settlement Lead reviews staged invoice and payment actions.",),
        stop_conditions=(
            "Amount, currency, timing, invoice linkage, payment evidence, or trade linkage is unclear.",
            "The request would release cash or send external payment instructions.",
        ),
        success_metrics=(
            "Fewer overdue settlement exceptions.",
            "Lower finance review time per invoice or payment exception.",
        ),
        required_eval_coverage=(
            "Invoice and payment action staging.",
            "Denied cash-release or ambiguous settlement requests.",
            "Settlement tool allowlist enforcement.",
        ),
        base_prompt_guidance=(
            "Start with cash status, then evidence and next step.",
            "Surface missing settlement evidence directly.",
        ),
        current_profile_ids=("settlement-copilot",),
    ),
    AssistantAgentRoleArchetype(
        role_key="trade-governor",
        name="Trade Governor",
        description="Reviews high-sensitivity cancellation requests with a constrained cancel-only action scope.",
        catalog_status="SEEDED",
        mission=(
            "Assess whether a trade cancellation request is supported by the current record.",
            "Stage cancellation only when evidence is clear and audit context is complete.",
        ),
        human_owner_role="Trader, Desk Lead, or Admin",
        allowed_workspaces=("assistant", "trades", "operations", "admin"),
        work_objects=("trade", "event", "workflow item", "approval request"),
        capability_ceiling=("READ", "EXPLAIN", "ACTION"),
        default_tools=("get_trade_by_id", "list_trade_events", "get_trade_workbench", "list_workflow_items"),
        maximum_action_types=("cancel_trade",),
        authority_ceiling="STAGE",
        approval_rules=("Trader, Desk Lead, or Admin reviews staged cancel-trade actions.",),
        stop_conditions=(
            "Trade identity, current status, business reason, or lifecycle evidence is uncertain.",
            "The request is better handled as an amendment, workflow update, or human investigation.",
        ),
        success_metrics=(
            "Cancellation requests are more complete and easier to audit.",
            "Stale or unsafe cancellation attempts fail safely.",
        ),
        required_eval_coverage=(
            "Allowed cancel-trade staging.",
            "Denied non-cancel actions.",
            "Denied stale, closed, or cross-user cancellation requests.",
        ),
        base_prompt_guidance=(
            "Lead with whether cancellation appears justified.",
            "Summarize supporting and conflicting evidence before staging.",
        ),
        current_profile_ids=("trade-governor",),
    ),
    AssistantAgentRoleArchetype(
        role_key="trade-explainer",
        name="Trade Explainer",
        description="Explains selected trade state, recent events, and exposure in desk language.",
        catalog_status="TEMPLATE",
        mission=("Explain current trade state, what changed, and downstream exposure impact.",),
        human_owner_role="Trader",
        allowed_workspaces=("assistant", "trades", "events", "risk", "positions"),
        work_objects=("trade", "event", "position", "option exposure"),
        capability_ceiling=("READ", "EXPLAIN"),
        default_tools=(
            "get_trade_by_id",
            "list_trade_events",
            "get_trade_workbench",
            "list_positions",
            "get_market_context",
            "search_reference_data",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="EXPLAIN",
        approval_rules=("No mutation authority. Human trader owns any follow-up action.",),
        stop_conditions=("Trade identity or event history is missing, stale, or contradictory.",),
        success_metrics=("Trade explanations reduce manual investigation time.",),
        required_eval_coverage=("Grounded trade explanation.", "No action staging."),
        base_prompt_guidance=("Separate confirmed facts, interpretation, and next steps.",),
        current_profile_ids=("trade-explainer",),
    ),
    AssistantAgentRoleArchetype(
        role_key="ops-coordinator",
        name="Ops Coordinator",
        description="Summarizes downstream blockers across delivery, confirmation, scheduling, and settlement.",
        catalog_status="TEMPLATE",
        mission=("Help operators understand what is blocked, who needs to act, and what should happen next.",),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "shipments", "scheduling", "operations", "settlement"),
        work_objects=("workflow item", "delivery obligation", "confirmation", "invoice", "payment"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=(
            "list_workflow_items",
            "list_deliveries",
            "list_trade_confirmations",
            "get_trade_workbench",
            "get_trade_settlement_summary",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No mutation authority. Operations Lead owns follow-up decisions.",),
        stop_conditions=("Workflow ownership, timing, or evidence is unclear.",),
        success_metrics=("Operational blocker summaries reduce standup and handoff time.",),
        required_eval_coverage=("Operational blocker summary.", "No action staging."),
        base_prompt_guidance=("Organize responses around blockers, owners, timing, and next actions.",),
        current_profile_ids=("ops-coordinator",),
    ),
    AssistantAgentRoleArchetype(
        role_key="settlement-analyst",
        name="Settlement Analyst",
        description="Interprets invoices, payments, aging, exceptions, and cash follow-up.",
        catalog_status="TEMPLATE",
        mission=("Explain settlement posture with clear financial and operational implications.",),
        human_owner_role="Settlement Lead",
        allowed_workspaces=("assistant", "settlement", "operations", "reports"),
        work_objects=("invoice", "payment", "settlement exception", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=(
            "list_trade_invoices",
            "list_trade_payments",
            "get_trade_settlement_summary",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No mutation authority. Settlement Lead owns cash follow-up decisions.",),
        stop_conditions=("Invoice, payment, dispute, or trade linkage evidence is missing.",),
        success_metrics=("Settlement briefings reduce exception review effort.",),
        required_eval_coverage=("Settlement explanation.", "No invoice or payment staging."),
        base_prompt_guidance=("Lead with current cash status, then underlying evidence.",),
        current_profile_ids=("settlement-analyst",),
    ),
    AssistantAgentRoleArchetype(
        role_key="document-triage",
        name="Document Triage",
        description="Reviews ingested documents, linkage evidence, routing confidence, and follow-up checks.",
        catalog_status="TEMPLATE",
        mission=("Translate document ingestion and linkage signals into clear review guidance.",),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "operations", "reference"),
        work_objects=("document ingestion", "document action plan", "record link", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=(
            "list_documents",
            "get_document_ingestion",
            "search_reference_data",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No mutation authority. Owning workflow lead decides linkage or reprocessing.",),
        stop_conditions=("Document identifiers, linkage evidence, or routing confidence conflicts.",),
        success_metrics=("Fewer documents sit in unclear review states.",),
        required_eval_coverage=("Document triage explanation.", "No document action staging."),
        base_prompt_guidance=("State likely document role, strongest evidence, and remaining uncertainty.",),
        current_profile_ids=("document-triage",),
    ),
    AssistantAgentRoleArchetype(
        role_key="desk-briefing",
        name="Desk Briefing",
        description="Produces desk-ready briefings across exposure, workflow pressure, and market context.",
        catalog_status="TEMPLATE",
        mission=("Create concise, grounded desk briefings that orient operators quickly.",),
        human_owner_role="Desk Lead",
        allowed_workspaces=("assistant", "dashboard", "risk", "positions", "reports"),
        work_objects=("report", "position", "trade", "workflow item", "market context"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=(
            "get_workspace_summary",
            "list_positions",
            "list_trades",
            "get_market_context",
            "list_workflow_items",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No mutation authority. Desk Lead owns official publication or follow-up.",),
        stop_conditions=("Market, exposure, or workflow data is stale, partial, or unavailable.",),
        success_metrics=("Desk briefings are useful enough for standup or shift handoff review.",),
        required_eval_coverage=("Sourced desk briefing.", "No action staging."),
        base_prompt_guidance=("Lead with the headline, then cover risk, workflow, and market context.",),
        current_profile_ids=("desk-briefing",),
    ),
    AssistantAgentRoleArchetype(
        role_key="market-research-agent",
        name="Market Research Agent",
        description="Monitors market, weather, logistics, macro, positioning, and source freshness signals.",
        catalog_status="PHASE_1",
        mission=(
            "Turn loaded market, weather, source freshness, and position context into opportunity and risk briefings.",
        ),
        human_owner_role="Desk Lead",
        allowed_workspaces=("assistant", "dashboard", "risk", "positions", "reports"),
        work_objects=("market opportunity", "desk briefing", "pre-trade scenario", "position"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=("get_market_context", "list_positions", "list_trades", "get_workspace_summary"),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("No trade creation, external communication, or commitment authority.",),
        stop_conditions=("Loaded market or weather data is stale, unavailable, or insufficiently sourced.",),
        success_metrics=("Humans promote useful generated opportunities into reviewable scenarios.",),
        required_eval_coverage=("Sourced market briefing.", "No trade capture or external-commitment claims."),
        base_prompt_guidance=("Cite loaded platform data and clearly mark missing external facts.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="pre-trade-structuring-agent",
        name="Pre-Trade Structuring Agent",
        description="Converts market context and internal constraints into review-ready trade ideas.",
        catalog_status="PHASE_1",
        mission=("Convert researched opportunities into reviewable trade structures and assumptions.",),
        human_owner_role="Trader",
        allowed_workspaces=("assistant", "trades", "risk", "positions", "reports", "reference"),
        work_objects=("pre-trade scenario", "pre-trade review item", "trade intent", "reference data"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=(
            "get_market_context",
            "search_reference_data",
            "list_positions",
            "list_trades",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Trader owns review decisions and any trade capture.",),
        stop_conditions=("Credit, reference data, pricing, quantity, or counterparty assumptions are incomplete.",),
        success_metrics=("Generated structures reduce re-entry and ambiguity in trade capture handoffs.",),
        required_eval_coverage=("Review-ready scenario draft.", "Denied direct trade booking."),
        base_prompt_guidance=("Separate proposed structure, assumptions, constraints, and required human review.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="risk-sentinel",
        name="Risk Sentinel",
        description="Watches exposure, pricing gaps, credit freshness, option exposure, and stale assumptions.",
        catalog_status="PHASE_1",
        mission=("Surface risk exceptions and stale assumptions before they become operational surprises.",),
        human_owner_role="Risk or Credit Owner",
        allowed_workspaces=("assistant", "risk", "positions", "trades", "reports"),
        work_objects=("risk exception", "workflow item", "approval request", "position", "trade"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=("list_positions", "list_trades", "get_market_context", "get_workspace_summary"),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Risk or Credit Owner owns exception decisions and credit approvals.",),
        stop_conditions=("Exposure, price, credit, or position evidence is stale or contradictory.",),
        success_metrics=("Risk alerts are timely, grounded, and low-noise.",),
        required_eval_coverage=("Risk exception explanation.", "No credit approval or trade mutation."),
        base_prompt_guidance=("Make stale data and confidence limits visible.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="document-agent",
        name="Document Agent",
        description="Classifies, matches, routes, and stages follow-up for trade, logistics, and settlement documents.",
        catalog_status="PHASE_1",
        mission=("Make document-heavy workflows faster by explaining ambiguity and staging safe reprocessing.",),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "operations", "reference"),
        work_objects=("document ingestion", "document action plan", "record link", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        default_tools=(
            "list_documents",
            "get_document_ingestion",
            "search_reference_data",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        maximum_action_types=("reprocess_document_ingestion",),
        authority_ceiling="STAGE",
        approval_rules=("Operations Lead or Admin reviews staged document reprocessing actions.",),
        stop_conditions=("Document linkage, extracted fields, or routing evidence is ambiguous.",),
        success_metrics=("More documents reach confident linkage or explicit manual-review state.",),
        required_eval_coverage=(
            "Document ambiguity explanation.",
            "Allowed reprocess staging.",
            "Denied record creation.",
        ),
        base_prompt_guidance=("Explain confidence, missing keys, and unresolved ambiguity plainly.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="reporting-reconciliation-agent",
        name="Reporting and Reconciliation Agent",
        description="Produces desk packs, exception packs, reconciliation summaries, and outcome reports.",
        catalog_status="PHASE_1",
        mission=("Draft sourced reports and exception summaries from governed platform data.",),
        human_owner_role="Desk Lead or Settlement Lead",
        allowed_workspaces=("assistant", "reports", "operations", "settlement", "risk", "positions"),
        work_objects=("report", "settlement exception", "risk exception", "agent outcome"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=(
            "get_workspace_summary",
            "list_positions",
            "list_trade_invoices",
            "list_trade_payments",
            "get_market_context",
            "list_workflow_items",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Owning desk or settlement lead approves official publication.",),
        stop_conditions=("Required source data is stale, incomplete, or not loaded.",),
        success_metrics=("Reports reduce manual reconciliation and exception-pack preparation time.",),
        required_eval_coverage=("Sourced report draft.", "No official publication or mutation."),
        base_prompt_guidance=("Label source data, assumptions, and unresolved gaps.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="logistics-coordinator",
        name="Logistics Coordinator",
        description="Manages delivery readiness, scheduling detail, logistics blockers, and actualization evidence.",
        catalog_status="PHASE_2_PLUS",
        mission=("Coordinate logistics blockers and readiness without creating external scheduling commitments.",),
        human_owner_role="Operations Lead",
        allowed_workspaces=("assistant", "shipments", "scheduling", "operations"),
        work_objects=("delivery obligation", "scheduling commitment", "delivery event", "workflow item"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=("list_deliveries", "list_workflow_items", "get_trade_workbench", "get_workspace_summary"),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Operations Lead owns scheduling and actualization decisions.",),
        stop_conditions=("Any requested step would create an external logistics commitment.",),
        success_metrics=("Delivery blockers and readiness gaps are clearer to operations users.",),
        required_eval_coverage=("Logistics blocker explanation.", "No scheduling commitment."),
        base_prompt_guidance=("Separate internal readiness from external commitment.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="fee-accrual-agent",
        name="Fee and Accrual Agent",
        description="Identifies fees, delivered-but-unbilled exposure, accrual lots, and reconciliation gaps.",
        catalog_status="PHASE_2_PLUS",
        mission=("Draft fee and accrual analysis once the accrual domain is mature enough to govern.",),
        human_owner_role="Settlement Lead or Controller",
        allowed_workspaces=("assistant", "settlement", "reports", "operations"),
        work_objects=("fee item", "accrual lot", "invoice", "delivery actualization"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=(
            "get_trade_settlement_summary",
            "list_trade_invoices",
            "list_trade_payments",
            "get_workspace_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Settlement Lead or Controller owns accrual recognition decisions.",),
        stop_conditions=("Accrual policy, invoice linkage, or delivery actualization evidence is incomplete.",),
        success_metrics=("Accrual gap drafts reduce reconciliation preparation time.",),
        required_eval_coverage=("Accrual gap explanation.", "No accrual mutation."),
        base_prompt_guidance=("Keep accrual conclusions clearly draft-only.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="counterparty-outreach-agent",
        name="Counterparty Outreach Agent",
        description="Drafts and tracks bilateral counterparty communications.",
        catalog_status="PHASE_2_PLUS",
        mission=("Draft counterparty outreach without sending or binding external communications.",),
        human_owner_role="Trader, Operations Lead, or Settlement Lead",
        allowed_workspaces=("assistant", "operations", "settlement", "trades"),
        work_objects=("communication draft", "confirmation", "workflow item", "settlement exception"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=(
            "get_trade_workbench",
            "list_workflow_items",
            "list_trade_confirmations",
            "get_trade_settlement_summary",
        ),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Owning business user sends or approves external communication.",),
        stop_conditions=("The requested response would externally commit the firm or settle a dispute.",),
        success_metrics=("Draft outreach reduces manual communication preparation time.",),
        required_eval_coverage=("Counterparty draft generation.", "No external send or commitment."),
        base_prompt_guidance=("Draft communications as review-ready text, not sent messages.",),
    ),
    AssistantAgentRoleArchetype(
        role_key="control-tower-agent",
        name="Control Tower Agent",
        description="Monitors other agents, stale runs, blocked approvals, and intervention needs.",
        catalog_status="PHASE_2_PLUS",
        mission=("Summarize agent health, blocked approvals, and intervention recommendations.",),
        human_owner_role="Admin or Platform Owner",
        allowed_workspaces=("assistant", "admin"),
        work_objects=("agent run", "action request", "intervention record", "agent outcome"),
        capability_ceiling=("READ", "EXPLAIN", "DRAFT"),
        default_tools=("get_workspace_summary",),
        maximum_action_types=(),
        authority_ceiling="DRAFT",
        approval_rules=("Admin or Platform Owner owns pause, retirement, and configuration changes.",),
        stop_conditions=("Requested change would mutate agent configuration, policy, or permissions.",),
        success_metrics=("Supervisors can identify noisy, stale, or risky agents faster.",),
        required_eval_coverage=("Agent outcome summary.", "No policy or configuration mutation."),
        base_prompt_guidance=("Recommend interventions, but do not perform them.",),
    ),
)


def list_role_archetypes() -> list[AssistantAgentRoleArchetype]:
    return list(ROLE_ARCHETYPE_DEFINITIONS)


def get_role_archetype(role_key: str) -> AssistantAgentRoleArchetype | None:
    normalized_role_key = role_key.strip().lower()
    for role in ROLE_ARCHETYPE_DEFINITIONS:
        if role.role_key == normalized_role_key:
            return role
    return None


def to_role_archetype_out(
    role: AssistantAgentRoleArchetype,
    *,
    eval_gate: AssistantAgentEvalGateOut | None = None,
) -> AssistantAgentRoleArchetypeOut:
    return AssistantAgentRoleArchetypeOut(
        role_key=role.role_key,
        name=role.name,
        description=role.description,
        catalog_status=role.catalog_status,
        mission=list(role.mission),
        human_owner_role=role.human_owner_role,
        allowed_workspaces=list(role.allowed_workspaces),
        work_objects=list(role.work_objects),
        capability_ceiling=list(role.capability_ceiling),
        default_tools=list(role.default_tools),
        maximum_action_types=list(role.maximum_action_types),
        authority_ceiling=role.authority_ceiling,
        approval_rules=list(role.approval_rules),
        stop_conditions=list(role.stop_conditions),
        success_metrics=list(role.success_metrics),
        required_eval_coverage=list(role.required_eval_coverage),
        eval_gate=eval_gate,
        base_prompt_guidance=list(role.base_prompt_guidance),
        current_profile_ids=list(role.current_profile_ids),
    )


def validate_role_archetype_registry() -> None:
    errors: list[str] = []
    role_keys = [role.role_key for role in ROLE_ARCHETYPE_DEFINITIONS]
    if len(role_keys) != len(set(role_keys)):
        errors.append("role_key values must be unique")

    profile_ids = [
        profile_id
        for role in ROLE_ARCHETYPE_DEFINITIONS
        for profile_id in role.current_profile_ids
    ]
    if len(profile_ids) != len(set(profile_ids)):
        errors.append("current_profile_ids must map to only one role archetype")

    workspace_values = set(get_args(AssistantWorkspace))
    capability_values = set(get_args(AssistantAgentCapability))
    tool_values = set(list_tool_names())
    action_values = set(ALL_ASSISTANT_ACTION_TYPES)

    for role in ROLE_ARCHETYPE_DEFINITIONS:
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="allowed_workspaces",
            values=role.allowed_workspaces,
            valid_values=workspace_values,
        )
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="capability_ceiling",
            values=role.capability_ceiling,
            valid_values=capability_values,
        )
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="default_tools",
            values=role.default_tools,
            valid_values=tool_values,
        )
        _append_unknown_values(
            errors,
            role_key=role.role_key,
            field_name="maximum_action_types",
            values=role.maximum_action_types,
            valid_values=action_values,
        )
        if role.maximum_action_types and "ACTION" not in role.capability_ceiling:
            errors.append(f"{role.role_key}: maximum_action_types require ACTION in capability_ceiling")
        if role.authority_ceiling == "STAGE" and "ACTION" not in role.capability_ceiling:
            errors.append(f"{role.role_key}: STAGE authority requires ACTION in capability_ceiling")
        if not role.mission:
            errors.append(f"{role.role_key}: mission is required")
        if not role.human_owner_role.strip():
            errors.append(f"{role.role_key}: human_owner_role is required")
        if not role.stop_conditions:
            errors.append(f"{role.role_key}: stop_conditions are required")
        if not role.required_eval_coverage:
            errors.append(f"{role.role_key}: required_eval_coverage is required")
        errors.extend(_role_action_eval_errors(role))

    if errors:
        raise AssistantAgentRoleRegistryError("; ".join(errors))


def _role_action_eval_errors(role: AssistantAgentRoleArchetype) -> list[str]:
    if not role.maximum_action_types and "ACTION" not in set(role.capability_ceiling):
        return []

    coverage_text = " ".join(role.required_eval_coverage).lower()
    errors: list[str] = []
    if not any(keyword in coverage_text for keyword in ("allowed", "staging", "stage")):
        errors.append(f"{role.role_key}: action-capable roles need an allowed action behavior eval case")
    if not any(keyword in coverage_text for keyword in ("denied", "stale", "ambiguous", "unsupported", "no ")):
        errors.append(f"{role.role_key}: action-capable roles need a denied or stale action behavior eval case")
    return errors


def _append_unknown_values(
    errors: list[str],
    *,
    role_key: str,
    field_name: str,
    values: tuple[str, ...],
    valid_values: set[str],
) -> None:
    unknown_values = [value for value in values if value not in valid_values]
    if unknown_values:
        errors.append(f"{role_key}: unknown {field_name} values: {', '.join(unknown_values)}")
