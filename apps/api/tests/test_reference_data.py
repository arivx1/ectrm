from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.routes.reference_data import (
    CommodityCreate,
    CommodityStatusUpdate,
    CurrencyCreate,
    CurrencyStatusUpdate,
    LocationCreate,
    LocationStatusUpdate,
    PriceIndexCreate,
    PriceIndexUpdate,
    UnitCreate,
    UnitStatusUpdate,
    create_commodity,
    create_currency,
    create_location,
    create_price_index,
    create_unit,
    deactivate_currency,
    deactivate_commodity,
    deactivate_location,
    deactivate_unit,
    list_price_indices,
    update_price_index,
)


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
            session.query(ReferencePriceIndex).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceCurrency).delete()
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

    def _create_location(self, code: str) -> None:
        with self.SessionLocal() as session:
            create_location(
                LocationCreate(
                    code=code,
                    name=f"{code} Location",
                    location_type="HUB",
                    market="PHYSICAL",
                    country_code="US",
                    region="GULF",
                    timezone="America/Chicago",
                    description="test location",
                    created_by="test-user",
                ),
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


if __name__ == "__main__":
    unittest.main()
