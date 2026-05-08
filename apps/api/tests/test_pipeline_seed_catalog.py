from __future__ import annotations

import unittest

from apps.api.app.domains.reference_data.services.pipeline_seed_catalog import (
    PIPELINE_POINT_SEED_CANDIDATE_COUNT,
    PIPELINE_SEED_CANDIDATE_COUNT,
    build_pipeline_seed_candidate_catalog,
)


class PipelineSeedCatalogTests(unittest.TestCase):
    def test_pipeline_seed_candidate_catalog_loads_official_research_set(self) -> None:
        payload = build_pipeline_seed_candidate_catalog()
        pipeline_rows = payload["pipelines"]
        point_rows = payload["points"]

        self.assertEqual(len(pipeline_rows), PIPELINE_SEED_CANDIDATE_COUNT)
        self.assertEqual(len(point_rows), PIPELINE_POINT_SEED_CANDIDATE_COUNT)
        self.assertIn("TRANSCO_USA", {row["code"] for row in pipeline_rows})
        self.assertIn("COLONIAL_USA", {row["code"] for row in pipeline_rows})
        self.assertIn("TGP_ZONE_L_LEG_500_POOL", {row["code"] for row in point_rows})
        self.assertIn("SEAWAY_ECHO_TERMINAL", {row["code"] for row in point_rows})


if __name__ == "__main__":
    unittest.main()
