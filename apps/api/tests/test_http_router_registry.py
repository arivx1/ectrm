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

    def test_include_http_routers_mounts_expected_paths(self) -> None:
        app = FastAPI()

        include_http_routers(app)

        paths = {route.path for route in app.routes}

        self.assertIn("/operations/system-overview", paths)
        self.assertIn("/operations/resources", paths)
        self.assertIn("/confirmations", paths)
        self.assertIn("/deliveries", paths)
        self.assertIn("/shipments", paths)
        self.assertIn("/trades/metadata", paths)
        self.assertIn("/settlement/invoices", paths)
        self.assertIn("/reports/overview", paths)
        self.assertIn("/accruals/reconciliation", paths)
        self.assertIn("/pretrade/scenarios", paths)


if __name__ == "__main__":
    unittest.main()
