from __future__ import annotations

import enum
import unittest
from datetime import date, datetime, timezone

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reports.services.counterparty_credit import (
    build_counterparty_credit_report,
)
from apps.api.app.models.event import Base
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_credit_profile import ReferenceCounterpartyCreditProfile
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.trade import Trade
from apps.api.app.routes.reference_data import (
    CounterpartyCreate,
    CounterpartyCreditProfileUpsert,
    CurrencyCreate,
    CurrencyStatusUpdate,
    create_counterparty,
    create_currency,
    deactivate_currency,
    list_counterparty_credit_profiles,
    list_counterparty_standards,
    upsert_counterparty_credit_profile,
)


def coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class CounterpartyCreditApiTests(unittest.TestCase):
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
            session.query(ReferenceCounterpartyCreditProfile).delete()
            session.query(Trade).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceCurrency).delete()
            session.commit()

    def _create_counterparty(self, code: str, *, name: str | None = None) -> None:
        with self.SessionLocal() as session:
            create_counterparty(
                CounterpartyCreate(
                    code=code,
                    name=name or f"{code} Counterparty",
                    counterparty_type="SUPPLIER",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )

    def _create_currency(self, code: str) -> None:
        with self.SessionLocal() as session:
            create_currency(
                CurrencyCreate(
                    code=code,
                    name=f"{code} Currency",
                    description="test currency",
                    created_by="test-user",
                ),
                db=session,
            )

    def _create_trade(
        self,
        trade_id: str,
        *,
        counterparty: str,
        currency_code: str | None,
        price: float | None,
        volume: float | None,
        status: str = "ACTIVE",
        updated_at: datetime | None = None,
    ) -> None:
        trade_timestamp = updated_at or datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id=trade_id,
                    created_at=trade_timestamp,
                    updated_at=trade_timestamp,
                    book="BOOK1",
                    counterparty=counterparty,
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    trade_currency_code=currency_code,
                    price=price,
                    volume=volume,
                    status=status,
                    last_event_id=f"evt-{trade_id}",
                )
            )
            session.commit()

    def test_upsert_counterparty_credit_profile_supports_partial_updates(self) -> None:
        self._create_counterparty("ACME")
        self._create_currency("USD")

        standards = list_counterparty_standards()
        self.assertEqual(standards.default_counterparty_credit_breach_action, "REQUIRE_APPROVAL")
        self.assertEqual(
            standards.counterparty_credit_breach_actions,
            ["WARN", "REQUIRE_APPROVAL", "BLOCK"],
        )

        with self.SessionLocal() as session:
            created = upsert_counterparty_credit_profile(
                " acme ",
                CounterpartyCreditProfileUpsert(
                    credit_rating=" BBB+ ",
                    review_due_at=date(2026, 4, 10),
                    limit_currency_code=" usd ",
                    limit_amount=2500000,
                    breach_action=" block ",
                    notes=" monitor weekly ",
                    updated_by="test-user",
                ),
                db=session,
            )

            self.assertEqual(created.counterparty_code, "ACME")
            self.assertEqual(created.credit_rating, "BBB+")
            self.assertEqual(created.limit_currency_code, "USD")
            self.assertEqual(created.limit_amount, 2500000)
            self.assertEqual(created.breach_action, "BLOCK")
            self.assertEqual(created.notes, "monitor weekly")
            self.assertEqual(created.version, 1)

            updated = upsert_counterparty_credit_profile(
                "ACME",
                CounterpartyCreditProfileUpsert(
                    limit_amount=3000000,
                    notes="escalate at 80 percent",
                    updated_by="test-user",
                ),
                db=session,
            )

            self.assertEqual(updated.limit_currency_code, "USD")
            self.assertEqual(updated.limit_amount, 3000000)
            self.assertEqual(updated.breach_action, "BLOCK")
            self.assertEqual(updated.notes, "escalate at 80 percent")
            self.assertEqual(updated.version, 2)

            profiles = list_counterparty_credit_profiles(limit=50, offset=0, db=session)
            self.assertEqual(len(profiles), 1)
            self.assertEqual(profiles[0].counterparty_code, "ACME")

    def test_upsert_counterparty_credit_profile_validates_limit_configuration(self) -> None:
        self._create_counterparty("ACME")
        self._create_currency("USD")
        self._create_currency("EUR")

        with self.SessionLocal() as session:
            deactivate_currency(
                "EUR",
                CurrencyStatusUpdate(updated_by="test-user"),
                db=session,
            )

            with self.assertRaisesRegex(Exception, "must be provided together"):
                upsert_counterparty_credit_profile(
                    "ACME",
                    CounterpartyCreditProfileUpsert(
                        limit_amount=100000,
                        updated_by="test-user",
                    ),
                    db=session,
                )

            with self.assertRaisesRegex(Exception, "must be an active currency"):
                upsert_counterparty_credit_profile(
                    "ACME",
                    CounterpartyCreditProfileUpsert(
                        limit_currency_code="EUR",
                        limit_amount=100000,
                        updated_by="test-user",
                    ),
                    db=session,
                )

    def test_counterparty_credit_report_calculates_exposure_utilization_and_scope_gaps(self) -> None:
        self._create_counterparty("ACME")
        self._create_counterparty("BETA")
        self._create_currency("USD")
        self._create_currency("EUR")

        with self.SessionLocal() as session:
            upsert_counterparty_credit_profile(
                "ACME",
                CounterpartyCreditProfileUpsert(
                    credit_rating="BBB",
                    review_due_at=date(2026, 4, 4),
                    limit_currency_code="USD",
                    limit_amount=100000,
                    breach_action="REQUIRE_APPROVAL",
                    updated_by="test-user",
                ),
                db=session,
            )

        self._create_trade(
            "T-001",
            counterparty="ACME",
            currency_code="USD",
            price=60,
            volume=1000,
            updated_at=datetime(2026, 4, 5, 9, 0, tzinfo=timezone.utc),
        )
        self._create_trade(
            "T-002",
            counterparty="ACME",
            currency_code="USD",
            price=50,
            volume=900,
            updated_at=datetime(2026, 4, 5, 10, 0, tzinfo=timezone.utc),
        )
        self._create_trade(
            "T-003",
            counterparty="ACME",
            currency_code="USD",
            price=None,
            volume=1000,
            updated_at=datetime(2026, 4, 5, 11, 0, tzinfo=timezone.utc),
        )
        self._create_trade(
            "T-004",
            counterparty="ACME",
            currency_code="EUR",
            price=40,
            volume=500,
            updated_at=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
        )
        self._create_trade(
            "T-005",
            counterparty="ACME",
            currency_code="USD",
            price=999,
            volume=1,
            status="CANCELLED",
            updated_at=datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc),
        )
        self._create_trade(
            "T-006",
            counterparty="BETA",
            currency_code="USD",
            price=25,
            volume=400,
            updated_at=datetime(2026, 4, 5, 8, 0, tzinfo=timezone.utc),
        )

        with self.SessionLocal() as session:
            rows = build_counterparty_credit_report(session, as_of=date(2026, 4, 5))

        acme = next(row for row in rows if row["counterparty_code"] == "ACME")
        beta = next(row for row in rows if row["counterparty_code"] == "BETA")

        self.assertEqual(acme["active_trade_count"], 4)
        self.assertEqual(acme["exposure_currency_code"], "USD")
        self.assertEqual(acme["exposure_amount"], 105000.0)
        self.assertEqual(acme["in_exposure_currency_trade_count"], 3)
        self.assertEqual(acme["priced_trade_count"], 2)
        self.assertEqual(acme["unpriced_trade_count"], 1)
        self.assertEqual(acme["out_of_scope_trade_count"], 1)
        self.assertEqual(acme["limit_amount"], 100000.0)
        self.assertEqual(acme["limit_utilization_percent"], 105.0)
        self.assertTrue(acme["limit_breached"])
        self.assertTrue(acme["review_is_due"])
        self.assertEqual(acme["breach_action"], "REQUIRE_APPROVAL")
        self.assertEqual(
            coerce_utc(acme["latest_trade_updated_at"]),
            datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(beta["active_trade_count"], 1)
        self.assertEqual(beta["exposure_currency_code"], "USD")
        self.assertEqual(beta["exposure_amount"], 10000.0)
        self.assertIsNone(beta["limit_amount"])
        self.assertIsNone(beta["limit_utilization_percent"])
        self.assertFalse(beta["limit_breached"])


if __name__ == "__main__":
    unittest.main()
