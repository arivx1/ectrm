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


if __name__ == "__main__":
    unittest.main()
