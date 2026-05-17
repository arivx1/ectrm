from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class DeliverySchedulingWorkflowItemOut(BaseModel):
    item_id: int
    workflow_type: str
    status: str
    owner: Optional[str]
    due_at: Optional[datetime]
    notes: Optional[str]
    updated_at: datetime
    version: int
    is_closed: bool
    is_overdue: bool


class DeliveryActualizationWrite(BaseModel):
    actual_quantity: float
    actualized_at: datetime
    source: Optional[str] = None
    notes: Optional[str] = None


class DeliveryActualizationVoidWrite(BaseModel):
    void_reason: str
    notes: Optional[str] = None


class DeliveryActualizationOut(BaseModel):
    actualization_id: int
    delivery_id: str
    trade_id: str
    leg_no: Optional[int]
    unit_of_measure: Optional[str]
    planned_quantity: Optional[float]
    actual_quantity: Optional[float]
    quantity_variance: Optional[float]
    actualization_status: str
    actualized_at: Optional[datetime]
    source: Optional[str]
    notes: Optional[str]
    voided_at: Optional[datetime]
    voided_by: Optional[str]
    void_reason: Optional[str]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class DeliveryEventOut(BaseModel):
    event_id: int
    delivery_id: str
    trade_id: str
    leg_no: Optional[int]
    event_type: str
    execution_status: str
    occurred_at: datetime
    reversal_of_event_id: Optional[int]
    reversal_reason: Optional[str]
    location_code: Optional[str]
    reference_code: Optional[str]
    source: Optional[str]
    notes: Optional[str]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class DeliveryTruckDetailOut(BaseModel):
    delivery_id: str
    target_run_count: Optional[int]
    dispatcher_owner: Optional[str]
    tracking_provider: Optional[str]
    tracking_policy: Optional[str]
    default_carrier_name: Optional[str]
    default_carrier_name_source: str
    default_external_carrier_reference: Optional[str]
    default_external_carrier_reference_source: str
    equipment_type: Optional[str]
    equipment_type_source: str
    origin_geofence_code: Optional[str]
    origin_geofence_code_source: str
    destination_geofence_code: Optional[str]
    destination_geofence_code_source: str
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class DeliveryTruckStopOut(BaseModel):
    stop_id: str
    movement_id: str
    stop_sequence: int
    stop_type: str
    status: str
    status_reason: Optional[str]
    location_code: Optional[str]
    location_code_source: str
    planned_arrival_start: Optional[datetime]
    planned_arrival_end: Optional[datetime]
    planned_departure_start: Optional[datetime]
    planned_departure_end: Optional[datetime]
    appointment_reference: Optional[str]
    appointment_reference_source: str
    planned_quantity: Optional[float]
    actual_quantity: Optional[float]
    actual_arrived_at: Optional[datetime]
    actual_departed_at: Optional[datetime]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class DeliveryTruckMovementTrackingHealthOut(BaseModel):
    last_evaluated_at: datetime
    eta_status: str
    eta_status_reason: str
    tracking_freshness_status: str
    tracking_freshness_reason: str
    dwell_status: str
    dwell_status_reason: str
    exception_severity: str
    primary_exception: Optional[str]
    stale_after_minutes: int
    dwell_threshold_minutes: int
    destination_stop_id: Optional[str]
    current_stop_id: Optional[str]
    minutes_since_last_signal: Optional[int]
    current_dwell_minutes: Optional[int]
    eta_late_minutes: Optional[int]


class DeliveryTruckMovementSummaryOut(BaseModel):
    movement_id: str
    delivery_id: str
    sequence_no: int
    status: str
    status_reason: Optional[str]
    planned_quantity: Optional[float]
    planned_unit_of_measure: Optional[str]
    carrier_name: Optional[str]
    carrier_name_source: str
    external_carrier_reference: Optional[str]
    external_carrier_reference_source: str
    dispatcher_owner: Optional[str]
    dispatcher_owner_source: str
    current_stop_sequence: Optional[int]
    current_location_code: Optional[str]
    last_signal_at: Optional[datetime]
    current_eta_at_destination: Optional[datetime]
    tracking_health: DeliveryTruckMovementTrackingHealthOut
    hold_reason_code: Optional[str]
    hold_reason_code_source: str
    stop_count: int
    active_stop_count: int
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class DeliveryTruckMovementOut(DeliveryTruckMovementSummaryOut):
    driver_name: Optional[str]
    driver_name_source: str
    driver_phone: Optional[str]
    driver_phone_source: str
    tractor_reference: Optional[str]
    tractor_reference_source: str
    trailer_reference: Optional[str]
    trailer_reference_source: str
    external_load_reference: Optional[str]
    external_load_reference_source: str
    bill_of_lading_number: Optional[str]
    bill_of_lading_number_source: str
    truck_ticket_number: Optional[str]
    truck_ticket_number_source: str
    stops: list[DeliveryTruckStopOut]


