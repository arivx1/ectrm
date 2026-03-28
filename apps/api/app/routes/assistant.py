from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role, resolve_audit_actor_id, resolve_session_principal
from apps.api.app.core.query_params import ADMIN_LIST_LIMIT_QUERY, LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.assistant.services.action_requests import (
    AssistantActionRequestError,
    approve_action_request,
    create_action_requests,
    get_action_request,
    list_action_requests,
    reject_action_request,
    to_action_request_out,
    to_action_request_out_list,
)
from apps.api.app.domains.assistant.services.action_runtime import AssistantActionRuntimeResult, plan_action_requests
from apps.api.app.domains.assistant.services.chat import (
    AssistantService,
    AssistantServiceError,
    build_assistant_runtime_settings,
    resolve_effective_runtime,
)
from apps.api.app.domains.assistant.services.conversations import (
    create_assistant_conversation,
    get_assistant_conversation,
    list_assistant_conversations,
    to_assistant_conversation_out,
    to_assistant_conversation_summary_out,
    update_assistant_conversation_after_run,
)
from apps.api.app.domains.assistant.services.prompt_context import (
    AssistantPromptEnvelope,
    AssistantPromptSection,
    AssistantPromptUser,
    build_prompt_context,
    render_prompt_sections,
)
from apps.api.app.domains.assistant.services.runs import (
    attach_run_metadata,
    create_assistant_run,
    get_assistant_run,
    list_assistant_runs,
    to_assistant_run_out,
    to_assistant_run_summary_out,
)
from apps.api.app.domains.assistant.services.registry import (
    ACTIVE_ASSISTANT_AGENT_STATUS,
    ManagedAssistantAgent,
    get_agent_record,
    list_admin_agent_records,
    list_public_agent_records,
    to_admin_agent_out,
    to_managed_agent,
    to_public_agent_out,
)
from apps.api.app.domains.assistant.services.tools import list_tool_names
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_conversation import AssistantConversation
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.assistant import (
    AssistantActionRequestOut,
    AssistantAgentAdminOut,
    AssistantAgentCreate,
    AssistantAgentOut,
    AssistantConversationOut,
    AssistantConversationSummaryOut,
    AssistantAgentUpdate,
    AssistantPromptContextOut,
    AssistantPromptContextRequest,
    AssistantPromptSectionOut,
    AssistantPromptRequest,
    AssistantPromptResponse,
    AssistantRunOut,
    AssistantRunSummaryOut,
    AssistantRuntimeSettingsOut,
)

router = APIRouter(prefix="/assistant", tags=["assistant"])
admin_router = APIRouter(prefix="/admin/assistant", tags=["assistant-admin"])


@dataclass(frozen=True)
class PreparedAssistantExecution:
    user: AssistantPromptUser
    agent_definition: ManagedAssistantAgent | None
    provider_name: str
    model_name: str
    runtime_warnings: tuple[str, ...]
    prompt_context: AssistantPromptEnvelope
    action_runtime_result: AssistantActionRuntimeResult
    conversation: AssistantConversation


def get_assistant_service(db: Session) -> AssistantService:
    return AssistantService(db)


@router.get("/settings", response_model=AssistantRuntimeSettingsOut)
def get_assistant_settings() -> AssistantRuntimeSettingsOut:
    return build_assistant_runtime_settings()


@router.get("/agents", response_model=list[AssistantAgentOut])
def list_assistant_agents(db: Session = Depends(get_db)) -> list[AssistantAgentOut]:
    return [to_public_agent_out(record) for record in list_public_agent_records(db)]


@router.get("/conversations", response_model=list[AssistantConversationSummaryOut])
def list_current_user_assistant_conversations(
    request: Request,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantConversationSummaryOut]:
    user = _resolve_prompt_user(request, db)
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
    user = _resolve_prompt_user(request, db)
    record = _resolve_accessible_conversation(db, conversation_id, user)
    return to_assistant_conversation_out(db, record)


@router.get("/runs", response_model=list[AssistantRunSummaryOut])
def list_current_user_assistant_runs(
    request: Request,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantRunSummaryOut]:
    user = _resolve_prompt_user(request, db)
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
    user = _resolve_prompt_user(request, db)
    record = get_assistant_run(db, run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant run not found")
    if record.user_id != user.user_id and not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="You do not have access to this assistant run")
    return to_assistant_run_out(record)


