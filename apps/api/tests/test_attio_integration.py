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
from apps.api.app.domains.integrations.services import attio
from apps.api.app.domains.integrations.services.attio import (
    AttioClient,
    AttioConfig,
    AttioIntegrationError,
)
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.schemas.integration import AttioClientEnrichmentOut, AttioClientMatchedRecordOut


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
        self.request_method: str | None = None
        self.request_json: dict[str, object] | None = None

    def __enter__(self) -> "_FakeHttpxClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def get(self, url: str, **kwargs: object) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def request(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        self.request_method = method
        self.request_url = url
        headers = kwargs.get("headers")
        self.request_headers = dict(headers) if isinstance(headers, dict) else {}
        json_payload = kwargs.get("json")
        self.request_json = dict(json_payload) if isinstance(json_payload, dict) else None
        return self.response


class _FakeAttioClient:
    def __init__(self, config: AttioConfig) -> None:
        self.config = config

    def list_objects(self):
        return [
            attio.AttioObjectSummaryOut(
                api_slug="people",
                singular_noun="Person",
                plural_noun="People",
                workspace_id="workspace-123",
                object_id="object-people",
                created_at="2022-11-21T13:22:49.061281000Z",
            )
        ]


def _record(record_id: str, values: dict[str, object], *, web_url: str | None = None) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": {
            "workspace_id": "workspace-123",
            "object_id": "object-123",
            "record_id": record_id,
        },
        "values": values,
    }
    if web_url:
        payload["web_url"] = web_url
    return payload


class _FakeAttioEnrichmentClient:
    def __init__(self, *, exact_company_match: bool = True) -> None:
        self.exact_company_match = exact_company_match
        self.query_payloads: list[tuple[str, dict[str, object]]] = []
        self.search_queries: list[str] = []
        self.loaded_record_ids: list[str] = []

    def query_records(self, object_slug: str, payload: dict[str, object]) -> list[dict[str, object]]:
        self.query_payloads.append((object_slug, payload))
        if object_slug == "companies":
            if not self.exact_company_match:
                return []
            return [self._company_record()]
        if object_slug == "people":
            return [
                _record(
                    "person-123",
                    {
                        "name": [{"full_name": "Jane Hartree"}],
                        "job_title": [{"value": "VP Trading"}],
                        "email_addresses": [{"email_address": "jane@example.com"}],
                        "phone_numbers": [{"phone_number": "+1 555 0100"}],
                    },
                    web_url="https://app.attio.com/person-123",
                )
            ]
        if object_slug == "deals":
            return [
                _record(
                    "deal-123",
                    {
                        "name": [{"value": "Hartree Partners (Expansion)"}],
                        "stage": [{"status": {"title": "Won"}}],
                        "close_date": [{"value": "2025-05-20"}],
                    },
                    web_url="https://app.attio.com/deal-123",
                )
            ]
        return []

    def search_records(self, *, query: str, objects: list[str], limit: int = 5) -> list[dict[str, object]]:
        self.search_queries.append(query)
        return [
            {
                "id": {
                    "workspace_id": "workspace-123",
                    "object_id": "object-company",
                    "record_id": "company-123",
                },
                "object_slug": "companies",
                "record_text": "Hartree Partners",
            }
        ]

    def get_record(self, object_slug: str, record_id: str) -> dict[str, object]:
        self.loaded_record_ids.append(record_id)
        return self._company_record()

    def _company_record(self) -> dict[str, object]:
        return _record(
            "company-123",
            {
                "name": [{"value": "Hartree Partners"}],
                "domains": [{"domain": "hartreepartners.com"}],
                "description": [{"value": "Global energy and commodities firm."}],
                "customer_status_1746239259": [{"status": {"title": "Customer"}}],
            },
            web_url="https://app.attio.com/company-123",
        )


