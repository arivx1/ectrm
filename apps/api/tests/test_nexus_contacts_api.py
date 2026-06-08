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
from apps.api.app.models.nexus_contact import NexusContact
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class NexusContactsApiTests(unittest.TestCase):
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
        self.now = datetime(2026, 6, 6, 18, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(NexusContact).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.commit()
        self.headers = {"Authorization": f"Bearer {self._create_session_token()}"}

    def test_manual_contacts_persist_in_nexus_contacts_table(self) -> None:
        response = self.client.post(
            "/integrations/nexus/contacts",
            json={
                "client_name": "Hartree",
                "name": "Jane Hartree",
                "title": "Scheduler",
                "first_name": "Jane",
                "last_name": "Hartree",
                "role": "Scheduler",
                "time_at_role": "2 years",
                "previous_role": "Analyst",
                "university": "Texas A&M",
                "university_2": "Rice",
                "location": "Houston, TX",
                "email": "jane.hartree@example.com",
            },
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 201)
        created = response.json()
        self.assertEqual(created["client_name"], "Hartree")
        self.assertEqual(created["name"], "Jane Hartree")
        self.assertEqual(created["first_name"], "Jane")
        self.assertEqual(created["last_name"], "Hartree")
        self.assertEqual(created["role"], "Scheduler")
        self.assertEqual(created["time_at_role"], "2 years")
        self.assertEqual(created["previous_role"], "Analyst")
        self.assertEqual(created["university"], "Texas A&M")
        self.assertEqual(created["university_2"], "Rice")
        self.assertEqual(created["location"], "Houston, TX")
        self.assertEqual(created["source"], "manual")
        self.assertTrue(created["contact_id"].startswith("nexus-contact-"))

        list_response = self.client.get("/integrations/nexus/contacts", headers=self.headers)
        self.assertEqual(list_response.status_code, 200)
        contacts = list_response.json()
        self.assertEqual(len(contacts), 1)
        self.assertEqual(contacts[0]["contact_id"], created["contact_id"])
        self.assertEqual(contacts[0]["email"], "jane.hartree@example.com")

        with self.SessionLocal() as session:
            rows = session.query(NexusContact).all()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].name, "Jane Hartree")
            self.assertEqual(rows[0].role, "Scheduler")
            self.assertEqual(rows[0].location, "Houston, TX")

    def test_attio_import_upserts_persisted_contacts(self) -> None:
        first_response = self.client.post(
            "/integrations/nexus/contacts/import-attio",
            json={
                "client_name": "Hartree",
                "contacts": [
                    {
                        "record_id": "person-hartree-1",
                        "name": "Alex Hartree",
                        "title": "Commercial lead",
                        "email": "alex.hartree@example.com",
                        "web_url": "https://app.attio.com/person-hartree-1",
                    }
                ],
            },
            headers=self.headers,
        )

        self.assertEqual(first_response.status_code, 200)
        imported = first_response.json()
        self.assertEqual(len(imported), 1)
        contact_id = imported[0]["contact_id"]
        self.assertEqual(contact_id, "nexus-attio-contact-hartree-person-hartree-1")
        self.assertEqual(imported[0]["source"], "attio")
        self.assertEqual(imported[0]["external_provider"], "attio")
        self.assertEqual(imported[0]["external_record_id"], "person-hartree-1")
        self.assertEqual(imported[0]["version"], 1)

        second_response = self.client.post(
            "/integrations/nexus/contacts/import-attio",
            json={
                "client_name": "Hartree",
                "contacts": [
                    {
                        "record_id": "person-hartree-1",
                        "name": "Alex Hartree",
                        "title": "Head of Commercial",
                        "email": "alex.hartree@example.com",
                        "phone": "+1 555 0100",
                        "web_url": "https://app.attio.com/person-hartree-1",
                    }
                ],
            },
            headers=self.headers,
        )

        self.assertEqual(second_response.status_code, 200)
        reimported = second_response.json()
        self.assertEqual(len(reimported), 1)
        self.assertEqual(reimported[0]["contact_id"], contact_id)
        self.assertEqual(reimported[0]["title"], "Head of Commercial")
        self.assertEqual(reimported[0]["phone"], "+1 555 0100")
        self.assertEqual(reimported[0]["version"], 2)

        list_response = self.client.get("/integrations/nexus/contacts", headers=self.headers)
        self.assertEqual(list_response.status_code, 200)
        contacts = list_response.json()
        self.assertEqual(len(contacts), 1)
        self.assertEqual(contacts[0]["contact_id"], contact_id)
        self.assertEqual(contacts[0]["title"], "Head of Commercial")

    def test_contacts_read_requires_authentication(self) -> None:
        response = self.client.get("/integrations/nexus/contacts")

        self.assertEqual(response.status_code, 401)

    def _create_session_token(
        self,
        *,
        user_id: str = "nexus_contacts_user",
        role: str = "OPS_ADMIN",
    ) -> str:
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id=user_id,
                email=f"{user_id}@example.com",
                display_name=user_id.replace("_", " ").title(),
                role=role,
                password_hash=hash_password("supersecret1"),
                is_active=True,
                last_login_at=self.now,
                created_at=self.now,
                created_by="test-suite",
                updated_at=self.now,
                updated_by="test-suite",
                version=1,
            )
            session.add(user)
            session.commit()
            _, token = create_user_session(session, user)
            return token


if __name__ == "__main__":
    unittest.main()
