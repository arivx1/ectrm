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

from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.messaging_workspace_conversation import MessagingWorkspaceConversation
from apps.api.app.models.messaging_workspace_message import MessagingWorkspaceMessage
from apps.api.app.models.nexus_contact import NexusContact
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.schemas.document import (
    DocumentGmailInboxBrowseResultOut,
    DocumentGmailInboxMessageSummaryOut,
)


class NexusEngagementsApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 6, 7, 17, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(MessagingWorkspaceMessage).delete()
            session.query(MessagingWorkspaceConversation).delete()
            session.query(NexusContact).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        self.headers = {"Authorization": f"Bearer {self._create_session_token()}"}

    def test_client_engagements_combine_gmail_and_slack_mirror_matches(self) -> None:
        self._seed_nexus_contact()
        self._seed_slack_message()
        gmail_result = DocumentGmailInboxBrowseResultOut(
            query="",
            page_size=10,
            messages=[
                DocumentGmailInboxMessageSummaryOut(
                    message_id="gmail-msg-1",
                    thread_id="gmail-thread-1",
                    subject="Hartree Partners nomination window",
                    sender="Jane Scheduler <ops@hartreepartners.com>",
                    received_at=self.now,
                    snippet="Hartree Partners asked whether the nomination window can move.",
                    unread=True,
                    attachment_count=1,
                    pdf_attachment_count=0,
                    imported_pdf_attachment_count=0,
                )
            ],
        )

        with patch(
            "apps.api.app.domains.integrations.services.nexus_engagements.list_gmail_inbox_messages",
            return_value=gmail_result,
        ) as list_gmail_mock:
            response = self.client.post(
                "/integrations/nexus/client-engagements",
                json={
                    "client_name": "Hartree Partners",
                    "domains": ["hartreepartners.com"],
                    "contact_emails": ["scheduler@hartreepartners.com"],
                    "lookback_days": 14,
                    "limit": 10,
                },
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["read_only"])
        self.assertEqual(payload["client_name"], "Hartree Partners")
        self.assertEqual(payload["matched_count"], 2)
        self.assertEqual(payload["returned_count"], 2)
        self.assertEqual(payload["source_counts"], {"gmail": 1, "slack": 1})
        self.assertIn("newer_than:14d", payload["gmail_query"])
        self.assertNotIn('"Hartree Partners"', payload["gmail_query"])
        self.assertIn("hartreepartners.com", payload["gmail_query"])
        self.assertIn("cc:hartreepartners.com", payload["gmail_query"])
        self.assertIn("bcc:hartreepartners.com", payload["gmail_query"])
        self.assertIn("ops@hartreepartners.com", payload["gmail_query"])

        providers = {item["provider"] for item in payload["items"]}
        self.assertEqual(providers, {"gmail", "slack"})
        slack_item = next(item for item in payload["items"] if item["provider"] == "slack")
        self.assertEqual(slack_item["source_surface"], "messages_workspace_mirror")
        self.assertEqual(slack_item["conversation_id"], "slack-C123HARTREE")
        self.assertIn("Hartree Partners", slack_item["snippet"])
        gmail_item = next(item for item in payload["items"] if item["provider"] == "gmail")
        self.assertEqual(gmail_item["source_surface"], "gmail_api")
        self.assertEqual(gmail_item["metadata"]["thread_id"], "gmail-thread-1")

        list_gmail_mock.assert_called_once()
        _, kwargs = list_gmail_mock.call_args
        self.assertEqual(kwargs["page_size"], 10)
        self.assertIsNone(kwargs["page_token"])
        self.assertIsNone(kwargs["label_ids"])

    def test_client_engagements_require_authentication(self) -> None:
        response = self.client.post(
            "/integrations/nexus/client-engagements",
            json={"client_name": "Hartree Partners"},
        )

        self.assertEqual(response.status_code, 401)

    def test_client_engagements_apply_seeded_domain_hints(self) -> None:
        gmail_result = DocumentGmailInboxBrowseResultOut(
            query="",
            page_size=10,
            messages=[],
        )

        with patch(
            "apps.api.app.domains.integrations.services.nexus_engagements.list_gmail_inbox_messages",
            return_value=gmail_result,
        ) as list_gmail_mock:
            response = self.client.post(
                "/integrations/nexus/client-engagements",
                json={"client_name": "International Materials"},
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lookback_days"], 365)
        self.assertIn("newer_than:365d", payload["gmail_query"])
        self.assertNotIn('"International Materials"', payload["gmail_query"])
        self.assertIn("from:imigroup.com", payload["gmail_query"])
        self.assertIn("to:imigroup.com", payload["gmail_query"])
        self.assertIn("cc:imigroup.com", payload["gmail_query"])
        self.assertIn("bcc:imigroup.com", payload["gmail_query"])
        self.assertIn("from:imius.com", payload["gmail_query"])
        self.assertIn("to:imius.com", payload["gmail_query"])
        self.assertIn("cc:imius.com", payload["gmail_query"])
        self.assertIn("bcc:imius.com", payload["gmail_query"])

        list_gmail_mock.assert_called_once()
        _, kwargs = list_gmail_mock.call_args
        self.assertEqual(kwargs["query_override"], payload["gmail_query"])
        self.assertIsNone(kwargs["label_ids"])

    def test_client_engagements_skip_gmail_when_no_participant_identifiers_exist(self) -> None:
        with patch(
            "apps.api.app.domains.integrations.services.nexus_engagements.list_gmail_inbox_messages",
        ) as list_gmail_mock:
            response = self.client.post(
                "/integrations/nexus/client-engagements",
                json={"client_name": "Name Only Client"},
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsNone(payload["gmail_query"])
        self.assertEqual(payload["source_counts"], {})
        self.assertTrue(any("sender/recipient matching" in warning for warning in payload["warnings"]))
        list_gmail_mock.assert_not_called()

    def test_client_engagements_drop_gmail_matches_without_company_participants(self) -> None:
        gmail_result = DocumentGmailInboxBrowseResultOut(
            query="",
            page_size=10,
            messages=[
                DocumentGmailInboxMessageSummaryOut(
                    message_id="gmail-msg-unrelated",
                    thread_id="gmail-thread-unrelated",
                    subject="International Materials attendee note",
                    sender="Rick Rivich <rick@example.com>",
                    received_at=self.now,
                    snippet="I looked through this and do not know many of the attendees.",
                    unread=False,
                    attachment_count=0,
                    pdf_attachment_count=0,
                    imported_pdf_attachment_count=0,
                )
            ],
        )

        with patch(
            "apps.api.app.domains.integrations.services.nexus_engagements.list_gmail_inbox_messages",
            return_value=gmail_result,
        ):
            response = self.client.post(
                "/integrations/nexus/client-engagements",
                json={"client_name": "International Materials"},
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["source_counts"], {})
        self.assertEqual(payload["matched_count"], 0)
        self.assertTrue(any("without a company sender or recipient" in warning for warning in payload["warnings"]))

    def _seed_nexus_contact(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                NexusContact(
                    contact_id="nexus-contact-hartree-ops",
                    client_name="Hartree Partners",
                    name="Hartree Ops",
                    title="Scheduler",
                    email="ops@hartreepartners.com",
                    phone=None,
                    web_url=None,
                    source="manual",
                    external_provider=None,
                    external_record_id=None,
                    created_at=self.now,
                    created_by="test-suite",
                    updated_at=self.now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.commit()

    def _seed_slack_message(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                MessagingWorkspaceConversation(
                    conversation_id="slack-C123HARTREE",
                    section="Channels",
                    kind="channel",
                    label="#hartree-ops",
                    connected_workspace="Slack",
                    assistant_workspace="operations",
                    description="Synced from Slack through the configured Slack Web API connector.",
                    topic="Hartree Partners follow-up and logistics.",
                    composer_hint="Messages sent here post to Slack and are mirrored locally for desk context.",
                    sort_order=50,
                    created_at=self.now,
                    updated_at=self.now,
                )
            )
            session.add(
                MessagingWorkspaceMessage(
                    message_id="slack-C123HARTREE-1770000000_000100",
                    conversation_id="slack-C123HARTREE",
                    item_kind="MESSAGE",
                    source="HUMAN",
                    parent_message_id=None,
                    thread_root_message_id="slack-C123HARTREE-1770000000_000100",
                    body="Hartree Partners asked for a nomination-window update before the close.",
                    system_label=None,
                    system_detail=None,
                    author_name="Slack Operator",
                    author_title="Slack user",
                    author_presence="Synced from Slack",
                    author_initials="SO",
                    author_tone="human",
                    reactions=[":eyes: 2"],
                    attachment_payload=None,
                    assistant_run_id=None,
                    assistant_agent_id=None,
                    assistant_agent_name=None,
                    created_by_user_id=None,
                    created_by_session_id=None,
                    created_by_role=None,
                    edited_at=None,
                    edited_by_user_id=None,
                    edited_by_session_id=None,
                    edited_by_role=None,
                    deleted_at=None,
                    deleted_by_user_id=None,
                    deleted_by_session_id=None,
                    deleted_by_role=None,
                    pinned_at=None,
                    pinned_by_user_id=None,
                    pinned_by_session_id=None,
                    pinned_by_role=None,
                    created_at=self.now,
                )
            )
            session.commit()

    def _create_session_token(
        self,
        *,
        user_id: str = "nexus_engagements_user",
        role: str = "OPS_ADMIN",
    ) -> str:
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


if __name__ == "__main__":
    unittest.main()
