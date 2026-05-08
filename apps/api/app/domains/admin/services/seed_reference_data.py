from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.counterparty_seed_catalog import (
    build_additional_real_counterparty_rows,
    build_energy_real_counterparty_rows,
    build_real_counterparty_rows,
)
from apps.api.app.domains.reference_data.services.location_seed_catalog import (
    build_standardized_location_rows,
)
from apps.api.app.domains.reference_data.services.pipeline_seed_catalog import (
    build_pipeline_seed_candidate_catalog,
)
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_calendar_overlay import ReferenceCalendarOverlay
from apps.api.app.models.reference_calendar_rule import ReferenceCalendarRule
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_pipeline_detail import ReferencePipelineDetail
from apps.api.app.models.reference_pipeline_path import ReferencePipelinePath
from apps.api.app.models.reference_pipeline_point import ReferencePipelinePoint
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource
from apps.api.app.models.reference_rail_line import ReferenceRailLine
from apps.api.app.models.reference_rail_route import ReferenceRailRoute
from apps.api.app.models.reference_spatial_feature import ReferenceSpatialFeature
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
    {"code": "CRUDE_OIL", "name": "Crude Oil", "commodity_class": "CRUDE_OIL", "description": "Generic crude oil family reference used for infrastructure, logistics, and operations."},
    {"code": "WTI", "name": "WTI", "commodity_class": "CRUDE_OIL", "description": "West Texas Intermediate crude benchmark."},
    {"code": "BRENT", "name": "Brent", "commodity_class": "CRUDE_OIL", "description": "North Sea crude benchmark."},
    {"code": "NATURAL_GAS", "name": "Natural Gas", "commodity_class": "NATURAL_GAS", "description": "Pipeline natural gas exposure."},
    {"code": "LNG", "name": "LNG", "commodity_class": "NATURAL_GAS", "description": "Liquefied natural gas exposure."},
    {"code": "REFINED_PRODUCTS", "name": "Refined Products", "commodity_class": "REFINED_PRODUCTS", "description": "Generic refined products family reference used for pipelines, terminals, and logistics."},
    {"code": "GASOLINE", "name": "Gasoline", "commodity_class": "REFINED_PRODUCTS", "description": "Refined gasoline products."},
    {"code": "DIESEL", "name": "Diesel", "commodity_class": "REFINED_PRODUCTS", "description": "Diesel and gasoil products."},
    {"code": "JET_FUEL", "name": "Jet Fuel", "commodity_class": "REFINED_PRODUCTS", "description": "Jet fuel and aviation distillates."},
    {"code": "FUEL_OIL", "name": "Fuel Oil", "commodity_class": "REFINED_PRODUCTS", "description": "Residual and bunker fuel oils."},
    {"code": "NGL", "name": "Natural Gas Liquids", "commodity_class": "NGL", "description": "Natural gas liquids family reference used for fractionation, storage, and transportation."},
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
    {
        "code": "LEIDY",
        "name": "Leidy",
        "location_kind": "POINT",
        "location_type": "TRADING_POINT",
        "parent_location_code": "SUBDIVISION_US_PA",
        "market": "PHYSICAL",
        "city": "Leidy",
        "subdivision_code": "US-PA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 41.4423,
        "longitude": -77.3794,
        "region": "Appalachia",
        "timezone": "America/New_York",
        "description": "Appalachia gas trading and interconnect area used for Leidy-line and Northeast market representation.",
    },
    {
        "code": "KATY",
        "name": "Katy Hub",
        "location_kind": "POINT",
        "location_type": "HUB",
        "parent_location_code": "SUBDIVISION_US_TX",
        "market": "PHYSICAL",
        "city": "Katy",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.7858,
        "longitude": -95.8244,
        "region": "Texas",
        "timezone": "America/Chicago",
        "description": "Texas natural gas market hub used in pipeline and basis trading representation.",
    },
    {
        "code": "PRESIDIO_BORDER",
        "name": "Presidio Border Delivery",
        "location_kind": "POINT",
        "location_type": "DELIVERY_POINT",
        "parent_location_code": "SUBDIVISION_US_TX",
        "market": "PHYSICAL",
        "city": "Presidio",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.5607,
        "longitude": -104.3721,
        "region": "West Texas Border",
        "timezone": "America/Chicago",
        "description": "U.S.-Mexico natural gas border delivery area near Presidio, Texas.",
    },
    {
        "code": "FLANAGAN",
        "name": "Flanagan Terminal",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "parent_location_code": "SUBDIVISION_US_IL",
        "market": "PHYSICAL",
        "city": "Flanagan",
        "subdivision_code": "US-IL",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 40.8786,
        "longitude": -88.8615,
        "region": "Midwest",
        "timezone": "America/Chicago",
        "description": "Enbridge Flanagan terminal and liquids transfer origin area.",
    },
    {
        "code": "NEDERLAND",
        "name": "Nederland Terminal",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "parent_location_code": "SUBDIVISION_US_TX",
        "market": "PHYSICAL",
        "city": "Nederland",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.9744,
        "longitude": -93.9924,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Beaumont-Port Arthur area crude and products terminal location at Nederland, Texas.",
    },
    {
        "code": "GREENSBORO",
        "name": "Greensboro",
        "location_kind": "POINT",
        "location_type": "TRADING_POINT",
        "parent_location_code": "SUBDIVISION_US_NC",
        "market": "PHYSICAL",
        "city": "Greensboro",
        "subdivision_code": "US-NC",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 36.0726,
        "longitude": -79.792,
        "region": "Southeast",
        "timezone": "America/New_York",
        "description": "Colonial Pipeline scheduling and destination market location in North Carolina.",
    },
    {
        "code": "ATLANTA",
        "name": "Atlanta",
        "location_kind": "POINT",
        "location_type": "TRADING_POINT",
        "parent_location_code": "SUBDIVISION_US_GA",
        "market": "PHYSICAL",
        "city": "Atlanta",
        "subdivision_code": "US-GA",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 33.749,
        "longitude": -84.388,
        "region": "Southeast",
        "timezone": "America/New_York",
        "description": "Southeast refined products and logistics market location centered on Atlanta.",
    },
    {
        "code": "LINDEN_JUNCTION",
        "name": "Linden Junction",
        "location_kind": "POINT",
        "location_type": "TRADING_POINT",
        "parent_location_code": "SUBDIVISION_US_NJ",
        "market": "PHYSICAL",
        "city": "Linden",
        "subdivision_code": "US-NJ",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 40.622,
        "longitude": -74.2446,
        "region": "Atlantic Coast",
        "timezone": "America/New_York",
        "description": "Colonial scheduling location within the New York Harbor destination market area.",
    },
    {
        "code": "PORT_ARTHUR",
        "name": "Port Arthur",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "parent_location_code": "SUBDIVISION_US_TX",
        "market": "PHYSICAL",
        "city": "Port Arthur",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.8988,
        "longitude": -93.9288,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "Refined products and terminal area on the upper Texas Gulf Coast.",
    },
    {
        "code": "GLENPOOL_TULSA",
        "name": "Glenpool and Tulsa",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "parent_location_code": "SUBDIVISION_US_OK",
        "market": "PHYSICAL",
        "city": "Tulsa",
        "subdivision_code": "US-OK",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 35.9554,
        "longitude": -95.9928,
        "region": "Midcontinent",
        "timezone": "America/Chicago",
        "description": "Explorer origin and destination area centered on the Glenpool and Tulsa market complex.",
    },
    {
        "code": "WOOD_RIVER",
        "name": "Wood River",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "parent_location_code": "SUBDIVISION_US_IL",
        "market": "PHYSICAL",
        "city": "Wood River",
        "subdivision_code": "US-IL",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 38.8612,
        "longitude": -90.0976,
        "region": "Midwest",
        "timezone": "America/Chicago",
        "description": "Explorer destination and connectivity area around Wood River and St. Louis.",
    },
    {
        "code": "GRIFFITH_HAMMOND",
        "name": "Griffith and Hammond",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "parent_location_code": "SUBDIVISION_US_IN",
        "market": "PHYSICAL",
        "city": "Hammond",
        "subdivision_code": "US-IN",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 41.5934,
        "longitude": -87.3464,
        "region": "Midwest",
        "timezone": "America/Chicago",
        "description": "Explorer destination area in northwest Indiana near Chicago-area demand centers.",
    },
    {
        "code": "MONT_BELVIEU",
        "name": "Mont Belvieu",
        "location_kind": "POINT",
        "location_type": "HUB",
        "parent_location_code": "SUBDIVISION_US_TX",
        "market": "PHYSICAL",
        "city": "Mont Belvieu",
        "subdivision_code": "US-TX",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 29.8461,
        "longitude": -94.89,
        "region": "Gulf Coast",
        "timezone": "America/Chicago",
        "description": "NGL storage, fractionation, and trading hub used as the Texas anchor of the Dixie system.",
    },
    {
        "code": "APEX_NC",
        "name": "Apex",
        "location_kind": "POINT",
        "location_type": "TERMINAL",
        "parent_location_code": "SUBDIVISION_US_NC",
        "market": "PHYSICAL",
        "city": "Apex",
        "subdivision_code": "US-NC",
        "country_code": "US",
        "continent_code": "NA",
        "latitude": 35.7327,
        "longitude": -78.8503,
        "region": "Southeast",
        "timezone": "America/New_York",
        "description": "Eastern terminus area of the Dixie Pipeline system in North Carolina.",
    },
]

LOCATION_ROWS = CURATED_LOCATION_ROWS + build_standardized_location_rows()

