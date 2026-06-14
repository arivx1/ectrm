from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.prompt_context import AssistantPromptUser
from apps.api.app.models.assistant_prompt_navigation_outcome import AssistantPromptNavigationOutcome
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.schemas.assistant import (
    AssistantPromptNavigationOutcomeCreate,
    AssistantPromptNavigationOutcomeOut,
)


def upsert_assistant_prompt_navigation_outcome(
    db: Session,
    *,
    run: AssistantRun,
    user: AssistantPromptUser,
    payload: AssistantPromptNavigationOutcomeCreate,
) -> AssistantPromptNavigationOutcome:
    now = datetime.now(timezone.utc)
    record = db.execute(
        select(AssistantPromptNavigationOutcome).where(
            AssistantPromptNavigationOutcome.run_id == run.id,
            AssistantPromptNavigationOutcome.user_id == user.user_id,
            AssistantPromptNavigationOutcome.outcome == payload.outcome,
            AssistantPromptNavigationOutcome.intent_key == payload.intent_key,
        )
    ).scalars().first()

    if record is None:
        record = AssistantPromptNavigationOutcome(
            run_id=run.id,
            conversation_id=run.conversation_id,
            user_id=user.user_id,
            session_id=user.session_id,
            user_role=user.role,
            surface=payload.surface,
            outcome=payload.outcome,
            intent_key=payload.intent_key,
            target_view=payload.target_view,
            target_label=payload.target_label,
            target_rationale=payload.target_rationale,
            focus_type=payload.focus_type,
            focus_id=payload.focus_id,
            focus_label=payload.focus_label,
            detail=payload.detail,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
    else:
        record.conversation_id = run.conversation_id
        record.session_id = user.session_id
        record.user_role = user.role
        record.surface = payload.surface
        record.target_view = payload.target_view
        record.target_label = payload.target_label
        record.target_rationale = payload.target_rationale
        record.focus_type = payload.focus_type
        record.focus_id = payload.focus_id
        record.focus_label = payload.focus_label
        record.detail = payload.detail
        record.updated_at = now

    db.commit()
    db.refresh(record)
    return record


def create_prompt_home_navigation_outcome(
    db: Session,
    *,
    user: AssistantPromptUser,
    payload: AssistantPromptNavigationOutcomeCreate,
) -> AssistantPromptNavigationOutcome:
    now = datetime.now(timezone.utc)
    record = AssistantPromptNavigationOutcome(
        run_id=None,
        conversation_id=None,
        user_id=user.user_id,
        session_id=user.session_id,
        user_role=user.role,
        surface=payload.surface,
        outcome=payload.outcome,
        intent_key=payload.intent_key,
        target_view=payload.target_view,
        target_label=payload.target_label,
        target_rationale=payload.target_rationale,
        focus_type=payload.focus_type,
        focus_id=payload.focus_id,
        focus_label=payload.focus_label,
        detail=payload.detail,
        created_at=now,
        updated_at=now,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def to_assistant_prompt_navigation_outcome_out(
    record: AssistantPromptNavigationOutcome,
) -> AssistantPromptNavigationOutcomeOut:
    return AssistantPromptNavigationOutcomeOut(
        outcome_id=record.id,
        run_id=record.run_id,
        conversation_id=record.conversation_id,
        user_id=record.user_id,
        user_role=record.user_role,
        surface=record.surface,
        outcome=record.outcome,
        intent_key=record.intent_key,
        target_view=record.target_view,
        target_label=record.target_label,
        target_rationale=record.target_rationale,
        focus_type=record.focus_type,
        focus_id=record.focus_id,
        focus_label=record.focus_label,
        detail=record.detail,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
