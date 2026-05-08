from __future__ import annotations

import json
import unittest

import anyio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp.shared.memory import create_connected_server_and_client_session

from apps.api.app.config import settings
from apps.api.app.domains.http import include_http_routers
from apps.api.app.domains.mcp.services import MCP_MOUNT_PATH
from apps.api.app.domains.mcp.services import build_mcp_server
from apps.api.app.domains.mcp.services import clear_mcp_server_cache
from apps.api.app.domains.mcp.services import get_mcp_lowlevel_server
from apps.api.app.domains.mcp.services import mount_mcp_http_app


class McpApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_settings = {
            "MCP_ENABLED": settings.MCP_ENABLED,
            "MCP_AUTH_MODE": settings.MCP_AUTH_MODE,
            "MCP_SERVER_NAME": settings.MCP_SERVER_NAME,
            "MCP_SERVER_INSTRUCTIONS": settings.MCP_SERVER_INSTRUCTIONS,
            "MCP_DOCS_RESULT_LIMIT": settings.MCP_DOCS_RESULT_LIMIT,
            "MCP_DOCS_REPO_URL_OVERRIDE": settings.MCP_DOCS_REPO_URL_OVERRIDE,
            "MCP_OAUTH_ISSUER_URL": settings.MCP_OAUTH_ISSUER_URL,
            "MCP_OAUTH_SERVICE_DOCUMENTATION_URL": settings.MCP_OAUTH_SERVICE_DOCUMENTATION_URL,
            "MCP_OAUTH_SIGNING_SECRET": settings.MCP_OAUTH_SIGNING_SECRET,
            "MCP_OAUTH_REQUIRED_SCOPES": settings.MCP_OAUTH_REQUIRED_SCOPES,
            "MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS": settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
            "MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS": settings.MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS,
            "MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS": settings.MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS,
        }
        settings.MCP_ENABLED = False
        settings.MCP_AUTH_MODE = "none"
        settings.MCP_SERVER_NAME = "ECTRM MCP Test"
        settings.MCP_SERVER_INSTRUCTIONS = "Read-only test instructions."
        settings.MCP_DOCS_RESULT_LIMIT = 8
        settings.MCP_DOCS_REPO_URL_OVERRIDE = "https://github.com/acme/ectrm"
        settings.MCP_OAUTH_ISSUER_URL = "http://127.0.0.1:8000/mcp"
        settings.MCP_OAUTH_SERVICE_DOCUMENTATION_URL = ""
        settings.MCP_OAUTH_SIGNING_SECRET = "test-signing-secret"
        settings.MCP_OAUTH_REQUIRED_SCOPES = "mcp:tools"
        settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS = 3600
        settings.MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS = 7200
        settings.MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS = 600
        clear_mcp_server_cache()

    def tearDown(self) -> None:
        settings.MCP_ENABLED = self._previous_settings["MCP_ENABLED"]
        settings.MCP_AUTH_MODE = self._previous_settings["MCP_AUTH_MODE"]
        settings.MCP_SERVER_NAME = self._previous_settings["MCP_SERVER_NAME"]
        settings.MCP_SERVER_INSTRUCTIONS = self._previous_settings["MCP_SERVER_INSTRUCTIONS"]
        settings.MCP_DOCS_RESULT_LIMIT = self._previous_settings["MCP_DOCS_RESULT_LIMIT"]
        settings.MCP_DOCS_REPO_URL_OVERRIDE = self._previous_settings["MCP_DOCS_REPO_URL_OVERRIDE"]
        settings.MCP_OAUTH_ISSUER_URL = self._previous_settings["MCP_OAUTH_ISSUER_URL"]
        settings.MCP_OAUTH_SERVICE_DOCUMENTATION_URL = self._previous_settings["MCP_OAUTH_SERVICE_DOCUMENTATION_URL"]
        settings.MCP_OAUTH_SIGNING_SECRET = self._previous_settings["MCP_OAUTH_SIGNING_SECRET"]
        settings.MCP_OAUTH_REQUIRED_SCOPES = self._previous_settings["MCP_OAUTH_REQUIRED_SCOPES"]
        settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS = self._previous_settings["MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS"]
        settings.MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS = self._previous_settings["MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS"]
        settings.MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS = self._previous_settings["MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS"]
        clear_mcp_server_cache()

    def test_status_route_reports_disabled_scaffold(self) -> None:
        app = FastAPI()
        include_http_routers(app)
        client = TestClient(app)

        response = client.get("/mcp-status")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["enabled"])
        self.assertEqual(payload["mount_path"], MCP_MOUNT_PATH)
        self.assertEqual(payload["tool_names"], [])
        self.assertGreater(payload["document_count"], 0)
        self.assertEqual(payload["auth_mode"], "none")
        self.assertEqual(payload["required_scopes"], [])
        self.assertEqual(payload["login_methods"], [])

    def test_mount_helper_mounts_mcp_when_enabled(self) -> None:
        settings.MCP_ENABLED = True
        clear_mcp_server_cache()
        app = FastAPI()

        mounted = mount_mcp_http_app(app)

        self.assertTrue(mounted)
        self.assertTrue(any(getattr(route, "path", None) == MCP_MOUNT_PATH for route in app.routes))

    def test_mcp_server_exposes_search_and_fetch_tools(self) -> None:
        async def _run() -> None:
            build_mcp_server()
            async with create_connected_server_and_client_session(get_mcp_lowlevel_server()) as client:
                tools_result = await client.list_tools()
                tools_by_name = {tool.name: tool for tool in tools_result.tools}

                self.assertEqual(set(tools_by_name), {"search", "fetch"})
                self.assertTrue(tools_by_name["search"].annotations.readOnlyHint)
                self.assertTrue(tools_by_name["fetch"].annotations.readOnlyHint)

                search_result = await client.call_tool("search", {"query": "AI Workflow"})
                self.assertFalse(search_result.isError)
                self.assertEqual(len(search_result.content), 1)
                search_payload = json.loads(search_result.content[0].text)
                self.assertIn("results", search_payload)
                self.assertGreater(len(search_payload["results"]), 0)

                fetch_result = await client.call_tool("fetch", {"id": "README.md"})
                self.assertFalse(fetch_result.isError)
                self.assertEqual(len(fetch_result.content), 1)
                fetch_payload = json.loads(fetch_result.content[0].text)
                self.assertEqual(fetch_payload["id"], "README.md")
                self.assertIn("ECTRM", fetch_payload["text"])
                self.assertTrue(fetch_payload["url"].startswith("https://github.com/acme/ectrm/blob/"))

        anyio.run(_run)


if __name__ == "__main__":
    unittest.main()
