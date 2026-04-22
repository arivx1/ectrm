from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from apps.api.app.domains.assistant.services.role_archetypes import get_role_archetype
from apps.api.app.domains.assistant.services.tools import build_tool_definitions
from apps.api.app.schemas.assistant import (
    ALL_ASSISTANT_ACTION_TYPES,
    AssistantAgentEffectivePolicyOut,
    AssistantPolicyDecisionOut,
)


class PolicyAgent(Protocol):
    agent_id: str
    name: str
    scope: str
    role_key: str | None
    profile_kind: str
    allowed_workspaces: tuple[str, ...]
    capabilities: tuple[str, ...]
    allowed_tools: tuple[str, ...]
    allowed_action_types: tuple[str, ...]


@dataclass(frozen=True)
class AssistantCapabilityPolicy:
    policy_key: str
    resource_type: str
    resource_id: str
    risk_level: str
    max_scope: str
    approval_required: bool = False
    roles: tuple[str, ...] = ()
    workspaces: tuple[str, ...] = ()
    agent_ids: tuple[str, ...] = ()
    enabled: bool = True


@dataclass(frozen=True)
class AssistantAgentProfilePolicyDefaults:
    allowed_tools: tuple[str, ...]
    allowed_action_types: tuple[str, ...]


class AssistantAgentProfilePolicyError(ValueError):
    pass


SCOPE_RANK = {
    "PERSONAL": 1,
    "TEAM": 2,
    "ORGANIZATION": 3,
}

AUTHORITY_RANK = {
    "OBSERVE": 1,
    "EXPLAIN": 2,
    "DRAFT": 3,
    "STAGE": 4,
    "EXECUTE": 5,
    "EXTERNAL_COMMIT": 6,
}

POLICY_RULES: tuple[AssistantCapabilityPolicy, ...] = (
    AssistantCapabilityPolicy(
        policy_key="assistant.tools.read_catalog.v1",
        resource_type="tool",
        resource_id="*",
        risk_level="LOW",
        max_scope="ORGANIZATION",
    ),
    AssistantCapabilityPolicy(
        policy_key="assistant.actions.cancel_trade.v1",
        resource_type="action",
        resource_id="cancel_trade",
        risk_level="HIGH",
        max_scope="TEAM",
        approval_required=True,
        roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "trades", "admin"),
    ),
    AssistantCapabilityPolicy(
        policy_key="assistant.actions.trade_confirmation.v1",
        resource_type="action",
        resource_id="issue_trade_confirmation",
        risk_level="MEDIUM",
        max_scope="TEAM",
        approval_required=True,
        roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "admin"),
    ),
    AssistantCapabilityPolicy(
        policy_key="assistant.actions.confirmation_response.v1",
        resource_type="action",
        resource_id="record_trade_confirmation_response",
        risk_level="MEDIUM",
        max_scope="TEAM",
        approval_required=True,
        roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "admin"),
    ),
    AssistantCapabilityPolicy(
        policy_key="assistant.actions.workflow_update.v1",
        resource_type="action",
        resource_id="update_trade_workflow_item",
        risk_level="MEDIUM",
        max_scope="TEAM",
        approval_required=True,
        roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "operations", "settlement", "admin"),
    ),
    AssistantCapabilityPolicy(
        policy_key="assistant.actions.invoice_issue.v1",
        resource_type="action",
        resource_id="issue_trade_invoice",
        risk_level="HIGH",
        max_scope="TEAM",
        approval_required=True,
        roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "admin"),
    ),
    AssistantCapabilityPolicy(
        policy_key="assistant.actions.payment_create.v1",
        resource_type="action",
        resource_id="create_trade_payment",
        risk_level="HIGH",
        max_scope="TEAM",
        approval_required=True,
        roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "settlement", "admin"),
    ),
    AssistantCapabilityPolicy(
        policy_key="assistant.actions.document_reprocess.v1",
        resource_type="action",
        resource_id="reprocess_document_ingestion",
        risk_level="MEDIUM",
        max_scope="TEAM",
        approval_required=True,
        roles=("OPS_ADMIN", "ADMIN"),
        workspaces=("assistant", "admin"),
    ),
)


