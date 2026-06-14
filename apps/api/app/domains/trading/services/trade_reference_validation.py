from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.counterparty_standards import (
    counterparty_credit_status_allows_trading,
)
from apps.api.app.domains.reference_data.services.counterparty_standards import (
    normalize_counterparty_credit_status,
)
from apps.api.app.domains.trading.services.trade_payload_normalization import (
    normalize_commodity_code,
    normalize_optional_text,
    normalize_price_index_code,
    normalize_pricing_type,
)
from apps.api.app.domains.trading.services.trade_unit_resolution import (
    require_active_unit,
    resolve_trade_price_unit,
    resolve_trade_quantity_unit,
)
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.shared.enums import PricingType


def require_active_book(db: Session, book_code: object | None) -> str:
    normalized_book_code = str(book_code or "").strip().upper()
    if not normalized_book_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Book is required and must be selected from reference data",
        )

    reference_book = db.execute(
        select(ReferenceBook).where(
            ReferenceBook.code == normalized_book_code,
            ReferenceBook.is_active.is_(True),
        )
    ).scalars().first()
    if reference_book is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Book '{normalized_book_code}' is not active in reference data",
        )

    return normalized_book_code


def require_active_commodity(
    db: Session,
    commodity_class: object | None,
    commodity_code: object | None,
) -> tuple[str, str]:
    normalized_class = normalize_commodity_code(commodity_class)
    normalized_code = normalize_commodity_code(commodity_code)
    if not normalized_class:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Commodity class is required and must be selected from reference data",
        )
    if not normalized_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Commodity is required and must be selected from reference data",
        )

    reference_commodity = db.execute(
        select(ReferenceCommodity).where(
            ReferenceCommodity.commodity_class == normalized_class,
            ReferenceCommodity.code == normalized_code,
            ReferenceCommodity.is_active.is_(True),
        )
    ).scalars().first()
    if reference_commodity is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Commodity '{normalized_code}' is not active in commodity class "
                f"'{normalized_class}'"
            ),
        )

    return normalized_class, normalized_code


def require_active_counterparty(db: Session, counterparty_code: object | None) -> str | None:
    normalized_counterparty_code = normalize_optional_text(counterparty_code, uppercase=True)
    if normalized_counterparty_code is None:
        return None

    reference_counterparty = db.execute(
        select(ReferenceCounterparty).where(
            ReferenceCounterparty.code == normalized_counterparty_code,
            ReferenceCounterparty.is_active.is_(True),
        )
    ).scalars().first()
    if reference_counterparty is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Counterparty '{normalized_counterparty_code}' is not active in reference data",
        )
    if not counterparty_credit_status_allows_trading(reference_counterparty.credit_status):
        normalized_credit_status = normalize_counterparty_credit_status(
            reference_counterparty.credit_status
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Counterparty '{normalized_counterparty_code}' is not tradable because "
                f"credit status is '{normalized_credit_status}'. Set it to APPROVED before "
                f"booking or amending trades."
            ),
        )

    return normalized_counterparty_code


def require_active_portfolio(
    db: Session,
    portfolio_code: object | None,
    *,
    book_code: str,
) -> str | None:
    normalized_portfolio_code = normalize_optional_text(portfolio_code, uppercase=True)
    if normalized_portfolio_code is None:
        return None

    reference_portfolio = db.execute(
        select(ReferencePortfolio).where(
            ReferencePortfolio.code == normalized_portfolio_code,
            ReferencePortfolio.is_active.is_(True),
        )
    ).scalars().first()
    if reference_portfolio is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Portfolio '{normalized_portfolio_code}' is not active in reference data",
        )
    if reference_portfolio.book_code != book_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Portfolio '{normalized_portfolio_code}' belongs to book "
                f"'{reference_portfolio.book_code}', not '{book_code}'"
            ),
        )

    return normalized_portfolio_code


def require_active_price_index(
    db: Session,
    pricing_type: object | None,
    price_index_code: object | None,
) -> tuple[str, str | None]:
    normalized_pricing_type = normalize_pricing_type(pricing_type)
    normalized_price_index_code = normalize_price_index_code(price_index_code)

    if normalized_pricing_type in {PricingType.INDEX.value, PricingType.HYBRID.value}:
        if normalized_price_index_code is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Price index is required when pricing type is INDEX or HYBRID",
            )
    if normalized_price_index_code is None:
        return normalized_pricing_type, None

    reference_price_index = db.execute(
        select(ReferencePriceIndex).where(
            ReferencePriceIndex.code == normalized_price_index_code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalars().first()
    if reference_price_index is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Price index '{normalized_price_index_code}' is not active",
        )

    return normalized_pricing_type, normalized_price_index_code


def require_active_currency(db: Session, currency_code: object | None) -> str | None:
    normalized_currency_code = normalize_optional_text(currency_code, uppercase=True)
    if normalized_currency_code is None:
        return None

    reference_currency = db.execute(
        select(ReferenceCurrency).where(
            ReferenceCurrency.code == normalized_currency_code,
            ReferenceCurrency.is_active.is_(True),
        )
    ).scalars().first()
    if reference_currency is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Currency '{normalized_currency_code}' is not active in reference data",
        )

    return normalized_currency_code


def require_active_location(db: Session, location_code: object | None) -> str | None:
    normalized_location_code = normalize_optional_text(location_code, uppercase=True)
    if normalized_location_code is None:
        return None

    reference_location = db.execute(
        select(ReferenceLocation).where(
            ReferenceLocation.code == normalized_location_code,
            ReferenceLocation.is_active.is_(True),
        )
    ).scalars().first()
    if reference_location is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Location '{normalized_location_code}' is not active in reference data",
        )

    return normalized_location_code
