from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.audit_events import append_trade_audit_event
from apps.api.app.domains.operations.services.shipments import _apply_model_changes
from apps.api.app.domains.operations.services.shipments import _coerce_utc
from apps.api.app.domains.operations.services.shipments import _load_active_delivery_record
from apps.api.app.domains.operations.services.shipments import _normalize_optional_text
from apps.api.app.domains.operations.services.shipments import _normalize_required_text
from apps.api.app.domains.operations.services.shipments import _require_transport_mode
from apps.api.app.domains.operations.services.shipments import _touch_audited_record
from apps.api.app.models.delivery_logistics_detail import DeliveryLogisticsDetail
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_truck_detail import DeliveryTruckDetail
from apps.api.app.models.delivery_truck_movement import DeliveryTruckMovement
from apps.api.app.models.delivery_truck_stop import DeliveryTruckStop
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.shipment import DeliveryTruckMovementOut
from apps.api.app.schemas.shipment import DeliveryTruckMovementSummaryOut
from apps.api.app.schemas.shipment import DeliveryTruckStopOut
from apps.api.app.shared.enums import DeliveryFieldSource
from apps.api.app.shared.enums import TransportMode
from apps.api.app.shared.enums import TruckMovementStatus
from apps.api.app.shared.enums import TruckStopStatus
from apps.api.app.shared.enums import TruckStopType

STOP_TERMINAL_STATUSES = {
    TruckStopStatus.SKIPPED.value,
    TruckStopStatus.CANCELLED.value,
}
STOP_PROGRESS_STATUSES = {
    TruckStopStatus.EN_ROUTE.value,
    TruckStopStatus.ARRIVED.value,
    TruckStopStatus.WORKING.value,
}


def _normalize_optional_datetime(value: object | None, *, label: str) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, datetime):
        raise ValueError(f"{label} must be a datetime value.")
    return _coerce_utc(value)


def _normalize_required_positive_int(value: object | None, *, label: str) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be an integer value.") from exc
    if normalized <= 0:
        raise ValueError(f"{label} must be greater than zero.")
    return normalized


def _normalize_optional_positive_float(value: object | None, *, label: str) -> float | None:
    if value in (None, ""):
        return None
    try:
        normalized = Decimal(str(value))
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError(f"{label} must be a numeric value.") from exc
    if normalized <= 0:
        raise ValueError(f"{label} must be greater than zero.")
    return float(normalized)


def _validate_truck_movement_status(value: object | None) -> TruckMovementStatus:
    normalized = str(value or "").strip().upper()
    try:
        return TruckMovementStatus(normalized)
    except ValueError as exc:
        valid_values = ", ".join(status.value for status in TruckMovementStatus)
        raise ValueError(
            f"Truck movement status '{normalized or value}' is invalid. Expected one of: {valid_values}."
        ) from exc


def _validate_truck_stop_status(value: object | None) -> TruckStopStatus:
    normalized = str(value or "").strip().upper()
    try:
        return TruckStopStatus(normalized)
    except ValueError as exc:
        valid_values = ", ".join(status.value for status in TruckStopStatus)
        raise ValueError(
            f"Truck stop status '{normalized or value}' is invalid. Expected one of: {valid_values}."
        ) from exc


def _validate_truck_stop_type(value: object | None) -> TruckStopType:
    normalized = str(value or "").strip().upper()
    try:
        return TruckStopType(normalized)
    except ValueError as exc:
        valid_values = ", ".join(stop_type.value for stop_type in TruckStopType)
        raise ValueError(
            f"Truck stop type '{normalized or value}' is invalid. Expected one of: {valid_values}."
        ) from exc


def _validate_stop_window(
    *,
    planned_arrival_start: datetime | None,
    planned_arrival_end: datetime | None,
    planned_departure_start: datetime | None,
    planned_departure_end: datetime | None,
    actual_arrived_at: datetime | None = None,
    actual_departed_at: datetime | None = None,
) -> None:
    if planned_arrival_start is not None and planned_arrival_end is not None and planned_arrival_start > planned_arrival_end:
        raise ValueError("Truck stop planned arrival start must be on or before planned arrival end.")
    if (
        planned_departure_start is not None
        and planned_departure_end is not None
        and planned_departure_start > planned_departure_end
    ):
        raise ValueError("Truck stop planned departure start must be on or before planned departure end.")
    if actual_arrived_at is not None and actual_departed_at is not None and actual_arrived_at > actual_departed_at:
        raise ValueError("Truck stop actual arrival must be on or before actual departure.")


def _load_active_truck_delivery(
    db: Session,
    *,
    delivery_id: str,
) -> tuple[DeliveryObligation, Trade, DeliveryTruckDetail | None, DeliveryLogisticsDetail | None]:
    delivery, trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    _require_transport_mode(
        delivery,
        expected=TransportMode.TRUCK,
        detail_label="truck",
    )
    return (
        delivery,
        trade,
        db.get(DeliveryTruckDetail, delivery_id),
        db.get(DeliveryLogisticsDetail, delivery_id),
    )


def _stop_sort_key(stop: DeliveryTruckStop) -> tuple[int, str]:
    return (stop.stop_sequence, stop.stop_id)


def _movement_stops_by_id(
    db: Session,
    *,
    movement_ids: list[str],
) -> dict[str, list[DeliveryTruckStop]]:
    if not movement_ids:
        return {}
    rows = db.execute(
        select(DeliveryTruckStop)
        .where(DeliveryTruckStop.movement_id.in_(movement_ids))
        .order_by(
            DeliveryTruckStop.movement_id.asc(),
            DeliveryTruckStop.stop_sequence.asc(),
            DeliveryTruckStop.stop_id.asc(),
        )
    ).scalars().all()
    grouped: dict[str, list[DeliveryTruckStop]] = {}
    for row in rows:
        grouped.setdefault(row.movement_id, []).append(row)
    return grouped


