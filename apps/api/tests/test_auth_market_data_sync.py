from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class AuthMarketDataSyncTriggerTests(unittest.TestCase):
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
        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()

    def test_password_login_queues_due_market_data_sync(self) -> None:
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
                    created_by="system",
                    updated_at=now,
                    updated_by="system",
                    version=1,
                )
            )
            session.commit()

        with patch("apps.api.app.routes.auth.run_login_triggered_market_data_syncs", return_value=[]) as sync_mock:
            response = self.client.post(
                "/auth/session",
                json={"identifier": "ops@example.com", "password": "supersecret1"},
            )

        self.assertEqual(response.status_code, 200)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "ops_admin")
        self.assertIs(sync_mock.call_args.kwargs["session_factory"], self.SessionLocal)

    def test_current_session_queues_due_market_data_sync_for_session_resume(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            user = UserAccount(
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
            session.add(user)
            session.commit()
            session.refresh(user)
            _session_record, access_token = create_user_session(session, user)

        with patch("apps.api.app.routes.auth.run_login_triggered_market_data_syncs", return_value=[]) as sync_mock:
            response = self.client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})

        self.assertEqual(response.status_code, 200)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "ops_admin")
        self.assertIs(sync_mock.call_args.kwargs["session_factory"], self.SessionLocal)


if __name__ == "__main__":
    unittest.main()
