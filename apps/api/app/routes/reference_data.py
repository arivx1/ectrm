from __future__ import annotations

from typing import List, Optional, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.deps.db import get_db
from apps.api.app.domains.reference_data.services.records import (
    create_reference_record,
    get_reference_record,
    list_reference_records,
    normalize_code,
    set_reference_active_state,
    update_reference_record,
)
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.schemas.reference_data import (
    BookCreate,
    BookOut,
    BookStatusUpdate,
    BookUpdate,
    CommodityCreate,
    CommodityOut,
    CommodityStatusUpdate,
    CommodityUpdate,
    CurrencyCreate,
    CurrencyOut,
    CurrencyStatusUpdate,
    CurrencyUpdate,
    LocationCreate,
    LocationOut,
    LocationStatusUpdate,
    LocationUpdate,
    PriceIndexCreate,
    PriceIndexOut,
    PriceIndexStatusUpdate,
    PriceIndexUpdate,
    UnitCreate,
    UnitOut,
    UnitStatusUpdate,
    UnitUpdate,
)

router = APIRouter(prefix="/reference", tags=["reference-data"])

ModelT = TypeVar(
    "ModelT",
    ReferenceBook,
    ReferenceCommodity,
    ReferenceCurrency,
    ReferenceUnit,
    ReferenceLocation,
    ReferencePriceIndex,
)


def to_out(record: ModelT, schema_cls):
    payload = dict(
        code=record.code,
        name=record.name,
        description=record.description,
        is_active=record.is_active,
        effective_from=record.effective_from,
        effective_to=record.effective_to,
        created_at=record.created_at,
        created_by=record.created_by,
        updated_at=record.updated_at,
        updated_by=record.updated_by,
        version=record.version,
    )
    if isinstance(record, ReferenceCommodity):
        payload["commodity_class"] = record.commodity_class
    if isinstance(record, ReferenceCurrency):
        payload["symbol"] = record.symbol
    if isinstance(record, ReferenceUnit):
        payload["commodity_class"] = record.commodity_class
        payload["dimension"] = record.dimension
        payload["base_unit_code"] = record.base_unit_code
        payload["conversion_factor"] = float(record.conversion_factor) if record.conversion_factor is not None else None
        payload["precision"] = record.precision
    if isinstance(record, ReferenceLocation):
        payload["location_type"] = record.location_type
        payload["market"] = record.market
        payload["country_code"] = record.country_code
        payload["region"] = record.region
        payload["timezone"] = record.timezone
    if isinstance(record, ReferencePriceIndex):
        payload["commodity_code"] = record.commodity_code
        payload["currency_code"] = record.currency_code
        payload["unit_code"] = record.unit_code
        payload["provider"] = record.provider
        payload["market"] = record.market
        payload["location_code"] = record.location_code
        payload["calendar_code"] = record.calendar_code

    return schema_cls(**payload)


def ensure_book_not_in_active_use(db: Session, code: str) -> None:
    active_trade_count = db.execute(
        select(func.count()).select_from(Trade).where(
            Trade.book == code,
            Trade.status != "CANCELLED",
        )
    ).scalar_one()
    if active_trade_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Book cannot be deactivated while active trades reference it",
        )


def ensure_commodity_not_in_active_use(db: Session, code: str) -> None:
    active_trade_count = db.execute(
        select(func.count()).select_from(Trade).where(
            Trade.commodity == code,
            Trade.status != "CANCELLED",
        )
    ).scalar_one()
    if active_trade_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Commodity cannot be deactivated while active trades reference it",
        )


