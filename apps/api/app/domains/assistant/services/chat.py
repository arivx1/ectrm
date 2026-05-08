from __future__ import annotations

import json
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Iterable, cast, get_args

import httpx
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.domains.assistant.services.action_catalog import ASSISTANT_ACTION_CATALOG
from apps.api.app.domains.assistant.services.policies import evaluate_tool_policy
from apps.api.app.domains.assistant.services.prompt_context import AssistantPromptEnvelope
from apps.api.app.domains.assistant.services.registry import ManagedAssistantAgent
from apps.api.app.domains.assistant.services.skills import (
    INTER_AGENT_CONSULTATION_SKILL,
    list_agent_skill_definitions,
    list_agent_skill_keys,
)
from apps.api.app.domains.assistant.services.tools import (
    AssistantToolCallTrace,
    AssistantToolDefinition,
    AssistantToolExecutionResult,
    AssistantToolService,
    AssistantToolServiceError,
    build_tool_definitions,
    json_dumps,
)
from apps.api.app.domains.assistant.services.voice import (
    build_assistant_voice_transcription_settings,
)
from apps.api.app.schemas.assistant import (
    AssistantActionDefinitionOut,
    AssistantActionType,
    AssistantAgentBuildRequest,
    AssistantAgentBuildSuggestionOut,
    AssistantAgentCapability,
    AssistantAgentSkillKey,
    AssistantAgentScope,
    AssistantAgentSelfUpdateSuggestionOut,
    AssistantMessageIn,
    AssistantMessageOut,
    AssistantPromptContextRequest,
    AssistantPromptRequest,
    AssistantPromptResponse,
    AssistantProvider,
    AssistantProviderStatusOut,
    AssistantRuntimeSettingsOut,
    AssistantUsageOut,
    AssistantWorkspace,
)

PROVIDER_LABELS: dict[AssistantProvider, str] = {
    "openai": "GPT",
    "anthropic": "Claude",
    "google": "Gemini",
}

PROVIDER_SETUP_ENV_VARS: dict[AssistantProvider, str] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
}

VALID_PROVIDERS: tuple[AssistantProvider, ...] = ("openai", "anthropic", "google")
logger = get_logger(__name__)

ASSISTANT_ACTION_DEFINITIONS: tuple[AssistantActionDefinitionOut, ...] = (
    AssistantActionDefinitionOut(name=entry.name, label=entry.label, description=entry.description)
    for entry in ASSISTANT_ACTION_CATALOG
)


@dataclass(frozen=True)
class AssistantProviderConfig:
    provider: AssistantProvider
    label: str
    api_key: str
    model: str
    base_url: str
    configured: bool
    enabled: bool
    is_default: bool
    setup_env_var: str


@dataclass(frozen=True)
class AssistantCompletion:
    provider: AssistantProvider
    model: str
    content: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    warnings: list[str] | None = None
    tool_calls: list[AssistantToolCallTrace] | None = None


@dataclass(frozen=True)
class PendingToolCall:
    call_id: str
    tool_name: str
    arguments: dict[str, Any]
    parse_error: str | None = None


class AssistantServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class AssistantService:
    def __init__(
        self,
        db: Session | None = None,
        *,
        actor_id: str | None = None,
        delegation_depth: int = 0,
    ) -> None:
        self._tool_definitions = build_tool_definitions()
        self._tool_service = (
            AssistantToolService(
                db,
                actor_id=actor_id,
                delegation_depth=delegation_depth,
            )
            if db is not None
            else None
        )

    async def generate_response(
        self,
        payload: AssistantPromptRequest,
        agent_definition: ManagedAssistantAgent | None = None,
        prompt_context: AssistantPromptEnvelope | None = None,
    ) -> AssistantPromptResponse:
        if self._tool_service is not None:
            self._tool_service.set_caller_agent(agent_definition)
        provider, model, warnings = resolve_effective_runtime(payload, agent_definition)
        tool_definitions, tool_warnings = self._resolve_tooling(payload, agent_definition)
        system_prompt = (
            prompt_context.system_prompt
            if prompt_context is not None
            else build_system_prompt(payload, agent_definition)
        )
        combined_warnings = _dedupe_preserving_order(
            [
                *warnings,
                *tool_warnings,
                *(prompt_context.warnings if prompt_context is not None else ()),
            ]
        )

        if provider.provider == "openai":
            completion = await self._generate_openai(
                provider=provider,
                model=model,
                messages=payload.messages,
                system_prompt=system_prompt,
                tool_definitions=tool_definitions,
            )
        elif provider.provider == "anthropic":
            completion = await self._generate_anthropic(
                provider=provider,
                model=model,
                messages=payload.messages,
                system_prompt=system_prompt,
                tool_definitions=tool_definitions,
            )
        else:
            completion = await self._generate_google(
                provider=provider,
                model=model,
                messages=payload.messages,
                system_prompt=system_prompt,
                tool_definitions=tool_definitions,
            )

        return AssistantPromptResponse(
            agent_id=(
                prompt_context.agent_id
                if prompt_context is not None
                else agent_definition.agent_id if agent_definition is not None else None
            ),
            agent_name=(
                prompt_context.agent_name
                if prompt_context is not None
                else agent_definition.name if agent_definition is not None else None
            ),
            agent_role_key=(
                prompt_context.agent_role_key
                if prompt_context is not None
                else agent_definition.role_key if agent_definition is not None else None
            ),
            agent_profile_kind=(
                prompt_context.agent_profile_kind
                if prompt_context is not None
                else agent_definition.profile_kind if agent_definition is not None else None
            ),
            provider=completion.provider,
            model=completion.model,
            message=AssistantMessageOut(content=completion.content),
            usage=AssistantUsageOut(
                input_tokens=completion.input_tokens,
                output_tokens=completion.output_tokens,
            ),
            warnings=_dedupe_preserving_order([*combined_warnings, *(completion.warnings or [])]),
            tool_calls=[trace.to_out() for trace in (completion.tool_calls or [])],
        )

    async def build_agent_draft_with_openai(
        self,
        payload: AssistantAgentBuildRequest,
    ) -> AssistantAgentBuildSuggestionOut:
        provider = resolve_provider_config("openai")
        builder_model = settings.OPENAI_AGENT_BUILDER_MODEL.strip() or provider.model
        current_draft = payload.current_draft.model_dump(mode="json", exclude_none=True) if payload.current_draft else {}
        published_tool_names = [tool.name for tool in self._tool_definitions]
        runtime_model = _resolve_openai_runtime_model(payload, provider.model)
        warnings = _collect_agent_builder_warnings(payload, runtime_model)

        response_payload = await _post_json(
            url=f"{provider.base_url.rstrip('/')}/responses",
            headers={
                "Authorization": f"Bearer {provider.api_key}",
                "Content-Type": "application/json",
            },
            payload={
                "model": builder_model,
                "max_output_tokens": settings.ASSISTANT_MAX_OUTPUT_TOKENS,
                "instructions": _build_openai_agent_builder_instructions(),
                "input": json_dumps(
                    {
                        "brief": payload.brief,
                        "current_draft": current_draft,
                        "runtime_target": {
                            "provider": "openai",
                            "model": runtime_model,
                        },
                        "workspace_options": list(get_args(AssistantWorkspace)),
                        "capability_options": list(get_args(AssistantAgentCapability)),
                        "skill_options": list(list_agent_skill_keys()),
                        "action_type_options": list(get_args(AssistantActionType)),
                        "tool_catalog": [
                            {
                                "name": tool.name,
                                "description": tool.description,
                            }
                            for tool in self._tool_definitions
                        ],
                    }
                ),
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "assistant_agent_builder_draft",
                        "strict": True,
                        "schema": _build_openai_agent_builder_schema(published_tool_names),
                    }
                },
            },
            provider_label="OpenAI Agent Builder",
        )

        generated_payload = _parse_openai_agent_builder_output(response_payload)
        invalid_tool_names = [
            tool_name
            for tool_name in generated_payload.get("allowed_tools", [])
            if tool_name not in set(published_tool_names)
        ]
        if invalid_tool_names:
            warnings.append(
                f"OpenAI suggested unpublished live tools ({', '.join(invalid_tool_names)}), so they were removed from the draft."
            )
            generated_payload["allowed_tools"] = [
                tool_name
                for tool_name in generated_payload.get("allowed_tools", [])
                if tool_name in set(published_tool_names)
            ]
        if "READ" not in {capability.upper() for capability in generated_payload.get("capabilities", [])}:
            if generated_payload.get("allowed_tools"):
                warnings.append(
                    "OpenAI suggested live tools without the READ capability, so the tool allowlist was cleared."
                )
            generated_payload["allowed_tools"] = []
        if (
            {"consult_managed_agent", "enlist_managed_agent"} & set(generated_payload.get("allowed_tools", []))
            and INTER_AGENT_CONSULTATION_SKILL not in set(generated_payload.get("skills", []))
        ):
            warnings.append(
                "OpenAI suggested inter-agent coordination tools without the inter_agent_consultation skill, so those tools were removed."
            )
            generated_payload["allowed_tools"] = [
                tool_name
                for tool_name in generated_payload.get("allowed_tools", [])
                if tool_name not in {"consult_managed_agent", "enlist_managed_agent"}
            ]
        if "ACTION" not in {capability.upper() for capability in generated_payload.get("capabilities", [])}:
            if generated_payload.get("allowed_action_types"):
                warnings.append(
                    "OpenAI suggested governed actions without the ACTION capability, so the action allowlist was cleared."
                )
            generated_payload["allowed_action_types"] = []

        suggestion = AssistantAgentBuildSuggestionOut(
            agent_id=str(generated_payload["agent_id"]),
            name=str(generated_payload["name"]),
            description=str(generated_payload["description"]),
            status=(
                payload.current_draft.status
                if payload.current_draft is not None and payload.current_draft.status is not None
                else "DRAFT"
            ),
            scope=generated_payload["scope"],
            provider="openai",
            model=runtime_model,
            allowed_workspaces=generated_payload["allowed_workspaces"],
            capabilities=generated_payload["capabilities"],
            skills=generated_payload.get("skills", []),
            allowed_tools=generated_payload["allowed_tools"],
            allowed_action_types=generated_payload["allowed_action_types"],
            system_prompt=str(generated_payload["system_prompt"]),
            builder_provider="openai",
            builder_model=builder_model,
            warnings=warnings,
        )
        return suggestion

    async def build_agent_self_update_draft_with_openai(
        self,
        *,
        agent_definition: ManagedAssistantAgent,
        brief: str,
    ) -> AssistantAgentSelfUpdateSuggestionOut:
        provider = resolve_provider_config("openai")
        builder_model = settings.OPENAI_AGENT_BUILDER_MODEL.strip() or provider.model
        published_tool_names = [tool.name for tool in self._tool_definitions]

        response_payload = await _post_json(
            url=f"{provider.base_url.rstrip('/')}/responses",
            headers={
                "Authorization": f"Bearer {provider.api_key}",
                "Content-Type": "application/json",
            },
            payload={
                "model": builder_model,
                "max_output_tokens": settings.ASSISTANT_MAX_OUTPUT_TOKENS,
                "instructions": _build_openai_agent_self_update_instructions(),
                "input": json_dumps(
                    {
                        "brief": brief,
                        "current_agent": {
                            "agent_id": agent_definition.agent_id,
                            "name": agent_definition.name,
                            "description": agent_definition.description,
                            "status": agent_definition.status,
                            "scope": agent_definition.scope,
                            "provider": agent_definition.provider,
                            "model": agent_definition.model,
                            "role_key": agent_definition.role_key,
                            "profile_kind": agent_definition.profile_kind,
                            "human_owner_role": agent_definition.human_owner_role,
                            "authority_ceiling": agent_definition.authority_ceiling,
                            "allowed_workspaces": list(agent_definition.allowed_workspaces),
                            "capabilities": list(agent_definition.capabilities),
                            "skills": list(agent_definition.skills),
                            "allowed_tools": list(agent_definition.allowed_tools),
                            "allowed_action_types": list(agent_definition.allowed_action_types),
                            "system_prompt": agent_definition.system_prompt,
                        },
                        "tool_catalog": [
                            {
                                "name": tool.name,
                                "description": tool.description,
                            }
                            for tool in self._tool_definitions
                        ],
                    }
                ),
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "assistant_agent_self_update_draft",
                        "strict": True,
                        "schema": _build_openai_agent_self_update_schema(agent_definition),
                    }
                },
            },
            provider_label="OpenAI Agent Self Update",
        )

        generated_payload = _parse_openai_agent_self_update_output(response_payload)
        warnings: list[str] = []
        allowed_tools = list(generated_payload.get("allowed_tools", []))
        allowed_action_types = list(generated_payload.get("allowed_action_types", []))
        capabilities = [str(capability) for capability in generated_payload.get("capabilities", [])]
        skills = [cast(AssistantAgentSkillKey, str(skill)) for skill in generated_payload.get("skills", [])]

        if "READ" not in {capability.upper() for capability in capabilities}:
            if allowed_tools:
                warnings.append(
                    "The self-update draft removed READ, so the live-tool allowlist was cleared."
                )
            allowed_tools = []
        invalid_tool_names = [
            tool_name for tool_name in allowed_tools if tool_name not in set(published_tool_names)
        ]
        if invalid_tool_names:
            warnings.append(
                f"Unpublished live tools ({', '.join(invalid_tool_names)}) were removed from the self-update draft."
            )
            allowed_tools = [
                tool_name for tool_name in allowed_tools if tool_name in set(published_tool_names)
            ]
        if (
            {"consult_managed_agent", "enlist_managed_agent"} & set(allowed_tools)
            and INTER_AGENT_CONSULTATION_SKILL not in set(skills)
        ):
            warnings.append(
                "The self-update draft removed inter_agent_consultation, so the inter-agent coordination tools were cleared."
            )
            allowed_tools = [
                tool_name
                for tool_name in allowed_tools
                if tool_name not in {"consult_managed_agent", "enlist_managed_agent"}
            ]
        if "ACTION" not in {capability.upper() for capability in capabilities}:
            if allowed_action_types:
                warnings.append(
                    "The self-update draft removed ACTION, so the governed action allowlist was cleared."
                )
            allowed_action_types = []

        return AssistantAgentSelfUpdateSuggestionOut(
            description=str(generated_payload["description"]),
            allowed_workspaces=generated_payload["allowed_workspaces"],
            capabilities=capabilities,
            skills=skills,
            allowed_tools=allowed_tools,
            allowed_action_types=allowed_action_types,
            system_prompt=str(generated_payload["system_prompt"]),
            change_summary=generated_payload["change_summary"],
            builder_provider="openai",
            builder_model=builder_model,
            warnings=warnings,
        )

    async def _generate_openai(
        self,
        *,
        provider: AssistantProviderConfig,
        model: str,
        messages: list[AssistantMessageIn],
        system_prompt: str,
        tool_definitions: list[AssistantToolDefinition],
    ) -> AssistantCompletion:
        input_messages: list[dict[str, Any]] = [
            {
                "role": message.role,
                "content": message.content,
            }
            for message in messages
        ]

        request_payload: dict[str, Any] = {
            "model": model,
            "max_output_tokens": settings.ASSISTANT_MAX_OUTPUT_TOKENS,
            "text": {"format": {"type": "text"}},
        }
        if system_prompt:
            request_payload["instructions"] = system_prompt
        if tool_definitions:
            request_payload["tools"] = [
                {
                    "type": "function",
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                }
                for tool in tool_definitions
            ]

        current_input = input_messages
        previous_response_id: str | None = None
        executed_tool_rounds = 0
        accumulated_input_tokens: int | None = None
        accumulated_output_tokens: int | None = None
        last_response_text = ""
        warnings: list[str] = []
        tool_calls: list[AssistantToolCallTrace] = []

        while True:
            response_payload = await _post_json(
                url=f"{provider.base_url.rstrip('/')}/responses",
                headers={
                    "Authorization": f"Bearer {provider.api_key}",
                    "Content-Type": "application/json",
                },
                payload={
                    **request_payload,
                    "input": current_input,
                    **({"previous_response_id": previous_response_id} if previous_response_id else {}),
                },
                provider_label=provider.label,
            )

            usage = response_payload.get("usage", {})
            accumulated_input_tokens = _sum_optional_int(
                accumulated_input_tokens,
                _coerce_int(usage.get("input_tokens")),
            )
            accumulated_output_tokens = _sum_optional_int(
                accumulated_output_tokens,
                _coerce_int(usage.get("output_tokens")),
            )

            response_text = _extract_openai_text(response_payload)
            if response_text:
                last_response_text = response_text
            if _openai_response_reached_output_limit(response_payload):
                _append_warning_once(warnings, _output_limit_warning(provider.label))

            pending_calls = _extract_openai_tool_calls(response_payload) if tool_definitions else []
            if pending_calls:
                if executed_tool_rounds >= settings.ASSISTANT_MAX_TOOL_ROUNDS:
                    warnings.append(
                        f"{provider.label} reached the configured live-tool round limit before finishing."
                    )
                    break

                previous_response_id = _require_response_id(response_payload, provider.label)
                current_input = []
                for pending_call in pending_calls:
                    result, trace = await self._execute_pending_tool_call(pending_call)
                    tool_calls.append(trace)
                    current_input.append(
                        {
                            "type": "function_call_output",
                            "call_id": pending_call.call_id,
                            "output": json_dumps(result.output),
                        }
                    )
                executed_tool_rounds += 1
                continue

            if last_response_text:
                return AssistantCompletion(
                    provider=provider.provider,
                    model=model,
                    content=last_response_text,
                    input_tokens=accumulated_input_tokens,
                    output_tokens=accumulated_output_tokens,
                    warnings=warnings or None,
                    tool_calls=tool_calls,
                )
            break

        if last_response_text:
            return AssistantCompletion(
                provider=provider.provider,
                model=model,
                content=last_response_text,
                input_tokens=accumulated_input_tokens,
                output_tokens=accumulated_output_tokens,
                warnings=warnings or None,
                tool_calls=tool_calls,
            )

        raise AssistantServiceError(
            status_code=502,
            detail=f"{provider.label} returned an empty response.",
        )

    async def _generate_anthropic(
        self,
        *,
        provider: AssistantProviderConfig,
        model: str,
        messages: list[AssistantMessageIn],
        system_prompt: str,
        tool_definitions: list[AssistantToolDefinition],
    ) -> AssistantCompletion:
        message_history: list[dict[str, Any]] = [
            {
                "role": message.role,
                "content": [{"type": "text", "text": message.content}],
            }
            for message in messages
        ]
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": settings.ASSISTANT_MAX_OUTPUT_TOKENS,
            "messages": message_history,
        }
        if system_prompt:
            payload["system"] = system_prompt
        if tool_definitions:
            payload["tools"] = [
                {
                    "name": tool.name,
                    "description": tool.description,
                    "input_schema": tool.parameters,
                }
                for tool in tool_definitions
            ]

        executed_tool_rounds = 0
        accumulated_input_tokens: int | None = None
        accumulated_output_tokens: int | None = None
        last_response_text = ""
        warnings: list[str] = []
        tool_calls: list[AssistantToolCallTrace] = []

        while True:
            response_payload = await _post_json(
                url=f"{provider.base_url.rstrip('/')}/v1/messages",
                headers={
                    "x-api-key": provider.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                payload=payload,
                provider_label=provider.label,
            )

            usage = response_payload.get("usage", {})
            accumulated_input_tokens = _sum_optional_int(
                accumulated_input_tokens,
                _coerce_int(usage.get("input_tokens")),
            )
            accumulated_output_tokens = _sum_optional_int(
                accumulated_output_tokens,
                _coerce_int(usage.get("output_tokens")),
            )

            content_blocks = response_payload.get("content", [])
            response_text = _extract_anthropic_text(content_blocks)
            if response_text:
                last_response_text = response_text
            if _anthropic_response_reached_output_limit(response_payload):
                _append_warning_once(warnings, _output_limit_warning(provider.label))

            pending_calls = _extract_anthropic_tool_calls(content_blocks) if tool_definitions else []
            if pending_calls:
                if executed_tool_rounds >= settings.ASSISTANT_MAX_TOOL_ROUNDS:
                    warnings.append(
                        f"{provider.label} reached the configured live-tool round limit before finishing."
                    )
                    break

                message_history.append(
                    {
                        "role": "assistant",
                        "content": content_blocks,
                    }
                )

                tool_result_blocks: list[dict[str, Any]] = []
                for pending_call in pending_calls:
                    result, trace = await self._execute_pending_tool_call(pending_call)
                    tool_calls.append(trace)
                    tool_result_block: dict[str, Any] = {
                        "type": "tool_result",
                        "tool_use_id": pending_call.call_id,
                        "content": json_dumps(result.output),
                    }
                    if result.is_error:
                        tool_result_block["is_error"] = True
                    tool_result_blocks.append(tool_result_block)

                message_history.append(
                    {
                        "role": "user",
                        "content": tool_result_blocks,
                    }
                )
                payload["messages"] = message_history
                executed_tool_rounds += 1
                continue

            if last_response_text:
                return AssistantCompletion(
                    provider=provider.provider,
                    model=model,
                    content=last_response_text,
                    input_tokens=accumulated_input_tokens,
                    output_tokens=accumulated_output_tokens,
                    warnings=warnings or None,
                    tool_calls=tool_calls,
                )
            break

        if last_response_text:
            return AssistantCompletion(
                provider=provider.provider,
                model=model,
                content=last_response_text,
                input_tokens=accumulated_input_tokens,
                output_tokens=accumulated_output_tokens,
                warnings=warnings or None,
                tool_calls=tool_calls,
            )

        raise AssistantServiceError(
            status_code=502,
            detail=f"{provider.label} returned an empty response.",
        )

    async def _generate_google(
        self,
        *,
        provider: AssistantProviderConfig,
        model: str,
        messages: list[AssistantMessageIn],
        system_prompt: str,
        tool_definitions: list[AssistantToolDefinition],
    ) -> AssistantCompletion:
        contents: list[dict[str, Any]] = [
            {
                "role": "model" if message.role == "assistant" else "user",
                "parts": [{"text": message.content}],
            }
            for message in messages
        ]
        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": settings.ASSISTANT_MAX_OUTPUT_TOKENS,
            },
        }
        if system_prompt:
            payload["systemInstruction"] = {
                "parts": [{"text": system_prompt}],
            }
        if tool_definitions:
            payload["tools"] = [
                {
                    "functionDeclarations": [
                        {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.parameters,
                        }
                        for tool in tool_definitions
                    ]
                }
            ]

        executed_tool_rounds = 0
        accumulated_input_tokens: int | None = None
        accumulated_output_tokens: int | None = None
        last_response_text = ""
        warnings: list[str] = []
        tool_calls: list[AssistantToolCallTrace] = []

        while True:
            response_payload = await _post_json(
                url=f"{provider.base_url.rstrip('/')}/models/{model}:generateContent",
                headers={
                    "x-goog-api-key": provider.api_key,
                    "Content-Type": "application/json",
                },
                payload=payload,
                provider_label=provider.label,
            )

            prompt_feedback = response_payload.get("promptFeedback", {})
            block_reason = prompt_feedback.get("blockReason")
            if block_reason:
                raise AssistantServiceError(
                    status_code=400,
                    detail=f"{provider.label} blocked the request: {block_reason}.",
                )

            usage = response_payload.get("usageMetadata", {})
            accumulated_input_tokens = _sum_optional_int(
                accumulated_input_tokens,
                _coerce_int(usage.get("promptTokenCount")),
            )
            accumulated_output_tokens = _sum_optional_int(
                accumulated_output_tokens,
                _coerce_int(usage.get("candidatesTokenCount")),
            )

            candidates = response_payload.get("candidates", [])
            if not candidates:
                raise AssistantServiceError(
                    status_code=502,
                    detail=f"{provider.label} returned no candidates.",
                )

            candidate = candidates[0]
            content = candidate.get("content", {})
            parts = content.get("parts", []) if isinstance(content, dict) else []
            response_text = _extract_google_text(parts)
            if response_text:
                last_response_text = response_text
            if _google_candidate_reached_output_limit(candidate):
                _append_warning_once(warnings, _output_limit_warning(provider.label))

            pending_calls = _extract_google_tool_calls(parts) if tool_definitions else []
            if pending_calls:
                if executed_tool_rounds >= settings.ASSISTANT_MAX_TOOL_ROUNDS:
                    warnings.append(
                        f"{provider.label} reached the configured live-tool round limit before finishing."
                    )
                    break

                model_content = content if isinstance(content, dict) else {"parts": parts}
                payload["contents"].append(
                    {
                        **model_content,
                        "role": model_content.get("role") or "model",
                    }
                )

                tool_response_parts: list[dict[str, Any]] = []
                for pending_call in pending_calls:
                    result, trace = await self._execute_pending_tool_call(pending_call)
                    tool_calls.append(trace)
                    tool_response_parts.append(
                        {
                            "functionResponse": {
                                "name": pending_call.tool_name,
                                "response": result.output,
                            }
                        }
                    )

                payload["contents"].append(
                    {
                        "role": "user",
                        "parts": tool_response_parts,
                    }
                )
                executed_tool_rounds += 1
                continue

            if last_response_text:
                return AssistantCompletion(
                    provider=provider.provider,
                    model=model,
                    content=last_response_text,
                    input_tokens=accumulated_input_tokens,
                    output_tokens=accumulated_output_tokens,
                    warnings=warnings or None,
                    tool_calls=tool_calls,
                )
            break

        if last_response_text:
            return AssistantCompletion(
                provider=provider.provider,
                model=model,
                content=last_response_text,
                input_tokens=accumulated_input_tokens,
                output_tokens=accumulated_output_tokens,
                warnings=warnings or None,
                tool_calls=tool_calls,
            )

        raise AssistantServiceError(
            status_code=502,
            detail=f"{provider.label} returned an empty response.",
        )

    def _resolve_tooling(
        self,
        payload: AssistantPromptRequest,
        agent_definition: ManagedAssistantAgent | None,
    ) -> tuple[list[AssistantToolDefinition], list[str]]:
        warnings: list[str] = []
        if not payload.use_live_tools:
            return [], warnings
        if settings.ASSISTANT_MAX_TOOL_ROUNDS < 1:
            warnings.append(
                "Live assistant tools are disabled because the tool-round limit is set to 0."
            )
            return [], warnings
        if self._tool_service is None:
            warnings.append(
                "Live assistant tools are unavailable on this API worker, so the response used prompt context only."
            )
            return [], warnings
        if agent_definition is not None and "READ" not in {capability.upper() for capability in agent_definition.capabilities}:
            warnings.append(
                f"{agent_definition.name} does not include READ capability, so live tools were disabled for this response."
            )
            return [], warnings
        if agent_definition is None:
            return [
                tool_definition
                for tool_definition in self._tool_definitions
                if evaluate_tool_policy(
                    agent=None,
                    tool_id=tool_definition.name,
                    workspace=payload.workspace,
                ).allowed
            ], warnings

        filtered_tool_definitions = [
            tool_definition
            for tool_definition in self._tool_definitions
            if evaluate_tool_policy(
                agent=agent_definition,
                tool_id=tool_definition.name,
                workspace=payload.workspace,
            ).allowed
        ]
        if filtered_tool_definitions:
            return filtered_tool_definitions, warnings

        warnings.append(
            f"{agent_definition.name} has no enabled live tools on this API worker, so the response used prompt context only."
        )
        return [], warnings

    async def _execute_pending_tool_call(
        self,
        pending_call: PendingToolCall,
    ) -> tuple[AssistantToolExecutionResult, AssistantToolCallTrace]:
        if pending_call.parse_error:
            result = AssistantToolExecutionResult(
                output={
                    "ok": False,
                    "error": pending_call.parse_error,
                },
                summary=f"{pending_call.tool_name} failed: {pending_call.parse_error}",
                record_count=0,
                is_error=True,
            )
            trace = AssistantToolCallTrace(
                tool_name=pending_call.tool_name,
                arguments=pending_call.arguments,
                summary=result.summary,
                record_count=0,
            )
            return result, trace

        if self._tool_service is None:
            result = AssistantToolExecutionResult(
                output={
                    "ok": False,
                    "error": "Live assistant tools are unavailable on this API worker.",
                },
                summary=f"{pending_call.tool_name} failed: live assistant tools are unavailable.",
                record_count=0,
                is_error=True,
            )
            trace = AssistantToolCallTrace(
                tool_name=pending_call.tool_name,
                arguments=pending_call.arguments,
                summary=result.summary,
                record_count=0,
            )
            return result, trace

        try:
            return await self._tool_service.execute_tool_async(pending_call.tool_name, pending_call.arguments)
        except AssistantToolServiceError as exc:
            result = AssistantToolExecutionResult(
                output={
                    "ok": False,
                    "error": exc.message,
                },
                summary=f"{pending_call.tool_name} failed: {exc.message}",
                record_count=0,
                is_error=True,
            )
            trace = AssistantToolCallTrace(
                tool_name=pending_call.tool_name,
                arguments=pending_call.arguments,
                summary=result.summary,
                record_count=0,
            )
            return result, trace


