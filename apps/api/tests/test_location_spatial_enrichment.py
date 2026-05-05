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

from apps.api.app.domains.reference_data.services.location_spatial_enrichment import (
    enrich_reference_location_spatial_fields,
)
from apps.api.app.models.reference_location import ReferenceLocation


class LocationSpatialEnrichmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        ReferenceLocation.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        ReferenceLocation.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            session.query(ReferenceLocation).delete()
            session.commit()

    def test_enrich_reference_location_spatial_fields_hydrates_countries_and_subdivisions(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    self._location(
                        code="COUNTRY_US",
                        name="United States",
                        location_type="COUNTRY",
                        country_code="US",
                        continent_code="NA",
                        now=now,
                    ),
                    self._location(
                        code="SUBDIVISION_US_TX",
                        name="Texas",
                        location_type="STATE",
                        parent_location_code="COUNTRY_US",
                        country_code="US",
                        subdivision_code="US-TX",
                        continent_code="NA",
                        now=now,
                    ),
                ]
            )
            session.commit()

            summary = enrich_reference_location_spatial_fields(
                session,
                requested_by="spatial-loader",
                country_features=[
                    self._polygon_feature(
                        properties={"ADM0_A3": "USA"},
                        coordinates=[[[-100.0, 30.0], [-90.0, 30.0], [-90.0, 40.0], [-100.0, 40.0], [-100.0, 30.0]]],
                    ),
                ],
                subdivision_features=[
                    self._polygon_feature(
                        properties={"iso_3166_2": "US-TX", "iso_a2": "US", "name": "Texas", "postal": "TX"},
                        coordinates=[[[-106.0, 25.0], [-93.0, 25.0], [-93.0, 36.5], [-106.0, 36.5], [-106.0, 25.0]]],
                    ),
                ],
                map_unit_features=[],
            )

            country = session.get(ReferenceLocation, "COUNTRY_US")
            subdivision = session.get(ReferenceLocation, "SUBDIVISION_US_TX")

        self.assertEqual(summary.target_location_count, 2)
        self.assertEqual(summary.direct_country_match_count, 1)
        self.assertEqual(summary.direct_subdivision_match_count, 1)
        self.assertEqual(summary.derived_location_count, 0)
        self.assertEqual(summary.updated_location_count, 2)
        self.assertEqual(summary.remaining_missing_coordinates_count, 0)

        assert country is not None
        self.assertAlmostEqual(country.latitude or 0.0, 35.0)
        self.assertAlmostEqual(country.longitude or 0.0, -95.0)

        assert subdivision is not None
        self.assertAlmostEqual(subdivision.latitude or 0.0, 30.75)
        self.assertAlmostEqual(subdivision.longitude or 0.0, -99.5)

    def test_enrich_reference_location_spatial_fields_derives_aggregate_locations(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    self._location(
                        code="COUNTRY_US",
                        name="United States",
                        location_type="COUNTRY",
                        country_code="US",
                        continent_code="NA",
                        now=now,
                    ),
                    self._location(
                        code="COUNTRY_MX",
                        name="Mexico",
                        location_type="COUNTRY",
                        country_code="MX",
                        continent_code="NA",
                        now=now,
                    ),
                    self._location(
                        code="SUBDIVISION_US_TX",
                        name="Texas",
                        location_type="STATE",
                        parent_location_code="COUNTRY_US",
                        country_code="US",
                        subdivision_code="US-TX",
                        continent_code="NA",
                        now=now,
                    ),
                    self._location(
                        code="SUBDIVISION_US_NM",
                        name="New Mexico",
                        location_type="STATE",
                        parent_location_code="COUNTRY_US",
                        country_code="US",
                        subdivision_code="US-NM",
                        continent_code="NA",
                        now=now,
                    ),
                    self._location(
                        code="CONTINENT_NA",
                        name="North America",
                        location_type="CONTINENT",
                        continent_code="NA",
                        now=now,
                    ),
                    self._location(
                        code="CORRIDOR_US_MX",
                        name="United States / Mexico Corridor",
                        location_type="CORRIDOR",
                        continent_code="NA",
                        now=now,
                    ),
                    self._location(
                        code="REGION_US_TX_NM",
                        name="Texas / New Mexico Regional Area",
                        location_type="REGION",
                        parent_location_code="COUNTRY_US",
                        country_code="US",
                        continent_code="NA",
                        now=now,
                    ),
                ]
            )
            session.commit()

            summary = enrich_reference_location_spatial_fields(
                session,
                requested_by="spatial-loader",
                country_features=[
                    self._polygon_feature(
                        properties={"ADM0_A3": "USA"},
                        coordinates=[[[-100.0, 30.0], [-90.0, 30.0], [-90.0, 40.0], [-100.0, 40.0], [-100.0, 30.0]]],
                    ),
                    self._polygon_feature(
                        properties={"ADM0_A3": "MEX"},
                        coordinates=[[[-110.0, 15.0], [-90.0, 15.0], [-90.0, 30.0], [-110.0, 30.0], [-110.0, 15.0]]],
                    ),
                ],
                subdivision_features=[
                    self._polygon_feature(
                        properties={"iso_3166_2": "US-TX", "iso_a2": "US", "name": "Texas", "postal": "TX"},
                        coordinates=[[[-106.0, 25.0], [-93.0, 25.0], [-93.0, 36.5], [-106.0, 36.5], [-106.0, 25.0]]],
                    ),
                    self._polygon_feature(
                        properties={"iso_3166_2": "US-NM", "iso_a2": "US", "name": "New Mexico", "postal": "NM"},
                        coordinates=[[[-109.1, 31.3], [-103.0, 31.3], [-103.0, 37.0], [-109.1, 37.0], [-109.1, 31.3]]],
                    ),
                ],
                map_unit_features=[],
            )

            continent = session.get(ReferenceLocation, "CONTINENT_NA")
            corridor = session.get(ReferenceLocation, "CORRIDOR_US_MX")
            region = session.get(ReferenceLocation, "REGION_US_TX_NM")

        self.assertEqual(summary.updated_location_count, 7)
        self.assertEqual(summary.derived_location_count, 3)
        self.assertEqual(summary.remaining_missing_coordinates_count, 0)

        assert continent is not None
        self.assertAlmostEqual(continent.latitude or 0.0, 28.75)
        self.assertAlmostEqual(continent.longitude or 0.0, -97.5)

        assert corridor is not None
        self.assertAlmostEqual(corridor.latitude or 0.0, 28.75)
        self.assertAlmostEqual(corridor.longitude or 0.0, -97.5)

        assert region is not None
        self.assertAlmostEqual(region.latitude or 0.0, (30.75 + 34.15) / 2, places=4)
        self.assertAlmostEqual(region.longitude or 0.0, (-99.5 + -106.05) / 2, places=4)

    def test_enrich_reference_location_spatial_fields_hydrates_uk_constituent_country_from_map_units(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                self._location(
                    code="SUBDIVISION_GB_ENG",
                    name="England",
                    location_type="REGION",
                    parent_location_code="COUNTRY_GB",
                    country_code="GB",
                    subdivision_code="GB-ENG",
                    continent_code="EU",
                    now=now,
                )
            )
            session.commit()

            summary = enrich_reference_location_spatial_fields(
                session,
                requested_by="spatial-loader",
                country_features=[],
                subdivision_features=[],
                map_unit_features=[
                    self._polygon_feature(
                        properties={"ADM0_A3": "GBR", "NAME": "England", "GEOUNIT": "England"},
                        coordinates=[[[-5.0, 50.0], [2.0, 50.0], [2.0, 56.0], [-5.0, 56.0], [-5.0, 50.0]]],
                    ),
                ],
            )

            england = session.get(ReferenceLocation, "SUBDIVISION_GB_ENG")

        self.assertEqual(summary.direct_subdivision_match_count, 1)
        self.assertEqual(summary.updated_location_count, 1)
        assert england is not None
        self.assertAlmostEqual(england.latitude or 0.0, 53.0)
        self.assertAlmostEqual(england.longitude or 0.0, -1.5)

    def _location(
        self,
        *,
        code: str,
        name: str,
        location_type: str,
        now: datetime,
        parent_location_code: str | None = None,
        country_code: str | None = None,
        subdivision_code: str | None = None,
        continent_code: str | None = None,
    ) -> ReferenceLocation:
        return ReferenceLocation(
            code=code,
            parent_location_code=parent_location_code,
            name=name,
            location_kind="REGION",
            location_type=location_type,
            market=None,
            city=None,
            subdivision_code=subdivision_code,
            country_code=country_code,
            continent_code=continent_code,
            latitude=None,
            longitude=None,
            region=None,
            timezone=None,
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

    def _polygon_feature(
        self,
        *,
        properties: dict[str, object],
        coordinates: list[list[list[float]]],
    ) -> dict[str, object]:
        return {
            "type": "Feature",
            "properties": properties,
            "geometry": {
                "type": "Polygon",
                "coordinates": coordinates,
            },
        }


if __name__ == "__main__":
    unittest.main()