_PIPELINE_OPERATOR_NAMES = {
    "TRANSCO_USA": "Williams",
    "TGP_USA": "Kinder Morgan",
    "WAHA_HEADER_TX": "Energy Transfer",
    "OASIS_TX": "Energy Transfer",
    "TRANS_PECOS_TX": "Energy Transfer",
    "FLANAGAN_SOUTH_USA": "Enbridge",
    "SEAWAY_USA": "Enbridge",
    "COLONIAL_USA": "Colonial Pipeline",
    "EXPLORER_USA": "Explorer Pipeline",
    "DIXIE_USA": "Enterprise Products",
}
_PIPELINE_COMMODITY_CODES = {
    "NATURAL_GAS": "NATURAL_GAS",
    "CRUDE_OIL": "CRUDE_OIL",
    "REFINED_PRODUCTS": "REFINED_PRODUCTS",
    "NGL": "NGL",
}
_PIPELINE_ASSET_LOCATION_CODES = {
    "TRANSCO_USA": "LEIDY",
    "TGP_USA": "HENRY_HUB",
    "WAHA_HEADER_TX": "WAHA",
    "OASIS_TX": "WAHA",
    "TRANS_PECOS_TX": "WAHA",
    "FLANAGAN_SOUTH_USA": "FLANAGAN",
    "SEAWAY_USA": "CUSHING",
    "COLONIAL_USA": "HOUSTON_SHIP_CHANNEL",
    "EXPLORER_USA": "PORT_ARTHUR",
    "DIXIE_USA": "MONT_BELVIEU",
}
_PIPELINE_EBB_CODES = {"TRANSCO_USA", "TGP_USA", "WAHA_HEADER_TX", "OASIS_TX", "TRANS_PECOS_TX"}
_PIPELINE_TARIFF_CODES = {"COLONIAL_USA", "EXPLORER_USA"}
_PIPELINE_IN_SERVICE_YEAR_OVERRIDES = {
    "TRANS_PECOS_TX": 2017,
    "FLANAGAN_SOUTH_USA": 2014,
}


def build_seeded_pipeline_asset_rows() -> list[dict]:
    pipeline_rows = build_pipeline_seed_candidate_catalog()["pipelines"]
    return [
        {
            "code": row["code"],
            "name": row["name"],
            "asset_class": "PIPELINE",
            "asset_type": "TRANSMISSION",
            "asset_reality": "REAL",
            "commodity_code": _PIPELINE_COMMODITY_CODES.get(row["commodity_family"]),
            "location_code": _PIPELINE_ASSET_LOCATION_CODES.get(row["code"]),
            "capacity_value": None,
            "capacity_unit_code": None,
            "operator_name": _PIPELINE_OPERATOR_NAMES.get(row["code"]),
            "operating_status": "OPERATING",
            "source_name": row["source_name"],
            "source_url": row["source_url"],
            "confidence": 0.9,
            "notes": row["notes"],
            "description": row["notes"],
        }
        for row in pipeline_rows
    ]


def build_seeded_pipeline_detail_rows() -> list[dict]:
    pipeline_rows = build_pipeline_seed_candidate_catalog()["pipelines"]
    detail_rows: list[dict] = []
    for row in pipeline_rows:
        detail_rows.append(
            {
                "pipeline_code": row["code"],
                "commodity_family": row["commodity_family"],
                "jurisdiction_type": row["jurisdiction_type"],
                "topology_model": row["topology_model"],
                "market_hub_location_code": row["market_hub_location_code"],
                "in_service_year": _PIPELINE_IN_SERVICE_YEAR_OVERRIDES.get(row["code"]),
                "cross_border": row["cross_border"],
                "is_bidirectional": row["code"] == "OASIS_TX",
                "tariff_url": row["source_url"] if row["code"] in _PIPELINE_TARIFF_CODES else None,
                "ebb_url": row["source_url"] if row["code"] in _PIPELINE_EBB_CODES else None,
            }
        )
    return detail_rows


def build_seeded_pipeline_point_rows() -> list[dict]:
    point_rows = build_pipeline_seed_candidate_catalog()["points"]
    sort_order_by_pipeline: dict[str, int] = {}
    seeded_rows: list[dict] = []
    for row in point_rows:
        next_sort_order = sort_order_by_pipeline.get(row["pipeline_code"], 0) + 10
        sort_order_by_pipeline[row["pipeline_code"]] = next_sort_order
        seeded_rows.append(
            {
                "code": row["code"],
                "pipeline_code": row["pipeline_code"],
                "location_code": row["location_code"],
                "point_role": row["point_role"],
                "operator_point_code": row["operator_point_code"],
                "operator_zone": row["operator_zone"],
                "connected_pipeline_code": row["connected_pipeline_code"],
                "is_tradable": row["is_tradable"],
                "is_pricing_point": row["is_pricing_point"],
                "is_scheduling_point": row["is_scheduling_point"],
                "sort_order": next_sort_order,
                "name": row["name"],
                "description": row["notes"],
            }
        )
    return seeded_rows


PIPELINE_PATH_ROWS = [
    {
        "code": "TRANSCO_LEIDY_TO_ZONE_6",
        "name": "Transco Leidy to Zone 6",
        "pipeline_code": "TRANSCO_USA",
        "receipt_location_code": "LEIDY",
        "delivery_location_code": None,
        "receipt_point_code": "TRANSCO_DOMINION_LEIDY",
        "delivery_point_code": "TRANSCO_ZONE_6",
        "path_direction": "FORWARD",
        "cycle_timezone": "America/Chicago",
        "description": "Representative Transco tradable corridor from Leidy-area receipts into Zone 6 markets.",
    },
    {
        "code": "TGP_ZONE_0_TO_ZONE_L_500",
        "name": "TGP Zone 0 to Zone L 500",
        "pipeline_code": "TGP_USA",
        "receipt_location_code": None,
        "delivery_location_code": None,
        "receipt_point_code": "TGP_ZONE_0_LEG_100_NORTH_POOL",
        "delivery_point_code": "TGP_ZONE_L_LEG_500_POOL",
        "path_direction": "FORWARD",
        "cycle_timezone": "America/Chicago",
        "description": "Representative Tennessee Gas path from Zone 0 supply into a Zone L pool.",
    },
    {
        "code": "WAHA_HEADER_TO_TRANS_PECOS",
        "name": "Waha Header to Trans-Pecos",
        "pipeline_code": "WAHA_HEADER_TX",
        "receipt_location_code": "WAHA",
        "delivery_location_code": "WAHA",
        "receipt_point_code": "WAHA_HEADER_WAHA_HUB",
        "delivery_point_code": "WAHA_HEADER_TRANS_PECOS",
        "path_direction": "FORWARD",
        "cycle_timezone": "America/Chicago",
        "description": "Header interconnect path from the Waha hub into the Trans-Pecos takeaway connection.",
    },
    {
        "code": "OASIS_WAHA_TO_KATY",
        "name": "Oasis Waha to Katy",
        "pipeline_code": "OASIS_TX",
        "receipt_location_code": "WAHA",
        "delivery_location_code": "KATY",
        "receipt_point_code": "OASIS_WAHA_HUB",
        "delivery_point_code": "OASIS_KATY_HUB",
        "path_direction": "BIDIRECTIONAL",
        "cycle_timezone": "America/Chicago",
        "description": "Core Oasis corridor between the Waha and Katy market hubs.",
    },
    {
        "code": "TRANS_PECOS_WAHA_TO_PRESIDIO",
        "name": "Trans-Pecos Waha to Presidio",
        "pipeline_code": "TRANS_PECOS_TX",
        "receipt_location_code": "WAHA",
        "delivery_location_code": "PRESIDIO_BORDER",
        "receipt_point_code": "TRANS_PECOS_WAHA_HUB",
        "delivery_point_code": "TRANS_PECOS_PRESIDIO_BORDER",
        "path_direction": "FORWARD",
        "cycle_timezone": "America/Chicago",
        "description": "Cross-border takeaway path from the Waha hub to the Presidio border delivery.",
    },
    {
        "code": "FLANAGAN_SOUTH_TO_CUSHING",
        "name": "Flanagan South to Cushing",
        "pipeline_code": "FLANAGAN_SOUTH_USA",
        "receipt_location_code": "FLANAGAN",
        "delivery_location_code": "CUSHING",
        "receipt_point_code": "FLANAGAN_SOUTH_FLANAGAN_TERMINAL",
        "delivery_point_code": "FLANAGAN_SOUTH_CUSHING_TERMINAL",
        "path_direction": "FORWARD",
        "cycle_timezone": None,
        "description": "Interstate crude path from Flanagan Terminal to Cushing.",
    },
    {
        "code": "SEAWAY_CUSHING_TO_ECHO",
        "name": "Seaway Cushing to ECHO",
        "pipeline_code": "SEAWAY_USA",
        "receipt_location_code": "CUSHING",
        "delivery_location_code": "HOUSTON_SHIP_CHANNEL",
        "receipt_point_code": "SEAWAY_CUSHING",
        "delivery_point_code": "SEAWAY_ECHO_TERMINAL",
        "path_direction": "FORWARD",
        "cycle_timezone": None,
        "description": "Representative Seaway path from Cushing to the Houston-area ECHO terminal.",
    },
    {
        "code": "COLONIAL_HOUSTON_TO_ATLANTA",
        "name": "Colonial Houston to Atlanta",
        "pipeline_code": "COLONIAL_USA",
        "receipt_location_code": "HOUSTON_SHIP_CHANNEL",
        "delivery_location_code": "ATLANTA",
        "receipt_point_code": "COLONIAL_HOUSTON",
        "delivery_point_code": "COLONIAL_ATLANTA",
        "path_direction": "FORWARD",
        "cycle_timezone": None,
        "description": "Representative Colonial mainline movement from Houston into the Atlanta market.",
    },
    {
        "code": "COLONIAL_HOUSTON_TO_LINDEN",
        "name": "Colonial Houston to Linden",
        "pipeline_code": "COLONIAL_USA",
        "receipt_location_code": "HOUSTON_SHIP_CHANNEL",
        "delivery_location_code": "LINDEN_JUNCTION",
        "receipt_point_code": "COLONIAL_HOUSTON",
        "delivery_point_code": "COLONIAL_LINDEN",
        "path_direction": "FORWARD",
        "cycle_timezone": None,
        "description": "Representative long-haul Colonial movement into the Linden Junction market.",
    },
    {
        "code": "EXPLORER_PORT_ARTHUR_TO_GLENPOOL",
        "name": "Explorer Port Arthur to Glenpool",
        "pipeline_code": "EXPLORER_USA",
        "receipt_location_code": "PORT_ARTHUR",
        "delivery_location_code": "GLENPOOL_TULSA",
        "receipt_point_code": "EXPLORER_PORT_ARTHUR",
        "delivery_point_code": "EXPLORER_GLENPOOL_TULSA",
        "path_direction": "FORWARD",
        "cycle_timezone": None,
        "description": "Representative Explorer movement from Gulf Coast origins into the Glenpool and Tulsa market area.",
    },
    {
        "code": "EXPLORER_GLENPOOL_TO_WOOD_RIVER",
        "name": "Explorer Glenpool to Wood River",
        "pipeline_code": "EXPLORER_USA",
        "receipt_location_code": "GLENPOOL_TULSA",
        "delivery_location_code": "WOOD_RIVER",
        "receipt_point_code": "EXPLORER_GLENPOOL_TULSA",
        "delivery_point_code": "EXPLORER_WOOD_RIVER",
        "path_direction": "FORWARD",
        "cycle_timezone": None,
        "description": "Representative Explorer path from the Tulsa-area system into the Wood River and St. Louis destination area.",
    },
    {
        "code": "DIXIE_MONT_BELVIEU_TO_APEX",
        "name": "Dixie Mont Belvieu to Apex",
        "pipeline_code": "DIXIE_USA",
        "receipt_location_code": "MONT_BELVIEU",
        "delivery_location_code": "APEX_NC",
        "receipt_point_code": "DIXIE_MONT_BELVIEU",
        "delivery_point_code": "DIXIE_APEX",
        "path_direction": "FORWARD",
        "cycle_timezone": None,
        "description": "Representative Dixie eastbound path from Mont Belvieu into the Apex, North Carolina terminus.",
    },
]

