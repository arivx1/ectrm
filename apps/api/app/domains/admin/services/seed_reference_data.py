from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource
from apps.api.app.models.reference_unit import ReferenceUnit


@dataclass
class ReferenceSeedSummary:
    entity_counts: dict[str, int]
    total_records: int
    replace_existing: bool


BOOK_ROWS = [
    {"code": "DEMO_CRUDE", "name": "Crude Physical", "description": "Crude acquisition and logistics book."},
    {"code": "DEMO_GAS", "name": "Gas Optimization", "description": "Indexed gas optimization and balancing book."},
    {"code": "DEMO_PRODUCTS", "name": "Products Arbitrage", "description": "Refined products crack, blend, and arb book."},
    {"code": "DEMO_POWER", "name": "Power Structuring", "description": "Power shaping and load-following book."},
    {"code": "DEMO_ENV", "name": "Environmental Markets", "description": "Carbon and renewable attribute book."},
]

COMMODITY_ROWS = [
    {"code": "WTI", "name": "WTI", "commodity_class": "CRUDE_OIL", "description": "West Texas Intermediate crude benchmark."},
    {"code": "BRENT", "name": "Brent", "commodity_class": "CRUDE_OIL", "description": "North Sea crude benchmark."},
    {"code": "NATURAL_GAS", "name": "Natural Gas", "commodity_class": "NATURAL_GAS", "description": "Pipeline natural gas exposure."},
    {"code": "LNG", "name": "LNG", "commodity_class": "NATURAL_GAS", "description": "Liquefied natural gas exposure."},
    {"code": "GASOLINE", "name": "Gasoline", "commodity_class": "REFINED_PRODUCTS", "description": "Refined gasoline products."},
    {"code": "DIESEL", "name": "Diesel", "commodity_class": "REFINED_PRODUCTS", "description": "Diesel and gasoil products."},
    {"code": "JET_FUEL", "name": "Jet Fuel", "commodity_class": "REFINED_PRODUCTS", "description": "Jet fuel and aviation distillates."},
    {"code": "FUEL_OIL", "name": "Fuel Oil", "commodity_class": "REFINED_PRODUCTS", "description": "Residual and bunker fuel oils."},
    {"code": "POWER", "name": "Power", "commodity_class": "POWER", "description": "Power market exposure."},
    {"code": "REC", "name": "Renewable Energy Credit", "commodity_class": "ENVIRONMENTAL", "description": "Renewable attribute exposure."},
    {"code": "CARBON", "name": "Carbon", "commodity_class": "ENVIRONMENTAL", "description": "Carbon allowance and offset exposure."},
]

CURRENCY_ROWS = [
    {"code": "USD", "name": "US Dollar", "symbol": "$", "description": "Primary North American settlement currency."},
    {"code": "EUR", "name": "Euro", "symbol": "EUR", "description": "Cross-border pricing currency."},
    {"code": "GBP", "name": "British Pound", "symbol": "GBP", "description": "EMEA pricing currency."},
    {"code": "CAD", "name": "Canadian Dollar", "symbol": "CAD", "description": "Canadian commodity pricing currency."},
]

UNIT_ROWS = [
    {"code": "BBL", "name": "Barrel", "commodity_class": "CRUDE_OIL", "dimension": "VOLUME", "base_unit_code": None, "conversion_factor": None, "precision": 3, "description": "Hydrocarbon volume unit."},
    {"code": "GAL", "name": "Gallon", "commodity_class": "REFINED_PRODUCTS", "dimension": "VOLUME", "base_unit_code": "BBL", "conversion_factor": 0.02380952, "precision": 3, "description": "Refined products liquid volume unit."},
    {"code": "MT", "name": "Metric Ton", "commodity_class": None, "dimension": "MASS", "base_unit_code": None, "conversion_factor": None, "precision": 3, "description": "Bulk mass unit."},
    {"code": "MMBTU", "name": "Million British Thermal Units", "commodity_class": "NATURAL_GAS", "dimension": "ENERGY", "base_unit_code": None, "conversion_factor": None, "precision": 3, "description": "Gas energy unit."},
    {"code": "DTH", "name": "Dekatherm", "commodity_class": "NATURAL_GAS", "dimension": "ENERGY", "base_unit_code": "MMBTU", "conversion_factor": 1.0, "precision": 3, "description": "Gas transport unit."},
    {"code": "MWH", "name": "Megawatt Hour", "commodity_class": "POWER", "dimension": "POWER", "base_unit_code": None, "conversion_factor": None, "precision": 3, "description": "Power quantity unit."},
]

