from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_planners import ACTION_PLANNERS
from apps.api.app.domains.assistant.services.action_planners import ACTION_PLANNER_SEQUENCE
from apps.api.app.domains.assistant.services.action_planners import first_matching_action_plan
from apps.api.app.domains.assistant.services.action_planners import parse_action_context_fields
from apps.api.app.domains.assistant.services.action_specs import (
    AssistantActionPlanningContext,
    AssistantActionProposal,
    AssistantActionSpec,
)
from apps.api.app.domains.assistant.services.policies import (
    authority_allows_execution,
    evaluate_action_policy,
)
from apps.api.app.domains.assistant.services.prompt_context import (
    AssistantPromptSection,
    build_prompt_section,
)
from apps.api.app.domains.assistant.services.registry import ManagedAssistantAgent
from apps.api.app.schemas.assistant import AssistantPromptRequest

__all__ = [
    "ACTION_PLANNERS",
    "ACTION_PLANNER_SEQUENCE",
    "AssistantActionRuntimeResult",
    "plan_action_requests",
]


@dataclass(frozen=True)
class AssistantActionRuntimeResult:
    sections: tuple[AssistantPromptSection, ...]
    proposals: tuple[AssistantActionProposal, ...]
    warnings: tuple[str, ...] = ()


def plan_action_requests(
    *,
    payload: AssistantPromptRequest,
    db: Session,
    agent_definition: ManagedAssistantAgent | None,
    action_specs: dict[str, AssistantActionSpec],
) -> AssistantActionRuntimeResult:
    if agent_definition is None:
        return AssistantActionRuntimeResult(sections=(), proposals=())
    if "ACTION" not in {capability.upper() for capability in agent_definition.capabilities}:
        return AssistantActionRuntimeResult(sections=(), proposals=())

    latest_message = _latest_user_message(payload)
    if latest_message is None:
        return AssistantActionRuntimeResult(sections=(), proposals=())

    planning_context = AssistantActionPlanningContext(
        message=latest_message,
        message_lower=latest_message.lower(),
        context=payload.context,
        context_fields=parse_action_context_fields(payload.context),
        db=db,
    )
    planning_candidate = first_matching_action_plan(planning_context, action_specs=action_specs)
    if planning_candidate is None:
        return AssistantActionRuntimeResult(sections=(), proposals=())
    if planning_candidate.warning:
        return AssistantActionRuntimeResult(sections=(), proposals=(), warnings=(planning_candidate.warning,))

    proposal = planning_candidate.proposal
    assert proposal is not None
    policy_decision = evaluate_action_policy(
        agent=agent_definition,
        action_type=proposal.action_type,
        workspace=payload.workspace,
        phase="stage",
    )
    delegated_override_reason = None
    if not policy_decision.allowed and agent_definition is not None and authority_allows_execution(
        agent_definition.authority_ceiling
    ):
        delegated_override_reason = (
            "The user request indicates the real-world state should already be reflected in the system of record, "
            "so this execute-capable agent is widening beyond its delegated action scope with an explicit audit log."
        )
        policy_decision = evaluate_action_policy(
            agent=agent_definition,
            action_type=proposal.action_type,
            workspace=payload.workspace,
            phase="stage",
            override_reason=delegated_override_reason,
        )
    if not policy_decision.allowed:
        return AssistantActionRuntimeResult(
            sections=(),
            proposals=(),
            warnings=(policy_decision.reason,),
        )
    _annotate_proposal_review_context(
        proposal,
        execution_mode="AUTONOMOUS" if authority_allows_execution(agent_definition.authority_ceiling) else "REVIEW_REQUIRED",
        autonomous_execution_reason=(
            "This agent can execute governed actions directly through typed services when evidence stays valid."
            if authority_allows_execution(agent_definition.authority_ceiling)
            else None
        ),
        delegated_ability_override_reason=delegated_override_reason,
    )
    return AssistantActionRuntimeResult(
        sections=(
            _build_action_prompt_section(
                proposal,
                autonomous_execution=authority_allows_execution(agent_definition.authority_ceiling),
            ),
        ),
        proposals=(proposal,),
    )


def _latest_user_message(payload: AssistantPromptRequest) -> str | None:
    for message in reversed(payload.messages):
        if message.role == "user":
            return message.content.strip() or None
    return None


def _build_action_prompt_section(
    proposal: AssistantActionProposal,
    *,
    autonomous_execution: bool,
) -> AssistantPromptSection:
    prompt_payload = _action_payload_for_prompt(proposal.payload)
    execution_note = (
        "Do not claim the action has been executed unless runtime metadata reports EXECUTED."
        if autonomous_execution
        else "Do not claim the action has been executed unless the approval workflow reports EXECUTED."
    )
    intro = (
        "The application can execute this governed action directly through typed services when evidence remains valid.\n"
        if autonomous_execution
        else "The application can stage an approval-gated action for explicit confirmation.\n"
    )
    return build_prompt_section(
        contract_key="approval-gated-action",
        content=(
            intro
            + f"action_type: {proposal.action_type}\n"
            + f"summary: {proposal.summary}\n"
            + f"description: {proposal.description}\n"
            + f"payload: {prompt_payload}\n"
            + f"{execution_note}"
        ),
        owner_reference=proposal.action_type,
    )


def _action_payload_for_prompt(payload: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in payload.items() if key != "review_context"}


def _annotate_proposal_review_context(
    proposal: AssistantActionProposal,
    *,
    execution_mode: str,
    autonomous_execution_reason: str | None,
    delegated_ability_override_reason: str | None,
) -> None:
    review_context = proposal.payload.get("review_context")
    if not isinstance(review_context, dict):
        return
    review_context["execution_mode"] = execution_mode
    if autonomous_execution_reason is not None:
        review_context["autonomous_execution_reason"] = autonomous_execution_reason
    if delegated_ability_override_reason is not None:
        review_context["delegated_ability_override_reason"] = delegated_ability_override_reason
