from __future__ import annotations

from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.domains.assistant.services.chat import AssistantService, AssistantServiceError
from apps.api.app.domains.assistant.services.execution import (
    AssistantPromptUser,
    execute_assistant_execution,
    prepare_assistant_execution,
    record_failed_assistant_execution,
)
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval, AssistantAgentEvalRun
from apps.api.app.schemas.assistant import (
    AssistantAgentEvalCreate,
    AssistantAgentEvalOut,
    AssistantAgentEvalRunOut,
    AssistantAgentEvalUpdate,
    AssistantMessageIn,
    AssistantPromptRequest,
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


def list_agent_eval_runs(
    db: Session,
    *,
    eval_id: int,
    limit: int = 25,
    offset: int = 0,
) -> list[AssistantAgentEvalRun]:
    _get_agent_eval_or_error(db, eval_id)
    stmt = (
        select(AssistantAgentEvalRun)
        .where(AssistantAgentEvalRun.eval_id == eval_id)
        .order_by(AssistantAgentEvalRun.completed_at.desc(), AssistantAgentEvalRun.id.desc())
        .offset(max(offset, 0))
        .limit(max(1, min(limit, 100)))
    )
    return list(db.scalars(stmt).all())


def latest_eval_runs_by_eval_id(
    db: Session,
    eval_ids: list[int],
) -> dict[int, AssistantAgentEvalRun]:
    if not eval_ids:
        return {}
    stmt = (
        select(AssistantAgentEvalRun)
        .where(AssistantAgentEvalRun.eval_id.in_(eval_ids))
        .order_by(
            AssistantAgentEvalRun.eval_id.asc(),
            AssistantAgentEvalRun.completed_at.desc(),
            AssistantAgentEvalRun.id.desc(),
        )
    )
    latest: dict[int, AssistantAgentEvalRun] = {}
    for record in db.scalars(stmt).all():
        latest.setdefault(record.eval_id, record)
    return latest
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


async def run_agent_eval(
    db: Session,
    *,
    eval_id: int,
    user: AssistantPromptUser,
    assistant_service: AssistantService,
) -> AssistantAgentEvalRun:
    record = _get_agent_eval_or_error(db, eval_id)
    return await _run_eval_record(db, record=record, user=user, assistant_service=assistant_service)


async def run_agent_eval_suite(
    db: Session,
    *,
    agent_id: str,
    user: AssistantPromptUser,
    assistant_service: AssistantService,
) -> list[AssistantAgentEvalRun]:
    agent = db.get(AssistantAgent, agent_id.strip().lower())
    if agent is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent not found")
    records = list_agent_evals(db, agent_id=agent.agent_id, limit=500)
    return [
        await _run_eval_record(db, record=record, user=user, assistant_service=assistant_service)
        for record in records
    ]


def to_agent_eval_out(
    record: AssistantAgentEval,
    *,
    latest_run: AssistantAgentEvalRun | None = None,
) -> AssistantAgentEvalOut:
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
        latest_run=to_agent_eval_run_out(latest_run) if latest_run is not None else None,
    )


def to_agent_eval_run_out(record: AssistantAgentEvalRun) -> AssistantAgentEvalRunOut:
    return AssistantAgentEvalRunOut(
        eval_run_id=record.id,
        eval_id=record.eval_id,
        agent_id=record.agent_id,
        run_id=record.run_id,
        status=record.status,
        failure_reasons=list(record.failure_reasons or []),
        observed_tool_names=list(record.observed_tool_names or []),
        observed_action_types=list(record.observed_action_types or []),
        response_message=record.response_message,
        started_at=record.started_at,
        completed_at=record.completed_at,
        run_by=record.run_by,
    )


