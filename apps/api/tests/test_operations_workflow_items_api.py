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
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_credit_approval_decision import TradeCreditApprovalDecision
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
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeCreditApprovalDecision).delete()
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

    def _seed_trade(
        self,
        *,
        trade_id: str,
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
                    confirmation_status=confirmation_status,
                    nomination_status=nomination_status,
                    allocation_status=allocation_status,
                    price_index_code=None,
                    price=79.25,
                    volume=1000,
                    invoice_status=invoice_status,
                    payment_status=payment_status,
                    settlement_status=settlement_status,
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

    def test_work_items_list_backfills_trade_rows_and_filters_by_queue(self) -> None:
        self._seed_trade(trade_id="T-OPS-1")

        operations_response = self.client.get("/operations/work-items?queue=operations")
        self.assertEqual(operations_response.status_code, 200)
        operations_items = operations_response.json()
        self.assertEqual(len(operations_items), 3)
        self.assertEqual(
            {item["workflow_type"] for item in operations_items},
            {"CONFIRMATION", "NOMINATION", "ALLOCATION"},
        )
        self.assertTrue(all(item["queue"] == "operations" for item in operations_items))
        self.assertTrue(all(item["due_at"] is not None for item in operations_items))

        settlement_response = self.client.get("/operations/work-items?queue=settlement&include_closed=true")
        self.assertEqual(settlement_response.status_code, 200)
        settlement_items = settlement_response.json()
        self.assertEqual(len(settlement_items), 2)
        self.assertEqual(
            {item["workflow_type"] for item in settlement_items},
            {"INVOICE", "PAYMENT"},
        )

        with self.SessionLocal() as session:
            self.assertEqual(session.query(TradeWorkflowItem).count(), 5)

    def test_work_item_patch_rolls_up_trade_statuses(self) -> None:
        admin_token = self._bootstrap_admin()
        self._create_user(user_id="ops_trader", email="trader@example.com", display_name="Ops Trader")
        trader_token = self._login(identifier="ops_trader", password="supersecret2")
        self._seed_trade(trade_id="T-ROLLUP-1")

        queue_response = self.client.get("/operations/work-items?include_closed=true")
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

    def test_credit_approval_actions_require_comment_and_release_lifecycle_hold(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CREDIT-OPS-1")
        self._seed_credit_approval_item(
            trade_id="T-CREDIT-OPS-1",
            notes="",
        )

        queue_response = self.client.get("/operations/work-items?queue=operations&include_closed=true")
        self.assertEqual(queue_response.status_code, 200)
        work_items = {item["workflow_type"]: item for item in queue_response.json() if item["trade_id"] == "T-CREDIT-OPS-1"}

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

        release_response = self.client.patch(
            f"/operations/work-items/{work_items['CONFIRMATION']['item_id']}",
            json={"status": "CONFIRMED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(release_response.status_code, 200)
        self.assertEqual(release_response.json()["status"], "CONFIRMED")

    def test_credit_approval_requires_credit_authorized_role_and_records_decision_history(self) -> None:
        self._bootstrap_admin()
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

        queue_response = self.client.get("/operations/work-items?queue=operations&include_closed=true")
        self.assertEqual(queue_response.status_code, 200)
        work_item = next(
            item
            for item in queue_response.json()
            if item["trade_id"] == "T-CREDIT-ROLE-1" and item["workflow_type"] == "CREDIT_APPROVAL"
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
        self.assertEqual(decision["breach_snapshot"]["comparison_reason"], "no_credit_profile")

        with self.SessionLocal() as session:
            decisions = session.query(TradeCreditApprovalDecision).all()
            self.assertEqual(len(decisions), 1)
            self.assertEqual(decisions[0].decided_by, "credit_approver")
            self.assertEqual(decisions[0].decision_comment, "Approved after documented credit review.")

    def test_work_item_mutations_require_authentication(self) -> None:
        self._seed_trade(trade_id="T-AUTH-1")
        queue_response = self.client.get("/operations/work-items?include_closed=true")
        self.assertEqual(queue_response.status_code, 200)
        item_id = queue_response.json()[0]["item_id"]

        response = self.client.patch(f"/operations/work-items/{item_id}", json={"owner": "ops.alpha"})
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
