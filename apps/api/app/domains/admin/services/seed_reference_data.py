from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.counterparty_seed_catalog import (
    build_real_counterparty_rows,
)
from apps.api.app.domains.reference_data.services.location_seed_catalog import (
    build_standardized_location_rows,
)
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

CURATED_LOCATION_ROWS = [
    {
        "code": "CUSHING",
        "name": "Cushing Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "parent_location_code": "PADD2",
        "market": "NYMEX",
        "city": "Cushing",
        "subdivision_code": "US-OK",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 35.9853,
        "longitude": -96.7528,
        "region": "Midcontinent",
        "timezone": "America/Chicago",
        "description": "WTI delivery hub.",
    },
    {
        "code": "MIDLAND",
        "name": "Midland",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "PHYSICAL",
        "city": "Midland",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 31.9974,
        "longitude": -102.0779,
        "region": "Permian",
        "timezone": "America/Chicago",
        "description": "Permian crude gathering and Midland cash market location.",
    },
    {
        "code": "HOUSTON_SHIP_CHANNEL",
        "name": "Houston Ship Channel",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "parent_location_code": "USGC",
        "market": "PHYSICAL",
        "city": "Houston",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.7285,
        "longitude": -95.265,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Key Gulf Coast terminal and refined products transfer location.",
    },
    {
        "code": "USGC",
        "name": "US Gulf Coast",
        "location_kind": "REGION",
        "location_type": "REGION",
        "market": "PHYSICAL",
        "city": "New Orleans",
        "subdivision_code": "US-LA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.9511,
        "longitude": -90.0715,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Refined products and crude physical region.",
    },
    {
        "code": "PADD2",
        "name": "PADD 2",
        "location_kind": "REGION",
        "location_type": "PADD",
        "market": "PHYSICAL",
        "city": "Des Moines",
        "subdivision_code": "US-IA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 41.5868,
        "longitude": -93.625,
        "region": "Midwest",
        "timezone": "America/Chicago",
        "description": "Midwest liquids region.",
    },
    {
        "code": "NYH",
        "name": "New York Harbor",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "market": "PHYSICAL",
        "city": "New York",
        "subdivision_code": "US-NY",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 40.684,
        "longitude": -74.0062,
        "region": "Atlantic Coast",
        "timezone": "America/New_York",
        "description": "Atlantic Coast refined products pricing and storage hub.",
    },
    {
        "code": "ARA",
        "name": "Amsterdam-Rotterdam-Antwerp",
        "location_kind": "REGION",
        "location_type": "REGION",
        "market": "PHYSICAL",
        "city": "Rotterdam",
        "subdivision_code": "NL-ZH",
        "country_code": "NL",
        "continent_code": "EU",
        "latitude": 51.9244,
        "longitude": 4.4777,
        "region": "Northwest Europe",
        "timezone": "Europe/Amsterdam",
        "description": "Northwest Europe products and storage benchmark region.",
    },
    {
        "code": "HENRY_HUB",
        "name": "Henry Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "parent_location_code": "USGC",
        "market": "NYMEX",
        "city": "Erath",
        "subdivision_code": "US-LA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.9589,
        "longitude": -92.0332,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Natural gas benchmark hub.",
    },
    {
        "code": "WAHA",
        "name": "Waha Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "PHYSICAL",
        "city": "Waha",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 31.9493,
        "longitude": -103.6652,
        "region": "Permian",
        "timezone": "America/Chicago",
        "description": "Permian natural gas hub used in basis and physical gas markets.",
    },
    {
        "code": "AECO",
        "name": "AECO",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "NGX",
        "city": "Calgary",
        "subdivision_code": "CA-AB",
        "country_code": "CA",
        "continent_code": "NA",
        "latitude": 51.0447,
        "longitude": -114.0719,
        "region": "Alberta",
        "timezone": "America/Edmonton",
        "description": "Western Canadian gas hub.",
    },
    {
        "code": "DAWN",
        "name": "Dawn Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "NGX",
        "city": "Dawn-Euphemia",
        "subdivision_code": "CA-ON",
        "country_code": "CA",
        "continent_code": "NA",
        "latitude": 42.7245,
        "longitude": -81.9055,
        "region": "Ontario",
        "timezone": "America/Toronto",
        "description": "Eastern Canadian and Great Lakes gas trading hub.",
    },
    {
        "code": "PJM_WEST",
        "name": "PJM West",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "PJM",
        "city": "Pittsburgh",
        "subdivision_code": "US-PA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 40.4406,
        "longitude": -79.9959,
        "region": "Mid-Atlantic",
        "timezone": "America/New_York",
        "description": "Power hub for PJM West.",
    },
    {
        "code": "ERCOT_NORTH",
        "name": "ERCOT North",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "ERCOT",
        "city": "Dallas",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 32.7767,
        "longitude": -96.797,
        "region": "Texas",
        "timezone": "America/Chicago",
        "description": "North Texas power hub for ERCOT basis and shaping activity.",
    },
    {
        "code": "SP15",
        "name": "SP-15",
        "location_kind": "POINT",
        "location_type": "HUB",
        "market": "CAISO",
        "city": "Los Angeles",
        "subdivision_code": "US-CA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 34.0522,
        "longitude": -118.2437,
        "region": "California",
        "timezone": "America/Los_Angeles",
        "description": "Southern California power hub used in CAISO trading.",
    },
]