RAIL_LINE_ROWS = [
    {
        "code": "BNSF_SOUTHERN_TRANSCON",
        "name": "BNSF Southern Transcon",
        "railroad_code": "BNSF",
        "operator_name": "BNSF Railway",
        "default_timezone": "America/Chicago",
        "description": "Western corridor header used for Permian-to-Gulf Coast crude, LPG, and petrochemical rail planning.",
    },
    {
        "code": "UP_GULF_COAST_CORRIDOR",
        "name": "Union Pacific Gulf Coast Corridor",
        "railroad_code": "UP",
        "operator_name": "Union Pacific Railroad",
        "default_timezone": "America/Chicago",
        "description": "Midcontinent and Gulf Coast corridor used for crude, products, and chemical feedstock rail movements.",
    },
    {
        "code": "CN_GREAT_LAKES_CORRIDOR",
        "name": "Canadian National Great Lakes Corridor",
        "railroad_code": "CN",
        "operator_name": "Canadian National Railway",
        "default_timezone": "America/Toronto",
        "description": "Western Canada and Great Lakes corridor used for LPG, condensate, and specialty products planning.",
    },
    {
        "code": "CPKC_MIDCONTINENT_GULF",
        "name": "CPKC Midcontinent Gulf Corridor",
        "railroad_code": "CPKC",
        "operator_name": "Canadian Pacific Kansas City",
        "default_timezone": "America/Chicago",
        "description": "North-south corridor used for Midcontinent crude and refined-products balancing into Gulf Coast markets.",
    },
    {
        "code": "NS_ATLANTIC_TERMINAL_CORRIDOR",
        "name": "Norfolk Southern Atlantic Terminal Corridor",
        "railroad_code": "NS",
        "operator_name": "Norfolk Southern Railway",
        "default_timezone": "America/New_York",
        "description": "Eastern corridor used for terminal replenishment and storage positioning into Atlantic Coast demand centers.",
    },
]

RAIL_ROUTE_ROWS = [
    {
        "code": "BNSF_WAHA_TO_HSC",
        "name": "BNSF Waha to Houston Ship Channel",
        "rail_line_code": "BNSF_SOUTHERN_TRANSCON",
        "origin_location_code": "WAHA",
        "destination_location_code": "HOUSTON_SHIP_CHANNEL",
        "service_calendar_code": "USGC_PORT",
        "route_direction": "FORWARD",
        "schedule_timezone": "America/Chicago",
        "placement_cutoff_time_local": "15:00",
        "release_cutoff_time_local": "11:00",
        "placement_free_time_hours": 48,
        "release_free_time_hours": 24,
        "description": "Permian loading route into Gulf Coast terminal markets for LPG, condensate, and petrochemical feedstock scenarios.",
    },
    {
        "code": "UP_MIDLAND_TO_CUSHING",
        "name": "Union Pacific Midland to Cushing",
        "rail_line_code": "UP_GULF_COAST_CORRIDOR",
        "origin_location_code": "MIDLAND",
        "destination_location_code": "CUSHING",
        "service_calendar_code": "US_FED_BANK",
        "route_direction": "FORWARD",
        "schedule_timezone": "America/Chicago",
        "placement_cutoff_time_local": "14:00",
        "release_cutoff_time_local": "10:00",
        "placement_free_time_hours": 48,
        "release_free_time_hours": 24,
        "description": "Midland-area crude shuttle route into Cushing inventory and blending scenarios.",
    },
    {
        "code": "CPKC_CUSHING_TO_HSC",
        "name": "CPKC Cushing to Houston Ship Channel",
        "rail_line_code": "CPKC_MIDCONTINENT_GULF",
        "origin_location_code": "CUSHING",
        "destination_location_code": "HOUSTON_SHIP_CHANNEL",
        "service_calendar_code": "USGC_PORT",
        "route_direction": "FORWARD",
        "schedule_timezone": "America/Chicago",
        "placement_cutoff_time_local": "15:00",
        "release_cutoff_time_local": "11:00",
        "placement_free_time_hours": 48,
        "release_free_time_hours": 24,
        "description": "Midcontinent-to-Gulf Coast balancing route for crude and refined products logistics planning.",
    },
    {
        "code": "CN_AECO_TO_DAWN",
        "name": "CN AECO to Dawn",
        "rail_line_code": "CN_GREAT_LAKES_CORRIDOR",
        "origin_location_code": "AECO",
        "destination_location_code": "DAWN",
        "service_calendar_code": "CA_BANK_NATIONAL",
        "route_direction": "FORWARD",
        "schedule_timezone": "America/Toronto",
        "placement_cutoff_time_local": "16:00",
        "release_cutoff_time_local": "12:00",
        "placement_free_time_hours": 48,
        "release_free_time_hours": 24,
        "description": "Western Canada to Ontario route used for LPG, condensate, and specialty rail product scenarios.",
    },
    {
        "code": "NS_DAWN_TO_NYH",
        "name": "Norfolk Southern Dawn to New York Harbor",
        "rail_line_code": "NS_ATLANTIC_TERMINAL_CORRIDOR",
        "origin_location_code": "DAWN",
        "destination_location_code": "NYH",
        "service_calendar_code": "US_FED_BANK",
        "route_direction": "FORWARD",
        "schedule_timezone": "America/New_York",
        "placement_cutoff_time_local": "13:00",
        "release_cutoff_time_local": "09:00",
        "placement_free_time_hours": 48,
        "release_free_time_hours": 24,
        "description": "Eastern terminal replenishment route into Atlantic Coast storage and demand centers.",
    },
    {
        "code": "BNSF_HSC_TO_WAHA_BACKHAUL",
        "name": "BNSF Houston Ship Channel to Waha Backhaul",
        "rail_line_code": "BNSF_SOUTHERN_TRANSCON",
        "origin_location_code": "HOUSTON_SHIP_CHANNEL",
        "destination_location_code": "WAHA",
        "service_calendar_code": "USGC_PORT",
        "route_direction": "REVERSE",
        "schedule_timezone": "America/Chicago",
        "placement_cutoff_time_local": "16:00",
        "release_cutoff_time_local": "12:00",
        "placement_free_time_hours": 24,
        "release_free_time_hours": 24,
        "description": "Backhaul lane used for empty-car repositioning and return-feedstock planning back into West Texas.",
    },
]


def _build_rail_route_overlay_code(route_code: str) -> str:
    return f"{route_code}_OVERLAY"


def _build_midpoint(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
) -> tuple[float, float]:
    return (
        (origin_latitude + destination_latitude) / 2,
        (origin_longitude + destination_longitude) / 2,
    )