class DeliveryTruckTrackingExceptionOut(BaseModel):
    delivery_id: str
    trade_id: str
    leg_no: Optional[int]
    external_trade_id: Optional[str]
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    transport_mode: str
    execution_status: str
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    location_code: Optional[str]
    origin_location_code: Optional[str]
    destination_location_code: Optional[str]
    operations_owner: Optional[str]
    movement: DeliveryTruckMovementSummaryOut
    tracking_health: DeliveryTruckMovementTrackingHealthOut


class DeliveryTrackingSignalOut(BaseModel):
    signal_id: int
    delivery_id: Optional[str]
    movement_id: Optional[str]
    stop_id: Optional[str]
    source_system: str
    source_event_id: Optional[str]
    signal_type: str
    occurred_at: datetime
    received_at: datetime
    latitude: Optional[float]
    longitude: Optional[float]
    location_code: Optional[str]
    external_status: Optional[str]
    normalized_status: Optional[str]
    match_confidence: Optional[float]
    dedupe_key: str
    processing_status: str
    processing_error: Optional[str]
    raw_payload: dict[str, Any]


class DeliveryTrackingSignalIngestResultOut(BaseModel):
    ingest_status: str
    duplicate: bool
    signal: DeliveryTrackingSignalOut
    movement: DeliveryTruckMovementSummaryOut


class DeliveryObligationOut(BaseModel):
    delivery_id: str
    trade_id: str
    leg_no: Optional[int]
    external_trade_id: Optional[str]
    status: str
    direction: str
    mode_family: str
    transport_mode: str
    transport_mode_source: str
    delivery_profile: str
    book: str
    book_source: str
    portfolio: Optional[str]
    portfolio_source: str
    counterparty: Optional[str]
    counterparty_source: str
    commodity_class: str
    commodity: str
    volume: Optional[float]
    unit_of_measure: Optional[str]
    trade_currency_code: Optional[str]
    price_unit_code: Optional[str]
    location_code: Optional[str]
    location_source: str
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    delivery_window_source: str
    origin_location_code: Optional[str] = None
    origin_location_code_source: Optional[str] = None
    destination_location_code: Optional[str] = None
    destination_location_code_source: Optional[str] = None
    carrier_name: Optional[str] = None
    carrier_name_source: Optional[str] = None
    carrier_reference: Optional[str] = None
    carrier_reference_source: Optional[str] = None
    asset_reference: Optional[str] = None
    asset_reference_source: Optional[str] = None
    incoterm_code: Optional[str] = None
    incoterm_code_source: Optional[str] = None
    equipment_type: Optional[str] = None
    equipment_type_source: Optional[str] = None
    load_reference: Optional[str] = None
    load_reference_source: Optional[str] = None
    discharge_reference: Optional[str] = None
    discharge_reference_source: Optional[str] = None
    truck_detail: Optional[DeliveryTruckDetailOut] = None
    truck_movement_count: int = 0
    active_truck_movement_count: int = 0
    rail_route_code: Optional[str] = None
    rail_route_code_source: Optional[str] = None
    rail_line_code: Optional[str] = None
    railroad_code: Optional[str] = None
    rail_route_direction: Optional[str] = None
    rail_schedule_timezone: Optional[str] = None
    rail_service_calendar_code: Optional[str] = None
    rail_placement_cutoff_time_local: Optional[str] = None
    rail_release_cutoff_time_local: Optional[str] = None
    rail_placement_free_time_hours: Optional[int] = None
    rail_release_free_time_hours: Optional[int] = None
    origin_station_code: Optional[str] = None
    origin_station_code_source: Optional[str] = None
    destination_station_code: Optional[str] = None
    destination_station_code_source: Optional[str] = None
    waybill_reference: Optional[str] = None
    waybill_reference_source: Optional[str] = None
    release_number: Optional[str] = None
    release_number_source: Optional[str] = None
    unit_train_id: Optional[str] = None
    unit_train_id_source: Optional[str] = None
    railcar_count: Optional[int] = None
    railcar_count_source: Optional[str] = None
    receipt_location_code: Optional[str] = None
    receipt_location_code_source: Optional[str] = None
    delivery_location_code: Optional[str] = None
    delivery_location_code_source: Optional[str] = None
    pipeline_system: Optional[str] = None
    pipeline_system_source: Optional[str] = None
    pipeline_path: Optional[str] = None
    pipeline_path_source: Optional[str] = None
    pipeline_contract_number: Optional[str] = None
    pipeline_contract_number_source: Optional[str] = None
    pipeline_cycle_code: Optional[str] = None
    pipeline_cycle_code_source: Optional[str] = None
    nomination_reference: Optional[str] = None
    nomination_reference_source: Optional[str] = None
    market_operator: Optional[str] = None
    market_operator_source: Optional[str] = None
    pricing_node_code: Optional[str] = None
    pricing_node_code_source: Optional[str] = None
    delivery_node_code: Optional[str] = None
    delivery_node_code_source: Optional[str] = None
    profile_code: Optional[str] = None
    profile_code_source: Optional[str] = None
    schedule_reference: Optional[str] = None
    schedule_reference_source: Optional[str] = None
    interval_minutes: Optional[int] = None
    interval_minutes_source: Optional[str] = None
    timezone_name: Optional[str] = None
    timezone_name_source: Optional[str] = None
    execution_status: str
    execution_status_source: str
    event_count: int
    latest_event_type: Optional[str] = None
    latest_event_at: Optional[datetime] = None
    operations_owner: Optional[str] = None
    operations_owner_source: str
    external_reference: Optional[str] = None
    external_reference_source: str
    ops_notes: Optional[str] = None
    ops_notes_source: str
    delivery_record_updated_at: Optional[datetime] = None
    booked_at: datetime
    last_updated_at: datetime
    age_days: int
    pricing_status: str
    confirmation_status: str
    nomination_status: str
    allocation_status: str
    actualization_status: str
    actualized_quantity: Optional[float]
    actualized_at: Optional[datetime]
    actualization_source: Optional[str]
    actualization_notes: Optional[str]
    actualization_updated_at: Optional[datetime]
    actualization_variance_quantity: Optional[float]
    invoice_status: str
    payment_status: str
    settlement_status: str
    blocker_count: int
    blockers: list[str]
    scheduling_stage: str
    scheduling_owner: Optional[str]
    scheduling_due_at: Optional[datetime]
    open_scheduling_work_item_count: int
    next_scheduling_workflow_type: Optional[str]
    next_scheduling_workflow_status: Optional[str]
    scheduling_work_items: list[DeliverySchedulingWorkflowItemOut]
    delivery_events: list[DeliveryEventOut]


