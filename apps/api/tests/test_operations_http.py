from __future__ import annotations

import enum
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models import Base, Event, ExternalDataRun, Trade, UserAccount, UserSession
from apps.api.app.core.auth import hash_password, hash_session_token
from apps.api.app.routes.auth import heartbeat_current_session
from apps.api.app.routes.operations import get_system_overview


def coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class OperationsHttpTests(unittest.TestCase):
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
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.query(ExternalDataRun).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.commit()

    def test_system_overview_reports_live_sessions_and_recent_activity(self) -> None:
        now = datetime.now(timezone.utc)
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(started_at=now - timedelta(hours=2, minutes=5, seconds=12))))

        with self.SessionLocal() as session:
            session.add_all(
                [
                    UserAccount(
                        user_id="ops_admin",
                        email="ops@example.com",
                        display_name="Ops Admin",
                        role="OPS_ADMIN",
                        password_hash=hash_password("supersecret1"),
                        is_active=True,
                        last_login_at=now,
                        created_at=now,
                        created_by="system",
                        updated_at=now,
                        updated_by="system",
                        version=1,
                    ),
                    UserAccount(
                        user_id="scheduler",
                        email="scheduler@example.com",
                        display_name="Desk Scheduler",
                        role="TRADER",
                        password_hash=hash_password("supersecret2"),
                        is_active=True,
                        last_login_at=now,
                        created_at=now,
                        created_by="system",
                        updated_at=now,
                        updated_by="system",
                        version=1,
                    ),
                    UserAccount(
                        user_id="disabled_user",
                        email="disabled@example.com",
                        display_name="Disabled User",
                        role="VIEWER",
                        password_hash=hash_password("supersecret3"),
                        is_active=False,
                        last_login_at=now,
                        created_at=now,
                        created_by="system",
                        updated_at=now,
                        updated_by="system",
                        version=1,
                    ),
                ]
            )
            session.add_all(
                [
                    UserSession(
                        session_id="session-1",
                        user_id="ops_admin",
                        token_hash="token-1",
                        role="OPS_ADMIN",
                        created_at=now - timedelta(minutes=25),
                        expires_at=now + timedelta(hours=8),
                        last_seen_at=now - timedelta(seconds=45),
                        revoked_at=None,
                    ),
                    UserSession(
                        session_id="session-2",
                        user_id="ops_admin",
                        token_hash="token-2",
                        role="OPS_ADMIN",
                        created_at=now - timedelta(minutes=5),
                        expires_at=now + timedelta(hours=8),
                        last_seen_at=now - timedelta(seconds=75),
                        revoked_at=None,
                    ),
                    UserSession(
                        session_id="session-3",
                        user_id="scheduler",
                        token_hash="token-3",
                        role="TRADER",
                        created_at=now - timedelta(minutes=15),
                        expires_at=now + timedelta(hours=8),
                        last_seen_at=now - timedelta(seconds=90),
                        revoked_at=None,
                    ),
                    UserSession(
                        session_id="session-4",
                        user_id="disabled_user",
                        token_hash="token-4",
                        role="VIEWER",
                        created_at=now - timedelta(minutes=15),
                        expires_at=now + timedelta(hours=8),
                        last_seen_at=now - timedelta(seconds=60),
                        revoked_at=None,
                    ),
                    UserSession(
                        session_id="session-5",
                        user_id="scheduler",
                        token_hash="token-5",
                        role="TRADER",
                        created_at=now - timedelta(hours=3),
                        expires_at=now - timedelta(minutes=1),
                        last_seen_at=now - timedelta(seconds=30),
                        revoked_at=None,
                    ),
                    UserSession(
                        session_id="session-6",
                        user_id="scheduler",
                        token_hash="token-6",
                        role="TRADER",
                        created_at=now - timedelta(minutes=10),
                        expires_at=now + timedelta(hours=8),
                        last_seen_at=now - timedelta(seconds=30),
                        revoked_at=now - timedelta(minutes=1),
                    ),
                    UserSession(
                        session_id="session-7",
                        user_id="scheduler",
                        token_hash="token-7",
                        role="TRADER",
                        created_at=now - timedelta(minutes=30),
                        expires_at=now + timedelta(hours=8),
                        last_seen_at=now - timedelta(minutes=10),
                        revoked_at=None,
                    ),
                ]
            )
            session.add_all(
                [
                    Trade(
                        trade_id="T-LIVE-1",
                        external_trade_id=None,
                        source_system=None,
                        execution_timestamp=None,
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="CRUDE_PHYS",
                        portfolio=None,
                        counterparty=None,
                        commodity_class="CRUDE_OIL",
                        commodity="WTI",
                        pricing_type="FIXED",
                        pricing_status="PENDING",
                        price_index_code=None,
                        price=81.25,
                        volume=1000,
                        settlement_status="PENDING",
                        trader_user="ops_admin",
                        status="ACTIVE",
                        last_event_id="evt-live-1",
                        created_at=now - timedelta(minutes=20),
                        updated_at=now - timedelta(minutes=5),
                    ),
                    Trade(
                        trade_id="T-CANCELLED-1",
                        external_trade_id=None,
                        source_system=None,
                        execution_timestamp=None,
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="SELL",
                        book="CRUDE_PHYS",
                        portfolio=None,
                        counterparty=None,
                        commodity_class="CRUDE_OIL",
                        commodity="BRENT",
                        pricing_type="FIXED",
                        pricing_status="PENDING",
                        price_index_code=None,
                        price=79.0,
                        volume=800,
                        settlement_status="PENDING",
                        trader_user="scheduler",
                        status="CANCELLED",
                        last_event_id="evt-old-1",
                        created_at=now - timedelta(hours=2),
                        updated_at=now - timedelta(hours=1),
                    ),
                ]
            )
            session.add_all(
                [
                    ExternalDataRun(
                        provider="EIA",
                        job_name="sync_eia_price_data",
                        status="SUCCEEDED",
                        started_at=now - timedelta(hours=3),
                        finished_at=now - timedelta(hours=3) + timedelta(minutes=8),
                        requested_by="ops_admin",
                        series_count=12,
                        observation_count=480,
                        error_summary=None,
                        created_at=now - timedelta(hours=3),
                    ),
                    ExternalDataRun(
                        provider="NWS",
                        job_name="sync_nws_weather_data",
                        status="FAILED",
                        started_at=now - timedelta(minutes=20),
                        finished_at=now - timedelta(minutes=19),
                        requested_by="ops_admin",
                        series_count=6,
                        observation_count=0,
                        error_summary="Gateway timeout from upstream weather service",
                        created_at=now - timedelta(minutes=20),
                    ),
                    Event(
                        event_id="evt-live-1",
                        aggregate_type="trade",
                        aggregate_id="T-LIVE-1",
                        event_type="TradeCreated",
                        occurred_at=now - timedelta(minutes=12),
                        recorded_at=now - timedelta(minutes=12),
                        actor_id="ops_admin",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={"status": "ACTIVE"},
                    ),
                    Event(
                        event_id="evt-old-1",
                        aggregate_type="trade",
                        aggregate_id="T-CANCELLED-1",
                        event_type="TradeCancelled",
                        occurred_at=now - timedelta(hours=3),
                        recorded_at=now - timedelta(hours=3),
                        actor_id="scheduler",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={"status": "CANCELLED"},
                    ),
                ]
            )
            session.commit()

            payload = get_system_overview(request=request, db=session)

        self.assertEqual(payload.server_status, "ok")
        self.assertEqual(payload.database_status, "ok")
        self.assertEqual(payload.database.dialect, "sqlite")
        self.assertEqual(payload.database.name, "in-memory")
        self.assertEqual(payload.database.table_count, len(Base.metadata.sorted_tables))
        self.assertEqual(payload.database.record_count, 16)
        self.assertIsNotNone(payload.database.size_bytes)
        self.assertGreater(payload.database.size_bytes, 0)
        self.assertEqual(payload.presence_window_seconds, 120)
        self.assertEqual(payload.active_session_count, 3)
        self.assertEqual(payload.active_user_count, 2)
        self.assertEqual(payload.registered_user_count, 3)
        self.assertEqual(payload.active_account_count, 2)
        self.assertEqual(payload.open_trade_count, 1)
        self.assertEqual(payload.events_last_hour, 1)
        self.assertEqual(payload.last_event_recorded_at, now - timedelta(minutes=12))
        self.assertEqual(payload.dependency_count, 2)
        self.assertEqual(payload.healthy_dependency_count, 1)
        self.assertGreaterEqual(payload.uptime_seconds, 2 * 3600)
        self.assertLess(payload.uptime_seconds, 3 * 3600)

        dependencies = {dependency.key: dependency for dependency in payload.dependencies}
        self.assertEqual(dependencies["eia"].health_status, "healthy")
        self.assertEqual(dependencies["eia"].run_status, "SUCCEEDED")
        self.assertEqual(
            dependencies["eia"].last_success_at,
            now - timedelta(hours=3) + timedelta(minutes=8),
        )
        self.assertEqual(dependencies["nws"].health_status, "failed")
        self.assertEqual(dependencies["nws"].run_status, "FAILED")
        self.assertIn("timeout", dependencies["nws"].error_summary.lower())

    def test_heartbeat_updates_last_seen_for_authenticated_session(self) -> None:
        now = datetime.now(timezone.utc)
        access_token = "presence-token"

        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="ops_admin",
                    email="ops@example.com",
                    display_name="Ops Admin",
                    role="OPS_ADMIN",
                    password_hash=hash_password("supersecret1"),
                    is_active=True,
                    last_login_at=now,
                    created_at=now,
                    created_by="system",
                    updated_at=now,
                    updated_by="system",
                    version=1,
                )
            )
            session.add(
                UserSession(
                    session_id="session-heartbeat",
                    user_id="ops_admin",
                    token_hash=hash_session_token(access_token),
                    role="OPS_ADMIN",
                    created_at=now - timedelta(minutes=5),
                    expires_at=now + timedelta(hours=8),
                    last_seen_at=now - timedelta(minutes=3),
                    revoked_at=None,
                )
            )
            session.commit()

            request = SimpleNamespace(headers={"authorization": f"Bearer {access_token}"})
            response = heartbeat_current_session(request=request, db=session)
            refreshed = session.get(UserSession, "session-heartbeat")

        self.assertEqual(response.status_code, 204)
        self.assertIsNotNone(refreshed)
        self.assertIsNotNone(refreshed.last_seen_at)
        self.assertGreater(coerce_utc(refreshed.last_seen_at), now - timedelta(minutes=1))


if __name__ == "__main__":
    unittest.main()
