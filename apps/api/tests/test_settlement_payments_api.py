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
from apps.api.app.models.event import Event
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class SettlementPaymentsApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 6, 18, 0, tzinfo=timezone.utc)
        self._previous_bootstrap_admin_token = settings.BOOTSTRAP_ADMIN_TOKEN
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"

        with self.SessionLocal() as session:
            session.query(TradePayment).delete()
            session.query(TradeActualization).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeWorkflowItem).delete()
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
                "user_id": "settlement_admin",
                "email": "settlement@example.com",
                "display_name": "Settlement Admin",
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
                    created_by="settlement_admin",
                    updated_at=self.now,
                    updated_by="settlement_admin",
                    version=1,
                )
            )
            session.commit()

    def _login(self, *, identifier: str, password: str = "supersecret2") -> str:
        response = self.client.post("/auth/session", json={"identifier": identifier, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def _seed_trade(self, *, trade_id: str) -> None:
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id=trade_id,
                    external_trade_id=f"EXT-{trade_id}",
                    source_system="ETRM",
                    created_at=self.now,
                    updated_at=self.now,
                    execution_timestamp=self.now,
                    trade_date=date(2026, 4, 6),
                    effective_start_date=date(2026, 4, 8),
                    effective_end_date=date(2026, 4, 10),
                    quality_spec=None,
                    unit_of_measure="BBL",
                    trade_currency_code="USD",
                    location_code="CUSHING",
                    delivery_start=date(2026, 4, 8),
                    delivery_end=date(2026, 4, 10),
                    price_unit_code="BBL",
                    instrument_type="LINEAR",
                    option_type=None,
                    option_style=None,
                    option_strike_price=None,
                    option_expiration_date=None,
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
                    nomination_status="PENDING",
                    allocation_status="PENDING",
                    actualization_status="PENDING",
                    price_index_code=None,
                    price=80,
                    volume=1000,
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    trader_user="trader.alpha",
                    status="ACTIVE",
                    last_event_id=f"evt-{trade_id.lower()}",
                )
            )
            session.commit()

    def _issue_invoice(self, admin_token: str, *, trade_id: str, invoice_amount: float, due_at: str) -> int:
        response = self.client.post(
            "/settlement/invoices",
            json={
                "trade_id": trade_id,
                "invoice_number": f"INV-{trade_id}",
                "invoice_amount": invoice_amount,
                "due_at": due_at,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["invoice_id"]

    def test_create_full_payment_settles_trade_and_payment_workflow(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-PMT-1")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-1",
            invoice_amount=80000,
            due_at="2026-04-11T12:00:00Z",
        )

        response = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_reference": "WIRE-80000",
                "payment_amount": 80000,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "PAID")
        self.assertEqual(response.json()["outstanding_amount"], 0)

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-PMT-1").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-PMT-1",
                    TradeWorkflowItem.workflow_type == "PAYMENT",
                )
                .one()
            )

            self.assertEqual(trade.payment_status, "PAID")
            self.assertEqual(trade.settlement_status, "SETTLED")
            self.assertEqual(workflow_item.status, "PAID")
            self.assertIn("Paid USD 80000.00", workflow_item.notes)

    def test_accounting_role_can_create_payment(self) -> None:
        self._create_user(
            user_id="accounting.payment",
            email="accounting.payment@example.com",
            display_name="Accounting Payment",
            role="ACCOUNTING",
        )
        accounting_token = self._login(identifier="accounting.payment")
        self._seed_trade(trade_id="T-PMT-ACCOUNTING-1")
        invoice_id = self._issue_invoice(
            accounting_token,
            trade_id="T-PMT-ACCOUNTING-1",
            invoice_amount=80000,
            due_at="2026-04-11T12:00:00Z",
        )

        response = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_reference": "WIRE-ACCOUNTING-80000",
                "payment_amount": 80000,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {accounting_token}"},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "PAID")

    def test_trader_role_cannot_create_payment(self) -> None:
        admin_token = self._bootstrap_admin()
        self._create_user(
            user_id="trader.payment",
            email="trader.payment@example.com",
            display_name="Trader Payment",
            role="TRADER",
        )
        trader_token = self._login(identifier="trader.payment")
        self._seed_trade(trade_id="T-PMT-TRADER-1")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-TRADER-1",
            invoice_amount=80000,
            due_at="2026-04-11T12:00:00Z",
        )

        response = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 80000,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {trader_token}"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"],
            "Only ACCOUNTING, ACCOUNTANT, SETTLEMENT, OPS_ADMIN, or ADMIN sessions can manage settlement.",
        )

    def test_partial_payment_rolls_trade_to_partially_settled_until_fully_paid(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-PMT-2")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-2",
            invoice_amount=1000,
            due_at="2026-04-12T12:00:00Z",
        )

        first_payment = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 400,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(first_payment.status_code, 201)
        self.assertEqual(first_payment.json()["outstanding_amount"], 600)

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-PMT-2").one()
            self.assertEqual(trade.payment_status, "PENDING")
            self.assertEqual(trade.settlement_status, "PARTIALLY_SETTLED")

        second_payment = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 600,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(second_payment.status_code, 201)
        self.assertEqual(second_payment.json()["outstanding_amount"], 0)

        list_response = self.client.get(
            f"/settlement/payments?invoice_id={invoice_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()), 2)

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-PMT-2").one()
            self.assertEqual(trade.payment_status, "PAID")
            self.assertEqual(trade.settlement_status, "SETTLED")
            payment_events = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-PMT-2",
                    Event.event_type == "TradePaymentCreated",
                )
                .order_by(Event.recorded_at.asc())
                .all()
            )
            self.assertEqual(len(payment_events), 2)
            self.assertEqual(payment_events[0].payload["payment"]["payment_amount"], 400.0)
            self.assertEqual(payment_events[1].payload["payment"]["payment_amount"], 600.0)

    def test_payment_create_rejects_currency_mismatch(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-PMT-CCY-1")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-CCY-1",
            invoice_amount=1000,
            due_at="2026-04-12T12:00:00Z",
        )

        response = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_currency_code": "EUR",
                "payment_amount": 1000,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("must match invoice currency 'USD'", response.json()["detail"])

    def test_payment_update_rejects_currency_mismatch(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-PMT-CCY-2")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-CCY-2",
            invoice_amount=1000,
            due_at="2026-04-12T12:00:00Z",
        )

        create_response = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 500,
                "status": "PENDING",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        payment_id = create_response.json()["payment_id"]

        patch_response = self.client.patch(
            f"/settlement/payments/{payment_id}",
            json={"payment_currency_code": "EUR"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(patch_response.status_code, 422)
        self.assertIn("must match invoice currency 'USD'", patch_response.json()["detail"])

    def test_payment_projection_ignores_legacy_mismatched_currency_rows(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-PMT-CCY-3")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-CCY-3",
            invoice_amount=1000,
            due_at="2026-04-12T12:00:00Z",
        )

        with self.SessionLocal() as session:
            session.add(
                TradePayment(
                    trade_id="T-PMT-CCY-3",
                    invoice_id=invoice_id,
                    payment_reference="LEGACY-EUR-1",
                    payment_currency_code="EUR",
                    payment_amount=400,
                    status="PAID",
                    due_at=datetime(2026, 4, 12, 12, 0, tzinfo=timezone.utc),
                    received_at=datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
                    notes="Legacy mismatched payment",
                    created_at=self.now,
                    created_by="cash.ops",
                    updated_at=self.now,
                    updated_by="cash.ops",
                    version=1,
                )
            )
            session.commit()

        list_response = self.client.get(
            f"/settlement/payments?invoice_id={invoice_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()), 1)
        self.assertEqual(list_response.json()[0]["payment_currency_code"], "EUR")
        self.assertEqual(list_response.json()[0]["total_paid_amount"], 0)
        self.assertEqual(list_response.json()[0]["outstanding_amount"], 1000)

    def test_payment_create_rejects_amount_above_remaining_open_balance(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-PMT-OVR-1")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-OVR-1",
            invoice_amount=1000,
            due_at="2026-04-12T12:00:00Z",
        )

        first_payment = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 400,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(first_payment.status_code, 201)

        second_payment = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 700,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(second_payment.status_code, 422)
        self.assertIn("remaining open balance of USD 600.00", second_payment.json()["detail"])

    def test_payment_update_rejects_amount_above_remaining_open_balance(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-PMT-OVR-2")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-OVR-2",
            invoice_amount=1000,
            due_at="2026-04-12T12:00:00Z",
        )

        first_payment = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 400,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(first_payment.status_code, 201)

        second_payment = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 500,
                "status": "PENDING",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(second_payment.status_code, 201)
        payment_id = second_payment.json()["payment_id"]

        patch_response = self.client.patch(
            f"/settlement/payments/{payment_id}",
            json={"payment_amount": 700},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(patch_response.status_code, 422)
        self.assertIn("remaining open balance of USD 600.00", patch_response.json()["detail"])

    def test_payment_patch_marks_pending_payment_as_paid(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-PMT-3")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-3",
            invoice_amount=500,
            due_at="2026-04-09T12:00:00Z",
        )

        create_response = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 500,
                "status": "PENDING",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        payment_id = create_response.json()["payment_id"]

        patch_response = self.client.patch(
            f"/settlement/payments/{payment_id}",
            json={"received_at": "2026-04-07T12:00:00Z"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.json()["status"], "PAID")

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-PMT-3").one()
            self.assertEqual(trade.payment_status, "PAID")
            self.assertEqual(trade.settlement_status, "SETTLED")
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-PMT-3",
                    Event.event_type == "TradePaymentUpdated",
                )
                .one()
            )
            self.assertEqual(
                datetime.fromisoformat(
                    audit_event.payload["requested_changes"]["received_at"].replace("Z", "+00:00")
                ),
                datetime(2026, 4, 7, 12, 0, tzinfo=timezone.utc),
            )
            self.assertEqual(audit_event.payload["payment"]["status"], "PAID")

    def test_payment_mutations_require_authentication_and_block_workflow_status_override(self) -> None:
        self._seed_trade(trade_id="T-PMT-4")
        response = self.client.post("/settlement/payments", json={"invoice_id": 1})
        self.assertEqual(response.status_code, 401)

        admin_token = self._bootstrap_admin()
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-4",
            invoice_amount=750,
            due_at="2026-04-10T12:00:00Z",
        )
        create_response = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_amount": 750,
                "status": "PENDING",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)

        work_items_response = self.client.get(
            "/operations/work-items?include_closed=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(work_items_response.status_code, 200)
        payment_item = next(item for item in work_items_response.json() if item["trade_id"] == "T-PMT-4" and item["workflow_type"] == "PAYMENT")

        override_response = self.client.patch(
            f"/operations/work-items/{payment_item['item_id']}",
            json={"status": "PAID"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(override_response.status_code, 422)
        self.assertIn("ledger-managed", override_response.json()["detail"])

    def test_paginated_payment_list_uses_full_invoice_payment_history_for_projection(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-PMT-5")
        invoice_id = self._issue_invoice(
            admin_token,
            trade_id="T-PMT-5",
            invoice_amount=1000,
            due_at="2026-04-12T12:00:00Z",
        )

        first_payment = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_reference": "WIRE-400",
                "payment_amount": 400,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(first_payment.status_code, 201)

        second_payment = self.client.post(
            "/settlement/payments",
            json={
                "invoice_id": invoice_id,
                "payment_reference": "WIRE-200",
                "payment_amount": 200,
                "status": "PAID",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(second_payment.status_code, 201)

        first_page = self.client.get(
            f"/settlement/payments?invoice_id={invoice_id}&limit=1&offset=0",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(first_page.status_code, 200)
        self.assertEqual(len(first_page.json()), 1)
        self.assertEqual(first_page.json()[0]["payment_reference"], "WIRE-400")
        self.assertEqual(first_page.json()[0]["total_paid_amount"], 600)
        self.assertEqual(first_page.json()[0]["outstanding_amount"], 400)

        second_page = self.client.get(
            f"/settlement/payments?invoice_id={invoice_id}&limit=1&offset=1",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(second_page.status_code, 200)
        self.assertEqual(len(second_page.json()), 1)
        self.assertEqual(second_page.json()[0]["payment_reference"], "WIRE-200")
        self.assertEqual(second_page.json()[0]["total_paid_amount"], 600)
        self.assertEqual(second_page.json()[0]["outstanding_amount"], 400)


if __name__ == "__main__":
    unittest.main()
