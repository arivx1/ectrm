from __future__ import annotations

import enum
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.operations.services.actualizations import upsert_trade_actualization
from apps.api.app.domains.operations.services.shipments import append_delivery_event
from apps.api.app.domains.operations.services.shipments import synchronize_delivery_obligations_from_trades
from apps.api.app.domains.operations.services.shipments import update_delivery_obligation
from apps.api.app.domains.operations.services.trade_confirmations import create_trade_confirmation
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.domains.operations.services.settlement_invoices import issue_trade_invoice
from apps.api.app.domains.operations.services.settlement_payments import create_trade_payment
from apps.api.app.domains.operations.services.workflow_items import book_trade_workflow_item_underlying
from apps.api.app.domains.operations.services.workflow_items import update_trade_workflow_item
from apps.api.app.models.event import Base
from apps.api.app.models.event import Event
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_credit_profile import ReferenceCounterpartyCreditProfile
from apps.api.app.models.reference_counterparty_external_credit_snapshot import (
    ReferenceCounterpartyExternalCreditSnapshot,
)
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_credit_exception import TradeCreditException
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.routes.events import append_event
from apps.api.app.schemas.event import EventCreate


class TradeEventWorkflowTests(unittest.TestCase):
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
        self.now = datetime(2026, 3, 19, 15, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(OptionExposure).delete()
            session.query(Position).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeConfirmation).delete()
            session.query(TradeCreditException).delete()
            session.query(TradePriceTerm).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(TradeLeg).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(ReferenceCounterpartyExternalCreditSnapshot).delete()
            session.query(ExternalDataRun).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceCurrency).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferenceCounterpartyCreditProfile).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.commit()
            self._seed_reference_data(session)

    def _request(self):
        return SimpleNamespace(
            state=SimpleNamespace(correlation_id="test-correlation", actor_id=None),
            headers={},
        )

    def _event_datetime_patch(self, value: datetime):
        class _FixedDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                if tz is None:
                    return value.replace(tzinfo=None) if value.tzinfo is not None else value
                return value.astimezone(tz)

        return patch("apps.api.app.routes.events.datetime", _FixedDateTime)

    def _append_trade_created_event(self, session, *, trade_id: str, **payload_overrides) -> None:
        payload = {
            "book": "CRUDE_PHYS",
            "commodity_class": "CRUDE_OIL",
            "commodity": "WTI",
            "pricing_type": "FIXED",
            "trade_side": "BUY",
            "trade_nature": "PHYSICAL",
            "trade_structure": "SINGLE",
            "portfolio": "OIL_DISCRETIONARY",
            "counterparty": "SHELL_TRADING",
            "trade_currency_code": "USD",
            "price_unit_code": "BBL",
            "unit_of_measure": "BBL",
            "location_code": "CUSHING",
            "trade_date": "2026-03-21",
            "delivery_start": "2026-03-22",
            "delivery_end": "2026-03-24",
            "price": 75.25,
            "volume": 1000,
        }
        payload.update(payload_overrides)
        append_event(
            EventCreate(
                aggregate_type="trade",
                aggregate_id=trade_id,
                event_type="TradeCreated",
                occurred_at=self.now,
                actor_id="test-user",
                payload=payload,
                schema_version=4,
            ),
            request=self._request(),
            db=session,
        )

    def _upsert_counterparty_credit_profile(
        self,
        session,
        *,
        limit_amount: float,
        breach_action: str,
        limit_currency_code: str = "USD",
        review_due_at=None,
    ) -> None:
        existing = (
            session.query(ReferenceCounterpartyCreditProfile)
            .filter(ReferenceCounterpartyCreditProfile.counterparty_code == "SHELL_TRADING")
            .one_or_none()
        )
        if existing is None:
            session.add(
                ReferenceCounterpartyCreditProfile(
                    counterparty_code="SHELL_TRADING",
                    credit_rating="4A1",
                    review_due_at=review_due_at or (self.now.date() + timedelta(days=14)),
                    limit_currency_code=limit_currency_code,
                    limit_amount=limit_amount,
                    breach_action=breach_action,
                    notes="Test profile",
                    created_at=self.now,
                    created_by="test-user",
                    updated_at=self.now,
                    updated_by="test-user",
                    version=1,
                )
            )
        else:
            existing.review_due_at = review_due_at or (self.now.date() + timedelta(days=14))
            existing.limit_currency_code = limit_currency_code
            existing.limit_amount = limit_amount
            existing.breach_action = breach_action
            existing.updated_at = self.now
            existing.updated_by = "test-user"
            existing.version += 1
        session.commit()

    def _seed_counterparty_external_credit_snapshot(
        self,
        session,
        *,
        as_of_date=None,
        provider: str = "DNB",
    ) -> None:
        run = ExternalDataRun(
            provider=provider,
            job_name="counterparty_credit_import",
            status="SUCCEEDED",
            started_at=self.now,
            finished_at=self.now,
            requested_by="credit-admin",
            series_count=1,
            observation_count=1,
            error_summary=None,
            created_at=self.now,
        )
        session.add(run)
        session.flush()
        session.add(
            ReferenceCounterpartyExternalCreditSnapshot(
                counterparty_code="SHELL_TRADING",
                provider=provider,
                source_entity_id="123456789",
                source_entity_name="Shell Trading",
                match_basis="DUNS",
                matched_identifier_value="123456789",
                as_of_date=as_of_date or self.now.date(),
                rating_scale="DNB Rating",
                rating_value="4A1",
                rating_outlook="Stable",
                credit_score=80,
                probability_of_default=0.02,
                recommended_limit_currency_code="USD",
                recommended_limit_amount=2500000,
                commentary="Fresh vendor snapshot",
                downloaded_at=self.now,
                run_id=run.id,
                raw_payload={"rating": "4A1"},
                created_at=self.now,
                updated_at=self.now,
                version=1,
            )
        )
        session.flush()

    def _approve_credit_workflow_item(self, session, *, trade_id: str, notes: str = "Approved by credit.") -> None:
        credit_item = (
            session.query(TradeWorkflowItem)
            .filter(
                TradeWorkflowItem.trade_id == trade_id,
                TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
            )
            .one()
        )
        update_trade_workflow_item(
            session,
            item_id=credit_item.id,
            actor_id="credit.ops",
            actor_role="CREDIT_APPROVER",
            changes={"status": "APPROVED", "notes": notes},
            now=self.now,
        )
        session.flush()

    def _seed_reference_data(self, session) -> None:
        session.add(
            ReferenceBook(
                code="CRUDE_PHYS",
                name="Crude Physical",
                description="Test book",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add_all(
            [
                ReferenceCommodity(
                    code="WTI",
                    commodity_class="CRUDE_OIL",
                    name="WTI",
                    description="WTI",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test-user",
                    updated_at=self.now,
                    updated_by="test-user",
                    version=1,
                ),
                ReferenceCommodity(
                    code="BRENT",
                    commodity_class="CRUDE_OIL",
                    name="Brent",
                    description="Brent",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=self.now,
                    created_by="test-user",
                    updated_at=self.now,
                    updated_by="test-user",
                    version=1,
                ),
            ]
        )
        session.add(
            ReferenceCounterparty(
                code="SHELL_TRADING",
                name="Shell Trading",
                short_name=None,
                legal_entity_name=None,
                counterparty_type="SUPPLIER",
                country_code=None,
                description="Test counterparty",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferencePortfolio(
                code="OIL_DISCRETIONARY",
                name="Oil Discretionary",
                book_code="CRUDE_PHYS",
                owner=None,
                strategy="Directional",
                trader_persona=None,
                risk_archetype=None,
                description="Test portfolio",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceUnit(
                code="BBL",
                name="Barrel",
                commodity_class="CRUDE_OIL",
                dimension="VOLUME",
                base_unit_code=None,
                conversion_factor=None,
                precision=3,
                description="Barrel",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceCurrency(
                code="USD",
                name="US Dollar",
                symbol="$",
                description="US Dollar",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferenceLocation(
                code="CUSHING",
                name="Cushing",
                location_kind="POINT",
                location_type="HUB",
                parent_location_code=None,
                market="PHYSICAL",
                city="Cushing",
                subdivision_code="OK",
                country_code="US",
                continent_code="NA",
                latitude=None,
                longitude=None,
                region="Midcontinent",
                timezone="America/Chicago",
                description="Cushing hub",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.add(
            ReferencePriceIndex(
                code="WTI_M1",
                name="WTI M1",
                commodity_code="WTI",
                currency_code="USD",
                unit_code="BBL",
                provider="ICE",
                market=None,
                location_code=None,
                calendar_code=None,
                description="WTI M1",
                is_active=True,
                effective_from=None,
                effective_to=None,
                created_at=self.now,
                created_by="test-user",
                updated_at=self.now,
                updated_by="test-user",
                version=1,
            )
        )
        session.commit()

    def test_index_trade_can_omit_fixed_price(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-INDEX-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "INDEX",
                        "price_index_code": "WTI_M1",
                        "trade_side": "BUY",
                        "volume": 1000,
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-INDEX-1").one()
            event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-INDEX-1",
                    Event.event_type == "TradeCreated",
                )
                .one()
            )

        self.assertEqual(trade.pricing_type, "INDEX")
        self.assertEqual(trade.price_index_code, "WTI_M1")
        self.assertEqual(trade.unit_of_measure, "BBL")
        self.assertEqual(trade.price_unit_code, "BBL")
        self.assertEqual(event.payload["unit_of_measure"], "BBL")
        self.assertEqual(event.payload["price_unit_code"], "BBL")
        self.assertIsNone(trade.price)
        self.assertEqual(float(trade.volume), 1000.0)

    def test_trade_created_defaults_source_system_and_persists_quality_and_unit(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-HEADER-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "price": 80.5,
                        "volume": 250,
                        "quality_spec": "10 PPM sulfur max",
                        "unit_of_measure": "BBL",
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-HEADER-1").one()

        self.assertEqual(trade.source_system, "ETRM")
        self.assertEqual(trade.quality_spec, "10 PPM sulfur max")
        self.assertEqual(trade.unit_of_measure, "BBL")

    def test_option_trade_persists_option_fields_and_stays_out_of_positions(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "instrument_type": "OPTION",
                        "trade_nature": "FINANCIAL",
                        "trade_structure": "SINGLE",
                        "trade_side": "BUY",
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "price": 4.25,
                        "volume": 12,
                        "option_type": "CALL",
                        "option_style": "EUROPEAN",
                        "option_strike_price": 82.5,
                        "option_expiration_date": "2026-06-30",
                    },
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-OPTION-1").one()
            option_exposure = (
                session.query(OptionExposure)
                .filter(OptionExposure.trade_id == "T-OPTION-1")
                .one()
            )
            positions = session.query(Position).all()
            position_commodity = positions[0].commodity if positions else None
            position_net_volume = float(positions[0].net_volume) if positions else None

        self.assertEqual(trade.instrument_type, "OPTION")
        self.assertEqual(trade.trade_nature, "FINANCIAL")
        self.assertEqual(trade.trade_structure, "SINGLE")
        self.assertEqual(trade.option_type, "CALL")
        self.assertEqual(trade.option_style, "EUROPEAN")
        self.assertEqual(float(trade.option_strike_price), 82.5)
        self.assertEqual(str(trade.option_expiration_date), "2026-06-30")
        self.assertEqual(float(trade.price), 4.25)
        self.assertEqual(float(trade.volume), 12.0)
        self.assertEqual(float(option_exposure.contract_volume), 12.0)
        self.assertEqual(float(option_exposure.premium_cashflow), 51.0)
        self.assertEqual(float(option_exposure.underlying_equivalent_volume), 12.0)
        self.assertEqual(positions, [])

    def test_option_trade_rejects_missing_required_strike_price(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaises(HTTPException) as error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-OPTION-INVALID-1",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        actor_id="test-user",
                        payload={
                            "instrument_type": "OPTION",
                            "trade_nature": "FINANCIAL",
                            "trade_structure": "SINGLE",
                            "trade_side": "BUY",
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 4.25,
                            "volume": 12,
                            "option_type": "CALL",
                            "option_expiration_date": "2026-06-30",
                        },
                        schema_version=5,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("option_strike_price is required", error.exception.detail)

    def test_option_exercised_closes_trade_and_removes_option_exposure(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-EXERCISE-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "instrument_type": "OPTION",
                        "trade_nature": "FINANCIAL",
                        "trade_structure": "SINGLE",
                        "trade_side": "BUY",
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "price": 3.5,
                        "volume": 10,
                        "option_type": "CALL",
                        "option_style": "AMERICAN",
                        "option_strike_price": 81,
                        "option_expiration_date": "2026-06-30",
                    },
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-EXERCISE-1",
                    event_type="OptionExercised",
                    occurred_at=self.now + timedelta(days=10),
                    actor_id="test-user",
                    payload={},
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-OPTION-EXERCISE-1").one()
            option_exposure = (
                session.query(OptionExposure)
                .filter(OptionExposure.trade_id == "T-OPTION-EXERCISE-1")
                .one_or_none()
            )
            option_settlement_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-OPTION-EXERCISE-1",
                    TradeWorkflowItem.workflow_type == "OPTION_SETTLEMENT",
                )
                .one()
            )
            positions = session.query(Position).all()

        self.assertEqual(trade.status, "EXERCISED")
        self.assertIsNone(option_exposure)
        self.assertEqual(option_settlement_item.status, "PENDING")
        self.assertIn("resulting BUY WTI 10", option_settlement_item.notes or "")
        self.assertEqual(positions, [])

    def test_resulting_linear_trade_can_link_back_to_closed_option_trade(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-LINK-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "instrument_type": "OPTION",
                        "trade_nature": "FINANCIAL",
                        "trade_structure": "SINGLE",
                        "trade_side": "BUY",
                        "book": "CRUDE_PHYS",
                        "portfolio": "OIL_DISCRETIONARY",
                        "counterparty": "SHELL_TRADING",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "price": 3.5,
                        "volume": 10,
                        "unit_of_measure": "BBL",
                        "trade_currency_code": "USD",
                        "location_code": "CUSHING",
                        "price_unit_code": "BBL",
                        "option_type": "CALL",
                        "option_style": "AMERICAN",
                        "option_strike_price": 81,
                        "option_expiration_date": "2026-06-30",
                    },
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-LINK-1",
                    event_type="OptionExercised",
                    occurred_at=self.now + timedelta(days=10),
                    actor_id="test-user",
                    payload={},
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-LINKED-LINEAR-1",
                    event_type="TradeCreated",
                    occurred_at=self.now + timedelta(days=10),
                    actor_id="ops-user",
                    payload={
                        "originating_option_trade_id": "T-OPTION-LINK-1",
                        "source_system": "OPTION_SETTLEMENT",
                        "instrument_type": "LINEAR",
                        "trade_nature": "FINANCIAL",
                        "trade_structure": "SINGLE",
                        "trade_side": "BUY",
                        "book": "CRUDE_PHYS",
                        "portfolio": "OIL_DISCRETIONARY",
                        "counterparty": "SHELL_TRADING",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "pricing_status": "PRICED",
                        "price": 81,
                        "volume": 10,
                        "unit_of_measure": "BBL",
                        "trade_currency_code": "USD",
                        "location_code": "CUSHING",
                        "price_unit_code": "BBL",
                    },
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )

            child_trade = session.query(Trade).filter(Trade.trade_id == "T-LINKED-LINEAR-1").one()
            child_trade_originating_option_trade_id = child_trade.originating_option_trade_id
            child_trade_instrument_type = child_trade.instrument_type
            positions = session.query(Position).all()
            position_commodity = positions[0].commodity if positions else None
            position_net_volume = float(positions[0].net_volume) if positions else None

            with self.assertRaises(HTTPException) as error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-LINKED-LINEAR-2",
                        event_type="TradeCreated",
                        occurred_at=self.now + timedelta(days=10),
                        actor_id="ops-user",
                        payload={
                            "originating_option_trade_id": "T-OPTION-LINK-1",
                            "instrument_type": "LINEAR",
                            "trade_nature": "FINANCIAL",
                            "trade_structure": "SINGLE",
                            "trade_side": "BUY",
                            "book": "CRUDE_PHYS",
                            "portfolio": "OIL_DISCRETIONARY",
                            "counterparty": "SHELL_TRADING",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "price": 81,
                            "volume": 10,
                        },
                        schema_version=5,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(child_trade_originating_option_trade_id, "T-OPTION-LINK-1")
        self.assertEqual(child_trade_instrument_type, "LINEAR")
        self.assertEqual(len(positions), 1)
        self.assertEqual(position_commodity, "WTI")
        self.assertEqual(position_net_volume, 10.0)
        self.assertEqual(error.exception.status_code, 409)

    def test_option_assigned_rejects_long_option_trade(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-ASSIGN-INVALID-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "instrument_type": "OPTION",
                        "trade_nature": "FINANCIAL",
                        "trade_structure": "SINGLE",
                        "trade_side": "BUY",
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "price": 2.25,
                        "volume": 6,
                        "option_type": "PUT",
                        "option_style": "AMERICAN",
                        "option_strike_price": 74,
                        "option_expiration_date": "2026-06-30",
                    },
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )

            with self.assertRaises(HTTPException) as error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-OPTION-ASSIGN-INVALID-1",
                        event_type="OptionAssigned",
                        occurred_at=self.now + timedelta(days=2),
                        actor_id="test-user",
                        payload={},
                        schema_version=5,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("Only SELL option trades can be assigned", error.exception.detail)

    def test_european_option_exercise_requires_expiration_day(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-EURO-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "instrument_type": "OPTION",
                        "trade_nature": "FINANCIAL",
                        "trade_structure": "SINGLE",
                        "trade_side": "BUY",
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "price": 4.1,
                        "volume": 8,
                        "option_type": "CALL",
                        "option_style": "EUROPEAN",
                        "option_strike_price": 84,
                        "option_expiration_date": "2026-06-30",
                    },
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )

            with self.assertRaises(HTTPException) as error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-OPTION-EURO-1",
                        event_type="OptionExercised",
                        occurred_at=datetime(2026, 6, 29, 12, 0, tzinfo=timezone.utc),
                        actor_id="test-user",
                        payload={},
                        schema_version=5,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("can only be recorded on expiration date", error.exception.detail)

    def test_closed_option_cannot_be_amended_or_cancelled(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-CLOSED-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "instrument_type": "OPTION",
                        "trade_nature": "FINANCIAL",
                        "trade_structure": "SINGLE",
                        "trade_side": "BUY",
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "price": 3.9,
                        "volume": 9,
                        "option_type": "PUT",
                        "option_style": "AMERICAN",
                        "option_strike_price": 76,
                        "option_expiration_date": "2026-06-30",
                    },
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-CLOSED-1",
                    event_type="OptionExpired",
                    occurred_at=datetime(2026, 6, 30, 12, 0, tzinfo=timezone.utc),
                    actor_id="test-user",
                    payload={},
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )

            with self.assertRaises(HTTPException) as amend_error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-OPTION-CLOSED-1",
                        event_type="TradeAmended",
                        occurred_at=datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc),
                        actor_id="test-user",
                        payload={"price": 4.5},
                        schema_version=5,
                    ),
                    request=self._request(),
                    db=session,
                )

            with self.assertRaises(HTTPException) as cancel_error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-OPTION-CLOSED-1",
                        event_type="TradeCancelled",
                        occurred_at=datetime(2026, 7, 1, 13, 0, tzinfo=timezone.utc),
                        actor_id="test-user",
                        payload={"cancellation_reason": "late closeout"},
                        schema_version=5,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(amend_error.exception.status_code, 422)
        self.assertIn("cannot be amended", amend_error.exception.detail)
        self.assertEqual(cancel_error.exception.status_code, 422)
        self.assertIn("cannot be cancelled", cancel_error.exception.detail)

    def test_trade_commercial_terms_persist_to_projection_legs_and_price_terms(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-COMM-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "price": 79.25,
                        "volume": 125,
                        "unit_of_measure": "BBL",
                        "trade_currency_code": "USD",
                        "price_unit_code": "BBL",
                        "location_code": "CUSHING",
                        "trade_date": "2026-03-19",
                        "effective_start_date": "2026-04-01",
                        "effective_end_date": "2026-04-30",
                        "delivery_start": "2026-04-01",
                        "delivery_end": "2026-04-30",
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-COMM-1",
                    event_type="TradeAmended",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "trade_currency_code": "USD",
                        "price_unit_code": "BBL",
                        "location_code": "CUSHING",
                        "delivery_start": "2026-04-05",
                        "delivery_end": "2026-05-01",
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-COMM-1").one()
            leg = session.query(TradeLeg).filter(TradeLeg.trade_id == "T-COMM-1").one()
            term = session.query(TradePriceTerm).filter(TradePriceTerm.trade_id == "T-COMM-1").one()

        self.assertEqual(str(trade.trade_date), "2026-03-19")
        self.assertEqual(str(trade.effective_start_date), "2026-04-01")
        self.assertEqual(str(trade.effective_end_date), "2026-04-30")
        self.assertEqual(trade.trade_currency_code, "USD")
        self.assertEqual(trade.price_unit_code, "BBL")
        self.assertEqual(trade.location_code, "CUSHING")
        self.assertEqual(str(trade.delivery_start), "2026-04-05")
        self.assertEqual(str(trade.delivery_end), "2026-05-01")
        self.assertEqual(leg.location_code, "CUSHING")
        self.assertEqual(leg.quantity_unit_code, "BBL")
        self.assertEqual(str(leg.delivery_start), "2026-04-05")
        self.assertEqual(str(leg.delivery_end), "2026-05-01")
        self.assertEqual(term.currency_code, "USD")
        self.assertEqual(term.price_unit_code, "BBL")

    def test_trade_workflow_statuses_default_and_persist_on_amendment(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-WORKFLOW-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "trade_nature": "PHYSICAL",
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "price": 79.25,
                        "volume": 125,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-WORKFLOW-2",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "trade_nature": "FINANCIAL",
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "SELL",
                        "price": 80.0,
                        "volume": 100,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            physical_trade = session.query(Trade).filter(Trade.trade_id == "T-WORKFLOW-1").one()
            financial_trade = session.query(Trade).filter(Trade.trade_id == "T-WORKFLOW-2").one()
            physical_workflow_items = (
                session.query(TradeWorkflowItem)
                .filter(TradeWorkflowItem.trade_id == "T-WORKFLOW-1")
                .order_by(TradeWorkflowItem.workflow_type.asc())
                .all()
            )

            self.assertEqual(physical_trade.confirmation_status, "PENDING")
            self.assertEqual(physical_trade.nomination_status, "PENDING")
            self.assertEqual(physical_trade.allocation_status, "PENDING")
            self.assertEqual(physical_trade.actualization_status, "PENDING")
            self.assertEqual(physical_trade.invoice_status, "PENDING")
            self.assertEqual(physical_trade.payment_status, "PENDING")
            self.assertEqual(financial_trade.confirmation_status, "PENDING")
            self.assertEqual(financial_trade.nomination_status, "NOT_REQUIRED")
            self.assertEqual(financial_trade.allocation_status, "NOT_REQUIRED")
            self.assertEqual(financial_trade.actualization_status, "NOT_REQUIRED")
            self.assertEqual(financial_trade.invoice_status, "NOT_REQUIRED")
            self.assertEqual(financial_trade.payment_status, "PENDING")
            self.assertEqual(len(physical_workflow_items), 6)
            self.assertEqual(
                {item.workflow_type: item.status for item in physical_workflow_items},
                {
                    "ALLOCATION": "PENDING",
                    "ACTUALIZATION": "PENDING",
                    "CONFIRMATION": "PENDING",
                    "INVOICE": "PENDING",
                    "NOMINATION": "PENDING",
                    "PAYMENT": "PENDING",
                },
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-WORKFLOW-1",
                    event_type="TradeAmended",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "pricing_status": "PARTIALLY_PRICED",
                        "nomination_status": "NOMINATED",
                        "allocation_status": "ALLOCATED",
                        "invoice_status": "ISSUED",
                        "payment_status": "DUE",
                        "settlement_status": "INVOICED",
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            amended_trade = session.query(Trade).filter(Trade.trade_id == "T-WORKFLOW-1").one()
            amended_workflow_items = (
                session.query(TradeWorkflowItem)
                .filter(TradeWorkflowItem.trade_id == "T-WORKFLOW-1")
                .order_by(TradeWorkflowItem.workflow_type.asc())
                .all()
            )

        self.assertEqual(amended_trade.pricing_status, "PARTIALLY_PRICED")
        self.assertEqual(amended_trade.confirmation_status, "PENDING")
        self.assertEqual(amended_trade.nomination_status, "NOMINATED")
        self.assertEqual(amended_trade.allocation_status, "ALLOCATED")
        self.assertEqual(amended_trade.actualization_status, "PENDING")
        self.assertEqual(amended_trade.invoice_status, "ISSUED")
        self.assertEqual(amended_trade.payment_status, "DUE")
        self.assertEqual(amended_trade.settlement_status, "INVOICED")
        self.assertEqual(
            {item.workflow_type: item.status for item in amended_workflow_items},
            {
                "ALLOCATION": "ALLOCATED",
                "ACTUALIZATION": "PENDING",
                "CONFIRMATION": "PENDING",
                "INVOICE": "ISSUED",
                "NOMINATION": "NOMINATED",
                "PAYMENT": "DUE",
            },
        )

    def test_trade_capture_auto_generates_confirmation_draft(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-CONF-AUTO-DRAFT-1")

            confirmation = (
                session.query(TradeConfirmation)
                .filter(TradeConfirmation.trade_id == "T-CONF-AUTO-DRAFT-1")
                .one()
            )
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-AUTO-DRAFT-1").one()
            confirmation_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-AUTO-DRAFT-1",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )

        self.assertEqual(confirmation.status, "PENDING")
        self.assertEqual(confirmation.issue_count, 0)
        self.assertIsNone(confirmation.sent_at)
        self.assertEqual(confirmation.receipt_status, "NOT_ISSUED")
        self.assertEqual(confirmation.confirmation_number, "CONF-T-CONF-AUTO-DRAFT-1-01")
        self.assertIn("Auto-generated draft", confirmation.notes or "")
        self.assertEqual(trade.confirmation_status, "PENDING")
        self.assertEqual(confirmation_item.status, "PENDING")
        self.assertIn("Auto-generated draft", confirmation_item.notes or "")

    def test_trade_amendment_rejects_confirmation_projection_override_when_confirmation_record_exists(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-CONF-LOCK-1")

            with self.assertRaises(HTTPException) as error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CONF-LOCK-1",
                        event_type="TradeAmended",
                        occurred_at=self.now,
                        actor_id="test-user",
                        payload={"confirmation_status": "CONFIRMED"},
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("managed confirmation records", str(error.exception.detail).lower())

    def test_trade_amendment_rejects_invoice_projection_override_when_invoice_exists(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-INVOICE-LOCK-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "trade_nature": "PHYSICAL",
                        "trade_structure": "SINGLE",
                        "portfolio": "OIL_DISCRETIONARY",
                        "counterparty": "SHELL_TRADING",
                        "trade_currency_code": "USD",
                        "price_unit_code": "BBL",
                        "unit_of_measure": "BBL",
                        "location_code": "CUSHING",
                        "trade_date": "2026-03-21",
                        "delivery_start": "2026-03-22",
                        "delivery_end": "2026-03-24",
                        "price": 75.25,
                        "volume": 1000,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )
            issue_trade_invoice(
                session,
                trade_id="T-INVOICE-LOCK-1",
                actor_id="settlement.ops",
                invoice_number="INV-LOCK-1",
                invoice_amount=1000,
                now=self.now,
            )
            session.commit()

            with self.assertRaises(HTTPException) as error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-INVOICE-LOCK-1",
                        event_type="TradeAmended",
                        occurred_at=self.now,
                        actor_id="test-user",
                        payload={
                            "invoice_status": "DISPUTED",
                            "settlement_status": "DISPUTED",
                        },
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("settlement invoices", str(error.exception.detail))

    def test_trade_amendment_rejects_payment_projection_override_when_payment_exists(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-PAYMENT-LOCK-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "trade_nature": "PHYSICAL",
                        "trade_structure": "SINGLE",
                        "portfolio": "OIL_DISCRETIONARY",
                        "counterparty": "SHELL_TRADING",
                        "trade_currency_code": "USD",
                        "price_unit_code": "BBL",
                        "unit_of_measure": "BBL",
                        "location_code": "CUSHING",
                        "trade_date": "2026-03-21",
                        "delivery_start": "2026-03-22",
                        "delivery_end": "2026-03-24",
                        "price": 75.25,
                        "volume": 1000,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )
            invoice = issue_trade_invoice(
                session,
                trade_id="T-PAYMENT-LOCK-1",
                actor_id="settlement.ops",
                invoice_number="INV-PAY-1",
                invoice_amount=1000,
                now=self.now,
            )
            create_trade_payment(
                session,
                invoice_id=invoice.invoice_id,
                actor_id="settlement.ops",
                payment_amount=1000,
                status="PAID",
                now=self.now,
            )
            session.commit()

            with self.assertRaises(HTTPException) as error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-PAYMENT-LOCK-1",
                        event_type="TradeAmended",
                        occurred_at=self.now,
                        actor_id="test-user",
                        payload={
                            "payment_status": "OVERDUE",
                        },
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("settlement payments", str(error.exception.detail))

    def test_direct_trade_services_record_audit_events(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-DIRECT-AUDIT-1")
            create_trade_confirmation(
                session,
                trade_id="T-DIRECT-AUDIT-1",
                actor_id="ops.user",
                confirmation_number="CONF-DIRECT-1",
                now=self.now,
            )
            invoice = issue_trade_invoice(
                session,
                trade_id="T-DIRECT-AUDIT-1",
                actor_id="settlement.ops",
                invoice_number="INV-DIRECT-1",
                invoice_amount=1000,
                now=self.now,
            )
            create_trade_payment(
                session,
                invoice_id=invoice.invoice_id,
                actor_id="settlement.ops",
                payment_amount=1000,
                status="PAID",
                now=self.now,
            )
            confirmation_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-DIRECT-AUDIT-1",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )
            update_trade_workflow_item(
                session,
                item_id=confirmation_item.id,
                actor_id="ops.user",
                actor_role="OPERATIONS",
                changes={"owner": "ops.user", "notes": "Counterparty verbally matched."},
                now=self.now,
            )
            session.commit()

            confirmation_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-DIRECT-AUDIT-1",
                    Event.event_type == "TradeConfirmationCreated",
                )
                .order_by(Event.recorded_at.asc(), Event.event_id.asc())
                .all()
            )
            invoice_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-DIRECT-AUDIT-1",
                    Event.event_type == "TradeInvoiceIssued",
                )
                .one()
            )
            payment_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-DIRECT-AUDIT-1",
                    Event.event_type == "TradePaymentCreated",
                )
                .one()
            )
            workflow_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-DIRECT-AUDIT-1",
                    Event.event_type == "TradeWorkflowItemUpdated",
                )
                .one()
            )

        self.assertIn(
            "CONF-DIRECT-1",
            [
                event.payload["confirmation"]["confirmation_number"]
                for event in confirmation_event
            ],
        )
        self.assertEqual(invoice_event.payload["request"]["trade_id"], "T-DIRECT-AUDIT-1")
        self.assertEqual(payment_event.payload["payment"]["status"], "PAID")
        self.assertEqual(
            workflow_event.payload["workflow_item"]["workflow_type"],
            "CONFIRMATION",
        )

    def test_trade_amendment_supersedes_current_confirmation_when_booked_economics_change(self) -> None:
        amended_at = self.now + timedelta(hours=6)

        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-CONF-SUPERSEDE-1")
            create_trade_confirmation(
                session,
                trade_id="T-CONF-SUPERSEDE-1",
                actor_id="ops.user",
                confirmation_number="CONF-T-CONF-SUPERSEDE-1-02",
                status="CONFIRMED",
                now=self.now,
            )
            session.commit()

            with self._event_datetime_patch(amended_at):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CONF-SUPERSEDE-1",
                        event_type="TradeAmended",
                        occurred_at=amended_at,
                        actor_id="trader.user",
                        payload={"price": 76.5},
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            confirmations = (
                session.query(TradeConfirmation)
                .filter(TradeConfirmation.trade_id == "T-CONF-SUPERSEDE-1")
                .order_by(TradeConfirmation.id.asc())
                .all()
            )
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-SUPERSEDE-1").one()
            confirmation_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-SUPERSEDE-1",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )
            supersede_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-CONF-SUPERSEDE-1",
                    Event.event_type == "TradeConfirmationSuperseded",
                )
                .one()
            )

        self.assertEqual(len(confirmations), 3)
        self.assertEqual(confirmations[0].status, "PENDING")
        self.assertEqual(confirmations[1].status, "CONFIRMED")
        self.assertEqual(confirmations[2].status, "PENDING")
        self.assertIsNone(confirmations[2].sent_at)
        self.assertIn("Supersedes CONF-T-CONF-SUPERSEDE-1-02", confirmations[2].notes or "")
        self.assertIn("price", confirmations[2].notes or "")
        self.assertEqual(trade.confirmation_status, "PENDING")
        self.assertEqual(confirmation_item.status, "PENDING")
        self.assertEqual(
            supersede_event.payload["superseded_confirmation_number"],
            "CONF-T-CONF-SUPERSEDE-1-02",
        )
        self.assertEqual(supersede_event.payload["changed_fields"], ["price"])
        self.assertEqual(
            supersede_event.payload["confirmation"]["confirmation_number"],
            confirmations[2].confirmation_number,
        )

    def test_trade_amendment_does_not_supersede_confirmation_for_non_economic_changes(self) -> None:
        amended_at = self.now + timedelta(hours=3)

        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-CONF-SUPERSEDE-2")
            create_trade_confirmation(
                session,
                trade_id="T-CONF-SUPERSEDE-2",
                actor_id="ops.user",
                confirmation_number="CONF-T-CONF-SUPERSEDE-2-02",
                status="CONFIRMED",
                now=self.now,
            )
            session.commit()

            with self._event_datetime_patch(amended_at):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CONF-SUPERSEDE-2",
                        event_type="TradeAmended",
                        occurred_at=amended_at,
                        actor_id="trader.user",
                        payload={"trader_user": "desk.ops"},
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            confirmations = (
                session.query(TradeConfirmation)
                .filter(TradeConfirmation.trade_id == "T-CONF-SUPERSEDE-2")
                .order_by(TradeConfirmation.id.asc())
                .all()
            )
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-SUPERSEDE-2").one()
            supersede_events = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-CONF-SUPERSEDE-2",
                    Event.event_type == "TradeConfirmationSuperseded",
                )
                .all()
            )

        self.assertEqual(len(confirmations), 2)
        self.assertEqual(confirmations[0].status, "PENDING")
        self.assertEqual(confirmations[1].status, "CONFIRMED")
        self.assertEqual(trade.confirmation_status, "CONFIRMED")
        self.assertEqual(supersede_events, [])

    def test_trade_amendment_creates_initial_confirmation_draft_for_legacy_pending_trade_without_confirmation_rows(self) -> None:
        amended_at = self.now + timedelta(hours=4)

        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-CONF-LEGACY-1")
            (
                session.query(TradeConfirmation)
                .filter(TradeConfirmation.trade_id == "T-CONF-LEGACY-1")
                .delete()
            )
            (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-LEGACY-1",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .delete()
            )
            session.commit()

            with self._event_datetime_patch(amended_at):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CONF-LEGACY-1",
                        event_type="TradeAmended",
                        occurred_at=amended_at,
                        actor_id="trader.user",
                        payload={"price": 76.5},
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            confirmations = (
                session.query(TradeConfirmation)
                .filter(TradeConfirmation.trade_id == "T-CONF-LEGACY-1")
                .order_by(TradeConfirmation.id.asc())
                .all()
            )
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-LEGACY-1").one()
            confirmation_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-LEGACY-1",
                    TradeWorkflowItem.workflow_type == "CONFIRMATION",
                )
                .one()
            )
            supersede_events = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-CONF-LEGACY-1",
                    Event.event_type == "TradeConfirmationSuperseded",
                )
                .all()
            )

        self.assertEqual(len(confirmations), 1)
        self.assertEqual(confirmations[0].status, "PENDING")
        self.assertIsNone(confirmations[0].sent_at)
        self.assertIn(
            "Auto-generated draft after booked economics changed on trade amendment",
            confirmations[0].notes or "",
        )
        self.assertIn("price", confirmations[0].notes or "")
        self.assertEqual(trade.confirmation_status, "PENDING")
        self.assertEqual(confirmation_item.status, "PENDING")
        self.assertEqual(supersede_events, [])

    def test_trade_amendment_supersede_reopens_confirmation_even_when_credit_hold_reappears(self) -> None:
        amended_at = self.now + timedelta(hours=9)

        with self.SessionLocal() as session:
            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=5000,
                breach_action="REQUIRE_APPROVAL",
            )
            self._append_trade_created_event(
                session,
                trade_id="T-CONF-SUPERSEDE-CREDIT-1",
                price=10,
                volume=100,
            )
            create_trade_confirmation(
                session,
                trade_id="T-CONF-SUPERSEDE-CREDIT-1",
                actor_id="ops.user",
                confirmation_number="CONF-T-CONF-SUPERSEDE-CREDIT-1-02",
                status="CONFIRMED",
                now=self.now,
            )
            session.commit()

            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=500,
                breach_action="REQUIRE_APPROVAL",
            )

            with self._event_datetime_patch(amended_at):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CONF-SUPERSEDE-CREDIT-1",
                        event_type="TradeAmended",
                        occurred_at=amended_at,
                        actor_id="trader.user",
                        payload={"price": 12},
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            confirmations = (
                session.query(TradeConfirmation)
                .filter(TradeConfirmation.trade_id == "T-CONF-SUPERSEDE-CREDIT-1")
                .order_by(TradeConfirmation.id.asc())
                .all()
            )
            trade = session.query(Trade).filter(Trade.trade_id == "T-CONF-SUPERSEDE-CREDIT-1").one()
            credit_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CONF-SUPERSEDE-CREDIT-1",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .one()
            )

        self.assertEqual(len(confirmations), 3)
        self.assertEqual(confirmations[2].status, "PENDING")
        self.assertEqual(trade.confirmation_status, "PENDING")
        self.assertEqual(credit_item.status, "PENDING_REVIEW")

    def test_direct_delivery_services_record_audit_events(self) -> None:
        with self.SessionLocal() as session:
            self._append_trade_created_event(session, trade_id="T-DIRECT-DELIVERY-1")
            synchronize_delivery_obligations_from_trades(
                session,
                actor_id="ops.dispatch",
                now=self.now,
            )
            update_delivery_obligation(
                session,
                delivery_id="DLV-T-DIRECT-DELIVERY-1-L1",
                actor_id="ops.dispatch",
                changes={"transport_mode": "TRUCK", "operations_owner": "dispatch.alpha"},
                now=self.now,
            )
            append_delivery_event(
                session,
                delivery_id="DLV-T-DIRECT-DELIVERY-1-L1",
                actor_id="ops.dispatch",
                event_type="EXECUTION_STARTED",
                occurred_at=self.now,
                notes="Truck departed terminal.",
                now=self.now,
            )
            actualization = upsert_trade_actualization(
                session,
                trade_id="T-DIRECT-DELIVERY-1",
                leg_no=1,
                actual_quantity=1000,
                actualized_at=self.now,
                source="METER",
                notes="Delivered in full.",
                actor_id="ops.dispatch",
                now=self.now,
            )
            session.commit()

            delivery_update_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-DIRECT-DELIVERY-1",
                    Event.event_type == "TradeDeliveryUpdated",
                )
                .one()
            )
            delivery_event_logged = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-DIRECT-DELIVERY-1",
                    Event.event_type == "TradeDeliveryEventLogged",
                )
                .one()
            )
            actualization_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-DIRECT-DELIVERY-1",
                    Event.event_type == "TradeActualizationUpserted",
                )
                .one()
            )

        self.assertEqual(
            delivery_update_event.payload["requested_changes"]["transport_mode"],
            "TRUCK",
        )
        self.assertEqual(
            delivery_event_logged.payload["latest_event"]["event_type"],
            "EXECUTION_STARTED",
        )
        self.assertEqual(actualization.actualization_status, "ACTUALIZED")
        self.assertEqual(
            actualization_event.payload["actualization"]["actualization_status"],
            "ACTUALIZED",
        )

    def test_direct_option_settlement_booking_records_audit_event(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-BOOK-DIRECT-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "instrument_type": "OPTION",
                        "trade_nature": "FINANCIAL",
                        "trade_structure": "SINGLE",
                        "trade_side": "BUY",
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "price": 3.5,
                        "volume": 10,
                        "option_type": "CALL",
                        "option_style": "AMERICAN",
                        "option_strike_price": 81,
                        "option_expiration_date": "2026-06-30",
                    },
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-OPTION-BOOK-DIRECT-1",
                    event_type="OptionExercised",
                    occurred_at=self.now + timedelta(days=10),
                    actor_id="test-user",
                    payload={},
                    schema_version=5,
                ),
                request=self._request(),
                db=session,
            )
            option_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-OPTION-BOOK-DIRECT-1",
                    TradeWorkflowItem.workflow_type == "OPTION_SETTLEMENT",
                )
                .one()
            )

            booked_item = book_trade_workflow_item_underlying(
                session,
                item_id=option_item.id,
                actor_id="ops.user",
                actor_role="OPS_ADMIN",
                now=self.now + timedelta(days=10, minutes=5),
            )
            session.commit()

            linked_trade = (
                session.query(Trade)
                .filter(Trade.originating_option_trade_id == "T-OPTION-BOOK-DIRECT-1")
                .one()
            )
            audit_event = (
                session.query(Event)
                .filter(
                    Event.aggregate_type == "trade",
                    Event.aggregate_id == "T-OPTION-BOOK-DIRECT-1",
                    Event.event_type == "TradeWorkflowItemUnderlyingBooked",
                )
                .one()
            )

        self.assertEqual(booked_item.linked_trade_id, linked_trade.trade_id)
        self.assertEqual(audit_event.payload["linked_trade_id"], linked_trade.trade_id)
        self.assertEqual(booked_item.status, "BOOKED")

    def test_trade_create_blocks_when_counterparty_credit_limit_breach_action_is_block(self) -> None:
        with self.SessionLocal() as session:
            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=1000,
                breach_action="BLOCK",
            )

            with self.assertRaises(HTTPException) as error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-BLOCK-1",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "counterparty": "SHELL_TRADING",
                            "trade_currency_code": "USD",
                            "price": 10,
                            "volume": 150,
                        },
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            self.assertEqual(error.exception.status_code, 422)
            self.assertIn("Breach action is 'BLOCK'", error.exception.detail)
            self.assertEqual(
                session.query(Trade).filter(Trade.trade_id == "T-CREDIT-BLOCK-1").count(),
                0,
            )
            self.assertEqual(
                session.query(TradeWorkflowItem)
                .filter(TradeWorkflowItem.trade_id == "T-CREDIT-BLOCK-1")
                .count(),
                0,
            )

    def test_trade_create_routes_limit_breach_to_credit_approval_workflow_item(self) -> None:
        with self.SessionLocal() as session:
            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=1000,
                breach_action="REQUIRE_APPROVAL",
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-CREDIT-APPROVAL-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "counterparty": "SHELL_TRADING",
                        "trade_currency_code": "USD",
                        "price": 10,
                        "volume": 150,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            credit_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CREDIT-APPROVAL-1",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .one()
            )

        self.assertEqual(credit_item.status, "PENDING_REVIEW")
        self.assertIn("projected exposure USD 1,500.00", credit_item.notes or "")

    def test_trade_amendment_creates_and_closes_credit_approval_workflow_item(self) -> None:
        with self.SessionLocal() as session:
            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=1000,
                breach_action="REQUIRE_APPROVAL",
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-CREDIT-AMEND-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "counterparty": "SHELL_TRADING",
                        "trade_currency_code": "USD",
                        "price": 5,
                        "volume": 100,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            self.assertEqual(
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CREDIT-AMEND-1",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .count(),
                0,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-CREDIT-AMEND-1",
                    event_type="TradeAmended",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "price": 10,
                        "volume": 150,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            credit_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CREDIT-AMEND-1",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .one()
            )
            self.assertEqual(credit_item.status, "PENDING_REVIEW")

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-CREDIT-AMEND-1",
                    event_type="TradeAmended",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "price": 4,
                        "volume": 100,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            session.refresh(credit_item)

        self.assertEqual(credit_item.status, "NOT_REQUIRED")
        self.assertIn("Closed automatically", credit_item.notes or "")

    def test_trade_amendment_keeps_approved_credit_exception_within_envelope(self) -> None:
        with self.SessionLocal() as session:
            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=1000,
                breach_action="REQUIRE_APPROVAL",
            )

            with self._event_datetime_patch(self.now):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-EXCEPTION-1",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "counterparty": "SHELL_TRADING",
                            "trade_currency_code": "USD",
                            "price": 10,
                            "volume": 150,
                        },
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            self._seed_counterparty_external_credit_snapshot(session)
            self._approve_credit_workflow_item(session, trade_id="T-CREDIT-EXCEPTION-1")

            approved_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CREDIT-EXCEPTION-1",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .one()
            )
            approved_exception = (
                session.query(TradeCreditException)
                .filter(
                    TradeCreditException.trade_id == "T-CREDIT-EXCEPTION-1",
                    TradeCreditException.released_at.is_(None),
                )
                .one()
            )

            with self._event_datetime_patch(self.now + timedelta(days=1)):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-EXCEPTION-1",
                        event_type="TradeAmended",
                        occurred_at=self.now + timedelta(days=1),
                        actor_id="test-user",
                        payload={
                            "price": 9.5,
                            "volume": 150,
                        },
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            session.refresh(approved_item)
            session.refresh(approved_exception)

        self.assertEqual(approved_item.status, "APPROVED")
        self.assertIsNone(approved_exception.released_at)
        self.assertEqual(float(approved_exception.approved_projected_exposure_amount), 1500.0)

    def test_trade_amendment_reopens_credit_review_when_exception_envelope_is_exceeded(self) -> None:
        with self.SessionLocal() as session:
            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=1000,
                breach_action="REQUIRE_APPROVAL",
            )

            with self._event_datetime_patch(self.now):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-EXCEPTION-2",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "counterparty": "SHELL_TRADING",
                            "trade_currency_code": "USD",
                            "price": 10,
                            "volume": 150,
                        },
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            self._seed_counterparty_external_credit_snapshot(session)
            self._approve_credit_workflow_item(session, trade_id="T-CREDIT-EXCEPTION-2")

            credit_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CREDIT-EXCEPTION-2",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .one()
            )
            credit_exception = (
                session.query(TradeCreditException)
                .filter(TradeCreditException.trade_id == "T-CREDIT-EXCEPTION-2")
                .one()
            )

            with self._event_datetime_patch(self.now + timedelta(days=1)):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-EXCEPTION-2",
                        event_type="TradeAmended",
                        occurred_at=self.now + timedelta(days=1),
                        actor_id="test-user",
                        payload={
                            "price": 11,
                            "volume": 150,
                        },
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            session.refresh(credit_item)
            session.refresh(credit_exception)

            self.assertEqual(
                session.query(TradeCreditException)
                .filter(
                    TradeCreditException.trade_id == "T-CREDIT-EXCEPTION-2",
                    TradeCreditException.released_at.is_(None),
                )
                .count(),
                0,
            )

        self.assertEqual(credit_item.status, "PENDING_REVIEW")
        self.assertIn("approved credit exception envelope", credit_item.notes or "")
        self.assertEqual(credit_exception.status, "PENDING_REVIEW")
        self.assertIn("approved credit exception envelope", credit_exception.released_reason or "")

    def test_trade_amendment_reopens_credit_review_when_exception_has_expired(self) -> None:
        with self.SessionLocal() as session:
            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=1000,
                breach_action="REQUIRE_APPROVAL",
            )

            with self._event_datetime_patch(self.now):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-EXCEPTION-3",
                        event_type="TradeCreated",
                        occurred_at=self.now,
                        actor_id="test-user",
                        payload={
                            "book": "CRUDE_PHYS",
                            "commodity_class": "CRUDE_OIL",
                            "commodity": "WTI",
                            "pricing_type": "FIXED",
                            "trade_side": "BUY",
                            "counterparty": "SHELL_TRADING",
                            "trade_currency_code": "USD",
                            "price": 10,
                            "volume": 150,
                        },
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            self._seed_counterparty_external_credit_snapshot(session)
            self._approve_credit_workflow_item(session, trade_id="T-CREDIT-EXCEPTION-3")

            credit_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CREDIT-EXCEPTION-3",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .one()
            )
            credit_exception = (
                session.query(TradeCreditException)
                .filter(TradeCreditException.trade_id == "T-CREDIT-EXCEPTION-3")
                .one()
            )

            with self._event_datetime_patch(self.now + timedelta(days=8)):
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-EXCEPTION-3",
                        event_type="TradeAmended",
                        occurred_at=self.now + timedelta(days=8),
                        actor_id="test-user",
                        payload={
                            "price": 9.5,
                            "volume": 150,
                        },
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            session.refresh(credit_item)
            session.refresh(credit_exception)

        self.assertEqual(credit_item.status, "PENDING_REVIEW")
        self.assertIn("expired", (credit_item.notes or "").lower())
        self.assertEqual(credit_exception.status, "PENDING_REVIEW")
        self.assertIn("expired", (credit_exception.released_reason or "").lower())

    def test_trade_amendment_blocks_lifecycle_progress_while_credit_hold_is_active(self) -> None:
        with self.SessionLocal() as session:
            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=1000,
                breach_action="REQUIRE_APPROVAL",
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-CREDIT-HOLD-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "counterparty": "SHELL_TRADING",
                        "trade_currency_code": "USD",
                        "price": 10,
                        "volume": 150,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            with self.assertRaises(HTTPException) as error:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-CREDIT-HOLD-1",
                        event_type="TradeAmended",
                        occurred_at=self.now,
                        actor_id="test-user",
                        payload={"confirmation_status": "CONFIRMED"},
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("credit hold", error.exception.detail.lower())
        self.assertIn("confirmation", error.exception.detail.lower())

    def test_rejected_credit_hold_clears_after_trade_returns_within_limit(self) -> None:
        with self.SessionLocal() as session:
            self._upsert_counterparty_credit_profile(
                session,
                limit_amount=1000,
                breach_action="REQUIRE_APPROVAL",
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-CREDIT-REJECT-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FIXED",
                        "trade_side": "BUY",
                        "counterparty": "SHELL_TRADING",
                        "trade_currency_code": "USD",
                        "price": 10,
                        "volume": 150,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            credit_item = (
                session.query(TradeWorkflowItem)
                .filter(
                    TradeWorkflowItem.trade_id == "T-CREDIT-REJECT-1",
                    TradeWorkflowItem.workflow_type == "CREDIT_APPROVAL",
                )
                .one()
            )
            credit_item.status = "REJECTED"
            credit_item.notes = "Rejected by credit."
            credit_item.updated_at = self.now
            credit_item.updated_by = "credit.ops"
            credit_item.version += 1
            session.commit()

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-CREDIT-REJECT-1",
                    event_type="TradeAmended",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "price": 4,
                        "volume": 100,
                    },
                    schema_version=4,
                ),
                request=self._request(),
                db=session,
            )

            session.refresh(credit_item)

        self.assertEqual(credit_item.status, "NOT_REQUIRED")
        self.assertIn("Closed automatically", credit_item.notes or "")

    def test_swap_trade_can_omit_top_level_volume_when_legs_are_present(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SWAP-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FORMULA",
                        "trade_structure": "SWAP",
                        "legs": [
                            {
                                "leg_no": 1,
                                "side": "BUY",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "WTI",
                                "volume": 120,
                            },
                            {
                                "leg_no": 2,
                                "side": "SELL",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "BRENT",
                                "volume": 120,
                            },
                        ],
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-SWAP-1").one()
            legs = session.query(TradeLeg).filter(TradeLeg.trade_id == "T-SWAP-1").order_by(TradeLeg.leg_no.asc()).all()

        self.assertEqual(trade.trade_structure, "SWAP")
        self.assertIsNone(trade.trade_side)
        self.assertIsNone(trade.volume)
        self.assertEqual(len(legs), 2)
        self.assertEqual(float(legs[0].quantity), 120.0)
        self.assertEqual(float(legs[1].quantity), 120.0)

    def test_partial_swap_amend_preserves_existing_legs(self) -> None:
        with self.SessionLocal() as session:
            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SWAP-AMEND-1",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "book": "CRUDE_PHYS",
                        "commodity_class": "CRUDE_OIL",
                        "commodity": "WTI",
                        "pricing_type": "FORMULA",
                        "trade_structure": "SWAP",
                        "legs": [
                            {
                                "leg_no": 1,
                                "side": "BUY",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "WTI",
                                "volume": 90,
                            },
                            {
                                "leg_no": 2,
                                "side": "SELL",
                                "commodity_class": "CRUDE_OIL",
                                "commodity": "BRENT",
                                "volume": 75,
                            },
                        ],
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            append_event(
                EventCreate(
                    aggregate_type="trade",
                    aggregate_id="T-SWAP-AMEND-1",
                    event_type="TradeAmended",
                    occurred_at=self.now,
                    actor_id="test-user",
                    payload={
                        "volume": 250,
                        "pricing_status": "PRICED",
                    },
                    schema_version=3,
                ),
                request=self._request(),
                db=session,
            )

            trade = session.query(Trade).filter(Trade.trade_id == "T-SWAP-AMEND-1").one()
            legs = session.query(TradeLeg).filter(TradeLeg.trade_id == "T-SWAP-AMEND-1").order_by(TradeLeg.leg_no.asc()).all()
            positions = session.query(Position).order_by(Position.commodity.asc()).all()

        self.assertEqual(trade.pricing_status, "PRICED")
        self.assertEqual(float(trade.volume), 250.0)
        self.assertEqual(len(legs), 2)
        self.assertEqual(float(legs[0].quantity), 90.0)
        self.assertEqual(float(legs[1].quantity), 75.0)
        self.assertEqual([(row.commodity, float(row.net_volume)) for row in positions], [("BRENT", -75.0), ("WTI", 90.0)])


if __name__ == "__main__":
    unittest.main()
