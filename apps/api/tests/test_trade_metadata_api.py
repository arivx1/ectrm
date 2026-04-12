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

from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class TradeMetadataApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 4, 11, 20, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()

        self.token = self._create_user_session()
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def _create_user_session(self) -> str:
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id="trade_metadata_viewer",
                email="trade-metadata@example.com",
                display_name="Trade Metadata Viewer",
                role="TRADER",
                password_hash=hash_password("supersecret1"),
                is_active=True,
                last_login_at=self.now,
                created_at=self.now,
                created_by="test",
                updated_at=self.now,
                updated_by="test",
                version=1,
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            _, token = create_user_session(session, user)
            return token

    def test_trade_metadata_requires_authenticated_read_access(self) -> None:
        response = self.client.get("/trades/metadata")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.json()["error"]["message"],
            "Authentication is required for protected workspace data.",
        )

    def test_trade_metadata_endpoint_exposes_server_owned_contract(self) -> None:
        response = self.client.get("/trades/metadata", headers=self.headers)

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["contract_version"], 1)
        self.assertEqual(payload["vocabulary"]["instrument_types"], ["LINEAR", "OPTION"])
        self.assertEqual(payload["vocabulary"]["pricing_types"], ["FIXED", "INDEX", "FORMULA", "HYBRID"])
        self.assertEqual(
            payload["vocabulary"]["option_lifecycle_event_types"],
            ["OptionAssigned", "OptionExercised", "OptionExpired"],
        )
        self.assertEqual(payload["defaults"]["source_system"], "ETRM")
        self.assertEqual(payload["defaults"]["instrument_type"], "LINEAR")
        self.assertEqual(payload["defaults"]["pricing_type"], "FIXED")
        self.assertEqual(payload["defaults"]["option_style"], "AMERICAN")
        self.assertEqual(
            payload["defaults"]["workflow_statuses_by_trade_nature"]["PHYSICAL"],
            {
                "confirmation_status": "PENDING",
                "nomination_status": "PENDING",
                "allocation_status": "PENDING",
                "actualization_status": "PENDING",
                "invoice_status": "PENDING",
                "payment_status": "PENDING",
            },
        )
        self.assertEqual(
            payload["defaults"]["workflow_statuses_by_trade_nature"]["FINANCIAL"],
            {
                "confirmation_status": "PENDING",
                "nomination_status": "NOT_REQUIRED",
                "allocation_status": "NOT_REQUIRED",
                "actualization_status": "NOT_REQUIRED",
                "invoice_status": "NOT_REQUIRED",
                "payment_status": "PENDING",
            },
        )
        self.assertEqual(payload["rules"]["pricing_types_requiring_price_index"], ["INDEX", "HYBRID"])
        self.assertEqual(payload["rules"]["pricing_types_requiring_explicit_price"], ["FIXED", "HYBRID"])
        self.assertEqual(payload["rules"]["option_required_trade_nature"], "FINANCIAL")
        self.assertEqual(payload["rules"]["option_required_trade_structure"], "SINGLE")
        self.assertEqual(payload["rules"]["option_required_pricing_type"], "FIXED")
        self.assertEqual(
            payload["rules"]["option_lifecycle_event_to_status"],
            {
                "OptionAssigned": "ASSIGNED",
                "OptionExercised": "EXERCISED",
                "OptionExpired": "EXPIRED",
            },
        )


if __name__ == "__main__":
    unittest.main()
