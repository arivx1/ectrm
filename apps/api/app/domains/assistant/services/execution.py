from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_admin_role, resolve_session_principal
from apps.api.app.domains.assistant.services.action_handlers import AssistantActionRequestError
from apps.api.app.domains.assistant.services.action_registry import ACTION_SPECS
from apps.api.app.domains.assistant.services.action_requests import (
    AssistantActionDecision,
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
    add_assistant_conversation,
    apply_assistant_conversation_after_run,
    get_assistant_conversation,
)
from apps.api.app.domains.assistant.services.prompt_context import (
    AssistantPromptEnvelope,
    AssistantPromptSection,
    AssistantPromptUser,
    build_prompt_section,
    build_prompt_context,
    render_prompt_sections,
)
from apps.api.app.domains.assistant.services.policies import (
    authority_allows_execution,
    evaluate_tool_policy,
)
from apps.api.app.domains.assistant.services.registry import (
    ACTIVE_ASSISTANT_AGENT_STATUS,
    ManagedAssistantAgent,
    get_agent_record,
    summarize_agent_token_budget,
    to_managed_agent,
)
from apps.api.app.domains.assistant.services.runs import (
    add_assistant_run,
    attach_run_metadata,
    get_assistant_run,
)
from apps.api.app.domains.assistant.services.tools import (
    AssistantToolService,
    AssistantToolServiceError,
    json_dumps,
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
    AssistantToolCallOut,
)

_TOOL_PREFETCH_LIMIT = 5
_SUMMARY_HINT_PHRASES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "settlement.invoice_pending_count",
        (
            "open invoice",
            "open invoices",
            "unissued invoice",
            "unissued invoices",
            "issue invoice",
            "issue invoices",
            "invoice issue",
            "invoice issues",
            "invoice pending",
        ),
    ),
    (
        "settlement.payment_due_count",
        (
            "payment due",
            "payments due",
            "due payment",
            "due payments",
            "due / overdue",
            "due overdue",
            "cash due",
        ),
    ),
    (
        "settlement.trade_exception_count",
        (
            "settlement exception",
            "settlement exceptions",
            "trade exception",
            "trade exceptions",
            "settlement dispute",
            "settlement disputes",
            "disputed settlement",
            "disputed invoice",
            "disputed invoices",
        ),
    ),
    (
        "dashboard.attention.confirmation_backlog_count",
        (
            "confirmation backlog",
            "confirm backlog",
            "unconfirmed trade",
            "unconfirmed trades",
            "confirmation queue",
        ),
    ),
    (
        "dashboard.attention.nomination_backlog_count",
        (
            "nomination backlog",
            "nominations backlog",
            "nomination queue",
            "nominations needing attention",
        ),
    ),
    (
        "dashboard.attention.allocation_backlog_count",
        (
            "allocation backlog",
            "allocations backlog",
            "allocation queue",
            "allocations needing attention",
        ),
    ),
    (
        "dashboard.attention.invoice_backlog_count",
        (
            "invoice backlog",
            "invoice backlogs",
            "backlog invoice",
            "backlog invoices",
        ),
    ),
    (
        "dashboard.attention.overdue_payment_count",
        (
            "overdue payment",
            "overdue payments",
            "overdue cash",
        ),
    ),
    (
        "dashboard.attention.stale_pricing_count",
        (
            "stale pricing",
            "pricing backlog",
            "pricing stale",
            "pending pricing",
        ),
    ),
    (
        "dashboard.attention.incomplete_ops_data_count",
        (
            "incomplete ops data",
            "missing ops data",
            "operational data gap",
            "ops data gap",
        ),
    ),
    (
        "trades.pending_settlement_count",
        (
            "pending settlement",
            "pending settlements",
            "unsettled trade",
            "unsettled trades",
        ),
    ),
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
    conversation: AssistantConversation | None


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
    require_active: bool = True,
) -> ManagedAssistantAgent | None:
    if payload.agent_id is None:
        return None

    record = get_agent_record(db, payload.agent_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent not found")
    if require_active and record.status != ACTIVE_ASSISTANT_AGENT_STATUS:
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


def ensure_agent_has_token_allocation(
    *,
    db: Session,
    agent_definition: ManagedAssistantAgent | None,
) -> None:
    if agent_definition is None:
        return

    record = get_agent_record(db, agent_definition.agent_id)
    if record is None:
        raise AssistantServiceError(status_code=404, detail="Assistant agent not found")

    token_budget = summarize_agent_token_budget(db, record)
    if token_budget.status == "RED":
        raise AssistantServiceError(
            status_code=429,
            detail=(
                f"{record.name} is in the red and has no token allocation remaining "
                f"until {token_budget.reset_at.isoformat()}."
            ),
        )


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
    decision: AssistantActionDecision | None = None,
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
            decision=decision,
        )
    except AssistantActionRequestError as exc:
        raise AssistantServiceError(status_code=409, detail=exc.detail) from exc