def _build_seeded_rail_route_spatial_feature_rows(
    db: Session,
) -> list[dict[str, object]]:
    seeded_route_codes = [row["code"] for row in RAIL_ROUTE_ROWS]
    seeded_routes = db.execute(
        select(ReferenceRailRoute).where(ReferenceRailRoute.code.in_(seeded_route_codes))
    ).scalars().all()
    routes_by_code = {route.code: route for route in seeded_routes}
    location_codes = {
        location_code
        for route in seeded_routes
        for location_code in (
            route.origin_location_code,
            route.destination_location_code,
        )
        if location_code is not None
    }
    locations_by_code = {
        location.code: location
        for location in db.execute(
            select(ReferenceLocation).where(ReferenceLocation.code.in_(location_codes))
        ).scalars().all()
    }

    rows: list[dict[str, object]] = []
    for seeded_route_row in RAIL_ROUTE_ROWS:
        route_code = seeded_route_row["code"]
        route = routes_by_code.get(route_code)
        if route is None:
            raise ValueError(
                f"Seeded rail route '{route_code}' must exist before building map overlays"
            )
        if route.origin_location_code is None or route.destination_location_code is None:
            raise ValueError(
                f"Seeded rail route '{route.code}' must define origin and destination locations"
            )

        origin_location = locations_by_code.get(route.origin_location_code)
        destination_location = locations_by_code.get(route.destination_location_code)
        if origin_location is None or destination_location is None:
            raise ValueError(
                f"Seeded rail route '{route.code}' references missing origin or destination locations"
            )
        if (
            origin_location.latitude is None
            or origin_location.longitude is None
            or destination_location.latitude is None
            or destination_location.longitude is None
        ):
            raise ValueError(
                f"Seeded rail route '{route.code}' requires mapped origin and destination coordinates"
            )

        label_latitude, label_longitude = _build_midpoint(
            origin_location.latitude,
            origin_location.longitude,
            destination_location.latitude,
            destination_location.longitude,
        )

        rows.append(
            {
                "code": _build_rail_route_overlay_code(route.code),
                "name": route.name,
                "feature_kind": "ROUTE",
                "geometry_type": "LINE",
                "entity_type": "RAIL_ROUTE",
                "entity_code": route.code,
                "label_latitude": label_latitude,
                "label_longitude": label_longitude,
                "is_primary": True,
                "geometry_geojson": {
                    "type": "LineString",
                    "coordinates": [
                        [origin_location.longitude, origin_location.latitude],
                        [destination_location.longitude, destination_location.latitude],
                    ],
                },
                "source_name": "Curated Rail Route Seed",
                "source_url": None,
                "confidence": 0.35,
                "notes": "Straight-line overlay seeded from rail route endpoint locations.",
                "description": route.description,
            }
        )

    return rows

ASSET_ROWS = [
    {
        "code": "SIM_WAHA_GATHERING",
        "name": "Simulated Waha Gathering System",
        "asset_class": "PIPELINE",
        "asset_type": "GATHERING",
        "asset_reality": "SIMULATED",
        "commodity_code": "NATURAL_GAS",
        "location_code": "WAHA",
        "capacity_value": 850000.0,
        "capacity_unit_code": "MMBTU",
        "operator_name": "Scenario Midstream",
        "operating_status": "OPERATING",
        "description": "Synthetic Permian gathering system used for gas balance and congestion scenarios.",
    },
    {
        "code": "SIM_ERCOT_CCGT",
        "name": "Simulated ERCOT Combined Cycle Plant",
        "asset_class": "GENERATION",
        "asset_type": "THERMAL",
        "asset_reality": "SIMULATED",
        "commodity_code": "POWER",
        "location_code": "ERCOT_NORTH",
        "capacity_value": 4200.0,
        "capacity_unit_code": "MWH",
        "operator_name": "Scenario Generation Co",
        "operating_status": "OPERATING",
        "description": "Synthetic dispatchable generation asset for heat-rate and load-following scenarios.",
    },
    {
        "code": "SIM_USGC_REFINERY",
        "name": "Simulated Gulf Coast Refinery",
        "asset_class": "REFINERY",
        "asset_type": "CONVERSION",
        "asset_reality": "SIMULATED",
        "commodity_code": "WTI",
        "location_code": "USGC",
        "capacity_value": 275000.0,
        "capacity_unit_code": "BBL",
        "operator_name": "Scenario Refining Co",
        "operating_status": "OPERATING",
        "description": "Synthetic conversion refinery for crude slate, yield, and crack-spread scenarios.",
    },
    {
        "code": "SIM_MIDLAND_FIELD",
        "name": "Simulated Midland Oil Field",
        "asset_class": "UPSTREAM_PRODUCTION",
        "asset_type": "OIL_FIELD",
        "asset_reality": "SIMULATED",
        "commodity_code": "WTI",
        "location_code": "MIDLAND",
        "capacity_value": 95000.0,
        "capacity_unit_code": "BBL",
        "operator_name": "Scenario Upstream",
        "operating_status": "OPERATING",
        "description": "Synthetic upstream production asset for regional crude supply and takeaway scenarios.",
    },
    {
        "code": "SIM_HSC_LNG_EXPORT",
        "name": "Simulated Houston LNG Export Train",
        "asset_class": "PROCESSING",
        "asset_type": "LNG_EXPORT",
        "asset_reality": "SIMULATED",
        "commodity_code": "LNG",
        "location_code": "HOUSTON_SHIP_CHANNEL",
        "capacity_value": 1800000.0,
        "capacity_unit_code": "MMBTU",
        "operator_name": "Scenario LNG Services",
        "operating_status": "PLANNED",
        "description": "Synthetic LNG export train for feedgas pull, shipping, and outage planning scenarios.",
    },
    {
        "code": "SIM_HENRY_CAVERN",
        "name": "Simulated Henry Hub Storage Cavern",
        "asset_class": "STORAGE",
        "asset_type": "CAVERN",
        "asset_reality": "SIMULATED",
        "commodity_code": "NATURAL_GAS",
        "location_code": "HENRY_HUB",
        "capacity_value": 4200000.0,
        "capacity_unit_code": "MMBTU",
        "operator_name": "Scenario Storage Partners",
        "operating_status": "OPERATING",
        "description": "Synthetic gas storage asset for injection, withdrawal, and prompt-winter spread scenarios.",
    },
    {
        "code": "SIM_USGC_TERMINAL",
        "name": "Simulated Gulf Marine Terminal",
        "asset_class": "TERMINAL",
        "asset_type": "MARINE",
        "asset_reality": "SIMULATED",
        "commodity_code": "DIESEL",
        "location_code": "HOUSTON_SHIP_CHANNEL",
        "capacity_value": 1450000.0,
        "capacity_unit_code": "BBL",
        "operator_name": "Scenario Terminal Services",
        "operating_status": "OPERATING",
        "description": "Synthetic marine terminal for inventory, blending, and export lift scenarios.",
    },
    {
        "code": "SIM_PJM_DATA_CENTER",
        "name": "Simulated Mid-Atlantic Data Center Load",
        "asset_class": "CONSUMPTION",
        "asset_type": "DATACENTER",
        "asset_reality": "SIMULATED",
        "commodity_code": "POWER",
        "location_code": "PJM_WEST",
        "capacity_value": 650.0,
        "capacity_unit_code": "MWH",
        "operator_name": "Scenario Compute Campus",
        "operating_status": "UNDER_CONSTRUCTION",
        "description": "Synthetic large load asset for power demand growth and hedge requirement scenarios.",
    },
] + build_seeded_pipeline_asset_rows()

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

COUNTERPARTY_ROWS = (
    CURATED_COUNTERPARTY_ROWS
    + build_real_counterparty_rows()
    + build_additional_real_counterparty_rows()
    + build_energy_real_counterparty_rows()
)

PORTFOLIO_ROWS = [
    {"code": "REFINERY_FEEDSTOCK", "name": "Refinery Feedstock", "book_code": "DEMO_CRUDE", "owner": "Refinery Supply Desk", "strategy": "Physical feedstock coverage", "trader_persona": "Feedstock Procurer", "risk_archetype": "CONSUMPTION_HEDGE", "description": "Asset-backed crude procurement portfolio."},
    {"code": "GAS_HEDGE", "name": "Gas Hedge", "book_code": "DEMO_GAS", "owner": "Gas Supply", "strategy": "Indexed supply hedge", "trader_persona": "Hedger", "risk_archetype": "DEFENSIVE_HEDGE", "description": "Protective gas hedge portfolio."},
    {"code": "PRODUCTS_SPREAD_ARB", "name": "Products Spread Arbitrage", "book_code": "DEMO_PRODUCTS", "owner": "Products Desk", "strategy": "Location and crack spread capture", "trader_persona": "Arbitrager", "risk_archetype": "RELATIVE_VALUE", "description": "Products spread portfolio."},
    {"code": "LOAD_SHAPING", "name": "Load Shaping", "book_code": "DEMO_POWER", "owner": "Power Desk", "strategy": "Peak and off-peak structuring", "trader_persona": "Structurer", "risk_archetype": "OPTIONALITY_CAPTURE", "description": "Power shaping portfolio."},
]