def build_assistant_runtime_settings() -> AssistantRuntimeSettingsOut:
    provider_configs = list_provider_configs()
    effective_default_provider = determine_effective_default_provider(provider_configs)
    available_tools = build_tool_definitions()
    available_skills = list_agent_skill_definitions()
    return AssistantRuntimeSettingsOut(
        enabled=bool(settings.ASSISTANT_ENABLED and effective_default_provider),
        default_provider=normalize_default_provider(settings.ASSISTANT_DEFAULT_PROVIDER),
        effective_default_provider=effective_default_provider,
        configured_provider_count=sum(1 for config in provider_configs if config.configured),
        default_daily_token_allocation=settings.ASSISTANT_AGENT_DAILY_TOKEN_ALLOCATION,
        providers=[
            AssistantProviderStatusOut(
                provider=config.provider,
                label=config.label,
                enabled=config.enabled,
                configured=config.configured,
                is_default=config.is_default,
                default_model=config.model,
                base_url=config.base_url,
                setup_env_var=config.setup_env_var,
            )
            for config in provider_configs
        ],
        voice_transcription=build_assistant_voice_transcription_settings(),
        available_skills=[definition.to_out() for definition in available_skills],
        available_tools=[
            {"name": tool.name, "description": tool.description}
            for tool in available_tools
        ],
        available_action_types=[
            {
                "name": action_type.name,
                "label": action_type.label,
                "description": action_type.description,
            }
            for action_type in ASSISTANT_ACTION_DEFINITIONS
        ],
    )


