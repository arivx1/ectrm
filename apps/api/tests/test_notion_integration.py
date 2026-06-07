from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.domains.integrations.services import notion
from apps.api.app.domains.integrations.services.notion import (
    NotionClient,
    NotionConfig,
    NotionIntegrationError,
)
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


def _response(
    url: str,
    status_code: int,
    payload: dict[str, object],
    *,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return httpx.Response(
        status_code,
        json=payload,
        headers=headers,
        request=httpx.Request("GET", url),
    )


def _notion_user_payload() -> dict[str, object]:
    return {
        "object": "user",
        "id": "user_123",
        "type": "bot",
        "name": "ECTRM Notion",
        "avatar_url": None,
        "bot": {
            "owner": {"type": "workspace", "workspace": True},
            "workspace_name": "Tony's Workspace",
            "workspace_id": "workspace_123",
        },
    }


def _notion_search_payload() -> dict[str, object]:
    return {
        "object": "list",
        "results": [
            {
                "object": "page",
                "id": "page_123",
                "created_time": "2026-06-06T12:00:00Z",
                "last_edited_time": "2026-06-06T12:30:00Z",
                "url": "https://www.notion.so/page-123",
                "parent": {"type": "workspace", "workspace": True},
                "properties": {
                    "title": {
                        "title": [
                            {
                                "type": "text",
                                "plain_text": "Client playbook",
                            }
                        ]
                    }
                },
            }
        ],
        "has_more": False,
        "next_cursor": None,
    }


class _FakeHttpxClient:
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.request_url: str | None = None
        self.request_headers: dict[str, str] = {}
        self.request_method: str | None = None
        self.request_json: dict[str, object] | None = None

    def __enter__(self) -> "_FakeHttpxClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def request(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        self.request_method = method
        self.request_url = url
        headers = kwargs.get("headers")
        self.request_headers = dict(headers) if isinstance(headers, dict) else {}
        json_payload = kwargs.get("json")
        self.request_json = dict(json_payload) if isinstance(json_payload, dict) else None
        return self.response


class _FakeNotionClient:
    def __init__(self, config: NotionConfig) -> None:
        self.config = config

    def get_current_user(self):
        return notion.NotionUserOut(
            id="user_123",
            object="user",
            type="bot",
            name="ECTRM Notion",
            workspace_name="Tony's Workspace",
            workspace_id="workspace_123",
            owner_type="workspace",
        )

    def search(self, *, limit: int) -> dict[str, object]:
        self.limit = limit
        return _notion_search_payload()


class NotionClientTests(unittest.TestCase):
    def test_get_current_user_sends_bearer_token_and_notion_version(self) -> None:
        url = "https://api.notion.com/v1/users/me"
        fake_client = _FakeHttpxClient(_response(url, 200, _notion_user_payload()))
        config = NotionConfig(
            enabled=True,
            access_token="notion-secret",
            base_url="https://api.notion.com/v1",
            api_version="2026-03-11",
            timeout_seconds=20,
            search_limit=10,
        )

        with patch(
            "apps.api.app.domains.integrations.services.notion.httpx.Client",
            return_value=fake_client,
        ):
            user = NotionClient(config).get_current_user()

        self.assertEqual(fake_client.request_method, "GET")
        self.assertEqual(fake_client.request_url, url)
        self.assertEqual(fake_client.request_headers["Authorization"], "Bearer notion-secret")
        self.assertEqual(fake_client.request_headers["Notion-Version"], "2026-03-11")
        self.assertEqual(user.id, "user_123")
        self.assertEqual(user.workspace_name, "Tony's Workspace")

    def test_search_posts_page_size_and_parses_results(self) -> None:
        url = "https://api.notion.com/v1/search"
        fake_client = _FakeHttpxClient(_response(url, 200, _notion_search_payload()))
        config = NotionConfig(
            enabled=True,
            access_token="notion-secret",
            base_url="https://api.notion.com/v1",
            api_version="2026-03-11",
            timeout_seconds=20,
            search_limit=10,
        )

        with patch(
            "apps.api.app.domains.integrations.services.notion.httpx.Client",
            return_value=fake_client,
        ):
            payload = NotionClient(config).search(limit=10)

        self.assertEqual(fake_client.request_method, "POST")
        self.assertEqual(fake_client.request_url, url)
        self.assertEqual(fake_client.request_headers["Content-Type"], "application/json")
        self.assertEqual(fake_client.request_json, {"page_size": 10})
        self.assertEqual(len(payload["results"]), 1)

    def test_search_surfaces_rate_limit_retry_after(self) -> None:
        fake_client = _FakeHttpxClient(
            _response(
                "https://api.notion.com/v1/search",
                429,
                {"message": "rate limited"},
                headers={"Retry-After": "30"},
            )
        )
        config = NotionConfig(
            enabled=True,
            access_token="notion-secret",
            base_url="https://api.notion.com/v1",
            api_version="2026-03-11",
            timeout_seconds=20,
            search_limit=10,
        )

        with patch(
            "apps.api.app.domains.integrations.services.notion.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaises(NotionIntegrationError) as context:
                NotionClient(config).search(limit=10)

        self.assertEqual(context.exception.status_code, 429)
        self.assertIn("Retry after 30", context.exception.detail)


class NotionIntegrationApiTests(unittest.TestCase):
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
            "NOTION_ENABLED": settings.NOTION_ENABLED,
            "NOTION_ACCESS_TOKEN": settings.NOTION_ACCESS_TOKEN,
            "NOTION_API_KEY": settings.NOTION_API_KEY,
            "NOTION_BASE_URL": settings.NOTION_BASE_URL,
            "NOTION_VERSION": settings.NOTION_VERSION,
            "NOTION_TIMEOUT_SECONDS": settings.NOTION_TIMEOUT_SECONDS,
            "NOTION_SEARCH_LIMIT": settings.NOTION_SEARCH_LIMIT,
        }
        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        settings.NOTION_ENABLED = False
        settings.NOTION_ACCESS_TOKEN = ""
        settings.NOTION_API_KEY = ""
        settings.NOTION_BASE_URL = "https://api.notion.com/v1"
        settings.NOTION_VERSION = "2026-03-11"
        settings.NOTION_TIMEOUT_SECONDS = 20
        settings.NOTION_SEARCH_LIMIT = 10

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_settings_report_configuration_without_exposing_token(self) -> None:
        token = self._create_session_token()

        response = self.client.get(
            "/admin/integrations/notion/settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["enabled"])
        self.assertFalse(response.json()["configured"])
        self.assertEqual(response.json()["auth_status"], "none")

        settings.NOTION_ENABLED = True
        settings.NOTION_ACCESS_TOKEN = "secret_notion_token"
        configured_response = self.client.get(
            "/admin/integrations/notion/settings",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(configured_response.status_code, 200)
        payload = configured_response.json()
        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["auth_status"], "configured")
        self.assertEqual(payload["api_version"], "2026-03-11")
        self.assertEqual(payload["required_capabilities"], ["Notion API read/search access"])
        self.assertNotIn("secret_notion_token", configured_response.text)

    def test_connection_test_returns_notion_user_and_search_metadata(self) -> None:
        token = self._create_session_token()
        settings.NOTION_ENABLED = True
        settings.NOTION_ACCESS_TOKEN = "secret_notion_token"

        with patch(
            "apps.api.app.domains.integrations.services.notion.NotionClient",
            _FakeNotionClient,
        ):
            response = self.client.post(
                "/admin/integrations/notion/test-connection",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "connected")
        self.assertEqual(payload["user"]["id"], "user_123")
        self.assertEqual(payload["user"]["workspace_name"], "Tony's Workspace")
        self.assertEqual(payload["accessible_result_count"], 1)
        self.assertEqual(payload["results"][0]["title"], "Client playbook")
        self.assertNotIn("secret_notion_token", response.text)

    def _create_session_token(
        self,
        *,
        user_id: str = "notion_admin",
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
