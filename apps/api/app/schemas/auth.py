from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas._validation import (
    normalize_optional_blankable_text,
    normalize_optional_text,
    normalize_required_text,
    validate_password_not_blank,
)
from apps.api.app.schemas.assistant import AssistantPersona

ASSISTANT_CONTEXT_BLURB_MAX_LENGTH = 4000


class BootstrapAdminRequest(BaseModel):
    bootstrap_token: str = Field(..., min_length=1, max_length=255)
    user_id: str = Field(..., min_length=1, max_length=64)
    email: str = Field(..., min_length=3, max_length=255)
    display_name: str = Field(..., min_length=1, max_length=160)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("bootstrap_token")
    @classmethod
    def normalize_bootstrap_token(cls, value: str) -> str:
        return normalize_required_text(value, field_name="bootstrap_token")

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

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_not_blank(value)


class SessionLoginRequest(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        return normalize_required_text(value, field_name="identifier")

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_not_blank(value)


class GoogleSessionRequest(BaseModel):
    id_token: str = Field(..., min_length=1, max_length=4096)

    @field_validator("id_token")
    @classmethod
    def normalize_id_token(cls, value: str) -> str:
        return normalize_required_text(value, field_name="id_token")


class AuthenticatedUserOut(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str
    default_assistant_persona: AssistantPersona
    assistant_context_blurb: str | None = None


class AuthenticatedUserProfileUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=160)
    default_assistant_persona: AssistantPersona | None = None
    assistant_context_blurb: str | None = Field(None, max_length=ASSISTANT_CONTEXT_BLURB_MAX_LENGTH)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="display_name")

    @field_validator("default_assistant_persona", mode="before")
    @classmethod
    def normalize_default_assistant_persona(cls, value: object) -> object:
        if value is None or not isinstance(value, str):
            return value
        normalized = normalize_optional_blankable_text(value, lowercase=True)
        return normalized.replace("-", "_") if normalized is not None else None

    @field_validator("assistant_context_blurb")
    @classmethod
    def normalize_assistant_context_blurb(cls, value: str | None) -> str | None:
        return normalize_optional_blankable_text(value)


class SessionOut(BaseModel):
    session_id: str
    access_token: str
    expires_at: datetime
    show_start_here: bool
    user: AuthenticatedUserOut


class CurrentSessionOut(BaseModel):
    session_id: str
    expires_at: datetime
    user: AuthenticatedUserOut
