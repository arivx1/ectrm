from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import pycountry
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.domains.reference_data.services.location_seed_catalog import (
    COUNTRY_TO_CONTINENT_CODE,
    STANDARD_CONTINENTS,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_location import ReferenceLocation

_RAW_TO_CANONICAL_COMMODITY_CODE = {
    "ELECTRICITY": "POWER",
    "NAT_GAS": "NATURAL_GAS",
    "PETROLEUM_PRODUCTS": "REFINED_PRODUCTS",
}

_CANONICAL_COMMODITY_DEFINITIONS: dict[str, dict[str, str]] = {
    "CRUDE_OIL": {
        "name": "Crude Oil",
        "commodity_class": "CRUDE_OIL",
        "description": "Generic crude oil exposure used for asset reference normalization.",
    },
    "REFINED_PRODUCTS": {
        "name": "Refined Products",
        "commodity_class": "REFINED_PRODUCTS",
        "description": "Generic refined products exposure used for asset reference normalization.",
    },
    "NGL": {
        "name": "NGL",
        "commodity_class": "NGL",
        "description": "Natural gas liquids exposure used for asset reference normalization.",
    },
    "PETROCHEMICALS": {
        "name": "Petrochemicals",
        "commodity_class": "CHEMICAL",
        "description": "Generic petrochemical exposure used for asset reference normalization.",
    },
    "STEEL": {
        "name": "Steel",
        "commodity_class": "BASE_METAL",
        "description": "Steel exposure used for industrial asset reference normalization.",
    },
    "BITUMEN": {
        "name": "Bitumen",
        "commodity_class": "CRUDE_OIL",
        "description": "Bitumen exposure used for asset reference normalization.",
    },
    "CONDENSATE": {
        "name": "Condensate",
        "commodity_class": "NGL",
        "description": "Condensate exposure used for asset reference normalization.",
    },
    "DILUENT": {
        "name": "Diluent",
        "commodity_class": "NGL",
        "description": "Diluent exposure used for asset reference normalization.",
    },
    "LIQUID_HYDROCARBONS": {
        "name": "Liquid Hydrocarbons",
        "commodity_class": "OTHER",
        "description": "Liquid hydrocarbon exposure used for asset reference normalization.",
    },
}

_CONTINENT_NAME_BY_CODE = dict(STANDARD_CONTINENTS)
_CONTINENT_LABEL_BY_TOKEN = {
    "AF": "Africa",
    "AN": "Antarctica",
    "AS": "Asia",
    "EU": "Europe",
    "NA": "North America",
    "OC": "Oceania",
    "SA": "South America",
}


@dataclass(frozen=True, slots=True)
class AssetReferenceNormalizationSummary:
    asset_count: int
    commodity_assets_rewritten: int
    commodities_created: int
    location_assets_rewritten: int
    locations_created: int
    asset_reality: str | None


def normalize_reference_asset_links(
    db: Session,
    *,
    requested_by: str,
    asset_reality: str | None = "REAL",
) -> AssetReferenceNormalizationSummary:
    actor_id = resolve_audit_actor_id(requested_by)
    now = datetime.now(timezone.utc)
    commodity_by_code = _load_records_by_code(db, ReferenceCommodity)
    location_by_code = _load_records_by_code(db, ReferenceLocation)

    stmt = select(ReferenceAsset)
    if asset_reality is not None:
        stmt = stmt.where(ReferenceAsset.asset_reality == normalize_code(asset_reality))
    assets = db.execute(stmt.order_by(ReferenceAsset.code.asc())).scalars().all()

    commodity_assets_rewritten = 0
    commodities_created = 0
    location_assets_rewritten = 0
    locations_created = 0

    for asset in assets:
        asset_changed = False

        normalized_commodity_code, created_commodities = _normalize_asset_commodity_code(
            db,
            commodity_by_code=commodity_by_code,
            raw_code=asset.commodity_code,
            actor_id=actor_id,
            now=now,
        )
        commodities_created += created_commodities
        if normalized_commodity_code != asset.commodity_code:
            asset.commodity_code = normalized_commodity_code
            commodity_assets_rewritten += 1
            asset_changed = True

        normalized_location_code, created_locations = _normalize_asset_location_code(
            db,
            location_by_code=location_by_code,
            raw_code=asset.location_code,
            actor_id=actor_id,
            now=now,
        )
        locations_created += created_locations
        if normalized_location_code != asset.location_code:
            asset.location_code = normalized_location_code
            location_assets_rewritten += 1
            asset_changed = True

        if asset_changed:
            asset.updated_at = now
            asset.updated_by = actor_id
            asset.version += 1

    db.commit()
    return AssetReferenceNormalizationSummary(
        asset_count=len(assets),
        commodity_assets_rewritten=commodity_assets_rewritten,
        commodities_created=commodities_created,
        location_assets_rewritten=location_assets_rewritten,
        locations_created=locations_created,
        asset_reality=normalize_code(asset_reality) if asset_reality is not None else None,
    )


def _load_records_by_code(db: Session, model) -> dict[str, Any]:
    return {
        record.code: record
        for record in db.execute(select(model)).scalars().all()
    }


def _normalize_asset_commodity_code(
    db: Session,
    *,
    commodity_by_code: dict[str, ReferenceCommodity],
    raw_code: str | None,
    actor_id: str,
    now: datetime,
) -> tuple[str | None, int]:
    if raw_code is None:
        return None, 0

    normalized_raw_code = normalize_code(raw_code)
    canonical_code = _RAW_TO_CANONICAL_COMMODITY_CODE.get(normalized_raw_code, normalized_raw_code)
    created_count = _ensure_commodity_exists(
        db,
        commodity_by_code=commodity_by_code,
        canonical_code=canonical_code,
        actor_id=actor_id,
        now=now,
    )
    return canonical_code, created_count


def _ensure_commodity_exists(
    db: Session,
    *,
    commodity_by_code: dict[str, ReferenceCommodity],
    canonical_code: str,
    actor_id: str,
    now: datetime,
) -> int:
    existing = commodity_by_code.get(canonical_code)
    if existing is not None:
        if not existing.is_active:
            existing.is_active = True
            existing.updated_at = now
            existing.updated_by = actor_id
            existing.version += 1
        return 0

    definition = _CANONICAL_COMMODITY_DEFINITIONS.get(canonical_code)
    if definition is None:
        raise ValueError(f"No canonical commodity definition is configured for '{canonical_code}'")

    record = ReferenceCommodity(
        code=canonical_code,
        name=definition["name"],
        commodity_class=definition["commodity_class"],
        description=definition["description"],
        is_active=True,
        effective_from=None,
        effective_to=None,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
    )
    db.add(record)
    commodity_by_code[canonical_code] = record
    return 1


def _normalize_asset_location_code(
    db: Session,
    *,
    location_by_code: dict[str, ReferenceLocation],
    raw_code: str | None,
    actor_id: str,
    now: datetime,
) -> tuple[str | None, int]:
    if raw_code is None:
        return None, 0

    normalized_raw_code = normalize_code(raw_code).replace("-", "_")
    if normalized_raw_code in location_by_code:
        return normalized_raw_code, 0

    created_count = 0
    country = pycountry.countries.get(alpha_2=normalized_raw_code)
    if country is not None:
        canonical_code, created = _ensure_country_location(
            db,
            location_by_code=location_by_code,
            country_code=country.alpha_2,
            actor_id=actor_id,
            now=now,
        )
        return canonical_code, created

    subdivision = pycountry.subdivisions.get(code=normalized_raw_code.replace("_", "-"))
    if subdivision is not None:
        canonical_code, created = _ensure_subdivision_location(
            db,
            location_by_code=location_by_code,
            subdivision_code=subdivision.code,
            actor_id=actor_id,
            now=now,
        )
        return canonical_code, created

    if normalized_raw_code == "ASEAN":
        created_count += _ensure_continent_location(
            db,
            location_by_code=location_by_code,
            continent_code="AS",
            actor_id=actor_id,
            now=now,
        )[1]
        canonical_code, created = _ensure_location_row(
            db,
            location_by_code=location_by_code,
            code="MARKET_AREA_ASEAN",
            values={
                "name": "ASEAN Market Area",
                "location_kind": "REGION",
                "location_type": "MARKET_AREA",
                "parent_location_code": "CONTINENT_AS",
                "market": None,
                "city": None,
                "subdivision_code": None,
                "country_code": None,
                "continent_code": "AS",
                "latitude": None,
                "longitude": None,
                "region": "Southeast Asia",
                "timezone": None,
                "description": "ASEAN regional market area created during asset reference normalization.",
            },
            actor_id=actor_id,
            now=now,
        )
        return canonical_code, created_count + created

    if normalized_raw_code == "US_GOM":
        created_count += _ensure_country_location(
            db,
            location_by_code=location_by_code,
            country_code="US",
            actor_id=actor_id,
            now=now,
        )[1]
        canonical_code, created = _ensure_location_row(
            db,
            location_by_code=location_by_code,
            code="BASIN_US_GOM",
            values={
                "name": "US Gulf of Mexico",
                "location_kind": "REGION",
                "location_type": "BASIN",
                "parent_location_code": "COUNTRY_US",
                "market": None,
                "city": None,
                "subdivision_code": None,
                "country_code": "US",
                "continent_code": "NA",
                "latitude": None,
                "longitude": None,
                "region": "Gulf of Mexico",
                "timezone": None,
                "description": "US Gulf of Mexico basin created during asset reference normalization.",
            },
            actor_id=actor_id,
            now=now,
        )
        return canonical_code, created_count + created

    canonical_code, created = _ensure_composite_location(
        db,
        location_by_code=location_by_code,
        raw_code=normalized_raw_code,
        actor_id=actor_id,
        now=now,
    )
    return canonical_code, created


def _ensure_country_location(
    db: Session,
    *,
    location_by_code: dict[str, ReferenceLocation],
    country_code: str,
    actor_id: str,
    now: datetime,
) -> tuple[str, int]:
    normalized_country_code = normalize_code(country_code)
    canonical_code = f"COUNTRY_{normalized_country_code}"
    existing = location_by_code.get(canonical_code)
    if existing is not None:
        if not existing.is_active:
            existing.is_active = True
            existing.updated_at = now
            existing.updated_by = actor_id
            existing.version += 1
        return canonical_code, 0

    country = pycountry.countries.get(alpha_2=normalized_country_code)
    if country is None:
        raise ValueError(f"Unsupported ISO country code '{normalized_country_code}'")

    continent_code = COUNTRY_TO_CONTINENT_CODE.get(normalized_country_code)
    created_count = 0
    parent_location_code = None
    if continent_code is not None:
        parent_location_code, created_count = _ensure_continent_location(
            db,
            location_by_code=location_by_code,
            continent_code=continent_code,
            actor_id=actor_id,
            now=now,
        )

    _, created = _ensure_location_row(
        db,
        location_by_code=location_by_code,
        code=canonical_code,
        values={
            "name": country.name,
            "location_kind": "REGION",
            "location_type": "COUNTRY",
            "parent_location_code": parent_location_code,
            "market": None,
            "city": None,
            "subdivision_code": None,
            "country_code": normalized_country_code,
            "continent_code": continent_code,
            "latitude": None,
            "longitude": None,
            "region": None,
            "timezone": None,
            "description": f"ISO 3166-1 country region for {country.name}, created during asset reference normalization.",
        },
        actor_id=actor_id,
        now=now,
    )
    return canonical_code, created_count + created


def _ensure_subdivision_location(
    db: Session,
    *,
    location_by_code: dict[str, ReferenceLocation],
    subdivision_code: str,
    actor_id: str,
    now: datetime,
) -> tuple[str, int]:
    normalized_subdivision_code = normalize_code(subdivision_code.replace("_", "-"))
    subdivision = pycountry.subdivisions.get(code=normalized_subdivision_code)
    if subdivision is None:
        raise ValueError(f"Unsupported ISO subdivision code '{normalized_subdivision_code}'")

    country_code = subdivision.country_code
    country_location_code, created_count = _ensure_country_location(
        db,
        location_by_code=location_by_code,
        country_code=country_code,
        actor_id=actor_id,
        now=now,
    )

    canonical_code = f"SUBDIVISION_{normalized_subdivision_code.replace('-', '_')}"
    _, created = _ensure_location_row(
        db,
        location_by_code=location_by_code,
        code=canonical_code,
        values={
            "name": subdivision.name,
            "location_kind": "REGION",
            "location_type": _normalize_subdivision_location_type(subdivision.type),
            "parent_location_code": country_location_code,
            "market": None,
            "city": None,
            "subdivision_code": normalized_subdivision_code,
            "country_code": country_code,
            "continent_code": COUNTRY_TO_CONTINENT_CODE.get(country_code),
            "latitude": None,
            "longitude": None,
            "region": None,
            "timezone": None,
            "description": f"ISO 3166-2 {subdivision.type.lower()} region created during asset reference normalization.",
        },
        actor_id=actor_id,
        now=now,
    )
    return canonical_code, created_count + created


def _ensure_continent_location(
    db: Session,
    *,
    location_by_code: dict[str, ReferenceLocation],
    continent_code: str,
    actor_id: str,
    now: datetime,
) -> tuple[str, int]:
    normalized_continent_code = normalize_code(continent_code)
    canonical_code = f"CONTINENT_{normalized_continent_code}"
    existing = location_by_code.get(canonical_code)
    if existing is not None:
        if not existing.is_active:
            existing.is_active = True
            existing.updated_at = now
            existing.updated_by = actor_id
            existing.version += 1
        return canonical_code, 0

    continent_name = _CONTINENT_NAME_BY_CODE.get(normalized_continent_code)
    if continent_name is None:
        raise ValueError(f"Unsupported continent code '{normalized_continent_code}'")

    _, created = _ensure_location_row(
        db,
        location_by_code=location_by_code,
        code=canonical_code,
        values={
            "name": continent_name,
            "location_kind": "REGION",
            "location_type": "CONTINENT",
            "parent_location_code": None,
            "market": None,
            "city": None,
            "subdivision_code": None,
            "country_code": None,
            "continent_code": normalized_continent_code,
            "latitude": None,
            "longitude": None,
            "region": None,
            "timezone": None,
            "description": f"Continent region for {continent_name}, created during asset reference normalization.",
        },
        actor_id=actor_id,
        now=now,
    )
    return canonical_code, created


def _ensure_composite_location(
    db: Session,
    *,
    location_by_code: dict[str, ReferenceLocation],
    raw_code: str,
    actor_id: str,
    now: datetime,
) -> tuple[str, int]:
    parts = [part for part in raw_code.replace("-", "_").split("_") if part]
    if not parts:
        raise ValueError("Composite location code cannot be empty")

    first_country = pycountry.countries.get(alpha_2=parts[0])
    common_continent_code = None
    created_count = 0

    if first_country is not None and len(parts) > 1 and all(
        pycountry.subdivisions.get(code=f"{first_country.alpha_2}-{part}") is not None
        for part in parts[1:]
    ):
        created_count += _ensure_country_location(
            db,
            location_by_code=location_by_code,
            country_code=first_country.alpha_2,
            actor_id=actor_id,
            now=now,
        )[1]
        name = " / ".join(
            pycountry.subdivisions.get(code=f"{first_country.alpha_2}-{part}").name
            for part in parts[1:]
        )
        canonical_code = f"REGION_{raw_code}"
        _, created = _ensure_location_row(
            db,
            location_by_code=location_by_code,
            code=canonical_code,
            values={
                "name": f"{name} Regional Area",
                "location_kind": "REGION",
                "location_type": "REGION",
                "parent_location_code": f"COUNTRY_{first_country.alpha_2}",
                "market": None,
                "city": None,
                "subdivision_code": None,
                "country_code": first_country.alpha_2,
                "continent_code": COUNTRY_TO_CONTINENT_CODE.get(first_country.alpha_2),
                "latitude": None,
                "longitude": None,
                "region": None,
                "timezone": None,
                "description": f"Domestic multi-subdivision region created from source code '{raw_code}'.",
            },
            actor_id=actor_id,
            now=now,
        )
        return canonical_code, created_count + created

    component_names: list[str] = []
    component_continent_codes: set[str] = set()
    all_components_supported = True
    for part in parts:
        country = pycountry.countries.get(alpha_2=part)
        if country is not None:
            created_count += _ensure_country_location(
                db,
                location_by_code=location_by_code,
                country_code=country.alpha_2,
                actor_id=actor_id,
                now=now,
            )[1]
            component_names.append(country.name)
            continent_code = COUNTRY_TO_CONTINENT_CODE.get(country.alpha_2)
            if continent_code is not None:
                component_continent_codes.add(continent_code)
            continue

        continent_label = _CONTINENT_LABEL_BY_TOKEN.get(part)
        if continent_label is not None:
            component_names.append(continent_label)
            component_continent_codes.add(part)
            continue

        all_components_supported = False
        break

    if all_components_supported and len(component_names) == len(parts):
        if len(component_continent_codes) == 1:
            common_continent_code = next(iter(component_continent_codes))
            created_count += _ensure_continent_location(
                db,
                location_by_code=location_by_code,
                continent_code=common_continent_code,
                actor_id=actor_id,
                now=now,
            )[1]
        canonical_code = f"CORRIDOR_{raw_code}"
        _, created = _ensure_location_row(
            db,
            location_by_code=location_by_code,
            code=canonical_code,
            values={
                "name": " / ".join(component_names) + " Corridor",
                "location_kind": "REGION",
                "location_type": "CORRIDOR",
                "parent_location_code": (
                    f"CONTINENT_{common_continent_code}"
                    if common_continent_code is not None
                    else None
                ),
                "market": None,
                "city": None,
                "subdivision_code": None,
                "country_code": None,
                "continent_code": common_continent_code,
                "latitude": None,
                "longitude": None,
                "region": None,
                "timezone": None,
                "description": f"Cross-border corridor created from source code '{raw_code}'.",
            },
            actor_id=actor_id,
            now=now,
        )
        return canonical_code, created_count + created

    parent_location_code = None
    continent_code = None
    country_code = first_country.alpha_2 if first_country is not None else None
    if country_code is not None:
        created_count += _ensure_country_location(
            db,
            location_by_code=location_by_code,
            country_code=country_code,
            actor_id=actor_id,
            now=now,
        )[1]
        parent_location_code = f"COUNTRY_{country_code}"
        continent_code = COUNTRY_TO_CONTINENT_CODE.get(country_code)
    canonical_code = f"REGION_{raw_code}"
    label = raw_code.replace("_", " / ")
    _, created = _ensure_location_row(
        db,
        location_by_code=location_by_code,
        code=canonical_code,
        values={
            "name": f"{label} Region",
            "location_kind": "REGION",
            "location_type": "REGION",
            "parent_location_code": parent_location_code,
            "market": None,
            "city": None,
            "subdivision_code": None,
            "country_code": country_code,
            "continent_code": continent_code,
            "latitude": None,
            "longitude": None,
            "region": None,
            "timezone": None,
            "description": f"Generic region created from source code '{raw_code}'.",
        },
        actor_id=actor_id,
        now=now,
    )
    return canonical_code, created_count + created


def _ensure_location_row(
    db: Session,
    *,
    location_by_code: dict[str, ReferenceLocation],
    code: str,
    values: dict[str, Any],
    actor_id: str,
    now: datetime,
) -> tuple[str, int]:
    existing = location_by_code.get(code)
    if existing is not None:
        if not existing.is_active:
            existing.is_active = True
            existing.updated_at = now
            existing.updated_by = actor_id
            existing.version += 1
        return code, 0

    record = ReferenceLocation(
        code=code,
        is_active=True,
        effective_from=None,
        effective_to=None,
        created_at=now,
        created_by=actor_id,
        updated_at=now,
        updated_by=actor_id,
        version=1,
        **values,
    )
    db.add(record)
    location_by_code[code] = record
    return code, 1


def _normalize_subdivision_location_type(raw_type: str) -> str:
    normalized_type = raw_type.strip().lower()
    if "state" in normalized_type or "territory" in normalized_type:
        return "STATE"
    if any(
        token in normalized_type
        for token in (
            "province",
            "prefecture",
            "emirate",
            "governorate",
        )
    ):
        return "PROVINCE"
    return "REGION"
