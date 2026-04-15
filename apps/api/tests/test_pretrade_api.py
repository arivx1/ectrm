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

from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class PreTradeApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 15, 14, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(ReportPreset).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()

        self.trader_one_token = self._create_user_session(
            user_id="trader_one",
            email="trader.one@example.com",
            display_name="Trader One",
        )
        self.trader_two_token = self._create_user_session(
            user_id="trader_two",
            email="trader.two@example.com",
            display_name="Trader Two",
        )
        self.trader_one_headers = {"Authorization": f"Bearer {self.trader_one_token}"}
        self.trader_two_headers = {"Authorization": f"Bearer {self.trader_two_token}"}

    def _create_user_session(
        self,
        *,
        user_id: str,
        email: str,
        display_name: str,
        role: str = "TRADER",
    ) -> str:
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id=user_id,
                email=email,
                display_name=display_name,
                role=role,
                password_hash=hash_password("supersecret1"),
                is_active=True,
                last_login_at=self.now,
                created_at=self.now,
                created_by="test",
                updated_at=self.now,
                updated_by="test",
                version=1,
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            _, token = create_user_session(session, user)
            return token

    def _scenario_payload(self) -> dict[str, object]:
        return {
            "name": "May gas hedge",
            "thesis": "Weather and macro backdrop support a cautious long setup.",
            "draft": {
                "book": "GAS_PHYS",
                "portfolio": "PROMPT",
                "counterparty": "SHELL_TRADING",
                "commodity_class": "NATURAL_GAS",
                "commodity": "HENRY_HUB",
                "trade_side": "BUY",
                "pricing_type": "FLOATING",
                "price_index_code": "NG_HH_PROMPT",
                "target_price": 2.84,
                "target_volume": 25000,
                "trade_currency_code": "USD",
                "unit_of_measure": "MMBTU",
                "price_unit_code": "MMBTU",
                "location_code": "HENRY_HUB",
                "delivery_start": "2026-05-01",
                "delivery_end": "2026-05-31",
            },
        }

    def test_scenarios_require_authentication(self) -> None:
        response = self.client.get("/pretrade/scenarios")
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/pretrade/scenarios", json=self._scenario_payload())
        self.assertEqual(response.status_code, 401)

    def test_scenarios_are_personal_and_support_crud(self) -> None:
        create_response = self.client.post(
            "/pretrade/scenarios",
            json=self._scenario_payload(),
            headers=self.trader_one_headers,
        )
        self.assertEqual(create_response.status_code, 201)
        created = create_response.json()
        self.assertEqual(created["name"], "May gas hedge")
        self.assertEqual(created["draft"]["commodity"], "HENRY_HUB")
        self.assertTrue(created["can_edit"])

        trader_one_list = self.client.get("/pretrade/scenarios", headers=self.trader_one_headers)
        self.assertEqual(trader_one_list.status_code, 200)
        self.assertEqual(len(trader_one_list.json()), 1)

        trader_two_list = self.client.get("/pretrade/scenarios", headers=self.trader_two_headers)
        self.assertEqual(trader_two_list.status_code, 200)
        self.assertEqual(trader_two_list.json(), [])

        scenario_id = created["scenario_id"]
        update_response = self.client.patch(
            f"/pretrade/scenarios/{scenario_id}",
            json={"name": "May gas hedge v2", "thesis": "Desk still likes the setup with tighter credit controls."},
            headers=self.trader_one_headers,
        )
        self.assertEqual(update_response.status_code, 200)
        updated = update_response.json()
        self.assertEqual(updated["name"], "May gas hedge v2")
        self.assertEqual(updated["version"], 2)
        self.assertEqual(updated["updated_by"], "trader_one")

        delete_response = self.client.delete(
            f"/pretrade/scenarios/{scenario_id}",
            headers=self.trader_one_headers,
        )
        self.assertEqual(delete_response.status_code, 204)

        list_after_delete = self.client.get("/pretrade/scenarios", headers=self.trader_one_headers)
        self.assertEqual(list_after_delete.status_code, 200)
        self.assertEqual(list_after_delete.json(), [])

    def test_reviews_are_shared_and_support_collaborative_status_updates(self) -> None:
        scenario_response = self.client.post(
            "/pretrade/scenarios",
            json=self._scenario_payload(),
            headers=self.trader_one_headers,
        )
        self.assertEqual(scenario_response.status_code, 201)
        scenario_id = scenario_response.json()["scenario_id"]

        review_response = self.client.post(
            "/pretrade/reviews",
            json={
                "name": "May gas hedge review",
                "thesis": "Queue for desk review before capture.",
                "source_scenario_id": scenario_id,
                "owner": "gas.desk",
                "review_notes": "Validate weather conviction against latest marks.",
                "draft": self._scenario_payload()["draft"],
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(review_response.status_code, 201)
        created_review = review_response.json()
        self.assertEqual(created_review["review_status"], "OPEN")
        self.assertEqual(created_review["source_scenario_id"], scenario_id)
        self.assertEqual(created_review["created_by"], "trader_one")

        shared_reviews = self.client.get("/pretrade/reviews", headers=self.trader_two_headers)
        self.assertEqual(shared_reviews.status_code, 200)
        self.assertEqual(len(shared_reviews.json()), 1)
        self.assertEqual(shared_reviews.json()[0]["review_id"], created_review["review_id"])

        update_response = self.client.patch(
            f"/pretrade/reviews/{created_review['review_id']}",
            json={
                "review_status": "APPROVED",
                "owner": "trader_two",
                "review_notes": "Approved for capture with current sizing.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(update_response.status_code, 200)
        updated_review = update_response.json()
        self.assertEqual(updated_review["review_status"], "APPROVED")
        self.assertEqual(updated_review["owner"], "trader_two")
        self.assertEqual(updated_review["updated_by"], "trader_two")
        self.assertTrue(updated_review["can_edit"])


if __name__ == "__main__":
    unittest.main()
