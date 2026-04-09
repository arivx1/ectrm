from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


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


class DeliveryActualizationOut(BaseModel):
    actualization_id: int
    delivery_id: str
    trade_id: str
    leg_no: Optional[int]
    unit_of_measure: Optional[str]
    planned_quantity: Optional[float]
    actual_quantity: float
    quantity_variance: Optional[float]
    actualization_status: str
    actualized_at: datetime
    source: Optional[str]
    notes: Optional[str]
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
    location_code: Optional[str]
    reference_code: Optional[str]
    source: Optional[str]
    notes: Optional[str]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


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


class DeliveryPipelineDetailUpdate(BaseModel):
    pipeline_system: Optional[str] = None
    pipeline_path: Optional[str] = None
    receipt_location_code: Optional[str] = None
    delivery_location_code: Optional[str] = None
    pipeline_contract_number: Optional[str] = None
    pipeline_cycle_code: Optional[str] = None
    nomination_reference: Optional[str] = None
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


ShipmentOut = DeliveryObligationOut
