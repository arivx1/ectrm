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

from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment


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
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(Trade).delete()
            session.commit()

    def _seed_trade(
        self,
        *,
        trade_id: str,
        counterparty: str,
        book: str,
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
                    portfolio="PROMPT",
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

        response = self.client.get("/reports/settlement-aging?as_of=2026-04-06")
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

        response = self.client.get("/reports/cash-forecast?as_of=2026-04-06&horizon_days=7")
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
        response = self.client.get("/reports/cash-forecast?horizon_days=0")
        self.assertEqual(response.status_code, 422)
        self.assertIn("horizon_days must be greater than zero", response.json()["detail"])
