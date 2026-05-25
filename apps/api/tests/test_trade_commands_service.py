from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.core.request_context import reset_request_identity, set_request_identity
from apps.api.app.domains.trading.services.trade_commands import (
    TradeCommandValidationError,
    TradeWriteCommand,
    append_trade_write_command,
    build_trade_write_command_from_event,
)
from apps.api.app.models import Base
from apps.api.app.models.event import Event
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.routes.events import append_event
from apps.api.app.schemas.event import EventCreate


class TradeCommandsServiceTests(unittest.TestCase):
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
            session.query(MutationProvenanceRecord).delete()
            session.query(Event).delete()
            session.commit()

    def _request(self):
        return SimpleNamespace(
            state=SimpleNamespace(correlation_id="test-correlation", actor_id=None),
            headers={},
        )

    def _seed_trade(self, session, *, trade_id: str, last_event_id: str) -> None:
        now = datetime(2026, 4, 27, 14, 55, tzinfo=timezone.utc)
        if session.get(ReferenceUnit, "MMBTU") is None:
            session.add(
                ReferenceUnit(
                    code="MMBTU",
                    name="Million British Thermal Units",
                    commodity_class="NATURAL_GAS",
                    dimension="ENERGY",
                    base_unit_code=None,
                    conversion_factor=None,
                    precision=3,
                    description="Test gas energy unit",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
        session.add(
            Trade(
                trade_id=trade_id,
                created_at=now,
                updated_at=now,
                book="GAS_PHYS",
                commodity_class="NATURAL_GAS",
                commodity="HENRY_HUB",
                pricing_type="FIXED",
                price=3.0,
                volume=10.0,
                status="ACTIVE",
                last_event_id=last_event_id,
            )
        )
        session.commit()

    def test_build_trade_write_command_maps_trade_created_to_book_trade(self) -> None:
        payload = EventCreate(
            aggregate_type="trade",
            aggregate_id="T-BOOK-1",
            event_type="TradeCreated",
            occurred_at=datetime(2026, 4, 27, 15, 0, tzinfo=timezone.utc),
            actor_id="ops-trader",
            payload={"book": "GAS_PHYS"},
            schema_version=4,
            source_surface="web.trades.create",
        )

        command = build_trade_write_command_from_event(
            payload,
            actor_id="ops-trader",
            correlation_id="corr-trade-1",
        )

        assert command is not None
        self.assertEqual(command.command_type, "BookTrade")
        self.assertEqual(command.trade_id, "T-BOOK-1")
        self.assertEqual(command.actor_id, "ops-trader")
        self.assertEqual(command.correlation_id, "corr-trade-1")
        self.assertEqual(command.source_surface, "web.trades.create")

    def test_build_trade_write_command_rejects_mismatched_command_type(self) -> None:
        payload = EventCreate(
            aggregate_type="trade",
            aggregate_id="T-BOOK-1",
            event_type="TradeCreated",
            occurred_at=datetime(2026, 4, 27, 15, 5, tzinfo=timezone.utc),
            actor_id="ops-trader",
            command_type="CancelTrade",
            payload={"book": "GAS_PHYS"},
            schema_version=4,
        )

        with self.assertRaisesRegex(
            TradeCommandValidationError,
            "Trade event TradeCreated does not match command_type CancelTrade.",
        ):
            build_trade_write_command_from_event(
                payload,
                actor_id="ops-trader",
                correlation_id="corr-trade-2",
            )

    def test_append_trade_write_command_records_command_provenance(self) -> None:
        occurred_at = datetime(2026, 4, 27, 15, 10, tzinfo=timezone.utc)
        identity = set_request_identity(
            actor_id="ops-trader",
            role="TRADER",
            session_id="session-trade-command",
            correlation_id="corr-trade-3",
            request_method="POST",
            request_path="/events",
        )

        try:
            with self.SessionLocal() as session:
                self._seed_trade(session, trade_id="T-AMEND-1", last_event_id="evt-last-1")
                with patch(
                    "apps.api.app.domains.trading.services.trade_event_application.apply_trade_event"
                ) as apply_trade_event_mock:
                    event = append_trade_write_command(
                        session,
                        TradeWriteCommand(
                            command_id="cmd-amend-1",
                            command_type="AmendTradeTerms",
                            trade_id="T-AMEND-1",
                            payload={"price": 3.25},
                            occurred_at=occurred_at,
                            recorded_at=occurred_at,
                            actor_id="ops-trader",
                            correlation_id="corr-trade-3",
                            source_surface="web.trades.amend",
                            expected_last_event_id="evt-last-1",
                        ),
                        commit=True,
                        refresh=True,
                    )

                apply_trade_event_mock.assert_called_once()
                provenance = (
                    session.query(MutationProvenanceRecord)
                    .order_by(MutationProvenanceRecord.id.desc())
                    .one()
                )
        finally:
            reset_request_identity(identity)

        self.assertEqual(event.event_type, "TradeAmended")
        self.assertEqual(provenance.operation_key, "trade_command.AmendTradeTerms")
        self.assertEqual(provenance.source_surface, "web.trades.amend")
        self.assertEqual(provenance.correlation_id, "corr-trade-3")
        self.assertEqual(provenance.details["command_id"], "cmd-amend-1")
        self.assertEqual(provenance.details["command_type"], "AmendTradeTerms")
        self.assertEqual(provenance.details["expected_last_event_id"], "evt-last-1")
        self.assertEqual(provenance.details["event_type"], "TradeAmended")

    def test_append_trade_write_command_rejects_stale_expected_last_event_id(self) -> None:
        occurred_at = datetime(2026, 4, 27, 15, 12, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            self._seed_trade(session, trade_id="T-STALE-1", last_event_id="evt-current-1")

            with self.assertRaises(HTTPException) as context:
                append_trade_write_command(
                    session,
                    TradeWriteCommand(
                        command_id="cmd-amend-stale-1",
                        command_type="AmendTradeTerms",
                        trade_id="T-STALE-1",
                        payload={"price": 4.25},
                        occurred_at=occurred_at,
                        recorded_at=occurred_at,
                        actor_id="ops-trader",
                        correlation_id="corr-trade-4",
                        source_surface="web.trades.amend",
                        expected_last_event_id="evt-old-1",
                    ),
                    commit=True,
                )

            self.assertEqual(context.exception.status_code, 409)
            self.assertEqual(
                context.exception.detail,
                "Trade T-STALE-1 stale-state check failed: expected last_event_id evt-old-1 but current last_event_id is evt-current-1.",
            )
            self.assertEqual(
                session.query(Event).filter(Event.aggregate_id == "T-STALE-1").count(),
                0,
            )

    def test_append_trade_write_command_rejects_viewer_role_before_event_append(self) -> None:
        identity = set_request_identity(
            actor_id="viewer-user",
            role="VIEWER",
            session_id="session-viewer-trade-command",
            correlation_id="corr-trade-viewer-1",
            request_method="POST",
            request_path="/events",
        )

        try:
            with self.SessionLocal() as session:
                with patch(
                    "apps.api.app.domains.trading.services.trade_commands.append_domain_event"
                ) as append_domain_event_mock:
                    with self.assertRaises(HTTPException) as context:
                        append_trade_write_command(
                            session,
                            TradeWriteCommand(
                                command_id="cmd-create-viewer-1",
                                command_type="BookTrade",
                                trade_id="T-VIEWER-1",
                                payload={},
                                occurred_at=datetime(2026, 4, 27, 15, 13, tzinfo=timezone.utc),
                                actor_id="viewer-user",
                            ),
                        )

                append_domain_event_mock.assert_not_called()
        finally:
            reset_request_identity(identity)

        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(
            context.exception.detail,
            "Only TRADER, DESK_LEAD, OPS_ADMIN, or ADMIN sessions can manage governed trade writes.",
        )

    def test_append_trade_write_command_rejects_invalid_reference_before_event_append(self) -> None:
        identity = set_request_identity(
            actor_id="ops-trader",
            role="TRADER",
            session_id="session-ref-precheck",
            correlation_id="corr-trade-ref-1",
            request_method="POST",
            request_path="/events",
        )

        try:
            with self.SessionLocal() as session:
                with patch(
                    "apps.api.app.domains.trading.services.trade_commands.append_domain_event"
                ) as append_domain_event_mock:
                    with self.assertRaises(HTTPException) as context:
                        append_trade_write_command(
                            session,
                            TradeWriteCommand(
                                command_id="cmd-create-ref-1",
                                command_type="BookTrade",
                                trade_id="T-REF-1",
                                payload={
                                    "book": "INVALID_BOOK",
                                    "commodity_class": "NATURAL_GAS",
                                    "commodity": "HENRY_HUB",
                                    "pricing_type": "FIXED",
                                    "trade_side": "BUY",
                                    "price": 3.25,
                                    "volume": 10,
                                },
                                occurred_at=datetime(2026, 4, 27, 15, 14, tzinfo=timezone.utc),
                                actor_id="ops-trader",
                            ),
                        )

                append_domain_event_mock.assert_not_called()
        finally:
            reset_request_identity(identity)

        self.assertEqual(context.exception.status_code, 422)
        self.assertEqual(
            context.exception.detail,
            "Book 'INVALID_BOOK' is not active in reference data",
        )

    def test_append_trade_write_command_rejects_cancel_of_closed_trade_before_event_append(self) -> None:
        identity = set_request_identity(
            actor_id="ops-trader",
            role="TRADER",
            session_id="session-cancel-precheck",
            correlation_id="corr-trade-cancel-1",
            request_method="POST",
            request_path="/events",
        )

        try:
            with self.SessionLocal() as session:
                self._seed_trade(session, trade_id="T-CLOSED-1", last_event_id="evt-closed-1")
                trade = session.get(Trade, "T-CLOSED-1")
                assert trade is not None
                trade.status = "CANCELLED"
                session.commit()

                with patch(
                    "apps.api.app.domains.trading.services.trade_commands.append_domain_event"
                ) as append_domain_event_mock:
                    with self.assertRaises(HTTPException) as context:
                        append_trade_write_command(
                            session,
                            TradeWriteCommand(
                                command_id="cmd-cancel-closed-1",
                                command_type="CancelTrade",
                                trade_id="T-CLOSED-1",
                                payload={"status": "CANCELLED"},
                                occurred_at=datetime(2026, 4, 27, 15, 16, tzinfo=timezone.utc),
                                actor_id="ops-trader",
                                expected_last_event_id="evt-closed-1",
                            ),
                        )

                append_domain_event_mock.assert_not_called()
        finally:
            reset_request_identity(identity)

        self.assertEqual(context.exception.status_code, 422)
        self.assertEqual(
            context.exception.detail,
            "Trade T-CLOSED-1 is already closed as CANCELLED and cannot be cancelled",
        )

    def test_append_event_returns_http_422_for_mismatched_trade_command_type(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaises(HTTPException) as context:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-BOOK-2",
                        event_type="TradeCreated",
                        occurred_at=datetime(2026, 4, 27, 15, 15, tzinfo=timezone.utc),
                        actor_id="ops-trader",
                        command_type="CancelTrade",
                        payload={"book": "GAS_PHYS"},
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

        self.assertEqual(context.exception.status_code, 422)
        self.assertEqual(
            context.exception.detail,
            "Trade event TradeCreated does not match command_type CancelTrade.",
        )

    def test_append_event_returns_http_409_for_stale_trade_command(self) -> None:
        with self.SessionLocal() as session:
            self._seed_trade(session, trade_id="T-STALE-2", last_event_id="evt-current-2")

            with self.assertRaises(HTTPException) as context:
                append_event(
                    EventCreate(
                        aggregate_type="trade",
                        aggregate_id="T-STALE-2",
                        event_type="TradeCancelled",
                        occurred_at=datetime(2026, 4, 27, 15, 15, tzinfo=timezone.utc),
                        actor_id="ops-trader",
                        command_type="CancelTrade",
                        expected_last_event_id="evt-old-2",
                        payload={"status": "CANCELLED", "cancellation_reason": "stale test"},
                        schema_version=4,
                    ),
                    request=self._request(),
                    db=session,
                )

            self.assertEqual(
                session.query(Event).filter(Event.aggregate_id == "T-STALE-2").count(),
                0,
            )

        self.assertEqual(context.exception.status_code, 409)
        self.assertEqual(
            context.exception.detail,
            "Trade T-STALE-2 stale-state check failed: expected last_event_id evt-old-2 but current last_event_id is evt-current-2.",
        )


if __name__ == "__main__":
    unittest.main()
