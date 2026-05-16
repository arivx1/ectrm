from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, replace
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.commodity_transport_modes import (
    default_allowed_transport_modes,
)
from apps.api.app.domains.reference_data.services.commodity_transport_modes import (
    is_transport_mode_allowed,
)
from apps.api.app.domains.reference_data.services.commodity_transport_modes import (
    normalize_allowed_transport_modes,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.domains.operations.services.actualizations import (
    build_delivery_actualization_projection,
)
from apps.api.app.domains.operations.services.actualizations import (
    build_delivery_obligation_id,
)
from apps.api.app.domains.operations.services.actualizations import (
    list_trade_actualizations_by_delivery_id,
)
from apps.api.app.domains.operations.services.audit_events import append_trade_audit_event
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceDescriptor,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceEmptyState,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceListRequest,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourcePrimaryAction,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceSummaryStat,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceSurface,
)
from apps.api.app.domains.operations.services.resource_views import (
    OperationalResourceSurfaceAction,
)
from apps.api.app.domains.operations.services.resource_views import (
    load_operational_resource_items,
)
from apps.api.app.domains.operations.services.resource_views import (
    paginate_operational_items,
)
from apps.api.app.domains.operations.services.trade_credit_hold import (
    build_trade_credit_hold_lookup,
)
from apps.api.app.domains.operations.services.trade_credit_hold import (
    TradeCreditHoldState,
)
from apps.api.app.domains.operations.services.workflow_items import (
    is_workflow_item_closed,
    synchronize_active_trade_workflow_items,
)
from apps.api.app.models.delivery_logistics_detail import DeliveryLogisticsDetail
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.delivery_pipeline_detail import DeliveryPipelineDetail
from apps.api.app.models.delivery_power_detail import DeliveryPowerDetail
from apps.api.app.models.delivery_rail_detail import DeliveryRailDetail
from apps.api.app.models.delivery_tracking_signal import DeliveryTrackingSignal
from apps.api.app.models.delivery_truck_detail import DeliveryTruckDetail
from apps.api.app.models.delivery_truck_movement import DeliveryTruckMovement
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_rail_line import ReferenceRailLine
from apps.api.app.models.reference_rail_route import ReferenceRailRoute
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.shipment import DeliveryEventOut
from apps.api.app.schemas.shipment import DeliverySchedulingWorkflowItemOut
from apps.api.app.schemas.shipment import DeliveryObligationOut
from apps.api.app.schemas.shipment import DeliverySyncResultOut
from apps.api.app.schemas.shipment import DeliveryTruckDetailOut
from apps.api.app.shared.enums import ActualizationStatus
from apps.api.app.shared.enums import AllocationStatus
from apps.api.app.shared.enums import ConfirmationStatus
from apps.api.app.shared.enums import DeliveryEventType
from apps.api.app.shared.enums import DeliveryExecutionStatus
from apps.api.app.shared.enums import DeliveryFieldSource
from apps.api.app.shared.enums import DeliveryModeFamily
from apps.api.app.shared.enums import DeliveryProfile
from apps.api.app.shared.enums import NominationStatus
from apps.api.app.shared.enums import PaymentStatus
from apps.api.app.shared.enums import PricingStatus
from apps.api.app.shared.enums import PricingType
from apps.api.app.shared.enums import SettlementStatus
from apps.api.app.shared.enums import TransportMode
from apps.api.app.shared.enums import TransportModeSource
from apps.api.app.shared.enums import TruckMovementStatus

POWER_COMMODITY_CLASSES = {"POWER"}
PIPELINE_COMMODITY_CLASSES = {"NATURAL_GAS"}
POWER_UNITS = {"GWH", "KWH", "MWH"}
PIPELINE_UNITS = {"DTH", "MCF", "MMBTU", "MMCF", "THERM"}
SCHEDULING_WORKFLOW_TYPES = {
    "CONFIRMATION",
    "NOMINATION",
    "ALLOCATION",
}
SCHEDULING_WORKFLOW_TYPE_ORDER = {
    "CONFIRMATION": 0,
    "NOMINATION": 1,
    "ALLOCATION": 2,
}
BLOCKED_SCHEDULING_WORKFLOW_STATUSES = {"DISPUTED", "OVERDUE", "PENDING_REVIEW", "REJECTED"}
DELIVERY_EVENT_STATUS_BY_TYPE = {
    DeliveryEventType.PLAN_CAPTURED: DeliveryExecutionStatus.PLANNED,
    DeliveryEventType.SCHEDULE_COMMITTED: DeliveryExecutionStatus.SCHEDULED,
    DeliveryEventType.EXECUTION_STARTED: DeliveryExecutionStatus.IN_PROGRESS,
    DeliveryEventType.CHECKPOINT_RECORDED: DeliveryExecutionStatus.IN_PROGRESS,
    DeliveryEventType.DELIVERY_COMPLETED: DeliveryExecutionStatus.COMPLETED,
    DeliveryEventType.HOLD_APPLIED: DeliveryExecutionStatus.ON_HOLD,
    DeliveryEventType.CANCELLED: DeliveryExecutionStatus.CANCELLED,
}


def _audit_delivery_payload(delivery: DeliveryObligationOut) -> dict[str, object]:
    return delivery.model_dump(mode="json")


def _append_delivery_trade_audit(
    db: Session,
    *,
    delivery: DeliveryObligationOut,
    actor_id: str,
    event_type: str,
    causation_id: str,
    requested_changes: dict[str, object | None] | None = None,
    request_payload: dict[str, object | None] | None = None,
    latest_event: DeliveryEventOut | None = None,
) -> None:
    payload: dict[str, object] = {"delivery": _audit_delivery_payload(delivery)}
    if requested_changes is not None:
        payload["requested_changes"] = jsonable_encoder(requested_changes)
    if request_payload is not None:
        payload["request"] = jsonable_encoder(request_payload)
    if latest_event is not None:
        payload["latest_event"] = latest_event.model_dump(mode="json")
    append_trade_audit_event(
        db,
        trade_id=delivery.trade_id,
        actor_id=actor_id,
        event_type=event_type,
        occurred_at=latest_event.updated_at if latest_event is not None else delivery.last_updated_at,
        causation_id=causation_id,
        payload=payload,
    )
RESETTABLE_DELIVERY_FIELDS = {
    "transport_mode",
    "book",
    "portfolio",
    "counterparty",
    "location_code",
    "delivery_window",
    "execution_status",
    "operations_owner",
    "external_reference",
    "ops_notes",
}
RESETTABLE_LOGISTICS_DETAIL_FIELDS = {
    "origin_location_code",
    "destination_location_code",
    "incoterm_code",
    "carrier_name",
    "carrier_reference",
    "asset_reference",
    "equipment_type",
    "load_reference",
    "discharge_reference",
}
RESETTABLE_PIPELINE_DETAIL_FIELDS = {
    "pipeline_system",
    "pipeline_path",
    "receipt_location_code",
    "delivery_location_code",
    "pipeline_contract_number",
    "pipeline_cycle_code",
    "nomination_reference",
}
RESETTABLE_RAIL_DETAIL_FIELDS = {
    "rail_route_code",
    "origin_station_code",
    "destination_station_code",
    "waybill_reference",
    "release_number",
    "unit_train_id",
    "railcar_count",
}
RESETTABLE_POWER_DETAIL_FIELDS = {
    "market_operator",
    "pricing_node_code",
    "delivery_node_code",
    "profile_code",
    "schedule_reference",
    "interval_minutes",
    "timezone_name",
}
LOGISTICS_DETAIL_FIELD_MAP = {
    "origin_location_code": "origin_location_code",
    "destination_location_code": "destination_location_code",
    "incoterm_code": "incoterm_code",
    "carrier_name": "carrier_name",
    "carrier_reference": "carrier_reference",
    "asset_reference": "asset_reference",
    "equipment_type": "equipment_type",
    "load_reference": "load_reference",
    "discharge_reference": "discharge_reference",
}
PIPELINE_DETAIL_FIELD_MAP = {
    "pipeline_system": "pipeline_system",
    "pipeline_path": "pipeline_path",
    "receipt_location_code": "receipt_location_code",
    "delivery_location_code": "delivery_location_code",
    "pipeline_contract_number": "contract_number",
    "pipeline_cycle_code": "cycle_code",
    "nomination_reference": "nomination_reference",
}
RAIL_DETAIL_FIELD_MAP = {
    "rail_route_code": "rail_route_code",
    "origin_station_code": "origin_station_code",
    "destination_station_code": "destination_station_code",
    "waybill_reference": "waybill_reference",
    "release_number": "release_number",
    "unit_train_id": "unit_train_id",
    "railcar_count": "railcar_count",
}
POWER_DETAIL_FIELD_MAP = {
    "market_operator": "market_operator",
    "pricing_node_code": "pricing_node_code",
    "delivery_node_code": "delivery_node_code",
    "profile_code": "profile_code",
    "schedule_reference": "schedule_reference",
    "interval_minutes": "interval_minutes",
    "timezone_name": "timezone_name",
}


@dataclass(frozen=True)
class DeliveryClassification:
    mode_family: DeliveryModeFamily
    transport_mode: TransportMode
    transport_mode_source: TransportModeSource
    delivery_profile: DeliveryProfile


@dataclass(frozen=True)
class SchedulingProjection:
    stage: str
    owner: str | None
    due_at: datetime | None
    open_work_item_count: int
    next_workflow_type: str | None
    next_workflow_status: str | None
    work_items: list[DeliverySchedulingWorkflowItemOut]


@dataclass(frozen=True)
class DeliveryEventProjection:
    execution_status: DeliveryExecutionStatus
    latest_event_type: str | None
    latest_event_at: datetime | None


@dataclass(frozen=True)
class DeliveryListRow:
    trade: Trade
    leg: TradeLeg | None
    delivery_id: str


@dataclass(frozen=True)
class DeliveryListContext:
    persisted_deliveries_by_id: dict[str, DeliveryObligation]
    logistics_details_by_id: dict[str, DeliveryLogisticsDetail]
    truck_details_by_id: dict[str, DeliveryTruckDetail]
    truck_movement_count_by_delivery_id: dict[str, int]
    active_truck_movement_count_by_delivery_id: dict[str, int]
    pipeline_details_by_id: dict[str, DeliveryPipelineDetail]
    rail_details_by_id: dict[str, DeliveryRailDetail]
    rail_routes_by_code: dict[str, ReferenceRailRoute]
    rail_lines_by_code: dict[str, ReferenceRailLine]
    power_details_by_id: dict[str, DeliveryPowerDetail]
    delivery_events_by_id: dict[str, list[DeliveryEvent]]
    credit_hold_states: dict[str, TradeCreditHoldState]
    actualizations_by_delivery_id: dict[str, TradeActualization]
    scheduling_work_items_by_trade_id: dict[str, list[TradeWorkflowItem]]


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


def _workflow_due_sort_key(value: datetime | None) -> tuple[int, datetime]:
    normalized = _coerce_utc(value)
    if normalized is None:
        return (1, datetime.max.replace(tzinfo=timezone.utc))
    return (0, normalized)


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


def _coerce_mode_family(
    value: str | None,
    fallback: DeliveryModeFamily,
) -> DeliveryModeFamily:
    normalized = _normalize_token(value)
    try:
        return DeliveryModeFamily(normalized)
    except ValueError:
        return fallback


def _coerce_transport_mode(
    value: str | None,
    fallback: TransportMode,
) -> TransportMode:
    normalized = _normalize_token(value)
    try:
        return TransportMode(normalized)
    except ValueError:
        return fallback


def _coerce_transport_mode_source(
    value: str | None,
    fallback: TransportModeSource,
) -> TransportModeSource:
    normalized = _normalize_token(value)
    try:
        return TransportModeSource(normalized)
    except ValueError:
        return fallback


def _coerce_delivery_profile(
    value: str | None,
    fallback: DeliveryProfile,
) -> DeliveryProfile:
    normalized = _normalize_token(value)
    try:
        return DeliveryProfile(normalized)
    except ValueError:
        return fallback


def _coerce_delivery_field_source(
    value: str | None,
    fallback: DeliveryFieldSource,
) -> DeliveryFieldSource:
    normalized = _normalize_token(value)
    try:
        return DeliveryFieldSource(normalized)
    except ValueError:
        return fallback


def _default_execution_status_for_trade(trade: Trade) -> DeliveryExecutionStatus:
    actualization_status = _normalize_token(trade.actualization_status)
    nomination_status = _normalize_token(trade.nomination_status)
    allocation_status = _normalize_token(trade.allocation_status)

    if actualization_status == ActualizationStatus.ACTUALIZED.value:
        return DeliveryExecutionStatus.COMPLETED
    if actualization_status == ActualizationStatus.PARTIALLY_ACTUALIZED.value:
        return DeliveryExecutionStatus.IN_PROGRESS
    if nomination_status in {
        NominationStatus.SCHEDULED.value,
        NominationStatus.NOMINATED.value,
        NominationStatus.COMPLETED.value,
    } or allocation_status in {
        AllocationStatus.ALLOCATED.value,
        AllocationStatus.COMPLETED.value,
    }:
        return DeliveryExecutionStatus.SCHEDULED
    return DeliveryExecutionStatus.PLANNED


def _classification_for_persisted_record(
    persisted_delivery: DeliveryObligation | None,
    fallback: DeliveryClassification,
) -> DeliveryClassification:
    if persisted_delivery is None:
        return fallback

    return DeliveryClassification(
        mode_family=_coerce_mode_family(persisted_delivery.mode_family, fallback.mode_family),
        transport_mode=_coerce_transport_mode(persisted_delivery.transport_mode, fallback.transport_mode),
        transport_mode_source=_coerce_transport_mode_source(
            persisted_delivery.transport_mode_source,
            fallback.transport_mode_source,
        ),
        delivery_profile=_coerce_delivery_profile(persisted_delivery.delivery_profile, fallback.delivery_profile),
    )


def _mode_family_for_transport_mode(transport_mode: TransportMode) -> DeliveryModeFamily:
    if transport_mode == TransportMode.PIPELINE:
        return DeliveryModeFamily.NETWORK_FLOW
    if transport_mode == TransportMode.POWER_GRID:
        return DeliveryModeFamily.POWER_SCHEDULE
    return DeliveryModeFamily.LOGISTICS


def _default_profile_for_mode_family(mode_family: DeliveryModeFamily) -> DeliveryProfile:
    if mode_family == DeliveryModeFamily.NETWORK_FLOW:
        return DeliveryProfile.FLOW_WINDOW
    if mode_family == DeliveryModeFamily.POWER_SCHEDULE:
        return DeliveryProfile.INTERVAL_SCHEDULE
    return DeliveryProfile.LOAD_DISCHARGE_WINDOW


def _market_operator_for_location_code(location_code: str | None) -> str | None:
    normalized = str(location_code or "").strip().upper()
    if not normalized:
        return None
    for separator in ("_", "-", " "):
        if separator in normalized:
            token = normalized.split(separator, 1)[0].strip()
            return token or normalized
    return normalized