def resolve_agent_profile_policy_defaults(
    *,
    role_key: str | None,
    profile_kind: str,
    capabilities: tuple[str, ...],
    allowed_tools: tuple[str, ...],
    allowed_action_types: tuple[str, ...],
) -> AssistantAgentProfilePolicyDefaults:
    role = get_role_archetype(role_key) if role_key else None
    normalized_capabilities = _normalized_set(capabilities)

    next_allowed_tools = tuple(allowed_tools)
    if not next_allowed_tools and "READ" in normalized_capabilities:
        if role is not None:
            published_tools = {tool.name for tool in build_tool_definitions()}
            next_allowed_tools = tuple(tool_name for tool_name in role.default_tools if tool_name in published_tools)

    next_allowed_action_types = tuple(allowed_action_types)

    return AssistantAgentProfilePolicyDefaults(
        allowed_tools=next_allowed_tools,
        allowed_action_types=next_allowed_action_types,
    )


def validate_agent_profile_definition(
    *,
    agent_name: str,
    role_key: str | None,
    profile_kind: str,
    scope: str,
    allowed_workspaces: tuple[str, ...],
    capabilities: tuple[str, ...],
    allowed_tools: tuple[str, ...],
    allowed_action_types: tuple[str, ...],
    authority_ceiling: str | None,
) -> None:
    errors: list[str] = []
    normalized_profile_kind = profile_kind.strip().upper()
    normalized_capabilities = _normalized_set(capabilities)
    role = get_role_archetype(role_key) if role_key else None

    if normalized_profile_kind in {"CURATED", "ROLE_DERIVED"} and role_key is None:
        errors.append(f"{agent_name} must include role_key for {normalized_profile_kind} profiles.")
    if role_key is not None and role is None:
        errors.append(f"{agent_name} references unknown role archetype '{role_key}'.")

    _append_unknown_values(
        errors,
        field_name="allowed_tools",
        values=allowed_tools,
        valid_values={tool.name for tool in build_tool_definitions()},
    )
    _append_unknown_values(
        errors,
        field_name="allowed_action_types",
        values=allowed_action_types,
        valid_values=set(ALL_ASSISTANT_ACTION_TYPES),
    )

    if allowed_tools and "READ" not in normalized_capabilities:
        errors.append(f"{agent_name} cannot allow live tools without READ capability.")
    if allowed_action_types and "ACTION" not in normalized_capabilities:
        errors.append("allowed_action_types can only be set for agents with the ACTION capability.")
    if "ACTION" in normalized_capabilities and not allowed_action_types:
        errors.append(f"{agent_name} has ACTION capability and must declare explicit allowed_action_types.")

    if role is not None:
        _append_subset_errors(
            errors,
            agent_name=agent_name,
            field_name="allowed_workspaces",
            values=allowed_workspaces,
            valid_values=set(role.allowed_workspaces),
            role_key=role.role_key,
        )
        _append_subset_errors(
            errors,
            agent_name=agent_name,
            field_name="capabilities",
            values=tuple(normalized_capabilities),
            valid_values={capability.upper() for capability in role.capability_ceiling},
            role_key=role.role_key,
        )
        _append_subset_errors(
            errors,
            agent_name=agent_name,
            field_name="allowed_tools",
            values=allowed_tools,
            valid_values=set(role.default_tools),
            role_key=role.role_key,
        )
        _append_subset_errors(
            errors,
            agent_name=agent_name,
            field_name="allowed_action_types",
            values=allowed_action_types,
            valid_values=set(role.maximum_action_types),
            role_key=role.role_key,
        )
        if authority_ceiling is not None and not _authority_within(authority_ceiling, role.authority_ceiling):
            errors.append(
                f"{agent_name} authority ceiling {authority_ceiling} exceeds role {role.role_key} ceiling {role.authority_ceiling}."
            )

    if errors:
        raise AssistantAgentProfilePolicyError("; ".join(errors))


