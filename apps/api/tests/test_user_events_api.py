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
from apps.api.app.models.user_defined_event import UserDefinedEvent
from apps.api.app.models.user_session import UserSession


class UserEventsApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 5, 10, 20, 30, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(UserDefinedEvent).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        self.user_headers = {
            "Authorization": f"Bearer {self._create_user_session(user_id='calendar_user', email='calendar@example.com')}"
        }

    def _create_user_session(self, *, user_id: str, email: str, role: str = "TRADER") -> str:
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id=user_id,
                email=email,
                display_name="Calendar User",
                role=role,
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

    def test_user_events_require_authentication_for_reads(self) -> None:
        response = self.client.get("/user-events")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["code"], "AUTHENTICATION_REQUIRED")

    def test_create_and_expand_weekly_recurring_user_event(self) -> None:
        create_response = self.client.post(
            "/user-events",
            headers=self.user_headers,
            json={
                "title": "Tank inspection reminder",
                "kind": "reminder",
                "starts_at": "2026-05-11T09:00:00-05:00",
                "ends_at": "2026-05-11T09:30:00-05:00",
                "timezone": "America/Chicago",
                "place": "Houston Terminal",
                "description": "Recurring operator reminder",
                "recurrence": {
                    "frequency": "weekly",
                    "interval": 1,
                    "by_weekday": ["MO", "WE"],
                },
                "created_by": "calendar_user",
            },
        )

        self.assertEqual(create_response.status_code, 201)
        created_payload = create_response.json()
        self.assertEqual(created_payload["kind"], "REMINDER")
        self.assertEqual(created_payload["recurrence"]["frequency"], "WEEKLY")

        occurrences_response = self.client.get(
            "/user-events/occurrences",
            headers=self.user_headers,
            params={
                "window_start": "2026-05-11T00:00:00Z",
                "window_end": "2026-05-20T23:59:00Z",
                "place": "Houston",
            },
        )

        self.assertEqual(occurrences_response.status_code, 200)
        occurrences = occurrences_response.json()
        self.assertEqual(len(occurrences), 4)
        self.assertEqual(
            [item["starts_at"] for item in occurrences],
            [
                "2026-05-11T14:00:00Z",
                "2026-05-13T14:00:00Z",
                "2026-05-18T14:00:00Z",
                "2026-05-20T14:00:00Z",
            ],
        )
        self.assertTrue(all(item["is_recurring"] for item in occurrences))

    def test_create_and_expand_yearly_holiday_event(self) -> None:
        create_response = self.client.post(
            "/user-events",
            headers=self.user_headers,
            json={
                "title": "Desk holiday closure",
                "kind": "holiday",
                "starts_at": "2026-12-25T00:00:00-05:00",
                "all_day": True,
                "timezone": "America/New_York",
                "place": "NY Office",
                "description": "User-defined office closure",
                "recurrence": {
                    "frequency": "yearly",
                    "interval": 1,
                },
                "created_by": "calendar_user",
            },
        )

        self.assertEqual(create_response.status_code, 201)

        occurrences_response = self.client.get(
            "/user-events/occurrences",
            headers=self.user_headers,
            params={
                "window_start": "2028-12-25T00:00:00Z",
                "window_end": "2028-12-26T23:59:00Z",
                "kind": "holiday",
                "place": "office",
            },
        )

        self.assertEqual(occurrences_response.status_code, 200)
        occurrences = occurrences_response.json()
        self.assertEqual(len(occurrences), 1)
        self.assertEqual(occurrences[0]["kind"], "HOLIDAY")
        self.assertEqual(occurrences[0]["place"], "NY Office")

    def test_deactivated_user_event_is_hidden_from_default_occurrence_listing(self) -> None:
        create_response = self.client.post(
            "/user-events",
            headers=self.user_headers,
            json={
                "title": "Truck appointment",
                "kind": "event",
                "starts_at": "2026-05-14T08:00:00-05:00",
                "ends_at": "2026-05-14T09:00:00-05:00",
                "timezone": "America/Chicago",
                "place": "Corpus Christi",
                "created_by": "calendar_user",
            },
        )
        self.assertEqual(create_response.status_code, 201)
        event_id = create_response.json()["id"]

        deactivate_response = self.client.patch(
            f"/user-events/{event_id}/status",
            headers=self.user_headers,
            params={"is_active": "false"},
            json={"updated_by": "calendar_user"},
        )
        self.assertEqual(deactivate_response.status_code, 200)
        self.assertFalse(deactivate_response.json()["is_active"])

        active_occurrences_response = self.client.get(
            "/user-events/occurrences",
            headers=self.user_headers,
            params={
                "window_start": "2026-05-14T00:00:00Z",
                "window_end": "2026-05-15T00:00:00Z",
            },
        )
        self.assertEqual(active_occurrences_response.status_code, 200)
        self.assertEqual(active_occurrences_response.json(), [])

        inactive_listing_response = self.client.get(
            "/user-events",
            headers=self.user_headers,
            params={"is_active": "false"},
        )
        self.assertEqual(inactive_listing_response.status_code, 200)
        self.assertEqual(len(inactive_listing_response.json()), 1)


if __name__ == "__main__":
    unittest.main()
