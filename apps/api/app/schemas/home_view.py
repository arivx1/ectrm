from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from apps.api.app.domains.assistant.personas import normalize_assistant_persona_key
from apps.api.app.domains.home_views.services.registry import (
    HOME_SYSTEM_TEMPLATE_KEY,
    HOME_SYSTEM_TEMPLATE_VERSION,
    HomeViewCardId,
    HomeViewCardKind,
)
from apps.api.app.schemas._validation import normalize_required_text
from apps.api.app.schemas.assistant import AssistantPersona

HomeViewDefinitionScope = Literal["PERSONAL"]
HomeViewDefinitionStatus = Literal["ACTIVE", "RETIRED"]


class HomeViewCardPlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: int = Field(..., ge=0)
    column_span: Literal[1, 2] = 1
    row_span: Literal[1, 2] = 1


class HomeViewCardDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    card_id: HomeViewCardId
    kind: HomeViewCardKind | None = None
    label: str | None = None
    visible: bool = True
    placement: HomeViewCardPlacement | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    filters: dict[str, Any] = Field(default_factory=dict)
    data_bindings: list[str] = Field(default_factory=list)


class HomeViewDefinitionBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    scope: HomeViewDefinitionScope = "PERSONAL"
    base_template_key: str = HOME_SYSTEM_TEMPLATE_KEY
    base_template_version: int = HOME_SYSTEM_TEMPLATE_VERSION
    persona_hint: AssistantPersona | None = None
    cards: list[HomeViewCardDefinition] = Field(..., min_length=1)
    global_filters: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_required_text(value, field_name="name")

    @field_validator("base_template_key")
    @classmethod
    def normalize_base_template_key(cls, value: str) -> str:
        return normalize_required_text(value, field_name="base_template_key", lowercase=True)

    @field_validator("persona_hint", mode="before")
    @classmethod
    def normalize_persona_hint(cls, value: Any) -> AssistantPersona | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("persona_hint must be a supported assistant persona")
        normalized = normalize_assistant_persona_key(value)
        if normalized is None:
            raise ValueError("persona_hint must be a supported assistant persona")
        return normalized


class HomeViewDefinitionCreate(HomeViewDefinitionBase):
    pass


class HomeViewDefinitionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    persona_hint: AssistantPersona | None = None
    cards: list[HomeViewCardDefinition] | None = Field(default=None, min_length=1)
    global_filters: dict[str, Any] | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_required_text(value, field_name="name")

    @field_validator("persona_hint", mode="before")
    @classmethod
    def normalize_persona_hint(cls, value: Any) -> AssistantPersona | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("persona_hint must be a supported assistant persona")
        normalized = normalize_assistant_persona_key(value)
        if normalized is None:
            raise ValueError("persona_hint must be a supported assistant persona")
        return normalized


class HomeViewDefinitionOut(BaseModel):
    definition_id: int
    definition_key: str
    name: str
    scope: HomeViewDefinitionScope
    base_template_key: str
    base_template_version: int
    persona_hint: AssistantPersona | None
    cards: list[HomeViewCardDefinition]
    global_filters: dict[str, Any]
    status: HomeViewDefinitionStatus
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    version: int
    can_edit: bool


class HomeViewSystemTemplateOut(BaseModel):
    template_key: Literal["system_home"]
    template_version: Literal[1]
    label: str
    immutable: Literal[True]
    cards: list[HomeViewCardDefinition]
