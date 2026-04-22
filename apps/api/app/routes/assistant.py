from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role, resolve_audit_actor_id
from apps.api.app.core.query_params import ADMIN_LIST_LIMIT_QUERY, LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.admin.services.mutation_provenance import record_mutation_provenance
from apps.api.app.domains.assistant.services.audit_traces import build_assistant_run_audit_trace
from apps.api.app.domains.assistant.services.action_requests import (
    AssistantActionDecision,
    list_action_requests,
    list_action_request_page,
    to_action_request_out,
    to_action_request_out_list,
)
from apps.api.app.domains.assistant.services.agent_evals import (
    create_agent_eval,
    delete_agent_eval,
    latest_eval_runs_by_eval_id,
    list_agent_eval_runs,
    list_agent_evals,
    run_agent_eval,
    run_agent_eval_suite,
    seed_agent_evals_from_profile_request,
    to_agent_eval_out,
    to_agent_eval_run_out,
    update_agent_eval,
)
from apps.api.app.domains.assistant.services.autonomy_review import build_assistant_autonomy_review_brief
    list_agent_evals,
    seed_agent_evals_from_profile_request,
    to_agent_eval_out,
    update_agent_eval,
)
from apps.api.app.domains.assistant.services.chat import (
    AssistantService,
    AssistantServiceError,
    build_assistant_runtime_settings,
    resolve_effective_runtime,
)
from apps.api.app.domains.assistant.services.conversations import (
    list_assistant_conversations,
    to_assistant_conversation_out,
    to_assistant_conversation_summary_out,
)
from apps.api.app.domains.assistant.services.feedback import (
    to_assistant_run_feedback_out,
    upsert_assistant_run_feedback,
)
from apps.api.app.domains.assistant.services.eval_gates import (
    build_agent_eval_gate,
    build_role_archetype_eval_gate,
)
from apps.api.app.domains.assistant.services.outcome_metrics import (
    summarize_assistant_outcome_metrics,
)
from apps.api.app.domains.assistant.services.execution import (
    approve_assistant_action_request_for_user,
    execute_assistant_execution,
    prepare_assistant_execution,
    record_failed_assistant_execution,
    reject_assistant_action_request_for_user,
    resolve_accessible_assistant_action_request,
    resolve_accessible_assistant_conversation,
    resolve_accessible_assistant_run,
    resolve_agent_definition_for_request,
    resolve_prompt_user,
)
from apps.api.app.domains.assistant.services.prompt_context import (
    AssistantPromptSection,
    build_prompt_context,
)
from apps.api.app.domains.assistant.services.policies import (
    AssistantAgentProfilePolicyDefaults,
    AssistantAgentProfilePolicyError,
    resolve_agent_profile_policy_defaults,
    validate_agent_profile_definition,
)
from apps.api.app.domains.assistant.services.policy_simulations import simulate_assistant_agent_policy
from apps.api.app.domains.assistant.services.profile_requests import (
    approve_profile_request,
    create_profile_request,
    list_profile_requests,
    mark_profile_request_activated,
    reject_profile_request,
    to_profile_request_out,
    validate_agent_activation_requirements,
)
from apps.api.app.domains.assistant.services.runs import (
    get_assistant_run,
    list_assistant_runs,
    to_assistant_run_out,
    to_assistant_run_summary_out,
)
from apps.api.app.domains.assistant.services.role_archetypes import (
    get_role_archetype,
    list_role_archetypes,
    to_role_archetype_out,
)
from apps.api.app.domains.assistant.services.registry import (
    get_agent_record,
    list_admin_agent_records,
    list_public_agent_records,
    summarize_agent_token_budget,
    summarize_agent_token_budgets,
    to_admin_agent_out,
    to_public_agent_out,
)
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest
from apps.api.app.schemas.assistant import (
    AssistantActionDecisionRequest,
    AssistantActionRequestAdminPageOut,
    AssistantActionRequestOut,
    AssistantAgentAdminOut,
    AssistantAutonomyReviewBriefOut,
    AssistantAgentBuildRequest,
    AssistantAgentBuildSuggestionOut,
    AssistantAgentCreate,
    AssistantAgentEvalCreate,
    AssistantAgentEvalOut,
    AssistantAgentEvalRunOut,
    AssistantAgentEvalUpdate,
    AssistantAgentOut,
    AssistantAgentProfileRequestActivation,
    AssistantAgentProfileRequestCreate,
    AssistantAgentProfileRequestDecision,
    AssistantAgentProfileRequestOut,
    AssistantAgentRoleArchetypeOut,
    AssistantConversationOut,
    AssistantConversationSummaryOut,
    AssistantAgentUpdate,
    AssistantOutcomeMetricsOut,
    AssistantPolicySimulationOut,
    AssistantPolicySimulationRequest,
    AssistantPromptContextOut,
    AssistantPromptContextRequest,
    AssistantPromptSectionOut,
    AssistantPromptRequest,
    AssistantPromptResponse,
    AssistantRunFeedbackCreate,
    AssistantRunFeedbackOut,
    AssistantRunAuditTraceOut,
    AssistantRunOut,
    AssistantRunSummaryOut,
    AssistantRuntimeSettingsOut,
)

