from __future__ import annotations

import enum
import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.core.auth import hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.services.aisstream_client import AisstreamVesselSignal
from apps.api.app.domains.operations.services.aisstream_client import aisstream_message_to_signal
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_logistics_detail import DeliveryLogisticsDetail
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.delivery_power_detail import DeliveryPowerDetail
from apps.api.app.models.delivery_rail_detail import DeliveryRailDetail
from apps.api.app.models.delivery_tracking_signal import DeliveryTrackingSignal
from apps.api.app.models.delivery_truck_detail import DeliveryTruckDetail
from apps.api.app.models.delivery_truck_movement import DeliveryTruckMovement
from apps.api.app.models.delivery_truck_stop import DeliveryTruckStop
from apps.api.app.models.delivery_vessel_detail import DeliveryVesselDetail
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class VesselTrackingApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

        cls.original_session_factory = app.state.session_factory
        app.state.session_factory = cls.SessionLocal

        def _get_test_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _get_test_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        app.state.session_factory = cls.original_session_factory
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        self.now = datetime(2026, 5, 16, 15, 0, tzinfo=timezone.utc)
        self._previous_bootstrap_admin_token = settings.BOOTSTRAP_ADMIN_TOKEN
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"

        with self.SessionLocal() as session:
            session.query(DeliveryTrackingSignal).delete()
            session.query(DeliveryTruckStop).delete()
            session.query(DeliveryTruckMovement).delete()
            session.query(DeliveryTruckDetail).delete()
            session.query(DeliveryVesselDetail).delete()
            session.query(DeliveryEvent).delete()
            session.query(DeliveryLogisticsDetail).delete()
            session.query(DeliveryPipelineDetail).delete()
            session.query(DeliveryPowerDetail).delete()
            session.query(DeliveryRailDetail).delete()
            session.query(DeliveryObligation).delete()
            session.query(TradeActualization).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(TradeLeg).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()

    def tearDown(self) -> None:
        settings.BOOTSTRAP_ADMIN_TOKEN = self._previous_bootstrap_admin_token

    def _create_user(
        self,
        *,
        user_id: str,
        email: str,
        display_name: str,
        role: str,
        password: str = "supersecret2",
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id=user_id,
                    email=email,
                    display_name=display_name,
                    role=role,
                    password_hash=hash_password(password),
                    is_active=True,
                    last_login_at=self.now,
                    created_at=self.now,
                    created_by="vessel_admin",
                    updated_at=self.now,
                    updated_by="vessel_admin",
                    version=1,
                )
            )
            session.commit()

    def _login(self, *, identifier: str, password: str = "supersecret2") -> str:
        response = self.client.post("/auth/session", json={"identifier": identifier, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def _seed_trade(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="T-VESSEL-1",
                    external_trade_id="EXT-VESSEL-1",
                    source_system="ETRM",
                    created_at=self.now,
                    updated_at=self.now,
                    execution_timestamp=self.now,
                    trade_date=date(2026, 5, 16),
                    effective_start_date=date(2026, 5, 18),
                    effective_end_date=date(2026, 5, 19),
                    quality_spec=None,
                    unit_of_measure="BBL",
                    trade_currency_code="USD",
                    location_code="USGC",
                    delivery_start=date(2026, 5, 18),
                    delivery_end=date(2026, 5, 19),
                    price_unit_code="BBL",
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="SELL",
                    book="CRUDE_PHYS",
                    portfolio="EXPORTS",
                    counterparty="MARINE_BUYER",
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    confirmation_status="CONFIRMED",
                    nomination_status="NOT_REQUIRED",
                    allocation_status="NOT_REQUIRED",
                    actualization_status="PENDING",
                    price_index_code=None,
                    price=82.15,
                    volume=750000,
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    trader_user="ops.vessel",
                    status="ACTIVE",
                    last_event_id="evt-vessel-1",
                )
            )
            session.commit()

    def _sync_deliveries(self, token: str) -> None:
        response = self.client.post(
            "/deliveries/sync-from-trades",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)

    def _promote_delivery_to_vessel(self, token: str) -> None:
        response = self.client.patch(
            "/deliveries/DLV-T-VESSEL-1",
            json={"transport_mode": "VESSEL"},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)

    def test_maps_aisstream_position_message_to_vessel_signal(self) -> None:
        signal = aisstream_message_to_signal(
            {
                "MessageType": "PositionReport",
                "Metadata": {
                    "MMSI_String": "366999111",
                    "Latitude": 29.7604,
                    "Longitude": -95.3698,
                    "time_utc": "2026-05-18T09:00:00Z",
                },
                "Message": {
                    "PositionReport": {
                        "UserID": 366999111,
                        "Sog": 12.4,
                        "Cog": 83.2,
                        "TrueHeading": 84,
                        "NavigationalStatus": 0,
                    },
                },
            },
            mmsi="366999111",
            received_at=datetime(2026, 5, 18, 9, 1, tzinfo=timezone.utc),
            listened_seconds=2,
        )

        self.assertIsNotNone(signal)
        assert signal is not None
        self.assertEqual(signal.source_system, "AISSTREAM")
        self.assertEqual(signal.signal_type, "POSITION")
        self.assertEqual(signal.latitude, 29.7604)
        self.assertEqual(signal.longitude, -95.3698)
        self.assertEqual(signal.speed_knots, 12.4)
        self.assertEqual(signal.course_degrees, 83.2)
        self.assertEqual(signal.heading_degrees, 84)
        self.assertEqual(signal.normalized_status, "UNDER_WAY")
        self.assertEqual(signal.listened_seconds, 2)

    def test_updates_vessel_identity_and_records_idempotent_tracking_signal(self) -> None:
        self._create_user(
            user_id="ops.vessel",
            email="ops.vessel@example.com",
            display_name="Ops Vessel",
            role="OPERATIONS",
        )
        ops_token = self._login(identifier="ops.vessel")
        self._seed_trade()
        self._sync_deliveries(ops_token)
        self._promote_delivery_to_vessel(ops_token)

        vessel_detail_response = self.client.patch(
            "/deliveries/DLV-T-VESSEL-1/vessel-detail",
            json={
                "vessel_name": "MT Horizon",
                "imo_number": "9401234",
                "mmsi_number": "366999111",
                "call_sign": "WXYZ",
                "voyage_number": "VOY-12",
                "tracking_provider": "ais_demo",
                "tracking_policy": "Refresh twice daily",
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(vessel_detail_response.status_code, 200)
        vessel_detail_body = vessel_detail_response.json()
        self.assertEqual(vessel_detail_body["vessel_name"], "MT Horizon")
        self.assertEqual(vessel_detail_body["imo_number"], "9401234")
        self.assertEqual(vessel_detail_body["mmsi_number"], "366999111")
        self.assertEqual(vessel_detail_body["tracking_provider"], "ais_demo")
        self.assertEqual(vessel_detail_body["tracking_health"]["tracking_freshness_status"], "MISSING")

        signal_response = self.client.post(
            "/deliveries/DLV-T-VESSEL-1/vessel-tracking-signals",
            json={
                "source_system": "ais_demo",
                "source_event_id": "AIS-1",
                "signal_type": "position",
                "occurred_at": "2026-05-18T09:00:00Z",
                "received_at": "2026-05-18T09:05:00Z",
                "latitude": 29.7604,
                "longitude": -95.3698,
                "speed_knots": 12.4,
                "course_degrees": 83.2,
                "heading_degrees": 84,
                "draught_meters": 12.5,
                "destination": "ROTTERDAM",
                "eta_at_destination": "2026-05-19T18:00:00Z",
                "external_status": "Under way using engine",
                "normalized_status": "under_way",
                "match_confidence": 0.92,
                "raw_payload": {"provider": "demo"},
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(signal_response.status_code, 201)
        signal_body = signal_response.json()
        self.assertFalse(signal_body["duplicate"])
        self.assertEqual(signal_body["ingest_status"], "CREATED")
        self.assertEqual(signal_body["signal"]["source_system"], "AIS_DEMO")
        self.assertEqual(signal_body["signal"]["signal_type"], "POSITION")
        self.assertEqual(signal_body["signal"]["processing_status"], "MATCHED")
        self.assertEqual(signal_body["signal"]["normalized_status"], "UNDER_WAY")
        self.assertEqual(signal_body["signal"]["match_confidence"], 0.92)
        self.assertEqual(signal_body["vessel_detail"]["last_position_at"], "2026-05-18T09:00:00Z")
        self.assertEqual(signal_body["vessel_detail"]["last_speed_knots"], 12.4)
        self.assertEqual(signal_body["vessel_detail"]["current_destination"], "ROTTERDAM")
        self.assertEqual(
            signal_body["vessel_detail"]["current_eta_at_destination"],
            "2026-05-19T18:00:00Z",
        )
        self.assertIn(signal_body["tracking_health"]["tracking_freshness_status"], {"FRESH", "STALE"})
        self.assertIn(signal_body["tracking_health"]["eta_status"], {"ON_TIME", "LATE"})

        health_response = self.client.get(
            "/deliveries/DLV-T-VESSEL-1/vessel-tracking-health",
            params={"as_of": "2026-05-18T10:00:00Z"},
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(health_response.status_code, 200)
        health_body = health_response.json()
        self.assertEqual(health_body["tracking_freshness_status"], "FRESH")
        self.assertEqual(health_body["minutes_since_last_signal"], 60)
        self.assertEqual(health_body["eta_status"], "ON_TIME")

        duplicate_response = self.client.post(
            "/deliveries/DLV-T-VESSEL-1/vessel-tracking-signals",
            json={
                "source_system": "ais_demo",
                "source_event_id": "AIS-1",
                "signal_type": "position",
                "occurred_at": "2026-05-18T09:00:00Z",
                "latitude": 29.7604,
                "longitude": -95.3698,
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(duplicate_response.status_code, 200)
        duplicate_body = duplicate_response.json()
        self.assertTrue(duplicate_body["duplicate"])
        self.assertEqual(duplicate_body["ingest_status"], "DUPLICATE")
        self.assertEqual(
            duplicate_body["signal"]["signal_id"],
            signal_body["signal"]["signal_id"],
        )

        list_signals_response = self.client.get(
            "/deliveries/DLV-T-VESSEL-1/vessel-tracking-signals",
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(list_signals_response.status_code, 200)
        self.assertEqual(len(list_signals_response.json()), 1)

        deliveries_response = self.client.get(
            "/deliveries",
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(deliveries_response.status_code, 200)
        delivery_body = deliveries_response.json()[0]
        self.assertEqual(delivery_body["delivery_id"], "DLV-T-VESSEL-1")
        self.assertEqual(delivery_body["vessel_detail"]["vessel_name"], "MT Horizon")
        self.assertIsNotNone(delivery_body["vessel_tracking_health"]["tracking_freshness_status"])

        with self.SessionLocal() as session:
            self.assertEqual(session.query(DeliveryTrackingSignal).count(), 1)
            detail = session.get(DeliveryVesselDetail, "DLV-T-VESSEL-1")
            self.assertIsNotNone(detail)
            assert detail is not None
            self.assertEqual(detail.current_destination, "ROTTERDAM")
            self.assertEqual(detail.last_navigational_status, "UNDER_WAY")

    def test_refreshes_vessel_tracking_from_aisstream_provider(self) -> None:
        self._create_user(
            user_id="ops.aisstream",
            email="ops.aisstream@example.com",
            display_name="Ops AISStream",
            role="OPERATIONS",
        )
        ops_token = self._login(identifier="ops.aisstream")
        self._seed_trade()
        self._sync_deliveries(ops_token)
        self._promote_delivery_to_vessel(ops_token)

        vessel_detail_response = self.client.patch(
            "/deliveries/DLV-T-VESSEL-1/vessel-detail",
            json={
                "vessel_name": "MT Horizon",
                "mmsi_number": "366999111",
                "tracking_provider": "AISSTREAM",
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(vessel_detail_response.status_code, 200)

        provider_signal = AisstreamVesselSignal(
            source_system="AISSTREAM",
            source_event_id="PositionReport:366999111:2026-05-18T09:00:00+00:00:29.76040:-95.36980",
            signal_type="POSITION",
            occurred_at=datetime(2026, 5, 18, 9, 0, tzinfo=timezone.utc),
            received_at=datetime(2026, 5, 18, 9, 1, tzinfo=timezone.utc),
            latitude=29.7604,
            longitude=-95.3698,
            speed_knots=12.4,
            course_degrees=83.2,
            heading_degrees=84,
            destination=None,
            eta_at_destination=None,
            external_status="0",
            normalized_status="UNDER_WAY",
            match_confidence=1.0,
            raw_payload={"provider": "AISSTREAM", "message_type": "PositionReport"},
            listened_seconds=2,
        )

        with patch(
            "apps.api.app.domains.operations.services.vessel_tracking.fetch_aisstream_vessel_signal",
            return_value=provider_signal,
        ) as fetch_signal:
            refresh_response = self.client.post(
                "/deliveries/DLV-T-VESSEL-1/vessel-tracking-signals/aisstream-refresh",
                params={"timeout_seconds": 6},
                headers={"Authorization": f"Bearer {ops_token}"},
            )

        self.assertEqual(refresh_response.status_code, 201)
        fetch_signal.assert_called_once_with(mmsi="366999111", timeout_seconds=6)
        refresh_body = refresh_response.json()
        self.assertEqual(refresh_body["provider"], "AISSTREAM")
        self.assertEqual(refresh_body["matched_mmsi"], "366999111")
        self.assertEqual(refresh_body["listened_seconds"], 2)
        self.assertEqual(refresh_body["signal"]["source_system"], "AISSTREAM")
        self.assertEqual(refresh_body["signal"]["processing_status"], "MATCHED")
        self.assertEqual(refresh_body["vessel_detail"]["last_position_at"], "2026-05-18T09:00:00Z")
        self.assertEqual(refresh_body["vessel_detail"]["last_navigational_status"], "UNDER_WAY")

        with patch(
            "apps.api.app.domains.operations.services.vessel_tracking.fetch_aisstream_vessel_signal",
            return_value=provider_signal,
        ):
            duplicate_response = self.client.post(
                "/deliveries/DLV-T-VESSEL-1/vessel-tracking-signals/aisstream-refresh",
                headers={"Authorization": f"Bearer {ops_token}"},
            )
        self.assertEqual(duplicate_response.status_code, 200)
        self.assertTrue(duplicate_response.json()["duplicate"])

    def test_validates_vessel_tracking_inputs_and_transport_mode(self) -> None:
        self._create_user(
            user_id="ops.validation",
            email="ops.validation@example.com",
            display_name="Ops Validation",
            role="OPERATIONS",
        )
        ops_token = self._login(identifier="ops.validation")
        self._seed_trade()
        self._sync_deliveries(ops_token)

        non_vessel_detail_response = self.client.patch(
            "/deliveries/DLV-T-VESSEL-1/vessel-detail",
            json={"vessel_name": "MT Horizon"},
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(non_vessel_detail_response.status_code, 422)
        self.assertIn("vessel", non_vessel_detail_response.json()["detail"].lower())

        self._promote_delivery_to_vessel(ops_token)

        missing_mmsi_refresh_response = self.client.post(
            "/deliveries/DLV-T-VESSEL-1/vessel-tracking-signals/aisstream-refresh",
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(missing_mmsi_refresh_response.status_code, 422)
        self.assertIn("MMSI", missing_mmsi_refresh_response.json()["detail"])

        invalid_identity_response = self.client.patch(
            "/deliveries/DLV-T-VESSEL-1/vessel-detail",
            json={"mmsi_number": "366"},
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(invalid_identity_response.status_code, 422)
        self.assertIn("9-digit", invalid_identity_response.json()["detail"])

        invalid_position_response = self.client.post(
            "/deliveries/DLV-T-VESSEL-1/vessel-tracking-signals",
            json={
                "signal_type": "POSITION",
                "occurred_at": "2026-05-18T09:00:00Z",
                "latitude": 91,
                "longitude": -95.3698,
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(invalid_position_response.status_code, 422)
        self.assertIn("latitude", invalid_position_response.json()["detail"])

        missing_longitude_response = self.client.post(
            "/deliveries/DLV-T-VESSEL-1/vessel-tracking-signals",
            json={
                "signal_type": "POSITION",
                "occurred_at": "2026-05-18T09:00:00Z",
                "latitude": 29.7604,
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(missing_longitude_response.status_code, 422)
        self.assertIn("latitude and longitude", missing_longitude_response.json()["detail"])
