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
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class TradeConfirmationsApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 7, 16, 0, tzinfo=timezone.utc)
        self._previous_bootstrap_admin_token = settings.BOOTSTRAP_ADMIN_TOKEN
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"

        with self.SessionLocal() as session:
            session.query(TradeConfirmation).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
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
                "user_id": "confirm_admin",
                "email": "confirmations@example.com",
                "display_name": "Confirmations Admin",
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
                    created_by="confirm_admin",
                    updated_at=self.now,
                    updated_by="confirm_admin",
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
                    trade_date=date(2026, 4, 7),
                    effective_start_date=date(2026, 4, 8),
                    effective_end_date=date(2026, 4, 10),
                    quality_spec=None,
                    unit_of_measure="BBL",
                    trade_currency_code="USD",
                    location_code="CUSHING",
                    delivery_start=date(2026, 4, 8),
                    delivery_end=date(2026, 4, 10),
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
                    confirmation_status="PENDING",
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

    def _seed_verified_confirmation_document(
        self,
        *,
        document_id: str,
        trade_id: str,
        confirmation_number: str,
        counterparty: str = "SHELL_TRADING",
        economic_terms: list[dict[str, str]] | None = None,
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                DocumentIngestion(
                    document_id=document_id,
                    original_filename="trade-confirmation.pdf",
                    display_name=f"Trade Confirmation {confirmation_number}",
                    content_type="application/pdf",
                    storage_key=f"documents/{document_id}.pdf",
                    sha256="a" * 64,
                    size_bytes=2048,
                    page_count=1,
                    status="ANALYZED",
                    classifier_version="test-classifier",
                    extractor_version="test-extractor",
                    analysis_summary={"dominant_document_kind": "TRADE_CONFIRMATION"},
                    processing_errors=[],
                    review_status="VERIFIED",
                    review_notes="Verified against booked economics.",
                    reviewed_at=self.now,
                    reviewed_by="confirm_admin",
                    created_at=self.now,
                    created_by="confirm_admin",
                    updated_at=self.now,
                    updated_by="confirm_admin",
                    version=2,
                )
            )
            session.add(
                DocumentIngestionPage(
                    document_id=document_id,
                    page_number=1,
                    classification_status="ANALYZED",
                    extraction_status="ANALYZED",
                    document_kind="TRADE_CONFIRMATION",
                    document_subtype=None,
                    classification_confidence=0.99,
                    classification_payload={"review_override": True},
                    header_fields=[
                        {
                            "field_key": "confirmation_number",
                            "label": "Confirmation Number",
                            "value": confirmation_number,
                            "source": "review",
                        },
                        {
                            "field_key": "trade_id",
                            "label": "Trade ID",
                            "value": trade_id,
                            "source": "review",
                        },
                        {
                            "field_key": "trade_date",
                            "label": "Trade Date",
                            "value": "2026-04-07",
                            "source": "review",
                        },
                        {
                            "field_key": "counterparty",
                            "label": "Counterparty",
                            "value": counterparty,
                            "source": "review",
                        },
                    ],
                    table_blocks=[
                        {
                            "table_index": 0,
                            "template_key": "economic_terms",
                            "title": "Economic Terms",
                            "columns": ["term_name", "term_value"],
                            "rows": economic_terms or [],
                            "header_row_detected": True,
                            "source": "review",
                        }
                    ],
                    raw_text="Trade confirmation",
                    processing_warnings=[],
                    processing_errors=[],
                    review_status="REVIEWED",
                    review_notes="Reviewed and normalized.",
                    reviewed_at=self.now,
                    reviewed_by="confirm_admin",
                    processed_at=self.now,
                    created_at=self.now,
                    updated_at=self.now,
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

    def _confirmation_economic_terms(
        self,
        *,
        volume: str = "1000 BBL",
        price: str = "79.25 / BBL",
        trade_side: str = "BUY",
        commodity: str = "WTI",
        delivery_window: str = "2026-04-08 to 2026-04-10",
        location_code: str = "CUSHING",
    ) -> list[dict[str, str]]:
        return [
            {"term_name": "Trade Side", "term_value": trade_side},
            {"term_name": "Commodity", "term_value": commodity},
            {"term_name": "Volume", "term_value": volume},
            {"term_name": "Price", "term_value": price},
            {"term_name": "Delivery Window", "term_value": delivery_window},
            {"term_name": "Location", "term_value": location_code},
        ]

    def test_create_confirmation_record_rolls_trade_and_workflow_forward(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-1")

        response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-1",
                "confirmation_number": "CONF-1001",
                "notes": "Confirmation sent to counterparty.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["status"], "SENT")
        self.assertEqual(body["confirmation_number"], "CONF-1001")
        self.assertTrue(body["is_current"])

        list_response = self.client.get(
            "/confirmations?trade_id=T-CONF-1",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.json()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["workflow_owner"], None)
        self.assertEqual(listed[0]["book"], "CRUDE_PHYS")
        confirmation_actions = {row["key"]: row for row in listed[0]["action_states"]}
        self.assertEqual(confirmation_actions["issue"]["label"], None)
        self.assertFalse(confirmation_actions["received"]["available"])
        self.assertEqual(
            confirmation_actions["confirmed"]["blocked_reason"],
            "Issue the confirmation before recording a counterparty response.",
        )

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-1").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-1",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )

            self.assertEqual(trade.confirmation_status, "SENT")
            self.assertEqual(workflow_item.status, "SENT")
            self.assertEqual(workflow_item.notes, "Confirmation sent to counterparty.")
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-CONF-1",
                    Event.event_type == "TradeConfirmationCreated",
                )
                .one()
            )
            self.assertEqual(audit_event.actor_id, "confirm_admin")
            self.assertEqual(audit_event.payload["request"]["trade_id"], "T-CONF-1")
            self.assertEqual(
                audit_event.payload["confirmation"]["confirmation_number"],
                "CONF-1001",
            )

    def test_operations_role_can_create_confirmation_record(self) -> None:
        self._create_user(
            user_id="ops.confirmations",
            email="ops.confirmations@example.com",
            display_name="Ops Confirmations",
            role="OPERATIONS",
        )
        operations_token = self._login(identifier="ops.confirmations")
        self._seed_trade(trade_id="T-CONF-OPS-1")

        response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-OPS-1",
                "confirmation_number": "CONF-OPS-1001",
            },
            headers={"Authorization": f"Bearer {operations_token}"},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["confirmation_number"], "CONF-OPS-1001")

    def test_trader_role_cannot_manage_confirmation_records(self) -> None:
        self._create_user(
            user_id="trader.confirmations",
            email="trader.confirmations@example.com",
            display_name="Trader Confirmations",
            role="TRADER",
        )
        trader_token = self._login(identifier="trader.confirmations")
        self._seed_trade(trade_id="T-CONF-TRADER-1")

        response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-TRADER-1",
                "confirmation_number": "CONF-TRADER-1001",
            },
            headers={"Authorization": f"Bearer {trader_token}"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"],
            "Only OPERATIONS, OPS_ADMIN, or ADMIN sessions can manage confirmations.",
        )

    def test_patch_confirmation_to_confirmed_updates_trade_and_workflow(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-2")
        create_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-2", "confirmation_number": "CONF-1002"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        update_response = self.client.patch(
            f"/confirmations/{confirmation_id}",
            json={"status": "CONFIRMED", "notes": "Counterparty matched and confirmed."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["status"], "CONFIRMED")
        self.assertIsNotNone(update_response.json()["confirmed_at"])

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-2").one()
            confirmation = session.query(TradeConfirmation).filter(TradeConfirmation.id == confirmation_id).one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-2",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )

            self.assertEqual(trade.confirmation_status, "CONFIRMED")
            self.assertEqual(confirmation.status, "CONFIRMED")
            self.assertEqual(workflow_item.status, "CONFIRMED")
            self.assertEqual(workflow_item.notes, "Counterparty matched and confirmed.")

    def test_document_backed_confirmation_defaults_to_confirmed_and_derives_number(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-3")
        self._seed_verified_confirmation_document(
            document_id="doc-confirm-1",
            trade_id="T-CONF-3",
            confirmation_number="CONF-DOC-3003",
            economic_terms=self._confirmation_economic_terms(),
        )

        response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-3",
                "source_document_id": "doc-confirm-1",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["status"], "CONFIRMED")
        self.assertEqual(body["confirmation_number"], "CONF-DOC-3003")
        self.assertEqual(body["source_document_id"], "doc-confirm-1")
        self.assertEqual(body["source_document_review_status"], "VERIFIED")
        self.assertEqual(body["source_document_display_name"], "Trade Confirmation CONF-DOC-3003")
        self.assertIsNotNone(body["confirmed_at"])

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-3").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-3",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )

            self.assertEqual(trade.confirmation_status, "CONFIRMED")
            self.assertEqual(workflow_item.status, "CONFIRMED")
            self.assertIn("Trade Confirmation CONF-DOC-3003", workflow_item.notes)

    def test_document_backed_confirmation_with_mismatches_defaults_to_sent_and_surfaces_exceptions(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-3B")
        self._seed_verified_confirmation_document(
            document_id="doc-confirm-1b",
            trade_id="T-CONF-3B",
            confirmation_number="CONF-DOC-3003B",
            economic_terms=self._confirmation_economic_terms(volume="900 BBL"),
        )

        response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-3B",
                "source_document_id": "doc-confirm-1b",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["status"], "SENT")
        self.assertEqual(body["comparison_status"], "MISMATCHED")
        self.assertEqual(body["blocking_mismatch_count"], 1)
        self.assertEqual(body["mismatches"][0]["field_key"], "volume")

    def test_confirmation_cannot_be_marked_confirmed_with_unresolved_mismatches_without_waiver(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-3C")
        self._seed_verified_confirmation_document(
            document_id="doc-confirm-1c",
            trade_id="T-CONF-3C",
            confirmation_number="CONF-DOC-3003C",
            economic_terms=self._confirmation_economic_terms(volume="900 BBL"),
        )

        create_response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-3C",
                "source_document_id": "doc-confirm-1c",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        update_response = self.client.patch(
            f"/confirmations/{confirmation_id}",
            json={"status": "CONFIRMED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(update_response.status_code, 422)
        self.assertIn("comparison waiver note", update_response.text.lower())

    def test_confirmation_can_be_waived_and_confirmed_with_document_mismatches(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-3D")
        self._seed_verified_confirmation_document(
            document_id="doc-confirm-1d",
            trade_id="T-CONF-3D",
            confirmation_number="CONF-DOC-3003D",
            economic_terms=self._confirmation_economic_terms(volume="900 BBL"),
        )

        create_response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-3D",
                "source_document_id": "doc-confirm-1d",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        update_response = self.client.patch(
            f"/confirmations/{confirmation_id}",
            json={
                "status": "CONFIRMED",
                "comparison_waiver_note": "Counterparty accepted volumetric tolerance pending final recut.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(update_response.status_code, 200)
        body = update_response.json()
        self.assertEqual(body["status"], "CONFIRMED")
        self.assertEqual(body["comparison_status"], "WAIVED")
        self.assertEqual(body["comparison_waiver_note"], "Counterparty accepted volumetric tolerance pending final recut.")
        self.assertEqual(body["comparison_waived_by"], "confirm_admin")
        self.assertEqual(body["blocking_mismatch_count"], 1)

    def test_latest_confirmation_record_drives_current_projection(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-4")

        first_response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-4",
                "confirmation_number": "CONF-4001",
                "status": "CONFIRMED",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(first_response.status_code, 201)

        second_response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-4",
                "confirmation_number": "CONF-4002",
                "status": "SENT",
                "notes": "Amended confirmation sent for re-match.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(second_response.status_code, 201)
        self.assertTrue(second_response.json()["is_current"])

        list_response = self.client.get(
            "/confirmations?trade_id=T-CONF-4",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.json()
        self.assertEqual(len(listed), 2)
        self.assertEqual(listed[0]["confirmation_number"], "CONF-4002")
        self.assertTrue(listed[0]["is_current"])
        self.assertFalse(listed[1]["is_current"])

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-4").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-4",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )

            self.assertEqual(trade.confirmation_status, "SENT")
            self.assertEqual(workflow_item.status, "SENT")
            self.assertEqual(workflow_item.notes, "Amended confirmation sent for re-match.")

    def test_operations_confirmation_status_cannot_be_manually_overridden_once_record_exists(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-5")
        create_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-5", "confirmation_number": "CONF-5001"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)

        queue_response = self.client.get(
            "/operations/work-items?trade_id=T-CONF-5&include_closed=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(queue_response.status_code, 200)
        confirmation_item = next(
            item for item in queue_response.json() if item["workflow_type"] == "CONFIRMATION"
        )

        patch_response = self.client.patch(
            f"/operations/work-items/{confirmation_item['item_id']}",
            json={"status": "CONFIRMED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(patch_response.status_code, 422)
        self.assertIn("confirmation record", patch_response.text.lower())

    def test_confirmation_record_status_change_respects_credit_hold(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-6")
        self._seed_credit_approval_item(
            trade_id="T-CONF-6",
            status="PENDING_REVIEW",
            notes="Credit approval is pending review.",
        )

        create_response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-6",
                "confirmation_number": "CONF-6001",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 422)
        self.assertIn("credit hold", create_response.text.lower())

    def test_issue_confirmation_tracks_outbound_dispatch_metadata(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-7")

        create_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-7", "confirmation_number": "CONF-7001"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        with self.SessionLocal() as session:
            confirmation = session.query(TradeConfirmation).filter(TradeConfirmation.id == confirmation_id).one()
            confirmation.sent_at = None
            session.commit()

        issue_response = self.client.post(
            f"/confirmations/{confirmation_id}/issue",
            json={
                "issued_at": "2026-04-07T18:30:00Z",
                "issue_method": "EMAIL",
                "issue_recipient": "confirmations@shelltrading.example",
                "issue_note": "Initial outbound confirm.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(issue_response.status_code, 200)
        body = issue_response.json()
        self.assertEqual(body["issue_count"], 1)
        self.assertEqual(body["last_issue_method"], "EMAIL")
        self.assertEqual(body["last_issue_recipient"], "confirmations@shelltrading.example")
        self.assertEqual(body["last_issue_note"], "Initial outbound confirm.")
        self.assertEqual(body["last_issued_by"], "confirm_admin")
        self.assertEqual(body["last_issued_at"], "2026-04-07T18:30:00Z")
        self.assertEqual(body["sent_at"], "2026-04-07T18:30:00Z")

        with self.SessionLocal() as session:
            confirmation = session.query(TradeConfirmation).filter(TradeConfirmation.id == confirmation_id).one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-7",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-CONF-7",
                    Event.event_type == "TradeConfirmationIssued",
                )
                .one()
            )

            self.assertEqual(confirmation.issue_count, 1)
            self.assertEqual(confirmation.last_issue_method, "EMAIL")
            self.assertEqual(confirmation.last_issue_recipient, "confirmations@shelltrading.example")
            self.assertIn("Issued once via EMAIL", workflow_item.notes or "")
            self.assertEqual(audit_event.payload["previous_issue_count"], 0)
            self.assertEqual(audit_event.payload["confirmation"]["issue_count"], 1)

    def test_issue_confirmation_promotes_pending_draft_to_sent(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-7A")

        create_response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-7A",
                "confirmation_number": "CONF-7001A",
                "status": "PENDING",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        issue_response = self.client.post(
            f"/confirmations/{confirmation_id}/issue",
            json={"issue_method": "EMAIL"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(issue_response.status_code, 200)
        body = issue_response.json()
        self.assertEqual(body["status"], "SENT")
        self.assertEqual(body["issue_count"], 1)
        self.assertEqual(body["receipt_status"], "ISSUED_AWAITING_RESPONSE")
        self.assertIsNotNone(body["sent_at"])

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-7A").one()
            self.assertEqual(trade.confirmation_status, "SENT")

    def test_reissue_confirmation_increments_issue_count(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-8")

        create_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-8", "confirmation_number": "CONF-8001"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        first_issue = self.client.post(
            f"/confirmations/{confirmation_id}/issue",
            json={
                "issued_at": "2026-04-07T17:00:00Z",
                "issue_method": "EMAIL",
                "issue_recipient": "ops@shelltrading.example",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(first_issue.status_code, 200)

        second_issue = self.client.post(
            f"/confirmations/{confirmation_id}/issue",
            json={
                "issued_at": "2026-04-07T19:15:00Z",
                "issue_note": "Resent after desk amendment.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(second_issue.status_code, 200)
        body = second_issue.json()
        self.assertEqual(body["issue_count"], 2)
        self.assertEqual(body["last_issue_method"], "EMAIL")
        self.assertEqual(body["last_issue_recipient"], "ops@shelltrading.example")
        self.assertEqual(body["last_issue_note"], "Resent after desk amendment.")
        self.assertEqual(body["last_issued_at"], "2026-04-07T19:15:00Z")

    def test_historical_confirmation_record_cannot_be_issued(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-9")

        first_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-9", "confirmation_number": "CONF-9001"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(first_response.status_code, 201)
        first_confirmation_id = first_response.json()["confirmation_id"]

        second_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-9", "confirmation_number": "CONF-9002"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(second_response.status_code, 201)

        issue_response = self.client.post(
            f"/confirmations/{first_confirmation_id}/issue",
            json={"issue_method": "EMAIL"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(issue_response.status_code, 422)
        self.assertIn("current confirmation record", issue_response.text.lower())

    def test_receive_confirmation_tracks_response_metadata_without_closing_status(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-10")

        create_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-10", "confirmation_number": "CONF-10001"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        issue_response = self.client.post(
            f"/confirmations/{confirmation_id}/issue",
            json={"issue_method": "EMAIL"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(issue_response.status_code, 200)

        response = self.client.post(
            f"/confirmations/{confirmation_id}/response",
            json={
                "action": "RECEIVED",
                "response_method": "EMAIL",
                "response_reference": "ACK-10001",
                "response_note": "Counterparty acknowledged receipt and is reviewing.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "SENT")
        self.assertEqual(body["receipt_status"], "RECEIVED")
        self.assertIsNotNone(body["received_at"])
        self.assertEqual(body["received_by"], "confirm_admin")
        self.assertEqual(body["response_method"], "EMAIL")
        self.assertEqual(body["response_reference"], "ACK-10001")
        self.assertEqual(body["response_note"], "Counterparty acknowledged receipt and is reviewing.")

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-10").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-10",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-CONF-10",
                    Event.event_type == "TradeConfirmationReceived",
                )
                .one()
            )

            self.assertEqual(trade.confirmation_status, "SENT")
            self.assertIn("Issued once", workflow_item.notes or "")
            self.assertIn("Counterparty receipt acknowledged", workflow_item.notes or "")
            self.assertEqual(audit_event.payload["confirmation"]["receipt_status"], "RECEIVED")

    def test_issued_confirmation_status_must_use_response_actions(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-10A")

        create_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-10A", "confirmation_number": "CONF-10001A"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        issue_response = self.client.post(
            f"/confirmations/{confirmation_id}/issue",
            json={"issue_method": "EMAIL"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(issue_response.status_code, 200)

        update_response = self.client.patch(
            f"/confirmations/{confirmation_id}",
            json={"status": "CONFIRMED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(update_response.status_code, 422)
        self.assertIn("response workflow", update_response.text.lower())

    def test_counterparty_confirmed_response_updates_trade_and_workflow(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-11")

        create_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-11", "confirmation_number": "CONF-11001"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        issue_response = self.client.post(
            f"/confirmations/{confirmation_id}/issue",
            json={"issue_method": "PORTAL", "issue_recipient": "shell-portal-user"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(issue_response.status_code, 200)

        response = self.client.post(
            f"/confirmations/{confirmation_id}/response",
            json={
                "action": "COUNTERPARTY_CONFIRMED",
                "response_method": "PORTAL",
                "response_reference": "PORTAL-OK-11",
                "response_note": "Counterparty confirmed via portal.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "CONFIRMED")
        self.assertEqual(body["receipt_status"], "COUNTERPARTY_CONFIRMED")
        self.assertEqual(body["response_reference"], "PORTAL-OK-11")
        self.assertIsNotNone(body["confirmed_at"])

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-11").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-11",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )

            self.assertEqual(trade.confirmation_status, "CONFIRMED")
            self.assertEqual(workflow_item.status, "CONFIRMED")
            self.assertIn("Counterparty confirmed", workflow_item.notes or "")

    def test_counterparty_disputed_response_marks_confirmation_disputed(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-12")

        create_response = self.client.post(
            "/confirmations",
            json={"trade_id": "T-CONF-12", "confirmation_number": "CONF-12001"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        issue_response = self.client.post(
            f"/confirmations/{confirmation_id}/issue",
            json={"issue_method": "EMAIL"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(issue_response.status_code, 200)

        response = self.client.post(
            f"/confirmations/{confirmation_id}/response",
            json={
                "action": "COUNTERPARTY_DISPUTED",
                "response_method": "PHONE",
                "response_reference": "CALL-12001",
                "response_note": "Counterparty disputed quality details.",
                "dispute_reason": "Counterparty disputed quality details.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "DISPUTED")
        self.assertEqual(body["receipt_status"], "COUNTERPARTY_DISPUTED")
        self.assertEqual(body["dispute_reason"], "Counterparty disputed quality details.")

        with self.SessionLocal() as session:
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-12").one()
            workflow_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-12",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )

            self.assertEqual(trade.confirmation_status, "DISPUTED")
            self.assertEqual(workflow_item.status, "DISPUTED")
            self.assertIn("Counterparty disputed", workflow_item.notes or "")

    def test_counterparty_confirmed_response_respects_comparison_waiver_guard(self) -> None:
        admin_token = self._bootstrap_admin()
        self._seed_trade(trade_id="T-CONF-13")
        self._seed_verified_confirmation_document(
            document_id="doc-confirm-13",
            trade_id="T-CONF-13",
            confirmation_number="CONF-DOC-13001",
            economic_terms=self._confirmation_economic_terms(volume="900 BBL"),
        )

        create_response = self.client.post(
            "/confirmations",
            json={
                "trade_id": "T-CONF-13",
                "source_document_id": "doc-confirm-13",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_response.status_code, 201)
        confirmation_id = create_response.json()["confirmation_id"]

        issue_response = self.client.post(
            f"/confirmations/{confirmation_id}/issue",
            json={"issue_method": "EMAIL"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(issue_response.status_code, 200)

        response = self.client.post(
            f"/confirmations/{confirmation_id}/response",
            json={
                "action": "COUNTERPARTY_CONFIRMED",
                "response_method": "EMAIL",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("comparison waiver note", response.text.lower())


if __name__ == "__main__":
    unittest.main()
