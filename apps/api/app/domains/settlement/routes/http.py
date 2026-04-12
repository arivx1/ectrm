from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_settlement_role
from apps.api.app.core.http import NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.routes.framework import build_role_mutation_spec
from apps.api.app.domains.operations.routes.framework import execute_operational_mutation
from apps.api.app.domains.operations.routes.framework import execute_operational_patch_mutation
from apps.api.app.domains.operations.routes.framework import execute_operational_query_spec
from apps.api.app.domains.operations.routes.framework import OperationalQuerySpec
from apps.api.app.domains.operations.services.settlement_invoices import issue_trade_invoice
from apps.api.app.domains.operations.services.settlement_invoices import list_trade_invoices
from apps.api.app.domains.operations.services.settlement_invoices import update_trade_invoice
from apps.api.app.domains.operations.services.settlement_payments import create_trade_payment
from apps.api.app.domains.operations.services.settlement_payments import list_trade_payments
from apps.api.app.domains.operations.services.settlement_payments import update_trade_payment
from apps.api.app.schemas.settlement import TradeInvoiceCreate
from apps.api.app.schemas.settlement import TradeInvoiceOut
from apps.api.app.schemas.settlement import TradeInvoiceUpdate
from apps.api.app.schemas.settlement import TradePaymentCreate
from apps.api.app.schemas.settlement import TradePaymentOut
from apps.api.app.schemas.settlement import TradePaymentUpdate

router = APIRouter(prefix="/settlement", tags=["settlement"])

SETTLEMENT_RESOURCE_MUTATION_SPEC = build_role_mutation_spec(
    predicate=is_settlement_role,
    detail="Only ACCOUNTING, ACCOUNTANT, SETTLEMENT, OPS_ADMIN, or ADMIN sessions can manage settlement.",
    handled_exceptions=NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES,
)
INVOICE_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_trade_invoices)
PAYMENT_LIST_QUERY_SPEC = OperationalQuerySpec(load=list_trade_payments)


@router.get("/invoices", response_model=list[TradeInvoiceOut])
def get_trade_invoices(
    trade_id: str | None = Query(default=None),
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[TradeInvoiceOut]:
    return execute_operational_query_spec(
        INVOICE_LIST_QUERY_SPEC,
        db,
        trade_id=trade_id,
        limit=limit,
        offset=offset,
    )


@router.post("/invoices", response_model=TradeInvoiceOut, status_code=status.HTTP_201_CREATED)
def post_trade_invoice(
    payload: TradeInvoiceCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeInvoiceOut:
    return execute_operational_mutation(
        SETTLEMENT_RESOURCE_MUTATION_SPEC,
        request,
        db,
        lambda actor: issue_trade_invoice(
            db,
            trade_id=payload.trade_id,
            actor_id=actor.actor_id,
            leg_no=payload.leg_no,
            invoice_number=payload.invoice_number,
            invoice_currency_code=payload.invoice_currency_code,
            billed_quantity=payload.billed_quantity,
            invoice_amount=payload.invoice_amount,
            issued_at=payload.issued_at,
            due_at=payload.due_at,
            notes=payload.notes,
        )
    )


@router.patch("/invoices/{invoice_id}", response_model=TradeInvoiceOut)
def patch_trade_invoice(
    invoice_id: int,
    payload: TradeInvoiceUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeInvoiceOut:
    return execute_operational_patch_mutation(
        SETTLEMENT_RESOURCE_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_trade_invoice(
            db,
            invoice_id=invoice_id,
            actor_id=actor.actor_id,
            changes=changes,
        )
    )


@router.get("/payments", response_model=list[TradePaymentOut])
def get_trade_payments(
    trade_id: str | None = Query(default=None),
    invoice_id: int | None = Query(default=None),
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    offset: int = LIST_OFFSET_QUERY,
    db: Session = Depends(get_db),
) -> list[TradePaymentOut]:
    return execute_operational_query_spec(
        PAYMENT_LIST_QUERY_SPEC,
        db,
        trade_id=trade_id,
        invoice_id=invoice_id,
        limit=limit,
        offset=offset,
    )


@router.post("/payments", response_model=TradePaymentOut, status_code=status.HTTP_201_CREATED)
def post_trade_payment(
    payload: TradePaymentCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradePaymentOut:
    return execute_operational_mutation(
        SETTLEMENT_RESOURCE_MUTATION_SPEC,
        request,
        db,
        lambda actor: create_trade_payment(
            db,
            invoice_id=payload.invoice_id,
            actor_id=actor.actor_id,
            payment_reference=payload.payment_reference,
            payment_currency_code=payload.payment_currency_code,
            payment_amount=payload.payment_amount,
            status=payload.status,
            due_at=payload.due_at,
            received_at=payload.received_at,
            notes=payload.notes,
        )
    )


@router.patch("/payments/{payment_id}", response_model=TradePaymentOut)
def patch_trade_payment(
    payment_id: int,
    payload: TradePaymentUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradePaymentOut:
    return execute_operational_patch_mutation(
        SETTLEMENT_RESOURCE_MUTATION_SPEC,
        payload,
        request,
        db,
        lambda actor, changes: update_trade_payment(
            db,
            payment_id=payment_id,
            actor_id=actor.actor_id,
            changes=changes,
        )
    )


__all__ = [
    "router",
    "get_trade_invoices",
    "post_trade_invoice",
    "patch_trade_invoice",
    "get_trade_payments",
    "post_trade_payment",
    "patch_trade_payment",
]
