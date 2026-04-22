from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.role_archetypes import get_role_archetype
from apps.api.app.domains.assistant.services.tools import build_tool_definitions
from apps.api.app.models.assistant_agent import AssistantAgent


@dataclass(frozen=True)
class AssistantAgentSeedDefinition:
    agent_id: str
    role_key: str
    name: str
    description: str
    status: str
    scope: str
    allowed_workspaces: tuple[str, ...]
    capabilities: tuple[str, ...]
    recommended_tools: tuple[str, ...]
    allowed_action_types: tuple[str, ...]
    system_prompt: str
    provider: str | None = None
    model: str | None = None


@dataclass(frozen=True)
class AssistantAgentSeedSummary:
    total_templates: int
    created_count: int
    updated_count: int
    agent_ids: list[str]


def _render_prompt_section(title: str, lines: tuple[str, ...]) -> str:
    return f"{title}:\n" + "\n".join(f"- {line}" for line in lines)


def _build_system_prompt(
    *,
    name: str,
    mission: tuple[str, ...],
    workflow: tuple[str, ...],
    response_style: tuple[str, ...],
    guardrails: tuple[str, ...],
) -> str:
    return "\n\n".join(
        [
            f"You are {name}, a managed agent inside the ECTRM operator console.",
            _render_prompt_section("Mission", mission),
            _render_prompt_section("How to work", workflow),
            _render_prompt_section("Response style", response_style),
            _render_prompt_section("Guardrails", guardrails),
        ]
    )


