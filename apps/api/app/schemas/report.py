from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from apps.api.app.schemas._validation import normalize_required_text


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


class PnlTradeValuation(BaseModel):
    trade_id: str
    book: str | None
    commodity_class: str | None
    instrument_type: str
    trade_structure: str
    trade_side: str | None
    settlement_status: str
    pnl_bucket: str
    pricing_type: str
    pricing_source: str
    fixed_price: float | None
    price_index_code: str | None
    market_price: float | None
    effective_mark: float | None
    quantity: float | None
    direction: int
    trade_currency_code: str | None
    price_unit_code: str | None
    pnl_contribution: float | None
    valuation_status: str
    valuation_status_reason: str | None
    included_in_totals: bool


class PnlHistoryReport(BaseModel):
    generated_at: datetime
    basis: str
    methodology: str
    point_count: int
    points: list[PnlHistoryPoint]
    summary: PnlHistorySummary
    valuations: list[PnlTradeValuation]


class SettlementAgingCurrencySummary(BaseModel):
    currency_code: str
    invoice_count: int
    overdue_invoice_count: int
    disputed_invoice_count: int
    total_outstanding_amount: float
    current_amount: float
    past_due_1_7_amount: float
    past_due_8_30_amount: float
    past_due_31_plus_amount: float
    disputed_amount: float


class SettlementAgingRow(BaseModel):
    counterparty_code: str | None
    book: str
    currency_code: str
    invoice_count: int
    trade_count: int
    overdue_invoice_count: int
    disputed_invoice_count: int
    total_outstanding_amount: float
    current_amount: float
    past_due_1_7_amount: float
    past_due_8_30_amount: float
    past_due_31_plus_amount: float
    disputed_amount: float
    oldest_due_at: datetime | None
    latest_due_at: datetime | None


class SettlementAgingReport(BaseModel):
    generated_at: datetime
    as_of: date
    row_count: int
    invoice_count: int
    overdue_invoice_count: int
    disputed_invoice_count: int
    currency_summaries: list[SettlementAgingCurrencySummary]
    rows: list[SettlementAgingRow]


class CashForecastCurrencySummary(BaseModel):
    currency_code: str
    open_outstanding_amount: float
    overdue_outstanding_amount: float
    expected_horizon_amount: float
    received_horizon_amount: float
    upcoming_invoice_count: int
    overdue_invoice_count: int
    received_payment_count: int


class CashForecastPoint(BaseModel):
    forecast_date: date
    currency_code: str
    expected_amount: float
    received_amount: float
    expected_invoice_count: int
    received_payment_count: int


class CashForecastReport(BaseModel):
    generated_at: datetime
    as_of: date
    horizon_days: int
    basis: str
    row_count: int
    currency_summaries: list[CashForecastCurrencySummary]
    points: list[CashForecastPoint]


class SettlementExceptionSummary(BaseModel):
    exception_type: str
    currency_code: str
    exception_count: int
    affected_trade_count: int
    total_outstanding_amount: float


class SettlementExceptionRow(BaseModel):
    exception_type: str
    severity: str
    trade_id: str
    invoice_id: int
    invoice_number: str
    counterparty_code: str | None
    book: str
    commodity: str
    currency_code: str
    invoice_status: str
    payment_status: str
    settlement_status: str
    owner: str | None
    due_at: datetime | None
    last_received_at: datetime | None
    invoice_amount: float
    total_paid_amount: float
    outstanding_amount: float
    days_past_due: int
    summary: str


class SettlementExceptionReport(BaseModel):
    generated_at: datetime
    as_of: date
    row_count: int
    blocked_count: int
    warning_count: int
    summaries: list[SettlementExceptionSummary]
    rows: list[SettlementExceptionRow]


SettlementReportPresetScope = Literal["PERSONAL", "SHARED"]
SettlementReportPresetKey = Literal["settlement"]
SETTLEMENT_REPORT_EXCEPTION_TYPES = frozenset(
    {
        "DISPUTED_INVOICE",
        "SHORT_PAY",
        "OVERDUE_PAYMENT",
    }
)
SETTLEMENT_REPORT_EXCEPTION_SEVERITIES = frozenset({"blocked", "in-progress"})


def _normalize_optional_report_filter(value: str | None, *, field_name: str) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalize_required_text(normalized, field_name=field_name)


class SettlementReportFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    book: str | None = None
    counterparty: str | None = None
    currency: str | None = None
    exception_type: str | None = None
    severity: str | None = None

    @field_validator("book")
    @classmethod
    def normalize_book(cls, value: str | None) -> str | None:
        return _normalize_optional_report_filter(value, field_name="book")

    @field_validator("counterparty")
    @classmethod
    def normalize_counterparty(cls, value: str | None) -> str | None:
        return _normalize_optional_report_filter(value, field_name="counterparty")

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        normalized = _normalize_optional_report_filter(value, field_name="currency")
        return normalized.upper() if normalized else None

    @field_validator("exception_type")
    @classmethod
    def normalize_exception_type(cls, value: str | None) -> str | None:
        normalized = _normalize_optional_report_filter(value, field_name="exception_type")
        if normalized is None:
            return None

        normalized = normalized.upper()
        if normalized not in SETTLEMENT_REPORT_EXCEPTION_TYPES:
            raise ValueError(
                "exception_type must be one of: "
                + ", ".join(sorted(SETTLEMENT_REPORT_EXCEPTION_TYPES))
            )
        return normalized

    @field_validator("severity")
    @classmethod
    def normalize_severity(cls, value: str | None) -> str | None:
        normalized = _normalize_optional_report_filter(value, field_name="severity")
        if normalized is None:
            return None

        normalized = normalized.lower()
        if normalized not in SETTLEMENT_REPORT_EXCEPTION_SEVERITIES:
            raise ValueError(
                "severity must be one of: "
                + ", ".join(sorted(SETTLEMENT_REPORT_EXCEPTION_SEVERITIES))
            )
        return normalized


class SettlementReportFilterOptions(BaseModel):
    books: list[str]
    counterparties: list[str]
    currencies: list[str]
    exception_types: list[str]
    severities: list[str]


class SettlementReportPresetCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    scope: SettlementReportPresetScope = "PERSONAL"
    filters: SettlementReportFilters = Field(default_factory=SettlementReportFilters)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")


class SettlementReportPresetUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    scope: SettlementReportPresetScope | None = None
    filters: SettlementReportFilters | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_required_text(value, field_name="name")


class SettlementReportPresetOut(BaseModel):
    preset_id: int
    preset_key: SettlementReportPresetKey
    name: str
    scope: SettlementReportPresetScope
    filters: SettlementReportFilters
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    can_edit: bool