def _stop_to_out(stop: DeliveryTruckStop) -> DeliveryTruckStopOut:
    return DeliveryTruckStopOut(
        stop_id=stop.stop_id,
        movement_id=stop.movement_id,
        stop_sequence=stop.stop_sequence,
        stop_type=stop.stop_type,
        status=stop.status,
        status_reason=stop.status_reason,
        location_code=stop.location_code,
        location_code_source=stop.location_code_source,
        planned_arrival_start=_coerce_utc(stop.planned_arrival_start),
        planned_arrival_end=_coerce_utc(stop.planned_arrival_end),
        planned_departure_start=_coerce_utc(stop.planned_departure_start),
        planned_departure_end=_coerce_utc(stop.planned_departure_end),
        appointment_reference=stop.appointment_reference,
        appointment_reference_source=stop.appointment_reference_source,
        planned_quantity=float(stop.planned_quantity) if stop.planned_quantity is not None else None,
        actual_quantity=float(stop.actual_quantity) if stop.actual_quantity is not None else None,
        actual_arrived_at=_coerce_utc(stop.actual_arrived_at),
        actual_departed_at=_coerce_utc(stop.actual_departed_at),
        created_at=_coerce_utc(stop.created_at) or datetime.now(timezone.utc),
        created_by=stop.created_by,
        updated_at=_coerce_utc(stop.updated_at) or datetime.now(timezone.utc),
        updated_by=stop.updated_by,
        version=stop.version,
    )


def _movement_summary_to_out(
    movement: DeliveryTruckMovement,
    *,
    stops: list[DeliveryTruckStop],
) -> DeliveryTruckMovementSummaryOut:
    active_stop_count = sum(1 for stop in stops if stop.status not in STOP_TERMINAL_STATUSES)
    return DeliveryTruckMovementSummaryOut(
        movement_id=movement.movement_id,
        delivery_id=movement.delivery_id,
        sequence_no=movement.sequence_no,
        status=movement.status,
        status_reason=movement.status_reason,
        planned_quantity=float(movement.planned_quantity) if movement.planned_quantity is not None else None,
        planned_unit_of_measure=movement.planned_unit_of_measure,
        carrier_name=movement.carrier_name,
        carrier_name_source=movement.carrier_name_source,
        external_carrier_reference=movement.external_carrier_reference,
        external_carrier_reference_source=movement.external_carrier_reference_source,
        dispatcher_owner=movement.dispatcher_owner,
        dispatcher_owner_source=movement.dispatcher_owner_source,
        current_stop_sequence=movement.current_stop_sequence,
        current_location_code=movement.current_location_code,
        last_signal_at=_coerce_utc(movement.last_signal_at),
        current_eta_at_destination=_coerce_utc(movement.current_eta_at_destination),
        hold_reason_code=movement.hold_reason_code,
        hold_reason_code_source=movement.hold_reason_code_source,
        stop_count=len(stops),
        active_stop_count=active_stop_count,
        created_at=_coerce_utc(movement.created_at) or datetime.now(timezone.utc),
        created_by=movement.created_by,
        updated_at=_coerce_utc(movement.updated_at) or datetime.now(timezone.utc),
        updated_by=movement.updated_by,
        version=movement.version,
    )


def _movement_to_out(
    movement: DeliveryTruckMovement,
    *,
    stops: list[DeliveryTruckStop],
) -> DeliveryTruckMovementOut:
    summary = _movement_summary_to_out(movement, stops=stops)
    return DeliveryTruckMovementOut(
        **summary.model_dump(),
        driver_name=movement.driver_name,
        driver_name_source=movement.driver_name_source,
        driver_phone=movement.driver_phone,
        driver_phone_source=movement.driver_phone_source,
        tractor_reference=movement.tractor_reference,
        tractor_reference_source=movement.tractor_reference_source,
        trailer_reference=movement.trailer_reference,
        trailer_reference_source=movement.trailer_reference_source,
        external_load_reference=movement.external_load_reference,
        external_load_reference_source=movement.external_load_reference_source,
        bill_of_lading_number=movement.bill_of_lading_number,
        bill_of_lading_number_source=movement.bill_of_lading_number_source,
        truck_ticket_number=movement.truck_ticket_number,
        truck_ticket_number_source=movement.truck_ticket_number_source,
        stops=[_stop_to_out(stop) for stop in stops],
    )


def _active_stops(stops: list[DeliveryTruckStop]) -> list[DeliveryTruckStop]:
    return [stop for stop in sorted(stops, key=_stop_sort_key) if stop.status not in STOP_TERMINAL_STATUSES]


def _validate_movement_stop_set(
    stops: list[DeliveryTruckStop],
    *,
    require_two_active_stops: bool = True,
) -> list[DeliveryTruckStop]:
    ordered = sorted(stops, key=_stop_sort_key)
    if not ordered:
        raise ValueError("Truck movement must include at least one stop.")

    expected_sequences = list(range(1, len(ordered) + 1))
    actual_sequences = [stop.stop_sequence for stop in ordered]
    if actual_sequences != expected_sequences:
        raise ValueError("Truck stops must use dense one-based sequencing without gaps.")

    active_stops = _active_stops(ordered)
    if require_two_active_stops and len(active_stops) < 2:
        raise ValueError("Truck movement must retain at least two active stops.")
    if active_stops:
        if active_stops[0].stop_type != TruckStopType.PICKUP.value:
            raise ValueError("First active truck stop must be PICKUP.")
        if active_stops[-1].stop_type != TruckStopType.DROPOFF.value:
            raise ValueError("Last active truck stop must be DROPOFF.")

    active_progress_stops = [stop for stop in ordered if stop.status in STOP_PROGRESS_STATUSES]
    if len(active_progress_stops) > 1:
        raise ValueError("Only one truck stop can be EN_ROUTE, ARRIVED, or WORKING at a time.")

    for stop in ordered:
        _validate_stop_window(
            planned_arrival_start=_coerce_utc(stop.planned_arrival_start),
            planned_arrival_end=_coerce_utc(stop.planned_arrival_end),
            planned_departure_start=_coerce_utc(stop.planned_departure_start),
            planned_departure_end=_coerce_utc(stop.planned_departure_end),
            actual_arrived_at=_coerce_utc(stop.actual_arrived_at),
            actual_departed_at=_coerce_utc(stop.actual_departed_at),
        )
    return ordered