CURATED_ASSISTANT_AGENT_DEFINITIONS: tuple[AssistantAgentSeedDefinition, ...] = (
    AssistantAgentSeedDefinition(
        agent_id="trade-ops-copilot",
        role_key="trade-ops-copilot",
        name="Trade Ops Copilot",
        description=(
            "Coordinates confirmation, workflow, delivery, and document follow-through for booked trades."
        ),
        status="ACTIVE",
        scope="TEAM",
        allowed_workspaces=(
            "assistant",
            "trades",
            "operations",
            "shipments",
            "scheduling",
            "reference",
        ),
        capabilities=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        recommended_tools=(
            "get_trade_workbench",
            "list_workflow_items",
            "list_trade_confirmations",
            "list_deliveries",
            "list_documents",
            "get_document_ingestion",
        ),
        allowed_action_types=(
            "issue_trade_confirmation",
            "record_trade_confirmation_response",
            "update_trade_workflow_item",
            "reprocess_document_ingestion",
        ),
        system_prompt=_build_system_prompt(
            name="Trade Ops Copilot",
            mission=(
                "Keep booked trades moving by combining operations visibility with tightly scoped, approval-gated actions.",
                "Help operators understand what is blocked now and stage the smallest appropriate next step.",
            ),
            workflow=(
                "Review trade workbench, workflow items, confirmations, deliveries, and document signals before recommending or staging a change.",
                "When an action is appropriate, explain why it is needed and keep the requested mutation narrowly scoped to the evidence at hand.",
                "Use draft-style responses for handoffs, owner notes, or follow-up checklists when direct action is not yet warranted.",
            ),
            response_style=(
                "Lead with the blocker or next action, then show the evidence supporting it.",
                "Make approvals, unresolved ambiguity, and remaining human checks explicit.",
            ),
            guardrails=(
                "Do not stage broad or speculative changes when the current workflow evidence is incomplete.",
                "Do not claim an approval is final until the action request is actually executed.",
            ),
        ),
    ),
    AssistantAgentSeedDefinition(
        agent_id="settlement-copilot",
        role_key="settlement-copilot",
        name="Settlement Copilot",
        description="Pairs settlement analysis with approval-gated invoice and payment staging.",
        status="ACTIVE",
        scope="TEAM",
        allowed_workspaces=("assistant", "settlement", "operations", "reports"),
        capabilities=("READ", "EXPLAIN", "DRAFT", "ACTION"),
        recommended_tools=(
            "list_trade_invoices",
            "list_trade_payments",
            "get_trade_settlement_summary",
            "list_workflow_items",
            "get_workspace_summary",
        ),
        allowed_action_types=("issue_trade_invoice", "create_trade_payment"),
        system_prompt=_build_system_prompt(
            name="Settlement Copilot",
            mission=(
                "Explain settlement posture clearly and help the team stage the right invoice or payment action when it is justified.",
                "Keep finance-oriented follow-up grounded in current settlement evidence and workflow context.",
            ),
            workflow=(
                "Verify invoice, payment, settlement, and workflow records before suggesting or staging a cash action.",
                "Call out missing dates, amounts, or dependencies before moving from explanation into action planning.",
                "Draft concise collection or review notes when a written handoff is more appropriate than an immediate mutation.",
            ),
            response_style=(
                "Start with the cash status, then move into the evidence and the recommended next step.",
                "Keep action descriptions tight enough for a reviewer to approve confidently.",
            ),
            guardrails=(
                "Do not stage invoices or payments when amounts, timing, or trade linkage are still ambiguous.",
                "Do not smooth over missing settlement evidence; surface it directly.",
            ),
        ),
    ),
    AssistantAgentSeedDefinition(
        agent_id="trade-governor",
        role_key="trade-governor",
        name="Trade Governor",
        description=(
            "Focuses on high-sensitivity trade governance with a tightly constrained cancel-only action scope."
        ),
        status="ACTIVE",
        scope="ORGANIZATION",
        allowed_workspaces=("assistant", "trades", "operations", "admin"),
        capabilities=("READ", "EXPLAIN", "ACTION"),
        recommended_tools=(
            "get_trade_by_id",
            "list_trade_events",
            "get_trade_workbench",
            "list_workflow_items",
        ),
        allowed_action_types=("cancel_trade",),
        system_prompt=_build_system_prompt(
            name="Trade Governor",
            mission=(
                "Assess whether a trade cancellation request is supported by the current record and stage it only when the evidence is clear.",
                "Make reviewer context explicit so approvals are easy to audit and reason about later.",
            ),
            workflow=(
                "Check the live trade state, event history, workbench context, and open workflow items before considering cancellation.",
                "Explain the operational impact and rationale behind every staged cancel request.",
                "Decline to stage an action when the request is better handled as an amendment, workflow update, or human investigation.",
            ),
            response_style=(
                "Lead with whether cancellation appears justified, then summarize the strongest supporting and conflicting evidence.",
                "Keep governance language calm, specific, and reviewable.",
            ),
            guardrails=(
                "Never stage a cancellation when the trade identity, current status, or business reason is uncertain.",
                "Do not broaden beyond cancel-only governance actions.",
            ),
        ),
    ),
)


def seed_assistant_agents(
    db: Session,
    *,
    requested_by: str,
) -> AssistantAgentSeedSummary:
    now = datetime.now(timezone.utc)
    available_tool_names = {tool.name for tool in build_tool_definitions()}
    created_count = 0
    updated_count = 0
    agent_ids: list[str] = []

    for definition in CURATED_ASSISTANT_AGENT_DEFINITIONS:
        agent_ids.append(definition.agent_id)
        allowed_tools = [
            tool_name for tool_name in definition.recommended_tools if tool_name in available_tool_names
        ]
        profile_metadata = _profile_metadata_for_definition(definition)
        record = db.get(AssistantAgent, definition.agent_id)
        if record is None:
            db.add(
                AssistantAgent(
                    agent_id=definition.agent_id,
                    name=definition.name,
                    description=definition.description,
                    status=definition.status,
                    scope=definition.scope,
                    provider=definition.provider,
                    model=definition.model,
                    role_key=profile_metadata["role_key"],
                    profile_kind=profile_metadata["profile_kind"],
                    specialization_summary=profile_metadata["specialization_summary"],
                    human_owner_role=profile_metadata["human_owner_role"],
                    authority_ceiling=profile_metadata["authority_ceiling"],
                    activation_notes=profile_metadata["activation_notes"],
                    allowed_workspaces=list(definition.allowed_workspaces),
                    capabilities=list(definition.capabilities),
                    allowed_tools=allowed_tools,
                    allowed_action_types=list(definition.allowed_action_types),
                    system_prompt=definition.system_prompt,
                    created_at=now,
                    created_by=requested_by,
                    updated_at=now,
                    updated_by=requested_by,
                    version=1,
                )
            )
            created_count += 1
            continue

        if _apply_definition(
            record,
            definition=definition,
            allowed_tools=allowed_tools,
            profile_metadata=profile_metadata,
            requested_by=requested_by,
            updated_at=now,
        ):
            updated_count += 1

    db.commit()
    return AssistantAgentSeedSummary(
        total_templates=len(CURATED_ASSISTANT_AGENT_DEFINITIONS),
        created_count=created_count,
        updated_count=updated_count,
        agent_ids=agent_ids,
    )


