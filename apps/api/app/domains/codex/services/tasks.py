from __future__ import annotations

import hmac
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.models.codex_task_request import CodexTaskRequest
from apps.api.app.schemas.codex import CodexTaskCallback, CodexTaskCreate, CodexTaskOut, CodexTaskSettingsOut

CODEX_PROVIDER = "github_actions"
GITHUB_API_BASE_URL = "https://api.github.com"
SINGLE_TASK_MODE = "SINGLE_TASK"
LONG_RUNNING_MODE = "LONG_RUNNING"
DEFAULT_CONTINUATION_PROMPT = "What is the next recommended task?"
DEFAULT_LONG_RUNNING_STOP_CONDITIONS = (
    "Codex cannot identify a concrete next task that fits the original request.",
    "The configured maximum iteration count has been reached.",
    "The next task would require production data changes, external commitments, or business-domain authority.",
    "Verification fails in a way that needs human review before more work is attempted.",
)


class CodexTaskDispatchError(Exception):
    def __init__(self, detail: str, provider_response: dict[str, object] | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        self.provider_response = provider_response


class CodexTaskCallbackError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class CodexTaskRuntimeSettings:
    enabled: bool
    configured: bool
    repository: str | None
    workflow_id: str | None
    callback_base_url: str | None
    default_ref: str
    prompt_input_name: str
    long_running_default_max_iterations: int
    long_running_max_iterations: int
    missing_configuration: tuple[str, ...]


def build_codex_task_settings() -> CodexTaskSettingsOut:
    runtime = _runtime_settings()
    return CodexTaskSettingsOut(
        enabled=runtime.enabled,
        configured=runtime.configured,
        provider=CODEX_PROVIDER,
        repository=runtime.repository,
        workflow_id=runtime.workflow_id,
        default_ref=runtime.default_ref,
        prompt_input_name=runtime.prompt_input_name,
        long_running_default_max_iterations=runtime.long_running_default_max_iterations,
        long_running_max_iterations=runtime.long_running_max_iterations,
        long_running_default_continuation_prompt=DEFAULT_CONTINUATION_PROMPT,
        missing_configuration=list(runtime.missing_configuration),
    )


def list_codex_tasks(db: Session, *, limit: int, offset: int) -> list[CodexTaskRequest]:
    stmt = (
        select(CodexTaskRequest)
        .order_by(CodexTaskRequest.created_at.desc(), CodexTaskRequest.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.execute(stmt).scalars().all())


async def create_codex_task(
    *,
    db: Session,
    payload: CodexTaskCreate,
    requested_by: str,
    requester_role: str | None,
) -> CodexTaskRequest:
    runtime = _runtime_settings()
    if not runtime.enabled:
        raise CodexTaskDispatchError("Codex task dispatch is disabled.")
    if not runtime.configured:
        missing = ", ".join(runtime.missing_configuration)
        raise CodexTaskDispatchError(f"Codex task dispatch is missing configuration: {missing}.")

    run_mode = payload.run_mode
    max_iterations = _normalize_max_iterations(payload, runtime=runtime)
    continuation_prompt = _normalize_continuation_prompt(payload)
    stop_conditions = list(DEFAULT_LONG_RUNNING_STOP_CONDITIONS) if run_mode == LONG_RUNNING_MODE else []

    now = datetime.now(timezone.utc)
    record = CodexTaskRequest(
        status="QUEUED",
        provider=CODEX_PROVIDER,
        title=payload.title,
        prompt=payload.prompt,
        run_mode=run_mode,
        max_iterations=max_iterations,
        continuation_prompt=continuation_prompt,
        stop_conditions=stop_conditions,
        target_ref=payload.target_ref or runtime.default_ref,
        repository=runtime.repository,
        workflow_id=runtime.workflow_id,
        dispatch_url=_build_workflow_dispatch_url(runtime.repository or "", runtime.workflow_id or ""),
        callback_url=None,
        external_url=_build_workflow_browser_url(runtime.repository or "", runtime.workflow_id or ""),
        provider_response=None,
        error_detail=None,
        requested_by=requested_by,
        requester_role=requester_role,
        created_at=now,
        updated_at=now,
    )
    db.add(record)
    db.flush()
    record.callback_url = _build_callback_url(runtime.callback_base_url or "", record.id)
    db.commit()
    db.refresh(record)

    try:
        provider_response = await _dispatch_github_workflow(record, runtime=runtime)
    except CodexTaskDispatchError as exc:
        record.status = "FAILED"
        record.error_detail = exc.detail
        record.provider_response = exc.provider_response
        record.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(record)
        return record

    record.status = "DISPATCHED"
    record.provider_response = provider_response
    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    return record


def to_codex_task_out(record: CodexTaskRequest) -> CodexTaskOut:
    return CodexTaskOut(
        id=record.id,
        status=record.status,
        provider=record.provider,
        title=record.title,
        prompt=record.prompt,
        run_mode=record.run_mode,
        max_iterations=record.max_iterations,
        continuation_prompt=record.continuation_prompt,
        stop_conditions=list(record.stop_conditions or []),
        target_ref=record.target_ref,
        repository=record.repository,
        workflow_id=record.workflow_id,
        dispatch_url=record.dispatch_url,
        callback_url=record.callback_url,
        external_url=record.external_url,
        workflow_run_id=record.workflow_run_id,
        workflow_run_url=record.workflow_run_url,
        branch_name=record.branch_name,
        pull_request_url=record.pull_request_url,
        artifact_url=record.artifact_url,
        iteration_count=record.iteration_count or 0,
        iteration_summaries=list(record.iteration_summaries or []),
        result_summary=record.result_summary,
        stop_reason=record.stop_reason,
        provider_response=dict(record.provider_response) if isinstance(record.provider_response, dict) else None,
        error_detail=record.error_detail,
        requested_by=record.requested_by,
        requester_role=record.requester_role,
        started_at=record.started_at,
        completed_at=record.completed_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def update_codex_task_from_callback(
    db: Session,
    *,
    task_id: int,
    payload: CodexTaskCallback,
    callback_token: str | None,
) -> CodexTaskRequest:
    _verify_callback_token(callback_token)

    record = db.get(CodexTaskRequest, task_id)
    if record is None:
        raise CodexTaskCallbackError(404, "Codex task request was not found.")

    now = datetime.now(timezone.utc)
    record.status = payload.status
    record.workflow_run_id = payload.workflow_run_id or record.workflow_run_id
    record.workflow_run_url = payload.workflow_run_url or record.workflow_run_url
    record.branch_name = payload.branch_name or record.branch_name
    record.pull_request_url = payload.pull_request_url or record.pull_request_url
    record.artifact_url = payload.artifact_url or record.artifact_url
    record.iteration_count = payload.iteration_count if payload.iteration_count is not None else record.iteration_count
    record.iteration_summaries = payload.iteration_summaries or record.iteration_summaries
    record.result_summary = payload.result_summary or record.result_summary
    record.stop_reason = payload.stop_reason or record.stop_reason
    if payload.status == "FAILED":
        record.error_detail = payload.error_detail or payload.stop_reason or record.error_detail
    elif payload.error_detail:
        record.error_detail = payload.error_detail

    if payload.status == "RUNNING" and record.started_at is None:
        record.started_at = now
    if payload.status in {"COMPLETED", "STOPPED", "FAILED"}:
        if record.started_at is None:
            record.started_at = now
        record.completed_at = now
    record.updated_at = now

    db.commit()
    db.refresh(record)
    return record


def _runtime_settings() -> CodexTaskRuntimeSettings:
    repository = _optional_setting(settings.CODEX_GITHUB_REPOSITORY)
    workflow_id = _optional_setting(settings.CODEX_GITHUB_WORKFLOW_ID)
    token = _optional_setting(settings.CODEX_GITHUB_TOKEN)
    callback_base_url = _optional_setting(settings.CODEX_CALLBACK_BASE_URL)
    configured_callback_token = _optional_setting(settings.CODEX_CALLBACK_TOKEN)
    default_ref = _optional_setting(settings.CODEX_GITHUB_REF) or "main"
    prompt_input_name = _optional_setting(settings.CODEX_GITHUB_PROMPT_INPUT) or "prompt"
    long_running_max_iterations = max(2, int(settings.CODEX_LONG_RUNNING_MAX_ITERATIONS))
    long_running_default_max_iterations = min(
        max(2, int(settings.CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS)),
        long_running_max_iterations,
    )

    missing = []
    if not repository:
        missing.append("CODEX_GITHUB_REPOSITORY")
    if not workflow_id:
        missing.append("CODEX_GITHUB_WORKFLOW_ID")
    if not token:
        missing.append("CODEX_GITHUB_TOKEN")
    if not callback_base_url:
        missing.append("CODEX_CALLBACK_BASE_URL")
    if not configured_callback_token:
        missing.append("CODEX_CALLBACK_TOKEN")

    return CodexTaskRuntimeSettings(
        enabled=bool(settings.CODEX_TASKS_ENABLED),
        configured=not missing,
        repository=repository,
        workflow_id=workflow_id,
        callback_base_url=callback_base_url,
        default_ref=default_ref,
        prompt_input_name=prompt_input_name,
        long_running_default_max_iterations=long_running_default_max_iterations,
        long_running_max_iterations=long_running_max_iterations,
        missing_configuration=tuple(missing),
    )


def _verify_callback_token(callback_token: str | None) -> None:
    configured = _optional_setting(settings.CODEX_CALLBACK_TOKEN)
    if configured is None:
        raise CodexTaskCallbackError(503, "Codex task callbacks are not configured.")

    candidate = _optional_setting(callback_token)
    if candidate and candidate.lower().startswith("bearer "):
        candidate = candidate[7:].strip()
    if candidate is None or not hmac.compare_digest(candidate, configured):
        raise CodexTaskCallbackError(403, "Invalid Codex callback token.")


def _normalize_max_iterations(payload: CodexTaskCreate, *, runtime: CodexTaskRuntimeSettings) -> int:
    if payload.run_mode == SINGLE_TASK_MODE:
        return 1
    if payload.max_iterations < 2:
        raise CodexTaskDispatchError("Long-running Codex tasks require at least 2 iterations.")
    if payload.max_iterations > runtime.long_running_max_iterations:
        raise CodexTaskDispatchError(
            "Long-running Codex tasks cannot exceed the configured limit of "
            f"{runtime.long_running_max_iterations} iterations."
        )
    return payload.max_iterations


def _normalize_continuation_prompt(payload: CodexTaskCreate) -> str | None:
    if payload.run_mode == SINGLE_TASK_MODE:
        return None
    return payload.continuation_prompt or DEFAULT_CONTINUATION_PROMPT


def _optional_setting(value: str | None) -> str | None:
    normalized = (value or "").strip()
    return normalized or None


def _build_workflow_dispatch_url(repository: str, workflow_id: str) -> str:
    return (
        f"{GITHUB_API_BASE_URL}/repos/{repository}/actions/workflows/"
        f"{quote(workflow_id, safe='')}/dispatches"
    )


def _build_workflow_browser_url(repository: str, workflow_id: str) -> str:
    return f"https://github.com/{repository}/actions/workflows/{quote(workflow_id, safe='')}"


def _build_callback_url(callback_base_url: str, task_id: int) -> str:
    return f"{callback_base_url.rstrip('/')}/codex/tasks/{task_id}/callback"


def _render_codex_prompt(record: CodexTaskRequest) -> str:
    lines = [
        record.prompt,
        "",
        "ECTRM Codex task metadata:",
        f"- task_id: {record.id}",
        f"- title: {record.title}",
        f"- requested_by: {record.requested_by}",
        f"- requester_role: {record.requester_role or 'unknown'}",
        f"- target_ref: {record.target_ref}",
        f"- run_mode: {record.run_mode}",
        f"- max_iterations: {record.max_iterations}",
        "",
        "Follow the repository AGENTS.md instructions. Keep changes reviewable and open a PR rather than mutating production data.",
    ]

    if record.run_mode == LONG_RUNNING_MODE:
        stop_conditions = list(record.stop_conditions or DEFAULT_LONG_RUNNING_STOP_CONDITIONS)
        lines.extend(
            [
                "",
                "Long-running Codex loop contract:",
                "- Treat the original prompt as iteration 1.",
                "- Complete one coherent repository task per iteration, then run the narrowest useful verification.",
                f"- After each completed iteration, ask: \"{record.continuation_prompt or DEFAULT_CONTINUATION_PROMPT}\"",
                "- Continue only when the next task is concrete, high-confidence, repository-local, and still aligned with the original request.",
                f"- Stop after a maximum of {record.max_iterations} iterations.",
                "- Stop when any of these conditions applies:",
                *[f"  - {condition}" for condition in stop_conditions],
                "- In the final response, include each iteration completed, verification run, the next-task decision, and the reason the loop stopped.",
            ]
        )
    else:
        lines.extend(
            [
                "",
                "Single-task contract:",
                "- Complete only the requested task.",
                "- You may recommend follow-up tasks, but do not execute them in this run.",
            ]
        )

    return "\n".join(lines)


async def _dispatch_github_workflow(
    record: CodexTaskRequest,
    *,
    runtime: CodexTaskRuntimeSettings,
) -> dict[str, object]:
    assert runtime.repository is not None
    assert runtime.workflow_id is not None

    payload = {
        "ref": record.target_ref,
        "inputs": {
            runtime.prompt_input_name: _render_codex_prompt(record),
            "task_id": str(record.id),
            "callback_url": record.callback_url or "",
            "run_mode": record.run_mode,
            "max_iterations": str(record.max_iterations),
        },
    }
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {settings.CODEX_GITHUB_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "ECTRM-Codex-Task-Dispatcher",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.CODEX_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                _build_workflow_dispatch_url(runtime.repository, runtime.workflow_id),
                headers=headers,
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise CodexTaskDispatchError(f"GitHub workflow dispatch failed: {exc}") from exc

    provider_response: dict[str, object] = {
        "status_code": response.status_code,
        "workflow_id": runtime.workflow_id,
        "repository": runtime.repository,
        "ref": record.target_ref,
        "run_mode": record.run_mode,
        "max_iterations": record.max_iterations,
        "callback_url": record.callback_url,
    }
    if response.status_code == 204:
        return provider_response

    detail = _extract_github_error_detail(response)
    provider_response["error"] = detail
    raise CodexTaskDispatchError(detail, provider_response=provider_response)


def _extract_github_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        payload = {}

    if isinstance(payload, dict):
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return f"GitHub workflow dispatch failed with status {response.status_code}: {message.strip()}"

    text = response.text.strip()
    if text:
        return f"GitHub workflow dispatch failed with status {response.status_code}: {text[:500]}"
    return f"GitHub workflow dispatch failed with status {response.status_code}."
