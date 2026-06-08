from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any

import httpx

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.schemas.integration import (
    LinearClientIssuesOut,
    LinearConnectionTestOut,
    LinearIssueSummaryOut,
    LinearRuntimeSettingsOut,
)

logger = get_logger(__name__)

LINEAR_DEFAULT_GRAPHQL_URL = "https://api.linear.app/graphql"
LINEAR_REQUIRED_CAPABILITIES = ("Linear issue read access",)

LINEAR_CLIENT_ISSUES_QUERY = """
query NexusLinearClientIssues($query: String!, $first: Int!) {
  issues(
    first: $first
    filter: {
      or: [
        { title: { containsIgnoreCase: $query } }
        { description: { containsIgnoreCase: $query } }
      ]
    }
  ) {
    nodes {
      id
      identifier
      title
      url
      description
      priority
      priorityLabel
      createdAt
      updatedAt
      dueDate
      assignee {
        name
        email
      }
      team {
        key
        name
      }
      state {
        name
        type
      }
      project {
        name
        url
      }
      labels {
        nodes {
          name
        }
      }
    }
  }
}
"""

LINEAR_CONNECTION_TEST_QUERY = """
query NexusLinearConnectionTest($first: Int!) {
  issues(first: $first) {
    nodes {
      id
      identifier
      title
      url
      description
      priority
      priorityLabel
      createdAt
      updatedAt
      dueDate
      assignee {
        name
        email
      }
      team {
        key
        name
      }
      state {
        name
        type
      }
      project {
        name
        url
      }
      labels {
        nodes {
          name
        }
      }
    }
  }
}
"""


class LinearIntegrationError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class LinearConfig:
    enabled: bool
    api_key: str
    access_token: str
    graphql_url: str
    timeout_seconds: int
    issue_limit: int


