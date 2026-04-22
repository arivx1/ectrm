from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.prompt_context import AssistantPromptUser
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.assistant_run_feedback import AssistantRunFeedback
from apps.api.app.schemas.assistant import AssistantRunFeedbackCreate, AssistantRunFeedbackOut


def upsert_assistant_run_feedback(
    db: Session,
    *,
    run: AssistantRun,
    user: AssistantPromptUser,
    payload: AssistantRunFeedbackCreate,
) -> AssistantRunFeedback:
    now = datetime.now(timezone.utc)
    record = db.execute(
        select(AssistantRunFeedback).where(
            AssistantRunFeedback.run_id == run.id,
            AssistantRunFeedback.user_id == user.user_id,
        )
    ).scalars().first()

    if record is None:
        record = AssistantRunFeedback(
            run_id=run.id,
            conversation_id=run.conversation_id,
            user_id=user.user_id,
            session_id=user.session_id,
            user_role=user.role,
            rating=payload.rating,
            comment=payload.comment,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
    else:
        record.conversation_id = run.conversation_id
        record.session_id = user.session_id
        record.user_role = user.role
        record.rating = payload.rating
        record.comment = payload.comment
        record.updated_at = now

    db.commit()
    db.refresh(record)
    return record


def list_feedback_for_runs_by_user(
    db: Session,
    *,
    run_ids: Iterable[int],
    user_id: str,
) -> dict[int, AssistantRunFeedback]:
    normalized_run_ids = tuple({run_id for run_id in run_ids if run_id is not None})
    if not normalized_run_ids:
        return {}

    records = db.execute(
        select(AssistantRunFeedback)
        .where(
            AssistantRunFeedback.run_id.in_(normalized_run_ids),
            AssistantRunFeedback.user_id == user_id,
        )
        .order_by(
            AssistantRunFeedback.run_id.asc(),
            AssistantRunFeedback.updated_at.desc(),
            AssistantRunFeedback.id.desc(),
        )
    ).scalars().all()

    feedback_by_run: dict[int, AssistantRunFeedback] = {}
    for record in records:
        feedback_by_run.setdefault(record.run_id, record)
    return feedback_by_run


def to_assistant_run_feedback_out(record: AssistantRunFeedback) -> AssistantRunFeedbackOut:
    return AssistantRunFeedbackOut(
        feedback_id=record.id,
        run_id=record.run_id,
        conversation_id=record.conversation_id,
        user_id=record.user_id,
        user_role=record.user_role,
        rating=record.rating,
        comment=record.comment,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
