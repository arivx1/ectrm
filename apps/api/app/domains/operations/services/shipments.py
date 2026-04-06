from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.trade_credit_hold import (
    build_trade_credit_hold_lookup,
)
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.schemas.shipment import DeliveryObligationOut
from apps.api.app.shared.enums import AllocationStatus
from apps.api.app.shared.enums import ConfirmationStatus
from apps.api.app.shared.enums import DeliveryModeFamily
from apps.api.app.shared.enums import DeliveryProfile
from apps.api.app.shared.enums import NominationStatus
from apps.api.app.shared.enums import PaymentStatus
from apps.api.app.shared.enums import PricingStatus
from apps.api.app.shared.enums import PricingType
from apps.api.app.shared.enums import SettlementStatus
from apps.api.app.shared.enums import TransportMode
from apps.api.app.shared.enums import TransportModeSource

POWER_COMMODITY_CLASSES = {"POWER"}
PIPELINE_COMMODITY_CLASSES = {"NATURAL_GAS"}
POWER_UNITS = {"GWH", "KWH", "MWH"}
PIPELINE_UNITS = {"DTH", "MCF", "MMBTU", "MMCF", "THERM"}


@dataclass(frozen=True)
class DeliveryClassification:
    mode_family: DeliveryModeFamily
    transport_mode: TransportMode
    transport_mode_source: TransportModeSource
    delivery_profile: DeliveryProfile


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_token(value: str | None) -> str:
    return (value or "").strip().upper()


def _booked_at_for_trade(trade: Trade) -> datetime:
    return _coerce_utc(trade.execution_timestamp) or _coerce_utc(trade.created_at) or datetime.now(timezone.utc)


def _direction_for_side(raw_side: str | None) -> str:
    normalized_side = _normalize_token(raw_side)
    if normalized_side == "BUY":
        return "INBOUND"
    if normalized_side == "SELL":
        return "OUTBOUND"
    return "UNSPECIFIED"


def _classify_delivery(commodity_class: str | None, unit_of_measure: str | None) -> DeliveryClassification:
    normalized_class = _normalize_token(commodity_class)
    normalized_unit = _normalize_token(unit_of_measure)

    if normalized_class in POWER_COMMODITY_CLASSES or normalized_unit in POWER_UNITS:
        return DeliveryClassification(
            mode_family=DeliveryModeFamily.POWER_SCHEDULE,
            transport_mode=TransportMode.POWER_GRID,
            transport_mode_source=TransportModeSource.DERIVED,
            delivery_profile=DeliveryProfile.INTERVAL_SCHEDULE,
        )

    if normalized_class in PIPELINE_COMMODITY_CLASSES or normalized_unit in PIPELINE_UNITS:
        return DeliveryClassification(
            mode_family=DeliveryModeFamily.NETWORK_FLOW,
            transport_mode=TransportMode.PIPELINE,
            transport_mode_source=TransportModeSource.DERIVED,
            delivery_profile=DeliveryProfile.FLOW_WINDOW,
        )

    return DeliveryClassification(
        mode_family=DeliveryModeFamily.LOGISTICS,
        transport_mode=TransportMode.UNSPECIFIED,
        transport_mode_source=TransportModeSource.UNSPECIFIED,
        delivery_profile=DeliveryProfile.LOAD_DISCHARGE_WINDOW,
    )


def _days_until_delivery_start(delivery_start: date | None, reference_time: datetime) -> int | None:
    if delivery_start is None:
        return None
    return (delivery_start - reference_time.date()).days


