"""seed open price index catalog and source mappings

Revision ID: c8d9e0f1a2b3
Revises: b1c2d3e4f5g6, b6c7d8e9f0g1, z8a9b0c1d2e3
Create Date: 2026-05-19 16:30:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union
import json

from alembic import op
import sqlalchemy as sa


revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = (
    "b1c2d3e4f5g6",
    "b6c7d8e9f0g1",
    "z8a9b0c1d2e3",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


COMMODITY_ROWS = [
    {
        "code": "NGL",
        "name": "Natural Gas Liquids",
        "commodity_class": "NGL",
        "allowed_transport_modes": ["PIPELINE", "TRUCK", "RAIL", "BARGE", "VESSEL"],
        "description": "Natural gas liquids family reference used for fractionation, storage, and transportation.",
    },
    {
        "code": "COAL",
        "name": "Coal",
        "commodity_class": "OTHER",
        "allowed_transport_modes": ["RAIL", "BARGE", "VESSEL", "STORAGE"],
        "description": "Coal exposure used for thermal coal market references.",
    },
]

PRICE_INDEX_ROWS = [
    {
        "code": "HENRY_HUB_GAS_D",
        "name": "Henry Hub Spot Daily",
        "commodity_code": "NATURAL_GAS",
        "currency_code": "USD",
        "unit_code": "MMBTU",
        "provider": "EIA",
        "market": "NYMEX",
        "location_code": "HENRY_HUB",
        "calendar_code": None,
        "description": "Daily Henry Hub spot reference.",
    },
    {
        "code": "WTI_CUSHING_PHYS_D",
        "name": "WTI Cushing Physical Daily",
        "commodity_code": "WTI",
        "currency_code": "USD",
        "unit_code": "BBL",
        "provider": "EIA",
        "market": "PHYSICAL",
        "location_code": "CUSHING",
        "calendar_code": None,
        "description": "Daily WTI physical spot reference.",
    },
    {
        "code": "BRENT_SPOT_D",
        "name": "Brent Spot Daily",
        "commodity_code": "BRENT",
        "currency_code": "USD",
        "unit_code": "BBL",
        "provider": "EIA",
        "market": "EUROPE",
        "location_code": None,
        "calendar_code": None,
        "description": "Daily Brent spot reference.",
    },
    {
        "code": "USGC_DIESEL_SPOT_D",
        "name": "US Gulf Coast Diesel Spot Daily",
        "commodity_code": "DIESEL",
        "currency_code": "USD",
        "unit_code": "GAL",
        "provider": "EIA",
        "market": "PHYSICAL",
        "location_code": "USGC",
        "calendar_code": None,
        "description": "Daily USGC diesel spot reference.",
    },
    {
        "code": "GASOLINE_US_REG_W",
        "name": "US Retail Gasoline Regular Weekly",
        "commodity_code": "GASOLINE",
        "currency_code": "USD",
        "unit_code": "GAL",
        "provider": "EIA",
        "market": "US",
        "location_code": None,
        "calendar_code": None,
        "description": "Weekly US retail gasoline reference.",
    },
    {
        "code": "DIESEL_US_RETAIL_W",
        "name": "US Retail Diesel Weekly",
        "commodity_code": "DIESEL",
        "currency_code": "USD",
        "unit_code": "GAL",
        "provider": "EIA",
        "market": "US",
        "location_code": None,
        "calendar_code": None,
        "description": "Weekly US retail diesel reference.",
    },
    {
        "code": "MT_BELVIEU_PROPANE_D",
        "name": "Mont Belvieu Propane Spot Daily",
        "commodity_code": "NGL",
        "currency_code": "USD",
        "unit_code": "GAL",
        "provider": "EIA",
        "market": "PHYSICAL",
        "location_code": "MONT_BELVIEU",
        "calendar_code": None,
        "description": "Delayed public EIA Mont Belvieu propane spot reference.",
    },
    {
        "code": "USGC_JET_FUEL_SPOT_D",
        "name": "US Gulf Coast Jet Fuel Spot Daily",
        "commodity_code": "JET_FUEL",
        "currency_code": "USD",
        "unit_code": "GAL",
        "provider": "EIA",
        "market": "PHYSICAL",
        "location_code": "USGC",
        "calendar_code": None,
        "description": "Delayed public EIA USGC kerosene-type jet fuel spot reference.",
    },
    {
        "code": "USGC_GASOLINE_SPOT_D",
        "name": "US Gulf Coast Gasoline Spot Daily",
        "commodity_code": "GASOLINE",
        "currency_code": "USD",
        "unit_code": "GAL",
        "provider": "EIA",
        "market": "PHYSICAL",
        "location_code": "USGC",
        "calendar_code": None,
        "description": "Delayed public EIA USGC conventional gasoline spot reference.",
    },
    {
        "code": "LNG_ASIA_IMF_M",
        "name": "Asia LNG Monthly (JKM Proxy)",
        "commodity_code": "LNG",
        "currency_code": "USD",
        "unit_code": "MMBTU",
        "provider": "FRED",
        "market": "IMF",
        "location_code": None,
        "calendar_code": None,
        "description": "Delayed IMF/FRED Asia LNG reference used as an open monthly proxy for JKM exposure; not a licensed Platts JKM assessment.",
    },
    {
        "code": "NATGAS_EU_IMF_M",
        "name": "Europe Natural Gas Monthly",
        "commodity_code": "NATURAL_GAS",
        "currency_code": "USD",
        "unit_code": "MMBTU",
        "provider": "FRED",
        "market": "IMF",
        "location_code": None,
        "calendar_code": None,
        "description": "Delayed IMF primary commodity European natural gas reference distributed through FRED.",
    },
    {
        "code": "CORN_GLOBAL_IMF_M",
        "name": "Global Corn Monthly",
        "commodity_code": "CORN",
        "currency_code": "USD",
        "unit_code": "MT",
        "provider": "FRED",
        "market": "IMF",
        "location_code": None,
        "calendar_code": None,
        "description": "Delayed IMF primary commodity corn reference distributed through FRED.",
    },
    {
        "code": "WHEAT_GLOBAL_IMF_M",
        "name": "Global Wheat Monthly",
        "commodity_code": "WHEAT",
        "currency_code": "USD",
        "unit_code": "MT",
        "provider": "FRED",
        "market": "IMF",
        "location_code": None,
        "calendar_code": None,
        "description": "Delayed IMF primary commodity wheat reference distributed through FRED.",
    },
    {
        "code": "COPPER_GLOBAL_IMF_M",
        "name": "Global Copper Monthly",
        "commodity_code": "COPPER",
        "currency_code": "USD",
        "unit_code": "MT",
        "provider": "FRED",
        "market": "IMF",
        "location_code": None,
        "calendar_code": None,
        "description": "Delayed IMF primary commodity copper reference distributed through FRED.",
    },
    {
        "code": "ALUMINUM_GLOBAL_IMF_M",
        "name": "Global Aluminum Monthly",
        "commodity_code": "ALUMINUM",
        "currency_code": "USD",
        "unit_code": "MT",
        "provider": "FRED",
        "market": "IMF",
        "location_code": None,
        "calendar_code": None,
        "description": "Delayed IMF primary commodity aluminum reference distributed through FRED.",
    },
    {
        "code": "NICKEL_GLOBAL_IMF_M",
        "name": "Global Nickel Monthly",
        "commodity_code": "NICKEL",
        "currency_code": "USD",
        "unit_code": "MT",
        "provider": "FRED",
        "market": "IMF",
        "location_code": None,
        "calendar_code": None,
        "description": "Delayed IMF primary commodity nickel reference distributed through FRED.",
    },
    {
        "code": "COAL_AUSTRALIA_IMF_M",
        "name": "Australia Coal Monthly",
        "commodity_code": "COAL",
        "currency_code": "USD",
        "unit_code": "MT",
        "provider": "FRED",
        "market": "IMF",
        "location_code": None,
        "calendar_code": None,
        "description": "Delayed IMF primary commodity Australia coal reference distributed through FRED.",
    },
    {
        "code": "COAL_AUSTRALIA_IMF_Q",
        "name": "Australia Coal Quarterly",
        "commodity_code": "COAL",
        "currency_code": "USD",
        "unit_code": "MT",
        "provider": "FRED",
        "market": "IMF",
        "location_code": None,
        "calendar_code": None,
        "description": "Delayed IMF primary commodity Australia coal quarterly reference distributed through FRED.",
    },
    {
        "code": "CAISO_NP15_RT5M",
        "name": "CAISO NP15 Real-Time 5-Minute Hub LMP",
        "commodity_code": "POWER",
        "currency_code": "USD",
        "unit_code": "MWH",
        "provider": "CAISO",
        "market": "CAISO",
        "location_code": None,
        "calendar_code": "CAISO",
        "description": "Current public CAISO real-time 5-minute NP15 hub LMP reference.",
    },
    {
        "code": "CAISO_SP15_RT5M",
        "name": "CAISO SP15 Real-Time 5-Minute Hub LMP",
        "commodity_code": "POWER",
        "currency_code": "USD",
        "unit_code": "MWH",
        "provider": "CAISO",
        "market": "CAISO",
        "location_code": "SP15",
        "calendar_code": "CAISO",
        "description": "Current public CAISO real-time 5-minute SP15 hub LMP reference.",
    },
    {
        "code": "CAISO_ZP26_RT5M",
        "name": "CAISO ZP26 Real-Time 5-Minute Hub LMP",
        "commodity_code": "POWER",
        "currency_code": "USD",
        "unit_code": "MWH",
        "provider": "CAISO",
        "market": "CAISO",
        "location_code": None,
        "calendar_code": "CAISO",
        "description": "Current public CAISO real-time 5-minute ZP26 hub LMP reference.",
    },
    {
        "code": "ERCOT_HB_HOUSTON_RT15M",
        "name": "ERCOT Houston Real-Time Hub SPP",
        "commodity_code": "POWER",
        "currency_code": "USD",
        "unit_code": "MWH",
        "provider": "ERCOT",
        "market": "ERCOT",
        "location_code": None,
        "calendar_code": "ERCOT",
        "description": "Current public ERCOT real-time Houston hub settlement point price reference.",
    },
    {
        "code": "ERCOT_HB_NORTH_RT15M",
        "name": "ERCOT North Real-Time Hub SPP",
        "commodity_code": "POWER",
        "currency_code": "USD",
        "unit_code": "MWH",
        "provider": "ERCOT",
        "market": "ERCOT",
        "location_code": "ERCOT_NORTH",
        "calendar_code": "ERCOT",
        "description": "Current public ERCOT real-time North hub settlement point price reference.",
    },
    {
        "code": "ERCOT_HB_SOUTH_RT15M",
        "name": "ERCOT South Real-Time Hub SPP",
        "commodity_code": "POWER",
        "currency_code": "USD",
        "unit_code": "MWH",
        "provider": "ERCOT",
        "market": "ERCOT",
        "location_code": None,
        "calendar_code": "ERCOT",
        "description": "Current public ERCOT real-time South hub settlement point price reference.",
    },
    {
        "code": "ERCOT_HB_WEST_RT15M",
        "name": "ERCOT West Real-Time Hub SPP",
        "commodity_code": "POWER",
        "currency_code": "USD",
        "unit_code": "MWH",
        "provider": "ERCOT",
        "market": "ERCOT",
        "location_code": None,
        "calendar_code": "ERCOT",
        "description": "Current public ERCOT real-time West hub settlement point price reference.",
    },
    {
        "code": "PJM_WEST_ONPEAK_DA",
        "name": "PJM West On-Peak Day Ahead",
        "commodity_code": "POWER",
        "currency_code": "USD",
        "unit_code": "MWH",
        "provider": "INTERNAL",
        "market": "PJM",
        "location_code": "PJM_WEST",
        "calendar_code": "PJM",
        "description": "Power hub day-ahead reference.",
    },
]

SOURCE_ROWS = [
    {
        "price_index_code": "HENRY_HUB_GAS_D",
        "provider": "EIA",
        "dataset_code": "NG",
        "series_id": "NG.RNGWHHD.D",
        "frequency": "daily",
        "source_unit": "MMBTU",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "WTI_CUSHING_PHYS_D",
        "provider": "EIA",
        "dataset_code": "PET",
        "series_id": "PET.RWTC.D",
        "frequency": "daily",
        "source_unit": "BBL",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "BRENT_SPOT_D",
        "provider": "EIA",
        "dataset_code": "PET",
        "series_id": "PET.RBRTE.D",
        "frequency": "daily",
        "source_unit": "BBL",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "USGC_DIESEL_SPOT_D",
        "provider": "EIA",
        "dataset_code": "PET",
        "series_id": "PET.EER_EPD2F_PF4_Y35NY_DPG.D",
        "frequency": "daily",
        "source_unit": "GAL",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "GASOLINE_US_REG_W",
        "provider": "EIA",
        "dataset_code": "PET",
        "series_id": "PET.EMM_EPMRR_PTE_NUS_DPG.W",
        "frequency": "weekly",
        "source_unit": "GAL",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "DIESEL_US_RETAIL_W",
        "provider": "EIA",
        "dataset_code": "PET",
        "series_id": "PET.EMD_EPD2DXL0_PTE_NUS_DPG.W",
        "frequency": "weekly",
        "source_unit": "GAL",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "MT_BELVIEU_PROPANE_D",
        "provider": "EIA",
        "dataset_code": "PET",
        "series_id": "PET.EER_EPLLPA_PF4_Y44MB_DPG.D",
        "frequency": "daily",
        "source_unit": "GAL",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "USGC_JET_FUEL_SPOT_D",
        "provider": "EIA",
        "dataset_code": "PET",
        "series_id": "PET.EER_EPJK_PF4_RGC_DPG.D",
        "frequency": "daily",
        "source_unit": "GAL",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "USGC_GASOLINE_SPOT_D",
        "provider": "EIA",
        "dataset_code": "PET",
        "series_id": "PET.EER_EPMRU_PF4_RGC_DPG.D",
        "frequency": "daily",
        "source_unit": "GAL",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "LNG_ASIA_IMF_M",
        "provider": "FRED",
        "dataset_code": "IMF_PRIMARY_COMMODITY_PRICES",
        "series_id": "PNGASJPUSDM",
        "frequency": "monthly",
        "source_unit": "MMBTU",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "NATGAS_EU_IMF_M",
        "provider": "FRED",
        "dataset_code": "IMF_PRIMARY_COMMODITY_PRICES",
        "series_id": "PNGASEUUSDM",
        "frequency": "monthly",
        "source_unit": "MMBTU",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "CORN_GLOBAL_IMF_M",
        "provider": "FRED",
        "dataset_code": "IMF_PRIMARY_COMMODITY_PRICES",
        "series_id": "PMAIZMTUSDM",
        "frequency": "monthly",
        "source_unit": "MT",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "WHEAT_GLOBAL_IMF_M",
        "provider": "FRED",
        "dataset_code": "IMF_PRIMARY_COMMODITY_PRICES",
        "series_id": "PWHEAMTUSDM",
        "frequency": "monthly",
        "source_unit": "MT",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "COPPER_GLOBAL_IMF_M",
        "provider": "FRED",
        "dataset_code": "IMF_PRIMARY_COMMODITY_PRICES",
        "series_id": "PCOPPUSDM",
        "frequency": "monthly",
        "source_unit": "MT",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "ALUMINUM_GLOBAL_IMF_M",
        "provider": "FRED",
        "dataset_code": "IMF_PRIMARY_COMMODITY_PRICES",
        "series_id": "PALUMUSDM",
        "frequency": "monthly",
        "source_unit": "MT",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "NICKEL_GLOBAL_IMF_M",
        "provider": "FRED",
        "dataset_code": "IMF_PRIMARY_COMMODITY_PRICES",
        "series_id": "PNICKUSDM",
        "frequency": "monthly",
        "source_unit": "MT",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "COAL_AUSTRALIA_IMF_M",
        "provider": "FRED",
        "dataset_code": "IMF_PRIMARY_COMMODITY_PRICES",
        "series_id": "PCOALAUUSDM",
        "frequency": "monthly",
        "source_unit": "MT",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "COAL_AUSTRALIA_IMF_Q",
        "provider": "FRED",
        "dataset_code": "IMF_PRIMARY_COMMODITY_PRICES",
        "series_id": "PCOALAUUSDQ",
        "frequency": "quarterly",
        "source_unit": "MT",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "CAISO_NP15_RT5M",
        "provider": "CAISO",
        "dataset_code": "PRC_HUB_LMP",
        "series_id": "NP15",
        "frequency": "daily",
        "source_unit": "MWH",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "CAISO_SP15_RT5M",
        "provider": "CAISO",
        "dataset_code": "PRC_HUB_LMP",
        "series_id": "SP15",
        "frequency": "daily",
        "source_unit": "MWH",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "CAISO_ZP26_RT5M",
        "provider": "CAISO",
        "dataset_code": "PRC_HUB_LMP",
        "series_id": "ZP26",
        "frequency": "daily",
        "source_unit": "MWH",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "ERCOT_HB_HOUSTON_RT15M",
        "provider": "ERCOT",
        "dataset_code": "REAL_TIME_SPP",
        "series_id": "HB_HOUSTON",
        "frequency": "daily",
        "source_unit": "MWH",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "ERCOT_HB_NORTH_RT15M",
        "provider": "ERCOT",
        "dataset_code": "REAL_TIME_SPP",
        "series_id": "HB_NORTH",
        "frequency": "daily",
        "source_unit": "MWH",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "ERCOT_HB_SOUTH_RT15M",
        "provider": "ERCOT",
        "dataset_code": "REAL_TIME_SPP",
        "series_id": "HB_SOUTH",
        "frequency": "daily",
        "source_unit": "MWH",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
    {
        "price_index_code": "ERCOT_HB_WEST_RT15M",
        "provider": "ERCOT",
        "dataset_code": "REAL_TIME_SPP",
        "series_id": "HB_WEST",
        "frequency": "daily",
        "source_unit": "MWH",
        "source_currency_code": "USD",
        "transform_rule": None,
    },
]

NEW_PRICE_INDEX_CODES = tuple(
    row["code"]
    for row in PRICE_INDEX_ROWS
    if row["code"]
    not in {
        "BRENT_SPOT_D",
        "DIESEL_US_RETAIL_W",
        "GASOLINE_US_REG_W",
        "HENRY_HUB_GAS_D",
        "USGC_DIESEL_SPOT_D",
        "WTI_CUSHING_PHYS_D",
    }
)

NEW_SOURCE_SERIES_IDS = tuple(
    row["series_id"]
    for row in SOURCE_ROWS
    if row["series_id"]
    not in {
        "NG.RNGWHHD.D",
        "PET.RWTC.D",
        "PET.RBRTE.D",
        "PET.EER_EPD2F_PF4_Y35NY_DPG.D",
        "PET.EMM_EPMRR_PTE_NUS_DPG.W",
        "PET.EMD_EPD2DXL0_PTE_NUS_DPG.W",
    }
)


def upgrade() -> None:
    bind = op.get_bind()

    commodity_stmt = sa.text(
        """
        INSERT INTO reference_commodities (
            code,
            commodity_class,
            allowed_transport_modes,
            name,
            description,
            is_active,
            effective_from,
            effective_to,
            created_at,
            created_by,
            updated_at,
            updated_by,
            version
        )
        VALUES (
            :code,
            :commodity_class,
            CAST(:allowed_transport_modes AS JSON),
            :name,
            :description,
            TRUE,
            NULL,
            NULL,
            NOW(),
            'migration',
            NOW(),
            'migration',
            1
        )
        ON CONFLICT (code) DO UPDATE
        SET commodity_class = EXCLUDED.commodity_class,
            allowed_transport_modes = EXCLUDED.allowed_transport_modes,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_active = TRUE,
            updated_at = NOW(),
            updated_by = 'migration',
            version = reference_commodities.version + 1
        """
    )
    for row in COMMODITY_ROWS:
        bind.execute(
            commodity_stmt,
            {
                **row,
                "allowed_transport_modes": json.dumps(row["allowed_transport_modes"]),
            },
        )

    price_index_stmt = sa.text(
        """
        INSERT INTO reference_price_indices (
            code,
            name,
            commodity_code,
            currency_code,
            unit_code,
            provider,
            market,
            location_code,
            calendar_code,
            description,
            is_active,
            effective_from,
            effective_to,
            created_at,
            created_by,
            updated_at,
            updated_by,
            version
        )
        VALUES (
            :code,
            :name,
            :commodity_code,
            :currency_code,
            :unit_code,
            :provider,
            :market,
            :location_code,
            :calendar_code,
            :description,
            TRUE,
            NULL,
            NULL,
            NOW(),
            'migration',
            NOW(),
            'migration',
            1
        )
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            commodity_code = EXCLUDED.commodity_code,
            currency_code = EXCLUDED.currency_code,
            unit_code = EXCLUDED.unit_code,
            provider = EXCLUDED.provider,
            market = EXCLUDED.market,
            location_code = EXCLUDED.location_code,
            calendar_code = EXCLUDED.calendar_code,
            description = EXCLUDED.description,
            is_active = TRUE,
            updated_at = NOW(),
            updated_by = 'migration',
            version = reference_price_indices.version + 1
        """
    )
    for row in PRICE_INDEX_ROWS:
        bind.execute(price_index_stmt, row)

    source_stmt = sa.text(
        """
        INSERT INTO reference_price_index_sources (
            price_index_code,
            provider,
            dataset_code,
            series_id,
            frequency,
            source_unit,
            source_currency_code,
            transform_rule,
            is_active,
            created_at,
            created_by,
            updated_at,
            updated_by,
            version
        )
        VALUES (
            :price_index_code,
            :provider,
            :dataset_code,
            :series_id,
            :frequency,
            :source_unit,
            :source_currency_code,
            :transform_rule,
            TRUE,
            NOW(),
            'migration',
            NOW(),
            'migration',
            1
        )
        ON CONFLICT (provider, series_id) DO UPDATE
        SET price_index_code = EXCLUDED.price_index_code,
            dataset_code = EXCLUDED.dataset_code,
            frequency = EXCLUDED.frequency,
            source_unit = EXCLUDED.source_unit,
            source_currency_code = EXCLUDED.source_currency_code,
            transform_rule = EXCLUDED.transform_rule,
            is_active = TRUE,
            updated_at = NOW(),
            updated_by = 'migration',
            version = reference_price_index_sources.version + 1
        """
    )
    for row in SOURCE_ROWS:
        bind.execute(source_stmt, row)

    bind.execute(
        sa.text(
            """
            UPDATE reference_price_indices
            SET is_active = FALSE,
                updated_at = NOW(),
                updated_by = 'migration',
                version = version + 1
            WHERE code = 'WTI_CUSHING_D'
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE reference_price_index_sources
            SET is_active = FALSE,
                updated_at = NOW(),
                updated_by = 'migration',
                version = version + 1
            WHERE series_id = ANY(:series_ids)
            """
        ),
        {"series_ids": list(NEW_SOURCE_SERIES_IDS)},
    )
    bind.execute(
        sa.text(
            """
            UPDATE reference_price_indices
            SET is_active = FALSE,
                updated_at = NOW(),
                updated_by = 'migration',
                version = version + 1
            WHERE code = ANY(:codes)
            """
        ),
        {"codes": list(NEW_PRICE_INDEX_CODES)},
    )
    bind.execute(
        sa.text(
            """
            UPDATE reference_price_indices
            SET is_active = TRUE,
                updated_at = NOW(),
                updated_by = 'migration',
                version = version + 1
            WHERE code = 'WTI_CUSHING_D'
            """
        )
    )
