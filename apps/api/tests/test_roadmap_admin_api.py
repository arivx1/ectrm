from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.roadmap_document import RoadmapDocument
from apps.api.app.models.roadmap_document_revision import RoadmapDocumentRevision
from apps.api.app.routes.roadmap import (
    get_admin_roadmap_document,
    get_default_roadmap_document,
    get_roadmap_document,
    restore_admin_roadmap_document,
    update_admin_roadmap_document,
)
from apps.api.app.schemas.roadmap import RoadmapDocumentRestore, RoadmapDocumentUpdate


class RoadmapAdminApiTests(unittest.TestCase):
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
            session.query(RoadmapDocumentRevision).delete()
            session.query(RoadmapDocument).delete()
            session.commit()

    def test_admin_document_defaults_when_no_override_exists(self) -> None:
        with self.SessionLocal() as session:
            payload = get_admin_roadmap_document(db=session)

        self.assertTrue(payload.is_default)
        self.assertIsNone(payload.updated_at)
        self.assertEqual(payload.version, 0)
        self.assertEqual(payload.recent_revisions, [])
        self.assertEqual(payload.document.source_path, "docs/engineering/trading-source-roadmap.md")

    def test_update_and_restore_manage_revision_history(self) -> None:
        first_document = get_default_roadmap_document()
        first_document.phases[0].items[2].status = "blocked"
        first_document.phases[0].items[2].owner = "Operations Control"
        first_document.phases[0].items[2].target = "April 2026"

        second_document = get_default_roadmap_document()
        second_document.phases[0].items[2].status = "in_progress"
        second_document.phases[0].items[2].owner = "Settlement Desk"
        second_document.phases[0].items[2].target = "May 2026"

        with self.SessionLocal() as session:
            first_saved = update_admin_roadmap_document(
                RoadmapDocumentUpdate(document=first_document, updated_by="ops_admin"),
                db=session,
            )
            restored_revision_id = first_saved.recent_revisions[0].revision_id
            second_saved = update_admin_roadmap_document(
                RoadmapDocumentUpdate(document=second_document, updated_by="ops_admin"),
                db=session,
            )
            restored = restore_admin_roadmap_document(
                restored_revision_id,
                RoadmapDocumentRestore(updated_by="ops_admin"),
                db=session,
            )
            public = get_roadmap_document(db=session)

        self.assertFalse(first_saved.is_default)
        self.assertEqual(first_saved.updated_by, "ops_admin")
        self.assertEqual(first_saved.version, 1)
        self.assertIn("Operational books and records loop", first_saved.recent_revisions[0].change_summary[0])

        self.assertEqual(second_saved.version, 2)
        self.assertEqual(second_saved.recent_revisions[0].version, 2)

        self.assertEqual(restored.version, 3)
        self.assertEqual(restored.recent_revisions[0].restored_from_revision_id, restored_revision_id)
        self.assertEqual(restored.recent_revisions[0].change_summary[0], f"Restored from revision {restored_revision_id}.")

        self.assertEqual(public.phases[0].items[2].status, "blocked")
        self.assertEqual(public.phases[0].items[2].owner, "Operations Control")
        self.assertEqual(public.phases[0].items[2].target, "April 2026")


if __name__ == "__main__":
    unittest.main()
