from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class AccrualLotOut(BaseModel):
    accrual_lot_id: str
    trade_id: str
    delivery_id: str | None
    leg_no: int | None
    book: str
    portfolio: str | None
    counterparty: str | None
    commodity_class: str
    commodity: str
    trade_currency_code: str | None
    accrual_currency_code: str
    quantity_unit_code: str | None
    planned_quantity: float | None
    actualized_quantity: float
    billed_quantity: float
    accrued_amount: float
    billed_amount: float
    collected_amount: float
    disputed_amount: float
    unbilled_quantity: float
    unbilled_amount: float
    billed_uncollected_amount: float
    net_open_amount: float
    status: str
    opened_at: datetime
    closed_at: datetime | None
    notes: str | None
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    entry_count: int
    last_entry_at: datetime | None


class AccrualEntryOut(BaseModel):
    entry_id: str
    accrual_lot_id: str
    entry_type: str
    trade_id: str
    delivery_id: str | None
    invoice_id: int | None
    payment_id: int | None
    effective_date: date
    currency_code: str
    quantity_delta: float | None
    amount_delta: float
    reference_price: float | None
    price_index_code: str | None
    fx_rate: float | None
    notes: str | None
    created_at: datetime
    created_by: str


class AccrualReconciliationCurrencySummary(BaseModel):
    currency_code: str
    lot_count: int
    accrued_amount: float
    billed_amount: float
    collected_amount: float
    disputed_amount: float
    unbilled_amount: float
    billed_uncollected_amount: float
    net_open_amount: float


class AccrualReconciliationRow(BaseModel):
    book: str
    portfolio: str | None
    counterparty: str | None
    commodity_class: str
    currency_code: str
    lot_count: int
    actualized_quantity: float
    billed_quantity: float
    unbilled_quantity: float
    accrued_amount: float
    billed_amount: float
    collected_amount: float
    disputed_amount: float
    unbilled_amount: float
    billed_uncollected_amount: float
    net_open_amount: float


class AccrualReconciliationReport(BaseModel):
    generated_at: datetime
    row_count: int
    lot_count: int
    currency_summaries: list[AccrualReconciliationCurrencySummary]
    rows: list[AccrualReconciliationRow]
