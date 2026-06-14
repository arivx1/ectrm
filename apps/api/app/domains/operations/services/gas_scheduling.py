from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.audit_events import append_trade_audit_event
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import DeliveryExecutionStatus
from apps.api.app.shared.enums import DeliveryFieldSource
from apps.api.app.shared.enums import DeliveryModeFamily
from apps.api.app.shared.enums import NominationStatus
from apps.api.app.shared.enums import TradeNature
from apps.api.app.shared.enums import TradeStatus
from apps.api.app.shared.enums import TransportMode

ZERO = Decimal("0")
GAS_SCHEDULE_BASIS_V1 = "delivery_obligation_pipeline_nomination_v1"
GAS_SCHEDULE_READINESS_READY = "READY"
GAS_SCHEDULE_READINESS_BLOCKED = "BLOCKED"
GAS_SCHEDULE_READINESS_IN_FLIGHT = "IN_FLIGHT"
GAS_SCHEDULE_READINESS_COMPLETE = "COMPLETE"
GAS_SCHEDULE_READINESS_NOT_REQUIRED = "NOT_REQUIRED"
GAS_SCHEDULE_NEXT_ACTION_RESOLVE_BLOCKERS = "RESOLVE_BLOCKERS"
GAS_SCHEDULE_NEXT_ACTION_CAPTURE_SCHEDULE = "CAPTURE_SCHEDULE"
GAS_SCHEDULE_NEXT_ACTION_SUBMIT_NOMINATION = "SUBMIT_NOMINATION"
GAS_SCHEDULE_NEXT_ACTION_COMPLETE_NOMINATION = "COMPLETE_NOMINATION"
GAS_SCHEDULE_NEXT_ACTION_NONE = "NONE"
GAS_SCHEDULE_STATUS_TRANSITIONS: dict[str, set[str]] = {
    NominationStatus.PENDING.value: {
        NominationStatus.SCHEDULED.value,
        NominationStatus.NOMINATED.value,
        NominationStatus.NOT_REQUIRED.value,
    },
    NominationStatus.SCHEDULED.value: {
        NominationStatus.PENDING.value,
        NominationStatus.NOMINATED.value,
        NominationStatus.COMPLETED.value,
    },
    NominationStatus.NOMINATED.value: {
        NominationStatus.PENDING.value,
        NominationStatus.SCHEDULED.value,
        NominationStatus.COMPLETED.value,
    },
    NominationStatus.COMPLETED.value: set(),
    NominationStatus.NOT_REQUIRED.value: set(),
}
NOMINATION_REFERENCE_REQUIRED_STATUSES = {
    NominationStatus.NOMINATED.value,
    NominationStatus.COMPLETED.value,
}


@dataclass(frozen=True)
class GasScheduleBlocker:
    code: str
    message: str
    field: str | None
    severity: str = "BLOCKING"

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "field": self.field,
            "severity": self.severity,
        }


@dataclass(frozen=True)
class GasScheduleEvidence:
    delivery_id: str
    trade_id: str
    trade_nature: str | None
    trade_status: str | None
    confirmation_status: str | None
    nomination_status: str | None
    mode_family: str | None
    transport_mode: str | None
    scheduled_quantity: Decimal | None
    quantity_unit_code: str | None
    gas_day_start: date | None
    gas_day_end: date | None
    owner: str | None
    pipeline_system: str | None
    pipeline_path: str | None
    receipt_location_code: str | None
    delivery_location_code: str | None
    contract_number: str | None
    cycle_code: str | None
    nomination_reference: str | None

    def commitment_dict(self) -> dict[str, Any]:
        return {
            "scheduled_quantity": float(self.scheduled_quantity) if self.scheduled_quantity is not None else None,
            "quantity_unit_code": self.quantity_unit_code,
            "gas_day_start": self.gas_day_start,
            "gas_day_end": self.gas_day_end,
            "owner": self.owner,
            "pipeline_system": self.pipeline_system,
            "pipeline_path": self.pipeline_path,
            "receipt_location_code": self.receipt_location_code,
            "delivery_location_code": self.delivery_location_code,
            "contract_number": self.contract_number,
            "cycle_code": self.cycle_code,
            "nomination_reference": self.nomination_reference,
        }


