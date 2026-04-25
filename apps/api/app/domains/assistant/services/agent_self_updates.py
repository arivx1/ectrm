from __future__ import annotations

from apps.api.app.domains.assistant.services.agent_evals import (
    latest_eval_runs_by_eval_id,
    list_agent_evals,
)
from apps.api.app.domains.assistant.services.autonomy_review import (
    build_assistant_autonomy_review_brief,
)
from apps.api.app.domains.assistant.services.chat import AssistantService, AssistantServiceError
from apps.api.app.domains.assistant.services.outcome_metrics import (
    summarize_assistant_outcome_metrics,
)
from apps.api.app.domains.assistant.services.registry import get_agent_record, to_managed_agent
from apps.api.app.schemas.assistant import (
    AssistantAgentSelfUpdateDraftOut,
    AssistantAgentSelfUpdateEvidenceOut,
    AssistantAgentSelfUpdateRequest,
)
from sqlalchemy.orm import Session


MAX_SELF_UPDATE_FEEDBACK_ITEMS = 5
MAX_SELF_UPDATE_FAILING_EVALS = 5
MAX_SELF_UPDATE_KNOWLEDGE_ITEMS = 5
MAX_SELF_UPDATE_STOP_CONDITIONS = 5


async def generate_assistant_agent_self_update_draft(
    db: Session,
    *,
    agent_id: str,
    payload: AssistantAgentSelfUpdateRequest | None,
    assistant_service: AssistantService,
) -> AssistantAgentSelfUpdateDraftOut:
    normalized_agent_id = agent_id.strip().lower()
    record = get_agent_record(db, normalized_agent_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent not found")

    autonomy_review = build_assistant_autonomy_review_brief(db, agent_id=record.agent_id)
    metrics_snapshot = summarize_assistant_outcome_metrics(db, agent_id=record.agent_id)
    recent_feedback = [
        feedback.comment.strip()
        for feedback in metrics_snapshot.recent_feedback
        if feedback.agent_id == record.agent_id and feedback.rating == "NEEDS_WORK" and feedback.comment
    ][:MAX_SELF_UPDATE_FEEDBACK_ITEMS]

    eval_records = list_agent_evals(db, agent_id=record.agent_id, limit=100)
    latest_runs = latest_eval_runs_by_eval_id(db, [eval_record.id for eval_record in eval_records])
    failing_eval_cases = [
        _format_failing_eval_case(eval_record.name, latest_runs[eval_record.id].failure_reasons, latest_runs[eval_record.id].status)
        for eval_record in eval_records
        if eval_record.id in latest_runs and latest_runs[eval_record.id].status != "PASS"
    ][:MAX_SELF_UPDATE_FAILING_EVALS]

    evidence = AssistantAgentSelfUpdateEvidenceOut(
        recommendation_reasons=list(autonomy_review.recommendation_reasons),
        recent_needs_work_feedback=recent_feedback,
        failing_eval_cases=failing_eval_cases,
        knowledge_base_titles=[
            entry.title for entry in autonomy_review.knowledge_base_entries[:MAX_SELF_UPDATE_KNOWLEDGE_ITEMS]
        ],
        stop_conditions=list(autonomy_review.stop_conditions[:MAX_SELF_UPDATE_STOP_CONDITIONS]),
    )
    source_brief = _build_self_update_brief(record, evidence=evidence, operator_brief=payload.brief if payload else None)
    suggestion = await assistant_service.build_agent_self_update_draft_with_openai(
        agent_definition=to_managed_agent(record),
        brief=source_brief,
    )

    warnings = list(suggestion.warnings)
    if not evidence.recent_needs_work_feedback:
        warnings.append("No recent needs-work feedback comments were available; the draft relied on eval and governance signals.")
    if not evidence.failing_eval_cases:
        warnings.append("No failing eval runs were available; add or update eval coverage so future learning stays measurable.")

    return AssistantAgentSelfUpdateDraftOut(
        agent_id=record.agent_id,
        name=record.name,
        description=suggestion.description,
        status=record.status,
        scope=record.scope,
        provider=record.provider,
        model=record.model,
        role_key=record.role_key,
        profile_kind=record.profile_kind or "CUSTOM",
        specialization_summary=record.specialization_summary,
        human_owner_role=record.human_owner_role,
        authority_ceiling=record.authority_ceiling,
        activation_notes=record.activation_notes,
        profile_request_id=record.profile_request_id,
        allowed_workspaces=list(suggestion.allowed_workspaces),
        capabilities=list(suggestion.capabilities),
        allowed_tools=list(suggestion.allowed_tools),
        allowed_action_types=list(suggestion.allowed_action_types),
        daily_token_allocation=record.daily_token_allocation,
        system_prompt=suggestion.system_prompt,
        source_brief=source_brief,
        change_summary=list(suggestion.change_summary),
        warnings=warnings,
        builder_provider=suggestion.builder_provider,
        builder_model=suggestion.builder_model,
        evidence=evidence,
    )


def _format_failing_eval_case(name: str, failure_reasons: list[str] | None, status: str) -> str:
    failure_reason = next((reason.strip() for reason in failure_reasons or [] if reason and reason.strip()), None)
    if failure_reason:
        return f"{name}: {failure_reason}"
    return f"{name}: latest eval status was {status.lower()}."


def _build_self_update_brief(
    record,
    *,
    evidence: AssistantAgentSelfUpdateEvidenceOut,
    operator_brief: str | None,
) -> str:
    parts = [
        f"Revise the managed assistant agent {record.name} ({record.agent_id}) after recent mistakes.",
        "Preserve identity and governance metadata. Keep agent_id, status, scope, provider, model, role mapping, owner role, authority ceiling, and token allocation unchanged.",
        "Do not expand allowed workspaces, capabilities, live tools, or governed actions. Preserve or narrow only.",
        "Prefer concrete prompt changes that improve evidence quality, stop conditions, reviewer clarity, and safe fallback behavior.",
    ]
    if operator_brief:
        parts.append(f"Operator focus:\n- {operator_brief}")

    parts.append(
        "Current mutable profile:\n"
        f"- description: {record.description}\n"
        f"- allowed workspaces: {', '.join(record.allowed_workspaces or []) or 'none'}\n"
        f"- capabilities: {', '.join(record.capabilities or []) or 'none'}\n"
        f"- allowed live tools: {', '.join(record.allowed_tools or []) or 'none'}\n"
        f"- allowed governed actions: {', '.join(record.allowed_action_types or []) or 'none'}"
    )
    parts.append("Current system prompt:\n" + record.system_prompt)
    parts.append(
        "Learning signals:\n"
        + _bullet_block(
            [
                *[f"Recommendation reason: {reason}" for reason in evidence.recommendation_reasons],
                *[f"Needs-work feedback: {feedback}" for feedback in evidence.recent_needs_work_feedback],
                *[f"Failing eval: {failure}" for failure in evidence.failing_eval_cases],
                *[f"Knowledge-base lesson: {title}" for title in evidence.knowledge_base_titles],
                *[f"Stop condition: {condition}" for condition in evidence.stop_conditions],
            ]
        )
    )
    parts.append(
        "Return a narrower or clearer draft when the evidence supports it. If the current permissions are already appropriate, keep the permission scope stable and focus on prompt clarity."
    )
    return "\n\n".join(parts)


def _bullet_block(lines: list[str]) -> str:
    meaningful_lines = [line.strip() for line in lines if line and line.strip()]
    if not meaningful_lines:
        return "- No recent learning signals were recorded, so keep the revision conservative."
    return "\n".join(f"- {line}" for line in meaningful_lines)
