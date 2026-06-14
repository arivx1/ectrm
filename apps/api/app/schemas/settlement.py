from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field
from apps.api.app.schemas.operations import OperationalRowActionStateOut


class TradeInvoiceOut(BaseModel):
    invoice_id: int
    trade_id: str
    delivery_id: Optional[str]
    leg_no: Optional[int]
    invoice_number: str
    invoice_currency_code: str
    billed_quantity: Optional[float]
    quantity_unit_code: Optional[str]
    invoice_amount: float
    status: str
    issued_at: datetime
    due_at: datetime
    dispute_reason: Optional[str]
    voided_at: Optional[datetime]
    voided_by: Optional[str]
    void_reason: Optional[str]
    notes: Optional[str]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    workflow_item_id: Optional[int]
    workflow_owner: Optional[str]
    is_overdue: bool
    age_days: int
    trade_nature: str
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    trader_user: Optional[str]
    trade_date: Optional[date]
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    payment_status: str
    settlement_status: str
    total_paid_amount: float
    outstanding_amount: float
    action_states: list[OperationalRowActionStateOut] = Field(default_factory=list)


class TradeInvoiceCreate(BaseModel):
    trade_id: str
    leg_no: Optional[int] = None
    invoice_number: Optional[str] = None
    invoice_currency_code: Optional[str] = None
    billed_quantity: Optional[float] = None
    invoice_amount: Optional[float] = None
    issued_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    due_calendar_code: Optional[str] = None
    notes: Optional[str] = None


class TradeInvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    invoice_currency_code: Optional[str] = None
    invoice_amount: Optional[float] = None
    status: Optional[str] = None
    issued_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    due_calendar_code: Optional[str] = None
    dispute_reason: Optional[str] = None
    notes: Optional[str] = None


class TradeInvoiceVoid(BaseModel):
    void_reason: str
    notes: Optional[str] = None


class TradePaymentOut(BaseModel):
    payment_id: int
    trade_id: str
    invoice_id: int
    invoice_number: str
    payment_reference: str
    payment_currency_code: str
    payment_amount: float
    status: str
    due_at: datetime
    received_at: Optional[datetime]
    reversal_of_payment_id: Optional[int]
    reversal_reason: Optional[str]
    notes: Optional[str]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    workflow_item_id: Optional[int]
    workflow_owner: Optional[str]
    is_overdue: bool
    age_days: int
    invoice_amount: float
    total_paid_amount: float
    outstanding_amount: float
    trade_nature: str
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    trader_user: Optional[str]
    trade_date: Optional[date]
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    invoice_status: str
    settlement_status: str
    action_states: list[OperationalRowActionStateOut] = Field(default_factory=list)


class InvoiceIssueCandidateOut(BaseModel):
    trade_id: str
    trade_nature: str
    book: str
    portfolio: Optional[str]
    counterparty: Optional[str]
    commodity_class: str
    commodity: str
    trader_user: Optional[str]
    trade_date: Optional[date]
    execution_timestamp: Optional[datetime]
    delivery_start: Optional[date]
    delivery_end: Optional[date]
    trade_currency_code: Optional[str]
    invoice_status: str
    payment_status: str
    settlement_status: str
    notional_amount: float | None
    age_days: Optional[int]
    readiness_status: str
    priority_reason: str
    preview_summary: str
    blocking_reasons: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    recommended_action: dict[str, Any] = Field(default_factory=dict)


class InvoiceIssueCandidateListOut(BaseModel):
    count: int
    total_count: int
    ready_count: int
    blocked_count: int
    items: list[InvoiceIssueCandidateOut] = Field(default_factory=list)


class TradePaymentCreate(BaseModel):
    invoice_id: int
    payment_reference: Optional[str] = None
    payment_currency_code: Optional[str] = None
    payment_amount: Optional[float] = None
    status: Optional[str] = None
    due_at: Optional[datetime] = None
    due_calendar_code: Optional[str] = None
    received_at: Optional[datetime] = None
    notes: Optional[str] = None


class TradePaymentUpdate(BaseModel):
    payment_reference: Optional[str] = None
    payment_currency_code: Optional[str] = None
    payment_amount: Optional[float] = None
    status: Optional[str] = None
    due_at: Optional[datetime] = None
    due_calendar_code: Optional[str] = None
    received_at: Optional[datetime] = None
    notes: Optional[str] = None


class TradePaymentReverse(BaseModel):
    reversal_reason: str
    payment_reference: Optional[str] = None
    reversed_at: Optional[datetime] = None
    notes: Optional[str] = None
