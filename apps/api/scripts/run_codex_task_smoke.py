from __future__ import annotations

import argparse
import enum
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

if not hasattr(enum, "StrEnum"):

    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from apps.api.app.config import settings
from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.codex_task_request import CodexTaskRequest
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession

REPO_ROOT = Path(__file__).resolve().parents[3]
CODEX_WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "codex.yml"
REQUIRED_API_ENV = (
    "CODEX_TASKS_ENABLED",
    "CODEX_CALLBACK_BASE_URL",
    "CODEX_CALLBACK_TOKEN",
    "CODEX_GITHUB_REPOSITORY",
    "CODEX_GITHUB_WORKFLOW_ID",
    "CODEX_GITHUB_TOKEN",
)
REQUIRED_GITHUB_SECRETS = ("OPENAI_API_KEY", "ECTRM_CODEX_CALLBACK_TOKEN")


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=REPO_ROOT,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def _print_check(name: str, ok: bool, detail: str) -> None:
    marker = "OK" if ok else "MISSING"
    print(f"[{marker}] {name}: {detail}")


def check_local_workflow() -> bool:
    if not CODEX_WORKFLOW_PATH.exists():
        _print_check("workflow file", False, f"{CODEX_WORKFLOW_PATH} does not exist")
        return False

    contents = CODEX_WORKFLOW_PATH.read_text(encoding="utf-8")
    required_fragments = (
        "workflow_dispatch:",
        "prompt:",
        "callback_url:",
        "codex exec --full-auto",
        "ECTRM_CODEX_CALLBACK_TOKEN",
    )
    missing = [fragment for fragment in required_fragments if fragment not in contents]
    if missing:
        _print_check("workflow file", False, f"missing expected fragments: {', '.join(missing)}")
        return False

    _print_check("workflow file", True, str(CODEX_WORKFLOW_PATH))
    return True


def check_live_readiness(repository: str) -> bool:
    ready = True

    for key in REQUIRED_API_ENV:
        ok = bool(os.environ.get(key))
        ready = ready and ok
        _print_check(f"env {key}", ok, "set" if ok else "not set")

    auth = _run(["gh", "auth", "status"])
    gh_ready = auth.returncode == 0
    ready = ready and gh_ready
    _print_check("gh auth", gh_ready, "authenticated" if gh_ready else "not authenticated")

    workflow = _run(["gh", "workflow", "list", "--repo", repository])
    workflow_registered = "Codex Task" in workflow.stdout
    ready = ready and workflow_registered
    _print_check(
        "remote workflow",
        workflow_registered,
        "registered on GitHub" if workflow_registered else "Codex Task is not registered on GitHub",
    )

    secrets = _run(["gh", "secret", "list", "--repo", repository, "--json", "name", "--jq", ".[].name"])
    secret_names = set(secrets.stdout.splitlines()) if secrets.returncode == 0 else set()
    for key in REQUIRED_GITHUB_SECRETS:
        ok = key in secret_names
        ready = ready and ok
        _print_check(f"GitHub secret {key}", ok, "present" if ok else "missing")

    return ready


def _configure_smoke_settings() -> dict[str, Any]:
    previous = {
        "CODEX_TASKS_ENABLED": settings.CODEX_TASKS_ENABLED,
        "CODEX_GITHUB_REPOSITORY": settings.CODEX_GITHUB_REPOSITORY,
        "CODEX_GITHUB_WORKFLOW_ID": settings.CODEX_GITHUB_WORKFLOW_ID,
        "CODEX_GITHUB_REF": settings.CODEX_GITHUB_REF,
        "CODEX_GITHUB_PROMPT_INPUT": settings.CODEX_GITHUB_PROMPT_INPUT,
        "CODEX_GITHUB_TOKEN": settings.CODEX_GITHUB_TOKEN,
        "CODEX_CALLBACK_BASE_URL": settings.CODEX_CALLBACK_BASE_URL,
        "CODEX_CALLBACK_TOKEN": settings.CODEX_CALLBACK_TOKEN,
        "CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS": settings.CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS,
        "CODEX_LONG_RUNNING_MAX_ITERATIONS": settings.CODEX_LONG_RUNNING_MAX_ITERATIONS,
    }
    settings.CODEX_TASKS_ENABLED = True
    settings.CODEX_GITHUB_REPOSITORY = "acme/ectrm"
    settings.CODEX_GITHUB_WORKFLOW_ID = "codex.yml"
    settings.CODEX_GITHUB_REF = "main"
    settings.CODEX_GITHUB_PROMPT_INPUT = "prompt"
    settings.CODEX_GITHUB_TOKEN = "github-smoke-token"
    settings.CODEX_CALLBACK_BASE_URL = "https://ectrm.example.test"
    settings.CODEX_CALLBACK_TOKEN = "codex-callback-smoke-token"
    settings.CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS = 2
    settings.CODEX_LONG_RUNNING_MAX_ITERATIONS = 3
    return previous


def _restore_settings(previous: dict[str, Any]) -> None:
    for key, value in previous.items():
        setattr(settings, key, value)


