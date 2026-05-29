from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.job_schedule import JobRun, JobSchedule
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class JobSchedulingApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 5, 29, 15, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(JobRun).delete()
            session.query(JobSchedule).delete()
            session.query(AssistantAgent).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        self.admin_headers = {
            "Authorization": f"Bearer {self._create_session_token(user_id='scheduler_admin', role='OPS_ADMIN')}"
        }

    def test_create_time_driven_hybrid_schedule_and_materialize_due_run(self) -> None:
        self._create_agent(agent_id="ops-sentinel", allowed_action_types=["update_trade_workflow_item"])

        create_response = self.client.post(
            "/admin/job-scheduling/schedules",
            headers=self.admin_headers,
            json={
                "name": "Daily EOD readiness",
                "description": "Check readiness and stage workflow updates when needed.",
                "trigger_type": "time",
                "time_trigger": {
                    "starts_at": "2026-05-29T09:00:00-05:00",
                    "timezone": "America/Chicago",
                    "recurrence": {"frequency": "daily", "interval": 1, "count": 2},
                },
                "execution_plan": {
                    "mode": "hybrid",
                    "deterministic_task_key": "trading_eod_readiness",
                    "agent_id": "ops-sentinel",
                    "allowed_action_types": ["update_trade_workflow_item"],
                    "max_authority": "stage",
                    "payload": {"workspace": "operations"},
                },
            },
        )

        self.assertEqual(create_response.status_code, 201)
        schedule = create_response.json()
        self.assertEqual(schedule["trigger_type"], "TIME")
        self.assertEqual(schedule["execution_plan"]["mode"], "HYBRID")
        self.assertEqual(schedule["execution_plan"]["deterministic_task_key"], "trading_eod_readiness")
        self.assertEqual(schedule["execution_plan"]["agent_id"], "ops-sentinel")
        self.assertEqual(schedule["execution_plan"]["allowed_action_types"], ["update_trade_workflow_item"])
        self.assertEqual(schedule["next_run_at"], "2026-05-29T14:00:00Z")

        due_response = self.client.post(
            "/admin/job-scheduling/runs/materialize-due",
            headers=self.admin_headers,
            json={"as_of": "2026-05-29T15:05:00Z", "limit": 10},
        )

        self.assertEqual(due_response.status_code, 200)
        due_payload = due_response.json()
        self.assertEqual(due_payload["count"], 1)
        run = due_payload["items"][0]
        self.assertEqual(run["status"], "QUEUED")
        self.assertEqual(run["trigger_type"], "TIME")
        self.assertEqual(run["scheduled_for"], "2026-05-29T14:00:00Z")
        self.assertEqual(run["execution_plan"]["mode"], "HYBRID")
        self.assertIn("job-schedule:", run["idempotency_key"])

        duplicate_due_response = self.client.post(
            "/admin/job-scheduling/runs/materialize-due",
            headers=self.admin_headers,
            json={"as_of": "2026-05-29T15:05:00Z", "limit": 10},
        )
        self.assertEqual(duplicate_due_response.status_code, 200)
        self.assertEqual(duplicate_due_response.json()["count"], 0)

        runs_response = self.client.get(
            "/admin/job-scheduling/runs",
            headers=self.admin_headers,
            params={"schedule_id": schedule["id"]},
        )
        self.assertEqual(runs_response.status_code, 200)
        self.assertEqual([row["id"] for row in runs_response.json()], [run["id"]])

    def test_event_driven_agentic_schedule_matches_filter_and_is_idempotent(self) -> None:
        self._create_agent(agent_id="doc-agent")
        create_response = self.client.post(
            "/admin/job-scheduling/schedules",
            headers=self.admin_headers,
            json={
                "name": "Document exception triage",
                "trigger_type": "event",
                "event_trigger": {
                    "event_source": "document_workflow",
                    "event_type": "DOCUMENT_REVIEW_NEEDED",
                    "event_filter": {"classification": "BILL_OF_LADING", "priority": ["HIGH", "URGENT"]},
                },
                "execution_plan": {
                    "mode": "agentic",
                    "agent_id": "doc-agent",
                    "max_authority": "draft",
                    "payload": {"workspace": "library"},
                },
            },
        )
        self.assertEqual(create_response.status_code, 201)
        schedule_id = create_response.json()["id"]

        miss_response = self.client.post(
            "/admin/job-scheduling/runs/enqueue-event",
            headers=self.admin_headers,
            json={
                "event_source": "document_workflow",
                "event_type": "DOCUMENT_REVIEW_NEEDED",
                "event_ref": "doc-1:review",
                "occurred_at": "2026-05-29T16:00:00Z",
                "event_payload": {"classification": "INVOICE", "priority": "HIGH"},
            },
        )
        self.assertEqual(miss_response.status_code, 200)
        self.assertEqual(miss_response.json()["count"], 0)

        hit_payload = {
            "event_source": "document_workflow",
            "event_type": "DOCUMENT_REVIEW_NEEDED",
            "event_ref": "doc-2:review",
            "occurred_at": "2026-05-29T16:01:00Z",
            "event_payload": {"classification": "BILL_OF_LADING", "priority": "URGENT"},
        }
        hit_response = self.client.post(
            "/admin/job-scheduling/runs/enqueue-event",
            headers=self.admin_headers,
            json=hit_payload,
        )
        duplicate_response = self.client.post(
            "/admin/job-scheduling/runs/enqueue-event",
            headers=self.admin_headers,
            json=hit_payload,
        )

        self.assertEqual(hit_response.status_code, 200)
        self.assertEqual(duplicate_response.status_code, 200)
        first_run = hit_response.json()["items"][0]
        duplicate_run = duplicate_response.json()["items"][0]
        self.assertEqual(first_run["id"], duplicate_run["id"])
        self.assertEqual(first_run["trigger_type"], "EVENT")
        self.assertEqual(first_run["event_source"], "document_workflow")
        self.assertEqual(first_run["execution_plan"]["mode"], "AGENTIC")

        with self.SessionLocal() as session:
            self.assertEqual(session.query(JobRun).count(), 1)
            self.assertEqual(session.get(JobSchedule, schedule_id).version, 2)

    def test_schedule_validation_blocks_unapproved_execution_shape(self) -> None:
        missing_agent_response = self.client.post(
            "/admin/job-scheduling/schedules",
            headers=self.admin_headers,
            json={
                "name": "Missing agent",
                "trigger_type": "event",
                "event_trigger": {"event_source": "assistant", "event_type": "RUN_FAILED"},
                "execution_plan": {"mode": "agentic", "agent_id": "missing-agent"},
            },
        )

        self.assertEqual(missing_agent_response.status_code, 422)
        self.assertIn("missing-agent", missing_agent_response.json()["detail"])

        unknown_task_response = self.client.post(
            "/admin/job-scheduling/schedules",
            headers=self.admin_headers,
            json={
                "name": "Unknown deterministic job",
                "trigger_type": "time",
                "time_trigger": {
                    "starts_at": "2026-05-29T09:00:00-05:00",
                    "timezone": "America/Chicago",
                },
                "execution_plan": {"mode": "deterministic", "deterministic_task_key": "freeform_mutation"},
            },
        )

        self.assertEqual(unknown_task_response.status_code, 422)
        self.assertIn("Unknown deterministic_task_key", unknown_task_response.json()["detail"])

        self._create_agent(
            agent_id="draft-only-agent",
            allowed_action_types=[],
            authority_ceiling="DRAFT",
            capabilities=["READ", "EXPLAIN", "DRAFT"],
        )
        excessive_authority_response = self.client.post(
            "/admin/job-scheduling/schedules",
            headers=self.admin_headers,
            json={
                "name": "Over-authorized agent",
                "trigger_type": "event",
                "event_trigger": {"event_source": "workflow", "event_type": "BLOCKED"},
                "execution_plan": {
                    "mode": "agentic",
                    "agent_id": "draft-only-agent",
                    "allowed_action_types": ["update_trade_workflow_item"],
                    "max_authority": "stage",
                },
            },
        )

        self.assertEqual(excessive_authority_response.status_code, 422)
        self.assertIn("exceeds agent", excessive_authority_response.json()["detail"])

    def test_scheduler_admin_routes_require_admin_session(self) -> None:
        user_headers = {"Authorization": f"Bearer {self._create_session_token(user_id='scheduler_user', role='TRADER')}"}

        unauthenticated_response = self.client.get("/admin/job-scheduling/schedules")
        forbidden_response = self.client.get("/admin/job-scheduling/schedules", headers=user_headers)

        self.assertEqual(unauthenticated_response.status_code, 401)
        self.assertEqual(forbidden_response.status_code, 403)

    def _create_session_token(self, *, user_id: str, role: str) -> str:
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id=user_id,
                email=f"{user_id}@example.com",
                display_name=user_id.replace("_", " ").title(),
                role=role,
                password_hash=hash_password("supersecret1"),
                is_active=True,
                last_login_at=self.now,
                created_at=self.now,
                created_by="test-suite",
                updated_at=self.now,
                updated_by="test-suite",
                version=1,
            )
            session.add(user)
            session.commit()
            _, token = create_user_session(session, user)
            return token

    def _create_agent(
        self,
        *,
        agent_id: str,
        allowed_action_types: list[str] | None = None,
        authority_ceiling: str | None = None,
        capabilities: list[str] | None = None,
    ) -> None:
        resolved_allowed_actions = list(allowed_action_types or [])
        resolved_capabilities = capabilities or (
            ["READ", "EXPLAIN", "DRAFT", "ACTION"] if resolved_allowed_actions else ["READ", "EXPLAIN", "DRAFT"]
        )
        resolved_authority = authority_ceiling or ("STAGE" if resolved_allowed_actions else "DRAFT")
        with self.SessionLocal() as session:
            agent = AssistantAgent(
                agent_id=agent_id,
                name=agent_id.replace("-", " ").title(),
                description="Test scheduling agent",
                status="ACTIVE",
                scope="TEAM",
                provider=None,
                model=None,
                role_key="operations",
                profile_kind="CUSTOM",
                specialization_summary="Schedules test jobs.",
                human_owner_role="OPS_ADMIN",
                authority_ceiling=resolved_authority,
                activation_notes=None,
                orchestration_pattern="SINGLE",
                parent_agent_id=None,
                managed_agent_ids=[],
                delegation_guidance=None,
                profile_request_id=None,
                allowed_workspaces=["operations", "library"],
                capabilities=resolved_capabilities,
                skills=[],
                allowed_tools=[],
                allowed_action_types=resolved_allowed_actions,
                daily_token_allocation=None,
                system_prompt="You help with scheduled test work.",
                created_at=self.now,
                created_by="test-suite",
                updated_at=self.now,
                updated_by="test-suite",
                version=1,
            )
            session.add(agent)
            session.commit()


if __name__ == "__main__":
    unittest.main()