def _apply_definition(
    record: AssistantAgent,
    *,
    definition: AssistantAgentSeedDefinition,
    allowed_tools: list[str],
    profile_metadata: dict[str, str],
    requested_by: str,
    updated_at: datetime,
) -> bool:
    next_allowed_workspaces = list(definition.allowed_workspaces)
    next_capabilities = list(definition.capabilities)
    next_allowed_action_types = list(definition.allowed_action_types)

    changed = any(
        [
            record.name != definition.name,
            record.description != definition.description,
            record.status != definition.status,
            record.scope != definition.scope,
            record.provider != definition.provider,
            record.model != definition.model,
            record.role_key != profile_metadata["role_key"],
            record.profile_kind != profile_metadata["profile_kind"],
            record.specialization_summary != profile_metadata["specialization_summary"],
            record.human_owner_role != profile_metadata["human_owner_role"],
            record.authority_ceiling != profile_metadata["authority_ceiling"],
            record.activation_notes != profile_metadata["activation_notes"],
            list(record.allowed_workspaces or []) != next_allowed_workspaces,
            list(record.capabilities or []) != next_capabilities,
            list(record.allowed_tools or []) != allowed_tools,
            list(record.allowed_action_types or []) != next_allowed_action_types,
            record.system_prompt != definition.system_prompt,
        ]
    )
    if not changed:
        return False

    record.name = definition.name
    record.description = definition.description
    record.status = definition.status
    record.scope = definition.scope
    record.provider = definition.provider
    record.model = definition.model
    record.role_key = profile_metadata["role_key"]
    record.profile_kind = profile_metadata["profile_kind"]
    record.specialization_summary = profile_metadata["specialization_summary"]
    record.human_owner_role = profile_metadata["human_owner_role"]
    record.authority_ceiling = profile_metadata["authority_ceiling"]
    record.activation_notes = profile_metadata["activation_notes"]
    record.allowed_workspaces = next_allowed_workspaces
    record.capabilities = next_capabilities
    record.allowed_tools = allowed_tools
    record.allowed_action_types = next_allowed_action_types
    record.system_prompt = definition.system_prompt
    record.updated_at = updated_at
    record.updated_by = requested_by
    record.version += 1
    return True


def _profile_metadata_for_definition(definition: AssistantAgentSeedDefinition) -> dict[str, str]:
    role = get_role_archetype(definition.role_key)
    if role is None:
        raise RuntimeError(f"Seeded assistant agent references unknown role archetype '{definition.role_key}'")
    return {
        "role_key": role.role_key,
        "profile_kind": "CURATED",
        "specialization_summary": f"Curated seed profile for the {role.name} role archetype.",
        "human_owner_role": role.human_owner_role,
        "authority_ceiling": role.authority_ceiling,
        "activation_notes": "Seeded by the platform role catalog.",
    }
