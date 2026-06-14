from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.schemas.assistant import AssistantActionRequestOut

REVIEW_OUTCOME_APPROVED_WITH_CORRECTIONS = "APPROVED_WITH_CORRECTIONS"

__all__ = [
    "AssistantActionRequestAdminSummary",
    "AssistantActionRequestPage",
    "action_preview_status",
    "extract_action_review_context",
    "get_action_request",
    "list_action_request_page",
    "list_action_requests",
    "list_action_requests_for_run",
    "normalize_action_request_text",
    "to_action_request_out",
    "to_action_request_out_list",
]


@dataclass(frozen=True)
class AssistantActionRequestAdminSummary:
    total_count: int
    pending_count: int
    executed_count: int
    rejected_count: int
    failed_count: int
    correction_count: int
    avg_decision_seconds: float | None


@dataclass(frozen=True)
class AssistantActionRequestPage:
    records: list[AssistantActionRequest]
    total_count: int
    limit: int
    offset: int
    summary: AssistantActionRequestAdminSummary

    @property
    def has_more(self) -> bool:
        return self.offset + len(self.records) < self.total_count


def get_action_request(db: Session, action_request_id: int) -> AssistantActionRequest | None:
    return db.get(AssistantActionRequest, action_request_id)


def list_action_requests(
    db: Session,
    *,
    limit: int,
    offset: int,
    user_id: str | None = None,
    status: str | None = None,
) -> list[AssistantActionRequest]:
    return list_action_request_page(
        db,
        limit=limit,
        offset=offset,
        user_id=user_id,
        status=status,
    ).records