class DeliverySyncResultOut(BaseModel):
    synced_at: datetime
    created_count: int
    updated_count: int
    deleted_count: int
    total_count: int
    logistics_count: int
    network_flow_count: int
    power_schedule_count: int


class DeliveryObligationUpdate(BaseModel):
    transport_mode: Optional[str] = None
    book: Optional[str] = None
    portfolio: Optional[str] = None
    counterparty: Optional[str] = None
    location_code: Optional[str] = None
    delivery_start: Optional[date] = None
    delivery_end: Optional[date] = None
    execution_status: Optional[str] = None
    operations_owner: Optional[str] = None
    external_reference: Optional[str] = None
    ops_notes: Optional[str] = None
    reset_fields: Optional[list[str]] = None


class DeliveryLogisticsDetailUpdate(BaseModel):
    origin_location_code: Optional[str] = None
    destination_location_code: Optional[str] = None
    incoterm_code: Optional[str] = None
    carrier_name: Optional[str] = None
    carrier_reference: Optional[str] = None
    asset_reference: Optional[str] = None
    equipment_type: Optional[str] = None
    load_reference: Optional[str] = None
    discharge_reference: Optional[str] = None
    reset_fields: Optional[list[str]] = None


class DeliveryTruckDetailUpdate(BaseModel):
    target_run_count: Optional[int] = None
    dispatcher_owner: Optional[str] = None
    tracking_provider: Optional[str] = None
    tracking_policy: Optional[str] = None
    default_carrier_name: Optional[str] = None
    default_external_carrier_reference: Optional[str] = None
    equipment_type: Optional[str] = None
    origin_geofence_code: Optional[str] = None
    destination_geofence_code: Optional[str] = None


class DeliveryPipelineDetailUpdate(BaseModel):
    pipeline_system: Optional[str] = None
    pipeline_path: Optional[str] = None
    receipt_location_code: Optional[str] = None
    delivery_location_code: Optional[str] = None
    pipeline_contract_number: Optional[str] = None
    pipeline_cycle_code: Optional[str] = None
    nomination_reference: Optional[str] = None
    reset_fields: Optional[list[str]] = None