def list_provider_configs() -> list[AssistantProviderConfig]:
    default_provider = normalize_default_provider(settings.ASSISTANT_DEFAULT_PROVIDER)
    return [
        _build_provider_config(
            provider="openai",
            default_provider=default_provider,
            api_key=settings.OPENAI_API_KEY,
            model=settings.OPENAI_MODEL,
            base_url=settings.OPENAI_BASE_URL,
        ),
        _build_provider_config(
            provider="anthropic",
            default_provider=default_provider,
            api_key=settings.ANTHROPIC_API_KEY,
            model=settings.ANTHROPIC_MODEL,
            base_url=settings.ANTHROPIC_BASE_URL,
        ),
        _build_provider_config(
            provider="google",
            default_provider=default_provider,
            api_key=settings.GOOGLE_API_KEY,
            model=settings.GOOGLE_MODEL,
            base_url=settings.GOOGLE_BASE_URL,
        ),
    ]


def resolve_provider_config(requested_provider: AssistantProvider | None = None) -> AssistantProviderConfig:
    provider_configs = {config.provider: config for config in list_provider_configs()}

    if not settings.ASSISTANT_ENABLED:
        raise AssistantServiceError(
            status_code=503,
            detail="Assistant interactions are disabled on this API.",
        )

    if requested_provider is not None:
        config = provider_configs[requested_provider]
        if not config.configured:
            raise AssistantServiceError(
                status_code=503,
                detail=f"{config.label} is not configured on this API.",
            )
        return config

    effective_default_provider = determine_effective_default_provider(provider_configs.values())
    if effective_default_provider is None:
        raise AssistantServiceError(
            status_code=503,
            detail="No assistant providers are configured on this API.",
        )
    return provider_configs[effective_default_provider]


