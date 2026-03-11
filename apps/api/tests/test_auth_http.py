from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.core.auth import hash_password


class AuthHttpTests(unittest.TestCase):
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
        self._previous_bootstrap_admin_token = settings.BOOTSTRAP_ADMIN_TOKEN
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"

        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Position).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.commit()

    def tearDown(self) -> None:
        settings.BOOTSTRAP_ADMIN_TOKEN = self._previous_bootstrap_admin_token

    def _bootstrap_admin(self) -> dict[str, object]:
        response = self.client.post(
            "/auth/bootstrap-admin",
            json={
                "bootstrap_token": "bootstrap-secret",
                "user_id": "ops_admin",
                "email": "ops@example.com",
                "display_name": "Ops Admin",
                "password": "supersecret1",
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def _seed_trade_reference_data(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferenceBook(
                    code="CRUDE_PHYS",
                    name="Crude Physical",
                    description="Test book",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="system",
                    updated_at=now,
                    updated_by="system",
                    version=1,
                )
            )
            session.add(
                ReferenceCommodity(
                    code="WTI",
                    name="WTI",
                    description="Test commodity",
                    commodity_class="CRUDE_OIL",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="system",
                    updated_at=now,
                    updated_by="system",
                    version=1,
                )
            )
            session.commit()

    def test_admin_routes_require_admin_session(self) -> None:
        bootstrap = self._bootstrap_admin()
        token = bootstrap["access_token"]

        with self.SessionLocal() as session:
            now = datetime.now(timezone.utc)
            session.add(
                UserAccount(
                    user_id="trader_1",
                    email="trader@example.com",
                    display_name="Trader One",
                    role="TRADER",
                    password_hash=hash_password("supersecret1"),
                    is_active=True,
                    last_login_at=None,
                    created_at=now,
                    created_by="ops_admin",
                    updated_at=now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.commit()

        no_auth_response = self.client.get("/admin/external-data/runs")
        self.assertEqual(no_auth_response.status_code, 401)

        admin_response = self.client.get(
            "/admin/external-data/runs",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(admin_response.status_code, 200)

        trader_session = self.client.post(
            "/auth/session",
            json={"identifier": "trader_1", "password": "supersecret1"},
        )
        self.assertEqual(trader_session.status_code, 200)
        trader_token = trader_session.json()["access_token"]

        non_admin_response = self.client.get(
            "/admin/external-data/runs",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(non_admin_response.status_code, 403)

    def test_trade_writes_require_session_and_use_session_actor(self) -> None:
        self._seed_trade_reference_data()
        bootstrap = self._bootstrap_admin()
        token = bootstrap["access_token"]

        unauthenticated = self.client.post(
            "/events",
            json={
                "aggregate_type": "trade",
                "aggregate_id": "T-HTTP-1",
                "event_type": "TradeCreated",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "actor_id": "spoofed-user",
                "payload": {
                    "book": "CRUDE_PHYS",
                    "commodity_class": "CRUDE_OIL",
                    "commodity": "WTI",
                    "pricing_type": "FIXED",
                    "trade_side": "BUY",
                    "price": 80,
                    "volume": 1000,
                },
                "schema_version": 1,
            },
        )
        self.assertEqual(unauthenticated.status_code, 401)

        authenticated = self.client.post(
            "/events",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "aggregate_type": "trade",
                "aggregate_id": "T-HTTP-1",
                "event_type": "TradeCreated",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "actor_id": "spoofed-user",
                "payload": {
                    "book": "CRUDE_PHYS",
                    "commodity_class": "CRUDE_OIL",
                    "commodity": "WTI",
                    "pricing_type": "FIXED",
                    "trade_side": "BUY",
                    "price": 80,
                    "volume": 1000,
                },
                "schema_version": 1,
            },
        )
        self.assertEqual(authenticated.status_code, 201)
        self.assertEqual(authenticated.json()["actor_id"], "ops_admin")

    def test_trade_http_rejects_duplicate_create_and_missing_amend(self) -> None:
        self._seed_trade_reference_data()
        bootstrap = self._bootstrap_admin()
        token = bootstrap["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        first_create = self.client.post(
            "/events",
            headers=headers,
            json={
                "aggregate_type": "trade",
                "aggregate_id": "T-HTTP-2",
                "event_type": "TradeCreated",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "actor_id": "ops_admin",
                "payload": {
                    "book": "CRUDE_PHYS",
                    "commodity_class": "CRUDE_OIL",
                    "commodity": "WTI",
                    "pricing_type": "FIXED",
                    "trade_side": "BUY",
                    "price": 80,
                    "volume": 1000,
                },
                "schema_version": 1,
            },
        )
        self.assertEqual(first_create.status_code, 201)

        duplicate_create = self.client.post(
            "/events",
            headers=headers,
            json={
                "aggregate_type": "trade",
                "aggregate_id": "T-HTTP-2",
                "event_type": "TradeCreated",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "actor_id": "ops_admin",
                "payload": {
                    "book": "CRUDE_PHYS",
                    "commodity_class": "CRUDE_OIL",
                    "commodity": "WTI",
                    "pricing_type": "FIXED",
                    "trade_side": "BUY",
                    "price": 80,
                    "volume": 1000,
                },
                "schema_version": 1,
            },
        )
        self.assertEqual(duplicate_create.status_code, 409)

        missing_amend = self.client.post(
            "/events",
            headers=headers,
            json={
                "aggregate_type": "trade",
                "aggregate_id": "T-HTTP-MISSING",
                "event_type": "TradeAmended",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "actor_id": "ops_admin",
                "payload": {"price": 99},
                "schema_version": 1,
            },
        )
        self.assertEqual(missing_amend.status_code, 404)

    def test_sell_trade_http_updates_negative_position(self) -> None:
        self._seed_trade_reference_data()
        bootstrap = self._bootstrap_admin()
        token = bootstrap["access_token"]

        response = self.client.post(
            "/events",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "aggregate_type": "trade",
                "aggregate_id": "T-HTTP-SELL",
                "event_type": "TradeCreated",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "actor_id": "ops_admin",
                "payload": {
                    "book": "CRUDE_PHYS",
                    "commodity_class": "CRUDE_OIL",
                    "commodity": "WTI",
                    "pricing_type": "FIXED",
                    "trade_side": "SELL",
                    "price": 80,
                    "volume": 1000,
                },
                "schema_version": 1,
            },
        )
        self.assertEqual(response.status_code, 201)

        positions = self.client.get("/positions")
        self.assertEqual(positions.status_code, 200)
        self.assertEqual(positions.json()[0]["net_volume"], -1000.0)


if __name__ == "__main__":
    unittest.main()