def ensure_active_commodity_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_commodity = db.execute(
        select(ReferenceCommodity).where(
            ReferenceCommodity.code == normalized_code,
            ReferenceCommodity.is_active.is_(True),
        )
    ).scalars().first()
    if reference_commodity is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Commodity '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_active_currency_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_currency = db.execute(
        select(ReferenceCurrency).where(
            ReferenceCurrency.code == normalized_code,
            ReferenceCurrency.is_active.is_(True),
        )
    ).scalars().first()
    if reference_currency is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Currency '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_active_unit_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_unit = db.execute(
        select(ReferenceUnit).where(
            ReferenceUnit.code == normalized_code,
            ReferenceUnit.is_active.is_(True),
        )
    ).scalars().first()
    if reference_unit is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unit '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_active_location_exists(db: Session, code: str) -> str:
    normalized_code = normalize_code(code)
    reference_location = db.execute(
        select(ReferenceLocation).where(
            ReferenceLocation.code == normalized_code,
            ReferenceLocation.is_active.is_(True),
        )
    ).scalars().first()
    if reference_location is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Location '{normalized_code}' is not active in reference data",
        )
    return normalized_code


def ensure_currency_not_in_active_use(db: Session, code: str) -> None:
    active_price_index_count = db.execute(
        select(func.count()).select_from(ReferencePriceIndex).where(
            ReferencePriceIndex.currency_code == code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalar_one()
    if active_price_index_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Currency cannot be deactivated while active price indices reference it",
        )


def ensure_unit_not_in_active_use(db: Session, code: str) -> None:
    active_price_index_count = db.execute(
        select(func.count()).select_from(ReferencePriceIndex).where(
            ReferencePriceIndex.unit_code == code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalar_one()
    if active_price_index_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unit cannot be deactivated while active price indices reference it",
        )


def ensure_location_not_in_active_use(db: Session, code: str) -> None:
    active_price_index_count = db.execute(
        select(func.count()).select_from(ReferencePriceIndex).where(
            ReferencePriceIndex.location_code == code,
            ReferencePriceIndex.is_active.is_(True),
        )
    ).scalar_one()
    if active_price_index_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Location cannot be deactivated while active price indices reference it",
        )


@router.get("/books", response_model=List[BookOut])
def list_books(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> List[BookOut]:
    rows = list_reference_records(db, ReferenceBook, q, is_active, limit, offset)
    return [to_out(row, BookOut) for row in rows]


@router.post("/books", response_model=BookOut, status_code=201)
def create_book(payload: BookCreate, db: Session = Depends(get_db)) -> BookOut:
    existing = db.execute(
        select(ReferenceBook).where(ReferenceBook.code == payload.code.strip().upper())
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Book already exists")

    record = create_reference_record(db, ReferenceBook, payload)
    return to_out(record, BookOut)


@router.get("/books/{code}", response_model=BookOut)
def get_book(code: str, db: Session = Depends(get_db)) -> BookOut:
    record = get_reference_record(db, ReferenceBook, code.strip().upper())
    return to_out(record, BookOut)


@router.put("/books/{code}", response_model=BookOut)
def update_book(code: str, payload: BookUpdate, db: Session = Depends(get_db)) -> BookOut:
    record = get_reference_record(db, ReferenceBook, code.strip().upper())
    update_reference_record(record, payload)
    db.commit()
    db.refresh(record)
    return to_out(record, BookOut)


@router.post("/books/{code}/deactivate", response_model=BookOut)
def deactivate_book(
    code: str,
    payload: BookStatusUpdate,
    db: Session = Depends(get_db),
) -> BookOut:
    record = get_reference_record(db, ReferenceBook, code.strip().upper())
    ensure_book_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, BookOut)


@router.post("/books/{code}/activate", response_model=BookOut)
def activate_book(
    code: str,
    payload: BookStatusUpdate,
    db: Session = Depends(get_db),
) -> BookOut:
    record = get_reference_record(db, ReferenceBook, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, BookOut)


@router.get("/commodities", response_model=List[CommodityOut])
def list_commodities(
    q: Optional[str] = None,
    commodity_class: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> List[CommodityOut]:
    rows = list_reference_records(db, ReferenceCommodity, q, is_active, limit, offset)
    if commodity_class:
        rows = [row for row in rows if row.commodity_class == normalize_code(commodity_class)]
    return [to_out(row, CommodityOut) for row in rows]


@router.post("/commodities", response_model=CommodityOut, status_code=201)
def create_commodity(payload: CommodityCreate, db: Session = Depends(get_db)) -> CommodityOut:
    existing = db.execute(
        select(ReferenceCommodity).where(ReferenceCommodity.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Commodity already exists")

    record = create_reference_record(
        db,
        ReferenceCommodity,
        payload,
        extra_values={"commodity_class": normalize_code(payload.commodity_class)},
    )
    return to_out(record, CommodityOut)


@router.get("/commodities/{code}", response_model=CommodityOut)
def get_commodity(code: str, db: Session = Depends(get_db)) -> CommodityOut:
    record = get_reference_record(db, ReferenceCommodity, code.strip().upper())
    return to_out(record, CommodityOut)


@router.put("/commodities/{code}", response_model=CommodityOut)
def update_commodity(
    code: str,
    payload: CommodityUpdate,
    db: Session = Depends(get_db),
) -> CommodityOut:
    record = get_reference_record(db, ReferenceCommodity, code.strip().upper())
    update_reference_record(record, payload, extra_updates=_update_commodity_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, CommodityOut)


@router.post("/commodities/{code}/deactivate", response_model=CommodityOut)
def deactivate_commodity(
    code: str,
    payload: CommodityStatusUpdate,
    db: Session = Depends(get_db),
) -> CommodityOut:
    record = get_reference_record(db, ReferenceCommodity, code.strip().upper())
    ensure_commodity_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CommodityOut)


@router.post("/commodities/{code}/activate", response_model=CommodityOut)
def activate_commodity(
    code: str,
    payload: CommodityStatusUpdate,
    db: Session = Depends(get_db),
) -> CommodityOut:
    record = get_reference_record(db, ReferenceCommodity, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CommodityOut)


def _update_currency_fields(record, payload, provided_fields: set[str]) -> None:
    if "symbol" in provided_fields:
        record.symbol = payload.symbol.strip() if payload.symbol is not None else None


@router.get("/currencies", response_model=List[CurrencyOut])
def list_currencies(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> List[CurrencyOut]:
    rows = list_reference_records(db, ReferenceCurrency, q, is_active, limit, offset)
    return [to_out(row, CurrencyOut) for row in rows]


@router.post("/currencies", response_model=CurrencyOut, status_code=201)
def create_currency(payload: CurrencyCreate, db: Session = Depends(get_db)) -> CurrencyOut:
    existing = db.execute(
        select(ReferenceCurrency).where(ReferenceCurrency.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Currency already exists")

    record = create_reference_record(
        db,
        ReferenceCurrency,
        payload,
        extra_values={"symbol": payload.symbol.strip() if payload.symbol is not None else None},
    )
    return to_out(record, CurrencyOut)


@router.get("/currencies/{code}", response_model=CurrencyOut)
def get_currency(code: str, db: Session = Depends(get_db)) -> CurrencyOut:
    record = get_reference_record(db, ReferenceCurrency, code.strip().upper())
    return to_out(record, CurrencyOut)


@router.put("/currencies/{code}", response_model=CurrencyOut)
def update_currency(code: str, payload: CurrencyUpdate, db: Session = Depends(get_db)) -> CurrencyOut:
    record = get_reference_record(db, ReferenceCurrency, code.strip().upper())
    update_reference_record(record, payload, extra_updates=_update_currency_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, CurrencyOut)


@router.post("/currencies/{code}/deactivate", response_model=CurrencyOut)
def deactivate_currency(
    code: str,
    payload: CurrencyStatusUpdate,
    db: Session = Depends(get_db),
) -> CurrencyOut:
    record = get_reference_record(db, ReferenceCurrency, code.strip().upper())
    ensure_currency_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CurrencyOut)


@router.post("/currencies/{code}/activate", response_model=CurrencyOut)
def activate_currency(
    code: str,
    payload: CurrencyStatusUpdate,
    db: Session = Depends(get_db),
) -> CurrencyOut:
    record = get_reference_record(db, ReferenceCurrency, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, CurrencyOut)


def _update_unit_fields(record, payload, provided_fields: set[str]) -> None:
    if "commodity_class" in provided_fields:
        record.commodity_class = normalize_code(payload.commodity_class) if payload.commodity_class else None
    if "dimension" in provided_fields and payload.dimension is not None:
        record.dimension = normalize_code(payload.dimension)
    if "base_unit_code" in provided_fields:
        record.base_unit_code = normalize_code(payload.base_unit_code) if payload.base_unit_code else None
    if "conversion_factor" in provided_fields:
        record.conversion_factor = payload.conversion_factor
    if "precision" in provided_fields and payload.precision is not None:
        record.precision = payload.precision


@router.get("/units", response_model=List[UnitOut])
def list_units(
    q: Optional[str] = None,
    commodity_class: Optional[str] = None,
    dimension: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> List[UnitOut]:
    extra_filters = []
    if commodity_class:
        extra_filters.append(ReferenceUnit.commodity_class == normalize_code(commodity_class))
    if dimension:
        extra_filters.append(ReferenceUnit.dimension == normalize_code(dimension))
    rows = list_reference_records(db, ReferenceUnit, q, is_active, limit, offset, extra_filters=extra_filters)
    return [to_out(row, UnitOut) for row in rows]


@router.post("/units", response_model=UnitOut, status_code=201)
def create_unit(payload: UnitCreate, db: Session = Depends(get_db)) -> UnitOut:
    existing = db.execute(
        select(ReferenceUnit).where(ReferenceUnit.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Unit already exists")

    record = create_reference_record(
        db,
        ReferenceUnit,
        payload,
        extra_values={
            "commodity_class": normalize_code(payload.commodity_class) if payload.commodity_class else None,
            "dimension": normalize_code(payload.dimension),
            "base_unit_code": normalize_code(payload.base_unit_code) if payload.base_unit_code else None,
            "conversion_factor": payload.conversion_factor,
            "precision": payload.precision,
        },
    )
    return to_out(record, UnitOut)


@router.get("/units/{code}", response_model=UnitOut)
def get_unit(code: str, db: Session = Depends(get_db)) -> UnitOut:
    record = get_reference_record(db, ReferenceUnit, code.strip().upper())
    return to_out(record, UnitOut)


@router.put("/units/{code}", response_model=UnitOut)
def update_unit(code: str, payload: UnitUpdate, db: Session = Depends(get_db)) -> UnitOut:
    record = get_reference_record(db, ReferenceUnit, code.strip().upper())
    update_reference_record(record, payload, extra_updates=_update_unit_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, UnitOut)


@router.post("/units/{code}/deactivate", response_model=UnitOut)
def deactivate_unit(
    code: str,
    payload: UnitStatusUpdate,
    db: Session = Depends(get_db),
) -> UnitOut:
    record = get_reference_record(db, ReferenceUnit, code.strip().upper())
    ensure_unit_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, UnitOut)


@router.post("/units/{code}/activate", response_model=UnitOut)
def activate_unit(
    code: str,
    payload: UnitStatusUpdate,
    db: Session = Depends(get_db),
) -> UnitOut:
    record = get_reference_record(db, ReferenceUnit, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, UnitOut)


def _update_location_fields(record, payload, provided_fields: set[str]) -> None:
    if "location_type" in provided_fields and payload.location_type is not None:
        record.location_type = normalize_code(payload.location_type)
    if "market" in provided_fields:
        record.market = payload.market.strip() if payload.market is not None else None
    if "country_code" in provided_fields:
        record.country_code = normalize_code(payload.country_code) if payload.country_code else None
    if "region" in provided_fields:
        record.region = payload.region.strip() if payload.region is not None else None
    if "timezone" in provided_fields:
        record.timezone = payload.timezone.strip() if payload.timezone is not None else None


@router.get("/locations", response_model=List[LocationOut])
def list_locations(
    q: Optional[str] = None,
    market: Optional[str] = None,
    location_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> List[LocationOut]:
    extra_filters = []
    if market:
        extra_filters.append(ReferenceLocation.market == market.strip())
    if location_type:
        extra_filters.append(ReferenceLocation.location_type == normalize_code(location_type))
    rows = list_reference_records(db, ReferenceLocation, q, is_active, limit, offset, extra_filters=extra_filters)
    return [to_out(row, LocationOut) for row in rows]


@router.post("/locations", response_model=LocationOut, status_code=201)
def create_location(payload: LocationCreate, db: Session = Depends(get_db)) -> LocationOut:
    existing = db.execute(
        select(ReferenceLocation).where(ReferenceLocation.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Location already exists")

    record = create_reference_record(
        db,
        ReferenceLocation,
        payload,
        extra_values={
            "location_type": normalize_code(payload.location_type),
            "market": payload.market.strip() if payload.market is not None else None,
            "country_code": normalize_code(payload.country_code) if payload.country_code else None,
            "region": payload.region.strip() if payload.region is not None else None,
            "timezone": payload.timezone.strip() if payload.timezone is not None else None,
        },
    )
    return to_out(record, LocationOut)


@router.get("/locations/{code}", response_model=LocationOut)
def get_location(code: str, db: Session = Depends(get_db)) -> LocationOut:
    record = get_reference_record(db, ReferenceLocation, code.strip().upper())
    return to_out(record, LocationOut)


@router.put("/locations/{code}", response_model=LocationOut)
def update_location(code: str, payload: LocationUpdate, db: Session = Depends(get_db)) -> LocationOut:
    record = get_reference_record(db, ReferenceLocation, code.strip().upper())
    update_reference_record(record, payload, extra_updates=_update_location_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, LocationOut)


@router.post("/locations/{code}/deactivate", response_model=LocationOut)
def deactivate_location(
    code: str,
    payload: LocationStatusUpdate,
    db: Session = Depends(get_db),
) -> LocationOut:
    record = get_reference_record(db, ReferenceLocation, code.strip().upper())
    ensure_location_not_in_active_use(db, record.code)
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, LocationOut)


@router.post("/locations/{code}/activate", response_model=LocationOut)
def activate_location(
    code: str,
    payload: LocationStatusUpdate,
    db: Session = Depends(get_db),
) -> LocationOut:
    record = get_reference_record(db, ReferenceLocation, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, LocationOut)


def _update_commodity_fields(record, payload, provided_fields: set[str]) -> None:
    if "commodity_class" in provided_fields and payload.commodity_class is not None:
        record.commodity_class = normalize_code(payload.commodity_class)


def _update_price_index_fields(record, payload, provided_fields: set[str]) -> None:
    if "commodity_code" in provided_fields and payload.commodity_code is not None:
        record.commodity_code = normalize_code(payload.commodity_code)
    if "currency_code" in provided_fields and payload.currency_code is not None:
        record.currency_code = normalize_code(payload.currency_code)
    if "unit_code" in provided_fields and payload.unit_code is not None:
        record.unit_code = normalize_code(payload.unit_code)
    if "provider" in provided_fields and payload.provider is not None:
        record.provider = payload.provider.strip()
    if "market" in provided_fields:
        record.market = payload.market.strip() if payload.market is not None else None
    if "location_code" in provided_fields:
        record.location_code = normalize_code(payload.location_code) if payload.location_code else None
    if "calendar_code" in provided_fields:
        record.calendar_code = normalize_code(payload.calendar_code) if payload.calendar_code else None


@router.get("/price-indices", response_model=List[PriceIndexOut])
def list_price_indices(
    q: Optional[str] = None,
    commodity_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> List[PriceIndexOut]:
    extra_filters = []
    if commodity_code:
        extra_filters.append(ReferencePriceIndex.commodity_code == normalize_code(commodity_code))

    rows = list_reference_records(
        db,
        ReferencePriceIndex,
        q,
        is_active,
        limit,
        offset,
        extra_filters=extra_filters,
    )
    return [to_out(row, PriceIndexOut) for row in rows]


@router.post("/price-indices", response_model=PriceIndexOut, status_code=201)
def create_price_index(payload: PriceIndexCreate, db: Session = Depends(get_db)) -> PriceIndexOut:
    existing = db.execute(
        select(ReferencePriceIndex).where(ReferencePriceIndex.code == normalize_code(payload.code))
    ).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Price index already exists")

    commodity_code = ensure_active_commodity_exists(db, payload.commodity_code)
    currency_code = ensure_active_currency_exists(db, payload.currency_code)
    unit_code = ensure_active_unit_exists(db, payload.unit_code)
    location_code = ensure_active_location_exists(db, payload.location_code) if payload.location_code else None
    record = create_reference_record(
        db,
        ReferencePriceIndex,
        payload,
        extra_values={
            "commodity_code": commodity_code,
            "currency_code": currency_code,
            "unit_code": unit_code,
            "provider": payload.provider.strip(),
            "market": payload.market.strip() if payload.market is not None else None,
            "location_code": location_code,
            "calendar_code": normalize_code(payload.calendar_code) if payload.calendar_code else None,
        },
    )
    return to_out(record, PriceIndexOut)


@router.get("/price-indices/{code}", response_model=PriceIndexOut)
def get_price_index(code: str, db: Session = Depends(get_db)) -> PriceIndexOut:
    record = get_reference_record(db, ReferencePriceIndex, code.strip().upper())
    return to_out(record, PriceIndexOut)


@router.put("/price-indices/{code}", response_model=PriceIndexOut)
def update_price_index(
    code: str,
    payload: PriceIndexUpdate,
    db: Session = Depends(get_db),
) -> PriceIndexOut:
    record = get_reference_record(db, ReferencePriceIndex, code.strip().upper())
    if "commodity_code" in payload.model_fields_set and payload.commodity_code is not None:
        ensure_active_commodity_exists(db, payload.commodity_code)
    if "currency_code" in payload.model_fields_set and payload.currency_code is not None:
        ensure_active_currency_exists(db, payload.currency_code)
    if "unit_code" in payload.model_fields_set and payload.unit_code is not None:
        ensure_active_unit_exists(db, payload.unit_code)
    if "location_code" in payload.model_fields_set and payload.location_code:
        ensure_active_location_exists(db, payload.location_code)
    update_reference_record(record, payload, extra_updates=_update_price_index_fields)
    db.commit()
    db.refresh(record)
    return to_out(record, PriceIndexOut)


@router.post("/price-indices/{code}/deactivate", response_model=PriceIndexOut)
def deactivate_price_index(
    code: str,
    payload: PriceIndexStatusUpdate,
    db: Session = Depends(get_db),
) -> PriceIndexOut:
    record = get_reference_record(db, ReferencePriceIndex, code.strip().upper())
    set_reference_active_state(record, False, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, PriceIndexOut)


@router.post("/price-indices/{code}/activate", response_model=PriceIndexOut)
def activate_price_index(
    code: str,
    payload: PriceIndexStatusUpdate,
    db: Session = Depends(get_db),
) -> PriceIndexOut:
    record = get_reference_record(db, ReferencePriceIndex, code.strip().upper())
    set_reference_active_state(record, True, payload.updated_by)
    db.commit()
    db.refresh(record)
    return to_out(record, PriceIndexOut)
