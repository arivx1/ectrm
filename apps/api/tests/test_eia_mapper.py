from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from apps.api.app.domains.reference_data.services.external_data.eia_mapper import (
    EIAMappingError,
    build_start_argument,
    normalize_observations,
    parse_period,
)
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class EiaMapperTests(unittest.TestCase):
    def test_parse_period_supports_multiple_frequencies(self) -> None:
        self.assertEqual(parse_period("2026-03-10", "daily"), date(2026, 3, 10))
        self.assertEqual(parse_period("2026-03", "monthly"), date(2026, 3, 1))
        self.assertEqual(parse_period("2026-Q2", "quarterly"), date(2026, 4, 1))
        self.assertEqual(parse_period("2026", "annual"), date(2026, 1, 1))

    def test_build_start_argument_formats_by_frequency(self) -> None:
        today = date(2026, 3, 10)
        self.assertEqual(build_start_argument("daily", 7, today=today), "2026-03-03")
        self.assertEqual(build_start_argument("monthly", 40, today=today), "2026-01")
        self.assertEqual(build_start_argument("quarterly", 70, today=today), "2025-Q4")
        self.assertEqual(build_start_argument("annual", 400, today=today), "2025")

    def test_normalize_observations_maps_valid_payload(self) -> None:
        mapping = ReferencePriceIndexSource(
            price_index_code="ULSD_US_RETAIL",
            provider="EIA",
            dataset_code="PET",
            series_id="PET.EMD_EPD2D_PTE_NUS_DPG.W",
            frequency="weekly",
            source_unit="gal",
            source_currency_code="usd",
            transform_rule=None,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            created_by="test-user",
            updated_at=datetime.now(timezone.utc),
            updated_by="test-user",
            version=1,
        )
        downloaded_at = datetime(2026, 3, 10, 18, 45, tzinfo=timezone.utc)
        payload = {
            "response": {
                "frequency": "weekly",
                "data": [
                    {
                        "period": "2026-03-02",
                        "value": "3.455",
                        "updated": "2026-03-04T17:00:00Z",
                    }
                ],
            }
        }

        observations = normalize_observations(
            mapping=mapping,
            payload=payload,
            downloaded_at=downloaded_at,
        )

        self.assertEqual(len(observations), 1)
        observation = observations[0]
        self.assertEqual(observation.price_index_code, "ULSD_US_RETAIL")
        self.assertEqual(observation.observation_date, date(2026, 3, 2))
        self.assertEqual(observation.value, Decimal("3.455"))
        self.assertEqual(observation.unit_code, "GAL")
        self.assertEqual(observation.currency_code, "USD")
        self.assertEqual(observation.source_provider, "EIA")
        self.assertEqual(observation.source_series_id, "PET.EMD_EPD2D_PTE_NUS_DPG.W")
        self.assertEqual(observation.source_frequency, "WEEKLY")
        self.assertEqual(
            observation.source_published_at,
            datetime(2026, 3, 4, 17, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(observation.source_revision, "2026-03-04T17:00:00Z")
        self.assertEqual(observation.downloaded_at, downloaded_at)

    def test_normalize_observations_rejects_missing_period(self) -> None:
        mapping = ReferencePriceIndexSource(
            price_index_code="ULSD_US_RETAIL",
            provider="EIA",
            dataset_code="PET",
            series_id="PET.EMD_EPD2D_PTE_NUS_DPG.W",
            frequency="weekly",
            source_unit="gal",
            source_currency_code="usd",
            transform_rule=None,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            created_by="test-user",
            updated_at=datetime.now(timezone.utc),
            updated_by="test-user",
            version=1,
        )

        with self.assertRaisesRegex(EIAMappingError, "missing period"):
            normalize_observations(
                mapping=mapping,
                payload={"response": {"frequency": "weekly", "data": [{"value": "3.455"}]}},
            )


if __name__ == "__main__":
    unittest.main()