router = APIRouter(prefix="/assistant", tags=["assistant"])
admin_router = APIRouter(prefix="/admin/assistant", tags=["assistant-admin"])


def _action_decision_from_payload(payload: AssistantActionDecisionRequest | None) -> AssistantActionDecision | None:
    if payload is None:
        return None
    return AssistantActionDecision(
        review_outcome=payload.review_outcome,
        decision_note=payload.decision_note,
        correction_summary=payload.correction_summary,
        correction_fields=tuple(payload.correction_fields),
    )


def get_assistant_service(db: Session) -> AssistantService:
    return AssistantService(db)


@router.get("/settings", response_model=AssistantRuntimeSettingsOut)
def get_assistant_settings() -> AssistantRuntimeSettingsOut:
    return build_assistant_runtime_settings()


@router.get("/agents", response_model=list[AssistantAgentOut])
def list_assistant_agents(db: Session = Depends(get_db)) -> list[AssistantAgentOut]:
    records = list_public_agent_records(db)
    token_budgets = summarize_agent_token_budgets(db, records)
    return [
        to_public_agent_out(
            record,
            token_budget=token_budgets.get(record.agent_id),
            eval_gate=build_agent_eval_gate(db, record),
        )
        for record in records
    ]


@router.get("/conversations", response_model=list[AssistantConversationSummaryOut])
def list_current_user_assistant_conversations(
    request: Request,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantConversationSummaryOut]:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return [
        to_assistant_conversation_summary_out(record)
        for record in list_assistant_conversations(db, limit=limit, offset=offset, user_id=user.user_id)
    ]


