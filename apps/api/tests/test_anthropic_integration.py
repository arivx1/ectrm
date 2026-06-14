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
from apps.api.app.domains.integrations.services import anthropic
from apps.api.app.domains.integrations.services.anthropic import (
    AnthropicAdminClient,
    AnthropicAdminConfig,
    AnthropicIntegrationError,
)
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


def _api_key_payload(*, status: str = "active") -> dict[str, object]:
    return {
        "id": "apikey_01Rj2N8SVvo6BePZj99NhmiT",
        "created_at": "2024-10-30T23:58:27.427722Z",
        "created_by": {
            "id": "user_01WCz1FkmYMm4gnmykNKUu3Q",
            "type": "user",
        },
        "expires_at": None,
        "name": "Developer Key",
        "partial_key_hint": "sk-ant-api03-R2D...igAA",
        "status": status,
        "type": "api_key",
        "workspace_id": "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ",
    }


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


class _FakeHttpxClient:
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.request_url: str | None = None
        self.request_headers: dict[str, str] = {}

    def __enter__(self) -> "_FakeHttpxClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def get(self, url: str, **kwargs: object) -> httpx.Response:
        self.request_url = url
        headers = kwargs.get("headers")
        self.request_headers = dict(headers) if isinstance(headers, dict) else {}
        return self.response


class _FakeAnthropicAdminClient:
    def __init__(self, config: AnthropicAdminConfig) -> None:
        self.config = config

    def get_api_key(self, api_key_id: str):
        self.api_key_id = api_key_id
        return anthropic.AnthropicAPIKeyOut.model_validate(_api_key_payload())


class AnthropicAdminClientTests(unittest.TestCase):
    def test_get_api_key_sends_admin_headers_and_parses_metadata(self) -> None:
        api_key_id = "apikey_01Rj2N8SVvo6BePZj99NhmiT"
        url = f"https://api.anthropic.com/v1/organizations/api_keys/{api_key_id}"
        fake_client = _FakeHttpxClient(_response(url, 200, _api_key_payload()))
        config = AnthropicAdminConfig(
            enabled=True,
            admin_api_key="sk-ant-admin-secret",
            api_key_id=api_key_id,
            base_url="https://api.anthropic.com",
            api_version="2023-06-01",
            timeout_seconds=20,
        )

        with patch(
            "apps.api.app.domains.integrations.services.anthropic.httpx.Client",
            return_value=fake_client,
        ):
            api_key = AnthropicAdminClient(config).get_api_key(api_key_id)

        self.assertEqual(fake_client.request_url, url)
        self.assertEqual(fake_client.request_headers["anthropic-version"], "2023-06-01")
        self.assertEqual(fake_client.request_headers["X-Api-Key"], "sk-ant-admin-secret")
        self.assertEqual(api_key.id, api_key_id)
        self.assertEqual(api_key.status, "active")
        self.assertEqual(api_key.partial_key_hint, "sk-ant-api03-R2D...igAA")
        self.assertEqual(api_key.created_by.id, "user_01WCz1FkmYMm4gnmykNKUu3Q")

    def test_get_api_key_surfaces_rate_limit_retry_after(self) -> None:
        fake_client = _FakeHttpxClient(
            _response(
                "https://api.anthropic.com/v1/organizations/api_keys/apikey_123",
                429,
                {"error": {"message": "rate limited"}},
                headers={"Retry-After": "60"},
            )
        )
        config = AnthropicAdminConfig(
            enabled=True,
            admin_api_key="sk-ant-admin-secret",
            api_key_id="apikey_123",
            base_url="https://api.anthropic.com",
            api_version="2023-06-01",
            timeout_seconds=20,
        )

        with patch(
            "apps.api.app.domains.integrations.services.anthropic.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaises(AnthropicIntegrationError) as context:
                AnthropicAdminClient(config).get_api_key("apikey_123")

        self.assertEqual(context.exception.status_code, 429)
        self.assertIn("Retry after 60", context.exception.detail)


class AnthropicIntegrationApiTests(unittest.TestCase):
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
            "ANTHROPIC_ADMIN_ENABLED": settings.ANTHROPIC_ADMIN_ENABLED,
            "ANTHROPIC_ADMIN_API_KEY": settings.ANTHROPIC_ADMIN_API_KEY,
            "ANTHROPIC_ADMIN_API_KEY_ID": settings.ANTHROPIC_ADMIN_API_KEY_ID,
            "ANTHROPIC_ADMIN_BASE_URL": settings.ANTHROPIC_ADMIN_BASE_URL,
            "ANTHROPIC_ADMIN_API_VERSION": settings.ANTHROPIC_ADMIN_API_VERSION,
            "ANTHROPIC_ADMIN_TIMEOUT_SECONDS": settings.ANTHROPIC_ADMIN_TIMEOUT_SECONDS,
        }
        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        settings.ANTHROPIC_ADMIN_ENABLED = False
        settings.ANTHROPIC_ADMIN_API_KEY = ""
        settings.ANTHROPIC_ADMIN_API_KEY_ID = ""
        settings.ANTHROPIC_ADMIN_BASE_URL = "https://api.anthropic.com"
        settings.ANTHROPIC_ADMIN_API_VERSION = "2023-06-01"
        settings.ANTHROPIC_ADMIN_TIMEOUT_SECONDS = 20

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_settings_report_configuration_without_exposing_admin_key(self) -> None:
        token = self._create_session_token()

        response = self.client.get(
            "/admin/integrations/anthropic/settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["enabled"])
        self.assertFalse(response.json()["configured"])
        self.assertEqual(response.json()["auth_status"], "none")

        settings.ANTHROPIC_ADMIN_ENABLED = True
        settings.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-secret"
        settings.ANTHROPIC_ADMIN_API_KEY_ID = "apikey_01Rj2N8SVvo6BePZj99NhmiT"
        configured_response = self.client.get(
            "/admin/integrations/anthropic/settings",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(configured_response.status_code, 200)
        payload = configured_response.json()
        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["auth_status"], "configured")
        self.assertEqual(payload["tracked_api_key_id"], "apikey_01Rj2N8SVvo6BePZj99NhmiT")
        self.assertNotIn("sk-ant-admin-secret", configured_response.text)

    def test_get_configured_api_key_returns_anthropic_key_metadata(self) -> None:
        token = self._create_session_token()
        settings.ANTHROPIC_ADMIN_ENABLED = True
        settings.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-secret"
        settings.ANTHROPIC_ADMIN_API_KEY_ID = "apikey_01Rj2N8SVvo6BePZj99NhmiT"

        with patch(
            "apps.api.app.domains.integrations.services.anthropic.AnthropicAdminClient",
            _FakeAnthropicAdminClient,
        ):
            response = self.client.get(
                "/admin/integrations/anthropic/api-key",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "connected")
        self.assertEqual(payload["api_key"]["id"], "apikey_01Rj2N8SVvo6BePZj99NhmiT")
        self.assertEqual(payload["api_key"]["created_by"]["type"], "user")
        self.assertEqual(payload["api_key"]["partial_key_hint"], "sk-ant-api03-R2D...igAA")
        self.assertNotIn("sk-ant-admin-secret", response.text)

    def _create_session_token(
        self,
        *,
        user_id: str = "anthropic_admin",
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
