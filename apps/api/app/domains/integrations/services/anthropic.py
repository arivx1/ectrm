from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import ValidationError

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.schemas.integration import (
    AnthropicAPIKeyLookupOut,
    AnthropicAPIKeyOut,
    AnthropicRuntimeSettingsOut,
)

logger = get_logger(__name__)

ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com"
ANTHROPIC_DEFAULT_API_VERSION = "2023-06-01"


class AnthropicIntegrationError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class AnthropicAdminConfig:
    enabled: bool
    admin_api_key: str
    api_key_id: str
    base_url: str
    api_version: str
    timeout_seconds: int


class AnthropicAdminClient:
    def __init__(self, config: AnthropicAdminConfig) -> None:
        self.config = config

    def get_api_key(self, api_key_id: str) -> AnthropicAPIKeyOut:
        payload = self._get(f"/v1/organizations/api_keys/{quote(api_key_id, safe='')}")
        try:
            return AnthropicAPIKeyOut.model_validate(payload)
        except ValidationError as exc:
            raise AnthropicIntegrationError(
                502,
                "Anthropic API key lookup returned an unexpected response.",
            ) from exc

    def _get(self, path: str) -> dict[str, Any]:
        url = f"{self.config.base_url.rstrip('/')}/{path.lstrip('/')}"
        headers = {
            "anthropic-version": self.config.api_version,
            "X-Api-Key": self.config.admin_api_key,
        }
        started_at = perf_counter()
        try:
            with httpx.Client(timeout=self.config.timeout_seconds) as client:
                response = client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            log_outbound_request(
                logger,
                provider="anthropic-admin-api",
                method="GET",
                url=url,
                status_code=getattr(getattr(exc, "response", None), "status_code", None),
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc,
            )
            raise AnthropicIntegrationError(502, f"Anthropic request failed for {path}.") from exc

        log_outbound_request(
            logger,
            provider="anthropic-admin-api",
            method="GET",
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=None if response.status_code < 400 else response.text,
        )

        if response.status_code >= 400:
            raise _anthropic_response_error(path=path, response=response)

        try:
            payload = response.json()
        except ValueError as exc:
            raise AnthropicIntegrationError(
                502,
                f"Anthropic request for {path} returned invalid JSON.",
            ) from exc
        if not isinstance(payload, dict):
            raise AnthropicIntegrationError(
                502,
                f"Anthropic request for {path} returned an unexpected response.",
            )
        return payload


def build_anthropic_runtime_settings() -> AnthropicRuntimeSettingsOut:
    config = _anthropic_admin_config()
    configured = config.enabled and bool(config.admin_api_key and config.api_key_id)
    auth_status = "configured" if configured else "partial" if config.enabled else "none"
    missing_configuration: list[str] = []
    if not config.enabled:
        missing_configuration.append("ANTHROPIC_ADMIN_ENABLED")
    if not config.admin_api_key:
        missing_configuration.append("ANTHROPIC_ADMIN_API_KEY")
    if not config.api_key_id:
        missing_configuration.append("ANTHROPIC_ADMIN_API_KEY_ID")
    return AnthropicRuntimeSettingsOut(
        enabled=config.enabled,
        configured=configured,
        auth_status=auth_status,
        base_url=config.base_url,
        api_version=config.api_version,
        tracked_api_key_id=config.api_key_id or None,
        missing_configuration=missing_configuration,
    )


def get_configured_anthropic_api_key(
    *,
    client: AnthropicAdminClient | None = None,
) -> AnthropicAPIKeyLookupOut:
    config = _require_anthropic_admin_configured()
    anthropic_client = client or AnthropicAdminClient(config)
    api_key = anthropic_client.get_api_key(config.api_key_id)
    warnings: list[str] = []
    if api_key.status != "active":
        warnings.append(f"Anthropic returned API key status {api_key.status}.")
    return AnthropicAPIKeyLookupOut(api_key=api_key, warnings=warnings)


def _anthropic_admin_config() -> AnthropicAdminConfig:
    base_url = settings.ANTHROPIC_ADMIN_BASE_URL.strip() or ANTHROPIC_DEFAULT_BASE_URL
    api_version = settings.ANTHROPIC_ADMIN_API_VERSION.strip() or ANTHROPIC_DEFAULT_API_VERSION
    return AnthropicAdminConfig(
        enabled=settings.ANTHROPIC_ADMIN_ENABLED,
        admin_api_key=settings.ANTHROPIC_ADMIN_API_KEY.strip(),
        api_key_id=settings.ANTHROPIC_ADMIN_API_KEY_ID.strip(),
        base_url=base_url.rstrip("/"),
        api_version=api_version,
        timeout_seconds=settings.ANTHROPIC_ADMIN_TIMEOUT_SECONDS,
    )


def _require_anthropic_admin_configured() -> AnthropicAdminConfig:
    config = _anthropic_admin_config()
    if not config.enabled:
        raise AnthropicIntegrationError(503, "Anthropic admin integration is disabled on this API.")
    if not config.admin_api_key:
        raise AnthropicIntegrationError(
            503,
            "Anthropic admin integration needs ANTHROPIC_ADMIN_API_KEY before it can connect.",
        )
    if not config.api_key_id:
        raise AnthropicIntegrationError(
            503,
            "Anthropic admin integration needs ANTHROPIC_ADMIN_API_KEY_ID before it can connect.",
        )
    return config


def _anthropic_response_error(*, path: str, response: httpx.Response) -> AnthropicIntegrationError:
    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", "").strip()
        suffix = f" Retry after {retry_after}." if retry_after else ""
        return AnthropicIntegrationError(429, f"Anthropic rate limited the request for {path}.{suffix}")
    if response.status_code in {401, 403}:
        return AnthropicIntegrationError(
            502,
            "Anthropic rejected the configured admin credential. Confirm the key and organization access.",
        )
    if response.status_code == 404:
        return AnthropicIntegrationError(
            404,
            "Anthropic could not find the configured API key id.",
        )
    return AnthropicIntegrationError(
        502,
        f"Anthropic request for {path} failed with HTTP {response.status_code}.",
    )
