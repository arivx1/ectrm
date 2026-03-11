from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserAccountCreate(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    email: str = Field(..., min_length=3, max_length=255)
    display_name: str = Field(..., min_length=1, max_length=160)
    role: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)
    created_by: str = Field(..., min_length=1, max_length=128)
    last_login_at: Optional[datetime] = None


class UserAccountUpdate(BaseModel):
    email: Optional[str] = Field(None, min_length=3, max_length=255)
    display_name: Optional[str] = Field(None, min_length=1, max_length=160)
    role: Optional[str] = Field(None, min_length=1, max_length=50)
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    last_login_at: Optional[datetime] = None
    updated_by: str = Field(..., min_length=1, max_length=128)


class UserAccountStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)


class UserAccountOut(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str
    is_active: bool
    password_set: bool
    last_login_at: Optional[datetime]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
