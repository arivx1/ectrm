from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.asset_reference_normalization import (
    normalize_reference_asset_links,
)
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_location import ReferenceLocation


class AssetReferenceNormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        ReferenceCommodity.__table__.create(bind=cls.engine)
        ReferenceLocation.__table__.create(bind=cls.engine)
        ReferenceAsset.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        ReferenceAsset.__table__.drop(bind=cls.engine)
        ReferenceLocation.__table__.drop(bind=cls.engine)
        ReferenceCommodity.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            session.query(ReferenceAsset).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceCommodity).delete()
            session.commit()

    def test_normalize_reference_asset_links_rewrites_real_assets_and_creates_refs(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    ReferenceCommodity(
                        code="POWER",
                        name="Power",
                        commodity_class="POWER",
                        description="",
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="seed",
                        updated_at=now,
                        updated_by="seed",
                        version=1,
                    ),
                    ReferenceCommodity(
                        code="LNG",
                        name="LNG",
                        commodity_class="NATURAL_GAS",
                        description="",
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="seed",
                        updated_at=now,
                        updated_by="seed",
                        version=1,
                    ),
                ]
            )
            session.add_all(
                [
                    self._asset(
                        code="REAL_POWER",
                        commodity_code="ELECTRICITY",
                        location_code="US",
                        now=now,
                    ),
                    self._asset(
                        code="REAL_PRODUCTS",
                        commodity_code="PETROLEUM_PRODUCTS",
                        location_code="US_CA",
                        now=now,
                    ),
                    self._asset(
                        code="REAL_CRUDE",
                        commodity_code="CRUDE_OIL",
                        location_code="CA_US",
                        now=now,
                    ),
                    self._asset(
                        code="REAL_OFFSHORE",
                        commodity_code="LNG",
                        location_code="US-GOM",
                        now=now,
                    ),
                    self._asset(
                        code="REAL_MARKET",
                        commodity_code="LNG",
                        location_code="ASEAN",
                        now=now,
                    ),
                    self._asset(
                        code="SIM_RAW",
                        commodity_code="NAT_GAS",
                        location_code="US-TX",
                        asset_reality="SIMULATED",
                        now=now,
                    ),
                ]
            )
            session.commit()

            summary = normalize_reference_asset_links(
                session,
                requested_by="normalizer",
            )

            rows = {
                row.code: row
                for row in session.query(ReferenceAsset).all()
            }
            locations = {
                row.code: row
                for row in session.query(ReferenceLocation).all()
            }
            commodities = {
                row.code: row
                for row in session.query(ReferenceCommodity).all()
            }

        self.assertEqual(summary.asset_count, 5)
        self.assertEqual(summary.commodity_assets_rewritten, 2)
        self.assertEqual(summary.commodities_created, 2)
        self.assertEqual(summary.location_assets_rewritten, 5)
        self.assertEqual(summary.locations_created, 8)
        self.assertEqual(summary.asset_reality, "REAL")

        self.assertEqual(rows["REAL_POWER"].commodity_code, "POWER")
        self.assertEqual(rows["REAL_PRODUCTS"].commodity_code, "REFINED_PRODUCTS")
        self.assertEqual(rows["REAL_CRUDE"].commodity_code, "CRUDE_OIL")
        self.assertEqual(rows["REAL_POWER"].location_code, "COUNTRY_US")
        self.assertEqual(rows["REAL_PRODUCTS"].location_code, "SUBDIVISION_US_CA")
        self.assertEqual(rows["REAL_CRUDE"].location_code, "CORRIDOR_CA_US")
        self.assertEqual(rows["REAL_OFFSHORE"].location_code, "BASIN_US_GOM")
        self.assertEqual(rows["REAL_MARKET"].location_code, "MARKET_AREA_ASEAN")
        self.assertEqual(rows["SIM_RAW"].commodity_code, "NAT_GAS")
        self.assertEqual(rows["SIM_RAW"].location_code, "US-TX")

        self.assertIn("CRUDE_OIL", commodities)
        self.assertIn("REFINED_PRODUCTS", commodities)
        self.assertEqual(locations["COUNTRY_US"].location_type, "COUNTRY")
        self.assertEqual(locations["COUNTRY_US"].parent_location_code, "CONTINENT_NA")
        self.assertEqual(locations["SUBDIVISION_US_CA"].parent_location_code, "COUNTRY_US")
        self.assertEqual(locations["CORRIDOR_CA_US"].location_type, "CORRIDOR")
        self.assertEqual(locations["BASIN_US_GOM"].location_type, "BASIN")
        self.assertEqual(locations["MARKET_AREA_ASEAN"].location_type, "MARKET_AREA")

    def _asset(
        self,
        *,
        code: str,
        commodity_code: str | None,
        location_code: str | None,
        now: datetime,
        asset_reality: str = "REAL",
    ) -> ReferenceAsset:
        return ReferenceAsset(
            code=code,
            name=code,
            asset_class="PIPELINE",
            asset_type="TRANSMISSION",
            asset_reality=asset_reality,
            commodity_code=commodity_code,
            location_code=location_code,
            latitude=None,
            longitude=None,
            geometry_geojson=None,
            capacity_value=None,
            capacity_unit_code=None,
            operator_name=None,
            operating_status="OPERATING",
            source_name=None,
            source_url=None,
            confidence=None,
            notes=None,
            description=None,
            is_active=True,
            effective_from=None,
            effective_to=None,
            created_at=now,
            created_by="seed",
            updated_at=now,
            updated_by="seed",
            version=1,
        )


if __name__ == "__main__":
    unittest.main()