LOCATION_ROWS = CURATED_LOCATION_ROWS + build_standardized_location_rows()

CURATED_COUNTERPARTY_ROWS = [
    {
        "code": "BP",
        "name": "BP",
        "short_name": "BP",
        "legal_entity_name": "BP Energy Company",
        "counterparty_type": "MAJOR",
        "country_code": "US",
        "description": "Integrated major energy counterparty.",
    },
    {
        "code": "SHELL",
        "name": "Shell",
        "short_name": "Shell",
        "legal_entity_name": "Shell Energy North America",
        "counterparty_type": "MAJOR",
        "country_code": "US",
        "description": "Integrated major energy counterparty.",
    },
    {
        "code": "CHEVRON",
        "name": "Chevron",
        "short_name": "Chevron",
        "legal_entity_name": "Chevron U.S.A. Inc.",
        "counterparty_type": "MAJOR",
        "country_code": "US",
        "description": "Integrated upstream and downstream major energy counterparty.",
    },
    {
        "code": "EXXON",
        "name": "ExxonMobil",
        "short_name": "ExxonMobil",
        "legal_entity_name": "ExxonMobil Oil Corporation",
        "counterparty_type": "MAJOR",
        "country_code": "US",
        "description": "Large integrated oil and products counterparty.",
    },
    {
        "code": "TOTAL",
        "name": "TotalEnergies",
        "short_name": "TotalEnergies",
        "legal_entity_name": "TotalEnergies Gas & Power North America, Inc.",
        "counterparty_type": "MAJOR",
        "country_code": "US",
        "description": "Integrated international major active across LNG, gas, and power.",
    },
    {
        "code": "VITOL",
        "name": "Vitol",
        "short_name": "Vitol",
        "legal_entity_name": "Vitol Inc.",
        "counterparty_type": "TRADER",
        "country_code": "US",
        "description": "Independent trading counterparty.",
    },
    {
        "code": "TRAFIGURA",
        "name": "Trafigura",
        "short_name": "Trafigura",
        "legal_entity_name": "Trafigura Trading LLC",
        "counterparty_type": "TRADER",
        "country_code": "US",
        "description": "Global physical trader active in crude, products, and metals supply chains.",
    },
    {
        "code": "MERCURIA",
        "name": "Mercuria",
        "short_name": "Mercuria",
        "legal_entity_name": "Mercuria Energy America, LLC",
        "counterparty_type": "TRADER",
        "country_code": "US",
        "description": "Independent trader with significant gas, power, and liquids market activity.",
    },
    {
        "code": "GUNVOR",
        "name": "Gunvor",
        "short_name": "Gunvor",
        "legal_entity_name": "Gunvor USA LLC",
        "counterparty_type": "TRADER",
        "country_code": "US",
        "description": "Global trader with crude, products, and logistics exposure.",
    },
    {
        "code": "TENASKA",
        "name": "Tenaska",
        "short_name": "Tenaska",
        "legal_entity_name": "Tenaska Marketing Ventures",
        "counterparty_type": "MARKETER",
        "country_code": "US",
        "description": "Power and gas marketing counterparty.",
    },
    {
        "code": "KOCH",
        "name": "Koch",
        "short_name": "Koch",
        "legal_entity_name": "Koch Energy Services, LLC",
        "counterparty_type": "MARKETER",
        "country_code": "US",
        "description": "Large North American gas, power, and liquids marketer.",
    },
    {
        "code": "CONSTELLATION",
        "name": "Constellation",
        "short_name": "Constellation",
        "legal_entity_name": "Constellation Energy Generation, LLC",
        "counterparty_type": "UTILITY",
        "country_code": "US",
        "description": "Major power marketer and utility-linked counterparty.",
    },
    {
        "code": "NEXTERA",
        "name": "NextEra Energy",
        "short_name": "NextEra",
        "legal_entity_name": "NextEra Energy Marketing, LLC",
        "counterparty_type": "UTILITY",
        "country_code": "US",
        "description": "Power and gas counterparty with renewable and conventional generation exposure.",
    },
    {
        "code": "ENTERPRISE",
        "name": "Enterprise Products",
        "short_name": "Enterprise",
        "legal_entity_name": "Enterprise Products Operating LLC",
        "counterparty_type": "MIDSTREAM",
        "country_code": "US",
        "description": "Midstream counterparty with storage, NGL, and terminal footprint.",
    },
    {
        "code": "PLAINS",
        "name": "Plains All American",
        "short_name": "Plains",
        "legal_entity_name": "Plains Marketing, L.P.",
        "counterparty_type": "MIDSTREAM",
        "country_code": "US",
        "description": "Crude gathering, pipeline, and marketing counterparty.",
    },
    {
        "code": "VALERO",
        "name": "Valero",
        "short_name": "Valero",
        "legal_entity_name": "Valero Marketing and Supply Company",
        "counterparty_type": "REFINER",
        "country_code": "US",
        "description": "Refining and products marketing counterparty.",
    },
]

