from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from apps.api.app.schemas._validation import normalize_required_text


LayoutWorkspaceId = Literal[
    "dashboard",
    "trades",
    "events",
    "risk",
    "positions",
    "shipments",
    "scheduling",
    "operations",
    "settlement",
    "reports",
]
LayoutTileSpan = Literal["full", "wide", "half", "side"]


def _normalize_tile_ids(values: list[str], *, field_name: str) -> list[str]:
    normalized = [normalize_required_text(value, field_name=f"{field_name} item", lowercase=True) for value in values]
    if len(set(normalized)) != len(normalized):
        raise ValueError(f"{field_name} must not contain duplicate tile ids")
    return normalized


def _normalize_span_overrides(value: Any) -> dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("spans must be an object keyed by tile id")

    normalized: dict[str, str] = {}
    for raw_tile_id, raw_span in value.items():
        if not isinstance(raw_tile_id, str):
            raise ValueError("spans must use string tile ids")
        if not isinstance(raw_span, str):
            raise ValueError("span overrides must use string span values")

        tile_id = normalize_required_text(raw_tile_id, field_name="spans key", lowercase=True)
        if tile_id in normalized:
            raise ValueError("spans must not contain duplicate tile ids")

        normalized[tile_id] = normalize_required_text(
            raw_span,
            field_name=f"spans[{tile_id}]",
            lowercase=True,
        )

    return normalized


class LayoutDefinitionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: list[str] = Field(..., min_length=1)
    hidden: list[str] = Field(default_factory=list)
    spans: dict[str, LayoutTileSpan] = Field(default_factory=dict)

    @field_validator("order")
    @classmethod
    def normalize_order(cls, value: list[str]) -> list[str]:
        return _normalize_tile_ids(value, field_name="order")

    @field_validator("hidden")
    @classmethod
    def normalize_hidden(cls, value: list[str]) -> list[str]:
        return _normalize_tile_ids(value, field_name="hidden")

    @field_validator("spans", mode="before")
    @classmethod
    def normalize_spans(cls, value: Any) -> dict[str, str]:
        return _normalize_span_overrides(value)


class LayoutDefinitionOut(LayoutDefinitionUpdate):
    workspace_id: LayoutWorkspaceId
    updated_at: datetime
    updated_by: str
    version: int
