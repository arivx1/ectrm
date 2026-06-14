from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_handlers import (
    AssistantActionRequestError,
    canonical_action_stale_state_value,
)
from apps.api.app.domains.assistant.services.action_registry import ACTION_SPECS
from apps.api.app.domains.assistant.services.action_request_admin import (
    action_preview_status,
    extract_action_review_context,
    normalize_action_request_text,
)
from apps.api.app.domains.assistant.services.action_specs import (
    AssistantActionExecutionContext,
    AssistantActionSpec,
)
from apps.api.app.domains.assistant.services.policies import evaluate_action_policy
from apps.api.app.domains.assistant.services.registry import get_agent_record, to_managed_agent
from apps.api.app.models.assistant_action_request import AssistantActionRequest

REVIEW_OUTCOME_APPROVED_AS_IS = "APPROVED_AS_IS"
REVIEW_OUTCOME_APPROVED_WITH_CORRECTIONS = "APPROVED_WITH_CORRECTIONS"
REVIEW_OUTCOME_REJECTED = "REJECTED"

__all__ = [
    "AssistantActionDecision",
    "approve_action_request",
    "reject_action_request",
]


@dataclass(frozen=True)
class AssistantActionDecision:
    review_outcome: str | None = None
    decision_note: str | None = None
    correction_summary: str | None = None
    correction_fields: tuple[str, ...] = ()


def reject_action_request(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    decision: AssistantActionDecision | None = None,
) -> AssistantActionRequest:
    if record.status != "PENDING":
        raise AssistantActionRequestError("Only pending assistant action requests can be rejected.")

    decision_metadata = _normalize_action_decision(
        decision,
        default_review_outcome=REVIEW_OUTCOME_REJECTED,
        allowed_review_outcomes=(REVIEW_OUTCOME_REJECTED,),
    )
    record.status = "REJECTED"
    record.decided_at = datetime.now(timezone.utc)
    record.decided_by = actor_id
    _apply_action_decision(record, decision_metadata)
    record.error_detail = None
    db.commit()
    db.refresh(record)
    return record