def determine_effective_default_provider(
    provider_configs: Iterable[AssistantProviderConfig],
) -> AssistantProvider | None:
    configs = list(provider_configs)
    default_provider = normalize_default_provider(settings.ASSISTANT_DEFAULT_PROVIDER)
    preferred = next((config for config in configs if config.provider == default_provider and config.configured), None)
    if preferred is not None:
        return preferred.provider
    fallback = next((config for config in configs if config.configured), None)
    return fallback.provider if fallback is not None else None


def _dedupe_preserving_order(values: list[str]) -> list[str]:
    deduped_values: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped_values.append(value)
    return deduped_values


def _append_warning_once(warnings: list[str], warning: str) -> None:
    if warning not in warnings:
        warnings.append(warning)


def _output_limit_warning(provider_label: str) -> str:
    return (
        f"{provider_label} reached ASSISTANT_MAX_OUTPUT_TOKENS "
        f"({settings.ASSISTANT_MAX_OUTPUT_TOKENS:,}) before finishing, so the answer may be cut off."
    )


def normalize_default_provider(value: str) -> AssistantProvider:
    normalized = value.strip().lower()
    if normalized in VALID_PROVIDERS:
        return cast(AssistantProvider, normalized)
    return "openai"


def resolve_effective_runtime(
    payload: AssistantPromptContextRequest,
    agent_definition: ManagedAssistantAgent | None,
) -> tuple[AssistantProviderConfig, str, list[str]]:
    warnings: list[str] = []
    requested_provider = payload.provider or (agent_definition.provider if agent_definition is not None else None)
    provider = resolve_provider_config(requested_provider)
    model = provider.model

    if agent_definition is None:
        return provider, model, warnings

    if payload.provider and agent_definition.provider and payload.provider != agent_definition.provider:
        warnings.append(
            f"Agent default provider {agent_definition.provider} was overridden to {payload.provider} for this response."
        )

    if agent_definition.model:
        if payload.provider and agent_definition.provider and payload.provider != agent_definition.provider:
            warnings.append(
                f"Agent default model {agent_definition.model} only applies to {agent_definition.provider}; using {model}."
            )
        else:
            model = agent_definition.model

    return provider, model, warnings


