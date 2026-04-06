from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone

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
from apps.api.app.models.layout_definition import LayoutDefinition
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.routes.layout_definitions import WORKSPACE_TILE_IDS


class LayoutDefinitionsApiTests(unittest.TestCase):
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
        self._previous_bootstrap_admin_token = settings.BOOTSTRAP_ADMIN_TOKEN
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"

        with self.SessionLocal() as session:
            session.query(LayoutDefinition).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()

    def tearDown(self) -> None:
        settings.BOOTSTRAP_ADMIN_TOKEN = self._previous_bootstrap_admin_token

    def _bootstrap_admin(self) -> dict[str, object]:
        response = self.client.post(
            "/auth/bootstrap-admin",
            json={
                "bootstrap_token": "bootstrap-secret",
                "user_id": "ops_admin",
                "email": "ops@example.com",
                "display_name": "Ops Admin",
                "password": "supersecret1",
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def _create_user(self, *, user_id: str, email: str, display_name: str, role: str = "TRADER") -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id=user_id,
                    email=email,
                    display_name=display_name,
                    role=role,
                    password_hash=hash_password("supersecret2"),
                    is_active=True,
                    last_login_at=now,
                    created_at=now,
                    created_by="ops_admin",
                    updated_at=now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.commit()

    def _login(self, *, identifier: str, password: str) -> str:
        response = self.client.post("/auth/session", json={"identifier": identifier, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def test_layout_definitions_require_authentication(self) -> None:
        response = self.client.get("/layout-definitions/dashboard")
        self.assertEqual(response.status_code, 401)

        response = self.client.put(
            "/layout-definitions/dashboard",
            json={"order": list(WORKSPACE_TILE_IDS["dashboard"]), "hidden": [], "spans": {}},
        )
        self.assertEqual(response.status_code, 401)

    def test_layout_definitions_are_scoped_to_user_and_workspace(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]

        self._create_user(user_id="trader_1", email="trader@example.com", display_name="Trader One")
        trader_token = self._login(identifier="trader_1", password="supersecret2")

        dashboard_payload = {
            "order": [
                "market-prices",
                "desk-snapshot",
                "position-snapshot",
                "operational-attention",
                "recent-timeline",
            ],
            "hidden": ["recent-timeline"],
            "spans": {
                "market-prices": "wide",
                "position-snapshot": "full",
            },
        }
        save_dashboard = self.client.put(
            "/layout-definitions/dashboard",
            json=dashboard_payload,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(save_dashboard.status_code, 200)
        self.assertEqual(save_dashboard.json()["updated_by"], "ops_admin")
        self.assertEqual(save_dashboard.json()["version"], 1)
        self.assertEqual(save_dashboard.json()["spans"], dashboard_payload["spans"])

        get_dashboard = self.client.get(
            "/layout-definitions/dashboard",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(get_dashboard.status_code, 200)
        self.assertEqual(get_dashboard.json()["order"], dashboard_payload["order"])
        self.assertEqual(get_dashboard.json()["spans"], dashboard_payload["spans"])

        trader_dashboard = self.client.get(
            "/layout-definitions/dashboard",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(trader_dashboard.status_code, 200)
        self.assertIsNone(trader_dashboard.json())

        trades_payload = {
            "order": ["trade-board", "create-trade", "trade-inspector"],
            "hidden": ["trade-inspector"],
            "spans": {
                "trade-board": "wide",
                "trade-inspector": "half",
            },
        }
        save_trades = self.client.put(
            "/layout-definitions/trades",
            json=trades_payload,
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(save_trades.status_code, 200)
        self.assertEqual(save_trades.json()["updated_by"], "trader_1")

        positions_payload = {
            "order": ["positions-summary", "positions-by-class", "positions-detail"],
            "hidden": ["positions-by-class"],
            "spans": {
                "positions-detail": "wide",
            },
        }
        save_positions = self.client.put(
            "/layout-definitions/positions",
            json=positions_payload,
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(save_positions.status_code, 200)
        self.assertEqual(save_positions.json()["spans"], positions_payload["spans"])

        shipments_payload = {
            "order": ["shipment-summary", "shipment-readiness", "shipment-blockers", "shipment-queue"],
            "hidden": ["shipment-readiness"],
            "spans": {
                "shipment-blockers": "wide",
            },
        }
        save_shipments = self.client.put(
            "/layout-definitions/shipments",
            json=shipments_payload,
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(save_shipments.status_code, 200)
        self.assertEqual(save_shipments.json()["workspace_id"], "shipments")
        self.assertEqual(save_shipments.json()["spans"], shipments_payload["spans"])

        scheduling_payload = {
            "order": [
                "scheduling-board",
                "scheduling-attention",
                "scheduling-lanes",
                "scheduling-windows",
                "scheduling-handoffs",
            ],
            "hidden": ["scheduling-windows"],
            "spans": {
                "scheduling-attention": "wide",
                "scheduling-handoffs": "half",
            },
        }
        save_scheduling = self.client.put(
            "/layout-definitions/scheduling",
            json=scheduling_payload,
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(save_scheduling.status_code, 200)
        self.assertEqual(save_scheduling.json()["workspace_id"], "scheduling")
        self.assertEqual(save_scheduling.json()["spans"], scheduling_payload["spans"])

        events_payload = {
            "order": ["events-controls", "events-breakdown", "events-stream"],
            "hidden": [],
            "spans": {
                "events-controls": "side",
                "events-stream": "wide",
            },
        }
        save_events = self.client.put(
            "/layout-definitions/events",
            json=events_payload,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(save_events.status_code, 200)
        self.assertEqual(save_events.json()["spans"], events_payload["spans"])

        risk_payload = {
            "order": ["risk-summary", "risk-exposure", "risk-pricing", "risk-books"],
            "hidden": ["risk-books"],
            "spans": {
                "risk-exposure": "wide",
                "risk-pricing": "wide",
            },
        }
        save_risk = self.client.put(
            "/layout-definitions/risk",
            json=risk_payload,
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(save_risk.status_code, 200)
        self.assertEqual(save_risk.json()["workspace_id"], "risk")
        self.assertEqual(save_risk.json()["spans"], risk_payload["spans"])

        admin_trades = self.client.get(
            "/layout-definitions/trades",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(admin_trades.status_code, 200)
        self.assertIsNone(admin_trades.json())

        get_positions = self.client.get(
            "/layout-definitions/positions",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(get_positions.status_code, 200)
        self.assertEqual(get_positions.json()["order"], positions_payload["order"])

        get_shipments = self.client.get(
            "/layout-definitions/shipments",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(get_shipments.status_code, 200)
        self.assertEqual(get_shipments.json()["order"], shipments_payload["order"])

        get_scheduling = self.client.get(
            "/layout-definitions/scheduling",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(get_scheduling.status_code, 200)
        self.assertEqual(get_scheduling.json()["order"], scheduling_payload["order"])

        get_events = self.client.get(
            "/layout-definitions/events",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(get_events.status_code, 200)
        self.assertEqual(get_events.json()["order"], events_payload["order"])

        get_risk = self.client.get(
            "/layout-definitions/risk",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(get_risk.status_code, 200)
        self.assertEqual(get_risk.json()["order"], risk_payload["order"])

        update_dashboard = self.client.put(
            "/layout-definitions/dashboard",
            json={
                "order": list(WORKSPACE_TILE_IDS["dashboard"]),
                "hidden": ["operational-attention", "recent-timeline"],
                "spans": {"desk-snapshot": "wide"},
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(update_dashboard.status_code, 200)
        self.assertEqual(update_dashboard.json()["version"], 2)

    def test_layout_definition_rejects_unknown_workspace_and_invalid_tiles(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]

        unsupported_workspace = self.client.put(
            "/layout-definitions/reference",
            json={"order": ["timeline"], "hidden": []},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(unsupported_workspace.status_code, 404)

        invalid_tiles = self.client.put(
            "/layout-definitions/dashboard",
            json={
                "order": [
                    "desk-snapshot",
                    "market-prices",
                    "position-snapshot",
                    "operational-attention",
                ],
                "hidden": ["recent-timeline"],
                "spans": {},
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(invalid_tiles.status_code, 422)
        self.assertIn("must include each supported tile exactly once", invalid_tiles.text)

        invalid_span = self.client.put(
            "/layout-definitions/dashboard",
            json={
                "order": list(WORKSPACE_TILE_IDS["dashboard"]),
                "hidden": [],
                "spans": {"desk-snapshot": "side"},
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(invalid_span.status_code, 422)
        self.assertIn("not supported for tile 'desk-snapshot'", invalid_span.text)

    def test_layout_definition_can_be_reset(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]

        create_response = self.client.put(
            "/layout-definitions/trades",
            json={
                "order": list(WORKSPACE_TILE_IDS["trades"]),
                "hidden": ["trade-inspector"],
                "spans": {"trade-board": "wide"},
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 200)

        delete_response = self.client.delete(
            "/layout-definitions/trades",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(delete_response.status_code, 204)

        get_response = self.client.get(
            "/layout-definitions/trades",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(get_response.status_code, 200)
        self.assertIsNone(get_response.json())


if __name__ == "__main__":
    unittest.main()
