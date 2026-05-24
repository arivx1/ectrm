from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas.assistant import AssistantPersona
from apps.api.app.schemas._validation import (
    normalize_optional_blankable_text,
    normalize_optional_text,
    normalize_required_text,
    validate_password_not_blank,
)

ASSISTANT_CONTEXT_BLURB_MAX_LENGTH = 4000


class UserAccountCreate(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    email: str = Field(..., min_length=3, max_length=255)
    display_name: str = Field(..., min_length=1, max_length=160)
    role: str = Field(..., min_length=1, max_length=50)
    default_assistant_persona: Optional[AssistantPersona] = None
    assistant_context_blurb: Optional[str] = Field(None, max_length=ASSISTANT_CONTEXT_BLURB_MAX_LENGTH)
    password: str = Field(..., min_length=8, max_length=128)
    created_by: str = Field(..., min_length=1, max_length=128)
    last_login_at: Optional[datetime] = None

    @field_validator("user_id")
    @classmethod
    def normalize_user_id(cls, value: str) -> str:
        return normalize_required_text(value, field_name="user_id")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return normalize_required_text(value, field_name="email", lowercase=True)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="display_name")

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: str) -> str:
        return normalize_required_text(value, field_name="role", uppercase=True)

    @field_validator("default_assistant_persona", mode="before")
    @classmethod
    def normalize_default_assistant_persona(cls, value: object) -> object:
        if value is None or not isinstance(value, str):
            return value
        normalized = normalize_optional_text(value, field_name="default_assistant_persona", lowercase=True)
        return normalized.replace("-", "_") if normalized is not None else None

    @field_validator("assistant_context_blurb")
    @classmethod
    def normalize_assistant_context_blurb(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_blankable_text(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_not_blank(value)

    @field_validator("created_by")
    @classmethod
    def normalize_created_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="created_by")


class UserAccountUpdate(BaseModel):
    email: Optional[str] = Field(None, min_length=3, max_length=255)
    display_name: Optional[str] = Field(None, min_length=1, max_length=160)
    role: Optional[str] = Field(None, min_length=1, max_length=50)
    default_assistant_persona: Optional[AssistantPersona] = None
    assistant_context_blurb: Optional[str] = Field(None, max_length=ASSISTANT_CONTEXT_BLURB_MAX_LENGTH)
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    last_login_at: Optional[datetime] = None
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="email", lowercase=True)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="display_name")

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, field_name="role", uppercase=True)

    @field_validator("default_assistant_persona", mode="before")
    @classmethod
    def normalize_default_assistant_persona(cls, value: object) -> object:
        if value is None or not isinstance(value, str):
            return value
        normalized = normalize_optional_text(value, field_name="default_assistant_persona", lowercase=True)
        return normalized.replace("-", "_") if normalized is not None else None

    @field_validator("assistant_context_blurb")
    @classmethod
    def normalize_assistant_context_blurb(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_blankable_text(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return validate_password_not_blank(value)

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class UserAccountStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class UserAccountOut(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str
    default_assistant_persona: AssistantPersona
    assistant_context_blurb: Optional[str]
    is_active: bool
    password_set: bool
    last_login_at: Optional[datetime]
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
