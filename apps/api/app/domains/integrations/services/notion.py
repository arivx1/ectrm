from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any

import httpx

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.schemas.integration import (
    NotionConnectionTestOut,
    NotionRuntimeSettingsOut,
    NotionSearchResultSummaryOut,
    NotionUserOut,
)

logger = get_logger(__name__)

NOTION_DEFAULT_BASE_URL = "https://api.notion.com/v1"
NOTION_DEFAULT_VERSION = "2026-03-11"
NOTION_REQUIRED_CAPABILITIES = ("Notion API read/search access",)


class NotionIntegrationError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class NotionConfig:
    enabled: bool
    access_token: str
    base_url: str
    api_version: str
    timeout_seconds: int
    search_limit: int


class NotionClient:
    def __init__(self, config: NotionConfig) -> None:
        self.config = config

    def get_current_user(self) -> NotionUserOut:
        payload = self._get("/users/me")
        return _notion_user_from_payload(payload)

    def search(self, *, limit: int) -> dict[str, Any]:
        payload = self._post("/search", {"page_size": limit})
        if not isinstance(payload.get("results"), list):
            raise NotionIntegrationError(502, "Notion search returned an unexpected response.")
        return payload

    def _get(self, path: str) -> dict[str, Any]:
        return self._request("GET", path)

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", path, payload=payload)

    def _request(self, method: str, path: str, *, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.config.base_url.rstrip('/')}/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self.config.access_token}",
            "Notion-Version": self.config.api_version,
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
        started_at = perf_counter()
        try:
            with httpx.Client(timeout=self.config.timeout_seconds) as client:
                response = client.request(method, url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            log_outbound_request(
                logger,
                provider="notion-api",
                method=method,
                url=url,
                status_code=getattr(getattr(exc, "response", None), "status_code", None),
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc,
            )
            raise NotionIntegrationError(502, f"Notion request failed for {path}.") from exc

        log_outbound_request(
            logger,
            provider="notion-api",
            method=method,
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=None if response.status_code < 400 else response.text,
        )

        if response.status_code >= 400:
            raise _notion_response_error(path=path, response=response)

        try:
            response_payload = response.json()
        except ValueError as exc:
            raise NotionIntegrationError(502, f"Notion request for {path} returned invalid JSON.") from exc
        if not isinstance(response_payload, dict):
            raise NotionIntegrationError(502, f"Notion request for {path} returned an unexpected response.")
        return response_payload


def build_notion_runtime_settings() -> NotionRuntimeSettingsOut:
    config = _notion_config()
    configured = config.enabled and bool(config.access_token)
    auth_status = "configured" if configured else "partial" if config.enabled else "none"
    missing_configuration: list[str] = []
    if not config.enabled:
        missing_configuration.append("NOTION_ENABLED")
    if not config.access_token:
        missing_configuration.append("NOTION_ACCESS_TOKEN or NOTION_API_KEY")
    return NotionRuntimeSettingsOut(
        enabled=config.enabled,
        configured=configured,
        auth_status=auth_status,
        base_url=config.base_url,
        api_version=config.api_version,
        search_limit=config.search_limit,
        required_capabilities=list(NOTION_REQUIRED_CAPABILITIES),
        missing_configuration=missing_configuration,
    )


def run_notion_connection_test(*, client: NotionClient | None = None) -> NotionConnectionTestOut:
    config = _require_notion_configured()
    notion_client = client or NotionClient(config)
    user = notion_client.get_current_user()
    search_payload = notion_client.search(limit=config.search_limit)
    result_payloads = search_payload.get("results")
    results = [
        _notion_search_result_from_payload(item)
        for item in result_payloads
        if isinstance(item, dict)
    ] if isinstance(result_payloads, list) else []
    warnings: list[str] = []
    if not results:
        warnings.append("Notion connected successfully but returned no shared/searchable pages or data sources.")
    return NotionConnectionTestOut(
        user=user,
        accessible_result_count=len(results),
        returned_result_count=len(results[: config.search_limit]),
        has_more=bool(search_payload.get("has_more")),
        results=results[: config.search_limit],
        required_capabilities=list(NOTION_REQUIRED_CAPABILITIES),
        warnings=warnings,
    )


def _notion_config() -> NotionConfig:
    access_token = settings.NOTION_ACCESS_TOKEN.strip() or settings.NOTION_API_KEY.strip()
    base_url = settings.NOTION_BASE_URL.strip() or NOTION_DEFAULT_BASE_URL
    api_version = settings.NOTION_VERSION.strip() or NOTION_DEFAULT_VERSION
    return NotionConfig(
        enabled=settings.NOTION_ENABLED,
        access_token=access_token,
        base_url=base_url.rstrip("/"),
        api_version=api_version,
        timeout_seconds=settings.NOTION_TIMEOUT_SECONDS,
        search_limit=settings.NOTION_SEARCH_LIMIT,
    )


def _require_notion_configured() -> NotionConfig:
    config = _notion_config()
    if not config.enabled:
        raise NotionIntegrationError(503, "Notion integration is disabled on this API.")
    if not config.access_token:
        raise NotionIntegrationError(
            503,
            "Notion integration needs NOTION_ACCESS_TOKEN or NOTION_API_KEY before it can connect.",
        )
    return config


def _notion_response_error(*, path: str, response: httpx.Response) -> NotionIntegrationError:
    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", "").strip()
        suffix = f" Retry after {retry_after}." if retry_after else ""
        return NotionIntegrationError(429, f"Notion rate limited the request for {path}.{suffix}")
    if response.status_code in {401, 403}:
        return NotionIntegrationError(
            502,
            "Notion rejected the configured credential. Confirm the token, Notion API capability, and shared pages.",
        )
    return NotionIntegrationError(
        502,
        f"Notion request for {path} failed with HTTP {response.status_code}.",
    )


def _notion_user_from_payload(payload: dict[str, Any]) -> NotionUserOut:
    bot = payload.get("bot") if isinstance(payload.get("bot"), dict) else {}
    owner = bot.get("owner") if isinstance(bot.get("owner"), dict) else {}
    return NotionUserOut(
        id=_required_payload_text(payload.get("id"), "Notion user id"),
        object=_optional_text(payload.get("object")),
        type=_optional_text(payload.get("type")),
        name=_optional_text(payload.get("name")),
        avatar_url=_optional_text(payload.get("avatar_url")),
        workspace_name=_optional_text(bot.get("workspace_name")),
        workspace_id=_optional_text(bot.get("workspace_id")),
        owner_type=_optional_text(owner.get("type")),
    )


def _notion_search_result_from_payload(payload: dict[str, Any]) -> NotionSearchResultSummaryOut:
    parent = payload.get("parent") if isinstance(payload.get("parent"), dict) else {}
    return NotionSearchResultSummaryOut(
        object=_optional_text(payload.get("object")) or "unknown",
        id=_required_payload_text(payload.get("id"), "Notion search result id"),
        title=_notion_title_from_payload(payload),
        url=_optional_text(payload.get("url")),
        created_time=_optional_text(payload.get("created_time")),
        last_edited_time=_optional_text(payload.get("last_edited_time")),
        parent_type=_optional_text(parent.get("type")),
    )


def _notion_title_from_payload(payload: dict[str, Any]) -> str | None:
    for value in _walk_payload(payload.get("properties")):
        if not isinstance(value, dict):
            continue
        title_items = value.get("title")
        if not isinstance(title_items, list):
            continue
        title = "".join(
            _optional_text(item.get("plain_text")) or ""
            for item in title_items
            if isinstance(item, dict)
        ).strip()
        if title:
            return title
    return _optional_text(payload.get("title"))


def _walk_payload(value: object) -> list[object]:
    if isinstance(value, dict):
        nested: list[object] = [value]
        for item in value.values():
            nested.extend(_walk_payload(item))
        return nested
    if isinstance(value, list):
        nested = []
        for item in value:
            nested.extend(_walk_payload(item))
        return nested
    return []


def _required_payload_text(value: object, label: str) -> str:
    text = _optional_text(value)
    if text is None:
        raise NotionIntegrationError(502, f"{label} was missing from the Notion response.")
    return text


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