@dataclass(frozen=True)
class GasScheduleReadiness:
    generated_at: datetime
    delivery_id: str
    trade_id: str
    basis: str
    readiness_status: str
    next_action: str
    current_nomination_status: str | None
    allowed_transitions: tuple[str, ...]
    blocker_count: int
    blockers: tuple[GasScheduleBlocker, ...]
    schedule_commitment: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "delivery_id": self.delivery_id,
            "trade_id": self.trade_id,
            "basis": self.basis,
            "readiness_status": self.readiness_status,
            "next_action": self.next_action,
            "current_nomination_status": self.current_nomination_status,
            "allowed_transitions": list(self.allowed_transitions),
            "blocker_count": self.blocker_count,
            "blockers": [blocker.to_dict() for blocker in self.blockers],
            "schedule_commitment": self.schedule_commitment,
        }


@dataclass(frozen=True)
class GasScheduleCommitmentInput:
    scheduled_quantity: Decimal | float | int | str | None = None
    quantity_unit_code: str | None = None
    gas_day_start: date | datetime | str | None = None
    gas_day_end: date | datetime | str | None = None
    owner: str | None = None
    pipeline_system: str | None = None
    pipeline_path: str | None = None
    receipt_location_code: str | None = None
    delivery_location_code: str | None = None
    contract_number: str | None = None
    cycle_code: str | None = None
    nomination_reference: str | None = None


def build_gas_schedule_readiness(
    db: Session,
    *,
    delivery_id: str,
    target_status: str | None = None,
    now: datetime | None = None,
) -> GasScheduleReadiness:
    generated_at = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, trade, pipeline_detail = _load_gas_schedule_records(db, delivery_id=delivery_id)
    evidence = gas_schedule_evidence_from_records(
        delivery=delivery,
        trade=trade,
        pipeline_detail=pipeline_detail,
    )
    return build_gas_schedule_readiness_from_evidence(
        evidence,
        target_status=target_status,
        generated_at=generated_at,
    )


def build_gas_schedule_readiness_from_evidence(
    evidence: GasScheduleEvidence,
    *,
    target_status: str | None = None,
    generated_at: datetime | None = None,
) -> GasScheduleReadiness:
    normalized_target_status = _normalize_status_or_none(target_status)
    blockers = tuple(
        build_gas_schedule_blockers(
            evidence,
            target_status=normalized_target_status,
        )
    )
    current_status = _normalize_status_or_none(evidence.nomination_status) or NominationStatus.PENDING.value
    allowed_transitions = _allowed_transitions_for_status(current_status, evidence=evidence, blockers=blockers)
    readiness_status = _readiness_status(
        current_status=current_status,
        blockers=blockers,
    )
    return GasScheduleReadiness(
        generated_at=generated_at or datetime.now(timezone.utc),
        delivery_id=evidence.delivery_id,
        trade_id=evidence.trade_id,
        basis=GAS_SCHEDULE_BASIS_V1,
        readiness_status=readiness_status,
        next_action=_next_action(
            current_status=current_status,
            blockers=blockers,
        ),
        current_nomination_status=current_status,
        allowed_transitions=tuple(allowed_transitions),
        blocker_count=len(blockers),
        blockers=blockers,
        schedule_commitment=evidence.commitment_dict(),
    )


