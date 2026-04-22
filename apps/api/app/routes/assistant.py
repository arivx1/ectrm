from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role, resolve_audit_actor_id
from apps.api.app.core.query_params import ADMIN_LIST_LIMIT_QUERY, LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.assistant.services.audit_traces import build_assistant_run_audit_trace
from apps.api.app.domains.assistant.services.action_requests import (
    list_action_requests,
    list_action_request_page,
    to_action_request_out,
    to_action_request_out_list,
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
from apps.api.app.domains.assistant.services.tools import list_tool_names
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.schemas.assistant import (
    ALL_ASSISTANT_ACTION_TYPES,
    AssistantActionRequestAdminPageOut,
    AssistantActionRequestOut,
    AssistantAgentAdminOut,
    AssistantAgentBuildRequest,
    AssistantAgentBuildSuggestionOut,
    AssistantAgentCreate,
    AssistantAgentOut,
    AssistantAgentRoleArchetypeOut,
    AssistantConversationOut,
    AssistantConversationSummaryOut,
    AssistantAgentUpdate,
    AssistantPromptContextOut,
    AssistantPromptContextRequest,
    AssistantPromptSectionOut,
    AssistantPromptRequest,
    AssistantPromptResponse,
    AssistantRunAuditTraceOut,
    AssistantRunOut,
    AssistantRunSummaryOut,
    AssistantRuntimeSettingsOut,
)

router = APIRouter(prefix="/assistant", tags=["assistant"])
admin_router = APIRouter(prefix="/admin/assistant", tags=["assistant-admin"])


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
        to_public_agent_out(record, token_budget=token_budgets.get(record.agent_id))
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
    return to_assistant_conversation_out(db, record)


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
    db: Session = Depends(get_db),
) -> AssistantActionRequestOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        return to_action_request_out(
            approve_assistant_action_request_for_user(
                db=db,
                action_request_id=action_request_id,
                user=user,
            )
        )
    except AssistantServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/action-requests/{action_request_id}/reject", response_model=AssistantActionRequestOut)
def reject_current_user_assistant_action_request(
    action_request_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantActionRequestOut:
    try:
        user = resolve_prompt_user(db=db, authorization_header=request.headers.get("authorization"))
        return to_action_request_out(
            reject_assistant_action_request_for_user(
                db=db,
                action_request_id=action_request_id,
                user=user,
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
    return [to_role_archetype_out(role) for role in list_role_archetypes()]


@admin_router.get("/role-archetypes/{role_key}", response_model=AssistantAgentRoleArchetypeOut)
def get_admin_assistant_role_archetype(role_key: str) -> AssistantAgentRoleArchetypeOut:
    role = get_role_archetype(role_key)
    if role is None:
        raise HTTPException(status_code=404, detail="Assistant agent role archetype not found")
    return to_role_archetype_out(role)


@admin_router.get("/agents", response_model=list[AssistantAgentAdminOut])
def list_admin_assistant_agents(db: Session = Depends(get_db)) -> list[AssistantAgentAdminOut]:
    records = list_admin_agent_records(db)
    token_budgets = summarize_agent_token_budgets(db, records)
    return [
        to_admin_agent_out(record, token_budget=token_budgets.get(record.agent_id))
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
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantRunSummaryOut]:
    return [
        to_assistant_run_summary_out(record)
        for record in list_assistant_runs(db, limit=limit, offset=offset)
    ]


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
            "avg_decision_seconds": page.summary.avg_decision_seconds,
        },
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
    allowed_tools = _resolve_allowed_tools(payload.allowed_tools, payload.capabilities)
    allowed_action_types = _resolve_allowed_action_types(payload.allowed_action_types, payload.capabilities)
    record = AssistantAgent(
        agent_id=payload.agent_id,
        name=payload.name,
        description=payload.description,
        status=payload.status,
        scope=payload.scope,
        provider=payload.provider,
        model=payload.model,
        allowed_workspaces=list(payload.allowed_workspaces),
        capabilities=list(payload.capabilities),
        allowed_tools=allowed_tools,
        allowed_action_types=allowed_action_types,
        daily_token_allocation=payload.daily_token_allocation,
        system_prompt=payload.system_prompt,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assistant agent already exists") from exc
    db.refresh(record)
    return to_admin_agent_out(record, token_budget=summarize_agent_token_budget(db, record))


@admin_router.put("/agents/{agent_id}", response_model=AssistantAgentAdminOut)
def update_assistant_agent(
    agent_id: str,
    payload: AssistantAgentUpdate,
    db: Session = Depends(get_db),
) -> AssistantAgentAdminOut:
    record = get_agent_record(db, agent_id.strip().lower())
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant agent not found")

    record.name = payload.name
    record.description = payload.description
    record.status = payload.status
    record.scope = payload.scope
    record.provider = payload.provider
    record.model = payload.model
    record.allowed_workspaces = list(payload.allowed_workspaces)
    record.capabilities = list(payload.capabilities)
    record.allowed_tools = _resolve_allowed_tools(payload.allowed_tools, payload.capabilities)
    record.allowed_action_types = _resolve_allowed_action_types(payload.allowed_action_types, payload.capabilities)
    record.daily_token_allocation = payload.daily_token_allocation
    record.system_prompt = payload.system_prompt
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    db.commit()
    db.refresh(record)
    return to_admin_agent_out(record, token_budget=summarize_agent_token_budget(db, record))


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


def _resolve_allowed_tools(
    allowed_tools: list[str],
    capabilities: list[str],
) -> list[str]:
    available_tool_names = list(list_tool_names())
    available_tool_name_set = set(available_tool_names)
    invalid_tool_names = [tool_name for tool_name in allowed_tools if tool_name not in available_tool_name_set]
    if invalid_tool_names:
        invalid_label = ", ".join(invalid_tool_names)
        raise HTTPException(
            status_code=400,
            detail=f"Unknown assistant tools requested: {invalid_label}",
        )

    if "READ" in {capability.upper() for capability in capabilities} and not allowed_tools:
        return available_tool_names
    return list(allowed_tools)


def _resolve_allowed_action_types(
    allowed_action_types: list[str],
    capabilities: list[str],
) -> list[str]:
    normalized_capabilities = {capability.upper() for capability in capabilities}
    if allowed_action_types and "ACTION" not in normalized_capabilities:
        raise HTTPException(
            status_code=400,
            detail="allowed_action_types can only be set for agents with the ACTION capability.",
        )

    available_action_type_set = set(ALL_ASSISTANT_ACTION_TYPES)
    invalid_action_types = [action_type for action_type in allowed_action_types if action_type not in available_action_type_set]
    if invalid_action_types:
        invalid_label = ", ".join(invalid_action_types)
        raise HTTPException(
            status_code=400,
            detail=f"Unknown assistant action types requested: {invalid_label}",
        )

    if "ACTION" in normalized_capabilities and not allowed_action_types:
        return list(ALL_ASSISTANT_ACTION_TYPES)
    return list(allowed_action_types)
