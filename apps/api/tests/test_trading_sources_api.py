from __future__ import annotations

import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.admin.services.trading_sources import seed_trading_sources_from_csv
from apps.api.app.models.event import Base
from apps.api.app.models.trading_source import TradingSource
from apps.api.app.routes.trading_sources import list_admin_trading_sources
from apps.api.app.schemas.trading_source import TradingSourceSeedRequest
from apps.api.app.routes.trading_sources import seed_admin_trading_sources


class TradingSourcesApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            session.query(TradingSource).delete()
            session.commit()

    def test_seed_trading_sources_from_csv_creates_and_updates_rows(self) -> None:
        headers = [
            "source_id", "source_name", "source_category", "dataset_name", "business_purpose",
            "asset_classes", "products_or_regions", "system_owner", "business_owner", "vendor_or_origin",
            "golden_source", "fallback_source", "update_frequency", "delivery_pattern", "latency_requirement",
            "retention_requirement", "storage_pattern", "schema_owner", "quality_checks", "reconciliation_method",
            "usage_scope", "criticality", "license_type", "license_restrictions", "entitlements_required",
            "cost_model", "sensitivity_class", "availability_slo", "incident_runbook", "monitoring_metrics",
            "lineage_notes", "last_reviewed_at", "status",
        ]
        rows = [
            {
                "source_id": "src_a",
                "source_name": "Source A",
                "source_category": "market_data",
                "dataset_name": "Feed A",
                "business_purpose": "pricing",
                "asset_classes": "power",
                "products_or_regions": "US",
                "system_owner": "Data Platform",
                "business_owner": "Desk A",
                "vendor_or_origin": "Vendor A",
                "golden_source": "primary_a",
                "fallback_source": "backup_a",
                "update_frequency": "daily",
                "delivery_pattern": "api_pull",
                "latency_requirement": "<1h",
                "retention_requirement": "7 years",
                "storage_pattern": "db",
                "schema_owner": "Data Platform",
                "quality_checks": "checks",
                "reconciliation_method": "recon",
                "usage_scope": "risk",
                "criticality": "tier_0",
                "license_type": "internal",
                "license_restrictions": "none",
                "entitlements_required": "no",
                "cost_model": "internal",
                "sensitivity_class": "internal_confidential",
                "availability_slo": "99.9%",
                "incident_runbook": "runbook.md",
                "monitoring_metrics": "lag",
                "lineage_notes": "notes",
                "last_reviewed_at": "2026-03-10",
                "status": "active",
            }
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sources.csv"
            with path.open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=headers)
                writer.writeheader()
                writer.writerows(rows)

            with self.SessionLocal() as session:
                first = seed_trading_sources_from_csv(session, csv_path=path, replace_existing=True)
                self.assertEqual(first.created_count, 1)
                self.assertEqual(first.updated_count, 0)

            rows[0]["source_name"] = "Source A Updated"
            with path.open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=headers)
                writer.writeheader()
                writer.writerows(rows)

            with self.SessionLocal() as session:
                second = seed_trading_sources_from_csv(session, csv_path=path, replace_existing=True)
                self.assertEqual(second.created_count, 0)
                self.assertEqual(second.updated_count, 1)

            with self.SessionLocal() as session:
                stored = session.query(TradingSource).filter(TradingSource.source_id == "src_a").one()
                self.assertEqual(stored.source_name, "Source A Updated")

    def test_list_admin_trading_sources_filters_results(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    TradingSource(
                        source_id="power_feed",
                        source_name="Power Feed",
                        source_category="market_data",
                        dataset_name="Power Feed",
                        business_purpose="pricing",
                        asset_classes="power",
                        products_or_regions="US",
                        system_owner="Data Platform",
                        business_owner="Power Trading",
                        vendor_or_origin="Vendor A",
                        golden_source="primary",
                        fallback_source="backup",
                        update_frequency="real_time",
                        delivery_pattern="streaming",
                        latency_requirement="<1m",
                        retention_requirement="7 years",
                        storage_pattern="db",
                        schema_owner="Data Platform",
                        quality_checks="lag checks",
                        reconciliation_method="daily recon",
                        usage_scope="risk",
                        criticality="tier_0",
                        license_type="commercial",
                        license_restrictions="none",
                        entitlements_required="yes",
                        cost_model="subscription",
                        sensitivity_class="internal_confidential",
                        availability_slo="99.9%",
                        incident_runbook="runbook.md",
                        monitoring_metrics="lag",
                        lineage_notes="notes",
                        last_reviewed_at=date(2026, 3, 10),
                        status="active",
                    ),
                    TradingSource(
                        source_id="weather_feed",
                        source_name="Weather Feed",
                        source_category="weather",
                        dataset_name="Weather Feed",
                        business_purpose="forecasting",
                        asset_classes="gas",
                        products_or_regions="US",
                        system_owner="External Data",
                        business_owner="Gas Trading",
                        vendor_or_origin="Vendor B",
                        golden_source="primary",
                        fallback_source="backup",
                        update_frequency="hourly",
                        delivery_pattern="api_pull",
                        latency_requirement="<15m",
                        retention_requirement="10 years",
                        storage_pattern="lake",
                        schema_owner="Data Platform",
                        quality_checks="coverage checks",
                        reconciliation_method="sample recon",
                        usage_scope="research",
                        criticality="tier_1",
                        license_type="commercial",
                        license_restrictions="none",
                        entitlements_required="yes",
                        cost_model="subscription",
                        sensitivity_class="internal_confidential",
                        availability_slo="99.5%",
                        incident_runbook="weather.md",
                        monitoring_metrics="coverage",
                        lineage_notes="notes",
                        last_reviewed_at=date(2026, 3, 10),
                        status="active",
                    ),
                ]
            )
            session.commit()

        with self.SessionLocal() as session:
            payload = list_admin_trading_sources(
                q="power",
                source_category="market_data",
                criticality="tier_0",
                status="active",
                limit=50,
                offset=0,
                db=session,
            )

        self.assertEqual([row.source_id for row in payload], ["power_feed"])

    def test_seed_admin_trading_sources_uses_canonical_register(self) -> None:
        with self.SessionLocal() as session:
            payload = seed_admin_trading_sources(
                TradingSourceSeedRequest(requested_by="test-user", replace_existing=True),
                db=session,
            )

        self.assertGreaterEqual(payload.total_rows, 20)
        self.assertEqual(payload.requested_by, "test-user")


if __name__ == "__main__":
    unittest.main()
