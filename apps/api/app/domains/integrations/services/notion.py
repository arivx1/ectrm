from __future__ import annotations

import re
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Literal

import httpx

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.schemas.integration import (
    NotionClientPageOut,
    NotionClientPagesOut,
    NotionConnectionTestOut,
    NotionRuntimeSettingsOut,
    NotionSearchResultSummaryOut,
    NotionUserOut,
)

logger = get_logger(__name__)

NOTION_DEFAULT_BASE_URL = "https://api.notion.com/v1"
NOTION_DEFAULT_VERSION = "2026-03-11"
NOTION_REQUIRED_CAPABILITIES = ("Notion API read/search access",)
NOTION_RELEVANCE_STOPWORDS = frozenset({"and", "the", "of", "for", "to", "a", "an"})


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
    client_page_confidence_threshold: float


class NotionClient:
    def __init__(self, config: NotionConfig) -> None:
        self.config = config

    def get_current_user(self) -> NotionUserOut:
        payload = self._get("/users/me")
        return _notion_user_from_payload(payload)

    def search(
        self,
        *,
        limit: int,
        query: str | None = None,
        object_filter: Literal["page", "database", "data_source"] | None = None,
    ) -> dict[str, Any]:
        request_payload: dict[str, Any] = {"page_size": limit}
        if query:
            request_payload["query"] = query
        if object_filter:
            request_payload["filter"] = {"property": "object", "value": object_filter}
        payload = self._post("/search", request_payload)
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
        client_page_confidence_threshold=config.client_page_confidence_threshold,
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


def build_notion_client_pages(
    *,
    client_name: str,
    client: NotionClient | None = None,
) -> NotionClientPagesOut:
    config = _require_notion_configured()
    normalized_client_name = _required_text(client_name)
    notion_client = client or NotionClient(config)
    search_payload = notion_client.search(
        limit=config.search_limit,
        query=normalized_client_name,
        object_filter="page",
    )
    result_payloads = search_payload.get("results")
    candidate_pages = [
        page
        for item in result_payloads
        if isinstance(item, dict)
        for page in [_notion_client_page_from_payload(item, client_name=normalized_client_name)]
        if page is not None
    ] if isinstance(result_payloads, list) else []
    pages = [
        page
        for page in candidate_pages
        if page.relevance_confidence >= config.client_page_confidence_threshold
    ]
    pages.sort(key=lambda page: (-page.relevance_confidence, page.title or "", page.page_id))
    has_more = bool(search_payload.get("has_more"))
    warnings: list[str] = []
    if not candidate_pages:
        accessible_page_count = _probe_accessible_page_count(notion_client)
        if accessible_page_count == 0:
            warnings.append(
                "Notion connected, but returned no pages shared with this connection. "
                "In Notion, add the configured connection to the relevant client pages or their parent page."
            )
        elif accessible_page_count is None:
            warnings.append("No shared Notion pages matched this client.")
        else:
            warnings.append(
                f"No shared Notion page titles matched '{normalized_client_name}'. "
                "Notion API search matches page titles, not page body text."
            )
    elif not pages:
        warnings.append(
            f"Notion returned {len(candidate_pages)} page title result"
            f"{'' if len(candidate_pages) == 1 else 's'}, but none met the "
            f"{config.client_page_confidence_threshold:.0%} relevance confidence threshold."
        )
    if has_more:
        warnings.append("More Notion results are available than this client view returned.")
    return NotionClientPagesOut(
        client_name=normalized_client_name,
        query=normalized_client_name,
        matched=bool(pages),
        confidence_threshold=config.client_page_confidence_threshold,
        candidate_page_count=len(candidate_pages),
        rejected_page_count=len(candidate_pages) - len(pages),
        returned_page_count=len(pages),
        has_more=has_more,
        pages=pages,
        required_capabilities=list(NOTION_REQUIRED_CAPABILITIES),
        warnings=warnings,
    )


def _probe_accessible_page_count(client: NotionClient) -> int | None:
    try:
        search_payload = client.search(limit=1, object_filter="page")
    except NotionIntegrationError:
        return None
    result_payloads = search_payload.get("results")
    if not isinstance(result_payloads, list):
        return None
    if result_payloads:
        return len(result_payloads)
    return 1 if bool(search_payload.get("has_more")) else 0


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
        client_page_confidence_threshold=settings.NOTION_CLIENT_PAGE_CONFIDENCE_THRESHOLD,
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


def _notion_client_page_from_payload(
    payload: dict[str, Any],
    *,
    client_name: str | None = None,
) -> NotionClientPageOut | None:
    summary = _notion_search_result_from_payload(payload)
    if summary.object.casefold() != "page":
        return None
    relevance_confidence, relevance_basis = _score_notion_page_relevance(
        client_name=client_name,
        title=summary.title,
        url=summary.url,
    )
    return NotionClientPageOut(
        page_id=summary.id,
        title=summary.title,
        url=summary.url,
        created_time=summary.created_time,
        last_edited_time=summary.last_edited_time,
        parent_type=summary.parent_type,
        relevance_confidence=relevance_confidence,
        relevance_basis=relevance_basis,
    )


def _score_notion_page_relevance(
    *,
    client_name: str | None,
    title: str | None,
    url: str | None,
) -> tuple[float, list[str]]:
    client_tokens = _notion_relevance_tokens(client_name)
    if not client_tokens:
        return 0, []

    title_text = _normalized_relevance_text(title)
    title_tokens = _notion_relevance_tokens(title)
    url_tokens = _notion_relevance_tokens(url)
    client_phrase = " ".join(client_tokens)
    acronym = "".join(token[0] for token in client_tokens if token)
    score = 0.35
    basis = ["returned by Notion title search for client name"]

    if title_text == client_phrase:
        score = 0.99
        basis = ["page title exactly matches client name"]
    elif title_text.startswith(f"{client_phrase} "):
        score = 0.96
        basis = ["page title starts with client name"]
    elif client_phrase in title_text:
        score = 0.92
        basis = ["page title contains client name"]
    elif title_tokens and set(client_tokens).issubset(set(title_tokens)):
        score = 0.84
        basis = ["page title contains all client name tokens"]
    elif len(acronym) > 1 and acronym in set(title_tokens):
        score = 0.76
        basis = ["page title contains client initials"]
    else:
        matched_title_tokens = set(client_tokens).intersection(title_tokens)
        title_ratio = len(matched_title_tokens) / len(set(client_tokens))
        if title_ratio >= 0.67:
            score = 0.7
            basis = ["page title contains most client name tokens"]
        elif matched_title_tokens:
            score = 0.62
            basis = ["page title contains part of client name"]

    if url_tokens:
        matched_url_tokens = set(client_tokens).intersection(url_tokens)
        if set(client_tokens).issubset(set(url_tokens)) and score < 0.78:
            score = 0.78
            basis = ["page URL contains all client name tokens"]
        elif matched_url_tokens and score < 0.58:
            score = 0.58
            basis = ["page URL contains part of client name"]

    return round(score, 2), basis


def _normalized_relevance_text(value: str | None) -> str:
    return " ".join(_notion_relevance_tokens(value))


def _notion_relevance_tokens(value: str | None) -> list[str]:
    if not value:
        return []
    return [
        token
        for token in re.findall(r"[a-z0-9]+", value.casefold())
        if token and token not in NOTION_RELEVANCE_STOPWORDS
    ]


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


def _required_text(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise NotionIntegrationError(422, "client_name must not be blank.")
    return normalized


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
