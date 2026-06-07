from __future__ import annotations

import unittest

from apps.api.app.core.http_auth_policy import classify_http_auth_request
from apps.api.app.core.http_auth_policy import is_public_write_path
from apps.api.app.core.http_auth_policy import requires_authenticated_read
from apps.api.app.core.http_auth_policy import source_surface_for_request
from apps.api.app.domains.mcp.services import MCP_MOUNT_PATH


class HttpAuthPolicyTests(unittest.TestCase):
    def test_public_write_paths_are_not_protected_writes(self) -> None:
        classification = classify_http_auth_request(
            "POST",
            "/auth/session",
            mcp_mount_path=MCP_MOUNT_PATH,
        )

        self.assertFalse(classification.is_protected_write)
        self.assertFalse(classification.is_admin_path)
        self.assertEqual(classification.source_surface, "http")

    def test_codex_task_callback_is_public_write_path(self) -> None:
        self.assertTrue(is_public_write_path("/codex/tasks/123/callback"))
        self.assertFalse(is_public_write_path("/codex/tasks/123"))

    def test_business_writes_are_protected(self) -> None:
        classification = classify_http_auth_request(
            "PATCH",
            "/trades/T-100",
            mcp_mount_path=MCP_MOUNT_PATH,
        )

        self.assertTrue(classification.is_protected_write)
        self.assertFalse(classification.is_protected_read)

    def test_post_backed_integration_reads_are_protected(self) -> None:
        classification = classify_http_auth_request(
            "POST",
            "/integrations/attio/client-enrichment",
            mcp_mount_path=MCP_MOUNT_PATH,
        )

        self.assertTrue(classification.is_protected_write)
        self.assertFalse(classification.is_admin_path)

    def test_configured_workspace_reads_require_authentication(self) -> None:
        self.assertTrue(requires_authenticated_read("GET", "/trades"))
        self.assertTrue(requires_authenticated_read("GET", "/reports/overview"))
        self.assertFalse(requires_authenticated_read("GET", "/health"))
        self.assertFalse(requires_authenticated_read("POST", "/trades"))

    def test_admin_paths_are_classified_separately(self) -> None:
        classification = classify_http_auth_request(
            "GET",
            "/admin/projection-monitoring",
            mcp_mount_path=MCP_MOUNT_PATH,
        )

        self.assertTrue(classification.is_admin_path)
        self.assertFalse(classification.is_protected_write)

    def test_mcp_transport_paths_keep_mcp_source_surface_and_skip_write_protection(self) -> None:
        classification = classify_http_auth_request(
            "POST",
            f"{MCP_MOUNT_PATH}/",
            mcp_mount_path=MCP_MOUNT_PATH,
        )

        self.assertTrue(classification.is_mcp_transport_path)
        self.assertFalse(classification.is_protected_write)
        self.assertEqual(classification.source_surface, "mcp.http")
        self.assertEqual(source_surface_for_request("/trades", mcp_mount_path=MCP_MOUNT_PATH), "http")


if __name__ == "__main__":
    unittest.main()
