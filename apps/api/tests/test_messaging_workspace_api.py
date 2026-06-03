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
from apps.api.app.core.auth import hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.domains.integrations.services.slack_messaging import (
    SlackConversation,
    SlackPostedMessage,
    SlackUser,
)
from apps.api.app.models import Base
from apps.api.app.models.messaging_workspace_conversation import MessagingWorkspaceConversation
from apps.api.app.models.messaging_workspace_message import MessagingWorkspaceMessage
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class _FakeSlackClient:
    posted_messages: list[dict[str, str | None]] = []

    def __init__(self, config) -> None:
        self.config = config

    def list_conversations(self) -> list[SlackConversation]:
        return [
            SlackConversation(
                channel_id="C123SLACK",
                name="desk-ops",
                is_im=False,
                is_mpim=False,
                is_private=False,
                topic="Desk operations in Slack.",
                purpose="Coordinate desk work.",
                member_count=4,
            )
        ]

    def conversation_history(self, channel_id: str) -> list[dict[str, object]]:
        return [
            {
                "type": "message",
                "user": "U123",
                "text": "Slack note imported into the ECTRM messaging center.",
                "ts": "1770000000.000100",
                "reactions": [{"name": "eyes", "count": 2}],
            }
        ]

    def user_info(self, user_id: str) -> SlackUser:
        return SlackUser(user_id=user_id, display_name="Slack Operator", title="Slack user")

    def post_message(
        self,
        *,
        channel_id: str,
        text: str,
        thread_ts: str | None = None,
    ) -> SlackPostedMessage:
        self.posted_messages.append({"channel_id": channel_id, "text": text, "thread_ts": thread_ts})
        return SlackPostedMessage(channel_id=channel_id, message_ts="1770000060.000200")


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
        self._previous_slack_settings = {
            "SLACK_MESSAGING_ENABLED": settings.SLACK_MESSAGING_ENABLED,
            "SLACK_BOT_TOKEN": settings.SLACK_BOT_TOKEN,
            "SLACK_MESSAGING_CHANNEL_IDS": settings.SLACK_MESSAGING_CHANNEL_IDS,
            "SLACK_MESSAGING_CHANNEL_LIMIT": settings.SLACK_MESSAGING_CHANNEL_LIMIT,
            "SLACK_MESSAGING_HISTORY_LIMIT": settings.SLACK_MESSAGING_HISTORY_LIMIT,
            "SLACK_MESSAGING_TIMEOUT_SECONDS": settings.SLACK_MESSAGING_TIMEOUT_SECONDS,
            "SLACK_API_BASE_URL": settings.SLACK_API_BASE_URL,
        }
        settings.BOOTSTRAP_ADMIN_TOKEN = "messaging-bootstrap-secret"
        settings.SLACK_MESSAGING_ENABLED = False
        settings.SLACK_BOT_TOKEN = ""
        settings.SLACK_MESSAGING_CHANNEL_IDS = ""
        settings.SLACK_MESSAGING_CHANNEL_LIMIT = 10
        settings.SLACK_MESSAGING_HISTORY_LIMIT = 20
        settings.SLACK_MESSAGING_TIMEOUT_SECONDS = 20
        settings.SLACK_API_BASE_URL = "https://slack.com/api"
        _FakeSlackClient.posted_messages = []
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
        for setting_name, setting_value in self._previous_slack_settings.items():
            setattr(settings, setting_name, setting_value)

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
        self.assertNotIn("Mia Chen", str(payload))
        self.assertNotIn("Scheduler", str(payload))
        self.assertNotIn("Online", str(payload))
        self.assertIn("Operations Queue", assistant_conversation["timeline"][1]["thread_participants"])

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
            user_id="ops.user",
            email="ops@example.com",
            display_name="Ops User",
            role="OPERATIONS",
        )
        access_token = self._login(identifier="ops.user")

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
        self.assertEqual(payload["author"]["name"], "Ops User")
        self.assertEqual(payload["author"]["title"], "Desk operator")
        self.assertEqual(payload["created_by_user_id"], "ops.user")
        self.assertEqual(payload["created_by_role"], "OPERATIONS")

    def test_post_can_persist_attachment_metadata(self) -> None:
        response = self.client.post(
            "/messages/workspace/posts",
            json={
                "conversation_id": "counterparty-email",
                "body": "Attached the revised timing note for review.",
                "attachment": {
                    "label": "Attachment",
                    "title": "timing-note.pdf",
                    "summary": "application/pdf • 42 KB",
                    "footnote": "Added from the desk composer.",
                },
            },
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["attachment"]["title"], "timing-note.pdf")

        reload_response = self.client.get("/messages/workspace")
        self.assertEqual(reload_response.status_code, 200)
        conversation = next(
            item
            for item in reload_response.json()["conversations"]
            if item["conversation_id"] == "counterparty-email"
        )
        reloaded_message = conversation["timeline"][-1]
        self.assertEqual(reloaded_message["attachment"]["summary"], "application/pdf • 42 KB")

    def test_thread_reply_persists_parent_metadata_and_root_reply_count(self) -> None:
        root_response = self.client.post(
            "/messages/workspace/posts",
            json={
                "conversation_id": "counterparty-email",
                "body": "Desk is reviewing the revised nomination window.",
            },
        )
        self.assertEqual(root_response.status_code, 201)
        root_payload = root_response.json()

        reply_response = self.client.post(
            "/messages/workspace/posts",
            json={
                "conversation_id": "counterparty-email",
                "body": "Threaded follow-up keeps settlement context attached.",
                "parent_message_id": root_payload["message_id"],
            },
        )
        self.assertEqual(reply_response.status_code, 201)
        reply_payload = reply_response.json()
        self.assertEqual(reply_payload["parent_message_id"], root_payload["message_id"])
        self.assertEqual(reply_payload["thread_root_message_id"], root_payload["message_id"])

        reload_response = self.client.get("/messages/workspace")
        self.assertEqual(reload_response.status_code, 200)
        conversation = next(
            item
            for item in reload_response.json()["conversations"]
            if item["conversation_id"] == "counterparty-email"
        )
        reloaded_root = next(
            item for item in conversation["timeline"] if item["id"] == root_payload["message_id"]
        )
        reloaded_reply = next(
            item for item in conversation["timeline"] if item["id"] == reply_payload["message_id"]
        )

        self.assertEqual(reloaded_root["reply_count"], 1)
        self.assertEqual(reloaded_root["thread_participants"], ["Guest Operator"])
        self.assertEqual(reloaded_reply["parent_message_id"], root_payload["message_id"])
        self.assertEqual(reloaded_reply["thread_root_message_id"], root_payload["message_id"])

    def test_signed_in_author_can_pin_edit_and_delete_their_own_message(self) -> None:
        self._bootstrap_admin()
        self._create_user(
            user_id="ops.author",
            email="ops-author@example.com",
            display_name="Ops Author",
            role="OPS_ADMIN",
        )
        access_token = self._login(identifier="ops.author")

        create_response = self.client.post(
            "/messages/workspace/posts",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "conversation_id": "ops-follow-through",
                "body": "Queue note that still needs confirmation.",
            },
        )
        self.assertEqual(create_response.status_code, 201)
        message_id = create_response.json()["message_id"]

        pin_response = self.client.patch(
            f"/messages/workspace/posts/{message_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"pinned": True},
        )
        self.assertEqual(pin_response.status_code, 200)
        self.assertIsNotNone(pin_response.json()["pinned_at"])

        edit_response = self.client.patch(
            f"/messages/workspace/posts/{message_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"body": "Queue note updated with the latest desk confirmation."},
        )
        self.assertEqual(edit_response.status_code, 200)
        self.assertEqual(edit_response.json()["body"], "Queue note updated with the latest desk confirmation.")
        self.assertIsNotNone(edit_response.json()["edited_at"])

        delete_response = self.client.patch(
            f"/messages/workspace/posts/{message_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"deleted": True},
        )
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(delete_response.json()["body"], "")
        self.assertIsNotNone(delete_response.json()["deleted_at"])
        self.assertIsNone(delete_response.json()["pinned_at"])

        reload_response = self.client.get("/messages/workspace")
        self.assertEqual(reload_response.status_code, 200)
        conversation = next(
            item
            for item in reload_response.json()["conversations"]
            if item["conversation_id"] == "ops-follow-through"
        )
        reloaded_message = next(item for item in conversation["timeline"] if item["id"] == message_id)
        self.assertEqual(reloaded_message["body"], [])
        self.assertIsNotNone(reloaded_message["deleted_at"])

    def test_signed_in_user_can_update_message_reactions(self) -> None:
        self._bootstrap_admin()
        self._create_user(
            user_id="ops.reactor",
            email="ops-reactor@example.com",
            display_name="Ops Reactor",
            role="OPS_ADMIN",
        )
        access_token = self._login(identifier="ops.reactor")

        create_response = self.client.post(
            "/messages/workspace/posts",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "conversation_id": "ectrm-assistant",
                "body": "Watching this lane.",
            },
        )
        self.assertEqual(create_response.status_code, 201)
        message_id = create_response.json()["message_id"]

        reaction_response = self.client.patch(
            f"/messages/workspace/posts/{message_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"reactions": ["👍", "👀"]},
        )
        self.assertEqual(reaction_response.status_code, 200)
        self.assertEqual(reaction_response.json()["reactions"], ["👍", "👀"])

        reload_response = self.client.get("/messages/workspace")
        self.assertEqual(reload_response.status_code, 200)
        conversation = next(
            item
            for item in reload_response.json()["conversations"]
            if item["conversation_id"] == "ectrm-assistant"
        )
        reloaded_message = next(item for item in conversation["timeline"] if item["id"] == message_id)
        self.assertEqual(reloaded_message["reactions"], ["👍", "👀"])

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

    def test_slack_settings_report_configured_state_without_exposing_token(self) -> None:
        response = self.client.get("/messages/workspace/slack/settings")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["enabled"])
        self.assertFalse(response.json()["configured"])
        self.assertEqual(response.json()["auth_status"], "none")
        self.assertNotIn("token", response.text.lower())

        settings.SLACK_MESSAGING_ENABLED = True
        settings.SLACK_BOT_TOKEN = "xoxb-test-token"
        settings.SLACK_MESSAGING_CHANNEL_IDS = "C123SLACK"

        configured_response = self.client.get("/messages/workspace/slack/settings")
        self.assertEqual(configured_response.status_code, 200)
        payload = configured_response.json()
        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["auth_status"], "configured")
        self.assertEqual(payload["configured_channel_count"], 1)
        self.assertNotIn("xoxb", configured_response.text)

    def test_slack_sync_imports_messages_as_durable_workspace_conversations(self) -> None:
        access_token = self._bootstrap_admin()
        settings.SLACK_MESSAGING_ENABLED = True
        settings.SLACK_BOT_TOKEN = "xoxb-test-token"
        settings.SLACK_MESSAGING_CHANNEL_IDS = "C123SLACK"

        with patch(
            "apps.api.app.domains.integrations.services.slack_messaging.SlackMessagingClient",
            _FakeSlackClient,
        ):
            response = self.client.post(
                "/messages/workspace/slack/sync",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["synced_channel_count"], 1)
        self.assertEqual(payload["created_conversation_count"], 1)
        self.assertEqual(payload["imported_message_count"], 1)
        self.assertEqual(payload["updated_message_count"], 0)

        reload_response = self.client.get("/messages/workspace")
        self.assertEqual(reload_response.status_code, 200)
        slack_conversation = next(
            item
            for item in reload_response.json()["conversations"]
            if item["conversation_id"] == "slack-C123SLACK"
        )
        self.assertEqual(slack_conversation["source_provider"], "slack")
        self.assertEqual(slack_conversation["label"], "#desk-ops")
        self.assertEqual(slack_conversation["connected_workspace"], "Slack")
        self.assertEqual(slack_conversation["timeline"][-1]["author"]["name"], "Slack Operator")
        self.assertEqual(
            slack_conversation["timeline"][-1]["body"],
            ["Slack note imported into the ECTRM messaging center."],
        )
        self.assertEqual(slack_conversation["timeline"][-1]["reactions"], [":eyes: 2"])

        with patch(
            "apps.api.app.domains.integrations.services.slack_messaging.SlackMessagingClient",
            _FakeSlackClient,
        ):
            second_response = self.client.post(
                "/messages/workspace/slack/sync",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.json()["imported_message_count"], 0)

    def test_slack_post_sends_to_slack_and_persists_the_returned_message_timestamp(self) -> None:
        access_token = self._bootstrap_admin()
        settings.SLACK_MESSAGING_ENABLED = True
        settings.SLACK_BOT_TOKEN = "xoxb-test-token"
        settings.SLACK_MESSAGING_CHANNEL_IDS = "C123SLACK"

        with patch(
            "apps.api.app.domains.integrations.services.slack_messaging.SlackMessagingClient",
            _FakeSlackClient,
        ):
            sync_response = self.client.post(
                "/messages/workspace/slack/sync",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            self.assertEqual(sync_response.status_code, 200)

            post_response = self.client.post(
                "/messages/workspace/slack/posts",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "conversation_id": "slack-C123SLACK",
                    "body": "Posting from ECTRM into Slack.",
                },
            )

        self.assertEqual(post_response.status_code, 201)
        payload = post_response.json()
        self.assertEqual(payload["message_id"], "slack-C123SLACK-1770000060_000200")
        self.assertEqual(payload["conversation_id"], "slack-C123SLACK")
        self.assertEqual(payload["body"], "Posting from ECTRM into Slack.")
        self.assertEqual(payload["author"]["name"], "Messaging Admin")
        self.assertEqual(payload["author"]["presence"], "Posted to Slack")
        self.assertEqual(_FakeSlackClient.posted_messages[-1]["channel_id"], "C123SLACK")
        self.assertEqual(_FakeSlackClient.posted_messages[-1]["text"], "Posting from ECTRM into Slack.")
