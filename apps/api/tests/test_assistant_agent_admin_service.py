from __future__ import annotations

from dataclasses import replace
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.core.request_context import reset_request_identity, set_request_identity
from apps.api.app.domains.assistant.services.agent_admin import (
    AssistantAgentMutationInput,
    create_admin_assistant_agent,
    update_admin_assistant_agent,
    upsert_admin_assistant_agent,
)
from apps.api.app.domains.assistant.services.chat import AssistantServiceError
from apps.api.app.models import Base
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval, AssistantAgentEvalRun
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord
from apps.api.app.schemas.assistant import AssistantAgentCreate, AssistantAgentUpdate


class AssistantAgentAdminServiceTests(unittest.TestCase):
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
            session.query(MutationProvenanceRecord).delete()
            session.query(AssistantAgentEvalRun).delete()
            session.query(AssistantAgentEval).delete()
            session.query(AssistantAgent).delete()
            session.query(AssistantAgentProfileRequest).delete()
            session.commit()

    def test_create_admin_assistant_agent_inherits_role_tool_defaults_and_requires_explicit_actions(self) -> None:
        with self.SessionLocal() as session:
            record = create_admin_assistant_agent(
                session,
                AssistantAgentCreate(
                    agent_id="trade-governor",
                    name="Trade Governor",
                    description="Reviews trade governance actions.",
                    status="DRAFT",
                    scope="TEAM",
                    provider="openai",
                    model="gpt-5-mini",
                    role_key="trade-governor",
                    profile_kind="ROLE_DERIVED",
                    specialization_summary="Reviews trade governance actions.",
                    human_owner_role="Trader, Desk Lead, or Admin",
                    authority_ceiling="STAGE",
                    activation_notes="Seeded by test fixture.",
                    allowed_workspaces=["assistant", "trades"],
                    capabilities=["READ", "EXPLAIN", "ACTION"],
                    allowed_tools=[],
                    allowed_action_types=["cancel_trade"],
                    system_prompt="Review trade state before recommending actions.",
                    created_by="ops-admin",
                ),
            )

            self.assertEqual(record.created_by, "ops-admin")
            self.assertEqual(
                record.allowed_tools,
                ["get_trade_by_id", "list_trade_events", "get_trade_workbench", "list_workflow_items"],
            )
            self.assertEqual(record.allowed_action_types, ["cancel_trade"])
            self.assertEqual(record.version, 1)

    def test_create_admin_assistant_agent_rejects_action_capability_without_explicit_actions(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(
                AssistantServiceError,
                "must declare explicit allowed_action_types",
            ):
                create_admin_assistant_agent(
                    session,
                    AssistantAgentCreate(
                        agent_id="trade-governor",
                        name="Trade Governor",
                        description="Reviews trade governance actions.",
                        status="DRAFT",
                        scope="TEAM",
                        provider="openai",
                        model="gpt-5-mini",
                        role_key="trade-governor",
                        profile_kind="ROLE_DERIVED",
                        allowed_workspaces=["assistant", "trades"],
                        capabilities=["READ", "EXPLAIN", "ACTION"],
                        allowed_tools=[],
                        allowed_action_types=[],
                        system_prompt="Review trade state before recommending actions.",
                        created_by="ops-admin",
                    ),
                )

    def test_update_admin_assistant_agent_touches_existing_record_even_when_payload_is_unchanged(self) -> None:
        with self.SessionLocal() as session:
            create_admin_assistant_agent(
                session,
                AssistantAgentCreate(
                    agent_id="ops-coordinator",
                    name="Ops Coordinator",
                    description="Summarizes operational blockers.",
                    status="DRAFT",
                    scope="TEAM",
                    provider="openai",
                    model="gpt-5-mini",
                    allowed_workspaces=["assistant", "operations"],
                    capabilities=["READ", "EXPLAIN"],
                    allowed_tools=["list_workflow_items"],
                    allowed_action_types=[],
                    system_prompt="Summarize downstream blockers and owners.",
                    created_by="ops-admin",
                ),
            )

            updated = update_admin_assistant_agent(
                session,
                agent_id="ops-coordinator",
                payload=AssistantAgentUpdate(
                    name="Ops Coordinator",
                    description="Summarizes operational blockers.",
                    status="DRAFT",
                    scope="TEAM",
                    provider="openai",
                    model="gpt-5-mini",
                    allowed_workspaces=["assistant", "operations"],
                    capabilities=["READ", "EXPLAIN"],
                    allowed_tools=["list_workflow_items"],
                    allowed_action_types=[],
                    system_prompt="Summarize downstream blockers and owners.",
                    updated_by="ops-admin",
                ),
            )

            self.assertEqual(updated.version, 2)
            self.assertEqual(updated.updated_by, "ops-admin")

    def test_upsert_admin_assistant_agent_supports_non_route_batch_usage_without_commit(self) -> None:
        definition = AssistantAgentMutationInput(
            agent_id="settlement-copilot",
            name="Settlement Copilot",
            description="Explains settlement posture and next steps.",
            status="ACTIVE",
            scope="TEAM",
            provider=None,
            model=None,
            role_key="settlement-copilot",
            profile_kind="CURATED",
            specialization_summary="Explains settlement posture and next steps.",
            human_owner_role="Settlement lead",
            authority_ceiling="STAGE",
            activation_notes="Seeded by test fixture.",
            allowed_workspaces=("assistant", "settlement"),
            capabilities=("READ", "EXPLAIN", "ACTION"),
            allowed_tools=("list_trade_invoices", "list_trade_payments"),
            allowed_action_types=("issue_trade_invoice",),
            system_prompt="Explain settlement status and stage the smallest justified next step.",
        )

        with self.SessionLocal() as session:
            first = upsert_admin_assistant_agent(
                session,
                definition=definition,
                actor_id="seed-admin",
                on_missing="create",
                on_existing="update",
                touch_existing=False,
                commit=False,
            )

            self.assertTrue(first.created)
            self.assertEqual(session.query(AssistantAgent).count(), 1)

            second = upsert_admin_assistant_agent(
                session,
                definition=definition,
                actor_id="seed-admin",
                on_missing="create",
                on_existing="update",
                touch_existing=False,
                commit=False,
            )

            self.assertFalse(second.updated)
            self.assertEqual(session.get(AssistantAgent, "settlement-copilot").version, 1)

            changed = upsert_admin_assistant_agent(
                session,
                definition=replace(definition, description="Explains settlement posture, cash risk, and next steps."),
                actor_id="seed-admin",
                on_missing="create",
                on_existing="update",
                touch_existing=False,
                commit=False,
            )

            self.assertTrue(changed.updated)
            self.assertEqual(session.get(AssistantAgent, "settlement-copilot").version, 2)

    def test_upsert_admin_assistant_agent_rejects_action_allowlist_without_action_capability(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(
                AssistantServiceError,
                "allowed_action_types can only be set for agents with the ACTION capability",
            ):
                upsert_admin_assistant_agent(
                    session,
                    definition=AssistantAgentMutationInput(
                        agent_id="trade-reader",
                        name="Trade Reader",
                        description="Reads trade state without staging actions.",
                        status="DRAFT",
                        scope="TEAM",
                        provider="openai",
                        model="gpt-5-mini",
                        role_key="trade-reader",
                        profile_kind="CUSTOM",
                        specialization_summary="Reads trade state without staging actions.",
                        human_owner_role="Trading lead",
                        authority_ceiling="EXPLAIN",
                        activation_notes="Seeded by test fixture.",
                        allowed_workspaces=("assistant",),
                        capabilities=("READ", "EXPLAIN"),
                        allowed_tools=(),
                        allowed_action_types=("cancel_trade",),
                        system_prompt="Explain the selected trade state.",
                    ),
                    actor_id="ops-admin",
                    on_missing="create",
                    on_existing="error",
                    touch_existing=False,
                    commit=False,
                )

    def test_create_admin_assistant_agent_records_provenance_with_request_identity(self) -> None:
        identity_token = set_request_identity(
            actor_id="ops-admin",
            role="OPS_ADMIN",
            session_id="session-456",
            correlation_id="corr-agent-1",
            request_method="POST",
            request_path="/admin/assistant/agents",
        )
        try:
            with self.SessionLocal() as session:
                record = create_admin_assistant_agent(
                    session,
                    AssistantAgentCreate(
                        agent_id="governance-coach",
                        name="Governance Coach",
                        description="Explains agent guardrails.",
                        status="DRAFT",
                        scope="TEAM",
                        provider="openai",
                        model="gpt-5-mini",
                        allowed_workspaces=["assistant", "admin"],
                        capabilities=["READ", "EXPLAIN"],
                        allowed_tools=["list_workflow_items"],
                        allowed_action_types=[],
                        system_prompt="Explain the current guardrails before proposing changes.",
                        created_by="ops-admin",
                    ),
                )

                provenance = session.query(MutationProvenanceRecord).one()

            self.assertEqual(record.agent_id, "governance-coach")
            self.assertEqual(provenance.operation_key, "assistant_agent.created")
            self.assertEqual(provenance.source_surface, "admin.assistant.agents")
            self.assertEqual(provenance.actor_id, "ops-admin")
            self.assertEqual(provenance.actor_role, "OPS_ADMIN")
            self.assertEqual(provenance.session_id, "session-456")
            self.assertEqual(provenance.correlation_id, "corr-agent-1")
            self.assertEqual(provenance.request_method, "POST")
            self.assertEqual(provenance.request_path, "/admin/assistant/agents")
            self.assertEqual(
                provenance.affected_records,
                [
                    {
                        "record_type": "assistant_agent",
                        "record_id": "governance-coach",
                        "action": "created",
                        "label": "Governance Coach",
                    }
                ],
            )
            self.assertEqual(provenance.details["agent_id"], "governance-coach")
            self.assertEqual(provenance.details["workspace_count"], 2)
            self.assertEqual(provenance.details["capability_count"], 2)
            self.assertEqual(provenance.details["tool_count"], 1)
            self.assertEqual(provenance.details["action_type_count"], 0)
        finally:
            reset_request_identity(identity_token)


if __name__ == "__main__":
    unittest.main()
