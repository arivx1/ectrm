from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from typing import Callable

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.domains.operations.services.audit_events import append_trade_audit_event
from apps.api.app.domains.operations.services.aisstream_client import AisstreamVesselSignal
from apps.api.app.domains.operations.services.aisstream_client import fetch_aisstream_vessel_signal
from apps.api.app.domains.operations.services.shipments import _apply_model_changes
from apps.api.app.domains.operations.services.shipments import _coerce_utc
from apps.api.app.domains.operations.services.shipments import _load_active_delivery_record
from apps.api.app.domains.operations.services.shipments import _normalize_optional_text
from apps.api.app.domains.operations.services.shipments import _normalize_required_text
from apps.api.app.domains.operations.services.shipments import _require_transport_mode
from apps.api.app.domains.operations.services.shipments import _touch_audited_record
from apps.api.app.domains.operations.services.vessel_tracking_health import vessel_tracking_health_to_out
from apps.api.app.models.delivery_tracking_signal import DeliveryTrackingSignal
from apps.api.app.models.delivery_vessel_detail import DeliveryVesselDetail
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.shipment import DeliveryTrackingSignalOut
from apps.api.app.schemas.shipment import DeliveryTrackingSignalWrite
from apps.api.app.schemas.shipment import DeliveryVesselAisstreamRefreshOut
from apps.api.app.schemas.shipment import DeliveryVesselDetailOut
from apps.api.app.schemas.shipment import DeliveryVesselTrackingHealthOut
from apps.api.app.schemas.shipment import DeliveryVesselTrackingSignalIngestResultOut
from apps.api.app.shared.enums import TrackingSignalProcessingStatus
from apps.api.app.shared.enums import TransportMode

VESSEL_TRACKING_EVENT_SOURCE = "VESSEL_MANUAL_TRACKING"
VESSEL_AISSTREAM_PROVIDER = "AISSTREAM"


def _normalize_optional_datetime(value: object | None, *, label: str) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, datetime):
        raise ValueError(f"{label} must be a datetime value.")
    return _coerce_utc(value)


def _normalize_optional_bounded_float(
    value: object | None,
    *,
    label: str,
    minimum: Decimal,
    maximum: Decimal,
) -> float | None:
    if value in (None, ""):
        return None
    try:
        normalized = Decimal(str(value))
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError(f"{label} must be a numeric value.") from exc
    if normalized < minimum or normalized > maximum:
        raise ValueError(f"{label} must be between {minimum} and {maximum}.")
    return float(normalized)


def _normalize_optional_vessel_identity(value: object | None, *, label: str, digits: int) -> str | None:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        return None
    if not normalized.isdigit() or len(normalized) != digits:
        raise ValueError(f"{label} must be a {digits}-digit numeric identifier.")
    return normalized


def _normalize_aisstream_timeout_seconds(value: int | None) -> int:
    timeout_seconds = value or settings.AISSTREAM_REFRESH_TIMEOUT_SECONDS
    if timeout_seconds < 5 or timeout_seconds > 120:
        raise ValueError("AISStream refresh timeout must be between 5 and 120 seconds.")
    return timeout_seconds


def _load_active_vessel_delivery(
    db: Session,
    *,
    delivery_id: str,
) -> tuple[DeliveryObligation, Trade, DeliveryVesselDetail | None]:
    delivery, trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    _require_transport_mode(
        delivery,
        expected=TransportMode.VESSEL,
        detail_label="vessel",
    )
    return delivery, trade, db.get(DeliveryVesselDetail, delivery_id)


