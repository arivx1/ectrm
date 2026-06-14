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
from apps.api.app.domains.integrations.services.grain import (
    GrainClient,
    GrainConfig,
    GrainIntegrationError,
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


def _grain_recordings_payload() -> dict[str, object]:
    return {
        "cursor": None,
        "recordings": [
            {
                "id": "rec_123",
                "title": "Client call",
                "url": "https://grain.com/share/recording/rec_123",
                "source": "zoom",
                "media_type": "video",
                "start_datetime": "2026-06-06T12:00:00Z",
                "end_datetime": "2026-06-06T12:30:00Z",
                "duration_ms": 1_800_000,
                "participants": [
                    {"name": "Taylor"},
                    {"name": "Morgan"},
                ],
            }
        ],
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


class _FakeGrainClient:
    def __init__(self, config: GrainConfig) -> None:
        self.config = config

    def list_recordings(self) -> dict[str, object]:
        return _grain_recordings_payload()


class GrainClientTests(unittest.TestCase):
    def test_list_recordings_sends_bearer_token_and_public_api_version(self) -> None:
        url = "https://api.grain.com/_/public-api/v2/recordings"
        fake_client = _FakeHttpxClient(_response(url, 200, _grain_recordings_payload()))
        config = GrainConfig(
            enabled=True,
            access_token="grain-secret",
            base_url="https://api.grain.com",
            public_api_version="2025-10-31",
            timeout_seconds=20,
            recording_limit=10,
        )

        with patch(
            "apps.api.app.domains.integrations.services.grain.httpx.Client",
            return_value=fake_client,
        ):
            payload = GrainClient(config).list_recordings()

        self.assertEqual(fake_client.request_method, "POST")
        self.assertEqual(fake_client.request_url, url)
        self.assertEqual(fake_client.request_headers["Authorization"], "Bearer grain-secret")
        self.assertEqual(fake_client.request_headers["Public-Api-Version"], "2025-10-31")
        self.assertEqual(fake_client.request_headers["Content-Type"], "application/json")
        self.assertEqual(fake_client.request_json, {"include": {"participants": True}})
        self.assertEqual(len(payload["recordings"]), 1)

    def test_list_recordings_surfaces_rate_limit_retry_after(self) -> None:
        fake_client = _FakeHttpxClient(
            _response(
                "https://api.grain.com/_/public-api/v2/recordings",
                429,
                {"message": "rate limited"},
                headers={"Retry-After": "30"},
            )
        )
        config = GrainConfig(
            enabled=True,
            access_token="grain-secret",
            base_url="https://api.grain.com",
            public_api_version="2025-10-31",
            timeout_seconds=20,
            recording_limit=10,
        )

        with patch(
            "apps.api.app.domains.integrations.services.grain.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaises(GrainIntegrationError) as context:
                GrainClient(config).list_recordings()

        self.assertEqual(context.exception.status_code, 429)
        self.assertIn("Retry after 30", context.exception.detail)


class GrainIntegrationApiTests(unittest.TestCase):
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
            "GRAIN_ENABLED": settings.GRAIN_ENABLED,
            "GRAIN_ACCESS_TOKEN": settings.GRAIN_ACCESS_TOKEN,
            "GRAIN_API_KEY": settings.GRAIN_API_KEY,
            "GRAIN_BASE_URL": settings.GRAIN_BASE_URL,
            "GRAIN_PUBLIC_API_VERSION": settings.GRAIN_PUBLIC_API_VERSION,
            "GRAIN_TIMEOUT_SECONDS": settings.GRAIN_TIMEOUT_SECONDS,
            "GRAIN_RECORDING_LIMIT": settings.GRAIN_RECORDING_LIMIT,
        }
        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        settings.GRAIN_ENABLED = False
        settings.GRAIN_ACCESS_TOKEN = ""
        settings.GRAIN_API_KEY = ""
        settings.GRAIN_BASE_URL = "https://api.grain.com"
        settings.GRAIN_PUBLIC_API_VERSION = "2025-10-31"
        settings.GRAIN_TIMEOUT_SECONDS = 20
        settings.GRAIN_RECORDING_LIMIT = 10

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_settings_report_configuration_without_exposing_token(self) -> None:
        token = self._create_session_token()

        response = self.client.get(
            "/admin/integrations/grain/settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["enabled"])
        self.assertFalse(response.json()["configured"])
        self.assertEqual(response.json()["auth_status"], "none")

        settings.GRAIN_ENABLED = True
        settings.GRAIN_ACCESS_TOKEN = "secret_grain_token"
        configured_response = self.client.get(
            "/admin/integrations/grain/settings",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(configured_response.status_code, 200)
        payload = configured_response.json()
        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["auth_status"], "configured")
        self.assertEqual(payload["public_api_version"], "2025-10-31")
        self.assertEqual(payload["required_capabilities"], ["Grain recordings read access"])
        self.assertNotIn("secret_grain_token", configured_response.text)

    def test_connection_test_returns_recording_metadata(self) -> None:
        token = self._create_session_token()
        settings.GRAIN_ENABLED = True
        settings.GRAIN_ACCESS_TOKEN = "secret_grain_token"

        with patch(
            "apps.api.app.domains.integrations.services.grain.GrainClient",
            _FakeGrainClient,
        ):
            response = self.client.post(
                "/admin/integrations/grain/test-connection",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "connected")
        self.assertEqual(payload["recording_count"], 1)
        self.assertEqual(payload["recordings"][0]["title"], "Client call")
        self.assertEqual(payload["recordings"][0]["duration_seconds"], 1800.0)
        self.assertEqual(payload["recordings"][0]["participant_count"], 2)
        self.assertNotIn("secret_grain_token", response.text)

    def test_client_recordings_filters_recordings_for_client(self) -> None:
        token = self._create_session_token()
        settings.GRAIN_ENABLED = True
        settings.GRAIN_ACCESS_TOKEN = "secret_grain_token"

        class _ClientRecordingsGrainClient:
            def __init__(self, config: GrainConfig) -> None:
                self.config = config

            def list_recordings(self) -> dict[str, object]:
                return {
                    "cursor": None,
                    "recordings": [
                        {
                            "id": "rec_hartree",
                            "title": "Hartree weekly call",
                            "url": "https://grain.com/share/recording/rec_hartree",
                            "source": "zoom",
                            "media_type": "video",
                            "start_datetime": "2026-06-06T12:00:00Z",
                            "duration_ms": 900_000,
                            "participants": [{"name": "Alex Hartree"}],
                        },
                        {
                            "id": "rec_cargill",
                            "title": "Cargill logistics call",
                            "participants": [{"name": "Morgan"}],
                        },
                    ],
                }

        with patch(
            "apps.api.app.domains.integrations.services.grain.GrainClient",
            _ClientRecordingsGrainClient,
        ):
            response = self.client.post(
                "/integrations/grain/client-recordings",
                json={"client_name": "Hartree"},
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["client_name"], "Hartree")
        self.assertTrue(payload["matched"])
        self.assertEqual(payload["recording_count"], 1)
        self.assertEqual(payload["recordings"][0]["id"], "rec_hartree")
        self.assertEqual(payload["recordings"][0]["duration_seconds"], 900.0)
        self.assertNotIn("secret_grain_token", response.text)

    def _create_session_token(
        self,
        *,
        user_id: str = "grain_admin",
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