def reject_assistant_action_request_for_user(
    *,
    db: Session,
    action_request_id: int,
    user: AssistantPromptUser,
    decision: AssistantActionDecision | None = None,
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
            decision=decision,
        )
    except AssistantActionRequestError as exc:
        raise AssistantServiceError(status_code=409, detail=exc.detail) from exc


def prepare_assistant_execution(
    *,
    db: Session,
    payload: AssistantPromptRequest,
    authorization_header: str | None,
    user: AssistantPromptUser | None = None,
    require_active_agent: bool = True,
) -> PreparedAssistantExecution:
    agent_definition = resolve_agent_definition_for_request(
        db=db,
        payload=payload,
        require_active=require_active_agent,
    )
    ensure_agent_has_token_allocation(db=db, agent_definition=agent_definition)
    user = user or resolve_prompt_user(db=db, authorization_header=authorization_header)
    provider_config, model_name, runtime_warnings = resolve_effective_runtime(payload, agent_definition)
    conversation = _resolve_existing_conversation_for_request(
        db=db,
        payload=payload,
        user=user,
    )
    prompt_context = build_prompt_context(
        payload=payload,
        user=user,
        db=db,
        agent_definition=agent_definition,
    )
    prefetch_sections, prefetch_warnings = _build_workspace_summary_tool_prefetch(
        db=db,
        payload=payload,
        user=user,
        agent_definition=agent_definition,
    )
    prompt_context = _apply_prompt_enrichment(
        prompt_context,
        sections=prefetch_sections,
        warnings=prefetch_warnings,
    )
    action_runtime_result = plan_action_requests(
        payload=payload,
        db=db,
        agent_definition=agent_definition,
        action_specs=ACTION_SPECS,
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
    if response.agent_role_key is None:
        response.agent_role_key = prepared.prompt_context.agent_role_key
    if response.agent_profile_kind is None:
        response.agent_profile_kind = prepared.prompt_context.agent_profile_kind

    run_record, updated_conversation = _record_assistant_run(
        db=db,
        status="COMPLETED",
        payload=payload,
        prepared=prepared,
        agent_id=response.agent_id,
        agent_name=response.agent_name,
        agent_role_key=response.agent_role_key,
        agent_profile_kind=response.agent_profile_kind,
        provider=response.provider,
        model=response.model,
        warnings=response.warnings,
        tool_calls=response.tool_calls,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        assistant_message=response.message.content,
    )

    action_request_records = create_action_requests(
        db=db,
        run_id=run_record.id,
        user_id=prepared.user.user_id,
        session_id=prepared.user.session_id,
        workspace=payload.workspace,
        agent_id=response.agent_id,
        agent_name=response.agent_name,
        proposals=prepared.action_runtime_result.proposals,
    )
    if _agent_can_autonomously_execute(prepared.agent_definition):
        action_request_records = _autonomously_execute_action_requests(
            db=db,
            records=action_request_records,
            actor_id=response.agent_id or prepared.agent_definition.agent_id,
            actor_role=prepared.user.role,
        )
        execution_update = _autonomous_execution_update_message(action_request_records)
        if execution_update:
            response.message.content = f"{response.message.content}\n\n{execution_update}"
            run_record.assistant_message = response.message.content
            updated_conversation.latest_assistant_message = response.message.content
            db.commit()
            db.refresh(run_record)
            db.refresh(updated_conversation)

    response.action_requests = to_action_request_out_list(action_request_records)

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
) -> AssistantConversation:
    _, updated_conversation = _record_assistant_run(
        db=db,
        status="FAILED",
        payload=payload,
        prepared=prepared,
        agent_id=prepared.prompt_context.agent_id,
        agent_name=prepared.prompt_context.agent_name,
        agent_role_key=prepared.prompt_context.agent_role_key,
        agent_profile_kind=prepared.prompt_context.agent_profile_kind,
        provider=prepared.provider_name,
        model=prepared.model_name,
        warnings=[*prepared.runtime_warnings, *prepared.prompt_context.warnings],
        tool_calls=[],
        input_tokens=None,
        output_tokens=None,
        assistant_message=None,
        error_detail=detail,
    )
    return updated_conversation


