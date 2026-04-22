from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models import Base
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.routes.admin_data import (
    list_admin_trade_projection_issues,
    repair_admin_trade_projections,
)
from apps.api.app.schemas.admin_seed import TradeProjectionRepairRequest


class AdminProjectionIntegrityApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 14, 18, 0, tzinfo=timezone.utc)

    def _repairable_trade(self, trade_id: str) -> Trade:
        return Trade(
            trade_id=trade_id,
            external_trade_id=f"EXT-{trade_id}",
            source_system="TEST",
            created_at=self.now,
            updated_at=self.now,
            execution_timestamp=self.now,
            trade_date=self.now.date(),
            effective_start_date=self.now.date(),
            effective_end_date=self.now.date(),
            delivery_start=self.now.date(),
            delivery_end=self.now.date(),
            trade_nature="FINANCIAL",
            trade_structure="SINGLE",
            trade_side="BUY",
            book="CRUDE",
            portfolio="PROMPT",
            counterparty="ACME",
            commodity_class="CRUDE",
            commodity="WTI",
            pricing_type="FIXED",
            pricing_status="PRICED",
            confirmation_status="PENDING",
            nomination_status="NOT_REQUIRED",
            allocation_status="NOT_REQUIRED",
            actualization_status="NOT_REQUIRED",
            invoice_status="NOT_REQUIRED",
            payment_status="PENDING",
            settlement_status="PENDING",
            price_index_code=None,
            price=75.25,
            volume=1000,
            trade_currency_code="USD",
            price_unit_code="BBL",
            unit_of_measure="BBL",
            location_code="CUSHING",
            trader_user="ops-user",
            status="ACTIVE",
            last_event_id="evt-trade-anchor",
        )

    def test_list_admin_trade_projection_issues_returns_structural_and_invariant_findings(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="T-STRUCTURAL",
                    external_trade_id="EXT-T-STRUCTURAL",
                    source_system="TEST",
                    created_at=self.now,
                    updated_at=self.now,
                    execution_timestamp=self.now,
                    trade_nature="FINANCIAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="CRUDE",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    confirmation_status="PENDING",
                    nomination_status="NOT_REQUIRED",
                    allocation_status="NOT_REQUIRED",
                    actualization_status="NOT_REQUIRED",
                    invoice_status="NOT_REQUIRED",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    price=75.25,
                    volume=1000,
                    trade_currency_code="USD",
                    price_unit_code="BBL",
                    unit_of_measure="BBL",
                    location_code="CUSHING",
                    trader_user="ops-user",
                    status="ACTIVE",
                    last_event_id="evt-missing-structural",
                )
            )
            session.add(self._repairable_trade("T-INVARIANT"))
            session.commit()

            payload = list_admin_trade_projection_issues(db=session)

        self.assertEqual(payload.structural_issue_count, 2)
        self.assertGreaterEqual(payload.invariant_issue_count, 1)
        self.assertIn("missing_last_event_no_trade_events", {row.issue_type for row in payload.structural_issues})
        self.assertIn("missing_confirmation_record", {row.issue_type for row in payload.invariant_issues})

    def test_repair_admin_trade_projections_repairs_requested_trade(self) -> None:
        with self.SessionLocal() as session:
            session.add(self._repairable_trade("T-ADMIN-REPAIR"))
            session.commit()

            before = list_admin_trade_projection_issues(trade_ids=["T-ADMIN-REPAIR"], db=session)
            self.assertGreater(before.invariant_issue_count, 0)

            payload = repair_admin_trade_projections(
                TradeProjectionRepairRequest(
                    requested_by="ops-admin",
                    trade_ids=["T-ADMIN-REPAIR"],
                ),
                db=session,
            )
            session.commit()

            after = list_admin_trade_projection_issues(trade_ids=["T-ADMIN-REPAIR"], db=session)
            confirmation_count = (
                session.query(TradeConfirmation)
                .filter(TradeConfirmation.trade_id == "T-ADMIN-REPAIR")
                .count()
            )
            workflow_count = (
                session.query(TradeWorkflowItem)
                .filter(TradeWorkflowItem.trade_id == "T-ADMIN-REPAIR")
                .count()
            )

        self.assertEqual(payload.requested_by, "ops-admin")
        self.assertEqual(payload.repaired_trade_count, 1)
        self.assertEqual(payload.summaries[0].trade_id, "T-ADMIN-REPAIR")
        self.assertEqual(payload.summaries[0].after_issue_count, 0)
        self.assertEqual(after.invariant_issue_count, 0)
        self.assertGreaterEqual(confirmation_count, 1)
        self.assertGreaterEqual(workflow_count, 1)


if __name__ == "__main__":
    unittest.main()
