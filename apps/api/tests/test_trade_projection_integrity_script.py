from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models import Base
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.scripts import audit_trade_projection_integrity


class TradeProjectionIntegrityScriptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            for model in (
                TradeWorkflowItem,
                TradeConfirmation,
                Trade,
                Event,
            ):
                session.query(model).delete()

            now = datetime(2026, 4, 8, 17, 30, tzinfo=timezone.utc)
            session.add(
                Trade(
                    trade_id="T-ORPHAN",
                    external_trade_id="EXT-T-ORPHAN",
                    source_system="TEST",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=now,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="CRUDE",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=75.25,
                    volume=1000,
                    settlement_status="PENDING",
                    trader_user="assistant_user",
                    status="ACTIVE",
                    last_event_id="evt-missing-orphan",
                )
            )
            session.add(
                Trade(
                    trade_id="T-HAS-HISTORY",
                    external_trade_id="EXT-T-HAS-HISTORY",
                    source_system="TEST",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=now,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="CRUDE",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=75.25,
                    volume=1000,
                    settlement_status="PENDING",
                    trader_user="assistant_user",
                    status="ACTIVE",
                    last_event_id="evt-missing-history",
                )
            )
            session.add(
                Event(
                    event_id="evt-present-history",
                    aggregate_type="trade",
                    aggregate_id="T-HAS-HISTORY",
                    event_type="TradeCreated",
                    occurred_at=now,
                    recorded_at=now,
                    actor_id="assistant_user",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={"trade_id": "T-HAS-HISTORY"},
                )
            )
            session.add(
                TradeConfirmation(
                    trade_id="T-ORPHAN",
                    source_document_id=None,
                    confirmation_number="CONF-T-ORPHAN",
                    status="SENT",
                    sent_at=None,
                    confirmed_at=None,
                    dispute_reason=None,
                    notes=None,
                    comparison_waiver_note=None,
                    comparison_waived_at=None,
                    comparison_waived_by=None,
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.add(
                TradeWorkflowItem(
                    trade_id="T-ORPHAN",
                    workflow_type="CONFIRMATION",
                    status="PENDING",
                    owner=None,
                    due_at=None,
                    notes=None,
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.commit()

    def test_main_reports_issues_without_cleaning(self) -> None:
        with patch.object(audit_trade_projection_integrity, "SessionLocal", self.SessionLocal):
            with patch("sys.argv", ["audit_trade_projection_integrity.py"]):
                buffer = io.StringIO()
                with redirect_stdout(buffer):
                    exit_code = audit_trade_projection_integrity.main()

        output = buffer.getvalue()
        self.assertEqual(exit_code, 0)
        self.assertIn("trade projection integrity issues: 2", output)
        self.assertIn("T-ORPHAN: missing_last_event_no_trade_events", output)
        self.assertIn("T-HAS-HISTORY: missing_last_event_with_trade_events", output)

    def test_main_cleans_only_auto_cleanable_issues(self) -> None:
        with patch.object(audit_trade_projection_integrity, "SessionLocal", self.SessionLocal):
            with patch("sys.argv", ["audit_trade_projection_integrity.py", "--clean"]):
                buffer = io.StringIO()
                with redirect_stdout(buffer):
                    exit_code = audit_trade_projection_integrity.main()

        self.assertEqual(exit_code, 0)
        output = buffer.getvalue()
        self.assertIn("cleanup deleted=T-ORPHAN", output)
        self.assertIn("skipped=T-HAS-HISTORY", output)

        with self.SessionLocal() as session:
            remaining_trades = session.query(Trade).order_by(Trade.trade_id.asc()).all()
            remaining_trade_ids = [trade.trade_id for trade in remaining_trades]
            self.assertEqual(remaining_trade_ids, ["T-HAS-HISTORY"])
            self.assertEqual(session.query(TradeConfirmation).count(), 0)
            self.assertEqual(session.query(TradeWorkflowItem).count(), 0)


if __name__ == "__main__":
    unittest.main()