def build_system_prompt(
    payload: AssistantPromptContextRequest,
    agent_definition: ManagedAssistantAgent | None = None,
) -> str:
    prompt_parts: list[str] = []
    base_prompt = settings.ASSISTANT_SYSTEM_PROMPT.strip()
    if base_prompt:
        prompt_parts.append(base_prompt)
    prompt_parts.append(
        "If the user asks how managed agents are constructed, specialized, or related to each other, "
        "inspect the roster with list_managed_agents or get_managed_agent_profile instead of guessing."
    )
    prompt_parts.append(
        "If the user asks how ECTRM is wired, where logic lives, what the database schema looks like, or which "
        "routes and workspaces exist, inspect get_application_catalog, get_data_schema_catalog, search_codebase, "
        "or read_codebase_file instead of guessing."
    )
    if agent_definition is not None:
        skill_list = ", ".join(agent_definition.skills) if agent_definition.skills else "none"
        allowed_tools = ", ".join(agent_definition.allowed_tools) if agent_definition.allowed_tools else "all published read-only tools"
        allowed_action_types = (
            ", ".join(agent_definition.allowed_action_types)
            if agent_definition.allowed_action_types
            else (
                "all published approval-gated actions"
                if "ACTION" in {capability.upper() for capability in agent_definition.capabilities}
                else "none"
            )
        )
        prompt_parts.append(
            "Managed agent profile:\n"
            f"- id: {agent_definition.agent_id}\n"
            f"- name: {agent_definition.name}\n"
            f"- role: {agent_definition.role_key or 'custom'}\n"
            f"- scope: {agent_definition.scope}\n"
            f"- build recipe: role + skills + capabilities + workspaces + live tools + governed actions + system prompt\n"
            f"- capabilities: {', '.join(agent_definition.capabilities)}\n"
            f"- skills: {skill_list}\n"
            f"- allowed workspaces: {', '.join(agent_definition.allowed_workspaces)}\n"
            f"- allowed live tools: {allowed_tools}\n"
            f"- allowed actions: {allowed_action_types}\n"
            f"- orchestration pattern: {agent_definition.orchestration_pattern}"
        )
        if agent_definition.parent_agent_id:
            prompt_parts.append(f"Hierarchy: this agent reports to {agent_definition.parent_agent_id}.")
        if agent_definition.managed_agent_ids:
            prompt_parts.append(
                "Hierarchy: this agent may consult only these managed agents: "
                f"{', '.join(agent_definition.managed_agent_ids)}."
            )
        if agent_definition.delegation_guidance:
            prompt_parts.append(f"Delegation guidance: {agent_definition.delegation_guidance}")
        if "consult_managed_agent" in set(agent_definition.allowed_tools):
            prompt_parts.append(
                "Use consult_managed_agent for advisory-only specialist input when you need another managed "
                "agent's judgment but will keep the final synthesis and action ownership here."
            )
        if "enlist_managed_agent" in set(agent_definition.allowed_tools):
            prompt_parts.append(
                "Use enlist_managed_agent when a configured managed agent should own a bounded subtask and may "
                "need to stage or execute a governed action inside its own lane. Keep the final user-facing "
                "synthesis and accountability here."
            )
        prompt_parts.append(f"Agent instructions:\n{agent_definition.system_prompt}")
    if payload.workspace:
        prompt_parts.append(f"Current workspace: {payload.workspace}.")
    if payload.context:
        prompt_parts.append(f"Application context:\n{payload.context}")
    return "\n\n".join(prompt_parts)


def _build_openai_agent_builder_instructions() -> str:
    return "\n".join(
        [
            "You are designing a managed assistant agent for the ECTRM operator console.",
            "Return only JSON that matches the requested schema.",
            "Generate a concise agent_id using lowercase letters, numbers, and hyphens.",
            "Choose the smallest explicit skill set that makes the agent's domain specialization obvious to an operator.",
            "Choose the smallest workspace list and live-tool subset that still lets the agent do its job well.",
            "If the role does not need live reads, omit READ and return an empty allowed_tools array.",
            "If the role needs all published read-only tools, keep READ and still return an empty allowed_tools array.",
            "Only include consult_managed_agent or enlist_managed_agent when the skills array also includes inter_agent_consultation.",
            "If the role does not need approval-gated mutations, omit ACTION and return an empty allowed_action_types array.",
            "If the role needs all published approval-gated mutations, keep ACTION and still return an empty allowed_action_types array.",
            "Write a concrete system_prompt that explains mission, evidence standards, style, and guardrails.",
            "This generated agent will be pinned to the OpenAI provider for runtime use.",
        ]
    )


def _build_openai_agent_self_update_instructions() -> str:
    return "\n".join(
        [
            "You are revising a managed assistant agent for the ECTRM operator console after it learned from mistakes.",
            "Return only JSON that matches the requested schema.",
            "Preserve or narrow the current agent scope. Never expand workspaces, capabilities, live tools, or governed actions.",
            "Preserve or narrow the current explicit skills. Do not introduce new skills in a self-update draft.",
            "Focus on safer behavior: clearer evidence standards, stronger stop conditions, narrower permissions, and better reviewer context.",
            "Do not change immutable identity or governance metadata such as agent_id, provider, model, scope, role ownership, or authority ceiling.",
            "If recent mistakes involve unsupported or low-quality actions, prefer narrowing ACTION scope or removing ACTION entirely.",
            "If recent mistakes involve weak evidence, strengthen the system_prompt so the agent distinguishes facts, assumptions, and stop conditions.",
            "Keep the revised description concise and aligned with the narrowed mission.",
            "Write a concrete system_prompt that addresses the cited failures without becoming verbose.",
        ]
    )


