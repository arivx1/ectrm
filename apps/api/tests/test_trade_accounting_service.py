from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.accounting.services import (
    create_trade_accounting_entry,
    list_trade_accounting_entries,
    reverse_trade_accounting_entry,
)
from apps.api.app.models.event import Base
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_accounting_entry import TradeAccountingEntry
from apps.api.app.models.trade_accounting_entry_line import TradeAccountingEntryLine


class TradeAccountingServiceTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 27, 18, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(TradeAccountingEntryLine).delete()
            session.query(TradeAccountingEntry).delete()
            session.query(Trade).delete()
            session.commit()

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
                    trade_date=date(2026, 4, 27),
                    effective_start_date=date(2026, 4, 27),
                    effective_end_date=date(2026, 4, 30),
                    quality_spec=None,
                    unit_of_measure="BBL",
                    trade_currency_code="USD",
                    location_code="CUSHING",
                    delivery_start=date(2026, 4, 27),
                    delivery_end=date(2026, 4, 30),
                    price_unit_code="BBL",
                    instrument_type="LINEAR",
                    option_type=None,
                    option_style=None,
                    option_strike_price=None,
                    option_expiration_date=None,
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
                    confirmation_status="CONFIRMED",
                    nomination_status="NOMINATED",
                    allocation_status="ALLOCATED",
                    actualization_status="ACTUALIZED",
                    price_index_code=None,
                    price=80,
                    volume=1000,
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    trader_user="controller",
                    status="ACTIVE",
                    last_event_id=f"evt-{trade_id.lower()}",
                )
            )
            session.commit()

    def test_create_trade_accounting_entry_persists_balanced_lines(self) -> None:
        self._seed_trade(trade_id="T-ACC-POST")

        with self.SessionLocal() as session:
            entry = create_trade_accounting_entry(
                session,
                actor_id="controller",
                trade_id="T-ACC-POST",
                description="Record delivered inventory accrual.",
                journal_code="ACCRUAL",
                entry_type="MANUAL_POSTING",
                effective_at=self.now,
                lines=[
                    {
                        "side": "DEBIT",
                        "account_code": "1300-INVENTORY",
                        "amount": Decimal("1500"),
                        "currency_code": "USD",
                    },
                    {
                        "side": "CREDIT",
                        "account_code": "2200-ACCRUAL",
                        "amount": Decimal("1500"),
                        "currency_code": "USD",
                    },
                ],
                now=self.now,
            )
            session.commit()

            stored_entry = session.get(TradeAccountingEntry, entry.accounting_entry_id)
            stored_lines = (
                session.query(TradeAccountingEntryLine)
                .filter_by(accounting_entry_id=entry.accounting_entry_id)
                .order_by(TradeAccountingEntryLine.line_no.asc())
                .all()
            )
            listed = list_trade_accounting_entries(session, trade_id="T-ACC-POST")

        assert stored_entry is not None
        self.assertEqual(stored_entry.trade_id, "T-ACC-POST")
        self.assertEqual(stored_entry.status, "POSTED")
        self.assertEqual(stored_entry.journal_code, "ACCRUAL")
        self.assertEqual(len(stored_lines), 2)
        self.assertEqual([line.side for line in stored_lines], ["DEBIT", "CREDIT"])
        self.assertEqual([float(line.amount) for line in stored_lines], [1500.0, 1500.0])
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["accounting_entry_id"], entry.accounting_entry_id)
        self.assertEqual(listed[0]["lines"][0]["account_code"], "1300-INVENTORY")

    def test_reverse_trade_accounting_entry_creates_offsetting_posting_and_marks_original_reversed(self) -> None:
        self._seed_trade(trade_id="T-ACC-REV")

        with self.SessionLocal() as session:
            original = create_trade_accounting_entry(
                session,
                actor_id="controller",
                trade_id="T-ACC-REV",
                description="Initial manual posting.",
                effective_at=self.now,
                lines=[
                    {
                        "side": "DEBIT",
                        "account_code": "1300-INVENTORY",
                        "amount": Decimal("900"),
                        "currency_code": "USD",
                    },
                    {
                        "side": "CREDIT",
                        "account_code": "2200-ACCRUAL",
                        "amount": Decimal("900"),
                        "currency_code": "USD",
                    },
                ],
                now=self.now,
            )
            reversal = reverse_trade_accounting_entry(
                session,
                accounting_entry_id=original.accounting_entry_id,
                actor_id="controller",
                reversal_reason="Correcting original posting.",
                effective_at=self.now,
                now=self.now,
            )
            session.commit()

            refreshed_original = session.get(TradeAccountingEntry, original.accounting_entry_id)
            reversal_lines = (
                session.query(TradeAccountingEntryLine)
                .filter_by(accounting_entry_id=reversal.accounting_entry_id)
                .order_by(TradeAccountingEntryLine.line_no.asc())
                .all()
            )

        assert refreshed_original is not None
        self.assertEqual(refreshed_original.status, "REVERSED")
        self.assertEqual(reversal.reversal_of_entry_id, original.accounting_entry_id)
        self.assertEqual(reversal.entry_type, "REVERSAL")
        self.assertEqual([line.side for line in reversal_lines], ["CREDIT", "DEBIT"])
        self.assertEqual([float(line.amount) for line in reversal_lines], [900.0, 900.0])

    def test_create_trade_accounting_entry_rejects_unbalanced_lines(self) -> None:
        self._seed_trade(trade_id="T-ACC-ERR")

        with self.SessionLocal() as session:
            with self.assertRaisesRegex(ValueError, "must balance"):
                create_trade_accounting_entry(
                    session,
                    actor_id="controller",
                    trade_id="T-ACC-ERR",
                    description="Broken posting.",
                    effective_at=self.now,
                    lines=[
                        {
                            "side": "DEBIT",
                            "account_code": "1300-INVENTORY",
                            "amount": Decimal("1000"),
                            "currency_code": "USD",
                        },
                        {
                            "side": "CREDIT",
                            "account_code": "2200-ACCRUAL",
                            "amount": Decimal("900"),
                            "currency_code": "USD",
                        },
                    ],
                    now=self.now,
                )


if __name__ == "__main__":
    unittest.main()