class DeliveryRailDetailUpdate(BaseModel):
    rail_route_code: Optional[str] = None
    origin_station_code: Optional[str] = None
    destination_station_code: Optional[str] = None
    waybill_reference: Optional[str] = None
    release_number: Optional[str] = None
    unit_train_id: Optional[str] = None
    railcar_count: Optional[int] = None
    reset_fields: Optional[list[str]] = None


class DeliveryPowerDetailUpdate(BaseModel):
    market_operator: Optional[str] = None
    pricing_node_code: Optional[str] = None
    delivery_node_code: Optional[str] = None
    profile_code: Optional[str] = None
    schedule_reference: Optional[str] = None
    interval_minutes: Optional[int] = None
    timezone_name: Optional[str] = None
    reset_fields: Optional[list[str]] = None


class DeliveryEventWrite(BaseModel):
    event_type: str
    occurred_at: datetime
    location_code: Optional[str] = None
    reference_code: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None


class DeliveryEventReverseWrite(BaseModel):
    reversal_reason: str
    reversed_at: Optional[datetime] = None
    source: Optional[str] = None
    notes: Optional[str] = None


class DeliveryTruckStopCreate(BaseModel):
    stop_sequence: Optional[int] = None
    stop_type: str
    location_code: Optional[str] = None
    planned_arrival_start: Optional[datetime] = None
    planned_arrival_end: Optional[datetime] = None
    planned_departure_start: Optional[datetime] = None
    planned_departure_end: Optional[datetime] = None
    appointment_reference: Optional[str] = None
    planned_quantity: Optional[float] = None
    status: Optional[str] = None


class DeliveryTruckMovementCreate(BaseModel):
    sequence_no: int
    planned_quantity: Optional[float] = None
    planned_unit_of_measure: Optional[str] = None
    carrier_name: Optional[str] = None
    external_carrier_reference: Optional[str] = None
    dispatcher_owner: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    tractor_reference: Optional[str] = None
    trailer_reference: Optional[str] = None
    external_load_reference: Optional[str] = None
    bill_of_lading_number: Optional[str] = None
    truck_ticket_number: Optional[str] = None
    hold_reason_code: Optional[str] = None
    status: Optional[str] = None
    stops: list[DeliveryTruckStopCreate]


class DeliveryTruckMovementUpdate(BaseModel):
    sequence_no: Optional[int] = None
    planned_quantity: Optional[float] = None
    planned_unit_of_measure: Optional[str] = None
    carrier_name: Optional[str] = None
    external_carrier_reference: Optional[str] = None
    dispatcher_owner: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    tractor_reference: Optional[str] = None
    trailer_reference: Optional[str] = None
    external_load_reference: Optional[str] = None
    bill_of_lading_number: Optional[str] = None
    truck_ticket_number: Optional[str] = None
    hold_reason_code: Optional[str] = None
    status: Optional[str] = None
    status_reason: Optional[str] = None


class DeliveryTruckMovementCancelWrite(BaseModel):
    cancel_reason: str


class DeliveryTruckStopUpdate(BaseModel):
    stop_sequence: Optional[int] = None
    stop_type: Optional[str] = None
    location_code: Optional[str] = None
    planned_arrival_start: Optional[datetime] = None
    planned_arrival_end: Optional[datetime] = None
    planned_departure_start: Optional[datetime] = None
    planned_departure_end: Optional[datetime] = None
    appointment_reference: Optional[str] = None
    planned_quantity: Optional[float] = None
    actual_quantity: Optional[float] = None
    actual_arrived_at: Optional[datetime] = None
    actual_departed_at: Optional[datetime] = None
    status: Optional[str] = None
    status_reason: Optional[str] = None


class DeliveryTruckStopSkipWrite(BaseModel):
    skip_reason: str


class DeliveryTruckStopCancelWrite(BaseModel):
    cancel_reason: str


class DeliveryTruckStopCheckpointWrite(BaseModel):
    checkpoint_code: str
    occurred_at: datetime
    notes: Optional[str] = None


class DeliveryTruckStopCheckpointReverseWrite(BaseModel):
    reversal_reason: str
    reversed_at: Optional[datetime] = None
    notes: Optional[str] = None


class DeliveryTrackingSignalWrite(BaseModel):
    source_system: Optional[str] = None
    source_event_id: Optional[str] = None
    signal_type: str
    occurred_at: datetime
    received_at: Optional[datetime] = None
    stop_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_code: Optional[str] = None
    external_status: Optional[str] = None
    normalized_status: Optional[str] = None
    match_confidence: Optional[float] = None
    eta_at_destination: Optional[datetime] = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)


ShipmentOut = DeliveryObligationOut
