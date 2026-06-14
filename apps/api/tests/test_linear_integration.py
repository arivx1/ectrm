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
from apps.api.app.domains.integrations.services.linear import (
    LinearClient,
    LinearConfig,
    LinearIntegrationError,
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
        request=httpx.Request("POST", url),
    )


def _linear_issue_payload(identifier: str = "NEX-42") -> dict[str, object]:
    return {
        "id": "issue_123",
        "identifier": identifier,
        "title": "Hartree risk workflow follow-up",
        "url": "https://linear.app/nexus/issue/NEX-42/hartree-risk-workflow-follow-up",
        "description": "Follow up with Hartree on risk workflow rollout.",
        "priority": 2,
        "priorityLabel": "High",
        "createdAt": "2026-06-05T12:00:00Z",
        "updatedAt": "2026-06-06T13:00:00Z",
        "dueDate": "2026-06-15",
        "assignee": {
            "name": "Morgan Ops",
            "email": "morgan@example.com",
        },
        "team": {
            "key": "NEX",
            "name": "Nexus",
        },
        "state": {
            "name": "In Progress",
            "type": "started",
        },
        "project": {
            "name": "Client Integrations",
            "url": "https://linear.app/nexus/project/client-integrations",
        },
        "labels": {
            "nodes": [
                {"name": "client"},
                {"name": "hartree"},
            ],
        },
    }


def _linear_issues_payload() -> dict[str, object]:
    return {
        "data": {
            "issues": {
                "nodes": [_linear_issue_payload()],
            },
        },
    }


class _FakeHttpxClient:
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.request_url: str | None = None
        self.request_headers: dict[str, str] = {}
        self.request_json: dict[str, object] | None = None

    def __enter__(self) -> "_FakeHttpxClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def post(self, url: str, **kwargs: object) -> httpx.Response:
        self.request_url = url
        headers = kwargs.get("headers")
        self.request_headers = dict(headers) if isinstance(headers, dict) else {}
        json_payload = kwargs.get("json")
        self.request_json = dict(json_payload) if isinstance(json_payload, dict) else None
        return self.response


class _FakeLinearClient:
    def __init__(self, config: LinearConfig) -> None:
        self.config = config

    def list_recent_issues(self, *, limit: int) -> dict[str, object]:
        return _linear_issues_payload()

    def search_client_issues(self, *, client_name: str, limit: int) -> dict[str, object]:
        return _linear_issues_payload()


