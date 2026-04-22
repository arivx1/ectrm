from __future__ import annotations

from dataclasses import dataclass
import smtplib
from email.message import EmailMessage
from time import perf_counter
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.core.auth import ADMIN_ROLES, normalize_role
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.domains.operations.services.trade_projection_integrity import (
    TradeProjectionIntegrityIssue,
    TradeProjectionInvariantIssue,
    cleanup_auto_cleanable_trade_projection_issues,
    list_trade_projection_integrity_issues,
    list_trade_projection_invariant_issues,
)
from apps.api.app.models.roadmap_document import RoadmapDocument
from apps.api.app.models.roadmap_document_revision import RoadmapDocumentRevision
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.projection_monitoring import (
    ProjectionMonitoringHealthStatus,
    TradeProjectionMonitoringAdminOut,
    TradeProjectionMonitoringAlertOut,
    TradeProjectionMonitoringAlertingOut,
    TradeProjectionMonitoringDeliveryOut,
    TradeProjectionMonitoringDocumentOut,
    TradeProjectionMonitoringLiveStatusOut,
    TradeProjectionMonitoringRevisionOut,
    TradeProjectionMonitoringRunResult,
    TradeProjectionMonitoringRuntimeOut,
    TradeProjectionMonitoringScheduleOut,
)


MONITORING_DOCUMENT_KEY = "projection_integrity_monitoring"
MONITORING_RUNTIME_KEY = "projection_integrity_monitoring_runtime"
MONITORING_ALERTS_KEY = "projection_integrity_monitoring_alerts"
MONITORING_DELIVERIES_KEY = "projection_integrity_monitoring_deliveries"
MONITORING_DELIVERY_ARCHIVE_KEY = "projection_integrity_monitoring_delivery_archive"
RECENT_REVISION_LIMIT = 6
RECENT_ALERT_LIMIT = 8
RECENT_DELIVERY_LIMIT = 10
MAX_STORED_ALERTS = 30
MAX_STORED_DELIVERIES = 60
MAX_STORED_ARCHIVE_ENTRIES = 80

logger = get_logger(__name__)


@dataclass(frozen=True)
class TradeProjectionMonitoringSnapshot:
    structural_issues: tuple[TradeProjectionIntegrityIssue, ...]
    invariant_issues: tuple[TradeProjectionInvariantIssue, ...]

    @property
    def issue_count(self) -> int:
        return self.structural_issue_count + self.invariant_issue_count

    @property
    def structural_issue_count(self) -> int:
        return len(self.structural_issues)

    @property
    def invariant_issue_count(self) -> int:
        return len(self.invariant_issues)

    @property
    def impacted_trade_ids(self) -> tuple[str, ...]:
        return tuple(
            sorted(
                {
                    issue.trade_id
                    for issue in (*self.structural_issues, *self.invariant_issues)
                }
            )
        )

    @property
    def impacted_trade_count(self) -> int:
        return len(self.impacted_trade_ids)


def get_default_trade_projection_monitoring_document() -> TradeProjectionMonitoringDocumentOut:
    return TradeProjectionMonitoringDocumentOut(
        schedule=TradeProjectionMonitoringScheduleOut(
            enabled=True,
            cadence_minutes=240,
            auto_clean_mode="clean_auto_cleanable",
            max_cleanup_trades_per_run=25,
        ),
        alerting=TradeProjectionMonitoringAlertingOut(
            enabled=True,
            issue_count_threshold=1,
            impacted_trade_threshold=1,
            minimum_alert_interval_minutes=60,
            channels=["ADMIN_WORKSPACE", "EMAIL"],
            routing_note="Route sustained projection drift to operations leadership and keep the admin workspace reviewed during desk hours.",
        ),
    )


def get_default_trade_projection_monitoring_runtime() -> TradeProjectionMonitoringRuntimeOut:
    return TradeProjectionMonitoringRuntimeOut()


def load_admin_trade_projection_monitoring(db: Session) -> TradeProjectionMonitoringAdminOut:
    document_record = db.get(RoadmapDocument, MONITORING_DOCUMENT_KEY)
    runtime_record = db.get(RoadmapDocument, MONITORING_RUNTIME_KEY)
    alerts_record = db.get(RoadmapDocument, MONITORING_ALERTS_KEY)
    deliveries_record = db.get(RoadmapDocument, MONITORING_DELIVERIES_KEY)
    document = _load_monitoring_document(document_record)
    runtime = _load_monitoring_runtime(runtime_record)
    recent_alerts = _load_monitoring_alerts(alerts_record)
    recent_deliveries = _load_monitoring_deliveries(deliveries_record)
    snapshot = _load_trade_projection_monitoring_snapshot(db)
    live_status = build_trade_projection_monitoring_live_status(
        document=document,
        runtime=runtime,
        snapshot=snapshot,
    )

    return TradeProjectionMonitoringAdminOut(
        document=document,
        updated_at=document_record.updated_at if document_record is not None else None,
        updated_by=document_record.updated_by if document_record is not None else None,
        version=document_record.version if document_record is not None else 0,
        is_default=document_record is None,
        recent_revisions=_load_recent_monitoring_revisions(db),
        runtime=runtime,
        recent_alerts=recent_alerts[:RECENT_ALERT_LIMIT],
        recent_deliveries=recent_deliveries[:RECENT_DELIVERY_LIMIT],
        live_status=live_status,
    )


