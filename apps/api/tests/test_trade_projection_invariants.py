from __future__ import annotations

import enum
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from apps.api.app.domains.operations.services.actualizations import (
    upsert_trade_actualization,
)
from apps.api.app.domains.operations.services.settlement_invoices import (
    issue_trade_invoice,
)
from apps.api.app.domains.operations.services.settlement_payments import (
    create_trade_payment,
)
from apps.api.app.domains.operations.services.shipments import (
    synchronize_delivery_obligations_from_trades,
)
from apps.api.app.domains.operations.services.trade_confirmations import (
    issue_trade_confirmation,
)
from apps.api.app.domains.operations.services.trade_confirmations import (
    record_trade_confirmation_response,
)
from apps.api.app.domains.operations.services.trade_projection_integrity import (
    rebuild_trade_operational_projection,
)
from apps.api.app.domains.operations.services.trade_projection_integrity import (
    list_trade_projection_invariant_issues,
)
from apps.api.app.models import Base
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.routes.events import append_event
from apps.api.app.schemas.event import EventCreate


class TradeProjectionInvariantTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.engine.dispose()

    def setUp(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        Base.metadata.create_all(bind=self.engine)
        self.now = datetime(2026, 4, 14, 15, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            self._seed_reference_data(session)
            session.commit()

    def _request(self):
        return SimpleNamespace(
            state=SimpleNamespace(correlation_id="projection-invariant-test", actor_id=None),
            headers={},
        )

    def _append_trade_created_event(self, session, *, trade_id: str, **payload_overrides) -> None:
        payload = {
            "book": "CRUDE_PHYS",
            "commodity_class": "CRUDE_OIL",
            "commodity": "WTI",
            "pricing_type": "FIXED",
            "trade_side": "BUY",
            "trade_nature": "PHYSICAL",
            "trade_structure": "SINGLE",
            "portfolio": "OIL_DISCRETIONARY",
            "counterparty": "SHELL_TRADING",
            "trade_currency_code": "USD",
            "price_unit_code": "BBL",
            "unit_of_measure": "BBL",
            "location_code": "CUSHING",
            "trade_date": "2026-04-14",
            "delivery_start": "2026-04-15",
            "delivery_end": "2026-04-16",
            "price": 75.25,
            "volume": 1000,
        }
        payload.update(payload_overrides)
        append_event(
            EventCreate(
                aggregate_type="trade",
                aggregate_id=trade_id,
                event_type="TradeCreated",
                occurred_at=self.now,
                actor_id="test-user",
                payload=payload,
                schema_version=5 if payload.get("instrument_type") == "OPTION" else 4,
            ),
            request=self._request(),
            db=session,
        )

    def _append_trade_amended_event(
        self,
        session,
        *,
        trade_id: str,
        occurred_at: datetime | None = None,
        **payload_overrides,
    ) -> None:
        append_event(
            EventCreate(
                aggregate_type="trade",
                aggregate_id=trade_id,
                event_type="TradeAmended",
                occurred_at=occurred_at or (self.now + timedelta(hours=2)),
                actor_id="test-user",
                payload=payload_overrides,
                schema_version=5 if payload_overrides.get("instrument_type") == "OPTION" else 4,
            ),
            request=self._request(),
            db=session,
        )

    def _append_trade_event(
        self,
        session,
        *,
        trade_id: str,
        event_type: str,
        occurred_at: datetime,
        schema_version: int = 5,
    ) -> None:
        append_event(
            EventCreate(
                aggregate_type="trade",
                aggregate_id=trade_id,
                event_type=event_type,
                occurred_at=occurred_at,
                actor_id="test-user",
                payload={},
                schema_version=schema_version,
            ),
            request=self._request(),
            db=session,
        )

    def _seed_reference_data(self, session) -> None:
        session.add(
            ReferenceBook(
                code="CRUDE_PHYS",
                name="Crude Physical",
                description="Invariant test book",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceCommodity(
                code="WTI",
                commodity_class="CRUDE_OIL",
                name="WTI",
                description="West Texas Intermediate",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceCounterparty(
                code="SHELL_TRADING",
                name="Shell Trading",
                short_name="Shell",
                legal_entity_name="Shell Trading US Company",
                counterparty_type="TRADING_FIRM",
                country_code="US",
                lei_code=None,
                duns_number=None,
                ticker_symbol=None,
                credit_status="APPROVED",
                description="Invariant test counterparty",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceCurrency(
                code="USD",
                name="US Dollar",
                symbol="$",
                description="Invariant test currency",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceLocation(
                code="CUSHING",
                parent_location_code=None,
                name="Cushing",
                location_kind="POINT",
                location_type="TERMINAL",
                market="NYMEX",
                city="Cushing",
                subdivision_code="OK",
                country_code="US",
                continent_code="NA",
                latitude=None,
                longitude=None,
                region="Midcontinent",
                timezone="America/Chicago",
                description="Invariant test location",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferencePortfolio(
                code="OIL_DISCRETIONARY",
                name="Oil Discretionary",
                book_code="CRUDE_PHYS",
                owner="trading",
                strategy="Directional",
                trader_persona="crude-trader",
                risk_archetype="FLOW",
                description="Invariant test portfolio",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
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
                conversion_factor=1,
                precision=3,
                description="Invariant test unit",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )

    def _issue_types(self, issues) -> set[str]:
        return {issue.issue_type for issue in issues}

    def test_projection_invariants_are_clean_for_end_to_end_trade_flow(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-INVARIANT-FLOW-1")
            self._append_trade_amended_event(
                session,
                trade_id="T-INVARIANT-FLOW-1",
                price=76.5,
                delivery_end="2026-04-17",
            )

            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.user",
                now=self.now + timedelta(hours=3),
            )
            upsert_trade_actualization(
                session,
                trade_id="T-INVARIANT-FLOW-1",
                leg_no=1,
                actual_quantity=1000,
                actualized_at=self.now + timedelta(days=2),
                source="MANUAL",
                notes="Delivered in full.",
                actor_id="ops.user",
                now=self.now + timedelta(days=2),
            )

            current_confirmation = (
                session.query(TradeConfirmation)
                .filter(TradeConfirmation.trade_id == "T-INVARIANT-FLOW-1")
                .order_by(TradeConfirmation.id.desc())
                .first()
            )
            self.assertIsNotNone(current_confirmation)
            issue_trade_confirmation(
                session,
                confirmation_id=current_confirmation.id,
                actor_id="ops.user",
                issue_method="EMAIL",
                issue_recipient="ops@shell.example",
                now=self.now + timedelta(hours=4),
            )
            record_trade_confirmation_response(
                session,
                confirmation_id=current_confirmation.id,
                actor_id="counterparty.user",
                action="COUNTERPARTY_CONFIRMED",
                response_method="EMAIL",
                response_reference="shell-confirmed",
                response_note="Matched booked economics.",
                now=self.now + timedelta(hours=6),
            )

            invoice = issue_trade_invoice(
                session,
                trade_id="T-INVARIANT-FLOW-1",
                actor_id="settlement.ops",
                invoice_number="INV-INVARIANT-1",
                invoice_amount=1000,
                now=self.now + timedelta(days=3),
            )
            create_trade_payment(
                session,
                invoice_id=invoice.invoice_id,
                actor_id="settlement.ops",
                payment_amount=1000,
                status="PAID",
                now=self.now + timedelta(days=4),
            )
            session.commit()

            issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-INVARIANT-FLOW-1"],
                now=self.now + timedelta(days=4),
            )

        self.assertEqual(issues, [])

    def test_projection_invariants_detect_cancelled_trade_actualization_drift(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-INVARIANT-CANCEL-1")
            self._append_trade_event(
                session,
                trade_id="T-INVARIANT-CANCEL-1",
                event_type="TradeCancelled",
                occurred_at=self.now + timedelta(hours=1),
                schema_version=4,
            )
            session.commit()

            issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-INVARIANT-CANCEL-1"],
                now=self.now + timedelta(hours=1),
            )

        self.assertIn("actualization_status_mismatch", self._issue_types(issues))

    def test_projection_invariants_detect_payment_and_settlement_status_corruption(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-INVARIANT-SETTLE-1")
            invoice = issue_trade_invoice(
                session,
                trade_id="T-INVARIANT-SETTLE-1",
                actor_id="settlement.ops",
                invoice_number="INV-INVARIANT-SETTLE-1",
                invoice_amount=1000,
                now=self.now + timedelta(hours=2),
            )
            create_trade_payment(
                session,
                invoice_id=invoice.invoice_id,
                actor_id="settlement.ops",
                payment_amount=1000,
                status="PAID",
                now=self.now + timedelta(hours=3),
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-INVARIANT-SETTLE-1").one()
            trade.payment_status = "OVERDUE"
            trade.settlement_status = "INVOICED"
            trade.updated_at = self.now + timedelta(hours=4)
            session.commit()

            issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-INVARIANT-SETTLE-1"],
                now=self.now + timedelta(hours=4),
            )

        issue_types = self._issue_types(issues)
        self.assertIn("payment_status_mismatch", issue_types)
        self.assertIn("settlement_status_mismatch", issue_types)
        self.assertIn("workflow_status_mismatch", issue_types)

    def test_projection_invariants_are_clean_for_exercised_option_flow(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(
                session,
                trade_id="T-INVARIANT-OPTION-1",
                instrument_type="OPTION",
                trade_nature="FINANCIAL",
                portfolio="OIL_DISCRETIONARY",
                counterparty="SHELL_TRADING",
                trade_currency_code="USD",
                price_unit_code="BBL",
                unit_of_measure="BBL",
                location_code="CUSHING",
                option_type="CALL",
                option_style="AMERICAN",
                option_strike_price=81,
                option_expiration_date="2026-06-30",
                price=3.5,
                volume=10,
            )
            self._append_trade_event(
                session,
                trade_id="T-INVARIANT-OPTION-1",
                event_type="OptionExercised",
                occurred_at=self.now + timedelta(days=10),
                schema_version=5,
            )
            session.commit()

            issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-INVARIANT-OPTION-1"],
                now=self.now + timedelta(days=10),
            )

        self.assertEqual(issues, [])

    def test_projection_invariants_detect_missing_option_settlement_workflow(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(
                session,
                trade_id="T-INVARIANT-OPTION-2",
                instrument_type="OPTION",
                trade_nature="FINANCIAL",
                portfolio="OIL_DISCRETIONARY",
                counterparty="SHELL_TRADING",
                trade_currency_code="USD",
                price_unit_code="BBL",
                unit_of_measure="BBL",
                location_code="CUSHING",
                option_type="CALL",
                option_style="AMERICAN",
                option_strike_price=81,
                option_expiration_date="2026-06-30",
                price=3.5,
                volume=10,
            )
            self._append_trade_event(
                session,
                trade_id="T-INVARIANT-OPTION-2",
                event_type="OptionExercised",
                occurred_at=self.now + timedelta(days=10),
                schema_version=5,
            )

            option_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-INVARIANT-OPTION-2",
                    TradeWorkflowItem.workflow_type == "OPTION_SETTLEMENT",
                )
                .one()
            )
            session.delete(option_item)
            session.commit()

            issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-INVARIANT-OPTION-2"],
                now=self.now + timedelta(days=10),
            )

        self.assertIn("missing_option_settlement_workflow", self._issue_types(issues))

    def test_rebuild_trade_operational_projection_repairs_cancelled_delivery_and_actualization_state(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-REBUILD-CANCEL-1")
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.user",
                now=self.now + timedelta(minutes=30),
            )
            self._append_trade_event(
                session,
                trade_id="T-REBUILD-CANCEL-1",
                event_type="TradeCancelled",
                occurred_at=self.now + timedelta(hours=1),
                schema_version=4,
            )
            session.commit()

            before_issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-REBUILD-CANCEL-1"],
                now=self.now + timedelta(hours=1),
            )
            summary = rebuild_trade_operational_projection(
                session,
                trade_id="T-REBUILD-CANCEL-1",
                actor_id="system.reconcile",
                now=self.now + timedelta(hours=2),
            )
            session.commit()

            after_issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-REBUILD-CANCEL-1"],
                now=self.now + timedelta(hours=2),
            )
            delivery_count = (
                session.query(DeliveryObligation)
                .filter(DeliveryObligation.trade_id == "T-REBUILD-CANCEL-1")
                .count()
            )
            trade = session.query(Trade).filter(Trade.trade_id == "T-REBUILD-CANCEL-1").one()

        self.assertIn("actualization_status_mismatch", self._issue_types(before_issues))
        self.assertIn("unexpected_delivery_obligation", self._issue_types(before_issues))
        self.assertEqual(after_issues, [])
        self.assertEqual(delivery_count, 0)
        self.assertEqual(trade.actualization_status, "NOT_REQUIRED")
        self.assertIn("actualization_status_mismatch", summary.resolved_issue_types)
        self.assertIn("unexpected_delivery_obligation", summary.resolved_issue_types)

    def test_rebuild_trade_operational_projection_repairs_payment_rollup_corruption(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-REBUILD-SETTLE-1")
            invoice = issue_trade_invoice(
                session,
                trade_id="T-REBUILD-SETTLE-1",
                actor_id="settlement.ops",
                invoice_number="INV-REBUILD-SETTLE-1",
                invoice_amount=1000,
                now=self.now + timedelta(hours=2),
            )
            create_trade_payment(
                session,
                invoice_id=invoice.invoice_id,
                actor_id="settlement.ops",
                payment_amount=1000,
                status="PAID",
                now=self.now + timedelta(hours=3),
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-REBUILD-SETTLE-1").one()
            trade.payment_status = "OVERDUE"
            trade.settlement_status = "INVOICED"
            payment_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-REBUILD-SETTLE-1",
                    TradeWorkflowItem.workflow_type == "PAYMENT",
                )
                .one()
            )
            payment_item.status = "OVERDUE"
            payment_item.notes = "Corrupted for test."
            session.commit()

            before_issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-REBUILD-SETTLE-1"],
                now=self.now + timedelta(hours=4),
            )
            summary = rebuild_trade_operational_projection(
                session,
                trade_id="T-REBUILD-SETTLE-1",
                actor_id="system.reconcile",
                now=self.now + timedelta(hours=4),
            )
            session.commit()

            after_issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-REBUILD-SETTLE-1"],
                now=self.now + timedelta(hours=4),
            )
            repaired_trade = session.query(Trade).filter(Trade.trade_id == "T-REBUILD-SETTLE-1").one()
            repaired_payment_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-REBUILD-SETTLE-1",
                    TradeWorkflowItem.workflow_type == "PAYMENT",
                )
                .one()
            )

        self.assertIn("payment_status_mismatch", self._issue_types(before_issues))
        self.assertIn("settlement_status_mismatch", self._issue_types(before_issues))
        self.assertEqual(after_issues, [])
        self.assertEqual(repaired_trade.payment_status, "PAID")
        self.assertEqual(repaired_trade.settlement_status, "SETTLED")
        self.assertEqual(repaired_payment_item.status, "PAID")
        self.assertIn("payment_status_mismatch", summary.resolved_issue_types)

    def test_rebuild_trade_operational_projection_recreates_option_settlement_workflow(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(
                session,
                trade_id="T-REBUILD-OPTION-1",
                instrument_type="OPTION",
                trade_nature="FINANCIAL",
                portfolio="OIL_DISCRETIONARY",
                counterparty="SHELL_TRADING",
                trade_currency_code="USD",
                price_unit_code="BBL",
                unit_of_measure="BBL",
                location_code="CUSHING",
                option_type="CALL",
                option_style="AMERICAN",
                option_strike_price=81,
                option_expiration_date="2026-06-30",
                price=3.5,
                volume=10,
            )
            self._append_trade_event(
                session,
                trade_id="T-REBUILD-OPTION-1",
                event_type="OptionExercised",
                occurred_at=self.now + timedelta(days=10),
                schema_version=5,
            )
            option_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-REBUILD-OPTION-1",
                    TradeWorkflowItem.workflow_type == "OPTION_SETTLEMENT",
                )
                .one()
            )
            session.delete(option_item)
            session.commit()

            before_issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-REBUILD-OPTION-1"],
                now=self.now + timedelta(days=10),
            )
            summary = rebuild_trade_operational_projection(
                session,
                trade_id="T-REBUILD-OPTION-1",
                actor_id="system.reconcile",
                now=self.now + timedelta(days=10, minutes=5),
            )
            session.commit()

            after_issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-REBUILD-OPTION-1"],
                now=self.now + timedelta(days=10, minutes=5),
            )
            recreated_option_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-REBUILD-OPTION-1",
                    TradeWorkflowItem.workflow_type == "OPTION_SETTLEMENT",
                )
                .one_or_none()
            )

        self.assertIn("missing_option_settlement_workflow", self._issue_types(before_issues))
        self.assertEqual(after_issues, [])
        self.assertIsNotNone(recreated_option_item)
        self.assertTrue(summary.option_settlement_workflow_present)

    def test_rebuild_trade_operational_projection_recreates_pending_confirmation_projection(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-REBUILD-CONFIRM-1")
            session.query(TradeConfirmation).filter(
                TradeConfirmation.trade_id == "T-REBUILD-CONFIRM-1"
            ).delete()
            session.query(TradeWorkflowItem).filter(
                TradeWorkflowItem.trade_id == "T-REBUILD-CONFIRM-1",
                TradeWorkflowItem.workflow_type == "CONFIRMATION",
            ).delete()
            session.commit()

            before_issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-REBUILD-CONFIRM-1"],
                now=self.now + timedelta(minutes=15),
            )
            summary = rebuild_trade_operational_projection(
                session,
                trade_id="T-REBUILD-CONFIRM-1",
                actor_id="system.reconcile",
                now=self.now + timedelta(minutes=20),
            )
            session.commit()

            after_issues = list_trade_projection_invariant_issues(
                session,
                trade_ids=["T-REBUILD-CONFIRM-1"],
                now=self.now + timedelta(minutes=20),
            )
            recreated_confirmation = (
                session.query(TradeConfirmation)
                .filter(TradeConfirmation.trade_id == "T-REBUILD-CONFIRM-1")
                .order_by(TradeConfirmation.id.desc())
                .one_or_none()
            )

        issue_types = self._issue_types(before_issues)
        self.assertIn("missing_confirmation_record", issue_types)
        self.assertIn("missing_automated_workflow_item", issue_types)
        self.assertEqual(after_issues, [])
        self.assertIsNotNone(recreated_confirmation)
        self.assertEqual(recreated_confirmation.status, "PENDING")
        self.assertIn("missing_confirmation_record", summary.resolved_issue_types)


if __name__ == "__main__":
    unittest.main()
