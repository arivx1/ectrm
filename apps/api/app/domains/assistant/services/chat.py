from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, cast

import httpx

from apps.api.app.config import settings
from apps.api.app.domains.assistant.services.prompt_context import AssistantPromptEnvelope
from apps.api.app.domains.assistant.services.registry import ManagedAssistantAgent
from apps.api.app.domains.assistant.services.tools import build_tool_definitions
from apps.api.app.schemas.assistant import (
    AssistantMessageIn,
    AssistantMessageOut,
    AssistantPromptContextRequest,
    AssistantPromptRequest,
    AssistantPromptResponse,
    AssistantProvider,
    AssistantProviderStatusOut,
    AssistantRuntimeSettingsOut,
    AssistantUsageOut,
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


class AssistantServiceError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class AssistantService:
    async def generate_response(
        self,
        payload: AssistantPromptRequest,
        agent_definition: ManagedAssistantAgent | None = None,
        prompt_context: AssistantPromptEnvelope | None = None,
    ) -> AssistantPromptResponse:
        provider, model, warnings = resolve_effective_runtime(payload, agent_definition)
        system_prompt = (
            prompt_context.system_prompt
            if prompt_context is not None
            else build_system_prompt(payload, agent_definition)
        )

        if provider.provider == "openai":
            completion = await self._generate_openai(
                provider=provider,
                model=model,
                messages=payload.messages,
                system_prompt=system_prompt,
            )
        elif provider.provider == "anthropic":
            completion = await self._generate_anthropic(
                provider=provider,
                model=model,
                messages=payload.messages,
                system_prompt=system_prompt,
            )
        else:
            completion = await self._generate_google(
                provider=provider,
                model=model,
                messages=payload.messages,
                system_prompt=system_prompt,
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
            provider=completion.provider,
            model=completion.model,
            message=AssistantMessageOut(content=completion.content),
            usage=AssistantUsageOut(
                input_tokens=completion.input_tokens,
                output_tokens=completion.output_tokens,
            ),
            warnings=[*warnings, *(prompt_context.warnings if prompt_context is not None else ()), *(completion.warnings or [])],
        )

    async def _generate_openai(
        self,
        *,
        provider: AssistantProviderConfig,
        model: str,
        messages: list[AssistantMessageIn],
        system_prompt: str,
    ) -> AssistantCompletion:
        input_messages: list[dict[str, Any]] = []

        if system_prompt:
            input_messages.append(
                {
                    "type": "message",
                    "role": "system",
                    "content": [{"type": "input_text", "text": system_prompt}],
                }
            )

        for message in messages:
            input_messages.append(
                {
                    "type": "message",
                    "role": message.role,
                    "content": [{"type": "input_text", "text": message.content}],
                }
            )

        response_payload = await _post_json(
            url=f"{provider.base_url.rstrip('/')}/responses",
            headers={
                "Authorization": f"Bearer {provider.api_key}",
                "Content-Type": "application/json",
            },
            payload={
                "model": model,
                "input": input_messages,
                "max_output_tokens": settings.ASSISTANT_MAX_OUTPUT_TOKENS,
                "text": {"format": {"type": "text"}},
            },
            provider_label=provider.label,
        )

        response_text = _extract_openai_text(response_payload)
        if not response_text:
            raise AssistantServiceError(
                status_code=502,
                detail=f"{provider.label} returned an empty response.",
            )

        usage = response_payload.get("usage", {})
        return AssistantCompletion(
            provider=provider.provider,
            model=model,
            content=response_text,
            input_tokens=_coerce_int(usage.get("input_tokens")),
            output_tokens=_coerce_int(usage.get("output_tokens")),
        )

    async def _generate_anthropic(
        self,
        *,
        provider: AssistantProviderConfig,
        model: str,
        messages: list[AssistantMessageIn],
        system_prompt: str,
    ) -> AssistantCompletion:
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": settings.ASSISTANT_MAX_OUTPUT_TOKENS,
            "messages": [
                {
                    "role": message.role,
                    "content": message.content,
                }
                for message in messages
            ],
        }
        if system_prompt:
            payload["system"] = system_prompt

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

        content_blocks = response_payload.get("content", [])
        response_text = "\n".join(
            block.get("text", "").strip()
            for block in content_blocks
            if isinstance(block, dict) and block.get("type") == "text" and block.get("text")
        ).strip()
        if not response_text:
            raise AssistantServiceError(
                status_code=502,
                detail=f"{provider.label} returned an empty response.",
            )

        usage = response_payload.get("usage", {})
        return AssistantCompletion(
            provider=provider.provider,
            model=model,
            content=response_text,
            input_tokens=_coerce_int(usage.get("input_tokens")),
            output_tokens=_coerce_int(usage.get("output_tokens")),
        )

    async def _generate_google(
        self,
        *,
        provider: AssistantProviderConfig,
        model: str,
        messages: list[AssistantMessageIn],
        system_prompt: str,
    ) -> AssistantCompletion:
        payload: dict[str, Any] = {
            "contents": [
                {
                    "role": "model" if message.role == "assistant" else "user",
                    "parts": [{"text": message.content}],
                }
                for message in messages
            ],
            "generationConfig": {
                "maxOutputTokens": settings.ASSISTANT_MAX_OUTPUT_TOKENS,
            },
        }
        if system_prompt:
            payload["systemInstruction"] = {
                "parts": [{"text": system_prompt}],
            }

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

        candidates = response_payload.get("candidates", [])
        if not candidates:
            raise AssistantServiceError(
                status_code=502,
                detail=f"{provider.label} returned no candidates.",
            )

        content = candidates[0].get("content", {})
        parts = content.get("parts", []) if isinstance(content, dict) else []
        response_text = "\n".join(
            part.get("text", "").strip()
            for part in parts
            if isinstance(part, dict) and part.get("text")
        ).strip()
        if not response_text:
            raise AssistantServiceError(
                status_code=502,
                detail=f"{provider.label} returned an empty response.",
            )

        usage = response_payload.get("usageMetadata", {})
        return AssistantCompletion(
            provider=provider.provider,
            model=model,
            content=response_text,
            input_tokens=_coerce_int(usage.get("promptTokenCount")),
            output_tokens=_coerce_int(usage.get("candidatesTokenCount")),
        )


