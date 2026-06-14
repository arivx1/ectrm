from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.accruals.services import (
    create_manual_accrual_entry,
    rebuild_trade_accruals_ledger,
    reverse_manual_accrual_entry,
    synchronize_trade_accruals,
)
from apps.api.app.domains.operations.services.actualizations import build_delivery_obligation_id
from apps.api.app.domains.operations.services.settlement_invoices import (
    issue_trade_invoice,
    update_trade_invoice,
)
from apps.api.app.models.event import Base
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_leg import TradeLeg


class TradeAccrualServiceTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 11, 18, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(TradeAccrualEntry).delete()
            session.query(TradeAccrualLot).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeActualization).delete()
            session.query(TradeLeg).delete()
            session.query(PriceIndexObservation).delete()
            session.query(Trade).delete()
            session.commit()

    def _seed_trade(
        self,
        *,
        trade_id: str,
        pricing_type: str,
        price: float | None,
        price_index_code: str | None = None,
        trade_currency_code: str = "USD",
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
                    trade_date=date(2026, 4, 10),
                    effective_start_date=date(2026, 4, 10),
                    effective_end_date=date(2026, 4, 20),
                    quality_spec=None,
                    unit_of_measure="BBL",
                    trade_currency_code=trade_currency_code,
                    location_code="CUSHING",
                    delivery_start=date(2026, 4, 10),
                    delivery_end=date(2026, 4, 20),
                    price_unit_code="BBL",
                    instrument_type="LINEAR",
                    option_type=None,
                    option_style=None,
                    option_strike_price=None,
                    option_expiration_date=None,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE_PHYS",
                    portfolio="PROMPT",
                    counterparty="SHELL_TRADING",
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    pricing_type=pricing_type,
                    pricing_status="PRICED",
                    confirmation_status="CONFIRMED",
                    nomination_status="NOMINATED",
                    allocation_status="ALLOCATED",
                    actualization_status="ACTUALIZED",
                    price_index_code=price_index_code,
                    price=price,
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

    def _seed_trade_leg(
        self,
        *,
        trade_id: str,
        leg_no: int,
        quantity: Decimal,
        quantity_unit_code: str = "BBL",
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                TradeLeg(
                    trade_leg_id=f"{trade_id}-LEG-{leg_no}",
                    trade_id=trade_id,
                    leg_no=leg_no,
                    side="BUY",
                    commodity_class="CRUDE_OIL",
                    commodity_code="WTI",
                    location_code="CUSHING",
                    quantity=quantity,
                    quantity_unit_code=quantity_unit_code,
                    delivery_start=date(2026, 4, 10),
                    delivery_end=date(2026, 4, 20),
                    created_at=self.now,
                    updated_at=self.now,
                )
            )
            session.commit()

    def _seed_actualization(
        self,
        *,
        trade_id: str,
        leg_no: int | None = None,
        actual_quantity: Decimal,
        actualized_at: datetime | None = None,
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                TradeActualization(
                    delivery_id=build_delivery_obligation_id(trade_id, leg_no),
                    trade_id=trade_id,
                    leg_no=leg_no,
                    actual_quantity=actual_quantity,
                    actualized_at=actualized_at or self.now,
                    source="OPS",
                    notes="actualized",
                    created_at=self.now,
                    created_by="ops",
                    updated_at=self.now,
                    updated_by="ops",
                    version=1,
                )
            )
            session.commit()

    def _seed_price_observation(
        self,
        *,
        price_index_code: str,
        observation_date: date,
        value: Decimal,
        currency_code: str = "USD",
    ) -> None:
        downloaded_at = datetime.combine(observation_date, datetime.min.time(), tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                PriceIndexObservation(
                    price_index_code=price_index_code,
                    observation_date=observation_date,
                    value=value,
                    unit_code="BBL",
                    currency_code=currency_code,
                    source_provider="EIA",
                    source_series_id=f"{price_index_code}-SERIES",
                    source_frequency="daily",
                    source_published_at=downloaded_at,
                    source_revision=None,
                    downloaded_at=downloaded_at,
                    run_id=1,
                    raw_payload=None,
                    created_at=downloaded_at,
                    updated_at=downloaded_at,
                )
            )
            session.commit()

    def test_synchronize_trade_accruals_creates_fixed_price_lot_and_entries(self) -> None:
        self._seed_trade(trade_id="T-ACC-FIXED", pricing_type="FIXED", price=80.0)
        self._seed_actualization(trade_id="T-ACC-FIXED", actual_quantity=Decimal("100"))

        with self.SessionLocal() as session:
            synchronized_count = synchronize_trade_accruals(
                session,
                trade_id="T-ACC-FIXED",
                actor_id="test-user",
                now=self.now,
            )
            session.commit()

            lots = session.query(TradeAccrualLot).all()
            entries = session.query(TradeAccrualEntry).order_by(TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc()).all()

        self.assertEqual(synchronized_count, 1)
        self.assertEqual(len(lots), 1)
        self.assertEqual(float(lots[0].actualized_quantity), 100.0)
        self.assertEqual(float(lots[0].accrued_amount), 8000.0)
        self.assertEqual(lots[0].status, "ACCRUED")
        self.assertEqual(sorted(entry.entry_type for entry in entries), ["ACTUALIZATION_ESTIMATE", "PRICE_MARK"])
        quantity_entry = next(entry for entry in entries if entry.entry_type == "ACTUALIZATION_ESTIMATE")
        price_mark_entry = next(entry for entry in entries if entry.entry_type == "PRICE_MARK")
        self.assertEqual(float(quantity_entry.quantity_delta), 100.0)
        self.assertEqual(float(price_mark_entry.amount_delta), 8000.0)
        self.assertEqual(float(price_mark_entry.reference_price), 80.0)

    def test_synchronize_trade_accruals_appends_true_up_entries_when_actualization_changes(self) -> None:
        self._seed_trade(trade_id="T-ACC-TRUEUP", pricing_type="FIXED", price=80.0)
        self._seed_actualization(trade_id="T-ACC-TRUEUP", actual_quantity=Decimal("100"))

        with self.SessionLocal() as session:
            synchronize_trade_accruals(session, trade_id="T-ACC-TRUEUP", actor_id="test-user", now=self.now)
            session.commit()

            actualization = session.query(TradeActualization).filter_by(trade_id="T-ACC-TRUEUP").one()
            actualization.actual_quantity = Decimal("120")
            actualization.updated_at = self.now
            actualization.updated_by = "test-user"
            synchronize_trade_accruals(session, trade_id="T-ACC-TRUEUP", actor_id="test-user", now=self.now)
            session.commit()

            lot = session.query(TradeAccrualLot).filter_by(trade_id="T-ACC-TRUEUP").one()
            entries = session.query(TradeAccrualEntry).filter_by(trade_id="T-ACC-TRUEUP").order_by(TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc()).all()

        self.assertEqual(float(lot.actualized_quantity), 120.0)
        self.assertEqual(float(lot.accrued_amount), 9600.0)
        self.assertEqual(
            sorted(entry.entry_type for entry in entries),
            ["ACTUALIZATION_ESTIMATE", "ACTUALIZATION_TRUE_UP", "PRICE_MARK", "PRICE_MARK"],
        )
        true_up_entry = next(entry for entry in entries if entry.entry_type == "ACTUALIZATION_TRUE_UP")
        incremental_mark_entry = next(
            entry
            for entry in entries
            if entry.entry_type == "PRICE_MARK" and float(entry.amount_delta) == 1600.0
        )
        self.assertEqual(float(true_up_entry.quantity_delta), 20.0)
        self.assertEqual(float(incremental_mark_entry.amount_delta), 1600.0)

    def test_rebuild_trade_accruals_ledger_refreshes_index_priced_mark(self) -> None:
        self._seed_trade(
            trade_id="T-ACC-INDEX",
            pricing_type="INDEX",
            price=None,
            price_index_code="WTI_CUSHING_D",
        )
        self._seed_actualization(trade_id="T-ACC-INDEX", actual_quantity=Decimal("50"))
        self._seed_price_observation(
            price_index_code="WTI_CUSHING_D",
            observation_date=date(2026, 4, 10),
            value=Decimal("75"),
        )

        with self.SessionLocal() as session:
            synchronize_trade_accruals(session, trade_id="T-ACC-INDEX", actor_id="test-user", now=self.now)
            session.commit()
        self._seed_price_observation(
            price_index_code="WTI_CUSHING_D",
            observation_date=date(2026, 4, 11),
            value=Decimal("77"),
        )

        with self.SessionLocal() as session:
            synchronized_count = rebuild_trade_accruals_ledger(
                session,
                price_index_codes=["WTI_CUSHING_D"],
                actor_id="market-data",
                now=self.now,
            )
            session.commit()

            lot = session.query(TradeAccrualLot).filter_by(trade_id="T-ACC-INDEX").one()
            entries = session.query(TradeAccrualEntry).filter_by(trade_id="T-ACC-INDEX").order_by(TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc()).all()

        self.assertEqual(synchronized_count, 1)
        self.assertEqual(float(lot.accrued_amount), 3850.0)
        self.assertEqual(sorted(entry.entry_type for entry in entries), ["ACTUALIZATION_ESTIMATE", "PRICE_MARK", "PRICE_MARK"])
        refreshed_mark_entry = next(
            entry
            for entry in entries
            if entry.entry_type == "PRICE_MARK" and float(entry.amount_delta) == 100.0
        )
        self.assertEqual(float(refreshed_mark_entry.amount_delta), 100.0)
        self.assertEqual(refreshed_mark_entry.price_index_code, "WTI_CUSHING_D")
        self.assertEqual(float(refreshed_mark_entry.reference_price), 77.0)

    def test_issue_trade_invoice_relieves_accrual_lot_and_records_traceable_entry(self) -> None:
        self._seed_trade(trade_id="T-ACC-INVOICE", pricing_type="FIXED", price=80.0)
        self._seed_actualization(trade_id="T-ACC-INVOICE", actual_quantity=Decimal("100"))

        with self.SessionLocal() as session:
            synchronize_trade_accruals(session, trade_id="T-ACC-INVOICE", actor_id="ops", now=self.now)
            invoice = issue_trade_invoice(
                session,
                trade_id="T-ACC-INVOICE",
                actor_id="settlement.ops",
                billed_quantity=Decimal("40"),
                now=self.now,
            )
            session.commit()

            lot = session.query(TradeAccrualLot).filter_by(trade_id="T-ACC-INVOICE").one()
            invoice_entries = (
                session.query(TradeAccrualEntry)
                .filter(TradeAccrualEntry.invoice_id == invoice.invoice_id)
                .order_by(TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc())
                .all()
            )

        self.assertEqual(float(lot.billed_quantity), 40.0)
        self.assertEqual(float(lot.billed_amount), 3200.0)
        self.assertEqual(lot.status, "PARTIALLY_BILLED")
        self.assertEqual([entry.entry_type for entry in invoice_entries], ["INVOICE_APPLIED"])
        self.assertEqual(float(invoice_entries[0].quantity_delta), -40.0)
        self.assertEqual(float(invoice_entries[0].amount_delta), -3200.0)

    def test_manual_accrual_entry_updates_lot_rollup_without_losing_system_managed_balance(self) -> None:
        self._seed_trade(trade_id="T-ACC-MANUAL", pricing_type="FIXED", price=80.0)
        self._seed_actualization(trade_id="T-ACC-MANUAL", actual_quantity=Decimal("100"))

        with self.SessionLocal() as session:
            synchronize_trade_accruals(session, trade_id="T-ACC-MANUAL", actor_id="ops", now=self.now)
            lot = session.query(TradeAccrualLot).filter_by(trade_id="T-ACC-MANUAL").one()
            entry = create_manual_accrual_entry(
                session,
                accrual_lot_id=lot.accrual_lot_id,
                actor_id="controller",
                quantity_delta=Decimal("10"),
                amount_delta=Decimal("500"),
                effective_at=self.now,
                notes="Controller catch-up accrual.",
                now=self.now,
            )
            session.commit()

            refreshed_lot = session.get(TradeAccrualLot, lot.accrual_lot_id)
            entries = (
                session.query(TradeAccrualEntry)
                .filter_by(accrual_lot_id=lot.accrual_lot_id)
                .order_by(TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc())
                .all()
            )

        assert refreshed_lot is not None
        self.assertEqual(entry.entry_type, "MANUAL_ADJUSTMENT")
        self.assertIsNone(entry.reversal_of_entry_id)
        self.assertEqual(float(refreshed_lot.actualized_quantity), 110.0)
        self.assertEqual(float(refreshed_lot.accrued_amount), 8500.0)
        self.assertEqual(refreshed_lot.status, "ACCRUED")
        manual_entry = next(row for row in entries if row.entry_type == "MANUAL_ADJUSTMENT")
        self.assertEqual(float(manual_entry.quantity_delta), 10.0)
        self.assertEqual(float(manual_entry.amount_delta), 500.0)

    def test_reverse_manual_accrual_entry_restores_lot_rollup_with_offsetting_entry(self) -> None:
        self._seed_trade(trade_id="T-ACC-MANUAL-REV", pricing_type="FIXED", price=80.0)
        self._seed_actualization(trade_id="T-ACC-MANUAL-REV", actual_quantity=Decimal("100"))

        with self.SessionLocal() as session:
            synchronize_trade_accruals(session, trade_id="T-ACC-MANUAL-REV", actor_id="ops", now=self.now)
            lot = session.query(TradeAccrualLot).filter_by(trade_id="T-ACC-MANUAL-REV").one()
            original_entry = create_manual_accrual_entry(
                session,
                accrual_lot_id=lot.accrual_lot_id,
                actor_id="controller",
                quantity_delta=Decimal("5"),
                amount_delta=Decimal("200"),
                effective_at=self.now,
                notes="Temporary adjustment.",
                now=self.now,
            )
            reversal_entry = reverse_manual_accrual_entry(
                session,
                entry_id=original_entry.entry_id,
                actor_id="controller",
                reversal_reason="Evidence corrected.",
                effective_at=self.now,
                now=self.now,
            )
            session.commit()

            refreshed_lot = session.get(TradeAccrualLot, lot.accrual_lot_id)
            entries = (
                session.query(TradeAccrualEntry)
                .filter_by(accrual_lot_id=lot.accrual_lot_id)
                .order_by(TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc())
                .all()
            )

        assert refreshed_lot is not None
        self.assertEqual(reversal_entry.entry_type, "MANUAL_REVERSAL")
        self.assertEqual(reversal_entry.reversal_of_entry_id, original_entry.entry_id)
        self.assertEqual(float(refreshed_lot.actualized_quantity), 100.0)
        self.assertEqual(float(refreshed_lot.accrued_amount), 8000.0)
        self.assertEqual(refreshed_lot.status, "ACCRUED")
        reversal_ledger_entry = next(row for row in entries if row.entry_type == "MANUAL_REVERSAL")
        self.assertEqual(float(reversal_ledger_entry.quantity_delta), -5.0)
        self.assertEqual(float(reversal_ledger_entry.amount_delta), -200.0)

    def test_invoice_dispute_updates_lot_disputed_balance_with_history(self) -> None:
        self._seed_trade(trade_id="T-ACC-DISPUTE", pricing_type="FIXED", price=80.0)
        self._seed_actualization(trade_id="T-ACC-DISPUTE", actual_quantity=Decimal("100"))

        with self.SessionLocal() as session:
            synchronize_trade_accruals(session, trade_id="T-ACC-DISPUTE", actor_id="ops", now=self.now)
            invoice = issue_trade_invoice(
                session,
                trade_id="T-ACC-DISPUTE",
                actor_id="settlement.ops",
                billed_quantity=Decimal("40"),
                now=self.now,
            )
            update_trade_invoice(
                session,
                invoice_id=invoice.invoice_id,
                actor_id="settlement.ops",
                changes={
                    "status": "DISPUTED",
                    "dispute_reason": "Volume mismatch against actualization.",
                },
                now=self.now + timedelta(minutes=1),
            )
            update_trade_invoice(
                session,
                invoice_id=invoice.invoice_id,
                actor_id="settlement.ops",
                changes={
                    "status": "APPROVED",
                    "dispute_reason": None,
                },
                now=self.now + timedelta(minutes=2),
            )
            session.commit()

            lot = session.query(TradeAccrualLot).filter_by(trade_id="T-ACC-DISPUTE").one()
            dispute_entries = (
                session.query(TradeAccrualEntry)
                .filter(TradeAccrualEntry.invoice_id == invoice.invoice_id)
                .filter(TradeAccrualEntry.entry_type.in_(("DISPUTE_HOLD", "DISPUTE_RELEASE")))
                .order_by(TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc())
                .all()
            )

        self.assertEqual(float(lot.disputed_amount), 0.0)
        self.assertEqual(lot.status, "PARTIALLY_BILLED")
        self.assertEqual([entry.entry_type for entry in dispute_entries], ["DISPUTE_HOLD", "DISPUTE_RELEASE"])
        self.assertEqual(float(dispute_entries[0].amount_delta), 3200.0)
        self.assertEqual(float(dispute_entries[1].amount_delta), -3200.0)

    def test_synchronize_trade_accruals_backfills_prior_amount_only_invoice_across_delivery_lots(self) -> None:
        self._seed_trade(trade_id="T-ACC-BACKFILL", pricing_type="FIXED", price=80.0)
        self._seed_trade_leg(trade_id="T-ACC-BACKFILL", leg_no=1, quantity=Decimal("50"))
        self._seed_trade_leg(trade_id="T-ACC-BACKFILL", leg_no=2, quantity=Decimal("50"))

        with self.SessionLocal() as session:
            invoice = issue_trade_invoice(
                session,
                trade_id="T-ACC-BACKFILL",
                actor_id="settlement.ops",
                invoice_amount=Decimal("6000"),
                now=self.now,
            )
            session.commit()

            invoice_entries = session.query(TradeAccrualEntry).filter(TradeAccrualEntry.invoice_id == invoice.invoice_id).all()
            self.assertEqual(invoice_entries, [])

        self._seed_actualization(
            trade_id="T-ACC-BACKFILL",
            leg_no=1,
            actual_quantity=Decimal("50"),
            actualized_at=datetime(2026, 4, 10, 12, 0, tzinfo=timezone.utc),
        )
        self._seed_actualization(
            trade_id="T-ACC-BACKFILL",
            leg_no=2,
            actual_quantity=Decimal("50"),
            actualized_at=datetime(2026, 4, 11, 12, 0, tzinfo=timezone.utc),
        )

        with self.SessionLocal() as session:
            synchronize_trade_accruals(session, trade_id="T-ACC-BACKFILL", actor_id="ops", now=self.now)
            session.commit()

            lots = (
                session.query(TradeAccrualLot)
                .filter_by(trade_id="T-ACC-BACKFILL")
                .order_by(TradeAccrualLot.delivery_id.asc())
                .all()
            )
            invoice_entries = (
                session.query(TradeAccrualEntry)
                .filter(TradeAccrualEntry.invoice_id == invoice.invoice_id)
                .order_by(TradeAccrualEntry.created_at.asc(), TradeAccrualEntry.entry_id.asc())
                .all()
            )

        self.assertEqual(len(lots), 2)
        self.assertEqual(float(lots[0].billed_amount), 4000.0)
        self.assertEqual(float(lots[1].billed_amount), 2000.0)
        self.assertEqual([entry.entry_type for entry in invoice_entries], ["INVOICE_APPLIED", "INVOICE_APPLIED"])
        self.assertEqual([float(entry.amount_delta) for entry in invoice_entries], [-4000.0, -2000.0])
        self.assertTrue(all(entry.quantity_delta is None for entry in invoice_entries))


if __name__ == "__main__":
    unittest.main()
