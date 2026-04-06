from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class ExposureSummaryRow(BaseModel):
    commodity: str
    net_volume: float
    active_trade_count: int
    updated_at: datetime


class ActivitySummaryRow(BaseModel):
    event_type: str
    event_count: int
    last_occurred_at: datetime


class ReportingOverview(BaseModel):
    active_trade_count: int
    tracked_commodity_count: int
    gross_net_volume: float
    exposure: list[ExposureSummaryRow]
    activity: list[ActivitySummaryRow]


class CounterpartyCreditReportRow(BaseModel):
    counterparty_code: str
    counterparty_name: str
    counterparty_type: str
    credit_status: str
    active_trade_count: int
    exposure_currency_code: str | None
    exposure_amount: float | None
    in_exposure_currency_trade_count: int
    priced_trade_count: int
    unpriced_trade_count: int
    out_of_scope_trade_count: int
    limit_currency_code: str | None
    limit_amount: float | None
    limit_utilization_percent: float | None
    limit_breached: bool
    credit_rating: str | None
    review_due_at: date | None
    review_is_due: bool
    breach_action: str
    latest_trade_updated_at: datetime | None


class PnlHistoryPoint(BaseModel):
    date: date
    total_pnl: float
    realized_pnl: float
    unrealized_pnl: float
    priced_trade_count: int
    realized_trade_count: int
    unrealized_trade_count: int


class PnlHistorySummary(BaseModel):
    total_pnl: float
    realized_pnl: float
    unrealized_pnl: float
    priced_trade_count: int
    realized_trade_count: int
    unrealized_trade_count: int


class PnlHistoryReport(BaseModel):
    generated_at: datetime
    basis: str
    methodology: str
    point_count: int
    points: list[PnlHistoryPoint]
    summary: PnlHistorySummary
