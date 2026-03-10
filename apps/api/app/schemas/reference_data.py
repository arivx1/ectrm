from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReferenceDataBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class ReferenceDataCreate(ReferenceDataBase):
    created_by: str = Field(..., min_length=1, max_length=128)


class ReferenceDataUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    updated_by: str = Field(..., min_length=1, max_length=128)


class ReferenceDataStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)


class ReferenceDataOut(ReferenceDataBase):
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class BookCreate(ReferenceDataCreate):
    pass


class BookUpdate(ReferenceDataUpdate):
    pass


class BookStatusUpdate(ReferenceDataStatusUpdate):
    pass


class BookOut(ReferenceDataOut):
    pass


class CommodityCreate(ReferenceDataCreate):
    commodity_class: str = Field(..., min_length=1, max_length=50)


class CommodityUpdate(ReferenceDataUpdate):
    commodity_class: Optional[str] = Field(None, min_length=1, max_length=50)


class CommodityStatusUpdate(ReferenceDataStatusUpdate):
    pass


class CommodityOut(ReferenceDataOut):
    commodity_class: str