async def _run_eval_record(
    db: Session,
    *,
    record: AssistantAgentEval,
    user: AssistantPromptUser,
    assistant_service: AssistantService,
) -> AssistantAgentEvalRun:
    started_at = datetime.now(timezone.utc)
    payload = AssistantPromptRequest(
        agent_id=record.agent_id,
        workspace=record.workspace,
        context=record.context,
        use_live_tools=record.use_live_tools,
        messages=[AssistantMessageIn(role="user", content=record.prompt)],
    )
    prepared = None
    run_id: int | None = None
    response_message: str | None = None
    observed_tool_names: list[str] = []
    observed_action_types: list[str] = []
    failure_reasons: list[str] = []
    status = "ERROR"

    try:
        prepared = prepare_assistant_execution(
            db=db,
            payload=payload,
            authorization_header=None,
            user=user,
            require_active_agent=False,
        )
        response, _ = await execute_assistant_execution(
            assistant_service=assistant_service,
            payload=payload,
            db=db,
            prepared=prepared,
        )
        run_id = response.run_id
        response_message = response.message.content
        observed_tool_names = [tool_call.tool_name for tool_call in response.tool_calls]
        observed_action_types = [action_request.action_type for action_request in response.action_requests]
        failure_reasons = _evaluate_response(
            record=record,
            response_message=response_message,
            observed_tool_names=observed_tool_names,
            observed_action_types=observed_action_types,
        )
        status = "FAIL" if failure_reasons else "PASS"
    except AssistantServiceError as exc:
        failure_reasons = [exc.detail]
        response_message = None
        if prepared is not None:
            record_failed_assistant_execution(
                payload=payload,
                db=db,
                prepared=prepared,
                detail=exc.detail,
            )

    completed_at = datetime.now(timezone.utc)
    run_record = AssistantAgentEvalRun(
        eval_id=record.id,
        agent_id=record.agent_id,
        run_id=run_id,
        status=status,
        failure_reasons=failure_reasons,
        observed_tool_names=observed_tool_names,
        observed_action_types=observed_action_types,
        response_message=response_message,
        started_at=started_at,
        completed_at=completed_at,
        run_by=user.user_id,
    )
    db.add(run_record)
    db.flush()
    _record_agent_eval_run_provenance(db, eval_record=record, run_record=run_record)
    db.commit()
    db.refresh(run_record)
    return run_record


def _evaluate_response(
    *,
    record: AssistantAgentEval,
    response_message: str,
    observed_tool_names: list[str],
    observed_action_types: list[str],
) -> list[str]:
    failure_reasons: list[str] = []
    response_lower = response_message.lower()
    for expected_substring in record.expected_substrings or []:
        if expected_substring.lower() not in response_lower:
            failure_reasons.append(f"Missing expected text: {expected_substring}")

    observed_tools = {tool_name.lower() for tool_name in observed_tool_names}
    for expected_tool_name in record.expected_tool_names or []:
        if expected_tool_name.lower() not in observed_tools:
            failure_reasons.append(f"Missing expected tool call: {expected_tool_name}")

    observed_actions = {action_type.lower() for action_type in observed_action_types}
    for expected_action_type in record.expected_action_types or []:
        if expected_action_type.lower() not in observed_actions:
            failure_reasons.append(f"Missing expected action request: {expected_action_type}")

    return failure_reasons


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


def _record_agent_eval_run_provenance(
    db: Session,
    *,
    eval_record: AssistantAgentEval,
    run_record: AssistantAgentEvalRun,
) -> None:
    record_mutation_provenance(
        db,
        operation_key="assistant_agent_eval.run",
        source_surface="admin.assistant.agent_evals",
        affected_records=[
            {
                "record_type": "assistant_agent_eval",
                "record_id": eval_record.id,
                "action": "run",
                "label": eval_record.name,
            },
            {
                "record_type": "assistant_agent_eval_run",
                "record_id": run_record.id,
                "action": run_record.status.lower(),
                "label": f"{eval_record.name}: {run_record.status}",
            },
        ],
        details={
            "eval_id": eval_record.id,
            "eval_run_id": run_record.id,
            "agent_id": eval_record.agent_id,
            "status": run_record.status,
            "failure_reason_count": len(run_record.failure_reasons or []),
            "run_id": run_record.run_id,
        },
    )
