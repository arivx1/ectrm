from __future__ import annotations

from datetime import datetime, timedelta, timezone
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.assistant.services.autonomy_review import (
    build_assistant_agent_health_review,
)
from apps.api.app.domains.assistant.services.agent_work_packages import (
    accept_generated_agent_work_package,
    list_agent_work_packages,
    update_agent_work_package,
)
from apps.api.app.models import Base
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval, AssistantAgentEvalRun
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest
from apps.api.app.models.assistant_agent_work_package import AssistantAgentWorkPackage
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord


class AssistantAgentHealthReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            session.query(AssistantAgentWorkPackage).delete()
            session.query(AssistantActionRequest).delete()
            session.query(AssistantRun).delete()
            session.query(AssistantAgentEvalRun).delete()
            session.query(AssistantAgentEval).delete()
            session.query(AssistantAgent).delete()
            session.query(AssistantAgentProfileRequest).delete()
            session.query(MutationProvenanceRecord).delete()
            session.commit()

    def _seed_repeated_workflow_candidates(self, session, *, now: datetime) -> None:
        for index, agent_id in enumerate(("workflow-alpha", "workflow-beta")):
            agent_name = f"Workflow {index + 1}"
            agent = AssistantAgent(
                agent_id=agent_id,
                name=agent_name,
                description="Stages workflow updates for operations review.",
                status="ACTIVE",
                scope="TEAM",
                provider="openai",
                model="gpt-5-mini",
                role_key="trade-ops-copilot",
                profile_kind="ROLE_DERIVED",
                specialization_summary="Workflow item update specialist.",
                human_owner_role="Operations Lead",
                authority_ceiling="STAGE",
                activation_notes="Approved for staged workflow update review.",
                profile_request_id=None,
                allowed_workspaces=["assistant", "operations"],
                capabilities=["READ", "EXPLAIN", "ACTION"],
                allowed_tools=["list_workflow_items"],
                allowed_action_types=["update_trade_workflow_item"],
                daily_token_allocation=None,
                system_prompt="Stage only reviewable workflow updates.",
                created_at=now - timedelta(days=1),
                created_by="ops_admin",
                updated_at=now - timedelta(days=1),
                updated_by="ops_admin",
                version=1,
            )
            run = AssistantRun(
                conversation_id=None,
                status="COMPLETED",
                user_id=f"ops_{index}",
                session_id=f"workflow-session-{index}",
                user_role="OPS_ADMIN",
                workspace="operations",
                agent_id=agent_id,
                agent_name=agent_name,
                agent_role_key="trade-ops-copilot",
                agent_profile_kind="ROLE_DERIVED",
                provider="openai",
                model="gpt-5-mini",
                use_live_tools=False,
                request_messages=[{"role": "user", "content": "Review workflow items."}],
                application_context=None,
                prompt_sections=[],
                rendered_system_prompt="System prompt.",
                warnings=[],
                tool_calls=[],
                input_tokens=100,
                output_tokens=40,
                latest_user_message="Review workflow items.",
                assistant_message="Staged workflow updates.",
                error_detail=None,
                created_at=now - timedelta(hours=2),
                completed_at=now - timedelta(hours=2),
            )
            session.add_all([agent, run])
            session.flush()
            session.add(
                AssistantActionRequest(
                    run_id=run.id,
                    status="EXECUTED",
                    user_id=f"ops_{index}",
                    session_id=f"workflow-session-{index}",
                    workspace="operations",
                    agent_id=agent_id,
                    agent_name=agent_name,
                    action_type="update_trade_workflow_item",
                    summary="Workflow update",
                    description="Update a workflow item.",
                    payload={"review_context": {"stale_state_basis": {"version": index}}},
                    result={"workflow_item": {"id": index + 1}},
                    error_detail=None,
                    created_at=now - timedelta(minutes=30 + index),
                    decided_at=now - timedelta(minutes=20 + index),
                    decided_by="ops_lead",
                )
            )
        session.commit()

    def test_groups_repeated_deterministic_candidates_into_work_packages(self) -> None:
        now = datetime(2026, 4, 22, 12, 0, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            self._seed_repeated_workflow_candidates(session, now=now)

            snapshot = build_assistant_agent_health_review(session, now=now)

        self.assertEqual(snapshot.agent_count, 2)
        package = next(
            work_package
            for work_package in snapshot.work_packages
            if any("update_trade_workflow_item" in candidate for candidate in work_package.source_candidates)
        )
        self.assertTrue(package.work_package_id.startswith("policy-"))
        self.assertEqual(package.package_type, "POLICY")
        self.assertEqual(package.priority, "P2")
        self.assertEqual(package.status, "CANDIDATE")
        self.assertEqual(package.source_agent_ids, ("workflow-alpha", "workflow-beta"))
        self.assertIn("typed policy or service logic", package.source_candidates[0])
        self.assertEqual(package.recommended_owner_role, "Operations Lead")
        self.assertTrue(
            any("policy simulation" in check.lower() for check in package.acceptance_checks)
        )
        item_ids = {item.agent_id: item.work_package_ids for item in snapshot.review_items}
        self.assertIn(package.work_package_id, item_ids["workflow-alpha"])
        self.assertIn(package.work_package_id, item_ids["workflow-beta"])

    def test_accepts_generated_work_package_into_durable_backlog(self) -> None:
        now = datetime(2026, 4, 22, 12, 0, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            self._seed_repeated_workflow_candidates(session, now=now)
            snapshot = build_assistant_agent_health_review(session, now=now)
            package = next(
                work_package
                for work_package in snapshot.work_packages
                if any("update_trade_workflow_item" in candidate for candidate in work_package.source_candidates)
            )

            accepted = accept_generated_agent_work_package(
                session,
                work_package_id=package.work_package_id,
                accepted_by="ops_admin",
                notes="Promote into the policy backlog.",
                now=now,
            )

            self.assertEqual(accepted.work_package_id, package.work_package_id)
            self.assertEqual(accepted.status, "ACCEPTED")
            self.assertEqual(accepted.accepted_by, "ops_admin")
            self.assertEqual(accepted.notes, "Promote into the policy backlog.")
            self.assertEqual(accepted.source_agent_ids, ["workflow-alpha", "workflow-beta"])
            self.assertIn("policy simulation", " ".join(accepted.acceptance_checks).lower())

            listed = list_agent_work_packages(session, status="ACCEPTED")
            self.assertEqual([record.work_package_id for record in listed], [package.work_package_id])

            accepted_again = accept_generated_agent_work_package(
                session,
                work_package_id=package.work_package_id,
                accepted_by="ops_reviewer",
                now=now + timedelta(minutes=5),
            )

            self.assertEqual(accepted_again.id, accepted.id)
            self.assertEqual(accepted_again.status, "ACCEPTED")
            self.assertEqual(accepted_again.accepted_by, "ops_reviewer")
            self.assertEqual(session.query(AssistantAgentWorkPackage).count(), 1)

    def test_updates_work_package_lifecycle_with_evidence_gate(self) -> None:
        now = datetime(2026, 4, 22, 12, 0, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            self._seed_repeated_workflow_candidates(session, now=now)
            snapshot = build_assistant_agent_health_review(session, now=now)
            package = next(
                work_package
                for work_package in snapshot.work_packages
                if any("update_trade_workflow_item" in candidate for candidate in work_package.source_candidates)
            )
            accepted = accept_generated_agent_work_package(
                session,
                work_package_id=package.work_package_id,
                accepted_by="ops_admin",
                notes="Promote into the policy backlog.",
                now=now,
            )

            in_progress = update_agent_work_package(
                session,
                work_package_id=accepted.work_package_id,
                status="IN_PROGRESS",
                updated_by="ops_admin",
                notes="Policy implementation started.",
                now=now + timedelta(minutes=5),
            )

            self.assertEqual(in_progress.id, accepted.id)
            self.assertEqual(in_progress.status, "IN_PROGRESS")
            self.assertEqual(in_progress.notes, "Policy implementation started.")

            with self.assertRaisesRegex(Exception, "Implementation evidence note is required"):
                update_agent_work_package(
                    session,
                    work_package_id=accepted.work_package_id,
                    status="IMPLEMENTED",
                    updated_by="ops_admin",
                    now=now + timedelta(minutes=10),
                )

            implemented = update_agent_work_package(
                session,
                work_package_id=accepted.work_package_id,
                status="IMPLEMENTED",
                updated_by="ops_admin",
                notes="Implemented policy checks and passing tests.",
                now=now + timedelta(minutes=15),
            )

            self.assertEqual(implemented.status, "IMPLEMENTED")
            self.assertEqual(implemented.notes, "Implemented policy checks and passing tests.")

            with self.assertRaisesRegex(Exception, "Cannot move assistant agent work package"):
                update_agent_work_package(
                    session,
                    work_package_id=accepted.work_package_id,
                    status="DISMISSED",
                    updated_by="ops_admin",
                    notes="Changed our mind.",
                    now=now + timedelta(minutes=20),
                )


if __name__ == "__main__":
    unittest.main()
