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
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
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
            session.query(ReferencePriceIndex).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceCommodity).delete()
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

    def _seed_home_view_reference_catalog(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    ReferenceCommodity(
                        code="NATGAS",
                        commodity_class="GAS",
                        allowed_transport_modes=["PIPELINE"],
                        name="Natural Gas",
                        description=None,
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="ops_admin",
                        updated_at=now,
                        updated_by="ops_admin",
                        version=1,
                    ),
                    ReferenceCommodity(
                        code="COAL",
                        commodity_class="COAL",
                        allowed_transport_modes=["RAIL"],
                        name="Coal",
                        description=None,
                        is_active=False,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="ops_admin",
                        updated_at=now,
                        updated_by="ops_admin",
                        version=1,
                    ),
                    ReferenceLocation(
                        code="HENRY_HUB",
                        parent_location_code=None,
                        name="Henry Hub",
                        location_kind="POINT",
                        location_type="HUB",
                        market="US",
                        city=None,
                        subdivision_code="US-LA",
                        country_code="US",
                        continent_code="NA",
                        latitude=None,
                        longitude=None,
                        region="North America",
                        timezone="America/Chicago",
                        description=None,
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="ops_admin",
                        updated_at=now,
                        updated_by="ops_admin",
                        version=1,
                    ),
                    ReferencePriceIndex(
                        code="HH_NATGAS",
                        name="Henry Hub Natural Gas",
                        commodity_code="NATGAS",
                        currency_code="USD",
                        unit_code="MMBTU",
                        provider="EIA",
                        quote_type="SPOT",
                        market="US",
                        location_code="HENRY_HUB",
                        calendar_code=None,
                        description=None,
                        is_active=True,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="ops_admin",
                        updated_at=now,
                        updated_by="ops_admin",
                        version=1,
                    ),
                    ReferencePriceIndex(
                        code="OLD_NG",
                        name="Retired Natural Gas",
                        commodity_code="NATGAS",
                        currency_code="USD",
                        unit_code="MMBTU",
                        provider="EIA",
                        quote_type="SPOT",
                        market="US",
                        location_code="HENRY_HUB",
                        calendar_code=None,
                        description=None,
                        is_active=False,
                        effective_from=None,
                        effective_to=None,
                        created_at=now,
                        created_by="ops_admin",
                        updated_at=now,
                        updated_by="ops_admin",
                        version=1,
                    ),
                ]
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
            ["timeframe", "prices", "news", "map", "documents", "communication", "prompt"],
        )
        self.assertEqual(payload["cards"][1]["kind"], "market_prices")
        self.assertEqual(payload["cards"][1]["label"], "Market Prices")
        self.assertEqual(payload["cards"][2]["kind"], "market_news")
        self.assertEqual(payload["cards"][2]["label"], "Market News")

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
        self.assertEqual(created["scope_owner_key"], "ops_admin")
        self.assertEqual(created["base_template_key"], "system_home")
        self.assertEqual(created["base_template_version"], 1)
        self.assertEqual(created["persona_hint"], "trader")
        self.assertEqual(created["global_filters"], {"commodity_code": "NATGAS"})
        self.assertEqual(created["status"], "ACTIVE")
        self.assertEqual(created["created_by"], "ops_admin")
        self.assertEqual(created["updated_by"], "ops_admin")
        self.assertEqual(created["version"], 1)
        self.assertEqual(created["can_edit"], True)
        self.assertEqual(created["can_publish"], True)
        self.assertEqual(created["can_duplicate"], False)
        self.assertEqual(created["is_shared"], False)
        self.assertEqual(created["validation_warnings"], [])
        self.assertTrue(created["definition_key"].startswith("home_view_"))
        self.assertEqual(
            [card["card_id"] for card in created["cards"]],
            ["prices", "map", "timeframe", "news", "documents", "communication", "prompt"],
        )
        self.assertEqual([card["placement"]["order"] for card in created["cards"]], [0, 1, 2, 3, 4, 5, 6])
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
            ["timeframe", "prices", "news", "map", "documents", "communication", "prompt"],
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

        invalid_news_parameter = self._home_view_payload(name="Invalid News Parameter")
        invalid_news_parameter["cards"] = [
            {
                "card_id": "news",
                "placement": {"order": 0, "column_span": 2, "row_span": 1},
                "parameters": {"news_lookback_days": 30},
            }
        ]
        response = self.client.post(
            "/home-view-definitions",
            json=invalid_news_parameter,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("news_lookback_days must be between 1 and 14", response.text)

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

    def test_home_view_definition_validation_checks_price_and_map_filter_values(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]
        self._seed_home_view_reference_catalog()

        payload = self._home_view_payload(name="Validated HH NG")
        payload["cards"] = [
            {
                "card_id": "prices",
                "placement": {"order": 0, "column_span": 2, "row_span": 1},
                "parameters": {
                    "price_mark_status": "with_marks",
                    "price_sort": "updated_desc",
                },
                "filters": {
                    "price_index_code": "hh_natgas",
                    "commodity_code": "natgas",
                    "location_code": "henry_hub",
                    "provider": "EIA",
                    "quote_type": "spot",
                },
            },
            {
                "card_id": "map",
                "placement": {"order": 1, "column_span": 2, "row_span": 2},
                "parameters": {"map_record_limit": 250},
                "filters": {"geography": ["North America"], "commodity_code": "NATGAS"},
            },
        ]
        response = self.client.post(
            "/home-view-definitions",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 201)
        created = response.json()
        self.assertEqual(created["cards"][0]["filters"]["price_index_code"], "HH_NATGAS")
        self.assertEqual(created["cards"][0]["filters"]["commodity_code"], "NATGAS")
        self.assertEqual(created["cards"][0]["filters"]["location_code"], "HENRY_HUB")
        self.assertEqual(created["cards"][0]["filters"]["quote_type"], "SPOT")
        self.assertEqual(created["cards"][0]["parameters"]["price_mark_status"], "with_marks")
        self.assertEqual(created["cards"][1]["filters"]["geography"], ["North America"])
        self.assertEqual(created["cards"][1]["parameters"]["map_record_limit"], 250)

        inactive_price_index = self._home_view_payload(name="Inactive Price Index")
        inactive_price_index["cards"][0]["filters"] = {"price_index_code": "OLD_NG"}
        response = self.client.post(
            "/home-view-definitions",
            json=inactive_price_index,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("price_index_code", response.text)

        unsupported_geography = self._home_view_payload(name="Unsupported Geography")
        unsupported_geography["cards"][1]["filters"] = {"geography": ["Atlantis"]}
        response = self.client.post(
            "/home-view-definitions",
            json=unsupported_geography,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("geography values are not supported", response.text)

        unsupported_parameter = self._home_view_payload(name="Unsupported Parameter Value")
        unsupported_parameter["cards"][0]["parameters"] = {"price_mark_status": "stale"}
        response = self.client.post(
            "/home-view-definitions",
            json=unsupported_parameter,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("price_mark_status", response.text)

    def test_shared_home_view_lifecycle_and_personal_duplication(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]
        self._create_user(user_id="trader_1", email="trader@example.com", display_name="Trader One")
        trader_token = self._login(identifier="trader_1", password="supersecret2")

        create_response = self.client.post(
            "/home-view-definitions",
            json=self._home_view_payload(name="Admin HH NG"),
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        personal_definition_id = create_response.json()["definition_id"]

        trader_publish_response = self.client.post(
            f"/home-view-definitions/{personal_definition_id}/publish",
            json={"name": "Desk HH NG", "scope": "ORGANIZATION"},
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(trader_publish_response.status_code, 403)

        publish_response = self.client.post(
            f"/home-view-definitions/{personal_definition_id}/publish",
            json={"name": "Desk HH NG", "scope": "ORGANIZATION"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(publish_response.status_code, 201)
        shared = publish_response.json()
        shared_definition_id = shared["definition_id"]
        self.assertEqual(shared["name"], "Desk HH NG")
        self.assertEqual(shared["scope"], "ORGANIZATION")
        self.assertEqual(shared["scope_owner_key"], "organization")
        self.assertEqual(shared["status"], "ACTIVE")
        self.assertEqual(shared["can_edit"], False)
        self.assertEqual(shared["can_retire"], True)
        self.assertEqual(shared["can_restore"], False)
        self.assertEqual(shared["can_duplicate"], True)
        self.assertEqual(shared["is_shared"], True)

        trader_list = self.client.get(
            "/home-view-definitions",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(trader_list.status_code, 200)
        trader_visible = trader_list.json()
        self.assertEqual([item["definition_id"] for item in trader_visible], [shared_definition_id])
        self.assertEqual(trader_visible[0]["can_edit"], False)
        self.assertEqual(trader_visible[0]["can_duplicate"], True)

        trader_edit_response = self.client.patch(
            f"/home-view-definitions/{shared_definition_id}",
            json={"name": "Trader Edit Attempt"},
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(trader_edit_response.status_code, 403)

        duplicate_response = self.client.post(
            f"/home-view-definitions/{shared_definition_id}/duplicate",
            json={"name": "Trader HH NG"},
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(duplicate_response.status_code, 201)
        duplicate = duplicate_response.json()
        self.assertEqual(duplicate["name"], "Trader HH NG")
        self.assertEqual(duplicate["scope"], "PERSONAL")
        self.assertEqual(duplicate["scope_owner_key"], "trader_1")
        self.assertEqual(duplicate["can_edit"], True)
        self.assertEqual(duplicate["cards"][0]["filters"], shared["cards"][0]["filters"])

        trader_retire_response = self.client.post(
            f"/home-view-definitions/{shared_definition_id}/retire",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(trader_retire_response.status_code, 403)

        retire_response = self.client.post(
            f"/home-view-definitions/{shared_definition_id}/retire",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(retire_response.status_code, 200)
        retired = retire_response.json()
        self.assertEqual(retired["status"], "RETIRED")
        self.assertEqual(retired["can_restore"], True)

        trader_list_after_retire = self.client.get(
            "/home-view-definitions",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(trader_list_after_retire.status_code, 200)
        self.assertNotIn(
            shared_definition_id,
            [item["definition_id"] for item in trader_list_after_retire.json()],
        )

        inventory_response = self.client.get(
            "/home-view-definitions/admin/inventory",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(inventory_response.status_code, 200)
        inventory = inventory_response.json()
        retired_inventory_record = next(
            item for item in inventory if item["definition_id"] == shared_definition_id
        )
        self.assertEqual(retired_inventory_record["status"], "RETIRED")
        self.assertEqual(retired_inventory_record["scope"], "ORGANIZATION")
        self.assertEqual(retired_inventory_record["validation_warnings"], [])

        trader_inventory_response = self.client.get(
            "/home-view-definitions/admin/inventory",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(trader_inventory_response.status_code, 403)

        restore_response = self.client.post(
            f"/home-view-definitions/{shared_definition_id}/restore",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(restore_response.status_code, 200)
        restored = restore_response.json()
        self.assertEqual(restored["status"], "ACTIVE")
        self.assertEqual(restored["can_retire"], True)

        trader_list_after_restore = self.client.get(
            "/home-view-definitions",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(trader_list_after_restore.status_code, 200)
        self.assertIn(
            shared_definition_id,
            [item["definition_id"] for item in trader_list_after_restore.json()],
        )

    def test_admin_home_view_inventory_reports_reference_validation_warnings(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]
        self._seed_home_view_reference_catalog()

        create_response = self.client.post(
            "/home-view-definitions",
            json=self._home_view_payload(name="Validated Admin HH NG"),
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        personal_definition_id = create_response.json()["definition_id"]
        publish_response = self.client.post(
            f"/home-view-definitions/{personal_definition_id}/publish",
            json={"name": "Validated Desk HH NG", "scope": "ORGANIZATION"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(publish_response.status_code, 201)
        shared_definition_id = publish_response.json()["definition_id"]

        with self.SessionLocal() as session:
            price_index = session.get(ReferencePriceIndex, "HH_NATGAS")
            self.assertIsNotNone(price_index)
            price_index.is_active = False
            replacement_price_index = session.get(ReferencePriceIndex, "OLD_NG")
            self.assertIsNotNone(replacement_price_index)
            replacement_price_index.is_active = True
            session.commit()

        inventory_response = self.client.get(
            "/home-view-definitions/admin/inventory",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(inventory_response.status_code, 200)
        shared_inventory_record = next(
            item for item in inventory_response.json() if item["definition_id"] == shared_definition_id
        )
        self.assertTrue(shared_inventory_record["validation_warnings"])
        self.assertIn("price_index_code", shared_inventory_record["validation_warnings"][0])


if __name__ == "__main__":
    unittest.main()