def _resolve_openai_runtime_model(
    payload: AssistantAgentBuildRequest,
    default_model: str,
) -> str:
    current_draft = payload.current_draft
    if current_draft is None:
        return default_model

    draft_model = (current_draft.model or "").strip()
    if not draft_model:
        return default_model

    if current_draft.provider is None or current_draft.provider == "openai":
        return draft_model
    return default_model


def _collect_agent_builder_warnings(
    payload: AssistantAgentBuildRequest,
    runtime_model: str,
) -> list[str]:
    current_draft = payload.current_draft
    if current_draft is None:
        return []

    warnings: list[str] = []
    if current_draft.provider and current_draft.provider != "openai":
        warnings.append(
            f"Runtime provider was pinned to OpenAI instead of {current_draft.provider} so the built agent can answer through the existing OpenAI integration."
        )
    if current_draft.model and current_draft.provider and current_draft.provider != "openai":
        warnings.append(
            f"Runtime model was reset to {runtime_model} because the previous model only applied to {current_draft.provider}."
        )
    return warnings


def _build_openai_agent_self_update_schema(agent_definition: ManagedAssistantAgent) -> dict[str, Any]:
    current_workspaces = list(agent_definition.allowed_workspaces)
    current_capabilities = list(agent_definition.capabilities)
    current_skills = list(agent_definition.skills)
    current_tools = list(agent_definition.allowed_tools)
    current_action_types = list(agent_definition.allowed_action_types)
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 500,
            },
            "allowed_workspaces": {
                "type": "array",
                "minItems": 1,
                "maxItems": len(current_workspaces),
                "uniqueItems": True,
                "items": {
                    "type": "string",
                    "enum": current_workspaces,
                },
            },
            "capabilities": {
                "type": "array",
                "minItems": 1,
                "maxItems": len(current_capabilities),
                "uniqueItems": True,
                "items": {
                    "type": "string",
                    "enum": current_capabilities,
                },
            },
            "skills": {
                "type": "array",
                "minItems": 0,
                "maxItems": len(current_skills),
                "uniqueItems": True,
                "items": (
                    {
                        "type": "string",
                        "enum": current_skills,
                    }
                    if current_skills
                    else {"type": "string"}
                ),
            },
            "allowed_tools": {
                "type": "array",
                "minItems": 0,
                "maxItems": len(current_tools),
                "uniqueItems": True,
                "items": (
                    {
                        "type": "string",
                        "enum": current_tools,
                    }
                    if current_tools
                    else {"type": "string"}
                ),
            },
            "allowed_action_types": {
                "type": "array",
                "minItems": 0,
                "maxItems": len(current_action_types),
                "uniqueItems": True,
                "items": (
                    {
                        "type": "string",
                        "enum": current_action_types,
                    }
                    if current_action_types
                    else {"type": "string"}
                ),
            },
            "system_prompt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 20_000,
            },
            "change_summary": {
                "type": "array",
                "minItems": 1,
                "maxItems": 6,
                "uniqueItems": True,
                "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 500,
                },
            },
        },
        "required": [
            "description",
            "allowed_workspaces",
            "capabilities",
            "skills",
            "allowed_tools",
            "allowed_action_types",
            "system_prompt",
            "change_summary",
        ],
    }


def _build_openai_agent_builder_schema(published_tool_names: list[str]) -> dict[str, Any]:
    tool_items_schema: dict[str, Any]
    if published_tool_names:
        tool_items_schema = {
            "type": "string",
            "enum": published_tool_names,
        }
    else:
        tool_items_schema = {"type": "string"}

    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "agent_id": {
                "type": "string",
                "minLength": 2,
                "maxLength": 64,
                "pattern": r"^[a-z0-9][a-z0-9_-]{1,63}$",
            },
            "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 160,
            },
            "description": {
                "type": "string",
                "minLength": 1,
                "maxLength": 500,
            },
            "scope": {
                "type": "string",
                "enum": list(get_args(AssistantAgentScope)),
            },
            "allowed_workspaces": {
                "type": "array",
                "minItems": 1,
                "maxItems": 16,
                "uniqueItems": True,
                "items": {
                    "type": "string",
                    "enum": list(get_args(AssistantWorkspace)),
                },
            },
            "capabilities": {
                "type": "array",
                "minItems": 1,
                "maxItems": 4,
                "uniqueItems": True,
                "items": {
                    "type": "string",
                    "enum": list(get_args(AssistantAgentCapability)),
                },
            },
            "skills": {
                "type": "array",
                "maxItems": 24,
                "uniqueItems": True,
                "items": {
                    "type": "string",
                    "enum": list(list_agent_skill_keys()),
                },
            },
            "allowed_tools": {
                "type": "array",
                "maxItems": 16,
                "uniqueItems": True,
                "items": tool_items_schema,
            },
            "allowed_action_types": {
                "type": "array",
                "maxItems": 16,
                "uniqueItems": True,
                "items": {
                    "type": "string",
                    "enum": list(get_args(AssistantActionType)),
                },
            },
            "system_prompt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 20_000,
            },
        },
        "required": [
            "agent_id",
            "name",
            "description",
            "scope",
            "allowed_workspaces",
            "capabilities",
            "skills",
            "allowed_tools",
            "allowed_action_types",
            "system_prompt",
        ],
    }


def _parse_openai_agent_builder_output(response_payload: dict[str, Any]) -> dict[str, Any]:
    response_text = _extract_openai_text(response_payload)
    if not response_text:
        raise AssistantServiceError(
            status_code=502,
            detail="OpenAI Agent Builder returned an empty response.",
        )

    try:
        parsed_payload = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise AssistantServiceError(
            status_code=502,
            detail="OpenAI Agent Builder returned invalid JSON.",
        ) from exc

    if not isinstance(parsed_payload, dict):
        raise AssistantServiceError(
            status_code=502,
            detail="OpenAI Agent Builder returned an unexpected payload shape.",
        )

    return cast(dict[str, Any], parsed_payload)


def _parse_openai_agent_self_update_output(response_payload: dict[str, Any]) -> dict[str, Any]:
    response_text = _extract_openai_text(response_payload)
    if not response_text:
        raise AssistantServiceError(
            status_code=502,
            detail="OpenAI Agent Self Update returned an empty response.",
        )

    try:
        parsed_payload = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise AssistantServiceError(
            status_code=502,
            detail="OpenAI Agent Self Update returned invalid JSON.",
        ) from exc

    if not isinstance(parsed_payload, dict):
        raise AssistantServiceError(
            status_code=502,
            detail="OpenAI Agent Self Update returned an unexpected payload shape.",
        )

    return cast(dict[str, Any], parsed_payload)


