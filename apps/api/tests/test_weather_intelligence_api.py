from __future__ import annotations

import unittest
from datetime import date
from datetime import datetime
from datetime import timezone
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.position import Position
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.trade import Trade
from apps.api.app.models.trading_source import TradingSource
from apps.api.app.models.weather_forecast_period import WeatherForecastPeriod
from apps.api.app.models.weather_location import WeatherLocation
from apps.api.app.models.weather_observation import WeatherObservation
from apps.api.app.routes.weather import get_weather_intelligence_overview


class WeatherIntelligenceApiTests(unittest.TestCase):
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
            session.query(WeatherObservation).delete()
            session.query(WeatherForecastPeriod).delete()
            session.query(WeatherLocation).delete()
            session.query(ExternalDataRun).delete()
            session.query(Trade).delete()
            session.query(Position).delete()
            session.query(ReferenceCommodity).delete()
            session.query(TradingSource).delete()
            session.commit()

    def _seed_reference_commodity(self, code: str, commodity_class: str, name: str) -> None:
        now = datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferenceCommodity(
                    code=code,
                    commodity_class=commodity_class,
                    name=name,
                    description="test",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def _seed_position(self, commodity: str, net_volume: str) -> None:
        with self.SessionLocal() as session:
            session.add(
                Position(
                    commodity=commodity,
                    net_volume=Decimal(net_volume),
                    updated_at=datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc),
                )
            )
            session.commit()

    def _seed_trade(self, trade_id: str, commodity_class: str, commodity: str, status: str = "ACTIVE") -> None:
        now = datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id=trade_id,
                    external_trade_id=None,
                    source_system="TEST",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=None,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="TEST_BOOK",
                    portfolio=None,
                    counterparty=None,
                    commodity_class=commodity_class,
                    commodity=commodity,
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=None,
                    volume=Decimal("1000"),
                    settlement_status="PENDING",
                    trader_user="tester",
                    status=status,
                    last_event_id=f"event-{trade_id}",
                )
            )
            session.commit()

    def _seed_trading_source(self, source_id: str, source_name: str, source_category: str = "weather") -> None:
        with self.SessionLocal() as session:
            session.add(
                TradingSource(
                    source_id=source_id,
                    source_name=source_name,
                    source_category=source_category,
                    dataset_name=source_name,
                    business_purpose="forecasting",
                    asset_classes="power; gas",
                    products_or_regions="US",
                    system_owner="External Data Platform",
                    business_owner="Commodities Trading",
                    vendor_or_origin="Vendor",
                    golden_source="primary",
                    fallback_source="backup",
                    update_frequency="hourly",
                    delivery_pattern="api_pull",
                    latency_requirement="<15 minutes",
                    retention_requirement="10 years",
                    storage_pattern="lakehouse",
                    schema_owner="Data Platform",
                    quality_checks="coverage checks",
                    reconciliation_method="sample recon",
                    usage_scope="research; risk",
                    criticality="tier_1",
                    license_type="commercial",
                    license_restrictions="none",
                    entitlements_required="yes",
                    cost_model="subscription",
                    sensitivity_class="internal_confidential",
                    availability_slo="99.9%",
                    incident_runbook="weather.md",
                    monitoring_metrics="coverage",
                    lineage_notes="notes",
                    last_reviewed_at=date(2026, 3, 10),
                    status="active",
                )
            )
            session.commit()

    def _seed_live_weather_run(self, run_id: int = 1) -> None:
        now = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ExternalDataRun(
                    id=run_id,
                    provider="NWS",
                    job_name="sync_nws_weather_data",
                    status="SUCCEEDED",
                    started_at=now,
                    finished_at=now,
                    requested_by="test-user",
                    series_count=2,
                    observation_count=20,
                    error_summary=None,
                    created_at=now,
                )
            )
            session.commit()

    def _seed_weather_location(
        self,
        *,
        code: str,
        name: str,
        timezone_name: str,
        latitude: float,
        longitude: float,
    ) -> None:
        now = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                WeatherLocation(
                    code=code,
                    name=name,
                    reference_location_code=code if code in {"PJM_WEST", "HENRY_HUB"} else None,
                    latitude=latitude,
                    longitude=longitude,
                    timezone=timezone_name,
                    source_provider="NWS",
                    cwa=None,
                    grid_id=None,
                    grid_x=None,
                    grid_y=None,
                    station_id=None,
                    description="live weather point",
                    is_active=True,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def _seed_weather_observation(
        self,
        *,
        location_code: str,
        station_id: str,
        observed_at: datetime,
        temperature_celsius: float,
        downloaded_at: datetime,
        run_id: int = 1,
        text_description: str = "Clear",
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                WeatherObservation(
                    weather_location_code=location_code,
                    source_provider="NWS",
                    station_id=station_id,
                    observed_at=observed_at,
                    text_description=text_description,
                    icon_url=None,
                    temperature_celsius=temperature_celsius,
                    dewpoint_celsius=None,
                    relative_humidity_pct=None,
                    wind_speed_kmh=None,
                    wind_direction_degrees=None,
                    barometric_pressure_pa=None,
                    visibility_meters=None,
                    downloaded_at=downloaded_at,
                    run_id=run_id,
                    raw_payload={"station": station_id},
                    created_at=downloaded_at,
                    updated_at=downloaded_at,
                )
            )
            session.commit()

    def _seed_weather_forecast(
        self,
        *,
        location_code: str,
        period_number: int,
        start_at: datetime,
        end_at: datetime,
        temperature_f: float,
        precipitation_pct: float,
        downloaded_at: datetime,
        short_forecast: str,
        run_id: int = 1,
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                WeatherForecastPeriod(
                    weather_location_code=location_code,
                    source_provider="NWS",
                    period_number=period_number,
                    start_at=start_at,
                    end_at=end_at,
                    is_daytime=True,
                    temperature=temperature_f,
                    temperature_unit="F",
                    wind_speed="10 mph",
                    wind_direction="NW",
                    short_forecast=short_forecast,
                    detailed_forecast=short_forecast,
                    probability_of_precipitation_pct=precipitation_pct,
                    relative_humidity_pct=50.0,
                    dewpoint_celsius=None,
                    icon_url=None,
                    downloaded_at=downloaded_at,
                    run_id=run_id,
                    raw_payload={"number": period_number},
                    created_at=downloaded_at,
                    updated_at=downloaded_at,
                )
            )
            session.commit()

    def test_weather_overview_summarizes_winter_exposure_and_source_gaps(self) -> None:
        self._seed_reference_commodity("NATURAL_GAS", "NATURAL_GAS", "Natural Gas")
        self._seed_reference_commodity("POWER", "POWER", "Power")
        self._seed_reference_commodity("BRENT", "CRUDE_OIL", "Brent")

        self._seed_position("NATURAL_GAS", "120000")
        self._seed_position("POWER", "-25000")
        self._seed_position("BRENT", "10000")

        self._seed_trade("trade-gas-1", "NATURAL_GAS", "NATURAL_GAS")
        self._seed_trade("trade-gas-2", "NATURAL_GAS", "NATURAL_GAS")
        self._seed_trade("trade-power-1", "POWER", "POWER")
        self._seed_trade("trade-brent-1", "CRUDE_OIL", "BRENT", status="CANCELLED")

        self._seed_trading_source("weather_forecast_obs", "Weather Forecast and Observations")
        self._seed_trading_source("power_iso_load", "ISO Load and Grid Fundamentals")

        with self.SessionLocal() as session:
            payload = get_weather_intelligence_overview(
                as_of_date=date(2026, 1, 15),
                db=session,
            )

        self.assertEqual(payload.analysis_mode, "SEASONAL_BASELINE")
        self.assertEqual(payload.seasonal_regime, "WINTER_HEATING")
        self.assertEqual(payload.exposures[0].commodity_code, "NATURAL_GAS")
        self.assertEqual(payload.exposures[0].active_trade_count, 2)
        self.assertEqual([row.region_code for row in payload.regional_signals[:2]], ["NORTHEAST", "MIDWEST"])
        self.assertEqual([row.source_id for row in payload.tracked_sources], ["power_iso_load", "weather_forecast_obs"])
        self.assertTrue(any("gas_pipeline_storage" in item for item in payload.focus_areas))

    def test_weather_overview_filters_to_power_and_single_region(self) -> None:
        self._seed_reference_commodity("NATURAL_GAS", "NATURAL_GAS", "Natural Gas")
        self._seed_reference_commodity("POWER", "POWER", "Power")
        self._seed_position("NATURAL_GAS", "120000")
        self._seed_position("POWER", "-25000")
        self._seed_trade("trade-gas-1", "NATURAL_GAS", "NATURAL_GAS")
        self._seed_trade("trade-power-1", "POWER", "POWER")
        self._seed_trading_source("weather_forecast_obs", "Weather Forecast and Observations")
        self._seed_trading_source("power_iso_load", "ISO Load and Grid Fundamentals")
        self._seed_trading_source("gas_pipeline_storage", "Pipeline Flows and Storage", source_category="weather")

        with self.SessionLocal() as session:
            payload = get_weather_intelligence_overview(
                as_of_date=date(2026, 7, 20),
                commodity_class="power",
                region_code="ercot",
                db=session,
            )

        self.assertEqual(payload.seasonal_regime, "SUMMER_COOLING")
        self.assertEqual(payload.weather_sensitive_exposure_count, 1)
        self.assertEqual(payload.exposures[0].commodity_class, "POWER")
        self.assertEqual(payload.exposures[0].directional_bias, "SHORT")
        self.assertEqual(len(payload.regional_signals), 1)
        self.assertEqual(payload.regional_signals[0].region_code, "ERCOT")

    def test_weather_overview_handles_empty_position_state(self) -> None:
        self._seed_trading_source("weather_forecast_obs", "Weather Forecast and Observations")

        with self.SessionLocal() as session:
            payload = get_weather_intelligence_overview(
                as_of_date=date(2026, 4, 5),
                db=session,
            )

        self.assertEqual(payload.seasonal_regime, "SHOULDER_BALANCING")
        self.assertEqual(payload.weather_sensitive_exposure_count, 0)
        self.assertEqual(payload.weather_sensitive_gross_volume, 0.0)
        self.assertTrue(payload.headline.startswith("Seasonal baseline: Shoulder Balancing"))
        self.assertTrue(any("No weather-sensitive projected positions" in item for item in payload.focus_areas))

    def test_weather_overview_blends_live_nws_signals_for_current_day(self) -> None:
        self._seed_reference_commodity("NATURAL_GAS", "NATURAL_GAS", "Natural Gas")
        self._seed_reference_commodity("POWER", "POWER", "Power")
        self._seed_position("NATURAL_GAS", "120000")
        self._seed_position("POWER", "-25000")
        self._seed_trade("trade-gas-1", "NATURAL_GAS", "NATURAL_GAS")
        self._seed_trade("trade-power-1", "POWER", "POWER")
        self._seed_trading_source("weather_forecast_obs", "Weather Forecast and Observations")
        self._seed_trading_source("power_iso_load", "ISO Load and Grid Fundamentals")
        self._seed_trading_source("gas_pipeline_storage", "Pipeline Flows and Storage", source_category="weather")

        self._seed_live_weather_run()
        self._seed_weather_location(
            code="BOS_LOAD",
            name="Boston Load Center",
            timezone_name="America/New_York",
            latitude=42.36,
            longitude=-71.06,
        )
        self._seed_weather_location(
            code="ERCOT_HOUSTON",
            name="ERCOT Houston Load Center",
            timezone_name="America/Chicago",
            latitude=29.76,
            longitude=-95.36,
        )
        self._seed_weather_observation(
            location_code="BOS_LOAD",
            station_id="KBOS",
            observed_at=datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc),
            temperature_celsius=-5.0,
            downloaded_at=datetime(2026, 1, 15, 12, 10, tzinfo=timezone.utc),
            text_description="Light snow",
        )
        self._seed_weather_observation(
            location_code="ERCOT_HOUSTON",
            station_id="KHOU",
            observed_at=datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc),
            temperature_celsius=19.0,
            downloaded_at=datetime(2026, 1, 15, 12, 5, tzinfo=timezone.utc),
            text_description="Warm and humid",
        )
        for index, temperature_f in enumerate((18.0, 16.0, 14.0), start=1):
            self._seed_weather_forecast(
                location_code="BOS_LOAD",
                period_number=index,
                start_at=datetime(2026, 1, 15, 12 + index - 1, 0, tzinfo=timezone.utc),
                end_at=datetime(2026, 1, 15, 13 + index - 1, 0, tzinfo=timezone.utc),
                temperature_f=temperature_f,
                precipitation_pct=70.0,
                downloaded_at=datetime(2026, 1, 15, 11, 45, tzinfo=timezone.utc),
                short_forecast="Snow likely",
            )
        for index, temperature_f in enumerate((69.0, 71.0, 72.0), start=1):
            self._seed_weather_forecast(
                location_code="ERCOT_HOUSTON",
                period_number=10 + index,
                start_at=datetime(2026, 1, 15, 12 + index - 1, 0, tzinfo=timezone.utc),
                end_at=datetime(2026, 1, 15, 13 + index - 1, 0, tzinfo=timezone.utc),
                temperature_f=temperature_f,
                precipitation_pct=5.0,
                downloaded_at=datetime(2026, 1, 15, 11, 50, tzinfo=timezone.utc),
                short_forecast="Mostly sunny",
            )

        with patch("apps.api.app.domains.weather.services.intelligence.date") as date_mock, patch(
            "apps.api.app.domains.weather.services.intelligence.datetime"
        ) as datetime_mock:
            date_mock.today.return_value = date(2026, 1, 15)
            datetime_mock.now.return_value = datetime(2026, 1, 15, 12, 30, tzinfo=timezone.utc)
            with self.SessionLocal() as session:
                payload = get_weather_intelligence_overview(db=session)

        northeast = next(row for row in payload.regional_signals if row.region_code == "NORTHEAST")
        self.assertEqual(payload.analysis_mode, "LIVE_NWS_BLEND")
        self.assertEqual(payload.live_weather_location_count, 2)
        self.assertIsNotNone(payload.latest_weather_update_at)
        self.assertTrue(payload.headline.startswith("Live NWS blend:"))
        self.assertEqual(northeast.data_mode, "LIVE_NWS")
        self.assertEqual(northeast.demand_risk, "HIGH")
        self.assertEqual(northeast.storm_risk, "HIGH")
        self.assertAlmostEqual(northeast.current_temperature_f, 23.0, places=1)
        self.assertIn("Live NWS blend", northeast.narrative)
        self.assertTrue(any("Live regional watch:" in item for item in payload.focus_areas))

    def test_weather_overview_keeps_baseline_mode_for_non_current_analysis_date(self) -> None:
        self._seed_trading_source("weather_forecast_obs", "Weather Forecast and Observations")
        self._seed_live_weather_run()
        self._seed_weather_location(
            code="BOS_LOAD",
            name="Boston Load Center",
            timezone_name="America/New_York",
            latitude=42.36,
            longitude=-71.06,
        )
        self._seed_weather_observation(
            location_code="BOS_LOAD",
            station_id="KBOS",
            observed_at=datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc),
            temperature_celsius=-5.0,
            downloaded_at=datetime(2026, 1, 15, 12, 10, tzinfo=timezone.utc),
        )

        with patch("apps.api.app.domains.weather.services.intelligence.date") as date_mock:
            date_mock.today.return_value = date(2026, 1, 15)
            with self.SessionLocal() as session:
                payload = get_weather_intelligence_overview(
                    as_of_date=date(2026, 1, 14),
                    db=session,
                )

        self.assertEqual(payload.analysis_mode, "SEASONAL_BASELINE")
        self.assertEqual(payload.live_weather_location_count, 0)


if __name__ == "__main__":
    unittest.main()