class AttioClientTests(unittest.TestCase):
    def test_list_objects_sends_bearer_token_and_parses_metadata(self) -> None:
        url = "https://api.attio.com/v2/objects"
        fake_client = _FakeHttpxClient(
            _response(
                url,
                200,
                {
                    "data": [
                        {
                            "id": {
                                "workspace_id": "workspace-123",
                                "object_id": "object-people",
                            },
                            "api_slug": "people",
                            "singular_noun": "Person",
                            "plural_noun": "People",
                            "created_at": "2022-11-21T13:22:49.061281000Z",
                        }
                    ]
                },
            )
        )
        config = AttioConfig(
            enabled=True,
            access_token="attio-test-token",
            base_url="https://api.attio.com/v2",
            timeout_seconds=20,
            object_limit=25,
        )

        with patch(
            "apps.api.app.domains.integrations.services.attio.httpx.Client",
            return_value=fake_client,
        ):
            objects = AttioClient(config).list_objects()

        self.assertEqual(fake_client.request_url, url)
        self.assertEqual(fake_client.request_method, "GET")
        self.assertEqual(fake_client.request_headers["Authorization"], "Bearer attio-test-token")
        self.assertEqual(objects[0].api_slug, "people")
        self.assertEqual(objects[0].workspace_id, "workspace-123")

    def test_list_objects_surfaces_rate_limit_retry_after(self) -> None:
        fake_client = _FakeHttpxClient(
            _response(
                "https://api.attio.com/v2/objects",
                429,
                {"message": "rate limited"},
                headers={"Retry-After": "Tue, 23 May 2023 14:42:01 GMT"},
            )
        )
        config = AttioConfig(
            enabled=True,
            access_token="attio-test-token",
            base_url="https://api.attio.com/v2",
            timeout_seconds=20,
            object_limit=25,
        )

        with patch(
            "apps.api.app.domains.integrations.services.attio.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaises(AttioIntegrationError) as context:
                AttioClient(config).list_objects()

        self.assertEqual(context.exception.status_code, 429)
        self.assertIn("Retry after Tue, 23 May 2023 14:42:01 GMT", context.exception.detail)


class AttioClientEnrichmentTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_settings = {
            "ATTIO_ENABLED": settings.ATTIO_ENABLED,
            "ATTIO_ACCESS_TOKEN": settings.ATTIO_ACCESS_TOKEN,
            "ATTIO_API_KEY": settings.ATTIO_API_KEY,
            "ATTIO_BASE_URL": settings.ATTIO_BASE_URL,
            "ATTIO_TIMEOUT_SECONDS": settings.ATTIO_TIMEOUT_SECONDS,
            "ATTIO_OBJECT_LIMIT": settings.ATTIO_OBJECT_LIMIT,
        }
        settings.ATTIO_ENABLED = True
        settings.ATTIO_ACCESS_TOKEN = "attio-secret-token"
        settings.ATTIO_API_KEY = ""
        settings.ATTIO_BASE_URL = "https://api.attio.com/v2"
        settings.ATTIO_TIMEOUT_SECONDS = 20
        settings.ATTIO_OBJECT_LIMIT = 25

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_enrichment_uses_exact_company_match_and_related_records(self) -> None:
        fake_client = _FakeAttioEnrichmentClient()

        result = attio.build_attio_client_enrichment(client_name=" Hartree ", client=fake_client)  # type: ignore[arg-type]

        self.assertTrue(result.matched)
        self.assertEqual(result.match_basis, "exact_name")
        self.assertEqual(result.company.label if result.company else None, "Hartree Partners")
        self.assertEqual(result.company.domains if result.company else [], ["hartreepartners.com"])
        self.assertEqual(result.company.description if result.company else None, "Global energy and commodities firm.")
        self.assertEqual(result.company.status if result.company else None, "Customer")
        self.assertEqual(result.contacts[0].name, "Jane Hartree")
        self.assertEqual(result.contacts[0].title, "VP Trading")
        self.assertEqual(result.contacts[0].email, "jane@example.com")
        self.assertEqual(result.deals[0].name, "Hartree Partners (Expansion)")
        self.assertEqual(result.deals[0].stage, "Won")
        self.assertEqual(result.deals[0].close_date, "2025-05-20")
        self.assertIn(("companies", {"filter": {"name": "Hartree"}, "limit": 5, "offset": 0}), fake_client.query_payloads)

    def test_enrichment_falls_back_to_attio_search(self) -> None:
        fake_client = _FakeAttioEnrichmentClient(exact_company_match=False)

        result = attio.build_attio_client_enrichment(client_name="Hartree", client=fake_client)  # type: ignore[arg-type]

        self.assertTrue(result.matched)
        self.assertEqual(result.match_basis, "search")
        self.assertEqual(fake_client.search_queries, ["Hartree"])
        self.assertEqual(fake_client.loaded_record_ids, ["company-123"])

    def test_enrichment_returns_unmatched_payload_without_related_queries(self) -> None:
        class EmptyFakeClient(_FakeAttioEnrichmentClient):
            def search_records(self, *, query: str, objects: list[str], limit: int = 5) -> list[dict[str, object]]:
                return []

        fake_client = EmptyFakeClient(exact_company_match=False)

        result = attio.build_attio_client_enrichment(client_name="Unknown Client", client=fake_client)  # type: ignore[arg-type]

        self.assertFalse(result.matched)
        self.assertEqual(result.match_basis, "none")
        self.assertIsNone(result.company)
        self.assertEqual(result.contacts, [])
        self.assertEqual(result.deals, [])


class AttioIntegrationApiTests(unittest.TestCase):
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
            "ATTIO_ENABLED": settings.ATTIO_ENABLED,
            "ATTIO_ACCESS_TOKEN": settings.ATTIO_ACCESS_TOKEN,
            "ATTIO_API_KEY": settings.ATTIO_API_KEY,
            "ATTIO_BASE_URL": settings.ATTIO_BASE_URL,
            "ATTIO_TIMEOUT_SECONDS": settings.ATTIO_TIMEOUT_SECONDS,
            "ATTIO_OBJECT_LIMIT": settings.ATTIO_OBJECT_LIMIT,
        }
        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        settings.ATTIO_ENABLED = False
        settings.ATTIO_ACCESS_TOKEN = ""
        settings.ATTIO_API_KEY = ""
        settings.ATTIO_BASE_URL = "https://api.attio.com/v2"
        settings.ATTIO_TIMEOUT_SECONDS = 20
        settings.ATTIO_OBJECT_LIMIT = 25

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_settings_report_configuration_without_exposing_token(self) -> None:
        token = self._create_session_token()

        response = self.client.get(
            "/admin/integrations/attio/settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["enabled"])
        self.assertFalse(response.json()["configured"])
        self.assertEqual(response.json()["auth_status"], "none")

        settings.ATTIO_ENABLED = True
        settings.ATTIO_ACCESS_TOKEN = "attio-secret-token"
        configured_response = self.client.get(
            "/admin/integrations/attio/settings",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(configured_response.status_code, 200)
        payload = configured_response.json()
        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["auth_status"], "configured")
        self.assertEqual(payload["required_scopes"], ["object_configuration:read", "record_permission:read"])
        self.assertNotIn("attio-secret-token", configured_response.text)

    def test_connection_test_returns_attio_object_metadata(self) -> None:
        token = self._create_session_token()
        settings.ATTIO_ENABLED = True
        settings.ATTIO_ACCESS_TOKEN = "attio-secret-token"

        with patch(
            "apps.api.app.domains.integrations.services.attio.AttioClient",
            _FakeAttioClient,
        ):
            response = self.client.post(
                "/admin/integrations/attio/test-connection",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "connected")
        self.assertEqual(payload["workspace_id"], "workspace-123")
        self.assertEqual(payload["object_count"], 1)
        self.assertEqual(payload["objects"][0]["api_slug"], "people")
        self.assertNotIn("attio-secret-token", response.text)

    def test_client_enrichment_route_returns_read_only_attio_payload(self) -> None:
        token = self._create_session_token()

        with patch(
            "apps.api.app.routes.integrations.build_attio_client_enrichment",
            return_value=AttioClientEnrichmentOut(
                client_name="Hartree",
                matched=True,
                match_basis="search",
                company=AttioClientMatchedRecordOut(
                    record_id="company-123",
                    label="Hartree Partners",
                    domains=["hartreepartners.com"],
                    description="Global energy and commodities firm.",
                    web_url="https://app.attio.com/company-123",
                ),
                required_scopes=["object_configuration:read", "record_permission:read"],
            ),
        ):
            response = self.client.post(
                "/integrations/attio/client-enrichment",
                json={"client_name": "Hartree"},
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["matched"])
        self.assertEqual(payload["match_basis"], "search")
        self.assertEqual(payload["company"]["label"], "Hartree Partners")
        self.assertEqual(payload["company"]["domains"], ["hartreepartners.com"])

    def _create_session_token(
        self,
        *,
        user_id: str = "attio_admin",
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
