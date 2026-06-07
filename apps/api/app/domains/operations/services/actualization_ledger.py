from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.shared.enums import TradeNature
from apps.api.app.shared.enums import TradeStatus

ACTUALIZATION_LEDGER_BASIS_V1 = "trade_actualization_schedule_evidence_v1"
ACTUALIZATION_SETTLEMENT_BASIS_ACTUAL_QUANTITY = "ACTUAL_QUANTITY"
ACTUALIZATION_SETTLEMENT_ELIGIBLE = "ELIGIBLE"
ACTUALIZATION_SETTLEMENT_BLOCKED = "BLOCKED"
INVENTORY_TREATMENT_ACTUALIZATION_ONLY_DEFERRED = "ACTUALIZATION_ONLY_INVENTORY_DEFERRED"
INVENTORY_DEFERRED_REASON = (
    "First gas-slice actualization records drive settlement and accrual evidence; "
    "inventory ledger posting remains deferred until inventory ownership, custody, "
    "and balance policy are approved."
)
ZERO = Decimal("0")


@dataclass(frozen=True)
class ActualizationSettlementBlocker:
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


def build_actualization_ledger_report(
    db: Session,
    *,
    trade_id: str | None = None,
    delivery_id: str | None = None,
    include_voided: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    generated_at = _coerce_utc(now) or datetime.now(timezone.utc)
    statement = select(TradeActualization).order_by(
        TradeActualization.trade_id.asc(),
        TradeActualization.delivery_id.asc(),
        TradeActualization.id.asc(),
    )
    if trade_id is not None:
        statement = statement.where(TradeActualization.trade_id == trade_id)
    if delivery_id is not None:
        statement = statement.where(TradeActualization.delivery_id == delivery_id)
    if not include_voided:
        statement = statement.where(TradeActualization.voided_at.is_(None))

    actualizations = db.execute(statement).scalars().all()
    entries = [
        build_actualization_ledger_entry(
            db,
            actualization=actualization,
            generated_at=generated_at,
        )
        for actualization in actualizations
    ]
    settlement_eligible_count = sum(
        1
        for entry in entries
        if entry["settlement_linkage"]["status"] == ACTUALIZATION_SETTLEMENT_ELIGIBLE
    )
    return {
        "generated_at": generated_at,
        "basis": ACTUALIZATION_LEDGER_BASIS_V1,
        "inventory_treatment": INVENTORY_TREATMENT_ACTUALIZATION_ONLY_DEFERRED,
        "filters": {
            "trade_id": trade_id,
            "delivery_id": delivery_id,
            "include_voided": include_voided,
        },
        "summary": {
            "total_entries": len(entries),
            "active_entries": sum(1 for entry in entries if entry["voided_at"] is None),
            "voided_entries": sum(1 for entry in entries if entry["voided_at"] is not None),
            "settlement_eligible_entries": settlement_eligible_count,
            "settlement_blocked_entries": len(entries) - settlement_eligible_count,
            "inventory_entries_created": 0,
        },
        "entries": entries,
    }


def build_actualization_ledger_entry(
    db: Session,
    *,
    actualization: TradeActualization,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    reference_time = _coerce_utc(generated_at) or datetime.now(timezone.utc)
    trade = db.get(Trade, actualization.trade_id)
    leg = _load_trade_leg(db, trade_id=actualization.trade_id, leg_no=actualization.leg_no)
    delivery = db.get(DeliveryObligation, actualization.delivery_id)
    pipeline_detail = db.get(DeliveryPipelineDetail, actualization.delivery_id)

    quantity_unit_code = _first_text(
        delivery.unit_of_measure if delivery is not None else None,
        leg.quantity_unit_code if leg is not None else None,
        trade.unit_of_measure if trade is not None else None,
    )
    gas_day_start = _first_value(
        delivery.delivery_start if delivery is not None else None,
        leg.delivery_start if leg is not None else None,
        trade.delivery_start if trade is not None else None,
    )
    gas_day_end = _first_value(
        delivery.delivery_end if delivery is not None else None,
        leg.delivery_end if leg is not None else None,
        trade.delivery_end if trade is not None else None,
    )
    actualized_at = _coerce_utc(actualization.actualized_at)
    actual_gas_day = actualized_at.date() if actualized_at is not None else None
    location_code = _first_text(
        pipeline_detail.delivery_location_code if pipeline_detail is not None else None,
        delivery.location_code if delivery is not None else None,
        leg.location_code if leg is not None else None,
        trade.location_code if trade is not None else None,
    )
    source = _normalize_optional_text(actualization.source)
    actual_quantity = _decimal_or_none(actualization.actual_quantity)
    blockers = _settlement_blockers(
        actualization=actualization,
        trade=trade,
        delivery=delivery,
        actual_quantity=actual_quantity,
        quantity_unit_code=quantity_unit_code,
        actual_gas_day=actual_gas_day,
        location_code=location_code,
        source=source,
    )
    settlement_status = (
        ACTUALIZATION_SETTLEMENT_BLOCKED
        if blockers
        else ACTUALIZATION_SETTLEMENT_ELIGIBLE
    )
    settlement_quantity = (
        float(actual_quantity)
        if settlement_status == ACTUALIZATION_SETTLEMENT_ELIGIBLE
        and actual_quantity is not None
        else None
    )

    return {
        "generated_at": reference_time,
        "basis": ACTUALIZATION_LEDGER_BASIS_V1,
        "actualization_id": actualization.id,
        "delivery_id": actualization.delivery_id,
        "trade_id": actualization.trade_id,
        "leg_no": actualization.leg_no,
        "actual_quantity": float(actual_quantity) if actual_quantity is not None else None,
        "quantity_unit_code": quantity_unit_code,
        "actualized_at": actualized_at,
        "actual_gas_day": actual_gas_day,
        "gas_day_start": gas_day_start,
        "gas_day_end": gas_day_end,
        "location_code": location_code,
        "source": source,
        "evidence": {
            "source": source,
            "notes": _normalize_optional_text(actualization.notes),
            "schedule_commitment_id": delivery.delivery_id if delivery is not None else None,
            "nomination_reference": (
                _normalize_optional_text(pipeline_detail.nomination_reference)
                if pipeline_detail is not None
                else None
            ),
        },
        "schedule_commitment": _schedule_commitment_dict(
            actualization=actualization,
            delivery=delivery,
            pipeline_detail=pipeline_detail,
            trade=trade,
            leg=leg,
        ),
        "settlement_linkage": {
            "status": settlement_status,
            "eligible": settlement_status == ACTUALIZATION_SETTLEMENT_ELIGIBLE,
            "basis": ACTUALIZATION_SETTLEMENT_BASIS_ACTUAL_QUANTITY,
            "settlement_quantity": settlement_quantity,
            "quantity_unit_code": quantity_unit_code if settlement_quantity is not None else None,
            "blockers": [blocker.to_dict() for blocker in blockers],
        },
        "inventory": {
            "inventory_treatment": INVENTORY_TREATMENT_ACTUALIZATION_ONLY_DEFERRED,
            "inventory_ledger_entry_created": False,
            "inventory_ledger_entry_id": None,
            "deferred_reason": INVENTORY_DEFERRED_REASON,
        },
        "inventory_treatment": INVENTORY_TREATMENT_ACTUALIZATION_ONLY_DEFERRED,
        "inventory_ledger_entry_created": False,
        "voided_at": _coerce_utc(actualization.voided_at),
        "voided_by": actualization.voided_by,
        "void_reason": actualization.void_reason,
        "created_at": _coerce_utc(actualization.created_at),
        "created_by": actualization.created_by,
        "updated_at": _coerce_utc(actualization.updated_at),
        "updated_by": actualization.updated_by,
        "version": actualization.version,
    }


def _settlement_blockers(
    *,
    actualization: TradeActualization,
    trade: Trade | None,
    delivery: DeliveryObligation | None,
    actual_quantity: Decimal | None,
    quantity_unit_code: str | None,
    actual_gas_day: date | None,
    location_code: str | None,
    source: str | None,
) -> list[ActualizationSettlementBlocker]:
    blockers: list[ActualizationSettlementBlocker] = []
    if _coerce_utc(actualization.voided_at) is not None:
        blockers.append(
            ActualizationSettlementBlocker(
                code="VOIDED_ACTUALIZATION",
                message="Voided actualization records cannot drive settlement preview.",
                field="voided_at",
            )
        )
    if trade is None:
        blockers.append(
            ActualizationSettlementBlocker(
                code="MISSING_TRADE",
                message="Actualization must resolve to a trade before settlement preview.",
                field="trade_id",
            )
        )
    else:
        if _normalize_code(trade.trade_nature) != TradeNature.PHYSICAL.value:
            blockers.append(
                ActualizationSettlementBlocker(
                    code="NON_PHYSICAL_TRADE",
                    message="Actualization settlement preview applies only to physical trades.",
                    field="trade_nature",
                )
            )
        if _normalize_code(trade.status) != TradeStatus.ACTIVE.value:
            blockers.append(
                ActualizationSettlementBlocker(
                    code="INACTIVE_TRADE",
                    message="Actualization settlement preview applies only to active trades.",
                    field="status",
                )
            )
    if delivery is None:
        blockers.append(
            ActualizationSettlementBlocker(
                code="MISSING_SCHEDULE_COMMITMENT",
                message="Actualization must be linked to a persisted delivery or schedule commitment.",
                field="delivery_id",
            )
        )
    if actual_quantity is None or actual_quantity <= ZERO:
        blockers.append(
            ActualizationSettlementBlocker(
                code="MISSING_ACTUAL_QUANTITY",
                message="Actual quantity must be greater than zero.",
                field="actual_quantity",
            )
        )
    if quantity_unit_code is None:
        blockers.append(
            ActualizationSettlementBlocker(
                code="MISSING_QUANTITY_UNIT",
                message="Actualized quantity unit is required for settlement preview.",
                field="quantity_unit_code",
            )
        )
    if actual_gas_day is None:
        blockers.append(
            ActualizationSettlementBlocker(
                code="MISSING_ACTUAL_GAS_DAY",
                message="Actual gas day is required for settlement preview.",
                field="actualized_at",
            )
        )
    if location_code is None:
        blockers.append(
            ActualizationSettlementBlocker(
                code="MISSING_DELIVERY_LOCATION",
                message="Delivery location is required for settlement preview.",
                field="location_code",
            )
        )
    if source is None:
        blockers.append(
            ActualizationSettlementBlocker(
                code="MISSING_SOURCE_EVIDENCE",
                message="Actualization source evidence is required for settlement preview.",
                field="source",
            )
        )
    return blockers


def _schedule_commitment_dict(
    *,
    actualization: TradeActualization,
    delivery: DeliveryObligation | None,
    pipeline_detail: DeliveryPipelineDetail | None,
    trade: Trade | None,
    leg: TradeLeg | None,
) -> dict[str, Any]:
    scheduled_quantity = _decimal_or_none(
        delivery.volume
        if delivery is not None
        else (leg.quantity if leg is not None else (trade.volume if trade is not None else None))
    )
    return {
        "linked": delivery is not None,
        "delivery_id": delivery.delivery_id if delivery is not None else actualization.delivery_id,
        "scheduled_quantity": float(abs(scheduled_quantity)) if scheduled_quantity is not None else None,
        "quantity_unit_code": _first_text(
            delivery.unit_of_measure if delivery is not None else None,
            leg.quantity_unit_code if leg is not None else None,
            trade.unit_of_measure if trade is not None else None,
        ),
        "gas_day_start": _first_value(
            delivery.delivery_start if delivery is not None else None,
            leg.delivery_start if leg is not None else None,
            trade.delivery_start if trade is not None else None,
        ),
        "gas_day_end": _first_value(
            delivery.delivery_end if delivery is not None else None,
            leg.delivery_end if leg is not None else None,
            trade.delivery_end if trade is not None else None,
        ),
        "owner": _normalize_optional_text(delivery.operations_owner if delivery is not None else None),
        "pipeline_system": _normalize_optional_text(
            pipeline_detail.pipeline_system if pipeline_detail is not None else None
        ),
        "pipeline_path": _normalize_optional_text(
            pipeline_detail.pipeline_path if pipeline_detail is not None else None
        ),
        "receipt_location_code": _normalize_optional_text(
            pipeline_detail.receipt_location_code if pipeline_detail is not None else None
        ),
        "delivery_location_code": _first_text(
            pipeline_detail.delivery_location_code if pipeline_detail is not None else None,
            delivery.location_code if delivery is not None else None,
            leg.location_code if leg is not None else None,
            trade.location_code if trade is not None else None,
        ),
        "contract_number": _normalize_optional_text(
            pipeline_detail.contract_number if pipeline_detail is not None else None
        ),
        "cycle_code": _normalize_optional_text(
            pipeline_detail.cycle_code if pipeline_detail is not None else None
        ),
        "nomination_reference": _normalize_optional_text(
            pipeline_detail.nomination_reference if pipeline_detail is not None else None
        ),
        "nomination_status": _normalize_optional_text(trade.nomination_status if trade is not None else None),
    }


def _load_trade_leg(
    db: Session,
    *,
    trade_id: str,
    leg_no: int | None,
) -> TradeLeg | None:
    if leg_no is None:
        return None
    return db.execute(
        select(TradeLeg).where(
            TradeLeg.trade_id == trade_id,
            TradeLeg.leg_no == leg_no,
        )
    ).scalars().first()


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _decimal_or_none(value: object | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (ArithmeticError, InvalidOperation):
        return None


def _first_text(*values: object | None) -> str | None:
    for value in values:
        normalized = _normalize_optional_text(value)
        if normalized is not None:
            return normalized
    return None


def _first_value(*values: Any | None) -> Any | None:
    for value in values:
        if value is not None:
            return value
    return None


def _normalize_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _normalize_optional_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None