def build_gas_schedule_blockers(
    evidence: GasScheduleEvidence,
    *,
    target_status: str | None = None,
    include_common_fields: bool = True,
) -> list[GasScheduleBlocker]:
    blockers: list[GasScheduleBlocker] = []
    normalized_target_status = _normalize_status_or_none(target_status)
    current_status = _normalize_status_or_none(evidence.nomination_status)
    if normalized_target_status == NominationStatus.NOT_REQUIRED.value:
        return []
    if current_status == NominationStatus.NOT_REQUIRED.value and normalized_target_status is None:
        return []
    nomination_reference_required = (
        normalized_target_status in NOMINATION_REFERENCE_REQUIRED_STATUSES
        or current_status in NOMINATION_REFERENCE_REQUIRED_STATUSES
    )

    if include_common_fields:
        if _normalize_code(evidence.trade_nature) != TradeNature.PHYSICAL.value:
            blockers.append(
                GasScheduleBlocker(
                    code="NON_PHYSICAL_TRADE",
                    message="Gas scheduling applies only to physical trades.",
                    field="trade_nature",
                )
            )
        if _normalize_code(evidence.trade_status) != TradeStatus.ACTIVE.value:
            blockers.append(
                GasScheduleBlocker(
                    code="INACTIVE_TRADE",
                    message="Gas scheduling applies only to active trades.",
                    field="status",
                )
            )
        if _normalize_code(evidence.mode_family) != DeliveryModeFamily.NETWORK_FLOW.value:
            blockers.append(
                GasScheduleBlocker(
                    code="NOT_NETWORK_FLOW",
                    message="Gas scheduling requires a network-flow delivery obligation.",
                    field="mode_family",
                )
            )
        if _normalize_code(evidence.transport_mode) != TransportMode.PIPELINE.value:
            blockers.append(
                GasScheduleBlocker(
                    code="NOT_PIPELINE_MOVEMENT",
                    message="Gas scheduling requires pipeline transport mode.",
                    field="transport_mode",
                )
            )
        if _normalize_code(evidence.confirmation_status) != "CONFIRMED":
            blockers.append(
                GasScheduleBlocker(
                    code="CONFIRMATION_NOT_COMPLETE",
                    message="Trade confirmation must be complete before gas scheduling can be committed.",
                    field="confirmation_status",
                )
            )
        if evidence.scheduled_quantity is None or evidence.scheduled_quantity <= ZERO:
            blockers.append(
                GasScheduleBlocker(
                    code="MISSING_SCHEDULED_QUANTITY",
                    message="Scheduled quantity must be greater than zero.",
                    field="scheduled_quantity",
                )
            )
        if not _normalize_optional_text(evidence.quantity_unit_code):
            blockers.append(
                GasScheduleBlocker(
                    code="MISSING_QUANTITY_UNIT",
                    message="Scheduled quantity unit is required.",
                    field="quantity_unit_code",
                )
            )
        if evidence.gas_day_start is None or evidence.gas_day_end is None:
            blockers.append(
                GasScheduleBlocker(
                    code="MISSING_GAS_DAY_WINDOW",
                    message="Start and end gas day are required.",
                    field="gas_day_start",
                )
            )
        elif evidence.gas_day_start > evidence.gas_day_end:
            blockers.append(
                GasScheduleBlocker(
                    code="INVALID_GAS_DAY_WINDOW",
                    message="Start gas day must be on or before end gas day.",
                    field="gas_day_start",
                )
            )

    if not _normalize_optional_text(evidence.owner):
        blockers.append(
            GasScheduleBlocker(
                code="MISSING_SCHEDULE_OWNER",
                message="Operations owner is required for gas schedule commitment.",
                field="owner",
            )
        )
    if not _normalize_optional_text(evidence.pipeline_system):
        blockers.append(
            GasScheduleBlocker(
                code="MISSING_PIPELINE_SYSTEM",
                message="Pipeline system is required for gas schedule commitment.",
                field="pipeline_system",
            )
        )
    if not _normalize_optional_text(evidence.pipeline_path):
        blockers.append(
            GasScheduleBlocker(
                code="MISSING_PIPELINE_PATH",
                message="Pipeline route/path is required for gas schedule commitment.",
                field="pipeline_path",
            )
        )
    if not _normalize_optional_text(evidence.receipt_location_code):
        blockers.append(
            GasScheduleBlocker(
                code="MISSING_RECEIPT_LOCATION",
                message="Receipt location is required for gas schedule commitment.",
                field="receipt_location_code",
            )
        )
    if not _normalize_optional_text(evidence.delivery_location_code):
        blockers.append(
            GasScheduleBlocker(
                code="MISSING_DELIVERY_LOCATION",
                message="Delivery location is required for gas schedule commitment.",
                field="delivery_location_code",
            )
        )
    if nomination_reference_required and not _normalize_optional_text(evidence.nomination_reference):
        blockers.append(
            GasScheduleBlocker(
                code="MISSING_NOMINATION_REFERENCE",
                message="Nomination reference is required once gas movement is nominated or completed.",
                field="nomination_reference",
            )
        )

    return blockers