LOCATION_ROWS = [
    {"code": "CUSHING", "name": "Cushing Hub", "location_type": "HUB", "market": "NYMEX", "country_code": "US", "region": "Midcontinent", "timezone": "America/Chicago", "description": "WTI delivery hub."},
    {"code": "HENRY_HUB", "name": "Henry Hub", "location_type": "HUB", "market": "NYMEX", "country_code": "US", "region": "Gulf Coast", "timezone": "America/Chicago", "description": "Natural gas benchmark hub."},
    {"code": "USGC", "name": "US Gulf Coast", "location_type": "REGION", "market": "PHYSICAL", "country_code": "US", "region": "Gulf Coast", "timezone": "America/Chicago", "description": "Refined products and crude physical region."},
    {"code": "PADD2", "name": "PADD 2", "location_type": "REGION", "market": "PHYSICAL", "country_code": "US", "region": "Midwest", "timezone": "America/Chicago", "description": "Midwest liquids region."},
    {"code": "PJM_WEST", "name": "PJM West", "location_type": "HUB", "market": "PJM", "country_code": "US", "region": "Mid-Atlantic", "timezone": "America/New_York", "description": "Power hub for PJM West."},
    {"code": "AECO", "name": "AECO", "location_type": "HUB", "market": "NGX", "country_code": "CA", "region": "Alberta", "timezone": "America/Edmonton", "description": "Western Canadian gas hub."},
]

COUNTERPARTY_ROWS = [
    {"code": "BP", "name": "BP", "short_name": "BP", "legal_entity_name": "BP Energy Company", "counterparty_type": "MAJOR", "country_code": "US", "description": "Integrated major energy counterparty."},
    {"code": "SHELL", "name": "Shell", "short_name": "Shell", "legal_entity_name": "Shell Energy North America", "counterparty_type": "MAJOR", "country_code": "US", "description": "Integrated major energy counterparty."},
    {"code": "VITOL", "name": "Vitol", "short_name": "Vitol", "legal_entity_name": "Vitol Inc.", "counterparty_type": "TRADER", "country_code": "US", "description": "Independent trading counterparty."},
    {"code": "TENASKA", "name": "Tenaska", "short_name": "Tenaska", "legal_entity_name": "Tenaska Marketing Ventures", "counterparty_type": "MARKETER", "country_code": "US", "description": "Power and gas marketing counterparty."},
]

PORTFOLIO_ROWS = [
    {"code": "REFINERY_FEEDSTOCK", "name": "Refinery Feedstock", "book_code": "DEMO_CRUDE", "owner": "Refinery Supply Desk", "strategy": "Physical feedstock coverage", "trader_persona": "Feedstock Procurer", "risk_archetype": "CONSUMPTION_HEDGE", "description": "Asset-backed crude procurement portfolio."},
    {"code": "GAS_HEDGE", "name": "Gas Hedge", "book_code": "DEMO_GAS", "owner": "Gas Supply", "strategy": "Indexed supply hedge", "trader_persona": "Hedger", "risk_archetype": "DEFENSIVE_HEDGE", "description": "Protective gas hedge portfolio."},
    {"code": "PRODUCTS_SPREAD_ARB", "name": "Products Spread Arbitrage", "book_code": "DEMO_PRODUCTS", "owner": "Products Desk", "strategy": "Location and crack spread capture", "trader_persona": "Arbitrager", "risk_archetype": "RELATIVE_VALUE", "description": "Products spread portfolio."},
    {"code": "LOAD_SHAPING", "name": "Load Shaping", "book_code": "DEMO_POWER", "owner": "Power Desk", "strategy": "Peak and off-peak structuring", "trader_persona": "Structurer", "risk_archetype": "OPTIONALITY_CAPTURE", "description": "Power shaping portfolio."},
]