def _movement_execution_started(
    movement: DeliveryTruckMovement,
    *,
    stops: list[DeliveryTruckStop],
) -> bool:
    if movement.status in {
        TruckMovementStatus.EN_ROUTE_TO_STOP.value,
        TruckMovementStatus.AT_STOP.value,
        TruckMovementStatus.IN_TRANSIT.value,
        TruckMovementStatus.COMPLETED.value,
        TruckMovementStatus.CANCELLED.value,
    }:
        return True
    return any(stop.status != TruckStopStatus.PLANNED.value for stop in stops)


def _derive_movement_projection(
    stops: list[DeliveryTruckStop],
) -> tuple[str, int | None, str | None]:
    ordered = _validate_movement_stop_set(stops)
    active_stops = _active_stops(ordered)
    if not active_stops:
        return TruckMovementStatus.CANCELLED.value, None, None

    if all(stop.status == TruckStopStatus.DEPARTED.value for stop in active_stops):
        last_stop = active_stops[-1]
        return TruckMovementStatus.COMPLETED.value, last_stop.stop_sequence, last_stop.location_code

    for stop in active_stops:
        if stop.status in {TruckStopStatus.ARRIVED.value, TruckStopStatus.WORKING.value}:
            return TruckMovementStatus.AT_STOP.value, stop.stop_sequence, stop.location_code
        if stop.status == TruckStopStatus.EN_ROUTE.value:
            return TruckMovementStatus.EN_ROUTE_TO_STOP.value, stop.stop_sequence, stop.location_code

    for stop in active_stops:
        if stop.status == TruckStopStatus.PLANNED.value:
            if any(
                previous.stop_sequence < stop.stop_sequence and previous.status == TruckStopStatus.DEPARTED.value
                for previous in active_stops
            ):
                return TruckMovementStatus.IN_TRANSIT.value, stop.stop_sequence, stop.location_code
            return TruckMovementStatus.PLANNED.value, stop.stop_sequence, stop.location_code

    first_stop = active_stops[0]
    return TruckMovementStatus.ASSIGNED.value, first_stop.stop_sequence, first_stop.location_code


def _refresh_movement_projection(
    movement: DeliveryTruckMovement,
    *,
    stops: list[DeliveryTruckStop],
    actor_id: str,
    reference_time: datetime,
) -> None:
    derived_status, current_stop_sequence, current_location_code = _derive_movement_projection(stops)
    next_values = {
        "current_stop_sequence": current_stop_sequence,
        "current_location_code": current_location_code,
    }
    if movement.status not in {TruckMovementStatus.ON_HOLD.value, TruckMovementStatus.CANCELLED.value}:
        next_values["status"] = derived_status
        if derived_status not in {TruckMovementStatus.ON_HOLD.value, TruckMovementStatus.CANCELLED.value}:
            next_values["status_reason"] = None
    if _apply_model_changes(movement, next_values):
        _touch_audited_record(movement, actor_id=actor_id, reference_time=reference_time)