def save_trade_projection_monitoring_document(
    db: Session,
    document: TradeProjectionMonitoringDocumentOut,
    *,
    updated_by: str,
) -> TradeProjectionMonitoringAdminOut:
    now = datetime.now(timezone.utc)
    record = db.get(RoadmapDocument, MONITORING_DOCUMENT_KEY)
    previous_document = _load_monitoring_document(record)
    next_version = 1 if record is None else record.version + 1
    payload = document.model_dump(mode="json")
    change_summary = _build_monitoring_change_summary(previous_document, document)

    if record is None:
        record = RoadmapDocument(
            document_key=MONITORING_DOCUMENT_KEY,
            payload=payload,
            updated_at=now,
            updated_by=updated_by,
            version=next_version,
        )
        db.add(record)
    else:
        record.payload = payload
        record.updated_at = now
        record.updated_by = updated_by
        record.version = next_version

    db.add(
        RoadmapDocumentRevision(
            document_key=MONITORING_DOCUMENT_KEY,
            version=next_version,
            payload=payload,
            change_summary=change_summary,
            created_at=now,
            created_by=updated_by,
            restored_from_revision_id=None,
        )
    )
    db.commit()
    return load_admin_trade_projection_monitoring(db)


def run_trade_projection_monitoring_cycle(
    db: Session,
    *,
    requested_by: str,
    force: bool = False,
    evaluated_at: datetime | None = None,
) -> TradeProjectionMonitoringRunResult:
    now = evaluated_at or datetime.now(timezone.utc)
    document_record = db.get(RoadmapDocument, MONITORING_DOCUMENT_KEY)
    runtime_record = db.get(RoadmapDocument, MONITORING_RUNTIME_KEY)
    alerts_record = db.get(RoadmapDocument, MONITORING_ALERTS_KEY)
    deliveries_record = db.get(RoadmapDocument, MONITORING_DELIVERIES_KEY)
    document = _load_monitoring_document(document_record)
    runtime = _load_monitoring_runtime(runtime_record)

    next_evaluation_at = _next_evaluation_at(document, runtime)
    if not force and not _evaluation_is_due(document, runtime, now):
        return TradeProjectionMonitoringRunResult(
            cycle_status="skipped",
            executed=False,
            requested_by=requested_by,
            evaluated_at=now,
            issue_count_before=runtime.last_issue_count,
            issue_count_after=runtime.last_issue_count,
            impacted_trade_count_after=runtime.last_impacted_trade_count,
            auto_cleaned_trade_ids=[],
            emitted_alerts=[],
            emitted_deliveries=[],
            summary=(
                "Projection monitoring skipped because the next scheduled evaluation is not due yet."
                if next_evaluation_at is None
                else f"Projection monitoring skipped until {next_evaluation_at.isoformat()}."
            ),
            next_evaluation_at=next_evaluation_at,
        )

    snapshot_before = _load_trade_projection_monitoring_snapshot(db)
    auto_cleaned_trade_ids: list[str] = []
    if document.schedule.auto_clean_mode == "clean_auto_cleanable":
        auto_cleaned_trade_ids = _collect_auto_cleanable_trade_ids(
            list(snapshot_before.structural_issues),
            limit=document.schedule.max_cleanup_trades_per_run,
        )
        if auto_cleaned_trade_ids:
            cleanup_auto_cleanable_trade_projection_issues(db, trade_ids=auto_cleaned_trade_ids)

    snapshot_after = _load_trade_projection_monitoring_snapshot(db)
    impacted_trade_count_after = snapshot_after.impacted_trade_count
    cycle_status = _resolve_cycle_status(snapshot_after, auto_cleaned_trade_ids)

    emitted_alerts = _emit_monitoring_alerts(
        db,
        record=alerts_record,
        document=document,
        runtime=runtime,
        snapshot=snapshot_after,
        auto_cleaned_trade_ids=auto_cleaned_trade_ids,
        created_at=now,
    )
    emitted_deliveries = _emit_monitoring_deliveries(
        db,
        record=deliveries_record,
        document=document,
        alerts=emitted_alerts,
        created_at=now,
    )

    runtime = runtime.model_copy(
        update={
            "last_evaluated_at": now,
            "last_evaluated_by": requested_by,
            "last_issue_count": snapshot_after.issue_count,
            "last_structural_issue_count": snapshot_after.structural_issue_count,
            "last_invariant_issue_count": snapshot_after.invariant_issue_count,
            "last_impacted_trade_count": impacted_trade_count_after,
            "last_auto_cleaned_trade_count": len(auto_cleaned_trade_ids),
            "last_auto_cleaned_trade_ids": list(auto_cleaned_trade_ids),
            "last_cycle_status": cycle_status,
            "last_alert_at": emitted_alerts[0].created_at if emitted_alerts else runtime.last_alert_at,
            "last_alert_reason": emitted_alerts[0].reason if emitted_alerts else runtime.last_alert_reason,
            "last_alert_severity": emitted_alerts[0].severity if emitted_alerts else runtime.last_alert_severity,
        }
    )
    _save_runtime_record(
        db,
        record=runtime_record,
        runtime=runtime,
        updated_by=requested_by,
        updated_at=now,
    )

    next_evaluation_at = _next_evaluation_at(document, runtime)
    summary = _build_cycle_summary(
        snapshot_after=snapshot_after,
        auto_cleaned_trade_ids=auto_cleaned_trade_ids,
        emitted_alerts=emitted_alerts,
        emitted_deliveries=emitted_deliveries,
    )
    return TradeProjectionMonitoringRunResult(
        cycle_status=cycle_status,
            executed=True,
            requested_by=requested_by,
            evaluated_at=now,
            issue_count_before=snapshot_before.issue_count,
            issue_count_after=snapshot_after.issue_count,
            structural_issue_count_before=snapshot_before.structural_issue_count,
            invariant_issue_count_before=snapshot_before.invariant_issue_count,
            structural_issue_count_after=snapshot_after.structural_issue_count,
            invariant_issue_count_after=snapshot_after.invariant_issue_count,
            impacted_trade_count_after=impacted_trade_count_after,
            auto_cleaned_trade_ids=auto_cleaned_trade_ids,
        emitted_alerts=emitted_alerts,
        emitted_deliveries=emitted_deliveries,
        summary=summary,
        next_evaluation_at=next_evaluation_at,
    )