def record_gas_schedule_commitment(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    payload: GasScheduleCommitmentInput,
    target_status: str | None = None,
    now: datetime | None = None,
) -> GasScheduleReadiness:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, trade, pipeline_detail = _load_gas_schedule_records(db, delivery_id=delivery_id)
    if pipeline_detail is None:
        pipeline_detail = _create_pipeline_detail(
            db,
            delivery=delivery,
            actor_id=actor_id,
            reference_time=reference_time,
        )

    requested_payload = _commitment_input_to_change_payload(payload)
    _apply_commitment_changes(
        delivery=delivery,
        pipeline_detail=pipeline_detail,
        actor_id=actor_id,
        reference_time=reference_time,
        payload=payload,
    )
    db.flush()

    readiness = build_gas_schedule_readiness(
        db,
        delivery_id=delivery_id,
        target_status=target_status,
        now=reference_time,
    )
    if target_status is not None:
        readiness = transition_gas_schedule_status(
            db,
            delivery_id=delivery_id,
            actor_id=actor_id,
            target_status=target_status,
            now=reference_time,
            requested_payload=requested_payload,
        )
    else:
        _append_schedule_audit(
            db,
            trade=trade,
            delivery=delivery,
            actor_id=actor_id,
            event_type="TradeGasScheduleCommitmentCaptured",
            reference_time=reference_time,
            readiness=readiness,
            requested_payload=requested_payload,
        )
    return readiness


def transition_gas_schedule_status(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    target_status: str,
    now: datetime | None = None,
    requested_payload: dict[str, Any] | None = None,
) -> GasScheduleReadiness:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    normalized_target_status = _normalize_required_status(target_status)
    delivery, trade, _pipeline_detail = _load_gas_schedule_records(db, delivery_id=delivery_id)
    current_status = _normalize_required_status(trade.nomination_status)
    if normalized_target_status not in GAS_SCHEDULE_STATUS_TRANSITIONS.get(current_status, set()):
        raise ValueError(
            f"Cannot transition gas schedule from {current_status} to {normalized_target_status}."
        )

    readiness = build_gas_schedule_readiness(
        db,
        delivery_id=delivery_id,
        target_status=normalized_target_status,
        now=reference_time,
    )
    if readiness.blockers:
        blocker_summary = "; ".join(blocker.message for blocker in readiness.blockers)
        raise ValueError(f"Gas schedule transition is blocked: {blocker_summary}")

    trade.nomination_status = normalized_target_status
    trade.updated_at = reference_time
    delivery.execution_status = _execution_status_for_nomination_status(normalized_target_status)
    delivery.execution_status_source = DeliveryFieldSource.MANUAL.value
    _touch_record(delivery, actor_id=actor_id, reference_time=reference_time)
    db.flush()

    final_readiness = build_gas_schedule_readiness(
        db,
        delivery_id=delivery_id,
        now=reference_time,
    )
    _append_schedule_audit(
        db,
        trade=trade,
        delivery=delivery,
        actor_id=actor_id,
        event_type="TradeGasScheduleStatusTransitioned",
        reference_time=reference_time,
        readiness=final_readiness,
        requested_payload={
            **(requested_payload or {}),
            "from_status": current_status,
            "target_status": normalized_target_status,
        },
    )
    return final_readiness


