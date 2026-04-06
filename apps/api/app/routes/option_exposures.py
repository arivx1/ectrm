from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.schemas.option_exposure import OptionExposureOut

router = APIRouter(prefix="/option-exposures", tags=["option-exposures"])


@router.get("", response_model=List[OptionExposureOut])
def list_option_exposures(db: Session = Depends(get_db)) -> List[OptionExposureOut]:
    rows = db.execute(
        select(OptionExposure).order_by(
            OptionExposure.option_expiration_date.asc(),
            OptionExposure.trade_id.asc(),
        )
    ).scalars().all()

    return [
        OptionExposureOut(
            trade_id=row.trade_id,
            book=row.book,
            portfolio=row.portfolio,
            counterparty=row.counterparty,
            commodity_class=row.commodity_class,
            commodity=row.commodity,
            trade_side=row.trade_side,
            option_type=row.option_type,
            option_style=row.option_style,
            option_strike_price=float(row.option_strike_price) if row.option_strike_price is not None else None,
            option_expiration_date=row.option_expiration_date,
            contract_volume=float(row.contract_volume),
            premium_price=float(row.premium_price) if row.premium_price is not None else None,
            premium_cashflow=float(row.premium_cashflow) if row.premium_cashflow is not None else None,
            underlying_equivalent_volume=float(row.underlying_equivalent_volume),
            trade_currency_code=row.trade_currency_code,
            price_unit_code=row.price_unit_code,
            updated_at=row.updated_at,
        )
        for row in rows
    ]