def build_trade_projection_monitoring_live_status(
    *,
    document: TradeProjectionMonitoringDocumentOut,
    runtime: TradeProjectionMonitoringRuntimeOut,
    snapshot: TradeProjectionMonitoringSnapshot,
) -> TradeProjectionMonitoringLiveStatusOut:
    now = datetime.now(timezone.utc)
    next_evaluation_at = _next_evaluation_at(document, runtime)
    evaluation_due = _evaluation_is_due(document, runtime, now)
    live_issue_count = snapshot.issue_count
    live_impacted_trade_count = snapshot.impacted_trade_count
    alert_messages: list[str] = []

    health_status: ProjectionMonitoringHealthStatus = "disabled"
    if document.schedule.enabled or document.alerting.enabled:
        health_status = "healthy"

    if evaluation_due and document.schedule.enabled:
        alert_messages.append("Projection monitoring is due for a fresh evaluation.")
        health_status = "attention"

    if live_issue_count > 0:
        alert_messages.append(
            f"{live_issue_count} projection finding{'s' if live_issue_count != 1 else ''} remain across {live_impacted_trade_count} trade{'s' if live_impacted_trade_count != 1 else ''}."
        )
        if snapshot.structural_issue_count:
            alert_messages.append(
                f"{snapshot.structural_issue_count} structural linkage finding{'s' if snapshot.structural_issue_count != 1 else ''} need projection-store attention."
            )
        if snapshot.invariant_issue_count:
            alert_messages.append(
                f"{snapshot.invariant_issue_count} operational invariant finding{'s' if snapshot.invariant_issue_count != 1 else ''} need workflow or rollup reconciliation."
            )
        health_status = "attention"

    should_alert = _issues_meet_alert_threshold(document, live_issue_count, live_impacted_trade_count)
    if should_alert:
        alert_messages.append("Current findings meet the configured alert threshold.")
        health_status = "critical"

    return TradeProjectionMonitoringLiveStatusOut(
        health_status=health_status,
        evaluation_due=evaluation_due,
        next_evaluation_at=next_evaluation_at,
        live_issue_count=live_issue_count,
        live_structural_issue_count=snapshot.structural_issue_count,
        live_invariant_issue_count=snapshot.invariant_issue_count,
        live_impacted_trade_count=live_impacted_trade_count,
        should_alert=should_alert,
        alert_messages=alert_messages,
        last_evaluated_at=runtime.last_evaluated_at,
        last_evaluated_by=runtime.last_evaluated_by,
        last_alert_at=runtime.last_alert_at,
        last_alert_reason=runtime.last_alert_reason,
    )


def _load_monitoring_document(record: RoadmapDocument | None) -> TradeProjectionMonitoringDocumentOut:
    if record is None:
        return get_default_trade_projection_monitoring_document()
    return TradeProjectionMonitoringDocumentOut.model_validate(record.payload)


def _load_monitoring_runtime(record: RoadmapDocument | None) -> TradeProjectionMonitoringRuntimeOut:
    if record is None:
        return get_default_trade_projection_monitoring_runtime()
    return TradeProjectionMonitoringRuntimeOut.model_validate(record.payload)


def _load_monitoring_alerts(record: RoadmapDocument | None) -> list[TradeProjectionMonitoringAlertOut]:
    if record is None:
        return []
    payload = record.payload if isinstance(record.payload, dict) else {}
    alerts = payload.get("alerts", [])
    if not isinstance(alerts, list):
        return []
    return [
        TradeProjectionMonitoringAlertOut.model_validate(alert)
        for alert in alerts
        if isinstance(alert, dict)
    ]


