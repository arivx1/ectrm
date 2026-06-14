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

from apps.api.app.domains.reference_data.services.asset_spatial_enrichment import (
    HIFLD_ELECTRIC_POWER_TRANSMISSION_LINES_SOURCE_NAME,
    HIFLD_NATURAL_GAS_COMPRESSOR_STATIONS_SOURCE_NAME,
    WRI_SOURCE_NAME,
    enrich_reference_asset_spatial_fields,
)
from apps.api.app.models.reference_asset import ReferenceAsset


class AssetSpatialEnrichmentTests(unittest.TestCase):
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

    def test_enrich_reference_asset_spatial_fields_hydrates_wri_assets(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    self._asset(
                        code="WRI_GPPD_CKAN_ROW_00001",
                        name="WRI Global Power Plant Database Row 00001",
                        source_name=WRI_SOURCE_NAME,
                        notes="placeholder",
                        now=now,
                    ),
                    self._asset(
                        code="WRI_GPPD_CKAN_ROW_00002",
                        name="WRI Global Power Plant Database Row 00002",
                        source_name=WRI_SOURCE_NAME,
                        notes="placeholder",
                        asset_reality="SIMULATED",
                        now=now,
                    ),
                    self._asset(
                        code="OTHER_ASSET",
                        name="Other Asset",
                        source_name="Other source",
                        notes=None,
                        now=now,
                    ),
                ]
            )
            session.commit()

            summary = enrich_reference_asset_spatial_fields(
                session,
                requested_by="spatial-loader",
                wri_records=[
                    {
                        "_id": 1,
                        "name": "Kajaki Hydroelectric Power Plant Afghanistan",
                        "latitude": "32.322",
                        "longitude": "65.119",
                        "owner": "Kajaki Utility Authority",
                    },
                    {
                        "_id": 2,
                        "name": "Second Plant",
                        "latitude": "11.0",
                        "longitude": "22.0",
                        "owner": "Simulated Owner",
                    },
                ],
            )

            real_asset = session.get(ReferenceAsset, "WRI_GPPD_CKAN_ROW_00001")
            simulated_asset = session.get(ReferenceAsset, "WRI_GPPD_CKAN_ROW_00002")
            other_asset = session.get(ReferenceAsset, "OTHER_ASSET")

        self.assertEqual(summary.asset_reality, "REAL")
        self.assertEqual(summary.target_asset_count, 1)
        self.assertEqual(summary.fetched_source_record_count, 2)
        self.assertEqual(summary.updated_asset_count, 1)
        self.assertEqual(summary.coordinates_updated_count, 1)
        self.assertEqual(summary.geometry_updated_count, 1)
        self.assertEqual(summary.name_updated_count, 1)
        self.assertEqual(summary.operator_updated_count, 1)
        self.assertEqual(summary.remaining_missing_coordinates_count, 0)

        assert real_asset is not None
        self.assertEqual(real_asset.name, "Kajaki Hydroelectric Power Plant Afghanistan")
        self.assertEqual(real_asset.latitude, 32.322)
        self.assertEqual(real_asset.longitude, 65.119)
        self.assertEqual(real_asset.geometry_geojson, {"type": "Point", "coordinates": [65.119, 32.322]})
        self.assertEqual(real_asset.operator_name, "Kajaki Utility Authority")

        assert simulated_asset is not None
        self.assertIsNone(simulated_asset.latitude)
        self.assertIsNone(simulated_asset.longitude)
        self.assertEqual(simulated_asset.name, "WRI Global Power Plant Database Row 00002")

        assert other_asset is not None
        self.assertIsNone(other_asset.latitude)
        self.assertIsNone(other_asset.longitude)

    def test_enrich_reference_asset_spatial_fields_hydrates_hifld_line_assets(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                self._asset(
                    code="HIFLD_ELECTRIC_TRANSMISSION_LINE_FEATURE_000002",
                    name="HIFLD Open Energy FeatureServer - electric power transmission lines Feature 000002",
                    source_name=HIFLD_ELECTRIC_POWER_TRANSMISSION_LINES_SOURCE_NAME,
                    source_url=(
                        "https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/energy/"
                        "FeatureServer/21/query?where=1%3D1&outFields=*&returnGeometry=true&f=pjson"
                        "&resultRecordCount=1&resultOffset=1&orderByFields=OBJECTID"
                    ),
                    notes="placeholder",
                    now=now,
                    asset_class="PIPELINE",
                    asset_type="TRANSMISSION",
                )
            )
            session.commit()

            summary = enrich_reference_asset_spatial_fields(
                session,
                requested_by="spatial-loader",
                hifld_records_by_source_name={
                    HIFLD_ELECTRIC_POWER_TRANSMISSION_LINES_SOURCE_NAME: [
                        {
                            "attributes": {
                                "OBJECTID": 1,
                                "ID": "100000",
                                "SUB_1": "IGNORED_A",
                                "SUB_2": "IGNORED_B",
                            },
                            "geometry": {
                                "paths": [[[-110.0, 40.0], [-109.0, 41.0]]],
                            },
                        },
                        {
                            "attributes": {
                                "OBJECTID": 2,
                                "ID": "100001",
                                "SUB_1": "ALPHA",
                                "SUB_2": "BETA",
                                "OWNER": "GridCo",
                                "STATUS": "IN SERVICE",
                                "VOLT_CLASS": "220-287",
                            },
                            "geometry": {
                                "paths": [[[-101.0, 35.0], [-99.0, 36.0], [-98.5, 34.5]]],
                            },
                        },
                    ]
                },
            )

            asset = session.get(ReferenceAsset, "HIFLD_ELECTRIC_TRANSMISSION_LINE_FEATURE_000002")

        self.assertEqual(summary.asset_reality, "REAL")
        self.assertEqual(summary.target_asset_count, 1)
        self.assertEqual(summary.fetched_source_record_count, 2)
        self.assertEqual(summary.updated_asset_count, 1)
        self.assertEqual(summary.coordinates_updated_count, 1)
        self.assertEqual(summary.geometry_updated_count, 1)
        self.assertEqual(summary.name_updated_count, 1)
        self.assertEqual(summary.operator_updated_count, 1)
        self.assertEqual(summary.remaining_missing_coordinates_count, 0)

        assert asset is not None
        self.assertEqual(asset.name, "ALPHA to BETA Transmission Line (220-287 kV class)")
        self.assertEqual(asset.operator_name, "GridCo")
        self.assertEqual(asset.operating_status, "OPERATING")
        self.assertEqual(asset.latitude, 35.25)
        self.assertEqual(asset.longitude, -99.75)
        self.assertEqual(
            asset.geometry_geojson,
            {
                "type": "LineString",
                "coordinates": [[-101.0, 35.0], [-99.0, 36.0], [-98.5, 34.5]],
            },
        )

    def test_enrich_reference_asset_spatial_fields_hydrates_hifld_point_assets(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                self._asset(
                    code="HIFLD_NAT_GAS_COMPRESSOR_STATION_FEATURE_000002",
                    name="HIFLD Open Energy FeatureServer - natural gas compressor stations Feature 000002",
                    source_name=HIFLD_NATURAL_GAS_COMPRESSOR_STATIONS_SOURCE_NAME,
                    source_url=(
                        "https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/energy/"
                        "FeatureServer/6/query?where=1%3D1&outFields=*&returnGeometry=true&f=pjson"
                        "&resultRecordCount=1&resultOffset=1&orderByFields=OBJECTID"
                    ),
                    notes="placeholder",
                    now=now,
                    asset_class="PROCESSING",
                    asset_type="GAS_PLANT",
                )
            )
            session.commit()

            summary = enrich_reference_asset_spatial_fields(
                session,
                requested_by="spatial-loader",
                hifld_records_by_source_name={
                    HIFLD_NATURAL_GAS_COMPRESSOR_STATIONS_SOURCE_NAME: [
                        {
                            "attributes": {
                                "OBJECTID": 1,
                                "NAME": "IGNORED",
                            },
                            "geometry": {"x": -78.0, "y": 40.0},
                        },
                        {
                            "attributes": {
                                "OBJECTID": 2,
                                "NAME": "NO. 515 BEAR CREEK",
                                "OPERATOR": "Eastern Gas",
                                "STATUS": "IN SERVICE",
                            },
                            "geometry": {"x": -75.672182, "y": 41.172478},
                        },
                    ]
                },
            )

            asset = session.get(ReferenceAsset, "HIFLD_NAT_GAS_COMPRESSOR_STATION_FEATURE_000002")

        self.assertEqual(summary.asset_reality, "REAL")
        self.assertEqual(summary.target_asset_count, 1)
        self.assertEqual(summary.fetched_source_record_count, 2)
        self.assertEqual(summary.updated_asset_count, 1)
        self.assertEqual(summary.coordinates_updated_count, 1)
        self.assertEqual(summary.geometry_updated_count, 1)
        self.assertEqual(summary.name_updated_count, 1)
        self.assertEqual(summary.operator_updated_count, 1)
        self.assertEqual(summary.remaining_missing_coordinates_count, 0)

        assert asset is not None
        self.assertEqual(asset.name, "NO. 515 BEAR CREEK")
        self.assertEqual(asset.operator_name, "Eastern Gas")
        self.assertEqual(asset.operating_status, "OPERATING")
        self.assertEqual(asset.latitude, 41.172478)
        self.assertEqual(asset.longitude, -75.672182)
        self.assertEqual(
            asset.geometry_geojson,
            {
                "type": "Point",
                "coordinates": [-75.672182, 41.172478],
            },
        )

    def _asset(
        self,
        *,
        code: str,
        name: str,
        source_name: str | None,
        notes: str | None,
        now: datetime,
        asset_reality: str = "REAL",
        asset_class: str = "GENERATION",
        asset_type: str = "THERMAL",
        source_url: str | None = None,
    ) -> ReferenceAsset:
        return ReferenceAsset(
            code=code,
            name=name,
            asset_class=asset_class,
            asset_type=asset_type,
            asset_reality=asset_reality,
            commodity_code="POWER",
            location_code=None,
            latitude=None,
            longitude=None,
            geometry_geojson=None,
            capacity_value=None,
            capacity_unit_code=None,
            operator_name=None,
            operating_status="OPERATING",
            source_name=source_name,
            source_url=source_url,
            confidence=None,
            notes=notes,
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
