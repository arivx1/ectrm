from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_payload_normalization import normalize_optional_text
from apps.api.app.domains.trading.services.trade_unit_defaults import (
    default_price_unit_code,
    default_quantity_unit_code,
)
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit


def require_active_unit(db: Session, unit_code: object | None) -> str | None:
    normalized_unit_code = normalize_optional_text(unit_code, uppercase=True)
    if normalized_unit_code is None:
        return None

    reference_unit = db.execute(
        select(ReferenceUnit).where(
            ReferenceUnit.code == normalized_unit_code,
            ReferenceUnit.is_active.is_(True),
        )
    ).scalars().first()
    if reference_unit is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unit '{normalized_unit_code}' is not active in reference data",
        )

    return normalized_unit_code


def resolve_trade_quantity_unit(
    db: Session,
    unit_code: object | None,
    *,
    commodity_class: object | None,
    commodity: object | None,
    price_index_code: object | None = None,
) -> str:
    resolved_unit_code = _first_active_unit(
        db,
        unit_code,
        default_quantity_unit_code(
            commodity_class=commodity_class,
            commodity=commodity,
        ),
        _active_price_index_unit(db, price_index_code),
    )
    if resolved_unit_code is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unit of measure is required and could not be inferred from commodity reference data.",
        )
    return resolved_unit_code


def resolve_trade_price_unit(
    db: Session,
    unit_code: object | None,
    *,
    commodity_class: object | None,
    commodity: object | None,
    price_index_code: object | None = None,
) -> str:
    resolved_unit_code = _first_active_unit(
        db,
        unit_code,
        _active_price_index_unit(db, price_index_code),
        default_price_unit_code(
            commodity_class=commodity_class,
            commodity=commodity,
            price_index_code=price_index_code,
        ),
    )
    if resolved_unit_code is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Price unit is required and could not be inferred from commodity or price index reference data.",
        )
    return resolved_unit_code


def _active_price_index_unit(db: Session, price_index_code: object | None) -> str | None:
    normalized_price_index_code = normalize_optional_text(price_index_code, uppercase=True)
    if normalized_price_index_code is None:
        return None

    reference_price_index = db.execute(
        select(ReferencePriceIndex.unit_code).where(
            ReferencePriceIndex.code == normalized_price_index_code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalar_one_or_none()
    return normalize_optional_text(reference_price_index, uppercase=True)


def _first_active_unit(db: Session, *candidates: object | None) -> str | None:
    for candidate in candidates:
        unit_code = require_active_unit(db, candidate)
        if unit_code is not None:
            return unit_code
    return None