def _load_monitoring_deliveries(record: RoadmapDocument | None) -> list[TradeProjectionMonitoringDeliveryOut]:
    if record is None:
        return []
    payload = record.payload if isinstance(record.payload, dict) else {}
    deliveries = payload.get("deliveries", [])
    if not isinstance(deliveries, list):
        return []
    return [
        TradeProjectionMonitoringDeliveryOut.model_validate(delivery)
        for delivery in deliveries
        if isinstance(delivery, dict)
    ]


def _evaluation_is_due(
    document: TradeProjectionMonitoringDocumentOut,
    runtime: TradeProjectionMonitoringRuntimeOut,
    now: datetime,
) -> bool:
    if not document.schedule.enabled:
        return False
    next_run = _next_evaluation_at(document, runtime)
    return next_run is None or now >= next_run


def _next_evaluation_at(
    document: TradeProjectionMonitoringDocumentOut,
    runtime: TradeProjectionMonitoringRuntimeOut,
) -> datetime | None:
    if not document.schedule.enabled:
        return None
    if runtime.last_evaluated_at is None:
        return None
    return runtime.last_evaluated_at + timedelta(minutes=document.schedule.cadence_minutes)


def _load_trade_projection_monitoring_snapshot(db: Session) -> TradeProjectionMonitoringSnapshot:
    return TradeProjectionMonitoringSnapshot(
        structural_issues=tuple(list_trade_projection_integrity_issues(db)),
        invariant_issues=tuple(list_trade_projection_invariant_issues(db)),
    )


def _collect_auto_cleanable_trade_ids(
    issues: list[TradeProjectionIntegrityIssue],
    *,
    limit: int,
) -> list[str]:
    trade_ids = [issue.trade_id for issue in issues if issue.is_auto_cleanable]
    if limit <= 0:
        return []
    return trade_ids[:limit]


def _resolve_cycle_status(
    snapshot_after: TradeProjectionMonitoringSnapshot,
    auto_cleaned_trade_ids: list[str],
) -> str:
    if snapshot_after.issue_count == 0 and auto_cleaned_trade_ids:
        return "issues_auto_cleaned"
    if snapshot_after.issue_count:
        return "issues_detected"
    return "healthy"


def _emit_monitoring_alerts(
    db: Session,
    *,
    record: RoadmapDocument | None,
    document: TradeProjectionMonitoringDocumentOut,
    runtime: TradeProjectionMonitoringRuntimeOut,
    snapshot: TradeProjectionMonitoringSnapshot,
    auto_cleaned_trade_ids: list[str],
    created_at: datetime,
) -> list[TradeProjectionMonitoringAlertOut]:
    issue_count = snapshot.issue_count
    impacted_trade_count = snapshot.impacted_trade_count
    if not _issues_meet_alert_threshold(document, issue_count, impacted_trade_count):
        return []

    reason = "issue_threshold_exceeded"
    if not _alert_interval_allows_emit(document, runtime, created_at, reason):
        return []

    messages = [
        f"{issue_count} projection finding{'s' if issue_count != 1 else ''} remain after monitoring.",
        f"{impacted_trade_count} trade{'s' if impacted_trade_count != 1 else ''} are currently impacted.",
    ]
    if snapshot.structural_issue_count:
        messages.append(
            f"{snapshot.structural_issue_count} structural linkage finding{'s' if snapshot.structural_issue_count != 1 else ''} remain."
        )
    if snapshot.invariant_issue_count:
        messages.append(
            f"{snapshot.invariant_issue_count} operational invariant finding{'s' if snapshot.invariant_issue_count != 1 else ''} remain."
        )
    if auto_cleaned_trade_ids:
        messages.append(
            f"Automated cleanup removed {len(auto_cleaned_trade_ids)} auto-cleanable orphan trade projection row{'s' if len(auto_cleaned_trade_ids) != 1 else ''}."
        )

    alert = TradeProjectionMonitoringAlertOut(
        alert_id=str(uuid4()),
        created_at=created_at,
        severity="critical",
        reason=reason,
        messages=messages,
        channels=list(document.alerting.channels),
        issue_count=issue_count,
        structural_issue_count=snapshot.structural_issue_count,
        invariant_issue_count=snapshot.invariant_issue_count,
        impacted_trade_count=impacted_trade_count,
        auto_cleaned_trade_ids=list(auto_cleaned_trade_ids),
    )
    _save_alerts_record(db, record=record, alerts=[alert, *_load_monitoring_alerts(record)])
    return [alert]


def _emit_monitoring_deliveries(
    db: Session,
    *,
    record: RoadmapDocument | None,
    document: TradeProjectionMonitoringDocumentOut,
    alerts: list[TradeProjectionMonitoringAlertOut],
    created_at: datetime,
) -> list[TradeProjectionMonitoringDeliveryOut]:
    if not alerts:
        return []

    existing_deliveries = _load_monitoring_deliveries(record)
    emitted_deliveries: list[TradeProjectionMonitoringDeliveryOut] = []
    for alert in alerts:
        title = _build_delivery_title(alert)
        body = _build_delivery_body(document=document, alert=alert)
        for channel in alert.channels:
            emitted_deliveries.append(
                _dispatch_monitoring_delivery(
                    db,
                    alert=alert,
                    channel=channel,
                    title=title,
                    body=body,
                    created_at=created_at,
                )
            )

    _save_deliveries_record(
        db,
        record=record,
        deliveries=[*emitted_deliveries, *existing_deliveries],
        created_at=created_at,
    )
    return emitted_deliveries


