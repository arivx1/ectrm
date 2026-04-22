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
from apps.api.app.models.trade import Trade
from apps.api.scripts import run_trade_projection_monitoring_scheduler


class ProjectionMonitoringSchedulerTests(unittest.TestCase):
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
            session.query(Trade).delete()
            session.add(
                Trade(
                    trade_id="T-SCHED",
                    external_trade_id="EXT-T-SCHED",
                    source_system="TEST",
                    created_at=datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
                    execution_timestamp=datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
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
                    last_event_id="evt-missing-scheduler",
                )
            )
            session.commit()

    def test_scheduler_runs_one_cycle_and_reports_summary(self) -> None:
        with patch.object(run_trade_projection_monitoring_scheduler, "SessionLocal", self.SessionLocal):
            with patch("sys.argv", ["run_trade_projection_monitoring_scheduler.py", "--max-cycles", "1"]):
                buffer = io.StringIO()
                with redirect_stdout(buffer):
                    exit_code = run_trade_projection_monitoring_scheduler.main()

        output = buffer.getvalue()
        self.assertEqual(exit_code, 0)
        self.assertIn("Projection monitor cycle 1 executed=yes", output)
        self.assertIn("Projection monitoring", output)


if __name__ == "__main__":
    unittest.main()
