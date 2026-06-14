from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.risk.services.counterparty_credit_policy import (
    COUNTERPARTY_CREDIT_ACTION_ALLOW,
    COUNTERPARTY_CREDIT_ACTION_ALLOW_WITH_OVERRIDE,
    COUNTERPARTY_CREDIT_ACTION_BLOCK,
    COUNTERPARTY_CREDIT_ACTION_REFRESH_REVIEW,
    COUNTERPARTY_CREDIT_ACTION_WARN,
    COUNTERPARTY_CREDIT_STATUS_BREACH,
    COUNTERPARTY_CREDIT_STATUS_CLEAR,
    COUNTERPARTY_CREDIT_STATUS_OVERRIDE_APPROVED,
    COUNTERPARTY_CREDIT_STATUS_STALE_REVIEW,
    COUNTERPARTY_CREDIT_STATUS_WATCH,
    CounterpartyCreditOverrideInput,
    CounterpartyCreditTradeInput,
    evaluate_counterparty_credit_limit_policy,
)
from apps.api.app.models.event import Base
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_credit_profile import ReferenceCounterpartyCreditProfile
from apps.api.app.models.trade import Trade


class CounterpartyCreditPolicyServiceTests(unittest.TestCase):
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
        self.now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(Trade).delete()
            session.query(ReferenceCounterpartyCreditProfile).delete()
            session.query(ReferenceCounterparty).delete()
            session.commit()

    def _seed_counterparty(
        self,
        session,
        *,
        code: str = "ACME",
        limit_amount: str = "100000.00",
        breach_action: str = "REQUIRE_APPROVAL",
        review_due_at: date = date(2026, 12, 31),
    ) -> None:
        session.add(
            ReferenceCounterparty(
                code=code,
                name=f"{code} Energy",
                short_name=code,
                legal_entity_name=f"{code} Energy LLC",
                counterparty_type="SUPPLIER",
                country_code="US",
                lei_code=None,
                duns_number=None,
                ticker_symbol=None,
                credit_status="APPROVED",
                description="Test counterparty",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test",
                updated_at=self.now,
                updated_by="test",
                version=1,
            )
        )
        session.add(
            ReferenceCounterpartyCreditProfile(
                counterparty_code=code,
                credit_rating="BBB",
                review_due_at=review_due_at,
                limit_currency_code="USD",
                limit_amount=Decimal(limit_amount),
                breach_action=breach_action,
                notes=None,
                created_at=self.now,
                created_by="test",
                updated_at=self.now,
                updated_by="test",
                version=1,
            )
        )

    def _seed_trade(
        self,
        session,
        *,
        trade_id: str,
        counterparty: str = "ACME",
        price: str,
        volume: str,
        currency_code: str = "USD",
    ) -> None:
        session.add(
            Trade(
                trade_id=trade_id,
                created_at=self.now,
                updated_at=self.now,
                book="GAS_PHYS",
                counterparty=counterparty,
                commodity_class="NATURAL_GAS",
                commodity="HENRY_HUB_GAS",
                trade_currency_code=currency_code,
                price=Decimal(price),
                volume=Decimal(volume),
                status="ACTIVE",
                last_event_id=f"evt-{trade_id}",
            )
        )

    def _trade_input(
        self,
        *,
        price: str,
        volume: str,
        trade_id: str = "NEW-TRADE",
    ) -> CounterpartyCreditTradeInput:
        return CounterpartyCreditTradeInput(
            trade_id=trade_id,
            counterparty_code="ACME",
            trade_currency_code="USD",
            price=Decimal(price),
            volume=Decimal(volume),
        )

    def test_policy_clears_when_projected_exposure_is_below_watch_threshold(self) -> None:
        with self.SessionLocal() as session:
            self._seed_counterparty(session)
            self._seed_trade(session, trade_id="T-EXISTING", price="10", volume="1000")
            session.commit()

            result = evaluate_counterparty_credit_limit_policy(
                session,
                trade_input=self._trade_input(price="20", volume="1000"),
                as_of=date(2026, 6, 1),
            )

        self.assertEqual(result.policy_status, COUNTERPARTY_CREDIT_STATUS_CLEAR)
        self.assertEqual(result.action_required, COUNTERPARTY_CREDIT_ACTION_ALLOW)
        self.assertEqual(result.current_exposure_amount, Decimal("10000.0000000000"))
        self.assertEqual(result.projected_trade_exposure_amount, Decimal("20000"))
        self.assertEqual(result.projected_exposure_amount, Decimal("30000.0000000000"))
        self.assertEqual(float(result.projected_utilization_percent), 30.0)
        self.assertFalse(result.limit_breached)

    def test_policy_warns_when_projected_exposure_is_in_watch_zone(self) -> None:
        with self.SessionLocal() as session:
            self._seed_counterparty(session)
            self._seed_trade(session, trade_id="T-EXISTING", price="70", volume="1000")
            session.commit()

            result = evaluate_counterparty_credit_limit_policy(
                session,
                trade_input=self._trade_input(price="15", volume="1000"),
                as_of=date(2026, 6, 1),
            )

        self.assertEqual(result.policy_status, COUNTERPARTY_CREDIT_STATUS_WATCH)
        self.assertEqual(result.action_required, COUNTERPARTY_CREDIT_ACTION_WARN)
        self.assertEqual(float(result.projected_utilization_percent), 85.0)
        self.assertIn("projected utilization is in the credit watch zone", result.warning_reasons)

    def test_policy_uses_profile_breach_action_when_limit_is_breached(self) -> None:
        with self.SessionLocal() as session:
            self._seed_counterparty(session, breach_action="BLOCK")
            self._seed_trade(session, trade_id="T-EXISTING", price="70", volume="1000")
            session.commit()

            result = evaluate_counterparty_credit_limit_policy(
                session,
                trade_input=self._trade_input(price="40", volume="1000"),
                as_of=date(2026, 6, 1),
            )

        self.assertEqual(result.policy_status, COUNTERPARTY_CREDIT_STATUS_BREACH)
        self.assertEqual(result.action_required, COUNTERPARTY_CREDIT_ACTION_BLOCK)
        self.assertTrue(result.limit_breached)
        self.assertEqual(result.projected_exposure_amount, Decimal("110000.0000000000"))
        self.assertIn("projected exposure exceeds the governed credit limit", result.stop_reasons)

    def test_policy_requires_review_refresh_when_credit_review_is_stale(self) -> None:
        with self.SessionLocal() as session:
            self._seed_counterparty(session, review_due_at=date(2026, 5, 31))
            self._seed_trade(session, trade_id="T-EXISTING", price="10", volume="1000")
            session.commit()

            result = evaluate_counterparty_credit_limit_policy(
                session,
                trade_input=self._trade_input(price="20", volume="1000"),
                as_of=date(2026, 6, 1),
            )

        self.assertEqual(result.policy_status, COUNTERPARTY_CREDIT_STATUS_STALE_REVIEW)
        self.assertEqual(result.action_required, COUNTERPARTY_CREDIT_ACTION_REFRESH_REVIEW)
        self.assertTrue(result.review_is_stale)
        self.assertIn("governed credit review is stale", result.stop_reasons)

    def test_policy_allows_breach_with_active_sufficient_override(self) -> None:
        with self.SessionLocal() as session:
            self._seed_counterparty(session, breach_action="BLOCK")
            self._seed_trade(session, trade_id="T-EXISTING", price="70", volume="1000")
            session.commit()

            result = evaluate_counterparty_credit_limit_policy(
                session,
                trade_input=self._trade_input(price="40", volume="1000"),
                as_of=date(2026, 6, 1),
                override=CounterpartyCreditOverrideInput(
                    override_id="credit-approval-1",
                    status="ACTIVE",
                    limit_currency_code="USD",
                    approved_projected_exposure_amount=Decimal("120000"),
                    expires_at=datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc),
                    approved_by="credit-manager",
                ),
            )

        self.assertEqual(result.policy_status, COUNTERPARTY_CREDIT_STATUS_OVERRIDE_APPROVED)
        self.assertEqual(result.action_required, COUNTERPARTY_CREDIT_ACTION_ALLOW_WITH_OVERRIDE)
        self.assertTrue(result.limit_breached)
        self.assertTrue(result.override_applied)
        self.assertEqual(result.override_id, "credit-approval-1")


if __name__ == "__main__":
    unittest.main()