def _dispatch_monitoring_delivery(
    db: Session,
    *,
    alert: TradeProjectionMonitoringAlertOut,
    channel: str,
    title: str,
    body: str,
    created_at: datetime,
) -> TradeProjectionMonitoringDeliveryOut:
    if channel == "ADMIN_WORKSPACE":
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="ADMIN_WORKSPACE",
            status="delivered",
            target="admin-workspace",
            title=title,
            body=body,
            recipients=[],
            created_at=created_at,
            delivered_at=created_at,
            error=None,
        )
    if channel == "EMAIL":
        return _dispatch_email_delivery(
            db,
            alert=alert,
            title=title,
            body=body,
            created_at=created_at,
        )
    if channel == "SLACK":
        return _dispatch_slack_delivery(
            db,
            alert=alert,
            title=title,
            body=body,
            created_at=created_at,
        )
    if channel == "INCIDENT_QUEUE":
        return _dispatch_incident_queue_delivery(
            db,
            alert=alert,
            title=title,
            body=body,
            created_at=created_at,
        )
    return TradeProjectionMonitoringDeliveryOut(
        delivery_id=str(uuid4()),
        alert_id=alert.alert_id,
        channel="ADMIN_WORKSPACE",
        status="skipped",
        target="unsupported-channel",
        title=title,
        body=body,
        recipients=[],
        created_at=created_at,
        delivered_at=None,
        error=f"Unsupported alert channel {channel}.",
    )


def _dispatch_email_delivery(
    db: Session,
    *,
    alert: TradeProjectionMonitoringAlertOut,
    title: str,
    body: str,
    created_at: datetime,
) -> TradeProjectionMonitoringDeliveryOut:
    recipients = _resolve_email_recipients(db)
    if not recipients:
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="EMAIL",
            status="failed",
            target="smtp-outbox",
            title=title,
            body=body,
            recipients=[],
            created_at=created_at,
            delivered_at=None,
            error="No active admin email recipients are configured for projection monitoring.",
        )

    smtp_host = settings.PROJECTION_MONITORING_EMAIL_SMTP_HOST.strip()
    if not smtp_host:
        _archive_local_delivery(
            db,
            archive_type="email",
            channel="EMAIL",
            target="local-email-archive",
            recipients=recipients,
            title=title,
            body=body,
            created_at=created_at,
            alert_id=alert.alert_id,
        )
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="EMAIL",
            status="delivered",
            target="local-email-archive",
            title=title,
            body=body,
            recipients=recipients,
            created_at=created_at,
            delivered_at=created_at,
            error=None,
        )

    smtp_port = settings.PROJECTION_MONITORING_EMAIL_SMTP_PORT
    smtp_target = f"smtp://{smtp_host}:{smtp_port}"
    sender = settings.PROJECTION_MONITORING_EMAIL_FROM.strip() or "projection-monitoring@localhost"
    message = EmailMessage()
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message["Subject"] = title
    message.set_content(body)

    started_at = perf_counter()
    try:
        with smtplib.SMTP(
            smtp_host,
            smtp_port,
            timeout=settings.PROJECTION_MONITORING_EMAIL_TIMEOUT_SECONDS,
        ) as client:
            if settings.PROJECTION_MONITORING_EMAIL_SMTP_USE_STARTTLS:
                client.starttls()
            username = settings.PROJECTION_MONITORING_EMAIL_SMTP_USERNAME.strip()
            if username:
                client.login(username, settings.PROJECTION_MONITORING_EMAIL_SMTP_PASSWORD)
            client.send_message(message)
        log_outbound_request(
            logger,
            provider="projection-monitoring-email",
            method="SMTP",
            url=smtp_target,
            status_code=250,
            duration_ms=(perf_counter() - started_at) * 1000,
        )
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="EMAIL",
            status="delivered",
            target=smtp_target,
            title=title,
            body=body,
            recipients=recipients,
            created_at=created_at,
            delivered_at=created_at,
            error=None,
        )
    except Exception as exc:  # pragma: no cover - network failures are mocked in tests
        log_outbound_request(
            logger,
            provider="projection-monitoring-email",
            method="SMTP",
            url=smtp_target,
            status_code=None,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc,
        )
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="EMAIL",
            status="failed",
            target=smtp_target,
            title=title,
            body=body,
            recipients=recipients,
            created_at=created_at,
            delivered_at=None,
            error=str(exc),
        )