def build_effective_policy_for_agent(agent: PolicyAgent) -> AssistantAgentEffectivePolicyOut:
    tool_decisions = [
        evaluate_tool_policy(
            agent=agent,
            tool_id=tool.name,
            workspace=None,
        )
        for tool in build_tool_definitions()
    ]
    action_decisions = [
        evaluate_action_policy(
            agent=agent,
            action_type=action_type,
            workspace=None,
            phase="stage",
        )
        for action_type in ALL_ASSISTANT_ACTION_TYPES
    ]
    return AssistantAgentEffectivePolicyOut(
        allowed_tools=[decision for decision in tool_decisions if decision.allowed],
        blocked_tools=[decision for decision in tool_decisions if not decision.allowed],
        allowed_actions=[decision for decision in action_decisions if decision.allowed],
        blocked_actions=[decision for decision in action_decisions if not decision.allowed],
        policy_notes=[
            "Tool/action allowlists are intersected with platform policy rules.",
            "Approval-gated actions are rechecked at execution time, including reviewer role policy.",
        ],
    )


def evaluate_tool_policy(
    *,
    agent: PolicyAgent | None,
    tool_id: str,
    workspace: str | None,
    actor_role: str | None = None,
) -> AssistantPolicyDecisionOut:
    rule = _policy_for("tool", tool_id)
    if agent is not None:
        capabilities = _normalized_set(agent.capabilities)
        if "READ" not in capabilities:
            return _decision(rule, tool_id, allowed=False, reason=f"{agent.name} does not have READ capability.")
        if tool_id not in set(agent.allowed_tools):
            return _decision(rule, tool_id, allowed=False, reason=f"{agent.name} does not allow tool {tool_id}.")
        role_decision = _evaluate_role_resource_policy(
            agent=agent,
            resource_type="tool",
            resource_id=tool_id,
            workspace=workspace,
        )
        if role_decision is not None:
            return role_decision
    return _evaluate_rule(
        rule=rule,
        resource_id=tool_id,
        agent=agent,
        workspace=workspace,
        actor_role=actor_role,
        enforce_role=True,
    )


def evaluate_action_policy(
    *,
    agent: PolicyAgent | None,
    action_type: str,
    workspace: str | None,
    actor_role: str | None = None,
    phase: str,
) -> AssistantPolicyDecisionOut:
    rule = _policy_for("action", action_type)
    if agent is not None:
        capabilities = _normalized_set(agent.capabilities)
        if "ACTION" not in capabilities:
            return _decision(rule, action_type, allowed=False, reason=f"{agent.name} does not have ACTION capability.")
        if action_type not in set(agent.allowed_action_types):
            return _decision(rule, action_type, allowed=False, reason=f"{agent.name} does not allow {action_type}.")
        role_decision = _evaluate_role_resource_policy(
            agent=agent,
            resource_type="action",
            resource_id=action_type,
            workspace=workspace,
        )
        if role_decision is not None:
            return role_decision
    return _evaluate_rule(
        rule=rule,
        resource_id=action_type,
        agent=agent,
        workspace=workspace,
        actor_role=actor_role,
        enforce_role=phase == "execute",
    )


def _policy_for(resource_type: str, resource_id: str) -> AssistantCapabilityPolicy:
    exact_match = next(
        (
            rule
            for rule in POLICY_RULES
            if rule.resource_type == resource_type and rule.resource_id == resource_id
        ),
        None,
    )
    if exact_match is not None:
        return exact_match
    wildcard_match = next(
        (
            rule
            for rule in POLICY_RULES
            if rule.resource_type == resource_type and rule.resource_id == "*"
        ),
        None,
    )
    if wildcard_match is not None:
        return wildcard_match
    return AssistantCapabilityPolicy(
        policy_key=f"assistant.{resource_type}.{resource_id}.implicit.v1",
        resource_type=resource_type,
        resource_id=resource_id,
        risk_level="HIGH",
        max_scope="TEAM",
        approval_required=resource_type == "action",
        enabled=False,
    )


