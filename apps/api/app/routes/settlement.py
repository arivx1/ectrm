from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
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


def _require_authenticated_actor(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return actor_id


def _provided_fields(payload: TradeInvoiceUpdate) -> set[str]:
    if hasattr(payload, "model_fields_set"):
        return set(payload.model_fields_set)
    return set(getattr(payload, "__fields_set__", set()))


@router.get("/invoices", response_model=list[TradeInvoiceOut])
def get_trade_invoices(
    trade_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[TradeInvoiceOut]:
    try:
        return list_trade_invoices(db, trade_id=trade_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("/invoices", response_model=TradeInvoiceOut, status_code=status.HTTP_201_CREATED)
def post_trade_invoice(
    payload: TradeInvoiceCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeInvoiceOut:
    actor_id = _require_authenticated_actor(request)
    try:
        invoice = issue_trade_invoice(
            db,
            trade_id=payload.trade_id,
            actor_id=actor_id,
            invoice_number=payload.invoice_number,
            invoice_currency_code=payload.invoice_currency_code,
            invoice_amount=payload.invoice_amount,
            issued_at=payload.issued_at,
            due_at=payload.due_at,
            notes=payload.notes,
        )
        db.commit()
        return invoice
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.patch("/invoices/{invoice_id}", response_model=TradeInvoiceOut)
def patch_trade_invoice(
    invoice_id: int,
    payload: TradeInvoiceUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradeInvoiceOut:
    actor_id = _require_authenticated_actor(request)
    changes = {field: getattr(payload, field) for field in _provided_fields(payload)}
    try:
        invoice = update_trade_invoice(
            db,
            invoice_id=invoice_id,
            actor_id=actor_id,
            changes=changes,
        )
        db.commit()
        return invoice
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.get("/payments", response_model=list[TradePaymentOut])
def get_trade_payments(
    trade_id: str | None = Query(default=None),
    invoice_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[TradePaymentOut]:
    try:
        return list_trade_payments(db, trade_id=trade_id, invoice_id=invoice_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("/payments", response_model=TradePaymentOut, status_code=status.HTTP_201_CREATED)
def post_trade_payment(
    payload: TradePaymentCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradePaymentOut:
    actor_id = _require_authenticated_actor(request)
    try:
        payment = create_trade_payment(
            db,
            invoice_id=payload.invoice_id,
            actor_id=actor_id,
            payment_reference=payload.payment_reference,
            payment_currency_code=payload.payment_currency_code,
            payment_amount=payload.payment_amount,
            status=payload.status,
            due_at=payload.due_at,
            received_at=payload.received_at,
            notes=payload.notes,
        )
        db.commit()
        return payment
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.patch("/payments/{payment_id}", response_model=TradePaymentOut)
def patch_trade_payment(
    payment_id: int,
    payload: TradePaymentUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> TradePaymentOut:
    actor_id = _require_authenticated_actor(request)
    changes = {field: getattr(payload, field) for field in _provided_fields(payload)}
    try:
        payment = update_trade_payment(
            db,
            payment_id=payment_id,
            actor_id=actor_id,
            changes=changes,
        )
        db.commit()
        return payment
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise
