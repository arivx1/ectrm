from __future__ import annotations

import enum
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

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
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_accrual_entry import TradeAccrualEntry
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class AccrualsApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 11, 18, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(TradeAccrualEntry).delete()
            session.query(TradeAccrualLot).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.query(Trade).delete()
            session.commit()
        self.viewer_headers = {
            "Authorization": f"Bearer {self._create_user_session(user_id='accruals_viewer', email='accruals@example.com')}"
        }

    def _create_user_session(
        self,
        *,
        user_id: str,
        email: str,
        role: str = "TRADER",
    ) -> str:
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id=user_id,
                email=email,
                display_name="Accruals Viewer",
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
        book: str,
        portfolio: str = "PROMPT",
        counterparty: str = "SHELL_TRADING",
        commodity_class: str = "CRUDE_OIL",
        commodity: str = "WTI",
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
                    book=book,
                    portfolio=portfolio,
                    counterparty=counterparty,
                    commodity_class=commodity_class,
                    commodity=commodity,
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
                    trader_user="trader.alpha",
                    status="ACTIVE",
                    last_event_id=f"evt-{trade_id.lower()}",
                )
            )
            session.commit()

    def _seed_lot(
        self,
        *,
        accrual_lot_id: str,
        trade_id: str,
        delivery_id: str | None,
        book: str,
        portfolio: str = "PROMPT",
        counterparty: str = "SHELL_TRADING",
        commodity_class: str = "CRUDE_OIL",
        commodity: str = "WTI",
        trade_currency_code: str = "USD",
        accrual_currency_code: str = "USD",
        planned_quantity: Decimal | None = Decimal("100.000000"),
        actualized_quantity: Decimal = Decimal("100.000000"),
        billed_quantity: Decimal = Decimal("40.000000"),
        accrued_amount: Decimal = Decimal("8000.000000"),
        billed_amount: Decimal = Decimal("3200.000000"),
        collected_amount: Decimal = Decimal("1000.000000"),
        disputed_amount: Decimal = Decimal("200.000000"),
        status: str = "PARTIALLY_BILLED",
        opened_at: datetime | None = None,
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                TradeAccrualLot(
                    accrual_lot_id=accrual_lot_id,
                    trade_id=trade_id,
                    delivery_id=delivery_id,
                    leg_no=1,
                    book=book,
                    portfolio=portfolio,
                    counterparty=counterparty,
                    commodity_class=commodity_class,
                    commodity=commodity,
                    trade_currency_code=trade_currency_code,
                    accrual_currency_code=accrual_currency_code,
                    quantity_unit_code="BBL",
                    planned_quantity=planned_quantity,
                    actualized_quantity=actualized_quantity,
                    billed_quantity=billed_quantity,
                    accrued_amount=accrued_amount,
                    billed_amount=billed_amount,
                    collected_amount=collected_amount,
                    disputed_amount=disputed_amount,
                    status=status,
                    opened_at=opened_at or self.now,
                    closed_at=None,
                    notes="seeded for accrual API tests",
                    created_at=self.now,
                    created_by="test",
                    updated_at=self.now,
                    updated_by="test",
                    version=1,
                )
            )
            session.commit()

    def _seed_entry(
        self,
        *,
        entry_id: str,
        accrual_lot_id: str,
        trade_id: str,
        effective_date: date,
        entry_type: str,
        currency_code: str = "USD",
        quantity_delta: Decimal | None = None,
        amount_delta: Decimal = Decimal("0"),
        created_at: datetime | None = None,
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                TradeAccrualEntry(
                    entry_id=entry_id,
                    accrual_lot_id=accrual_lot_id,
                    entry_type=entry_type,
                    trade_id=trade_id,
                    delivery_id="DEL-1",
                    invoice_id=None,
                    payment_id=None,
                    effective_date=effective_date,
                    currency_code=currency_code,
                    quantity_delta=quantity_delta,
                    amount_delta=amount_delta,
                    reference_price=None,
                    price_index_code=None,
                    fx_rate=None,
                    notes=f"{entry_type} entry",
                    created_at=created_at or self.now,
                    created_by="test",
                )
            )
            session.commit()

    def test_accrual_reads_require_authentication(self) -> None:
        response = self.client.get("/accruals/lots")
        self.assertEqual(response.status_code, 401)

    def test_list_accrual_lots_returns_derived_balances_and_entry_metadata(self) -> None:
        self._seed_trade(trade_id="T-ACC-1", book="CRUDE_PHYS")
        self._seed_lot(
            accrual_lot_id="ALOT-1",
            trade_id="T-ACC-1",
            delivery_id="DEL-1",
            book="CRUDE_PHYS",
            opened_at=datetime(2026, 4, 10, 9, 0, tzinfo=timezone.utc),
        )
        self._seed_entry(
            entry_id="AENT-1",
            accrual_lot_id="ALOT-1",
            trade_id="T-ACC-1",
            effective_date=date(2026, 4, 10),
            entry_type="ACTUALIZATION_ESTIMATE",
            quantity_delta=Decimal("100"),
            amount_delta=Decimal("8000"),
            created_at=datetime(2026, 4, 10, 9, 5, tzinfo=timezone.utc),
        )
        self._seed_entry(
            entry_id="AENT-2",
            accrual_lot_id="ALOT-1",
            trade_id="T-ACC-1",
            effective_date=date(2026, 4, 11),
            entry_type="INVOICE_APPLIED",
            quantity_delta=Decimal("-40"),
            amount_delta=Decimal("-3200"),
            created_at=datetime(2026, 4, 11, 9, 5, tzinfo=timezone.utc),
        )

        response = self.client.get(
            "/accruals/lots",
            params={"book": "crude_phys", "accrual_currency_code": "usd"},
            headers=self.viewer_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["accrual_lot_id"], "ALOT-1")
        self.assertEqual(payload[0]["entry_count"], 2)
        self.assertEqual(payload[0]["last_entry_at"], "2026-04-11T09:05:00Z")
        self.assertEqual(payload[0]["unbilled_quantity"], 60.0)
        self.assertEqual(payload[0]["unbilled_amount"], 4800.0)
        self.assertEqual(payload[0]["billed_uncollected_amount"], 2200.0)
        self.assertEqual(payload[0]["net_open_amount"], 7000.0)

    def test_get_accrual_entries_returns_ordered_ledger_for_lot(self) -> None:
        self._seed_trade(trade_id="T-ACC-2", book="CRUDE_PHYS")
        self._seed_lot(
            accrual_lot_id="ALOT-2",
            trade_id="T-ACC-2",
            delivery_id="DEL-2",
            book="CRUDE_PHYS",
        )
        self._seed_entry(
            entry_id="AENT-3",
            accrual_lot_id="ALOT-2",
            trade_id="T-ACC-2",
            effective_date=date(2026, 4, 10),
            entry_type="ACTUALIZATION_ESTIMATE",
            quantity_delta=Decimal("50"),
            amount_delta=Decimal("4000"),
            created_at=datetime(2026, 4, 10, 8, 0, tzinfo=timezone.utc),
        )
        self._seed_entry(
            entry_id="AENT-4",
            accrual_lot_id="ALOT-2",
            trade_id="T-ACC-2",
            effective_date=date(2026, 4, 11),
            entry_type="PRICE_MARK",
            quantity_delta=None,
            amount_delta=Decimal("200"),
            created_at=datetime(2026, 4, 11, 8, 0, tzinfo=timezone.utc),
        )

        response = self.client.get("/accruals/lots/ALOT-2/entries", headers=self.viewer_headers)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([row["entry_id"] for row in payload], ["AENT-3", "AENT-4"])
        self.assertEqual(payload[0]["entry_type"], "ACTUALIZATION_ESTIMATE")
        self.assertEqual(payload[1]["entry_type"], "PRICE_MARK")
        self.assertEqual(payload[0]["amount_delta"], 4000.0)
        self.assertEqual(payload[1]["amount_delta"], 200.0)

    def test_get_accrual_entries_returns_404_for_unknown_lot(self) -> None:
        response = self.client.get("/accruals/lots/UNKNOWN/entries", headers=self.viewer_headers)
        self.assertEqual(response.status_code, 404)

    def test_get_accrual_reconciliation_projects_rows_and_currency_summaries(self) -> None:
        self._seed_trade(trade_id="T-ACC-3", book="CRUDE_PHYS")
        self._seed_trade(trade_id="T-ACC-4", book="CRUDE_PHYS")
        self._seed_trade(
            trade_id="T-ACC-5",
            book="DISTILLATE_PHYS",
            counterparty="BP_TRADING",
            commodity_class="REFINED_PRODUCTS",
            commodity="ULSD",
            trade_currency_code="EUR",
        )
        self._seed_lot(
            accrual_lot_id="ALOT-3",
            trade_id="T-ACC-3",
            delivery_id="DEL-3",
            book="CRUDE_PHYS",
        )
        self._seed_lot(
            accrual_lot_id="ALOT-4",
            trade_id="T-ACC-4",
            delivery_id="DEL-4",
            book="CRUDE_PHYS",
            planned_quantity=Decimal("50.000000"),
            actualized_quantity=Decimal("50.000000"),
            billed_quantity=Decimal("10.000000"),
            accrued_amount=Decimal("4000.000000"),
            billed_amount=Decimal("1000.000000"),
            collected_amount=Decimal("250.000000"),
            disputed_amount=Decimal("0.000000"),
        )
        self._seed_lot(
            accrual_lot_id="ALOT-5",
            trade_id="T-ACC-5",
            delivery_id="DEL-5",
            book="DISTILLATE_PHYS",
            counterparty="BP_TRADING",
            commodity_class="REFINED_PRODUCTS",
            commodity="ULSD",
            trade_currency_code="EUR",
            accrual_currency_code="EUR",
            planned_quantity=Decimal("80.000000"),
            actualized_quantity=Decimal("80.000000"),
            billed_quantity=Decimal("70.000000"),
            accrued_amount=Decimal("6000.000000"),
            billed_amount=Decimal("5000.000000"),
            collected_amount=Decimal("1000.000000"),
            disputed_amount=Decimal("300.000000"),
        )

        response = self.client.get(
            "/accruals/reconciliation",
            params={"portfolio": "prompt"},
            headers=self.viewer_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["row_count"], 2)
        self.assertEqual(payload["lot_count"], 3)

        usd_summary = next(row for row in payload["currency_summaries"] if row["currency_code"] == "USD")
        self.assertEqual(
            usd_summary,
            {
                "currency_code": "USD",
                "lot_count": 2,
                "accrued_amount": 12000.0,
                "billed_amount": 4200.0,
                "collected_amount": 1250.0,
                "disputed_amount": 200.0,
                "unbilled_amount": 7800.0,
                "billed_uncollected_amount": 2950.0,
                "net_open_amount": 10750.0,
            },
        )

        crude_row = next(row for row in payload["rows"] if row["book"] == "CRUDE_PHYS")
        self.assertEqual(crude_row["lot_count"], 2)
        self.assertEqual(crude_row["actualized_quantity"], 150.0)
        self.assertEqual(crude_row["billed_quantity"], 50.0)
        self.assertEqual(crude_row["unbilled_quantity"], 100.0)
        self.assertEqual(crude_row["unbilled_amount"], 7800.0)


if __name__ == "__main__":
    unittest.main()
