from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role, resolve_audit_actor_id, resolve_session_principal
from apps.api.app.core.query_params import ADMIN_LIST_LIMIT_QUERY, LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.assistant.services.chat import (
    AssistantService,
    AssistantServiceError,
    build_assistant_runtime_settings,
    resolve_effective_runtime,
)
from apps.api.app.domains.assistant.services.prompt_context import (
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
from apps.api.app.domains.assistant.services.tool_runtime import execute_live_tools
from apps.api.app.domains.assistant.services.tools import list_tool_names
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.assistant import (
    AssistantAgentAdminOut,
    AssistantAgentCreate,
    AssistantAgentOut,
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


def get_assistant_service(db: Session) -> AssistantService:
    return AssistantService(db)


@router.get("/settings", response_model=AssistantRuntimeSettingsOut)
def get_assistant_settings() -> AssistantRuntimeSettingsOut:
    return build_assistant_runtime_settings()


@router.get("/agents", response_model=list[AssistantAgentOut])
def list_assistant_agents(db: Session = Depends(get_db)) -> list[AssistantAgentOut]:
    return [to_public_agent_out(record) for record in list_public_agent_records(db)]


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
    prompt_context = _apply_live_tool_result(
        prompt_context,
        execute_live_tools(
            payload=payload,
            db=db,
            agent_definition=agent_definition,
        ),
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
    service = get_assistant_service(db)
    user: AssistantPromptUser | None = None
    agent_definition: ManagedAssistantAgent | None = None
    prompt_context = None
    live_tool_result = None
    provider_name: str | None = None
    model_name: str | None = None
    runtime_warnings: list[str] = []
    try:
        agent_definition = _resolve_agent_definition_for_request(db, payload)
        user = _resolve_prompt_user(request, db)
        provider_config, model_name, runtime_warnings = resolve_effective_runtime(payload, agent_definition)
        provider_name = provider_config.provider
        prompt_context = build_prompt_context(
            payload=payload,
            user=user,
            db=db,
            agent_definition=agent_definition,
        )
        live_tool_result = execute_live_tools(
            payload=payload,
            db=db,
            agent_definition=agent_definition,
        )
        prompt_context = _apply_live_tool_result(prompt_context, live_tool_result)
        response = await service.generate_response(
            payload,
            agent_definition=agent_definition,
            prompt_context=prompt_context,
        )
        if not isinstance(response, AssistantPromptResponse):
            response = AssistantPromptResponse.model_validate(response)
        response.tool_calls = _merge_tool_calls(response.tool_calls, live_tool_result.traces)
        run_record = create_assistant_run(
            db=db,
            status="COMPLETED",
            user_id=user.user_id,
            session_id=user.session_id,
            user_role=user.role,
            workspace=payload.workspace,
            agent_id=response.agent_id,
            agent_name=response.agent_name,
            provider=response.provider,
            model=response.model,
            use_live_tools=payload.use_live_tools,
            request_messages=payload.messages,
            application_context=payload.context,
            prompt_sections=[_to_prompt_section_out(section) for section in prompt_context.sections],
            rendered_system_prompt=prompt_context.system_prompt,
            warnings=response.warnings,
            tool_calls=response.tool_calls,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            assistant_message=response.message.content,
        )
        return attach_run_metadata(response, run_record)
    except AssistantServiceError as exc:
        if user is not None and prompt_context is not None and provider_name is not None and model_name is not None:
            combined_warnings = [
                *runtime_warnings,
                *prompt_context.warnings,
                *(live_tool_result.warnings if live_tool_result is not None else ()),
            ]
            tool_calls = (
                _merge_tool_calls([], live_tool_result.traces)
                if live_tool_result is not None
                else []
            )
            create_assistant_run(
                db=db,
                status="FAILED",
                user_id=user.user_id,
                session_id=user.session_id,
                user_role=user.role,
                workspace=payload.workspace,
                agent_id=prompt_context.agent_id,
                agent_name=prompt_context.agent_name,
                provider=provider_name,
                model=model_name,
                use_live_tools=payload.use_live_tools,
                request_messages=payload.messages,
                application_context=payload.context,
                prompt_sections=[_to_prompt_section_out(section) for section in prompt_context.sections],
                rendered_system_prompt=prompt_context.system_prompt,
                warnings=combined_warnings,
                tool_calls=tool_calls,
                input_tokens=None,
                output_tokens=None,
                assistant_message=None,
                error_detail=exc.detail,
            )
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


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


def _apply_live_tool_result(prompt_context, live_tool_result):
    if not live_tool_result.sections and not live_tool_result.warnings:
        return prompt_context

    sections = (*prompt_context.sections, *live_tool_result.sections)
    warnings = (*prompt_context.warnings, *live_tool_result.warnings)
    return prompt_context.__class__(
        generated_at=prompt_context.generated_at,
        agent_id=prompt_context.agent_id,
        agent_name=prompt_context.agent_name,
        system_prompt=render_prompt_sections(sections),
        sections=sections,
        warnings=warnings,
    )


def _merge_tool_calls(existing_tool_calls, prefetched_traces):
    merged_tool_calls = [trace.to_out() for trace in prefetched_traces]
    prefetched_tool_names = {tool_call.tool_name for tool_call in merged_tool_calls}

    deduped_tool_calls = []
    seen: set[tuple[str, str, str]] = set()
    for tool_call in merged_tool_calls:
        signature = (
            tool_call.tool_name,
            json.dumps(tool_call.arguments, sort_keys=True),
            tool_call.summary,
        )
        if signature in seen:
            continue
        seen.add(signature)
        deduped_tool_calls.append(tool_call)

    for tool_call in existing_tool_calls:
        if tool_call.tool_name in prefetched_tool_names:
            continue
        signature = (
            tool_call.tool_name,
            json.dumps(tool_call.arguments, sort_keys=True),
            tool_call.summary,
        )
        if signature in seen:
            continue
        seen.add(signature)
        deduped_tool_calls.append(tool_call)

    return deduped_tool_calls


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
