from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from apps.api.app.schemas._validation import normalize_optional_text, normalize_required_text

UserEventKind = Literal["HOLIDAY", "REMINDER", "EVENT", "OTHER"]
UserEventRecurrenceFrequency = Literal["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]
UserEventWeekday = Literal["MO", "TU", "WE", "TH", "FR", "SA", "SU"]


def _normalize_datetime(value: datetime | None, *, field_name: str) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field_name} must include a timezone offset")
    return value


class UserEventRecurrence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    frequency: UserEventRecurrenceFrequency
    interval: int = Field(default=1, ge=1, le=366)
    by_weekday: list[UserEventWeekday] | None = None
    until_at: datetime | None = None
    count: int | None = Field(default=None, ge=1, le=5000)

    @field_validator("frequency", mode="before")
    @classmethod
    def normalize_frequency(cls, value: str) -> str:
        return normalize_required_text(value, field_name="frequency", uppercase=True)

    @field_validator("by_weekday", mode="before")
    @classmethod
    def normalize_by_weekday(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            normalized_item = normalize_required_text(item, field_name="by_weekday", uppercase=True)
            if normalized_item not in seen:
                normalized.append(normalized_item)
                seen.add(normalized_item)
        return normalized

    @field_validator("until_at")
    @classmethod
    def validate_until_at(cls, value: datetime | None) -> datetime | None:
        return _normalize_datetime(value, field_name="until_at")

    @model_validator(mode="after")
    def validate_weekday_usage(self) -> "UserEventRecurrence":
        if self.by_weekday and self.frequency != "WEEKLY":
            raise ValueError("by_weekday is only supported for WEEKLY recurrence")
        return self


class UserEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=200)
    kind: UserEventKind
    starts_at: datetime
    ends_at: datetime | None = None
    all_day: bool = False
    timezone: str | None = Field(default=None, min_length=1, max_length=60)
    place: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    recurrence: UserEventRecurrence | None = None
    created_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return normalize_required_text(value, field_name="title")

    @field_validator("kind", mode="before")
    @classmethod
    def normalize_kind(cls, value: str) -> str:
        return normalize_required_text(value, field_name="kind", uppercase=True)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def validate_datetimes(cls, value: datetime | None, info) -> datetime | None:
        return _normalize_datetime(value, field_name=info.field_name)

    @field_validator("timezone")
    @classmethod
    def normalize_timezone(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="timezone")

    @field_validator("place")
    @classmethod
    def normalize_place(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="place")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="description")

    @field_validator("created_by")
    @classmethod
    def normalize_created_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="created_by")


class UserEventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    kind: UserEventKind | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    all_day: bool | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=60)
    place: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    recurrence: UserEventRecurrence | None = None
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="title")

    @field_validator("kind", mode="before")
    @classmethod
    def normalize_kind(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="kind", uppercase=True)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def validate_datetimes(cls, value: datetime | None, info) -> datetime | None:
        return _normalize_datetime(value, field_name=info.field_name)

    @field_validator("timezone")
    @classmethod
    def normalize_timezone(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="timezone")

    @field_validator("place")
    @classmethod
    def normalize_place(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="place")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return normalize_optional_text(value, field_name="description")

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class UserEventStatusUpdate(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class UserEventOut(BaseModel):
    id: int
    title: str
    kind: UserEventKind
    starts_at: datetime
    ends_at: datetime | None
    all_day: bool
    timezone: str | None
    place: str | None
    description: str | None
    recurrence: UserEventRecurrence | None
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int


class UserEventOccurrenceOut(BaseModel):
    user_event_id: int
    occurrence_index: int
    title: str
    kind: UserEventKind
    starts_at: datetime
    ends_at: datetime | None
    all_day: bool
    timezone: str | None
    place: str | None
    description: str | None
    is_active: bool
    is_recurring: bool
