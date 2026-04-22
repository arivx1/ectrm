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
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class DeliveriesApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 8, 18, 0, tzinfo=timezone.utc)
        self._previous_bootstrap_admin_token = settings.BOOTSTRAP_ADMIN_TOKEN
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"

        with self.SessionLocal() as session:
            session.query(DeliveryEvent).delete()
            session.query(DeliveryLogisticsDetail).delete()
            session.query(DeliveryPipelineDetail).delete()
            session.query(DeliveryPowerDetail).delete()
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
                "user_id": "delivery_admin",
                "email": "deliveries@example.com",
                "display_name": "Delivery Admin",
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
                    created_by="delivery_admin",
                    updated_at=self.now,
                    updated_by="delivery_admin",
                    version=1,
                )
            )
            session.commit()

    def _login(self, *, identifier: str, password: str = "supersecret2") -> str:
        response = self.client.post("/auth/session", json={"identifier": identifier, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def _seed_trades(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Trade(
                        trade_id="T-LOG-1",
                        external_trade_id="EXT-LOG-1",
                        source_system="ETRM",
                        created_at=self.now,
                        updated_at=self.now,
                        execution_timestamp=self.now,
                        trade_date=date(2026, 4, 8),
                        effective_start_date=date(2026, 4, 10),
                        effective_end_date=date(2026, 4, 11),
                        quality_spec=None,
                        unit_of_measure="BBL",
                        trade_currency_code="USD",
                        location_code="CUSHING",
                        delivery_start=date(2026, 4, 10),
                        delivery_end=date(2026, 4, 11),
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
                        price=80.5,
                        volume=1000,
                        invoice_status="PENDING",
                        payment_status="PENDING",
                        settlement_status="PENDING",
                        trader_user="ops.alpha",
                        status="ACTIVE",
                        last_event_id="evt-log-1",
                    ),
                    Trade(
                        trade_id="T-GAS-1",
                        external_trade_id="EXT-GAS-1",
                        source_system="ETRM",
                        created_at=self.now,
                        updated_at=self.now,
                        execution_timestamp=self.now,
                        trade_date=date(2026, 4, 8),
                        effective_start_date=date(2026, 4, 9),
                        effective_end_date=date(2026, 4, 9),
                        quality_spec=None,
                        unit_of_measure="MMBTU",
                        trade_currency_code="USD",
                        location_code="HENRY_HUB",
                        delivery_start=date(2026, 4, 9),
                        delivery_end=date(2026, 4, 9),
                        price_unit_code="MMBTU",
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="SELL",
                        book="GAS_PHYS",
                        portfolio="BASIN",
                        counterparty="BP",
                        commodity_class="NATURAL_GAS",
                        commodity="HH",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        confirmation_status="CONFIRMED",
                        nomination_status="NOMINATED",
                        allocation_status="ALLOCATED",
                        actualization_status="PENDING",
                        price_index_code=None,
                        price=2.75,
                        volume=10000,
                        invoice_status="PENDING",
                        payment_status="PENDING",
                        settlement_status="PENDING",
                        trader_user="ops.beta",
                        status="ACTIVE",
                        last_event_id="evt-gas-1",
                    ),
                    Trade(
                        trade_id="T-POWER-1",
                        external_trade_id="EXT-POWER-1",
                        source_system="ETRM",
                        created_at=self.now,
                        updated_at=self.now,
                        execution_timestamp=self.now,
                        trade_date=date(2026, 4, 8),
                        effective_start_date=date(2026, 4, 9),
                        effective_end_date=date(2026, 4, 9),
                        quality_spec=None,
                        unit_of_measure="MWH",
                        trade_currency_code="USD",
                        location_code="PJM_WEST",
                        delivery_start=date(2026, 4, 9),
                        delivery_end=date(2026, 4, 9),
                        price_unit_code="MWH",
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="POWER_PHYS",
                        portfolio="DAY_AHEAD",
                        counterparty="CONSTELLATION",
                        commodity_class="POWER",
                        commodity="PJM_WEST_DA",
                        pricing_type="INDEX",
                        pricing_status="PENDING",
                        confirmation_status="CONFIRMED",
                        nomination_status="SCHEDULED",
                        allocation_status="NOT_REQUIRED",
                        actualization_status="PENDING",
                        price_index_code="PJM_WEST_DA",
                        price=None,
                        volume=500,
                        invoice_status="PENDING",
                        payment_status="PENDING",
                        settlement_status="PENDING",
                        trader_user="ops.gamma",
                        status="ACTIVE",
                        last_event_id="evt-power-1",
                    ),
                ]
            )
            session.commit()

    def _sync_deliveries(self, token: str) -> None:
        response = self.client.post(
            "/deliveries/sync-from-trades",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200)

    def test_patch_delivery_sets_explicit_transport_mode(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)

        response = self.client.patch(
            "/deliveries/DLV-T-LOG-1",
            json={"transport_mode": "TRUCK"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["transport_mode"], "TRUCK")
        self.assertEqual(body["transport_mode_source"], "EXPLICIT")
        self.assertEqual(body["mode_family"], "LOGISTICS")
        self.assertNotIn("Explicit transport mode is missing for discrete logistics delivery.", body["blockers"])

        with self.SessionLocal() as session:
            delivery = session.get(DeliveryObligation, "DLV-T-LOG-1")
            self.assertIsNotNone(delivery)
            self.assertEqual(delivery.transport_mode, "TRUCK")
            self.assertEqual(delivery.transport_mode_source, "EXPLICIT")
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-LOG-1",
                    Event.event_type == "TradeDeliveryUpdated",
                )
                .one()
            )
            self.assertEqual(audit_event.payload["requested_changes"]["transport_mode"], "TRUCK")
            self.assertEqual(audit_event.payload["delivery"]["transport_mode"], "TRUCK")

    def test_operations_role_can_manage_deliveries(self) -> None:
        self._create_user(
            user_id="ops.delivery",
            email="ops.delivery@example.com",
            display_name="Ops Delivery",
            role="OPERATIONS",
        )
        operations_token = self._login(identifier="ops.delivery")
        self._seed_trades()

        sync_response = self.client.post(
            "/deliveries/sync-from-trades",
            headers={"Authorization": f"Bearer {operations_token}"},
        )
        self.assertEqual(sync_response.status_code, 200)

        patch_response = self.client.patch(
            "/deliveries/DLV-T-LOG-1",
            json={"transport_mode": "TRUCK"},
            headers={"Authorization": f"Bearer {operations_token}"},
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.json()["transport_mode"], "TRUCK")

    def test_trader_role_cannot_manage_deliveries(self) -> None:
        admin_token = self._bootstrap_admin()
        self._create_user(
            user_id="trader.delivery",
            email="trader.delivery@example.com",
            display_name="Trader Delivery",
            role="TRADER",
        )
        trader_token = self._login(identifier="trader.delivery")
        self._seed_trades()
        self._sync_deliveries(admin_token)

        response = self.client.patch(
            "/deliveries/DLV-T-LOG-1",
            json={"transport_mode": "TRUCK"},
            headers={"Authorization": f"Bearer {trader_token}"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"],
            "Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage deliveries.",
        )

    def test_patch_delivery_can_reset_transport_mode_to_seeded_classification(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)

        self.client.patch(
            "/deliveries/DLV-T-GAS-1",
            json={"transport_mode": "TRUCK"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        response = self.client.patch(
            "/deliveries/DLV-T-GAS-1",
            json={"reset_fields": ["transport_mode"]},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["transport_mode"], "PIPELINE")
        self.assertEqual(body["transport_mode_source"], "DERIVED")
        self.assertEqual(body["mode_family"], "NETWORK_FLOW")
        self.assertEqual(body["delivery_profile"], "FLOW_WINDOW")

        with self.SessionLocal() as session:
            delivery = session.get(DeliveryObligation, "DLV-T-GAS-1")
            self.assertIsNotNone(delivery)
            self.assertEqual(delivery.transport_mode, "PIPELINE")
            self.assertEqual(delivery.transport_mode_source, "DERIVED")
            self.assertEqual(delivery.mode_family, "NETWORK_FLOW")
            self.assertEqual(delivery.delivery_profile, "FLOW_WINDOW")

    def test_patch_delivery_updates_shared_fields_and_resets_sources(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)

        response = self.client.patch(
            "/deliveries/DLV-T-LOG-1",
            json={
                "book": "OPS_BOOK",
                "counterparty": "PHILLIPS_66",
                "location_code": "MIDLAND",
                "delivery_start": "2026-04-12",
                "delivery_end": "2026-04-13",
                "execution_status": "IN_PROGRESS",
                "operations_owner": "dispatch.alpha",
                "external_reference": "OPS-REF-17",
                "ops_notes": "Pickup confirmed with carrier.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["book"], "OPS_BOOK")
        self.assertEqual(body["book_source"], "MANUAL")
        self.assertEqual(body["counterparty"], "PHILLIPS_66")
        self.assertEqual(body["counterparty_source"], "MANUAL")
        self.assertEqual(body["location_code"], "MIDLAND")
        self.assertEqual(body["location_source"], "MANUAL")
        self.assertEqual(body["delivery_start"], "2026-04-12")
        self.assertEqual(body["delivery_end"], "2026-04-13")
        self.assertEqual(body["delivery_window_source"], "MANUAL")
        self.assertEqual(body["execution_status"], "IN_PROGRESS")
        self.assertEqual(body["execution_status_source"], "MANUAL")
        self.assertEqual(body["operations_owner"], "dispatch.alpha")
        self.assertEqual(body["operations_owner_source"], "MANUAL")
        self.assertEqual(body["external_reference"], "OPS-REF-17")
        self.assertEqual(body["external_reference_source"], "MANUAL")
        self.assertEqual(body["ops_notes"], "Pickup confirmed with carrier.")
        self.assertEqual(body["ops_notes_source"], "MANUAL")

        reset_response = self.client.patch(
            "/deliveries/DLV-T-LOG-1",
            json={
                "reset_fields": [
                    "book",
                    "counterparty",
                    "location_code",
                    "delivery_window",
                    "execution_status",
                    "operations_owner",
                    "external_reference",
                    "ops_notes",
                ]
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(reset_response.status_code, 200)
        reset_body = reset_response.json()
        self.assertEqual(reset_body["book"], "CRUDE_PHYS")
        self.assertEqual(reset_body["book_source"], "TRADE_DERIVED")
        self.assertEqual(reset_body["counterparty"], "SHELL_TRADING")
        self.assertEqual(reset_body["counterparty_source"], "TRADE_DERIVED")
        self.assertEqual(reset_body["location_code"], "CUSHING")
        self.assertEqual(reset_body["location_source"], "TRADE_DERIVED")
        self.assertEqual(reset_body["delivery_start"], "2026-04-10")
        self.assertEqual(reset_body["delivery_end"], "2026-04-11")
        self.assertEqual(reset_body["delivery_window_source"], "TRADE_DERIVED")
        self.assertEqual(reset_body["execution_status"], "PLANNED")
        self.assertEqual(reset_body["execution_status_source"], "SYSTEM_GENERATED")
        self.assertIsNone(reset_body["operations_owner"])
        self.assertEqual(reset_body["operations_owner_source"], "SYSTEM_GENERATED")
        self.assertIsNone(reset_body["external_reference"])
        self.assertEqual(reset_body["external_reference_source"], "SYSTEM_GENERATED")
        self.assertIsNone(reset_body["ops_notes"])
        self.assertEqual(reset_body["ops_notes_source"], "SYSTEM_GENERATED")

    def test_patch_logistics_details_updates_projection(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)
        self.client.patch(
            "/deliveries/DLV-T-LOG-1",
            json={"transport_mode": "TRUCK"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        response = self.client.patch(
            "/deliveries/DLV-T-LOG-1/logistics-details",
            json={
                "origin_location_code": "MIDLAND",
                "destination_location_code": "CUSHING",
                "carrier_name": "Acme Trucking",
                "asset_reference": "TRUCK-17",
                "equipment_type": "TRUCK",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["origin_location_code"], "MIDLAND")
        self.assertEqual(body["origin_location_code_source"], "MANUAL")
        self.assertEqual(body["destination_location_code"], "CUSHING")
        self.assertEqual(body["destination_location_code_source"], "MANUAL")
        self.assertEqual(body["carrier_name"], "Acme Trucking")
        self.assertEqual(body["carrier_name_source"], "MANUAL")
        self.assertEqual(body["asset_reference"], "TRUCK-17")
        self.assertEqual(body["asset_reference_source"], "MANUAL")
        self.assertEqual(body["equipment_type"], "TRUCK")
        self.assertEqual(body["equipment_type_source"], "MANUAL")

        with self.SessionLocal() as session:
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-LOG-1",
                    Event.event_type == "TradeDeliveryLogisticsUpdated",
                )
                .one()
            )
            self.assertEqual(
                audit_event.payload["requested_changes"]["carrier_name"],
                "Acme Trucking",
            )
            self.assertEqual(
                audit_event.payload["delivery"]["asset_reference"],
                "TRUCK-17",
            )

    def test_patch_pipeline_details_updates_projection(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)

        response = self.client.patch(
            "/deliveries/DLV-T-GAS-1/pipeline-details",
            json={
                "pipeline_system": "NGPL",
                "receipt_location_code": "REC-100",
                "delivery_location_code": "DEL-100",
                "pipeline_contract_number": "FT-100",
                "pipeline_cycle_code": "TIMELY",
                "nomination_reference": "NOM-7",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["pipeline_system"], "NGPL")
        self.assertEqual(body["pipeline_system_source"], "MANUAL")
        self.assertEqual(body["receipt_location_code"], "REC-100")
        self.assertEqual(body["receipt_location_code_source"], "MANUAL")
        self.assertEqual(body["delivery_location_code"], "DEL-100")
        self.assertEqual(body["delivery_location_code_source"], "MANUAL")
        self.assertEqual(body["pipeline_contract_number"], "FT-100")
        self.assertEqual(body["pipeline_contract_number_source"], "MANUAL")
        self.assertEqual(body["pipeline_cycle_code"], "TIMELY")
        self.assertEqual(body["pipeline_cycle_code_source"], "MANUAL")
        self.assertEqual(body["nomination_reference"], "NOM-7")
        self.assertEqual(body["nomination_reference_source"], "MANUAL")

    def test_patch_power_details_updates_projection(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)

        response = self.client.patch(
            "/deliveries/DLV-T-POWER-1/power-details",
            json={
                "market_operator": "PJM",
                "pricing_node_code": "PJM_WEST_HUB",
                "delivery_node_code": "PJM_WEST_HUB",
                "profile_code": "5X16",
                "schedule_reference": "TAG-42",
                "interval_minutes": 60,
                "timezone_name": "America/New_York",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["market_operator"], "PJM")
        self.assertEqual(body["market_operator_source"], "MANUAL")
        self.assertEqual(body["pricing_node_code"], "PJM_WEST_HUB")
        self.assertEqual(body["pricing_node_code_source"], "MANUAL")
        self.assertEqual(body["delivery_node_code"], "PJM_WEST_HUB")
        self.assertEqual(body["delivery_node_code_source"], "MANUAL")
        self.assertEqual(body["profile_code"], "5X16")
        self.assertEqual(body["profile_code_source"], "MANUAL")
        self.assertEqual(body["schedule_reference"], "TAG-42")
        self.assertEqual(body["schedule_reference_source"], "MANUAL")
        self.assertEqual(body["interval_minutes"], 60)
        self.assertEqual(body["interval_minutes_source"], "MANUAL")
        self.assertEqual(body["timezone_name"], "America/New_York")
        self.assertEqual(body["timezone_name_source"], "MANUAL")

    def test_mode_detail_resets_restore_seeded_defaults(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)
        self.client.patch(
            "/deliveries/DLV-T-LOG-1",
            json={"transport_mode": "TRUCK"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.client.patch(
            "/deliveries/DLV-T-LOG-1/logistics-details",
            json={
                "origin_location_code": "MIDLAND",
                "carrier_name": "Acme Trucking",
                "asset_reference": "TRUCK-17",
                "equipment_type": "TRUCK",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        logistics_reset = self.client.patch(
            "/deliveries/DLV-T-LOG-1/logistics-details",
            json={"reset_fields": ["origin_location_code", "carrier_name", "asset_reference", "equipment_type"]},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(logistics_reset.status_code, 200)
        logistics_body = logistics_reset.json()
        self.assertIsNone(logistics_body["origin_location_code"])
        self.assertEqual(logistics_body["origin_location_code_source"], "SYSTEM_GENERATED")
        self.assertIsNone(logistics_body["carrier_name"])
        self.assertEqual(logistics_body["carrier_name_source"], "SYSTEM_GENERATED")
        self.assertIsNone(logistics_body["asset_reference"])
        self.assertEqual(logistics_body["asset_reference_source"], "SYSTEM_GENERATED")
        self.assertIsNone(logistics_body["equipment_type"])
        self.assertEqual(logistics_body["equipment_type_source"], "SYSTEM_GENERATED")
        self.assertEqual(logistics_body["destination_location_code"], "CUSHING")
        self.assertEqual(logistics_body["destination_location_code_source"], "TRADE_DERIVED")

        self.client.patch(
            "/deliveries/DLV-T-GAS-1/pipeline-details",
            json={
                "pipeline_system": "NGPL",
                "receipt_location_code": "REC-100",
                "delivery_location_code": "DEL-100",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        pipeline_reset = self.client.patch(
            "/deliveries/DLV-T-GAS-1/pipeline-details",
            json={"reset_fields": ["pipeline_system", "receipt_location_code", "delivery_location_code"]},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(pipeline_reset.status_code, 200)
        pipeline_body = pipeline_reset.json()
        self.assertIsNone(pipeline_body["pipeline_system"])
        self.assertEqual(pipeline_body["pipeline_system_source"], "SYSTEM_GENERATED")
        self.assertIsNone(pipeline_body["receipt_location_code"])
        self.assertEqual(pipeline_body["receipt_location_code_source"], "SYSTEM_GENERATED")
        self.assertEqual(pipeline_body["delivery_location_code"], "HENRY_HUB")
        self.assertEqual(pipeline_body["delivery_location_code_source"], "TRADE_DERIVED")

        self.client.patch(
            "/deliveries/DLV-T-POWER-1/power-details",
            json={
                "pricing_node_code": "PJM_WEST_HUB",
                "delivery_node_code": "PJM_WEST_HUB",
                "interval_minutes": 60,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        power_reset = self.client.patch(
            "/deliveries/DLV-T-POWER-1/power-details",
            json={"reset_fields": ["pricing_node_code", "delivery_node_code", "interval_minutes"]},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(power_reset.status_code, 200)
        power_body = power_reset.json()
        self.assertEqual(power_body["pricing_node_code"], "PJM_WEST")
        self.assertEqual(power_body["pricing_node_code_source"], "TRADE_DERIVED")
        self.assertEqual(power_body["delivery_node_code"], "PJM_WEST")
        self.assertEqual(power_body["delivery_node_code_source"], "TRADE_DERIVED")
        self.assertIsNone(power_body["interval_minutes"])
        self.assertEqual(power_body["interval_minutes_source"], "SYSTEM_GENERATED")

    def test_post_delivery_event_updates_execution_timeline_projection(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)
        self.client.patch(
            "/deliveries/DLV-T-LOG-1",
            json={"transport_mode": "TRUCK"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        scheduled_response = self.client.post(
            "/deliveries/DLV-T-LOG-1/events",
            json={
                "event_type": "SCHEDULE_COMMITTED",
                "occurred_at": "2026-04-09T15:30:00Z",
                "location_code": "MIDLAND",
                "reference_code": "APPT-17",
                "source": "carrier portal",
                "notes": "Pickup appointment committed.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(scheduled_response.status_code, 201)
        scheduled_body = scheduled_response.json()
        self.assertEqual(scheduled_body["execution_status"], "SCHEDULED")
        self.assertEqual(scheduled_body["event_count"], 1)
        self.assertEqual(scheduled_body["latest_event_type"], "SCHEDULE_COMMITTED")
        self.assertEqual(scheduled_body["latest_event_at"], "2026-04-09T15:30:00Z")
        self.assertEqual(scheduled_body["delivery_events"][0]["execution_status"], "SCHEDULED")
        self.assertEqual(scheduled_body["delivery_events"][0]["reference_code"], "APPT-17")
        self.assertEqual(scheduled_body["status"], "READY")

        started_response = self.client.post(
            "/deliveries/DLV-T-LOG-1/events",
            json={
                "event_type": "EXECUTION_STARTED",
                "occurred_at": "2026-04-10T13:00:00Z",
                "location_code": "MIDLAND",
                "reference_code": "BOL-22",
                "notes": "Driver loaded and departed terminal.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(started_response.status_code, 201)
        started_body = started_response.json()
        self.assertEqual(started_body["execution_status"], "IN_PROGRESS")
        self.assertEqual(started_body["event_count"], 2)
        self.assertEqual(started_body["latest_event_type"], "EXECUTION_STARTED")
        self.assertEqual(started_body["delivery_events"][0]["event_type"], "EXECUTION_STARTED")
        self.assertEqual(started_body["delivery_events"][1]["event_type"], "SCHEDULE_COMMITTED")
        self.assertEqual(started_body["status"], "IN_PROGRESS")

        with self.SessionLocal() as session:
            events = (
                session.query(DeliveryEvent)
                .filter(DeliveryEvent.delivery_id == "DLV-T-LOG-1")
                .order_by(DeliveryEvent.occurred_at.asc(), DeliveryEvent.id.asc())
                .all()
            )
            self.assertEqual(len(events), 2)
            self.assertEqual(events[0].execution_status, "SCHEDULED")
            self.assertEqual(events[1].execution_status, "IN_PROGRESS")
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-LOG-1",
                    Event.event_type == "TradeDeliveryEventLogged",
                )
                .order_by(Event.recorded_at.desc())
                .first()
            )
            self.assertIsNotNone(audit_event)
            self.assertEqual(audit_event.payload["request"]["event_type"], "EXECUTION_STARTED")
            self.assertEqual(audit_event.payload["latest_event"]["event_type"], "EXECUTION_STARTED")

    def test_manual_execution_override_wins_until_reset_when_events_are_logged(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)

        override_response = self.client.patch(
            "/deliveries/DLV-T-GAS-1",
            json={"execution_status": "ON_HOLD"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(override_response.status_code, 200)
        self.assertEqual(override_response.json()["execution_status_source"], "MANUAL")

        event_response = self.client.post(
            "/deliveries/DLV-T-GAS-1/events",
            json={
                "event_type": "DELIVERY_COMPLETED",
                "occurred_at": "2026-04-08T18:30:00Z",
                "reference_code": "NOM-88",
                "notes": "Pipeline flow closed out.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(event_response.status_code, 201)
        event_body = event_response.json()
        self.assertEqual(event_body["execution_status"], "ON_HOLD")
        self.assertEqual(event_body["execution_status_source"], "MANUAL")
        self.assertEqual(event_body["delivery_events"][0]["execution_status"], "COMPLETED")
        self.assertEqual(event_body["latest_event_type"], "DELIVERY_COMPLETED")
        self.assertEqual(event_body["status"], "BLOCKED")

        reset_response = self.client.patch(
            "/deliveries/DLV-T-GAS-1",
            json={"reset_fields": ["execution_status"]},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(reset_response.status_code, 200)
        reset_body = reset_response.json()
        self.assertEqual(reset_body["execution_status"], "COMPLETED")
        self.assertEqual(reset_body["execution_status_source"], "SYSTEM_GENERATED")
        self.assertEqual(reset_body["status"], "COMPLETED")

    def test_logistics_detail_patch_rejects_non_logistics_delivery(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trades()
        self._sync_deliveries(admin_token)

        response = self.client.patch(
            "/deliveries/DLV-T-GAS-1/logistics-details",
            json={"carrier_name": "Should Fail"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("not a logistics obligation", response.json()["detail"])