def _dispatch_slack_delivery(
    db: Session,
    *,
    alert: TradeProjectionMonitoringAlertOut,
    title: str,
    body: str,
    created_at: datetime,
) -> TradeProjectionMonitoringDeliveryOut:
    webhook_url = settings.PROJECTION_MONITORING_SLACK_WEBHOOK_URL.strip()
    target = settings.PROJECTION_MONITORING_SLACK_CHANNEL.strip() or "#projection-monitoring"
    if not webhook_url:
        _archive_local_delivery(
            db,
            archive_type="slack",
            channel="SLACK",
            target=target,
            recipients=[],
            title=title,
            body=body,
            created_at=created_at,
            alert_id=alert.alert_id,
        )
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="SLACK",
            status="delivered",
            target=f"local-slack-archive:{target}",
            title=title,
            body=body,
            recipients=[],
            created_at=created_at,
            delivered_at=created_at,
            error=None,
        )

    started_at = perf_counter()
    payload = {"text": f"{title}\n{body}"}
    try:
        response = httpx.post(
            webhook_url,
            json=payload,
            timeout=settings.PROJECTION_MONITORING_SLACK_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        log_outbound_request(
            logger,
            provider="projection-monitoring-slack",
            method="POST",
            url=webhook_url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
        )
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="SLACK",
            status="delivered",
            target=target,
            title=title,
            body=body,
            recipients=[],
            created_at=created_at,
            delivered_at=created_at,
            error=None,
        )
    except Exception as exc:  # pragma: no cover - network failures are mocked in tests
        log_outbound_request(
            logger,
            provider="projection-monitoring-slack",
            method="POST",
            url=webhook_url,
            status_code=None,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc,
        )
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="SLACK",
            status="failed",
            target=target,
            title=title,
            body=body,
            recipients=[],
            created_at=created_at,
            delivered_at=None,
            error=str(exc),
        )


def _dispatch_incident_queue_delivery(
    db: Session,
    *,
    alert: TradeProjectionMonitoringAlertOut,
    title: str,
    body: str,
    created_at: datetime,
) -> TradeProjectionMonitoringDeliveryOut:
    queue_name = settings.PROJECTION_MONITORING_INCIDENT_QUEUE_NAME.strip() or "projection-monitoring"
    webhook_url = settings.PROJECTION_MONITORING_INCIDENT_WEBHOOK_URL.strip()
    if not webhook_url:
        _archive_local_delivery(
            db,
            archive_type="incident",
            channel="INCIDENT_QUEUE",
            target=queue_name,
            recipients=[],
            title=title,
            body=body,
            created_at=created_at,
            alert_id=alert.alert_id,
        )
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="INCIDENT_QUEUE",
            status="delivered",
            target=f"local-incident-queue:{queue_name}",
            title=title,
            body=body,
            recipients=[],
            created_at=created_at,
            delivered_at=created_at,
            error=None,
        )

    started_at = perf_counter()
    payload = {
        "queue": queue_name,
        "alert_id": alert.alert_id,
        "severity": alert.severity,
        "title": title,
        "body": body,
        "issue_count": alert.issue_count,
        "impacted_trade_count": alert.impacted_trade_count,
    }
    try:
        response = httpx.post(
            webhook_url,
            json=payload,
            timeout=settings.PROJECTION_MONITORING_INCIDENT_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        log_outbound_request(
            logger,
            provider="projection-monitoring-incident",
            method="POST",
            url=webhook_url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
        )
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="INCIDENT_QUEUE",
            status="delivered",
            target=queue_name,
            title=title,
            body=body,
            recipients=[],
            created_at=created_at,
            delivered_at=created_at,
            error=None,
        )
    except Exception as exc:  # pragma: no cover - network failures are mocked in tests
        log_outbound_request(
            logger,
            provider="projection-monitoring-incident",
            method="POST",
            url=webhook_url,
            status_code=None,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc,
        )
        return TradeProjectionMonitoringDeliveryOut(
            delivery_id=str(uuid4()),
            alert_id=alert.alert_id,
            channel="INCIDENT_QUEUE",
            status="failed",
            target=queue_name,
            title=title,
            body=body,
            recipients=[],
            created_at=created_at,
            delivered_at=None,
            error=str(exc),
        )


def _resolve_email_recipients(db: Session) -> list[str]:
    configured_recipients = settings.projection_monitoring_email_recipients
    if configured_recipients:
        return configured_recipients

    records = db.execute(
        select(UserAccount)
        .where(UserAccount.is_active.is_(True))
        .order_by(UserAccount.display_name.asc(), UserAccount.user_id.asc())
    ).scalars().all()
    recipients: list[str] = []
    seen: set[str] = set()
    for record in records:
        if normalize_role(record.role) not in ADMIN_ROLES:
            continue
        email = record.email.strip().lower()
        if not email or email in seen:
            continue
        recipients.append(email)
        seen.add(email)
    return recipients


def _build_delivery_title(alert: TradeProjectionMonitoringAlertOut) -> str:
    return (
        "Projection monitoring alert: "
        f"{alert.issue_count} issue{'s' if alert.issue_count != 1 else ''} "
        f"across {alert.impacted_trade_count} trade{'s' if alert.impacted_trade_count != 1 else ''}"
    )


def _build_delivery_body(
    *,
    document: TradeProjectionMonitoringDocumentOut,
    alert: TradeProjectionMonitoringAlertOut,
) -> str:
    body_lines = [
        f"Severity: {alert.severity}",
        f"Reason: {alert.reason.replace('_', ' ')}",
        f"Finding mix: {alert.structural_issue_count} structural, {alert.invariant_issue_count} invariant",
        *alert.messages,
    ]
    if alert.auto_cleaned_trade_ids:
        body_lines.append(f"Auto-cleaned trades: {', '.join(alert.auto_cleaned_trade_ids)}")
    if document.alerting.routing_note.strip():
        body_lines.append(f"Routing note: {document.alerting.routing_note.strip()}")
    return "\n".join(body_lines)