class LinearClientTests(unittest.TestCase):
    def test_search_client_issues_sends_api_key_and_graphql_variables(self) -> None:
        url = "https://api.linear.app/graphql"
        fake_client = _FakeHttpxClient(_response(url, 200, _linear_issues_payload()))
        config = LinearConfig(
            enabled=True,
            api_key="lin_secret",
            access_token="",
            graphql_url=url,
            timeout_seconds=20,
            issue_limit=25,
        )

        with patch(
            "apps.api.app.domains.integrations.services.linear.httpx.Client",
            return_value=fake_client,
        ):
            payload = LinearClient(config).search_client_issues(client_name="Hartree", limit=25)

        self.assertEqual(fake_client.request_url, url)
        self.assertEqual(fake_client.request_headers["Authorization"], "lin_secret")
        self.assertEqual(fake_client.request_headers["Content-Type"], "application/json")
        self.assertIsNotNone(fake_client.request_json)
        assert fake_client.request_json is not None
        self.assertEqual(fake_client.request_json["variables"], {"query": "Hartree", "first": 25})
        self.assertIn("containsIgnoreCase", str(fake_client.request_json["query"]))
        self.assertEqual(len(payload["data"]["issues"]["nodes"]), 1)  # type: ignore[index]

    def test_search_client_issues_prefers_bearer_access_token(self) -> None:
        url = "https://api.linear.app/graphql"
        fake_client = _FakeHttpxClient(_response(url, 200, _linear_issues_payload()))
        config = LinearConfig(
            enabled=True,
            api_key="lin_secret",
            access_token="oauth_secret",
            graphql_url=url,
            timeout_seconds=20,
            issue_limit=25,
        )

        with patch(
            "apps.api.app.domains.integrations.services.linear.httpx.Client",
            return_value=fake_client,
        ):
            LinearClient(config).search_client_issues(client_name="Hartree", limit=25)

        self.assertEqual(fake_client.request_headers["Authorization"], "Bearer oauth_secret")

    def test_search_client_issues_surfaces_rate_limit_retry_after(self) -> None:
        fake_client = _FakeHttpxClient(
            _response(
                "https://api.linear.app/graphql",
                429,
                {"errors": [{"message": "rate limited"}]},
                headers={"Retry-After": "30"},
            )
        )
        config = LinearConfig(
            enabled=True,
            api_key="lin_secret",
            access_token="",
            graphql_url="https://api.linear.app/graphql",
            timeout_seconds=20,
            issue_limit=25,
        )

        with patch(
            "apps.api.app.domains.integrations.services.linear.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaises(LinearIntegrationError) as context:
                LinearClient(config).search_client_issues(client_name="Hartree", limit=25)

        self.assertEqual(context.exception.status_code, 429)
        self.assertIn("Retry after 30", context.exception.detail)


class LinearIntegrationApiTests(unittest.TestCase):
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
            "LINEAR_ENABLED": settings.LINEAR_ENABLED,
            "LINEAR_API_KEY": settings.LINEAR_API_KEY,
            "LINEAR_ACCESS_TOKEN": settings.LINEAR_ACCESS_TOKEN,
            "LINEAR_GRAPHQL_URL": settings.LINEAR_GRAPHQL_URL,
            "LINEAR_TIMEOUT_SECONDS": settings.LINEAR_TIMEOUT_SECONDS,
            "LINEAR_ISSUE_LIMIT": settings.LINEAR_ISSUE_LIMIT,
        }
        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        settings.LINEAR_ENABLED = False
        settings.LINEAR_API_KEY = ""
        settings.LINEAR_ACCESS_TOKEN = ""
        settings.LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"
        settings.LINEAR_TIMEOUT_SECONDS = 20
        settings.LINEAR_ISSUE_LIMIT = 25

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_settings_report_configuration_without_exposing_secret(self) -> None:
        token = self._create_session_token()

        response = self.client.get(
            "/admin/integrations/linear/settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["enabled"])
        self.assertFalse(response.json()["configured"])
        self.assertEqual(response.json()["auth_status"], "none")

        settings.LINEAR_ENABLED = True
        settings.LINEAR_API_KEY = "lin_secret"
        configured_response = self.client.get(
            "/admin/integrations/linear/settings",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(configured_response.status_code, 200)
        payload = configured_response.json()
        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["auth_status"], "configured")
        self.assertEqual(payload["graphql_url"], "https://api.linear.app/graphql")
        self.assertEqual(payload["required_capabilities"], ["Linear issue read access"])
        self.assertNotIn("lin_secret", configured_response.text)

    def test_connection_test_returns_issue_metadata(self) -> None:
        token = self._create_session_token()
        settings.LINEAR_ENABLED = True
        settings.LINEAR_API_KEY = "lin_secret"

        with patch(
            "apps.api.app.domains.integrations.services.linear.LinearClient",
            _FakeLinearClient,
        ):
            response = self.client.post(
                "/admin/integrations/linear/test-connection",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "connected")
        self.assertEqual(payload["issue_count"], 1)
        self.assertEqual(payload["issues"][0]["identifier"], "NEX-42")
        self.assertEqual(payload["issues"][0]["priority_label"], "High")
        self.assertEqual(payload["issues"][0]["state_name"], "In Progress")
        self.assertEqual(payload["issues"][0]["label_names"], ["client", "hartree"])
        self.assertNotIn("lin_secret", response.text)

    def test_client_issues_returns_client_matches(self) -> None:
        token = self._create_session_token()
        settings.LINEAR_ENABLED = True
        settings.LINEAR_API_KEY = "lin_secret"

        with patch(
            "apps.api.app.domains.integrations.services.linear.LinearClient",
            _FakeLinearClient,
        ):
            response = self.client.post(
                "/integrations/linear/client-issues",
                json={"client_name": "Hartree"},
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["client_name"], "Hartree")
        self.assertEqual(payload["query"], "Hartree")
        self.assertTrue(payload["matched"])
        self.assertEqual(payload["issue_count"], 1)
        self.assertEqual(payload["returned_issue_count"], 1)
        self.assertEqual(payload["issues"][0]["title"], "Hartree risk workflow follow-up")
        self.assertEqual(payload["issues"][0]["assignee_name"], "Morgan Ops")
        self.assertNotIn("lin_secret", response.text)

    def _create_session_token(
        self,
        *,
        user_id: str = "linear_admin",
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