PRICE_INDEX_ROWS = [
    {"code": "HENRY_HUB_GAS_D", "name": "Henry Hub Spot Daily", "commodity_code": "NATURAL_GAS", "currency_code": "USD", "unit_code": "MMBTU", "provider": "EIA", "market": "NYMEX", "location_code": "HENRY_HUB", "calendar_code": None, "description": "Daily Henry Hub spot reference."},
    {"code": "WTI_CUSHING_PHYS_D", "name": "WTI Cushing Physical Daily", "commodity_code": "WTI", "currency_code": "USD", "unit_code": "BBL", "provider": "EIA", "market": "PHYSICAL", "location_code": "CUSHING", "calendar_code": None, "description": "Daily WTI physical spot reference."},
    {"code": "BRENT_SPOT_D", "name": "Brent Spot Daily", "commodity_code": "BRENT", "currency_code": "USD", "unit_code": "BBL", "provider": "EIA", "market": "EUROPE", "location_code": None, "calendar_code": None, "description": "Daily Brent spot reference."},
    {"code": "USGC_DIESEL_SPOT_D", "name": "US Gulf Coast Diesel Spot Daily", "commodity_code": "DIESEL", "currency_code": "USD", "unit_code": "GAL", "provider": "EIA", "market": "PHYSICAL", "location_code": "USGC", "calendar_code": None, "description": "Daily USGC diesel spot reference."},
    {"code": "GASOLINE_US_REG_W", "name": "US Retail Gasoline Regular Weekly", "commodity_code": "GASOLINE", "currency_code": "USD", "unit_code": "GAL", "provider": "EIA", "market": "US", "location_code": None, "calendar_code": None, "description": "Weekly US retail gasoline reference."},
    {"code": "DIESEL_US_RETAIL_W", "name": "US Retail Diesel Weekly", "commodity_code": "DIESEL", "currency_code": "USD", "unit_code": "GAL", "provider": "EIA", "market": "US", "location_code": None, "calendar_code": None, "description": "Weekly US retail diesel reference."},
    {"code": "PJM_WEST_ONPEAK_DA", "name": "PJM West On-Peak Day Ahead", "commodity_code": "POWER", "currency_code": "USD", "unit_code": "MWH", "provider": "INTERNAL", "market": "PJM", "location_code": "PJM_WEST", "calendar_code": "PJM", "description": "Power hub day-ahead reference."},
]

PRICE_INDEX_SOURCE_ROWS = [
    {"price_index_code": "HENRY_HUB_GAS_D", "provider": "EIA", "dataset_code": "NG", "series_id": "NG.RNGWHHD.D", "frequency": "daily", "source_unit": "MMBTU", "source_currency_code": "USD", "transform_rule": None},
    {"price_index_code": "WTI_CUSHING_PHYS_D", "provider": "EIA", "dataset_code": "PET", "series_id": "PET.RWTC.D", "frequency": "daily", "source_unit": "BBL", "source_currency_code": "USD", "transform_rule": None},
    {"price_index_code": "BRENT_SPOT_D", "provider": "EIA", "dataset_code": "PET", "series_id": "PET.RBRTE.D", "frequency": "daily", "source_unit": "BBL", "source_currency_code": "USD", "transform_rule": None},
    {"price_index_code": "USGC_DIESEL_SPOT_D", "provider": "EIA", "dataset_code": "PET", "series_id": "PET.EER_EPD2F_PF4_Y35NY_DPG.D", "frequency": "daily", "source_unit": "GAL", "source_currency_code": "USD", "transform_rule": None},
    {"price_index_code": "GASOLINE_US_REG_W", "provider": "EIA", "dataset_code": "PET", "series_id": "PET.EMM_EPMRR_PTE_NUS_DPG.W", "frequency": "weekly", "source_unit": "GAL", "source_currency_code": "USD", "transform_rule": None},
    {"price_index_code": "DIESEL_US_RETAIL_W", "provider": "EIA", "dataset_code": "PET", "series_id": "PET.EMD_EPD2DXL0_PTE_NUS_DPG.W", "frequency": "weekly", "source_unit": "GAL", "source_currency_code": "USD", "transform_rule": None},
]


