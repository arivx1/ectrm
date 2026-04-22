from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_runtime import plan_action_requests
from apps.api.app.domains.assistant.services.policies import (
    build_effective_policy_for_agent,
    evaluate_action_policy,
    evaluate_tool_policy,
)
from apps.api.app.domains.assistant.services.registry import to_managed_agent
from apps.api.app.domains.assistant.services.tools import build_tool_definitions
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.schemas.assistant import (
    ALL_ASSISTANT_ACTION_TYPES,
    AssistantMessageIn,
    AssistantPolicyDecisionOut,
    AssistantPolicySimulationActionProposalOut,
    AssistantPolicySimulationOut,
    AssistantPolicySimulationRequest,
    AssistantPromptRequest,
)


def simulate_assistant_agent_policy(
    *,
    db: Session,
    record: AssistantAgent,
    payload: AssistantPolicySimulationRequest,
) -> AssistantPolicySimulationOut:
    agent = to_managed_agent(record)
    tool_decisions = [
        evaluate_tool_policy(
            agent=agent,
            tool_id=tool.name,
            workspace=payload.workspace,
            actor_role=payload.actor_role,
        )
        for tool in build_tool_definitions()
    ]
    action_decisions = [
        evaluate_action_policy(
            agent=agent,
            action_type=action_type,
            workspace=payload.workspace,
            actor_role=payload.actor_role,
            phase=payload.phase,
        )
        for action_type in ALL_ASSISTANT_ACTION_TYPES
    ]
    action_decision_by_type = {decision.resource_id: decision for decision in action_decisions}

    staging_warnings: list[str] = []
    staged_action_proposals: list[AssistantPolicySimulationActionProposalOut] = []
    if payload.prompt:
        planning_result = plan_action_requests(
            payload=AssistantPromptRequest(
                agent_id=agent.agent_id,
                workspace=payload.workspace,
                context=payload.context,
                use_live_tools=False,
                messages=[AssistantMessageIn(role="user", content=payload.prompt)],
            ),
            db=db,
            agent_definition=agent,
        )
        staging_warnings = list(planning_result.warnings)
        staged_action_proposals = [
            AssistantPolicySimulationActionProposalOut(
                action_type=proposal.action_type,
                summary=proposal.summary,
                description=proposal.description,
                payload=proposal.payload,
                decision=action_decision_by_type.get(proposal.action_type)
                or _missing_action_decision(proposal.action_type),
            )
            for proposal in planning_result.proposals
        ]

    return AssistantPolicySimulationOut(
        agent_id=agent.agent_id,
        agent_name=agent.name,
        workspace=payload.workspace,
        actor_role=payload.actor_role,
        phase=payload.phase,
        effective_policy=build_effective_policy_for_agent(agent),
        allowed_tools=[decision for decision in tool_decisions if decision.allowed],
        blocked_tools=[decision for decision in tool_decisions if not decision.allowed],
        allowed_actions=[decision for decision in action_decisions if decision.allowed],
        blocked_actions=[decision for decision in action_decisions if not decision.allowed],
        staged_action_proposals=staged_action_proposals,
        staging_warnings=staging_warnings,
        simulation_notes=[
            "Simulation is read-only and does not create action requests.",
            "Prompt planning uses the deterministic staging parser, not an LLM call.",
        ],
    )


def _missing_action_decision(action_type: str) -> AssistantPolicyDecisionOut:
    return AssistantPolicyDecisionOut(
        resource_type="action",
        resource_id=action_type,
        policy_key=f"assistant.action.{action_type}.simulation-missing.v1",
        allowed=False,
        reason=f"No policy decision was produced for {action_type}.",
        risk_level="HIGH",
        approval_required=True,
        max_scope="TEAM",
        roles=[],
        workspaces=[],
    )
