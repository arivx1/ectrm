from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.core.request_context import reset_request_identity, set_request_identity
from apps.api.app.domains.assistant.services.agent_admin import create_admin_assistant_agent
from apps.api.app.domains.trading.services.event_writes import (
    AppendDomainEventCommand,
    append_domain_event,
)
from apps.api.app.models import Base
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.event import Event
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord
from apps.api.app.routes.admin_data import list_admin_mutation_provenance
from apps.api.app.schemas.assistant import AssistantAgentCreate


class AdminProvenanceApiTests(unittest.TestCase):
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
            session.query(AssistantAgent).delete()
            session.query(Event).delete()
            session.commit()

    def test_list_admin_mutation_provenance_returns_recent_cross_transport_entries(self) -> None:
        with self.SessionLocal() as session:
            event_identity = set_request_identity(
                actor_id="ops-user",
                role="OPS_USER",
                session_id="session-events",
                correlation_id="corr-events-1",
                request_method="POST",
                request_path="/events",
            )
            try:
                append_domain_event(
                    session,
                    AppendDomainEventCommand(
                        aggregate_type="note",
                        aggregate_id="NOTE-1",
                        event_type="NoteCaptured",
                        occurred_at=datetime(2026, 4, 14, 12, 0, tzinfo=timezone.utc),
                        payload={"message": "hello"},
                    ),
                )
            finally:
                reset_request_identity(event_identity)

            agent_identity = set_request_identity(
                actor_id="ops-admin",
                role="OPS_ADMIN",
                session_id="session-admin",
                correlation_id="corr-admin-1",
                request_method="POST",
                request_path="/admin/assistant/agents",
            )
            try:
                create_admin_assistant_agent(
                    session,
                    AssistantAgentCreate(
                        agent_id="ops-guide",
                        name="Ops Guide",
                        description="Explains governed admin changes.",
                        status="DRAFT",
                        scope="TEAM",
                        provider="openai",
                        model="gpt-5-mini",
                        allowed_workspaces=["assistant", "admin"],
                        capabilities=["READ", "EXPLAIN"],
                        allowed_tools=["list_workflow_items"],
                        allowed_action_types=[],
                        system_prompt="Explain the approved admin path before proposing changes.",
                        created_by="ops-admin",
                    ),
                )
            finally:
                reset_request_identity(agent_identity)

            payload = list_admin_mutation_provenance(limit=10, db=session)

        self.assertEqual(len(payload), 2)
        self.assertEqual(payload[0].operation_key, "assistant_agent.created")
        self.assertEqual(payload[0].source_surface, "admin.assistant.agents")
        self.assertEqual(payload[0].correlation_id, "corr-admin-1")
        self.assertEqual(payload[1].operation_key, "event_write.NoteCaptured")
        self.assertEqual(payload[1].source_surface, "events")
        self.assertEqual(payload[1].correlation_id, "corr-events-1")


if __name__ == "__main__":
    unittest.main()
