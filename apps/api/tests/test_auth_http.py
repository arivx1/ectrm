from __future__ import annotations

import enum
import io
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
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.core.auth import GoogleIdentity, hash_password
from apps.api.app.core.logging import configure_logging


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
        self._previous_projection_monitoring_email_from = settings.PROJECTION_MONITORING_EMAIL_FROM
        self._previous_projection_monitoring_email_smtp_host = settings.PROJECTION_MONITORING_EMAIL_SMTP_HOST
        self._previous_projection_monitoring_email_smtp_port = settings.PROJECTION_MONITORING_EMAIL_SMTP_PORT
        self._previous_projection_monitoring_email_smtp_username = settings.PROJECTION_MONITORING_EMAIL_SMTP_USERNAME
        self._previous_projection_monitoring_email_smtp_password = settings.PROJECTION_MONITORING_EMAIL_SMTP_PASSWORD
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
        settings.PROJECTION_MONITORING_EMAIL_FROM = "projection-monitoring@localhost"
        settings.PROJECTION_MONITORING_EMAIL_SMTP_HOST = ""
        settings.PROJECTION_MONITORING_EMAIL_SMTP_PORT = 587
        settings.PROJECTION_MONITORING_EMAIL_SMTP_USERNAME = ""
        settings.PROJECTION_MONITORING_EMAIL_SMTP_PASSWORD = ""

        with self.SessionLocal() as session:
            for table in reversed(Base.metadata.sorted_tables):
                session.execute(table.delete())
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
        settings.PROJECTION_MONITORING_EMAIL_FROM = self._previous_projection_monitoring_email_from
        settings.PROJECTION_MONITORING_EMAIL_SMTP_HOST = self._previous_projection_monitoring_email_smtp_host
        settings.PROJECTION_MONITORING_EMAIL_SMTP_PORT = self._previous_projection_monitoring_email_smtp_port
        settings.PROJECTION_MONITORING_EMAIL_SMTP_USERNAME = self._previous_projection_monitoring_email_smtp_username
        settings.PROJECTION_MONITORING_EMAIL_SMTP_PASSWORD = self._previous_projection_monitoring_email_smtp_password

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
            session.add(
                ReferenceUnit(
                    code="BBL",
                    name="Barrel",
                    commodity_class="CRUDE_OIL",
                    dimension="VOLUME",
                    base_unit_code=None,
                    conversion_factor=None,
                    precision=3,
                    description="Test barrel unit",
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

    def _swap_log_stream(self) -> tuple[io.StringIO, object, object]:
        logger = configure_logging()
        handler = next(
            handler
            for handler in logger.handlers
            if getattr(handler, "_ectrm_handler", False)
        )
        stream = io.StringIO()
        original_stream = handler.setStream(stream)
        return stream, handler, original_stream

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

    def test_admin_preflight_options_requests_do_not_require_authentication(self) -> None:
        response = self.client.options(
            "/admin/trading-sources/seed",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5173")
        self.assertIn("POST", response.headers.get("access-control-allow-methods", ""))
        self.assertNotIn("error", response.text.lower())

    def test_admin_preflight_options_requests_allow_loopback_fallback_ports(self) -> None:
        response = self.client.options(
            "/admin/trading-sources/seed",
            headers={
                "Origin": "http://127.0.0.1:5174",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5174")
        self.assertIn("POST", response.headers.get("access-control-allow-methods", ""))

    def test_write_auth_rejections_preserve_cors_headers_for_browser_clients(self) -> None:
        response = self.client.patch(
            "/confirmations/999",
            json={"status": "CONFIRMED"},
            headers={"Origin": "http://127.0.0.1:5173"},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173")
        self.assertEqual(response.headers.get("access-control-allow-credentials"), "true")
        self.assertEqual(response.headers.get("access-control-expose-headers"), "x-correlation-id")
        self.assertEqual(response.json()["error"]["code"], "AUTHENTICATION_REQUIRED")

    def test_write_auth_rejections_preserve_cors_headers_for_loopback_fallback_ports(self) -> None:
        response = self.client.patch(
            "/confirmations/999",
            json={"status": "CONFIRMED"},
            headers={"Origin": "http://localhost:5174"},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5174")
        self.assertEqual(response.headers.get("access-control-allow-credentials"), "true")
        self.assertEqual(response.headers.get("access-control-expose-headers"), "x-correlation-id")
        self.assertEqual(response.json()["error"]["code"], "AUTHENTICATION_REQUIRED")

    def test_admin_auth_rejection_is_logged_with_request_context(self) -> None:
        stream, handler, original_stream = self._swap_log_stream()
        try:
            response = self.client.get(
                "/admin/external-data/runs",
                headers={"x-correlation-id": "auth-log-123"},
            )
            handler.flush()
        finally:
            handler.setStream(original_stream)

        self.assertEqual(response.status_code, 401)
        output = stream.getvalue()
        self.assertIn("Authentication rejected status_code=401", output)
        self.assertIn("correlation_id=auth-log-123", output)
        self.assertIn("request_method=GET", output)
        self.assertIn("request_path=/admin/external-data/runs", output)
        self.assertIn("Request completed status_code=401", output)

    def test_invalid_bearer_token_uses_auth_error_handler(self) -> None:
        stream, handler, original_stream = self._swap_log_stream()
        try:
            response = self.client.get(
                "/auth/me",
                headers={
                    "Authorization": "Token nope",
                    "x-correlation-id": "bad-auth-123",
                },
            )
            handler.flush()
        finally:
            handler.setStream(original_stream)

        self.assertEqual(response.status_code, 401)
        payload = response.json()
        self.assertEqual(payload["error"]["code"], "AUTHENTICATION_REQUIRED")
        self.assertEqual(payload["error"]["message"], "A valid Bearer session token is required.")
        self.assertEqual(payload["error"]["correlation_id"], "bad-auth-123")
        self.assertEqual(response.headers.get("x-correlation-id"), "bad-auth-123")

        output = stream.getvalue()
        self.assertIn("Authentication rejected status_code=401", output)
        self.assertIn("correlation_id=bad-auth-123", output)
        self.assertIn("request_path=/auth/me", output)
        self.assertIn("Request completed status_code=401", output)

    def test_http_exception_is_logged_with_request_context(self) -> None:
        token = self._bootstrap_admin()["access_token"]
        stream, handler, original_stream = self._swap_log_stream()
        try:
            response = self.client.get(
                "/trades/MISSING",
                headers={
                    "Authorization": f"Bearer {token}",
                    "x-correlation-id": "http-log-123",
                },
            )
            handler.flush()
        finally:
            handler.setStream(original_stream)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Trade not found")
        self.assertEqual(response.headers.get("x-correlation-id"), "http-log-123")

        output = stream.getvalue()
        self.assertIn("Handled request failure status_code=404 detail=Trade not found", output)
        self.assertIn("correlation_id=http-log-123", output)
        self.assertIn("request_method=GET", output)
        self.assertIn("request_path=/trades/MISSING", output)
        self.assertIn("Request completed status_code=404", output)

    def test_protected_workspace_reads_require_authentication(self) -> None:
        self._seed_trade_reference_data()
        token = self._bootstrap_admin()["access_token"]

        create_response = self.client.post(
            "/events",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "aggregate_type": "trade",
                "aggregate_id": "T-AUTH-READ",
                "event_type": "TradeCreated",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "actor_id": "ops_admin",
                "payload": {
                    "book": "CRUDE_PHYS",
                    "portfolio": "OIL_DISCRETIONARY",
                    "counterparty": "SHELL_TRADING",
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
        self.assertEqual(create_response.status_code, 201)

        unauthenticated_trade = self.client.get("/trades/T-AUTH-READ")
        self.assertEqual(unauthenticated_trade.status_code, 401)
        self.assertEqual(
            unauthenticated_trade.json()["error"]["message"],
            "Authentication is required for protected workspace data.",
        )

        authenticated_trade = self.client.get(
            "/trades/T-AUTH-READ",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(authenticated_trade.status_code, 200)
        self.assertEqual(authenticated_trade.json()["trade_id"], "T-AUTH-READ")

        unauthenticated_positions = self.client.get("/positions")
        self.assertEqual(unauthenticated_positions.status_code, 401)
        authenticated_positions = self.client.get(
            "/positions",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(authenticated_positions.status_code, 200)
        self.assertEqual(authenticated_positions.json()[0]["net_volume"], 1000.0)

        unauthenticated_workspace_summary = self.client.get("/operations/workspace-summary")
        self.assertEqual(unauthenticated_workspace_summary.status_code, 401)
        authenticated_workspace_summary = self.client.get(
            "/operations/workspace-summary",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(authenticated_workspace_summary.status_code, 200)
        self.assertIn("trades", authenticated_workspace_summary.json())

        unauthenticated_trade_attention_candidates = self.client.get("/operations/trade-attention-candidates")
        self.assertEqual(unauthenticated_trade_attention_candidates.status_code, 401)
        authenticated_trade_attention_candidates = self.client.get(
            "/operations/trade-attention-candidates",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(authenticated_trade_attention_candidates.status_code, 200)

        unauthenticated_invoice_issue_candidates = self.client.get("/settlement/invoice-issue-candidates")
        self.assertEqual(unauthenticated_invoice_issue_candidates.status_code, 401)
        authenticated_invoice_issue_candidates = self.client.get(
            "/settlement/invoice-issue-candidates",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(authenticated_invoice_issue_candidates.status_code, 200)

    def test_successful_requests_emit_completion_logs(self) -> None:
        stream, handler, original_stream = self._swap_log_stream()
        try:
            response = self.client.get(
                "/health",
                headers={"x-correlation-id": "health-log-123"},
            )
            handler.flush()
        finally:
            handler.setStream(original_stream)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

        output = stream.getvalue()
        self.assertIn("Request completed status_code=200", output)
        self.assertIn("correlation_id=health-log-123", output)
        self.assertIn("request_method=GET", output)
        self.assertIn("request_path=/health", output)

    def test_unhandled_exception_is_logged_with_request_context(self) -> None:
        stream, handler, original_stream = self._swap_log_stream()
        try:
            with patch("apps.api.app.main.build_database_overview", side_effect=RuntimeError("boom")):
                with TestClient(app, raise_server_exceptions=False) as client:
                    response = client.get(
                        "/settings/public",
                        headers={"x-correlation-id": "error-log-123"},
                    )
            handler.flush()
        finally:
            handler.setStream(original_stream)

        self.assertEqual(response.status_code, 500)
        payload = response.json()
        self.assertEqual(payload["error"]["code"], "UNHANDLED_EXCEPTION")
        self.assertEqual(payload["error"]["correlation_id"], "error-log-123")

        output = stream.getvalue()
        self.assertIn("Unhandled exception while processing request", output)
        self.assertIn("RuntimeError: boom", output)
        self.assertIn("correlation_id=error-log-123", output)
        self.assertIn("request_method=GET", output)
        self.assertIn("request_path=/settings/public", output)
        self.assertIn("Request completed status_code=500", output)

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

    def test_god_login_creates_ops_admin_session_with_admin_admin(self) -> None:
        response = self.client.post(
            "/auth/session",
            json={"identifier": "admin", "password": "admin"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["show_start_here"], True)
        self.assertEqual(payload["user"]["user_id"], "admin")
        self.assertEqual(payload["user"]["role"], "OPS_ADMIN")
        self.assertEqual(payload["user"]["default_assistant_persona"], "admin")

        admin_response = self.client.get(
            "/admin/external-data/runs",
            headers={"Authorization": f"Bearer {payload['access_token']}"},
        )
        self.assertEqual(admin_response.status_code, 200)

        with self.SessionLocal() as session:
            created = session.get(UserAccount, "admin")
            self.assertIsNotNone(created)
            assert created is not None
            self.assertTrue(created.is_active)
            self.assertEqual(created.role, "OPS_ADMIN")
            self.assertEqual(created.default_assistant_persona, "admin")
            self.assertTrue(created.email.endswith("@local.invalid"))
            self.assertIsNotNone(created.password_hash)

    def test_current_user_can_update_profile_context_for_assistant_prompts(self) -> None:
        session_payload = self._bootstrap_admin()
        access_token = session_payload["access_token"]

        response = self.client.patch(
            "/auth/me/profile",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "display_name": "Operations Context Owner",
                "first_name": "  Operations  ",
                "last_name": "  Owner  ",
                "preferred_timezone": "America/Chicago",
                "primary_location": "  Houston desk  ",
                "default_assistant_persona": "risk",
                "assistant_context_blurb": "  I cover the morning queue and prefer exposure risk first.  ",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["display_name"], "Operations Context Owner")
        self.assertEqual(payload["first_name"], "Operations")
        self.assertEqual(payload["last_name"], "Owner")
        self.assertEqual(payload["preferred_timezone"], "America/Chicago")
        self.assertEqual(payload["primary_location"], "Houston desk")
        self.assertEqual(payload["default_assistant_persona"], "risk")
        self.assertEqual(payload["assistant_context_blurb"], "I cover the morning queue and prefer exposure risk first.")

        current_response = self.client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        self.assertEqual(current_response.status_code, 200)
        current_user = current_response.json()["user"]
        self.assertEqual(current_user["first_name"], "Operations")
        self.assertEqual(current_user["last_name"], "Owner")
        self.assertEqual(current_user["preferred_timezone"], "America/Chicago")
        self.assertEqual(current_user["primary_location"], "Houston desk")
        self.assertEqual(current_user["assistant_context_blurb"], "I cover the morning queue and prefer exposure risk first.")

        clear_response = self.client.patch(
            "/auth/me/profile",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "first_name": "   ",
                "last_name": "   ",
                "preferred_timezone": "   ",
                "primary_location": "   ",
                "assistant_context_blurb": "   ",
            },
        )
        self.assertEqual(clear_response.status_code, 200)
        self.assertIsNone(clear_response.json()["first_name"])
        self.assertIsNone(clear_response.json()["last_name"])
        self.assertIsNone(clear_response.json()["preferred_timezone"])
        self.assertIsNone(clear_response.json()["primary_location"])
        self.assertIsNone(clear_response.json()["assistant_context_blurb"])

        with self.SessionLocal() as session:
            user = session.get(UserAccount, "ops_admin")
            self.assertIsNotNone(user)
            assert user is not None
            self.assertEqual(user.display_name, "Operations Context Owner")
            self.assertIsNone(user.first_name)
            self.assertIsNone(user.last_name)
            self.assertIsNone(user.preferred_timezone)
            self.assertIsNone(user.primary_location)
            self.assertEqual(user.default_assistant_persona, "risk")
            self.assertIsNone(user.assistant_context_blurb)

    def test_current_user_profile_rejects_unknown_timezone(self) -> None:
        session_payload = self._bootstrap_admin()
        access_token = session_payload["access_token"]

        response = self.client.patch(
            "/auth/me/profile",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"preferred_timezone": "Mars/Olympus"},
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("preferred_timezone", str(response.json()["detail"]))

    def test_password_session_only_requests_start_here_for_first_login(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="ops_admin",
                    email="ops@example.com",
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

        first_response = self.client.post(
            "/auth/session",
            json={"identifier": "ops_admin", "password": "supersecret1"},
        )
        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(first_response.json()["show_start_here"], True)

        second_response = self.client.post(
            "/auth/session",
            json={"identifier": "ops_admin", "password": "supersecret1"},
        )
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.json()["show_start_here"], False)

    def test_single_user_session_creates_ops_admin_when_enabled(self) -> None:
        settings.SINGLE_USER_AUTH_ENABLED = True
        settings.SINGLE_USER_AUTH_USER_ID = "solo_admin"
        settings.SINGLE_USER_AUTH_EMAIL = "solo@example.com"
        settings.SINGLE_USER_AUTH_DISPLAY_NAME = "Solo Admin"

        response = self.client.post("/auth/single-user-session")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["show_start_here"], True)
        self.assertEqual(payload["user"]["user_id"], "solo_admin")
        self.assertEqual(payload["user"]["email"], "solo@example.com")
        self.assertEqual(payload["user"]["display_name"], "Solo Admin")
        self.assertEqual(payload["user"]["role"], "OPS_ADMIN")
        self.assertEqual(payload["user"]["default_assistant_persona"], "admin")

        with self.SessionLocal() as session:
            created = session.get(UserAccount, "solo_admin")
            self.assertIsNotNone(created)
            assert created is not None
            self.assertTrue(created.is_active)
            self.assertEqual(created.role, "OPS_ADMIN")
            self.assertEqual(created.default_assistant_persona, "admin")
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
                    last_login_at=now,
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
        self.assertEqual(payload["show_start_here"], False)
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
        self.assertEqual(payload["show_start_here"], True)
        self.assertEqual(payload["user"]["user_id"], "ops_admin")
        self.assertEqual(payload["user"]["email"], "ops@example.com")
        self.assertEqual(payload["user"]["role"], "OPS_ADMIN")
        self.assertEqual(payload["user"]["default_assistant_persona"], "operator")

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
        self.assertEqual(payload["show_start_here"], True)
        self.assertEqual(payload["user"]["user_id"], "google_1234567890")
        self.assertEqual(payload["user"]["email"], "new.user@example.com")
        self.assertEqual(payload["user"]["display_name"], "New User")
        self.assertEqual(payload["user"]["role"], "TRADER")
        self.assertEqual(payload["user"]["default_assistant_persona"], "trader")

        with self.SessionLocal() as session:
            user = session.get(UserAccount, "google_1234567890")
            self.assertIsNotNone(user)
            assert user is not None
            self.assertEqual(user.google_subject, "1234567890")
            self.assertIsNone(user.password_hash)
            self.assertTrue(user.is_active)
            self.assertEqual(user.default_assistant_persona, "trader")

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

    def test_public_settings_include_projection_monitoring_email_runtime(self) -> None:
        settings.PROJECTION_MONITORING_EMAIL_FROM = "alerts@gmail.com"
        settings.PROJECTION_MONITORING_EMAIL_SMTP_HOST = "smtp.gmail.com"
        settings.PROJECTION_MONITORING_EMAIL_SMTP_PORT = 587
        settings.PROJECTION_MONITORING_EMAIL_SMTP_USERNAME = "alerts@gmail.com"
        settings.PROJECTION_MONITORING_EMAIL_SMTP_PASSWORD = "gmail-app-password"
        self._bootstrap_admin()

        response = self.client.get("/settings/public")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["projection_monitoring_email"],
            {
                "transport": "smtp",
                "provider_hint": "gmail",
                "smtp_host": "smtp.gmail.com",
                "smtp_port": 587,
                "sender": "alerts@gmail.com",
                "recipient_count": 1,
                "auth_status": "configured",
            },
        )

    def test_public_settings_include_database_metadata(self) -> None:
        response = self.client.get("/settings/public")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("database", payload)
        self.assertEqual(payload["database"]["dialect"], "sqlite")
        self.assertEqual(payload["database"]["name"], "in-memory")
        self.assertEqual(payload["database"]["table_count"], len(Base.metadata.sorted_tables))
        self.assertEqual(payload["database"]["record_count"], 0)
        self.assertIsInstance(payload["database"]["size_bytes"], int)
        self.assertGreater(payload["database"]["size_bytes"], 0)

    def test_public_settings_tolerate_missing_managed_tables(self) -> None:
        missing_table = Base.metadata.tables["gmail_inbox_import_receipts"]
        missing_table.drop(bind=self.engine, checkfirst=True)

        try:
            response = self.client.get("/settings/public")
            payload = response.json()
        finally:
            missing_table.create(bind=self.engine, checkfirst=True)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["database"]["table_count"], len(Base.metadata.sorted_tables) - 1)
        self.assertEqual(payload["database"]["record_count"], 0)

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

        positions = self.client.get(
            "/positions",
            headers={"Authorization": f"Bearer {token}"},
        )
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

        trade_response = self.client.get(
            "/trades/T-HTTP-HEADER",
            headers={"Authorization": f"Bearer {token}"},
        )
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
