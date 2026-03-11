from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.user_account import UserAccount
from apps.api.app.routes.users import (
    create_user,
    deactivate_user,
    get_user,
    list_users,
    reactivate_user,
    update_user,
)
from apps.api.app.schemas.user_account import (
    UserAccountCreate,
    UserAccountStatusUpdate,
    UserAccountUpdate,
)


class UserAccountsApiTests(unittest.TestCase):
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
            session.query(UserAccount).delete()
            session.commit()

    def test_user_account_lifecycle(self) -> None:
        with self.SessionLocal() as session:
            created = create_user(
                UserAccountCreate(
                    user_id="ops_lead",
                    email="ops@example.com",
                    display_name="Ops Lead",
                    role="ops_admin",
                    created_by="system",
                ),
                db=session,
            )
            self.assertEqual(created.role, "OPS_ADMIN")

            updated = update_user(
                "ops_lead",
                UserAccountUpdate(display_name="Operations Lead", updated_by="admin"),
                db=session,
            )
            self.assertEqual(updated.display_name, "Operations Lead")

            inactive = deactivate_user(
                "ops_lead",
                UserAccountStatusUpdate(updated_by="admin"),
                db=session,
            )
            self.assertFalse(inactive.is_active)

            active = reactivate_user(
                "ops_lead",
                UserAccountStatusUpdate(updated_by="admin"),
                db=session,
            )
            self.assertTrue(active.is_active)

            fetched = get_user("ops_lead", db=session)
            self.assertEqual(fetched.email, "ops@example.com")

            rows = list_users(q="operations", is_active=True, limit=50, offset=0, db=session)
            self.assertEqual([row.user_id for row in rows], ["ops_lead"])


if __name__ == "__main__":
    unittest.main()