CALENDAR_ROWS = [
    {"code": "PJM", "name": "PJM Business Calendar", "calendar_type": "POWER_MARKET", "market": "PJM", "timezone": "America/New_York", "description": "PJM business-day and holiday calendar for power scheduling and settlement."},
    {"code": "US_FED_BANK", "name": "US Federal Reserve Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "US", "timezone": "America/New_York", "description": "United States Federal Reserve and bank holiday calendar used for domestic cash movement, payments, and settlement planning."},
    {"code": "CA_BANK_NATIONAL", "name": "Canada National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "CA", "timezone": "America/Toronto", "description": "Canadian national bank holiday calendar used for standard banking and payment settlement planning."},
    {"code": "CA_BANK_QC", "name": "Canada Quebec Bank Holidays", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "CA-QC", "timezone": "America/Toronto", "description": "Quebec-specific bank holiday overlay used alongside the national Canadian bank holiday calendar."},
    {"code": "CA_BANK_AB_BC_NS_ON", "name": "Canada Provincial Bank Holidays", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "CA-AB-BC-NS-ON", "timezone": "America/Toronto", "description": "Provincial bank holiday overlay for Alberta, British Columbia, Nova Scotia, and Ontario."},
    {"code": "MX_BANK_CNBV", "name": "Mexico CNBV Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "MX", "timezone": "America/Mexico_City", "description": "Mexico banking holiday calendar aligned to CNBV and local banking observance schedules."},
    {"code": "BR_BANK_NATIONAL", "name": "Brazil National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "BR", "timezone": "America/Sao_Paulo", "description": "Brazilian national bank holiday calendar used for domestic bank operations and payments."},
    {"code": "CO_BANK_NATIONAL", "name": "Colombia National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "CO", "timezone": "America/Bogota", "description": "Colombian national bank holiday calendar used for local bank and payment scheduling."},
    {"code": "UK_BANK_EW", "name": "UK England and Wales Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "UK-EW", "timezone": "Europe/London", "description": "England and Wales bank holiday calendar used for sterling cash movement and branch closure planning."},
    {"code": "UK_BANK_SCOTLAND", "name": "UK Scotland Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "UK-SCT", "timezone": "Europe/London", "description": "Scottish bank holiday calendar used alongside broader UK settlement and branch operations."},
    {"code": "UK_BANK_NI", "name": "UK Northern Ireland Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "UK-NI", "timezone": "Europe/London", "description": "Northern Ireland bank holiday calendar used for branch closures and local settlement planning."},
    {"code": "EUR_TARGET", "name": "Euro TARGET Settlement Calendar", "calendar_type": "PAYMENT_SYSTEM", "market": "EUR", "timezone": "Europe/Brussels", "description": "TARGET euro payment system closing calendar used for cross-border euro settlement and payment operations."},
    {"code": "DE_PUBLIC_NATIONAL", "name": "Germany National Public and Banking Calendar", "calendar_type": "PUBLIC_HOLIDAY", "market": "DE", "timezone": "Europe/Berlin", "description": "German national public holiday baseline used with Bundesbank and regional state overlays for banking operations."},
    {"code": "FR_BANK_PLACE", "name": "France Banking Place Calendar", "calendar_type": "BANK_HOLIDAY", "market": "FR", "timezone": "Europe/Paris", "description": "French banking place calendar used for Paris market operations, payments, and settlement planning."},
    {"code": "NO_NBO", "name": "Norway Settlement and Bank Calendar", "calendar_type": "BANK_HOLIDAY", "market": "NO", "timezone": "Europe/Oslo", "description": "Norwegian bank and settlement calendar aligned to Norges Bank operational closure days."},
    {"code": "FI_BANK", "name": "Finland Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "FI", "timezone": "Europe/Helsinki", "description": "Finnish bank holiday calendar used for banking operations and payment settlement planning."},
    {"code": "NL_PUBLIC", "name": "Netherlands Public and Banking Calendar", "calendar_type": "PUBLIC_HOLIDAY", "market": "NL", "timezone": "Europe/Amsterdam", "description": "Dutch public holiday baseline used for banking, branch availability, and local operational planning."},
    {"code": "IT_PUBLIC", "name": "Italy Public and Banking Calendar", "calendar_type": "PUBLIC_HOLIDAY", "market": "IT", "timezone": "Europe/Rome", "description": "Italian public holiday baseline used together with TARGET settlement rules for payment and bank operations."},
    {"code": "IN_RBI_MUMBAI", "name": "India RBI Mumbai Bank Calendar", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "IN-MH", "timezone": "Asia/Kolkata", "description": "Reserve Bank of India holiday calendar for the Mumbai office and Maharashtra banking operations."},
    {"code": "IN_RBI_NEW_DELHI", "name": "India RBI New Delhi Bank Calendar", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "IN-DL", "timezone": "Asia/Kolkata", "description": "Reserve Bank of India holiday calendar for the New Delhi office and related banking operations."},
    {"code": "IN_RBI_KOLKATA", "name": "India RBI Kolkata Bank Calendar", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "IN-WB", "timezone": "Asia/Kolkata", "description": "Reserve Bank of India holiday calendar for the Kolkata office and West Bengal banking operations."},
    {"code": "IN_RBI_CHENNAI", "name": "India RBI Chennai Bank Calendar", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "IN-TN", "timezone": "Asia/Kolkata", "description": "Reserve Bank of India holiday calendar for the Chennai office and Tamil Nadu banking operations."},
    {"code": "IN_RBI_BENGALURU", "name": "India RBI Bengaluru Bank Calendar", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "IN-KA", "timezone": "Asia/Kolkata", "description": "Reserve Bank of India holiday calendar for the Bengaluru office and Karnataka banking operations."},
    {"code": "IN_RBI_HYDERABAD", "name": "India RBI Hyderabad Bank Calendar", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "IN-TS", "timezone": "Asia/Kolkata", "description": "Reserve Bank of India holiday calendar for the Hyderabad office and Telangana banking operations."},
    {"code": "IL_ZAHAV", "name": "Israel ZAHAV Settlement Calendar", "calendar_type": "PAYMENT_SYSTEM", "market": "IL", "timezone": "Asia/Jerusalem", "description": "Israel ZAHAV payment system and banking closure calendar used for local settlement and cash movement planning."},
    {"code": "AE_PUBLIC", "name": "UAE Public and Banking Calendar", "calendar_type": "PUBLIC_HOLIDAY", "market": "AE", "timezone": "Asia/Dubai", "description": "United Arab Emirates public holiday baseline used for local banking operations, with lunar-date adjustments handled separately."},
    {"code": "ZA_BANK_NATIONAL", "name": "South Africa National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "ZA", "timezone": "Africa/Johannesburg", "description": "South African national bank holiday calendar used for local payments, settlement planning, and branch closure schedules."},
    {"code": "AZ_BANK_NATIONAL", "name": "Azerbaijan National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "AZ", "timezone": "Asia/Baku", "description": "Azerbaijani national bank holiday calendar used for local banking operations and payment settlement planning."},
    {"code": "UA_BANK_NATIONAL", "name": "Ukraine National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "UA", "timezone": "Europe/Kyiv", "description": "Ukrainian national bank holiday calendar used for domestic banking operations and payment scheduling."},
    {"code": "CZ_BANK_NATIONAL", "name": "Czech Republic National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "CZ", "timezone": "Europe/Prague", "description": "Czech national bank holiday calendar used for local bank operations and koruna settlement planning."},
    {"code": "HU_BANK_NATIONAL", "name": "Hungary National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "HU", "timezone": "Europe/Budapest", "description": "Hungarian national bank holiday calendar used for banking operations and local payment settlement planning."},
    {"code": "SG_BANK_NATIONAL", "name": "Singapore National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "SG", "timezone": "Asia/Singapore", "description": "Singapore national bank holiday calendar used for local banking operations and SGD payment settlement."},
    {"code": "CN_BANK_NATIONAL", "name": "China National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "CN", "timezone": "Asia/Shanghai", "description": "Mainland China national bank holiday calendar used for domestic banking operations and CNY payment scheduling."},
    {"code": "TW_BANK_NATIONAL", "name": "Taiwan National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "TW", "timezone": "Asia/Taipei", "description": "Taiwan national bank holiday calendar used for local banking operations and TWD payment scheduling."},
    {"code": "TH_BANK_NATIONAL", "name": "Thailand National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "TH", "timezone": "Asia/Bangkok", "description": "Thailand national bank holiday calendar used for banking operations and local settlement planning."},
    {"code": "VN_BANK_NATIONAL", "name": "Vietnam National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "VN", "timezone": "Asia/Ho_Chi_Minh", "description": "Vietnamese national bank holiday calendar used for local banking operations and payment settlement planning."},
    {"code": "KR_BANK_NATIONAL", "name": "South Korea National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "KR", "timezone": "Asia/Seoul", "description": "South Korean national bank holiday calendar used for local bank operations and KRW settlement planning."},
    {"code": "JP_BANK_NATIONAL", "name": "Japan National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "JP", "timezone": "Asia/Tokyo", "description": "Japanese national bank holiday calendar used for domestic banking operations and yen payment scheduling."},
    {"code": "AU_BANK_NATIONAL", "name": "Australia National Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "AU", "timezone": "Australia/Sydney", "description": "Australian national bank holiday baseline used for banking operations and payment planning, with state-specific overlays to follow when needed."},
    {"code": "US_FEDWIRE", "name": "US Fedwire Settlement Calendar", "calendar_type": "PAYMENT_SYSTEM", "market": "US", "timezone": "America/New_York", "description": "Fedwire funds and securities settlement calendar used for domestic USD payment and high-value cash movement planning."},
    {"code": "US_CHIPS", "name": "US CHIPS Settlement Calendar", "calendar_type": "PAYMENT_SYSTEM", "market": "US", "timezone": "America/New_York", "description": "CHIPS settlement calendar used for large-value USD clearing and interbank payment operations."},
    {"code": "UK_CHAPS", "name": "UK CHAPS Settlement Calendar", "calendar_type": "PAYMENT_SYSTEM", "market": "UK", "timezone": "Europe/London", "description": "CHAPS payment system calendar used for high-value GBP settlement and same-day payment operations."},
    {"code": "CA_LYNX", "name": "Canada Lynx Settlement Calendar", "calendar_type": "PAYMENT_SYSTEM", "market": "CA", "timezone": "America/Toronto", "description": "Lynx high-value payment system calendar used for Canadian dollar settlement and bank cash movement planning."},
    {"code": "MX_SPEI", "name": "Mexico SPEI Settlement Calendar", "calendar_type": "PAYMENT_SYSTEM", "market": "MX", "timezone": "America/Mexico_City", "description": "SPEI payment system calendar used for Mexican peso settlement and domestic payment operations."},
    {"code": "NYSE", "name": "NYSE Trading Calendar", "calendar_type": "EXCHANGE", "market": "NYSE", "timezone": "America/New_York", "description": "New York Stock Exchange holiday and trading closure calendar used for market and collateral workflow planning."},
    {"code": "NASDAQ", "name": "NASDAQ Trading Calendar", "calendar_type": "EXCHANGE", "market": "NASDAQ", "timezone": "America/New_York", "description": "NASDAQ holiday and trading closure calendar used for listed market scheduling and market-data dependencies."},
    {"code": "CME_ENERGY", "name": "CME Energy Trading Calendar", "calendar_type": "EXCHANGE", "market": "CME", "timezone": "America/Chicago", "description": "CME energy trading calendar used for futures, options, and commodity market settlement scheduling."},
    {"code": "ICE_US", "name": "ICE US Trading Calendar", "calendar_type": "EXCHANGE", "market": "ICE_US", "timezone": "America/New_York", "description": "ICE US holiday and trading closure calendar used for energy and commodity market operations."},
    {"code": "ICE_EU", "name": "ICE Europe Trading Calendar", "calendar_type": "EXCHANGE", "market": "ICE_EU", "timezone": "Europe/London", "description": "ICE Europe holiday and trading closure calendar used for cross-border commodity market operations."},
    {"code": "LME", "name": "LME Trading Calendar", "calendar_type": "EXCHANGE", "market": "LME", "timezone": "Europe/London", "description": "London Metal Exchange holiday and trading closure calendar used for metals and collateral operations."},
    {"code": "SGX", "name": "SGX Trading Calendar", "calendar_type": "EXCHANGE", "market": "SGX", "timezone": "Asia/Singapore", "description": "Singapore Exchange holiday and trading closure calendar used for listed market and clearing dependencies."},
    {"code": "HKEX", "name": "HKEX Trading Calendar", "calendar_type": "EXCHANGE", "market": "HKEX", "timezone": "Asia/Hong_Kong", "description": "Hong Kong Exchange holiday and trading closure calendar used for listed market and clearing operations."},
    {"code": "JPX", "name": "JPX Trading Calendar", "calendar_type": "EXCHANGE", "market": "JPX", "timezone": "Asia/Tokyo", "description": "Japan Exchange Group holiday and trading closure calendar used for market and settlement workflow planning."},
    {"code": "ERCOT", "name": "ERCOT Power Market Calendar", "calendar_type": "POWER_MARKET", "market": "ERCOT", "timezone": "America/Chicago", "description": "ERCOT power market calendar used for scheduling, day-ahead operations, and settlement planning."},
    {"code": "MISO", "name": "MISO Power Market Calendar", "calendar_type": "POWER_MARKET", "market": "MISO", "timezone": "America/Chicago", "description": "MISO power market calendar used for scheduling, settlement, and outage planning."},
    {"code": "NYISO", "name": "NYISO Power Market Calendar", "calendar_type": "POWER_MARKET", "market": "NYISO", "timezone": "America/New_York", "description": "NYISO power market calendar used for scheduling, settlement, and operational workflow planning."},
    {"code": "ISO_NE", "name": "ISO New England Power Market Calendar", "calendar_type": "POWER_MARKET", "market": "ISO_NE", "timezone": "America/New_York", "description": "ISO New England market calendar used for scheduling, settlements, and power market workflows."},
    {"code": "SPP", "name": "SPP Power Market Calendar", "calendar_type": "POWER_MARKET", "market": "SPP", "timezone": "America/Chicago", "description": "Southwest Power Pool market calendar used for scheduling, settlements, and operational planning."},
    {"code": "CAISO", "name": "CAISO Power Market Calendar", "calendar_type": "POWER_MARKET", "market": "CAISO", "timezone": "America/Los_Angeles", "description": "CAISO power market calendar used for scheduling, settlements, and California grid operations."},
    {"code": "AESO", "name": "AESO Power Market Calendar", "calendar_type": "POWER_MARKET", "market": "AESO", "timezone": "America/Edmonton", "description": "AESO power market calendar used for Alberta scheduling, settlement, and outage planning."},
    {"code": "IESO", "name": "IESO Power Market Calendar", "calendar_type": "POWER_MARKET", "market": "IESO", "timezone": "America/Toronto", "description": "IESO power market calendar used for Ontario scheduling, settlement, and market workflow planning."},
    {"code": "NAESB_GAS", "name": "NAESB Gas Nomination Calendar", "calendar_type": "GAS_NOMINATION", "market": "NAESB", "timezone": "America/Chicago", "description": "NAESB-aligned gas nomination and scheduling calendar used for pipeline cycle and operational timing workflows."},
    {"code": "ARA_PORT", "name": "ARA Port Operations Calendar", "calendar_type": "PORT", "market": "ARA", "timezone": "Europe/Amsterdam", "description": "Amsterdam-Rotterdam-Antwerp port operations calendar used for cargo, terminal, and laycan planning."},
    {"code": "USGC_PORT", "name": "US Gulf Coast Port Operations Calendar", "calendar_type": "PORT", "market": "USGC", "timezone": "America/Chicago", "description": "US Gulf Coast port and terminal operations calendar used for cargo movement and marine scheduling."},
    {"code": "FUJAIRAH_PORT", "name": "Fujairah Port Operations Calendar", "calendar_type": "PORT", "market": "FUJAIRAH", "timezone": "Asia/Dubai", "description": "Fujairah port operations calendar used for bunkering, storage, and cargo scheduling workflows."},
    {"code": "SINGAPORE_PORT", "name": "Singapore Port Operations Calendar", "calendar_type": "PORT", "market": "SINGAPORE", "timezone": "Asia/Singapore", "description": "Singapore port operations calendar used for terminal scheduling, cargo planning, and marine operations."},
    {"code": "AU_NSW_BANK", "name": "Australia New South Wales Bank Holidays", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "AU-NSW", "timezone": "Australia/Sydney", "description": "New South Wales bank holiday overlay used alongside the Australian national bank holiday calendar."},
    {"code": "AU_VIC_BANK", "name": "Australia Victoria Bank Holidays", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "AU-VIC", "timezone": "Australia/Melbourne", "description": "Victoria bank holiday overlay used alongside the Australian national bank holiday calendar."},
    {"code": "AU_QLD_BANK", "name": "Australia Queensland Bank Holidays", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "AU-QLD", "timezone": "Australia/Brisbane", "description": "Queensland bank holiday overlay used alongside the Australian national bank holiday calendar."},
    {"code": "AU_WA_BANK", "name": "Australia Western Australia Bank Holidays", "calendar_type": "REGIONAL_BANK_HOLIDAY", "market": "AU-WA", "timezone": "Australia/Perth", "description": "Western Australia bank holiday overlay used alongside the Australian national bank holiday calendar."},
    {"code": "HK_BANK_NATIONAL", "name": "Hong Kong Bank Holidays", "calendar_type": "BANK_HOLIDAY", "market": "HK", "timezone": "Asia/Hong_Kong", "description": "Hong Kong bank holiday calendar used for HKD payments, branch closures, and local settlement workflows."},
    {"code": "DE_BAVARIA_PUBLIC", "name": "Germany Bavaria Public Holiday Overlay", "calendar_type": "REGIONAL_PUBLIC_HOLIDAY", "market": "DE-BY", "timezone": "Europe/Berlin", "description": "Bavaria regional public holiday overlay used with Germany national and euro settlement calendars."},
    {"code": "DE_BADEN_WUERTTEMBERG_PUBLIC", "name": "Germany Baden-Wuerttemberg Public Holiday Overlay", "calendar_type": "REGIONAL_PUBLIC_HOLIDAY", "market": "DE-BW", "timezone": "Europe/Berlin", "description": "Baden-Wuerttemberg regional public holiday overlay used with Germany national and euro settlement calendars."},
]


def _calendar_overlay_row(
    calendar_code: str,
    overlay_calendar_code: str,
    *,
    priority: int = 100,
    description: str | None = None,
) -> dict[str, object]:
    return {
        "calendar_code": calendar_code,
        "overlay_calendar_code": overlay_calendar_code,
        "priority": priority,
        "description": description,
    }


def _calendar_rule_row(
    calendar_code: str,
    name: str,
    rule_type: str,
    *,
    closure_type: str = "FULL_CLOSED",
    month: int | None = None,
    day: int | None = None,
    weekday: int | None = None,
    occurrence: int | None = None,
    offset_days: int | None = None,
    observance_shift: str | None = None,
    is_provisional: bool = False,
    description: str | None = None,
) -> dict[str, object]:
    return {
        "calendar_code": calendar_code,
        "name": name,
        "rule_type": rule_type,
        "closure_type": closure_type,
        "month": month,
        "day": day,
        "weekday": weekday,
        "occurrence": occurrence,
        "offset_days": offset_days,
        "observance_shift": observance_shift,
        "is_provisional": is_provisional,
        "description": description,
    }


def _build_weekly_closed_rule_rows(
    calendar_codes: list[str],
    *,
    weekdays: list[int],
) -> list[dict[str, object]]:
    weekday_names = {
        0: "Monday",
        1: "Tuesday",
        2: "Wednesday",
        3: "Thursday",
        4: "Friday",
        5: "Saturday",
        6: "Sunday",
    }
    rows: list[dict[str, object]] = []
    for calendar_code in calendar_codes:
        for weekday in weekdays:
            rows.append(
                _calendar_rule_row(
                    calendar_code,
                    f"{weekday_names[weekday]} Weekend Closure",
                    "WEEKLY",
                    weekday=weekday,
                    description="Recurring closed day used as the baseline business-day profile for this calendar.",
                )
            )
    return rows


SAT_SUN_WEEKEND_CALENDAR_CODES = [
    "US_FED_BANK",
    "CA_BANK_NATIONAL",
    "MX_BANK_CNBV",
    "BR_BANK_NATIONAL",
    "CO_BANK_NATIONAL",
    "UK_BANK_EW",
    "UK_BANK_SCOTLAND",
    "UK_BANK_NI",
    "EUR_TARGET",
    "NO_NBO",
    "FI_BANK",
    "AE_PUBLIC",
    "ZA_BANK_NATIONAL",
    "AZ_BANK_NATIONAL",
    "UA_BANK_NATIONAL",
    "CZ_BANK_NATIONAL",
    "HU_BANK_NATIONAL",
    "SG_BANK_NATIONAL",
    "CN_BANK_NATIONAL",
    "TW_BANK_NATIONAL",
    "TH_BANK_NATIONAL",
    "VN_BANK_NATIONAL",
    "KR_BANK_NATIONAL",
    "JP_BANK_NATIONAL",
    "AU_BANK_NATIONAL",
    "NYSE",
    "ICE_US",
    "ICE_EU",
    "LME",
    "SGX",
    "JPX",
    "PJM",
    "ERCOT",
    "MISO",
    "NYISO",
    "ISO_NE",
    "SPP",
    "CAISO",
    "AESO",
    "IESO",
    "ARA_PORT",
    "USGC_PORT",
    "FUJAIRAH_PORT",
    "SINGAPORE_PORT",
    "HK_BANK_NATIONAL",
]

FRI_SAT_WEEKEND_CALENDAR_CODES = ["IL_ZAHAV"]
RBI_CALENDAR_CODES = [
    "IN_RBI_MUMBAI",
    "IN_RBI_NEW_DELHI",
    "IN_RBI_KOLKATA",
    "IN_RBI_CHENNAI",
    "IN_RBI_BENGALURU",
    "IN_RBI_HYDERABAD",
]

CALENDAR_OVERLAY_ROWS = [
    _calendar_overlay_row(
        "US_FEDWIRE",
        "US_FED_BANK",
        description="Fedwire settlement follows the Federal Reserve Bank holiday calendar for full-day closures.",
    ),
    _calendar_overlay_row(
        "US_CHIPS",
        "US_FED_BANK",
        description="CHIPS typically follows the Federal Reserve Bank holiday calendar for full-day closures.",
    ),
    _calendar_overlay_row(
        "NASDAQ",
        "NYSE",
        description="NASDAQ inherits the NYSE full-day closure baseline for business-day calculations in this slice.",
    ),
    _calendar_overlay_row(
        "CME_ENERGY",
        "NYSE",
        description="CME Energy inherits the NYSE full-day holiday baseline for business-day calculations in this slice; shorter product-specific sessions remain a follow-up.",
    ),
    _calendar_overlay_row(
        "UK_CHAPS",
        "UK_BANK_EW",
        description="CHAPS inherits the England and Wales bank-holiday baseline until more specific rule packs are added.",
    ),
    _calendar_overlay_row(
        "CA_LYNX",
        "CA_BANK_NATIONAL",
        description="Lynx inherits the national Canadian bank-holiday baseline until more specific rule packs are added.",
    ),
    _calendar_overlay_row(
        "MX_SPEI",
        "MX_BANK_CNBV",
        description="SPEI inherits the CNBV banking calendar baseline until more specific rule packs are added.",
    ),
    _calendar_overlay_row(
        "CA_BANK_QC",
        "CA_BANK_NATIONAL",
        description="Quebec bank holiday calculations inherit the national Canadian bank calendar plus local overlays.",
    ),
    _calendar_overlay_row(
        "CA_BANK_AB_BC_NS_ON",
        "CA_BANK_NATIONAL",
        description="Provincial Canadian bank holiday calculations inherit the national Canadian bank calendar plus local overlays.",
    ),
    _calendar_overlay_row(
        "FR_BANK_PLACE",
        "EUR_TARGET",
        description="France banking calculations inherit TARGET settlement closures as a baseline.",
    ),
    _calendar_overlay_row(
        "NL_PUBLIC",
        "EUR_TARGET",
        description="Netherlands calendar calculations inherit TARGET settlement closures as a baseline.",
    ),
    _calendar_overlay_row(
        "IT_PUBLIC",
        "EUR_TARGET",
        description="Italy calendar calculations inherit TARGET settlement closures as a baseline.",
    ),
    _calendar_overlay_row(
        "DE_PUBLIC_NATIONAL",
        "EUR_TARGET",
        description="Germany calendar calculations inherit TARGET settlement closures as a baseline.",
    ),
    _calendar_overlay_row(
        "AU_NSW_BANK",
        "AU_BANK_NATIONAL",
        description="New South Wales inherits the Australian national bank calendar plus local overlays.",
    ),
    _calendar_overlay_row(
        "AU_VIC_BANK",
        "AU_BANK_NATIONAL",
        description="Victoria inherits the Australian national bank calendar plus local overlays.",
    ),
    _calendar_overlay_row(
        "AU_QLD_BANK",
        "AU_BANK_NATIONAL",
        description="Queensland inherits the Australian national bank calendar plus local overlays.",
    ),
    _calendar_overlay_row(
        "AU_WA_BANK",
        "AU_BANK_NATIONAL",
        description="Western Australia inherits the Australian national bank calendar plus local overlays.",
    ),
    _calendar_overlay_row(
        "HKEX",
        "HK_BANK_NATIONAL",
        description="HKEX inherits the Hong Kong bank-holiday baseline until a more specific exchange rule pack is added.",
    ),
    _calendar_overlay_row(
        "DE_BAVARIA_PUBLIC",
        "DE_PUBLIC_NATIONAL",
        description="Bavaria inherits the Germany national calendar plus local overlays.",
    ),
    _calendar_overlay_row(
        "DE_BADEN_WUERTTEMBERG_PUBLIC",
        "DE_PUBLIC_NATIONAL",
        description="Baden-Wuerttemberg inherits the Germany national calendar plus local overlays.",
    ),
]

CALENDAR_RULE_ROWS = (
    _build_weekly_closed_rule_rows(SAT_SUN_WEEKEND_CALENDAR_CODES, weekdays=[5, 6])
    + _build_weekly_closed_rule_rows(FRI_SAT_WEEKEND_CALENDAR_CODES, weekdays=[4, 5])
    + _build_weekly_closed_rule_rows(RBI_CALENDAR_CODES, weekdays=[6])
    + [
        _calendar_rule_row(
            calendar_code,
            "Second Saturday Closure",
            "NTH_WEEKDAY",
            month=month,
            weekday=5,
            occurrence=2,
            description="Representative recurring second-Saturday closure used by RBI city calendars in this first slice; month-specific holiday overlays can add further closures later.",
        )
        for calendar_code in RBI_CALENDAR_CODES
        for month in range(1, 13)
    ]
    + [
        _calendar_rule_row(
            calendar_code,
            "Fourth Saturday Closure",
            "NTH_WEEKDAY",
            month=month,
            weekday=5,
            occurrence=4,
            description="Representative recurring fourth-Saturday closure used by RBI city calendars in this first slice; month-specific holiday overlays can add further closures later.",
        )
        for calendar_code in RBI_CALENDAR_CODES
        for month in range(1, 13)
    ]
    + [
        _calendar_rule_row(
            "US_FED_BANK",
            "New Year's Day",
            "FIXED_DATE",
            month=1,
            day=1,
            observance_shift="MONDAY_IF_SUNDAY",
        ),
        _calendar_rule_row("US_FED_BANK", "Martin Luther King Jr. Day", "NTH_WEEKDAY", month=1, weekday=0, occurrence=3),
        _calendar_rule_row("US_FED_BANK", "Washington's Birthday", "NTH_WEEKDAY", month=2, weekday=0, occurrence=3),
        _calendar_rule_row("US_FED_BANK", "Memorial Day", "LAST_WEEKDAY", month=5, weekday=0),
        _calendar_rule_row(
            "US_FED_BANK",
            "Juneteenth National Independence Day",
            "FIXED_DATE",
            month=6,
            day=19,
            observance_shift="MONDAY_IF_SUNDAY",
        ),
        _calendar_rule_row(
            "US_FED_BANK",
            "Independence Day",
            "FIXED_DATE",
            month=7,
            day=4,
            observance_shift="MONDAY_IF_SUNDAY",
        ),
        _calendar_rule_row("US_FED_BANK", "Labor Day", "NTH_WEEKDAY", month=9, weekday=0, occurrence=1),
        _calendar_rule_row("US_FED_BANK", "Columbus Day", "NTH_WEEKDAY", month=10, weekday=0, occurrence=2),
        _calendar_rule_row(
            "US_FED_BANK",
            "Veterans Day",
            "FIXED_DATE",
            month=11,
            day=11,
            observance_shift="MONDAY_IF_SUNDAY",
        ),
        _calendar_rule_row("US_FED_BANK", "Thanksgiving Day", "NTH_WEEKDAY", month=11, weekday=3, occurrence=4),
        _calendar_rule_row(
            "US_FED_BANK",
            "Christmas Day",
            "FIXED_DATE",
            month=12,
            day=25,
            observance_shift="MONDAY_IF_SUNDAY",
        ),
        _calendar_rule_row("NYSE", "New Year's Day", "FIXED_DATE", month=1, day=1, observance_shift="NEAREST_WEEKDAY"),
        _calendar_rule_row("NYSE", "Martin Luther King Jr. Day", "NTH_WEEKDAY", month=1, weekday=0, occurrence=3),
        _calendar_rule_row("NYSE", "Washington's Birthday", "NTH_WEEKDAY", month=2, weekday=0, occurrence=3),
        _calendar_rule_row("NYSE", "Good Friday", "EASTER_OFFSET", offset_days=-2),
        _calendar_rule_row("NYSE", "Memorial Day", "LAST_WEEKDAY", month=5, weekday=0),
        _calendar_rule_row("NYSE", "Juneteenth National Independence Day", "FIXED_DATE", month=6, day=19, observance_shift="NEAREST_WEEKDAY"),
        _calendar_rule_row("NYSE", "Independence Day", "FIXED_DATE", month=7, day=4, observance_shift="NEAREST_WEEKDAY"),
        _calendar_rule_row("NYSE", "Labor Day", "NTH_WEEKDAY", month=9, weekday=0, occurrence=1),
        _calendar_rule_row("NYSE", "Thanksgiving Day", "NTH_WEEKDAY", month=11, weekday=3, occurrence=4),
        _calendar_rule_row("NYSE", "Christmas Day", "FIXED_DATE", month=12, day=25, observance_shift="NEAREST_WEEKDAY"),
        _calendar_rule_row("PJM", "New Year's Day", "FIXED_DATE", month=1, day=1),
        _calendar_rule_row("PJM", "Memorial Day", "LAST_WEEKDAY", month=5, weekday=0),
        _calendar_rule_row("PJM", "Independence Day", "FIXED_DATE", month=7, day=4),
        _calendar_rule_row("PJM", "Labor Day", "NTH_WEEKDAY", month=9, weekday=0, occurrence=1),
        _calendar_rule_row("PJM", "Thanksgiving Day", "NTH_WEEKDAY", month=11, weekday=3, occurrence=4),
        _calendar_rule_row("PJM", "Christmas Day", "FIXED_DATE", month=12, day=25),
        _calendar_rule_row("EUR_TARGET", "New Year's Day", "FIXED_DATE", month=1, day=1),
        _calendar_rule_row("EUR_TARGET", "Good Friday", "EASTER_OFFSET", offset_days=-2),
        _calendar_rule_row("EUR_TARGET", "Easter Monday", "EASTER_OFFSET", offset_days=1),
        _calendar_rule_row("EUR_TARGET", "Labour Day", "FIXED_DATE", month=5, day=1),
        _calendar_rule_row("EUR_TARGET", "Christmas Day", "FIXED_DATE", month=12, day=25),
        _calendar_rule_row("EUR_TARGET", "Boxing Day", "FIXED_DATE", month=12, day=26),
    ]
)

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
    pipeline_detail_rows = build_seeded_pipeline_detail_rows()
    pipeline_point_rows = build_seeded_pipeline_point_rows()
    entity_counts = {
        "books": _seed_reference_table(db, ReferenceBook, BOOK_ROWS, "code", requested_by, now, replace_existing),
        "commodities": _seed_reference_table(db, ReferenceCommodity, COMMODITY_ROWS, "code", requested_by, now, replace_existing),
        "currencies": _seed_reference_table(db, ReferenceCurrency, CURRENCY_ROWS, "code", requested_by, now, replace_existing),
        "units": _seed_reference_table(db, ReferenceUnit, UNIT_ROWS, "code", requested_by, now, replace_existing),
        "locations": _seed_reference_table(db, ReferenceLocation, ordered_location_rows, "code", requested_by, now, replace_existing),
        "rail_lines": _seed_reference_table(db, ReferenceRailLine, RAIL_LINE_ROWS, "code", requested_by, now, replace_existing),
        "rail_routes": _seed_reference_table(db, ReferenceRailRoute, RAIL_ROUTE_ROWS, "code", requested_by, now, replace_existing),
    }
    db.flush()
    entity_counts["spatial_features"] = _seed_reference_table(
        db,
        ReferenceSpatialFeature,
        _build_seeded_rail_route_spatial_feature_rows(db),
        "code",
        requested_by,
        now,
        replace_existing,
    )
    entity_counts.update(
        {
            "assets": _seed_reference_table(db, ReferenceAsset, ASSET_ROWS, "code", requested_by, now, replace_existing),
            "pipeline_details": _seed_reference_table(
                db,
                ReferencePipelineDetail,
                pipeline_detail_rows,
                "pipeline_code",
                requested_by,
                now,
                replace_existing,
            ),
            "pipeline_points": _seed_reference_table(
                db,
                ReferencePipelinePoint,
                pipeline_point_rows,
                "code",
                requested_by,
                now,
                replace_existing,
            ),
            "pipeline_paths": _seed_reference_table(
                db,
                ReferencePipelinePath,
                PIPELINE_PATH_ROWS,
                "code",
                requested_by,
                now,
                replace_existing,
            ),
            "counterparties": _seed_reference_table(db, ReferenceCounterparty, COUNTERPARTY_ROWS, "code", requested_by, now, replace_existing),
            "portfolios": _seed_reference_table(db, ReferencePortfolio, PORTFOLIO_ROWS, "code", requested_by, now, replace_existing),
            "calendars": _seed_reference_table(db, ReferenceCalendar, CALENDAR_ROWS, "code", requested_by, now, replace_existing),
            "calendar_overlays": _seed_calendar_overlays(db, requested_by, now, replace_existing),
            "calendar_rules": _seed_calendar_rules(db, requested_by, now, replace_existing),
            "price_indices": _seed_reference_table(db, ReferencePriceIndex, PRICE_INDEX_ROWS, "code", requested_by, now, replace_existing),
            "price_index_sources": _seed_price_index_sources(db, requested_by, now, replace_existing),
        }
    )
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


def _seed_calendar_overlays(
    db: Session,
    requested_by: str,
    now: datetime,
    replace_existing: bool,
) -> int:
    for row in CALENDAR_OVERLAY_ROWS:
        record = db.execute(
            select(ReferenceCalendarOverlay).where(
                ReferenceCalendarOverlay.calendar_code == row["calendar_code"],
                ReferenceCalendarOverlay.overlay_calendar_code == row["overlay_calendar_code"],
            )
        ).scalars().first()
        if record is None:
            db.add(
                ReferenceCalendarOverlay(
                    calendar_code=row["calendar_code"],
                    overlay_calendar_code=row["overlay_calendar_code"],
                    priority=row["priority"],
                    description=row["description"],
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
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

        record.priority = row["priority"]
        record.description = row["description"]
        record.is_active = True
        record.effective_from = None
        record.effective_to = None
        record.updated_at = now
        record.updated_by = requested_by

    return len(CALENDAR_OVERLAY_ROWS)


def _seed_calendar_rules(
    db: Session,
    requested_by: str,
    now: datetime,
    replace_existing: bool,
) -> int:
    existing_rules = db.execute(select(ReferenceCalendarRule)).scalars().all()
    existing_by_key = {_calendar_rule_key_for_record(rule): rule for rule in existing_rules}

    for row in CALENDAR_RULE_ROWS:
        record = existing_by_key.get(_calendar_rule_key_for_row(row))
        if record is None:
            db.add(
                ReferenceCalendarRule(
                    calendar_code=row["calendar_code"],
                    name=row["name"],
                    rule_type=row["rule_type"],
                    closure_type=row["closure_type"],
                    month=row["month"],
                    day=row["day"],
                    weekday=row["weekday"],
                    occurrence=row["occurrence"],
                    offset_days=row["offset_days"],
                    observance_shift=row["observance_shift"],
                    is_provisional=row["is_provisional"],
                    description=row["description"],
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
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

        record.closure_type = row["closure_type"]
        record.is_provisional = row["is_provisional"]
        record.description = row["description"]
        record.is_active = True
        record.effective_from = None
        record.effective_to = None
        record.updated_at = now
        record.updated_by = requested_by

    return len(CALENDAR_RULE_ROWS)


def _calendar_rule_key_for_row(row: dict[str, object]) -> tuple[object, ...]:
    return (
        row["calendar_code"],
        row["name"],
        row["rule_type"],
        row["closure_type"],
        row["month"],
        row["day"],
        row["weekday"],
        row["occurrence"],
        row["offset_days"],
        row["observance_shift"],
    )


def _calendar_rule_key_for_record(record: ReferenceCalendarRule) -> tuple[object, ...]:
    return (
        record.calendar_code,
        record.name,
        record.rule_type,
        record.closure_type,
        record.month,
        record.day,
        record.weekday,
        record.occurrence,
        record.offset_days,
        record.observance_shift,
    )


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