class LinearClient:
    def __init__(self, config: LinearConfig) -> None:
        self.config = config

    def search_client_issues(self, *, client_name: str, limit: int) -> dict[str, Any]:
        return self._graphql(
            LINEAR_CLIENT_ISSUES_QUERY,
            {
                "query": client_name,
                "first": limit,
            },
        )

    def list_recent_issues(self, *, limit: int) -> dict[str, Any]:
        return self._graphql(LINEAR_CONNECTION_TEST_QUERY, {"first": limit})

    def _graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        headers = {
            "Authorization": _linear_authorization_header(self.config),
            "Content-Type": "application/json",
        }
        payload = {"query": query, "variables": variables}
        started_at = perf_counter()
        try:
            with httpx.Client(timeout=self.config.timeout_seconds) as client:
                response = client.post(self.config.graphql_url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            log_outbound_request(
                logger,
                provider="linear-api",
                method="POST",
                url=self.config.graphql_url,
                status_code=getattr(getattr(exc, "response", None), "status_code", None),
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc,
            )
            raise LinearIntegrationError(502, "Linear request failed.") from exc

        log_outbound_request(
            logger,
            provider="linear-api",
            method="POST",
            url=self.config.graphql_url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=None if response.status_code < 400 else response.text,
        )

        if response.status_code >= 400:
            raise _linear_response_error(response)

        try:
            response_payload = response.json()
        except ValueError as exc:
            raise LinearIntegrationError(502, "Linear returned invalid JSON.") from exc
        if not isinstance(response_payload, dict):
            raise LinearIntegrationError(502, "Linear returned an unexpected response.")
        errors = response_payload.get("errors")
        if isinstance(errors, list) and errors:
            raise LinearIntegrationError(502, "Linear returned a GraphQL error.")
        return response_payload


def build_linear_runtime_settings() -> LinearRuntimeSettingsOut:
    config = _linear_config()
    configured = config.enabled and bool(config.api_key or config.access_token)
    auth_status = "configured" if configured else "partial" if config.enabled else "none"
    missing_configuration: list[str] = []
    if not config.enabled:
        missing_configuration.append("LINEAR_ENABLED")
    if not config.api_key and not config.access_token:
        missing_configuration.append("LINEAR_API_KEY or LINEAR_ACCESS_TOKEN")
    return LinearRuntimeSettingsOut(
        enabled=config.enabled,
        configured=configured,
        auth_status=auth_status,
        graphql_url=config.graphql_url,
        issue_limit=config.issue_limit,
        required_capabilities=list(LINEAR_REQUIRED_CAPABILITIES),
        missing_configuration=missing_configuration,
    )


def run_linear_connection_test(*, client: LinearClient | None = None) -> LinearConnectionTestOut:
    config = _require_linear_configured()
    linear_client = client or LinearClient(config)
    payload = linear_client.list_recent_issues(limit=config.issue_limit)
    issues = _linear_issues_from_payload(payload)
    warnings: list[str] = []
    if not issues:
        warnings.append("Linear connected successfully but returned no visible issues.")
    return LinearConnectionTestOut(
        issue_count=len(issues),
        returned_issue_count=len(issues[: config.issue_limit]),
        issues=issues[: config.issue_limit],
        required_capabilities=list(LINEAR_REQUIRED_CAPABILITIES),
        warnings=warnings,
    )


def build_linear_client_issues(
    *,
    client_name: str,
    client: LinearClient | None = None,
) -> LinearClientIssuesOut:
    config = _require_linear_configured()
    normalized_client_name = _required_text(client_name)
    linear_client = client or LinearClient(config)
    payload = linear_client.search_client_issues(client_name=normalized_client_name, limit=config.issue_limit)
    issues = _linear_issues_from_payload(payload)
    returned_issues = issues[: config.issue_limit]
    warnings: list[str] = []
    if not issues:
        warnings.append(f"No Linear issues matched '{normalized_client_name}'.")
    if len(issues) > len(returned_issues):
        warnings.append("More matching Linear issues are available than this client view returned.")
    return LinearClientIssuesOut(
        client_name=normalized_client_name,
        query=normalized_client_name,
        matched=bool(issues),
        issue_count=len(issues),
        returned_issue_count=len(returned_issues),
        issues=returned_issues,
        required_capabilities=list(LINEAR_REQUIRED_CAPABILITIES),
        warnings=warnings,
    )


def _linear_config() -> LinearConfig:
    graphql_url = settings.LINEAR_GRAPHQL_URL.strip() or LINEAR_DEFAULT_GRAPHQL_URL
    return LinearConfig(
        enabled=settings.LINEAR_ENABLED,
        api_key=settings.LINEAR_API_KEY.strip(),
        access_token=settings.LINEAR_ACCESS_TOKEN.strip(),
        graphql_url=graphql_url,
        timeout_seconds=settings.LINEAR_TIMEOUT_SECONDS,
        issue_limit=settings.LINEAR_ISSUE_LIMIT,
    )


def _require_linear_configured() -> LinearConfig:
    config = _linear_config()
    if not config.enabled:
        raise LinearIntegrationError(503, "Linear integration is disabled on this API.")
    if not config.api_key and not config.access_token:
        raise LinearIntegrationError(
            503,
            "Linear integration needs LINEAR_API_KEY or LINEAR_ACCESS_TOKEN before it can connect.",
        )
    return config


def _linear_authorization_header(config: LinearConfig) -> str:
    if config.access_token:
        return f"Bearer {config.access_token}"
    return config.api_key


def _linear_response_error(response: httpx.Response) -> LinearIntegrationError:
    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", "").strip()
        suffix = f" Retry after {retry_after}." if retry_after else ""
        return LinearIntegrationError(429, f"Linear rate limited the request.{suffix}")
    if response.status_code in {401, 403}:
        return LinearIntegrationError(
            502,
            "Linear rejected the configured credential. Confirm the API key or OAuth token has issue read access.",
        )
    return LinearIntegrationError(502, f"Linear request failed with HTTP {response.status_code}.")


def _linear_issues_from_payload(payload: dict[str, Any]) -> list[LinearIssueSummaryOut]:
    data = payload.get("data")
    if not isinstance(data, dict):
        raise LinearIntegrationError(502, "Linear response was missing data.")
    issues = data.get("issues")
    if not isinstance(issues, dict):
        raise LinearIntegrationError(502, "Linear response was missing issues.")
    nodes = issues.get("nodes")
    if not isinstance(nodes, list):
        raise LinearIntegrationError(502, "Linear issues response was missing nodes.")
    return [_linear_issue_from_payload(node) for node in nodes if isinstance(node, dict)]


def _linear_issue_from_payload(payload: dict[str, Any]) -> LinearIssueSummaryOut:
    assignee = payload.get("assignee") if isinstance(payload.get("assignee"), dict) else {}
    team = payload.get("team") if isinstance(payload.get("team"), dict) else {}
    state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
    project = payload.get("project") if isinstance(payload.get("project"), dict) else {}
    labels = payload.get("labels") if isinstance(payload.get("labels"), dict) else {}
    label_nodes = labels.get("nodes") if isinstance(labels.get("nodes"), list) else []
    return LinearIssueSummaryOut(
        id=_required_payload_text(payload.get("id"), "Linear issue id"),
        identifier=_required_payload_text(payload.get("identifier"), "Linear issue identifier"),
        title=_required_payload_text(payload.get("title"), "Linear issue title"),
        url=_optional_text(payload.get("url")),
        description=_optional_text(payload.get("description")),
        priority=_optional_int(payload.get("priority")),
        priority_label=_optional_text(payload.get("priorityLabel")),
        state_name=_optional_text(state.get("name")),
        state_type=_optional_text(state.get("type")),
        team_key=_optional_text(team.get("key")),
        team_name=_optional_text(team.get("name")),
        assignee_name=_optional_text(assignee.get("name")),
        assignee_email=_optional_text(assignee.get("email")),
        project_name=_optional_text(project.get("name")),
        project_url=_optional_text(project.get("url")),
        label_names=[
            label_name
            for label in label_nodes
            if isinstance(label, dict)
            for label_name in [_optional_text(label.get("name"))]
            if label_name is not None
        ],
        created_at=_optional_text(payload.get("createdAt")),
        updated_at=_optional_text(payload.get("updatedAt")),
        due_date=_optional_text(payload.get("dueDate")),
    )


def _required_text(value: object) -> str:
    text = _optional_text(value)
    if text is None:
        raise LinearIntegrationError(422, "Client name is required.")
    return text


def _required_payload_text(value: object, label: str) -> str:
    text = _optional_text(value)
    if text is None:
        raise LinearIntegrationError(502, f"{label} was missing from the Linear response.")
    return text


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _optional_int(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
