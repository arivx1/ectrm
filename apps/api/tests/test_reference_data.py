from __future__ import annotations

import enum
import unittest
from datetime import date, datetime, timezone
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
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_calendar_holiday import ReferenceCalendarHoliday
from apps.api.app.models.reference_calendar_overlay import ReferenceCalendarOverlay
from apps.api.app.models.reference_calendar_rule import ReferenceCalendarRule
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_pipeline_detail import ReferencePipelineDetail
from apps.api.app.models.reference_pipeline_path import ReferencePipelinePath
from apps.api.app.models.reference_pipeline_point import ReferencePipelinePoint
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_rail_line import ReferenceRailLine
from apps.api.app.models.reference_rail_route import ReferenceRailRoute
from apps.api.app.models.reference_spatial_feature import ReferenceSpatialFeature
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.position import Position
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.routes.events import append_event
from apps.api.app.domains.operations.services.workflow_items import list_trade_workflow_items
from apps.api.app.routes.reference_data import (
    AssetCreate,
    CalendarBusinessDayCountOut,
    CalendarBusinessDayDateOut,
    CalendarCreate,
    CalendarHolidayCreate,
    CalendarHolidayImportRequest,
    CalendarHolidayStatusUpdate,
    CalendarHolidayUpdate,
    CalendarOverlayCreate,
    CalendarOverlayStatusUpdate,
    CalendarOverlayUpdate,
    CalendarRuleCreate,
    CalendarRuleStatusUpdate,
    CalendarRuleUpdate,
    CalendarStatusUpdate,
    CalendarUpdate,
    AssetStatusUpdate,
    AssetUpdate,
    BookCreate,
    BookStatusUpdate,
    BookUpdate,
    CommodityCreate,
    CommodityUpdate,
    CommodityStatusUpdate,
    CounterpartyCreate,
    CounterpartyStatusUpdate,
    CounterpartyUpdate,
    CurrencyCreate,
    CurrencyStatusUpdate,
    LocationCreate,
    LocationStatusUpdate,
    LocationUpdate,
    PipelineDetailCreate,
    PipelineDetailStatusUpdate,
    PipelineDetailUpdate,
    PipelinePathCreate,
    PipelinePathStatusUpdate,
    PipelinePathUpdate,
    PipelinePointCreate,
    PipelinePointStatusUpdate,
    PipelinePointUpdate,
    RailLineCreate,
    RailLineStatusUpdate,
    RailLineUpdate,
    RailRouteCreate,
    RailRouteStatusUpdate,
    RailRouteUpdate,
    PriceIndexCreate,
    PriceIndexUpdate,
    PortfolioCreate,
    PortfolioUpdate,
    SpatialFeatureCreate,
    SpatialFeatureStatusUpdate,
    SpatialFeatureUpdate,
    UnitCreate,
    UnitStatusUpdate,
    activate_spatial_feature,
    activate_asset,
    activate_book,
    activate_calendar,
    activate_calendar_holiday,
    activate_calendar_overlay,
    activate_calendar_rule,
    add_calendar_business_days,
    count_calendar_business_days,
    create_asset,
    create_calendar,
    create_calendar_holiday,
    import_calendar_holidays,
    create_calendar_overlay,
    create_calendar_rule,
    create_spatial_feature,
    activate_counterparty,
    activate_location,
    activate_pipeline_detail,
    activate_pipeline_path,
    activate_pipeline_point,
    activate_rail_line,
    activate_rail_route,
    create_commodity,
    create_counterparty,
    create_currency,
    create_location,
    create_pipeline_detail,
    create_pipeline_path,
    create_pipeline_point,
    create_rail_line,
    create_rail_route,
    create_book,
    create_portfolio,
    create_price_index,
    create_unit,
    deactivate_asset,
    deactivate_book,
    deactivate_calendar,
    deactivate_calendar_holiday,
    deactivate_calendar_overlay,
    deactivate_calendar_rule,
    deactivate_counterparty,
    deactivate_pipeline_detail,
    deactivate_rail_line,
    deactivate_rail_route,
    list_counterparties,
    list_counterparty_standards,
    get_book,
    get_commodity,
    get_calendar,
    get_calendar_business_day_status,
    get_calendar_holiday,
    get_calendar_overlay,
    get_calendar_rule,
    get_next_calendar_business_day,
    get_asset_map_scope_summary,
    get_pipeline_detail,
    get_rail_line,
    get_rail_route,
    list_books,
    list_commodities,
    list_calendar_holidays,
    list_calendar_overlays,
    list_calendar_rules,
    list_calendars,
    list_asset_standards,
    list_assets,
    deactivate_currency,
    deactivate_commodity,
    deactivate_location,
    deactivate_pipeline_point,
    deactivate_pipeline_path,
    deactivate_price_index,
    deactivate_spatial_feature,
    deactivate_unit,
    list_location_standards,
    list_pipeline_details,
    list_pipeline_detail_standards,
    list_locations,
    list_pipeline_points,
    list_pipeline_path_standards,
    list_pipeline_point_standards,
    list_pipeline_paths,
    list_price_indices,
    list_rail_lines,
    list_rail_route_standards,
    list_rail_routes,
    list_spatial_feature_standards,
    list_spatial_features,
    update_book,
    update_commodity,
    update_asset,
    update_calendar,
    update_calendar_holiday,
    update_calendar_overlay,
    update_calendar_rule,
    update_counterparty,
    update_location,
    update_pipeline_detail,
    update_pipeline_path,
    update_pipeline_point,
    update_price_index,
    update_rail_line,
    update_rail_route,
    update_spatial_feature,
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
            session.query(ReferencePipelinePath).delete()
            session.query(ReferencePipelinePoint).delete()
            session.query(ReferencePipelineDetail).delete()
            session.query(ReferenceRailRoute).delete()
            session.query(ReferenceRailLine).delete()
            session.query(ReferenceAsset).delete()
            session.query(ReferenceSpatialFeature).delete()
            session.query(ReferenceCalendarOverlay).delete()
            session.query(ReferenceCalendarRule).delete()
            session.query(ReferenceCalendarHoliday).delete()
            session.query(ReferenceCalendar).delete()
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

    def _create_calendar(self, code: str, is_active: bool = True) -> None:
        with self.SessionLocal() as session:
            create_calendar(
                CalendarCreate(
                    code=code,
                    name=f"{code} Calendar",
                    calendar_type="pricing",
                    market="test-market",
                    timezone="America/New_York",
                    description="test calendar",
                    created_by="test-user",
                ),
                db=session,
            )
            if not is_active:
                deactivate_calendar(
                    code,
                    CalendarStatusUpdate(updated_by="test-user"),
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

    def test_commodity_crud_tracks_allowed_transport_modes(self) -> None:
        with self.SessionLocal() as session:
            created = create_commodity(
                CommodityCreate(
                    code=" wti ",
                    name=" WTI ",
                    commodity_class=" crude_oil ",
                    description="test commodity",
                    allowed_transport_modes=[" vessel ", "truck", "truck"],
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(created.code, "WTI")
        self.assertEqual(created.commodity_class, "CRUDE_OIL")
        self.assertEqual(created.allowed_transport_modes, ["VESSEL", "TRUCK"])

        with self.SessionLocal() as session:
            fetched = get_commodity(" wti ", db=session)
            updated = update_commodity(
                "WTI",
                CommodityUpdate(
                    allowed_transport_modes=["pipeline", "rail"],
                    updated_by="test-user",
                ),
                db=session,
            )
            listed = list_commodities(
                q="WTI",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )

        self.assertEqual(fetched.allowed_transport_modes, ["VESSEL", "TRUCK"])
        self.assertEqual(updated.allowed_transport_modes, ["PIPELINE", "RAIL"])
        self.assertEqual([commodity.code for commodity in listed], ["WTI"])
        self.assertEqual(listed[0].allowed_transport_modes, ["PIPELINE", "RAIL"])

    def test_commodity_crud_defaults_allowed_transport_modes_from_product_rules(self) -> None:
        with self.SessionLocal() as session:
            gold = create_commodity(
                CommodityCreate(
                    code=" gold ",
                    name=" Gold Bars ",
                    commodity_class=" precious_metals ",
                    description="precious metals test commodity",
                    created_by="test-user",
                ),
                db=session,
            )
            coal = create_commodity(
                CommodityCreate(
                    code=" thermal_coal ",
                    name=" Thermal Coal ",
                    commodity_class=" coal ",
                    description="coal test commodity",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(gold.allowed_transport_modes, ["AIR", "TRUCK", "RAIL"])
        self.assertEqual(coal.allowed_transport_modes, ["TRUCK", "RAIL", "BARGE", "VESSEL"])

    def test_calendar_crud_and_holiday_records_round_trip(self) -> None:
        with self.SessionLocal() as session:
            created = create_calendar(
                CalendarCreate(
                    code=" usny ",
                    name=" US New York ",
                    calendar_type=" exchange ",
                    market="  nymex  ",
                    timezone="  America/New_York  ",
                    description="test calendar",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(created.code, "USNY")
        self.assertEqual(created.calendar_type, "EXCHANGE")
        self.assertEqual(created.market, "nymex")
        self.assertEqual(created.timezone, "America/New_York")
        self.assertTrue(created.is_active)

        with self.SessionLocal() as session:
            fetched = get_calendar(" usny ", db=session)
            updated = update_calendar(
                "USNY",
                CalendarUpdate(
                    name="US New York Business Days",
                    calendar_type="settlement",
                    market="  power  ",
                    updated_by="test-user",
                ),
                db=session,
            )
            holiday = create_calendar_holiday(
                "USNY",
                CalendarHolidayCreate(
                    holiday_date=date(2026, 12, 25),
                    name=" Christmas Day ",
                    description="Observed Christmas holiday",
                    created_by="test-user",
                ),
                db=session,
            )
            fetched_holiday = get_calendar_holiday("USNY", date(2026, 12, 25), db=session)
            updated_holiday = update_calendar_holiday(
                "USNY",
                date(2026, 12, 25),
                CalendarHolidayUpdate(
                    name="Christmas Day (Observed)",
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated_holiday = deactivate_calendar_holiday(
                "USNY",
                date(2026, 12, 25),
                CalendarHolidayStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated_holiday = activate_calendar_holiday(
                "USNY",
                date(2026, 12, 25),
                CalendarHolidayStatusUpdate(updated_by="test-user"),
                db=session,
            )
            listed_holidays = list_calendar_holidays(
                "USNY",
                q="Christmas",
                is_active=True,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                limit=50,
                offset=0,
                db=session,
            )
            listed_calendars = list_calendars(
                q="Business",
                calendar_type="SETTLEMENT",
                market="power",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )

        self.assertEqual(fetched.code, "USNY")
        self.assertEqual(updated.name, "US New York Business Days")
        self.assertEqual(updated.calendar_type, "SETTLEMENT")
        self.assertEqual(updated.market, "power")
        self.assertEqual(updated.version, 2)
        self.assertEqual(holiday.name, "Christmas Day")
        self.assertEqual(fetched_holiday.calendar_code, "USNY")
        self.assertEqual(updated_holiday.name, "Christmas Day (Observed)")
        self.assertEqual(updated_holiday.version, 2)
        self.assertFalse(deactivated_holiday.is_active)
        self.assertEqual(deactivated_holiday.version, 3)
        self.assertTrue(reactivated_holiday.is_active)
        self.assertEqual(reactivated_holiday.version, 4)
        self.assertEqual(
            [(row.calendar_code, row.holiday_date) for row in listed_holidays],
            [("USNY", date(2026, 12, 25))],
        )
        self.assertEqual([calendar.code for calendar in listed_calendars], ["USNY"])

    def test_calendar_rule_overlay_and_business_day_round_trip(self) -> None:
        with self.SessionLocal() as session:
            create_calendar(
                CalendarCreate(
                    code=" usfed ",
                    name=" US Federal Base ",
                    calendar_type="bank_holiday",
                    timezone="America/New_York",
                    created_by="test-user",
                ),
                db=session,
            )
            create_calendar(
                CalendarCreate(
                    code=" ussettle ",
                    name=" US Settlement ",
                    calendar_type="payment_system",
                    timezone="America/New_York",
                    created_by="test-user",
                ),
                db=session,
            )

            saturday_rule = create_calendar_rule(
                "USFED",
                CalendarRuleCreate(
                    name=" Saturday Weekend Closure ",
                    rule_type="weekly",
                    weekday=5,
                    created_by="test-user",
                ),
                db=session,
            )
            sunday_rule = create_calendar_rule(
                "USFED",
                CalendarRuleCreate(
                    name=" Sunday Weekend Closure ",
                    rule_type="weekly",
                    weekday=6,
                    created_by="test-user",
                ),
                db=session,
            )
            holiday_rule = create_calendar_rule(
                "USFED",
                CalendarRuleCreate(
                    name=" Independence Day ",
                    rule_type="fixed_date",
                    month=7,
                    day=4,
                    observance_shift="nearest_weekday",
                    created_by="test-user",
                ),
                db=session,
            )
            fetched_rule = get_calendar_rule("USFED", holiday_rule.id, db=session)
            updated_rule = update_calendar_rule(
                "USFED",
                holiday_rule.id,
                CalendarRuleUpdate(
                    name="Independence Day Closure",
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated_rule = deactivate_calendar_rule(
                "USFED",
                sunday_rule.id,
                CalendarRuleStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated_rule = activate_calendar_rule(
                "USFED",
                sunday_rule.id,
                CalendarRuleStatusUpdate(updated_by="test-user"),
                db=session,
            )
            overlay = create_calendar_overlay(
                "USSETTLE",
                CalendarOverlayCreate(
                    overlay_calendar_code=" usfed ",
                    priority=20,
                    description=" inherited base ",
                    created_by="test-user",
                ),
                db=session,
            )
            fetched_overlay = get_calendar_overlay("USSETTLE", overlay.id, db=session)
            updated_overlay = update_calendar_overlay(
                "USSETTLE",
                overlay.id,
                CalendarOverlayUpdate(
                    priority=5,
                    description="Primary inherited base",
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated_overlay = deactivate_calendar_overlay(
                "USSETTLE",
                overlay.id,
                CalendarOverlayStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated_overlay = activate_calendar_overlay(
                "USSETTLE",
                overlay.id,
                CalendarOverlayStatusUpdate(updated_by="test-user"),
                db=session,
            )
            short_day = create_calendar_holiday(
                "USSETTLE",
                CalendarHolidayCreate(
                    holiday_date=date(2026, 7, 6),
                    name=" Special Early Close ",
                    closure_type="short_day",
                    is_provisional=True,
                    created_by="test-user",
                ),
                db=session,
            )
            listed_rules = list_calendar_rules(
                "USFED",
                q="Independence",
                rule_type="FIXED_DATE",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )
            listed_overlays = list_calendar_overlays(
                "USSETTLE",
                q="USFED",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )
            status_closed = get_calendar_business_day_status(
                "USSETTLE",
                date(2026, 7, 3),
                db=session,
            )
            status_short = get_calendar_business_day_status(
                "USSETTLE",
                date(2026, 7, 6),
                db=session,
            )
            next_day = get_next_calendar_business_day(
                "USSETTLE",
                start_date=date(2026, 7, 3),
                include_start=False,
                db=session,
            )
            shifted = add_calendar_business_days(
                "USSETTLE",
                start_date=date(2026, 7, 2),
                business_days=2,
                include_start=False,
                db=session,
            )
            between = count_calendar_business_days(
                "USSETTLE",
                start_date=date(2026, 7, 2),
                end_date=date(2026, 7, 8),
                include_start=True,
                include_end=False,
                db=session,
            )

        self.assertEqual(saturday_rule.rule_type, "WEEKLY")
        self.assertEqual(fetched_rule.name, "Independence Day")
        self.assertEqual(updated_rule.name, "Independence Day Closure")
        self.assertEqual(updated_rule.observance_shift, "NEAREST_WEEKDAY")
        self.assertEqual(updated_rule.version, 2)
        self.assertFalse(deactivated_rule.is_active)
        self.assertTrue(reactivated_rule.is_active)
        self.assertEqual(reactivated_rule.version, 3)
        self.assertEqual(fetched_overlay.overlay_calendar_code, "USFED")
        self.assertEqual(updated_overlay.priority, 5)
        self.assertEqual(updated_overlay.description, "Primary inherited base")
        self.assertFalse(deactivated_overlay.is_active)
        self.assertTrue(reactivated_overlay.is_active)
        self.assertEqual(short_day.closure_type, "SHORT_DAY")
        self.assertTrue(short_day.is_provisional)
        self.assertEqual([row.id for row in listed_rules], [holiday_rule.id])
        self.assertEqual([row.id for row in listed_overlays], [overlay.id])
        self.assertFalse(status_closed.is_business_day)
        self.assertEqual(status_closed.closure_type, "FULL_CLOSED")
        self.assertIn("USFED", status_closed.source_calendar_codes)
        self.assertEqual(
            {match.name for match in status_closed.matches},
            {"Independence Day Closure"},
        )
        self.assertTrue(status_short.is_business_day)
        self.assertEqual(status_short.closure_type, "SHORT_DAY")
        self.assertEqual(
            {match.name for match in status_short.matches},
            {"Special Early Close"},
        )
        self.assertEqual(next_day.result_date, date(2026, 7, 6))
        self.assertEqual(shifted.result_date, date(2026, 7, 7))
        self.assertEqual(between.business_day_count, 3)

    def test_calendar_holiday_import_upserts_rows_and_deactivates_missing_dates(self) -> None:
        with self.SessionLocal() as session:
            create_calendar(
                CalendarCreate(
                    code=" usload ",
                    name=" US Load ",
                    calendar_type="bank_holiday",
                    created_by="test-user",
                ),
                db=session,
            )
            create_calendar_holiday(
                "USLOAD",
                CalendarHolidayCreate(
                    holiday_date=date(2026, 1, 1),
                    name="Legacy New Year",
                    description="legacy",
                    created_by="test-user",
                ),
                db=session,
            )
            create_calendar_holiday(
                "USLOAD",
                CalendarHolidayCreate(
                    holiday_date=date(2026, 12, 25),
                    name="Legacy Christmas",
                    created_by="test-user",
                ),
                db=session,
            )

            summary = import_calendar_holidays(
                "USLOAD",
                CalendarHolidayImportRequest(
                    csv_text=(
                        "holiday_date,name,description,closure_type,is_provisional,is_active\n"
                        "2026-01-01,New Year's Day,Imported,FULL_CLOSED,false,true\n"
                        "2026-07-03,Independence Day Observed,,FULL_CLOSED,false,true\n"
                    ),
                    requested_by="test-user",
                    replace_existing=True,
                    deactivate_missing=True,
                ),
                db=session,
            )
            holidays = list_calendar_holidays(
                "USLOAD",
                limit=50,
                offset=0,
                db=session,
            )

        self.assertEqual(summary.calendar_code, "USLOAD")
        self.assertEqual(summary.total_rows, 2)
        self.assertEqual(summary.created_count, 1)
        self.assertEqual(summary.updated_count, 1)
        self.assertEqual(summary.deactivated_count, 1)
        self.assertEqual(summary.skipped_count, 0)
        self.assertEqual(
            [(row.holiday_date, row.name, row.is_active) for row in holidays],
            [
                (date(2026, 1, 1), "New Year's Day", True),
                (date(2026, 7, 3), "Independence Day Observed", True),
                (date(2026, 12, 25), "Legacy Christmas", False),
            ],
        )

    def test_create_price_index_requires_active_calendar(self) -> None:
        self._create_commodity("WTI")
        self._create_currency("USD", "$")
        self._create_unit("BBL")
        self._create_calendar("USNY", is_active=False)

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Calendar 'USNY' is not active"):
                create_price_index(
                    PriceIndexCreate(
                        code="WTI_M1",
                        name="WTI Front Month",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="ICE",
                        calendar_code="USNY",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_deactivate_calendar_blocked_by_active_price_index(self) -> None:
        self._create_commodity("WTI")
        self._create_currency("USD", "$")
        self._create_unit("BBL")
        self._create_calendar("USNY")

        with self.SessionLocal() as session:
            create_price_index(
                PriceIndexCreate(
                    code="WTI_M1",
                    name="WTI Front Month",
                    commodity_code="WTI",
                    currency_code="USD",
                    unit_code="BBL",
                    provider="ICE",
                    calendar_code="USNY",
                    created_by="test-user",
                ),
                db=session,
            )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Calendar cannot be deactivated while active price indices reference it"):
                deactivate_calendar(
                    "USNY",
                    CalendarStatusUpdate(updated_by="test-user"),
                    db=session,
                )

    def _create_location(
        self,
        code: str,
        *,
        location_kind: str = "POINT",
        location_type: str = "HUB",
        parent_location_code: str | None = None,
        market: str = "PHYSICAL",
        city: str = "Test City",
        subdivision_code: str = "US-TX",
        country_code: str = "US",
        continent_code: str = "NA",
        latitude: float = 29.0,
        longitude: float = -95.0,
        region: str = "GULF",
        timezone: str = "America/Chicago",
    ) -> None:
        with self.SessionLocal() as session:
            create_location(
                LocationCreate(
                    code=code,
                    name=f"{code} Location",
                    location_kind=location_kind,
                    location_type=location_type,
                    parent_location_code=parent_location_code,
                    market=market,
                    city=city,
                    subdivision_code=subdivision_code,
                    country_code=country_code,
                    continent_code=continent_code,
                    latitude=latitude,
                    longitude=longitude,
                    region=region,
                    timezone=timezone,
                    description="test location",
                    created_by="test-user",
                ),
                db=session,
            )

    def _create_rail_line(self, code: str, railroad_code: str = "BNSF") -> None:
        with self.SessionLocal() as session:
            create_rail_line(
                RailLineCreate(
                    code=code,
                    name=f"{code} Rail Line",
                    railroad_code=railroad_code,
                    operator_name=f"{railroad_code} Railway",
                    default_timezone="America/Chicago",
                    description="test rail line",
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
        self._create_calendar("USNY")

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
                    latitude=31.7636,
                    longitude=-104.5208,
                    geometry_geojson={
                        "type": "LineString",
                        "coordinates": [
                            [-104.5208, 31.7636],
                            [-103.1026, 31.8457],
                        ],
                    },
                    capacity_value=2400.5,
                    capacity_unit_code=" mmbtu ",
                    operator_name=" Midstream Ops ",
                    operating_status=" operating ",
                    source_name=" Internal Source Catalog ",
                    source_url=" https://example.com/assets/waha ",
                    confidence=0.92,
                    notes=" Seeded from curated source ",
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
        self.assertEqual(created.latitude, 31.7636)
        self.assertEqual(created.longitude, -104.5208)
        self.assertEqual(created.geometry_geojson["type"], "LineString")
        self.assertEqual(created.capacity_unit_code, "MMBTU")
        self.assertEqual(created.operator_name, "Midstream Ops")
        self.assertEqual(created.operating_status, "OPERATING")
        self.assertEqual(created.source_name, "Internal Source Catalog")
        self.assertEqual(created.source_url, "https://example.com/assets/waha")
        self.assertEqual(created.confidence, 0.92)
        self.assertEqual(created.notes, "Seeded from curated source")

        standards = list_asset_standards()
        self.assertEqual(standards.default_asset_class, "PIPELINE")
        self.assertIn("GENERATION", standards.asset_classes)
        self.assertEqual(standards.default_asset_reality, "REAL")
        self.assertIn("SIMULATED", standards.asset_realities)

        with self.SessionLocal() as session:
            listed = list_assets(
                q="curated source",
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
                    latitude=None,
                    longitude=None,
                    geometry_geojson={
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-103.2, 31.7],
                                [-103.0, 31.7],
                                [-103.0, 31.9],
                                [-103.2, 31.9],
                                [-103.2, 31.7],
                            ]
                        ],
                    },
                    capacity_value=None,
                    capacity_unit_code=None,
                    operator_name=" Plant Ops ",
                    operating_status="idled",
                    source_name=" Scenario Builder ",
                    source_url=" https://example.com/assets/waha/sim ",
                    confidence=0.51,
                    notes=" Retired from curated source ",
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
        self.assertIsNone(updated.latitude)
        self.assertIsNone(updated.longitude)
        self.assertEqual(updated.geometry_geojson["type"], "Polygon")
        self.assertIsNone(updated.capacity_value)
        self.assertIsNone(updated.capacity_unit_code)
        self.assertEqual(updated.operator_name, "Plant Ops")
        self.assertEqual(updated.operating_status, "IDLED")
        self.assertEqual(updated.source_name, "Scenario Builder")
        self.assertEqual(updated.source_url, "https://example.com/assets/waha/sim")
        self.assertEqual(updated.confidence, 0.51)
        self.assertEqual(updated.notes, "Retired from curated source")
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

    def test_asset_map_scope_summary_counts_filtered_assets_beyond_bootstrap(self) -> None:
        self._create_commodity("POWER")
        self._create_location(
            "HOUSTON",
            location_kind="POINT",
            location_type="HUB",
            latitude=29.7604,
            longitude=-95.3698,
            subdivision_code="US-TX",
            country_code="US",
            continent_code="NA",
        )
        self._create_location(
            "CALGARY",
            location_kind="POINT",
            location_type="HUB",
            latitude=51.0447,
            longitude=-114.0719,
            subdivision_code="CA-AB",
            country_code="CA",
            continent_code="NA",
        )

        with self.SessionLocal() as session:
            create_asset(
                AssetCreate(
                    code="PIPE_TX",
                    name="Texas Pipe",
                    asset_class="PIPELINE",
                    asset_type="TRANSMISSION",
                    asset_reality="REAL",
                    commodity_code="POWER",
                    location_code="HOUSTON",
                    geometry_geojson={
                        "type": "LineString",
                        "coordinates": [
                            [-95.3698, 29.7604],
                            [-95.1, 29.9],
                        ],
                    },
                    operating_status="OPERATING",
                    description="pipeline",
                    created_by="test-user",
                ),
                db=session,
            )
            create_asset(
                AssetCreate(
                    code="STORE_AB",
                    name="Alberta Storage",
                    asset_class="STORAGE",
                    asset_type="TANK_FARM",
                    asset_reality="REAL",
                    commodity_code="POWER",
                    location_code="CALGARY",
                    latitude=51.0447,
                    longitude=-114.0719,
                    operating_status="OPERATING",
                    description="storage",
                    created_by="test-user",
                ),
                db=session,
            )
            create_asset(
                AssetCreate(
                    code="TERM_TX",
                    name="Texas Terminal",
                    asset_class="TERMINAL",
                    asset_type="MARINE",
                    asset_reality="REAL",
                    commodity_code="POWER",
                    location_code="HOUSTON",
                    operating_status="OPERATING",
                    description="terminal",
                    created_by="test-user",
                ),
                db=session,
            )
            create_asset(
                AssetCreate(
                    code="LOAD_NULL",
                    name="Load Pocket",
                    asset_class="CONSUMPTION",
                    asset_type="INDUSTRIAL",
                    asset_reality="REAL",
                    commodity_code="POWER",
                    operating_status="OPERATING",
                    description="load",
                    created_by="test-user",
                ),
                db=session,
            )

        with self.SessionLocal() as session:
            summary = get_asset_map_scope_summary(
                selected_country_code="US",
                selected_subdivision_code="US-TX",
                hidden_activity=["Positions"],
                hidden_subtype=["Other"],
                db=session,
            )
            geography_hidden_summary = get_asset_map_scope_summary(
                hidden_geography=["North America"],
                db=session,
            )

        self.assertEqual(summary.total_count, 4)
        self.assertEqual(summary.total_map_ready_count, 3)
        self.assertEqual(summary.filtered_total_count, 1)
        self.assertEqual(summary.filtered_map_ready_count, 1)
        self.assertEqual(geography_hidden_summary.filtered_total_count, 1)
        self.assertEqual(geography_hidden_summary.filtered_map_ready_count, 0)

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
            with self.assertRaisesRegex(Exception, "latitude and longitude must be provided together"):
                create_asset(
                    AssetCreate(
                        code="BAD_COORDINATES",
                        name="Bad Coordinates",
                        asset_class="GENERATION",
                        asset_type="THERMAL",
                        asset_reality="REAL",
                        commodity_code="ACTIVE_GAS",
                        latitude=31.5,
                        operating_status="OPERATING",
                        description="bad coordinates",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "geometry_geojson type must be one of"):
                create_asset(
                    AssetCreate(
                        code="BAD_GEOMETRY",
                        name="Bad Geometry",
                        asset_class="GENERATION",
                        asset_type="THERMAL",
                        asset_reality="REAL",
                        commodity_code="ACTIVE_GAS",
                        geometry_geojson={"type": "BadType", "coordinates": [0, 0]},
                        operating_status="OPERATING",
                        description="bad geometry",
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

    def test_pipeline_path_crud_uses_pipeline_asset_headers(self) -> None:
        self._create_location("WAHA")
        self._create_location("HENRY_HUB", latitude=29.9589, longitude=-92.0332, subdivision_code="US-LA")

        with self.SessionLocal() as session:
            create_asset(
                AssetCreate(
                    code="tgp_header",
                    name="Tennessee Gas Pipeline",
                    asset_class="pipeline",
                    asset_type="transmission",
                    asset_reality="real",
                    operating_status="operating",
                    description="pipeline header",
                    created_by="test-user",
                ),
                db=session,
            )
            created = create_pipeline_path(
                PipelinePathCreate(
                    code=" tgp_z0_z1 ",
                    name=" TGP Zone 0 to Zone 1 ",
                    pipeline_code=" tgp_header ",
                    receipt_location_code=" waha ",
                    delivery_location_code=" henry_hub ",
                    path_direction=" forward ",
                    cycle_timezone=" America/Chicago ",
                    description="core gas corridor",
                    created_by="test-user",
                ),
                db=session,
            )
            standards = list_pipeline_path_standards()

        self.assertEqual(created.code, "TGP_Z0_Z1")
        self.assertEqual(created.pipeline_code, "TGP_HEADER")
        self.assertEqual(created.receipt_location_code, "WAHA")
        self.assertEqual(created.delivery_location_code, "HENRY_HUB")
        self.assertEqual(created.path_direction, "FORWARD")
        self.assertEqual(created.cycle_timezone, "America/Chicago")
        self.assertEqual(standards.default_path_direction, "BIDIRECTIONAL")
        self.assertIn("FORWARD", standards.path_directions)

        with self.SessionLocal() as session:
            listed = list_pipeline_paths(
                q="zone 0",
                pipeline_code="tgp_header",
                receipt_location_code="waha",
                delivery_location_code="henry_hub",
                path_direction="forward",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )
            updated = update_pipeline_path(
                "tgp_z0_z1",
                PipelinePathUpdate(
                    receipt_location_code=None,
                    path_direction="bidirectional",
                    cycle_timezone="America/New_York",
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated = deactivate_pipeline_path(
                "TGP_Z0_Z1",
                PipelinePathStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated = activate_pipeline_path(
                "TGP_Z0_Z1",
                PipelinePathStatusUpdate(updated_by="test-user"),
                db=session,
            )

        self.assertEqual([path.code for path in listed], ["TGP_Z0_Z1"])
        self.assertIsNone(updated.receipt_location_code)
        self.assertEqual(updated.path_direction, "BIDIRECTIONAL")
        self.assertEqual(updated.cycle_timezone, "America/New_York")
        self.assertFalse(deactivated.is_active)
        self.assertTrue(reactivated.is_active)

    def test_pipeline_path_creation_rejects_non_pipeline_assets_invalid_directions_and_bad_timezones(self) -> None:
        self._create_location("WAHA")
        self._create_location("HENRY_HUB", latitude=29.9589, longitude=-92.0332, subdivision_code="US-LA")

        with self.SessionLocal() as session:
            create_asset(
                AssetCreate(
                    code="ercot_ccgt",
                    name="ERCOT CCGT",
                    asset_class="generation",
                    asset_type="thermal",
                    asset_reality="real",
                    operating_status="operating",
                    description="not a pipeline",
                    created_by="test-user",
                ),
                db=session,
            )
            create_asset(
                AssetCreate(
                    code="ngpl_header",
                    name="NGPL",
                    asset_class="pipeline",
                    asset_type="transmission",
                    asset_reality="real",
                    operating_status="operating",
                    description="pipeline header",
                    created_by="test-user",
                ),
                db=session,
            )

            with self.assertRaisesRegex(
                Exception,
                "Pipeline asset 'ERCOT_CCGT' is not an active PIPELINE asset",
            ):
                create_pipeline_path(
                    PipelinePathCreate(
                        code="BAD_ASSET",
                        name="Bad Asset Path",
                        pipeline_code="ercot_ccgt",
                        receipt_location_code="WAHA",
                        delivery_location_code="HENRY_HUB",
                        path_direction="FORWARD",
                        description="bad asset",
                        created_by="test-user",
                    ),
                    db=session,
                )

            with self.assertRaisesRegex(Exception, "path_direction 'SIDEWAYS' is invalid"):
                create_pipeline_path(
                    PipelinePathCreate(
                        code="BAD_DIRECTION",
                        name="Bad Direction Path",
                        pipeline_code="ngpl_header",
                        receipt_location_code="WAHA",
                        delivery_location_code="HENRY_HUB",
                        path_direction="SIDEWAYS",
                        description="bad direction",
                        created_by="test-user",
                    ),
                    db=session,
                )

            with self.assertRaisesRegex(Exception, "timezone 'Mars/Olympus' must be a valid IANA timezone name"):
                create_pipeline_path(
                    PipelinePathCreate(
                        code="BAD_TIMEZONE",
                        name="Bad Timezone Path",
                        pipeline_code="ngpl_header",
                        receipt_location_code="WAHA",
                        delivery_location_code="HENRY_HUB",
                        path_direction="FORWARD",
                        cycle_timezone="Mars/Olympus",
                        description="bad timezone",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_pipeline_detail_crud_supports_classification_filters_and_standards(self) -> None:
        self._create_location("WAHA")

        with self.SessionLocal() as session:
            create_asset(
                AssetCreate(
                    code="tgp_header",
                    name="Tennessee Gas Pipeline",
                    asset_class="pipeline",
                    asset_type="transmission",
                    asset_reality="real",
                    operating_status="operating",
                    description="gas pipeline header",
                    created_by="test-user",
                ),
                db=session,
            )
            create_asset(
                AssetCreate(
                    code="colonial_header",
                    name="Colonial Pipeline",
                    asset_class="pipeline",
                    asset_type="transmission",
                    asset_reality="real",
                    operating_status="operating",
                    description="products pipeline header",
                    created_by="test-user",
                ),
                db=session,
            )
            created = create_pipeline_detail(
                PipelineDetailCreate(
                    pipeline_code=" tgp_header ",
                    commodity_family=" natural_gas ",
                    jurisdiction_type=" interstate ",
                    topology_model=" zone_pool ",
                    market_hub_location_code=" waha ",
                    in_service_year=1944,
                    cross_border=False,
                    is_bidirectional=True,
                    tariff_url=" https://example.com/tgp-tariff ",
                    ebb_url=" https://example.com/tgp-ebb ",
                    created_by="test-user",
                ),
                db=session,
            )
            create_pipeline_detail(
                PipelineDetailCreate(
                    pipeline_code="colonial_header",
                    commodity_family="refined_products",
                    jurisdiction_type="mixed",
                    topology_model="batched",
                    created_by="test-user",
                ),
                db=session,
            )
            standards = list_pipeline_detail_standards()

        self.assertEqual(created.pipeline_code, "TGP_HEADER")
        self.assertEqual(created.commodity_family, "NATURAL_GAS")
        self.assertEqual(created.jurisdiction_type, "INTERSTATE")
        self.assertEqual(created.topology_model, "ZONE_POOL")
        self.assertEqual(created.market_hub_location_code, "WAHA")
        self.assertTrue(created.is_bidirectional)
        self.assertEqual(created.tariff_url, "https://example.com/tgp-tariff")
        self.assertEqual(standards.default_commodity_family, "NATURAL_GAS")
        self.assertIn("BATCHED", standards.topology_models)

        with self.SessionLocal() as session:
            listed = list_pipeline_details(
                q="tennessee",
                commodity_family="natural_gas",
                jurisdiction_type="interstate",
                topology_model="zone_pool",
                is_bidirectional=True,
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )
            fetched = get_pipeline_detail("tgp_header", db=session)
            updated = update_pipeline_detail(
                "tgp_header",
                PipelineDetailUpdate(
                    topology_model="header_interconnect",
                    is_bidirectional=False,
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated = deactivate_pipeline_detail(
                "TGP_HEADER",
                PipelineDetailStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated = activate_pipeline_detail(
                "TGP_HEADER",
                PipelineDetailStatusUpdate(updated_by="test-user"),
                db=session,
            )

        self.assertEqual([detail.pipeline_code for detail in listed], ["TGP_HEADER"])
        self.assertEqual(fetched.pipeline_code, "TGP_HEADER")
        self.assertEqual(updated.topology_model, "HEADER_INTERCONNECT")
        self.assertFalse(updated.is_bidirectional)
        self.assertFalse(deactivated.is_active)
        self.assertTrue(reactivated.is_active)

    def test_pipeline_point_crud_supports_tradable_operational_nodes(self) -> None:
        self._create_location("WAHA")
        self._create_location("HENRY_HUB", latitude=29.9589, longitude=-92.0332, subdivision_code="US-LA")

        with self.SessionLocal() as session:
            create_asset(
                AssetCreate(
                    code="tgp_header",
                    name="Tennessee Gas Pipeline",
                    asset_class="pipeline",
                    asset_type="transmission",
                    asset_reality="real",
                    operating_status="operating",
                    description="pipeline header",
                    created_by="test-user",
                ),
                db=session,
            )
            create_asset(
                AssetCreate(
                    code="transco_header",
                    name="Transco",
                    asset_class="pipeline",
                    asset_type="transmission",
                    asset_reality="real",
                    operating_status="operating",
                    description="connected pipeline",
                    created_by="test-user",
                ),
                db=session,
            )
            created = create_pipeline_point(
                PipelinePointCreate(
                    code=" tgp_transco_leidy ",
                    name=" TGP Transco Leidy ",
                    pipeline_code=" tgp_header ",
                    location_code=" waha ",
                    point_role=" interconnect ",
                    operator_point_code=" 405030 ",
                    operator_zone=" zone_0 ",
                    connected_pipeline_code=" transco_header ",
                    is_tradable=True,
                    is_pricing_point=True,
                    is_scheduling_point=True,
                    sort_order=10,
                    description="commercial interconnect",
                    created_by="test-user",
                ),
                db=session,
            )
            standards = list_pipeline_point_standards()

        self.assertEqual(created.code, "TGP_TRANSCO_LEIDY")
        self.assertEqual(created.pipeline_code, "TGP_HEADER")
        self.assertEqual(created.location_code, "WAHA")
        self.assertEqual(created.point_role, "INTERCONNECT")
        self.assertEqual(created.operator_point_code, "405030")
        self.assertEqual(created.operator_zone, "zone_0")
        self.assertEqual(created.connected_pipeline_code, "TRANSCO_HEADER")
        self.assertTrue(created.is_tradable)
        self.assertEqual(standards.default_point_role, "INTERCONNECT")
        self.assertIn("POOL", standards.point_roles)

        with self.SessionLocal() as session:
            listed = list_pipeline_points(
                q="leidy",
                pipeline_code="tgp_header",
                point_role="interconnect",
                connected_pipeline_code="transco_header",
                is_tradable=True,
                is_pricing_point=True,
                is_scheduling_point=True,
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )
            updated = update_pipeline_point(
                "tgp_transco_leidy",
                PipelinePointUpdate(
                    location_code="henry_hub",
                    operator_zone="zone_l",
                    is_pricing_point=False,
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated = deactivate_pipeline_point(
                "TGP_TRANSCO_LEIDY",
                PipelinePointStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated = activate_pipeline_point(
                "TGP_TRANSCO_LEIDY",
                PipelinePointStatusUpdate(updated_by="test-user"),
                db=session,
            )

        self.assertEqual([point.code for point in listed], ["TGP_TRANSCO_LEIDY"])
        self.assertEqual(updated.location_code, "HENRY_HUB")
        self.assertEqual(updated.operator_zone, "zone_l")
        self.assertFalse(updated.is_pricing_point)
        self.assertFalse(deactivated.is_active)
        self.assertTrue(reactivated.is_active)

    def test_pipeline_paths_validate_point_membership_against_pipeline_header(self) -> None:
        self._create_location("WAHA")
        self._create_location("HENRY_HUB", latitude=29.9589, longitude=-92.0332, subdivision_code="US-LA")

        with self.SessionLocal() as session:
            create_asset(
                AssetCreate(
                    code="tgp_header",
                    name="Tennessee Gas Pipeline",
                    asset_class="pipeline",
                    asset_type="transmission",
                    asset_reality="real",
                    operating_status="operating",
                    description="pipeline header",
                    created_by="test-user",
                ),
                db=session,
            )
            create_asset(
                AssetCreate(
                    code="transco_header",
                    name="Transco",
                    asset_class="pipeline",
                    asset_type="transmission",
                    asset_reality="real",
                    operating_status="operating",
                    description="connected pipeline",
                    created_by="test-user",
                ),
                db=session,
            )
            create_pipeline_point(
                PipelinePointCreate(
                    code="tgp_zone0_pool",
                    name="TGP Zone 0 Pool",
                    pipeline_code="tgp_header",
                    location_code="WAHA",
                    point_role="pool",
                    is_tradable=True,
                    is_pricing_point=True,
                    is_scheduling_point=True,
                    created_by="test-user",
                ),
                db=session,
            )
            create_pipeline_point(
                PipelinePointCreate(
                    code="transco_zone6",
                    name="Transco Zone 6",
                    pipeline_code="transco_header",
                    location_code="HENRY_HUB",
                    point_role="zone",
                    is_tradable=True,
                    is_pricing_point=True,
                    is_scheduling_point=True,
                    created_by="test-user",
                ),
                db=session,
            )

            created = create_pipeline_path(
                PipelinePathCreate(
                    code="tgp_path",
                    name="TGP Corridor",
                    pipeline_code="tgp_header",
                    receipt_location_code="WAHA",
                    delivery_location_code="HENRY_HUB",
                    receipt_point_code="tgp_zone0_pool",
                    path_direction="FORWARD",
                    description="point-aware path",
                    created_by="test-user",
                ),
                db=session,
            )

            self.assertEqual(created.receipt_point_code, "TGP_ZONE0_POOL")

            with self.assertRaisesRegex(
                Exception,
                "receipt_point_code 'TRANSCO_ZONE6' must belong to pipeline 'TGP_HEADER'",
            ):
                create_pipeline_path(
                    PipelinePathCreate(
                        code="bad_path",
                        name="Bad Path",
                        pipeline_code="tgp_header",
                        receipt_point_code="transco_zone6",
                        path_direction="FORWARD",
                        description="bad point membership",
                        created_by="test-user",
                    ),
                    db=session,
                )

            with self.assertRaisesRegex(
                Exception,
                "delivery_point_code 'TRANSCO_ZONE6' must belong to pipeline 'TGP_HEADER'",
            ):
                update_pipeline_path(
                    "tgp_path",
                    PipelinePathUpdate(
                        delivery_point_code="transco_zone6",
                        updated_by="test-user",
                    ),
                    db=session,
                )

            with self.assertRaisesRegex(
                Exception,
                "receipt_point_code 'TGP_ZONE0_POOL' must belong to pipeline 'TRANSCO_HEADER'",
            ):
                update_pipeline_path(
                    "tgp_path",
                    PipelinePathUpdate(
                        pipeline_code="transco_header",
                        updated_by="test-user",
                    ),
                    db=session,
                )

    def test_rail_line_and_route_crud_supports_normalized_codes_filters_and_standards(self) -> None:
        self._create_location("WAHA")
        self._create_location(
            "HOUSTON_SHIP_CHANNEL",
            location_type="TERMINAL",
            city="Houston",
            latitude=29.7285,
            longitude=-95.265,
        )
        self._create_calendar("US_RAIL")
        self._create_calendar("US_RAIL_ALT")

        with self.SessionLocal() as session:
            created_line = create_rail_line(
                RailLineCreate(
                    code=" bnsf_southern_transcon ",
                    name=" BNSF Southern Transcon ",
                    railroad_code=" bnsf ",
                    operator_name=" BNSF Railway ",
                    default_timezone=" America/Chicago ",
                    description="core rail line",
                    created_by="test-user",
                ),
                db=session,
            )
            fetched_line = get_rail_line("bnsf_southern_transcon", db=session)
            created_route = create_rail_route(
                RailRouteCreate(
                    code=" transcon_waha_hsc ",
                    name=" Waha to Houston Ship Channel ",
                    rail_line_code=" bnsf_southern_transcon ",
                    origin_location_code=" waha ",
                    destination_location_code=" houston_ship_channel ",
                    service_calendar_code=" us_rail ",
                    route_direction=" forward ",
                    schedule_timezone=" America/Chicago ",
                    placement_cutoff_time_local=" 7:30 ",
                    release_cutoff_time_local="11:05",
                    placement_free_time_hours=48,
                    release_free_time_hours=24,
                    description="permian to gulf coast rail route",
                    created_by="test-user",
                ),
                db=session,
            )
            fetched_route = get_rail_route("transcon_waha_hsc", db=session)
            standards = list_rail_route_standards()

        self.assertEqual(created_line.code, "BNSF_SOUTHERN_TRANSCON")
        self.assertEqual(created_line.railroad_code, "BNSF")
        self.assertEqual(created_line.default_timezone, "America/Chicago")
        self.assertEqual(fetched_line.code, "BNSF_SOUTHERN_TRANSCON")
        self.assertEqual(created_route.code, "TRANSCON_WAHA_HSC")
        self.assertEqual(created_route.rail_line_code, "BNSF_SOUTHERN_TRANSCON")
        self.assertEqual(created_route.origin_location_code, "WAHA")
        self.assertEqual(created_route.destination_location_code, "HOUSTON_SHIP_CHANNEL")
        self.assertEqual(created_route.service_calendar_code, "US_RAIL")
        self.assertEqual(created_route.route_direction, "FORWARD")
        self.assertEqual(created_route.schedule_timezone, "America/Chicago")
        self.assertEqual(created_route.placement_cutoff_time_local, "07:30")
        self.assertEqual(created_route.release_cutoff_time_local, "11:05")
        self.assertEqual(created_route.placement_free_time_hours, 48)
        self.assertEqual(created_route.release_free_time_hours, 24)
        self.assertEqual(fetched_route.code, "TRANSCON_WAHA_HSC")
        self.assertEqual(standards.default_route_direction, "BIDIRECTIONAL")
        self.assertIn("FORWARD", standards.route_directions)

        with self.SessionLocal() as session:
            listed_lines = list_rail_lines(
                q="southern",
                railroad_code="bnsf",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )
            listed_routes = list_rail_routes(
                q="houston",
                rail_line_code="bnsf_southern_transcon",
                origin_location_code="waha",
                destination_location_code="houston_ship_channel",
                service_calendar_code="us_rail",
                route_direction="forward",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )
            updated_line = update_rail_line(
                "bnsf_southern_transcon",
                RailLineUpdate(
                    operator_name=None,
                    default_timezone="America/Denver",
                    updated_by="test-user",
                ),
                db=session,
            )
            updated_route = update_rail_route(
                "transcon_waha_hsc",
                RailRouteUpdate(
                    origin_location_code=None,
                    service_calendar_code="us_rail_alt",
                    route_direction="bidirectional",
                    schedule_timezone="America/New_York",
                    placement_cutoff_time_local="8:45",
                    release_cutoff_time_local=None,
                    placement_free_time_hours=72,
                    release_free_time_hours=None,
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated_route = deactivate_rail_route(
                "TRANSCON_WAHA_HSC",
                RailRouteStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated_route = activate_rail_route(
                "TRANSCON_WAHA_HSC",
                RailRouteStatusUpdate(updated_by="test-user"),
                db=session,
            )
            deactivated_line = deactivate_rail_line(
                "BNSF_SOUTHERN_TRANSCON",
                RailLineStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated_line = activate_rail_line(
                "BNSF_SOUTHERN_TRANSCON",
                RailLineStatusUpdate(updated_by="test-user"),
                db=session,
            )

        self.assertEqual([line.code for line in listed_lines], ["BNSF_SOUTHERN_TRANSCON"])
        self.assertEqual([route.code for route in listed_routes], ["TRANSCON_WAHA_HSC"])
        self.assertIsNone(updated_line.operator_name)
        self.assertEqual(updated_line.default_timezone, "America/Denver")
        self.assertIsNone(updated_route.origin_location_code)
        self.assertEqual(updated_route.service_calendar_code, "US_RAIL_ALT")
        self.assertEqual(updated_route.route_direction, "BIDIRECTIONAL")
        self.assertEqual(updated_route.schedule_timezone, "America/New_York")
        self.assertEqual(updated_route.placement_cutoff_time_local, "08:45")
        self.assertIsNone(updated_route.release_cutoff_time_local)
        self.assertEqual(updated_route.placement_free_time_hours, 72)
        self.assertIsNone(updated_route.release_free_time_hours)
        self.assertFalse(deactivated_route.is_active)
        self.assertTrue(reactivated_route.is_active)
        self.assertFalse(deactivated_line.is_active)
        self.assertTrue(reactivated_line.is_active)

    def test_rail_route_creation_rejects_inactive_lines_invalid_directions_and_bad_timezones(self) -> None:
        self._create_location("WAHA")
        self._create_location(
            "HOUSTON_SHIP_CHANNEL",
            location_type="TERMINAL",
            city="Houston",
            latitude=29.7285,
            longitude=-95.265,
        )
        self._create_rail_line("UP_GULF_LINE", railroad_code="UP")
        self._create_rail_line("BNSF_ACTIVE_LINE", railroad_code="BNSF")
        self._create_calendar("INACTIVE_RAIL_CAL", is_active=False)

        with self.SessionLocal() as session:
            deactivate_rail_line(
                "UP_GULF_LINE",
                RailLineStatusUpdate(updated_by="test-user"),
                db=session,
            )

            with self.assertRaisesRegex(
                Exception,
                "Rail line 'UP_GULF_LINE' is not active in reference data",
            ):
                create_rail_route(
                    RailRouteCreate(
                        code="BAD_LINE",
                        name="Bad Line Route",
                        rail_line_code="up_gulf_line",
                        origin_location_code="WAHA",
                        destination_location_code="HOUSTON_SHIP_CHANNEL",
                        route_direction="FORWARD",
                        description="bad line",
                        created_by="test-user",
                    ),
                    db=session,
                )

            with self.assertRaisesRegex(Exception, "route_direction 'SIDEWAYS' is invalid"):
                create_rail_route(
                    RailRouteCreate(
                        code="BAD_DIRECTION",
                        name="Bad Direction Route",
                        rail_line_code="bnsf_active_line",
                        origin_location_code="WAHA",
                        destination_location_code="HOUSTON_SHIP_CHANNEL",
                        route_direction="SIDEWAYS",
                        description="bad direction",
                        created_by="test-user",
                    ),
                    db=session,
                )

            with self.assertRaisesRegex(
                Exception,
                "Calendar 'INACTIVE_RAIL_CAL' is not active in reference data",
            ):
                create_rail_route(
                    RailRouteCreate(
                        code="BAD_CALENDAR",
                        name="Bad Calendar Route",
                        rail_line_code="bnsf_active_line",
                        origin_location_code="WAHA",
                        destination_location_code="HOUSTON_SHIP_CHANNEL",
                        service_calendar_code="inactive_rail_cal",
                        route_direction="FORWARD",
                        description="bad calendar",
                        created_by="test-user",
                    ),
                    db=session,
                )

            with self.assertRaisesRegex(Exception, "timezone 'Mars/Olympus' must be a valid IANA timezone name"):
                create_rail_route(
                    RailRouteCreate(
                        code="BAD_TIMEZONE",
                        name="Bad Timezone Route",
                        rail_line_code="bnsf_active_line",
                        origin_location_code="WAHA",
                        destination_location_code="HOUSTON_SHIP_CHANNEL",
                        route_direction="FORWARD",
                        schedule_timezone="Mars/Olympus",
                        description="bad timezone",
                        created_by="test-user",
                    ),
                    db=session,
                )

            with self.assertRaisesRegex(
                Exception,
                "placement_cutoff_time_local '25:99' is invalid. Expected 24-hour HH:MM format.",
            ):
                create_rail_route(
                    RailRouteCreate(
                        code="BAD_CUTOFF",
                        name="Bad Cutoff Route",
                        rail_line_code="bnsf_active_line",
                        origin_location_code="WAHA",
                        destination_location_code="HOUSTON_SHIP_CHANNEL",
                        route_direction="FORWARD",
                        placement_cutoff_time_local="25:99",
                        description="bad cutoff",
                        created_by="test-user",
                    ),
                    db=session,
                )

    def test_spatial_feature_crud_supports_routes_regions_and_entity_links(self) -> None:
        self._create_commodity("NATURAL_GAS")
        self._create_location("HOUSTON", location_kind="POINT", location_type="HUB")
        self._create_location("GULF_COAST", location_kind="REGION", location_type="CORRIDOR")
        self._create_location("WAHA", latitude=31.9493, longitude=-103.6652)
        self._create_location(
            "HOUSTON_SHIP_CHANNEL",
            location_kind="POINT",
            location_type="TERMINAL",
            city="Houston",
            latitude=29.7285,
            longitude=-95.265,
        )
        self._create_rail_line("BNSF_SOUTHERN_TRANSCON")

        with self.SessionLocal() as session:
            create_asset(
                AssetCreate(
                    code="gulf_pipe",
                    name="Gulf Pipe",
                    asset_class="PIPELINE",
                    asset_type="TRANSMISSION",
                    asset_reality="REAL",
                    commodity_code="NATURAL_GAS",
                    location_code="HOUSTON",
                    operating_status="OPERATING",
                    description="linked asset",
                    created_by="test-user",
                ),
                db=session,
            )
            create_rail_route(
                RailRouteCreate(
                    code="bnsf_waha_hsc",
                    name="BNSF Waha to Houston Ship Channel",
                    rail_line_code="bnsf_southern_transcon",
                    origin_location_code="waha",
                    destination_location_code="houston_ship_channel",
                    route_direction="forward",
                    description="linked rail route",
                    created_by="test-user",
                ),
                db=session,
            )

        with self.SessionLocal() as session:
            created = create_spatial_feature(
                SpatialFeatureCreate(
                    code=" gulf_route ",
                    name=" Gulf Route ",
                    feature_kind=" route ",
                    geometry_geojson={
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": [
                                        [-95.3698, 29.7604],
                                        [-94.8, 29.95],
                                    ],
                                },
                                "properties": {"segment": "A"},
                            }
                        ],
                    },
                    entity_type=" rail_route ",
                    entity_code=" bnsf_waha_hsc ",
                    is_primary=True,
                    source_name=" Curated Geometry Feed ",
                    source_url=" https://example.com/spatial/gulf-route ",
                    confidence=0.88,
                    notes=" Seeded route overlay ",
                    description="test spatial feature",
                    created_by="test-user",
                ),
                db=session,
            )

        self.assertEqual(created.code, "GULF_ROUTE")
        self.assertEqual(created.feature_kind, "ROUTE")
        self.assertEqual(created.geometry_type, "LINE")
        self.assertEqual(created.entity_type, "RAIL_ROUTE")
        self.assertEqual(created.entity_code, "BNSF_WAHA_HSC")
        self.assertTrue(created.is_primary)
        self.assertEqual(created.source_name, "Curated Geometry Feed")
        self.assertEqual(created.source_url, "https://example.com/spatial/gulf-route")
        self.assertEqual(created.confidence, 0.88)
        self.assertEqual(created.notes, "Seeded route overlay")

        standards = list_spatial_feature_standards()
        self.assertEqual(standards.default_feature_kind, "REGION")
        self.assertIn("PIPELINE", standards.feature_kinds)
        self.assertIn("ASSET", standards.entity_types)
        self.assertIn("RAIL_ROUTE", standards.entity_types)
        self.assertIn("LINE", standards.geometry_types)

        with self.SessionLocal() as session:
            listed = list_spatial_features(
                q="curated geometry",
                feature_kind="route",
                geometry_type="line",
                entity_type="rail_route",
                entity_code="bnsf_waha_hsc",
                is_active=True,
                limit=50,
                offset=0,
                db=session,
            )
            updated = update_spatial_feature(
                "gulf_route",
                SpatialFeatureUpdate(
                    feature_kind="region",
                    geometry_geojson={
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-95.6, 29.6],
                                [-94.7, 29.6],
                                [-94.7, 30.2],
                                [-95.6, 30.2],
                                [-95.6, 29.6],
                            ]
                        ],
                    },
                    entity_type="location",
                    entity_code="gulf_coast",
                    label_latitude=29.9,
                    label_longitude=-95.15,
                    is_primary=False,
                    source_name="Scenario Overlay",
                    source_url="https://example.com/spatial/gulf-region",
                    confidence=0.55,
                    notes="Expanded area coverage",
                    updated_by="test-user",
                ),
                db=session,
            )
            deactivated = deactivate_spatial_feature(
                "GULF_ROUTE",
                SpatialFeatureStatusUpdate(updated_by="test-user"),
                db=session,
            )
            reactivated = activate_spatial_feature(
                "GULF_ROUTE",
                SpatialFeatureStatusUpdate(updated_by="test-user"),
                db=session,
            )

        self.assertEqual([feature.code for feature in listed], ["GULF_ROUTE"])
        self.assertEqual(updated.feature_kind, "REGION")
        self.assertEqual(updated.geometry_type, "AREA")
        self.assertEqual(updated.entity_type, "LOCATION")
        self.assertEqual(updated.entity_code, "GULF_COAST")
        self.assertEqual(updated.label_latitude, 29.9)
        self.assertEqual(updated.label_longitude, -95.15)
        self.assertFalse(updated.is_primary)
        self.assertEqual(updated.source_name, "Scenario Overlay")
        self.assertEqual(updated.source_url, "https://example.com/spatial/gulf-region")
        self.assertEqual(updated.confidence, 0.55)
        self.assertEqual(updated.notes, "Expanded area coverage")
        self.assertFalse(deactivated.is_active)
        self.assertTrue(reactivated.is_active)

    def test_spatial_feature_creation_rejects_partial_links_partial_labels_and_unknown_entities(self) -> None:
        self._create_location("HOUSTON", location_kind="POINT", location_type="HUB")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "entity_type and entity_code must be provided together"):
                create_spatial_feature(
                    SpatialFeatureCreate(
                        code="BAD_LINK",
                        name="Bad Link",
                        feature_kind="ROUTE",
                        geometry_geojson={
                            "type": "LineString",
                            "coordinates": [
                                [-95.3698, 29.7604],
                                [-95.1, 29.9],
                            ],
                        },
                        entity_type="ASSET",
                        description="bad link",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "label_latitude and label_longitude must be provided together"):
                create_spatial_feature(
                    SpatialFeatureCreate(
                        code="BAD_LABEL",
                        name="Bad Label",
                        feature_kind="REGION",
                        geometry_geojson={
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [-95.5, 29.5],
                                    [-95.0, 29.5],
                                    [-95.0, 30.0],
                                    [-95.5, 30.0],
                                    [-95.5, 29.5],
                                ]
                            ],
                        },
                        label_latitude=29.7,
                        description="bad label",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Linked asset 'MISSING_ASSET' does not exist"):
                create_spatial_feature(
                    SpatialFeatureCreate(
                        code="BAD_ENTITY",
                        name="Bad Entity",
                        feature_kind="PIPELINE",
                        geometry_geojson={
                            "type": "LineString",
                            "coordinates": [
                                [-95.3698, 29.7604],
                                [-95.1, 29.9],
                            ],
                        },
                        entity_type="ASSET",
                        entity_code="missing_asset",
                        description="bad entity",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "Linked rail route 'MISSING_ROUTE' does not exist"):
                create_spatial_feature(
                    SpatialFeatureCreate(
                        code="BAD_RAIL_ROUTE",
                        name="Bad Rail Route",
                        feature_kind="ROUTE",
                        geometry_geojson={
                            "type": "LineString",
                            "coordinates": [
                                [-95.3698, 29.7604],
                                [-95.1, 29.9],
                            ],
                        },
                        entity_type="RAIL_ROUTE",
                        entity_code="missing_route",
                        description="bad rail route",
                        created_by="test-user",
                    ),
                    db=session,
                )

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(Exception, "geometry_geojson type must be one of"):
                create_spatial_feature(
                    SpatialFeatureCreate(
                        code="BAD_GEOMETRY_FEATURE",
                        name="Bad Geometry Feature",
                        feature_kind="ROUTE",
                        geometry_geojson={"type": "BadType", "coordinates": [0, 0]},
                        description="bad geometry",
                        created_by="test-user",
                    ),
                    db=session,
                )


if __name__ == "__main__":
    unittest.main()
