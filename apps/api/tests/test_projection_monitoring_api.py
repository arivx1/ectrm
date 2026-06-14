from __future__ import annotations

import enum
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.admin.services.projection_monitoring import _resolve_email_recipients
from apps.api.app.models import Base
from apps.api.app.models.event import Event
from apps.api.app.models.roadmap_document import RoadmapDocument
from apps.api.app.models.roadmap_document_revision import RoadmapDocumentRevision
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.routes.admin_data import (
    get_projection_monitoring_status,
    run_projection_monitoring,
    update_projection_monitoring_status,
)
from apps.api.app.schemas.projection_monitoring import (
    TradeProjectionMonitoringRunRequest,
    TradeProjectionMonitoringUpdate,
)


class ProjectionMonitoringApiTests(unittest.TestCase):
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
            for model in (
                RoadmapDocumentRevision,
                RoadmapDocument,
                TradeWorkflowItem,
                TradeConfirmation,
                Trade,
                Event,
                UserAccount,
            ):
                session.query(model).delete()
            session.commit()
        self.now = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)

    def test_email_recipient_resolution_tolerates_older_user_profile_schema(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    CREATE TABLE user_accounts (
                        user_id VARCHAR(64) PRIMARY KEY,
                        email VARCHAR(255) NOT NULL,
                        display_name VARCHAR(160) NOT NULL,
                        role VARCHAR(50) NOT NULL,
                        is_active BOOLEAN NOT NULL
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    INSERT INTO user_accounts (user_id, email, display_name, role, is_active)
                    VALUES
                        ('ops-admin', 'OPS-ADMIN@example.com', 'Ops Admin', 'OPS_ADMIN', 1),
                        ('viewer', 'viewer@example.com', 'Viewer', 'VIEWER', 1),
                        ('inactive-admin', 'inactive@example.com', 'Inactive', 'OPS_ADMIN', 0)
                    """
                )
            )

        try:
            with SessionLocal() as session:
                self.assertEqual(_resolve_email_recipients(session), ["ops-admin@example.com"])
        finally:
            engine.dispose()

    def _seed_issue_mix(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="ops-admin",
                    email="ops-admin@example.com",
                    google_subject=None,
                    display_name="Ops Admin",
                    role="OPS_ADMIN",
                    password_hash=None,
                    is_active=True,
                    last_login_at=None,
                    created_at=self.now,
                    created_by="test-suite",
                    updated_at=self.now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.add(
                Trade(
                    trade_id="T-ORPHAN",
                    external_trade_id="EXT-T-ORPHAN",
                    source_system="TEST",
                    created_at=self.now,
                    updated_at=self.now,
                    execution_timestamp=self.now,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="CRUDE",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    confirmation_status="NOT_REQUIRED",
                    price_index_code=None,
                    price=75.25,
                    volume=1000,
                    settlement_status="PENDING",
                    trader_user="assistant_user",
                    status="ACTIVE",
                    last_event_id="evt-missing-orphan",
                )
            )
            session.add(
                Trade(
                    trade_id="T-HISTORY",
                    external_trade_id="EXT-T-HISTORY",
                    source_system="TEST",
                    created_at=self.now,
                    updated_at=self.now,
                    execution_timestamp=self.now,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="CRUDE",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    confirmation_status="NOT_REQUIRED",
                    price_index_code=None,
                    price=75.25,
                    volume=1000,
                    settlement_status="PENDING",
                    trader_user="assistant_user",
                    status="ACTIVE",
                    last_event_id="evt-missing-history",
                )
            )
            session.add(
                Event(
                    event_id="evt-present-history",
                    aggregate_type="trade",
                    aggregate_id="T-HISTORY",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    recorded_at=self.now,
                    actor_id="assistant_user",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={"trade_id": "T-HISTORY"},
                )
            )
            session.add(
                TradeConfirmation(
                    trade_id="T-ORPHAN",
                    source_document_id=None,
                    confirmation_number="CONF-T-ORPHAN",
                    status="SENT",
                    sent_at=None,
                    confirmed_at=None,
                    dispute_reason=None,
                    notes=None,
                    comparison_waiver_note=None,
                    comparison_waived_at=None,
                    comparison_waived_by=None,
                    created_at=self.now,
                    created_by="test-suite",
                    updated_at=self.now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.add(
                TradeWorkflowItem(
                    trade_id="T-ORPHAN",
                    workflow_type="CONFIRMATION",
                    status="PENDING",
                    owner=None,
                    due_at=None,
                    notes=None,
                    created_at=self.now,
                    created_by="test-suite",
                    updated_at=self.now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.commit()

    def _seed_invariant_only_issue(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="ops-admin",
                    email="ops-admin@example.com",
                    google_subject=None,
                    display_name="Ops Admin",
                    role="OPS_ADMIN",
                    password_hash=None,
                    is_active=True,
                    last_login_at=None,
                    created_at=self.now,
                    created_by="test-suite",
                    updated_at=self.now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.add(
                Event(
                    event_id="evt-invariant-anchor",
                    aggregate_type="trade",
                    aggregate_id="T-INVARIANT-ONLY",
                    event_type="TradeCreated",
                    occurred_at=self.now,
                    recorded_at=self.now,
                    actor_id="assistant_user",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={"trade_id": "T-INVARIANT-ONLY"},
                )
            )
            session.add(
                Trade(
                    trade_id="T-INVARIANT-ONLY",
                    external_trade_id="EXT-T-INVARIANT-ONLY",
                    source_system="TEST",
                    created_at=self.now,
                    updated_at=self.now,
                    execution_timestamp=self.now,
                    trade_nature="FINANCIAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="CRUDE",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    confirmation_status="PENDING",
                    actualization_status="NOT_REQUIRED",
                    price_index_code=None,
                    price=75.25,
                    volume=1000,
                    settlement_status="PENDING",
                    trader_user="assistant_user",
                    status="ACTIVE",
                    last_event_id="evt-invariant-anchor",
                )
            )
            session.commit()

    def test_monitoring_defaults_without_saved_policy(self) -> None:
        with self.SessionLocal() as session:
            payload = get_projection_monitoring_status(db=session)

        self.assertTrue(payload.is_default)
        self.assertEqual(payload.version, 0)
        self.assertEqual(payload.document.schedule.cadence_minutes, 240)
        self.assertTrue(payload.live_status.evaluation_due)
        self.assertEqual(payload.recent_alerts, [])
        self.assertEqual(payload.recent_deliveries, [])

    def test_monitoring_update_persists_policy_revision(self) -> None:
        with self.SessionLocal() as session:
            document = get_projection_monitoring_status(db=session).document
            document.schedule.cadence_minutes = 60
            document.schedule.max_cleanup_trades_per_run = 5
            document.alerting.minimum_alert_interval_minutes = 30

            saved = update_projection_monitoring_status(
                TradeProjectionMonitoringUpdate(
                    document=document,
                    updated_by="ops_admin",
                ),
                db=session,
            )

        self.assertFalse(saved.is_default)
        self.assertEqual(saved.updated_by, "ops_admin")
        self.assertEqual(saved.version, 1)
        self.assertEqual(saved.document.schedule.cadence_minutes, 60)
        self.assertIn("Cadence 240m -> 60m.", saved.recent_revisions[0].change_summary)

    def test_manual_run_auto_cleans_orphans_and_emits_alert_for_remaining_issues(self) -> None:
        self._seed_issue_mix()

        with self.SessionLocal() as session:
            result = run_projection_monitoring(
                TradeProjectionMonitoringRunRequest(
                    requested_by="ops-admin",
                    force=True,
                ),
                db=session,
            )
            status = get_projection_monitoring_status(db=session)
            remaining_trade_ids = [trade.trade_id for trade in session.query(Trade).order_by(Trade.trade_id.asc()).all()]

        self.assertTrue(result.executed)
        self.assertEqual(result.cycle_status, "issues_detected")
        self.assertEqual(result.auto_cleaned_trade_ids, ["T-ORPHAN"])
        self.assertEqual(result.issue_count_before, 2)
        self.assertEqual(result.issue_count_after, 1)
        self.assertEqual(len(result.emitted_alerts), 1)
        self.assertEqual(len(result.emitted_deliveries), 2)
        self.assertEqual(result.emitted_deliveries[0].channel, "ADMIN_WORKSPACE")
        self.assertEqual(result.emitted_deliveries[0].status, "delivered")
        self.assertEqual(result.emitted_deliveries[1].channel, "EMAIL")
        self.assertEqual(result.emitted_deliveries[1].status, "delivered")
        self.assertEqual(result.emitted_deliveries[1].target, "local-email-archive")
        self.assertEqual(result.emitted_deliveries[1].recipients, ["ops-admin@example.com"])
        self.assertEqual(status.runtime.last_issue_count, 1)
        self.assertEqual(status.runtime.last_structural_issue_count, 1)
        self.assertEqual(status.runtime.last_invariant_issue_count, 0)
        self.assertEqual(status.runtime.last_auto_cleaned_trade_ids, ["T-ORPHAN"])
        self.assertEqual(len(status.recent_alerts), 1)
        self.assertEqual(len(status.recent_deliveries), 2)
        self.assertEqual(remaining_trade_ids, ["T-HISTORY"])

    def test_manual_run_alerts_on_invariant_only_projection_drift(self) -> None:
        self._seed_invariant_only_issue()

        with self.SessionLocal() as session:
            document = get_projection_monitoring_status(db=session).document
            document.alerting.channels = ["ADMIN_WORKSPACE"]
            update_projection_monitoring_status(
                TradeProjectionMonitoringUpdate(
                    document=document,
                    updated_by="ops-admin",
                ),
                db=session,
            )

            result = run_projection_monitoring(
                TradeProjectionMonitoringRunRequest(
                    requested_by="ops-admin",
                    force=True,
                ),
                db=session,
            )
            status = get_projection_monitoring_status(db=session)

        self.assertTrue(result.executed)
        self.assertEqual(result.cycle_status, "issues_detected")
        self.assertEqual(result.issue_count_before, 2)
        self.assertEqual(result.structural_issue_count_before, 0)
        self.assertEqual(result.invariant_issue_count_before, 2)
        self.assertEqual(result.issue_count_after, 2)
        self.assertEqual(result.structural_issue_count_after, 0)
        self.assertEqual(result.invariant_issue_count_after, 2)
        self.assertEqual(result.auto_cleaned_trade_ids, [])
        self.assertEqual(len(result.emitted_alerts), 1)
        self.assertEqual(result.emitted_alerts[0].structural_issue_count, 0)
        self.assertEqual(result.emitted_alerts[0].invariant_issue_count, 2)
        self.assertIn("operational invariant", " ".join(result.emitted_alerts[0].messages))
        self.assertEqual(status.live_status.live_structural_issue_count, 0)
        self.assertEqual(status.live_status.live_invariant_issue_count, 2)
        self.assertTrue(status.live_status.should_alert)

    def test_repeated_run_respects_alert_cooldown(self) -> None:
        self._seed_issue_mix()

        with self.SessionLocal() as session:
            first = run_projection_monitoring(
                TradeProjectionMonitoringRunRequest(
                    requested_by="ops-admin",
                    force=True,
                ),
                db=session,
            )
            second = run_projection_monitoring(
                TradeProjectionMonitoringRunRequest(
                    requested_by="ops-admin",
                    force=True,
                ),
                db=session,
            )
            status = get_projection_monitoring_status(db=session)

        self.assertEqual(len(first.emitted_alerts), 1)
        self.assertEqual(len(first.emitted_deliveries), 2)
        self.assertEqual(second.emitted_alerts, [])
        self.assertEqual(second.emitted_deliveries, [])
        self.assertEqual(len(status.recent_alerts), 1)
        self.assertEqual(len(status.recent_deliveries), 2)

    def test_run_dispatches_slack_delivery_when_webhook_is_configured(self) -> None:
        self._seed_issue_mix()

        with self.SessionLocal() as session:
            document = get_projection_monitoring_status(db=session).document
            document.alerting.channels = ["SLACK"]
            update_projection_monitoring_status(
                TradeProjectionMonitoringUpdate(
                    document=document,
                    updated_by="ops-admin",
                ),
                db=session,
            )

            with (
                patch(
                    "apps.api.app.domains.admin.services.projection_monitoring.settings.PROJECTION_MONITORING_SLACK_WEBHOOK_URL",
                    "https://hooks.slack.test/services/abc123",
                ),
                patch(
                    "apps.api.app.domains.admin.services.projection_monitoring.httpx.post",
                    return_value=Mock(status_code=200, raise_for_status=Mock()),
                ) as post_mock,
            ):
                result = run_projection_monitoring(
                    TradeProjectionMonitoringRunRequest(
                        requested_by="ops-admin",
                        force=True,
                    ),
                    db=session,
                )

        self.assertEqual(len(result.emitted_alerts), 1)
        self.assertEqual(len(result.emitted_deliveries), 1)
        self.assertEqual(result.emitted_deliveries[0].channel, "SLACK")
        self.assertEqual(result.emitted_deliveries[0].status, "delivered")
        post_mock.assert_called_once()

    def test_run_delivers_incident_queue_locally_without_webhook(self) -> None:
        self._seed_issue_mix()

        with self.SessionLocal() as session:
            document = get_projection_monitoring_status(db=session).document
            document.alerting.channels = ["INCIDENT_QUEUE"]
            update_projection_monitoring_status(
                TradeProjectionMonitoringUpdate(
                    document=document,
                    updated_by="ops-admin",
                ),
                db=session,
            )

            result = run_projection_monitoring(
                TradeProjectionMonitoringRunRequest(
                    requested_by="ops-admin",
                    force=True,
                ),
                db=session,
            )

        self.assertEqual(len(result.emitted_alerts), 1)
        self.assertEqual(len(result.emitted_deliveries), 1)
        self.assertEqual(result.emitted_deliveries[0].channel, "INCIDENT_QUEUE")
        self.assertEqual(result.emitted_deliveries[0].status, "delivered")
        self.assertEqual(result.emitted_deliveries[0].target, "local-incident-queue:projection-monitoring")


if __name__ == "__main__":
    unittest.main()
