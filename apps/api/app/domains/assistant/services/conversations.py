from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from apps.api.app.models.assistant_conversation import AssistantConversation
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.schemas.assistant import (
    AssistantConversationMessageOut,
    AssistantConversationOut,
    AssistantConversationSummaryOut,
    AssistantToolCallOut,
)


def add_assistant_conversation(
    *,
    db: Session,
    user_id: str,
    session_id: str,
    user_role: str,
    workspace: str | None,
    agent_id: str | None,
    agent_name: str | None,
    provider: str,
    model: str,
    use_live_tools: bool,
    title: str,
) -> AssistantConversation:
    record = _build_assistant_conversation(
        user_id=user_id,
        session_id=session_id,
        user_role=user_role,
        workspace=workspace,
        agent_id=agent_id,
        agent_name=agent_name,
        provider=provider,
        model=model,
        use_live_tools=use_live_tools,
        title=title,
    )
    db.add(record)
    db.flush()
    return record


def create_assistant_conversation(
    *,
    db: Session,
    user_id: str,
    session_id: str,
    user_role: str,
    workspace: str | None,
    agent_id: str | None,
    agent_name: str | None,
    provider: str,
    model: str,
    use_live_tools: bool,
    title: str,
) -> AssistantConversation:
    record = _build_assistant_conversation(
        user_id=user_id,
        session_id=session_id,
        user_role=user_role,
        workspace=workspace,
        agent_id=agent_id,
        agent_name=agent_name,
        provider=provider,
        model=model,
        use_live_tools=use_live_tools,
        title=title,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_assistant_conversations(
    db: Session,
    *,
    limit: int,
    offset: int,
    user_id: str | None = None,
) -> list[AssistantConversation]:
    stmt = (
        select(AssistantConversation)
        .where(AssistantConversation.run_count > 0)
        .order_by(AssistantConversation.updated_at.desc(), AssistantConversation.id.desc())
        .limit(limit)
        .offset(offset)
    )
    if user_id is not None:
        stmt = stmt.where(AssistantConversation.user_id == user_id)
    return db.execute(stmt).scalars().all()


def get_assistant_conversation(db: Session, conversation_id: int) -> AssistantConversation | None:
    return db.get(AssistantConversation, conversation_id)


def list_runs_for_conversation(
    db: Session,
    conversation_id: int,
) -> list[AssistantRun]:
    stmt = (
        select(AssistantRun)
        .where(AssistantRun.conversation_id == conversation_id)
        .order_by(AssistantRun.created_at.asc(), AssistantRun.id.asc())
    )
    return db.execute(stmt).scalars().all()


def update_assistant_conversation_after_run(
    *,
    db: Session,
    record: AssistantConversation,
    run_record: AssistantRun,
    workspace: str | None,
    agent_id: str | None,
    agent_name: str | None,
    provider: str,
    model: str,
    use_live_tools: bool,
    latest_user_message: str | None,
    latest_assistant_message: str | None,
) -> AssistantConversation:
    record = apply_assistant_conversation_after_run(
        db=db,
        record=record,
        run_record=run_record,
        workspace=workspace,
        agent_id=agent_id,
        agent_name=agent_name,
        provider=provider,
        model=model,
        use_live_tools=use_live_tools,
        latest_user_message=latest_user_message,
        latest_assistant_message=latest_assistant_message,
    )
    db.commit()
    db.refresh(record)
    return record


def apply_assistant_conversation_after_run(
    *,
    db: Session,
    record: AssistantConversation,
    run_record: AssistantRun,
    workspace: str | None,
    agent_id: str | None,
    agent_name: str | None,
    provider: str,
    model: str,
    use_live_tools: bool,
    latest_user_message: str | None,
    latest_assistant_message: str | None,
) -> AssistantConversation:
    persistent_record = record
    if not inspect(record).persistent:
        persistent_record = db.get(AssistantConversation, record.id)
        if persistent_record is None:
            raise ValueError(f"Assistant conversation {record.id} was not found for update.")

    record = persistent_record
    record.workspace = workspace
    record.agent_id = agent_id
    record.agent_name = agent_name
    record.provider = provider
    record.model = model
    record.use_live_tools = use_live_tools
    record.latest_run_id = run_record.id
    record.run_count += 1
    record.latest_user_message = latest_user_message
    record.latest_assistant_message = latest_assistant_message
    if record.run_count == 1 and latest_user_message:
        record.title = _normalize_conversation_title(latest_user_message)
    record.updated_at = datetime.now(timezone.utc)
    return record


def to_assistant_conversation_summary_out(
    record: AssistantConversation,
) -> AssistantConversationSummaryOut:
    return AssistantConversationSummaryOut(
        conversation_id=record.id,
        created_at=record.created_at,
        updated_at=record.updated_at,
        user_id=record.user_id,
        user_role=record.user_role,
        workspace=record.workspace,
        agent_id=record.agent_id,
        agent_name=record.agent_name,
        provider=record.provider,
        model=record.model,
        use_live_tools=record.use_live_tools,
        title=record.title,
        run_count=record.run_count,
        latest_run_id=record.latest_run_id,
        latest_user_message=record.latest_user_message,
        latest_assistant_message=record.latest_assistant_message,
    )


def to_assistant_conversation_out(
    db: Session,
    record: AssistantConversation,
) -> AssistantConversationOut:
    return AssistantConversationOut(
        **to_assistant_conversation_summary_out(record).model_dump(),
        messages=build_assistant_conversation_messages(db, record.id),
    )


def build_assistant_conversation_messages(
    db: Session,
    conversation_id: int,
) -> list[AssistantConversationMessageOut]:
    runs = list_runs_for_conversation(db, conversation_id)
    messages: list[AssistantConversationMessageOut] = []

    for run in runs:
        if run.latest_user_message:
            messages.append(
                AssistantConversationMessageOut(
                    role="user",
                    content=run.latest_user_message,
                    recorded_at=run.created_at,
                    run_id=run.id,
                )
            )

        assistant_content = run.assistant_message or run.error_detail
        if assistant_content:
            messages.append(
                AssistantConversationMessageOut(
                    role="assistant",
                    content=assistant_content,
                    recorded_at=run.completed_at,
                    run_id=run.id,
                    provider=run.provider,
                    model=run.model,
                    warnings=list(run.warnings or []),
                    tool_calls=[
                        AssistantToolCallOut.model_validate(tool_call)
                        for tool_call in (run.tool_calls or [])
                    ],
                )
            )

    return messages


def _normalize_conversation_title(value: str) -> str:
    collapsed = " ".join(value.split()).strip() or "Untitled conversation"
    if len(collapsed) <= 160:
        return collapsed
    return f"{collapsed[:157].rstrip()}..."


def _build_assistant_conversation(
    *,
    user_id: str,
    session_id: str,
    user_role: str,
    workspace: str | None,
    agent_id: str | None,
    agent_name: str | None,
    provider: str,
    model: str,
    use_live_tools: bool,
    title: str,
) -> AssistantConversation:
    now = datetime.now(timezone.utc)
    return AssistantConversation(
        user_id=user_id,
        session_id=session_id,
        user_role=user_role,
        workspace=workspace,
        agent_id=agent_id,
        agent_name=agent_name,
        provider=provider,
        model=model,
        use_live_tools=use_live_tools,
        title=_normalize_conversation_title(title),
        run_count=0,
        latest_run_id=None,
        latest_user_message=None,
        latest_assistant_message=None,
        created_at=now,
        updated_at=now,
    )