def gas_schedule_evidence_from_records(
    *,
    delivery: DeliveryObligation,
    trade: Trade,
    pipeline_detail: DeliveryPipelineDetail | None,
) -> GasScheduleEvidence:
    return GasScheduleEvidence(
        delivery_id=delivery.delivery_id,
        trade_id=delivery.trade_id,
        trade_nature=trade.trade_nature,
        trade_status=trade.status,
        confirmation_status=trade.confirmation_status,
        nomination_status=trade.nomination_status,
        mode_family=delivery.mode_family,
        transport_mode=delivery.transport_mode,
        scheduled_quantity=_decimal_or_none(delivery.volume),
        quantity_unit_code=_normalize_optional_text(delivery.unit_of_measure),
        gas_day_start=delivery.delivery_start,
        gas_day_end=delivery.delivery_end,
        owner=_normalize_optional_text(delivery.operations_owner),
        pipeline_system=_normalize_optional_text(pipeline_detail.pipeline_system if pipeline_detail else None),
        pipeline_path=_normalize_optional_text(pipeline_detail.pipeline_path if pipeline_detail else None),
        receipt_location_code=_normalize_optional_text(
            pipeline_detail.receipt_location_code if pipeline_detail else None
        ),
        delivery_location_code=_normalize_optional_text(
            pipeline_detail.delivery_location_code if pipeline_detail else None
        ),
        contract_number=_normalize_optional_text(pipeline_detail.contract_number if pipeline_detail else None),
        cycle_code=_normalize_optional_text(pipeline_detail.cycle_code if pipeline_detail else None),
        nomination_reference=_normalize_optional_text(
            pipeline_detail.nomination_reference if pipeline_detail else None
        ),
    )


def _load_gas_schedule_records(
    db: Session,
    *,
    delivery_id: str,
) -> tuple[DeliveryObligation, Trade, DeliveryPipelineDetail | None]:
    row = db.execute(
        select(DeliveryObligation, Trade)
        .join(Trade, Trade.trade_id == DeliveryObligation.trade_id)
        .where(DeliveryObligation.delivery_id == delivery_id)
    ).first()
    if row is None:
        raise LookupError(f"Delivery '{delivery_id}' was not found.")
    delivery, trade = row
    return delivery, trade, db.get(DeliveryPipelineDetail, delivery.delivery_id)


