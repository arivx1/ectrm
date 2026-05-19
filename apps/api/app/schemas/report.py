from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from apps.api.app.schemas._validation import normalize_required_text


SemanticDatasetFieldType = Literal["string", "integer", "number", "boolean", "date", "datetime"]
SemanticDatasetFieldRole = Literal["identifier", "dimension", "measure", "status", "timestamp", "narrative"]
SemanticDatasetSourceKind = Literal["projection", "reference_data", "report_service", "external_series", "manual"]
SemanticDatasetStatus = Literal["active", "planned"]
ReportDefinitionValidationStatus = Literal["valid", "invalid"]
ReportDefinitionIssueSeverity = Literal["error", "warning"]
ReportDefinitionDependencyRole = Literal["source", "field", "parameter", "formula_input", "prior_run"]
ReportDefinitionScope = Literal["personal", "team", "global"]
ReportDefinitionLifecycleStatus = Literal["draft", "published", "retired"]
WorkbookSheetKind = Literal["manual", "dataset", "report", "workbook_run", "formula"]


class SemanticDatasetField(BaseModel):
    field_key: str
    label: str
    data_type: SemanticDatasetFieldType
    role: SemanticDatasetFieldRole
    nullable: bool = False
    filterable: bool = True
    groupable: bool = True
    aggregatable: bool = False
    formula_eligible: bool = True
    description: str | None = None
    source_path: str | None = None


class SemanticDatasetDefinition(BaseModel):
    dataset_id: str
    name: str
    description: str
    owning_domain: str
    source_kind: SemanticDatasetSourceKind
    source_ref: str
    grain: str
    fields: list[SemanticDatasetField]
    parameter_keys: list[str] = Field(default_factory=list)
    default_sort: list[str] = Field(default_factory=list)
    freshness_policy: str
    access_policy_key: str
    status: SemanticDatasetStatus = "active"


class ReportDefinitionColumnDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field_key: str
    label: str | None = Field(default=None, max_length=120)

    @field_validator("field_key")
    @classmethod
    def normalize_field_key(cls, value: str) -> str:
        return normalize_required_text(value, field_name="field_key")

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_required_text(value, field_name="label")


class ReportDefinitionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    report_key: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    scope: ReportDefinitionScope = "personal"
    dataset_id: str = Field(..., min_length=1, max_length=120)
    columns: list[ReportDefinitionColumnDraft] = Field(default_factory=list)
    parameter_keys: list[str] = Field(default_factory=list)
    default_sort: list[str] = Field(default_factory=list)

    @field_validator("report_key", "name", "dataset_id")
    @classmethod
    def normalize_required_values(cls, value: str) -> str:
        return normalize_required_text(value, field_name="report_definition")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("parameter_keys", "default_sort")
    @classmethod
    def normalize_reference_list(cls, values: list[str], info: ValidationInfo) -> list[str]:
        return [
            normalize_required_text(value, field_name=f"{info.field_name}[{index}]")
            for index, value in enumerate(values)
        ]


class WorkbookSheetDefinitionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sheet_key: str = Field(..., min_length=1, max_length=80)
    sheet_name: str = Field(..., min_length=1, max_length=120)
    sheet_kind: WorkbookSheetKind
    dataset_id: str | None = Field(default=None, max_length=120)
    report_key: str | None = Field(default=None, max_length=80)
    run_id: str | None = Field(default=None, max_length=120)
    columns: list[ReportDefinitionColumnDraft] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)
    formulas: list[str] = Field(default_factory=list)

    @field_validator("sheet_key", "sheet_name")
    @classmethod
    def normalize_required_values(cls, value: str) -> str:
        return normalize_required_text(value, field_name="workbook_sheet")

    @field_validator("dataset_id", "report_key", "run_id")
    @classmethod
    def normalize_optional_ref(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("depends_on", "formulas")
    @classmethod
    def normalize_reference_list(cls, values: list[str], info: ValidationInfo) -> list[str]:
        return [
            normalize_required_text(value, field_name=f"{info.field_name}[{index}]")
            for index, value in enumerate(values)
        ]


class WorkbookDefinitionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workbook_key: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    scope: ReportDefinitionScope = "personal"
    parameter_keys: list[str] = Field(default_factory=list)
    sheets: list[WorkbookSheetDefinitionDraft] = Field(default_factory=list)

    @field_validator("workbook_key", "name")
    @classmethod
    def normalize_required_values(cls, value: str) -> str:
        return normalize_required_text(value, field_name="workbook_definition")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("parameter_keys")
    @classmethod
    def normalize_parameter_keys(cls, values: list[str]) -> list[str]:
        return [
            normalize_required_text(value, field_name=f"parameter_keys[{index}]")
            for index, value in enumerate(values)
        ]


class ReportDefinitionValidationIssue(BaseModel):
    severity: ReportDefinitionIssueSeverity
    code: str
    message: str
    location: str


class ReportDefinitionDependencyEdge(BaseModel):
    from_ref: str
    to_kind: str
    to_ref: str
    dependency_role: ReportDefinitionDependencyRole
    field_ref: str | None = None


class ReportDefinitionValidationResult(BaseModel):
    status: ReportDefinitionValidationStatus
    valid: bool
    error_count: int
    warning_count: int
    issues: list[ReportDefinitionValidationIssue] = Field(default_factory=list)
    dependency_edges: list[ReportDefinitionDependencyEdge] = Field(default_factory=list)
    referenced_dataset_ids: list[str] = Field(default_factory=list)


class ReportDefinitionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    definition: ReportDefinitionDraft


class ReportDefinitionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    definition: ReportDefinitionDraft


class WorkbookDefinitionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    definition: WorkbookDefinitionDraft


class WorkbookDefinitionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    definition: WorkbookDefinitionDraft


class ReportDefinitionRecordOut(BaseModel):
    definition_id: int
    report_key: str
    name: str
    description: str | None = None
    scope: ReportDefinitionScope
    lifecycle_status: ReportDefinitionLifecycleStatus
    definition_version: int
    version: int
    definition: ReportDefinitionDraft
    validation_result: ReportDefinitionValidationResult
    referenced_dataset_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    published_at: datetime | None = None
    published_by: str | None = None
    retired_at: datetime | None = None
    retired_by: str | None = None
    can_edit: bool
    can_publish: bool
    can_retire: bool


class WorkbookDefinitionRecordOut(BaseModel):
    definition_id: int
    workbook_key: str
    name: str
    description: str | None = None
    scope: ReportDefinitionScope
    lifecycle_status: ReportDefinitionLifecycleStatus
    definition_version: int
    version: int
    definition: WorkbookDefinitionDraft
    validation_result: ReportDefinitionValidationResult
    referenced_dataset_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    published_at: datetime | None = None
    published_by: str | None = None
    retired_at: datetime | None = None
    retired_by: str | None = None
    can_edit: bool
    can_publish: bool
    can_retire: bool


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
    portfolio: str | None
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


class PnlPortfolioComparisonRow(BaseModel):
    portfolio: str
    from_snapshot: PnlHistorySummary
    to_snapshot: PnlHistorySummary
    delta: PnlHistorySummary


class PnlAttributionBreakdown(BaseModel):
    market_move_pnl: float
    quantity_change_pnl: float
    coverage_change_pnl: float
    other_change_pnl: float
    realization_transfer_pnl: float
    reconciled_pnl_delta: float


class PnlAttributionDriverEvent(BaseModel):
    event_id: str
    event_type: str
    occurred_at: datetime
    actor_id: str | None
    summary: str


class PnlTradeAttributionRow(BaseModel):
    trade_id: str
    attribution_category: str
    pnl_delta: float
    breakdown: PnlAttributionBreakdown
    driver_summary: str
    driver_events: list[PnlAttributionDriverEvent]
    from_valuation: PnlTradeValuation | None
    to_valuation: PnlTradeValuation | None


class PnlComparisonBridgeDay(BaseModel):
    from_as_of: date
    to_as_of: date
    delta: PnlHistorySummary
    attribution_summary: PnlAttributionBreakdown
    changed_trade_count: int
    top_driver_trade_id: str | None
    top_driver_category: str | None
    top_driver_pnl_delta: float | None
    top_driver_summary: str | None


class PnlComparisonReport(BaseModel):
    generated_at: datetime
    basis: str
    methodology: str
    from_as_of: date
    to_as_of: date
    from_snapshot: PnlHistorySummary
    to_snapshot: PnlHistorySummary
    delta: PnlHistorySummary
    attribution_summary: PnlAttributionBreakdown
    portfolio_deltas: list[PnlPortfolioComparisonRow]
    attributions: list[PnlTradeAttributionRow]
    daily_bridge: list[PnlComparisonBridgeDay]


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


TradingEodStatus = Literal["READY", "WARNING", "BLOCKED"]


class TradingEodCheck(BaseModel):
    key: str
    title: str
    status: TradingEodStatus
    owner_role: str
    reason: str
    supporting_metrics: dict[str, str | int | float | bool] = Field(default_factory=dict)


class TradingEodTradeSummary(BaseModel):
    active_trade_count: int
    priced_active_count: int
    pending_pricing_count: int
    pending_settlement_count: int
    tracked_book_count: int
    total_active_volume: float


class TradingEodPnlSummary(BaseModel):
    basis: str
    methodology: str
    total_pnl: float
    realized_pnl: float
    unrealized_pnl: float
    priced_trade_count: int
    realized_trade_count: int
    unrealized_trade_count: int


class TradingEodOperationsSummary(BaseModel):
    open_work_item_count: int
    operations_queue_count: int
    settlement_queue_count: int
    attention_count: int
    stale_pricing_count: int
    incomplete_ops_data_count: int


class TradingEodSettlementSummary(BaseModel):
    invoice_count: int
    overdue_invoice_count: int
    disputed_invoice_count: int
    blocked_exception_count: int
    warning_exception_count: int
    payment_due_count: int
    invoice_pending_count: int


class TradingEodProjectionSummary(BaseModel):
    structural_issue_count: int
    invariant_issue_count: int
    impacted_trade_count: int


class TradingEodAccrualSummary(BaseModel):
    row_count: int
    lot_count: int
    unbilled_amount_total: float
    billed_uncollected_amount_total: float
    net_open_amount_total: float
    coverage_basis: str


class TradingEodReport(BaseModel):
    generated_at: datetime
    business_date: date
    as_of: date
    evaluation_timestamp: datetime
    basis: str
    status: TradingEodStatus
    blocked_check_count: int
    warning_check_count: int
    ready_check_count: int
    checks: list[TradingEodCheck]
    coverage_notes: list[str] = Field(default_factory=list)
    trade_summary: TradingEodTradeSummary
    pnl_summary: TradingEodPnlSummary
    operations_summary: TradingEodOperationsSummary
    settlement_summary: TradingEodSettlementSummary
    projection_summary: TradingEodProjectionSummary
    accrual_summary: TradingEodAccrualSummary