def _movement_audit_payload(
    movement: DeliveryTruckMovementOut,
    *,
    request_payload: dict[str, object | None] | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {"movement": movement.model_dump(mode="json")}
    if request_payload is not None:
        payload["request"] = jsonable_encoder(request_payload)
    return payload


def _append_truck_movement_audit(
    db: Session,
    *,
    trade_id: str,
    actor_id: str,
    event_type: str,
    movement: DeliveryTruckMovementOut,
    causation_id: str,
    request_payload: dict[str, object | None] | None = None,
) -> None:
    append_trade_audit_event(
        db,
        trade_id=trade_id,
        actor_id=actor_id,
        event_type=event_type,
        occurred_at=movement.updated_at,
        causation_id=causation_id,
        payload=_movement_audit_payload(movement, request_payload=request_payload),
    )


def _load_truck_movement(
    db: Session,
    *,
    movement_id: str,
) -> tuple[DeliveryTruckMovement, DeliveryObligation, Trade]:
    movement = db.get(DeliveryTruckMovement, movement_id)
    if movement is None:
        raise LookupError(f"Truck movement '{movement_id}' was not found.")
    delivery, trade, _truck_detail, _logistics_detail = _load_active_truck_delivery(
        db,
        delivery_id=movement.delivery_id,
    )
    return movement, delivery, trade


def _load_truck_stop(
    db: Session,
    *,
    stop_id: str,
) -> tuple[DeliveryTruckStop, DeliveryTruckMovement, DeliveryObligation, Trade]:
    stop = db.get(DeliveryTruckStop, stop_id)
    if stop is None:
        raise LookupError(f"Truck stop '{stop_id}' was not found.")
    movement, delivery, trade = _load_truck_movement(db, movement_id=stop.movement_id)
    return stop, movement, delivery, trade


def _build_create_stop_sequence_plan(
    stops: list[object],
) -> list[int]:
    requested_sequences = [getattr(stop, "stop_sequence", None) for stop in stops]
    if any(sequence is not None for sequence in requested_sequences):
        if any(sequence is None for sequence in requested_sequences):
            raise ValueError("Truck stop sequences must either all be provided or all be omitted.")
        normalized_sequences = [
            _normalize_required_positive_int(sequence, label="Truck stop sequence")
            for sequence in requested_sequences
        ]
        if sorted(normalized_sequences) != list(range(1, len(stops) + 1)):
            raise ValueError("Truck stop sequences must be dense one-based values starting at 1.")
        return normalized_sequences
    return list(range(1, len(stops) + 1))


def _create_stop_model(
    *,
    movement_id: str,
    stop_sequence: int,
    stop_type: TruckStopType,
    location_code: str | None,
    planned_arrival_start: datetime | None,
    planned_arrival_end: datetime | None,
    planned_departure_start: datetime | None,
    planned_departure_end: datetime | None,
    appointment_reference: str | None,
    planned_quantity: float | None,
    status: TruckStopStatus,
    actor_id: str,
    reference_time: datetime,
) -> DeliveryTruckStop:
    return DeliveryTruckStop(
        stop_id=f"TS-{uuid4().hex}",
        movement_id=movement_id,
        stop_sequence=stop_sequence,
        stop_type=stop_type.value,
        status=status.value,
        status_reason=None,
        location_code=location_code,
        location_code_source=DeliveryFieldSource.MANUAL.value,
        planned_arrival_start=planned_arrival_start,
        planned_arrival_end=planned_arrival_end,
        planned_departure_start=planned_departure_start,
        planned_departure_end=planned_departure_end,
        appointment_reference=appointment_reference,
        appointment_reference_source=DeliveryFieldSource.MANUAL.value,
        planned_quantity=planned_quantity,
        actual_quantity=None,
        actual_arrived_at=None,
        actual_departed_at=None,
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )


def list_delivery_truck_movements(
    db: Session,
    *,
    delivery_id: str,
) -> list[DeliveryTruckMovementSummaryOut]:
    _load_active_truck_delivery(db, delivery_id=delivery_id)
    movements = db.execute(
        select(DeliveryTruckMovement)
        .where(DeliveryTruckMovement.delivery_id == delivery_id)
        .order_by(DeliveryTruckMovement.sequence_no.asc(), DeliveryTruckMovement.movement_id.asc())
    ).scalars().all()
    stops_by_id = _movement_stops_by_id(db, movement_ids=[movement.movement_id for movement in movements])
    return [
        _movement_summary_to_out(movement, stops=stops_by_id.get(movement.movement_id, []))
        for movement in movements
    ]


def get_delivery_truck_movement(
    db: Session,
    *,
    movement_id: str,
) -> DeliveryTruckMovementOut:
    movement, _delivery, _trade = _load_truck_movement(db, movement_id=movement_id)
    stops = _movement_stops_by_id(db, movement_ids=[movement.movement_id]).get(movement.movement_id, [])
    return _movement_to_out(movement, stops=stops)


def create_delivery_truck_movement(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    payload: object,
    now: datetime | None = None,
) -> DeliveryTruckMovementOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, trade, truck_detail, _logistics_detail = _load_active_truck_delivery(db, delivery_id=delivery_id)
    sequence_no = _normalize_required_positive_int(getattr(payload, "sequence_no", None), label="Movement sequence")
    existing_sequence = db.execute(
        select(DeliveryTruckMovement)
        .where(
            DeliveryTruckMovement.delivery_id == delivery_id,
            DeliveryTruckMovement.sequence_no == sequence_no,
        )
    ).scalars().first()
    if existing_sequence is not None:
        raise ValueError(f"Truck movement sequence {sequence_no} already exists for delivery '{delivery_id}'.")

    stops_payload = list(getattr(payload, "stops", []) or [])
    if len(stops_payload) < 2:
        raise ValueError("Truck movement must include at least two stops.")

    planned_quantity = _normalize_optional_positive_float(
        getattr(payload, "planned_quantity", None),
        label="Planned quantity",
    )
    requested_status = getattr(payload, "status", None)
    if requested_status is not None:
        movement_status = _validate_truck_movement_status(requested_status)
        if movement_status in {
            TruckMovementStatus.EN_ROUTE_TO_STOP,
            TruckMovementStatus.AT_STOP,
            TruckMovementStatus.IN_TRANSIT,
            TruckMovementStatus.COMPLETED,
            TruckMovementStatus.CANCELLED,
        }:
            raise ValueError("Truck movement create status must be PLANNED, ASSIGNED, or ON_HOLD.")
    else:
        movement_status = None

    carrier_name = _normalize_optional_text(getattr(payload, "carrier_name", None))
    if carrier_name is None and truck_detail is not None:
        carrier_name = truck_detail.default_carrier_name
        carrier_name_source = truck_detail.default_carrier_name_source
    else:
        carrier_name_source = DeliveryFieldSource.MANUAL.value if carrier_name is not None else DeliveryFieldSource.SYSTEM_GENERATED.value

    external_carrier_reference = _normalize_optional_text(getattr(payload, "external_carrier_reference", None))
    if external_carrier_reference is None and truck_detail is not None:
        external_carrier_reference = truck_detail.default_external_carrier_reference
        external_carrier_reference_source = truck_detail.default_external_carrier_reference_source
    else:
        external_carrier_reference_source = (
            DeliveryFieldSource.MANUAL.value
            if external_carrier_reference is not None
            else DeliveryFieldSource.SYSTEM_GENERATED.value
        )

    dispatcher_owner = _normalize_optional_text(getattr(payload, "dispatcher_owner", None))
    if dispatcher_owner is None:
        dispatcher_owner = (
            _normalize_optional_text(truck_detail.dispatcher_owner) if truck_detail is not None else None
        ) or _normalize_optional_text(delivery.operations_owner)
        dispatcher_owner_source = DeliveryFieldSource.SYSTEM_GENERATED.value
    else:
        dispatcher_owner_source = DeliveryFieldSource.MANUAL.value

    movement = DeliveryTruckMovement(
        movement_id=f"TM-{uuid4().hex}",
        delivery_id=delivery_id,
        sequence_no=sequence_no,
        status=movement_status.value if movement_status is not None else TruckMovementStatus.PLANNED.value,
        status_reason=(
            _normalize_required_text(getattr(payload, "hold_reason_code", None), label="Hold reason")
            if movement_status == TruckMovementStatus.ON_HOLD
            else None
        ),
        planned_quantity=planned_quantity,
        planned_unit_of_measure=(
            _normalize_optional_text(getattr(payload, "planned_unit_of_measure", None)) or delivery.unit_of_measure
        ),
        carrier_name=carrier_name,
        carrier_name_source=carrier_name_source,
        external_carrier_reference=external_carrier_reference,
        external_carrier_reference_source=external_carrier_reference_source,
        dispatcher_owner=dispatcher_owner,
        dispatcher_owner_source=dispatcher_owner_source,
        driver_name=_normalize_optional_text(getattr(payload, "driver_name", None)),
        driver_name_source=(
            DeliveryFieldSource.MANUAL.value
            if _normalize_optional_text(getattr(payload, "driver_name", None)) is not None
            else DeliveryFieldSource.SYSTEM_GENERATED.value
        ),
        driver_phone=_normalize_optional_text(getattr(payload, "driver_phone", None)),
        driver_phone_source=(
            DeliveryFieldSource.MANUAL.value
            if _normalize_optional_text(getattr(payload, "driver_phone", None)) is not None
            else DeliveryFieldSource.SYSTEM_GENERATED.value
        ),
        tractor_reference=_normalize_optional_text(getattr(payload, "tractor_reference", None)),
        tractor_reference_source=(
            DeliveryFieldSource.MANUAL.value
            if _normalize_optional_text(getattr(payload, "tractor_reference", None)) is not None
            else DeliveryFieldSource.SYSTEM_GENERATED.value
        ),
        trailer_reference=_normalize_optional_text(getattr(payload, "trailer_reference", None)),
        trailer_reference_source=(
            DeliveryFieldSource.MANUAL.value
            if _normalize_optional_text(getattr(payload, "trailer_reference", None)) is not None
            else DeliveryFieldSource.SYSTEM_GENERATED.value
        ),
        external_load_reference=_normalize_optional_text(getattr(payload, "external_load_reference", None)),
        external_load_reference_source=(
            DeliveryFieldSource.MANUAL.value
            if _normalize_optional_text(getattr(payload, "external_load_reference", None)) is not None
            else DeliveryFieldSource.SYSTEM_GENERATED.value
        ),
        bill_of_lading_number=_normalize_optional_text(getattr(payload, "bill_of_lading_number", None)),
        bill_of_lading_number_source=(
            DeliveryFieldSource.MANUAL.value
            if _normalize_optional_text(getattr(payload, "bill_of_lading_number", None)) is not None
            else DeliveryFieldSource.SYSTEM_GENERATED.value
        ),
        truck_ticket_number=_normalize_optional_text(getattr(payload, "truck_ticket_number", None)),
        truck_ticket_number_source=(
            DeliveryFieldSource.MANUAL.value
            if _normalize_optional_text(getattr(payload, "truck_ticket_number", None)) is not None
            else DeliveryFieldSource.SYSTEM_GENERATED.value
        ),
        current_stop_sequence=None,
        current_location_code=None,
        last_signal_at=None,
        current_eta_at_destination=None,
        hold_reason_code=(
            _normalize_optional_text(getattr(payload, "hold_reason_code", None))
            if movement_status == TruckMovementStatus.ON_HOLD
            else None
        ),
        hold_reason_code_source=(
            DeliveryFieldSource.MANUAL.value
            if _normalize_optional_text(getattr(payload, "hold_reason_code", None)) is not None
            else DeliveryFieldSource.SYSTEM_GENERATED.value
        ),
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    db.add(movement)

    sequence_plan = _build_create_stop_sequence_plan(stops_payload)
    stops: list[DeliveryTruckStop] = []
    for stop_payload, stop_sequence in zip(stops_payload, sequence_plan):
        stop_type = _validate_truck_stop_type(getattr(stop_payload, "stop_type", None))
        stop_status = _validate_truck_stop_status(getattr(stop_payload, "status", None) or TruckStopStatus.PLANNED.value)
        planned_arrival_start = _normalize_optional_datetime(
            getattr(stop_payload, "planned_arrival_start", None),
            label="Truck stop planned arrival start",
        )
        planned_arrival_end = _normalize_optional_datetime(
            getattr(stop_payload, "planned_arrival_end", None),
            label="Truck stop planned arrival end",
        )
        planned_departure_start = _normalize_optional_datetime(
            getattr(stop_payload, "planned_departure_start", None),
            label="Truck stop planned departure start",
        )
        planned_departure_end = _normalize_optional_datetime(
            getattr(stop_payload, "planned_departure_end", None),
            label="Truck stop planned departure end",
        )
        _validate_stop_window(
            planned_arrival_start=planned_arrival_start,
            planned_arrival_end=planned_arrival_end,
            planned_departure_start=planned_departure_start,
            planned_departure_end=planned_departure_end,
        )
        stop = _create_stop_model(
            movement_id=movement.movement_id,
            stop_sequence=stop_sequence,
            stop_type=stop_type,
            location_code=_normalize_optional_text(getattr(stop_payload, "location_code", None)),
            planned_arrival_start=planned_arrival_start,
            planned_arrival_end=planned_arrival_end,
            planned_departure_start=planned_departure_start,
            planned_departure_end=planned_departure_end,
            appointment_reference=_normalize_optional_text(getattr(stop_payload, "appointment_reference", None)),
            planned_quantity=_normalize_optional_positive_float(
                getattr(stop_payload, "planned_quantity", None),
                label="Truck stop planned quantity",
            ),
            status=stop_status,
            actor_id=actor_id,
            reference_time=reference_time,
        )
        stops.append(stop)
        db.add(stop)

    _validate_movement_stop_set(stops)
    _refresh_movement_projection(
        movement,
        stops=stops,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    if movement_status == TruckMovementStatus.ON_HOLD:
        movement.status = TruckMovementStatus.ON_HOLD.value
        movement.status_reason = _normalize_required_text(getattr(payload, "hold_reason_code", None), label="Hold reason")
    elif movement_status == TruckMovementStatus.ASSIGNED:
        movement.status = TruckMovementStatus.ASSIGNED.value

    db.flush()
    movement_out = _movement_to_out(movement, stops=sorted(stops, key=_stop_sort_key))
    _append_truck_movement_audit(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeDeliveryTruckMovementCreated",
        movement=movement_out,
        causation_id=f"delivery:{delivery_id}:truck-movement:{movement.movement_id}",
        request_payload=jsonable_encoder(getattr(payload, "model_dump", lambda **_: {})()),
    )
    return movement_out


def update_delivery_truck_movement(
    db: Session,
    *,
    movement_id: str,
    actor_id: str,
    changes: dict[str, object | None],
    now: datetime | None = None,
) -> DeliveryTruckMovementOut:
    if not changes:
        raise ValueError("At least one truck movement field must be provided.")
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    movement, _delivery, trade = _load_truck_movement(db, movement_id=movement_id)
    stops = _movement_stops_by_id(db, movement_ids=[movement.movement_id]).get(movement.movement_id, [])
    execution_started = _movement_execution_started(movement, stops=stops)

    movement_changes: dict[str, object | None] = {}
    if "sequence_no" in changes:
        if execution_started:
            raise ValueError("Truck movement sequence cannot be changed after execution starts.")
        next_sequence_no = _normalize_required_positive_int(changes.get("sequence_no"), label="Movement sequence")
        existing_sequence = db.execute(
            select(DeliveryTruckMovement)
            .where(
                DeliveryTruckMovement.delivery_id == movement.delivery_id,
                DeliveryTruckMovement.sequence_no == next_sequence_no,
                DeliveryTruckMovement.movement_id != movement.movement_id,
            )
        ).scalars().first()
        if existing_sequence is not None:
            raise ValueError(
                f"Truck movement sequence {next_sequence_no} already exists for delivery '{movement.delivery_id}'."
            )
        movement_changes["sequence_no"] = next_sequence_no

    if "planned_quantity" in changes:
        movement_changes["planned_quantity"] = _normalize_optional_positive_float(
            changes.get("planned_quantity"),
            label="Planned quantity",
        )
    if "planned_unit_of_measure" in changes:
        movement_changes["planned_unit_of_measure"] = _normalize_optional_text(changes.get("planned_unit_of_measure"))

    for field_name in (
        "carrier_name",
        "external_carrier_reference",
        "dispatcher_owner",
        "driver_name",
        "driver_phone",
        "tractor_reference",
        "trailer_reference",
        "external_load_reference",
        "bill_of_lading_number",
        "truck_ticket_number",
        "hold_reason_code",
    ):
        if field_name not in changes:
            continue
        movement_changes[field_name] = _normalize_optional_text(changes.get(field_name))
        source_field = f"{field_name}_source"
        if hasattr(movement, source_field):
            movement_changes[source_field] = DeliveryFieldSource.MANUAL.value

    if "status" in changes:
        requested_status = _validate_truck_movement_status(changes.get("status"))
        if requested_status not in {
            TruckMovementStatus.PLANNED,
            TruckMovementStatus.ASSIGNED,
            TruckMovementStatus.ON_HOLD,
        }:
            raise ValueError("Truck movement status patch is limited to PLANNED, ASSIGNED, or ON_HOLD.")
        movement_changes["status"] = requested_status.value
        if requested_status == TruckMovementStatus.ON_HOLD:
            hold_reason = movement_changes.get("hold_reason_code") or movement.hold_reason_code
            if not _normalize_optional_text(hold_reason):
                raise ValueError("Hold reason is required when moving a truck movement to ON_HOLD.")
            movement_changes["status_reason"] = (
                _normalize_optional_text(changes.get("status_reason"))
                or _normalize_optional_text(hold_reason)
            )
        else:
            movement_changes["status_reason"] = _normalize_optional_text(changes.get("status_reason"))
            if requested_status != TruckMovementStatus.ON_HOLD:
                movement_changes["hold_reason_code"] = None
                movement_changes["hold_reason_code_source"] = DeliveryFieldSource.MANUAL.value
    elif "status_reason" in changes:
        movement_changes["status_reason"] = _normalize_optional_text(changes.get("status_reason"))

    if _apply_model_changes(movement, movement_changes):
        _touch_audited_record(movement, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    movement_out = _movement_to_out(movement, stops=sorted(stops, key=_stop_sort_key))
    _append_truck_movement_audit(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeDeliveryTruckMovementUpdated",
        movement=movement_out,
        causation_id=f"delivery:{movement.delivery_id}:truck-movement:{movement.movement_id}",
        request_payload=changes,
    )
    return movement_out


def cancel_delivery_truck_movement(
    db: Session,
    *,
    movement_id: str,
    actor_id: str,
    cancel_reason: object | None,
    now: datetime | None = None,
) -> DeliveryTruckMovementOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    movement, _delivery, trade = _load_truck_movement(db, movement_id=movement_id)
    if movement.status == TruckMovementStatus.CANCELLED.value:
        raise ValueError(f"Truck movement '{movement_id}' is already cancelled.")
    if movement.status == TruckMovementStatus.COMPLETED.value:
        raise ValueError(f"Truck movement '{movement_id}' is already completed and cannot be cancelled.")
    normalized_reason = _normalize_required_text(cancel_reason, label="Cancel reason")
    stops = _movement_stops_by_id(db, movement_ids=[movement.movement_id]).get(movement.movement_id, [])
    for stop in stops:
        if stop.status in {
            TruckStopStatus.DEPARTED.value,
            TruckStopStatus.SKIPPED.value,
            TruckStopStatus.CANCELLED.value,
        }:
            continue
        if _apply_model_changes(
            stop,
            {
                "status": TruckStopStatus.CANCELLED.value,
                "status_reason": normalized_reason,
            },
        ):
            _touch_audited_record(stop, actor_id=actor_id, reference_time=reference_time)
    if _apply_model_changes(
        movement,
        {
            "status": TruckMovementStatus.CANCELLED.value,
            "status_reason": normalized_reason,
            "current_stop_sequence": None,
            "current_location_code": None,
            "hold_reason_code": None,
            "hold_reason_code_source": DeliveryFieldSource.MANUAL.value,
        },
    ):
        _touch_audited_record(movement, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    refreshed_stops = _movement_stops_by_id(db, movement_ids=[movement.movement_id]).get(movement.movement_id, [])
    movement_out = _movement_to_out(movement, stops=refreshed_stops)
    _append_truck_movement_audit(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeDeliveryTruckMovementCancelled",
        movement=movement_out,
        causation_id=f"delivery:{movement.delivery_id}:truck-movement:{movement.movement_id}:cancel",
        request_payload={"cancel_reason": normalized_reason},
    )
    return movement_out


def create_delivery_truck_stop(
    db: Session,
    *,
    movement_id: str,
    actor_id: str,
    payload: object,
    now: datetime | None = None,
) -> DeliveryTruckMovementOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    movement, _delivery, trade = _load_truck_movement(db, movement_id=movement_id)
    stops = _movement_stops_by_id(db, movement_ids=[movement.movement_id]).get(movement.movement_id, [])
    if _movement_execution_started(movement, stops=stops):
        raise ValueError("Truck stops cannot be added after execution starts.")

    requested_status = getattr(payload, "status", None)
    if requested_status is not None and _validate_truck_stop_status(requested_status) != TruckStopStatus.PLANNED:
        raise ValueError("New truck stops must start in PLANNED status.")

    stop_sequence = getattr(payload, "stop_sequence", None)
    if stop_sequence is None:
        insert_sequence = len(stops) + 1
    else:
        insert_sequence = _normalize_required_positive_int(stop_sequence, label="Truck stop sequence")
    if insert_sequence < 1 or insert_sequence > len(stops) + 1:
        raise ValueError(f"Truck stop sequence must be between 1 and {len(stops) + 1}.")

    for stop in sorted(stops, key=_stop_sort_key):
        if stop.stop_sequence >= insert_sequence:
            stop.stop_sequence += 1
            _touch_audited_record(stop, actor_id=actor_id, reference_time=reference_time)

    planned_arrival_start = _normalize_optional_datetime(
        getattr(payload, "planned_arrival_start", None),
        label="Truck stop planned arrival start",
    )
    planned_arrival_end = _normalize_optional_datetime(
        getattr(payload, "planned_arrival_end", None),
        label="Truck stop planned arrival end",
    )
    planned_departure_start = _normalize_optional_datetime(
        getattr(payload, "planned_departure_start", None),
        label="Truck stop planned departure start",
    )
    planned_departure_end = _normalize_optional_datetime(
        getattr(payload, "planned_departure_end", None),
        label="Truck stop planned departure end",
    )
    _validate_stop_window(
        planned_arrival_start=planned_arrival_start,
        planned_arrival_end=planned_arrival_end,
        planned_departure_start=planned_departure_start,
        planned_departure_end=planned_departure_end,
    )
    new_stop = _create_stop_model(
        movement_id=movement.movement_id,
        stop_sequence=insert_sequence,
        stop_type=_validate_truck_stop_type(getattr(payload, "stop_type", None)),
        location_code=_normalize_optional_text(getattr(payload, "location_code", None)),
        planned_arrival_start=planned_arrival_start,
        planned_arrival_end=planned_arrival_end,
        planned_departure_start=planned_departure_start,
        planned_departure_end=planned_departure_end,
        appointment_reference=_normalize_optional_text(getattr(payload, "appointment_reference", None)),
        planned_quantity=_normalize_optional_positive_float(
            getattr(payload, "planned_quantity", None),
            label="Truck stop planned quantity",
        ),
        status=TruckStopStatus.PLANNED,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    db.add(new_stop)
    all_stops = sorted([*stops, new_stop], key=_stop_sort_key)
    _validate_movement_stop_set(all_stops)
    _refresh_movement_projection(
        movement,
        stops=all_stops,
        actor_id=actor_id,
        reference_time=reference_time,
    )

    db.flush()
    movement_out = _movement_to_out(movement, stops=all_stops)
    _append_truck_movement_audit(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeDeliveryTruckStopAdded",
        movement=movement_out,
        causation_id=f"delivery:{movement.delivery_id}:truck-movement:{movement.movement_id}:stop-added",
        request_payload=jsonable_encoder(getattr(payload, "model_dump", lambda **_: {})()),
    )
    return movement_out


def update_delivery_truck_stop(
    db: Session,
    *,
    stop_id: str,
    actor_id: str,
    changes: dict[str, object | None],
    now: datetime | None = None,
) -> DeliveryTruckMovementOut:
    if not changes:
        raise ValueError("At least one truck stop field must be provided.")
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    stop, movement, _delivery, trade = _load_truck_stop(db, stop_id=stop_id)
    stops = _movement_stops_by_id(db, movement_ids=[movement.movement_id]).get(movement.movement_id, [])
    execution_started = _movement_execution_started(movement, stops=stops)

    next_sequence = stop.stop_sequence
    if "stop_sequence" in changes:
        if execution_started:
            raise ValueError("Truck stop sequence cannot be changed after execution starts.")
        next_sequence = _normalize_required_positive_int(changes.get("stop_sequence"), label="Truck stop sequence")
        if next_sequence < 1 or next_sequence > len(stops):
            raise ValueError(f"Truck stop sequence must be between 1 and {len(stops)}.")

    if "stop_type" in changes and execution_started:
        raise ValueError("Truck stop type cannot be changed after execution starts.")

    if next_sequence != stop.stop_sequence:
        original_sequence = stop.stop_sequence
        for sibling in stops:
            if sibling.stop_id == stop.stop_id:
                continue
            if next_sequence < original_sequence and next_sequence <= sibling.stop_sequence < original_sequence:
                sibling.stop_sequence += 1
                _touch_audited_record(sibling, actor_id=actor_id, reference_time=reference_time)
            elif next_sequence > original_sequence and original_sequence < sibling.stop_sequence <= next_sequence:
                sibling.stop_sequence -= 1
                _touch_audited_record(sibling, actor_id=actor_id, reference_time=reference_time)
        stop.stop_sequence = next_sequence
        _touch_audited_record(stop, actor_id=actor_id, reference_time=reference_time)

    stop_changes: dict[str, object | None] = {}
    if "stop_type" in changes:
        stop_changes["stop_type"] = _validate_truck_stop_type(changes.get("stop_type")).value
    if "location_code" in changes:
        stop_changes["location_code"] = _normalize_optional_text(changes.get("location_code"))
        stop_changes["location_code_source"] = DeliveryFieldSource.MANUAL.value
    if "appointment_reference" in changes:
        stop_changes["appointment_reference"] = _normalize_optional_text(changes.get("appointment_reference"))
        stop_changes["appointment_reference_source"] = DeliveryFieldSource.MANUAL.value
    if "planned_quantity" in changes:
        stop_changes["planned_quantity"] = _normalize_optional_positive_float(
            changes.get("planned_quantity"),
            label="Truck stop planned quantity",
        )
    if "actual_quantity" in changes:
        stop_changes["actual_quantity"] = _normalize_optional_positive_float(
            changes.get("actual_quantity"),
            label="Truck stop actual quantity",
        )
    for field_name, label in (
        ("planned_arrival_start", "Truck stop planned arrival start"),
        ("planned_arrival_end", "Truck stop planned arrival end"),
        ("planned_departure_start", "Truck stop planned departure start"),
        ("planned_departure_end", "Truck stop planned departure end"),
        ("actual_arrived_at", "Truck stop actual arrival"),
        ("actual_departed_at", "Truck stop actual departure"),
    ):
        if field_name in changes:
            stop_changes[field_name] = _normalize_optional_datetime(changes.get(field_name), label=label)
    if "status" in changes:
        stop_changes["status"] = _validate_truck_stop_status(changes.get("status")).value
    if "status_reason" in changes:
        stop_changes["status_reason"] = _normalize_optional_text(changes.get("status_reason"))

    next_planned_arrival_start = stop_changes.get("planned_arrival_start", _coerce_utc(stop.planned_arrival_start))
    next_planned_arrival_end = stop_changes.get("planned_arrival_end", _coerce_utc(stop.planned_arrival_end))
    next_planned_departure_start = stop_changes.get(
        "planned_departure_start",
        _coerce_utc(stop.planned_departure_start),
    )
    next_planned_departure_end = stop_changes.get(
        "planned_departure_end",
        _coerce_utc(stop.planned_departure_end),
    )
    next_actual_arrived_at = stop_changes.get("actual_arrived_at", _coerce_utc(stop.actual_arrived_at))
    next_actual_departed_at = stop_changes.get("actual_departed_at", _coerce_utc(stop.actual_departed_at))
    _validate_stop_window(
        planned_arrival_start=next_planned_arrival_start,
        planned_arrival_end=next_planned_arrival_end,
        planned_departure_start=next_planned_departure_start,
        planned_departure_end=next_planned_departure_end,
        actual_arrived_at=next_actual_arrived_at,
        actual_departed_at=next_actual_departed_at,
    )

    if _apply_model_changes(stop, stop_changes):
        _touch_audited_record(stop, actor_id=actor_id, reference_time=reference_time)

    ordered_stops = _validate_movement_stop_set(stops)
    _refresh_movement_projection(
        movement,
        stops=ordered_stops,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    db.flush()
    movement_out = _movement_to_out(movement, stops=ordered_stops)
    _append_truck_movement_audit(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeDeliveryTruckStopUpdated",
        movement=movement_out,
        causation_id=f"delivery:{movement.delivery_id}:truck-movement:{movement.movement_id}:stop-updated",
        request_payload=changes,
    )
    return movement_out


def skip_delivery_truck_stop(
    db: Session,
    *,
    stop_id: str,
    actor_id: str,
    skip_reason: object | None,
    now: datetime | None = None,
) -> DeliveryTruckMovementOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    stop, movement, _delivery, trade = _load_truck_stop(db, stop_id=stop_id)
    if stop.status != TruckStopStatus.PLANNED.value:
        raise ValueError("Only planned truck stops can be skipped.")
    normalized_reason = _normalize_required_text(skip_reason, label="Skip reason")
    if _apply_model_changes(
        stop,
        {
            "status": TruckStopStatus.SKIPPED.value,
            "status_reason": normalized_reason,
        },
    ):
        _touch_audited_record(stop, actor_id=actor_id, reference_time=reference_time)

    stops = _movement_stops_by_id(db, movement_ids=[movement.movement_id]).get(movement.movement_id, [])
    ordered_stops = _validate_movement_stop_set(stops)
    _refresh_movement_projection(
        movement,
        stops=ordered_stops,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    db.flush()
    movement_out = _movement_to_out(movement, stops=ordered_stops)
    _append_truck_movement_audit(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeDeliveryTruckStopSkipped",
        movement=movement_out,
        causation_id=f"delivery:{movement.delivery_id}:truck-movement:{movement.movement_id}:stop-skipped",
        request_payload={"skip_reason": normalized_reason},
    )
    return movement_out


def cancel_delivery_truck_stop(
    db: Session,
    *,
    stop_id: str,
    actor_id: str,
    cancel_reason: object | None,
    now: datetime | None = None,
) -> DeliveryTruckMovementOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    stop, movement, _delivery, trade = _load_truck_stop(db, stop_id=stop_id)
    if stop.status == TruckStopStatus.DEPARTED.value:
        raise ValueError("Departed truck stops cannot be cancelled.")
    normalized_reason = _normalize_required_text(cancel_reason, label="Cancel reason")
    if _apply_model_changes(
        stop,
        {
            "status": TruckStopStatus.CANCELLED.value,
            "status_reason": normalized_reason,
        },
    ):
        _touch_audited_record(stop, actor_id=actor_id, reference_time=reference_time)

    stops = _movement_stops_by_id(db, movement_ids=[movement.movement_id]).get(movement.movement_id, [])
    ordered_stops = _validate_movement_stop_set(stops)
    _refresh_movement_projection(
        movement,
        stops=ordered_stops,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    db.flush()
    movement_out = _movement_to_out(movement, stops=ordered_stops)
    _append_truck_movement_audit(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type="TradeDeliveryTruckStopCancelled",
        movement=movement_out,
        causation_id=f"delivery:{movement.delivery_id}:truck-movement:{movement.movement_id}:stop-cancelled",
        request_payload={"cancel_reason": normalized_reason},
    )
    return movement_out