def build_assistant_runtime_settings() -> AssistantRuntimeSettingsOut:
    provider_configs = list_provider_configs()
    effective_default_provider = determine_effective_default_provider(provider_configs)
    available_tools = build_tool_definitions()
    return AssistantRuntimeSettingsOut(
        enabled=bool(settings.ASSISTANT_ENABLED and effective_default_provider),
        default_provider=normalize_default_provider(settings.ASSISTANT_DEFAULT_PROVIDER),
        effective_default_provider=effective_default_provider,
        configured_provider_count=sum(1 for config in provider_configs if config.configured),
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
        available_tools=[
            {"name": tool.name, "description": tool.description}
            for tool in available_tools
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
    if agent_definition is not None:
        prompt_parts.append(
            "Managed agent profile:\n"
            f"- id: {agent_definition.agent_id}\n"
            f"- name: {agent_definition.name}\n"
            f"- scope: {agent_definition.scope}\n"
            f"- capabilities: {', '.join(agent_definition.capabilities)}\n"
            f"- allowed workspaces: {', '.join(agent_definition.allowed_workspaces)}"
        )
        prompt_parts.append(f"Agent instructions:\n{agent_definition.system_prompt}")
    if payload.workspace:
        prompt_parts.append(f"Current workspace: {payload.workspace}.")
    if payload.context:
        prompt_parts.append(f"Application context:\n{payload.context}")
    return "\n\n".join(prompt_parts)


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
    try:
        async with httpx.AsyncClient(timeout=settings.ASSISTANT_TIMEOUT_SECONDS) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise AssistantServiceError(
            status_code=502,
            detail=f"{provider_label} request failed: {exc}",
        ) from exc

    if response.is_error:
        raise AssistantServiceError(
            status_code=502 if response.status_code >= 500 else 400,
            detail=_extract_provider_error_message(provider_label, response),
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


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None
