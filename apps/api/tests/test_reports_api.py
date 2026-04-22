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

from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.event import Event
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class ReportsApiTests(unittest.TestCase):
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
        with self.SessionLocal() as session:
            session.query(ReportPreset).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(Event).delete()
            session.query(Trade).delete()
            session.commit()
        self.report_token = self._create_user_session(
            user_id="reports_viewer",
            email="reports@example.com",
            display_name="Reports Viewer",
        )
        self.report_headers = {"Authorization": f"Bearer {self.report_token}"}

    def _create_user_session(
        self,
        *,
        user_id: str,
        email: str,
        display_name: str,
        role: str = "TRADER",
    ) -> str:
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id=user_id,
                email=email,
                display_name=display_name,
                role=role,
                password_hash=hash_password("supersecret1"),
                is_active=True,
                last_login_at=self.now,
                created_at=self.now,
                created_by="test",
                updated_at=self.now,
                updated_by="test",
                version=1,
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            _, token = create_user_session(session, user)
            return token

    def _seed_trade(
        self,
        *,
        trade_id: str,
        counterparty: str,
        book: str,
        portfolio: str = "PROMPT",
        trade_currency_code: str = "USD",
        invoice_status: str = "ISSUED",
        payment_status: str = "PENDING",
        settlement_status: str = "INVOICED",
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
                    trade_date=date(2026, 4, 1),
                    effective_start_date=date(2026, 4, 2),
                    effective_end_date=date(2026, 4, 10),
                    quality_spec=None,
                    unit_of_measure="BBL",
                    trade_currency_code=trade_currency_code,
                    location_code="CUSHING",
                    delivery_start=date(2026, 4, 2),
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
                    book=book,
                    portfolio=portfolio,
                    counterparty=counterparty,
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    confirmation_status="CONFIRMED",
                    nomination_status="NOMINATED",
                    allocation_status="ALLOCATED",
                    price_index_code=None,
                    price=80,
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

    def test_pnl_history_report_accepts_as_of_and_portfolio_filters(self) -> None:
        self._seed_trade(trade_id="T-PNL-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS", portfolio="PROMPT")
        self._seed_trade(
            trade_id="T-PNL-2",
            counterparty="SHELL_TRADING",
            book="CRUDE_PHYS",
            portfolio="LOAD_SHAPING",
        )

        response = self.client.get(
            "/reports/pnl-history",
            params={"as_of": "2026-04-06", "portfolio": "prompt"},
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["total_pnl"], 80000.0)
        self.assertEqual(payload["point_count"], 1)
        self.assertEqual(len(payload["valuations"]), 1)
        self.assertEqual(payload["valuations"][0]["trade_id"], "T-PNL-1")
        self.assertEqual(payload["valuations"][0]["portfolio"], "PROMPT")

    def test_pnl_comparison_report_returns_two_snapshot_delta(self) -> None:
        self._seed_trade(trade_id="T-COMP-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS", portfolio="PROMPT")
        self._seed_trade(
            trade_id="T-COMP-2",
            counterparty="SHELL_TRADING",
            book="CRUDE_PHYS",
            portfolio="LOAD_SHAPING",
        )

        response = self.client.get(
            "/reports/pnl-compare",
            params={
                "from_as_of": "2026-04-05",
                "to_as_of": "2026-04-06",
                "portfolio": "prompt",
            },
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["from_as_of"], "2026-04-05")
        self.assertEqual(payload["to_as_of"], "2026-04-06")
        self.assertEqual(payload["delta"]["total_pnl"], 80000.0)
        self.assertEqual(
            payload["attribution_summary"],
            {
                "market_move_pnl": 0.0,
                "quantity_change_pnl": 80000.0,
                "coverage_change_pnl": 0.0,
                "other_change_pnl": 0.0,
                "realization_transfer_pnl": 0.0,
                "reconciled_pnl_delta": 80000.0,
            },
        )
        self.assertEqual(len(payload["portfolio_deltas"]), 1)
        self.assertEqual(payload["portfolio_deltas"][0]["portfolio"], "PROMPT")
        self.assertEqual(len(payload["attributions"]), 1)
        self.assertEqual(payload["attributions"][0]["trade_id"], "T-COMP-1")
        self.assertEqual(payload["attributions"][0]["attribution_category"], "NEW_POSITION")
        self.assertEqual(
            payload["attributions"][0]["breakdown"],
            {
                "market_move_pnl": 0.0,
                "quantity_change_pnl": 80000.0,
                "coverage_change_pnl": 0.0,
                "other_change_pnl": 0.0,
                "realization_transfer_pnl": 0.0,
                "reconciled_pnl_delta": 80000.0,
            },
        )
        self.assertEqual(payload["attributions"][0]["driver_events"], [])
        self.assertEqual(
            payload["attributions"][0]["driver_summary"],
            "No lifecycle events in the compare window; exposure changed across snapshots without a captured trade event.",
        )
        self.assertEqual(
            payload["daily_bridge"],
            [
                {
                    "from_as_of": "2026-04-05",
                    "to_as_of": "2026-04-06",
                    "delta": {
                        "total_pnl": 80000.0,
                        "realized_pnl": 0.0,
                        "unrealized_pnl": 80000.0,
                        "priced_trade_count": 1,
                        "realized_trade_count": 0,
                        "unrealized_trade_count": 1,
                    },
                    "attribution_summary": {
                        "market_move_pnl": 0.0,
                        "quantity_change_pnl": 80000.0,
                        "coverage_change_pnl": 0.0,
                        "other_change_pnl": 0.0,
                        "realization_transfer_pnl": 0.0,
                        "reconciled_pnl_delta": 80000.0,
                    },
                    "changed_trade_count": 1,
                    "top_driver_trade_id": "T-COMP-1",
                    "top_driver_category": "NEW_POSITION",
                    "top_driver_pnl_delta": 80000.0,
                    "top_driver_summary": (
                        "No lifecycle events in the compare window; exposure changed across snapshots "
                        "without a captured trade event."
                    ),
                }
            ],
        )

    def _seed_invoice(
        self,
        *,
        trade_id: str,
        invoice_number: str,
        invoice_amount: float,
        due_at: datetime,
        status: str = "ISSUED",
        invoice_currency_code: str = "USD",
    ) -> int:
        with self.SessionLocal() as session:
            invoice = TradeInvoice(
                trade_id=trade_id,
                invoice_number=invoice_number,
                invoice_currency_code=invoice_currency_code,
                invoice_amount=invoice_amount,
                status=status,
                issued_at=self.now,
                due_at=due_at,
                dispute_reason="Pricing discrepancy" if status == "DISPUTED" else None,
                notes=None,
                created_at=self.now,
                created_by="settlement.ops",
                updated_at=self.now,
                updated_by="settlement.ops",
                version=1,
            )
            session.add(invoice)
            session.commit()
            session.refresh(invoice)
            return invoice.id

    def _seed_payment(
        self,
        *,
        trade_id: str,
        invoice_id: int,
        payment_amount: float,
        due_at: datetime,
        status: str = "PAID",
        received_at: datetime | None = None,
        payment_currency_code: str = "USD",
    ) -> int:
        with self.SessionLocal() as session:
            payment = TradePayment(
                trade_id=trade_id,
                invoice_id=invoice_id,
                payment_reference=f"PMT-{trade_id}-{invoice_id}",
                payment_currency_code=payment_currency_code,
                payment_amount=payment_amount,
                status=status,
                due_at=due_at,
                received_at=received_at,
                notes=None,
                created_at=self.now,
                created_by="cash.ops",
                updated_at=self.now,
                updated_by="cash.ops",
                version=1,
            )
            session.add(payment)
            session.commit()
            session.refresh(payment)
            return payment.id

    def test_settlement_aging_report_groups_open_invoices_into_buckets(self) -> None:
        self._seed_trade(trade_id="T-AGE-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS")
        self._seed_trade(trade_id="T-AGE-2", counterparty="SHELL_TRADING", book="CRUDE_PHYS", invoice_status="APPROVED")
        self._seed_trade(trade_id="T-AGE-3", counterparty="BP_TRADING", book="DISTILLATES", invoice_status="DISPUTED")
        self._seed_trade(
            trade_id="T-AGE-4",
            counterparty="MERCURIA",
            book="CRUDE_PHYS",
            invoice_status="APPROVED",
            payment_status="PAID",
            settlement_status="SETTLED",
        )

        self._seed_invoice(
            trade_id="T-AGE-1",
            invoice_number="INV-AGE-1",
            invoice_amount=1000,
            due_at=datetime(2026, 4, 6, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
        )
        self._seed_invoice(
            trade_id="T-AGE-2",
            invoice_number="INV-AGE-2",
            invoice_amount=500,
            due_at=datetime(2026, 4, 2, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        self._seed_invoice(
            trade_id="T-AGE-3",
            invoice_number="INV-AGE-3",
            invoice_amount=300,
            due_at=datetime(2026, 2, 25, 12, 0, tzinfo=timezone.utc),
            status="DISPUTED",
        )
        paid_invoice_id = self._seed_invoice(
            trade_id="T-AGE-4",
            invoice_number="INV-AGE-4",
            invoice_amount=250,
            due_at=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        self._seed_payment(
            trade_id="T-AGE-4",
            invoice_id=paid_invoice_id,
            payment_amount=250,
            due_at=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
            status="PAID",
            received_at=datetime(2026, 4, 3, 15, 0, tzinfo=timezone.utc),
        )

        response = self.client.get("/reports/settlement-aging?as_of=2026-04-06", headers=self.report_headers)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body["invoice_count"], 3)
        self.assertEqual(body["overdue_invoice_count"], 2)
        self.assertEqual(body["disputed_invoice_count"], 1)
        self.assertEqual(body["row_count"], 2)

        usd_summary = next(row for row in body["currency_summaries"] if row["currency_code"] == "USD")
        self.assertEqual(usd_summary["total_outstanding_amount"], 1800.0)
        self.assertEqual(usd_summary["current_amount"], 1000.0)
        self.assertEqual(usd_summary["past_due_1_7_amount"], 500.0)
        self.assertEqual(usd_summary["past_due_31_plus_amount"], 300.0)
        self.assertEqual(usd_summary["disputed_amount"], 300.0)

        rows_by_counterparty = {row["counterparty_code"]: row for row in body["rows"]}
        self.assertEqual(rows_by_counterparty["SHELL_TRADING"]["trade_count"], 2)
        self.assertEqual(rows_by_counterparty["SHELL_TRADING"]["total_outstanding_amount"], 1500.0)
        self.assertEqual(rows_by_counterparty["BP_TRADING"]["disputed_invoice_count"], 1)

    def test_cash_forecast_report_separates_open_overdue_and_received_cash(self) -> None:
        self._seed_trade(trade_id="T-CASH-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS")
        self._seed_trade(trade_id="T-CASH-2", counterparty="SHELL_TRADING", book="CRUDE_PHYS")
        self._seed_trade(
            trade_id="T-CASH-3",
            counterparty="MERCURIA",
            book="CRUDE_PHYS",
            payment_status="PENDING",
            settlement_status="PARTIALLY_SETTLED",
        )
        self._seed_trade(
            trade_id="T-CASH-4",
            counterparty="VITOL",
            book="DISTILLATES",
            trade_currency_code="EUR",
        )

        self._seed_invoice(
            trade_id="T-CASH-1",
            invoice_number="INV-CASH-1",
            invoice_amount=1000,
            due_at=datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
        )
        self._seed_invoice(
            trade_id="T-CASH-2",
            invoice_number="INV-CASH-2",
            invoice_amount=400,
            due_at=datetime(2026, 4, 4, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        partial_invoice_id = self._seed_invoice(
            trade_id="T-CASH-3",
            invoice_number="INV-CASH-3",
            invoice_amount=900,
            due_at=datetime(2026, 4, 12, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        self._seed_payment(
            trade_id="T-CASH-3",
            invoice_id=partial_invoice_id,
            payment_amount=350,
            due_at=datetime(2026, 4, 12, 12, 0, tzinfo=timezone.utc),
            status="PAID",
            received_at=datetime(2026, 4, 7, 14, 0, tzinfo=timezone.utc),
        )
        self._seed_invoice(
            trade_id="T-CASH-4",
            invoice_number="INV-CASH-4",
            invoice_amount=200,
            due_at=datetime(2026, 4, 9, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
            invoice_currency_code="EUR",
        )

        response = self.client.get("/reports/cash-forecast?as_of=2026-04-06&horizon_days=7", headers=self.report_headers)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body["horizon_days"], 7)
        self.assertIn("Expected cash is derived", body["basis"])
        self.assertEqual(body["row_count"], 4)

        summaries = {row["currency_code"]: row for row in body["currency_summaries"]}
        self.assertEqual(summaries["USD"]["open_outstanding_amount"], 1950.0)
        self.assertEqual(summaries["USD"]["overdue_outstanding_amount"], 400.0)
        self.assertEqual(summaries["USD"]["expected_horizon_amount"], 1550.0)
        self.assertEqual(summaries["USD"]["received_horizon_amount"], 350.0)
        self.assertEqual(summaries["USD"]["upcoming_invoice_count"], 2)
        self.assertEqual(summaries["USD"]["overdue_invoice_count"], 1)
        self.assertEqual(summaries["USD"]["received_payment_count"], 1)
        self.assertEqual(summaries["EUR"]["open_outstanding_amount"], 200.0)
        self.assertEqual(summaries["EUR"]["expected_horizon_amount"], 200.0)

        points = {(row["forecast_date"], row["currency_code"]): row for row in body["points"]}
        self.assertEqual(points[("2026-04-07", "USD")]["received_amount"], 350.0)
        self.assertEqual(points[("2026-04-08", "USD")]["expected_amount"], 1000.0)
        self.assertEqual(points[("2026-04-09", "EUR")]["expected_amount"], 200.0)
        self.assertEqual(points[("2026-04-12", "USD")]["expected_amount"], 550.0)

    def test_cash_forecast_validates_horizon_days(self) -> None:
        response = self.client.get("/reports/cash-forecast?horizon_days=0", headers=self.report_headers)
        self.assertEqual(response.status_code, 422)
        self.assertIn("horizon_days must be greater than zero", response.json()["detail"])

    def test_settlement_exception_report_surfaces_disputes_short_pays_and_overdues(self) -> None:
        self._seed_trade(trade_id="T-EX-1", counterparty="BP_TRADING", book="CRUDE_PHYS", invoice_status="DISPUTED")
        self._seed_trade(
            trade_id="T-EX-2",
            counterparty="SHELL_TRADING",
            book="CRUDE_PHYS",
            payment_status="PENDING",
            settlement_status="PARTIALLY_SETTLED",
        )
        self._seed_trade(trade_id="T-EX-3", counterparty="VITOL", book="DISTILLATES")

        self._seed_invoice(
            trade_id="T-EX-1",
            invoice_number="INV-EX-1",
            invoice_amount=700,
            due_at=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            status="DISPUTED",
        )
        short_pay_invoice_id = self._seed_invoice(
            trade_id="T-EX-2",
            invoice_number="INV-EX-2",
            invoice_amount=1000,
            due_at=datetime(2026, 4, 10, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        self._seed_payment(
            trade_id="T-EX-2",
            invoice_id=short_pay_invoice_id,
            payment_amount=400,
            due_at=datetime(2026, 4, 10, 12, 0, tzinfo=timezone.utc),
            status="PAID",
            received_at=datetime(2026, 4, 5, 17, 0, tzinfo=timezone.utc),
        )
        self._seed_invoice(
            trade_id="T-EX-3",
            invoice_number="INV-EX-3",
            invoice_amount=300,
            due_at=datetime(2026, 4, 3, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
        )

        response = self.client.get("/reports/settlement-exceptions?as_of=2026-04-06", headers=self.report_headers)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body["row_count"], 4)
        self.assertEqual(body["blocked_count"], 3)
        self.assertEqual(body["warning_count"], 1)

        summaries = {row["exception_type"]: row for row in body["summaries"]}
        self.assertEqual(summaries["DISPUTED_INVOICE"]["exception_count"], 1)
        self.assertEqual(summaries["SHORT_PAY"]["exception_count"], 1)
        self.assertEqual(summaries["OVERDUE_PAYMENT"]["exception_count"], 2)

        dispute_rows = [row for row in body["rows"] if row["exception_type"] == "DISPUTED_INVOICE"]
        self.assertEqual(len(dispute_rows), 1)
        self.assertEqual(dispute_rows[0]["trade_id"], "T-EX-1")
        self.assertEqual(dispute_rows[0]["severity"], "blocked")

        short_pay_rows = [row for row in body["rows"] if row["exception_type"] == "SHORT_PAY"]
        self.assertEqual(len(short_pay_rows), 1)
        self.assertEqual(short_pay_rows[0]["trade_id"], "T-EX-2")
        self.assertEqual(short_pay_rows[0]["severity"], "in-progress")
        self.assertEqual(short_pay_rows[0]["total_paid_amount"], 400.0)
        self.assertEqual(short_pay_rows[0]["outstanding_amount"], 600.0)

        overdue_rows = [row for row in body["rows"] if row["exception_type"] == "OVERDUE_PAYMENT"]
        self.assertEqual(len(overdue_rows), 2)
        overdue_trade_ids = {row["trade_id"] for row in overdue_rows}
        self.assertEqual(overdue_trade_ids, {"T-EX-1", "T-EX-3"})

    def test_settlement_reports_support_server_side_filters_and_filter_options(self) -> None:
        self._seed_trade(trade_id="T-FLT-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS")
        self._seed_trade(
            trade_id="T-FLT-2",
            counterparty="VITOL",
            book="DISTILLATES",
            trade_currency_code="EUR",
        )
        self._seed_trade(trade_id="T-FLT-3", counterparty="BP_TRADING", book="CRUDE_PHYS", invoice_status="DISPUTED")

        self._seed_invoice(
            trade_id="T-FLT-1",
            invoice_number="INV-FLT-1",
            invoice_amount=1000,
            due_at=datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
        )
        self._seed_invoice(
            trade_id="T-FLT-2",
            invoice_number="INV-FLT-2",
            invoice_amount=200,
            due_at=datetime(2026, 4, 9, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
            invoice_currency_code="EUR",
        )
        short_pay_invoice_id = self._seed_invoice(
            trade_id="T-FLT-3",
            invoice_number="INV-FLT-3",
            invoice_amount=600,
            due_at=datetime(2026, 4, 10, 12, 0, tzinfo=timezone.utc),
            status="DISPUTED",
        )
        self._seed_payment(
            trade_id="T-FLT-3",
            invoice_id=short_pay_invoice_id,
            payment_amount=250,
            due_at=datetime(2026, 4, 10, 12, 0, tzinfo=timezone.utc),
            status="PAID",
            received_at=datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc),
        )

        aging_response = self.client.get(
            "/reports/settlement-aging?as_of=2026-04-06&book=DISTILLATES&currency=EUR",
            headers=self.report_headers,
        )
        self.assertEqual(aging_response.status_code, 200)
        aging_body = aging_response.json()
        self.assertEqual(aging_body["row_count"], 1)
        self.assertEqual(aging_body["invoice_count"], 1)
        self.assertEqual(aging_body["rows"][0]["counterparty_code"], "VITOL")
        self.assertEqual(aging_body["currency_summaries"][0]["currency_code"], "EUR")

        forecast_response = self.client.get(
            "/reports/cash-forecast?as_of=2026-04-06&horizon_days=7&counterparty=VITOL&currency=EUR",
            headers=self.report_headers,
        )
        self.assertEqual(forecast_response.status_code, 200)
        forecast_body = forecast_response.json()
        self.assertEqual(forecast_body["row_count"], 1)
        self.assertEqual(len(forecast_body["currency_summaries"]), 1)
        self.assertEqual(forecast_body["currency_summaries"][0]["currency_code"], "EUR")
        self.assertEqual(forecast_body["points"][0]["currency_code"], "EUR")

        exception_response = self.client.get(
            "/reports/settlement-exceptions?as_of=2026-04-06&counterparty=BP_TRADING&exception_type=SHORT_PAY&severity=in-progress",
            headers=self.report_headers,
        )
        self.assertEqual(exception_response.status_code, 200)
        exception_body = exception_response.json()
        self.assertEqual(exception_body["row_count"], 1)
        self.assertEqual(exception_body["rows"][0]["trade_id"], "T-FLT-3")
        self.assertEqual(exception_body["rows"][0]["exception_type"], "SHORT_PAY")

        filter_options_response = self.client.get(
            "/reports/settlement-filter-options?as_of=2026-04-06",
            headers=self.report_headers,
        )
        self.assertEqual(filter_options_response.status_code, 200)
        filter_options = filter_options_response.json()
        self.assertEqual(filter_options["books"], ["CRUDE_PHYS", "DISTILLATES"])
        self.assertEqual(filter_options["counterparties"], ["BP_TRADING", "SHELL_TRADING", "VITOL"])
        self.assertEqual(filter_options["currencies"], ["EUR", "USD"])
        self.assertEqual(
            filter_options["exception_types"],
            ["DISPUTED_INVOICE", "SHORT_PAY", "OVERDUE_PAYMENT"],
        )
        self.assertEqual(filter_options["severities"], ["blocked", "in-progress"])

    def test_settlement_presets_are_scoped_to_user_and_shared_scope(self) -> None:
        response = self.client.get("/reports/settlement-presets")
        self.assertEqual(response.status_code, 401)

        alpha_token = self._create_user_session(
            user_id="trader_alpha",
            email="alpha@example.com",
            display_name="Trader Alpha",
        )
        beta_token = self._create_user_session(
            user_id="trader_beta",
            email="beta@example.com",
            display_name="Trader Beta",
        )

        alpha_personal = self.client.post(
            "/reports/settlement-presets",
            json={
                "name": "Midwest cash watch",
                "scope": "PERSONAL",
                "filters": {
                    "book": "CRUDE_PHYS",
                    "currency": "USD",
                },
            },
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_personal.status_code, 201)
        self.assertEqual(alpha_personal.json()["scope"], "PERSONAL")

        alpha_shared = self.client.post(
            "/reports/settlement-presets",
            json={
                "name": "Desk blocked cash",
                "scope": "SHARED",
                "filters": {
                    "exception_type": "OVERDUE_PAYMENT",
                    "severity": "blocked",
                },
            },
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_shared.status_code, 201)
        shared_preset_id = alpha_shared.json()["preset_id"]
        self.assertTrue(alpha_shared.json()["can_edit"])

        beta_personal = self.client.post(
            "/reports/settlement-presets",
            json={
                "name": "Midwest cash watch",
                "scope": "PERSONAL",
                "filters": {
                    "counterparty": "VITOL",
                    "currency": "EUR",
                },
            },
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_personal.status_code, 201)

        alpha_duplicate = self.client.post(
            "/reports/settlement-presets",
            json={
                "name": "Desk blocked cash",
                "scope": "SHARED",
                "filters": {},
            },
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_duplicate.status_code, 409)

        alpha_list = self.client.get(
            "/reports/settlement-presets",
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_list.status_code, 200)
        alpha_names = {row["name"] for row in alpha_list.json()}
        self.assertEqual(alpha_names, {"Midwest cash watch", "Desk blocked cash"})

        beta_list = self.client.get(
            "/reports/settlement-presets",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_list.status_code, 200)
        beta_rows = beta_list.json()
        beta_names = {row["name"] for row in beta_rows}
        self.assertEqual(beta_names, {"Midwest cash watch", "Desk blocked cash"})
        shared_row = next(row for row in beta_rows if row["name"] == "Desk blocked cash")
        self.assertFalse(shared_row["can_edit"])

        beta_update_shared = self.client.patch(
            f"/reports/settlement-presets/{shared_preset_id}",
            json={"name": "Desk blocked cash v2"},
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_update_shared.status_code, 403)

        alpha_update_shared = self.client.patch(
            f"/reports/settlement-presets/{shared_preset_id}",
            json={
                "name": "Desk blocked cash v2",
                "filters": {
                    "exception_type": "OVERDUE_PAYMENT",
                    "severity": "blocked",
                    "currency": "USD",
                },
            },
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_update_shared.status_code, 200)
        self.assertEqual(alpha_update_shared.json()["name"], "Desk blocked cash v2")
        self.assertEqual(alpha_update_shared.json()["filters"]["currency"], "USD")

        beta_delete_shared = self.client.delete(
            f"/reports/settlement-presets/{shared_preset_id}",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_delete_shared.status_code, 403)

        alpha_delete_shared = self.client.delete(
            f"/reports/settlement-presets/{shared_preset_id}",
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_delete_shared.status_code, 204)

        beta_list_after_delete = self.client.get(
            "/reports/settlement-presets",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_list_after_delete.status_code, 200)
        beta_names_after_delete = {row["name"] for row in beta_list_after_delete.json()}
        self.assertEqual(beta_names_after_delete, {"Midwest cash watch"})
