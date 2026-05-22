from __future__ import annotations

import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.core.auth import hash_password, verify_password
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
                    password="supersecret1",
                    created_by="system",
                ),
                db=session,
            )
            self.assertEqual(created.role, "OPS_ADMIN")
            self.assertEqual(created.default_assistant_persona, "admin")
            self.assertTrue(created.password_set)

            updated = update_user(
                "ops_lead",
                UserAccountUpdate(
                    display_name="Operations Lead",
                    default_assistant_persona="risk",
                    updated_by="admin",
                ),
                db=session,
            )
            self.assertEqual(updated.display_name, "Operations Lead")
            self.assertEqual(updated.default_assistant_persona, "risk")

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
            self.assertEqual(fetched.default_assistant_persona, "risk")

            rows = list_users(q="operations", is_active=True, limit=50, offset=0, db=session)
            self.assertEqual([row.user_id for row in rows], ["ops_lead"])

    def test_duplicate_lookup_uses_normalized_identifier_and_email(self) -> None:
        with self.SessionLocal() as session:
            create_user(
                UserAccountCreate(
                    user_id="ops_lead",
                    email="ops@example.com",
                    display_name="Ops Lead",
                    role="ops_admin",
                    password="supersecret1",
                    created_by="system",
                ),
                db=session,
            )

            with self.assertRaises(HTTPException) as error:
                create_user(
                    UserAccountCreate(
                        user_id=" ops_lead ",
                        email=" ops@example.com ",
                        display_name="Ops Lead Two",
                        role="admin",
                        password="supersecret2",
                        created_by="system",
                    ),
                    db=session,
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(error.exception.detail, "User already exists")

    def test_schema_rejects_blank_normalized_fields(self) -> None:
        with self.assertRaises(ValidationError):
            UserAccountCreate(
                user_id="ops_lead",
                email="ops@example.com",
                display_name="   ",
                role="ops_admin",
                password="supersecret1",
                created_by="system",
            )

        with self.assertRaises(ValidationError):
            UserAccountUpdate(display_name="   ", updated_by="admin")

        with self.assertRaises(ValidationError):
            UserAccountUpdate(role="   ", updated_by="admin")

        with self.assertRaises(ValidationError):
            UserAccountUpdate(default_assistant_persona="unknown", updated_by="admin")

    def test_password_hash_requires_exact_non_blank_input(self) -> None:
        encoded = hash_password("supersecret1 ")

        self.assertTrue(verify_password("supersecret1 ", encoded))
        self.assertFalse(verify_password("supersecret1", encoded))
        self.assertFalse(verify_password("        ", encoded))

        with self.assertRaises(ValueError):
            hash_password("        ")


if __name__ == "__main__":
    unittest.main()
