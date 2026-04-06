from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource
from apps.api.app.routes.external_data import (
    create_external_series_definition,
    get_external_data_sync_status,
    get_latest_external_series_observation,
    get_external_data_run,
    get_market_context,
    get_latest_price_index_observation,
    list_external_series_definitions,
    list_external_series_observations,
    list_price_index_observations,
    list_external_data_runs,
    trigger_caiso_sync,
    trigger_kalshi_sync,
    trigger_cftc_sync,
    trigger_eia_sync,
    trigger_ercot_sync,
    trigger_fred_sync,
    update_external_series_definition,
)
from apps.api.app.schemas.external_data import (
    EIASyncRequest,
    ExternalSeriesDefinitionUpsertRequest,
    ExternalSeriesSyncRequest,
)


class ExternalDataApiTests(unittest.TestCase):
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
            session.query(ExternalSeriesObservation).delete()
            session.query(ExternalSeriesDefinition).delete()
            session.query(PriceIndexObservation).delete()
            session.query(ExternalDataRun).delete()
            session.query(ReferencePriceIndexSource).delete()
            session.query(ReferencePriceIndex).delete()
            session.commit()

    def _seed_rows(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    ReferencePriceIndex(
                        code="WTI_CUSHING_D",
                        name="WTI Cushing Spot Daily",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="EIA",
                        market="CUSHING",
                        location_code=None,
                        calendar_code=None,
                        description="Test",
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=datetime.now(timezone.utc),
                        created_by="system",
                        updated_at=datetime.now(timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    ExternalDataRun(
                        id=1,
                        provider="EIA",
                        job_name="sync_eia_price_data",
                        status="FAILED",
                        started_at=datetime(2026, 3, 9, 12, 0, tzinfo=timezone.utc),
                        finished_at=datetime(2026, 3, 9, 12, 5, tzinfo=timezone.utc),
                        requested_by="user-a",
                        series_count=1,
                        observation_count=0,
                        error_summary="boom",
                        created_at=datetime(2026, 3, 9, 12, 0, tzinfo=timezone.utc),
                    ),
                    ExternalDataRun(
                        id=2,
                        provider="EIA",
                        job_name="sync_eia_price_data",
                        status="SUCCEEDED",
                        started_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                        finished_at=datetime(2026, 3, 10, 12, 5, tzinfo=timezone.utc),
                        requested_by="user-b",
                        series_count=1,
                        observation_count=2,
                        error_summary=None,
                        created_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                    ),
                    PriceIndexObservation(
                        id=1,
                        price_index_code="WTI_CUSHING_D",
                        observation_date=date(2026, 3, 9),
                        value=Decimal("66.100000"),
                        unit_code="BBL",
                        currency_code="USD",
                        source_provider="EIA",
                        source_series_id="PET.RWTC.D",
                        source_frequency="DAILY",
                        source_published_at=datetime(2026, 3, 9, 17, 0, tzinfo=timezone.utc),
                        source_revision="2026-03-09T17:00:00Z",
                        downloaded_at=datetime(2026, 3, 10, 12, 5, tzinfo=timezone.utc),
                        run_id=2,
                        raw_payload={"period": "2026-03-09", "value": "66.1"},
                        created_at=datetime(2026, 3, 10, 12, 5, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 10, 12, 5, tzinfo=timezone.utc),
                    ),
                    PriceIndexObservation(
                        id=2,
                        price_index_code="WTI_CUSHING_D",
                        observation_date=date(2026, 3, 10),
                        value=Decimal("67.200000"),
                        unit_code="BBL",
                        currency_code="USD",
                        source_provider="EIA",
                        source_series_id="PET.RWTC.D",
                        source_frequency="DAILY",
                        source_published_at=datetime(2026, 3, 10, 17, 0, tzinfo=timezone.utc),
                        source_revision="2026-03-10T17:00:00Z",
                        downloaded_at=datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc),
                        run_id=2,
                        raw_payload={"period": "2026-03-10", "value": "67.2"},
                        created_at=datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc),
                    ),
                    ExternalSeriesDefinition(
                        code="FRED_DGS10",
                        provider="FRED",
                        dataset_code=None,
                        series_id="DGS10",
                        name="10-Year Treasury Constant Maturity Rate",
                        category="macro",
                        frequency="daily",
                        unit_code="PCT",
                        source_url="https://fred.stlouisfed.org/series/DGS10",
                        description="Test FRED series",
                        query_params=None,
                        transform_rule="field:value",
                        is_active=True,
                        created_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesDefinition(
                        code="CFTC_WTI_MM_NET",
                        provider="CFTC",
                        dataset_code="72hh-3qpy",
                        series_id="067651",
                        name="WTI Managed Money Net Position",
                        category="positioning",
                        frequency="weekly",
                        unit_code="CONTRACTS",
                        source_url="https://publicreporting.cftc.gov/",
                        description="Test CFTC series",
                        query_params={"cftc_contract_market_code": "067651"},
                        transform_rule="net:m_money_positions_long_all:m_money_positions_short_all",
                        is_active=True,
                        created_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesDefinition(
                        code="CAISO_NP15_RT5M",
                        provider="CAISO",
                        dataset_code=None,
                        series_id="NP15",
                        name="CAISO NP15 Real-Time 5-Minute Hub LMP",
                        category="power",
                        frequency="daily",
                        unit_code="USD_MWH",
                        source_url="https://oasis.caiso.com/oasisapi/prc_hub_lmp/PRC_HUB_LMP.html",
                        description="Test CAISO series",
                        query_params={"hub": "NP15"},
                        transform_rule="field:lmp",
                        is_active=True,
                        created_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesObservation(
                        id=1,
                        series_code="FRED_DGS10",
                        observation_date=date(2026, 3, 10),
                        value=Decimal("4.280000"),
                        unit_code="PCT",
                        source_provider="FRED",
                        source_series_id="DGS10",
                        source_frequency="DAILY",
                        source_published_at=None,
                        source_revision="2026-03-10:2026-03-10",
                        downloaded_at=datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc),
                        run_id=2,
                        raw_payload={"date": "2026-03-10", "value": "4.28"},
                        created_at=datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc),
                    ),
                    ExternalSeriesObservation(
                        id=2,
                        series_code="CFTC_WTI_MM_NET",
                        observation_date=date(2026, 3, 31),
                        value=Decimal("73347.000000"),
                        unit_code="CONTRACTS",
                        source_provider="CFTC",
                        source_series_id="067651",
                        source_frequency="WEEKLY",
                        source_published_at=datetime(2026, 3, 31, 0, 0, tzinfo=timezone.utc),
                        source_revision="abc-2",
                        downloaded_at=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
                        run_id=2,
                        raw_payload={"id": "abc-2", "report_date_as_yyyy_mm_dd": "2026-03-31T00:00:00.000"},
                        created_at=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
                    ),
                    ExternalSeriesObservation(
                        id=3,
                        series_code="CAISO_NP15_RT5M",
                        observation_date=date(2026, 4, 5),
                        value=Decimal("28.450000"),
                        unit_code="USD_MWH",
                        source_provider="CAISO",
                        source_series_id="NP15",
                        source_frequency="5MIN",
                        source_published_at=None,
                        source_revision="2026-04-05:HE17:I03",
                        downloaded_at=datetime(2026, 4, 5, 17, 15, tzinfo=timezone.utc),
                        run_id=2,
                        raw_payload={"trade_date": "2026-04-05", "hour": 17, "interval": 3, "hub": "NP15", "lmp": "28.45"},
                        created_at=datetime(2026, 4, 5, 17, 15, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 4, 5, 17, 15, tzinfo=timezone.utc),
                    ),
                ]
            )
            session.commit()

    def test_list_external_data_runs_orders_latest_first(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = list_external_data_runs(provider="EIA", limit=50, offset=0, db=session)

        self.assertEqual([row.id for row in payload], [2, 1])

    def test_get_external_data_run_returns_requested_run(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = get_external_data_run(2, db=session)

        self.assertEqual(payload.status, "SUCCEEDED")
        self.assertEqual(payload.observation_count, 2)

    def test_get_latest_price_index_observation_returns_latest_date(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = get_latest_price_index_observation("wti_cushing_d", db=session)

        self.assertEqual(payload.price_index_code, "WTI_CUSHING_D")
        self.assertEqual(payload.observation_date, date(2026, 3, 10))
        self.assertEqual(payload.value, 67.2)

    def test_list_price_index_observations_returns_latest_first_with_limit(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = list_price_index_observations("wti_cushing_d", limit=1, db=session)

        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0].price_index_code, "WTI_CUSHING_D")
        self.assertEqual(payload[0].observation_date, date(2026, 3, 10))
        self.assertEqual(payload[0].value, 67.2)

    def test_list_external_series_definitions_filters_by_provider(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = list_external_series_definitions(provider="fred", limit=50, offset=0, db=session)

        self.assertEqual([row.code for row in payload], ["FRED_DGS10"])

    def test_get_latest_external_series_observation_returns_latest_row(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = get_latest_external_series_observation("fred_dgs10", db=session)

        self.assertEqual(payload.series_code, "FRED_DGS10")
        self.assertEqual(payload.observation_date, date(2026, 3, 10))
        self.assertEqual(payload.value, 4.28)

    def test_list_external_series_observations_returns_rows(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = list_external_series_observations("cftc_wti_mm_net", limit=10, db=session)

        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0].series_code, "CFTC_WTI_MM_NET")
        self.assertEqual(payload[0].value, 73347.0)

    def test_get_market_context_returns_combined_sections(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = get_market_context(limit=5, db=session)

        self.assertEqual(len(payload.price_indices), 1)
        self.assertEqual(payload.price_indices[0].price_index_code, "WTI_CUSHING_D")
        self.assertEqual(len(payload.power), 1)
        self.assertEqual(payload.power[0].series_code, "CAISO_NP15_RT5M")
        self.assertEqual(len(payload.macro), 1)
        self.assertEqual(payload.macro[0].series_code, "FRED_DGS10")
        self.assertEqual(len(payload.positioning), 1)
        self.assertEqual(payload.positioning[0].series_code, "CFTC_WTI_MM_NET")
        self.assertGreaterEqual(len(payload.freshness), 5)

    def test_get_market_context_filters_positioning_by_commodity(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            payload = get_market_context(commodity="HH", limit=5, db=session)

        self.assertEqual(payload.commodity, "HH")
        self.assertEqual(payload.price_indices, [])
        self.assertEqual(len(payload.power), 1)
        self.assertEqual(len(payload.macro), 1)
        self.assertEqual(payload.positioning, [])

    def test_get_external_data_sync_status_reports_provider_health(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    ReferencePriceIndex(
                        code="WTI_CUSHING_D",
                        name="WTI Cushing Spot Daily",
                        commodity_code="WTI",
                        currency_code="USD",
                        unit_code="BBL",
                        provider="EIA",
                        market="CUSHING",
                        location_code=None,
                        calendar_code=None,
                        description="Test",
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="system",
                        updated_at=now,
                        updated_by="system",
                        version=1,
                    ),
                    ReferencePriceIndexSource(
                        id=10,
                        price_index_code="WTI_CUSHING_D",
                        provider="EIA",
                        dataset_code=None,
                        series_id="PET.RWTC.D",
                        frequency="daily",
                        source_unit="BBL",
                        source_currency_code="USD",
                        transform_rule=None,
                        is_active=True,
                        created_at=now,
                        created_by="system",
                        updated_at=now,
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesDefinition(
                        code="FRED_DGS10",
                        provider="FRED",
                        dataset_code=None,
                        series_id="DGS10",
                        name="10-Year Treasury",
                        category="macro",
                        frequency="daily",
                        unit_code="PCT",
                        source_url=None,
                        description=None,
                        query_params=None,
                        transform_rule="field:value",
                        is_active=True,
                        created_at=now,
                        created_by="system",
                        updated_at=now,
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesDefinition(
                        code="CFTC_WTI_MM_NET",
                        provider="CFTC",
                        dataset_code="72hh-3qpy",
                        series_id="067651",
                        name="WTI Positioning",
                        category="positioning",
                        frequency="weekly",
                        unit_code="CONTRACTS",
                        source_url=None,
                        description=None,
                        query_params=None,
                        transform_rule="field:open_interest_all",
                        is_active=True,
                        created_at=now,
                        created_by="system",
                        updated_at=now,
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesDefinition(
                        code="CAISO_NP15_RT5M",
                        provider="CAISO",
                        dataset_code=None,
                        series_id="NP15",
                        name="NP15",
                        category="power",
                        frequency="daily",
                        unit_code="USD_MWH",
                        source_url=None,
                        description=None,
                        query_params=None,
                        transform_rule="field:lmp",
                        is_active=True,
                        created_at=now,
                        created_by="system",
                        updated_at=now,
                        updated_by="system",
                        version=1,
                    ),
                    ExternalDataRun(
                        id=10,
                        provider="EIA",
                        job_name="sync_eia_price_data",
                        status="SUCCEEDED",
                        started_at=now - timedelta(hours=3),
                        finished_at=now - timedelta(hours=3) + timedelta(minutes=5),
                        requested_by="scheduler",
                        series_count=1,
                        observation_count=1,
                        error_summary=None,
                        created_at=now - timedelta(hours=3),
                    ),
                    ExternalDataRun(
                        id=11,
                        provider="FRED",
                        job_name="sync_fred_series",
                        status="SUCCEEDED",
                        started_at=now - timedelta(hours=4),
                        finished_at=now - timedelta(hours=4) + timedelta(minutes=1),
                        requested_by="scheduler",
                        series_count=1,
                        observation_count=1,
                        error_summary=None,
                        created_at=now - timedelta(hours=4),
                    ),
                    ExternalDataRun(
                        id=12,
                        provider="CFTC",
                        job_name="sync_cftc_series",
                        status="FAILED",
                        started_at=now - timedelta(hours=2),
                        finished_at=now - timedelta(hours=2) + timedelta(minutes=1),
                        requested_by="scheduler",
                        series_count=1,
                        observation_count=0,
                        error_summary="boom",
                        created_at=now - timedelta(hours=2),
                    ),
                    ExternalDataRun(
                        id=13,
                        provider="CAISO",
                        job_name="sync_caiso_power_series",
                        status="SUCCEEDED",
                        started_at=now - timedelta(minutes=10),
                        finished_at=now - timedelta(minutes=9),
                        requested_by="scheduler",
                        series_count=1,
                        observation_count=1,
                        error_summary=None,
                        created_at=now - timedelta(minutes=10),
                    ),
                    PriceIndexObservation(
                        id=10,
                        price_index_code="WTI_CUSHING_D",
                        observation_date=now.date(),
                        value=Decimal("65.000000"),
                        unit_code="BBL",
                        currency_code="USD",
                        source_provider="EIA",
                        source_series_id="PET.RWTC.D",
                        source_frequency="DAILY",
                        source_published_at=now - timedelta(hours=3),
                        source_revision="rev-1",
                        downloaded_at=now - timedelta(hours=3),
                        run_id=10,
                        raw_payload={},
                        created_at=now - timedelta(hours=3),
                        updated_at=now - timedelta(hours=3),
                    ),
                    ExternalSeriesObservation(
                        id=10,
                        series_code="FRED_DGS10",
                        observation_date=now.date(),
                        value=Decimal("4.100000"),
                        unit_code="PCT",
                        source_provider="FRED",
                        source_series_id="DGS10",
                        source_frequency="DAILY",
                        source_published_at=None,
                        source_revision="rev-2",
                        downloaded_at=now - timedelta(hours=4),
                        run_id=11,
                        raw_payload={},
                        created_at=now - timedelta(hours=4),
                        updated_at=now - timedelta(hours=4),
                    ),
                    ExternalSeriesObservation(
                        id=11,
                        series_code="CAISO_NP15_RT5M",
                        observation_date=now.date(),
                        value=Decimal("23.000000"),
                        unit_code="USD_MWH",
                        source_provider="CAISO",
                        source_series_id="NP15",
                        source_frequency="5MIN",
                        source_published_at=None,
                        source_revision="rev-3",
                        downloaded_at=now - timedelta(minutes=10),
                        run_id=13,
                        raw_payload={},
                        created_at=now - timedelta(minutes=10),
                        updated_at=now - timedelta(minutes=10),
                    ),
                ]
            )
            session.commit()
            payload = get_external_data_sync_status(db=session)

        providers = {row.provider: row for row in payload.providers}
        self.assertEqual(payload.provider_count, 5)
        self.assertEqual(providers["EIA"].health_status, "healthy")
        self.assertEqual(providers["FRED"].health_status, "healthy")
        self.assertEqual(providers["CFTC"].health_status, "failed")
        self.assertEqual(providers["CAISO"].health_status, "healthy")
        self.assertEqual(providers["ERCOT"].health_status, "unknown")
        self.assertFalse(providers["CAISO"].due_for_sync)
        self.assertEqual(providers["CFTC"].error_summary, "boom")

    def test_trigger_eia_sync_returns_run_payload(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            expected_run = session.query(ExternalDataRun).filter(ExternalDataRun.id == 2).one()
            with patch("apps.api.app.routes.external_data.sync_eia_series", return_value=expected_run) as sync_mock:
                payload = trigger_eia_sync(
                    EIASyncRequest(
                        price_index_code="WTI_CUSHING_D",
                        lookback_days=30,
                        requested_by="anthony",
                    ),
                    db=session,
                )

        self.assertEqual(payload.id, 2)
        self.assertEqual(payload.status, "SUCCEEDED")
        sync_mock.assert_called_once()

    def test_trigger_fred_sync_returns_run_payload(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            expected_run = session.query(ExternalDataRun).filter(ExternalDataRun.id == 2).one()
            with patch("apps.api.app.routes.external_data.sync_fred_series", return_value=expected_run) as sync_mock:
                payload = trigger_fred_sync(
                    ExternalSeriesSyncRequest(
                        series_code="FRED_DGS10",
                        lookback_days=30,
                        requested_by="anthony",
                    ),
                    db=session,
                )

        self.assertEqual(payload.id, 2)
        self.assertEqual(payload.status, "SUCCEEDED")
        sync_mock.assert_called_once()

    def test_trigger_cftc_sync_returns_run_payload(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            expected_run = session.query(ExternalDataRun).filter(ExternalDataRun.id == 2).one()
            with patch("apps.api.app.routes.external_data.sync_cftc_series", return_value=expected_run) as sync_mock:
                payload = trigger_cftc_sync(
                    ExternalSeriesSyncRequest(
                        series_code="CFTC_WTI_MM_NET",
                        lookback_days=30,
                        requested_by="anthony",
                    ),
                    db=session,
                )

        self.assertEqual(payload.id, 2)
        self.assertEqual(payload.status, "SUCCEEDED")
        sync_mock.assert_called_once()

    def test_trigger_caiso_sync_returns_run_payload(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            expected_run = session.query(ExternalDataRun).filter(ExternalDataRun.id == 2).one()
            with patch("apps.api.app.routes.external_data.sync_caiso_series", return_value=expected_run) as sync_mock:
                payload = trigger_caiso_sync(
                    ExternalSeriesSyncRequest(
                        series_code="CAISO_NP15_RT5M",
                        lookback_days=1,
                        requested_by="anthony",
                    ),
                    db=session,
                )

        self.assertEqual(payload.id, 2)
        self.assertEqual(payload.status, "SUCCEEDED")
        sync_mock.assert_called_once()

    def test_trigger_ercot_sync_returns_run_payload(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            expected_run = session.query(ExternalDataRun).filter(ExternalDataRun.id == 2).one()
            with patch("apps.api.app.routes.external_data.sync_ercot_series", return_value=expected_run) as sync_mock:
                payload = trigger_ercot_sync(
                    ExternalSeriesSyncRequest(
                        series_code="ERCOT_HB_HOUSTON_RT15M",
                        lookback_days=1,
                        requested_by="anthony",
                    ),
                    db=session,
                )

        self.assertEqual(payload.id, 2)
        self.assertEqual(payload.status, "SUCCEEDED")
        sync_mock.assert_called_once()

    def test_trigger_kalshi_sync_returns_run_payload(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            expected_run = session.query(ExternalDataRun).filter(ExternalDataRun.id == 2).one()
            with patch("apps.api.app.routes.external_data.sync_kalshi_series", return_value=expected_run) as sync_mock:
                payload = trigger_kalshi_sync(
                    ExternalSeriesSyncRequest(
                        series_code="KALSHI_FED_2026_RATE_CUT",
                        lookback_days=30,
                        requested_by="anthony",
                    ),
                    db=session,
                )

        self.assertEqual(payload.id, 2)
        self.assertEqual(payload.status, "SUCCEEDED")
        sync_mock.assert_called_once()

    def test_create_external_series_definition_normalizes_kalshi_defaults(self) -> None:
        with self.SessionLocal() as session:
            payload = create_external_series_definition(
                ExternalSeriesDefinitionUpsertRequest(
                    code="kalshi_fed_2026_rate_cut",
                    provider="kalshi",
                    dataset_code="KXFEDRATECUT",
                    series_id="KXFEDRATECUT-26DEC17-25BPYES",
                    name="Fed Cuts At Least 25bp In 2026",
                    category="Prediction",
                    frequency="daily",
                    unit_code="usd",
                    source_url="https://kalshi.com",
                    description="Test Kalshi market",
                    query_params={"book": "macro"},
                    transform_rule=None,
                    is_active=True,
                    requested_by="anthony",
                ),
                db=session,
            )

            stored = session.get(ExternalSeriesDefinition, "KALSHI_FED_2026_RATE_CUT")

        self.assertEqual(payload.code, "KALSHI_FED_2026_RATE_CUT")
        self.assertEqual(payload.provider, "KALSHI")
        self.assertEqual(payload.transform_rule, "field:price.close_dollars")
        self.assertIsNotNone(stored)
        self.assertEqual(stored.created_by, "anthony")

    def test_update_external_series_definition_bumps_version(self) -> None:
        self._seed_rows()
        with self.SessionLocal() as session:
            session.add(
                ExternalSeriesDefinition(
                    code="KALSHI_FED_2026_RATE_CUT",
                    provider="KALSHI",
                    dataset_code="KXFEDRATECUT",
                    series_id="KXFEDRATECUT-26DEC17-25BPYES",
                    name="Fed Cuts At Least 25bp In 2026",
                    category="prediction",
                    frequency="daily",
                    unit_code="USD",
                    source_url="https://kalshi.com",
                    description="Before",
                    query_params=None,
                    transform_rule="field:price.close_dollars",
                    is_active=True,
                    created_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                    created_by="system",
                    updated_at=datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc),
                    updated_by="system",
                    version=1,
                )
            )
            session.commit()

            payload = update_external_series_definition(
                "kalshi_fed_2026_rate_cut",
                ExternalSeriesDefinitionUpsertRequest(
                    code="KALSHI_FED_2026_RATE_CUT",
                    provider="KALSHI",
                    dataset_code="KXFEDRATECUT",
                    series_id="KXFEDRATECUT-26DEC17-25BPYES",
                    name="Fed Cuts At Least 25bp In 2026",
                    category="prediction",
                    frequency="daily",
                    unit_code="USD",
                    source_url="https://kalshi.com",
                    description="After",
                    query_params={"desk": "macro"},
                    transform_rule="field:price.mean",
                    is_active=False,
                    requested_by="anthony",
                ),
                db=session,
            )

            stored = session.get(ExternalSeriesDefinition, "KALSHI_FED_2026_RATE_CUT")

        self.assertEqual(payload.description, "After")
        self.assertFalse(payload.is_active)
        self.assertIsNotNone(stored)
        self.assertEqual(stored.version, 2)
        self.assertEqual(stored.updated_by, "anthony")


if __name__ == "__main__":
    unittest.main()