def run_local_callback_smoke() -> bool:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    original_session_factory = app.state.session_factory
    app.state.session_factory = session_factory
    previous_settings = _configure_smoke_settings()

    def _get_smoke_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_smoke_db

    try:
        with session_factory() as session:
            now = datetime.now(timezone.utc)
            user = UserAccount(
                user_id="codex_smoke_admin",
                email="codex-smoke-admin@example.invalid",
                display_name="Codex Smoke Admin",
                role="OPS_ADMIN",
                password_hash=hash_password("supersecret1"),
                is_active=True,
                last_login_at=now,
                created_at=now,
                created_by="codex-smoke",
                updated_at=now,
                updated_by="codex-smoke",
                version=1,
            )
            session.add(user)
            session.commit()
            _, access_token = create_user_session(session, user)

        async def fake_dispatch(record: CodexTaskRequest, *, runtime):
            return {
                "status_code": 204,
                "repository": runtime.repository,
                "workflow_id": runtime.workflow_id,
                "ref": record.target_ref,
                "run_mode": record.run_mode,
                "max_iterations": record.max_iterations,
                "callback_url": record.callback_url,
            }

        client = TestClient(app)
        with patch(
            "apps.api.app.domains.codex.services.tasks._dispatch_github_workflow",
            side_effect=fake_dispatch,
        ):
            create_response = client.post(
                "/admin/codex/tasks",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "title": "Codex smoke task",
                    "prompt": "Exercise Codex task callback plumbing.",
                    "run_mode": "LONG_RUNNING",
                    "max_iterations": 2,
                },
            )
        if create_response.status_code != 201:
            _print_check("local callback smoke", False, f"create returned {create_response.status_code}")
            return False

        task = create_response.json()
        task_id = task["id"]
        callback_url = task.get("callback_url") or ""
        if not callback_url.endswith(f"/codex/tasks/{task_id}/callback"):
            _print_check("local callback smoke", False, f"unexpected callback_url={callback_url!r}")
            return False

        running_response = client.post(
            f"/codex/tasks/{task_id}/callback",
            headers={"X-Codex-Callback-Token": "codex-callback-smoke-token"},
            json={
                "status": "RUNNING",
                "workflow_run_id": "12345",
                "workflow_run_url": "https://github.com/acme/ectrm/actions/runs/12345",
                "branch_name": "codex/task-smoke-12345",
            },
        )
        if running_response.status_code != 200 or running_response.json()["status"] != "RUNNING":
            _print_check("local callback smoke", False, f"running callback returned {running_response.status_code}")
            return False

        completed_response = client.post(
            f"/codex/tasks/{task_id}/callback",
            headers={"X-Codex-Callback-Token": "codex-callback-smoke-token"},
            json={
                "status": "COMPLETED",
                "workflow_run_id": "12345",
                "workflow_run_url": "https://github.com/acme/ectrm/actions/runs/12345",
                "pull_request_url": "https://github.com/acme/ectrm/pull/123",
                "artifact_url": "https://github.com/acme/ectrm/actions/runs/12345",
                "iteration_count": 2,
                "iteration_summaries": [
                    {"iteration": 1, "summary": "Smoke task started."},
                    {"iteration": 2, "summary": "Smoke task completed."},
                ],
                "result_summary": "Local Codex callback smoke completed.",
                "stop_reason": "No further smoke steps remained.",
            },
        )
        completed_payload = completed_response.json()
        if completed_response.status_code != 200 or completed_payload["status"] != "COMPLETED":
            _print_check("local callback smoke", False, f"terminal callback returned {completed_response.status_code}")
            return False
        if completed_payload["iteration_count"] != 2 or not completed_payload.get("completed_at"):
            _print_check("local callback smoke", False, "terminal metadata was not persisted")
            return False

        bad_token_response = client.post(
            f"/codex/tasks/{task_id}/callback",
            headers={"X-Codex-Callback-Token": "wrong-token"},
            json={"status": "RUNNING"},
        )
        if bad_token_response.status_code != 403:
            _print_check("local callback smoke", False, "bad callback token was not rejected")
            return False

        _print_check("local callback smoke", True, f"task {task_id} reached COMPLETED and rejected bad token")
        return True
    finally:
        app.state.session_factory = original_session_factory
        app.dependency_overrides.pop(get_db, None)
        _restore_settings(previous_settings)
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke-test Codex task dispatch and callback plumbing.")
    parser.add_argument(
        "--repository",
        default=os.environ.get("CODEX_GITHUB_REPOSITORY") or "arivx1/ectrm",
        help="GitHub repository to check for workflow/secrets readiness.",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="Only check workflow file and live-readiness prerequisites.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    local_workflow_ok = check_local_workflow()
    live_ready = check_live_readiness(args.repository)
    local_smoke_ok = True if args.preflight_only else run_local_callback_smoke()

    print()
    if live_ready:
        print("Live Codex smoke prerequisites are present. Dispatch a tiny admin Codex task to exercise GitHub Actions.")
    else:
        print("Live Codex smoke is not ready. Fill the missing items above before dispatching through GitHub Actions.")

    return 0 if local_workflow_ok and local_smoke_ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