def list_action_request_page(
    db: Session,
    *,
    limit: int,
    offset: int,
    user_id: str | None = None,
    status: str | None = None,
    action_type: str | None = None,
    agent_id: str | None = None,
    role_key: str | None = None,
    profile_kind: str | None = None,
    requester_user_id: str | None = None,
    decided_by: str | None = None,
    search: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    decided_after: datetime | None = None,
    decided_before: datetime | None = None,
) -> AssistantActionRequestPage:
    items_stmt = _apply_action_request_filters(
        select(AssistantActionRequest),
        user_id=user_id,
        status=status,
        action_type=action_type,
        agent_id=agent_id,
        role_key=role_key,
        profile_kind=profile_kind,
        requester_user_id=requester_user_id,
        decided_by=decided_by,
        search=search,
        created_after=created_after,
        created_before=created_before,
        decided_after=decided_after,
        decided_before=decided_before,
    )
    records = db.execute(
        items_stmt.order_by(
            AssistantActionRequest.created_at.desc(),
            AssistantActionRequest.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    summary = _summarize_action_requests(
        db=db,
        user_id=user_id,
        status=status,
        action_type=action_type,
        agent_id=agent_id,
        role_key=role_key,
        profile_kind=profile_kind,
        requester_user_id=requester_user_id,
        decided_by=decided_by,
        search=search,
        created_after=created_after,
        created_before=created_before,
        decided_after=decided_after,
        decided_before=decided_before,
    )
    return AssistantActionRequestPage(
        records=records,
        total_count=summary.total_count,
        limit=limit,
        offset=offset,
        summary=summary,
    )


def list_action_requests_for_run(db: Session, run_id: int) -> list[AssistantActionRequest]:
    stmt = (
        select(AssistantActionRequest)
        .where(AssistantActionRequest.run_id == run_id)
        .order_by(AssistantActionRequest.id.asc())
    )
    return db.execute(stmt).scalars().all()


def to_action_request_out(record: AssistantActionRequest) -> AssistantActionRequestOut:
    payload = dict(record.payload or {})
    review_context = extract_action_review_context(payload)
    return AssistantActionRequestOut(
        action_request_id=record.id,
        run_id=record.run_id,
        user_id=record.user_id,
        status=record.status,
        workspace=record.workspace,
        agent_id=record.agent_id,
        agent_name=record.agent_name,
        action_type=record.action_type,
        summary=record.summary,
        description=record.description,
        payload=_strip_action_review_context(payload),
        review_context=review_context,
        lifecycle=_build_action_request_lifecycle(record, review_context),
        result=dict(record.result) if isinstance(record.result, dict) else record.result,
        error_detail=record.error_detail,
        review_outcome=record.review_outcome,
        decision_note=record.decision_note,
        correction_summary=record.correction_summary,
        correction_fields=list(record.correction_fields or []),
        created_at=record.created_at,
        decided_at=record.decided_at,
        decided_by=record.decided_by,
    )


def to_action_request_out_list(records: Iterable[AssistantActionRequest]) -> list[AssistantActionRequestOut]:
    return [to_action_request_out(record) for record in records]


def extract_action_review_context(payload: dict[str, object]) -> dict[str, object] | None:
    review_context = payload.get("review_context")
    if isinstance(review_context, dict):
        return review_context
    return None


def action_preview_status(review_context: dict[str, object] | None) -> str | None:
    if not review_context:
        return None
    action_preview = review_context.get("action_preview")
    if not isinstance(action_preview, dict):
        return None
    status = action_preview.get("status")
    if status is None:
        return None
    return str(status).strip().upper() or None


def normalize_action_request_text(
    value: str | None,
    *,
    lowercase: bool = False,
    uppercase: bool = False,
) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None
    if lowercase:
        return normalized.lower()
    if uppercase:
        return normalized.upper()
    return normalized


def _strip_action_review_context(payload: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in payload.items() if key != "review_context"}


def _build_action_request_lifecycle(
    record: AssistantActionRequest,
    review_context: dict[str, object] | None,
) -> dict[str, object]:
    status = str(record.status or "").strip().upper()
    review_risk_flags = _derive_review_risk_flags(review_context)
    preview_status = action_preview_status(review_context)
    preview_blocked = preview_status == "BLOCKED"

    if status == "PENDING":
        return {
            "stage": "AWAITING_REVIEW",
            "label": "Preview blocked" if preview_blocked else "Awaiting review",
            "tone": "danger" if preview_blocked else "attention",
            "is_terminal": False,
            "can_approve": not preview_blocked,
            "can_reject": True,
            "reviewer_action_label": (
                "Reject or restage with corrected input"
                if preview_blocked
                else "Review evidence, then approve or reject"
                if review_risk_flags
                else "Approve or reject"
            ),
            "decided_label": None,
            "review_risk_flags": review_risk_flags,
        }

    if status == "EXECUTED":
        return {
            "stage": "EXECUTED",
            "label": "Executed",
            "tone": "success",
            "is_terminal": True,
            "can_approve": False,
            "can_reject": False,
            "reviewer_action_label": None,
            "decided_label": _decision_label("Executed", record.decided_by),
            "review_risk_flags": review_risk_flags,
        }

    if status == "REJECTED":
        return {
            "stage": "REJECTED",
            "label": "Rejected",
            "tone": "neutral",
            "is_terminal": True,
            "can_approve": False,
            "can_reject": False,
            "reviewer_action_label": None,
            "decided_label": _decision_label("Rejected", record.decided_by),
            "review_risk_flags": review_risk_flags,
        }

    return {
        "stage": "FAILED",
        "label": "Failed",
        "tone": "danger",
        "is_terminal": True,
        "can_approve": False,
        "can_reject": False,
        "reviewer_action_label": None,
        "decided_label": _decision_label("Failed during execution", record.decided_by),
        "review_risk_flags": review_risk_flags,
    }


def _derive_review_risk_flags(review_context: dict[str, object] | None) -> list[str]:
    if not review_context:
        return []

    flags: list[str] = []
    missing_evidence = review_context.get("missing_evidence")
    if isinstance(missing_evidence, list) and len(missing_evidence) > 0:
        flags.append("MISSING_EVIDENCE")

    stale_state_basis = review_context.get("stale_state_basis")
    if isinstance(stale_state_basis, dict) and stale_state_basis:
        flags.append("STALE_STATE_RECHECK_REQUIRED")

    preview_status = action_preview_status(review_context)
    if preview_status == "READY":
        flags.append("DRY_RUN_PREVIEW_READY")
    elif preview_status == "BLOCKED":
        flags.append("DRY_RUN_PREVIEW_BLOCKED")

    execution_mode = str(review_context.get("execution_mode") or "").strip().upper()
    if execution_mode == "AUTONOMOUS":
        flags.append("AUTONOMOUS_EXECUTION")

    override_reason = review_context.get("delegated_ability_override_reason")
    if isinstance(override_reason, str) and override_reason.strip():
        flags.append("DELEGATED_ABILITY_OVERRIDE")

    return flags


def _decision_label(action: str, decided_by: str | None) -> str:
    if decided_by:
        return f"{action} by {decided_by}"
    return action


def _apply_action_request_filters(
    stmt,
    *,
    user_id: str | None = None,
    status: str | None = None,
    action_type: str | None = None,
    agent_id: str | None = None,
    role_key: str | None = None,
    profile_kind: str | None = None,
    requester_user_id: str | None = None,
    decided_by: str | None = None,
    search: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    decided_after: datetime | None = None,
    decided_before: datetime | None = None,
):
    normalized_status = normalize_action_request_text(status, uppercase=True)
    normalized_action_type = normalize_action_request_text(action_type)
    normalized_agent_id = normalize_action_request_text(agent_id, lowercase=True)
    normalized_role_key = normalize_action_request_text(role_key, lowercase=True)
    normalized_profile_kind = normalize_action_request_text(profile_kind, uppercase=True)
    normalized_requester_user_id = normalize_action_request_text(requester_user_id)
    normalized_decided_by = normalize_action_request_text(decided_by)
    normalized_search = normalize_action_request_text(search, lowercase=True)

    if normalized_role_key is not None or normalized_profile_kind is not None:
        stmt = stmt.join(AssistantRun, AssistantRun.id == AssistantActionRequest.run_id)
    if user_id is not None:
        stmt = stmt.where(AssistantActionRequest.user_id == user_id)
    if normalized_status is not None:
        stmt = stmt.where(AssistantActionRequest.status == normalized_status)
    if normalized_action_type is not None:
        stmt = stmt.where(AssistantActionRequest.action_type == normalized_action_type)
    if normalized_agent_id is not None:
        stmt = stmt.where(AssistantActionRequest.agent_id == normalized_agent_id)
    if normalized_role_key is not None:
        stmt = stmt.where(AssistantRun.agent_role_key == normalized_role_key)
    if normalized_profile_kind is not None:
        stmt = stmt.where(AssistantRun.agent_profile_kind == normalized_profile_kind)
    if normalized_requester_user_id is not None:
        stmt = stmt.where(AssistantActionRequest.user_id == normalized_requester_user_id)
    if normalized_decided_by is not None:
        stmt = stmt.where(AssistantActionRequest.decided_by == normalized_decided_by)
    if created_after is not None:
        stmt = stmt.where(AssistantActionRequest.created_at >= created_after)
    if created_before is not None:
        stmt = stmt.where(AssistantActionRequest.created_at <= created_before)
    if decided_after is not None:
        stmt = stmt.where(AssistantActionRequest.decided_at.is_not(None))
        stmt = stmt.where(AssistantActionRequest.decided_at >= decided_after)
    if decided_before is not None:
        stmt = stmt.where(AssistantActionRequest.decided_at.is_not(None))
        stmt = stmt.where(AssistantActionRequest.decided_at <= decided_before)
    if normalized_search is not None:
        search_pattern = f"%{normalized_search}%"
        stmt = stmt.where(
            or_(
                func.lower(AssistantActionRequest.summary).like(search_pattern),
                func.lower(AssistantActionRequest.description).like(search_pattern),
                func.lower(AssistantActionRequest.user_id).like(search_pattern),
                func.lower(func.coalesce(AssistantActionRequest.agent_name, "")).like(search_pattern),
                func.lower(func.coalesce(AssistantActionRequest.decided_by, "")).like(search_pattern),
                func.lower(AssistantActionRequest.action_type).like(search_pattern),
            )
        )
    return stmt


def _summarize_action_requests(
    *,
    db: Session,
    user_id: str | None,
    status: str | None,
    action_type: str | None,
    agent_id: str | None,
    role_key: str | None,
    profile_kind: str | None,
    requester_user_id: str | None,
    decided_by: str | None,
    search: str | None,
    created_after: datetime | None,
    created_before: datetime | None,
    decided_after: datetime | None,
    decided_before: datetime | None,
) -> AssistantActionRequestAdminSummary:
    summary_subquery = _apply_action_request_filters(
        select(
            AssistantActionRequest.status.label("status"),
            AssistantActionRequest.review_outcome.label("review_outcome"),
            AssistantActionRequest.created_at.label("created_at"),
            AssistantActionRequest.decided_at.label("decided_at"),
        ),
        user_id=user_id,
        status=status,
        action_type=action_type,
        agent_id=agent_id,
        role_key=role_key,
        profile_kind=profile_kind,
        requester_user_id=requester_user_id,
        decided_by=decided_by,
        search=search,
        created_after=created_after,
        created_before=created_before,
        decided_after=decided_after,
        decided_before=decided_before,
    ).subquery()

    total_count = int(db.execute(select(func.count()).select_from(summary_subquery)).scalar_one())
    status_counts = {
        "PENDING": 0,
        "EXECUTED": 0,
        "REJECTED": 0,
        "FAILED": 0,
    }
    for row_status, row_count in db.execute(
        select(summary_subquery.c.status, func.count()).group_by(summary_subquery.c.status)
    ).all():
        if row_status in status_counts:
            status_counts[str(row_status)] = int(row_count)

    correction_count = int(
        db.execute(
            select(func.count())
            .select_from(summary_subquery)
            .where(summary_subquery.c.review_outcome == REVIEW_OUTCOME_APPROVED_WITH_CORRECTIONS)
        ).scalar_one()
    )

    latency_rows = db.execute(
        select(summary_subquery.c.created_at, summary_subquery.c.decided_at).where(
            summary_subquery.c.decided_at.is_not(None)
        )
    ).all()
    avg_decision_seconds: float | None = None
    if latency_rows:
        total_decision_seconds = sum(
            max((decided_at - created_at).total_seconds(), 0.0)
            for created_at, decided_at in latency_rows
            if created_at is not None and decided_at is not None
        )
        avg_decision_seconds = total_decision_seconds / len(latency_rows)

    return AssistantActionRequestAdminSummary(
        total_count=total_count,
        pending_count=status_counts["PENDING"],
        executed_count=status_counts["EXECUTED"],
        rejected_count=status_counts["REJECTED"],
        failed_count=status_counts["FAILED"],
        correction_count=correction_count,
        avg_decision_seconds=avg_decision_seconds,
    )
