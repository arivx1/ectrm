from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

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
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.core.auth import GoogleIdentity, hash_password


def coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


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
        self._previous_single_user_auth_enabled = settings.SINGLE_USER_AUTH_ENABLED
        self._previous_single_user_auth_user_id = settings.SINGLE_USER_AUTH_USER_ID
        self._previous_single_user_auth_email = settings.SINGLE_USER_AUTH_EMAIL
        self._previous_single_user_auth_display_name = settings.SINGLE_USER_AUTH_DISPLAY_NAME
        self._previous_google_auth_enabled = settings.GOOGLE_AUTH_ENABLED
        self._previous_google_auth_client_id = settings.GOOGLE_AUTH_CLIENT_ID
        self._previous_google_auth_auto_create_users = settings.GOOGLE_AUTH_AUTO_CREATE_USERS
        self._previous_google_auth_default_role = settings.GOOGLE_AUTH_DEFAULT_ROLE
        self._previous_google_auth_timeout_seconds = settings.GOOGLE_AUTH_TIMEOUT_SECONDS
        self._previous_google_auth_tokeninfo_url = settings.GOOGLE_AUTH_TOKENINFO_URL
        settings.BOOTSTRAP_ADMIN_TOKEN = "bootstrap-secret"
        settings.SINGLE_USER_AUTH_ENABLED = False
        settings.SINGLE_USER_AUTH_USER_ID = "local_admin"
        settings.SINGLE_USER_AUTH_EMAIL = "local-admin@example.com"
        settings.SINGLE_USER_AUTH_DISPLAY_NAME = "Local Admin"
        settings.GOOGLE_AUTH_ENABLED = False
        settings.GOOGLE_AUTH_CLIENT_ID = ""
        settings.GOOGLE_AUTH_AUTO_CREATE_USERS = False
        settings.GOOGLE_AUTH_DEFAULT_ROLE = "TRADER"
        settings.GOOGLE_AUTH_TIMEOUT_SECONDS = 10
        settings.GOOGLE_AUTH_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"

        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Position).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.commit()

    def tearDown(self) -> None:
        settings.BOOTSTRAP_ADMIN_TOKEN = self._previous_bootstrap_admin_token
        settings.SINGLE_USER_AUTH_ENABLED = self._previous_single_user_auth_enabled
        settings.SINGLE_USER_AUTH_USER_ID = self._previous_single_user_auth_user_id
        settings.SINGLE_USER_AUTH_EMAIL = self._previous_single_user_auth_email
        settings.SINGLE_USER_AUTH_DISPLAY_NAME = self._previous_single_user_auth_display_name
        settings.GOOGLE_AUTH_ENABLED = self._previous_google_auth_enabled
        settings.GOOGLE_AUTH_CLIENT_ID = self._previous_google_auth_client_id
        settings.GOOGLE_AUTH_AUTO_CREATE_USERS = self._previous_google_auth_auto_create_users
        settings.GOOGLE_AUTH_DEFAULT_ROLE = self._previous_google_auth_default_role
        settings.GOOGLE_AUTH_TIMEOUT_SECONDS = self._previous_google_auth_timeout_seconds
        settings.GOOGLE_AUTH_TOKENINFO_URL = self._previous_google_auth_tokeninfo_url

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
                    created_at=now,
                    created_by="system",
                    updated_at=now,
                    updated_by="system",
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

    def test_bootstrap_admin_rejects_whitespace_only_password(self) -> None:
        response = self.client.post(
            "/auth/bootstrap-admin",
            json={
                "bootstrap_token": "bootstrap-secret",
                "user_id": "ops_admin",
                "email": "ops@example.com",
                "display_name": "Ops Admin",
                "password": "        ",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("password", str(response.json()["detail"]))

    def test_single_user_session_creates_ops_admin_when_enabled(self) -> None:
        settings.SINGLE_USER_AUTH_ENABLED = True
        settings.SINGLE_USER_AUTH_USER_ID = "solo_admin"
        settings.SINGLE_USER_AUTH_EMAIL = "solo@example.com"
        settings.SINGLE_USER_AUTH_DISPLAY_NAME = "Solo Admin"

        response = self.client.post("/auth/single-user-session")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["user_id"], "solo_admin")
        self.assertEqual(payload["user"]["email"], "solo@example.com")
        self.assertEqual(payload["user"]["display_name"], "Solo Admin")
        self.assertEqual(payload["user"]["role"], "OPS_ADMIN")

        with self.SessionLocal() as session:
            created = session.get(UserAccount, "solo_admin")
            self.assertIsNotNone(created)
            assert created is not None
            self.assertTrue(created.is_active)
            self.assertEqual(created.role, "OPS_ADMIN")
            self.assertIsNone(created.password_hash)

    def test_single_user_session_reuses_existing_account(self) -> None:
        settings.SINGLE_USER_AUTH_ENABLED = True
        settings.SINGLE_USER_AUTH_USER_ID = "solo_admin"
        settings.SINGLE_USER_AUTH_EMAIL = "solo@example.com"
        settings.SINGLE_USER_AUTH_DISPLAY_NAME = "Solo Admin"

        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="solo_admin",
                    email="old@example.com",
                    display_name="Old Name",
                    role="TRADER",
                    password_hash=hash_password("supersecret1"),
                    is_active=False,
                    last_login_at=None,
                    created_at=now,
                    created_by="seed",
                    updated_at=now,
                    updated_by="seed",
                    version=3,
                )
            )
            session.commit()

        response = self.client.post("/auth/single-user-session")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["user_id"], "solo_admin")
        self.assertEqual(payload["user"]["role"], "OPS_ADMIN")

        with self.SessionLocal() as session:
            updated = session.get(UserAccount, "solo_admin")
            self.assertIsNotNone(updated)
            assert updated is not None
            self.assertEqual(updated.email, "solo@example.com")
            self.assertEqual(updated.display_name, "Solo Admin")
            self.assertEqual(updated.role, "OPS_ADMIN")
            self.assertTrue(updated.is_active)
            self.assertEqual(updated.version, 4)

    def test_single_user_session_rejects_requests_when_disabled(self) -> None:
        response = self.client.post("/auth/single-user-session")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Single-user authentication is not configured on this API.")

    def test_google_session_rejects_requests_when_disabled(self) -> None:
        response = self.client.post("/auth/google-session", json={"id_token": "google-id-token"})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Google authentication is not configured on this API.")

    def test_google_session_links_existing_user_by_email(self) -> None:
        settings.GOOGLE_AUTH_ENABLED = True
        settings.GOOGLE_AUTH_CLIENT_ID = "google-client-id.apps.googleusercontent.com"

        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="ops_admin",
                    email="ops@example.com",
                    google_subject=None,
                    display_name="Ops Admin",
                    role="OPS_ADMIN",
                    password_hash=hash_password("supersecret1"),
                    is_active=True,
                    last_login_at=None,
                    created_at=now,
                    created_by="seed",
                    updated_at=now,
                    updated_by="seed",
                    version=1,
                )
            )
            session.commit()

        with patch(
            "apps.api.app.core.auth.verify_google_identity",
            return_value=GoogleIdentity(
                subject="1234567890",
                email="ops@example.com",
                display_name="Ops Admin",
            ),
        ):
            response = self.client.post("/auth/google-session", json={"id_token": "google-id-token"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["user_id"], "ops_admin")
        self.assertEqual(payload["user"]["email"], "ops@example.com")
        self.assertEqual(payload["user"]["role"], "OPS_ADMIN")

        with self.SessionLocal() as session:
            user = session.get(UserAccount, "ops_admin")
            self.assertIsNotNone(user)
            assert user is not None
            self.assertEqual(user.google_subject, "1234567890")
            self.assertIsNotNone(user.last_login_at)

    def test_google_session_auto_creates_user_when_enabled(self) -> None:
        settings.GOOGLE_AUTH_ENABLED = True
        settings.GOOGLE_AUTH_CLIENT_ID = "google-client-id.apps.googleusercontent.com"
        settings.GOOGLE_AUTH_AUTO_CREATE_USERS = True
        settings.GOOGLE_AUTH_DEFAULT_ROLE = "TRADER"

        with patch(
            "apps.api.app.core.auth.verify_google_identity",
            return_value=GoogleIdentity(
                subject="1234567890",
                email="new.user@example.com",
                display_name="New User",
            ),
        ):
            response = self.client.post("/auth/google-session", json={"id_token": "google-id-token"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["user"]["user_id"], "google_1234567890")
        self.assertEqual(payload["user"]["email"], "new.user@example.com")
        self.assertEqual(payload["user"]["display_name"], "New User")
        self.assertEqual(payload["user"]["role"], "TRADER")

        with self.SessionLocal() as session:
            user = session.get(UserAccount, "google_1234567890")
            self.assertIsNotNone(user)
            assert user is not None
            self.assertEqual(user.google_subject, "1234567890")
            self.assertIsNone(user.password_hash)
            self.assertTrue(user.is_active)

    def test_google_session_requires_linked_user_when_auto_create_disabled(self) -> None:
        settings.GOOGLE_AUTH_ENABLED = True
        settings.GOOGLE_AUTH_CLIENT_ID = "google-client-id.apps.googleusercontent.com"

        with patch(
            "apps.api.app.core.auth.verify_google_identity",
            return_value=GoogleIdentity(
                subject="1234567890",
                email="new.user@example.com",
                display_name="New User",
            ),
        ):
            response = self.client.post("/auth/google-session", json={"id_token": "google-id-token"})

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "No local user account is linked to this Google identity.")

    def test_public_settings_include_single_user_auth_flag(self) -> None:
        settings.SINGLE_USER_AUTH_ENABLED = True

        response = self.client.get("/settings/public")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["single_user_auth_enabled"])

    def test_public_settings_include_google_auth_settings(self) -> None:
        settings.GOOGLE_AUTH_ENABLED = True
        settings.GOOGLE_AUTH_CLIENT_ID = "google-client-id.apps.googleusercontent.com"
        settings.GOOGLE_AUTH_AUTO_CREATE_USERS = True

        response = self.client.get("/settings/public")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["google_auth"],
            {
                "enabled": True,
                "client_id": "google-client-id.apps.googleusercontent.com",
                "auto_create_users": True,
            },
        )

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

    def test_trades_api_returns_extended_trade_header_fields(self) -> None:
        self._seed_trade_reference_data()
        bootstrap = self._bootstrap_admin()
        token = bootstrap["access_token"]

        create_response = self.client.post(
            "/events",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "aggregate_type": "trade",
                "aggregate_id": "T-HTTP-HEADER",
                "event_type": "TradeCreated",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "actor_id": "ops_admin",
                "payload": {
                    "external_trade_id": "EXT-42",
                    "source_system": "ETRM",
                    "execution_timestamp": "2026-03-11T09:15:00-05:00",
                    "book": "CRUDE_PHYS",
                    "portfolio": "OIL_DISCRETIONARY",
                    "counterparty": "SHELL_TRADING",
                    "commodity_class": "CRUDE_OIL",
                    "commodity": "WTI",
                    "pricing_type": "FIXED",
                    "pricing_status": "PRICED",
                    "settlement_status": "PENDING",
                    "trader_user": "trader.alpha",
                    "trade_side": "BUY",
                    "price": 80,
                    "volume": 1000,
                },
                "schema_version": 1,
            },
        )
        self.assertEqual(create_response.status_code, 201)

        trade_response = self.client.get("/trades/T-HTTP-HEADER")
        self.assertEqual(trade_response.status_code, 200)
        payload = trade_response.json()

        self.assertEqual(payload["external_trade_id"], "EXT-42")
        self.assertEqual(payload["source_system"], "ETRM")
        self.assertEqual(payload["portfolio"], "OIL_DISCRETIONARY")
        self.assertEqual(payload["counterparty"], "SHELL_TRADING")
        self.assertEqual(payload["pricing_status"], "PRICED")
        self.assertEqual(payload["settlement_status"], "PENDING")
        self.assertEqual(payload["trader_user"], "trader.alpha")
        self.assertEqual(
            coerce_utc(datetime.fromisoformat(payload["execution_timestamp"].replace("Z", "+00:00"))),
            datetime(2026, 3, 11, 14, 15, tzinfo=timezone.utc),
        )


if __name__ == "__main__":
    unittest.main()
