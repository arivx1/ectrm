from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class TradeInvoiceOut(BaseModel):
    invoice_id: int
    trade_id: str
    invoice_number: str
    invoice_currency_code: str
    invoice_amount: float
    status: str
    issued_at: datetime
    due_at: datetime
    dispute_reason: Optional[str]
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


class TradeInvoiceCreate(BaseModel):
    trade_id: str
    invoice_number: Optional[str] = None
    invoice_currency_code: Optional[str] = None
    invoice_amount: Optional[float] = None
    issued_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    notes: Optional[str] = None


class TradeInvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    invoice_currency_code: Optional[str] = None
    invoice_amount: Optional[float] = None
    status: Optional[str] = None
    issued_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    dispute_reason: Optional[str] = None
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


class TradePaymentCreate(BaseModel):
    invoice_id: int
    payment_reference: Optional[str] = None
    payment_currency_code: Optional[str] = None
    payment_amount: Optional[float] = None
    status: Optional[str] = None
    due_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    notes: Optional[str] = None


class TradePaymentUpdate(BaseModel):
    payment_reference: Optional[str] = None
    payment_currency_code: Optional[str] = None
    payment_amount: Optional[float] = None
    status: Optional[str] = None
    due_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    notes: Optional[str] = None
