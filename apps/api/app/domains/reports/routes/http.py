from __future__ import annotations

"""Domain-owned HTTP routes for reporting APIs."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from apps.api.app.core.http import authenticated_actor_role
from apps.api.app.core.http import execute_http_action
from apps.api.app.core.http import require_authenticated_actor
from apps.api.app.core.http import VALIDATION_ERROR_STATUS_CODES
from apps.api.app.deps.db import get_db
from apps.api.app.domains.reports.services.counterparty_credit import (
    build_counterparty_credit_report,
)
from apps.api.app.domains.reports.services.pnl_history import (
    build_pnl_comparison_report,
    build_pnl_history_report,
)
from apps.api.app.domains.reports.services.overview import (
    build_activity_summary,
    build_exposure_summary,
    build_reporting_overview,
)
from apps.api.app.domains.reports.services.semantic_datasets import (
    get_semantic_dataset_definition,
    list_semantic_dataset_definitions,
)
from apps.api.app.domains.reports.services.settlement import (
    build_cash_forecast_report,
    build_settlement_exception_report,
    build_settlement_filter_options,
    build_settlement_aging_report,
)
from apps.api.app.domains.reports.services.trading_eod import (
    build_trading_eod_report,
)
from apps.api.app.domains.reports.services.settlement_presets import (
    SettlementReportPresetConflictError,
    SettlementReportPresetNotFoundError,
    SettlementReportPresetPermissionError,
    create_settlement_report_preset,
    delete_settlement_report_preset,
    list_visible_settlement_presets,
    to_settlement_preset_out,
    update_settlement_report_preset,
)
from apps.api.app.schemas.report import (
    ActivitySummaryRow,
    CashForecastReport,
    CounterpartyCreditReportRow,
    ExposureSummaryRow,
    PnlHistoryReport,
    PnlComparisonReport,
    ReportingOverview,
    SemanticDatasetDefinition,
    SettlementReportFilterOptions,
    SettlementReportFilters,
    SettlementReportPresetCreate,
    SettlementReportPresetOut,
    SettlementReportPresetUpdate,
    SettlementExceptionReport,
    SettlementAgingReport,
    TradingEodReport,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _parse_settlement_common_filters(
    book: str | None = Query(default=None),
    counterparty: str | None = Query(default=None),
    currency: str | None = Query(default=None),
) -> SettlementReportFilters:
    try:
        return SettlementReportFilters(
            book=book,
            counterparty=counterparty,
            currency=currency,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc


def _parse_settlement_exception_filters(
    book: str | None = Query(default=None),
    counterparty: str | None = Query(default=None),
    currency: str | None = Query(default=None),
    exception_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
) -> SettlementReportFilters:
    try:
        return SettlementReportFilters(
            book=book,
            counterparty=counterparty,
            currency=currency,
            exception_type=exception_type,
            severity=severity,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc


@router.get("/datasets", response_model=list[SemanticDatasetDefinition])
def get_semantic_datasets() -> list[SemanticDatasetDefinition]:
    return list_semantic_dataset_definitions()


@router.get("/datasets/{dataset_id}/schema", response_model=SemanticDatasetDefinition)
def get_semantic_dataset_schema(dataset_id: str) -> SemanticDatasetDefinition:
    definition = get_semantic_dataset_definition(dataset_id)
    if definition is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Semantic dataset '{dataset_id}' was not found.",
        )
    return definition


@router.get("/exposure-summary", response_model=list[ExposureSummaryRow])
def get_exposure_summary(db: Session = Depends(get_db)) -> list[ExposureSummaryRow]:
    return [ExposureSummaryRow(**row) for row in build_exposure_summary(db)]


@router.get("/activity-summary", response_model=list[ActivitySummaryRow])
def get_activity_summary(db: Session = Depends(get_db)) -> list[ActivitySummaryRow]:
    return [ActivitySummaryRow(**row) for row in build_activity_summary(db)]


@router.get("/overview", response_model=ReportingOverview)
def get_reporting_overview(db: Session = Depends(get_db)) -> ReportingOverview:
    return ReportingOverview(**build_reporting_overview(db))


@router.get("/counterparty-credit", response_model=list[CounterpartyCreditReportRow])
def get_counterparty_credit_report(
    db: Session = Depends(get_db),
) -> list[CounterpartyCreditReportRow]:
    return [CounterpartyCreditReportRow(**row) for row in build_counterparty_credit_report(db)]


@router.get("/pnl-history", response_model=PnlHistoryReport)
def get_pnl_history(
    as_of: date | None = Query(default=None),
    book: str | None = Query(default=None),
    portfolio: str | None = Query(default=None),
    commodity_class: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> PnlHistoryReport:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be on or before date_to",
        )

    return PnlHistoryReport(
        **build_pnl_history_report(
            db,
            as_of=as_of,
            book=book,
            portfolio=portfolio,
            commodity_class=commodity_class,
            date_from=date_from,
            date_to=date_to,
        )
    )


@router.get("/pnl-compare", response_model=PnlComparisonReport)
def get_pnl_comparison(
    from_as_of: date = Query(...),
    to_as_of: date = Query(...),
    book: str | None = Query(default=None),
    portfolio: str | None = Query(default=None),
    commodity_class: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> PnlComparisonReport:
    if from_as_of > to_as_of:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_as_of must be on or before to_as_of",
        )

    return PnlComparisonReport(
        **build_pnl_comparison_report(
            db,
            from_as_of=from_as_of,
            to_as_of=to_as_of,
            book=book,
            portfolio=portfolio,
            commodity_class=commodity_class,
        )
    )


@router.get("/settlement-aging", response_model=SettlementAgingReport)
def get_settlement_aging_report(
    as_of: date | None = Query(default=None),
    filters: SettlementReportFilters = Depends(_parse_settlement_common_filters),
    db: Session = Depends(get_db),
) -> SettlementAgingReport:
    return SettlementAgingReport(
        **build_settlement_aging_report(
            db,
            as_of=as_of,
            book=filters.book,
            counterparty=filters.counterparty,
            currency=filters.currency,
        )
    )


@router.get("/cash-forecast", response_model=CashForecastReport)
def get_cash_forecast(
    as_of: date | None = Query(default=None),
    horizon_days: int = Query(default=30),
    filters: SettlementReportFilters = Depends(_parse_settlement_common_filters),
    db: Session = Depends(get_db),
) -> CashForecastReport:
    def build_cash_forecast() -> CashForecastReport:
        return CashForecastReport(
            **build_cash_forecast_report(
                db,
                as_of=as_of,
                horizon_days=horizon_days,
                book=filters.book,
                counterparty=filters.counterparty,
                currency=filters.currency,
            )
        )

    return execute_http_action(
        db,
        build_cash_forecast,
        handled_exceptions=VALIDATION_ERROR_STATUS_CODES,
    )


@router.get("/settlement-exceptions", response_model=SettlementExceptionReport)
def get_settlement_exceptions(
    as_of: date | None = Query(default=None),
    filters: SettlementReportFilters = Depends(_parse_settlement_exception_filters),
    db: Session = Depends(get_db),
) -> SettlementExceptionReport:
    return SettlementExceptionReport(
        **build_settlement_exception_report(
            db,
            as_of=as_of,
            book=filters.book,
            counterparty=filters.counterparty,
            currency=filters.currency,
            exception_type_filter=filters.exception_type,
            severity_filter=filters.severity,
        )
    )


@router.get("/settlement-filter-options", response_model=SettlementReportFilterOptions)
def get_settlement_filter_options(
    as_of: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> SettlementReportFilterOptions:
    return SettlementReportFilterOptions(**build_settlement_filter_options(db, as_of=as_of))


@router.get("/trading-eod", response_model=TradingEodReport)
def get_trading_eod_report(
    business_date: date | None = Query(default=None),
    as_of: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> TradingEodReport:
    if business_date is not None and as_of is not None and as_of < business_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="as_of must be on or after business_date",
        )

    return TradingEodReport(
        **build_trading_eod_report(
            db,
            business_date=business_date,
            as_of=as_of,
        )
    )


@router.get("/settlement-presets", response_model=list[SettlementReportPresetOut])
def get_settlement_presets(
    request: Request,
    db: Session = Depends(get_db),
) -> list[SettlementReportPresetOut]:
    actor_id = require_authenticated_actor(request)
    actor_role = authenticated_actor_role(request)
    records = list_visible_settlement_presets(db, actor_id=actor_id)
    return [
        to_settlement_preset_out(record, actor_id=actor_id, actor_role=actor_role)
        for record in records
    ]


@router.post("/settlement-presets", response_model=SettlementReportPresetOut, status_code=status.HTTP_201_CREATED)
def create_settlement_preset(
    payload: SettlementReportPresetCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> SettlementReportPresetOut:
    actor_id = require_authenticated_actor(request)
    actor_role = authenticated_actor_role(request)
    try:
        record = create_settlement_report_preset(
            db,
            owner_user_id=actor_id,
            payload=payload,
        )
    except SettlementReportPresetConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return to_settlement_preset_out(record, actor_id=actor_id, actor_role=actor_role)


@router.patch("/settlement-presets/{preset_id}", response_model=SettlementReportPresetOut)
def update_settlement_preset(
    preset_id: int,
    payload: SettlementReportPresetUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> SettlementReportPresetOut:
    actor_id = require_authenticated_actor(request)
    actor_role = authenticated_actor_role(request)
    try:
        record = update_settlement_report_preset(
            db,
            actor_id=actor_id,
            actor_role=actor_role,
            preset_id=preset_id,
            payload=payload,
        )
    except SettlementReportPresetNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except SettlementReportPresetPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except SettlementReportPresetConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return to_settlement_preset_out(record, actor_id=actor_id, actor_role=actor_role)


@router.delete("/settlement-presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_settlement_preset(
    preset_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    actor_id = require_authenticated_actor(request)
    actor_role = authenticated_actor_role(request)
    try:
        delete_settlement_report_preset(
            db,
            actor_id=actor_id,
            actor_role=actor_role,
            preset_id=preset_id,
        )
    except SettlementReportPresetPermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
