from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role, resolve_session_principal
from apps.api.app.domains.assistant.services.action_requests import (
    AssistantActionRequestError,
    approve_action_request,
    create_action_requests,
    get_action_request,
    reject_action_request,
    to_action_request_out_list,
)
from apps.api.app.domains.assistant.services.action_runtime import (
    AssistantActionRuntimeResult,
    plan_action_requests,
)
from apps.api.app.domains.assistant.services.chat import (
    AssistantService,
    AssistantServiceError,
    resolve_effective_runtime,
)
from apps.api.app.domains.assistant.services.conversations import (
    create_assistant_conversation,
    get_assistant_conversation,
    update_assistant_conversation_after_run,
)
from apps.api.app.domains.assistant.services.prompt_context import (
    AssistantPromptEnvelope,
    AssistantPromptSection,
    AssistantPromptUser,
    build_prompt_context,
    render_prompt_sections,
)
from apps.api.app.domains.assistant.services.registry import (
    ACTIVE_ASSISTANT_AGENT_STATUS,
    ManagedAssistantAgent,
    get_agent_record,
    to_managed_agent,
)
from apps.api.app.domains.assistant.services.runs import (
    attach_run_metadata,
    create_assistant_run,
    get_assistant_run,
)
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_conversation import AssistantConversation
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.assistant import (
    AssistantPromptContextRequest,
    AssistantPromptRequest,
    AssistantPromptResponse,
    AssistantPromptSectionOut,
)


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


def resolve_prompt_user(
    *,
    db: Session,
    authorization_header: str | None,
) -> AssistantPromptUser:
    principal = resolve_session_principal(db, authorization_header)
    if principal is None:
        raise AssistantServiceError(status_code=401, detail="Authentication is required")

    record = db.get(UserAccount, principal.user_id)
    if record is None:
        raise AssistantServiceError(status_code=401, detail="Authentication is required")

    return AssistantPromptUser(
        user_id=record.user_id,
        display_name=record.display_name,
        role=record.role,
        email=record.email,
        session_id=principal.session_id,
        session_expires_at=principal.expires_at,
    )


def resolve_agent_definition_for_request(
    *,
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


def resolve_accessible_assistant_run(
    *,
    db: Session,
    run_id: int,
    user: AssistantPromptUser,
) -> AssistantRun:
    record = get_assistant_run(db, run_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant run not found")
    if record.user_id != user.user_id and not is_admin_role(user.role):
        raise AssistantServiceError(status_code=403, detail="You do not have access to this assistant run")
    return record


def resolve_accessible_assistant_action_request(
    *,
    db: Session,
    action_request_id: int,
    user: AssistantPromptUser,
) -> AssistantActionRequest:
    record = get_action_request(db, action_request_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant action request not found")
    if record.user_id != user.user_id and not is_admin_role(user.role):
        raise AssistantServiceError(
            status_code=403,
            detail="You do not have access to this assistant action request",
        )
    return record


def resolve_accessible_assistant_conversation(
    *,
    db: Session,
    conversation_id: int,
    user: AssistantPromptUser,
) -> AssistantConversation:
    record = get_assistant_conversation(db, conversation_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant conversation not found")
    if record.user_id != user.user_id and not is_admin_role(user.role):
        raise AssistantServiceError(
            status_code=403,
            detail="You do not have access to this assistant conversation",
        )
    return record


def approve_assistant_action_request_for_user(
    *,
    db: Session,
    action_request_id: int,
    user: AssistantPromptUser,
) -> AssistantActionRequest:
    record = resolve_accessible_assistant_action_request(
        db=db,
        action_request_id=action_request_id,
        user=user,
    )
    try:
        return approve_action_request(
            db=db,
            record=record,
            actor_id=user.user_id,
            actor_role=user.role,
        )
    except AssistantActionRequestError as exc:
        raise AssistantServiceError(status_code=409, detail=exc.detail) from exc


def reject_assistant_action_request_for_user(
    *,
    db: Session,
    action_request_id: int,
    user: AssistantPromptUser,
) -> AssistantActionRequest:
    record = resolve_accessible_assistant_action_request(
        db=db,
        action_request_id=action_request_id,
        user=user,
    )
    try:
        return reject_action_request(
            db=db,
            record=record,
            actor_id=user.user_id,
        )
    except AssistantActionRequestError as exc:
        raise AssistantServiceError(status_code=409, detail=exc.detail) from exc


def prepare_assistant_execution(
    *,
    db: Session,
    payload: AssistantPromptRequest,
    authorization_header: str | None,
) -> PreparedAssistantExecution:
    agent_definition = resolve_agent_definition_for_request(db=db, payload=payload)
    user = resolve_prompt_user(db=db, authorization_header=authorization_header)
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


async def execute_assistant_execution(
    *,
    assistant_service: AssistantService,
    db: Session,
    payload: AssistantPromptRequest,
    prepared: PreparedAssistantExecution,
) -> tuple[AssistantPromptResponse, AssistantConversation]:
    response = await assistant_service.generate_response(
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


def record_failed_assistant_execution(
    *,
    db: Session,
    payload: AssistantPromptRequest,
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
        return resolve_accessible_assistant_conversation(
            db=db,
            conversation_id=payload.conversation_id,
            user=user,
        )

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


def _apply_prompt_enrichment(
    prompt_context: AssistantPromptEnvelope,
    *,
    sections: tuple[AssistantPromptSection, ...],
    warnings: tuple[str, ...],
) -> AssistantPromptEnvelope:
    if not sections and not warnings:
        return prompt_context

    next_sections = (*prompt_context.sections, *sections)
    next_warnings = (*prompt_context.warnings, *warnings)
    return AssistantPromptEnvelope(
        generated_at=prompt_context.generated_at,
        agent_id=prompt_context.agent_id,
        agent_name=prompt_context.agent_name,
        system_prompt=render_prompt_sections(next_sections),
        sections=next_sections,
        warnings=next_warnings,
    )


def _to_prompt_section_out(section: AssistantPromptSection) -> AssistantPromptSectionOut:
    return AssistantPromptSectionOut(
        key=section.key,
        title=section.title,
        source=section.source,
        content=section.content,
    )


def _latest_request_user_message(payload: AssistantPromptRequest) -> str | None:
    for message in reversed(payload.messages):
        if message.role == "user":
            return message.content
    return None
