from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.role_archetypes import get_role_archetype, resolved_role_default_tools
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
    skills: tuple[str, ...]
    recommended_tools: tuple[str, ...]
    allowed_action_types: tuple[str, ...]
    system_prompt: str
    profile_kind: str = "ROLE_DERIVED"
    specialization_summary: str | None = None
    human_owner_role: str | None = None
    authority_ceiling: str | None = None
    activation_notes: str | None = None
    orchestration_pattern: str = "SINGLE"
    parent_agent_id: str | None = None
    managed_agent_ids: tuple[str, ...] = ()
    delegation_guidance: str | None = None
    provider: str | None = None
    model: str | None = None


@dataclass(frozen=True)
class AssistantAgentSeedSummary:
    total_profiles: int
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


def _build_role_system_prompt(*, role_key: str, name: str) -> str:
    role = get_role_archetype(role_key)
    if role is None:
        raise RuntimeError(f"Pilot assistant agent references unknown role archetype '{role_key}'")
    return _build_system_prompt(
        name=name,
        mission=role.mission,
        workflow=(
            *role.base_prompt_guidance,
            *role.delegation_guidance,
            "Use the governed workspaces, tools, and authority boundary defined by the role profile as your default lane.",
            (
                "If current evidence shows the platform record is behind real-world state and your authority ceiling is EXECUTE, "
                "prefer correcting the record through governed actions instead of asking for approval."
            ),
        ),
        response_style=(
            "Lead with the operational conclusion, then show the supporting evidence.",
            "Separate confirmed facts, assumptions, and human review needs.",
        ),
        guardrails=(
            *role.stop_conditions,
            "If you act outside your delegated action scope, explain why so the override can be logged.",
        ),
    )


def _seed_definition_from_role(
    role_key: str,
    *,
    agent_id: str | None = None,
    status: str = "DRAFT",
    scope: str = "TEAM",
    capabilities: tuple[str, ...] | None = None,
    allowed_action_types: tuple[str, ...] | None = None,
    authority_ceiling: str | None = None,
    activation_notes: str | None = None,
) -> AssistantAgentSeedDefinition:
    role = get_role_archetype(role_key)
    if role is None:
        raise RuntimeError(f"Pilot assistant agent references unknown role archetype '{role_key}'")

    resolved_agent_id = agent_id or role.role_key
    resolved_authority = authority_ceiling or role.authority_ceiling
    return AssistantAgentSeedDefinition(
        agent_id=resolved_agent_id,
        role_key=role.role_key,
        name=role.name,
        description=role.description,
        status=status,
        scope=scope,
        allowed_workspaces=role.allowed_workspaces,
        capabilities=capabilities or role.capability_ceiling,
        skills=role.skills,
        recommended_tools=resolved_role_default_tools(role),
        allowed_action_types=allowed_action_types if allowed_action_types is not None else role.maximum_action_types,
        system_prompt=_build_role_system_prompt(role_key=role.role_key, name=role.name),
        profile_kind="ROLE_DERIVED",
        specialization_summary=f"Role-derived pilot profile for the {role.name} role archetype.",
        human_owner_role=role.human_owner_role,
        authority_ceiling=resolved_authority,
        activation_notes=activation_notes or f"Pilot profile synchronized from the {role.name} role catalog entry.",
        orchestration_pattern=role.recommended_orchestration_pattern,
        parent_agent_id=role.recommended_parent_role_keys[0] if role.recommended_parent_role_keys else None,
        managed_agent_ids=role.recommended_managed_role_keys,
        delegation_guidance=role.delegation_guidance[0] if role.delegation_guidance else None,
    )


SEEDED_PILOT_AGENT_DEFINITIONS: tuple[AssistantAgentSeedDefinition, ...] = (
    _seed_definition_from_role("trade-ops-copilot", status="ACTIVE"),
    _seed_definition_from_role("settlement-copilot", status="ACTIVE"),
    _seed_definition_from_role("trade-governor", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("trade-capture-agent", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("movement-controller-agent", status="ACTIVE"),
    _seed_definition_from_role("accrual-controller-agent", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("accounting-posting-agent", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("counterparty-state-sync-agent", status="ACTIVE"),
    _seed_definition_from_role("confirmation-controller-agent", status="ACTIVE"),
    _seed_definition_from_role("workflow-controller-agent", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("invoice-controller-agent", status="ACTIVE"),
    _seed_definition_from_role("market-research-agent", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("pre-trade-structuring-agent", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("risk-sentinel", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("document-agent", status="ACTIVE"),
    _seed_definition_from_role("reporting-reconciliation-agent", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("logistics-coordinator", status="ACTIVE"),
    _seed_definition_from_role("fee-accrual-agent", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("counterparty-outreach-agent", status="ACTIVE", scope="ORGANIZATION"),
    _seed_definition_from_role("control-tower-agent", status="ACTIVE", scope="ORGANIZATION"),
)

PILOT_ASSISTANT_AGENT_DEFINITIONS: tuple[AssistantAgentSeedDefinition, ...] = (
    *SEEDED_PILOT_AGENT_DEFINITIONS,
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

    for definition in PILOT_ASSISTANT_AGENT_DEFINITIONS:
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
                    orchestration_pattern=definition.orchestration_pattern,
                    parent_agent_id=definition.parent_agent_id,
                    managed_agent_ids=list(definition.managed_agent_ids),
                    delegation_guidance=definition.delegation_guidance,
                    allowed_workspaces=list(definition.allowed_workspaces),
                    capabilities=list(definition.capabilities),
                    skills=list(definition.skills),
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
        total_profiles=len(PILOT_ASSISTANT_AGENT_DEFINITIONS),
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
    next_skills = list(definition.skills)
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
            (record.orchestration_pattern or "SINGLE") != definition.orchestration_pattern,
            record.parent_agent_id != definition.parent_agent_id,
            list(record.managed_agent_ids or []) != list(definition.managed_agent_ids),
            record.delegation_guidance != definition.delegation_guidance,
            list(record.allowed_workspaces or []) != next_allowed_workspaces,
            list(record.capabilities or []) != next_capabilities,
            list(record.skills or []) != next_skills,
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
    record.orchestration_pattern = definition.orchestration_pattern
    record.parent_agent_id = definition.parent_agent_id
    record.managed_agent_ids = list(definition.managed_agent_ids)
    record.delegation_guidance = definition.delegation_guidance
    record.allowed_workspaces = next_allowed_workspaces
    record.capabilities = next_capabilities
    record.skills = next_skills
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
        "profile_kind": definition.profile_kind,
        "specialization_summary": (
            definition.specialization_summary
            or f"Role-derived pilot profile for the {role.name} role archetype."
        ),
        "human_owner_role": definition.human_owner_role or role.human_owner_role,
        "authority_ceiling": definition.authority_ceiling or role.authority_ceiling,
        "activation_notes": definition.activation_notes or f"Pilot profile synchronized from the {role.name} role catalog entry.",
    }
