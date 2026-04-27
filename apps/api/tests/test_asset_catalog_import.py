from __future__ import annotations

import enum
import json
import tempfile
import unittest
from pathlib import Path

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.asset_catalog_import import (
    import_reference_asset_catalog,
)
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.routes.reference_data import list_assets


class AssetCatalogImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        ReferenceAsset.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        ReferenceAsset.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            session.query(ReferenceAsset).delete()
            session.commit()

    def test_import_reference_asset_catalog_normalizes_sparse_real_asset_rows(self) -> None:
        catalog_path = self._write_catalog(
            {
                "assets": [
                    {
                        "code": "WRI_GPPD_CKAN_ROW_00001",
                        "name": None,
                        "description": "Hydrate from source URL.",
                        "asset_class": "GENERATION",
                        "asset_type": None,
                        "commodity_code": "ELECTRICITY",
                        "location_code": None,
                        "capacity_value": None,
                        "capacity_unit_code": None,
                        "operator_name": None,
                        "operating_status": None,
                        "source_name": "WRI Global Power Plant Database via CE data hub CKAN Data API",
                        "source_url": "https://example.com/wri/1",
                        "confidence": 0.81,
                        "notes": "Original source note.",
                    },
                    {
                        "code": "SABINE_PASS_LNG_USA",
                        "name": "Sabine Pass Liquefaction",
                        "description": "LNG export facility.",
                        "asset_class": "PROCESSING",
                        "asset_type": "LNG_EXPORT",
                        "commodity_code": "LNG",
                        "location_code": "US-LA",
                        "capacity_value": None,
                        "capacity_unit_code": None,
                        "operator_name": "Cheniere Energy",
                        "operating_status": "OPERATING",
                        "source_name": "Cheniere Energy",
                        "source_url": "https://example.com/sabine",
                        "confidence": 0.96,
                        "notes": "Original operator source.",
                    },
                ]
            }
        )

        with self.SessionLocal() as session:
            summary = import_reference_asset_catalog(
                session,
                source_path=catalog_path,
                requested_by="catalog-loader",
            )

        self.assertEqual(summary.total_rows, 2)
        self.assertEqual(summary.created_count, 2)
        self.assertEqual(summary.updated_count, 0)
        self.assertEqual(summary.derived_name_count, 1)
        self.assertEqual(summary.defaulted_asset_type_count, 1)
        self.assertEqual(summary.defaulted_operating_status_count, 1)

        with self.SessionLocal() as session:
            imported = session.get(ReferenceAsset, "WRI_GPPD_CKAN_ROW_00001")
            self.assertIsNotNone(imported)
            assert imported is not None
            self.assertEqual(imported.name, "WRI Global Power Plant Database Row 00001")
            self.assertEqual(imported.asset_type, "THERMAL")
            self.assertEqual(imported.asset_reality, "REAL")
            self.assertEqual(imported.operating_status, "OPERATING")
            self.assertEqual(imported.source_name, "WRI Global Power Plant Database via CE data hub CKAN Data API")
            self.assertEqual(imported.source_url, "https://example.com/wri/1")
            self.assertEqual(imported.confidence, 0.81)
            self.assertIn("Import normalization:", imported.notes or "")

            searchable = list_assets(
                q="power plant database",
                limit=10,
                offset=0,
                db=session,
            )

        self.assertIn("WRI_GPPD_CKAN_ROW_00001", {row.code for row in searchable})

    def test_import_reference_asset_catalog_skips_existing_rows_when_requested(self) -> None:
        first_catalog_path = self._write_catalog(
            {
                "assets": [
                    {
                        "code": "CATALOG_TEST_ASSET",
                        "name": "Catalog Test Asset",
                        "description": "First version.",
                        "asset_class": "PIPELINE",
                        "asset_type": "TRANSMISSION",
                        "commodity_code": "NAT_GAS",
                        "location_code": "US",
                        "capacity_value": None,
                        "capacity_unit_code": None,
                        "operator_name": None,
                        "operating_status": "OPERATING",
                        "source_name": "Catalog A",
                        "source_url": "https://example.com/a",
                        "confidence": 0.8,
                        "notes": "A",
                    }
                ]
            }
        )
        second_catalog_path = self._write_catalog(
            {
                "assets": [
                    {
                        "code": "CATALOG_TEST_ASSET",
                        "name": "Catalog Test Asset Updated",
                        "description": "Second version.",
                        "asset_class": "PIPELINE",
                        "asset_type": "TRANSMISSION",
                        "commodity_code": "NAT_GAS",
                        "location_code": "US",
                        "capacity_value": None,
                        "capacity_unit_code": None,
                        "operator_name": None,
                        "operating_status": "OPERATING",
                        "source_name": "Catalog B",
                        "source_url": "https://example.com/b",
                        "confidence": 0.9,
                        "notes": "B",
                    }
                ]
            }
        )

        with self.SessionLocal() as session:
            first_summary = import_reference_asset_catalog(
                session,
                source_path=first_catalog_path,
                requested_by="catalog-loader",
            )
            second_summary = import_reference_asset_catalog(
                session,
                source_path=second_catalog_path,
                requested_by="catalog-loader",
                replace_existing=False,
            )
            record = session.get(ReferenceAsset, "CATALOG_TEST_ASSET")

        self.assertEqual(first_summary.created_count, 1)
        self.assertEqual(second_summary.skipped_existing_count, 1)
        self.assertIsNotNone(record)
        assert record is not None
        self.assertEqual(record.source_name, "Catalog A")
        self.assertEqual(record.source_url, "https://example.com/a")

    def _write_catalog(self, payload: dict[str, object]) -> Path:
        handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        with handle:
            json.dump(payload, handle)
        return Path(handle.name)


if __name__ == "__main__":
    unittest.main()
