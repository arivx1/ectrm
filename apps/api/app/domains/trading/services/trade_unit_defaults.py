from __future__ import annotations


DEFAULT_QUANTITY_UNIT_BY_COMMODITY = {
    "BRENT": "BBL",
    "DIESEL": "BBL",
    "FUEL_OIL": "BBL",
    "GASOLINE": "BBL",
    "JET_FUEL": "BBL",
    "LNG": "MMBTU",
    "NATURAL_GAS": "MMBTU",
    "NGL": "BBL",
    "POWER": "MWH",
    "WTI": "BBL",
}

DEFAULT_QUANTITY_UNIT_BY_COMMODITY_CLASS = {
    "CRUDE_OIL": "BBL",
    "NATURAL_GAS": "MMBTU",
    "POWER": "MWH",
    "REFINED_PRODUCTS": "BBL",
}

DEFAULT_PRICE_UNIT_BY_COMMODITY = {
    "BRENT": "BBL",
    "DIESEL": "GAL",
    "FUEL_OIL": "GAL",
    "GASOLINE": "GAL",
    "JET_FUEL": "GAL",
    "LNG": "MMBTU",
    "NATURAL_GAS": "MMBTU",
    "NGL": "GAL",
    "POWER": "MWH",
    "WTI": "BBL",
}

DEFAULT_PRICE_UNIT_BY_COMMODITY_CLASS = {
    "CRUDE_OIL": "BBL",
    "NATURAL_GAS": "MMBTU",
    "POWER": "MWH",
    "REFINED_PRODUCTS": "GAL",
}

DEFAULT_PRICE_UNIT_BY_PRICE_INDEX = {
    "BRENT_SPOT_D": "BBL",
    "DIESEL_US_RETAIL_W": "GAL",
    "GASOLINE_US_REG_W": "GAL",
    "HENRY_HUB_GAS_D": "MMBTU",
    "PJM_WEST_ONPEAK_DA": "MWH",
    "USGC_DIESEL_SPOT_D": "GAL",
    "WTI_CUSHING_D": "BBL",
    "WTI_CUSHING_PHYS_D": "BBL",
}


def normalize_unit_default_token(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def default_quantity_unit_code(
    *,
    commodity_class: object | None,
    commodity: object | None,
) -> str | None:
    normalized_commodity = normalize_unit_default_token(commodity)
    if normalized_commodity in DEFAULT_QUANTITY_UNIT_BY_COMMODITY:
        return DEFAULT_QUANTITY_UNIT_BY_COMMODITY[normalized_commodity]

    normalized_class = normalize_unit_default_token(commodity_class)
    if normalized_class in DEFAULT_QUANTITY_UNIT_BY_COMMODITY_CLASS:
        return DEFAULT_QUANTITY_UNIT_BY_COMMODITY_CLASS[normalized_class]

    return None


def default_price_unit_code(
    *,
    commodity_class: object | None,
    commodity: object | None,
    price_index_code: object | None = None,
) -> str | None:
    normalized_index = normalize_unit_default_token(price_index_code)
    if normalized_index in DEFAULT_PRICE_UNIT_BY_PRICE_INDEX:
        return DEFAULT_PRICE_UNIT_BY_PRICE_INDEX[normalized_index]

    normalized_commodity = normalize_unit_default_token(commodity)
    if normalized_commodity in DEFAULT_PRICE_UNIT_BY_COMMODITY:
        return DEFAULT_PRICE_UNIT_BY_COMMODITY[normalized_commodity]

    normalized_class = normalize_unit_default_token(commodity_class)
    if normalized_class in DEFAULT_PRICE_UNIT_BY_COMMODITY_CLASS:
        return DEFAULT_PRICE_UNIT_BY_COMMODITY_CLASS[normalized_class]

    return default_quantity_unit_code(commodity_class=commodity_class, commodity=commodity)
