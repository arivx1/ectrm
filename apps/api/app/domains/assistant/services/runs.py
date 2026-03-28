from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.schemas.assistant import (
    AssistantMessageIn,
    AssistantPromptResponse,
    AssistantPromptSectionOut,
    AssistantRunOut,
    AssistantRunSummaryOut,
    AssistantToolCallOut,
)


def create_assistant_run(
    *,
    db: Session,
    conversation_id: int | None,
    status: str,
    user_id: str,
    session_id: str,
    user_role: str,
    workspace: str | None,
    agent_id: str | None,
    agent_name: str | None,
    provider: str,
    model: str,
    use_live_tools: bool,
    request_messages: Sequence[AssistantMessageIn],
    application_context: str | None,
    prompt_sections: Iterable[AssistantPromptSectionOut],
    rendered_system_prompt: str,
    warnings: Sequence[str],
    tool_calls: Sequence[AssistantToolCallOut],
    input_tokens: int | None,
    output_tokens: int | None,
    assistant_message: str | None,
    error_detail: str | None = None,
) -> AssistantRun:
    completed_at = datetime.now(timezone.utc)
    record = AssistantRun(
        conversation_id=conversation_id,
        status=status,
        user_id=user_id,
        session_id=session_id,
        user_role=user_role,
        workspace=workspace,
        agent_id=agent_id,
        agent_name=agent_name,
        provider=provider,
        model=model,
        use_live_tools=use_live_tools,
        request_messages=[message.model_dump(mode="json") for message in request_messages],
        application_context=application_context,
        prompt_sections=[
            section.model_dump(mode="json")
            if isinstance(section, AssistantPromptSectionOut)
            else AssistantPromptSectionOut.model_validate(section).model_dump(mode="json")
            for section in prompt_sections
        ],
        rendered_system_prompt=rendered_system_prompt,
        warnings=list(warnings),
        tool_calls=[
            tool_call.model_dump(mode="json")
            if isinstance(tool_call, AssistantToolCallOut)
            else AssistantToolCallOut.model_validate(tool_call).model_dump(mode="json")
            for tool_call in tool_calls
        ],
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latest_user_message=_latest_user_message(request_messages),
        assistant_message=assistant_message,
        error_detail=error_detail,
        created_at=completed_at,
        completed_at=completed_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_assistant_runs(
    db: Session,
    *,
    limit: int,
    offset: int,
    user_id: str | None = None,
) -> list[AssistantRun]:
    stmt = select(AssistantRun).order_by(AssistantRun.created_at.desc()).limit(limit).offset(offset)
    if user_id is not None:
        stmt = stmt.where(AssistantRun.user_id == user_id)
    return db.execute(stmt).scalars().all()


def get_assistant_run(db: Session, run_id: int) -> AssistantRun | None:
    return db.get(AssistantRun, run_id)


def to_assistant_run_summary_out(record: AssistantRun) -> AssistantRunSummaryOut:
    return AssistantRunSummaryOut(
        conversation_id=record.conversation_id,
        run_id=record.id,
        status=record.status,
        created_at=record.created_at,
        completed_at=record.completed_at,
        user_id=record.user_id,
        user_role=record.user_role,
        workspace=record.workspace,
        agent_id=record.agent_id,
        agent_name=record.agent_name,
        provider=record.provider,
        model=record.model,
        use_live_tools=record.use_live_tools,
        warning_count=len(record.warnings or []),
        tool_call_count=len(record.tool_calls or []),
        input_tokens=record.input_tokens,
        output_tokens=record.output_tokens,
        latest_user_message=record.latest_user_message,
        assistant_message=record.assistant_message,
        error_detail=record.error_detail,
    )


def to_assistant_run_out(record: AssistantRun) -> AssistantRunOut:
    return AssistantRunOut(
        **to_assistant_run_summary_out(record).model_dump(),
        request_messages=[
            AssistantMessageIn.model_validate(message)
            for message in (record.request_messages or [])
        ],
        application_context=record.application_context,
        prompt_sections=[
            AssistantPromptSectionOut.model_validate(section)
            for section in (record.prompt_sections or [])
        ],
        rendered_system_prompt=record.rendered_system_prompt,
        warnings=list(record.warnings or []),
        tool_calls=[
            AssistantToolCallOut.model_validate(tool_call)
            for tool_call in (record.tool_calls or [])
        ],
    )


def attach_run_metadata(
    response: AssistantPromptResponse,
    record: AssistantRun,
) -> AssistantPromptResponse:
    response.run_id = record.id
    response.run_recorded_at = record.completed_at
    return response


def _latest_user_message(messages: Sequence[AssistantMessageIn]) -> str | None:
    for message in reversed(messages):
        if message.role == "user":
            return message.content
    return None
