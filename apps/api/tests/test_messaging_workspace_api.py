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

from apps.api.app.config import settings
from apps.api.app.core.auth import hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.messaging_workspace_conversation import MessagingWorkspaceConversation
from apps.api.app.models.messaging_workspace_message import MessagingWorkspaceMessage
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class MessagingWorkspaceApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 5, 16, 21, 0, tzinfo=timezone.utc)
        self._previous_bootstrap_admin_token = settings.BOOTSTRAP_ADMIN_TOKEN
        settings.BOOTSTRAP_ADMIN_TOKEN = "messaging-bootstrap-secret"
        MessagingWorkspaceConversation.__table__.create(bind=self.engine, checkfirst=True)
        MessagingWorkspaceMessage.__table__.create(bind=self.engine, checkfirst=True)

        with self.SessionLocal() as session:
            session.query(MessagingWorkspaceMessage).delete()
            session.query(MessagingWorkspaceConversation).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()

    def tearDown(self) -> None:
        settings.BOOTSTRAP_ADMIN_TOKEN = self._previous_bootstrap_admin_token

    def _bootstrap_admin(self) -> str:
        response = self.client.post(
            "/auth/bootstrap-admin",
            json={
                "bootstrap_token": "messaging-bootstrap-secret",
                "user_id": "messaging_admin",
                "email": "messaging@example.com",
                "display_name": "Messaging Admin",
                "password": "supersecret1",
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["access_token"]

    def _create_user(
        self,
        *,
        user_id: str,
        email: str,
        display_name: str,
        role: str,
        password: str = "supersecret2",
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id=user_id,
                    email=email,
                    display_name=display_name,
                    role=role,
                    password_hash=hash_password(password),
                    is_active=True,
                    last_login_at=self.now,
                    created_at=self.now,
                    created_by="messaging_admin",
                    updated_at=self.now,
                    updated_by="messaging_admin",
                    version=1,
                )
            )
            session.commit()

    def _login(self, *, identifier: str, password: str = "supersecret2") -> str:
        response = self.client.post("/auth/session", json={"identifier": identifier, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def test_workspace_state_seeds_default_conversations_and_returns_durable_starter_threads(self) -> None:
        response = self.client.get("/messages/workspace")
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertEqual(len(payload["conversations"]), 5)
        assistant_conversation = payload["conversations"][0]
        self.assertEqual(assistant_conversation["conversation_id"], "ectrm-assistant")
        self.assertEqual(assistant_conversation["timeline"][0]["kind"], "system")
        self.assertEqual(
            assistant_conversation["timeline"][0]["detail"],
            "Action draft AR-204 moved into governed review.",
        )
        self.assertEqual(
            assistant_conversation["timeline"][1]["attachment"]["title"],
            "AR-204 governed action draft",
        )

    def test_guest_post_persists_and_reloads(self) -> None:
        post_response = self.client.post(
            "/messages/workspace/posts",
            json={
                "conversation_id": "ectrm-assistant",
                "body": "Hello from the public desk lane.",
            },
        )
        self.assertEqual(post_response.status_code, 201)
        posted_message = post_response.json()
        self.assertEqual(posted_message["author"]["name"], "Guest Operator")
        self.assertEqual(posted_message["source"], "human")

        reload_response = self.client.get("/messages/workspace")
        self.assertEqual(reload_response.status_code, 200)
        payload = reload_response.json()
        assistant_conversation = next(
            conversation
            for conversation in payload["conversations"]
            if conversation["conversation_id"] == "ectrm-assistant"
        )
        self.assertEqual(assistant_conversation["preview"], "Hello from the public desk lane.")
        self.assertEqual(assistant_conversation["timeline"][-1]["kind"], "message")
        self.assertEqual(assistant_conversation["timeline"][-1]["author"]["name"], "Guest Operator")
        self.assertEqual(assistant_conversation["timeline"][-1]["body"], ["Hello from the public desk lane."])

    def test_signed_in_post_uses_authenticated_display_name(self) -> None:
        self._bootstrap_admin()
        self._create_user(
            user_id="mia.chen",
            email="mia@example.com",
            display_name="Mia Chen",
            role="OPERATIONS",
        )
        access_token = self._login(identifier="mia.chen")

        response = self.client.post(
            "/messages/workspace/posts",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "conversation_id": "ops-follow-through",
                "body": "Taking this into the queue after the desk confirms the note.",
            },
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["author"]["name"], "Mia Chen")
        self.assertEqual(payload["author"]["title"], "Desk operator")
        self.assertEqual(payload["created_by_user_id"], "mia.chen")
        self.assertEqual(payload["created_by_role"], "OPERATIONS")

    def test_assistant_post_requires_authenticated_session_and_persists_run_provenance(self) -> None:
        unauthorized_response = self.client.post(
            "/messages/workspace/posts",
            json={
                "conversation_id": "ectrm-assistant",
                "body": "Drafting a governed reply.",
                "source": "assistant",
                "assistant_run_id": 42,
                "assistant_agent_id": "desk-ops-agent",
                "assistant_agent_name": "Desk Ops Agent",
            },
        )
        self.assertEqual(unauthorized_response.status_code, 401)

        self._bootstrap_admin()
        self._create_user(
            user_id="ops.admin",
            email="ops-admin@example.com",
            display_name="Ops Admin",
            role="OPS_ADMIN",
        )
        access_token = self._login(identifier="ops.admin")

        authorized_response = self.client.post(
            "/messages/workspace/posts",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "conversation_id": "ectrm-assistant",
                "body": "Drafting a governed reply.",
                "source": "assistant",
                "assistant_run_id": 42,
                "assistant_agent_id": "desk-ops-agent",
                "assistant_agent_name": "Desk Ops Agent",
            },
        )
        self.assertEqual(authorized_response.status_code, 201)
        payload = authorized_response.json()
        self.assertEqual(payload["source"], "assistant")
        self.assertEqual(payload["assistant_run_id"], 42)
        self.assertEqual(payload["assistant_agent_id"], "desk-ops-agent")
        self.assertEqual(payload["assistant_agent_name"], "Desk Ops Agent")
        self.assertEqual(payload["author"]["name"], "ECTRM Assistant")
        self.assertEqual(payload["author"]["title"], "Managed agent · Assistant Console")

    def test_workspace_state_falls_back_to_seeded_conversations_when_tables_are_missing(self) -> None:
        MessagingWorkspaceMessage.__table__.drop(bind=self.engine, checkfirst=True)
        MessagingWorkspaceConversation.__table__.drop(bind=self.engine, checkfirst=True)

        try:
            response = self.client.get("/messages/workspace")
            self.assertEqual(response.status_code, 200)

            payload = response.json()
            self.assertEqual(len(payload["conversations"]), 5)
            self.assertEqual(payload["conversations"][0]["timeline"][0]["kind"], "system")
            self.assertEqual(
                payload["conversations"][0]["timeline"][0]["detail"],
                "Action draft AR-204 moved into governed review.",
            )
        finally:
            MessagingWorkspaceConversation.__table__.create(bind=self.engine, checkfirst=True)
            MessagingWorkspaceMessage.__table__.create(bind=self.engine, checkfirst=True)

    def test_post_returns_service_unavailable_when_tables_are_missing(self) -> None:
        MessagingWorkspaceMessage.__table__.drop(bind=self.engine, checkfirst=True)
        MessagingWorkspaceConversation.__table__.drop(bind=self.engine, checkfirst=True)

        try:
            response = self.client.post(
                "/messages/workspace/posts",
                json={
                    "conversation_id": "ectrm-assistant",
                    "body": "Hello from the public desk lane.",
                },
            )
            self.assertEqual(response.status_code, 503)
            self.assertIn("database schema is behind the current code", response.json()["detail"])
        finally:
            MessagingWorkspaceConversation.__table__.create(bind=self.engine, checkfirst=True)
            MessagingWorkspaceMessage.__table__.create(bind=self.engine, checkfirst=True)