def _resolve_existing_conversation_for_request(
    *,
    db: Session,
    payload: AssistantPromptRequest,
    user: AssistantPromptUser,
) -> AssistantConversation | None:
    if payload.conversation_id is not None:
        return resolve_accessible_assistant_conversation(
            db=db,
            conversation_id=payload.conversation_id,
            user=user,
        )
    return None


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
        agent_role_key=prompt_context.agent_role_key,
        agent_profile_kind=prompt_context.agent_profile_kind,
        system_prompt=render_prompt_sections(next_sections),
        sections=next_sections,
        warnings=next_warnings,
    )


def _build_workspace_summary_tool_prefetch(
    *,
    db: Session,
    payload: AssistantPromptRequest,
    user: AssistantPromptUser,
    agent_definition: ManagedAssistantAgent | None,
) -> tuple[tuple[AssistantPromptSection, ...], tuple[str, ...]]:
    if not payload.use_live_tools:
        return (), ()
    if not _tool_is_allowed(
        agent_definition=agent_definition,
        tool_name="get_workspace_summary",
        workspace=payload.workspace,
    ):
        return (), ()

    explicit_targets = _matching_explicit_workspace_summary_targets(payload)
    keyword_text = _workspace_summary_prefetch_text(payload)
    if not explicit_targets and (not keyword_text or _looks_like_specific_trade_focus(keyword_text)):
        return (), ()

    tool_service = AssistantToolService(db, actor_id=user.user_id)
    try:
        summary_result, _trace = tool_service.execute_tool("get_workspace_summary", {})
    except AssistantToolServiceError:
        return (), ()

    hint_keys = explicit_targets or _matching_workspace_summary_hint_keys(summary_result.output, keyword_text)
    if not hint_keys:
        return (), ()

    hints = summary_result.output.get("candidate_read_hints")
    if not isinstance(hints, dict):
        return (), ()

    sections: list[AssistantPromptSection] = [
        _build_tool_prefetch_section(
            key="tool-prefetch-workspace-summary",
            tool_name="get_workspace_summary",
            arguments={},
            summary=summary_result.summary,
            output={
                "matched_counts": {
                    count_key: _resolve_nested_value(summary_result.output, count_key)
                    for count_key in hint_keys
                },
                "candidate_read_hints": {
                    count_key: hints[count_key]
                    for count_key in hint_keys
                    if count_key in hints
                },
            },
        )
    ]

    seen_signatures: set[tuple[str, str]] = set()
    for count_key in hint_keys:
        hint = hints.get(count_key)
        if not isinstance(hint, dict):
            continue
        tool_name = str(hint.get("tool") or "").strip()
        if not tool_name:
            continue
        if not _tool_is_allowed(
            agent_definition=agent_definition,
            tool_name=tool_name,
            workspace=payload.workspace,
        ):
            continue

        arguments = hint.get("arguments")
        if not isinstance(arguments, dict):
            arguments = {}
        call_arguments = dict(arguments)
        call_arguments.setdefault("limit", _TOOL_PREFETCH_LIMIT)
        signature = (tool_name, json_dumps(call_arguments))
        if signature in seen_signatures:
            continue
        seen_signatures.add(signature)

        try:
            result, _trace = tool_service.execute_tool(tool_name, call_arguments)
        except AssistantToolServiceError:
            continue

        sections.append(
            _build_tool_prefetch_section(
                key=f"tool-prefetch-{count_key.replace('.', '-').replace('_', '-')}",
                tool_name=tool_name,
                arguments=call_arguments,
                summary=result.summary,
                output=result.output,
            )
        )

    return tuple(sections), ()


