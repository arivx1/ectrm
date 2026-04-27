from __future__ import annotations

import unittest

from apps.api.app.domains.reference_data.services.asset_seed_catalog import (
    REAL_ASSET_CANDIDATE_ROW_COUNT,
    build_real_asset_candidate_rows,
)


class AssetSeedCatalogTests(unittest.TestCase):
    def test_real_asset_candidate_catalog_loads_and_marks_records_real(self) -> None:
        rows = build_real_asset_candidate_rows()

        self.assertEqual(len(rows), REAL_ASSET_CANDIDATE_ROW_COUNT)
        self.assertEqual({row["asset_reality"] for row in rows}, {"REAL"})
        self.assertIn("COLONIAL_PIPELINE_USA", {row["code"] for row in rows})
        self.assertIn("SABINE_PASS_LNG_USA", {row["code"] for row in rows})


if __name__ == "__main__":
    unittest.main()
