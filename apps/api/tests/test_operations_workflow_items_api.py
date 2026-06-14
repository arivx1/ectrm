from __future__ import annotations

import enum
import unittest
from datetime import date, datetime, timedelta, timezone

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
from apps.api.app.domains.assistant.services.action_requests import approve_action_request
from apps.api.app.domains.operations.services.workflow_items import evaluate_trade_workflow_item_update_policy
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.event import Event
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
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
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_credit_approval_decision import TradeCreditApprovalDecision
from apps.api.app.models.trade_credit_exception import TradeCreditException
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class OperationsWorkflowItemsApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 5, 19, 0, tzinfo=timezone.utc)
        self._previous_bootstrap_admin_token = settings.BOOTSTRAP_ADMIN_TOKEN
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"

        with self.SessionLocal() as session:
            session.query(TradeActualization).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeConfirmation).delete()
            session.query(TradeCreditApprovalDecision).delete()
            session.query(TradeCreditException).delete()
            session.query(AssistantActionRequest).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(DeliveryObligation).delete()
            session.query(OptionExposure).delete()
            session.query(Position).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(ReferenceCounterpartyExternalCreditSnapshot).delete()
            session.query(ReferenceCounterpartyCreditProfile).delete()
            session.query(ExternalDataRun).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceCurrency).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
            self._seed_reference_data(session)
            session.commit()

    def tearDown(self) -> None:
        settings.BOOTSTRAP_ADMIN_TOKEN = self._previous_bootstrap_admin_token

    def _bootstrap_admin(self) -> str:
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
        return response.json()["access_token"]

    def _create_user(self, *, user_id: str, email: str, display_name: str, role: str = "TRADER") -> None:
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id=user_id,
                    email=email,
                    display_name=display_name,
                    role=role,
                    password_hash=hash_password("supersecret2"),
                    is_active=True,
                    last_login_at=self.now,
                    created_at=self.now,
                    created_by="ops_admin",
                    updated_at=self.now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.commit()

    def _login(self, *, identifier: str, password: str) -> str:
        response = self.client.post("/auth/session", json={"identifier": identifier, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def _get_work_items(self, token: str, *, query: str = ""):
        path = "/operations/work-items"
        if query:
            path = f"{path}?{query}"
        return self.client.get(path, headers=self._auth_headers(token))

    def _seed_trade(
        self,
        *,
        trade_id: str,
        instrument_type: str = "LINEAR",
        trade_nature: str = "PHYSICAL",
        trade_side: str = "BUY",
        option_type: str | None = None,
        option_style: str | None = None,
        option_strike_price: float | None = None,
        option_expiration_date: date | None = None,
        price_index_code: str | None = None,
        price: float = 79.25,
        volume: float = 1000,
        unit_of_measure: str = "BBL",
        status: str = "ACTIVE",
        confirmation_status: str = "PENDING",
        nomination_status: str = "PENDING",
        allocation_status: str = "PENDING",
        invoice_status: str = "PENDING",
        payment_status: str = "PENDING",
        settlement_status: str = "PENDING",
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id=trade_id,
                    external_trade_id=f"EXT-{trade_id}",
                    source_system="ETRM",
                    created_at=self.now,
                    updated_at=self.now,
                    execution_timestamp=self.now,
                    trade_date=date(2026, 4, 5),
                    effective_start_date=date(2026, 4, 7),
                    effective_end_date=date(2026, 4, 9),
                    quality_spec=None,
                    unit_of_measure=unit_of_measure,
                    trade_currency_code="USD",
                    location_code="CUSHING",
                    delivery_start=date(2026, 4, 7),
                    delivery_end=date(2026, 4, 9),
                    price_unit_code="BBL",
                    instrument_type=instrument_type,
                    option_type=option_type,
                    option_style=option_style,
                    option_strike_price=option_strike_price,
                    option_expiration_date=option_expiration_date,
                    trade_nature=trade_nature,
                    trade_structure="SINGLE",
                    trade_side=trade_side,
                    book="CRUDE_PHYS",
                    portfolio="PROMPT",
                    counterparty="SHELL_TRADING",
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    confirmation_status=confirmation_status,
                    nomination_status=nomination_status,
                    allocation_status=allocation_status,
                    price_index_code=price_index_code,
                    price=price,
                    volume=volume,
                    invoice_status=invoice_status,
                    payment_status=payment_status,
                    settlement_status=settlement_status,
                    trader_user="trader.alpha",
                    status=status,
                    last_event_id=f"evt-{trade_id.lower()}",
                )
            )
            session.commit()

    def _seed_reference_data(self, session) -> None:
        session.add(
            ReferenceBook(
                code="CRUDE_PHYS",
                name="Crude Physical",
                description="Test book",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
        )
        session.add(
            ReferenceCommodity(
                code="WTI",
                commodity_class="CRUDE_OIL",
                name="WTI",
                description="WTI",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
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
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
        )
        session.add(
            ReferencePortfolio(
                code="PROMPT",
                name="Prompt",
                book_code="CRUDE_PHYS",
                owner=None,
                strategy="Prompt",
                trader_persona=None,
                risk_archetype=None,
                description="Prompt test portfolio",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
        )
        session.add(
            ReferenceUnit(
                code="BBL",
                name="Barrel",
                commodity_class="CRUDE_OIL",
                dimension="VOLUME",
                base_unit_code=None,
                conversion_factor=None,
                precision=3,
                description="Barrel",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
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
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
        )
        session.add(
            ReferenceLocation(
                code="CUSHING",
                name="Cushing",
                location_kind="POINT",
                location_type="HUB",
                parent_location_code=None,
                market="PHYSICAL",
                city="Cushing",
                subdivision_code="OK",
                country_code="US",
                continent_code="NA",
                latitude=None,
                longitude=None,
                region="Midcontinent",
                timezone="America/Chicago",
                description="Cushing hub",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
        )
        session.add(
            ReferencePriceIndex(
                code="WTI_CUSHING_D",
                name="WTI Cushing Spot Daily",
                commodity_code="WTI",
                currency_code="USD",
                unit_code="BBL",
                provider="EIA",
                market="CUSHING",
                location_code="CUSHING",
                calendar_code=None,
                description="WTI Cushing test mark",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
        )
        session.flush()

    def _seed_credit_approval_item(
        self,
        *,
        trade_id: str,
        status: str = "PENDING_REVIEW",
        notes: str = "Credit approval is pending review.",
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                TradeWorkflowItem(
                    trade_id=trade_id,
                    workflow_type="CREDIT_APPROVAL",
                    status=status,
                    owner=None,
                    due_at=None,
                    notes=notes,
                    created_at=self.now,
                    created_by="credit.ops",
                    updated_at=self.now,
                    updated_by="credit.ops",
                    version=1,
                )
            )
            session.commit()

    def _seed_counterparty_credit_profile(
        self,
        *,
        limit_amount: float = 1000,
        breach_action: str = "REQUIRE_APPROVAL",
        limit_currency_code: str = "USD",
        review_due_at: date | None = None,
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                ReferenceCounterpartyCreditProfile(
                    counterparty_code="SHELL_TRADING",
                    credit_rating="BBB",
                    review_due_at=review_due_at or (date.today() + timedelta(days=14)),
                    limit_currency_code=limit_currency_code,
                    limit_amount=limit_amount,
                    breach_action=breach_action,
                    notes="Test credit profile",
                    created_at=self.now,
                    created_by="ops_admin",
                    updated_at=self.now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.commit()

    def _seed_counterparty_external_credit_snapshot(
        self,
        *,
        as_of_date: date | None = None,
        provider: str = "DNB",
    ) -> None:
        with self.SessionLocal() as session:
            run = ExternalDataRun(
                provider=provider,
                job_name="counterparty_credit_import",
                status="SUCCEEDED",
                started_at=self.now,
                finished_at=self.now,
                requested_by="credit-admin",
                series_count=1,
                observation_count=1,
                error_summary=None,
                created_at=self.now,
            )
            session.add(run)
            session.flush()
            session.add(
                ReferenceCounterpartyExternalCreditSnapshot(
                    counterparty_code="SHELL_TRADING",
                    provider=provider,
                    source_entity_id="123456789",
                    source_entity_name="Shell Trading",
                    match_basis="DUNS",
                    matched_identifier_value="123456789",
                    as_of_date=as_of_date or date.today(),
                    rating_scale="DNB Rating",
                    rating_value="4A1",
                    rating_outlook="Stable",
                    credit_score=80,
                    probability_of_default=0.02,
                    recommended_limit_currency_code="USD",
                    recommended_limit_amount=2500000,
                    commentary="Fresh vendor snapshot",
                    downloaded_at=self.now,
                    run_id=run.id,
                    raw_payload={"rating": "4A1"},
                    created_at=self.now,
                    updated_at=self.now,
                    version=1,
                )
            )
            session.commit()

    def test_work_items_list_backfills_trade_rows_and_filters_by_queue(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-OPS-1")

        operations_response = self._get_work_items(admin_token, query="queue=operations")
        self.assertEqual(operations_response.status_code, 200)
        operations_items = operations_response.json()
        self.assertEqual(len(operations_items), 4)
        self.assertEqual(
            {item["workflow_type"] for item in operations_items},
            {"CONFIRMATION", "NOMINATION", "ALLOCATION", "ACTUALIZATION"},
        )
        self.assertTrue(all(item["queue"] == "operations" for item in operations_items))
        self.assertTrue(all(item["due_at"] is not None for item in operations_items))

        settlement_response = self._get_work_items(
            admin_token,
            query="queue=settlement&include_closed=true",
        )
        self.assertEqual(settlement_response.status_code, 200)
        settlement_items = settlement_response.json()
        self.assertEqual(len(settlement_items), 2)
        self.assertEqual(
            {item["workflow_type"] for item in settlement_items},
            {"INVOICE", "PAYMENT"},
        )

        with self.SessionLocal() as session:
            self.assertEqual(session.query(TradeWorkflowItem).count(), 6)

    def test_work_items_list_backfills_option_settlement_for_closed_exercised_option(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(
            trade_id="T-OPTION-OPS-1",
            instrument_type="OPTION",
            trade_nature="FINANCIAL",
            trade_side="BUY",
            option_type="CALL",
            option_style="AMERICAN",
            option_strike_price=81,
            option_expiration_date=date(2026, 6, 30),
            price_index_code="WTI_CUSHING_D",
            price=3.5,
            volume=10,
            status="EXERCISED",
        )

        response = self._get_work_items(admin_token, query="queue=operations")
        self.assertEqual(response.status_code, 200)
        items = [item for item in response.json() if item["trade_id"] == "T-OPTION-OPS-1"]

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["workflow_type"], "OPTION_SETTLEMENT")
        self.assertEqual(items[0]["status"], "PENDING")
        self.assertEqual(items[0]["queue"], "operations")
        self.assertEqual(items[0]["due_at"][:10], "2026-04-06")
        self.assertIn("resulting BUY WTI 10 BBL", items[0]["notes"])
        self.assertIn("Strike 81 USD/BBL", items[0]["notes"])

    def test_shipment_actualization_updates_trade_and_workflow_projection(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-ACTUAL-OPS-1", volume=1000)

        initial_items = self._get_work_items(admin_token, query="queue=operations").json()
        actualization_item = next(
            item
            for item in initial_items
            if item["trade_id"] == "T-ACTUAL-OPS-1" and item["workflow_type"] == "ACTUALIZATION"
        )
        self.assertEqual(actualization_item["status"], "PENDING")

        blocked_patch = self.client.patch(
            f"/operations/work-items/{actualization_item['item_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "ACTUALIZED"},
        )
        self.assertEqual(blocked_patch.status_code, 422)
        self.assertIn("Use shipment actualization", blocked_patch.json()["detail"])

        partial_actualization = self.client.put(
            "/shipments/T-ACTUAL-OPS-1/actualization",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "actual_quantity": 875,
                "actualized_at": "2026-04-08T18:00:00Z",
                "source": "METER",
                "notes": "Provisional terminal ticket.",
            },
        )
        self.assertEqual(partial_actualization.status_code, 200)
        partial_payload = partial_actualization.json()
        self.assertEqual(partial_payload["actualization_status"], "PARTIALLY_ACTUALIZED")
        self.assertEqual(partial_payload["quantity_variance"], -125.0)

        refreshed_items = self._get_work_items(
            admin_token,
            query="queue=operations&trade_id=T-ACTUAL-OPS-1",
        ).json()
        refreshed_actualization_item = next(
            item
            for item in refreshed_items
            if item["workflow_type"] == "ACTUALIZATION"
        )
        self.assertEqual(refreshed_actualization_item["status"], "PARTIALLY_ACTUALIZED")

        final_actualization = self.client.put(
            "/shipments/T-ACTUAL-OPS-1/actualization",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "actual_quantity": 1000,
                "actualized_at": "2026-04-09T02:00:00Z",
                "source": "METER",
                "notes": "Final custody transfer quantity.",
            },
        )
        self.assertEqual(final_actualization.status_code, 200)
        self.assertEqual(final_actualization.json()["actualization_status"], "ACTUALIZED")

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-ACTUAL-OPS-1").one()
            self.assertEqual(trade.actualization_status, "ACTUALIZED")
            self.assertEqual(session.query(TradeActualization).filter(TradeActualization.trade_id == "T-ACTUAL-OPS-1").count(), 1)
            audit_events = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-ACTUAL-OPS-1",
                    Event.event_type == "TradeActualizationUpserted",
                )
                .order_by(Event.recorded_at.asc())
                .all()
            )
            self.assertEqual(len(audit_events), 2)
            self.assertEqual(audit_events[0].payload["request"]["actual_quantity"], 875.0)
            self.assertEqual(
                audit_events[-1].payload["actualization"]["actualization_status"],
                "ACTUALIZED",
            )

    def test_shipment_actualization_requires_operations_authorized_role(self) -> None:
        self._create_user(
            user_id="ops.actualization",
            email="ops.actualization@example.com",
            display_name="Ops Actualization",
            role="OPERATIONS",
        )
        self._create_user(
            user_id="trader.actualization",
            email="trader.actualization@example.com",
            display_name="Trader Actualization",
            role="TRADER",
        )
        operations_token = self._login(identifier="ops.actualization", password="supersecret2")
        trader_token = self._login(identifier="trader.actualization", password="supersecret2")
        self._seed_trade(trade_id="T-ACTUAL-OPS-ROLE-1", volume=1000)

        trader_response = self.client.put(
            "/shipments/T-ACTUAL-OPS-ROLE-1/actualization",
            headers=self._auth_headers(trader_token),
            json={
                "actual_quantity": 1000,
                "actualized_at": "2026-04-09T02:00:00Z",
                "source": "METER",
            },
        )
        self.assertEqual(trader_response.status_code, 403)
        self.assertEqual(
            trader_response.json()["detail"],
            "Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage shipment actualization.",
        )

        operations_response = self.client.put(
            "/shipments/T-ACTUAL-OPS-ROLE-1/actualization",
            headers=self._auth_headers(operations_token),
            json={
                "actual_quantity": 1000,
                "actualized_at": "2026-04-09T02:00:00Z",
                "source": "METER",
            },
        )
        self.assertEqual(operations_response.status_code, 200)
        self.assertEqual(operations_response.json()["actualization_status"], "ACTUALIZED")

    def test_work_item_patch_allows_option_settlement_updates_on_closed_option_trade(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(
            trade_id="T-OPTION-OPS-2",
            instrument_type="OPTION",
            trade_nature="FINANCIAL",
            trade_side="SELL",
            option_type="PUT",
            option_style="AMERICAN",
            option_strike_price=74,
            option_expiration_date=date(2026, 6, 30),
            price=2.25,
            volume=7,
            status="ASSIGNED",
        )

        queue_response = self._get_work_items(
            admin_token,
            query="queue=operations&include_closed=true",
        )
        self.assertEqual(queue_response.status_code, 200)
        option_item = next(
            item
            for item in queue_response.json()
            if item["trade_id"] == "T-OPTION-OPS-2" and item["workflow_type"] == "OPTION_SETTLEMENT"
        )

        patch_response = self.client.patch(
            f"/operations/work-items/{option_item['item_id']}",
            json={"status": "BOOKED", "owner": "ops_admin", "notes": "Underlying trade booked on the physical desk."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.json()["status"], "BOOKED")
        self.assertEqual(patch_response.json()["owner"], "ops_admin")
        self.assertEqual(patch_response.json()["notes"], "Underlying trade booked on the physical desk.")

    def test_book_underlying_creates_linked_trade_and_closes_option_settlement_item(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(
            trade_id="T-OPTION-OPS-BOOK-1",
            instrument_type="OPTION",
            trade_nature="FINANCIAL",
            trade_side="BUY",
            option_type="CALL",
            option_style="AMERICAN",
            option_strike_price=81,
            option_expiration_date=date(2026, 6, 30),
            price_index_code="WTI_CUSHING_D",
            price=3.5,
            volume=10,
            status="EXERCISED",
        )

        queue_response = self._get_work_items(
            admin_token,
            query="queue=operations&include_closed=true",
        )
        self.assertEqual(queue_response.status_code, 200)
        option_item = next(
            item
            for item in queue_response.json()
            if item["trade_id"] == "T-OPTION-OPS-BOOK-1" and item["workflow_type"] == "OPTION_SETTLEMENT"
        )
        self.assertIsNone(option_item["linked_trade_id"])

        book_response = self.client.post(
            f"/operations/work-items/{option_item['item_id']}/book-underlying",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(book_response.status_code, 200)
        booked_item = book_response.json()
        self.assertEqual(booked_item["status"], "BOOKED")
        self.assertIsNotNone(booked_item["linked_trade_id"])
        self.assertEqual(booked_item["linked_trade_status"], "ACTIVE")
        self.assertIn(booked_item["linked_trade_id"], booked_item["notes"])

        repeat_response = self.client.post(
            f"/operations/work-items/{option_item['item_id']}/book-underlying",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(repeat_response.status_code, 200)
        self.assertEqual(repeat_response.json()["linked_trade_id"], booked_item["linked_trade_id"])

        with self.SessionLocal() as session:
            linked_trades = (
                session.query(Trade)
                .filter(Trade.originating_option_trade_id == "T-OPTION-OPS-BOOK-1")
                .all()
            )
            self.assertEqual(len(linked_trades), 1)
            linked_trade = linked_trades[0]
            self.assertEqual(linked_trade.trade_id, booked_item["linked_trade_id"])
            self.assertEqual(linked_trade.instrument_type, "LINEAR")
            self.assertEqual(linked_trade.trade_side, "BUY")
            self.assertEqual(float(linked_trade.price), 81.0)
            self.assertEqual(float(linked_trade.volume), 10.0)
            self.assertEqual(linked_trade.price_index_code, "WTI_CUSHING_D")
            self.assertEqual(linked_trade.source_system, "OPTION_SETTLEMENT")

    def test_work_item_patch_rolls_up_trade_statuses(self) -> None:
        admin_token = self._bootstrap_admin()
        self._create_user(user_id="ops_trader", email="trader@example.com", display_name="Ops Trader")
        trader_token = self._login(identifier="ops_trader", password="supersecret2")
        self._seed_trade(trade_id="T-ROLLUP-1")

        queue_response = self._get_work_items(admin_token, query="include_closed=true")
        self.assertEqual(queue_response.status_code, 200)
        work_items = {item["workflow_type"]: item for item in queue_response.json()}

        confirmation_response = self.client.patch(
            f"/operations/work-items/{work_items['CONFIRMATION']['item_id']}",
            json={"status": "CONFIRMED", "owner": "ops_trader"},
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(confirmation_response.status_code, 200)
        self.assertEqual(confirmation_response.json()["status"], "CONFIRMED")
        self.assertEqual(confirmation_response.json()["owner"], "ops_trader")

        invoice_response = self.client.patch(
            f"/operations/work-items/{work_items['INVOICE']['item_id']}",
            json={"status": "APPROVED", "notes": "Invoice matched and approved."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(invoice_response.status_code, 200)
        self.assertEqual(invoice_response.json()["status"], "APPROVED")

        payment_response = self.client.patch(
            f"/operations/work-items/{work_items['PAYMENT']['item_id']}",
            json={"status": "PAID"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(payment_response.status_code, 200)
        self.assertEqual(payment_response.json()["status"], "PAID")

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-ROLLUP-1").one()
            self.assertEqual(trade.confirmation_status, "CONFIRMED")
            self.assertEqual(trade.invoice_status, "APPROVED")
            self.assertEqual(trade.payment_status, "PAID")
            self.assertEqual(trade.settlement_status, "SETTLED")
            workflow_events = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-ROLLUP-1",
                    Event.event_type == "TradeWorkflowItemUpdated",
                )
                .all()
            )
            self.assertEqual(len(workflow_events), 3)
            self.assertEqual(
                {
                    event.payload["workflow_item"]["workflow_type"]
                    for event in workflow_events
                },
                {"CONFIRMATION", "INVOICE", "PAYMENT"},
            )

    def test_workflow_item_update_policy_builds_review_context(self) -> None:
        self._seed_trade(trade_id="T-POLICY-1")

        with self.SessionLocal() as session:
            item = TradeWorkflowItem(
                trade_id="T-POLICY-1",
                workflow_type="NOMINATION",
                status="PENDING",
                owner=None,
                due_at=None,
                notes=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
            session.add(item)
            session.commit()
            item_id = item.id

        with self.SessionLocal() as session:
            due_at = self.now + timedelta(days=1)
            decision = evaluate_trade_workflow_item_update_policy(
                session,
                item_id=item_id,
                changes={
                    "status": "completed",
                    "owner": " ops_alpha ",
                    "due_at": due_at,
                    "notes": " nomination checked ",
                },
                now=self.now,
                validate_actor=False,
            )

        self.assertEqual(decision.normalized_changes["status"], "COMPLETED")
        self.assertEqual(decision.normalized_changes["owner"], "ops_alpha")
        self.assertEqual(decision.normalized_changes["notes"], "nomination checked")
        self.assertEqual(decision.workflow_queue, "operations")
        self.assertEqual(decision.required_reviewer_role, "OPERATIONS_LEAD")
        self.assertIn("credit_hold_not_active", decision.policy_checks)
        self.assertTrue(decision.idempotency_key.startswith(f"workflow-item-update:{item_id}:v1:"))

        review_context = decision.to_review_context()
        self.assertEqual(review_context["owning_work_object"]["id"], str(item_id))
        self.assertEqual(review_context["required_reviewer_role"], "OPERATIONS_LEAD")
        self.assertEqual(review_context["current_values"]["status"], "PENDING")
        self.assertEqual(review_context["proposed_values"]["status"], "COMPLETED")
        self.assertEqual(
            review_context["proposed_mutation"]["changes"]["due_at"],
            due_at.isoformat(),
        )

    def test_assistant_workflow_update_action_uses_record_managed_policy(self) -> None:
        self._seed_trade(trade_id="T-ACTION-POLICY-1")

        with self.SessionLocal() as session:
            item = TradeWorkflowItem(
                trade_id="T-ACTION-POLICY-1",
                workflow_type="CONFIRMATION",
                status="PENDING",
                owner=None,
                due_at=None,
                notes=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
            session.add(item)
            session.flush()
            item_id = item.id
            session.add(
                TradeConfirmation(
                    trade_id="T-ACTION-POLICY-1",
                    source_document_id=None,
                    confirmation_number="CONF-T-ACTION-POLICY-1",
                    status="SENT",
                    sent_at=self.now,
                    confirmed_at=None,
                    issue_count=1,
                    last_issued_at=self.now,
                    last_issued_by="ops_admin",
                    last_issue_method="EMAIL",
                    last_issue_recipient="ops@example.com",
                    last_issue_note=None,
                    receipt_status="ISSUED",
                    received_at=None,
                    received_by=None,
                    response_method=None,
                    response_reference=None,
                    response_note=None,
                    dispute_reason=None,
                    notes=None,
                    comparison_waiver_note=None,
                    comparison_waived_at=None,
                    comparison_waived_by=None,
                    created_at=self.now,
                    created_by="ops_admin",
                    updated_at=self.now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            action_request = AssistantActionRequest(
                run_id=1,
                status="PENDING",
                user_id="ops_admin",
                session_id="session-1",
                workspace="operations",
                agent_id=None,
                agent_name="Operations Agent",
                action_type="update_trade_workflow_item",
                summary="Update confirmation workflow item",
                description="Attempt to close a record-managed confirmation workflow item.",
                payload={
                    "item_id": item_id,
                    "changes": {"status": "CONFIRMED"},
                    "review_context": {
                        "owning_work_object": {
                            "type": "trade_workflow_item",
                            "id": str(item_id),
                            "label": f"Trade Workflow Item {item_id}",
                        },
                        "required_reviewer_role": "OPERATIONS_LEAD",
                        "business_rationale": "Exercise assistant approval policy before record-managed workflow rejection.",
                        "proposed_mutation": {
                            "operation": "update_trade_workflow_item",
                            "item_id": item_id,
                            "changes": {"status": "CONFIRMED"},
                        },
                        "supporting_records": [],
                        "assumptions": [],
                        "missing_evidence": [],
                        "expected_downstream_effects": ["Attempt workflow update through approval gateway."],
                        "stale_state_basis": {"workflow_item_version": 1},
                        "idempotency_key": f"test:update-workflow-item:{item_id}:record-managed",
                    },
                },
                result=None,
                error_detail=None,
                created_at=self.now,
                decided_at=None,
                decided_by=None,
            )
            session.add(action_request)
            session.commit()
            action_request_id = action_request.id

        with self.SessionLocal() as session:
            record = session.get(AssistantActionRequest, action_request_id)
            self.assertIsNotNone(record)
            failed = approve_action_request(
                db=session,
                record=record,
                actor_id="ops_admin",
                actor_role="ADMIN",
            )

            self.assertEqual(failed.status, "FAILED")
            self.assertIn("record-managed", failed.error_detail or "")
            workflow_item = session.get(TradeWorkflowItem, item_id)
            self.assertIsNotNone(workflow_item)
            self.assertEqual(workflow_item.status, "PENDING")

    def test_workflow_item_update_policy_blocks_terminal_transition_and_far_due_date(self) -> None:
        self._seed_trade(trade_id="T-POLICY-BLOCK-1")

        with self.SessionLocal() as session:
            item = TradeWorkflowItem(
                trade_id="T-POLICY-BLOCK-1",
                workflow_type="NOMINATION",
                status="COMPLETED",
                owner=None,
                due_at=None,
                notes=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
            session.add(item)
            session.commit()
            item_id = item.id

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(ValueError, "terminal"):
                evaluate_trade_workflow_item_update_policy(
                    session,
                    item_id=item_id,
                    changes={"status": "PENDING"},
                    now=self.now,
                    validate_actor=False,
                )

            with self.assertRaisesRegex(ValueError, "scheduling window"):
                evaluate_trade_workflow_item_update_policy(
                    session,
                    item_id=item_id,
                    changes={"due_at": self.now + timedelta(days=731)},
                    now=self.now,
                    validate_actor=False,
                )

    def test_assistant_workflow_update_action_enforces_stale_version_and_allows_idempotent_retry(self) -> None:
        self._seed_trade(trade_id="T-ACTION-STALE-1")

        with self.SessionLocal() as session:
            item = TradeWorkflowItem(
                trade_id="T-ACTION-STALE-1",
                workflow_type="NOMINATION",
                status="PENDING",
                owner=None,
                due_at=None,
                notes=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
            session.add(item)
            session.flush()
            item_id = item.id
            stale_request = AssistantActionRequest(
                run_id=1,
                status="PENDING",
                user_id="ops_admin",
                session_id="session-1",
                workspace="operations",
                agent_id=None,
                agent_name="Operations Agent",
                action_type="update_trade_workflow_item",
                summary="Complete nomination workflow item",
                description="Attempt to complete a stale nomination workflow item.",
                payload={
                    "item_id": item_id,
                    "changes": {"status": "COMPLETED"},
                    "review_context": {
                        "stale_state_basis": {"workflow_item_version": 1},
                        "idempotency_key": f"test:update-workflow-item:{item_id}:stale",
                    },
                },
                result=None,
                error_detail=None,
                created_at=self.now,
                decided_at=None,
                decided_by=None,
            )
            session.add(stale_request)
            session.flush()
            stale_request_id = stale_request.id
            item.owner = "manual.ops"
            item.version = 2
            session.commit()

        with self.SessionLocal() as session:
            record = session.get(AssistantActionRequest, stale_request_id)
            self.assertIsNotNone(record)
            failed = approve_action_request(
                db=session,
                record=record,
                actor_id="ops_admin",
                actor_role="ADMIN",
            )

            self.assertEqual(failed.status, "FAILED")
            self.assertTrue(
                "changed since this action was staged" in (failed.error_detail or "")
                or "staged review context is stale" in (failed.error_detail or "")
            )
            workflow_item = session.get(TradeWorkflowItem, item_id)
            self.assertIsNotNone(workflow_item)
            self.assertEqual(workflow_item.status, "PENDING")
            self.assertEqual(workflow_item.version, 2)

        with self.SessionLocal() as session:
            workflow_item = session.get(TradeWorkflowItem, item_id)
            self.assertIsNotNone(workflow_item)
            workflow_item.status = "COMPLETED"
            workflow_item.owner = "ops_alpha"
            workflow_item.version = 3
            retry_request = AssistantActionRequest(
                run_id=2,
                status="PENDING",
                user_id="ops_admin",
                session_id="session-2",
                workspace="operations",
                agent_id=None,
                agent_name="Operations Agent",
                action_type="update_trade_workflow_item",
                summary="Retry completed nomination workflow item",
                description="Retry a workflow update that was already applied.",
                payload={
                    "item_id": item_id,
                    "changes": {"status": "COMPLETED", "owner": "ops_alpha"},
                    "review_context": {
                        "stale_state_basis": {"workflow_item_version": 1},
                        "idempotency_key": f"test:update-workflow-item:{item_id}:retry",
                    },
                },
                result=None,
                error_detail=None,
                created_at=self.now,
                decided_at=None,
                decided_by=None,
            )
            session.add(retry_request)
            session.commit()
            retry_request_id = retry_request.id

        with self.SessionLocal() as session:
            record = session.get(AssistantActionRequest, retry_request_id)
            self.assertIsNotNone(record)
            executed = approve_action_request(
                db=session,
                record=record,
                actor_id="ops_admin",
                actor_role="ADMIN",
            )

            self.assertEqual(executed.status, "EXECUTED")
            self.assertEqual(executed.result["status"], "COMPLETED")
            self.assertEqual(executed.result["owner"], "ops_alpha")
            workflow_item = session.get(TradeWorkflowItem, item_id)
            self.assertIsNotNone(workflow_item)
            self.assertEqual(workflow_item.version, 3)

    def test_credit_approval_actions_require_comment_and_release_lifecycle_hold(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_counterparty_credit_profile()
        self._seed_counterparty_external_credit_snapshot()
        self._seed_trade(trade_id="T-CREDIT-OPS-1")
        self._seed_credit_approval_item(
            trade_id="T-CREDIT-OPS-1",
            notes="",
        )

        queue_response = self._get_work_items(
            admin_token,
            query="queue=operations&include_closed=true",
        )
        self.assertEqual(queue_response.status_code, 200)
        work_items = {item["workflow_type"]: item for item in queue_response.json() if item["trade_id"] == "T-CREDIT-OPS-1"}
        self.assertEqual(
            work_items["CREDIT_APPROVAL"]["credit_approval_freshness"]["approval_blocked"],
            False,
        )

        blocked_response = self.client.patch(
            f"/operations/work-items/{work_items['CONFIRMATION']['item_id']}",
            json={"status": "CONFIRMED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(blocked_response.status_code, 422)
        self.assertIn("credit hold", blocked_response.text.lower())

        reject_without_comment_response = self.client.patch(
            f"/operations/work-items/{work_items['CREDIT_APPROVAL']['item_id']}",
            json={"status": "REJECTED", "notes": None},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(reject_without_comment_response.status_code, 422)
        self.assertIn("audit comment", reject_without_comment_response.text.lower())

        approve_without_comment_response = self.client.patch(
            f"/operations/work-items/{work_items['CREDIT_APPROVAL']['item_id']}",
            json={"status": "APPROVED", "notes": None},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(approve_without_comment_response.status_code, 422)
        self.assertIn("audit comment", approve_without_comment_response.text.lower())

        approve_response = self.client.patch(
            f"/operations/work-items/{work_items['CREDIT_APPROVAL']['item_id']}",
            json={"status": "APPROVED", "notes": "Approved by credit duty officer."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(approve_response.status_code, 200)
        self.assertEqual(approve_response.json()["status"], "APPROVED")
        self.assertEqual(len(approve_response.json()["credit_decision_history"]), 1)
        self.assertIsNotNone(approve_response.json()["active_credit_exception"])
        self.assertEqual(
            approve_response.json()["active_credit_exception"]["approved_projected_exposure_amount"],
            79250.0,
        )

        release_response = self.client.patch(
            f"/operations/work-items/{work_items['CONFIRMATION']['item_id']}",
            json={"status": "CONFIRMED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(release_response.status_code, 200)
        self.assertEqual(release_response.json()["status"], "CONFIRMED")

    def test_credit_approval_requires_credit_authorized_role_and_records_decision_history(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_counterparty_credit_profile()
        self._seed_counterparty_external_credit_snapshot()
        self._create_user(
            user_id="plain_trader",
            email="plain-trader@example.com",
            display_name="Plain Trader",
            role="TRADER",
        )
        self._create_user(
            user_id="credit_approver",
            email="credit-approver@example.com",
            display_name="Credit Approver",
            role="CREDIT_APPROVER",
        )
        trader_token = self._login(identifier="plain_trader", password="supersecret2")
        credit_token = self._login(identifier="credit_approver", password="supersecret2")
        self._seed_trade(trade_id="T-CREDIT-ROLE-1")
        self._seed_credit_approval_item(
            trade_id="T-CREDIT-ROLE-1",
            notes="Exposure breach opened for review.",
        )

        queue_response = self._get_work_items(
            admin_token,
            query="queue=operations&include_closed=true",
        )
        self.assertEqual(queue_response.status_code, 200)
        work_item = next(
            item
            for item in queue_response.json()
            if item["trade_id"] == "T-CREDIT-ROLE-1" and item["workflow_type"] == "CREDIT_APPROVAL"
        )
        self.assertEqual(work_item["credit_approval_freshness"]["approval_blocked"], False)
        self.assertEqual(
            work_item["credit_approval_freshness"]["latest_external_snapshot_provider"],
            "DNB",
        )

        unauthorized_response = self.client.patch(
            f"/operations/work-items/{work_item['item_id']}",
            json={"status": "APPROVED", "notes": "Desk attempted to release the hold."},
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(unauthorized_response.status_code, 403)
        self.assertIn("credit_approver", unauthorized_response.text.lower())

        approved_response = self.client.patch(
            f"/operations/work-items/{work_item['item_id']}",
            json={"status": "APPROVED", "notes": "Approved after documented credit review."},
            headers={"Authorization": f"Bearer {credit_token}"},
        )
        self.assertEqual(approved_response.status_code, 200)
        approved_payload = approved_response.json()
        self.assertEqual(approved_payload["status"], "APPROVED")
        self.assertEqual(len(approved_payload["credit_decision_history"]), 1)
        decision = approved_payload["credit_decision_history"][0]
        self.assertEqual(decision["decision"], "APPROVED")
        self.assertEqual(decision["decision_comment"], "Approved after documented credit review.")
        self.assertEqual(decision["decided_by"], "credit_approver")
        self.assertEqual(decision["trade_id"], "T-CREDIT-ROLE-1")
        self.assertEqual(decision["workflow_item_id"], work_item["item_id"])
        self.assertEqual(decision["breach_snapshot"]["trade_id"], "T-CREDIT-ROLE-1")
        self.assertEqual(decision["breach_snapshot"]["comparison_reason"], "comparable")
        self.assertIsNotNone(approved_payload["active_credit_exception"])
        self.assertEqual(
            approved_payload["active_credit_exception"]["status"],
            "ACTIVE",
        )
        self.assertEqual(
            approved_payload["active_credit_exception"]["approved_by"],
            "credit_approver",
        )

        with self.SessionLocal() as session:
            decisions = session.query(TradeCreditApprovalDecision).all()
            exceptions = session.query(TradeCreditException).all()
            self.assertEqual(len(decisions), 1)
            self.assertEqual(len(exceptions), 1)
            self.assertEqual(decisions[0].decided_by, "credit_approver")
            self.assertEqual(decisions[0].decision_comment, "Approved after documented credit review.")
            self.assertEqual(exceptions[0].approved_by, "credit_approver")
            self.assertEqual(float(exceptions[0].approved_projected_exposure_amount), 79250.0)

    def test_credit_approval_blocks_when_internal_review_is_overdue(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_counterparty_credit_profile(review_due_at=self.now.date() - timedelta(days=1))
        self._seed_counterparty_external_credit_snapshot()
        self._seed_trade(trade_id="T-CREDIT-STALE-REVIEW")
        self._seed_credit_approval_item(
            trade_id="T-CREDIT-STALE-REVIEW",
            notes="Exposure breach opened for review.",
        )

        queue_response = self._get_work_items(
            admin_token,
            query="queue=operations&include_closed=true",
        )
        self.assertEqual(queue_response.status_code, 200)
        work_item = next(
            item
            for item in queue_response.json()
            if item["trade_id"] == "T-CREDIT-STALE-REVIEW" and item["workflow_type"] == "CREDIT_APPROVAL"
        )
        self.assertEqual(work_item["credit_approval_freshness"]["approval_blocked"], True)
        self.assertIn(
            "overdue",
            " ".join(work_item["credit_approval_freshness"]["blocking_reasons"]).lower(),
        )
        action_states = {row["key"]: row for row in work_item["action_states"]}
        self.assertFalse(action_states["approve"]["available"])
        self.assertIn("overdue", (action_states["approve"]["blocked_reason"] or "").lower())

        response = self.client.patch(
            f"/operations/work-items/{work_item['item_id']}",
            json={"status": "APPROVED", "notes": "Attempted approval with overdue review."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("overdue", response.text.lower())
        self.assertIn("review", response.text.lower())

        with self.SessionLocal() as session:
            self.assertEqual(session.query(TradeCreditApprovalDecision).count(), 0)
            self.assertEqual(session.query(TradeCreditException).count(), 0)

    def test_credit_approval_blocks_when_external_snapshot_is_stale(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_counterparty_credit_profile()
        self._seed_counterparty_external_credit_snapshot(
            as_of_date=self.now.date() - timedelta(days=31)
        )
        self._seed_trade(trade_id="T-CREDIT-STALE-SNAPSHOT")
        self._seed_credit_approval_item(
            trade_id="T-CREDIT-STALE-SNAPSHOT",
            notes="Exposure breach opened for review.",
        )

        queue_response = self._get_work_items(
            admin_token,
            query="queue=operations&include_closed=true",
        )
        self.assertEqual(queue_response.status_code, 200)
        work_item = next(
            item
            for item in queue_response.json()
            if item["trade_id"] == "T-CREDIT-STALE-SNAPSHOT" and item["workflow_type"] == "CREDIT_APPROVAL"
        )
        self.assertEqual(work_item["credit_approval_freshness"]["approval_blocked"], True)
        self.assertIn(
            "freshness limit",
            " ".join(work_item["credit_approval_freshness"]["blocking_reasons"]).lower(),
        )

        response = self.client.patch(
            f"/operations/work-items/{work_item['item_id']}",
            json={"status": "APPROVED", "notes": "Attempted approval with stale vendor data."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("external credit snapshot", response.text.lower())
        self.assertIn("30-day freshness limit", response.text)

        with self.SessionLocal() as session:
            self.assertEqual(session.query(TradeCreditApprovalDecision).count(), 0)
            self.assertEqual(session.query(TradeCreditException).count(), 0)

    def test_work_item_mutations_require_authentication(self) -> None:
        self._seed_trade(trade_id="T-AUTH-1")
        queue_response = self.client.get("/operations/work-items?include_closed=true")
        self.assertEqual(queue_response.status_code, 401)
        admin_token = self._bootstrap_admin()
        queue_response = self._get_work_items(admin_token, query="include_closed=true")
        self.assertEqual(queue_response.status_code, 200)
        item_id = queue_response.json()[0]["item_id"]

        response = self.client.patch(f"/operations/work-items/{item_id}", json={"owner": "ops.alpha"})
        self.assertEqual(response.status_code, 401)

    def test_workspace_summary_reports_total_and_queue_scoped_counts(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-SUM-1")
        self._seed_trade(trade_id="T-SUM-2", status="CANCELLED", settlement_status="SETTLED")

        with self.SessionLocal() as session:
            session.add(
                Position(
                    commodity="WTI",
                    net_volume=1000,
                    updated_at=self.now,
                )
            )
            session.add(
                OptionExposure(
                    trade_id="T-SUM-1",
                    book="CRUDE_PHYS",
                    portfolio="PROMPT",
                    counterparty="SHELL_TRADING",
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    trade_side="BUY",
                    option_type="CALL",
                    option_style="AMERICAN",
                    option_strike_price=80,
                    option_expiration_date=date(2026, 4, 30),
                    contract_volume=250,
                    premium_price=1.25,
                    premium_cashflow=312.5,
                    underlying_equivalent_volume=250,
                    trade_currency_code="USD",
                    price_unit_code="BBL",
                    updated_at=self.now,
                )
            )
            session.add(
                DeliveryObligation(
                    delivery_id="DLV-T-SUM-1",
                    trade_id="T-SUM-1",
                    trade_leg_id=None,
                    leg_no=None,
                    external_trade_id="EXT-T-SUM-1",
                    direction="BUY",
                    mode_family="NETWORK_FLOW",
                    transport_mode="PIPELINE",
                    transport_mode_source="DERIVED",
                    delivery_profile="FLOW_WINDOW",
                    book="CRUDE_PHYS",
                    book_source="TRADE_DERIVED",
                    portfolio="PROMPT",
                    portfolio_source="TRADE_DERIVED",
                    counterparty="SHELL_TRADING",
                    counterparty_source="TRADE_DERIVED",
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    volume=1000,
                    unit_of_measure="BBL",
                    trade_currency_code="USD",
                    price_unit_code="BBL",
                    location_code="CUSHING",
                    location_source="TRADE_DERIVED",
                    delivery_start=date(2026, 4, 7),
                    delivery_end=date(2026, 4, 9),
                    delivery_window_source="TRADE_DERIVED",
                    execution_status="PLANNED",
                    execution_status_source="SYSTEM_GENERATED",
                    operations_owner=None,
                    operations_owner_source="SYSTEM_GENERATED",
                    external_reference=None,
                    external_reference_source="SYSTEM_GENERATED",
                    ops_notes=None,
                    ops_notes_source="SYSTEM_GENERATED",
                    booked_at=self.now,
                    source_trade_updated_at=self.now,
                    created_at=self.now,
                    created_by="ops_admin",
                    updated_at=self.now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.add(
                TradeConfirmation(
                    trade_id="T-SUM-1",
                    source_document_id=None,
                    confirmation_number="CONF-T-SUM-1",
                    status="SENT",
                    sent_at=self.now,
                    confirmed_at=None,
                    issue_count=1,
                    last_issued_at=self.now,
                    last_issued_by="ops_admin",
                    last_issue_method="EMAIL",
                    last_issue_recipient="ops@example.com",
                    last_issue_note=None,
                    receipt_status="ISSUED",
                    received_at=None,
                    received_by=None,
                    response_method=None,
                    response_reference=None,
                    response_note=None,
                    dispute_reason=None,
                    notes=None,
                    comparison_waiver_note=None,
                    comparison_waived_at=None,
                    comparison_waived_by=None,
                    created_at=self.now,
                    created_by="ops_admin",
                    updated_at=self.now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.add(
                TradeWorkflowItem(
                    trade_id="T-SUM-1",
                    workflow_type="CONFIRMATION",
                    status="PENDING",
                    owner=None,
                    due_at=None,
                    notes="Pending confirmation.",
                    created_at=self.now,
                    created_by="ops_admin",
                    updated_at=self.now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.add(
                TradeWorkflowItem(
                    trade_id="T-SUM-2",
                    workflow_type="NOMINATION",
                    status="COMPLETED",
                    owner=None,
                    due_at=None,
                    notes="Closed nomination.",
                    created_at=self.now,
                    created_by="ops_admin",
                    updated_at=self.now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.add(
                TradeWorkflowItem(
                    trade_id="T-SUM-1",
                    workflow_type="PAYMENT",
                    status="PENDING",
                    owner=None,
                    due_at=None,
                    notes="Pending payment.",
                    created_at=self.now,
                    created_by="ops_admin",
                    updated_at=self.now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            invoice = TradeInvoice(
                trade_id="T-SUM-1",
                delivery_id="DLV-T-SUM-1",
                leg_no=None,
                invoice_number="INV-T-SUM-1",
                invoice_currency_code="USD",
                billed_quantity=1000,
                quantity_unit_code="BBL",
                invoice_amount=79250,
                status="ISSUED",
                issued_at=self.now,
                due_at=self.now + timedelta(days=10),
                dispute_reason=None,
                notes=None,
                created_at=self.now,
                created_by="ops_admin",
                updated_at=self.now,
                updated_by="ops_admin",
                version=1,
            )
            session.add(invoice)
            session.flush()
            session.add(
                TradePayment(
                    trade_id="T-SUM-1",
                    invoice_id=invoice.id,
                    payment_reference="PAY-T-SUM-1",
                    payment_currency_code="USD",
                    payment_amount=79250,
                    status="PENDING",
                    due_at=self.now + timedelta(days=10),
                    received_at=None,
                    notes=None,
                    created_at=self.now,
                    created_by="ops_admin",
                    updated_at=self.now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.commit()

        response = self.client.get(
            "/operations/workspace-summary",
            headers=self._auth_headers(admin_token),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["trades"]["total_count"], 2)
        self.assertEqual(payload["trades"]["active_count"], 1)
        self.assertEqual(payload["trades"]["priced_active_count"], 1)
        self.assertEqual(payload["trades"]["pending_pricing_count"], 0)
        self.assertEqual(payload["trades"]["pending_settlement_count"], 1)
        self.assertEqual(payload["trades"]["tracked_book_count"], 1)
        self.assertEqual(payload["trades"]["total_active_volume"], 1000.0)
        self.assertEqual(payload["positions"]["total_count"], 1)
        self.assertEqual(payload["option_exposures"]["total_count"], 1)
        self.assertEqual(payload["deliveries"]["total_count"], 1)
        self.assertEqual(payload["confirmations"]["total_count"], 1)
        self.assertEqual(payload["work_items"]["total_count"], 2)
        self.assertEqual(payload["work_items"]["operations_queue_count"], 1)
        self.assertEqual(payload["work_items"]["settlement_queue_count"], 1)
        self.assertEqual(payload["invoices"]["total_count"], 1)
        self.assertEqual(payload["payments"]["total_count"], 1)
        self.assertEqual(payload["dashboard"]["positions"]["gross_exposure"], 1000.0)
        self.assertEqual(payload["dashboard"]["positions"]["position_count"], 1)
        self.assertEqual(payload["dashboard"]["positions"]["bucket_count"], 1)
        self.assertEqual(payload["dashboard"]["positions"]["buckets"][0]["commodity_class"], "CRUDE_OIL")
        self.assertEqual(payload["dashboard"]["positions"]["buckets"][0]["unit_label"], "BBL")
        self.assertEqual(payload["dashboard"]["attention"]["total_count"], 1)
        self.assertEqual(payload["dashboard"]["attention"]["confirmation_backlog_count"], 1)
        self.assertEqual(payload["dashboard"]["attention"]["nomination_backlog_count"], 1)
        self.assertEqual(payload["dashboard"]["attention"]["invoice_backlog_count"], 1)
        self.assertEqual(payload["dashboard"]["attention"]["overdue_payment_count"], 0)
        self.assertEqual(payload["settlement"]["open_work_item_count"], 1)
        self.assertEqual(payload["settlement"]["invoice_pending_count"], 0)
        self.assertEqual(payload["settlement"]["payment_due_count"], 0)
        self.assertEqual(payload["settlement"]["settled_count"], 0)
        self.assertEqual(payload["settlement"]["trade_exception_count"], 0)
        self.assertEqual(payload["settlement"]["workflow_exception_count"], 0)
        self.assertEqual(payload["settlement"]["breakdown"], [{"status": "PENDING", "count": 1}])

    def test_trade_attention_candidates_endpoint_returns_typed_candidate_rows(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-ATTN-1", confirmation_status="PENDING")

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-ATTN-1")
            assert trade is not None
            trade.execution_timestamp = self.now - timedelta(days=2)
            session.commit()

        response = self.client.get(
            "/operations/trade-attention-candidates?candidate_type=confirmation_backlog",
            headers=self._auth_headers(admin_token),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["candidate_type"], "confirmation_backlog")
        self.assertEqual(
            payload["source_count_key"],
            "dashboard.attention.confirmation_backlog_count",
        )
        self.assertEqual(payload["items"][0]["trade_id"], "T-ATTN-1")
        self.assertEqual(payload["items"][0]["candidate_types"], ["confirmation_backlog"])
        self.assertEqual(
            payload["items"][0]["priority_reason"],
            "Older unconfirmed trades rise first in the confirmation queue.",
        )

    def test_trade_attention_candidates_endpoint_supports_offset_pagination(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-ATTN-1", confirmation_status="PENDING")
        self._seed_trade(trade_id="T-ATTN-2", confirmation_status="PENDING")

        with self.SessionLocal() as session:
            first_trade = session.get(Trade, "T-ATTN-1")
            second_trade = session.get(Trade, "T-ATTN-2")
            assert first_trade is not None
            assert second_trade is not None
            first_trade.execution_timestamp = self.now - timedelta(days=3)
            second_trade.execution_timestamp = self.now - timedelta(days=2)
            session.commit()

        response = self.client.get(
            "/operations/trade-attention-candidates?candidate_type=confirmation_backlog&limit=1&offset=1",
            headers=self._auth_headers(admin_token),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["total_count"], 2)
        self.assertEqual(payload["candidate_type"], "confirmation_backlog")
        self.assertEqual(payload["candidate_type_counts"], {"confirmation_backlog": 1})
        self.assertEqual(payload["items"][0]["trade_id"], "T-ATTN-2")

    def test_trade_attention_candidates_prioritize_nomination_backlog_by_delivery_window(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-NOM-SOON", nomination_status="PENDING")
        self._seed_trade(trade_id="T-NOM-LATER", nomination_status="PENDING")

        with self.SessionLocal() as session:
            soon_trade = session.get(Trade, "T-NOM-SOON")
            later_trade = session.get(Trade, "T-NOM-LATER")
            assert soon_trade is not None
            assert later_trade is not None
            soon_trade.delivery_start = self.now.date() + timedelta(days=1)
            soon_trade.delivery_end = self.now.date() + timedelta(days=1)
            later_trade.delivery_start = self.now.date() + timedelta(days=3)
            later_trade.delivery_end = self.now.date() + timedelta(days=3)
            session.commit()

        response = self.client.get(
            "/operations/trade-attention-candidates?candidate_type=nomination_backlog",
            headers=self._auth_headers(admin_token),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(
            [item["trade_id"] for item in payload["items"]],
            ["T-NOM-SOON", "T-NOM-LATER"],
        )
        self.assertEqual(
            payload["items"][0]["priority_reason"],
            "Delivery-near trades rise first in the nomination queue.",
        )

    def test_trade_attention_candidates_prioritize_disputed_settlement_exceptions_first(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(
            trade_id="T-SET-DISPUTED",
            invoice_status="DISPUTED",
            payment_status="PENDING",
            settlement_status="DISPUTED",
        )
        self._seed_trade(
            trade_id="T-SET-OVERDUE",
            invoice_status="ISSUED",
            payment_status="OVERDUE",
            settlement_status="INVOICED",
        )

        response = self.client.get(
            "/operations/trade-attention-candidates?candidate_type=settlement_exception",
            headers=self._auth_headers(admin_token),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(
            [item["trade_id"] for item in payload["items"]],
            ["T-SET-DISPUTED", "T-SET-OVERDUE"],
        )
        self.assertEqual(payload["items"][0]["priority_reason"], "Disputed settlement exceptions rise first.")
        self.assertEqual(
            payload["items"][1]["priority_reason"],
            "Overdue cash exceptions rise after disputed items.",
        )

    def test_trade_attention_candidates_prioritize_overdue_cash_before_due_cash(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(
            trade_id="T-PMT-OVERDUE",
            invoice_status="ISSUED",
            payment_status="OVERDUE",
            settlement_status="INVOICED",
        )
        self._seed_trade(
            trade_id="T-PMT-DUE",
            invoice_status="ISSUED",
            payment_status="DUE",
            settlement_status="INVOICED",
        )

        response = self.client.get(
            "/operations/trade-attention-candidates?candidate_type=payment_due",
            headers=self._auth_headers(admin_token),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(
            [item["trade_id"] for item in payload["items"]],
            ["T-PMT-OVERDUE", "T-PMT-DUE"],
        )
        self.assertEqual(
            payload["items"][0]["priority_reason"],
            "Overdue cash rises ahead of merely due payments.",
        )
        self.assertEqual(
            payload["items"][1]["priority_reason"],
            "Due cash follows overdue items, then older trades.",
        )

    def test_operational_resource_descriptors_endpoint_exposes_registry_metadata(self) -> None:
        response = self.client.get("/operations/resources")

        self.assertEqual(response.status_code, 200)
        descriptors = {row["resource_key"]: row for row in response.json()}
        self.assertEqual(
            set(descriptors),
            {
                "confirmations",
                "deliveries",
                "document_record_creation_requests",
                "shipments",
                "invoices",
                "payments",
                "work_items",
            },
        )
        self.assertEqual(descriptors["confirmations"]["filters"], ["trade_id"])
        self.assertEqual(descriptors["deliveries"]["actions"][0], "sync_from_trades")
        self.assertIn("append_event", descriptors["deliveries"]["actions"])
        self.assertEqual(descriptors["payments"]["sort_fields"], ["trade_id asc", "due_at asc", "id asc"])
        self.assertEqual(descriptors["work_items"]["actions"], ["create", "update", "book_underlying"])
        confirmation_surface_actions = {
            row["key"]: row for row in descriptors["confirmations"]["surface"]["actions"]
        }
        self.assertEqual(
            confirmation_surface_actions["issue"]["label"],
            "Issue Confirmation",
        )
        self.assertTrue(confirmation_surface_actions["disputed"]["comment_required"])
        self.assertEqual(
            confirmation_surface_actions["disputed"]["comment_hint"],
            "Add a dispute reason or response note before marking the confirmation as disputed.",
        )
        workflow_surface_actions = {
            row["key"]: row for row in descriptors["work_items"]["surface"]["actions"]
        }
        self.assertEqual(
            workflow_surface_actions["approve"]["permission_message"],
            "Only authorized credit approvers can approve credit workflow items.",
        )
        self.assertEqual(descriptors["confirmations"]["surface"]["title"], "Confirmation Ledger")
        self.assertEqual(descriptors["work_items"]["surface"]["board_section"], "Critical Path")
        self.assertEqual(
            descriptors["payments"]["surface"]["primary_action"]["label"],
            "Record payment",
        )
        self.assertEqual(
            descriptors["deliveries"]["surface"]["empty_state"]["title"],
            "No delivery board",
        )
        self.assertEqual(
            len(descriptors["invoices"]["surface"]["summary_stats"]),
            3,
        )


if __name__ == "__main__":
    unittest.main()
