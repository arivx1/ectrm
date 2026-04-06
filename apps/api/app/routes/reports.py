from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.reports.services.pnl_history import build_pnl_history_report
from apps.api.app.domains.reports.services.overview import (
    build_activity_summary,
    build_exposure_summary,
    build_reporting_overview,
)
from apps.api.app.schemas.report import (
    ActivitySummaryRow,
    ExposureSummaryRow,
    PnlHistoryReport,
    ReportingOverview,
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/exposure-summary", response_model=list[ExposureSummaryRow])
def get_exposure_summary(db: Session = Depends(get_db)) -> list[ExposureSummaryRow]:
    return [ExposureSummaryRow(**row) for row in build_exposure_summary(db)]


@router.get("/activity-summary", response_model=list[ActivitySummaryRow])
def get_activity_summary(db: Session = Depends(get_db)) -> list[ActivitySummaryRow]:
    return [ActivitySummaryRow(**row) for row in build_activity_summary(db)]


@router.get("/overview", response_model=ReportingOverview)
def get_reporting_overview(db: Session = Depends(get_db)) -> ReportingOverview:
    return ReportingOverview(**build_reporting_overview(db))


@router.get("/pnl-history", response_model=PnlHistoryReport)
def get_pnl_history(db: Session = Depends(get_db)) -> PnlHistoryReport:
    return PnlHistoryReport(**build_pnl_history_report(db))
