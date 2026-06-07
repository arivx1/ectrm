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
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_credit_profile import ReferenceCounterpartyCreditProfile
from apps.api.app.models.reference_counterparty_external_credit_snapshot import (
    ReferenceCounterpartyExternalCreditSnapshot,
)
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
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

    def _scenario_enrichment_payload(self) -> dict[str, object]:
        return {
            "opportunity_category": "RISK_REDUCTION",
            "hedge_intent": "SWAP",
            "residual_exposure_summary": "Residual exposure falls inside desk appetite.",
            "source_freshness_summary": "All 6 source snapshots were OK at capture.",
            "reviewer_focus": ["Confirm target price against the latest mark."],
            "recommendation_run_id": None,
            "recommendation_run_key": None,
            "recommendation_stance": "PROCEED",
            "recommendation_score": 96,
            "recommendation_headline": "Proceed with standard controls.",
            "captured_at": self.now.isoformat(),
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

    def _stale_recommendation_input_snapshots(self) -> list[dict[str, object]]:
        snapshots = self._escalating_recommendation_input_snapshots()
        snapshots[2]["freshness"] = "STALE"
        snapshots[2]["summary"] = "Latest price-index mark is stale and needs refresh."
        snapshots[2]["payload"] = {"latest_mark": 2.91}
        return snapshots

    def _seed_live_recommendation_context(self) -> None:
        seed_now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ExternalDataRun(
                    id=1,
                    provider="ICE",
                    job_name="sync_price_marks",
                    status="SUCCEEDED",
                    started_at=seed_now,
                    finished_at=seed_now,
                    requested_by="seed",
                    series_count=1,
                    observation_count=1,
                    error_summary=None,
                    created_at=seed_now,
                )
            )
            session.add(
                Trade(
                    trade_id="TRD-LIVE-1",
                    originating_option_trade_id=None,
                    external_trade_id=None,
                    source_system="seed",
                    created_at=seed_now,
                    updated_at=seed_now,
                    execution_timestamp=seed_now,
                    trade_date=seed_now.date(),
                    effective_start_date=None,
                    effective_end_date=None,
                    quality_spec=None,
                    unit_of_measure="MMBTU",
                    trade_currency_code="USD",
                    location_code="HENRY_HUB",
                    delivery_start=seed_now.date(),
                    delivery_end=seed_now.date(),
                    price_unit_code="MMBTU",
                    instrument_type="LINEAR",
                    option_type=None,
                    option_style=None,
                    option_strike_price=None,
                    option_expiration_date=None,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="GAS_PHYS",
                    portfolio="PROMPT",
                    counterparty="SHELL_TRADING",
                    commodity_class="NATURAL_GAS",
                    commodity="HENRY_HUB",
                    pricing_type="FLOATING",
                    pricing_status="PENDING",
                    confirmation_status="PENDING",
                    nomination_status="PENDING",
                    allocation_status="PENDING",
                    actualization_status="PENDING",
                    price_index_code="NG_HH_PROMPT",
                    price=2.8,
                    volume=10000,
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    trader_user="trader_one",
                    status="ACTIVE",
                    last_event_id="evt-live-1",
                )
            )
            session.add(
                Position(
                    commodity="HENRY_HUB",
                    net_volume=1000,
                    updated_at=seed_now,
                )
            )
            session.add(
                ReferenceCounterpartyCreditProfile(
                    counterparty_code="SHELL_TRADING",
                    credit_rating="A",
                    review_due_at=seed_now.date(),
                    limit_currency_code="USD",
                    limit_amount=500000,
                    breach_action="WARN",
                    notes=None,
                    created_at=seed_now,
                    created_by="seed",
                    updated_at=seed_now,
                    updated_by="seed",
                    version=1,
                )
            )
            session.add(
                ReferenceCounterpartyExternalCreditSnapshot(
                    counterparty_code="SHELL_TRADING",
                    provider="S&P",
                    source_entity_id="shell-trading",
                    source_entity_name="Shell Trading",
                    match_basis=None,
                    matched_identifier_value=None,
                    as_of_date=seed_now.date(),
                    rating_scale="issuer",
                    rating_value="A-",
                    rating_outlook="Stable",
                    credit_score=None,
                    probability_of_default=None,
                    recommended_limit_currency_code="USD",
                    recommended_limit_amount=450000,
                    commentary=None,
                    downloaded_at=seed_now,
                    run_id=1,
                    raw_payload={},
                    created_at=seed_now,
                    updated_at=seed_now,
                    version=1,
                )
            )
            session.add(
                PriceIndexObservation(
                    price_index_code="NG_HH_PROMPT",
                    observation_date=seed_now.date(),
                    value=2.83,
                    unit_code="MMBTU",
                    currency_code="USD",
                    source_provider="ICE",
                    source_series_id="NG_HH_PROMPT",
                    source_frequency="DAILY",
                    source_published_at=seed_now,
                    source_revision=None,
                    downloaded_at=seed_now,
                    run_id=1,
                    raw_payload={},
                    created_at=seed_now,
                    updated_at=seed_now,
                )
            )
            session.add(
                OptionExposure(
                    trade_id="OPT-1",
                    book="GAS_PHYS",
                    portfolio="PROMPT",
                    counterparty="SHELL_TRADING",
                    commodity_class="NATURAL_GAS",
                    commodity="HENRY_HUB",
                    trade_side="BUY",
                    option_type="CALL",
                    option_style="EUROPEAN",
                    option_strike_price=3.0,
                    option_expiration_date=seed_now.date(),
                    contract_volume=5000,
                    premium_price=0.1,
                    premium_cashflow=500,
                    underlying_equivalent_volume=4000,
                    trade_currency_code="USD",
                    price_unit_code="MMBTU",
                    updated_at=seed_now,
                )
            )
            session.commit()

    def test_scenarios_require_authentication(self) -> None:
        response = self.client.get("/pretrade/scenarios")
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/pretrade/governance/summary")
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/pretrade/governance/items")
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/pretrade/governance/export")
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/pretrade/promotion-outcomes")
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/pretrade/netting-sets")
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/pretrade/netting-sets/from-promotion", json={})
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/pretrade/hedge-recommendations")
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/pretrade/hedge-recommendations/from-promotion", json={})
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/pretrade/risk-scenarios")
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/pretrade/risk-scenarios/from-promotion", json={})
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/pretrade/market-opportunities")
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/pretrade/market-opportunities/from-promotion", json={})
        self.assertEqual(response.status_code, 401)

        response = self.client.get("/pretrade/reviews/1/drift")
        self.assertEqual(response.status_code, 401)

        response = self.client.post("/pretrade/scenarios", json=self._scenario_payload())
        self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/pretrade/recommendations/draft-analysis",
            json={
                "draft": self._scenario_payload()["draft"],
                "input_snapshots": self._recommendation_input_snapshots(),
            },
        )
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

    def test_scenario_enrichment_is_optional_and_carries_into_reviews(self) -> None:
        legacy_response = self.client.post(
            "/pretrade/scenarios",
            json=self._scenario_payload(),
            headers=self.trader_one_headers,
        )
        self.assertEqual(legacy_response.status_code, 201)
        self.assertIsNone(legacy_response.json()["enrichment"])

        enriched_payload = {
            **self._scenario_payload(),
            "name": "May gas hedge enriched",
            "enrichment": self._scenario_enrichment_payload(),
        }
        create_response = self.client.post(
            "/pretrade/scenarios",
            json=enriched_payload,
            headers=self.trader_one_headers,
        )
        self.assertEqual(create_response.status_code, 201)
        created = create_response.json()
        self.assertEqual(created["enrichment"]["opportunity_category"], "RISK_REDUCTION")
        self.assertEqual(created["enrichment"]["hedge_intent"], "SWAP")

        scenario_id = created["scenario_id"]
        update_response = self.client.patch(
            f"/pretrade/scenarios/{scenario_id}",
            json={
                "enrichment": {
                    **self._scenario_enrichment_payload(),
                    "opportunity_category": "WAIT_FOR_DATA",
                    "reviewer_focus": ["Refresh the latest mark before capture."],
                }
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(update_response.status_code, 200)
        updated = update_response.json()
        self.assertEqual(updated["enrichment"]["opportunity_category"], "WAIT_FOR_DATA")
        self.assertEqual(updated["enrichment"]["reviewer_focus"], ["Refresh the latest mark before capture."])

        review_response = self.client.post(
            "/pretrade/reviews",
            json={
                "name": "May gas hedge enriched review",
                "thesis": "Queue enriched context for desk review.",
                "source_scenario_id": scenario_id,
                "review_notes": "Review copied enrichment.",
                "draft": self._scenario_payload()["draft"],
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(review_response.status_code, 201)
        review = review_response.json()
        self.assertEqual(review["source_scenario_id"], scenario_id)
        self.assertEqual(review["enrichment"]["opportunity_category"], "WAIT_FOR_DATA")
        self.assertEqual(review["enrichment"]["reviewer_focus"], ["Refresh the latest mark before capture."])

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
        self.assertEqual(
            updated_review["activity"][-1]["payload"]["governance_snapshot_format_version"],
            "pretrade-governance-audit.v1",
        )
        self.assertIsNotNone(updated_review["approval_governance_snapshot"])
        self.assertIsNone(updated_review["booking_governance_snapshot"])
        self.assertEqual(updated_review["approval_governance_snapshot"]["exported_by"], "trader_two")
        self.assertEqual(updated_review["approval_governance_snapshot"]["summary"]["approved_review_count"], 1)
        self.assertEqual(updated_review["approval_governance_snapshot"]["summary"]["pending_review_count"], 0)
        self.assertEqual(updated_review["approval_governance_snapshot"]["audit_rows"], [])

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
        self.assertEqual(len(run["input_snapshots"]), 6)
        self.assertEqual(run["input_snapshots"][0]["adapter_key"], "desk-context")
        self.assertEqual(run["input_snapshots"][0]["quality_status"], "OK")
        self.assertEqual(run["input_snapshots"][0]["provenance"]["dataset"], "active-trades-and-positions")
        self.assertEqual(run["recommendation"]["stance"], "PROCEED")
        self.assertEqual(run["recommendation"]["confidence"], "HIGH")
        self.assertEqual(run["recommendation"]["score"], 100)
        self.assertEqual(run["recommendation"]["checks"][0]["key"], "source-quality")
        self.assertEqual(run["recommendation"]["checks"][0]["status"], "good")
        self.assertIn("Proceed is supported", run["recommendation"]["explanation"]["stance_rationale"])
        self.assertIn("Required source adapters", run["recommendation"]["explanation"]["source_quality_rationale"])
        self.assertEqual(run["recommendation"]["estimated_notional"], 71000)
        self.assertEqual(run["recommendation"]["related_active_trade_count"], 1)
        self.assertEqual(run["recommendation"]["opportunity_summary"]["category"], "RISK_INCREASE")
        self.assertEqual(run["recommendation"]["residual_exposure"]["exposure_effect"], "DEEPENS")
        self.assertEqual(run["recommendation"]["residual_exposure"]["residual_after_trade"], 26000)
        self.assertEqual(run["recommendation"]["netting_candidates"][0]["match_quality"], "REJECTED")
        self.assertEqual(run["recommendation"]["hedge_recommendation"]["instrument_type"], "SWAP")
        self.assertTrue(
            any(item["evidence_key"] == "option-exposure" for item in run["recommendation"]["missing_evidence"])
        )
        self.assertTrue(run["run_key"])

        adapters_response = self.client.get(
            "/pretrade/recommendations/source-adapters",
            headers=self.trader_one_headers,
        )
        self.assertEqual(adapters_response.status_code, 200)
        self.assertEqual(adapters_response.json()[1]["adapter_key"], "counterparty-credit")
        self.assertTrue(adapters_response.json()[1]["required_for_recommendation"])

        changed_snapshots = self._escalating_recommendation_input_snapshots()
        changed_snapshots[2]["freshness"] = "STALE"
        changed_snapshots[2]["payload"] = {"latest_mark": 2.2}
        second_run_response = self.client.post(
            "/pretrade/recommendations/runs",
            json={
                "name": "May gas hedge recommendation refresh",
                "source_scenario_id": scenario["scenario_id"],
                "input_snapshots": changed_snapshots,
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(second_run_response.status_code, 201)
        second_run = second_run_response.json()
        self.assertEqual(second_run["recommendation"]["stance"], "ESCALATE")

        list_response = self.client.get(
            f"/pretrade/recommendations/runs?source_scenario_id={scenario['scenario_id']}",
            headers=self.trader_one_headers,
        )
        self.assertEqual(list_response.status_code, 200)
        listed_runs = list_response.json()
        self.assertEqual(len(listed_runs), 2)
        self.assertEqual(listed_runs[0]["run_id"], second_run["run_id"])
        self.assertEqual(listed_runs[1]["run_id"], run["run_id"])
        comparison = listed_runs[0]["comparison"]
        self.assertEqual(comparison["previous_run_id"], run["run_id"])
        self.assertTrue(comparison["stance_changed"])
        self.assertEqual(comparison["previous_stance"], "PROCEED")
        self.assertLess(comparison["score_delta"], 0)
        self.assertTrue(any("Projected credit utilization" in driver for driver in comparison["added_primary_drivers"]))
        self.assertTrue(any(change["adapter_key"] == "latest-mark" for change in comparison["source_quality_changes"]))
        self.assertTrue(any(change["adapter_key"] == "counterparty-credit" for change in comparison["input_snapshot_changes"]))
        self.assertIn("Stance changed", comparison["summary"])
        self.assertEqual(listed_runs[1]["input_snapshots"][1]["source_key"], "counterparty-credit")
        self.assertEqual(listed_runs[1]["input_snapshots"][3]["quality_status"], "MISSING")

        refreshed_run_response = self.client.get(
            f"/pretrade/recommendations/runs/{second_run['run_id']}",
            headers=self.trader_one_headers,
        )
        self.assertEqual(refreshed_run_response.status_code, 200)
        self.assertEqual(refreshed_run_response.json()["comparison"]["previous_run_id"], run["run_id"])

        governance_response = self.client.get(
            "/pretrade/governance/summary",
            headers=self.trader_one_headers,
        )
        self.assertEqual(governance_response.status_code, 200)
        governance = governance_response.json()
        self.assertEqual(governance["pending_review_count"], 0)
        self.assertEqual(governance["recommendation_run_count"], 1)
        self.assertEqual(governance["stale_evidence_run_count"], 1)
        self.assertEqual(governance["stale_evidence_source_count"], 1)

        governance_items_response = self.client.get(
            "/pretrade/governance/items",
            headers=self.trader_one_headers,
        )
        self.assertEqual(governance_items_response.status_code, 200)
        governance_items = governance_items_response.json()
        self.assertEqual(governance_items["pending_reviews"], [])
        self.assertEqual(len(governance_items["stale_evidence_runs"]), 1)
        self.assertEqual(governance_items["stale_evidence_runs"][0]["run"]["run_id"], second_run["run_id"])
        self.assertEqual(
            [snapshot["adapter_key"] for snapshot in governance_items["stale_evidence_runs"][0]["impaired_snapshots"]],
            ["latest-mark"],
        )

        governance_export_response = self.client.get(
            "/pretrade/governance/export",
            headers=self.trader_one_headers,
        )
        self.assertEqual(governance_export_response.status_code, 200)
        governance_export = governance_export_response.json()
        self.assertEqual(governance_export["exported_by"], "trader_one")
        self.assertEqual(governance_export["format_version"], "pretrade-governance-audit.v1")
        self.assertEqual(governance_export["summary"]["stale_evidence_run_count"], 1)
        self.assertTrue(
            any(
                row["category"] == "STALE_EVIDENCE" and row["source_adapter_key"] == "latest-mark"
                for row in governance_export["audit_rows"]
            )
        )

        missing_scenario_response = self.client.post(
            "/pretrade/recommendations/runs",
            json={"source_scenario_id": scenario["scenario_id"], "input_snapshots": []},
            headers=self.trader_two_headers,
        )
        self.assertEqual(missing_scenario_response.status_code, 404)

    def test_governance_promotion_signals_track_reviewer_reuse(self) -> None:
        scenario_payload = self._scenario_payload()
        scenario_payload["name"] = "May gas offset"
        scenario_payload["draft"] = {
            **scenario_payload["draft"],  # type: ignore[arg-type]
            "trade_side": "SELL",
            "target_volume": 1000,
        }
        scenario_response = self.client.post(
            "/pretrade/scenarios",
            json=scenario_payload,
            headers=self.trader_one_headers,
        )
        self.assertEqual(scenario_response.status_code, 201)
        scenario_id = scenario_response.json()["scenario_id"]

        recommendation_response = self.client.post(
            "/pretrade/recommendations/runs",
            json={
                "name": "Offset recommendation",
                "source_scenario_id": scenario_id,
                "input_snapshots": self._recommendation_input_snapshots(),
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(recommendation_response.status_code, 201)
        recommendation_run = recommendation_response.json()
        self.assertEqual(recommendation_run["recommendation"]["netting_candidates"][0]["match_quality"], "EXACT")

        review_response = self.client.post(
            "/pretrade/reviews",
            json={
                "name": "Risk triage offset review",
                "thesis": "Queue exact offset for the next durable scenario review.",
                "source_scenario_id": scenario_id,
                "recommendation_run_id": recommendation_run["run_id"],
                "review_notes": "Risk workspace triage: exact current-position offset for governance reuse.",
                "draft": scenario_payload["draft"],
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(review_response.status_code, 201)
        review_id = review_response.json()["review_id"]

        approve_response = self.client.patch(
            f"/pretrade/reviews/{review_id}",
            json={
                "review_status": "APPROVED",
                "activity_comment": "Approved exact offset pattern for reuse tracking.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(approve_response.status_code, 200)

        governance_response = self.client.get(
            "/pretrade/governance/summary",
            headers=self.trader_two_headers,
        )
        self.assertEqual(governance_response.status_code, 200)
        governance = governance_response.json()
        self.assertEqual(governance["promotion_candidate_count"], 2)
        self.assertEqual(governance["top_promotion_candidate_type"], "NETTING_SET")

        governance_items_response = self.client.get(
            "/pretrade/governance/items",
            headers=self.trader_two_headers,
        )
        self.assertEqual(governance_items_response.status_code, 200)
        governance_items = governance_items_response.json()
        candidates = {
            candidate["candidate_type"]: candidate
            for candidate in governance_items["promotion_candidates"]
        }
        self.assertEqual(set(candidates), {"NETTING_SET", "RISK_SCENARIO"})
        self.assertEqual(candidates["NETTING_SET"]["approved_review_count"], 1)
        self.assertEqual(candidates["NETTING_SET"]["latest_review_id"], review_id)
        self.assertEqual(candidates["NETTING_SET"]["latest_run_id"], recommendation_run["run_id"])
        self.assertNotIn(
            "Only partial netting evidence is visible; define matching tolerances before creating a durable netting set.",
            candidates["NETTING_SET"]["stop_reasons"],
        )
        self.assertEqual(candidates["RISK_SCENARIO"]["sample_review_ids"], [review_id])

        risk_list_before_response = self.client.get(
            "/pretrade/risk-scenarios",
            headers=self.trader_two_headers,
        )
        self.assertEqual(risk_list_before_response.status_code, 200)
        self.assertEqual(risk_list_before_response.json(), [])

        list_before_response = self.client.get(
            "/pretrade/netting-sets",
            headers=self.trader_two_headers,
        )
        self.assertEqual(list_before_response.status_code, 200)
        self.assertEqual(list_before_response.json(), [])

        promote_response = self.client.post(
            "/pretrade/netting-sets/from-promotion",
            json={
                "owner": "risk.owner",
                "review_note": "Owner review requested from exact offset promotion signal.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(promote_response.status_code, 201)
        netting_set = promote_response.json()
        self.assertEqual(netting_set["status"], "REVIEW_DRAFT")
        self.assertEqual(netting_set["owner"], "risk.owner")
        self.assertEqual(netting_set["source_promotion_candidate_type"], "NETTING_SET")
        self.assertEqual(netting_set["source_latest_review_id"], review_id)
        self.assertEqual(netting_set["source_latest_run_id"], recommendation_run["run_id"])
        self.assertEqual(netting_set["source_promotion_score"], candidates["NETTING_SET"]["score"])
        self.assertEqual(netting_set["draft"]["trade_side"], "SELL")
        self.assertEqual(netting_set["netting_candidates"][0]["match_quality"], "EXACT")
        self.assertIn("No booked trade has reused this pattern yet.", netting_set["source_stop_reasons"])

        duplicate_promote_response = self.client.post(
            "/pretrade/netting-sets/from-promotion",
            json={},
            headers=self.trader_two_headers,
        )
        self.assertEqual(duplicate_promote_response.status_code, 201)
        self.assertEqual(duplicate_promote_response.json()["netting_set_id"], netting_set["netting_set_id"])

        list_after_response = self.client.get(
            "/pretrade/netting-sets",
            headers=self.trader_one_headers,
        )
        self.assertEqual(list_after_response.status_code, 200)
        self.assertEqual(len(list_after_response.json()), 1)
        self.assertEqual(list_after_response.json()[0]["netting_set_id"], netting_set["netting_set_id"])

        risk_promote_response = self.client.post(
            "/pretrade/risk-scenarios/from-promotion",
            json={
                "owner": "risk.owner",
                "review_note": "Owner review requested from Risk triage promotion signal.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(risk_promote_response.status_code, 201)
        risk_scenario = risk_promote_response.json()
        self.assertEqual(risk_scenario["status"], "REVIEW_DRAFT")
        self.assertEqual(risk_scenario["owner"], "risk.owner")
        self.assertEqual(risk_scenario["source_promotion_candidate_type"], "RISK_SCENARIO")
        self.assertEqual(risk_scenario["source_latest_review_id"], review_id)
        self.assertEqual(risk_scenario["source_latest_run_id"], recommendation_run["run_id"])
        self.assertEqual(risk_scenario["source_promotion_score"], candidates["RISK_SCENARIO"]["score"])
        self.assertEqual(risk_scenario["source_review_name"], "Risk triage offset review")
        self.assertEqual(risk_scenario["source_review_status"], "APPROVED")
        self.assertEqual(risk_scenario["draft"]["trade_side"], "SELL")
        self.assertEqual(risk_scenario["source_recommendation_stance"], "PROCEED")
        self.assertEqual(risk_scenario["source_recommendation_score"], recommendation_run["recommendation"]["score"])
        self.assertEqual(risk_scenario["residual_exposure"]["exposure_effect"], "OFFSETS")
        self.assertGreater(len(risk_scenario["input_snapshots"]), 0)
        self.assertIn("No booked trade has reused this pattern yet.", risk_scenario["source_stop_reasons"])

        duplicate_risk_promote_response = self.client.post(
            "/pretrade/risk-scenarios/from-promotion",
            json={},
            headers=self.trader_two_headers,
        )
        self.assertEqual(duplicate_risk_promote_response.status_code, 201)
        self.assertEqual(
            duplicate_risk_promote_response.json()["risk_scenario_id"],
            risk_scenario["risk_scenario_id"],
        )

        risk_list_after_response = self.client.get(
            "/pretrade/risk-scenarios",
            headers=self.trader_one_headers,
        )
        self.assertEqual(risk_list_after_response.status_code, 200)
        self.assertEqual(len(risk_list_after_response.json()), 1)
        self.assertEqual(
            risk_list_after_response.json()[0]["risk_scenario_id"],
            risk_scenario["risk_scenario_id"],
        )

        governance_export_response = self.client.get(
            "/pretrade/governance/export",
            headers=self.trader_two_headers,
        )
        self.assertEqual(governance_export_response.status_code, 200)
        governance_export = governance_export_response.json()
        self.assertTrue(
            any(
                row["category"] == "PROMOTION_CANDIDATE"
                and row["promotion_candidate_type"] == "NETTING_SET"
                and row["promotion_status"] == "WATCH"
                for row in governance_export["audit_rows"]
            )
        )

    def test_promotion_outcomes_summarize_promoted_draft_results(self) -> None:
        with self.SessionLocal() as session:
            booked_review = ReportPreset(
                preset_key="pretrade_review",
                scope="SHARED",
                scope_owner_key="__shared__",
                name="Booked hedge review",
                name_key="booked-hedge-review",
                filters_json={
                    "review_status": "APPROVED",
                    "linked_trade_id": "TRD-OUTCOME-1",
                    "booked_at": self.now.isoformat(),
                },
                created_at=self.now,
                created_by="trader_one",
                updated_at=self.now,
                updated_by="trader_one",
                version=1,
            )
            rejected_review = ReportPreset(
                preset_key="pretrade_review",
                scope="SHARED",
                scope_owner_key="__shared__",
                name="Rejected netting review",
                name_key="rejected-netting-review",
                filters_json={"review_status": "REJECTED"},
                created_at=self.now,
                created_by="trader_one",
                updated_at=self.now,
                updated_by="trader_two",
                version=1,
            )
            session.add_all([booked_review, rejected_review])
            session.flush()

            session.add(
                Trade(
                    trade_id="TRD-OUTCOME-1",
                    created_at=self.now,
                    updated_at=self.now,
                    book="GAS_PHYS",
                    commodity_class="NATURAL_GAS",
                    commodity="HENRY_HUB",
                    trade_side="BUY",
                    pricing_type="FIXED",
                    status="ACTIVE",
                    last_event_id="event-outcome-1",
                )
            )
            session.add(
                ReportPreset(
                    preset_key="pretrade_hedge_recommendation",
                    scope="SHARED",
                    scope_owner_key="__shared__",
                    name="Booked hedge recommendation draft",
                    name_key="booked-hedge-draft",
                    filters_json={
                        "status": "REVIEW_DRAFT",
                        "source_promotion_score": 82,
                        "source_review_count": 2,
                        "source_approved_review_count": 2,
                        "source_booked_review_count": 1,
                        "source_run_count": 2,
                        "source_latest_review_id": booked_review.id,
                        "source_latest_run_id": 41,
                        "missing_evidence": [
                            {
                                "evidence_key": "credit_refresh",
                                "label": "Credit refresh",
                                "severity": "BLOCKING",
                                "detail": "Credit evidence is stale.",
                            }
                        ],
                    },
                    created_at=self.now,
                    created_by="trader_two",
                    updated_at=self.now,
                    updated_by="trader_two",
                    version=1,
                )
            )
            session.add(
                ReportPreset(
                    preset_key="pretrade_netting_set",
                    scope="SHARED",
                    scope_owner_key="__shared__",
                    name="Rejected netting-set draft",
                    name_key="rejected-netting-draft",
                    filters_json={
                        "status": "RETIRED",
                        "source_promotion_score": 54,
                        "source_review_count": 1,
                        "source_approved_review_count": 0,
                        "source_booked_review_count": 0,
                        "source_run_count": 1,
                        "source_latest_review_id": rejected_review.id,
                        "source_latest_run_id": 42,
                    },
                    created_at=self.now,
                    created_by="trader_two",
                    updated_at=self.now,
                    updated_by="trader_two",
                    version=1,
                )
            )
            session.commit()

        response = self.client.get(
            "/pretrade/promotion-outcomes",
            headers=self.trader_one_headers,
        )
        self.assertEqual(response.status_code, 200)
        summary = response.json()
        self.assertEqual(summary["total_draft_count"], 2)
        metric_counts = {metric["outcome"]: metric["count"] for metric in summary["metrics"]}
        self.assertEqual(metric_counts["CREATED"], 2)
        self.assertEqual(metric_counts["REUSED"], 1)
        self.assertEqual(metric_counts["RETIRED"], 1)
        self.assertEqual(metric_counts["REJECTED"], 1)
        self.assertEqual(metric_counts["MERGED_INTO_BOOKED_TRADE"], 1)
        self.assertEqual(metric_counts["BLOCKED_BY_MISSING_EVIDENCE"], 1)

        counts_by_type = {row["draft_type"]: row for row in summary["by_draft_type"]}
        self.assertEqual(counts_by_type["HEDGE_RECOMMENDATION"]["reused_count"], 1)
        self.assertEqual(counts_by_type["HEDGE_RECOMMENDATION"]["merged_into_booked_trade_count"], 1)
        self.assertEqual(counts_by_type["NETTING_SET"]["retired_count"], 1)
        self.assertEqual(counts_by_type["NETTING_SET"]["rejected_count"], 1)

        drafts_by_type = {draft["draft_type"]: draft for draft in summary["drafts"]}
        hedge_draft = drafts_by_type["HEDGE_RECOMMENDATION"]
        self.assertEqual(hedge_draft["source_linked_trade_id"], "TRD-OUTCOME-1")
        self.assertEqual(hedge_draft["source_linked_trade_status"], "ACTIVE")
        self.assertIn("MERGED_INTO_BOOKED_TRADE", hedge_draft["outcomes"])
        self.assertIn("BLOCKED_BY_MISSING_EVIDENCE", hedge_draft["outcomes"])
        self.assertTrue(hedge_draft["has_blocking_missing_evidence"])

        netting_draft = drafts_by_type["NETTING_SET"]
        self.assertEqual(netting_draft["source_review_status"], "REJECTED")
        self.assertIn("RETIRED", netting_draft["outcomes"])
        self.assertIn("REJECTED", netting_draft["outcomes"])

    def test_market_opportunity_promotion_creates_review_draft(self) -> None:
        scenario_payload = self._scenario_payload()
        scenario_payload["name"] = "May gas mark-gap review"
        scenario_payload["thesis"] = "Target economics are far enough from the captured mark to review as a market opportunity."
        scenario_payload["draft"] = {
            **scenario_payload["draft"],  # type: ignore[arg-type]
            "target_price": 3.25,
            "target_volume": 1000,
        }
        scenario_response = self.client.post(
            "/pretrade/scenarios",
            json=scenario_payload,
            headers=self.trader_one_headers,
        )
        self.assertEqual(scenario_response.status_code, 201)
        scenario_id = scenario_response.json()["scenario_id"]

        recommendation_response = self.client.post(
            "/pretrade/recommendations/runs",
            json={
                "name": "Mark gap opportunity recommendation",
                "source_scenario_id": scenario_id,
                "input_snapshots": self._recommendation_input_snapshots(),
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(recommendation_response.status_code, 201)
        recommendation_run = recommendation_response.json()
        self.assertEqual(recommendation_run["recommendation"]["opportunity_summary"]["category"], "MARK_GAP")

        review_response = self.client.post(
            "/pretrade/reviews",
            json={
                "name": "Market opportunity mark-gap review",
                "thesis": "Queue the target-vs-mark gap for durable opportunity review.",
                "source_scenario_id": scenario_id,
                "recommendation_run_id": recommendation_run["run_id"],
                "review_notes": "Market opportunity desk review: target-vs-mark gap for governance reuse.",
                "draft": scenario_payload["draft"],
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(review_response.status_code, 201)
        review_id = review_response.json()["review_id"]

        approve_response = self.client.patch(
            f"/pretrade/reviews/{review_id}",
            json={
                "review_status": "APPROVED",
                "activity_comment": "Approved mark-gap opportunity for reviewer-reuse tracking.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(approve_response.status_code, 200)

        governance_items_response = self.client.get(
            "/pretrade/governance/items",
            headers=self.trader_two_headers,
        )
        self.assertEqual(governance_items_response.status_code, 200)
        governance_items = governance_items_response.json()
        candidates = {
            candidate["candidate_type"]: candidate
            for candidate in governance_items["promotion_candidates"]
        }
        self.assertIn("MARKET_OPPORTUNITY", candidates)
        market_candidate = candidates["MARKET_OPPORTUNITY"]
        self.assertEqual(market_candidate["latest_review_id"], review_id)
        self.assertEqual(market_candidate["latest_run_id"], recommendation_run["run_id"])
        self.assertEqual(market_candidate["approved_review_count"], 1)
        self.assertEqual(market_candidate["sample_review_ids"], [review_id])

        list_before_response = self.client.get(
            "/pretrade/market-opportunities",
            headers=self.trader_two_headers,
        )
        self.assertEqual(list_before_response.status_code, 200)
        self.assertEqual(list_before_response.json(), [])

        promote_response = self.client.post(
            "/pretrade/market-opportunities/from-promotion",
            json={
                "owner": "desk.lead",
                "review_note": "Owner review requested from mark-gap market opportunity signal.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(promote_response.status_code, 201)
        market_opportunity = promote_response.json()
        self.assertEqual(market_opportunity["status"], "REVIEW_DRAFT")
        self.assertEqual(market_opportunity["owner"], "desk.lead")
        self.assertEqual(market_opportunity["source_promotion_candidate_type"], "MARKET_OPPORTUNITY")
        self.assertEqual(market_opportunity["source_latest_review_id"], review_id)
        self.assertEqual(market_opportunity["source_latest_run_id"], recommendation_run["run_id"])
        self.assertEqual(market_opportunity["source_promotion_score"], market_candidate["score"])
        self.assertEqual(market_opportunity["source_review_name"], "Market opportunity mark-gap review")
        self.assertEqual(market_opportunity["source_review_status"], "APPROVED")
        self.assertEqual(market_opportunity["source_recommendation_stance"], recommendation_run["recommendation"]["stance"])
        self.assertEqual(market_opportunity["source_recommendation_score"], recommendation_run["recommendation"]["score"])
        self.assertEqual(market_opportunity["opportunity_summary"]["category"], "MARK_GAP")
        self.assertEqual(market_opportunity["opportunity_summary"]["title"], "Pricing gap review")
        self.assertIsNone(market_opportunity["arbitrage_candidate"])
        self.assertGreater(len(market_opportunity["input_snapshots"]), 0)
        self.assertIn("No booked trade has reused this pattern yet.", market_opportunity["source_stop_reasons"])

        duplicate_promote_response = self.client.post(
            "/pretrade/market-opportunities/from-promotion",
            json={},
            headers=self.trader_two_headers,
        )
        self.assertEqual(duplicate_promote_response.status_code, 201)
        self.assertEqual(
            duplicate_promote_response.json()["market_opportunity_id"],
            market_opportunity["market_opportunity_id"],
        )

        list_after_response = self.client.get(
            "/pretrade/market-opportunities",
            headers=self.trader_one_headers,
        )
        self.assertEqual(list_after_response.status_code, 200)
        self.assertEqual(len(list_after_response.json()), 1)
        self.assertEqual(
            list_after_response.json()[0]["market_opportunity_id"],
            market_opportunity["market_opportunity_id"],
        )

        governance_export_response = self.client.get(
            "/pretrade/governance/export",
            headers=self.trader_two_headers,
        )
        self.assertEqual(governance_export_response.status_code, 200)
        governance_export = governance_export_response.json()
        self.assertTrue(
            any(
                row["category"] == "PROMOTION_CANDIDATE"
                and row["promotion_candidate_type"] == "MARKET_OPPORTUNITY"
                for row in governance_export["audit_rows"]
            )
        )

    def test_draft_analysis_uses_shared_recommendation_contract_without_persisting_run(self) -> None:
        scenario_response = self.client.post(
            "/pretrade/scenarios",
            json=self._scenario_payload(),
            headers=self.trader_one_headers,
        )
        self.assertEqual(scenario_response.status_code, 201)
        scenario = scenario_response.json()

        saved_run_response = self.client.post(
            "/pretrade/recommendations/runs",
            json={
                "name": "May gas hedge recommendation",
                "source_scenario_id": scenario["scenario_id"],
                "input_snapshots": self._recommendation_input_snapshots(),
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(saved_run_response.status_code, 201)
        saved_run = saved_run_response.json()

        escalating_snapshots = self._escalating_recommendation_input_snapshots()
        escalating_snapshots[2]["freshness"] = "STALE"
        escalating_snapshots[2]["payload"] = {"latest_mark": 2.2}
        draft_analysis_response = self.client.post(
            "/pretrade/recommendations/draft-analysis",
            json={
                "thesis": "Re-check the long draft against a weaker stale mark.",
                "draft": {
                    **self._scenario_payload()["draft"],
                    "target_volume": 28000,
                },
                "source_scenario_id": scenario["scenario_id"],
                "input_snapshots": escalating_snapshots,
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(draft_analysis_response.status_code, 200)
        analysis = draft_analysis_response.json()
        self.assertEqual(analysis["source_scenario_id"], scenario["scenario_id"])
        self.assertEqual(analysis["draft"]["target_volume"], 28000)
        self.assertEqual(analysis["recommendation"]["stance"], "ESCALATE")
        self.assertEqual(analysis["recommendation"]["opportunity_summary"]["category"], "MARK_GAP")
        self.assertEqual(analysis["comparison"]["previous_run_id"], saved_run["run_id"])
        self.assertTrue(analysis["comparison"]["stance_changed"])
        self.assertIn("Stance changed", analysis["comparison"]["summary"])

        listed_runs_response = self.client.get(
            f"/pretrade/recommendations/runs?source_scenario_id={scenario['scenario_id']}",
            headers=self.trader_one_headers,
        )
        self.assertEqual(listed_runs_response.status_code, 200)
        listed_runs = listed_runs_response.json()
        self.assertEqual(len(listed_runs), 1)
        self.assertEqual(listed_runs[0]["run_id"], saved_run["run_id"])

    def test_draft_analysis_collects_live_source_snapshots_when_input_snapshots_are_omitted(self) -> None:
        self._seed_trade_reference_data()
        self._seed_live_recommendation_context()

        response = self.client.post(
            "/pretrade/recommendations/draft-analysis",
            json={
                "thesis": "Use current live desk evidence for the draft review.",
                "draft": self._scenario_payload()["draft"],
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(response.status_code, 200)
        analysis = response.json()
        self.assertEqual(len(analysis["input_snapshots"]), 6)
        snapshots_by_key = {
            snapshot["adapter_key"]: snapshot
            for snapshot in analysis["input_snapshots"]
        }
        self.assertEqual(snapshots_by_key["desk-context"]["payload"]["related_active_trade_count"], 1)
        self.assertEqual(snapshots_by_key["desk-context"]["payload"]["current_net_position"], 1000)
        self.assertEqual(snapshots_by_key["counterparty-credit"]["quality_status"], "OK")
        self.assertEqual(snapshots_by_key["counterparty-credit"]["payload"]["external_rating_value"], "A-")
        self.assertEqual(snapshots_by_key["latest-mark"]["payload"]["latest_mark"], 2.83)
        self.assertEqual(snapshots_by_key["option-exposure"]["quality_status"], "OK")
        self.assertEqual(snapshots_by_key["option-exposure"]["payload"]["option_delta"], 4000)
        self.assertEqual(analysis["recommendation"]["stance"], "PROCEED_WITH_CARE")
        self.assertEqual(analysis["recommendation"]["hedge_recommendation"]["instrument_type"], "OPTIONS")

    def test_recommendation_runs_collect_live_source_snapshots_when_input_snapshots_are_omitted(self) -> None:
        self._seed_trade_reference_data()
        self._seed_live_recommendation_context()

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
                "name": "May gas hedge live recommendation",
                "source_scenario_id": scenario["scenario_id"],
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(run_response.status_code, 201)
        run = run_response.json()
        snapshots_by_key = {
            snapshot["adapter_key"]: snapshot
            for snapshot in run["input_snapshots"]
        }
        self.assertEqual(len(run["input_snapshots"]), 6)
        self.assertEqual(snapshots_by_key["latest-mark"]["payload"]["latest_mark"], 2.83)
        self.assertEqual(snapshots_by_key["option-exposure"]["quality_status"], "OK")
        self.assertEqual(run["recommendation"]["hedge_recommendation"]["instrument_type"], "OPTIONS")

    def test_legacy_recommendation_runs_without_structured_sections_still_load(self) -> None:
        scenario_response = self.client.post(
            "/pretrade/scenarios",
            json=self._scenario_payload(),
            headers=self.trader_one_headers,
        )
        self.assertEqual(scenario_response.status_code, 201)
        scenario = scenario_response.json()

        with self.SessionLocal() as session:
            legacy_run = ReportPreset(
                preset_key="pretrade_recommendation_run",
                scope="personal",
                scope_owner_key="trader_one",
                name="Legacy pre-trade run",
                name_key="legacy-pre-trade-run",
                filters_json={
                    "thesis": "Legacy recommendation payload.",
                    "draft": self._scenario_payload()["draft"],
                    "source_scenario_id": scenario["scenario_id"],
                    "source_review_id": None,
                    "input_snapshots": [],
                    "recommendation": {
                        "stance": "PROCEED",
                        "headline": "Proceed with standard controls.",
                        "summary": "Legacy summary.",
                        "confidence": "HIGH",
                        "score": 100,
                        "estimated_notional": 71000,
                        "projected_credit_utilization_pct": None,
                        "current_net_position": None,
                        "related_active_trade_count": 0,
                        "latest_mark": None,
                        "mark_gap_pct": None,
                        "explanation": {
                            "stance_rationale": "Proceed is supported because legacy checks passed.",
                            "source_quality_rationale": "Legacy source quality.",
                            "confidence_rationale": "High confidence.",
                            "primary_drivers": [],
                            "reviewer_focus": [],
                        },
                        "checks": [],
                        "next_actions": ["Review manually."],
                    },
                },
                created_at=self.now,
                created_by="trader_one",
                updated_at=self.now,
                updated_by="trader_one",
                version=1,
            )
            session.add(legacy_run)
            session.commit()
            run_id = legacy_run.id

        response = self.client.get(
            f"/pretrade/recommendations/runs/{run_id}",
            headers=self.trader_one_headers,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["recommendation"]["headline"], "Proceed with standard controls.")
        self.assertIsNone(payload["recommendation"]["opportunity_summary"])
        self.assertEqual(payload["recommendation"]["netting_candidates"], [])
        self.assertEqual(payload["recommendation"]["missing_evidence"], [])

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
        self.assertIn("Escalate because", review_payload["recommendation_summary"]["explanation"]["stance_rationale"])
        self.assertEqual(review_payload["recommendation_summary"]["input_snapshot_count"], 6)
        self.assertEqual(review_payload["enrichment"]["recommendation_run_id"], recommendation_run_id)
        self.assertEqual(review_payload["enrichment"]["recommendation_stance"], "ESCALATE")
        self.assertEqual(review_payload["enrichment"]["opportunity_category"], "RISK_INCREASE")
        self.assertIn("source snapshot", review_payload["enrichment"]["source_freshness_summary"])
        self.assertTrue(review_payload["enrichment"]["reviewer_focus"])

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
        self.assertEqual(
            approved_payload["activity"][-1]["payload"]["governance_snapshot_format_version"],
            "pretrade-governance-audit.v1",
        )
        self.assertIsNotNone(approved_payload["approval_governance_snapshot"])
        self.assertIsNone(approved_payload["booking_governance_snapshot"])
        self.assertEqual(approved_payload["approval_governance_snapshot"]["exported_by"], "trader_two")
        self.assertEqual(approved_payload["approval_governance_snapshot"]["summary"]["booked_review_count"], 0)
        self.assertEqual(approved_payload["approval_governance_snapshot"]["summary"]["override_count"], 1)

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
        self.assertEqual(
            linked_payload["activity"][-1]["payload"]["governance_snapshot_format_version"],
            "pretrade-governance-audit.v1",
        )
        self.assertEqual(linked_payload["approval_governance_snapshot"]["exported_by"], "trader_two")
        self.assertIsNotNone(linked_payload["booking_governance_snapshot"])
        self.assertEqual(linked_payload["booking_governance_snapshot"]["exported_by"], "trader_one")
        self.assertEqual(linked_payload["booking_governance_snapshot"]["summary"]["booked_with_override_count"], 1)
        self.assertEqual(
            linked_payload["booking_governance_snapshot"]["items"]["booked_with_override_reviews"][0]["linked_trade_id"],
            "TRD-21001",
        )

        trade_list_response = self.client.get("/trades", headers=self.trader_one_headers)
        self.assertEqual(trade_list_response.status_code, 200)
        trade_row = trade_list_response.json()[0]
        self.assertEqual(trade_row["trade_id"], "TRD-21001")
        self.assertEqual(trade_row["pretrade_review_id"], review_id)
        self.assertEqual(trade_row["pretrade_recommendation_run_id"], recommendation_run_id)
        self.assertEqual(trade_row["pretrade_approval_governance_snapshot"]["exported_by"], "trader_two")
        self.assertEqual(trade_row["pretrade_booking_governance_snapshot"]["exported_by"], "trader_one")
        self.assertEqual(trade_row["pretrade_booking_governance_snapshot"]["summary"]["booked_review_count"], 1)

        trade_detail_response = self.client.get("/trades/TRD-21001", headers=self.trader_one_headers)
        self.assertEqual(trade_detail_response.status_code, 200)
        trade_detail = trade_detail_response.json()
        self.assertEqual(trade_detail["pretrade_review_id"], review_id)
        self.assertEqual(trade_detail["pretrade_recommendation_run_id"], recommendation_run_id)
        self.assertEqual(
            trade_detail["pretrade_booking_governance_snapshot"]["items"]["booked_with_override_reviews"][0]["linked_trade_id"],
            "TRD-21001",
        )

        governance_response = self.client.get(
            "/pretrade/governance/summary",
            headers=self.trader_two_headers,
        )
        self.assertEqual(governance_response.status_code, 200)
        governance = governance_response.json()
        self.assertEqual(governance["pending_review_count"], 0)
        self.assertEqual(governance["booked_review_count"], 1)
        self.assertEqual(governance["risky_recommendation_count"], 1)
        self.assertEqual(governance["unresolved_risky_recommendation_count"], 0)
        self.assertEqual(governance["override_count"], 1)
        self.assertEqual(governance["booked_with_override_count"], 1)
        self.assertEqual(governance["promotion_candidate_count"], 1)
        self.assertEqual(governance["top_promotion_candidate_type"], "HEDGE_RECOMMENDATION")

        governance_items_response = self.client.get(
            "/pretrade/governance/items",
            headers=self.trader_two_headers,
        )
        self.assertEqual(governance_items_response.status_code, 200)
        governance_items = governance_items_response.json()
        self.assertEqual(len(governance_items["risky_recommendation_reviews"]), 1)
        self.assertEqual(governance_items["risky_recommendation_reviews"][0]["review_id"], review_id)
        self.assertEqual(governance_items["unresolved_risky_recommendation_reviews"], [])
        self.assertEqual(len(governance_items["override_reviews"]), 1)
        self.assertEqual(governance_items["override_reviews"][0]["recommendation_override_by"], "trader_two")
        self.assertEqual(len(governance_items["booked_with_override_reviews"]), 1)
        self.assertEqual(governance_items["booked_with_override_reviews"][0]["linked_trade_id"], "TRD-21001")
        self.assertEqual(len(governance_items["promotion_candidates"]), 1)
        hedge_candidate = governance_items["promotion_candidates"][0]
        self.assertEqual(hedge_candidate["candidate_type"], "HEDGE_RECOMMENDATION")
        self.assertEqual(hedge_candidate["booked_review_count"], 1)
        self.assertEqual(hedge_candidate["override_count"], 1)
        self.assertEqual(hedge_candidate["status"], "WATCH")

        hedge_list_before_response = self.client.get(
            "/pretrade/hedge-recommendations",
            headers=self.trader_two_headers,
        )
        self.assertEqual(hedge_list_before_response.status_code, 200)
        self.assertEqual(hedge_list_before_response.json(), [])

        hedge_promote_response = self.client.post(
            "/pretrade/hedge-recommendations/from-promotion",
            json={
                "owner": "risk.owner",
                "review_note": "Owner review requested from booked hedge promotion signal.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(hedge_promote_response.status_code, 201)
        hedge_draft = hedge_promote_response.json()
        self.assertEqual(hedge_draft["status"], "REVIEW_DRAFT")
        self.assertEqual(hedge_draft["owner"], "risk.owner")
        self.assertEqual(hedge_draft["source_promotion_candidate_type"], "HEDGE_RECOMMENDATION")
        self.assertEqual(hedge_draft["source_latest_review_id"], review_id)
        self.assertEqual(hedge_draft["source_latest_run_id"], recommendation_run_id)
        self.assertEqual(hedge_draft["source_promotion_score"], hedge_candidate["score"])
        self.assertEqual(hedge_draft["source_recommendation_stance"], "ESCALATE")
        self.assertEqual(hedge_draft["source_recommendation_score"], 70)
        self.assertEqual(hedge_draft["draft"]["commodity"], "HENRY_HUB")
        self.assertEqual(hedge_draft["hedge_recommendation"]["instrument_type"], "SWAP")
        self.assertTrue(hedge_draft["rejected_alternatives"])
        self.assertIn(
            "Promotion evidence includes override decisions; confirm the durable rule with the policy owner first.",
            hedge_draft["source_stop_reasons"],
        )

        duplicate_hedge_promote_response = self.client.post(
            "/pretrade/hedge-recommendations/from-promotion",
            json={},
            headers=self.trader_two_headers,
        )
        self.assertEqual(duplicate_hedge_promote_response.status_code, 201)
        self.assertEqual(
            duplicate_hedge_promote_response.json()["hedge_recommendation_id"],
            hedge_draft["hedge_recommendation_id"],
        )

        hedge_list_after_response = self.client.get(
            "/pretrade/hedge-recommendations",
            headers=self.trader_one_headers,
        )
        self.assertEqual(hedge_list_after_response.status_code, 200)
        self.assertEqual(len(hedge_list_after_response.json()), 1)
        self.assertEqual(
            hedge_list_after_response.json()[0]["hedge_recommendation_id"],
            hedge_draft["hedge_recommendation_id"],
        )

        governance_export_response = self.client.get(
            "/pretrade/governance/export",
            headers=self.trader_two_headers,
        )
        self.assertEqual(governance_export_response.status_code, 200)
        governance_export = governance_export_response.json()
        self.assertEqual(governance_export["exported_by"], "trader_two")
        self.assertEqual(governance_export["items"]["booked_with_override_reviews"][0]["linked_trade_id"], "TRD-21001")
        self.assertTrue(
            any(
                row["category"] == "BOOKED_WITH_OVERRIDE" and row["linked_trade_id"] == "TRD-21001"
                for row in governance_export["audit_rows"]
            )
        )
        self.assertTrue(
            any(
                row["category"] == "PROMOTION_CANDIDATE"
                and row["promotion_candidate_type"] == "HEDGE_RECOMMENDATION"
                for row in governance_export["audit_rows"]
            )
        )

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

    def test_review_drift_requires_reapproval_before_booking(self) -> None:
        self._seed_trade_reference_data()
        self._seed_live_recommendation_context()

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
                "name": "Initial May gas hedge recommendation",
                "source_scenario_id": scenario_id,
                "input_snapshots": self._escalating_recommendation_input_snapshots(),
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(recommendation_response.status_code, 201)
        initial_run_id = recommendation_response.json()["run_id"]

        review_response = self.client.post(
            "/pretrade/reviews",
            json={
                "name": "May gas hedge review",
                "thesis": "Approve if the latest recommendation still holds.",
                "source_scenario_id": scenario_id,
                "recommendation_run_id": initial_run_id,
                "review_notes": "Initial approval candidate.",
                "draft": self._scenario_payload()["draft"],
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(review_response.status_code, 201)
        review_id = review_response.json()["review_id"]

        approve_response = self.client.patch(
            f"/pretrade/reviews/{review_id}",
            json={
                "review_status": "APPROVED",
                "activity_comment": "Approved against the current recommendation.",
                "recommendation_override_reason": "Credit approved the temporary utilization overage.",
            },
            headers=self.trader_two_headers,
        )
        self.assertEqual(approve_response.status_code, 200)

        aligned_drift_response = self.client.get(
            f"/pretrade/reviews/{review_id}/drift",
            headers=self.trader_two_headers,
        )
        self.assertEqual(aligned_drift_response.status_code, 200)
        aligned_drift = aligned_drift_response.json()
        self.assertEqual(aligned_drift["alignment_status"], "ALIGNED")
        self.assertFalse(aligned_drift["requires_reapproval"])
        self.assertEqual(aligned_drift["approved_recommendation_run_id"], initial_run_id)
        self.assertEqual(aligned_drift["current_recommendation_run_id"], initial_run_id)
        self.assertEqual(aligned_drift["latest_recommendation_run_id"], initial_run_id)
        self.assertEqual(aligned_drift["reasons"], [])

        refreshed_recommendation_response = self.client.post(
            "/pretrade/recommendations/runs",
            json={
                "name": "Refreshed May gas hedge recommendation",
                "source_review_id": review_id,
                "input_snapshots": self._stale_recommendation_input_snapshots(),
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(refreshed_recommendation_response.status_code, 201)
        refreshed_run_id = refreshed_recommendation_response.json()["run_id"]

        review_update_response = self.client.patch(
            f"/pretrade/reviews/{review_id}",
            json={
                "recommendation_run_id": refreshed_run_id,
                "recommendation_override_reason": "Updated credit approval after stale mark review.",
                "activity_comment": "Attached the refreshed recommendation before booking.",
            },
            headers=self.trader_one_headers,
        )
        self.assertEqual(review_update_response.status_code, 200)

        drift_response = self.client.get(
            f"/pretrade/reviews/{review_id}/drift",
            headers=self.trader_two_headers,
        )
        self.assertEqual(drift_response.status_code, 200)
        drift = drift_response.json()
        self.assertEqual(drift["alignment_status"], "REAPPROVAL_REQUIRED")
        self.assertTrue(drift["requires_reapproval"])
        self.assertEqual(drift["approved_by"], "trader_two")
        self.assertEqual(drift["approved_recommendation_run_id"], initial_run_id)
        self.assertEqual(drift["current_recommendation_run_id"], refreshed_run_id)
        self.assertEqual(drift["latest_recommendation_run_id"], refreshed_run_id)
        self.assertIsNotNone(drift["approval_snapshot_generated_at"])
        self.assertEqual(
            {reason["code"] for reason in drift["reasons"]},
            {
                "RECOMMENDATION_CHANGED",
                "NEWER_RECOMMENDATION_AVAILABLE",
                "SOURCE_IMPAIRMENT_APPEARED",
                "OVERRIDE_CHANGED",
            },
        )
        self.assertTrue(drift["current_impaired_sources"])

        blocked_response = self.client.post(
            "/events",
            json={
                "aggregate_type": "trade",
                "aggregate_id": "TRD-22001",
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
        self.assertIn("re-approved before booking", blocked_response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