def _ensure_delivery_vessel_detail(
    db: Session,
    *,
    delivery: DeliveryObligation,
    actor_id: str,
    reference_time: datetime,
) -> DeliveryVesselDetail:
    detail = db.get(DeliveryVesselDetail, delivery.delivery_id)
    if detail is not None:
        return detail

    detail = DeliveryVesselDetail(
        delivery_id=delivery.delivery_id,
        vessel_name=None,
        imo_number=None,
        mmsi_number=None,
        call_sign=None,
        voyage_number=None,
        tracking_provider=None,
        tracking_policy=None,
        last_signal_at=None,
        last_position_at=None,
        last_latitude=None,
        last_longitude=None,
        last_speed_knots=None,
        last_course_degrees=None,
        last_heading_degrees=None,
        last_navigational_status=None,
        current_destination=None,
        current_eta_at_destination=None,
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    db.add(detail)
    return detail


def _vessel_tracking_health(
    detail: DeliveryVesselDetail | None,
    *,
    delivery: DeliveryObligation,
    as_of: datetime | None = None,
) -> DeliveryVesselTrackingHealthOut:
    return vessel_tracking_health_to_out(
        detail,
        delivery_end=delivery.delivery_end,
        execution_status=delivery.execution_status,
        as_of=as_of,
    )


def _vessel_detail_to_out(
    detail: DeliveryVesselDetail,
    *,
    delivery: DeliveryObligation,
    as_of: datetime | None = None,
) -> DeliveryVesselDetailOut:
    return DeliveryVesselDetailOut(
        delivery_id=detail.delivery_id,
        vessel_name=detail.vessel_name,
        imo_number=detail.imo_number,
        mmsi_number=detail.mmsi_number,
        call_sign=detail.call_sign,
        voyage_number=detail.voyage_number,
        tracking_provider=detail.tracking_provider,
        tracking_policy=detail.tracking_policy,
        last_signal_at=_coerce_utc(detail.last_signal_at),
        last_position_at=_coerce_utc(detail.last_position_at),
        last_latitude=float(detail.last_latitude) if detail.last_latitude is not None else None,
        last_longitude=float(detail.last_longitude) if detail.last_longitude is not None else None,
        last_speed_knots=float(detail.last_speed_knots) if detail.last_speed_knots is not None else None,
        last_course_degrees=float(detail.last_course_degrees) if detail.last_course_degrees is not None else None,
        last_heading_degrees=float(detail.last_heading_degrees) if detail.last_heading_degrees is not None else None,
        last_navigational_status=detail.last_navigational_status,
        current_destination=detail.current_destination,
        current_eta_at_destination=_coerce_utc(detail.current_eta_at_destination),
        tracking_health=_vessel_tracking_health(detail, delivery=delivery, as_of=as_of),
        created_at=_coerce_utc(detail.created_at) or datetime.now(timezone.utc),
        created_by=detail.created_by,
        updated_at=_coerce_utc(detail.updated_at) or datetime.now(timezone.utc),
        updated_by=detail.updated_by,
        version=detail.version,
    )


def _tracking_signal_to_out(signal: DeliveryTrackingSignal) -> DeliveryTrackingSignalOut:
    return DeliveryTrackingSignalOut(
        signal_id=signal.signal_id,
        delivery_id=signal.delivery_id,
        movement_id=signal.movement_id,
        stop_id=signal.stop_id,
        source_system=signal.source_system,
        source_event_id=signal.source_event_id,
        signal_type=signal.signal_type,
        occurred_at=_coerce_utc(signal.occurred_at) or datetime.now(timezone.utc),
        received_at=_coerce_utc(signal.received_at) or datetime.now(timezone.utc),
        latitude=float(signal.latitude) if signal.latitude is not None else None,
        longitude=float(signal.longitude) if signal.longitude is not None else None,
        speed_knots=float(signal.speed_knots) if signal.speed_knots is not None else None,
        course_degrees=float(signal.course_degrees) if signal.course_degrees is not None else None,
        heading_degrees=float(signal.heading_degrees) if signal.heading_degrees is not None else None,
        draught_meters=float(signal.draught_meters) if signal.draught_meters is not None else None,
        location_code=signal.location_code,
        destination=signal.destination,
        eta_at_destination=_coerce_utc(signal.eta_at_destination),
        external_status=signal.external_status,
        normalized_status=signal.normalized_status,
        match_confidence=float(signal.match_confidence) if signal.match_confidence is not None else None,
        dedupe_key=signal.dedupe_key,
        processing_status=signal.processing_status,
        processing_error=signal.processing_error,
        raw_payload=signal.raw_payload or {},
    )


def _vessel_tracking_signal_result(
    signal: DeliveryTrackingSignal,
    *,
    delivery: DeliveryObligation,
    detail: DeliveryVesselDetail,
    duplicate: bool,
    as_of: datetime | None = None,
) -> DeliveryVesselTrackingSignalIngestResultOut:
    tracking_health = _vessel_tracking_health(detail, delivery=delivery, as_of=as_of)
    return DeliveryVesselTrackingSignalIngestResultOut(
        ingest_status="DUPLICATE" if duplicate else "CREATED",
        duplicate=duplicate,
        signal=_tracking_signal_to_out(signal),
        vessel_detail=_vessel_detail_to_out(detail, delivery=delivery, as_of=as_of),
        tracking_health=tracking_health,
    )


def _vessel_tracking_signal_dedupe_key(
    *,
    source_system: str,
    source_event_id: str | None,
    delivery_id: str,
    signal_type: str,
    occurred_at: datetime,
    latitude: float | None,
    longitude: float | None,
    external_status: str | None,
) -> str:
    if source_event_id:
        readable_key = f"{source_system}:{source_event_id}"
        if len(readable_key) <= 160:
            return readable_key

    seed = "|".join(
        [
            source_system,
            source_event_id or "",
            delivery_id,
            signal_type,
            occurred_at.isoformat(),
            str(latitude or ""),
            str(longitude or ""),
            external_status or "",
        ]
    )
    digest = sha256(seed.encode("utf-8")).hexdigest()
    prefix = source_system[:32]
    return f"{prefix}:{digest}"[:160]


def _vessel_detail_audit_payload(
    detail: DeliveryVesselDetailOut,
    *,
    request_payload: dict[str, object | None] | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {"vessel_detail": detail.model_dump(mode="json")}
    if request_payload is not None:
        payload["request"] = jsonable_encoder(request_payload)
    return payload


def _append_vessel_audit(
    db: Session,
    *,
    trade_id: str,
    actor_id: str,
    event_type: str,
    detail: DeliveryVesselDetailOut,
    causation_id: str,
    request_payload: dict[str, object | None] | None = None,
) -> None:
    append_trade_audit_event(
        db,
        trade_id=trade_id,
        actor_id=actor_id,
        event_type=event_type,
        occurred_at=detail.updated_at,
        causation_id=causation_id,
        payload=_vessel_detail_audit_payload(detail, request_payload=request_payload),
    )


def get_delivery_vessel_detail(
    db: Session,
    *,
    delivery_id: str,
    as_of: datetime | None = None,
) -> DeliveryVesselDetailOut:
    delivery, _trade, detail = _load_active_vessel_delivery(db, delivery_id=delivery_id)
    if detail is None:
        raise LookupError(f"Vessel detail for delivery '{delivery_id}' was not found.")
    return _vessel_detail_to_out(detail, delivery=delivery, as_of=as_of)


def update_delivery_vessel_detail(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    changes: dict[str, object | None],
    now: datetime | None = None,
) -> DeliveryVesselDetailOut:
    requested_changes = dict(changes)
    if not requested_changes:
        raise ValueError("At least one vessel detail field must be provided.")

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, trade, _existing_detail = _load_active_vessel_delivery(db, delivery_id=delivery_id)
    detail = _ensure_delivery_vessel_detail(
        db,
        delivery=delivery,
        actor_id=actor_id,
        reference_time=reference_time,
    )

    detail_changes: dict[str, object | None] = {}
    for field_name, raw_value in changes.items():
        if field_name == "imo_number":
            detail_changes[field_name] = _normalize_optional_vessel_identity(
                raw_value,
                label="IMO number",
                digits=7,
            )
        elif field_name == "mmsi_number":
            detail_changes[field_name] = _normalize_optional_vessel_identity(
                raw_value,
                label="MMSI number",
                digits=9,
            )
        else:
            detail_changes[field_name] = _normalize_optional_text(raw_value)

    if _apply_model_changes(detail, detail_changes):
        _touch_audited_record(detail, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    detail_out = _vessel_detail_to_out(detail, delivery=delivery, as_of=reference_time)
    _append_vessel_audit(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeDeliveryVesselUpdated",
        causation_id=f"delivery:{delivery.delivery_id}:vessel-detail",
        detail=detail_out,
        request_payload=requested_changes,
    )
    return detail_out


def get_delivery_vessel_tracking_health(
    db: Session,
    *,
    delivery_id: str,
    as_of: datetime | None = None,
) -> DeliveryVesselTrackingHealthOut:
    delivery, _trade, detail = _load_active_vessel_delivery(db, delivery_id=delivery_id)
    return _vessel_tracking_health(detail, delivery=delivery, as_of=as_of)


def list_delivery_vessel_tracking_signals(
    db: Session,
    *,
    delivery_id: str,
) -> list[DeliveryTrackingSignalOut]:
    _load_active_vessel_delivery(db, delivery_id=delivery_id)
    signals = db.execute(
        select(DeliveryTrackingSignal)
        .where(
            DeliveryTrackingSignal.delivery_id == delivery_id,
            DeliveryTrackingSignal.movement_id.is_(None),
        )
        .order_by(DeliveryTrackingSignal.occurred_at.desc(), DeliveryTrackingSignal.signal_id.desc())
    ).scalars().all()
    return [_tracking_signal_to_out(signal) for signal in signals]


def _aisstream_signal_to_tracking_payload(signal: AisstreamVesselSignal) -> DeliveryTrackingSignalWrite:
    return DeliveryTrackingSignalWrite(
        source_system=signal.source_system,
        source_event_id=signal.source_event_id,
        signal_type=signal.signal_type,
        occurred_at=signal.occurred_at,
        received_at=signal.received_at,
        latitude=signal.latitude,
        longitude=signal.longitude,
        speed_knots=signal.speed_knots,
        course_degrees=signal.course_degrees,
        heading_degrees=signal.heading_degrees,
        destination=signal.destination,
        eta_at_destination=signal.eta_at_destination,
        external_status=signal.external_status,
        normalized_status=signal.normalized_status,
        match_confidence=signal.match_confidence,
        raw_payload=signal.raw_payload,
    )


def refresh_delivery_vessel_tracking_from_aisstream(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    timeout_seconds: int | None = None,
    signal_fetcher: Callable[..., AisstreamVesselSignal] | None = None,
) -> DeliveryVesselAisstreamRefreshOut:
    delivery, _trade, detail = _load_active_vessel_delivery(db, delivery_id=delivery_id)
    if detail is None or not detail.mmsi_number:
        raise ValueError("AISStream refresh requires a saved vessel MMSI number.")

    normalized_timeout = _normalize_aisstream_timeout_seconds(timeout_seconds)
    provider_fetcher = signal_fetcher or fetch_aisstream_vessel_signal
    provider_signal = provider_fetcher(
        mmsi=detail.mmsi_number,
        timeout_seconds=normalized_timeout,
    )
    result = record_delivery_vessel_tracking_signal(
        db,
        delivery_id=delivery.delivery_id,
        actor_id=actor_id,
        payload=_aisstream_signal_to_tracking_payload(provider_signal),
    )
    return DeliveryVesselAisstreamRefreshOut(
        **result.model_dump(),
        provider=VESSEL_AISSTREAM_PROVIDER,
        matched_mmsi=detail.mmsi_number,
        listened_seconds=provider_signal.listened_seconds,
    )


def record_delivery_vessel_tracking_signal(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    payload: object,
    now: datetime | None = None,
) -> DeliveryVesselTrackingSignalIngestResultOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, trade, _existing_detail = _load_active_vessel_delivery(db, delivery_id=delivery_id)
    detail = _ensure_delivery_vessel_detail(
        db,
        delivery=delivery,
        actor_id=actor_id,
        reference_time=reference_time,
    )

    source_system = (
        _normalize_optional_text(getattr(payload, "source_system", None)) or VESSEL_TRACKING_EVENT_SOURCE
    ).upper()
    source_event_id = _normalize_optional_text(getattr(payload, "source_event_id", None))
    signal_type = _normalize_required_text(getattr(payload, "signal_type", None), label="Vessel signal type").upper()
    occurred_at = _normalize_optional_datetime(
        getattr(payload, "occurred_at", None),
        label="Vessel signal occurred at",
    )
    if occurred_at is None:
        raise ValueError("Vessel signal occurred at is required.")
    received_at = (
        _normalize_optional_datetime(getattr(payload, "received_at", None), label="Vessel signal received at")
        or reference_time
    )
    latitude = _normalize_optional_bounded_float(
        getattr(payload, "latitude", None),
        label="Vessel signal latitude",
        minimum=Decimal("-90"),
        maximum=Decimal("90"),
    )
    longitude = _normalize_optional_bounded_float(
        getattr(payload, "longitude", None),
        label="Vessel signal longitude",
        minimum=Decimal("-180"),
        maximum=Decimal("180"),
    )
    if (latitude is None) != (longitude is None):
        raise ValueError("Vessel signal latitude and longitude must be provided together.")
    speed_knots = _normalize_optional_bounded_float(
        getattr(payload, "speed_knots", None),
        label="Vessel signal speed",
        minimum=Decimal("0"),
        maximum=Decimal("80"),
    )
    course_degrees = _normalize_optional_bounded_float(
        getattr(payload, "course_degrees", None),
        label="Vessel signal course",
        minimum=Decimal("0"),
        maximum=Decimal("360"),
    )
    heading_degrees = _normalize_optional_bounded_float(
        getattr(payload, "heading_degrees", None),
        label="Vessel signal heading",
        minimum=Decimal("0"),
        maximum=Decimal("360"),
    )
    draught_meters = _normalize_optional_bounded_float(
        getattr(payload, "draught_meters", None),
        label="Vessel signal draught",
        minimum=Decimal("0"),
        maximum=Decimal("50"),
    )
    destination = _normalize_optional_text(getattr(payload, "destination", None))
    eta_at_destination = _normalize_optional_datetime(
        getattr(payload, "eta_at_destination", None),
        label="Vessel signal destination ETA",
    )
    location_code = _normalize_optional_text(getattr(payload, "location_code", None))
    external_status = _normalize_optional_text(getattr(payload, "external_status", None))
    normalized_status = _normalize_optional_text(getattr(payload, "normalized_status", None))
    if normalized_status is not None:
        normalized_status = normalized_status.upper()
    requested_confidence = _normalize_optional_bounded_float(
        getattr(payload, "match_confidence", None),
        label="Vessel signal match confidence",
        minimum=Decimal("0"),
        maximum=Decimal("1"),
    )
    raw_payload = jsonable_encoder(getattr(payload, "raw_payload", {}) or {})
    if not isinstance(raw_payload, dict):
        raise ValueError("Vessel signal raw payload must be an object.")

    dedupe_key = _vessel_tracking_signal_dedupe_key(
        source_system=source_system,
        source_event_id=source_event_id,
        delivery_id=delivery.delivery_id,
        signal_type=signal_type,
        occurred_at=occurred_at,
        latitude=latitude,
        longitude=longitude,
        external_status=external_status,
    )
    existing_signal = db.execute(
        select(DeliveryTrackingSignal).where(DeliveryTrackingSignal.dedupe_key == dedupe_key)
    ).scalars().first()
    if existing_signal is not None:
        if existing_signal.delivery_id not in {None, delivery.delivery_id}:
            raise ValueError(
                f"Vessel tracking signal dedupe key already belongs to delivery '{existing_signal.delivery_id}'."
            )
        return _vessel_tracking_signal_result(
            existing_signal,
            delivery=delivery,
            detail=detail,
            duplicate=True,
            as_of=reference_time,
        )

    signal = DeliveryTrackingSignal(
        delivery_id=delivery.delivery_id,
        movement_id=None,
        stop_id=None,
        source_system=source_system,
        source_event_id=source_event_id,
        signal_type=signal_type,
        occurred_at=occurred_at,
        received_at=received_at,
        latitude=latitude,
        longitude=longitude,
        speed_knots=speed_knots,
        course_degrees=course_degrees,
        heading_degrees=heading_degrees,
        draught_meters=draught_meters,
        location_code=location_code,
        destination=destination,
        eta_at_destination=eta_at_destination,
        external_status=external_status,
        normalized_status=normalized_status,
        match_confidence=requested_confidence if requested_confidence is not None else 1.0,
        dedupe_key=dedupe_key,
        processing_status=TrackingSignalProcessingStatus.MATCHED.value,
        processing_error=None,
        raw_payload=raw_payload,
    )
    db.add(signal)

    detail_updates: dict[str, object | None] = {}
    current_last_signal_at = _coerce_utc(detail.last_signal_at)
    if current_last_signal_at is None or occurred_at >= current_last_signal_at:
        detail_updates["last_signal_at"] = occurred_at
    current_last_position_at = _coerce_utc(detail.last_position_at)
    if latitude is not None and longitude is not None and (
        current_last_position_at is None or occurred_at >= current_last_position_at
    ):
        detail_updates.update(
            {
                "last_position_at": occurred_at,
                "last_latitude": latitude,
                "last_longitude": longitude,
                "last_speed_knots": speed_knots,
                "last_course_degrees": course_degrees,
                "last_heading_degrees": heading_degrees,
                "last_navigational_status": normalized_status or external_status,
            }
        )
    if destination is not None:
        detail_updates["current_destination"] = destination
    if eta_at_destination is not None:
        detail_updates["current_eta_at_destination"] = eta_at_destination

    if _apply_model_changes(detail, detail_updates):
        _touch_audited_record(detail, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    detail_out = _vessel_detail_to_out(detail, delivery=delivery, as_of=reference_time)
    signal_out = _tracking_signal_to_out(signal)
    _append_vessel_audit(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeDeliveryVesselTrackingSignalIngested",
        causation_id=f"delivery:{delivery.delivery_id}:vessel-signal:{signal.signal_id}",
        detail=detail_out,
        request_payload={
            "signal": signal_out.model_dump(mode="json"),
            "duplicate": False,
        },
    )
    return _vessel_tracking_signal_result(
        signal,
        delivery=delivery,
        detail=detail,
        duplicate=False,
        as_of=reference_time,
    )
