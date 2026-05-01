from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.audit_events import append_trade_audit_event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.schemas.shipment import DeliveryActualizationOut
from apps.api.app.shared.enums import ActualizationStatus
from apps.api.app.shared.enums import TradeNature
from apps.api.app.shared.enums import TradeStatus

ZERO = Decimal("0")


@dataclass(frozen=True)
class DeliveryTarget:
    delivery_id: str
    trade: Trade
    leg: TradeLeg | None
    planned_quantity: float | None
    unit_of_measure: str | None

    @property
    def trade_id(self) -> str:
        return self.trade.trade_id

    @property
    def leg_no(self) -> int | None:
        return self.leg.leg_no if self.leg is not None else None


@dataclass(frozen=True)
class DeliveryActualizationProjection:
    status: str
    actual_quantity: float | None
    actualized_at: datetime | None
    source: str | None
    notes: str | None
    updated_at: datetime | None
    quantity_variance: float | None


def _audit_actualization_payload(actualization: DeliveryActualizationOut) -> dict[str, object]:
    return actualization.model_dump(mode="json")


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_optional_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _normalize_required_text(value: object | None, *, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{field_name} is required.")
    return normalized


def _normalize_positive_quantity(value: object | None) -> Decimal:
    try:
        normalized = Decimal(str(value))
    except (ArithmeticError, InvalidOperation) as exc:
        raise ValueError("Actual quantity must be a numeric value.") from exc

    if normalized <= ZERO:
        raise ValueError("Actual quantity must be greater than zero.")
    return normalized


def _abs_decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None

    try:
        normalized = Decimal(str(value))
    except (ArithmeticError, InvalidOperation):
        return None
    return abs(normalized)


def build_delivery_obligation_id(trade_id: str, leg_no: int | None = None) -> str:
    leg_suffix = f"-L{leg_no}" if leg_no is not None else ""
    return f"DLV-{trade_id}{leg_suffix}"


def planned_quantity_for_trade_leg(trade: Trade, leg: TradeLeg | None) -> float | None:
    if leg is not None and leg.quantity is not None:
        return float(abs(Decimal(str(leg.quantity))))
    if trade.volume is not None:
        return float(abs(Decimal(str(trade.volume))))
    return None


def unit_of_measure_for_trade_leg(trade: Trade, leg: TradeLeg | None) -> str | None:
    return leg.quantity_unit_code if leg is not None else trade.unit_of_measure


def delivery_actualization_status_for_quantities(
    *,
    planned_quantity: float | None,
    actual_quantity: float | None,
) -> str:
    if actual_quantity is None or actual_quantity <= 0:
        return ActualizationStatus.PENDING.value

    planned_decimal = _abs_decimal(planned_quantity)
    actual_decimal = _abs_decimal(actual_quantity)
    if actual_decimal is None:
        return ActualizationStatus.PENDING.value
    if planned_decimal is None or planned_decimal <= ZERO or actual_decimal >= planned_decimal:
        return ActualizationStatus.ACTUALIZED.value
    return ActualizationStatus.PARTIALLY_ACTUALIZED.value


def build_delivery_actualization_projection(
    *,
    trade: Trade,
    leg: TradeLeg | None,
    actualization: TradeActualization | None,
) -> DeliveryActualizationProjection:
    if trade.trade_nature != TradeNature.PHYSICAL.value or trade.status != TradeStatus.ACTIVE.value:
        return DeliveryActualizationProjection(
            status=ActualizationStatus.NOT_REQUIRED.value,
            actual_quantity=None,
            actualized_at=None,
            source=None,
            notes=None,
            updated_at=None,
            quantity_variance=None,
        )

    active_actualization = actualization
    if active_actualization is not None and _coerce_utc(active_actualization.voided_at) is not None:
        active_actualization = None

    planned_quantity = planned_quantity_for_trade_leg(trade, leg)
    actual_quantity = float(active_actualization.actual_quantity) if active_actualization is not None else None
    quantity_variance = (
        actual_quantity - planned_quantity
        if actual_quantity is not None and planned_quantity is not None
        else None
    )

    return DeliveryActualizationProjection(
        status=delivery_actualization_status_for_quantities(
            planned_quantity=planned_quantity,
            actual_quantity=actual_quantity,
        ),
        actual_quantity=actual_quantity,
        actualized_at=_coerce_utc(active_actualization.actualized_at) if active_actualization is not None else None,
        source=active_actualization.source if active_actualization is not None else None,
        notes=active_actualization.notes if active_actualization is not None else None,
        updated_at=_coerce_utc(active_actualization.updated_at) if active_actualization is not None else None,
        quantity_variance=quantity_variance,
    )


def actualization_workflow_note(status: str) -> str | None:
    if status == ActualizationStatus.NOT_REQUIRED.value:
        return "No physical delivery actualization is required for this trade."
    if status == ActualizationStatus.PARTIALLY_ACTUALIZED.value:
        return "Partial execution actuals have been recorded. Finish remaining delivery actualization."
    if status == ActualizationStatus.ACTUALIZED.value:
        return "Delivery actualization is complete."
    return "Capture executed quantities and actual delivery timestamps as physical execution completes."


def _trade_legs(db: Session, *, trade_id: str) -> list[TradeLeg]:
    return db.execute(
        select(TradeLeg)
        .where(TradeLeg.trade_id == trade_id)
        .order_by(TradeLeg.leg_no.asc())
    ).scalars().all()


def delivery_targets_for_trade(db: Session, *, trade: Trade) -> list[DeliveryTarget]:
    legs = _trade_legs(db, trade_id=trade.trade_id)
    if not legs:
        return [
            DeliveryTarget(
                delivery_id=build_delivery_obligation_id(trade.trade_id),
                trade=trade,
                leg=None,
                planned_quantity=planned_quantity_for_trade_leg(trade, None),
                unit_of_measure=unit_of_measure_for_trade_leg(trade, None),
            )
        ]

    return [
        DeliveryTarget(
            delivery_id=build_delivery_obligation_id(trade.trade_id, leg.leg_no),
            trade=trade,
            leg=leg,
            planned_quantity=planned_quantity_for_trade_leg(trade, leg),
            unit_of_measure=unit_of_measure_for_trade_leg(trade, leg),
        )
        for leg in legs
    ]


def load_delivery_target(
    db: Session,
    *,
    trade_id: str,
    leg_no: int | None = None,
) -> DeliveryTarget:
    trade = db.execute(
        select(Trade).where(
            Trade.trade_id == trade_id,
            Trade.status == TradeStatus.ACTIVE.value,
        )
    ).scalars().first()
    if trade is None:
        raise LookupError(f"Trade '{trade_id}' was not found.")
    if trade.trade_nature != TradeNature.PHYSICAL.value:
        raise ValueError("Actualization is only supported for active physical trades.")

    targets = delivery_targets_for_trade(db, trade=trade)
    if leg_no is None:
        if len(targets) != 1 or targets[0].leg is not None:
            raise ValueError(
                f"Trade '{trade_id}' has leg-level delivery obligations. Provide a leg number to record actualization."
            )
        return targets[0]

    for target in targets:
        if target.leg_no == leg_no:
            return target
    raise LookupError(f"Trade '{trade_id}' does not have leg {leg_no}.")


def list_trade_actualizations_by_delivery_id(
    db: Session,
    *,
    trade_ids: list[str],
) -> dict[str, TradeActualization]:
    if not trade_ids:
        return {}

    rows = db.execute(
        select(TradeActualization)
        .where(TradeActualization.trade_id.in_(trade_ids))
        .order_by(TradeActualization.trade_id.asc(), TradeActualization.id.asc())
    ).scalars().all()
    return {row.delivery_id: row for row in rows}


def trade_has_actualization_record(db: Session, *, trade_id: str) -> bool:
    return (
        db.execute(
            select(TradeActualization.id)
            .where(
                TradeActualization.trade_id == trade_id,
                TradeActualization.voided_at.is_(None),
            )
            .limit(1)
        ).scalar_one_or_none()
        is not None
    )


def trade_actualization_status(
    db: Session,
    *,
    trade: Trade,
) -> str:
    if trade.trade_nature != TradeNature.PHYSICAL.value or trade.status != TradeStatus.ACTIVE.value:
        return ActualizationStatus.NOT_REQUIRED.value

    targets = delivery_targets_for_trade(db, trade=trade)
    actualizations_by_delivery_id = list_trade_actualizations_by_delivery_id(db, trade_ids=[trade.trade_id])
    statuses = [
        build_delivery_actualization_projection(
            trade=trade,
            leg=target.leg,
            actualization=actualizations_by_delivery_id.get(target.delivery_id),
        ).status
        for target in targets
    ]
    if statuses and all(status == ActualizationStatus.ACTUALIZED.value for status in statuses):
        return ActualizationStatus.ACTUALIZED.value
    if any(status in {ActualizationStatus.ACTUALIZED.value, ActualizationStatus.PARTIALLY_ACTUALIZED.value} for status in statuses):
        return ActualizationStatus.PARTIALLY_ACTUALIZED.value
    return ActualizationStatus.PENDING.value


def synchronize_trade_actualization_status(
    db: Session,
    *,
    trade: Trade,
    now: datetime | None = None,
) -> str:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    next_status = trade_actualization_status(db, trade=trade)
    if trade.actualization_status != next_status:
        trade.actualization_status = next_status
        trade.updated_at = reference_time
    return next_status


def synchronize_active_trade_actualization_statuses(
    db: Session,
    *,
    now: datetime | None = None,
) -> None:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trades = db.execute(
        select(Trade)
        .where(Trade.status == TradeStatus.ACTIVE.value)
        .order_by(Trade.updated_at.desc(), Trade.trade_id.desc())
    ).scalars().all()

    for trade in trades:
        synchronize_trade_actualization_status(db, trade=trade, now=reference_time)


def upsert_delivery_actualization(
    db: Session,
    *,
    trade_id: str,
    leg_no: int | None = None,
    actual_quantity: object | None,
    actualized_at: datetime | None,
    source: object | None,
    notes: object | None,
    actor_id: str,
    now: datetime | None = None,
) -> tuple[TradeActualization, DeliveryTarget]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    target = load_delivery_target(db, trade_id=trade_id, leg_no=leg_no)
    normalized_quantity = _normalize_positive_quantity(actual_quantity)
    normalized_actualized_at = _coerce_utc(actualized_at)
    if normalized_actualized_at is None:
        raise ValueError("Actualized timestamp is required.")

    row = db.execute(
        select(TradeActualization).where(TradeActualization.delivery_id == target.delivery_id)
    ).scalars().first()
    if row is None:
        row = TradeActualization(
            delivery_id=target.delivery_id,
            trade_id=target.trade_id,
            leg_no=target.leg_no,
            actual_quantity=normalized_quantity,
            actualized_at=normalized_actualized_at,
            source=_normalize_optional_text(source),
            notes=_normalize_optional_text(notes),
            created_at=reference_time,
            created_by=actor_id,
            updated_at=reference_time,
            updated_by=actor_id,
            version=1,
        )
        db.add(row)
        db.flush()
        return row, target

    changed = False
    if Decimal(str(row.actual_quantity)) != normalized_quantity:
        row.actual_quantity = normalized_quantity
        changed = True
    if _coerce_utc(row.actualized_at) != normalized_actualized_at:
        row.actualized_at = normalized_actualized_at
        changed = True

    normalized_source = _normalize_optional_text(source)
    if row.source != normalized_source:
        row.source = normalized_source
        changed = True

    normalized_notes = _normalize_optional_text(notes)
    if row.notes != normalized_notes:
        row.notes = normalized_notes
        changed = True

    if row.voided_at is not None or row.voided_by is not None or row.void_reason is not None:
        row.voided_at = None
        row.voided_by = None
        row.void_reason = None
        changed = True

    if changed:
        row.updated_at = reference_time
        row.updated_by = actor_id
        row.version += 1
    db.flush()
    return row, target


def preview_trade_actualization_void(
    db: Session,
    *,
    trade_id: str,
    leg_no: int | None = None,
    void_reason: object | None = None,
    now: Optional[datetime] = None,
) -> dict[str, object]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    try:
        target = load_delivery_target(db, trade_id=trade_id, leg_no=leg_no)
    except (LookupError, ValueError) as exc:
        return {
            "preview_type": "void_trade_actualization",
            "status": "BLOCKED",
            "summary": f"Actualization void preview for trade {trade_id} is blocked.",
            "affected_records": [],
            "field_changes": [],
            "expected_side_effects": [],
            "warnings": [],
            "blocking_reasons": [str(exc)],
            "assumptions": [],
        }

    actualization = db.execute(
        select(TradeActualization).where(TradeActualization.delivery_id == target.delivery_id)
    ).scalars().first()
    if actualization is None:
        return {
            "preview_type": "void_trade_actualization",
            "status": "BLOCKED",
            "summary": f"Actualization void preview for trade {trade_id} is blocked.",
            "affected_records": [],
            "field_changes": [],
            "expected_side_effects": [],
            "warnings": [],
            "blocking_reasons": [f"Delivery {target.delivery_id} does not have an actualization record to void."],
            "assumptions": [],
        }

    blocking_reasons: list[str] = []
    if _coerce_utc(actualization.voided_at) is not None:
        blocking_reasons.append(
            f"Actualization record {actualization.id} is already voided and cannot be voided again."
        )

    normalized_void_reason = _normalize_optional_text(void_reason)
    if normalized_void_reason is None:
        blocking_reasons.append("Void reason is required.")

    current_projection = build_delivery_actualization_projection(
        trade=target.trade,
        leg=target.leg,
        actualization=actualization,
    )
    return {
        "preview_type": "void_trade_actualization",
        "status": "BLOCKED" if blocking_reasons else "READY",
        "summary": (
            f"Actualization for delivery {target.delivery_id} will be cleared from active movement state."
            if not blocking_reasons
            else f"Actualization void preview for delivery {target.delivery_id} is blocked."
        ),
        "affected_records": [
            {
                "type": "trade_actualization",
                "id": str(actualization.id),
                "label": f"Actualization {actualization.id}",
                "summary": (
                    f"Delivery {target.delivery_id} currently records {current_projection.actual_quantity} "
                    f"{target.unit_of_measure or ''}".strip()
                ),
            },
            {
                "type": "delivery_obligation",
                "id": target.delivery_id,
                "label": f"Delivery {target.delivery_id}",
                "summary": f"Current movement actualization status is {current_projection.status}.",
            },
            {
                "type": "trade",
                "id": target.trade_id,
                "label": f"Trade {target.trade_id}",
                "summary": f"Trade actualization status is {target.trade.actualization_status}.",
            },
        ],
        "field_changes": [
            {
                "field": "actualization_status",
                "current_value": current_projection.status,
                "proposed_value": ActualizationStatus.PENDING.value,
            },
            {
                "field": "voided_at",
                "current_value": _coerce_utc(actualization.voided_at).isoformat() if actualization.voided_at else None,
                "proposed_value": reference_time.isoformat(),
            },
            {
                "field": "void_reason",
                "current_value": actualization.void_reason,
                "proposed_value": normalized_void_reason,
            },
        ],
        "expected_side_effects": [
            "Mark the actualization record voided with explicit correction metadata.",
            "Refresh delivery and trade actualization projections back to pending state.",
            "Synchronize derived accrual lots and workflow projections.",
            "Append a TradeActualizationVoided audit event after execution.",
        ],
        "warnings": [],
        "blocking_reasons": blocking_reasons,
        "assumptions": [],
    }


def upsert_trade_actualization(
    db: Session,
    *,
    trade_id: str,
    leg_no: int | None = None,
    actual_quantity: object | None,
    actualized_at: datetime | None,
    source: object | None,
    notes: object | None,
    actor_id: str,
    now: datetime | None = None,
) -> DeliveryActualizationOut:
    from apps.api.app.domains.accruals.services import synchronize_trade_accruals
    from apps.api.app.domains.operations.services.workflow_items import synchronize_trade_workflow_items

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    actualization, target = upsert_delivery_actualization(
        db,
        trade_id=trade_id,
        leg_no=leg_no,
        actual_quantity=actual_quantity,
        actualized_at=actualized_at,
        source=source,
        notes=notes,
        actor_id=actor_id,
        now=reference_time,
    )
    synchronize_trade_actualization_status(db, trade=target.trade, now=reference_time)
    synchronize_trade_accruals(
        db,
        trade_id=target.trade.trade_id,
        actor_id=actor_id,
        now=reference_time,
    )
    synchronize_trade_workflow_items(db, target.trade, actor_id=actor_id, now=reference_time)
    actualization_out = delivery_actualization_to_out(actualization, target=target)
    payload: dict[str, object] = {
        "request": jsonable_encoder(
            {
                key: value
                for key, value in {
                    "actual_quantity": actual_quantity,
                    "actualized_at": actualized_at,
                    "source": source,
                    "notes": notes,
                }.items()
                if value is not None
            }
        ),
        "actualization": _audit_actualization_payload(actualization_out),
    }
    if leg_no is not None:
        payload["leg_no"] = leg_no
    append_trade_audit_event(
        db,
        trade_id=actualization_out.trade_id,
        actor_id=actor_id,
        event_type="TradeActualizationUpserted",
        occurred_at=actualization_out.updated_at,
        causation_id=f"trade-actualization:{actualization_out.actualization_id}",
        payload=payload,
    )
    return actualization_out


def void_trade_actualization(
    db: Session,
    *,
    trade_id: str,
    leg_no: int | None = None,
    actor_id: str,
    void_reason: object | None,
    notes: object | None = None,
    now: datetime | None = None,
) -> DeliveryActualizationOut:
    from apps.api.app.domains.accruals.services import synchronize_trade_accruals
    from apps.api.app.domains.operations.services.workflow_items import synchronize_trade_workflow_items

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    target = load_delivery_target(db, trade_id=trade_id, leg_no=leg_no)
    actualization = db.execute(
        select(TradeActualization).where(TradeActualization.delivery_id == target.delivery_id)
    ).scalars().first()
    if actualization is None:
        raise LookupError(f"Delivery {target.delivery_id} does not have an actualization record to void.")
    if _coerce_utc(actualization.voided_at) is not None:
        raise ValueError(f"Actualization record {actualization.id} is already voided.")

    previous_actualization = delivery_actualization_to_out(actualization, target=target)
    actualization.voided_at = reference_time
    actualization.voided_by = actor_id
    actualization.void_reason = _normalize_required_text(void_reason, field_name="Void reason")
    actualization.updated_at = reference_time
    actualization.updated_by = actor_id
    actualization.version += 1

    synchronize_trade_actualization_status(db, trade=target.trade, now=reference_time)
    synchronize_trade_accruals(
        db,
        trade_id=target.trade.trade_id,
        actor_id=actor_id,
        now=reference_time,
    )
    synchronize_trade_workflow_items(db, target.trade, actor_id=actor_id, now=reference_time)

    actualization_out = delivery_actualization_to_out(actualization, target=target)
    payload: dict[str, object] = {
        "request": jsonable_encoder(
            {
                key: value
                for key, value in {
                    "void_reason": void_reason,
                    "notes": notes,
                }.items()
                if value is not None
            }
        ),
        "previous_actualization": _audit_actualization_payload(previous_actualization),
        "actualization": _audit_actualization_payload(actualization_out),
    }
    if leg_no is not None:
        payload["leg_no"] = leg_no
    append_trade_audit_event(
        db,
        trade_id=actualization_out.trade_id,
        actor_id=actor_id,
        event_type="TradeActualizationVoided",
        occurred_at=actualization.updated_at,
        causation_id=f"trade-actualization:void:{actualization_out.actualization_id}",
        payload=payload,
    )
    return actualization_out


def delivery_actualization_to_out(
    actualization: TradeActualization,
    *,
    target: DeliveryTarget,
) -> DeliveryActualizationOut:
    projection = build_delivery_actualization_projection(
        trade=target.trade,
        leg=target.leg,
        actualization=actualization,
    )
    return DeliveryActualizationOut(
        actualization_id=actualization.id,
        delivery_id=target.delivery_id,
        trade_id=target.trade_id,
        leg_no=target.leg_no,
        unit_of_measure=target.unit_of_measure,
        planned_quantity=target.planned_quantity,
        actual_quantity=projection.actual_quantity,
        quantity_variance=projection.quantity_variance,
        actualization_status=projection.status,
        actualized_at=projection.actualized_at,
        source=projection.source,
        notes=projection.notes,
        voided_at=_coerce_utc(actualization.voided_at),
        voided_by=actualization.voided_by,
        void_reason=actualization.void_reason,
        created_at=_coerce_utc(actualization.created_at) or datetime.now(timezone.utc),
        created_by=actualization.created_by,
        updated_at=_coerce_utc(actualization.updated_at) or datetime.now(timezone.utc),
        updated_by=actualization.updated_by,
        version=actualization.version,
    )
