from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.domains.integrations.services.gmail_inbox import list_gmail_inbox_messages
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


def _httpx_json_response(method: str, url: str, status_code: int, payload: dict[str, object]) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        request=httpx.Request(method, url),
        json=payload,
    )


class _FakeHttpxClient:
    def __init__(
        self,
        *,
        get_responses: list[httpx.Response | Exception] | None = None,
        post_responses: list[httpx.Response | Exception] | None = None,
    ) -> None:
        self.get_responses = list(get_responses or [])
        self.post_responses = list(post_responses or [])
        self.get_calls: list[tuple[str, dict[str, object]]] = []
        self.post_calls: list[tuple[str, dict[str, object]]] = []

    def __enter__(self) -> _FakeHttpxClient:
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False

    def get(self, url: str, **kwargs: object) -> httpx.Response:
        self.get_calls.append((url, dict(kwargs)))
        if not self.get_responses:
            raise AssertionError(f"Unexpected GET request for {url}")
        response = self.get_responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def post(self, url: str, **kwargs: object) -> httpx.Response:
        self.post_calls.append((url, dict(kwargs)))
        if not self.post_responses:
            raise AssertionError(f"Unexpected POST request for {url}")
        response = self.post_responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class GmailInboxIntegrationApiTests(unittest.TestCase):
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
            "GMAIL_INBOX_ENABLED": settings.GMAIL_INBOX_ENABLED,
            "GMAIL_INBOX_CLIENT_ID": settings.GMAIL_INBOX_CLIENT_ID,
            "GMAIL_INBOX_CLIENT_SECRET": settings.GMAIL_INBOX_CLIENT_SECRET,
            "GMAIL_INBOX_REFRESH_TOKEN": settings.GMAIL_INBOX_REFRESH_TOKEN,
            "GMAIL_INBOX_ACCOUNT_EMAIL": settings.GMAIL_INBOX_ACCOUNT_EMAIL,
            "GMAIL_INBOX_QUERY": settings.GMAIL_INBOX_QUERY,
            "GMAIL_INBOX_MAX_MESSAGES_PER_IMPORT": settings.GMAIL_INBOX_MAX_MESSAGES_PER_IMPORT,
            "GMAIL_INBOX_TIMEOUT_SECONDS": settings.GMAIL_INBOX_TIMEOUT_SECONDS,
            "GMAIL_INBOX_TOKEN_URL": settings.GMAIL_INBOX_TOKEN_URL,
            "GMAIL_INBOX_API_BASE_URL": settings.GMAIL_INBOX_API_BASE_URL,
        }
        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        settings.GMAIL_INBOX_ENABLED = False
        settings.GMAIL_INBOX_CLIENT_ID = ""
        settings.GMAIL_INBOX_CLIENT_SECRET = ""
        settings.GMAIL_INBOX_REFRESH_TOKEN = ""
        settings.GMAIL_INBOX_ACCOUNT_EMAIL = ""
        settings.GMAIL_INBOX_QUERY = "has:attachment filename:pdf in:inbox"
        settings.GMAIL_INBOX_MAX_MESSAGES_PER_IMPORT = 10
        settings.GMAIL_INBOX_TIMEOUT_SECONDS = 20
        settings.GMAIL_INBOX_TOKEN_URL = "https://oauth2.googleapis.com/token"
        settings.GMAIL_INBOX_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1"

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_admin_settings_report_configuration_without_exposing_secret(self) -> None:
        token = self._create_session_token()

        response = self.client.get(
            "/admin/integrations/gmail/settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["enabled"])
        self.assertFalse(response.json()["configured"])
        self.assertEqual(response.json()["auth_status"], "none")

        self._configure_gmail_inbox()
        configured_response = self.client.get(
            "/admin/integrations/gmail/settings",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(configured_response.status_code, 200)
        payload = configured_response.json()
        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["auth_status"], "configured")
        self.assertEqual(payload["account_email"], "ops-inbox@example.com")
        self.assertEqual(payload["required_scopes"], ["https://www.googleapis.com/auth/gmail.readonly"])
        self.assertNotIn("gmail-refresh-token", configured_response.text)
        self.assertNotIn("gmail-client-secret", configured_response.text)

    def test_admin_connection_test_returns_profile_and_message_metadata(self) -> None:
        token = self._create_session_token()
        self._configure_gmail_inbox()

        fake_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    settings.GMAIL_INBOX_TOKEN_URL,
                    200,
                    {"access_token": "gmail-access-token"},
                )
            ],
            get_responses=[
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/profile",
                    200,
                    {
                        "emailAddress": "ops-inbox@example.com",
                        "messagesTotal": 42,
                        "threadsTotal": 21,
                        "historyId": "98765",
                    },
                ),
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages",
                    200,
                    {
                        "messages": [{"id": "gmail-msg-1", "threadId": "gmail-thread-1"}],
                        "nextPageToken": "next-page-token",
                    },
                ),
            ],
        )

        with patch(
            "apps.api.app.domains.integrations.services.gmail_inbox.httpx.Client",
            return_value=fake_client,
        ):
            response = self.client.post(
                "/admin/integrations/gmail/test-connection",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "connected")
        self.assertEqual(payload["profile_email"], "ops-inbox@example.com")
        self.assertEqual(payload["messages_total"], 42)
        self.assertEqual(payload["threads_total"], 21)
        self.assertEqual(payload["returned_message_count"], 1)
        self.assertEqual(payload["next_page_token"], "next-page-token")
        self.assertNotIn("gmail-refresh-token", response.text)
        self.assertNotIn("gmail-access-token", response.text)
        list_call_params = fake_client.get_calls[1][1]["params"]
        self.assertIn(("labelIds", "INBOX"), list_call_params)

    def test_browse_can_search_all_mail_and_extract_repeated_metadata_headers(self) -> None:
        self._configure_gmail_inbox()
        fake_client = _FakeHttpxClient(
            post_responses=[
                _httpx_json_response(
                    "POST",
                    settings.GMAIL_INBOX_TOKEN_URL,
                    200,
                    {"access_token": "gmail-access-token"},
                )
            ],
            get_responses=[
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages",
                    200,
                    {"messages": [{"id": "gmail-msg-1", "threadId": "gmail-thread-1"}]},
                ),
                _httpx_json_response(
                    "GET",
                    f"{settings.GMAIL_INBOX_API_BASE_URL}/users/me/messages/gmail-msg-1",
                    200,
                    {
                        "id": "gmail-msg-1",
                        "threadId": "gmail-thread-1",
                        "snippet": "Check in about truck bills.",
                        "internalDate": "1780683300000",
                        "labelIds": ["SENT"],
                        "payload": {
                            "headers": [
                                {"name": "Subject", "value": "CommodityAI Check-In"},
                                {"name": "From", "value": "Anthony Rivich <anthony@commodityai.io>"},
                                {"name": "To", "value": "Aakanksha Chawhan <amanisha@imigroup.com>"},
                            ],
                            "parts": [],
                        },
                    },
                ),
            ],
        )

        with patch(
            "apps.api.app.domains.integrations.services.gmail_inbox.httpx.Client",
            return_value=fake_client,
        ):
            with self.SessionLocal() as session:
                result = list_gmail_inbox_messages(
                    session,
                    query_override="to:amanisha@imigroup.com",
                    page_size=1,
                    label_ids=None,
                )

        self.assertEqual(len(result.messages), 1)
        self.assertEqual(result.messages[0].subject, "CommodityAI Check-In")
        self.assertEqual(result.messages[0].sender, "Anthony Rivich <anthony@commodityai.io>")
        self.assertEqual(result.messages[0].to_recipients, "Aakanksha Chawhan <amanisha@imigroup.com>")
        list_call_params = fake_client.get_calls[0][1]["params"]
        detail_call_params = fake_client.get_calls[1][1]["params"]
        self.assertNotIn(("labelIds", "INBOX"), list_call_params)
        self.assertIn(("metadataHeaders", "Subject"), detail_call_params)
        self.assertIn(("metadataHeaders", "From"), detail_call_params)
        self.assertIn(("metadataHeaders", "To"), detail_call_params)
        self.assertNotIn(("metadataHeaders", "Subject,From,To,Cc,Bcc"), detail_call_params)

    def _configure_gmail_inbox(self) -> None:
        settings.GMAIL_INBOX_ENABLED = True
        settings.GMAIL_INBOX_CLIENT_ID = "gmail-client-id"
        settings.GMAIL_INBOX_CLIENT_SECRET = "gmail-client-secret"
        settings.GMAIL_INBOX_REFRESH_TOKEN = "gmail-refresh-token"
        settings.GMAIL_INBOX_ACCOUNT_EMAIL = "ops-inbox@example.com"
        settings.GMAIL_INBOX_QUERY = "has:attachment filename:pdf in:inbox"
        settings.GMAIL_INBOX_MAX_MESSAGES_PER_IMPORT = 10
        settings.GMAIL_INBOX_TIMEOUT_SECONDS = 5

    def _create_session_token(
        self,
        *,
        user_id: str = "gmail_admin",
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
