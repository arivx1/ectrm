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


class SettlementInvoicesApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 5, 19, 30, tzinfo=timezone.utc)
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
                    trade_date=date(2026, 4, 5),
                    effective_start_date=date(2026, 4, 7),
                    effective_end_date=date(2026, 4, 9),
                    quality_spec=None,
                    unit_of_measure="BBL",
                    trade_currency_code="USD",
                    location_code="CUSHING",
                    delivery_start=date(2026, 4, 7),
                    delivery_end=date(2026, 4, 9),
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
                    nomination_status="PENDING",
                    allocation_status="PENDING",
                    actualization_status="PENDING",
                    price_index_code=None,
                    price=79.25,
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

    def _actualize_trade(
        self,
        admin_token: str,
        *,
        trade_id: str,
        actual_quantity: float,
        actualized_at: str = "2026-04-09T12:00:00Z",
    ) -> None:
        response = self.client.put(
            f"/shipments/{trade_id}/actualization",
            json={
                "actual_quantity": actual_quantity,
                "actualized_at": actualized_at,
                "source": "OPS",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)

    def _seed_credit_approval_item(
        self,
        *,
        trade_id: str,
        status: str = "PENDING_REVIEW",
        notes: str = "",
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

    def test_issue_invoice_creates_ledger_record_and_rolls_trade_statuses(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-1")

        response = self.client.post(
            "/settlement/invoices",
            json={
                "trade_id": "T-INV-1",
                "invoice_number": "INV-1001",
                "invoice_amount": 79250,
                "due_at": "2026-04-10T12:00:00Z",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["status"], "ISSUED")
        self.assertEqual(body["trade_id"], "T-INV-1")
        self.assertEqual(body["invoice_number"], "INV-1001")

        list_response = self.client.get(
            "/settlement/invoices?trade_id=T-INV-1",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.json()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["book"], "CRUDE_PHYS")
        self.assertEqual(listed[0]["counterparty"], "SHELL_TRADING")

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-INV-1").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-INV-1",
                    TradeWorkflowItem.workflow_type == "INVOICE",
                )
                .one()
            )

            self.assertEqual(trade.invoice_status, "ISSUED")
            self.assertEqual(trade.settlement_status, "INVOICED")
            self.assertEqual(workflow_item.status, "ISSUED")
            self.assertIsNotNone(workflow_item.due_at)
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-INV-1",
                    Event.event_type == "TradeInvoiceIssued",
                )
                .one()
            )
            self.assertEqual(audit_event.actor_id, "settlement_admin")
            self.assertEqual(audit_event.payload["request"]["trade_id"], "T-INV-1")
            self.assertEqual(audit_event.payload["invoice"]["invoice_number"], "INV-1001")

    def test_invoice_issue_candidates_endpoint_lists_unissued_trade_candidates(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-CANDIDATE")

        response = self.client.get(
            "/settlement/invoice-issue-candidates",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["count"], payload["ready_count"] + payload["blocked_count"])
        self.assertEqual(payload["items"][0]["trade_id"], "T-INV-CANDIDATE")
        self.assertIn(payload["items"][0]["readiness_status"], {"READY", "BLOCKED"})
        self.assertIn("priority_reason", payload["items"][0])
        self.assertEqual(payload["items"][0]["recommended_action"]["action_type"], "issue_trade_invoice")

    def test_invoice_issue_candidates_prioritize_ready_rows_before_blocked_rows(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-READY")
        self._seed_trade(trade_id="T-INV-BLOCKED")
        self._actualize_trade(admin_token, trade_id="T-INV-READY", actual_quantity=1000)

        with self.SessionLocal() as session:
            ready_trade = session.query(Trade).filter(Trade.trade_id == "T-INV-READY").one()
            blocked_trade = session.query(Trade).filter(Trade.trade_id == "T-INV-BLOCKED").one()
            ready_trade.execution_timestamp = self.now - timedelta(days=2)
            blocked_trade.execution_timestamp = self.now - timedelta(days=4)
            blocked_trade.credit_hold_active = True
            blocked_trade.credit_hold_reason = "Credit owner review still pending."
            session.commit()

        response = self.client.get(
            "/settlement/invoice-issue-candidates",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(
            [item["trade_id"] for item in payload["items"]],
            ["T-INV-READY", "T-INV-BLOCKED"],
        )
        self.assertEqual(payload["items"][0]["readiness_status"], "READY")
        self.assertEqual(payload["items"][1]["readiness_status"], "BLOCKED")
        self.assertEqual(
            payload["items"][0]["priority_reason"],
            "Ready-to-issue invoice candidates rise before blocked previews.",
        )
        self.assertEqual(
            payload["items"][1]["priority_reason"],
            "Blocked invoice previews follow ready rows; older blocked items rise first.",
        )

    def test_accounting_role_can_issue_invoice(self) -> None:
        self._create_user(
            user_id="accounting.invoice",
            email="accounting.invoice@example.com",
            display_name="Accounting Invoice",
            role="ACCOUNTING",
        )
        accounting_token = self._login(identifier="accounting.invoice")
        self._seed_trade(trade_id="T-INV-ACCOUNTING-1")

        response = self.client.post(
            "/settlement/invoices",
            json={
                "trade_id": "T-INV-ACCOUNTING-1",
                "invoice_number": "INV-ACCOUNTING-1001",
                "invoice_amount": 79250,
            },
            headers={"Authorization": f"Bearer {accounting_token}"},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["invoice_number"], "INV-ACCOUNTING-1001")

    def test_trader_role_cannot_issue_invoice(self) -> None:
        self._create_user(
            user_id="trader.invoice",
            email="trader.invoice@example.com",
            display_name="Trader Invoice",
            role="TRADER",
        )
        trader_token = self._login(identifier="trader.invoice")
        self._seed_trade(trade_id="T-INV-TRADER-1")

        response = self.client.post(
            "/settlement/invoices",
            json={
                "trade_id": "T-INV-TRADER-1",
                "invoice_number": "INV-TRADER-1001",
                "invoice_amount": 79250,
            },
            headers={"Authorization": f"Bearer {trader_token}"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"],
            "Only ACCOUNTING, ACCOUNTANT, SETTLEMENT, OPS_ADMIN, or ADMIN sessions can manage settlement.",
        )

    def test_invoice_patch_approve_rolls_trade_and_workflow_forward(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-2")
        create_response = self.client.post(
            "/settlement/invoices",
            json={
                "trade_id": "T-INV-2",
                "invoice_number": "INV-1002",
                "invoice_amount": 79250,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        invoice_id = create_response.json()["invoice_id"]

        update_response = self.client.patch(
            f"/settlement/invoices/{invoice_id}",
            json={"status": "APPROVED", "notes": "Matched to trade economics."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["status"], "APPROVED")

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-INV-2").one()
            invoice = session.query(TradeInvoice).filter(TradeInvoice.id == invoice_id).one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-INV-2",
                    TradeWorkflowItem.workflow_type == "INVOICE",
                )
                .one()
            )

            self.assertEqual(invoice.status, "APPROVED")
            self.assertEqual(trade.invoice_status, "APPROVED")
            self.assertEqual(trade.settlement_status, "INVOICED")
            self.assertEqual(workflow_item.status, "APPROVED")

    def test_invoice_patch_dispute_requires_reason_and_rolls_trade_to_disputed(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-3")
        create_response = self.client.post(
            "/settlement/invoices",
            json={
                "trade_id": "T-INV-3",
                "invoice_number": "INV-1003",
                "invoice_amount": 79250,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        invoice_id = create_response.json()["invoice_id"]

        invalid_response = self.client.patch(
            f"/settlement/invoices/{invoice_id}",
            json={"status": "DISPUTED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(invalid_response.status_code, 422)

        update_response = self.client.patch(
            f"/settlement/invoices/{invoice_id}",
            json={"status": "DISPUTED", "dispute_reason": "Volume mismatch against nomination."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["status"], "DISPUTED")

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-INV-3").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-INV-3",
                    TradeWorkflowItem.workflow_type == "INVOICE",
                )
                .one()
            )

            self.assertEqual(trade.invoice_status, "DISPUTED")
            self.assertEqual(trade.settlement_status, "DISPUTED")
            self.assertEqual(workflow_item.status, "DISPUTED")
            self.assertEqual(workflow_item.notes, "Volume mismatch against nomination.")

    def test_credit_hold_blocks_invoice_issue_and_update(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-HOLD-1")
        self._seed_credit_approval_item(trade_id="T-INV-HOLD-1")

        blocked_issue_response = self.client.post(
            "/settlement/invoices",
            json={"trade_id": "T-INV-HOLD-1", "invoice_number": "INV-HOLD-1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(blocked_issue_response.status_code, 422)
        self.assertIn("credit hold", blocked_issue_response.text.lower())

        with self.SessionLocal() as session:
            credit_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-INV-HOLD-1",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .one()
            )
            credit_item.status = "APPROVED"
            credit_item.notes = "Approved by credit."
            credit_item.updated_at = self.now
            credit_item.updated_by = "credit.ops"
            credit_item.version += 1
            session.commit()

        create_response = self.client.post(
            "/settlement/invoices",
            json={
                "trade_id": "T-INV-HOLD-1",
                "invoice_number": "INV-HOLD-1",
                "invoice_amount": 79250,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        invoice_id = create_response.json()["invoice_id"]

        with self.SessionLocal() as session:
            credit_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-INV-HOLD-1",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .one()
            )
            credit_item.status = "REJECTED"
            credit_item.notes = "Rejected after post-book review."
            credit_item.updated_at = self.now
            credit_item.updated_by = "credit.ops"
            credit_item.version += 1
            session.commit()

        blocked_update_response = self.client.patch(
            f"/settlement/invoices/{invoice_id}",
            json={"status": "APPROVED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(blocked_update_response.status_code, 422)
        self.assertIn("credit hold", blocked_update_response.text.lower())

    def test_invoice_mutations_require_authentication(self) -> None:
        self._seed_trade(trade_id="T-INV-4")
        response = self.client.post("/settlement/invoices", json={"trade_id": "T-INV-4"})
        self.assertEqual(response.status_code, 401)

        admin_token = self._bootstrap_admin()
        create_response = self.client.post(
            "/settlement/invoices",
            json={
                "trade_id": "T-INV-4",
                "invoice_number": "INV-1004",
                "invoice_amount": 79250,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        invoice_id = create_response.json()["invoice_id"]

        patch_response = self.client.patch(
            f"/settlement/invoices/{invoice_id}",
            json={"status": "APPROVED"},
        )
        self.assertEqual(patch_response.status_code, 401)

    def test_quantity_based_invoice_requires_actualization_before_defaulting(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-ACT-1")

        response = self.client.post(
            "/settlement/invoices",
            json={"trade_id": "T-INV-ACT-1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("actualized quantity", response.text.lower())

    def test_issue_invoice_defaults_billed_quantity_and_amount_from_actualization(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-ACT-2")
        self._actualize_trade(admin_token, trade_id="T-INV-ACT-2", actual_quantity=400)

        response = self.client.post(
            "/settlement/invoices",
            json={"trade_id": "T-INV-ACT-2"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["delivery_id"], "DLV-T-INV-ACT-2")
        self.assertAlmostEqual(body["billed_quantity"], 400.0)
        self.assertAlmostEqual(body["invoice_amount"], 31700.0)
        self.assertEqual(body["payment_status"], "PENDING")
        self.assertEqual(body["settlement_status"], "INVOICED")

        with self.SessionLocal() as session:
            invoice = session.query(TradeInvoice).filter(TradeInvoice.trade_id == "T-INV-ACT-2").one()
            self.assertEqual(invoice.delivery_id, "DLV-T-INV-ACT-2")
            self.assertEqual(invoice.leg_no, None)
            self.assertAlmostEqual(float(invoice.billed_quantity), 400.0)

    def test_trade_can_carry_multiple_invoices_and_invoice_status_rolls_up(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-MULTI-1")
        self._actualize_trade(admin_token, trade_id="T-INV-MULTI-1", actual_quantity=600)

        first_response = self.client.post(
            "/settlement/invoices",
            json={
                "trade_id": "T-INV-MULTI-1",
                "invoice_number": "INV-T-INV-MULTI-1-1",
                "billed_quantity": 400,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(first_response.status_code, 201)
        first_invoice_id = first_response.json()["invoice_id"]
        self.assertAlmostEqual(first_response.json()["invoice_amount"], 31700.0)

        approve_response = self.client.patch(
            f"/settlement/invoices/{first_invoice_id}",
            json={"status": "APPROVED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(approve_response.status_code, 200)

        second_response = self.client.post(
            "/settlement/invoices",
            json={"trade_id": "T-INV-MULTI-1"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(second_response.status_code, 201)
        second_body = second_response.json()
        self.assertEqual(second_body["invoice_number"], "INV-T-INV-MULTI-1-2")
        self.assertAlmostEqual(second_body["billed_quantity"], 200.0)
        self.assertAlmostEqual(second_body["invoice_amount"], 15850.0)

        list_response = self.client.get(
            "/settlement/invoices?trade_id=T-INV-MULTI-1",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.json()
        self.assertEqual(len(listed), 2)
        self.assertEqual({row["status"] for row in listed}, {"APPROVED", "ISSUED"})

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-INV-MULTI-1").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-INV-MULTI-1",
                    TradeWorkflowItem.workflow_type == "INVOICE",
                )
                .one()
            )

            self.assertEqual(trade.invoice_status, "ISSUED")
            self.assertEqual(trade.settlement_status, "INVOICED")
            self.assertEqual(workflow_item.status, "ISSUED")


if __name__ == "__main__":
    unittest.main()
