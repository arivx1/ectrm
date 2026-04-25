from __future__ import annotations

from fastapi import APIRouter

from apps.api.app.routes.reference_data_routes.assets import (
    activate_asset,
    create_asset,
    deactivate_asset,
    get_asset,
    list_asset_standards,
    list_assets,
    router as assets_router,
    update_asset,
)
from apps.api.app.routes.reference_data_routes.books import (
    activate_book,
    create_book,
    deactivate_book,
    get_book,
    list_books,
    router as books_router,
    update_book,
)
from apps.api.app.routes.reference_data_routes.commodities import (
    activate_commodity,
    create_commodity,
    deactivate_commodity,
    get_commodity,
    list_commodities,
    router as commodities_router,
    update_commodity,
)
from apps.api.app.routes.reference_data_routes.common import (
    ensure_active_book_exists,
    ensure_active_commodity_exists,
    ensure_active_currency_exists,
    ensure_active_location_exists,
    ensure_active_unit_exists,
    ensure_book_not_in_active_use,
    ensure_commodity_not_in_active_use,
    ensure_currency_not_in_active_use,
    ensure_location_not_in_active_use,
    ensure_price_index_not_in_active_use,
    ensure_unit_not_in_active_use,
    to_out,
)
from apps.api.app.routes.reference_data_routes.counterparties import (
    activate_counterparty,
    create_counterparty,
    deactivate_counterparty,
    get_counterparty,
    list_counterparties,
    list_counterparty_credit_profiles,
    list_counterparty_external_credit_snapshots,
    list_counterparty_standards,
    promote_counterparty_external_credit_snapshot,
    router as counterparties_router,
    update_counterparty,
    upsert_counterparty_credit_profile,
)
from apps.api.app.routes.reference_data_routes.currencies import (
    activate_currency,
    create_currency,
    deactivate_currency,
    get_currency,
    list_currencies,
    router as currencies_router,
    update_currency,
)
from apps.api.app.routes.reference_data_routes.locations import (
    activate_location,
    create_location,
    deactivate_location,
    get_location,
    list_location_standards,
    list_locations,
    router as locations_router,
    update_location,
)
from apps.api.app.routes.reference_data_routes.portfolios import (
    activate_portfolio,
    create_portfolio,
    deactivate_portfolio,
    get_portfolio,
    list_portfolios,
    router as portfolios_router,
    update_portfolio,
)
from apps.api.app.routes.reference_data_routes.price_indices import (
    activate_price_index,
    create_price_index,
    deactivate_price_index,
    get_price_index,
    list_price_indices,
    router as price_indices_router,
    update_price_index,
)
from apps.api.app.routes.reference_data_routes.units import (
    activate_unit,
    create_unit,
    deactivate_unit,
    get_unit,
    list_units,
    router as units_router,
    update_unit,
)
from apps.api.app.schemas.reference_data import (
    AssetCreate,
    AssetOut,
    AssetStandardsOut,
    AssetStatusUpdate,
    AssetUpdate,
    BookCreate,
    BookOut,
    BookStatusUpdate,
    BookUpdate,
    CommodityCreate,
    CommodityOut,
    CommodityStatusUpdate,
    CommodityUpdate,
    CounterpartyCreate,
    CounterpartyCreditProfileOut,
    CounterpartyCreditProfileUpsert,
    CounterpartyExternalCreditPromotionRequest,
    CounterpartyExternalCreditSnapshotOut,
    CounterpartyOut,
    CounterpartyStandardsOut,
    CounterpartyStatusUpdate,
    CounterpartyUpdate,
    CurrencyCreate,
    CurrencyOut,
    CurrencyStatusUpdate,
    CurrencyUpdate,
    LocationCreate,
    LocationOut,
    LocationStandardsOut,
    LocationStatusUpdate,
    LocationUpdate,
    PriceIndexCreate,
    PriceIndexOut,
    PriceIndexStatusUpdate,
    PriceIndexUpdate,
    PortfolioCreate,
    PortfolioOut,
    PortfolioStatusUpdate,
    PortfolioUpdate,
    UnitCreate,
    UnitOut,
    UnitStatusUpdate,
    UnitUpdate,
)

router = APIRouter(prefix="/reference", tags=["reference-data"])
router.include_router(assets_router)
router.include_router(books_router)
router.include_router(commodities_router)
router.include_router(counterparties_router)
router.include_router(currencies_router)
router.include_router(units_router)
router.include_router(locations_router)
router.include_router(portfolios_router)
router.include_router(price_indices_router)
