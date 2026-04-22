from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.domains.codex.services import tasks as codex_tasks_service
from apps.api.app.domains.codex.services.tasks import CodexTaskDispatchError
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.codex_task_request import CodexTaskRequest
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class CodexTasksApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

        cls.original_session_factory = app.state.session_factory
        app.state.session_factory = cls.SessionLocal

        def _get_test_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _get_test_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        app.state.session_factory = cls.original_session_factory
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        self._previous_settings = {
            "CODEX_TASKS_ENABLED": settings.CODEX_TASKS_ENABLED,
            "CODEX_GITHUB_REPOSITORY": settings.CODEX_GITHUB_REPOSITORY,
            "CODEX_GITHUB_WORKFLOW_ID": settings.CODEX_GITHUB_WORKFLOW_ID,
            "CODEX_GITHUB_REF": settings.CODEX_GITHUB_REF,
            "CODEX_GITHUB_PROMPT_INPUT": settings.CODEX_GITHUB_PROMPT_INPUT,
            "CODEX_GITHUB_TOKEN": settings.CODEX_GITHUB_TOKEN,
            "CODEX_REQUEST_TIMEOUT_SECONDS": settings.CODEX_REQUEST_TIMEOUT_SECONDS,
            "CODEX_CALLBACK_BASE_URL": settings.CODEX_CALLBACK_BASE_URL,
            "CODEX_CALLBACK_TOKEN": settings.CODEX_CALLBACK_TOKEN,
            "CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS": settings.CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS,
            "CODEX_LONG_RUNNING_MAX_ITERATIONS": settings.CODEX_LONG_RUNNING_MAX_ITERATIONS,
        }
        with self.SessionLocal() as session:
            session.query(CodexTaskRequest).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()

        settings.CODEX_TASKS_ENABLED = False
        settings.CODEX_GITHUB_REPOSITORY = ""
        settings.CODEX_GITHUB_WORKFLOW_ID = ""
        settings.CODEX_GITHUB_REF = "main"
        settings.CODEX_GITHUB_PROMPT_INPUT = "prompt"
        settings.CODEX_GITHUB_TOKEN = ""
        settings.CODEX_REQUEST_TIMEOUT_SECONDS = 20
        settings.CODEX_CALLBACK_BASE_URL = ""
        settings.CODEX_CALLBACK_TOKEN = ""
        settings.CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS = 5
        settings.CODEX_LONG_RUNNING_MAX_ITERATIONS = 10

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_settings_report_disabled_and_missing_configuration(self) -> None:
        token = self._create_session_token()

        response = self.client.get(
            "/admin/codex/settings",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["enabled"])
        self.assertFalse(payload["configured"])
        self.assertEqual(payload["provider"], "github_actions")
        self.assertEqual(payload["default_ref"], "main")
        self.assertEqual(payload["long_running_default_max_iterations"], 5)
        self.assertEqual(payload["long_running_max_iterations"], 10)
        self.assertEqual(payload["long_running_default_continuation_prompt"], "What is the next recommended task?")
        self.assertIn("CODEX_GITHUB_REPOSITORY", payload["missing_configuration"])
        self.assertIn("CODEX_GITHUB_WORKFLOW_ID", payload["missing_configuration"])
        self.assertIn("CODEX_GITHUB_TOKEN", payload["missing_configuration"])
        self.assertIn("CODEX_CALLBACK_BASE_URL", payload["missing_configuration"])
        self.assertIn("CODEX_CALLBACK_TOKEN", payload["missing_configuration"])

    def test_create_task_dispatches_configured_github_workflow(self) -> None:
        token = self._create_session_token()
        self._configure_codex_dispatch()

        async def fake_dispatch(record: CodexTaskRequest, *, runtime):
            self.assertEqual(record.status, "QUEUED")
            self.assertEqual(record.repository, "acme/ectrm")
            self.assertEqual(record.workflow_id, "codex.yml")
            self.assertEqual(record.run_mode, "SINGLE_TASK")
            self.assertEqual(record.max_iterations, 1)
            self.assertIsNone(record.continuation_prompt)
            self.assertEqual(record.callback_url, f"https://ectrm.example.test/codex/tasks/{record.id}/callback")
            self.assertGreater(record.id, 0)
            self.assertEqual(runtime.prompt_input_name, "prompt")
            return {
                "status_code": 204,
                "repository": runtime.repository,
                "workflow_id": runtime.workflow_id,
                "ref": record.target_ref,
                "callback_url": record.callback_url,
            }

        with patch(
            "apps.api.app.domains.codex.services.tasks._dispatch_github_workflow",
            side_effect=fake_dispatch,
        ):
            response = self.client.post(
                "/admin/codex/tasks",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "title": "Fix failing settlement test",
                    "prompt": "Inspect the settlement tests and propose a small fix.",
                    "target_ref": "main",
                },
            )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["status"], "DISPATCHED")
        self.assertEqual(payload["provider"], "github_actions")
        self.assertEqual(payload["repository"], "acme/ectrm")
        self.assertEqual(payload["workflow_id"], "codex.yml")
        self.assertEqual(payload["target_ref"], "main")
        self.assertEqual(payload["run_mode"], "SINGLE_TASK")
        self.assertEqual(payload["max_iterations"], 1)
        self.assertEqual(payload["callback_url"], f"https://ectrm.example.test/codex/tasks/{payload['id']}/callback")
        self.assertEqual(payload["requested_by"], "codex_admin")
        self.assertEqual(payload["provider_response"]["status_code"], 204)
        self.assertEqual(payload["provider_response"]["callback_url"], payload["callback_url"])
        self.assertIn("github.com/acme/ectrm/actions/workflows/codex.yml", payload["external_url"])

        list_response = self.client.get(
            "/admin/codex/tasks",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual([row["id"] for row in list_response.json()], [payload["id"]])

    def test_create_task_requires_enabled_integration(self) -> None:
        token = self._create_session_token()

        response = self.client.post(
            "/admin/codex/tasks",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Review the roadmap",
                "prompt": "Summarize the next implementation risk.",
            },
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "Codex task dispatch is disabled.")

    def test_dispatch_failure_is_persisted_for_audit(self) -> None:
        token = self._create_session_token()
        self._configure_codex_dispatch()

        async def failing_dispatch(record: CodexTaskRequest, *, runtime):
            raise CodexTaskDispatchError("GitHub workflow dispatch failed with status 422: Bad ref")

        with patch(
            "apps.api.app.domains.codex.services.tasks._dispatch_github_workflow",
            side_effect=failing_dispatch,
        ):
            response = self.client.post(
                "/admin/codex/tasks",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "title": "Bad ref task",
                    "prompt": "Run Codex against an intentionally bad ref.",
                    "target_ref": "missing-branch",
                },
            )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("Bad ref", payload["error_detail"])

        with self.SessionLocal() as session:
            records = session.query(CodexTaskRequest).all()
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].status, "FAILED")

    def test_create_long_running_task_includes_loop_contract(self) -> None:
        token = self._create_session_token()
        self._configure_codex_dispatch()
        rendered_prompts: list[str] = []

        async def fake_dispatch(record: CodexTaskRequest, *, runtime):
            rendered_prompts.append(codex_tasks_service._render_codex_prompt(record))
            return {
                "status_code": 204,
                "repository": runtime.repository,
                "workflow_id": runtime.workflow_id,
                "ref": record.target_ref,
                "run_mode": record.run_mode,
                "max_iterations": record.max_iterations,
            }

        with patch(
            "apps.api.app.domains.codex.services.tasks._dispatch_github_workflow",
            side_effect=fake_dispatch,
        ):
            response = self.client.post(
                "/admin/codex/tasks",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "title": "Improve assistant eval coverage",
                    "prompt": "Find and complete the next useful assistant eval improvement.",
                    "run_mode": "LONG_RUNNING",
                    "max_iterations": 4,
                    "continuation_prompt": "What is the next recommended task?",
                },
            )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["status"], "DISPATCHED")
        self.assertEqual(payload["run_mode"], "LONG_RUNNING")
        self.assertEqual(payload["max_iterations"], 4)
        self.assertEqual(payload["continuation_prompt"], "What is the next recommended task?")
        self.assertIn("Codex cannot identify a concrete next task", payload["stop_conditions"][0])
        self.assertEqual(len(rendered_prompts), 1)
        self.assertIn("Long-running Codex loop contract", rendered_prompts[0])
        self.assertIn('ask: "What is the next recommended task?"', rendered_prompts[0])
        self.assertIn("Stop after a maximum of 4 iterations.", rendered_prompts[0])

    def test_long_running_task_respects_configured_iteration_limit(self) -> None:
        token = self._create_session_token()
        self._configure_codex_dispatch()
        settings.CODEX_LONG_RUNNING_MAX_ITERATIONS = 3

        response = self.client.post(
            "/admin/codex/tasks",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Too much autonomy",
                "prompt": "Keep going for a long time.",
                "run_mode": "LONG_RUNNING",
                "max_iterations": 4,
            },
        )

        self.assertEqual(response.status_code, 409)
        self.assertIn("cannot exceed the configured limit of 3 iterations", response.json()["detail"])

    def test_callback_updates_task_execution_state_without_admin_session(self) -> None:
        token = self._create_session_token()
        self._configure_codex_dispatch()

        async def fake_dispatch(record: CodexTaskRequest, *, runtime):
            return {
                "status_code": 204,
                "repository": runtime.repository,
                "workflow_id": runtime.workflow_id,
                "ref": record.target_ref,
                "callback_url": record.callback_url,
            }

        with patch(
            "apps.api.app.domains.codex.services.tasks._dispatch_github_workflow",
            side_effect=fake_dispatch,
        ):
            create_response = self.client.post(
                "/admin/codex/tasks",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "title": "Track execution",
                    "prompt": "Make a tiny repo change.",
                    "run_mode": "LONG_RUNNING",
                    "max_iterations": 3,
                },
            )

        self.assertEqual(create_response.status_code, 201)
        task_id = create_response.json()["id"]

        running_response = self.client.post(
            f"/codex/tasks/{task_id}/callback",
            headers={"X-Codex-Callback-Token": "codex-callback-secret"},
            json={
                "status": "RUNNING",
                "workflow_run_id": "98765",
                "workflow_run_url": "https://github.com/acme/ectrm/actions/runs/98765",
                "branch_name": "codex/task-1-98765",
            },
        )

        self.assertEqual(running_response.status_code, 200)
        running_payload = running_response.json()
        self.assertEqual(running_payload["status"], "RUNNING")
        self.assertEqual(running_payload["workflow_run_id"], "98765")
        self.assertEqual(running_payload["branch_name"], "codex/task-1-98765")
        self.assertIsNotNone(running_payload["started_at"])

        completed_response = self.client.post(
            f"/codex/tasks/{task_id}/callback",
            headers={"X-Codex-Callback-Token": "codex-callback-secret"},
            json={
                "status": "COMPLETED",
                "workflow_run_id": "98765",
                "workflow_run_url": "https://github.com/acme/ectrm/actions/runs/98765",
                "pull_request_url": "https://github.com/acme/ectrm/pull/123",
                "artifact_url": "https://github.com/acme/ectrm/actions/runs/98765",
                "iteration_count": 2,
                "iteration_summaries": [
                    {"iteration": 1, "summary": "Fixed the first issue."},
                    {"iteration": 2, "summary": "No more recommendations."},
                ],
                "result_summary": "Codex completed two iterations.",
                "stop_reason": "No further concrete recommendations remained.",
            },
        )

        self.assertEqual(completed_response.status_code, 200)
        completed_payload = completed_response.json()
        self.assertEqual(completed_payload["status"], "COMPLETED")
        self.assertEqual(completed_payload["iteration_count"], 2)
        self.assertEqual(completed_payload["pull_request_url"], "https://github.com/acme/ectrm/pull/123")
        self.assertEqual(completed_payload["stop_reason"], "No further concrete recommendations remained.")
        self.assertIsNotNone(completed_payload["completed_at"])

    def test_callback_rejects_invalid_token(self) -> None:
        self._configure_codex_dispatch()
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            record = CodexTaskRequest(
                status="DISPATCHED",
                provider="github_actions",
                title="Reject callback",
                prompt="No-op",
                run_mode="SINGLE_TASK",
                max_iterations=1,
                continuation_prompt=None,
                stop_conditions=[],
                target_ref="main",
                repository="acme/ectrm",
                workflow_id="codex.yml",
                dispatch_url="https://api.github.com/repos/acme/ectrm/actions/workflows/codex.yml/dispatches",
                callback_url="https://ectrm.example.test/codex/tasks/1/callback",
                external_url="https://github.com/acme/ectrm/actions/workflows/codex.yml",
                provider_response=None,
                error_detail=None,
                requested_by="codex_admin",
                requester_role="OPS_ADMIN",
                created_at=now,
                updated_at=now,
            )
            session.add(record)
            session.commit()
            task_id = record.id

        response = self.client.post(
            f"/codex/tasks/{task_id}/callback",
            headers={"X-Codex-Callback-Token": "wrong-token"},
            json={"status": "RUNNING"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "Invalid Codex callback token.")

    def _configure_codex_dispatch(self) -> None:
        settings.CODEX_TASKS_ENABLED = True
        settings.CODEX_GITHUB_REPOSITORY = "acme/ectrm"
        settings.CODEX_GITHUB_WORKFLOW_ID = "codex.yml"
        settings.CODEX_GITHUB_REF = "main"
        settings.CODEX_GITHUB_PROMPT_INPUT = "prompt"
        settings.CODEX_GITHUB_TOKEN = "github-test-token"
        settings.CODEX_CALLBACK_BASE_URL = "https://ectrm.example.test"
        settings.CODEX_CALLBACK_TOKEN = "codex-callback-secret"
        settings.CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS = 5
        settings.CODEX_LONG_RUNNING_MAX_ITERATIONS = 10

    def _create_session_token(
        self,
        *,
        user_id: str = "codex_admin",
        role: str = "OPS_ADMIN",
    ) -> str:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id=user_id,
                email=f"{user_id}@example.com",
                display_name=user_id.replace("_", " ").title(),
                role=role,
                password_hash=hash_password("supersecret1"),
                is_active=True,
                last_login_at=now,
                created_at=now,
                created_by="test-suite",
                updated_at=now,
                updated_by="test-suite",
                version=1,
            )
            session.add(user)
            session.commit()
            _, token = create_user_session(session, user)
            return token


if __name__ == "__main__":
    unittest.main()
