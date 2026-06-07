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
                "document_record_creation_requests",
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
        confirmation_actions = {
            action.key: action for action in OPERATIONAL_RESOURCE_DESCRIPTORS["confirmations"].surface.actions
        }
        self.assertTrue(confirmation_actions["disputed"].comment_required)
        self.assertEqual(
            confirmation_actions["disputed"].comment_hint,
            "Add a dispute reason or response note before marking the confirmation as disputed.",
        )
        workflow_actions = {
            action.key: action for action in OPERATIONAL_RESOURCE_DESCRIPTORS["work_items"].surface.actions
        }
        self.assertEqual(
            workflow_actions["approve"].permission_message,
            "Only authorized credit approvers can approve credit workflow items.",
        )


if __name__ == "__main__":
    unittest.main()