def _create_pipeline_detail(
    db: Session,
    *,
    delivery: DeliveryObligation,
    actor_id: str,
    reference_time: datetime,
) -> DeliveryPipelineDetail:
    pipeline_detail = DeliveryPipelineDetail(
        delivery_id=delivery.delivery_id,
        pipeline_system=None,
        pipeline_system_source=DeliveryFieldSource.SYSTEM_GENERATED.value,
        pipeline_path=None,
        pipeline_path_source=DeliveryFieldSource.SYSTEM_GENERATED.value,
        receipt_location_code=None,
        receipt_location_code_source=DeliveryFieldSource.SYSTEM_GENERATED.value,
        delivery_location_code=delivery.location_code,
        delivery_location_code_source=DeliveryFieldSource.TRADE_DERIVED.value,
        contract_number=None,
        contract_number_source=DeliveryFieldSource.SYSTEM_GENERATED.value,
        cycle_code=None,
        cycle_code_source=DeliveryFieldSource.SYSTEM_GENERATED.value,
        nomination_reference=None,
        nomination_reference_source=DeliveryFieldSource.SYSTEM_GENERATED.value,
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    db.add(pipeline_detail)
    return pipeline_detail


def _apply_commitment_changes(
    *,
    delivery: DeliveryObligation,
    pipeline_detail: DeliveryPipelineDetail,
    actor_id: str,
    reference_time: datetime,
    payload: GasScheduleCommitmentInput,
) -> None:
    delivery_changed = False
    pipeline_changed = False

    if payload.scheduled_quantity is not None:
        delivery.volume = _normalize_positive_quantity(payload.scheduled_quantity)
        delivery_changed = True
    if payload.quantity_unit_code is not None:
        delivery.unit_of_measure = _normalize_required_text(payload.quantity_unit_code, field_name="quantity unit")
        delivery_changed = True
    if payload.gas_day_start is not None:
        delivery.delivery_start = _coerce_date(payload.gas_day_start, field_name="gas day start")
        delivery.delivery_window_source = DeliveryFieldSource.MANUAL.value
        delivery_changed = True
    if payload.gas_day_end is not None:
        delivery.delivery_end = _coerce_date(payload.gas_day_end, field_name="gas day end")
        delivery.delivery_window_source = DeliveryFieldSource.MANUAL.value
        delivery_changed = True
    if payload.owner is not None:
        delivery.operations_owner = _normalize_required_text(payload.owner, field_name="owner")
        delivery.operations_owner_source = DeliveryFieldSource.MANUAL.value
        delivery_changed = True

    pipeline_field_map = {
        "pipeline_system": payload.pipeline_system,
        "pipeline_path": payload.pipeline_path,
        "receipt_location_code": payload.receipt_location_code,
        "delivery_location_code": payload.delivery_location_code,
        "contract_number": payload.contract_number,
        "cycle_code": payload.cycle_code,
        "nomination_reference": payload.nomination_reference,
    }
    for field_name, raw_value in pipeline_field_map.items():
        if raw_value is None:
            continue
        setattr(pipeline_detail, field_name, _normalize_required_text(raw_value, field_name=field_name))
        setattr(pipeline_detail, f"{field_name}_source", DeliveryFieldSource.MANUAL.value)
        pipeline_changed = True

    if delivery.delivery_start is not None and delivery.delivery_end is not None and delivery.delivery_start > delivery.delivery_end:
        raise ValueError("Start gas day must be on or before end gas day.")
    if delivery_changed:
        _touch_record(delivery, actor_id=actor_id, reference_time=reference_time)
    if pipeline_changed:
        _touch_record(pipeline_detail, actor_id=actor_id, reference_time=reference_time)


def _allowed_transitions_for_status(
    current_status: str,
    *,
    evidence: GasScheduleEvidence,
    blockers: tuple[GasScheduleBlocker, ...],
) -> list[str]:
    candidates = sorted(GAS_SCHEDULE_STATUS_TRANSITIONS.get(current_status, set()))
    if blockers:
        return [status for status in candidates if status == NominationStatus.PENDING.value]
    if not _normalize_optional_text(evidence.nomination_reference):
        return [
            status
            for status in candidates
            if status not in NOMINATION_REFERENCE_REQUIRED_STATUSES
        ]
    return candidates


def _readiness_status(
    *,
    current_status: str,
    blockers: tuple[GasScheduleBlocker, ...],
) -> str:
    if current_status == NominationStatus.NOT_REQUIRED.value:
        return GAS_SCHEDULE_READINESS_NOT_REQUIRED
    if current_status == NominationStatus.COMPLETED.value:
        return GAS_SCHEDULE_READINESS_COMPLETE if not blockers else GAS_SCHEDULE_READINESS_BLOCKED
    if blockers:
        return GAS_SCHEDULE_READINESS_BLOCKED
    if current_status in {NominationStatus.SCHEDULED.value, NominationStatus.NOMINATED.value}:
        return GAS_SCHEDULE_READINESS_IN_FLIGHT
    return GAS_SCHEDULE_READINESS_READY


def _next_action(
    *,
    current_status: str,
    blockers: tuple[GasScheduleBlocker, ...],
) -> str:
    if blockers:
        return GAS_SCHEDULE_NEXT_ACTION_RESOLVE_BLOCKERS
    if current_status == NominationStatus.PENDING.value:
        return GAS_SCHEDULE_NEXT_ACTION_CAPTURE_SCHEDULE
    if current_status == NominationStatus.SCHEDULED.value:
        return GAS_SCHEDULE_NEXT_ACTION_SUBMIT_NOMINATION
    if current_status == NominationStatus.NOMINATED.value:
        return GAS_SCHEDULE_NEXT_ACTION_COMPLETE_NOMINATION
    return GAS_SCHEDULE_NEXT_ACTION_NONE


def _execution_status_for_nomination_status(status: str) -> str:
    if status == NominationStatus.PENDING.value:
        return DeliveryExecutionStatus.PLANNED.value
    if status == NominationStatus.NOT_REQUIRED.value:
        return DeliveryExecutionStatus.PLANNED.value
    return DeliveryExecutionStatus.SCHEDULED.value


def _append_schedule_audit(
    db: Session,
    *,
    trade: Trade,
    delivery: DeliveryObligation,
    actor_id: str,
    event_type: str,
    reference_time: datetime,
    readiness: GasScheduleReadiness,
    requested_payload: dict[str, Any],
) -> None:
    append_trade_audit_event(
        db,
        trade_id=trade.trade_id,
        actor_id=actor_id,
        event_type=event_type,
        occurred_at=reference_time,
        causation_id=f"delivery:{delivery.delivery_id}",
        payload={
            "delivery_id": delivery.delivery_id,
            "basis": GAS_SCHEDULE_BASIS_V1,
            "requested_changes": requested_payload,
            "readiness": readiness.to_dict(),
        },
    )


def _commitment_input_to_change_payload(payload: GasScheduleCommitmentInput) -> dict[str, Any]:
    return {
        "scheduled_quantity": float(_decimal_or_none(payload.scheduled_quantity) or ZERO)
        if payload.scheduled_quantity is not None
        else None,
        "quantity_unit_code": payload.quantity_unit_code,
        "gas_day_start": _coerce_date(payload.gas_day_start, field_name="gas day start")
        if payload.gas_day_start is not None
        else None,
        "gas_day_end": _coerce_date(payload.gas_day_end, field_name="gas day end")
        if payload.gas_day_end is not None
        else None,
        "owner": payload.owner,
        "pipeline_system": payload.pipeline_system,
        "pipeline_path": payload.pipeline_path,
        "receipt_location_code": payload.receipt_location_code,
        "delivery_location_code": payload.delivery_location_code,
        "contract_number": payload.contract_number,
        "cycle_code": payload.cycle_code,
        "nomination_reference": payload.nomination_reference,
    }


def _touch_record(record: object, *, actor_id: str, reference_time: datetime) -> None:
    setattr(record, "updated_at", reference_time)
    setattr(record, "updated_by", actor_id)
    setattr(record, "version", int(getattr(record, "version", 0) or 0) + 1)


def _normalize_required_status(value: object | None) -> str:
    normalized = _normalize_status_or_none(value)
    if normalized is None:
        raise ValueError("Nomination status is required.")
    try:
        return NominationStatus(normalized).value
    except ValueError as exc:
        valid_values = ", ".join(status.value for status in NominationStatus)
        raise ValueError(f"Nomination status '{normalized}' is invalid. Expected one of: {valid_values}.") from exc


def _normalize_status_or_none(value: object | None) -> str | None:
    normalized = _normalize_code(value)
    if not normalized:
        return None
    return normalized


def _normalize_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _normalize_optional_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _normalize_required_text(value: object | None, *, field_name: str) -> str:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        raise ValueError(f"{field_name} is required.")
    return normalized


def _normalize_positive_quantity(value: object | None) -> Decimal:
    quantity = _decimal_or_none(value)
    if quantity is None:
        raise ValueError("Scheduled quantity is required.")
    if quantity <= ZERO:
        raise ValueError("Scheduled quantity must be greater than zero.")
    return quantity


def _decimal_or_none(value: object | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError(f"Quantity value '{value}' is not numeric.") from exc


def _coerce_date(value: object | None, *, field_name: str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name} is required.")
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"{field_name} must be an ISO date.") from exc


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
