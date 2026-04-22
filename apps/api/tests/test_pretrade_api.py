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
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_unit import ReferenceUnit
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
            for table in reversed(Base.metadata.sorted_tables):
                session.execute(table.delete())
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

    def _seed_trade_reference_data(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                ReferenceBook(
                    code="GAS_PHYS",
                    name="Gas Physical",
                    description="Test gas book",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test",
                    updated_at=self.now,
                    updated_by="test",
                    version=1,
                )
            )
            session.add(
                ReferenceCommodity(
                    code="HENRY_HUB",
                    name="Henry Hub",
                    description="Gas benchmark",
                    commodity_class="NATURAL_GAS",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test",
                    updated_at=self.now,
                    updated_by="test",
                    version=1,
                )
            )
            session.add(
                ReferenceCounterparty(
                    code="SHELL_TRADING",
                    name="Shell Trading",
                    short_name=None,
                    legal_entity_name=None,
                    counterparty_type="SUPPLIER",
                    country_code=None,
                    description="Test counterparty",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test",
                    updated_at=self.now,
                    updated_by="test",
                    version=1,
                )
            )
            session.add(
                ReferencePortfolio(
                    code="PROMPT",
                    name="Prompt Gas",
                    book_code="GAS_PHYS",
                    owner=None,
                    strategy="Directional",
                    trader_persona=None,
                    risk_archetype=None,
                    description="Prompt gas portfolio",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test",
                    updated_at=self.now,
                    updated_by="test",
                    version=1,
                )
            )
            session.add(
                ReferenceUnit(
                    code="MMBTU",
                    name="MMBtu",
                    commodity_class="NATURAL_GAS",
                    dimension="VOLUME",
                    base_unit_code=None,
                    conversion_factor=None,
                    precision=3,
                    description="Gas volume",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test",
                    updated_at=self.now,
                    updated_by="test",
                    version=1,
                )
            )
            session.add(
                ReferenceCurrency(
                    code="USD",
                    name="US Dollar",
                    symbol="$",
                    description="US Dollar",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test",
                    updated_at=self.now,
                    updated_by="test",
                    version=1,
                )
            )
            session.add(
                ReferenceLocation(
                    code="HENRY_HUB",
                    name="Henry Hub",
                    location_kind="POINT",
                    location_type="HUB",
                    parent_location_code=None,
                    market="PHYSICAL",
                    city="Erath",
                    subdivision_code="LA",
                    country_code="US",
                    continent_code="NA",
                    latitude=None,
                    longitude=None,
                    region="Gulf Coast",
                    timezone="America/Chicago",
                    description="Henry Hub",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test",
                    updated_at=self.now,
                    updated_by="test",
                    version=1,
                )
            )
            session.commit()

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

    def _recommendation_input_snapshots(self) -> list[dict[str, object]]:
        return [
            {
                "source_key": "desk-context",
                "source_type": "INTERNAL",
                "freshness": "FRESH",
                "summary": "Captured matching desk exposure and active trades.",
                "payload": {
                    "related_active_trade_count": 1,
                    "current_net_position": 1000,
                    "current_counterparty_exposure": 20000,
                },
            },
            {
                "source_key": "counterparty-credit",
                "source_type": "INTERNAL",
                "freshness": "FRESH",
                "summary": "Internal credit profile is current.",
                "payload": {
                    "has_credit_profile": True,
                    "credit_limit_amount": 500000,
                    "breach_action": "WARN",
                    "credit_rating": "A",
                },
            },
            {
                "source_key": "latest-mark",
                "source_type": "EXTERNAL",
                "freshness": "FRESH",
                "summary": "Latest price-index mark was captured.",
                "payload": {"latest_mark": 2.83},
            },
            {
                "source_key": "weather-intelligence",
                "source_type": "EXTERNAL",
                "freshness": "FRESH",
                "summary": "No high-risk weather regions are present.",
                "payload": {"weather_high_risk_count": 0},
            },
        ]

    def _escalating_recommendation_input_snapshots(self) -> list[dict[str, object]]:
        snapshots = self._recommendation_input_snapshots()
        snapshots[1]["payload"] = {
            "has_credit_profile": True,
            "credit_limit_amount": 80000,
            "breach_action": "WARN",
            "credit_rating": "A",
        }
        return snapshots

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
        self.assertEqual(created_review["activity"][0]["action"], "SUBMITTED")
        self.assertEqual(created_review["activity"][0]["actor_id"], "trader_one")
        self.assertEqual(created_review["activity"][0]["comment"], "Validate weather conviction against latest marks.")
        self.assertEqual(created_review["activity"][0]["payload"]["source_scenario_id"], scenario_id)

        shared_reviews = self.client.get("/pretrade/reviews", headers=self.trader_two_headers)
        self.assertEqual(shared_reviews.status_code, 200)
        self.assertEqual(len(shared_reviews.json()), 1)
        self.assertEqual(shared_reviews.json()[0]["review_id"], created_review["review_id"])

        comment_response = self.client.post(
            f"/pretrade/reviews/{created_review['review_id']}/activity",
            json={"comment": "Risk and credit context reviewed."},
            headers=self.trader_two_headers,
        )
        self.assertEqual(comment_response.status_code, 201)
        commented_review = comment_response.json()
        self.assertEqual(commented_review["review_notes"], "Risk and credit context reviewed.")
        self.assertEqual(commented_review["activity"][-1]["action"], "COMMENTED")
        self.assertEqual(commented_review["activity"][-1]["actor_id"], "trader_two")
        self.assertEqual(commented_review["activity"][-1]["comment"], "Risk and credit context reviewed.")

        approval_without_comment_response = self.client.patch(
            f"/pretrade/reviews/{created_review['review_id']}",
            json={"review_status": "APPROVED"},
            headers=self.trader_two_headers,
        )
        self.assertEqual(approval_without_comment_response.status_code, 422)
        self.assertIn("Approval comment is required", approval_without_comment_response.json()["detail"])

        update_response = self.client.patch(
            f"/pretrade/reviews/{created_review['review_id']}",
            json={
                "review_status": "APPROVED",
                "owner": "trader_two",
                "review_notes": "Approved for capture with current sizing.",
                "activity_comment": "Approved for capture with current sizing.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(update_response.status_code, 200)
        updated_review = update_response.json()
        self.assertEqual(updated_review["review_status"], "APPROVED")
        self.assertEqual(updated_review["owner"], "trader_two")
        self.assertEqual(updated_review["updated_by"], "trader_two")
        self.assertTrue(updated_review["can_edit"])
        self.assertEqual([entry["action"] for entry in updated_review["activity"]], ["SUBMITTED", "COMMENTED", "APPROVED"])
        self.assertEqual(updated_review["activity"][-1]["actor_id"], "trader_two")
        self.assertEqual(updated_review["activity"][-1]["comment"], "Approved for capture with current sizing.")
        self.assertEqual(updated_review["activity"][-1]["payload"]["from_status"], "OPEN")
        self.assertEqual(updated_review["activity"][-1]["payload"]["to_status"], "APPROVED")

    def test_recommendation_runs_persist_inputs_scores_and_source_links(self) -> None:
        scenario_response = self.client.post(
            "/pretrade/scenarios",
            json=self._scenario_payload(),
            headers=self.trader_one_headers,
        )
        self.assertEqual(scenario_response.status_code, 201)
        scenario = scenario_response.json()

        run_response = self.client.post(
            "/pretrade/recommendations/runs",
            json={
                "name": "May gas hedge recommendation",
                "source_scenario_id": scenario["scenario_id"],
                "input_snapshots": self._recommendation_input_snapshots(),
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(run_response.status_code, 201)
        run = run_response.json()
        self.assertEqual(run["source_scenario_id"], scenario["scenario_id"])
        self.assertIsNone(run["source_review_id"])
        self.assertEqual(run["draft"]["commodity"], "HENRY_HUB")
        self.assertEqual(len(run["input_snapshots"]), 5)
        self.assertEqual(run["input_snapshots"][0]["adapter_key"], "desk-context")
        self.assertEqual(run["input_snapshots"][0]["quality_status"], "OK")
        self.assertEqual(run["input_snapshots"][0]["provenance"]["dataset"], "active-trades-and-positions")
        self.assertEqual(run["recommendation"]["stance"], "PROCEED")
        self.assertEqual(run["recommendation"]["confidence"], "HIGH")
        self.assertEqual(run["recommendation"]["score"], 100)
        self.assertEqual(run["recommendation"]["checks"][0]["key"], "source-quality")
        self.assertEqual(run["recommendation"]["checks"][0]["status"], "good")
        self.assertEqual(run["recommendation"]["estimated_notional"], 71000)
        self.assertEqual(run["recommendation"]["related_active_trade_count"], 1)
        self.assertTrue(run["run_key"])

        adapters_response = self.client.get(
            "/pretrade/recommendations/source-adapters",
            headers=self.trader_one_headers,
        )
        self.assertEqual(adapters_response.status_code, 200)
        self.assertEqual(adapters_response.json()[1]["adapter_key"], "counterparty-credit")
        self.assertTrue(adapters_response.json()[1]["required_for_recommendation"])

        list_response = self.client.get(
            f"/pretrade/recommendations/runs?source_scenario_id={scenario['scenario_id']}",
            headers=self.trader_one_headers,
        )
        self.assertEqual(list_response.status_code, 200)
        listed_runs = list_response.json()
        self.assertEqual(len(listed_runs), 1)
        self.assertEqual(listed_runs[0]["run_id"], run["run_id"])
        self.assertEqual(listed_runs[0]["input_snapshots"][1]["source_key"], "counterparty-credit")
        self.assertEqual(listed_runs[0]["input_snapshots"][3]["quality_status"], "MISSING")

        missing_scenario_response = self.client.post(
            "/pretrade/recommendations/runs",
            json={"source_scenario_id": scenario["scenario_id"], "input_snapshots": []},
            headers=self.trader_two_headers,
        )
        self.assertEqual(missing_scenario_response.status_code, 404)

    def test_trade_creation_links_approved_review_and_prevents_duplicate_booking(self) -> None:
        self._seed_trade_reference_data()

        scenario_response = self.client.post(
            "/pretrade/scenarios",
            json=self._scenario_payload(),
            headers=self.trader_one_headers,
        )
        self.assertEqual(scenario_response.status_code, 201)
        scenario_id = scenario_response.json()["scenario_id"]

        recommendation_response = self.client.post(
            "/pretrade/recommendations/runs",
            json={
                "name": "May gas hedge recommendation",
                "source_scenario_id": scenario_id,
                "input_snapshots": self._escalating_recommendation_input_snapshots(),
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(recommendation_response.status_code, 201)
        recommendation_run_id = recommendation_response.json()["run_id"]
        self.assertEqual(recommendation_response.json()["recommendation"]["stance"], "ESCALATE")

        review_response = self.client.post(
            "/pretrade/reviews",
            json={
                "name": "May gas hedge review",
                "thesis": "Queue for desk review before capture.",
                "source_scenario_id": scenario_id,
                "recommendation_run_id": recommendation_run_id,
                "review_notes": "Approved flow test.",
                "draft": self._scenario_payload()["draft"],
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(review_response.status_code, 201)
        review_payload = review_response.json()
        review_id = review_payload["review_id"]
        self.assertEqual(review_payload["recommendation_run_id"], recommendation_run_id)
        self.assertEqual(review_payload["recommendation_summary"]["run_id"], recommendation_run_id)
        self.assertEqual(review_payload["recommendation_summary"]["stance"], "ESCALATE")
        self.assertEqual(review_payload["recommendation_summary"]["input_snapshot_count"], 5)

        visible_attached_run = self.client.get(
            f"/pretrade/recommendations/runs/{recommendation_run_id}",
            headers=self.trader_two_headers,
        )
        self.assertEqual(visible_attached_run.status_code, 200)
        self.assertEqual(visible_attached_run.json()["input_snapshots"][0]["source_key"], "desk-context")

        blocked_response = self.client.post(
            "/events",
            json={
                "aggregate_type": "trade",
                "aggregate_id": "TRD-21001",
                "event_type": "TradeCreated",
                "occurred_at": self.now.isoformat(),
                "payload": {
                    "book": "GAS_PHYS",
                    "commodity_class": "NATURAL_GAS",
                    "commodity": "HENRY_HUB",
                    "pricing_type": "FIXED",
                    "trade_side": "BUY",
                    "trade_nature": "PHYSICAL",
                    "trade_structure": "SINGLE",
                    "portfolio": "PROMPT",
                    "counterparty": "SHELL_TRADING",
                    "trade_currency_code": "USD",
                    "price_unit_code": "MMBTU",
                    "unit_of_measure": "MMBTU",
                    "location_code": "HENRY_HUB",
                    "trade_date": "2026-05-01",
                    "delivery_start": "2026-05-01",
                    "delivery_end": "2026-05-31",
                    "price": 2.84,
                    "volume": 25000,
                    "pretrade_review_id": review_id,
                },
                "schema_version": 4,
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(blocked_response.status_code, 409)
        self.assertIn("must be approved", blocked_response.json()["detail"])

        risky_approval_response = self.client.patch(
            f"/pretrade/reviews/{review_id}",
            json={
                "review_status": "APPROVED",
                "activity_comment": "Approved for booking after desk review.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(risky_approval_response.status_code, 422)
        self.assertIn("override reason is required", risky_approval_response.json()["detail"])

        approve_response = self.client.patch(
            f"/pretrade/reviews/{review_id}",
            json={
                "review_status": "APPROVED",
                "activity_comment": "Approved for booking after desk review.",
                "recommendation_override_reason": "Credit approved the temporary utilization overage.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(approve_response.status_code, 200)
        approved_payload = approve_response.json()
        self.assertEqual(approved_payload["activity"][-1]["action"], "APPROVED")
        self.assertEqual(approved_payload["recommendation_override_reason"], "Credit approved the temporary utilization overage.")
        self.assertEqual(approved_payload["recommendation_override_by"], "trader_two")
        self.assertIsNotNone(approved_payload["recommendation_override_at"])
        self.assertEqual(approved_payload["activity"][-1]["payload"]["recommendation_stance"], "ESCALATE")
        self.assertEqual(
            approved_payload["activity"][-1]["payload"]["recommendation_override_reason"],
            "Credit approved the temporary utilization overage.",
        )

        create_response = self.client.post(
            "/events",
            json={
                "aggregate_type": "trade",
                "aggregate_id": "TRD-21001",
                "event_type": "TradeCreated",
                "occurred_at": self.now.isoformat(),
                "payload": {
                    "book": "GAS_PHYS",
                    "commodity_class": "NATURAL_GAS",
                    "commodity": "HENRY_HUB",
                    "pricing_type": "FIXED",
                    "trade_side": "BUY",
                    "trade_nature": "PHYSICAL",
                    "trade_structure": "SINGLE",
                    "portfolio": "PROMPT",
                    "counterparty": "SHELL_TRADING",
                    "trade_currency_code": "USD",
                    "price_unit_code": "MMBTU",
                    "unit_of_measure": "MMBTU",
                    "location_code": "HENRY_HUB",
                    "trade_date": "2026-05-01",
                    "delivery_start": "2026-05-01",
                    "delivery_end": "2026-05-31",
                    "price": 2.84,
                    "volume": 25000,
                    "pretrade_review_id": review_id,
                },
                "schema_version": 4,
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(create_response.status_code, 201)

        linked_review = self.client.get(
            f"/pretrade/reviews/{review_id}",
            headers=self.trader_two_headers,
        )
        self.assertEqual(linked_review.status_code, 200)
        linked_payload = linked_review.json()
        self.assertEqual(linked_payload["linked_trade_id"], "TRD-21001")
        self.assertEqual(linked_payload["linked_trade_status"], "ACTIVE")
        self.assertEqual(linked_payload["booked_by"], "trader_one")
        self.assertIsNotNone(linked_payload["booked_at"])
        self.assertEqual(linked_payload["recommendation_run_id"], recommendation_run_id)
        self.assertEqual(linked_payload["recommendation_summary"]["score"], 70)
        self.assertEqual(linked_payload["recommendation_override_reason"], "Credit approved the temporary utilization overage.")
        self.assertEqual([entry["action"] for entry in linked_payload["activity"]], ["SUBMITTED", "APPROVED", "BOOKED"])
        self.assertEqual(linked_payload["activity"][-1]["actor_id"], "trader_one")
        self.assertEqual(linked_payload["activity"][-1]["payload"]["linked_trade_id"], "TRD-21001")
        self.assertEqual(linked_payload["activity"][-1]["payload"]["recommendation_run_id"], recommendation_run_id)
        self.assertEqual(
            linked_payload["activity"][-1]["payload"]["recommendation_override_reason"],
            "Credit approved the temporary utilization overage.",
        )
        self.assertEqual(linked_payload["activity"][-1]["payload"]["recommendation_override_by"], "trader_two")
        self.assertIsNotNone(linked_payload["activity"][-1]["payload"]["recommendation_override_at"])

        booked_status_update = self.client.patch(
            f"/pretrade/reviews/{review_id}",
            json={"review_status": "REJECTED"},
            headers=self.trader_two_headers,
        )
        self.assertEqual(booked_status_update.status_code, 409)
        self.assertIn("can no longer change approval status", booked_status_update.json()["detail"])

        duplicate_response = self.client.post(
            "/events",
            json={
                "aggregate_type": "trade",
                "aggregate_id": "TRD-21002",
                "event_type": "TradeCreated",
                "occurred_at": self.now.isoformat(),
                "payload": {
                    "book": "GAS_PHYS",
                    "commodity_class": "NATURAL_GAS",
                    "commodity": "HENRY_HUB",
                    "pricing_type": "FIXED",
                    "trade_side": "BUY",
                    "trade_nature": "PHYSICAL",
                    "trade_structure": "SINGLE",
                    "portfolio": "PROMPT",
                    "counterparty": "SHELL_TRADING",
                    "trade_currency_code": "USD",
                    "price_unit_code": "MMBTU",
                    "unit_of_measure": "MMBTU",
                    "location_code": "HENRY_HUB",
                    "trade_date": "2026-05-01",
                    "delivery_start": "2026-05-01",
                    "delivery_end": "2026-05-31",
                    "price": 2.9,
                    "volume": 15000,
                    "pretrade_review_id": review_id,
                },
                "schema_version": 4,
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(duplicate_response.status_code, 409)
        self.assertIn("already linked", duplicate_response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
