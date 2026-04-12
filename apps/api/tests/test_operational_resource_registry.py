from __future__ import annotations

import unittest

from apps.api.app.domains.operations.services.operational_resource_registry import (
    OPERATIONAL_RESOURCE_DESCRIPTORS,
)


class OperationalResourceRegistryTests(unittest.TestCase):
    def test_registry_tracks_operational_resource_descriptors(self) -> None:
        self.assertEqual(
            set(OPERATIONAL_RESOURCE_DESCRIPTORS),
            {
                "confirmations",
                "deliveries",
                "shipments",
                "invoices",
                "payments",
                "work_items",
            },
        )

    def test_descriptors_declare_filters_sorts_and_actions(self) -> None:
        self.assertEqual(OPERATIONAL_RESOURCE_DESCRIPTORS["confirmations"].filters, ("trade_id",))
        self.assertEqual(OPERATIONAL_RESOURCE_DESCRIPTORS["payments"].filters, ("trade_id", "invoice_id"))
        self.assertEqual(OPERATIONAL_RESOURCE_DESCRIPTORS["work_items"].sort_fields, ("attention_rank",))
        self.assertIn("upsert_actualization", OPERATIONAL_RESOURCE_DESCRIPTORS["shipments"].actions)
        self.assertIn("append_event", OPERATIONAL_RESOURCE_DESCRIPTORS["deliveries"].actions)


if __name__ == "__main__":
    unittest.main()
