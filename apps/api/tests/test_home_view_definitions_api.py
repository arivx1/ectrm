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
from apps.api.app.models.home_view_definition import HomeViewDefinition
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class HomeViewDefinitionsApiTests(unittest.TestCase):
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
            session.query(HomeViewDefinition).delete()
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

    def _home_view_payload(self, *, name: str = "HH NG Watch") -> dict[str, object]:
        return {
            "name": name,
            "scope": "PERSONAL",
            "base_template_key": "system_home",
            "base_template_version": 1,
            "persona_hint": "trader",
            "global_filters": {"commodity_code": "NATGAS"},
            "cards": [
                {
                    "card_id": "prices",
                    "visible": True,
                    "placement": {"order": 4, "column_span": 1, "row_span": 2},
                    "parameters": {"price_sort": "updated_desc"},
                    "filters": {"price_index_code": "HH_NATGAS"},
                    "data_bindings": ["latest_price_marks"],
                },
                {
                    "card_id": "map",
                    "visible": False,
                    "placement": {"order": 9, "column_span": 2, "row_span": 2},
                    "parameters": {"map_record_limit": 50},
                    "filters": {"commodity_code": "NATGAS"},
                    "data_bindings": ["asset_map"],
                },
            ],
        }

    def test_home_view_definitions_require_authentication(self) -> None:
        self.assertEqual(self.client.get("/home-view-definitions").status_code, 401)
        self.assertEqual(self.client.get("/home-view-definitions/system-template").status_code, 401)
        self.assertEqual(
            self.client.post("/home-view-definitions", json=self._home_view_payload()).status_code,
            401,
        )

    def test_system_template_returns_immutable_home_contract(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]

        response = self.client.get(
            "/home-view-definitions/system-template",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["template_key"], "system_home")
        self.assertEqual(payload["template_version"], 1)
        self.assertEqual(payload["immutable"], True)
        self.assertEqual(
            [card["card_id"] for card in payload["cards"]],
            ["timeframe", "prices", "map", "documents", "communication", "prompt"],
        )
        self.assertEqual(payload["cards"][1]["kind"], "market_prices")
        self.assertEqual(payload["cards"][1]["label"], "Market Prices")

    def test_home_view_definitions_are_personal_named_instances(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]
        self._create_user(user_id="trader_1", email="trader@example.com", display_name="Trader One")
        trader_token = self._login(identifier="trader_1", password="supersecret2")

        create_response = self.client.post(
            "/home-view-definitions",
            json=self._home_view_payload(),
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        created = create_response.json()
        definition_id = created["definition_id"]
        self.assertEqual(created["name"], "HH NG Watch")
        self.assertEqual(created["scope"], "PERSONAL")
        self.assertEqual(created["base_template_key"], "system_home")
        self.assertEqual(created["base_template_version"], 1)
        self.assertEqual(created["persona_hint"], "trader")
        self.assertEqual(created["global_filters"], {"commodity_code": "NATGAS"})
        self.assertEqual(created["status"], "ACTIVE")
        self.assertEqual(created["created_by"], "ops_admin")
        self.assertEqual(created["updated_by"], "ops_admin")
        self.assertEqual(created["version"], 1)
        self.assertEqual(created["can_edit"], True)
        self.assertTrue(created["definition_key"].startswith("home_view_"))
        self.assertEqual(
            [card["card_id"] for card in created["cards"]],
            ["prices", "map", "timeframe", "documents", "communication", "prompt"],
        )
        self.assertEqual([card["placement"]["order"] for card in created["cards"]], [0, 1, 2, 3, 4, 5])
        self.assertEqual(created["cards"][0]["kind"], "market_prices")
        self.assertEqual(created["cards"][0]["label"], "Market Prices")
        self.assertEqual(created["cards"][0]["parameters"], {"price_sort": "updated_desc"})
        self.assertEqual(created["cards"][0]["filters"], {"price_index_code": "HH_NATGAS"})
        self.assertEqual(created["cards"][0]["data_bindings"], ["latest_price_marks"])
        self.assertEqual(created["cards"][1]["visible"], False)

        duplicate_response = self.client.post(
            "/home-view-definitions",
            json=self._home_view_payload(),
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(duplicate_response.status_code, 409)

        list_response = self.client.get(
            "/home-view-definitions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual([item["definition_id"] for item in list_response.json()], [definition_id])

        trader_list = self.client.get(
            "/home-view-definitions",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(trader_list.status_code, 200)
        self.assertEqual(trader_list.json(), [])

        update_response = self.client.patch(
            f"/home-view-definitions/{definition_id}",
            json={
                "name": "US Gas Watch",
                "persona_hint": "risk",
                "global_filters": {"commodity_code": "NATGAS", "region": "US"},
                "cards": [
                    {
                        "card_id": "prompt",
                        "visible": True,
                        "placement": {"order": 0, "column_span": 2, "row_span": 1},
                        "parameters": {"starter_kit": "risk"},
                        "filters": {"workflow_category": "pricing"},
                    }
                ],
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(update_response.status_code, 200)
        updated = update_response.json()
        self.assertEqual(updated["name"], "US Gas Watch")
        self.assertEqual(updated["persona_hint"], "risk")
        self.assertEqual(updated["version"], 2)
        self.assertEqual(updated["cards"][0]["card_id"], "prompt")
        self.assertEqual(updated["cards"][0]["kind"], "assistant_prompt")
        self.assertEqual(updated["cards"][0]["parameters"], {"starter_kit": "risk"})

        reset_response = self.client.post(
            f"/home-view-definitions/{definition_id}/reset",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(reset_response.status_code, 200)
        reset = reset_response.json()
        self.assertEqual(reset["version"], 3)
        self.assertEqual(reset["global_filters"], {})
        self.assertEqual(
            [card["card_id"] for card in reset["cards"]],
            ["timeframe", "prices", "map", "documents", "communication", "prompt"],
        )
        self.assertEqual(reset["cards"][1]["parameters"], {})
        self.assertEqual(reset["cards"][1]["filters"], {})

        delete_response = self.client.delete(
            f"/home-view-definitions/{definition_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(delete_response.status_code, 204)

        get_deleted = self.client.get(
            f"/home-view-definitions/{definition_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(get_deleted.status_code, 404)

    def test_home_view_definition_validation_rejects_unsupported_contracts(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]

        invalid_template = self._home_view_payload(name="Bad Template")
        invalid_template["base_template_key"] = "mutable_home"
        response = self.client.post(
            "/home-view-definitions",
            json=invalid_template,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("base_template_key", response.text)

        duplicate_cards = self._home_view_payload(name="Duplicate Cards")
        duplicate_cards["cards"] = [
            {"card_id": "prices", "placement": {"order": 0, "column_span": 2, "row_span": 1}},
            {"card_id": "prices", "placement": {"order": 1, "column_span": 2, "row_span": 1}},
        ]
        response = self.client.post(
            "/home-view-definitions",
            json=duplicate_cards,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("duplicate card ids", response.text)

        invalid_filter = self._home_view_payload(name="Invalid Filter")
        invalid_filter["cards"] = [
            {
                "card_id": "prices",
                "placement": {"order": 0, "column_span": 2, "row_span": 1},
                "filters": {"review_status": "VERIFIED"},
            }
        ]
        response = self.client.post(
            "/home-view-definitions",
            json=invalid_filter,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("Filters are not supported", response.text)

        invalid_global_filter = self._home_view_payload(name="Invalid Global Filter")
        invalid_global_filter["global_filters"] = {"raw_sql": "select * from prices"}
        response = self.client.post(
            "/home-view-definitions",
            json=invalid_global_filter,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("Global filters are not supported", response.text)

        invalid_parameter = self._home_view_payload(name="Invalid Parameter")
        invalid_parameter["cards"] = [
            {
                "card_id": "documents",
                "placement": {"order": 0, "column_span": 1, "row_span": 1},
                "parameters": {"price_sort": "updated_desc"},
            }
        ]
        response = self.client.post(
            "/home-view-definitions",
            json=invalid_parameter,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("Parameters are not supported", response.text)

        invalid_binding = self._home_view_payload(name="Invalid Binding")
        invalid_binding["cards"] = [
            {
                "card_id": "map",
                "placement": {"order": 0, "column_span": 2, "row_span": 2},
                "data_bindings": ["assistant_conversation"],
            }
        ]
        response = self.client.post(
            "/home-view-definitions",
            json=invalid_binding,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("Data bindings are not supported", response.text)

        unknown_card = self._home_view_payload(name="Unknown Card")
        unknown_card["cards"] = [{"card_id": "legacy-card", "placement": {"order": 0}}]
        response = self.client.post(
            "/home-view-definitions",
            json=unknown_card,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