def seed_reference_master_data(
    db: Session,
    *,
    requested_by: str,
    replace_existing: bool = True,
) -> ReferenceSeedSummary:
    now = datetime.now(timezone.utc)
    entity_counts = {
        "books": _seed_reference_table(db, ReferenceBook, BOOK_ROWS, "code", requested_by, now, replace_existing),
        "commodities": _seed_reference_table(db, ReferenceCommodity, COMMODITY_ROWS, "code", requested_by, now, replace_existing),
        "currencies": _seed_reference_table(db, ReferenceCurrency, CURRENCY_ROWS, "code", requested_by, now, replace_existing),
        "units": _seed_reference_table(db, ReferenceUnit, UNIT_ROWS, "code", requested_by, now, replace_existing),
        "locations": _seed_reference_table(db, ReferenceLocation, LOCATION_ROWS, "code", requested_by, now, replace_existing),
        "counterparties": _seed_reference_table(db, ReferenceCounterparty, COUNTERPARTY_ROWS, "code", requested_by, now, replace_existing),
        "portfolios": _seed_reference_table(db, ReferencePortfolio, PORTFOLIO_ROWS, "code", requested_by, now, replace_existing),
        "price_indices": _seed_reference_table(db, ReferencePriceIndex, PRICE_INDEX_ROWS, "code", requested_by, now, replace_existing),
        "price_index_sources": _seed_price_index_sources(db, requested_by, now, replace_existing),
    }
    db.commit()
    return ReferenceSeedSummary(
        entity_counts=entity_counts,
        total_records=sum(entity_counts.values()),
        replace_existing=replace_existing,
    )


def _seed_reference_table(
    db: Session,
    model,
    rows: list[dict],
    key_field: str,
    requested_by: str,
    now: datetime,
    replace_existing: bool,
) -> int:
    for row in rows:
        record = db.get(model, row[key_field])
        if record is None:
            values = {
                **row,
                "is_active": True,
                "effective_from": None,
                "effective_to": None,
                "created_at": now,
                "created_by": requested_by,
                "updated_at": now,
                "updated_by": requested_by,
                "version": 1,
            }
            db.add(model(**values))
            continue

        if not replace_existing:
            continue

        for field, value in row.items():
            setattr(record, field, value)
        record.is_active = True
        record.updated_at = now
        record.updated_by = requested_by

    return len(rows)


def _seed_price_index_sources(
    db: Session,
    requested_by: str,
    now: datetime,
    replace_existing: bool,
) -> int:
    for row in PRICE_INDEX_SOURCE_ROWS:
        record = db.execute(
            select(ReferencePriceIndexSource).where(
                ReferencePriceIndexSource.provider == row["provider"],
                ReferencePriceIndexSource.series_id == row["series_id"],
            )
        ).scalars().first()

        if record is None:
            db.add(
                ReferencePriceIndexSource(
                    **row,
                    is_active=True,
                    created_at=now,
                    created_by=requested_by,
                    updated_at=now,
                    updated_by=requested_by,
                    version=1,
                )
            )
            continue

        if not replace_existing:
            continue

        for field, value in row.items():
            setattr(record, field, value)
        record.is_active = True
        record.updated_at = now
        record.updated_by = requested_by

    return len(PRICE_INDEX_SOURCE_ROWS)
