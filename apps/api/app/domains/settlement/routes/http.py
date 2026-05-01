from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from apps.api.app.core.auth import is_settlement_role
from apps.api.app.core.http import NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES
from apps.api.app.core.query_params import LIST_OFFSET_QUERY, STANDARD_LIST_LIMIT_QUERY
from apps.api.app.deps.db import get_db
from apps.api.app.domains.operations.routes.framework import build_role_mutation_spec
from apps.api.app.domains.operations.routes.framework import execute_operational_mutation
from apps.api.app.domains.operations.routes.framework import execute_operational_patch_mutation
from apps.api.app.domains.operations.routes.framework import execute_operational_query
from apps.api.app.domains.operations.routes.framework import execute_operational_query_spec
from apps.api.app.domains.operations.routes.framework import OperationalQuerySpec
from apps.api.app.domains.operations.services.settlement_invoices import count_invoice_issue_candidates
from apps.api.app.domains.operations.services.settlement_invoices import issue_trade_invoice
from apps.api.app.domains.operations.services.settlement_invoices import list_invoice_issue_candidates
from apps.api.app.domains.operations.services.settlement_invoices import list_trade_invoices
from apps.api.app.domains.operations.services.settlement_invoices import update_trade_invoice
from apps.api.app.domains.operations.services.settlement_invoices import void_trade_invoice
from apps.api.app.domains.operations.services.settlement_payments import create_trade_payment
from apps.api.app.domains.operations.services.settlement_payments import list_trade_payments
from apps.api.app.domains.operations.services.settlement_payments import reverse_trade_payment
from apps.api.app.domains.operations.services.settlement_payments import update_trade_payment
from apps.api.app.schemas.settlement import InvoiceIssueCandidateListOut
from apps.api.app.schemas.settlement import InvoiceIssueCandidateOut
from apps.api.app.schemas.settlement import TradeInvoiceCreate
from apps.api.app.schemas.settlement import TradeInvoiceOut
from apps.api.app.schemas.settlement import TradeInvoiceUpdate
from apps.api.app.schemas.settlement import TradeInvoiceVoid
from apps.api.app.schemas.settlement import TradePaymentCreate
from apps.api.app.schemas.settlement import TradePaymentOut
from apps.api.app.schemas.settlement import TradePaymentReverse
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


def _to_invoice_issue_candidate_out(candidate) -> InvoiceIssueCandidateOut:
    return InvoiceIssueCandidateOut(
        trade_id=candidate.trade_id,
        trade_nature=candidate.trade_nature,
        book=candidate.book,
        portfolio=candidate.portfolio,
        counterparty=candidate.counterparty,
        commodity_class=candidate.commodity_class,
        commodity=candidate.commodity,
        trader_user=candidate.trader_user,
        trade_date=candidate.trade_date,
        execution_timestamp=candidate.execution_timestamp,
        delivery_start=candidate.delivery_start,
        delivery_end=candidate.delivery_end,
        trade_currency_code=candidate.trade_currency_code,
        invoice_status=candidate.invoice_status,
        payment_status=candidate.payment_status,
        settlement_status=candidate.settlement_status,
        notional_amount=float(candidate.notional_amount) if candidate.notional_amount is not None else None,
        age_days=candidate.age_days,
        readiness_status=candidate.readiness_status,
        priority_reason=candidate.priority_reason,
        preview_summary=candidate.preview_summary,
        blocking_reasons=list(candidate.blocking_reasons),
        assumptions=list(candidate.assumptions),
        recommended_action=jsonable_encoder(candidate.recommended_action),
    )


@router.get("/invoice-issue-candidates", response_model=InvoiceIssueCandidateListOut)
def get_invoice_issue_candidates(
    ready_only: bool = Query(default=False),
    limit: int = STANDARD_LIST_LIMIT_QUERY,
    db: Session = Depends(get_db),
) -> InvoiceIssueCandidateListOut:
    def _load() -> InvoiceIssueCandidateListOut:
        rows = list_invoice_issue_candidates(db, limit=None)
        if ready_only:
            rows = [row for row in rows if row.readiness_status == "READY"]
        rows = rows[:limit]
        ready_count = sum(1 for row in rows if row.readiness_status == "READY")
        blocked_count = sum(1 for row in rows if row.readiness_status == "BLOCKED")
        return InvoiceIssueCandidateListOut(
            count=len(rows),
            total_count=count_invoice_issue_candidates(db),
            ready_count=ready_count,
            blocked_count=blocked_count,
            items=[_to_invoice_issue_candidate_out(row) for row in rows],
        )

    return execute_operational_query(db, _load)


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


@router.post("/invoices/{invoice_id}/void", response_model=TradeInvoiceOut)
def post_trade_invoice_void(
    invoice_id: int,
    payload: TradeInvoiceVoid,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeInvoiceOut:
    return execute_operational_mutation(
        SETTLEMENT_RESOURCE_MUTATION_SPEC,
        request,
        db,
        lambda actor: void_trade_invoice(
            db,
            invoice_id=invoice_id,
            actor_id=actor.actor_id,
            void_reason=payload.void_reason,
            notes=payload.notes,
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


@router.post("/payments/{payment_id}/reverse", response_model=TradePaymentOut)
def post_trade_payment_reverse(
    payment_id: int,
    payload: TradePaymentReverse,
    request: Request,
    db: Session = Depends(get_db),
) -> TradePaymentOut:
    return execute_operational_mutation(
        SETTLEMENT_RESOURCE_MUTATION_SPEC,
        request,
        db,
        lambda actor: reverse_trade_payment(
            db,
            payment_id=payment_id,
            actor_id=actor.actor_id,
            reversal_reason=payload.reversal_reason,
            payment_reference=payload.payment_reference,
            reversed_at=payload.reversed_at,
            notes=payload.notes,
        )
    )


__all__ = [
    "router",
    "get_trade_invoices",
    "post_trade_invoice",
    "patch_trade_invoice",
    "post_trade_invoice_void",
    "get_trade_payments",
    "post_trade_payment",
    "patch_trade_payment",
    "post_trade_payment_reverse",
]
