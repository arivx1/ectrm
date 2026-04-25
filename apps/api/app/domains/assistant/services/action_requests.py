from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence

from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_request_admin import (
    AssistantActionRequestAdminSummary,
    AssistantActionRequestPage,
    get_action_request,
    list_action_request_page,
    list_action_requests,
    list_action_requests_for_run,
    to_action_request_out,
    to_action_request_out_list,
)
from apps.api.app.domains.assistant.services.action_request_review import (
    AssistantActionDecision,
    approve_action_request,
    reject_action_request,
)
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.domains.assistant.services.action_specs import AssistantActionProposal

__all__ = [
    "AssistantActionDecision",
    "AssistantActionRequestAdminSummary",
    "AssistantActionRequestPage",
    "approve_action_request",
    "create_action_requests",
    "get_action_request",
    "list_action_request_page",
    "list_action_requests",
    "list_action_requests_for_run",
    "reject_action_request",
    "to_action_request_out",
    "to_action_request_out_list",
]


def create_action_requests(
    *,
    db: Session,
    run_id: int,
    user_id: str,
    session_id: str,
    workspace: str | None,
    agent_id: str | None,
    agent_name: str | None,
    proposals: Sequence[AssistantActionProposal],
) -> list[AssistantActionRequest]:
    created_at = datetime.now(timezone.utc)
    records = [
        AssistantActionRequest(
            run_id=run_id,
            status="PENDING",
            user_id=user_id,
            session_id=session_id,
            workspace=workspace,
            agent_id=agent_id,
            agent_name=agent_name,
            action_type=proposal.action_type,
            summary=proposal.summary,
            description=proposal.description,
            payload=proposal.payload,
            result=None,
            error_detail=None,
            created_at=created_at,
            decided_at=None,
            decided_by=None,
        )
        for proposal in proposals
    ]
    if not records:
        return []

    db.add_all(records)
    db.commit()
    for record in records:
        db.refresh(record)
    return records