def _archive_local_delivery(
    db: Session,
    *,
    archive_type: str,
    channel: str,
    target: str,
    recipients: list[str],
    title: str,
    body: str,
    created_at: datetime,
    alert_id: str,
) -> None:
    record = db.get(RoadmapDocument, MONITORING_DELIVERY_ARCHIVE_KEY)
    payload = record.payload if record is not None and isinstance(record.payload, dict) else {}
    entries = payload.get("entries", [])
    if not isinstance(entries, list):
        entries = []
    entries = [
        {
            "archive_id": str(uuid4()),
            "archive_type": archive_type,
            "channel": channel,
            "target": target,
            "recipients": list(recipients),
            "title": title,
            "body": body,
            "alert_id": alert_id,
            "created_at": created_at.isoformat(),
        },
        *[entry for entry in entries if isinstance(entry, dict)],
    ][:MAX_STORED_ARCHIVE_ENTRIES]
    _save_monitoring_archive_record(db, record=record, entries=entries, created_at=created_at)


def _issues_meet_alert_threshold(
    document: TradeProjectionMonitoringDocumentOut,
    issue_count: int,
    impacted_trade_count: int,
) -> bool:
    if not document.alerting.enabled or (issue_count == 0 and impacted_trade_count == 0):
        return False
    issue_threshold = document.alerting.issue_count_threshold
    trade_threshold = document.alerting.impacted_trade_threshold
    return (
        (issue_threshold == 0 or issue_count >= issue_threshold)
        or (trade_threshold == 0 or impacted_trade_count >= trade_threshold)
    )


def _alert_interval_allows_emit(
    document: TradeProjectionMonitoringDocumentOut,
    runtime: TradeProjectionMonitoringRuntimeOut,
    created_at: datetime,
    reason: str,
) -> bool:
    minimum_interval = document.alerting.minimum_alert_interval_minutes
    if runtime.last_alert_at is None or runtime.last_alert_reason != reason or minimum_interval <= 0:
        return True
    return created_at >= runtime.last_alert_at + timedelta(minutes=minimum_interval)


def _save_runtime_record(
    db: Session,
    *,
    record: RoadmapDocument | None,
    runtime: TradeProjectionMonitoringRuntimeOut,
    updated_by: str,
    updated_at: datetime,
) -> None:
    payload = runtime.model_dump(mode="json")
    next_version = 1 if record is None else record.version + 1
    if record is None:
        db.add(
            RoadmapDocument(
                document_key=MONITORING_RUNTIME_KEY,
                payload=payload,
                updated_at=updated_at,
                updated_by=updated_by,
                version=next_version,
            )
        )
    else:
        record.payload = payload
        record.updated_at = updated_at
        record.updated_by = updated_by
        record.version = next_version
    db.commit()


def _save_alerts_record(
    db: Session,
    *,
    record: RoadmapDocument | None,
    alerts: list[TradeProjectionMonitoringAlertOut],
) -> None:
    persisted_alerts = [alert.model_dump(mode="json") for alert in alerts[:MAX_STORED_ALERTS]]
    payload = {"alerts": persisted_alerts}
    now = alerts[0].created_at if alerts else datetime.now(timezone.utc)
    next_version = 1 if record is None else record.version + 1
    if record is None:
        db.add(
            RoadmapDocument(
                document_key=MONITORING_ALERTS_KEY,
                payload=payload,
                updated_at=now,
                updated_by="projection_monitoring",
                version=next_version,
            )
        )
    else:
        record.payload = payload
        record.updated_at = now
        record.updated_by = "projection_monitoring"
        record.version = next_version


def _save_deliveries_record(
    db: Session,
    *,
    record: RoadmapDocument | None,
    deliveries: list[TradeProjectionMonitoringDeliveryOut],
    created_at: datetime,
) -> None:
    persisted_deliveries = [delivery.model_dump(mode="json") for delivery in deliveries[:MAX_STORED_DELIVERIES]]
    payload = {"deliveries": persisted_deliveries}
    next_version = 1 if record is None else record.version + 1
    if record is None:
        db.add(
            RoadmapDocument(
                document_key=MONITORING_DELIVERIES_KEY,
                payload=payload,
                updated_at=created_at,
                updated_by="projection_monitoring",
                version=next_version,
            )
        )
    else:
        record.payload = payload
        record.updated_at = created_at
        record.updated_by = "projection_monitoring"
        record.version = next_version


def _save_monitoring_archive_record(
    db: Session,
    *,
    record: RoadmapDocument | None,
    entries: list[dict[str, object]],
    created_at: datetime,
) -> None:
    payload = {"entries": entries[:MAX_STORED_ARCHIVE_ENTRIES]}
    next_version = 1 if record is None else record.version + 1
    if record is None:
        db.add(
            RoadmapDocument(
                document_key=MONITORING_DELIVERY_ARCHIVE_KEY,
                payload=payload,
                updated_at=created_at,
                updated_by="projection_monitoring",
                version=next_version,
            )
        )
    else:
        record.payload = payload
        record.updated_at = created_at
        record.updated_by = "projection_monitoring"
        record.version = next_version