COUNTERPARTY_ROWS = CURATED_COUNTERPARTY_ROWS + build_real_counterparty_rows()

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
    ordered_location_rows = _order_location_rows(LOCATION_ROWS)
    entity_counts = {
        "books": _seed_reference_table(db, ReferenceBook, BOOK_ROWS, "code", requested_by, now, replace_existing),
        "commodities": _seed_reference_table(db, ReferenceCommodity, COMMODITY_ROWS, "code", requested_by, now, replace_existing),
        "currencies": _seed_reference_table(db, ReferenceCurrency, CURRENCY_ROWS, "code", requested_by, now, replace_existing),
        "units": _seed_reference_table(db, ReferenceUnit, UNIT_ROWS, "code", requested_by, now, replace_existing),
        "locations": _seed_reference_table(db, ReferenceLocation, ordered_location_rows, "code", requested_by, now, replace_existing),
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


def _order_location_rows(rows: list[dict]) -> list[dict]:
    rows_by_code = {row["code"]: row for row in rows}
    ordered_rows: list[dict] = []
    visited: set[str] = set()
    visiting: set[str] = set()

    def visit(code: str) -> None:
        if code in visited:
            return
        if code in visiting:
            raise ValueError(f"Location seed hierarchy contains a cycle at '{code}'")

        row = rows_by_code[code]
        visiting.add(code)
        parent_code = row.get("parent_location_code")
        if parent_code and parent_code in rows_by_code:
            visit(parent_code)
        visiting.remove(code)
        visited.add(code)
        ordered_rows.append(row)

    for row in rows:
        visit(row["code"])

    return ordered_rows


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
