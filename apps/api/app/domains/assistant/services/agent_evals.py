from __future__ import annotations

from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.domains.assistant.services.chat import AssistantServiceError
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval
from apps.api.app.schemas.assistant import (
    AssistantAgentEvalCreate,
    AssistantAgentEvalOut,
    AssistantAgentEvalUpdate,
)


class ProfileRequestForEvalSeed(Protocol):
    request_id: int
    business_problem: str
    proposed_mission: str
    requested_inputs_tools: list[str]
    proposed_eval_cases: list[str]


def list_agent_evals(
    db: Session,
    *,
    agent_id: str | None = None,
    limit: int = 250,
    offset: int = 0,
) -> list[AssistantAgentEval]:
    stmt = select(AssistantAgentEval).order_by(
        AssistantAgentEval.agent_id.asc(),
        AssistantAgentEval.updated_at.desc(),
        AssistantAgentEval.id.desc(),
    )
    if agent_id:
        stmt = stmt.where(AssistantAgentEval.agent_id == agent_id.strip().lower())
    return list(db.scalars(stmt.offset(max(offset, 0)).limit(max(1, min(limit, 500)))).all())


def count_agent_evals(db: Session, *, agent_id: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(AssistantAgentEval)
            .where(AssistantAgentEval.agent_id == agent_id.strip().lower())
        )
        or 0
    )


def create_agent_eval(
    db: Session,
    payload: AssistantAgentEvalCreate,
) -> AssistantAgentEval:
    agent = db.get(AssistantAgent, payload.agent_id)
    if agent is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent not found")

    now = datetime.now(timezone.utc)
    record = AssistantAgentEval(
        agent_id=payload.agent_id,
        name=payload.name,
        workspace=payload.workspace,
        prompt=payload.prompt,
        context=payload.context,
        use_live_tools=payload.use_live_tools,
        expected_substrings=list(payload.expected_substrings),
        expected_tool_names=list(payload.expected_tool_names),
        expected_action_types=list(payload.expected_action_types),
        created_at=now,
        created_by=payload.created_by,
        updated_at=now,
        updated_by=payload.created_by,
    )
    db.add(record)
    db.flush()
    _record_agent_eval_provenance(db, record=record, operation_key="assistant_agent_eval.created", action="created")
    db.commit()
    db.refresh(record)
    return record


def update_agent_eval(
    db: Session,
    *,
    eval_id: int,
    payload: AssistantAgentEvalUpdate,
) -> AssistantAgentEval:
    record = _get_agent_eval_or_error(db, eval_id)
    record.name = payload.name
    record.workspace = payload.workspace
    record.prompt = payload.prompt
    record.context = payload.context
    record.use_live_tools = payload.use_live_tools
    record.expected_substrings = list(payload.expected_substrings)
    record.expected_tool_names = list(payload.expected_tool_names)
    record.expected_action_types = list(payload.expected_action_types)
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = payload.updated_by
    db.flush()
    _record_agent_eval_provenance(db, record=record, operation_key="assistant_agent_eval.updated", action="updated")
    db.commit()
    db.refresh(record)
    return record


def delete_agent_eval(db: Session, *, eval_id: int) -> None:
    record = _get_agent_eval_or_error(db, eval_id)
    _record_agent_eval_provenance(db, record=record, operation_key="assistant_agent_eval.deleted", action="deleted")
    db.delete(record)
    db.commit()


def seed_agent_evals_from_profile_request(
    db: Session,
    *,
    agent: AssistantAgent,
    profile_request: ProfileRequestForEvalSeed,
    actor_id: str,
) -> list[AssistantAgentEval]:
    proposed_cases = [case.strip() for case in profile_request.proposed_eval_cases or [] if case.strip()]
    if not proposed_cases:
        return []

    existing_names = {
        name.strip().lower()
        for name in db.scalars(
            select(AssistantAgentEval.name).where(AssistantAgentEval.agent_id == agent.agent_id)
        ).all()
    }
    created: list[AssistantAgentEval] = []
    now = datetime.now(timezone.utc)
    context = (
        f"Profile request #{profile_request.request_id}\n\n"
        f"Business problem:\n{profile_request.business_problem}\n\n"
        f"Proposed mission:\n{profile_request.proposed_mission}"
    )

    for proposed_case in proposed_cases:
        name = proposed_case[:160]
        if name.lower() in existing_names:
            continue
        record = AssistantAgentEval(
            agent_id=agent.agent_id,
            name=name,
            workspace="assistant",
            prompt=proposed_case,
            context=context,
            use_live_tools=bool(profile_request.requested_inputs_tools),
            expected_substrings=[],
            expected_tool_names=[],
            expected_action_types=[],
            created_at=now,
            created_by=actor_id,
            updated_at=now,
            updated_by=actor_id,
        )
        db.add(record)
        db.flush()
        existing_names.add(name.lower())
        created.append(record)
        _record_agent_eval_provenance(
            db,
            record=record,
            operation_key="assistant_agent_eval.seeded_from_profile_request",
            action="seeded",
            details={"profile_request_id": profile_request.request_id},
        )

    return created


def to_agent_eval_out(record: AssistantAgentEval) -> AssistantAgentEvalOut:
    return AssistantAgentEvalOut(
        eval_id=record.id,
        agent_id=record.agent_id,
        name=record.name,
        workspace=record.workspace,
        prompt=record.prompt,
        context=record.context,
        use_live_tools=record.use_live_tools,
        expected_substrings=list(record.expected_substrings or []),
        expected_tool_names=list(record.expected_tool_names or []),
        expected_action_types=list(record.expected_action_types or []),
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
    )


def _get_agent_eval_or_error(db: Session, eval_id: int) -> AssistantAgentEval:
    record = db.get(AssistantAgentEval, eval_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent eval not found")
    return record


def _record_agent_eval_provenance(
    db: Session,
    *,
    record: AssistantAgentEval,
    operation_key: str,
    action: str,
    details: dict[str, object] | None = None,
) -> None:
    record_mutation_provenance(
        db,
        operation_key=operation_key,
        source_surface="admin.assistant.agent_evals",
        affected_records=[
            {
                "record_type": "assistant_agent_eval",
                "record_id": record.id,
                "action": action,
                "label": record.name,
            },
            {
                "record_type": "assistant_agent",
                "record_id": record.agent_id,
                "action": "evaluated",
                "label": record.agent_id,
            },
        ],
        details={
            "eval_id": record.id,
            "agent_id": record.agent_id,
            "workspace": record.workspace,
            "expected_substring_count": len(record.expected_substrings or []),
            "expected_tool_count": len(record.expected_tool_names or []),
            "expected_action_type_count": len(record.expected_action_types or []),
            **(details or {}),
        },
    )