def _load_recent_monitoring_revisions(
    db: Session,
    *,
    limit: int = RECENT_REVISION_LIMIT,
) -> list[TradeProjectionMonitoringRevisionOut]:
    rows = db.execute(
        select(RoadmapDocumentRevision)
        .where(RoadmapDocumentRevision.document_key == MONITORING_DOCUMENT_KEY)
        .order_by(RoadmapDocumentRevision.version.desc(), RoadmapDocumentRevision.revision_id.desc())
        .limit(limit)
    ).scalars().all()
    return [
        TradeProjectionMonitoringRevisionOut(
            revision_id=row.revision_id,
            version=row.version,
            created_at=row.created_at,
            created_by=row.created_by,
            change_summary=list(row.change_summary),
            restored_from_revision_id=row.restored_from_revision_id,
        )
        for row in rows
    ]


def _build_monitoring_change_summary(
    previous_document: TradeProjectionMonitoringDocumentOut,
    next_document: TradeProjectionMonitoringDocumentOut,
) -> list[str]:
    changes: list[str] = []
    if previous_document.schedule.enabled != next_document.schedule.enabled:
        changes.append(
            f"Monitoring schedule {'enabled' if next_document.schedule.enabled else 'disabled'}."
        )
    if previous_document.schedule.cadence_minutes != next_document.schedule.cadence_minutes:
        changes.append(
            f"Cadence {previous_document.schedule.cadence_minutes}m -> {next_document.schedule.cadence_minutes}m."
        )
    if previous_document.schedule.auto_clean_mode != next_document.schedule.auto_clean_mode:
        changes.append(
            f"Auto-clean mode {previous_document.schedule.auto_clean_mode} -> {next_document.schedule.auto_clean_mode}."
        )
    if (
        previous_document.schedule.max_cleanup_trades_per_run
        != next_document.schedule.max_cleanup_trades_per_run
    ):
        changes.append(
            "Max cleanup trade scope "
            f"{previous_document.schedule.max_cleanup_trades_per_run} -> {next_document.schedule.max_cleanup_trades_per_run}."
        )
    if previous_document.alerting.enabled != next_document.alerting.enabled:
        changes.append(
            f"Alerting {'enabled' if next_document.alerting.enabled else 'disabled'}."
        )
    if previous_document.alerting.issue_count_threshold != next_document.alerting.issue_count_threshold:
        changes.append(
            "Issue alert threshold "
            f"{previous_document.alerting.issue_count_threshold} -> {next_document.alerting.issue_count_threshold}."
        )
    if previous_document.alerting.impacted_trade_threshold != next_document.alerting.impacted_trade_threshold:
        changes.append(
            "Impacted trade threshold "
            f"{previous_document.alerting.impacted_trade_threshold} -> {next_document.alerting.impacted_trade_threshold}."
        )
    if previous_document.alerting.minimum_alert_interval_minutes != next_document.alerting.minimum_alert_interval_minutes:
        changes.append(
            "Alert cooldown "
            f"{previous_document.alerting.minimum_alert_interval_minutes}m -> {next_document.alerting.minimum_alert_interval_minutes}m."
        )
    if previous_document.alerting.channels != next_document.alerting.channels:
        changes.append("Alert channel routing updated.")
    if previous_document.alerting.routing_note != next_document.alerting.routing_note:
        changes.append("Alert routing note updated.")
    return changes or ["Monitoring policy saved without field-level changes."]


def _build_cycle_summary(
    *,
    snapshot_after: TradeProjectionMonitoringSnapshot,
    auto_cleaned_trade_ids: list[str],
    emitted_alerts: list[TradeProjectionMonitoringAlertOut],
    emitted_deliveries: list[TradeProjectionMonitoringDeliveryOut],
) -> str:
    issue_count = snapshot_after.issue_count
    if issue_count == 0 and not auto_cleaned_trade_ids:
        return "Projection monitoring found no projection issues."
    if issue_count == 0:
        return (
            f"Projection monitoring auto-cleaned {len(auto_cleaned_trade_ids)} orphan trade"
            f"{'s' if len(auto_cleaned_trade_ids) != 1 else ''} and left no remaining issues."
        )

    summary = (
        f"Projection monitoring found {issue_count} remaining issue"
        f"{'s' if issue_count != 1 else ''} across {snapshot_after.impacted_trade_count} trade"
        f"{'s' if snapshot_after.impacted_trade_count != 1 else ''}."
    )
    if snapshot_after.structural_issue_count or snapshot_after.invariant_issue_count:
        summary += (
            f" Mix: {snapshot_after.structural_issue_count} structural, "
            f"{snapshot_after.invariant_issue_count} invariant."
        )
    if auto_cleaned_trade_ids:
        summary += f" Auto-clean removed {len(auto_cleaned_trade_ids)} orphan trade projection row{'s' if len(auto_cleaned_trade_ids) != 1 else ''}."
    if emitted_alerts:
        summary += " Alert routing was triggered."
    if emitted_deliveries:
        summary += (
            f" {len(emitted_deliveries)} channel deliver"
            f"{'ies were' if len(emitted_deliveries) != 1 else 'y was'} recorded."
        )
    return summary
