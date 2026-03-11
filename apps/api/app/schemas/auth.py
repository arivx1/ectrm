from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class BootstrapAdminRequest(BaseModel):
    bootstrap_token: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=64)
    email: str = Field(..., min_length=3, max_length=255)
    display_name: str = Field(..., min_length=1, max_length=160)
    password: str = Field(..., min_length=8, max_length=128)


class SessionLoginRequest(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class AuthenticatedUserOut(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str


class SessionOut(BaseModel):
    session_id: str
    access_token: str
    expires_at: datetime
    user: AuthenticatedUserOut


class CurrentSessionOut(BaseModel):
    session_id: str
    expires_at: datetime
    user: AuthenticatedUserOut
