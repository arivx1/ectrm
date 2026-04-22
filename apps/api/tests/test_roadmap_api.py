from __future__ import annotations

import unittest

from apps.api.app.routes.roadmap import get_default_roadmap_document


class RoadmapApiTests(unittest.TestCase):
    def test_get_roadmap_document_returns_expected_structure(self) -> None:
        payload = get_default_roadmap_document()

        self.assertEqual(payload.source_path, "docs/engineering/trading-source-roadmap.md")
        self.assertEqual([horizon.key for horizon in payload.horizons], ["now", "next", "later"])
        self.assertEqual(len(payload.phases), 3)
        self.assertEqual(payload.phases[0].items[0].links[0].view, "reference")
        self.assertEqual(payload.milestones[0].id, "m1")
        self.assertIn("books-records", payload.milestones[1].item_ids)


if __name__ == "__main__":
    unittest.main()
