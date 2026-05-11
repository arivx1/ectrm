from __future__ import annotations

import unittest

from fastapi import FastAPI

from apps.api.app.domains.http import HTTP_ROUTE_REGISTRATIONS, include_http_routers


class HttpRouterRegistryTests(unittest.TestCase):
    def test_registry_tracks_domain_owned_operations_and_reporting_routes(self) -> None:
        registrations = {(registration.domain, registration.name) for registration in HTTP_ROUTE_REGISTRATIONS}

        self.assertIn(("operations", "operations"), registrations)
        self.assertIn(("settlement", "settlement"), registrations)
        self.assertIn(("reports", "reports"), registrations)
        self.assertIn(("accruals", "accruals"), registrations)
        self.assertIn(("pretrade", "pretrade"), registrations)
        self.assertIn(("operations", "user-events"), registrations)
        self.assertIn(("mcp", "mcp-status"), registrations)
        self.assertIn(("codex", "codex-admin"), registrations)
        self.assertIn(("codex", "codex-callback"), registrations)

    def test_include_http_routers_mounts_expected_paths(self) -> None:
        app = FastAPI()

        include_http_routers(app)

        paths = {route.path for route in app.routes}

        self.assertIn("/operations/system-overview", paths)
        self.assertIn("/operations/resources", paths)
        self.assertIn("/operations/trade-attention-candidates", paths)
        self.assertIn("/confirmations", paths)
        self.assertIn("/deliveries", paths)
        self.assertIn("/shipments", paths)
        self.assertIn("/trades/metadata", paths)
        self.assertIn("/settlement/invoices", paths)
        self.assertIn("/settlement/invoice-issue-candidates", paths)
        self.assertIn("/reports/overview", paths)
        self.assertIn("/reports/trading-eod", paths)
        self.assertIn("/accruals/reconciliation", paths)
        self.assertIn("/pretrade/scenarios", paths)
        self.assertIn("/user-events", paths)
        self.assertIn("/user-events/occurrences", paths)
        self.assertIn("/assistant/settings", paths)
        self.assertIn("/assistant/conversations", paths)
        self.assertIn("/assistant/action-requests", paths)
        self.assertIn("/assistant/prompt-navigation-outcomes", paths)
        self.assertIn("/assistant/prompt-route-recommendations", paths)
        self.assertIn("/mcp/login", paths)
        self.assertIn("/mcp-status", paths)
        self.assertIn("/mcp/whoami", paths)
        self.assertIn("/admin/codex/tasks", paths)
        self.assertIn("/codex/tasks/{task_id}/callback", paths)


if __name__ == "__main__":
    unittest.main()