def _build_provider_config(
    *,
    provider: AssistantProvider,
    default_provider: AssistantProvider,
    api_key: str,
    model: str,
    base_url: str,
) -> AssistantProviderConfig:
    configured = bool(api_key.strip())
    return AssistantProviderConfig(
        provider=provider,
        label=PROVIDER_LABELS[provider],
        api_key=api_key.strip(),
        model=model.strip(),
        base_url=base_url.strip(),
        configured=configured,
        enabled=bool(settings.ASSISTANT_ENABLED and configured),
        is_default=provider == default_provider,
        setup_env_var=PROVIDER_SETUP_ENV_VARS[provider],
    )


async def _post_json(
    *,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    provider_label: str,
) -> dict[str, Any]:
    started_at = perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.ASSISTANT_TIMEOUT_SECONDS) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider=provider_label,
            method="POST",
            url=url,
            status_code=getattr(getattr(exc, "response", None), "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc.__class__.__name__,
        )
        raise AssistantServiceError(
            status_code=502,
            detail=f"{provider_label} request failed: {exc}",
        ) from exc

    if response.is_error:
        detail = _extract_provider_error_message(provider_label, response)
        log_outbound_request(
            logger,
            provider=provider_label,
            method="POST",
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=detail,
        )
        raise AssistantServiceError(
            status_code=502 if response.status_code >= 500 else 400,
            detail=detail,
        )

    log_outbound_request(
        logger,
        provider=provider_label,
        method="POST",
        url=url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
    return cast(dict[str, Any], response.json())


def _extract_provider_error_message(provider_label: str, response: httpx.Response) -> str:
    default_message = f"{provider_label} request failed with status {response.status_code}."
    try:
        payload = response.json()
    except ValueError:
        text = response.text.strip()
        return text or default_message

    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
        type_value = error.get("type")
        if isinstance(type_value, str) and type_value.strip():
            return f"{default_message} {type_value.strip()}"
    if isinstance(error, str) and error.strip():
        return error.strip()
    detail = payload.get("detail")
    if isinstance(detail, str) and detail.strip():
        return detail.strip()
    return default_message


def _extract_openai_text(response_payload: dict[str, Any]) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    texts: list[str] = []
    for item in response_payload.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text" and content.get("text"):
                texts.append(str(content["text"]).strip())
    return "\n".join(text for text in texts if text).strip()


def _openai_response_reached_output_limit(response_payload: dict[str, Any]) -> bool:
    incomplete_details = response_payload.get("incomplete_details")
    if isinstance(incomplete_details, dict) and incomplete_details.get("reason") == "max_output_tokens":
        return True

    for item in response_payload.get("output", []):
        if not isinstance(item, dict):
            continue
        item_incomplete_details = item.get("incomplete_details")
        if (
            item.get("status") == "incomplete"
            and isinstance(item_incomplete_details, dict)
            and item_incomplete_details.get("reason") == "max_output_tokens"
        ):
            return True
    return False


def _extract_openai_tool_calls(response_payload: dict[str, Any]) -> list[PendingToolCall]:
    pending_calls: list[PendingToolCall] = []
    for item in response_payload.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "function_call":
            continue
        tool_name = str(item.get("name") or "").strip()
        call_id = str(item.get("call_id") or item.get("id") or "").strip()
        if not tool_name or not call_id:
            continue
        arguments, parse_error = _normalize_tool_arguments(item.get("arguments"))
        pending_calls.append(
            PendingToolCall(
                call_id=call_id,
                tool_name=tool_name,
                arguments=arguments,
                parse_error=parse_error,
            )
        )
    return pending_calls


def _extract_anthropic_text(content_blocks: Any) -> str:
    return "\n".join(
        block.get("text", "").strip()
        for block in content_blocks
        if isinstance(block, dict) and block.get("type") == "text" and block.get("text")
    ).strip()


def _anthropic_response_reached_output_limit(response_payload: dict[str, Any]) -> bool:
    return response_payload.get("stop_reason") == "max_tokens"


def _extract_anthropic_tool_calls(content_blocks: Any) -> list[PendingToolCall]:
    pending_calls: list[PendingToolCall] = []
    for block in content_blocks:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        tool_name = str(block.get("name") or "").strip()
        call_id = str(block.get("id") or "").strip()
        if not tool_name or not call_id:
            continue
        arguments, parse_error = _normalize_tool_arguments(block.get("input"))
        pending_calls.append(
            PendingToolCall(
                call_id=call_id,
                tool_name=tool_name,
                arguments=arguments,
                parse_error=parse_error,
            )
        )
    return pending_calls


def _extract_google_text(parts: Any) -> str:
    return "\n".join(
        part.get("text", "").strip()
        for part in parts
        if isinstance(part, dict) and part.get("text")
    ).strip()


def _google_candidate_reached_output_limit(candidate: dict[str, Any]) -> bool:
    return candidate.get("finishReason") == "MAX_TOKENS"


def _extract_google_tool_calls(parts: Any) -> list[PendingToolCall]:
    pending_calls: list[PendingToolCall] = []
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            continue
        function_call = part.get("functionCall")
        if not isinstance(function_call, dict):
            continue
        tool_name = str(function_call.get("name") or "").strip()
        if not tool_name:
            continue
        arguments, parse_error = _normalize_tool_arguments(function_call.get("args"))
        pending_calls.append(
            PendingToolCall(
                call_id=f"{tool_name}:{index}",
                tool_name=tool_name,
                arguments=arguments,
                parse_error=parse_error,
            )
        )
    return pending_calls


def _normalize_tool_arguments(raw_arguments: Any) -> tuple[dict[str, Any], str | None]:
    if raw_arguments is None:
        return {}, None
    if isinstance(raw_arguments, dict):
        return raw_arguments, None
    if isinstance(raw_arguments, str):
        stripped = raw_arguments.strip()
        if not stripped:
            return {}, None
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return {}, "Tool arguments were not valid JSON."
        if isinstance(parsed, dict):
            return parsed, None
        return {}, "Tool arguments must decode to a JSON object."
    return {}, "Tool arguments must be provided as a JSON object."


def _require_response_id(response_payload: dict[str, Any], provider_label: str) -> str:
    response_id = str(response_payload.get("id") or "").strip()
    if not response_id:
        raise AssistantServiceError(
            status_code=502,
            detail=f"{provider_label} did not return a response id for the next tool round.",
        )
    return response_id


def _sum_optional_int(current: int | None, next_value: int | None) -> int | None:
    if next_value is None:
        return current
    return (current or 0) + next_value


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return None