def _tool_is_allowed(
    *,
    agent_definition: ManagedAssistantAgent | None,
    tool_name: str,
    workspace: str | None,
) -> bool:
    return evaluate_tool_policy(
        agent=agent_definition,
        tool_id=tool_name,
        workspace=workspace,
    ).allowed


def _agent_can_autonomously_execute(agent_definition: ManagedAssistantAgent | None) -> bool:
    if agent_definition is None:
        return False
    return authority_allows_execution(agent_definition.authority_ceiling)


def _autonomously_execute_action_requests(
    *,
    db: Session,
    records: list[AssistantActionRequest],
    actor_id: str,
    actor_role: str | None,
) -> list[AssistantActionRequest]:
    executed_records: list[AssistantActionRequest] = []
    for record in records:
        try:
            executed_records.append(
                approve_action_request(
                    db=db,
                    record=record,
                    actor_id=actor_id,
                    actor_role=actor_role,
                    decision=AssistantActionDecision(
                        review_outcome="APPROVED_AS_IS",
                        decision_note=(
                            "Autonomously executed by an execute-capable managed agent so the platform record "
                            "could align with asserted real-world state."
                        ),
                    ),
                )
            )
        except AssistantActionRequestError:
            refreshed = get_action_request(db, record.id)
            executed_records.append(refreshed or record)
    return executed_records


def _autonomous_execution_update_message(records: list[AssistantActionRequest]) -> str | None:
    if not records:
        return None

    executed = [record.summary for record in records if record.status == "EXECUTED"]
    failed = [
        f"{record.summary} ({record.error_detail})"
        for record in records
        if record.status == "FAILED"
    ]
    pending = [record.summary for record in records if record.status == "PENDING"]
    rejected = [record.summary for record in records if record.status == "REJECTED"]

    parts: list[str] = []
    if executed:
        parts.append("executed autonomously: " + "; ".join(executed[:3]))
    if failed:
        parts.append("not executed: " + "; ".join(failed[:2]))
    if pending:
        parts.append("still pending: " + "; ".join(pending[:2]))
    if rejected:
        parts.append("rejected: " + "; ".join(rejected[:2]))
    if not parts:
        return None
    return "Governed action update: " + " ".join(parts) + "."


def _workspace_summary_prefetch_text(payload: AssistantPromptRequest) -> str:
    parts: list[str] = []
    if payload.context:
        parts.append(payload.context)
    parts.extend(message.content for message in payload.messages[-6:] if message.content)
    return "\n".join(parts).strip().lower()


def _matching_explicit_workspace_summary_targets(
    payload: AssistantPromptRequest,
) -> tuple[str, ...]:
    return tuple(target for target in payload.summary_targets if target)


def _looks_like_specific_trade_focus(text: str) -> bool:
    return "selected trade:" in text or re.search(r"\bt-[a-z0-9-]+\b", text) is not None


