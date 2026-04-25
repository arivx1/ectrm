from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base, Event
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.position import Position
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.routes.events import append_event
from apps.api.app.domains.operations.services.workflow_items import list_trade_workflow_items
from apps.api.app.routes.reference_data import (
    AssetCreate,
    AssetStatusUpdate,
    AssetUpdate,
    BookCreate,
    BookStatusUpdate,
    BookUpdate,
    CommodityCreate,
    CommodityStatusUpdate,
    CounterpartyCreate,
    CounterpartyStatusUpdate,
    CounterpartyUpdate,
    CurrencyCreate,
    CurrencyStatusUpdate,
    LocationCreate,
    LocationStatusUpdate,
    LocationUpdate,
    PriceIndexCreate,
    PriceIndexUpdate,
    PortfolioCreate,
    PortfolioUpdate,
    UnitCreate,
    UnitStatusUpdate,
    activate_asset,
    activate_book,
    create_asset,
    activate_counterparty,
    activate_location,
    create_commodity,
    create_counterparty,
    create_currency,
    create_location,
    create_book,
    create_portfolio,
    create_price_index,
    create_unit,
    deactivate_asset,
    deactivate_book,
    deactivate_counterparty,
    list_counterparties,
    list_counterparty_standards,
    get_book,
    list_books,
    list_asset_standards,
    list_assets,
    deactivate_currency,
    deactivate_commodity,
    deactivate_location,
    deactivate_price_index,
    deactivate_unit,
    list_location_standards,
    list_locations,
    list_price_indices,
    update_book,
    update_asset,
    update_counterparty,
    update_location,
    update_price_index,
)
from apps.api.app.schemas.reference_data import PriceIndexStatusUpdate
from apps.api.app.schemas.event import EventCreate


def coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class ReferenceDataApiTests(unittest.TestCase):
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
            session.query(Event).delete()
            session.query(ReferenceAsset).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceCurrency).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Position).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.query(Trade).delete()
            session.commit()

    def _create_commodity(self, code: str, is_active: bool = True) -> None:
        with self.SessionLocal() as session:
            create_commodity(
                CommodityCreate(
                    code=code,
                    name=f"{code} Commodity",
                    commodity_class="CRUDE_OIL",
                    description="test commodity",
                    created_by="test-user",
                ),
                db=session,
            )
            if not is_active:
                deactivate_commodity(
                    code,
                    CommodityStatusUpdate(updated_by="test-user"),
                    db=session,
                )

    def _create_book(self, code: str, is_active: bool = True) -> None:
        with self.SessionLocal() as session:
            session.add(
                ReferenceBook(
                    code=code,
                    name=f"{code} Book",
                    description="test book",
                    is_active=is_active,
                    effective_from=None,
                    effective_to=None,
                    created_at=datetime.now(timezone.utc),
                    created_by="test-user",
                    updated_at=datetime.now(timezone.utc),
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def _request(self):
        return SimpleNamespace(state=SimpleNamespace(correlation_id="test-correlation"), headers={})

    def _create_currency(self, code: str, symbol: str | None = None) -> None:
        with self.SessionLocal() as session:
            create_currency(
                CurrencyCreate(
                    code=code,
                    name=f"{code} Currency",
                    symbol=symbol,
                    description="test currency",
                    created_by="test-user",
                ),
                db=session,
            )

    def _create_unit(self, code: str, dimension: str = "VOLUME") -> None:
        with self.SessionLocal() as session:
            create_unit(
                UnitCreate(
                    code=code,
                    name=f"{code} Unit",
                    commodity_class="CRUDE_OIL",
                    dimension=dimension,
                    description="test unit",
                    created_by="test-user",
                ),
                db=session,
            )

    def test_book_crud_normalizes_and_round_trips_through_shared_handlers(self) -> None:
        with self.SessionLocal() as session:
            created = create_book(
                BookCreate(
                    code=" crude_phys ",
                    name=" Crude Physical ",
                    description="test book",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(created.code, "CRUDE_PHYS")
        self.assertEqual(created.name, "Crude Physical")
        self.assertTrue(created.is_active)

        with self.SessionLocal() as session:
            fetched = get_book(" crude_phys ", db=session)
            updated = update_book(
                "crude_phys",
                BookUpdate(
                    name=" Physical Oil ",
                    description="updated book",
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated = deactivate_book(
                "CRUDE_PHYS",
                BookStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated = activate_book(
                " crude_phys ",
                BookStatusUpdate(updated_by="test-user"),
                db=session,
            )
            listed = list_books(
                q="Physical",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )

        self.assertEqual(fetched.code, "CRUDE_PHYS")
        self.assertEqual(updated.name, "Physical Oil")
        self.assertEqual(updated.description, "updated book")
        self.assertEqual(updated.version, 2)
        self.assertFalse(deactivated.is_active)
        self.assertEqual(deactivated.version, 3)
        self.assertTrue(reactivated.is_active)
        self.assertEqual(reactivated.version, 4)
        self.assertEqual([book.code for book in listed], ["CRUDE_PHYS"])

    def _create_location(
        self,
        code: str,
        *,
        location_kind: str = "POINT",
        location_type: str = "HUB",
        parent_location_code: str | None = None,
    ) -> None:
        with self.SessionLocal() as session:
            create_location(
                LocationCreate(
                    code=code,
                    name=f"{code} Location",
                    location_kind=location_kind,
                    location_type=location_type,
                    parent_location_code=parent_location_code,
                    market="PHYSICAL",
                    city="Test City",
                    subdivision_code="US-TX",
                    country_code="US",
                    continent_code="NA",
                    latitude=29.0,
                    longitude=-95.0,
                    region="GULF",
                    timezone="America/Chicago",
                    description="test location",
                    created_by="test-user",
                ),
                db=session,
            )

    def test_create_location_supports_hierarchy_and_coordinates(self) -> None:
        self._create_location("USGC", location_kind="REGION", location_type="REGION")

        with self.SessionLocal() as session:
            payload = create_location(
                LocationCreate(
                    code=" hsc ",
                    name="Houston Ship Channel",
                    location_kind=" point ",
                    location_type=" terminal ",
                    parent_location_code=" usgc ",
                    market=" physical ",
                    city=" Houston ",
                    subdivision_code=" us-tx ",
                    country_code=" us ",
                    continent_code=" na ",
                    latitude=29.7285,
                    longitude=-95.265,
                    region=" Gulf Coast ",
                    timezone=" America/Chicago ",
                    description="test location",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(payload.code, "HSC")
        self.assertEqual(payload.location_kind, "POINT")
        self.assertEqual(payload.location_type, "TERMINAL")
        self.assertEqual(payload.parent_location_code, "USGC")
        self.assertEqual(payload.market, "PHYSICAL")
        self.assertEqual(payload.city, "Houston")
        self.assertEqual(payload.subdivision_code, "US-TX")
        self.assertEqual(payload.country_code, "US")
        self.assertEqual(payload.continent_code, "NA")
        self.assertEqual(payload.region, "Gulf Coast")
        self.assertEqual(payload.timezone, "America/Chicago")
        self.assertAlmostEqual(payload.latitude or 0.0, 29.7285)
        self.assertAlmostEqual(payload.longitude or 0.0, -95.265)

    def test_location_parent_must_be_active_region_and_cycles_are_rejected(self) -> None:
        self._create_location("POINT_A", location_kind="POINT", location_type="HUB")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Parent location must be an active REGION"):
                create_location(
                    LocationCreate(
                        code="POINT_B",
                        name="Point B",
                        location_kind="POINT",
                        location_type="HUB",
                        parent_location_code="POINT_A",
                        market="PHYSICAL",
                        city="Test City",
                        subdivision_code="US-TX",
                        country_code="US",
                        continent_code="NA",
                        latitude=30.0,
                        longitude=-95.0,
                        region="Test Region",
                        timezone="America/Chicago",
                        description="test location",
                        created_by="test-user",
                    ),
                    db=session,
                )

        self._create_location("REGION_A", location_kind="REGION", location_type="REGION")
        self._create_location(
            "REGION_B",
            location_kind="REGION",
            location_type="REGION",
            parent_location_code="REGION_A",
        )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Location hierarchy cannot contain cycles"):
                update_location(
                    "REGION_A",
                    LocationUpdate(parent_location_code="REGION_B", updated_by="test-user"),
                    db=session,
                )

    def test_deactivate_location_blocked_by_active_child_location(self) -> None:
        self._create_location("USGC", location_kind="REGION", location_type="REGION")
        self._create_location(
            "HSC",
            location_kind="POINT",
            location_type="TERMINAL",
            parent_location_code="USGC",
        )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Location cannot be deactivated while active child locations reference it"):
                deactivate_location("USGC", LocationStatusUpdate(updated_by="test-user"), db=session)

    def test_location_crud_lifecycle_preserves_shared_behavior(self) -> None:
        with self.SessionLocal() as session:
            created = create_location(
                LocationCreate(
                    code="HSC",
                    name="Houston Ship Channel",
                    location_kind="POINT",
                    location_type="TERMINAL",
                    market="PHYSICAL",
                    city="Houston",
                    subdivision_code="US-TX",
                    country_code="US",
                    continent_code="NA",
                    latitude=29.7285,
                    longitude=-95.265,
                    region="Gulf Coast",
                    timezone="America/Chicago",
                    description="test location",
                    created_by="test-user",
                ),
                db=session,
            )
            updated = update_location(
                "HSC",
                LocationUpdate(
                    city=" Pasadena ",
                    region=" Gulf Coast East ",
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated = deactivate_location(
                "HSC",
                LocationStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated = activate_location(
                "HSC",
                LocationStatusUpdate(updated_by="test-user"),
                db=session,
            )

        self.assertEqual(created.city, "Houston")
        self.assertEqual(created.version, 1)
        self.assertEqual(updated.city, "Pasadena")
        self.assertEqual(updated.region, "Gulf Coast East")
        self.assertEqual(updated.version, 2)
        self.assertFalse(deactivated.is_active)
        self.assertEqual(deactivated.version, 3)
        self.assertTrue(reactivated.is_active)
        self.assertEqual(reactivated.version, 4)

    def test_create_location_rejects_invalid_standard_codes(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "country_code 'ZZ' must be a valid ISO 3166-1 alpha-2 code"):
                create_location(
                    LocationCreate(
                        code="BAD_COUNTRY",
                        name="Bad Country",
                        location_kind="POINT",
                        location_type="HUB",
                        market="PHYSICAL",
                        city="Test City",
                        subdivision_code="ZZ-XX",
                        country_code="ZZ",
                        continent_code="NA",
                        latitude=30.0,
                        longitude=-95.0,
                        region="Test Region",
                        timezone="America/Chicago",
                        description="test location",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "timezone 'Mars/Olympus' must be a valid IANA timezone name"):
                create_location(
                    LocationCreate(
                        code="BAD_TZ",
                        name="Bad Timezone",
                        location_kind="POINT",
                        location_type="HUB",
                        market="PHYSICAL",
                        city="Test City",
                        subdivision_code="US-TX",
                        country_code="US",
                        continent_code="NA",
                        latitude=30.0,
                        longitude=-95.0,
                        region="Test Region",
                        timezone="Mars/Olympus",
                        description="test location",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_create_location_rejects_invalid_type_for_kind_and_market_code(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "location_type 'REGION' is invalid for POINT"):
                create_location(
                    LocationCreate(
                        code="BAD_TYPE",
                        name="Bad Type",
                        location_kind="POINT",
                        location_type="REGION",
                        market="PHYSICAL",
                        city="Test City",
                        subdivision_code="US-TX",
                        country_code="US",
                        continent_code="NA",
                        latitude=30.0,
                        longitude=-95.0,
                        region="Test Region",
                        timezone="America/Chicago",
                        description="test location",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "market 'NOT_A_REAL_MARKET' is invalid for locations"):
                create_location(
                    LocationCreate(
                        code="BAD_MARKET",
                        name="Bad Market",
                        location_kind="POINT",
                        location_type="HUB",
                        market="not a real market",
                        city="Test City",
                        subdivision_code="US-TX",
                        country_code="US",
                        continent_code="NA",
                        latitude=30.0,
                        longitude=-95.0,
                        region="Test Region",
                        timezone="America/Chicago",
                        description="test location",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_list_location_standards_returns_controlled_taxonomy(self) -> None:
        payload = list_location_standards()

        self.assertEqual(payload.default_location_kind, "POINT")
        self.assertEqual(payload.default_location_type_by_kind["POINT"], "HUB")
        self.assertEqual(payload.default_location_type_by_kind["REGION"], "REGION")
        self.assertEqual(payload.location_kinds, ["POINT", "REGION"])
        self.assertIn("TERMINAL", payload.location_types_by_kind["POINT"])
        self.assertIn("PADD", payload.location_types_by_kind["REGION"])
        self.assertIn("PHYSICAL", payload.market_codes)
        self.assertEqual(payload.continent_codes, ["AF", "AN", "AS", "EU", "NA", "OC", "SA"])

    def test_list_locations_rejects_invalid_location_type_filter(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "location_type 'NOT_A_REAL_TYPE' is invalid for locations"):
                list_locations(
                    q=None,
                    market=None,
                    location_kind=None,
                    location_type="not a real type",
                    is_active=None,
                    limit=50,
                    offset=0,
                    db=session,
                )

    def test_create_price_index_requires_active_commodity(self) -> None:
        self._create_currency("USD", "$")
        self._create_unit("BBL")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Commodity 'WTI' is not active"):
                create_price_index(
                    PriceIndexCreate(
                        code="WTI_M1",
                        name="WTI Front Month",
                        commodity_code="WTI",
                        currency_code="usd",
                        unit_code="bbl",
                        provider="ICE",
                        market="nymex",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_create_price_index_normalizes_and_returns_payload(self) -> None:
        self._create_commodity("WTI")
        self._create_currency("USD", "$")
        self._create_unit("BBL")
        self._create_location("CUSHING")

        with self.SessionLocal() as session:
            payload = create_price_index(
                PriceIndexCreate(
                    code="wti_m1",
                    name="WTI Front Month",
                    commodity_code="wti",
                    currency_code="usd",
                    unit_code="bbl",
                    provider="  ICE  ",
                    market="  nymex  ",
                    location_code="  cushing  ",
                    calendar_code="  usny  ",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(payload.code, "WTI_M1")
        self.assertEqual(payload.commodity_code, "WTI")
        self.assertEqual(payload.currency_code, "USD")
        self.assertEqual(payload.unit_code, "BBL")
        self.assertEqual(payload.provider, "ICE")
        self.assertEqual(payload.market, "nymex")
        self.assertEqual(payload.location_code, "CUSHING")
        self.assertEqual(payload.calendar_code, "USNY")

    def test_update_price_index_rejects_inactive_commodity(self) -> None:
        self._create_commodity("WTI")
        self._create_commodity("BRENT", is_active=False)
        self._create_currency("USD", "$")
        self._create_unit("BBL")

        with self.SessionLocal() as session:
            create_price_index(
                PriceIndexCreate(
                    code="WTI_M1",
                    name="WTI Front Month",
                    commodity_code="WTI",
                    currency_code="USD",
                    unit_code="BBL",
                    provider="ICE",
                    created_by="test-user",
                ),
                db=session,
            )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Commodity 'BRENT' is not active"):
                update_price_index(
                    "WTI_M1",
                    PriceIndexUpdate(
                        commodity_code="BRENT",
                        updated_by="test-user",
                    ),
                    db=session,
                )

    def test_list_price_indices_filters_by_commodity_code(self) -> None:
        self._create_commodity("WTI")
        self._create_commodity("BRENT")
        self._create_currency("USD", "$")
        self._create_unit("BBL")

        with self.SessionLocal() as session:
            for code, commodity_code in (("WTI_M1", "WTI"), ("BRENT_M1", "BRENT")):
                create_price_index(
                    PriceIndexCreate(
                        code=code,
                        name=code,
                        commodity_code=commodity_code,
                        currency_code="USD",
                        unit_code="BBL",
                        provider="ICE",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            payload = list_price_indices(
                q=None,
                commodity_code="WTI",
                is_active=None,
                limit=50,
                offset=0,
                db=session,
            )

        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0].code, "WTI_M1")

    def test_create_price_index_requires_active_currency_unit_and_location(self) -> None:
        self._create_commodity("WTI")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Currency 'USD' is not active"):
                create_price_index(
                    PriceIndexCreate(
                        code="WTI_M1",
                        name="WTI Front Month",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="ICE",
                        created_by="test-user",
                    ),
                    db=session,
                )

        self._create_currency("USD", "$")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Unit 'BBL' is not active"):
                create_price_index(
                    PriceIndexCreate(
                        code="WTI_M1",
                        name="WTI Front Month",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="ICE",
                        created_by="test-user",
                    ),
                    db=session,
                )

        self._create_unit("BBL")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Location 'CUSHING' is not active"):
                create_price_index(
                    PriceIndexCreate(
                        code="WTI_M1",
                        name="WTI Front Month",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="ICE",
                        location_code="CUSHING",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_deactivate_currency_unit_and_location_blocked_by_active_price_index(self) -> None:
        self._create_commodity("WTI")
        self._create_currency("USD", "$")
        self._create_unit("BBL")
        self._create_location("CUSHING")

        with self.SessionLocal() as session:
            create_price_index(
                PriceIndexCreate(
                    code="WTI_M1",
                    name="WTI Front Month",
                    commodity_code="WTI",
                    currency_code="USD",
                    unit_code="BBL",
                    provider="ICE",
                    location_code="CUSHING",
                    created_by="test-user",
                ),
                db=session,
            )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Currency cannot be deactivated while active price indices reference it"):
                deactivate_currency("USD", CurrencyStatusUpdate(updated_by="test-user"), db=session)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Unit cannot be deactivated while active price indices reference it"):
                deactivate_unit("BBL", UnitStatusUpdate(updated_by="test-user"), db=session)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Location cannot be deactivated while active price indices reference it"):
                deactivate_location("CUSHING", LocationStatusUpdate(updated_by="test-user"), db=session)

    def test_trade_create_requires_active_book(self) -> None:
        self._create_commodity("WTI")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Book is required and must be selected from reference data"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-BOOK-1",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

        self._create_book("CRUDE_PHYS", is_active=False)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Book 'CRUDE_PHYS' is not active in reference data"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-BOOK-2",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

        with self.SessionLocal() as session:
            session.query(ReferenceBook).delete()
            session.commit()

        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            event = append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-BOOK-3",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "book": "crude_phys",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "price": 80,
                        "volume": 1000,
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-BOOK-3").first()

        self.assertEqual(event.aggregate_id, "T-BOOK-3")
        self.assertIsNotNone(trade)
        self.assertEqual(trade.book, "CRUDE_PHYS")

    def test_trade_sell_updates_positions_as_negative_volume(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SELL-1",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "SELL",
                        "price": 80,
                        "volume": 1000,
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            position = session.query(Position).filter(Position.commodity == "WTI").one()

        self.assertEqual(float(position.net_volume), -1000.0)

    def test_trade_header_fields_validate_active_counterparty_and_matching_portfolio(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Counterparty 'SHELL_TRADING' is not active"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-HEADER-1",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "counterparty": "SHELL_TRADING",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

        with self.SessionLocal() as session:
            create_counterparty(
                CounterpartyCreate(
                    code="SHELL_TRADING",
                    name="Shell Trading",
                    counterparty_type="supplier",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )
            create_portfolio(
                PortfolioCreate(
                    code="POWER_DISCRETIONARY",
                    name="Power Discretionary",
                    book_code="CRUDE_PHYS",
                    description="test portfolio",
                    created_by="test-user",
                ),
                db=session,
            )
            portfolio = session.query(ReferencePortfolio).filter_by(code="POWER_DISCRETIONARY").one()
            portfolio.book_code = "POWER_BOOK"
            session.commit()

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Portfolio 'POWER_DISCRETIONARY' belongs to book 'POWER_BOOK'"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-HEADER-2",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "portfolio": "POWER_DISCRETIONARY",
                            "counterparty": "SHELL_TRADING",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

    def test_trade_create_rejects_non_tradable_counterparty_credit_status(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            create_counterparty(
                CounterpartyCreate(
                    code="SHELL_TRADING",
                    name="Shell Trading",
                    counterparty_type="supplier",
                    credit_status="blocked",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )

            with self.assertRaisesRegex(Exception, "credit status is 'BLOCKED'"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-1",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "counterparty": "SHELL_TRADING",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

    def test_trade_amend_rejects_existing_counterparty_that_becomes_non_tradable(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            create_counterparty(
                CounterpartyCreate(
                    code="SHELL_TRADING",
                    name="Shell Trading",
                    counterparty_type="supplier",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-CREDIT-2",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "counterparty": "SHELL_TRADING",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "price": 80,
                        "volume": 1000,
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            update_counterparty(
                "SHELL_TRADING",
                CounterpartyUpdate(
                    credit_status="on hold",
                    updated_by="test-user",
                ),
                db=session,
            )

            with self.assertRaisesRegex(Exception, "credit status is 'ON_HOLD'"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-2",
                        event_type="TradeAmended",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={"price": 81},
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

    def test_trade_amend_persists_extended_header_fields(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            create_counterparty(
                CounterpartyCreate(
                    code="SHELL_TRADING",
                    name="Shell Trading",
                    counterparty_type="supplier",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )
            create_counterparty(
                CounterpartyCreate(
                    code="BP_TRADING",
                    name="BP Trading",
                    counterparty_type="supplier",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )
            create_portfolio(
                PortfolioCreate(
                    code="OIL_DISCRETIONARY",
                    name="Oil Discretionary",
                    book_code="CRUDE_PHYS",
                    description="test portfolio",
                    created_by="test-user",
                ),
                db=session,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-HEADER-3",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "external_trade_id": " ext-001 ",
                        "source_system": "etrm",
                        "execution_timestamp": "2026-03-11T08:30:00-05:00",
                        "book": "CRUDE_PHYS",
                        "portfolio": "oil_discretionary",
                        "counterparty": "shell_trading",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "pricing_status": "priced",
                        "settlement_status": "pending",
                        "trader_user": "trader.alpha",
                        "trade_side": "BUY",
                        "price": 80,
                        "volume": 1000,
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-HEADER-3",
                    event_type="TradeAmended",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "external_trade_id": None,
                        "source_system": "ice_csv",
                        "execution_timestamp": "2026-03-11T14:45:00Z",
                        "counterparty": "BP_TRADING",
                        "portfolio": None,
                        "pricing_status": "pending",
                        "settlement_status": "settled",
                        "trader_user": "trader.beta",
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-HEADER-3").one()
            list_trade_workflow_items(session, include_closed=True)
            trade = session.query(Trade).filter(Trade.trade_id == "T-HEADER-3").one()

        self.assertIsNone(trade.external_trade_id)
        self.assertEqual(trade.source_system, "ICE_CSV")
        self.assertEqual(
            coerce_utc(trade.execution_timestamp),
            datetime(2026, 3, 11, 14, 45, tzinfo=timezone.utc),
        )
        self.assertEqual(trade.counterparty, "BP_TRADING")
        self.assertIsNone(trade.portfolio)
        self.assertEqual(trade.pricing_status, "PENDING")
        self.assertEqual(trade.settlement_status, "SETTLED")
        self.assertEqual(trade.trader_user, "trader.beta")

    def test_trade_header_fields_reject_invalid_status_values(self) -> None:
        self._create_commodity("WTI")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Pricing status 'UNKNOWN' is invalid"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-HEADER-INVALID-1",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "pricing_status": "unknown",
                            "trade_side": "BUY",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

            with self.assertRaisesRegex(Exception, "Settlement status 'COMPLETE' is invalid"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-HEADER-INVALID-2",
                        event_type="TradeCreated",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "settlement_status": "complete",
                            "trade_side": "BUY",
                            "price": 80,
                            "volume": 1000,
                        },
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

    def test_swap_positions_use_trade_legs(self) -> None:
        self._create_commodity("WTI")
        self._create_commodity("BRENT")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SWAP-1",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_structure": "SWAP",
                        "price": 0,
                        "volume": 0,
                        "legs": [
                            {
                                "leg_no": 1,
                                "side": "BUY",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "WTI",
                                "volume": 1000,
                            },
                            {
                                "leg_no": 2,
                                "side": "SELL",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "BRENT",
                                "volume": 950,
                            },
                        ],
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

            positions = {
                row.commodity: float(row.net_volume)
                for row in session.query(Position).all()
            }

        self.assertEqual(positions["WTI"], 1000.0)
        self.assertEqual(positions["BRENT"], -950.0)

    def test_trade_amend_requires_existing_trade(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Trade not found"):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-MISSING-1",
                        event_type="TradeAmended",
                        occurred_at=datetime.now(timezone.utc),
                        actor_id="test-user",
                        payload={"price": 92},
                        schema_version=1,
                    ),
                    request=self._request(),
                    db=session,
                )

    def test_deactivate_price_index_rejected_while_active_trade_references_it(self) -> None:
        self._create_commodity("WTI")
        self._create_currency("USD", "$")
        self._create_unit("BBL")
        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            create_price_index(
                PriceIndexCreate(
                    code="WTI_M1",
                    name="WTI Front Month",
                    commodity_code="WTI",
                    currency_code="USD",
                    unit_code="BBL",
                    provider="ICE",
                    created_by="test-user",
                ),
                db=session,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-INDEX-1",
                    event_type="TradeCreated",
                    occurred_at=datetime.now(timezone.utc),
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "INDEX",
                        "price_index_code": "WTI_M1",
                        "price": None,
                        "volume": 1000,
                        "trade_side": "BUY",
                    },
                    schema_version=1,
                ),
                request=self._request(),
                db=session,
            )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Price index cannot be deactivated while active trades reference it"):
                deactivate_price_index(
                    "WTI_M1",
                    PriceIndexStatusUpdate(updated_by="test-user"),
                    db=session,
                )

    def test_create_counterparty_normalizes_type_and_country(self) -> None:
        with self.SessionLocal() as session:
            payload = create_counterparty(
                CounterpartyCreate(
                    code="shell_trading",
                    name="Shell Trading",
                    short_name="Shell",
                    legal_entity_name="Shell Trading US Company",
                    counterparty_type="supplier",
                    country_code="us",
                    credit_status=" approved ",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(payload.code, "SHELL_TRADING")
        self.assertEqual(payload.counterparty_type, "SUPPLIER")
        self.assertEqual(payload.country_code, "US")
        self.assertEqual(payload.credit_status, "APPROVED")

    def test_update_counterparty_allows_credit_status_changes(self) -> None:
        with self.SessionLocal() as session:
            create_counterparty(
                CounterpartyCreate(
                    code="shell_trading",
                    name="Shell Trading",
                    short_name="Shell",
                    legal_entity_name="Shell Trading US Company",
                    counterparty_type="supplier",
                    country_code="us",
                    credit_status="approved",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )

            payload = update_counterparty(
                "SHELL_TRADING",
                CounterpartyUpdate(
                    credit_status=" review required ",
                    updated_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(payload.credit_status, "REVIEW_REQUIRED")

    def test_counterparty_crud_lifecycle_preserves_shared_behavior(self) -> None:
        with self.SessionLocal() as session:
            created = create_counterparty(
                CounterpartyCreate(
                    code="shell_trading",
                    name="Shell Trading",
                    short_name="Shell",
                    legal_entity_name="Shell Trading US Company",
                    counterparty_type="supplier",
                    country_code="us",
                    credit_status="approved",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )
            updated = update_counterparty(
                "SHELL_TRADING",
                CounterpartyUpdate(
                    short_name=" Shell US ",
                    credit_status=" review required ",
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated = deactivate_counterparty(
                "SHELL_TRADING",
                CounterpartyStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated = activate_counterparty(
                "SHELL_TRADING",
                CounterpartyStatusUpdate(updated_by="test-user"),
                db=session,
            )

        self.assertEqual(created.short_name, "Shell")
        self.assertEqual(created.version, 1)
        self.assertEqual(updated.short_name, "Shell US")
        self.assertEqual(updated.credit_status, "REVIEW_REQUIRED")
        self.assertEqual(updated.version, 2)
        self.assertFalse(deactivated.is_active)
        self.assertEqual(deactivated.version, 3)
        self.assertTrue(reactivated.is_active)
        self.assertEqual(reactivated.version, 4)

    def test_create_counterparty_rejects_invalid_type_and_country(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "counterparty_type 'NOT_A_REAL_TYPE' is invalid"):
                create_counterparty(
                    CounterpartyCreate(
                        code="BAD_CP_TYPE",
                        name="Bad Counterparty Type",
                        short_name="Bad Type",
                        legal_entity_name="Bad Counterparty Type LLC",
                        counterparty_type="not a real type",
                        country_code="US",
                        description="test counterparty",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "credit_status 'PENDING_REVIEW' is invalid"):
                create_counterparty(
                    CounterpartyCreate(
                        code="BAD_CP_CREDIT",
                        name="Bad Counterparty Credit",
                        short_name="Bad Credit",
                        legal_entity_name="Bad Counterparty Credit LLC",
                        counterparty_type="supplier",
                        country_code="US",
                        credit_status="pending review",
                        description="test counterparty",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "country_code 'ZZ' must be a valid ISO 3166-1 alpha-2 code"):
                create_counterparty(
                    CounterpartyCreate(
                        code="BAD_CP_COUNTRY",
                        name="Bad Counterparty Country",
                        short_name="Bad Country",
                        legal_entity_name="Bad Counterparty Country LLC",
                        counterparty_type="supplier",
                        country_code="zz",
                        description="test counterparty",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_list_counterparty_standards_returns_controlled_taxonomy(self) -> None:
        payload = list_counterparty_standards()

        self.assertEqual(payload.default_counterparty_type, "SUPPLIER")
        self.assertIn("SUPPLIER", payload.counterparty_types)
        self.assertIn("END_USER", payload.counterparty_types)
        self.assertIn("BANK", payload.counterparty_types)
        self.assertEqual(payload.default_counterparty_credit_status, "APPROVED")
        self.assertEqual(
            payload.counterparty_credit_statuses,
            ["APPROVED", "REVIEW_REQUIRED", "ON_HOLD", "BLOCKED"],
        )

    def test_list_counterparties_rejects_invalid_type_filter(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "counterparty_type 'NOT_A_REAL_TYPE' is invalid"):
                list_counterparties(
                    q=None,
                    counterparty_type="not a real type",
                    is_active=None,
                    limit=50,
                    offset=0,
                    db=session,
                )

    def test_portfolio_requires_active_book(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Book 'CRUDE_PHYS' is not active"):
                create_portfolio(
                    PortfolioCreate(
                        code="OIL_DISCRETIONARY",
                        name="Oil Discretionary",
                        book_code="CRUDE_PHYS",
                        owner="ops",
                        strategy="Directional",
                        trader_persona="Speculator",
                        risk_archetype="directional",
                        description="test portfolio",
                        created_by="test-user",
                    ),
                    db=session,
                )

        self._create_book("CRUDE_PHYS", is_active=True)

        with self.SessionLocal() as session:
            payload = create_portfolio(
                PortfolioCreate(
                    code="OIL_DISCRETIONARY",
                    name="Oil Discretionary",
                    book_code="crude_phys",
                    owner="ops",
                    strategy="Directional",
                    trader_persona="Speculator",
                    risk_archetype="directional",
                    description="test portfolio",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(payload.code, "OIL_DISCRETIONARY")
        self.assertEqual(payload.book_code, "CRUDE_PHYS")
        self.assertEqual(payload.trader_persona, "Speculator")
        self.assertEqual(payload.risk_archetype, "DIRECTIONAL")

        with self.SessionLocal() as session:
            portfolio = session.query(ReferencePortfolio).filter_by(code="OIL_DISCRETIONARY").first()
            self.assertIsNotNone(portfolio)
            self.assertEqual(portfolio.trader_persona, "Speculator")
            self.assertEqual(portfolio.risk_archetype, "DIRECTIONAL")

        self._create_book("POWER_BOOK", is_active=False)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Book 'POWER_BOOK' is not active"):
                update_payload = PortfolioUpdate(book_code="POWER_BOOK", updated_by="test-user")
                from apps.api.app.routes.reference_data import update_portfolio

                update_portfolio("OIL_DISCRETIONARY", update_payload, db=session)

        with self.SessionLocal() as session:
            from apps.api.app.routes.reference_data import update_portfolio

            updated = update_portfolio(
                "OIL_DISCRETIONARY",
                PortfolioUpdate(
                    trader_persona="Risk Manager",
                    risk_archetype="risk_reduction",
                    updated_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(updated.trader_persona, "Risk Manager")
        self.assertEqual(updated.risk_archetype, "RISK_REDUCTION")

    def test_asset_crud_supports_governed_facility_records(self) -> None:
        self._create_commodity("NATURAL_GAS")
        self._create_unit("MMBTU", dimension="ENERGY")
        self._create_location("PERMIAN", location_kind="REGION", location_type="BASIN")

        with self.SessionLocal() as session:
            created = create_asset(
                AssetCreate(
                    code=" waha_pipe ",
                    name=" Waha Pipe ",
                    asset_class=" pipeline ",
                    asset_type=" transmission ",
                    asset_reality=" real ",
                    commodity_code=" natural_gas ",
                    location_code=" permian ",
                    capacity_value=2400.5,
                    capacity_unit_code=" mmbtu ",
                    operator_name=" Midstream Ops ",
                    operating_status=" operating ",
                    description="test asset",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(created.code, "WAHA_PIPE")
        self.assertEqual(created.asset_class, "PIPELINE")
        self.assertEqual(created.asset_type, "TRANSMISSION")
        self.assertEqual(created.asset_reality, "REAL")
        self.assertEqual(created.commodity_code, "NATURAL_GAS")
        self.assertEqual(created.location_code, "PERMIAN")
        self.assertEqual(created.capacity_unit_code, "MMBTU")
        self.assertEqual(created.operator_name, "Midstream Ops")
        self.assertEqual(created.operating_status, "OPERATING")

        standards = list_asset_standards()
        self.assertEqual(standards.default_asset_class, "PIPELINE")
        self.assertIn("GENERATION", standards.asset_classes)
        self.assertEqual(standards.default_asset_reality, "REAL")
        self.assertIn("SIMULATED", standards.asset_realities)

        with self.SessionLocal() as session:
            listed = list_assets(
                asset_class="pipeline",
                asset_type="transmission",
                asset_reality="real",
                operating_status="operating",
                commodity_code="natural_gas",
                location_code="permian",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )
            updated = update_asset(
                "waha_pipe",
                AssetUpdate(
                    asset_class="processing",
                    asset_type="gas plant",
                    asset_reality="simulated",
                    commodity_code=None,
                    location_code=None,
                    capacity_value=None,
                    capacity_unit_code=None,
                    operator_name=" Plant Ops ",
                    operating_status="idled",
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated = deactivate_asset(
                "WAHA_PIPE",
                AssetStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated = activate_asset(
                "WAHA_PIPE",
                AssetStatusUpdate(updated_by="test-user"),
                db=session,
            )

        self.assertEqual([asset.code for asset in listed], ["WAHA_PIPE"])
        self.assertEqual(updated.asset_class, "PROCESSING")
        self.assertEqual(updated.asset_type, "GAS_PLANT")
        self.assertEqual(updated.asset_reality, "SIMULATED")
        self.assertIsNone(updated.commodity_code)
        self.assertIsNone(updated.location_code)
        self.assertIsNone(updated.capacity_value)
        self.assertIsNone(updated.capacity_unit_code)
        self.assertEqual(updated.operator_name, "Plant Ops")
        self.assertEqual(updated.operating_status, "IDLED")
        self.assertFalse(deactivated.is_active)
        self.assertTrue(reactivated.is_active)

    def test_asset_creation_rejects_invalid_types_inactive_references_and_partial_capacity(self) -> None:
        self._create_commodity("ACTIVE_GAS")
        self._create_commodity("INACTIVE_GAS", is_active=False)
        self._create_unit("MMBTU", dimension="ENERGY")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "asset_type 'THERMAL' is invalid for PIPELINE"):
                create_asset(
                    AssetCreate(
                        code="BAD_TYPE",
                        name="Bad Type",
                        asset_class="PIPELINE",
                        asset_type="THERMAL",
                        asset_reality="REAL",
                        commodity_code="ACTIVE_GAS",
                        capacity_value=100.0,
                        capacity_unit_code="MMBTU",
                        operating_status="OPERATING",
                        description="bad type",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Commodity 'INACTIVE_GAS' is not active in reference data"):
                create_asset(
                    AssetCreate(
                        code="BAD_COMMODITY",
                        name="Bad Commodity",
                        asset_class="GENERATION",
                        asset_type="THERMAL",
                        asset_reality="REAL",
                        commodity_code="INACTIVE_GAS",
                        operating_status="OPERATING",
                        description="bad commodity",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "capacity_value and capacity_unit_code must be provided together"):
                create_asset(
                    AssetCreate(
                        code="BAD_CAPACITY",
                        name="Bad Capacity",
                        asset_class="GENERATION",
                        asset_type="THERMAL",
                        asset_reality="REAL",
                        commodity_code="ACTIVE_GAS",
                        capacity_value=100.0,
                        operating_status="OPERATING",
                        description="bad capacity",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "asset_reality 'FAKE' is invalid"):
                create_asset(
                    AssetCreate(
                        code="BAD_REALITY",
                        name="Bad Reality",
                        asset_class="GENERATION",
                        asset_type="THERMAL",
                        asset_reality="FAKE",
                        commodity_code="ACTIVE_GAS",
                        operating_status="OPERATING",
                        description="bad reality",
                        created_by="test-user",
                    ),
                    db=session,
                )


if __name__ == "__main__":
    unittest.main()