def _build_blockers(
    *,
    trade: Trade,
    classification: DeliveryClassification,
    volume: float | None,
    unit_of_measure: str | None,
    location_code: str | None,
    delivery_start: date | None,
    delivery_end: date | None,
    credit_hold_reason: str | None,
    reference_time: datetime,
) -> list[str]:
    blockers: list[str] = []

    if credit_hold_reason:
        blockers.append(f"Credit hold: {credit_hold_reason}")
    if not (trade.counterparty or "").strip():
        blockers.append("Counterparty assignment is missing.")
    if volume is None or volume == 0:
        blockers.append("Delivery quantity has not been captured.")
    if not (unit_of_measure or "").strip():
        blockers.append("Quantity unit is missing.")
    if trade.execution_timestamp is None and trade.trade_date is None:
        blockers.append("Trade date or execution timestamp is missing.")
    if trade.pricing_type != PricingType.FIXED.value and not (trade.price_index_code or "").strip():
        blockers.append("Price index is missing for non-fixed pricing.")
    if not (location_code or "").strip():
        blockers.append("Delivery location is missing.")
    if delivery_start is None or delivery_end is None:
        blockers.append("Delivery window is incomplete.")
    if trade.confirmation_status != ConfirmationStatus.CONFIRMED.value:
        blockers.append("Trade confirmation is not complete.")

    days_until_delivery = _days_until_delivery_start(delivery_start, reference_time)
    nomination_complete = trade.nomination_status in {
        NominationStatus.NOT_REQUIRED.value,
        NominationStatus.SCHEDULED.value,
        NominationStatus.NOMINATED.value,
        NominationStatus.COMPLETED.value,
    }
    if days_until_delivery is not None and days_until_delivery <= 3 and not nomination_complete:
        if classification.mode_family == DeliveryModeFamily.POWER_SCHEDULE:
            blockers.append("Scheduling is not complete for the delivery window.")
        else:
            blockers.append("Nomination is not complete for the delivery window.")

    allocation_complete = trade.allocation_status in {
        AllocationStatus.NOT_REQUIRED.value,
        AllocationStatus.ALLOCATED.value,
        AllocationStatus.COMPLETED.value,
    }
    if trade.nomination_status in {NominationStatus.NOMINATED.value, NominationStatus.COMPLETED.value} and not allocation_complete:
        blockers.append("Allocation workflow is not complete.")

    if classification.mode_family == DeliveryModeFamily.POWER_SCHEDULE and not (trade.price_unit_code or "").strip():
        blockers.append("Price unit is missing for scheduled power delivery.")
    if classification.mode_family == DeliveryModeFamily.LOGISTICS and classification.transport_mode == TransportMode.UNSPECIFIED:
        blockers.append("Explicit transport mode is missing for discrete logistics delivery.")

    return blockers


def _status_for_trade(trade: Trade, blockers: list[str]) -> str:
    if trade.settlement_status == SettlementStatus.SETTLED.value and trade.payment_status in {
        PaymentStatus.PAID.value,
        PaymentStatus.NOT_REQUIRED.value,
    }:
        return "COMPLETED"
    if blockers:
        return "BLOCKED"
    if trade.pricing_status == PricingStatus.PRICED.value and trade.confirmation_status == ConfirmationStatus.CONFIRMED.value:
        return "READY"
    return "IN_PROGRESS"


def _latest_updated_at(trade: Trade, leg: TradeLeg | None, booked_at: datetime) -> datetime:
    candidates = [_coerce_utc(trade.updated_at)]
    if leg is not None:
        candidates.append(_coerce_utc(leg.updated_at))
    normalized_candidates = [candidate for candidate in candidates if candidate is not None]
    return max(normalized_candidates) if normalized_candidates else booked_at