def _matching_workspace_summary_hint_keys(
    summary_output: dict[str, object],
    keyword_text: str,
) -> tuple[str, ...]:
    hints = summary_output.get("candidate_read_hints")
    if not isinstance(hints, dict):
        return ()

    matched_keys: list[str] = []
    for count_key, phrases in _SUMMARY_HINT_PHRASES:
        if count_key not in hints:
            continue
        if any(phrase in keyword_text for phrase in phrases):
            matched_keys.append(count_key)
    return tuple(matched_keys)


def _resolve_nested_value(payload: dict[str, object], dotted_key: str) -> object | None:
    current: object = payload
    for segment in dotted_key.split("."):
        if not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]
    return current


def _build_tool_prefetch_section(
    *,
    key: str,
    tool_name: str,
    arguments: dict[str, object],
    summary: str,
    output: dict[str, object],
) -> AssistantPromptSection:
    return build_prompt_section(
        contract_key="tool-prefetch",
        key=key,
        title=f"Live Tool Prefetch: {tool_name}",
        content=(
            f"tool: {tool_name}\n"
            f"arguments: {json_dumps(arguments)}\n"
            f"summary: {summary}\n"
            f"output: {json_dumps(output)}"
        ),
        owner_reference=tool_name,
    )


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


def _latest_request_user_message(payload: AssistantPromptRequest) -> str | None:
    for message in reversed(payload.messages):
        if message.role == "user":
            return message.content
    return None


def _record_assistant_run(
    *,
    db: Session,
    status: str,
    payload: AssistantPromptRequest,
    prepared: PreparedAssistantExecution,
    agent_id: str | None,
    agent_name: str | None,
    agent_role_key: str | None,
    agent_profile_kind: str | None,
    provider: str,
    model: str,
    warnings: list[str],
    tool_calls: list[AssistantToolCallOut],
    input_tokens: int | None,
    output_tokens: int | None,
    assistant_message: str | None,
    error_detail: str | None = None,
) -> tuple[AssistantRun, AssistantConversation]:
    latest_user_message = _latest_request_user_message(payload)
    conversation = prepared.conversation
    if conversation is None:
        conversation = add_assistant_conversation(
            db=db,
            user_id=prepared.user.user_id,
            session_id=prepared.user.session_id,
            user_role=prepared.user.role,
            workspace=payload.workspace,
            agent_id=prepared.agent_definition.agent_id if prepared.agent_definition is not None else None,
            agent_name=prepared.agent_definition.name if prepared.agent_definition is not None else None,
            provider=prepared.provider_name,
            model=prepared.model_name,
            use_live_tools=payload.use_live_tools,
            title=latest_user_message or "New conversation",
        )

    run_record = add_assistant_run(
        db=db,
        conversation_id=conversation.id,
        status=status,
        user_id=prepared.user.user_id,
        session_id=prepared.user.session_id,
        user_role=prepared.user.role,
        workspace=payload.workspace,
        agent_id=agent_id,
        agent_name=agent_name,
        agent_role_key=agent_role_key,
        agent_profile_kind=agent_profile_kind,
        provider=provider,
        model=model,
        use_live_tools=payload.use_live_tools,
        request_messages=payload.messages,
        application_context=payload.context,
        prompt_sections=[_to_prompt_section_out(section) for section in prepared.prompt_context.sections],
        rendered_system_prompt=prepared.prompt_context.system_prompt,
        warnings=warnings,
        tool_calls=tool_calls,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        assistant_message=assistant_message,
        error_detail=error_detail,
    )
    updated_conversation = apply_assistant_conversation_after_run(
        db=db,
        record=conversation,
        run_record=run_record,
        workspace=payload.workspace,
        agent_id=agent_id,
        agent_name=agent_name,
        provider=provider,
        model=model,
        use_live_tools=payload.use_live_tools,
        latest_user_message=latest_user_message,
        latest_assistant_message=assistant_message or error_detail,
    )
    db.commit()
    db.refresh(run_record)
    db.refresh(updated_conversation)
    return run_record, updated_conversation