@router.get("/action-requests/{action_request_id}", response_model=AssistantActionRequestOut)
def get_current_user_assistant_action_request(
    action_request_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantActionRequestOut:
    user = _resolve_prompt_user(request, db)
    record = _resolve_accessible_action_request(db, action_request_id, user)
    return to_action_request_out(record)


@router.get("/action-requests", response_model=list[AssistantActionRequestOut])
def list_current_user_assistant_action_requests(
    request: Request,
    status: str | None = None,
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantActionRequestOut]:
    user = _resolve_prompt_user(request, db)
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
    user = _resolve_prompt_user(request, db)
    record = _resolve_accessible_action_request(db, action_request_id, user)
    try:
        return to_action_request_out(
            approve_action_request(
                db=db,
                record=record,
                actor_id=user.user_id,
            )
        )
    except AssistantActionRequestError as exc:
        raise HTTPException(status_code=409, detail=exc.detail) from exc


@router.post("/action-requests/{action_request_id}/reject", response_model=AssistantActionRequestOut)
def reject_current_user_assistant_action_request(
    action_request_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantActionRequestOut:
    user = _resolve_prompt_user(request, db)
    record = _resolve_accessible_action_request(db, action_request_id, user)
    try:
        return to_action_request_out(
            reject_action_request(
                db=db,
                record=record,
                actor_id=user.user_id,
            )
        )
    except AssistantActionRequestError as exc:
        raise HTTPException(status_code=409, detail=exc.detail) from exc


@router.post("/context", response_model=AssistantPromptContextOut)
def preview_assistant_prompt_context(
    payload: AssistantPromptContextRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AssistantPromptContextOut:
    agent_definition = _resolve_agent_definition_for_request(db, payload)
    user = _resolve_prompt_user(request, db)
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
    prepared: PreparedAssistantExecution | None = None
    try:
        prepared = _prepare_assistant_execution(payload, request, db)
        response, _ = await _execute_assistant_request(
            payload=payload,
            db=db,
            prepared=prepared,
        )
        return response
    except AssistantServiceError as exc:
        if prepared is not None:
            _record_failed_assistant_execution(
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
    prepared = _prepare_assistant_execution(payload, request, db)

    async def event_stream():
        yield _encode_sse(
            "conversation",
            to_assistant_conversation_summary_out(prepared.conversation).model_dump(mode="json"),
        )
        yield _encode_sse("status", {"phase": "running"})
        try:
            response, _ = await _execute_assistant_request(
                payload=payload,
                db=db,
                prepared=prepared,
            )
        except AssistantServiceError as exc:
            _record_failed_assistant_execution(
                payload=payload,
                db=db,
                prepared=prepared,
                detail=exc.detail,
            )
            yield _encode_sse("error", {"detail": exc.detail})
            return

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


@admin_router.get("/agents", response_model=list[AssistantAgentAdminOut])
def list_admin_assistant_agents(db: Session = Depends(get_db)) -> list[AssistantAgentAdminOut]:
    return [to_admin_agent_out(record) for record in list_admin_agent_records(db)]


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


@admin_router.get("/action-requests", response_model=list[AssistantActionRequestOut])
def list_admin_assistant_action_requests(
    request: Request,
    status: str | None = None,
    limit: int = ADMIN_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AssistantActionRequestOut]:
    user = _resolve_prompt_user(request, db)
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrative access is required")
    return to_action_request_out_list(
        list_action_requests(
            db,
            limit=limit,
            offset=offset,
            status=status,
        )
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
    return to_admin_agent_out(record)


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
    record.system_prompt = payload.system_prompt
    record.updated_at = datetime.now(timezone.utc)
    record.updated_by = resolve_audit_actor_id(payload.updated_by)
    record.version += 1
    db.commit()
    db.refresh(record)
    return to_admin_agent_out(record)


def _resolve_agent_definition_for_request(
    db: Session,
    payload: AssistantPromptContextRequest,
) -> ManagedAssistantAgent | None:
    if payload.agent_id is None:
        return None

    record = get_agent_record(db, payload.agent_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent not found")
    if record.status != ACTIVE_ASSISTANT_AGENT_STATUS:
        raise AssistantServiceError(
            status_code=409,
            detail=f"{record.name} is not active and cannot answer requests.",
        )

    agent_definition = to_managed_agent(record)
    if payload.workspace and payload.workspace not in agent_definition.allowed_workspaces:
        raise AssistantServiceError(
            status_code=400,
            detail=f"{record.name} is not configured for the {payload.workspace} workspace.",
        )

    return agent_definition


def _resolve_prompt_user(request: Request, db: Session) -> AssistantPromptUser:
    principal = resolve_session_principal(db, request.headers.get("authorization"))
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication is required")

    record = db.get(UserAccount, principal.user_id)
    if record is None:
        raise HTTPException(status_code=401, detail="Authentication is required")

    return AssistantPromptUser(
        user_id=record.user_id,
        display_name=record.display_name,
        role=record.role,
        email=record.email,
        session_id=principal.session_id,
        session_expires_at=principal.expires_at,
    )


def _to_prompt_section_out(section: AssistantPromptSection) -> AssistantPromptSectionOut:
    return AssistantPromptSectionOut(
        key=section.key,
        title=section.title,
        source=section.source,
        content=section.content,
    )


def _apply_prompt_enrichment(
    prompt_context,
    *,
    sections: tuple[AssistantPromptSection, ...],
    warnings: tuple[str, ...],
):
    if not sections and not warnings:
        return prompt_context

    next_sections = (*prompt_context.sections, *sections)
    next_warnings = (*prompt_context.warnings, *warnings)
    return prompt_context.__class__(
        generated_at=prompt_context.generated_at,
        agent_id=prompt_context.agent_id,
        agent_name=prompt_context.agent_name,
        system_prompt=render_prompt_sections(next_sections),
        sections=next_sections,
        warnings=next_warnings,
    )


def _resolve_accessible_action_request(
    db: Session,
    action_request_id: int,
    user: AssistantPromptUser,
):
    record = get_action_request(db, action_request_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant action request not found")
    if record.user_id != user.user_id and not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="You do not have access to this assistant action request")
    return record


def _resolve_accessible_conversation(
    db: Session,
    conversation_id: int,
    user: AssistantPromptUser,
) -> AssistantConversation:
    record = get_assistant_conversation(db, conversation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Assistant conversation not found")
    if record.user_id != user.user_id and not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="You do not have access to this assistant conversation")
    return record


def _prepare_assistant_execution(
    payload: AssistantPromptRequest,
    request: Request,
    db: Session,
) -> PreparedAssistantExecution:
    agent_definition = _resolve_agent_definition_for_request(db, payload)
    user = _resolve_prompt_user(request, db)
    provider_config, model_name, runtime_warnings = resolve_effective_runtime(payload, agent_definition)
    conversation = _resolve_conversation_for_request(
        db=db,
        payload=payload,
        user=user,
        agent_definition=agent_definition,
        provider_name=provider_config.provider,
        model_name=model_name,
    )
    prompt_context = build_prompt_context(
        payload=payload,
        user=user,
        db=db,
        agent_definition=agent_definition,
    )
    action_runtime_result = plan_action_requests(
        payload=payload,
        db=db,
        agent_definition=agent_definition,
    )
    prompt_context = _apply_prompt_enrichment(
        prompt_context,
        sections=action_runtime_result.sections,
        warnings=action_runtime_result.warnings,
    )
    return PreparedAssistantExecution(
        user=user,
        agent_definition=agent_definition,
        provider_name=provider_config.provider,
        model_name=model_name,
        runtime_warnings=tuple(runtime_warnings),
        prompt_context=prompt_context,
        action_runtime_result=action_runtime_result,
        conversation=conversation,
    )


async def _execute_assistant_request(
    *,
    payload: AssistantPromptRequest,
    db: Session,
    prepared: PreparedAssistantExecution,
) -> tuple[AssistantPromptResponse, AssistantConversation]:
    service = get_assistant_service(db)
    response = await service.generate_response(
        payload,
        agent_definition=prepared.agent_definition,
        prompt_context=prepared.prompt_context,
    )
    if not isinstance(response, AssistantPromptResponse):
        response = AssistantPromptResponse.model_validate(response)

    run_record = create_assistant_run(
        db=db,
        conversation_id=prepared.conversation.id,
        status="COMPLETED",
        user_id=prepared.user.user_id,
        session_id=prepared.user.session_id,
        user_role=prepared.user.role,
        workspace=payload.workspace,
        agent_id=response.agent_id,
        agent_name=response.agent_name,
        provider=response.provider,
        model=response.model,
        use_live_tools=payload.use_live_tools,
        request_messages=payload.messages,
        application_context=payload.context,
        prompt_sections=[_to_prompt_section_out(section) for section in prepared.prompt_context.sections],
        rendered_system_prompt=prepared.prompt_context.system_prompt,
        warnings=response.warnings,
        tool_calls=response.tool_calls,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        assistant_message=response.message.content,
    )

    response.action_requests = to_action_request_out_list(
        create_action_requests(
            db=db,
            run_id=run_record.id,
            user_id=prepared.user.user_id,
            session_id=prepared.user.session_id,
            workspace=payload.workspace,
            agent_id=response.agent_id,
            agent_name=response.agent_name,
            proposals=prepared.action_runtime_result.proposals,
        )
    )

    updated_conversation = update_assistant_conversation_after_run(
        db=db,
        record=prepared.conversation,
        run_record=run_record,
        workspace=payload.workspace,
        agent_id=response.agent_id,
        agent_name=response.agent_name,
        provider=response.provider,
        model=response.model,
        use_live_tools=payload.use_live_tools,
        latest_user_message=_latest_request_user_message(payload),
        latest_assistant_message=response.message.content,
    )

    response = attach_run_metadata(response, run_record)
    response.conversation_id = updated_conversation.id
    response.conversation_updated_at = updated_conversation.updated_at
    return response, updated_conversation


def _record_failed_assistant_execution(
    *,
    payload: AssistantPromptRequest,
    db: Session,
    prepared: PreparedAssistantExecution,
    detail: str,
) -> None:
    run_record = create_assistant_run(
        db=db,
        conversation_id=prepared.conversation.id,
        status="FAILED",
        user_id=prepared.user.user_id,
        session_id=prepared.user.session_id,
        user_role=prepared.user.role,
        workspace=payload.workspace,
        agent_id=prepared.prompt_context.agent_id,
        agent_name=prepared.prompt_context.agent_name,
        provider=prepared.provider_name,
        model=prepared.model_name,
        use_live_tools=payload.use_live_tools,
        request_messages=payload.messages,
        application_context=payload.context,
        prompt_sections=[_to_prompt_section_out(section) for section in prepared.prompt_context.sections],
        rendered_system_prompt=prepared.prompt_context.system_prompt,
        warnings=[*prepared.runtime_warnings, *prepared.prompt_context.warnings],
        tool_calls=[],
        input_tokens=None,
        output_tokens=None,
        assistant_message=None,
        error_detail=detail,
    )
    update_assistant_conversation_after_run(
        db=db,
        record=prepared.conversation,
        run_record=run_record,
        workspace=payload.workspace,
        agent_id=prepared.prompt_context.agent_id,
        agent_name=prepared.prompt_context.agent_name,
        provider=prepared.provider_name,
        model=prepared.model_name,
        use_live_tools=payload.use_live_tools,
        latest_user_message=_latest_request_user_message(payload),
        latest_assistant_message=detail,
    )


def _resolve_conversation_for_request(
    *,
    db: Session,
    payload: AssistantPromptRequest,
    user: AssistantPromptUser,
    agent_definition: ManagedAssistantAgent | None,
    provider_name: str,
    model_name: str,
) -> AssistantConversation:
    if payload.conversation_id is not None:
        conversation = get_assistant_conversation(db, payload.conversation_id)
        if conversation is None:
            raise AssistantServiceError(status_code=404, detail="Assistant conversation not found")
        if conversation.user_id != user.user_id and not is_admin_role(user.role):
            raise AssistantServiceError(status_code=403, detail="You do not have access to this assistant conversation")
        return conversation

    return create_assistant_conversation(
        db=db,
        user_id=user.user_id,
        session_id=user.session_id,
        user_role=user.role,
        workspace=payload.workspace,
        agent_id=agent_definition.agent_id if agent_definition is not None else None,
        agent_name=agent_definition.name if agent_definition is not None else None,
        provider=provider_name,
        model=model_name,
        use_live_tools=payload.use_live_tools,
        title=_latest_request_user_message(payload) or "New conversation",
    )


def _latest_request_user_message(payload: AssistantPromptRequest) -> str | None:
    for message in reversed(payload.messages):
        if message.role == "user":
            return message.content
    return None


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