def _normalize_optional_text(value: object | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _normalize_required_text(value: object | None, *, label: str) -> str:
    normalized = str(value or "").strip()
    if normalized:
        return normalized
    raise ValueError(f"{label} must be provided.")


def _validate_transport_mode(value: object | None) -> TransportMode:
    normalized = _normalize_token(str(value or ""))
    try:
        return TransportMode(normalized)
    except ValueError as exc:
        valid_values = ", ".join(mode.value for mode in TransportMode)
        raise ValueError(
            f"Transport mode '{normalized or value}' is invalid. Expected one of: {valid_values}."
        ) from exc


def _allowed_transport_modes_for_delivery(
    db: Session,
    *,
    commodity: str | None,
    commodity_class: str | None,
) -> list[str]:
    normalized_commodity = normalize_code(commodity) if commodity else ""
    reference_commodity = (
        db.execute(
            select(ReferenceCommodity).where(ReferenceCommodity.code == normalized_commodity)
        )
        .scalars()
        .first()
        if normalized_commodity
        else None
    )
    if reference_commodity is not None:
        return normalize_allowed_transport_modes(
            reference_commodity.allowed_transport_modes,
            commodity_code=reference_commodity.code,
            commodity_class=reference_commodity.commodity_class,
        )

    return default_allowed_transport_modes(
        commodity_code=commodity,
        commodity_class=commodity_class,
    )


def _require_allowed_transport_mode(
    db: Session,
    *,
    commodity: str | None,
    commodity_class: str | None,
    transport_mode: TransportMode,
) -> None:
    allowed_transport_modes = _allowed_transport_modes_for_delivery(
        db,
        commodity=commodity,
        commodity_class=commodity_class,
    )
    if is_transport_mode_allowed(
        transport_mode,
        allowed_transport_modes=allowed_transport_modes,
    ):
        return

    allowed_modes_label = ", ".join(allowed_transport_modes)
    commodity_label = normalize_code(commodity) if commodity else commodity_class or "this product"
    raise ValueError(
        f"Transport mode '{transport_mode.value}' is not allowed for {commodity_label}. "
        f"Allowed modes: {allowed_modes_label}."
    )


def _normalize_optional_positive_int(value: object | None, *, label: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        normalized = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be an integer value.") from exc
    if normalized <= 0:
        raise ValueError(f"{label} must be greater than zero.")
    return normalized


def _normalize_optional_active_rail_route_code(
    db: Session,
    value: object | None,
) -> str | None:
    normalized_text = _normalize_optional_text(value)
    if normalized_text is None:
        return None

    normalized_code = normalize_code(normalized_text)
    rail_route = db.get(ReferenceRailRoute, normalized_code)
    if rail_route is None:
        raise ValueError(f"Rail route '{normalized_code}' was not found in reference data.")
    if not rail_route.is_active:
        raise ValueError(f"Rail route '{normalized_code}' is inactive in reference data.")
    return normalized_code


def _validate_delivery_execution_status(value: object | None) -> DeliveryExecutionStatus:
    normalized = _normalize_token(str(value or ""))
    try:
        return DeliveryExecutionStatus(normalized)
    except ValueError as exc:
        valid_values = ", ".join(status.value for status in DeliveryExecutionStatus)
        raise ValueError(
            f"Execution status '{normalized or value}' is invalid. Expected one of: {valid_values}."
        ) from exc


def _validate_delivery_event_type(value: object | None) -> DeliveryEventType:
    normalized = _normalize_token(str(value or ""))
    try:
        return DeliveryEventType(normalized)
    except ValueError as exc:
        valid_values = ", ".join(event_type.value for event_type in DeliveryEventType)
        raise ValueError(
            f"Delivery event type '{normalized or value}' is invalid. Expected one of: {valid_values}."
        ) from exc


def _validate_delivery_event_occurred_at(value: object | None) -> datetime:
    if not isinstance(value, datetime):
        raise ValueError("Delivery event timestamp must be provided.")
    return _coerce_utc(value) or datetime.now(timezone.utc)


def _normalize_reset_fields(value: object | None) -> set[str]:
    if value is None:
        return set()
    if not isinstance(value, (list, tuple, set)):
        raise ValueError("Reset fields must be provided as a list.")

    normalized_values: set[str] = set()
    for item in value:
        normalized_item = str(item or "").strip().lower()
        if not normalized_item:
            continue
        if normalized_item not in RESETTABLE_DELIVERY_FIELDS:
            allowed = ", ".join(sorted(RESETTABLE_DELIVERY_FIELDS))
            raise ValueError(
                f"Reset field '{item}' is invalid. Expected one of: {allowed}."
            )
        normalized_values.add(normalized_item)
    return normalized_values


def _normalize_named_reset_fields(
    value: object | None,
    *,
    allowed_fields: set[str],
    label: str,
) -> set[str]:
    if value is None:
        return set()
    if not isinstance(value, (list, tuple, set)):
        raise ValueError(f"Reset fields for {label} must be provided as a list.")

    normalized_values: set[str] = set()
    for item in value:
        normalized_item = str(item or "").strip().lower()
        if not normalized_item:
            continue
        if normalized_item not in allowed_fields:
            allowed = ", ".join(sorted(allowed_fields))
            raise ValueError(
                f"Reset field '{item}' is invalid for {label}. Expected one of: {allowed}."
            )
        normalized_values.add(normalized_item)
    return normalized_values


def _validate_delivery_window(
    *,
    delivery_start: date | None,
    delivery_end: date | None,
) -> None:
    if delivery_start is not None and delivery_end is not None and delivery_start > delivery_end:
        raise ValueError("Delivery start must be on or before delivery end.")


def _comparison_key(value: object | None) -> object | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value.normalize()
    if isinstance(value, float):
        return Decimal(str(value)).normalize()
    return value


def _apply_model_changes(model: object, values: dict[str, object | None]) -> bool:
    changed = False
    for field_name, value in values.items():
        if _comparison_key(getattr(model, field_name)) != _comparison_key(value):
            setattr(model, field_name, value)
            changed = True
    return changed


def _apply_missing_default_changes(model: object, values: dict[str, object | None]) -> bool:
    changed = False
    for field_name, value in values.items():
        if value is None:
            continue
        current_value = getattr(model, field_name)
        if current_value in (None, ""):
            setattr(model, field_name, value)
            changed = True
    return changed


def _touch_audited_record(model: object, *, actor_id: str, reference_time: datetime) -> None:
    current_version = getattr(model, "version", 0) or 0
    setattr(model, "updated_at", reference_time)
    setattr(model, "updated_by", actor_id)
    setattr(model, "version", current_version + 1)


def _detail_updated_at(*details: object | None) -> datetime | None:
    timestamps = [
        _coerce_utc(getattr(detail, "updated_at", None))
        for detail in details
        if detail is not None
    ]
    normalized = [timestamp for timestamp in timestamps if timestamp is not None]
    return max(normalized) if normalized else None


def _delivery_event_sort_key(event: DeliveryEvent) -> tuple[datetime, int]:
    return (
        _coerce_utc(event.occurred_at) or datetime.min.replace(tzinfo=timezone.utc),
        int(getattr(event, "id", 0) or 0),
    )


def _reversed_delivery_event_ids(delivery_events: list[DeliveryEvent]) -> set[int]:
    return {
        int(event.reversal_of_event_id)
        for event in delivery_events
        if event.reversal_of_event_id is not None
    }


def _active_business_delivery_events(delivery_events: list[DeliveryEvent]) -> list[DeliveryEvent]:
    reversed_ids = _reversed_delivery_event_ids(delivery_events)
    return [
        event
        for event in delivery_events
        if event.reversal_of_event_id is None
        and event.event_type != DeliveryEventType.EVENT_REVERSED.value
        and event.id not in reversed_ids
    ]


def _project_delivery_execution_status_from_events(
    *,
    delivery_events: list[DeliveryEvent],
    fallback_status: DeliveryExecutionStatus,
) -> DeliveryExecutionStatus:
    current_status = fallback_status
    resumable_status = fallback_status
    for event in sorted(_active_business_delivery_events(delivery_events), key=_delivery_event_sort_key):
        current_status, resumable_status = _advance_delivery_event_status(
            event_type=_validate_delivery_event_type(event.event_type),
            current_status=current_status,
            resumable_status=resumable_status,
        )
    return current_status


def _advance_delivery_event_status(
    *,
    event_type: DeliveryEventType,
    current_status: DeliveryExecutionStatus,
    resumable_status: DeliveryExecutionStatus,
) -> tuple[DeliveryExecutionStatus, DeliveryExecutionStatus]:
    if event_type == DeliveryEventType.HOLD_RELEASED:
        next_status = resumable_status
        if next_status in {DeliveryExecutionStatus.ON_HOLD, DeliveryExecutionStatus.CANCELLED}:
            next_status = DeliveryExecutionStatus.SCHEDULED
        return next_status, next_status

    next_status = DELIVERY_EVENT_STATUS_BY_TYPE[event_type]
    next_resumable_status = resumable_status
    if event_type == DeliveryEventType.HOLD_APPLIED:
        if current_status not in {DeliveryExecutionStatus.ON_HOLD, DeliveryExecutionStatus.CANCELLED}:
            next_resumable_status = current_status
        return next_status, next_resumable_status

    return next_status, next_status


def _event_execution_status_for_type(
    *,
    event_type: DeliveryEventType,
    occurred_at: datetime,
    existing_events: list[DeliveryEvent],
    fallback_status: DeliveryExecutionStatus,
) -> DeliveryExecutionStatus:
    current_status = fallback_status
    resumable_status = fallback_status
    ordered_events: list[tuple[datetime, int, DeliveryEventType]] = [
        (
            _coerce_utc(existing_event.occurred_at) or datetime.min.replace(tzinfo=timezone.utc),
            int(existing_event.id or 0),
            _validate_delivery_event_type(existing_event.event_type),
        )
        for existing_event in _active_business_delivery_events(existing_events)
    ]
    ordered_events.append(
        (
            _coerce_utc(occurred_at) or datetime.min.replace(tzinfo=timezone.utc),
            max((int(existing_event.id or 0) for existing_event in existing_events), default=0) + 1,
            event_type,
        )
    )

    for _event_occurred_at, _event_id, ordered_event_type in sorted(ordered_events):
        current_status, resumable_status = _advance_delivery_event_status(
            event_type=ordered_event_type,
            current_status=current_status,
            resumable_status=resumable_status,
        )
    return current_status


def _delivery_event_projection(
    *,
    delivery_events: list[DeliveryEvent],
    fallback_status: DeliveryExecutionStatus,
) -> DeliveryEventProjection:
    if not delivery_events:
        return DeliveryEventProjection(
            execution_status=fallback_status,
            latest_event_type=None,
            latest_event_at=None,
        )

    latest_event = max(delivery_events, key=_delivery_event_sort_key)
    return DeliveryEventProjection(
        execution_status=_project_delivery_execution_status_from_events(
            delivery_events=delivery_events,
            fallback_status=fallback_status,
        ),
        latest_event_type=latest_event.event_type,
        latest_event_at=_coerce_utc(latest_event.occurred_at),
    )


def _delivery_event_to_out(event: DeliveryEvent) -> DeliveryEventOut:
    return DeliveryEventOut(
        event_id=event.id,
        delivery_id=event.delivery_id,
        trade_id=event.trade_id,
        leg_no=event.leg_no,
        event_type=event.event_type,
        execution_status=event.execution_status,
        occurred_at=_coerce_utc(event.occurred_at) or datetime.now(timezone.utc),
        reversal_of_event_id=event.reversal_of_event_id,
        reversal_reason=event.reversal_reason,
        location_code=event.location_code,
        reference_code=event.reference_code,
        source=event.source,
        notes=event.notes,
        created_at=_coerce_utc(event.created_at) or datetime.now(timezone.utc),
        created_by=event.created_by,
        updated_at=_coerce_utc(event.updated_at) or datetime.now(timezone.utc),
        updated_by=event.updated_by,
        version=event.version,
    )


def _truck_detail_to_out(detail: DeliveryTruckDetail) -> DeliveryTruckDetailOut:
    return DeliveryTruckDetailOut(
        delivery_id=detail.delivery_id,
        target_run_count=detail.target_run_count,
        dispatcher_owner=detail.dispatcher_owner,
        tracking_provider=detail.tracking_provider,
        tracking_policy=detail.tracking_policy,
        default_carrier_name=detail.default_carrier_name,
        default_carrier_name_source=detail.default_carrier_name_source,
        default_external_carrier_reference=detail.default_external_carrier_reference,
        default_external_carrier_reference_source=detail.default_external_carrier_reference_source,
        equipment_type=detail.equipment_type,
        equipment_type_source=detail.equipment_type_source,
        origin_geofence_code=detail.origin_geofence_code,
        origin_geofence_code_source=detail.origin_geofence_code_source,
        destination_geofence_code=detail.destination_geofence_code,
        destination_geofence_code_source=detail.destination_geofence_code_source,
        created_at=_coerce_utc(detail.created_at) or datetime.now(timezone.utc),
        created_by=detail.created_by,
        updated_at=_coerce_utc(detail.updated_at) or datetime.now(timezone.utc),
        updated_by=detail.updated_by,
        version=detail.version,
    )


def _delivery_events_by_delivery_id(
    db: Session,
    *,
    delivery_ids: list[str],
) -> dict[str, list[DeliveryEvent]]:
    if not delivery_ids:
        return {}

    rows = db.execute(
        select(DeliveryEvent)
        .where(DeliveryEvent.delivery_id.in_(delivery_ids))
        .order_by(
            DeliveryEvent.delivery_id.asc(),
            DeliveryEvent.occurred_at.desc(),
            DeliveryEvent.id.desc(),
        )
    ).scalars().all()

    events_by_delivery_id: dict[str, list[DeliveryEvent]] = {}
    for row in rows:
        events_by_delivery_id.setdefault(row.delivery_id, []).append(row)
    return events_by_delivery_id


def _resolved_delivery_field_source(
    delivery: DeliveryObligation | None,
    *,
    source_field_name: str,
    fallback: DeliveryFieldSource,
) -> DeliveryFieldSource:
    if delivery is None:
        return fallback
    return _coerce_delivery_field_source(getattr(delivery, source_field_name, None), fallback)


def _resolved_mode_detail_field_source(
    detail: object | None,
    *,
    source_field_name: str,
    fallback: DeliveryFieldSource,
) -> DeliveryFieldSource:
    if detail is None:
        return fallback
    return _coerce_delivery_field_source(getattr(detail, source_field_name, None), fallback)


def _resolve_synced_delivery_value(
    delivery: DeliveryObligation | None,
    *,
    field_name: str,
    source_field_name: str,
    fallback_source: DeliveryFieldSource,
    derived_value: object | None,
) -> tuple[object | None, DeliveryFieldSource]:
    source = _resolved_delivery_field_source(
        delivery,
        source_field_name=source_field_name,
        fallback=fallback_source,
    )
    if delivery is not None and source == DeliveryFieldSource.MANUAL:
        return getattr(delivery, field_name), source
    return derived_value, source


def _resolve_synced_mode_detail_value(
    detail: object | None,
    *,
    field_name: str,
    source_field_name: str,
    fallback_source: DeliveryFieldSource,
    derived_value: object | None,
) -> tuple[object | None, DeliveryFieldSource]:
    source = _resolved_mode_detail_field_source(
        detail,
        source_field_name=source_field_name,
        fallback=fallback_source,
    )
    if detail is not None and source == DeliveryFieldSource.MANUAL:
        return getattr(detail, field_name), source
    return derived_value, fallback_source


def _detail_location_seed_source(delivery: DeliveryObligation) -> DeliveryFieldSource:
    location_source = _resolved_delivery_field_source(
        delivery,
        source_field_name="location_source",
        fallback=DeliveryFieldSource.TRADE_DERIVED,
    )
    if location_source == DeliveryFieldSource.TRADE_DERIVED:
        return DeliveryFieldSource.TRADE_DERIVED
    return DeliveryFieldSource.SYSTEM_GENERATED


def _logistics_detail_defaults(
    delivery: DeliveryObligation,
) -> dict[str, tuple[object | None, DeliveryFieldSource]]:
    destination_source = _detail_location_seed_source(delivery)
    return {
        "origin_location_code": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "destination_location_code": (delivery.location_code, destination_source),
        "incoterm_code": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "carrier_name": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "carrier_reference": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "asset_reference": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "equipment_type": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "load_reference": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "discharge_reference": (None, DeliveryFieldSource.SYSTEM_GENERATED),
    }


def _pipeline_detail_defaults(
    delivery: DeliveryObligation,
) -> dict[str, tuple[object | None, DeliveryFieldSource]]:
    delivery_location_source = _detail_location_seed_source(delivery)
    return {
        "pipeline_system": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "pipeline_path": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "receipt_location_code": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "delivery_location_code": (delivery.location_code, delivery_location_source),
        "contract_number": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "cycle_code": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "nomination_reference": (None, DeliveryFieldSource.SYSTEM_GENERATED),
    }


def _rail_detail_defaults() -> dict[str, tuple[object | None, DeliveryFieldSource]]:
    return {
        "rail_route_code": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "origin_station_code": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "destination_station_code": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "waybill_reference": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "release_number": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "unit_train_id": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "railcar_count": (None, DeliveryFieldSource.SYSTEM_GENERATED),
    }


def _power_detail_defaults(
    delivery: DeliveryObligation,
) -> dict[str, tuple[object | None, DeliveryFieldSource]]:
    node_source = _detail_location_seed_source(delivery)
    return {
        "market_operator": (
            _market_operator_for_location_code(delivery.location_code),
            DeliveryFieldSource.SYSTEM_GENERATED,
        ),
        "pricing_node_code": (delivery.location_code, node_source),
        "delivery_node_code": (delivery.location_code, node_source),
        "profile_code": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "schedule_reference": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "interval_minutes": (None, DeliveryFieldSource.SYSTEM_GENERATED),
        "timezone_name": (None, DeliveryFieldSource.SYSTEM_GENERATED),
    }


def _truck_detail_seed_values(
    delivery: DeliveryObligation,
    logistics_detail: DeliveryLogisticsDetail | None,
) -> dict[str, object | None]:
    return {
        "target_run_count": None,
        "dispatcher_owner": _normalize_optional_text(delivery.operations_owner),
        "tracking_provider": None,
        "tracking_policy": None,
        "default_carrier_name": logistics_detail.carrier_name if logistics_detail is not None else None,
        "default_carrier_name_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        "default_external_carrier_reference": (
            logistics_detail.carrier_reference if logistics_detail is not None else None
        ),
        "default_external_carrier_reference_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        "equipment_type": logistics_detail.equipment_type if logistics_detail is not None else None,
        "equipment_type_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        "origin_geofence_code": None,
        "origin_geofence_code_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        "destination_geofence_code": None,
        "destination_geofence_code_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
    }


def _resolve_mode_detail_snapshot(
    detail: object | None,
    *,
    defaults: dict[str, tuple[object | None, DeliveryFieldSource]],
) -> dict[str, object | None]:
    snapshot: dict[str, object | None] = {}
    for field_name, (derived_value, derived_source) in defaults.items():
        value, source = _resolve_synced_mode_detail_value(
            detail,
            field_name=field_name,
            source_field_name=f"{field_name}_source",
            fallback_source=derived_source,
            derived_value=derived_value,
        )
        snapshot[field_name] = value
        snapshot[f"{field_name}_source"] = source.value
    return snapshot


def _persisted_delivery_context_by_id(
    db: Session,
    *,
    trade_ids: list[str],
) -> tuple[
    dict[str, DeliveryObligation],
    dict[str, DeliveryLogisticsDetail],
    dict[str, DeliveryTruckDetail],
    dict[str, int],
    dict[str, int],
    dict[str, DeliveryPipelineDetail],
    dict[str, DeliveryRailDetail],
    dict[str, DeliveryPowerDetail],
]:
    if not trade_ids:
        return {}, {}, {}, {}, {}, {}, {}, {}

    persisted_deliveries = db.execute(
        select(DeliveryObligation)
        .where(DeliveryObligation.trade_id.in_(trade_ids))
    ).scalars().all()
    delivery_ids = [delivery.delivery_id for delivery in persisted_deliveries]
    if not delivery_ids:
        return {}, {}, {}, {}, {}, {}, {}, {}

    logistics_details = db.execute(
        select(DeliveryLogisticsDetail).where(DeliveryLogisticsDetail.delivery_id.in_(delivery_ids))
    ).scalars().all()
    truck_details = db.execute(
        select(DeliveryTruckDetail).where(DeliveryTruckDetail.delivery_id.in_(delivery_ids))
    ).scalars().all()
    truck_movement_counts = dict(
        db.execute(
            select(
                DeliveryTruckMovement.delivery_id,
                func.count(DeliveryTruckMovement.movement_id),
            )
            .where(DeliveryTruckMovement.delivery_id.in_(delivery_ids))
            .group_by(DeliveryTruckMovement.delivery_id)
        ).all()
    )
    active_truck_movement_counts = dict(
        db.execute(
            select(
                DeliveryTruckMovement.delivery_id,
                func.count(DeliveryTruckMovement.movement_id),
            )
            .where(
                DeliveryTruckMovement.delivery_id.in_(delivery_ids),
                ~DeliveryTruckMovement.status.in_(
                    (
                        TruckMovementStatus.COMPLETED.value,
                        TruckMovementStatus.CANCELLED.value,
                    )
                ),
            )
            .group_by(DeliveryTruckMovement.delivery_id)
        ).all()
    )
    pipeline_details = db.execute(
        select(DeliveryPipelineDetail).where(DeliveryPipelineDetail.delivery_id.in_(delivery_ids))
    ).scalars().all()
    rail_details = db.execute(
        select(DeliveryRailDetail).where(DeliveryRailDetail.delivery_id.in_(delivery_ids))
    ).scalars().all()
    power_details = db.execute(
        select(DeliveryPowerDetail).where(DeliveryPowerDetail.delivery_id.in_(delivery_ids))
    ).scalars().all()

    return (
        {delivery.delivery_id: delivery for delivery in persisted_deliveries},
        {detail.delivery_id: detail for detail in logistics_details},
        {detail.delivery_id: detail for detail in truck_details},
        {delivery_id: int(count) for delivery_id, count in truck_movement_counts.items()},
        {delivery_id: int(count) for delivery_id, count in active_truck_movement_counts.items()},
        {detail.delivery_id: detail for detail in pipeline_details},
        {detail.delivery_id: detail for detail in rail_details},
        {detail.delivery_id: detail for detail in power_details},
    )


def _rail_reference_context_by_code(
    db: Session,
    *,
    rail_details_by_id: dict[str, DeliveryRailDetail],
) -> tuple[dict[str, ReferenceRailRoute], dict[str, ReferenceRailLine]]:
    rail_route_codes = sorted(
        {
            normalize_code(detail.rail_route_code)
            for detail in rail_details_by_id.values()
            if (detail.rail_route_code or "").strip()
        }
    )
    if not rail_route_codes:
        return {}, {}

    rail_routes = db.execute(
        select(ReferenceRailRoute).where(ReferenceRailRoute.code.in_(rail_route_codes))
    ).scalars().all()
    rail_routes_by_code = {route.code: route for route in rail_routes}

    rail_line_codes = sorted(
        {
            route.rail_line_code
            for route in rail_routes
            if (route.rail_line_code or "").strip()
        }
    )
    if not rail_line_codes:
        return rail_routes_by_code, {}

    rail_lines = db.execute(
        select(ReferenceRailLine).where(ReferenceRailLine.code.in_(rail_line_codes))
    ).scalars().all()
    return rail_routes_by_code, {line.code: line for line in rail_lines}


def _load_active_delivery_record(
    db: Session,
    *,
    delivery_id: str,
) -> tuple[DeliveryObligation, Trade, TradeLeg | None]:
    row = db.execute(
        select(DeliveryObligation, Trade)
        .join(Trade, Trade.trade_id == DeliveryObligation.trade_id)
        .where(
            DeliveryObligation.delivery_id == delivery_id,
            Trade.trade_nature == "PHYSICAL",
            Trade.status == "ACTIVE",
        )
    ).first()
    if row is None:
        raise LookupError(f"Delivery '{delivery_id}' was not found.")
    delivery, trade = row
    trade_leg = db.get(TradeLeg, delivery.trade_leg_id) if delivery.trade_leg_id else None
    return delivery, trade, trade_leg


def _current_mode_family(delivery: DeliveryObligation) -> DeliveryModeFamily:
    fallback_transport_mode = _coerce_transport_mode(delivery.transport_mode, TransportMode.UNSPECIFIED)
    return _coerce_mode_family(delivery.mode_family, _mode_family_for_transport_mode(fallback_transport_mode))


def _ensure_delivery_mode_detail_shape(
    db: Session,
    *,
    delivery: DeliveryObligation,
    actor_id: str,
    reference_time: datetime,
) -> tuple[
    DeliveryLogisticsDetail | None,
    DeliveryPipelineDetail | None,
    DeliveryRailDetail | None,
    DeliveryPowerDetail | None,
]:
    logistics_detail = db.get(DeliveryLogisticsDetail, delivery.delivery_id)
    pipeline_detail = db.get(DeliveryPipelineDetail, delivery.delivery_id)
    rail_detail = db.get(DeliveryRailDetail, delivery.delivery_id)
    power_detail = db.get(DeliveryPowerDetail, delivery.delivery_id)
    mode_family = _current_mode_family(delivery)

    if mode_family == DeliveryModeFamily.LOGISTICS:
        if pipeline_detail is not None:
            db.delete(pipeline_detail)
            pipeline_detail = None
        if power_detail is not None:
            db.delete(power_detail)
            power_detail = None
        logistics_snapshot = _resolve_mode_detail_snapshot(
            logistics_detail,
            defaults=_logistics_detail_defaults(delivery),
        )
        if logistics_detail is None:
            logistics_detail = DeliveryLogisticsDetail(
                delivery_id=delivery.delivery_id,
                created_at=reference_time,
                created_by=actor_id,
                updated_at=reference_time,
                updated_by=actor_id,
                version=1,
                **logistics_snapshot,
            )
            db.add(logistics_detail)
        elif _apply_model_changes(
            logistics_detail,
            logistics_snapshot,
        ):
            _touch_audited_record(logistics_detail, actor_id=actor_id, reference_time=reference_time)

        if _coerce_transport_mode(delivery.transport_mode, TransportMode.UNSPECIFIED) == TransportMode.RAIL:
            rail_snapshot = _resolve_mode_detail_snapshot(
                rail_detail,
                defaults=_rail_detail_defaults(),
            )
            if rail_detail is None:
                rail_detail = DeliveryRailDetail(
                    delivery_id=delivery.delivery_id,
                    created_at=reference_time,
                    created_by=actor_id,
                    updated_at=reference_time,
                    updated_by=actor_id,
                    version=1,
                    **rail_snapshot,
                )
                db.add(rail_detail)
            elif _apply_model_changes(
                rail_detail,
                rail_snapshot,
            ):
                _touch_audited_record(rail_detail, actor_id=actor_id, reference_time=reference_time)
        elif rail_detail is not None:
            db.delete(rail_detail)
            rail_detail = None

    if mode_family == DeliveryModeFamily.NETWORK_FLOW:
        if logistics_detail is not None:
            db.delete(logistics_detail)
            logistics_detail = None
        if rail_detail is not None:
            db.delete(rail_detail)
            rail_detail = None
        if power_detail is not None:
            db.delete(power_detail)
            power_detail = None
        pipeline_snapshot = _resolve_mode_detail_snapshot(
            pipeline_detail,
            defaults=_pipeline_detail_defaults(delivery),
        )
        if pipeline_detail is None:
            pipeline_detail = DeliveryPipelineDetail(
                delivery_id=delivery.delivery_id,
                created_at=reference_time,
                created_by=actor_id,
                updated_at=reference_time,
                updated_by=actor_id,
                version=1,
                **pipeline_snapshot,
            )
            db.add(pipeline_detail)
        elif _apply_model_changes(
            pipeline_detail,
            pipeline_snapshot,
        ):
            _touch_audited_record(pipeline_detail, actor_id=actor_id, reference_time=reference_time)

    if mode_family == DeliveryModeFamily.POWER_SCHEDULE:
        if logistics_detail is not None:
            db.delete(logistics_detail)
            logistics_detail = None
        if pipeline_detail is not None:
            db.delete(pipeline_detail)
            pipeline_detail = None
        if rail_detail is not None:
            db.delete(rail_detail)
            rail_detail = None
        power_snapshot = _resolve_mode_detail_snapshot(
            power_detail,
            defaults=_power_detail_defaults(delivery),
        )
        if power_detail is None:
            power_detail = DeliveryPowerDetail(
                delivery_id=delivery.delivery_id,
                created_at=reference_time,
                created_by=actor_id,
                updated_at=reference_time,
                updated_by=actor_id,
                version=1,
                **power_snapshot,
            )
            db.add(power_detail)
        elif _apply_model_changes(
            power_detail,
            power_snapshot,
        ):
            _touch_audited_record(power_detail, actor_id=actor_id, reference_time=reference_time)

    return logistics_detail, pipeline_detail, rail_detail, power_detail


def _ensure_delivery_truck_detail(
    db: Session,
    *,
    delivery: DeliveryObligation,
    logistics_detail: DeliveryLogisticsDetail | None,
    actor_id: str,
    reference_time: datetime,
) -> DeliveryTruckDetail:
    truck_detail = db.get(DeliveryTruckDetail, delivery.delivery_id)
    if truck_detail is not None:
        return truck_detail

    truck_detail = DeliveryTruckDetail(
        delivery_id=delivery.delivery_id,
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
        **_truck_detail_seed_values(delivery, logistics_detail),
    )
    db.add(truck_detail)
    return truck_detail


def _require_delivery_mode_family(
    delivery: DeliveryObligation,
    *,
    expected: DeliveryModeFamily,
    detail_label: str,
) -> None:
    current_mode_family = _current_mode_family(delivery)
    if current_mode_family != expected:
        raise ValueError(
            f"Delivery '{delivery.delivery_id}' is not a {detail_label} obligation. "
            f"It is currently {current_mode_family.value}. Update the transport mode first."
        )


def _require_transport_mode(
    delivery: DeliveryObligation,
    *,
    expected: TransportMode,
    detail_label: str,
) -> None:
    current_transport_mode = _coerce_transport_mode(delivery.transport_mode, TransportMode.UNSPECIFIED)
    if current_transport_mode != expected:
        raise ValueError(
            f"Delivery '{delivery.delivery_id}' is not a {detail_label} obligation. "
            f"It is currently {current_transport_mode.value}. Update the transport mode first."
        )


def _days_until_delivery_start(delivery_start: date | None, reference_time: datetime) -> int | None:
    if delivery_start is None:
        return None
    return (delivery_start - reference_time.date()).days


def _rail_scheduling_started(
    *,
    trade: Trade,
    execution_status: str,
) -> bool:
    return trade.nomination_status in {
        NominationStatus.SCHEDULED.value,
        NominationStatus.NOMINATED.value,
        NominationStatus.COMPLETED.value,
    } or execution_status in {
        DeliveryExecutionStatus.SCHEDULED.value,
        DeliveryExecutionStatus.IN_PROGRESS.value,
        DeliveryExecutionStatus.COMPLETED.value,
    }


def _build_rail_blockers(
    *,
    trade: Trade,
    execution_status: str,
    logistics_detail: DeliveryLogisticsDetail | None,
    rail_detail: DeliveryRailDetail | None,
    rail_route: ReferenceRailRoute | None,
    rail_line: ReferenceRailLine | None,
) -> list[str]:
    blockers: list[str] = []
    rail_route_code = _normalize_optional_text(
        rail_detail.rail_route_code if rail_detail is not None else None
    )
    origin_station_code = _normalize_optional_text(
        rail_detail.origin_station_code if rail_detail is not None else None
    )
    destination_station_code = _normalize_optional_text(
        rail_detail.destination_station_code if rail_detail is not None else None
    )
    waybill_reference = _normalize_optional_text(
        rail_detail.waybill_reference if rail_detail is not None else None
    )
    release_number = _normalize_optional_text(
        rail_detail.release_number if rail_detail is not None else None
    )
    unit_train_id = _normalize_optional_text(
        rail_detail.unit_train_id if rail_detail is not None else None
    )
    origin_location_code = _normalize_optional_text(
        logistics_detail.origin_location_code if logistics_detail is not None else None
    )
    destination_location_code = _normalize_optional_text(
        logistics_detail.destination_location_code if logistics_detail is not None else None
    )

    if rail_route_code is None:
        blockers.append("Rail route selection is missing.")
    elif rail_route is None:
        blockers.append(f"Selected rail route '{rail_route_code}' does not exist in reference data.")
    else:
        if not rail_route.is_active:
            blockers.append(f"Selected rail route '{rail_route.code}' is inactive in reference data.")
        if rail_line is None:
            blockers.append(f"Selected rail line '{rail_route.rail_line_code}' does not exist in reference data.")
        elif not rail_line.is_active:
            blockers.append(f"Selected rail line '{rail_line.code}' is inactive in reference data.")

        if (
            rail_route.origin_location_code
            and origin_location_code
            and origin_location_code != rail_route.origin_location_code
        ):
            blockers.append(
                f"Rail origin location does not match selected route origin '{rail_route.origin_location_code}'."
            )
        if (
            rail_route.destination_location_code
            and destination_location_code
            and destination_location_code != rail_route.destination_location_code
        ):
            blockers.append(
                "Rail destination location does not match selected route destination "
                f"'{rail_route.destination_location_code}'."
            )

    if origin_station_code is None:
        blockers.append("Rail origin station is missing.")
    if destination_station_code is None:
        blockers.append("Rail destination station is missing.")

    if _rail_scheduling_started(trade=trade, execution_status=execution_status) and waybill_reference is None:
        blockers.append("Waybill reference is missing after rail scheduling started.")
    if waybill_reference is not None and _rail_scheduling_started(
        trade=trade,
        execution_status=execution_status,
    ) and release_number is None:
        blockers.append("Release number is missing for the captured rail waybill.")
    if unit_train_id is not None and rail_detail is not None and rail_detail.railcar_count is None:
        blockers.append("Railcar count is missing for the captured unit train.")

    return blockers


def _build_blockers(
    *,
    trade: Trade,
    classification: DeliveryClassification,
    counterparty: str | None,
    volume: float | None,
    unit_of_measure: str | None,
    location_code: str | None,
    delivery_start: date | None,
    delivery_end: date | None,
    execution_status: str,
    credit_hold_reason: str | None,
    logistics_detail: DeliveryLogisticsDetail | None,
    rail_detail: DeliveryRailDetail | None,
    rail_route: ReferenceRailRoute | None,
    rail_line: ReferenceRailLine | None,
    reference_time: datetime,
) -> list[str]:
    blockers: list[str] = []

    if credit_hold_reason:
        blockers.append(f"Credit hold: {credit_hold_reason}")
    if not (counterparty or "").strip():
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
    if classification.mode_family == DeliveryModeFamily.LOGISTICS and classification.transport_mode == TransportMode.RAIL:
        blockers.extend(
            _build_rail_blockers(
                trade=trade,
                execution_status=execution_status,
                logistics_detail=logistics_detail,
                rail_detail=rail_detail,
                rail_route=rail_route,
                rail_line=rail_line,
            )
        )

    return blockers


def _scheduling_workflow_items_by_trade_id(
    db: Session,
    *,
    trade_ids: list[str],
    reference_time: datetime,
) -> dict[str, list[DeliverySchedulingWorkflowItemOut]]:
    if not trade_ids:
        return {}

    rows = db.execute(
        select(TradeWorkflowItem)
        .where(
            TradeWorkflowItem.trade_id.in_(trade_ids),
            TradeWorkflowItem.workflow_type.in_(tuple(SCHEDULING_WORKFLOW_TYPES)),
        )
        .order_by(
            TradeWorkflowItem.trade_id.asc(),
            TradeWorkflowItem.workflow_type.asc(),
            TradeWorkflowItem.id.asc(),
        )
    ).scalars().all()

    items_by_trade_id: dict[str, list[DeliverySchedulingWorkflowItemOut]] = {}
    for row in rows:
        due_at = _coerce_utc(row.due_at)
        updated_at = _coerce_utc(row.updated_at) or reference_time
        is_closed = is_workflow_item_closed(row.workflow_type, row.status)
        is_overdue = bool(due_at is not None and due_at < reference_time and not is_closed)
        items_by_trade_id.setdefault(row.trade_id, []).append(
            DeliverySchedulingWorkflowItemOut(
                item_id=row.id,
                workflow_type=row.workflow_type,
                status=row.status,
                owner=row.owner,
                due_at=due_at,
                notes=row.notes,
                updated_at=updated_at,
                version=row.version,
                is_closed=is_closed,
                is_overdue=is_overdue,
            )
        )

    for trade_id, items in items_by_trade_id.items():
        items_by_trade_id[trade_id] = sorted(
            items,
            key=lambda item: (
                0 if not item.is_closed else 1,
                _workflow_due_sort_key(item.due_at),
                SCHEDULING_WORKFLOW_TYPE_ORDER.get(item.workflow_type, 99),
                item.item_id,
            ),
        )

    return items_by_trade_id


def _derive_scheduling_projection(
    *,
    delivery_status: str,
    blockers: list[str],
    nomination_status: str,
    allocation_status: str,
    workflow_items: list[DeliverySchedulingWorkflowItemOut],
) -> SchedulingProjection:
    open_workflow_items = [item for item in workflow_items if not item.is_closed]
    owner = next((item.owner for item in open_workflow_items if (item.owner or "").strip()), None)
    due_at = next((item.due_at for item in open_workflow_items if item.due_at is not None), None)
    next_item = open_workflow_items[0] if open_workflow_items else None
    has_blocked_workflow = any(
        item.is_overdue or item.status in BLOCKED_SCHEDULING_WORKFLOW_STATUSES
        for item in open_workflow_items
    )
    allocation_follow_up = (
        nomination_status in {
            NominationStatus.SCHEDULED.value,
            NominationStatus.NOMINATED.value,
            NominationStatus.COMPLETED.value,
        }
        and allocation_status
        not in {
            AllocationStatus.NOT_REQUIRED.value,
            AllocationStatus.ALLOCATED.value,
            AllocationStatus.COMPLETED.value,
        }
    )
    nomination_in_flight = nomination_status in {
        NominationStatus.SCHEDULED.value,
        NominationStatus.NOMINATED.value,
    }

    if delivery_status == "BLOCKED" or blockers or has_blocked_workflow:
        stage = "BLOCKED"
    elif allocation_follow_up or nomination_in_flight or owner:
        stage = "IN_FLIGHT"
    elif (
        not blockers
        and nomination_status not in {
            NominationStatus.NOT_REQUIRED.value,
            NominationStatus.COMPLETED.value,
        }
    ):
        stage = "READY"
    else:
        stage = "WATCHLIST"

    return SchedulingProjection(
        stage=stage,
        owner=owner,
        due_at=due_at,
        open_work_item_count=len(open_workflow_items),
        next_workflow_type=next_item.workflow_type if next_item is not None else None,
        next_workflow_status=next_item.status if next_item is not None else None,
        work_items=workflow_items,
    )


def _status_for_delivery(
    *,
    trade: Trade,
    blockers: list[str],
    execution_status: str,
) -> str:
    if trade.settlement_status == SettlementStatus.SETTLED.value and trade.payment_status in {
        PaymentStatus.PAID.value,
        PaymentStatus.NOT_REQUIRED.value,
    }:
        return "COMPLETED"
    if execution_status == DeliveryExecutionStatus.COMPLETED.value:
        return "COMPLETED"
    if execution_status in {
        DeliveryExecutionStatus.ON_HOLD.value,
        DeliveryExecutionStatus.CANCELLED.value,
    }:
        return "BLOCKED"
    if blockers:
        return "BLOCKED"
    if execution_status == DeliveryExecutionStatus.IN_PROGRESS.value:
        return "IN_PROGRESS"
    if (
        trade.pricing_status == PricingStatus.PRICED.value
        and trade.confirmation_status == ConfirmationStatus.CONFIRMED.value
    ):
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
    actualization: TradeActualization | None,
    credit_hold_reason: str | None,
    reference_time: datetime,
    scheduling_work_items: list[DeliverySchedulingWorkflowItemOut],
    persisted_delivery: DeliveryObligation | None = None,
    logistics_detail: DeliveryLogisticsDetail | None = None,
    truck_detail: DeliveryTruckDetail | None = None,
    truck_movement_count: int = 0,
    active_truck_movement_count: int = 0,
    pipeline_detail: DeliveryPipelineDetail | None = None,
    rail_detail: DeliveryRailDetail | None = None,
    rail_route: ReferenceRailRoute | None = None,
    rail_line: ReferenceRailLine | None = None,
    power_detail: DeliveryPowerDetail | None = None,
    delivery_events: list[DeliveryEvent] | None = None,
) -> DeliveryObligationOut:
    derived_commodity_class = leg.commodity_class if leg is not None else trade.commodity_class
    derived_commodity = leg.commodity_code if leg is not None else trade.commodity
    derived_volume = (
        float(leg.quantity)
        if leg is not None and leg.quantity is not None
        else float(trade.volume) if trade.volume is not None else None
    )
    derived_unit_of_measure = leg.quantity_unit_code if leg is not None else trade.unit_of_measure
    derived_location_code = leg.location_code if leg is not None else trade.location_code
    derived_delivery_start = leg.delivery_start if leg is not None else trade.delivery_start
    derived_delivery_end = leg.delivery_end if leg is not None else trade.delivery_end
    derived_booked_at = _booked_at_for_trade(trade)
    derived_classification = _classify_delivery(derived_commodity_class, derived_unit_of_measure)
    derived_execution_status = _default_execution_status_for_trade(trade)
    event_projection = _delivery_event_projection(
        delivery_events=delivery_events or [],
        fallback_status=derived_execution_status,
    )

    commodity_class = persisted_delivery.commodity_class if persisted_delivery is not None else derived_commodity_class
    commodity = persisted_delivery.commodity if persisted_delivery is not None else derived_commodity
    volume = (
        float(persisted_delivery.volume)
        if persisted_delivery is not None and persisted_delivery.volume is not None
        else derived_volume
    )
    unit_of_measure = persisted_delivery.unit_of_measure if persisted_delivery is not None else derived_unit_of_measure
    book = persisted_delivery.book if persisted_delivery is not None else trade.book
    portfolio = persisted_delivery.portfolio if persisted_delivery is not None else trade.portfolio
    counterparty = persisted_delivery.counterparty if persisted_delivery is not None else trade.counterparty
    location_code = persisted_delivery.location_code if persisted_delivery is not None else derived_location_code
    delivery_start = persisted_delivery.delivery_start if persisted_delivery is not None else derived_delivery_start
    delivery_end = persisted_delivery.delivery_end if persisted_delivery is not None else derived_delivery_end
    book_source = _resolved_delivery_field_source(
        persisted_delivery,
        source_field_name="book_source",
        fallback=DeliveryFieldSource.TRADE_DERIVED,
    ).value
    portfolio_source = _resolved_delivery_field_source(
        persisted_delivery,
        source_field_name="portfolio_source",
        fallback=DeliveryFieldSource.TRADE_DERIVED,
    ).value
    counterparty_source = _resolved_delivery_field_source(
        persisted_delivery,
        source_field_name="counterparty_source",
        fallback=DeliveryFieldSource.TRADE_DERIVED,
    ).value
    location_source = _resolved_delivery_field_source(
        persisted_delivery,
        source_field_name="location_source",
        fallback=DeliveryFieldSource.TRADE_DERIVED,
    ).value
    delivery_window_source = _resolved_delivery_field_source(
        persisted_delivery,
        source_field_name="delivery_window_source",
        fallback=DeliveryFieldSource.TRADE_DERIVED,
    ).value
    execution_status_source = _resolved_delivery_field_source(
        persisted_delivery,
        source_field_name="execution_status_source",
        fallback=DeliveryFieldSource.SYSTEM_GENERATED,
    ).value
    operations_owner_source = _resolved_delivery_field_source(
        persisted_delivery,
        source_field_name="operations_owner_source",
        fallback=DeliveryFieldSource.SYSTEM_GENERATED,
    ).value
    external_reference_source = _resolved_delivery_field_source(
        persisted_delivery,
        source_field_name="external_reference_source",
        fallback=DeliveryFieldSource.SYSTEM_GENERATED,
    ).value
    ops_notes_source = _resolved_delivery_field_source(
        persisted_delivery,
        source_field_name="ops_notes_source",
        fallback=DeliveryFieldSource.SYSTEM_GENERATED,
    ).value
    execution_status = (
        persisted_delivery.execution_status
        if persisted_delivery is not None
        and _resolved_delivery_field_source(
            persisted_delivery,
            source_field_name="execution_status_source",
            fallback=DeliveryFieldSource.SYSTEM_GENERATED,
        )
        == DeliveryFieldSource.MANUAL
        and (persisted_delivery.execution_status or "").strip()
        else event_projection.execution_status.value
    )
    operations_owner = persisted_delivery.operations_owner if persisted_delivery is not None else None
    external_reference = persisted_delivery.external_reference if persisted_delivery is not None else None
    ops_notes = persisted_delivery.ops_notes if persisted_delivery is not None else None
    booked_at = _coerce_utc(persisted_delivery.booked_at) if persisted_delivery is not None else derived_booked_at
    if booked_at is None:
        booked_at = derived_booked_at
    classification = _classification_for_persisted_record(persisted_delivery, derived_classification)
    rail_route_code = rail_detail.rail_route_code if rail_detail is not None else None
    rail_route_code_source = (
        _resolved_mode_detail_field_source(
            rail_detail,
            source_field_name="rail_route_code_source",
            fallback=DeliveryFieldSource.SYSTEM_GENERATED,
        ).value
        if rail_detail is not None
        else None
    )
    rail_line_code = rail_route.rail_line_code if rail_route is not None else None
    railroad_code = rail_line.railroad_code if rail_line is not None else None
    rail_route_direction = rail_route.route_direction if rail_route is not None else None
    rail_schedule_timezone = (
        rail_route.schedule_timezone
        if rail_route is not None and (rail_route.schedule_timezone or "").strip()
        else rail_line.default_timezone
        if rail_line is not None
        else None
    )
    rail_service_calendar_code = rail_route.service_calendar_code if rail_route is not None else None
    rail_placement_cutoff_time_local = (
        rail_route.placement_cutoff_time_local if rail_route is not None else None
    )
    rail_release_cutoff_time_local = (
        rail_route.release_cutoff_time_local if rail_route is not None else None
    )
    rail_placement_free_time_hours = (
        rail_route.placement_free_time_hours if rail_route is not None else None
    )
    rail_release_free_time_hours = (
        rail_route.release_free_time_hours if rail_route is not None else None
    )
    blockers = _build_blockers(
        trade=trade,
        classification=classification,
        counterparty=counterparty,
        volume=volume,
        unit_of_measure=unit_of_measure,
        location_code=location_code,
        delivery_start=delivery_start,
        delivery_end=delivery_end,
        execution_status=execution_status,
        credit_hold_reason=credit_hold_reason,
        logistics_detail=logistics_detail,
        rail_detail=rail_detail,
        rail_route=rail_route,
        rail_line=rail_line,
        reference_time=reference_time,
    )
    status = _status_for_delivery(
        trade=trade,
        blockers=blockers,
        execution_status=execution_status,
    )
    actualization_projection = build_delivery_actualization_projection(
        trade=trade,
        leg=leg,
        actualization=actualization,
    )
    scheduling_projection = _derive_scheduling_projection(
        delivery_status=status,
        blockers=blockers,
        nomination_status=trade.nomination_status,
        allocation_status=trade.allocation_status,
        workflow_items=scheduling_work_items,
    )
    persisted_updated_at = _coerce_utc(persisted_delivery.updated_at) if persisted_delivery is not None else None
    detail_updated_at = _detail_updated_at(
        logistics_detail,
        truck_detail,
        pipeline_detail,
        rail_detail,
        power_detail,
    )
    event_updated_at = _detail_updated_at(*(delivery_events or []))
    last_updated_at = max(
        candidate
        for candidate in (
            _latest_updated_at(trade, leg, booked_at),
            persisted_updated_at,
            detail_updated_at,
            event_updated_at,
        )
        if candidate is not None
    )
    origin_location_code = (
        logistics_detail.origin_location_code
        if logistics_detail is not None
        else pipeline_detail.receipt_location_code
        if pipeline_detail is not None
        else None
    )
    origin_location_code_source = (
        _resolved_mode_detail_field_source(
            logistics_detail,
            source_field_name="origin_location_code_source",
            fallback=DeliveryFieldSource.SYSTEM_GENERATED,
        ).value
        if logistics_detail is not None
        else _resolved_mode_detail_field_source(
            pipeline_detail,
            source_field_name="receipt_location_code_source",
            fallback=DeliveryFieldSource.SYSTEM_GENERATED,
        ).value
        if pipeline_detail is not None
        else None
    )
    destination_location_code = (
        logistics_detail.destination_location_code
        if logistics_detail is not None
        else pipeline_detail.delivery_location_code
        if pipeline_detail is not None
        else power_detail.delivery_node_code
        if power_detail is not None
        else None
    )
    destination_location_code_source = (
        _resolved_mode_detail_field_source(
            logistics_detail,
            source_field_name="destination_location_code_source",
            fallback=DeliveryFieldSource.SYSTEM_GENERATED,
        ).value
        if logistics_detail is not None
        else _resolved_mode_detail_field_source(
            pipeline_detail,
            source_field_name="delivery_location_code_source",
            fallback=DeliveryFieldSource.SYSTEM_GENERATED,
        ).value
        if pipeline_detail is not None
        else _resolved_mode_detail_field_source(
            power_detail,
            source_field_name="delivery_node_code_source",
            fallback=DeliveryFieldSource.SYSTEM_GENERATED,
        ).value
        if power_detail is not None
        else None
    )
    return DeliveryObligationOut(
        delivery_id=build_delivery_obligation_id(trade.trade_id, leg.leg_no if leg is not None else None),
        trade_id=trade.trade_id,
        leg_no=leg.leg_no if leg is not None else None,
        external_trade_id=(
            persisted_delivery.external_trade_id
            if persisted_delivery is not None
            else trade.external_trade_id
        ),
        status=status,
        direction=(
            persisted_delivery.direction
            if persisted_delivery is not None
            else _direction_for_side(leg.side if leg is not None else trade.trade_side)
        ),
        mode_family=classification.mode_family.value,
        transport_mode=classification.transport_mode.value,
        transport_mode_source=classification.transport_mode_source.value,
        delivery_profile=classification.delivery_profile.value,
        book=book,
        book_source=book_source,
        portfolio=portfolio,
        portfolio_source=portfolio_source,
        counterparty=counterparty,
        counterparty_source=counterparty_source,
        commodity_class=commodity_class,
        commodity=commodity,
        volume=volume,
        unit_of_measure=unit_of_measure,
        trade_currency_code=(
            persisted_delivery.trade_currency_code
            if persisted_delivery is not None
            else trade.trade_currency_code
        ),
        price_unit_code=(
            persisted_delivery.price_unit_code
            if persisted_delivery is not None
            else trade.price_unit_code
        ),
        location_code=location_code,
        location_source=location_source,
        delivery_start=delivery_start,
        delivery_end=delivery_end,
        delivery_window_source=delivery_window_source,
        origin_location_code=origin_location_code,
        origin_location_code_source=origin_location_code_source,
        destination_location_code=destination_location_code,
        destination_location_code_source=destination_location_code_source,
        carrier_name=logistics_detail.carrier_name if logistics_detail is not None else None,
        carrier_name_source=(
            _resolved_mode_detail_field_source(
                logistics_detail,
                source_field_name="carrier_name_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if logistics_detail is not None
            else None
        ),
        carrier_reference=logistics_detail.carrier_reference if logistics_detail is not None else None,
        carrier_reference_source=(
            _resolved_mode_detail_field_source(
                logistics_detail,
                source_field_name="carrier_reference_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if logistics_detail is not None
            else None
        ),
        asset_reference=logistics_detail.asset_reference if logistics_detail is not None else None,
        asset_reference_source=(
            _resolved_mode_detail_field_source(
                logistics_detail,
                source_field_name="asset_reference_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if logistics_detail is not None
            else None
        ),
        incoterm_code=logistics_detail.incoterm_code if logistics_detail is not None else None,
        incoterm_code_source=(
            _resolved_mode_detail_field_source(
                logistics_detail,
                source_field_name="incoterm_code_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if logistics_detail is not None
            else None
        ),
        equipment_type=logistics_detail.equipment_type if logistics_detail is not None else None,
        equipment_type_source=(
            _resolved_mode_detail_field_source(
                logistics_detail,
                source_field_name="equipment_type_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if logistics_detail is not None
            else None
        ),
        load_reference=logistics_detail.load_reference if logistics_detail is not None else None,
        load_reference_source=(
            _resolved_mode_detail_field_source(
                logistics_detail,
                source_field_name="load_reference_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if logistics_detail is not None
            else None
        ),
        discharge_reference=logistics_detail.discharge_reference if logistics_detail is not None else None,
        discharge_reference_source=(
            _resolved_mode_detail_field_source(
                logistics_detail,
                source_field_name="discharge_reference_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if logistics_detail is not None
            else None
        ),
        truck_detail=_truck_detail_to_out(truck_detail) if truck_detail is not None else None,
        truck_movement_count=truck_movement_count,
        active_truck_movement_count=active_truck_movement_count,
        rail_route_code=rail_route_code,
        rail_route_code_source=rail_route_code_source,
        rail_line_code=rail_line_code,
        railroad_code=railroad_code,
        rail_route_direction=rail_route_direction,
        rail_schedule_timezone=rail_schedule_timezone,
        rail_service_calendar_code=rail_service_calendar_code,
        rail_placement_cutoff_time_local=rail_placement_cutoff_time_local,
        rail_release_cutoff_time_local=rail_release_cutoff_time_local,
        rail_placement_free_time_hours=rail_placement_free_time_hours,
        rail_release_free_time_hours=rail_release_free_time_hours,
        origin_station_code=rail_detail.origin_station_code if rail_detail is not None else None,
        origin_station_code_source=(
            _resolved_mode_detail_field_source(
                rail_detail,
                source_field_name="origin_station_code_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if rail_detail is not None
            else None
        ),
        destination_station_code=rail_detail.destination_station_code if rail_detail is not None else None,
        destination_station_code_source=(
            _resolved_mode_detail_field_source(
                rail_detail,
                source_field_name="destination_station_code_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if rail_detail is not None
            else None
        ),
        waybill_reference=rail_detail.waybill_reference if rail_detail is not None else None,
        waybill_reference_source=(
            _resolved_mode_detail_field_source(
                rail_detail,
                source_field_name="waybill_reference_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if rail_detail is not None
            else None
        ),
        release_number=rail_detail.release_number if rail_detail is not None else None,
        release_number_source=(
            _resolved_mode_detail_field_source(
                rail_detail,
                source_field_name="release_number_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if rail_detail is not None
            else None
        ),
        unit_train_id=rail_detail.unit_train_id if rail_detail is not None else None,
        unit_train_id_source=(
            _resolved_mode_detail_field_source(
                rail_detail,
                source_field_name="unit_train_id_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if rail_detail is not None
            else None
        ),
        railcar_count=rail_detail.railcar_count if rail_detail is not None else None,
        railcar_count_source=(
            _resolved_mode_detail_field_source(
                rail_detail,
                source_field_name="railcar_count_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if rail_detail is not None
            else None
        ),
        receipt_location_code=pipeline_detail.receipt_location_code if pipeline_detail is not None else None,
        receipt_location_code_source=(
            _resolved_mode_detail_field_source(
                pipeline_detail,
                source_field_name="receipt_location_code_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if pipeline_detail is not None
            else None
        ),
        delivery_location_code=pipeline_detail.delivery_location_code if pipeline_detail is not None else None,
        delivery_location_code_source=(
            _resolved_mode_detail_field_source(
                pipeline_detail,
                source_field_name="delivery_location_code_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if pipeline_detail is not None
            else None
        ),
        pipeline_system=pipeline_detail.pipeline_system if pipeline_detail is not None else None,
        pipeline_system_source=(
            _resolved_mode_detail_field_source(
                pipeline_detail,
                source_field_name="pipeline_system_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if pipeline_detail is not None
            else None
        ),
        pipeline_path=pipeline_detail.pipeline_path if pipeline_detail is not None else None,
        pipeline_path_source=(
            _resolved_mode_detail_field_source(
                pipeline_detail,
                source_field_name="pipeline_path_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if pipeline_detail is not None
            else None
        ),
        pipeline_contract_number=pipeline_detail.contract_number if pipeline_detail is not None else None,
        pipeline_contract_number_source=(
            _resolved_mode_detail_field_source(
                pipeline_detail,
                source_field_name="contract_number_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if pipeline_detail is not None
            else None
        ),
        pipeline_cycle_code=pipeline_detail.cycle_code if pipeline_detail is not None else None,
        pipeline_cycle_code_source=(
            _resolved_mode_detail_field_source(
                pipeline_detail,
                source_field_name="cycle_code_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if pipeline_detail is not None
            else None
        ),
        nomination_reference=pipeline_detail.nomination_reference if pipeline_detail is not None else None,
        nomination_reference_source=(
            _resolved_mode_detail_field_source(
                pipeline_detail,
                source_field_name="nomination_reference_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if pipeline_detail is not None
            else None
        ),
        market_operator=power_detail.market_operator if power_detail is not None else None,
        market_operator_source=(
            _resolved_mode_detail_field_source(
                power_detail,
                source_field_name="market_operator_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if power_detail is not None
            else None
        ),
        pricing_node_code=power_detail.pricing_node_code if power_detail is not None else None,
        pricing_node_code_source=(
            _resolved_mode_detail_field_source(
                power_detail,
                source_field_name="pricing_node_code_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if power_detail is not None
            else None
        ),
        delivery_node_code=power_detail.delivery_node_code if power_detail is not None else None,
        delivery_node_code_source=(
            _resolved_mode_detail_field_source(
                power_detail,
                source_field_name="delivery_node_code_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if power_detail is not None
            else None
        ),
        profile_code=power_detail.profile_code if power_detail is not None else None,
        profile_code_source=(
            _resolved_mode_detail_field_source(
                power_detail,
                source_field_name="profile_code_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if power_detail is not None
            else None
        ),
        schedule_reference=power_detail.schedule_reference if power_detail is not None else None,
        schedule_reference_source=(
            _resolved_mode_detail_field_source(
                power_detail,
                source_field_name="schedule_reference_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if power_detail is not None
            else None
        ),
        interval_minutes=power_detail.interval_minutes if power_detail is not None else None,
        interval_minutes_source=(
            _resolved_mode_detail_field_source(
                power_detail,
                source_field_name="interval_minutes_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if power_detail is not None
            else None
        ),
        timezone_name=power_detail.timezone_name if power_detail is not None else None,
        timezone_name_source=(
            _resolved_mode_detail_field_source(
                power_detail,
                source_field_name="timezone_name_source",
                fallback=DeliveryFieldSource.SYSTEM_GENERATED,
            ).value
            if power_detail is not None
            else None
        ),
        execution_status=execution_status,
        execution_status_source=execution_status_source,
        event_count=len(delivery_events or []),
        latest_event_type=event_projection.latest_event_type,
        latest_event_at=event_projection.latest_event_at,
        operations_owner=operations_owner,
        operations_owner_source=operations_owner_source,
        external_reference=external_reference,
        external_reference_source=external_reference_source,
        ops_notes=ops_notes,
        ops_notes_source=ops_notes_source,
        delivery_record_updated_at=persisted_updated_at,
        booked_at=booked_at,
        last_updated_at=last_updated_at,
        age_days=max(0, int((reference_time - booked_at).total_seconds() // 86400)),
        pricing_status=trade.pricing_status,
        confirmation_status=trade.confirmation_status,
        nomination_status=trade.nomination_status,
        allocation_status=trade.allocation_status,
        actualization_status=actualization_projection.status,
        actualized_quantity=actualization_projection.actual_quantity,
        actualized_at=actualization_projection.actualized_at,
        actualization_source=actualization_projection.source,
        actualization_notes=actualization_projection.notes,
        actualization_updated_at=actualization_projection.updated_at,
        actualization_variance_quantity=actualization_projection.quantity_variance,
        invoice_status=trade.invoice_status,
        payment_status=trade.payment_status,
        settlement_status=trade.settlement_status,
        blocker_count=len(blockers),
        blockers=blockers,
        scheduling_stage=scheduling_projection.stage,
        scheduling_owner=scheduling_projection.owner,
        scheduling_due_at=scheduling_projection.due_at,
        open_scheduling_work_item_count=scheduling_projection.open_work_item_count,
        next_scheduling_workflow_type=scheduling_projection.next_workflow_type,
        next_scheduling_workflow_status=scheduling_projection.next_workflow_status,
        scheduling_work_items=scheduling_projection.work_items,
        delivery_events=[_delivery_event_to_out(event) for event in delivery_events or []],
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


def _synchronize_delivery_resource(
    db: Session,
    request: OperationalResourceListRequest,
) -> None:
    synchronize_active_trade_workflow_items(db, now=request.reference_time)
    db.flush()


def _load_delivery_rows(
    db: Session,
    _request: OperationalResourceListRequest,
) -> list[DeliveryListRow]:
    trades = db.execute(
        select(Trade)
        .where(
            Trade.trade_nature == "PHYSICAL",
            Trade.status == "ACTIVE",
        )
        .order_by(Trade.updated_at.desc(), Trade.trade_id.desc())
    ).scalars().all()

    trade_ids = [trade.trade_id for trade in trades]
    legs_by_trade_id: dict[str, list[TradeLeg]] = {}
    if trade_ids:
        trade_legs = db.execute(
            select(TradeLeg)
            .where(TradeLeg.trade_id.in_(trade_ids))
            .order_by(TradeLeg.trade_id.asc(), TradeLeg.leg_no.asc())
        ).scalars().all()
        for leg in trade_legs:
            legs_by_trade_id.setdefault(leg.trade_id, []).append(leg)

    rows: list[DeliveryListRow] = []
    for trade in trades:
        trade_legs = legs_by_trade_id.get(trade.trade_id, [])
        if trade_legs:
            for leg in trade_legs:
                rows.append(
                    DeliveryListRow(
                        trade=trade,
                        leg=leg,
                        delivery_id=build_delivery_obligation_id(trade.trade_id, leg.leg_no),
                    )
                )
            continue
        rows.append(
            DeliveryListRow(
                trade=trade,
                leg=None,
                delivery_id=build_delivery_obligation_id(trade.trade_id),
            )
        )
    return rows


def _load_delivery_context(
    db: Session,
    rows: list[DeliveryListRow],
    request: OperationalResourceListRequest,
) -> DeliveryListContext:
    trade_ids = [row.trade.trade_id for row in rows]
    delivery_ids = [row.delivery_id for row in rows]
    (
        persisted_deliveries_by_id,
        logistics_details_by_id,
        truck_details_by_id,
        truck_movement_count_by_delivery_id,
        active_truck_movement_count_by_delivery_id,
        pipeline_details_by_id,
        rail_details_by_id,
        power_details_by_id,
    ) = _persisted_delivery_context_by_id(db, trade_ids=trade_ids)
    rail_routes_by_code, rail_lines_by_code = _rail_reference_context_by_code(
        db,
        rail_details_by_id=rail_details_by_id,
    )
    return DeliveryListContext(
        persisted_deliveries_by_id=persisted_deliveries_by_id,
        logistics_details_by_id=logistics_details_by_id,
        truck_details_by_id=truck_details_by_id,
        truck_movement_count_by_delivery_id=truck_movement_count_by_delivery_id,
        active_truck_movement_count_by_delivery_id=active_truck_movement_count_by_delivery_id,
        pipeline_details_by_id=pipeline_details_by_id,
        rail_details_by_id=rail_details_by_id,
        rail_routes_by_code=rail_routes_by_code,
        rail_lines_by_code=rail_lines_by_code,
        power_details_by_id=power_details_by_id,
        delivery_events_by_id=_delivery_events_by_delivery_id(db, delivery_ids=delivery_ids),
        credit_hold_states=build_trade_credit_hold_lookup(db, trade_ids=trade_ids),
        actualizations_by_delivery_id=list_trade_actualizations_by_delivery_id(db, trade_ids=trade_ids),
        scheduling_work_items_by_trade_id=_scheduling_workflow_items_by_trade_id(
            db,
            trade_ids=trade_ids,
            reference_time=request.reference_time,
        ),
    )


def _build_delivery_list_item(
    row: DeliveryListRow,
    context: DeliveryListContext,
    request: OperationalResourceListRequest,
) -> DeliveryObligationOut:
    credit_hold_state = context.credit_hold_states.get(row.trade.trade_id)
    credit_hold_reason = (
        credit_hold_state.hold_reason
        if credit_hold_state is not None and credit_hold_state.hold_active
        else None
    )
    rail_detail = context.rail_details_by_id.get(row.delivery_id)
    rail_route_code = (
        normalize_code(rail_detail.rail_route_code)
        if rail_detail is not None and (rail_detail.rail_route_code or "").strip()
        else None
    )
    rail_route = context.rail_routes_by_code.get(rail_route_code) if rail_route_code is not None else None
    rail_line = (
        context.rail_lines_by_code.get(rail_route.rail_line_code)
        if rail_route is not None
        else None
    )
    return _build_delivery_obligation(
        trade=row.trade,
        leg=row.leg,
        actualization=context.actualizations_by_delivery_id.get(row.delivery_id),
        credit_hold_reason=credit_hold_reason,
        reference_time=request.reference_time,
        scheduling_work_items=context.scheduling_work_items_by_trade_id.get(row.trade.trade_id, []),
        persisted_delivery=context.persisted_deliveries_by_id.get(row.delivery_id),
        logistics_detail=context.logistics_details_by_id.get(row.delivery_id),
        truck_detail=context.truck_details_by_id.get(row.delivery_id),
        truck_movement_count=context.truck_movement_count_by_delivery_id.get(row.delivery_id, 0),
        active_truck_movement_count=context.active_truck_movement_count_by_delivery_id.get(row.delivery_id, 0),
        pipeline_detail=context.pipeline_details_by_id.get(row.delivery_id),
        rail_detail=rail_detail,
        rail_route=rail_route,
        rail_line=rail_line,
        power_detail=context.power_details_by_id.get(row.delivery_id),
        delivery_events=context.delivery_events_by_id.get(row.delivery_id, []),
    )


def _finalize_delivery_list(
    items: list[DeliveryObligationOut],
    request: OperationalResourceListRequest,
) -> list[DeliveryObligationOut]:
    return paginate_operational_items(sorted(items, key=_delivery_sort_key), request)


DELIVERY_RESOURCE_DESCRIPTOR = OperationalResourceDescriptor[
    OperationalResourceListRequest,
    DeliveryListRow,
    DeliveryListContext,
    DeliveryObligationOut,
](
    resource_key="deliveries",
    filters=(),
    sort_fields=("delivery_status_rank", "delivery_start", "trade_id", "leg_no"),
    actions=(
        "sync_from_trades",
        "update",
        "update_logistics_detail",
        "update_pipeline_detail",
        "update_rail_detail",
        "update_power_detail",
        "append_event",
    ),
    surface=OperationalResourceSurface(
        title="Delivery Board",
        description=(
            "One cross-mode board spans delivery obligations, shipment detail, event history, and "
            "trade-derived resync behavior."
        ),
        board_section="Logistics",
        actions=(
            OperationalResourceSurfaceAction(
                key="sync_from_trades",
                label="Sync Trade Obligations",
                detail="Refresh the delivery projection from the booked trade set before editing downstream detail.",
                permission_message="Sign in to sync delivery projections and edit execution detail.",
            ),
            OperationalResourceSurfaceAction(
                key="update",
                label="Update Delivery Controls",
                detail="Update shared delivery controls for the selected obligation.",
                permission_message="Sign in to sync delivery projections and edit execution detail.",
            ),
            OperationalResourceSurfaceAction(
                key="update_logistics_detail",
                label="Update Logistics Detail",
                detail="Persist shared truck, vessel, barge, storage, or rail execution detail for the selected obligation.",
                permission_message="Sign in to sync delivery projections and edit execution detail.",
            ),
            OperationalResourceSurfaceAction(
                key="update_pipeline_detail",
                label="Update Pipeline Detail",
                detail="Persist pipeline scheduling and balancing detail for the selected obligation.",
                permission_message="Sign in to sync delivery projections and edit execution detail.",
            ),
            OperationalResourceSurfaceAction(
                key="update_rail_detail",
                label="Update Rail Detail",
                detail="Persist waybill, station, unit-train, and railcar summary detail for rail obligations.",
                permission_message="Sign in to sync delivery projections and edit execution detail.",
            ),
            OperationalResourceSurfaceAction(
                key="update_power_detail",
                label="Update Power Detail",
                detail="Persist power scheduling detail for the selected delivery obligation.",
                permission_message="Sign in to sync delivery projections and edit execution detail.",
            ),
            OperationalResourceSurfaceAction(
                key="append_event",
                label="Append Delivery Event",
                detail="Add an execution event to the delivery history timeline.",
                permission_message="Sign in to sync delivery projections and edit execution detail.",
            ),
        ),
        primary_action=OperationalResourcePrimaryAction(
            key="sync_trade_obligations",
            label="Sync trade obligations",
            detail="Refresh the delivery projection from the active trade book before operators edit mode-specific detail.",
        ),
        empty_state=OperationalResourceEmptyState(
            title="No delivery board",
            detail="Create active physical trades to start populating the delivery board.",
        ),
        summary_stats=(
            OperationalResourceSummaryStat(
                key="hot_windows",
                label="Hot windows",
                detail="Keep the next live and near-term delivery windows visible across every operating mode.",
            ),
            OperationalResourceSummaryStat(
                key="blocked_obligations",
                label="Blocked obligations",
                detail="Surface blockers, missing master data, and stale logistics detail before execution slips.",
            ),
            OperationalResourceSummaryStat(
                key="mode_specific_detail",
                label="Mode-specific detail",
                detail="Preserve distinct logistics, pipeline, and power scheduling controls on one shared board.",
            ),
        ),
    ),
    load_rows=_load_delivery_rows,
    load_context=_load_delivery_context,
    build_item=_build_delivery_list_item,
    synchronize=_synchronize_delivery_resource,
    finalize_items=_finalize_delivery_list,
)

SHIPMENT_RESOURCE_DESCRIPTOR = replace(
    DELIVERY_RESOURCE_DESCRIPTOR,
    resource_key="shipments",
    actions=("upsert_actualization",),
    surface=OperationalResourceSurface(
        title="Execution Actualization",
        description=(
            "Execution actualization is treated as a first-class operational resource with quantity, "
            "timing, and variance updates on the same contract as the delivery board."
        ),
        board_section="Execution",
        actions=(
            OperationalResourceSurfaceAction(
                key="upsert_actualization",
                label="Record Actualization",
                detail="Capture actualized quantity, execution timestamp, and variance notes for the selected obligation.",
                permission_message="Sign in to record and revise execution actualization.",
            ),
        ),
        primary_action=OperationalResourcePrimaryAction(
            key="record_actualization",
            label="Record actualization",
            detail="Capture executed quantity and timestamp once the physical movement is complete.",
        ),
        empty_state=OperationalResourceEmptyState(
            title="No execution actuals",
            detail="Completed and in-flight delivery obligations will expose actualization controls here.",
        ),
        summary_stats=(
            OperationalResourceSummaryStat(
                key="pending_actualization",
                label="Pending actualization",
                detail="Highlight obligations still missing executed quantity or final delivery timing.",
            ),
            OperationalResourceSummaryStat(
                key="execution_variance",
                label="Execution variance",
                detail="Call out quantity or timing variance between planned delivery and executed movement.",
            ),
            OperationalResourceSummaryStat(
                key="final_capture",
                label="Final capture",
                detail="Finish the downstream settlement chain with operator-owned actuals instead of inferred status alone.",
            ),
        ),
    ),
)


def list_delivery_obligations_for_operations(
    db: Session,
    *,
    limit: int | None = None,
    offset: int = 0,
    now: Optional[datetime] = None,
) -> list[DeliveryObligationOut]:
    return load_operational_resource_items(
        DELIVERY_RESOURCE_DESCRIPTOR,
        db,
        OperationalResourceListRequest(
            reference_time=_coerce_utc(now) or datetime.now(timezone.utc),
            limit=limit,
            offset=offset,
        ),
    )


def get_delivery_obligation_for_operations(
    db: Session,
    *,
    delivery_id: str,
    now: Optional[datetime] = None,
) -> DeliveryObligationOut:
    deliveries = list_delivery_obligations_for_operations(db, now=now)
    for delivery in deliveries:
        if delivery.delivery_id == delivery_id:
            return delivery
    raise LookupError(f"Delivery '{delivery_id}' was not found.")


def update_delivery_obligation(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> DeliveryObligationOut:
    requested_changes = dict(changes)
    raw_changes = dict(changes)
    reset_fields = _normalize_reset_fields(raw_changes.pop("reset_fields", None))
    if not raw_changes and not reset_fields:
        raise ValueError("At least one delivery field must be provided.")

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, trade, trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    derived_commodity_class = trade_leg.commodity_class if trade_leg is not None else trade.commodity_class
    derived_unit_of_measure = trade_leg.quantity_unit_code if trade_leg is not None else trade.unit_of_measure
    derived_location_code = trade_leg.location_code if trade_leg is not None else trade.location_code
    derived_delivery_start = trade_leg.delivery_start if trade_leg is not None else trade.delivery_start
    derived_delivery_end = trade_leg.delivery_end if trade_leg is not None else trade.delivery_end
    derived_classification = _classify_delivery(derived_commodity_class, derived_unit_of_measure)
    delivery_events = _delivery_events_by_delivery_id(db, delivery_ids=[delivery_id]).get(delivery_id, [])
    derived_execution_status = _delivery_event_projection(
        delivery_events=delivery_events,
        fallback_status=_default_execution_status_for_trade(trade),
    ).execution_status
    changed = False

    if "transport_mode" in reset_fields and _apply_model_changes(
        delivery,
        {
            "transport_mode": derived_classification.transport_mode.value,
            "transport_mode_source": derived_classification.transport_mode_source.value,
            "mode_family": derived_classification.mode_family.value,
            "delivery_profile": derived_classification.delivery_profile.value,
        },
    ):
        changed = True

    if "book" in reset_fields and _apply_model_changes(
        delivery,
        {
            "book": trade.book,
            "book_source": DeliveryFieldSource.TRADE_DERIVED.value,
        },
    ):
        changed = True

    if "portfolio" in reset_fields and _apply_model_changes(
        delivery,
        {
            "portfolio": trade.portfolio,
            "portfolio_source": DeliveryFieldSource.TRADE_DERIVED.value,
        },
    ):
        changed = True

    if "counterparty" in reset_fields and _apply_model_changes(
        delivery,
        {
            "counterparty": trade.counterparty,
            "counterparty_source": DeliveryFieldSource.TRADE_DERIVED.value,
        },
    ):
        changed = True

    if "location_code" in reset_fields and _apply_model_changes(
        delivery,
        {
            "location_code": derived_location_code,
            "location_source": DeliveryFieldSource.TRADE_DERIVED.value,
        },
    ):
        changed = True

    if "delivery_window" in reset_fields:
        _validate_delivery_window(
            delivery_start=derived_delivery_start,
            delivery_end=derived_delivery_end,
        )
        if _apply_model_changes(
            delivery,
            {
                "delivery_start": derived_delivery_start,
                "delivery_end": derived_delivery_end,
                "delivery_window_source": DeliveryFieldSource.TRADE_DERIVED.value,
            },
        ):
            changed = True

    if "execution_status" in reset_fields and _apply_model_changes(
        delivery,
        {
            "execution_status": derived_execution_status.value,
            "execution_status_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        },
    ):
        changed = True

    if "operations_owner" in reset_fields and _apply_model_changes(
        delivery,
        {
            "operations_owner": None,
            "operations_owner_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        },
    ):
        changed = True

    if "external_reference" in reset_fields and _apply_model_changes(
        delivery,
        {
            "external_reference": None,
            "external_reference_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        },
    ):
        changed = True

    if "ops_notes" in reset_fields and _apply_model_changes(
        delivery,
        {
            "ops_notes": None,
            "ops_notes_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        },
    ):
        changed = True

    if "transport_mode" in raw_changes:
        transport_mode = _validate_transport_mode(raw_changes.get("transport_mode"))
        _require_allowed_transport_mode(
            db,
            commodity=delivery.commodity,
            commodity_class=delivery.commodity_class,
            transport_mode=transport_mode,
        )
        next_mode_family = _mode_family_for_transport_mode(transport_mode)
        next_transport_mode_source = (
            TransportModeSource.UNSPECIFIED
            if transport_mode == TransportMode.UNSPECIFIED
            else TransportModeSource.EXPLICIT
        )
        next_delivery_profile = _default_profile_for_mode_family(next_mode_family)

        if delivery.transport_mode != transport_mode.value:
            delivery.transport_mode = transport_mode.value
            changed = True
        if delivery.transport_mode_source != next_transport_mode_source.value:
            delivery.transport_mode_source = next_transport_mode_source.value
            changed = True
        if delivery.mode_family != next_mode_family.value:
            delivery.mode_family = next_mode_family.value
            changed = True
        if delivery.delivery_profile != next_delivery_profile.value:
            delivery.delivery_profile = next_delivery_profile.value
            changed = True

    if "book" in raw_changes and _apply_model_changes(
        delivery,
        {
            "book": _normalize_required_text(raw_changes.get("book"), label="Book"),
            "book_source": DeliveryFieldSource.MANUAL.value,
        },
    ):
        changed = True

    if "portfolio" in raw_changes and _apply_model_changes(
        delivery,
        {
            "portfolio": _normalize_optional_text(raw_changes.get("portfolio")),
            "portfolio_source": DeliveryFieldSource.MANUAL.value,
        },
    ):
        changed = True

    if "counterparty" in raw_changes and _apply_model_changes(
        delivery,
        {
            "counterparty": _normalize_optional_text(raw_changes.get("counterparty")),
            "counterparty_source": DeliveryFieldSource.MANUAL.value,
        },
    ):
        changed = True

    if "location_code" in raw_changes and _apply_model_changes(
        delivery,
        {
            "location_code": _normalize_optional_text(raw_changes.get("location_code")),
            "location_source": DeliveryFieldSource.MANUAL.value,
        },
    ):
        changed = True

    if "delivery_start" in raw_changes or "delivery_end" in raw_changes:
        next_delivery_start = (
            raw_changes.get("delivery_start")
            if "delivery_start" in raw_changes
            else delivery.delivery_start
        )
        next_delivery_end = (
            raw_changes.get("delivery_end")
            if "delivery_end" in raw_changes
            else delivery.delivery_end
        )
        _validate_delivery_window(
            delivery_start=next_delivery_start,
            delivery_end=next_delivery_end,
        )
        if _apply_model_changes(
            delivery,
            {
                "delivery_start": next_delivery_start,
                "delivery_end": next_delivery_end,
                "delivery_window_source": DeliveryFieldSource.MANUAL.value,
            },
        ):
            changed = True

    if "execution_status" in raw_changes and _apply_model_changes(
        delivery,
        {
            "execution_status": _validate_delivery_execution_status(raw_changes.get("execution_status")).value,
            "execution_status_source": DeliveryFieldSource.MANUAL.value,
        },
    ):
        changed = True

    if "operations_owner" in raw_changes and _apply_model_changes(
        delivery,
        {
            "operations_owner": _normalize_optional_text(raw_changes.get("operations_owner")),
            "operations_owner_source": DeliveryFieldSource.MANUAL.value,
        },
    ):
        changed = True

    if "external_reference" in raw_changes and _apply_model_changes(
        delivery,
        {
            "external_reference": _normalize_optional_text(raw_changes.get("external_reference")),
            "external_reference_source": DeliveryFieldSource.MANUAL.value,
        },
    ):
        changed = True

    if "ops_notes" in raw_changes and _apply_model_changes(
        delivery,
        {
            "ops_notes": _normalize_optional_text(raw_changes.get("ops_notes")),
            "ops_notes_source": DeliveryFieldSource.MANUAL.value,
        },
    ):
        changed = True

    if changed:
        _touch_audited_record(delivery, actor_id=actor_id, reference_time=reference_time)

    _ensure_delivery_mode_detail_shape(
        db,
        delivery=delivery,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    db.flush()
    delivery_out = get_delivery_obligation_for_operations(db, delivery_id=delivery_id, now=reference_time)
    _append_delivery_trade_audit(
        db,
        delivery=delivery_out,
        actor_id=actor_id,
        event_type="TradeDeliveryUpdated",
        causation_id=f"delivery:{delivery_out.delivery_id}",
        requested_changes=requested_changes,
    )
    return delivery_out


def update_delivery_logistics_detail(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> DeliveryObligationOut:
    requested_changes = dict(changes)
    raw_changes = dict(changes)
    reset_fields = _normalize_named_reset_fields(
        raw_changes.pop("reset_fields", None),
        allowed_fields=RESETTABLE_LOGISTICS_DETAIL_FIELDS,
        label="logistics details",
    )
    if not raw_changes and not reset_fields:
        raise ValueError("At least one logistics detail field must be provided.")

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, _trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    _require_delivery_mode_family(
        delivery,
        expected=DeliveryModeFamily.LOGISTICS,
        detail_label="logistics",
    )
    logistics_detail, _pipeline_detail, _rail_detail, _power_detail = _ensure_delivery_mode_detail_shape(
        db,
        delivery=delivery,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    if logistics_detail is None:
        raise LookupError(f"Logistics details for delivery '{delivery_id}' could not be prepared.")

    detail_changes: dict[str, object | None] = {}
    defaults = _logistics_detail_defaults(delivery)
    for request_field_name in reset_fields:
        model_field_name = LOGISTICS_DETAIL_FIELD_MAP[request_field_name]
        default_value, default_source = defaults[model_field_name]
        detail_changes[model_field_name] = default_value
        detail_changes[f"{model_field_name}_source"] = default_source.value

    for request_field_name, raw_value in raw_changes.items():
        model_field_name = LOGISTICS_DETAIL_FIELD_MAP[request_field_name]
        detail_changes[model_field_name] = _normalize_optional_text(raw_value)
        detail_changes[f"{model_field_name}_source"] = DeliveryFieldSource.MANUAL.value

    if _apply_model_changes(logistics_detail, detail_changes):
        _touch_audited_record(logistics_detail, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    delivery_out = get_delivery_obligation_for_operations(db, delivery_id=delivery_id, now=reference_time)
    _append_delivery_trade_audit(
        db,
        delivery=delivery_out,
        actor_id=actor_id,
        event_type="TradeDeliveryLogisticsUpdated",
        causation_id=f"delivery:{delivery_out.delivery_id}",
        requested_changes=requested_changes,
    )
    return delivery_out


def update_delivery_truck_detail(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> DeliveryObligationOut:
    requested_changes = dict(changes)
    raw_changes = dict(changes)
    if not raw_changes:
        raise ValueError("At least one truck detail field must be provided.")

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, _trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    _require_delivery_mode_family(
        delivery,
        expected=DeliveryModeFamily.LOGISTICS,
        detail_label="truck",
    )
    _require_transport_mode(
        delivery,
        expected=TransportMode.TRUCK,
        detail_label="truck",
    )
    logistics_detail, _pipeline_detail, _rail_detail, _power_detail = _ensure_delivery_mode_detail_shape(
        db,
        delivery=delivery,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    truck_detail = _ensure_delivery_truck_detail(
        db,
        delivery=delivery,
        logistics_detail=logistics_detail,
        actor_id=actor_id,
        reference_time=reference_time,
    )

    detail_changes: dict[str, object | None] = {}
    if "target_run_count" in raw_changes:
        detail_changes["target_run_count"] = _normalize_optional_positive_int(
            raw_changes.get("target_run_count"),
            label="Target run count",
        )
    if "dispatcher_owner" in raw_changes:
        detail_changes["dispatcher_owner"] = _normalize_optional_text(raw_changes.get("dispatcher_owner"))
    if "tracking_provider" in raw_changes:
        detail_changes["tracking_provider"] = _normalize_optional_text(raw_changes.get("tracking_provider"))
    if "tracking_policy" in raw_changes:
        detail_changes["tracking_policy"] = _normalize_optional_text(raw_changes.get("tracking_policy"))
    if "default_carrier_name" in raw_changes:
        detail_changes["default_carrier_name"] = _normalize_optional_text(raw_changes.get("default_carrier_name"))
        detail_changes["default_carrier_name_source"] = DeliveryFieldSource.MANUAL.value
    if "default_external_carrier_reference" in raw_changes:
        detail_changes["default_external_carrier_reference"] = _normalize_optional_text(
            raw_changes.get("default_external_carrier_reference")
        )
        detail_changes["default_external_carrier_reference_source"] = DeliveryFieldSource.MANUAL.value
    if "equipment_type" in raw_changes:
        detail_changes["equipment_type"] = _normalize_optional_text(raw_changes.get("equipment_type"))
        detail_changes["equipment_type_source"] = DeliveryFieldSource.MANUAL.value
    if "origin_geofence_code" in raw_changes:
        detail_changes["origin_geofence_code"] = _normalize_optional_text(raw_changes.get("origin_geofence_code"))
        detail_changes["origin_geofence_code_source"] = DeliveryFieldSource.MANUAL.value
    if "destination_geofence_code" in raw_changes:
        detail_changes["destination_geofence_code"] = _normalize_optional_text(
            raw_changes.get("destination_geofence_code")
        )
        detail_changes["destination_geofence_code_source"] = DeliveryFieldSource.MANUAL.value

    if _apply_model_changes(truck_detail, detail_changes):
        _touch_audited_record(truck_detail, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    delivery_out = get_delivery_obligation_for_operations(db, delivery_id=delivery_id, now=reference_time)
    _append_delivery_trade_audit(
        db,
        delivery=delivery_out,
        actor_id=actor_id,
        event_type="TradeDeliveryTruckDetailUpdated",
        causation_id=f"delivery:{delivery_out.delivery_id}",
        requested_changes=requested_changes,
    )
    return delivery_out


def update_delivery_pipeline_detail(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> DeliveryObligationOut:
    requested_changes = dict(changes)
    raw_changes = dict(changes)
    reset_fields = _normalize_named_reset_fields(
        raw_changes.pop("reset_fields", None),
        allowed_fields=RESETTABLE_PIPELINE_DETAIL_FIELDS,
        label="pipeline details",
    )
    if not raw_changes and not reset_fields:
        raise ValueError("At least one pipeline detail field must be provided.")

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, _trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    _require_delivery_mode_family(
        delivery,
        expected=DeliveryModeFamily.NETWORK_FLOW,
        detail_label="pipeline",
    )
    _logistics_detail, pipeline_detail, _rail_detail, _power_detail = _ensure_delivery_mode_detail_shape(
        db,
        delivery=delivery,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    if pipeline_detail is None:
        raise LookupError(f"Pipeline details for delivery '{delivery_id}' could not be prepared.")

    detail_changes: dict[str, object | None] = {}
    defaults = _pipeline_detail_defaults(delivery)
    for request_field_name in reset_fields:
        model_field_name = PIPELINE_DETAIL_FIELD_MAP[request_field_name]
        default_value, default_source = defaults[model_field_name]
        detail_changes[model_field_name] = default_value
        detail_changes[f"{model_field_name}_source"] = default_source.value

    for request_field_name, raw_value in raw_changes.items():
        model_field_name = PIPELINE_DETAIL_FIELD_MAP[request_field_name]
        detail_changes[model_field_name] = _normalize_optional_text(raw_value)
        detail_changes[f"{model_field_name}_source"] = DeliveryFieldSource.MANUAL.value

    if _apply_model_changes(pipeline_detail, detail_changes):
        _touch_audited_record(pipeline_detail, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    delivery_out = get_delivery_obligation_for_operations(db, delivery_id=delivery_id, now=reference_time)
    _append_delivery_trade_audit(
        db,
        delivery=delivery_out,
        actor_id=actor_id,
        event_type="TradeDeliveryPipelineUpdated",
        causation_id=f"delivery:{delivery_out.delivery_id}",
        requested_changes=requested_changes,
    )
    return delivery_out


def update_delivery_rail_detail(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> DeliveryObligationOut:
    requested_changes = dict(changes)
    raw_changes = dict(changes)
    reset_fields = _normalize_named_reset_fields(
        raw_changes.pop("reset_fields", None),
        allowed_fields=RESETTABLE_RAIL_DETAIL_FIELDS,
        label="rail details",
    )
    if not raw_changes and not reset_fields:
        raise ValueError("At least one rail detail field must be provided.")

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, _trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    _require_delivery_mode_family(
        delivery,
        expected=DeliveryModeFamily.LOGISTICS,
        detail_label="rail",
    )
    _require_transport_mode(
        delivery,
        expected=TransportMode.RAIL,
        detail_label="rail",
    )
    _logistics_detail, _pipeline_detail, rail_detail, _power_detail = _ensure_delivery_mode_detail_shape(
        db,
        delivery=delivery,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    if rail_detail is None:
        raise LookupError(f"Rail details for delivery '{delivery_id}' could not be prepared.")

    detail_changes: dict[str, object | None] = {}
    defaults = _rail_detail_defaults()
    for request_field_name in reset_fields:
        model_field_name = RAIL_DETAIL_FIELD_MAP[request_field_name]
        default_value, default_source = defaults[model_field_name]
        detail_changes[model_field_name] = default_value
        detail_changes[f"{model_field_name}_source"] = default_source.value

    for request_field_name, raw_value in raw_changes.items():
        model_field_name = RAIL_DETAIL_FIELD_MAP[request_field_name]
        if request_field_name == "railcar_count":
            detail_changes[model_field_name] = _normalize_optional_positive_int(
                raw_value,
                label="Railcar count",
            )
        elif request_field_name == "rail_route_code":
            detail_changes[model_field_name] = _normalize_optional_active_rail_route_code(
                db,
                raw_value,
            )
        else:
            detail_changes[model_field_name] = _normalize_optional_text(raw_value)
        detail_changes[f"{model_field_name}_source"] = DeliveryFieldSource.MANUAL.value

    if _apply_model_changes(rail_detail, detail_changes):
        _touch_audited_record(rail_detail, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    delivery_out = get_delivery_obligation_for_operations(db, delivery_id=delivery_id, now=reference_time)
    _append_delivery_trade_audit(
        db,
        delivery=delivery_out,
        actor_id=actor_id,
        event_type="TradeDeliveryRailUpdated",
        causation_id=f"delivery:{delivery_out.delivery_id}",
        requested_changes=requested_changes,
    )
    return delivery_out


def update_delivery_power_detail(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    changes: dict[str, object | None],
    now: Optional[datetime] = None,
) -> DeliveryObligationOut:
    requested_changes = dict(changes)
    raw_changes = dict(changes)
    reset_fields = _normalize_named_reset_fields(
        raw_changes.pop("reset_fields", None),
        allowed_fields=RESETTABLE_POWER_DETAIL_FIELDS,
        label="power details",
    )
    if not raw_changes and not reset_fields:
        raise ValueError("At least one power detail field must be provided.")

    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, _trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    _require_delivery_mode_family(
        delivery,
        expected=DeliveryModeFamily.POWER_SCHEDULE,
        detail_label="power",
    )
    _logistics_detail, _pipeline_detail, _rail_detail, power_detail = _ensure_delivery_mode_detail_shape(
        db,
        delivery=delivery,
        actor_id=actor_id,
        reference_time=reference_time,
    )
    if power_detail is None:
        raise LookupError(f"Power details for delivery '{delivery_id}' could not be prepared.")

    detail_changes: dict[str, object | None] = {}
    defaults = _power_detail_defaults(delivery)
    for request_field_name in reset_fields:
        model_field_name = POWER_DETAIL_FIELD_MAP[request_field_name]
        default_value, default_source = defaults[model_field_name]
        detail_changes[model_field_name] = default_value
        detail_changes[f"{model_field_name}_source"] = default_source.value

    for request_field_name, raw_value in raw_changes.items():
        model_field_name = POWER_DETAIL_FIELD_MAP[request_field_name]
        if request_field_name == "interval_minutes":
            detail_changes[model_field_name] = _normalize_optional_positive_int(
                raw_value,
                label="Interval minutes",
            )
        else:
            detail_changes[model_field_name] = _normalize_optional_text(raw_value)
        detail_changes[f"{model_field_name}_source"] = DeliveryFieldSource.MANUAL.value

    if _apply_model_changes(power_detail, detail_changes):
        _touch_audited_record(power_detail, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    delivery_out = get_delivery_obligation_for_operations(db, delivery_id=delivery_id, now=reference_time)
    _append_delivery_trade_audit(
        db,
        delivery=delivery_out,
        actor_id=actor_id,
        event_type="TradeDeliveryPowerUpdated",
        causation_id=f"delivery:{delivery_out.delivery_id}",
        requested_changes=requested_changes,
    )
    return delivery_out


def append_delivery_event(
    db: Session,
    *,
    delivery_id: str,
    actor_id: str,
    event_type: object | None,
    occurred_at: object | None,
    location_code: object | None = None,
    reference_code: object | None = None,
    source: object | None = None,
    notes: object | None = None,
    now: Optional[datetime] = None,
) -> DeliveryObligationOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    existing_events = _delivery_events_by_delivery_id(db, delivery_ids=[delivery_id]).get(delivery_id, [])
    normalized_event_type = _validate_delivery_event_type(event_type)
    normalized_occurred_at = _validate_delivery_event_occurred_at(occurred_at)
    execution_status = _event_execution_status_for_type(
        event_type=normalized_event_type,
        occurred_at=normalized_occurred_at,
        existing_events=existing_events,
        fallback_status=_default_execution_status_for_trade(trade),
    )

    delivery_event = DeliveryEvent(
        delivery_id=delivery_id,
        trade_id=delivery.trade_id,
        leg_no=delivery.leg_no,
        event_type=normalized_event_type.value,
        execution_status=execution_status.value,
        occurred_at=normalized_occurred_at,
        location_code=_normalize_optional_text(location_code),
        reference_code=_normalize_optional_text(reference_code),
        source=_normalize_optional_text(source),
        notes=_normalize_optional_text(notes),
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    db.add(delivery_event)

    execution_status_source = _resolved_delivery_field_source(
        delivery,
        source_field_name="execution_status_source",
        fallback=DeliveryFieldSource.SYSTEM_GENERATED,
    )
    if execution_status_source != DeliveryFieldSource.MANUAL and _apply_model_changes(
        delivery,
        {
            "execution_status": execution_status.value,
            "execution_status_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        },
    ):
        _touch_audited_record(delivery, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    delivery_out = get_delivery_obligation_for_operations(db, delivery_id=delivery_id, now=reference_time)
    latest_event = delivery_out.delivery_events[0] if delivery_out.delivery_events else None
    _append_delivery_trade_audit(
        db,
        delivery=delivery_out,
        actor_id=actor_id,
        event_type="TradeDeliveryEventLogged",
        causation_id=f"delivery:{delivery_out.delivery_id}",
        request_payload={
            key: value
            for key, value in {
                "event_type": event_type,
                "occurred_at": occurred_at,
                "location_code": location_code,
                "reference_code": reference_code,
                "source": source,
                "notes": notes,
            }.items()
            if value is not None
        },
        latest_event=latest_event,
    )
    return delivery_out


def preview_delivery_event_reversal(
    db: Session,
    *,
    delivery_id: str,
    event_id: int,
    reversal_reason: object | None = None,
    reversed_at: datetime | None = None,
    now: Optional[datetime] = None,
) -> dict[str, object]:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    try:
        delivery, trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    except (LookupError, ValueError) as exc:
        return {
            "preview_type": "reverse_delivery_event",
            "status": "BLOCKED",
            "summary": f"Delivery-event reversal preview for {delivery_id} is blocked.",
            "affected_records": [],
            "field_changes": [],
            "expected_side_effects": [],
            "warnings": [],
            "blocking_reasons": [str(exc)],
            "assumptions": [],
        }

    existing_events = _delivery_events_by_delivery_id(db, delivery_ids=[delivery_id]).get(delivery_id, [])
    target_event = next((event for event in existing_events if event.id == event_id), None)
    if target_event is None:
        return {
            "preview_type": "reverse_delivery_event",
            "status": "BLOCKED",
            "summary": f"Delivery-event reversal preview for {delivery_id} is blocked.",
            "affected_records": [],
            "field_changes": [],
            "expected_side_effects": [],
            "warnings": [],
            "blocking_reasons": [f"Delivery event {event_id} was not found on delivery {delivery_id}."],
            "assumptions": [],
        }

    blocking_reasons: list[str] = []
    if target_event.reversal_of_event_id is not None or target_event.event_type == DeliveryEventType.EVENT_REVERSED.value:
        blocking_reasons.append(
            f"Delivery event {event_id} is already a reversal entry and cannot be reversed again."
        )
    if any(event.reversal_of_event_id == target_event.id for event in existing_events):
        blocking_reasons.append(
            f"Delivery event {event_id} has already been reversed through a later movement correction."
        )

    normalized_reversal_reason = _normalize_optional_text(reversal_reason)
    if normalized_reversal_reason is None:
        blocking_reasons.append("Reversal reason is required.")

    fallback_status = _default_execution_status_for_trade(trade)
    remaining_business_events = [
        event for event in _active_business_delivery_events(existing_events) if event.id != target_event.id
    ]
    projected_execution_status = _project_delivery_execution_status_from_events(
        delivery_events=remaining_business_events,
        fallback_status=fallback_status,
    )
    latest_event = max(existing_events, key=_delivery_event_sort_key) if existing_events else None
    current_active_latest_event = (
        max(_active_business_delivery_events(existing_events), key=_delivery_event_sort_key)
        if _active_business_delivery_events(existing_events)
        else None
    )
    active_latest_event = (
        max(remaining_business_events, key=_delivery_event_sort_key) if remaining_business_events else None
    )
    normalized_reversed_at = _coerce_utc(reversed_at) or reference_time

    return {
        "preview_type": "reverse_delivery_event",
        "status": "BLOCKED" if blocking_reasons else "READY",
        "summary": (
            f"Delivery event {event_id} on {delivery_id} will be reversed and movement status will be recomputed."
            if not blocking_reasons
            else f"Delivery-event reversal preview for {delivery_id} is blocked."
        ),
        "affected_records": [
            {
                "type": "delivery_event",
                "id": str(target_event.id),
                "label": f"Delivery event {target_event.id}",
                "summary": (
                    f"{target_event.event_type} recorded at "
                    f"{(_coerce_utc(target_event.occurred_at) or reference_time).isoformat()}."
                ),
            },
            {
                "type": "delivery_obligation",
                "id": delivery_id,
                "label": f"Delivery {delivery_id}",
                "summary": f"Current execution status is {delivery.execution_status}.",
            },
        ],
        "field_changes": [
            {
                "field": "execution_status",
                "current_value": delivery.execution_status,
                "proposed_value": projected_execution_status.value,
            },
            {
                "field": "latest_event_type",
                "current_value": latest_event.event_type if latest_event is not None else None,
                "proposed_value": DeliveryEventType.EVENT_REVERSED.value,
            },
            {
                "field": "reversed_at",
                "current_value": None,
                "proposed_value": normalized_reversed_at.isoformat(),
            },
            {
                "field": "reversal_reason",
                "current_value": None,
                "proposed_value": normalized_reversal_reason,
            },
            {
                "field": "active_latest_event_type",
                "current_value": (
                    max(_active_business_delivery_events(existing_events), key=_delivery_event_sort_key).event_type
                    if _active_business_delivery_events(existing_events)
                    else None
                ),
                "proposed_value": active_latest_event.event_type if active_latest_event is not None else None,
            },
        ],
        "expected_side_effects": [
            "Append a delivery-event reversal record instead of deleting history.",
            "Recompute live delivery execution status from the remaining active event history.",
            "Expose the corrected movement state in deliveries and shipments views.",
            "Append a TradeDeliveryEventReversed audit event after execution.",
        ],
        "warnings": [
            *(
                ["Reversing a non-latest movement event will recompute live execution status from earlier remaining history."]
                if current_active_latest_event is not None and current_active_latest_event.id != target_event.id
                else []
            ),
        ],
        "blocking_reasons": blocking_reasons,
        "assumptions": [],
    }


def reverse_delivery_event(
    db: Session,
    *,
    delivery_id: str,
    event_id: int,
    actor_id: str,
    reversal_reason: object | None,
    reversed_at: datetime | None = None,
    source: object | None = None,
    notes: object | None = None,
    now: Optional[datetime] = None,
) -> DeliveryObligationOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    delivery, trade, _trade_leg = _load_active_delivery_record(db, delivery_id=delivery_id)
    existing_events = _delivery_events_by_delivery_id(db, delivery_ids=[delivery_id]).get(delivery_id, [])
    target_event = next((event for event in existing_events if event.id == event_id), None)
    if target_event is None:
        raise LookupError(f"Delivery event {event_id} was not found on delivery {delivery_id}.")
    if target_event.reversal_of_event_id is not None or target_event.event_type == DeliveryEventType.EVENT_REVERSED.value:
        raise ValueError(f"Delivery event {event_id} is already a reversal entry and cannot be reversed.")
    if any(event.reversal_of_event_id == target_event.id for event in existing_events):
        raise ValueError(f"Delivery event {event_id} has already been reversed.")

    normalized_reversed_at = _coerce_utc(reversed_at) or reference_time
    normalized_reversal_reason = _normalize_required_text(reversal_reason, label="Reversal reason")
    remaining_business_events = [
        event for event in _active_business_delivery_events(existing_events) if event.id != target_event.id
    ]
    projected_execution_status = _project_delivery_execution_status_from_events(
        delivery_events=remaining_business_events,
        fallback_status=_default_execution_status_for_trade(trade),
    )

    reversal_event = DeliveryEvent(
        delivery_id=delivery_id,
        trade_id=delivery.trade_id,
        leg_no=delivery.leg_no,
        event_type=DeliveryEventType.EVENT_REVERSED.value,
        execution_status=projected_execution_status.value,
        occurred_at=normalized_reversed_at,
        reversal_of_event_id=target_event.id,
        reversal_reason=normalized_reversal_reason,
        location_code=None,
        reference_code=None,
        source=_normalize_optional_text(source),
        notes=_normalize_optional_text(notes),
        created_at=reference_time,
        created_by=actor_id,
        updated_at=reference_time,
        updated_by=actor_id,
        version=1,
    )
    db.add(reversal_event)

    execution_status_source = _resolved_delivery_field_source(
        delivery,
        source_field_name="execution_status_source",
        fallback=DeliveryFieldSource.SYSTEM_GENERATED,
    )
    if execution_status_source != DeliveryFieldSource.MANUAL and _apply_model_changes(
        delivery,
        {
            "execution_status": projected_execution_status.value,
            "execution_status_source": DeliveryFieldSource.SYSTEM_GENERATED.value,
        },
    ):
        _touch_audited_record(delivery, actor_id=actor_id, reference_time=reference_time)

    db.flush()
    delivery_out = get_delivery_obligation_for_operations(db, delivery_id=delivery_id, now=reference_time)
    latest_event = delivery_out.delivery_events[0] if delivery_out.delivery_events else None
    _append_delivery_trade_audit(
        db,
        delivery=delivery_out,
        actor_id=actor_id,
        event_type="TradeDeliveryEventReversed",
        causation_id=f"delivery:{delivery_out.delivery_id}:event-reversal",
        request_payload={
            key: value
            for key, value in {
                "event_id": event_id,
                "reversal_reason": reversal_reason,
                "reversed_at": reversed_at,
                "source": source,
                "notes": notes,
            }.items()
            if value is not None
        },
        latest_event=latest_event,
    )
    return delivery_out


def synchronize_delivery_obligations_from_trades(
    db: Session,
    *,
    actor_id: str,
    now: Optional[datetime] = None,
) -> DeliverySyncResultOut:
    reference_time = _coerce_utc(now) or datetime.now(timezone.utc)
    trades = db.execute(
        select(Trade)
        .where(
            Trade.trade_nature == "PHYSICAL",
            Trade.status == "ACTIVE",
        )
        .order_by(Trade.trade_id.asc())
    ).scalars().all()
    trade_ids = [trade.trade_id for trade in trades]

    legs_by_trade_id: dict[str, list[TradeLeg]] = {}
    if trade_ids:
        trade_legs = db.execute(
            select(TradeLeg)
            .where(TradeLeg.trade_id.in_(trade_ids))
            .order_by(TradeLeg.trade_id.asc(), TradeLeg.leg_no.asc())
        ).scalars().all()
        for leg in trade_legs:
            legs_by_trade_id.setdefault(leg.trade_id, []).append(leg)

    existing_deliveries = db.execute(select(DeliveryObligation)).scalars().all()
    existing_by_id = {delivery.delivery_id: delivery for delivery in existing_deliveries}
    preexisting_delivery_ids = set(existing_by_id)
    existing_logistics = {
        detail.delivery_id: detail
        for detail in db.execute(select(DeliveryLogisticsDetail)).scalars().all()
    }
    existing_pipeline = {
        detail.delivery_id: detail
        for detail in db.execute(select(DeliveryPipelineDetail)).scalars().all()
    }
    existing_rail = {
        detail.delivery_id: detail
        for detail in db.execute(select(DeliveryRailDetail)).scalars().all()
    }
    existing_power = {
        detail.delivery_id: detail
        for detail in db.execute(select(DeliveryPowerDetail)).scalars().all()
    }
    existing_truck_details = {
        detail.delivery_id: detail
        for detail in db.execute(select(DeliveryTruckDetail)).scalars().all()
    }
    existing_truck_movements_by_delivery_id: dict[str, list[DeliveryTruckMovement]] = {}
    for movement in db.execute(select(DeliveryTruckMovement)).scalars().all():
        existing_truck_movements_by_delivery_id.setdefault(movement.delivery_id, []).append(movement)
    existing_tracking_signals_by_delivery_id: dict[str, list[DeliveryTrackingSignal]] = {}
    for signal in db.execute(select(DeliveryTrackingSignal)).scalars().all():
        if signal.delivery_id is None:
            continue
        existing_tracking_signals_by_delivery_id.setdefault(signal.delivery_id, []).append(signal)
    existing_events = _delivery_events_by_delivery_id(
        db,
        delivery_ids=[delivery.delivery_id for delivery in existing_deliveries],
    )

    target_delivery_ids: set[str] = set()
    created_count = 0
    updated_count = 0
    mode_counter: Counter[str] = Counter()

    for trade in trades:
        trade_legs = legs_by_trade_id.get(trade.trade_id, [])
        targets = trade_legs if trade_legs else [None]
        for leg in targets:
            delivery_id = build_delivery_obligation_id(trade.trade_id, leg.leg_no if leg is not None else None)
            target_delivery_ids.add(delivery_id)

            commodity_class = leg.commodity_class if leg is not None else trade.commodity_class
            commodity = leg.commodity_code if leg is not None else trade.commodity
            volume = (
                float(leg.quantity)
                if leg is not None and leg.quantity is not None
                else float(trade.volume) if trade.volume is not None else None
            )
            unit_of_measure = leg.quantity_unit_code if leg is not None else trade.unit_of_measure
            location_code = leg.location_code if leg is not None else trade.location_code
            delivery_start = leg.delivery_start if leg is not None else trade.delivery_start
            delivery_end = leg.delivery_end if leg is not None else trade.delivery_end
            derived_classification = _classify_delivery(commodity_class, unit_of_measure)

            existing_delivery = existing_by_id.get(delivery_id)
            if (
                existing_delivery is not None
                and _normalize_token(existing_delivery.transport_mode_source) == TransportModeSource.EXPLICIT.value
            ):
                persisted_mode = _coerce_transport_mode(
                    existing_delivery.transport_mode,
                    derived_classification.transport_mode,
                )
                persisted_mode_family = _coerce_mode_family(
                    existing_delivery.mode_family,
                    _mode_family_for_transport_mode(persisted_mode),
                )
                effective_classification = DeliveryClassification(
                    mode_family=persisted_mode_family,
                    transport_mode=persisted_mode,
                    transport_mode_source=TransportModeSource.EXPLICIT,
                    delivery_profile=_coerce_delivery_profile(
                        existing_delivery.delivery_profile,
                        _default_profile_for_mode_family(persisted_mode_family),
                    ),
                )
            else:
                effective_classification = derived_classification

            mode_counter[effective_classification.mode_family.value] += 1
            book_value, book_source = _resolve_synced_delivery_value(
                existing_delivery,
                field_name="book",
                source_field_name="book_source",
                fallback_source=DeliveryFieldSource.TRADE_DERIVED,
                derived_value=trade.book,
            )
            portfolio_value, portfolio_source = _resolve_synced_delivery_value(
                existing_delivery,
                field_name="portfolio",
                source_field_name="portfolio_source",
                fallback_source=DeliveryFieldSource.TRADE_DERIVED,
                derived_value=trade.portfolio,
            )
            counterparty_value, counterparty_source = _resolve_synced_delivery_value(
                existing_delivery,
                field_name="counterparty",
                source_field_name="counterparty_source",
                fallback_source=DeliveryFieldSource.TRADE_DERIVED,
                derived_value=trade.counterparty,
            )
            location_value, location_source = _resolve_synced_delivery_value(
                existing_delivery,
                field_name="location_code",
                source_field_name="location_source",
                fallback_source=DeliveryFieldSource.TRADE_DERIVED,
                derived_value=location_code,
            )
            delivery_window_source = _resolved_delivery_field_source(
                existing_delivery,
                source_field_name="delivery_window_source",
                fallback=DeliveryFieldSource.TRADE_DERIVED,
            )
            if existing_delivery is not None and delivery_window_source == DeliveryFieldSource.MANUAL:
                delivery_start_value = existing_delivery.delivery_start
                delivery_end_value = existing_delivery.delivery_end
            else:
                delivery_start_value = delivery_start
                delivery_end_value = delivery_end
            execution_status_value, execution_status_source = _resolve_synced_delivery_value(
                existing_delivery,
                field_name="execution_status",
                source_field_name="execution_status_source",
                fallback_source=DeliveryFieldSource.SYSTEM_GENERATED,
                derived_value=_delivery_event_projection(
                    delivery_events=existing_events.get(delivery_id, []),
                    fallback_status=_default_execution_status_for_trade(trade),
                ).execution_status.value,
            )
            operations_owner_value, operations_owner_source = _resolve_synced_delivery_value(
                existing_delivery,
                field_name="operations_owner",
                source_field_name="operations_owner_source",
                fallback_source=DeliveryFieldSource.SYSTEM_GENERATED,
                derived_value=None,
            )
            external_reference_value, external_reference_source = _resolve_synced_delivery_value(
                existing_delivery,
                field_name="external_reference",
                source_field_name="external_reference_source",
                fallback_source=DeliveryFieldSource.SYSTEM_GENERATED,
                derived_value=None,
            )
            ops_notes_value, ops_notes_source = _resolve_synced_delivery_value(
                existing_delivery,
                field_name="ops_notes",
                source_field_name="ops_notes_source",
                fallback_source=DeliveryFieldSource.SYSTEM_GENERATED,
                derived_value=None,
            )

            snapshot_values: dict[str, object | None] = {
                "trade_id": trade.trade_id,
                "trade_leg_id": leg.trade_leg_id if leg is not None else None,
                "leg_no": leg.leg_no if leg is not None else None,
                "external_trade_id": trade.external_trade_id,
                "direction": _direction_for_side(leg.side if leg is not None else trade.trade_side),
                "mode_family": effective_classification.mode_family.value,
                "transport_mode": effective_classification.transport_mode.value,
                "transport_mode_source": effective_classification.transport_mode_source.value,
                "delivery_profile": effective_classification.delivery_profile.value,
                "book": book_value,
                "book_source": book_source.value,
                "portfolio": portfolio_value,
                "portfolio_source": portfolio_source.value,
                "counterparty": counterparty_value,
                "counterparty_source": counterparty_source.value,
                "commodity_class": commodity_class,
                "commodity": commodity,
                "volume": volume,
                "unit_of_measure": unit_of_measure,
                "trade_currency_code": trade.trade_currency_code,
                "price_unit_code": trade.price_unit_code,
                "location_code": location_value,
                "location_source": location_source.value,
                "delivery_start": delivery_start_value,
                "delivery_end": delivery_end_value,
                "delivery_window_source": delivery_window_source.value,
                "execution_status": execution_status_value,
                "execution_status_source": execution_status_source.value,
                "operations_owner": operations_owner_value,
                "operations_owner_source": operations_owner_source.value,
                "external_reference": external_reference_value,
                "external_reference_source": external_reference_source.value,
                "ops_notes": ops_notes_value,
                "ops_notes_source": ops_notes_source.value,
                "booked_at": _booked_at_for_trade(trade),
                "source_trade_updated_at": _coerce_utc(trade.updated_at) or reference_time,
            }

            row_changed = False
            if existing_delivery is None:
                existing_delivery = DeliveryObligation(
                    delivery_id=delivery_id,
                    created_at=reference_time,
                    created_by=actor_id,
                    updated_at=reference_time,
                    updated_by=actor_id,
                    version=1,
                    **snapshot_values,
                )
                db.add(existing_delivery)
                existing_by_id[delivery_id] = existing_delivery
                created_count += 1
                row_changed = True
            else:
                if _apply_model_changes(existing_delivery, snapshot_values):
                    _touch_audited_record(existing_delivery, actor_id=actor_id, reference_time=reference_time)
                    row_changed = True

            details_changed = False
            if effective_classification.mode_family != DeliveryModeFamily.LOGISTICS:
                stale_logistics = existing_logistics.pop(delivery_id, None)
                if stale_logistics is not None:
                    db.delete(stale_logistics)
                    details_changed = True
            if effective_classification.mode_family != DeliveryModeFamily.NETWORK_FLOW:
                stale_pipeline = existing_pipeline.pop(delivery_id, None)
                if stale_pipeline is not None:
                    db.delete(stale_pipeline)
                    details_changed = True
            if effective_classification.transport_mode != TransportMode.RAIL:
                stale_rail = existing_rail.pop(delivery_id, None)
                if stale_rail is not None:
                    db.delete(stale_rail)
                    details_changed = True
            if effective_classification.mode_family != DeliveryModeFamily.POWER_SCHEDULE:
                stale_power = existing_power.pop(delivery_id, None)
                if stale_power is not None:
                    db.delete(stale_power)
                    details_changed = True
            if effective_classification.transport_mode != TransportMode.TRUCK:
                stale_truck_detail = existing_truck_details.pop(delivery_id, None)
                if stale_truck_detail is not None:
                    db.delete(stale_truck_detail)
                    details_changed = True
                for movement in existing_truck_movements_by_delivery_id.pop(delivery_id, []):
                    db.delete(movement)
                    details_changed = True
                for signal in existing_tracking_signals_by_delivery_id.pop(delivery_id, []):
                    db.delete(signal)
                    details_changed = True

            if effective_classification.mode_family == DeliveryModeFamily.LOGISTICS:
                logistics_detail = existing_logistics.get(delivery_id)
                logistics_snapshot = _resolve_mode_detail_snapshot(
                    logistics_detail,
                    defaults=_logistics_detail_defaults(existing_delivery),
                )
                if logistics_detail is None:
                    logistics_detail = DeliveryLogisticsDetail(
                        delivery_id=delivery_id,
                        created_at=reference_time,
                        created_by=actor_id,
                        updated_at=reference_time,
                        updated_by=actor_id,
                        version=1,
                        **logistics_snapshot,
                    )
                    db.add(logistics_detail)
                    existing_logistics[delivery_id] = logistics_detail
                    details_changed = True
                elif _apply_model_changes(
                    logistics_detail,
                    logistics_snapshot,
                ):
                    _touch_audited_record(logistics_detail, actor_id=actor_id, reference_time=reference_time)
                    details_changed = True

                if effective_classification.transport_mode == TransportMode.RAIL:
                    rail_detail = existing_rail.get(delivery_id)
                    rail_snapshot = _resolve_mode_detail_snapshot(
                        rail_detail,
                        defaults=_rail_detail_defaults(),
                    )
                    if rail_detail is None:
                        rail_detail = DeliveryRailDetail(
                            delivery_id=delivery_id,
                            created_at=reference_time,
                            created_by=actor_id,
                            updated_at=reference_time,
                            updated_by=actor_id,
                            version=1,
                            **rail_snapshot,
                        )
                        db.add(rail_detail)
                        existing_rail[delivery_id] = rail_detail
                        details_changed = True
                    elif _apply_model_changes(
                        rail_detail,
                        rail_snapshot,
                    ):
                        _touch_audited_record(rail_detail, actor_id=actor_id, reference_time=reference_time)
                        details_changed = True

            if effective_classification.mode_family == DeliveryModeFamily.NETWORK_FLOW:
                pipeline_detail = existing_pipeline.get(delivery_id)
                pipeline_snapshot = _resolve_mode_detail_snapshot(
                    pipeline_detail,
                    defaults=_pipeline_detail_defaults(existing_delivery),
                )
                if pipeline_detail is None:
                    pipeline_detail = DeliveryPipelineDetail(
                        delivery_id=delivery_id,
                        created_at=reference_time,
                        created_by=actor_id,
                        updated_at=reference_time,
                        updated_by=actor_id,
                        version=1,
                        **pipeline_snapshot,
                    )
                    db.add(pipeline_detail)
                    existing_pipeline[delivery_id] = pipeline_detail
                    details_changed = True
                elif _apply_model_changes(
                    pipeline_detail,
                    pipeline_snapshot,
                ):
                    _touch_audited_record(pipeline_detail, actor_id=actor_id, reference_time=reference_time)
                    details_changed = True

            if effective_classification.mode_family == DeliveryModeFamily.POWER_SCHEDULE:
                power_detail = existing_power.get(delivery_id)
                power_snapshot = _resolve_mode_detail_snapshot(
                    power_detail,
                    defaults=_power_detail_defaults(existing_delivery),
                )
                if power_detail is None:
                    power_detail = DeliveryPowerDetail(
                        delivery_id=delivery_id,
                        created_at=reference_time,
                        created_by=actor_id,
                        updated_at=reference_time,
                        updated_by=actor_id,
                        version=1,
                        **power_snapshot,
                    )
                    db.add(power_detail)
                    existing_power[delivery_id] = power_detail
                    details_changed = True
                elif _apply_model_changes(
                    power_detail,
                    power_snapshot,
                ):
                    _touch_audited_record(power_detail, actor_id=actor_id, reference_time=reference_time)
                    details_changed = True

            if not row_changed and details_changed and existing_delivery is not None:
                _touch_audited_record(existing_delivery, actor_id=actor_id, reference_time=reference_time)
                row_changed = True

            if row_changed and delivery_id in preexisting_delivery_ids:
                updated_count += 1

    deleted_count = 0
    for obsolete_delivery in existing_deliveries:
        if obsolete_delivery.delivery_id in target_delivery_ids:
            continue
        for existing_event in existing_events.pop(obsolete_delivery.delivery_id, []):
            db.delete(existing_event)
        logistics_detail = existing_logistics.pop(obsolete_delivery.delivery_id, None)
        pipeline_detail = existing_pipeline.pop(obsolete_delivery.delivery_id, None)
        rail_detail = existing_rail.pop(obsolete_delivery.delivery_id, None)
        power_detail = existing_power.pop(obsolete_delivery.delivery_id, None)
        truck_detail = existing_truck_details.pop(obsolete_delivery.delivery_id, None)
        truck_movements = existing_truck_movements_by_delivery_id.pop(obsolete_delivery.delivery_id, [])
        tracking_signals = existing_tracking_signals_by_delivery_id.pop(obsolete_delivery.delivery_id, [])
        if logistics_detail is not None:
            db.delete(logistics_detail)
        if pipeline_detail is not None:
            db.delete(pipeline_detail)
        if rail_detail is not None:
            db.delete(rail_detail)
        if power_detail is not None:
            db.delete(power_detail)
        if truck_detail is not None:
            db.delete(truck_detail)
        for movement in truck_movements:
            db.delete(movement)
        for signal in tracking_signals:
            db.delete(signal)
        db.delete(obsolete_delivery)
        deleted_count += 1

    db.flush()

    return DeliverySyncResultOut(
        synced_at=reference_time,
        created_count=created_count,
        updated_count=updated_count,
        deleted_count=deleted_count,
        total_count=len(target_delivery_ids),
        logistics_count=mode_counter.get(DeliveryModeFamily.LOGISTICS.value, 0),
        network_flow_count=mode_counter.get(DeliveryModeFamily.NETWORK_FLOW.value, 0),
        power_schedule_count=mode_counter.get(DeliveryModeFamily.POWER_SCHEDULE.value, 0),
    )


def list_shipments_for_operations(db: Session, *, now: Optional[datetime] = None) -> list[DeliveryObligationOut]:
    return load_operational_resource_items(
        SHIPMENT_RESOURCE_DESCRIPTOR,
        db,
        OperationalResourceListRequest(
            reference_time=_coerce_utc(now) or datetime.now(timezone.utc),
        ),
    )