@router.get("/conversations/{conversation_id}", response_model=AssistantConversationOut)
def get_current_user_assistant_conversation(
    conversation_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantConversationOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        record = resolve_accessible_assistant_conversation(
            db=db,
            conversation_id=conversation_id,
            user=user,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_assistant_conversation_out(db, record, feedback_user_id=user.user_id)


@router.get("/runs", response_model=list[AssistantRunSummaryOut])
def list_current_user_assistant_runs(
    request: Request,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantRunSummaryOut]:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return [
        to_assistant_run_summary_out(record)
        for record in list_assistant_runs(db, limit=limit, offset=offset, user_id=user.user_id)
    ]


@router.get("/runs/{run_id}", response_model=AssistantRunOut)
def get_current_user_assistant_run(
    run_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantRunOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        record = resolve_accessible_assistant_run(
            db=db,
            run_id=run_id,
            user=user,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_assistant_run_out(record)


@router.post("/runs/{run_id}/feedback", response_model=AssistantRunFeedbackOut)
def submit_current_user_assistant_run_feedback(
    run_id: int,
    payload: AssistantRunFeedbackCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantRunFeedbackOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        record = resolve_accessible_assistant_run(
            db=db,
            run_id=run_id,
            user=user,
        )
        feedback = upsert_assistant_run_feedback(
            db,
            run=record,
            user=user,
            payload=payload,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_assistant_run_feedback_out(feedback)


@router.get("/action-requests/{action_request_id}", response_model=AssistantActionRequestOut)
def get_current_user_assistant_action_request(
    action_request_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantActionRequestOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        record = resolve_accessible_assistant_action_request(
            db=db,
            action_request_id=action_request_id,
            user=user,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_action_request_out(record)


@router.get("/action-requests", response_model=list[AssistantActionRequestOut])
def list_current_user_assistant_action_requests(
    request: Request,
    status: str | None = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantActionRequestOut]:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_action_request_out_list(
        list_action_requests(
            db,
            limit=limit,
            offset=offset,
            user_id=user.user_id,
            status=status,
        )
    )


@router.post("/action-requests/{action_request_id}/approve", response_model=AssistantActionRequestOut)
def approve_current_user_assistant_action_request(
    action_request_id: int,
    request: Request,
    payload: AssistantActionDecisionRequest | None = None,
    db: Session = Depends(get_db),
) -> AssistantActionRequestOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        return to_action_request_out(
            approve_assistant_action_request_for_user(
                db=db,
                action_request_id=action_request_id,
                user=user,
                decision=_action_decision_from_payload(payload),
            )
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/action-requests/{action_request_id}/reject", response_model=AssistantActionRequestOut)
def reject_current_user_assistant_action_request(
    action_request_id: int,
    request: Request,
    payload: AssistantActionDecisionRequest | None = None,
    db: Session = Depends(get_db),
) -> AssistantActionRequestOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        return to_action_request_out(
            reject_assistant_action_request_for_user(
                db=db,
                action_request_id=action_request_id,
                user=user,
                decision=_action_decision_from_payload(payload),
            )
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/context", response_model=AssistantPromptContextOut)
def preview_assistant_prompt_context(
    payload: AssistantPromptContextRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantPromptContextOut:
    try:
        agent_definition = resolve_agent_definition_for_request(db=db, payload=payload)
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    provider, model, warnings = resolve_effective_runtime(payload, agent_definition)
    prompt_context = build_prompt_context(
        payload=payload,
        user=user,
        db=db,
        agent_definition=agent_definition,
    )
    return AssistantPromptContextOut(
        agent_id=prompt_context.agent_id,
        agent_name=prompt_context.agent_name,
        agent_role_key=prompt_context.agent_role_key,
        agent_profile_kind=prompt_context.agent_profile_kind,
        provider=provider.provider,
        model=model,
        generated_at=prompt_context.generated_at,
        warnings=[*warnings, *prompt_context.warnings],
        sections=[_to_prompt_section_out(section) for section in prompt_context.sections],
        rendered_system_prompt=prompt_context.system_prompt,
    )


@router.post("/respond", response_model=AssistantPromptResponse)
async def respond_with_assistant(
    payload: AssistantPromptRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantPromptResponse:
    prepared = None
    try:
        prepared = prepare_assistant_execution(
            db=db,
            payload=payload,
            authorization_header=request.headers.get("authorization"),
        )
        response, _ = await execute_assistant_execution(
            assistant_service=get_assistant_service(db),
            payload=payload,
            db=db,
            prepared=prepared,
        )
        return response
    except AssistantServiceError as exc:
        if prepared is not None:
            record_failed_assistant_execution(
                payload=payload,
                db=db,
                prepared=prepared,
                detail=exc.detail,
            )
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/respond/stream")
async def stream_assistant_response(
    payload: AssistantPromptRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    try:
        prepared = prepare_assistant_execution(
            db=db,
            payload=payload,
            authorization_header=request.headers.get("authorization"),
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    async def event_stream():
        yield _encode_sse("status", {"phase": "running"})
        try:
            response, conversation = await execute_assistant_execution(
                assistant_service=get_assistant_service(db),
                payload=payload,
                db=db,
                prepared=prepared,
            )
        except AssistantServiceError as exc:
            failed_conversation = record_failed_assistant_execution(
                payload=payload,
                db=db,
                prepared=prepared,
                detail=exc.detail,
            )
            yield _encode_sse(
                "conversation",
                to_assistant_conversation_summary_out(failed_conversation).model_dump(mode="json"),
            )
            yield _encode_sse("error", {"detail": exc.detail})
            return

        yield _encode_sse(
            "conversation",
            to_assistant_conversation_summary_out(conversation).model_dump(mode="json"),
        )
        metadata_payload = response.model_dump(mode="json")
        metadata_payload["message"]["content"] = ""
        yield _encode_sse("assistant.metadata", metadata_payload)
        for chunk in _iter_text_chunks(response.message.content):
            yield _encode_sse("assistant.delta", {"delta": chunk})
        yield _encode_sse("assistant.complete", response.model_dump(mode="json"))

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@admin_router.get("/role-archetypes", response_model=list[AssistantAgentRoleArchetypeOut])
def list_admin_assistant_role_archetypes() -> list[AssistantAgentRoleArchetypeOut]:
    return [
        to_role_archetype_out(role, eval_gate=build_role_archetype_eval_gate(role))
        for role in list_role_archetypes()
    ]


@admin_router.get("/role-archetypes/{role_key}", response_model=AssistantAgentRoleArchetypeOut)
def get_admin_assistant_role_archetype(role_key: str) -> AssistantAgentRoleArchetypeOut:
    role = get_role_archetype(role_key)
    if role is None:
        raise HTTPException(status_code=404, detail="Assistant agent role archetype not found")
    return to_role_archetype_out(role, eval_gate=build_role_archetype_eval_gate(role))


@admin_router.get("/profile-requests", response_model=list[AssistantAgentProfileRequestOut])
def list_admin_assistant_profile_requests(
    status: str | None = None,
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantAgentProfileRequestOut]:
    return [
        to_profile_request_out(record)
        for record in list_profile_requests(db, status=status, limit=limit, offset=offset)
    ]


@admin_router.post(
    "/profile-requests",
    response_model=AssistantAgentProfileRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def create_admin_assistant_profile_request(
    payload: AssistantAgentProfileRequestCreate,
    db: Session = Depends(get_db),
) -> AssistantAgentProfileRequestOut:
    try:
        return to_profile_request_out(create_profile_request(db, payload))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.post("/profile-requests/{request_id}/approve", response_model=AssistantAgentProfileRequestOut)
def approve_admin_assistant_profile_request(
    request_id: int,
    payload: AssistantAgentProfileRequestDecision,
    db: Session = Depends(get_db),
) -> AssistantAgentProfileRequestOut:
    try:
        return to_profile_request_out(approve_profile_request(db, request_id=request_id, payload=payload))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.post("/profile-requests/{request_id}/reject", response_model=AssistantAgentProfileRequestOut)
def reject_admin_assistant_profile_request(
    request_id: int,
    payload: AssistantAgentProfileRequestDecision,
    db: Session = Depends(get_db),
) -> AssistantAgentProfileRequestOut:
    try:
        return to_profile_request_out(reject_profile_request(db, request_id=request_id, payload=payload))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.get("/agent-evals", response_model=list[AssistantAgentEvalOut])
def list_admin_assistant_agent_evals(
    agent_id: str | None = None,
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantAgentEvalOut]:
    records = list_agent_evals(db, agent_id=agent_id, limit=limit, offset=offset)
    latest_runs = latest_eval_runs_by_eval_id(db, [record.id for record in records])
    return [
        to_agent_eval_out(record, latest_run=latest_runs.get(record.id))
        for record in records
    return [
        to_agent_eval_out(record)
        for record in list_agent_evals(db, agent_id=agent_id, limit=limit, offset=offset)
    ]


@admin_router.post(
    "/agent-evals",
    response_model=AssistantAgentEvalOut,
    status_code=status.HTTP_201_CREATED,
)
def create_admin_assistant_agent_eval(
    payload: AssistantAgentEvalCreate,
    db: Session = Depends(get_db),
) -> AssistantAgentEvalOut:
    try:
        return to_agent_eval_out(create_agent_eval(db, payload))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.put("/agent-evals/{eval_id}", response_model=AssistantAgentEvalOut)
def update_admin_assistant_agent_eval(
    eval_id: int,
    payload: AssistantAgentEvalUpdate,
    db: Session = Depends(get_db),
) -> AssistantAgentEvalOut:
    try:
        return to_agent_eval_out(update_agent_eval(db, eval_id=eval_id, payload=payload))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.delete("/agent-evals/{eval_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_admin_assistant_agent_eval(
    eval_id: int,
    db: Session = Depends(get_db),
) -> Response:
    try:
        delete_agent_eval(db, eval_id=eval_id)
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@admin_router.get("/agent-evals/{eval_id}/runs", response_model=list[AssistantAgentEvalRunOut])
def list_admin_assistant_agent_eval_runs(
    eval_id: int,
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantAgentEvalRunOut]:
    try:
        return [
            to_agent_eval_run_out(record)
            for record in list_agent_eval_runs(db, eval_id=eval_id, limit=limit, offset=offset)
        ]
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.post("/agent-evals/{eval_id}/run", response_model=AssistantAgentEvalRunOut)
async def run_admin_assistant_agent_eval(
    eval_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantAgentEvalRunOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")
    try:
        return to_agent_eval_run_out(
            await run_agent_eval(
                db,
                eval_id=eval_id,
                user=user,
                assistant_service=get_assistant_service(db),
            )
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.post("/agents/{agent_id}/evals/run", response_model=list[AssistantAgentEvalRunOut])
async def run_admin_assistant_agent_eval_suite(
    agent_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> list[AssistantAgentEvalRunOut]:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")
    try:
        return [
            to_agent_eval_run_out(record)
            for record in await run_agent_eval_suite(
                db,
                agent_id=agent_id,
                user=user,
                assistant_service=get_assistant_service(db),
            )
        ]
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.get("/agents", response_model=list[AssistantAgentAdminOut])
def list_admin_assistant_agents(db: Session = Depends(get_db)) -> list[AssistantAgentAdminOut]:
    records = list_admin_agent_records(db)
    token_budgets = summarize_agent_token_budgets(db, records)
    return [
        to_admin_agent_out(
            record,
            token_budget=token_budgets.get(record.agent_id),
            eval_gate=build_agent_eval_gate(db, record),
        )
        for record in records
    ]


@admin_router.post("/agents/build", response_model=AssistantAgentBuildSuggestionOut)
async def build_admin_assistant_agent(
    payload: AssistantAgentBuildRequest,
    db: Session = Depends(get_db),
) -> AssistantAgentBuildSuggestionOut:
    try:
        return await get_assistant_service(db).build_agent_draft_with_openai(payload)
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.get("/runs", response_model=list[AssistantRunSummaryOut])
def list_admin_assistant_runs(
    role_key: str | None = None,
    profile_kind: str | None = None,
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantRunSummaryOut]:
    return [
        to_assistant_run_summary_out(record)
        for record in list_assistant_runs(
            db,
            limit=limit,
            offset=offset,
            role_key=role_key,
            profile_kind=profile_kind,
        )
    ]


@admin_router.get("/outcome-metrics", response_model=AssistantOutcomeMetricsOut)
def get_admin_assistant_outcome_metrics(
    request: Request,
    agent_id: str | None = None,
    action_type: str | None = None,
    role_key: str | None = None,
    profile_kind: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    db: Session = Depends(get_db),
) -> AssistantOutcomeMetricsOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    snapshot = summarize_assistant_outcome_metrics(
        db,
        agent_id=agent_id,
        action_type=action_type,
        role_key=role_key,
        profile_kind=profile_kind,
        created_after=created_after,
        created_before=created_before,
    )
    return AssistantOutcomeMetricsOut.model_validate(asdict(snapshot))


@admin_router.get("/agents/{agent_id}/autonomy-review", response_model=AssistantAutonomyReviewBriefOut)
def get_admin_assistant_autonomy_review(
    agent_id: str,
    request: Request,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    db: Session = Depends(get_db),
) -> AssistantAutonomyReviewBriefOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    try:
        brief = build_assistant_autonomy_review_brief(
            db,
            agent_id=agent_id,
            created_after=created_after,
            created_before=created_before,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return AssistantAutonomyReviewBriefOut.model_validate(asdict(brief))


@admin_router.get("/runs/{run_id}/audit-trace", response_model=AssistantRunAuditTraceOut)
def get_admin_assistant_run_audit_trace(
    run_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantRunAuditTraceOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    record = get_assistant_run(db, run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant run not found")
    return build_assistant_run_audit_trace(db, record)


@admin_router.get("/action-requests", response_model=AssistantActionRequestAdminPageOut)
def list_admin_assistant_action_requests(
    request: Request,
    status: str | None = None,
    action_type: str | None = None,
    agent_id: str | None = None,
    role_key: str | None = None,
    profile_kind: str | None = None,
    user_id: str | None = None,
    decided_by: str | None = None,
    search: str | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    decided_after: datetime | None = None,
    decided_before: datetime | None = None,
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> AssistantActionRequestAdminPageOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")
    page = list_action_request_page(
        db,
        limit=limit,
        offset=offset,
        status=status,
        action_type=action_type,
        agent_id=agent_id,
        role_key=role_key,
        profile_kind=profile_kind,
        requester_user_id=user_id,
        decided_by=decided_by,
        search=search,
        created_after=created_after,
        created_before=created_before,
        decided_after=decided_after,
        decided_before=decided_before,
    )
    return AssistantActionRequestAdminPageOut(
        items=to_action_request_out_list(page.records),
        total_count=page.total_count,
        limit=page.limit,
        offset=page.offset,
        has_more=page.has_more,
        summary={
            "total_count": page.summary.total_count,
            "pending_count": page.summary.pending_count,
            "executed_count": page.summary.executed_count,
            "rejected_count": page.summary.rejected_count,
            "failed_count": page.summary.failed_count,
            "correction_count": page.summary.correction_count,
            "avg_decision_seconds": page.summary.avg_decision_seconds,
        },
    )


@admin_router.post("/agents/{agent_id}/policy-simulation", response_model=AssistantPolicySimulationOut)
def simulate_admin_assistant_agent_policy(
    agent_id: str,
    payload: AssistantPolicySimulationRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantPolicySimulationOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    record = get_agent_record(db, agent_id.strip().lower())
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant agent not found")
    return simulate_assistant_agent_policy(db=db, record=record, payload=payload)


@admin_router.post("/agents", response_model=AssistantAgentAdminOut, status_code=status.HTTP_201_CREATED)
def create_assistant_agent(
    payload: AssistantAgentCreate,
    db: Session = Depends(get_db),
) -> AssistantAgentAdminOut:
    if get_agent_record(db, payload.agent_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assistant agent already exists")

    now = datetime.now(timezone.utc)
    actor_id = resolve_audit_actor_id(payload.created_by)
    policy_defaults = _resolve_agent_profile_defaults(payload)
    record = AssistantAgent(
        agent_id=payload.agent_id,
        name=payload.name,
        description=payload.description,
        status=payload.status,
        scope=payload.scope,
        provider=payload.provider,
        model=payload.model,
        role_key=payload.role_key,
        profile_kind=payload.profile_kind,
        specialization_summary=payload.specialization_summary,
        human_owner_role=payload.human_owner_role,
        authority_ceiling=payload.authority_ceiling,
        activation_notes=payload.activation_notes,
        profile_request_id=payload.profile_request_id,
        allowed_workspaces=list(payload.allowed_workspaces),
        capabilities=list(payload.capabilities),
        allowed_tools=list(policy_defaults.allowed_tools),
        allowed_action_types=list(policy_defaults.allowed_action_types),
        daily_token_allocation=payload.daily_token_allocation,
        system_prompt=payload.system_prompt,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    db.flush()
    _seed_profile_request_evals_for_agent(db, record=record, actor_id=actor_id)
    _validate_agent_activation(db, agent_id=payload.agent_id, payload=payload)
    if record.status == "ACTIVE":
        _mark_profile_request_activated_for_agent(db, record=record, actor_id=actor_id)
    _record_agent_provenance(db, record=record, operation_key="assistant_agent.created", action="created")
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assistant agent already exists") from exc
    db.refresh(record)
    return to_admin_agent_out(
        record,
        token_budget=summarize_agent_token_budget(db, record),
        eval_gate=build_agent_eval_gate(db, record),
    )


@admin_router.put("/agents/{agent_id}", response_model=AssistantAgentAdminOut)
def update_assistant_agent(
    agent_id: str,
    payload: AssistantAgentUpdate,
    db: Session = Depends(get_db),
) -> AssistantAgentAdminOut:
    record = get_agent_record(db, agent_id.strip().lower())
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant agent not found")

    old_status = record.status
    policy_defaults = _resolve_agent_profile_defaults(payload)
    record.name = payload.name
    record.description = payload.description
    record.status = payload.status
    record.scope = payload.scope
    record.provider = payload.provider
    record.model = payload.model
    record.role_key = payload.role_key
    record.profile_kind = payload.profile_kind
    record.specialization_summary = payload.specialization_summary
    record.human_owner_role = payload.human_owner_role
    record.authority_ceiling = payload.authority_ceiling
    record.activation_notes = payload.activation_notes
    record.profile_request_id = payload.profile_request_id
    record.allowed_workspaces = list(payload.allowed_workspaces)
    record.capabilities = list(payload.capabilities)
    record.allowed_tools = list(policy_defaults.allowed_tools)
    record.allowed_action_types = list(policy_defaults.allowed_action_types)
    record.daily_token_allocation = payload.daily_token_allocation
    record.system_prompt = payload.system_prompt
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    db.flush()
    _seed_profile_request_evals_for_agent(db, record=record, actor_id=record.updated_by)
    _validate_agent_activation(db, agent_id=record.agent_id, payload=payload)
    if old_status != "ACTIVE" and record.status == "ACTIVE":
        _mark_profile_request_activated_for_agent(db, record=record, actor_id=record.updated_by)
    _record_agent_provenance(
        db,
        record=record,
        operation_key=_agent_status_operation_key(old_status=old_status, new_status=record.status),
        action=record.status.lower() if old_status != record.status else "updated",
    )
    db.commit()
    db.refresh(record)
    return to_admin_agent_out(
        record,
        token_budget=summarize_agent_token_budget(db, record),
        eval_gate=build_agent_eval_gate(db, record),
    )


def _to_prompt_section_out(section: AssistantPromptSection) -> AssistantPromptSectionOut:
    return AssistantPromptSectionOut(
        key=section.key,
        title=section.title,
        source=section.source,
        content=section.content,
    )


def _iter_text_chunks(text: str, chunk_size: int = 160) -> list[str]:
    if not text:
        return []
    return [text[index : index + chunk_size] for index in range(0, len(text), chunk_size)]


def _encode_sse(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _resolve_agent_profile_defaults(payload: AssistantAgentCreate | AssistantAgentUpdate) -> AssistantAgentProfilePolicyDefaults:
    defaults = resolve_agent_profile_policy_defaults(
        role_key=payload.role_key,
        profile_kind=payload.profile_kind,
        capabilities=tuple(payload.capabilities),
        allowed_tools=tuple(payload.allowed_tools),
        allowed_action_types=tuple(payload.allowed_action_types),
    )
    try:
        validate_agent_profile_definition(
            agent_name=payload.name,
            role_key=payload.role_key,
            profile_kind=payload.profile_kind,
            scope=payload.scope,
            allowed_workspaces=tuple(payload.allowed_workspaces),
            capabilities=tuple(payload.capabilities),
            allowed_tools=defaults.allowed_tools,
            allowed_action_types=defaults.allowed_action_types,
            authority_ceiling=payload.authority_ceiling,
        )
    except AssistantAgentProfilePolicyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return defaults


def _validate_agent_activation(
    db: Session,
    *,
    agent_id: str,
    payload: AssistantAgentCreate | AssistantAgentUpdate,
) -> None:
    try:
        validate_agent_activation_requirements(
            db,
            agent_id=agent_id,
            agent_name=payload.name,
            status=payload.status,
            profile_kind=payload.profile_kind,
            role_key=payload.role_key,
            profile_request_id=payload.profile_request_id,
            human_owner_role=payload.human_owner_role,
            authority_ceiling=payload.authority_ceiling,
            activation_notes=payload.activation_notes,
            capabilities=tuple(payload.capabilities),
            allowed_action_types=tuple(payload.allowed_action_types),
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def _mark_profile_request_activated_for_agent(
    db: Session,
    *,
    record: AssistantAgent,
    actor_id: str,
) -> None:
    if record.profile_request_id is None:
        return
    try:
        mark_profile_request_activated(
            db,
            request_id=record.profile_request_id,
            payload=AssistantAgentProfileRequestActivation(
                activated_by=actor_id,
                linked_agent_id=record.agent_id,
            ),
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def _seed_profile_request_evals_for_agent(
    db: Session,
    *,
    record: AssistantAgent,
    actor_id: str,
) -> None:
    if record.profile_request_id is None:
        return
    profile_request = db.get(AssistantAgentProfileRequest, record.profile_request_id)
    if profile_request is None or profile_request.status not in {"APPROVED", "ACTIVATED"}:
        return
    seed_agent_evals_from_profile_request(
        db,
        agent=record,
        profile_request=profile_request,
        actor_id=actor_id,
    )


def _agent_status_operation_key(*, old_status: str, new_status: str) -> str:
    if old_status != new_status:
        if new_status == "ACTIVE":
            return "assistant_agent.activated"
        if new_status == "PAUSED":
            return "assistant_agent.paused"
        if new_status == "RETIRED":
            return "assistant_agent.retired"
    return "assistant_agent.updated"


def _record_agent_provenance(
    db: Session,
    *,
    record: AssistantAgent,
    operation_key: str,
    action: str,
) -> None:
    record_mutation_provenance(
        db,
        operation_key=operation_key,
        source_surface="admin.assistant.agents",
        affected_records=[
            {
                "record_type": "assistant_agent",
                "record_id": record.agent_id,
                "action": action,
                "label": record.name,
            }
        ],
        details={
            "agent_id": record.agent_id,
            "status": record.status,
            "role_key": record.role_key,
            "profile_kind": record.profile_kind,
            "profile_request_id": record.profile_request_id,
            "workspace_count": len(record.allowed_workspaces or []),
            "tool_count": len(record.allowed_tools or []),
            "action_type_count": len(record.allowed_action_types or []),
        },
    )
