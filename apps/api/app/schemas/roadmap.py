from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from apps.api.app.schemas._validation import normalize_required_text


RoadmapView = Literal[
    "dashboard",
    "trades",
    "events",
    "positions",
    "reference",
    "admin",
    "settings",
]
RoadmapStatus = Literal["planned", "in_progress", "blocked", "shipped"]
RoadmapHorizonKey = Literal["now", "next", "later"]


class RoadmapLinkOut(BaseModel):
    label: str
    view: RoadmapView


class RoadmapItemOut(BaseModel):
    id: str
    title: str
    summary: str
    status: RoadmapStatus
    horizon: RoadmapHorizonKey
    owner: str
    target: str
    source_ids: List[str]
    links: List[RoadmapLinkOut]


class RoadmapPhaseOut(BaseModel):
    id: str
    title: str
    priority: str
    summary: str
    items: List[RoadmapItemOut]


class RoadmapMilestoneOut(BaseModel):
    id: str
    title: str
    summary: str
    owner: str
    target: str
    item_ids: List[str]
    exit_criteria: List[str]
    links: List[RoadmapLinkOut]


class RoadmapHorizonOut(BaseModel):
    key: RoadmapHorizonKey
    label: str
    detail: str


class RoadmapDocumentOut(BaseModel):
    source_path: str
    horizons: List[RoadmapHorizonOut]
    phases: List[RoadmapPhaseOut]
    milestones: List[RoadmapMilestoneOut]


class RoadmapDocumentUpdate(BaseModel):
    document: RoadmapDocumentOut
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class RoadmapDocumentRestore(BaseModel):
    updated_by: str = Field(..., min_length=1, max_length=128)

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        return normalize_required_text(value, field_name="updated_by")


class RoadmapRevisionOut(BaseModel):
    revision_id: int
    version: int
    created_at: datetime
    created_by: str
    change_summary: List[str]
    restored_from_revision_id: Optional[int]


class RoadmapAdminDocumentOut(BaseModel):
    document: RoadmapDocumentOut
    updated_at: Optional[datetime]
    updated_by: Optional[str]
    version: int
    is_default: bool
    recent_revisions: List[RoadmapRevisionOut] = Field(default_factory=list)