def _evaluate_rule(
    *,
    rule: AssistantCapabilityPolicy,
    resource_id: str,
    agent: PolicyAgent | None,
    workspace: str | None,
    actor_role: str | None,
    enforce_role: bool,
) -> AssistantPolicyDecisionOut:
    if not rule.enabled:
        return _decision(rule, resource_id, allowed=False, reason=f"{resource_id} is disabled by policy.")
    if agent is not None and rule.agent_ids and agent.agent_id not in rule.agent_ids:
        return _decision(rule, resource_id, allowed=False, reason=f"{agent.name} is not listed on this policy.")
    if agent is not None and not _scope_within(agent.scope, rule.max_scope):
        return _decision(
            rule,
            resource_id,
            allowed=False,
            reason=f"{agent.name} scope {agent.scope} exceeds policy max scope {rule.max_scope}.",
        )
    if workspace and rule.workspaces and workspace not in rule.workspaces:
        return _decision(rule, resource_id, allowed=False, reason=f"{resource_id} is not allowed in {workspace}.")
    if enforce_role and rule.roles and (actor_role or "").strip().upper() not in rule.roles:
        return _decision(rule, resource_id, allowed=False, reason=f"{actor_role or 'Unknown role'} cannot execute {resource_id}.")
    return _decision(rule, resource_id, allowed=True, reason="Allowed by effective assistant policy.")


def _decision(
    rule: AssistantCapabilityPolicy,
    resource_id: str,
    *,
    allowed: bool,
    reason: str,
) -> AssistantPolicyDecisionOut:
    return AssistantPolicyDecisionOut(
        resource_type=rule.resource_type,
        resource_id=resource_id,
        policy_key=rule.policy_key,
        allowed=allowed,
        reason=reason,
        risk_level=rule.risk_level,
        approval_required=rule.approval_required,
        max_scope=rule.max_scope,
        roles=list(rule.roles),
        workspaces=list(rule.workspaces),
    )


def _evaluate_role_resource_policy(
    *,
    agent: PolicyAgent,
    resource_type: str,
    resource_id: str,
    workspace: str | None,
) -> AssistantPolicyDecisionOut | None:
    if agent.role_key is None:
        return None
    role = get_role_archetype(agent.role_key)
    if role is None:
        rule = _policy_for(resource_type, resource_id)
        return _decision(rule, resource_id, allowed=False, reason=f"{agent.name} references unknown role archetype {agent.role_key}.")
    if workspace is not None and workspace not in role.allowed_workspaces:
        rule = _policy_for(resource_type, resource_id)
        return _decision(rule, resource_id, allowed=False, reason=f"{resource_id} is outside the {role.role_key} workspace boundary.")
    if resource_type == "tool" and resource_id not in role.default_tools:
        rule = _policy_for(resource_type, resource_id)
        return _decision(rule, resource_id, allowed=False, reason=f"{resource_id} is outside the {role.role_key} tool boundary.")
    if resource_type == "action" and resource_id not in role.maximum_action_types:
        rule = _policy_for(resource_type, resource_id)
        return _decision(rule, resource_id, allowed=False, reason=f"{resource_id} is outside the {role.role_key} action boundary.")
    return None


def _normalized_set(values: tuple[str, ...]) -> set[str]:
    return {value.strip().upper() for value in values if value.strip()}


def _scope_within(scope: str, max_scope: str) -> bool:
    return SCOPE_RANK.get(scope.strip().upper(), 999) <= SCOPE_RANK.get(max_scope.strip().upper(), 0)


def _authority_within(authority: str, max_authority: str) -> bool:
    return AUTHORITY_RANK.get(authority.strip().upper(), 999) <= AUTHORITY_RANK.get(max_authority.strip().upper(), 0)


def _append_unknown_values(
    errors: list[str],
    *,
    field_name: str,
    values: tuple[str, ...],
    valid_values: set[str],
) -> None:
    unknown_values = [value for value in values if value not in valid_values]
    if unknown_values:
        errors.append(f"Unknown {field_name}: {', '.join(unknown_values)}.")


def _append_subset_errors(
    errors: list[str],
    *,
    agent_name: str,
    field_name: str,
    values: tuple[str, ...],
    valid_values: set[str],
    role_key: str,
) -> None:
    out_of_bounds = [value for value in values if value not in valid_values]
    if out_of_bounds:
        errors.append(
            f"{agent_name} {field_name} exceeds role {role_key}: {', '.join(out_of_bounds)}."
        )
