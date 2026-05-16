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
from apps.api.app.core.auth import hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.models.wiki_page import WikiPage
from apps.api.app.models.wiki_page_revision import WikiPageRevision


class WikiApiTests(unittest.TestCase):
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
            session.query(WikiPageRevision).delete()
            session.query(WikiPage).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
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

    def _create_user(self, *, user_id: str, email: str, display_name: str, role: str = "TRADER") -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id=user_id,
                    email=email,
                    display_name=display_name,
                    role=role,
                    password_hash=hash_password("supersecret2"),
                    is_active=True,
                    last_login_at=now,
                    created_at=now,
                    created_by="ops_admin",
                    updated_at=now,
                    updated_by="ops_admin",
                    version=1,
                )
            )
            session.commit()

    def _login(self, *, identifier: str, password: str) -> str:
        response = self.client.post("/auth/session", json={"identifier": identifier, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def test_wiki_requires_authentication(self) -> None:
        response = self.client.get("/wiki/pages")
        self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/wiki/pages",
            json={"title": "Desk Notes", "content_markdown": "hello"},
        )
        self.assertEqual(response.status_code, 401)

    def test_wiki_page_crud_and_revision_restore(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]

        create_root = self.client.post(
            "/wiki/pages",
            json={
                "title": "Desk Handbook",
                "content_markdown": "# Welcome\n\nUse this wiki for trader and ops context.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_root.status_code, 201)
        root_payload = create_root.json()
        root_page_id = root_payload["page_id"]
        self.assertEqual(root_payload["title"], "Desk Handbook")
        self.assertEqual(root_payload["child_count"], 0)
        self.assertEqual(root_payload["version"], 1)
        self.assertEqual(root_payload["recent_revisions"][0]["change_summary"][0], "Created wiki page.")

        create_child = self.client.post(
            "/wiki/pages",
            json={
                "title": "Confirmations",
                "parent_page_id": root_page_id,
                "content_markdown": "- Review PDF\n- Compare economics\n- Clear mismatches",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(create_child.status_code, 201)
        child_payload = create_child.json()
        child_page_id = child_payload["page_id"]
        self.assertEqual(child_payload["parent_page_id"], root_page_id)

        page_index = self.client.get(
            "/wiki/pages",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(page_index.status_code, 200)
        index_payload = page_index.json()["pages"]
        self.assertEqual(len(index_payload), 2)
        root_summary = next(page for page in index_payload if page["page_id"] == root_page_id)
        self.assertEqual(root_summary["child_count"], 1)

        updated_child = self.client.patch(
            f"/wiki/pages/{child_page_id}",
            json={
                "title": "Confirmations Runbook",
                "content_markdown": "- Review PDF\n- Compare economics\n- Escalate only after mismatches are logged",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(updated_child.status_code, 200)
        updated_child_payload = updated_child.json()
        self.assertEqual(updated_child_payload["title"], "Confirmations Runbook")
        self.assertEqual(updated_child_payload["version"], 2)
        self.assertEqual(updated_child_payload["recent_revisions"][0]["change_summary"][0], "Renamed page to 'Confirmations Runbook'.")
        self.assertIn("Updated page content.", updated_child_payload["recent_revisions"][0]["change_summary"])

        created_revision_id = updated_child_payload["recent_revisions"][1]["revision_id"]

        restored_child = self.client.post(
            f"/wiki/pages/{child_page_id}/revisions/{created_revision_id}/restore",
            json={"restored_by": "ops_admin"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(restored_child.status_code, 200)
        restored_payload = restored_child.json()
        self.assertEqual(restored_payload["title"], "Confirmations")
        self.assertEqual(restored_payload["version"], 3)
        self.assertEqual(
            restored_payload["recent_revisions"][0]["change_summary"][0],
            f"Restored from revision {created_revision_id}.",
        )

    def test_wiki_prevents_parent_cycles(self) -> None:
        admin_session = self._bootstrap_admin()
        admin_token = admin_session["access_token"]

        root_response = self.client.post(
            "/wiki/pages",
            json={"title": "Root", "content_markdown": "root"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(root_response.status_code, 201)
        root_page_id = root_response.json()["page_id"]

        child_response = self.client.post(
            "/wiki/pages",
            json={"title": "Child", "parent_page_id": root_page_id, "content_markdown": "child"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(child_response.status_code, 201)
        child_page_id = child_response.json()["page_id"]

        response = self.client.patch(
            f"/wiki/pages/{root_page_id}",
            json={"parent_page_id": child_page_id},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("descendants", response.json()["detail"])

    def test_authenticated_non_admin_user_can_collaborate_on_wiki(self) -> None:
        self._bootstrap_admin()
        self._create_user(user_id="trader_1", email="trader@example.com", display_name="Trader One")
        trader_token = self._login(identifier="trader_1", password="supersecret2")

        response = self.client.post(
            "/wiki/pages",
            json={
                "title": "Shift Notes",
                "content_markdown": "Trader-authored note.",
            },
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["created_by"], "trader_1")


if __name__ == "__main__":
    unittest.main()
