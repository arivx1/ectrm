from __future__ import annotations

import enum
import unittest
from datetime import date, datetime, timezone

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
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class TruckTrackingApiTests(unittest.TestCase):
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

    def _bootstrap_admin(self) -> str:
        response = self.client.post(
            "/auth/bootstrap-admin",
            json={
                "bootstrap_token": "bootstrap-secret",
                "user_id": "truck_admin",
                "email": "truck@example.com",
                "display_name": "Truck Admin",
                "password": "supersecret1",
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["access_token"]

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
                    created_by="truck_admin",
                    updated_at=self.now,
                    updated_by="truck_admin",
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
                    trade_id="T-TRUCK-1",
                    external_trade_id="EXT-TRUCK-1",
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
                    location_code="CUSHING",
                    delivery_start=date(2026, 5, 18),
                    delivery_end=date(2026, 5, 19),
                    price_unit_code="BBL",
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE_PHYS",
                    portfolio="PROMPT",
                    counterparty="SHELL_TRADING",
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    confirmation_status="CONFIRMED",
                    nomination_status="NOT_REQUIRED",
                    allocation_status="NOT_REQUIRED",
                    actualization_status="PENDING",
                    price_index_code=None,
                    price=81.25,
                    volume=1000,
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    trader_user="ops.truck",
                    status="ACTIVE",
                    last_event_id="evt-truck-1",
                )
            )
            session.commit()

    def _sync_deliveries(self, token: str) -> None:
        response = self.client.post(
            "/deliveries/sync-from-trades",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)

    def _promote_delivery_to_truck(self, token: str) -> None:
        response = self.client.patch(
            "/deliveries/DLV-T-TRUCK-1",
            json={"transport_mode": "TRUCK"},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)

    def test_patch_truck_details_and_create_multi_stop_movement_updates_delivery_summary(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade()
        self._sync_deliveries(admin_token)
        self._promote_delivery_to_truck(admin_token)

        truck_detail_response = self.client.patch(
            "/deliveries/DLV-T-TRUCK-1/truck-details",
            json={
                "target_run_count": 2,
                "dispatcher_owner": "dispatch.alpha",
                "default_carrier_name": "Acme Logistics",
                "default_external_carrier_reference": "ACME",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(truck_detail_response.status_code, 200)
        truck_detail_body = truck_detail_response.json()
        self.assertIsNotNone(truck_detail_body["truck_detail"])
        self.assertEqual(truck_detail_body["truck_detail"]["target_run_count"], 2)
        self.assertEqual(truck_detail_body["truck_detail"]["dispatcher_owner"], "dispatch.alpha")
        self.assertEqual(truck_detail_body["truck_detail"]["default_carrier_name"], "Acme Logistics")

        create_response = self.client.post(
            "/deliveries/DLV-T-TRUCK-1/truck-movements",
            json={
                "sequence_no": 1,
                "stops": [
                    {
                        "stop_type": "PICKUP",
                        "location_code": "MIDLAND",
                        "planned_arrival_start": "2026-05-18T08:00:00Z",
                    },
                    {
                        "stop_type": "WAYPOINT",
                        "location_code": "ABILENE",
                    },
                    {
                        "stop_type": "DROPOFF",
                        "location_code": "CUSHING",
                        "planned_arrival_end": "2026-05-19T16:00:00Z",
                    },
                ],
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        movement_body = create_response.json()
        self.assertEqual(movement_body["sequence_no"], 1)
        self.assertEqual(movement_body["status"], "PLANNED")
        self.assertEqual(movement_body["stop_count"], 3)
        self.assertEqual(movement_body["active_stop_count"], 3)
        self.assertEqual(movement_body["current_stop_sequence"], 1)
        self.assertEqual(movement_body["carrier_name"], "Acme Logistics")
        self.assertEqual(movement_body["external_carrier_reference"], "ACME")
        self.assertEqual(len(movement_body["stops"]), 3)
        self.assertEqual(movement_body["stops"][0]["stop_type"], "PICKUP")
        self.assertEqual(movement_body["stops"][2]["stop_type"], "DROPOFF")

        list_response = self.client.get(
            "/deliveries/DLV-T-TRUCK-1/truck-movements",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        list_body = list_response.json()
        self.assertEqual(len(list_body), 1)
        self.assertEqual(list_body[0]["movement_id"], movement_body["movement_id"])
        self.assertEqual(list_body[0]["stop_count"], 3)

        get_response = self.client.get(
            f"/truck-movements/{movement_body['movement_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["movement_id"], movement_body["movement_id"])

        deliveries_response = self.client.get(
            "/deliveries",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(deliveries_response.status_code, 200)
        delivery_body = deliveries_response.json()[0]
        self.assertEqual(delivery_body["delivery_id"], "DLV-T-TRUCK-1")
        self.assertEqual(delivery_body["truck_movement_count"], 1)
        self.assertEqual(delivery_body["active_truck_movement_count"], 1)
        self.assertEqual(delivery_body["truck_detail"]["dispatcher_owner"], "dispatch.alpha")

        with self.SessionLocal() as session:
            movement = session.query(DeliveryTruckMovement).one()
            self.assertEqual(movement.delivery_id, "DLV-T-TRUCK-1")
            self.assertEqual(movement.sequence_no, 1)
            self.assertEqual(session.query(DeliveryTruckStop).count(), 3)

    def test_rejects_invalid_initial_stop_shape_and_blocks_resequence_after_execution_starts(self) -> None:
        self._create_user(
            user_id="ops.truck",
            email="ops.truck@example.com",
            display_name="Ops Truck",
            role="OPERATIONS",
        )
        ops_token = self._login(identifier="ops.truck")
        self._seed_trade()
        self._sync_deliveries(ops_token)
        self._promote_delivery_to_truck(ops_token)

        invalid_create_response = self.client.post(
            "/deliveries/DLV-T-TRUCK-1/truck-movements",
            json={
                "sequence_no": 1,
                "stops": [
                    {
                        "stop_sequence": 1,
                        "stop_type": "PICKUP",
                        "location_code": "MIDLAND",
                    },
                    {
                        "stop_sequence": 3,
                        "stop_type": "DROPOFF",
                        "location_code": "CUSHING",
                    },
                ],
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(invalid_create_response.status_code, 422)
        self.assertIn("dense one-based", invalid_create_response.json()["detail"])

        create_response = self.client.post(
            "/deliveries/DLV-T-TRUCK-1/truck-movements",
            json={
                "sequence_no": 1,
                "stops": [
                    {
                        "stop_type": "PICKUP",
                        "location_code": "MIDLAND",
                    },
                    {
                        "stop_type": "DROPOFF",
                        "location_code": "CUSHING",
                    },
                ],
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        movement_body = create_response.json()
        first_stop_id = movement_body["stops"][0]["stop_id"]
        second_stop_id = movement_body["stops"][1]["stop_id"]

        first_stop_departed = self.client.patch(
            f"/truck-stops/{first_stop_id}",
            json={
                "status": "DEPARTED",
                "actual_arrived_at": "2026-05-18T08:15:00Z",
                "actual_departed_at": "2026-05-18T09:00:00Z",
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(first_stop_departed.status_code, 200)
        self.assertEqual(first_stop_departed.json()["status"], "IN_TRANSIT")

        resequence_response = self.client.patch(
            f"/truck-stops/{second_stop_id}",
            json={"stop_sequence": 1},
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(resequence_response.status_code, 422)
        self.assertIn("cannot be changed after execution starts", resequence_response.json()["detail"])

        add_stop_response = self.client.post(
            f"/truck-movements/{movement_body['movement_id']}/stops",
            json={
                "stop_type": "WAYPOINT",
                "location_code": "ABILENE",
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(add_stop_response.status_code, 422)
        self.assertIn("cannot be added after execution starts", add_stop_response.json()["detail"])

    def test_records_and_reverses_manual_truck_stop_checkpoints(self) -> None:
        self._create_user(
            user_id="ops.checkpoint",
            email="ops.checkpoint@example.com",
            display_name="Ops Checkpoint",
            role="OPERATIONS",
        )
        ops_token = self._login(identifier="ops.checkpoint")
        self._seed_trade()
        self._sync_deliveries(ops_token)
        self._promote_delivery_to_truck(ops_token)

        create_response = self.client.post(
            "/deliveries/DLV-T-TRUCK-1/truck-movements",
            json={
                "sequence_no": 1,
                "stops": [
                    {
                        "stop_type": "PICKUP",
                        "location_code": "MIDLAND",
                    },
                    {
                        "stop_type": "DROPOFF",
                        "location_code": "CUSHING",
                    },
                ],
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        movement_body = create_response.json()
        pickup_stop_id = movement_body["stops"][0]["stop_id"]
        destination_stop_id = movement_body["stops"][1]["stop_id"]

        arrived_pickup = self.client.post(
            f"/truck-stops/{pickup_stop_id}/checkpoints",
            json={
                "checkpoint_code": "ARRIVED_PICKUP",
                "occurred_at": "2026-05-18T08:15:00Z",
                "notes": "Driver checked in at the lease.",
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(arrived_pickup.status_code, 201)
        arrived_pickup_body = arrived_pickup.json()
        self.assertEqual(arrived_pickup_body["status"], "AT_STOP")
        self.assertEqual(arrived_pickup_body["current_stop_sequence"], 1)
        self.assertEqual(arrived_pickup_body["stops"][0]["status"], "ARRIVED")
        self.assertEqual(arrived_pickup_body["stops"][0]["actual_arrived_at"], "2026-05-18T08:15:00Z")

        duplicate_arrival = self.client.post(
            f"/truck-stops/{pickup_stop_id}/checkpoints",
            json={
                "checkpoint_code": "ARRIVED_PICKUP",
                "occurred_at": "2026-05-18T08:20:00Z",
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(duplicate_arrival.status_code, 422)
        self.assertIn("already active", duplicate_arrival.json()["detail"])

        departed_pickup = self.client.post(
            f"/truck-stops/{pickup_stop_id}/checkpoints",
            json={
                "checkpoint_code": "DEPARTED_PICKUP",
                "occurred_at": "2026-05-18T09:00:00Z",
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(departed_pickup.status_code, 201)
        departed_pickup_body = departed_pickup.json()
        self.assertEqual(departed_pickup_body["status"], "IN_TRANSIT")
        self.assertEqual(departed_pickup_body["current_stop_sequence"], 2)
        self.assertEqual(departed_pickup_body["stops"][0]["status"], "DEPARTED")
        self.assertEqual(departed_pickup_body["stops"][0]["actual_departed_at"], "2026-05-18T09:00:00Z")

        arrived_destination = self.client.post(
            f"/truck-stops/{destination_stop_id}/checkpoints",
            json={
                "checkpoint_code": "ARRIVED_DESTINATION",
                "occurred_at": "2026-05-19T15:45:00Z",
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(arrived_destination.status_code, 201)
        arrived_destination_body = arrived_destination.json()
        self.assertEqual(arrived_destination_body["status"], "AT_STOP")
        self.assertEqual(arrived_destination_body["current_stop_sequence"], 2)
        self.assertEqual(arrived_destination_body["stops"][1]["status"], "ARRIVED")

        with self.SessionLocal() as session:
            checkpoint_events = (
                session.query(DeliveryEvent)
                .filter(
                    DeliveryEvent.delivery_id == "DLV-T-TRUCK-1",
                    DeliveryEvent.event_type == "CHECKPOINT_RECORDED",
                )
                .order_by(DeliveryEvent.occurred_at.asc(), DeliveryEvent.id.asc())
                .all()
            )
            self.assertEqual(len(checkpoint_events), 3)
            self.assertEqual(checkpoint_events[0].source, "TRUCK_MANUAL_DISPATCH")
            self.assertIn("ARRIVED_PICKUP", checkpoint_events[0].reference_code)
            destination_event_id = checkpoint_events[2].id

        reverse_destination = self.client.post(
            f"/truck-stops/{destination_stop_id}/checkpoints/{destination_event_id}/reverse",
            json={
                "reversal_reason": "Destination arrival was recorded against the wrong driver update.",
            },
            headers={"Authorization": f"Bearer {ops_token}"},
        )
        self.assertEqual(reverse_destination.status_code, 201)
        reverse_body = reverse_destination.json()
        self.assertEqual(reverse_body["status"], "IN_TRANSIT")
        self.assertEqual(reverse_body["current_stop_sequence"], 2)
        self.assertEqual(reverse_body["stops"][0]["status"], "DEPARTED")
        self.assertEqual(reverse_body["stops"][1]["status"], "PLANNED")
        self.assertIsNone(reverse_body["stops"][1]["actual_arrived_at"])

        with self.SessionLocal() as session:
            reversal_event = (
                session.query(DeliveryEvent)
                .filter(
                    DeliveryEvent.delivery_id == "DLV-T-TRUCK-1",
                    DeliveryEvent.event_type == "EVENT_REVERSED",
                )
                .one()
            )
            self.assertEqual(reversal_event.reversal_of_event_id, destination_event_id)
            self.assertEqual(reversal_event.source, "TRUCK_MANUAL_DISPATCH")
