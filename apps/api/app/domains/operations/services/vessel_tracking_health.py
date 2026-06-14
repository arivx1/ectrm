from __future__ import annotations

from datetime import date, datetime, time, timezone

from apps.api.app.models.delivery_vessel_detail import DeliveryVesselDetail
from apps.api.app.schemas.shipment import DeliveryVesselTrackingHealthOut
from apps.api.app.shared.enums import (
    DeliveryExecutionStatus,
    TruckEtaStatus,
    TruckTrackingExceptionSeverity,
    TruckTrackingFreshnessStatus,
)

VESSEL_TRACKING_STALE_AFTER_MINUTES = 720


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _delivery_end_deadline(delivery_end: date | None) -> datetime | None:
    if delivery_end is None:
        return None
    return datetime.combine(delivery_end, time.max, tzinfo=timezone.utc)


def _whole_minutes_between(start: datetime, end: datetime) -> int:
    return max(0, int((end - start).total_seconds() // 60))


def _terminal_execution_status(execution_status: str | None) -> bool:
    return execution_status in {
        DeliveryExecutionStatus.COMPLETED.value,
        DeliveryExecutionStatus.CANCELLED.value,
    }


def _tracking_freshness(
    vessel_detail: DeliveryVesselDetail | None,
    *,
    execution_status: str | None,
    as_of: datetime,
) -> tuple[TruckTrackingFreshnessStatus, str, int | None]:
    if _terminal_execution_status(execution_status):
        return (
            TruckTrackingFreshnessStatus.NOT_REQUIRED,
            f"Tracking freshness is not required while the vessel delivery is {execution_status}.",
            None,
        )
    last_signal_at = _coerce_utc(vessel_detail.last_signal_at if vessel_detail is not None else None)
    if last_signal_at is None:
        return (
            TruckTrackingFreshnessStatus.MISSING,
            "No accepted vessel tracking signal has refreshed this delivery yet.",
            None,
        )
    minutes_since_last_signal = _whole_minutes_between(last_signal_at, as_of)
    if minutes_since_last_signal >= VESSEL_TRACKING_STALE_AFTER_MINUTES:
        return (
            TruckTrackingFreshnessStatus.STALE,
            (
                f"Last vessel signal is {minutes_since_last_signal} minutes old, "
                f"past the {VESSEL_TRACKING_STALE_AFTER_MINUTES} minute freshness threshold."
            ),
            minutes_since_last_signal,
        )
    return (
        TruckTrackingFreshnessStatus.FRESH,
        f"Last vessel signal is {minutes_since_last_signal} minutes old.",
        minutes_since_last_signal,
    )


def _eta_status(
    vessel_detail: DeliveryVesselDetail | None,
    *,
    delivery_end: date | None,
    execution_status: str | None,
    as_of: datetime,
) -> tuple[TruckEtaStatus, str, int | None]:
    if execution_status == DeliveryExecutionStatus.CANCELLED.value:
        return TruckEtaStatus.NOT_REQUIRED, "ETA classification is not required for cancelled vessel delivery.", None
    if execution_status == DeliveryExecutionStatus.COMPLETED.value:
        return TruckEtaStatus.ARRIVED, "Vessel delivery is completed.", None

    deadline = _delivery_end_deadline(delivery_end)
    if deadline is None:
        return TruckEtaStatus.UNKNOWN, "Delivery end is not available for vessel ETA classification.", None

    eta_at_destination = _coerce_utc(
        vessel_detail.current_eta_at_destination if vessel_detail is not None else None
    )
    if eta_at_destination is None:
        if as_of > deadline:
            late_minutes = _whole_minutes_between(deadline, as_of)
            return (
                TruckEtaStatus.LATE,
                f"Delivery window ended {late_minutes} minutes ago and no vessel arrival is recorded.",
                late_minutes,
            )
        return TruckEtaStatus.MISSING_ETA, "No destination ETA has been captured for this vessel delivery.", None

    if as_of > deadline:
        late_minutes = _whole_minutes_between(deadline, as_of)
        return TruckEtaStatus.LATE, f"Delivery window ended {late_minutes} minutes ago.", late_minutes
    if eta_at_destination > deadline:
        late_minutes = _whole_minutes_between(deadline, eta_at_destination)
        return (
            TruckEtaStatus.AT_RISK,
            f"Current vessel ETA is {late_minutes} minutes after the delivery window.",
            late_minutes,
        )
    return TruckEtaStatus.ON_TIME, "Current vessel ETA is inside the delivery window.", None


def _exception_summary(
    *,
    freshness_status: TruckTrackingFreshnessStatus,
    eta_status: TruckEtaStatus,
) -> tuple[TruckTrackingExceptionSeverity, str | None]:
    if eta_status == TruckEtaStatus.LATE:
        return TruckTrackingExceptionSeverity.ACTION_REQUIRED, "ETA_LATE"
    if freshness_status == TruckTrackingFreshnessStatus.STALE:
        return TruckTrackingExceptionSeverity.ACTION_REQUIRED, "STALE_TRACKING"
    if eta_status == TruckEtaStatus.AT_RISK:
        return TruckTrackingExceptionSeverity.WATCH, "ETA_AT_RISK"
    if freshness_status == TruckTrackingFreshnessStatus.MISSING:
        return TruckTrackingExceptionSeverity.WATCH, "MISSING_TRACKING_SIGNAL"
    if eta_status == TruckEtaStatus.MISSING_ETA:
        return TruckTrackingExceptionSeverity.WATCH, "MISSING_ETA"
    if eta_status == TruckEtaStatus.UNKNOWN:
        return TruckTrackingExceptionSeverity.WATCH, "ETA_UNKNOWN"
    return TruckTrackingExceptionSeverity.CLEAR, None


def vessel_tracking_health_to_out(
    vessel_detail: DeliveryVesselDetail | None,
    *,
    delivery_end: date | None,
    execution_status: str | None,
    as_of: datetime | None = None,
) -> DeliveryVesselTrackingHealthOut:
    evaluated_at = _coerce_utc(as_of) or datetime.now(timezone.utc)
    freshness_status, freshness_reason, minutes_since_last_signal = _tracking_freshness(
        vessel_detail,
        execution_status=execution_status,
        as_of=evaluated_at,
    )
    eta_status, eta_reason, eta_late_minutes = _eta_status(
        vessel_detail,
        delivery_end=delivery_end,
        execution_status=execution_status,
        as_of=evaluated_at,
    )
    exception_severity, primary_exception = _exception_summary(
        freshness_status=freshness_status,
        eta_status=eta_status,
    )
    return DeliveryVesselTrackingHealthOut(
        last_evaluated_at=evaluated_at,
        tracking_freshness_status=freshness_status.value,
        tracking_freshness_reason=freshness_reason,
        eta_status=eta_status.value,
        eta_status_reason=eta_reason,
        exception_severity=exception_severity.value,
        primary_exception=primary_exception,
        stale_after_minutes=VESSEL_TRACKING_STALE_AFTER_MINUTES,
        minutes_since_last_signal=minutes_since_last_signal,
        eta_late_minutes=eta_late_minutes,
    )
