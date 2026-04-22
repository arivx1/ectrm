from __future__ import annotations

from datetime import datetime, timezone
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.trading.services.event_writes import (
    AppendDomainEventCommand,
    append_domain_event,
)
from apps.api.app.models import Base
from apps.api.app.models.event import Event


class EventWritesServiceTests(unittest.TestCase):
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
            session.query(Event).delete()
            session.commit()

    def test_append_domain_event_supports_non_route_usage_without_commit(self) -> None:
        occurred_at = datetime(2026, 4, 14, 12, 0, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            event = append_domain_event(
                session,
                AppendDomainEventCommand(
                    aggregate_type="note",
                    aggregate_id="N-100",
                    event_type="NoteCaptured",
                    occurred_at=occurred_at,
                    actor_id="tester",
                    correlation_id="corr-note-1",
                    payload={"message": "hello"},
                ),
            )

            self.assertEqual(event.aggregate_type, "note")
            self.assertEqual(event.aggregate_id, "N-100")
            self.assertEqual(event.event_type, "NoteCaptured")
            self.assertEqual(event.actor_id, "tester")
            self.assertEqual(event.correlation_id, "corr-note-1")
            self.assertEqual(event.payload, {"message": "hello"})
            self.assertEqual(event.occurred_at, occurred_at)
            self.assertEqual(session.query(Event).count(), 1)

    def test_append_domain_event_applies_trade_projection_for_tracked_trade_events(self) -> None:
        occurred_at = datetime(2026, 4, 14, 12, 5, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            with patch(
                "apps.api.app.domains.trading.services.trade_event_application.apply_trade_event"
            ) as apply_trade_event_mock:
                event = append_domain_event(
                    session,
                    AppendDomainEventCommand(
                        aggregate_type="trade",
                        aggregate_id="T-100",
                        event_type="TradeCancelled",
                        occurred_at=occurred_at,
                        actor_id="ops_admin",
                        payload={"status": "CANCELLED"},
                    ),
                )

        apply_trade_event_mock.assert_called_once()
        context = apply_trade_event_mock.call_args.args[0]
        self.assertIs(context.event, event)
        self.assertEqual(context.db.bind, self.engine)
        self.assertEqual(context.recorded_at, event.recorded_at)

    def test_append_domain_event_rolls_back_when_transactional_write_fails(self) -> None:
        occurred_at = datetime(2026, 4, 14, 12, 10, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            with patch(
                "apps.api.app.domains.trading.services.trade_event_application.apply_trade_event",
                side_effect=RuntimeError("boom"),
            ):
                with self.assertRaisesRegex(RuntimeError, "boom"):
                    append_domain_event(
                        session,
                        AppendDomainEventCommand(
                            aggregate_type="trade",
                            aggregate_id="T-ROLLBACK",
                            event_type="TradeCancelled",
                            occurred_at=occurred_at,
                            actor_id="ops_admin",
                            payload={"status": "CANCELLED"},
                        ),
                        commit=True,
                    )

        with self.SessionLocal() as verification_session:
            self.assertEqual(
                verification_session.query(Event)
                .filter(Event.aggregate_id == "T-ROLLBACK")
                .count(),
                0,
            )


if __name__ == "__main__":
    unittest.main()