def approve_action_request(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    actor_role: str | None = None,
    decision: AssistantActionDecision | None = None,
) -> AssistantActionRequest:
    if record.status != "PENDING":
        raise AssistantActionRequestError("Only pending assistant action requests can be approved.")

    decision_metadata = _normalize_action_decision(
        decision,
        default_review_outcome=REVIEW_OUTCOME_APPROVED_AS_IS,
        allowed_review_outcomes=(REVIEW_OUTCOME_APPROVED_AS_IS, REVIEW_OUTCOME_APPROVED_WITH_CORRECTIONS),
    )
    policy_decision = _evaluate_stored_action_policy(
        db=db,
        record=record,
        actor_role=actor_role,
    )
    if not policy_decision.allowed:
        raise AssistantActionRequestError(policy_decision.reason)

    decided_at = datetime.now(timezone.utc)

    try:
        approval_policy = _validate_approval_contract(db=db, record=record)
        result = _execute_action(
            db=db,
            record=record,
            actor_id=actor_id,
            actor_role=actor_role,
            decided_at=decided_at,
        )
    except AssistantActionRequestError as exc:
        return _mark_action_request_failed(
            db=db,
            record_id=record.id,
            actor_id=actor_id,
            decided_at=decided_at,
            error_detail=exc.detail,
            decision=decision_metadata,
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        return _mark_action_request_failed(
            db=db,
            record_id=record.id,
            actor_id=actor_id,
            decided_at=decided_at,
            error_detail=str(exc) or "Assistant action execution failed unexpectedly.",
            decision=decision_metadata,
        )

    result["approval_policy"] = approval_policy
    record.status = "EXECUTED"
    record.decided_at = decided_at
    record.decided_by = actor_id
    _apply_action_decision(record, decision_metadata)
    record.result = result
    record.error_detail = None
    db.commit()
    db.refresh(record)
    return record


def _normalize_action_decision(
    decision: AssistantActionDecision | None,
    *,
    default_review_outcome: str,
    allowed_review_outcomes: tuple[str, ...],
) -> AssistantActionDecision:
    review_outcome = normalize_action_request_text(decision.review_outcome if decision is not None else None)
    normalized_outcome = (review_outcome or default_review_outcome).upper()
    if normalized_outcome not in allowed_review_outcomes:
        allowed = ", ".join(allowed_review_outcomes)
        raise AssistantActionRequestError(f"Review outcome must be one of: {allowed}.")

    decision_note = normalize_action_request_text(decision.decision_note if decision is not None else None)
    correction_summary = normalize_action_request_text(
        decision.correction_summary if decision is not None else None
    )
    correction_fields = _normalize_correction_fields(decision.correction_fields if decision is not None else ())

    if normalized_outcome == REVIEW_OUTCOME_APPROVED_WITH_CORRECTIONS:
        if correction_summary is None and not correction_fields:
            raise AssistantActionRequestError(
                "Approvals with corrections require a correction summary or at least one corrected field."
            )
    else:
        correction_summary = None
        correction_fields = ()

    return AssistantActionDecision(
        review_outcome=normalized_outcome,
        decision_note=decision_note,
        correction_summary=correction_summary,
        correction_fields=correction_fields,
    )


def _normalize_correction_fields(values: Sequence[str]) -> tuple[str, ...]:
    fields: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = normalize_action_request_text(value)
        if normalized is None or normalized in seen:
            continue
        fields.append(normalized)
        seen.add(normalized)
    return tuple(fields)


def _apply_action_decision(
    record: AssistantActionRequest,
    decision: AssistantActionDecision,
) -> None:
    record.review_outcome = decision.review_outcome
    record.decision_note = decision.decision_note
    record.correction_summary = decision.correction_summary
    record.correction_fields = list(decision.correction_fields) if decision.correction_fields else None


def _evaluate_stored_action_policy(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_role: str | None,
):
    agent_definition = None
    review_context = extract_action_review_context(dict(record.payload or {}))
    override_reason = (
        str(review_context.get("delegated_ability_override_reason")).strip()
        if isinstance(review_context, dict) and review_context.get("delegated_ability_override_reason") is not None
        else None
    )
    if record.agent_id:
        agent_record = get_agent_record(db, record.agent_id)
        if agent_record is not None:
            agent_definition = to_managed_agent(agent_record)
    return evaluate_action_policy(
        agent=agent_definition,
        action_type=record.action_type,
        workspace=record.workspace,
        actor_role=actor_role,
        phase="execute",
        override_reason=override_reason,
    )


def _execute_action(
    *,
    db: Session,
    record: AssistantActionRequest,
    actor_id: str,
    actor_role: str | None,
    decided_at: datetime,
) -> dict[str, object]:
    return _action_spec_for(record).execute(
        AssistantActionExecutionContext(
            db=db,
            record=record,
            actor_id=actor_id,
            actor_role=actor_role,
            decided_at=decided_at,
        )
    )


def _validate_approval_contract(
    *,
    db: Session,
    record: AssistantActionRequest,
) -> dict[str, object]:
    payload = dict(record.payload or {})
    review_context = extract_action_review_context(payload)
    if review_context is None:
        raise AssistantActionRequestError(
            "Assistant action approval requires review_context with reviewer, stale-state, and idempotency evidence."
        )

    stale_state_basis = review_context.get("stale_state_basis")
    if not isinstance(stale_state_basis, dict) or not stale_state_basis:
        raise AssistantActionRequestError(
            "Assistant action approval requires review_context.stale_state_basis before execution."
        )

    idempotency_key = _review_context_text_value(review_context, "idempotency_key")
    if idempotency_key is None:
        raise AssistantActionRequestError(
            "Assistant action approval requires review_context.idempotency_key before execution."
        )

    preview_check = _validate_action_preview_contract(record=record, review_context=review_context)
    preview_approval_checks = preview_check.pop("approval_checks", [])

    duplicate_record = _find_executed_action_request_by_idempotency_key(
        db=db,
        idempotency_key=idempotency_key,
        exclude_record_id=record.id,
    )
    if duplicate_record is not None:
        raise AssistantActionRequestError(
            "Assistant action approval blocked because idempotency key "
            f"'{idempotency_key}' already executed on action request {duplicate_record.id}."
        )

    stale_state_recheck = _recheck_stale_state(db=db, record=record, review_context=review_context)

    return {
        "status": "PASSED",
        "idempotency_key": idempotency_key,
        "checks": [
            "review_context_present",
            "idempotency_key_unique",
            *preview_approval_checks,
            "stale_state_rechecked",
        ],
        **preview_check,
        **stale_state_recheck,
    }


def _validate_action_preview_contract(
    *,
    record: AssistantActionRequest,
    review_context: dict[str, object],
) -> dict[str, object]:
    action_spec = _action_spec_for(record)
    if not action_spec.requires_ready_preview:
        return {"approval_checks": []}

    action_preview = review_context.get("action_preview")
    if not isinstance(action_preview, dict):
        raise AssistantActionRequestError(
            f"Assistant action approval requires a ready {record.action_type} preview before execution."
        )

    preview_status = action_preview_status(review_context)
    if preview_status != "READY":
        blocking_reasons = action_preview.get("blocking_reasons")
        reason_text = ""
        if isinstance(blocking_reasons, list) and blocking_reasons:
            reason_text = " " + "; ".join(str(reason) for reason in blocking_reasons)
        raise AssistantActionRequestError(
            f"Assistant action approval blocked because the {record.action_type} preview is not ready."
            + reason_text
        )

    return {
        "approval_checks": ["action_preview_ready"],
        "action_preview_status": preview_status,
    }


def _review_context_text_value(review_context: dict[str, object], key: str) -> str | None:
    value = review_context.get(key)
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _find_executed_action_request_by_idempotency_key(
    *,
    db: Session,
    idempotency_key: str,
    exclude_record_id: int,
) -> AssistantActionRequest | None:
    records = db.execute(
        select(AssistantActionRequest)
        .where(AssistantActionRequest.status == "EXECUTED")
        .where(AssistantActionRequest.id != exclude_record_id)
    ).scalars().all()
    for candidate in records:
        candidate_context = extract_action_review_context(dict(candidate.payload or {}))
        if candidate_context is None:
            continue
        if _review_context_text_value(candidate_context, "idempotency_key") == idempotency_key:
            return candidate
    return None


def _recheck_stale_state(
    *,
    db: Session,
    record: AssistantActionRequest,
    review_context: dict[str, object],
) -> dict[str, object]:
    raw_basis = review_context.get("stale_state_basis")
    stale_state_basis = raw_basis if isinstance(raw_basis, dict) else {}
    current_state = _current_stale_state_for_action(db=db, record=record)
    mismatches = [
        _format_stale_state_mismatch(key, expected_value, current_state)
        for key, expected_value in stale_state_basis.items()
        if _canonical_stale_state_value(expected_value)
        != _canonical_stale_state_value(current_state.get(key, _MISSING_STALE_STATE_VALUE))
    ]
    if mismatches:
        if _action_payload_is_idempotent_retry(db=db, record=record):
            return {
                "stale_state_basis": jsonable_encoder(stale_state_basis),
                "stale_state_current": jsonable_encoder(current_state),
                "stale_state_mismatches": mismatches,
                "idempotent_retry_rechecked": True,
            }
        raise AssistantActionRequestError(
            "Assistant action approval blocked because the staged review context is stale; "
            "the object changed since this action was staged: "
            + "; ".join(mismatches)
        )

    return {
        "stale_state_basis": jsonable_encoder(stale_state_basis),
        "stale_state_current": jsonable_encoder(current_state),
        "stale_state_mismatches": [],
    }


_MISSING_STALE_STATE_VALUE = object()


def _format_stale_state_mismatch(
    key: str,
    expected_value: object,
    current_state: dict[str, object | None],
) -> str:
    current_value = current_state.get(key, _MISSING_STALE_STATE_VALUE)
    if current_value is _MISSING_STALE_STATE_VALUE:
        return f"{key} expected {_format_stale_state_value(expected_value)} but is no longer available"
    return (
        f"{key} expected {_format_stale_state_value(expected_value)} "
        f"but found {_format_stale_state_value(current_value)}"
    )


def _format_stale_state_value(value: object) -> str:
    if value is None:
        return "null"
    return repr(_canonical_stale_state_value(value))


def _canonical_stale_state_value(value: object) -> object:
    if value is _MISSING_STALE_STATE_VALUE:
        return value
    return canonical_action_stale_state_value(value)


def _current_stale_state_for_action(
    *,
    db: Session,
    record: AssistantActionRequest,
) -> dict[str, object | None]:
    return _action_spec_for(record).current_stale_state(db=db, record=record)


def _action_payload_is_idempotent_retry(*, db: Session, record: AssistantActionRequest) -> bool:
    return _action_spec_for(record).is_idempotent_retry(db=db, record=record)


def _action_spec_for(record: AssistantActionRequest) -> AssistantActionSpec:
    action_spec = ACTION_SPECS.get(record.action_type)
    if action_spec is None:
        raise AssistantActionRequestError(f"Unsupported assistant action type '{record.action_type}'.")
    return action_spec


def _mark_action_request_failed(
    *,
    db: Session,
    record_id: int,
    actor_id: str,
    decided_at: datetime,
    error_detail: str,
    decision: AssistantActionDecision | None = None,
) -> AssistantActionRequest:
    db.rollback()
    record = db.get(AssistantActionRequest, record_id)
    if record is None:
        raise AssistantActionRequestError("Assistant action request not found after rollback.")

    record.status = "FAILED"
    record.decided_at = decided_at
    record.decided_by = actor_id
    if decision is not None:
        _apply_action_decision(record, decision)
    record.result = None
    record.error_detail = error_detail
    db.commit()
    db.refresh(record)
    return record
