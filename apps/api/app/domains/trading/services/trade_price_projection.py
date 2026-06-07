from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.trade_price_term import TradePriceTerm


def sync_primary_price_term(
    db: Session,
    trade_id: str,
    pricing_type: str,
    fixed_price: object | None,
    price_index_code: str | None,
    currency_code: str | None,
    price_unit_code: str | None,
    timestamp: datetime,
) -> None:
    term = db.execute(
        select(TradePriceTerm).where(
            TradePriceTerm.trade_id == trade_id,
            TradePriceTerm.term_no == 1,
        )
    ).scalars().first()

    if term is None:
        term = TradePriceTerm(
            trade_price_term_id=str(uuid.uuid4()),
            trade_id=trade_id,
            term_no=1,
            pricing_type=pricing_type,
            fixed_price=fixed_price,
            price_index_code=price_index_code,
            currency_code=currency_code,
            price_unit_code=price_unit_code,
            created_at=timestamp,
            updated_at=timestamp,
        )
        db.add(term)
        return

    term.pricing_type = pricing_type
    term.fixed_price = fixed_price
    term.price_index_code = price_index_code
    term.currency_code = currency_code
    term.price_unit_code = price_unit_code
    term.updated_at = timestamp
