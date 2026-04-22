from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.accruals.services.accruals import (
    build_accrual_reconciliation_report,
    list_accrual_entries,
    list_accrual_lots,
)
from apps.api.app.schemas.accrual import (
    AccrualEntryOut,
    AccrualLotOut,
    AccrualReconciliationReport,
)

router = APIRouter(prefix="/accruals", tags=["accruals"])


@router.get("/lots", response_model=list[AccrualLotOut])
def get_accrual_lots(
    trade_id: str | None = Query(default=None),
    delivery_id: str | None = Query(default=None),
    book: str | None = Query(default=None),
    portfolio: str | None = Query(default=None),
    counterparty: str | None = Query(default=None),
    commodity_class: str | None = Query(default=None),
    accrual_currency_code: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[AccrualLotOut]:
    return [
        AccrualLotOut(**row)
        for row in list_accrual_lots(
            db,
            trade_id=trade_id,
            delivery_id=delivery_id,
            book=book,
            portfolio=portfolio,
            counterparty=counterparty,
            commodity_class=commodity_class,
            accrual_currency_code=accrual_currency_code,
            status_filter=status_filter,
            limit=limit,
            offset=offset,
        )
    ]


@router.get("/lots/{accrual_lot_id}/entries", response_model=list[AccrualEntryOut])
def get_accrual_entries(
    accrual_lot_id: str,
    db: Session = Depends(get_db),
) -> list[AccrualEntryOut]:
    try:
        return [AccrualEntryOut(**row) for row in list_accrual_entries(db, accrual_lot_id=accrual_lot_id)]
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/reconciliation", response_model=AccrualReconciliationReport)
def get_accrual_reconciliation(
    trade_id: str | None = Query(default=None),
    delivery_id: str | None = Query(default=None),
    book: str | None = Query(default=None),
    portfolio: str | None = Query(default=None),
    counterparty: str | None = Query(default=None),
    commodity_class: str | None = Query(default=None),
    accrual_currency_code: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> AccrualReconciliationReport:
    return AccrualReconciliationReport(
        **build_accrual_reconciliation_report(
            db,
            trade_id=trade_id,
            delivery_id=delivery_id,
            book=book,
            portfolio=portfolio,
            counterparty=counterparty,
            commodity_class=commodity_class,
            accrual_currency_code=accrual_currency_code,
            status_filter=status_filter,
        )
    )
