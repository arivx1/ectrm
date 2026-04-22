from __future__ import annotations

from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.role_archetypes import (
    AssistantAgentRoleArchetype,
    get_role_archetype,
)
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest
from apps.api.app.schemas.assistant import AssistantAgentEvalGateOut


APPROVED_PROFILE_REQUEST_STATUSES = {"APPROVED", "ACTIVATED"}
AUTHORITY_RANK: dict[str, int] = {
    "OBSERVE": 1,
    "EXPLAIN": 2,
    "DRAFT": 3,
    "STAGE": 4,
    "EXECUTE": 5,
    "EXTERNAL_COMMIT": 6,
}


def build_role_archetype_eval_gate(role: AssistantAgentRoleArchetype) -> AssistantAgentEvalGateOut:
    required_cases = list(role.required_eval_coverage)
    covered_cases = list(role.required_eval_coverage)
    notes = [
        "Role eval coverage is defined in the role archetype registry.",
        "make api-assistant-evals is the canonical local behavior gate.",
    ]
    missing_cases = _role_action_eval_missing_cases(role)
    if missing_cases:
        notes.append("Action-capable role eval coverage needs allowed and denied behavior cases.")

    return AssistantAgentEvalGateOut(
        status="BLOCKED" if missing_cases else "PASS",
        role_key=role.role_key,
        required_cases=_distinct(required_cases),
        covered_cases=_distinct(covered_cases),
        missing_cases=missing_cases,
        custom_case_count=0,
        notes=notes,
    )


def build_agent_eval_gate(
    db: Session,
    record: AssistantAgent,
) -> AssistantAgentEvalGateOut:
    return evaluate_agent_eval_gate(
        db,
        agent_id=record.agent_id,
        profile_kind=record.profile_kind or "CUSTOM",
        role_key=record.role_key,
        profile_request_id=record.profile_request_id,
        authority_ceiling=record.authority_ceiling,
        capabilities=tuple(record.capabilities or []),
        allowed_action_types=tuple(record.allowed_action_types or []),
    )


def evaluate_agent_eval_gate(
    db: Session,
    *,
    agent_id: str | None = None,
    profile_kind: str,
    role_key: str | None,
    profile_request_id: int | None,
    authority_ceiling: str | None,
    capabilities: tuple[str, ...],
    allowed_action_types: tuple[str, ...],
) -> AssistantAgentEvalGateOut:
    normalized_profile_kind = profile_kind.strip().upper()
    normalized_capabilities = {capability.strip().upper() for capability in capabilities}
    normalized_authority = (authority_ceiling or "").strip().upper()
    role = get_role_archetype(role_key) if role_key else None
    profile_request = (
        db.get(AssistantAgentProfileRequest, profile_request_id)
        if profile_request_id is not None
        else None
    )
    persisted_eval_cases = (
        [
            name
            for name in db.scalars(
                select(AssistantAgentEval.name)
                .where(AssistantAgentEval.agent_id == agent_id)
                .order_by(AssistantAgentEval.updated_at.desc())
            ).all()
            if name
        ]
        if agent_id
        else []
    )

    required_cases: list[str] = []
    covered_cases: list[str] = []
    missing_cases: list[str] = []
    notes: list[str] = ["make api-assistant-evals is the canonical local behavior gate."]

    if role_key and role is None:
        missing_cases.append(f"Unknown role archetype '{role_key}'.")

    if role is not None:
        role_gate = build_role_archetype_eval_gate(role)
        required_cases.extend(role_gate.required_cases)
        covered_cases.extend(role_gate.covered_cases)
        missing_cases.extend(role_gate.missing_cases)
        notes.append(f"Inherits the {role.name} role eval matrix.")

    custom_cases: list[str] = []
    if profile_request_id is not None:
        if profile_request is None:
            missing_cases.append(f"Unknown profile request {profile_request_id}.")
        elif profile_request.status not in APPROVED_PROFILE_REQUEST_STATUSES:
            missing_cases.append(f"Profile request {profile_request_id} must be approved before eval coverage counts.")
        else:
            required_cases.extend(profile_request.proposed_eval_cases or [])
            custom_cases = list(persisted_eval_cases)
            covered_cases.extend(custom_cases)
            if custom_cases:
                notes.append(f"Includes {len(custom_cases)} persisted custom profile eval case(s).")
            elif profile_request.proposed_eval_cases:
                missing_cases.append(
                    f"Profile request {profile_request_id} needs persisted eval cases before coverage counts."
                )

    if normalized_profile_kind == "CUSTOM":
        authority_requires_specialization = AUTHORITY_RANK.get(normalized_authority, 0) > AUTHORITY_RANK["DRAFT"]
        action_requires_specialization = "ACTION" in normalized_capabilities or bool(allowed_action_types)
        if authority_requires_specialization or action_requires_specialization:
            required_cases.append("Specialization-specific eval case.")
            if custom_cases:
                covered_cases.append("Specialization-specific eval case.")
            else:
                missing_cases.append("Custom profiles above draft-only authority need a persisted specialization-specific eval case.")

    if not required_cases and not missing_cases:
        return AssistantAgentEvalGateOut(
            status="NOT_REQUIRED",
            role_key=role.role_key if role is not None else role_key,
            required_cases=[],
            covered_cases=[],
            missing_cases=[],
            custom_case_count=len(custom_cases),
            notes=notes,
        )

    return AssistantAgentEvalGateOut(
        status="BLOCKED" if missing_cases else "PASS",
        role_key=role.role_key if role is not None else role_key,
        required_cases=_distinct(required_cases),
        covered_cases=_distinct(covered_cases),
        missing_cases=_distinct(missing_cases),
        custom_case_count=len(custom_cases),
        notes=_distinct(notes),
    )


def role_action_eval_missing_cases(role: AssistantAgentRoleArchetype) -> list[str]:
    return _role_action_eval_missing_cases(role)


def _role_action_eval_missing_cases(role: AssistantAgentRoleArchetype) -> list[str]:
    if not role.maximum_action_types and "ACTION" not in set(role.capability_ceiling):
        return []

    coverage_text = " ".join(role.required_eval_coverage).lower()
    missing: list[str] = []
    if not any(keyword in coverage_text for keyword in ("allowed", "staging", "stage")):
        missing.append(f"{role.role_key}: action-capable roles need an allowed action behavior eval case.")
    if not any(keyword in coverage_text for keyword in ("denied", "stale", "ambiguous", "unsupported", "no ")):
        missing.append(f"{role.role_key}: action-capable roles need a denied or stale action behavior eval case.")
    return missing


def _distinct(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result
