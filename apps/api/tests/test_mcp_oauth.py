from __future__ import annotations

import base64
import hashlib
import unittest
from concurrent.futures import CancelledError
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import anyio
import httpx
from fastapi.testclient import TestClient
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.core.auth import hash_password
from apps.api.app.domains.mcp.services import clear_mcp_server_cache
from apps.api.app.domains.mcp.services import mount_mcp_http_app


class McpOAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._previous_settings = {
            "MCP_ENABLED": settings.MCP_ENABLED,
            "MCP_AUTH_MODE": settings.MCP_AUTH_MODE,
            "MCP_OAUTH_ISSUER_URL": settings.MCP_OAUTH_ISSUER_URL,
            "MCP_OAUTH_SERVICE_DOCUMENTATION_URL": settings.MCP_OAUTH_SERVICE_DOCUMENTATION_URL,
            "MCP_OAUTH_SIGNING_SECRET": settings.MCP_OAUTH_SIGNING_SECRET,
            "MCP_OAUTH_REQUIRED_SCOPES": settings.MCP_OAUTH_REQUIRED_SCOPES,
            "MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS": settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
            "MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS": settings.MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS,
            "MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS": settings.MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS,
            "SINGLE_USER_AUTH_ENABLED": settings.SINGLE_USER_AUTH_ENABLED,
        }

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

        settings.MCP_ENABLED = True
        settings.MCP_AUTH_MODE = "oauth"
        settings.MCP_OAUTH_ISSUER_URL = "http://127.0.0.1/mcp"
        settings.MCP_OAUTH_SERVICE_DOCUMENTATION_URL = ""
        settings.MCP_OAUTH_SIGNING_SECRET = "test-mcp-oauth-signing-secret"
        settings.MCP_OAUTH_REQUIRED_SCOPES = "mcp:tools"
        settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS = 900
        settings.MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS = 7200
        settings.MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS = 300
        settings.SINGLE_USER_AUTH_ENABLED = False

        clear_mcp_server_cache()
        mount_mcp_http_app(app)
        cls.client_context = TestClient(app, base_url="http://127.0.0.1")
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        settings.MCP_ENABLED = cls._previous_settings["MCP_ENABLED"]
        settings.MCP_AUTH_MODE = cls._previous_settings["MCP_AUTH_MODE"]
        settings.MCP_OAUTH_ISSUER_URL = cls._previous_settings["MCP_OAUTH_ISSUER_URL"]
        settings.MCP_OAUTH_SERVICE_DOCUMENTATION_URL = cls._previous_settings["MCP_OAUTH_SERVICE_DOCUMENTATION_URL"]
        settings.MCP_OAUTH_SIGNING_SECRET = cls._previous_settings["MCP_OAUTH_SIGNING_SECRET"]
        settings.MCP_OAUTH_REQUIRED_SCOPES = cls._previous_settings["MCP_OAUTH_REQUIRED_SCOPES"]
        settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS = cls._previous_settings["MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS"]
        settings.MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS = cls._previous_settings["MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS"]
        settings.MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS = cls._previous_settings["MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS"]
        settings.SINGLE_USER_AUTH_ENABLED = cls._previous_settings["SINGLE_USER_AUTH_ENABLED"]

        try:
            cls.client_context.__exit__(None, None, None)
        except CancelledError:
            pass
        app.state.session_factory = cls.original_session_factory
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            for table in reversed(Base.metadata.sorted_tables):
                session.execute(table.delete())
            session.add(
                UserAccount(
                    user_id="mcp_admin",
                    email="mcp-admin@example.com",
                    display_name="MCP Admin",
                    role="OPS_ADMIN",
                    password_hash=hash_password("supersecret1"),
                    is_active=True,
                    last_login_at=None,
                    created_at=datetime.now(timezone.utc),
                    created_by="test",
                    updated_at=datetime.now(timezone.utc),
                    updated_by="test",
                    version=1,
                )
            )
            session.commit()

    def test_status_route_reports_oauth_runtime(self) -> None:
        response = self.client.get("/mcp-status")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["enabled"])
        self.assertEqual(payload["auth_mode"], "oauth")
        self.assertEqual(payload["oauth_issuer_url"], "http://127.0.0.1/mcp")
        self.assertEqual(payload["required_scopes"], ["mcp:tools"])
        self.assertEqual(payload["login_methods"], ["password"])

    def test_oauth_metadata_and_registration_are_public(self) -> None:
        metadata_response = self.client.get("/mcp/.well-known/oauth-authorization-server")
        self.assertEqual(metadata_response.status_code, 200)
        metadata = metadata_response.json()
        self.assertEqual(metadata["issuer"], "http://127.0.0.1/mcp")
        self.assertIn("authorization_endpoint", metadata)

        register_response = self.client.post(
            "/mcp/register",
            json={
                "redirect_uris": ["http://127.0.0.1/callback"],
                "token_endpoint_auth_method": "none",
                "scope": "mcp:tools",
                "client_name": "ChatGPT Dev Test",
            },
        )
        self.assertEqual(register_response.status_code, 201)
        payload = register_response.json()
        self.assertIn("client_id", payload)
        self.assertEqual(payload["token_endpoint_auth_method"], "none")

    def test_oauth_flow_can_list_tools_over_http(self) -> None:
        client_id = self._register_client()
        verifier = "test-verifier-1234567890"
        challenge = self._pkce_challenge(verifier)

        authorize_response = self.client.get(
            "/mcp/authorize",
            params={
                "response_type": "code",
                "client_id": client_id,
                "redirect_uri": "http://127.0.0.1/callback",
                "scope": "mcp:tools",
                "state": "state-123",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
            follow_redirects=False,
        )
        self.assertEqual(authorize_response.status_code, 302)
        login_url = authorize_response.headers["location"]
        self.assertIn("/mcp/login?flow_id=", login_url)

        login_page = self.client.get(login_url)
        self.assertEqual(login_page.status_code, 200)
        self.assertIn("Authorize ChatGPT access", login_page.text)

        flow_id = parse_qs(urlparse(login_url).query)["flow_id"][0]
        approval_response = self.client.post(
            "/mcp/login",
            data={
                "flow_id": flow_id,
                "identifier": "mcp_admin",
                "password": "supersecret1",
                "decision": "approve",
            },
            follow_redirects=False,
        )
        self.assertEqual(approval_response.status_code, 303)
        callback_url = approval_response.headers["location"]
        callback_query = parse_qs(urlparse(callback_url).query)
        self.assertEqual(callback_query["state"], ["state-123"])
        authorization_code = callback_query["code"][0]

        token_response = self.client.post(
            "/mcp/token",
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "code": authorization_code,
                "code_verifier": verifier,
                "redirect_uri": "http://127.0.0.1/callback",
            },
        )
        self.assertEqual(token_response.status_code, 200)
        token_payload = token_response.json()
        access_token = token_payload["access_token"]
        self.assertTrue(token_payload["refresh_token"])
        self.assertEqual(token_payload["scope"], "mcp:tools")

        whoami_response = self.client.get(
            "/mcp/whoami",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        self.assertEqual(whoami_response.status_code, 200)
        whoami_payload = whoami_response.json()
        self.assertEqual(whoami_payload["user_id"], "mcp_admin")
        self.assertEqual(whoami_payload["role"], "OPS_ADMIN")
        self.assertEqual(whoami_payload["scopes"], ["mcp:tools"])

        async def _run() -> None:
            def _httpx_client_factory(headers=None, timeout=None, auth=None):
                return httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app),
                    base_url="http://127.0.0.1",
                    follow_redirects=True,
                    headers=headers,
                    timeout=timeout or httpx.Timeout(30.0),
                    auth=auth,
                )

            async with streamablehttp_client(
                "http://127.0.0.1/mcp/",
                headers={"Authorization": f"Bearer {access_token}"},
                httpx_client_factory=_httpx_client_factory,
            ) as (read_stream, write_stream, _get_session_id):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    tools_result = await session.list_tools()
                    self.assertEqual({tool.name for tool in tools_result.tools}, {"search", "fetch"})

        anyio.run(_run)

    def _register_client(self) -> str:
        response = self.client.post(
            "/mcp/register",
            json={
                "redirect_uris": ["http://127.0.0.1/callback"],
                "token_endpoint_auth_method": "none",
                "scope": "mcp:tools",
                "client_name": "ChatGPT Dev Test",
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["client_id"]

    def _pkce_challenge(self, verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


if __name__ == "__main__":
    unittest.main()
