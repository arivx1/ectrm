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
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
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
            session.query(TradeInvoice).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(Trade).delete()
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

        list_response = self.client.get("/settlement/invoices?trade_id=T-INV-1")
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

    def test_invoice_patch_approve_rolls_trade_and_workflow_forward(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-INV-2")
        create_response = self.client.post(
            "/settlement/invoices",
            json={"trade_id": "T-INV-2", "invoice_number": "INV-1002"},
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
            json={"trade_id": "T-INV-3", "invoice_number": "INV-1003"},
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
            json={"trade_id": "T-INV-HOLD-1", "invoice_number": "INV-HOLD-1"},
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
            json={"trade_id": "T-INV-4", "invoice_number": "INV-1004"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        invoice_id = create_response.json()["invoice_id"]

        patch_response = self.client.patch(
            f"/settlement/invoices/{invoice_id}",
            json={"status": "APPROVED"},
        )
        self.assertEqual(patch_response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
