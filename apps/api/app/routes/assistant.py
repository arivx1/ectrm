from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone
from typing import cast

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
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
from apps.api.app.domains.assistant.services.agent_revisions import (
    build_agent_revision_diff_summary,
    create_agent_revision,
    ensure_agent_publication_snapshot,
    get_agent_revision,
    list_agent_revisions,
    next_agent_revision_version,
    normalize_agent_revision_payload,
    serialize_agent_revision_payload,
)
from apps.api.app.domains.assistant.services.autonomy_review import (
    build_assistant_agent_health_review,
    build_assistant_autonomy_review_brief,
)
from apps.api.app.domains.assistant.services.agent_work_packages import (
    accept_generated_agent_work_package,
    list_agent_work_packages,
    to_agent_work_package_out,
    update_agent_work_package,
)
from apps.api.app.domains.assistant.services.agent_self_updates import (
    generate_assistant_agent_self_update_draft,
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
from apps.api.app.domains.assistant.services.control_tower import (
    build_assistant_control_tower_summary,
)
from apps.api.app.domains.assistant.services.feedback import (
    to_assistant_run_feedback_out,
    upsert_assistant_run_feedback,
)
from apps.api.app.domains.assistant.services.prompt_navigation_outcomes import (
    create_prompt_home_navigation_outcome,
    to_assistant_prompt_navigation_outcome_out,
    upsert_assistant_prompt_navigation_outcome,
)
from apps.api.app.domains.assistant.services.prompt_route_recommendations import (
    list_prompt_route_recommendations,
)
from apps.api.app.domains.assistant.services.eval_gates import (
    build_agent_eval_gate,
    build_role_archetype_eval_gate,
)
from apps.api.app.domains.assistant.services.outcome_metrics import (
    summarize_assistant_outcome_metrics,
)
from apps.api.app.domains.assistant.services.organization_context_registry import (
    OrganizationContextRegistryError,
    create_organization_context_definition,
    get_organization_context_definition,
    list_organization_context_definitions,
    publish_organization_context_definition,
    retire_organization_context_definition,
    update_organization_context_definition,
)
from apps.api.app.domains.assistant.personas import list_assistant_persona_definitions
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
    submit_profile_request,
    to_profile_request_out_with_diff,
    validate_agent_activation_requirements,
)
from apps.api.app.domains.assistant.services.runs import (
    get_assistant_run,
    list_assistant_runs,
    to_assistant_run_out,
    to_assistant_run_summary_out,
)
from apps.api.app.domains.assistant.services.voice import (
    AssistantVoiceGenerationError,
    synthesize_assistant_voice_audio,
    AssistantVoiceTranscriptionError,
    transcribe_assistant_voice_audio,
)
from apps.api.app.domains.assistant.services.role_archetypes import (
    get_role_archetype,
    list_role_archetypes,
    to_role_archetype_out,
)
from apps.api.app.domains.assistant.services.registry import (
    ManagedAssistantAgent,
    get_agent_record,
    list_admin_agent_records,
    list_public_agent_records,
    summarize_agent_token_budget,
    summarize_agent_token_budgets,
    to_admin_agent_out,
    to_public_agent_out,
)
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_revision import AssistantAgentRevision
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest
from apps.api.app.schemas.assistant import (
    AssistantActionDecisionRequest,
    AssistantActionRequestAdminPageOut,
    AssistantActionRequestOut,
    AssistantAgentAdminOut,
    AssistantAgentHealthReviewOut,
    AssistantAgentRevisionPayloadOut,
    AssistantAgentRevisionOut,
    AssistantAgentWorkPackageAcceptRequest,
    AssistantAgentWorkPackageOut,
    AssistantAgentWorkPackageUpdateRequest,
    AssistantAutonomyReviewBriefOut,
    AssistantAgentBuildRequest,
    AssistantAgentBuildSuggestionOut,
    AssistantAgentCreate,
    AssistantControlTowerSummaryOut,
    AssistantOrganizationContextDefinitionCreate,
    AssistantOrganizationContextDefinitionOut,
    AssistantOrganizationContextDefinitionUpdate,
    AssistantOrganizationContextSectionKey,
    AssistantOrganizationContextStatus,
    AssistantAgentEvalCreate,
    AssistantAgentEvalOut,
    AssistantAgentEvalRunOut,
    AssistantAgentEvalUpdate,
    AssistantAgentOut,
    AssistantAgentProfileRequestActivation,
    AssistantAgentProfileRequestCreate,
    AssistantAgentProfileRequestDecision,
    AssistantAgentProfileRequestOut,
    AssistantAgentProfileRequestSubmit,
    AssistantAgentRoleArchetypeOut,
    AssistantAgentSelfUpdateDraftOut,
    AssistantAgentSelfUpdateRequest,
    AssistantConversationOut,
    AssistantConversationSummaryOut,
    AssistantAgentUpdate,
    AssistantOutcomeMetricsOut,
    AssistantPersonaDefinitionOut,
    AssistantPolicySimulationOut,
    AssistantPolicySimulationRequest,
    AssistantPromptContextOut,
    AssistantPromptContextRequest,
    AssistantPromptSectionOut,
    AssistantPromptNavigationOutcomeCreate,
    AssistantPromptNavigationOutcomeOut,
    AssistantPromptRouteRecommendationOut,
    AssistantPromptRequest,
    AssistantPromptResponse,
    AssistantRunFeedbackCreate,
    AssistantRunFeedbackOut,
    AssistantRunAuditTraceOut,
    AssistantRunOut,
    AssistantRunSummaryOut,
    AssistantRuntimeSettingsOut,
    AssistantVoiceSpeechRequest,
    AssistantVoiceTranscriptionOut,
    AssistantWorkspace,
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


def _build_prompt_context_preview_warnings(sections: list[AssistantPromptSection]) -> list[str]:
    warnings: list[str] = []
    for section in sections:
        if not section.uses_fallback:
            continue
        if section.contract_key == "organization":
            warnings.append(
                "Organization Context is using env-backed fallback values because no published organization profile is active."
            )
        elif section.contract_key == "business-model":
            warnings.append(
                "Business Operating Model is using env-backed fallback values because no published operating-model definition is active."
            )
    return warnings


def get_assistant_service(db: Session, *, actor_id: str | None = None) -> AssistantService:
    return AssistantService(db, actor_id=actor_id)


@router.get("/settings", response_model=AssistantRuntimeSettingsOut)
def get_assistant_settings() -> AssistantRuntimeSettingsOut:
    return build_assistant_runtime_settings()


@router.get("/personas", response_model=list[AssistantPersonaDefinitionOut])
def list_assistant_personas() -> list[AssistantPersonaDefinitionOut]:
    return [definition.to_out() for definition in list_assistant_persona_definitions()]


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


@router.get("/profile-requests", response_model=list[AssistantAgentProfileRequestOut])
def list_current_user_assistant_profile_requests(
    request: Request,
    status: str | None = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantAgentProfileRequestOut]:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return [
        to_profile_request_out_with_diff(db, record)
        for record in list_profile_requests(
            db,
            status=status,
            requested_by=user.user_id,
            limit=limit,
            offset=offset,
        )
    ]


@router.post(
    "/profile-requests",
    response_model=AssistantAgentProfileRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def create_current_user_assistant_profile_request(
    payload: AssistantAgentProfileRequestSubmit,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantAgentProfileRequestOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        return to_profile_request_out_with_diff(
            db,
            submit_profile_request(
                db,
                payload=payload,
                requested_by=user.user_id,
            ),
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


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


@router.post("/runs/{run_id}/prompt-navigation-outcomes", response_model=AssistantPromptNavigationOutcomeOut)
def submit_current_user_assistant_prompt_navigation_outcome(
    run_id: int,
    payload: AssistantPromptNavigationOutcomeCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantPromptNavigationOutcomeOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        record = resolve_accessible_assistant_run(
            db=db,
            run_id=run_id,
            user=user,
        )
        outcome = upsert_assistant_prompt_navigation_outcome(
            db,
            run=record,
            user=user,
            payload=payload,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_assistant_prompt_navigation_outcome_out(outcome)


@router.post("/prompt-navigation-outcomes", response_model=AssistantPromptNavigationOutcomeOut)
def submit_current_user_prompt_home_navigation_outcome(
    payload: AssistantPromptNavigationOutcomeCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantPromptNavigationOutcomeOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        outcome = create_prompt_home_navigation_outcome(
            db,
            user=user,
            payload=payload,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_assistant_prompt_navigation_outcome_out(outcome)


@router.get("/prompt-route-recommendations", response_model=list[AssistantPromptRouteRecommendationOut])
def list_current_user_prompt_route_recommendations(
    request: Request,
    db: Session = Depends(get_db),
) -> list[AssistantPromptRouteRecommendationOut]:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return [
        AssistantPromptRouteRecommendationOut.model_validate(asdict(recommendation))
        for recommendation in list_prompt_route_recommendations(
            db,
            user_role=user.role,
        )
    ]


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
        warnings=[
            *warnings,
            *prompt_context.warnings,
            *_build_prompt_context_preview_warnings(list(prompt_context.sections)),
        ],
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
            assistant_service=get_assistant_service(db, actor_id=prepared.user.user_id),
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


@router.post("/voice/transcriptions", response_model=AssistantVoiceTranscriptionOut)
async def transcribe_current_user_assistant_voice(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> AssistantVoiceTranscriptionOut:
    try:
        resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        payload = await file.read()
        return await transcribe_assistant_voice_audio(
            filename=file.filename or "voice-note.webm",
            content_type=file.content_type,
            payload=payload,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except AssistantVoiceTranscriptionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/voice/speech")
async def synthesize_current_user_assistant_voice(
    payload: AssistantVoiceSpeechRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    try:
        resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        result = await synthesize_assistant_voice_audio(text=payload.text)
        return Response(
            content=result.payload,
            media_type=result.content_type,
            headers={
                "x-assistant-voice-provider": result.provider,
                "x-assistant-voice-model": result.model,
                "x-assistant-voice-voice": result.voice,
            },
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except AssistantVoiceGenerationError as exc:
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
                assistant_service=get_assistant_service(db, actor_id=prepared.user.user_id),
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
        to_profile_request_out_with_diff(db, record)
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
        return to_profile_request_out_with_diff(db, create_profile_request(db, payload))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.post("/profile-requests/{request_id}/approve", response_model=AssistantAgentProfileRequestOut)
def approve_admin_assistant_profile_request(
    request_id: int,
    payload: AssistantAgentProfileRequestDecision,
    db: Session = Depends(get_db),
) -> AssistantAgentProfileRequestOut:
    try:
        return to_profile_request_out_with_diff(db, approve_profile_request(db, request_id=request_id, payload=payload))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.post("/profile-requests/{request_id}/reject", response_model=AssistantAgentProfileRequestOut)
def reject_admin_assistant_profile_request(
    request_id: int,
    payload: AssistantAgentProfileRequestDecision,
    db: Session = Depends(get_db),
) -> AssistantAgentProfileRequestOut:
    try:
        return to_profile_request_out_with_diff(db, reject_profile_request(db, request_id=request_id, payload=payload))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.post("/profile-requests/{request_id}/activate", response_model=AssistantAgentProfileRequestOut)
def activate_admin_assistant_profile_request(
    request_id: int,
    payload: AssistantAgentProfileRequestActivation,
    db: Session = Depends(get_db),
) -> AssistantAgentProfileRequestOut:
    try:
        record = mark_profile_request_activated(db, request_id=request_id, payload=payload)
        db.commit()
        db.refresh(record)
        return to_profile_request_out_with_diff(db, record)
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


@admin_router.post("/agents/{agent_id}/self-update-draft", response_model=AssistantAgentSelfUpdateDraftOut)
async def build_admin_assistant_agent_self_update_draft(
    agent_id: str,
    request: Request,
    payload: AssistantAgentSelfUpdateRequest | None = None,
    db: Session = Depends(get_db),
) -> AssistantAgentSelfUpdateDraftOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    try:
        return await generate_assistant_agent_self_update_draft(
            db,
            agent_id=agent_id,
            payload=payload,
            assistant_service=get_assistant_service(db),
            actor_id=resolve_audit_actor_id(user.user_id),
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@admin_router.get("/agents/{agent_id}/revisions", response_model=list[AssistantAgentRevisionOut])
def list_admin_assistant_agent_revisions(
    agent_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> list[AssistantAgentRevisionOut]:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    record = get_agent_record(db, agent_id.strip().lower())
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant agent not found")

    ensure_agent_publication_snapshot(record)
    rows = list_agent_revisions(db, agent_id=record.agent_id)
    return [_to_agent_revision_out(record, row) for row in rows]


@admin_router.post("/agents/{agent_id}/revisions/{revision_id}/publish", response_model=AssistantAgentAdminOut)
def publish_admin_assistant_agent_revision(
    agent_id: str,
    revision_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantAgentAdminOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    record = get_agent_record(db, agent_id.strip().lower())
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant agent not found")
    revision = get_agent_revision(db, agent_id=record.agent_id, revision_id=revision_id)
    if revision is None:
        raise HTTPException(status_code=404, detail="Assistant agent revision not found")
    if record.latest_revision_id is not None and revision.revision_id != record.latest_revision_id:
        raise HTTPException(
            status_code=409,
            detail="Only the latest assistant agent revision can be published",
        )

    actor_id = resolve_audit_actor_id(user.user_id)
    _publish_agent_revision(db, record=record, revision=revision, actor_id=actor_id)
    db.commit()
    db.refresh(record)
    return to_admin_agent_out(
        record,
        token_budget=summarize_agent_token_budget(db, record),
        eval_gate=build_agent_eval_gate(db, record),
    )


@admin_router.get(
    "/organization-context/definitions",
    response_model=list[AssistantOrganizationContextDefinitionOut],
)
def list_admin_organization_context_definitions(
    request: Request,
    section_key: AssistantOrganizationContextSectionKey | None = None,
    status: AssistantOrganizationContextStatus | None = None,
    definition_key: str | None = None,
    db: Session = Depends(get_db),
) -> list[AssistantOrganizationContextDefinitionOut]:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    return [
        _to_organization_context_definition_out(record)
        for record in list_organization_context_definitions(
            db,
            section_key=section_key,
            status=status,
            definition_key=definition_key.strip().lower() if definition_key is not None else None,
        )
    ]


@admin_router.get(
    "/organization-context/definitions/{definition_id}",
    response_model=AssistantOrganizationContextDefinitionOut,
)
def get_admin_organization_context_definition(
    definition_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantOrganizationContextDefinitionOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    record = get_organization_context_definition(db, definition_id=definition_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Organization context definition not found")
    return _to_organization_context_definition_out(record)


@admin_router.post(
    "/organization-context/definitions",
    response_model=AssistantOrganizationContextDefinitionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_admin_organization_context_definition(
    payload: AssistantOrganizationContextDefinitionCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantOrganizationContextDefinitionOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    try:
        record = create_organization_context_definition(
            db,
            definition_key=payload.definition_key,
            section_key=payload.section_key,
            content_kind=payload.content_kind,
            title=payload.title,
            summary=payload.summary,
            body=payload.body,
            display_order=payload.display_order,
            created_by=resolve_audit_actor_id(payload.created_by),
        )
        db.commit()
    except OrganizationContextRegistryError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    db.refresh(record)
    return _to_organization_context_definition_out(record)


@admin_router.put(
    "/organization-context/definitions/{definition_id}",
    response_model=AssistantOrganizationContextDefinitionOut,
)
def update_admin_organization_context_definition(
    definition_id: int,
    payload: AssistantOrganizationContextDefinitionUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantOrganizationContextDefinitionOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    record = get_organization_context_definition(db, definition_id=definition_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Organization context definition not found")

    try:
        updated_record = update_organization_context_definition(
            db,
            record=record,
            definition_key=payload.definition_key,
            section_key=payload.section_key,
            content_kind=payload.content_kind,
            title=payload.title,
            summary=payload.summary,
            body=payload.body,
            display_order=payload.display_order,
            updated_by=resolve_audit_actor_id(payload.updated_by),
        )
        db.commit()
    except OrganizationContextRegistryError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    db.refresh(updated_record)
    return _to_organization_context_definition_out(updated_record)


@admin_router.post(
    "/organization-context/definitions/{definition_id}/publish",
    response_model=AssistantOrganizationContextDefinitionOut,
)
def publish_admin_organization_context_definition(
    definition_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantOrganizationContextDefinitionOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    record = get_organization_context_definition(db, definition_id=definition_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Organization context definition not found")

    try:
        published_record = publish_organization_context_definition(
            db,
            record=record,
            actor_id=resolve_audit_actor_id(user.user_id),
        )
        db.commit()
    except OrganizationContextRegistryError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    db.refresh(published_record)
    return _to_organization_context_definition_out(published_record)


@admin_router.post(
    "/organization-context/definitions/{definition_id}/retire",
    response_model=AssistantOrganizationContextDefinitionOut,
)
def retire_admin_organization_context_definition(
    definition_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantOrganizationContextDefinitionOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    record = get_organization_context_definition(db, definition_id=definition_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Organization context definition not found")

    retired_record = retire_organization_context_definition(
        db,
        record=record,
        actor_id=resolve_audit_actor_id(user.user_id),
    )
    db.commit()
    db.refresh(retired_record)
    return _to_organization_context_definition_out(retired_record)


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


@admin_router.get("/control-tower/summary", response_model=AssistantControlTowerSummaryOut)
def get_admin_assistant_control_tower_summary(
    request: Request,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    db: Session = Depends(get_db),
) -> AssistantControlTowerSummaryOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    snapshot = build_assistant_control_tower_summary(
        db,
        created_after=created_after,
        created_before=created_before,
    )
    return AssistantControlTowerSummaryOut.model_validate(asdict(snapshot))


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


@admin_router.get("/agent-health-review", response_model=AssistantAgentHealthReviewOut)
def get_admin_assistant_agent_health_review(
    request: Request,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    db: Session = Depends(get_db),
) -> AssistantAgentHealthReviewOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    snapshot = build_assistant_agent_health_review(
        db,
        created_after=created_after,
        created_before=created_before,
    )
    return AssistantAgentHealthReviewOut.model_validate(asdict(snapshot))


@admin_router.get("/agent-work-packages", response_model=list[AssistantAgentWorkPackageOut])
def list_admin_assistant_agent_work_packages(
    request: Request,
    status: str | None = None,
    has_pr: bool | None = None,
    has_commit: bool | None = None,
    has_eval: bool | None = None,
    has_tests: bool | None = None,
    has_docs: bool | None = None,
    db: Session = Depends(get_db),
) -> list[AssistantAgentWorkPackageOut]:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    try:
        records = list_agent_work_packages(
            db,
            status=status,
            has_pr=has_pr,
            has_commit=has_commit,
            has_eval=has_eval,
            has_tests=has_tests,
            has_docs=has_docs,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return [to_agent_work_package_out(record) for record in records]


@admin_router.patch("/agent-work-packages/{work_package_id}", response_model=AssistantAgentWorkPackageOut)
def update_admin_assistant_agent_work_package(
    work_package_id: str,
    payload: AssistantAgentWorkPackageUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantAgentWorkPackageOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    try:
        record = update_agent_work_package(
            db,
            work_package_id=work_package_id,
            status=payload.status,
            updated_by=payload.updated_by if payload.updated_by else user.user_id,
            notes=payload.notes,
            implementation_evidence=(
                payload.implementation_evidence.model_dump(exclude_none=True)
                if payload.implementation_evidence is not None
                else None
            ),
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_agent_work_package_out(record)


@admin_router.post(
    "/agent-health-review/work-packages/{work_package_id}/accept",
    response_model=AssistantAgentWorkPackageOut,
)
def accept_admin_assistant_agent_health_work_package(
    work_package_id: str,
    request: Request,
    payload: AssistantAgentWorkPackageAcceptRequest | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    db: Session = Depends(get_db),
) -> AssistantAgentWorkPackageOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    try:
        record = accept_generated_agent_work_package(
            db,
            work_package_id=work_package_id,
            accepted_by=payload.accepted_by if payload and payload.accepted_by else user.user_id,
            notes=payload.notes if payload else None,
            created_after=created_after,
            created_before=created_before,
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return to_agent_work_package_out(record)


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


@admin_router.post("/agents/{agent_id}/context-preview", response_model=AssistantPromptContextOut)
def preview_admin_assistant_agent_draft_context(
    agent_id: str,
    payload: AssistantAgentUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantPromptContextOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")

    record = get_agent_record(db, agent_id.strip().lower())
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant agent not found")

    _validate_agent_hierarchy_binding(agent_id=record.agent_id, payload=payload)
    policy_defaults = _resolve_agent_profile_defaults(payload)
    _validate_agent_activation(db, agent_id=record.agent_id, payload=payload)
    draft_agent = _build_admin_agent_draft_definition(
        record=record,
        payload=payload,
        policy_defaults=policy_defaults,
    )
    preview_payload = AssistantPromptContextRequest(
        agent_id=record.agent_id,
        provider=payload.provider,
        workspace=_resolve_admin_agent_draft_preview_workspace(payload),
        context=_build_admin_agent_draft_preview_context(
            record=record,
            payload=payload,
            policy_defaults=policy_defaults,
        ),
        use_live_tools="READ" in {capability.upper() for capability in payload.capabilities},
    )
    provider, model, warnings = resolve_effective_runtime(preview_payload, draft_agent)
    prompt_context = build_prompt_context(
        payload=preview_payload,
        user=user,
        db=db,
        agent_definition=draft_agent,
    )
    return AssistantPromptContextOut(
        agent_id=prompt_context.agent_id,
        agent_name=prompt_context.agent_name,
        agent_role_key=prompt_context.agent_role_key,
        agent_profile_kind=prompt_context.agent_profile_kind,
        provider=provider.provider,
        model=model,
        generated_at=prompt_context.generated_at,
        warnings=[
            (
                "Draft preview is built from an unsaved admin agent payload; "
                "save the agent to make these construction changes runtime-active."
            ),
            *warnings,
            *prompt_context.warnings,
            *_build_prompt_context_preview_warnings(list(prompt_context.sections)),
        ],
        sections=[_to_prompt_section_out(section) for section in prompt_context.sections],
        rendered_system_prompt=prompt_context.system_prompt,
    )


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
        orchestration_pattern=payload.orchestration_pattern,
        parent_agent_id=payload.parent_agent_id,
        managed_agent_ids=list(payload.managed_agent_ids),
        delegation_guidance=payload.delegation_guidance,
        profile_request_id=payload.profile_request_id,
        allowed_workspaces=list(payload.allowed_workspaces),
        capabilities=list(payload.capabilities),
        skills=list(policy_defaults.skills),
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
    create_agent_revision(
        db,
        record=record,
        payload=serialize_agent_revision_payload(record),
        change_summary=["Initial assistant agent snapshot."],
        created_by=actor_id,
        version=record.version,
        published=record.status != "DRAFT",
        created_at=now,
    )
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
    _validate_agent_hierarchy_binding(agent_id=record.agent_id, payload=payload)

    old_status = record.status
    previous_payload = serialize_agent_revision_payload(record)
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
    record.orchestration_pattern = payload.orchestration_pattern
    record.parent_agent_id = payload.parent_agent_id
    record.managed_agent_ids = list(payload.managed_agent_ids)
    record.delegation_guidance = payload.delegation_guidance
    record.profile_request_id = payload.profile_request_id
    record.allowed_workspaces = list(payload.allowed_workspaces)
    record.capabilities = list(payload.capabilities)
    record.skills = list(policy_defaults.skills)
    record.allowed_tools = list(policy_defaults.allowed_tools)
    record.allowed_action_types = list(policy_defaults.allowed_action_types)
    record.daily_token_allocation = payload.daily_token_allocation
    record.system_prompt = payload.system_prompt
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version = next_agent_revision_version(db, record=record)
    db.flush()
    create_agent_revision(
        db,
        record=record,
        payload=serialize_agent_revision_payload(record),
        change_summary=_build_agent_change_summary(previous_payload, serialize_agent_revision_payload(record)),
        created_by=record.updated_by,
        version=record.version,
        published=record.status != "DRAFT",
        created_at=record.updated_at,
    )
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


def _publish_agent_revision(
    db: Session,
    *,
    record: AssistantAgent,
    revision: AssistantAgentRevision,
    actor_id: str,
) -> None:
    payload = AssistantAgentRevisionPayloadOut.model_validate(normalize_agent_revision_payload(revision.payload))
    _validate_agent_hierarchy_binding(agent_id=record.agent_id, payload=payload)
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
    record.orchestration_pattern = payload.orchestration_pattern
    record.parent_agent_id = payload.parent_agent_id
    record.managed_agent_ids = list(payload.managed_agent_ids)
    record.delegation_guidance = payload.delegation_guidance
    record.profile_request_id = payload.profile_request_id
    record.allowed_workspaces = list(payload.allowed_workspaces)
    record.capabilities = list(payload.capabilities)
    record.skills = list(policy_defaults.skills)
    record.allowed_tools = list(policy_defaults.allowed_tools)
    record.allowed_action_types = list(policy_defaults.allowed_action_types)
    record.daily_token_allocation = payload.daily_token_allocation
    record.system_prompt = payload.system_prompt
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = actor_id
    record.version = max(int(record.version or 0), int(revision.version or 0))
    record.latest_revision_id = revision.revision_id
    record.published_revision_id = revision.revision_id
    record.published_snapshot = normalize_agent_revision_payload(revision.payload)
    record.published_at = record.updated_at
    record.published_by = actor_id
    revision.published_at = record.updated_at
    revision.published_by = actor_id
    db.flush()
    _seed_profile_request_evals_for_agent(db, record=record, actor_id=actor_id)
    _validate_agent_activation(db, agent_id=record.agent_id, payload=payload)
    if old_status != "ACTIVE" and record.status == "ACTIVE":
        _mark_profile_request_activated_for_agent(db, record=record, actor_id=actor_id)
    _record_agent_provenance(
        db,
        record=record,
        operation_key=_agent_status_operation_key(old_status=old_status, new_status=record.status),
        action=record.status.lower() if old_status != record.status else "published",
    )


def _to_agent_revision_out(record: AssistantAgent, revision: AssistantAgentRevision) -> AssistantAgentRevisionOut:
    baseline_payload = None
    if record.published_revision_id != revision.revision_id:
        baseline_payload = record.published_snapshot
    return AssistantAgentRevisionOut(
        revision_id=revision.revision_id,
        agent_id=revision.agent_id,
        version=revision.version,
        change_summary=list(revision.change_summary or []),
        diff_summary=build_agent_revision_diff_summary(baseline_payload, revision.payload),
        payload=AssistantAgentRevisionPayloadOut.model_validate(normalize_agent_revision_payload(revision.payload)),
        created_at=revision.created_at,
        created_by=revision.created_by,
        published_at=revision.published_at,
        published_by=revision.published_by,
        restored_from_revision_id=revision.restored_from_revision_id,
        is_published=revision.published_at is not None,
    )


def _build_agent_change_summary(
    previous_payload: dict[str, object],
    next_payload: dict[str, object],
) -> list[str]:
    diff_summary = build_agent_revision_diff_summary(previous_payload, next_payload)
    if not diff_summary:
        return ["No material profile changes recorded."]
    return [
        f"{entry['label']}: {entry['current_value']} -> {entry['next_value']}"
        for entry in diff_summary[:6]
    ]


def _build_admin_agent_draft_definition(
    *,
    record: AssistantAgent,
    payload: AssistantAgentUpdate,
    policy_defaults: AssistantAgentProfilePolicyDefaults,
) -> ManagedAssistantAgent:
    return ManagedAssistantAgent(
        agent_id=record.agent_id,
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
        orchestration_pattern=payload.orchestration_pattern,
        parent_agent_id=payload.parent_agent_id,
        managed_agent_ids=tuple(payload.managed_agent_ids),
        delegation_guidance=payload.delegation_guidance,
        allowed_workspaces=tuple(payload.allowed_workspaces),
        capabilities=tuple(payload.capabilities),
        skills=tuple(policy_defaults.skills),
        allowed_tools=tuple(policy_defaults.allowed_tools),
        allowed_action_types=tuple(policy_defaults.allowed_action_types),
        system_prompt=payload.system_prompt,
    )


def _resolve_admin_agent_draft_preview_workspace(
    payload: AssistantAgentUpdate,
) -> AssistantWorkspace | None:
    allowed_workspaces = list(payload.allowed_workspaces)
    for preferred_workspace in ("admin", "assistant"):
        if preferred_workspace in allowed_workspaces:
            return cast(AssistantWorkspace, preferred_workspace)
    if allowed_workspaces:
        return allowed_workspaces[0]
    return None


def _build_admin_agent_draft_preview_context(
    *,
    record: AssistantAgent,
    payload: AssistantAgentUpdate,
    policy_defaults: AssistantAgentProfilePolicyDefaults,
) -> str:
    return "\n".join(
        [
            "Admin managed-agent draft construction preview",
            f"saved_agent_id: {record.agent_id}",
            f"draft_name: {payload.name}",
            f"draft_profile_kind: {payload.profile_kind}",
            f"draft_status: {payload.status}",
            f"draft_scope: {payload.scope}",
            _format_agent_draft_context_line("role_key", payload.role_key),
            _format_agent_draft_context_line("human_owner_role", payload.human_owner_role),
            _format_agent_draft_context_line("authority_ceiling", payload.authority_ceiling),
            f"effective_workspaces: {_format_agent_draft_context_values(payload.allowed_workspaces)}",
            f"effective_capabilities: {_format_agent_draft_context_values(payload.capabilities)}",
            f"effective_skills: {_format_agent_draft_context_values(policy_defaults.skills)}",
            f"effective_tools: {_format_agent_draft_context_values(policy_defaults.allowed_tools)}",
            f"effective_actions: {_format_agent_draft_context_values(policy_defaults.allowed_action_types)}",
            f"orchestration_pattern: {payload.orchestration_pattern}",
            _format_agent_draft_context_line("parent_agent_id", payload.parent_agent_id),
            f"managed_agent_ids: {_format_agent_draft_context_values(payload.managed_agent_ids)}",
            _format_agent_draft_context_line("delegation_guidance", payload.delegation_guidance),
            (
                "review_goal: Show the unsaved context, policy, hierarchy, skills, prompt layers, "
                "tool access, and action access before an admin saves the agent."
            ),
        ]
    )


def _format_agent_draft_context_line(label: str, value: object | None) -> str:
    if value is None or value == "":
        return f"{label}: none"
    return f"{label}: {value}"


def _format_agent_draft_context_values(values: tuple[str, ...] | list[str]) -> str:
    return ", ".join(values) if values else "none"


def _to_prompt_section_out(section: AssistantPromptSection) -> AssistantPromptSectionOut:
    return AssistantPromptSectionOut(
        contract_key=section.contract_key,
        contract_version=section.contract_version,
        key=section.key,
        title=section.title,
        source=section.source,
        scope=section.scope,
        kind=section.kind,
        owner=section.owner,
        owner_reference=section.owner_reference,
        freshness=section.freshness,
        merge_strategy=section.merge_strategy,
        uses_fallback=section.uses_fallback,
        content=section.content,
    )


def _to_organization_context_definition_out(
    record,
) -> AssistantOrganizationContextDefinitionOut:
    return AssistantOrganizationContextDefinitionOut(
        id=record.id,
        definition_key=record.definition_key,
        section_key=record.section_key,
        content_kind=record.content_kind,
        title=record.title,
        summary=record.summary,
        body=record.body,
        scope=record.scope,
        status=record.status,
        version=record.version,
        display_order=record.display_order,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        published_at=record.published_at,
        published_by=record.published_by,
        retired_at=record.retired_at,
        retired_by=record.retired_by,
        is_editable=record.status == "DRAFT",
    )


def _iter_text_chunks(text: str, chunk_size: int = 160) -> list[str]:
    if not text:
        return []
    return [text[index : index + chunk_size] for index in range(0, len(text), chunk_size)]


def _encode_sse(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _resolve_agent_profile_defaults(
    payload: AssistantAgentCreate | AssistantAgentUpdate | AssistantAgentRevisionPayloadOut,
) -> AssistantAgentProfilePolicyDefaults:
    defaults = resolve_agent_profile_policy_defaults(
        role_key=payload.role_key,
        profile_kind=payload.profile_kind,
        capabilities=tuple(payload.capabilities),
        skills=tuple(payload.skills),
        allowed_tools=tuple(payload.allowed_tools),
        allowed_action_types=tuple(payload.allowed_action_types),
    )
    try:
        validate_agent_profile_definition(
            agent_name=payload.name,
            agent_id=getattr(payload, "agent_id", None),
            role_key=payload.role_key,
            profile_kind=payload.profile_kind,
            scope=payload.scope,
            allowed_workspaces=tuple(payload.allowed_workspaces),
            capabilities=tuple(payload.capabilities),
            skills=defaults.skills,
            allowed_tools=defaults.allowed_tools,
            allowed_action_types=defaults.allowed_action_types,
            authority_ceiling=payload.authority_ceiling,
            orchestration_pattern=payload.orchestration_pattern,
            parent_agent_id=payload.parent_agent_id,
            managed_agent_ids=tuple(payload.managed_agent_ids),
        )
    except AssistantAgentProfilePolicyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return defaults


def _validate_agent_activation(
    db: Session,
    *,
    agent_id: str,
    payload: AssistantAgentCreate | AssistantAgentUpdate | AssistantAgentRevisionPayloadOut,
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


def _validate_agent_hierarchy_binding(
    *,
    agent_id: str,
    payload: AssistantAgentUpdate | AssistantAgentRevisionPayloadOut,
) -> None:
    if payload.parent_agent_id == agent_id:
        raise HTTPException(status_code=400, detail="parent_agent_id cannot match agent_id")
    if agent_id in set(payload.managed_agent_ids):
        raise HTTPException(status_code=400, detail="managed_agent_ids cannot include agent_id")


def _mark_profile_request_activated_for_agent(
    db: Session,
    *,
    record: AssistantAgent,
    actor_id: str,
) -> None:
    if record.profile_request_id is None:
        return
    linked_revision_id = record.published_revision_id or record.latest_revision_id
    if linked_revision_id is None:
        raise HTTPException(
            status_code=409,
            detail="Assistant agent profile request activation requires a saved agent revision.",
        )
    try:
        mark_profile_request_activated(
            db,
            request_id=record.profile_request_id,
            payload=AssistantAgentProfileRequestActivation(
                activated_by=actor_id,
                linked_agent_id=record.agent_id,
                linked_revision_id=linked_revision_id,
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
            "capability_count": len(record.capabilities or []),
            "skill_count": len(record.skills or []),
            "tool_count": len(record.allowed_tools or []),
            "action_type_count": len(record.allowed_action_types or []),
        },
    )