def _build_delivery_obligation(
    *,
    trade: Trade,
    leg: TradeLeg | None,
    credit_hold_reason: str | None,
    reference_time: datetime,
) -> DeliveryObligationOut:
    commodity_class = leg.commodity_class if leg is not None else trade.commodity_class
    commodity = leg.commodity_code if leg is not None else trade.commodity
    volume = float(leg.quantity) if leg is not None and leg.quantity is not None else float(trade.volume) if trade.volume is not None else None
    unit_of_measure = leg.quantity_unit_code if leg is not None else trade.unit_of_measure
    location_code = leg.location_code if leg is not None else trade.location_code
    delivery_start = leg.delivery_start if leg is not None else trade.delivery_start
    delivery_end = leg.delivery_end if leg is not None else trade.delivery_end
    booked_at = _booked_at_for_trade(trade)
    classification = _classify_delivery(commodity_class, unit_of_measure)
    blockers = _build_blockers(
        trade=trade,
        classification=classification,
        volume=volume,
        unit_of_measure=unit_of_measure,
        location_code=location_code,
        delivery_start=delivery_start,
        delivery_end=delivery_end,
        credit_hold_reason=credit_hold_reason,
        reference_time=reference_time,
    )
    status = _status_for_trade(trade, blockers)
    leg_suffix = f"-L{leg.leg_no}" if leg is not None else ""

    return DeliveryObligationOut(
        delivery_id=f"DLV-{trade.trade_id}{leg_suffix}",
        trade_id=trade.trade_id,
        leg_no=leg.leg_no if leg is not None else None,
        external_trade_id=trade.external_trade_id,
        status=status,
        direction=_direction_for_side(leg.side if leg is not None else trade.trade_side),
        mode_family=classification.mode_family.value,
        transport_mode=classification.transport_mode.value,
        transport_mode_source=classification.transport_mode_source.value,
        delivery_profile=classification.delivery_profile.value,
        book=trade.book,
        portfolio=trade.portfolio,
        counterparty=trade.counterparty,
        commodity_class=commodity_class,
        commodity=commodity,
        volume=volume,
        unit_of_measure=unit_of_measure,
        trade_currency_code=trade.trade_currency_code,
        price_unit_code=trade.price_unit_code,
        location_code=location_code,
        delivery_start=delivery_start,
        delivery_end=delivery_end,
        booked_at=booked_at,
        last_updated_at=_latest_updated_at(trade, leg, booked_at),
        age_days=max(0, int((reference_time - booked_at).total_seconds() // 86400)),
        pricing_status=trade.pricing_status,
        confirmation_status=trade.confirmation_status,
        nomination_status=trade.nomination_status,
        allocation_status=trade.allocation_status,
        invoice_status=trade.invoice_status,
        payment_status=trade.payment_status,
        settlement_status=trade.settlement_status,
        blocker_count=len(blockers),
        blockers=blockers,
    )


def _delivery_sort_key(delivery: DeliveryObligationOut) -> tuple[int, str, str, int]:
    status_rank = {"BLOCKED": 0, "IN_PROGRESS": 1, "READY": 2, "COMPLETED": 3}
    delivery_start = delivery.delivery_start.isoformat() if delivery.delivery_start is not None else "9999-12-31"
    return (
        status_rank.get(delivery.status, 99),
        delivery_start,
        delivery.trade_id,
        delivery.leg_no or 0,
    )


def list_delivery_obligations_for_operations(db: Session, *, now: Optional[datetime] = None) -> list[DeliveryObligationOut]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trades = db.execute(
        select(Trade)
        .where(
            Trade.trade_nature == "PHYSICAL",
            Trade.status == "ACTIVE",
        )
        .order_by(Trade.updated_at.desc(), Trade.trade_id.desc())
    ).scalars().all()

    trade_ids = [trade.trade_id for trade in trades]
    credit_hold_states = build_trade_credit_hold_lookup(db, trade_ids=trade_ids)
    legs_by_trade_id: dict[str, list[TradeLeg]] = {}
    if trade_ids:
        trade_legs = db.execute(
            select(TradeLeg)
            .where(TradeLeg.trade_id.in_(trade_ids))
            .order_by(TradeLeg.trade_id.asc(), TradeLeg.leg_no.asc())
        ).scalars().all()
        for leg in trade_legs:
            legs_by_trade_id.setdefault(leg.trade_id, []).append(leg)

    deliveries: list[DeliveryObligationOut] = []
    for trade in trades:
        credit_hold_state = credit_hold_states.get(trade.trade_id)
        credit_hold_reason = credit_hold_state.hold_reason if credit_hold_state and credit_hold_state.hold_active else None
        trade_legs = legs_by_trade_id.get(trade.trade_id, [])
        if trade_legs:
            for leg in trade_legs:
                deliveries.append(
                    _build_delivery_obligation(
                        trade=trade,
                        leg=leg,
                        credit_hold_reason=credit_hold_reason,
                        reference_time=reference_time,
                    )
                )
            continue

        deliveries.append(
            _build_delivery_obligation(
                trade=trade,
                leg=None,
                credit_hold_reason=credit_hold_reason,
                reference_time=reference_time,
            )
        )

    return sorted(deliveries, key=_delivery_sort_key)


def list_shipments_for_operations(db: Session, *, now: Optional[datetime] = None) -> list[DeliveryObligationOut]:
    return list_delivery_obligations_for_operations(db, now=now)
